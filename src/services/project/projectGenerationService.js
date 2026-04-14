import { generateLayoutFromProgram } from "../floorplan/floorplanGenerator.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { buildStructuralGrid } from "../structure/structuralGridService.js";
import { generateTechnicalDrawings } from "../drawing/technicalDrawingService.js";
import { buildVisualGenerationPackage } from "../visual/geometryLockedVisualRouter.js";
import { validateProject } from "../validation/projectValidationEngine.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export async function generateProjectPackage(request = {}) {
  const floorplan = await generateLayoutFromProgram(request);
  const projectGeometry = floorplan.projectGeometry;
  const styleDNA = request.styleDNA || {};

  if (!projectGeometry) {
    return {
      status: "ready",
      projectGeometry: null,
      warnings: dedupe([
        ...(floorplan.warnings || []),
        "Canonical geometry generation is disabled; returning floorplan-only output.",
      ]),
      floorplan,
      facadeGrammar: null,
      structuralGrid: null,
      drawings: null,
      visualPackage: null,
      validationReport: floorplan.validationReport || null,
    };
  }

  const structuralGrid = isFeatureEnabled("useStructuralSanityLayer")
    ? buildStructuralGrid(projectGeometry)
    : null;
  const facadeGrammar = isFeatureEnabled("useFacadeGrammarEngine")
    ? buildFacadeGrammar(projectGeometry, styleDNA)
    : null;

  if (structuralGrid || facadeGrammar) {
    projectGeometry.metadata = {
      ...(projectGeometry.metadata || {}),
      ...(structuralGrid ? { structural_grid: structuralGrid } : {}),
      ...(facadeGrammar ? { facade_grammar: facadeGrammar } : {}),
    };
  }

  const drawings = await generateTechnicalDrawings({
    projectGeometry,
    styleDNA,
    drawingTypes: request.drawingTypes || ["plan", "elevation", "section"],
    facadeGrammar,
    structuralGrid,
  });

  const validationReport = validateProject({
    projectGeometry,
    drawings: drawings.drawings,
    drawingTypes: request.drawingTypes || ["plan", "elevation", "section"],
    adjacencyGraph: floorplan.adjacencyGraph,
    styleDNA,
    facadeGrammar,
    structuralGrid,
  });

  const visualPackage = isFeatureEnabled("useGeometryLockedVisuals")
    ? await buildVisualGenerationPackage(
        projectGeometry,
        styleDNA,
        request.viewType || "hero_3d",
        {
          facadeGrammar,
        },
      )
    : null;

  const integrationHooks =
    drawings.integrationHooks || drawings.metadata?.integration_hooks || null;
  if (integrationHooks) {
    projectGeometry.metadata = {
      ...(projectGeometry.metadata || {}),
      integration_hooks: integrationHooks,
    };
  }

  return {
    status: validationReport.status,
    projectGeometry,
    floorplan,
    facadeGrammar,
    structuralGrid,
    drawings,
    visualPackage,
    integrationHooks,
    validationReport,
    warnings: dedupe([
      ...(floorplan.warnings || []),
      ...(drawings.warnings || []),
      ...(validationReport.warnings || []),
    ]),
  };
}

export default {
  generateProjectPackage,
};
