import { CANONICAL_PROJECT_GEOMETRY_VERSION } from "../cad/projectGeometrySchema.js";
import { JSON_SCHEMAS as LEGACY_JSON_SCHEMAS } from "./jsonSchemas.js";
import {
  PHASE7_PUBLIC_API_VERSION,
  PHASE7_SCHEMA_ENGINE_VERSION,
} from "./contractVersioningService.js";
import { nullable, objectSchema, arrayOf } from "./schemaCompositionService.js";
import { buildDeprecationMap } from "./schemaMigrationService.js";

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

const fragmentListSchema = {
  type: "array",
  items: { type: "string", minLength: 1 },
};

const regenerationScopeSchema = {
  type: "object",
  properties: {
    geometryFragments: fragmentListSchema,
    drawingFragments: fragmentListSchema,
    facadeFragments: fragmentListSchema,
    visualFragments: fragmentListSchema,
    panelFragments: fragmentListSchema,
    readinessFragments: fragmentListSchema,
  },
  additionalProperties: true,
};

const approvedRegenerationPlanSchema = {
  type: "object",
  properties: {
    targetLayer: { type: "string", minLength: 1 },
    geometrySignature: { type: "string", minLength: 1 },
    minimumSafeScope: regenerationScopeSchema,
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
    drawings: nullable(drawingsSchema),
    visualPackage: nullable(visualPackageSchema),
    facadeGrammar: { type: ["object", "null"] },
    validationReport: nullable(validationReportSchema),
    includeRecoveryPlan: { type: "boolean" },
  },
  additionalProperties: true,
};

const planA1PanelsRequestSchema = {
  type: "object",
  required: ["projectGeometry"],
  properties: {
    projectGeometry: { type: "object" },
    drawings: nullable(drawingsSchema),
    visualPackage: nullable(visualPackageSchema),
    facadeGrammar: { type: ["object", "null"] },
    requestedPanels: arrayOf({ type: "string", minLength: 1 }),
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
    validationReport: nullable(validationReportSchema),
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

const planRegenerationRequestSchema = objectSchema(
  {
    projectGeometry: { type: "object" },
    targetLayer: { type: "string", minLength: 1 },
    drawings: nullable(drawingsSchema),
    visualPackage: nullable(visualPackageSchema),
    facadeGrammar: { type: ["object", "null"] },
    validationReport: nullable(validationReportSchema),
    options: { type: "object", additionalProperties: true },
  },
  {
    required: ["projectGeometry", "targetLayer"],
    additionalProperties: true,
  },
);

const projectHealthRequestSchema = objectSchema(
  {
    projectGeometry: { type: "object" },
    drawings: nullable(drawingsSchema),
    visualPackage: nullable(visualPackageSchema),
    facadeGrammar: { type: ["object", "null"] },
    validationReport: nullable(validationReportSchema),
  },
  {
    required: ["projectGeometry"],
    additionalProperties: true,
  },
);

const executeRegenerationRequestSchema = objectSchema(
  {
    projectGeometry: { type: "object" },
    approvedPlan: nullable(approvedRegenerationPlanSchema),
    targetLayer: { type: ["string", "null"], minLength: 1 },
    drawings: nullable(drawingsSchema),
    visualPackage: nullable(visualPackageSchema),
    facadeGrammar: { type: ["object", "null"] },
    validationReport: nullable(validationReportSchema),
    styleDNA: { type: ["object", "null"] },
    options: { type: "object", additionalProperties: true },
  },
  {
    required: ["projectGeometry"],
    additionalProperties: true,
  },
);

function createRegistration(name, schema, options = {}) {
  return {
    name,
    schemaName: name,
    schemaVersion: options.schemaVersion || `${name}-phase6-v1`,
    publicApiVersion: options.publicApiVersion || PHASE7_PUBLIC_API_VERSION,
    schemaEngineVersion: PHASE7_SCHEMA_ENGINE_VERSION,
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
      deprecatedProperties: buildDeprecationMap({
        projectId: "project_id",
        site_boundary: "site",
        boundary: "site",
        roomProgram: "room_program",
        program: "room_program",
        level_count: "levels",
        levelCount: "levels",
        view_type: "viewType",
      }),
    },
  ),
  regenerateLayerRequest: createRegistration(
    "regenerateLayerRequest",
    regenerateLayerRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
        target_layer: "targetLayer",
      }),
    },
  ),
  generateFacadeRequest: createRegistration(
    "generateFacadeRequest",
    generateFacadeRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
      }),
    },
  ),
  generateVisualPackageRequest: createRegistration(
    "generateVisualPackageRequest",
    generateVisualPackageRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
        view_type: "viewType",
      }),
    },
  ),
  projectReadinessRequest: createRegistration(
    "projectReadinessRequest",
    projectReadinessRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
      }),
    },
  ),
  planA1PanelsRequest: createRegistration(
    "planA1PanelsRequest",
    planA1PanelsRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
      }),
    },
  ),
  validateProjectRequest: createRegistration(
    "validateProjectRequest",
    validateProjectRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
        types: "drawingTypes",
        previous_geometry: "previousProjectGeometry",
        target_layer: "targetLayer",
      }),
    },
  ),
  repairProjectRequest: createRegistration(
    "repairProjectRequest",
    repairProjectRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
      }),
    },
  ),
  planRegenerationRequest: createRegistration(
    "planRegenerationRequest",
    planRegenerationRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
        target_layer: "targetLayer",
      }),
    },
  ),
  projectHealthRequest: createRegistration(
    "projectHealthRequest",
    projectHealthRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
      }),
    },
  ),
  executeRegenerationRequest: createRegistration(
    "executeRegenerationRequest",
    executeRegenerationRequestSchema,
    {
      deprecatedProperties: buildDeprecationMap({
        geometry: "projectGeometry",
        target_layer: "targetLayer",
      }),
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
