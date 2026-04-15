import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { regenerateProjectLayer } from "../../src/services/editing/partialRegenerationService.js";
import { validateProject } from "../../src/services/validation/projectValidationEngine.js";
import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import {
  buildRegenerateLayerResponse,
  validateRegenerateLayerRequest,
} from "../../src/services/models/architectureBackendContracts.js";
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
      { endpoint: "regenerate-layer" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(res, ["usePartialRegeneration"], "regenerate-layer")
  ) {
    return;
  }

  try {
    const validation = validateRegenerateLayerRequest(req.body || {});
    const featureFlags = [
      "usePartialRegeneration",
      "useFacadeGrammarEngine",
      "useStructuralSanityLayer",
      "useGeometryLockedVisuals",
      "usePhase3Validation",
      "useFormalSchemaValidation",
      "useFormalSchemaEngine",
      "useDependencyGraphRegeneration",
      "useFragmentDependencyInvalidation",
      "useA1ProjectReadiness",
      "useComposeReadinessPhase5",
      "useArtifactLifecycleStore",
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
          endpoint: "regenerate-layer",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "regenerateLayerRequest",
      validation.normalized,
      "regenerate-layer",
      featureFlags,
    );
    if (!schemaValidation.valid) {
      return;
    }

    const canonicalProjectGeometry = coerceToCanonicalProjectGeometry(
      validation.normalized.projectGeometry,
    );
    const geometrySchemaValidation = enforceSchemaValidation(
      res,
      "canonicalProjectGeometry",
      canonicalProjectGeometry,
      "regenerate-layer",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const result = await regenerateProjectLayer({
      projectGeometry: canonicalProjectGeometry,
      styleDNA: validation.normalized.styleDNA,
      targetLayer: validation.normalized.targetLayer,
      locks: validation.normalized.locks,
      options: {
        ...validation.normalized.options,
        drawings: validation.normalized.drawings || null,
        facadeGrammar: validation.normalized.facadeGrammar || null,
        visualPackage: validation.normalized.visualPackage || null,
      },
    });

    const validationReport = validateProject({
      projectGeometry: result.projectGeometry,
      drawings: result.drawings?.drawings || null,
      drawingTypes: validation.normalized.options.drawingTypes || [
        "plan",
        "elevation",
        "section",
      ],
      facadeGrammar: result.facadeGrammar || null,
      structuralGrid:
        result.structuralGrid ||
        result.projectGeometry?.metadata?.structural_grid ||
        null,
      previousProjectGeometry: coerceToCanonicalProjectGeometry(
        validation.normalized.projectGeometry,
      ),
      locks: validation.normalized.locks,
      targetLayer: validation.normalized.targetLayer,
    });

    const responsePayload = buildRegenerateLayerResponse({
      result,
      warnings: [...validation.warnings, ...(validationReport.warnings || [])],
      validationReport,
      featureFlags,
    });

    if (
      validationReport.status === "invalid" &&
      isFeatureEnabled("useFailClosedTechnicalFlow")
    ) {
      return sendError(
        res,
        422,
        "LAYER_REGENERATION_FAILED_VALIDATION",
        "Regenerated layer failed validation.",
        {
          validationReport,
          output: responsePayload,
        },
        {
          endpoint: "regenerate-layer",
          featureFlags,
        },
      );
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    if (
      String(error.message || "")
        .toLowerCase()
        .includes("locked")
    ) {
      return sendError(res, 409, "LAYER_LOCKED", error.message, null, {
        endpoint: "regenerate-layer",
      });
    }
    return sendError(
      res,
      500,
      "LAYER_REGENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "regenerate-layer",
      },
    );
  }
}
