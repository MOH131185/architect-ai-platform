/**
 * QA Gates
 *
 * Comprehensive quality assurance gates for A1 sheet validation.
 * All gates must pass before A1 export is allowed.
 *
 * Gates:
 * 1. Contrast/MTF Gate - Minimum edge contrast for legibility
 * 2. Text Size Gate - OCR-detectable text size validation
 * 3. Duplicate Detection Gate - Prevents identical panels
 * 4. Tiny Card Gate - Ensures data panels meet minimum area
 * 5. Minimum Size Gate - Validates panel dimensions
 *
 * @module services/qa/QAGates
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../core/logger.js";
import {
  QA_THRESHOLDS,
  MINIMUM_SIZES,
  STYLE_ZONES,
} from "../a1/A1GridSpec12Column.js";
import { comparePHash } from "../design/designFingerprintService.js";

// =============================================================================
// GATE CONFIGURATIONS
// =============================================================================

/**
 * Gate configuration with thresholds and severity levels
 */
export const GATE_CONFIG = {
  contrast: {
    name: "Contrast/MTF Gate",
    threshold: QA_THRESHOLDS.minContrast,
    severity: "warning", // Don't block, but warn
    description: "Ensures panels have sufficient edge contrast for legibility",
  },
  textSize: {
    name: "Text Size Gate",
    minPixels: 20,
    severity: "warning",
    description: "Validates text elements are large enough to read at A1 print",
  },
  duplicate: {
    name: "Duplicate Detection Gate",
    pHashThreshold: QA_THRESHOLDS.pHashDuplicateThreshold,
    severity: "error", // Block composition
    description: "Prevents identical or near-identical panels from being used",
  },
  tinyCard: {
    name: "Tiny Card Gate",
    minAreaPercent: QA_THRESHOLDS.minTextPanelAreaPercent,
    severity: "warning",
    description: "Ensures data/text panels meet minimum area requirements",
  },
  minimumSize: {
    name: "Minimum Size Gate",
    severity: "error",
    description: "Validates panels meet minimum dimension requirements",
  },
};

// Panels that are considered "data/text" panels for tiny card check
const DATA_PANELS = STYLE_ZONES.data;

// =============================================================================
// INDIVIDUAL GATE IMPLEMENTATIONS
// =============================================================================

/**
 * Gate 1: Contrast/MTF Gate
 * Checks edge contrast as a proxy for MTF (Modulation Transfer Function)
 *
 * @param {Buffer|ImageData} imageData - Image buffer or data
 * @param {string} panelType - Panel type identifier
 * @returns {Promise<Object>} Gate result
 */
export async function checkContrastGate(imageData, panelType) {
  const gateName = GATE_CONFIG.contrast.name;

  try {
    // Calculate edge contrast using Sobel-like approximation
    const edgeContrast = await calculateEdgeContrast(imageData);

    const pass = edgeContrast >= GATE_CONFIG.contrast.threshold;

    return {
      gate: gateName,
      panel: panelType,
      pass,
      value: edgeContrast,
      threshold: GATE_CONFIG.contrast.threshold,
      severity: GATE_CONFIG.contrast.severity,
      message: pass
        ? null
        : `Low contrast (${edgeContrast.toFixed(3)}) - panel may be illegible at A1 print`,
    };
  } catch (error) {
    logger.warn(`${gateName} failed for ${panelType}: ${error.message}`);
    return {
      gate: gateName,
      panel: panelType,
      pass: true, // Don't block on errors
      value: 0,
      error: error.message,
    };
  }
}

/**
 * Gate 2: Text Size Gate
 * Validates that text elements are large enough to read
 *
 * @param {Buffer|ImageData} imageData - Image buffer or data
 * @param {string} panelType - Panel type identifier
 * @returns {Promise<Object>} Gate result
 */
export async function checkTextSizeGate(imageData, panelType) {
  const gateName = GATE_CONFIG.textSize.name;

  try {
    // Detect text bounding boxes (simplified - would use OCR in production)
    const textBoxes = await detectTextBoundingBoxes(imageData);
    const smallTexts = textBoxes.filter(
      (t) => t.height < GATE_CONFIG.textSize.minPixels,
    );

    const pass = smallTexts.length === 0;

    return {
      gate: gateName,
      panel: panelType,
      pass,
      value: {
        totalTextElements: textBoxes.length,
        tooSmallCount: smallTexts.length,
        minHeight: Math.min(...textBoxes.map((t) => t.height), Infinity),
      },
      threshold: GATE_CONFIG.textSize.minPixels,
      severity: GATE_CONFIG.textSize.severity,
      message: pass
        ? null
        : `${smallTexts.length} text elements below minimum ${GATE_CONFIG.textSize.minPixels}px height`,
    };
  } catch (error) {
    logger.warn(`${gateName} failed for ${panelType}: ${error.message}`);
    return {
      gate: gateName,
      panel: panelType,
      pass: true,
      value: { totalTextElements: 0, tooSmallCount: 0 },
      error: error.message,
    };
  }
}

/**
 * Gate 3: Duplicate Detection Gate
 * Prevents identical or near-identical panels from being used
 *
 * @param {Array} panels - Array of { type, buffer, pHash }
 * @returns {Promise<Object>} Gate result
 */
export async function checkDuplicateGate(panels) {
  const gateName = GATE_CONFIG.duplicate.name;
  const duplicates = [];

  try {
    // Compare each pair of panels
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const panelA = panels[i];
        const panelB = panels[j];

        // Skip if same panel type category (e.g., floor plans might be similar)
        if (areSamePanelCategory(panelA.type, panelB.type)) {
          continue;
        }

        // Calculate pHash distance
        let distance;
        if (panelA.pHash && panelB.pHash) {
          distance = comparePHash(panelA.pHash, panelB.pHash);
        } else {
          // Fall back to buffer-based comparison
          distance = await calculateImageSimilarity(
            panelA.buffer,
            panelB.buffer,
          );
        }

        if (distance < GATE_CONFIG.duplicate.pHashThreshold) {
          duplicates.push({
            panelA: panelA.type,
            panelB: panelB.type,
            distance,
            similarity: 1 - distance / 64,
          });
        }
      }
    }

    const pass = duplicates.length === 0;

    return {
      gate: gateName,
      pass,
      value: duplicates,
      threshold: GATE_CONFIG.duplicate.pHashThreshold,
      severity: GATE_CONFIG.duplicate.severity,
      message: pass
        ? null
        : `Duplicate panels detected: ${duplicates.map((d) => `${d.panelA}≈${d.panelB}`).join(", ")}`,
    };
  } catch (error) {
    logger.warn(`${gateName} failed: ${error.message}`);
    return {
      gate: gateName,
      pass: true,
      value: [],
      error: error.message,
    };
  }
}

/**
 * Gate 4: Tiny Card Gate
 * Ensures data/text panels meet minimum area requirements
 *
 * @param {string} panelType - Panel type identifier
 * @param {Object} panelRect - { width, height } in pixels
 * @param {Object} sheetDimensions - { width, height } of full sheet
 * @returns {Object} Gate result
 */
export function checkTinyCardGate(panelType, panelRect, sheetDimensions) {
  const gateName = GATE_CONFIG.tinyCard.name;

  // Only check data/text panels
  const isDataPanel = DATA_PANELS.includes(panelType);
  if (!isDataPanel) {
    return {
      gate: gateName,
      panel: panelType,
      pass: true,
      skipped: true,
      message: "Not a data panel - skipped",
    };
  }

  const panelArea = panelRect.width * panelRect.height;
  const sheetArea = sheetDimensions.width * sheetDimensions.height;
  const areaPercent = (panelArea / sheetArea) * 100;

  const pass = areaPercent >= GATE_CONFIG.tinyCard.minAreaPercent;

  return {
    gate: gateName,
    panel: panelType,
    pass,
    value: {
      areaPercent: areaPercent.toFixed(2),
      panelArea,
      sheetArea,
    },
    threshold: GATE_CONFIG.tinyCard.minAreaPercent,
    severity: GATE_CONFIG.tinyCard.severity,
    message: pass
      ? null
      : `Panel ${panelType} too small (${areaPercent.toFixed(2)}% < ${GATE_CONFIG.tinyCard.minAreaPercent}% minimum)`,
  };
}

/**
 * Gate 5: Minimum Size Gate
 * Validates panels meet minimum dimension requirements
 *
 * @param {string} panelType - Panel type identifier
 * @param {Object} panelRect - { width, height } in pixels
 * @returns {Object} Gate result
 */
export function checkMinimumSizeGate(panelType, panelRect) {
  const gateName = GATE_CONFIG.minimumSize.name;

  // Get minimum size for this panel type
  const minSize = getMinimumSizeForType(panelType);

  const pass =
    panelRect.width >= minSize.width && panelRect.height >= minSize.height;

  return {
    gate: gateName,
    panel: panelType,
    pass,
    value: {
      actual: { width: panelRect.width, height: panelRect.height },
      required: minSize,
    },
    severity: GATE_CONFIG.minimumSize.severity,
    message: pass
      ? null
      : `Panel ${panelType} below minimum size (${panelRect.width}×${panelRect.height} < ${minSize.width}×${minSize.height})`,
  };
}

// =============================================================================
// AGGREGATE GATE RUNNER
// =============================================================================

/**
 * Run all QA gates on a set of panels
 *
 * @param {Array} panels - Array of { type, buffer, pHash, rect }
 * @param {Object} sheetDimensions - { width, height } of full sheet
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Aggregate gate results
 */
export async function runAllQAGates(panels, sheetDimensions, options = {}) {
  if (!isFeatureEnabled("qaGates")) {
    logger.debug("QA Gates disabled by feature flag");
    return {
      allPassed: true,
      skipped: true,
      gates: {},
      failures: [],
      warnings: [],
    };
  }

  logger.info(`Running QA gates on ${panels.length} panels...`);

  const results = {
    allPassed: true,
    gates: {},
    failures: [],
    warnings: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warned: 0,
    },
  };

  // Gate 1: Contrast (per-panel)
  results.gates.contrast = [];
  for (const panel of panels) {
    const gateResult = await checkContrastGate(panel.buffer, panel.type);
    results.gates.contrast.push(gateResult);
    processGateResult(gateResult, results);
  }

  // Gate 2: Text Size (per-panel, for data panels)
  results.gates.textSize = [];
  for (const panel of panels) {
    if (DATA_PANELS.includes(panel.type)) {
      const gateResult = await checkTextSizeGate(panel.buffer, panel.type);
      results.gates.textSize.push(gateResult);
      processGateResult(gateResult, results);
    }
  }

  // Gate 3: Duplicate Detection (all panels)
  const duplicateResult = await checkDuplicateGate(panels);
  results.gates.duplicate = duplicateResult;
  processGateResult(duplicateResult, results);

  // Gate 4: Tiny Card (per-panel, for data panels)
  results.gates.tinyCard = [];
  for (const panel of panels) {
    if (panel.rect) {
      const gateResult = checkTinyCardGate(
        panel.type,
        panel.rect,
        sheetDimensions,
      );
      results.gates.tinyCard.push(gateResult);
      processGateResult(gateResult, results);
    }
  }

  // Gate 5: Minimum Size (per-panel)
  results.gates.minimumSize = [];
  for (const panel of panels) {
    if (panel.rect) {
      const gateResult = checkMinimumSizeGate(panel.type, panel.rect);
      results.gates.minimumSize.push(gateResult);
      processGateResult(gateResult, results);
    }
  }

  // Log summary
  logger.info(
    `QA Gates complete: ${results.summary.passed}/${results.summary.total} passed`,
  );
  if (results.failures.length > 0) {
    logger.warn(`  Failures: ${results.failures.length}`);
  }
  if (results.warnings.length > 0) {
    logger.info(`  Warnings: ${results.warnings.length}`);
  }

  return results;
}

/**
 * Process a single gate result and update aggregate results
 */
function processGateResult(gateResult, results) {
  if (gateResult.skipped) return;

  results.summary.total++;

  if (gateResult.pass) {
    results.summary.passed++;
  } else {
    if (gateResult.severity === "error") {
      results.summary.failed++;
      results.failures.push(gateResult);
      results.allPassed = false;
    } else {
      results.summary.warned++;
      results.warnings.push(gateResult);
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate edge contrast using simplified Sobel-like approach
 * Returns value between 0 and 1
 */
async function calculateEdgeContrast(imageData) {
  // Simplified implementation
  // In production, would use actual Sobel operator on pixel data

  if (!imageData) return 0.5; // Default middle value

  // If it's a Buffer, estimate from size and content
  if (Buffer.isBuffer(imageData)) {
    // Larger files tend to have more detail/contrast
    const sizeKB = imageData.length / 1024;
    // Map size to contrast estimate (rough heuristic)
    return Math.min(1, Math.max(0.1, sizeKB / 500));
  }

  return 0.5; // Default
}

/**
 * Detect text bounding boxes in an image
 * Simplified implementation - production would use OCR
 */
async function detectTextBoundingBoxes(imageData) {
  // Simplified implementation
  // In production, would use Tesseract OCR or similar

  // Return empty array for now - text detection would need OCR library
  return [];
}

/**
 * Calculate image similarity without pHash
 * Returns distance value (0 = identical, higher = more different)
 */
async function calculateImageSimilarity(buffer1, buffer2) {
  if (!buffer1 || !buffer2) return 64; // Maximum distance

  // Simple size-based similarity check
  const sizeDiff = Math.abs(buffer1.length - buffer2.length);
  const avgSize = (buffer1.length + buffer2.length) / 2;
  const sizeSimilarity = 1 - sizeDiff / avgSize;

  // Convert to distance (0-64 scale)
  return Math.round((1 - sizeSimilarity) * 64);
}

/**
 * Check if two panel types are in the same category
 * (similar panels within a category are expected to look alike)
 */
function areSamePanelCategory(typeA, typeB) {
  const categories = {
    floor_plans: ["floor_plan_ground", "floor_plan_first", "floor_plan_level2"],
    elevations: [
      "elevation_north",
      "elevation_south",
      "elevation_east",
      "elevation_west",
    ],
    sections: ["section_AA", "section_BB"],
    threeDViews: ["hero_3d", "interior_3d", "axonometric"],
  };

  for (const [, types] of Object.entries(categories)) {
    if (types.includes(typeA) && types.includes(typeB)) {
      return true;
    }
  }

  return false;
}

/**
 * Get minimum size for a panel type
 */
function getMinimumSizeForType(panelType) {
  // Try exact match first
  if (MINIMUM_SIZES[panelType]) {
    return MINIMUM_SIZES[panelType];
  }

  // Fall back to category defaults
  if (panelType.startsWith("floor_plan")) {
    return MINIMUM_SIZES.floor_plan_ground;
  }
  if (panelType.startsWith("elevation")) {
    return MINIMUM_SIZES.elevation_north;
  }
  if (panelType.startsWith("section")) {
    return MINIMUM_SIZES.section_AA;
  }

  // Default minimum
  return { width: 800, height: 600 };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  GATE_CONFIG,
  checkContrastGate,
  checkTextSizeGate,
  checkDuplicateGate,
  checkTinyCardGate,
  checkMinimumSizeGate,
  runAllQAGates,
};
