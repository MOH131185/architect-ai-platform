/**
 * Baseline Artifact Store
 * 
 * Manages immutable baseline artifacts for deterministic modify mode.
 * Each baseline bundle includes:
 * - baseline.png (full-resolution A1 sheet)
 * - baseline.json (canonical DNA + layout)
 * - siteSnapshot.png (site overlay image)
 * - metadata.json (seed, model, hashes, camera signatures)
 * - panelCoordinates.json (panel pixel rectangles)
 * - seeds.json (seed mapping for multi-sheet/panel)
 * - consistencyLocks.json (architectural consistency locks)
 * 
 * Storage backend: filesystem / S3-like / Vercel storage / IndexedDB
 * 
 * INTEGRATION: Works with strictA1PromptGenerator for high-accuracy generation
 */

import { createBaselineArtifactBundle } from '../types/schemas.js';
import { computePanelCoordinates } from '../config/sheetLayoutConfig.js';
import logger from '../utils/logger.js';
import { validateA1SheetConsistency, generateConsistencyReport } from './architecturalConsistencyValidator.js';

/**
 * Baseline Artifact Store
 */
class BaselineArtifactStore {
  constructor() {
    this.storage = new Map(); // In-memory cache
    this.storageBackend = 'indexedDB'; // Default to IndexedDB for persistence
    this.initPromise = null;
  }
  
  /**
   * Initialize IndexedDB
   * @private
   */
  async _ensureInit() {
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        logger.warn('IndexedDB not available, falling back to memory storage');
        this.storageBackend = 'memory';
        resolve();
        return;
      }
      
      const request = indexedDB.open('archiAI_baselines', 1);
      
      request.onerror = () => {
        logger.error('Failed to open IndexedDB', request.error);
        this.storageBackend = 'memory';
        resolve();
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        logger.info('IndexedDB initialized for baseline storage');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('baselines')) {
          db.createObjectStore('baselines');
        }
      };
    });
    
    return this.initPromise;
  }
  
  /**
   * Save baseline artifacts
   * @param {Object} params - Parameters
   * @param {string} params.designId - Design ID
   * @param {string} params.sheetId - Sheet ID
   * @param {Object} params.bundle - Baseline artifact bundle
   * @param {Object} [params.geometryBaseline] - Optional geometry baseline (DNA + renders + scene)
   * @returns {Promise<string>} Baseline key
   */
  async saveBaselineArtifacts({ designId, sheetId, bundle }) {
    await this._ensureInit();
    
    const baselineKey = `${designId}_${sheetId}_baseline`;
    
    logger.info('Saving baseline artifacts', { designId, sheetId, baselineKey }, '💾');
    
    // Validate bundle
    if (!bundle.baselineImageUrl) {
      throw new Error('Baseline image URL is required');
    }
    
    if (!bundle.baselineDNA) {
      throw new Error('Baseline DNA is required');
    }

    // Geometry baseline is optional; if present ensure shape
    const geometryBaseline = bundle.geometryBaseline || null;
    if (geometryBaseline && !geometryBaseline.geometryDNA) {
      logger.warn('Geometry baseline missing geometryDNA; storing as-is');
    }
    
    if (!bundle.metadata || !bundle.metadata.seed) {
      throw new Error('Baseline seed is required');
    }
    
    // Create complete bundle
    const completeBundle = createBaselineArtifactBundle({
      designId,
      sheetId,
      ...bundle,
      geometryBaseline,
      savedAt: new Date().toISOString()
    });
    
    // Mark as immutable
    Object.freeze(completeBundle);
    Object.freeze(completeBundle.baselineDNA);
    Object.freeze(completeBundle.baselineLayout);
    Object.freeze(completeBundle.metadata);
    
    // Save to storage
    if (this.storageBackend === 'memory') {
      this.storage.set(baselineKey, completeBundle);
    } else if (this.storageBackend === 'indexedDB') {
      await this.saveToIndexedDB(baselineKey, completeBundle);
    } else if (this.storageBackend === 'server') {
      await this.saveToServer(baselineKey, completeBundle);
    }
    
    logger.success('Baseline artifacts saved', { baselineKey, size: JSON.stringify(completeBundle).length });
    
    return baselineKey;
  }

  /**
   * Save only geometry baseline (adds or updates baseline with geometry data)
   * @param {Object} params
   * @param {string} params.designId
   * @param {string} params.sheetId
   * @param {Object} params.geometryBaseline
   */
  async saveGeometryBaseline({ designId, sheetId, geometryBaseline }) {
    await this._ensureInit();
    const baselineKey = `${designId}_${sheetId}_baseline`;

    let existing = null;
    if (this.storageBackend === 'memory') {
      existing = this.storage.get(baselineKey);
    } else if (this.storageBackend === 'indexedDB') {
      existing = await this.loadFromIndexedDB(baselineKey);
    } else if (this.storageBackend === 'server') {
      existing = await this.loadFromServer(baselineKey);
    }

    const merged = existing ? { ...existing, geometryBaseline } : createBaselineArtifactBundle({
      designId,
      sheetId,
      baselineImageUrl: '',
      baselineDNA: {},
      geometryBaseline
    });

    if (this.storageBackend === 'memory') {
      this.storage.set(baselineKey, merged);
    } else if (this.storageBackend === 'indexedDB') {
      await this.saveToIndexedDB(baselineKey, merged);
    } else if (this.storageBackend === 'server') {
      await this.saveToServer(baselineKey, merged);
    }

    return baselineKey;
  }
  
  /**
   * Get baseline artifacts
   * @param {Object} params - Parameters
   * @param {string} params.designId - Design ID
   * @param {string} params.sheetId - Sheet ID
   * @returns {Promise<Object>} Baseline artifact bundle
   */
  async getBaselineArtifacts({ designId, sheetId }) {
    await this._ensureInit();
    
    const baselineKey = `${designId}_${sheetId}_baseline`;
    
    logger.debug('Loading baseline artifacts', { baselineKey }, '📂');
    
    let bundle = null;
    
    if (this.storageBackend === 'memory') {
      bundle = this.storage.get(baselineKey);
    } else if (this.storageBackend === 'indexedDB') {
      bundle = await this.loadFromIndexedDB(baselineKey);
    } else if (this.storageBackend === 'server') {
      bundle = await this.loadFromServer(baselineKey);
    }
    
    if (!bundle) {
      logger.warn('Baseline artifacts not found', { baselineKey });
      return null;
    }
    
    logger.success('Baseline artifacts loaded', { baselineKey });
    return bundle;
  }
  
  /**
   * Ensure baseline is immutable
   * @param {string} baselineKey - Baseline key
   * @returns {Promise<boolean>} Success
   */
  async ensureImmutable(baselineKey) {
    const bundle = await this.getBaselineArtifacts({ 
      designId: baselineKey.split('_')[0], 
      sheetId: baselineKey.split('_')[1] 
    });
    
    if (!bundle) {
      return false;
    }
    
    // Check if already frozen
    if (Object.isFrozen(bundle)) {
      return true;
    }
    
    // Freeze all parts
    Object.freeze(bundle);
    Object.freeze(bundle.baselineDNA);
    Object.freeze(bundle.baselineLayout);
    Object.freeze(bundle.metadata);
    
    return true;
  }
  
  /**
   * Delete baseline artifacts
   * @param {Object} params - Parameters
   * @returns {Promise<boolean>} Success
   */
  async deleteBaselineArtifacts({ designId, sheetId }) {
    const baselineKey = `${designId}_${sheetId}_baseline`;
    
    if (this.storageBackend === 'memory') {
      return this.storage.delete(baselineKey);
    } else if (this.storageBackend === 'indexedDB') {
      return await this.deleteFromIndexedDB(baselineKey);
    } else if (this.storageBackend === 'server') {
      return await this.deleteFromServer(baselineKey);
    }
    
    return false;
  }
  
  /**
   * Save to IndexedDB
   * @private
   */
  async saveToIndexedDB(key, bundle) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('archiAI_baselines', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['baselines'], 'readwrite');
        const store = transaction.objectStore('baselines');
        const putRequest = store.put(bundle, key);
        
        putRequest.onsuccess = () => resolve(true);
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('baselines')) {
          db.createObjectStore('baselines');
        }
      };
    });
  }
  
  /**
   * Load from IndexedDB
   * @private
   */
  async loadFromIndexedDB(key) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('archiAI_baselines', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['baselines'], 'readonly');
        const store = transaction.objectStore('baselines');
        const getRequest = store.get(key);
        
        getRequest.onsuccess = () => resolve(getRequest.result || null);
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }
  
  /**
   * Delete from IndexedDB
   * @private
   */
  async deleteFromIndexedDB(key) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('archiAI_baselines', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['baselines'], 'readwrite');
        const store = transaction.objectStore('baselines');
        const deleteRequest = store.delete(key);
        
        deleteRequest.onsuccess = () => resolve(true);
        deleteRequest.onerror = () => reject(deleteRequest.error);
      };
    });
  }
  
  /**
   * Save to server
   * @private
   */
  async saveToServer(key, bundle) {
    const response = await fetch('/api/baseline-artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, bundle })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save baseline artifacts: ${response.status}`);
    }
    
    return true;
  }
  
  /**
   * Load from server
   * @private
   */
  async loadFromServer(key) {
    const response = await fetch(`/api/baseline-artifacts?key=${encodeURIComponent(key)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to load baseline artifacts: ${response.status}`);
    }
    
    const data = await response.json();
    return data.bundle || null;
  }
  
  /**
   * Delete from server
   * @private
   */
  async deleteFromServer(key) {
    const response = await fetch(`/api/baseline-artifacts?key=${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });
    
    return response.ok;
  }
  
  /**
   * Set storage backend
   * @param {string} backend - Backend type ('memory', 'indexedDB', 'server')
   */
  setStorageBackend(backend) {
    if (!['memory', 'indexedDB', 'server'].includes(backend)) {
      throw new Error(`Invalid storage backend: ${backend}`);
    }
    
    this.storageBackend = backend;
    logger.info('Storage backend changed', { backend }, '⚙️');
  }
  
  /**
   * Create baseline bundle from generation result
   * @param {Object} params - Parameters
   * @returns {Object} Baseline artifact bundle
   */
  createBundleFromGenerationResult(params) {
    const {
      designId,
      sheetId,
      sheetResult,
      dna,
      siteSnapshot,
      layout,
      seed,
      basePrompt,
      consistencyLocks
    } = params;
    
    // Compute panel coordinates
    const panelCoordinates = computePanelCoordinates(
      layout,
      sheetResult.metadata.width,
      sheetResult.metadata.height
    );
    
    // Create bundle
    return createBaselineArtifactBundle({
      designId,
      sheetId,
      baselineImageUrl: sheetResult.url,
      siteSnapshotUrl: siteSnapshot?.dataUrl || null,
      baselineDNA: dna,
      baselineLayout: {
        panelCoordinates,
        layoutKey: layout.name,
        sheetWidth: sheetResult.metadata.width,
        sheetHeight: sheetResult.metadata.height
      },
      seed,
      model: sheetResult.metadata.model,
      dnaHash: sheetResult.metadata.dnaHash || '',
      layoutHash: hashLayout(panelCoordinates),
      width: sheetResult.metadata.width,
      height: sheetResult.metadata.height,
      a1LayoutKey: sheetResult.metadata.a1LayoutKey,
      seeds: {
        base: seed,
        // Add per-panel seeds if available
        ...(sheetResult.metadata.seedMap || {})
      },
      basePrompt,
      consistencyLocks: consistencyLocks || null, // 🆕 Store consistency locks
      metadata: {
        generatedAt: new Date().toISOString(),
        workflow: sheetResult.workflow,
        consistencyScore: sheetResult.consistencyScore
      }
    });
  }
  
  /**
   * Validate baseline consistency before saving
   * @param {Object} bundle - Baseline bundle
   * @returns {Promise<Object>} Validation result
   */
  async validateBaselineConsistency(bundle) {
    logger.info('Validating baseline consistency', { designId: bundle.designId }, '🔍');
    
    if (!bundle.consistencyLocks) {
      logger.warn('No consistency locks found in bundle', null, '⚠️');
      return {
        valid: true,
        warnings: ['No consistency locks to validate against']
      };
    }
    
    // Validate consistency
    const validationResult = await validateA1SheetConsistency({
      generatedImageUrl: bundle.baselineImageUrl,
      masterDNA: bundle.baselineDNA,
      consistencyLocks: bundle.consistencyLocks,
      strictMode: true
    });
    
    // Generate report
    const report = generateConsistencyReport(validationResult);
    logger.info('Consistency validation report', { report });
    
    return validationResult;
  }
  
  /**
   * Save baseline with consistency validation
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Save result with validation
   */
  async saveBaselineWithValidation({ designId, sheetId, bundle }) {
    // Validate consistency first
    const validationResult = await this.validateBaselineConsistency(bundle);
    
    if (!validationResult.valid) {
      logger.error('Baseline failed consistency validation', {
        errors: validationResult.errors,
        score: validationResult.consistencyScore
      });
      
      throw new Error(`Baseline failed consistency validation: ${validationResult.errors.join(', ')}`);
    }
    
    // Save baseline
    const baselineKey = await this.saveBaselineArtifacts({ designId, sheetId, bundle });
    
    return {
      baselineKey,
      validationResult
    };
  }
}

/**
 * Hash layout for deterministic identification
 * @private
 */
function hashLayout(panelCoordinates) {
  const hashInput = JSON.stringify(
    panelCoordinates.map(p => ({ id: p.id, x: p.x, y: p.y, w: p.width, h: p.height }))
  );
  
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

// Export singleton instance
const baselineArtifactStore = new BaselineArtifactStore();
export default baselineArtifactStore;
export { BaselineArtifactStore };

