/**
 * A1ExportGate
 *
 * Guards A1 sheet export by requiring all panels to pass QA validation.
 * Export is BLOCKED if:
 * - Any required panel fails canonical QA
 * - Geometry is missing for vector-native panels
 * - Geometry signature validation fails
 *
 * @module services/qa/A1ExportGate
 */

import { isFeatureEnabled } from '../../config/featureFlags.js';
import { hasCanonicalRenderPack } from '../canonical/CanonicalRenderPackService.js';
import { crossViewConsistencyService } from '../consistency/CrossViewConsistencyService.js';
import { runConsistencyGate as _runCrossViewGate } from '../validation/CrossViewConsistencyGate.js';
import {
  validateAllCrossViews as validateEdgeCrossViews,
  EdgeValidationError,
  EDGE_ERROR_CODES,
} from '../validation/EdgeBasedConsistencyService.js';
import { batchValidateSemantic } from '../validation/SemanticVisionValidator.js';

import {
  batchValidateGeometrySignatures,
  formatGeometryValidationForReport,
} from './GeometrySignatureValidator.js';
import {
  validatePanelAgainstCanonical as _validatePanelAgainstCanonical,
  batchValidatePanels,
  formatForDebugReport as formatPanelQA,
  getRequiredQAPanels,
  hasCanonicalValidation as _hasCanonicalValidation,
} from './PanelCanonicalQAService.js';
import {
  runExportGateCheck as runRenderSanityCheck,
  SANITY_CHECK_PANEL_TYPES,
  MIN_OCCUPANCY_RATIO,
  MIN_BBOX_RATIO,
  THIN_STRIP_WIDTH_THRESHOLD,
} from './RenderSanityValidator.js';

// ============================================================================
// EXPORT GATE TYPES
// ============================================================================

/**
 * @typedef {Object} ExportGateResult
 * @property {boolean} canExport - Whether export is allowed
 * @property {string} status - 'passed' | 'blocked' | 'warning'
 * @property {string[]} blockReasons - Reasons export is blocked
 * @property {string[]} warnings - Non-blocking warnings
 * @property {Object} panelQA - Panel↔Canonical QA results
 * @property {Object} geometryQA - Geometry signature validation results
 * @property {Object} debugReport - Full debug report for logging
 */

/**
 * @typedef {Object} ExportGateConfig
 * @property {boolean} strictMode - Block on any failure (default: true)
 * @property {boolean} requireGeometry - Require geometry for all vector panels (default: true)
 * @property {boolean} allowPartialExport - Allow export with some failed panels (default: false)
 * @property {string[]} requiredPanels - Panel types that must pass (default: all required)
 * @property {boolean} skipCrossViewGate - Skip cross-view consistency gate (for testing, default: false)
 * @property {boolean} skipEdgeBasedGate - Skip edge-based consistency gate (for testing, default: false)
 * @property {boolean} skipSemanticGate - Skip semantic vision validation (for testing, default: false)
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_EXPORT_GATE_CONFIG = {
  strictMode: true,
  requireGeometry: true,
  allowPartialExport: false,
  requiredPanels: null, // Use getRequiredQAPanels() if null
  skipCrossViewGate: false,
  skipEdgeBasedGate: false,
  skipSemanticGate: false,
  skipRenderSanityGate: false, // NEW: Render sanity validation (occupancy, bbox, thin strip detection)
};

// ============================================================================
// MAIN EXPORT GATE
// ============================================================================

/**
 * Main export gate - validates all panels before allowing A1 export.
 *
 * @param {string} designFingerprint - Design fingerprint
 * @param {Array<{type: string, imageUrl: string}>} panels - Generated panels
 * @param {Object} buildingModel - Building model for geometry validation
 * @param {Object} dna - Design DNA
 * @param {ExportGateConfig} config - Gate configuration
 * @returns {Promise<ExportGateResult>}
 */
export async function validateForExport(
  designFingerprint,
  panels,
  buildingModel = null,
  dna = null,
  config = {}
) {
  const mergedConfig = { ...DEFAULT_EXPORT_GATE_CONFIG, ...config };
  const blockReasons = [];
  const warnings = [];
  const timestamp = Date.now();

  // 1. Check canonical render pack exists
  if (!hasCanonicalRenderPack(designFingerprint)) {
    blockReasons.push(
      'MISSING_CANONICAL_PACK: No canonical render pack found for this design. Generation must complete with geometry-first enabled.'
    );
  }

  // 2. Check required panels are present
  const requiredPanels = mergedConfig.requiredPanels || getRequiredQAPanels();
  const presentPanelTypes = panels.map((p) => p.type);

  for (const required of requiredPanels) {
    if (!presentPanelTypes.includes(required)) {
      if (mergedConfig.strictMode) {
        blockReasons.push(`MISSING_REQUIRED_PANEL: ${required} is required but not present`);
      } else {
        warnings.push(`Missing recommended panel: ${required}`);
      }
    }
  }

  // 3. Validate panels against canonical controls
  const panelQAResult = await batchValidatePanels(designFingerprint, panels);

  // Check for critical failures
  for (const result of panelQAResult.results) {
    if (!result.passed && !result.skipped) {
      const isRequired = requiredPanels.includes(result.panelType);

      if (isRequired) {
        blockReasons.push(
          `PANEL_QA_FAILED: ${result.panelType} failed canonical QA - ${result.failures.join(', ')}`
        );
      } else if (mergedConfig.strictMode) {
        blockReasons.push(
          `PANEL_QA_FAILED: ${result.panelType} failed (strict mode) - ${result.failures.join(', ')}`
        );
      } else {
        warnings.push(
          `${result.panelType} failed QA but is not required: ${result.failures.join(', ')}`
        );
      }
    }
  }

  // 3.5. RENDER SANITY VALIDATION (occupancy, bbox, thin strip detection)
  //      Validates that technical drawings have sufficient content coverage
  let renderSanityResult = null;

  if (!mergedConfig.skipRenderSanityGate) {
    try {
      // Build panels with buffers for sanity check
      const technicalPanels = [];

      for (const panel of panels) {
        const panelType = panel.type;
        if (!SANITY_CHECK_PANEL_TYPES.includes(panelType)) {
          continue;
        }

        // Get image buffer from URL or dataUrl
        let imageBuffer = null;
        const url = panel.imageUrl || panel.url || panel.dataUrl;

        if (url) {
          try {
            if (url.startsWith('data:')) {
              const base64Data = url.split(',')[1];
              imageBuffer = Buffer.from(base64Data, 'base64');
            } else {
              const response = await fetch(url);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
              }
            }
          } catch (fetchError) {
            console.warn(
              `[A1ExportGate] Failed to fetch ${panelType} for sanity check:`,
              fetchError.message
            );
          }
        }

        if (imageBuffer) {
          technicalPanels.push({ panelType, imageBuffer });
        }
      }

      if (technicalPanels.length > 0) {
        renderSanityResult = await runRenderSanityCheck(technicalPanels);

        // Process sanity check results
        if (!renderSanityResult.passed) {
          for (const blockReason of renderSanityResult.blockReasons) {
            blockReasons.push(`RENDER_SANITY_FAILED: ${blockReason.split('\n')[0]}`);
          }
        }

        // Add any warnings
        warnings.push(...renderSanityResult.warnings);
      }
    } catch (sanityError) {
      console.error('[A1ExportGate] Render sanity check failed:', sanityError.message);
      warnings.push(`Render sanity check skipped due to error: ${sanityError.message}`);
    }
  }

  // 4. Validate geometry signatures for vector-native panels
  let geometryQAResult = null;

  if (mergedConfig.requireGeometry) {
    if (!buildingModel && !dna) {
      blockReasons.push(
        'MISSING_GEOMETRY: Building model or DNA required for geometry signature validation'
      );
    } else {
      geometryQAResult = batchValidateGeometrySignatures(designFingerprint, buildingModel, dna);

      for (const result of geometryQAResult.results) {
        if (!result.passed) {
          const isRequired = requiredPanels.includes(result.panelType);

          if (isRequired) {
            blockReasons.push(
              `GEOMETRY_SIGNATURE_FAILED: ${result.panelType} - ${result.mismatches.slice(0, 3).join(', ')}${result.mismatches.length > 3 ? '...' : ''}`
            );
          } else {
            warnings.push(
              `${result.panelType} geometry mismatch (non-required): ${result.mismatches[0]}`
            );
          }
        }
      }
    }
  }

  // 5. CROSS-VIEW CONSISTENCY GATE (visual metrics: pHash + diffRatio + SSIM)
  let crossViewResult = null;
  const crossViewEnabled = isFeatureEnabled('crossViewConsistencyGate');
  const blockOnFailure = isFeatureEnabled('blockExportOnConsistencyFailure');

  if (crossViewEnabled && !mergedConfig.skipCrossViewGate) {
    // Convert panels array to map
    const panelMap = {};
    for (const panel of panels) {
      panelMap[panel.type] = {
        url: panel.imageUrl || panel.url,
        ...panel,
      };
    }

    // Run cross-view consistency service (pHash + diffRatio)
    crossViewResult = await crossViewConsistencyService.runGate(panelMap, {
      blocking: blockOnFailure,
    });

    if (!crossViewResult.passed && blockOnFailure) {
      blockReasons.push(`CROSS_VIEW_CONSISTENCY_FAILED: ${crossViewResult.summary}`);

      // Add individual blocked panels
      for (const blockedPanel of crossViewResult.blockedPanels) {
        const comparison = crossViewResult.comparisons.find((c) => c.panelType === blockedPanel);
        if (comparison) {
          blockReasons.push(
            `  → ${blockedPanel}: pHash=${(comparison.metrics.pHashSimilarity * 100).toFixed(1)}% | ` +
              `diff=${(comparison.metrics.diffRatio * 100).toFixed(1)}%`
          );
        }
      }
    } else if (crossViewResult.warnedPanels.length > 0) {
      warnings.push(`Cross-view consistency warnings: ${crossViewResult.warnedPanels.join(', ')}`);
    }
  }

  // 6. SEMANTIC VISION VALIDATION (floors, roof type, window rhythm)
  let semanticResult = null;
  const semanticEnabled = isFeatureEnabled('semanticVisionValidation');

  if (semanticEnabled && dna && !mergedConfig.skipSemanticGate) {
    semanticResult = await batchValidateSemantic(panels, dna);

    if (!semanticResult.allPassed && blockOnFailure) {
      for (const failed of semanticResult.failures) {
        blockReasons.push(
          `SEMANTIC_VALIDATION_FAILED: ${failed.panelType} - ${failed.failures.join('; ')}`
        );
      }
    } else if (semanticResult.failures.length > 0) {
      for (const failed of semanticResult.failures) {
        warnings.push(`Semantic warning (${failed.panelType}): ${failed.warnings.join(', ')}`);
      }
    }
  }

  // 7. EDGE-BASED CROSS-VIEW CONSISTENCY (REAL validation - never N/A)
  //    This is the authoritative validation using Sobel edge detection + SSIM
  //    Export is BLOCKED if metrics cannot be computed
  let edgeBasedResult = null;
  const edgeBasedEnabled = isFeatureEnabled('edgeBasedConsistencyGate');

  if (edgeBasedEnabled && !mergedConfig.skipEdgeBasedGate) {
    try {
      // Get canonical pack for comparison
      const { getCanonicalPack } = await import('../canonical/CanonicalGeometryPackService.js');
      const canonicalPack = getCanonicalPack(designFingerprint);

      if (!canonicalPack) {
        // FAIL FAST: No canonical pack = cannot compute metrics = block export
        blockReasons.push(
          'EDGE_CONSISTENCY_BLOCKED: No canonical geometry pack found - cannot compute edge-SSIM metrics. Export blocked per "NEVER N/A" policy.'
        );
        edgeBasedResult = {
          passed: false,
          status: 'ERROR',
          blocksExport: true,
          summary: { total: 0, passed: 0, failed: 0, metricsComplete: false },
          results: [],
          errors: [{ message: 'Missing canonical pack', code: EDGE_ERROR_CODES.MISSING_CANONICAL }],
        };
      } else {
        // Build generated panels map
        const generatedPanelsMap = {};
        for (const panel of panels) {
          generatedPanelsMap[panel.type] = {
            url: panel.imageUrl || panel.url,
            dataUrl: panel.dataUrl,
          };
        }

        // Run edge-based validation (FAIL FAST on computation errors)
        edgeBasedResult = await validateEdgeCrossViews({
          canonicalPack,
          generatedPanels: generatedPanelsMap,
          panelTypes: [
            'elevation_north',
            'elevation_south',
            'elevation_east',
            'elevation_west',
            'section_AA',
            'section_BB',
          ],
        });

        // Check for incomplete metrics (NEVER N/A enforcement)
        if (!edgeBasedResult.summary.metricsComplete) {
          blockReasons.push(
            'EDGE_CONSISTENCY_BLOCKED: Some edge-SSIM metrics could not be computed. Export blocked per "NEVER N/A" policy.'
          );
        }

        // Block if edge validation failed
        if (!edgeBasedResult.passed && edgeBasedResult.blocksExport) {
          const failedPanels = edgeBasedResult.results
            .filter((r) => !r.passed)
            .map(
              (r) =>
                `${r.panelType}: edgeSSIM=${r.edgeSSIM?.toFixed(3) || 'N/A'} < ${r.edgeSSIMThreshold || 'N/A'}`
            )
            .join(', ');

          blockReasons.push(
            `EDGE_CONSISTENCY_FAILED: Building structure mismatch detected. Failed panels: [${failedPanels}]`
          );
        }

        // Add errors to block reasons
        for (const err of edgeBasedResult.errors || []) {
          blockReasons.push(`EDGE_CONSISTENCY_ERROR: ${err.message} (${err.code})`);
        }
      }
    } catch (error) {
      // Edge validation computation failed - BLOCK export (NEVER N/A)
      const errorMsg =
        error instanceof EdgeValidationError ? `${error.message} (${error.code})` : error.message;

      blockReasons.push(
        `EDGE_CONSISTENCY_BLOCKED: Validation computation failed - ${errorMsg}. Export blocked per "NEVER N/A" policy.`
      );

      edgeBasedResult = {
        passed: false,
        status: 'ERROR',
        blocksExport: true,
        summary: { total: 0, passed: 0, failed: 0, metricsComplete: false },
        results: [],
        errors: [{ message: error.message, code: error.code || 'UNKNOWN' }],
      };
    }
  }

  // 8. Compile debug report (now includes all validation metrics including edge-based and render sanity)
  const debugReport = compileDebugReport({
    designFingerprint,
    timestamp,
    panelQA: panelQAResult,
    geometryQA: geometryQAResult,
    crossViewQA: crossViewResult,
    semanticQA: semanticResult,
    edgeBasedQA: edgeBasedResult,
    renderSanityQA: renderSanityResult,
    blockReasons,
    warnings,
    config: mergedConfig,
  });

  // 9. Determine final status
  const canExport = blockReasons.length === 0;
  const status = canExport ? (warnings.length > 0 ? 'warning' : 'passed') : 'blocked';

  return {
    canExport,
    status,
    blockReasons,
    warnings,
    panelQA: {
      summary: panelQAResult.summary,
      failedPanels: panelQAResult.summary.failedPanels,
    },
    geometryQA: geometryQAResult
      ? {
          summary: geometryQAResult.summary,
          failedPanels: geometryQAResult.summary.failedPanels,
        }
      : null,
    crossViewQA: crossViewResult
      ? {
          passed: crossViewResult.passed,
          status: crossViewResult.status,
          summary: crossViewResult.summary,
          blockedPanels: crossViewResult.blockedPanels,
          warnedPanels: crossViewResult.warnedPanels,
          aggregate: crossViewResult.aggregate,
        }
      : null,
    semanticQA: semanticResult
      ? {
          allPassed: semanticResult.allPassed,
          summary: semanticResult.summary,
          failures: semanticResult.failures.map((f) => ({
            panel: f.panelType,
            failures: f.failures,
          })),
        }
      : null,
    // Edge-based consistency (NEVER N/A - always includes metrics or blocks export)
    edgeBasedQA: edgeBasedResult
      ? {
          passed: edgeBasedResult.passed,
          status: edgeBasedResult.status,
          blocksExport: edgeBasedResult.blocksExport,
          summary: edgeBasedResult.summary,
          results: edgeBasedResult.results.map((r) => ({
            panelType: r.panelType,
            passed: r.passed,
            edgeSSIM: r.edgeSSIM,
            edgeSSIMThreshold: r.edgeSSIMThreshold,
            edgePHashSimilarity: r.edgePHashSimilarity,
            metricsComplete: r.metricsComplete,
          })),
          errors: edgeBasedResult.errors,
        }
      : {
          // When edge-based validation not enabled, explicitly state it
          passed: null,
          status: 'DISABLED',
          blocksExport: false,
          summary: { metricsComplete: true, reason: 'Edge-based consistency gate disabled' },
        },
    // Render sanity validation (occupancy, bbox, thin strip detection)
    renderSanityQA: renderSanityResult
      ? {
          passed: renderSanityResult.passed,
          blockReasons: renderSanityResult.blockReasons,
          warnings: renderSanityResult.warnings,
          thresholds: {
            minOccupancy: MIN_OCCUPANCY_RATIO,
            minBboxRatio: MIN_BBOX_RATIO,
            thinStripThreshold: THIN_STRIP_WIDTH_THRESHOLD,
          },
        }
      : {
          passed: null,
          status: 'SKIPPED',
          reason: 'Render sanity gate disabled or no technical panels found',
        },
    debugReport,
    timestamp,
    designFingerprint,
  };
}

/**
 * Quick check if export would be allowed (without full validation).
 * Useful for UI to show export button state.
 *
 * @param {string} designFingerprint - Design fingerprint
 * @param {Object} buildingModel - Building model
 * @returns {boolean}
 */
export function canExportQuickCheck(designFingerprint, buildingModel) {
  // Must have canonical render pack
  if (!hasCanonicalRenderPack(designFingerprint)) {
    return false;
  }

  // Must have geometry
  if (!buildingModel) {
    return false;
  }

  return true;
}

/**
 * Get export blocking status message for UI display.
 *
 * @param {ExportGateResult} result - Export gate result
 * @returns {string}
 */
export function getExportStatusMessage(result) {
  if (result.canExport) {
    if (result.warnings.length > 0) {
      return `Export ready with ${result.warnings.length} warning(s)`;
    }
    return 'All QA checks passed - ready to export';
  }

  return `Export blocked: ${result.blockReasons[0]}`;
}

// ============================================================================
// DEBUG REPORT COMPILATION
// ============================================================================

/**
 * Compile comprehensive debug report for logging and diagnostics.
 * Now includes ALL validation metrics for full visibility.
 */
function compileDebugReport({
  designFingerprint,
  timestamp,
  panelQA,
  geometryQA,
  crossViewQA,
  semanticQA,
  edgeBasedQA,
  renderSanityQA,
  blockReasons,
  warnings,
  config,
}) {
  const report = {
    exportGate: {
      timestamp: new Date(timestamp).toISOString(),
      designFingerprint,
      status: blockReasons.length === 0 ? 'PASSED' : 'BLOCKED',
      blockReasons,
      warnings,
      config,
    },
  };

  // Add panel QA section
  if (panelQA) {
    Object.assign(report, formatPanelQA(panelQA.results));
  }

  // Add geometry QA section
  if (geometryQA) {
    Object.assign(report, formatGeometryValidationForReport(geometryQA.results));
  }

  // Add cross-view consistency section (visual metrics)
  if (crossViewQA) {
    report.crossViewConsistency = {
      enabled: true,
      status: crossViewQA.status,
      passed: crossViewQA.passed,
      summary: crossViewQA.summary,
      totalTimeMs: crossViewQA.totalTimeMs,
      aggregate: crossViewQA.aggregate
        ? {
            avgPHashSimilarity: crossViewQA.aggregate.avgPHashSimilarity,
            avgDiffRatio: crossViewQA.aggregate.avgDiffRatio,
            avgCombinedScore: crossViewQA.aggregate.avgCombinedScore,
            minPHashSimilarity: crossViewQA.aggregate.minPHashSimilarity,
            maxDiffRatio: crossViewQA.aggregate.maxDiffRatio,
            passedCount: crossViewQA.aggregate.passedCount,
            warnCount: crossViewQA.aggregate.warnCount,
            failedCount: crossViewQA.aggregate.failedCount,
          }
        : null,
      blockedPanels: crossViewQA.blockedPanels,
      warnedPanels: crossViewQA.warnedPanels,
      comparisons: (crossViewQA.comparisons || []).map((c) => ({
        panel: c.panelType,
        heroPanel: c.heroPanel,
        status: c.status,
        passed: c.passed,
        metrics: {
          pHashSimilarity: c.metrics?.pHashSimilarity,
          pHashDistance: c.metrics?.pHashDistance,
          diffRatio: c.metrics?.diffRatio,
          diffPixels: c.metrics?.diffPixels,
          combinedScore: c.metrics?.combinedScore,
        },
        thresholds: c.thresholds,
        reasons: c.reasons,
        computeTimeMs: c.computeTimeMs,
      })),
    };
  } else {
    report.crossViewConsistency = {
      enabled: false,
      status: 'SKIPPED',
      summary: 'Cross-view consistency gate disabled',
    };
  }

  // Add semantic vision validation section
  if (semanticQA) {
    report.semanticValidation = {
      enabled: true,
      allPassed: semanticQA.allPassed,
      summary: semanticQA.summary,
      results: (semanticQA.results || []).map((r) => ({
        panel: r.panelType,
        passed: r.passed,
        status: r.status,
        extracted: r.extracted,
        expected: r.expected,
        checks: r.checks,
        failures: r.failures,
        warnings: r.warnings,
        confidence: r.confidence,
      })),
    };
  } else {
    report.semanticValidation = {
      enabled: false,
      status: 'SKIPPED',
      summary: 'Semantic vision validation disabled or no DNA provided',
    };
  }

  // Add edge-based cross-view consistency section (NEVER N/A)
  // This section MUST always have metrics or explicitly block export
  if (edgeBasedQA) {
    report.edgeBasedConsistency = {
      enabled: true,
      status: edgeBasedQA.status,
      passed: edgeBasedQA.passed,
      blocksExport: edgeBasedQA.blocksExport,
      summary: {
        total: edgeBasedQA.summary?.total || 0,
        passed: edgeBasedQA.summary?.passed || 0,
        failed: edgeBasedQA.summary?.failed || 0,
        metricsComplete: edgeBasedQA.summary?.metricsComplete || false,
      },
      // Per-panel edge-SSIM results (REQUIRED - never N/A)
      results: (edgeBasedQA.results || []).map((r) => ({
        panelType: r.panelType,
        passed: r.passed,
        status: r.status,
        // PRIMARY: Edge-SSIM metrics (all required for "never N/A")
        edgeSSIM: r.edgeSSIM,
        edgeSSIMThreshold: r.edgeSSIMThreshold,
        edgeSSIMPassed: r.edgeSSIMPassed,
        edgeSSIMLuminance: r.edgeSSIMLuminance,
        edgeSSIMContrast: r.edgeSSIMContrast,
        edgeSSIMStructure: r.edgeSSIMStructure,
        // SECONDARY: Edge-pHash metrics
        edgePHashSimilarity: r.edgePHashSimilarity,
        edgePHashThreshold: r.edgePHashThreshold,
        edgePHashPassed: r.edgePHashPassed,
        edgePHashDistance: r.edgePHashDistance,
        // Metadata
        metricsComplete: r.metricsComplete,
        durationMs: r.durationMs,
        error: r.error,
      })),
      errors: (edgeBasedQA.errors || []).map((e) => ({
        message: e.message,
        code: e.code,
      })),
      // NEVER N/A policy tracking
      _neverNA: {
        allMetricsPresent: edgeBasedQA.summary?.metricsComplete || false,
        exportBlockedDueToMissingMetrics: !edgeBasedQA.summary?.metricsComplete,
      },
    };
  } else {
    report.edgeBasedConsistency = {
      enabled: false,
      status: 'DISABLED',
      summary: 'Edge-based consistency gate disabled via feature flag',
      // Even when disabled, we're explicit about metrics status
      _neverNA: {
        allMetricsPresent: true, // N/A not applicable when gate is disabled
        exportBlockedDueToMissingMetrics: false,
        reason: 'Gate disabled - no metrics required',
      },
    };
  }

  // Add render sanity validation section (occupancy, bbox, thin strip)
  if (renderSanityQA) {
    report.renderSanityValidation = {
      enabled: true,
      passed: renderSanityQA.passed,
      thresholds: {
        minOccupancyRatio: MIN_OCCUPANCY_RATIO,
        minBboxRatio: MIN_BBOX_RATIO,
        thinStripWidthThreshold: THIN_STRIP_WIDTH_THRESHOLD,
      },
      blockReasons: renderSanityQA.blockReasons || [],
      warnings: renderSanityQA.warnings || [],
    };
  } else {
    report.renderSanityValidation = {
      enabled: false,
      status: 'SKIPPED',
      summary: 'Render sanity gate disabled or no technical panels found',
    };
  }

  return report;
}

// ============================================================================
// EXPORT GATE WRAPPER
// ============================================================================

/**
 * Create a wrapped export function that enforces the gate.
 *
 * @param {Function} exportFn - The actual export function
 * @param {ExportGateConfig} config - Gate configuration
 * @returns {Function} - Wrapped export function
 */
export function createGatedExport(exportFn, config = {}) {
  return async function gatedExport(designFingerprint, panels, buildingModel, dna, ...exportArgs) {
    // Run export gate validation
    const gateResult = await validateForExport(
      designFingerprint,
      panels,
      buildingModel,
      dna,
      config
    );

    // Block export if validation failed
    if (!gateResult.canExport) {
      const error = new Error(`Export blocked: ${gateResult.blockReasons[0]}`);
      error.code = 'EXPORT_GATE_BLOCKED';
      error.gateResult = gateResult;
      throw error;
    }

    // Log warnings if any
    if (gateResult.warnings.length > 0) {
      console.warn('[A1ExportGate] Export proceeding with warnings:', gateResult.warnings);
    }

    // Proceed with export
    const exportResult = await exportFn(
      designFingerprint,
      panels,
      buildingModel,
      dna,
      ...exportArgs
    );

    // Attach gate result to export result
    return {
      ...exportResult,
      qaGateResult: gateResult,
    };
  };
}

// ============================================================================
// RETRY HELPER
// ============================================================================

/**
 * Suggest retry strategy based on export gate failure.
 *
 * @param {ExportGateResult} gateResult - Export gate result
 * @returns {{shouldRetry: boolean, retryReasons: string[], suggestedActions: string[]}}
 */
export function suggestRetryStrategy(gateResult) {
  const retryReasons = [];
  const suggestedActions = [];

  for (const reason of gateResult.blockReasons) {
    if (reason.includes('PANEL_QA_FAILED')) {
      retryReasons.push('Panel QA failure is retryable with stronger conditioning');
      suggestedActions.push(
        'Increase canonical conditioning strength and regenerate affected panels'
      );
    }

    if (reason.includes('MISSING_CANONICAL_PACK')) {
      retryReasons.push('Canonical pack must be generated first');
      suggestedActions.push('Run geometry-first generation to create canonical render pack');
    }

    if (reason.includes('GEOMETRY_SIGNATURE_FAILED')) {
      retryReasons.push('Geometry mismatch indicates inconsistent generation');
      suggestedActions.push('Verify DNA matches geometry model before regeneration');
    }

    if (reason.includes('MISSING_GEOMETRY')) {
      retryReasons.push('Geometry is required for validation');
      suggestedActions.push('Enable geometry-first mode to generate building model');
    }

    if (reason.includes('MISSING_REQUIRED_PANEL')) {
      retryReasons.push('Required panels are missing from generation');
      suggestedActions.push('Run full panel generation with all required panel types');
    }
  }

  return {
    shouldRetry: retryReasons.length > 0 && retryReasons.some((r) => r.includes('retryable')),
    retryReasons,
    suggestedActions,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

const A1ExportGate = {
  validateForExport,
  canExportQuickCheck,
  getExportStatusMessage,
  createGatedExport,
  suggestRetryStrategy,
  DEFAULT_EXPORT_GATE_CONFIG,
};

export default A1ExportGate;
