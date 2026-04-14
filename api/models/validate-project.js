import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { validateProject } from "../../src/services/validation/projectValidationEngine.js";
import {
  buildValidateProjectResponse,
  validateValidateProjectRequest,
} from "../../src/services/models/architectureBackendContracts.js";
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
      { endpoint: "validate-project" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useGeometryValidationEngine"],
      "validate-project",
    )
  ) {
    return;
  }

  try {
    const validation = validateValidateProjectRequest(req.body || {});
    const featureFlags = ["useGeometryValidationEngine"];
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
          endpoint: "validate-project",
          featureFlags,
        },
      );
    }

    const projectGeometry = coerceToCanonicalProjectGeometry(
      validation.normalized.projectGeometry,
    );
    const result = validateProject({
      projectGeometry,
      drawings: validation.normalized.drawings,
      drawingTypes: validation.normalized.drawingTypes,
    });

    return res.status(200).json(
      buildValidateProjectResponse({
        result,
        warnings: validation.warnings,
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "PROJECT_VALIDATION_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "validate-project",
        featureFlags: ["useGeometryValidationEngine"],
      },
    );
  }
}
