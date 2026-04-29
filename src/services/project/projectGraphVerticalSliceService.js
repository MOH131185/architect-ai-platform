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
import { computeCDSHashSync } from "../validation/cdsHash.js";
import { rasteriseSheetArtifact } from "../render/svgRasteriser.js";
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
  detectA1GlyphIntegrity,
  detectA1RasterGlyphIntegrity,
} from "../a1/a1FinalExportContract.js";
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

function buildRequiredA1PanelTypes(targetStoreys = 1) {
  const dynamicFloorPlans = floorPlanPanelTypes(targetStoreys).filter(
    (type) => type !== "floor_plan_ground",
  );
  return [...REQUIRED_A1_PANEL_TYPES_BASE, ...dynamicFloorPlans];
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

function normalizeBuildingType(input = {}) {
  const raw = String(
    input.building_type ||
      input.buildingType ||
      input.category ||
      input.projectType ||
      input.program ||
      input.subType ||
      "dwelling",
  )
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (DWELLING_SYNONYMS.includes(raw)) {
    return "dwelling";
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
    building_type: brief.building_type || "building",
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
  const siteInput = sourceBrief.site_input || sourceBrief.siteInput || {};
  const coordinates =
    locationData.coordinates ||
    siteInput.coordinates ||
    (Number.isFinite(Number(siteInput.lat)) &&
    Number.isFinite(Number(siteInput.lon))
      ? { lat: Number(siteInput.lat), lng: Number(siteInput.lon) }
      : null);
  const buildingType = normalizeBuildingType({
    ...projectDetails,
    ...sourceBrief,
  });
  const targetGiaM2 = Math.max(
    40,
    Number(
      sourceBrief.target_gia_m2 ??
        sourceBrief.targetAreaM2 ??
        sourceBrief.area ??
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
        },
        {
          fallback: briefRequestedStoreys,
          maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
        },
      ).floorCount
    : briefRequestedStoreys;
  const targetStoreys = Math.max(
    1,
    Math.min(MAX_TARGET_STOREYS, requestedStoreys),
  );
  const projectName =
    sourceBrief.project_name ||
    sourceBrief.projectName ||
    projectDetails.projectName ||
    projectDetails.name ||
    "ArchiAI Project";

  return {
    project_name: projectName,
    building_type: buildingType,
    client_goals: toArray(
      sourceBrief.client_goals ||
        sourceBrief.clientGoals ||
        projectDetails.clientGoals ||
        projectDetails.customNotes ||
        [],
    ),
    site_input: {
      address:
        siteInput.address ||
        locationData.address ||
        projectDetails.address ||
        null,
      postcode: siteInput.postcode || locationData.postcode || null,
      lat: Number(coordinates?.lat ?? siteInput.lat ?? 51.5074),
      lon: Number(
        coordinates?.lng ?? coordinates?.lon ?? siteInput.lon ?? -0.1278,
      ),
      boundary_geojson: siteInput.boundary_geojson || null,
    },
    target_gia_m2: round(targetGiaM2, 2),
    target_storeys: targetStoreys,
    budget_band: sourceBrief.budget_band || "unknown",
    sustainability_ambition:
      sourceBrief.sustainability_ambition ||
      projectDetails.sustainabilityAmbition ||
      "low_energy",
    required_spaces_text:
      sourceBrief.required_spaces_text ||
      sourceBrief.requiredSpacesText ||
      projectDetails.requiredSpacesText ||
      "",
    constraints_text:
      sourceBrief.constraints_text ||
      sourceBrief.constraintsText ||
      projectDetails.constraintsText ||
      "",
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
      material_preferences: toArray(
        sourceBrief.material_preferences ||
          sourceBrief.user_intent?.material_preferences ||
          input.materialPreferences ||
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
      "Reception and breakout",
      "client arrival and informal meeting",
      "public",
      0.1,
      0,
      "medium",
    ],
    [
      "Open studio (ground)",
      "primary collaborative workspace",
      "semi_public",
      0.3,
      0,
      "high",
    ],
    [
      "Meeting room",
      "enclosed client meeting",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    ["WC and accessible WC", "inclusive WCs", "service", 0.05, 0, "low"],
    [
      "Tea point and store",
      "kitchenette and storage",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "stair, corridor and store",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Open studio (upper)",
      "additional desk space",
      "semi_public",
      0.2,
      upperLevel,
      "high",
    ],
    [
      "Workshop or model room",
      "physical making and prototyping",
      "private",
      0.08,
      upperLevel,
      "medium",
    ],
    [
      "Quiet focus room",
      "phone and focus booths",
      "private",
      0.05,
      upperLevel,
      "medium",
    ],
    [
      "Upper circulation and store",
      "landing and storage",
      "semi_public",
      0.04,
      upperLevel,
      "medium",
    ],
  ];
}

function educationStudioProgrammeTemplate(upperLevel) {
  return [
    [
      "Entrance and showcase",
      "public arrival and pupil work display",
      "public",
      0.1,
      0,
      "high",
    ],
    [
      "Workshop (messy)",
      "primary making space",
      "semi_public",
      0.22,
      0,
      "high",
    ],
    [
      "Workshop store and prep",
      "tool and material store",
      "service",
      0.07,
      0,
      "low",
    ],
    ["Accessible WC", "inclusive pupil WC", "service", 0.04, 0, "low"],
    [
      "Plant and cleaner store",
      "MEP plant and cleaner store",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "stair and corridor",
      "semi_public",
      0.07,
      0,
      "medium",
    ],
    [
      "Studio (clean)",
      "drawing and design studio",
      "semi_public",
      0.2,
      upperLevel,
      "high",
    ],
    [
      "Seminar room",
      "small group teaching",
      "semi_public",
      0.1,
      upperLevel,
      "medium",
    ],
    [
      "Quiet study",
      "focused individual work",
      "private",
      0.1,
      upperLevel,
      "high",
    ],
    [
      "Upper circulation",
      "landing and storage",
      "semi_public",
      0.06,
      upperLevel,
      "medium",
    ],
  ];
}

function getProgrammeTemplate(buildingType, upperLevel) {
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
          severity: "warning",
          message: `building_type "${fallbackFrom}" not in KNOWN_BUILDING_TYPES; using community template as deterministic fallback.`,
        }
      : {
          source: "matched_template",
          resolved_template: brief.building_type,
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

function buildSiteContext({ brief, sitePolygon = [], siteMetrics = {} } = {}) {
  const geoBoundary =
    Array.isArray(sitePolygon) && sitePolygon.length >= 3
      ? sitePolygon
      : polygonFromGeoJson(brief.site_input.boundary_geojson);
  const hasGeoBoundary =
    geoBoundary.length >= 3 &&
    Number.isFinite(Number(geoBoundary[0]?.lat)) &&
    Number.isFinite(Number(geoBoundary[0]?.lng));
  const origin = hasGeoBoundary
    ? computeGeoCentroid(geoBoundary)
    : { lat: brief.site_input.lat, lng: brief.site_input.lon };
  const localBoundary = hasGeoBoundary
    ? polygonToLocalXY(geoBoundary, origin).map((point) => ({
        x: roundMetric(point.x),
        y: roundMetric(point.y),
      }))
    : buildFallbackSitePolygon(Math.max(brief.target_gia_m2 * 2.2, 320));
  const boundaryBbox = buildBoundingBoxFromPolygon(localBoundary);
  const buildablePolygon = insetRectFromBbox(boundaryBbox, 2);
  const areaM2 =
    Number(siteMetrics.areaM2 || 0) ||
    computePolygonArea(localBoundary) ||
    Math.max(brief.target_gia_m2 * 2.2, 320);

  return {
    site_id: createStableId("site", brief.project_name, origin.lat, origin.lng),
    address_normalised: brief.site_input.address || null,
    lat: round(origin.lat, 6),
    lon: round(origin.lng ?? origin.lon, 6),
    boundary: brief.site_input.boundary_geojson || null,
    local_boundary_polygon: localBoundary,
    buildable_polygon: buildablePolygon,
    north_angle_degrees: Number(siteMetrics.orientationDeg || 0),
    area_m2: round(areaM2, 2),
    access_edges: [
      {
        edge_id: "street-edge-primary",
        label: "Assumed primary street edge",
        source: hasGeoBoundary ? "site_polygon" : "fallback",
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
    data_quality: [
      {
        code: hasGeoBoundary
          ? "SITE_BOUNDARY_PROVIDED"
          : "SITE_BOUNDARY_FALLBACK",
        severity: hasGeoBoundary ? "info" : "warning",
        message: hasGeoBoundary
          ? "Site boundary was supplied by the request."
          : "No authoritative site boundary was supplied; deterministic fallback boundary used.",
      },
    ],
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
    hasPolygon: Boolean(
      (Array.isArray(siteSnapshot.polygon) && siteSnapshot.polygon.length) ||
      (Array.isArray(siteSnapshot.sitePolygon) &&
        siteSnapshot.sitePolygon.length),
    ),
    sha256: siteSnapshot.sha256 || siteSnapshot.metadata?.sha256 || null,
    metadata: cloneData(siteSnapshot.metadata || {}),
  };
}

async function resolveSiteMapSnapshot({ input = {}, brief, site }) {
  const provided = normalizeProvidedSiteSnapshot(
    input.siteSnapshot || input.siteMapSnapshot || input.siteMap || null,
  );
  if (provided) {
    return {
      ...provided,
      sourceUrl: provided.sourceUrl || "provided-site-snapshot",
      captureStatus: "provided",
    };
  }

  const polygon = normalizeGeoPolygonForMap(
    input.sitePolygon ||
      input.site_boundary ||
      input.siteSnapshot?.sitePolygon ||
      input.siteSnapshot?.polygon ||
      brief.site_input.boundary_geojson,
  );
  const center = input.siteSnapshot?.center ||
    input.siteSnapshot?.coordinates ||
    input.locationData?.coordinates || { lat: site.lat, lng: site.lon };

  try {
    const snapshot = await getSiteSnapshotWithMetadata({
      coordinates: {
        lat: Number(center?.lat ?? site.lat),
        lng: Number(center?.lng ?? center?.lon ?? site.lon),
      },
      polygon: polygon.length >= 3 ? polygon : null,
      zoom: Number(input.siteSnapshot?.zoom || 18),
      size: [1200, 780],
      mapType: input.siteSnapshot?.mapType || "roadmap",
    });
    return snapshot
      ? {
          ...snapshot,
          captureStatus: "google_static_maps",
          sourceUrl: snapshot.sourceUrl || "google-static-maps",
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
  const entranceWall =
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

function buildDrawingSet(compiledProject) {
  const technicalBuild = buildCompiledProjectTechnicalPanels(compiledProject);
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
  return String(svgString || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(
      /<path\b[^>]*\bd=(["'])(.*?)\1[^>]*(?:\/>|>\s*<\/path>)/gi,
      (match, _quote, pathData) => {
        const normalizedPathData = String(pathData || "").trim();
        if (
          !normalizedPathData ||
          normalizedPathData === "undefined" ||
          normalizedPathData === "null" ||
          normalizedPathData.includes("NaN")
        ) {
          return "";
        }
        return match;
      },
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
  return points
    .map((point, index) => {
      const x =
        offsetX + (Number(point.x || 0) - Number(bbox.min_x || 0)) * scale;
      const y =
        height -
        (offsetY + (Number(point.y || 0) - Number(bbox.min_y || 0)) * scale);
      return `${index === 0 ? "M" : "L"} ${round(x, 2)} ${round(y, 2)}`;
    })
    .join(" ")
    .concat(" Z");
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
  const mapLayer = hasMapImage
    ? `<image x="28" y="52" width="844" height="676" href="${escapeXml(siteSnapshot.dataUrl)}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="28" y="52" width="844" height="676" fill="none" stroke="#111111" stroke-width="3"/>
  <g transform="translate(44 66)" opacity="0.88">
    <path d="${sitePath}" fill="#a9c58d66" stroke="#d64d35" stroke-width="5" stroke-dasharray="18 10"/>
    <path d="${buildablePath}" fill="none" stroke="#111111" stroke-width="3"/>
  </g>`
    : `<rect x="28" y="52" width="844" height="676" fill="#f3efe4" stroke="#111111" stroke-width="3"/>
  <g transform="translate(44 66)">
    <path d="${sitePath}" fill="#dfe8d0" stroke="#d64d35" stroke-width="5" stroke-dasharray="18 10"/>
    <path d="${buildablePath}" fill="none" stroke="#111111" stroke-width="3"/>
  </g>
  <path d="M 64 642 C 186 600 272 620 354 574 C 440 526 552 540 806 488" fill="none" stroke="#c8c8c8" stroke-width="28" opacity="0.55"/>
  <path d="M 64 642 C 186 600 272 620 354 574 C 440 526 552 540 806 488" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.85"/>`;
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="site_context" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}" data-site-map-source="${escapeXml(mapSource)}" data-site-map-image="${hasMapImage ? "true" : "false"}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  ${mapLayer}
  <path d="M 806 142 L 806 70 L 784 116 M 806 70 L 828 116" fill="none" stroke="#111111" stroke-width="5" stroke-linecap="round"/>
  <circle cx="806" cy="112" r="46" fill="none" stroke="#111111" stroke-width="2"/>
  <text x="806" y="58" font-family="Arial, sans-serif" font-size="32" font-weight="700" text-anchor="middle" fill="#111111">N</text>
  <text x="450" y="342" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#333333">Rear Garden</text>
  <text x="450" y="682" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#333333">Front Garden</text>
  <text x="82" y="690" font-family="Arial, sans-serif" font-size="20" fill="#333333">Driveway</text>
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
  <text x="852" y="878" font-family="Arial, sans-serif" font-size="13" text-anchor="end" fill="#777777">Area ${escapeXml(site.area_m2)} m2 | ${escapeXml(geometryHash.slice(0, 12))}</text>
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
      attribution,
      svgHash,
    },
  };
}

const MATERIAL_HEX_FALLBACKS = [
  "#b6634a",
  "#b08455",
  "#343a40",
  "#d7d2c8",
  "#5f7482",
  "#c1b8aa",
  "#6f756c",
  "#8a6f59",
];

function inferMaterialHex(name = "", index = 0) {
  const text = String(name || "").toLowerCase();
  if (/brick|terracotta|masonry/.test(text)) return "#b6634a";
  if (/timber|wood|oak|cedar|boarding/.test(text)) return "#b08455";
  if (/slate|dark|roof|tile|metal|zinc|standing seam/.test(text)) {
    return "#343a40";
  }
  if (/render|lime|plaster|stucco/.test(text)) return "#d7d2c8";
  if (/glass|glazing|aluminium|window/.test(text)) return "#5f7482";
  if (/stone|paving|natural/.test(text)) return "#c1b8aa";
  if (/concrete|grc|cement/.test(text)) return "#b8b7ae";
  return MATERIAL_HEX_FALLBACKS[index % MATERIAL_HEX_FALLBACKS.length];
}

function inferMaterialApplication(name = "") {
  const text = String(name || "").toLowerCase();
  if (/roof|slate|tile|standing seam/.test(text)) return "roof finish";
  if (/window|glass|glazing|aluminium/.test(text)) return "openings";
  if (/timber|boarding|screen|soffit/.test(text)) return "facade accent";
  if (/stone|paving/.test(text)) return "landscape / plinth";
  if (/render|brick|masonry|concrete|grc/.test(text)) return "external wall";
  return "finish";
}

function normalizeMaterialPaletteEntries({
  localStyle = null,
  compiledProject = null,
  styleDNA = null,
  brief = null,
} = {}) {
  const rawEntries = [];
  const addMaterial = (value, source = "project_graph") => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => addMaterial(entry, source));
      return;
    }
    if (typeof value === "string") {
      rawEntries.push({ name: value, source });
      return;
    }
    if (typeof value === "object") {
      const name =
        value.name ||
        value.material ||
        value.label ||
        value.type ||
        value.primary ||
        value.finish ||
        null;
      if (name) {
        rawEntries.push({
          name,
          hexColor: value.hexColor || value.color_hex || value.hex || null,
          application: value.application || value.use || value.role || null,
          source,
        });
      }
      if (!name) {
        Object.entries(value).forEach(([key, nested]) => {
          if (typeof nested === "string") {
            rawEntries.push({ name: nested, application: key, source });
          } else if (nested && typeof nested === "object") {
            addMaterial(
              { ...nested, application: nested.application || key },
              source,
            );
          }
        });
      }
    }
  };

  addMaterial(localStyle?.material_palette_with_provenance, "local_style");
  addMaterial(localStyle?.material_palette, "local_style");
  addMaterial(localStyle?.materials_local, "local_style");
  addMaterial(localStyle?.local_materials, "local_style");
  addMaterial(styleDNA?.materials, "style_dna");
  addMaterial(styleDNA?.local_materials, "style_dna");
  addMaterial(compiledProject?.materials, "compiled_project");
  addMaterial(brief?.user_intent?.material_preferences, "user_intent");

  const byName = new Map();
  rawEntries.forEach((entry) => {
    const normalizedName = String(entry.name || "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalizedName.toLowerCase();
    if (!key || byName.has(key)) return;
    const index = byName.size;
    byName.set(key, {
      name: normalizedName,
      hexColor: entry.hexColor || inferMaterialHex(normalizedName, index),
      application:
        entry.application || inferMaterialApplication(normalizedName),
      source: entry.source || "project_graph",
    });
  });

  if (byName.size === 0) {
    [
      "warm stock brick",
      "vertical timber cladding",
      "dark grey roof tiles",
      "aluminium windows",
      "light render",
      "natural stone paving",
    ].forEach((name, index) => {
      byName.set(name, {
        name,
        hexColor: inferMaterialHex(name, index),
        application: inferMaterialApplication(name),
        source: "deterministic_fallback",
      });
    });
  }

  return [...byName.values()].slice(0, 8);
}

function materialTextureKind(name = "") {
  const text = String(name || "").toLowerCase();
  if (/brick|masonry|terracotta/.test(text)) return "brick";
  if (/timber|wood|oak|cedar|boarding/.test(text)) return "timber";
  if (/roof|slate|tile|shingle/.test(text)) return "roof_tile";
  if (/window|glass|glazing|aluminium|metal|zinc/.test(text)) return "metal";
  if (/stone|paving/.test(text)) return "stone";
  if (/render|lime|plaster|stucco/.test(text)) return "render";
  return "woven";
}

function buildMaterialTexturePattern(material, index) {
  const id = `material-texture-${index}`;
  const base = escapeXml(
    material.hexColor || inferMaterialHex(material.name, index),
  );
  const kind = materialTextureKind(material.name);
  const overlay = {
    brick: `<path d="M0 12 H64 M0 36 H64 M0 60 H64 M16 0 V12 M48 12 V36 M16 36 V60" stroke="#5b2f25" stroke-width="2" opacity="0.42"/>`,
    timber: `<path d="M8 0 V72 M24 0 V72 M40 0 V72 M56 0 V72" stroke="#5c3b21" stroke-width="3" opacity="0.38"/><path d="M5 18 C18 8 24 30 40 18 C52 10 58 22 64 16" fill="none" stroke="#f0c88f" stroke-width="1.5" opacity="0.45"/>`,
    roof_tile: `<path d="M0 10 H72 M0 24 H72 M0 38 H72 M0 52 H72 M0 66 H72" stroke="#15191d" stroke-width="2" opacity="0.52"/><path d="M12 0 L0 72 M36 0 L24 72 M60 0 L48 72" stroke="#60666c" stroke-width="1.4" opacity="0.55"/>`,
    metal: `<path d="M0 0 L72 72 M-18 18 L54 90 M18 -18 L90 54" stroke="#d6e2e8" stroke-width="3" opacity="0.36"/><rect x="8" y="8" width="56" height="56" fill="none" stroke="#273844" stroke-width="2" opacity="0.42"/>`,
    stone: `<path d="M8 10 L30 4 L54 12 L66 30 L52 58 L24 66 L4 44 Z" fill="none" stroke="#7f776d" stroke-width="2" opacity="0.5"/><path d="M0 34 H72 M36 0 V72" stroke="#f3eee7" stroke-width="2" opacity="0.45"/>`,
    render: `<circle cx="12" cy="14" r="2" fill="#ffffff" opacity="0.45"/><circle cx="48" cy="28" r="2.4" fill="#ffffff" opacity="0.35"/><circle cx="30" cy="56" r="1.8" fill="#7c756c" opacity="0.35"/><circle cx="62" cy="62" r="2.1" fill="#7c756c" opacity="0.3"/>`,
    woven: `<path d="M0 18 H72 M0 54 H72 M18 0 V72 M54 0 V72" stroke="#ffffff" stroke-width="3" opacity="0.28"/>`,
  }[kind];
  return {
    id,
    kind,
    svg: `<pattern id="${id}" width="72" height="72" patternUnits="userSpaceOnUse" data-material-texture="${kind}"><rect width="72" height="72" fill="${base}"/>${overlay}</pattern>`,
  };
}

function buildMaterialPalettePanelArtifact({
  projectGraphId,
  localStyle,
  compiledProject,
  styleDNA,
  brief,
  geometryHash,
}) {
  const width = 900;
  const height = 620;
  const materials = normalizeMaterialPaletteEntries({
    localStyle,
    compiledProject,
    styleDNA,
    brief,
  });
  const swatchWidth = 180;
  const swatchHeight = 96;
  const gapX = 32;
  const gapY = 78;
  const startX = 44;
  const startY = 86;
  const patterns = materials
    .slice(0, 6)
    .map((material, index) => buildMaterialTexturePattern(material, index));
  const swatches = materials
    .slice(0, 6)
    .map((material, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = startX + col * (swatchWidth + gapX);
      const y = startY + row * (swatchHeight + gapY);
      const pattern = patterns[index];
      return `<g data-material-index="${index + 1}">
  <rect x="${x}" y="${y}" width="${swatchWidth}" height="${swatchHeight}" fill="url(#${pattern.id})" stroke="#111111" stroke-width="2" data-material-texture="${escapeXml(pattern.kind)}"/>
  <text x="${x}" y="${y + swatchHeight + 24}" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="#111111">${escapeXml(material.name.toUpperCase())}</text>
  <text x="${x}" y="${y + swatchHeight + 48}" font-size="15" font-family="Arial, sans-serif" fill="#444444">${escapeXml(material.application)}</text>
</g>`;
    })
    .join("\n");
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="material_palette" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}">
  <defs>${patterns.map((pattern) => pattern.svg).join("")}</defs>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="32" y="42" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#111111">MATERIAL PALETTE</text>
  <line x1="32" y1="58" x2="868" y2="58" stroke="#111111" stroke-width="2"/>
  ${swatches}
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
    metadata: {
      deterministic: true,
      source: "project_graph_material_palette",
      panelType: "material_palette",
      geometryHash,
      materialCount: materials.length,
      materials,
    },
  };
}

function splitNoteLines(note = "", maxChars = 36) {
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
  return lines.slice(0, 3);
}

function buildKeyNoteItems({ brief, site, climate, regulations, localStyle }) {
  const notes = [
    `${brief?.building_type || "Building"} brief: ${brief?.target_gia_m2 || "target"} sq m across ${brief?.target_storeys || 1} storeys.`,
    site?.area_m2
      ? `Site area ${site.area_m2} sq m; boundary and context sourced from ProjectGraph site analysis.`
      : "Site boundary is held in the ProjectGraph site model.",
    `Sustainability ambition: ${brief?.sustainability_ambition || "low_energy"}.`,
    climate?.overheating?.risk_level
      ? `Climate precheck: overheating risk ${climate.overheating.risk_level}.`
      : "Climate precheck uses deterministic fallback where live data is unavailable.",
    regulations?.jurisdiction
      ? `Regulation precheck jurisdiction: ${regulations.jurisdiction}.`
      : "Regulation checks are preliminary and require professional review.",
    Array.isArray(localStyle?.material_palette) &&
    localStyle.material_palette.length
      ? `Facade palette: ${localStyle.material_palette.slice(0, 3).join(", ")}.`
      : "Facade palette is derived from local style and user intent.",
    "All dimensions are in metres unless noted; verify before construction.",
  ];
  return notes.filter(Boolean).slice(0, 7);
}

function buildKeyNotesPanelArtifact({
  projectGraphId,
  brief,
  site,
  climate,
  regulations,
  localStyle,
  geometryHash,
}) {
  const width = 620;
  const height = 620;
  const notes = buildKeyNoteItems({
    brief,
    site,
    climate,
    regulations,
    localStyle,
  });
  let cursorY = 92;
  const noteGroups = notes
    .map((note, index) => {
      const lines = splitNoteLines(note, 42);
      const groupY = cursorY;
      cursorY += 34 + lines.length * 22;
      return `<g data-key-note="${index + 1}">
  <text x="34" y="${groupY}" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="#111111">${index + 1}.</text>
  ${lines
    .map(
      (line, lineIndex) =>
        `<text x="72" y="${groupY + lineIndex * 22}" font-size="17" font-family="Arial, sans-serif" fill="#222222">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}
</g>`;
    })
    .join("\n");
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="key_notes" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="30" y="44" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#111111">KEY NOTES</text>
  <line x1="30" y1="60" x2="590" y2="60" stroke="#111111" stroke-width="2"/>
  ${noteGroups}
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
      noteCount: notes.length,
    },
  };
}

function buildTitleBlockPanelArtifact({
  projectGraphId,
  brief,
  geometryHash,
  sheetPlan,
}) {
  const width = 620;
  const height = 620;
  const location =
    brief?.site_input?.address || brief?.site_input?.postcode || "Project site";
  const drawingNumber = sheetPlan?.sheet_number || "A1-00";
  const sheetLabel = sheetPlan?.label || "RIBA Stage 2 Master";
  const projectTitle = String(brief?.project_name || "ArchiAI Project")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const rows = [
    ["Project", brief?.project_name || "ArchiAI Project"],
    ["Location", location],
    ["Stage", sheetLabel],
    ["Scale", "As shown"],
    ["Date", "Generated"],
    ["Drawing No.", drawingNumber],
  ];
  const rowSvg = rows
    .map((row, index) => {
      const y = 230 + index * 48;
      return `<g>
  <line x1="34" y1="${y - 28}" x2="586" y2="${y - 28}" stroke="#999999" stroke-width="1"/>
  <text x="42" y="${y}" font-size="18" font-family="Arial, sans-serif" fill="#222222">${escapeXml(row[0])}</text>
  <text x="236" y="${y}" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="#111111">${escapeXml(row[1])}</text>
</g>`;
    })
    .join("\n");
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-panel-id="title_block" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="18" y="18" width="584" height="584" fill="none" stroke="#111111" stroke-width="3"/>
  <text x="34" y="70" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#111111">${escapeXml(projectTitle)}</text>
  <text x="34" y="112" font-family="Arial, sans-serif" font-size="22" fill="#333333">${escapeXml((brief?.building_type || "architecture").replace(/_/g, " ").toUpperCase())}</text>
  <line x1="34" y1="146" x2="586" y2="146" stroke="#111111" stroke-width="2"/>
  ${rowSvg}
  <text x="34" y="560" font-family="Arial, sans-serif" font-size="15" fill="#555555">source_model_hash ${escapeXml(String(geometryHash || "").slice(0, 16))}</text>
  <text x="586" y="560" font-family="Arial, sans-serif" font-size="15" text-anchor="end" fill="#555555">ARCHITECT AI PLATFORM</text>
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
      drawingNumber,
      sheetLabel,
    },
  };
}

// Build a climate + style + programme aware prompt for image-edit-based
// 3D panel rendering. Uses panelPromptBuilders.buildReasoningChainBlock
// so the gpt-image call sees the same upstream drivers (UK temperate,
// red brick + timber vernacular, 3-storey detached programme, etc.) that
// the deterministic pipeline already computed.
function buildProjectGraphRenderPrompt({
  panelType,
  brief,
  compiledProject,
  climate,
  localStyle,
  styleDNA,
  programmeSummary,
  region,
}) {
  const reasoning = buildReasoningChainBlock({
    locationData: { climate, region },
    masterDNA: { localStyle, styleDNA },
    projectContext: { programmeSummary, targetStoreys: brief?.target_storeys },
  });
  const intent =
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
  const buildingType = brief?.building_type || "building";
  const projectName = brief?.project_name || "project";
  return [
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
}) {
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
      let imageRenderFallbackReason = "gate_disabled";
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
        });
        let renderResult = null;
        try {
          renderResult = await renderProjectGraphPanelImage({
            panelType,
            deterministicSvg: deterministicSvgString,
            prompt,
            geometryHash,
          });
        } catch (renderErr) {
          // The renderer normally returns null on failure, but if it ever
          // throws we still want to capture the reason for QA.
          console.warn(
            `[projectGraphVerticalSlice] image renderer threw for ${panelType}:`,
            renderErr?.message,
          );
          renderResult = null;
          imageRenderFallbackReason = "openai_error";
        }
        if (renderResult?.pngBuffer) {
          svgString = wrapPngAsSvgPanel(
            renderResult.pngBuffer,
            viewBox,
            width,
            height,
          );
          renderProvenance = renderResult.provenance;
          imageRenderFallbackReason = null;
        } else if (
          renderResult === null &&
          imageRenderFallbackReason === "gate_disabled"
        ) {
          // The renderer returns null both when the env gate is disabled AND
          // on silent failure. We can't distinguish here, so leave the reason
          // as "gate_disabled" — Phase C exposes the env flag so callers know.
          imageRenderFallbackReason = "gate_disabled";
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
            presentationMode,
            visualFidelityStatus,
            visualRenderMode,
            renderProvenance,
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
  });
  const keyNotes = buildKeyNotesPanelArtifact({
    projectGraphId,
    brief,
    site,
    climate,
    regulations,
    localStyle,
    geometryHash,
  });
  const titleBlock = buildTitleBlockPanelArtifact({
    projectGraphId,
    brief,
    geometryHash,
    sheetPlan,
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
function buildPresentationV3SheetPanelSpecs(targetStoreys = 1) {
  const storeyCount = Math.max(1, Number(targetStoreys) || 1);

  // Row geometry (mm; A1 landscape = 841×594mm with 10mm side margins)
  const ROW1_Y = 10;
  const ROW1_H = 188;
  const ROW2_Y = 208;
  const ROW2_H = 188;
  const ROW3_Y = 406;
  const ROW3_H = 178;

  // Top/middle row column ranges
  const SITE_X = 10;
  const SITE_W = 180;
  const PLANS_X = 200;
  const PLANS_W_TOTAL = 370; // x: 200..570
  const ELEV_X = 580;
  const ELEV_W = 251;
  const ELEV_HALF_H = 92;

  // Row 1 / 2 right-column elevation pairs
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
      y: ROW1_Y + ELEV_HALF_H + 4,
      width: ELEV_W,
      height: ELEV_HALF_H,
      scale: "1:100",
      required: true,
    },
  ];
  const elevationsRow2 = [
    {
      panelType: "elevation_east",
      x: ELEV_X,
      y: ROW2_Y,
      width: ELEV_W,
      height: ELEV_HALF_H,
      scale: "1:100",
      required: true,
    },
    {
      panelType: "elevation_west",
      x: ELEV_X,
      y: ROW2_Y + ELEV_HALF_H + 4,
      width: ELEV_W,
      height: ELEV_HALF_H,
      scale: "1:100",
      required: true,
    },
  ];

  // Floor plans across row 1 plan-row segment, scaled to storey count.
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
    const cellW = (PLANS_W_TOTAL - 10) / 2; // 180
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
        x: PLANS_X + cellW + 10,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
    );
  } else {
    // 3 storeys (4+ goes through sheetSplitter to A1-002 technical sheet).
    const cellW = (PLANS_W_TOTAL - 20) / 3; // ~116.7
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
        x: PLANS_X + cellW + 10,
        y: ROW1_Y,
        width: cellW,
        height: ROW1_H,
        scale: "1:100",
        required: true,
      },
      {
        panelType: floorPlanPanelType(2),
        x: PLANS_X + (cellW + 10) * 2,
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
      return {
        slotIndex: index,
        panelType: slot.panelType,
        panelId: createStableId("sheet-panel", slot.panelType, index),
        title: formatPanelTitle(slot.panelType),
        scale: drawing?.scale || slot.scale,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        required: slot.required,
        sourcePanelAssetId: artifact?.asset_id || assetId,
        sourceDrawingId: drawing?.drawing_id || null,
        source_model_hash: artifact?.source_model_hash || null,
        geometryHash: artifact?.source_model_hash || null,
        svgHash: artifact?.svgHash || null,
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
  };
}

// Phase B closeout: per-panel-type fit policy for presentation-v3.
// Technical drawings cropped tight to contentBounds (with small padding) so
// drawings fill 80–92% of the slot; site/3D/data panels keep the previous
// padded normalizedViewBox so legends and decorative space stay visible.
// board-v2 is unaffected — it always returns the existing viewBox chain.
const PRESENTATION_V3_PANEL_PADDING = {
  floor_plan_ground: 0.04,
  floor_plan_first: 0.04,
  floor_plan_level2: 0.04,
  floor_plan_level3: 0.04,
  floor_plan_level4: 0.04,
  floor_plan_level5: 0.04,
  floor_plan_level6: 0.04,
  floor_plan_level7: 0.04,
  section_AA: 0.04,
  section_BB: 0.04,
  elevation_north: 0.06,
  elevation_south: 0.06,
  elevation_east: 0.06,
  elevation_west: 0.06,
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

// Phase B closeout: stack the scale label below the title when the two
// would visually collide on a narrow slot. Estimates use NotoSans avg
// glyph advance (caps for the bold title, mixed for the regular scale).
// board-v2 always returns the inline layout to keep its golden output.
const CAPTION_TITLE_FONT_SIZE = 5.8;
const CAPTION_SCALE_FONT_SIZE = 4.2;
const CAPTION_STACKED_SCALE_FONT_SIZE = 3.4;
const CAPTION_TITLE_ADVANCE_RATIO = 0.62;
const CAPTION_SCALE_ADVANCE_RATIO = 0.55;
const CAPTION_HORIZONTAL_PADDING_MM = 4;
const CAPTION_MIN_GAP_MM = 8;
const CAPTION_INLINE_CONTENT_TOP_MM = 14;
const CAPTION_STACKED_CONTENT_TOP_MM = 16;
const CAPTION_CONTENT_BOTTOM_PADDING_MM = 10;
const CAPTION_TITLE_BASELINE_MM = 5.8;
const CAPTION_STACKED_SCALE_BASELINE_MM = 11.0;

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
  if (requiredInlineWidth <= panelWidth) {
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A1_SHEET_SIZE_MM.width}mm" height="${A1_SHEET_SIZE_MM.height}mm" viewBox="0 0 ${A1_SHEET_SIZE_MM.width} ${A1_SHEET_SIZE_MM.height}" data-layout-version="${A1_SHEET_LAYOUT_VERSION}" data-layout-template="${escapeXml(layoutTemplate)}" data-placeholder-only="false" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}" data-sheet-number="${escapeXml(sheetNumber)}" data-sheet-label="${escapeXml(sheetLabel)}" data-qa-status="${escapeXml(qaStatus || "pending")}">
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
}) {
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
  });
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
  const requiredPlacementTypes = buildRequiredA1PanelTypes(targetStoreys);
  const requiredPlacements = panelPlacements.filter((placement) =>
    requiredPlacementTypes.includes(placement.panelType),
  );
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
      quality: {
        placeholderOnly: false,
        requiredPanelCount: sheetPlan
          ? sheetPlan.panel_types.length
          : requiredPlacementTypes.length,
        requiredPanelsPlaced: requiredPlacements.length,
        totalPanelsPlaced: panelPlacements.length,
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

async function analyseRenderedSheetPng(pngBuffer) {
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
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    String(svgString || ""),
  )}`;
}

function buildResultPanelMap(panelArtifacts = {}) {
  return Object.fromEntries(
    artifactArray(panelArtifacts)
      .filter((artifact) => artifact?.panel_type || artifact?.panelType)
      .map((artifact) => {
        const panelType = artifact.panel_type || artifact.panelType;
        return [
          panelType,
          {
            panelType,
            label: formatPanelTitle(panelType),
            url:
              (artifact.svgString ? svgToDataUrl(artifact.svgString) : null) ||
              artifact.dataUrl ||
              artifact.imageUrl,
            dataUrl: artifact.dataUrl || null,
            svgString: artifact.svgString || null,
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
  const renderedSheet = await rasteriseSheetArtifact({
    sheetArtifact,
    densityDpi: targetDensityDpi,
  });
  const renderedPngBytes = normalizeBinaryBytes(
    renderedSheet.pngBuffer,
    "rendered A1 sheet PNG",
  );
  const renderedPngHash = computeCDSHashSync({
    sourceSvgHash: sheetArtifact.svgHash,
    png: Buffer.from(renderedPngBytes).toString("base64"),
    geometryHash,
  });
  const occupancy = await analyseRenderedSheetPng(renderedPngBytes);
  const panelOccupancy = buildPanelRenderSummary(sheetArtifact);
  const textRenderStatus = await analyseRenderedTextProof({
    pngBuffer: renderedPngBytes,
    sheetSvg: rawSheetSvg,
    requiredLabels: REQUIRED_A1_TEXT_PROOF_LABELS,
  });
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

function expectedRequiredPanelTypes(targetStoreys = 1) {
  return buildRequiredA1PanelTypes(targetStoreys);
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

function count3DGeometryElements(svgString = "") {
  return (String(svgString || "").match(/<(?:polygon|polyline|path)\b/gi) || [])
    .length;
}

function visual3DArtifactTooWeak(artifact = null) {
  if (!artifact) return true;
  const metadata = artifact.metadata || {};
  const primitiveCount = Number(
    metadata.primitiveCount ??
      metadata.surfaceCount ??
      metadata.geometryPrimitiveCount ??
      0,
  );
  const hasCamera = Boolean(
    metadata.camera && typeof metadata.camera === "object",
  );
  const geometryElementCount = count3DGeometryElements(
    artifact.svgString || "",
  );
  return (
    primitiveCount < MIN_3D_PRIMITIVE_COUNT ||
    !hasCamera ||
    geometryElementCount < MIN_3D_PRIMITIVE_COUNT
  );
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
  const expectedPanels = expectedRequiredPanelTypes(
    projectGraph?.brief?.target_storeys || 1,
  );
  const missingRequiredPanels = expectedPanels.filter((panelType) => {
    const artifact = findPanelArtifact(panelArtifacts, panelType);
    return !svgLooksRenderable(artifact?.svgString || "");
  });
  addCheck(
    checks,
    "A1_REQUIRED_PANEL_CONTENT_PRESENT",
    missingRequiredPanels.length === 0,
    { missingRequiredPanels, expectedPanels },
    "graphic",
    0,
  );
  if (missingRequiredPanels.length) {
    issues.push(
      buildIssue(
        "A1_PANEL_CONTENT_MISSING",
        "error",
        "One or more required A1 panels are missing renderable source content.",
        { missingRequiredPanels },
      ),
    );
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

  const visuals3d = artifacts.visuals3d || {};
  const missing3dPanels = REQUIRED_3D_A1_PANEL_TYPES.filter((panelType) => {
    const artifact =
      visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
    return !artifact || !svgLooksRenderable(artifact.svgString || "");
  });
  const wrong3dHashPanels = REQUIRED_3D_A1_PANEL_TYPES.filter((panelType) => {
    const artifact =
      visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
    return artifact && artifact.source_model_hash !== geometryHash;
  });
  const placeholder3dPanels = REQUIRED_3D_A1_PANEL_TYPES.filter((panelType) => {
    const artifact =
      visuals3d[panelType] || findPanelArtifact(panelArtifacts, panelType);
    const svg = artifact?.svgString || "";
    return (
      artifact &&
      (artifact.metadata?.source === "placeholder" ||
        svg.length < 1200 ||
        /1x1|placeholder_3d|geometryRenderService/i.test(svg) ||
        visual3DArtifactTooWeak(artifact))
    );
  });
  addCheck(
    checks,
    "REQUIRED_3D_PANELS_PRESENT",
    missing3dPanels.length === 0 && wrong3dHashPanels.length === 0,
    {
      missing3dPanels,
      wrong3dHashPanels,
      expected: REQUIRED_3D_A1_PANEL_TYPES,
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
        "warning",
        "Photoreal presentation image rendering was unavailable; deterministic ProjectGraph control renders were used instead.",
        { fallbackPresentationPanels },
      ),
    );
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
  const brief = normalizeBrief(input);
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
  const deterministicSite = buildSiteContext({
    brief,
    sitePolygon: input.sitePolygon || input.site_boundary || [],
    siteMetrics: input.siteMetrics || {},
  });
  // Plan §6.2 / §14: opt-in enrichment via Planning Data, EA flood, OSM. The
  // slice stays offline-safe by default; callers pass fetchImpl or
  // useDefaultFetch=true to invoke real providers.
  const site =
    input.contextProviders &&
    (input.contextProviders.fetchImpl || input.contextProviders.useDefaultFetch)
      ? await enrichSiteContext(deterministicSite, input.contextProviders)
      : deterministicSite;
  const siteMapSnapshot = await resolveSiteMapSnapshot({ input, brief, site });
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
  const { drawingSet, drawingArtifacts, technicalBuild } =
    buildDrawingSet(compiledProject);
  const scene3d = build3DProjection(compiledProject);
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
  const providerCalls = modelRoutes.map((route) => ({
    stepId: route.stepId,
    provider: route.provider,
    model: route.model,
    apiKeyEnv: route.apiKeyEnv,
    status: "route_resolved",
    secretsRedacted: true,
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
  const renderedSheets = [];
  for (const sheetPlan of splitDecision.sheets) {
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
    });
    const pdf = await buildA1PdfArtifact({
      projectGraphId,
      brief,
      geometryHash: compiledProject.geometryHash,
      sheetArtifact: sheetResult.sheetArtifact,
      renderIntent: "final_a1",
    });
    sheetResult.sheetArtifact.renderProof = pdf.renderedProof;
    sheetResult.sheetArtifact.metadata = {
      ...(sheetResult.sheetArtifact.metadata || {}),
      renderProof: pdf.renderedProof,
      textRenderStatus: pdf.renderedProof?.textRenderStatus,
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
      providerCalls,
      geometrySteps,
      exportSteps,
    },
  };
  const qa = validateProjectGraphVerticalSlice({
    projectGraph: graphWithStableId,
    artifacts,
  });

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

  return {
    success: qa.status === "pass",
    pipelineVersion: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
    geometryHash: compiledProject.geometryHash,
    projectGraph: finalGraph,
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

export default {
  PROJECT_GRAPH_SCHEMA_VERSION,
  PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
  buildArchitectureProjectVerticalSlice,
  buildArchitectureProjectVerticalSliceWithRepair,
  validateProjectGraphVerticalSlice,
};
