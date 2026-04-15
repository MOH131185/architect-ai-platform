import { buildModelStatusResponse } from "../../src/services/models/architectureBackendContracts.js";
import { getSchemaValidationStatus } from "../../src/services/contracts/schemaValidationService.js";
import { getModelStatus } from "../../src/services/models/openSourceModelRouter.js";
import "../../src/services/cad/archElementNormalizer.js";
import "../../src/services/drawing/technicalDrawingService.js";
import "../../src/services/floorplan/floorplanGenerator.js";
import "../../src/services/retrieval/precedentSearchService.js";
import {
  config,
  handleOptions,
  rejectInvalidMethod,
  sendError,
  setCors,
} from "./_shared.js";

export { config };

export default async function handler(req, res) {
  if (handleOptions(req, res, "GET, OPTIONS")) return;
  if (!setCors(req, res, "GET, OPTIONS")) {
    return sendError(
      res,
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origin is not allowed for this endpoint.",
      null,
      { endpoint: "status" },
    );
  }
  if (rejectInvalidMethod(req, res, "GET")) return;

  try {
    const status = {
      ...getModelStatus(),
      schemas: getSchemaValidationStatus(),
    };
    return res.status(200).json(buildModelStatusResponse(status));
  } catch (error) {
    return sendError(
      res,
      500,
      "MODEL_STATUS_FAILED",
      error.message,
      error.details || null,
      { endpoint: "status" },
    );
  }
}
