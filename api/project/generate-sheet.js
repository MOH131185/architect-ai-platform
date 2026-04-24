import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import dnaWorkflowOrchestrator from "../../src/services/dnaWorkflowOrchestrator.js";
import { buildProjectPipelineV2Bundle } from "../../src/services/project/projectPipelineV2Service.js";

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function resolveVerificationPayload(workflowResult = {}) {
  return (
    workflowResult?.verification ||
    workflowResult?.verificationBundle?.verification ||
    workflowResult?.verificationState?.verification ||
    workflowResult?.metadata?.verification ||
    null
  );
}

function buildTechnicalAuthority(bundle = {}, workflowResult = null) {
  const technicalPack =
    bundle?.compiledProject?.technicalPack || bundle?.technicalPack || null;
  const technicalCredibility = workflowResult?.technicalCredibility || null;
  const readyFromVerification =
    String(technicalCredibility?.status || "").toLowerCase() === "pass";

  return {
    geometryHash:
      technicalPack?.geometryHash ||
      bundle?.compiledProject?.geometryHash ||
      null,
    ready: readyFromVerification || technicalPack?.ready === true,
    source: readyFromVerification
      ? "post_compose_verification"
      : technicalPack?.source || null,
    fallbackUsed:
      technicalPack?.fallbackUsed === true ||
      bundle?.compiledProject?.layoutQuality?.fallbackUsed === true ||
      bundle?.layoutQuality?.fallbackUsed === true,
    blockers: uniqueStrings([
      ...(technicalPack?.blockers || []),
      ...(technicalCredibility?.blockers || []),
    ]),
  };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      projectDetails = {},
      programSpaces = [],
      locationData = {},
      sitePolygon = [],
      siteMetrics = {},
      materialWeight = 0.5,
      characteristicWeight = 0.5,
      portfolioFiles = [],
      siteSnapshot = null,
      baseSeed = Date.now(),
    } = req.body || {};

    const bundle = await buildProjectPipelineV2Bundle({
      projectDetails,
      programSpaces,
      locationData,
      sitePolygon,
      siteMetrics,
      materialWeight,
      characteristicWeight,
      portfolioFiles,
    });

    if (!bundle?.supported || bundle?.validation?.valid === false) {
      return res.status(422).json({
        success: false,
        pipelineVersion: bundle?.pipelineVersion || null,
        geometryHash: bundle?.compiledProject?.geometryHash || null,
        confidence: bundle?.confidence || null,
        validation: bundle?.validation || null,
        authorityReadiness: bundle?.authorityReadiness || null,
        deliveryStages: bundle?.deliveryStages || null,
        exportManifest: bundle?.exportManifest || null,
        reviewSurface: bundle?.reviewSurface || null,
        technicalAuthority: buildTechnicalAuthority(bundle),
        verification: null,
        blockers: bundle?.blockers || bundle?.validation?.blockers || [],
      });
    }

    const preComposeTechnicalAuthority = buildTechnicalAuthority(bundle);
    const projectContext = {
      ...projectDetails,
      buildingProgram: projectDetails.program || projectDetails.subType,
      buildingCategory: projectDetails.category,
      buildingSubType: projectDetails.subType,
      floorArea: Number(projectDetails.area || 0),
      area: Number(projectDetails.area || 0),
      floorCount:
        bundle?.programBrief?.levelCount || projectDetails.floorCount || 2,
      floors:
        bundle?.programBrief?.levelCount || projectDetails.floorCount || 2,
      entranceDirection: projectDetails.entranceDirection || "S",
      programSpaces: bundle?.programBrief?.spaces || programSpaces,
      sitePolygon,
      siteMetrics,
      sitePolygonMetrics: siteMetrics,
      portfolioBlend: {
        materialWeight,
        characteristicWeight,
        portfolioFiles,
        localStyle: locationData?.recommendedStyle,
        climateStyle: locationData?.climate?.type,
      },
      siteEvidence: bundle.siteEvidence,
      localStyleEvidence: bundle.localStyleEvidence,
      portfolioStyleEvidence: bundle.portfolioStyleEvidence,
      styleBlendSpec: bundle.styleBlendSpec,
      programBrief: bundle.programBrief,
      projectGeometry: bundle.projectGeometry,
      populatedGeometry: bundle.populatedGeometry,
      compiledProject: bundle.compiledProject,
      technicalPack:
        bundle.technicalPack || bundle.compiledProject?.technicalPack,
      layoutQuality:
        bundle.layoutQuality || bundle.compiledProject?.layoutQuality || null,
      technicalAuthority: preComposeTechnicalAuthority,
      authorityReadiness: bundle.authorityReadiness || null,
      deliveryStages: bundle.deliveryStages || null,
      exportManifest: bundle.exportManifest || null,
      reviewSurface: bundle.reviewSurface || null,
      projectQuantityTakeoff: bundle.projectQuantityTakeoff,
      blendedStyle: bundle.blendedStyle,
      confidence: bundle.confidence,
      validation: bundle.validation,
      pipelineVersion: bundle.pipelineVersion,
      location: locationData,
      siteAnalysis: locationData?.siteAnalysis,
      siteDNA: locationData?.siteDNA,
      localMaterials: locationData?.localMaterials,
    };

    const workflowResult =
      await dnaWorkflowOrchestrator.runMultiPanelA1Workflow({
        locationData,
        projectContext,
        portfolioFiles,
        siteSnapshot,
        baseSeed,
      });

    const technicalAuthority = buildTechnicalAuthority(bundle, workflowResult);
    const verification = resolveVerificationPayload(workflowResult);

    return res.status(200).json({
      success: Boolean(workflowResult?.success !== false),
      pipelineVersion: bundle.pipelineVersion,
      geometryHash: bundle.compiledProject?.geometryHash || null,
      confidence: bundle.confidence,
      validation: bundle.validation,
      authorityReadiness: bundle.authorityReadiness,
      deliveryStages: bundle.deliveryStages,
      exportManifest: bundle.exportManifest,
      reviewSurface: bundle.reviewSurface,
      technicalAuthority,
      verification,
      result: {
        ...workflowResult,
        technicalAuthority,
        verification,
        authorityReadiness: bundle.authorityReadiness,
        deliveryStages: bundle.deliveryStages,
        exportManifest: bundle.exportManifest,
        reviewSurface: bundle.reviewSurface,
        compiledProject: bundle.compiledProject,
        projectQuantityTakeoff: bundle.projectQuantityTakeoff,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Project sheet generation failed",
    });
  }
}
