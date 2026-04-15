import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import { buildVisualGenerationPackage } from "../../src/services/visual/geometryLockedVisualRouter.js";
import {
  buildGenerateVisualPackageResponse,
  validateGenerateVisualPackageRequest,
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
      { endpoint: "generate-visual-package" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useGeometryLockedVisuals"],
      "generate-visual-package",
    )
  ) {
    return;
  }

  try {
    const validation = validateGenerateVisualPackageRequest(req.body || {});
    const featureFlags = [
      "useGeometryLockedVisuals",
      "useFacadeGrammarEngine",
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
          endpoint: "generate-visual-package",
          featureFlags,
        },
      );
    }

    const visualPackage = await buildVisualGenerationPackage(
      coerceToCanonicalProjectGeometry(validation.normalized.projectGeometry),
      validation.normalized.styleDNA,
      validation.normalized.viewType,
      validation.normalized.options,
    );

    if (
      visualPackage.validation?.valid === false &&
      isFeatureEnabled("useFailClosedTechnicalFlow")
    ) {
      return sendError(
        res,
        422,
        "VISUAL_PACKAGE_INVALID",
        "Generated visual package failed consistency validation.",
        {
          validation: visualPackage.validation,
        },
        {
          endpoint: "generate-visual-package",
          featureFlags,
        },
      );
    }

    return res.status(200).json(
      buildGenerateVisualPackageResponse({
        visualPackage,
        warnings: validation.warnings,
        selectedModelStrategy: getRecommendedModel("visualization", {
          preferLocal: false,
          useCase: validation.normalized.viewType,
        }),
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "VISUAL_PACKAGE_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "generate-visual-package",
      },
    );
  }
}
