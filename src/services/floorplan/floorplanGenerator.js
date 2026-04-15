import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  invokeOpenSourceAdapter,
  registerOpenSourceAdapter,
} from "../models/openSourceModelRouter.js";
import {
  applyLayoutConstraints as applyLegacyLayoutConstraints,
  buildLayoutSummary as buildLegacyLayoutSummary,
  solveLayoutConstraints as solveLegacyLayoutConstraints,
} from "./layoutConstraintEngine.js";
import { normalizeProgram as normalizeProgramPhase2 } from "./programNormalizer.js";
import { buildAdjacencyGraph as buildAdjacencyGraphPhase2 } from "./adjacencyGraphBuilder.js";
import { solveDeterministicLayout } from "./layoutSolver.js";
import { buildWallGraph } from "./wallGraphBuilder.js";
import { placeOpenings } from "./openingPlacementService.js";
import { generateCirculation } from "./circulationGenerator.js";
import {
  appendEntity,
  appendLevelEntityReference,
  createFootprintGeometry,
  createLevelGeometry,
  createProjectGeometry,
  createRoomGeometry,
  createRoofGeometry,
  createSlabGeometry,
  createStairGeometry,
  finalizeProjectGeometry,
} from "../cad/geometryFactory.js";
import {
  buildValidationDisabledReport,
  validateProject,
} from "../validation/projectValidationEngine.js";

export { applyLegacyLayoutConstraints as applyLayoutConstraints };

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function validateProgram(program = []) {
  const normalized = normalizeProgramPhase2(program);
  const errors = [];
  const warnings = [];
  const seen = new Set();

  if (!normalized.rooms.length) {
    errors.push("program must contain at least one room definition");
  }

  normalized.rooms.forEach((room) => {
    if (seen.has(room.id)) {
      errors.push(`duplicate room id "${room.id}"`);
    }
    seen.add(room.id);
    if (!room.adjacency_preferences.length) {
      warnings.push(`room "${room.name}" has no adjacency preferences`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    normalizedProgram: normalized.rooms,
    normalized,
  };
}

export { validateProgram };

export function buildAdjacencyGraph(program = []) {
  const normalized = Array.isArray(program?.rooms)
    ? program.rooms
    : validateProgram(program).normalizedProgram;
  return buildAdjacencyGraphPhase2(normalized);
}

function buildLevelStair(level, levelCount, projectId) {
  if (levelCount <= 1) {
    return [];
  }

  if (level.core_plan?.core_bbox) {
    return [
      createStairGeometry(projectId, level.id, {
        id: `${level.id}-stair-main`,
        type: "doglegged",
        bbox: level.core_plan.core_bbox,
        polygon: level.rooms.find((room) => room.type === "stair_core")
          ?.polygon,
        x: level.core_plan.core_bbox.min_x,
        y: level.core_plan.core_bbox.min_y,
        width_m: level.core_plan.core_bbox.width,
        depth_m: level.core_plan.core_bbox.height,
        connects_to_level:
          level.level_number < levelCount - 1 ? level.level_number + 1 : null,
        source: "floorplan-generator",
      }),
    ];
  }

  const bbox = level.buildable_bbox || {
    min_x: 0,
    min_y: 0,
    width: 10,
    height: 8,
    max_x: 10,
    max_y: 8,
  };
  const width = Math.max(2.2, bbox.width * 0.14);
  const depth = Math.max(3.8, bbox.height * 0.2);
  const x = Number((bbox.min_x + bbox.width / 2 - width / 2).toFixed(3));
  const y = Number((bbox.min_y + bbox.height / 2 - depth / 2).toFixed(3));

  return [
    createStairGeometry(projectId, level.id, {
      id: `${level.id}-stair-main`,
      type: "straight_run",
      x,
      y,
      width_m: width,
      depth_m: depth,
      connects_to_level:
        level.level_number < levelCount - 1 ? level.level_number + 1 : null,
      source: "floorplan-generator",
    }),
  ];
}

function summarizeDeterministicLayout(
  layout = {},
  geometry = {},
  validationReport = {},
) {
  return {
    project_id: layout.project_id || geometry.project_id || null,
    strategy: "deterministic-geometry-first",
    room_count: (geometry.rooms || []).length,
    wall_count: (geometry.walls || []).length,
    door_count: (geometry.doors || []).length,
    window_count: (geometry.windows || []).length,
    level_count: (geometry.levels || []).length,
    adjacency_count: layout.adjacency_graph?.edges?.length || 0,
    zoning: layout.zoning || null,
    status: validationReport.status || "valid",
  };
}

function buildDeterministicProjectGeometry(request = {}) {
  const layout = solveDeterministicLayout(request);
  const projectGeometry = createProjectGeometry({
    ...request,
    project_id: layout.project_id,
    source: "phase2-floorplan-generator",
  });

  const allWarnings = [];
  projectGeometry.metadata = {
    ...projectGeometry.metadata,
    adjacency_graph: layout.adjacency_graph,
    vertical_stacking_plan: layout.vertical_stacking_plan || null,
    layout_search: {
      selected_candidate: layout.selected_candidate || "baseline-horizontal",
      candidate_evaluations: layout.candidate_evaluations || [],
    },
    site_constraints: layout.buildable_envelope?.constraints || null,
  };

  layout.levels.forEach((levelLayout, levelIndex) => {
    const level = createLevelGeometry(
      projectGeometry.project_id,
      {
        id: `level-${levelLayout.level_number}`,
        name:
          levelLayout.level_number === 0
            ? "Ground Floor"
            : `Level ${levelLayout.level_number}`,
        level_number: levelLayout.level_number,
      },
      levelIndex,
    );
    appendEntity(projectGeometry, "levels", level);

    const footprint = createFootprintGeometry(
      projectGeometry.project_id,
      level.id,
      levelLayout.footprint,
      levelIndex,
    );
    appendEntity(projectGeometry, "footprints", footprint);
    level.footprint_id = footprint.id;

    const slab = createSlabGeometry(
      projectGeometry.project_id,
      level.id,
      footprint,
      levelIndex,
    );
    appendEntity(projectGeometry, "slabs", slab);
    appendLevelEntityReference(level, "slab", slab.id);

    const rooms = levelLayout.rooms.map((room, roomIndex) =>
      createRoomGeometry(
        projectGeometry.project_id,
        level.id,
        {
          ...room,
          level_number: level.level_number,
          source: "layout-solver",
        },
        roomIndex,
      ),
    );

    rooms.forEach((room) => {
      appendEntity(projectGeometry, "rooms", room);
      appendLevelEntityReference(level, "room", room.id);
    });

    const wallGraph = buildWallGraph(
      {
        ...levelLayout,
        id: level.id,
        rooms,
        buildable_bbox: levelLayout.buildable_bbox,
      },
      {
        projectId: projectGeometry.project_id,
        levelId: level.id,
      },
    );
    wallGraph.walls.forEach((wall) => {
      appendEntity(projectGeometry, "walls", wall);
      appendLevelEntityReference(level, "wall", wall.id);
    });

    const openings = placeOpenings(
      {
        ...levelLayout,
        id: level.id,
        rooms,
        walls: wallGraph.walls,
      },
      {
        projectId: projectGeometry.project_id,
        levelId: level.id,
        adjacencyGraph: layout.adjacency_graph,
      },
    );

    openings.doors.forEach((door) => {
      appendEntity(projectGeometry, "doors", door);
      appendLevelEntityReference(level, "door", door.id);
    });
    openings.windows.forEach((windowElement) => {
      appendEntity(projectGeometry, "windows", windowElement);
      appendLevelEntityReference(level, "window", windowElement.id);
    });

    const stairs = buildLevelStair(
      level,
      layout.level_count,
      projectGeometry.project_id,
    );
    stairs.forEach((stair) => {
      appendEntity(projectGeometry, "stairs", stair);
      appendLevelEntityReference(level, "stair", stair.id);
    });

    const circulation = generateCirculation(
      {
        ...levelLayout,
        id: level.id,
        rooms,
        walls: wallGraph.walls,
        doors: openings.doors,
      },
      {
        projectId: projectGeometry.project_id,
        levelId: level.id,
      },
    );

    circulation.circulation.forEach((path) => {
      appendEntity(projectGeometry, "circulation", path);
      appendLevelEntityReference(level, "circulation", path.id);
    });

    allWarnings.push(
      ...(rooms.some((room) => room.requires_daylight) &&
      !openings.windows.length
        ? [
            `Level ${level.level_number} includes daylight-requiring rooms without placed windows.`,
          ]
        : []),
    );
  });

  if (projectGeometry.footprints.length) {
    projectGeometry.roof = createRoofGeometry(
      projectGeometry.project_id,
      projectGeometry.footprints[projectGeometry.footprints.length - 1],
      request.styleDNA || {},
    );
  }

  projectGeometry.metadata = {
    ...projectGeometry.metadata,
    status: "draft",
    deterministic: true,
  };
  projectGeometry.provenance = {
    ...projectGeometry.provenance,
    pipeline: dedupe([
      ...(projectGeometry.provenance.pipeline || []),
      "program-normalization",
      "adjacency-graph-builder",
      "deterministic-layout-solver",
      ...(layout.candidate_evaluations?.length ? ["layout-search-engine"] : []),
      "wall-graph-builder",
      "opening-placement-service",
      "circulation-generator",
      ...(layout.core_plan?.required ? ["stair-core-generator"] : []),
      "project-validation-engine",
    ]),
  };

  finalizeProjectGeometry(projectGeometry);

  const validationReport = isFeatureEnabled("useGeometryValidationEngine")
    ? validateProject({
        projectGeometry,
        adjacencyGraph: layout.adjacency_graph,
      })
    : buildValidationDisabledReport(projectGeometry);

  projectGeometry.metadata.status = validationReport.status;

  return {
    status: validationReport.status,
    layout,
    projectGeometry,
    layoutGraph: layout.adjacency_graph,
    adjacencyGraph: layout.adjacency_graph,
    zoningSummary: layout.zoning,
    candidateEvaluations: layout.candidate_evaluations || [],
    validationReport,
    warnings: dedupe([...allWarnings, ...validationReport.warnings]),
    summary: summarizeDeterministicLayout(
      layout,
      projectGeometry,
      validationReport,
    ),
    nextSteps: [
      "Refine candidate scoring weights with real project feedback before claiming stronger optimization coverage.",
      "Deepen structural members, stair geometry, and annotation richness once deterministic geometry validation is stable.",
    ],
  };
}

async function runConstraintSolver(payload = {}) {
  if (
    !isFeatureEnabled("useCanonicalGeometryPhase2") ||
    !isFeatureEnabled("useAdjacencySolver")
  ) {
    const layout = solveLegacyLayoutConstraints(payload);
    return {
      status: "ready",
      adapterId: "constraint-solver",
      provider: "local",
      layout,
      summary: buildLegacyLayoutSummary(layout),
      warnings: [
        "Phase 2 canonical geometry or adjacency solver is disabled; using the legacy deterministic placeholder layout.",
      ],
    };
  }

  const result = buildDeterministicProjectGeometry(payload);
  return {
    status: result.status === "invalid" ? "invalid" : "ready",
    adapterId: "constraint-solver",
    provider: "local",
    ...result,
  };
}

registerOpenSourceAdapter("floorplan", "constraint-solver", async (payload) =>
  runConstraintSolver(payload),
);

export async function generateLayoutFromProgram(request = {}, options = {}) {
  const enabled = isFeatureEnabled("useFloorplanEngine");
  const preferredAdapterId = options.adapterId || request.adapterId || null;

  if (!enabled) {
    logger.warn(
      "[Floorplan] Feature flag disabled, using local fallback anyway",
    );
  }

  const programInput =
    request.room_program ||
    request.roomProgram ||
    request.program?.rooms ||
    request.program ||
    [];
  const programValidation = validateProgram(programInput);

  if (!programValidation.isValid) {
    throw new Error(programValidation.errors.join("; "));
  }

  const routed = await invokeOpenSourceAdapter("floorplan", request, {
    adapterId: preferredAdapterId,
  });

  if (routed?.layout || routed?.projectGeometry) {
    return {
      success: routed.status !== "invalid",
      provider: routed.provider,
      adapterId: routed.adapterId,
      layout: routed.layout || null,
      projectGeometry: routed.projectGeometry || null,
      canonicalGeometry: routed.projectGeometry || null,
      layoutGraph: routed.layoutGraph || routed.layout?.adjacency_graph || null,
      adjacencyGraph: routed.adjacencyGraph || routed.layoutGraph || null,
      zoningSummary: routed.zoningSummary || routed.layout?.zoning || null,
      candidateEvaluations:
        routed.candidateEvaluations ||
        routed.layout?.candidate_evaluations ||
        null,
      summary: routed.summary || null,
      validation: routed.validationReport || routed.validation || null,
      validationReport: routed.validationReport || routed.validation || null,
      status: routed.validationReport?.status || routed.status || "ready",
      warnings: dedupe([
        ...programValidation.warnings,
        ...(routed.warnings || []),
        ...(routed.status === "unavailable" ? routed.notes : []),
      ]),
      nextSteps: routed.nextSteps || [],
    };
  }

  const fallback = await runConstraintSolver(request);
  return {
    success: fallback.status !== "invalid",
    provider: fallback.provider,
    adapterId: fallback.adapterId,
    layout: fallback.layout || null,
    projectGeometry: fallback.projectGeometry || null,
    canonicalGeometry: fallback.projectGeometry || null,
    layoutGraph:
      fallback.layoutGraph || fallback.layout?.adjacency_graph || null,
    adjacencyGraph:
      fallback.adjacencyGraph ||
      fallback.layoutGraph ||
      fallback.layout?.adjacency_graph ||
      null,
    zoningSummary: fallback.zoningSummary || fallback.layout?.zoning || null,
    candidateEvaluations:
      fallback.candidateEvaluations ||
      fallback.layout?.candidate_evaluations ||
      null,
    summary: fallback.summary || null,
    validation: fallback.validationReport || fallback.validation || null,
    validationReport: fallback.validationReport || fallback.validation || null,
    status: fallback.validationReport?.status || fallback.status || "ready",
    warnings: dedupe([
      ...programValidation.warnings,
      ...(fallback.warnings || []),
      "Requested floorplan model adapter was unavailable.",
      ...(Array.isArray(routed?.notes) ? routed.notes : []),
    ]),
    nextSteps: fallback.nextSteps || [
      "Attach a structured floorplan model adapter once provider routing is ready.",
      "Promote deterministic zoning into a richer optimization loop in a later phase.",
    ],
  };
}

export default {
  applyLayoutConstraints: applyLegacyLayoutConstraints,
  buildAdjacencyGraph,
  generateLayoutFromProgram,
  validateProgram,
};
