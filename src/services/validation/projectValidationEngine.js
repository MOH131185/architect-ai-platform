import { runDrawingConsistencyChecks } from "./drawingConsistencyChecks.js";
import { runGeometryConsistencyChecks } from "./geometryConsistencyChecks.js";

function buildStatus(errors = [], warnings = []) {
  if (errors.length) {
    return "invalid";
  }
  if (warnings.length) {
    return "valid_with_warnings";
  }
  return "valid";
}

export function buildValidationDisabledReport(
  projectGeometry,
  drawingTypes = [],
) {
  return {
    valid: true,
    status: "valid_with_warnings",
    errors: [],
    warnings: ["Geometry validation engine is disabled by feature flag."],
    repairSuggestions: [],
    checks: {
      geometry: null,
      drawing: null,
    },
    summary: {
      roomCount: (projectGeometry?.rooms || []).length,
      wallCount: (projectGeometry?.walls || []).length,
      doorCount: (projectGeometry?.doors || []).length,
      windowCount: (projectGeometry?.windows || []).length,
      levelCount: (projectGeometry?.levels || []).length,
      drawingTypes,
    },
  };
}

export function validateProject({
  projectGeometry,
  drawings = null,
  adjacencyGraph = null,
  drawingTypes = [],
} = {}) {
  const geometryReport = runGeometryConsistencyChecks({
    projectGeometry,
    adjacencyGraph,
  });
  const drawingReport = drawings
    ? runDrawingConsistencyChecks({
        projectGeometry,
        drawings,
        drawingTypes,
      })
    : null;

  const errors = [...geometryReport.errors, ...(drawingReport?.errors || [])];
  const warnings = [
    ...geometryReport.warnings,
    ...(drawingReport?.warnings || []),
  ];
  const repairSuggestions = [...geometryReport.repairSuggestions];
  const status = buildStatus(errors, warnings);

  return {
    valid: status !== "invalid",
    status,
    errors,
    warnings,
    repairSuggestions,
    checks: {
      geometry: geometryReport.checks,
      drawing: drawingReport?.checks || null,
    },
    summary: {
      roomCount: (projectGeometry?.rooms || []).length,
      wallCount: (projectGeometry?.walls || []).length,
      doorCount: (projectGeometry?.doors || []).length,
      windowCount: (projectGeometry?.windows || []).length,
      levelCount: (projectGeometry?.levels || []).length,
      drawingTypes,
    },
  };
}

export default {
  buildValidationDisabledReport,
  validateProject,
};
