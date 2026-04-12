import logger from "../utils/logger.js";

export const SPATIAL_GRAPH_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ArchiAI Spatial Graph",
  type: "object",
  required: ["building"],
  properties: {
    building: {
      type: "object",
      required: ["floors", "envelope"],
      properties: {
        type: { type: "string" },
        floors: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["level", "height_m", "rooms"],
            properties: {
              level: { type: "number" },
              height_m: { type: "number", minimum: 2.2 },
              rooms: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  required: [
                    "id",
                    "type",
                    "area_m2",
                    "min_width_m",
                    "min_length_m",
                    "adjacencies",
                    "orientation",
                    "natural_light",
                  ],
                  properties: {
                    id: { type: "string" },
                    type: { type: "string" },
                    area_m2: { type: "number", minimum: 1 },
                    min_width_m: { type: "number", minimum: 0.8 },
                    min_length_m: { type: "number", minimum: 0.8 },
                    adjacencies: {
                      type: "array",
                      items: { type: "string" },
                    },
                    orientation: {
                      type: "string",
                      enum: ["north", "south", "east", "west", "any"],
                    },
                    natural_light: { type: "boolean" },
                    requirements: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
              circulation: {
                type: "object",
                properties: {
                  entry_from: { type: "string" },
                  vertical: {
                    type: "array",
                    items: { type: "string" },
                  },
                  corridors: { type: "boolean" },
                },
              },
            },
          },
        },
        envelope: {
          type: "object",
          required: ["width_m", "depth_m", "style", "roof_type"],
          properties: {
            width_m: { type: "number", minimum: 2 },
            depth_m: { type: "number", minimum: 2 },
            style: { type: "string" },
            roof_type: { type: "string" },
          },
        },
      },
    },
  },
};

const SPATIAL_ORIENTATIONS = new Set(["north", "south", "east", "west", "any"]);
const RESIDENTIAL_HINTS =
  /residential|house|home|dwelling|bungalow|villa|apartment|flat|terrace/i;
const SERVICE_ROOM_TYPES = new Set([
  "wc",
  "hallway",
  "staircase",
  "circulation",
]);

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRoomId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isResidentialGraph(graph, options = {}) {
  const hintedType =
    options.buildingType ||
    graph?.building?.type ||
    graph?.building?.program ||
    graph?.buildingCategory ||
    "";
  return !hintedType || RESIDENTIAL_HINTS.test(String(hintedType));
}

function hasRoomType(graph, matcher) {
  return flattenSpatialGraphRooms(graph).some((room) => matcher(room));
}

export function flattenSpatialGraphRooms(graph) {
  const floors = graph?.building?.floors;
  if (!Array.isArray(floors)) {
    return [];
  }

  return floors.flatMap((floor) =>
    (Array.isArray(floor.rooms) ? floor.rooms : []).map((room) => ({
      ...room,
      level: floor.level ?? 0,
      height_m: floor.height_m ?? 3,
    })),
  );
}

export function validateSpatialGraph(graph, options = {}) {
  const errors = [];
  const warnings = [];

  if (!graph || typeof graph !== "object") {
    return {
      valid: false,
      errors: ["Spatial graph must be an object"],
      warnings,
    };
  }

  const floors = graph?.building?.floors;
  const envelope = graph?.building?.envelope || {};
  const envelopeWidth = toNumber(envelope.width_m);
  const envelopeDepth = toNumber(envelope.depth_m);

  if (!Array.isArray(floors) || floors.length === 0) {
    errors.push("Spatial graph must include at least one floor");
  }

  if (envelopeWidth <= 0 || envelopeDepth <= 0) {
    errors.push("Spatial graph envelope requires positive width_m and depth_m");
  }

  const roomMap = new Map();
  const rooms = flattenSpatialGraphRooms(graph);

  rooms.forEach((room) => {
    const roomId = normalizeRoomId(room.id);
    const roomType = String(room.type || "").toLowerCase();
    const minDimension = SERVICE_ROOM_TYPES.has(roomType) ? 1 : 2;

    if (!roomId) {
      errors.push("All rooms require a non-empty id");
      return;
    }

    if (roomMap.has(roomId)) {
      errors.push(`Duplicate room id "${roomId}" in spatial graph`);
    }
    roomMap.set(roomId, room);

    if (toNumber(room.area_m2) <= 0) {
      errors.push(`Room "${roomId}" must define a positive area_m2`);
    }

    if (toNumber(room.min_width_m) < minDimension) {
      errors.push(
        `Room "${roomId}" minimum width ${room.min_width_m}m is below ${minDimension}m`,
      );
    }

    if (toNumber(room.min_length_m) < minDimension) {
      errors.push(
        `Room "${roomId}" minimum length ${room.min_length_m}m is below ${minDimension}m`,
      );
    }

    if (
      !SPATIAL_ORIENTATIONS.has(String(room.orientation || "").toLowerCase())
    ) {
      errors.push(
        `Room "${roomId}" has invalid orientation "${room.orientation}"`,
      );
    }

    if (typeof room.natural_light !== "boolean") {
      errors.push(`Room "${roomId}" natural_light must be boolean`);
    }
  });

  floors?.forEach((floor) => {
    const floorRooms = Array.isArray(floor.rooms) ? floor.rooms : [];
    const totalArea = floorRooms.reduce(
      (sum, room) => sum + toNumber(room.area_m2),
      0,
    );
    const floorCapacity = envelopeWidth * envelopeDepth;

    if (floorRooms.length === 0) {
      warnings.push(`Floor ${floor.level ?? 0} has no rooms`);
    }

    if (floorCapacity > 0 && totalArea > floorCapacity) {
      errors.push(
        `Floor ${floor.level ?? 0} room area ${totalArea.toFixed(1)}m² exceeds envelope area ${floorCapacity.toFixed(1)}m²`,
      );
    }

    floorRooms.forEach((room) => {
      const roomId = normalizeRoomId(room.id);
      const adjacencies = Array.isArray(room.adjacencies)
        ? room.adjacencies
        : [];
      adjacencies.forEach((targetId) => {
        const normalizedTarget = normalizeRoomId(targetId);
        if (!roomMap.has(normalizedTarget)) {
          errors.push(
            `Room "${roomId}" references unknown adjacency "${targetId}"`,
          );
        }
        if (normalizedTarget === roomId) {
          errors.push(`Room "${roomId}" cannot be adjacent to itself`);
        }
      });
    });
  });

  if (isResidentialGraph(graph, options)) {
    if (
      !hasRoomType(
        graph,
        (room) =>
          /bed(room)?/.test(String(room.type || "")) ||
          /bed(room)?/.test(normalizeRoomId(room.id)),
      )
    ) {
      errors.push("Residential spatial graphs require at least one bedroom");
    }

    if (
      !hasRoomType(
        graph,
        (room) =>
          /(bath(room)?|wc)/.test(String(room.type || "")) ||
          /(bath(room)?|wc)/.test(normalizeRoomId(room.id)),
      )
    ) {
      errors.push(
        "Residential spatial graphs require at least one bathroom or WC",
      );
    }

    if (
      !hasRoomType(
        graph,
        (room) =>
          /kitchen/.test(String(room.type || "")) ||
          /kitchen/.test(normalizeRoomId(room.id)),
      )
    ) {
      errors.push("Residential spatial graphs require at least one kitchen");
    }
  }

  if (errors.length > 0) {
    logger.warn("Spatial graph validation failed", { errors, warnings });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    roomCount: rooms.length,
    floorCount: Array.isArray(floors) ? floors.length : 0,
  };
}

export default {
  SPATIAL_GRAPH_SCHEMA,
  flattenSpatialGraphRooms,
  validateSpatialGraph,
};
