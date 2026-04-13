/**
 * POST /api/models/generate-floorplan
 *
 * Request:
 * {
 *   "project_id": "demo-house",
 *   "level_count": 2,
 *   "room_program": [
 *     { "name": "Living Room", "target_area_m2": 28, "zone": "public", "adjacency": ["kitchen"] },
 *     { "name": "Kitchen", "target_area_m2": 18, "zone": "public" }
 *   ],
 *   "footprint": { "width_m": 14, "depth_m": 10 }
 * }
 */

import { generateLayoutFromProgram } from "../../src/services/floorplan/floorplanGenerator.js";
import {
  buildGenerateFloorplanResponse,
  validateGenerateFloorplanRequest,
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
    const validation = validateGenerateFloorplanRequest(req.body || {});
    if (!validation.ok) {
      return sendError(
        res,
        400,
        "INVALID_REQUEST",
        validation.errors.join(" "),
      );
    }

    const result = await generateLayoutFromProgram(validation.normalized);
    const selectedModelStrategy = getRecommendedModel("floorplan_generation", {
      preferLocal: true,
      useCase: validation.normalized.building_type || "structured floorplan",
    });

    return res.status(200).json(
      buildGenerateFloorplanResponse({
        result,
        warnings: result.warnings || [],
        selectedModelStrategy,
      }),
    );
  } catch (error) {
    return sendError(res, 500, "FLOORPLAN_GENERATION_FAILED", error.message);
  }
}
