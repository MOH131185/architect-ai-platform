import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { buildWallGraph } from "../floorplan/wallGraphBuilder.js";
import { generateCirculation } from "../floorplan/circulationGenerator.js";
import { placeOpenings } from "../floorplan/openingPlacementService.js";
import { generateTechnicalDrawings } from "../drawing/technicalDrawingService.js";
import { buildVisualGenerationPackage } from "../visual/geometryLockedVisualRouter.js";
import { buildStructuralGrid } from "../structure/structuralGridService.js";
import { buildEditDiff } from "./editDiffService.js";
import {
  applyProjectLocks,
  getLayerImpactSet,
  isLayerLocked,
  normalizeProjectLocks,
} from "./projectLockManager.js";

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
  const normalizedLayer = String(targetLayer || "")
    .trim()
    .toLowerCase();
  const impactedLayers = getLayerImpactSet(normalizedLayer);
  const conflictingLocks = normalizedLocks.lockedLayers.filter((layer) =>
    impactedLayers.includes(layer),
  );

  if (
    conflictingLocks.length ||
    isLayerLocked(normalizedLocks, normalizedLayer)
  ) {
    throw new Error(
      `Layer "${normalizedLayer}" conflicts with locked layers: ${conflictingLocks.join(", ") || normalizedLayer}.`,
    );
  }

  let facadeGrammar = nextProjectGeometry.metadata?.facade_grammar || null;
  let structuralGrid = nextProjectGeometry.metadata?.structural_grid || null;
  let drawings = null;
  let visualPackage = null;

  if (
    ["facade", "facade_grammar", "roof_language", "window_language"].includes(
      normalizedLayer,
    )
  ) {
    ({ facadeGrammar, structuralGrid } = refreshDerivedMetadata(
      nextProjectGeometry,
      styleDNA,
      {
        ...options,
        refreshFacade: true,
      },
    ));
  }

  if (normalizedLayer === "structural_grid") {
    ({ facadeGrammar, structuralGrid } = refreshDerivedMetadata(
      nextProjectGeometry,
      styleDNA,
      {
        ...options,
        refreshStructure: true,
      },
    ));
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
  }

  if (normalizedLayer === "level" || normalizedLayer === "one_level") {
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
  }

  if (normalizedLayer === "drawings") {
    drawings = await generateTechnicalDrawings({
      projectGeometry: nextProjectGeometry,
      styleDNA,
      drawingTypes: options.drawingTypes || ["plan", "elevation", "section"],
      facadeGrammar,
      structuralGrid,
    });
  }

  if (normalizedLayer === "visuals" || normalizedLayer === "visual_style") {
    visualPackage = await buildVisualGenerationPackage(
      nextProjectGeometry,
      styleDNA,
      options.viewType || "hero_3d",
      {
        ...options,
        facadeGrammar,
      },
    );
  }

  const lockedGeometry = applyProjectLocks(
    nextProjectGeometry,
    normalizedLocks,
  );
  lockedGeometry.metadata = {
    ...(lockedGeometry.metadata || {}),
    regeneration: {
      target_layer: normalizedLayer,
      impacted_layers: impactedLayers,
    },
  };

  return {
    projectGeometry: lockedGeometry,
    facadeGrammar,
    structuralGrid,
    drawings,
    visualPackage,
    diff: buildEditDiff(previousProjectGeometry, lockedGeometry),
    locks: normalizedLocks,
  };
}

export default {
  regenerateProjectLayer,
};
