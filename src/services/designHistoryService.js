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

import storageManager from '../utils/storageManager';

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
  saveDesignContext(context) {
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

      // Get existing history
      const history = this.getAllHistory();

      // Add or update project
      const existingIndex = history.findIndex(entry => entry.projectId === projectId);
      if (existingIndex >= 0) {
        history[existingIndex] = historyEntry;
        console.log(`📝 Updated design history for project: ${projectId}`);
      } else {
        history.push(historyEntry);
        console.log(`✅ Saved design history for project: ${projectId}`);
      }

      // Save to localStorage with StorageManager (automatic quota handling)
      storageManager.setItem(this.storageKey, history);

      return projectId;

    } catch (error) {
      console.error('❌ Failed to save design history:', error);
      throw error;
    }
  }

  /**
   * Retrieve design context for a project
   *
   * @param {string} projectId - Project identifier
   * @returns {Object|null} Design context or null if not found
   */
  getDesignContext(projectId) {
    try {
      const history = this.getAllHistory();
      const context = history.find(entry => entry.projectId === projectId);

      if (context) {
        console.log(`📖 Retrieved design history for project: ${projectId}`);
        return context;
      } else {
        console.log(`⚠️  No design history found for project: ${projectId}`);
        return null;
      }

    } catch (error) {
      console.error('❌ Failed to retrieve design history:', error);
      return null;
    }
  }

  /**
   * Get the most recent design context
   * Useful for continuing work on the latest project
   *
   * @returns {Object|null} Most recent design context
   */
  getLatestDesignContext() {
    try {
      const history = this.getAllHistory();

      if (history.length === 0) {
        return null;
      }

      // Sort by timestamp (newest first)
      const sorted = history.sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      );

      console.log(`📖 Retrieved latest design history: ${sorted[0].projectId}`);
      return sorted[0];

    } catch (error) {
      console.error('❌ Failed to retrieve latest design history:', error);
      return null;
    }
  }

  /**
   * Get all design history entries
   *
   * @returns {Array} Array of design history entries
   */
  getAllHistory() {
    try {
      const stored = storageManager.getItem(this.storageKey, []);

      // Already an array - return as-is
      if (Array.isArray(stored)) {
        return stored;
      }

      // Migration: repair corrupted object-with-numeric-keys format
      // This happens when arrays were spread with timestamp: { ...array, _timestamp }
      if (stored && typeof stored === 'object') {
        console.warn('⚠️ Detected corrupted design history (object instead of array), migrating...');

        // Extract numeric keys and convert to array
        const keys = Object.keys(stored).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));

        if (keys.length > 0) {
          const repaired = keys.map(k => stored[k]);

          // Re-save with correct format
          storageManager.setItem(this.storageKey, repaired);
          console.log(`✅ Migrated ${repaired.length} design history entries`);

          return repaired;
        }
      }

      // Fallback: return empty array
      return [];
    } catch (error) {
      console.error('❌ Failed to parse design history:', error);
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
  generateContinuationPrompt(projectId, newPrompt) {
    const context = this.getDesignContext(projectId);

    if (!context) {
      console.warn('⚠️  No previous context found, using new prompt as-is');
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

    console.log('📝 Generated continuation prompt with historical context');
    return continuationPrompt;
  }

  /**
   * Clear all design history (use with caution)
   */
  clearAllHistory() {
    storageManager.removeItem(this.storageKey);
    console.log('🗑️  Cleared all design history');
  }

  /**
   * Delete a specific project's history
   *
   * @param {string} projectId - Project identifier to delete
   */
  deleteProject(projectId) {
    const history = this.getAllHistory();
    const filtered = history.filter(entry => entry.projectId !== projectId);
    storageManager.setItem(this.storageKey, filtered);
    console.log(`🗑️  Deleted design history for project: ${projectId}`);
  }

  /**
   * Strip large data URLs from object to reduce storage size
   * Data URLs (base64 images) can be 10MB+ and exceed localStorage limits
   * @param {string} url - URL to check
   * @returns {string|null} - Stripped URL or metadata note
   */
  stripDataUrl(url) {
    if (!url) return null;

    // If it's a data URL, don't store it (too large)
    if (url.startsWith('data:')) {
      const sizeKB = (url.length / 1024).toFixed(2);
      console.warn(`⚠️ Stripping data URL from storage (${sizeKB}KB)`);
      return `[DATA_URL_REMOVED_${sizeKB}KB]`;
    }

    return url;
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
        siteSnapshot = null // 🆕 Site map snapshot for pixel-exact parity
      } = params;

      const sheetUrl = resultUrl || a1SheetUrl || null;

      // ⚠️ CRITICAL: Strip data URLs to prevent localStorage quota exceeded
      // Data URLs (base64 images) can be 10-20MB and exceed 5-10MB localStorage limit
      const strippedSheetUrl = this.stripDataUrl(sheetUrl);
      const strippedSiteDataUrl = siteSnapshot ? this.stripDataUrl(siteSnapshot.dataUrl) : null;

      console.log('💾 Preparing design for storage...');
      if (sheetUrl !== strippedSheetUrl) {
        console.log(`   Stripped A1 sheet URL: ${(sheetUrl?.length / 1024).toFixed(2)}KB → metadata only`);
      }
      if (siteSnapshot && siteSnapshot.dataUrl !== strippedSiteDataUrl) {
        console.log(`   Stripped site snapshot: ${(siteSnapshot.dataUrl?.length / 1024).toFixed(2)}KB → metadata only`);
      }

      const design = {
        designId: designId || this.generateDesignId(),
        masterDNA: masterDNA || {},
        mainPrompt: mainPrompt || '',
        basePrompt: mainPrompt || '', // Alias for compatibility
        seed: seed || Date.now(),
        seedsByView: seedsByView || {},
        resultUrl: strippedSheetUrl, // ⚠️ Data URLs stripped
        a1SheetUrl: strippedSheetUrl, // ⚠️ Data URLs stripped
        styleBlendPercent: styleBlendPercent,
        projectContext: projectContext,
        versions: [], // Array of version objects
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // A1 Sheet metadata for consistency preservation
        a1Sheet: {
          url: strippedSheetUrl, // ⚠️ Data URLs stripped
          metadata: {
            width: width,
            height: height,
            model: model,
            basePrompt: mainPrompt || '',
            a1LayoutKey: a1LayoutKey,
            seed: seed || Date.now()
          }
        },
        // 🆕 Site snapshot for pixel-exact map parity across modifications
        // ⚠️ Data URLs stripped to prevent quota exceeded
        siteSnapshot: siteSnapshot ? {
          dataUrl: strippedSiteDataUrl, // ⚠️ Data URLs stripped
          sha256: siteSnapshot.sha256 || null,
          center: siteSnapshot.center || { lat: 51.5074, lng: -0.1278 },
          zoom: siteSnapshot.zoom || 17,
          mapType: siteSnapshot.mapType || 'hybrid',
          size: siteSnapshot.size || { width: 400, height: 300 },
          polygon: siteSnapshot.polygon || null, // Array of {lat, lng}
          polygonStyle: siteSnapshot.polygonStyle || { strokeColor: 'red', strokeWeight: 2, fillColor: 'red', fillOpacity: 0.2 },
          capturedAt: siteSnapshot.capturedAt || new Date().toISOString()
        } : null
      };

      // Save to IndexedDB or localStorage
      const history = this.getAllHistory();
      const existingIndex = history.findIndex(d => d.designId === design.designId);

      if (existingIndex >= 0) {
        history[existingIndex] = { ...history[existingIndex], ...design };
      } else {
        history.push(design);
      }

      // Check if setItem succeeded
      const saved = storageManager.setItem(this.storageKey, history);
      if (!saved) {
        const stats = storageManager.getStats();
        console.error('❌ Failed to save design to storage:', {
          designId: design.designId,
          historyLength: history.length,
          storageUsage: storageManager.getStorageUsage(),
          stats: stats
        });
        console.error('📊 Storage diagnostics:');
        console.error('   - Items in storage:', stats?.itemCount || 0);
        console.error('   - Total size:', stats?.totalSizeKB || 0, 'KB');
        console.error('   - Usage:', stats?.usagePercent || 0, '%');
        console.error('   - Check browser console above for detailed storage error');
        throw new Error(`Failed to save design to storage. Storage usage: ${storageManager.getStorageUsage()}%. Check console for detailed error.`);
      }

      console.log(`✅ Created design: ${design.designId}`);

      return design.designId;
    } catch (error) {
      console.error('❌ Failed to create design:', error);
      throw error;
    }
  }

  /**
   * Get design by ID
   * @param {string} designId - Design ID
   * @returns {Object|null} Design object or null
   */
  getDesign(designId) {
    try {
      const history = this.getAllHistory();
      const design = history.find(d => d.designId === designId);
      return design || null;
    } catch (error) {
      console.error('❌ Failed to get design:', error);
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
      let design = this.getDesign(designId);

      if (!design) {
        console.log(`⚠️ Design ${designId} not found in history, creating entry...`);

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
        design = this.getDesign(designId);

        if (!design) {
          throw new Error(`Failed to create design entry for ${designId}`);
        }

        console.log(`✅ Created design entry: ${designId}`);
      }

      return design;
    } catch (error) {
      console.error('❌ Failed to get or create design:', error);
      throw error;
    }
  }

  /**
   * List all designs
   * @returns {Array} Array of design summaries
   */
  listDesigns() {
    try {
      const history = this.getAllHistory();
      return history.map(d => ({
        designId: d.designId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        versionCount: d.versions?.length || 0,
        hasA1Sheet: !!(d.resultUrl || d.a1SheetUrl)
      }));
    } catch (error) {
      console.error('❌ Failed to list designs:', error);
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
      const design = this.getDesign(designId);
      if (!design) {
        throw new Error(`Design ${designId} not found`);
      }

      // ⚠️ Strip data URLs from version to prevent quota exceeded
      const strippedVersionData = { ...versionData };
      if (strippedVersionData.resultUrl) {
        strippedVersionData.resultUrl = this.stripDataUrl(strippedVersionData.resultUrl);
      }

      const versionId = `v${(design.versions?.length || 0) + 1}`;
      const version = {
        versionId,
        ...strippedVersionData,
        createdAt: new Date().toISOString()
      };

      if (!design.versions) {
        design.versions = [];
      }
      design.versions.push(version);
      design.updatedAt = new Date().toISOString();

      // Update in storage
      const history = this.getAllHistory();
      const index = history.findIndex(d => d.designId === designId);
      if (index >= 0) {
        history[index] = design;
        const saved = storageManager.setItem(this.storageKey, history);
        if (!saved) {
          console.error('❌ Failed to save version to storage:', {
            designId,
            versionId,
            storageUsage: storageManager.getStorageUsage()
          });
          throw new Error(`Failed to save version to storage. Storage usage: ${storageManager.getStorageUsage()}%`);
        }
        console.log(`✅ Added version ${versionId} to design ${designId}`);
      }

      return versionId;
    } catch (error) {
      console.error('❌ Failed to add version:', error);
      throw error;
    }
  }

  /**
   * Get a specific version of a design
   * @param {string} designId - Design ID
   * @param {string} versionId - Version ID
   * @returns {Object|null} Version object or null
   */
  getVersion(designId, versionId) {
    try {
      const design = this.getDesign(designId);
      if (!design || !design.versions) {
        return null;
      }
      return design.versions.find(v => v.versionId === versionId) || null;
    } catch (error) {
      console.error('❌ Failed to get version:', error);
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
  exportHistory(projectId = null) {
    try {
      const data = projectId
        ? this.getDesignContext(projectId)
        : this.getAllHistory();

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
      console.log(`📥 Exported design history: ${filename}`);

    } catch (error) {
      console.error('❌ Failed to export design history:', error);
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
      const existing = this.getAllHistory();
      const merged = [...existing];

      entries.forEach(entry => {
        const index = merged.findIndex(e => e.projectId === entry.projectId);
        if (index >= 0) {
          merged[index] = entry; // Update existing
        } else {
          merged.push(entry); // Add new
        }
      });

      storageManager.setItem(this.storageKey, merged);
      console.log(`📤 Imported ${entries.length} design history entries`);

    } catch (error) {
      console.error('❌ Failed to import design history:', error);
      throw error;
    }
  }
}

// Export singleton instance
const designHistoryService = new DesignHistoryService();
export default designHistoryService;
