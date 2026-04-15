import { runDrawingConsistencyChecks } from "./drawingConsistencyChecks.js";
import { runGeometryConsistencyChecks } from "./geometryConsistencyChecks.js";
import { runCrossLevelConsistencyChecks } from "./crossLevelConsistencyChecks.js";
import { runFacadeAndStructureChecks } from "./facadeAndStructureChecks.js";
import { runEditIntegrityChecks } from "./editIntegrityChecks.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { summarizeArtifactFreshness } from "../project/artifactFreshnessService.js";

function buildStatus(errors = [], warnings = []) {
  if (errors.length) {
    return "invalid";
  }
  if (warnings.length) {
    return "valid_with_warnings";
  }
  return "valid";
}

function dedupe(values = []) {
  return [...new Set((values || []).filter(Boolean))];
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
  facadeGrammar = null,
  structuralGrid = null,
  previousProjectGeometry = null,
  locks = {},
  targetLayer = null,
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
  const phase3Enabled = isFeatureEnabled("usePhase3Validation");
  const crossLevelReport = phase3Enabled
    ? runCrossLevelConsistencyChecks(projectGeometry)
    : null;
  const facadeStructureReport =
    phase3Enabled || isFeatureEnabled("useStructuralSemanticsPhase4")
      ? runFacadeAndStructureChecks({
          projectGeometry,
          facadeGrammar:
            facadeGrammar || projectGeometry?.metadata?.facade_grammar || null,
          structuralGrid:
            structuralGrid ||
            projectGeometry?.metadata?.structural_grid ||
            null,
        })
      : null;
  const editIntegrityReport = phase3Enabled
    ? runEditIntegrityChecks({
        previousProjectGeometry,
        projectGeometry,
        locks,
        targetLayer,
      })
    : null;

  const errors = [...geometryReport.errors, ...(drawingReport?.errors || [])];
  const warnings = [
    ...geometryReport.warnings,
    ...(drawingReport?.warnings || []),
  ];
  if (crossLevelReport) {
    errors.push(...crossLevelReport.errors);
    warnings.push(...crossLevelReport.warnings);
  }
  if (facadeStructureReport) {
    errors.push(...facadeStructureReport.errors);
    warnings.push(...facadeStructureReport.warnings);
  }
  if (editIntegrityReport) {
    errors.push(...editIntegrityReport.errors);
    warnings.push(...editIntegrityReport.warnings);
  }

  const repairSuggestions = [
    ...geometryReport.repairSuggestions,
    ...(crossLevelReport?.repairHints || []),
    ...(facadeStructureReport?.repairHints || []),
    ...(editIntegrityReport?.repairHints || []),
  ];
  const uniqueErrors = dedupe(errors);
  const uniqueWarnings = dedupe(warnings);
  const status = buildStatus(uniqueErrors, uniqueWarnings);
  const freshnessSummary = projectGeometry?.metadata?.project_artifact_store
    ? summarizeArtifactFreshness(
        projectGeometry.metadata.project_artifact_store,
      )
    : null;
  const staleAssets = freshnessSummary
    ? freshnessSummary.staleFamilies
    : Object.entries(projectGeometry?.metadata?.artifact_state || {})
        .filter(
          ([key, value]) =>
            key !== "version" &&
            key !== "geometry_signature" &&
            value?.stale === true,
        )
        .map(([key]) => key);
  const affectedEntities = [
    ...(crossLevelReport?.affectedEntities || []),
    ...(facadeStructureReport?.affectedEntities || []),
    ...(editIntegrityReport?.affectedEntities || []),
  ];

  return {
    valid: status !== "invalid",
    status,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    repairSuggestions: dedupe(repairSuggestions),
    affectedEntities: [...new Set(affectedEntities.filter(Boolean))],
    checks: {
      geometry: geometryReport.checks,
      drawing: drawingReport?.checks || null,
      crossLevel: crossLevelReport?.checks || null,
      facadeAndStructure: facadeStructureReport || null,
      editIntegrity: editIntegrityReport || null,
    },
    summary: {
      roomCount: (projectGeometry?.rooms || []).length,
      wallCount: (projectGeometry?.walls || []).length,
      doorCount: (projectGeometry?.doors || []).length,
      windowCount: (projectGeometry?.windows || []).length,
      levelCount: (projectGeometry?.levels || []).length,
      drawingTypes,
      staleAssets,
    },
  };
}

export default {
  buildValidationDisabledReport,
  validateProject,
};
