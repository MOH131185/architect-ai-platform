import { PIPELINE_MODE } from "../../config/pipelineMode.js";
import {
  saveRunSnapshot,
  buildPanelManifest,
  computeRunMetrics,
} from "../validation/runInstrumentation.js";

function buildPanelsMap(generatedPanels, compositionResult) {
  const panelsMap = {};

  generatedPanels.forEach((panel) => {
    panelsMap[panel.type] = {
      imageUrl: panel.imageUrl,
      seed: panel.seed,
      prompt: panel.prompt,
      negativePrompt: panel.negativePrompt,
      width: panel.width,
      height: panel.height,
      coordinates: compositionResult.coordinates[panel.type] || {},
      metadata: panel.meta,
    };
  });

  return panelsMap;
}

function buildBaselineBundle({
  canonicalDesignState,
  compositionResult,
  consistencyReport,
  designId,
  effectiveBaseSeed,
  generatedPanels,
  geometryDNA,
  geometryRenders,
  geometryScene,
  masterDNA,
  panelSeeds,
  panelValidations,
  panelsMap,
  programLock,
  runId,
  sheetId,
  siteSnapshot,
}) {
  const qualityEvaluation = masterDNA?.qualityEvaluation || null;
  return {
    designId,
    sheetId,
    baselineImageUrl: compositionResult.composedSheetUrl,
    siteSnapshotUrl: siteSnapshot?.dataUrl || null,
    baselineDNA: masterDNA,
    geometryBaseline: geometryDNA
      ? {
          geometryDNA,
          renders: geometryRenders,
          scene: geometryScene,
        }
      : null,
    baselineLayout: {
      panelCoordinates: Object.values(compositionResult.coordinates),
      layoutKey: "uk-riba-standard",
      sheetWidth: compositionResult.metadata.width,
      sheetHeight: compositionResult.metadata.height,
    },
    panels: panelsMap,
    metadata: {
      seed: effectiveBaseSeed,
      runId: runId || compositionResult.trace?.runId || null,
      traceId: compositionResult.trace?.traceId || null,
      model: "black-forest-labs/FLUX.1-schnell",
      dnaHash: "",
      layoutHash: "",
      width: compositionResult.metadata.width,
      height: compositionResult.metadata.height,
      a1LayoutKey: "uk-riba-standard",
      generatedAt: new Date().toISOString(),
      workflow: PIPELINE_MODE.MULTI_PANEL,
      consistencyScore: consistencyReport.consistencyScore,
      panelCount: generatedPanels.length,
      panelValidations,
      hasGeometryControl: !!geometryDNA,
      transport: compositionResult.metadata?.transport || null,
      durationMs: compositionResult.metadata?.durationMs || null,
      manifestUrl: compositionResult.trace?.manifestUrl || null,
      manifestFile: compositionResult.metadata?.manifestFile || null,
      outputFile: compositionResult.metadata?.outputFile || null,
      pdfOutputFile: compositionResult.metadata?.pdfOutputFile || null,
      pdfUrl: compositionResult.pdfUrl || null,
      qaAllPassed: compositionResult.qa?.allPassed ?? null,
      critiqueOverallPass: compositionResult.critique?.overallPass ?? null,
      qualityScore: qualityEvaluation?.total ?? null,
      qualityGrade: qualityEvaluation?.grade ?? null,
      qualityEvaluation,
    },
    seeds: {
      base: effectiveBaseSeed,
      derivationMethod: "hash-derived",
      panelSeeds,
    },
    basePrompt: "",
    consistencyLocks: [],
    programLock: programLock || null,
    canonicalDesignState: canonicalDesignState || null,
  };
}

function buildWorkflowResult({
  baselineBundle,
  blenderOutputs,
  canonicalDesignState,
  compositionResult,
  consistencyReport,
  designId,
  effectiveBaseSeed,
  generatedPanels,
  geometryDNA,
  geometryRenders,
  geometryScene,
  masterDNA,
  panelSeeds,
  panelValidations,
  panelsMap,
  runId,
  sheetId,
}) {
  const qualityEvaluation = masterDNA?.qualityEvaluation || null;
  const finalSheetRegression =
    compositionResult?.metadata?.finalSheetRegression || null;
  const postComposeVerification =
    compositionResult?.metadata?.postComposeVerification || null;
  const technicalCredibility =
    compositionResult?.metadata?.technicalCredibility ||
    postComposeVerification?.technicalCredibility ||
    null;
  const publishability =
    compositionResult?.metadata?.publishability ||
    postComposeVerification?.publishability ||
    null;
  const verificationBundle =
    postComposeVerification?.verificationBundle ||
    postComposeVerification?.verificationState ||
    null;
  const verification =
    postComposeVerification?.verification ||
    verificationBundle?.verification ||
    null;
  const renderedTextZone =
    compositionResult?.metadata?.renderedTextZone ||
    postComposeVerification?.renderedTextZone ||
    null;
  const postComposeVerified = Boolean(
    publishability?.verificationPhase === "post_compose" ||
    verification?.phase === "post_compose" ||
    verificationBundle?.phase === "post_compose",
  );

  return {
    success: true,
    designId,
    sheetId,
    masterDNA,
    panels: generatedPanels,
    panelMap: panelsMap,
    composedSheetUrl: compositionResult.composedSheetUrl,
    pdfUrl: compositionResult.pdfUrl || null,
    coordinates: compositionResult.coordinates,
    geometryDNA: geometryDNA || masterDNA.geometry || null,
    geometryRenders,
    geometryScene,
    blenderOutputs: blenderOutputs || null,
    consistencyReport,
    baselineBundle,
    canonicalDesignState: canonicalDesignState || null,
    seeds: {
      base: effectiveBaseSeed,
      panelSeeds,
    },
    panelValidations,
    qa: compositionResult.qa || null,
    critique: compositionResult.critique || null,
    trace: compositionResult.trace || null,
    qualityEvaluation,
    spatialGraph: masterDNA?.spatialGraph || null,
    climateData: masterDNA?.climateData || null,
    finalSheetRegression,
    postComposeVerification,
    renderedTextZone,
    technicalCredibility,
    publishability,
    verification,
    verificationBundle,
    verificationState: verificationBundle,
    postComposeVerified,
    metadata: {
      workflow: PIPELINE_MODE.MULTI_PANEL,
      panelCount: generatedPanels.length,
      consistencyScore: consistencyReport.consistencyScore,
      generatedAt: new Date().toISOString(),
      baseSeed: effectiveBaseSeed,
      runId: runId || compositionResult.trace?.runId || null,
      traceId: compositionResult.trace?.traceId || null,
      manifestUrl: compositionResult.trace?.manifestUrl || null,
      manifestFile: compositionResult.metadata?.manifestFile || null,
      transport: compositionResult.metadata?.transport || null,
      durationMs: compositionResult.metadata?.durationMs || null,
      outputFile: compositionResult.metadata?.outputFile || null,
      pdfOutputFile: compositionResult.metadata?.pdfOutputFile || null,
      pdfUrl: compositionResult.pdfUrl || null,
      panelSeeds,
      qaAllPassed: compositionResult.qa?.allPassed ?? null,
      critiqueOverallPass: compositionResult.critique?.overallPass ?? null,
      hashValidation: compositionResult.metadata?.hashValidation || null,
      qualityScore: qualityEvaluation?.total ?? null,
      qualityGrade: qualityEvaluation?.grade ?? null,
      qualityEvaluation,
      finalSheetRegression,
      renderedTextZone,
      technicalCredibility,
      publishability,
      verification,
      verificationBundle,
      verificationState: verificationBundle,
      postComposeVerified,
    },
  };
}

/**
 * Canonical finalization helper for dnaWorkflowOrchestrator.
 * Owns baseline persistence, instrumentation, and final result assembly.
 */
export async function finalizeMultiPanelRun({
  baselineStore,
  blenderOutputs,
  canonicalDesignState,
  compositionResult,
  consistencyReport,
  designId,
  effectiveBaseSeed,
  gateProgramReport,
  generatedPanels,
  geometryDNA,
  geometryRenders,
  geometryScene,
  logger,
  masterDNA,
  panelSeeds,
  panelValidations,
  programLock,
  reportProgress,
  runId,
  sheetId,
  siteSnapshot,
}) {
  logger?.info("💾 STEP 9: Saving baseline artifacts...");
  reportProgress?.("finalizing", "Saving baseline artifacts...", 93);

  const panelsMap = buildPanelsMap(generatedPanels, compositionResult);
  const baselineBundle = buildBaselineBundle({
    canonicalDesignState,
    compositionResult,
    consistencyReport,
    designId,
    effectiveBaseSeed,
    generatedPanels,
    geometryDNA,
    geometryRenders,
    geometryScene,
    masterDNA,
    panelSeeds,
    panelValidations,
    panelsMap,
    programLock,
    runId,
    sheetId,
    siteSnapshot,
  });

  await baselineStore.saveBaselineArtifacts({
    designId,
    sheetId,
    bundle: baselineBundle,
  });
  logger?.success("✅ Baseline artifacts saved");

  try {
    const panelManifest = buildPanelManifest(
      generatedPanels,
      canonicalDesignState,
      programLock,
    );
    const metrics = computeRunMetrics({
      programLock,
      gateProgram: gateProgramReport,
      gateDrift: null,
      panels: generatedPanels,
      cds: canonicalDesignState,
    });
    saveRunSnapshot(designId, {
      cds: canonicalDesignState,
      programLock,
      panelManifest,
      gateProgram: gateProgramReport,
      metrics,
      composeTrace: compositionResult.trace || null,
      composeManifest:
        compositionResult.metadata?.manifestUrl ||
        compositionResult.metadata?.manifestFile
          ? {
              trace: compositionResult.trace || null,
              manifestUrl: compositionResult.metadata?.manifestUrl || null,
              manifestFile: compositionResult.metadata?.manifestFile || null,
              outputFile: compositionResult.metadata?.outputFile || null,
              pdfOutputFile: compositionResult.metadata?.pdfOutputFile || null,
              transport: compositionResult.metadata?.transport || null,
            }
          : null,
    });
    logger?.info(`📊 Run instrumentation saved for ${designId}`);
  } catch (instrumentationError) {
    logger?.warn(
      "⚠️ Run instrumentation failed:",
      instrumentationError.message,
    );
  }

  logger?.info("📝 STEP 10: Design history will be saved by caller...");
  reportProgress?.("finalizing", "Finalizing...", 95);

  logger?.info("\n✅ ========================================");
  logger?.info("✅ MULTI-PANEL A1 WORKFLOW COMPLETE");
  logger?.info("✅ ========================================\n");

  return buildWorkflowResult({
    baselineBundle,
    blenderOutputs,
    canonicalDesignState,
    compositionResult,
    consistencyReport,
    designId,
    effectiveBaseSeed,
    generatedPanels,
    geometryDNA,
    geometryRenders,
    geometryScene,
    masterDNA,
    panelSeeds,
    panelValidations,
    panelsMap,
    runId,
    sheetId,
  });
}
