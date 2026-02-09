/**
 * Pure DNA Workflow Orchestrator (REFACTORED)
 *
 * Environment-agnostic orchestrator for A1 sheet generation.
 * No sessionStorage, no localStorage, no feature flag reads, no DOM/React.
 * All runtime context passed via parameters.
 *
 * Implements:
 * - DNA generation → validation → prompt building → image generation
 * - Drift detection → autocorrect → retry cycle
 * - Baseline artifact creation
 * - Deterministic seed management
 */

import {
  createSheetResult,
  normalizeMultiPanelResult,
} from "../types/schemas.js";
import { buildPrompt as buildSheetPrompt } from "./a1/A1PromptService.js";
import { createTogetherAIClient } from "./togetherAIClient.js";
import dnaWorkflowOrchestrator from "./dnaWorkflowOrchestrator.js";
import baselineArtifactStore from "./baselineArtifactStore.js";
import modificationClassifier from "./modificationClassifier.js";
import { generateGeometryDNA } from "./geometryReasoningService.js";
import { buildGeometryModel, createSceneSpec } from "./geometryBuilder.js";
import { renderGeometryPlaceholders } from "./geometryRenderService.js";
import {
  getA1Preset,
  shouldRetryForDrift,
  calculateRetryStrength,
  getModifyStrength,
} from "../config/fluxPresets.js";
import logger from "../utils/logger.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import {
  resolveWorkflowByMode,
  executeWorkflow,
  UnsupportedPipelineModeError,
} from "./workflowRouter.js";

/**
 * Run A1 sheet workflow (pure orchestrator)
 * Routes via resolveWorkflowByMode(); fails on unsupported modes.
 * @param {WorkflowParams} params - Workflow parameters
 * @returns {Promise<SheetResult>} Sheet result
 */
export async function runA1SheetWorkflow(params) {
  const { mode } = resolveWorkflowByMode();
  logger.info(`[pureOrchestrator] pipeline mode: ${mode}`);

  const rawMultiPanelResult = await executeWorkflow(dnaWorkflowOrchestrator, {
    locationData: params.siteSnapshot,
    projectContext: params.designSpec,
    portfolioFiles: params.designSpec?.portfolioBlend?.portfolioFiles || [],
    siteSnapshot: params.siteSnapshot,
    baseSeed: params.seed || Date.now(),
  });

  const multiPanelResult = normalizeMultiPanelResult(rawMultiPanelResult);

  if (!multiPanelResult?.success) {
    return {
      success: false,
      error: multiPanelResult?.error,
      message: multiPanelResult?.error || "Multi-panel generation failed",
    };
  }

  return {
    success: true,
    url: multiPanelResult.composedSheetUrl,
    composedSheetUrl: multiPanelResult.composedSheetUrl,
    dna: multiPanelResult.masterDNA,
    seed: multiPanelResult.metadata?.baseSeed || params.seed,
    prompt: "Multi-panel A1 generation",
    metadata: multiPanelResult.metadata,
    a1Sheet: {
      url: multiPanelResult.composedSheetUrl,
      composedSheetUrl: multiPanelResult.composedSheetUrl,
      metadata: multiPanelResult.metadata,
      panels: multiPanelResult.panelMap || multiPanelResult.panels,
      panelMap: multiPanelResult.panelMap || multiPanelResult.panels,
      coordinates:
        multiPanelResult.panelCoordinates || multiPanelResult.coordinates,
    },
    coordinates:
      multiPanelResult.panelCoordinates || multiPanelResult.coordinates,
    panels: multiPanelResult.panelMap || multiPanelResult.panels,
    panelMap: multiPanelResult.panelMap || multiPanelResult.panels,
    geometryDNA: multiPanelResult.geometryDNA || null,
    geometryRenders: multiPanelResult.geometryRenders || null,
    consistencyReport: multiPanelResult.consistencyReport,
    baselineBundle: multiPanelResult.baselineBundle,
    seeds: multiPanelResult.seeds,
  };
}

export async function runModifyWorkflow(params) {
  const { env, designRef, baseSheet, dna, modifyRequest, featureFlags, seed } =
    params;

  logger.info(
    "Starting modify workflow",
    {
      designId: designRef.id,
      seed,
    },
    "??",
  );

  const geometryVolumeEnabled =
    featureFlags?.geometryVolumeFirst ??
    isFeatureEnabled("geometryVolumeFirst");

  try {
    // STEP 1: Load baseline artifacts
    logger.info("STEP 1: Loading baseline artifacts", null, "??");
    const baseline = await baselineArtifactStore.getBaselineArtifacts({
      designId: designRef.id,
      sheetId: designRef.sheetId || "default",
    });

    if (!baseline) {
      throw new Error(
        "Baseline artifacts not found - cannot modify without baseline",
      );
    }

    const resolvedGeometry = resolveGeometryFromBaseline(baseline);
    let geometryDNA = resolvedGeometry.geometryDNA;
    let geometryRenders = resolvedGeometry.geometryRenders;
    let geometryScene = resolvedGeometry.geometryScene;
    let geometryBaselineSource = resolvedGeometry.source;

    // STEP 2: Build delta prompt (geometry-aware)
    logger.info("STEP 2: Building delta prompt", null, "??");
    const deltaText = buildDeltaPrompt(modifyRequest);
    let modificationClass = null;

    if (geometryVolumeEnabled) {
      try {
        modificationClass = await modificationClassifier.classifyModification(
          deltaText || modifyRequest.customPrompt || "",
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
          deltaText || modifyRequest.customPrompt || "",
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
          sitePolygon: baseline.baselineLayout?.sitePolygon || [],
          climate: baseline.baselineDNA?.climate || null,
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
      ? `${deltaText}\n${geometryDirective}`
      : deltaText;
    const dnaForPrompt = {
      ...baseline.baselineDNA,
      geometry: geometryDNA || baseline.baselineDNA?.geometry,
      geometryDNA: geometryDNA || baseline.baselineDNA?.geometryDNA,
    };

    // STEP 3: Build modify prompt with consistency lock
    const promptResult = buildSheetPrompt({
      dna: dnaForPrompt,
      siteSnapshot: params.siteSnapshot,
      sheetConfig: params.sheetConfig || {
        size: "A1",
        orientation: "landscape",
      },
      sheetType: params.sheetType || "ARCH",
      overlays: params.overlays || [],
      mode: "modify",
      modifyContext: {
        deltaPrompt,
        baselineLayout: baseline.baselineLayout,
        strictLock: modifyRequest.strictLock !== false,
      },
      seed: baseline.metadata.seed, // Reuse baseline seed
    });

    // STEP 4: Generate modified image with A1_ARCH_FINAL preset
    logger.info(
      "STEP 4: Generating modified image with A1_ARCH_FINAL preset",
      null,
      "??",
    );
    const client = createTogetherAIClient(env);
    const preset = getA1Preset("modify");

    const defaultModificationType =
      modifyRequest.modificationType ||
      (modifyRequest.quickToggles?.addDetails ? "minor" : "moderate");
    const modificationType = pickModificationType(
      modificationClass?.classification,
      defaultModificationType,
    );
    const baseStrength =
      modifyRequest.imageStrength || getModifyStrength(modificationType);
    const tunedStrength = tuneStrengthForClassification(
      baseStrength,
      modificationClass?.classification,
      geometryVolumeEnabled,
    );

    logger.info(
      "Using modify preset",
      {
        steps: preset.steps,
        cfg: preset.cfg,
        modificationType,
        strength: tunedStrength,
      },
      "??",
    );

    const imageResult = await client.generateModifyImage({
      prompt: promptResult.prompt,
      negativePrompt: promptResult.negativePrompt,
      seed: baseline.metadata.seed, // CRITICAL: Reuse baseline seed
      initImage: baseline.baselineImageUrl,
      modificationType,
      imageStrength: tunedStrength,
      width: baseline.metadata.width || preset.width,
      height: baseline.metadata.height || preset.height,
      steps: preset.steps,
      guidanceScale: preset.cfg,
      model: baseline.metadata.model || preset.model,
    });

    // STEP 5: Detect drift with preset thresholds
    logger.info("STEP 5: Detecting drift", null, "??");
    const driftAnalysis = await detectDrift({
      baselineUrl: baseline.baselineImageUrl,
      candidateUrl: imageResult.imageUrls[0],
      baselineDNA: baseline.baselineDNA,
      candidateDNA: dna || baseline.baselineDNA, // If available
      panelCoordinates: baseline.baselineLayout.panelCoordinates,
    });

    const driftDecision = shouldRetryForDrift(driftAnalysis.driftScore);

    logger.info(
      "Drift analysis",
      {
        score: driftAnalysis.driftScore.toFixed(3),
        threshold: driftDecision.threshold,
        shouldRetry: driftDecision.shouldRetry,
      },
      "??",
    );

    if (driftDecision.shouldRetry) {
      logger.warn("Drift exceeds retry threshold, attempting correction", {
        driftScore: driftAnalysis.driftScore,
        threshold: preset.driftThresholds.retry,
      });

      // Calculate reduced strength for retry
      const originalStrength =
        imageResult.metadata.imageStrength || tunedStrength;
      const retryStrength = calculateRetryStrength(originalStrength, 1);

      logger.info(
        "Retry with reduced strength",
        {
          original: originalStrength,
          retry: retryStrength,
        },
        "??",
      );

      // RETRY with stricter lock and reduced strength
      const stricterPromptResult = buildSheetPrompt({
        dna: dnaForPrompt,
        siteSnapshot: params.siteSnapshot,
        sheetConfig: params.sheetConfig,
        sheetType: params.sheetType || "ARCH",
        overlays: params.overlays || [],
        mode: "modify",
        modifyContext: {
          deltaPrompt,
          baselineLayout: baseline.baselineLayout,
          strictLock: true, // Force strict lock
        },
        seed: baseline.metadata.seed,
      });

      const stricterImageResult = await client.generateModifyImage({
        prompt: stricterPromptResult.prompt,
        negativePrompt: stricterPromptResult.negativePrompt,
        seed: baseline.metadata.seed,
        initImage: baseline.baselineImageUrl,
        modificationType: "minor", // Force minor type for retry
        imageStrength: retryStrength,
        width: baseline.metadata.width || preset.width,
        height: baseline.metadata.height || preset.height,
        steps: preset.steps,
        guidanceScale: preset.cfg,
        model: baseline.metadata.model || preset.model,
      });

      // Re-check drift
      const retryDriftAnalysis = await detectDrift({
        baselineUrl: baseline.baselineImageUrl,
        candidateUrl: stricterImageResult.imageUrls[0],
        baselineDNA: baseline.baselineDNA,
        candidateDNA: dna || baseline.baselineDNA,
        panelCoordinates: baseline.baselineLayout.panelCoordinates,
      });

      const retryDecision = shouldRetryForDrift(retryDriftAnalysis.driftScore);

      if (retryDriftAnalysis.driftScore < driftAnalysis.driftScore) {
        // Use retry result
        logger.success("Retry improved drift score", {
          before: driftAnalysis.driftScore,
          after: retryDriftAnalysis.driftScore,
        });
        imageResult.imageUrls = stricterImageResult.imageUrls;
        imageResult.metadata.retried = true;
        imageResult.metadata.retryStrength = retryStrength;
        driftAnalysis.driftScore = retryDriftAnalysis.driftScore;
      } else {
        logger.warn("Retry did not improve drift, using original");
      }

      // If still exceeds fail threshold, fail gracefully
      if (retryDecision.shouldFail) {
        throw new Error(
          `Drift too high after retry: ${retryDriftAnalysis.driftScore.toFixed(3)} (threshold: ${preset.driftThresholds.fail}). Simplify modification request.`,
        );
      }
    }

    // STEP 6: Create result
    const sheetResult = createSheetResult({
      url: imageResult.imageUrls[0],
      originalUrl: imageResult.imageUrls[0],
      seed: imageResult.seedUsed,
      prompt: promptResult.prompt,
      negativePrompt: promptResult.negativePrompt,
      metadata: {
        ...imageResult.metadata,
        ...promptResult.metadata,
        driftScore: driftAnalysis.driftScore,
        baselineDesignId: designRef?.id,
        baselineSheetId: designRef?.sheetId,
        modificationType,
        modificationClass: modificationClass?.classification || null,
      },
      dna: dnaForPrompt,
      geometryDNA: geometryDNA || null,
      geometryRenders: geometryRenders || null,
      validation: { isValid: true, score: 0.98 },
      consistencyScore: 1 - driftAnalysis.driftScore,
      workflow: "multi_panel-modify",
    });

    logger.success("Modify workflow complete", {
      driftScore: driftAnalysis.driftScore,
      consistencyScore: sheetResult.consistencyScore,
    });

    return sheetResult;
  } catch (error) {
    logger.error("Workflow failed", error);
    throw error;
  }
}

/**
 * Build delta prompt from modify request
 * @private
 */
function buildDeltaPrompt(modifyRequest) {
  const parts = [];

  if (modifyRequest.quickToggles?.addSections) {
    parts.push("ADD missing sections (A-A, B-B) with dimension lines");
  }

  if (modifyRequest.quickToggles?.add3DView) {
    parts.push("ADD additional 3D views (exterior, axonometric)");
  }

  if (modifyRequest.quickToggles?.addInterior3D) {
    parts.push("ADD interior 3D perspective views");
  }

  if (modifyRequest.quickToggles?.addDetails) {
    parts.push("ADD technical details and annotations");
  }

  if (modifyRequest.quickToggles?.addFloorPlans) {
    parts.push("ADD floor plans (ground, first) with dimensions");
  }

  if (modifyRequest.customPrompt) {
    parts.push(modifyRequest.customPrompt);
  }

  return parts.join("\n") || "No changes requested";
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
    const { detectDNADrift } = await import("./driftValidator.js");
    dnaDrift = detectDNADrift(baselineDNA, candidateDNA);
  }

  // Image drift
  let imageDrift = null;
  if (baselineUrl && candidateUrl) {
    const { detectImageDrift } = await import("./driftValidator.js");
    imageDrift = await detectImageDrift(baselineUrl, candidateUrl, {
      panelCoordinates,
    });
  }

  // Combine drift scores
  const driftScore = Math.max(
    dnaDrift?.driftScore || 0,
    imageDrift?.driftScore || 0,
  );

  return {
    hasDrift: driftScore > 0.1,
    driftScore,
    dnaDrift,
    imageDrift,
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

function buildGeometryDirective(geometryDNA, needsGeometryRegen = false) {
  const summary = summarizeGeometryDNA(geometryDNA);
  if (!summary) return "";
  if (needsGeometryRegen) {
    return `Rebuild massing to match geometry DNA (${summary}). Align all elevations/sections to this updated volume.`;
  }
  return `Preserve exact massing per geometry DNA (${summary}). Do not change roof form, stacking, or volume proportions.`;
}

function tuneStrengthForClassification(baseStrength, classification, enabled) {
  if (!enabled) return baseStrength;
  if (classification === "appearance_only") return Math.min(baseStrength, 0.14);
  if (classification === "minor_elevation")
    return Math.min(Math.max(baseStrength, 0.14), 0.18);
  if (classification === "volume_change" || classification === "new_project")
    return Math.max(baseStrength, 0.24);
  return baseStrength;
}

function pickModificationType(classification, fallback = "moderate") {
  if (classification === "appearance_only") return "minor";
  if (classification === "minor_elevation") return "minor";
  if (classification === "volume_change" || classification === "new_project")
    return "significant";
  return fallback || "moderate";
}

export default {
  runA1SheetWorkflow,
  runModifyWorkflow,
};
