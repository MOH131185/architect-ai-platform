import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildBoundingBoxFromRect,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import {
  buildEnvelopeFallback,
  deriveBuildableEnvelope,
} from "../site/buildableEnvelopeService.js";
import { buildAdjacencyGraph } from "./adjacencyGraphBuilder.js";
import {
  DEFAULT_LAYOUT_STRATEGIES,
  searchDeterministicLayouts,
} from "./layoutSearchEngine.js";
import { assignRoomsToLevels as assignRoomsToLevelsPhase3 } from "./multiLevelLayoutEngine.js";
import { normalizeProgram } from "./programNormalizer.js";
import { optimizeLinearRoomShapes } from "./roomShapeOptimizer.js";
import { resolveIrregularSiteFallback } from "../site/siteFallbackStrategies.js";
import { resolveStairCorePlan } from "./stairCoreGenerator.js";
import {
  assignRoomsToLevels,
  assignRoomZones,
  buildZoneBands,
  buildZoningSummary,
} from "./zoningEngine.js";

function resolveBuildableEnvelope(request = {}) {
  if (request.site) {
    const siteEnvelope = isFeatureEnabled("useBuildableEnvelopeReasoning")
      ? deriveBuildableEnvelope(request.site)
      : buildEnvelopeFallback(request.site, request.footprint || {});
    if (
      siteEnvelope.buildable_bbox?.width &&
      siteEnvelope.buildable_bbox?.height
    ) {
      return {
        bbox: siteEnvelope.buildable_bbox,
        envelope: siteEnvelope,
        warnings: siteEnvelope.warnings || [],
      };
    }
  }

  const buildableBbox =
    request.site?.buildable_bbox ||
    request.site?.buildableBbox ||
    request.buildable_bbox ||
    request.buildableEnvelope ||
    request.site?.buildable_envelope?.buildable_bbox;

  if (buildableBbox?.width && buildableBbox?.height) {
    return {
      bbox: buildableBbox,
      envelope: {
        buildable_bbox: buildableBbox,
        buildable_polygon: rectangleToPolygon(
          buildableBbox.min_x || 0,
          buildableBbox.min_y || 0,
          buildableBbox.width || 0,
          buildableBbox.height || 0,
        ),
        warnings: [],
      },
      warnings: [],
    };
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
  const fallbackBbox = buildBoundingBoxFromRect(0, 0, width, depth);
  return {
    bbox: fallbackBbox,
    envelope: {
      buildable_bbox: fallbackBbox,
      buildable_polygon: rectangleToPolygon(0, 0, width, depth),
      warnings: [],
    },
    warnings: [],
  };
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

function sortRoomsForPlacement(rooms = [], strategy = {}) {
  return [...rooms].sort((left, right) => {
    const leftStack = Number.isFinite(Number(left.stack_order))
      ? Number(left.stack_order)
      : Number.MAX_SAFE_INTEGER;
    const rightStack = Number.isFinite(Number(right.stack_order))
      ? Number(right.stack_order)
      : Number.MAX_SAFE_INTEGER;
    if (leftStack !== rightStack) return leftStack - rightStack;
    if (strategy.daylightPriority) {
      if (Number(right.requires_daylight) !== Number(left.requires_daylight)) {
        return Number(right.requires_daylight) - Number(left.requires_daylight);
      }
    }
    if (strategy.wetZonePriority) {
      if (Number(right.wet_zone) !== Number(left.wet_zone)) {
        return Number(right.wet_zone) - Number(left.wet_zone);
      }
    }
    if (Number(right.wet_zone) !== Number(left.wet_zone)) {
      return Number(right.wet_zone) - Number(left.wet_zone);
    }
    if (Number(right.target_area || 0) !== Number(left.target_area || 0)) {
      return Number(right.target_area || 0) - Number(left.target_area || 0);
    }
    const leftName = String(left.name || "");
    const rightName = String(right.name || "");
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function buildZoneColumns(rooms = [], buildableBbox = {}, levelNumber = 0) {
  const zoneOrder =
    levelNumber === 0
      ? ["public", "core", "service", "private", "outdoor"]
      : ["private", "core", "service", "public", "outdoor"];
  const totalArea =
    rooms.reduce((sum, room) => sum + Number(room.target_area || 0), 0) || 1;
  const height = buildableBbox.height || 10;
  const envelopeWidth = buildableBbox.width || 12;
  const requiredWidth = totalArea / Math.max(height, 1);
  const widthScale =
    requiredWidth > envelopeWidth ? envelopeWidth / requiredWidth : 1;
  const presentZones = zoneOrder.filter((zone) =>
    rooms.some((room) => room.zone === zone),
  );
  let cursorX = buildableBbox.min_x || 0;

  const columns = presentZones.map((zone) => {
    const zoneArea = rooms
      .filter((room) => room.zone === zone)
      .reduce((sum, room) => sum + Number(room.target_area || 0), 0);
    const width = roundMetric(
      Math.max(2.6, (zoneArea / Math.max(height, 1)) * widthScale),
    );
    const column = {
      zone,
      x: roundMetric(cursorX),
      y: buildableBbox.min_y || 0,
      width,
      depth: roundMetric(height),
      scale_factor: widthScale,
    };
    cursorX += width;
    return column;
  });

  if (!columns.length) return [];

  const lastColumn = columns[columns.length - 1];
  const overflow = roundMetric(
    cursorX - ((buildableBbox.min_x || 0) + (buildableBbox.width || 0)),
  );
  if (overflow > 0) {
    lastColumn.width = roundMetric(Math.max(2.6, lastColumn.width - overflow));
  }

  return columns;
}

function allocateRoomsInLinearContainer(
  levelNumber,
  rooms = [],
  container = {},
  strategy = {},
  options = {},
) {
  return optimizeLinearRoomShapes(
    sortRoomsForPlacement(rooms, strategy).map((room, index) => ({
      ...room,
      level_number: levelNumber,
      layout_order: index,
    })),
    container,
    {
      axis: options.axis || "x",
      segments: options.segments || [],
      daylightPriority: strategy.daylightPriority,
      wetZonePriority: strategy.wetZonePriority,
    },
  );
}

function buildCoreRoom(corePlan = {}, levelNumber = 0) {
  const coreBbox = corePlan?.core_bbox;
  if (!coreBbox) return null;

  return {
    id: `level-${levelNumber}-stair-core`,
    name: "Stair Core",
    type: "stair_core",
    zone: "core",
    privacy_level: 1,
    requires_daylight: false,
    wet_zone: false,
    access_requirements: ["vertical_circulation"],
    adjacency_preferences: [],
    target_area: roundMetric(coreBbox.width * coreBbox.height),
    min_area: roundMetric(coreBbox.width * coreBbox.height),
    max_area: roundMetric(coreBbox.width * coreBbox.height),
    actual_area: roundMetric(coreBbox.width * coreBbox.height),
    bbox: coreBbox,
    polygon: rectangleToPolygon(
      coreBbox.min_x,
      coreBbox.min_y,
      coreBbox.width,
      coreBbox.height,
    ),
    centroid: {
      x: roundMetric(coreBbox.min_x + coreBbox.width / 2),
      y: roundMetric(coreBbox.min_y + coreBbox.height / 2),
    },
    stack_order: -1,
    metadata: {
      generated: true,
      core_variant: corePlan.variant,
    },
  };
}

function buildLayoutCandidate(context = {}, strategy = {}) {
  if (strategy.orientation === "vertical" && context.corePlan?.required) {
    return null;
  }

  const levels = context.levelAssignments.levels.map((level) => {
    const coreLevel = context.corePlan?.levels?.find(
      (entry) => entry.level_number === level.level_number,
    );
    const nonCoreRooms = level.rooms.filter((room) => room.zone !== "core");
    const bands = alignBandsToCore(
      buildZoneBands(
        nonCoreRooms,
        context.placementEnvelope,
        level.level_number,
      ),
      coreLevel?.core_bbox || null,
      context.buildableBbox,
    );
    const columns = buildZoneColumns(
      nonCoreRooms,
      context.placementEnvelope,
      level.level_number,
    );
    const placedRooms =
      strategy.orientation === "vertical"
        ? columns.flatMap((column) =>
            allocateRoomsInLinearContainer(
              level.level_number,
              level.rooms.filter(
                (room) => room.zone === column.zone && room.zone !== "core",
              ),
              {
                x: column.x,
                y: column.y,
                width: column.width,
                depth: column.depth,
                min_y: column.y,
              },
              strategy,
              { axis: "y" },
            ),
          )
        : bands.flatMap((band) =>
            allocateRoomsInLinearContainer(
              level.level_number,
              level.rooms.filter(
                (room) => room.zone === band.zone && room.zone !== "core",
              ),
              {
                x: band.x,
                y: band.y,
                width: band.width,
                depth: band.depth,
                min_y: band.y,
              },
              strategy,
              {
                axis: "x",
                segments: context.placementSegments.map((segment) => ({
                  ...segment,
                })),
              },
            ),
          );

    return {
      level_number: level.level_number,
      bands: strategy.orientation === "vertical" ? [] : bands,
      columns: strategy.orientation === "vertical" ? columns : [],
      rooms: [
        ...(coreLevel ? [buildCoreRoom(coreLevel, level.level_number)] : []),
        ...placedRooms,
      ].filter(Boolean),
      footprint: rectangleToPolygon(
        context.buildableBbox.min_x,
        context.buildableBbox.min_y,
        context.buildableBbox.width,
        context.buildableBbox.height,
      ),
      buildable_bbox: context.buildableBbox,
      placement_segments: context.placementSegments,
      core_plan: coreLevel || null,
      level_assignment_notes: context.levelAssignments.explanations || [],
    };
  });

  return {
    project_id: context.normalizedProgram.project_id,
    normalized_program: context.normalizedProgram,
    adjacency_graph: context.adjacencyGraph,
    zoning: buildZoningSummary({
      levels: levels.map((level) => ({
        ...level,
        rooms: level.rooms,
      })),
    }),
    level_count: context.levelAssignments.level_count,
    buildable_bbox: context.buildableBbox,
    buildable_envelope: context.buildableEnvelope,
    vertical_stacking_plan: context.levelAssignments.stackingPlan || null,
    level_assignment_explanations: context.levelAssignments.explanations || [],
    core_plan: context.corePlan,
    levels,
    deterministic: true,
    candidate_id: strategy.id,
    solver_notes: [
      `Candidate ${strategy.id} used ${strategy.orientation} placement flow.`,
      ...(strategy.daylightPriority
        ? ["Daylight-priority ordering biased exterior-touching rooms earlier."]
        : []),
      ...(strategy.wetZonePriority
        ? ["Wet-zone ordering biased stackable service rooms earlier."]
        : []),
    ],
  };
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
  const resolvedEnvelope = resolveBuildableEnvelope(request);
  const buildableBbox = resolvedEnvelope.bbox;
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
  const siteFallback = isFeatureEnabled("useIrregularSiteFallbackPhase5")
    ? resolveIrregularSiteFallback(
        request.site || {},
        resolvedEnvelope.envelope,
      )
    : null;

  const context = {
    normalizedProgram,
    adjacencyGraph,
    levelAssignments,
    buildableBbox,
    buildableEnvelope: resolvedEnvelope.envelope,
    corePlan,
    placementSegments,
    placementEnvelope,
    siteFallback,
  };

  const selectedLayout = isFeatureEnabled("usePhase4LayoutSearch")
    ? searchDeterministicLayouts(context, {
        candidateBuilder: (strategy) => buildLayoutCandidate(context, strategy),
        strategies: siteFallback?.searchStrategies?.length
          ? DEFAULT_LAYOUT_STRATEGIES.filter((strategy) =>
              siteFallback.searchStrategies.includes(strategy.id),
            )
          : undefined,
      })
    : buildLayoutCandidate(context, {
        id: "baseline-horizontal",
        orientation: "horizontal",
      });

  return {
    ...selectedLayout,
    solver_notes: [
      ...(selectedLayout.solver_notes || []),
      ...(resolvedEnvelope.warnings || []),
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
      ...(siteFallback?.warnings || []),
    ],
  };
}

export default {
  solveDeterministicLayout,
};
