function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampInteger(value, fallback, minimum, maximum) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values
        .filter(
          (value) => value !== undefined && value !== null && value !== "",
        )
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function buildResponseMeta(endpoint, featureFlags = []) {
  return {
    endpoint,
    contractVersion: PHASE1_CONTRACT_VERSION,
    featureFlags: uniqueStrings(featureFlags),
  };
}

function normalizeLocation(location = {}, climate = null) {
  if (typeof location === "string") {
    return {
      region: location,
      climate_zone: climate || null,
    };
  }

  return {
    ...location,
    climate_zone:
      location.climate_zone ||
      location.climate ||
      location.climateZone ||
      climate ||
      null,
  };
}

function normalizeProgram(program = []) {
  if (Array.isArray(program)) return program;
  if (Array.isArray(program.rooms)) return program.rooms;
  return [];
}

const SUPPORTED_DRAWING_TYPES = ["plan", "elevation", "section"];
const MAX_REFERENCE_ITEMS = 24;
const MAX_CONTROL_IMAGES = 8;
const MAX_PRECEDENT_SEARCH_LIMIT = 25;

export const PHASE1_CONTRACT_VERSION = "phase1-architecture-backend-v1";

export const PHASE1_API_CONTRACTS = {
  generateStyle: {
    request: [
      "location",
      "climate",
      "buildingType",
      "styleIntent",
      "portfolioReferences",
    ],
    response: ["styleDNA", "appliedRules", "warnings", "selectedModelStrategy"],
  },
  generateFloorplan: {
    request: ["site", "program", "levels", "constraints"],
    response: ["layoutGraph", "zoningSummary", "warnings", "nextSteps"],
  },
  generateDrawings: {
    request: ["projectGeometry", "drawingTypes"],
    response: [
      "drawings",
      "validationNotes",
      "warnings",
      "selectedModelStrategy",
    ],
  },
  searchPrecedents: {
    request: ["query", "filters"],
    response: ["results", "metadata", "warnings", "selectedModelStrategy"],
  },
};

export function validateGenerateStyleRequest(payload = {}) {
  const warnings = [];
  const portfolioReferences = toArray(
    payload.portfolioReferences || payload.portfolioImages,
  ).slice(0, MAX_REFERENCE_ITEMS);
  if (
    toArray(payload.portfolioReferences || payload.portfolioImages).length >
    MAX_REFERENCE_ITEMS
  ) {
    warnings.push(
      `portfolioReferences truncated to ${MAX_REFERENCE_ITEMS} items for the Phase 1 placeholder pipeline.`,
    );
  }

  const controlImages = toArray(payload.controlImages).slice(
    0,
    MAX_CONTROL_IMAGES,
  );
  if (toArray(payload.controlImages).length > MAX_CONTROL_IMAGES) {
    warnings.push(
      `controlImages truncated to ${MAX_CONTROL_IMAGES} items for the Phase 1 placeholder pipeline.`,
    );
  }

  const normalized = {
    prompt: payload.prompt || payload.styleIntent || "",
    styleIntent: payload.styleIntent || payload.prompt || "",
    location: normalizeLocation(
      payload.location || payload.region || {},
      payload.climate,
    ),
    buildingType: payload.buildingType || payload.building_type || null,
    portfolioReferences,
    technicalConstraints: uniqueStrings(
      toArray(payload.technicalConstraints || payload.constraints),
    ),
    controlImages,
  };

  const errors = [];
  if (
    !normalized.prompt &&
    !normalized.styleIntent &&
    !normalized.portfolioReferences.length &&
    !normalized.location.region
  ) {
    errors.push(
      "Provide at least one of styleIntent, prompt, portfolioReferences, or location.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildGenerateStyleResponse({
  styleDNA,
  warnings = [],
  selectedModelStrategy = null,
  featureFlags = [],
}) {
  return {
    success: true,
    styleDNA,
    appliedRules: (styleDNA?.applied_rule_ids || []).map((ruleId, index) => ({
      id: ruleId,
      note: styleDNA?.applied_rule_notes?.[index] || null,
    })),
    warnings,
    selectedModelStrategy,
    meta: buildResponseMeta("generate-style", featureFlags),
  };
}

export function validateGenerateFloorplanRequest(payload = {}) {
  const warnings = [];
  const normalized = {
    project_id: payload.project_id || payload.projectId || "phase1-floorplan",
    site: payload.site || payload.site_boundary || payload.boundary || null,
    program: normalizeProgram(
      payload.program || payload.room_program || payload.roomProgram || [],
    ),
    room_program: normalizeProgram(
      payload.room_program || payload.roomProgram || payload.program || [],
    ),
    levels: clampInteger(
      payload.levels || payload.level_count || payload.levelCount,
      1,
      1,
      20,
    ),
    constraints: isPlainObject(payload.constraints) ? payload.constraints : {},
    building_type: payload.building_type || payload.buildingType || null,
    target_area_m2: toNumber(payload.target_area_m2 ?? payload.targetAreaM2),
    footprint: payload.footprint || null,
  };

  const errors = [];
  if (!normalized.room_program.length) {
    errors.push("program or room_program must contain at least one room.");
  }
  if (payload.constraints && !isPlainObject(payload.constraints)) {
    warnings.push("constraints must be an object; invalid value was ignored.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildGenerateFloorplanResponse({
  result,
  warnings = [],
  selectedModelStrategy = null,
  featureFlags = [],
}) {
  return {
    success: true,
    layout: result.layout,
    layoutGraph: result.layoutGraph || result.layout?.adjacency_graph || null,
    zoningSummary: result.zoningSummary || result.layout?.zoning || null,
    summary: result.summary || null,
    validation: result.validation || null,
    warnings,
    nextSteps: result.nextSteps || [],
    selectedModelStrategy,
    meta: buildResponseMeta("generate-floorplan", featureFlags),
  };
}

export function validateGenerateDrawingsRequest(payload = {}) {
  const warnings = [];
  const rawDrawingTypes = uniqueStrings(
    toArray(payload.drawingTypes || payload.types),
  );
  const drawingTypes = rawDrawingTypes.filter((drawingType) =>
    SUPPORTED_DRAWING_TYPES.includes(String(drawingType).toLowerCase()),
  );
  const unsupportedDrawingTypes = rawDrawingTypes.filter(
    (drawingType) =>
      !SUPPORTED_DRAWING_TYPES.includes(String(drawingType).toLowerCase()),
  );
  if (unsupportedDrawingTypes.length) {
    warnings.push(
      `Unsupported drawingTypes ignored: ${unsupportedDrawingTypes.join(", ")}.`,
    );
  }
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    geometry: payload.projectGeometry || payload.geometry || null,
    drawingTypes: drawingTypes.length
      ? drawingTypes.map((drawingType) => String(drawingType).toLowerCase())
      : ["plan", "elevation", "section"],
    styleDNA: payload.styleDNA || {},
    orientations: uniqueStrings(toArray(payload.orientations)).map((entry) =>
      entry.toLowerCase(),
    ),
    sectionTypes: uniqueStrings(toArray(payload.sectionTypes)).map((entry) =>
      entry.toLowerCase(),
    ),
  };

  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildGenerateDrawingsResponse({
  result,
  warnings = [],
  selectedModelStrategy = null,
  featureFlags = [],
}) {
  const drawings = result.drawings || {
    plan: result.outputs?.floor_plans || [],
    elevation: result.outputs?.elevations || [],
    section: result.outputs?.sections || [],
  };

  return {
    success: true,
    drawings,
    validationNotes: result.validation_notes || result.metadata?.notes || [],
    warnings,
    metadata: result.metadata || null,
    selectedModelStrategy,
    meta: buildResponseMeta("generate-drawings", featureFlags),
  };
}

export function validateSearchPrecedentsRequest(payload = {}) {
  const warnings = [];
  const requestedLimit = toNumber(payload.limit, 10);
  const normalizedLimit = clampInteger(
    requestedLimit,
    10,
    1,
    MAX_PRECEDENT_SEARCH_LIMIT,
  );
  if (
    Number.isFinite(requestedLimit) &&
    requestedLimit > MAX_PRECEDENT_SEARCH_LIMIT
  ) {
    warnings.push(
      `limit reduced to ${MAX_PRECEDENT_SEARCH_LIMIT} for the Phase 1 placeholder index.`,
    );
  }
  const normalized = {
    query: payload.query || "",
    filters: isPlainObject(payload.filters) ? payload.filters : {},
    corpus: Array.isArray(payload.corpus) ? payload.corpus : null,
    persist: payload.persist === true,
    append: payload.append !== false,
    limit: normalizedLimit,
    indexPath: payload.indexPath || null,
  };

  const errors = [];
  if (!normalized.query && !normalized.corpus?.length) {
    errors.push("Provide a query or a corpus to search.");
  }
  if (payload.filters && !isPlainObject(payload.filters)) {
    warnings.push("filters must be an object; invalid value was ignored.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildSearchPrecedentsResponse({
  result,
  index = null,
  warnings = [],
  selectedModelStrategy = null,
  featureFlags = [],
}) {
  const matchExplanations =
    result.results?.map((entry) => ({
      id: entry.id,
      explanation: entry.match_explanation || null,
    })) || [];

  return {
    success: true,
    results: result.results || [],
    metadata: result.metadata || {
      total_candidates: result.total_candidates || 0,
    },
    matchExplanation: matchExplanations,
    matchExplanations,
    index,
    warnings,
    selectedModelStrategy,
    meta: buildResponseMeta("search-precedents", featureFlags),
  };
}

export function buildModelStatusResponse(status = {}) {
  return {
    success: true,
    status,
    contracts: PHASE1_API_CONTRACTS,
    meta: buildResponseMeta("status", ["useModelRegistryRouter"]),
  };
}

export default {
  PHASE1_API_CONTRACTS,
  validateGenerateStyleRequest,
  buildGenerateStyleResponse,
  validateGenerateFloorplanRequest,
  buildGenerateFloorplanResponse,
  validateGenerateDrawingsRequest,
  buildGenerateDrawingsResponse,
  validateSearchPrecedentsRequest,
  buildSearchPrecedentsResponse,
  buildModelStatusResponse,
};
