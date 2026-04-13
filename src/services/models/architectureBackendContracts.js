function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
  const normalized = {
    prompt: payload.prompt || payload.styleIntent || "",
    styleIntent: payload.styleIntent || payload.prompt || "",
    location: normalizeLocation(
      payload.location || payload.region || {},
      payload.climate,
    ),
    buildingType: payload.buildingType || payload.building_type || null,
    portfolioReferences: toArray(
      payload.portfolioReferences || payload.portfolioImages,
    ),
    technicalConstraints: toArray(
      payload.technicalConstraints || payload.constraints,
    ),
    controlImages: toArray(payload.controlImages),
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
    warnings: [],
    normalized,
  };
}

export function buildGenerateStyleResponse({
  styleDNA,
  warnings = [],
  selectedModelStrategy = null,
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
  };
}

export function validateGenerateFloorplanRequest(payload = {}) {
  const normalized = {
    project_id: payload.project_id || payload.projectId || "phase1-floorplan",
    site: payload.site || payload.site_boundary || payload.boundary || null,
    program: normalizeProgram(
      payload.program || payload.room_program || payload.roomProgram || [],
    ),
    room_program: normalizeProgram(
      payload.room_program || payload.roomProgram || payload.program || [],
    ),
    levels: payload.levels || payload.level_count || payload.levelCount || 1,
    constraints: payload.constraints || {},
    building_type: payload.building_type || payload.buildingType || null,
    target_area_m2: toNumber(payload.target_area_m2 ?? payload.targetAreaM2),
    footprint: payload.footprint || null,
  };

  const errors = [];
  if (!normalized.room_program.length) {
    errors.push("program or room_program must contain at least one room.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: [],
    normalized,
  };
}

export function buildGenerateFloorplanResponse({
  result,
  warnings = [],
  selectedModelStrategy = null,
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
  };
}

export function validateGenerateDrawingsRequest(payload = {}) {
  const drawingTypes = toArray(payload.drawingTypes || payload.types);
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    geometry: payload.projectGeometry || payload.geometry || null,
    drawingTypes: drawingTypes.length
      ? drawingTypes
      : ["plan", "elevation", "section"],
    styleDNA: payload.styleDNA || {},
    orientations: toArray(payload.orientations),
    sectionTypes: toArray(payload.sectionTypes),
  };

  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: [],
    normalized,
  };
}

export function buildGenerateDrawingsResponse({
  result,
  warnings = [],
  selectedModelStrategy = null,
}) {
  return {
    success: true,
    drawings: result.drawings || {
      plan: result.outputs?.floor_plans || [],
      elevation: result.outputs?.elevations || [],
      section: result.outputs?.sections || [],
    },
    validationNotes: result.validation_notes || result.metadata?.notes || [],
    warnings,
    metadata: result.metadata || null,
    selectedModelStrategy,
  };
}

export function validateSearchPrecedentsRequest(payload = {}) {
  const normalized = {
    query: payload.query || "",
    filters: payload.filters || {},
    corpus: Array.isArray(payload.corpus) ? payload.corpus : null,
    persist: payload.persist === true,
    append: payload.append !== false,
    limit: toNumber(payload.limit, 10) || 10,
    indexPath: payload.indexPath || null,
  };

  const errors = [];
  if (!normalized.query && !normalized.corpus?.length) {
    errors.push("Provide a query or a corpus to search.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: [],
    normalized,
  };
}

export function buildSearchPrecedentsResponse({
  result,
  index = null,
  warnings = [],
  selectedModelStrategy = null,
}) {
  return {
    success: true,
    results: result.results || [],
    metadata: result.metadata || {
      total_candidates: result.total_candidates || 0,
    },
    matchExplanation:
      result.results?.map((entry) => ({
        id: entry.id,
        explanation: entry.match_explanation || null,
      })) || [],
    index,
    warnings,
    selectedModelStrategy,
  };
}

export function buildModelStatusResponse(status = {}) {
  return {
    success: true,
    status,
    contracts: PHASE1_API_CONTRACTS,
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
