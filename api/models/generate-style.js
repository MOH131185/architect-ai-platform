/**
 * POST /api/models/generate-style
 *
 * Request:
 * {
 *   "prompt": "quiet contemporary coastal home",
 *   "portfolioReferences": [{ "url": "...", "tags": ["brick", "courtyard"] }],
 *   "location": { "region": "UK", "climate_zone": "marine-temperate" },
 *   "styleIntent": "contemporary but contextual",
 *   "technicalConstraints": ["pitched roof", "weathering brick"],
 *   "controlImages": ["https://.../massing.png"]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "styleDNA": { ... }
 * }
 */

import { buildStyleDNA } from "../../src/services/style/styleEngine.js";
import {
  buildGenerateStyleResponse,
  validateGenerateStyleRequest,
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
      { endpoint: "generate-style" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(res, ["useOpenSourceStyleEngine"], "generate-style")
  ) {
    return;
  }

  try {
    const validation = validateGenerateStyleRequest(req.body || {});
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
          endpoint: "generate-style",
          featureFlags: ["useOpenSourceStyleEngine"],
        },
      );
    }

    const styleDNA = await buildStyleDNA(validation.normalized);
    const warnings = [...validation.warnings];
    if (!validation.normalized.portfolioReferences.length) {
      warnings.push(
        "No portfolio references supplied; style DNA is using prompt and location only.",
      );
    }

    const selectedModelStrategy = {
      portfolio_style: getRecommendedModel("portfolio_style", {
        preferLocal: true,
        useCase: "portfolio style analysis",
      }),
      regional_style: getRecommendedModel("regional_style", {
        preferLocal: true,
        useCase: "regional style rules",
      }),
    };

    return res.status(200).json(
      buildGenerateStyleResponse({
        styleDNA,
        warnings,
        selectedModelStrategy,
        featureFlags: ["useOpenSourceStyleEngine"],
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "STYLE_GENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "generate-style",
        featureFlags: ["useOpenSourceStyleEngine"],
      },
    );
  }
}
