/**
 * Design History Repository
 *
 * Encapsulates persistence of design history using pluggable storage backends.
 * Applies aggressive sanitization to avoid localStorage quota errors.
 */

import storageManager from '../utils/storageManager.js';
import { deleteSiteSnapshot } from '../utils/siteSnapshotStore.js';
import logger from '../utils/logger.js';
import {
  stripDataUrl,
  compressMasterDNA,
  sanitizeSheetMetadata,
  sanitizePanelMap,
  stripDataUrlsDeep
} from '../utils/designHistorySanitizer.js';
import baselineArtifactStore from './baselineArtifactStore.js';

const MAX_DESIGNS = 2;
const MAX_VERSIONS_PER_DESIGN = 3;
const MAX_PAYLOAD_BYTES = 4.5 * 1024 * 1024;

/**
 * Storage backend interface
 */
class StorageBackend {
  async save(key, data) {
    throw new Error('Not implemented');
  }

  async get(key) {
    throw new Error('Not implemented');
  }

  async list() {
    throw new Error('Not implemented');
  }

  async delete(key) {
    throw new Error('Not implemented');
  }
}

/**
 * LocalStorage backend (uses storageManager)
 */
class LocalStorageBackend extends StorageBackend {
  constructor(storageKey = 'design_history') {
    super();
    this.storageKey = storageKey;
  }

  async save(key, data) {
    const all = await this.list();
    const index = all.findIndex(d => (d.id || d.designId) === key);

    if (index >= 0) {
      all[index] = data;
    } else {
      all.push(data);
    }

    return storageManager.setItem(this.storageKey, all);
  }

  async setAll(data) {
    return storageManager.setItem(this.storageKey, data);
  }

  async get(key) {
    const all = await this.list();
    return all.find(d => (d.id || d.designId) === key) || null;
  }

  async list() {
    // Migration: Check for old double-prefixed key
    try {
      const oldKey = 'archiAI_design_history'; // Will become archiAI_archiAI_design_history with old prefix
      const oldData = localStorage.getItem('archiAI_' + oldKey);
      if (oldData) {
        logger.info('Migrating from old double-prefixed storage key...');
        const parsed = JSON.parse(oldData);
        const data = parsed._data || parsed;
        if (Array.isArray(data) && data.length > 0) {
          // Save to new key (without double prefix)
          await storageManager.setItem(this.storageKey, data);
          // Remove old key
          localStorage.removeItem('archiAI_' + oldKey);
          logger.success('Migration complete, old storage cleaned up');
          return data;
        }
      }
    } catch (migrationError) {
      logger.warn('Migration check failed, continuing...', migrationError);
    }

    const stored = await storageManager.getItem(this.storageKey, []);

    // Handle array format
    if (Array.isArray(stored)) {
      return stored;
    }

    // Handle corrupted object format (migration)
    if (stored && typeof stored === 'object') {
      const keys = Object.keys(stored)
        .filter(k => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));

      if (keys.length > 0) {
        const repaired = keys.map(k => stored[k]);
        // Re-save with correct format
        await storageManager.setItem(this.storageKey, repaired);
        return repaired;
      }
    }

    return [];
  }

  async delete(key) {
    const all = await this.list();
    const filtered = all.filter(d => (d.id || d.designId) !== key);
    return storageManager.setItem(this.storageKey, filtered);
  }
}

/**
 * IndexedDB backend (future implementation)
 */
class IndexedDBBackend extends StorageBackend {
  constructor(dbName = 'archiAI', storeName = 'designs') {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  async init() {
    // TODO: Implement IndexedDB initialization
    // For now, fallback to localStorage
    this.fallback = this.fallback || new LocalStorageBackend();
  }

  async save(key, data) {
    if (!this.fallback) await this.init();
    return this.fallback.save(key, data);
  }

  async get(key) {
    if (!this.fallback) await this.init();
    return this.fallback.get(key);
  }

  async list() {
    if (!this.fallback) await this.init();
    return this.fallback.list();
  }

  async delete(key) {
    if (!this.fallback) await this.init();
    return this.fallback.delete(key);
  }
}

function cloneData(value) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    logger.warn('Failed to deep-clone design history payload', error);
    return value;
  }
}

function estimateSize(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch (error) {
    logger.warn('Failed to estimate payload size', error);
    return Number.POSITIVE_INFINITY;
  }
}

function sanitizeSiteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot || null;
  }

  const sanitized = cloneData(snapshot) || {};
  stripDataUrlsDeep(sanitized);

  if (sanitized.dataUrl) {
    sanitized.dataUrl = stripDataUrl(sanitized.dataUrl);
  }

  return sanitized;
}

const VERSION_METADATA_KEYS = [
  'width',
  'height',
  'model',
  'a1LayoutKey',
  'workflow',
  'panelCount',
  'seed',
  'layout',
  'panelCoordinates',
  'coordinates',
  'dpi'
];

function sanitizeVersionMetadata(metadata = {}) {
  const base = sanitizeSheetMetadata(metadata);
  const lightweight = {};

  VERSION_METADATA_KEYS.forEach(key => {
    if (base[key] !== undefined) {
      lightweight[key] = base[key];
    }
  });

  const sanitizedPanelMap = sanitizePanelMap(base.panelMap);
  if (sanitizedPanelMap) {
    lightweight.panelMap = sanitizedPanelMap;
  }

  return lightweight;
}

function sanitizeVersionEntry(versionData = {}) {
  const sanitized = cloneData(versionData) || {};

  if (sanitized.resultUrl) {
    sanitized.resultUrl = stripDataUrl(sanitized.resultUrl);
  }

  if (sanitized.composedSheetUrl) {
    sanitized.composedSheetUrl = stripDataUrl(sanitized.composedSheetUrl);
  }

  if (sanitized.previewUrl) {
    sanitized.previewUrl = stripDataUrl(sanitized.previewUrl);
  }

  if (sanitized.panelMap) {
    sanitized.panelMap = sanitizePanelMap(sanitized.panelMap);
  }

  if (sanitized.panels) {
    sanitized.panels = sanitizePanelMap(sanitized.panels);
  }

  if (sanitized.geometryRenders && Array.isArray(sanitized.geometryRenders)) {
    sanitized.geometryRenders = sanitized.geometryRenders.map(render => {
      if (!render || typeof render !== 'object') return null;
      const cleaned = { ...render };
      if (cleaned.url) {
        cleaned.url = stripDataUrl(cleaned.url);
      }
      return cleaned;
    }).filter(Boolean);
  }

  if (sanitized.imageUrl) {
    sanitized.imageUrl = stripDataUrl(sanitized.imageUrl);
  }

  const metadata = versionData.metadata ? sanitizeVersionMetadata(versionData.metadata) : null;

  if (metadata && Object.keys(metadata).length > 0) {
    sanitized.metadata = metadata;
  } else {
    delete sanitized.metadata;
  }

  if (versionData.panelMap) {
    sanitized.panelMap = sanitizePanelMap(versionData.panelMap);
  }

  stripDataUrlsDeep(sanitized);

  return sanitized;
}

function trimVersionsForStorage(versions = []) {
  const sanitized = (versions || [])
    .map(entry => sanitizeVersionEntry(entry))
    .filter(Boolean);

  sanitized.sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  return sanitized.slice(0, MAX_VERSIONS_PER_DESIGN);
}

function buildDesignPayload(design, existingDesign = null) {
  const designId = design.id || design.designId || `design_${Date.now()}`;      

  const canonicalDNA = cloneData(design.dna || design.masterDNA || {}) || {};   
  stripDataUrlsDeep(canonicalDNA);
  const compressedDNA = compressMasterDNA(canonicalDNA);
  const sheetUrl = stripDataUrl(
    design.resultUrl ||
    design.a1SheetUrl ||
    design.a1Sheet?.composedSheetUrl ||
    design.a1Sheet?.url ||
    design.composedSheetUrl ||
    null
  );
  const panelMapInput =
    design.panelMap ||
    design.panels ||
    design.a1Sheet?.panelMap ||
    design.a1Sheet?.panels ||
    design.sheetMetadata?.panelMap ||
    design.metadata?.panels ||
    {};

  const sheetMetadata = sanitizeSheetMetadata(
    design.sheetMetadata ||
    design.a1Sheet?.metadata ||
    {}
  );

  let geometryRenders = design.geometryRenders || design.a1Sheet?.geometryRenders || null;
  if (Array.isArray(geometryRenders)) {
    geometryRenders = geometryRenders.map(render => {
      if (!render || typeof render !== 'object') return null;
      const cleaned = { ...render };
      if (cleaned.url) {
        cleaned.url = stripDataUrl(cleaned.url);
      }
      return cleaned;
    }).filter(Boolean);
  }

  let resolvedPanelMap = sanitizePanelMap(panelMapInput || sheetMetadata.panelMap);
  if (resolvedPanelMap && Object.keys(resolvedPanelMap).length === 0) {
    resolvedPanelMap = null;
  }

  if (resolvedPanelMap) {
    sheetMetadata.panelMap = resolvedPanelMap;
  } else if (sheetMetadata.panelMap) {
    delete sheetMetadata.panelMap;
  }

  const versions = trimVersionsForStorage(design.versions || existingDesign?.versions || []);
  const panelCoordinates =
    design.panelCoordinates ||
    design.coordinates ||
    design.a1Sheet?.coordinates ||
    sheetMetadata.coordinates ||
    sheetMetadata.panelCoordinates ||
    null;

  const sanitizedProjectContext = cloneData(design.projectContext) || {};
  stripDataUrlsDeep(sanitizedProjectContext);

  const sanitizedLocationData = cloneData(design.locationData) || {};
  stripDataUrlsDeep(sanitizedLocationData);

  const sanitizedOverlays = cloneData(design.overlays) || [];
  stripDataUrlsDeep(sanitizedOverlays);

  const sanitizedBlendedStyle = cloneData(design.blendedStyle) || null;
  stripDataUrlsDeep(sanitizedBlendedStyle);

  const clonedA1Sheet = design.a1Sheet ? cloneData(design.a1Sheet) || {} : {};
  stripDataUrlsDeep(clonedA1Sheet);
  if (clonedA1Sheet && typeof clonedA1Sheet === 'object' && clonedA1Sheet.dataUrl) {
    delete clonedA1Sheet.dataUrl;
  }

  const payload = {
    id: designId,
    designId,
    projectId: design.projectId || designId,
    dna: compressedDNA,
    masterDNA: compressedDNA,
    masterDNAFull: canonicalDNA,
    geometryDNA: design.geometryDNA || canonicalDNA.geometry || canonicalDNA.geometryDNA || null,
    geometryRenders: geometryRenders || null,
    basePrompt: design.basePrompt || design.mainPrompt || '',
    seed: design.seed || Date.now(),
    sheetType: design.sheetType || 'ARCH',
    sheetMetadata,
    overlays: sanitizedOverlays,
    createdAt: design.createdAt || existingDesign?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions,
    projectContext: sanitizedProjectContext,
    locationData: sanitizedLocationData,
    siteSnapshot: sanitizeSiteSnapshot(design.siteSnapshot || existingDesign?.siteSnapshot),
    blendedStyle: sanitizedBlendedStyle,
    composedSheetUrl: sheetUrl,
    resultUrl: sheetUrl,
    a1Sheet: {
      ...(clonedA1Sheet || {}),
      url: sheetUrl,
      composedSheetUrl: sheetUrl,
      metadata: sheetMetadata,
      panelMap: resolvedPanelMap || null,
      panels: resolvedPanelMap || null,
      coordinates: panelCoordinates,
      geometryRenders: geometryRenders || null,
      geometryDNA: design.geometryDNA || canonicalDNA.geometry || canonicalDNA.geometryDNA || null
    },
    panelMap: resolvedPanelMap || null,
    panels: resolvedPanelMap || null,
    panelCoordinates,
    a1SheetUrl: sheetUrl,
    _schemaVersion: 2
  };

  return payload;
}

function enforceDesignSize(design) {
  let payload = design;
  let size = estimateSize(payload);

  if (size <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  if (payload.masterDNAFull) {
    const { masterDNAFull, ...rest } = payload;
    payload = rest;
    size = estimateSize(payload);
  }

  if (size <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  if (payload.a1Sheet?.panelMap || payload.panelMap) {
    const { a1Sheet, ...rest } = payload;
    const nextSheet = a1Sheet ? { ...a1Sheet } : null;
    if (nextSheet) {
      nextSheet.panelMap = null;
      nextSheet.panels = null;
      nextSheet.geometryRenders = nextSheet.geometryRenders || null;
      if (nextSheet.metadata) {
        const metadata = { ...nextSheet.metadata };
        delete metadata.panelMap;
        nextSheet.metadata = metadata;
      }
    }

    payload = {
      ...rest,
      a1Sheet: nextSheet,
      panelMap: null,
      panels: null,
      panelCoordinates: null,
      geometryRenders: payload.geometryRenders || null
    };
    size = estimateSize(payload);
  }

  if (size <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  if (Array.isArray(payload.versions) && payload.versions.length > 1) {
    payload = { ...payload, versions: payload.versions.slice(0, 1) };
    size = estimateSize(payload);
  }

  if (size > MAX_PAYLOAD_BYTES) {
    logger.warn('Design payload still exceeds size budget after trimming', {
      designId: payload.designId,
      sizeKB: (size / 1024).toFixed(2)
    });
  }

  return payload;
}

function enforceHistoryCap(designs = []) {
  const sorted = [...designs].sort((a, b) =>
    new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );

  if (sorted.length <= MAX_DESIGNS) {
    return sorted;
  }

  const trimmed = sorted.slice(0, MAX_DESIGNS);
  const removed = sorted.slice(MAX_DESIGNS);

  removed.forEach(entry => {
    if (entry?.siteSnapshot?.key) {
      deleteSiteSnapshot(entry.siteSnapshot.key);
    }
  });

  logger.warn(`History exceeds ${MAX_DESIGNS} designs, removing oldest...`);

  return trimmed;
}

/**
 * Design History Repository
 */
class DesignHistoryRepository {
  constructor(backend = null) {
    this.backend = backend || new LocalStorageBackend();
  }

  /**
   * Generate deterministic design ID
   * @param {Object} dna - Master DNA
   * @param {Object} siteSnapshot - Site snapshot
   * @param {number} seed - Generation seed
   * @returns {string} Design ID
   */
  generateDesignId(dna = null, siteSnapshot = null, seed = null) {
    // If we have DNA + site + seed, generate hash-based ID
    if (dna && seed) {
      const hashInput = JSON.stringify({
        dimensions: dna.dimensions,
        materials: dna.materials?.slice(0, 3),
        seed,
        siteHash: siteSnapshot?.sha256 || null
      });

      // Simple hash function (for deterministic IDs)
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        const char = hashInput.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }

      return `design_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
    }

    // Fallback: UUID-like ID
    return `design_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async persistDesigns(designs = []) {
    if (typeof this.backend.setAll === 'function') {
      return this.backend.setAll(designs);
    }

    if (this.backend instanceof LocalStorageBackend) {
      return storageManager.setItem(this.backend.storageKey, designs);
    }

    await Promise.all(
      designs.map(entry => this.backend.save(entry.id || entry.designId, entry))
    );
    return true;
  }

  /**
   * Save design
   * @param {Object} design - Design object
   * @returns {Promise<string>} Design ID
   */
  async saveDesign(design) {
    const designId = design.id || design.designId || this.generateDesignId(
      design.dna || design.masterDNA,
      design.siteSnapshot,
      design.seed
    );

    const allDesigns = await this.backend.list();
    const existingIndex = allDesigns.findIndex(d => (d.id || d.designId) === designId);
    const existingDesign = existingIndex >= 0 ? allDesigns[existingIndex] : null;

    const sanitizedDesign = enforceDesignSize(
      buildDesignPayload({ ...design, designId }, existingDesign)
    );

    const updatedDesigns = [...allDesigns];

    if (existingIndex >= 0) {
      const mergedDesign = {
        ...existingDesign,
        ...sanitizedDesign,
        createdAt: existingDesign.createdAt || sanitizedDesign.createdAt,
        versions: sanitizedDesign.versions
      };
      updatedDesigns[existingIndex] = mergedDesign;
    } else {
      updatedDesigns.push(sanitizedDesign);
    }

    const cappedDesigns = enforceHistoryCap(updatedDesigns);
    const saved = await this.persistDesigns(cappedDesigns);

    if (!saved) {
      const usage = await storageManager.getStorageUsage();
      throw new Error(`Failed to save design to storage. Storage usage: ${usage}%`);
    }

    // Persist geometry baseline separately if available
    if (design.geometryDNA || design.geometryRenders) {
      try {
        await baselineArtifactStore.saveBaselineArtifacts({
          designId,
          sheetId: 'default',
          bundle: {
            designId,
            sheetId: 'default',
            baselineImageUrl: design.resultUrl || design.composedSheetUrl || design.a1Sheet?.url || '',
            baselineDNA: design.masterDNA || design.dna || {},
            geometryBaseline: {
              geometryDNA: design.geometryDNA || design.masterDNA?.geometry || design.dna?.geometry || null,
              renders: design.geometryRenders || design.a1Sheet?.geometryRenders || null
            },
            metadata: {
              workflow: 'geometry-volume-first'
            }
          }
        });
      } catch {
        // Ignore baseline save errors
      }
    }

    return designId;
  }

  /**
   * Update design version
   * @param {string} designId - Design ID
   * @param {Object} versionData - Version data
   * @returns {Promise<string>} Version ID
   */
  async updateDesignVersion(designId, versionData) {
    const allDesigns = await this.backend.list();
    const index = allDesigns.findIndex(d => (d.id || d.designId) === designId);

    if (index === -1) {
      throw new Error(`Design ${designId} not found`);
    }

    const design = allDesigns[index];

    const versionId = `v${(design.versions?.length || 0) + 1}`;
    const sanitizedVersion = sanitizeVersionEntry({
      ...versionData,
      versionId,
      createdAt: new Date().toISOString()
    });

    const versions = trimVersionsForStorage([sanitizedVersion, ...(design.versions || [])]);

    const updatedDesign = enforceDesignSize(
      buildDesignPayload({ ...design, designId, versions }, design)
    );

    const cappedDesigns = enforceHistoryCap([
      ...allDesigns.slice(0, index),
      updatedDesign,
      ...allDesigns.slice(index + 1)
    ]);

    const saved = await this.persistDesigns(cappedDesigns);
    if (!saved) {
      const usage = await storageManager.getStorageUsage();
      throw new Error(`Failed to save version to storage. Storage usage: ${usage}%`);
    }
    return versionId;
  }

  /**
   * Get design by ID
   * @param {string} designId - Design ID
   * @returns {Promise<Object|null>} Design object or null
   */
  async getDesignById(designId) {
    return this.backend.get(designId);
  }

  /**
   * List all designs
   * @returns {Promise<Array>} Array of design summaries
   */
  async listDesigns() {
    const all = await this.backend.list();
    return all.map(d => ({
      id: d.id || d.designId,
      designId: d.id || d.designId,
      projectId: d.projectId,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      versionCount: d.versions?.length || 0,
      sheetType: d.sheetType || 'ARCH',
      hasA1Sheet: !!(d.resultUrl || d.composedSheetUrl || d.a1Sheet?.url || d.a1Sheet?.composedSheetUrl),
      hasGeometryBaseline: !!(d.geometryDNA || d.geometryRenders)
    }));
  }

  /**
   * Delete design
   * @param {string} designId - Design ID
   * @returns {Promise<boolean>} Success
   */
  async deleteDesign(designId) {
    const allDesigns = await this.backend.list();
    const filtered = allDesigns.filter(d => (d.id || d.designId) !== designId);

    const removed = allDesigns.find(d => (d.id || d.designId) === designId);
    if (removed?.siteSnapshot?.key) {
      await deleteSiteSnapshot(removed.siteSnapshot.key);
    }

    return this.persistDesigns(filtered);
  }

  async clearAllDesigns() {
    if (typeof this.backend.setAll === 'function') {
      await this.backend.setAll([]);
      return true;
    }

    if (this.backend instanceof LocalStorageBackend) {
      await storageManager.setItem(this.backend.storageKey, []);
      return true;
    }

    return true;
  }

  /**
   * Migrate from legacy storage format
   * @param {string} legacyKey - Legacy storage key
   * @returns {Promise<number>} Number of designs migrated
   */
  async migrateFromLegacyStorage(legacyKey = 'design_history') {
    const legacy = await storageManager.getItem(legacyKey, []);
    if (!Array.isArray(legacy) || legacy.length === 0) {
      return 0;
    }

    let migrated = 0;
    for (const oldDesign of legacy) {
      try {
        const legacyPanelMap = oldDesign.panelMap || oldDesign.a1Sheet?.panelMap || oldDesign.a1Sheet?.panels || null;
        const composedUrl = oldDesign.a1Sheet?.composedSheetUrl || oldDesign.a1Sheet?.url || oldDesign.resultUrl || oldDesign.a1SheetUrl || oldDesign.floorPlanUrl;
        // Map old format to new format
        const newDesign = {
          id: oldDesign.designId || oldDesign.projectId,
          dna: oldDesign.masterDNA || oldDesign.buildingDNA || {},
          geometryDNA: oldDesign.geometryDNA || oldDesign.geometry || null,
          geometryRenders: oldDesign.geometryRenders || oldDesign.a1Sheet?.geometryRenders || null,
          basePrompt: oldDesign.mainPrompt || oldDesign.prompt || oldDesign.basePrompt || '',
          seed: oldDesign.seed,
          sheetType: 'ARCH',
          sheetMetadata: oldDesign.a1Sheet?.metadata || {},
          overlays: [],
          createdAt: oldDesign.createdAt || oldDesign.timestamp,
          versions: oldDesign.versions || [],
          projectContext: oldDesign.projectContext || oldDesign.metadata || {},
          locationData: oldDesign.locationData || oldDesign.location || {},
          siteSnapshot: oldDesign.siteSnapshot,
          blendedStyle: oldDesign.blendedStyle,
          resultUrl: composedUrl,
          composedSheetUrl: composedUrl,
          panelMap: legacyPanelMap,
          panels: legacyPanelMap,
          panelCoordinates: oldDesign.panelCoordinates || oldDesign.a1Sheet?.coordinates || null,
          a1Sheet: {
            ...(oldDesign.a1Sheet || {}),
            composedSheetUrl: composedUrl,
            panels: legacyPanelMap,
            panelMap: legacyPanelMap,
            coordinates: oldDesign.panelCoordinates || oldDesign.a1Sheet?.coordinates || null
          }
        };

        await this.saveDesign(newDesign);
        migrated++;
      } catch (error) {
        logger.warn(`Failed to migrate design ${oldDesign.designId}:`, error);
      }
    }

    logger.success(`Migrated ${migrated} designs from legacy storage`);
    return migrated;
  }
}

// Export singleton instance with localStorage backend
const repository = new DesignHistoryRepository();
export default repository;

// Export classes for testing/custom backends
export { DesignHistoryRepository, LocalStorageBackend, IndexedDBBackend };
