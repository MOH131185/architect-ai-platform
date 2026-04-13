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
import {
  buildGenerateDrawingsResponse,
  validateGenerateDrawingsRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import { getRecommendedModel } from "../../src/services/models/openSourceModelRouter.js";
import {
  config,
  handleOptions,
  rejectInvalidMethod,
  sendError,
  setCors,
} from "./_shared.js";

export { config };

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);
  if (rejectInvalidMethod(req, res)) return;

  try {
    const validation = validateGenerateDrawingsRequest(req.body || {});
    if (!validation.ok) {
      return sendError(
        res,
        400,
        "INVALID_REQUEST",
        validation.errors.join(" "),
      );
    }

    const result = await generateTechnicalDrawings(validation.normalized);
    const selectedModelStrategy = getRecommendedModel("technical_drawings", {
      preferLocal: true,
      useCase: validation.normalized.drawingTypes.join(" "),
    });

    return res.status(200).json(
      buildGenerateDrawingsResponse({
        result,
        warnings: result.warnings || [],
        selectedModelStrategy,
      }),
    );
  } catch (error) {
    return sendError(res, 500, "DRAWING_GENERATION_FAILED", error.message);
  }
}
