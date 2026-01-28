/**
 * Architectural Section Generator
 *
 * Generates SVG architectural section drawings from DNA specifications.
 * Produces crisp, CAD-accurate orthographic sections with:
 * - Wall poché (hatching for cut elements)
 * - Floor slabs with proper thickness
 * - Ceiling heights and structural elements
 * - Ground line and foundation indication
 * - Dimension chains
 * - Section line markers (A-A, B-B)
 *
 * This is a DETERMINISTIC generator - same DNA always produces same output.
 * No AI involved - pure geometry from specifications.
 */

import logger from "../../utils/logger.js";
import {
  validateSVG,
  buildSafePath,
  sanitizeCoordinate,
} from "../../utils/svgPathValidator.js";

/**
 * Hatch patterns for different materials in section
 */
export const HATCH_PATTERNS = {
  CONCRETE: "concrete",
  BRICK: "brick",
  WOOD: "wood",
  INSULATION: "insulation",
  EARTH: "earth",
  STONE: "stone",
};

/**
 * Section line weights (mm at 1:100 scale)
 */
const LINE_WEIGHTS = {
  CUT: 0.7, // Cut elements (walls, floors cut by section plane)
  PROFILE: 0.5, // Building profile beyond section
  HIDDEN: 0.25, // Hidden/dashed lines
  DIMENSION: 0.18, // Dimension lines and text
  HATCH: 0.13, // Hatching patterns
};

/**
 * Default colors
 */
const COLORS = {
  cut: "#1a1a1a", // Cut lines (darkest)
  profile: "#404040", // Profile lines
  hidden: "#808080", // Hidden lines
  dimension: "#2c5282", // Dimension lines/text
  hatchFill: "#e8e8e8", // Light fill for hatched areas
  hatchLine: "#999999", // Hatch line color
  ground: "#8B4513", // Ground/earth color
  background: "#ffffff",
};

/**
 * Generate section SVG from Design DNA
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @param {string} options.sectionType - 'longitudinal' (A-A) or 'transverse' (B-B)
 * @param {number} options.scale - Drawing scale (default: 100 for 1:100)
 * @param {boolean} options.showDimensions - Show dimension chains
 * @param {boolean} options.showHatching - Show material hatching
 * @param {boolean} options.showGroundLine - Show ground level indication
 * @returns {string} SVG string
 */
export function generateFromDNA(dna, options = {}) {
  const {
    sectionType = "longitudinal",
    scale = 100,
    showDimensions = true,
    showHatching = true,
    showGroundLine = true,
    width: outputWidth = 1500,
    height: outputHeight = 1000,
  } = options;

  // Extract dimensions from DNA
  const dims = extractDimensions(dna);
  const floors = extractFloors(dna);
  const materials = extractMaterials(dna);

  logger.info(`[SectionGenerator] Generating ${sectionType} section`, {
    buildingLength: dims.length,
    buildingWidth: dims.width,
    buildingHeight: dims.totalHeight,
    floors: floors.length,
  });

  // Calculate drawing dimensions
  const pixelsPerMeter = outputWidth / (dims.length + 6); // 6m margins
  const margin = 80; // SVG margin in pixels

  // The cutting dimension depends on section type
  const cuttingLength =
    sectionType === "longitudinal" ? dims.length : dims.width;
  const cuttingDepth =
    sectionType === "longitudinal" ? dims.width : dims.length;

  // Calculate SVG dimensions
  const svgWidth = outputWidth;
  const svgHeight = outputHeight;

  // Build SVG content
  const parts = [];

  // SVG header with viewBox
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${svgWidth} ${svgHeight}"
     width="${svgWidth}"
     height="${svgHeight}"
     shape-rendering="crispEdges">`);

  // Defs for patterns and markers
  parts.push(generateDefs(materials));

  // Background
  parts.push(
    `<rect width="${svgWidth}" height="${svgHeight}" fill="${COLORS.background}"/>`,
  );

  // Drawing area transform
  const drawingX = margin + 50;
  const drawingY = margin + 50;
  parts.push(`<g transform="translate(${drawingX}, ${drawingY})">`);

  // Ground line
  if (showGroundLine) {
    parts.push(
      generateGroundLine(cuttingLength, pixelsPerMeter, dims.totalHeight),
    );
  }

  // Foundation
  parts.push(generateFoundation(cuttingLength, pixelsPerMeter, showHatching));

  // Exterior walls (cut)
  parts.push(
    generateExteriorWalls(
      cuttingLength,
      dims.totalHeight,
      dims.wallThickness,
      pixelsPerMeter,
      showHatching,
    ),
  );

  // Floor slabs
  parts.push(
    generateFloorSlabs(floors, cuttingLength, pixelsPerMeter, showHatching),
  );

  // Roof
  parts.push(
    generateRoof(
      dna,
      cuttingLength,
      dims.totalHeight,
      pixelsPerMeter,
      showHatching,
    ),
  );

  // Internal walls (simplified - would need room data for accurate placement)
  parts.push(
    generateInternalElements(
      dna,
      sectionType,
      cuttingLength,
      dims.totalHeight,
      pixelsPerMeter,
    ),
  );

  // Windows and doors in section
  parts.push(
    generateOpeningsInSection(
      dna,
      sectionType,
      cuttingLength,
      floors,
      pixelsPerMeter,
    ),
  );

  // Dimension chains
  if (showDimensions) {
    parts.push(
      generateDimensions(
        cuttingLength,
        floors,
        dims.totalHeight,
        pixelsPerMeter,
      ),
    );
  }

  parts.push("</g>"); // Close drawing area

  // Title and labels
  parts.push(generateTitle(sectionType, svgWidth, svgHeight, margin));

  // Section markers (A-A or B-B)
  parts.push(generateSectionMarkers(sectionType, svgWidth, svgHeight, margin));

  // Scale bar
  parts.push(generateScaleBar(scale, margin, svgHeight));

  parts.push("</svg>");

  const svgString = parts.join("\n");

  // Validate the generated SVG
  const validation = validateSVG(svgString, {
    panelType: `section_${sectionType}`,
    generator: "ArchitecturalSectionGenerator",
    invalidPathAction: "fallback",
  });

  if (!validation.valid) {
    logger.warn(
      `[SectionGenerator] SVG validation found issues: ${validation.invalidPathCount} invalid paths`,
    );
    return validation.sanitizedSVG;
  }

  return svgString;
}

/**
 * Extract building dimensions from DNA
 */
function extractDimensions(dna) {
  const dims = dna?.dimensions || {};
  const geometryRules = dna?.geometry_rules || {};

  const floorHeight = geometryRules.floor_height || 3.0;
  const floorCount = dims.floors || dims.floorCount || 2;

  return {
    length: sanitizeCoordinate(dims.length, 15),
    width: sanitizeCoordinate(dims.width, 10),
    height: sanitizeCoordinate(dims.height, floorHeight * floorCount),
    totalHeight: floorCount * floorHeight,
    wallThickness: geometryRules.wall_thickness || 0.3,
    slabThickness: geometryRules.slab_thickness || 0.25,
    floorHeight,
    floorCount,
  };
}

/**
 * Extract floor information from DNA
 */
function extractFloors(dna) {
  const dims = dna?.dimensions || {};
  const floorHeight = dna?.geometry_rules?.floor_height || 3.0;
  const floorCount = dims.floors || dims.floorCount || 2;

  const floors = [];
  for (let i = 0; i < floorCount; i++) {
    floors.push({
      index: i,
      name: i === 0 ? "Ground Floor" : `Level ${i}`,
      levelHeight: i * floorHeight,
      ceilingHeight: (i + 1) * floorHeight,
      height: floorHeight,
    });
  }

  return floors;
}

/**
 * Extract material information from DNA
 */
function extractMaterials(dna) {
  const materials = dna?.materials || {};
  const style = dna?.style || {};

  return {
    wall: materials.wall || materials.exterior?.[0]?.name || "brick",
    floor: materials.floor || "concrete",
    roof: materials.roof || style.roof_material || "tiles",
    foundation: "concrete",
  };
}

/**
 * Generate SVG defs (patterns, markers)
 */
function generateDefs(materials) {
  return `
  <defs>
    <!-- Concrete hatch pattern (45° diagonal lines) -->
    <pattern id="hatch-concrete" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="${COLORS.hatchLine}" stroke-width="${LINE_WEIGHTS.HATCH}"/>
    </pattern>

    <!-- Brick hatch pattern (cross-hatch) -->
    <pattern id="hatch-brick" patternUnits="userSpaceOnUse" width="10" height="10">
      <line x1="0" y1="5" x2="10" y2="5" stroke="${COLORS.hatchLine}" stroke-width="${LINE_WEIGHTS.HATCH}"/>
      <line x1="5" y1="0" x2="5" y2="10" stroke="${COLORS.hatchLine}" stroke-width="${LINE_WEIGHTS.HATCH}"/>
    </pattern>

    <!-- Insulation hatch pattern (zigzag) -->
    <pattern id="hatch-insulation" patternUnits="userSpaceOnUse" width="20" height="10">
      <path d="M0,5 L5,0 L10,5 L15,0 L20,5" fill="none" stroke="${COLORS.hatchLine}" stroke-width="${LINE_WEIGHTS.HATCH}"/>
    </pattern>

    <!-- Earth/ground pattern (stipple) -->
    <pattern id="hatch-earth" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2" cy="2" r="1" fill="${COLORS.ground}"/>
      <circle cx="7" cy="7" r="1" fill="${COLORS.ground}"/>
    </pattern>

    <!-- Dimension arrow markers -->
    <marker id="dim-arrow-start" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto">
      <path d="M10,0 L0,3 L10,6" fill="none" stroke="${COLORS.dimension}" stroke-width="1"/>
    </marker>
    <marker id="dim-arrow-end" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto">
      <path d="M0,0 L10,3 L0,6" fill="none" stroke="${COLORS.dimension}" stroke-width="1"/>
    </marker>

    <!-- Section marker circle -->
    <marker id="section-marker" markerWidth="20" markerHeight="20" refX="10" refY="10">
      <circle cx="10" cy="10" r="8" fill="white" stroke="${COLORS.cut}" stroke-width="2"/>
    </marker>
  </defs>`;
}

/**
 * Generate ground line with earth indication
 */
function generateGroundLine(cuttingLength, pixelsPerMeter, buildingHeight) {
  const groundY = buildingHeight * pixelsPerMeter + 20; // 20px below building
  const lineWidth = (cuttingLength + 4) * pixelsPerMeter;
  const startX = -2 * pixelsPerMeter;

  return `
  <g class="ground-line">
    <!-- Main ground line -->
    <line x1="${startX}" y1="${groundY}" x2="${startX + lineWidth}" y2="${groundY}"
          stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>
    <!-- Ground hatching -->
    <rect x="${startX}" y="${groundY}" width="${lineWidth}" height="15"
          fill="url(#hatch-earth)"/>
  </g>`;
}

/**
 * Generate foundation (strip foundation simplified)
 */
function generateFoundation(cuttingLength, pixelsPerMeter, showHatching) {
  const foundationDepth = 0.8 * pixelsPerMeter;
  const foundationWidth = 0.6 * pixelsPerMeter;
  const wallThickness = 0.3 * pixelsPerMeter;
  const groundY = 0; // Building starts at 0

  const parts = ['<g class="foundation">'];

  // Left foundation
  parts.push(`
    <rect x="${-foundationWidth / 2}" y="${groundY}" width="${foundationWidth}" height="${foundationDepth}"
          fill="${showHatching ? "url(#hatch-concrete)" : COLORS.hatchFill}"
          stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>`);

  // Right foundation
  const rightX = cuttingLength * pixelsPerMeter - foundationWidth / 2;
  parts.push(`
    <rect x="${rightX}" y="${groundY}" width="${foundationWidth}" height="${foundationDepth}"
          fill="${showHatching ? "url(#hatch-concrete)" : COLORS.hatchFill}"
          stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>`);

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Generate exterior walls (cut through by section plane)
 */
function generateExteriorWalls(
  cuttingLength,
  buildingHeight,
  wallThickness,
  pixelsPerMeter,
  showHatching,
) {
  const wallW = wallThickness * pixelsPerMeter;
  const buildingH = buildingHeight * pixelsPerMeter;
  const cuttingW = cuttingLength * pixelsPerMeter;

  const fill = showHatching ? "url(#hatch-brick)" : COLORS.hatchFill;

  return `
  <g class="exterior-walls">
    <!-- Left wall (cut) -->
    <rect x="0" y="${-buildingH}" width="${wallW}" height="${buildingH}"
          fill="${fill}" stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>

    <!-- Right wall (cut) -->
    <rect x="${cuttingW - wallW}" y="${-buildingH}" width="${wallW}" height="${buildingH}"
          fill="${fill}" stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>
  </g>`;
}

/**
 * Generate floor slabs
 */
function generateFloorSlabs(
  floors,
  cuttingLength,
  pixelsPerMeter,
  showHatching,
) {
  const slabThickness = 0.25 * pixelsPerMeter;
  const cuttingW = cuttingLength * pixelsPerMeter;
  const fill = showHatching ? "url(#hatch-concrete)" : COLORS.hatchFill;

  const parts = ['<g class="floor-slabs">'];

  // Ground floor slab
  parts.push(`
    <rect x="0" y="${-slabThickness}" width="${cuttingW}" height="${slabThickness}"
          fill="${fill}" stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>`);

  // Upper floor slabs
  for (let i = 1; i < floors.length; i++) {
    const slabY = -floors[i].levelHeight * pixelsPerMeter;
    parts.push(`
      <rect x="0" y="${slabY}" width="${cuttingW}" height="${slabThickness}"
            fill="${fill}" stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>`);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Generate roof structure
 */
function generateRoof(
  dna,
  cuttingLength,
  buildingHeight,
  pixelsPerMeter,
  showHatching,
) {
  const roofType = dna?.roof?.type || dna?.geometry_rules?.roof_type || "gable";
  const roofPitch = dna?.roof?.pitch || 35; // degrees
  const cuttingW = cuttingLength * pixelsPerMeter;
  const buildingH = buildingHeight * pixelsPerMeter;
  const wallThickness = 0.3 * pixelsPerMeter;

  const parts = ['<g class="roof">'];

  if (roofType === "flat") {
    // Flat roof with parapet
    const parapetH = 0.3 * pixelsPerMeter;
    const roofThickness = 0.35 * pixelsPerMeter;

    parts.push(`
      <rect x="0" y="${-buildingH - roofThickness}" width="${cuttingW}" height="${roofThickness}"
            fill="${showHatching ? "url(#hatch-concrete)" : COLORS.hatchFill}"
            stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>
      <rect x="0" y="${-buildingH - roofThickness - parapetH}" width="${wallThickness}" height="${parapetH}"
            fill="${showHatching ? "url(#hatch-brick)" : COLORS.hatchFill}"
            stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>
      <rect x="${cuttingW - wallThickness}" y="${-buildingH - roofThickness - parapetH}" width="${wallThickness}" height="${parapetH}"
            fill="${showHatching ? "url(#hatch-brick)" : COLORS.hatchFill}"
            stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>`);
  } else {
    // Pitched roof (gable/hip simplified to gable profile)
    const pitchRad = (roofPitch * Math.PI) / 180;
    const roofRise = (cuttingW / 2) * Math.tan(pitchRad);
    const ridgeY = -buildingH - roofRise;
    const eaveY = -buildingH;
    const midX = cuttingW / 2;
    const roofThickness = 0.2 * pixelsPerMeter;

    // Roof outline
    const roofPath = buildSafePath([
      { cmd: "M", x: 0, y: eaveY },
      { cmd: "L", x: midX, y: ridgeY },
      { cmd: "L", x: cuttingW, y: eaveY },
      { cmd: "L", x: cuttingW - roofThickness, y: eaveY },
      { cmd: "L", x: midX, y: ridgeY + roofThickness },
      { cmd: "L", x: roofThickness, y: eaveY },
      { cmd: "Z" },
    ]);

    parts.push(`
      <path d="${roofPath}"
            fill="${showHatching ? "url(#hatch-concrete)" : COLORS.hatchFill}"
            stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>`);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Generate internal elements (simplified)
 */
function generateInternalElements(
  dna,
  sectionType,
  cuttingLength,
  buildingHeight,
  pixelsPerMeter,
) {
  // Internal walls would be shown in profile (beyond section plane)
  // For now, show a simplified internal partition
  const cuttingW = cuttingLength * pixelsPerMeter;
  const buildingH = buildingHeight * pixelsPerMeter;
  const floorHeight =
    (dna?.geometry_rules?.floor_height || 3.0) * pixelsPerMeter;

  const partitionX = cuttingW * 0.4;
  const partitionW = 0.15 * pixelsPerMeter;

  return `
  <g class="internal-elements">
    <!-- Internal partition (profile) -->
    <rect x="${partitionX}" y="${-floorHeight + 20}" width="${partitionW}" height="${floorHeight - 40}"
          fill="none" stroke="${COLORS.profile}" stroke-width="${LINE_WEIGHTS.PROFILE}"
          stroke-dasharray="10,5"/>
  </g>`;
}

/**
 * Generate window and door openings in section
 */
function generateOpeningsInSection(
  dna,
  sectionType,
  cuttingLength,
  floors,
  pixelsPerMeter,
) {
  const parts = ['<g class="openings">'];
  const wallThickness = 0.3 * pixelsPerMeter;

  // Add typical windows on each floor
  for (const floor of floors) {
    const floorY = -floor.ceilingHeight * pixelsPerMeter;
    const windowSillHeight = 0.9 * pixelsPerMeter;
    const windowHeight = 1.5 * pixelsPerMeter;
    const windowY =
      floorY + floor.height * pixelsPerMeter - windowSillHeight - windowHeight;

    // Window in left wall
    parts.push(`
      <rect x="0" y="${windowY}" width="${wallThickness}" height="${windowHeight}"
            fill="${COLORS.background}" stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>
      <line x1="0" y1="${windowY + windowHeight / 2}" x2="${wallThickness}" y2="${windowY + windowHeight / 2}"
            stroke="${COLORS.profile}" stroke-width="${LINE_WEIGHTS.PROFILE}"/>`);

    // Window in right wall
    const rightWallX = cuttingLength * pixelsPerMeter - wallThickness;
    parts.push(`
      <rect x="${rightWallX}" y="${windowY}" width="${wallThickness}" height="${windowHeight}"
            fill="${COLORS.background}" stroke="${COLORS.cut}" stroke-width="${LINE_WEIGHTS.CUT}"/>
      <line x1="${rightWallX}" y1="${windowY + windowHeight / 2}" x2="${rightWallX + wallThickness}" y2="${windowY + windowHeight / 2}"
            stroke="${COLORS.profile}" stroke-width="${LINE_WEIGHTS.PROFILE}"/>`);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Generate dimension chains
 */
function generateDimensions(
  cuttingLength,
  floors,
  buildingHeight,
  pixelsPerMeter,
) {
  const parts = ['<g class="dimensions">'];
  const cuttingW = cuttingLength * pixelsPerMeter;
  const buildingH = buildingHeight * pixelsPerMeter;
  const dimOffset = 40;
  const textOffset = 15;

  // Horizontal dimension (building length)
  parts.push(`
    <line x1="0" y1="${dimOffset}" x2="${cuttingW}" y2="${dimOffset}"
          stroke="${COLORS.dimension}" stroke-width="${LINE_WEIGHTS.DIMENSION}"
          marker-start="url(#dim-arrow-start)" marker-end="url(#dim-arrow-end)"/>
    <text x="${cuttingW / 2}" y="${dimOffset + textOffset}"
          font-family="Arial, sans-serif" font-size="14" fill="${COLORS.dimension}"
          text-anchor="middle">${cuttingLength.toFixed(1)}m</text>`);

  // Vertical dimension (total height)
  const vertDimX = -dimOffset;
  parts.push(`
    <line x1="${vertDimX}" y1="0" x2="${vertDimX}" y2="${-buildingH}"
          stroke="${COLORS.dimension}" stroke-width="${LINE_WEIGHTS.DIMENSION}"
          marker-start="url(#dim-arrow-start)" marker-end="url(#dim-arrow-end)"/>
    <text x="${vertDimX - textOffset}" y="${-buildingH / 2}"
          font-family="Arial, sans-serif" font-size="14" fill="${COLORS.dimension}"
          text-anchor="middle" transform="rotate(-90, ${vertDimX - textOffset}, ${-buildingH / 2})">${buildingHeight.toFixed(1)}m</text>`);

  // Floor heights
  for (let i = 0; i < floors.length; i++) {
    const floorY = -floors[i].levelHeight * pixelsPerMeter;
    const levelLabel = i === 0 ? "GL" : `L${i}`;
    parts.push(`
      <text x="${-20}" y="${floorY + 5}"
            font-family="Arial, sans-serif" font-size="12" fill="${COLORS.dimension}"
            text-anchor="end">${levelLabel}</text>`);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Generate title block
 */
function generateTitle(sectionType, svgWidth, svgHeight, margin) {
  const sectionLabel =
    sectionType === "longitudinal" ? "SECTION A-A" : "SECTION B-B";
  const description =
    sectionType === "longitudinal"
      ? "LONGITUDINAL SECTION"
      : "TRANSVERSE SECTION";

  return `
  <g class="title">
    <text x="${svgWidth / 2}" y="${margin / 2}"
          font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="${COLORS.cut}"
          text-anchor="middle">${sectionLabel}</text>
    <text x="${svgWidth / 2}" y="${margin / 2 + 25}"
          font-family="Arial, sans-serif" font-size="14" fill="${COLORS.profile}"
          text-anchor="middle">${description}</text>
  </g>`;
}

/**
 * Generate section line markers
 */
function generateSectionMarkers(sectionType, svgWidth, svgHeight, margin) {
  const label = sectionType === "longitudinal" ? "A" : "B";

  return `
  <g class="section-markers">
    <!-- Left marker -->
    <circle cx="${margin}" cy="${svgHeight / 2}" r="15" fill="white" stroke="${COLORS.cut}" stroke-width="2"/>
    <text x="${margin}" y="${svgHeight / 2 + 5}"
          font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="${COLORS.cut}"
          text-anchor="middle">${label}</text>

    <!-- Right marker -->
    <circle cx="${svgWidth - margin}" cy="${svgHeight / 2}" r="15" fill="white" stroke="${COLORS.cut}" stroke-width="2"/>
    <text x="${svgWidth - margin}" y="${svgHeight / 2 + 5}"
          font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="${COLORS.cut}"
          text-anchor="middle">${label}</text>
  </g>`;
}

/**
 * Generate scale bar
 */
function generateScaleBar(scale, margin, svgHeight) {
  const scaleBarLength = 100; // pixels
  const scaleValue = scale / 100; // meters represented

  return `
  <g class="scale-bar">
    <line x1="${margin}" y1="${svgHeight - 30}" x2="${margin + scaleBarLength}" y2="${svgHeight - 30}"
          stroke="${COLORS.cut}" stroke-width="2"/>
    <line x1="${margin}" y1="${svgHeight - 35}" x2="${margin}" y2="${svgHeight - 25}"
          stroke="${COLORS.cut}" stroke-width="2"/>
    <line x1="${margin + scaleBarLength}" y1="${svgHeight - 35}" x2="${margin + scaleBarLength}" y2="${svgHeight - 25}"
          stroke="${COLORS.cut}" stroke-width="2"/>
    <text x="${margin + scaleBarLength / 2}" y="${svgHeight - 15}"
          font-family="Arial, sans-serif" font-size="12" fill="${COLORS.dimension}"
          text-anchor="middle">0 — ${scaleValue.toFixed(0)}m (1:${scale})</text>
  </g>`;
}

/**
 * Generate section SVG with specified options
 * Convenience wrapper for generateFromDNA
 */
export function generateSection(
  dna,
  sectionType = "longitudinal",
  options = {},
) {
  return generateFromDNA(dna, { ...options, sectionType });
}

/**
 * Generate longitudinal section (A-A)
 */
export function generateLongitudinalSection(dna, options = {}) {
  return generateFromDNA(dna, { ...options, sectionType: "longitudinal" });
}

/**
 * Generate transverse section (B-B)
 */
export function generateTransverseSection(dna, options = {}) {
  return generateFromDNA(dna, { ...options, sectionType: "transverse" });
}

export default {
  HATCH_PATTERNS,
  generateFromDNA,
  generateSection,
  generateLongitudinalSection,
  generateTransverseSection,
};
