/**
 * Design History Service
 * Stores and retrieves design context to ensure consistency across 2D/3D generation
 *
 * Stores:
 * - Location data (Google Maps coordinates, climate)
 * - Building DNA (materials, style, dimensions)
 * - Generation prompts
 * - Output references (floor plan URLs, seeds)
 */

import storageManager from '../utils/storageManager.js';
import { evaluateDNACompleteness } from '../validators/dnaCompletenessValidator.js';
import { saveSiteSnapshot, deleteSiteSnapshot } from '../utils/siteSnapshotStore.js';
import logger from '../utils/logger.js';
import {
  compressMasterDNA as compressMasterDNAHelper,
  sanitizePanelLayout,
  sanitizePanelMap,
  sanitizeSheetMetadata as sanitizeSheetMetadataHelper,
  stripDataUrl as stripDataUrlHelper,
  stripDataUrlsDeep
} from '../utils/designHistorySanitizer.js';


function cloneData(value) {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    logger.warn('⚠️ Failed to deep-clone value for storage', error);
    return value;
  }
}

function resolvePanelMap(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const cleaned = sanitizePanelMap(source);
  if (!cleaned || Object.keys(cleaned).length === 0) {
    return null;
  }
  return cleaned;
}

function sanitizeGeometryRenders(renders) {
  if (!renders || !Array.isArray(renders)) {
    return null;
  }
  return renders.map(render => {
    if (!render || typeof render !== 'object') return null;
    const sanitized = { ...render };
    if (sanitized.url) {
      sanitized.url = stripDataUrlHelper(sanitized.url);
    }
    return sanitized;
  }).filter(Boolean);
}

function resolvePanelLayout(panels) {
  return sanitizePanelLayout(panels);
}

const MAX_HISTORY_BYTES = 4.5 * 1024 * 1024;

function estimatePayloadBytes(value) {
  try {
    const json = JSON.stringify(value);

    if (typeof Blob !== 'undefined') {
      return new Blob([json]).size;
    }

    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.byteLength(json, 'utf8');
    }

    return json.length;
  } catch (error) {
    logger.warn('⚠️ Failed to estimate storage payload size', error);
    return Number.POSITIVE_INFINITY;
  }
}

function getEntryTimestamp(entry) {
  const raw = entry?.updatedAt || entry?.createdAt || entry?.timestamp || null;
  const parsed = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimHistoryForStorage(history, maxBytes = MAX_HISTORY_BYTES) {
  if (!Array.isArray(history)) {
    return history;
  }

  let candidate = history;
  const originalBytes = estimatePayloadBytes(candidate);
  if (originalBytes <= maxBytes) {
    return candidate;
  }

  const applied = [];

  const apply = (label, transform) => {
    const currentBytes = estimatePayloadBytes(candidate);
    if (currentBytes <= maxBytes) {
      return;
    }

    candidate = transform(candidate);
    applied.push(label);
  };

  apply('drop masterDNAFull', (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (!('masterDNAFull' in entry)) return entry;
      const { masterDNAFull, ...rest } = entry;
      return rest;
    })
  );

  apply('drop projectContext', (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (!('projectContext' in entry)) return entry;
      return { ...entry, projectContext: {} };
    })
  );

  apply('drop locationData', (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (!('locationData' in entry)) return entry;
      return { ...entry, locationData: {} };
    })
  );

  apply('drop blendedStyle', (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (!('blendedStyle' in entry)) return entry;
      return { ...entry, blendedStyle: null };
    })
  );

  apply('cap versions to 1', (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (!Array.isArray(entry.versions) || entry.versions.length <= 1) return entry;
      return { ...entry, versions: entry.versions.slice(0, 1) };
    })
  );

  apply('remove panel maps', (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;

      const next = { ...entry };

      if ('panelMap' in next) next.panelMap = null;
      if ('panels' in next) next.panels = null;
      if ('panelLayout' in next) next.panelLayout = null;

      if (next.a1Sheet && typeof next.a1Sheet === 'object') {
        const nextA1 = { ...next.a1Sheet };
        if ('panelMap' in nextA1) nextA1.panelMap = null;
        if ('panels' in nextA1) nextA1.panels = null;
        if ('layoutPanels' in nextA1) nextA1.layoutPanels = null;

        if (nextA1.metadata && typeof nextA1.metadata === 'object') {
          const nextMeta = { ...nextA1.metadata };
          if ('panelMap' in nextMeta) delete nextMeta.panelMap;
          if ('panels' in nextMeta) delete nextMeta.panels;
          if ('panelLayout' in nextMeta) delete nextMeta.panelLayout;
          if ('panelsArray' in nextMeta) delete nextMeta.panelsArray;
          nextA1.metadata = nextMeta;
        }

        next.a1Sheet = nextA1;
      }

      return next;
    })
  );

  if (estimatePayloadBytes(candidate) > maxBytes) {
    // Last resort: keep only the most recent design entry (non-design entries are preserved).
    const designEntries = candidate.filter(
      (entry) => entry && typeof entry === 'object' && (entry.designId || entry.id)
    );

    if (designEntries.length > 1) {
      const newest = [...designEntries].sort((a, b) => getEntryTimestamp(b) - getEntryTimestamp(a))[0];
      const removed = designEntries.filter((entry) => entry !== newest);

      removed.forEach((entry) => {
        if (entry?.siteSnapshot?.key) {
          deleteSiteSnapshot(entry.siteSnapshot.key);
        }
      });

      candidate = candidate.filter((entry) => !(entry && typeof entry === 'object' && (entry.designId || entry.id)));
      candidate.push(newest);
      applied.push('keep only most recent design');
    }
  }

  const finalBytes = estimatePayloadBytes(candidate);
  logger.warn('⚠️ Trimmed design history to fit storage budget', {
    originalKB: (originalBytes / 1024).toFixed(2),
    finalKB: (finalBytes / 1024).toFixed(2),
    maxKB: (maxBytes / 1024).toFixed(2),
    applied
  });

  return candidate;
}

class DesignHistoryService {
  constructor() {
    this.storageKey = 'design_history';
    this.versionsKey = 'design_versions';
  }

  /**
   * Save design context after generating ground floor
   *
   * @param {Object} context - Design context to save
   * @param {string} context.projectId - Unique project identifier
   * @param {Object} context.location - Google Maps + OpenWeather data
   * @param {Object} context.buildingDNA - Building DNA (materials, style, etc.)
   * @param {string} context.prompt - Original generation prompt
   * @param {Object} context.outputs - Generated outputs (URLs, seeds)
   * @param {string} context.floorPlanUrl - Ground floor plan image URL
   * @param {number} context.seed - Generation seed for consistency
   */
  async saveDesignContext(context) {
    try {
      const timestamp = new Date().toISOString();
      const projectId = context.projectId || this.generateProjectId();

      const historyEntry = {
        projectId,
        timestamp,
        location: context.location || {},
        buildingDNA: context.buildingDNA || {},
        prompt: context.prompt || '',
        outputs: context.outputs || {},
        floorPlanUrl: context.floorPlanUrl || null,
        seed: context.seed || null,
        metadata: {
          buildingProgram: context.buildingProgram,
          floorArea: context.floorArea,
          floors: context.floors,
          style: context.style
        }
      };

      stripDataUrlsDeep(historyEntry);

      // Get existing history
      const history = await this.getAllHistory();

      // Add or update project
      const existingIndex = history.findIndex(entry => entry.projectId === projectId);
      if (existingIndex >= 0) {
        history[existingIndex] = historyEntry;
        logger.info(`📝 Updated design history for project: ${projectId}`);
      } else {
        history.push(historyEntry);
        logger.success(` Saved design history for project: ${projectId}`);      
      }

      stripDataUrlsDeep(history);

      // Save to localStorage with StorageManager (automatic quota handling)    
      await storageManager.setItem(this.storageKey, trimHistoryForStorage(history));

      return projectId;

    } catch (error) {
      logger.error('❌ Failed to save design history:', error);
      throw error;
    }
  }

  /**
   * Retrieve design context for a project
   *
   * @param {string} projectId - Project identifier
   * @returns {Object|null} Design context or null if not found
   */
  async getDesignContext(projectId) {
    try {
      const history = await this.getAllHistory();
      const context = history.find(entry => entry.projectId === projectId);

      if (context) {
        logger.info(`📖 Retrieved design history for project: ${projectId}`);
        return context;
      } else {
        logger.info(`⚠️  No design history found for project: ${projectId}`);
        return null;
      }

    } catch (error) {
      logger.error('❌ Failed to retrieve design history:', error);
      return null;
    }
  }

  /**
   * Get the most recent design context
   * Useful for continuing work on the latest project
   *
   * @returns {Object|null} Most recent design context
   */
  async getLatestDesignContext() {
    try {
      const history = await this.getAllHistory();

      if (history.length === 0) {
        return null;
      }

      // Sort by timestamp (newest first)
      const sorted = history.sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      );

      logger.info(`📖 Retrieved latest design history: ${sorted[0].projectId}`);
      return sorted[0];

    } catch (error) {
      logger.error('❌ Failed to retrieve latest design history:', error);
      return null;
    }
  }

  /**
   * Get all design history entries
   *
   * @returns {Promise<Array>} Array of design history entries
   */
  async getAllHistory() {
    try {
      const stored = await storageManager.getItem(this.storageKey, []);

      // Already an array - return as-is
      if (Array.isArray(stored)) {
        return stored;
      }

      // Migration: repair corrupted object-with-numeric-keys format
      // This happens when arrays were spread with timestamp: { ...array, _timestamp }
      if (stored && typeof stored === 'object') {
        logger.warn('⚠️ Detected corrupted design history (object instead of array), migrating...');

        // Extract numeric keys and convert to array
        const keys = Object.keys(stored).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));

        if (keys.length > 0) {
          const repaired = keys.map(k => stored[k]);

          stripDataUrlsDeep(repaired);

          // Re-save with correct format
          await storageManager.setItem(this.storageKey, trimHistoryForStorage(repaired));
          logger.success(` Migrated ${repaired.length} design history entries`);

          return repaired;
        }
      }

      // Fallback: return empty array
      return [];
    } catch (error) {
      logger.error('❌ Failed to parse design history:', error);
      return [];
    }
  }

  /**
   * Generate continuation prompt based on previous context
   * Ensures consistency in style, materials, and layout
   *
   * @param {string} projectId - Project identifier
   * @param {string} newPrompt - Additional instructions for the new generation
   * @returns {string} Enhanced prompt with previous context
   */
  async generateContinuationPrompt(projectId, newPrompt) {
    const context = await this.getDesignContext(projectId);

    if (!context) {
      logger.warn('⚠️  No previous context found, using new prompt as-is');
      return newPrompt;
    }

    const continuationPrompt = `
Continue architectural design maintaining consistency with ground floor design.

PREVIOUS DESIGN CONTEXT:
- Location: ${context.location.address || 'Not specified'}
- Climate: ${context.location.climate?.type || 'Not specified'}
- Building Type: ${context.metadata.buildingProgram || 'Not specified'}
- Total Floors: ${context.metadata.floors || 'Not specified'}
- Floor Area: ${context.metadata.floorArea || 'Not specified'} m²
- Architectural Style: ${context.metadata.style || 'Not specified'}

DESIGN DNA TO MAINTAIN:
- Materials: ${context.buildingDNA.materials?.exterior?.primary || 'Not specified'}
- Roof Style: ${context.buildingDNA.roof?.material || 'Not specified'}
- Windows: ${context.buildingDNA.windows?.style || 'Not specified'}
- Color Palette: ${context.buildingDNA.materials?.colors?.primary || 'Not specified'}

ORIGINAL DESIGN PHILOSOPHY:
${context.prompt}

NEW INSTRUCTIONS:
${newPrompt}

CONSISTENCY REQUIREMENTS:
- Use the same architectural style and proportions
- Maintain the same material palette and textures
- Keep the same design language and details
- Ensure all views appear to be from the same building
`;

    logger.info('📝 Generated continuation prompt with historical context');
    return continuationPrompt;
  }

  /**
   * Clear all design history (use with caution)
   */
  clearAllHistory() {
    storageManager.removeItem(this.storageKey);
    logger.info('🗑️  Cleared all design history');
  }

  /**
   * Delete a specific project's history
   *
   * @param {string} projectId - Project identifier to delete
   */
  async deleteProject(projectId) {
    const history = await this.getAllHistory();
    const design = history.find(entry => entry.projectId === projectId);
    if (design?.siteSnapshot?.key) {
      await deleteSiteSnapshot(design.siteSnapshot.key);
    }
    const filtered = history.filter(entry => entry.projectId !== projectId);
    await storageManager.setItem(this.storageKey, filtered);
    logger.info(`🗑️  Deleted design history for project: ${projectId}`);
  }

  /**
   * Strip large data URLs from object to reduce storage size
   * Data URLs (base64 images) can be 10MB+ and exceed localStorage limits
   * @param {string} url - URL to check
   * @returns {string|null} - Stripped URL or metadata note
   */
  stripDataUrl(url) {
    return stripDataUrlHelper(url);
  }

  /**
   * Compress masterDNA to reduce storage size
   * Removes verbose descriptions and keeps only essential data
   * @param {Object} dna - Master DNA object
   * @returns {Object} Compressed DNA
   */
  compressMasterDNA(dna) {
    return compressMasterDNAHelper(dna);
  }

  /**
   * Create a new design entry (base design)
   * @param {Object} params - Design parameters
   * @param {string} params.designId - Unique design ID
   * @param {Object} params.masterDNA - Master DNA
   * @param {string} params.mainPrompt - Base prompt
   * @param {number} params.seed - Generation seed
   * @param {Object} params.seedsByView - Seeds by view type
   * @param {string} params.resultUrl - A1 sheet URL
   * @param {Object} params.projectContext - Project context
   * @returns {Promise<string>} Design ID
   */
  async createDesign(params) {
    try {
      const {
        designId,
        masterDNA,
        geometryDNA = null,
        geometryRenders = null,
        mainPrompt,
        seed,
        seedsByView = {},
        resultUrl,
        a1SheetUrl,
        projectContext = {},
        styleBlendPercent = 70,
        width = 1792,
        height = 1269,
        model = 'black-forest-labs/FLUX.1-dev',
        a1LayoutKey = 'uk-riba-standard',
        siteSnapshot = null, // 🆕 Site map snapshot for pixel-exact parity
        locationData = {},
        blendedStyle = null,
        a1SheetMetadata = null,
        a1SheetPanels = null,
        panelMap = null,
        a1Sheet = null
      } = params;

      const sheetUrl = resultUrl || a1SheetUrl || a1Sheet?.composedSheetUrl || a1Sheet?.url || null;
      const strippedSheetUrl = this.stripDataUrl(sheetUrl);

      const resolvedDesignId = designId || this.generateDesignId();
      let siteSnapshotKey = null;

      if (siteSnapshot?.dataUrl) {
        siteSnapshotKey = await saveSiteSnapshot(resolvedDesignId, siteSnapshot.dataUrl);
      }

      logger.info('💾 Preparing design for storage...');
      if (sheetUrl !== strippedSheetUrl) {
        logger.info(`   Stripped A1 sheet URL: ${(sheetUrl?.length / 1024).toFixed(2)}KB → metadata only`);
      }
      if (siteSnapshot?.dataUrl && !siteSnapshotKey) {
        logger.warn('⚠️ Site snapshot could not be persisted; overlay consistency may drift.');
      }

      const canonicalDNA = cloneData(masterDNA) || {};
      const compressedDNA = this.compressMasterDNA(canonicalDNA);
      const dnaCompleteness = evaluateDNACompleteness(canonicalDNA || {});
      if (!dnaCompleteness.isComplete) {
        logger.warn('⚠️ Stored design with incomplete DNA', {
          designId: params.designId || 'pending',
          missing: dnaCompleteness.missing
        });
      }

      const resolvedSheetMetadata = sanitizeSheetMetadataHelper(
        a1SheetMetadata ||
        a1Sheet?.metadata ||
        {}
      );
      const resolvedPanelLayout =
        resolvePanelLayout(
          a1SheetPanels ||
          a1Sheet?.panelLayout ||
          (Array.isArray(a1Sheet?.panels) ? a1Sheet.panels : null) ||
          resolvedSheetMetadata.panels
        );

      if (resolvedPanelLayout) {
        resolvedSheetMetadata.panels = resolvedPanelLayout;
      }

      const resolvedPanelMap =
        resolvePanelMap(
          panelMap ||
          params.panels ||
          a1Sheet?.panelMap ||
          a1Sheet?.panels ||
          (!Array.isArray(a1Sheet?.panels) && a1Sheet?.panels) ||
          resolvedSheetMetadata.panelMap
        );

      if (resolvedPanelMap) {
        resolvedSheetMetadata.panelMap = resolvedPanelMap;
      }

      const sanitizedGeometryRenders = sanitizeGeometryRenders(geometryRenders || a1Sheet?.geometryRenders);

      const design = {
        designId: resolvedDesignId,
        masterDNA: compressedDNA, // ⚠️ Compressed to reduce storage
        masterDNAFull: canonicalDNA,
        geometryDNA: geometryDNA || canonicalDNA?.geometry || canonicalDNA?.geometryDNA || null,
        geometryRenders: sanitizedGeometryRenders || null,
        mainPrompt: mainPrompt || '',
        basePrompt: mainPrompt || '', // Alias for compatibility
        seed: seed || Date.now(),
        seedsByView: seedsByView || {},
        composedSheetUrl: strippedSheetUrl,
        resultUrl: strippedSheetUrl, // ⚠️ Data URLs stripped
        a1SheetUrl: strippedSheetUrl, // ⚠️ Data URLs stripped
        styleBlendPercent: styleBlendPercent,
        projectContext: cloneData(projectContext) || {},
        locationData: cloneData(locationData) || {},
        blendedStyle: cloneData(blendedStyle),
        panels: resolvedPanelMap || null,
        panelMap: resolvedPanelMap || null,
        panelCoordinates: a1Sheet?.panelCoordinates || a1Sheet?.coordinates || resolvedSheetMetadata.coordinates || null,
        versions: [], // Array of version objects
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        integrity: {
          dnaCompleteness,
          lastValidatedAt: new Date().toISOString()
        },
        // A1 Sheet metadata for consistency preservation
        a1Sheet: {
          url: strippedSheetUrl, // ⚠️ Data URLs stripped
          composedSheetUrl: strippedSheetUrl,
          metadata: {
            width: width,
            height: height,
            model: model,
            basePrompt: mainPrompt || '',
            a1LayoutKey: a1LayoutKey,
            seed: seed || Date.now(),
            ...resolvedSheetMetadata
          },
          panels: resolvedPanelMap || null,
          layoutPanels: resolvedPanelLayout || null,
          panelMap: resolvedPanelMap || null,
          coordinates: a1Sheet?.panelCoordinates || a1Sheet?.coordinates || resolvedSheetMetadata.coordinates || null,
          geometryRenders: sanitizedGeometryRenders || null,
          geometryDNA: geometryDNA || canonicalDNA?.geometry || canonicalDNA?.geometryDNA || null
        },
        panelMap: resolvedPanelMap || null,
        panelLayout: resolvedPanelLayout || null,
        siteSnapshot: siteSnapshotKey ? {
          key: siteSnapshotKey,
          metadata: {
            sha256: siteSnapshot?.sha256 || null,
            center: siteSnapshot?.center || { lat: 51.5074, lng: -0.1278 },
            zoom: siteSnapshot?.zoom || 17,
            mapType: siteSnapshot?.mapType || 'hybrid',
            size: siteSnapshot?.size || { width: 400, height: 300 },
            polygon: siteSnapshot?.polygon || null,
            polygonStyle: siteSnapshot?.polygonStyle || { strokeColor: 'red', strokeWeight: 2, fillColor: 'red', fillOpacity: 0.2 },
            capturedAt: siteSnapshot?.capturedAt || new Date().toISOString()
          }
        } : null
      };

      // Save to IndexedDB or localStorage
      let history = await this.getAllHistory();
      const existingIndex = history.findIndex(d => d.designId === design.designId);

      if (existingIndex >= 0) {
        history[existingIndex] = { ...history[existingIndex], ...design };
      } else {
        history.push(design);
      }

      // ⚠️ CRITICAL: Enforce maximum history size to prevent quota exceeded
      // Keep only the most recent 2 designs (A1 sheets with panels are very large)
      const MAX_DESIGNS = 2;
      if (history.length > MAX_DESIGNS) {
        logger.warn(`⚠️ History exceeds ${MAX_DESIGNS} designs, removing oldest...`);
        history.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const removed = history.slice(MAX_DESIGNS);
        removed.forEach(entry => {
          if (entry?.siteSnapshot?.key) {
            deleteSiteSnapshot(entry.siteSnapshot.key);
          }
        });
        history = history.slice(0, MAX_DESIGNS);
        logger.success(` Kept ${history.length} most recent designs`);
      }

      // Ensure no embedded data URLs survive into localStorage payloads
      stripDataUrlsDeep(design, { logSummary: true, label: 'design history entry' });
      stripDataUrlsDeep(history, { logSummary: true, label: 'design_history' });
      history = trimHistoryForStorage(history);

      // Check if setItem succeeded
      const saved = await storageManager.setItem(this.storageKey, history);     
      if (!saved) {
        const stats = await storageManager.getStats();
        const storageUsage = await storageManager.getStorageUsage();
        logger.error('❌ Failed to save design to storage:', {
          designId: design.designId,
          historyLength: history.length,
          storageUsage,
          stats: stats
        });
        logger.error('📊 Storage diagnostics:');
        logger.error(`   - Items in storage: ${stats?.itemCount ?? 0}`);
        logger.error(`   - Total size: ${stats?.totalSizeKB ?? 0} KB`);
        logger.error(`   - Usage: ${stats?.usagePercent ?? 0} %`);
        logger.error('   - Check browser console above for detailed storage error');
        throw new Error(`Failed to save design to storage. Storage usage: ${storageUsage}%. Check console for detailed error.`);
      }

      logger.success(` Created design: ${design.designId}`);

      return design.designId;
    } catch (error) {
      logger.error('❌ Failed to create design:', error);
      throw error;
    }
  }

  /**
   * Get design by ID
   * @param {string} designId - Design ID
   * @returns {Object|null} Design object or null
   */
  async getDesign(designId) {
    try {
      const history = await this.getAllHistory();
      const design = history.find(d => d.designId === designId);
      return design || null;
    } catch (error) {
      logger.error('❌ Failed to get design:', error);
      return null;
    }
  }

  /**
   * Get design by ID, or create it if missing
   * @param {string} designId - Design ID
   * @param {Object} baseData - Base data to create design if missing
   * @param {Object} baseData.masterDNA - Master DNA
   * @param {string} baseData.mainPrompt - Base prompt
   * @param {string} baseData.basePrompt - Base prompt (alias)
   * @param {number} baseData.seed - Generation seed
   * @param {Object} baseData.seedsByView - Seeds by view type
   * @param {string} baseData.resultUrl - A1 sheet URL
   * @param {string} baseData.a1SheetUrl - A1 sheet URL (alias)
   * @param {Object} baseData.projectContext - Project context
   * @returns {Promise<Object>} Design object (existing or newly created)
   */
  async getOrCreateDesign(designId, baseData = {}) {
    try {
      let design = await this.getDesign(designId);

      if (!design) {
        logger.info(`⚠️ Design ${designId} not found in history, creating entry...`);

        // Create minimal design entry
        await this.createDesign({
          designId,
          masterDNA: baseData.masterDNA || {},
          mainPrompt: baseData.mainPrompt || baseData.basePrompt || 'A1 Sheet Modification',
          basePrompt: baseData.basePrompt || baseData.mainPrompt || 'A1 Sheet Modification',
          seed: baseData.seed || Date.now(),
          seedsByView: baseData.seedsByView || {},
          resultUrl: baseData.resultUrl || baseData.a1SheetUrl || null,
          a1SheetUrl: baseData.resultUrl || baseData.a1SheetUrl || null,
          projectContext: baseData.projectContext || {},
          styleBlendPercent: baseData.styleBlendPercent || 70,
          width: baseData.width || 1792,
          height: baseData.height || 1269,
          model: baseData.model || 'black-forest-labs/FLUX.1-dev',
          a1LayoutKey: baseData.a1LayoutKey || 'uk-riba-standard',
          siteSnapshot: baseData.siteSnapshot || null // 🆕 Site snapshot
        });

        // Re-read the design
        design = await this.getDesign(designId);

        if (!design) {
          throw new Error(`Failed to create design entry for ${designId}`);
        }

        logger.success(` Created design entry: ${designId}`);
      }

      return design;
    } catch (error) {
      logger.error('❌ Failed to get or create design:', error);
      throw error;
    }
  }

  /**
   * List all designs
   * @returns {Array} Array of design summaries
   */
  async listDesigns() {
    try {
      const history = await this.getAllHistory();
      return history.map(d => ({
        designId: d.designId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        versionCount: d.versions?.length || 0,
        hasA1Sheet: !!(d.resultUrl || d.a1SheetUrl || d.composedSheetUrl || d.a1Sheet?.composedSheetUrl),
        hasGeometryBaseline: !!(d.geometryDNA || d.geometryRenders || d.a1Sheet?.geometryRenders)
      }));
    } catch (error) {
      logger.error('❌ Failed to list designs:', error);
      return [];
    }
  }

  /**
   * Add a version to an existing design
   * @param {string} designId - Design ID
   * @param {Object} versionData - Version data
   * @returns {Promise<string>} Version ID
   */
  async addVersion(designId, versionData) {
    try {
      const design = await this.getDesign(designId);
      if (!design) {
        throw new Error(`Design ${designId} not found`);
      }

      // ⚠️ Strip data URLs from version to prevent quota exceeded
      const strippedVersionData = { ...versionData };
      if (strippedVersionData.resultUrl) {
        strippedVersionData.resultUrl = this.stripDataUrl(strippedVersionData.resultUrl);
      }
      if (strippedVersionData.composedSheetUrl) {
        strippedVersionData.composedSheetUrl = this.stripDataUrl(strippedVersionData.composedSheetUrl);
      }
      if (strippedVersionData.geometryRenders) {
        strippedVersionData.geometryRenders = sanitizeGeometryRenders(strippedVersionData.geometryRenders);
      }
      if (strippedVersionData.panelMap) {
        strippedVersionData.panelMap = sanitizePanelMap(strippedVersionData.panelMap);
      }
      if (strippedVersionData.panels) {
        strippedVersionData.panels = sanitizePanelMap(strippedVersionData.panels);
      }

      const versionId = `v${(design.versions?.length || 0) + 1}`;
      const version = {
        versionId,
        ...strippedVersionData,
        createdAt: new Date().toISOString()
      };

      stripDataUrlsDeep(version);

      if (!design.versions) {
        design.versions = [];
      }
      design.versions.push(version);
      design.updatedAt = new Date().toISOString();

      // Update in storage
      const history = await this.getAllHistory();
      const index = history.findIndex(d => d.designId === designId);
      if (index >= 0) {
        history[index] = design;
        stripDataUrlsDeep(history);
        const trimmedHistory = trimHistoryForStorage(history);
        const saved = await storageManager.setItem(this.storageKey, trimmedHistory);
        if (!saved) {
          const storageUsage = await storageManager.getStorageUsage();
          logger.error('❌ Failed to save version to storage:', {
            designId,
            versionId,
            storageUsage
          });
          throw new Error(`Failed to save version to storage. Storage usage: ${storageUsage}%`);
        }
        logger.success(` Added version ${versionId} to design ${designId}`);    
      }

      return versionId;
    } catch (error) {
      logger.error('❌ Failed to add version:', error);
      throw error;
    }
  }

  /**
   * Get a specific version of a design
   * @param {string} designId - Design ID
   * @param {string} versionId - Version ID
   * @returns {Object|null} Version object or null
   */
  async getVersion(designId, versionId) {
    try {
      const design = await this.getDesign(designId);
      if (!design || !design.versions) {
        return null;
      }
      return design.versions.find(v => v.versionId === versionId) || null;
    } catch (error) {
      logger.error('❌ Failed to get version:', error);
      return null;
    }
  }

  /**
   * Generate a unique design ID
   * @returns {string} Design ID
   */
  generateDesignId() {
    return `design_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Save base design (compatibility method)
   * @param {Object} params - Design parameters
   * @returns {Promise<string>} Design ID
   */
  async saveBase(params) {
    return this.createDesign(params);
  }

  /**
   * Export design history as JSON file
   * Useful for backup or transferring between devices
   *
   * @param {string} projectId - Optional: export specific project only
   */
  async exportHistory(projectId = null) {
    try {
      const data = projectId
        ? await this.getDesignContext(projectId)
        : await this.getAllHistory();

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const filename = projectId
        ? `design_history_${projectId}.json`
        : `design_history_all.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);
      logger.info(`📥 Exported design history: ${filename}`);

    } catch (error) {
      logger.error('❌ Failed to export design history:', error);
    }
  }

  /**
   * Import design history from JSON file
   *
   * @param {File} file - JSON file containing design history
   */
  async importHistory(file) {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      // If single project object, wrap in array
      const entries = Array.isArray(imported) ? imported : [imported];

      // Merge with existing history
      const existing = await this.getAllHistory();
      const merged = [...existing];

      entries.forEach(entry => {
        const index = merged.findIndex(e => e.projectId === entry.projectId);   
        if (index >= 0) {
          merged[index] = entry; // Update existing
        } else {
          merged.push(entry); // Add new
        }
      });

      stripDataUrlsDeep(merged, { logSummary: true, label: 'design_history import' });
      await storageManager.setItem(this.storageKey, trimHistoryForStorage(merged));
      logger.info(`📤 Imported ${entries.length} design history entries`);      

    } catch (error) {
      logger.error('❌ Failed to import design history:', error);
      throw error;
    }
  }
}

// Export singleton instance
const designHistoryService = new DesignHistoryService();
export default designHistoryService;
