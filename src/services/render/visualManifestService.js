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
  "do not introduce unrelated neighbouring buildings outside the locked attachment context",
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

function normalizeSignalText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function collectTypologySignals({
  compiledProject,
  projectGraph,
  brief,
  masterDNA,
}) {
  return [
    brief?.building_type,
    brief?.buildingType,
    brief?.original_subtype,
    brief?.originalSubtype,
    brief?.programme_template_key,
    brief?.project_type_support?.subtypeId,
    brief?.project_type_support?.programmeTemplateKey,
    compiledProject?.buildingTypology,
    compiledProject?.attachmentType,
    compiledProject?.typology,
    projectGraph?.buildingTypology,
    projectGraph?.attachmentType,
    masterDNA?.buildingTypology,
    masterDNA?.attachmentType,
  ]
    .map(normalizeSignalText)
    .filter(Boolean)
    .join(" ");
}

function deriveAttachmentType({
  compiledProject,
  projectGraph,
  brief,
  masterDNA,
}) {
  const explicit = normalizeSignalText(
    brief?.attachmentType ||
      compiledProject?.attachmentType ||
      projectGraph?.attachmentType ||
      masterDNA?.attachmentType,
  );
  const text = `${explicit} ${collectTypologySignals({
    compiledProject,
    projectGraph,
    brief,
    masterDNA,
  })}`;

  if (
    /\bend\s+terrace\b|\bend\s+terraced\b|\bterrace\s+end\b|\bend\s+row\b/.test(
      text,
    )
  ) {
    return "end_terrace";
  }
  if (
    /\bterraced\b|\bterrace house\b|\bterraced house\b|\brow house\b|\browhouse\b|\btownhouse\b|\btown house\b/.test(
      text,
    )
  ) {
    return "terraced";
  }
  if (/\bsemi\s+detached\b|\bsemi detached house\b|\bsemi\b/.test(text)) {
    return "semi_detached";
  }
  if (
    /\bdetached\b|\bfreestanding\b|\bfree standing\b|\bstandalone\b|\bstand alone\b/.test(
      text,
    )
  ) {
    return "detached";
  }
  return "unknown";
}

function derivePartyWallSides({
  compiledProject,
  projectGraph,
  brief,
  attachmentType,
}) {
  const explicit =
    brief?.partyWallSides ||
    compiledProject?.partyWallSides ||
    projectGraph?.partyWallSides;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map((side) => String(side).trim()).filter(Boolean);
  }
  if (attachmentType === "terraced") return ["left", "right"];
  if (attachmentType === "end_terrace" || attachmentType === "semi_detached") {
    return ["one_side"];
  }
  return [];
}

function deriveBuildingTypology({
  buildingType,
  attachmentType,
  compiledProject,
  projectGraph,
  brief,
  masterDNA,
}) {
  const explicit = nullable(
    brief?.buildingTypology ||
      compiledProject?.buildingTypology ||
      projectGraph?.buildingTypology ||
      masterDNA?.buildingTypology,
  );
  if (explicit) return explicit;
  if (attachmentType === "terraced") return "terraced/row-house dwelling";
  if (attachmentType === "end_terrace") return "end-terrace dwelling";
  if (attachmentType === "semi_detached") return "semi-detached dwelling";
  if (attachmentType === "detached") return "detached dwelling";
  return buildingType || "building";
}

function toCountedArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object")
    return Object.values(value).filter(Boolean);
  return [];
}

function deriveRooflights({ compiledProject, masterDNA, projectGraph }) {
  const candidates = [
    {
      source: "compiledProject.roof.rooflights",
      value: compiledProject?.roof?.rooflights,
    },
    {
      source: "compiledProject.roof.skylights",
      value: compiledProject?.roof?.skylights,
    },
    {
      source: "compiledProject.roof.openings",
      value: compiledProject?.roof?.openings,
    },
    {
      source: "compiledProject.rooflights",
      value: compiledProject?.rooflights,
    },
    { source: "compiledProject.skylights", value: compiledProject?.skylights },
    { source: "masterDNA.roof.rooflights", value: masterDNA?.roof?.rooflights },
    { source: "masterDNA.roof.skylights", value: masterDNA?.roof?.skylights },
    { source: "projectGraph.rooflights", value: projectGraph?.rooflights },
  ];

  for (const candidate of candidates) {
    if (candidate.value === true) {
      return { present: true, count: null, source: candidate.source };
    }
    const arrayValue = toCountedArray(candidate.value);
    if (arrayValue.length > 0) {
      return {
        present: true,
        count: arrayValue.length,
        source: candidate.source,
      };
    }
  }
  return { present: false, count: 0, source: "not_specified" };
}

function deriveManifestMaterials({ palette }) {
  return palette
    .map((entry, index) =>
      normaliseMaterial(entry, index === 0 ? "primary facade" : null),
    )
    .filter(Boolean)
    .slice(0, 8);
}

function deriveWindowRhythmFingerprint({ compiledProject }) {
  const windows = [
    ...toCountedArray(compiledProject?.windows),
    ...toCountedArray(compiledProject?.openings).filter((opening) => {
      const type = String(
        opening?.type || opening?.kind || "window",
      ).toLowerCase();
      return type !== "door";
    }),
  ];
  const bySide = {};
  for (const windowEntry of windows) {
    const side = nullable(
      windowEntry?.side ||
        windowEntry?.facade ||
        windowEntry?.orientation ||
        windowEntry?.metadata?.side,
    );
    const key = side || "unknown";
    bySide[key] = (bySide[key] || 0) + 1;
  }
  return {
    totalWindowCount: windows.length,
    bySide,
  };
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
  const attachmentType = deriveAttachmentType({
    compiledProject,
    projectGraph,
    brief,
    masterDNA,
  });
  const partyWallSides = derivePartyWallSides({
    compiledProject,
    projectGraph,
    brief,
    attachmentType,
  });
  const buildingTypology = deriveBuildingTypology({
    buildingType,
    attachmentType,
    compiledProject,
    projectGraph,
    brief,
    masterDNA,
  });
  const primaryFacadeMaterial = derivePrimaryFacade({ palette });
  const secondaryFacadeMaterial = deriveSecondaryFacade({
    palette,
    primary: primaryFacadeMaterial,
  });
  const rooflights = deriveRooflights({
    compiledProject,
    masterDNA,
    projectGraph,
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
    buildingTypology,
    attachmentType,
    partyWallSides,
    massingSummary: deriveMassingSummary({ compiledProject, masterDNA }),
    roof: deriveRoof({
      compiledProject,
      masterDNA,
      styleDNA,
      palette,
    }),
    rooflights,
    primaryFacadeMaterial,
    secondaryFacadeMaterial,
    materials: deriveManifestMaterials({ palette }),
    windowMaterial: deriveWindowMaterial({ styleDNA, localStyle, palette }),
    doorMaterial: deriveDoorMaterial({ styleDNA, localStyle, palette }),
    windowRhythm: deriveWindowRhythm({
      compiledProject,
      projectGraph,
      styleDNA,
      localStyle,
    }),
    windowRhythmFingerprint: deriveWindowRhythmFingerprint({
      compiledProject,
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
  const buildingLine = `Building: ${m.buildingTypology || m.buildingType || "as specified"}, ${m.storeyCount}-storey${
    m.massingSummary?.form ? `, ${m.massingSummary.form}` : ""
  }`;
  const attachmentLine = `Attachment: ${m.attachmentType || "unknown"}${
    Array.isArray(m.partyWallSides) && m.partyWallSides.length > 0
      ? `, party wall sides: ${m.partyWallSides.join(", ")}`
      : ", party wall sides: none"
  }`;
  const roofLine = `Roof: ${m.roof?.form || "as specified"}${
    m.roof?.pitchDeg ? `, ${m.roof.pitchDeg}°` : ""
  }, clad in ${m.roof?.materialName || "specified material"}${
    m.roof?.materialHex ? ` (${m.roof.materialHex})` : ""
  }`;
  const rooflightLine = `Rooflights/skylights: ${
    m.rooflights?.present
      ? `${m.rooflights.count || "specified"} present`
      : "none - do not add rooflights or skylights"
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
  const typologyConstraints = buildTypologyConstraintLines(m);
  const windowFingerprintLine =
    m.windowRhythmFingerprint?.totalWindowCount > 0
      ? `Window count/rhythm: ${m.windowRhythmFingerprint.totalWindowCount} windows total, ${m.windowRhythm || "specified rhythm"}`
      : null;

  const lines = [
    `=== VISUAL IDENTITY LOCK (manifestHash: ${m.manifestHash}) ===`,
    buildingLine,
    attachmentLine,
    roofLine,
    rooflightLine,
    primaryLine,
    secondaryLine,
    glazingLine,
    windowFingerprintLine,
    doorLine,
    entranceLine,
    climateLine,
    styleLine,
    typologyConstraints.length ? `Typology constraints:` : null,
    ...typologyConstraints.map((c) => `- ${c}`),
    `Constraints (do NOT violate):`,
    ...constraints.map((c) => `- ${c}`),
    `This panel MUST depict the SAME building identity as all other visual panels.`,
    `geometryHash: ${m.geometryHash || "n/a"}`,
    `=== END IDENTITY LOCK ===`,
  ].filter(Boolean);

  return lines.join("\n");
}

function buildTypologyConstraintLines(manifest) {
  const attachmentType = manifest?.attachmentType || "unknown";
  if (attachmentType === "terraced") {
    return [
      "Terraced/row-house dwelling with party walls / attached neighbours or attached-row context.",
      "No freestanding detached house and no open space on both side elevations.",
      "Front facade follows a terraced-house rhythm with repeated vertical bays and a continuous street-wall reading.",
    ];
  }
  if (attachmentType === "end_terrace") {
    return [
      "End-terrace dwelling with one party wall side and one exposed side elevation.",
      "Do not show a fully detached freestanding house.",
    ];
  }
  if (attachmentType === "semi_detached") {
    return [
      "Semi-detached dwelling with one attached neighbour / one party-wall side.",
      "Do not show a fully detached freestanding house or a full terrace row.",
    ];
  }
  if (attachmentType === "detached") {
    return [
      "Detached dwelling: freestanding detached output is allowed, with no party walls required.",
    ];
  }
  return [];
}

export const VISUAL_MANIFEST_NEGATIVE_CONSTRAINTS = NEGATIVE_CONSTRAINTS;
