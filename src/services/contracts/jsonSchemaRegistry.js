import { CANONICAL_PROJECT_GEOMETRY_VERSION } from "../cad/projectGeometrySchema.js";
import { JSON_SCHEMAS as LEGACY_JSON_SCHEMAS } from "./jsonSchemas.js";
import {
  PHASE5_PUBLIC_API_VERSION,
  PHASE5_SCHEMA_ENGINE_VERSION,
} from "./contractVersioningService.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const point2D = {
  type: "object",
  required: ["x", "y"],
  additionalProperties: false,
  properties: {
    x: { type: "number" },
    y: { type: "number" },
  },
};

const drawingEntrySchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1 },
    svg: { type: "string", minLength: 1 },
    level_id: { type: "string", minLength: 1 },
    orientation: { type: "string", minLength: 1 },
    section_type: { type: "string", minLength: 1 },
    renderer: { type: "string", minLength: 1 },
  },
  additionalProperties: true,
};

const drawingsSchema = {
  type: "object",
  properties: {
    plan: { type: "array", items: drawingEntrySchema },
    elevation: { type: "array", items: drawingEntrySchema },
    section: { type: "array", items: drawingEntrySchema },
  },
  additionalProperties: true,
};

const visualPackageSchema = {
  type: "object",
  required: ["viewType"],
  properties: {
    viewType: { type: "string", minLength: 1 },
    geometrySignature: { type: "string", minLength: 1 },
    validation: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        warnings: { type: "array", items: { type: "string" } },
        errors: { type: "array", items: { type: "string" } },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

const validationReportSchema = {
  type: "object",
  properties: {
    valid: { type: "boolean" },
    status: {
      type: "string",
      enum: [
        "valid",
        "valid_with_warnings",
        "invalid",
        "stale",
        "ready",
        "blocked",
      ],
    },
    warnings: { type: "array", items: { type: "string" } },
    errors: { type: "array", items: { type: "string" } },
    repairSuggestions: { type: "array", items: { type: "string" } },
  },
  additionalProperties: true,
};

const canonicalProjectGeometrySchema = clone(
  LEGACY_JSON_SCHEMAS.canonicalProjectGeometry,
);
canonicalProjectGeometrySchema.additionalProperties = true;
canonicalProjectGeometrySchema.properties.schema_version = {
  const: CANONICAL_PROJECT_GEOMETRY_VERSION,
};

const generateProjectRequestSchema = clone(
  LEGACY_JSON_SCHEMAS.generateProjectRequest,
);
generateProjectRequestSchema.additionalProperties = true;

const regenerateLayerRequestSchema = clone(
  LEGACY_JSON_SCHEMAS.regenerateLayerRequest,
);
regenerateLayerRequestSchema.additionalProperties = true;

const generateFacadeRequestSchema = clone(
  LEGACY_JSON_SCHEMAS.generateFacadeRequest,
);
generateFacadeRequestSchema.additionalProperties = true;

const generateVisualPackageRequestSchema = clone(
  LEGACY_JSON_SCHEMAS.generateVisualPackageRequest,
);
generateVisualPackageRequestSchema.additionalProperties = true;

const projectReadinessRequestSchema = {
  type: "object",
  required: ["projectGeometry"],
  properties: {
    projectGeometry: { type: "object" },
    drawings: {
      anyOf: [{ type: "null" }, drawingsSchema],
    },
    visualPackage: {
      anyOf: [{ type: "null" }, visualPackageSchema],
    },
    facadeGrammar: { type: ["object", "null"] },
    validationReport: {
      anyOf: [{ type: "null" }, validationReportSchema],
    },
  },
  additionalProperties: true,
};

const planA1PanelsRequestSchema = {
  type: "object",
  required: ["projectGeometry"],
  properties: {
    projectGeometry: { type: "object" },
    drawings: {
      anyOf: [{ type: "null" }, drawingsSchema],
    },
    visualPackage: {
      anyOf: [{ type: "null" }, visualPackageSchema],
    },
    facadeGrammar: { type: ["object", "null"] },
    requestedPanels: { type: "array", items: { type: "string", minLength: 1 } },
  },
  additionalProperties: true,
};

const validateProjectRequestSchema = {
  type: "object",
  required: ["projectGeometry"],
  properties: {
    projectGeometry: { type: "object" },
    drawings: {
      anyOf: [{ type: "null" }, drawingsSchema],
    },
    drawingTypes: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    facadeGrammar: { type: ["object", "null"] },
    structuralGrid: { type: ["object", "null"] },
    previousProjectGeometry: { type: ["object", "null"] },
    locks: { type: ["object", "null"] },
    targetLayer: { type: ["string", "null"], minLength: 1 },
  },
  additionalProperties: true,
};

const repairProjectRequestSchema = {
  type: "object",
  required: ["projectGeometry"],
  properties: {
    projectGeometry: { type: "object" },
    validationReport: {
      anyOf: [{ type: "null" }, validationReportSchema],
    },
    options: {
      type: "object",
      properties: {
        levelId: { type: "string", minLength: 1 },
        preserveStableIds: { type: "boolean" },
        maxCandidates: { type: "integer", minimum: 1, maximum: 24 },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

function createRegistration(name, schema, options = {}) {
  return {
    name,
    schemaName: name,
    schemaVersion: options.schemaVersion || `${name}-phase5-v1`,
    publicApiVersion: options.publicApiVersion || PHASE5_PUBLIC_API_VERSION,
    schemaEngineVersion: PHASE5_SCHEMA_ENGINE_VERSION,
    deprecatedProperties: options.deprecatedProperties || {},
    schema,
  };
}

export const JSON_SCHEMA_REGISTRY = {
  canonicalProjectGeometry: createRegistration(
    "canonicalProjectGeometry",
    canonicalProjectGeometrySchema,
  ),
  generateProjectRequest: createRegistration(
    "generateProjectRequest",
    generateProjectRequestSchema,
    {
      deprecatedProperties: {
        projectId: "project_id",
        site_boundary: "site",
        boundary: "site",
        roomProgram: "room_program",
        program: "room_program",
        level_count: "levels",
        levelCount: "levels",
        view_type: "viewType",
      },
    },
  ),
  regenerateLayerRequest: createRegistration(
    "regenerateLayerRequest",
    regenerateLayerRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
        target_layer: "targetLayer",
      },
    },
  ),
  generateFacadeRequest: createRegistration(
    "generateFacadeRequest",
    generateFacadeRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
      },
    },
  ),
  generateVisualPackageRequest: createRegistration(
    "generateVisualPackageRequest",
    generateVisualPackageRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
        view_type: "viewType",
      },
    },
  ),
  projectReadinessRequest: createRegistration(
    "projectReadinessRequest",
    projectReadinessRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
      },
    },
  ),
  planA1PanelsRequest: createRegistration(
    "planA1PanelsRequest",
    planA1PanelsRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
      },
    },
  ),
  validateProjectRequest: createRegistration(
    "validateProjectRequest",
    validateProjectRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
        types: "drawingTypes",
        previous_geometry: "previousProjectGeometry",
        target_layer: "targetLayer",
      },
    },
  ),
  repairProjectRequest: createRegistration(
    "repairProjectRequest",
    repairProjectRequestSchema,
    {
      deprecatedProperties: {
        geometry: "projectGeometry",
      },
    },
  ),
};

export function getJsonSchemaRegistration(name = "") {
  return JSON_SCHEMA_REGISTRY[String(name || "").trim()] || null;
}

export function listRegisteredSchemas() {
  return Object.keys(JSON_SCHEMA_REGISTRY);
}

export default {
  JSON_SCHEMA_REGISTRY,
  getJsonSchemaRegistration,
  listRegisteredSchemas,
};
