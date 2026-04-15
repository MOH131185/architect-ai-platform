import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { buildFacadeGrammar } from "../../src/services/facade/facadeGrammarEngine.js";
import {
  buildGenerateFacadeResponse,
  validateGenerateFacadeRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import { getRecommendedModel } from "../../src/services/models/openSourceModelRouter.js";
import {
  config,
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
      { endpoint: "generate-facade" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(res, ["useFacadeGrammarEngine"], "generate-facade")
  ) {
    return;
  }

  try {
    const validation = validateGenerateFacadeRequest(req.body || {});
    const featureFlags = ["useFacadeGrammarEngine"];
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
          endpoint: "generate-facade",
          featureFlags,
        },
      );
    }

    const projectGeometry = coerceToCanonicalProjectGeometry(
      validation.normalized.projectGeometry,
    );
    const facadeGrammar = buildFacadeGrammar(
      projectGeometry,
      validation.normalized.styleDNA,
    );

    return res.status(200).json(
      buildGenerateFacadeResponse({
        facadeGrammar,
        warnings: validation.warnings,
        selectedModelStrategy: getRecommendedModel("regional_style", {
          preferLocal: true,
          useCase: "facade grammar",
        }),
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "FACADE_GENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "generate-facade",
      },
    );
  }
}
