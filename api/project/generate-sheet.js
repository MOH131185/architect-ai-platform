import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import dnaWorkflowOrchestrator from "../../src/services/dnaWorkflowOrchestrator.js";
import { buildProjectPipelineV2Bundle } from "../../src/services/project/projectPipelineV2Service.js";

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
        blockers: bundle?.blockers || bundle?.validation?.blockers || [],
      });
    }

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

    return res.status(200).json({
      success: Boolean(workflowResult?.success !== false),
      pipelineVersion: bundle.pipelineVersion,
      geometryHash: bundle.compiledProject?.geometryHash || null,
      confidence: bundle.confidence,
      validation: bundle.validation,
      result: {
        ...workflowResult,
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
