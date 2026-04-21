import {
  PHASE5_PUBLIC_API_VERSION as CONTRACT_PHASE5_PUBLIC_API_VERSION,
  PHASE6_PUBLIC_API_VERSION as CONTRACT_PHASE6_PUBLIC_API_VERSION,
  PHASE7_PUBLIC_API_VERSION as CONTRACT_PHASE7_PUBLIC_API_VERSION,
  getPublicApiVersion,
  getSchemaEngineVersion,
} from "../contracts/contractVersioningService.js";
import { geometrySignature } from "../project/projectArtifactStore.js";
import { buildA1VerificationStateBundle } from "../a1/a1VerificationStateSerializer.js";

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function noteDeprecatedAlias(warnings, payload, alias, canonical) {
  if (hasOwn(payload, alias)) {
    warnings.push(`"${alias}" is deprecated; use "${canonical}" instead.`);
  }
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

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function buildResponseMeta(
  endpoint,
  featureFlags = [],
  deprecatedAliases = [],
) {
  return {
    endpoint,
    contractVersion: PHASE1_CONTRACT_VERSION,
    runtimeVersion: PHASE2_RUNTIME_VERSION,
    publicApiVersion: getPublicApiVersion(endpoint),
    publicContractVersion: getPublicApiVersion(endpoint),
    schemaEngineVersion: getSchemaEngineVersion(),
    featureFlags: uniqueStrings(featureFlags),
    deprecatedAliases: uniqueStrings(deprecatedAliases),
  };
}

function resolveCanonicalVerification(result = {}, readiness = null) {
  const verificationBundle =
    result.verification ||
    result.verificationBundle ||
    result.verificationState ||
    readiness?.verification ||
    readiness?.verificationBundle ||
    readiness?.verificationState ||
    buildA1VerificationStateBundle({
      renderedTextZone:
        result.renderedTextZone ||
        result.finalSheetRegression?.renderedTextZone ||
        readiness?.renderedTextZone ||
        readiness?.finalSheetRegression?.renderedTextZone ||
        null,
      finalSheetRegression:
        result.finalSheetRegression || readiness?.finalSheetRegression || null,
      technicalCredibility:
        result.technicalCredibility || readiness?.technicalCredibility || null,
      publishability:
        result.publishability || readiness?.publishability || null,
    });
  return verificationBundle.verification || verificationBundle;
}

function alignVerificationBundle(bundle = null, verification = null) {
  if (!bundle && !verification) {
    return null;
  }
  const base = bundle || {};
  const canonical = verification || base.verification || null;
  if (!canonical) {
    return base;
  }
  return {
    ...base,
    renderedTextZone:
      base.renderedTextZone || canonical.components?.renderedTextZone || null,
    finalSheetRegression:
      base.finalSheetRegression ||
      canonical.components?.finalSheetRegression ||
      null,
    technicalCredibility:
      base.technicalCredibility ||
      canonical.components?.technicalCredibility ||
      null,
    publishability:
      base.publishability || canonical.components?.publishability || null,
    phase: canonical.phase,
    postComposeVerified: canonical.postComposeVerified,
    provisional: canonical.provisional,
    decisive: canonical.decisive,
    overallStatus: canonical.overallStatus,
    overallDecision: canonical.overallDecision,
    publishabilityDecision: canonical.publishabilityDecision,
    renderedTextEvidenceQuality: canonical.renderedTextEvidenceQuality,
    sectionEvidenceQuality: canonical.sectionEvidenceQuality,
    sectionDirectEvidenceQuality: canonical.sectionDirectEvidenceQuality,
    sectionInferredEvidenceQuality: canonical.sectionInferredEvidenceQuality,
    sectionConstructionEvidenceQuality:
      canonical.sectionConstructionEvidenceQuality,
    sectionConstructionTruthQuality: canonical.sectionConstructionTruthQuality,
    wallSectionClipQuality: canonical.wallSectionClipQuality,
    openingSectionClipQuality: canonical.openingSectionClipQuality,
    stairSectionClipQuality: canonical.stairSectionClipQuality,
    slabSectionClipQuality: canonical.slabSectionClipQuality,
    roofSectionClipQuality: canonical.roofSectionClipQuality,
    foundationSectionClipQuality: canonical.foundationSectionClipQuality,
    cutWallTruthQuality: canonical.cutWallTruthQuality,
    cutOpeningTruthQuality: canonical.cutOpeningTruthQuality,
    stairTruthQuality: canonical.stairTruthQuality,
    slabTruthQuality: canonical.slabTruthQuality,
    roofTruthQuality: canonical.roofTruthQuality,
    roofTruthMode: canonical.roofTruthMode,
    roofTruthState: canonical.roofTruthState,
    foundationTruthQuality: canonical.foundationTruthQuality,
    foundationTruthMode: canonical.foundationTruthMode,
    foundationTruthState: canonical.foundationTruthState,
    sideFacadeEvidenceQuality: canonical.sideFacadeEvidenceQuality,
    sectionChosenRationale: canonical.sectionChosenRationale,
    ocrEvidenceQuality: canonical.ocrEvidenceQuality,
    verification: canonical,
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
export const PHASE2_RUNTIME_VERSION = "phase2-geometry-validation-v1";
export const PHASE4_PUBLIC_API_VERSION = "phase4-solver-schema-a1-v1";
export const PHASE5_PUBLIC_API_VERSION = CONTRACT_PHASE5_PUBLIC_API_VERSION;
export const PHASE6_PUBLIC_API_VERSION = CONTRACT_PHASE6_PUBLIC_API_VERSION;
export const PHASE7_PUBLIC_API_VERSION = CONTRACT_PHASE7_PUBLIC_API_VERSION;

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
    response: [
      "layoutGraph",
      "zoningSummary",
      "projectGeometry",
      "validationReport",
      "status",
      "warnings",
      "nextSteps",
    ],
  },
  generateDrawings: {
    request: ["projectGeometry", "drawingTypes"],
    response: [
      "drawings",
      "validationNotes",
      "validationReport",
      "status",
      "warnings",
      "selectedModelStrategy",
    ],
  },
  validateProject: {
    request: ["projectGeometry", "drawings", "drawingTypes"],
    response: ["status", "validationReport", "warnings", "errors"],
  },
  generateProject: {
    request: ["site", "program", "levels", "styleDNA"],
    response: [
      "projectGeometry",
      "facadeGrammar",
      "structuralGrid",
      "drawings",
      "integrationHooks",
      "validationReport",
      "status",
      "warnings",
    ],
  },
  regenerateLayer: {
    request: ["projectGeometry", "targetLayer", "locks", "styleDNA"],
    response: [
      "projectGeometry",
      "diff",
      "locks",
      "validationReport",
      "status",
    ],
  },
  generateFacade: {
    request: ["projectGeometry", "styleDNA"],
    response: ["facadeGrammar", "warnings", "selectedModelStrategy"],
  },
  generateVisualPackage: {
    request: ["projectGeometry", "styleDNA", "viewType"],
    response: ["visualPackage", "warnings", "selectedModelStrategy"],
  },
  projectReadiness: {
    request: ["projectGeometry", "drawings", "visualPackage"],
    response: [
      "ready",
      "status",
      "panelCandidates",
      "staleAssets",
      "technicalPanelReadinessState",
      "fontReadiness",
      "finalSheetRegression",
      "finalSheetRegressionPhase",
      "renderedTextZone",
      "renderedTextEvidenceQuality",
      "perSideElevationStatus",
      "sideFacadeEvidenceQuality",
      "sectionCandidateQuality",
      "sectionEvidenceQuality",
      "sectionDirectEvidenceQuality",
      "sectionInferredEvidenceQuality",
      "sectionConstructionEvidenceQuality",
      "sectionConstructionTruthQuality",
      "wallSectionClipQuality",
      "openingSectionClipQuality",
      "stairSectionClipQuality",
      "slabSectionClipQuality",
      "roofSectionClipQuality",
      "foundationSectionClipQuality",
      "cutWallTruthQuality",
      "cutOpeningTruthQuality",
      "stairTruthQuality",
      "slabTruthQuality",
      "roofTruthQuality",
      "roofTruthMode",
      "foundationTruthQuality",
      "foundationTruthMode",
      "sectionChosenRationale",
      "sectionStrategyRationale",
      "technicalFragmentScores",
      "technicalCredibility",
      "technicalCredibilityPhase",
      "publishability",
      "publishabilityPhase",
      "postComposeVerified",
      "verification",
      "verificationBundle",
      "verificationState",
    ],
  },
  planA1Panels: {
    request: [
      "projectGeometry",
      "drawings",
      "visualPackage",
      "requestedPanels",
    ],
    response: [
      "panelCandidates",
      "validPanelCount",
      "totalPanelCount",
      "technicalPanelReadinessState",
      "fontReadiness",
      "finalSheetRegression",
      "finalSheetRegressionPhase",
      "renderedTextZone",
      "renderedTextEvidenceQuality",
      "perSideElevationStatus",
      "sideFacadeEvidenceQuality",
      "sectionCandidateQuality",
      "sectionEvidenceQuality",
      "sectionDirectEvidenceQuality",
      "sectionInferredEvidenceQuality",
      "sectionConstructionEvidenceQuality",
      "sectionConstructionTruthQuality",
      "wallSectionClipQuality",
      "openingSectionClipQuality",
      "stairSectionClipQuality",
      "slabSectionClipQuality",
      "roofSectionClipQuality",
      "foundationSectionClipQuality",
      "cutWallTruthQuality",
      "cutOpeningTruthQuality",
      "stairTruthQuality",
      "slabTruthQuality",
      "roofTruthQuality",
      "roofTruthMode",
      "foundationTruthQuality",
      "foundationTruthMode",
      "sectionChosenRationale",
      "sectionStrategyRationale",
      "technicalFragmentScores",
      "technicalCredibility",
      "technicalCredibilityPhase",
      "publishability",
      "publishabilityPhase",
      "postComposeVerified",
      "verification",
      "verificationBundle",
      "verificationState",
    ],
  },
  planRegeneration: {
    request: ["projectGeometry", "targetLayer", "options", "validationReport"],
    response: ["minimumSafeScope", "plannedActions", "impactedFragments"],
  },
  executeRegeneration: {
    request: ["projectGeometry", "approvedPlan", "targetLayer", "options"],
    response: [
      "artifactFreshness",
      "snapshotDiff",
      "freshnessUpdates",
      "drawings",
      "facadeGrammar",
      "visualPackage",
    ],
  },
  projectHealth: {
    request: ["projectGeometry", "drawings", "visualPackage"],
    response: [
      "healthStatus",
      "readiness",
      "recoveryPlan",
      "rollbackPlan",
      "finalSheetRegression",
      "finalSheetRegressionPhase",
      "renderedTextZone",
      "renderedTextEvidenceQuality",
      "technicalFragmentScores",
      "perSideElevationStatus",
      "sideFacadeEvidenceQuality",
      "sectionCandidateQuality",
      "sectionEvidenceQuality",
      "sectionDirectEvidenceQuality",
      "sectionInferredEvidenceQuality",
      "sectionConstructionEvidenceQuality",
      "sectionConstructionTruthQuality",
      "wallSectionClipQuality",
      "openingSectionClipQuality",
      "stairSectionClipQuality",
      "slabSectionClipQuality",
      "roofSectionClipQuality",
      "foundationSectionClipQuality",
      "cutWallTruthQuality",
      "cutOpeningTruthQuality",
      "stairTruthQuality",
      "slabTruthQuality",
      "roofTruthQuality",
      "roofTruthMode",
      "foundationTruthQuality",
      "foundationTruthMode",
      "sectionChosenRationale",
      "sectionStrategyRationale",
      "technicalCredibility",
      "technicalCredibilityPhase",
      "publishability",
      "publishabilityPhase",
      "postComposeVerified",
      "verification",
      "verificationBundle",
      "verificationState",
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
    success: result.status !== "invalid",
    layout: result.layout,
    layoutGraph: result.layoutGraph || result.layout?.adjacency_graph || null,
    adjacencyGraph:
      result.adjacencyGraph ||
      result.layoutGraph ||
      result.layout?.adjacency_graph ||
      null,
    zoningSummary: result.zoningSummary || result.layout?.zoning || null,
    candidateEvaluations:
      result.candidateEvaluations ||
      result.layout?.candidate_evaluations ||
      null,
    summary: result.summary || null,
    validation: result.validationReport || result.validation || null,
    validationReport: result.validationReport || result.validation || null,
    projectGeometry: result.projectGeometry || result.geometry || null,
    canonicalGeometry: result.projectGeometry || result.geometry || null,
    status:
      result.status ||
      result.validationReport?.status ||
      result.validation?.status ||
      "valid",
    warnings,
    nextSteps: result.nextSteps || [],
    selectedModelStrategy,
    meta: buildResponseMeta("generate-floorplan", featureFlags, [
      "canonicalGeometry",
      "validation",
    ]),
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
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    structuralGrid: isPlainObject(payload.structuralGrid)
      ? payload.structuralGrid
      : null,
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
    success: result.status !== "invalid",
    drawings,
    validationNotes: result.validation_notes || result.metadata?.notes || [],
    validationReport: result.validationReport || null,
    projectGeometry: result.projectGeometry || null,
    status:
      result.status || result.validationReport?.status || "valid_with_warnings",
    warnings,
    metadata: result.metadata || null,
    selectedModelStrategy,
    meta: buildResponseMeta("generate-drawings", featureFlags),
  };
}

export function validateValidateProjectRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  noteDeprecatedAlias(warnings, payload, "types", "drawingTypes");
  noteDeprecatedAlias(
    warnings,
    payload,
    "previous_geometry",
    "previousProjectGeometry",
  );
  noteDeprecatedAlias(warnings, payload, "target_layer", "targetLayer");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    drawings: isPlainObject(payload.drawings) ? payload.drawings : null,
    drawingTypes: uniqueStrings(
      toArray(payload.drawingTypes || payload.types),
    ).map((entry) => entry.toLowerCase()),
    styleDNA: isPlainObject(payload.styleDNA) ? payload.styleDNA : {},
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    structuralGrid: isPlainObject(payload.structuralGrid)
      ? payload.structuralGrid
      : null,
    previousProjectGeometry:
      payload.previousProjectGeometry || payload.previous_geometry || null,
    locks: isPlainObject(payload.locks) ? payload.locks : {},
    targetLayer: payload.targetLayer || payload.target_layer || null,
  };

  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (payload.drawings && !isPlainObject(payload.drawings)) {
    warnings.push("drawings must be an object; invalid value was ignored.");
  }
  if (hasOwn(payload, "styleDNA") && !isPlainObject(payload.styleDNA)) {
    errors.push("styleDNA must be an object when provided.");
  }
  if (hasOwn(payload, "locks") && !isPlainObject(payload.locks)) {
    errors.push("locks must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function validateRepairProjectRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    validationReport: isPlainObject(payload.validationReport)
      ? payload.validationReport
      : null,
    options: isPlainObject(payload.options) ? payload.options : {},
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (
    hasOwn(payload, "validationReport") &&
    !isPlainObject(payload.validationReport)
  ) {
    errors.push("validationReport must be an object when provided.");
  }
  if (hasOwn(payload, "options") && !isPlainObject(payload.options)) {
    errors.push("options must be an object when provided.");
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function validateGenerateProjectRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "projectId", "project_id");
  noteDeprecatedAlias(warnings, payload, "site_boundary", "site");
  noteDeprecatedAlias(warnings, payload, "boundary", "site");
  noteDeprecatedAlias(warnings, payload, "roomProgram", "room_program");
  noteDeprecatedAlias(warnings, payload, "program", "room_program");
  noteDeprecatedAlias(warnings, payload, "level_count", "levels");
  noteDeprecatedAlias(warnings, payload, "levelCount", "levels");
  noteDeprecatedAlias(warnings, payload, "types", "drawingTypes");
  noteDeprecatedAlias(warnings, payload, "view_type", "viewType");
  const rawDrawingTypes = uniqueStrings(
    toArray(payload.drawingTypes || payload.types),
  ).map((entry) => entry.toLowerCase());
  const drawingTypes = rawDrawingTypes.filter((drawingType) =>
    SUPPORTED_DRAWING_TYPES.includes(drawingType),
  );
  const unsupportedDrawingTypes = rawDrawingTypes.filter(
    (drawingType) => !SUPPORTED_DRAWING_TYPES.includes(drawingType),
  );
  if (unsupportedDrawingTypes.length) {
    warnings.push(
      `Unsupported drawingTypes ignored: ${unsupportedDrawingTypes.join(", ")}.`,
    );
  }
  const normalized = {
    project_id: payload.project_id || payload.projectId || "phase3-project",
    site: payload.site || payload.site_boundary || payload.boundary || null,
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
    styleDNA: isPlainObject(payload.styleDNA) ? payload.styleDNA : {},
    drawingTypes: drawingTypes.length
      ? drawingTypes
      : ["plan", "elevation", "section"],
    footprint: payload.footprint || null,
    viewType: payload.viewType || payload.view_type || "hero_3d",
  };

  const errors = [];
  if (!normalized.room_program.length) {
    errors.push("program or room_program must contain at least one room.");
  }
  if (hasOwn(payload, "constraints") && !isPlainObject(payload.constraints)) {
    errors.push("constraints must be an object when provided.");
  }
  if (hasOwn(payload, "styleDNA") && !isPlainObject(payload.styleDNA)) {
    errors.push("styleDNA must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildGenerateProjectResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  return {
    contractVersion: getPublicApiVersion("generate-project"),
    success: result.status !== "invalid",
    projectGeometry: result.projectGeometry || null,
    facadeGrammar: result.facadeGrammar || null,
    structuralGrid: result.structuralGrid || null,
    drawings: result.drawings?.drawings || null,
    visualPackage: result.visualPackage || null,
    integrationHooks: result.integrationHooks || null,
    artifactState: result.artifactState || null,
    artifactStore: result.artifactStore || null,
    a1Readiness: result.a1Readiness || null,
    validationReport: result.validationReport || null,
    status: result.status || result.validationReport?.status || "valid",
    warnings,
    meta: buildResponseMeta("generate-project", featureFlags, [
      "projectId",
      "site_boundary",
      "boundary",
      "roomProgram",
      "program",
      "level_count",
      "levelCount",
      "types",
      "view_type",
    ]),
  };
}

export function validateRegenerateLayerRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  noteDeprecatedAlias(warnings, payload, "target_layer", "targetLayer");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    styleDNA: isPlainObject(payload.styleDNA) ? payload.styleDNA : {},
    targetLayer: payload.targetLayer || payload.target_layer || null,
    locks: isPlainObject(payload.locks) ? payload.locks : {},
    options: isPlainObject(payload.options) ? payload.options : {},
  };

  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (!normalized.targetLayer) {
    errors.push("targetLayer or target_layer is required.");
  }
  if (hasOwn(payload, "styleDNA") && !isPlainObject(payload.styleDNA)) {
    errors.push("styleDNA must be an object when provided.");
  }
  if (hasOwn(payload, "locks") && !isPlainObject(payload.locks)) {
    errors.push("locks must be an object when provided.");
  }
  if (hasOwn(payload, "options") && !isPlainObject(payload.options)) {
    errors.push("options must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildRegenerateLayerResponse({
  result,
  warnings = [],
  validationReport = null,
  featureFlags = [],
}) {
  return {
    contractVersion: getPublicApiVersion("regenerate-layer"),
    success: (validationReport?.status || "valid") !== "invalid",
    projectGeometry: result.projectGeometry || null,
    facadeGrammar: result.facadeGrammar || null,
    drawings: result.drawings?.drawings || null,
    visualPackage: result.visualPackage || null,
    diff: result.diff || null,
    locks: result.locks || null,
    artifactState: result.artifactState || null,
    artifactStore: result.artifactStore || null,
    a1Readiness: result.a1Readiness || null,
    regenerationPlan: result.regenerationPlan || null,
    stateSnapshots: result.stateSnapshots || null,
    validationReport,
    status: validationReport?.status || "valid",
    warnings,
    meta: buildResponseMeta("regenerate-layer", featureFlags, [
      "geometry",
      "target_layer",
    ]),
  };
}

export function validateGenerateFacadeRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    styleDNA: isPlainObject(payload.styleDNA) ? payload.styleDNA : {},
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (hasOwn(payload, "styleDNA") && !isPlainObject(payload.styleDNA)) {
    errors.push("styleDNA must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildGenerateFacadeResponse({
  facadeGrammar,
  warnings = [],
  selectedModelStrategy = null,
  featureFlags = [],
}) {
  return {
    success: true,
    facadeGrammar,
    warnings,
    selectedModelStrategy,
    meta: buildResponseMeta("generate-facade", featureFlags, ["geometry"]),
  };
}

export function validateGenerateVisualPackageRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  noteDeprecatedAlias(warnings, payload, "view_type", "viewType");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    styleDNA: isPlainObject(payload.styleDNA) ? payload.styleDNA : {},
    viewType: payload.viewType || payload.view_type || "hero_3d",
    options: isPlainObject(payload.options) ? payload.options : {},
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (hasOwn(payload, "styleDNA") && !isPlainObject(payload.styleDNA)) {
    errors.push("styleDNA must be an object when provided.");
  }
  if (hasOwn(payload, "options") && !isPlainObject(payload.options)) {
    errors.push("options must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildGenerateVisualPackageResponse({
  visualPackage,
  warnings = [],
  selectedModelStrategy = null,
  featureFlags = [],
}) {
  return {
    success: visualPackage?.validation?.valid !== false,
    visualPackage,
    warnings,
    selectedModelStrategy,
    meta: buildResponseMeta("generate-visual-package", featureFlags, [
      "geometry",
      "view_type",
    ]),
  };
}

export function validateProjectReadinessRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    drawings: isPlainObject(payload.drawings) ? payload.drawings : null,
    visualPackage: isPlainObject(payload.visualPackage)
      ? payload.visualPackage
      : null,
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    validationReport: isPlainObject(payload.validationReport)
      ? payload.validationReport
      : null,
    includeRecoveryPlan: payload.includeRecoveryPlan !== false,
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (hasOwn(payload, "drawings") && !isPlainObject(payload.drawings)) {
    errors.push("drawings must be an object when provided.");
  }
  if (
    hasOwn(payload, "visualPackage") &&
    !isPlainObject(payload.visualPackage)
  ) {
    errors.push("visualPackage must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildProjectReadinessResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  const finalSheetRegressionPhase =
    result.finalSheetRegression?.verificationPhase || "pre_compose";
  const technicalCredibilityPhase =
    result.technicalCredibility?.verificationPhase || finalSheetRegressionPhase;
  const publishabilityPhase =
    result.publishability?.verificationPhase || technicalCredibilityPhase;
  const verificationState =
    result.verificationState ||
    result.verificationBundle ||
    buildA1VerificationStateBundle({
      renderedTextZone:
        result.renderedTextZone ||
        result.finalSheetRegression?.renderedTextZone ||
        null,
      finalSheetRegression: result.finalSheetRegression || null,
      technicalCredibility: result.technicalCredibility || null,
      publishability: result.publishability || null,
    });
  const verification = resolveCanonicalVerification(result);
  const verificationBundle = alignVerificationBundle(
    verificationState,
    verification,
  );

  return {
    contractVersion: getPublicApiVersion("project-readiness"),
    success: true,
    ready: result.ready === true,
    composeReady: result.composeReady === true || result.ready === true,
    composeBlocked: result.composeBlocked === true,
    status: result.status || "stale",
    panelCandidates: result.panelCandidates || [],
    freshPanels: result.freshPanels || [],
    stalePanels: result.stalePanels || [],
    missingPanels: result.missingPanels || [],
    staleAssets: result.staleAssets || [],
    missingAssets: result.missingAssets || [],
    reasons: result.reasons || [],
    blockingReasons: result.blockingReasons || result.reasons || [],
    recoverableIssues: result.recoverableIssues || [],
    nonRecoverableIssues: result.nonRecoverableIssues || [],
    artifactState: result.artifactState || null,
    artifactStore: result.artifactStore || null,
    artifactFreshness: result.artifactFreshness || null,
    technicalPanelGate: result.technicalPanelGate || null,
    technicalPanelReadinessState:
      result.technicalPanelGate?.technicalPanelReadinessState || "pass",
    consistencyGuard: result.consistencyGuard || null,
    heroVsCanonicalWarnings:
      result.consistencyGuard?.heroVsCanonicalWarnings || [],
    fontReadiness: result.fontReadiness || null,
    finalSheetRegression: result.finalSheetRegression || null,
    finalSheetRegressionReadiness:
      result.finalSheetRegression?.status || "pass",
    finalSheetRegressionPhase,
    renderedTextZone:
      result.renderedTextZone ||
      result.finalSheetRegression?.renderedTextZone ||
      null,
    renderedTextZoneStatus:
      result.renderedTextZone?.status ||
      result.finalSheetRegression?.renderedTextZoneStatus ||
      "warning",
    renderedTextEvidenceQuality:
      result.finalSheetRegression?.renderedTextEvidenceQuality ||
      verificationBundle?.renderedTextEvidenceQuality ||
      "provisional",
    perSideElevationStatus:
      result.finalSheetRegression?.perSideElevationStatus ||
      result.technicalPanelGate?.perSideElevationStatus ||
      {},
    sideFacadeEvidenceQuality:
      result.finalSheetRegression?.sideFacadeEvidenceQuality ||
      verificationBundle?.sideFacadeEvidenceQuality ||
      "provisional",
    sectionCandidateQuality:
      result.finalSheetRegression?.sectionCandidateQuality ||
      result.technicalPanelGate?.sectionCandidateQuality ||
      [],
    sectionEvidenceQuality:
      verificationBundle?.sectionEvidenceQuality ||
      result.finalSheetRegression?.sectionEvidenceQuality ||
      "provisional",
    sectionDirectEvidenceQuality:
      verificationBundle?.sectionDirectEvidenceQuality ||
      result.finalSheetRegression?.sectionDirectEvidenceQuality ||
      "provisional",
    sectionInferredEvidenceQuality:
      verificationBundle?.sectionInferredEvidenceQuality ||
      result.finalSheetRegression?.sectionInferredEvidenceQuality ||
      "provisional",
    sectionConstructionEvidenceQuality:
      verificationBundle?.sectionConstructionEvidenceQuality ||
      result.finalSheetRegression?.sectionConstructionEvidenceQuality ||
      "provisional",
    sectionConstructionTruthQuality:
      verificationBundle?.sectionConstructionTruthQuality ||
      result.finalSheetRegression?.sectionConstructionTruthQuality ||
      "provisional",
    wallSectionClipQuality:
      verificationBundle?.wallSectionClipQuality ||
      result.finalSheetRegression?.wallSectionClipQuality ||
      "provisional",
    openingSectionClipQuality:
      verificationBundle?.openingSectionClipQuality ||
      result.finalSheetRegression?.openingSectionClipQuality ||
      "provisional",
    stairSectionClipQuality:
      verificationBundle?.stairSectionClipQuality ||
      result.finalSheetRegression?.stairSectionClipQuality ||
      "provisional",
    slabSectionClipQuality:
      verificationBundle?.slabSectionClipQuality ||
      result.finalSheetRegression?.slabSectionClipQuality ||
      "provisional",
    roofSectionClipQuality:
      verificationBundle?.roofSectionClipQuality ||
      result.finalSheetRegression?.roofSectionClipQuality ||
      "provisional",
    foundationSectionClipQuality:
      verificationBundle?.foundationSectionClipQuality ||
      result.finalSheetRegression?.foundationSectionClipQuality ||
      "provisional",
    cutWallTruthQuality:
      verificationBundle?.cutWallTruthQuality ||
      result.finalSheetRegression?.cutWallTruthQuality ||
      "provisional",
    cutOpeningTruthQuality:
      verificationBundle?.cutOpeningTruthQuality ||
      result.finalSheetRegression?.cutOpeningTruthQuality ||
      "provisional",
    stairTruthQuality:
      verificationBundle?.stairTruthQuality ||
      result.finalSheetRegression?.stairTruthQuality ||
      "provisional",
    slabTruthQuality:
      verificationBundle?.slabTruthQuality ||
      result.finalSheetRegression?.slabTruthQuality ||
      "provisional",
    roofTruthQuality:
      verificationBundle?.roofTruthQuality ||
      result.finalSheetRegression?.roofTruthQuality ||
      "provisional",
    roofTruthMode:
      verificationBundle?.roofTruthMode ||
      result.finalSheetRegression?.roofTruthMode ||
      "missing",
    roofTruthState:
      verificationBundle?.roofTruthState ||
      result.finalSheetRegression?.roofTruthState ||
      "unsupported",
    foundationTruthQuality:
      verificationBundle?.foundationTruthQuality ||
      result.finalSheetRegression?.foundationTruthQuality ||
      "provisional",
    foundationTruthMode:
      verificationBundle?.foundationTruthMode ||
      result.finalSheetRegression?.foundationTruthMode ||
      "missing",
    foundationTruthState:
      verificationBundle?.foundationTruthState ||
      result.finalSheetRegression?.foundationTruthState ||
      "unsupported",
    sectionChosenRationale:
      verificationBundle?.sectionChosenRationale ||
      result.finalSheetRegression?.chosenSectionRationale ||
      null,
    technicalFragmentScores:
      result.finalSheetRegression?.technicalFragmentScores ||
      result.technicalPanelGate?.technicalFragmentScores ||
      [],
    sectionStrategyRationale: (
      result.finalSheetRegression?.sectionCandidateQuality ||
      result.technicalPanelGate?.sectionCandidateQuality ||
      []
    ).map((entry) => ({
      sectionType: entry.sectionType,
      strategyId: entry.strategyId || null,
      strategyName: entry.strategyName || null,
      rationale: entry.rationale || [],
    })),
    technicalCredibility: result.technicalCredibility || null,
    technicalCredibilityPhase,
    publishability: result.publishability || null,
    publishabilityPhase,
    postComposeVerified: publishabilityPhase === "post_compose",
    verification,
    verificationBundle,
    verificationState: verificationBundle,
    composeExecutionPlan: result.composeExecutionPlan || null,
    recoveryExecutionBridge: result.recoveryExecutionBridge || null,
    entityBlockers: result.entityBlockers || [],
    recoveryPlan: result.recoveryPlan || null,
    warnings,
    meta: buildResponseMeta("project-readiness", featureFlags, ["geometry"]),
  };
}

export function validatePlanA1PanelsRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    drawings: isPlainObject(payload.drawings) ? payload.drawings : null,
    visualPackage: isPlainObject(payload.visualPackage)
      ? payload.visualPackage
      : null,
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    requestedPanels: uniqueStrings(toArray(payload.requestedPanels)),
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (hasOwn(payload, "drawings") && !isPlainObject(payload.drawings)) {
    errors.push("drawings must be an object when provided.");
  }
  if (
    hasOwn(payload, "visualPackage") &&
    !isPlainObject(payload.visualPackage)
  ) {
    errors.push("visualPackage must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildPlanA1PanelsResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  const finalSheetRegressionPhase =
    result.finalSheetRegression?.verificationPhase || "pre_compose";
  const technicalCredibilityPhase =
    result.technicalCredibility?.verificationPhase || finalSheetRegressionPhase;
  const publishabilityPhase =
    result.publishability?.verificationPhase || technicalCredibilityPhase;
  const verificationState =
    result.verificationState ||
    result.verificationBundle ||
    buildA1VerificationStateBundle({
      renderedTextZone:
        result.renderedTextZone ||
        result.finalSheetRegression?.renderedTextZone ||
        null,
      finalSheetRegression: result.finalSheetRegression || null,
      technicalCredibility: result.technicalCredibility || null,
      publishability: result.publishability || null,
    });
  const verification = resolveCanonicalVerification(result);
  const verificationBundle = alignVerificationBundle(
    verificationState,
    verification,
  );

  return {
    contractVersion: getPublicApiVersion("plan-a1-panels"),
    success: true,
    panelCandidates: result.panelCandidates || [],
    validPanelCount: result.validPanelCount || 0,
    totalPanelCount: result.totalPanelCount || 0,
    freshPanels: result.freshPanels || [],
    stalePanels: result.stalePanels || [],
    missingPanels: result.missingPanels || [],
    missingAssets: result.missingAssets || [],
    staleAssets: result.staleAssets || [],
    artifactFreshness: result.artifactFreshness || null,
    technicalPanelGate: result.technicalPanelGate || null,
    technicalPanelReadinessState:
      result.technicalPanelGate?.technicalPanelReadinessState || "pass",
    technicalPanelScores: result.technicalPanelScores || [],
    technicalQualityBlockers: result.technicalQualityBlockers || [],
    consistencyGuard: result.consistencyGuard || null,
    heroVsCanonicalWarnings:
      result.consistencyGuard?.heroVsCanonicalWarnings || [],
    fontReadiness: result.fontReadiness || null,
    finalSheetRegression: result.finalSheetRegression || null,
    finalSheetRegressionReadiness:
      result.finalSheetRegression?.status || "pass",
    finalSheetRegressionPhase,
    renderedTextZone:
      result.renderedTextZone ||
      result.finalSheetRegression?.renderedTextZone ||
      null,
    renderedTextZoneStatus:
      result.renderedTextZone?.status ||
      result.finalSheetRegression?.renderedTextZoneStatus ||
      "warning",
    renderedTextEvidenceQuality:
      result.finalSheetRegression?.renderedTextEvidenceQuality ||
      verificationBundle?.renderedTextEvidenceQuality ||
      "provisional",
    perSideElevationStatus:
      result.perSideElevationStatus ||
      result.finalSheetRegression?.perSideElevationStatus ||
      result.technicalPanelGate?.perSideElevationStatus ||
      {},
    sideFacadeEvidenceQuality:
      result.finalSheetRegression?.sideFacadeEvidenceQuality ||
      verificationBundle?.sideFacadeEvidenceQuality ||
      "provisional",
    sectionCandidateQuality:
      result.sectionCandidateQuality ||
      result.finalSheetRegression?.sectionCandidateQuality ||
      result.technicalPanelGate?.sectionCandidateQuality ||
      [],
    sectionEvidenceQuality:
      verificationBundle?.sectionEvidenceQuality ||
      result.finalSheetRegression?.sectionEvidenceQuality ||
      "provisional",
    sectionDirectEvidenceQuality:
      verificationBundle?.sectionDirectEvidenceQuality ||
      result.finalSheetRegression?.sectionDirectEvidenceQuality ||
      "provisional",
    sectionInferredEvidenceQuality:
      verificationBundle?.sectionInferredEvidenceQuality ||
      result.finalSheetRegression?.sectionInferredEvidenceQuality ||
      "provisional",
    sectionConstructionEvidenceQuality:
      verificationBundle?.sectionConstructionEvidenceQuality ||
      result.finalSheetRegression?.sectionConstructionEvidenceQuality ||
      "provisional",
    sectionConstructionTruthQuality:
      verificationBundle?.sectionConstructionTruthQuality ||
      result.finalSheetRegression?.sectionConstructionTruthQuality ||
      "provisional",
    wallSectionClipQuality:
      verificationBundle?.wallSectionClipQuality ||
      result.finalSheetRegression?.wallSectionClipQuality ||
      "provisional",
    openingSectionClipQuality:
      verificationBundle?.openingSectionClipQuality ||
      result.finalSheetRegression?.openingSectionClipQuality ||
      "provisional",
    stairSectionClipQuality:
      verificationBundle?.stairSectionClipQuality ||
      result.finalSheetRegression?.stairSectionClipQuality ||
      "provisional",
    slabSectionClipQuality:
      verificationBundle?.slabSectionClipQuality ||
      result.finalSheetRegression?.slabSectionClipQuality ||
      "provisional",
    roofSectionClipQuality:
      verificationBundle?.roofSectionClipQuality ||
      result.finalSheetRegression?.roofSectionClipQuality ||
      "provisional",
    foundationSectionClipQuality:
      verificationBundle?.foundationSectionClipQuality ||
      result.finalSheetRegression?.foundationSectionClipQuality ||
      "provisional",
    cutWallTruthQuality:
      verificationBundle?.cutWallTruthQuality ||
      result.finalSheetRegression?.cutWallTruthQuality ||
      "provisional",
    cutOpeningTruthQuality:
      verificationBundle?.cutOpeningTruthQuality ||
      result.finalSheetRegression?.cutOpeningTruthQuality ||
      "provisional",
    stairTruthQuality:
      verificationBundle?.stairTruthQuality ||
      result.finalSheetRegression?.stairTruthQuality ||
      "provisional",
    slabTruthQuality:
      verificationBundle?.slabTruthQuality ||
      result.finalSheetRegression?.slabTruthQuality ||
      "provisional",
    roofTruthQuality:
      verificationBundle?.roofTruthQuality ||
      result.finalSheetRegression?.roofTruthQuality ||
      "provisional",
    roofTruthMode:
      verificationBundle?.roofTruthMode ||
      result.finalSheetRegression?.roofTruthMode ||
      "missing",
    roofTruthState:
      verificationBundle?.roofTruthState ||
      result.finalSheetRegression?.roofTruthState ||
      "unsupported",
    foundationTruthQuality:
      verificationBundle?.foundationTruthQuality ||
      result.finalSheetRegression?.foundationTruthQuality ||
      "provisional",
    foundationTruthMode:
      verificationBundle?.foundationTruthMode ||
      result.finalSheetRegression?.foundationTruthMode ||
      "missing",
    foundationTruthState:
      verificationBundle?.foundationTruthState ||
      result.finalSheetRegression?.foundationTruthState ||
      "unsupported",
    sectionChosenRationale:
      verificationBundle?.sectionChosenRationale ||
      result.finalSheetRegression?.chosenSectionRationale ||
      null,
    technicalFragmentScores:
      result.technicalFragmentScores ||
      result.finalSheetRegression?.technicalFragmentScores ||
      result.technicalPanelGate?.technicalFragmentScores ||
      [],
    sectionStrategyRationale: (
      result.sectionCandidateQuality ||
      result.finalSheetRegression?.sectionCandidateQuality ||
      result.technicalPanelGate?.sectionCandidateQuality ||
      []
    ).map((entry) => ({
      sectionType: entry.sectionType,
      strategyId: entry.strategyId || null,
      strategyName: entry.strategyName || null,
      rationale: entry.rationale || [],
    })),
    technicalCredibility: result.technicalCredibility || null,
    technicalCredibilityPhase,
    publishability: result.publishability || null,
    publishabilityPhase,
    postComposeVerified: publishabilityPhase === "post_compose",
    verification,
    verificationBundle,
    verificationState: verificationBundle,
    composeBlockingReasons:
      result.composeBlockingReasons ||
      result.technicalPanelGate?.blockingReasons ||
      [],
    recoveryExecutionBridge: result.recoveryExecutionBridge || null,
    warnings,
    meta: buildResponseMeta("plan-a1-panels", featureFlags, ["geometry"]),
  };
}

export function validatePlanRegenerationRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  noteDeprecatedAlias(warnings, payload, "target_layer", "targetLayer");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    targetLayer: payload.targetLayer || payload.target_layer || null,
    drawings: isPlainObject(payload.drawings) ? payload.drawings : null,
    visualPackage: isPlainObject(payload.visualPackage)
      ? payload.visualPackage
      : null,
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    validationReport: isPlainObject(payload.validationReport)
      ? payload.validationReport
      : null,
    options: isPlainObject(payload.options) ? payload.options : {},
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (!normalized.targetLayer) {
    errors.push("targetLayer or target_layer is required.");
  }
  if (hasOwn(payload, "drawings") && !isPlainObject(payload.drawings)) {
    errors.push("drawings must be an object when provided.");
  }
  if (hasOwn(payload, "options") && !isPlainObject(payload.options)) {
    errors.push("options must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildPlanRegenerationResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  return {
    contractVersion: getPublicApiVersion("plan-regeneration"),
    success: true,
    targetLayer: result.targetLayer || null,
    minimumSafeScope: result.minimumSafeScope || null,
    impactedArtifacts: result.impactedArtifacts || null,
    impactedFragments: result.impactedFragments || null,
    impactedEntities: result.impactedEntities || [],
    plannedActions: result.plannedActions || [],
    executable: result.executable === true,
    warnings: uniqueStrings([...(warnings || []), ...(result.warnings || [])]),
    meta: buildResponseMeta("plan-regeneration", featureFlags, [
      "geometry",
      "target_layer",
    ]),
  };
}

export function validateProjectHealthRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    drawings: isPlainObject(payload.drawings) ? payload.drawings : null,
    visualPackage: isPlainObject(payload.visualPackage)
      ? payload.visualPackage
      : null,
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    validationReport: isPlainObject(payload.validationReport)
      ? payload.validationReport
      : null,
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

export function buildProjectHealthResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  const finalSheetRegressionPhase =
    result.finalSheetRegression?.verificationPhase ||
    result.readiness?.finalSheetRegression?.verificationPhase ||
    "pre_compose";
  const technicalCredibilityPhase =
    result.technicalCredibility?.verificationPhase ||
    result.readiness?.technicalCredibility?.verificationPhase ||
    finalSheetRegressionPhase;
  const publishabilityPhase =
    result.publishability?.verificationPhase ||
    result.readiness?.publishability?.verificationPhase ||
    technicalCredibilityPhase;
  const verificationState =
    result.verificationState ||
    result.verificationBundle ||
    result.readiness?.verificationState ||
    result.readiness?.verificationBundle ||
    buildA1VerificationStateBundle({
      renderedTextZone:
        result.renderedTextZone ||
        result.finalSheetRegression?.renderedTextZone ||
        result.readiness?.finalSheetRegression?.renderedTextZone ||
        null,
      finalSheetRegression:
        result.finalSheetRegression ||
        result.readiness?.finalSheetRegression ||
        null,
      technicalCredibility:
        result.technicalCredibility ||
        result.readiness?.technicalCredibility ||
        null,
      publishability:
        result.publishability || result.readiness?.publishability || null,
    });
  const verification = resolveCanonicalVerification(
    result,
    result.readiness || null,
  );
  const verificationBundle = alignVerificationBundle(
    verificationState,
    verification,
  );

  return {
    contractVersion: getPublicApiVersion("project-health"),
    success: true,
    healthStatus: result.healthStatus || "blocked",
    readiness: result.readiness || null,
    recoveryPlan: result.recoveryPlan || null,
    rollbackPlan: result.rollbackPlan || null,
    technicalPanelHealth: result.technicalPanelHealth || null,
    technicalPackageStrength: result.technicalPackageStrength || null,
    consistencyGuard: result.consistencyGuard || null,
    heroVsCanonicalWarnings:
      result.consistencyGuard?.heroVsCanonicalWarnings || [],
    fontReadiness: result.fontReadiness || null,
    finalSheetRegression: result.finalSheetRegression || null,
    finalSheetRegressionReadiness:
      result.finalSheetRegression?.status || "pass",
    finalSheetRegressionPhase,
    renderedTextZone:
      result.renderedTextZone ||
      result.finalSheetRegression?.renderedTextZone ||
      result.readiness?.finalSheetRegression?.renderedTextZone ||
      null,
    renderedTextZoneStatus:
      result.renderedTextZone?.status ||
      result.finalSheetRegression?.renderedTextZoneStatus ||
      result.readiness?.finalSheetRegression?.renderedTextZoneStatus ||
      "warning",
    renderedTextEvidenceQuality:
      result.finalSheetRegression?.renderedTextEvidenceQuality ||
      result.readiness?.finalSheetRegression?.renderedTextEvidenceQuality ||
      verificationBundle?.renderedTextEvidenceQuality ||
      "provisional",
    perSideElevationStatus:
      result.finalSheetRegression?.perSideElevationStatus ||
      result.readiness?.finalSheetRegression?.perSideElevationStatus ||
      {},
    sideFacadeEvidenceQuality:
      result.finalSheetRegression?.sideFacadeEvidenceQuality ||
      result.readiness?.finalSheetRegression?.sideFacadeEvidenceQuality ||
      verificationBundle?.sideFacadeEvidenceQuality ||
      "provisional",
    sectionCandidateQuality:
      result.finalSheetRegression?.sectionCandidateQuality ||
      result.readiness?.finalSheetRegression?.sectionCandidateQuality ||
      [],
    sectionEvidenceQuality:
      verificationBundle?.sectionEvidenceQuality ||
      result.finalSheetRegression?.sectionEvidenceQuality ||
      result.readiness?.finalSheetRegression?.sectionEvidenceQuality ||
      "provisional",
    sectionDirectEvidenceQuality:
      verificationBundle?.sectionDirectEvidenceQuality ||
      result.finalSheetRegression?.sectionDirectEvidenceQuality ||
      result.readiness?.finalSheetRegression?.sectionDirectEvidenceQuality ||
      "provisional",
    sectionInferredEvidenceQuality:
      verificationBundle?.sectionInferredEvidenceQuality ||
      result.finalSheetRegression?.sectionInferredEvidenceQuality ||
      result.readiness?.finalSheetRegression?.sectionInferredEvidenceQuality ||
      "provisional",
    sectionConstructionEvidenceQuality:
      verificationBundle?.sectionConstructionEvidenceQuality ||
      result.finalSheetRegression?.sectionConstructionEvidenceQuality ||
      result.readiness?.finalSheetRegression
        ?.sectionConstructionEvidenceQuality ||
      "provisional",
    sectionConstructionTruthQuality:
      verificationBundle?.sectionConstructionTruthQuality ||
      result.finalSheetRegression?.sectionConstructionTruthQuality ||
      result.readiness?.finalSheetRegression?.sectionConstructionTruthQuality ||
      "provisional",
    wallSectionClipQuality:
      verificationBundle?.wallSectionClipQuality ||
      result.finalSheetRegression?.wallSectionClipQuality ||
      result.readiness?.finalSheetRegression?.wallSectionClipQuality ||
      "provisional",
    openingSectionClipQuality:
      verificationBundle?.openingSectionClipQuality ||
      result.finalSheetRegression?.openingSectionClipQuality ||
      result.readiness?.finalSheetRegression?.openingSectionClipQuality ||
      "provisional",
    stairSectionClipQuality:
      verificationBundle?.stairSectionClipQuality ||
      result.finalSheetRegression?.stairSectionClipQuality ||
      result.readiness?.finalSheetRegression?.stairSectionClipQuality ||
      "provisional",
    slabSectionClipQuality:
      verificationBundle?.slabSectionClipQuality ||
      result.finalSheetRegression?.slabSectionClipQuality ||
      result.readiness?.finalSheetRegression?.slabSectionClipQuality ||
      "provisional",
    roofSectionClipQuality:
      verificationBundle?.roofSectionClipQuality ||
      result.finalSheetRegression?.roofSectionClipQuality ||
      result.readiness?.finalSheetRegression?.roofSectionClipQuality ||
      "provisional",
    foundationSectionClipQuality:
      verificationBundle?.foundationSectionClipQuality ||
      result.finalSheetRegression?.foundationSectionClipQuality ||
      result.readiness?.finalSheetRegression?.foundationSectionClipQuality ||
      "provisional",
    cutWallTruthQuality:
      verificationBundle?.cutWallTruthQuality ||
      result.finalSheetRegression?.cutWallTruthQuality ||
      result.readiness?.finalSheetRegression?.cutWallTruthQuality ||
      "provisional",
    cutOpeningTruthQuality:
      verificationBundle?.cutOpeningTruthQuality ||
      result.finalSheetRegression?.cutOpeningTruthQuality ||
      result.readiness?.finalSheetRegression?.cutOpeningTruthQuality ||
      "provisional",
    stairTruthQuality:
      verificationBundle?.stairTruthQuality ||
      result.finalSheetRegression?.stairTruthQuality ||
      result.readiness?.finalSheetRegression?.stairTruthQuality ||
      "provisional",
    slabTruthQuality:
      verificationBundle?.slabTruthQuality ||
      result.finalSheetRegression?.slabTruthQuality ||
      result.readiness?.finalSheetRegression?.slabTruthQuality ||
      "provisional",
    roofTruthQuality:
      verificationBundle?.roofTruthQuality ||
      result.finalSheetRegression?.roofTruthQuality ||
      result.readiness?.finalSheetRegression?.roofTruthQuality ||
      "provisional",
    roofTruthMode:
      verificationBundle?.roofTruthMode ||
      result.finalSheetRegression?.roofTruthMode ||
      result.readiness?.finalSheetRegression?.roofTruthMode ||
      "missing",
    roofTruthState:
      verificationBundle?.roofTruthState ||
      result.finalSheetRegression?.roofTruthState ||
      result.readiness?.finalSheetRegression?.roofTruthState ||
      "unsupported",
    foundationTruthQuality:
      verificationBundle?.foundationTruthQuality ||
      result.finalSheetRegression?.foundationTruthQuality ||
      result.readiness?.finalSheetRegression?.foundationTruthQuality ||
      "provisional",
    foundationTruthMode:
      verificationBundle?.foundationTruthMode ||
      result.finalSheetRegression?.foundationTruthMode ||
      result.readiness?.finalSheetRegression?.foundationTruthMode ||
      "missing",
    foundationTruthState:
      verificationBundle?.foundationTruthState ||
      result.finalSheetRegression?.foundationTruthState ||
      result.readiness?.finalSheetRegression?.foundationTruthState ||
      "unsupported",
    sectionChosenRationale:
      verificationBundle?.sectionChosenRationale ||
      result.finalSheetRegression?.chosenSectionRationale ||
      result.readiness?.finalSheetRegression?.chosenSectionRationale ||
      null,
    technicalFragmentScores:
      result.finalSheetRegression?.technicalFragmentScores ||
      result.readiness?.finalSheetRegression?.technicalFragmentScores ||
      [],
    sectionStrategyRationale: (
      result.finalSheetRegression?.sectionCandidateQuality ||
      result.readiness?.finalSheetRegression?.sectionCandidateQuality ||
      []
    ).map((entry) => ({
      sectionType: entry.sectionType,
      strategyId: entry.strategyId || null,
      strategyName: entry.strategyName || null,
      rationale: entry.rationale || [],
    })),
    technicalCredibility:
      result.technicalCredibility ||
      result.readiness?.technicalCredibility ||
      null,
    technicalCredibilityPhase,
    publishability:
      result.publishability || result.readiness?.publishability || null,
    publishabilityPhase,
    postComposeVerified: publishabilityPhase === "post_compose",
    verification,
    verificationBundle,
    verificationState: verificationBundle,
    remainingBlockers: result.remainingBlockers || [],
    recoveryExecutionBridge: result.recoveryExecutionBridge || null,
    warnings,
    meta: buildResponseMeta("project-health", featureFlags, ["geometry"]),
  };
}

export function buildValidateProjectResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  return {
    contractVersion: getPublicApiVersion("validate-project"),
    success: true,
    status: result.status || "invalid",
    valid: result.valid === true,
    validationReport: result,
    warnings: uniqueStrings([...(warnings || []), ...(result.warnings || [])]),
    errors: result.errors || [],
    repairSuggestions: result.repairSuggestions || [],
    affectedEntities: result.affectedEntities || [],
    meta: buildResponseMeta("validate-project", featureFlags, [
      "geometry",
      "types",
      "previous_geometry",
      "target_layer",
    ]),
  };
}

export function buildRepairProjectResponse({
  result,
  validationReportBefore = null,
  validationReportAfter = null,
  warnings = [],
  featureFlags = [],
}) {
  return {
    contractVersion: getPublicApiVersion("repair-project"),
    success: true,
    status:
      validationReportAfter?.status ||
      (result.selectedCandidate ? "repaired" : "unchanged"),
    repairedProjectGeometry: result.repairedProjectGeometry || null,
    selectedRepair: result.selectedCandidate
      ? {
          candidateId: result.selectedCandidate.candidateId,
          strategyPath: result.selectedCandidate.strategyPath || [],
          score: result.selectedCandidate.evaluation?.score || 0,
          explanation: result.selectedCandidate.explanation || [],
        }
      : null,
    repairCandidates: (result.candidates || []).map((candidate) => ({
      candidateId: candidate.candidateId,
      strategyPath: candidate.strategyPath || [],
      score: candidate.evaluation?.score || 0,
      errorCount: candidate.evaluation?.validation?.errorCount || 0,
      warningCount: candidate.evaluation?.validation?.warningCount || 0,
      explanation: candidate.explanation || [],
    })),
    explanations: result.explanations || [],
    chosenPath: result.chosenPath || [],
    searchPlan: result.searchPlan || null,
    executableRepairOptions: result.executableRepairOptions || [],
    validationReportBefore,
    validationReportAfter,
    warnings,
    meta: buildResponseMeta("repair-project", featureFlags, ["geometry"]),
  };
}

export function validateExecuteRegenerationRequest(payload = {}) {
  const warnings = [];
  noteDeprecatedAlias(warnings, payload, "geometry", "projectGeometry");
  noteDeprecatedAlias(warnings, payload, "target_layer", "targetLayer");
  const normalized = {
    projectGeometry: payload.projectGeometry || payload.geometry || null,
    approvedPlan: isPlainObject(payload.approvedPlan)
      ? payload.approvedPlan
      : null,
    targetLayer:
      payload.targetLayer ||
      payload.target_layer ||
      payload.approvedPlan?.targetLayer ||
      null,
    drawings: isPlainObject(payload.drawings) ? payload.drawings : null,
    visualPackage: isPlainObject(payload.visualPackage)
      ? payload.visualPackage
      : null,
    facadeGrammar: isPlainObject(payload.facadeGrammar)
      ? payload.facadeGrammar
      : null,
    validationReport: isPlainObject(payload.validationReport)
      ? payload.validationReport
      : null,
    styleDNA: isPlainObject(payload.styleDNA) ? payload.styleDNA : {},
    options: isPlainObject(payload.options) ? payload.options : {},
  };
  const errors = [];
  if (!normalized.projectGeometry) {
    errors.push("projectGeometry or geometry is required.");
  }
  if (!normalized.approvedPlan && !normalized.targetLayer) {
    errors.push("approvedPlan or targetLayer is required.");
  }
  if (normalized.approvedPlan) {
    const scope = normalized.approvedPlan.minimumSafeScope;
    if (!isPlainObject(scope)) {
      errors.push("approvedPlan.minimumSafeScope must be an object.");
    } else {
      [
        "geometryFragments",
        "drawingFragments",
        "facadeFragments",
        "visualFragments",
        "panelFragments",
        "readinessFragments",
      ].forEach((key) => {
        if (hasOwn(scope, key) && !isStringArray(scope[key])) {
          errors.push(
            `approvedPlan.minimumSafeScope.${key} must be an array of strings.`,
          );
        }
      });
      const actionableCount = [
        "geometryFragments",
        "drawingFragments",
        "facadeFragments",
        "visualFragments",
        "panelFragments",
        "readinessFragments",
      ].reduce(
        (total, key) =>
          total + (Array.isArray(scope[key]) ? scope[key].length : 0),
        0,
      );
      if (actionableCount === 0) {
        errors.push(
          "approvedPlan.minimumSafeScope must contain at least one fragment id.",
        );
      }
    }
    if (
      normalized.approvedPlan.geometrySignature &&
      normalized.projectGeometry &&
      normalized.approvedPlan.geometrySignature !==
        geometrySignature(normalized.projectGeometry)
    ) {
      errors.push(
        "approvedPlan.geometrySignature does not match the supplied projectGeometry.",
      );
    }
  }
  if (hasOwn(payload, "drawings") && !isPlainObject(payload.drawings)) {
    errors.push("drawings must be an object when provided.");
  }
  if (hasOwn(payload, "styleDNA") && !isPlainObject(payload.styleDNA)) {
    errors.push("styleDNA must be an object when provided.");
  }
  if (hasOwn(payload, "options") && !isPlainObject(payload.options)) {
    errors.push("options must be an object when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function buildExecuteRegenerationResponse({
  result,
  warnings = [],
  featureFlags = [],
}) {
  return {
    contractVersion: getPublicApiVersion("execute-regeneration"),
    success: true,
    approvedPlan: result.approvedPlan || null,
    executedActions: result.executedActions || [],
    projectGeometry: result.projectGeometry || null,
    drawings: result.drawings || null,
    facadeGrammar: result.facadeGrammar || null,
    visualPackage: result.visualPackage || null,
    a1Readiness: result.a1Readiness || null,
    artifactStore: result.artifactStore || null,
    artifactFreshness: result.artifactFreshness || null,
    beforeSnapshot: result.beforeSnapshot || null,
    afterSnapshot: result.afterSnapshot || null,
    snapshotDiff: result.snapshotDiff || null,
    freshnessUpdates: result.freshnessUpdates || null,
    warnings: [...warnings, ...(result.executionWarnings || [])],
    meta: buildResponseMeta("execute-regeneration", featureFlags, [
      "geometry",
      "target_layer",
    ]),
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
  PHASE4_PUBLIC_API_VERSION,
  PHASE5_PUBLIC_API_VERSION,
  validateGenerateStyleRequest,
  buildGenerateStyleResponse,
  validateGenerateFloorplanRequest,
  buildGenerateFloorplanResponse,
  validateGenerateDrawingsRequest,
  buildGenerateDrawingsResponse,
  validateValidateProjectRequest,
  validateRepairProjectRequest,
  buildValidateProjectResponse,
  buildRepairProjectResponse,
  validateGenerateProjectRequest,
  buildGenerateProjectResponse,
  validateRegenerateLayerRequest,
  buildRegenerateLayerResponse,
  validateGenerateFacadeRequest,
  buildGenerateFacadeResponse,
  validateGenerateVisualPackageRequest,
  buildGenerateVisualPackageResponse,
  validateProjectReadinessRequest,
  buildProjectReadinessResponse,
  validatePlanA1PanelsRequest,
  buildPlanA1PanelsResponse,
  validatePlanRegenerationRequest,
  buildPlanRegenerationResponse,
  validateExecuteRegenerationRequest,
  buildExecuteRegenerationResponse,
  validateProjectHealthRequest,
  buildProjectHealthResponse,
  validateSearchPrecedentsRequest,
  buildSearchPrecedentsResponse,
  buildModelStatusResponse,
};
