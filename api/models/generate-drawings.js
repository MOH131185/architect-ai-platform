/**
 * POST /api/models/generate-drawings
 *
 * Request:
 * {
 *   "geometry": { "project_id": "demo", "levels": [...] },
 *   "styleDNA": { "roof_language": "pitched-gable-or-hip" },
 *   "drawingTypes": ["plan", "elevation", "section"]
 * }
 */

import { generateTechnicalDrawings } from "../../src/services/drawing/technicalDrawingService.js";
import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import {
  buildGenerateDrawingsResponse,
  validateGenerateDrawingsRequest,
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
      { endpoint: "generate-drawings" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useTechnicalDrawingEngine"],
      "generate-drawings",
    )
  ) {
    return;
  }

  try {
    const validation = validateGenerateDrawingsRequest(req.body || {});
    const featureFlags = [
      "useTechnicalDrawingEngine",
      "useDeterministicSvgPlans",
      "useGeometryValidationEngine",
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
          endpoint: "generate-drawings",
          featureFlags,
        },
      );
    }

    const result = await generateTechnicalDrawings(validation.normalized);
    const selectedModelStrategy = getRecommendedModel("technical_drawings", {
      preferLocal: true,
      useCase: validation.normalized.drawingTypes.join(" "),
    });
    const responsePayload = buildGenerateDrawingsResponse({
      result,
      warnings: [...validation.warnings, ...(result.warnings || [])],
      selectedModelStrategy,
      featureFlags,
    });

    if (
      result.validationReport?.status === "invalid" &&
      isFeatureEnabled("useFailClosedTechnicalFlow")
    ) {
      return sendError(
        res,
        422,
        "DRAWING_VALIDATION_FAILED",
        "Generated drawings failed validation against canonical geometry.",
        {
          validationReport: result.validationReport,
          output: responsePayload,
        },
        {
          endpoint: "generate-drawings",
          featureFlags,
        },
      );
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    return sendError(
      res,
      500,
      "DRAWING_GENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "generate-drawings",
        featureFlags: [
          "useTechnicalDrawingEngine",
          "useDeterministicSvgPlans",
          "useGeometryValidationEngine",
          "useFailClosedTechnicalFlow",
        ],
      },
    );
  }
}
