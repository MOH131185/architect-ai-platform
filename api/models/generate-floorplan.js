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
import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import {
  buildGenerateFloorplanResponse,
  validateGenerateFloorplanRequest,
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
      { endpoint: "generate-floorplan" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useFloorplanEngine", "useFloorplanGenerator"],
      "generate-floorplan",
    )
  ) {
    return;
  }

  try {
    const validation = validateGenerateFloorplanRequest(req.body || {});
    const featureFlags = [
      "useFloorplanEngine",
      "useFloorplanGenerator",
      "useCanonicalGeometryPhase2",
      "useAdjacencySolver",
      "usePhase3MultiLevelEngine",
      "useStairCoreGenerator",
      "useGeometryValidationEngine",
      "usePhase3Validation",
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
          endpoint: "generate-floorplan",
          featureFlags,
        },
      );
    }

    const result = await generateLayoutFromProgram(validation.normalized);
    const selectedModelStrategy = getRecommendedModel("floorplan_generation", {
      preferLocal: true,
      useCase: validation.normalized.building_type || "structured floorplan",
    });
    const responsePayload = buildGenerateFloorplanResponse({
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
        "PROJECT_VALIDATION_FAILED",
        "Generated project geometry failed validation.",
        {
          validationReport: result.validationReport,
          output: responsePayload,
        },
        {
          endpoint: "generate-floorplan",
          featureFlags,
        },
      );
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    return sendError(
      res,
      500,
      "FLOORPLAN_GENERATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "generate-floorplan",
        featureFlags: [
          "useFloorplanEngine",
          "useFloorplanGenerator",
          "useCanonicalGeometryPhase2",
          "useAdjacencySolver",
          "usePhase3MultiLevelEngine",
          "useStairCoreGenerator",
          "useGeometryValidationEngine",
          "usePhase3Validation",
          "useFailClosedTechnicalFlow",
        ],
      },
    );
  }
}
