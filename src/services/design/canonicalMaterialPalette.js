/**
 * canonicalMaterialPalette.js
 *
 * SINGLE SOURCE OF TRUTH for material palette extraction across the A1 pipeline.
 *
 * Previously, every consumer (hero prompt, elevation SVG, material swatch panel)
 * re-extracted materials from DNA in slightly different ways — producing the
 * mismatch visible on the last clinic sheet (brick/slate swatches vs a blue
 * clapboard hero vs flat-grey elevation panels). This module normalises all
 * DNA shapes into one palette object and exposes helpers for each consumer.
 *
 * Consumers:
 *   - src/services/a1/panelPromptBuilders.js      (hero + elevation prompts)
 *   - src/services/core/DataPanelService.js       (material swatch panel)
 *   - src/services/drawing/svgElevationRenderer.js (Tier C3 — pattern fills)
 */

/**
 * @typedef {Object} MaterialSlot
 * @property {string} name           Human label ("Red brick masonry")
 * @property {string} hexColor       "#RRGGBB"
 * @property {string} application    Where it shows ("Primary cladding", "Roof")
 * @property {number} [coverage]     0..1 fraction of facade coverage, optional
 * @property {string} [pattern]      "brick" | "clapboard" | "render" | "timber" | "panel"
 */

/**
 * @typedef {Object} MaterialPalette
 * @property {MaterialSlot|null} primary      Dominant cladding
 * @property {MaterialSlot|null} secondary    Trim / accent cladding
 * @property {MaterialSlot|null} roof         Roof material
 * @property {MaterialSlot|null} windowFrame  Window frame colour
 * @property {MaterialSlot|null} glazing      Glass tint
 * @property {MaterialSlot[]}    extras       Any additional materials beyond slots
 * @property {string}            source       "facadeObject" | "array" | "defaults"
 */

const DEFAULT_PALETTE = Object.freeze({
  primary: {
    name: "Red brick masonry",
    hexColor: "#B8604E",
    application: "Primary cladding",
    coverage: 0.7,
    pattern: "brick",
  },
  secondary: {
    name: "Painted timber trim",
    hexColor: "#3B3C3F",
    application: "Trim and fascia",
    pattern: "panel",
  },
  roof: {
    name: "Slate tiles",
    hexColor: "#4A5568",
    application: "Roof",
    pattern: "panel",
  },
  windowFrame: {
    name: "uPVC White",
    hexColor: "#F5F5F5",
    application: "Window frames",
    pattern: null,
  },
  glazing: {
    name: "Clear glass",
    hexColor: "#CBD5E1",
    application: "Glazing",
    pattern: null,
  },
});

const PATTERN_KEYWORDS = {
  brick: ["brick", "masonry"],
  clapboard: ["clapboard", "weatherboard", "siding", "shiplap"],
  render: ["render", "stucco", "plaster"],
  timber: ["timber", "wood", "cedar"],
  stone: ["stone", "limestone", "granite"],
};

function inferPattern(name = "", application = "") {
  const blob = `${name} ${application}`.toLowerCase();
  for (const [pattern, needles] of Object.entries(PATTERN_KEYWORDS)) {
    if (needles.some((n) => blob.includes(n))) return pattern;
  }
  return "panel";
}

function normaliseEntry(raw, fallbackLabel = "Material") {
  if (!raw || typeof raw !== "object") return null;
  const name = raw.name || raw.type || raw.label || fallbackLabel;
  const hexColor = raw.hexColor || raw.color || raw.hex || null;
  if (!hexColor) return null;
  const application = raw.application || raw.role || raw.category || "";
  return {
    name: String(name),
    hexColor: String(hexColor).startsWith("#") ? hexColor : `#${hexColor}`,
    application: String(application),
    coverage: typeof raw.coverage === "number" ? raw.coverage : undefined,
    pattern: raw.pattern || inferPattern(name, application),
  };
}

function matchBySlot(entries, needles) {
  for (const entry of entries) {
    const blob = `${entry.name || ""} ${entry.application || ""}`.toLowerCase();
    if (needles.some((n) => blob.includes(n))) return entry;
  }
  return null;
}

/**
 * Extract a canonical palette from any shape of DNA / CanonicalDesignState.
 *
 * Handles:
 *   - dna.materials as an ARRAY of {name, hexColor, application}
 *   - dna.materials as an OBJECT { facade, roof, windows, trim }
 *   - dna.style.materials / dna.envelope.materials nested variants
 *   - Missing data → DEFAULT_PALETTE so downstream never crashes
 *
 * @param {Object} dna
 * @returns {MaterialPalette}
 */
export function getCanonicalMaterialPalette(dna = {}) {
  const raw =
    dna?.materials ||
    dna?.style?.materials ||
    dna?.envelope?.materials ||
    dna?._structured?.style?.materials ||
    null;

  if (!raw) {
    return { ...DEFAULT_PALETTE, extras: [], source: "defaults" };
  }

  // Object-shaped palette (legacy DataPanelService shape)
  if (!Array.isArray(raw) && typeof raw === "object") {
    const primary =
      normaliseEntry(raw.facade, "Facade") || DEFAULT_PALETTE.primary;
    const secondary = normaliseEntry(raw.trim || raw.secondary) || null;
    const roof = normaliseEntry(raw.roof, "Roof") || DEFAULT_PALETTE.roof;
    const windowFrame =
      normaliseEntry(
        raw.windows?.frame
          ? {
              name: raw.windows.frame,
              hexColor: raw.windows.color,
              application: "Window frames",
            }
          : raw.windows,
        "Window frames",
      ) || DEFAULT_PALETTE.windowFrame;
    const glazing = normaliseEntry(raw.glazing) || DEFAULT_PALETTE.glazing;
    return {
      primary,
      secondary,
      roof,
      windowFrame,
      glazing,
      extras: [],
      source: "facadeObject",
    };
  }

  // Array-shaped palette
  const entries = raw.map((m) => normaliseEntry(m)).filter(Boolean);

  if (entries.length === 0) {
    return { ...DEFAULT_PALETTE, extras: [], source: "defaults" };
  }

  const primary =
    matchBySlot(entries, [
      "primary",
      "cladding",
      "facade",
      "wall",
      "exterior",
    ]) || entries[0];
  const secondary =
    matchBySlot(entries, ["trim", "secondary", "accent", "fascia"]) ||
    (entries[1] && entries[1] !== primary ? entries[1] : null);
  const roof =
    matchBySlot(entries, ["roof", "tile", "shingle"]) || DEFAULT_PALETTE.roof;
  const windowFrame =
    matchBySlot(entries, ["window", "frame", "mullion"]) ||
    DEFAULT_PALETTE.windowFrame;
  const glazing =
    matchBySlot(entries, ["glazing", "glass"]) || DEFAULT_PALETTE.glazing;

  const consumed = new Set(
    [primary, secondary, roof, windowFrame, glazing].filter(Boolean),
  );
  const extras = entries.filter((e) => !consumed.has(e));

  return {
    primary,
    secondary,
    roof,
    windowFrame,
    glazing,
    extras,
    source: "array",
  };
}

/**
 * Format a palette as human-readable lines for FLUX prompt injection.
 * Keeps hex codes so the model has explicit colour anchors.
 *
 * @param {MaterialPalette} palette
 * @returns {string} multi-line string
 */
export function paletteToSpecSheet(palette) {
  const lines = [];
  const push = (slot, label) => {
    if (!slot) return;
    const coverage =
      typeof slot.coverage === "number"
        ? ` — ${Math.round(slot.coverage * 100)}% facade coverage`
        : "";
    lines.push(`${label}: ${slot.name} (${slot.hexColor})${coverage}`);
  };
  push(palette.primary, "Primary cladding");
  push(palette.secondary, "Secondary / trim");
  push(palette.roof, "Roof");
  push(palette.windowFrame, "Window frames");
  if (palette.glazing && palette.glazing.hexColor) {
    lines.push(
      `Glazing tone: ${palette.glazing.name} (${palette.glazing.hexColor})`,
    );
  }
  return lines.join("\n");
}

/**
 * Flatten a palette into the swatch-list shape that DataPanelService expects.
 * @param {MaterialPalette} palette
 * @param {number} [limit=4]
 * @returns {Array<{name:string,color:string,application:string}>}
 */
export function paletteToSwatchList(palette, limit = 4) {
  const slots = [
    palette.primary,
    palette.secondary,
    palette.roof,
    palette.windowFrame,
  ].filter(Boolean);
  const list = slots.map((s) => ({
    name: s.name,
    color: s.hexColor,
    application: s.application,
  }));
  // top up from extras if we are short
  for (const extra of palette.extras || []) {
    if (list.length >= limit) break;
    list.push({
      name: extra.name,
      color: extra.hexColor,
      application: extra.application,
    });
  }
  return list.slice(0, limit);
}

/**
 * Convenience: get the dominant hex that downstream ΔE checks compare against.
 * @param {MaterialPalette} palette
 * @returns {string} "#RRGGBB"
 */
export function getPrimaryHex(palette) {
  return palette?.primary?.hexColor || DEFAULT_PALETTE.primary.hexColor;
}

export const CANONICAL_MATERIAL_DEFAULTS = DEFAULT_PALETTE;

export default {
  getCanonicalMaterialPalette,
  paletteToSpecSheet,
  paletteToSwatchList,
  getPrimaryHex,
  CANONICAL_MATERIAL_DEFAULTS,
};
