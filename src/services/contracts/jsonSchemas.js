import { CANONICAL_PROJECT_GEOMETRY_VERSION } from "../cad/projectGeometrySchema.js";

const point2D = {
  type: "object",
  required: ["x", "y"],
  properties: {
    x: { type: "number" },
    y: { type: "number" },
  },
};

const bbox = {
  type: "object",
  required: ["min_x", "min_y", "max_x", "max_y", "width", "height"],
  properties: {
    min_x: { type: "number" },
    min_y: { type: "number" },
    max_x: { type: "number" },
    max_y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
};

const roomSchema = {
  type: "object",
  required: [
    "id",
    "level_id",
    "name",
    "type",
    "bbox",
    "polygon",
    "target_area",
    "actual_area",
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    level_id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
    bbox,
    polygon: { type: "array", minItems: 4, items: point2D },
    target_area: { type: "number" },
    actual_area: { type: "number" },
  },
};

const wallSchema = {
  type: "object",
  required: ["id", "level_id", "start", "end", "length_m", "room_ids"],
  properties: {
    id: { type: "string", minLength: 1 },
    level_id: { type: "string", minLength: 1 },
    start: point2D,
    end: point2D,
    length_m: { type: "number" },
    room_ids: { type: "array", items: { type: "string" } },
    exterior: { type: "boolean" },
    bbox,
  },
};

const openingSchema = {
  type: "object",
  required: ["id", "level_id", "wall_id", "position_m", "room_ids"],
  properties: {
    id: { type: "string", minLength: 1 },
    level_id: { type: "string", minLength: 1 },
    wall_id: { type: "string", minLength: 1 },
    position_m: point2D,
    room_ids: { type: "array", items: { type: "string" } },
    width_m: { type: "number" },
  },
};

export const JSON_SCHEMAS = {
  canonicalProjectGeometry: {
    type: "object",
    required: [
      "schema_version",
      "project_id",
      "site",
      "levels",
      "rooms",
      "walls",
      "doors",
      "windows",
      "stairs",
      "circulation",
      "columns",
      "beams",
      "slabs",
      "footprints",
      "elevations",
      "sections",
      "annotations",
      "metadata",
      "provenance",
    ],
    properties: {
      schema_version: { const: CANONICAL_PROJECT_GEOMETRY_VERSION },
      project_id: { type: "string", minLength: 1 },
      site: {
        type: "object",
        required: [
          "id",
          "boundary_polygon",
          "boundary_bbox",
          "buildable_polygon",
          "buildable_bbox",
          "setbacks",
          "north_orientation_deg",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          boundary_polygon: { type: "array", minItems: 4, items: point2D },
          boundary_bbox: bbox,
          buildable_polygon: { type: "array", minItems: 4, items: point2D },
          buildable_bbox: bbox,
          setbacks: { type: "object" },
          north_orientation_deg: { type: "number" },
        },
      },
      levels: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "level_number", "room_ids", "wall_ids"],
          properties: {
            id: { type: "string", minLength: 1 },
            level_number: { type: "integer" },
            room_ids: { type: "array", items: { type: "string" } },
            wall_ids: { type: "array", items: { type: "string" } },
            door_ids: { type: "array", items: { type: "string" } },
            window_ids: { type: "array", items: { type: "string" } },
            stair_ids: { type: "array", items: { type: "string" } },
            circulation_ids: { type: "array", items: { type: "string" } },
          },
        },
      },
      rooms: { type: "array", items: roomSchema },
      walls: { type: "array", items: wallSchema },
      doors: { type: "array", items: openingSchema },
      windows: { type: "array", items: openingSchema },
      stairs: { type: "array", items: { type: "object" } },
      circulation: { type: "array", items: { type: "object" } },
      columns: { type: "array", items: { type: "object" } },
      beams: { type: "array", items: { type: "object" } },
      slabs: { type: "array", items: { type: "object" } },
      roof: { type: ["object", "null"] },
      footprints: { type: "array", items: { type: "object" } },
      elevations: { type: "array", items: { type: "object" } },
      sections: { type: "array", items: { type: "object" } },
      annotations: { type: "array", items: { type: "object" } },
      metadata: { type: "object" },
      provenance: { type: "object" },
    },
  },
  generateProjectRequest: {
    type: "object",
    required: [
      "project_id",
      "room_program",
      "levels",
      "constraints",
      "styleDNA",
    ],
    properties: {
      project_id: { type: "string", minLength: 1 },
      room_program: { type: "array", minItems: 1, items: { type: "object" } },
      levels: { type: "integer", minimum: 1, maximum: 20 },
      constraints: { type: "object" },
      styleDNA: { type: "object" },
      site: { type: ["object", "null"] },
      footprint: { type: ["object", "null"] },
      drawingTypes: { type: "array", items: { type: "string" } },
      viewType: { type: "string", minLength: 1 },
    },
  },
  regenerateLayerRequest: {
    type: "object",
    required: [
      "projectGeometry",
      "targetLayer",
      "locks",
      "styleDNA",
      "options",
    ],
    properties: {
      projectGeometry: { type: "object" },
      targetLayer: { type: "string", minLength: 1 },
      locks: { type: "object" },
      styleDNA: { type: "object" },
      options: { type: "object" },
    },
  },
  generateFacadeRequest: {
    type: "object",
    required: ["projectGeometry", "styleDNA"],
    properties: {
      projectGeometry: { type: "object" },
      styleDNA: { type: "object" },
    },
  },
  generateVisualPackageRequest: {
    type: "object",
    required: ["projectGeometry", "styleDNA", "viewType", "options"],
    properties: {
      projectGeometry: { type: "object" },
      styleDNA: { type: "object" },
      viewType: { type: "string", minLength: 1 },
      options: { type: "object" },
    },
  },
  projectReadinessRequest: {
    type: "object",
    required: ["projectGeometry"],
    properties: {
      projectGeometry: { type: "object" },
      drawings: { type: ["object", "null"] },
      visualPackage: { type: ["object", "null"] },
      facadeGrammar: { type: ["object", "null"] },
      validationReport: { type: ["object", "null"] },
    },
  },
  planA1PanelsRequest: {
    type: "object",
    required: ["projectGeometry"],
    properties: {
      projectGeometry: { type: "object" },
      drawings: { type: ["object", "null"] },
      visualPackage: { type: ["object", "null"] },
      facadeGrammar: { type: ["object", "null"] },
      requestedPanels: { type: "array", items: { type: "string" } },
    },
  },
};

export default {
  JSON_SCHEMAS,
};
