import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { planTargetedRegeneration } from "../../src/services/editing/targetedRegenerationPlanner.js";
import {
  buildPlanRegenerationResponse,
  validatePlanRegenerationRequest,
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
      { endpoint: "plan-regeneration" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useTargetedRegenerationPlanning"],
      "plan-regeneration",
    )
  ) {
    return;
  }

  try {
    const validation = validatePlanRegenerationRequest(req.body || {});
    const featureFlags = [
      "useTargetedRegenerationPlanning",
      "useFragmentEdgesPhase6",
      "usePhase7EntityDependencies",
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
          endpoint: "plan-regeneration",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "planRegenerationRequest",
      validation.normalized,
      "plan-regeneration",
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
      "plan-regeneration",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const result = planTargetedRegeneration({
      targetLayer: validation.normalized.targetLayer,
      projectGeometry,
      drawings: validation.normalized.drawings,
      facadeGrammar: validation.normalized.facadeGrammar,
      visualPackage: validation.normalized.visualPackage,
      artifactStore: projectGeometry?.metadata?.project_artifact_store || null,
      validationReport: validation.normalized.validationReport,
      options: validation.normalized.options,
    });

    return res.status(200).json(
      buildPlanRegenerationResponse({
        result,
        warnings: validation.warnings,
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "PLAN_REGENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "plan-regeneration",
      },
    );
  }
}
