/**
 * DebugRunRecorder - Captures real runtime data during generation
 *
 * This service records actual values (not templates) from generation runs.
 * It creates a DEBUG_REPORT.json with real prompts, seeds, control images, etc.
 *
 * ACTIVATION: Set ARCHIAI_DEBUG=1 in environment to enable debug capture.
 *   - Node.js: ARCHIAI_DEBUG=1 node scripts/test-generation.js
 *   - Browser: Set window.ARCHIAI_DEBUG = true before generation
 *
 * OUTPUT: Creates debug_runs/<runId>/DEBUG_REPORT.json with:
 *   - runMetadata (designId, buildingType, timestamp, elapsedMs)
 *   - featureFlags snapshot
 *   - modelRouter choices per task
 *   - baseSeed and per-panel seeds
 *   - FULL prompt text for each panel
 *   - control image source per panel (conditioned/meshy/fgl/geometry) + strength + hash
 *   - final output URL per panel + width/height + provider metadata
 *   - cache keys and cache hit/miss per panel
 *   - validation results per panel
 *
 * Usage:
 *   import debugRecorder from './debug/DebugRunRecorder.js';
 *   const runId = debugRecorder.startRun({ designId, buildingType });
 *   debugRecorder.recordStep('dna_generation', { masterDNA });
 *   debugRecorder.recordPanel('hero_3d', { prompt, seed, controlImage, ... });
 *   debugRecorder.finishRun({ status: 'success' });
 *
 * @module services/debug/DebugRunRecorder
 */

// Node.js 'module' import is handled conditionally below
import { isFeatureEnabled, getAllFeatureFlags } from '../../config/featureFlags.js';
import {
  normalizeToCanonical,
  assertValidPanelType,
  ALL_PANEL_TYPES,
} from '../../config/panelRegistry.js';
import logger from '../core/logger.js';

// Detect environment (browser vs Node.js)
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Create require for Node.js built-in modules (only in Node.js environment)
// In browser, this will be null and fs operations will be skipped
let _require = null;
if (isNode) {
  try {
    // Dynamic import to avoid browser bundler errors
    // eslint-disable-next-line no-undef
    _require = typeof require !== 'undefined' ? require : null;
  } catch (e) {
    // Browser environment - require not available
    _require = null;
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEBUG_REPORT_VERSION = '2.1.0';
const DEBUG_RUNS_DIR = 'debug_runs';

/**
 * Check if debug capture is enabled via environment variable
 * - Node.js: process.env.ARCHIAI_DEBUG === '1'
 * - Browser: window.ARCHIAI_DEBUG === true or sessionStorage has ARCHIAI_DEBUG
 *
 * @returns {boolean} True if debug capture is enabled
 */
function isDebugEnabled() {
  // Node.js environment
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.ARCHIAI_DEBUG === '1' || process.env.ARCHIAI_DEBUG === 'true') {
      return true;
    }
  }

  // Browser environment
  if (typeof window !== 'undefined') {
    if (window.ARCHIAI_DEBUG === true || window.ARCHIAI_DEBUG === '1') {
      return true;
    }
    try {
      const sessionFlag = sessionStorage.getItem('ARCHIAI_DEBUG');
      if (sessionFlag === '1' || sessionFlag === 'true') {
        return true;
      }
    } catch (e) {
      // sessionStorage not available
    }
  }

  return false;
}

/**
 * Generate a unique run ID
 */
function generateRunId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Create slug from building type
 */
function createSlug(buildingType) {
  return (buildingType || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .substring(0, 30);
}

/**
 * Simple hash function for strings (for control image hashes)
 */
function simpleHash(str) {
  if (!str) {return null;}
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// =============================================================================
// DEBUG RUN RECORDER CLASS
// =============================================================================

class DebugRunRecorder {
  constructor() {
    this.currentRun = null;
    this._checkEnabled(); // Set initial enabled state from env var
    this.writeToFileSystem = typeof window === 'undefined'; // Only in Node.js
  }

  /**
   * Check and update enabled state from environment variable
   * Called on construction and can be called to refresh
   */
  _checkEnabled() {
    this.isEnabled = isDebugEnabled();
    if (this.isEnabled) {
      logger.info('📊 [DebugRunRecorder] Debug capture ENABLED (ARCHIAI_DEBUG=1)');
    }
  }

  /**
   * Check if debug is currently enabled (reads from env each time)
   * This allows runtime toggling in browser via window.ARCHIAI_DEBUG
   */
  shouldRecord() {
    // Re-check env var each time for dynamic toggling
    return isDebugEnabled();
  }

  /**
   * Start a new debug run
   *
   * @param {Object} params
   * @param {string} params.designId - Design identifier
   * @param {string} params.buildingType - Building type being generated
   * @param {Object} params.userSelection - Full user selection object
   * @returns {string} runId
   */
  startRun({ designId, buildingType, userSelection = {} }) {
    // Re-check env var on each run start (allows dynamic toggling)
    if (!this.shouldRecord()) {
      return null;
    }

    const runId = generateRunId();
    const slug = createSlug(buildingType);
    const timestamp = new Date().toISOString();

    this.currentRun = {
      _version: DEBUG_REPORT_VERSION,
      _capturedAt: timestamp,
      _isRealData: true, // Flag to distinguish from templates

      runId,
      designId: designId || `design_${runId}`,
      directoryName: `debug_${slug}_${runId}`,

      metadata: {
        designId: designId || `design_${runId}`,
        designFingerprint: `fp_${designId || runId}`,
        timestamp,
        buildingType,
        userSelection: {
          buildingType: userSelection.buildingType || buildingType,
          totalArea: userSelection.totalArea || null,
          levels: userSelection.levels || userSelection.floorCount || null,
          location: userSelection.location || null,
          ...userSelection,
        },
        issue: null, // Will be set if errors occur
      },

      featureFlags: this._captureFeatureFlags(),

      modelRouter: {
        dnaGeneration: { model: null, provider: null },
        imageGeneration: { model: null, provider: null },
        reasoning: { model: null, provider: null },
      },

      seeds: {
        baseSeed: null,
        derivationFormula: 'baseSeed + (panelIndex * 137) % 1000000',
        panelSeeds: {},
      },

      dnaGeneration: {
        masterDNA: null,
        cacheKey: null,
        cacheHit: false,
        generatedAt: null,
        durationMs: null,
      },

      panels: {},

      baselineCache: {
        cacheKey: null,
        cacheHit: false,
        viewsRetrieved: [],
        viewsGenerated: [],
      },

      a1Compose: {
        slotMapping: {},
        startedAt: null,
        completedAt: null,
        durationMs: null,
      },

      controlImageReport: {
        totalPanels: 0,
        withControlImage: 0,
        withoutControlImage: 0,
        retriedPanels: 0,
        panelDetails: {},
      },

      // QA Results - Image metrics comparison (pHash, SSIM, pixelmatch)
      qaResults: {
        timestamp: null,
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          errors: 0,
          passRate: 0,
        },
        table: [], // Array of QAResult objects
      },

      // Canonical Control Pack (CCP) - MANDATORY control images
      canonicalControlPack: {
        designFingerprint: null,
        source: null, // 'geometry' | 'meshy' | 'baseline'
        generatedAt: null,
        panelCount: 0,
        panels: {}, // { panelType: { url, path, source, hash, svgRendered } }
        validation: {
          valid: false,
          missingPanels: [],
          presentPanels: [],
        },
      },

      // Blankness Detection Report (for technical drawings)
      blanknessReport: {
        timestamp: null,
        summary: {
          total: 0,
          checked: 0,
          passed: 0,
          blank: 0,
          blankPanels: [],
          passRate: 0,
        },
        details: {}, // { panelType: { whiteRatio, blackRatio, isBlank, regenerated } }
      },

      timing: {
        startedAt: timestamp,
        completedAt: null,
        totalDurationMs: null,
        stepDurations: {},
      },

      errors: [],
      warnings: [],
      steps: [],
    };

    logger.info(`\n📊 DEBUG RUN STARTED: ${runId}`);
    logger.info(`   Directory: debug_${slug}_${runId}`);

    return runId;
  }

  /**
   * Capture current feature flags snapshot
   */
  _captureFeatureFlags() {
    try {
      const flags = getAllFeatureFlags ? getAllFeatureFlags() : {};
      return {
        ...flags,
        _capturedAt: new Date().toISOString(),
      };
    } catch (e) {
      return { _error: 'Failed to capture feature flags' };
    }
  }

  /**
   * Record a pipeline step
   *
   * @param {string} stepName - Name of the step
   * @param {Object} payload - Step data
   */
  recordStep(stepName, payload = {}) {
    if (!this.currentRun) {
      return;
    }

    const step = {
      name: stepName,
      timestamp: new Date().toISOString(),
      durationMs: payload.durationMs || null,
      ...payload,
    };

    this.currentRun.steps.push(step);

    // Handle specific step types
    switch (stepName) {
      case 'dna_generation_start':
        this.currentRun.dnaGeneration.startedAt = step.timestamp;
        break;

      case 'dna_generation_complete':
        this.currentRun.dnaGeneration.completedAt = step.timestamp;
        this.currentRun.dnaGeneration.durationMs = payload.durationMs;
        if (payload.masterDNA) {
          this.currentRun.dnaGeneration.masterDNA = payload.masterDNA;
        }
        if (payload.cacheKey) {
          this.currentRun.dnaGeneration.cacheKey = payload.cacheKey;
        }
        if (payload.cacheHit !== undefined) {
          this.currentRun.dnaGeneration.cacheHit = payload.cacheHit;
        }
        break;

      case 'model_router_choice':
        if (payload.task && payload.model) {
          this.currentRun.modelRouter[payload.task] = {
            model: payload.model,
            provider: payload.provider || 'together.ai',
          };
        }
        break;

      case 'seed_derivation':
        if (payload.baseSeed !== undefined) {
          this.currentRun.seeds.baseSeed = payload.baseSeed;
        }
        if (payload.panelSeeds) {
          this.currentRun.seeds.panelSeeds = {
            ...this.currentRun.seeds.panelSeeds,
            ...payload.panelSeeds,
          };
        }
        break;

      case 'baseline_cache_check':
        this.currentRun.baselineCache.cacheKey = payload.cacheKey || null;
        this.currentRun.baselineCache.cacheHit = payload.cacheHit || false;
        if (payload.viewsRetrieved) {
          this.currentRun.baselineCache.viewsRetrieved = payload.viewsRetrieved;
        }
        if (payload.viewsGenerated) {
          this.currentRun.baselineCache.viewsGenerated = payload.viewsGenerated;
        }
        break;

      case 'a1_compose_start':
        this.currentRun.a1Compose.startedAt = step.timestamp;
        break;

      case 'a1_compose_complete':
        this.currentRun.a1Compose.completedAt = step.timestamp;
        this.currentRun.a1Compose.durationMs = payload.durationMs;
        if (payload.slotMapping) {
          this.currentRun.a1Compose.slotMapping = payload.slotMapping;
        }
        break;

      default:
        // Generic step recording
        if (payload.durationMs) {
          this.currentRun.timing.stepDurations[stepName] = payload.durationMs;
        }
    }
  }

  /**
   * Record a panel generation
   *
   * @param {string} panelKey - Panel identifier (e.g., 'hero_3d', 'elevation_north')
   * @param {Object} data - Panel generation data
   */
  recordPanel(panelKey, data = {}) {
    if (!this.currentRun) {
      return;
    }

    // PANEL_REGISTRY: Normalize panel key to canonical form
    const originalKey = panelKey;
    const canonicalKey = normalizeToCanonical(panelKey);
    if (!canonicalKey) {
      logger.warn(`[DebugRunRecorder] Unknown panel type "${panelKey}" - recording as-is`);
    } else if (canonicalKey !== originalKey) {
      logger.debug(`[DebugRunRecorder] Normalized panel "${originalKey}" → "${canonicalKey}"`);
    }
    // Use canonical key if available, otherwise use original
    panelKey = canonicalKey || panelKey;

    // Compute control image hash if URL/dataUrl provided
    const controlImageHash = data.controlImageUrl
      ? simpleHash(data.controlImageUrl.substring(0, 1000))
      : null;

    const panelRecord = {
      panelIndex: data.panelIndex ?? Object.keys(this.currentRun.panels).length,
      seed: data.seed ?? null,

      prompt: {
        full: data.prompt || null,
        length: data.prompt ? data.prompt.length : 0,
        // Keep full prompt for real debugging (no truncation in actual report)
      },

      negativePrompt: data.negativePrompt || null,

      controlImage: {
        used: data.controlImageUsed ?? false,
        source: data.controlImageSource || 'none',
        strength: data.controlStrength ?? null,
        strengthBand: data.strengthBand || 'initial',
        retryAttempt: data.retryAttempt ?? 0,
        hash: controlImageHash,
        urlPreview: data.controlImageUrl
          ? data.controlImageUrl.substring(0, 150) +
            (data.controlImageUrl.length > 150 ? '...' : '')
          : null,
        urlLength: data.controlImageUrl ? data.controlImageUrl.length : 0,
      },

      // Canonical control image (MANDATORY for hero_3d/interior_3d - strict mode)
      // ACCEPTANCE: hero/interior panels show controlSource=canonical and sha256 matches canonical pack
      canonicalControl: {
        url: data.canonicalControlUrl || null,
        // REQUIRED: controlImagePath for DEBUG_REPORT
        path: data.canonicalControlPath || data.controlImagePath || null,
        source: data.canonicalControlSource || (data.isCanonicalControl ? 'canonical' : 'none'),
        svgRendered: data.canonicalSvgRendered ?? false,
        hash: data.canonicalControlUrl
          ? simpleHash(data.canonicalControlUrl.substring(0, 1000))
          : null,
        // REQUIRED: controlImageSha256 for DEBUG_REPORT
        controlImageSha256: data.canonicalControlSha256 || data.controlImageSha256 || null,
        // REQUIRED: canonicalFingerprint for DEBUG_REPORT
        canonicalFingerprint: data.canonicalFingerprint || null,
        // Design fingerprint - must match canonical pack
        designFingerprint: data.designFingerprint || null,
        // Flag for acceptance criteria: must be true for hero_3d/interior_3d
        isCanonical: data.isCanonicalControl ?? false,
        verified:
          data.canonicalVerified ??
          (data.isCanonicalControl && data.canonicalFingerprint ? true : false),
      },

      // Blankness detection (for technical drawings)
      blankness: {
        checked: data.blanknessChecked ?? false,
        isBlank: data.isBlank ?? false,
        blanknessScore: data.blanknessScore ?? null, // 0-1, higher = more blank
        whiteRatio: data.whiteRatio ?? null,
        blackRatio: data.blackRatio ?? null,
        verdict: data.blanknessVerdict || null, // 'BLANK' | 'OK' | 'ERROR' | null
        regenerated: data.blankRegenerated ?? false, // True if regenerated due to blankness
      },

      generation: {
        model: data.model || 'black-forest-labs/FLUX.1-dev',
        provider: data.provider || 'together.ai',
        width: data.width ?? null,
        height: data.height ?? null,
        steps: data.steps ?? null,
        startedAt: data.startedAt || null,
        completedAt: data.completedAt || null,
        durationMs: data.durationMs ?? null,
      },

      result: {
        success: data.success ?? null,
        imageUrl: data.imageUrl || null,
        imageUrlPreview: data.imageUrl
          ? data.imageUrl.substring(0, 150) + (data.imageUrl.length > 150 ? '...' : '')
          : null,
        imageUrlLength: data.imageUrl ? data.imageUrl.length : 0,
        error: data.error || null,
      },

      validation: {
        passed: data.validationPassed ?? null,
        score: data.validationScore ?? null,
        issues: data.validationIssues || [],
      },

      // Control Fidelity Results (MANDATORY for DEBUG_REPORT)
      // Shows output vs control image comparison metrics
      controlFidelity: {
        checked:
          data.controlFidelityChecked ??
          data.controlFidelity?.checked ??
          (data.fidelityStatus !== undefined && data.fidelityStatus !== 'NOT_CHECKED'),
        // Accept multiple naming conventions for flexibility
        diffRatio:
          data.diffRatio ?? data.fidelityDiffRatio ?? data.controlFidelity?.diffRatio ?? null,
        similarityScore:
          data.similarityScore ??
          data.fidelitySimilarity ??
          data.controlFidelity?.similarityScore ??
          null,
        threshold: data.fidelityThreshold ?? data.controlFidelity?.threshold ?? null,
        status: data.fidelityStatus ?? data.controlFidelity?.status ?? 'UNCHECKED', // PASS | FAIL | RETRY | CONTROL_FALLBACK | UNCHECKED
        retryCount: data.fidelityRetryCount ?? data.controlFidelity?.retryCount ?? 0,
        strengthUsed:
          data.fidelityStrengthUsed ??
          data.controlFidelity?.strengthUsed ??
          data.controlStrength ??
          null,
        fallbackUsed: data.fidelityFallbackUsed ?? data.controlFidelity?.fallbackUsed ?? false,
      },

      // Overall panel generation status
      status: data.panelStatus || (data.success ? 'SUCCESS' : data.error ? 'ERROR' : 'UNKNOWN'),

      cache: {
        key: data.cacheKey || null,
        hit: data.cacheHit ?? false,
      },
    };

    this.currentRun.panels[panelKey] = panelRecord;

    // Update control image report
    this.currentRun.controlImageReport.totalPanels++;
    if (data.controlImageUsed) {
      this.currentRun.controlImageReport.withControlImage++;
    } else {
      this.currentRun.controlImageReport.withoutControlImage++;
    }
    if (data.retryAttempt > 0) {
      this.currentRun.controlImageReport.retriedPanels++;
    }
    this.currentRun.controlImageReport.panelDetails[panelKey] = {
      controlUsed: data.controlImageUsed ?? false,
      controlSource: data.controlImageSource || 'none',
      controlStrength: data.controlStrength ?? null,
      retries: data.retryAttempt ?? 0,
    };

    // Record seed
    if (data.seed !== undefined) {
      this.currentRun.seeds.panelSeeds[panelKey] = data.seed;
    }

    logger.debug(
      `   📝 Recorded panel: ${panelKey} (seed: ${data.seed}, control: ${data.controlImageSource || 'none'})`
    );
  }

  /**
   * Record an error
   */
  recordError(error, context = {}) {
    if (!this.currentRun) {
      return;
    }

    this.currentRun.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      code: error.code || null,
      stack: error.stack || null,
      context,
    });

    if (!this.currentRun.metadata.issue) {
      this.currentRun.metadata.issue = error.message || String(error);
    }
  }

  /**
   * Record a warning
   */
  recordWarning(message, context = {}) {
    if (!this.currentRun) {
      return;
    }

    this.currentRun.warnings.push({
      timestamp: new Date().toISOString(),
      message,
      context,
    });
  }

  /**
   * Record Canonical Control Pack (CCP)
   *
   * @param {Object} ccpData - Canonical control pack data
   * @param {string} ccpData.designFingerprint - Design fingerprint
   * @param {string} ccpData.source - Primary source ('geometry'|'meshy'|'baseline')
   * @param {Object} ccpData.controlImages - Map of panelType to control image data
   * @param {Object} ccpData.validation - Validation result
   */
  recordCanonicalControlPack(ccpData) {
    if (!this.currentRun) {
      return;
    }

    const { designFingerprint, source, controlImages = {}, validation = {} } = ccpData;

    this.currentRun.canonicalControlPack = {
      designFingerprint,
      source,
      generatedAt: new Date().toISOString(),
      panelCount: Object.keys(controlImages).length,
      panels: {},
      validation: {
        valid: validation.valid ?? Object.keys(controlImages).length > 0,
        missingPanels: validation.missingPanels || [],
        presentPanels: validation.presentPanels || Object.keys(controlImages),
      },
    };

    // Record each panel's canonical control
    for (const [panelType, control] of Object.entries(controlImages)) {
      this.currentRun.canonicalControlPack.panels[panelType] = {
        url: control.url || control.dataUrl || null,
        path: control.path || null,
        source: control.source || source || 'unknown',
        hash: control.hash || (control.url ? simpleHash(control.url.substring(0, 1000)) : null),
        svgRendered: control.svgRendered ?? false,
        strength: control.strength ?? null,
        viewType: control.viewType || null,
        dimensions: control.dimensions || null,
      };
    }

    logger.info(
      `📋 [DebugRunRecorder] Recorded CCP: ${Object.keys(controlImages).length} canonical controls (source: ${source})`
    );
  }

  /**
   * Record Blankness Detection Results
   *
   * @param {Object} blanknessData - Blankness detection results
   * @param {Array} blanknessData.results - Individual panel results
   * @param {Object} blanknessData.summary - Summary with counts
   */
  recordBlanknessReport(blanknessData) {
    if (!this.currentRun) {
      return;
    }

    const { results = [], summary = {} } = blanknessData;

    this.currentRun.blanknessReport = {
      timestamp: new Date().toISOString(),
      summary: {
        total: summary.total || results.length,
        checked: summary.checked || results.filter((r) => r.checked).length,
        passed: summary.passed || results.filter((r) => r.pass).length,
        blank: summary.blank || results.filter((r) => r.isBlank).length,
        blankPanels:
          summary.blankPanels || results.filter((r) => r.isBlank).map((r) => r.panelType),
        passRate:
          summary.passRate ||
          (results.length > 0 ? results.filter((r) => r.pass).length / results.length : 1),
      },
      details: {},
    };

    // Record each panel's blankness details
    for (const r of results) {
      if (r.checked) {
        this.currentRun.blanknessReport.details[r.panelType] = {
          whiteRatio: r.whiteRatio ?? null,
          blackRatio: r.blackRatio ?? null,
          blanknessScore: r.blanknessScore ?? null,
          isBlank: r.isBlank ?? false,
          verdict: r.verdict || 'OK',
          regenerated: r.regenerated ?? false,
        };
      }
    }

    // Log blankness table
    if (results.some((r) => r.checked)) {
      logger.info('\n' + '='.repeat(70));
      logger.info('BLANKNESS DETECTION - Technical Drawings');
      logger.info('='.repeat(70));
      logger.info('| Panel Type           | White% | Black% | Blank? | Status |');
      logger.info('|----------------------|--------|--------|--------|--------|');

      for (const r of results.filter((r) => r.checked)) {
        const type = (r.panelType || 'unknown').padEnd(20);
        const white =
          r.whiteRatio !== undefined
            ? (r.whiteRatio * 100).toFixed(1).padStart(6) + '%'
            : '  ERROR';
        const black =
          r.blackRatio !== undefined
            ? (r.blackRatio * 100).toFixed(1).padStart(6) + '%'
            : '  ERROR';
        const blank = r.isBlank ? '  YES ' : '   NO ';
        const status = r.error ? ' ERROR' : r.pass ? '  PASS' : '  FAIL';
        logger.info(`| ${type} | ${white} | ${black} | ${blank} | ${status} |`);
      }

      logger.info('='.repeat(70));
      const summary = this.currentRun.blanknessReport.summary;
      logger.info(
        `Summary: ${summary.passed}/${summary.checked} passed, ${summary.blank} blank panels detected`
      );
      if (summary.blankPanels.length > 0) {
        logger.warn(`Blank panels: ${summary.blankPanels.join(', ')}`);
      }
      logger.info('='.repeat(70) + '\n');
    }
  }

  /**
   * Record QA results from image metrics comparison
   *
   * @param {Object} qaData - QA results from ImageMetricsService
   * @param {Array<QAResult>} qaData.results - Individual panel QA results
   * @param {Object} qaData.summary - Summary with pass/fail counts
   */
  recordQAResults(qaData) {
    if (!this.currentRun) {
      return;
    }

    const { results = [], summary = {} } = qaData;

    this.currentRun.qaResults = {
      timestamp: new Date().toISOString(),
      summary: {
        total: summary.total || results.length,
        passed: summary.passed || results.filter((r) => r.pass).length,
        failed: summary.failed || results.filter((r) => !r.pass && !r.error).length,
        errors: summary.errors || results.filter((r) => r.error).length,
        passRate:
          summary.passRate ||
          (results.length > 0 ? results.filter((r) => r.pass).length / results.length : 0),
      },
      table: results.map((r) => ({
        panelType: r.panelType,
        category: r.category || 'unknown',
        ssim: r.metrics?.ssim ?? null,
        pHashDistance: r.metrics?.pHashDistance ?? null,
        pHashSimilarity: r.metrics?.pHashSimilarity ?? null,
        pixelDiffRatio: r.metrics?.pixelDiffRatio ?? null,
        thresholds: r.thresholds || {},
        checks: r.checks || {},
        pass: r.pass,
        error: r.error || null,
      })),
    };

    // Log formatted QA table
    logger.info('\n' + '='.repeat(80));
    logger.info('QA TABLE - Image Metrics Comparison');
    logger.info('='.repeat(80));
    logger.info('| Panel Type           | SSIM   | pHash Dist | Diff Ratio | Status |');
    logger.info('|----------------------|--------|------------|------------|--------|');

    for (const r of this.currentRun.qaResults.table) {
      const type = (r.panelType || 'unknown').padEnd(20);
      const ssim = r.ssim !== null ? r.ssim.toFixed(3).padStart(6) : ' ERROR';
      const pHash = r.pHashDistance !== null ? String(r.pHashDistance).padStart(10) : '     ERROR';
      const diff =
        r.pixelDiffRatio !== null ? r.pixelDiffRatio.toFixed(3).padStart(10) : '     ERROR';
      const status = r.error ? ' ERROR' : r.pass ? ' PASS ' : ' FAIL ';
      logger.info(`| ${type} | ${ssim} | ${pHash} | ${diff} | ${status} |`);
    }

    logger.info('='.repeat(80));
    logger.info(
      `Summary: ${this.currentRun.qaResults.summary.passed}/${this.currentRun.qaResults.summary.total} passed (${(this.currentRun.qaResults.summary.passRate * 100).toFixed(1)}%)`
    );
    logger.info('='.repeat(80) + '\n');
  }

  /**
   * Finish the run and generate the report
   *
   * @param {Object} params
   * @param {string} params.status - 'success' | 'failed' | 'partial'
   * @param {Object} params.result - Final result object
   * @returns {Object} The complete debug report
   */
  finishRun({ status = 'success', result = null } = {}) {
    if (!this.currentRun) {
      return null;
    }

    const completedAt = new Date().toISOString();
    const startTime = new Date(this.currentRun.timing.startedAt).getTime();
    const endTime = new Date(completedAt).getTime();

    this.currentRun.timing.completedAt = completedAt;
    this.currentRun.timing.totalDurationMs = endTime - startTime;
    this.currentRun.status = status;

    if (result) {
      this.currentRun.result = {
        a1SheetUrl: result.a1Sheet?.url || result.imageUrl || null,
        panelCount: Object.keys(this.currentRun.panels).length,
        consistencyScore: result.consistency?.score || null,
      };
    }

    // Calculate compliance score
    const total = this.currentRun.controlImageReport.totalPanels;
    const withControl = this.currentRun.controlImageReport.withControlImage;
    this.currentRun.controlImageReport.complianceScore =
      total > 0 ? ((withControl / total) * 100).toFixed(1) + '%' : 'N/A';

    const report = { ...this.currentRun };

    logger.info(`\n📊 DEBUG RUN COMPLETED: ${this.currentRun.runId}`);
    logger.info(`   Status: ${status}`);
    logger.info(`   Duration: ${this.currentRun.timing.totalDurationMs}ms`);
    logger.info(`   Panels: ${Object.keys(this.currentRun.panels).length}`);
    logger.info(
      `   Control Image Compliance: ${this.currentRun.controlImageReport.complianceScore}`
    );

    // Try to write to filesystem if in Node.js environment
    if (this.writeToFileSystem) {
      this._writeToFileSystem(report);
    }

    // Store in memory for browser download
    this.lastCompletedRun = report;

    // Clear current run
    this.currentRun = null;

    return report;
  }

  /**
   * Write report to filesystem (Node.js only)
   * Creates: debug_runs/<runId>/DEBUG_REPORT.json
   */
  _writeToFileSystem(report) {
    try {
      // Only available in Node.js environment
      if (!_require) {
        logger.debug('[DebugRunRecorder] _writeToFileSystem skipped - not in Node.js environment');
        return;
      }

      // Use _require for Node.js built-in modules
      const fs = _require('fs');
      const path = _require('path');

      // Use runId as the directory name for clear organization
      const dirName = report.runId || report.directoryName || `run_${Date.now()}`;
      const debugDir = path.join(process.cwd(), DEBUG_RUNS_DIR, dirName);

      // Create directory recursively
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      // Write main report
      const reportPath = path.join(debugDir, 'DEBUG_REPORT.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      // Also write a summary file with key metrics
      const summaryPath = path.join(debugDir, 'SUMMARY.txt');
      const summary = this._generateSummary(report);
      fs.writeFileSync(summaryPath, summary);

      logger.success(`\n📁 Debug report written to: ${reportPath}`);
      logger.info(`   📊 Summary: ${summaryPath}`);
      logger.info(`   📂 Directory: ${debugDir}`);

      return reportPath;
    } catch (e) {
      // Filesystem not available (browser environment) or other error
      logger.debug('   Filesystem write not available:', e.message);
      return null;
    }
  }

  /**
   * Generate human-readable summary text
   */
  _generateSummary(report) {
    const lines = [
      '='.repeat(60),
      'ARCHIAI DEBUG RUN SUMMARY',
      '='.repeat(60),
      '',
      `Run ID: ${report.runId}`,
      `Design ID: ${report.metadata?.designId || 'N/A'}`,
      `Building Type: ${report.metadata?.buildingType || 'N/A'}`,
      `Timestamp: ${report.metadata?.timestamp || report._capturedAt}`,
      `Total Duration: ${report.timing?.totalDurationMs || 'N/A'}ms`,
      `Status: ${report.status || 'unknown'}`,
      '',
      '-'.repeat(40),
      'SEEDS',
      '-'.repeat(40),
      `Base Seed: ${report.seeds?.baseSeed || 'N/A'}`,
      `Panel Seeds: ${Object.keys(report.seeds?.panelSeeds || {}).length} panels`,
      '',
      '-'.repeat(40),
      'PANELS',
      '-'.repeat(40),
    ];

    const panels = report.panels || {};
    Object.entries(panels).forEach(([key, panel]) => {
      const statusEmoji = panel.result?.success ? '✅' : '❌';
      const controlSource = panel.controlImage?.source || 'none';
      const strength = panel.controlImage?.strength
        ? panel.controlImage.strength.toFixed(2)
        : 'N/A';
      const controlHash = panel.controlImage?.hash || 'none';
      const diffRatio =
        panel.controlFidelity?.diffRatio !== null
          ? panel.controlFidelity.diffRatio.toFixed(3)
          : 'N/A';
      const fidelityStatus = panel.controlFidelity?.status || 'UNCHECKED';
      const panelStatus = panel.status || 'UNKNOWN';

      lines.push(
        `${statusEmoji} ${key}:`,
        `   Seed: ${panel.seed || 'N/A'}`,
        `   Control: ${controlSource} (strength: ${strength})`,
        `   Control Hash: ${controlHash}`,
        `   Diff Ratio: ${diffRatio}`,
        `   Fidelity Status: ${fidelityStatus}`,
        `   Panel Status: ${panelStatus}`,
        `   Duration: ${panel.generation?.durationMs || 'N/A'}ms`,
        ''
      );
    });

    lines.push(
      '-'.repeat(40),
      'CONTROL IMAGE REPORT',
      '-'.repeat(40),
      `Total Panels: ${report.controlImageReport?.totalPanels || 0}`,
      `With Control: ${report.controlImageReport?.withControlImage || 0}`,
      `Without Control: ${report.controlImageReport?.withoutControlImage || 0}`,
      `Retried: ${report.controlImageReport?.retriedPanels || 0}`,
      `Compliance: ${report.controlImageReport?.complianceScore || 'N/A'}`,
      ''
    );

    // Control Fidelity Summary (NEW - required fields per user)
    const fidelitySummary = { total: 0, passed: 0, failed: 0, unchecked: 0 };
    Object.values(panels).forEach((panel) => {
      const fidelity = panel.controlFidelity;
      if (fidelity?.checked) {
        fidelitySummary.total++;
        if (fidelity.status === 'PASS' || fidelity.status === 'CONTROL_FALLBACK') {
          fidelitySummary.passed++;
        } else if (fidelity.status === 'FAIL') {
          fidelitySummary.failed++;
        }
      } else {
        fidelitySummary.unchecked++;
      }
    });

    lines.push(
      '-'.repeat(40),
      'CONTROL FIDELITY SUMMARY (OUTPUT vs CONTROL)',
      '-'.repeat(40),
      `Total Checked: ${fidelitySummary.total}`,
      `Passed: ${fidelitySummary.passed}`,
      `Failed: ${fidelitySummary.failed}`,
      `Unchecked: ${fidelitySummary.unchecked}`,
      `Pass Rate: ${fidelitySummary.total > 0 ? ((fidelitySummary.passed / fidelitySummary.total) * 100).toFixed(1) + '%' : 'N/A'}`,
      '',
      '-'.repeat(40),
      'ERRORS',
      '-'.repeat(40),
      `Total Errors: ${report.errors?.length || 0}`
    );

    if (report.errors?.length > 0) {
      report.errors.forEach((err, i) => {
        lines.push(`  ${i + 1}. ${err.message}`);
      });
    }

    // QA Results section
    if (report.qaResults?.table?.length > 0) {
      lines.push('', '-'.repeat(40), 'QA RESULTS - IMAGE METRICS', '-'.repeat(40));
      lines.push('Panel Type           | SSIM   | pHash | DiffRatio | Status');
      lines.push('-'.repeat(60));
      for (const r of report.qaResults.table) {
        const type = (r.panelType || 'unknown').padEnd(20);
        const ssim = r.ssim !== null ? r.ssim.toFixed(3).padStart(6) : 'ERROR ';
        const pHash = r.pHashDistance !== null ? String(r.pHashDistance).padStart(5) : 'ERROR';
        const diff =
          r.pixelDiffRatio !== null ? r.pixelDiffRatio.toFixed(3).padStart(9) : '   ERROR ';
        const status = r.error ? 'ERROR' : r.pass ? 'PASS' : 'FAIL';
        lines.push(`${type} | ${ssim} | ${pHash} | ${diff} | ${status}`);
      }
      lines.push('-'.repeat(60));
      const summary = report.qaResults.summary || {};
      lines.push(
        `Summary: ${summary.passed || 0}/${summary.total || 0} passed (${((summary.passRate || 0) * 100).toFixed(1)}%)`
      );
    }

    lines.push('', '='.repeat(60));
    return lines.join('\n');
  }

  /**
   * Get the current run ID
   */
  getRunId() {
    return this.currentRun?.runId || null;
  }

  /**
   * Get the current report (for download in browser)
   */
  getCurrentReport() {
    return this.currentRun || this.lastCompletedRun || null;
  }

  /**
   * Get report as downloadable blob
   */
  getReportAsBlob() {
    const report = this.getCurrentReport();
    if (!report) {
      return null;
    }

    const json = JSON.stringify(report, null, 2);
    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Get report download URL
   */
  getReportDownloadUrl() {
    const blob = this.getReportAsBlob();
    if (!blob) {
      return null;
    }
    return URL.createObjectURL(blob);
  }

  /**
   * Check if recording is in progress
   */
  isRecording() {
    return this.currentRun !== null;
  }

  /**
   * Enable/disable recording
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

const debugRecorder = new DebugRunRecorder();
export default debugRecorder;

export {
  DebugRunRecorder,
  generateRunId,
  DEBUG_REPORT_VERSION,
  DEBUG_RUNS_DIR,
  isDebugEnabled,
  simpleHash,
};
