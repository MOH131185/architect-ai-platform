import { isFeatureEnabled } from "../../config/featureFlags.js";
import { assessA1ProjectReadiness } from "../a1/a1ProjectReadinessService.js";
import { invalidateA1ComposeState } from "../a1/a1ComposeInvalidationService.js";
import { generateTechnicalDrawings } from "../drawing/technicalDrawingService.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { generateCirculation } from "../floorplan/circulationGenerator.js";
import { placeOpenings } from "../floorplan/openingPlacementService.js";
import { buildWallGraph } from "../floorplan/wallGraphBuilder.js";
import { buildLegacyArtifactStateFromStore } from "../project/artifactFreshnessService.js";
import {
  buildProjectArtifactStore,
  createArtifactStorePatch,
  mergeProjectArtifactStore,
} from "../project/projectArtifactStore.js";
import {
  appendProjectSnapshot,
  diffProjectStateSnapshots,
  snapshotProjectState,
} from "../project/projectStateSnapshotService.js";
import { buildStructuralGrid } from "../structure/structuralGridService.js";
import { buildVisualGenerationPackage } from "../visual/geometryLockedVisualRouter.js";
import {
  buildArtifactState,
  invalidateArtifactsForPlan,
} from "./artifactInvalidationService.js";
import { buildEditDiff } from "./editDiffService.js";
import {
  applyProjectLocks,
  isLayerLocked,
  normalizeProjectLocks,
} from "./projectLockManager.js";
import { planRegeneration } from "./regenerationPlanner.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceLevelScopedEntities(
  projectGeometry,
  levelId,
  collectionName,
  nextItems,
) {
  projectGeometry[collectionName] = [
    ...(projectGeometry[collectionName] || []).filter(
      (item) => item.level_id !== levelId,
    ),
    ...nextItems,
  ];
}

function refreshDerivedMetadata(projectGeometry, styleDNA = {}, options = {}) {
  const shouldRefreshFacade =
    options.refreshFacade === true ||
    Boolean(projectGeometry.metadata?.facade_grammar);
  const shouldRefreshStructure =
    options.refreshStructure === true ||
    Boolean(projectGeometry.metadata?.structural_grid);

  const facadeGrammar = shouldRefreshFacade
    ? buildFacadeGrammar(projectGeometry, styleDNA, options)
    : projectGeometry.metadata?.facade_grammar || null;
  const structuralGrid = shouldRefreshStructure
    ? buildStructuralGrid(projectGeometry)
    : projectGeometry.metadata?.structural_grid || null;

  projectGeometry.metadata = {
    ...(projectGeometry.metadata || {}),
    ...(facadeGrammar ? { facade_grammar: facadeGrammar } : {}),
    ...(structuralGrid ? { structural_grid: structuralGrid } : {}),
  };

  return {
    facadeGrammar,
    structuralGrid,
  };
}

function regenerateLevelDerivedGeometry(projectGeometry, levelId) {
  const level = (projectGeometry.levels || []).find(
    (entry) => entry.id === levelId,
  );
  const rooms = (projectGeometry.rooms || []).filter(
    (room) => room.level_id === levelId,
  );
  const wallGraph = buildWallGraph(
    {
      ...level,
      rooms,
      buildable_bbox: projectGeometry.site?.buildable_bbox,
    },
    {
      projectId: projectGeometry.project_id,
      levelId,
    },
  );
  const openings = placeOpenings(
    {
      ...level,
      rooms,
      walls: wallGraph.walls,
    },
    {
      projectId: projectGeometry.project_id,
      levelId,
      adjacencyGraph: projectGeometry.metadata?.adjacency_graph || null,
    },
  );
  const circulation = generateCirculation(
    {
      ...level,
      rooms,
      walls: wallGraph.walls,
      doors: openings.doors,
    },
    {
      projectId: projectGeometry.project_id,
      levelId,
    },
  );

  replaceLevelScopedEntities(
    projectGeometry,
    levelId,
    "walls",
    wallGraph.walls,
  );
  replaceLevelScopedEntities(projectGeometry, levelId, "doors", openings.doors);
  replaceLevelScopedEntities(
    projectGeometry,
    levelId,
    "windows",
    openings.windows,
  );
  replaceLevelScopedEntities(
    projectGeometry,
    levelId,
    "circulation",
    circulation.circulation,
  );
}

export async function regenerateProjectLayer({
  projectGeometry,
  styleDNA = {},
  targetLayer,
  locks = {},
  options = {},
} = {}) {
  const normalizedLocks = normalizeProjectLocks(locks);
  const previousProjectGeometry = clone(projectGeometry);
  const nextProjectGeometry = clone(projectGeometry);
  const previousArtifactStore =
    previousProjectGeometry?.metadata?.project_artifact_store ||
    buildProjectArtifactStore({
      projectGeometry: previousProjectGeometry,
      facadeGrammar: previousProjectGeometry?.metadata?.facade_grammar || null,
      readinessMetadata:
        previousProjectGeometry?.metadata?.a1_readiness || null,
      composeCandidates:
        previousProjectGeometry?.metadata?.a1_readiness?.panelCandidates || [],
    });
  const beforeSnapshot = snapshotProjectState({
    label: "before-regeneration",
    projectGeometry: previousProjectGeometry,
    validationReport: {
      status: previousProjectGeometry?.metadata?.status || null,
    },
    artifactStore: previousArtifactStore,
    composeReadiness: previousProjectGeometry?.metadata?.a1_readiness || null,
  });
  const regenerationPlan = planRegeneration(targetLayer, {
    ...options,
    projectGeometry: previousProjectGeometry,
    facadeGrammar: previousProjectGeometry?.metadata?.facade_grammar || null,
    visualPackage: null,
    panelCandidates:
      previousProjectGeometry?.metadata?.a1_readiness?.panelCandidates || [],
  });
  const normalizedLayer = regenerationPlan.targetLayer;
  const impactedLayers = regenerationPlan.impactedLayers;
  const conflictingLocks = normalizedLocks.lockedLayers.filter((layer) =>
    impactedLayers.includes(layer),
  );

  if (
    conflictingLocks.length ||
    isLayerLocked(normalizedLocks, normalizedLayer)
  ) {
    throw new Error(
      `Layer "${normalizedLayer}" conflicts with locked layers: ${
        conflictingLocks.join(", ") || normalizedLayer
      }.`,
    );
  }

  let facadeGrammar = nextProjectGeometry.metadata?.facade_grammar || null;
  let structuralGrid = nextProjectGeometry.metadata?.structural_grid || null;
  let drawings = null;
  let visualPackage = null;
  let refreshedFacadePackage = false;
  let refreshedDrawings = false;
  let refreshedVisualPackage = false;

  if (impactedLayers.includes("facade_grammar")) {
    ({ facadeGrammar, structuralGrid } = refreshDerivedMetadata(
      nextProjectGeometry,
      styleDNA,
      {
        ...options,
        refreshFacade: true,
      },
    ));
    refreshedFacadePackage = Boolean(facadeGrammar);
  }

  if (
    normalizedLayer === "structural_grid" ||
    impactedLayers.includes("structural_grid")
  ) {
    ({ facadeGrammar, structuralGrid } = refreshDerivedMetadata(
      nextProjectGeometry,
      styleDNA,
      {
        ...options,
        refreshStructure: true,
      },
    ));
    refreshedFacadePackage = refreshedFacadePackage || Boolean(facadeGrammar);
  }

  if (normalizedLayer === "openings") {
    (nextProjectGeometry.levels || []).forEach((level) => {
      regenerateLevelDerivedGeometry(nextProjectGeometry, level.id);
    });
    ({ facadeGrammar, structuralGrid } = refreshDerivedMetadata(
      nextProjectGeometry,
      styleDNA,
      options,
    ));
    refreshedFacadePackage = Boolean(facadeGrammar);
  }

  if (
    normalizedLayer === "room_layout" ||
    targetLayer === "level" ||
    targetLayer === "one_level"
  ) {
    const targetLevelId =
      options.levelId ||
      options.level_id ||
      nextProjectGeometry.levels?.[0]?.id;
    regenerateLevelDerivedGeometry(nextProjectGeometry, targetLevelId);
    ({ facadeGrammar, structuralGrid } = refreshDerivedMetadata(
      nextProjectGeometry,
      styleDNA,
      options,
    ));
    refreshedFacadePackage = Boolean(facadeGrammar);
  }

  if (normalizedLayer === "drawings") {
    drawings = await generateTechnicalDrawings({
      projectGeometry: nextProjectGeometry,
      styleDNA,
      drawingTypes: options.drawingTypes || ["plan", "elevation", "section"],
      facadeGrammar,
      structuralGrid,
    });
    refreshedDrawings = Boolean(drawings?.drawings);
  }

  if (
    normalizedLayer === "visual_style" ||
    normalizedLayer === "visual_package"
  ) {
    visualPackage = await buildVisualGenerationPackage(
      nextProjectGeometry,
      styleDNA,
      options.viewType || "hero_3d",
      {
        ...options,
        facadeGrammar,
      },
    );
    refreshedVisualPackage = Boolean(visualPackage);
  }

  const lockedGeometry = applyProjectLocks(
    nextProjectGeometry,
    normalizedLocks,
  );
  const previousArtifactState =
    previousProjectGeometry.metadata?.artifact_state ||
    buildArtifactState({
      projectGeometry: previousProjectGeometry,
      drawings: null,
      facadeGrammar: previousProjectGeometry.metadata?.facade_grammar || null,
      visualPackage: null,
    });
  let nextArtifactStore = previousArtifactStore;

  if (
    isFeatureEnabled("useArtifactLifecycleStore") &&
    regenerationPlan.fragmentPlan
  ) {
    nextArtifactStore = invalidateA1ComposeState({
      artifactStore: nextArtifactStore,
      invalidationPlan: regenerationPlan.fragmentPlan,
      geometrySignature:
        nextProjectGeometry?.metadata?.artifact_state?.geometry_signature ||
        null,
    });
  }

  nextArtifactStore = mergeProjectArtifactStore(
    nextArtifactStore,
    createArtifactStorePatch({
      projectGeometry: lockedGeometry,
      ...(refreshedDrawings ? { drawings: drawings?.drawings || null } : {}),
      ...(refreshedFacadePackage ? { facadeGrammar } : {}),
      ...(refreshedVisualPackage ? { visualPackage } : {}),
    }),
  );

  const artifactState = isFeatureEnabled("useArtifactLifecycleStore")
    ? buildLegacyArtifactStateFromStore(nextArtifactStore)
    : invalidateArtifactsForPlan(
        previousArtifactState,
        regenerationPlan,
        lockedGeometry,
        {
          ...(refreshedDrawings ? { drawings: true } : {}),
          ...(refreshedFacadePackage ? { facadePackage: true } : {}),
          ...(refreshedVisualPackage ? { visualPackage: true } : {}),
        },
      );
  const a1Readiness = assessA1ProjectReadiness({
    projectGeometry: lockedGeometry,
    drawings: drawings?.drawings || null,
    visualPackage,
    facadeGrammar,
    validationReport: {
      status: lockedGeometry.metadata?.status || "valid_with_warnings",
    },
    artifactState,
    artifactStore: nextArtifactStore,
  });

  if (isFeatureEnabled("useArtifactLifecycleStore")) {
    nextArtifactStore = mergeProjectArtifactStore(
      nextArtifactStore,
      createArtifactStorePatch({
        projectGeometry: lockedGeometry,
        readinessMetadata: a1Readiness,
        composeCandidates: a1Readiness.panelCandidates || [],
      }),
    );
  }

  const nextArtifactState = isFeatureEnabled("useArtifactLifecycleStore")
    ? buildLegacyArtifactStateFromStore(nextArtifactStore, a1Readiness)
    : artifactState;
  const afterSnapshot = snapshotProjectState({
    label: "after-regeneration",
    projectGeometry: lockedGeometry,
    validationReport: {
      status: lockedGeometry.metadata?.status || null,
    },
    artifactStore: nextArtifactStore,
    composeReadiness: a1Readiness,
  });
  const snapshotDiff = diffProjectStateSnapshots(beforeSnapshot, afterSnapshot);

  lockedGeometry.metadata = {
    ...(lockedGeometry.metadata || {}),
    regeneration: {
      target_layer: normalizedLayer,
      impacted_layers: impactedLayers,
      fragment_plan: regenerationPlan.fragmentPlan || null,
      snapshots: {
        before: beforeSnapshot,
        after: afterSnapshot,
        diff: snapshotDiff,
      },
    },
    artifact_state: nextArtifactState,
    ...(isFeatureEnabled("useArtifactLifecycleStore")
      ? {
          project_artifact_store: nextArtifactStore,
          project_state_snapshots: appendProjectSnapshot(
            lockedGeometry,
            afterSnapshot,
          ),
        }
      : {}),
    a1_readiness: a1Readiness,
  };

  return {
    projectGeometry: lockedGeometry,
    facadeGrammar,
    structuralGrid,
    drawings,
    visualPackage,
    diff: buildEditDiff(previousProjectGeometry, lockedGeometry),
    locks: normalizedLocks,
    artifactState: nextArtifactState,
    artifactStore: nextArtifactStore,
    a1Readiness,
    regenerationPlan,
    stateSnapshots: {
      before: beforeSnapshot,
      after: afterSnapshot,
      diff: snapshotDiff,
    },
  };
}

export default {
  regenerateProjectLayer,
};
