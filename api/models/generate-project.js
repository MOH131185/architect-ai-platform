import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import { generateProjectPackage } from "../../src/services/project/projectGenerationService.js";
import {
  buildGenerateProjectResponse,
  validateGenerateProjectRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import { getRecommendedModel } from "../../src/services/models/openSourceModelRouter.js";
import {
  config,
  ensureFeatureEnabled,
  enforceSchemaValidation,
  handleOptions,
  rejectInvalidMethod,
  sendError,
  setCors,
} from "./_shared.js";

export { config };

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!setCors(req, res)) {
    return sendError(
      res,
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origin is not allowed for this endpoint.",
      null,
      { endpoint: "generate-project" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      [
        "useFloorplanEngine",
        "useTechnicalDrawingEngine",
        "usePhase3MultiLevelEngine",
      ],
      "generate-project",
    )
  ) {
    return;
  }

  try {
    const validation = validateGenerateProjectRequest(req.body || {});
    const featureFlags = [
      "useFloorplanEngine",
      "useTechnicalDrawingEngine",
      "usePhase3MultiLevelEngine",
      "useStairCoreGenerator",
      "useFacadeGrammarEngine",
      "useStructuralSanityLayer",
      "useGeometryLockedVisuals",
      "useGeometryValidationEngine",
      "usePhase3Validation",
      "usePhase4LayoutSearch",
      "useBuildableEnvelopeReasoning",
      "useFormalSchemaValidation",
      "useFacadeComponentAssembly",
      "useStructuralSemanticsPhase4",
      "useA1ProjectReadiness",
      "useFormalSchemaEngine",
      "useComposeReadinessPhase5",
      "useArtifactLifecycleStore",
      "useIrregularSiteFallbackPhase5",
      "usePhase6RepairSearch",
      "useTargetedRegenerationPlanning",
      "useComposeExecutionPlanning",
      "useIrregularSiteFallbackPhase6",
      "useProjectRecoveryFlows",
      "useTechnicalPanelReadabilityChecks",
      "useA1TechnicalPanelGating",
      "useFailClosedTechnicalFlow",
    ];
    if (!validation.ok) {
      return sendError(
        res,
        400,
        "INVALID_REQUEST",
        validation.errors.join(" "),
        {
          errors: validation.errors,
          warnings: validation.warnings,
        },
        {
          endpoint: "generate-project",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "generateProjectRequest",
      validation.normalized,
      "generate-project",
      featureFlags,
    );
    if (!schemaValidation.valid) {
      return;
    }

    const result = await generateProjectPackage(validation.normalized);
    const responsePayload = buildGenerateProjectResponse({
      result,
      warnings: [...validation.warnings, ...(result.warnings || [])],
      featureFlags,
    });

    if (
      result.validationReport?.status === "invalid" &&
      isFeatureEnabled("useFailClosedTechnicalFlow")
    ) {
      return sendError(
        res,
        422,
        "PROJECT_GENERATION_FAILED_VALIDATION",
        "Generated project package failed validation.",
        {
          validationReport: result.validationReport,
          output: responsePayload,
        },
        {
          endpoint: "generate-project",
          featureFlags,
        },
      );
    }

    responsePayload.selectedModelStrategy = getRecommendedModel(
      "floorplan_generation",
      {
        preferLocal: true,
        useCase: "generate project package",
      },
    );

    return res.status(200).json(responsePayload);
  } catch (error) {
    return sendError(
      res,
      500,
      "PROJECT_GENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "generate-project",
      },
    );
  }
}
