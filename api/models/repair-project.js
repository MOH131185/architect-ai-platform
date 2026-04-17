import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import { repairLayout } from "../../src/services/floorplan/layoutRepairEngine.js";
import {
  buildRepairProjectResponse,
  validateRepairProjectRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import { validateProject } from "../../src/services/validation/projectValidationEngine.js";
import {
  config,
  enforceSchemaValidation,
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
      { endpoint: "repair-project" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["usePhase5RepairEngine", "useGeometryValidationEngine"],
      "repair-project",
    )
  ) {
    return;
  }

  try {
    const validation = validateRepairProjectRequest(req.body || {});
    const featureFlags = [
      "usePhase5RepairEngine",
      "usePhase6RepairSearch",
      "useGeometryValidationEngine",
      "useFormalSchemaValidation",
      "useFormalSchemaEngine",
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
          endpoint: "repair-project",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "repairProjectRequest",
      validation.normalized,
      "repair-project",
      featureFlags,
    );
    if (!schemaValidation.valid) {
      return;
    }

    const projectGeometry = coerceToCanonicalProjectGeometry(
      validation.normalized.projectGeometry,
    );
    const geometrySchemaValidation = enforceSchemaValidation(
      res,
      "canonicalProjectGeometry",
      projectGeometry,
      "repair-project",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const validationReportBefore =
      validation.normalized.validationReport ||
      validateProject({
        projectGeometry,
      });
    const result = repairLayout(
      projectGeometry,
      validationReportBefore,
      validation.normalized.options,
    );
    const validationReportAfter = validateProject({
      projectGeometry: result.repairedProjectGeometry,
    });

    const responsePayload = buildRepairProjectResponse({
      result,
      validationReportBefore,
      validationReportAfter,
      warnings: validation.warnings,
      featureFlags,
    });

    if (
      validationReportAfter.status === "invalid" &&
      isFeatureEnabled("useFailClosedTechnicalFlow")
    ) {
      return sendError(
        res,
        422,
        "REPAIR_PROJECT_FAILED_VALIDATION",
        "Repair candidates did not produce a valid project state.",
        {
          validationReportBefore,
          validationReportAfter,
          output: responsePayload,
        },
        {
          endpoint: "repair-project",
          featureFlags,
        },
      );
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    return sendError(
      res,
      500,
      "REPAIR_PROJECT_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "repair-project",
      },
    );
  }
}
