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
      wall: 3.0,
      wallInternal: 1.8,
      dimension: 0.5,
      annotation: 0.8,
      hatch: 0.3,
      glazingBar: 0.5,
      doorSwing: 0.5,
      groundLine: 1.5,
      roof: 2.0,
      levelMarker: 0.8,
      levelMarkerDashed: 0.5,
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
      wall: 1.6,
      wallInternal: 1.0,
      dimension: 0.5,
      annotation: 0.6,
      hatch: 0.4,
      glazingBar: 0.5,
      doorSwing: 0.6,
      groundLine: 1.2,
      roof: 1.2,
      levelMarker: 0.6,
      levelMarkerDashed: 0.4,
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
      wall: 1.8,
      wallInternal: 1.0,
      dimension: 0.6,
      annotation: 0.7,
      hatch: 0.4,
      glazingBar: 0.5,
      doorSwing: 0.7,
      groundLine: 1.4,
      roof: 1.4,
      levelMarker: 0.7,
      levelMarkerDashed: 0.4,
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
      font-family: Arial, Helvetica, sans-serif;
      font-size: 16px;
      font-weight: bold;
      fill: ${c.text};
      text-anchor: middle;
    }
    .room-label {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      font-weight: bold;
      fill: ${c.text};
      text-anchor: middle;
    }
    .area-label {
      font-family: Arial, Helvetica, sans-serif;
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
      stroke-width: 1.2;
    }
    .window-frame {
      fill: ${c.windowFrame};
      stroke: ${c.stroke};
      stroke-width: 0.8;
    }
    .window-glazing-bar {
      stroke: ${c.windowFrame};
      stroke-width: ${lw.glazingBar};
    }

    /* --- Doors --- */
    .door {
      fill: ${c.doorFill};
      stroke: ${c.stroke};
      stroke-width: 1;
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
      stroke-width: 1;
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
      stroke-width: 1;
    }
    .foundation {
      fill: ${c.foundationFill};
      stroke: ${c.stroke};
      stroke-width: 1.2;
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
      font-family: Arial, Helvetica, sans-serif;
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
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
      fill: ${c.text};
    }
  `;
}

export default {
  getStylePreset,
  generateSVGStyles,
  SYMBOL_SIZES,
  CONVENTIONS,
};
