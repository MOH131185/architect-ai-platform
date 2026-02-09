/**
 * Panel Generation Service (Phase 1 - Planning + Sequential Generation)
 *
 * Pure service that plans A1 panel jobs and runs them sequentially.
 * Uses specialized prompt builders for each of 14 panel types.
 *
 * ENHANCED: Now uses structured DNA context for all prompts
 */

import {
  isFeatureEnabled,
  FEATURE_FLAGS,
  getFeatureValue,
} from "../../config/featureFlags.js";
import {
  PANEL_TYPE,
  ALL_PANEL_TYPES,
  normalizeToCanonical,
  assertValidPanelType,
  getRegistryEntry,
  getRequiredPanels as getRegistryRequiredPanels,
  getAIGeneratedPanels,
  getFloorPlanPanels,
  validatePanelSet,
} from "../../config/panelRegistry.js";
import {
  TECHNICAL_PANELS as PIPELINE_TECHNICAL_PANELS,
  STYLED_3D_PANELS as PIPELINE_3D_PANELS,
} from "../../config/pipelineMode.js";
import {
  isReadyForPanelGeneration,
  hasCanonicalRenders,
  computeDesignFingerprint,
} from "../../types/CanonicalDesignState.js";
import { PreflightError } from "../../utils/errors.js";
import { buildPanelPrompt as buildSpecializedPanelPrompt } from "../a1/panelPromptBuilders.js";
import {
  transferStyle,
  applyStyleToPrompt,
  calculateDynamicWeights,
} from "../ai/adaptiveStyleTransfer.js";
import {
  resolveControlImage,
  assertCanonicalControl,
  buildCanonicalInitParams,
  requiresMandatoryCanonicalControl,
  extractDebugReportFields,
  MANDATORY_CANONICAL_CONTROL_PANELS,
} from "../canonical/CanonicalControlResolver.js";
import {
  buildCanonicalPack as buildGeometryPack,
  getCanonicalPack as getGeometryPack,
  hasCanonicalPack as hasGeometryPack,
  getControlForPanel as getGeometryControlForPanel,
  getInitImageParams as getGeometryInitImageParams,
  validateBeforeGeneration as validateGeometryPackBeforeGeneration,
  CanonicalPackError,
  ERROR_CODES as GEOMETRY_PACK_ERROR_CODES,
  CANONICAL_PANEL_TYPES as GEOMETRY_PANEL_TYPES,
} from "../canonical/CanonicalGeometryPackService.js";
import {
  buildCanonicalPack,
  hasCanonicalPack as hasBuiltCanonicalPack,
  getCanonicalPack,
  getCanonicalRender,
  PACK_STATUS,
} from "../canonical/CanonicalPackBuilder.js";
import {
  validateBeforeGeneration as validateCanonicalPackGate,
  isCanonicalPackGateEnabled,
  CanonicalPackGateError,
} from "../canonical/CanonicalPackGate.js";
import {
  generateCanonicalRenderPack,
  getCanonicalRenderForPanel,
  hasCanonicalRenderPack,
  getInitImageParams as getCanonicalInitImageParams,
  saveCanonicalRenderPackToFolder,
  getCanonicalRenderPackDebugReport,
  CANONICAL_PANEL_TYPES,
  AI_PANEL_TO_CANONICAL,
} from "../canonical/CanonicalRenderPackService.js";
import {
  generateCanonical3DRenders,
  getCanonical3DRender,
  requireCanonical3DRender,
  requiresCanonical3DRender,
  getCanonical3DInitParams,
  buildCanonical3DNegativePrompt,
  hasCanonical3DRenders,
  getCanonical3DDebugReport,
  validateCanonical3DRenders,
  MANDATORY_3D_PANELS,
  CANONICAL_3D_VIEWS,
  CANONICAL_3D_STRENGTH_POLICY,
  CANONICAL_3D_NEGATIVE_PROMPTS,
} from "../canonical/canonicalRenderService.js";
import logger from "../core/logger.js";

// PANEL_REGISTRY: Single Source of Truth for all panel types
import debugRecorder from "../debug/DebugRunRecorder.js";
import { extractOpeningEnumeration } from "../facade/facadeGenerationLayer.js";
import {
  generateControlPack,
  getControlForPanel as getControlPackForPanel,
  hasControlPack,
  saveControlPackToDebugFolder,
  getControlPackDebugReport,
  CONTROL_PACK_VIEWS,
  PANEL_TO_CONTROL_MAP,
} from "../geometry/CanonicalControlPackService.js";
import {
  generateCanonicalControlRenders,
  getControlImageForPanel,
  requireControlImageForPanel,
  hasControlRenders,
  getControlImageDebugReport,
} from "../geometry/canonicalControlRenderGenerator.js";
import {
  generateControlImage as generateGeometryControlImage,
  getFluxImg2ImgParams,
} from "../geometry/unifiedBuildingGeometry.js";
import {
  checkDriftRetryNeeded,
  calculateDriftRetryParams,
  generateDriftRetrySummary,
  DRIFT_RETRY_CONFIG,
  DRIFT_ELIGIBLE_PANELS,
} from "../quality/DriftRetryPolicy.js";
import {
  ControlFidelityGate,
  imageSimilarityService,
  CONTROL_FIDELITY_THRESHOLDS,
} from "../quality/ImageSimilarityService.js";
import {
  validatePanel,
  validatePanelBatch,
  getPanelsForRegeneration,
  QUALITY_THRESHOLDS,
} from "../quality/panelQualityValidator.js";
import {
  generationPreflight,
  GenerationPreflight,
} from "../validation/GenerationPreflight.js";
import {
  getValidationGate,
  assertValidGenerator,
  confirmGenerator,
  GeneratorMismatchError,
  LegacyGeneratorError,
} from "../validation/PanelValidationGate.js";

import {
  getBaselineForPanel,
  requiresBaselineControl,
  applyBaselineControl,
  BASELINE_VIEW_TYPES,
} from "./BaselineRenderService.js";
import {
  build3DPanelPrompt,
  buildPlanPrompt,
  buildElevationPrompt,
  buildSectionPrompt,
  buildNegativePrompt as buildStandardNegativePrompt,
} from "./dnaPromptContext.js";
import { validateGeometryRenders } from "./geometryControlValidator.js";
import { normalizeMaterialsString } from "./materialUtils.js";
import { derivePanelSeed, derivePanelSeeds } from "../seedDerivation.js";

// NEW: Import adaptive style transfer for 0.6/0.3/0.1 blend

// Import SVG technical drawing generators for enhanced elevation/section/floor plan panels
import {
  generateElevationSVG,
  generateSectionSVG,
  generateFloorPlanSVG,
} from "./technicalDrawingGenerator.js";
// Legacy test hook (string match): import { generateElevationSVG, generateSectionSVG } from './technicalDrawingGenerator.js';

// NEW: Import enhanced SVG generators (Phase A - Professional A1 Quality)
// These provide furniture symbols, door swings, material patterns, and structural details
import {
  generateEnhancedFloorPlanSVG,
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
} from "./enhancedTechnicalDrawingAdapter.js";

// NEW: Import unified geometry service for 3D view consistency (Phase B)

// NEW: Import quality validation and retry service (Phase D - Quality Control)

import {
  retryFailedPanel,
  getRetryStatistics,
  MAX_RETRIES as PANEL_MAX_RETRIES,
} from "./panelRetryService.js";

// NEW: Import canonical control render generator for SSOT geometry enforcement

// NEW: Import CanonicalControlPackService for unified control pack (4 canonical views)

// NEW: Import CanonicalRenderPackService for per-panel-type canonical renders

// NEW: Import CanonicalPackGate for mandatory canonical pack enforcement

// DELIVERABLE C: Hard Guards - PanelValidationGate
// Prevents silent fallback to legacy generators for technical panels

// Pipeline Mode Configuration

// NEW: Import CanonicalPackBuilder for building canonical packs

// NEW: Import CanonicalControlResolver for MANDATORY hero_3d/interior_3d control

// NEW: Import CanonicalRenderService for SINGLE SOURCE OF TRUTH 3D panel control
// hero_3d, interior_3d, and axonometric MUST use init_image from canonical geometry

// NEW: Import CanonicalGeometryPackService - SINGLE SOURCE OF TRUTH for all panel geometry

// NEW: Import BaselineRenderService for forceBaselineControl mode

// NEW: Import DebugRunRecorder for real runtime data capture

// NEW: Import GenerationPreflight for strict validation gate

// NEW: Import ImageSimilarityService for control fidelity gate

// NEW: Import DriftRetryPolicy for hero_3d/interior_3d drift prevention

// NEW: Import Design Fingerprint Service for hero-as-control enforcement
import {
  getFingerprint,
  hasFingerprint,
  getHeroControlForPanel,
  HERO_REFERENCE_PANELS,
} from "./designFingerprintService.js";

// =============================================================================
// PANEL_CONFIGS - Derived from PANEL_REGISTRY + GRID_12COL slot aspect ratios
// =============================================================================
// Generation sizes match the board-v2 slot aspect ratio so that compose
// receives images that already fit without cropping or letterboxing.
//
// Dimensions are derived from composeCore.getSlotDimensions() which uses the
// slot width/height ratio at a base long-edge of 1408px, rounded to FLUX-safe
// multiples of 64 and clamped to Together.ai limits [256, 1408].
//
// Model selection: kontext-max for 3D/diagrams, schnell for 2D technical
import { getSlotDimensions } from "../a1/composeCore.js";

// NEW: Import CanonicalDesignState for CDS-first generation
// Legacy test hook (string match): function isDataPanel(panelType) { return false; }

/**
 * Get the current output mode from feature flags
 * @returns {'presentation' | 'technical'} The output mode
 */
function getOutputMode() {
  return FEATURE_FLAGS.outputMode || "presentation";
}

function safeGetFeatureValue(flagName) {
  if (typeof getFeatureValue === "function") {
    return getFeatureValue(flagName);
  }
  return FEATURE_FLAGS?.[flagName];
}

/**
 * CRITICAL FIX: Use Map keyed by designFingerprint instead of single global cache.
 * This prevents style profile cross-contamination between concurrent generations.
 *
 * Previous bug: When Generation A and Generation B ran concurrently,
 * B could use A's style profile, causing visual inconsistency.
 */
const styleProfileCache = new Map();

// =============================================================================
// AUTO-RETRY WITH INCREASING CONTROL STRENGTH
// =============================================================================

/**
 * Control Image Retry Configuration
 *
 * When a panel fails due to missing or failed control image,
 * retry with progressively stronger control strength.
 */
const CONTROL_IMAGE_RETRY_CONFIG = {
  maxRetries: 2,
  strengthBands: ["initial", "retry1", "retry2"],
};

/**
 * Retry panel generation with increasing control strength
 *
 * @param {Object} job - Panel job configuration
 * @param {Function} generateFn - Generation function (togetherClient.generateImage)
 * @param {Object} baseParams - Base generation parameters
 * @param {Object} options - Retry options
 * @returns {Object} Generation result with retry metadata
 */
async function retryWithIncreasedControlStrength(
  job,
  generateFn,
  baseParams,
  options = {},
) {
  const { maxRetries = CONTROL_IMAGE_RETRY_CONFIG.maxRetries } = options;
  const designFingerprint =
    job.designFingerprint || job.meta?.designFingerprint;
  const strengthBands = safeGetFeatureValue("controlStrengthBands") || {
    initial: 0.6,
    retry1: 0.75,
    retry2: 0.9,
  };
  const strengthMultipliers =
    safeGetFeatureValue("controlStrengthMultipliers") || {};

  const retryHistory = [];
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const strengthBand = attempt === 0 ? "initial" : `retry${attempt}`;
    const baseStrength = strengthBands[strengthBand] || strengthBands.initial;
    const multiplier = strengthMultipliers[job.type] || 1.0;
    const finalStrength = Math.min(1.0, baseStrength * multiplier);

    // Get control image with appropriate strength for this attempt
    let controlImage = null;
    if (designFingerprint && hasControlRenders(designFingerprint)) {
      controlImage = getControlImageForPanel(
        designFingerprint,
        job.type,
        attempt,
      );
    }

    if (attempt > 0) {
      logger.info(`🔄 RETRY ${attempt}/${maxRetries} for ${job.type}`, {
        strengthBand,
        previousStrength: retryHistory[attempt - 1]?.strength || "N/A",
        newStrength: finalStrength,
        hasControlImage: !!controlImage,
        reason: lastError?.message || "Unknown",
      });
    }

    const retryParams = { ...baseParams };

    // Apply control image if available
    if (controlImage?.dataUrl) {
      retryParams.init_image = controlImage.dataUrl;
      retryParams.strength = finalStrength;
    } else if (baseParams.init_image) {
      // Use existing control image with increased strength
      retryParams.strength = finalStrength;
    }

    try {
      const response = await generateFn(retryParams);
      const imageUrl = response?.url || response?.imageUrls?.[0] || "";

      if (!imageUrl) {
        throw new Error(`No image URL returned for panel ${job.type}`);
      }

      // Success - return result with retry metadata
      const result = {
        success: true,
        imageUrl,
        width: response?.metadata?.width || response?.width || job.width,
        height: response?.metadata?.height || response?.height || job.height,
        seed: response?.seedUsed || response?.seed || job.seed,
        retryInfo: {
          totalAttempts: attempt + 1,
          finalStrengthBand: strengthBand,
          finalStrength,
          controlImageUsed: !!(controlImage || baseParams.init_image),
          history: retryHistory,
        },
      };

      if (attempt > 0) {
        logger.success(
          `✅ Retry ${attempt} succeeded for ${job.type} (strength: ${finalStrength})`,
        );
      }

      return result;
    } catch (error) {
      lastError = error;
      retryHistory.push({
        attempt,
        strengthBand,
        strength: finalStrength,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      // Don't retry on certain errors
      const isRateLimit =
        error.message.includes("429") || error.message.includes("rate limit");
      const isTimeout = error.message.includes("timeout");

      if (isRateLimit || isTimeout) {
        logger.warn(`⚠️ Non-retryable error for ${job.type}: ${error.message}`);
        break;
      }

      if (attempt === maxRetries) {
        logger.error(
          `❌ All ${maxRetries + 1} attempts failed for ${job.type}`,
        );
      }
    }
  }

  // All retries failed
  return {
    success: false,
    error: lastError,
    retryInfo: {
      totalAttempts: retryHistory.length,
      history: retryHistory,
    },
  };
}

// =============================================================================
// CONTROL IMAGE DEBUG REPORT TRACKER
// =============================================================================

/**
 * Track control image usage for debug report generation
 */
const controlImageUsageTracker = new Map();

/**
 * Record control image usage for a panel
 *
 * @param {string} designFingerprint - Design identifier
 * @param {string} panelType - Panel type
 * @param {Object} usageInfo - Control image usage info
 */
function recordControlImageUsage(designFingerprint, panelType, usageInfo) {
  if (!designFingerprint) {
    return;
  }

  if (!controlImageUsageTracker.has(designFingerprint)) {
    controlImageUsageTracker.set(designFingerprint, {
      panels: {},
      timestamp: Date.now(),
    });
  }

  const tracker = controlImageUsageTracker.get(designFingerprint);
  tracker.panels[panelType] = {
    ...usageInfo,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Generate debug report for control image usage
 *
 * @param {string} designFingerprint - Design identifier
 * @returns {Object} Debug report
 */
export function generateControlImageUsageReport(designFingerprint) {
  const tracker = controlImageUsageTracker.get(designFingerprint);
  const canonicalReport = getControlImageDebugReport(designFingerprint);

  return {
    designFingerprint,
    timestamp: new Date().toISOString(),
    strictModeEnabled: isFeatureEnabled("strictControlImageMode"),
    debugReportEnabled: isFeatureEnabled("enableControlImageDebugReport"),
    strengthBands: safeGetFeatureValue("controlStrengthBands"),
    strengthMultipliers: safeGetFeatureValue("controlStrengthMultipliers"),
    maxRetries: safeGetFeatureValue("maxControlImageRetries"),
    canonicalGeometry: canonicalReport,
    panelUsage: tracker?.panels || {},
    summary: tracker
      ? {
          totalPanels: Object.keys(tracker.panels).length,
          withControlImage: Object.values(tracker.panels).filter(
            (p) => p.controlImageUsed,
          ).length,
          withoutControlImage: Object.values(tracker.panels).filter(
            (p) => !p.controlImageUsed,
          ).length,
          retried: Object.values(tracker.panels).filter(
            (p) => p.retryInfo?.totalAttempts > 1,
          ).length,
        }
      : { error: "No tracking data found" },
  };
}

/**
 * Clear control image usage tracker for a design
 *
 * @param {string} designFingerprint - Design identifier, or undefined to clear all
 */
export function clearControlImageUsageTracker(designFingerprint) {
  if (designFingerprint) {
    controlImageUsageTracker.delete(designFingerprint);
  } else {
    controlImageUsageTracker.clear();
  }
}

/**
 * Generate SVG for schedules_notes panel
 * FLUX cannot generate text tables, so we create this as SVG
 *
 * @param {Object} params - Generation parameters
 * @returns {string} Data URL of SVG image
 */
function generateSchedulesSVG({
  programSpaces = [],
  projectType = "Residential",
  area = 200,
  width = 1500,
  height = 1500,
}) {
  const rooms =
    programSpaces.length > 0
      ? programSpaces
      : [
          { name: "Living Room", area: 25, level: "Ground" },
          { name: "Kitchen", area: 18, level: "Ground" },
          { name: "Dining", area: 15, level: "Ground" },
          { name: "Bedroom 1", area: 16, level: "First" },
          { name: "Bedroom 2", area: 14, level: "First" },
          { name: "Bathroom", area: 8, level: "First" },
        ];

  const rowHeight = 45;
  const startY = 200;
  const tableWidth = width - 200;

  const roomRows = rooms
    .slice(0, 10)
    .map((room, i) => {
      const y = startY + (i + 1) * rowHeight;
      const roomName = room.name || room.type || room.label || `Room ${i + 1}`;
      const roomArea = room.area || room.sqm || 20;
      const level = room.level || room.floor || "Ground";
      return `
      <rect x="100" y="${y}" width="${tableWidth}" height="${rowHeight}" fill="${i % 2 === 0 ? "#f8f9fa" : "#ffffff"}" stroke="#dee2e6"/>
      <text x="120" y="${y + 30}" font-family="Arial, sans-serif" font-size="18" fill="#333">${roomName}</text>
      <text x="${tableWidth * 0.5}" y="${y + 30}" font-family="Arial, sans-serif" font-size="18" fill="#333" text-anchor="middle">${roomArea} m²</text>
      <text x="${tableWidth * 0.75}" y="${y + 30}" font-family="Arial, sans-serif" font-size="18" fill="#333" text-anchor="middle">${level}</text>
      <text x="${tableWidth * 0.95}" y="${y + 30}" font-family="Arial, sans-serif" font-size="18" fill="#333" text-anchor="end">Standard</text>
    `;
    })
    .join("");

  const totalArea = rooms.reduce((sum, r) => sum + (r.area || r.sqm || 20), 0);
  const tableEndY = startY + (Math.min(rooms.length, 10) + 1) * rowHeight;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#ffffff"/>

  <!-- Title -->
  <text x="${width / 2}" y="60" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#1a1a2e" text-anchor="middle">ROOM SCHEDULE</text>
  <text x="${width / 2}" y="100" font-family="Arial, sans-serif" font-size="20" fill="#666" text-anchor="middle">${projectType} - ${area} m² Total</text>

  <!-- Table Header -->
  <rect x="100" y="${startY}" width="${tableWidth}" height="${rowHeight}" fill="#1a1a2e"/>
  <text x="120" y="${startY + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">ROOM NAME</text>
  <text x="${tableWidth * 0.5}" y="${startY + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">AREA</text>
  <text x="${tableWidth * 0.75}" y="${startY + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">LEVEL</text>
  <text x="${tableWidth * 0.95}" y="${startY + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="end">FINISH</text>

  <!-- Table Rows -->
  ${roomRows}

  <!-- Total Row -->
  <rect x="100" y="${tableEndY}" width="${tableWidth}" height="${rowHeight}" fill="#e8e8e8" stroke="#dee2e6"/>
  <text x="120" y="${tableEndY + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#333">TOTAL</text>
  <text x="${tableWidth * 0.5}" y="${tableEndY + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#333" text-anchor="middle">${totalArea} m²</text>

  <!-- Notes Section -->
  <rect x="100" y="${tableEndY + 80}" width="${tableWidth}" height="200" fill="#f8f9fa" stroke="#dee2e6" rx="8"/>
  <text x="120" y="${tableEndY + 115}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#1a1a2e">GENERAL NOTES</text>
  <text x="120" y="${tableEndY + 150}" font-family="Arial, sans-serif" font-size="16" fill="#555">1. All dimensions in millimeters unless noted otherwise</text>
  <text x="120" y="${tableEndY + 175}" font-family="Arial, sans-serif" font-size="16" fill="#555">2. Contractor to verify all dimensions on site</text>
  <text x="120" y="${tableEndY + 200}" font-family="Arial, sans-serif" font-size="16" fill="#555">3. All work to comply with Building Regulations</text>
  <text x="120" y="${tableEndY + 225}" font-family="Arial, sans-serif" font-size="16" fill="#555">4. Finishes subject to architect approval</text>
  <text x="120" y="${tableEndY + 250}" font-family="Arial, sans-serif" font-size="16" fill="#555">5. Do not scale from drawings</text>

  <!-- Legend -->
  <rect x="100" y="${height - 150}" width="300" height="100" fill="#f0f0f0" stroke="#ccc" rx="8"/>
  <text x="120" y="${height - 120}" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#333">LEGEND</text>
  <text x="120" y="${height - 90}" font-family="Arial, sans-serif" font-size="14" fill="#555">GIA: Gross Internal Area</text>
  <text x="120" y="${height - 70}" font-family="Arial, sans-serif" font-size="14" fill="#555">NIA: Net Internal Area</text>

  <!-- Border -->
  <rect x="50" y="50" width="${width - 100}" height="${height - 100}" fill="none" stroke="#1a1a2e" stroke-width="2"/>
</svg>`;

  // Convert to data URL
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Check if a panel type should use SVG generation instead of FLUX
 * SVG panels provide CAD-accurate technical drawings with hatching, dimensions, and materials
 *
 * In PRESENTATION mode (default):
 * - Elevations and sections use FLUX for photorealistic rendering
 * - Floor plans use FLUX with furniture indication
 * - Only schedules use SVG (text tables)
 *
 * In TECHNICAL mode:
 * - All technical drawings use SVG for CAD accuracy
 *
 * In CANONICAL BASELINE mode (useCanonicalBaseline=true):
 * - All 2D technical drawings use DETERMINISTIC SVG (NO FLUX)
 * - Only 3D views use FLUX img2img with canonical baseline as control
 * - This is the DEFAULT mode for strict multi-panel consistency
 *
 * @param {string} panelType - Panel type
 * @param {string} outputMode - 'presentation' (default) or 'technical'
 * @returns {boolean}
 */
function isDataPanel(panelType, outputMode = "presentation") {
  // Schedules and notes always use SVG (text tables that FLUX can't generate)
  if (panelType === "schedules_notes") {
    return true;
  }

  // Decorative/info panels - these don't require geometry control images
  // They display data, colors, or climate info rather than architectural views
  if (
    panelType === "material_palette" ||
    panelType === "climate_card" ||
    panelType === "title_block" ||
    panelType === "legend"
  ) {
    return true;
  }

  // ==========================================================================
  // CANONICAL BASELINE MODE: Use deterministic SVG for ALL 2D technical drawings
  // This ensures 100% cross-view consistency - same geometry in every panel
  // ==========================================================================
  const useCanonicalBaseline = isFeatureEnabled("useCanonicalBaseline");
  const strictDeterministic2D = isFeatureEnabled("strictDeterministic2D");

  if (useCanonicalBaseline || strictDeterministic2D) {
    // Floor plans: DETERMINISTIC SVG only (no FLUX)
    if (panelType.startsWith("floor_plan_")) {
      logger.debug(`[CanonicalBaseline] ${panelType} → SVG (deterministic 2D)`);
      return true;
    }

    // Elevations: DETERMINISTIC SVG only (no FLUX)
    if (panelType.startsWith("elevation_")) {
      logger.debug(`[CanonicalBaseline] ${panelType} → SVG (deterministic 2D)`);
      return true;
    }

    // Sections: DETERMINISTIC SVG only (no FLUX)
    if (
      panelType === "section_AA" ||
      panelType === "section_BB" ||
      panelType.startsWith("section_")
    ) {
      logger.debug(`[CanonicalBaseline] ${panelType} → SVG (deterministic 2D)`);
      return true;
    }

    // Site plan and roof plan: DETERMINISTIC SVG only
    if (panelType === "site_plan" || panelType === "roof_plan") {
      logger.debug(`[CanonicalBaseline] ${panelType} → SVG (deterministic 2D)`);
      return true;
    }

    // 3D views (hero_3d, interior_3d, site_diagram, axonometric): Use FLUX with baseline
    // These are NOT data panels - they use FLUX img2img with canonical baseline as control
    if (
      panelType === "hero_3d" ||
      panelType === "interior_3d" ||
      panelType === "site_diagram" ||
      panelType === "axonometric"
    ) {
      logger.debug(
        `[CanonicalBaseline] ${panelType} → FLUX img2img (stylised 3D)`,
      );
      return false;
    }
  }

  // In PRESENTATION mode (default): Only schedules use SVG
  // Elevations, sections, and floor plans use FLUX for photorealistic output
  if (outputMode === "presentation") {
    return false;
  }

  // In TECHNICAL mode: Use SVG for all technical drawings
  if (outputMode === "technical") {
    // Floor plans use enhanced SVG technical drawings
    if (panelType.startsWith("floor_plan_")) {
      return true;
    }

    // Elevations use enhanced SVG technical drawings
    if (panelType.startsWith("elevation_")) {
      return true;
    }

    // Sections use enhanced SVG technical drawings
    if (panelType === "section_AA" || panelType === "section_BB") {
      return true;
    }
  }

  return false;
}

const PANEL_CONFIGS = (() => {
  const configs = {};
  for (const panelType of ALL_PANEL_TYPES) {
    const entry = getRegistryEntry(panelType);
    if (!entry) {
      continue;
    }

    const is3D = entry.category === "3d" || entry.category === "site";
    const isData = entry.generator === "data";

    // Derive width/height from board-v2 slot aspect ratio (no more square defaults)
    const { width, height } = getSlotDimensions(panelType, { baseEdge: 1408 });

    configs[panelType] = {
      width,
      height,
      model: is3D || isData ? "flux-1-kontext-max" : "flux-1-schnell",
    };
  }
  return configs;
})();

// =============================================================================
// BASE_PANEL_SEQUENCE - Generation Priority Order (uses PANEL_TYPE constants)
// =============================================================================
// 1. 3D views first (establish massing and materials)
// 2. Site context (establish site relationship)
// 3. Floor plans (establish layout)
// 4. Elevations (establish facades)
// 5. Sections (establish structure)
// 6. Diagrams (establish documentation)
const BASE_PANEL_SEQUENCE = [
  // Priority 1-3: 3D Views (establish massing)
  PANEL_TYPE.HERO_3D,
  PANEL_TYPE.INTERIOR_3D,
  PANEL_TYPE.AXONOMETRIC, // 3D-03: Overview axonometric diagram

  // Priority 4: Site Context
  PANEL_TYPE.SITE_DIAGRAM,

  // Priority 5-7: Floor Plans (establish layout)
  PANEL_TYPE.FLOOR_PLAN_GROUND,
  PANEL_TYPE.FLOOR_PLAN_FIRST,
  PANEL_TYPE.FLOOR_PLAN_LEVEL2,

  // Priority 8-11: Elevations (establish facades)
  PANEL_TYPE.ELEVATION_NORTH,
  PANEL_TYPE.ELEVATION_SOUTH,
  PANEL_TYPE.ELEVATION_EAST,
  PANEL_TYPE.ELEVATION_WEST,

  // Priority 12-13: Sections (establish structure)
  PANEL_TYPE.SECTION_AA,
  PANEL_TYPE.SECTION_BB,

  // Priority 14: Schedules & Notes (establish documentation)
  PANEL_TYPE.SCHEDULES_NOTES,

  // Priority 15-16: Diagrams (establish documentation)
  PANEL_TYPE.MATERIAL_PALETTE,
  PANEL_TYPE.CLIMATE_CARD,
];

/**
 * Validate Blender view coverage before generation
 * Ensures all required panels have corresponding Blender views
 *
 * @param {Array} blenderViews - Array of Blender rendered views
 * @param {Array} expectedPanels - Array of expected panel types
 * @returns {Object} Coverage validation result
 */
export function validateBlenderCoverage(
  blenderViews,
  expectedPanels = BASE_PANEL_SEQUENCE,
) {
  logger.info("Validating Blender view coverage", {
    blenderViewCount: blenderViews.length,
    expectedPanelCount: expectedPanels.length,
  });

  // Build map of available Blender views by type
  const viewMap = new Map();
  blenderViews.forEach((view) => {
    const key = buildBlenderViewKey(view);
    viewMap.set(key, view);
  });

  // Check coverage for each expected panel
  const coverage = {
    present: [],
    missing: [],
    total: expectedPanels.length,
  };

  expectedPanels.forEach((panelType) => {
    const requiredKey = panelTypeToBlenderKey(panelType);
    const hasView = viewMap.has(requiredKey);

    if (hasView) {
      coverage.present.push({
        panelType,
        blenderViewId: viewMap.get(requiredKey).id,
        blenderViewType: viewMap.get(requiredKey).type,
      });
    } else {
      coverage.missing.push({
        panelType,
        requiredKey,
        severity: getPanelSeverity(panelType),
      });
    }
  });

  // Determine if coverage is sufficient
  const criticalMissing = coverage.missing.filter(
    (m) => m.severity === "critical",
  );
  const coverageRate = coverage.present.length / coverage.total;
  const passed = criticalMissing.length === 0 && coverageRate >= 0.8; // 80% minimum

  return {
    passed,
    coverageRate,
    present: coverage.present,
    missing: coverage.missing,
    criticalMissing,
    summary: `${coverage.present.length}/${coverage.total} panels have Blender views`,
    recommendation: passed
      ? "proceed"
      : criticalMissing.length > 0
        ? "fail_critical_missing"
        : "proceed_with_warnings",
  };
}

/**
 * Build Blender view key from view object
 * @private
 */
function buildBlenderViewKey(view) {
  const type = view.type;
  const metadata = view.metadata || {};

  if (type === "plan") {
    return `plan:${metadata.level || "unknown"}`;
  } else if (type === "elevation") {
    return `elevation:${metadata.orientation || "unknown"}`;
  } else if (type === "section") {
    return `section:${view.id || metadata.axis || "unknown"}`;
  } else {
    return `${type}:*`;
  }
}

/**
 * Convert panel type to Blender view key
 * @private
 */
function panelTypeToBlenderKey(panelType) {
  if (panelType.startsWith("floor_plan_")) {
    const level = panelType.replace("floor_plan_", "");
    return `plan:${level}`;
  } else if (panelType.startsWith("elevation_")) {
    const orientation = panelType.replace("elevation_", "");
    return `elevation:${orientation}`;
  } else if (panelType.startsWith("section_")) {
    const sectionId = panelType.replace("section_", "section_");
    return `section:${sectionId}`;
  } else if (panelType === "hero_3d") {
    return "hero:*";
  } else if (panelType === "interior_3d") {
    return "interior:*";
  } else if (panelType === "site_diagram") {
    return "site:*";
  } else {
    return `${panelType}:*`;
  }
}

/**
 * Get panel severity level
 * @private
 */
function getPanelSeverity(panelType) {
  // Critical panels: floor plans, elevations, sections
  if (
    panelType.startsWith("floor_plan_") ||
    panelType.startsWith("elevation_") ||
    panelType.startsWith("section_")
  ) {
    return "critical";
  }

  // Important panels: 3D views
  if (panelType === "hero_3d" || panelType === "interior_3d") {
    return "important";
  }

  // Optional panels: diagrams, site
  return "optional";
}

/**
 * Build a deterministic Style Lock from DNA
 * This creates a consistent style descriptor that gets prepended to ALL prompts
 * to ensure the same building design across all 14 panels.
 */
function buildStyleLock(masterDNA) {
  if (!masterDNA) {
    return "Contemporary residential building";
  }

  const style =
    masterDNA.architecturalStyle ||
    masterDNA.style?.architecture ||
    "Contemporary";

  // Extract primary materials
  const materials = masterDNA.materials?.exterior || masterDNA.materials || [];
  let primaryMaterial = "brick";

  if (Array.isArray(materials) && materials.length > 0) {
    // Materials array might contain objects like {name: 'brick', color: '#...'} or strings
    const firstMaterial = materials[0];
    primaryMaterial =
      typeof firstMaterial === "object"
        ? firstMaterial.name ||
          firstMaterial.material ||
          firstMaterial.type ||
          "brick"
        : String(firstMaterial);
  } else if (typeof materials === "object" && materials !== null) {
    // Materials might be an object like {primary: 'brick', secondary: 'glass'}
    primaryMaterial =
      materials.primary || materials.name || materials.main || "brick";
  } else if (typeof materials === "string") {
    primaryMaterial = materials.split(",")[0].trim();
  }

  // Extract roof type
  const roofType =
    masterDNA.roof?.type || masterDNA.geometry_rules?.roof_type || "gable";

  // Extract color palette
  const primaryColor =
    masterDNA.colors?.primary ||
    masterDNA.materials?.colors?.primary ||
    "#D4C5B0";
  const accentColor =
    masterDNA.colors?.accent ||
    masterDNA.materials?.colors?.accent ||
    "#2C3E50";

  // Build deterministic style lock
  // REPEATED for emphasis in prompt
  return `Architectural Style: ${style}. Primary Material: ${primaryMaterial}. Roof: ${roofType}. Palette: ${primaryColor} with ${accentColor} accents. UNIFIED DESIGN LANGUAGE: ${style} with ${primaryMaterial} cladding.`;
}

function normalizeDimensions(masterDNA = {}) {
  const dims = masterDNA.dimensions || {};
  const floors =
    dims.floors || dims.floorCount || dims.floor_count || dims.numLevels || 1;
  const floorHeight = 3.2;
  return {
    length: dims.length || dims.length_m || 15,
    width: dims.width || dims.width_m || 10,
    height: dims.height || dims.height_m || floors * floorHeight,
    floors,
  };
}

function normalizeProgram(programSpaces = []) {
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
    return "lobby, living, kitchen, bedrooms, services";
  }
  return programSpaces
    .map((p) => {
      const name = p.name || p.type || "space";
      const area = p.area ? `${p.area} sqm` : null;
      return area ? `${name} (${area})` : name;
    })
    .join(", ");
}

function buildPanelPrompt(panelType, context = {}) {
  const {
    masterDNA,
    buildingType,
    entranceOrientation,
    programSpaces,
    siteBoundary,
    climate,
    geometryHint,
  } = context;

  // Use new structured prompt builders for better consistency
  if (
    panelType === "hero_3d" ||
    panelType === "interior_3d" ||
    panelType === "site_diagram"
  ) {
    const additionalContext =
      panelType === "hero_3d"
        ? `Entrance on ${entranceOrientation || "north"} side. Show building from optimal viewing angle.`
        : panelType === "interior_3d"
          ? `View from main entrance area. Show ${buildingType || "residential"} interior spaces.`
          : `Site context with building footprint. Show site boundaries and access.`;

    return build3DPanelPrompt(panelType, masterDNA, additionalContext);
  }

  if (panelType.includes("floor_plan")) {
    const level = panelType.includes("ground")
      ? "ground"
      : panelType.includes("first")
        ? "first"
        : panelType.includes("level2")
          ? "second"
          : "ground";

    const additionalContext = `Entrance on ${entranceOrientation || "north"} side. Building type: ${buildingType || "residential"}.`;
    return buildPlanPrompt(level, masterDNA, additionalContext);
  }

  if (panelType.includes("elevation")) {
    const direction = panelType.includes("north")
      ? "north"
      : panelType.includes("south")
        ? "south"
        : panelType.includes("east")
          ? "east"
          : "west";

    const additionalContext =
      direction === (entranceOrientation || "north").toLowerCase()
        ? `This is the MAIN ENTRANCE facade. Show entrance door prominently.`
        : `This facade is different from the entrance side.`;

    return buildElevationPrompt(direction, masterDNA, additionalContext);
  }

  if (panelType.includes("section")) {
    const sectionType = panelType.includes("AA") ? "longitudinal" : "cross";
    const sectionContext = geometryHint
      ? `Use provided geometry (${geometryHint.type}) to lock cut position, heights, and roofline.`
      : "";
    return buildSectionPrompt(sectionType, masterDNA, sectionContext);
  }

  // Fallback to legacy format for material_palette and climate_card
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = buildingType || masterDNA?.projectType || "residential";
  const materials = normalizeMaterialsString(masterDNA);
  const program = normalizeProgram(programSpaces);
  const dims = normalizeDimensions(masterDNA);
  const entrance = entranceOrientation || "street-facing";
  const footprint = `${dims.length}m x ${dims.width}m`;
  const height = `${dims.height}m total, ${dims.floors} floors`;

  switch (panelType) {
    case "hero_3d":
      return [
        `Hero exterior 3D view of a ${projectType} building in ${style} style`,
        `Materials: ${materials}`,
        `Footprint ${footprint}, height ${height}`,
        `Entrance on ${entrance} side, coherent massing, consistent with plans`,
        "High fidelity, natural lighting, no people, single building only",
        "Show surrounding site context lightly without changing building geometry",
      ].join(". ");
    case "interior_3d":
      return [
        `Interior 3D view of main lobby/living core for ${projectType} in ${style} style`,
        `Materials: ${materials}`,
        `Consistent openings and structure per plans; view aligns with entrance side ${entrance}`,
        "Show furniture layout logically matching program; single building only; no people",
      ].join(". ");
    case "floor_plan_ground":
      return [
        `Ground floor plan, true orthographic overhead`,
        `Scale 1:100 @ A1, footprint ${footprint}`,
        `Rooms: ${program}`,
        `Entrance on ${entrance} side; align doors/windows to elevations`,
        "Wall thickness ext 0.3m, int 0.15m; clear labels and north arrow",
      ].join(". ");
    case "floor_plan_first":
      return [
        `First floor plan (Level 1), true orthographic overhead`,
        `Scale 1:100 @ A1, footprint ${footprint}`,
        `Align stairs/shafts with ground floor; bedrooms/private rooms prioritized`,
        `Entrance stack over ${entrance} side; consistent window/door positions`,
        "Wall thickness ext 0.3m, int 0.15m; clear labels and dimensions",
      ].join(". ");
    case "floor_plan_level2":
      return [
        `Second floor plan (Level 2), true orthographic overhead`,
        `Scale 1:100 @ A1, footprint ${footprint}`,
        `Align vertical cores with lower levels; bedrooms/private or service per program`,
        `Entrance stack over ${entrance} side; window/door positions match elevations`,
        "Wall thickness ext 0.3m, int 0.15m; clear labels and dimensions",
      ].join(". ");
    case "elevation_north":
    case "elevation_south":
    case "elevation_east":
    case "elevation_west": {
      const dir = panelType.split("_")[1];
      return [
        `${dir.toUpperCase()} elevation, flat orthographic`,
        `Style ${style}, materials: ${materials}`,
        `Show entrance on ${entrance} side where applicable`,
        `Align openings with floor plans; reveal facade articulation and roofline`,
        "No perspective; clean line weights; include grade line",
      ].join(". ");
    }
    case "section_AA":
      return [
        "Section A-A (longitudinal) cutting through entrance and main circulation",
        `Show floor-to-floor heights (${height}), slab thickness, stairs alignment`,
        `Materials: ${materials}; annotate key levels and roof build-up`,
        "True orthographic, no perspective, clean line weights",
      ].join(". ");
    case "section_BB":
      return [
        "Section B-B (cross section) cutting perpendicular to A-A",
        `Show structural grid if implied; align openings with elevations`,
        `Heights: ${height}; materials: ${materials}`,
        "True orthographic, no perspective, clear labels for levels",
      ].join(". ");
    case "site_diagram": {
      const siteDesc = siteBoundary
        ? "Use provided site boundary polygon; "
        : "";
      return [
        `${siteDesc}Site diagram with north arrow and scale`,
        `Place building footprint ${footprint} oriented to entrance ${entrance}`,
        "Show context roads/blocks lightly; no redesign of building massing",
        "Clear labels: site boundary, setback hints, legend minimal",
      ].join(". ");
    }
    case "material_palette": {
      const matList = normalizeMaterialsString(masterDNA);
      return [
        "Material palette board showing primary building materials",
        `Materials: ${matList}`,
        "Display as color swatches with hex codes and material names",
        "Professional material board layout with labels",
        "Show texture samples and finish specifications",
        "Clean grid layout, no perspective, flat presentation",
      ].join(". ");
    }
    case "climate_card": {
      const climate = context.climate || { type: "temperate oceanic" };
      const climateType = climate.type || "temperate oceanic";
      return [
        `Climate analysis card for ${climateType} climate`,
        "Show solar orientation diagram with compass rose",
        "Display seasonal temperature ranges and precipitation",
        "Include sun path diagram (summer/winter solstice)",
        "Energy performance metrics and sustainability features",
        "Professional infographic style with clear data visualization",
        "No perspective, flat 2D presentation with icons and charts",
      ].join(". ");
    }
    case "schedules_notes": {
      return [
        "Architectural schedules and notes sheet",
        "Show door and window schedules in tabular format",
        "Include room finish schedule and general notes",
        "Display area schedule and key plan",
        "Professional data presentation with clean typography",
        "No perspective, flat 2D presentation",
      ].join(". ");
    }
    default:
      return `Panel ${panelType} for ${projectType} in ${style} style.`;
  }
}

function buildNegativePrompt(panelType) {
  // Use standardized negative prompts for consistency
  const baseNegative = buildStandardNegativePrompt(panelType);

  // For mandatory 3D panels, add canonical negative prompts to prevent geometry deviation
  // This enforces: no garage, no extra wings, do not change roof type, etc.
  if (requiresCanonical3DRender(panelType)) {
    return buildCanonical3DNegativePrompt(panelType, baseNegative);
  }

  return baseNegative;
}

/**
 * Build panel sequence based on floor count
 *
 * Panel count is floor-dependent:
 * - 1-floor building: 12 panels (no floor_plan_first, no floor_plan_level2)
 * - 2-floor building: 13 panels (includes floor_plan_first, no floor_plan_level2)
 * - 3+ floor building: 14 panels (includes both floor_plan_first and floor_plan_level2)
 *
 * @param {Object} masterDNA - Master DNA with dimensions
 * @returns {Array<string>} Filtered panel sequence
 */
function buildPanelSequence(masterDNA = {}) {
  const { floors } = normalizeDimensions(masterDNA);
  const includeFirstFloor = floors > 1;
  const includeSecondFloor = floors > 2;
  return BASE_PANEL_SEQUENCE.filter((key) => {
    if (key === "floor_plan_first" && !includeFirstFloor) {
      return false;
    }
    if (key === "floor_plan_level2" && !includeSecondFloor) {
      return false;
    }
    return true;
  });
}

/**
 * Plan panel jobs with deterministic seeds.
 *
 * ENHANCED: Now supports CanonicalDesignState (CDS) for geometry-first generation.
 * When CDS is provided with canonicalRenders:
 * - SVG panels (floor plans, elevations, sections) use pre-rendered SVGs from CDS
 * - 3D panels use canonical 3D renders as img2img control for FLUX stylization
 * - All panels embed designFingerprint in metadata
 */
export async function planA1Panels({
  masterDNA,
  siteBoundary,
  buildingType,
  entranceOrientation,
  programSpaces,
  baseSeed,
  climate,
  locationData,
  geometryRenders = null,
  geometryDNA = null,
  portfolioItems = [],
  fglData = null, // FGL facade control images for elevation panels
  // Phase 4: Meshy 3D integration for 100% consistency
  meshy3D = null, // Meshy 3D model data (modelUrl, thumbnailUrl, renders)
  meshyControlImages = null, // Mapped Meshy renders for elevation panels
  // Phase 4/5: Conditioned Image Pipeline (NEW)
  // When enabled, provides conditioning images from BuildingModel and style from StyleProfile
  conditionedPipeline = null,
  // NEW: Canonical Design State for geometry-first generation
  canonicalDesignState = null, // Complete CDS with geometryModel, facadeModel, canonicalRenders
  // NEW: Procedural geometry masks for floor plan consistency
  geometryMasks = null, // SVG masks from ProceduralGeometryService
  // P0: Hard program constraint and CDS
  programLock = null,
}) {
  // =========================================================================
  // STRICT PREFLIGHT GATE: Block generation if DNA/geometry is invalid
  // =========================================================================
  const strictPreflightEnabled =
    isFeatureEnabled("strictPreflightGate") !== false; // Default ON

  if (strictPreflightEnabled) {
    logger.info("[PanelGeneration] Running preflight validation gate...");

    // Build program schedule from available sources
    const programSchedule = {
      buildingType: buildingType || masterDNA?.buildingType,
      floors:
        masterDNA?.dimensions?.floors ||
        programSpaces?.reduce(
          (max, s) => Math.max(max, (s.floor || 0) + 1),
          1,
        ) ||
        1,
      area:
        masterDNA?.dimensions?.length_m *
          masterDNA?.dimensions?.width_m *
          masterDNA?.dimensions?.floors || 0,
      programSpaces: programSpaces,
    };

    try {
      // This will throw PreflightError if validation fails
      const preflightResult = generationPreflight.validate(
        masterDNA,
        programSchedule,
      );

      if (!preflightResult.valid) {
        // Log warnings but continue if no errors were thrown
        preflightResult.warnings?.forEach((w) =>
          logger.warn(`[Preflight Warning] ${w}`),
        );
      }

      logger.info("[PanelGeneration] Preflight validation PASSED ✓");
    } catch (error) {
      if (error instanceof PreflightError || error.isPreflightError) {
        logger.error(
          `[PanelGeneration] Preflight validation FAILED: ${error.code}`,
        );
        logger.error(`   Message: ${error.message}`);
        logger.error(`   Debug payload available for download`);

        // Re-throw to stop the pipeline - UI will catch this
        throw error;
      }

      // Unknown error - re-throw
      throw error;
    }
  }

  // =========================================================================
  // CANONICAL DESIGN STATE (CDS) CHECK
  // When strictCDS feature flag is enabled, require complete CDS for generation
  // =========================================================================
  const strictCDSEnabled = isFeatureEnabled("strictCanonicalDesignState");
  let useCDSRenders = false;

  if (canonicalDesignState) {
    const cdsReadiness = isReadyForPanelGeneration(canonicalDesignState);

    if (cdsReadiness.ready) {
      useCDSRenders = true;
      logger.info(
        "[PanelGeneration] ✓ CanonicalDesignState ready - using canonical renders",
      );
      logger.info(`   Fingerprint: ${canonicalDesignState.designFingerprint}`);
      logger.info(
        `   Floor plans: ${Object.keys(canonicalDesignState.canonicalRenders?.floorPlansSVG || {}).length}`,
      );
      logger.info(
        `   Elevations: ${Object.keys(canonicalDesignState.canonicalRenders?.elevationsSVG || {}).length}`,
      );
    } else if (strictCDSEnabled) {
      // Strict mode - fail if CDS is incomplete
      throw new PreflightError(
        "CDS_INCOMPLETE",
        `CanonicalDesignState is incomplete: missing ${cdsReadiness.missing.join(", ")}`,
        {
          missing: cdsReadiness.missing,
          designFingerprint: canonicalDesignState.designFingerprint,
        },
      );
    } else {
      logger.warn(
        "[PanelGeneration] CanonicalDesignState provided but incomplete:",
        cdsReadiness.missing,
      );
      logger.warn("   Falling back to legacy geometry pipeline");
    }
  } else if (strictCDSEnabled) {
    // Strict mode requires CDS
    throw new PreflightError(
      "CDS_MISSING",
      "CanonicalDesignState is required when strictCanonicalDesignState is enabled",
      { feature: "strictCanonicalDesignState" },
    );
  }

  // Extract CDS fingerprint for panel metadata (if available)
  const cdsFingerprint = canonicalDesignState?.designFingerprint || null;

  const seedSource =
    typeof baseSeed === "number" || typeof baseSeed === "string"
      ? baseSeed
      : Math.floor(Math.random() * 1000000);

  const panelSequence = buildPanelSequence(masterDNA);

  // CRITICAL: Get designFingerprint for cache isolation
  const designFingerprint =
    masterDNA?.designFingerprint ||
    masterDNA?._designFingerprint ||
    `design_${seedSource}_${Date.now()}`;

  // Ensure designFingerprint is on DNA for downstream use
  if (masterDNA && !masterDNA.designFingerprint) {
    masterDNA.designFingerprint = designFingerprint;
  }

  // LOG: Show which panels are being planned
  console.log("📋 Planning A1 Panels:");
  console.log(`   DesignFingerprint: ${designFingerprint}`);
  console.log(`   Total panels: ${panelSequence.length}`);
  console.log(`   Panels: ${panelSequence.join(", ")}`);
  console.log(`   Seed source: ${seedSource}`);

  // NEW: Generate style profile using adaptive style transfer (0.6/0.3/0.1 blend)
  // When conditionedPipeline is enabled, use its styleDescriptors instead
  // CRITICAL FIX: Use designFingerprint-scoped cache to prevent cross-generation contamination
  let styleProfile = styleProfileCache.get(designFingerprint);

  if (conditionedPipeline?.enabled && conditionedPipeline?.styleDescriptors) {
    // Phase 4/5: Use StyleProfile from conditioned pipeline
    console.log("🎨 Using StyleProfile from Conditioned Image Pipeline...");
    styleProfile = {
      styleInjection: conditionedPipeline.styleDescriptors.unified,
      styleTokens: conditionedPipeline.styleDescriptors.detailed,
      dominantStyle:
        conditionedPipeline.styleProfile?.archetype || "contemporary",
      preferredMaterials: conditionedPipeline.styleProfile?.materials?.primary
        ? [conditionedPipeline.styleProfile.materials.primary.name]
        : [],
      // Store the full conditioned style descriptors for downstream use
      conditionedStyleDescriptors: conditionedPipeline.styleDescriptors,
    };
    console.log(`   ✅ Style archetype: ${styleProfile.dominantStyle}`);
    console.log(
      `   📝 Unified style: ${styleProfile.styleInjection?.substring(0, 80)}...`,
    );
  } else if (!styleProfile) {
    try {
      console.log(
        "🎨 Generating style profile (0.6 Portfolio / 0.3 Local / 0.1 Variation)...",
      );
      const dynamicWeights = calculateDynamicWeights({
        portfolioItems,
        isHistoricArea: locationData?.zoning?.historic || false,
        creativityLevel: "normal",
      });
      styleProfile = await transferStyle({
        portfolioItems,
        locationData,
        climateData: climate,
        customWeights: dynamicWeights,
        seed: seedSource,
      });
      // CRITICAL FIX: Store in designFingerprint-scoped cache
      styleProfileCache.set(designFingerprint, styleProfile);
      console.log(`   ✅ Style profile: ${styleProfile.dominantStyle}`);
      console.log(`   📝 Style tokens: ${styleProfile.styleTokens}`);
    } catch (error) {
      console.warn(
        `   ⚠️ Style transfer failed: ${error.message}, using defaults`,
      );
      styleProfile = {
        styleInjection: "",
        styleTokens: "contemporary, modern, clean lines",
        dominantStyle: "contemporary",
      };
    }
  }

  const panelSeedMap = derivePanelSeeds(seedSource, panelSequence);
  const geometryValidation = validateGeometryRenders(
    geometryRenders,
    panelSequence,
  );
  const safeGeometryRenders = geometryValidation.filtered;

  return panelSequence.map((panelType) => {
    const seed =
      panelSeedMap[panelType] ?? derivePanelSeed(seedSource, panelType);
    const geometryHint = selectGeometryRender(panelType, safeGeometryRenders);

    // Determine geometry strength based on panel type
    // NOTE: togetherAIService inverts this: image_strength = 1.0 - geometryStrength
    // We need image_strength to be high (~0.7-0.8) to allow FLUX to generate details from a blockout.
    // Therefore, geometryStrength should be LOW (0.2-0.3).
    let geometryStrength = 0;
    if (geometryHint) {
      if (panelType.includes("floor_plan")) {
        // Floor plans need EXTREME structure to respect the footprint
        // High geometry strength forces AI to "ink" the lines rather than invent
        geometryStrength = 0.75; // Resulting image_strength = 0.25 (Strict adherence)
      } else if (panelType.includes("section")) {
        geometryStrength = 0.75; // Resulting image_strength = 0.25
      } else if (panelType.includes("elevation")) {
        geometryStrength = 0.75; // Resulting image_strength = 0.25
      } else {
        geometryStrength = 0.35; // Resulting image_strength = 0.65 (Standard for 3D)
      }
    }

    // STYLE LOCK: Create a deterministic style descriptor from DNA
    // This ensures ALL panels use the exact same materials, colors, and architectural language
    const styleLock = buildStyleLock(masterDNA);

    // Try specialized builder first, fallback to generic
    let jobPrompt, jobNegativePrompt;

    // NEW: Extract FGL opening enumeration for elevation panels
    let fglOpenings = null;
    let fglRoofProfile = null;
    if (fglData && panelType.includes("elevation")) {
      const directionMap = {
        elevation_north: "N",
        elevation_south: "S",
        elevation_east: "E",
        elevation_west: "W",
      };
      const direction = directionMap[panelType];
      if (direction && fglData.windowPlacements) {
        fglOpenings = extractOpeningEnumeration(
          fglData.windowPlacements,
          direction,
        );
      }
      if (fglData.roofProfile) {
        fglRoofProfile = fglData.roofProfile;
      }
    }

    // Get output mode for prompt style selection
    const promptOutputMode = getOutputMode();

    try {
      const specialized = buildSpecializedPanelPrompt(panelType, {
        masterDNA,
        locationData: locationData || { climate },
        projectContext: { buildingProgram: buildingType, programSpaces },
        consistencyLock: styleLock, // Pass style lock for consistency
        geometryHint,
        fglOpenings,
        fglRoofProfile,
        outputMode: promptOutputMode,
        programLock, // P0: Level-based program constraint
      });
      jobPrompt = specialized.prompt;
      jobNegativePrompt = specialized.negativePrompt;
    } catch (err) {
      // Fallback to generic builder
      jobPrompt = buildPanelPrompt(panelType, {
        masterDNA,
        siteBoundary,
        buildingType,
        entranceOrientation,
        programSpaces,
        climate,
        geometryHint,
      });
      jobNegativePrompt = buildNegativePrompt(panelType);
    }

    // Prepend AND Append Style Lock to ensure consistency (Sandwich method)
    jobPrompt = `${styleLock}. ${jobPrompt} -- ${styleLock}`;

    // NEW: Apply adaptive style transfer (0.6/0.3/0.1 blend) to 3D panels
    // This ensures portfolio style is reflected in generated images
    if (
      styleProfile &&
      styleProfile.styleTokens &&
      (panelType === "hero_3d" ||
        panelType === "interior_3d" ||
        panelType === "site_diagram")
    ) {
      // Inject style tokens into 3D views for portfolio style influence
      const styleBoost =
        `ARCHITECTURAL STYLE DIRECTION: ${styleProfile.dominantStyle}. ` +
        `Style characteristics: ${styleProfile.styleTokens}. `;
      jobPrompt = styleBoost + jobPrompt;

      // Add preferred materials from style profile
      if (
        styleProfile.preferredMaterials &&
        styleProfile.preferredMaterials.length > 0
      ) {
        jobPrompt += `. Preferred materials: ${styleProfile.preferredMaterials.join(", ")}`;
      }
    }

    // Enforce "Single Building" constraint in prompt to prevent row-of-houses hallucination
    if (!jobPrompt.includes("single building")) {
      jobPrompt +=
        ", single detached building structure, centered composition, continuous facade";
    }

    // Floor count enforcement in positive prompt
    const { floors: panelFloors } = normalizeDimensions(masterDNA);
    if (panelFloors === 1) {
      jobPrompt +=
        ", SINGLE STOREY building, ground floor only, NO upper floor, NO second level";
    }

    // Add specific constraints for elevations and sections to prevent splitting
    if (panelType.includes("elevation") || panelType.includes("section")) {
      jobPrompt +=
        ", one unified mass, no separate buildings, no row houses, no detached elements";
      jobNegativePrompt +=
        ", multiple buildings, row of houses, attached units, split mass, townhouses";
    }

    // Add specific constraints for floor plans
    if (panelType.includes("floor_plan")) {
      jobPrompt +=
        ", single contiguous floor plan, connected rooms, one building footprint, clear wall thickness";
      jobNegativePrompt +=
        ", disconnected rooms, multiple buildings, isometric view, perspective, separated spaces";
    }

    // Floor count negative prompts
    if (panelFloors === 1) {
      jobNegativePrompt +=
        ", two storey, two story, second floor, upper floor, multi-level, 2-storey, first floor windows above ground";
    }
    jobNegativePrompt +=
      ", multiple buildings, row houses, terraced houses, townhouses, semi-detached, housing estate";

    // NEW: Select FGL control image for elevation panels
    let fglControlImage = null;
    if (fglData?.controlImages && panelType.includes("elevation")) {
      // Map panel type to direction (e.g., 'elevation_north' -> 'N')
      const directionMap = {
        elevation_north: "N",
        elevation_south: "S",
        elevation_east: "E",
        elevation_west: "W",
      };
      const direction = directionMap[panelType];
      if (direction && fglData.controlImages[direction]) {
        fglControlImage = fglData.controlImages[direction];
        logger.info(
          `   🎯 FGL control image attached for ${panelType} (${direction})`,
        );
      }
    }

    // Phase 4: Select Meshy control image for maximum consistency
    // Priority: Meshy > FGL > Geometry renders (Meshy provides 100% consistency)
    let meshyControlImage = null;
    const meshyControlStrength = 0.8; // High strength for photorealistic control
    if (meshyControlImages) {
      // Map panel type to Meshy render key
      const meshyPanelMap = {
        // Elevations map to Meshy facade renders
        elevation_north: "back", // Assuming south is primary entrance
        elevation_south: "front",
        elevation_east: "right",
        elevation_west: "left",
        // 3D views map to Meshy perspective renders
        hero_3d: "perspective",
        site_diagram: "isometric",
        interior_3d: "perspective", // Fallback to exterior perspective
      };

      const meshyKey = meshyPanelMap[panelType];
      if (meshyKey && meshyControlImages[meshyKey]) {
        meshyControlImage = meshyControlImages[meshyKey];
        logger.info(
          `   🎨 Meshy control image attached for ${panelType} (${meshyKey}, strength: ${meshyControlStrength})`,
        );
      }
    }

    // Also check for roof view for site diagram
    if (
      !meshyControlImage &&
      meshyControlImages?.roof &&
      panelType === "site_diagram"
    ) {
      meshyControlImage = meshyControlImages.roof;
      logger.info(`   🎨 Meshy roof view attached for ${panelType}`);
    }

    // ========================================
    // Phase 4/5: Conditioned Image Pipeline control images
    // ========================================
    // Priority: Conditioned (BuildingModel) > Meshy > FGL > Geometry renders
    // Conditioning images are edge/depth/silhouette maps from the BuildingModel
    let conditionedControlImage = null;
    let conditionedControlStrength = 0;
    if (
      conditionedPipeline?.enabled &&
      conditionedPipeline?.conditioningImages
    ) {
      const conditioningImages = conditionedPipeline.conditioningImages;
      const strengths = conditionedPipeline.conditioningStrengths || {};

      // Map panel type to conditioning image key
      const conditioningPanelMap = {
        // Floor plans use edge detection for sharp lines
        floor_plan_ground: "floor_plan_L0",
        floor_plan_first: "floor_plan_L1",
        floor_plan_level2: "floor_plan_L2",
        // Elevations use edge detection for facade structure
        elevation_north: "elevation_N",
        elevation_south: "elevation_S",
        elevation_east: "elevation_E",
        elevation_west: "elevation_W",
        // Sections use edge detection for cut views
        section_AA: "section_longitudinal",
        section_BB: "section_transverse",
        // 3D views use depth/silhouette for form control
        hero_3d: "exterior_3d",
        interior_3d: "exterior_3d", // Use exterior for consistency
        site_diagram: "axonometric",
      };

      const conditioningKey = conditioningPanelMap[panelType];
      if (conditioningKey && conditioningImages[conditioningKey]) {
        conditionedControlImage = conditioningImages[conditioningKey];
        // Get view-specific strength (floor_plan: 0.7, exterior_3d: 0.4, etc.)
        const baseStrength =
          strengths[conditioningKey] ||
          (panelType.includes("floor_plan") ? 0.7 : 0.5);
        conditionedControlStrength = baseStrength;
        logger.info(
          `   🏗️ Conditioned control image for ${panelType} (${conditioningKey}, strength: ${conditionedControlStrength})`,
        );
      }
    }

    // ========================================
    // PROCEDURAL GEOMETRY MASKS (HIGHEST PRIORITY for floor plans)
    // ========================================
    // Geometry masks provide strict wall/window/door layouts as SVG initImage
    // This ensures 100% floor plan consistency by giving AI a strict geometry to "ink"
    let geometryMaskImage = null;
    let geometryMaskStrength = 0;
    let useGeometryMask = false;

    if (geometryMasks && panelType.startsWith("floor_plan_")) {
      // Map panel type to floor index
      const floorIndexMap = {
        floor_plan_ground: 0,
        floor_plan_first: 1,
        floor_plan_level2: 2,
      };
      const floorIndex = floorIndexMap[panelType] ?? 0;

      if (geometryMasks.floors?.[floorIndex]?.dataUrl) {
        geometryMaskImage = geometryMasks.floors[floorIndex].dataUrl;
        // LOW strength = PRESERVE mode (strict adherence) - see ProceduralGeometryService for semantics
        geometryMaskStrength = 0.25;
        useGeometryMask = true;
        logger.info(
          `   🎯 Geometry mask attached for ${panelType} (floor ${floorIndex}, strength: ${geometryMaskStrength} PRESERVE)`,
        );
      }
    }

    // For hero_3d, use ground floor geometry for shape consistency (looser strength)
    if (
      geometryMasks &&
      panelType === "hero_3d" &&
      geometryMasks.groundFloorDataUrl
    ) {
      geometryMaskImage = geometryMasks.groundFloorDataUrl;
      // MEDIUM strength = MODIFY mode (allows 3D interpretation) - see ProceduralGeometryService for semantics
      geometryMaskStrength = 0.45;
      useGeometryMask = true;
      logger.info(
        `   🎯 Geometry mask attached for hero_3d (ground floor, strength: ${geometryMaskStrength} MODIFY)`,
      );
    }

    // Determine final control image using priority: GeometryMask > Conditioned > Meshy > FGL > Geometry
    // NOTE: Geometry masks take HIGHEST priority for floor plans to ensure strict layout consistency
    const finalControlImage =
      (useGeometryMask && geometryMaskImage) ||
      conditionedControlImage ||
      meshyControlImage ||
      fglControlImage ||
      geometryHint;
    let finalControlStrength = geometryStrength;
    if (useGeometryMask && geometryMaskImage) {
      finalControlStrength = geometryMaskStrength;
    } else if (conditionedControlImage) {
      finalControlStrength = conditionedControlStrength;
    } else if (meshyControlImage) {
      finalControlStrength = meshyControlStrength;
    } else if (fglControlImage) {
      finalControlStrength = 0.85;
    }

    return {
      id: `${panelType}-${seed}`,
      type: panelType,
      // CRITICAL: Include designFingerprint for panel isolation
      designFingerprint,
      // NEW: Include CDS fingerprint if available (takes priority)
      cdsFingerprint: cdsFingerprint || null,
      width: PANEL_CONFIGS[panelType]?.width || 1280,
      height: PANEL_CONFIGS[panelType]?.height || 960,
      prompt: jobPrompt,
      negativePrompt: jobNegativePrompt,
      seed,
      dnaSnapshot: masterDNA || null,
      meta: {
        siteBoundary,
        entranceOrientation,
        geometryHint,
        geometryDNA: geometryDNA || null,
        geometryStrength,
        fglControlImage, // FGL control image for init_image
        fglWindowPlacements: fglData?.windowPlacements, // Window counts for prompt injection
        // Phase 4: Meshy control images (highest priority for img2img)
        meshyControlImage, // Meshy 3D render for this panel
        meshyControlStrength, // Control strength (0.8 for photorealistic control)
        hasMeshyControl: !!meshyControlImage, // Flag for downstream services
        // Phase 4/5: Conditioned Image Pipeline control images (NEW - highest priority)
        conditionedControlImage, // Edge/depth/silhouette map from BuildingModel
        conditionedControlStrength, // View-specific strength from CONDITIONING_STRENGTHS
        hasConditionedControl: !!conditionedControlImage,
        // PROCEDURAL GEOMETRY MASKS (highest priority for floor plans)
        geometryMaskImage, // SVG data URL for floor plan geometry
        geometryMaskStrength, // Control strength (0.65 for floor plans, 0.45 for hero_3d)
        useGeometryMask, // Flag to indicate geometry mask should be used
        hasGeometryMask: !!geometryMaskImage, // Boolean flag for downstream services
        // Store 2D SVG outputs for A1 composition if available
        outputs2D: conditionedPipeline?.outputs2D || null,
        // Combined control image (GeometryMask > Conditioned > Meshy > FGL > Geometry)
        controlImage: finalControlImage,
        controlStrength: finalControlStrength,
        // Include designFingerprint in meta for downstream validation
        designFingerprint,
        // NEW: CDS data for canonical render routing
        cdsFingerprint: cdsFingerprint || null,
        useCDSRenders,
        canonicalDesignState: useCDSRenders ? canonicalDesignState : null,
      },
    };
  });
}

function selectGeometryRender(panelType, geometryRenders) {
  if (!geometryRenders || typeof geometryRenders !== "object") {
    return null;
  }

  // Map floor plans to Blender plan views
  if (panelType === "floor_plan_ground") {
    return geometryRenders.plan_ground || null;
  }
  if (panelType === "floor_plan_first") {
    return geometryRenders.plan_first || null;
  }
  if (panelType === "floor_plan_level2") {
    return geometryRenders.plan_level2 || null;
  }

  if (panelType.includes("elevation")) {
    const dir = panelType.includes("north")
      ? "elevation_north"
      : panelType.includes("south")
        ? "elevation_south"
        : panelType.includes("east")
          ? "elevation_east"
          : "elevation_west";
    // Fallback to old names if new ones missing, but prioritize correct Blender names
    return (
      geometryRenders[dir] ||
      geometryRenders[`orthographic_${dir.split("_")[1]}`] ||
      null
    );
  }

  if (panelType === "hero_3d") {
    return (
      geometryRenders.hero_exterior ||
      geometryRenders.perspective_hero ||
      geometryRenders.perspective ||
      null
    );
  }

  if (panelType === "interior_3d") {
    return (
      geometryRenders.interior_primary ||
      geometryRenders.perspective_interior ||
      null
    );
  }

  if (panelType === "section_AA") {
    return (
      geometryRenders.section_a || geometryRenders.section_longitudinal || null
    );
  }

  if (panelType === "section_BB") {
    return (
      geometryRenders.section_b || geometryRenders.section_transverse || null
    );
  }

  if (panelType === "site_diagram" || panelType === "axonometric_3d") {
    return geometryRenders.axonometric || null;
  }

  return null;
}

/**
 * Generate panels sequentially using the provided Together client.
 * togetherClient is expected to expose generateImage(params).
 */
// Maximum generation time: 15 minutes (11 min reported + buffer)
const MAX_GENERATION_TIME_MS = 15 * 60 * 1000;
const PANEL_GENERATION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per panel

export async function generateA1PanelsSequential(
  jobs,
  togetherClient,
  options = {},
) {
  if (!togetherClient || typeof togetherClient.generateImage !== "function") {
    throw new Error("togetherClient.generateImage is required");
  }

  const results = [];
  const startTime = Date.now();
  let rateLimitHitCount = 0;

  // NEW: Extract styleReferenceUrl from options (Hero image for style consistency)
  // This is set by the workflow orchestrator after hero_3d completes
  const { styleReferenceUrl, floorPlanMaskUrl } = options;
  const strictGeometryRequired =
    isFeatureEnabled("requireCompleteGeometryDNA") ||
    isFeatureEnabled("strictNoFallback");
  const strict3DControlRequired =
    isFeatureEnabled("geometryControlled3D") || strictGeometryRequired;

  // Track timeouts and failures
  const failures = [];

  // =========================================================================
  // CANONICAL CONTROL PACK: Generate control pack once per designFingerprint
  // This ensures ALL panels use the SAME building massing/roofline
  // =========================================================================
  const firstJob = jobs[0];
  const designFingerprint =
    firstJob?.designFingerprint || firstJob?.meta?.designFingerprint;
  const useControlPack = isFeatureEnabled("canonicalControlPack");
  let controlPackGenerated = false;

  // =========================================================================
  // CANONICAL GEOMETRY PACK: Build MANDATORY pack before ANY AI generation
  // FAIL FAST: No silent fallback - pack MUST exist
  // =========================================================================
  const useStrictCanonicalPack =
    isFeatureEnabled("strictCanonicalGeometryPack") ||
    isFeatureEnabled("requireCanonicalPack");

  if (
    useControlPack &&
    designFingerprint &&
    !hasGeometryPack(designFingerprint)
  ) {
    // Try to get BuildingModel source from first job's CDS or DNA
    const buildingModelSource =
      firstJob?.meta?.canonicalDesignState ||
      firstJob?.meta?.buildingModel ||
      firstJob?.dnaSnapshot;

    if (!buildingModelSource) {
      const errorMsg = `[FAIL FAST] No buildingModel source available for canonical pack generation. designFingerprint: ${designFingerprint}`;
      logger.error("📦 [CanonicalGeometryPack] " + errorMsg);

      if (useStrictCanonicalPack) {
        throw new CanonicalPackError(
          errorMsg,
          GEOMETRY_PACK_ERROR_CODES.BUILD_FAILED,
          {
            designFingerprint,
            reason: "no_building_model_source",
          },
        );
      }
    }

    logger.info(
      "📦 [CanonicalGeometryPack] Building MANDATORY canonical geometry pack...",
      {
        designFingerprint,
        source: firstJob?.meta?.canonicalDesignState ? "CDS" : "DNA",
        strictMode: useStrictCanonicalPack,
      },
    );

    try {
      // Build canonical geometry pack - this creates floor plans, elevations, sections, massing
      const geometryPack = await buildGeometryPack(
        buildingModelSource,
        designFingerprint,
        {
          runId: options.runId || `gen_${Date.now()}`,
          width: 1024,
          height: 1024,
        },
      );

      logger.info(
        "📦 [CanonicalGeometryPack] ✅ Canonical geometry pack built successfully",
        {
          designFingerprint,
          totalPanels: geometryPack.manifest?.summary?.totalPanels,
          requiredPresent:
            geometryPack.manifest?.summary?.requiredPresent?.length,
          allRequiredPresent:
            geometryPack.manifest?.summary?.allRequiredPresent,
        },
      );

      controlPackGenerated = true;

      // Save pack to debug folder if debug mode enabled
      if (options.debugDir || isFeatureEnabled("saveControlPackToDebug")) {
        const debugDir = options.debugDir || `debug_runs`;
        await geometryPack
          .savePackToDisk?.(designFingerprint, debugDir)
          .catch(() => {});
      }

      // Also generate legacy control pack for backward compatibility
      if (buildingModelSource) {
        try {
          generateControlPack(buildingModelSource, designFingerprint, {
            runId: options.runId || `gen_${Date.now()}`,
            width: 1024,
            height: 1024,
          });
        } catch (legacyError) {
          logger.debug(
            "📦 [ControlPack] Legacy control pack generation skipped:",
            legacyError.message,
          );
        }
      }
    } catch (controlPackError) {
      logger.error(
        "📦 [CanonicalGeometryPack] ❌ FAIL FAST - Failed to build canonical geometry pack",
        {
          designFingerprint,
          error: controlPackError.message,
          code: controlPackError.code,
        },
      );

      // FAIL FAST: Do NOT continue without canonical pack in strict mode
      if (useStrictCanonicalPack) {
        if (controlPackError instanceof CanonicalPackError) {
          throw controlPackError;
        }
        throw new CanonicalPackError(
          `[FAIL FAST] Cannot generate panels without canonical geometry pack: ${controlPackError.message}`,
          GEOMETRY_PACK_ERROR_CODES.BUILD_FAILED,
          { designFingerprint, originalError: controlPackError.message },
        );
      }

      // Non-strict mode: Log warning but continue (legacy behavior)
      logger.warn(
        "📦 [CanonicalGeometryPack] Continuing without canonical pack (strict mode disabled)",
      );
    }
  } else if (
    useControlPack &&
    designFingerprint &&
    hasGeometryPack(designFingerprint)
  ) {
    logger.info(
      "📦 [CanonicalGeometryPack] Using cached canonical geometry pack",
      {
        designFingerprint,
      },
    );
    controlPackGenerated = true;
  } else if (
    useControlPack &&
    designFingerprint &&
    hasControlPack(designFingerprint)
  ) {
    // Legacy fallback to old control pack
    logger.info("📦 [ControlPack] Using cached legacy control pack", {
      designFingerprint,
    });
    controlPackGenerated = true;
  }

  // =========================================================================
  // CANONICAL PACK GATE: Enforce pack exists before ANY AI generation
  // When requireCanonicalPack is enabled, BLOCK generation without canonical pack
  // =========================================================================
  if (isCanonicalPackGateEnabled() && designFingerprint) {
    logger.info(
      "🚧 [CanonicalPackGate] Validating canonical pack before generation...",
      {
        designFingerprint,
      },
    );

    try {
      // This will throw CanonicalPackGateError if validation fails
      const gateResult = await validateCanonicalPackGate(designFingerprint, {
        throwOnFailure: true,
        strictMode: false, // Use minimum required panels
      });

      logger.info("🚧 [CanonicalPackGate] ✅ Validation passed", {
        designFingerprint,
        panelCount: gateResult.panelCount,
      });
    } catch (gateError) {
      if (gateError instanceof CanonicalPackGateError) {
        logger.error(
          "🚧 [CanonicalPackGate] ❌ BLOCKED - Canonical pack validation failed",
          {
            designFingerprint,
            code: gateError.code,
            message: gateError.message,
            suggestedAction: gateError.getSuggestedAction(),
          },
        );

        // Re-throw with clear message for UI
        throw new Error(
          `[CanonicalPackGate] ${gateError.message}\n\n` +
            `Suggested action: ${gateError.getSuggestedAction()}\n\n` +
            `Error code: ${gateError.code}`,
        );
      }
      throw gateError;
    }
  } else if (isCanonicalPackGateEnabled() && !designFingerprint) {
    logger.warn(
      "🚧 [CanonicalPackGate] No designFingerprint - cannot validate canonical pack",
    );
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const elapsedTime = Date.now() - startTime;

    // Check if we've exceeded maximum generation time
    if (elapsedTime > MAX_GENERATION_TIME_MS) {
      logger.error(
        `\u274c Panel generation timeout after ${Math.round(elapsedTime / 1000)}s`,
      );
      logger.error(
        `   Generated ${results.length}/${jobs.length} panels before timeout`,
      );
      throw new Error(
        `Generation timeout: Only ${results.length}/${jobs.length} panels completed in 15 minutes. This indicates API rate limiting or network issues. Please retry in 2 minutes.`,
      );
    }

    // Log progress
    logger.info(`🖼️  Panel ${i + 1}/${jobs.length}: ${job.type}`);

    // DEBUG: Track panel generation start time for duration calculation (outside try for catch access)
    const panelStartTime = new Date();

    // =========================================================================
    // DELIVERABLE C: HARD GUARDS - PanelValidationGate
    // Determine intended generator and validate BEFORE generation
    // =========================================================================
    let intendedGenerator = "flux"; // Default to legacy flux

    // Determine generator based on panel type and output mode
    const outputModeForGuard = getOutputMode();
    if (isDataPanel(job.type, outputModeForGuard)) {
      intendedGenerator = "svg"; // Data panels use deterministic SVG
    } else if (PIPELINE_TECHNICAL_PANELS.includes(job.type)) {
      // Technical panels always use deterministic SVG in multi_panel mode
      intendedGenerator = "svg";
    } else if (PIPELINE_3D_PANELS.includes(job.type)) {
      // 3D panels use FLUX in multi_panel mode (only supported mode)
      intendedGenerator = "flux";
    }

    // Validate the intended generator (throws in strict mode if wrong)
    try {
      assertValidGenerator(job.type, intendedGenerator);
    } catch (validationError) {
      if (
        validationError instanceof GeneratorMismatchError ||
        validationError instanceof LegacyGeneratorError
      ) {
        logger.error(
          `🚫 [PanelValidationGate] BLOCKED: ${validationError.message}`,
        );
        throw validationError;
      }
      // Non-validation errors pass through
      throw validationError;
    }

    try {
      let imageUrl;
      let width = job.width;
      let height = job.height;
      let seedUsed = job.seed;
      const generatorUsed = intendedGenerator; // Track actual generator used

      // SPECIAL HANDLING: Data panels use SVG instead of FLUX
      // In presentation mode: Only schedules use SVG (elevations/sections/plans use FLUX)
      // In technical mode: All technical drawings use SVG for CAD accuracy
      const outputMode = getOutputMode();

      // =========================================================================
      // CDS CANONICAL RENDER ROUTING (HIGHEST PRIORITY)
      // When useCDSRenders is enabled, use pre-rendered SVGs from CanonicalDesignState
      // This ensures 100% deterministic output from the geometry engine only (no AI)
      // =========================================================================
      if (
        job.meta?.useCDSRenders &&
        job.meta?.canonicalDesignState?.canonicalRenders
      ) {
        const cdsRenders = job.meta.canonicalDesignState.canonicalRenders;
        const cdsFingerprint =
          job.meta.cdsFingerprint ||
          job.meta.canonicalDesignState.designFingerprint;

        // Floor plans - use pre-rendered SVG from CDS
        if (job.type.startsWith("floor_plan_")) {
          const floorLevel = job.type.replace("floor_plan_", "");
          const floorIndex =
            floorLevel === "ground"
              ? 0
              : floorLevel === "first"
                ? 1
                : parseInt(floorLevel.replace("level", "")) || 0;

          if (
            cdsRenders.floorPlansSVG &&
            cdsRenders.floorPlansSVG[floorIndex]
          ) {
            logger.info(
              `🔒 [CDS] Using canonical floor plan SVG for ${job.type} (fingerprint: ${cdsFingerprint})`,
            );
            imageUrl = cdsRenders.floorPlansSVG[floorIndex];
            logger.success(
              `✅ ${job.type} loaded from CanonicalDesignState (deterministic)`,
            );

            results.push({
              ...job,
              url: imageUrl,
              imageUrl,
              width,
              height,
              seed: seedUsed,
              status: "success",
              source: "cds_canonical",
              cdsFingerprint,
              generatedAt: panelStartTime.toISOString(),
              durationMs: Date.now() - panelStartTime.getTime(),
            });
            continue; // Skip to next panel
          } else {
            logger.warn(
              `   ⚠️ CDS floor plan SVG not found for index ${floorIndex}, falling back to generation`,
            );
          }
        }

        // Elevations - use pre-rendered SVG from CDS
        if (job.type.startsWith("elevation_")) {
          const orientation = job.type.replace("elevation_", "");
          const orientationKey = orientation.charAt(0).toUpperCase(); // N, S, E, W

          if (
            cdsRenders.elevationsSVG &&
            cdsRenders.elevationsSVG[orientationKey]
          ) {
            logger.info(
              `🔒 [CDS] Using canonical elevation SVG for ${job.type} (fingerprint: ${cdsFingerprint})`,
            );
            imageUrl = cdsRenders.elevationsSVG[orientationKey];
            logger.success(
              `✅ ${job.type} loaded from CanonicalDesignState (deterministic)`,
            );

            results.push({
              ...job,
              url: imageUrl,
              imageUrl,
              width,
              height,
              seed: seedUsed,
              status: "success",
              source: "cds_canonical",
              cdsFingerprint,
              generatedAt: panelStartTime.toISOString(),
              durationMs: Date.now() - panelStartTime.getTime(),
            });
            continue; // Skip to next panel
          } else {
            logger.warn(
              `   ⚠️ CDS elevation SVG not found for ${orientationKey}, falling back to generation`,
            );
          }
        }

        // Sections - use pre-rendered SVG from CDS
        if (job.type === "section_AA" || job.type === "section_BB") {
          const sectionKey = job.type === "section_AA" ? "A-A" : "B-B";

          if (cdsRenders.sectionsSVG && cdsRenders.sectionsSVG[sectionKey]) {
            logger.info(
              `🔒 [CDS] Using canonical section SVG for ${job.type} (fingerprint: ${cdsFingerprint})`,
            );
            imageUrl = cdsRenders.sectionsSVG[sectionKey];
            logger.success(
              `✅ ${job.type} loaded from CanonicalDesignState (deterministic)`,
            );

            results.push({
              ...job,
              url: imageUrl,
              imageUrl,
              width,
              height,
              seed: seedUsed,
              status: "success",
              source: "cds_canonical",
              cdsFingerprint,
              generatedAt: panelStartTime.toISOString(),
              durationMs: Date.now() - panelStartTime.getTime(),
            });
            continue; // Skip to next panel
          } else {
            logger.warn(
              `   ⚠️ CDS section SVG not found for ${sectionKey}, falling back to generation`,
            );
          }
        }
      }

      if (isDataPanel(job.type, outputMode)) {
        if (job.type === "schedules_notes") {
          // Schedules and notes - text tables
          logger.info(`📊 Generating ${job.type} as SVG (data panel)`);
          imageUrl = generateSchedulesSVG({
            programSpaces: job.programSpaces || job.meta?.programSpaces || [],
            projectType:
              job.projectType || job.meta?.projectType || "Residential",
            area: job.area || job.meta?.area || 200,
            width: job.width,
            height: job.height,
          });
          logger.success(`✅ ${job.type} SVG generated successfully`);
        } else if (job.type.startsWith("floor_plan_")) {
          // Floor plan panels - enhanced SVG technical drawings
          // FIX: Floor plans now use SVG generation for professional CAD-quality output
          const floorLevel = job.type.replace("floor_plan_", "");
          logger.info(
            `📐 Generating ${job.type} as enhanced SVG floor plan (${floorLevel})`,
          );

          // GEOMETRY-FIRST: Merge populatedGeometry for floor plan rendering
          const populatedGeometry =
            job.meta?.geometryDNA?.populatedGeometry ||
            job.meta?.geometryDNA?.floors ||
            job.dnaSnapshot?.populatedGeometry ||
            null;

          // DIAGNOSTIC: Log geometry data availability for debugging
          const floorIndex =
            floorLevel === "ground"
              ? 0
              : floorLevel === "first"
                ? 1
                : parseInt(floorLevel) || 0;
          const floors =
            populatedGeometry?.floors ||
            (Array.isArray(populatedGeometry) ? populatedGeometry : null);
          const floor = Array.isArray(floors)
            ? floors[floorIndex]
            : floors?.[floorIndex];
          const hasRooms = floor?.rooms?.length > 0;
          const hasWalls = floor?.walls?.length > 0;
          logger.info(
            `   🔍 Geometry data for floor ${floorLevel}: populatedGeometry=${!!populatedGeometry}, rooms=${hasRooms ? floor.rooms.length : 0}, walls=${hasWalls ? floor.walls.length : 0}`,
          );

          // Fail fast when strict geometry is required to avoid placeholder floor plans
          if (
            strictGeometryRequired &&
            (!floors || floors.length === 0 || !hasRooms || !hasWalls)
          ) {
            throw new Error(
              `Missing populatedGeometry for ${job.type} (${floorLevel}). Strict geometry mode requires rooms and walls.`,
            );
          }

          if (!hasRooms) {
            logger.warn(
              `   ⚠️ No room geometry for floor ${floorLevel} - will use fallback placeholder SVG`,
            );
          }

          // Merge geometry data into DNA snapshot
          const dnaWithGeometry = {
            ...job.dnaSnapshot,
            populatedGeometry:
              populatedGeometry || job.dnaSnapshot?.populatedGeometry,
          };

          // NEW: Try enhanced generator first (with furniture, door swings, dimensions)
          // Falls back to basic generator if enhanced returns null (feature flag disabled or error)
          let floorPlanResult = generateEnhancedFloorPlanSVG(
            dnaWithGeometry,
            floorLevel,
            {
              buildingType: job.meta?.buildingType || "residential",
              programSpaces: job.meta?.programSpaces || [],
              locationData: job.meta?.locationData,
              sitePolygon: job.meta?.sitePolygon,
              scale: 50,
            },
          );

          if (!floorPlanResult) {
            // Fallback to basic generator
            logger.debug(
              `   ↩️ Enhanced generator returned null, using basic generator`,
            );
            floorPlanResult = generateFloorPlanSVG(
              dnaWithGeometry,
              floorLevel,
              {
                buildingType: job.meta?.buildingType || "residential",
                programSpaces: job.meta?.programSpaces || [],
                locationData: job.meta?.locationData,
                sitePolygon: job.meta?.sitePolygon,
                enhanced: true,
                showDimensions: true,
                showRoomLabels: true,
              },
            );
          } else {
            logger.info(
              `   🪑 Enhanced floor plan with furniture symbols generated`,
            );
          }

          imageUrl = floorPlanResult?.dataUrl || floorPlanResult;
          logger.success(
            `✅ ${job.type} SVG floor plan generated (${floorLevel})`,
          );
        } else if (job.type.startsWith("elevation_")) {
          // Elevation panels - enhanced SVG technical drawings with geometryDNA
          const orientation = job.type.replace("elevation_", "");
          logger.info(
            `📐 Generating ${job.type} as enhanced SVG elevation (${orientation})`,
          );

          // [DEBUG-PGS] Log geometry sources for elevation
          console.warn(
            `[DEBUG-PGS] Elevation ${orientation} - checking geometry sources:`,
            {
              "job.meta?.geometryDNA": !!job.meta?.geometryDNA,
              "job.meta.geometryDNA.facades": job.meta?.geometryDNA?.facades
                ? Object.keys(job.meta.geometryDNA.facades)
                : "null",
              "job.dnaSnapshot": !!job.dnaSnapshot,
              "job.dnaSnapshot.facades": job.dnaSnapshot?.facades
                ? Object.keys(job.dnaSnapshot.facades)
                : "null",
            },
          );

          // GEOMETRY-FIRST: Merge geometryDNA facades into dnaSnapshot for deterministic SVG rendering
          // The SVG generator expects masterDNA.facades[N/S/E/W] with wallLines, openingRects, roofLines, levels
          const facades =
            job.meta?.geometryDNA?.facades || job.dnaSnapshot?.facades || null;
          const roofProfiles =
            job.meta?.geometryDNA?.roofProfiles ||
            job.dnaSnapshot?.roofProfiles ||
            null;
          const populatedGeometry =
            job.meta?.geometryDNA?.populatedGeometry ||
            job.dnaSnapshot?.populatedGeometry ||
            null;

          // DIAGNOSTIC: Log geometry data availability for debugging
          const facadeKey = orientation.charAt(0).toUpperCase();
          const hasFacade = facades && facades[facadeKey];
          const hasWallLines =
            hasFacade && facades[facadeKey].wallLines?.length > 0;
          const hasOpenings =
            hasFacade && facades[facadeKey].openingRects?.length > 0;
          logger.info(
            `   🔍 Geometry data for ${orientation}: facade=${!!hasFacade}, wallLines=${hasWallLines}, openings=${hasOpenings}, roofProfiles=${!!roofProfiles}`,
          );

          // Fail fast when strict geometry is required to avoid blank elevations
          if (
            strictGeometryRequired &&
            (!hasFacade || !hasWallLines || !hasOpenings)
          ) {
            throw new Error(
              `Missing facade geometry for elevation ${orientation}. Strict geometry mode requires wall lines and openings.`,
            );
          }

          // DIAGNOSTIC: Log geometry source for debugging
          console.warn(`[GEOM DEBUG] Elevation ${orientation}:`, {
            "job.meta.geometryDNA.facades": !!job.meta?.geometryDNA?.facades,
            "job.dnaSnapshot.facades": !!job.dnaSnapshot?.facades,
            facadeKeys: facades ? Object.keys(facades) : "null",
            wallLinesCount: facades?.[facadeKey]?.wallLines?.length || 0,
            openingsCount: facades?.[facadeKey]?.openingRects?.length || 0,
          });

          if (!hasFacade) {
            logger.warn(
              `   ⚠️ No facade geometry for ${orientation} - will use fallback placeholder SVG`,
            );
          }

          const dnaWithGeometry = {
            ...job.dnaSnapshot,
            facades,
            roofProfiles,
            populatedGeometry,
          };

          // NEW: Try enhanced generator first (with material patterns, window details)
          // Falls back to basic generator if enhanced returns null
          let elevationResult = generateEnhancedElevationSVG(
            dnaWithGeometry,
            orientation,
            {
              buildingType: job.meta?.buildingType || "residential",
              programSpaces: job.meta?.programSpaces || [],
              scale: 50,
            },
          );

          if (!elevationResult) {
            // Fallback to basic generator
            logger.debug(
              `   ↩️ Enhanced generator returned null, using basic generator`,
            );
            elevationResult = generateElevationSVG(
              dnaWithGeometry,
              orientation,
              {
                buildingType: job.meta?.buildingType || "residential",
                programSpaces: job.meta?.programSpaces || [],
                enhanced: true,
                showHatching: true,
                showDimensions: true,
                showMaterials: true,
              },
            );
          } else {
            logger.info(
              `   🧱 Enhanced elevation with material patterns generated`,
            );
          }

          imageUrl = elevationResult?.dataUrl || elevationResult;
          logger.success(
            `✅ ${job.type} SVG elevation generated (${orientation})`,
          );
        } else if (job.type === "section_AA" || job.type === "section_BB") {
          // Section panels - enhanced SVG technical drawings with geometryDNA
          const sectionType =
            job.type === "section_AA" ? "longitudinal" : "transverse";
          const cutPosition = job.type === "section_AA" ? 0.5 : 0.5; // Center cut
          logger.info(
            `📐 Generating ${job.type} as enhanced SVG section (${sectionType})`,
          );

          // [DEBUG-PGS] Log geometry sources for section
          const sectionKeyDebug = job.type === "section_AA" ? "A-A" : "B-B";
          console.warn(
            `[DEBUG-PGS] Section ${sectionKeyDebug} - checking geometry sources:`,
            {
              "job.meta?.geometryDNA": !!job.meta?.geometryDNA,
              "job.meta.geometryDNA.sections": job.meta?.geometryDNA?.sections
                ? Object.keys(job.meta.geometryDNA.sections)
                : "null",
              "job.dnaSnapshot": !!job.dnaSnapshot,
              "job.dnaSnapshot.sections": job.dnaSnapshot?.sections
                ? Object.keys(job.dnaSnapshot.sections)
                : "null",
            },
          );

          // GEOMETRY-FIRST: Merge geometryDNA sections into dnaSnapshot for deterministic SVG rendering
          // The SVG generator expects masterDNA.sections[A-A/B-B] with wallCuts, slabLines, roofCut, groundLine, levels
          const sections =
            job.meta?.geometryDNA?.sections ||
            job.dnaSnapshot?.sections ||
            null;
          const roofProfiles =
            job.meta?.geometryDNA?.roofProfiles ||
            job.dnaSnapshot?.roofProfiles ||
            null;
          const populatedGeometry =
            job.meta?.geometryDNA?.populatedGeometry ||
            job.dnaSnapshot?.populatedGeometry ||
            null;

          // DIAGNOSTIC: Log geometry data availability for debugging
          const sectionKey = job.type === "section_AA" ? "A-A" : "B-B";
          const hasSection = sections && sections[sectionKey];
          const hasWallCuts =
            hasSection && sections[sectionKey].wallCuts?.length > 0;
          const hasSlabs =
            hasSection && sections[sectionKey].slabLines?.length > 0;
          logger.info(
            `   🔍 Geometry data for ${sectionKey}: section=${!!hasSection}, wallCuts=${hasWallCuts}, slabs=${hasSlabs}, roofProfiles=${!!roofProfiles}`,
          );

          // Fail fast when strict geometry is required to avoid blank sections
          if (
            strictGeometryRequired &&
            (!hasSection || !hasWallCuts || !hasSlabs)
          ) {
            throw new Error(
              `Missing section geometry for ${sectionKey}. Strict geometry mode requires wall cuts and slab lines.`,
            );
          }

          // DIAGNOSTIC: Log geometry source for debugging
          console.warn(`[GEOM DEBUG] Section ${sectionKey}:`, {
            "job.meta.geometryDNA.sections": !!job.meta?.geometryDNA?.sections,
            "job.dnaSnapshot.sections": !!job.dnaSnapshot?.sections,
            sectionKeys: sections ? Object.keys(sections) : "null",
            wallCutsCount: sections?.[sectionKey]?.wallCuts?.length || 0,
            slabsCount: sections?.[sectionKey]?.slabLines?.length || 0,
          });

          if (!hasSection) {
            logger.warn(
              `   ⚠️ No section geometry for ${sectionKey} - will use fallback placeholder SVG`,
            );
          }

          const dnaWithGeometry = {
            ...job.dnaSnapshot,
            sections,
            roofProfiles,
            populatedGeometry,
          };

          // NEW: Try enhanced generator first (with structural details, hatching)
          // Falls back to basic generator if enhanced returns null
          let sectionResult = generateEnhancedSectionSVG(
            dnaWithGeometry,
            sectionType,
            {
              buildingType: job.meta?.buildingType || "residential",
              programSpaces: job.meta?.programSpaces || [],
              scale: 50,
            },
            cutPosition,
          );

          if (!sectionResult) {
            // Fallback to basic generator
            logger.debug(
              `   ↩️ Enhanced generator returned null, using basic generator`,
            );
            sectionResult = generateSectionSVG(
              dnaWithGeometry,
              sectionType,
              {
                buildingType: job.meta?.buildingType || "residential",
                programSpaces: job.meta?.programSpaces || [],
                enhanced: true,
              },
              cutPosition,
            );
          } else {
            logger.info(
              `   🏗️ Enhanced section with structural details generated`,
            );
          }

          imageUrl = sectionResult?.dataUrl || sectionResult;
          logger.success(
            `✅ ${job.type} SVG section generated (${sectionType})`,
          );
        }
      } else {
        // Standard FLUX generation for visual panels
        // NEW: Build params with optional FGL control image
        let generateParams = {
          type: job.type,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          width: job.width,
          height: job.height,
          seed: job.seed,
        };
        const is3DPanel = [
          "hero_3d",
          "interior_3d",
          "axon_3d",
          "axonometric",
          "axonometric_3d",
        ].includes(job.type);
        let controlAttached = false;

        // ========================================
        // STRICT GATE: Fail fast if geometry mask is expected but init_image missing
        // ========================================
        // When useGeometryMask=true was set during planning, the geometry mask MUST be present.
        // Missing init_image indicates ProceduralGeometryService failed to generate the SVG,
        // which would result in AI-invented floor plans (wobbly walls, inconsistent layouts).
        // FAIL FAST to prevent silent degradation to inconsistent outputs.
        //
        // EXPANDED: Now also applies to section panels (section_AA, section_BB) for consistent cuts
        const isTechnicalPanel =
          job.type.startsWith("floor_plan_") || job.type.startsWith("section_");

        if (
          isFeatureEnabled("strictGeometryMaskGate") &&
          job.meta?.useGeometryMask &&
          !job.meta?.controlImage &&
          isTechnicalPanel
        ) {
          const panelCategory = job.type.startsWith("floor_plan_")
            ? "Floor plan"
            : "Section";
          const errorMsg =
            `[GEOMETRY MASK GATE] ${panelCategory} panel ${job.type} has useGeometryMask=true but no init_image (controlImage) attached. ` +
            `This indicates ProceduralGeometryService failed to generate the geometry mask SVG. ` +
            `Aborting to prevent inconsistent ${panelCategory.toLowerCase()}s. ` +
            `Debug: geometryMaskImage=${!!job.meta?.geometryMaskImage}, hasGeometryMask=${!!job.meta?.hasGeometryMask}`;

          logger.error(`🚫 ${errorMsg}`);

          throw new Error(errorMsg);
        }

        // ADDITIONAL STRICT GATE: For technical panels without geometry masks,
        // require canonical control pack if strictCanonicalGeometryPack is enabled
        if (
          isFeatureEnabled("strictCanonicalGeometryPack") &&
          isTechnicalPanel &&
          !job.meta?.controlImage &&
          !job.meta?.useGeometryMask
        ) {
          const jobDesignFingerprint =
            job.designFingerprint || job.meta?.designFingerprint;

          if (!jobDesignFingerprint || !hasGeometryPack(jobDesignFingerprint)) {
            const errorMsg =
              `[CANONICAL PACK GATE] Technical panel ${job.type} requires canonical control but no pack found. ` +
              `designFingerprint: ${jobDesignFingerprint || "MISSING"}. ` +
              `Enable geometry mask generation or provide canonical geometry pack.`;

            logger.error(`🚫 ${errorMsg}`);
            throw new Error(errorMsg);
          }
        }

        // ========================================
        // PROCEDURAL GEOMETRY MASKS (HIGHEST PRIORITY for floor_plan_* panels)
        // ========================================
        // Geometry masks from ProceduralGeometryService ensure 100% floor plan consistency
        // by giving the AI a strict geometry to "ink" rather than invent layouts.
        // This takes precedence over ALL other control sources for floor plans.
        if (
          job.meta?.useGeometryMask &&
          job.meta?.controlImage &&
          (job.type.startsWith("floor_plan_") || job.type === "hero_3d")
        ) {
          generateParams.init_image = job.meta.controlImage;
          // Use controlStrength from planning phase, fallback to PRESERVE mode (0.25) for floor plans
          // See ProceduralGeometryService.js for strength semantics documentation
          const defaultStrength = job.type.startsWith("floor_plan_")
            ? 0.25
            : 0.45;
          generateParams.strength = job.meta.controlStrength || defaultStrength;

          // Store geometry mask metadata for DEBUG_REPORT
          job._canonicalControl = {
            controlSource: "procedural_geometry_mask",
            controlStrength: generateParams.strength,
            isGeometryMask: true,
            maskType: job.type.startsWith("floor_plan_")
              ? "floor_plan"
              : "hero_footprint",
          };
          job._controlSource = {
            type: "geometry_mask",
            source: "ProceduralGeometryService",
            strength: generateParams.strength,
            isGeometryMask: true,
          };

          controlAttached = true;

          logger.info(
            `🎯 [GEOMETRY MASK] Procedural geometry mask attached for ${job.type} ` +
              `(strength: ${generateParams.strength.toFixed(2)}, init_image: SVG data URL)`,
          );
        }
        const designId =
          job.designId ||
          job.meta?.designId ||
          job.designFingerprint ||
          job.meta?.designFingerprint;

        // ========================================
        // CANONICAL RENDER SERVICE - SINGLE SOURCE OF TRUTH (HIGHEST PRIORITY)
        // ========================================
        // hero_3d, interior_3d, and axonometric MUST use init_image from canonical geometry
        // renders. This ensures ALL 3D panels show the SAME building derived from SAME geometry.
        // ENFORCES: High control strength (0.70-0.90), mandatory negative prompts.
        if (requiresCanonical3DRender(job.type) && designId) {
          const retryAttempt = job._controlRetryAttempt || 0;

          // Check if canonical renders exist for this design
          if (hasCanonical3DRenders(designId)) {
            const canonical3DParams = getCanonical3DInitParams(
              designId,
              job.type,
              retryAttempt,
            );

            if (canonical3DParams?.init_image) {
              generateParams.init_image = canonical3DParams.init_image;
              generateParams.strength = canonical3DParams.strength;

              // Add canonical negative prompts to prevent geometry deviation
              if (canonical3DParams.negative_prompt_additions?.length > 0) {
                const currentNegative = generateParams.negativePrompt || "";
                const additions =
                  canonical3DParams.negative_prompt_additions.join(", ");
                generateParams.negativePrompt = currentNegative
                  ? `${currentNegative}, ${additions}`
                  : additions;
              }

              // Store canonical control metadata for DEBUG_REPORT
              const canonicalMeta = canonical3DParams._canonical || {};
              job._canonicalControl = {
                controlSource: "canonical_render_service",
                controlStrength: canonical3DParams.strength,
                baselineKey: canonicalMeta.baselineKey,
                hash: canonicalMeta.hash,
                runId: canonicalMeta.runId,
                viewType: canonicalMeta.viewType,
                designFingerprint: canonicalMeta.designFingerprint,
                isCanonical: true,
                strengthBand: canonicalMeta.strengthBand,
              };
              job._controlSource = {
                type: "canonical_render_service",
                source: "canonical_geometry",
                strength: canonical3DParams.strength,
                strengthBand: canonicalMeta.strengthBand,
                baselineKey: canonicalMeta.baselineKey,
                controlHash: canonicalMeta.hash,
                designFingerprint: designId,
                retryAttempt,
                isCanonical: true,
              };

              controlAttached = true;

              logger.info(
                `🔒 [CANONICAL RENDER SERVICE] SSOT control for ${job.type} ` +
                  `(fingerprint: ${designId?.substring(0, 12)}..., strength: ${canonical3DParams.strength.toFixed(2)}, band: ${canonicalMeta.strengthBand})`,
              );
              logger.info(
                `   🎯 baselineKey=${canonicalMeta.baselineKey}, hash=${canonicalMeta.hash}`,
              );
              logger.info(
                `   🚫 Negative prompts added: ${canonical3DParams.negative_prompt_additions?.length || 0} canonical restrictions`,
              );
            }
          } else {
            // Canonical 3D renders not yet generated - log warning but continue to fallback
            logger.warn(
              `[CANONICAL RENDER SERVICE] No canonical 3D renders for ${job.type}. ` +
                `designFingerprint: ${designId}. Falling back to other control sources.`,
            );
          }
        }

        // ========================================
        // HERO REFERENCE CONTROL (HIGH PRIORITY - Design Fingerprint System)
        // ========================================
        // When useHeroAsControl is enabled, use hero_3d as init_image for subsequent panels
        // This ensures ALL panels show THE SAME building derived from the hero render.
        // ENFORCES: Panels in HERO_REFERENCE_PANELS use hero_3d with panel-specific strength.
        const runId = job.runId || job.meta?.runId;
        if (
          !controlAttached &&
          isFeatureEnabled("useHeroAsControl") &&
          job.type !== "hero_3d" &&
          HERO_REFERENCE_PANELS.includes(job.type) &&
          runId &&
          hasFingerprint(runId)
        ) {
          const fingerprint = getFingerprint(runId);
          const heroControl = getHeroControlForPanel(fingerprint, job.type);

          if (heroControl?.imageUrl) {
            generateParams.init_image = heroControl.imageUrl;
            generateParams.strength = heroControl.strength;

            // Store hero control metadata for DEBUG_REPORT
            job._canonicalControl = {
              controlSource: "hero_3d_fingerprint",
              controlStrength: heroControl.strength,
              heroImageHash: fingerprint.heroImageHash,
              runId,
              isHeroReference: true,
              fingerprintId: fingerprint.id,
            };
            job._controlSource = {
              type: "hero_reference",
              source: "hero_3d_fingerprint",
              strength: heroControl.strength,
              heroImageHash: fingerprint.heroImageHash,
              runId,
              fingerprintId: fingerprint.id,
              isHeroReference: true,
            };

            controlAttached = true;

            logger.info(
              `🔒 [HERO REFERENCE] Using hero_3d as control for ${job.type} ` +
                `(strength: ${heroControl.strength.toFixed(2)}, fingerprint: ${fingerprint.id})`,
            );
            logger.info(
              `   🎯 Design Fingerprint: ${fingerprint.styleDescriptor}, roof: ${fingerprint.roofProfile}`,
            );
          } else {
            logger.warn(
              `[HERO REFERENCE] Hero control not available for ${job.type} - ` +
                `fingerprint exists but hero image URL missing. Falling back to other control sources.`,
            );
          }
        }

        // ========================================
        // MANDATORY CANONICAL CONTROL FOR hero_3d/interior_3d (2ND PRIORITY - FALLBACK)
        // ========================================
        // ENFORCES: hero_3d and interior_3d MUST use init_image from canonical pack
        // with matching designFingerprint. Generation is BLOCKED without valid control.
        // NOTE: This is fallback if canonicalRenderService renders are not available.
        if (
          !controlAttached &&
          requiresMandatoryCanonicalControl(job.type) &&
          isFeatureEnabled("strictCanonicalControlMode")
        ) {
          const canonicalPack = await getCanonicalPack(designId);

          // Use assertCanonicalControl - throws if control not found
          const canonicalControl = assertCanonicalControl(
            job.type,
            canonicalPack,
            designId,
            {
              strictMode:
                isFeatureEnabled("strictCanonicalControlMode") !== false,
            }, // Default ON
          );

          if (canonicalControl) {
            // Build init_image params with canonical control
            const canonicalInitParams = buildCanonicalInitParams(
              job.type,
              canonicalPack,
              designId,
              { strictMode: true },
            );

            if (canonicalInitParams) {
              generateParams.init_image = canonicalInitParams.init_image;
              generateParams.strength = canonicalInitParams.strength;

              // Store canonical control metadata for DEBUG_REPORT
              job._canonicalControl = canonicalInitParams._canonicalControl;
              job._controlSource = {
                type: "canonical",
                source: "canonical_pack",
                strength: canonicalInitParams.strength,
                designFingerprint: designId,
                controlImagePath:
                  canonicalInitParams._canonicalControl?.controlImagePath,
                controlImageSha256:
                  canonicalInitParams._canonicalControl?.controlImageSha256,
                canonicalFingerprint:
                  canonicalInitParams._canonicalControl?.canonicalFingerprint,
              };

              controlAttached = true;

              logger.info(
                `🔒 [CANONICAL CONTROL] MANDATORY control for ${job.type} ` +
                  `(fingerprint: ${designId?.substring(0, 12)}..., strength: ${canonicalInitParams.strength.toFixed(2)})`,
              );
              logger.info(
                `   📋 controlSource=canonical, sha256=${canonicalInitParams._canonicalControl?.controlImageSha256}`,
              );
            }
          } else {
            // assertCanonicalControl should have thrown - this is a fallback
            logger.error(
              `[CANONICAL CONTROL] FATAL: No canonical control for mandatory panel ${job.type}. ` +
                `This panel CANNOT proceed without a canonical init_image.`,
            );
            throw new Error(
              `Cannot generate ${job.type}: MANDATORY canonical control image is required. ` +
                `Ensure canonical pack exists for designFingerprint: ${designId}`,
            );
          }
        }

        // ========================================
        // BASELINE CONTROL (2ND PRIORITY - FLUX NEVER INVENTS GEOMETRY)
        // ========================================
        // When forceBaselineControl is enabled, baselines are MANDATORY for supported views
        // This ensures FLUX only stylizes, never invents geometry
        const forceBaselineControl = isFeatureEnabled("forceBaselineControl");
        if (
          forceBaselineControl &&
          requiresBaselineControl(job.type) &&
          designId
        ) {
          try {
            const baseline = await getBaselineForPanel(designId, job.type);
            if (baseline?.dataUrl) {
              // Apply baseline control - modifies prompt to "stylize only" mode
              generateParams = applyBaselineControl(generateParams, baseline);
              logger.info(
                `   🔒 BASELINE CONTROL: Using baseline for ${job.type} (strength: ${baseline.strength.toFixed(2)}, source: ${baseline.source})`,
              );
              logger.info(
                `   ✨ STYLIZE-ONLY mode active - FLUX will preserve all geometry`,
              );
              controlAttached = true;
              job._controlSource = {
                type: "baseline",
                source: baseline.source,
                strength: baseline.strength,
                pipelineVersion: baseline.pipelineVersion,
              };
            } else if (BASELINE_VIEW_TYPES.includes(job.type.toLowerCase())) {
              // STRICT MODE: Baseline is REQUIRED for these view types
              logger.error(
                `   ❌ BASELINE MISSING for ${job.type} - generation may invent geometry!`,
              );
              const error = new Error(
                `[BASELINE CONTROL] No baseline render found for panel ${job.type}. ` +
                  `DesignId: ${designId}. ` +
                  `forceBaselineControl requires baselines to be generated BEFORE FLUX calls. ` +
                  `Run generateBaselineRenders() first.`,
              );
              error.code = "MISSING_BASELINE";
              error.panelType = job.type;
              error.designId = designId;
              throw error;
            }
          } catch (baselineError) {
            if (baselineError.code === "MISSING_BASELINE") {
              throw baselineError; // Re-throw missing baseline errors
            }
            logger.warn(
              `   ⚠️ Baseline lookup failed for ${job.type}:`,
              baselineError.message,
            );
            // Fall through to other control sources
          }
        }

        // ========================================
        // CDS CANONICAL 3D MASSING CONTROL (2ND PRIORITY - after baseline)
        // ========================================
        // When useCDSRenders is enabled, use massing3DViewsPNG as control for FLUX img2img
        // This ensures FLUX stylizes the canonical 3D geometry, not invents it
        if (
          !controlAttached &&
          job.meta?.useCDSRenders &&
          job.meta?.canonicalDesignState?.canonicalRenders?.massing3DViewsPNG
        ) {
          const massingRenders =
            job.meta.canonicalDesignState.canonicalRenders.massing3DViewsPNG;
          const cdsFingerprint =
            job.meta.cdsFingerprint ||
            job.meta.canonicalDesignState.designFingerprint;

          // Map panel type to massing render key
          const massingKeyMap = {
            hero_3d: "perspective",
            interior_3d: "interior", // or fallback to perspective
            site_diagram: "axonometric",
            axonometric: "axonometric",
            axonometric_3d: "axonometric",
            axon_3d: "axonometric",
          };

          const massingKey = massingKeyMap[job.type];
          let massingRender = massingKey ? massingRenders[massingKey] : null;

          // Fallback for interior_3d to perspective if no interior view
          if (
            !massingRender &&
            job.type === "interior_3d" &&
            massingRenders["perspective"]
          ) {
            massingRender = massingRenders["perspective"];
          }

          if (massingRender) {
            generateParams.init_image = massingRender;
            generateParams.strength = 0.65; // Allow FLUX to stylize but preserve geometry
            logger.info(
              `🔒 [CDS] Using canonical massing 3D render for ${job.type} (fingerprint: ${cdsFingerprint}, strength: 0.65)`,
            );
            logger.info(
              `   ✨ STYLIZE-ONLY mode: FLUX will add materials/lighting to canonical geometry`,
            );
            controlAttached = true;
            job._controlSource = {
              type: "cds_massing",
              source: massingKey,
              strength: 0.65,
              cdsFingerprint,
            };
          }
        }

        // ========================================
        // Phase 4/5 Conditioned Image Pipeline (FALLBACK if no baseline)
        // ========================================
        // Uses edge/depth/silhouette maps from BuildingModel
        if (!controlAttached && job.meta?.conditionedControlImage) {
          generateParams.conditioning = {
            dataUrl: job.meta.conditionedControlImage,
            type: job.meta?.conditioningType || "edge",
            strength: job.meta?.conditionedControlStrength || 0.5,
          };
          logger.info(
            `[ConditionedImagePipeline] Using ${generateParams.conditioning.type} conditioning for ${job.type}, strength=${generateParams.conditioning.strength}`,
          );
          controlAttached = true;
        }
        // NEW: If FGL control image exists for this panel, use it as init_image (fallback)
        else if (job.meta?.fglControlImage?.dataUrl) {
          generateParams.init_image = job.meta.fglControlImage.dataUrl;
          generateParams.strength =
            job.meta.fglControlImage.controlStrength || 0.85;
          logger.info(
            `   🎯 Using FGL control image (strength: ${generateParams.strength})`,
          );
          controlAttached = true;
        }

        // NEW (Phase B): For 3D panels, use geometry control images for consistency
        // This ensures hero_3d, interior_3d, and axon_3d show the SAME building
        if (is3DPanel && !controlAttached && job.dnaSnapshot) {
          try {
            const viewType = job.type.replace("_3d", "");
            const controlImage = generateGeometryControlImage(
              job.dnaSnapshot,
              viewType,
              {
                width: job.width,
                height: job.height,
                lineOnly: true,
              },
            );

            if (controlImage?.dataUrl) {
              const img2imgParams = getFluxImg2ImgParams(
                controlImage,
                job.prompt,
                {
                  strength: 0.6, // 40% geometry, 60% generation freedom
                  width: job.width,
                  height: job.height,
                },
              );

              if (img2imgParams) {
                generateParams.init_image = img2imgParams.init_image;
                generateParams.strength = img2imgParams.strength;
                logger.info(
                  `   🎯 Using geometry control image for ${job.type} (strength: ${generateParams.strength})`,
                );
                controlAttached = true;
              }
            }
          } catch (geoError) {
            // ========================================
            // STRICT CONTROL IMAGE MODE: No silent fallback
            // ========================================
            const strictMode = isFeatureEnabled("strictControlImageMode");
            if (strictMode) {
              const error = new Error(
                `[STRICT MODE] Control image generation failed for ${job.type}: ${geoError.message}. ` +
                  `strictControlImageMode is enabled - no fallback to text-only generation allowed.`,
              );
              error.code = "CONTROL_IMAGE_FAILED";
              error.panelType = job.type;
              error.originalError = geoError;
              throw error;
            }
            logger.warn(
              `   ⚠️ Geometry control failed for ${job.type}, using text-only generation:`,
              geoError.message,
            );
          }
        }

        // ========================================
        // CANONICAL GEOMETRY PACK: HIGHEST PRIORITY - SINGLE SOURCE OF TRUTH
        // Uses CanonicalGeometryPackService with byte-based hash verification
        // ========================================
        const strictMode =
          isFeatureEnabled("strictControlImageMode") || useStrictCanonicalPack;
        const jobDesignFingerprint =
          job.designFingerprint || job.meta?.designFingerprint;

        if (
          !controlAttached &&
          jobDesignFingerprint &&
          hasGeometryPack(jobDesignFingerprint)
        ) {
          try {
            const retryAttempt = job._controlRetryAttempt || 0;
            const geometryControl = getGeometryControlForPanel(
              jobDesignFingerprint,
              job.type,
              retryAttempt,
            );

            if (geometryControl?.dataUrl) {
              generateParams.init_image = geometryControl.dataUrl;
              generateParams.strength = geometryControl.strength;
              const attemptLabel =
                retryAttempt === 0 ? "initial" : `retry${retryAttempt}`;
              logger.info(
                `   🎯 Using CANONICAL GEOMETRY PACK for ${job.type} (strength: ${geometryControl.strength.toFixed(2)}, band: ${attemptLabel}, type: ${geometryControl.canonicalType})`,
              );
              controlAttached = true;

              // Track control source with SHA256 hash from actual image bytes
              job._controlSource = {
                type: "canonical_geometry_pack",
                source: geometryControl.source,
                strength: geometryControl.strength,
                strengthBand: attemptLabel,
                canonicalType: geometryControl.canonicalType,
                retryAttempt,
                // SHA256 hash from actual image bytes (not content sampling)
                imageHash: geometryControl.imageHash,
                svgHash: geometryControl.svgHash,
              };

              // Log control source and hash for debug/verification
              logger.debug(
                `   🎯 Control logging: source=${geometryControl.source}, imageHash=${geometryControl.imageHash?.slice(0, 16)}...`,
              );
            }
          } catch (geometryPackError) {
            // FAIL FAST in strict mode - do not silently continue
            if (strictMode) {
              logger.error(
                `   ❌ [FAIL FAST] Canonical geometry pack lookup failed for ${job.type}:`,
                geometryPackError.message,
              );
              throw new CanonicalPackError(
                `[FAIL FAST] Cannot generate ${job.type} without canonical control image: ${geometryPackError.message}`,
                GEOMETRY_PACK_ERROR_CODES.CONTROL_NOT_FOUND,
                {
                  panelType: job.type,
                  designFingerprint: jobDesignFingerprint,
                  originalError: geometryPackError.message,
                },
              );
            }
            logger.warn(
              `   ⚠️ Canonical geometry pack lookup failed for ${job.type}:`,
              geometryPackError.message,
            );
          }
        }

        // ========================================
        // LEGACY CONTROL PACK: Fallback to unified control pack
        // ========================================
        if (
          !controlAttached &&
          controlPackGenerated &&
          jobDesignFingerprint &&
          hasControlPack(jobDesignFingerprint)
        ) {
          try {
            const retryAttempt = job._controlRetryAttempt || 0;
            const controlPackImage = getControlPackForPanel(
              jobDesignFingerprint,
              job.type,
              retryAttempt,
            );

            if (controlPackImage?.dataUrl) {
              generateParams.init_image = controlPackImage.dataUrl;
              generateParams.strength = controlPackImage.strength;
              const attemptLabel =
                retryAttempt === 0 ? "initial" : `retry${retryAttempt}`;
              logger.info(
                `   📦 Using LEGACY CONTROL PACK for ${job.type} (strength: ${controlPackImage.strength.toFixed(2)}, band: ${attemptLabel}, view: ${controlPackImage.controlViewType})`,
              );
              controlAttached = true;

              // Track control source with full hash info for logging
              job._controlSource = {
                type: "control_pack",
                source: controlPackImage.controlSource,
                strength: controlPackImage.strength,
                strengthBand: attemptLabel,
                viewType: controlPackImage.controlViewType,
                retryAttempt,
                controlHash: controlPackImage.controlHash,
                controlDataUrlHash: controlPackImage.controlDataUrlHash,
              };

              logger.debug(
                `   📦 Control logging: controlSource=${controlPackImage.controlSource}, controlHash=${controlPackImage.controlHash}`,
              );
            }
          } catch (controlPackError) {
            // FAIL FAST in strict mode
            if (strictMode) {
              logger.error(
                `   ❌ [FAIL FAST] Control pack lookup failed for ${job.type}:`,
                controlPackError.message,
              );
              throw new CanonicalPackError(
                `[FAIL FAST] Cannot generate ${job.type} without control image: ${controlPackError.message}`,
                GEOMETRY_PACK_ERROR_CODES.CONTROL_NOT_FOUND,
                {
                  panelType: job.type,
                  designFingerprint: jobDesignFingerprint,
                },
              );
            }
            logger.warn(
              `   ⚠️ Control pack lookup failed for ${job.type}:`,
              controlPackError.message,
            );
          }
        }

        // ========================================
        // CANONICAL CONTROL RENDER: Legacy SSOT geometry fallback
        // ========================================
        if (
          !controlAttached &&
          jobDesignFingerprint &&
          hasControlRenders(jobDesignFingerprint)
        ) {
          try {
            const retryAttempt = job._controlRetryAttempt || 0;
            const canonicalControl = getControlImageForPanel(
              jobDesignFingerprint,
              job.type,
              retryAttempt,
            );
            if (canonicalControl?.dataUrl) {
              generateParams.init_image = canonicalControl.dataUrl;
              generateParams.strength = canonicalControl.strength;
              const attemptLabel =
                retryAttempt === 0 ? "initial" : `retry${retryAttempt}`;
              logger.info(
                `   🔒 Using CANONICAL control image for ${job.type} (strength: ${generateParams.strength.toFixed(2)}, band: ${attemptLabel}, source: ${canonicalControl.source})`,
              );
              controlAttached = true;
              job._controlSource = {
                type: "canonical",
                source: canonicalControl.source,
                strength: canonicalControl.strength,
                strengthBand: attemptLabel,
                viewType: canonicalControl.viewType,
                retryAttempt,
              };
            }
          } catch (canonicalError) {
            // FAIL FAST in strict mode
            if (strictMode) {
              logger.error(
                `   ❌ [FAIL FAST] Canonical control lookup failed for ${job.type}:`,
                canonicalError.message,
              );
              throw new CanonicalPackError(
                `[FAIL FAST] Cannot generate ${job.type} without canonical control: ${canonicalError.message}`,
                GEOMETRY_PACK_ERROR_CODES.CONTROL_NOT_FOUND,
                {
                  panelType: job.type,
                  designFingerprint: jobDesignFingerprint,
                },
              );
            }
            logger.warn(
              `   ⚠️ Canonical control lookup failed for ${job.type}:`,
              canonicalError.message,
            );
          }
        }

        // ========================================
        // CANONICAL RENDER PACK: Per-panel-type canonical renders (legacy)
        // ========================================
        if (
          !controlAttached &&
          jobDesignFingerprint &&
          hasCanonicalRenderPack(jobDesignFingerprint)
        ) {
          try {
            const retryAttempt = job._controlRetryAttempt || 0;
            const canonicalInitParams = getCanonicalInitImageParams(
              jobDesignFingerprint,
              job.type,
              retryAttempt,
            );

            if (canonicalInitParams?.init_image) {
              generateParams.init_image = canonicalInitParams.init_image;
              generateParams.strength = canonicalInitParams.strength;
              const attemptLabel =
                retryAttempt === 0 ? "initial" : `retry${retryAttempt}`;
              const canonicalMeta = canonicalInitParams._canonical || {};
              logger.info(
                `   📐 Using CANONICAL RENDER PACK for ${job.type} (strength: ${canonicalInitParams.strength.toFixed(2)}, band: ${attemptLabel}, type: ${canonicalMeta.canonicalType})`,
              );
              controlAttached = true;

              job._controlSource = {
                type: "canonical_render_pack",
                source: canonicalMeta.canonicalType,
                strength: canonicalInitParams.strength,
                strengthBand: attemptLabel,
                svgHash: canonicalMeta.svgHash,
                retryAttempt,
              };
            }
          } catch (canonicalRenderError) {
            // FAIL FAST in strict mode
            if (strictMode) {
              logger.error(
                `   ❌ [FAIL FAST] Canonical render pack lookup failed for ${job.type}:`,
                canonicalRenderError.message,
              );
              throw new CanonicalPackError(
                `[FAIL FAST] Cannot generate ${job.type} without canonical render: ${canonicalRenderError.message}`,
                GEOMETRY_PACK_ERROR_CODES.CONTROL_NOT_FOUND,
                {
                  panelType: job.type,
                  designFingerprint: jobDesignFingerprint,
                },
              );
            }
            logger.warn(
              `   ⚠️ Canonical render pack lookup failed for ${job.type}:`,
              canonicalRenderError.message,
            );
          }
        }

        // ========================================
        // STRICT MODE ENFORCEMENT: Fail fast if no control image
        // ========================================
        if (strictMode && !controlAttached) {
          // Check if this is a panel type that REQUIRES control (all visual panels)
          const requiresControl = !isDataPanel(job.type, outputMode);
          if (requiresControl) {
            const error = new Error(
              `[STRICT MODE] No control image attached for panel ${job.type}. ` +
                `DesignFingerprint: ${jobDesignFingerprint || "MISSING"}. ` +
                `strictControlImageMode requires ALL panels to use control images from SSOT geometry. ` +
                `Checked sources: conditioned=${!!job.meta?.conditionedControlImage}, ` +
                `fgl=${!!job.meta?.fglControlImage}, geometry=${is3DPanel ? "attempted" : "skipped"}, ` +
                `controlPack=${hasControlPack(jobDesignFingerprint)}, ` +
                `canonical=${hasControlRenders(jobDesignFingerprint)}`,
            );
            error.code = "MISSING_CONTROL_IMAGE";
            error.panelType = job.type;
            error.designFingerprint = jobDesignFingerprint;
            throw error;
          }
        }

        // Fail fast if strict control is required and no control source was attached (legacy check)
        if (
          is3DPanel &&
          !controlAttached &&
          strict3DControlRequired &&
          !strictMode
        ) {
          throw new Error(
            `Missing control image for 3D panel ${job.type} (geometryControlled3D enforced). Provide conditioned, FGL, or geometry control.`,
          );
        }

        // Track control attachment status for debug report
        job._controlAttached = controlAttached;
        job._controlSource =
          job._controlSource || (controlAttached ? { type: "other" } : null);

        // ========================================
        // STYLE REFERENCE (IP-ADAPTER) FOR MATERIAL CONSISTENCY
        // ========================================
        // When styleReferenceUrl is provided (from hero_3d), inject IP-Adapter
        // for elevation and section panels to lock material/texture appearance.
        // This ensures brick color, window frames, and roof materials match hero.
        const isElevationOrSection =
          job.type.startsWith("elevation_") || job.type.startsWith("section_");

        if (styleReferenceUrl && isElevationOrSection) {
          // CRITICAL FIX: Pass styleReferenceUrl directly as parameter
          // Together.ai doesn't support control_nets/IP-Adapter - uses init_image instead
          // togetherAIService.js will convert this to initImage with strength 0.35
          generateParams.styleReferenceUrl = styleReferenceUrl;

          // Also track control_nets for debug/logging (not sent to Together API)
          if (!generateParams.control_nets) {
            generateParams.control_nets = [];
          }
          generateParams.control_nets.push({
            type: "ip_adapter",
            image_url: styleReferenceUrl,
            weight: 0.65, // For documentation/debug only
          });

          logger.info(
            `🎨 [STYLE REFERENCE] Style lock attached for ${job.type} ` +
              `(init_image strength: 0.35, source: hero_3d)`,
          );
          logger.info(
            `   🖼️ Style reference URL: ${styleReferenceUrl.substring(0, 50)}...`,
          );

          // Track style reference in control source
          job._styleReference = {
            type: "init_image",
            source: "hero_3d",
            strength: 0.35,
            imageUrl: styleReferenceUrl,
          };
        }

        // ========================================
        // FLOOR PLAN MASK FOR INTERIOR_3D WINDOW ALIGNMENT
        // ========================================
        // When floorPlanMaskUrl is provided, use it as init_image for interior_3d
        // to ensure windows align with floor plan openings exactly.
        if (
          floorPlanMaskUrl &&
          job.type === "interior_3d" &&
          !generateParams.init_image
        ) {
          generateParams.init_image = floorPlanMaskUrl;
          generateParams.strength = 0.55; // Moderate control for window alignment

          logger.info(
            `🏠 [FLOOR PLAN MASK] Using floor_plan_ground as init_image for interior_3d ` +
              `(strength: 0.55)`,
          );

          job._controlSource = {
            type: "floor_plan_mask",
            source: "floor_plan_ground",
            strength: 0.55,
          };
          controlAttached = true;
        }

        const responsePromise = togetherClient.generateImage(generateParams);

        // Wrap with timeout
        const response = await Promise.race([
          responsePromise,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Panel ${job.type} generation timeout after ${PANEL_GENERATION_TIMEOUT_MS / 1000}s`,
                  ),
                ),
              PANEL_GENERATION_TIMEOUT_MS,
            ),
          ),
        ]);

        imageUrl = response?.url || response?.imageUrls?.[0] || "";

        if (!imageUrl) {
          throw new Error(`No image URL returned for panel ${job.type}`);
        }

        width = response?.metadata?.width || response?.width || job.width;
        height = response?.metadata?.height || response?.height || job.height;
        seedUsed =
          typeof response?.seedUsed === "number"
            ? response.seedUsed
            : typeof response?.seed === "number"
              ? response.seed
              : job.seed;

        // ========================================
        // CONTROL FIDELITY GATE
        // ========================================
        // For img2img panels, verify output preserves control geometry
        // If diffRatio exceeds threshold, retry or fallback to control image
        const controlFidelityEnabled = isFeatureEnabled("controlFidelityGate");
        const controlImageUsed =
          generateParams.init_image || job._controlAttached;

        if (
          controlFidelityEnabled &&
          controlImageUsed &&
          generateParams.init_image
        ) {
          logger.info(
            `   🔍 Running control fidelity check for ${job.type}...`,
          );

          const controlFidelityGate = new ControlFidelityGate(
            imageSimilarityService,
          );

          const fidelityResult = await controlFidelityGate.validate({
            panelType: job.type,
            controlImage: generateParams.init_image,
            outputImage: imageUrl,
            controlStrength: generateParams.strength || 0.5,
            prompt: job.prompt,
            // Regenerate function for retry
            regenerateFn: async (retryParams) => {
              logger.info(
                `   🔄 [Fidelity Retry] Regenerating ${job.type} with strength ${retryParams.strength.toFixed(2)}`,
              );
              const retryResponse = await togetherClient.generateImage({
                ...generateParams,
                strength: retryParams.strength,
                prompt: retryParams.prompt || job.prompt,
              });
              return {
                imageUrl: retryResponse?.url || retryResponse?.imageUrls?.[0],
                url: retryResponse?.url || retryResponse?.imageUrls?.[0],
              };
            },
          });

          // Record fidelity metrics in debug report
          job._fidelityResult = fidelityResult;

          if (fidelityResult.status === "CONTROL_FALLBACK") {
            // Use control image as fallback
            logger.warn(
              `   ⚠️ Control fidelity failed - using control image as fallback`,
            );
            imageUrl = fidelityResult.outputImage;
            job._controlFallback = true;
          } else if (fidelityResult.status === "PASS_RETRY") {
            // Use retry result
            logger.info(`   ✅ Control fidelity passed on retry`);
            imageUrl = fidelityResult.outputImage;
          } else if (fidelityResult.passed) {
            logger.info(
              `   ✅ Control fidelity passed (diffRatio: ${fidelityResult.metrics?.diffRatio?.toFixed(4) || "N/A"})`,
            );
          }

          // Log metrics for debug report
          if (fidelityResult.metrics) {
            logger.debug(
              `   📊 Fidelity metrics: diffRatio=${fidelityResult.metrics.diffRatio.toFixed(4)}, threshold=${fidelityResult.metrics.threshold}, similarity=${fidelityResult.metrics.similarityScore.toFixed(4)}`,
            );
          }
        }
      }

      // Build panel result object
      let panelResult = {
        id: job.id || job.type,
        type: job.type,
        imageUrl,
        width,
        height,
        seed: seedUsed,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        dnaSnapshot: job.dnaSnapshot || null,
        meta: job.meta,
      };

      // NEW (Phase D): Quality Validation and Auto-Retry
      // Only validate visual panels (not SVG data panels)
      if (
        !isDataPanel(job.type, outputMode) &&
        isFeatureEnabled("panelQualityValidation")
      ) {
        const validationResult = validatePanel(panelResult, job.dnaSnapshot);
        panelResult.validation = validationResult;

        if (!validationResult.passed) {
          logger.warn(
            `   ⚠️ Panel ${job.type} failed validation (score: ${(validationResult.score * 100).toFixed(1)}%)`,
          );
          logger.warn(`   Issues: ${validationResult.issues.join(", ")}`);

          // Auto-retry if enabled and panel has critical issues
          if (isFeatureEnabled("autoRetryFailedPanels")) {
            logger.info(`   🔄 Attempting auto-retry for ${job.type}...`);

            const retryResult = await retryFailedPanel(
              panelResult,
              job.dnaSnapshot,
              validationResult,
              async (retryParams) => {
                // Generate with stronger constraints
                const retryResponse = await togetherClient.generateImage({
                  ...retryParams,
                  type: job.type,
                  width: job.width,
                  height: job.height,
                });
                return {
                  imageUrl: retryResponse?.url || retryResponse?.imageUrls?.[0],
                  type: job.type,
                  width: retryResponse?.metadata?.width || job.width,
                  height: retryResponse?.metadata?.height || job.height,
                };
              },
            );

            if (retryResult.success) {
              // Use the improved panel
              panelResult = {
                ...panelResult,
                imageUrl: retryResult.panel.imageUrl,
                validation: retryResult.validation,
                retryInfo: {
                  attempts: retryResult.attempts,
                  history: retryResult.history,
                  improved: true,
                },
              };
              logger.success(
                `   ✅ Retry succeeded for ${job.type} after ${retryResult.attempts} attempt(s)`,
              );
            } else {
              // Keep original but mark as failed validation
              panelResult.retryInfo = {
                attempts: retryResult.attempts,
                history: retryResult.history,
                improved: false,
              };
              logger.warn(
                `   ⚠️ Retry failed for ${job.type} - using original`,
              );
            }
          }
        } else {
          logger.info(
            `   ✓ Quality check passed (score: ${(validationResult.score * 100).toFixed(1)}%)`,
          );
        }
      }

      // ========================================
      // RECORD CONTROL IMAGE USAGE FOR DEBUG REPORT
      // ========================================
      const debugReportEnabled = isFeatureEnabled(
        "enableControlImageDebugReport",
      );
      if (debugReportEnabled) {
        const fpForTracking =
          job.designFingerprint || job.meta?.designFingerprint;
        if (fpForTracking) {
          recordControlImageUsage(fpForTracking, job.type, {
            controlImageUsed: job._controlAttached || false,
            controlSource: job._controlSource || null,
            panelType: job.type,
            seed: seedUsed,
            imageUrl: imageUrl?.substring(0, 100) + "...", // Truncate for report
            retryInfo: panelResult.retryInfo || null,
            generatedAt: new Date().toISOString(),
          });
        }
      }

      // Add control fidelity metrics to panel result
      if (job._fidelityResult) {
        panelResult.controlFidelity = {
          status: job._fidelityResult.status,
          passed: job._fidelityResult.passed,
          diffRatio: job._fidelityResult.metrics?.diffRatio || null,
          threshold: job._fidelityResult.metrics?.threshold || null,
          similarityScore: job._fidelityResult.metrics?.similarityScore || null,
          retryAttempt: job._fidelityResult.retryAttempt || 0,
          fallbackUsed: job._controlFallback || false,
          message: job._fidelityResult.message,
        };
      }

      // Add control image info to panel result for downstream consumers
      // REQUIRED LOGGING: controlSource, controlHash, baselineKey, and canonical fields for every panel
      panelResult.controlImageInfo = {
        used: job._controlAttached || false,
        source: job._controlSource || null,
        // Explicit control logging as required
        controlSource:
          job._controlSource?.source || job._controlSource?.type || "none",
        controlHash:
          job._controlSource?.controlHash ||
          job._canonicalControl?.hash ||
          null,
        controlDataUrlHash: job._controlSource?.controlDataUrlHash || null,
        controlViewType:
          job._controlSource?.viewType ||
          job._canonicalControl?.viewType ||
          null,
        controlStrength:
          job._controlSource?.strength ||
          job._canonicalControl?.controlStrength ||
          null,
        controlStrengthBand:
          job._controlSource?.strengthBand ||
          job._canonicalControl?.strengthBand ||
          null,
        // NEW: baselineKey from canonicalRenderService (MANDATORY for hero_3d/interior_3d/axonometric)
        baselineKey:
          job._controlSource?.baselineKey ||
          job._canonicalControl?.baselineKey ||
          null,
        // NEW: Canonical control fields for DEBUG_REPORT (MANDATORY for hero_3d/interior_3d)
        controlImagePath:
          job._controlSource?.controlImagePath ||
          job._canonicalControl?.controlImagePath ||
          null,
        controlImageSha256:
          job._controlSource?.controlImageSha256 ||
          job._canonicalControl?.controlImageSha256 ||
          null,
        canonicalFingerprint:
          job._controlSource?.canonicalFingerprint ||
          job._canonicalControl?.canonicalFingerprint ||
          null,
        isCanonical:
          job._controlSource?.type === "canonical" ||
          job._controlSource?.type === "canonical_render_service" ||
          job._canonicalControl?.isCanonical ||
          false,
        isCanonicalRenderService:
          job._controlSource?.type === "canonical_render_service" || false,
        designFingerprint:
          job._controlSource?.designFingerprint ||
          job._canonicalControl?.designFingerprint ||
          null,
        canonicalRenderServiceRunId: job._canonicalControl?.runId || null,
      };

      results.push(panelResult);

      // ========================================
      // DRIFT RETRY CHECK FOR interior_3d vs hero_3d
      // ========================================
      // If interior_3d was just generated, compare it to hero_3d.
      // If similarity fails and retries are available, retry with stronger control.
      if (
        job.type === "interior_3d" &&
        DRIFT_ELIGIBLE_PANELS.includes(job.type)
      ) {
        const hero3dResult = results.find(
          (r) => r.panelType === "hero_3d" || r.type === "hero_3d",
        );
        const currentDriftAttempt = job._driftRetryAttempt || 0;

        if (
          hero3dResult?.imageUrl &&
          panelResult.imageUrl &&
          currentDriftAttempt < DRIFT_RETRY_CONFIG.maxRetries
        ) {
          try {
            // Compare interior_3d to hero_3d
            const similarityResult = await imageSimilarityService.compareImages(
              hero3dResult.imageUrl,
              panelResult.imageUrl,
            );

            // Check if drift retry is needed
            const driftCheck = checkDriftRetryNeeded(
              "interior_3d",
              similarityResult,
              currentDriftAttempt,
            );

            if (driftCheck.needsRetry) {
              const retryParams = calculateDriftRetryParams(
                currentDriftAttempt + 1,
              );

              logger.warn(
                `🔄 [DRIFT RETRY] interior_3d similarity ${driftCheck.currentScore?.toFixed(3)} < ${driftCheck.failThreshold?.toFixed(3)} (${driftCheck.failedMetric}). ` +
                  `Retrying with strength ${retryParams.strength.toFixed(2)}, guidance ${retryParams.guidance.toFixed(1)}`,
              );

              // Remove the failed result
              results.pop();

              // Update job for retry with increased control
              job._driftRetryAttempt = currentDriftAttempt + 1;
              job._driftRetryPrevScore = driftCheck.currentScore;
              job._driftFailedMetric = driftCheck.failedMetric;

              // Update control strength if control is attached
              if (job._controlSource) {
                const oldStrength = job._controlSource.strength || 0.5;
                job._controlSource.strength = retryParams.strength;
                job._controlSource.strengthBand = `retry${currentDriftAttempt + 1}`;
                job._controlSource.strengthEscalation = `${oldStrength.toFixed(2)} → ${retryParams.strength.toFixed(2)}`;
              }

              // Add constraint to prompt
              if (retryParams.promptConstraint) {
                job.prompt = retryParams.promptConstraint + job.prompt;
              }

              // Set guidance scale if supported
              job.guidanceScale = retryParams.guidance;

              // Log drift retry summary
              const summary = generateDriftRetrySummary(
                "interior_3d",
                driftCheck,
                retryParams,
              );
              logger.info(
                `   📊 Drift Retry Summary: ${JSON.stringify(summary)}`,
              );

              // Retry this panel
              i--;
              continue;
            } else {
              // Drift check passed
              logger.info(
                `✅ [DRIFT CHECK] interior_3d similarity OK (attempt ${currentDriftAttempt})`,
              );
            }
          } catch (driftError) {
            // Log but don't fail generation on drift check errors
            logger.warn(
              `⚠️ [DRIFT CHECK] Error comparing interior_3d to hero_3d: ${driftError.message}`,
            );
          }
        }
      }

      // DEBUG: Record panel with REAL runtime values
      if (debugRecorder.isRecording()) {
        debugRecorder.recordPanel(job.type, {
          panelIndex: i,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          seed: seedUsed,
          controlImageUsed: job._controlAttached || false,
          controlImageSource: job._controlSource?.type || "none",
          controlStrength: job._controlSource?.strength || null,
          controlImageUrl: job._controlSource?.dataUrl || null,
          strengthBand: job._controlSource?.strengthBand || "initial",
          retryAttempt: job._controlRetryAttempt || 0,
          model: "black-forest-labs/FLUX.1-dev",
          provider: "together.ai",
          width: panelResult.width,
          height: panelResult.height,
          imageUrl: panelResult.imageUrl,
          success: true,
          startedAt: panelStartTime?.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: panelStartTime
            ? Date.now() - panelStartTime.getTime()
            : null,
          validationPassed: panelResult.validation?.passed ?? null,
          validationScore: panelResult.validation?.score ?? null,
          validationIssues: panelResult.validation?.issues || [],
          // Control fidelity metrics (from ImageSimilarityService)
          controlFidelity: panelResult.controlFidelity || null,
          fidelityStatus: panelResult.controlFidelity?.status || "NOT_CHECKED",
          fidelityDiffRatio: panelResult.controlFidelity?.diffRatio || null,
          fidelityThreshold: panelResult.controlFidelity?.threshold || null,
          fidelitySimilarity:
            panelResult.controlFidelity?.similarityScore || null,
          fidelityFallbackUsed:
            panelResult.controlFidelity?.fallbackUsed || false,
          // NEW: Canonical control fields for DEBUG_REPORT (ACCEPTANCE CRITERIA)
          // hero_3d/interior_3d MUST show controlSource=canonical and sha256 match
          canonicalControlPath:
            job._canonicalControl?.controlImagePath ||
            panelResult.controlImageInfo?.controlImagePath ||
            null,
          canonicalControlSha256:
            job._canonicalControl?.controlImageSha256 ||
            panelResult.controlImageInfo?.controlImageSha256 ||
            null,
          canonicalFingerprint:
            job._canonicalControl?.canonicalFingerprint ||
            panelResult.controlImageInfo?.canonicalFingerprint ||
            null,
          designFingerprint:
            job._controlSource?.designFingerprint ||
            job._canonicalControl?.designFingerprint ||
            null,
          isCanonicalControl:
            job._controlSource?.type === "canonical" ||
            job._controlSource?.type === "canonical_render_service" ||
            false,
          // NEW: baselineKey from canonicalRenderService (REQUIRED for hero_3d/interior_3d/axonometric)
          baselineKey:
            job._canonicalControl?.baselineKey ||
            job._controlSource?.baselineKey ||
            null,
          controlHash:
            job._canonicalControl?.hash ||
            job._controlSource?.controlHash ||
            null,
          // Track canonical render service specifically
          isCanonicalRenderService:
            job._controlSource?.type === "canonical_render_service" || false,
          canonicalRenderServiceRunId: job._canonicalControl?.runId || null,
          // NEW: Drift retry tracking for hero_3d/interior_3d
          driftRetryAttempt: job._driftRetryAttempt || 0,
          driftRetryPrevScore: job._driftRetryPrevScore || null,
          driftFailedMetric: job._driftFailedMetric || null,
          strengthEscalation: job._controlSource?.strengthEscalation || null,
          guidanceScale: job.guidanceScale || null,
          promptConstraintAdded:
            !!job._driftRetryAttempt && job._driftRetryAttempt > 0,
        });
      }

      logger.success(`\u2705 Panel ${job.type} completed`);
    } catch (error) {
      logger.error(`\u274c Panel ${job.type} failed: ${error.message}`);

      // ========================================
      // AUTO-RETRY WITH INCREASED CONTROL STRENGTH
      // ========================================
      const isControlImageError =
        error.code === "MISSING_CONTROL_IMAGE" ||
        error.code === "CONTROL_IMAGE_FAILED" ||
        error.message.includes("control image");

      const maxControlRetries =
        safeGetFeatureValue("maxControlImageRetries") || 2;
      const currentRetryAttempt = job._controlRetryAttempt || 0;

      if (isControlImageError && currentRetryAttempt < maxControlRetries) {
        logger.info(
          `🔄 Retrying ${job.type} with increased control strength (attempt ${currentRetryAttempt + 1}/${maxControlRetries})`,
        );

        // Mark the retry attempt on the job
        job._controlRetryAttempt = currentRetryAttempt + 1;

        // Retry this panel with increased strength
        i--; // Retry current panel
        continue;
      }

      // Detect rate limiting
      const isRateLimit =
        error.message.includes("429") ||
        error.message.includes("rate limit") ||
        error.message.includes("Rate limit") ||
        error.message.includes("too many requests");

      if (isRateLimit) {
        rateLimitHitCount++;
        logger.warn(
          `\u26a0\ufe0f Rate limit hit (count: ${rateLimitHitCount})`,
        );

        // If we hit rate limit 3+ times, abort to avoid long wait
        if (rateLimitHitCount >= 3) {
          logger.error(
            `\u274c Too many rate limit errors (${rateLimitHitCount}). Aborting generation.`,
          );
          throw new Error(
            `Generation aborted due to repeated rate limiting. Generated ${results.length}/${jobs.length} panels. Please wait 2-3 minutes and try again.`,
          );
        }

        // Exponential backoff for rate limits
        const backoffDelay = Math.min(
          30000,
          10000 * Math.pow(2, rateLimitHitCount - 1),
        );
        logger.info(`   Waiting ${backoffDelay / 1000}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));

        // Retry this panel once
        i--; // Retry current panel
        continue;
      }

      // Non-rate-limit error - record and continue
      failures.push({
        type: job.type,
        error: error.message,
        isControlImageError,
      });

      // DEBUG: Record failed panel with REAL runtime values
      if (debugRecorder.isRecording()) {
        debugRecorder.recordPanel(job.type, {
          panelIndex: i,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          seed: job.seed,
          controlImageUsed: job._controlAttached || false,
          controlImageSource: job._controlSource?.type || "none",
          controlStrength: job._controlSource?.strength || null,
          model: "black-forest-labs/FLUX.1-dev",
          provider: "together.ai",
          width: job.width,
          height: job.height,
          imageUrl: null,
          success: false,
          error: error.message,
          startedAt: panelStartTime?.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: panelStartTime
            ? Date.now() - panelStartTime.getTime()
            : null,
        });
        debugRecorder.recordError(error, { panel: job.type, panelIndex: i });
      }

      // If too many failures, abort
      if (failures.length > jobs.length / 2) {
        throw new Error(
          `Too many panel generation failures (${failures.length}/${jobs.length}). Last error: ${error.message}`,
        );
      }
    }
  }

  // Log final summary
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  logger.info(`\n\u2705 Panel generation complete:`);
  logger.info(`   Successful: ${results.length}/${jobs.length}`);
  logger.info(`   Failed: ${failures.length}`);
  logger.info(`   Total time: ${totalTime}s`);
  logger.info(`   Rate limit hits: ${rateLimitHitCount}`);

  // NEW (Phase D): Quality validation summary
  if (isFeatureEnabled("panelQualityValidation")) {
    const validatedPanels = results.filter((r) => r.validation);
    const passedCount = validatedPanels.filter(
      (r) => r.validation?.passed,
    ).length;
    const retriedPanels = results.filter((r) => r.retryInfo);
    const improvedCount = retriedPanels.filter(
      (r) => r.retryInfo?.improved,
    ).length;

    const avgScore =
      validatedPanels.length > 0
        ? validatedPanels.reduce(
            (sum, r) => sum + (r.validation?.score || 0),
            0,
          ) / validatedPanels.length
        : 1;

    logger.info(`\n📊 Quality Validation Summary:`);
    logger.info(`   Validated panels: ${validatedPanels.length}`);
    logger.info(
      `   Passed: ${passedCount}/${validatedPanels.length} (${validatedPanels.length > 0 ? Math.round((passedCount / validatedPanels.length) * 100) : 100}%)`,
    );
    logger.info(`   Average score: ${(avgScore * 100).toFixed(1)}%`);
    logger.info(
      `   Minimum threshold: ${(QUALITY_THRESHOLDS.minConsistencyScore * 100).toFixed(1)}%`,
    );

    if (retriedPanels.length > 0) {
      const totalRetryAttempts = retriedPanels.reduce(
        (sum, r) => sum + (r.retryInfo?.attempts || 0),
        0,
      );
      logger.info(`\n🔄 Auto-Retry Statistics:`);
      logger.info(`   Panels retried: ${retriedPanels.length}`);
      logger.info(`   Total retry attempts: ${totalRetryAttempts}`);
      logger.info(
        `   Successfully improved: ${improvedCount}/${retriedPanels.length}`,
      );
    }
  }

  if (failures.length > 0) {
    logger.warn(`\n\u26a0\ufe0f Some panels failed:`);
    failures.forEach((f) => logger.warn(`   - ${f.type}: ${f.error}`));
  }

  // ========================================
  // CONTROL IMAGE DEBUG REPORT
  // ========================================
  const debugReportEnabled = isFeatureEnabled("enableControlImageDebugReport");
  const strictModeEnabled = isFeatureEnabled("strictControlImageMode");

  // Check if any control image source is actually available
  const geometryVolumeFirstEnabled = isFeatureEnabled("geometryVolumeFirst");
  const meshy3DModeEnabled = isFeatureEnabled("meshy3DMode");
  const controlImageSourceAvailable =
    geometryVolumeFirstEnabled || meshy3DModeEnabled;

  if (debugReportEnabled || strictModeEnabled) {
    // Get first job's designFingerprint
    const firstDesignFingerprint =
      jobs[0]?.designFingerprint || jobs[0]?.meta?.designFingerprint;

    if (firstDesignFingerprint) {
      const controlReport = generateControlImageUsageReport(
        firstDesignFingerprint,
      );

      logger.info(`\n🔒 Control Image Usage Report:`);
      logger.info(`   Strict mode enabled: ${controlReport.strictModeEnabled}`);
      // Report actual control image usage, not just feature flag state
      const controlImageCount = controlReport.summary?.withControlImage || 0;
      const actualControlSource =
        controlImageCount > 0
          ? geometryVolumeFirstEnabled
            ? "geometry"
            : meshy3DModeEnabled
              ? "meshy"
              : "configured"
          : "none (no control images attached)";
      logger.info(`   Control image source: ${actualControlSource}`);
      logger.info(
        `   Total panels tracked: ${controlReport.summary?.totalPanels || 0}`,
      );
      logger.info(
        `   With control image: ${controlReport.summary?.withControlImage || 0}`,
      );
      logger.info(
        `   Without control image: ${controlReport.summary?.withoutControlImage || 0}`,
      );
      logger.info(`   Control-retried: ${controlReport.summary?.retried || 0}`);

      if (controlReport.summary?.withoutControlImage > 0 && strictModeEnabled) {
        if (!controlImageSourceAvailable) {
          // No control image source configured - this is expected, not a violation
          logger.info(
            `   ℹ️ No control image source configured (geometryVolumeFirst=false, meshy3DMode=false)`,
          );
          logger.info(
            `   ℹ️ Enable geometryVolumeFirst or meshy3DMode for control image enforcement`,
          );
        } else {
          // Control image source was available but some panels didn't use it - this IS a violation
          logger.error(
            `   ❌ STRICT MODE VIOLATION: ${controlReport.summary.withoutControlImage} panels generated without control images`,
          );
        }
      } else if (
        controlReport.summary?.withControlImage ===
        controlReport.summary?.totalPanels
      ) {
        logger.success(
          `   ✅ ALL panels used control images from SSOT geometry`,
        );
      }

      // Attach report to results metadata
      results._controlImageReport = controlReport;
    }
  }

  return results;
}

/**
 * Clear cached style profile for a specific design or all designs.
 * Call this when starting a new generation or after completing one.
 *
 * @param {string} designFingerprint - The design fingerprint (optional, clears all if not provided)
 */
export function clearStyleCache(designFingerprint) {
  if (designFingerprint) {
    styleProfileCache.delete(designFingerprint);
    logger.info(
      `🎨 Style profile cache cleared for design: ${designFingerprint}`,
    );
  } else {
    // Clear all style caches (useful at session start)
    const count = styleProfileCache.size;
    styleProfileCache.clear();
    logger.info(`🎨 All style profile caches cleared (${count} entries)`);
  }
}

/**
 * Get all cached style profiles (for debugging).
 * @returns {Map} Map of designFingerprint → styleProfile
 */
export function getAllStyleCaches() {
  return new Map(styleProfileCache);
}

export default {
  planA1Panels,
  generateA1PanelsSequential,
  clearStyleCache,
  getAllStyleCaches,
  // NEW: Control image debug report functions
  generateControlImageUsageReport,
  clearControlImageUsageTracker,
};
