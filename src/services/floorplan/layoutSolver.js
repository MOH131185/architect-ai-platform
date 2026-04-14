import {
  buildBuildableEnvelope,
  buildBoundingBoxFromRect,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { normalizeProgram } from "./programNormalizer.js";
import { buildAdjacencyGraph } from "./adjacencyGraphBuilder.js";
import {
  assignRoomZones,
  assignRoomsToLevels,
  buildZoneBands,
  buildZoningSummary,
} from "./zoningEngine.js";

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

export function solveDeterministicLayout(request = {}) {
  const normalizedProgram = normalizeProgram(
    request.room_program || request.roomProgram || request.program || [],
    {
      project_id: request.project_id || request.projectId,
    },
  );
  const zonedProgram = assignRoomZones(normalizedProgram.rooms);
  const levelAssignments = assignRoomsToLevels(
    zonedProgram,
    request.levels || request.level_count || request.levelCount || 1,
  );
  const adjacencyGraph = buildAdjacencyGraph(zonedProgram);
  const buildableBbox = resolveBuildableEnvelope(request);

  const levels = levelAssignments.levels.map((level) => {
    const bands = buildZoneBands(
      level.rooms,
      buildableBbox,
      level.level_number,
    );
    const placedRooms = bands.flatMap((band) =>
      allocateRoomsWithinBand(
        level.level_number,
        level.rooms.filter((room) => room.zone === band.zone),
        band,
      ),
    );

    return {
      level_number: level.level_number,
      bands,
      rooms: placedRooms,
      footprint: rectangleToPolygon(
        buildableBbox.min_x,
        buildableBbox.min_y,
        buildableBbox.width,
        buildableBbox.height,
      ),
      buildable_bbox: buildableBbox,
    };
  });

  return {
    project_id: normalizedProgram.project_id,
    normalized_program: normalizedProgram,
    adjacency_graph: adjacencyGraph,
    zoning: buildZoningSummary(levelAssignments),
    level_count: levelAssignments.level_count,
    buildable_bbox: buildableBbox,
    levels,
    deterministic: true,
    solver_notes: [
      "Rooms are packed as deterministic strip bands inside the buildable envelope.",
      "Multi-level support is scaffolded by assigning private rooms to upper floors first.",
    ],
  };
}

export default {
  solveDeterministicLayout,
};
