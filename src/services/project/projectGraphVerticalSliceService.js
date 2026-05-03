import {
  polygonToLocalXY,
  computeCentroid as computeGeoCentroid,
} from "../../utils/geometry.js";
import { PDFDocument } from "pdf-lib";
import {
  CANONICAL_PROJECT_GEOMETRY_VERSION,
  buildBoundingBoxFromPolygon,
  computePolygonArea,
  createStableId,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { buildCompiledProjectTechnicalPanels } from "../canonical/compiledProjectTechnicalPackBuilder.js";
import { compileProject } from "../compiler/index.js";
import { ensureCompiledProjectRenderInputs } from "../compiler/compiledProjectRenderInputs.js";
import { resolveArchitectureModelRegistry } from "../modelStepResolver.js";
import openaiEnv from "../openaiProviderEnv.cjs";
import {
  executeProjectGraphReasoningSteps,
  getBlockedOpenAIReasoningCalls,
} from "../openaiReasoningExecutor.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";
import {
  rasteriseSheetArtifact,
  isRasterStubModeAllowed,
} from "../render/svgRasteriser.js";
import {
  buildVectorPdfFromSheetSvg,
  VECTOR_PDF_RENDER_MODE,
  VECTOR_PDF_SCHEMA_VERSION,
} from "../render/buildVectorPdfFromSheetSvg.js";
import {
  buildVisualManifest,
  buildVisualIdentityLockBlock,
} from "../render/visualManifestService.js";
import {
  evaluateVisualIdentity,
  VISUAL_MANIFEST_VALIDATOR_VERSION,
} from "../render/visualManifestValidator.js";
import {
  buildSheetDesignContext,
  assertSheetDesignContext,
  SHEET_DESIGN_CONTEXT_VERSION,
} from "../dnaPromptContext.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { getSiteSnapshotWithMetadata } from "../siteMapSnapshotService.js";
import { computeSunPath } from "../climate/sunPath.js";
import { listSourceDocumentsForParts } from "../regulation/sourceRegistry.js";
import {
  resolveJurisdiction,
  getApplicablePartsFor,
  jurisdictionLimitations,
} from "../regulation/jurisdictionRouter.js";
import {
  runRegulationRules,
  summarizeRuleResults,
} from "../regulation/runRules.js";
import { buildLocalStylePackV2 } from "../style/localStylePack.js";
import { generateRectangularOptions } from "../design/optionGenerator.js";
import { scoreOption, selectBestOption } from "../design/optionScorer.js";
import { runWithRepair } from "../design/repairLoop.js";
import { detectConflicts } from "../design/constraintPriority.js";
import { enrichSiteContext } from "../context/contextAggregator.js";
import { decideSheetSplit } from "../sheet/sheetSplitter.js";
import {
  EMBEDDED_FONT_STACK,
  FINAL_SHEET_MIN_FONT_SIZE_PX,
  prepareFinalSheetSvgForRasterizationWithReport,
} from "../../utils/svgFontEmbedder.js";
import {
  sanitizeInvalidSvgPaths,
  sanitizeSvgDataUrl,
  svgToSanitizedDataUrl,
} from "../../utils/svgPathSanitizer.js";
import {
  detectA1GlyphIntegrity,
  detectA1RasterGlyphIntegrity,
  evaluateFinalA1ExportGate,
  resolveA1RenderContract,
} from "../a1/a1FinalExportContract.js";
import {
  buildMaterialPaletteCards,
  normalizeMaterialPaletteEntries as normalizeMaterialPaletteEntriesShared,
  topUpMaterialPaletteWithCanonical,
} from "../a1/materialTexturePatterns.js";
import {
  buildClimateRenderContext,
  buildStyleRenderContext,
  buildProgrammeRenderContext,
  buildReasoningChainBlock,
} from "../a1/panelPromptBuilders.js";
import { renderProjectGraphPanelImage } from "../render/projectGraphImageRenderer.js";
import { analyseRenderedTextProof } from "../render/renderedTextProof.js";
import {
  LEVEL_NAME_TO_INDEX as CANONICAL_LEVEL_NAME_TO_INDEX,
  LEVEL_ROOF_SENTINEL,
  levelIndexFromLabel,
  levelName as canonicalLevelName,
} from "./levelUtils.js";
import { runProgramPreflight } from "./programPreflight.js";
import { resolveAuthoritativeFloorCount } from "./floorCountAuthority.js";
import {
  buildProjectTypeSupportMetadata,
  getProjectTypeSupport,
} from "./projectTypeSupportRegistry.js";
import { resolveMainEntryDirection } from "../site/mainEntryDirectionService.js";

export const PROJECT_GRAPH_SCHEMA_VERSION = "project-graph-v1";
export const PROJECT_GRAPH_VERTICAL_SLICE_VERSION =
  "project-graph-vertical-slice-v1";

const PROFESSIONAL_REVIEW_DISCLAIMER =
  "AI-generated early-stage architecture package. Regulation checks are preliminary design flags and require professional review.";
const A1_SHEET_LAYOUT_VERSION = "projectgraph-a1-reference-board-v1";
const A1_SHEET_SIZE_MM = { width: 841, height: 594 };
const MAX_TARGET_STOREYS = Math.max(
  1,
  Number.parseInt(process.env.MAX_TARGET_STOREYS, 10) || 8,
);
const REQUIRED_A1_PANEL_TYPES_BASE = [
  "floor_plan_ground",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
  "site_context",
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
  "material_palette",
  "key_notes",
  "title_block",
];
const REQUIRED_3D_A1_PANEL_TYPES = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];
const REQUIRED_A1_TEXT_PROOF_LABELS = [
  "SITE PLAN",
  "GROUND FLOOR PLAN",
  "FIRST FLOOR PLAN",
  "MATERIAL PALETTE",
  "KEY NOTES",
  "Drawing No.",
];
const TECHNICAL_A1_PANEL_TYPES_BASE = [
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
];

export function buildRequiredA1PanelTypes(
  targetStoreys = 1,
  layoutTemplate = "board-v2",
) {
  const dynamicFloorPlans = floorPlanPanelTypes(targetStoreys).filter(
    (type) => type !== "floor_plan_ground",
  );
  const basePanelTypes =
    layoutTemplate === "presentation-v3"
      ? REQUIRED_A1_PANEL_TYPES_BASE.filter(
          (panelType) => panelType !== "exterior_render",
        )
      : REQUIRED_A1_PANEL_TYPES_BASE;
  return [...basePanelTypes, ...dynamicFloorPlans];
}

function buildTechnicalA1PanelTypes(targetStoreys = 1) {
  return [
    ...floorPlanPanelTypes(targetStoreys),
    ...TECHNICAL_A1_PANEL_TYPES_BASE,
  ];
}

const REQUIRED_A1_PANEL_TYPES = REQUIRED_A1_PANEL_TYPES_BASE;
const TECHNICAL_A1_PANEL_TYPES = [
  "floor_plan_ground",
  "floor_plan_first",
  ...TECHNICAL_A1_PANEL_TYPES_BASE,
];
const MIN_RENDERED_SHEET_INK_RATIO = 0.015;
const MIN_TECHNICAL_SVG_LENGTH = 800;
const MIN_TECHNICAL_CONTENT_OCCUPANCY_RATIO = 0.08;
const MIN_TECHNICAL_CONTENT_WIDTH_RATIO = 0.22;
const MIN_TECHNICAL_CONTENT_HEIGHT_RATIO = 0.14;
const MIN_3D_PRIMITIVE_COUNT = 5;
const REFERENCE_MATCH_PLAN_MIN_SLOT_OCCUPANCY = 0.22;
const REFERENCE_MATCH_SECTION_MIN_SLOT_OCCUPANCY = 0.12;
const REFERENCE_MATCH_ELEVATION_MIN_SLOT_OCCUPANCY = 0.08;
const REFERENCE_MATCH_MIN_SECTION_USEFULNESS = 0.45;
const REFERENCE_MATCH_MIN_ELEVATION_RICHNESS = 0.18;

function isTruthyFlag(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  return [
    "1",
    "true",
    "yes",
    "on",
    "reference_match",
    "reference-match",
  ].includes(String(value).trim().toLowerCase());
}

function isReferenceMatchRequested(input = {}, sourceBrief = {}) {
  return (
    isTruthyFlag(input.referenceMatch) ||
    isTruthyFlag(input.reference_match) ||
    isTruthyFlag(input.a1ReferenceMatch) ||
    isTruthyFlag(input.finalA1ReferenceMatch) ||
    isTruthyFlag(sourceBrief.referenceMatch) ||
    isTruthyFlag(sourceBrief.reference_match) ||
    String(input.renderIntent || sourceBrief.renderIntent || "")
      .trim()
      .toLowerCase() === "reference_match_a1" ||
    String(input.qualityTarget || sourceBrief.qualityTarget || "")
      .trim()
      .toLowerCase() === "reference_match"
  );
}

function hasLockedFloorAuthority(projectDetails = {}) {
  return (
    Boolean(projectDetails.floorCountLocked) &&
    Number(
      projectDetails.floorCount ??
        projectDetails.floors ??
        projectDetails.targetStoreys,
    ) > 0
  );
}

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function slugify(value) {
  return String(value || "project")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined && entry !== null);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const KNOWN_BUILDING_TYPES = Object.freeze([
  "dwelling",
  "multi_residential",
  "mixed_use",
  "community",
  "office_studio",
  "education_studio",
  "clinic",
  "hospital",
  "hospitality_hotel",
  "hospitality_resort",
  "hospitality_guest_house",
  "industrial_warehouse",
  "industrial_manufacturing",
  "industrial_workshop",
  "cultural_museum",
  "cultural_library",
  "cultural_theatre",
  "government_town_hall",
  "government_police_station",
  "government_fire_station",
  "religious_mosque",
  "religious_church",
  "religious_temple",
  "recreation_sports_center",
  "recreation_gym",
  "recreation_pool",
]);

const DWELLING_SYNONYMS = [
  "detached-house",
  "semi-detached-house",
  "terraced-house",
  "villa",
  "cottage",
  "dwelling",
  "residential",
  "house",
];

const PROJECT_GRAPH_BUILDING_TYPE_ALIASES = Object.freeze({
  "hospitality-hotel": "hospitality_hotel",
  hotel: "hospitality_hotel",
  "hospitality-resort": "hospitality_resort",
  resort: "hospitality_resort",
  "hospitality-guest-house": "hospitality_guest_house",
  "guest-house": "hospitality_guest_house",
  guesthouse: "hospitality_guest_house",
  "industrial-warehouse": "industrial_warehouse",
  warehouse: "industrial_warehouse",
  "industrial-manufacturing": "industrial_manufacturing",
  manufacturing: "industrial_manufacturing",
  factory: "industrial_manufacturing",
  "industrial-workshop": "industrial_workshop",
  workshop: "industrial_workshop",
  "cultural-museum": "cultural_museum",
  museum: "cultural_museum",
  "cultural-library": "cultural_library",
  library: "cultural_library",
  "cultural-theatre": "cultural_theatre",
  theatre: "cultural_theatre",
  theater: "cultural_theatre",
  "government-town-hall": "government_town_hall",
  "town-hall": "government_town_hall",
  "civic-hall": "government_town_hall",
  "government-police-station": "government_police_station",
  "police-station": "government_police_station",
  police: "government_police_station",
  "government-fire-station": "government_fire_station",
  "fire-station": "government_fire_station",
  "fire-service": "government_fire_station",
  "religious-mosque": "religious_mosque",
  mosque: "religious_mosque",
  "religious-church": "religious_church",
  church: "religious_church",
  "religious-temple": "religious_temple",
  temple: "religious_temple",
  "recreation-sports-center": "recreation_sports_center",
  "recreation-sports-centre": "recreation_sports_center",
  "sports-center": "recreation_sports_center",
  "sports-centre": "recreation_sports_center",
  "leisure-center": "recreation_sports_center",
  "leisure-centre": "recreation_sports_center",
  "recreation-gym": "recreation_gym",
  gym: "recreation_gym",
  fitness: "recreation_gym",
  "fitness-centre": "recreation_gym",
  "fitness-center": "recreation_gym",
  "recreation-pool": "recreation_pool",
  pool: "recreation_pool",
  "swimming-pool": "recreation_pool",
});

function normalizeBuildingType(input = {}) {
  const raw = String(
    input.canonical_building_type ||
      input.canonicalBuildingType ||
      input.project_type_support?.canonicalBuildingType ||
      input.projectTypeSupport?.canonicalBuildingType ||
      input.building_type ||
      input.buildingType ||
      input.subType ||
      input.buildingSubType ||
      input.program ||
      input.projectType ||
      input.category ||
      "dwelling",
  )
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (DWELLING_SYNONYMS.includes(raw)) {
    return "dwelling";
  }
  if (PROJECT_GRAPH_BUILDING_TYPE_ALIASES[raw]) {
    return PROJECT_GRAPH_BUILDING_TYPE_ALIASES[raw];
  }
  if (raw.includes("mixed")) {
    return "mixed_use";
  }
  if (
    raw.startsWith("multi") &&
    (raw.includes("residen") ||
      raw.includes("dwell") ||
      raw.includes("family") ||
      raw.includes("unit"))
  ) {
    return "multi_residential";
  }
  if (
    raw.includes("apartment") ||
    raw.includes("flats") ||
    raw === "block-of-flats" ||
    raw === "tenement"
  ) {
    return "multi_residential";
  }
  if (
    raw.includes("hospital") ||
    raw.includes("inpatient") ||
    raw.includes("ward")
  ) {
    return "hospital";
  }
  if (
    raw.includes("clinic") ||
    raw.includes("medical") ||
    raw.includes("healthcare") ||
    raw.includes("health-center") ||
    raw.includes("health-centre")
  ) {
    return "clinic";
  }
  if (
    raw.includes("community") ||
    raw.includes("library") ||
    raw.includes("hall") ||
    raw === "civic"
  ) {
    return "community";
  }
  if (
    raw.includes("education") ||
    raw.includes("school") ||
    raw.includes("workshop") ||
    raw.includes("learn") ||
    raw.includes("classroom") ||
    raw === "education-studio" ||
    raw === "education_studio"
  ) {
    return "education_studio";
  }
  if (
    raw.includes("office") ||
    raw.includes("studio") ||
    raw.includes("workplace") ||
    raw === "co-working" ||
    raw === "coworking"
  ) {
    return "office_studio";
  }
  return raw || "other";
}

// Local alias around the canonical levelUtils helper. Kept as a named
// function so existing references inside this file remain readable and the
// import surface is small.
function levelName(index) {
  return canonicalLevelName(index);
}

// Condense the compiled programme into the structure that
// panelPromptBuilders.buildProgrammeRenderContext expects: room counts per
// named level, level areas, total area, target storeys. Used by Phase 4
// image-gen prompts so renders reflect the actual programme.
function buildProgrammeSummaryForRender(brief = {}, programme = null) {
  if (!programme || typeof programme !== "object") return null;
  const spaces = Array.isArray(programme.spaces) ? programme.spaces : [];
  if (spaces.length === 0) return null;
  const targetStoreys = Math.max(1, Number(brief.target_storeys || 1));
  const totalArea = spaces.reduce(
    (sum, sp) => sum + Math.max(0, Number(sp.target_area_m2 || sp.area || 0)),
    0,
  );
  const roomsPerLevel = {};
  const levelAreas = {};
  for (const sp of spaces) {
    const idx = Math.max(
      0,
      Math.min(targetStoreys - 1, Number(sp.target_level_index ?? 0)),
    );
    const label = levelName(idx);
    if (!roomsPerLevel[label]) roomsPerLevel[label] = [];
    if (sp.name) roomsPerLevel[label].push(sp.name);
    levelAreas[label] =
      (levelAreas[label] || 0) +
      Math.max(0, Number(sp.target_area_m2 || sp.area || 0));
  }
  return {
    total_area_m2: Math.round(totalArea),
    target_storeys: targetStoreys,
    building_type: resolveProgrammeDisplayLabel(brief) || "building",
    rooms_per_level: roomsPerLevel,
    level_areas: levelAreas,
  };
}

// Backwards-compatible alias around the canonical lookup table in
// levelUtils.js. Kept named LEVEL_NAME_TO_INDEX so older imports inside
// this module (and any historical readers) keep working.
const LEVEL_NAME_TO_INDEX = CANONICAL_LEVEL_NAME_TO_INDEX;

// Resolve a programme space's target level to a 0-based numeric index.
// Honour explicit numeric levelIndex first, then the human-readable
// `level` / `target_level` string from the programme schedule UI, then
// fall back to ground only as a last resort. Memory rule
// (feedback_floor_count_autodetect): manual selection must propagate
// end-to-end without silent caps.
export function resolveLevelIndex(space, maxLevelIndex) {
  const safeMax = Math.max(0, Number(maxLevelIndex) || 0);
  const numericCandidate = Number.parseInt(
    space?.levelIndex ?? space?.level_index ?? space?.target_level_index,
    10,
  );
  if (Number.isFinite(numericCandidate)) {
    return Math.max(0, Math.min(safeMax, numericCandidate));
  }
  const rawLabel = space?.level ?? space?.target_level;
  if (rawLabel === null || rawLabel === undefined || rawLabel === "") {
    return 0;
  }
  const raw = String(rawLabel).trim().toLowerCase();
  if (!raw) return 0;
  if (Object.prototype.hasOwnProperty.call(LEVEL_NAME_TO_INDEX, raw)) {
    const idx = LEVEL_NAME_TO_INDEX[raw];
    const resolved = idx === LEVEL_ROOF_SENTINEL ? safeMax : idx;
    return Math.max(0, Math.min(safeMax, resolved));
  }
  // Tolerate "Level 2" / "level-3" style strings via the canonical parser
  // but only when they describe a known numeric level. Unknown labels
  // (e.g. "garage") still fall back to Ground.
  const parsed = levelIndexFromLabel(raw);
  if (parsed > 0 || /^(?:level\s*-?\d+|-?\d+)$/.test(raw)) {
    return Math.max(0, Math.min(safeMax, parsed));
  }
  return 0;
}

function levelOrdinalSlug(index) {
  if (index === 0) return "ground";
  if (index === 1) return "first";
  return `level${index}`;
}

function floorPlanPanelType(levelIndex) {
  return `floor_plan_${levelOrdinalSlug(levelIndex)}`;
}

function floorPlanPanelTypes(targetStoreys = 1) {
  const count = Math.max(1, Number(targetStoreys) || 1);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(floorPlanPanelType(i));
  }
  return result;
}

// QA helper: confirms every required level has at least one programme space.
// Catches the "programme collapsed to Ground" regression at the
// ProjectGraph layer, in case anything bypasses the UI/service preflight
// (e.g. legacy callers, integration tests, or future programmes built
// without input spaces).
function validateProgrammeLevels(programme, targetStoreys) {
  const issues = [];
  const count = Math.max(1, Number(targetStoreys) || 1);
  const spaces = Array.isArray(programme?.spaces) ? programme.spaces : [];
  for (let index = 0; index < count; index += 1) {
    const hasSpace = spaces.some(
      (space) => Number(space?.target_level_index) === index,
    );
    if (!hasSpace) {
      issues.push({
        severity: "error",
        code: "programme_level_empty",
        levelIndex: index,
        message: `${canonicalLevelName(index)} floor has no programme spaces.`,
      });
    }
  }
  return issues;
}

// QA helper: ensures the compiled project's geometric levels match the
// programme's target storey count. A mismatch usually means buildProgramme
// truncated something - we want a hard error rather than a quietly
// short A1 sheet.
function validateCompiledProjectLevels(compiledProject, targetStoreys) {
  const issues = [];
  const count = Math.max(1, Number(targetStoreys) || 1);
  const levels = Array.isArray(compiledProject?.levels)
    ? compiledProject.levels
    : [];
  if (levels.length !== count) {
    issues.push({
      severity: "error",
      code: "compiled_level_count_mismatch",
      message: `Compiled project has ${levels.length} levels but ${count} were requested.`,
    });
  }
  const rooms = Array.isArray(compiledProject?.rooms)
    ? compiledProject.rooms
    : [];
  for (let index = 0; index < count; index += 1) {
    const expectedId = `level-${index}`;
    const hasRoom = rooms.some((room) => {
      const roomLevelId =
        room?.levelId || room?.level_id || room?.actual_level_id;
      const roomLevelIndex = Number(
        room?.target_level_index ?? room?.levelIndex ?? room?.level_index,
      );
      return roomLevelId === expectedId || roomLevelIndex === index;
    });
    if (!hasRoom) {
      issues.push({
        severity: "warning",
        code: "compiled_level_no_rooms",
        levelIndex: index,
        message: `Compiled project ${canonicalLevelName(index)} floor has no rooms.`,
      });
    }
  }
  return issues;
}

// Forensic QA: when the user supplied programme spaces, every space
// collapsing onto Ground after normalisation almost always means a level
// authority regression. Block with a clear code so future regressions
// fail loudly instead of producing a single-floor A1 sheet.
function detectProgrammeGroundCollapse({
  inputProgramSpaces,
  programme,
  targetStoreys,
}) {
  if (!Array.isArray(inputProgramSpaces) || inputProgramSpaces.length === 0) {
    return null;
  }
  if (Math.max(1, Number(targetStoreys) || 1) <= 1) {
    return null;
  }
  const spaces = Array.isArray(programme?.spaces) ? programme.spaces : [];
  if (spaces.length === 0) return null;
  const allOnGround = spaces.every(
    (space) => Number(space?.target_level_index) === 0,
  );
  if (!allOnGround) return null;
  // Confirm the input had at least one non-Ground row - otherwise the
  // collapse is the user's own intent.
  const inputHadUpperLevel = inputProgramSpaces.some((space) => {
    const explicit = Number(space?.levelIndex ?? space?.level_index);
    if (Number.isFinite(explicit) && explicit > 0) return true;
    const label = String(space?.level || "")
      .trim()
      .toLowerCase();
    return Boolean(label) && label !== "ground" && label !== "ground floor";
  });
  if (!inputHadUpperLevel) return null;
  return {
    severity: "error",
    code: "programme_collapsed_to_ground",
    message:
      "Programme has user-supplied upper-level spaces but every space resolved to Ground after normalisation.",
  };
}

function normalizeBrief(input = {}) {
  const sourceBrief = input.brief || input.projectBrief || input;
  const projectDetails = input.projectDetails || {};
  const locationData = input.locationData || {};
  const referenceMatch = isReferenceMatchRequested(input, sourceBrief);
  const portfolioBlend =
    input.portfolioBlend || sourceBrief.portfolioBlend || {};
  const portfolioMaterialWeight = Number(portfolioBlend.materialWeight);
  const portfolioStyleWeight = Number(portfolioBlend.characteristicWeight);
  const explicitPortfolioMaterialWeight = Number.isFinite(
    portfolioMaterialWeight,
  )
    ? Math.max(0, Math.min(1, portfolioMaterialWeight))
    : null;
  const explicitLocalMaterialStrength =
    explicitPortfolioMaterialWeight !== null
      ? round(1 - explicitPortfolioMaterialWeight, 4)
      : null;
  const explicitPortfolioStyleStrength = Number.isFinite(portfolioStyleWeight)
    ? Math.max(0, Math.min(1, portfolioStyleWeight))
    : null;
  const siteInput = sourceBrief.site_input || sourceBrief.siteInput || {};
  const coordinates =
    locationData.coordinates ||
    siteInput.coordinates ||
    (Number.isFinite(Number(siteInput.lat)) &&
    Number.isFinite(Number(siteInput.lon))
      ? { lat: Number(siteInput.lat), lng: Number(siteInput.lon) }
      : null);
  const originalCategory =
    projectDetails.category ||
    projectDetails.buildingCategory ||
    sourceBrief.original_category ||
    sourceBrief.originalCategory ||
    input.originalCategory ||
    input.category ||
    null;
  const originalSubtype =
    projectDetails.subType ||
    projectDetails.buildingSubType ||
    sourceBrief.original_subtype ||
    sourceBrief.originalSubtype ||
    input.originalSubtype ||
    input.subType ||
    null;
  const registrySupport = getProjectTypeSupport(
    originalCategory,
    originalSubtype,
  );
  const incomingSupport =
    projectDetails.projectTypeSupport ||
    sourceBrief.project_type_support ||
    sourceBrief.projectTypeSupport ||
    input.projectTypeSupport ||
    {};
  const projectTypeSupport = {
    ...registrySupport,
    ...incomingSupport,
    categoryId: incomingSupport.categoryId || originalCategory,
    subtypeId: incomingSupport.subtypeId || originalSubtype,
    supportStatus:
      incomingSupport.supportStatus ||
      projectDetails.supportStatus ||
      sourceBrief.support_status ||
      sourceBrief.supportStatus ||
      input.supportStatus ||
      registrySupport.supportStatus,
    canonicalBuildingType:
      incomingSupport.canonicalBuildingType ||
      projectDetails.canonicalBuildingType ||
      sourceBrief.canonical_building_type ||
      sourceBrief.canonicalBuildingType ||
      input.canonicalBuildingType ||
      registrySupport.canonicalBuildingType,
    route:
      incomingSupport.route ||
      projectDetails.projectTypeRoute ||
      sourceBrief.project_type_route ||
      sourceBrief.projectTypeRoute ||
      input.projectTypeRoute ||
      registrySupport.route,
    programmeTemplateKey:
      incomingSupport.programmeTemplateKey ||
      projectDetails.programmeTemplateKey ||
      sourceBrief.programme_template_key ||
      sourceBrief.programmeTemplateKey ||
      input.programmeTemplateKey ||
      registrySupport.programmeTemplateKey,
  };
  const projectTypeSupportMetadata =
    buildProjectTypeSupportMetadata(projectTypeSupport);
  const buildingType = normalizeBuildingType({
    ...projectDetails,
    ...sourceBrief,
    canonicalBuildingType: projectTypeSupportMetadata.canonicalBuildingType,
    projectTypeSupport: projectTypeSupportMetadata,
  });
  const targetGiaM2 = Math.max(
    40,
    Number(
      sourceBrief.target_gia_m2 ??
        sourceBrief.targetAreaM2 ??
        sourceBrief.area ??
        input.target_gia_m2 ??
        input.targetAreaM2 ??
        input.area ??
        projectDetails.area ??
        180,
    ) || 180,
  );
  const briefRequestedStoreys =
    Number.parseInt(
      sourceBrief.target_storeys ?? sourceBrief.targetStoreys ?? 2,
      10,
    ) || 2;
  const projectFloorCount =
    projectDetails.floorCount ??
    projectDetails.floors ??
    projectDetails.targetStoreys;
  const hasProjectFloorAuthority =
    (Boolean(projectDetails.floorCountLocked) &&
      Number(projectFloorCount) > 0) ||
    (!projectDetails.floorCountLocked &&
      Number(projectDetails.autoDetectedFloorCount) > 0) ||
    (!projectDetails.floorCountLocked && Number(projectFloorCount) > 0);
  const requestedStoreys = hasProjectFloorAuthority
    ? resolveAuthoritativeFloorCount(
        {
          ...projectDetails,
          floorCount: projectFloorCount,
          area: targetGiaM2,
          targetAreaM2: targetGiaM2,
          target_gia_m2: targetGiaM2,
          buildingType,
          subType:
            projectDetails.subType ||
            projectDetails.buildingSubType ||
            sourceBrief.subType ||
            sourceBrief.buildingSubType ||
            buildingType,
        },
        {
          fallback: briefRequestedStoreys,
          maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
        },
      ).floorCount
    : briefRequestedStoreys;
  const residentialReferenceMinStoreys =
    referenceMatch &&
    isResidentialBuildingType(buildingType) &&
    !hasLockedFloorAuthority(projectDetails)
      ? 2
      : 1;
  const targetStoreys = Math.max(
    residentialReferenceMinStoreys,
    1,
    Math.min(MAX_TARGET_STOREYS, requestedStoreys),
  );
  const projectName =
    sourceBrief.project_name ||
    sourceBrief.projectName ||
    input.project_name ||
    input.projectName ||
    input.name ||
    projectDetails.projectName ||
    projectDetails.name ||
    "ArchiAI Project";
  const activeAddress =
    siteInput.address ||
    input.address ||
    input.siteAddress ||
    locationData.address ||
    projectDetails.address ||
    null;
  const requiredSpacesText =
    sourceBrief.required_spaces_text ||
    sourceBrief.requiredSpacesText ||
    input.required_spaces_text ||
    input.requiredSpacesText ||
    projectDetails.requiredSpacesText ||
    "";
  const constraintsText =
    sourceBrief.constraints_text ||
    sourceBrief.constraintsText ||
    input.constraints_text ||
    input.constraintsText ||
    projectDetails.constraintsText ||
    "";
  const briefInputHash = computeCDSHashSync({
    source: "active_generation_input",
    project_name: projectName,
    building_type: buildingType,
    original_category: originalCategory,
    original_subtype: originalSubtype,
    support_status: projectTypeSupportMetadata.supportStatus,
    programme_template_key: projectTypeSupportMetadata.programmeTemplateKey,
    project_type_route: projectTypeSupportMetadata.route,
    address: activeAddress,
    postcode: siteInput.postcode || locationData.postcode || null,
    target_gia_m2: round(targetGiaM2, 2),
    target_storeys: targetStoreys,
    required_spaces_text: requiredSpacesText,
    constraints_text: constraintsText,
    reference_match: referenceMatch,
  });

  return {
    project_name: projectName,
    building_type: buildingType,
    canonical_building_type: buildingType,
    original_category: originalCategory,
    original_subtype: originalSubtype,
    support_status: projectTypeSupportMetadata.supportStatus,
    programme_template_key: projectTypeSupportMetadata.programmeTemplateKey,
    project_type_route: projectTypeSupportMetadata.route,
    project_type_support: projectTypeSupportMetadata,
    client_goals: toArray(
      sourceBrief.client_goals ||
        sourceBrief.clientGoals ||
        projectDetails.clientGoals ||
        projectDetails.customNotes ||
        [],
    ),
    site_input: {
      address: activeAddress,
      postcode: siteInput.postcode || locationData.postcode || null,
      lat: Number(coordinates?.lat ?? siteInput.lat ?? 51.5074),
      lon: Number(
        coordinates?.lng ?? coordinates?.lon ?? siteInput.lon ?? -0.1278,
      ),
      boundary_geojson: siteInput.boundary_geojson || null,
    },
    target_gia_m2: round(targetGiaM2, 2),
    target_storeys: targetStoreys,
    referenceMatch,
    reference_match: referenceMatch,
    brief_input_hash: briefInputHash,
    request_authority: {
      source: "active_generation_input",
      briefInputHash,
      floorCountLocked: Boolean(projectDetails.floorCountLocked),
      residentialReferenceMinStoreys,
    },
    budget_band: sourceBrief.budget_band || "unknown",
    sustainability_ambition:
      sourceBrief.sustainability_ambition ||
      projectDetails.sustainabilityAmbition ||
      "low_energy",
    required_spaces_text: requiredSpacesText,
    constraints_text: constraintsText,
    user_intent: {
      style_keywords: toArray(
        sourceBrief.style_keywords ||
          sourceBrief.user_intent?.style_keywords ||
          input.styleKeywords ||
          projectDetails.styleKeywords || [
            "RIBA portfolio",
            "contextual contemporary",
          ],
      ),
      avoid_keywords: toArray(sourceBrief.user_intent?.avoid_keywords || []),
      portfolio_mood: sourceBrief.user_intent?.portfolio_mood || "riba_stage2",
      local_blend_strength: Number(
        sourceBrief.user_intent?.local_blend_strength ?? 0.65,
      ),
      innovation_strength: Number(
        sourceBrief.user_intent?.innovation_strength ?? 0.35,
      ),
      portfolio_style_strength:
        sourceBrief.user_intent?.portfolio_style_strength ??
        explicitPortfolioStyleStrength,
      portfolio_material_weight:
        sourceBrief.user_intent?.portfolio_material_weight ??
        explicitPortfolioMaterialWeight,
      local_material_strength:
        sourceBrief.user_intent?.local_material_strength ??
        explicitLocalMaterialStrength,
      material_preferences: toArray(
        sourceBrief.material_preferences ||
          sourceBrief.user_intent?.material_preferences ||
          input.materialPreferences ||
          locationData.localMaterials ||
          [],
      ),
      accessibility_priority:
        sourceBrief.user_intent?.accessibility_priority || "inclusive",
      privacy_level: sourceBrief.user_intent?.privacy_level || "public",
    },
  };
}

export function normalizeInputProgramSpaces(programSpaces = [], brief) {
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
    return [];
  }
  const totalArea = programSpaces.reduce(
    (sum, space) =>
      sum + Math.max(0, Number(space.area || space.target_area_m2 || 0)),
    0,
  );
  const scale =
    totalArea > 0 ? Number(brief.target_gia_m2 || totalArea) / totalArea : 1;

  return programSpaces.map((space, index) => {
    const name = space.name || space.label || `Space ${index + 1}`;
    const targetArea = Math.max(
      4,
      Number(space.target_area_m2 || space.area || 12) * scale,
    );
    const maxLevelIndex = Math.max(0, Number(brief.target_storeys || 1) - 1);
    const levelIndex = resolveLevelIndex(space, maxLevelIndex);
    return {
      space_id: space.id || createStableId("space", name, index),
      name,
      function: space.function || space.spaceType || "programme space",
      zone: space.zone || "semi_public",
      target_area_m2: round(targetArea, 2),
      min_area_m2: round(targetArea * 0.85, 2),
      max_area_m2: round(targetArea * 1.15, 2),
      target_level: levelName(levelIndex),
      target_level_index: levelIndex,
      actual_level_id: `level-${levelIndex}`,
      required_daylight: space.required_daylight || "medium",
      acoustic_privacy: space.acoustic_privacy || "medium",
      accessible: space.accessible !== false,
      adjacency_tags: toArray(
        space.adjacency_tags || space.adjacencyTags || [],
      ),
      qa_status: "unplaced",
    };
  });
}

function communityProgrammeTemplate(upperLevel) {
  return [
    [
      "Cafe and welcome",
      "street-facing public arrival and cafe",
      "public",
      0.15,
      0,
      "high",
    ],
    [
      "Community workshop",
      "flexible making and events room",
      "semi_public",
      0.18,
      0,
      "medium",
    ],
    ["Accessible WC", "inclusive visitor WC", "service", 0.04, 0, "low"],
    [
      "Plant and store",
      "plant, cleaner and equipment storage",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "arrival, stair and horizontal circulation",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Public reading room",
      "primary reading space",
      "public",
      0.25,
      upperLevel,
      "high",
    ],
    [
      "Quiet study",
      "focused study and reading",
      "private",
      0.17,
      upperLevel,
      "high",
    ],
    [
      "Flexible meeting room",
      "small group meeting and tutoring room",
      "semi_public",
      0.09,
      upperLevel,
      "medium",
    ],
  ];
}

function dwellingProgrammeTemplate(upperLevel) {
  return [
    [
      "Entrance hall",
      "arrival and vertical circulation",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    ["Living room", "family living space", "public", 0.18, 0, "high"],
    ["Kitchen dining", "cooking and dining space", "public", 0.16, 0, "high"],
    [
      "WC and utility",
      "ground floor WC and utility",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "horizontal circulation",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Principal bedroom",
      "main bedroom",
      "private",
      0.14,
      upperLevel,
      "medium",
    ],
    ["Bedroom 2", "secondary bedroom", "private", 0.11, upperLevel, "medium"],
    [
      "Bedroom 3 or study",
      "flexible bedroom or study",
      "private",
      0.09,
      upperLevel,
      "medium",
    ],
    ["Bathroom", "family bathroom", "service", 0.05, upperLevel, "low"],
    [
      "Upper circulation and store",
      "landing and storage",
      "semi_public",
      0.1,
      upperLevel,
      "medium",
    ],
  ];
}

function multiResidentialProgrammeTemplate(upperLevel) {
  return [
    ["Communal entrance", "shared arrival lobby", "public", 0.06, 0, "high"],
    [
      "Accessible apartment",
      "ground-floor inclusive home",
      "private",
      0.18,
      0,
      "high",
    ],
    [
      "Bin and cycle store",
      "refuse, post and bicycle storage",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Plant and risers",
      "MEP plant and service risers",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "stair, lift core and corridor",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    ["Apartment 1", "two-bed apartment", "private", 0.18, upperLevel, "high"],
    ["Apartment 2", "one-bed apartment", "private", 0.13, upperLevel, "high"],
    ["Apartment 3", "two-bed apartment", "private", 0.18, upperLevel, "high"],
    [
      "Upper circulation",
      "shared landing and corridor",
      "semi_public",
      0.07,
      upperLevel,
      "medium",
    ],
    [
      "Roof terrace store",
      "roof access and storage",
      "service",
      0.04,
      upperLevel,
      "low",
    ],
  ];
}

function mixedUseProgrammeTemplate(upperLevel) {
  return [
    [
      "Cafe and retail",
      "street-facing flexible retail",
      "public",
      0.2,
      0,
      "high",
    ],
    ["Back-of-house", "kitchen, store and staff WC", "service", 0.07, 0, "low"],
    [
      "Residential lobby",
      "separate residential entrance",
      "semi_public",
      0.05,
      0,
      "medium",
    ],
    [
      "Bin and cycle store",
      "shared waste and cycle storage",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "stair and lift core",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Apartment A",
      "one-bed apartment above retail",
      "private",
      0.2,
      upperLevel,
      "high",
    ],
    [
      "Apartment B",
      "two-bed apartment above retail",
      "private",
      0.22,
      upperLevel,
      "high",
    ],
    [
      "Upper circulation",
      "landing and corridor",
      "semi_public",
      0.05,
      upperLevel,
      "medium",
    ],
    [
      "Plant and store",
      "MEP plant and storage",
      "service",
      0.06,
      upperLevel,
      "low",
    ],
    [
      "Service riser",
      "vertical service distribution",
      "service",
      0.05,
      upperLevel,
      "low",
    ],
  ];
}

function officeStudioProgrammeTemplate(upperLevel) {
  return [
    [
      "Reception and client lounge",
      "visitor arrival and front-of-house waiting",
      "public",
      0.08,
      0,
      "medium",
    ],
    [
      "Open office floorplate (ground)",
      "primary desk workspace",
      "semi_public",
      0.22,
      0,
      "high",
    ],
    [
      "Meeting suite",
      "bookable meeting and collaboration rooms",
      "semi_public",
      0.1,
      0,
      "medium",
    ],
    [
      "Collaboration and breakout",
      "informal work and team breakout",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    ["WC and accessible WC", "inclusive WCs", "service", 0.05, 0, "low"],
    [
      "Ground circulation",
      "stair, corridor and reception support",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Open office floorplate (upper)",
      "additional desk workspace",
      "semi_public",
      0.2,
      upperLevel,
      "high",
    ],
    [
      "Focus and phone rooms",
      "quiet focus booths and calls",
      "private",
      0.06,
      upperLevel,
      "medium",
    ],
    [
      "Staff kitchen and welfare",
      "staff kitchen, lockers and rest area",
      "private",
      0.05,
      upperLevel,
      "medium",
    ],
    [
      "IT, storage and plant",
      "server, storage and MEP plant",
      "service",
      0.04,
      upperLevel,
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.05,
      upperLevel,
      "medium",
    ],
  ];
}

function educationStudioProgrammeTemplate(upperLevel) {
  return [
    [
      "Entrance, reception and admin",
      "secure arrival, administration and waiting",
      "public",
      0.08,
      0,
      "high",
    ],
    [
      "Classrooms (ground)",
      "general teaching rooms",
      "semi_public",
      0.2,
      0,
      "high",
    ],
    [
      "Assembly and multipurpose hall",
      "assembly, indoor activity and community use",
      "semi_public",
      0.1,
      0,
      "medium",
    ],
    [
      "Pupil and accessible WCs",
      "inclusive pupil WCs",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Dining and kitchen support",
      "dining support, servery and back-of-house",
      "service",
      0.06,
      0,
      "medium",
    ],
    [
      "Ground circulation",
      "secure stair, corridor and cloak support",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Classrooms (upper)",
      "additional general teaching rooms",
      "semi_public",
      0.22,
      upperLevel,
      "high",
    ],
    [
      "Library and resource centre",
      "reading, resources and small group learning",
      "semi_public",
      0.08,
      upperLevel,
      "medium",
    ],
    [
      "Staff, prep and SEN support",
      "staff base, prep and specialist support",
      "private",
      0.06,
      upperLevel,
      "high",
    ],
    [
      "Plant and stores",
      "MEP plant, curriculum storage and cleaner store",
      "service",
      0.03,
      upperLevel,
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.05,
      upperLevel,
      "medium",
    ],
  ];
}

function clinicProgrammeTemplate(upperLevel) {
  return [
    [
      "Reception and waiting",
      "patient arrival and waiting",
      "public",
      0.12,
      0,
      "medium",
    ],
    [
      "Consult rooms (ground)",
      "primary consultation and triage rooms",
      "semi_public",
      0.16,
      0,
      "high",
    ],
    [
      "Treatment suite",
      "minor procedures and treatment",
      "semi_public",
      0.12,
      0,
      "medium",
    ],
    [
      "Patient and accessible WCs",
      "public clinical WCs",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Clean and dirty utility",
      "clinical support and disposal",
      "service",
      0.06,
      0,
      "low",
    ],
    [
      "Ground clinical circulation",
      "patient corridor, stair and refuge",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Consult rooms (upper)",
      "additional clinical consultation rooms",
      "semi_public",
      0.16,
      upperLevel,
      "high",
    ],
    [
      "Staff and administration",
      "clinical administration and staff base",
      "private",
      0.08,
      upperLevel,
      "medium",
    ],
    [
      "Records and clinical store",
      "secure records and consumables store",
      "service",
      0.04,
      upperLevel,
      "low",
    ],
    [
      "Staff welfare",
      "staff rest, lockers and kitchenette",
      "private",
      0.04,
      upperLevel,
      "medium",
    ],
    [
      "Plant and services",
      "MEP plant and service riser",
      "service",
      0.04,
      upperLevel,
      "low",
    ],
    [
      "Upper clinical circulation",
      "clinical corridor, landing and refuge",
      "semi_public",
      0.06,
      upperLevel,
      "medium",
    ],
  ];
}

function hospitalProgrammeTemplate(upperLevel) {
  return [
    [
      "Main reception and admissions",
      "public arrival, admissions and waiting",
      "public",
      0.08,
      0,
      "medium",
    ],
    [
      "Emergency and outpatient assessment",
      "triage, outpatient and urgent assessment",
      "semi_public",
      0.12,
      0,
      "medium",
    ],
    [
      "Diagnostics",
      "imaging, diagnostics and testing",
      "semi_public",
      0.1,
      0,
      "low",
    ],
    [
      "Clinical support and utility",
      "clean utility, dirty utility and treatment support",
      "service",
      0.07,
      0,
      "low",
    ],
    [
      "Public WCs and cafe support",
      "public WCs and refreshment support",
      "public",
      0.05,
      0,
      "medium",
    ],
    [
      "Ground hospital circulation",
      "public concourse, clinical corridor and stair",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Ward and day rooms",
      "patient rooms, bay wards and day space",
      "private",
      0.18,
      upperLevel,
      "medium",
    ],
    [
      "Treatment and consult suites",
      "clinical treatment and consultation rooms",
      "semi_public",
      0.09,
      upperLevel,
      "medium",
    ],
    [
      "Staff and administration base",
      "staff base, changing and administration",
      "private",
      0.07,
      upperLevel,
      "medium",
    ],
    [
      "Pharmacy, stores and logistics",
      "medicines, supplies and FM logistics",
      "service",
      0.05,
      upperLevel,
      "low",
    ],
    [
      "Plant and services",
      "MEP plant and service risers",
      "service",
      0.04,
      upperLevel,
      "low",
    ],
    [
      "Upper hospital circulation",
      "clinical corridor, lift lobby and refuge",
      "semi_public",
      0.07,
      upperLevel,
      "medium",
    ],
  ];
}

const PROJECT_GRAPH_PROGRAMME_TEMPLATE_ROWS = Object.freeze({
  hospitality_hotel: [
    [
      "Reception and concierge",
      "guest arrival and concierge",
      "public",
      0.08,
      0,
      "medium",
    ],
    [
      "Lobby lounge and bar",
      "front-of-house lounge and bar",
      "public",
      0.12,
      0,
      "medium",
    ],
    [
      "Restaurant and breakfast",
      "guest dining and breakfast service",
      "public",
      0.12,
      0,
      "high",
    ],
    [
      "Kitchen and back-of-house",
      "commercial kitchen, stores and staff support",
      "service",
      0.07,
      0,
      "low",
    ],
    [
      "Public WCs and luggage",
      "visitor WCs and luggage store",
      "service",
      0.03,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "lobby, lift, stair and guest route",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Guest rooms",
      "standard guestrooms and ensuites",
      "private",
      0.34,
      "upper",
      "medium",
    ],
    [
      "Guest amenity lounge",
      "upper guest lounge and shared amenity",
      "semi_public",
      0.08,
      "upper",
      "medium",
    ],
    [
      "Staff and administration",
      "hotel office, housekeeping and staff welfare",
      "private",
      0.06,
      "upper",
      "medium",
    ],
    [
      "Plant and linen stores",
      "MEP plant, risers and linen stores",
      "service",
      0.05,
      "upper",
      "low",
    ],
    [
      "Upper guest circulation",
      "guest corridors, lift lobby and refuge",
      "semi_public",
      0.1,
      "upper",
      "medium",
    ],
  ],
  hospitality_resort: [
    [
      "Arrival pavilion",
      "guest arrival, reception and concierge",
      "public",
      0.07,
      0,
      "medium",
    ],
    [
      "All-day dining",
      "restaurant, bar and terrace support",
      "public",
      0.12,
      0,
      "high",
    ],
    [
      "Wellness and spa",
      "spa, treatment and relaxation areas",
      "semi_public",
      0.12,
      0,
      "medium",
    ],
    [
      "Event and club lounge",
      "events, club lounge and guest activity",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Kitchen and service yard",
      "kitchen, stores and resort servicing",
      "service",
      0.06,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "arrival, lift, stair and guest route",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Guest suites",
      "guest suites and private terraces",
      "private",
      0.28,
      "upper",
      "medium",
    ],
    [
      "Family suites",
      "larger guest suites and flexible rooms",
      "private",
      0.1,
      "upper",
      "medium",
    ],
    [
      "Housekeeping and linen",
      "housekeeping base and linen stores",
      "service",
      0.04,
      "upper",
      "low",
    ],
    [
      "Plant and services",
      "MEP plant and vertical risers",
      "service",
      0.04,
      "upper",
      "low",
    ],
    [
      "Upper guest circulation",
      "guest corridors, lift lobby and refuge",
      "semi_public",
      0.06,
      "upper",
      "medium",
    ],
  ],
  hospitality_guest_house: [
    [
      "Entrance and guest lounge",
      "arrival, reception and guest sitting room",
      "public",
      0.12,
      0,
      "medium",
    ],
    [
      "Breakfast room",
      "breakfast dining and shared guest space",
      "public",
      0.1,
      0,
      "high",
    ],
    [
      "Kitchen and service",
      "guest-house kitchen, pantry and laundry",
      "service",
      0.08,
      0,
      "low",
    ],
    [
      "Accessible guest room",
      "ground-floor accessible guest bedroom",
      "private",
      0.12,
      0,
      "medium",
    ],
    [
      "Guest WC and store",
      "visitor WC, luggage and cleaner store",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "arrival, stair and horizontal circulation",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Guest bedrooms",
      "upper guest bedrooms and ensuites",
      "private",
      0.3,
      "upper",
      "medium",
    ],
    [
      "Guest snug",
      "quiet shared sitting area",
      "semi_public",
      0.06,
      "upper",
      "medium",
    ],
    [
      "Linen and staff support",
      "linen store and small staff base",
      "service",
      0.05,
      "upper",
      "low",
    ],
    [
      "Plant and services",
      "MEP plant and service riser",
      "service",
      0.04,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "guest landing, corridor and refuge",
      "semi_public",
      0.07,
      "upper",
      "medium",
    ],
  ],
  industrial_warehouse: [
    [
      "Goods-in and dispatch",
      "loading, goods-in and dispatch apron",
      "service",
      0.16,
      0,
      "low",
    ],
    [
      "Warehouse storage hall",
      "high-bay storage and picking",
      "semi_public",
      0.38,
      0,
      "medium",
    ],
    [
      "Office and reception",
      "visitor reception and warehouse office",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Welfare and WCs",
      "staff welfare, changing and WCs",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Plant and sprinkler room",
      "MEP, sprinkler and utility plant",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Warehouse circulation",
      "forklift aisles, escape routes and stair",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Mezzanine storage",
      "light storage and parts mezzanine",
      "service",
      0.1,
      "upper",
      "low",
    ],
    [
      "Operations office",
      "shift management and administration",
      "private",
      0.05,
      "upper",
      "medium",
    ],
    [
      "Training and briefing",
      "staff training and briefing room",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Upper services",
      "plant deck and risers",
      "service",
      0.04,
      "upper",
      "low",
    ],
  ],
  industrial_manufacturing: [
    [
      "Production hall",
      "primary manufacturing floor",
      "semi_public",
      0.32,
      0,
      "medium",
    ],
    [
      "Assembly and packing",
      "assembly line, packing and inspection",
      "semi_public",
      0.15,
      0,
      "medium",
    ],
    [
      "Goods logistics",
      "goods-in, dispatch and materials handling",
      "service",
      0.12,
      0,
      "low",
    ],
    [
      "Quality control lab",
      "testing, metrology and quality control",
      "private",
      0.07,
      0,
      "medium",
    ],
    [
      "Staff welfare and WCs",
      "changing, lockers, WCs and rest area",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Process plant",
      "compressed air, MEP and process support",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Factory circulation",
      "safe aisles, escape routes and stair",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Administration",
      "production office and management",
      "private",
      0.06,
      "upper",
      "medium",
    ],
    [
      "Parts and secure stores",
      "components, tools and secure stores",
      "service",
      0.05,
      "upper",
      "low",
    ],
    [
      "Training room",
      "staff training and induction",
      "private",
      0.02,
      "upper",
      "medium",
    ],
    ["Upper plant", "plant deck and risers", "service", 0.03, "upper", "low"],
  ],
  industrial_workshop: [
    [
      "Workshop bay",
      "primary workshop and repair bays",
      "semi_public",
      0.32,
      0,
      "medium",
    ],
    [
      "Maker studio",
      "flexible making, testing and bench work",
      "semi_public",
      0.18,
      0,
      "high",
    ],
    [
      "Reception and showroom",
      "client arrival and display",
      "public",
      0.09,
      0,
      "medium",
    ],
    [
      "Tool and material store",
      "secure tools, parts and materials",
      "service",
      0.08,
      0,
      "low",
    ],
    [
      "Welfare and WCs",
      "staff welfare, changing and WCs",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Plant and extraction",
      "MEP plant and extract support",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Workshop circulation",
      "safe aisles, delivery route and stair",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Office and training",
      "workshop office and training room",
      "private",
      0.06,
      "upper",
      "medium",
    ],
    [
      "Upper stores",
      "light storage and archive",
      "service",
      0.04,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.06,
      "upper",
      "medium",
    ],
  ],
  cultural_museum: [
    [
      "Foyer and ticketing",
      "public arrival, ticketing and orientation",
      "public",
      0.08,
      0,
      "medium",
    ],
    [
      "Ground galleries",
      "primary exhibition galleries",
      "public",
      0.22,
      0,
      "medium",
    ],
    [
      "Learning studio",
      "education, workshop and outreach room",
      "semi_public",
      0.08,
      0,
      "high",
    ],
    [
      "Cafe and museum shop",
      "public cafe, retail and support",
      "public",
      0.08,
      0,
      "medium",
    ],
    [
      "Collection handling",
      "loading, quarantine and object handling",
      "service",
      0.06,
      0,
      "low",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Museum circulation",
      "gallery route, stair and lift",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Upper galleries",
      "temporary and permanent galleries",
      "public",
      0.2,
      "upper",
      "medium",
    ],
    [
      "Archive and conservation",
      "archive, conservation and prep",
      "private",
      0.06,
      "upper",
      "low",
    ],
    [
      "Staff and administration",
      "curatorial office and staff base",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Plant and upper circulation",
      "MEP plant, landing and refuge",
      "service",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper gallery circulation",
      "public gallery circulation",
      "semi_public",
      0.04,
      "upper",
      "medium",
    ],
  ],
  cultural_library: [
    [
      "Foyer and help desk",
      "public arrival, help desk and orientation",
      "public",
      0.08,
      0,
      "medium",
    ],
    ["Lending library", "open shelves and browsing", "public", 0.22, 0, "high"],
    [
      "Children and community",
      "children's library and community room",
      "semi_public",
      0.1,
      0,
      "high",
    ],
    [
      "Cafe point",
      "small cafe and informal seating",
      "public",
      0.05,
      0,
      "medium",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Stores and returns",
      "book return, store and staff support",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Library circulation",
      "public route, stair and lift",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Reading room",
      "quiet reading and study space",
      "public",
      0.2,
      "upper",
      "high",
    ],
    [
      "Study rooms",
      "bookable study and tutoring rooms",
      "private",
      0.08,
      "upper",
      "high",
    ],
    [
      "Staff and administration",
      "library office and staff base",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Archive and local studies",
      "archive, local studies and secure store",
      "private",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.05,
      "upper",
      "medium",
    ],
  ],
  cultural_theatre: [
    [
      "Foyer and box office",
      "public arrival, ticketing and cloakroom",
      "public",
      0.1,
      0,
      "medium",
    ],
    ["Auditorium", "primary audience seating", "public", 0.28, 0, "medium"],
    [
      "Stage and backstage",
      "stage, wings, scene dock and backstage",
      "semi_public",
      0.2,
      0,
      "low",
    ],
    [
      "Dressing and green rooms",
      "performer support and green room",
      "private",
      0.08,
      0,
      "medium",
    ],
    [
      "Bars and interval support",
      "public bar and interval service",
      "public",
      0.05,
      0,
      "medium",
    ],
    ["Public WCs", "audience and accessible WCs", "service", 0.05, 0, "low"],
    [
      "Theatre circulation",
      "foyer route, stair, lift and escape",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Rehearsal room",
      "rehearsal and workshop space",
      "private",
      0.06,
      "upper",
      "high",
    ],
    [
      "Administration",
      "production office and administration",
      "private",
      0.03,
      "upper",
      "medium",
    ],
    [
      "Plant and technical control",
      "MEP, dimmer, AV and control rooms",
      "service",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.04,
      "upper",
      "medium",
    ],
  ],
  government_town_hall: [
    [
      "Civic foyer",
      "public arrival and civic reception",
      "public",
      0.1,
      0,
      "medium",
    ],
    ["Council chamber", "formal civic chamber", "public", 0.18, 0, "medium"],
    [
      "Public service counters",
      "customer service and interview booths",
      "semi_public",
      0.12,
      0,
      "medium",
    ],
    [
      "Community meeting suite",
      "public meeting and event rooms",
      "semi_public",
      0.1,
      0,
      "medium",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Records and secure store",
      "records, post and secure store",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Civic circulation",
      "public route, stair, lift and security line",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Council offices",
      "open office and member support",
      "private",
      0.14,
      "upper",
      "medium",
    ],
    [
      "Committee rooms",
      "committee and briefing rooms",
      "semi_public",
      0.08,
      "upper",
      "medium",
    ],
    [
      "Staff welfare",
      "staff rest, lockers and kitchenette",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Plant and upper circulation",
      "MEP plant, landing and refuge",
      "service",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper civic circulation",
      "corridor and public waiting",
      "semi_public",
      0.05,
      "upper",
      "medium",
    ],
  ],
  government_police_station: [
    [
      "Public enquiry office",
      "public reception and reporting desk",
      "public",
      0.08,
      0,
      "medium",
    ],
    [
      "Interview suite",
      "victim, witness and interview rooms",
      "semi_public",
      0.1,
      0,
      "medium",
    ],
    [
      "Response office",
      "operational response workspace",
      "private",
      0.14,
      0,
      "medium",
    ],
    [
      "Secure holding",
      "short-stay secure holding and search",
      "private",
      0.1,
      0,
      "low",
    ],
    [
      "Evidence and property",
      "evidence handling and secure property store",
      "service",
      0.06,
      0,
      "low",
    ],
    [
      "Welfare and WCs",
      "staff welfare, lockers and WCs",
      "service",
      0.06,
      0,
      "low",
    ],
    [
      "Secure circulation",
      "separated public, staff and secure routes",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Administration",
      "police administration and casework",
      "private",
      0.15,
      "upper",
      "medium",
    ],
    [
      "Briefing and incident room",
      "briefing, tasking and incident control",
      "private",
      0.08,
      "upper",
      "medium",
    ],
    [
      "Locker and changing",
      "staff lockers, changing and showers",
      "private",
      0.06,
      "upper",
      "low",
    ],
    [
      "Plant and services",
      "MEP plant and secure risers",
      "service",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper secure circulation",
      "corridor, stair and refuge",
      "semi_public",
      0.06,
      "upper",
      "medium",
    ],
  ],
  government_fire_station: [
    [
      "Appliance bay",
      "fire appliance parking and turnout route",
      "service",
      0.3,
      0,
      "low",
    ],
    [
      "Watch room",
      "control, watch desk and public interface",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Turnout gear store",
      "PPE, drying and rapid response store",
      "service",
      0.08,
      0,
      "low",
    ],
    [
      "Decontamination suite",
      "decon, showers and clean/dirty separation",
      "service",
      0.06,
      0,
      "low",
    ],
    [
      "Public reception",
      "community safety reception",
      "public",
      0.04,
      0,
      "medium",
    ],
    [
      "Workshop and stores",
      "equipment workshop and stores",
      "service",
      0.07,
      0,
      "low",
    ],
    [
      "Station circulation",
      "safe appliance, staff and visitor circulation",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Dorm and rest rooms",
      "crew rest and quiet rooms",
      "private",
      0.12,
      "upper",
      "medium",
    ],
    [
      "Training room",
      "crew training and community education",
      "semi_public",
      0.07,
      "upper",
      "medium",
    ],
    [
      "Gym and welfare",
      "fitness, kitchen and welfare",
      "private",
      0.05,
      "upper",
      "medium",
    ],
    [
      "Administration and plant",
      "station office, MEP and risers",
      "service",
      0.06,
      "upper",
      "low",
    ],
  ],
  religious_mosque: [
    [
      "Prayer hall",
      "main congregational prayer space",
      "public",
      0.42,
      0,
      "medium",
    ],
    [
      "Ablution areas",
      "male, female and accessible ablution",
      "service",
      0.12,
      0,
      "low",
    ],
    [
      "Entrance and shoe lobby",
      "arrival, shoe storage and orientation",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Community room",
      "community meeting and teaching support",
      "semi_public",
      0.1,
      0,
      "medium",
    ],
    [
      "Administration",
      "imam office and administration",
      "private",
      0.03,
      0,
      "medium",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Ground circulation",
      "segregated routes, stair and refuge",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Teaching rooms",
      "madrasa and teaching rooms",
      "semi_public",
      0.07,
      "upper",
      "medium",
    ],
    [
      "Family prayer gallery",
      "quiet family and overflow prayer",
      "public",
      0.06,
      "upper",
      "medium",
    ],
    [
      "Plant and stores",
      "MEP plant, stores and cleaner room",
      "service",
      0.03,
      "upper",
      "low",
    ],
  ],
  religious_church: [
    [
      "Nave and worship space",
      "main congregational worship",
      "public",
      0.38,
      0,
      "medium",
    ],
    [
      "Sanctuary and vestry",
      "sanctuary, vestry and clergy support",
      "private",
      0.08,
      0,
      "medium",
    ],
    [
      "Narthex and welcome",
      "arrival, welcome and gathering",
      "public",
      0.07,
      0,
      "medium",
    ],
    [
      "Parish hall",
      "community hall and events",
      "semi_public",
      0.14,
      0,
      "medium",
    ],
    ["Kitchen support", "servery and hall kitchen", "service", 0.05, 0, "low"],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Ground circulation",
      "aisles, lobby, stair and accessible route",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Classrooms",
      "Sunday school and meeting rooms",
      "semi_public",
      0.07,
      "upper",
      "medium",
    ],
    [
      "Administration",
      "parish office and staff base",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Stores and plant",
      "chair store, MEP plant and risers",
      "service",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.04,
      "upper",
      "medium",
    ],
  ],
  religious_temple: [
    [
      "Worship hall",
      "main worship and congregation space",
      "public",
      0.36,
      0,
      "medium",
    ],
    [
      "Shrine and sanctum",
      "primary shrine, preparation and ritual support",
      "private",
      0.1,
      0,
      "medium",
    ],
    [
      "Entrance and shoe lobby",
      "arrival, shoe storage and orientation",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Community hall",
      "gathering, teaching and community events",
      "semi_public",
      0.12,
      0,
      "medium",
    ],
    [
      "Kitchen and prasad support",
      "kitchen, servery and stores",
      "service",
      0.05,
      0,
      "low",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Ground circulation",
      "processional route, stair and accessible path",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Teaching rooms",
      "religious education and small group rooms",
      "semi_public",
      0.08,
      "upper",
      "medium",
    ],
    [
      "Administration",
      "office and clergy support",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Stores and plant",
      "ritual store, MEP plant and risers",
      "service",
      0.04,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.05,
      "upper",
      "medium",
    ],
  ],
  recreation_sports_center: [
    [
      "Sports hall",
      "multi-court sports hall",
      "semi_public",
      0.36,
      0,
      "medium",
    ],
    [
      "Reception and cafe",
      "arrival, control desk and cafe",
      "public",
      0.06,
      0,
      "medium",
    ],
    [
      "Changing village",
      "changing, showers and lockers",
      "service",
      0.12,
      0,
      "low",
    ],
    [
      "Fitness studio",
      "exercise studio and activity room",
      "semi_public",
      0.1,
      0,
      "high",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    [
      "Equipment stores",
      "sports equipment and cleaner store",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Sports circulation",
      "public route, stair and spectator route",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Multipurpose room",
      "club, coaching and community room",
      "semi_public",
      0.08,
      "upper",
      "medium",
    ],
    [
      "Staff and administration",
      "staff base and sports administration",
      "private",
      0.04,
      "upper",
      "medium",
    ],
    [
      "Plant and services",
      "MEP plant, risers and ventilation",
      "service",
      0.04,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.04,
      "upper",
      "medium",
    ],
  ],
  recreation_gym: [
    [
      "Gym floor",
      "open gym and strength/cardio area",
      "semi_public",
      0.4,
      0,
      "high",
    ],
    [
      "Reception and retail",
      "arrival, control desk and retail",
      "public",
      0.07,
      0,
      "medium",
    ],
    [
      "Changing and showers",
      "changing, showers and lockers",
      "service",
      0.12,
      0,
      "low",
    ],
    [
      "Exercise studio",
      "classes, yoga and group training",
      "semi_public",
      0.12,
      0,
      "high",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.04, 0, "low"],
    ["Staff base", "staff office and welfare", "private", 0.03, 0, "medium"],
    [
      "Gym circulation",
      "member route, stair and equipment aisles",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Treatment room",
      "sports therapy and consultation",
      "private",
      0.05,
      "upper",
      "medium",
    ],
    [
      "Administration",
      "management office and membership support",
      "private",
      0.03,
      "upper",
      "medium",
    ],
    [
      "Plant and services",
      "MEP plant and ventilation plant",
      "service",
      0.03,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.05,
      "upper",
      "medium",
    ],
  ],
  recreation_pool: [
    [
      "Pool hall",
      "main swimming pool and poolside",
      "semi_public",
      0.42,
      0,
      "medium",
    ],
    [
      "Changing village",
      "changing, showers and lockers",
      "service",
      0.14,
      0,
      "low",
    ],
    [
      "Reception and viewing",
      "arrival, control desk and viewing",
      "public",
      0.06,
      0,
      "medium",
    ],
    [
      "Pool plant",
      "filtration, chemical store and pool plant",
      "service",
      0.1,
      0,
      "low",
    ],
    [
      "Spectator seating",
      "poolside spectator seating",
      "public",
      0.06,
      0,
      "medium",
    ],
    ["Public WCs", "visitor and accessible WCs", "service", 0.03, 0, "low"],
    [
      "Pool circulation",
      "wet and dry circulation routes",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Studio or classroom",
      "dry activity, lessons and club room",
      "semi_public",
      0.05,
      "upper",
      "medium",
    ],
    [
      "Staff and lifeguard base",
      "lifeguard, first aid and staff base",
      "private",
      0.03,
      "upper",
      "medium",
    ],
    [
      "Dry plant and stores",
      "ventilation plant and equipment stores",
      "service",
      0.02,
      "upper",
      "low",
    ],
    [
      "Upper circulation",
      "landing, corridor and refuge",
      "semi_public",
      0.03,
      "upper",
      "medium",
    ],
  ],
});

function typedProjectGraphProgrammeTemplate(buildingType, upperLevel) {
  const rows = PROJECT_GRAPH_PROGRAMME_TEMPLATE_ROWS[buildingType];
  if (!rows) return null;
  return rows.map(([name, fn, zone, ratio, levelIndex, daylight]) => [
    name,
    fn,
    zone,
    ratio,
    levelIndex === "upper" ? upperLevel : levelIndex,
    daylight,
  ]);
}

function getProgrammeTemplate(buildingType, upperLevel) {
  const typedTemplate = typedProjectGraphProgrammeTemplate(
    buildingType,
    upperLevel,
  );
  if (typedTemplate) {
    return {
      template: typedTemplate,
      fallback: false,
    };
  }

  switch (buildingType) {
    case "dwelling":
      return {
        template: dwellingProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "community":
      return {
        template: communityProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "multi_residential":
      return {
        template: multiResidentialProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "mixed_use":
      return {
        template: mixedUseProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "office_studio":
      return {
        template: officeStudioProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "education_studio":
      return {
        template: educationStudioProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "clinic":
      return {
        template: clinicProgrammeTemplate(upperLevel),
        fallback: false,
      };
    case "hospital":
      return {
        template: hospitalProgrammeTemplate(upperLevel),
        fallback: false,
      };
    default:
      // Don't silently render an unknown type as a dwelling; fall back to a
      // declared community template and surface the substitution in audit.
      return {
        template: communityProgrammeTemplate(upperLevel),
        fallback: true,
        fallbackFrom: buildingType,
      };
  }
}

function buildTemplateProgramSpaces(brief) {
  const target = Number(brief.target_gia_m2 || 180);
  const totalStoreys = Math.max(1, Number(brief.target_storeys || 1));
  const upperLevel = Math.max(0, totalStoreys - 1);
  // Templates carry spaces on level 0 (ground) and a single upper level.
  // For 3+ storey projects we spread the upper template spaces across all
  // upper levels (1..upperLevel) round-robin so every chosen floor receives
  // programme content instead of being left blank.
  const templateUpperLevel = Math.min(1, upperLevel);
  const { template, fallback, fallbackFrom } = getProgrammeTemplate(
    brief.building_type,
    templateUpperLevel,
  );

  const upperLevelCount = Math.max(0, totalStoreys - 1);
  let upperRotation = 0;
  const remapLevelIndex = (rawLevelIndex) => {
    if (rawLevelIndex <= 0 || upperLevelCount <= 0) {
      return 0;
    }
    if (upperLevelCount === 1) {
      return 1;
    }
    const assigned = 1 + (upperRotation % upperLevelCount);
    upperRotation += 1;
    return assigned;
  };

  const spaces = template.map(
    ([name, fn, zone, ratio, levelIndex, daylight], index) => {
      const remappedLevel = remapLevelIndex(levelIndex);
      return {
        space_id: createStableId("space", brief.project_name, name, index),
        name,
        function: fn,
        zone,
        target_area_m2: round(target * ratio, 2),
        min_area_m2: round(target * ratio * 0.85, 2),
        max_area_m2: round(target * ratio * 1.15, 2),
        target_level: levelName(remappedLevel),
        target_level_index: remappedLevel,
        actual_level_id: `level-${remappedLevel}`,
        required_daylight: daylight,
        acoustic_privacy: zone === "private" ? "high" : "medium",
        accessible: true,
        adjacency_tags:
          zone === "service"
            ? ["service"]
            : levelIndex === 0
              ? ["arrival"]
              : ["quiet"],
        qa_status: "unplaced",
      };
    },
  );

  return {
    spaces,
    template_provenance: fallback
      ? {
          source: "fallback_template",
          requested_building_type: fallbackFrom,
          resolved_template: "community",
          programme_template_key:
            brief.programme_template_key || brief.building_type,
          support_status: brief.support_status || null,
          severity: "warning",
          message: `building_type "${fallbackFrom}" not in KNOWN_BUILDING_TYPES; using community template as deterministic fallback.`,
        }
      : {
          source: "matched_template",
          resolved_template: brief.building_type,
          programme_template_key:
            brief.programme_template_key || brief.building_type,
          support_status: brief.support_status || null,
          severity: "info",
        },
  };
}

function buildProgramme({ brief, programSpaces = [] } = {}) {
  const inputSpaces = normalizeInputProgramSpaces(programSpaces, brief);
  let spaces;
  let templateProvenance;
  if (inputSpaces.length > 0) {
    spaces = inputSpaces;
    templateProvenance = {
      source: "user_supplied",
      resolved_template: null,
      programme_template_key: brief.programme_template_key || null,
      support_status: brief.support_status || null,
      severity: "info",
    };
  } else {
    const built = buildTemplateProgramSpaces(brief);
    spaces = built.spaces;
    templateProvenance = built.template_provenance;
  }
  const targetTotal = spaces.reduce(
    (sum, space) => sum + Number(space.target_area_m2 || 0),
    0,
  );
  const circulationArea = spaces
    .filter((space) => space.name.toLowerCase().includes("circulation"))
    .reduce((sum, space) => sum + Number(space.target_area_m2 || 0), 0);

  return {
    programme_id: createStableId("programme", brief.project_name, targetTotal),
    source_brief_hash: computeCDSHashSync(brief),
    template_provenance: templateProvenance,
    spaces,
    adjacency_requirements: [
      {
        requirement_id: createStableId(
          "adjacency",
          brief.project_name,
          "arrival",
        ),
        from_tags: ["arrival"],
        to_tags: ["service"],
        priority: "medium",
      },
    ],
    area_summary: {
      net_area_m2: round(targetTotal - circulationArea, 2),
      circulation_area_m2: round(circulationArea, 2),
      gross_internal_area_m2: round(targetTotal, 2),
      efficiency_ratio: round(
        (targetTotal - circulationArea) / Math.max(1, targetTotal),
        3,
      ),
    },
    locked_by_user: Array.isArray(programSpaces) && programSpaces.length > 0,
  };
}

function polygonFromGeoJson(geojson) {
  const coordinates = geojson?.coordinates?.[0];
  if (!Array.isArray(coordinates)) {
    return [];
  }
  return coordinates
    .map((point) =>
      Array.isArray(point)
        ? { lat: Number(point[1]), lng: Number(point[0]) }
        : null,
    )
    .filter(
      (point) =>
        point && Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function buildFallbackSitePolygon(areaM2) {
  const width = Math.max(18, Math.sqrt(areaM2 * 1.35));
  const depth = Math.max(16, areaM2 / width);
  return rectangleToPolygon(0, 0, width, depth);
}

function insetRectFromBbox(bbox, inset = 2) {
  const width = Math.max(8, Number(bbox.width || 0) - inset * 2);
  const height = Math.max(8, Number(bbox.height || 0) - inset * 2);
  return rectangleToPolygon(
    Number(bbox.min_x || 0) + inset,
    Number(bbox.min_y || 0) + inset,
    width,
    height,
  );
}

const SITE_BOUNDARY_AUTHORITY_CONFIDENCE_THRESHOLD = 0.6;
const SITE_BOUNDARY_ESTIMATED_WARNING_CODE =
  "SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE";

function toFiniteMetric(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function boundarySourceLooksEstimated(source) {
  return /intelligent fallback|fallback/i.test(String(source || ""));
}

function siteAreaOutlierLimitForBrief(brief = {}) {
  const targetGia = Math.max(0, Number(brief.target_gia_m2 || 0));
  return Math.max(2500, targetGia * 24);
}

function isSiteAreaOutlierForBrief(areaM2, brief = {}) {
  const numericArea = Number(areaM2 || 0);
  return numericArea > 0 && numericArea > siteAreaOutlierLimitForBrief(brief);
}

function normalizeMainEntryForProjectGraph(input = {}, sitePolygon = []) {
  const supplied =
    input.mainEntry ||
    input.mainEntryDirection ||
    input.projectDetails?.mainEntry ||
    input.projectDetails?.mainEntryDirection ||
    input.locationData?.mainEntry ||
    input.locationData?.mainEntryDirection ||
    input.siteAnalysis?.mainEntry ||
    input.siteSnapshot?.metadata?.mainEntry ||
    null;
  if (supplied && typeof supplied === "object") {
    const bearingDeg = toFiniteMetric(
      supplied.bearingDeg ?? supplied.bearing,
      0,
    );
    const confidence = toFiniteMetric(supplied.confidence, 0.5);
    return {
      orientation: supplied.orientation || supplied.direction || "north",
      bearingDeg,
      frontageEdgeId: supplied.frontageEdgeId || null,
      mainEntryEdgeId: supplied.mainEntryEdgeId || null,
      source: supplied.source || "provided",
      confidence,
      warnings: Array.isArray(supplied.warnings) ? supplied.warnings : [],
    };
  }

  const manualDirection =
    input.projectDetails?.entranceManualOverride === true
      ? input.projectDetails?.entranceDirection
      : null;
  const resolved = resolveMainEntryDirection({
    sitePolygon,
    manualDirection,
    sunPath:
      input.locationData?.sunPath || input.siteSnapshot?.metadata?.sunPath,
  });
  return {
    orientation: resolved.orientation,
    bearingDeg: resolved.bearingDeg,
    frontageEdgeId: resolved.frontageEdgeId,
    mainEntryEdgeId: resolved.mainEntryEdgeId,
    source: resolved.source,
    confidence: resolved.confidence,
    warnings: resolved.warnings || [],
  };
}

function buildSiteContext({
  brief,
  sitePolygon = [],
  siteMetrics = {},
  siteBoundarySanity = null,
  mainEntry = null,
} = {}) {
  const boundarySanity = siteBoundarySanity || {};
  const authoritativeBoundaryAllowed =
    boundarySanity.boundaryAuthoritative !== false;
  const suppliedGeoBoundary =
    Array.isArray(sitePolygon) && sitePolygon.length >= 3
      ? sitePolygon
      : polygonFromGeoJson(brief.site_input.boundary_geojson);
  const geoBoundary = authoritativeBoundaryAllowed ? suppliedGeoBoundary : [];
  const hasGeoBoundary =
    geoBoundary.length >= 3 &&
    Number.isFinite(Number(geoBoundary[0]?.lat)) &&
    Number.isFinite(Number(geoBoundary[0]?.lng));
  const origin = hasGeoBoundary
    ? computeGeoCentroid(geoBoundary)
    : { lat: brief.site_input.lat, lng: brief.site_input.lon };
  const fallbackAreaM2 = Math.max(brief.target_gia_m2 * 2.2, 320);
  const localBoundary = hasGeoBoundary
    ? polygonToLocalXY(geoBoundary, origin).map((point) => ({
        x: roundMetric(point.x),
        y: roundMetric(point.y),
      }))
    : buildFallbackSitePolygon(fallbackAreaM2);
  const boundaryBbox = buildBoundingBoxFromPolygon(localBoundary);
  const buildablePolygon = insetRectFromBbox(boundaryBbox, 2);
  const metricAreaM2 = authoritativeBoundaryAllowed
    ? Number(siteMetrics.areaM2 || 0)
    : 0;
  const areaM2 =
    metricAreaM2 || computePolygonArea(localBoundary) || fallbackAreaM2;
  const boundaryAuthoritative = hasGeoBoundary && authoritativeBoundaryAllowed;
  const boundaryConfidence =
    toFiniteMetric(boundarySanity.boundaryConfidence, null) ??
    (boundaryAuthoritative ? 1 : 0.4);
  const boundarySource =
    boundarySanity.boundarySource ||
    (boundaryAuthoritative ? "site_polygon" : "deterministic_context");
  const estimatedAreaM2 =
    boundarySanity.estimatedAreaM2 ||
    (!boundaryAuthoritative && Number(boundarySanity.sourceAreaM2 || 0) > 0
      ? Number(boundarySanity.sourceAreaM2)
      : null);
  const fallbackReason =
    boundarySanity.fallbackReason ||
    (!boundaryAuthoritative
      ? "No authoritative site boundary was supplied; using deterministic context geometry."
      : null);
  const dataQuality = boundaryAuthoritative
    ? [
        {
          code: "SITE_BOUNDARY_PROVIDED",
          severity: "info",
          message: "Site boundary was supplied by the request.",
        },
      ]
    : [
        {
          code: SITE_BOUNDARY_ESTIMATED_WARNING_CODE,
          severity: "warning",
          message:
            "Site boundary is estimated and is not treated as an authoritative parcel boundary or plot area.",
          details: {
            boundarySource,
            boundaryConfidence,
            fallbackReason,
            estimatedAreaM2,
            areaOutlier: boundarySanity.areaOutlier === true,
          },
        },
        {
          code: "SITE_BOUNDARY_FALLBACK",
          severity: "warning",
          message:
            "No authoritative site boundary was supplied; deterministic fallback boundary used for contextual rendering only.",
        },
      ];

  return {
    site_id: createStableId("site", brief.project_name, origin.lat, origin.lng),
    address_normalised: brief.site_input.address || null,
    lat: round(origin.lat, 6),
    lon: round(origin.lng ?? origin.lon, 6),
    boundary: boundaryAuthoritative
      ? brief.site_input.boundary_geojson || null
      : null,
    local_boundary_polygon: localBoundary,
    buildable_polygon: buildablePolygon,
    north_angle_degrees: Number(siteMetrics.orientationDeg || 0),
    area_m2: round(areaM2, 2),
    authoritative_area_m2: boundaryAuthoritative ? round(areaM2, 2) : null,
    estimated_area_m2:
      Number(estimatedAreaM2 || 0) > 0 ? round(estimatedAreaM2, 2) : null,
    boundary_authoritative: boundaryAuthoritative,
    boundary_confidence: round(boundaryConfidence, 3),
    boundary_source: boundarySource,
    boundary_estimated: !boundaryAuthoritative,
    estimated_only: !boundaryAuthoritative,
    fallback_reason: fallbackReason,
    boundary_warning_code: boundaryAuthoritative
      ? null
      : SITE_BOUNDARY_ESTIMATED_WARNING_CODE,
    estimated_geo_boundary: boundaryAuthoritative
      ? []
      : boundarySanity.estimatedGeoBoundary || [],
    boundary_authority_reasons: boundarySanity.reasons || [],
    main_entry: mainEntry,
    access_edges: [
      {
        edge_id: mainEntry?.frontageEdgeId || "street-edge-primary",
        main_entry_edge_id: mainEntry?.mainEntryEdgeId || null,
        label: "Primary frontage / main entry edge",
        orientation: mainEntry?.orientation || null,
        bearing_deg: mainEntry?.bearingDeg ?? null,
        source:
          mainEntry?.source ||
          (boundaryAuthoritative ? "site_polygon" : "estimated_context"),
        confidence: mainEntry?.confidence ?? null,
      },
    ],
    adjacent_roads: [],
    neighbouring_buildings: [],
    context_height_stats: {
      source: "fallback_context_pack",
    },
    flood_risk: {
      status: "unknown",
      source: "not_configured",
    },
    heritage_flags: [],
    planning_policy_refs: [],
    data_quality: dataQuality,
  };
}

function normalizeGeoPolygonForMap(input = null) {
  const candidate = Array.isArray(input) ? input : polygonFromGeoJson(input);
  return candidate
    .map((point) => ({
      lat: Number(point?.lat ?? point?.latitude),
      lng: Number(point?.lng ?? point?.lon ?? point?.longitude),
    }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function resolveSiteBoundarySanity(input = {}, brief = {}) {
  const siteAnalysis =
    input.siteAnalysis ||
    input.locationData?.siteAnalysis ||
    input.siteSnapshot?.metadata?.siteAnalysis ||
    {};
  const siteMetrics = {
    ...(input.siteSnapshot?.metadata?.siteMetrics || {}),
    ...(input.sitePolygonMetrics || {}),
    ...(input.siteMetrics || {}),
  };
  const submittedGeoBoundary = normalizeGeoPolygonForMap(
    input.sitePolygon ||
      input.site_boundary ||
      brief.site_input?.boundary_geojson,
  );
  const estimatedGeoBoundary = normalizeGeoPolygonForMap(
    siteAnalysis.estimatedSiteBoundary ||
      siteAnalysis.contextualSiteBoundary ||
      siteAnalysis.siteBoundary ||
      input.locationData?.estimatedSiteBoundary ||
      input.locationData?.contextualSiteBoundary ||
      input.siteSnapshot?.polygon ||
      input.siteSnapshot?.sitePolygon,
  );
  const boundarySource =
    siteAnalysis.boundarySource ||
    siteMetrics.boundarySource ||
    input.locationData?.boundarySource ||
    (submittedGeoBoundary.length >= 3
      ? "site_polygon"
      : "deterministic_context");
  const manualVerifiedBoundary =
    boundarySource === "manual_verified" ||
    siteAnalysis.boundarySource === "manual_verified" ||
    siteMetrics.boundarySource === "manual_verified" ||
    input.locationData?.boundarySource === "manual_verified";
  const boundaryConfidence =
    toFiniteMetric(
      siteAnalysis.boundaryConfidence ??
        siteMetrics.boundaryConfidence ??
        input.locationData?.boundaryConfidence,
      null,
    ) ??
    (manualVerifiedBoundary ? 1 : submittedGeoBoundary.length >= 3 ? 1 : 0.4);
  const sourceAreaM2 = toFiniteMetric(
    siteMetrics.areaM2 ??
      siteMetrics.area ??
      siteMetrics.surfaceAreaM2 ??
      siteAnalysis.areaM2 ??
      siteAnalysis.area ??
      siteAnalysis.surfaceAreaM2 ??
      siteAnalysis.surfaceArea ??
      siteAnalysis.estimatedSurfaceArea ??
      input.locationData?.areaM2 ??
      input.locationData?.surfaceAreaM2 ??
      input.locationData?.surfaceArea,
    null,
  );
  const explicitNonAuthoritative = manualVerifiedBoundary
    ? false
    : siteAnalysis.boundaryAuthoritative === false ||
      siteMetrics.boundaryAuthoritative === false ||
      input.locationData?.boundaryAuthoritative === false ||
      siteAnalysis.boundaryEstimated === true ||
      siteAnalysis.estimatedOnly === true ||
      input.locationData?.boundaryEstimated === true;
  const lowConfidence =
    !manualVerifiedBoundary &&
    boundaryConfidence < SITE_BOUNDARY_AUTHORITY_CONFIDENCE_THRESHOLD;
  const fallbackSource =
    !manualVerifiedBoundary && boundarySourceLooksEstimated(boundarySource);
  const areaOutlier =
    !manualVerifiedBoundary && isSiteAreaOutlierForBrief(sourceAreaM2, brief);
  const hasSubmittedBoundary = submittedGeoBoundary.length >= 3;
  const reasons = [];

  if (!hasSubmittedBoundary) reasons.push("missing_boundary_polygon");
  if (explicitNonAuthoritative) reasons.push("explicitly_estimated");
  if (fallbackSource) reasons.push("fallback_source");
  if (lowConfidence) reasons.push("low_confidence");
  if (areaOutlier) reasons.push("area_outlier");

  const boundaryAuthoritative = manualVerifiedBoundary
    ? hasSubmittedBoundary
    : hasSubmittedBoundary &&
      !explicitNonAuthoritative &&
      !fallbackSource &&
      !lowConfidence &&
      !areaOutlier;
  const sanitizedSiteMetrics = { ...siteMetrics };
  if (!boundaryAuthoritative) {
    delete sanitizedSiteMetrics.areaM2;
  }
  sanitizedSiteMetrics.boundaryAuthoritative = boundaryAuthoritative;
  sanitizedSiteMetrics.boundaryConfidence = manualVerifiedBoundary
    ? 1
    : boundaryConfidence;
  sanitizedSiteMetrics.boundarySource = boundarySource;
  if (Number(sourceAreaM2 || 0) > 0) {
    sanitizedSiteMetrics.area = sourceAreaM2;
    sanitizedSiteMetrics.areaM2 = sourceAreaM2;
    sanitizedSiteMetrics.surfaceAreaM2 = sourceAreaM2;
  }

  return {
    boundaryAuthoritative,
    boundaryConfidence: manualVerifiedBoundary ? 1 : boundaryConfidence,
    boundarySource,
    fallbackReason:
      siteAnalysis.fallbackReason ||
      siteMetrics.fallbackReason ||
      input.locationData?.fallbackReason ||
      (boundaryAuthoritative
        ? null
        : "Boundary is estimated and must be verified by survey."),
    estimatedOnly: !boundaryAuthoritative,
    areaOutlier,
    reasons,
    sourceAreaM2,
    estimatedAreaM2:
      !boundaryAuthoritative && Number(sourceAreaM2 || 0) > 0
        ? sourceAreaM2
        : null,
    authoritativeAreaM2:
      boundaryAuthoritative && Number(sourceAreaM2 || 0) > 0
        ? sourceAreaM2
        : null,
    estimatedGeoBoundary:
      !boundaryAuthoritative && estimatedGeoBoundary.length >= 3
        ? estimatedGeoBoundary
        : [],
    siteMetrics: sanitizedSiteMetrics,
  };
}

function normalizeProvidedSiteSnapshot(siteSnapshot = null) {
  if (!siteSnapshot || typeof siteSnapshot !== "object") {
    return null;
  }
  const dataUrl =
    siteSnapshot.dataUrl ||
    siteSnapshot.imageUrl ||
    siteSnapshot.url ||
    siteSnapshot.siteMapDataUrl ||
    null;
  if (!dataUrl || typeof dataUrl !== "string") {
    return null;
  }
  const sourceHint =
    siteSnapshot.sourceUrl ||
    siteSnapshot.source ||
    siteSnapshot.metadata?.source ||
    null;
  const normalizedSource =
    typeof sourceHint === "string" &&
    /google[-_ ]static[-_ ]maps|google[-_ ]maps[-_ ]api/i.test(sourceHint)
      ? "google-static-maps"
      : "provided-site-snapshot";
  return {
    dataUrl,
    attribution:
      siteSnapshot.attribution ||
      siteSnapshot.metadata?.attribution ||
      (normalizedSource === "google-static-maps"
        ? "Map data © Google"
        : "Provided site map"),
    sourceUrl: normalizedSource,
    mapType: siteSnapshot.mapType || siteSnapshot.metadata?.mapType || null,
    drawPolygonOverlay: siteSnapshot.drawPolygonOverlay !== false,
    hasPolygon: Boolean(
      (Array.isArray(siteSnapshot.polygon) && siteSnapshot.polygon.length) ||
      (Array.isArray(siteSnapshot.sitePolygon) &&
        siteSnapshot.sitePolygon.length),
    ),
    sha256: siteSnapshot.sha256 || siteSnapshot.metadata?.sha256 || null,
    metadata: cloneData(siteSnapshot.metadata || {}),
  };
}

function firstUsableGeoPolygonForMap(candidates = []) {
  for (const candidate of candidates) {
    const polygon = normalizeGeoPolygonForMap(candidate);
    if (polygon.length >= 3) {
      return polygon;
    }
  }
  return [];
}

function resolveSiteMapDisplayPolygon({ input = {}, brief = {}, site = {} }) {
  const siteAnalysis =
    input.siteAnalysis ||
    input.locationData?.siteAnalysis ||
    input.siteSnapshot?.metadata?.siteAnalysis ||
    {};
  const snapshotMetadata = input.siteSnapshot?.metadata || {};
  const authoritativeCandidates = [
    input.sitePolygon,
    input.site_boundary,
    input.siteSnapshot?.sitePolygon,
    input.siteSnapshot?.polygon,
    brief.site_input?.boundary_geojson,
  ];

  if (site?.boundary_authoritative !== false) {
    return firstUsableGeoPolygonForMap(authoritativeCandidates);
  }

  return firstUsableGeoPolygonForMap([
    input.siteSnapshot?.sitePolygon,
    input.siteSnapshot?.polygon,
    snapshotMetadata.contextualBoundaryPolygon,
    input.locationData?.contextualSiteBoundary,
    input.locationData?.estimatedSiteBoundary,
    siteAnalysis.contextualSiteBoundary,
    siteAnalysis.estimatedSiteBoundary,
    siteAnalysis.siteBoundary,
  ]);
}

async function resolveSiteMapSnapshot({ input = {}, brief, site }) {
  const boundaryAuthoritative = site?.boundary_authoritative !== false;
  const providedSnapshot =
    input.siteSnapshot || input.siteMapSnapshot || input.siteMap || null;
  const provided = normalizeProvidedSiteSnapshot(providedSnapshot);
  const providedMapType = String(
    provided?.mapType || providedSnapshot?.mapType || "",
  ).toLowerCase();
  const requiresRoadmapRecapture =
    provided && ["hybrid", "satellite"].includes(providedMapType);
  if (provided && !requiresRoadmapRecapture) {
    return {
      ...provided,
      sourceUrl: provided.sourceUrl || "provided-site-snapshot",
      captureStatus: "provided",
    };
  }

  const polygon = resolveSiteMapDisplayPolygon({ input, brief, site });
  const center = input.siteSnapshot?.center ||
    input.siteSnapshot?.coordinates ||
    input.locationData?.coordinates || { lat: site.lat, lng: site.lon };
  const sitePlanMode = boundaryAuthoritative
    ? "authoritative_boundary"
    : polygon.length >= 3
      ? "contextual_estimated_boundary"
      : "context_only";

  // Authoritative/manual boundaries use solid blue; estimated/contextual
  // boundaries use amber so stale landuse polygons are visibly provisional.
  const blueAuthoritative = {
    strokeColor: "#1976D2",
    strokeWeight: 3,
    fillColor: "#1976D2",
    fillOpacity: 0.18,
  };
  const amberEstimated = {
    strokeColor: "#F59E0B",
    strokeWeight: 2,
    fillColor: "#F59E0B",
    fillOpacity: 0.08,
  };

  try {
    const snapshot = await getSiteSnapshotWithMetadata({
      coordinates: {
        lat: Number(center?.lat ?? site.lat),
        lng: Number(center?.lng ?? center?.lon ?? site.lon),
      },
      polygon: polygon.length >= 3 ? polygon : null,
      // Always draw the polygon overlay when we have one — the user needs
      // to see the auto-detected boundary even when it is non-authoritative.
      // The visual style and the `boundaryEstimated` metadata flag below
      // continue to differentiate the two states.
      drawPolygonOverlay: polygon.length >= 3,
      polygonStyle: boundaryAuthoritative ? blueAuthoritative : amberEstimated,
      zoom: Number(input.siteSnapshot?.zoom || 18),
      size: [1200, 780],
      mapType: "roadmap",
    });
    return snapshot
      ? {
          ...snapshot,
          captureStatus: "google_static_maps",
          sourceUrl: snapshot.sourceUrl || "google-static-maps",
          metadata: {
            ...(snapshot.metadata || {}),
            sitePlanMode,
            boundaryAuthoritative,
            boundaryEstimated: !boundaryAuthoritative,
            contextualBoundaryOverlayUsed:
              !boundaryAuthoritative && polygon.length >= 3,
            polygonPointCount: polygon.length,
          },
        }
      : null;
  } catch {
    return null;
  }
}

function buildClimatePack(brief, site) {
  let sunPath = null;
  let sunPathError = null;
  try {
    sunPath = computeSunPath(site.lat, site.lon);
  } catch (error) {
    sunPathError = error?.message || "unknown";
  }
  const summerPeak = sunPath?.summer_solstice?.peak?.altitudeDeg ?? null;
  const overheatingRisk =
    summerPeak !== null && summerPeak > 55
      ? "medium"
      : brief.building_type === "community" ||
          Number(brief.target_storeys || 1) > 1
        ? "medium"
        : "low";
  const overheatingDrivers = [
    "urban infill uncertainty",
    "glazing ratio to be verified",
  ];
  if (summerPeak !== null && summerPeak > 55) {
    overheatingDrivers.unshift(
      `summer-solstice peak altitude ${summerPeak}° exceeds 55° — south/west glazing requires shading`,
    );
  }
  const passiveMoves = [
    "Orient main occupied rooms toward controlled daylight.",
    "Use opening strategy and shading as geometry constraints, not caption-only claims.",
  ];
  if (sunPath?.recommendation?.rationale?.length) {
    for (const note of sunPath.recommendation.rationale) {
      passiveMoves.push(note);
    }
  }
  const dataQuality = [
    {
      code: "CLIMATE_PACK_WEATHER_FALLBACK",
      severity: "warning",
      message: "No live weather source was used in this vertical slice.",
    },
  ];
  if (sunPathError) {
    dataQuality.push({
      code: "SUN_PATH_COMPUTATION_FAILED",
      severity: "warning",
      message: `Deterministic sun-path could not be computed: ${sunPathError}`,
    });
  } else {
    dataQuality.push({
      code: "SUN_PATH_DETERMINISTIC",
      severity: "info",
      message:
        "Sun path computed deterministically from site lat/lon via suncalc.",
    });
  }
  return {
    lat: site.lat,
    lon: site.lon,
    weather_source: "fallback",
    weather_file_asset_id: null,
    climate_projection_refs: [
      "UKCP18 reference required before production use",
    ],
    sun_path: sunPath
      ? {
          source: sunPath.source,
          schema_version: sunPath.schema_version,
          summer_solstice: sunPath.summer_solstice,
          winter_solstice: sunPath.winter_solstice,
          spring_equinox: sunPath.spring_equinox,
          autumn_equinox: sunPath.autumn_equinox,
          recommendation: sunPath.recommendation,
        }
      : {
          source: "deterministic_fallback",
          orientation_note:
            "Sun-path computation failed; defaulting to UK southern-glazing heuristic.",
        },
    wind: {
      exposure: "unknown",
      source: "fallback",
    },
    rainfall: {
      exposure: "uk_temperate_assumption",
      source: "fallback",
    },
    overheating: {
      risk_level: overheatingRisk,
      part_o_required: brief.building_type === "dwelling",
      tm59_recommended: brief.building_type === "dwelling",
      key_drivers: overheatingDrivers,
      mitigation_moves: [
        "external shading",
        "cross ventilation",
        "high-performance envelope",
      ],
    },
    passive_design_moves: passiveMoves,
    material_weathering_notes: [
      "Select robust UK external materials and detail exposed edges for rain.",
    ],
    data_quality: dataQuality,
  };
}

function buildRegulationPack(brief) {
  const jurisdiction = resolveJurisdiction(brief);
  const applicableParts = getApplicablePartsFor(
    jurisdiction,
    brief.building_type,
  );
  const sourceDocuments = listSourceDocumentsForParts(applicableParts);
  const generalSource = {
    source_document_id: "govuk-approved-documents",
    title: "GOV.UK Approved Documents collection",
    url: "https://www.gov.uk/government/collections/approved-documents",
    retrieved_at: null,
  };
  return {
    jurisdiction,
    building_type: brief.building_type,
    riba_stage: "2",
    source_documents: [generalSource, ...sourceDocuments],
    applicable_parts: applicableParts.map((part) => ({
      part,
      status: "precheck_pending",
    })),
    // precheck_results gets populated by applyRegulationRules() after geometry exists.
    precheck_results: [],
    rule_coverage: [],
    rule_summary: null,
    limitations: [
      PROFESSIONAL_REVIEW_DISCLAIMER,
      ...jurisdictionLimitations(jurisdiction),
    ],
    last_checked_at: null,
  };
}

function applyRegulationRules(regulations, ctx) {
  const applicableParts = (regulations?.applicable_parts || [])
    .map((entry) => entry?.part)
    .filter(Boolean);
  const ruleRun = runRegulationRules({
    ...ctx,
    applicableParts,
  });
  const ruleSummary = summarizeRuleResults(ruleRun.results);
  return {
    ...regulations,
    jurisdiction: ruleRun.jurisdiction || regulations.jurisdiction,
    applicable_parts: applicableParts.map((part) => {
      const evaluated = ruleRun.rule_coverage?.find(
        (entry) => entry.part === part,
      )?.evaluated;
      return {
        part,
        status: evaluated ? "rule_evaluated" : "manual_review_required",
      };
    }),
    precheck_results: ruleRun.results,
    rule_coverage: ruleRun.rule_coverage,
    rule_summary: ruleSummary,
    limitations: [
      ...(regulations.limitations || []),
      ...(ruleRun.limitations || []),
    ].filter((value, index, arr) => arr.indexOf(value) === index),
    last_checked_at: new Date(0).toISOString(),
  };
}

function buildLocalStylePack(brief, site, climate) {
  // Plan §6.5 weighted blend: local 40 / user 25 / climate 20 / portfolio 15
  // modulated by user_intent.local_blend_strength and innovation_strength.
  return buildLocalStylePackV2({
    brief,
    site,
    climate,
    createStableId,
    paletteSize: 6,
  });
}

function groupSpacesByLevel(spaces, levelCount) {
  const groups = Object.fromEntries(
    Array.from({ length: levelCount }, (_, index) => [index, []]),
  );
  spaces.forEach((space) => {
    const levelIndex = Math.max(
      0,
      Math.min(
        levelCount - 1,
        Number.parseInt(space.target_level_index ?? 0, 10) || 0,
      ),
    );
    groups[levelIndex].push(space);
  });
  return groups;
}

function balanceBands(spaces = []) {
  const sorted = [...spaces].sort(
    (left, right) =>
      Number(right.target_area_m2 || 0) - Number(left.target_area_m2 || 0),
  );
  const bands = [
    { spaces: [], area: 0 },
    { spaces: [], area: 0 },
  ];
  sorted.forEach((space) => {
    const targetBand = bands[0].area <= bands[1].area ? bands[0] : bands[1];
    targetBand.spaces.push(space);
    targetBand.area += Number(space.target_area_m2 || 0);
  });
  return bands.filter((band) => band.spaces.length > 0);
}

function buildLevelFootprintWithinBase(baseFootprint = [], targetAreaM2 = 0) {
  const baseBbox = buildBoundingBoxFromPolygon(baseFootprint);
  const baseWidth = Number(baseBbox.width || 0);
  const baseHeight = Number(baseBbox.height || 0);
  const baseArea = baseWidth * baseHeight;
  const targetArea = Number(targetAreaM2 || 0);

  if (
    !Array.isArray(baseFootprint) ||
    baseFootprint.length < 3 ||
    !(baseWidth > 0) ||
    !(baseHeight > 0) ||
    !(targetArea > 0) ||
    targetArea >= baseArea * 0.995
  ) {
    return baseFootprint;
  }

  const aspect = baseWidth / Math.max(baseHeight, 0.001);
  let width = Math.sqrt(targetArea * aspect);
  let height = targetArea / Math.max(width, 0.001);

  if (width > baseWidth) {
    width = baseWidth;
    height = targetArea / Math.max(width, 0.001);
  }
  if (height > baseHeight) {
    height = baseHeight;
    width = targetArea / Math.max(height, 0.001);
  }

  const x = Number(baseBbox.min_x || 0) + Math.max(0, (baseWidth - width) / 2);
  const y =
    Number(baseBbox.min_y || 0) + Math.max(0, (baseHeight - height) / 2);
  return rectangleToPolygon(x, y, width, height);
}

function addRoomWallsAndOpenings({
  room,
  levelId,
  footprintBbox,
  walls,
  doors,
  windows,
  mainEntryOrientation = null,
}) {
  const polygon = room.polygon;
  const edges = [
    [polygon[0], polygon[1], "south"],
    [polygon[1], polygon[2], "east"],
    [polygon[2], polygon[3], "north"],
    [polygon[3], polygon[0], "west"],
  ];
  const wallIds = [];
  const tolerance = 0.01;
  edges.forEach(([start, end, side], index) => {
    const exterior =
      Math.abs(start.y - footprintBbox.min_y) < tolerance &&
      Math.abs(end.y - footprintBbox.min_y) < tolerance
        ? true
        : Math.abs(start.y - footprintBbox.max_y) < tolerance &&
            Math.abs(end.y - footprintBbox.max_y) < tolerance
          ? true
          : Math.abs(start.x - footprintBbox.min_x) < tolerance &&
              Math.abs(end.x - footprintBbox.min_x) < tolerance
            ? true
            : Math.abs(start.x - footprintBbox.max_x) < tolerance &&
              Math.abs(end.x - footprintBbox.max_x) < tolerance;
    const wallId = createStableId("wall", room.id, side, index);
    wallIds.push(wallId);
    walls.push({
      id: wallId,
      level_id: levelId,
      room_ids: [room.id],
      start,
      end,
      thickness_m: exterior ? 0.24 : 0.14,
      exterior,
      orientation: side,
      metadata: { side },
    });
  });

  const roomWalls = walls.filter((wall) => wall.room_ids?.includes(room.id));
  const exteriorWalls = roomWalls.filter((wall) => wall.exterior === true);
  const midpoint = (wall) => ({
    x: round((Number(wall.start?.x || 0) + Number(wall.end?.x || 0)) / 2),
    y: round((Number(wall.start?.y || 0) + Number(wall.end?.y || 0)) / 2),
  });
  const wallLength = (wall) =>
    Math.hypot(
      Number(wall.end?.x || 0) - Number(wall.start?.x || 0),
      Number(wall.end?.y || 0) - Number(wall.start?.y || 0),
    );
  const roomName = String(room.name || "").toLowerCase();
  const preferredEntryOrientation = String(mainEntryOrientation || "")
    .toLowerCase()
    .trim();
  const entranceWall =
    exteriorWalls.find(
      (wall) => wall.orientation === preferredEntryOrientation,
    ) ||
    exteriorWalls.find((wall) => wall.orientation === "south") ||
    exteriorWalls.find((wall) => wall.orientation === "west") ||
    exteriorWalls[0];
  const doorWall =
    roomName.includes("entrance") && entranceWall
      ? entranceWall
      : roomWalls.find((wall) => wall.exterior !== true) || roomWalls[0];
  doors.push({
    id: createStableId("door", room.id),
    level_id: levelId,
    wall_id: doorWall?.id || wallIds[0],
    room_ids: [room.id],
    width_m: roomName.includes("entrance") ? 1.1 : 0.9,
    position: midpoint(doorWall || roomWalls[0] || { start: {}, end: {} }),
    kind: roomName.includes("entrance") ? "main_entrance" : "door",
  });

  exteriorWalls
    .sort((a, b) => wallLength(b) - wallLength(a))
    .slice(0, room.requires_daylight === false ? 1 : 2)
    .forEach((exteriorWall) => {
      const length = wallLength(exteriorWall);
      if (length < 1.2) return;
      windows.push({
        id: createStableId("window", room.id, exteriorWall.id),
        level_id: levelId,
        wall_id: exteriorWall.id,
        room_ids: [room.id],
        width_m: Math.max(0.9, Math.min(2.6, length * 0.36)),
        sill_height_m: 0.85,
        head_height_m: 2.2,
        position: midpoint(exteriorWall),
        kind: "window",
      });
    });

  return wallIds;
}

function layoutRoomsForLevel({
  spaces,
  levelIndex,
  footprint,
  footprintBbox,
  walls,
  doors,
  windows,
  mainEntryOrientation = null,
}) {
  const levelId = `level-${levelIndex}`;
  const rooms = [];
  const bands = balanceBands(spaces);
  const targetArea = bands.reduce((sum, band) => sum + band.area, 0);
  const totalDepth = Math.max(1, Number(footprintBbox.height || 0));
  let cursorY = Number(footprintBbox.min_y || 0);

  bands.forEach((band, bandIndex) => {
    const bandDepth =
      bandIndex === bands.length - 1
        ? Number(footprintBbox.max_y || 0) - cursorY
        : totalDepth * (band.area / Math.max(1, targetArea));
    let cursorX = Number(footprintBbox.min_x || 0);
    band.spaces.forEach((space, index) => {
      const roomWidth =
        index === band.spaces.length - 1
          ? Number(footprintBbox.max_x || 0) - cursorX
          : Number(footprintBbox.width || 0) *
            (Number(space.target_area_m2 || 0) / Math.max(1, band.area));
      const polygon = rectangleToPolygon(
        cursorX,
        cursorY,
        roomWidth,
        bandDepth,
      );
      const room = {
        id: space.space_id,
        name: space.name,
        type: space.function,
        program_type: space.function,
        level_id: levelId,
        polygon,
        actual_area_m2: computePolygonArea(polygon),
        target_area_m2: space.target_area_m2,
        zone: space.zone,
        requires_daylight: space.required_daylight !== "low",
        provenance: {
          source: "project_graph_vertical_slice",
          programme_space_id: space.space_id,
        },
      };
      room.wall_ids = addRoomWallsAndOpenings({
        room,
        levelId,
        footprintBbox,
        walls,
        doors,
        windows,
        mainEntryOrientation,
      });
      rooms.push(room);
      cursorX += roomWidth;
    });
    cursorY += bandDepth;
  });

  const stair =
    levelIndex === 0 && bands.length > 0
      ? {
          id: createStableId("stair", levelId, footprint),
          level_id: levelId,
          type: "straight_run",
          polygon: rectangleToPolygon(
            Number(footprintBbox.max_x || 0) -
              Math.min(2.2, footprintBbox.width * 0.14),
            Number(footprintBbox.min_y || 0) +
              Math.min(2, footprintBbox.height * 0.12),
            Math.min(2.2, footprintBbox.width * 0.14),
            Math.min(4.2, footprintBbox.height * 0.38),
          ),
          connects_to_level: `level-${levelIndex + 1}`,
        }
      : null;

  return { rooms, stair };
}

function buildProjectGeometryFromProgramme({
  brief,
  site,
  programme,
  localStyle,
  climate = null,
}) {
  const levelCount = Number(brief.target_storeys || 1);
  const groups = groupSpacesByLevel(programme.spaces, levelCount);
  const levelAreas = Object.values(groups).map((spaces) =>
    spaces.reduce((sum, space) => sum + Number(space.target_area_m2 || 0), 0),
  );
  // Plan §6.7: generate ≥3 typological options, score each, and use the
  // highest-scoring footprint that fits the buildable polygon.
  const candidateOptions = generateRectangularOptions({
    brief,
    site,
    levelAreas,
  });
  const scoredOptions = candidateOptions.map((option) =>
    scoreOption({ option, brief, site, climate, programme }),
  );
  const selected = selectBestOption(scoredOptions) || scoredOptions[0];
  const baseFootprint = selected.footprint_polygon;
  const levels = [];
  const rooms = [];
  const walls = [];
  const doors = [];
  const windows = [];
  const stairs = [];
  const footprints = [];

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    const levelId = `level-${levelIndex}`;
    const levelRooms = groups[levelIndex] || [];
    const levelTargetArea = levelRooms.reduce(
      (sum, space) => sum + Number(space.target_area_m2 || 0),
      0,
    );
    const footprint = levelRooms.length
      ? buildLevelFootprintWithinBase(baseFootprint, levelTargetArea)
      : baseFootprint;
    const footprintBbox = buildBoundingBoxFromPolygon(footprint);
    const layout = layoutRoomsForLevel({
      spaces: levelRooms,
      levelIndex,
      footprint,
      footprintBbox,
      walls,
      doors,
      windows,
      mainEntryOrientation: site?.main_entry?.orientation || null,
    });
    rooms.push(...layout.rooms);
    if (layout.stair && levelIndex + 1 < levelCount) {
      stairs.push(layout.stair);
    }
    const footprintId = createStableId("footprint", levelId, footprint);
    footprints.push({
      id: footprintId,
      level_id: levelId,
      polygon: footprint,
    });
    levels.push({
      id: levelId,
      name: `${levelName(levelIndex)} Floor`,
      level_number: levelIndex,
      elevation_m: round(levelIndex * 3.2),
      height_m: 3.2,
      room_ids: layout.rooms.map((room) => room.id),
      wall_ids: walls
        .filter((wall) => wall.level_id === levelId)
        .map((wall) => wall.id),
      door_ids: doors
        .filter((door) => door.level_id === levelId)
        .map((door) => door.id),
      window_ids: windows
        .filter((window) => window.level_id === levelId)
        .map((window) => window.id),
      stair_ids: stairs
        .filter((stair) => stair.level_id === levelId)
        .map((stair) => stair.id),
      footprint_id: footprintId,
    });
  }

  const roofFootprint =
    footprints[footprints.length - 1]?.polygon || baseFootprint;
  const roofBbox = buildBoundingBoxFromPolygon(roofFootprint);
  const ridgeY = round((roofBbox.min_y + roofBbox.max_y) / 2);
  const projectGeometry = {
    schema_version: CANONICAL_PROJECT_GEOMETRY_VERSION,
    project_id: createStableId("project", brief.project_name),
    site: {
      boundary_polygon: site.local_boundary_polygon,
      buildable_polygon: site.buildable_polygon,
      area_m2: site.area_m2,
      orientation_deg: site.north_angle_degrees,
      setbacks: { front: 2, rear: 2, left: 2, right: 2 },
    },
    levels,
    rooms,
    walls,
    doors,
    windows,
    stairs,
    circulation: [],
    columns: [],
    beams: [],
    slabs: [],
    roof_primitives: [
      {
        id: createStableId("roof-plane", roofFootprint),
        primitive_family: "roof_plane",
        type: brief.building_type === "community" ? "low_pitch_roof" : "gable",
        support_mode: "explicit_generated",
        polygon: roofFootprint,
        slope_deg: brief.building_type === "community" ? 8 : 35,
        eave_depth_m: 0.35,
      },
      {
        id: createStableId("roof-ridge", roofFootprint),
        primitive_family: "ridge",
        type: "ridge",
        start: { x: roofBbox.min_x, y: ridgeY },
        end: { x: roofBbox.max_x, y: ridgeY },
        ridge_height_m: round(levelCount * 3.2 + 1.4),
      },
    ],
    foundations: [],
    base_conditions: [],
    roof: {
      type: brief.building_type === "community" ? "low_pitch" : "gable",
      polygon: roofFootprint,
    },
    footprints,
    elevations: [],
    sections: [],
    annotations: [],
    metadata: {
      units: "meters",
      deterministic: true,
      requested_building_type: brief.building_type,
      source: "project_graph_vertical_slice",
      style_dna: {
        localStyle: localStyle.primary_style,
        materials: localStyle.material_palette,
        roof_language:
          brief.building_type === "community"
            ? "civic low pitch"
            : "domestic gable",
      },
      canonical_construction_truth: {
        roof: {
          support_mode: "explicit_generated",
          primitive_count: 2,
          plane_count: 1,
          ridge_count: 1,
        },
      },
      design_options: scoredOptions.map((opt) => ({
        option_id: opt.option_id,
        label: opt.label,
        typology: opt.typology,
        aspect: opt.aspect,
        long_axis: opt.long_axis,
        fits_buildable: opt.fits_buildable,
        subscores: opt.subscores,
        aggregate_score: opt.aggregate_score,
        selected: opt.option_id === selected.option_id,
      })),
      selected_option_id: selected.option_id,
    },
    provenance: {
      source: "project_graph_vertical_slice",
      generator: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
      strategy: "projectgraph-first",
    },
  };

  return projectGeometry;
}

function syncProgrammeActuals(programme, projectGeometry) {
  const actualBySpace = new Map(
    projectGeometry.rooms.map((room) => [room.id, room.actual_area_m2]),
  );
  const spaces = programme.spaces.map((space) => ({
    ...space,
    actual_area_m2: round(actualBySpace.get(space.space_id) || 0, 2),
    actual_level_id:
      space.actual_level_id || `level-${space.target_level_index || 0}`,
    polygon_ref: space.space_id,
    mesh_ref: space.space_id,
    qa_status: actualBySpace.has(space.space_id) ? "placed" : "unplaced",
  }));
  const actualTotal = spaces.reduce(
    (sum, space) => sum + Number(space.actual_area_m2 || 0),
    0,
  );
  const circulationArea = spaces
    .filter((space) => space.name.toLowerCase().includes("circulation"))
    .reduce((sum, space) => sum + Number(space.actual_area_m2 || 0), 0);

  return {
    ...programme,
    spaces,
    area_summary: {
      net_area_m2: round(actualTotal - circulationArea, 2),
      circulation_area_m2: round(circulationArea, 2),
      gross_internal_area_m2: round(actualTotal, 2),
      efficiency_ratio: round(
        (actualTotal - circulationArea) / Math.max(1, actualTotal),
        3,
      ),
    },
  };
}

function buildSelectedDesign(compiledProject, programme) {
  const levelsById = new Map(
    (compiledProject.levels || []).map((level) => [level.id, level]),
  );
  const spaces = (compiledProject.rooms || []).map((room) => {
    const level = levelsById.get(room.levelId) || {};
    return {
      space_id: room.sourceId || room.id,
      compiled_room_id: room.id,
      level_id: room.levelId,
      boundary_polygon_m: room.polygon || [],
      floor_z_m: Number(level.elevation_m || level.bottom_m || 0),
      ceiling_z_m: Number(level.top_m || 0),
      area_m2: room.actual_area_m2,
      volume_m3: round(
        Number(room.actual_area_m2 || 0) * Number(level.height_m || 3.2),
      ),
      doors: (compiledProject.openings || [])
        .filter(
          (opening) =>
            opening.type === "door" &&
            (opening.roomIds || []).includes(room.id),
        )
        .map((opening) => opening.id),
      windows: (compiledProject.openings || [])
        .filter(
          (opening) =>
            opening.type === "window" &&
            (opening.roomIds || []).includes(room.id),
        )
        .map((opening) => opening.id),
      material_zone: room.zone || null,
    };
  });

  return {
    building_id: createStableId("building", compiledProject.geometryHash),
    source_programme_id: programme.programme_id,
    levels: cloneData(compiledProject.levels || []),
    grids: [],
    spaces,
    elements: [
      ...(compiledProject.walls || []).map((wall) => ({
        element_id: wall.id,
        type: "wall",
        level_ids: [wall.levelId].filter(Boolean),
        geometry_ref: wall.id,
        material_id: wall.exterior ? "external-wall" : "internal-partition",
        fire_relevance: wall.exterior === true,
        thermal_relevance: wall.exterior === true,
      })),
      ...(compiledProject.slabs || []).map((slab) => ({
        element_id: slab.id,
        type: "slab",
        level_ids: [slab.levelId].filter(Boolean),
        geometry_ref: slab.id,
        material_id: "floor-slab",
      })),
      ...(compiledProject.roof?.planes || []).map((plane) => ({
        element_id: plane.id,
        type: "roof",
        level_ids: (compiledProject.levels || [])
          .slice(-1)
          .map((level) => level.id),
        geometry_ref: plane.id,
        material_id: "roof-finish",
        thermal_relevance: true,
      })),
    ],
    openings: cloneData(compiledProject.openings || []),
    stairs: cloneData(compiledProject.stairs || []),
    circulation: [],
    materials: [
      {
        material_id: "external-wall",
        label: compiledProject.materials?.primary || "warm brick",
      },
      {
        material_id: "internal-partition",
        label: "painted timber-lined partition",
      },
      {
        material_id: "roof-finish",
        label: compiledProject.materials?.roof?.primary || "standing seam roof",
      },
    ],
    site_landscape: [],
    model_bounds_m: cloneData(compiledProject.envelope || {}),
    exported_assets: [],
  };
}

function drawingTypeForPanel(panelType) {
  if (panelType.startsWith("floor_plan_")) return "floor_plan";
  if (panelType.startsWith("section_")) return "section";
  if (panelType.startsWith("elevation_")) return "elevation";
  return "diagram";
}

function buildDrawingSet(compiledProject, options = {}) {
  // Pass layoutTemplate through so the technical pack renders at the slot
  // aspect of the active sheet template (presentation-v3 for residential,
  // board-v2 otherwise). Caller resolves via resolvePresentationLayoutTemplate.
  const layoutTemplate =
    typeof options.layoutTemplate === "string" && options.layoutTemplate
      ? options.layoutTemplate
      : "board-v2";
  const technicalBuild = buildCompiledProjectTechnicalPanels(compiledProject, {
    layoutTemplate,
  });
  const technicalPanels = technicalBuild.technicalPanels || {};
  const drawingViews = Object.entries(technicalPanels).map(
    ([panelType, panel]) => {
      const drawingType = drawingTypeForPanel(panelType);
      const assetId = createStableId("asset-svg", panelType, panel.svgHash);
      return {
        drawing_id: createStableId(
          "drawing",
          panelType,
          compiledProject.geometryHash,
        ),
        type: drawingType,
        panel_type: panelType,
        source_model_hash: compiledProject.geometryHash,
        source_project_graph_id: null,
        scale:
          drawingType === "floor_plan"
            ? "1:100"
            : drawingType === "section"
              ? "1:100"
              : "1:200",
        level_id: panelType.startsWith("floor_plan_")
          ? panel.technicalQualityMetadata?.level_id || null
          : null,
        cut_plane: panelType.startsWith("section_")
          ? {
              section_type:
                panelType === "section_BB" ? "transverse" : "longitudinal",
              source: "compiled_project_section_cuts",
            }
          : null,
        camera: null,
        layers: [
          {
            layer_id: `${panelType}-geometry`,
            source: "compiled_project",
            entity_ids: [
              ...(compiledProject.rooms || []).map(
                (room) => room.sourceId || room.id,
              ),
              ...(compiledProject.walls || []).map((wall) => wall.id),
              ...(compiledProject.openings || []).map((opening) => opening.id),
            ],
          },
        ],
        annotations: [],
        exported_asset_ids: [assetId],
        svgHash: panel.svgHash,
        contentBounds: panel.contentBounds || null,
        normalizedViewBox: panel.normalizedViewBox || null,
        status: panel.status || "ready",
      };
    },
  );

  return {
    drawingSet: {
      model_version_id: `model-${compiledProject.geometryHash.slice(0, 12)}`,
      drawings: drawingViews,
    },
    drawingArtifacts: Object.fromEntries(
      Object.entries(technicalPanels).map(([panelType, panel]) => {
        const assetId = createStableId("asset-svg", panelType, panel.svgHash);
        return [
          assetId,
          {
            asset_id: assetId,
            asset_type: "drawing_svg",
            panel_type: panelType,
            source_model_hash: compiledProject.geometryHash,
            svgHash: panel.svgHash,
            width: panel.width,
            height: panel.height,
            svgString: panel.svgString,
            drawingType: panel.drawingType || drawingTypeForPanel(panelType),
            contentBounds: panel.contentBounds || null,
            normalizedViewBox: panel.normalizedViewBox || null,
            viewBoxNormalization: panel.viewBoxNormalization || null,
            technicalQualityMetadata: panel.technicalQualityMetadata || null,
            metadata: {
              source: "compiled_project_technical_panel",
              panelType,
              expectedPanelType: panelType,
              drawingType: panel.drawingType || drawingTypeForPanel(panelType),
              contentBounds: panel.contentBounds || null,
              normalizedViewBox: panel.normalizedViewBox || null,
              viewBoxNormalization: panel.viewBoxNormalization || null,
              technicalQualityMetadata: panel.technicalQualityMetadata || null,
            },
          },
        ];
      }),
    ),
    technicalBuild,
  };
}

function build3DProjection(compiledProject) {
  const assetId = createStableId(
    "asset-3d-scene",
    compiledProject.geometryHash,
  );
  return {
    asset_id: assetId,
    asset_type: "deterministic_3d_scene_json",
    source_model_hash: compiledProject.geometryHash,
    source: "compiled_project",
    geometryHash: compiledProject.geometryHash,
    scene: {
      levels: (compiledProject.levels || []).map((level) => ({
        id: level.id,
        elevation_m: level.elevation_m,
        height_m: level.height_m,
        footprint: level.footprint,
      })),
      room_volumes: (compiledProject.rooms || []).map((room) => {
        const level = (compiledProject.levels || []).find(
          (entry) => entry.id === room.levelId,
        );
        return {
          id: room.sourceId || room.id,
          compiled_room_id: room.id,
          level_id: room.levelId,
          polygon: room.polygon,
          z_min_m: Number(level?.elevation_m || 0),
          z_max_m: Number(level?.top_m || level?.height_m || 3.2),
          material_zone: room.zone || "unspecified",
        };
      }),
      walls: (compiledProject.walls || []).map((wall) => ({
        id: wall.id,
        level_id: wall.levelId,
        start: wall.start,
        end: wall.end,
        height_m:
          (compiledProject.levels || []).find(
            (level) => level.id === wall.levelId,
          )?.height_m || 3.2,
        thickness_m: wall.thickness_m,
      })),
      openings: cloneData(compiledProject.openings || []),
      roof: cloneData(compiledProject.roof || {}),
    },
  };
}

function build3DModelSet({ projectGraphId, scene3d, geometryHash }) {
  return {
    models: [
      {
        model_id: createStableId("model-3d", projectGraphId, geometryHash),
        asset_id: scene3d.asset_id,
        asset_type: scene3d.asset_type,
        projection_type: "deterministic_3d_scene",
        model_format: "json_scene",
        source_project_graph_id: projectGraphId,
        source_model_hash: geometryHash,
        geometryHash,
      },
    ],
    source_model_hash: geometryHash,
  };
}

function formatPanelTitle(panelType) {
  const raw = String(panelType || "panel");
  const levelMatch = raw.match(/^floor_plan_level(\d+)$/);
  if (levelMatch) {
    const idx = Number.parseInt(levelMatch[1], 10);
    return `${levelName(idx)} floor plan`;
  }
  return raw
    .replace(/^floor_plan_ground$/, "Ground floor plan")
    .replace(/^floor_plan_first$/, "First floor plan")
    .replace(/^section_AA$/, "Section A-A")
    .replace(/^section_BB$/, "Section B-B")
    .replace(/^site_context$/, "Site plan")
    .replace(/^hero_3d$/, "Exterior perspective")
    .replace(/^exterior_render$/, "Exterior render")
    .replace(/^axonometric$/, "Axonometric view")
    .replace(/^interior_3d$/, "Interior perspective")
    .replace(/^material_palette$/, "Material palette")
    .replace(/^key_notes$/, "Key notes")
    .replace(/^title_block$/, "Title block")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeSheetSvgFragment(svgString = "") {
  return sanitizeInvalidSvgPaths(
    String(svgString || "").replace(/<script\b[\s\S]*?<\/script>/gi, ""),
  );
}

function extractSvgBody(svgString = "") {
  const sanitized = sanitizeSheetSvgFragment(svgString);
  const bodyMatch = sanitized.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  return bodyMatch ? bodyMatch[1] : sanitized;
}

function extractSvgViewBox(
  svgString = "",
  fallbackWidth = 1000,
  fallbackHeight = 700,
) {
  const viewBoxMatch = String(svgString).match(/viewBox=["']([^"']+)["']/i);
  if (viewBoxMatch?.[1]) {
    return viewBoxMatch[1];
  }
  return `0 0 ${round(fallbackWidth, 2)} ${round(fallbackHeight, 2)}`;
}

function normalizeArtifactCollection(artifacts = {}) {
  if (Array.isArray(artifacts)) {
    return artifacts.filter(Boolean);
  }
  if (!artifacts || typeof artifacts !== "object") {
    return [];
  }
  return Object.values(artifacts).filter(Boolean);
}

function buildPanelArtifactIndex(drawingArtifacts = {}) {
  const byPanelType = new Map();
  const byAssetId = new Map();
  normalizeArtifactCollection(drawingArtifacts).forEach((artifact) => {
    if (artifact.asset_id) {
      byAssetId.set(artifact.asset_id, artifact);
    }
    if (artifact.panel_type) {
      byPanelType.set(artifact.panel_type, artifact);
    }
  });
  return { byPanelType, byAssetId };
}

function getTechnicalQualityMetadata(artifact = null) {
  return (
    artifact?.technicalQualityMetadata ||
    artifact?.metadata?.technicalQualityMetadata ||
    {}
  );
}

function resolvePanelRenderMode(panelType, artifact = null) {
  const metadata = artifact?.metadata || {};
  if (REQUIRED_3D_A1_PANEL_TYPES.includes(panelType)) {
    if (
      metadata.source === "project_graph_image_renderer" &&
      metadata.imageRenderFallback === false
    ) {
      return metadata.visualRenderMode || "geometry_locked_image_render";
    }
    return metadata.visualRenderMode || "deterministic_control";
  }
  if (
    String(panelType || "").startsWith("floor_plan_") ||
    String(panelType || "").startsWith("section_") ||
    String(panelType || "").startsWith("elevation_")
  ) {
    return "compiled_technical_svg";
  }
  return metadata.source || artifact?.asset_type || "project_graph_data_panel";
}

function buildPanelReferenceMetrics({
  panelType,
  artifact = null,
  placement = null,
  geometryHash = null,
  briefInputHash = null,
  layoutTemplate = "board-v2",
} = {}) {
  const bounds = getTechnicalContentBounds(artifact);
  const technicalQualityMetadata = getTechnicalQualityMetadata(artifact);
  const contentBBoxRatio = {
    occupancyRatio: round(Number(bounds?.occupancyRatio || 0), 4),
    widthRatio: round(Number(bounds?.widthRatio || 0), 4),
    heightRatio: round(Number(bounds?.heightRatio || 0), 4),
  };
  const slotOccupancy = round(
    Number(
      technicalQualityMetadata.slot_occupancy_ratio ??
        technicalQualityMetadata.slotOccupancyRatio ??
        contentBBoxRatio.occupancyRatio,
    ),
    4,
  );
  const finalSlotFit = computePanelSlotFitMetrics({
    panelType,
    artifact,
    placement,
    layoutTemplate: placement?.layoutTemplate || layoutTemplate,
  });
  const sourceGeometryHash =
    artifact?.source_model_hash ||
    artifact?.geometryHash ||
    artifact?.metadata?.sourceGeometryHash ||
    artifact?.metadata?.renderProvenance?.sourceGeometryHash ||
    placement?.source_model_hash ||
    geometryHash ||
    null;
  const renderMode = resolvePanelRenderMode(panelType, artifact);
  const panelIdentityHash = computeCDSHashSync({
    sourceGeometryHash,
    svgHash: artifact?.svgHash || placement?.svgHash || null,
    normalizedViewBox: getTechnicalNormalizedViewBox(artifact),
    contentBBoxRatio,
    renderMode,
    drawingType:
      artifact?.drawingType ||
      artifact?.metadata?.drawingType ||
      technicalQualityMetadata.drawing_type ||
      null,
  });
  return {
    slotOccupancy,
    finalSlotOccupancy: finalSlotFit?.occupancyRatio ?? null,
    finalSlotFit,
    contentBBoxRatio,
    sourceGeometryHash,
    panelIdentityHash,
    briefInputHash: briefInputHash || null,
    renderMode,
  };
}

function polygonPath(points = [], bbox, width, height, padding = 12) {
  if (!Array.isArray(points) || points.length < 3 || !bbox) {
    return "";
  }
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, Number(bbox.width || 1)),
    (height - padding * 2) / Math.max(1, Number(bbox.height || 1)),
  );
  const offsetX = (width - Number(bbox.width || 0) * scale) / 2;
  const offsetY = (height - Number(bbox.height || 0) * scale) / 2;
  if (
    !Number.isFinite(scale) ||
    !Number.isFinite(offsetX) ||
    !Number.isFinite(offsetY)
  ) {
    return "";
  }
  const segments = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const x =
      offsetX + (Number(point?.x || 0) - Number(bbox.min_x || 0)) * scale;
    const y =
      height -
      (offsetY + (Number(point?.y || 0) - Number(bbox.min_y || 0)) * scale);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return "";
    }
    segments.push(`${index === 0 ? "M" : "L"} ${round(x, 2)} ${round(y, 2)}`);
  }
  return `${segments.join(" ")} Z`;
}

function mapLocalPointToSiteSvg(point, bbox, width, height, padding = 12) {
  if (!point || !bbox) return null;
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, Number(bbox.width || 1)),
    (height - padding * 2) / Math.max(1, Number(bbox.height || 1)),
  );
  const offsetX = (width - Number(bbox.width || 0) * scale) / 2;
  const offsetY = (height - Number(bbox.height || 0) * scale) / 2;
  const x = offsetX + (Number(point?.x || 0) - Number(bbox.min_x || 0)) * scale;
  const y =
    height -
    (offsetY + (Number(point?.y || 0) - Number(bbox.min_y || 0)) * scale);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseBoundaryEdgeIndex(edgeId = null) {
  const match = String(edgeId || "").match(/edge-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function resolveMainEntryAnchor(site, bbox, width, height) {
  const boundary = site?.local_boundary_polygon || [];
  if (!Array.isArray(boundary) || boundary.length < 3) return null;
  const edgeIndex = parseBoundaryEdgeIndex(
    site?.main_entry?.mainEntryEdgeId || site?.main_entry?.frontageEdgeId,
  );
  if (Number.isFinite(edgeIndex)) {
    const start = boundary[edgeIndex % boundary.length];
    const end = boundary[(edgeIndex + 1) % boundary.length];
    return mapLocalPointToSiteSvg(
      {
        x: (Number(start?.x || 0) + Number(end?.x || 0)) / 2,
        y: (Number(start?.y || 0) + Number(end?.y || 0)) / 2,
      },
      bbox,
      width,
      height,
    );
  }
  const bearing = Number(site?.main_entry?.bearingDeg || 0);
  const radians = (bearing * Math.PI) / 180;
  const scorePoint = (point) =>
    Number(point?.x || 0) * Math.sin(radians) +
    Number(point?.y || 0) * Math.cos(radians);
  const selected = [...boundary].sort(
    (a, b) => scorePoint(b) - scorePoint(a),
  )[0];
  return mapLocalPointToSiteSvg(selected, bbox, width, height);
}

function buildMainEntryArrowSvg(site, bbox) {
  const mainEntry = site?.main_entry || {};
  const anchor = resolveMainEntryAnchor(site, bbox, 812, 646);
  if (!anchor) return "";
  const bearingDeg = Number(mainEntry.bearingDeg || 0);
  const radians = (bearingDeg * Math.PI) / 180;
  const length = 82;
  const dx = Math.sin(radians) * length;
  const dy = -Math.cos(radians) * length;
  const startX = round(anchor.x - dx * 0.24, 2);
  const startY = round(anchor.y - dy * 0.24, 2);
  const endX = round(anchor.x + dx * 0.76, 2);
  const endY = round(anchor.y + dy * 0.76, 2);
  const labelX = round(anchor.x + dx * 0.92, 2);
  const labelY = round(anchor.y + dy * 0.92, 2);
  const orientation = mainEntry.orientation || "north";
  return `<g transform="translate(44 66)" data-main-entry-source="${escapeXml(mainEntry.source || "unknown")}" data-main-entry-orientation="${escapeXml(orientation)}" data-main-entry-bearing="${escapeXml(String(round(bearingDeg, 1)))}">
    <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#1976D2" stroke-width="7" stroke-linecap="round" marker-end="url(#main-entry-arrowhead)"/>
    <text x="${labelX}" y="${labelY}" font-family="Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle" fill="#1976D2">MAIN ENTRY</text>
    <text x="${labelX}" y="${labelY + 22}" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#1976D2">${escapeXml(orientation)} ${escapeXml(String(round(bearingDeg, 0)))} deg</text>
  </g>`;
}

function buildSiteContextPanelArtifact({
  projectGraphId,
  site,
  geometryHash,
  siteSnapshot = null,
}) {
  const width = 900;
  const height = 900;
  const bbox = buildBoundingBoxFromPolygon(site.local_boundary_polygon || []);
  const sitePath = polygonPath(site.local_boundary_polygon, bbox, 812, 646);
  const buildablePath = polygonPath(site.buildable_polygon, bbox, 812, 646);
  const buildableBbox = buildBoundingBoxFromPolygon(
    site.buildable_polygon || site.local_boundary_polygon || [],
  );
  const proposedFootprint = rectangleToPolygon(
    Number(buildableBbox.min_x || 0) + Number(buildableBbox.width || 0) * 0.24,
    Number(buildableBbox.min_y || 0) + Number(buildableBbox.height || 0) * 0.3,
    Math.max(8, Number(buildableBbox.width || 0) * 0.52),
    Math.max(8, Number(buildableBbox.height || 0) * 0.36),
  );
  const proposedFootprintPath = polygonPath(proposedFootprint, bbox, 812, 646);
  const boundaryEstimated =
    site?.boundary_authoritative === false || site?.boundary_estimated === true;
  const boundaryLabel =
    site?.boundary_source === "manual_verified"
      ? "MANUAL VERIFIED"
      : boundaryEstimated
        ? "ESTIMATED / CONTEXTUAL - VERIFY"
        : "AUTHORITATIVE";
  const sitePlanMode = boundaryEstimated
    ? "contextual_estimated_boundary"
    : "authoritative_boundary";
  const mainEntryArrowSvg = buildMainEntryArrowSvg(site, bbox);
  const hasMapImage = Boolean(siteSnapshot?.dataUrl);
  const mapSource = hasMapImage
    ? siteSnapshot.sourceUrl || siteSnapshot.source || "provided-site-snapshot"
    : "deterministic-site-svg-fallback";
  const mapLabel =
    mapSource === "google-static-maps"
      ? "Google Static Maps"
      : hasMapImage
        ? "Provided site map"
        : "Deterministic fallback site diagram";
  const attribution = hasMapImage
    ? siteSnapshot.attribution || "Map image supplied by request"
    : "No map snapshot available";
  const mapLayer = boundaryEstimated
    ? hasMapImage
      ? `<image x="28" y="52" width="844" height="676" href="${escapeXml(siteSnapshot.dataUrl)}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="28" y="52" width="844" height="676" fill="none" stroke="#111111" stroke-width="3"/>
  <g transform="translate(44 66)">
    <path d="${sitePath}" fill="#b7d7a833" stroke="#e87524" stroke-width="4" stroke-dasharray="16 10"/>
    <path d="${buildablePath}" fill="none" stroke="#111111" stroke-width="3" stroke-dasharray="8 8"/>
    <path d="${proposedFootprintPath}" fill="#11111133" stroke="#111111" stroke-width="4"/>
  </g>
  <text x="450" y="104" font-family="Arial, sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#111111">${boundaryLabel}</text>
  <text x="450" y="136" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="#555555">Boundary estimated - verify with measured survey before planning submission</text>`
      : `<rect x="28" y="52" width="844" height="676" fill="#f7f6f0"/>
  <rect x="28" y="52" width="844" height="676" fill="none" stroke="#111111" stroke-width="3"/>
  <path d="M 78 636 C 186 586 272 612 354 562 C 456 500 584 520 824 462" fill="none" stroke="#d7d7d7" stroke-width="34" opacity="0.8"/>
  <path d="M 78 636 C 186 586 272 612 354 562 C 456 500 584 520 824 462" fill="none" stroke="#ffffff" stroke-width="22" opacity="0.96"/>
  <path d="M 112 142 L 196 186 L 282 152 L 372 206 L 470 166 L 590 222 L 770 190" fill="none" stroke="#c7cfbf" stroke-width="14" opacity="0.7"/>
  <path d="M 130 506 L 246 452 L 372 474 L 520 424 L 712 444" fill="none" stroke="#c7cfbf" stroke-width="12" opacity="0.6"/>
  <g transform="translate(44 66)">
    <path d="${sitePath}" fill="#fff7ed" stroke="#e87524" stroke-width="4" stroke-dasharray="16 10"/>
    <path d="${buildablePath}" fill="none" stroke="#29332a" stroke-width="3" stroke-dasharray="8 8"/>
    <path d="${proposedFootprintPath}" fill="#11111122" stroke="#111111" stroke-width="4"/>
  </g>
  <text x="450" y="104" font-family="Arial, sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#111111">${boundaryLabel}</text>
  <text x="450" y="136" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="#555555">Boundary estimated - verify with measured survey before planning submission</text>`
    : hasMapImage
      ? `<image x="28" y="52" width="844" height="676" href="${escapeXml(siteSnapshot.dataUrl)}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="28" y="52" width="844" height="676" fill="none" stroke="#111111" stroke-width="3"/>
  <g transform="translate(44 66)" opacity="0.88">
    <path d="${sitePath}" fill="#1976D222" stroke="#1976D2" stroke-width="5"/>
    <path d="${buildablePath}" fill="none" stroke="#111111" stroke-width="3"/>
    <path d="${proposedFootprintPath}" fill="#11111133" stroke="#111111" stroke-width="4"/>
  </g>
  <text x="450" y="104" font-family="Arial, sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#111111">${boundaryLabel}</text>`
      : `<rect x="28" y="52" width="844" height="676" fill="#f3efe4" stroke="#111111" stroke-width="3"/>
  <g transform="translate(44 66)">
    <path d="${sitePath}" fill="#1976D222" stroke="#1976D2" stroke-width="5"/>
    <path d="${buildablePath}" fill="none" stroke="#111111" stroke-width="3"/>
    <path d="${proposedFootprintPath}" fill="#11111133" stroke="#111111" stroke-width="4"/>
  </g>
  <path d="M 64 642 C 186 600 272 620 354 574 C 440 526 552 540 806 488" fill="none" stroke="#c8c8c8" stroke-width="28" opacity="0.55"/>
  <path d="M 64 642 C 186 600 272 620 354 574 C 440 526 552 540 806 488" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.85"/>
  <text x="450" y="104" font-family="Arial, sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#111111">${boundaryLabel}</text>`;
  const areaLabel = boundaryEstimated
    ? `Site area: ${site.area_m2} m2 (context) | Boundary source: ${site.boundary_source || "estimated"} | Confidence: ${site.boundary_confidence ?? "n/a"} | Main entry: ${site.main_entry?.orientation || "north"} (${site.main_entry?.source || "fallback"})`
    : `Site area: ${site.area_m2} m2 | Boundary source: ${site.boundary_source || "site_polygon"} | Confidence: ${site.boundary_confidence ?? "n/a"} | Main entry: ${site.main_entry?.orientation || "north"} (${site.main_entry?.source || "fallback"})`;
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="site_context" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}" data-site-map-source="${escapeXml(mapSource)}" data-site-map-image="${hasMapImage ? "true" : "false"}" data-boundary-source="${escapeXml(site.boundary_source || "")}" data-boundary-confidence="${escapeXml(String(site.boundary_confidence ?? ""))}" data-main-entry-orientation="${escapeXml(site.main_entry?.orientation || "")}">
  <defs>
    <marker id="main-entry-arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M 0 0 L 12 6 L 0 12 z" fill="#1976D2"/>
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  ${mapLayer}
  ${mainEntryArrowSvg}
  <path d="M 806 142 L 806 70 L 784 116 M 806 70 L 828 116" fill="none" stroke="#111111" stroke-width="5" stroke-linecap="round"/>
  <circle cx="806" cy="112" r="46" fill="none" stroke="#111111" stroke-width="2"/>
  <text x="806" y="58" font-family="Arial, sans-serif" font-size="32" font-weight="700" text-anchor="middle" fill="#111111">N</text>
  <text x="450" y="342" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#333333">${boundaryEstimated ? "Proposed Footprint" : "Rear Garden"}</text>
  <text x="450" y="682" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#333333">${boundaryEstimated ? "Estimated Boundary" : "Front Garden"}</text>
  <text x="82" y="690" font-family="Arial, sans-serif" font-size="20" fill="#333333">${boundaryEstimated ? "Context Street" : "Driveway"}</text>
  <line x1="48" y1="790" x2="348" y2="790" stroke="#111111" stroke-width="5"/>
  <line x1="48" y1="780" x2="48" y2="800" stroke="#111111" stroke-width="3"/>
  <line x1="168" y1="780" x2="168" y2="800" stroke="#111111" stroke-width="3"/>
  <line x1="288" y1="780" x2="288" y2="800" stroke="#111111" stroke-width="3"/>
  <text x="48" y="824" font-family="Arial, sans-serif" font-size="18" fill="#111111">0</text>
  <text x="158" y="824" font-family="Arial, sans-serif" font-size="18" fill="#111111">10</text>
  <text x="278" y="824" font-family="Arial, sans-serif" font-size="18" fill="#111111">20m</text>
  <text x="48" y="860" font-family="Arial, sans-serif" font-size="17" fill="#333333">Scale 1:500</text>
  <text x="852" y="824" font-family="Arial, sans-serif" font-size="15" text-anchor="end" fill="#555555">${escapeXml(mapLabel)}</text>
  <text x="852" y="852" font-family="Arial, sans-serif" font-size="13" text-anchor="end" fill="#777777">${escapeXml(attribution)}</text>
  <text x="852" y="878" font-family="Arial, sans-serif" font-size="13" text-anchor="end" fill="#777777">${escapeXml(areaLabel)} | ${escapeXml(geometryHash.slice(0, 12))}</text>
</svg>`;
  const svgHash = computeCDSHashSync({ panelType: "site_context", svgString });
  const assetId = createStableId(
    "asset-svg",
    "site_context",
    geometryHash,
    svgHash,
  );
  return {
    asset_id: assetId,
    asset_type: "drawing_svg",
    panel_type: "site_context",
    source_model_hash: geometryHash,
    geometryHash,
    authoritySource: "project_graph_compiled_geometry",
    svgHash,
    width,
    height,
    svgString,
    dataUrl: siteSnapshot?.dataUrl || null,
    metadata: {
      deterministic: true,
      source: hasMapImage ? mapSource : "deterministic_site_context_fallback",
      siteMapSource: mapSource,
      hasMapImage,
      mapType: siteSnapshot?.mapType || null,
      attribution,
      sitePlanMode,
      boundaryAuthoritative: site.boundary_authoritative === true,
      boundaryEstimated,
      boundaryConfidence: site.boundary_confidence ?? null,
      boundarySource: site.boundary_source || null,
      boundaryLabel,
      boundaryWarningCode: site.boundary_warning_code || null,
      fallbackReason: site.fallback_reason || null,
      siteAreaM2: site.area_m2 ?? null,
      mainEntry: site.main_entry || null,
      mainEntryOrientation: site.main_entry?.orientation || null,
      mainEntryBearingDeg: site.main_entry?.bearingDeg ?? null,
      mainEntrySource: site.main_entry?.source || null,
      authoritativeAreaM2: site.authoritative_area_m2 || null,
      estimatedAreaM2: site.estimated_area_m2 || null,
      svgHash,
    },
  };
}

export function buildMaterialPalettePanelArtifact({
  projectGraphId,
  localStyle,
  compiledProject,
  styleDNA,
  brief,
  geometryHash,
  // Phase 2 — when present, the SheetDesignContext supplies the canonical
  // materials list (normalized via getCanonicalMaterialPalette + DNA fallback).
  // We prefer ctx.materials over the localStyle / DNA collection so style +
  // material + climate stay coherent across panels. When absent, fall back to
  // the legacy Phase E collection logic.
  sheetDesignContext = null,
}) {
  const width = 700;
  const height = 900;
  const ctxMaterials = Array.isArray(sheetDesignContext?.materials)
    ? sheetDesignContext.materials.filter(
        (entry) => entry && (entry.name || entry.hexColor || entry.hex),
      )
    : [];
  const baseMaterials =
    ctxMaterials.length > 0
      ? ctxMaterials
      : normalizeMaterialPaletteEntriesShared({
          localStyle,
          compiledProject,
          styleDNA,
          brief,
        });
  // Always render up to 8 cards; if the collection is short, top up from the
  // canonical 8-material fallback so the 2×4 grid stays visually balanced.
  const materials = topUpMaterialPaletteWithCanonical(baseMaterials, 8);
  const { defs, cards, cardMetadata } = buildMaterialPaletteCards({
    materials,
    layout: {
      // Phase 2: 2 cols × 4 rows = 8 cards on the presentation-v3 row-3 slot.
      cols: 2,
      rows: 4,
      max: 8,
      cardWidth: 270,
      cardHeight: 120,
      gapX: 42,
      gapY: 60,
      startX: 58,
      startY: 110,
      labelOffset: 20,
      subLabelOffset: 38,
      labelFontSize: 17,
      subLabelFontSize: 13,
      fontFamily: "Arial, sans-serif",
      labelMaxChars: 22,
      subLabelMaxChars: 26,
      strokeWidth: 2,
      showCategoryLabel: true,
      categoryFontSize: 11,
      categoryOffset: 10,
    },
  });
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="material_palette" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}">
  <defs>${defs}</defs>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="34" y="48" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#111111">MATERIAL PALETTE</text>
  <line x1="34" y1="66" x2="666" y2="66" stroke="#111111" stroke-width="2"/>
  ${cards}
</svg>`;
  const svgHash = computeCDSHashSync({
    panelType: "material_palette",
    svgString,
    geometryHash,
  });
  const assetId = createStableId(
    "asset-svg",
    "material_palette",
    geometryHash,
    svgHash,
  );
  return {
    asset_id: assetId,
    asset_type: "project_graph_data_panel_svg",
    panel_type: "material_palette",
    panelType: "material_palette",
    source_model_hash: geometryHash,
    geometryHash,
    authoritySource: "project_graph_compiled_geometry",
    svgHash,
    width,
    height,
    svgString,
    cardMetadata,
    metadata: {
      deterministic: true,
      source: "project_graph_material_palette",
      panelType: "material_palette",
      geometryHash,
      materialCount: materials.length,
      materials,
      cardMetadata,
      // Phase 2 surfaces:
      cardCount: cardMetadata.length,
      categoryCount: new Set(
        cardMetadata.map((card) => card.category).filter(Boolean),
      ).size,
      categories: cardMetadata.map((card) => card.category || null),
      sheetDesignContextHash: sheetDesignContext?.contextHash || null,
      sourceContext: sheetDesignContext ? "sheet_design_context" : "legacy_dna",
    },
  };
}

function splitNoteLines(note = "", maxChars = 36, maxLines = 3) {
  const words = String(note || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

// Phase 2 — canonical Key Notes group order. The structure stays stable
// across runs so the panel order is deterministic regardless of input.
const KEY_NOTE_GROUP_ORDER = Object.freeze([
  "external_walls",
  "roof",
  "windows_doors",
  "heating_ventilation",
  "drainage",
  "sustainability",
  "climate_strategy",
  "dimensions_tolerances",
  "copyright",
]);

function pickMaterialByCategory(materials, predicate) {
  if (!Array.isArray(materials)) return null;
  return materials.find((m) => m && predicate(m)) || null;
}

function describeMaterial(material) {
  if (!material) return null;
  const name = String(material.name || "").trim();
  if (!name) return null;
  const hex = material.hexColor || material.hex || null;
  const application = String(material.application || "").trim();
  const tail = [];
  if (hex) tail.push(hex);
  if (application) tail.push(application);
  return tail.length ? `${name} (${tail.join(" / ")})` : name;
}

export function buildKeyNoteItems({
  brief,
  site,
  climate,
  regulations,
  localStyle,
  sheetDesignContext = null,
}) {
  const ctxMaterials =
    Array.isArray(sheetDesignContext?.materials) &&
    sheetDesignContext.materials.length
      ? sheetDesignContext.materials
      : null;
  const localPalette = Array.isArray(localStyle?.material_palette)
    ? localStyle.material_palette
    : [];
  const ctxClimate =
    sheetDesignContext?.climate ||
    (climate && typeof climate === "object" ? null : null);
  const climateZone =
    sheetDesignContext?.climate?.zone ||
    climate?.zone ||
    climate?.koppen ||
    null;
  const climateRainfall =
    sheetDesignContext?.climate?.rainfallBand ||
    sheetDesignContext?.climate?.rainfallMm ||
    climate?.rainfall_mm ||
    climate?.annual_rainfall_mm ||
    null;
  const climateStrategy =
    sheetDesignContext?.climate?.strategy ||
    climate?.strategy ||
    climate?.design_strategy ||
    null;
  const overheatingFlag =
    sheetDesignContext?.climate?.overheating === true ||
    climate?.overheating === true ||
    climate?.overheating?.risk_level === "high" ||
    climate?.overheating?.risk_level === "moderate";

  const wallMaterial =
    pickMaterialByCategory(ctxMaterials, (m) =>
      /external|wall|brick|render|stone|cladding|facade/i.test(
        `${m.application} ${m.name}`,
      ),
    ) ||
    (ctxMaterials && ctxMaterials[0]) ||
    null;
  const roofMaterial = pickMaterialByCategory(ctxMaterials, (m) =>
    /roof|tile|slate|standing\s*seam/i.test(`${m.application} ${m.name}`),
  );
  const openingMaterial = pickMaterialByCategory(ctxMaterials, (m) =>
    /window|opening|glaz|frame|aluminium|aluminum/i.test(
      `${m.application} ${m.name}`,
    ),
  );
  const doorMaterial = pickMaterialByCategory(ctxMaterials, (m) =>
    /door/i.test(`${m.application} ${m.name}`),
  );

  const wallPrimaryDesc = describeMaterial(wallMaterial);
  const roofDesc = describeMaterial(roofMaterial);
  const openingDesc = describeMaterial(openingMaterial);
  const doorDesc = describeMaterial(doorMaterial);
  const facadeFallback = localPalette.length
    ? localPalette
        .slice(0, 3)
        .map((entry) =>
          typeof entry === "string"
            ? entry
            : entry?.name || entry?.material || "",
        )
        .filter(Boolean)
        .join(", ")
    : null;

  const partL =
    sheetDesignContext?.sustainability?.partL ||
    regulations?.partL ||
    regulations?.part_l ||
    null;
  const fabricFirst =
    sheetDesignContext?.sustainability?.fabricFirst === true ||
    regulations?.fabric_first === true ||
    regulations?.fabricFirst === true;
  const sustainabilityAmbition =
    brief?.sustainability_ambition || "low energy / fabric-first";
  const programmeLabel = resolveProgrammeDisplayLabel(brief);

  const region =
    sheetDesignContext?.region ||
    site?.region ||
    site?.country ||
    brief?.site_input?.region ||
    "UK";
  const dateLabel = brief?.brief_date || brief?.date || null;

  const groups = {
    external_walls: {
      heading: "External walls",
      lines: [
        wallPrimaryDesc
          ? `Primary wall: ${wallPrimaryDesc}.`
          : facadeFallback
            ? `Facade palette: ${facadeFallback}.`
            : "Primary wall finish per local-style pack.",
        "Insulated cavity construction; verify U-values against Part L 2021.",
      ],
    },
    roof: {
      heading: "Roof",
      lines: [
        roofDesc
          ? `Roof: ${roofDesc}.`
          : "Pitched roof per regional vernacular.",
        "Concealed gutters; rooflights where indicated on plan.",
      ],
    },
    windows_doors: {
      heading: "Windows / Doors",
      lines: [
        openingDesc
          ? `Windows: ${openingDesc}.`
          : "Aluminium-framed double glazing, anthracite finish.",
        doorDesc
          ? `Front door: ${doorDesc}.`
          : "Solid timber front door with weather seal.",
      ],
    },
    heating_ventilation: {
      heading: "Heating / Ventilation",
      lines: [
        "Air-source heat pump with underfloor heating to ground floor.",
        "MVHR (mechanical ventilation with heat recovery) ducted through ceiling void.",
      ],
    },
    drainage: {
      heading: "Drainage",
      lines: [
        "Foul to public sewer; surface water to soakaway / SuDS where appropriate.",
        "Verify connections with local water authority before construction.",
      ],
    },
    sustainability: {
      heading: "Sustainability",
      lines: [
        partL
          ? `Compliance: ${String(partL).slice(0, 80)}.`
          : `Ambition: ${sustainabilityAmbition}; Part L 2021 fabric performance.`,
        fabricFirst
          ? "Fabric-first strategy: airtightness, continuous insulation, thermal bridging mitigation."
          : "Low-energy strategy with fabric performance prioritised over add-on services.",
      ],
    },
    climate_strategy: {
      heading: "Climate strategy",
      lines: [
        climateZone
          ? `Climate zone ${climateZone}${climateRainfall ? ` / rainfall ${typeof climateRainfall === "number" ? `${climateRainfall} mm/yr` : climateRainfall}` : ""}.`
          : "Climate strategy uses deterministic UK temperate defaults.",
        climateStrategy
          ? `${climateStrategy}.`
          : overheatingFlag
            ? "Overheating risk flagged; specify external solar shading and night purge."
            : "Passive solar + cross-ventilation; minimise summer gain on south-west glazing.",
      ],
    },
    dimensions_tolerances: {
      heading: "Dimensions / Tolerances",
      lines: [
        `Programme: ${programmeLabel}.`,
        "All dimensions in millimetres unless otherwise noted.",
        "Do not scale from drawing. Verify on site before construction.",
      ],
    },
    copyright: {
      heading: "Copyright / Disclaimer",
      lines: [
        `© Architecture AI Platform${dateLabel ? ` — ${dateLabel}` : ""}. RIBA Stage concept package, ${region}.`,
        "Drawings issued for early-stage design; require professional architectural / structural / planning review before construction.",
      ],
    },
  };

  return KEY_NOTE_GROUP_ORDER.map((id) => {
    const group = groups[id];
    return {
      id,
      heading: group.heading,
      lines: (group.lines || []).filter(Boolean),
    };
  });
}

export function buildKeyNotesPanelArtifact({
  projectGraphId,
  brief,
  site,
  climate,
  regulations,
  localStyle,
  geometryHash,
  sheetDesignContext = null,
}) {
  const width = 560;
  const height = 900;
  const groups = buildKeyNoteItems({
    brief,
    site,
    climate,
    regulations,
    localStyle,
    sheetDesignContext,
  });
  let cursorY = 102;
  const groupSvg = groups
    .map((group, index) => {
      const headingY = cursorY;
      const headingFontSize = 15;
      const bodyFontSize = 13;
      const lineHeight = 18;
      const bodyLines = group.lines.flatMap((line) =>
        splitNoteLines(line, 60, 2),
      );
      const blockHeight = 22 + bodyLines.length * lineHeight + 12;
      const bodyTextSvg = bodyLines
        .map(
          (line, lineIndex) =>
            `<text x="48" y="${headingY + 22 + lineIndex * lineHeight}" font-size="${bodyFontSize}" font-family="Arial, sans-serif" fill="#222222">${escapeXml(line)}</text>`,
        )
        .join("\n  ");
      const block = `<g data-key-note-id="${escapeXml(group.id)}" data-key-note-index="${index + 1}">
  <text x="34" y="${headingY}" font-size="${headingFontSize}" font-family="Arial, sans-serif" font-weight="700" fill="#111111" class="sheet-critical-label" data-text-role="critical">${index + 1}. ${escapeXml(group.heading)}</text>
  ${bodyTextSvg}
</g>`;
      cursorY += blockHeight;
      return block;
    })
    .join("\n");
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="key_notes" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="30" y="48" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111111">KEY NOTES</text>
  <line x1="30" y1="66" x2="530" y2="66" stroke="#111111" stroke-width="2"/>
  ${groupSvg}
</svg>`;
  const svgHash = computeCDSHashSync({
    panelType: "key_notes",
    svgString,
    geometryHash,
  });
  const assetId = createStableId(
    "asset-svg",
    "key_notes",
    geometryHash,
    svgHash,
  );
  return {
    asset_id: assetId,
    asset_type: "project_graph_data_panel_svg",
    panel_type: "key_notes",
    panelType: "key_notes",
    source_model_hash: geometryHash,
    geometryHash,
    authoritySource: "project_graph_compiled_geometry",
    svgHash,
    width,
    height,
    svgString,
    metadata: {
      deterministic: true,
      source: "project_graph_key_notes",
      panelType: "key_notes",
      geometryHash,
      noteCount: groups.length,
      groupOrder: KEY_NOTE_GROUP_ORDER.slice(),
      groupIds: groups.map((g) => g.id),
      groupHeadings: groups.map((g) => g.heading),
      programmeLabel: resolveProgrammeDisplayLabel(brief),
      buildingType: brief?.building_type || null,
      programmeTemplateKey: brief?.programme_template_key || null,
      sheetDesignContextHash: sheetDesignContext?.contextHash || null,
      sourceContext: sheetDesignContext ? "sheet_design_context" : "legacy_dna",
    },
  };
}

// Phase 2 — parse RIBA stage label from brief.user_intent.portfolio_mood,
// brief.riba_stage, or sheetPlan label fallback.
function resolveRibaStageLabel(brief, sheetPlan) {
  const fromBrief =
    brief?.riba_stage ||
    brief?.user_intent?.portfolio_mood ||
    brief?.user_intent?.riba_stage ||
    null;
  if (typeof fromBrief === "string") {
    const match = fromBrief.match(/(?:riba[_\s]*stage[_\s]*)?(\d)\b/i);
    if (match) return `RIBA Stage ${match[1]}`;
  }
  if (typeof fromBrief === "number" && Number.isFinite(fromBrief)) {
    return `RIBA Stage ${fromBrief}`;
  }
  if (sheetPlan?.label) {
    const match = String(sheetPlan.label).match(/RIBA\s*Stage\s*(\d)/i);
    if (match) return `RIBA Stage ${match[1]}`;
  }
  return "RIBA Stage 2";
}

function todayIsoDate() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function resolveProgrammeDisplayLabel(brief = {}) {
  return String(
    brief?.project_type_support?.label ||
      brief?.projectTypeSupport?.label ||
      brief?.programme_label ||
      brief?.programmeLabel ||
      brief?.building_type ||
      "architecture",
  )
    .replace(/[_-]+/g, " ")
    .trim();
}

export function buildTitleBlockPanelArtifact({
  projectGraphId,
  brief,
  geometryHash,
  sheetPlan,
  sheetDesignContext = null,
}) {
  const width = 620;
  const height = 900;
  const location =
    sheetDesignContext?.region && brief?.site_input?.address
      ? `${brief.site_input.address}, ${sheetDesignContext.region}`
      : brief?.site_input?.address ||
        brief?.site_input?.postcode ||
        sheetDesignContext?.region ||
        "Project site";
  const drawingNumber = sheetPlan?.sheet_number || "A1-00";
  const sheetLabel = sheetPlan?.label || "RIBA Stage 2 Master";
  const projectTitle = String(brief?.project_name || "ArchiAI Project")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const titleLines = splitNoteLines(projectTitle, 22, 2);
  const programmeLabel = resolveProgrammeDisplayLabel(brief);
  const ribaStageLabel = resolveRibaStageLabel(brief, sheetPlan);
  const status = String(
    brief?.status ||
      brief?.delivery_status ||
      sheetPlan?.status ||
      "Draft for review",
  ).trim();
  const revision = String(
    brief?.revision || brief?.rev || sheetPlan?.revision || "P01",
  ).trim();
  const dateLabel = String(
    brief?.brief_date || brief?.date || sheetPlan?.date || todayIsoDate(),
  ).trim();
  const architectName = String(
    brief?.architect ||
      sheetDesignContext?.architect ||
      "Architecture AI Platform",
  ).trim();
  const studioFooter = String(
    brief?.studio_footer ||
      sheetDesignContext?.studio_footer ||
      "Architecture | Design | Planning",
  ).trim();
  // Phase 2 — broader RIBA-style metadata. The first 5 rows preserve the
  // existing data source (so existing tests and downstream readers continue
  // working). The new rows surface RIBA Stage / Status / Revision / Date /
  // Drawing No. so reviewers get the full set on the sheet.
  const rows = [
    ["Project", brief?.project_name || "ArchiAI Project"],
    ["Location", location],
    ["Programme", programmeLabel],
    ["Target GIA", `${round(brief?.target_gia_m2 || 0, 1)} m²`],
    ["Storeys", `${brief?.target_storeys || 1}`],
    ["RIBA Stage", ribaStageLabel],
    ["Status", status],
    ["Revision", revision],
    ["Date", dateLabel],
    ["Drawing No.", drawingNumber],
  ];
  const rowStartY = 232;
  const rowGap = 50;
  const rowSvg = rows
    .map((row, index) => {
      const y = rowStartY + index * rowGap;
      const rawValue = String(row[1] || "");
      const valueMaxChars = index <= 1 ? 34 : 28;
      const valueLines = splitNoteLines(rawValue, valueMaxChars, 2);
      const valueFontSize =
        rawValue.length > 54 ? 12 : rawValue.length > 38 ? 14 : 16;
      return `<g>
  <line x1="34" y1="${y - 24}" x2="586" y2="${y - 24}" stroke="#999999" stroke-width="1"/>
  <text x="42" y="${y}" font-size="15" font-family="Arial, sans-serif" fill="#222222">${escapeXml(row[0])}</text>
  ${valueLines
    .map(
      (line, lineIndex) =>
        `<text x="220" y="${y + lineIndex * (valueFontSize + 3)}" font-size="${valueFontSize}" font-family="Arial, sans-serif" font-weight="700" fill="#111111">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}
</g>`;
    })
    .join("\n");
  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<text x="34" y="${76 + index * 40}" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#111111">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="title_block" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}" data-brief-input-hash="${escapeXml(brief?.brief_input_hash || "")}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="18" y="18" width="584" height="864" fill="none" stroke="#111111" stroke-width="3"/>
  ${titleSvg}
  <text x="34" y="170" font-family="Arial, sans-serif" font-size="20" fill="#333333">${escapeXml(programmeLabel.toUpperCase())}</text>
  <line x1="34" y1="206" x2="586" y2="206" stroke="#111111" stroke-width="2"/>
  ${rowSvg}
  <line x1="34" y1="780" x2="586" y2="780" stroke="#111111" stroke-width="1"/>
  <text x="34" y="808" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#222222">${escapeXml(architectName.toUpperCase())}</text>
  <text x="34" y="828" font-family="Arial, sans-serif" font-size="12" fill="#555555">${escapeXml(studioFooter)}</text>
  <text x="34" y="862" font-family="Arial, sans-serif" font-size="11" fill="#888888">source_model_hash ${escapeXml(String(geometryHash || "").slice(0, 16))}</text>
  <text x="586" y="862" font-family="Arial, sans-serif" font-size="11" text-anchor="end" fill="#888888">${escapeXml(`${ribaStageLabel} • Rev ${revision}`)}</text>
</svg>`;
  const svgHash = computeCDSHashSync({
    panelType: "title_block",
    svgString,
    geometryHash,
  });
  const assetId = createStableId(
    "asset-svg",
    "title_block",
    geometryHash,
    svgHash,
  );
  return {
    asset_id: assetId,
    asset_type: "project_graph_data_panel_svg",
    panel_type: "title_block",
    panelType: "title_block",
    source_model_hash: geometryHash,
    geometryHash,
    authoritySource: "project_graph_compiled_geometry",
    svgHash,
    width,
    height,
    svgString,
    metadata: {
      deterministic: true,
      source: "project_graph_title_block",
      panelType: "title_block",
      geometryHash,
      briefInputHash: brief?.brief_input_hash || null,
      referenceMatch: brief?.reference_match === true,
      projectName: brief?.project_name || null,
      location,
      targetGiaM2: Number(brief?.target_gia_m2 || 0),
      targetStoreys: Number(brief?.target_storeys || 1),
      buildingType: brief?.building_type || null,
      programmeLabel,
      supportStatus: brief?.support_status || null,
      programmeTemplateKey: brief?.programme_template_key || null,
      projectTypeRoute: brief?.project_type_route || null,
      drawingNumber,
      sheetLabel,
      // Phase 2 — RIBA-style metadata fields
      ribaStage: ribaStageLabel,
      status,
      revision,
      date: dateLabel,
      architect: architectName,
      studioFooter,
      rowKeys: rows.map((r) => r[0]),
      sheetDesignContextHash: sheetDesignContext?.contextHash || null,
      sourceContext: sheetDesignContext
        ? "sheet_design_context"
        : "legacy_brief",
    },
  };
}

function buildProjectGraphVisualContinuityBlock(visualManifest) {
  if (!visualManifest || typeof visualManifest !== "object") {
    return "";
  }

  const manifest = visualManifest;
  const roofForm = manifest.roof?.form || "specified roof form";
  const roofMaterial = manifest.roof?.materialName || "specified roof material";
  const primaryMaterial =
    manifest.primaryFacadeMaterial?.name || "specified primary facade material";
  const secondaryMaterial =
    manifest.secondaryFacadeMaterial?.name ||
    "specified secondary facade material";
  const windowRhythm = manifest.windowRhythm || "specified window rhythm";
  const entrance =
    manifest.entranceOrientation || "specified entrance position";

  return [
    "VISUAL CONTINUITY CONSTRAINTS:",
    `- Preserve the exact ${manifest.storeyCount || "specified"} storey count, footprint proportions, silhouette, and roofline from the geometry reference.`,
    `- Preserve roof form "${roofForm}" with ${roofMaterial}; do not flatten, steepen, rotate, or restyle the roof.`,
    `- Preserve facade material order: primary ${primaryMaterial}; secondary ${secondaryMaterial}; do not swap materials between panels.`,
    `- Preserve the ${windowRhythm} window rhythm, opening sizes, and opening positions from the reference geometry.`,
    `- Preserve the entrance at ${entrance}; do not relocate the front door.`,
    "- Do not invent extra bays, extra storeys, neighbouring buildings, signage, diagram labels, or text overlays.",
  ].join("\n");
}

// Build a climate + style + programme aware prompt for image-edit-based
// 3D panel rendering. Uses panelPromptBuilders.buildReasoningChainBlock
// so the gpt-image call sees the same upstream drivers (UK temperate,
// red brick + timber vernacular, 3-storey detached programme, etc.) that
// the deterministic pipeline already computed.
// Phase 4 — version stamp for the visual-panel render prompt + identity lock
// surface. Bump when the prompt structure or identity metadata changes so QA
// and tests can detect drift.
export const RENDER_PROMPT_IDENTITY_VERSION =
  "phase4-render-prompt-identity-v1";

function summariseProgramSpacesForCutaway(programSpaces) {
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) return "";
  const grouped = new Map();
  for (const space of programSpaces) {
    if (!space || !space.name) continue;
    const level = String(space.level || space.floor || "Ground");
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(String(space.name).trim());
  }
  if (grouped.size === 0) return "";
  const parts = [];
  for (const [level, rooms] of grouped) {
    const top = rooms.slice(0, 6).join(", ");
    parts.push(`${level}: ${top}`);
  }
  return parts.join(" | ");
}

function buildAxonometricCutawayIntent({ sheetDesignContext, brief }) {
  const programSummary = summariseProgramSpacesForCutaway(
    sheetDesignContext?.programSpaces,
  );
  const programmeLine = programSummary
    ? `Reveal the rooms and furniture as compositionally indicated by the programme — ${programSummary}.`
    : "Reveal the principal rooms and furniture as indicated by the programme.";
  const storeysHint = brief?.target_storeys
    ? `Show ${brief.target_storeys} storey(s) cleanly stacked with the upper slab cut away to expose the floors below.`
    : "Show all storeys cleanly stacked with each upper slab cut away to expose the floor below.";
  return [
    "Photoreal CUTAWAY axonometric 3D projection (30 degrees isometric) — architectural sectional axonometric.",
    "The roof and the upper portion of the building are partially removed (cut-away) so interior rooms, walls, doors, and key furniture are visible from above.",
    storeysHint,
    programmeLine,
    "Match the reference massing, roof outline, opening layout, materials, and entrance position exactly — only the cut-away reveal differs from the standard axonometric.",
    "Material textures legible on the remaining facades and on visible interior surfaces.",
  ].join(" ");
}

export function buildProjectGraphRenderPrompt({
  panelType,
  brief,
  compiledProject,
  climate,
  localStyle,
  styleDNA,
  programmeSummary,
  region,
  visualManifest = null,
  // Phase 4 — optional SheetDesignContext for cutaway programme injection
  // and stable identity hashing on every visual panel.
  sheetDesignContext = null,
  axonometricCutawayEnabled = false,
}) {
  const reasoning = buildReasoningChainBlock({
    locationData: { climate, region },
    masterDNA: { localStyle, styleDNA },
    projectContext: { programmeSummary, targetStoreys: brief?.target_storeys },
  });
  const cutawayActive =
    axonometricCutawayEnabled === true && panelType === "axonometric";
  const baseIntent =
    {
      hero_3d:
        "Photoreal hero exterior 3D perspective — magazine-cover quality. Match the silhouette of the reference image exactly (same massing, same roof shape, same opening positions, same storey count). Apply the materials, lighting, and detailing from the reasoning chain below.",
      exterior_render:
        "Photoreal front-elevation hero render — slight 12° angle, head-on composition. Match the reference silhouette exactly. Render with golden-hour lighting and physically-based materials.",
      axonometric:
        "Photoreal axonometric 3D projection (30° isometric) showing roof form and four facades. Match the reference massing, roof, and opening layout exactly. Material textures legible.",
      interior_3d:
        "Photoreal interior perspective — main living/kitchen space. Use the SAME materials and palette as the exterior. Match the reference interior volume.",
    }[panelType] || "Photoreal architectural render.";
  const intent = cutawayActive
    ? buildAxonometricCutawayIntent({ sheetDesignContext, brief })
    : baseIntent;
  const buildingType = brief?.building_type || "building";
  const projectName = brief?.project_name || "project";
  // Phase D: every visual-panel prompt is prefixed with the visual identity
  // lock block so all four panels (hero_3d / exterior_render / axonometric /
  // interior_3d) describe the same building. The block is identical across
  // panels for the same manifest, so OpenAI image generation cannot drift.
  const identityLock = buildVisualIdentityLockBlock(visualManifest);
  const visualContinuity =
    buildProjectGraphVisualContinuityBlock(visualManifest);
  return [
    identityLock,
    visualContinuity,
    `Project: ${projectName} — ${buildingType}.`,
    intent,
    reasoning,
    "STYLE: V-Ray + 3ds Max quality, octane-grade physically-based rendering, photoreal PBR materials, HDRI sky lighting, shallow depth of field, Dezeen / ArchDaily magazine cover quality, 8K, no watermark, no text, no diagrams. Single freestanding building, no neighbours.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function wrapPngAsSvgPanel(pngBuffer, viewBox, width, height) {
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
  <image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
}

async function buildVisual3DPanelArtifacts({
  compiledProject,
  geometryHash,
  brief = null,
  climate = null,
  localStyle = null,
  styleDNA = null,
  programmeSummary = null,
  region = null,
  visualManifest = null,
  // Phase 4 — optional SheetDesignContext for cutaway programme injection
  // and identity metadata propagation.
  sheetDesignContext = null,
}) {
  // Phase 4 — feature flag gate. Default off; production behaviour
  // unchanged. Server-side env override is `PROJECT_GRAPH_AXONOMETRIC_CUTAWAY_ENABLED=true`.
  const cutawayEnvOverride = String(
    (typeof process !== "undefined" &&
      process.env?.PROJECT_GRAPH_AXONOMETRIC_CUTAWAY_ENABLED) ||
      "",
  )
    .toLowerCase()
    .trim();
  const axonometricCutawayEnabled =
    cutawayEnvOverride === "true" ||
    cutawayEnvOverride === "1" ||
    isFeatureEnabled("axonometricCutawayEnabled");
  const renderInputs = ensureCompiledProjectRenderInputs(compiledProject, {
    geometryHash,
    views: REQUIRED_3D_A1_PANEL_TYPES,
  });
  const entries = await Promise.all(
    REQUIRED_3D_A1_PANEL_TYPES.map(async (panelType) => {
      const renderInput = renderInputs[panelType] || {};
      const deterministicSvgString = renderInput.svgString || "";
      const width = renderInput.width || renderInput.metadata?.width || 1500;
      const height = renderInput.height || renderInput.metadata?.height || 1050;
      const viewBox =
        renderInput.metadata?.normalizedViewBox || `0 0 ${width} ${height}`;

      // Phase 4: when PROJECT_GRAPH_IMAGE_GEN_ENABLED=true, anchor a
      // gpt-image call on the deterministic SVG silhouette and replace
      // the panel SVG with the photoreal PNG wrapped in an SVG <image>.
      // Falls back cleanly to the deterministic SVG when disabled or
      // when the image-gen call fails.
      let svgString = deterministicSvgString;
      let renderProvenance = null;
      let imageRenderByteLength = null;
      let imageRenderFallbackReason = "gate_disabled";
      let renderResult = null;
      if (deterministicSvgString) {
        const prompt = buildProjectGraphRenderPrompt({
          panelType,
          brief,
          compiledProject,
          climate,
          localStyle,
          styleDNA,
          programmeSummary,
          region,
          visualManifest,
          sheetDesignContext,
          axonometricCutawayEnabled,
        });
        try {
          renderResult = await renderProjectGraphPanelImage({
            panelType,
            deterministicSvg: deterministicSvgString,
            prompt,
            geometryHash,
          });
        } catch (renderErr) {
          if (renderErr?.strictImageGeneration === true) {
            throw renderErr;
          }
          // The renderer normally returns null on failure, but if it ever
          // throws we still want to capture the reason for QA.
          console.warn(
            `[projectGraphVerticalSlice] image renderer threw for ${panelType}:`,
            renderErr?.message,
          );
          renderResult = null;
          imageRenderFallbackReason =
            renderErr?.fallbackReason || "openai_error";
        }
        if (renderResult?.pngBuffer) {
          imageRenderByteLength = renderResult.pngBuffer.length;
          svgString = wrapPngAsSvgPanel(
            renderResult.pngBuffer,
            viewBox,
            width,
            height,
          );
          renderProvenance = renderResult.provenance;
          imageRenderFallbackReason = null;
        } else if (renderResult?.imageRenderFallbackReason) {
          imageRenderFallbackReason = renderResult.imageRenderFallbackReason;
        }
      } else {
        imageRenderFallbackReason = "empty_response";
      }
      const presentationMode = renderProvenance
        ? "geometry_locked_image_render"
        : "deterministic_control";
      const visualFidelityStatus = renderProvenance
        ? "photoreal_geometry_locked"
        : "degraded_control_render";
      const visualRenderMode = renderProvenance
        ? "photoreal_image_gen"
        : "deterministic_fallback";

      const svgHash =
        renderInput.svgHash ||
        computeCDSHashSync({ panelType, svgString, geometryHash });
      const assetId = createStableId(
        "asset-3d-panel-svg",
        panelType,
        geometryHash,
        svgHash,
      );
      return [
        assetId,
        {
          asset_id: assetId,
          asset_type: renderProvenance
            ? "geometry_locked_presentation_svg"
            : "compiled_3d_control_svg",
          panel_type: panelType,
          panelType,
          source_model_hash: geometryHash,
          geometryHash,
          authoritySource: "project_graph_compiled_geometry",
          svgHash,
          width,
          height,
          svgString,
          dataUrl: renderInput.dataUrl || null,
          metadata: {
            ...(cloneData(renderInput.metadata || {}) || {}),
            deterministic: renderProvenance === null,
            source: renderProvenance
              ? "project_graph_image_renderer"
              : "compiled_project_render_inputs",
            panelType,
            geometryHash,
            svgHash,
            sourceGeometryHash: geometryHash,
            referenceSource: "compiled_3d_control_svg",
            imageRenderFallback: renderProvenance === null,
            imageRenderFallbackReason,
            imageRenderModel: renderProvenance?.model || null,
            imageRenderSize: renderProvenance?.size || null,
            imageRenderByteLength,
            imageProviderUsed: renderProvenance ? "openai" : "deterministic",
            openaiConfigured:
              renderResult?.openaiConfigured ??
              renderResult?.provenance?.openaiConfigured ??
              false,
            openaiImageUsed: Boolean(renderProvenance),
            openaiRequestId: renderProvenance?.requestId || null,
            openaiUsage: renderProvenance?.usage || null,
            openaiKeySource:
              renderProvenance?.keySource ||
              renderResult?.keySource ||
              renderResult?.provenance?.keySource ||
              null,
            openaiKeyLast4:
              renderProvenance?.keyLast4 ||
              renderResult?.keyLast4 ||
              renderResult?.provenance?.keyLast4 ||
              null,
            presentationMode,
            visualFidelityStatus,
            visualRenderMode,
            renderProvenance,
            // Phase D — visual identity lock. Same hash on all four visual
            // panels means OpenAI image generation cannot drift the building
            // identity between panels. Even when the image gate is off and
            // the panel falls back to the deterministic SVG, the lock still
            // applies (the deterministic source is geometry-bound).
            visualManifestId: visualManifest?.manifestId || null,
            visualManifestHash: visualManifest?.manifestHash || null,
            visualIdentityLocked: Boolean(visualManifest?.manifestHash),
            // Phase 4 — extended identity metadata. Surfaces the
            // SheetDesignContext hash + cutaway flag + render prompt
            // identity version on every visual panel so QA, validators,
            // and downstream readers can prove the four panels share the
            // same source of truth and detect any drift quickly.
            sheetDesignContextHash: sheetDesignContext?.contextHash || null,
            axonometricCutawayEnabled:
              panelType === "axonometric"
                ? axonometricCutawayEnabled === true
                : false,
            renderPromptIdentityVersion: RENDER_PROMPT_IDENTITY_VERSION,
          },
        },
      ];
    }),
  );
  return Object.fromEntries(entries);
}

async function buildSheetPanelArtifacts({
  projectGraphId,
  site,
  climate,
  regulations,
  localStyle,
  styleDNA = null,
  programmeSummary = null,
  brief = null,
  region = null,
  compiledProject,
  geometryHash,
  siteSnapshot = null,
  sheetPlan = null,
  visualManifest = null,
  // Phase 1: optional SheetDesignContext. Reserved for downstream
  // consumers; not consumed by the existing data-panel builders yet.
  // eslint-disable-next-line no-unused-vars
  sheetDesignContext = null,
}) {
  const siteContext = buildSiteContextPanelArtifact({
    projectGraphId,
    site,
    climate,
    regulations,
    localStyle,
    geometryHash,
    siteSnapshot,
  });
  const materialPalette = buildMaterialPalettePanelArtifact({
    projectGraphId,
    localStyle,
    compiledProject,
    styleDNA,
    brief,
    geometryHash,
    sheetDesignContext,
  });
  const keyNotes = buildKeyNotesPanelArtifact({
    projectGraphId,
    brief,
    site,
    climate,
    regulations,
    localStyle,
    geometryHash,
    sheetDesignContext,
  });
  const titleBlock = buildTitleBlockPanelArtifact({
    projectGraphId,
    brief,
    geometryHash,
    sheetPlan,
    sheetDesignContext,
  });
  const visual3d = await buildVisual3DPanelArtifacts({
    compiledProject,
    geometryHash,
    brief,
    climate,
    localStyle,
    styleDNA,
    programmeSummary,
    region,
    visualManifest,
    sheetDesignContext,
  });
  return {
    [siteContext.asset_id]: siteContext,
    [materialPalette.asset_id]: materialPalette,
    [keyNotes.asset_id]: keyNotes,
    [titleBlock.asset_id]: titleBlock,
    ...visual3d,
  };
}

// Phase B: residential briefs default to the presentation-v3 layout. We keep
// the regex/list intentionally permissive so common UK property typologies
// route to presentation-v3; non-residential (office/civic/community/etc.)
// falls through to board-v2 (the existing technical-first layout).
const RESIDENTIAL_BUILDING_TYPES = new Set([
  "residential",
  "single_dwelling",
  "single-dwelling",
  "single dwelling",
  "detached",
  "detached_house",
  "detached-house",
  "semi_detached",
  "semi-detached",
  "terraced",
  "terraced_house",
  "terraced-house",
  "townhouse",
  "family_house",
  "family-house",
  "dwelling",
  "house",
  "multi_residential",
  "multi-residential",
  "multi-family",
  "multi_family",
  "apartment",
  "apartments",
  "flat",
  "flats",
  "extension",
  "loft_conversion",
  "loft-conversion",
  "refurb",
  "refurbishment",
]);

export function isResidentialBuildingType(buildingType) {
  if (!buildingType) return false;
  const normalized = String(buildingType)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (RESIDENTIAL_BUILDING_TYPES.has(normalized)) return true;
  // Catch sub-types like "residential_estate", "residential-tower", etc.
  if (normalized.includes("residential")) return true;
  if (normalized.includes("dwelling")) return true;
  return false;
}

export function resolvePresentationLayoutTemplate(brief = {}) {
  const buildingType =
    brief?.building_type ||
    brief?.buildingType ||
    brief?.building_category ||
    brief?.buildingCategory ||
    null;
  return isResidentialBuildingType(buildingType)
    ? "presentation-v3"
    : "board-v2";
}

// Phase B: presentation-v3 (residential default). Uses absolute mm within the
// 841×594 A1 sheet; mirrors composeCore's GRID_PRESENTATION_V3 hierarchy:
//   Row 1: site plan | ground floor | first floor | N/S elevations stacked
//   Row 2: section A-A | section B-B | axonometric | E/W elevations stacked
//   Row 3: exterior persp | interior persp | material | key notes | title block
// Phase B closeout v3: presentation-v3 row 1 metrics depend on storey count.
// For 3-storey residential (the only multi-plan case that fits on one A1
// after sheetSplitter forces 4+ to A1-002), shrink row 1 to 130mm and
// widen the plans column so each plan slot becomes landscape (aspect >=1.2).
// Standard 1-/2-storey boards use a tighter 180/178/200mm row stack so
// sections stop floating in oversized frames and bottom data panels fill
// the reference-board title/material area.
export function buildPresentationV3SheetPanelSpecs(targetStoreys = 1) {
  const storeyCount = Math.max(1, Number(targetStoreys) || 1);
  const isMultiStorey = storeyCount >= 3;

  // Row geometry (mm; A1 landscape = 841×594mm with 10mm side margins).
  const ROW_GAP = 8;
  const ROW1_Y = 10;
  const ROW1_H = isMultiStorey ? 130 : 180;
  const ROW2_Y = ROW1_Y + ROW1_H + ROW_GAP;
  const ROW2_H = isMultiStorey ? 246 : 178;
  const ROW3_Y = ROW2_Y + ROW2_H + ROW_GAP;
  const ROW3_H = isMultiStorey ? 178 : 200;

  // Top-row column ranges. For 3-storey we trade 40mm of site width and
  // 100mm of elevation width for a wider plans column (510mm vs 370mm)
  // so each cell can be landscape; elevations stack tighter (62mm each).
  const SITE_X = 10;
  const SITE_W = isMultiStorey ? 140 : 180;
  const PLANS_X = SITE_X + SITE_W + 10;
  const PLANS_W_TOTAL = isMultiStorey ? 510 : 370;
  const ELEV_X = PLANS_X + PLANS_W_TOTAL + 10;
  const ELEV_W = isMultiStorey ? 151 : 251;
  const ELEV_HALF_H = isMultiStorey ? 62 : 88;

  // Row 1 right-column N/S elevations (stacked).
  const elevationsRow1 = [
    {
      panelType: "elevation_north",
      x: ELEV_X,
      y: ROW1_Y,
      width: ELEV_W,
      height: ELEV_HALF_H,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "elevation_south",
      x: ELEV_X,
      y: ROW1_Y + ELEV_HALF_H + (isMultiStorey ? 6 : 4),
      width: ELEV_W,
      height: ELEV_HALF_H,
      scale: "1:100",
      required: true,
    },
  ];

  // Row 2 right-column E/W elevations. In multi-storey row 2 is 246mm
  // tall, so each elevation gets ~121mm height (still a comfortable
  // 2:1+ aspect). Standard rows keep 92mm halves.
  const ELEV_R2_HALF_H = isMultiStorey ? 121 : 87;
  const ELEV_R2_X = isMultiStorey ? 580 : ELEV_X;
  const ELEV_R2_W = isMultiStorey ? 251 : ELEV_W;
  const elevationsRow2 = [
    {
      panelType: "elevation_east",
      x: ELEV_R2_X,
      y: ROW2_Y,
      width: ELEV_R2_W,
      height: ELEV_R2_HALF_H,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "elevation_west",
      x: ELEV_R2_X,
      y: ROW2_Y + ELEV_R2_HALF_H + 4,
      width: ELEV_R2_W,
      height: ELEV_R2_HALF_H,
      scale: "1:100",
      required: true,
    },
  ];

  // Floor plans across row 1 plan column, scaled to storey count.
  const PLAN_GAP = 10;
  const planSlots = [];
  if (storeyCount === 1) {
    planSlots.push({
      panelType: "floor_plan_ground",
      x: PLANS_X,
      y: ROW1_Y,
      width: PLANS_W_TOTAL,
      height: ROW1_H,
      scale: "1:100",
      required: true,
    });
  } else if (storeyCount === 2) {
    const cellW = (PLANS_W_TOTAL - PLAN_GAP) / 2;
    planSlots.push(
      {
        panelType: "floor_plan_ground",
        x: PLANS_X,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
      {
        panelType: "floor_plan_first",
        x: PLANS_X + cellW + PLAN_GAP,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
    );
  } else {
    // 3 storeys (4+ goes through sheetSplitter to A1-002 technical sheet).
    const cellW = (PLANS_W_TOTAL - PLAN_GAP * 2) / 3;
    planSlots.push(
      {
        panelType: "floor_plan_ground",
        x: PLANS_X,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
      {
        panelType: "floor_plan_first",
        x: PLANS_X + cellW + PLAN_GAP,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
      {
        panelType: floorPlanPanelType(2),
        x: PLANS_X + (cellW + PLAN_GAP) * 2,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
    );
  }

  return [
    {
      panelType: "site_context",
      x: SITE_X,
      y: ROW1_Y,
      width: SITE_W,
      height: ROW1_H,
      scale: "1:500",
      required: true,
    },
    ...planSlots,
    ...elevationsRow1,
    {
      panelType: "section_AA",
      x: 10,
      y: ROW2_Y,
      width: 180,
      height: ROW2_H,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "section_BB",
      x: 200,
      y: ROW2_Y,
      width: 180,
      height: ROW2_H,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "axonometric",
      x: 390,
      y: ROW2_Y,
      width: 180,
      height: ROW2_H,
      scale: "3D",
      required: true,
    },
    ...elevationsRow2,
    {
      panelType: "hero_3d",
      x: 10,
      y: ROW3_Y,
      width: 200,
      height: ROW3_H,
      scale: "render",
      required: true,
    },
    {
      panelType: "interior_3d",
      x: 220,
      y: ROW3_Y,
      width: 200,
      height: ROW3_H,
      scale: "render",
      required: true,
    },
    {
      panelType: "material_palette",
      x: 430,
      y: ROW3_Y,
      width: 140,
      height: ROW3_H,
      scale: "palette",
      required: true,
    },
    {
      panelType: "key_notes",
      x: 580,
      y: ROW3_Y,
      width: 110,
      height: ROW3_H,
      scale: "notes",
      required: true,
    },
    {
      panelType: "title_block",
      x: 700,
      y: ROW3_Y,
      width: 131,
      height: ROW3_H,
      scale: "A1",
      required: true,
    },
  ];
}

function buildSheetPanelSpecs(targetStoreys = 1) {
  const storeyCount = Math.max(1, Number(targetStoreys) || 1);
  const specs = [
    {
      panelType: "site_context",
      x: 10,
      y: 12,
      width: 178,
      height: 170,
      scale: "1:500",
      required: true,
    },
    {
      panelType: "section_AA",
      x: 10,
      y: 196,
      width: 180,
      height: 128,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "section_BB",
      x: 196,
      y: 196,
      width: 180,
      height: 128,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "axonometric",
      x: 382,
      y: 196,
      width: 168,
      height: 228,
      scale: "3D",
      required: true,
    },
    {
      panelType: "hero_3d",
      x: 10,
      y: 432,
      width: 190,
      height: 148,
      scale: "render",
      required: true,
    },
    {
      panelType: "interior_3d",
      x: 206,
      y: 432,
      width: 252,
      height: 148,
      scale: "render",
      required: true,
    },
    {
      panelType: "material_palette",
      x: 464,
      y: 432,
      width: 130,
      height: 148,
      scale: "palette",
      required: true,
    },
    {
      panelType: "key_notes",
      x: 600,
      y: 432,
      width: 96,
      height: 148,
      scale: "notes",
      required: true,
    },
    {
      panelType: "title_block",
      x: 702,
      y: 432,
      width: 129,
      height: 148,
      scale: "A1",
      required: true,
    },
  ];

  const floorPlansBlockX = 196;
  const floorPlansBlockY = 12;
  const floorPlansBlockWidth = 354;
  const floorPlansBlockHeight = 170;
  const floorPlanColumns =
    storeyCount <= 2 ? storeyCount : Math.min(storeyCount, 3);
  const floorPlanRows = Math.ceil(storeyCount / floorPlanColumns);
  const floorPlanGap = 6;
  const floorPlanCellWidth =
    (floorPlansBlockWidth - floorPlanGap * (floorPlanColumns - 1)) /
    floorPlanColumns;
  const floorPlanCellHeight =
    (floorPlansBlockHeight - floorPlanGap * (floorPlanRows - 1)) /
    floorPlanRows;
  const floorPlans = [];
  for (let i = 0; i < storeyCount; i += 1) {
    const col = i % floorPlanColumns;
    const row = Math.floor(i / floorPlanColumns);
    floorPlans.push({
      panelType: floorPlanPanelType(i),
      x: floorPlansBlockX + col * (floorPlanCellWidth + floorPlanGap),
      y: floorPlansBlockY + row * (floorPlanCellHeight + floorPlanGap),
      width: floorPlanCellWidth,
      height: floorPlanCellHeight,
      scale: "1:100",
      required: i === 0,
    });
  }

  const elevationsBlockX = 558;
  const elevationsBlockY = 12;
  const elevationCellWidth = 273;
  const elevationCellHeight = 96;
  const elevationGap = 5;
  const elevations = [
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
  ].map((panelType, row) => ({
    panelType,
    x: elevationsBlockX,
    y: elevationsBlockY + row * (elevationCellHeight + elevationGap),
    width: elevationCellWidth,
    height: elevationCellHeight,
    scale: "1:100",
    required: true,
  }));

  return [...specs, ...floorPlans, ...elevations];
}

function buildPanelPlacements({
  drawingSet,
  panelArtifacts,
  targetStoreys,
  allowedPanelTypes = null,
  layoutTemplate = "board-v2",
  geometryHash = null,
  briefInputHash = null,
}) {
  const artifactIndex = buildPanelArtifactIndex(panelArtifacts);
  const allowed = allowedPanelTypes ? new Set(allowedPanelTypes) : null;
  const baseSpecs =
    layoutTemplate === "presentation-v3"
      ? buildPresentationV3SheetPanelSpecs(targetStoreys)
      : buildSheetPanelSpecs(targetStoreys);
  const specs = baseSpecs.filter((spec) =>
    allowed ? allowed.has(spec.panelType) : true,
  );
  return specs
    .map((slot, index) => {
      const drawing = (drawingSet.drawings || []).find(
        (entry) => entry.panel_type === slot.panelType,
      );
      const assetId =
        drawing?.exported_asset_ids?.[0] ||
        artifactIndex.byPanelType.get(slot.panelType)?.asset_id ||
        null;
      const artifact =
        (assetId && artifactIndex.byAssetId.get(assetId)) ||
        artifactIndex.byPanelType.get(slot.panelType) ||
        null;
      if (!artifact && !slot.required) {
        return null;
      }
      const title = formatPanelTitle(slot.panelType);
      const scale = drawing?.scale || slot.scale;
      const metricPlacement = {
        ...slot,
        title,
        scale,
        layoutTemplate,
      };
      const referenceMetrics = buildPanelReferenceMetrics({
        panelType: slot.panelType,
        artifact,
        placement: metricPlacement,
        layoutTemplate,
        geometryHash,
        briefInputHash,
      });
      return {
        slotIndex: index,
        panelType: slot.panelType,
        panelId: createStableId("sheet-panel", slot.panelType, index),
        title,
        scale,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        layoutTemplate,
        required: slot.required,
        sourcePanelAssetId: artifact?.asset_id || assetId,
        sourceDrawingId: drawing?.drawing_id || null,
        source_model_hash: artifact?.source_model_hash || null,
        geometryHash: artifact?.source_model_hash || null,
        svgHash: artifact?.svgHash || null,
        slotOccupancy: referenceMetrics.slotOccupancy,
        finalSlotOccupancy: referenceMetrics.finalSlotOccupancy,
        finalSlotFit: referenceMetrics.finalSlotFit,
        contentBBoxRatio: referenceMetrics.contentBBoxRatio,
        sourceGeometryHash: referenceMetrics.sourceGeometryHash,
        panelIdentityHash: referenceMetrics.panelIdentityHash,
        briefInputHash: referenceMetrics.briefInputHash,
        renderMode: referenceMetrics.renderMode,
        referenceMetrics,
        status: artifact?.svgString ? "ready" : "missing",
        empty: !artifact?.svgString,
      };
    })
    .filter(Boolean);
}

function summarizePresentationMode(panelArtifacts = {}) {
  const visualArtifacts = normalizeArtifactCollection(panelArtifacts).filter(
    (artifact) => REQUIRED_3D_A1_PANEL_TYPES.includes(artifact.panel_type),
  );
  const fallbackPanels = visualArtifacts
    .filter((artifact) => artifact.metadata?.imageRenderFallback !== false)
    .map((artifact) => artifact.panel_type);
  const renderedPanels = visualArtifacts
    .filter((artifact) => artifact.metadata?.imageRenderFallback === false)
    .map((artifact) => artifact.panel_type);
  // Phase A6: aggregate per-panel fallback reasons so the sheet artefact
  // can clearly say which visual panels are deterministic and why.
  const fallbackReasons = {};
  for (const artifact of visualArtifacts) {
    if (artifact.metadata?.imageRenderFallback === false) continue;
    fallbackReasons[artifact.panel_type] =
      artifact.metadata?.imageRenderFallbackReason || "unknown";
  }
  const openaiModelsUsed = [
    ...new Set(
      visualArtifacts
        .filter((artifact) => artifact.metadata?.openaiImageUsed === true)
        .map((artifact) => artifact.metadata?.imageRenderModel)
        .filter(Boolean),
    ),
  ];
  const openaiRequestIds = [
    ...new Set(
      visualArtifacts
        .map((artifact) => artifact.metadata?.openaiRequestId)
        .filter(Boolean),
    ),
  ];
  const openaiUsage = visualArtifacts
    .map((artifact) => artifact.metadata?.openaiUsage)
    .filter(Boolean);
  const fallbackReasonValues = [
    ...new Set(Object.values(fallbackReasons).filter(Boolean)),
  ];
  let visualPanelsRenderMode = "all_photoreal";
  if (fallbackPanels.length === visualArtifacts.length) {
    visualPanelsRenderMode = "all_deterministic";
  } else if (fallbackPanels.length > 0) {
    visualPanelsRenderMode = "mixed";
  }
  return {
    presentationMode: fallbackPanels.length
      ? "deterministic_control"
      : "geometry_locked_image_render",
    visualFidelityStatus: fallbackPanels.length
      ? "degraded_control_render"
      : "photoreal_geometry_locked",
    fallbackPanels,
    renderedPanels,
    visualPanelsRenderMode,
    visualPanelsFallbackReasons: fallbackReasons,
    openaiConfigured: visualArtifacts.some(
      (artifact) => artifact.metadata?.openaiConfigured === true,
    ),
    openaiImageUsed: renderedPanels.length > 0,
    openaiImageFallbackReason:
      fallbackReasonValues.length === 0
        ? null
        : fallbackReasonValues.length === 1
          ? fallbackReasonValues[0]
          : "mixed",
    openaiModelsUsed,
    openaiRequestIds,
    openaiUsage,
  };
}

function buildImageProviderCalls(visuals3d = {}) {
  return Object.values(visuals3d).map((artifact) => {
    const metadata = artifact?.metadata || {};
    const openaiUsed = metadata.openaiImageUsed === true;
    return {
      stepId: `IMAGE_${String(artifact.panel_type || artifact.panelType || "panel").toUpperCase()}`,
      panelType: artifact.panel_type || artifact.panelType || null,
      provider: "openai",
      providerUsed: openaiUsed ? "openai" : "deterministic",
      imageProviderUsed: openaiUsed ? "openai" : "deterministic",
      model: metadata.imageRenderModel || null,
      keySource: metadata.openaiKeySource || null,
      status: openaiUsed ? "ok" : "fallback",
      fallbackReason: openaiUsed
        ? null
        : metadata.imageRenderFallbackReason || "unknown",
      requestId: metadata.openaiRequestId || null,
      usage: metadata.openaiUsage || null,
      openaiUsed,
      secretsRedacted: true,
    };
  });
}

function buildOpenAIQaMetadata({
  providerCalls = [],
  visuals3d = {},
  env = process.env,
} = {}) {
  const diagnostics = openaiEnv.getOpenAIProviderDiagnostics(env);
  const imageCalls = providerCalls.filter((call) =>
    String(call.stepId || "").startsWith("IMAGE_"),
  );
  const reasoningCalls = providerCalls.filter(
    (call) =>
      call.provider === "openai" &&
      call.openaiUsed === true &&
      !String(call.stepId || "").startsWith("IMAGE_"),
  );
  const openaiImageUsed = imageCalls.some((call) => call.openaiUsed === true);
  const fallbackReasons = Object.fromEntries(
    Object.values(visuals3d).map((artifact) => [
      artifact.panel_type || artifact.panelType,
      artifact.metadata?.imageRenderFallbackReason || null,
    ]),
  );
  const fallbackReasonValues = [
    ...new Set(
      Object.values(fallbackReasons)
        .filter(Boolean)
        .filter((reason) => reason !== "none"),
    ),
  ];
  return {
    openaiConfigured: diagnostics.openaiConfigured,
    openaiReasoningUsed: reasoningCalls.length > 0,
    openaiImageUsed,
    openaiImageFallbackReason:
      fallbackReasonValues.length === 0
        ? null
        : fallbackReasonValues.length === 1
          ? fallbackReasonValues[0]
          : "mixed",
    openaiModelsUsed: [
      ...new Set(
        providerCalls
          .filter((call) => call.openaiUsed === true)
          .map((call) => call.model)
          .filter(Boolean),
      ),
    ],
    openaiRequestIds: [
      ...new Set(providerCalls.map((call) => call.requestId).filter(Boolean)),
    ],
    openaiUsage: providerCalls
      .map((call) => call.usage)
      .filter((usage) => usage && typeof usage === "object"),
    openaiDiagnostics: diagnostics,
    reasoningProviderUsed:
      reasoningCalls.length > 0 ? "openai" : "deterministic",
    imageProviderUsed: openaiImageUsed ? "openai" : "deterministic",
    providerFallbacks: providerCalls
      .filter((call) => call.fallbackReason)
      .map((call) => ({
        stepId: call.stepId,
        panelType: call.panelType || null,
        provider: call.provider,
        providerUsed: call.providerUsed,
        fallbackReason: call.fallbackReason,
      })),
    visualPanelsFallbackReasons: fallbackReasons,
  };
}

function logProjectGraphProviderTrace(providerCalls = []) {
  if (process.env.NODE_ENV === "test") return;
  for (const call of providerCalls) {
    const suffix = call.panelType ? ` panel=${call.panelType}` : "";
    const fallback = call.fallbackReason
      ? ` fallbackReason=${call.fallbackReason}`
      : "";
    const deterministic = call.deterministicReason
      ? ` deterministicReason=${call.deterministicReason}`
      : "";
    console.log(
      `[OpenAI] STEP ${call.stepId}${suffix} providerRoute=${call.provider} providerUsed=${call.providerUsed || "deterministic"} model=${call.model || "none"} status=${call.status}${fallback}${deterministic}`,
    );
  }
}

function applyOpenAIReasoningBlockersToQa(qa, blockedCalls = []) {
  if (!blockedCalls.length) return qa;
  const blockedSteps = blockedCalls.map((call) => call.stepId);
  const checks = [...(qa.checks || [])];
  addCheck(
    checks,
    "OPENAI_REASONING_PROVIDER_EXECUTED",
    false,
    {
      blockedSteps,
      blockedCalls: blockedCalls.map((call) => ({
        stepId: call.stepId,
        status: call.status,
        fallbackReason: call.fallbackReason,
        errorCode: call.errorCode,
        httpStatus: call.httpStatus || null,
        requestId: call.requestId || null,
      })),
    },
    "provider",
    0,
  );
  const issues = [
    ...(qa.issues || []),
    buildIssue(
      "OPENAI_REASONING_PROVIDER_BLOCKED",
      "error",
      "OpenAI reasoning provider execution failed for required ProjectGraph steps.",
      { blockedSteps },
    ),
  ];
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  return {
    ...qa,
    status: "fail",
    checks,
    issues,
    score: Math.max(0, 100 - errorCount * 18 - warningCount * 6),
    openaiBlocked: true,
  };
}

// Phase B closeout: per-panel-type fit policy for presentation-v3.
// Technical drawings cropped tight to contentBounds (with small padding) so
// drawings fill 80–92% of the slot; site/3D/data panels keep the previous
// padded normalizedViewBox so legends and decorative space stay visible.
// board-v2 is unaffected — it always returns the existing viewBox chain.
// Phase B closeout v2: shrink the safety padding so technical drawings
// fill more of the slot. Bumped from 4–6% to 1.5–2.5% — contentBounds
// already excludes the ink-free background rect, and the slot inner is
// further padded by CAPTION_HORIZONTAL_PADDING_MM, so room labels and
// dimension callouts still have breathing room.
const PRESENTATION_V3_PANEL_PADDING = {
  floor_plan_ground: 0.015,
  floor_plan_first: 0.015,
  floor_plan_level2: 0.015,
  floor_plan_level3: 0.015,
  floor_plan_level4: 0.015,
  floor_plan_level5: 0.015,
  floor_plan_level6: 0.015,
  floor_plan_level7: 0.015,
  section_AA: 0.02,
  section_BB: 0.02,
  elevation_north: 0.025,
  elevation_south: 0.025,
  elevation_east: 0.025,
  elevation_west: 0.025,
};

export function selectPanelContentViewBox({
  panelType,
  artifact,
  layoutTemplate = "board-v2",
}) {
  const fallbackViewBox =
    artifact?.normalizedViewBox ||
    artifact?.metadata?.normalizedViewBox ||
    artifact?.metadata?.technicalQualityMetadata?.normalizedViewBox ||
    extractSvgViewBox(
      artifact?.svgString || "",
      artifact?.width,
      artifact?.height,
    );

  if (layoutTemplate !== "presentation-v3") return fallbackViewBox;

  const paddingRatio = PRESENTATION_V3_PANEL_PADDING[panelType];
  if (paddingRatio === undefined) return fallbackViewBox;

  const bounds = getTechnicalContentBounds(artifact);
  if (!bounds || !(Number(bounds.width) > 0) || !(Number(bounds.height) > 0)) {
    return fallbackViewBox;
  }
  const padX = bounds.width * paddingRatio;
  const padY = bounds.height * paddingRatio;
  return [
    round(bounds.x - padX, 2),
    round(bounds.y - padY, 2),
    round(bounds.width + padX * 2, 2),
    round(bounds.height + padY * 2, 2),
  ].join(" ");
}

// Phase B closeout v2: stack the scale label below the title whenever the
// panel is narrow OR the inline pair would not fit with our gap budget.
// The narrow threshold catches "GROUND FLOOR PLAN 1:100" reading as one
// merged phrase on 2-/3-storey plan slots, key-notes, material palette,
// and the title block. board-v2 always returns the inline layout to keep
// its golden output.
const CAPTION_TITLE_FONT_SIZE = 5.8;
const CAPTION_SCALE_FONT_SIZE = 4.2;
const CAPTION_STACKED_SCALE_FONT_SIZE = 3.4;
const CAPTION_TITLE_ADVANCE_RATIO = 0.62;
const CAPTION_SCALE_ADVANCE_RATIO = 0.55;
const CAPTION_HORIZONTAL_PADDING_MM = 4;
const CAPTION_MIN_GAP_MM = 12;
const CAPTION_INLINE_CONTENT_TOP_MM = 12;
const CAPTION_STACKED_CONTENT_TOP_MM = 14;
const CAPTION_CONTENT_BOTTOM_PADDING_MM = 6;
const CAPTION_TITLE_BASELINE_MM = 5.8;
const CAPTION_STACKED_SCALE_BASELINE_MM = 10.5;
// Anything narrower than this stacks the scale on a second line, even if
// the estimated widths technically fit, because the eye reads them as a
// merged phrase otherwise.
const CAPTION_NARROW_PANEL_WIDTH_MM = 200;

export function computePanelCaptionLayout({
  title = "",
  scale = "",
  panelWidth = 0,
  layoutTemplate = "board-v2",
} = {}) {
  const titleText = String(title || "").toUpperCase();
  const scaleText = String(scale || "").trim();
  const inline = {
    layout: "inline",
    titleX: CAPTION_HORIZONTAL_PADDING_MM,
    titleY: CAPTION_TITLE_BASELINE_MM,
    scaleX: panelWidth - CAPTION_HORIZONTAL_PADDING_MM,
    scaleY: CAPTION_TITLE_BASELINE_MM,
    scaleFontSize: CAPTION_SCALE_FONT_SIZE,
    contentTopOffset: CAPTION_INLINE_CONTENT_TOP_MM,
    contentBottomPadding: CAPTION_CONTENT_BOTTOM_PADDING_MM,
  };
  if (!scaleText || layoutTemplate !== "presentation-v3") {
    return inline;
  }
  const titleWidth =
    titleText.length * CAPTION_TITLE_FONT_SIZE * CAPTION_TITLE_ADVANCE_RATIO;
  const scaleWidth =
    scaleText.length * CAPTION_SCALE_FONT_SIZE * CAPTION_SCALE_ADVANCE_RATIO;
  const requiredInlineWidth =
    CAPTION_HORIZONTAL_PADDING_MM +
    titleWidth +
    CAPTION_MIN_GAP_MM +
    scaleWidth +
    CAPTION_HORIZONTAL_PADDING_MM;
  const isNarrow = panelWidth < CAPTION_NARROW_PANEL_WIDTH_MM;
  if (!isNarrow && requiredInlineWidth <= panelWidth) {
    return inline;
  }
  return {
    layout: "stacked",
    titleX: CAPTION_HORIZONTAL_PADDING_MM,
    titleY: CAPTION_TITLE_BASELINE_MM,
    scaleX: panelWidth - CAPTION_HORIZONTAL_PADDING_MM,
    scaleY: CAPTION_STACKED_SCALE_BASELINE_MM,
    scaleFontSize: CAPTION_STACKED_SCALE_FONT_SIZE,
    contentTopOffset: CAPTION_STACKED_CONTENT_TOP_MM,
    contentBottomPadding: CAPTION_CONTENT_BOTTOM_PADDING_MM,
  };
}

function parseViewBoxTuple(viewBox = "") {
  const values = String(viewBox || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [, , width, height] = values;
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  return {
    x: values[0],
    y: values[1],
    width,
    height,
  };
}

export function computePanelSlotFitMetrics({
  panelType,
  artifact,
  placement = null,
  layoutTemplate = "board-v2",
} = {}) {
  if (
    !placement ||
    !(Number(placement.width) > 0) ||
    !(Number(placement.height) > 0)
  ) {
    return null;
  }
  const caption = computePanelCaptionLayout({
    title: placement.title || formatPanelTitle(panelType),
    scale: placement.scale || "",
    panelWidth: Number(placement.width),
    layoutTemplate,
  });
  const slotContentWidth =
    Number(placement.width) - CAPTION_HORIZONTAL_PADDING_MM * 2;
  const slotContentHeight =
    Number(placement.height) -
    caption.contentTopOffset -
    caption.contentBottomPadding;
  const viewBox = selectPanelContentViewBox({
    panelType,
    artifact,
    layoutTemplate,
  });
  const parsedViewBox = parseViewBoxTuple(viewBox);
  if (!parsedViewBox || !(slotContentWidth > 0) || !(slotContentHeight > 0)) {
    return null;
  }

  const contentAspect = parsedViewBox.width / parsedViewBox.height;
  const slotAspect = slotContentWidth / slotContentHeight;
  let widthRatio = 1;
  let heightRatio = 1;
  if (contentAspect > slotAspect) {
    heightRatio = slotAspect / contentAspect;
  } else {
    widthRatio = contentAspect / slotAspect;
  }

  return {
    occupancyRatio: round(widthRatio * heightRatio, 4),
    widthRatio: round(widthRatio, 4),
    heightRatio: round(heightRatio, 4),
    slotContentWidth: round(slotContentWidth, 2),
    slotContentHeight: round(slotContentHeight, 2),
    contentAspect: round(contentAspect, 4),
    slotAspect: round(slotAspect, 4),
    viewBox,
    captionLayout: caption.layout,
    preserveAspectRatio: "xMidYMid meet",
  };
}

function renderSheetPanel({
  placement,
  artifact,
  layoutTemplate = "board-v2",
}) {
  const titleText = escapeXml(String(placement.title || "").toUpperCase());
  const scaleText = escapeXml(String(placement.scale || "").trim());
  const caption = computePanelCaptionLayout({
    title: placement.title,
    scale: placement.scale,
    panelWidth: placement.width,
    layoutTemplate,
  });
  const contentX = placement.x + CAPTION_HORIZONTAL_PADDING_MM;
  const contentY = placement.y + caption.contentTopOffset;
  const contentWidth = placement.width - CAPTION_HORIZONTAL_PADDING_MM * 2;
  const contentHeight =
    placement.height - caption.contentTopOffset - caption.contentBottomPadding;
  const svgBody = extractSvgBody(artifact?.svgString || "");
  const viewBox = selectPanelContentViewBox({
    panelType: placement.panelType,
    artifact,
    layoutTemplate,
  });
  const content =
    placement.status === "ready"
      ? `<svg x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" viewBox="${escapeXml(viewBox)}" preserveAspectRatio="xMidYMid meet" overflow="hidden" data-inlined-panel="true">${svgBody}</svg>`
      : `<g data-panel-missing="true"><rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="#fff3f0" stroke="#a43f2a" stroke-dasharray="4 3"/><text x="${contentX + 8}" y="${contentY + 22}" font-size="7" fill="#a43f2a">Missing source panel</text></g>`;

  // Phase B caption cleanup: show only title (left) + scale (right). The
  // geometry hash and source-model-hash were colliding with the title and
  // adding visual clutter; they remain available on the wrapping <g>
  // (data-source-model-hash) and on sheet metadata for downstream QA.
  return `<g data-panel-id="${escapeXml(placement.panelType)}" data-source-panel-asset-id="${escapeXml(placement.sourcePanelAssetId || "")}" data-source-model-hash="${escapeXml(placement.source_model_hash || "")}" data-caption-layout="${caption.layout}">
  <rect x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}" rx="0.4" fill="#ffffff" stroke="#111111" stroke-width="0.45"/>
  <text x="${placement.x + caption.titleX}" y="${placement.y + caption.titleY}" font-size="${CAPTION_TITLE_FONT_SIZE}" font-family="${EMBEDDED_FONT_STACK}" font-weight="700" fill="#111111">${titleText}</text>
  ${
    scaleText
      ? `<text x="${placement.x + caption.scaleX}" y="${placement.y + caption.scaleY}" font-size="${caption.scaleFontSize}" font-family="${EMBEDDED_FONT_STACK}" text-anchor="end" fill="#444444">${scaleText}</text>`
      : ""
  }
  ${content}
</g>`;
}

function buildSheetSvg({
  projectGraphId,
  brief,
  geometryHash,
  panelPlacements,
  panelArtifacts,
  qaStatus,
  sheetNumber = "A1-00",
  sheetLabel = "RIBA Stage 2 Master",
  layoutTemplate = "board-v2",
}) {
  const artifactIndex = buildPanelArtifactIndex(panelArtifacts);
  const panelGroups = panelPlacements
    .map((placement) =>
      renderSheetPanel({
        placement,
        artifact: artifactIndex.byAssetId.get(placement.sourcePanelAssetId),
        layoutTemplate,
      }),
    )
    .join("\n");
  const sourcePanelAssetIds = panelPlacements
    .map((placement) => placement.sourcePanelAssetId)
    .filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A1_SHEET_SIZE_MM.width}mm" height="${A1_SHEET_SIZE_MM.height}mm" viewBox="0 0 ${A1_SHEET_SIZE_MM.width} ${A1_SHEET_SIZE_MM.height}" data-layout-version="${A1_SHEET_LAYOUT_VERSION}" data-layout-template="${escapeXml(layoutTemplate)}" data-placeholder-only="false" data-reference-match="${brief?.reference_match === true ? "true" : "false"}" data-brief-input-hash="${escapeXml(brief?.brief_input_hash || "")}" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}" data-sheet-number="${escapeXml(sheetNumber)}" data-sheet-label="${escapeXml(sheetLabel)}" data-qa-status="${escapeXml(qaStatus || "pending")}">
  <rect width="${A1_SHEET_SIZE_MM.width}" height="${A1_SHEET_SIZE_MM.height}" fill="#ffffff"/>
  <rect x="5" y="5" width="831" height="584" fill="none" stroke="#111111" stroke-width="0.7"/>
  <desc>Reference board A1 package for ${escapeXml(brief.project_name)}. Panels ${sourcePanelAssetIds.length}. Geometry hash ${escapeXml(geometryHash)}.</desc>
  ${panelGroups}
</svg>`;
}

async function buildA1Sheet({
  projectGraphId,
  brief,
  drawingSet,
  drawingArtifacts,
  site,
  climate,
  regulations,
  localStyle,
  styleDNA = null,
  programmeSummary = null,
  region = null,
  scene3d,
  compiledProject,
  geometryHash,
  siteSnapshot = null,
  sheetPlan = null,
  visualManifest = null,
  // Phase 1: optional SheetDesignContext. Existing callers may omit it; the
  // function does not yet hard-depend on it.
  sheetDesignContext = null,
}) {
  const __a1sheetStart = Date.now();
  const __a1sheetLog = (step, sinceMs, extra = "") => {
    const now = Date.now();
    const tail = extra ? ` ${extra}` : "";
    // eslint-disable-next-line no-console
    console.log(`[VS_TIMING] step=a1sheet.${step} ms=${now - sinceMs}${tail}`);
    return now;
  };
  let __a1mark = __a1sheetStart;
  const drawingNumber = sheetPlan?.sheet_number || "A1-00";
  const sheetLabel = sheetPlan?.label || "RIBA Stage 2 Master";
  const supplementalPanelArtifacts = await buildSheetPanelArtifacts({
    projectGraphId,
    site,
    climate,
    regulations,
    localStyle,
    styleDNA,
    programmeSummary,
    brief,
    region,
    compiledProject,
    geometryHash,
    siteSnapshot,
    sheetPlan: {
      ...(sheetPlan || {}),
      sheet_number: drawingNumber,
      label: sheetLabel,
    },
    visualManifest,
    sheetDesignContext,
  });
  __a1mark = __a1sheetLog("build_panel_artifacts", __a1mark);
  const panelArtifacts = {
    ...drawingArtifacts,
    ...supplementalPanelArtifacts,
  };
  const targetStoreys = Math.max(1, Number(brief.target_storeys || 1));
  // Phase B: residential briefs default to presentation-v3; everything else
  // stays on the technical-first board-v2 layout. The split sheet path
  // (A1-002) explicitly forces board-v2 via sheetPlan?.layoutTemplate so
  // technical content keeps its dense grid even on residential projects.
  const layoutTemplate =
    sheetPlan?.layoutTemplate || resolvePresentationLayoutTemplate(brief);
  const panelPlacements = buildPanelPlacements({
    drawingSet,
    panelArtifacts,
    targetStoreys,
    allowedPanelTypes: sheetPlan?.panel_types || null,
    layoutTemplate,
    geometryHash,
    briefInputHash: brief?.brief_input_hash || null,
  });
  const drawingIds = drawingSet.drawings.map((drawing) => drawing.drawing_id);
  const sourcePanelAssetIds = panelPlacements
    .map((placement) => placement.sourcePanelAssetId)
    .filter(Boolean);
  const sheetId = createStableId(
    "sheet-a1",
    projectGraphId,
    geometryHash,
    drawingNumber,
  );
  const rawSvgString = buildSheetSvg({
    projectGraphId,
    brief,
    geometryHash,
    panelPlacements,
    panelArtifacts,
    qaStatus: "pending",
    sheetNumber: drawingNumber,
    sheetLabel,
    layoutTemplate,
  });
  __a1mark = __a1sheetLog(
    "build_sheet_svg",
    __a1mark,
    `svg_chars=${rawSvgString.length}`,
  );
  // Embed fonts immediately so every downstream consumer - frontend viewer,
  // PDF rasteriser, SVG download - works with a single self-contained sheet.
  // prepareFinalSheetSvgForRasterization prefers bundled NotoSans from
  // public/fonts/, then falls back only to an explicitly embedded safe font.
  const preparedSheet = await prepareFinalSheetSvgForRasterizationWithReport(
    rawSvgString,
    {
      minimumFontSizePx: FINAL_SHEET_MIN_FONT_SIZE_PX,
      textToPath: true,
    },
  );
  __a1mark = __a1sheetLog("prepare_sheet_for_raster", __a1mark);
  const { svgString, textRenderStatus } = preparedSheet;
  if (!svgString.includes("@font-face")) {
    throw new Error(
      "A1 sheet font embedding failed: bundled fonts at public/fonts/ " +
        "could not be loaded. Refusing to publish a sheet that would " +
        "render ☐ tofu glyphs.",
    );
  }
  const sheetGlyphIntegrity = detectA1GlyphIntegrity({ sheetSvg: svgString });
  if (sheetGlyphIntegrity.status === "blocked") {
    throw new Error(
      `A1 sheet glyph integrity check failed: ${sheetGlyphIntegrity.blockers.join("; ")}`,
    );
  }
  if (textRenderStatus.status === "blocked" || !textRenderStatus.rasterSafe) {
    throw new Error(
      `A1 sheet raster-safe text conversion failed: ${(textRenderStatus.blockers || []).join("; ") || "font path conversion unavailable"}`,
    );
  }
  const presentationSummary = summarizePresentationMode(panelArtifacts);
  const svgHash = computeCDSHashSync({ svg: svgString });
  const sheetAssetId = createStableId("asset-a1-svg", sheetId, svgHash);
  const requiredPlacementTypes = buildRequiredA1PanelTypes(
    targetStoreys,
    layoutTemplate,
  );
  const requiredPlacements = panelPlacements.filter((placement) =>
    requiredPlacementTypes.includes(placement.panelType),
  );
  const panelReferenceMetrics = Object.fromEntries(
    panelPlacements.map((placement) => [
      placement.panelType,
      placement.referenceMetrics || {
        slotOccupancy: placement.slotOccupancy || 0,
        finalSlotOccupancy: placement.finalSlotOccupancy || null,
        finalSlotFit: placement.finalSlotFit || null,
        contentBBoxRatio: placement.contentBBoxRatio || null,
        sourceGeometryHash: placement.sourceGeometryHash || null,
        panelIdentityHash: placement.panelIdentityHash || null,
        briefInputHash: placement.briefInputHash || null,
        renderMode: placement.renderMode || null,
      },
    ]),
  );
  __a1sheetLog("a1sheet_done", __a1sheetStart, `chars=${svgString.length}`);
  return {
    sheetSet: {
      sheets: [
        {
          sheet_id: sheetId,
          sheet_size: "A1",
          orientation: "landscape",
          template_id: A1_SHEET_LAYOUT_VERSION,
          drawing_ids: drawingIds,
          asset_ids: [
            ...new Set([
              ...sourcePanelAssetIds,
              scene3d.asset_id,
              sheetAssetId,
            ]),
          ],
          title_block: {
            project_name: brief.project_name,
            drawing_number: drawingNumber,
            sheet_label: sheetLabel,
            revision: "P01",
            status: "early_stage_precheck",
            disclaimer: PROFESSIONAL_REVIEW_DISCLAIMER,
          },
          exported_pdf_asset_id: null,
          exported_png_asset_id: null,
          exported_svg_asset_id: sheetAssetId,
        },
      ],
    },
    sheetArtifact: {
      asset_id: sheetAssetId,
      asset_type: "a1_sheet_svg",
      sheet_size_mm: A1_SHEET_SIZE_MM,
      orientation: "landscape",
      layoutVersion: A1_SHEET_LAYOUT_VERSION,
      layoutTemplate,
      panelPlacements,
      sourcePanelAssetIds,
      source_model_hash: geometryHash,
      drawing_number: drawingNumber,
      sheet_label: sheetLabel,
      referenceMatch: brief?.reference_match === true,
      briefInputHash: brief?.brief_input_hash || null,
      quality: {
        placeholderOnly: false,
        requiredPanelCount: sheetPlan
          ? sheetPlan.panel_types.length
          : requiredPlacementTypes.length,
        requiredPanelsPlaced: requiredPlacements.length,
        totalPanelsPlaced: panelPlacements.length,
        referenceMatch: brief?.reference_match === true,
        briefInputHash: brief?.brief_input_hash || null,
        panelReferenceMetrics,
      },
      svgHash,
      svgString,
      textRenderStatus,
      presentationMode: presentationSummary.presentationMode,
      visualFidelityStatus: presentationSummary.visualFidelityStatus,
      visualPanelsRenderMode: presentationSummary.visualPanelsRenderMode,
      visualPanelsFallbackReasons:
        presentationSummary.visualPanelsFallbackReasons,
      metadata: {
        textRenderStatus,
        referenceMatch: brief?.reference_match === true,
        briefInputHash: brief?.brief_input_hash || null,
        panelReferenceMetrics,
        presentationMode: presentationSummary.presentationMode,
        visualFidelityStatus: presentationSummary.visualFidelityStatus,
        visualPanelsRenderMode: presentationSummary.visualPanelsRenderMode,
        visualPanelsFallbackReasons:
          presentationSummary.visualPanelsFallbackReasons,
        presentationFallbackPanels: presentationSummary.fallbackPanels,
        presentationRenderedPanels: presentationSummary.renderedPanels,
      },
    },
    sheetPanelArtifacts: supplementalPanelArtifacts,
    panelArtifacts,
  };
}

const MM_TO_PT = 72 / 25.4;

async function analyseRenderedSheetPng(pngBuffer, options = {}) {
  // PR-D follow-up: when stub raster mode is on the heavy 280M-iteration
  // pixel walk would still run on the 1×1 stub PNG (cheap) but its result
  // would report nonBackgroundPixelRatio=0 and fail the
  // MIN_RENDERED_SHEET_INK_RATIO gate. Return synthetic healthy metrics
  // that report the dimensions a full render would have produced so the
  // gate passes and the test asserts metadata / layout / geometry only.
  //
  // Codex integration finding: forward isFinalA1 (when known by the caller)
  // through the production-safety gate so synthetic ink metrics can NEVER
  // be substituted into a final A1 export — even if A1_TEST_RASTER_MODE=stub
  // is somehow set in production / Vercel.
  if (isRasterStubModeAllowed({ isFinalA1: options.isFinalA1 === true })) {
    const widthPx = Number(options.expectedWidthPx) || 9933;
    const heightPx = Number(options.expectedHeightPx) || 7016;
    return {
      widthPx,
      heightPx,
      pixelCount: widthPx * heightPx,
      backgroundRgb: [243, 239, 229],
      nonWhitePixelRatio: 0.18,
      nonBackgroundPixelRatio: 0.18,
      stub: true,
    };
  }
  try {
    const sharp = (await import("sharp")).default;
    const raw = await sharp(pngBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raw;
    const pixelCount = Math.max(
      1,
      Number(info.width || 0) * Number(info.height || 0),
    );
    const background = [data[0] || 255, data[1] || 255, data[2] || 255];
    let nonWhitePixels = 0;
    let nonBackgroundPixels = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (r < 245 || g < 245 || b < 245) {
        nonWhitePixels += 1;
      }
      const delta =
        Math.abs(r - background[0]) +
        Math.abs(g - background[1]) +
        Math.abs(b - background[2]);
      if (delta > 42) {
        nonBackgroundPixels += 1;
      }
    }
    return {
      widthPx: info.width,
      heightPx: info.height,
      pixelCount,
      backgroundRgb: background,
      nonWhitePixelRatio: round(nonWhitePixels / pixelCount, 5),
      nonBackgroundPixelRatio: round(nonBackgroundPixels / pixelCount, 5),
    };
  } catch (error) {
    return {
      widthPx: null,
      heightPx: null,
      pixelCount: 0,
      backgroundRgb: null,
      nonWhitePixelRatio: 0,
      nonBackgroundPixelRatio: 0,
      error: error?.message || "render proof analysis failed",
    };
  }
}

function buildPanelRenderSummary(sheetArtifact = {}) {
  return (sheetArtifact.panelPlacements || []).map((placement) => ({
    panelType: placement.panelType,
    sourcePanelAssetId: placement.sourcePanelAssetId || null,
    status: placement.status || "missing",
    required: placement.required === true,
    svgHash: placement.svgHash || null,
    sourceModelHash: placement.source_model_hash || null,
    geometryHash: placement.geometryHash || null,
    slotOccupancy: placement.slotOccupancy || 0,
    finalSlotOccupancy: placement.finalSlotOccupancy || null,
    finalSlotFit: placement.finalSlotFit || null,
    contentBBoxRatio: placement.contentBBoxRatio || null,
    panelIdentityHash: placement.panelIdentityHash || null,
    briefInputHash: placement.briefInputHash || null,
    renderMode: placement.renderMode || null,
    hasSvg: placement.status === "ready" && Boolean(placement.svgHash),
  }));
}

function normalizeBinaryBytes(value, label = "binary data") {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (value?.type === "Buffer" && Array.isArray(value.data)) {
    return Uint8Array.from(value.data);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  if (value?.data) {
    return normalizeBinaryBytes(value.data, label);
  }
  throw new Error(`${label} is not valid binary data`);
}

function svgToDataUrl(svgString = "") {
  return svgToSanitizedDataUrl(String(svgString || ""));
}

function buildResultPanelMap(panelArtifacts = {}) {
  return Object.fromEntries(
    artifactArray(panelArtifacts)
      .filter((artifact) => artifact?.panel_type || artifact?.panelType)
      .map((artifact) => {
        const panelType = artifact.panel_type || artifact.panelType;
        const safeSvgString = artifact.svgString
          ? sanitizeSheetSvgFragment(artifact.svgString)
          : null;
        const safeDataUrl = artifact.dataUrl
          ? sanitizeSvgDataUrl(artifact.dataUrl)
          : null;
        const safeImageUrl = artifact.imageUrl
          ? sanitizeSvgDataUrl(artifact.imageUrl)
          : null;
        return [
          panelType,
          {
            panelType,
            label: formatPanelTitle(panelType),
            url:
              (safeSvgString ? svgToDataUrl(safeSvgString) : null) ||
              safeDataUrl ||
              safeImageUrl,
            dataUrl: safeDataUrl,
            imageUrl: safeImageUrl,
            svgString: safeSvgString || null,
            sourceType: artifact.asset_type || null,
            authoritySource:
              artifact.authoritySource || "project_graph_compiled_geometry",
            geometryHash: artifact.geometryHash || artifact.source_model_hash,
            source_model_hash: artifact.source_model_hash || null,
            svgHash: artifact.svgHash || null,
            metadata: cloneData(artifact.metadata || {}),
          },
        ];
      }),
  );
}

// Phase A close-out: when the caller declares a final A1 export, the embedded
// raster must be 300 DPI of the A1 sheet (≈ 9933 × 7016 px). Earlier the
// rasteriser was hardcoded to 144 DPI, producing 4768 × 3368 px — the PDF
// page was A1-sized but the pixels were preview density and metadata lied.
const FINAL_A1_RASTER_DPI = 300;
const PREVIEW_A1_RASTER_DPI = 144;
const FINAL_A1_RASTER_MIN_RATIO = 0.95; // tolerance vs expected pixel size

async function buildA1PdfArtifact({
  projectGraphId,
  brief,
  geometryHash,
  sheetArtifact,
  qaStatus = "pending",
  renderIntent = "final_a1",
}) {
  const __a1pdfStart = Date.now();
  const __a1pdfLog = (step, sinceMs, extra = "") => {
    const now = Date.now();
    const tail = extra ? ` ${extra}` : "";
    // eslint-disable-next-line no-console
    console.log(`[VS_TIMING] step=a1pdf.${step} ms=${now - sinceMs}${tail}`);
    return now;
  };
  let __pdfMark = __a1pdfStart;
  const isFinalA1 = renderIntent === "final_a1";
  const widthPt = 841 * MM_TO_PT;
  const heightPt = 594 * MM_TO_PT;

  // sheetArtifact.svgString must already contain embedded @font-face
  // (NotoSans Regular + Bold). buildA1Sheet() embeds them; this assertion
  // catches any regression that would let unembedded SVG reach Sharp,
  // because Sharp/librsvg cannot resolve missing fonts on the Vercel
  // serverless runtime and would bake ☐ tofu glyphs into the PNG.
  const rawSheetSvg = sheetArtifact?.svgString || "";
  if (!rawSheetSvg.includes("@font-face")) {
    throw new Error(
      "A1 sheet SVG reached PDF rasterisation without @font-face — refusing " +
        "to export to avoid tofu glyphs. buildA1Sheet should have embedded " +
        "bundled fonts upstream.",
    );
  }
  if (!rawSheetSvg.includes('data-raster-text-mode="font-paths"')) {
    throw new Error(
      "A1 sheet SVG reached PDF rasterisation without raster-safe font paths.",
    );
  }

  const targetDensityDpi = isFinalA1
    ? FINAL_A1_RASTER_DPI
    : PREVIEW_A1_RASTER_DPI;
  // Codex integration finding: forward isFinalA1 so the raster stub gate
  // refuses to substitute a 1×1 PNG even if A1_TEST_RASTER_MODE=stub is set.
  const renderedSheet = await rasteriseSheetArtifact({
    sheetArtifact,
    densityDpi: targetDensityDpi,
    isFinalA1,
  });
  __pdfMark = __a1pdfLog(
    "rasterise_sheet",
    __pdfMark,
    `dpi=${targetDensityDpi} bytes=${renderedSheet?.pngBuffer?.length || "?"}`,
  );
  const renderedPngBytes = normalizeBinaryBytes(
    renderedSheet.pngBuffer,
    "rendered A1 sheet PNG",
  );
  const renderedPngHash = computeCDSHashSync({
    sourceSvgHash: sheetArtifact.svgHash,
    png: Buffer.from(renderedPngBytes).toString("base64"),
    geometryHash,
  });
  __pdfMark = __a1pdfLog("hash_png", __pdfMark);
  // Pass expected dims so the stub-mode shortcut returns metrics matching
  // the dimensions the stub raster claimed (otherwise the stub would always
  // report 9933×7016 even for the preview 144 DPI path).
  const occupancy = await analyseRenderedSheetPng(renderedPngBytes, {
    expectedWidthPx: Number(renderedSheet.metadata?.width_px) || undefined,
    expectedHeightPx: Number(renderedSheet.metadata?.height_px) || undefined,
    // Codex integration finding: forward isFinalA1 so synthetic ink metrics
    // can never substitute for the real ink walk on a final A1 export.
    isFinalA1,
  });
  __pdfMark = __a1pdfLog("analyse_png", __pdfMark);
  const panelOccupancy = buildPanelRenderSummary(sheetArtifact);
  const textRenderStatus = await analyseRenderedTextProof({
    pngBuffer: renderedPngBytes,
    sheetSvg: rawSheetSvg,
    requiredLabels: REQUIRED_A1_TEXT_PROOF_LABELS,
  });
  __pdfMark = __a1pdfLog("analyse_text_proof", __pdfMark);
  // Phase A: post-rasterisation tofu QA. Sample each panel's caption band on
  // the rendered PNG (not the SVG source) and refuse final PDF emission if
  // any band matches the tofu signature. Coordinates are derived from the
  // sheet artifact's SVG-space panel placements (mm) scaled to the rendered
  // PNG pixel dimensions.
  const renderedWidthPx = Number(renderedSheet.metadata?.width_px || 0);
  const renderedHeightPx = Number(renderedSheet.metadata?.height_px || 0);
  let rasterGlyphIntegrity = null;
  try {
    const sharpModule = (await import("sharp")).default;
    const sheetWidthMm = Number(sheetArtifact?.sheet_size_mm?.width || 841);
    const sheetHeightMm = Number(sheetArtifact?.sheet_size_mm?.height || 594);
    const scaleX =
      renderedWidthPx > 0 && sheetWidthMm > 0
        ? renderedWidthPx / sheetWidthMm
        : 1;
    const scaleY =
      renderedHeightPx > 0 && sheetHeightMm > 0
        ? renderedHeightPx / sheetHeightMm
        : 1;
    const panelLabelCoordinates = {};
    for (const placement of Array.isArray(sheetArtifact?.panelPlacements)
      ? sheetArtifact.panelPlacements
      : []) {
      if (!placement?.panelType) continue;
      panelLabelCoordinates[placement.panelType] = {
        x: Math.round(Number(placement.x || 0) * scaleX),
        y: Math.round(Number(placement.y || 0) * scaleY),
        width: Math.round(Number(placement.width || 0) * scaleX),
        height: Math.round(Number(placement.height || 0) * scaleY),
        labelHeight: Math.round(8 * scaleY),
      };
    }
    rasterGlyphIntegrity = await detectA1RasterGlyphIntegrity({
      pngBuffer: Buffer.from(renderedPngBytes),
      sharp: sharpModule,
      panelLabelCoordinates,
    });
    __pdfMark = __a1pdfLog("glyph_integrity", __pdfMark);
  } catch (err) {
    rasterGlyphIntegrity = {
      version: "phase22-a1-raster-glyph-integrity-v1",
      status: "warning",
      passed: false,
      sampledCount: 0,
      suspectZones: [],
      blockers: [
        `Raster glyph integrity check failed to run: ${err?.message || "unknown"}`,
      ],
    };
  }
  const renderedProof = {
    sourceSvgHash: sheetArtifact.svgHash,
    renderedPngHash,
    rasteriser: renderedSheet.metadata?.rasteriser || null,
    densityDpi: renderedSheet.metadata?.density_dpi || null,
    sizeBytes: renderedPngBytes.byteLength,
    occupancy,
    textRenderStatus,
    rasterGlyphIntegrity,
    panelOccupancy,
    requiredRenderablePanelCount: panelOccupancy.filter(
      (panel) => panel.required === true,
    ).length,
    requiredReadyPanelCount: panelOccupancy.filter(
      (panel) => panel.required === true && panel.hasSvg === true,
    ).length,
    requiredMissingPanelCount: panelOccupancy.filter(
      (panel) => panel.required === true && panel.hasSvg !== true,
    ).length,
    missingRequiredPanels: panelOccupancy
      .filter((panel) => panel.required === true && panel.hasSvg !== true)
      .map((panel) => panel.panelType),
    passed:
      Number(occupancy.nonBackgroundPixelRatio || 0) >=
        MIN_RENDERED_SHEET_INK_RATIO &&
      textRenderStatus.passed === true &&
      rasterGlyphIntegrity?.status !== "blocked" &&
      panelOccupancy.filter(
        (panel) => panel.required === true && panel.hasSvg !== true,
      ).length === 0,
  };
  if (textRenderStatus.status === "blocked") {
    throw new Error(
      `A1 sheet rendered text proof failed: ${textRenderStatus.blockers.join("; ")}`,
    );
  }
  if (rasterGlyphIntegrity?.status === "blocked") {
    throw new Error(
      `A1 sheet raster glyph integrity blocked: ${(
        rasterGlyphIntegrity.blockers || []
      ).join("; ")}`,
    );
  }
  // Final A1 export must embed a 300 DPI raster of the A1 sheet. Compare the
  // rendered PNG dimensions against A1 at 300 DPI (allow small tolerance for
  // librsvg rounding) and refuse to emit if the raster is preview density.
  if (isFinalA1) {
    const expectedFinalWidth = Math.round(
      (Number(sheetArtifact?.sheet_size_mm?.width || 841) / 25.4) *
        FINAL_A1_RASTER_DPI,
    );
    const expectedFinalHeight = Math.round(
      (Number(sheetArtifact?.sheet_size_mm?.height || 594) / 25.4) *
        FINAL_A1_RASTER_DPI,
    );
    const actualWidthPx = renderedWidthPx;
    const actualHeightPx = renderedHeightPx;
    const widthRatio =
      expectedFinalWidth > 0 ? actualWidthPx / expectedFinalWidth : 0;
    const heightRatio =
      expectedFinalHeight > 0 ? actualHeightPx / expectedFinalHeight : 0;
    if (
      widthRatio < FINAL_A1_RASTER_MIN_RATIO ||
      heightRatio < FINAL_A1_RASTER_MIN_RATIO
    ) {
      throw new Error(
        `A1 sheet final raster too small for 300 DPI: got ${actualWidthPx}x${actualHeightPx}, expected ≥ ${Math.round(
          expectedFinalWidth * FINAL_A1_RASTER_MIN_RATIO,
        )}x${Math.round(
          expectedFinalHeight * FINAL_A1_RASTER_MIN_RATIO,
        )} (full target ${expectedFinalWidth}x${expectedFinalHeight}). Final A1 PDFs must embed 300 DPI raster.`,
      );
    }
  }
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${brief.project_name} A1 ProjectGraph sheet`);
  pdfDoc.setSubject(`QA status: ${qaStatus}`);
  pdfDoc.setProducer(
    `${PROJECT_GRAPH_VERTICAL_SLICE_VERSION}:${projectGraphId}`,
  );
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));
  const page = pdfDoc.addPage([widthPt, heightPt]);
  const sheetImage = await pdfDoc.embedPng(renderedPngBytes);
  __pdfMark = __a1pdfLog("pdf_embed_png", __pdfMark);
  page.drawImage(sheetImage, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
  });
  if (
    typeof pdfDoc.attach === "function" &&
    typeof TextEncoder !== "undefined"
  ) {
    const sourceSvgBytes = new TextEncoder().encode(
      sheetArtifact.svgString || "",
    );
    await pdfDoc.attach(sourceSvgBytes, "projectgraph-a1-sheet.svg", {
      mimeType: "image/svg+xml",
      description: "Source SVG used to generate this A1 PDF export.",
      creationDate: new Date(0),
      modificationDate: new Date(0),
    });
  }

  const pdfDataUri = await pdfDoc.saveAsBase64({ dataUri: true });
  __a1pdfLog("pdf_save_data_uri", __pdfMark);
  __a1pdfLog(
    "a1pdf_done",
    __a1pdfStart,
    `dataUri_kb=${Math.round(pdfDataUri.length / 1024)}`,
  );
  const contentHash = computeCDSHashSync({
    sourceSvgHash: sheetArtifact.svgHash,
    renderedPngHash,
    pdfDataUri,
    geometryHash,
  });
  const assetId = createStableId("asset-a1-pdf", projectGraphId, contentHash);

  // Phase A close-out: tag the artefact with metadata that honestly reflects
  // the actual raster density. Earlier this hardcoded pdfRenderMode to the
  // "300dpi" string regardless of the underlying raster — that lie has been
  // removed. pdfRenderMode + dpi are derived from the renderer output, and
  // isFinalA1 controls the readable mode tag.
  const actualDpi = Math.round(
    Number(renderedSheet.metadata?.density_dpi || targetDensityDpi) ||
      targetDensityDpi,
  );
  const pdfRenderMode = isFinalA1
    ? "raster_textpaths_300dpi"
    : "raster_textpaths_preview_144dpi";
  const pdfMetadata = {
    version: "a1-pdf-metadata-v1",
    pdfRenderMode,
    isRasterPdf: true,
    isVectorPdf: false,
    isHybridPdf: false,
    isFinalA1,
    renderIntent: isFinalA1 ? "final_a1" : "preview",
    dpi: actualDpi,
    widthPx: renderedWidthPx || null,
    heightPx: renderedHeightPx || null,
    widthPt: round(widthPt, 3),
    heightPt: round(heightPt, 3),
    textRenderMode: "font_paths",
    rasterIntegrityStatus: rasterGlyphIntegrity?.status || "not_run",
    hybridVectorPdfFollowUp: true,
  };

  // Phase 5D: optional vector PDF as an *additional* artifact behind a
  // feature flag (`PROJECT_GRAPH_VECTOR_PDF_ENABLED=true`). The raster
  // PDF above remains the production deliverable; the vector PDF is
  // emitted alongside for Preview/local evaluation. Failure of the
  // vector path is recorded as warning metadata and NEVER blocks the
  // raster artifact.
  const vectorPdfFlag = String(
    (typeof process !== "undefined" &&
      process.env?.PROJECT_GRAPH_VECTOR_PDF_ENABLED) ||
      "",
  )
    .toLowerCase()
    .trim();
  const vectorPdfEnabled = vectorPdfFlag === "true" || vectorPdfFlag === "1";
  let vectorPdf = null;
  if (vectorPdfEnabled && isFinalA1) {
    try {
      const t0 = Date.now();
      vectorPdf = await buildVectorPdfFromSheetSvg({
        svgString: rawSheetSvg,
        title:
          (brief?.project_name ? `${brief.project_name} — ` : "") +
          "ArchiAI A1 Sheet (vector)",
        author: brief?.architect || "ArchiAI",
        geometryHash,
      });
      __pdfMark = __a1pdfLog(
        "vector_pdf_build",
        __pdfMark,
        `ok=${vectorPdf.ok} bytes=${vectorPdf.byteLength} draws=${vectorPdf.summary?.drawCalls || 0} took_ms=${Date.now() - t0}`,
      );
    } catch (vectorErr) {
      vectorPdf = {
        ok: false,
        pdfBytes: null,
        dataUrl: null,
        pdfHash: null,
        byteLength: 0,
        pageCount: 0,
        pageSizeMm: { width: 841, height: 594 },
        pdfRenderMode: VECTOR_PDF_RENDER_MODE,
        schemaVersion: VECTOR_PDF_SCHEMA_VERSION,
        summary: { drawCalls: 0, skipped: {}, warnings: [] },
        error: `vector_pdf_threw:${vectorErr?.message || "unknown"}`,
      };
    }
  }
  if (vectorPdf) {
    pdfMetadata.vectorPdf = {
      enabled: vectorPdfEnabled,
      ok: vectorPdf.ok === true,
      schemaVersion: vectorPdf.schemaVersion,
      pdfRenderMode: vectorPdf.pdfRenderMode,
      pdfHash: vectorPdf.pdfHash,
      byteLength: vectorPdf.byteLength,
      drawCalls: vectorPdf.summary?.drawCalls ?? 0,
      skipped: vectorPdf.summary?.skipped || {},
      warnings: vectorPdf.summary?.warnings || [],
      error: vectorPdf.error || null,
    };
  } else {
    pdfMetadata.vectorPdf = { enabled: vectorPdfEnabled, ok: false };
  }

  return {
    asset_id: assetId,
    asset_type: "a1_sheet_pdf",
    sheet_size_mm: { width: 841, height: 594 },
    page_size_pt: {
      width: round(widthPt, 3),
      height: round(heightPt, 3),
    },
    orientation: "landscape",
    source_model_hash: geometryHash,
    source_svg_asset_id: sheetArtifact.asset_id,
    source_svg_hash: sheetArtifact.svgHash,
    sourcePanelAssetIds: sheetArtifact.sourcePanelAssetIds || [],
    layoutVersion: sheetArtifact.layoutVersion,
    renderedPngHash,
    renderedProof,
    pdfHash: contentHash,
    pdfMetadata,
    dataUrl: pdfDataUri,
    // Phase 5D: vector artifact alongside the raster one. Consumers
    // that want to download the vector PDF should read `vectorPdfDataUrl`.
    // When the flag is off or the vector build failed, these are null.
    vectorPdfDataUrl: vectorPdf?.ok ? vectorPdf.dataUrl : null,
    vectorPdfBytes: vectorPdf?.ok ? vectorPdf.byteLength : 0,
    vectorPdfHash: vectorPdf?.ok ? vectorPdf.pdfHash : null,
    vectorPdfRenderMode: vectorPdf?.ok ? vectorPdf.pdfRenderMode : null,
  };
}

function buildIssue(code, severity, message, details = {}) {
  return { code, severity, message, details };
}

function addCheck(
  checks,
  code,
  passed,
  details = {},
  category = null,
  weight = 0,
) {
  checks.push({
    code,
    status: passed ? "pass" : "fail",
    details,
    category,
    weight,
  });
}

function expectedRequiredPanelTypes(
  targetStoreys = 1,
  layoutTemplate = "board-v2",
) {
  return buildRequiredA1PanelTypes(targetStoreys, layoutTemplate);
}

function artifactArray(artifacts = {}) {
  if (Array.isArray(artifacts)) return artifacts.filter(Boolean);
  if (!artifacts || typeof artifacts !== "object") return [];
  return Object.values(artifacts).filter(Boolean);
}

function findPanelArtifact(artifacts = {}, panelType) {
  return artifactArray(artifacts).find(
    (artifact) =>
      artifact?.panel_type === panelType || artifact?.panelType === panelType,
  );
}

function svgHasInvalidTokens(svgString = "") {
  return /\b(?:NaN|undefined|Infinity|-Infinity)\b/i.test(
    String(svgString || ""),
  );
}

function svgLooksRenderable(svgString = "") {
  const svg = String(svgString || "");
  if (svg.length < 200 || svgHasInvalidTokens(svg)) return false;
  return /<(?:path|rect|line|polyline|polygon|circle|ellipse|image|text)\b/i.test(
    svg,
  );
}

function evaluatePanelRenderability(artifact = null) {
  const svg = String(artifact?.svgString || "");
  const length = svg.length;
  const hasInvalidTokens = svgHasInvalidTokens(svg);
  const hasRenderableElement =
    /<(?:path|rect|line|polyline|polygon|circle|ellipse|image|text)\b/i.test(
      svg,
    );
  let reason = null;
  if (!artifact) {
    reason = "missing_artifact";
  } else if (length === 0) {
    reason = "empty_svg_string";
  } else if (length < 200) {
    reason = "svg_too_short";
  } else if (hasInvalidTokens) {
    reason = "has_invalid_tokens";
  } else if (!hasRenderableElement) {
    reason = "no_renderable_element";
  }
  return {
    present: Boolean(artifact),
    length,
    hasInvalidTokens,
    hasRenderableElement,
    reason,
    ok: reason === null,
  };
}

function expectedDrawingTypeForPanel(panelType = "") {
  if (String(panelType).startsWith("floor_plan_")) return "plan";
  if (String(panelType).startsWith("elevation_")) return "elevation";
  if (String(panelType).startsWith("section_")) return "section";
  return null;
}

function technicalPanelIdentityMismatch(panelType, artifact = null) {
  if (!artifact) return false;
  const metadata = artifact.metadata || {};
  const declaredPanelTypes = [
    artifact.panelType,
    metadata.panelType,
    metadata.expectedPanelType,
    metadata.panel_type,
  ].filter(Boolean);
  if (declaredPanelTypes.some((declared) => declared !== panelType)) {
    return true;
  }
  const expectedDrawingType = expectedDrawingTypeForPanel(panelType);
  const declaredDrawingType =
    artifact.drawingType ||
    metadata.drawingType ||
    artifact.technicalQualityMetadata?.drawing_type ||
    metadata.technicalQualityMetadata?.drawing_type ||
    null;
  return Boolean(
    expectedDrawingType &&
    declaredDrawingType &&
    declaredDrawingType !== expectedDrawingType,
  );
}

function getTechnicalContentBounds(artifact = null) {
  return (
    artifact?.contentBounds ||
    artifact?.technicalQualityMetadata?.contentBounds ||
    artifact?.metadata?.contentBounds ||
    artifact?.metadata?.technicalQualityMetadata?.contentBounds ||
    null
  );
}

function getTechnicalNormalizedViewBox(artifact = null) {
  return (
    artifact?.normalizedViewBox ||
    artifact?.technicalQualityMetadata?.normalizedViewBox ||
    artifact?.metadata?.normalizedViewBox ||
    artifact?.metadata?.technicalQualityMetadata?.normalizedViewBox ||
    null
  );
}

function technicalContentBoundsTooSmall(artifact = null) {
  const bounds = getTechnicalContentBounds(artifact);
  if (!bounds) return true;
  return (
    Number(bounds.occupancyRatio || 0) <
      MIN_TECHNICAL_CONTENT_OCCUPANCY_RATIO ||
    Number(bounds.widthRatio || 0) < MIN_TECHNICAL_CONTENT_WIDTH_RATIO ||
    Number(bounds.heightRatio || 0) < MIN_TECHNICAL_CONTENT_HEIGHT_RATIO
  );
}

function referenceMatchTechnicalThresholds(panelType = "") {
  if (String(panelType).startsWith("floor_plan_")) {
    return {
      slotOccupancy: REFERENCE_MATCH_PLAN_MIN_SLOT_OCCUPANCY,
      finalSlotOccupancy: 0.5,
      widthRatio: 0.42,
      heightRatio: 0.28,
    };
  }
  if (String(panelType).startsWith("section_")) {
    return {
      slotOccupancy: REFERENCE_MATCH_SECTION_MIN_SLOT_OCCUPANCY,
      finalSlotOccupancy: 0.28,
      widthRatio: 0.4,
      heightRatio: 0.2,
      sectionUsefulness: REFERENCE_MATCH_MIN_SECTION_USEFULNESS,
      cutRoomCount: 1,
    };
  }
  if (String(panelType).startsWith("elevation_")) {
    return {
      slotOccupancy: REFERENCE_MATCH_ELEVATION_MIN_SLOT_OCCUPANCY,
      finalSlotOccupancy: 0.35,
      widthRatio: 0.38,
      heightRatio: 0.14,
      facadeRichness: REFERENCE_MATCH_MIN_ELEVATION_RICHNESS,
    };
  }
  return {
    slotOccupancy: MIN_TECHNICAL_CONTENT_OCCUPANCY_RATIO,
    finalSlotOccupancy: 0.3,
    widthRatio: MIN_TECHNICAL_CONTENT_WIDTH_RATIO,
    heightRatio: MIN_TECHNICAL_CONTENT_HEIGHT_RATIO,
  };
}

function evaluateReferenceMatchTechnicalPanel({
  panelType,
  artifact,
  placement = null,
  geometryHash = null,
  briefInputHash = null,
} = {}) {
  const metrics = buildPanelReferenceMetrics({
    panelType,
    artifact,
    placement,
    geometryHash,
    briefInputHash,
  });
  const thresholds = referenceMatchTechnicalThresholds(panelType);
  const technicalQualityMetadata = getTechnicalQualityMetadata(artifact);
  const failures = [];
  if (!artifact) {
    failures.push("missing_artifact");
  }
  if (!svgLooksRenderable(artifact?.svgString || "")) {
    failures.push("not_renderable");
  }
  if (metrics.slotOccupancy < thresholds.slotOccupancy) {
    failures.push("slot_occupancy_low");
  }
  if (
    Number(metrics.finalSlotOccupancy || 0) > 0 &&
    Number(metrics.finalSlotOccupancy || 0) < thresholds.finalSlotOccupancy
  ) {
    failures.push("final_slot_fit_low");
  }
  if (
    Number(metrics.contentBBoxRatio?.widthRatio || 0) < thresholds.widthRatio
  ) {
    failures.push("content_width_low");
  }
  if (
    Number(metrics.contentBBoxRatio?.heightRatio || 0) < thresholds.heightRatio
  ) {
    failures.push("content_height_low");
  }
  if (
    thresholds.sectionUsefulness &&
    Number(technicalQualityMetadata.section_usefulness_score || 0) <
      thresholds.sectionUsefulness
  ) {
    failures.push("section_usefulness_low");
  }
  if (
    thresholds.cutRoomCount &&
    Number(technicalQualityMetadata.cut_room_count || 0) <
      thresholds.cutRoomCount
  ) {
    failures.push("section_cut_room_missing");
  }
  if (
    thresholds.facadeRichness &&
    Number(technicalQualityMetadata.facade_richness_score || 0) <
      thresholds.facadeRichness
  ) {
    failures.push("facade_richness_low");
  }
  return {
    panelType,
    ok: failures.length === 0,
    failures,
    thresholds,
    metrics,
    technicalQualityMetadata: {
      slot_occupancy_ratio:
        technicalQualityMetadata.slot_occupancy_ratio || null,
      section_usefulness_score:
        technicalQualityMetadata.section_usefulness_score || null,
      cut_room_count: technicalQualityMetadata.cut_room_count || null,
      facade_richness_score:
        technicalQualityMetadata.facade_richness_score || null,
      window_count: technicalQualityMetadata.window_count || null,
      door_count: technicalQualityMetadata.door_count || null,
    },
  };
}

function count3DGeometryElements(svgString = "") {
  return (String(svgString || "").match(/<(?:polygon|polyline|path)\b/gi) || [])
    .length;
}

function stripEmbeddedImageDataForPlaceholderScan(svg = "") {
  return String(svg || "")
    .replace(
      /\b(xlink:href|href)=["']data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+["']/g,
      '$1="data:image/<redacted>;base64,<redacted>"',
    )
    .replace(
      /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,
      "data:image/<redacted>;base64,<redacted>",
    );
}

function getVisual3DPrimitiveCount(artifact = null) {
  const metadata = artifact?.metadata || {};
  return Number(
    metadata.primitiveCount ??
      metadata.surfaceCount ??
      metadata.geometryPrimitiveCount ??
      0,
  );
}

function visual3DArtifactHasCamera(artifact = null) {
  const metadata = artifact?.metadata || {};
  return Boolean(metadata.camera && typeof metadata.camera === "object");
}

function visual3DArtifactIsGeometryLockedImage(artifact = null) {
  const metadata = artifact?.metadata || {};
  return (
    metadata.source === "project_graph_image_renderer" ||
    metadata.imageRenderFallback === false ||
    metadata.openaiImageUsed === true ||
    metadata.presentationMode === "geometry_locked_image_render" ||
    metadata.visualRenderMode === "photoreal_image_gen"
  );
}

function visual3DArtifactHasImagePayload(artifact = null) {
  const metadata = artifact?.metadata || {};
  const byteLength = Number(
    metadata.imageRenderByteLength ?? metadata.renderProvenance?.bytes ?? 0,
  );
  return (
    byteLength > 0 ||
    /<image\b[^>]+\b(?:href|xlink:href)=["']data:image\/png;base64,/i.test(
      artifact?.svgString || "",
    )
  );
}

function visual3DArtifactHasCompiledControlEvidence(artifact = null) {
  if (!artifact) return false;
  const metadata = artifact.metadata || {};
  const sourceGeometryHash =
    metadata.sourceGeometryHash ||
    metadata.renderProvenance?.sourceGeometryHash ||
    null;
  const artifactGeometryHash =
    artifact.source_model_hash || artifact.geometryHash || null;
  const hashMatches =
    Boolean(sourceGeometryHash) &&
    (!artifactGeometryHash || sourceGeometryHash === artifactGeometryHash);
  return (
    metadata.referenceSource === "compiled_3d_control_svg" &&
    hashMatches &&
    getVisual3DPrimitiveCount(artifact) >= MIN_3D_PRIMITIVE_COUNT &&
    visual3DArtifactHasCamera(artifact)
  );
}

function evaluateVisual3DArtifactStrength(artifact = null) {
  if (!artifact) {
    return {
      ok: false,
      reason: "missing_artifact",
      details: {
        primitiveCount: 0,
        hasCamera: false,
        geometryElementCount: 0,
        hashMatches: false,
        hasImagePayload: false,
        isGeometryLockedImage: false,
      },
    };
  }
  const metadata = artifact.metadata || {};
  const primitiveCount = getVisual3DPrimitiveCount(artifact);
  const hasCamera = visual3DArtifactHasCamera(artifact);
  const isGeometryLockedImage = visual3DArtifactIsGeometryLockedImage(artifact);
  const hasImagePayload = visual3DArtifactHasImagePayload(artifact);
  const sourceGeometryHash =
    metadata.sourceGeometryHash ||
    metadata.renderProvenance?.sourceGeometryHash ||
    null;
  const artifactGeometryHash =
    artifact.source_model_hash || artifact.geometryHash || null;
  const hashMatches =
    Boolean(sourceGeometryHash) &&
    (!artifactGeometryHash || sourceGeometryHash === artifactGeometryHash);
  const geometryElementCount = count3DGeometryElements(
    artifact.svgString || "",
  );
  const details = {
    primitiveCount,
    hasCamera,
    geometryElementCount,
    hashMatches,
    hasImagePayload,
    isGeometryLockedImage,
  };

  if (isGeometryLockedImage) {
    if (!visual3DArtifactHasCompiledControlEvidence(artifact)) {
      return {
        ok: false,
        reason: "missing_compiled_control_evidence",
        details,
      };
    }
    if (!hasImagePayload) {
      return { ok: false, reason: "missing_image_payload", details };
    }
    return { ok: true, reason: null, details };
  }

  if (primitiveCount < MIN_3D_PRIMITIVE_COUNT) {
    return { ok: false, reason: "primitive_count_below_minimum", details };
  }
  if (!hasCamera) {
    return { ok: false, reason: "missing_camera", details };
  }
  if (geometryElementCount < MIN_3D_PRIMITIVE_COUNT) {
    return {
      ok: false,
      reason: "geometry_element_count_below_minimum",
      details,
    };
  }
  return { ok: true, reason: null, details };
}

function visual3DArtifactTooWeak(artifact = null) {
  return !evaluateVisual3DArtifactStrength(artifact).ok;
}

// RIBA A1 plan §10 scorecard category weights — must total 100.
export const QA_CATEGORY_WEIGHTS = Object.freeze({
  programme: 20,
  consistency_2d_3d: 20,
  site_context: 15,
  climate: 15,
  regulation: 10,
  architecture: 10,
  graphic: 10,
});

function computeCategoryScores(checks) {
  const earned = {};
  const max = {};
  for (const code of Object.keys(QA_CATEGORY_WEIGHTS)) {
    earned[code] = 0;
    max[code] = 0;
  }
  for (const check of checks) {
    if (!check.category || !Number.isFinite(check.weight)) continue;
    if (!(check.category in QA_CATEGORY_WEIGHTS)) continue;
    max[check.category] += check.weight;
    if (check.status === "pass") {
      earned[check.category] += check.weight;
    }
  }
  // Re-normalise per category so the earned points reflect plan §10 weights
  // even if a category's check set sums to a different number.
  const breakdown = {};
  let totalScore = 0;
  for (const cat of Object.keys(QA_CATEGORY_WEIGHTS)) {
    const target = QA_CATEGORY_WEIGHTS[cat];
    const denom = max[cat] || 0;
    const ratio = denom > 0 ? earned[cat] / denom : 0;
    const points = Math.round(ratio * target * 100) / 100;
    breakdown[cat] = {
      earned: points,
      max: target,
      ratio: Math.round(ratio * 1000) / 1000,
    };
    totalScore += points;
  }
  return {
    breakdown,
    totalScore: Math.round(totalScore * 100) / 100,
  };
}

export function validateProjectGraphVerticalSlice({
  projectGraph,
  artifacts = {},
  targetAreaTolerance = 0.15,
} = {}) {
  const checks = [];
  const issues = [];
  const geometryHash = projectGraph?.selected_design?.source_model_hash;
  const referenceMatch =
    projectGraph?.brief?.reference_match === true ||
    projectGraph?.brief?.referenceMatch === true ||
    artifacts?.referenceMatch === true ||
    artifacts?.a1Sheet?.referenceMatch === true ||
    artifacts?.a1Sheet?.metadata?.referenceMatch === true;
  const briefInputHash =
    projectGraph?.brief?.brief_input_hash ||
    artifacts?.a1Sheet?.briefInputHash ||
    artifacts?.a1Sheet?.metadata?.briefInputHash ||
    null;
  const programmeIds = new Set(
    (projectGraph?.programme?.spaces || []).map((space) => space.space_id),
  );
  const modelIds = new Set(
    (projectGraph?.selected_design?.spaces || []).map(
      (space) => space.space_id,
    ),
  );
  const missingModelSpaces = [...programmeIds].filter(
    (id) => !modelIds.has(id),
  );
  addCheck(
    checks,
    "PROGRAMME_SPACES_IN_MODEL",
    missingModelSpaces.length === 0,
    {
      missingModelSpaces,
    },
    "programme",
    10,
  );
  if (missingModelSpaces.length) {
    issues.push(
      buildIssue(
        "PROGRAMME_SPACE_MISSING_IN_MODEL",
        "error",
        "Programme space is missing from selected_design.",
        { missingModelSpaces },
      ),
    );
  }

  const drawingHashes = [
    ...new Set(
      (projectGraph?.drawings?.drawings || []).map(
        (drawing) => drawing.source_model_hash,
      ),
    ),
  ];
  const drawingHashMatch =
    drawingHashes.length === 1 && drawingHashes[0] === geometryHash;
  addCheck(
    checks,
    "DRAWINGS_SHARE_MODEL_HASH",
    drawingHashMatch,
    { drawingHashes, geometryHash },
    "consistency_2d_3d",
    5,
  );
  if (!drawingHashMatch) {
    issues.push(
      buildIssue(
        "SOURCE_MODEL_HASH_MISMATCH_2D",
        "error",
        "2D drawings do not all reference the selected design source_model_hash.",
        { drawingHashes, geometryHash },
      ),
    );
  }

  const sceneHash = artifacts.scene3d?.source_model_hash || null;
  const sceneHashMatch = Boolean(sceneHash) && sceneHash === geometryHash;
  addCheck(
    checks,
    "THREE_D_SCENE_SHARES_MODEL_HASH",
    sceneHashMatch,
    { sceneHash, geometryHash },
    "consistency_2d_3d",
    5,
  );
  if (!sceneHashMatch) {
    issues.push(
      buildIssue(
        "SOURCE_MODEL_HASH_MISMATCH_3D",
        "error",
        "3D scene does not reference the selected design source_model_hash.",
        { sceneHash, geometryHash },
      ),
    );
  }

  const graphModel3dHash =
    projectGraph?.models3d?.models?.[0]?.source_model_hash ||
    projectGraph?.models_3d?.models?.[0]?.source_model_hash ||
    null;
  const graphModel3dHashMatch =
    Boolean(graphModel3dHash) && graphModel3dHash === geometryHash;
  addCheck(
    checks,
    "PROJECT_GRAPH_REFERENCES_3D_PROJECTION",
    graphModel3dHashMatch,
    { graphModel3dHash, geometryHash },
    "consistency_2d_3d",
    5,
  );
  if (!graphModel3dHashMatch) {
    issues.push(
      buildIssue(
        "PROJECT_GRAPH_3D_REFERENCE_MISSING",
        "error",
        "ProjectGraph does not reference the 3D projection with the selected design source_model_hash.",
        { graphModel3dHash, geometryHash },
      ),
    );
  }

  const actualGia = Number(
    projectGraph?.programme?.area_summary?.gross_internal_area_m2 || 0,
  );
  const targetGia = Number(projectGraph?.brief?.target_gia_m2 || 0);
  const areaDeltaRatio =
    targetGia > 0 ? Math.abs(actualGia - targetGia) / targetGia : 0;
  const areaOk = targetGia > 0 && areaDeltaRatio <= targetAreaTolerance;
  addCheck(
    checks,
    "GIA_WITHIN_TOLERANCE",
    areaOk,
    {
      actualGia,
      targetGia,
      areaDeltaRatio: round(areaDeltaRatio, 4),
      targetAreaTolerance,
    },
    "programme",
    10,
  );
  if (!areaOk) {
    issues.push(
      buildIssue(
        "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
        "error",
        "Actual GIA is outside the configured target tolerance.",
        { actualGia, targetGia, areaDeltaRatio, targetAreaTolerance },
      ),
    );
  }

  const drawingIds = new Set(
    (projectGraph?.drawings?.drawings || []).map(
      (drawing) => drawing.drawing_id,
    ),
  );
  const sheetDrawingIds = (projectGraph?.sheets?.sheets || []).flatMap(
    (sheet) => sheet.drawing_ids || [],
  );
  const missingSheetDrawings = sheetDrawingIds.filter(
    (id) => !drawingIds.has(id),
  );
  addCheck(
    checks,
    "A1_SHEET_REFERENCES_EXISTING_DRAWINGS",
    missingSheetDrawings.length === 0,
    { missingSheetDrawings },
    "graphic",
    5,
  );
  if (missingSheetDrawings.length) {
    issues.push(
      buildIssue(
        "A1_SHEET_REFERENCE_MISSING",
        "error",
        "A1 sheet references drawings that do not exist.",
        { missingSheetDrawings },
      ),
    );
  }

  const sheetArtifactHash = artifacts.a1Sheet?.source_model_hash || null;
  const sheetHashOk =
    Boolean(sheetArtifactHash) && sheetArtifactHash === geometryHash;
  addCheck(
    checks,
    "A1_SHEET_SHARES_MODEL_HASH",
    sheetHashOk,
    { sheetArtifactHash, geometryHash },
    "consistency_2d_3d",
    5,
  );
  if (!sheetHashOk) {
    issues.push(
      buildIssue(
        "A1_SHEET_MODEL_HASH_MISMATCH",
        "error",
        "A1 sheet artifact does not reference the selected design source_model_hash.",
        { sheetArtifactHash, geometryHash },
      ),
    );
  }

  const pdfArtifact = artifacts.a1Pdf || null;
  const pdfPageOk =
    pdfArtifact?.asset_type === "a1_sheet_pdf" &&
    pdfArtifact?.orientation === "landscape" &&
    Number(pdfArtifact?.sheet_size_mm?.width) === 841 &&
    Number(pdfArtifact?.sheet_size_mm?.height) === 594 &&
    pdfArtifact?.source_model_hash === geometryHash;
  addCheck(
    checks,
    "A1_PDF_EXPORT_PRESENT_AND_SIZED",
    pdfPageOk,
    {
      assetType: pdfArtifact?.asset_type || null,
      sheetSizeMm: pdfArtifact?.sheet_size_mm || null,
      sourceModelHash: pdfArtifact?.source_model_hash || null,
      geometryHash,
    },
    "graphic",
    5,
  );
  if (!pdfPageOk) {
    issues.push(
      buildIssue(
        "A1_PDF_EXPORT_MISSING_OR_WRONG_SIZE",
        "error",
        "A1 PDF export is missing, wrong size, or not tied to the ProjectGraph source model hash.",
        {
          sheetSizeMm: pdfArtifact?.sheet_size_mm || null,
          sourceModelHash: pdfArtifact?.source_model_hash || null,
          geometryHash,
        },
      ),
    );
  }

  const renderedProof = pdfArtifact?.renderedProof || artifacts.renderedProof;
  const renderedInkRatio = Number(
    renderedProof?.occupancy?.nonBackgroundPixelRatio || 0,
  );
  const renderedProofOk =
    renderedProof?.passed === true &&
    Boolean(renderedProof?.renderedPngHash) &&
    renderedInkRatio >= MIN_RENDERED_SHEET_INK_RATIO &&
    renderedProof?.textRenderStatus?.passed === true &&
    Number(renderedProof?.requiredMissingPanelCount || 0) === 0;
  addCheck(
    checks,
    "A1_PDF_RENDER_PROOF_PRESENT",
    renderedProofOk,
    {
      renderedPngHash: renderedProof?.renderedPngHash || null,
      nonBackgroundPixelRatio: renderedInkRatio,
      minimum: MIN_RENDERED_SHEET_INK_RATIO,
      requiredRenderablePanelCount:
        renderedProof?.requiredRenderablePanelCount || 0,
      requiredReadyPanelCount: renderedProof?.requiredReadyPanelCount || 0,
      requiredMissingPanelCount: renderedProof?.requiredMissingPanelCount || 0,
      missingRequiredPanels: renderedProof?.missingRequiredPanels || [],
      textRenderStatus: renderedProof?.textRenderStatus?.status || null,
    },
    "graphic",
    0,
  );
  if (!renderedProofOk) {
    issues.push(
      buildIssue(
        "A1_PDF_RENDER_EMPTY",
        "error",
        "A1 PDF render proof is missing or too close to a blank sheet.",
        {
          renderedPngHash: renderedProof?.renderedPngHash || null,
          nonBackgroundPixelRatio: renderedInkRatio,
          minimum: MIN_RENDERED_SHEET_INK_RATIO,
          requiredMissingPanelCount:
            renderedProof?.requiredMissingPanelCount || 0,
          missingRequiredPanels: renderedProof?.missingRequiredPanels || [],
          textRenderStatus: renderedProof?.textRenderStatus || null,
        },
      ),
    );
  }
  const textProofOk =
    renderedProof?.textRenderStatus?.passed === true &&
    renderedProof?.textRenderStatus?.rasterTextMode === "font_paths";
  addCheck(
    checks,
    "A1_PDF_TEXT_RENDER_PROOF_PASS",
    textProofOk,
    {
      textRenderStatus: renderedProof?.textRenderStatus || null,
      sheetTextRenderStatus: artifacts.a1Sheet?.textRenderStatus || null,
    },
    "graphic",
    0,
  );
  if (!textProofOk) {
    issues.push(
      buildIssue(
        "A1_PDF_TEXT_RENDER_PROOF_FAILED",
        "error",
        "A1 PDF text proof failed; refusing a sheet that may render square/tofu glyphs.",
        {
          textRenderStatus: renderedProof?.textRenderStatus || null,
          sheetTextRenderStatus: artifacts.a1Sheet?.textRenderStatus || null,
        },
      ),
    );
  }

  const panelArtifacts = {
    ...(artifacts.drawings || {}),
    ...(artifacts.panelArtifacts || {}),
  };
  const placementByPanelType = new Map(
    (artifacts.a1Sheet?.panelPlacements || []).map((placement) => [
      placement.panelType,
      placement,
    ]),
  );
  const expectedPanels = expectedRequiredPanelTypes(
    projectGraph?.brief?.target_storeys || 1,
    artifacts.a1Sheet?.layoutTemplate ||
      resolvePresentationLayoutTemplate(projectGraph?.brief || {}),
  );
  const panelRenderabilityRecords = expectedPanels.map((panelType) => {
    const artifact = findPanelArtifact(panelArtifacts, panelType);
    const evaluation = evaluatePanelRenderability(artifact);
    const placement = placementByPanelType.get(panelType) || null;
    const referenceMetrics = buildPanelReferenceMetrics({
      panelType,
      artifact,
      placement,
      geometryHash,
      briefInputHash,
    });
    return {
      panelType,
      ...evaluation,
      assetId: artifact?.asset_id || null,
      assetType: artifact?.asset_type || null,
      source: artifact?.metadata?.source || null,
      drawingType:
        artifact?.drawingType || artifact?.metadata?.drawingType || null,
      slotOccupancy: referenceMetrics.slotOccupancy,
      finalSlotOccupancy: referenceMetrics.finalSlotOccupancy,
      finalSlotFit: referenceMetrics.finalSlotFit,
      contentBBoxRatio: referenceMetrics.contentBBoxRatio,
      sourceGeometryHash: referenceMetrics.sourceGeometryHash,
      panelIdentityHash: referenceMetrics.panelIdentityHash,
      briefInputHash: referenceMetrics.briefInputHash,
      renderMode: referenceMetrics.renderMode,
    };
  });
  const missingRequiredPanels = panelRenderabilityRecords.filter(
    (record) => !record.ok,
  );
  const missingRequiredPanelTypes = missingRequiredPanels.map(
    (record) => record.panelType,
  );
  addCheck(
    checks,
    "A1_REQUIRED_PANEL_CONTENT_PRESENT",
    missingRequiredPanels.length === 0,
    {
      missingRequiredPanels,
      missingRequiredPanelTypes,
      expectedPanels,
    },
    "graphic",
    0,
  );
  if (missingRequiredPanels.length) {
    issues.push(
      buildIssue(
        "A1_PANEL_CONTENT_MISSING",
        "error",
        "One or more required A1 panels are missing renderable source content.",
        {
          missingRequiredPanels,
          missingRequiredPanelTypes,
        },
      ),
    );
  }

  if (referenceMatch) {
    const activeBrief = projectGraph?.brief || {};
    const titleBlockArtifact = findPanelArtifact(panelArtifacts, "title_block");
    const titleMetadata = titleBlockArtifact?.metadata || {};
    const titleBriefMatches =
      titleMetadata.briefInputHash === briefInputHash &&
      titleMetadata.projectName === activeBrief.project_name &&
      Number(titleMetadata.targetGiaM2 || 0) ===
        Number(activeBrief.target_gia_m2 || 0) &&
      Number(titleMetadata.targetStoreys || 0) ===
        Number(activeBrief.target_storeys || 0) &&
      String(titleMetadata.location || "") ===
        String(
          activeBrief.site_input?.address ||
            activeBrief.site_input?.postcode ||
            "",
        );
    addCheck(
      checks,
      "REFERENCE_MATCH_BRIEF_AUTHORITY_CURRENT",
      titleBriefMatches,
      {
        titleBlock: {
          briefInputHash: titleMetadata.briefInputHash || null,
          projectName: titleMetadata.projectName || null,
          location: titleMetadata.location || null,
          targetGiaM2: titleMetadata.targetGiaM2 || null,
          targetStoreys: titleMetadata.targetStoreys || null,
        },
        activeBrief: {
          briefInputHash,
          projectName: activeBrief.project_name || null,
          location:
            activeBrief.site_input?.address ||
            activeBrief.site_input?.postcode ||
            null,
          targetGiaM2: activeBrief.target_gia_m2 || null,
          targetStoreys: activeBrief.target_storeys || null,
        },
      },
      "graphic",
      0,
    );
    if (!titleBriefMatches) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_STALE_BRIEF_DATA",
          "error",
          "Reference-match A1 title block does not match the active generation brief.",
          {
            titleMetadata,
            activeBrief: {
              briefInputHash,
              projectName: activeBrief.project_name || null,
              siteInput: activeBrief.site_input || null,
              targetGiaM2: activeBrief.target_gia_m2 || null,
              targetStoreys: activeBrief.target_storeys || null,
            },
          },
        ),
      );
    }

    const expectedUpperFloorPanels = floorPlanPanelTypes(
      activeBrief.target_storeys || 1,
    ).slice(1);
    const missingUpperFloorPanels = expectedUpperFloorPanels.filter(
      (panelType) => {
        const record = panelRenderabilityRecords.find(
          (entry) => entry.panelType === panelType,
        );
        return !record?.ok;
      },
    );
    addCheck(
      checks,
      "REFERENCE_MATCH_UPPER_FLOORS_PRESENT",
      missingUpperFloorPanels.length === 0,
      { expectedUpperFloorPanels, missingUpperFloorPanels },
      "graphic",
      0,
    );
    if (missingUpperFloorPanels.length) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_UPPER_FLOOR_MISSING",
          "error",
          "Reference-match residential board is missing a requested upper-floor plan.",
          { expectedUpperFloorPanels, missingUpperFloorPanels },
        ),
      );
    }

    const blankTechnicalPanels = panelRenderabilityRecords.filter((record) => {
      if (
        !String(record.panelType || "").startsWith("floor_plan_") &&
        !String(record.panelType || "").startsWith("section_") &&
        !String(record.panelType || "").startsWith("elevation_")
      ) {
        return false;
      }
      return (
        !record.ok ||
        Number(record.slotOccupancy || 0) <= 0 ||
        Number(record.finalSlotOccupancy || 0) <= 0 ||
        Number(record.contentBBoxRatio?.widthRatio || 0) <= 0 ||
        Number(record.contentBBoxRatio?.heightRatio || 0) <= 0
      );
    });
    addCheck(
      checks,
      "REFERENCE_MATCH_NO_BLANK_PANEL_AREA",
      blankTechnicalPanels.length === 0,
      { blankTechnicalPanels },
      "graphic",
      0,
    );
    if (blankTechnicalPanels.length) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_BLANK_PANEL_AREA",
          "error",
          "Reference-match A1 contains a technical panel with blank or unmeasured content area.",
          { blankTechnicalPanels },
        ),
      );
    }
  }

  const technicalPanelTypesForStoreys = buildTechnicalA1PanelTypes(
    projectGraph?.brief?.target_storeys || 1,
  );
  const technicalPanelFailures = technicalPanelTypesForStoreys.filter(
    (panelType) => {
      const artifact = findPanelArtifact(artifacts.drawings || {}, panelType);
      const svg = artifact?.svgString || "";
      return (
        !svgLooksRenderable(svg) ||
        svg.length < MIN_TECHNICAL_SVG_LENGTH ||
        svgHasInvalidTokens(svg) ||
        technicalPanelIdentityMismatch(panelType, artifact) ||
        technicalContentBoundsTooSmall(artifact) ||
        !getTechnicalNormalizedViewBox(artifact)
      );
    },
  );
  const technicalPanelIdentityFailures = technicalPanelTypesForStoreys.filter(
    (panelType) =>
      technicalPanelIdentityMismatch(
        panelType,
        findPanelArtifact(artifacts.drawings || {}, panelType),
      ),
  );
  const technicalContentBoundsFailures = technicalPanelTypesForStoreys.filter(
    (panelType) => {
      const artifact = findPanelArtifact(artifacts.drawings || {}, panelType);
      return !getTechnicalContentBounds(artifact);
    },
  );
  const technicalUnderscaledPanels = technicalPanelTypesForStoreys.filter(
    (panelType) =>
      technicalContentBoundsTooSmall(
        findPanelArtifact(artifacts.drawings || {}, panelType),
      ),
  );
  const technicalViewBoxFailures = technicalPanelTypesForStoreys.filter(
    (panelType) =>
      !getTechnicalNormalizedViewBox(
        findPanelArtifact(artifacts.drawings || {}, panelType),
      ),
  );
  addCheck(
    checks,
    "TECHNICAL_DRAWINGS_RENDERABLE",
    technicalPanelFailures.length === 0,
    {
      technicalPanelFailures,
      minimumSvgLength: MIN_TECHNICAL_SVG_LENGTH,
      technicalPanelIdentityFailures,
      technicalContentBoundsFailures,
      technicalUnderscaledPanels,
      technicalViewBoxFailures,
      minimumContentOccupancyRatio: MIN_TECHNICAL_CONTENT_OCCUPANCY_RATIO,
      minimumContentWidthRatio: MIN_TECHNICAL_CONTENT_WIDTH_RATIO,
      minimumContentHeightRatio: MIN_TECHNICAL_CONTENT_HEIGHT_RATIO,
    },
    "graphic",
    0,
  );
  if (technicalPanelFailures.length) {
    issues.push(
      buildIssue(
        "TECHNICAL_DRAWING_OCCUPANCY_TOO_LOW",
        "error",
        "Technical drawing SVG content is missing, invalid, or too small to be legible.",
        {
          technicalPanelFailures,
          technicalPanelIdentityFailures,
          technicalContentBoundsFailures,
          technicalUnderscaledPanels,
          technicalViewBoxFailures,
        },
      ),
    );
    if (technicalPanelIdentityFailures.length) {
      issues.push(
        buildIssue(
          "TECHNICAL_DRAWING_PANEL_ID_MISMATCH",
          "error",
          "Technical drawing artifact identity does not match its expected panel type.",
          { technicalPanelIdentityFailures },
        ),
      );
    }
    if (technicalContentBoundsFailures.length) {
      issues.push(
        buildIssue(
          "TECHNICAL_DRAWING_CONTENT_BOUNDS_MISSING",
          "error",
          "Technical drawing artifacts must expose measured content bounds before A1 composition.",
          { technicalContentBoundsFailures },
        ),
      );
    }
    if (technicalUnderscaledPanels.length) {
      issues.push(
        buildIssue(
          "TECHNICAL_DRAWING_CONTENT_UNDERSCALED",
          "error",
          "Technical drawing content occupies too little of its render frame to be legible on A1.",
          {
            technicalUnderscaledPanels,
            minimumContentOccupancyRatio: MIN_TECHNICAL_CONTENT_OCCUPANCY_RATIO,
            minimumContentWidthRatio: MIN_TECHNICAL_CONTENT_WIDTH_RATIO,
            minimumContentHeightRatio: MIN_TECHNICAL_CONTENT_HEIGHT_RATIO,
          },
        ),
      );
    }
    if (technicalViewBoxFailures.length) {
      issues.push(
        buildIssue(
          "TECHNICAL_DRAWING_VIEWBOX_NOT_TIGHT",
          "error",
          "Technical drawing artifacts must provide a content-normalized viewBox for readable A1 placement.",
          { technicalViewBoxFailures },
        ),
      );
    }
    const invalidSections = technicalPanelFailures.filter((panelType) =>
      panelType.startsWith("section_"),
    );
    if (invalidSections.length) {
      issues.push(
        buildIssue(
          "SECTION_CUT_INVALID",
          "error",
          "One or more section panels are missing, invalid, or collapsed.",
          { invalidSections },
        ),
      );
    }
  }

  const siteMapArtifact =
    artifacts.siteMap || findPanelArtifact(panelArtifacts, "site_context");
  const siteMapSource =
    siteMapArtifact?.metadata?.siteMapSource ||
    siteMapArtifact?.metadata?.source ||
    null;
  const siteMapPresent = Boolean(siteMapArtifact?.svgString);
  addCheck(
    checks,
    "SITE_MAP_PANEL_PRESENT",
    siteMapPresent,
    {
      siteMapSource,
      hasMapImage: siteMapArtifact?.metadata?.hasMapImage === true,
    },
    "site_context",
    0,
  );
  if (!siteMapPresent) {
    issues.push(
      buildIssue(
        "SITE_MAP_MISSING",
        "error",
        "The A1 site/context panel is missing.",
        { siteMapSource },
      ),
    );
  } else if (siteMapArtifact?.metadata?.hasMapImage !== true) {
    issues.push(
      buildIssue(
        "SITE_MAP_FALLBACK_USED",
        "warning",
        "No Google/provided site map snapshot was available; deterministic site diagram fallback was used.",
        { siteMapSource },
      ),
    );
  }
  if (siteMapArtifact?.metadata?.boundaryAuthoritative === false) {
    issues.push(
      buildIssue(
        SITE_BOUNDARY_ESTIMATED_WARNING_CODE,
        "warning",
        "Site boundary is estimated only and was not treated as authoritative plot area.",
        {
          boundarySource: siteMapArtifact.metadata.boundarySource || null,
          boundaryConfidence:
            siteMapArtifact.metadata.boundaryConfidence ?? null,
          fallbackReason: siteMapArtifact.metadata.fallbackReason || null,
          estimatedAreaM2: siteMapArtifact.metadata.estimatedAreaM2 || null,
          sitePlanMode: siteMapArtifact.metadata.sitePlanMode || null,
        },
      ),
    );
  }
  addCheck(
    checks,
    "TECHNICAL_DRAWINGS_CONTENT_BOUNDS_TIGHT",
    technicalContentBoundsFailures.length === 0 &&
      technicalUnderscaledPanels.length === 0 &&
      technicalViewBoxFailures.length === 0,
    {
      technicalContentBoundsFailures,
      technicalUnderscaledPanels,
      technicalViewBoxFailures,
    },
    "graphic",
    0,
  );

  if (referenceMatch) {
    const referenceTechnicalEvaluations = technicalPanelTypesForStoreys.map(
      (panelType) =>
        evaluateReferenceMatchTechnicalPanel({
          panelType,
          artifact: findPanelArtifact(artifacts.drawings || {}, panelType),
          placement: placementByPanelType.get(panelType) || null,
          geometryHash,
          briefInputHash,
        }),
    );
    const referenceTechnicalFailures = referenceTechnicalEvaluations.filter(
      (entry) => !entry.ok,
    );
    const weakSectionCuts = referenceTechnicalFailures.filter((entry) =>
      String(entry.panelType || "").startsWith("section_"),
    );
    addCheck(
      checks,
      "REFERENCE_MATCH_TECHNICAL_PANEL_READABILITY",
      referenceTechnicalFailures.length === 0,
      {
        referenceTechnicalFailures,
        thresholds: {
          planSlotOccupancy: REFERENCE_MATCH_PLAN_MIN_SLOT_OCCUPANCY,
          sectionSlotOccupancy: REFERENCE_MATCH_SECTION_MIN_SLOT_OCCUPANCY,
          elevationSlotOccupancy: REFERENCE_MATCH_ELEVATION_MIN_SLOT_OCCUPANCY,
          planFinalSlotOccupancy: 0.5,
          sectionFinalSlotOccupancy: 0.28,
          elevationFinalSlotOccupancy: 0.35,
          sectionUsefulness: REFERENCE_MATCH_MIN_SECTION_USEFULNESS,
          elevationRichness: REFERENCE_MATCH_MIN_ELEVATION_RICHNESS,
        },
      },
      "graphic",
      0,
    );
    if (referenceTechnicalFailures.length) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_LOW_PANEL_OCCUPANCY",
          "error",
          "Reference-match technical panels do not meet the stricter A1 readability thresholds.",
          { referenceTechnicalFailures },
        ),
      );
    }
    if (weakSectionCuts.length) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_WEAK_SECTION_CUT",
          "error",
          "Reference-match section cuts are too weak for a professional A1 board.",
          { weakSectionCuts },
        ),
      );
    }

    const elevationIdentityRecords = referenceTechnicalEvaluations
      .filter((entry) => String(entry.panelType || "").startsWith("elevation_"))
      .map((entry) => ({
        panelType: entry.panelType,
        panelIdentityHash: entry.metrics.panelIdentityHash,
        slotOccupancy: entry.metrics.slotOccupancy,
        finalSlotOccupancy: entry.metrics.finalSlotOccupancy,
        finalSlotFit: entry.metrics.finalSlotFit,
        contentBBoxRatio: entry.metrics.contentBBoxRatio,
      }));
    const distinctElevationIdentities = new Set(
      elevationIdentityRecords.map((entry) => entry.panelIdentityHash),
    );
    const elevationsDistinct =
      elevationIdentityRecords.length === 4 &&
      distinctElevationIdentities.size === elevationIdentityRecords.length;
    addCheck(
      checks,
      "REFERENCE_MATCH_ELEVATION_IDENTITIES_DISTINCT",
      elevationsDistinct,
      { elevationIdentityRecords },
      "graphic",
      0,
    );
    if (!elevationsDistinct) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_REPEATED_ELEVATION_IDENTITY",
          "error",
          "North, south, east and west elevations must be side-specific in reference-match exports.",
          { elevationIdentityRecords },
        ),
      );
    }
  }

  const required3dPanelTypes = REQUIRED_3D_A1_PANEL_TYPES.filter((panelType) =>
    expectedPanels.includes(panelType),
  );
  const visuals3d = artifacts.visuals3d || {};
  const missing3dPanels = required3dPanelTypes.filter((panelType) => {
    const artifact =
      visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
    return !artifact || !svgLooksRenderable(artifact.svgString || "");
  });
  const wrong3dHashPanels = required3dPanelTypes.filter((panelType) => {
    const artifact =
      visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
    return artifact && artifact.source_model_hash !== geometryHash;
  });
  const placeholder3dPanels = required3dPanelTypes
    .map((panelType) => {
      const artifact =
        visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
      if (!artifact) return null;
      const svg = artifact.svgString || "";
      const svgLength = svg.length;
      const strength = evaluateVisual3DArtifactStrength(artifact);
      const baseDetails = {
        panelType,
        svgLength,
        isGeometryLockedImage: strength.details.isGeometryLockedImage,
        primitiveCount: strength.details.primitiveCount,
        hasCamera: strength.details.hasCamera,
        geometryElementCount: strength.details.geometryElementCount,
        hasImagePayload: strength.details.hasImagePayload,
        hashMatches: strength.details.hashMatches,
        sourceGeometryHash:
          artifact.metadata?.sourceGeometryHash ||
          artifact.metadata?.renderProvenance?.sourceGeometryHash ||
          null,
        artifactGeometryHash:
          artifact.source_model_hash || artifact.geometryHash || null,
      };
      if (artifact.metadata?.source === "placeholder") {
        return { ...baseDetails, reason: "metadata_source_placeholder" };
      }
      if (!strength.details.isGeometryLockedImage && svgLength < 1200) {
        return { ...baseDetails, reason: "svg_too_short" };
      }
      const placeholderScanSvg = stripEmbeddedImageDataForPlaceholderScan(svg);
      if (
        /1x1|placeholder_3d|geometryRenderService/i.test(placeholderScanSvg)
      ) {
        return { ...baseDetails, reason: "regex_match_placeholder" };
      }
      if (!strength.ok) {
        return { ...baseDetails, reason: strength.reason || "too_weak" };
      }
      return null;
    })
    .filter(Boolean);
  addCheck(
    checks,
    "REQUIRED_3D_PANELS_PRESENT",
    missing3dPanels.length === 0 && wrong3dHashPanels.length === 0,
    {
      missing3dPanels,
      wrong3dHashPanels,
      expected: required3dPanelTypes,
      primitiveMinimum: MIN_3D_PRIMITIVE_COUNT,
    },
    "consistency_2d_3d",
    0,
  );
  if (missing3dPanels.length) {
    issues.push(
      buildIssue(
        "REQUIRED_3D_PANEL_MISSING",
        "error",
        "Required ProjectGraph-derived 3D A1 panels are missing.",
        { missing3dPanels },
      ),
    );
  }
  if (wrong3dHashPanels.length) {
    issues.push(
      buildIssue(
        "GEOMETRY_HASH_MISMATCH_2D_3D",
        "error",
        "3D panel geometry hashes do not match the ProjectGraph geometry hash.",
        { wrong3dHashPanels, geometryHash },
      ),
    );
  }
  if (placeholder3dPanels.length) {
    issues.push(
      buildIssue(
        "PLACEHOLDER_3D_RENDER_USED",
        "error",
        "Placeholder 3D output was used where compiled ProjectGraph 3D control renders are required.",
        {
          placeholder3dPanels,
          primitiveMinimum: MIN_3D_PRIMITIVE_COUNT,
        },
      ),
    );
  }
  const fallbackPresentationPanels = REQUIRED_3D_A1_PANEL_TYPES.filter(
    (panelType) => {
      const artifact =
        visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
      return (
        artifact && artifact.metadata?.source !== "project_graph_image_renderer"
      );
    },
  );
  addCheck(
    checks,
    "PRESENTATION_IMAGE_RENDER_STATUS",
    fallbackPresentationPanels.length === 0,
    {
      fallbackPresentationPanels,
      expectedSource: "project_graph_image_renderer",
      fallbackSource: "compiled_project_render_inputs",
    },
    "graphic",
    0,
  );
  if (fallbackPresentationPanels.length) {
    issues.push(
      buildIssue(
        "PRESENTATION_RENDER_FALLBACK_USED",
        referenceMatch ? "error" : "warning",
        "Photoreal presentation image rendering was unavailable; deterministic ProjectGraph control renders were used instead.",
        { fallbackPresentationPanels, referenceMatch },
      ),
    );
    if (referenceMatch) {
      issues.push(
        buildIssue(
          "REFERENCE_MATCH_PHOTOREAL_FALLBACK_USED",
          "error",
          "Reference-match A1 export requires geometry-locked photoreal image panels; deterministic fallback is not publishable.",
          { fallbackPresentationPanels },
        ),
      );
    }
  }

  // Plan §10 site/context category (15 pts)
  const siteOk = projectGraph?.site || {};
  const siteHasBoundary = Array.isArray(siteOk.local_boundary_polygon)
    ? siteOk.local_boundary_polygon.length >= 3
    : false;
  addCheck(
    checks,
    "SITE_HAS_LOCAL_BOUNDARY",
    siteHasBoundary,
    { vertexCount: siteOk.local_boundary_polygon?.length || 0 },
    "site_context",
    5,
  );
  const siteHasArea = Number(siteOk.area_m2 || 0) > 0;
  addCheck(
    checks,
    "SITE_HAS_AREA",
    siteHasArea,
    { areaM2: siteOk.area_m2 || null },
    "site_context",
    5,
  );
  const siteHasDataQuality = Array.isArray(siteOk.data_quality)
    ? siteOk.data_quality.length > 0
    : false;
  addCheck(
    checks,
    "SITE_HAS_DATA_QUALITY",
    siteHasDataQuality,
    { dataQualityCount: siteOk.data_quality?.length || 0 },
    "site_context",
    5,
  );

  // Plan §10 climate category (15 pts)
  const climateOk = projectGraph?.climate || {};
  const climateHasOverheating =
    typeof climateOk.overheating?.risk_level === "string" &&
    climateOk.overheating.risk_level !== "unknown";
  addCheck(
    checks,
    "CLIMATE_HAS_OVERHEATING_RISK",
    climateHasOverheating,
    { riskLevel: climateOk.overheating?.risk_level || null },
    "climate",
    5,
  );
  const climateHasPassiveMoves = Array.isArray(climateOk.passive_design_moves)
    ? climateOk.passive_design_moves.length > 0
    : false;
  addCheck(
    checks,
    "CLIMATE_HAS_PASSIVE_DESIGN_MOVES",
    climateHasPassiveMoves,
    { moveCount: climateOk.passive_design_moves?.length || 0 },
    "climate",
    5,
  );
  const climateHasDataQuality = Array.isArray(climateOk.data_quality)
    ? climateOk.data_quality.length > 0
    : false;
  addCheck(
    checks,
    "CLIMATE_HAS_DATA_QUALITY",
    climateHasDataQuality,
    { dataQualityCount: climateOk.data_quality?.length || 0 },
    "climate",
    5,
  );

  // Plan §10 regulation category (10 pts) — split between metadata presence
  // (2 pts) and concrete rule evaluation (8 pts) so the score actually
  // reflects whether rules ran and whether any hard blockers fired.
  const regOk = projectGraph?.regulations || {};
  const regHasParts = Array.isArray(regOk.applicable_parts)
    ? regOk.applicable_parts.length > 0
    : false;
  addCheck(
    checks,
    "REGULATION_HAS_APPLICABLE_PARTS",
    regHasParts,
    { partCount: regOk.applicable_parts?.length || 0 },
    "regulation",
    1,
  );
  const regHasSources = Array.isArray(regOk.source_documents)
    ? regOk.source_documents.length > 0
    : false;
  addCheck(
    checks,
    "REGULATION_HAS_SOURCE_DOCUMENTS",
    regHasSources,
    { sourceCount: regOk.source_documents?.length || 0 },
    "regulation",
    1,
  );
  const regHardBlockers = (regOk.rule_summary?.hard_blocker_count || 0) === 0;
  addCheck(
    checks,
    "REGULATION_NO_HARD_BLOCKERS",
    regHardBlockers,
    {
      hardBlockerCount: regOk.rule_summary?.hard_blocker_count || 0,
      failedRuleCount: regOk.rule_summary?.fail || 0,
    },
    "regulation",
    4,
  );
  const ruleCoverage = Array.isArray(regOk.rule_coverage)
    ? regOk.rule_coverage
    : [];
  const evaluatedPartCount = ruleCoverage.filter(
    (entry) => entry.evaluated,
  ).length;
  addCheck(
    checks,
    "REGULATION_RULES_EVALUATED",
    evaluatedPartCount > 0,
    {
      evaluatedPartCount,
      totalPartCount: ruleCoverage.length,
      evaluatedParts: ruleCoverage
        .filter((entry) => entry.evaluated)
        .map((entry) => entry.part),
    },
    "regulation",
    4,
  );

  // Plan §10 architecture category (10 pts)
  const design = projectGraph?.selected_design || {};
  const targetStoreys = Number(projectGraph?.brief?.target_storeys || 1);
  const designHasLevels = Array.isArray(design.levels)
    ? design.levels.length >= targetStoreys
    : false;
  addCheck(
    checks,
    "DESIGN_HAS_LEVELS_MATCHING_TARGET",
    designHasLevels,
    { levelCount: design.levels?.length || 0, targetStoreys },
    "architecture",
    3,
  );
  const designHasElements = Array.isArray(design.elements)
    ? design.elements.length > 0
    : false;
  addCheck(
    checks,
    "DESIGN_HAS_BUILDING_ELEMENTS",
    designHasElements,
    { elementCount: design.elements?.length || 0 },
    "architecture",
    3,
  );
  const designHasOpenings = Array.isArray(design.openings)
    ? design.openings.length > 0
    : false;
  addCheck(
    checks,
    "DESIGN_HAS_OPENINGS",
    designHasOpenings,
    { openingCount: design.openings?.length || 0 },
    "architecture",
    4,
  );
  const compiledWallsById = new Map(
    (artifacts.compiledProject?.walls || []).map((wall) => [wall.id, wall]),
  );
  const exteriorWindowOrientations = [
    ...new Set(
      (artifacts.compiledProject?.openings || [])
        .filter((opening) => opening.type === "window")
        .map((opening) =>
          compiledWallsById.get(opening.wall_id || opening.wallId),
        )
        .filter((wall) => wall?.exterior === true)
        .map((wall) => wall.orientation || wall.metadata?.side)
        .filter(Boolean),
    ),
  ];
  const elevationOpeningsOk =
    exteriorWindowOrientations.length >=
    Math.min(2, Math.max(1, targetStoreys));
  addCheck(
    checks,
    "ELEVATION_OPENINGS_DISTRIBUTED",
    elevationOpeningsOk,
    { exteriorWindowOrientations },
    "architecture",
    0,
  );
  if (!elevationOpeningsOk) {
    issues.push(
      buildIssue(
        "ELEVATION_OPENINGS_INCONSISTENT",
        "error",
        "Exterior window openings are not distributed across enough elevations for a credible drawing set.",
        { exteriorWindowOrientations },
      ),
    );
  }

  // Plan §3.2 constraint-priority audit. Conflicts surface as warnings on the
  // QA report so the user sees what the engine over-rode, with rationale.
  const constraintConflicts = detectConflicts({
    brief: projectGraph?.brief,
    site: projectGraph?.site,
    climate: projectGraph?.climate,
    programme: projectGraph?.programme,
    regulations: projectGraph?.regulations,
    localStyle: projectGraph?.local_style,
  });
  for (const conflict of constraintConflicts) {
    issues.push({
      code: `CONSTRAINT_PRIORITY_${conflict.conflict_id
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")}`,
      severity: conflict.severity,
      message: conflict.summary,
      details: conflict,
    });
  }
  const constraintErrors = constraintConflicts.filter(
    (c) => c.severity === "error",
  ).length;
  addCheck(
    checks,
    "CONSTRAINT_PRIORITY_RESPECTED",
    constraintErrors === 0,
    {
      conflictCount: constraintConflicts.length,
      errorConflictCount: constraintErrors,
      conflictIds: constraintConflicts.map((c) => c.conflict_id),
    },
    "architecture",
    0, // architecture category already has 10 pts allocated; this is informational
  );

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const score = Math.max(0, 100 - errorCount * 18 - warningCount * 6);
  const { breakdown: categoryScores, totalScore } =
    computeCategoryScores(checks);

  return {
    schema_version: "project-graph-qa-report-v1",
    status: errorCount > 0 ? "fail" : "pass",
    score,
    totalScore,
    categoryScores,
    source_model_hash: geometryHash,
    referenceMatch,
    briefInputHash,
    panelRenderabilityRecords,
    checks,
    issues,
    constraint_conflicts: constraintConflicts,
    disclaimer: PROFESSIONAL_REVIEW_DISCLAIMER,
  };
}

function buildProjectGraph({
  brief,
  site,
  climate,
  regulations,
  localStyle,
  programme,
  projectGeometry,
  selectedDesign,
  drawingSet,
  model3dSet,
  sheetSet,
  compiledProject,
  modelRegistry,
  projectGraphId,
}) {
  const projectId =
    projectGraphId || createStableId("project-graph", brief.project_name);
  const modelVersionId = `model-${compiledProject.geometryHash.slice(0, 12)}`;
  const scoredOptions = Array.isArray(projectGeometry?.metadata?.design_options)
    ? projectGeometry.metadata.design_options.map((opt) => ({
        ...opt,
        source_model_hash: opt.selected ? compiledProject.geometryHash : null,
      }))
    : [
        {
          option_id: "option-001",
          label: "Deterministic vertical-slice option",
          selected: true,
          source_model_hash: compiledProject.geometryHash,
        },
      ];
  const graph = {
    schema_version: PROJECT_GRAPH_SCHEMA_VERSION,
    project_id: projectId,
    model_version_id: modelVersionId,
    created_at: null,
    updated_at: null,
    riba_stage_target: "2",
    jurisdiction: regulations?.jurisdiction || "england",
    brief,
    user_intent: brief.user_intent,
    project_type_support: brief.project_type_support || null,
    site,
    climate,
    regulations,
    local_style: localStyle,
    programme,
    design_options: scoredOptions,
    selected_design: {
      ...selectedDesign,
      source_model_hash: compiledProject.geometryHash,
      compiled_project_schema_version: compiledProject.schema_version,
    },
    drawings: drawingSet,
    models3d: model3dSet,
    sheets: sheetSet,
    qa: null,
    provenance: [
      {
        record_id: createStableId("prov", projectId, "brief"),
        source: "user_brief",
        generated_by: "normalizeBrief",
      },
      {
        record_id: createStableId("prov", projectId, "geometry"),
        source: "ProjectGraph",
        generated_by: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
        geometryHash: compiledProject.geometryHash,
      },
      {
        record_id: createStableId("prov", projectId, "models"),
        source: "env_model_registry",
        generated_by: "modelStepResolver",
        modelRegistry,
      },
    ],
  };

  return {
    ...graph,
    project_graph_hash: computeCDSHashSync({
      ...graph,
      qa: undefined,
    }),
  };
}

export async function buildArchitectureProjectVerticalSlice(input = {}) {
  // Diagnostics: per-step timing logs so the next 504/timeout reveals which
  // step is consuming the budget. Output goes to stdout (Vercel captures it
  // as Function Logs). Format is greppable: `[VS_TIMING] step=<name> ms=<n> total_ms=<n>`.
  const __vsRunStart = Date.now();
  const __vsLog = (step, prevMs, extra = "") => {
    const now = Date.now();
    const deltaMs = now - prevMs;
    const totalMs = now - __vsRunStart;
    const tail = extra ? ` ${extra}` : "";
    // eslint-disable-next-line no-console
    console.log(
      `[VS_TIMING] step=${step} ms=${deltaMs} total_ms=${totalMs}${tail}`,
    );
    return now;
  };
  let __vsMark = __vsRunStart;
  const brief = normalizeBrief(input);
  __vsMark = __vsLog("normalize_brief", __vsMark);
  // Programme preflight gate. Mirrors the UI-layer gate in
  // ArchitectAIWizardContainer so API-submitted requests cannot bypass
  // validation. A failure short-circuits with success:false; the route
  // handler in api/project/generate-vertical-slice.js maps that to 422.
  const incomingProgrammeSpaces =
    input.programSpaces || input.programmeSpaces || [];
  if (
    Array.isArray(incomingProgrammeSpaces) &&
    incomingProgrammeSpaces.length > 0
  ) {
    const preflight = runProgramPreflight({
      projectDetails: {
        ...(input.projectDetails || {}),
        floorCount: brief.target_storeys,
        area: input.projectDetails?.area ?? brief.target_gia_m2,
        category: input.projectDetails?.category,
        subType: input.projectDetails?.subType,
      },
      programSpaces: incomingProgrammeSpaces,
    });
    if (!preflight.ok) {
      return {
        success: false,
        error: `Programme preflight failed: ${preflight.errors.join(" ")}`,
        code: "preflight_failed",
        preflight: {
          errors: preflight.errors,
          warnings: preflight.warnings,
          floorCount: preflight.floorCount,
          totalArea: preflight.totalArea,
        },
      };
    }
  }
  const siteBoundarySanity = resolveSiteBoundarySanity(input, brief);
  const deterministicSite = buildSiteContext({
    brief,
    sitePolygon: siteBoundarySanity.boundaryAuthoritative
      ? input.sitePolygon || input.site_boundary || []
      : [],
    siteMetrics: siteBoundarySanity.siteMetrics,
    siteBoundarySanity,
    mainEntry: normalizeMainEntryForProjectGraph(
      input,
      siteBoundarySanity.boundaryAuthoritative
        ? input.sitePolygon || input.site_boundary || []
        : siteBoundarySanity.estimatedGeoBoundary || [],
    ),
  });
  // Plan §6.2 / §14 + Phase 1 amendment #2: every slice run goes through
  // enrichSiteContext so the resulting `site` always carries the providers
  // manifest. The aggregator handles the offline / browser-guard / bad-coords
  // branches internally and stamps the appropriate data_quality codes.
  const site = await enrichSiteContext(
    deterministicSite,
    input.contextProviders || {},
  );
  __vsMark = __vsLog("site_context", __vsMark);
  const siteMapSnapshot = await resolveSiteMapSnapshot({ input, brief, site });
  __vsMark = __vsLog("site_map_snapshot", __vsMark);
  const climate = buildClimatePack(brief, site);
  const regulationsMetadata = buildRegulationPack(brief);
  const localStyle = buildLocalStylePack(brief, site, climate);
  const draftProgramme = buildProgramme({
    brief,
    programSpaces: input.programSpaces || input.programmeSpaces || [],
  });
  const projectGeometry = buildProjectGeometryFromProgramme({
    brief,
    site,
    programme: draftProgramme,
    localStyle,
    climate,
  });
  const programme = syncProgrammeActuals(draftProgramme, projectGeometry);
  __vsMark = __vsLog("programme_and_geometry", __vsMark);
  // Programme-level QA. Catches both empty levels and the forensic
  // "every space collapsed to Ground" regression. Errors halt generation
  // with a structured response so the API surfaces a 422 instead of
  // producing a misleading single-floor sheet.
  {
    const programmeIssues = validateProgrammeLevels(
      programme,
      brief.target_storeys,
    );
    const collapseIssue = detectProgrammeGroundCollapse({
      inputProgramSpaces: incomingProgrammeSpaces,
      programme,
      targetStoreys: brief.target_storeys,
    });
    const allIssues = collapseIssue
      ? [collapseIssue, ...programmeIssues]
      : programmeIssues;
    const fatalProgrammeIssues = allIssues.filter(
      (issue) => issue.severity === "error",
    );
    if (fatalProgrammeIssues.length > 0) {
      return {
        success: false,
        error: fatalProgrammeIssues.map((issue) => issue.message).join(" "),
        code: fatalProgrammeIssues[0].code,
        qa: {
          programmeIssues: allIssues,
          targetStoreys: brief.target_storeys,
        },
      };
    }
  }
  // Apply rule engines now that geometry exists; produces concrete pass/fail
  // RegulationCheckResults rather than blanket manual_review placeholders.
  const regulations = applyRegulationRules(regulationsMetadata, {
    brief,
    climate,
    programme,
    projectGeometry,
  });
  const compiledProject = compileProject({
    projectGeometry,
    masterDNA: {
      projectName: brief.project_name,
      projectID: projectGeometry.project_id,
      styleDNA: projectGeometry.metadata.style_dna,
      rooms: programme.spaces,
    },
    locationData: {
      address: brief.site_input.address,
      coordinates: { lat: site.lat, lng: site.lon },
      climate: { type: climate.weather_source },
      localMaterials: localStyle.material_palette,
    },
  });
  __vsMark = __vsLog("compile_project", __vsMark);
  // Compiled-project QA. Catches geometry layers losing a level (e.g. the
  // 3-level brief silently producing a 2-level model). The level-count
  // mismatch is fatal; missing rooms on a level are a warning attached
  // to the response for downstream visibility.
  const compiledProjectIssues = validateCompiledProjectLevels(
    compiledProject,
    brief.target_storeys,
  );
  const fatalCompiledIssues = compiledProjectIssues.filter(
    (issue) => issue.severity === "error",
  );
  if (fatalCompiledIssues.length > 0) {
    return {
      success: false,
      error: fatalCompiledIssues.map((issue) => issue.message).join(" "),
      code: fatalCompiledIssues[0].code,
      qa: {
        compiledProjectIssues,
        targetStoreys: brief.target_storeys,
      },
    };
  }
  const selectedDesign = buildSelectedDesign(compiledProject, programme);
  // Resolve the active sheet template for this brief (presentation-v3 for
  // residential, board-v2 otherwise) BEFORE the technical pack runs so floor
  // plans and sections render at the slot aspect of the layout that will
  // ultimately receive them. Sheet-split overrides on individual sheetPlan
  // entries continue to apply downstream in buildA1Sheet.
  const drawingSetLayoutTemplate = resolvePresentationLayoutTemplate(brief);
  const { drawingSet, drawingArtifacts, technicalBuild } = buildDrawingSet(
    compiledProject,
    { layoutTemplate: drawingSetLayoutTemplate },
  );
  __vsMark = __vsLog(
    "build_drawing_set",
    __vsMark,
    `panel_count=${Object.keys(drawingArtifacts || {}).length}`,
  );
  const scene3d = build3DProjection(compiledProject);
  __vsMark = __vsLog("build_3d_projection", __vsMark);
  const modelRegistry = resolveArchitectureModelRegistry({
    steps: [
      "BRIEF",
      "SITE",
      "CLIMATE",
      "REGS",
      "PROGRAMME",
      "PROJECT_GRAPH",
      "DRAWING_2D",
      "MODEL_3D",
      "A1_SHEET",
      "QA",
    ],
  });
  const modelProvenance = Object.values(modelRegistry).map((entry) => ({
    stepId: entry.stepId || entry.step,
    model: entry.model,
    provider: entry.provider,
    modelSource: entry.modelSource,
    apiKeyEnv: entry.apiKeyEnv,
    fallbackUsed: entry.fallbackUsed === true,
    fineTunedModelUsed: entry.fineTunedModelUsed || null,
  }));
  const modelRoutes = Object.values(modelRegistry).map((entry) => ({
    stepId: entry.stepId || entry.step,
    task: entry.label,
    provider: entry.provider,
    model: entry.model,
    apiKeyEnv: entry.apiKeyEnv,
    modelSource: entry.modelSource,
    selectedEnvKey: entry.selectedEnvKey || null,
    fallbackUsed: entry.fallbackUsed === true,
    fineTunedModelUsed: entry.fineTunedModelUsed || null,
    deterministicGeometry: entry.deterministicGeometry === true,
  }));
  const projectGraphId = createStableId(
    "project-graph",
    brief.project_name,
    compiledProject.geometryHash,
  );
  const drawingSetWithGraph = {
    ...drawingSet,
    drawings: drawingSet.drawings.map((drawing) => ({
      ...drawing,
      source_project_graph_id: projectGraphId,
    })),
  };
  const model3dSet = build3DModelSet({
    projectGraphId,
    scene3d,
    geometryHash: compiledProject.geometryHash,
  });
  // Plan §6.11: split into A1-01/02/03 when programme/storey/regulation
  // density exceeds the legibility threshold; otherwise emit a single sheet.
  const splitDecision = decideSheetSplit({ brief, programme, regulations });
  // Phase 4 reasoning chain inputs: condense the programme into a per-level
  // summary so render prompts can reference room counts + level areas.
  const programmeSummary = buildProgrammeSummaryForRender(brief, programme);
  const region =
    site?.region ||
    site?.locationProfile?.region ||
    site?.country ||
    input?.locationData?.region ||
    brief?.site_input?.region ||
    null;
  // Phase D: build the visual identity manifest once per generation. Same
  // building → same manifestHash on every visual panel → no cross-panel
  // drift even when OpenAI image generation is enabled. The manifest is
  // also produced when the gate is off so deterministic-fallback panels
  // carry the lock too.
  const styleDNAForManifest =
    localStyle?.styleDNA || localStyle?.style_dna || null;
  const visualManifest = buildVisualManifest({
    compiledProject,
    projectGraph: { projectGraphId, id: projectGraphId, site },
    brief,
    masterDNA: input?.masterDNA || null,
    siteSnapshot: siteMapSnapshot,
    climate,
    localStyle,
    styleDNA: styleDNAForManifest,
    materialPalette: localStyle?.material_palette || null,
  });
  __vsMark = __vsLog("visual_manifest", __vsMark);
  // Phase 1 — SheetDesignContext foundation. One frozen contract object
  // built once per generation. Wraps (does not replace) visualManifest and
  // adds material/style/climate/portfolio/programme surfaces so future panel
  // renderers can consume one source of truth. Phase 1 is wiring-only; no
  // render output changes. The validator below is warn-only — existing
  // callers that ignore the context keep working unchanged.
  const sheetDesignContext = buildSheetDesignContext({
    masterDNA: input?.masterDNA || null,
    brief,
    compiledProject,
    climate,
    localStyle,
    styleDNA: styleDNAForManifest,
    regulations,
    programmeSummary,
    region,
    projectGraphId,
    visualManifest,
  });
  const sheetDesignContextReport = assertSheetDesignContext(sheetDesignContext);
  __vsMark = __vsLog(
    "sheet_design_context",
    __vsMark,
    `hash=${sheetDesignContext.contextHash} ok=${sheetDesignContextReport.ok} gaps=${sheetDesignContextReport.gaps.length}`,
  );
  const renderedSheets = [];
  for (const sheetPlan of splitDecision.sheets) {
    const sheetIndex = renderedSheets.length;
    const sheetTag = `sheet_${sheetIndex}`;
    const sheetStart = Date.now();
    const sheetResult = await buildA1Sheet({
      projectGraphId,
      brief,
      drawingSet: drawingSetWithGraph,
      drawingArtifacts,
      site,
      climate,
      regulations,
      localStyle,
      styleDNA: localStyle?.styleDNA || localStyle?.style_dna || null,
      programmeSummary,
      region,
      scene3d,
      compiledProject,
      geometryHash: compiledProject.geometryHash,
      siteSnapshot: siteMapSnapshot,
      sheetPlan,
      visualManifest,
      sheetDesignContext,
    });
    __vsMark = __vsLog(`build_a1_sheet[${sheetTag}]`, __vsMark);
    const pdfStart = Date.now();
    const pdf = await buildA1PdfArtifact({
      projectGraphId,
      brief,
      geometryHash: compiledProject.geometryHash,
      sheetArtifact: sheetResult.sheetArtifact,
      renderIntent: "final_a1",
    });
    __vsMark = __vsLog(`build_a1_pdf[${sheetTag}]`, pdfStart);
    __vsLog(`sheet_total[${sheetTag}]`, sheetStart);
    sheetResult.sheetArtifact.renderProof = pdf.renderedProof;
    sheetResult.sheetArtifact.metadata = {
      ...(sheetResult.sheetArtifact.metadata || {}),
      renderProof: pdf.renderedProof,
      textRenderStatus: pdf.renderedProof?.textRenderStatus,
      sheetDesignContextHash: sheetDesignContext.contextHash,
      sheetDesignContextVersion: SHEET_DESIGN_CONTEXT_VERSION,
    };
    renderedSheets.push({
      sheetPlan,
      sheet: sheetResult.sheetSet.sheets[0],
      sheetArtifact: sheetResult.sheetArtifact,
      sheetPanelArtifacts: sheetResult.sheetPanelArtifacts,
      panelArtifacts: sheetResult.panelArtifacts,
      pdf,
    });
  }
  // The first rendered sheet is the primary export; the rest are companion
  // sheets surfaced in sheets[].sheets and artifacts.companionSheets/Pdfs.
  const primary = renderedSheets[0];
  const sheetArtifact = primary.sheetArtifact;
  const pdfArtifact = primary.pdf;
  const primaryPanelArtifacts = primary.sheetPanelArtifacts || {};
  const siteMapArtifact =
    Object.values(primaryPanelArtifacts).find(
      (artifact) => artifact.panel_type === "site_context",
    ) || null;
  const visuals3d = Object.fromEntries(
    Object.values(primaryPanelArtifacts)
      .filter((artifact) =>
        REQUIRED_3D_A1_PANEL_TYPES.includes(artifact.panel_type),
      )
      .map((artifact) => [artifact.panel_type, artifact]),
  );
  // Phase 5B: post-render visual identity validation. Reports only — does
  // NOT block the export gate by default. Strict mode (opt-in via
  // PROJECT_GRAPH_VISUAL_IDENTITY_STRICT=true) promotes warnings to error
  // severity so a downstream gate can choose to demote, but this
  // validator never throws and never decides for the gate. The report is
  // stamped onto sheetArtifact.metadata.visualIdentityValidation and
  // surfaced at artifacts.visualIdentityValidation for QA / API consumers.
  const visualIdentityStrictMode =
    String(
      (typeof process !== "undefined" &&
        process.env?.PROJECT_GRAPH_VISUAL_IDENTITY_STRICT) ||
        "",
    )
      .toLowerCase()
      .trim() === "true";
  let visualIdentityValidation;
  try {
    visualIdentityValidation = evaluateVisualIdentity({
      visualManifest,
      sheetDesignContext,
      sheetDesignContextHash: sheetDesignContext?.contextHash || null,
      panelArtifacts: visuals3d,
      sheetMetadata: sheetArtifact?.metadata || null,
      options: { strictMode: visualIdentityStrictMode },
    });
  } catch (validationError) {
    visualIdentityValidation = {
      version: VISUAL_MANIFEST_VALIDATOR_VERSION,
      status: "warning",
      severity: "warning",
      strictMode: visualIdentityStrictMode,
      summary: { totalPanels: 4, error: true },
      warnings: [
        `Visual identity validator threw: ${validationError?.message || "unknown"}.`,
      ],
      panels: {},
      sheetChecks: {},
      sheetWarnings: [],
    };
  }
  sheetArtifact.metadata = {
    ...(sheetArtifact.metadata || {}),
    visualIdentityValidation,
  };
  __vsMark = __vsLog(
    "visual_identity_validation",
    __vsMark,
    `status=${visualIdentityValidation.status} warnings=${visualIdentityValidation.summary?.totalWarnings ?? 0}`,
  );
  const openaiReasoningExecution =
    input.openaiReasoningExecution ||
    input.providerExecution?.openaiReasoning ||
    input.contextProviders?.openaiReasoning ||
    {};
  const providerCalls = await executeProjectGraphReasoningSteps({
    modelRoutes,
    context: {
      brief,
      site,
      climate,
      regulations,
      programme,
      compiledProject,
      projectGraphId,
      geometryHash: compiledProject.geometryHash,
      programmeSummary,
      splitDecision,
      primarySheet: sheetArtifact,
      pdfArtifact,
      technicalBuild,
      visualFidelityStatus: sheetArtifact.visualFidelityStatus,
    },
    execution: openaiReasoningExecution,
  });
  __vsMark = __vsLog("openai_reasoning_steps", __vsMark);
  const imageProviderCalls = buildImageProviderCalls(visuals3d);
  const allProviderCalls = [...providerCalls, ...imageProviderCalls];
  const openaiQaMetadata = buildOpenAIQaMetadata({
    providerCalls: allProviderCalls,
    visuals3d,
  });
  logProjectGraphProviderTrace(allProviderCalls);
  sheetArtifact.openaiConfigured = openaiQaMetadata.openaiConfigured;
  sheetArtifact.openaiReasoningUsed = openaiQaMetadata.openaiReasoningUsed;
  sheetArtifact.openaiImageUsed = openaiQaMetadata.openaiImageUsed;
  sheetArtifact.openaiImageFallbackReason =
    openaiQaMetadata.openaiImageFallbackReason;
  sheetArtifact.openaiModelsUsed = openaiQaMetadata.openaiModelsUsed;
  sheetArtifact.openaiRequestIds = openaiQaMetadata.openaiRequestIds;
  sheetArtifact.openaiUsage = openaiQaMetadata.openaiUsage;
  sheetArtifact.metadata = {
    ...(sheetArtifact.metadata || {}),
    ...openaiQaMetadata,
  };

  // -----------------------------------------------------------------------
  // Phase F: upstream-partial export gate.
  //
  // The compose route runs the authoritative gate (scope=compose_final) once
  // the PDF and post-compose verification are available. Here we run a
  // partial gate at the slice service so the sheet artifact carries an
  // upstream view of panel/manifest/material/openai evidence before any
  // PDF-side checks. PDF/raster/post-compose evidence is intentionally
  // absent at this scope.
  // -----------------------------------------------------------------------
  try {
    const targetStoreysForGate = Math.max(
      1,
      Number(brief?.target_storeys || 1),
    );
    const phaseFRequiredPanels = buildRequiredA1PanelTypes(
      targetStoreysForGate,
      sheetArtifact.layoutTemplate || resolvePresentationLayoutTemplate(brief),
    );
    const visualPanelArtifacts = Object.values(primaryPanelArtifacts).filter(
      (artifact) =>
        REQUIRED_3D_A1_PANEL_TYPES.includes(artifact?.panel_type) ||
        artifact?.metadata?.visualManifestHash,
    );
    const visualPanelsForGate = visualPanelArtifacts.map((artifact) => ({
      type: artifact.panel_type,
      visualManifestHash:
        artifact.metadata?.visualManifestHash ||
        artifact.visualManifestHash ||
        null,
      visualIdentityLocked:
        artifact.metadata?.visualIdentityLocked === true ||
        artifact.visualIdentityLocked === true,
    }));
    const materialPaletteArtifact = Object.values(primaryPanelArtifacts).find(
      (artifact) => artifact?.panel_type === "material_palette",
    );
    const materialPaletteForGate = materialPaletteArtifact
      ? {
          cards:
            materialPaletteArtifact.cardMetadata ||
            materialPaletteArtifact.metadata?.cardMetadata ||
            [],
        }
      : null;
    const panelsForGate = (sheetArtifact.panelPlacements || []).map(
      (placement) => ({
        type: placement.panelType,
        status: placement.status,
        hasSvg: placement.status === "ready",
      }),
    );
    const upstreamRenderContract = resolveA1RenderContract({
      renderIntent: "final_a1",
    });
    const upstreamGate = evaluateFinalA1ExportGate({
      renderContract: upstreamRenderContract,
      // PDF/raster/post-compose evidence is owned by the compose route.
      panels: panelsForGate,
      panelRegistry: phaseFRequiredPanels,
      targetStoreys: targetStoreysForGate,
      visualManifest,
      visualPanels: visualPanelsForGate,
      materialPalette: materialPaletteForGate,
      openaiProvider: openaiQaMetadata,
      strictPhotoreal:
        brief?.reference_match === true ||
        process.env.OPENAI_STRICT_IMAGE_GEN === "true",
      imageGenEnabled: process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED === "true",
      scope: "upstream_partial",
    });
    sheetArtifact.quality = {
      ...(sheetArtifact.quality || {}),
      exportGate: upstreamGate,
      referenceMatch: brief?.reference_match === true,
    };
  } catch (gateError) {
    // Never fail the slice on gate evaluation; surface the error in metadata.
    sheetArtifact.quality = {
      ...(sheetArtifact.quality || {}),
      exportGate: {
        version: "phase-f-a1-export-gate-v1",
        status: "warning",
        allowed: true,
        demotedToPreview: false,
        scope: "upstream_partial",
        blockers: [],
        warnings: [
          `Upstream export gate evaluation failed: ${gateError?.message || "unknown"}.`,
        ],
        error: gateError?.message || "unknown",
      },
    };
  }

  const geometrySteps = [
    {
      stepId: "PROJECT_GRAPH",
      authoritySource: "project_graph_compiled_geometry",
      geometryHash: compiledProject.geometryHash,
      status: "compiled",
    },
    {
      stepId: "DRAWING_2D",
      authoritySource: "project_graph_compiled_geometry",
      geometryHash: compiledProject.geometryHash,
      panelCount: Object.keys(drawingArtifacts || {}).length,
      contentBoundsMeasured: Object.values(drawingArtifacts || {}).every(
        (artifact) => Boolean(getTechnicalContentBounds(artifact)),
      ),
      status: technicalBuild.ok ? "ready" : "blocked",
    },
    {
      stepId: "MODEL_3D",
      authoritySource: "project_graph_compiled_geometry",
      geometryHash: compiledProject.geometryHash,
      panelTypes: Object.keys(visuals3d).sort(),
      primitiveCounts: Object.fromEntries(
        Object.entries(visuals3d).map(([panelType, artifact]) => [
          panelType,
          Number(
            artifact.metadata?.primitiveCount ||
              artifact.metadata?.surfaceCount ||
              0,
          ),
        ]),
      ),
      status: "ready",
    },
  ];
  const exportSteps = renderedSheets.map(
    ({ sheetPlan, sheetArtifact: renderedSheetArtifact, pdf }) => ({
      stepId: "A1_EXPORT",
      sheetNumber: sheetPlan.sheet_number,
      sheetLabel: sheetPlan.label,
      svgHash: renderedSheetArtifact.svgHash || null,
      renderedPngHash: pdf.renderedPngHash || null,
      pdfHash: pdf.pdfHash || null,
      requiredPanelSummary: pdf.renderedProof?.panelSummary || [],
      status: pdf.renderedProof?.passed === true ? "ready" : "blocked",
    }),
  );
  const panelMap = buildResultPanelMap(primary.panelArtifacts || {});
  const sheetSetWithPdf = {
    sheets: renderedSheets.map(({ sheet, pdf: rendered }) => ({
      ...sheet,
      asset_ids: [...new Set([...(sheet.asset_ids || []), rendered.asset_id])],
      exported_pdf_asset_id: rendered.asset_id,
    })),
    split_decision: splitDecision,
  };
  const initialGraph = buildProjectGraph({
    brief,
    site,
    climate,
    regulations,
    localStyle,
    programme,
    projectGeometry,
    selectedDesign,
    drawingSet: drawingSetWithGraph,
    model3dSet,
    sheetSet: sheetSetWithPdf,
    compiledProject,
    modelRegistry,
    projectGraphId,
  });
  const graphWithStableId = {
    ...initialGraph,
    project_id: projectGraphId,
  };
  const artifacts = {
    drawings: drawingArtifacts,
    panelArtifacts: primary.panelArtifacts || {},
    panelMap,
    scene3d,
    a1Sheet: sheetArtifact,
    a1Pdf: pdfArtifact,
    siteMap: siteMapArtifact,
    visuals3d,
    renderedProof: pdfArtifact.renderedProof,
    textRenderStatus: pdfArtifact.renderedProof?.textRenderStatus,
    presentationMode: sheetArtifact.presentationMode,
    visualFidelityStatus: sheetArtifact.visualFidelityStatus,
    referenceMatch: brief?.reference_match === true,
    briefInputHash: brief?.brief_input_hash || null,
    openai: openaiQaMetadata,
    openaiConfigured: openaiQaMetadata.openaiConfigured,
    openaiReasoningUsed: openaiQaMetadata.openaiReasoningUsed,
    openaiImageUsed: openaiQaMetadata.openaiImageUsed,
    openaiImageFallbackReason: openaiQaMetadata.openaiImageFallbackReason,
    openaiModelsUsed: openaiQaMetadata.openaiModelsUsed,
    openaiRequestIds: openaiQaMetadata.openaiRequestIds,
    openaiUsage: openaiQaMetadata.openaiUsage,
    compiledProject,
    projectGeometry,
    sheetSeries: renderedSheets.map(
      ({ sheetPlan, sheetArtifact: sa, pdf }) => ({
        sheet_number: sheetPlan.sheet_number,
        sheet_label: sheetPlan.label,
        panel_types: [...sheetPlan.panel_types],
        sheet_artifact_id: sa.asset_id,
        pdf_asset_id: pdf.asset_id,
        pdf_data_url: pdf.dataUrl,
      }),
    ),
    sheetSplitDecision: splitDecision,
    // Phase D: surface the visual identity manifest at the top level so QA,
    // tests, and downstream consumers can prove every visual panel was
    // pinned to the same building. Each panel artifact also carries
    // metadata.visualManifestId / Hash / visualIdentityLocked.
    visualManifest,
    visualManifestHash: visualManifest.manifestHash,
    // Phase 1 — SheetDesignContext foundation. Frozen contract object that
    // wraps visualManifest with material/style/climate/portfolio/programme.
    // Surfaced here so downstream tests/consumers can prove every panel
    // was driven by the same design context. No render output changes.
    sheetDesignContext,
    sheetDesignContextHash: sheetDesignContext.contextHash,
    sheetDesignContextReport,
    // Phase 5B — post-render visual identity validation report. Warning-
    // only by default; opt-in strict mode lets a downstream export gate
    // demote on visual-identity drift. The validator reads what panel
    // artifacts already stamp (visualManifestHash / Id / locked) plus the
    // sheet-level sheetDesignContextHash and emits a structured per-panel
    // report. See src/services/render/visualManifestValidator.js.
    visualIdentityValidation,
    technicalBuild: {
      ok: technicalBuild.ok,
      technicalPanelTypes: technicalBuild.technicalPanelTypes,
      failures: technicalBuild.failures,
    },
    executionTrace: {
      source: "modelStepResolver",
      pipelineMode: "project_graph",
      modelProvenance,
      modelRoutes,
      providerCalls: allProviderCalls,
      providerFallbacks: openaiQaMetadata.providerFallbacks,
      geometrySteps,
      exportSteps,
    },
  };
  __vsMark = __vsLog("artifacts_assembled", __vsMark);
  let qa = validateProjectGraphVerticalSlice({
    projectGraph: graphWithStableId,
    artifacts,
  });
  qa = applyOpenAIReasoningBlockersToQa(
    qa,
    getBlockedOpenAIReasoningCalls(providerCalls),
  );
  qa.openai = openaiQaMetadata;
  __vsMark = __vsLog("validate_qa", __vsMark, `qa_status=${qa.status}`);

  // Phase 5: structured reasoning chain — Brief → Site → Climate → Style →
  // Programme — exposed as both a structured object (for QA / API consumers)
  // and a single human-readable text block (used to populate the A1 sheet's
  // schedules_notes / Key Notes panel and surfaced in the response so the
  // user can read why a render looks the way it does).
  const reasoningChainText = buildReasoningChainBlock({
    locationData: { climate, region },
    masterDNA: {
      localStyle,
      styleDNA: localStyle?.styleDNA || localStyle?.style_dna || null,
    },
    projectContext: {
      programmeSummary,
      targetStoreys: brief?.target_storeys,
    },
  });
  const reasoningChainStructured = {
    asset_type: "reasoning_chain_json",
    version: "project-graph-reasoning-chain-v1",
    source_model_hash: compiledProject.geometryHash,
    brief: {
      project_name: brief?.project_name || null,
      building_type: brief?.building_type || null,
      original_category: brief?.original_category || null,
      original_subtype: brief?.original_subtype || null,
      canonical_building_type: brief?.canonical_building_type || null,
      support_status: brief?.support_status || null,
      programme_template_key: brief?.programme_template_key || null,
      project_type_route: brief?.project_type_route || null,
      target_gia_m2: brief?.target_gia_m2 || null,
      target_storeys: brief?.target_storeys || null,
      floorCountLocked:
        brief?.floorCountLocked ?? brief?.floor_count_locked ?? null,
    },
    site: {
      postcode: brief?.site_input?.postcode || site?.postcode || null,
      coords: {
        lat: brief?.site_input?.lat ?? site?.lat ?? null,
        lon: brief?.site_input?.lon ?? site?.lon ?? null,
      },
      region,
    },
    climate: climate
      ? {
          zone: climate.zone || climate.koppen || null,
          rainfall_mm:
            climate.rainfall_mm ||
            climate.annual_rainfall_mm ||
            climate.precipitation_mm ||
            null,
          sun_path: climate.sun_path || climate.sunPath || null,
          wind: climate.wind || null,
          design_recommendations:
            climate.design_recommendations || climate.recommendations || null,
        }
      : null,
    style: {
      regional_vernacular:
        localStyle?.region || localStyle?.region_label || null,
      facade_language:
        localStyle?.styleDNA?.facade_language ||
        localStyle?.facade_language ||
        null,
      roof_language:
        localStyle?.styleDNA?.roof_language ||
        localStyle?.roof_language ||
        null,
      window_language:
        localStyle?.styleDNA?.window_language ||
        localStyle?.window_language ||
        null,
      massing_language:
        localStyle?.styleDNA?.massing_language ||
        localStyle?.massing_language ||
        null,
      materials_local:
        localStyle?.materials_local || localStyle?.local_materials || null,
    },
    programme: programmeSummary,
    text: reasoningChainText,
  };

  const finalGraph = {
    ...graphWithStableId,
    qa,
  };
  finalGraph.project_graph_hash = computeCDSHashSync(finalGraph);
  __vsLog("vertical_slice_done", __vsRunStart, `qa_status=${qa.status}`);

  // Phase 1 amendment #9: provenance manifest. Surfaces the list of factual
  // data providers used for the site (Phase 1) and climate (Phase 3 placeholder),
  // a consolidated data_quality view, and a statically-derived assertion that
  // OpenAI / LLMs are not used as factual providers (amendment #1).
  const siteDataProviders = Array.isArray(site.providers) ? site.providers : [];
  const climateDataProviders = Array.isArray(climate?.providers)
    ? climate.providers
    : [];
  const consolidatedDataQuality = [
    ...(site.data_quality || []),
    ...(climate?.data_quality || []),
  ];
  const allProviderNames = [
    ...siteDataProviders.map((p) => String(p?.name || "")),
    ...climateDataProviders.map((p) => String(p?.name || "")),
  ];
  const openaiAsFactualProvider = allProviderNames.some((name) =>
    /openai|gpt|chatgpt/i.test(name),
  );
  const provenanceManifest = {
    schema_version: "provenance-manifest-v1",
    siteDataProviders,
    climateDataProviders,
    dataQuality: consolidatedDataQuality,
    factualProviderAssertion: {
      openaiAsFactualProvider,
      factualFieldsList: [
        "site.heritage_flags",
        "site.flood_risk",
        "site.neighbouring_buildings",
        "site.context_height_stats",
        "climate.weather_source",
        "climate.wind",
        "climate.rainfall",
      ],
      assertion_message:
        "OpenAI / LLM models are not used as factual providers for site, boundary, planning, flood, footprint, weather, climate, or UKCP18 data. Interpretation only.",
    },
  };

  return {
    success: qa.status === "pass",
    pipelineVersion: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
    geometryHash: compiledProject.geometryHash,
    projectTypeSupport: brief.project_type_support || null,
    projectGraph: finalGraph,
    provenanceManifest,
    artifacts: {
      ...artifacts,
      qaReport: {
        asset_id: createStableId(
          "asset-qa",
          finalGraph.project_id,
          qa.source_model_hash,
        ),
        asset_type: "qa_report_json",
        source_model_hash: qa.source_model_hash,
        qa,
      },
      reasoningChain: {
        asset_id: createStableId(
          "asset-reasoning-chain",
          finalGraph.project_id,
          compiledProject.geometryHash,
        ),
        ...reasoningChainStructured,
      },
    },
    qa,
    modelRegistry,
    modelProvenance,
  };
}

/**
 * Self-correcting wrapper. Plan §6.13: up to 3 repair passes for non-hard
 * failures. Hard blockers fail closed with no auto-repair.
 */
export async function buildArchitectureProjectVerticalSliceWithRepair(
  input = {},
  { maxAttempts = 3 } = {},
) {
  return runWithRepair(buildArchitectureProjectVerticalSlice, input, {
    maxAttempts,
  });
}

export const __projectGraphVerticalSliceInternals = Object.freeze({
  normalizeBrief,
  buildProgramme,
  buildSiteContext,
  buildClimatePack,
  buildLocalStylePack,
  buildProjectGeometryFromProgramme,
  syncProgrammeActuals,
  compileProject,
});

export default {
  PROJECT_GRAPH_SCHEMA_VERSION,
  PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
  buildArchitectureProjectVerticalSlice,
  buildArchitectureProjectVerticalSliceWithRepair,
  validateProjectGraphVerticalSlice,
};
