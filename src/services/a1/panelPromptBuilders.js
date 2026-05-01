/**
 * Panel Prompt Builders — CANONICAL PANEL PROMPT BUILDER
 *
 * Single source of truth for per-panel prompt construction. Provides
 * specialized prompt builders for each of the 14 panel types, with
 * Design Fingerprint constraint injection for strict cross-panel consistency.
 *
 * Imported by: dnaWorkflowOrchestrator, design/panelGenerationService,
 * panelOrchestrator, dnaPromptGenerator (negative-prompt constants).
 *
 * @module services/a1/panelPromptBuilders
 */

import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { buildRoboflowSymbolVocabularyBlock } from "../layoutReferenceService.js";
import { getRoomListForLevel } from "../validation/programLockSchema.js";
import {
  buildFingerprintFromDNA,
  buildHeroIdentitySpec,
} from "../design/designFingerprintService.js";
import { buildMaterialSpecSheet } from "../design/canonicalMaterialPalette.js";

// CAD-standard lineweight specification for technical drawings
const LINEWEIGHT_SPEC = `
MANDATORY LINEWEIGHT HIERARCHY (must be visually distinct):
- Building outline/section cuts: HEAVY BLACK (6px / 0.7mm print)
- Primary walls: BOLD (4px / 0.5mm)
- Interior walls/secondary: MEDIUM (2px / 0.25mm)
- Dimension lines: THIN (1.5px / 0.18mm)

MANDATORY TEXT SIZES:
- Room labels: 16pt BOLD UPPERCASE with area (e.g., "LIVING ROOM 5.5×4.0m")
- Dimension text: 12pt BOLD
- Annotations: 10pt regular
- All text BLACK, Arial/Helvetica font`;

const DRAWING_STYLE_SUFFIX = `crisp black vector linework on pure white paper, strict CAD drafting standard, professional architectural blueprint. No shadows, no shading, no gradients, no color fills, no ambient occlusion.
Drawing must fill 85-95% of the canvas with minimal outer margins; no tiny drawing centered in large white space.
${LINEWEIGHT_SPEC}`;
const RENDER_STYLE_SUFFIX = [
  "architectural visualization, V-Ray + 3ds Max quality, octane-grade physically-based rendering",
  "photoreal PBR materials with accurate roughness, specular highlights, normal maps, subsurface scattering on render finishes",
  "HDRI sky lighting with soft volumetric god-rays, realistic ambient occlusion, contact shadows under eaves",
  "shallow depth of field, subtle chromatic aberration, lens vignette, film grain barely perceptible",
  "manicured landscape with grass blades, gravel texture, mature trees casting dappled shade",
  "Dezeen / ArchDaily magazine cover quality, 8K, no watermark, no text, no diagrams",
  "same materials and colors as other views, soft neutral sky",
].join(", ");

// Shared anti-3D negative prompt fragments for 2D technical views
const ANTI_3D_CORE =
  "(shadows:1.5), (shading:1.5), (ambient occlusion:1.5), (depth:1.5), (volume:1.5), (gradient:1.4), (lighting effects:1.3), (glossy:1.3), (reflection:1.3)";
const ANTI_PHOTOREALISM =
  "(photorealistic:1.5), (photograph:1.4), (render:1.3), (photoreal:1.6), (rendered shading:1.4)";
const BASE_QUALITY_NEGATIVE =
  "(low quality:1.4), (worst quality:1.4), (blurry:1.3), watermark, signature";
// Orthographic enforcement — appended to every technical 2D negative.
// Targets perspective drift, vanishing points, foreshortening, lens warp,
// and rendered shading that turn flat technical drawings into perspective views.
const ANTI_PERSPECTIVE_ORTHO =
  "(vanishing point:1.6), (foreshortening:1.6), (camera tilt:1.5), (lens distortion:1.5), (fisheye:1.5), (converging lines:1.4), (tilted view:1.4)";

export const FLOOR_PLAN_NEGATIVE = `${BASE_QUALITY_NEGATIVE}, (perspective:1.5), (3D:1.5), (isometric:1.5), (axonometric:1.5), ${ANTI_PERSPECTIVE_ORTHO}, ${ANTI_3D_CORE}, ${ANTI_PHOTOREALISM}`;
export const ELEVATION_NEGATIVE = `${BASE_QUALITY_NEGATIVE}, (perspective:1.5), (3D:1.5), (angled view:1.4), ${ANTI_PERSPECTIVE_ORTHO}, ${ANTI_3D_CORE}, ${ANTI_PHOTOREALISM}`;
export const SECTION_NEGATIVE = `${BASE_QUALITY_NEGATIVE}, (perspective:1.5), (3D:1.5), ${ANTI_PERSPECTIVE_ORTHO}, ${ANTI_3D_CORE}, ${ANTI_PHOTOREALISM}`;
export const SITE_PLAN_NEGATIVE = `${BASE_QUALITY_NEGATIVE}, (3D:1.5), (perspective:1.5), ${ANTI_PERSPECTIVE_ORTHO}, ${ANTI_3D_CORE}, ${ANTI_PHOTOREALISM}`;

/**
 * Build fingerprint constraint clause for prompt injection
 * This is the core mechanism for ensuring all panels show THE SAME building.
 *
 * Always returns a non-empty constraint when a fingerprint is supplied.
 * The feature flag previously gating this function was removed in the
 * A1 quality hardening pass — every panel must receive identity language
 * regardless of upstream flag state.
 *
 * @param {Object} fingerprint - Design fingerprint extracted from hero_3d
 *                               or derived from masterDNA
 * @returns {string} Constraint clause to inject into prompts
 */
export function buildFingerprintConstraint(fingerprint) {
  if (!fingerprint) {
    return "";
  }

  // Use the pre-built promptLock if available
  if (fingerprint.promptLock) {
    return fingerprint.promptLock;
  }

  // Build constraint from fingerprint data
  const materialsStr = (fingerprint.materialsPalette || [])
    .map((m) => `${m.name} (${m.hexColor}) on ${m.coverage}`)
    .join("; ");

  return `STRICT DESIGN FINGERPRINT - MATCH EXACTLY:
- Massing: ${fingerprint.massingType || "compact rectangular"}
- Roof: ${fingerprint.roofProfile || "gable roof"}
- Facade rhythm: ${fingerprint.facadeRhythm || "regular fenestration"}
- Materials: ${materialsStr || "as specified in DNA"}
- Windows: ${fingerprint.windowPattern || "regular grid"}
- Entrance: ${fingerprint.entrancePosition || "front facade centered"}
- Style: ${fingerprint.styleDescriptor || "contemporary residential"}

CRITICAL: This is THE SAME building shown in the hero 3D render.
DO NOT generate a different building. All architectural elements must match exactly.`;
}

/**
 * Inject fingerprint constraint into prompt context.
 *
 * Strategy (in priority order):
 *   1. Use explicit constraint string (context.fingerprintConstraint).
 *   2. Use explicit fingerprint object (context.designFingerprint).
 *   3. Derive a fingerprint from masterDNA + ProjectGraph as a fallback,
 *      so every panel still receives identity language even when the
 *      hero-extraction step has not run.
 *
 * @private
 */
function injectFingerprintConstraint(context) {
  const explicitConstraint =
    context?.fingerprintConstraint ||
    context?.projectContext?.fingerprintConstraint;
  if (explicitConstraint) {
    return explicitConstraint;
  }

  const fingerprint =
    context?.designFingerprint || context?.projectContext?.designFingerprint;
  if (fingerprint) {
    const constraint = buildFingerprintConstraint(fingerprint);
    if (constraint) {
      return constraint;
    }
  }

  const masterDNA = context?.masterDNA || context?.dna || null;
  if (masterDNA) {
    try {
      const derived = buildFingerprintFromDNA(masterDNA, {
        projectGeometry: context?.projectContext?.projectGeometry || null,
        facadeGrammar: context?.projectContext?.facadeGrammar || null,
        portfolioStyle: context?.projectContext?.portfolioStyle || null,
      });
      if (derived) {
        return buildFingerprintConstraint(derived);
      }
    } catch (error) {
      logger?.debug?.(
        `[panelPromptBuilders] DNA-derived fingerprint fallback failed: ${error?.message || error}`,
      );
    }
  }

  return "";
}

/**
 * Normalize DNA dimensions with fallbacks
 * @private
 */
function normalizeDimensions(masterDNA = {}) {
  const dims = masterDNA.dimensions || {};
  const floors =
    dims.floors || dims.floorCount || dims.floor_count || dims.numLevels || 1;
  const floorHeight = 3.2;
  return {
    length: dims.length || dims.length_m || 15,
    width: dims.width || dims.width_m || 10,
    height: dims.height || dims.height_m || floors * floorHeight,
    floors,
    floorHeights: dims.floorHeights || Array(floors).fill(floorHeight),
  };
}

/**
 * Normalize materials list
 * @private
 */
function normalizeMaterials(masterDNA = {}) {
  const materials = masterDNA.materials || [];
  if (Array.isArray(materials) && materials.length > 0) {
    return materials
      .map((m) => {
        const name = typeof m === "string" ? m : m.name || m.type || "material";
        const color = m.hexColor ? ` (${m.hexColor})` : "";
        return `${name}${color}`;
      })
      .slice(0, 5);
  }
  return ["stone", "glass", "timber"];
}

/**
 * Build a concise BUILDING IDENTITY block for prompt injection.
 * Placed at the TOP of every panel prompt so FLUX sees it first.
 * @private
 */
function buildBuildingIdentityBlock(masterDNA = {}, projectContext = {}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const buildingType = projectContext?.buildingProgram || "residential house";

  const storeyDesc =
    dims.floors === 1
      ? "SINGLE STOREY (ground floor only). NO upper floor. NO second level."
      : `${dims.floors}-STOREY building.`;

  // Building type specific descriptors to help FLUX understand the form
  const typeDesc = buildBuildingTypeDescriptor(buildingType, dims);

  // A1v3 P4: prefer the pre-computed canonical palette + fingerprint on the
  // project context. Emits explicit hex values + roof pitch + window rhythm
  // so every panel (including hero_3d) renders from the same locked SSOT.
  const sharedPalette =
    isFeatureEnabled("useSharedCanonicalPaletteA1v3") &&
    projectContext?.canonicalPalette
      ? projectContext.canonicalPalette
      : null;
  const sharedFingerprint = projectContext?.designFingerprint || null;
  let paletteLine = `Primary material: ${materials[0] || "as specified"}`;
  if (sharedPalette?.primary?.hexColor) {
    const primary = sharedPalette.primary;
    const secondary = sharedPalette.secondary;
    const roof = sharedPalette.roof;
    const trim = sharedPalette.trim;
    const glazing = sharedPalette.glazing;
    const roofPitch =
      sharedFingerprint?.roofPitchDegrees ??
      masterDNA?._structured?.geometry_rules?.roof_pitch_degrees ??
      "context-led";
    const windowRhythm =
      sharedFingerprint?.windowRhythm ||
      sharedFingerprint?.facadeRhythm ||
      "regular fenestration";
    paletteLine = `Canonical palette (MATCH EXACTLY):
 • Primary: ${primary.name} ${primary.hexColor} — ${primary.application || "walls"}
 • Secondary: ${secondary?.name || "n/a"} ${secondary?.hexColor || ""} — ${secondary?.application || "accents"}
 • Roof: ${roof?.name || "n/a"} ${roof?.hexColor || ""} — ${roof?.application || "roof covering"}
 • Trim: ${trim?.name || "n/a"} ${trim?.hexColor || ""} — ${trim?.application || "trim"}
 • Glazing: ${glazing?.name || "n/a"} ${glazing?.hexColor || ""} — ${glazing?.application || "windows"}
Roof pitch: ${roofPitch} degrees
Window rhythm: ${windowRhythm}`;
  }

  return `=== BUILDING IDENTITY (MANDATORY - DO NOT DEVIATE) ===
SHOW EXACTLY ONE (1) SINGLE FREESTANDING DETACHED ${buildingType.toUpperCase()}.
Building: ${style} detached ${buildingType}
Floors: EXACTLY ${dims.floors} — ${storeyDesc}
Dimensions: ${dims.length}m long × ${dims.width}m wide × ${dims.height}m tall
Roof: ${roofType}
${paletteLine}
${typeDesc}
CRITICAL: This is ONE SINGLE FREESTANDING BUILDING standing ALONE with open space on ALL four sides.
It is NOT attached to any other building. NOT a row of houses. NOT terraced. NOT semi-detached.
NOT multiple buildings. NOT a housing estate. JUST ONE BUILDING.
=== END BUILDING IDENTITY ===`;
}

function buildCanonicalIdentitySpecBlock(masterDNA = {}, projectContext = {}) {
  if (!isFeatureEnabled("useCanonicalMaterialPaletteSSOT")) {
    return "";
  }

  const identitySpec = buildHeroIdentitySpec(masterDNA, {
    projectGeometry: projectContext?.projectGeometry || null,
    facadeGrammar: projectContext?.facadeGrammar || null,
    portfolioStyle: projectContext?.portfolioStyle || null,
  });

  return `=== CANONICAL HERO IDENTITY SPEC (MATCH EXACTLY) ===
Primary material: ${identitySpec.primaryMaterial?.name || "Primary"} ${identitySpec.primaryMaterial?.hexColor || ""}
Secondary material: ${identitySpec.secondaryMaterial?.name || "Secondary"} ${identitySpec.secondaryMaterial?.hexColor || ""}
Roof material: ${identitySpec.roofMaterial?.name || "Roof"} ${identitySpec.roofMaterial?.hexColor || ""}
Glazing: ${identitySpec.glazingMaterial?.name || "Glass"} ${identitySpec.glazingMaterial?.hexColor || ""}
Roof language: ${identitySpec.roofLanguage}
Roof pitch: ${identitySpec.roofPitchDegrees ?? "context-led"} degrees
Storey count: ${identitySpec.storeyCount}
Window rhythm: ${identitySpec.windowRhythm}
Opening language: ${identitySpec.openingLanguage}
Entrance position: ${identitySpec.entrancePosition}
Massing language: ${identitySpec.massingLanguage}
${identitySpec.portfolioStyleAnchor ? `Portfolio style anchor: ${identitySpec.portfolioStyleAnchor}` : "Portfolio style anchor: none"}
=== END CANONICAL HERO IDENTITY SPEC ===`;
}

/**
 * Build building-type-specific descriptors to help FLUX understand the form.
 * @private
 */
function buildBuildingTypeDescriptor(buildingType, dims) {
  const type = (buildingType || "").toLowerCase();

  if (
    type.includes("detached") ||
    type.includes("house") ||
    type.includes("residential")
  ) {
    return `FORM: A single detached family house with front door, garden, driveway. ${dims.floors === 1 ? "Low-profile bungalow form." : "Compact domestic proportions."} Residential scale — NOT commercial, NOT institutional.`;
  }
  if (
    type.includes("clinic") ||
    type.includes("medical") ||
    type.includes("health")
  ) {
    return `FORM: A medical clinic building with prominent entrance canopy, accessible ramp, large reception windows. Clinical/healthcare architectural language. NOT a house.`;
  }
  if (type.includes("school") || type.includes("education")) {
    return `FORM: An educational building with multiple classrooms visible, large windows for daylight, covered entrance area. Institutional scale. NOT a house.`;
  }
  if (type.includes("office") || type.includes("commercial")) {
    return `FORM: A commercial office building with glazed curtain wall facade, modern entrance lobby. Professional/corporate architectural language. NOT a house.`;
  }
  return `FORM: A freestanding ${buildingType} building with clear main entrance. ${dims.floors}-storey scale.`;
}

/**
 * Translate climate analysis (Köppen zone, rainfall, sun path, wind) into a
 * compact prompt block describing the design-move drivers a render must
 * respect. Returns "" if no climate data is available — callers should
 * conditionally include the result.
 *
 * @param {Object|null} climate - Climate object from climateService.getClimateData()
 * @returns {string}
 */
export function buildClimateRenderContext(climate = null) {
  if (!climate || typeof climate !== "object") return "";

  const zone =
    climate.zone ||
    climate.koppen ||
    climate.classification ||
    climate.label ||
    "";
  const rainfallMm = Number(
    climate.rainfall_mm ||
      climate.annual_rainfall_mm ||
      climate.precipitation_mm ||
      climate.rainfall ||
      0,
  );
  const sun = climate.sun_path || climate.sunPath || {};
  const wind = climate.wind || {};
  const recs = Array.isArray(climate.design_recommendations)
    ? climate.design_recommendations
    : Array.isArray(climate.recommendations)
      ? climate.recommendations
      : [];

  const lines = [];
  if (zone) lines.push(`Climate zone: ${zone}.`);
  if (rainfallMm > 0) {
    const pitch =
      rainfallMm > 700
        ? "35-45° pitched roof for wet-climate drainage with deep eaves and visible rainwater goods"
        : rainfallMm > 400
          ? "25-35° moderate-pitch roof"
          : "shallow or flat roof acceptable in dry climate";
    lines.push(`Annual rainfall ${Math.round(rainfallMm)}mm — ${pitch}.`);
  }
  const sunParts = [];
  if (sun.altitude_summer != null) {
    sunParts.push(`summer altitude ~${Math.round(sun.altitude_summer)}°`);
  }
  if (sun.altitude_winter != null) {
    sunParts.push(`winter ~${Math.round(sun.altitude_winter)}°`);
  }
  if (sun.azimuth_noon != null) {
    sunParts.push(`noon azimuth ${Math.round(sun.azimuth_noon)}°`);
  }
  if (sunParts.length > 0) {
    lines.push(
      `Sun path: ${sunParts.join(", ")} — south-facing glazing emphasised, west elevation shaded against summer overheating.`,
    );
  }
  if (wind.prevailing || wind.direction) {
    const dir = String(wind.prevailing || wind.direction).toUpperCase();
    const opposite =
      {
        N: "S",
        S: "N",
        E: "W",
        W: "E",
        NE: "SW",
        NW: "SE",
        SE: "NW",
        SW: "NE",
      }[dir] || "leeward";
    const speed = wind.speed_kmh
      ? ` at ${Math.round(wind.speed_kmh)} km/h`
      : "";
    lines.push(
      `Prevailing wind ${dir}${speed} — sheltered ${opposite} entrance, robust detailing on the windward facade.`,
    );
  }
  if (recs.length) {
    lines.push(`Design moves: ${recs.slice(0, 3).join("; ")}.`);
  }

  if (lines.length === 0) return "";
  return `Climate driver:\n${lines.map((l) => `  ${l}`).join("\n")}`;
}

/**
 * Translate the resolved local style + Style DNA into a prompt block so the
 * render reflects regional vernacular (UK contemporary brick + timber, etc.)
 * rather than generic V-Ray studio aesthetics. Returns "" when no style data
 * has been resolved.
 */
export function buildStyleRenderContext(
  localStyle = null,
  styleDNA = null,
  region = null,
) {
  const pickFirst = (...values) => {
    for (const v of values) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const placeLabel = pickFirst(
    typeof region === "string" ? region : "",
    region?.label,
    region?.name,
    region?.region,
    styleDNA?.region,
    localStyle?.region,
    localStyle?.region_label,
  );
  const facade = pickFirst(
    styleDNA?.facade_language,
    localStyle?.facade_language,
    styleDNA?.facade,
    localStyle?.facade,
  );
  const roof = pickFirst(
    styleDNA?.roof_language,
    localStyle?.roof_language,
    styleDNA?.roof,
    localStyle?.roof,
  );
  const windowLang = pickFirst(
    styleDNA?.window_language,
    localStyle?.window_language,
    styleDNA?.windows,
    localStyle?.windows,
  );
  const massing = pickFirst(
    styleDNA?.massing_language,
    localStyle?.massing_language,
    styleDNA?.massing,
    localStyle?.massing,
  );
  const materials =
    (Array.isArray(localStyle?.materials_local) &&
      localStyle.materials_local) ||
    (Array.isArray(localStyle?.local_materials) &&
      localStyle.local_materials) ||
    (Array.isArray(styleDNA?.materials) && styleDNA.materials) ||
    [];
  const precedents =
    (Array.isArray(styleDNA?.precedent_keywords) &&
      styleDNA.precedent_keywords) ||
    (Array.isArray(localStyle?.precedent_keywords) &&
      localStyle.precedent_keywords) ||
    [];

  const lines = [];
  if (placeLabel) lines.push(`Regional vernacular: ${placeLabel}.`);
  if (facade) lines.push(`Facade: ${facade}.`);
  if (roof) lines.push(`Roof: ${roof}.`);
  if (windowLang) lines.push(`Windows: ${windowLang}.`);
  if (massing) lines.push(`Massing: ${massing}.`);
  if (materials.length) {
    const matLabels = materials
      .map((m) => (typeof m === "string" ? m : m?.name || m?.label || ""))
      .filter(Boolean)
      .slice(0, 5);
    if (matLabels.length)
      lines.push(`Local materials: ${matLabels.join(", ")}.`);
  }
  if (precedents.length) {
    lines.push(`Precedent: ${precedents.slice(0, 3).join(", ")}.`);
  }

  if (lines.length === 0) return "";
  return `Regional style:\n${lines.map((l) => `  ${l}`).join("\n")}`;
}

/**
 * Translate the programme summary (room counts, level distribution, total
 * area) into a prompt block so the render proportions and fenestration
 * reflect the actual programme rather than generic massing.
 */
export function buildProgrammeRenderContext(
  programmeSummary = null,
  targetStoreys = null,
) {
  if (!programmeSummary || typeof programmeSummary !== "object") return "";

  const totalArea = Number(
    programmeSummary.total_area_m2 ||
      programmeSummary.totalAreaM2 ||
      programmeSummary.target_gia_m2 ||
      0,
  );
  const storeys = Number(
    targetStoreys ||
      programmeSummary.target_storeys ||
      programmeSummary.storeys ||
      programmeSummary.floorCount ||
      0,
  );
  const roomsPerLevel =
    programmeSummary.rooms_per_level || programmeSummary.roomsPerLevel || {};
  const levelAreas =
    programmeSummary.level_areas || programmeSummary.levelAreas || {};
  const buildingType =
    programmeSummary.building_type ||
    programmeSummary.buildingType ||
    "building";

  const lines = [];
  if (totalArea && storeys) {
    lines.push(
      `Programme: ${Math.round(totalArea)}m² ${storeys}-storey ${buildingType}.`,
    );
  } else if (totalArea) {
    lines.push(`Programme: ${Math.round(totalArea)}m² ${buildingType}.`);
  }

  const levelEntries = Object.entries(roomsPerLevel);
  if (levelEntries.length) {
    for (const [level, rooms] of levelEntries.slice(0, 4)) {
      const areaVal = Number(levelAreas[level] || 0);
      const areaText = areaVal > 0 ? ` (${Math.round(areaVal)}m²)` : "";
      const roomList = Array.isArray(rooms)
        ? rooms.slice(0, 8).join(", ")
        : String(rooms);
      if (roomList) lines.push(`${level}${areaText}: ${roomList}.`);
    }
    if (levelEntries.length > 1) {
      lines.push(
        `Fenestration logic: ground-floor large openings to public rooms, upper floors regular bedroom rhythm.`,
      );
    }
  }

  if (lines.length === 0) return "";
  return `Programme:\n${lines.map((l) => `  ${l}`).join("\n")}`;
}

/**
 * Combined REASONING CHAIN block for injection into render prompts. Pulls
 * climate, local style + Style DNA, and programme summary off masterDNA /
 * locationData / projectContext and emits a single well-labelled block so
 * gpt-image / FLUX sees the upstream conditioning explicitly. Returns "" if
 * no inputs resolve, so callers can use it conditionally.
 */
export function buildReasoningChainBlock({
  locationData = null,
  masterDNA = null,
  projectContext = null,
} = {}) {
  const climate =
    locationData?.climate ||
    projectContext?.climate ||
    masterDNA?.climate ||
    null;
  const localStyle =
    masterDNA?.localStyle ||
    projectContext?.localStyle ||
    locationData?.localStyle ||
    null;
  const styleDNA =
    masterDNA?.styleDNA ||
    projectContext?.styleDNA ||
    locationData?.styleDNA ||
    null;
  const region =
    locationData?.region ||
    locationData?.locationProfile?.region ||
    projectContext?.region ||
    null;
  const programmeSummary =
    projectContext?.programmeSummary || masterDNA?.programmeSummary || null;
  const targetStoreys =
    projectContext?.targetStoreys ||
    projectContext?.target_storeys ||
    masterDNA?.dimensions?.floorCount ||
    null;

  const climateBlock = buildClimateRenderContext(climate);
  const styleBlock = buildStyleRenderContext(localStyle, styleDNA, region);
  const programmeBlock = buildProgrammeRenderContext(
    programmeSummary,
    targetStoreys,
  );

  const blocks = [climateBlock, styleBlock, programmeBlock].filter(Boolean);
  if (blocks.length === 0) return "";

  return `=== REASONING CHAIN (every architectural decision below MUST follow these drivers) ===
${blocks.join("\n")}
=== END REASONING CHAIN ===`;
}

/**
 * Build negative prompt additions for floor count enforcement.
 * @private
 */
function buildFloorCountNegatives(floors) {
  const negatives = [
    "multiple buildings",
    "row houses",
    "terraced houses",
    "townhouses",
    "semi-detached",
    "housing estate",
    "apartment block",
  ];
  if (floors === 1) {
    negatives.push(
      "two storey",
      "two story",
      "second floor",
      "upper floor",
      "first floor windows above ground",
      "multi-level",
      "two-storey",
      "2-storey",
      "2 storey",
    );
  }
  return negatives.join(", ");
}

/**
 * Build negative prompt additions for roof type enforcement.
 * If DNA says "flat roof", negative prompt includes "gable roof, hip roof, pitched roof" etc.
 * @private
 */
function buildRoofTypeNegatives(roofType) {
  const allRoofTypes = [
    "flat roof",
    "gable roof",
    "hip roof",
    "mansard roof",
    "pitched roof",
    "butterfly roof",
    "gambrel roof",
  ];
  const normalised = (roofType || "").toLowerCase();
  return allRoofTypes
    .filter((r) => !normalised || !r.includes(normalised))
    .join(", ");
}

/**
 * Build site diagram prompt
 */
export function buildSiteDiagramPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const footprint = `${dims.length}m × ${dims.width}m`;
  const address = locationData?.address || "Site location";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Site plan diagram - overhead orthographic view
Location: ${address}
Building footprint: ${footprint}
Style: ${style}

REQUIREMENTS:
- True overhead 2D view (NOT perspective)
- Building footprint positioned within site boundary
- North arrow clearly visible
- Scale bar (1:500 or 1:200)
- Property boundary lines
- Access roads and pathways
- Context landscaping (trees, parking)
- Site dimensions and setbacks labeled
- Clean technical drawing style

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `${SITE_PLAN_NEGATIVE}, noisy background, cluttered annotations, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build UK RIBA-style site plan prompt (fallback for the AI image-model path
 * when the deterministic svgSiteRenderer cannot produce output). The
 * deterministic renderer is the authoritative path for site_plan.
 */
export function buildSitePlanPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const footprint = `${dims.length}m × ${dims.width}m`;
  const address = locationData?.address || "Site location";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });

  const prompt = `${identity}

UK RIBA-style SITE PLAN - top-down orthographic technical drawing (NOT perspective)
Location: ${address}
Building footprint: ${footprint}
Style: ${style}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS (UK RIBA Stage 2/3 site plan conventions):
- TRUE TOP-DOWN ORTHOGRAPHIC VIEW (no perspective, no axonometric)
- Site boundary drawn as a thick continuous line
- Buildable envelope / setback shown as a dashed line inside the boundary
- Proposed building footprint filled as solid black poche
- Adjacent / neighbouring building footprints shown as light grey outlines for context
- Access road / driveway / pedestrian access annotated
- Existing vegetation (trees, hedges) and landscape features keyed
- North arrow at top-right (large, labelled "N")
- Graphical scale bar (1:500 or 1:200) at bottom-right
- Site area, buildable area, footprint area, and proposed coverage ratio annotated bottom-left
- Setback dimensions to each boundary annotated in metres
- Drainage / utility easements shown if present
- Pure 2D technical line drawing — no shading, no rendered textures, no photoreal

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `${SITE_PLAN_NEGATIVE}, noisy background, cluttered annotations, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build hero 3D exterior prompt
 * NOTE: Hero is the FIRST panel and establishes the design fingerprint.
 * It does NOT receive fingerprint constraints (it creates them).
 */
export function buildHero3DPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  geometryHint,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const geomConstraint = geometryHint?.type
    ? `FOLLOW PROVIDED GEOMETRY silhouette (${geometryHint.type}) for massing and roofline.`
    : "Keep massing consistent with plans and elevations.";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const canonicalIdentitySpec = buildHeroIdentitySpec(masterDNA, {
    projectGeometry: projectContext?.projectGeometry || null,
    facadeGrammar: projectContext?.facadeGrammar || null,
    portfolioStyle: projectContext?.portfolioStyle || null,
  });
  const canonicalIdentityBlock = buildCanonicalIdentitySpecBlock(
    masterDNA,
    projectContext,
  );
  const reasoningChain = buildReasoningChainBlock({
    locationData,
    masterDNA,
    projectContext,
  });

  const storeyDesc =
    dims.floors === 1
      ? "SINGLE STOREY ground-level volume (NO upper floor)"
      : `compact ${dims.floors}-storey volume`;

  // FLUX weights early tokens most — front-load materials with hex colors for style anchoring
  const floorText =
    dims.floors === 1
      ? "single-storey bungalow, ONE floor only"
      : dims.floors === 2
        ? "two-storey house"
        : `${dims.floors}-storey building`;

  // Build material description with hex colors for FLUX color anchoring
  const materialDescParts = [];
  const rawMats =
    masterDNA?.materials || masterDNA?._structured?.style?.materials || [];
  if (Array.isArray(rawMats)) {
    for (const mat of rawMats) {
      if (mat.name && mat.hexColor) {
        materialDescParts.push(
          `${mat.name} (${mat.hexColor}) on ${mat.application || "surfaces"}`,
        );
      } else if (typeof mat === "string") {
        materialDescParts.push(mat);
      }
    }
  }
  const materialDesc =
    materialDescParts.length > 0
      ? materialDescParts.join(", ")
      : [
          canonicalIdentitySpec.primaryMaterial &&
            `${canonicalIdentitySpec.primaryMaterial.name} (${canonicalIdentitySpec.primaryMaterial.hexColor})`,
          canonicalIdentitySpec.secondaryMaterial &&
            `${canonicalIdentitySpec.secondaryMaterial.name} (${canonicalIdentitySpec.secondaryMaterial.hexColor})`,
          canonicalIdentitySpec.roofMaterial &&
            `${canonicalIdentitySpec.roofMaterial.name} (${canonicalIdentitySpec.roofMaterial.hexColor})`,
        ]
          .filter(Boolean)
          .join(", ") || materials.join(", ");

  const buildingTypePrefix =
    `${materialDesc}, a single detached ${floorText}, ` +
    `${style} architecture, ${roofType} roof, ` +
    `one freestanding building with garden on all sides, ` +
    `photographed from front-left corner, `;

  // Hero establishes the design - include strong design specification
  const prompt = `${buildingTypePrefix}${identity}

Hero exterior 3D perspective view - STYLE ANCHOR for the entire A1 sheet.
This EXACT building with these EXACT materials appears in ALL other views.

Building: ${style} ${projectType}
Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)
Materials: ${materialDesc}
Roof: ${roofType} roof
${canonicalIdentityBlock}

DESIGN SPECIFICATION (All subsequent panels MUST match this):
- Building massing: ${storeyDesc}
- Roof type: ${roofType} (EXACT roof shape will be used for all views)
- Facade materials: ${canonicalIdentitySpec.primaryMaterial?.name || materials[0] || "primary material"} as dominant
- Secondary materials: ${canonicalIdentitySpec.secondaryMaterial?.name || "matching accent material"}
- Window pattern: ${canonicalIdentitySpec.windowRhythm}
- Opening language: ${canonicalIdentitySpec.openingLanguage}
- Entrance position: ${canonicalIdentitySpec.entrancePosition}
- Roof pitch: ${canonicalIdentitySpec.roofPitchDegrees ?? "context-led"} degrees

REQUIREMENTS:
- Photorealistic architectural rendering, 8K quality, award-winning architecture photography
- Southwest viewing angle (45° from corner), eye-level 1.6m with slight upward tilt
- Golden hour natural daylight with volumetric shadows and soft ambient occlusion
- ${style} architectural style clearly expressed through form, materials, and detailing
- Material textures visible at close range: grain in timber, coursing in brick, texture in render
- Contextual environment: photorealistic sky with clouds, manicured lawn, gravel driveway, mature trees/hedging
- Single building only (no variations or alternatives)
- Professional architecture magazine cover quality (Dezeen, ArchDaily standard)
- Coherent massing matching floor plans with precise proportions
- ${geomConstraint}
- Canonical facade identity: ${canonicalIdentitySpec.massingLanguage}; ${canonicalIdentitySpec.windowRhythm}; ${canonicalIdentitySpec.entrancePosition}
- FLOOR COUNT: EXACTLY ${dims.floors} floor(s). ${dims.floors === 1 ? "LOW ground-hugging SINGLE STOREY structure. Wall height ~3.2m before roof starts. NO upper windows." : `Show clearly ${dims.floors} rows of windows. Total height ${dims.height}m.`}
- ROOF: ${roofType} roof ONLY. ${roofType === "flat" ? "Horizontal roofline with parapet detail, NO pitch, NO gable ends." : roofType === "gable" ? "Triangular gable ends clearly visible with fascia and soffit detail. NOT flat, NOT hip." : roofType === "hip" ? "Hipped roof with uniform slope on all four sides, ridge tiles visible. NOT flat, NOT gable." : `${roofType} profile clearly visible.`}
- PROPORTIONS: Building is ${dims.length}m long × ${dims.width}m wide × ${dims.height}m to roof ridge
- ARCHITECTURAL DETAILING: visible window reveals (100mm depth), rainwater goods, threshold steps, plinth course, eaves detail
- DEPTH AND REALISM: depth of field effect, subtle lens flare from sun, reflections in glazing showing sky

${reasoningChain}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${RENDER_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `terraced, row houses, semi-detached, attached buildings, shared walls, multiple buildings, housing estate, street of houses, neighborhood, multiple roofs, duplex, apartment block, flats, apartments, townhouses, housing development, cartoon, sketch, overexposed, low detail, wireframe, different building styles, inconsistent design, people, cars, toy model, miniature, diorama, tilt-shift, plastic, CGI render, video game, unreal engine UI, blueprint drawing, line art, flat shading, anime, illustration, ${dims.floors === 1 ? "two storey, second floor, upper floor, balcony, " : ""}${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build dedicated exterior photoreal render prompt — frames the building
 * head-on with a slight angle so it reads as a magazine-cover render rather
 * than a strict elevation. Uses the same canonical identity as hero_3d so the
 * two exterior panels stay design-consistent.
 */
export function buildExteriorRenderPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  geometryHint,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const geomConstraint = geometryHint?.type
    ? `FOLLOW PROVIDED GEOMETRY silhouette (${geometryHint.type}) for massing and roofline.`
    : "Keep massing consistent with hero 3D, plans and elevations.";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const reasoningChain = buildReasoningChainBlock({
    locationData,
    masterDNA,
    projectContext,
  });

  const rawMats =
    masterDNA?.materials || masterDNA?._structured?.style?.materials || [];
  const matDescParts = [];
  if (Array.isArray(rawMats)) {
    for (const mat of rawMats) {
      if (mat.name && mat.hexColor) {
        matDescParts.push(
          `${mat.name} (${mat.hexColor}) on ${mat.application || "facade"}`,
        );
      }
    }
  }
  const matDesc =
    matDescParts.length > 0 ? matDescParts.join(", ") : materials.join(", ");

  const prompt = `${matDesc}, ${style} ${projectType}, ${identity}

Front-elevation hero render — magazine cover composition, head-on with ~12° angle.
This shows THE SAME building as the hero 3D and plans.

Building: ${style} ${projectType}
Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)
Materials: ${matDesc}
Roof type: ${roofType}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match hero exactly):\n${fingerprintConstraint}\n` : ""}

REQUIREMENTS:
- Photoreal architectural front-elevation render, near-orthographic with very slight rotation
- Camera 1.6m eye-level, leading-line composition, foreground front garden / driveway
- Three-point exterior lighting: golden-hour key from south-west, soft fill, rim light catching the eave
- Material textures legible: brick coursing, render grain, glazing reflections, timber detailing
- Sky: subtle gradient with thin cirrus, no overexposed highlights
- Detailed front entrance: door, lighting, threshold, address detail
- Visible architectural detailing: window reveals (100mm depth), rainwater goods, plinth course, eaves
- Single freestanding building, no neighbours, no street furniture clutter
- ${geomConstraint}
- FLOOR COUNT: EXACTLY ${dims.floors} floor(s).
- ROOF: ${roofType} roof, profile clearly visible.

${reasoningChain}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${RENDER_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `terraced, row houses, semi-detached, attached buildings, shared walls, multiple buildings, neighborhood, cartoon, sketch, wireframe, different building styles, inconsistent design, people, cars in driveway, toy model, plastic, video game, blueprint drawing, line art, flat shading, anime, ${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build interior 3D prompt
 * ENHANCED: Includes fingerprint constraint to match hero_3d exterior
 */
export function buildInterior3DPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const reasoningChain = buildReasoningChainBlock({
    locationData,
    masterDNA,
    projectContext,
  });

  // Build material description with hex colors for interior consistency
  const rawMats =
    masterDNA?.materials || masterDNA?._structured?.style?.materials || [];
  const matDescParts = [];
  if (Array.isArray(rawMats)) {
    for (const mat of rawMats) {
      if (mat.name && mat.hexColor) {
        matDescParts.push(`${mat.name} (${mat.hexColor})`);
      }
    }
  }
  const matDesc =
    matDescParts.length > 0 ? matDescParts.join(", ") : materials.join(", ");

  const prompt = `${matDesc}, ${style} interior, ${identity}

Interior 3D perspective view - main lobby/living space of the SAME building shown in hero exterior.
Building: ${style} ${projectType}
Materials: ${matDesc}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match exterior exactly):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- Photorealistic interior rendering, 8K quality, professional interior photography
- Main entrance lobby or open-plan living/kitchen space
- Natural lighting from windows with visible light rays and shadow patterns on floor
- ${style} interior design language with cohesive material palette
- Furniture layout matching program: sofa arrangement, dining table, kitchen island where applicable
- Material finishes visible at close range: timber flooring grain, wall texture, ceiling detail
- SAME materials and colors as exterior facade (continuity of palette)
- Spatial depth showing multiple rooms/areas through doorways and open connections
- No people, clean professional presentation (Dezeen interior photography standard)
- Openings align with floor plans AND exterior views (window positions MUST match)
- Interior must be consistent with the SAME building shown in hero 3D
- CEILING HEIGHT: ${dims.floors === 1 ? "3.0m ceiling with exposed structure or feature lighting" : "2.7m standard ceiling height"}
- DETAILING: skirting boards, architraves around doors, window sills, visible radiators or underfloor heating grilles
- LIGHTING: combination of natural daylight through windows and subtle recessed downlights

${reasoningChain}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt,
    negativePrompt: `cartoon, sketch, fisheye, low detail, people, cluttered, messy, dark, different building, inconsistent materials, toy model, miniature, CGI render, video game, flat shading, empty white room, unfurnished, bare walls, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build ground floor plan prompt
 */
export function buildGroundFloorPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  programLock,
}) {
  const dims = normalizeDimensions(masterDNA);

  // P0: Use programLock for exact room list when available
  let roomList;
  if (programLock) {
    roomList = getRoomListForLevel(programLock, 0);
    if (!roomList) {
      roomList = "lobby, living, kitchen, services";
    }
  } else {
    const programSpaces = projectContext?.programSpaces || [];
    roomList =
      programSpaces.length > 0
        ? programSpaces.map((p) => p.name || p.type).join(", ")
        : "lobby, living, kitchen, services";
  }

  // Inject fingerprint constraint for cross-panel consistency
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const symbolVocabulary = isFeatureEnabled("layoutReferenceCorpus")
    ? buildRoboflowSymbolVocabularyBlock()
    : "";

  const prompt = `${identity}

Ground floor plan - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${roomList}

${fingerprintConstraint ? `DESIGN FINGERPRINT (building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- All rooms labeled with names and dimensions
- Door swings and window positions shown
- Furniture layout indicated
- Dimension lines for key measurements
- North arrow
- Main entrance clearly marked
${dims.floors > 1 ? "- Staircase shown (multi-storey building)" : "- NO staircase (single storey building)"}
- Align with elevations (window/door positions match)
${symbolVocabulary ? `${symbolVocabulary}\n` : ""}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `${FLOOR_PLAN_NEGATIVE}, messy lines, low contrast, sketch, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build first floor plan prompt
 */
export function buildFirstFloorPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  programLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  // P0: Use programLock for exact room list when available
  let firstFloorProgram;
  if (programLock) {
    const roomList = getRoomListForLevel(programLock, 1);
    firstFloorProgram =
      roomList || "Upper floor spaces (bedrooms, private rooms)";
  } else {
    firstFloorProgram =
      "Upper floor spaces (bedrooms, private rooms, or upper program)";
  }

  // Inject fingerprint constraint for cross-panel consistency
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const symbolVocabulary = isFeatureEnabled("layoutReferenceCorpus")
    ? buildRoboflowSymbolVocabularyBlock()
    : "";

  const prompt = `${identity}

First floor plan (Level 1) - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${firstFloorProgram}

${fingerprintConstraint ? `DESIGN FINGERPRINT (building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- Align staircase with ground floor
- All rooms labeled with dimensions
- Door swings and window positions
- Furniture layout
- Dimension lines
- Vertical circulation (stairs/lifts) in same position as ground floor
- Window positions align with elevations
${symbolVocabulary ? `${symbolVocabulary}\n` : ""}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `${FLOOR_PLAN_NEGATIVE}, messy lines, low contrast, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build second floor plan prompt
 */
export function buildSecondFloorPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  programLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  // P0: Use programLock for exact room list when available
  let secondFloorProgram;
  if (programLock) {
    const roomList = getRoomListForLevel(programLock, 2);
    secondFloorProgram = roomList || "Top floor spaces or roof plan";
  } else {
    secondFloorProgram = "Top floor spaces or roof plan";
  }

  // Inject fingerprint constraint for cross-panel consistency
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const symbolVocabulary = isFeatureEnabled("layoutReferenceCorpus")
    ? buildRoboflowSymbolVocabularyBlock()
    : "";

  const prompt = `${identity}

Second floor plan (Level 2) - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${secondFloorProgram}

${fingerprintConstraint ? `DESIGN FINGERPRINT (building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- Align vertical cores with lower floors
- All rooms labeled
- Roof structure indicated if applicable
- Dimension lines
- Staircase/lift alignment with lower floors
- Window positions align with elevations
${symbolVocabulary ? `${symbolVocabulary}\n` : ""}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `${FLOOR_PLAN_NEGATIVE}, messy lines, low contrast, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build elevation prompt (reusable for all 4 orientations)
 * ENHANCED: Strong fingerprint constraint to match hero_3d facade
 * ENHANCED: Per-facade details (window counts, entrance, materials with hex colors)
 */
export function buildElevationPrompt(orientation) {
  return ({
    masterDNA,
    locationData,
    projectContext,
    consistencyLock,
    geometryHint,
    hasStyleReference,
  }) => {
    const dims = normalizeDimensions(masterDNA);
    const materials = normalizeMaterials(masterDNA);
    const style = masterDNA?.architecturalStyle || "Contemporary";
    const roofType =
      masterDNA?.roof?.type ||
      masterDNA?._structured?.geometry_rules?.roof_type ||
      "gable";
    const dirUpper = orientation.toUpperCase();
    const fingerprintConstraint = injectFingerprintConstraint({
      masterDNA,
      projectContext,
    });
    const geomConstraint = geometryHint?.type
      ? `FOLLOW PROVIDED GEOMETRY: match the ${geometryHint.type} silhouette exactly (roofline, massing, openings).`
      : "Maintain strict orthographic alignment to plans and roofline.";
    const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
    const canonicalIdentityBlock = buildCanonicalIdentitySpecBlock(
      masterDNA,
      projectContext,
    );
    const canonicalFingerprint = buildFingerprintFromDNA(masterDNA, {
      projectGeometry: projectContext?.projectGeometry || null,
      facadeGrammar: projectContext?.facadeGrammar || null,
      portfolioStyle: projectContext?.portfolioStyle || null,
    });

    // Extract per-facade details from DNA
    const facades =
      masterDNA?.viewSpecificFeatures ||
      masterDNA?._structured?.geometry?.facades ||
      {};
    const facadeData = facades[orientation] || {};

    // Build facade-specific details
    let facadeDetails = "";
    const windowCount = facadeData.windows || facadeData.windowCount || "";
    const hasEntrance =
      facadeData.mainEntrance ||
      (Array.isArray(facadeData.features) &&
        facadeData.features.includes("entrance"));
    const patioDoors = facadeData.patioDoors || "";
    const balcony =
      Array.isArray(facadeData.features) &&
      facadeData.features.includes("balcony");

    if (windowCount) {
      facadeDetails += `\n- ${dirUpper} facade windows: ${windowCount} windows`;
    }
    if (hasEntrance) {
      const entranceDesc =
        typeof facadeData.mainEntrance === "string"
          ? facadeData.mainEntrance
          : "main entrance";
      facadeDetails += `\n- MAIN ENTRANCE on this facade: ${entranceDesc}`;
    }
    if (patioDoors) {
      facadeDetails += `\n- Patio doors: ${patioDoors}`;
    }
    if (balcony) {
      facadeDetails += `\n- Balcony on this facade`;
    }

    // Build materials string with hex colors for precision (legacy fallback)
    const rawMats = masterDNA?.materials || [];
    const materialsWithHex = (Array.isArray(rawMats) ? rawMats : [])
      .slice(0, 4)
      .map((m) => {
        if (typeof m === "string") return m;
        const name = m.name || m.type || "material";
        return m.hexColor ? `${name} (${m.hexColor})` : name;
      });
    const materialStr =
      materialsWithHex.length > 0
        ? materialsWithHex.join(", ")
        : materials.join(", ");
    const elevationMaterialSpec = buildMaterialSpecSheet({
      dna: masterDNA,
      projectGeometry: projectContext?.projectGeometry || null,
      facadeGrammar: projectContext?.facadeGrammar || null,
    });
    const elevationMaterialsBlock = (elevationMaterialSpec.lines || []).join(
      "\n",
    );
    const floorHeightsLine = dims.floorHeights
      .map((h, i) => `Floor ${i}: ${h}m`)
      .join(", ");

    const prompt = `${identity}

${dirUpper} elevation - flat orthographic facade view
Style: ${style}
Height: ${dims.height}m (${dims.floors} floor(s))
Footprint: ${dims.length}m x ${dims.width}m
Floor heights: ${floorHeightsLine}
Materials: ${materialStr}
Roof type: ${roofType} (MUST match hero 3D render exactly)
${canonicalIdentityBlock}

CANONICAL MATERIAL SPEC (MUST match elevations on other orientations and sections):
${elevationMaterialsBlock || materialStr}

${fingerprintConstraint ? `DESIGN FINGERPRINT - MATCH HERO 3D EXACTLY:\n${fingerprintConstraint}\n` : ""}
CRITICAL CONSISTENCY RULES:
- This elevation MUST show THE SAME building as the hero 3D render
- Roof profile: ${roofType} - EXACT SAME shape as hero
- Materials: ${canonicalFingerprint.materialsPalette.map((entry) => `${entry.name} ${entry.hexColor}`).join(", ")} - EXACT SAME colors as hero
- Building height and proportions: MUST match hero
${facadeDetails || `- Window count and positions: MUST match hero facade visible from this orientation`}

REQUIREMENTS:
- FLAT ORTHOGRAPHIC VIEW (NO perspective, NO angled view)
- Show complete facade from grade to roofline
- Window and door positions (align with floor plans AND hero 3D)
- Material indications and textures (SAME as hero 3D)
- Facade articulation and depth
- Dimension lines for height and key features
- Grade line at base
- Roof form and details (MUST match hero 3D roof exactly)
- Clean technical drawing with proper line weights
- ${geomConstraint}
- ${hasEntrance ? `Main entrance on this (${orientation}) facade` : dirUpper === "NORTH" ? "Main entrance if north-facing" : ""}
- FLOOR COUNT: EXACTLY ${dims.floors} visible floor level(s). ${dims.floors === 1 ? "Single row of windows only. NO upper floor windows." : `${dims.floors} rows of windows clearly visible.`}
- BUILDING HEIGHT: Total ${dims.height}m from grade to roof ridge.
- ROOF PROFILE: ${roofType} roof. ${roofType === "flat" ? "Horizontal parapet line. NO pitched roof." : roofType === "gable" ? "Triangular gable profile visible." : ""}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

    // When a style reference (hero init_image) is active, use RENDER_STYLE_SUFFIX
    // to avoid conflicting signals (init_image says "photorealistic brick" while
    // DRAWING_STYLE_SUFFIX says "clean black lines on white"). Without style ref,
    // use DRAWING_STYLE_SUFFIX for clean technical drawings.
    const styleSuffix = hasStyleReference
      ? RENDER_STYLE_SUFFIX
      : DRAWING_STYLE_SUFFIX;

    return {
      prompt: `${prompt}\nSTYLE: ${styleSuffix}`,
      negativePrompt: `${ELEVATION_NEGATIVE}, fisheye, sketchy, different roof type, different building, inconsistent design, ${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
    };
  };
}

/**
 * Build section A-A prompt (longitudinal)
 */
export function buildSectionAAPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const floorHeights = dims.floorHeights
    .map((h, i) => `Floor ${i}: ${h}m`)
    .join(", ");
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const materialSpec = buildMaterialSpecSheet({
    dna: masterDNA,
    projectGeometry: projectContext?.projectGeometry || null,
    facadeGrammar: projectContext?.facadeGrammar || null,
  });
  const materialsBlock = (materialSpec.lines || []).join("\n");
  const fallbackMaterials = normalizeMaterials(masterDNA).join(", ");

  const prompt = `${identity}

Section A-A (longitudinal) - orthographic building section
Total height: ${dims.height}m (${dims.floors} floor(s))
Footprint: ${dims.length}m x ${dims.width}m
Floor heights: ${floorHeights}
Roof type: ${roofType}
Materials (canonical, MUST match elevations and hero 3D):
${materialsBlock || fallbackMaterials}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE ORTHOGRAPHIC SECTION (NOT perspective)
- Cut through entrance and main circulation
- Show all floor levels with slab thickness at the heights listed above
- Staircase visible in section
- Ceiling heights labeled in mm
- Foundation and roof structure (${roofType} - MUST match hero)
- Material poche / hatch keyed to the canonical hex colours above
- Dimension lines for floor-to-floor heights and overall height
- Window head and sill heights aligned with elevations
- Interior spaces visible in section
- Clean technical drawing style

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `${SECTION_NEGATIVE}, low contrast, messy lines, different roof type, different building, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build section B-B prompt (transverse)
 */
export function buildSectionBBPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const floorHeights = dims.floorHeights
    .map((h, i) => `Floor ${i}: ${h}m`)
    .join(", ");
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const materialSpec = buildMaterialSpecSheet({
    dna: masterDNA,
    projectGeometry: projectContext?.projectGeometry || null,
    facadeGrammar: projectContext?.facadeGrammar || null,
  });
  const materialsBlock = (materialSpec.lines || []).join("\n");
  const fallbackMaterials = normalizeMaterials(masterDNA).join(", ");

  const prompt = `${identity}

Section B-B (transverse/cross section) - orthographic building section
Width: ${dims.width}m
Total height: ${dims.height}m (${dims.floors} floor(s))
Footprint: ${dims.length}m x ${dims.width}m
Floor heights: ${floorHeights}
Roof type: ${roofType}
Materials (canonical, MUST match Section A-A and elevations):
${materialsBlock || fallbackMaterials}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE ORTHOGRAPHIC SECTION (NOT perspective)
- Cut perpendicular to Section A-A
- Building profile MUST match Section A-A (same roof height, same floor levels)
- Show structural grid if applicable
- All floor levels with slab thickness at the heights listed above
- Window openings in section, head/sill heights aligned with elevations
- Ceiling heights labeled in mm
- Foundation and roof structure (${roofType} - MUST match hero)
- Material poche / hatch keyed to the canonical hex colours above
- Dimension lines for floor-to-floor heights and overall height
- Align with elevations (window positions match)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `${SECTION_NEGATIVE}, low contrast, messy lines, different roof type, different building, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build material palette prompt
 */
export function buildMaterialPalettePrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const materials = normalizeMaterials(masterDNA);
  const materialSpecSheet = buildMaterialSpecSheet({
    dna: masterDNA,
    projectGeometry: projectContext?.projectGeometry || null,
    facadeGrammar: projectContext?.facadeGrammar || null,
  });
  const canonicalIdentityBlock = buildCanonicalIdentitySpecBlock(
    masterDNA,
    projectContext,
  );

  const prompt = `Material palette board - architectural materials presentation for a ${projectContext?.buildingProgram || "residential"} project
Materials: ${materials.join(", ")}
${canonicalIdentityBlock}
CANONICAL SPEC:
${materialSpecSheet.lines.join("\n")}

REQUIREMENTS:
- Display as color swatches in grid layout
- Each material shown as rectangular swatch
- Material name labeled below each swatch
- Hex color codes visible for each material
- Texture indication (smooth, rough, etc.)
- Application notes (exterior walls, roof, etc.)
- Professional material board presentation
- Clean flat 2D layout (NO perspective)
- High contrast for readability
- Typography: clean sans-serif labels

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt:
      "perspective, 3d, photorealistic materials, cluttered, messy layout, low contrast, blurry",
  };
}

/**
 * Build climate card prompt
 */
export function buildClimateCardPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const climate = locationData?.climate || { type: "temperate oceanic" };
  const climateType = climate.type || "temperate oceanic";
  const location = locationData?.address || "Site location";
  const sunPath = locationData?.sunPath || {};
  const orientation = sunPath.optimalOrientation || 180;

  const prompt = `Climate analysis card - environmental data infographic
Location: ${location}
Climate: ${climateType}
Optimal orientation: ${orientation}°

REQUIREMENTS:
- Solar orientation diagram with compass rose
- Sun path diagram (summer and winter solstice paths)
- Seasonal temperature ranges (bar chart or graph)
- Precipitation data (monthly averages)
- Wind rose diagram showing prevailing winds
- Energy performance indicators
- Sustainability features summary
- Professional infographic style
- Clean data visualization with icons
- Flat 2D presentation (NO perspective)
- High contrast for readability
- Color-coded data (warm/cool colors for temperature)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt:
      "perspective, 3d, photorealistic, cluttered data, messy charts, low readability, blurry",
  };
}

/**
 * Build axonometric 3D view prompt
 * ENHANCED: Strong fingerprint constraint - axonometric MUST match hero massing exactly
 */
export function buildAxonometricPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  geometryHint,
  hasStyleReference,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const geomConstraint = geometryHint?.type
    ? `FOLLOW PROVIDED GEOMETRY silhouette (${geometryHint.type}) for massing and roofline.`
    : "Keep massing consistent with plans and elevations.";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const reasoningChain = buildReasoningChainBlock({
    locationData,
    masterDNA,
    projectContext,
  });

  const prompt = `${identity}

Axonometric 3D projection view - architectural isometric
Building: ${style} ${projectType}
Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)
Materials: ${materials.join(", ")}
Roof type: ${roofType}

${fingerprintConstraint ? `DESIGN FINGERPRINT - MATCH HERO 3D EXACTLY:\n${fingerprintConstraint}\n` : ""}
CRITICAL: This axonometric MUST show THE EXACT SAME building as the hero 3D render:
- SAME roof type and pitch: ${roofType}
- SAME building massing and proportions
- SAME materials and colors
- SAME window arrangement

REQUIREMENTS:
- TRUE AXONOMETRIC/ISOMETRIC PROJECTION (30° or 45° angle)
- Equal scale on all axes (no perspective distortion)
- View from above showing roof form (MUST match hero roof exactly)
- All four facades partially visible (MUST match hero facades)
- Material textures indicated (SAME as hero)
- Building massing clearly readable
- Shows relationship between plan and volume
- Clean technical drawing style
- No context/background (isolated building)
- ${geomConstraint}
- FLOOR COUNT: EXACTLY ${dims.floors} floor(s) visible from above. ${dims.floors === 1 ? "SINGLE STOREY — low horizontal massing, NO upper floor." : ""}
- ROOF: ${roofType} roof. ${roofType === "flat" ? "Flat horizontal top." : roofType === "gable" ? "Gable ridge line visible." : ""}

${reasoningChain}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${RENDER_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `perspective view, vanishing points, context clutter, people, cars, sketchy, different building, different roof, inconsistent design, ${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build schedules and notes prompt
 */
export function buildSchedulesNotesPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const projectType = projectContext?.buildingProgram || "residential";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const programSpaces = projectContext?.programSpaces || [];
  const rooms = masterDNA?.rooms || programSpaces;

  // Build room schedule data
  const roomSchedule =
    rooms.length > 0
      ? rooms
          .map(
            (r, i) =>
              `${i + 1}. ${r.name || r.type}: ${r.area || r.dimensions || "TBD"}`,
          )
          .slice(0, 10)
          .join("\n")
      : "1. Living Room: 35m²\n2. Kitchen: 20m²\n3. Bedroom 1: 18m²\n4. Bathroom: 8m²";

  const prompt = `${identity}

Schedules and notes panel - CRISP BLACK TEXT ON WHITE BACKGROUND
Project type: ${projectType}
Building: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)

ROOM SCHEDULE:
${roomSchedule}

MATERIALS:
${materials.map((m, i) => `${i + 1}. ${m}`).join("\n")}

REQUIREMENTS:
- MAXIMUM CONTRAST: Pure black text (#000000) on pure white (#FFFFFF)
- LARGE BOLD TEXT: clearly readable at arm's length
- NO faint or light grey text - ALL text must be bold black
- Clean tabular layout for room schedule
- Column headers: Room Name, Area (m²), Floor Level, Notes
- Material finishes schedule table
- Door and window schedules (if applicable)
- General notes section with standard construction notes
- Abbreviations legend
- Professional typography (sans-serif, BOLD weight)
- Grid-based table layout with solid black lines
- Flat 2D presentation (NO perspective)
- A1 sheet formatting conventions

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt:
      "perspective, 3d, photorealistic, messy layout, handwritten, low contrast, blurry text, faint text, light grey text, gradient background",
  };
}

/**
 * Panel prompt builders map
 */
export const PANEL_PROMPT_BUILDERS = {
  site_diagram: buildSiteDiagramPrompt,
  site_plan: buildSitePlanPrompt,
  hero_3d: buildHero3DPrompt,
  interior_3d: buildInterior3DPrompt,
  axonometric: buildAxonometricPrompt,
  floor_plan_ground: buildGroundFloorPrompt,
  floor_plan_first: buildFirstFloorPrompt,
  floor_plan_level2: buildSecondFloorPrompt,
  elevation_north: buildElevationPrompt("north"),
  elevation_south: buildElevationPrompt("south"),
  elevation_east: buildElevationPrompt("east"),
  elevation_west: buildElevationPrompt("west"),
  section_AA: buildSectionAAPrompt,
  section_BB: buildSectionBBPrompt,
  schedules_notes: buildSchedulesNotesPrompt,
  material_palette: buildMaterialPalettePrompt,
  climate_card: buildClimateCardPrompt,
};

/**
 * Build prompt for a specific panel type
 *
 * @param {string} panelType - Panel type identifier
 * @param {Object} context - Context for prompt generation
 * @returns {Object} { prompt, negativePrompt }
 */
export function buildPanelPrompt(panelType, context) {
  const builder = PANEL_PROMPT_BUILDERS[panelType];

  if (!builder) {
    logger.warn(`No prompt builder found for panel type: ${panelType}`);
    return {
      prompt: `Panel ${panelType} for architectural presentation`,
      negativePrompt: "low quality, blurry, watermark",
    };
  }

  return builder(context);
}

export default {
  PANEL_PROMPT_BUILDERS,
  buildPanelPrompt,
  buildFingerprintConstraint,
  buildSiteDiagramPrompt,
  buildSitePlanPrompt,
  buildHero3DPrompt,
  buildInterior3DPrompt,
  buildAxonometricPrompt,
  buildGroundFloorPrompt,
  buildFirstFloorPrompt,
  buildSecondFloorPrompt,
  buildElevationPrompt,
  buildSectionAAPrompt,
  buildSectionBBPrompt,
  buildSchedulesNotesPrompt,
  buildMaterialPalettePrompt,
  buildClimateCardPrompt,
};
