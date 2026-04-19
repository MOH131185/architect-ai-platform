import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { executeApprovedRegeneration } from "../../src/services/editing/regenerationExecutionService.js";
import {
  buildExecuteRegenerationResponse,
  validateExecuteRegenerationRequest,
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
      { endpoint: "execute-regeneration" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useTargetedRegenerationPlanning", "useTargetedRegenerationExecution"],
      "execute-regeneration",
    )
  ) {
    return;
  }

  try {
    const validation = validateExecuteRegenerationRequest(req.body || {});
    const featureFlags = [
      "useTargetedRegenerationPlanning",
      "useTargetedRegenerationExecution",
      "usePhase7EntityDependencies",
      "useA1FontEmbeddingFix",
      "useA1ConsistencyGuards",
      "useTechnicalPanelScoringPhase8",
      "useTechnicalPanelComposeBlockingPhase8",
      "useFormalSchemaValidation",
      "useFormalSchemaEngine",
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
          endpoint: "execute-regeneration",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "executeRegenerationRequest",
      validation.normalized,
      "execute-regeneration",
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
      "execute-regeneration",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const result = await executeApprovedRegeneration({
      approvedPlan: validation.normalized.approvedPlan,
      targetLayer: validation.normalized.targetLayer,
      projectGeometry,
      drawings: validation.normalized.drawings,
      facadeGrammar: validation.normalized.facadeGrammar,
      visualPackage: validation.normalized.visualPackage,
      validationReport: validation.normalized.validationReport,
      styleDNA: validation.normalized.styleDNA,
      artifactStore: projectGeometry?.metadata?.project_artifact_store || null,
      options: validation.normalized.options,
    });

    return res.status(200).json(
      buildExecuteRegenerationResponse({
        result,
        warnings: validation.warnings,
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "EXECUTE_REGENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "execute-regeneration",
      },
    );
  }
}
