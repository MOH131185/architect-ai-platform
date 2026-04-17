import { isFeatureEnabled } from "../../config/featureFlags.js";
import { assessA1ProjectReadiness } from "../a1/a1ProjectReadinessService.js";
import { generateTechnicalDrawings } from "../drawing/technicalDrawingService.js";
import { buildArtifactState } from "../editing/artifactInvalidationService.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { generateLayoutFromProgram } from "../floorplan/floorplanGenerator.js";
import { buildLegacyArtifactStateFromStore } from "./artifactFreshnessService.js";
import { buildProjectArtifactStore } from "./projectArtifactStore.js";
import {
  appendProjectSnapshot,
  snapshotProjectState,
} from "./projectStateSnapshotService.js";
import { buildStructuralGrid } from "../structure/structuralGridService.js";
import { validateProject } from "../validation/projectValidationEngine.js";
import { buildVisualGenerationPackage } from "../visual/geometryLockedVisualRouter.js";

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
  const baseArtifactStore = buildProjectArtifactStore({
    projectGeometry,
    drawings: drawings.drawings,
    facadeGrammar,
    visualPackage,
  });
  const baseArtifactState = isFeatureEnabled("useArtifactLifecycleStore")
    ? buildLegacyArtifactStateFromStore(baseArtifactStore)
    : buildArtifactState({
        projectGeometry,
        drawings: drawings.drawings,
        facadeGrammar,
        visualPackage,
      });
  const a1Readiness = assessA1ProjectReadiness({
    projectGeometry,
    drawings: drawings.drawings,
    visualPackage,
    facadeGrammar,
    validationReport,
    artifactState: baseArtifactState,
    artifactStore: baseArtifactStore,
  });
  const artifactStore =
    a1Readiness.artifactStore ||
    buildProjectArtifactStore({
      projectGeometry,
      drawings: drawings.drawings,
      facadeGrammar,
      visualPackage,
      readinessMetadata: a1Readiness,
      composeCandidates: a1Readiness.panelCandidates || [],
    });
  const artifactState = isFeatureEnabled("useArtifactLifecycleStore")
    ? buildLegacyArtifactStateFromStore(artifactStore, a1Readiness)
    : buildArtifactState({
        projectGeometry,
        drawings: drawings.drawings,
        facadeGrammar,
        visualPackage,
        readiness: a1Readiness,
      });
  const initialSnapshot = snapshotProjectState({
    label: "initial-generation",
    projectGeometry,
    validationReport,
    artifactStore,
    composeReadiness: a1Readiness,
  });

  projectGeometry.metadata = {
    ...(projectGeometry.metadata || {}),
    ...(integrationHooks ? { integration_hooks: integrationHooks } : {}),
    ...(drawings.technicalPanelQuality
      ? { technical_panel_quality: drawings.technicalPanelQuality }
      : {}),
    artifact_state: artifactState,
    ...(isFeatureEnabled("useArtifactLifecycleStore")
      ? {
          project_artifact_store: artifactStore,
          project_state_snapshots: appendProjectSnapshot(
            projectGeometry,
            initialSnapshot,
          ),
        }
      : {}),
    a1_readiness: a1Readiness,
  };

  return {
    status: validationReport.status,
    projectGeometry,
    floorplan,
    facadeGrammar,
    structuralGrid,
    drawings,
    visualPackage,
    integrationHooks,
    artifactState,
    artifactStore,
    a1Readiness,
    validationReport,
    warnings: dedupe([
      ...(floorplan.warnings || []),
      ...(drawings.warnings || []),
      ...(validationReport.warnings || []),
      ...(a1Readiness.reasons || []),
    ]),
  };
}

export default {
  generateProjectPackage,
};
