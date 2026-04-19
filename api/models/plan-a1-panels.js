import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { planA1Panels } from "../../src/services/a1/a1PanelPlanningService.js";
import {
  buildPlanA1PanelsResponse,
  validatePlanA1PanelsRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import {
  config,
  enforceSchemaValidation,
  ensureFeatureEnabled,
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
      { endpoint: "plan-a1-panels" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (!ensureFeatureEnabled(res, ["useA1ProjectReadiness"], "plan-a1-panels")) {
    return;
  }

  try {
    const validation = validatePlanA1PanelsRequest(req.body || {});
    const featureFlags = [
      "useA1ProjectReadiness",
      "useFormalSchemaValidation",
      "useFormalSchemaEngine",
      "useComposeReadinessPhase5",
      "useArtifactLifecycleStore",
      "useTechnicalPanelReadabilityChecks",
      "useA1TechnicalPanelGating",
      "useTechnicalPanelScoringPhase7",
      "useA1FontEmbeddingFix",
      "useA1ConsistencyGuards",
      "useTechnicalPanelScoringPhase8",
      "useTechnicalPanelComposeBlockingPhase8",
      "useTechnicalFirstA1LayoutPhase8",
      "useA1RecoveryExecutionBridge",
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
          endpoint: "plan-a1-panels",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "planA1PanelsRequest",
      validation.normalized,
      "plan-a1-panels",
      featureFlags,
    );
    if (!schemaValidation.valid) {
      return;
    }

    const projectGeometry = coerceToCanonicalProjectGeometry(
      validation.normalized.projectGeometry,
    );
    const geometrySchemaValidation = enforceSchemaValidation(
      res,
      "canonicalProjectGeometry",
      projectGeometry,
      "plan-a1-panels",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const result = planA1Panels({
      projectGeometry,
      drawings: validation.normalized.drawings,
      visualPackage: validation.normalized.visualPackage,
      facadeGrammar: validation.normalized.facadeGrammar,
      requestedPanels: validation.normalized.requestedPanels,
      artifactStore: projectGeometry?.metadata?.project_artifact_store || null,
    });

    return res.status(200).json(
      buildPlanA1PanelsResponse({
        result,
        warnings: validation.warnings,
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "PLAN_A1_PANELS_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "plan-a1-panels",
      },
    );
  }
}
