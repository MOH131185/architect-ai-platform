/**
 * Pure AI Modification Service (REFACTORED)
 *
 * Handles A1 sheet modifications with deterministic behavior.
 * No storage access - uses designHistoryRepository.
 * All context passed via parameters.
 *
 * Features:
 * - Baseline artifact lookup
 * - Delta prompt building
 * - Strict consistency lock
 * - Seed reuse (deterministic)
 * - Drift detection + retry cycle
 */

import { createModifyRequest } from "../types/schemas.js";
import { buildCompactModifyPrompt } from "./a1/A1PromptService.js";
import { createTogetherAIClient } from "./togetherAIClient.js";
import {
  detectDNADrift,
  detectImageDrift,
  suggestDriftCorrections,
  DRIFT_THRESHOLDS,
} from "./driftValidator.js";
import modificationClassifier from "./modificationClassifier.js";
import { generateGeometryDNA } from "./geometryReasoningService.js";
import { buildGeometryModel, createSceneSpec } from "./geometryBuilder.js";
import { renderGeometryPlaceholders } from "./geometryRenderService.js";
import baselineArtifactStore from "./baselineArtifactStore.js";
import designHistoryRepository from "./designHistoryRepository.js";
import logger from "../utils/logger.js";
import { isFeatureEnabled } from "../config/featureFlags.js";

/**
 * Build geometry directive for modification prompts
 * @param {Object} geometryDNA - Geometry DNA specification
 * @param {boolean} needsGeometryRegen - Whether geometry needs regeneration
 * @returns {string} Geometry constraint directive
 */
function buildGeometryDirective(geometryDNA, needsGeometryRegen) {
  if (!geometryDNA) return "";

  // If geometry is being regenerated, allow more freedom
  if (needsGeometryRegen) {
    return "GEOMETRY: Building geometry may be modified to accommodate requested changes while respecting site constraints";
  }

  // Otherwise, enforce strict geometry lock
  const directives = [];

  // Lock roof type
  if (geometryDNA.roof?.type) {
    const roofType = geometryDNA.roof.type;
    const roofPitch = geometryDNA.roof.pitch || 35;
    directives.push(
      `LOCKED ROOF: ${roofType} roof at ${roofPitch}° pitch - do not change`,
    );
  }

  // Lock primary massing
  if (geometryDNA.massing?.type) {
    directives.push(
      `LOCKED MASSING: ${geometryDNA.massing.type} configuration - preserve building form`,
    );
  }

  // Lock dimensions (if specified)
  if (geometryDNA.dimensions) {
    const { length, width, height } = geometryDNA.dimensions;
    if (length && width) {
      directives.push(
        `LOCKED FOOTPRINT: ${length}m × ${width}m - preserve all exterior dimensions`,
      );
    }
    if (height) {
      directives.push(
        `LOCKED HEIGHT: ${height}m total height - do not change floor count`,
      );
    }
  }

  // Lock floors
  if (geometryDNA.floors?.length) {
    directives.push(
      `LOCKED FLOORS: ${geometryDNA.floors.length} floors - preserve vertical organization`,
    );
  }

  // Lock facade organization (if specified)
  if (geometryDNA.facades) {
    const facadeCount = Object.keys(geometryDNA.facades).length;
    if (facadeCount > 0) {
      directives.push(
        `LOCKED FACADE ORGANIZATION: All ${facadeCount} facade window patterns must remain unchanged`,
      );
    }
  }

  // Combine all directives
  if (directives.length === 0) {
    return "GEOMETRY LOCK: Maintain all building dimensions and form";
  }

  return directives.join("; ");
}

/**
 * Modify sheet (pure function)
 * @param {Object} params - Modify parameters
 * @param {Object} params.designRef - Design reference { id, sheetId }
 * @param {SheetResult} params.baseSheet - Base sheet (optional, loaded if not provided)
 * @param {DNA} params.dna - DNA (optional, loaded if not provided)
 * @param {ModifyRequest} params.modifyRequest - Modification request
 * @param {Object} params.env - Environment adapter
 * @param {Object} params.featureFlags - Feature flags
 * @param {number} params.seed - Seed (optional, uses baseline seed if not provided)
 * @returns {Promise<ModifyResult>} Modification result
 */
export async function modifySheet({
  designRef,
  baseSheet = null,
  dna = null,
  modifyRequest,
  env,
  featureFlags = {},
  seed = null,
}) {
  logger.info(
    "Starting pure modification workflow",
    { designId: designRef.id },
    "🔧",
  );

  // Normalize modify request
  const normalizedRequest = createModifyRequest(modifyRequest);
  const geometryVolumeEnabled =
    featureFlags.geometryVolumeFirst ?? isFeatureEnabled("geometryVolumeFirst");
  let designFromHistory = null;

  try {
    // STEP 1: Load baseline artifacts
    logger.info("STEP 1: Loading baseline artifacts", null, "📂");

    let baseline = await baselineArtifactStore.getBaselineArtifacts({
      designId: designRef.id,
      sheetId: designRef.sheetId || "default",
    });

    if (!baseline) {
      // Try to load from design history as fallback
      logger.warn(
        "Baseline artifacts not found in store, attempting to load from design history",
        { designId: designRef.id },
      );

      const design = await designHistoryRepository.getDesignById(designRef.id);
      if (!design) {
        logger.error("Design not found in history", { designId: designRef.id });
        throw new Error(
          `Design ${designRef.id} not found. Cannot modify without baseline. ` +
            `Please generate the A1 sheet first before attempting modifications.`,
        );
      }

      // Validate required fields before reconstruction
      if (!design.resultUrl && !design.a1Sheet?.url) {
        logger.error("Design missing baseline image URL", {
          designId: designRef.id,
        });
        throw new Error(
          `Design ${designRef.id} has no baseline image URL. ` +
            `The original A1 sheet must be generated and saved before modifications can be applied.`,
        );
      }

      if (!design.dna && !design.masterDNA) {
        logger.error("Design missing DNA", { designId: designRef.id });
        throw new Error(
          `Design ${designRef.id} has no DNA. ` +
            `Cannot ensure consistency without the original design DNA. ` +
            `Please regenerate the A1 sheet with complete DNA.`,
        );
      }

      // Reconstruct baseline from design history
      const reconstructedBaseline = {
        designId: design.id,
        sheetId: designRef.sheetId || "default",
        baselineImageUrl: design.resultUrl || design.a1Sheet?.url,
        baselineDNA: design.dna || design.masterDNA,
        baselineLayout: design.a1Sheet?.metadata?.layout || {},
        metadata: {
          seed: design.seed,
          model: design.a1Sheet?.metadata?.model || "FLUX.1-dev",
          width: design.a1Sheet?.metadata?.width || 1792,
          height: design.a1Sheet?.metadata?.height || 1264,
          a1LayoutKey:
            design.a1Sheet?.metadata?.a1LayoutKey || "uk-riba-standard",
        },
        seeds: { base: design.seed },
        basePrompt: design.basePrompt,
      };

      logger.info("Reconstructed baseline from design history", {
        designId: design.id,
        hasDNA: !!reconstructedBaseline.baselineDNA,
        hasImage: !!reconstructedBaseline.baselineImageUrl,
        seed: reconstructedBaseline.metadata.seed,
      });

      baseline = reconstructedBaseline;
      designFromHistory = design;
    }

    // Resolve geometry baseline from baseline bundle or history
    const resolvedGeometry = resolveGeometryFromBaseline(baseline);
    let geometryDNA = resolvedGeometry.geometryDNA;
    let geometryRenders = resolvedGeometry.geometryRenders;
    let geometryScene = resolvedGeometry.geometryScene;
    let geometryBaselineSource = resolvedGeometry.source;

    if (!geometryDNA || !geometryRenders) {
      if (!designFromHistory) {
        try {
          designFromHistory = await designHistoryRepository.getDesignById(
            designRef.id,
          );
        } catch (historyError) {
          logger.warn("Failed to load design for geometry baseline", {
            error: historyError.message,
          });
        }
      }
      const historyGeometry = resolveGeometryFromDesign(designFromHistory);
      geometryDNA = geometryDNA || historyGeometry.geometryDNA;
      geometryRenders = geometryRenders || historyGeometry.geometryRenders;
      geometryScene = geometryScene || historyGeometry.geometryScene || null;
      if (geometryDNA || geometryRenders) {
        geometryBaselineSource = geometryBaselineSource || "history";
      }
    }

    // STEP 2: Build delta prompt (geometry-aware)
    logger.info("STEP 2: Building delta prompt", null, "📝");

    const deltaText = buildDeltaText(normalizedRequest);
    let modificationClass = null;

    if (geometryVolumeEnabled) {
      try {
        modificationClass = await modificationClassifier.classifyModification(
          deltaText || normalizedRequest.customPrompt || "",
          baseline.baselineDNA,
          geometryDNA || baseline.baselineDNA?.geometry,
        );
        logger.info("Modification classified (geometry-aware)", {
          class: modificationClass.classification,
          requiresGeometryRegen:
            modificationClass.requires_geometry_regeneration,
        });
      } catch (classErr) {
        logger.warn("Classification failed, falling back to heuristic", {
          error: classErr.message,
        });
        modificationClass = modificationClassifier.heuristicClassification(
          deltaText || normalizedRequest.customPrompt || "",
        );
      }
    }

    const needsGeometryRegen =
      geometryVolumeEnabled &&
      (modificationClass?.requires_geometry_regeneration ||
        modificationClass?.requires_new_baseline ||
        modificationClass?.classification === "volume_change" ||
        modificationClass?.classification === "new_project");

    if (
      needsGeometryRegen ||
      (geometryVolumeEnabled && geometryDNA && !geometryRenders)
    ) {
      geometryDNA =
        geometryDNA ||
        generateGeometryDNA({
          masterDNA: baseline.baselineDNA,
          sitePolygon:
            baseline.baselineLayout?.sitePolygon ||
            designFromHistory?.siteSnapshot?.polygon ||
            [],
          climate: designFromHistory?.siteSnapshot?.climate || null,
          style: baseline.baselineDNA?.architecturalStyle || "",
        });

      const model = buildGeometryModel(geometryDNA, baseline.baselineDNA);
      geometryScene = createSceneSpec(model);
      geometryRenders = renderGeometryPlaceholders(geometryScene, {
        includePerspective: true,
        includeAxon: true,
      });
      geometryBaselineSource = needsGeometryRegen
        ? "regenerated"
        : geometryBaselineSource || "synthesized";
    } else if (geometryVolumeEnabled && geometryDNA && !geometryRenders) {
      const model = buildGeometryModel(geometryDNA, baseline.baselineDNA);
      geometryScene = createSceneSpec(model);
      geometryRenders = renderGeometryPlaceholders(geometryScene, {
        includePerspective: true,
        includeAxon: true,
      });
      geometryBaselineSource = geometryBaselineSource || "synthesized";
    }

    if (
      geometryVolumeEnabled &&
      geometryDNA &&
      geometryRenders &&
      (!resolvedGeometry.geometryDNA || needsGeometryRegen)
    ) {
      try {
        await baselineArtifactStore.saveGeometryBaseline({
          designId: designRef.id,
          sheetId: designRef.sheetId || "default",
          geometryBaseline: {
            geometryDNA,
            renders: geometryRenders,
            scene: geometryScene || null,
            source: geometryBaselineSource || "modify-workflow",
          },
        });
        logger.info("Geometry baseline persisted for modify workflow", {
          source: geometryBaselineSource,
        });
      } catch (persistErr) {
        logger.warn("Failed to persist geometry baseline (non-fatal)", {
          error: persistErr.message,
        });
      }
    }

    const geometryDirective = geometryDNA
      ? buildGeometryDirective(geometryDNA, needsGeometryRegen)
      : "";
    const deltaPrompt = geometryDirective
      ? `${deltaText}; ${geometryDirective}`
      : deltaText;
    const dnaForPrompt = {
      ...baseline.baselineDNA,
      geometry: geometryDNA || baseline.baselineDNA?.geometry,
      geometryDNA: geometryDNA || baseline.baselineDNA?.geometryDNA,
    };

    const compactPrompt = buildCompactModifyPrompt({
      dna: dnaForPrompt,
      deltaPrompt,
      seed: baseline.metadata.seed,
    });

    // STEP 3: Load baseline image as data URL
    logger.info("STEP 3: Loading baseline image", null, "🖼️");

    let initImageData = baseline.baselineImageUrl;
    if (!initImageData.startsWith("data:")) {
      initImageData = await loadImageAsDataURL(baseline.baselineImageUrl);
    }

    if (!initImageData) {
      throw new Error("Failed to load baseline image for img2img");
    }

    // STEP 4: Generate modified image
    logger.info("STEP 4: Generating modified image", null, "🎨");

    const client = createTogetherAIClient(env);

    // Determine image strength
    const baseStrength =
      normalizedRequest.imageStrength ||
      determineOptimalStrength(normalizedRequest);
    const imageStrength = tuneStrengthForClassification(
      baseStrength,
      modificationClass?.classification,
      geometryVolumeEnabled,
    );
    const modificationType = pickModificationType(
      modificationClass?.classification,
    );

    logger.info(
      "Using img2img settings",
      {
        seed: baseline.metadata.seed,
        strength: imageStrength,
        modificationType,
        dimensions: `${baseline.metadata.width}x${baseline.metadata.height}`,
      },
      "???",
    );
    const imageResult = await client.generateModifyImage({
      prompt: compactPrompt,
      negativePrompt: "", // Negatives included in compact prompt
      seed: baseline.metadata.seed, // CRITICAL: Reuse baseline seed
      initImage: initImageData,
      modificationType,
      imageStrength,
      width: baseline.metadata.width,
      height: baseline.metadata.height,
      model: baseline.metadata.model,
      guidanceScale: 9.0,
      steps: 48,
    });

    // STEP 5: Validate consistency
    logger.info("STEP 5: Validating consistency", null, "✅");

    const driftAnalysis = await detectDrift({
      baselineUrl: baseline.baselineImageUrl,
      candidateUrl: imageResult.imageUrls[0],
      baselineDNA: baseline.baselineDNA,
      candidateDNA: dna || baseline.baselineDNA,
      panelCoordinates: baseline.baselineLayout.panelCoordinates,
    });

    // STEP 6: Retry if drift too high
    if (
      driftAnalysis.hasDrift &&
      driftAnalysis.driftScore > DRIFT_THRESHOLDS.DNA.OVERALL
    ) {
      logger.warn("Drift above threshold, retrying with stricter settings", {
        driftScore: driftAnalysis.driftScore,
        threshold: DRIFT_THRESHOLDS.DNA.OVERALL,
      });

      const stricterStrength = Math.max(0.08, imageStrength * 0.6);

      const retryImageResult = await client.generateModifyImage({
        prompt: compactPrompt,
        negativePrompt: "",
        seed: baseline.metadata.seed,
        modificationType,
        initImage: initImageData,
        imageStrength: stricterStrength,
        width: baseline.metadata.width,
        height: baseline.metadata.height,
        model: baseline.metadata.model,
        guidanceScale: 9.5, // Even higher guidance
        steps: 48,
      });

      // Re-validate
      const retryDriftAnalysis = await detectDrift({
        baselineUrl: baseline.baselineImageUrl,
        candidateUrl: retryImageResult.imageUrls[0],
        baselineDNA: baseline.baselineDNA,
        candidateDNA: dna || baseline.baselineDNA,
        panelCoordinates: baseline.baselineLayout.panelCoordinates,
      });

      if (retryDriftAnalysis.driftScore < driftAnalysis.driftScore) {
        // Use retry result
        imageResult.imageUrls = retryImageResult.imageUrls;
        imageResult.metadata.retried = true;
        imageResult.metadata.retryStrength = stricterStrength;
        driftAnalysis.driftScore = retryDriftAnalysis.driftScore;

        logger.success("Retry successful", {
          driftScore: retryDriftAnalysis.driftScore,
        });
      } else {
        // Fail gracefully
        logger.error("Drift persists after retry", {
          originalDrift: driftAnalysis.driftScore,
          retryDrift: retryDriftAnalysis.driftScore,
        });

        throw new Error(
          `Modification failed: drift score ${retryDriftAnalysis.driftScore.toFixed(3)} exceeds threshold ${DRIFT_THRESHOLDS.DNA.OVERALL}. ` +
            `Suggestions: ${driftAnalysis.driftedPanels?.map((p) => p.id).join(", ") || "simplify request"}`,
        );
      }
    }

    // STEP 7: Create modify result
    const modifyResult = {
      success: true,
      sheet: {
        url: imageResult.imageUrls[0],
        composedSheetUrl: imageResult.imageUrls[0],
        originalUrl: imageResult.imageUrls[0],
        seed: imageResult.seedUsed,
        prompt: compactPrompt,
        metadata: {
          ...imageResult.metadata,
          baselineDesignId: designRef.id,
          baselineSheetId: designRef.sheetId,
          driftScore: driftAnalysis.driftScore,
          consistencyScore: 1 - driftAnalysis.driftScore,
          modificationType,
          modificationClass: modificationClass?.classification || null,
        },
        dna: baseline.baselineDNA,
        geometryDNA: geometryDNA || null,
        geometryRenders: geometryRenders || null,
        workflow: "multi_panel-modify",
      },
      geometryDNA: geometryDNA || null,
      geometryRenders: geometryRenders || null,
      modificationClass: modificationClass?.classification || null,
      versionId: `v${Date.now()}`,
      driftScore: driftAnalysis.driftScore,
      consistencyDetails: {
        dnaDrift: driftAnalysis.dnaDrift,
        imageDrift: driftAnalysis.imageDrift,
        driftedPanels: driftAnalysis.driftedPanels || [],
      },
      versionMetadata: {
        deltaPrompt: deltaPrompt,
        quickToggles: normalizedRequest.quickToggles,
        imageStrength,
        modificationType,
        modificationClass: modificationClass?.classification || null,
        geometryBaselineSource,
        geometryRegenerated: !!needsGeometryRegen,
        retried: imageResult.metadata.retried || false,
        createdAt: new Date().toISOString(),
      },
      baseDesignId: designRef.id,
      baseSheetId: designRef.sheetId,
      modifiedPanels: normalizedRequest.targetPanels || [],
    };

    logger.success("Modification complete", {
      versionId: modifyResult.versionId,
      driftScore: modifyResult.driftScore,
      consistencyScore: 1 - modifyResult.driftScore,
    });

    return modifyResult;
  } catch (error) {
    logger.error("Modification failed", error);
    throw error;
  }
}

/**
 * Build delta text from modify request
 * @private
 */
function buildDeltaText(request) {
  const parts = [];

  if (request.quickToggles.addSections) {
    parts.push("ADD sections A-A and B-B with dimension lines");
  }

  if (request.quickToggles.add3DView) {
    parts.push("ADD 3D views");
  }

  if (request.quickToggles.addInterior3D) {
    parts.push("ADD interior 3D views");
  }

  if (request.quickToggles.addDetails) {
    parts.push("ADD technical details");
  }

  if (request.quickToggles.addFloorPlans) {
    parts.push("ADD floor plans");
  }

  if (request.customPrompt) {
    parts.push(request.customPrompt);
  }

  return parts.join("; ") || "No changes";
}

/**
 * Determine optimal image strength based on request
 * @private
 */
function determineOptimalStrength(request) {
  const { quickToggles } = request;

  // Details only: minimal changes (90% preserve)
  if (
    quickToggles.addDetails &&
    !quickToggles.addSections &&
    !quickToggles.add3DView
  ) {
    return 0.1;
  }

  // Adding views: moderate changes (85% preserve)
  if (
    quickToggles.addSections ||
    quickToggles.add3DView ||
    quickToggles.addFloorPlans
  ) {
    return 0.15;
  }

  // Interior 3D: more significant (82% preserve)
  if (quickToggles.addInterior3D) {
    return 0.18;
  }

  // Default: balanced (86% preserve)
  return 0.14;
}

/**
 * Load image as data URL
 * @private
 */
async function loadImageAsDataURL(imageUrl) {
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  try {
    // Use proxy for cross-origin URLs
    const fetchUrl =
      imageUrl.startsWith("http://localhost") ||
      imageUrl.startsWith(window.location.origin)
        ? imageUrl
        : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;

    const response = await fetch(fetchUrl);

    if (!response.ok) {
      logger.warn(`Failed to load image (${response.status})`);
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return dataUrl;
  } catch (error) {
    logger.error("Failed to load image as data URL", error);
    return null;
  }
}

/**
 * Detect drift (combined DNA + image)
 * @private
 */
async function detectDrift({
  baselineUrl,
  candidateUrl,
  baselineDNA,
  candidateDNA,
  panelCoordinates,
}) {
  // DNA drift
  let dnaDrift = null;
  if (baselineDNA && candidateDNA) {
    dnaDrift = detectDNADrift(baselineDNA, candidateDNA);
  }

  // Image drift
  let imageDrift = null;
  if (baselineUrl && candidateUrl) {
    imageDrift = await detectImageDrift(baselineUrl, candidateUrl, {
      panelCoordinates,
    });
  }

  // Combine drift scores (use worst)
  const driftScore = Math.max(
    dnaDrift?.driftScore || 0,
    imageDrift?.driftScore || 0,
  );

  return {
    hasDrift: driftScore > DRIFT_THRESHOLDS.DNA.OVERALL,
    driftScore,
    dnaDrift,
    imageDrift,
    driftedPanels: imageDrift?.driftedPanels || [],
  };
}

function resolveGeometryFromBaseline(baseline) {
  if (!baseline)
    return {
      geometryDNA: null,
      geometryRenders: null,
      geometryScene: null,
      source: null,
    };
  const geometryBaseline = baseline.geometryBaseline || null;
  const geometryDNA =
    geometryBaseline?.geometryDNA ||
    baseline.baselineDNA?.geometry ||
    baseline.baselineDNA?.geometryDNA ||
    null;
  const geometryRenders =
    geometryBaseline?.renders ||
    geometryBaseline?.geometryRenders ||
    geometryBaseline?.images ||
    null;
  const geometryScene =
    geometryBaseline?.scene || geometryBaseline?.geometryScene || null;

  return {
    geometryDNA,
    geometryRenders,
    geometryScene,
    source: geometryBaseline ? geometryBaseline.source || "baseline" : null,
  };
}

function resolveGeometryFromDesign(design) {
  if (!design)
    return { geometryDNA: null, geometryRenders: null, geometryScene: null };
  return {
    geometryDNA:
      design.geometryDNA ||
      design.masterDNA?.geometry ||
      design.masterDNA?.geometryDNA ||
      design.dna?.geometry ||
      design.dna?.geometryDNA ||
      null,
    geometryRenders:
      design.geometryRenders || design.a1Sheet?.geometryRenders || null,
    geometryScene: design.geometryScene || null,
  };
}

function summarizeGeometryDNA(geometryDNA) {
  if (!geometryDNA) return "";
  const roof = geometryDNA.roofType || geometryDNA.roof?.type || "flat";
  const floors =
    geometryDNA.floorHeights?.length ||
    geometryDNA.volumes?.[0]?.levels ||
    null;
  const wings = Array.isArray(geometryDNA.wings)
    ? geometryDNA.wings.join("/")
    : "bar";
  return `roof=${roof}; floors=${floors || "?"}, wings=${wings}`;
}

// Note: buildGeometryDirective() is defined at the top of the file (lines 34-87)
// This provides comprehensive geometry locking for the modify workflow

function tuneStrengthForClassification(baseStrength, classification, enabled) {
  if (!enabled) return baseStrength;
  if (classification === "appearance_only") return Math.min(baseStrength, 0.14);
  if (classification === "minor_elevation")
    return Math.min(Math.max(baseStrength, 0.14), 0.18);
  if (classification === "volume_change" || classification === "new_project")
    return Math.max(baseStrength, 0.24);
  return baseStrength;
}

function pickModificationType(classification) {
  if (classification === "appearance_only") return "minor";
  if (classification === "minor_elevation") return "minor";
  if (classification === "volume_change" || classification === "new_project")
    return "significant";
  return "moderate";
}

export default {
  modifySheet,
};
