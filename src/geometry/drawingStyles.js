/**
 * drawingStyles - Architectural Drawing Style Presets and Conventions
 *
 * Provides style presets, SVG CSS generation, symbol sizes, and
 * UK-standard architectural drawing conventions for Projections2D.
 *
 * All dimensional values are in millimeters unless otherwise noted.
 *
 * @module geometry/drawingStyles
 */

// =============================================================================
// CONVENTIONS (mm)
// =============================================================================

/**
 * Standard architectural conventions used across all drawing types.
 * Values are in millimeters to match the internal coordinate system.
 */
export const CONVENTIONS = Object.freeze({
  wallThickness: {
    /** External wall thickness (mm) - cavity wall or solid masonry */
    external: 300,
    /** Internal partition wall thickness (mm) - stud or blockwork */
    internal: 150,
  },
  /** Strip foundation depth below ground level (mm) */
  foundationDepth: 900,
});

// =============================================================================
// LINE WEIGHTS (mm) — ISO 128 / BS 8888
// =============================================================================

/**
 * Standard architectural pen widths in millimeters.
 * Based on ISO 128 / BS 8888 line weight conventions.
 */
export const LINE_WEIGHTS_MM = Object.freeze({
  /** Cut-through walls (plans, sections) */
  wallCut: 0.7,
  /** Wall outlines visible in elevation */
  wallProfile: 0.5,
  /** Ground/datum line */
  groundLine: 0.5,
  /** Roof outlines */
  roof: 0.5,
  /** Section cut lines, level markers */
  annotation: 0.25,
  /** Dimension lines and extension lines */
  dimension: 0.25,
  /** Window glazing bars */
  glazingBar: 0.3,
  /** Hatch/poché fill lines */
  hatch: 0.18,
  /** Furniture symbols */
  furniture: 0.18,
  /** Door swing arcs */
  doorSwing: 0.25,
});

/**
 * Convert a millimeter pen width to SVG pixel units.
 *
 * Architectural line weights are absolute physical sizes —
 * they do not vary with drawing scale.
 *
 * Formula: px = mm × (dpi / 25.4)
 *
 * @param {number} mm - Pen width in millimeters
 * @param {number} [_scale] - Reserved (drawing scale does not affect line weight)
 * @param {number} [dpi=150] - Target output resolution
 * @returns {number} Stroke-width value for SVG
 */
export function lineWeightToPx(mm, _scale, dpi = 150) {
  return +((mm * dpi) / 25.4).toFixed(2);
}

// =============================================================================
// SYMBOL SIZES
// =============================================================================

/**
 * Standard symbol sizes for architectural drawing elements.
 * Dimensional values are in millimeters where they relate to building
 * geometry; pixel values are used for annotation-only elements that
 * do not scale with the drawing.
 */
export const SYMBOL_SIZES = Object.freeze({
  window: {
    /** Window frame width (mm) */
    frameWidth: 50,
    /** Window sill projection depth (mm) */
    sillDepth: 40,
    /** Whether to draw glazing bar centre lines */
    glazingBars: true,
  },
  door: {
    /** Door leaf thickness (mm) - standard internal door */
    leafThickness: 44,
    /** Swing arc radius as a proportion of door width (0-1) */
    swingRadius: 0.85,
    /** Door frame width (mm) */
    frameWidth: 50,
  },
  dimension: {
    /** Tick mark half-length at dimension line ends (px) */
    tickLength: 8,
  },
  levelMarker: {
    /** Triangle marker size (px) */
    triangleSize: 8,
    /** Horizontal reference line length (px) */
    lineLength: 30,
    /** Gap between end of line and label text (px) */
    textOffset: 4,
  },
  northArrow: {
    /** Outer circle radius (px) */
    radius: 15,
    /** Arrow head size (px) */
    arrowSize: 12,
  },
  scaleBar: {
    /** Bar height (px) */
    height: 4,
    /** End tick half-height (px) */
    tickHeight: 6,
  },
});

// =============================================================================
// STYLE PRESETS
// =============================================================================

/**
 * Built-in theme definitions.
 *
 * Each preset provides:
 *  - colors   : named colour strings for every drawing element category
 *  - lineWeights : stroke-width values (px) for line categories
 */
const STYLE_PRESETS = {
  /**
   * Technical / construction-document style.
   * High-contrast dark strokes on white background.
   */
  technical: {
    colors: {
      stroke: "#000000",
      fill: "#FFFFFF",
      background: "#FFFFFF",
      dimension: "#333333",
      text: "#000000",
      hatch: "#666666",
      wallHatch: "#444444",
      wallFill: "#1A1A1A",
      wallInternal: "#1A1A1A",
      windowFrame: "#333333",
      windowGlass: "#D6EAF8",
      doorFill: "#6B4226",
      doorSwing: "#999999",
      doorOpening: "#FFFFFF",
      roofFill: "#C0C0C0",
      roofStroke: "#222222",
      roomFill: "#FFFFFF",
      circulationFill: "#F5F5F5",
      skyFill: "#E8F4FD",
      groundFill: "#D5E8D4",
      groundLine: "#333333",
      slabFill: "#D0D0D0",
      foundationFill: "#C8B8A0",
      stairCut: "#F0F0F0",
      levelMarker: "#333333",
    },
    lineWeights: {
      wall: 4.0,
      wallInternal: 1.8,
      dimension: 1.2,
      annotation: 0.9,
      hatch: 0.5,
      glazingBar: 0.8,
      doorSwing: 1.0,
      groundLine: lineWeightToPx(LINE_WEIGHTS_MM.groundLine),
      roof: lineWeightToPx(LINE_WEIGHTS_MM.roof),
      levelMarker: 0.9,
      levelMarkerDashed: 1.2,
      furniture: lineWeightToPx(LINE_WEIGHTS_MM.furniture),
    },
  },

  /**
   * Artistic / presentation style.
   * Lighter strokes, softer palette suitable for client-facing drawings.
   */
  artistic: {
    colors: {
      stroke: "#5A5A5A",
      fill: "#FEFEFE",
      background: "#FAFAF5",
      dimension: "#7A7A7A",
      text: "#4A4A4A",
      hatch: "#AAAAAA",
      wallHatch: "#999999",
      wallFill: "#6A6A6A",
      wallInternal: "#888888",
      windowFrame: "#6A6A6A",
      windowGlass: "#DAE8F0",
      doorFill: "#B89050",
      doorSwing: "#BBBBBB",
      doorOpening: "#FEFEFE",
      roofFill: "#D8D0C8",
      roofStroke: "#7A7A7A",
      roomFill: "#F5F3EE",
      circulationFill: "#EDE9E0",
      skyFill: "#E0ECF5",
      groundFill: "#DDD5C8",
      groundLine: "#A09080",
      slabFill: "#C8C0B8",
      foundationFill: "#C0B8B0",
      stairCut: "#E0DDD5",
      levelMarker: "#5A5A5A",
    },
    lineWeights: {
      wall: lineWeightToPx(LINE_WEIGHTS_MM.wallCut * 0.65),
      wallInternal: lineWeightToPx(LINE_WEIGHTS_MM.wallProfile * 0.65),
      dimension: lineWeightToPx(LINE_WEIGHTS_MM.dimension * 0.65),
      annotation: lineWeightToPx(LINE_WEIGHTS_MM.annotation * 0.65),
      hatch: lineWeightToPx(LINE_WEIGHTS_MM.hatch * 0.65),
      glazingBar: lineWeightToPx(LINE_WEIGHTS_MM.glazingBar * 0.65),
      doorSwing: lineWeightToPx(LINE_WEIGHTS_MM.doorSwing * 0.65),
      groundLine: lineWeightToPx(LINE_WEIGHTS_MM.groundLine * 0.65),
      roof: lineWeightToPx(LINE_WEIGHTS_MM.roof * 0.65),
      levelMarker: lineWeightToPx(LINE_WEIGHTS_MM.annotation * 0.65),
      levelMarkerDashed: lineWeightToPx(LINE_WEIGHTS_MM.dimension * 0.65),
      furniture: lineWeightToPx(LINE_WEIGHTS_MM.furniture * 0.65),
    },
  },

  /**
   * Blueprint style.
   * White-on-blue reminiscent of traditional diazo prints.
   */
  blueprint: {
    colors: {
      stroke: "#E0E8FF",
      fill: "#1A2744",
      background: "#1A2744",
      dimension: "#B0C4FF",
      text: "#E0E8FF",
      hatch: "#4A6090",
      wallHatch: "#5A70A0",
      wallFill: "#C0D0FF",
      wallInternal: "#8090C0",
      windowFrame: "#A0B8E0",
      windowGlass: "#2A3F6A",
      doorFill: "#7A90C0",
      doorSwing: "#6080B0",
      doorOpening: "#1A2744",
      roofFill: "#2A3F6A",
      roofStroke: "#C0D0FF",
      roomFill: "#1E2E50",
      circulationFill: "#1A2844",
      skyFill: "#1A2744",
      groundFill: "#14203A",
      groundLine: "#8090C0",
      slabFill: "#3A5080",
      foundationFill: "#3A4A70",
      stairCut: "#2A3F6A",
      levelMarker: "#C0D0FF",
    },
    lineWeights: {
      wall: lineWeightToPx(LINE_WEIGHTS_MM.wallCut * 0.75),
      wallInternal: lineWeightToPx(LINE_WEIGHTS_MM.wallProfile * 0.75),
      dimension: lineWeightToPx(LINE_WEIGHTS_MM.dimension * 0.75),
      annotation: lineWeightToPx(LINE_WEIGHTS_MM.annotation * 0.75),
      hatch: lineWeightToPx(LINE_WEIGHTS_MM.hatch * 0.75),
      glazingBar: lineWeightToPx(LINE_WEIGHTS_MM.glazingBar * 0.75),
      doorSwing: lineWeightToPx(LINE_WEIGHTS_MM.doorSwing * 0.75),
      groundLine: lineWeightToPx(LINE_WEIGHTS_MM.groundLine * 0.75),
      roof: lineWeightToPx(LINE_WEIGHTS_MM.roof * 0.75),
      levelMarker: lineWeightToPx(LINE_WEIGHTS_MM.annotation * 0.75),
      levelMarkerDashed: lineWeightToPx(LINE_WEIGHTS_MM.dimension * 0.75),
      furniture: lineWeightToPx(LINE_WEIGHTS_MM.furniture * 0.75),
    },
  },
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Retrieve a named style preset.
 *
 * Falls back to 'technical' when the requested theme is not found.
 *
 * @param {string} theme - Preset name ('technical' | 'artistic' | 'blueprint')
 * @returns {{ colors: Object, lineWeights: Object }} Style definition
 */
export function getStylePreset(theme = "technical") {
  return STYLE_PRESETS[theme] || STYLE_PRESETS.technical;
}

/**
 * Generate a CSS string for embedding in an SVG `<style>` element.
 *
 * Maps the abstract style tokens (colors, lineWeights) onto the concrete
 * CSS class names used by Projections2D SVG output.
 *
 * @param {{ colors: Object, lineWeights: Object }} style - Style preset
 * @returns {string} CSS rules
 */
export function generateSVGStyles(style) {
  const c = style.colors;
  const lw = style.lineWeights;

  return `
    /* --- Text --- */
    .title {
      font-family: EmbeddedSans, Arial, Helvetica, sans-serif;
      font-size: 16px;
      font-weight: bold;
      fill: ${c.text};
      text-anchor: middle;
    }
    .room-label {
      font-family: EmbeddedSans, Arial, Helvetica, sans-serif;
      font-size: 10px;
      font-weight: bold;
      fill: ${c.text};
      text-anchor: middle;
    }
    .area-label {
      font-family: EmbeddedSans, Arial, Helvetica, sans-serif;
      font-size: 9px;
      fill: ${c.dimension};
      text-anchor: middle;
    }

    /* --- Rooms --- */
    .room-fill {
      fill: ${c.roomFill};
      stroke: none;
    }
    .circulation-fill {
      fill: ${c.circulationFill};
      stroke: none;
    }

    /* --- Walls --- */
    .wall-external-cut {
      fill: ${c.wallFill};
      stroke: ${c.stroke};
      stroke-width: ${lw.wall};
    }
    .wall-internal-fill {
      fill: ${c.wallInternal};
      stroke: ${c.stroke};
      stroke-width: ${lw.wallInternal};
    }
    .wall-poche line {
      stroke: ${c.wallHatch};
      stroke-width: ${lw.hatch};
    }

    /* --- Windows --- */
    .window {
      fill: ${c.windowGlass};
      stroke: ${c.windowFrame};
      stroke-width: ${lw.glazingBar};
    }
    .window-frame {
      fill: ${c.windowFrame};
      stroke: ${c.stroke};
      stroke-width: ${lw.annotation};
    }
    .window-glazing-bar {
      stroke: ${c.windowFrame};
      stroke-width: ${lw.glazingBar};
    }

    /* --- Doors --- */
    .door {
      fill: ${c.doorFill};
      stroke: ${c.stroke};
      stroke-width: ${lw.annotation};
    }
    .door-opening {
      fill: ${c.doorOpening};
      stroke: none;
    }
    .door-swing {
      fill: none;
      stroke: ${c.doorSwing};
      stroke-width: ${lw.doorSwing};
      stroke-dasharray: 4 2;
    }

    /* --- Stairs --- */
    .stair-cut {
      fill: ${c.stairCut};
      stroke: ${c.stroke};
      stroke-width: ${lw.annotation};
    }

    /* --- Elevation / Section backgrounds --- */
    .sky {
      fill: ${c.skyFill};
    }
    .ground {
      fill: ${c.groundFill};
    }
    .ground-line {
      stroke: ${c.groundLine};
      stroke-width: ${lw.groundLine};
    }

    /* --- Roof --- */
    .roof {
      fill: ${c.roofFill};
      stroke: ${c.roofStroke};
      stroke-width: ${lw.roof};
    }

    /* --- Slabs and Foundation --- */
    .slab-cut {
      fill: ${c.slabFill};
      stroke: ${c.stroke};
      stroke-width: ${lw.annotation};
    }
    .foundation {
      fill: ${c.foundationFill};
      stroke: ${c.stroke};
      stroke-width: ${lw.annotation};
    }

    /* --- Hatching --- */
    .hatch {
      stroke: ${c.hatch};
      stroke-width: ${lw.hatch};
    }
    .hatch-slab {
      stroke: ${c.hatch};
      stroke-width: ${lw.hatch * 0.8};
    }

    /* --- Dimensions --- */
    .dimension line {
      stroke: ${c.dimension};
      stroke-width: ${lw.dimension};
    }
    .dimension-text {
      font-family: EmbeddedSans, Arial, Helvetica, sans-serif;
      font-size: 10px;
      fill: ${c.dimension};
      text-anchor: middle;
    }

    /* --- Level markers --- */
    .level-marker {
      stroke: ${c.levelMarker};
      stroke-width: ${lw.levelMarker};
    }
    .level-marker-dashed {
      stroke: ${c.levelMarker};
      stroke-width: ${lw.levelMarkerDashed};
      stroke-dasharray: 6 3;
    }
    .level-text {
      font-family: EmbeddedSans, Arial, Helvetica, sans-serif;
      font-size: 9px;
      fill: ${c.text};
    }
  `;
}

// =============================================================================
// PHASE 4 (Track 2) — Elevation SVG helpers
// =============================================================================
//
// Deterministic SVG fragments that elevation rendering can append to enrich
// the presentation without compromising geometry authority:
//   - groundHatch(...)         : diagonal earth hatch below the ground line
//   - shadowStyle45(...)       : 45° drop-shadow path styling (eaves / reveals)
//   - materialLegendStrip(...) : per-material swatch row keyed off the
//                                materialDNA / vernacular pack
//
// All three are PURE — they take inputs and return SVG strings. No I/O, no
// side effects, no dependency on the building model. The elevation
// projection chooses when to call them via panel-spec flags
// (`showGroundHatch`, `showShadow`, `showMaterialLegend`).

/**
 * Diagonal earth/ground hatch fragment.
 *
 * Renders parallel 45° lines covering the area BELOW the ground line of an
 * elevation panel. The hatch is purely cosmetic — it does NOT shift the
 * ground line itself, which remains the architectural datum.
 *
 * @param {object} opts
 * @param {number} opts.x        - left edge of the hatch band (px)
 * @param {number} opts.y        - top edge of the hatch band (px, == ground line y)
 * @param {number} opts.width    - hatch band width (px)
 * @param {number} opts.height   - hatch band depth below ground line (px)
 * @param {number} [opts.spacing=10]  - distance between hatch lines (px)
 * @param {string} [opts.color="#9A8870"] - hatch line colour
 * @param {number} [opts.strokeWidth=0.5] - hatch line stroke width (px)
 * @returns {string} SVG fragment
 */
export function groundHatch({
  x,
  y,
  width,
  height,
  spacing = 10,
  color = "#9A8870",
  strokeWidth = 0.5,
} = {}) {
  if (!(width > 0) || !(height > 0)) return "";
  const lines = [];
  // Draw lines whose start sits along the top edge and bottom edge to
  // produce a continuous 45° pattern across the whole rectangle.
  const total = Math.ceil((width + height) / spacing);
  for (let i = 0; i <= total; i += 1) {
    const offset = i * spacing;
    const x1 = x + offset;
    const y1 = y;
    const x2 = x + offset - height;
    const y2 = y + height;
    const clampedX1 = Math.min(Math.max(x1, x), x + width);
    const clampedY1 = clampedX1 === x1 ? y1 : y1 + (x1 - clampedX1);
    const clampedX2 = Math.max(Math.min(x2, x + width), x);
    const clampedY2 = clampedX2 === x2 ? y2 : y2 - (clampedX2 - x2);
    if (clampedX1 === clampedX2 && clampedY1 === clampedY2) continue;
    lines.push(
      `<line x1="${clampedX1.toFixed(2)}" y1="${clampedY1.toFixed(2)}" ` +
        `x2="${clampedX2.toFixed(2)}" y2="${clampedY2.toFixed(2)}" ` +
        `stroke="${color}" stroke-width="${strokeWidth}"/>`,
    );
  }
  return `<g class="ground-hatch" data-spacing="${spacing}">${lines.join("")}</g>`;
}

/**
 * 45° drop-shadow style helper.
 *
 * Returns SVG `<style>` + class definitions that elevation rendering can
 * apply to roof eaves and window reveals to cast a 45° shadow polygon
 * below the projecting feature. The geometry of the shadow polygon must
 * be computed by the elevation rendering itself (it knows the eave and
 * reveal projections); this helper only standardises the look.
 *
 * @param {object} opts
 * @param {number} [opts.azimuth=45]    - shadow azimuth in degrees (sun)
 * @param {number} [opts.elevation=30]  - sun altitude in degrees
 * @param {number} [opts.opacity=0.18]  - shadow fill opacity (0-1)
 * @param {string} [opts.color="#1f2a3a"] - shadow fill colour
 * @returns {string} SVG <defs>+<style> fragment
 */
export function shadowStyle45({
  azimuth = 45,
  elevation = 30,
  opacity = 0.18,
  color = "#1f2a3a",
} = {}) {
  return (
    `<defs data-shadow-azimuth="${azimuth}" data-shadow-elevation="${elevation}">` +
    `<style><![CDATA[` +
    `.elevation-shadow{fill:${color};fill-opacity:${opacity};stroke:none;}` +
    `.elevation-shadow-line{stroke:${color};stroke-opacity:${opacity};stroke-width:0.6;fill:none;}` +
    `]]></style>` +
    `</defs>`
  );
}

/**
 * Material legend strip — small swatch row keyed off the vernacular /
 * materialDNA palette. Renders horizontally along the foot of the
 * elevation panel.
 *
 * @param {Array<{name:string,color:string,role?:string}>} materials
 * @param {object} opts
 * @param {number} opts.x         - left edge (px)
 * @param {number} opts.y         - top edge (px)
 * @param {number} [opts.width=420]    - total width (px)
 * @param {number} [opts.height=22]    - strip height (px)
 * @param {number} [opts.swatchWidth=24]   - per-swatch width (px)
 * @param {string} [opts.background="#fafafa"]
 * @param {string} [opts.border="#cccccc"]
 * @returns {string} SVG fragment
 */
export function materialLegendStrip(
  materials = [],
  {
    x,
    y,
    width = 420,
    height = 22,
    swatchWidth = 24,
    background = "#fafafa",
    border = "#cccccc",
  } = {},
) {
  if (!Array.isArray(materials) || materials.length === 0) return "";
  const entries = materials.filter(Boolean).slice(0, Math.floor(width / 60));
  const rowY = y + 2;
  const labelY = y + height - 5;
  let cursorX = x + 6;
  const items = entries
    .map((m) => {
      const fill = String(m?.color || m?.fill || "#dddddd");
      const label = String(m?.label || m?.name || m?.role || "material");
      const swatch = `<rect x="${cursorX.toFixed(2)}" y="${rowY.toFixed(2)}" width="${swatchWidth}" height="${(height - 8).toFixed(2)}" fill="${fill}" stroke="${border}" stroke-width="0.5"/>`;
      const text = `<text x="${(cursorX + swatchWidth + 4).toFixed(2)}" y="${labelY.toFixed(2)}" font-family="EmbeddedSans, Arial, sans-serif" font-size="8" fill="#333">${escapeXmlChars(label)}</text>`;
      cursorX += swatchWidth + 4 + Math.min(120, label.length * 5 + 10);
      return swatch + text;
    })
    .join("");
  const frame = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${background}" stroke="${border}" stroke-width="0.5"/>`;
  return `<g class="material-legend">${frame}${items}</g>`;
}

function escapeXmlChars(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default {
  getStylePreset,
  generateSVGStyles,
  SYMBOL_SIZES,
  CONVENTIONS,
  LINE_WEIGHTS_MM,
  lineWeightToPx,
  groundHatch,
  shadowStyle45,
  materialLegendStrip,
};
