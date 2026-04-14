import {
  buildBuildableEnvelope,
  buildBoundingBoxFromRect,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { normalizeProgram } from "./programNormalizer.js";
import { buildAdjacencyGraph } from "./adjacencyGraphBuilder.js";
import {
  assignRoomZones,
  assignRoomsToLevels,
  buildZoneBands,
  buildZoningSummary,
} from "./zoningEngine.js";
import { assignRoomsToLevels as assignRoomsToLevelsPhase3 } from "./multiLevelLayoutEngine.js";
import { resolveStairCorePlan } from "./stairCoreGenerator.js";

function resolveBuildableEnvelope(request = {}) {
  if (request.site) {
    const siteEnvelope = buildBuildableEnvelope(request.site);
    if (
      siteEnvelope.buildable_bbox?.width &&
      siteEnvelope.buildable_bbox?.height
    ) {
      return siteEnvelope.buildable_bbox;
    }
  }

  const buildableBbox =
    request.site?.buildable_bbox ||
    request.site?.buildableBbox ||
    request.buildable_bbox ||
    request.buildableEnvelope ||
    request.site?.buildable_envelope?.buildable_bbox;

  if (buildableBbox?.width && buildableBbox?.height) {
    return buildableBbox;
  }

  const footprint = request.footprint || {};
  const width = Math.max(
    12,
    Number(footprint.width_m || footprint.width || 18),
  );
  const depth = Math.max(
    10,
    Number(footprint.depth_m || footprint.depth || 14),
  );
  return buildBoundingBoxFromRect(0, 0, width, depth);
}

function allocateRoomsWithinBand(levelNumber, rooms = [], band = {}) {
  let cursorX = band.x;

  return rooms.map((room, index) => {
    const scaledArea = roundMetric(room.target_area * band.scale_factor);
    const proportionalWidth =
      scaledArea / Math.max(band.depth || 1, 1) || band.width;
    const remainingWidth = Math.max(2.4, band.x + band.width - cursorX);
    const width = roundMetric(
      Math.min(remainingWidth, Math.max(2.4, proportionalWidth)),
    );
    const y = band.y;
    const x = roundMetric(cursorX);
    const roomDepth = roundMetric(band.depth);
    cursorX += width;

    return {
      ...room,
      level_number: levelNumber,
      actual_area: roundMetric(width * roomDepth),
      bbox: buildBoundingBoxFromRect(x, y, width, roomDepth),
      polygon: rectangleToPolygon(x, y, width, roomDepth),
      centroid: {
        x: roundMetric(x + width / 2),
        y: roundMetric(y + roomDepth / 2),
      },
      x,
      y,
      width,
      height: roomDepth,
      width_m: width,
      depth_m: roomDepth,
      layout_order: index,
    };
  });
}

function sumSegmentWidth(segments = []) {
  return segments.reduce((sum, segment) => sum + Number(segment.width || 0), 0);
}

function buildPlacementSegments(buildableBbox = {}, corePlan = null) {
  if (!corePlan?.required || !Array.isArray(corePlan.placementSegments)) {
    return [buildableBbox];
  }

  return corePlan.placementSegments.map((segment) => ({
    ...segment,
    min_x: Number(segment.min_x),
    max_x: Number(segment.max_x),
    width: Number(segment.width),
    height: Number(segment.height || buildableBbox.height),
  }));
}

function alignBandsToCore(bands = [], coreBbox = null, buildableBbox = {}) {
  if (!coreBbox || bands.length !== 1) {
    return bands;
  }

  const [band] = bands;
  const bandMinY = Number(band.y || 0);
  const bandMaxY = bandMinY + Number(band.depth || 0);
  const touchesCore =
    bandMaxY > Number(coreBbox.min_y || 0) &&
    bandMinY < Number(coreBbox.max_y || 0);
  if (touchesCore) {
    return bands;
  }

  const maxY =
    Number(buildableBbox.min_y || 0) +
    Number(buildableBbox.height || 0) -
    Number(band.depth || 0);
  return [
    {
      ...band,
      y: roundMetric(
        Math.max(
          Number(buildableBbox.min_y || 0),
          Math.min(maxY, Number(coreBbox.min_y || 0)),
        ),
      ),
    },
  ];
}

function sortRoomsForPlacement(rooms = []) {
  return [...rooms].sort((left, right) => {
    const leftStack = Number.isFinite(Number(left.stack_order))
      ? Number(left.stack_order)
      : Number.MAX_SAFE_INTEGER;
    const rightStack = Number.isFinite(Number(right.stack_order))
      ? Number(right.stack_order)
      : Number.MAX_SAFE_INTEGER;
    if (leftStack !== rightStack) return leftStack - rightStack;
    if (Number(right.wet_zone) !== Number(left.wet_zone)) {
      return Number(right.wet_zone) - Number(left.wet_zone);
    }
    if (Number(right.target_area || 0) !== Number(left.target_area || 0)) {
      return Number(right.target_area || 0) - Number(left.target_area || 0);
    }
    return String(left.id).localeCompare(String(right.id));
  });
}

function allocateRoomsWithinBandSegments(
  levelNumber,
  rooms = [],
  band = {},
  segments = [],
) {
  const placementSegments = segments.length
    ? segments.map((segment) => ({
        ...segment,
        cursor_x: Number(segment.min_x),
      }))
    : [
        {
          min_x: band.x,
          max_x: band.x + band.width,
          width: band.width,
          cursor_x: band.x,
        },
      ];

  let currentSegmentIndex = 0;

  return sortRoomsForPlacement(rooms).map((room, index) => {
    const scaledArea = roundMetric(room.target_area * band.scale_factor);
    const proportionalWidth =
      scaledArea / Math.max(band.depth || 1, 1) || band.width;
    const minWidth = 2.4;
    const desiredWidth = Math.max(minWidth, proportionalWidth);

    while (
      currentSegmentIndex < placementSegments.length - 1 &&
      placementSegments[currentSegmentIndex].cursor_x + minWidth >
        placementSegments[currentSegmentIndex].max_x
    ) {
      currentSegmentIndex += 1;
    }

    const segment = placementSegments[currentSegmentIndex];
    const remainingWidth = Math.max(
      minWidth,
      Number(segment.max_x) - Number(segment.cursor_x),
    );
    const width = roundMetric(Math.min(remainingWidth, desiredWidth));
    const x = roundMetric(segment.cursor_x);
    const y = band.y;
    const roomDepth = roundMetric(band.depth);
    segment.cursor_x = roundMetric(
      Math.min(segment.max_x, Number(segment.cursor_x) + width),
    );

    return {
      ...room,
      level_number: levelNumber,
      actual_area: roundMetric(width * roomDepth),
      bbox: buildBoundingBoxFromRect(x, y, width, roomDepth),
      polygon: rectangleToPolygon(x, y, width, roomDepth),
      centroid: {
        x: roundMetric(x + width / 2),
        y: roundMetric(y + roomDepth / 2),
      },
      x,
      y,
      width,
      height: roomDepth,
      width_m: width,
      depth_m: roomDepth,
      layout_order: index,
    };
  });
}

export function solveDeterministicLayout(request = {}) {
  const normalizedProgram = normalizeProgram(
    request.room_program || request.roomProgram || request.program || [],
    {
      project_id: request.project_id || request.projectId,
    },
  );
  const zonedProgram = assignRoomZones(normalizedProgram.rooms);
  const requestedLevelCount =
    request.levels || request.level_count || request.levelCount || 1;
  const levelAssignments = isFeatureEnabled("usePhase3MultiLevelEngine")
    ? assignRoomsToLevelsPhase3(zonedProgram, {
        ...request.constraints,
        levelCount: requestedLevelCount,
      })
    : assignRoomsToLevels(zonedProgram, requestedLevelCount);
  const adjacencyGraph = buildAdjacencyGraph(zonedProgram);
  const buildableBbox = resolveBuildableEnvelope(request);
  const corePlan = isFeatureEnabled("useStairCoreGenerator")
    ? resolveStairCorePlan({
        buildableBbox,
        levelCount: levelAssignments.level_count,
        constraints: request.constraints || {},
      })
    : null;
  const placementSegments = buildPlacementSegments(buildableBbox, corePlan);
  const placementEnvelope = {
    min_x: placementSegments[0]?.min_x ?? buildableBbox.min_x,
    min_y: buildableBbox.min_y,
    width: roundMetric(
      sumSegmentWidth(placementSegments) || buildableBbox.width,
    ),
    height: buildableBbox.height,
  };

  const levels = levelAssignments.levels.map((level) => {
    const coreLevel = corePlan?.levels?.find(
      (entry) => entry.level_number === level.level_number,
    );
    const coreRoom =
      coreLevel && corePlan?.required
        ? {
            id: `level-${level.level_number}-stair-core`,
            name: "Stair Core",
            type: "stair_core",
            zone: "core",
            privacy_level: 1,
            requires_daylight: false,
            wet_zone: false,
            access_requirements: ["vertical_circulation"],
            adjacency_preferences: [],
            target_area: roundMetric(
              coreLevel.core_bbox.width * coreLevel.core_bbox.height,
            ),
            min_area: roundMetric(
              coreLevel.core_bbox.width * coreLevel.core_bbox.height,
            ),
            max_area: roundMetric(
              coreLevel.core_bbox.width * coreLevel.core_bbox.height,
            ),
            actual_area: roundMetric(
              coreLevel.core_bbox.width * coreLevel.core_bbox.height,
            ),
            bbox: coreLevel.core_bbox,
            polygon: rectangleToPolygon(
              coreLevel.core_bbox.min_x,
              coreLevel.core_bbox.min_y,
              coreLevel.core_bbox.width,
              coreLevel.core_bbox.height,
            ),
            centroid: {
              x: roundMetric(
                coreLevel.core_bbox.min_x + coreLevel.core_bbox.width / 2,
              ),
              y: roundMetric(
                coreLevel.core_bbox.min_y + coreLevel.core_bbox.height / 2,
              ),
            },
            stack_order: -1,
            metadata: {
              generated: true,
              core_variant: corePlan.variant,
            },
          }
        : null;
    const nonCoreRooms = level.rooms.filter((room) => room.zone !== "core");
    const bands = alignBandsToCore(
      buildZoneBands(nonCoreRooms, placementEnvelope, level.level_number),
      coreLevel?.core_bbox || null,
      buildableBbox,
    );
    const placedRooms = bands.flatMap((band) =>
      allocateRoomsWithinBandSegments(
        level.level_number,
        level.rooms.filter(
          (room) => room.zone === band.zone && room.zone !== "core",
        ),
        band,
        placementSegments.map((segment) => ({ ...segment })),
      ),
    );
    const allRooms = coreRoom ? [coreRoom, ...placedRooms] : placedRooms;

    return {
      level_number: level.level_number,
      bands,
      rooms: allRooms,
      footprint: rectangleToPolygon(
        buildableBbox.min_x,
        buildableBbox.min_y,
        buildableBbox.width,
        buildableBbox.height,
      ),
      buildable_bbox: buildableBbox,
      placement_segments: placementSegments,
      core_plan: coreLevel || null,
      level_assignment_notes: levelAssignments.explanations || [],
    };
  });

  return {
    project_id: normalizedProgram.project_id,
    normalized_program: normalizedProgram,
    adjacency_graph: adjacencyGraph,
    zoning: buildZoningSummary({
      levels: levels.map((level) => ({
        ...level,
        rooms: level.rooms,
      })),
    }),
    level_count: levelAssignments.level_count,
    buildable_bbox: buildableBbox,
    vertical_stacking_plan: levelAssignments.stackingPlan || null,
    level_assignment_explanations: levelAssignments.explanations || [],
    core_plan: corePlan,
    levels,
    deterministic: true,
    solver_notes: [
      "Rooms are packed as deterministic strip bands inside the buildable envelope.",
      ...(isFeatureEnabled("usePhase3MultiLevelEngine")
        ? [
            "Multi-level rooms are assigned with deterministic vertical stacking heuristics.",
          ]
        : [
            "Multi-level support is scaffolded by assigning private rooms to upper floors first.",
          ]),
      ...(corePlan?.required
        ? [
            `A ${corePlan.variant} stair/core strip is reserved across all levels.`,
          ]
        : []),
    ],
  };
}

export default {
  solveDeterministicLayout,
};
