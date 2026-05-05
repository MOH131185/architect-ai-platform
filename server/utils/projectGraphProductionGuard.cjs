const LEGACY_GENERATION_DISABLED_CODE = "LEGACY_GENERATION_DISABLED";
const PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK_CODE =
  "PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK";
const MISSING_GEOMETRY_CONTROL_IMAGE_CODE = "MISSING_GEOMETRY_CONTROL_IMAGE";

const GEOMETRY_LOCKED_IMAGE_PANEL_TYPES = Object.freeze([
  "hero_3d",
  "exterior_render",
  "interior_3d",
  "axonometric",
]);

const TECHNICAL_PROJECT_PANEL_TYPES = Object.freeze([
  "site_plan",
  "site_diagram",
  "boundary_plan",
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_aa",
  "section_bb",
  "section_a_a",
  "section_b_b",
]);

const PROJECT_PANEL_TYPES = Object.freeze([
  ...GEOMETRY_LOCKED_IMAGE_PANEL_TYPES,
  ...TECHNICAL_PROJECT_PANEL_TYPES,
]);

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, "_");
}

function normalizePipelineMode(value) {
  const mode = normalizeToken(value);
  if (mode === "multipanel") {
    return "multi_panel";
  }
  if (mode === "projectgraph" || mode === "riba_a1") {
    return "project_graph";
  }
  return mode || "project_graph";
}

function normalizePanelType(value) {
  return normalizeToken(value);
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(normalizeToken(value));
}

function getEffectivePipelineMode(env = process.env) {
  return normalizePipelineMode(
    env?.REACT_APP_PIPELINE_MODE || env?.PIPELINE_MODE || "project_graph",
  );
}

function isLegacyGenerationAllowed(env = process.env) {
  return (
    isTruthy(env?.ALLOW_LEGACY_GENERATION) ||
    getEffectivePipelineMode(env) === "multi_panel"
  );
}

function shouldBlockLegacyProjectGeneration({ env = process.env } = {}) {
  return (
    getEffectivePipelineMode(env) === "project_graph" &&
    !isLegacyGenerationAllowed(env)
  );
}

function buildLegacyProjectGenerationDisabledPayload(route, env = process.env) {
  return {
    success: false,
    error: LEGACY_GENERATION_DISABLED_CODE,
    errorCode: LEGACY_GENERATION_DISABLED_CODE,
    statusCode: 410,
    message:
      "Production A1 generation must use /api/project/generate-vertical-slice so all 2D and 3D panels share ProjectGraph geometry authority.",
    details: {
      route,
      requiredRoute: "/api/project/generate-vertical-slice",
      allowLegacyEnv: "ALLOW_LEGACY_GENERATION=true",
    },
    meta: {
      pipelineMode: getEffectivePipelineMode(env),
      legacyGenerationAllowed: isLegacyGenerationAllowed(env),
    },
  };
}

function rejectLegacyProjectGenerationIfDisabled(
  req,
  res,
  route = "legacy_project_generation",
  options = {},
) {
  const env = options.env || process.env;
  if (!shouldBlockLegacyProjectGeneration({ env })) {
    return false;
  }

  res.status(410).json(buildLegacyProjectGenerationDisabledPayload(route, env));
  return true;
}

function createLegacyProjectGenerationMiddleware(route) {
  return function rejectLegacyProjectGenerationMiddleware(req, res, next) {
    if (rejectLegacyProjectGenerationIfDisabled(req, res, route)) {
      return;
    }
    next();
  };
}

function extractPanelType(body = {}) {
  const candidates = [
    body.panelType,
    body.panel_type,
    body.type,
    body.viewType,
    body.panel?.type,
    body.panel?.panelType,
    body.metadata?.panelType,
    body.metadata?.panel_type,
    body.metadata?.viewType,
  ];

  for (const candidate of candidates) {
    const panelType = normalizePanelType(candidate);
    if (panelType) {
      return panelType;
    }
  }

  return "";
}

function isGeometryLockedImagePanelType(panelType) {
  return GEOMETRY_LOCKED_IMAGE_PANEL_TYPES.includes(
    normalizePanelType(panelType),
  );
}

function isProjectPanelType(panelType) {
  return PROJECT_PANEL_TYPES.includes(normalizePanelType(panelType));
}

module.exports = {
  GEOMETRY_LOCKED_IMAGE_PANEL_TYPES,
  LEGACY_GENERATION_DISABLED_CODE,
  MISSING_GEOMETRY_CONTROL_IMAGE_CODE,
  PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK_CODE,
  PROJECT_PANEL_TYPES,
  TECHNICAL_PROJECT_PANEL_TYPES,
  buildLegacyProjectGenerationDisabledPayload,
  createLegacyProjectGenerationMiddleware,
  extractPanelType,
  getEffectivePipelineMode,
  isGeometryLockedImagePanelType,
  isLegacyGenerationAllowed,
  isProjectPanelType,
  normalizePanelType,
  normalizePipelineMode,
  rejectLegacyProjectGenerationIfDisabled,
  shouldBlockLegacyProjectGeneration,
};
