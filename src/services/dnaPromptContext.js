/**
 * DNA Prompt Context Builder — CANONICAL PROMPT CONTEXT
 *
 * Single source of truth for structured DNA context embedded in generation
 * prompts. Builds compact JSON with material hex colors, dimensions, facade
 * details, and floor heights. Re-exported by design/dnaPromptContext.js (adapter).
 *
 * Ensures reproducibility by using sorted keys and compact format.
 */

import { extractStructuredDNA } from "./dnaSchema.js";
import logger from "../utils/logger.js";
import { computeCDSHashSync } from "./validation/cdsHash.js";
import { getCanonicalMaterialPalette } from "./design/canonicalMaterialPalette.js";

export const SHEET_DESIGN_CONTEXT_VERSION = "sheet-design-context-v1";

export const SHEET_DESIGN_CONTEXT_KEYS = Object.freeze([
  "version",
  "projectGraphId",
  "geometryHash",
  "style",
  "materials",
  "climate",
  "portfolioBlend",
  "programSpaces",
  "region",
  "sustainability",
  "designFingerprint",
  "visualManifest",
  "contextHash",
]);

const REQUIRED_SHEET_DESIGN_CONTEXT_KEYS = Object.freeze([
  "version",
  "geometryHash",
  "materials",
  "style",
  "visualManifest",
  "contextHash",
]);

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

function nullIfBlank(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function asNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseMaterialEntry(entry, fallbackApplication = null) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return {
      name: trimmed,
      hexColor: null,
      application: fallbackApplication,
      role: null,
      hatch: null,
    };
  }
  const name =
    nullIfBlank(entry.name || entry.type || entry.material) || "material";
  const hex =
    nullIfBlank(entry.hexColor) ||
    nullIfBlank(entry.hex) ||
    nullIfBlank(entry.color_hex) ||
    nullIfBlank(entry.color) ||
    null;
  const application =
    nullIfBlank(entry.application) ||
    nullIfBlank(entry.use) ||
    nullIfBlank(entry.coverage) ||
    fallbackApplication;
  return {
    name,
    hexColor: hex,
    application: application || null,
    role: nullIfBlank(entry.role) || null,
    hatch: nullIfBlank(entry.hatch) || null,
  };
}

function normaliseMaterialList(rawList, fallbackApplication = null) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((entry) => normaliseMaterialEntry(entry, fallbackApplication))
    .filter(Boolean);
}

function resolveCanonicalMaterials({ masterDNA, compiledProject, localStyle }) {
  // Prefer the canonical palette (Phase 8 SSOT) when it can be derived.
  try {
    const canonical = getCanonicalMaterialPalette({
      dna: masterDNA || {},
      projectGeometry: compiledProject || {},
      facadeGrammar:
        compiledProject?.facadeGrammar || localStyle?.facade_grammar || {},
    });
    if (
      canonical &&
      Array.isArray(canonical.entries) &&
      canonical.entries.length > 0
    ) {
      return canonical.entries
        .map((entry) =>
          normaliseMaterialEntry(
            {
              name: entry.name,
              hexColor: entry.hexColor,
              application: entry.application,
              role: entry.role,
              hatch: entry.hatch,
            },
            entry.application || null,
          ),
        )
        .filter(Boolean);
    }
  } catch (err) {
    logger.warn?.(
      "buildSheetDesignContext: canonical palette derivation failed; falling back",
      { error: err?.message || String(err) },
    );
  }
  // Fallbacks: localStyle.material_palette > masterDNA.materials
  const fromLocalStyle = normaliseMaterialList(
    localStyle?.material_palette,
    null,
  );
  if (fromLocalStyle.length > 0) return fromLocalStyle;
  const fromDNA = normaliseMaterialList(masterDNA?.materials, null);
  return fromDNA;
}

function deriveStyleDescriptor({ masterDNA, localStyle, styleDNA }) {
  const structured = masterDNA?._structured || null;
  const architecture =
    nullIfBlank(structured?.style?.architecture) ||
    nullIfBlank(masterDNA?.style?.architecture) ||
    nullIfBlank(localStyle?.primary_style) ||
    nullIfBlank(styleDNA?.style_name) ||
    "contemporary";
  const facadeLanguage =
    nullIfBlank(styleDNA?.facade_language) ||
    nullIfBlank(localStyle?.facade_language) ||
    nullIfBlank(structured?.style?.facade_language) ||
    null;
  const roofLanguage =
    nullIfBlank(styleDNA?.roof_language) ||
    nullIfBlank(localStyle?.roof_language) ||
    null;
  const massingLanguage =
    nullIfBlank(styleDNA?.massing_language) ||
    nullIfBlank(localStyle?.massing_language) ||
    null;
  const windowLanguage =
    nullIfBlank(styleDNA?.window_language) ||
    nullIfBlank(localStyle?.window_language) ||
    null;
  const keywords = [];
  for (const list of [
    styleDNA?.precedent_keywords,
    styleDNA?.keywords,
    localStyle?.style_keywords,
    localStyle?.keywords,
  ]) {
    if (Array.isArray(list)) {
      for (const kw of list) {
        if (typeof kw === "string" && kw.trim()) {
          keywords.push(kw.trim());
        }
      }
    }
  }
  return {
    architecture,
    facadeLanguage,
    roofLanguage,
    massingLanguage,
    windowLanguage,
    descriptor: [architecture, massingLanguage, facadeLanguage]
      .filter(Boolean)
      .join(" — "),
    keywords: Array.from(new Set(keywords)).slice(0, 8),
  };
}

function deriveClimateSummary(climate) {
  if (!climate || typeof climate !== "object") return null;
  const zone =
    nullIfBlank(climate.zone) ||
    nullIfBlank(climate.koppen) ||
    nullIfBlank(climate.climateZone) ||
    null;
  const rainfall =
    asNumberOrNull(climate.rainfall_mm) ??
    asNumberOrNull(climate.annual_rainfall_mm) ??
    asNumberOrNull(climate.precipitation_mm);
  return {
    zone,
    rainfallMm: rainfall,
    rainfallBand:
      nullIfBlank(climate.rainfall_band) ||
      nullIfBlank(climate.rainfallBand) ||
      (rainfall !== null ? `${rainfall}mm/yr` : null),
    sunPathSummary:
      nullIfBlank(climate.sunPath?.summary) ||
      nullIfBlank(climate.sun_path?.summary) ||
      nullIfBlank(climate.sunPathSummary) ||
      null,
    overheating: Boolean(climate.overheating || climate.overheating_flag),
    strategy:
      nullIfBlank(climate.strategy) ||
      nullIfBlank(climate.design_strategy) ||
      null,
  };
}

function derivePortfolioBlend({ localStyle }) {
  const weights = localStyle?.style_weights || localStyle?.weights || null;
  if (!weights || typeof weights !== "object") return null;
  const out = {
    localWeight: asNumberOrNull(weights.local ?? weights.localWeight),
    portfolioWeight: asNumberOrNull(
      weights.portfolio ?? weights.portfolioWeight,
    ),
    climateWeight: asNumberOrNull(weights.climate ?? weights.climateWeight),
    userWeight: asNumberOrNull(weights.user ?? weights.userWeight),
  };
  if (
    out.localWeight === null &&
    out.portfolioWeight === null &&
    out.climateWeight === null &&
    out.userWeight === null
  ) {
    return null;
  }
  return out;
}

function deriveProgramSpaces({ programmeSummary, masterDNA }) {
  const fromSummary = Array.isArray(programmeSummary?.rooms)
    ? programmeSummary.rooms
    : Array.isArray(programmeSummary?.levels)
      ? programmeSummary.levels.flatMap((lvl) =>
          Array.isArray(lvl?.rooms) ? lvl.rooms : [],
        )
      : [];
  const fromDNA = Array.isArray(masterDNA?._structured?.program?.rooms)
    ? masterDNA._structured.program.rooms
    : Array.isArray(masterDNA?.rooms)
      ? masterDNA.rooms
      : [];
  const source = fromSummary.length > 0 ? fromSummary : fromDNA;
  return source
    .map((room) => {
      if (!room) return null;
      const name = nullIfBlank(room.name || room.type) || null;
      if (!name) return null;
      return {
        name,
        area_m2: asNumberOrNull(room.area_m2 ?? room.area),
        level: nullIfBlank(room.floor || room.level) || null,
      };
    })
    .filter(Boolean)
    .slice(0, 32);
}

function deriveSustainability({ regulations, climate }) {
  if (!regulations && !climate) return null;
  const partL =
    nullIfBlank(regulations?.partL) ||
    nullIfBlank(regulations?.part_l) ||
    nullIfBlank(regulations?.partL_summary) ||
    null;
  return {
    partL,
    overheating: Boolean(climate?.overheating || climate?.overheating_flag),
    fabricFirst: Boolean(
      regulations?.fabric_first ||
      regulations?.fabricFirst ||
      regulations?.fabricFirstStrategy,
    ),
    flags: Array.isArray(regulations?.flags) ? regulations.flags.slice() : [],
  };
}

/**
 * Build the canonical Sheet Design Context.
 *
 * One frozen object built once per ProjectGraph generation. Every panel
 * renderer (technical SVG, image-model panels, data panels) is intended to
 * consume this same object so style + material + climate + portfolio +
 * program flow coherently to every panel on the A1 sheet.
 *
 * Phase 1 introduces this contract WITHOUT changing render output. The
 * artifact is surfaced for inspection and future consumers; existing callers
 * that ignore it continue to work unchanged.
 *
 * The returned object is deep-frozen and includes a stable `contextHash`
 * computed over the deterministic subset (excluding `visualManifest` which
 * already carries its own `manifestHash`).
 *
 * @param {object} options
 * @param {object} [options.masterDNA]         - master DNA snapshot
 * @param {object} [options.brief]             - normalised brief
 * @param {object} [options.compiledProject]   - compiled geometry (authority)
 * @param {object} [options.climate]           - climate pack
 * @param {object} [options.localStyle]        - regional vernacular pack
 * @param {object} [options.styleDNA]          - generated style DNA
 * @param {object} [options.regulations]      - regulation pack
 * @param {object} [options.programmeSummary]  - per-level programme summary
 * @param {string} [options.region]            - region label
 * @param {string} [options.projectGraphId]    - project graph identifier
 * @param {object} [options.visualManifest]    - Phase D visual manifest
 * @param {object} [options.designFingerprint] - optional design fingerprint
 * @returns {Readonly<object>} deep-frozen SheetDesignContext
 */
export function buildSheetDesignContext({
  masterDNA = null,
  brief = null,
  compiledProject = null,
  climate = null,
  localStyle = null,
  styleDNA = null,
  regulations = null,
  programmeSummary = null,
  region = null,
  projectGraphId = null,
  visualManifest = null,
  designFingerprint = null,
} = {}) {
  const geometryHash =
    nullIfBlank(compiledProject?.geometryHash) ||
    nullIfBlank(compiledProject?.geometry_hash) ||
    nullIfBlank(visualManifest?.geometryHash) ||
    null;
  const resolvedProjectGraphId =
    nullIfBlank(projectGraphId) ||
    nullIfBlank(visualManifest?.projectGraphId) ||
    nullIfBlank(brief?.project_graph_id) ||
    null;
  const materials = resolveCanonicalMaterials({
    masterDNA,
    compiledProject,
    localStyle,
  });
  const style = deriveStyleDescriptor({ masterDNA, localStyle, styleDNA });
  const climateSummary = deriveClimateSummary(climate);
  const portfolioBlend = derivePortfolioBlend({ localStyle });
  const programSpaces = deriveProgramSpaces({ programmeSummary, masterDNA });
  const sustainability = deriveSustainability({ regulations, climate });
  const resolvedRegion = nullIfBlank(region) || null;

  // Deterministic subset for hashing — visualManifest is referenced by hash
  // (it carries its own deterministic manifestHash), so we include only the
  // hash to avoid double-hashing the entire manifest into our context hash.
  const hashable = {
    version: SHEET_DESIGN_CONTEXT_VERSION,
    projectGraphId: resolvedProjectGraphId,
    geometryHash,
    style: {
      architecture: style.architecture,
      facadeLanguage: style.facadeLanguage,
      roofLanguage: style.roofLanguage,
      massingLanguage: style.massingLanguage,
      windowLanguage: style.windowLanguage,
      descriptor: style.descriptor,
      keywords: style.keywords,
    },
    materials,
    climate: climateSummary,
    portfolioBlend,
    programSpaces,
    region: resolvedRegion,
    sustainability,
    visualManifestHash: visualManifest?.manifestHash || null,
  };
  const contextHash = computeCDSHashSync(hashable);

  const ctx = {
    version: SHEET_DESIGN_CONTEXT_VERSION,
    projectGraphId: resolvedProjectGraphId,
    geometryHash,
    style,
    materials,
    climate: climateSummary,
    portfolioBlend,
    programSpaces,
    region: resolvedRegion,
    sustainability,
    designFingerprint: designFingerprint || null,
    visualManifest: visualManifest || null,
    contextHash,
  };
  return deepFreeze(ctx);
}

/**
 * Soft validator for SheetDesignContext.
 *
 * Phase 1 is **warn-only**: returns a structured report instead of throwing,
 * so existing callers that do not yet pass a SheetDesignContext keep working.
 * Later phases may flip `strict` to true once every consumer is migrated.
 *
 * @param {object|null} ctx
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - when true, throws on the first
 *   missing required key. Phase 1 callers should leave this false.
 * @returns {{ ok: boolean, gaps: string[], warnings: string[], frozen: boolean }}
 */
export function assertSheetDesignContext(ctx, { strict = false } = {}) {
  const warnings = [];
  const gaps = [];
  if (!ctx || typeof ctx !== "object") {
    const message = "SheetDesignContext is missing or not an object";
    warnings.push(message);
    if (strict) {
      throw new Error(message);
    }
    logger.warn?.(`assertSheetDesignContext: ${message}`);
    return { ok: false, gaps: ["context"], warnings, frozen: false };
  }
  const frozen = Object.isFrozen(ctx);
  if (!frozen) {
    warnings.push("SheetDesignContext is not frozen (expected deep-frozen)");
  }
  for (const key of REQUIRED_SHEET_DESIGN_CONTEXT_KEYS) {
    const value = ctx[key];
    const missing =
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0);
    if (missing) {
      gaps.push(key);
    }
  }
  if (ctx.version && ctx.version !== SHEET_DESIGN_CONTEXT_VERSION) {
    warnings.push(
      `SheetDesignContext version mismatch: expected ${SHEET_DESIGN_CONTEXT_VERSION}, got ${ctx.version}`,
    );
  }
  const ok = gaps.length === 0 && warnings.length === 0;
  if (!ok) {
    const message = `assertSheetDesignContext: gaps=[${gaps.join(",")}] warnings=[${warnings.join(
      "; ",
    )}]`;
    if (strict && gaps.length > 0) {
      throw new Error(message);
    }
    logger.warn?.(message);
  }
  return { ok, gaps, warnings, frozen };
}

/**
 * Build structured DNA context for prompts
 * Returns a compact JSON block with essential DNA fields including concrete
 * architectural values (hex colors, dimensions, facade details, heights).
 */
export function buildStructuredDNAContext(masterDNA) {
  if (!masterDNA) {
    logger.warn("buildStructuredDNAContext: No DNA provided");
    return "{}";
  }

  // Extract structured DNA (handles both new and legacy formats)
  const structured = masterDNA._structured || extractStructuredDNA(masterDNA);

  // Extract concrete dimensions from DNA
  const dims = masterDNA.dimensions || {};

  // Extract materials with hex colors and applications (not just names)
  const rawMaterials = masterDNA.materials || structured.style?.materials || [];
  const enrichedMaterials = (Array.isArray(rawMaterials) ? rawMaterials : [])
    .slice(0, 8)
    .map((mat) => {
      if (typeof mat === "string") return { name: mat };
      return {
        name: mat.name || mat.type || "material",
        hex: mat.hexColor || mat.color || undefined,
        use: mat.application || mat.coverage || undefined,
      };
    });

  // Extract facade-specific details (window counts, entrance, features)
  const facades =
    structured.geometry?.facades || masterDNA.viewSpecificFeatures || {};
  const facadeContext = {};
  for (const dir of ["north", "south", "east", "west"]) {
    const f = facades[dir];
    if (f) {
      facadeContext[dir] = {
        windows: f.windows || f.windowCount || undefined,
        entrance:
          f.mainEntrance ||
          (f.features?.includes?.("entrance") ? "yes" : undefined),
        features: Array.isArray(f.features)
          ? f.features.join(", ")
          : f.patioDoors || undefined,
      };
    }
  }

  // Extract actual floor heights from geometry DNA
  const geomHeights = structured.geometry?.heights || {};
  const dnaFloorHeights = dims.floorHeights || [];
  const heights = {
    ground: geomHeights.ground_floor_m || dnaFloorHeights[0] || 3.0,
    upper: geomHeights.upper_floors_m || dnaFloorHeights[1] || 2.7,
  };

  // Extract rooms with dimensions and window counts
  const rooms = (structured.program?.rooms || masterDNA.rooms || [])
    .map((room) => {
      const entry = {
        name: room.name,
        area: room.area_m2 || room.area || 0,
        floor: room.floor,
      };
      // Include room dimensions if available (e.g., "5.5m x 4.0m")
      if (room.dimensions) entry.dims = room.dimensions;
      if (room.windows != null) entry.windows = room.windows;
      return entry;
    })
    .slice(0, 15); // Increased cap for more complete program info

  // Extract roof pitch from geometry DNA
  const roofPitch =
    structured.geometry?.roof?.pitch_degrees ||
    masterDNA.roof?.pitch ||
    undefined;

  // Build compact context with sorted keys for stability
  const context = {
    // Building dimensions
    dimensions: {
      length: dims.length || 0,
      width: dims.width || 0,
      height: dims.height || dims.totalHeight || 0,
      floors: dims.floors || dims.floorCount || structured.program?.floors || 2,
    },

    // Floor heights (actual from DNA, not hardcoded)
    heights,

    // Site context
    site: {
      area_m2: structured.site?.area_m2 || 0,
      climate: structured.site?.climate_zone || "temperate",
      orientation: structured.site?.sun_path || "south",
    },

    // Program context
    program: {
      floors: structured.program?.floors || 2,
      rooms,
    },

    // Style context with enriched materials
    style: {
      architecture: structured.style?.architecture || "contemporary",
      materials: enrichedMaterials,
      windows: structured.style?.windows?.pattern || "regular grid",
    },

    // Facade-specific details (window counts, entrance, features per orientation)
    facades: Object.keys(facadeContext).length > 0 ? facadeContext : undefined,

    // Geometry rules
    geometry: {
      roof: structured.geometry_rules?.roof_type || "gable",
      roof_pitch: roofPitch,
      grid: structured.geometry_rules?.grid || "1m",
      span: structured.geometry_rules?.max_span || "6m",
    },
  };

  // Remove undefined values for cleaner JSON
  const clean = JSON.parse(JSON.stringify(context));

  // Return compact JSON string (sorted keys)
  return JSON.stringify(clean, Object.keys(clean).sort(), 0);
}

/**
 * Build 3D panel prompt template
 * For hero views, interior, site diagrams
 */
export function build3DPanelPrompt(panelType, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);

  const basePrompt = `Generate a photorealistic 3D ${panelType.replace(/_/g, " ")} of the SAME HOUSE defined in this DNA:

${dnaContext}

STRICT RULES:
- Do NOT change building shape, dimensions, or proportions
- Do NOT change window count or positions
- Do NOT change roof type or pitch
- Do NOT change materials or colors
- Do NOT invent new architectural features
- Maintain exact consistency with the DNA specification

${additionalContext}

Style: Photorealistic architectural rendering, professional quality, natural lighting.`;

  return basePrompt;
}

/**
 * Build 2D floor plan prompt template
 * For ground, first, second floor plans
 */
export function buildPlanPrompt(level, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  // Filter rooms for this level
  const levelRooms = (structured.program?.rooms || []).filter(
    (r) => r.floor === level || (level === "ground" && !r.floor),
  );

  const roomList = levelRooms
    .map((r) => `${r.name}: ${r.area_m2 || r.area || 0}m²`)
    .join(", ");

  const basePrompt = `Generate a clean black and white architectural FLOOR PLAN for ${level} floor of the SAME HOUSE defined in this DNA:

${dnaContext}

FLOOR PLAN REQUIREMENTS FOR ${level.toUpperCase()} FLOOR:
- Rooms: ${roomList || "As per DNA"}
- Total area: ${levelRooms.reduce((sum, r) => sum + (r.area_m2 || r.area || 0), 0)}m²
- Keep global footprint identical to DNA
- Maintain consistent wall thickness (0.3m exterior, 0.15m interior)
- Position doors and windows exactly according to DNA
- No invented rooms or spaces
- TRUE OVERHEAD ORTHOGRAPHIC VIEW (not perspective, not 3D, not isometric)

${additionalContext}

Style: Clean black and white line drawing, architectural standard, dimension lines, room labels.

NEGATIVE: (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic, shading, shadows`;

  return basePrompt;
}

/**
 * Build elevation prompt template
 * For north, south, east, west elevations
 */
export function buildElevationPrompt(direction, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  // Extract facade-specific details for this direction
  const facades =
    structured.geometry?.facades || dna.viewSpecificFeatures || {};
  const facadeData = facades[direction] || {};
  const windowCount = facadeData.windows || facadeData.windowCount || "";
  const hasEntrance =
    facadeData.mainEntrance || facadeData.features?.includes?.("entrance");
  const facadeFeatures = Array.isArray(facadeData.features)
    ? facadeData.features.join(", ")
    : "";

  // Build facade-specific window/entrance description
  let facadeDesc = `- Direction: ${direction} facade`;
  if (windowCount) facadeDesc += `\n- Window count: ${windowCount} windows`;
  if (hasEntrance) facadeDesc += `\n- Main entrance on this facade`;
  if (facadeFeatures) facadeDesc += `\n- Features: ${facadeFeatures}`;

  // Extract materials with hex colors
  const rawMats = dna.materials || structured.style?.materials || [];
  const materialDesc =
    (Array.isArray(rawMats) ? rawMats : [])
      .slice(0, 4)
      .map((m) => {
        if (typeof m === "string") return m;
        const name = m.name || m.type || "material";
        return m.hexColor ? `${name} (${m.hexColor})` : name;
      })
      .join(", ") || "As per DNA";

  const basePrompt = `Generate ${direction.toUpperCase()} ELEVATION of the SAME HOUSE defined in this DNA:

${dnaContext}

ELEVATION REQUIREMENTS:
${facadeDesc}
- Materials: ${materialDesc}
- Roof: ${structured.geometry_rules?.roof_type || "gable"}
- FLAT ORTHOGRAPHIC VIEW (no perspective distortion)
- Maintain exact proportions from DNA
- Show true heights and widths

${additionalContext}

Style: Clean architectural elevation drawing, black and white line work, dimension lines.

NEGATIVE: (perspective:1.3), (3D:1.3), photorealistic, shading, shadows`;

  return basePrompt;
}

/**
 * Build section prompt template
 * For longitudinal and cross sections
 */
export function buildSectionPrompt(sectionType, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  // Use actual DNA floor heights instead of hardcoded values
  const geomHeights = structured.geometry?.heights || {};
  const dnaFloorHeights = dna.dimensions?.floorHeights || [];
  const groundHeight = geomHeights.ground_floor_m || dnaFloorHeights[0] || 3.0;
  const upperHeight = geomHeights.upper_floors_m || dnaFloorHeights[1] || 2.7;

  const basePrompt = `Generate ${sectionType.toUpperCase()} SECTION of the SAME HOUSE defined in this DNA:

${dnaContext}

SECTION REQUIREMENTS:
- Type: ${sectionType} section (${sectionType === "longitudinal" ? "along length" : "across width"})
- Floors: ${structured.program?.floors || 2}
- Floor heights: ${groundHeight}m ground, ${upperHeight}m upper
- Show interior spaces, floor structures, roof structure
- Cut through building to reveal interior
- FLAT ORTHOGRAPHIC VIEW (no perspective)
- Dimension lines showing heights

${additionalContext}

Style: Clean architectural section drawing, black and white, hatching for cut elements, dimension lines.

NEGATIVE: perspective, 3D, photorealistic, exterior view`;

  return basePrompt;
}

/**
 * Build negative prompt for panel type
 */
export function buildNegativePrompt(panelType) {
  const is2D =
    panelType.includes("floor_plan") ||
    panelType.includes("elevation") ||
    panelType.includes("section");

  if (is2D) {
    return "(low quality:1.4), (worst quality:1.4), (blurry:1.3), (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic, shading, shadows, watermark, signature, text";
  } else {
    return "(low quality:1.4), (worst quality:1.4), (blurry:1.3), cartoon, sketch, drawing, line art, watermark, signature, text";
  }
}

export default {
  buildStructuredDNAContext,
  build3DPanelPrompt,
  buildPlanPrompt,
  buildElevationPrompt,
  buildSectionPrompt,
  buildNegativePrompt,
  buildSheetDesignContext,
  assertSheetDesignContext,
  SHEET_DESIGN_CONTEXT_VERSION,
  SHEET_DESIGN_CONTEXT_KEYS,
};
