/**
 * Phase D — visual manifest service.
 *
 * Builds a single, deterministic, hashed snapshot of the building's identity
 * (storey count, roof form + material, primary/secondary facade materials,
 * window/door materials, window rhythm, entrance orientation, climate
 * response, style keywords) so every visual panel prompt can pin to the
 * same building. Without this lock, OpenAI image generation can render four
 * different buildings on one A1 sheet (one per visual panel).
 *
 * Same inputs → same `manifestId` + same `manifestHash`.
 *
 * The manifest is consumed in two places:
 *   1. `buildVisualIdentityLockBlock(manifest)` → string prepended to every
 *      visual-panel prompt (hero_3d, exterior_render, interior_3d,
 *      axonometric).
 *   2. `result.artifacts.visualManifest` + per-panel
 *      `metadata.visualManifestHash` / `visualManifestId` /
 *      `visualIdentityLocked = true`.
 *
 * Phase D **only consumes** Phase C provider metadata; the manifest is
 * created regardless of whether OpenAI image generation is enabled, so
 * deterministic-fallback panels still carry the same lock.
 */

import { computeCDSHashSync } from "../validation/cdsHash.js";
import { createStableId } from "../cad/projectGeometrySchema.js";

export const VISUAL_MANIFEST_VERSION = "visual-manifest-v1";

const NEGATIVE_CONSTRAINTS = Object.freeze([
  "do not invent additional storeys or change the storey count",
  "do not change facade materials between panels",
  "do not relocate the entrance",
  "do not change the roof form or pitch",
  "do not introduce neighbouring buildings",
  "do not depict a different building from the other visual panels",
]);

function nullable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function numericOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveStoreyCount({ compiledProject, brief }) {
  const levels = compiledProject?.levels;
  if (Array.isArray(levels) && levels.length > 0) return levels.length;
  const fromBrief = numericOrNull(brief?.target_storeys);
  return fromBrief && fromBrief > 0 ? fromBrief : 1;
}

function deriveStoreyHeights({ compiledProject, storeyCount }) {
  const levels = compiledProject?.levels;
  if (Array.isArray(levels) && levels.length === storeyCount) {
    return levels.map((level) => {
      const h = numericOrNull(
        level?.height_m ?? level?.height ?? level?.heightM,
      );
      return h && h > 0 ? h : 3.2;
    });
  }
  return Array(storeyCount).fill(3.2);
}

function deriveFootprintSummary({ compiledProject }) {
  const fp =
    compiledProject?.footprint ||
    compiledProject?.massing?.footprint ||
    compiledProject?.site?.footprint ||
    null;
  if (!fp) return null;
  return {
    lengthM: numericOrNull(fp.length_m ?? fp.length ?? fp.lengthM),
    widthM: numericOrNull(fp.width_m ?? fp.width ?? fp.widthM),
    areaM2: numericOrNull(fp.area_m2 ?? fp.area ?? fp.areaM2),
  };
}

function pickMaterialBySlot(palette, slot) {
  if (!Array.isArray(palette) || palette.length === 0) return null;
  const lowerSlot = String(slot).toLowerCase();
  return (
    palette.find((m) => {
      const application = String(m?.application || "").toLowerCase();
      const name = String(m?.name || "").toLowerCase();
      return application.includes(lowerSlot) || name.includes(lowerSlot);
    }) || null
  );
}

function pickMaterialByIndex(palette, index) {
  if (!Array.isArray(palette) || palette.length === 0) return null;
  return palette[Math.min(index, palette.length - 1)] || null;
}

function normaliseMaterial(entry, fallbackApplication = null) {
  if (!entry) return null;
  const name = nullable(entry.name);
  const hex = nullable(entry.hexColor || entry.hex);
  if (!name && !hex) return null;
  return {
    name: name || "as specified",
    hex,
    application: nullable(entry.application) || fallbackApplication,
  };
}

function deriveRoof({ compiledProject, masterDNA, styleDNA, palette }) {
  const fromPalette = pickMaterialBySlot(palette, "roof");
  return {
    form: nullable(
      masterDNA?.roof?.type ||
        styleDNA?.roof_language ||
        compiledProject?.roof?.form ||
        compiledProject?.roof?.type,
    ),
    pitchDeg: numericOrNull(
      masterDNA?.roof?.pitch_deg ??
        masterDNA?._structured?.geometry_rules?.roof_pitch_degrees ??
        compiledProject?.roof?.pitch_deg ??
        compiledProject?.roof?.pitchDeg,
    ),
    materialName: nullable(fromPalette?.name),
    materialHex: nullable(fromPalette?.hexColor || fromPalette?.hex),
  };
}

function derivePrimaryFacade({ palette }) {
  const slotted = pickMaterialBySlot(palette, "wall");
  return (
    normaliseMaterial(slotted, "primary facade") ||
    normaliseMaterial(pickMaterialByIndex(palette, 0), "primary facade")
  );
}

function deriveSecondaryFacade({ palette, primary }) {
  const slotted =
    pickMaterialBySlot(palette, "accent") ||
    pickMaterialBySlot(palette, "trim");
  let candidate = normaliseMaterial(slotted, "secondary accents");
  if (!candidate) {
    candidate = normaliseMaterial(
      pickMaterialByIndex(palette, 1),
      "secondary accents",
    );
  }
  // Don't echo the primary back if there's only one entry.
  if (
    candidate &&
    primary &&
    candidate.name === primary.name &&
    candidate.hex === primary.hex
  ) {
    return null;
  }
  return candidate;
}

function deriveWindowMaterial({ styleDNA, localStyle, palette }) {
  return nullable(
    styleDNA?.windows?.material ||
      styleDNA?.window_language ||
      localStyle?.window_material ||
      pickMaterialBySlot(palette, "glaz")?.name ||
      pickMaterialBySlot(palette, "window")?.name,
  );
}

function deriveDoorMaterial({ styleDNA, localStyle, palette }) {
  return nullable(
    styleDNA?.doors?.material ||
      styleDNA?.door_language ||
      localStyle?.door_material ||
      pickMaterialBySlot(palette, "door")?.name,
  );
}

function deriveWindowRhythm({
  compiledProject,
  projectGraph,
  styleDNA,
  localStyle,
}) {
  return nullable(
    projectGraph?.designFingerprint?.windowRhythm ||
      compiledProject?.facadeGrammar?.windowRhythm ||
      styleDNA?.facade_grammar?.windowRhythm ||
      styleDNA?.facade_language ||
      localStyle?.window_rhythm,
  );
}

function deriveEntranceOrientation({ compiledProject, projectGraph }) {
  return nullable(
    projectGraph?.designFingerprint?.entrancePosition ||
      compiledProject?.entrance?.orientation ||
      compiledProject?.entrance?.position ||
      compiledProject?.facadeGrammar?.entrancePosition,
  );
}

function deriveClimateResponse({ climate }) {
  if (!climate || typeof climate !== "object") return null;
  return {
    zone: nullable(climate.zone || climate.koppen || climate.climateZone),
    rainfallBand: nullable(
      climate.rainfall_band ||
        climate.rainfallBand ||
        (Number.isFinite(Number(climate.rainfall_mm))
          ? `${climate.rainfall_mm}mm/yr`
          : null),
    ),
    sunPathSummary: nullable(
      climate.sunPath?.summary ||
        climate.sun_path?.summary ||
        climate.sunPathSummary,
    ),
  };
}

function deriveStyleKeywords({ styleDNA, localStyle }) {
  const sources = [
    styleDNA?.precedent_keywords,
    styleDNA?.keywords,
    localStyle?.style_keywords,
    localStyle?.keywords,
  ];
  for (const list of sources) {
    if (Array.isArray(list) && list.length > 0) {
      return list
        .map((k) => (typeof k === "string" ? k.trim() : null))
        .filter(Boolean)
        .slice(0, 8);
    }
  }
  return [];
}

function deriveMassingSummary({ compiledProject, masterDNA }) {
  const form = nullable(
    masterDNA?.massing ||
      masterDNA?.massingType ||
      compiledProject?.massing?.form ||
      compiledProject?.massing?.type,
  );
  const longSide = nullable(
    compiledProject?.massing?.longSideOrientation ||
      compiledProject?.massing?.long_side_orientation,
  );
  if (!form && !longSide) return null;
  return { form, longSideOrientation: longSide };
}

function deriveLocalStyleLabel({ localStyle, styleDNA }) {
  return nullable(
    localStyle?.primary_style ||
      localStyle?.style_name ||
      localStyle?.label ||
      localStyle?.name ||
      styleDNA?.style_name,
  );
}

/**
 * Build the visual manifest. Pure, deterministic, no I/O.
 *
 * @param {object} options
 * @param {object} [options.compiledProject] — primary geometry source.
 * @param {object} [options.projectGraph]    — project graph object (id, designFingerprint).
 * @param {object} [options.brief]           — brief / user inputs.
 * @param {object} [options.masterDNA]       — design DNA snapshot.
 * @param {object} [options.siteSnapshot]    — site map snapshot (unused by the
 *                                             current derivation; reserved for
 *                                             future use).
 * @param {object} [options.climate]         — climate pack.
 * @param {object} [options.localStyle]      — regional vernacular pack.
 * @param {object} [options.styleDNA]        — generated style DNA.
 * @param {Array}  [options.materialPalette] — explicit palette (overrides
 *                                             localStyle.material_palette).
 * @returns {object} the visual manifest. Always includes
 *                   `version`, `manifestId`, `manifestHash`.
 */
export function buildVisualManifest({
  compiledProject = null,
  projectGraph = null,
  brief = null,
  masterDNA = null,
  // siteSnapshot is reserved for future derivation paths; intentionally
  // not destructured to avoid lint warnings on an unused parameter while
  // documenting that it is a recognised input.
  climate = null,
  localStyle = null,
  styleDNA = null,
  materialPalette = null,
} = {}) {
  const palette =
    (Array.isArray(materialPalette) && materialPalette.length > 0
      ? materialPalette
      : null) ||
    (Array.isArray(localStyle?.material_palette) &&
    localStyle.material_palette.length > 0
      ? localStyle.material_palette
      : null) ||
    (Array.isArray(masterDNA?.materials) && masterDNA.materials.length > 0
      ? masterDNA.materials
      : null) ||
    [];

  const storeyCount = deriveStoreyCount({ compiledProject, brief });
  const geometryHash = nullable(
    compiledProject?.geometryHash || compiledProject?.geometry_hash,
  );
  const projectGraphId = nullable(
    projectGraph?.projectGraphId ||
      projectGraph?.id ||
      projectGraph?.project_graph_id ||
      brief?.project_graph_id,
  );
  const buildingType = nullable(brief?.building_type || brief?.buildingType);
  const primaryFacadeMaterial = derivePrimaryFacade({ palette });
  const secondaryFacadeMaterial = deriveSecondaryFacade({
    palette,
    primary: primaryFacadeMaterial,
  });

  const manifestSourceGaps = [];
  if (!geometryHash) manifestSourceGaps.push("geometryHash");
  if (!projectGraphId) manifestSourceGaps.push("projectGraphId");
  if (!buildingType) manifestSourceGaps.push("buildingType");
  if (palette.length === 0) manifestSourceGaps.push("materialPalette");
  if (!primaryFacadeMaterial) manifestSourceGaps.push("primaryFacadeMaterial");

  const draft = {
    version: VISUAL_MANIFEST_VERSION,
    geometryHash,
    projectGraphId,
    storeyCount,
    storeyHeights: deriveStoreyHeights({ compiledProject, storeyCount }),
    footprintSummary: deriveFootprintSummary({ compiledProject }),
    buildingType,
    massingSummary: deriveMassingSummary({ compiledProject, masterDNA }),
    roof: deriveRoof({
      compiledProject,
      masterDNA,
      styleDNA,
      palette,
    }),
    primaryFacadeMaterial,
    secondaryFacadeMaterial,
    windowMaterial: deriveWindowMaterial({ styleDNA, localStyle, palette }),
    doorMaterial: deriveDoorMaterial({ styleDNA, localStyle, palette }),
    windowRhythm: deriveWindowRhythm({
      compiledProject,
      projectGraph,
      styleDNA,
      localStyle,
    }),
    entranceOrientation: deriveEntranceOrientation({
      compiledProject,
      projectGraph,
    }),
    climateResponse: deriveClimateResponse({ climate }),
    localStyle: deriveLocalStyleLabel({ localStyle, styleDNA }),
    styleKeywords: deriveStyleKeywords({ styleDNA, localStyle }),
    manifestSourceGaps,
  };

  // negativeConstraints is a Phase-D-internal prompt-engineering aid. It is
  // intentionally NOT part of the hashable subset: changing the wording of a
  // constraint should not invalidate previously-rendered identities.
  const manifestHash = computeCDSHashSync(draft);
  const manifestId = createStableId(
    "visual-manifest",
    projectGraphId || "no-graph",
    geometryHash || "no-geom",
    String(storeyCount),
  );

  return {
    ...draft,
    negativeConstraints: NEGATIVE_CONSTRAINTS.slice(),
    manifestId,
    manifestHash,
  };
}

/**
 * Render the canonical "VISUAL IDENTITY LOCK" block that every visual-panel
 * prompt must include verbatim. The block is deterministic for a given
 * manifest and identical across all four visual panels — that's the whole
 * point of Phase D.
 *
 * @param {object|null} manifest — the manifest from {@link buildVisualManifest}.
 * @returns {string} multi-line lock block (or empty string when no manifest).
 */
export function buildVisualIdentityLockBlock(manifest) {
  if (!manifest || typeof manifest !== "object") return "";

  const m = manifest;
  const buildingLine = `Building: ${m.buildingType || "as specified"}, ${m.storeyCount}-storey${
    m.massingSummary?.form ? `, ${m.massingSummary.form}` : ""
  }`;
  const roofLine = `Roof: ${m.roof?.form || "as specified"}${
    m.roof?.pitchDeg ? `, ${m.roof.pitchDeg}°` : ""
  }, clad in ${m.roof?.materialName || "specified material"}${
    m.roof?.materialHex ? ` (${m.roof.materialHex})` : ""
  }`;
  const primaryLine = `Primary facade: ${m.primaryFacadeMaterial?.name || "as specified"}${
    m.primaryFacadeMaterial?.hex ? ` (${m.primaryFacadeMaterial.hex})` : ""
  }${m.primaryFacadeMaterial?.application ? ` — ${m.primaryFacadeMaterial.application}` : ""}`;
  const secondaryLine = `Secondary facade: ${m.secondaryFacadeMaterial?.name || "as specified"}${
    m.secondaryFacadeMaterial?.hex ? ` (${m.secondaryFacadeMaterial.hex})` : ""
  }${m.secondaryFacadeMaterial?.application ? ` — ${m.secondaryFacadeMaterial.application}` : ""}`;
  const glazingLine = `Glazing: ${m.windowMaterial || "as specified"} frames${
    m.windowRhythm ? `, ${m.windowRhythm} rhythm` : ""
  }`;
  const doorLine = `Doors: ${m.doorMaterial || "as specified"}`;
  const entranceLine = `Entrance: ${m.entranceOrientation || "as specified"}`;
  const climateLine = m.climateResponse?.zone
    ? `Climate: ${m.climateResponse.zone}${
        m.climateResponse.rainfallBand
          ? `, ${m.climateResponse.rainfallBand}`
          : ""
      }`
    : null;
  const styleLine = m.localStyle
    ? `Style: ${m.localStyle}${
        Array.isArray(m.styleKeywords) && m.styleKeywords.length > 0
          ? ` — ${m.styleKeywords.slice(0, 3).join(", ")}`
          : ""
      }`
    : null;

  const constraints = Array.isArray(m.negativeConstraints)
    ? m.negativeConstraints
    : NEGATIVE_CONSTRAINTS;

  const lines = [
    `=== VISUAL IDENTITY LOCK (manifestHash: ${m.manifestHash}) ===`,
    buildingLine,
    roofLine,
    primaryLine,
    secondaryLine,
    glazingLine,
    doorLine,
    entranceLine,
    climateLine,
    styleLine,
    `Constraints (do NOT violate):`,
    ...constraints.map((c) => `- ${c}`),
    `This panel MUST depict the SAME building identity as all other visual panels.`,
    `geometryHash: ${m.geometryHash || "n/a"}`,
    `=== END IDENTITY LOCK ===`,
  ].filter(Boolean);

  return lines.join("\n");
}

export const VISUAL_MANIFEST_NEGATIVE_CONSTRAINTS = NEGATIVE_CONSTRAINTS;
