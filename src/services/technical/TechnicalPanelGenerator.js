/**
 * Technical Panel Generator
 *
 * Generates technical 2D panels (floor plans, elevations, sections) with preference
 * for procedural/vector generation over diffusion-based approaches.
 *
 * Priority order:
 * 1. Vector/SVG generation from geometry data (if available)
 * 2. Diffusion fallback with strict orthographic prompts
 *
 * Features:
 * - Higher resolution for crisp technical lines (2400x1600)
 * - Consistent lineweights
 * - Scale bars and dimension annotations
 * - North arrows for floor plans
 * - Room labels and dimensions
 *
 * @module services/technical/TechnicalPanelGenerator
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../core/logger.js";
import { getStyleZone, MINIMUM_SIZES } from "../a1/A1GridSpec12Column.js";
import { getVerbatimPromptLock } from "../design/designFingerprintService.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Technical panel configuration
 */
export const TECHNICAL_CONFIG = {
  // Panels that should use vector/procedural generation
  vectorPanels: [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "site_diagram",
  ],

  // Generation resolution for technical panels (higher than default)
  resolution: {
    width: 2400,
    height: 1600,
  },

  // Lineweight standards (pixels at 2400px width, CAD-equivalent at 300 DPI)
  lineweights: {
    outline: 6, // Building outline, section cuts (0.7mm CAD)
    major: 4, // Primary walls, major features (0.5mm CAD)
    minor: 2, // Interior walls, secondary features (0.25mm CAD)
    dimension: 1.5, // Dimension lines, annotations (0.18mm CAD)
    grid: 1, // Background grid (if used)
    hatch: 0.5, // Hatch patterns
  },

  // Text size standards (points, for legibility at A1 print)
  textSizes: {
    title: 18, // Panel titles - BOLD
    roomLabel: 16, // Room names - BOLD UPPERCASE
    dimension: 12, // Dimension values - BOLD
    annotation: 10, // Notes, minor labels
    scaleText: 11, // Scale bar text
  },

  // Colors for technical drawings
  colors: {
    outline: "#1a1a1a",
    walls: "#333333",
    openings: "#666666",
    dimensions: "#555555",
    labels: "#222222",
    hatch: "#999999",
    background: "#ffffff",
    sectionCut: "#000000",
  },

  // Label requirements
  labels: {
    roomNames: true,
    dimensions: true,
    scaleBar: true,
    northArrow: true, // For plans only
    levelIndicator: true,
    drawingTitle: true,
    gridLines: false, // Optional
  },

  // Scale bar configuration
  scaleBar: {
    scale: "1:100", // Default scale
    barLength: 200, // Pixels
    divisions: 5,
    position: "bottom-left",
  },
};

// =============================================================================
// TECHNICAL PANEL GENERATOR CLASS
// =============================================================================

export class TechnicalPanelGenerator {
  constructor(options = {}) {
    this.config = { ...TECHNICAL_CONFIG, ...options };
    this.useVectorGeneration = isFeatureEnabled("vectorPanelGeneration");
  }

  /**
   * Generate a technical panel
   *
   * @param {string} panelType - Panel type identifier
   * @param {Object} masterDNA - Master design DNA
   * @param {Object} fingerprint - Design fingerprint for consistency
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated panel result
   */
  async generate(panelType, masterDNA, fingerprint, options = {}) {
    const styleZone = getStyleZone(panelType);

    // Only handle technical panels
    if (styleZone !== "technical") {
      throw new Error(`TechnicalPanelGenerator only handles technical panels, not ${panelType}`);
    }

    logger.info(`Generating technical panel: ${panelType}`);

    // Try vector generation first if available
    if (this.useVectorGeneration && this.canGenerateVector(panelType, masterDNA)) {
      logger.info(`  Using vector/SVG generation for ${panelType}`);
      return this.generateVectorPanel(panelType, masterDNA, fingerprint, options);
    }

    // Fall back to diffusion with strict orthographic prompts
    logger.info(`  Using diffusion with strict orthographic prompts for ${panelType}`);
    return this.generateDiffusionPanel(panelType, masterDNA, fingerprint, options);
  }

  /**
   * Check if vector generation is possible for this panel
   */
  canGenerateVector(panelType, masterDNA) {
    // Check if we have sufficient geometry data
    const hasGeometry = masterDNA?._geometry || masterDNA?.geometry;
    const hasRooms = masterDNA?.rooms?.length > 0 || masterDNA?._structured?.program?.rooms?.length > 0;

    // Vector generation requires geometry data
    if (!hasGeometry && !hasRooms) {
      return false;
    }

    // Check if this panel type supports vector generation
    return this.config.vectorPanels.includes(panelType);
  }

  /**
   * Generate a panel using vector/SVG rendering
   */
  async generateVectorPanel(panelType, masterDNA, fingerprint, options = {}) {
    const { width, height } = this.config.resolution;

    try {
      // Build SVG based on panel type
      let svgContent;

      if (panelType.includes("floor_plan")) {
        svgContent = this.generateFloorPlanSVG(panelType, masterDNA, { width, height });
      } else if (panelType.includes("elevation")) {
        svgContent = this.generateElevationSVG(panelType, masterDNA, { width, height });
      } else if (panelType.includes("section")) {
        svgContent = this.generateSectionSVG(panelType, masterDNA, { width, height });
      } else if (panelType === "site_diagram") {
        svgContent = this.generateSiteDiagramSVG(masterDNA, { width, height });
      }

      // Convert SVG to data URL
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;

      return {
        type: panelType,
        imageUrl: dataUrl,
        format: "svg",
        width,
        height,
        generationMethod: "vector",
        metadata: {
          lineweights: this.config.lineweights,
          scale: this.config.scaleBar.scale,
        },
      };
    } catch (error) {
      logger.warn(`Vector generation failed for ${panelType}: ${error.message}`);
      logger.info(`  Falling back to diffusion generation`);
      return this.generateDiffusionPanel(panelType, masterDNA, fingerprint, options);
    }
  }

  /**
   * Generate a panel using diffusion with strict orthographic prompts
   */
  async generateDiffusionPanel(panelType, masterDNA, fingerprint, options = {}) {
    const { width, height } = this.config.resolution;

    // Build strict orthographic prompt
    const prompt = this.buildStrictOrthographicPrompt(panelType, masterDNA, fingerprint);
    const negativePrompt = this.buildNegativePrompt(panelType);

    return {
      type: panelType,
      prompt,
      negativePrompt,
      width,
      height,
      generationMethod: "diffusion_strict_ortho",
      generationParams: {
        steps: 40, // More steps for precision
        guidanceScale: 7.5,
        seed: options.seed,
      },
      metadata: {
        fingerprint: fingerprint?.id,
        strictOrtho: true,
      },
    };
  }

  /**
   * Build strict orthographic prompt for diffusion
   */
  buildStrictOrthographicPrompt(panelType, masterDNA, fingerprint) {
    // Get verbatim fingerprint lock
    const fingerprintLock = getVerbatimPromptLock(fingerprint);

    // Get panel-specific base prompt
    const basePrompt = this.getPanelBasePrompt(panelType, masterDNA);

    // Build strict orthographic requirements with CAD-standard lineweights
    const orthoRequirements = `
STRICT TECHNICAL REQUIREMENTS:
- TRUE ORTHOGRAPHIC PROJECTION (absolutely NO perspective distortion)
- Pure white background (#FFFFFF), no gradients, no textures, no shadows
- Clean technical drawing aesthetic, professional CAD-like appearance

MANDATORY LINEWEIGHT SPECIFICATION (must be visually distinct):
- Building outline and section cuts: HEAVY BLACK (${this.config.lineweights.outline}px / 0.7mm print)
- Primary walls: BOLD (${this.config.lineweights.major}px / 0.5mm print)
- Interior walls and secondary elements: MEDIUM (${this.config.lineweights.minor}px / 0.25mm print)
- Dimension lines: THIN (${this.config.lineweights.dimension}px / 0.18mm print)

MANDATORY TEXT SIZES (must be clearly legible):
- Room labels: ${this.config.textSizes?.roomLabel || 16}pt BOLD UPPERCASE (e.g., "LIVING ROOM 5.5×4.0m")
- Dimension text: ${this.config.textSizes?.dimension || 12}pt BOLD
- Annotations: ${this.config.textSizes?.annotation || 10}pt regular
- All text must be BLACK on WHITE, Arial/Helvetica style font

- Include scale bar (${this.config.scaleBar.scale} @ A1)
${panelType.includes("floor_plan") ? "- Include north arrow pointing UP\n- Room labels with names and AREAS in square meters" : ""}
${panelType.includes("elevation") ? "- Include level lines and heights\n- Material indication through hatching patterns" : ""}
${panelType.includes("section") ? "- Section cut shown in HEAVY BLACK line\n- Include dimension chains for floor-to-floor heights" : ""}
- Dimension lines for ALL key measurements
- No artistic interpretation - pure technical documentation`;

    return `${basePrompt}\n\n${orthoRequirements}\n\n${fingerprintLock}`;
  }

  /**
   * Build negative prompt for technical panels
   */
  buildNegativePrompt(panelType) {
    return `
perspective, 3D view, isometric, axonometric, vanishing point,
shadows, ambient occlusion, reflections, glossy,
gradients, color tints, sepia, vintage,
artistic interpretation, painterly, sketch, hand-drawn,
photorealistic, photograph, render,
blurry, low resolution, pixelated,
watermark, text overlay, logo,
incomplete, cut off, partial,
grid paper, graph paper, lined paper,
collage, multiple views, split image
`.trim().replace(/\n/g, ", ");
  }

  /**
   * Get panel-specific base prompt
   */
  getPanelBasePrompt(panelType, masterDNA) {
    const dims = masterDNA?.dimensions || {};
    const rooms = masterDNA?._structured?.program?.rooms || masterDNA?.rooms || [];

    const prompts = {
      floor_plan_ground: `
Architectural floor plan, ground floor level, 2D overhead orthographic view,
showing ${rooms.filter(r => r.floor === "ground" || r.floor === 0).map(r => r.name).join(", ")},
building footprint ${dims.length || 15}m × ${dims.width || 10}m,
clear wall outlines, door swings, window symbols,
room labels with dimensions, circulation arrows
`.trim(),

      floor_plan_first: `
Architectural floor plan, first floor level, 2D overhead orthographic view,
showing upper level rooms and circulation,
clear wall outlines, door swings, window symbols,
stair location indicated, room labels with dimensions
`.trim(),

      floor_plan_level2: `
Architectural floor plan, second floor level, 2D overhead orthographic view,
upper level layout, clear wall outlines,
door swings, window symbols, room labels
`.trim(),

      elevation_north: `
Architectural elevation, north facade, true orthographic projection,
showing full building height ${dims.height || 7.5}m,
window openings, door, material indication,
level lines, height dimensions, clean technical style
`.trim(),

      elevation_south: `
Architectural elevation, south facade, true orthographic projection,
showing full building height, rear facade features,
window openings, material indication,
level lines, height dimensions
`.trim(),

      elevation_east: `
Architectural elevation, east facade, true orthographic projection,
side elevation view, gable end visible,
window openings, material indication,
level lines, height dimensions
`.trim(),

      elevation_west: `
Architectural elevation, west facade, true orthographic projection,
side elevation view, gable end visible,
window openings, material indication,
level lines, height dimensions
`.trim(),

      section_AA: `
Architectural section, longitudinal cut through building,
section A-A, true orthographic projection,
showing floor-to-floor heights, foundation, roof structure,
interior spatial relationships, dimension chains
`.trim(),

      section_BB: `
Architectural section, transverse cut through building,
section B-B, true orthographic projection,
showing floor-to-floor heights, wall construction,
stair section, roof profile, dimension chains
`.trim(),

      site_diagram: `
Site plan diagram, 2D overhead orthographic view,
showing building footprint on site, property boundaries,
north arrow, scale bar, access points,
landscape indication, neighboring context
`.trim(),
    };

    return prompts[panelType] || `Architectural ${panelType} drawing, technical orthographic view`;
  }

  // =============================================================================
  // SVG GENERATION METHODS
  // =============================================================================

  /**
   * Generate floor plan SVG
   */
  generateFloorPlanSVG(panelType, masterDNA, { width, height }) {
    const { colors, lineweights } = this.config;
    const rooms = masterDNA?._structured?.program?.rooms || masterDNA?.rooms || [];
    const dims = masterDNA?.dimensions || { length: 15, width: 10 };

    // Determine which floor to show
    const floorLevel = panelType.includes("ground")
      ? 0
      : panelType.includes("first")
        ? 1
        : 2;
    const floorRooms = rooms.filter(
      (r) => r.floor === floorLevel || r.floor === "ground" && floorLevel === 0
    );

    // Calculate scale to fit
    const margin = 100;
    const scale = Math.min(
      (width - 2 * margin) / dims.length,
      (height - 2 * margin) / dims.width
    );

    // Start SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <g transform="translate(${margin}, ${margin})">`;

    // Draw building outline
    const bWidth = dims.length * scale;
    const bHeight = dims.width * scale;
    svg += `
    <rect x="0" y="0" width="${bWidth}" height="${bHeight}"
          fill="none" stroke="${colors.outline}" stroke-width="${lineweights.outline}"/>`;

    // Draw rooms (simplified - would use actual room geometry in production)
    let roomX = 0;
    for (const room of floorRooms.slice(0, 4)) {
      const roomWidth = (room.area_m2 || 20) / dims.width * scale;
      svg += `
    <rect x="${roomX}" y="0" width="${roomWidth}" height="${bHeight}"
          fill="none" stroke="${colors.walls}" stroke-width="${lineweights.major}"/>
    <text x="${roomX + roomWidth / 2}" y="${bHeight / 2}"
          font-family="Arial" font-size="14" fill="${colors.labels}" text-anchor="middle">
      ${room.name || "Room"}
    </text>`;
      roomX += roomWidth;
    }

    // Add north arrow for floor plans
    svg += `
    <g transform="translate(${bWidth + 30}, 30)">
      <polygon points="0,30 10,0 20,30" fill="none" stroke="${colors.outline}" stroke-width="2"/>
      <text x="10" y="45" font-family="Arial" font-size="12" fill="${colors.labels}" text-anchor="middle">N</text>
    </g>`;

    // Add scale bar
    svg += this.generateScaleBarSVG(10, bHeight + 40, scale);

    // Add title
    svg += `
    <text x="${bWidth / 2}" y="${bHeight + 80}"
          font-family="Arial" font-size="16" font-weight="bold" fill="${colors.labels}" text-anchor="middle">
      ${panelType.replace(/_/g, " ").toUpperCase()}
    </text>`;

    svg += `
  </g>
</svg>`;

    return svg;
  }

  /**
   * Generate elevation SVG
   */
  generateElevationSVG(panelType, masterDNA, { width, height }) {
    const { colors, lineweights } = this.config;
    const dims = masterDNA?.dimensions || { length: 15, height: 7.5 };
    const roof = masterDNA?._structured?.geometry?.roof || masterDNA?.roof || { type: "gable", pitch: 35 };

    // Calculate scale
    const margin = 100;
    const scale = Math.min(
      (width - 2 * margin) / dims.length,
      (height - 2 * margin) / (dims.height + 3) // Extra for roof
    );

    const bWidth = dims.length * scale;
    const bHeight = dims.height * scale;

    // Start SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <g transform="translate(${margin}, ${margin + 50})">`;

    // Draw roof (gable)
    const roofPeak = Math.tan((roof.pitch || 35) * Math.PI / 180) * (bWidth / 2);
    svg += `
    <polygon points="0,0 ${bWidth / 2},${-roofPeak} ${bWidth},0"
             fill="none" stroke="${colors.outline}" stroke-width="${lineweights.outline}"/>`;

    // Draw building outline
    svg += `
    <rect x="0" y="0" width="${bWidth}" height="${bHeight}"
          fill="none" stroke="${colors.outline}" stroke-width="${lineweights.outline}"/>`;

    // Draw windows (simplified)
    const windowCount = 4;
    const windowWidth = bWidth / 8;
    const windowHeight = bHeight / 4;
    for (let i = 0; i < windowCount; i++) {
      const wx = (i + 0.5) * (bWidth / windowCount) - windowWidth / 2;
      svg += `
    <rect x="${wx}" y="${bHeight * 0.3}" width="${windowWidth}" height="${windowHeight}"
          fill="none" stroke="${colors.openings}" stroke-width="${lineweights.major}"/>`;
    }

    // Draw door (north elevation only)
    if (panelType === "elevation_north") {
      svg += `
    <rect x="${bWidth / 2 - 20}" y="${bHeight - 60}" width="40" height="60"
          fill="none" stroke="${colors.openings}" stroke-width="${lineweights.major}"/>`;
    }

    // Add level lines
    svg += `
    <line x1="${-20}" y1="0" x2="${bWidth + 20}" y2="0"
          stroke="${colors.dimensions}" stroke-width="${lineweights.dimension}" stroke-dasharray="5,5"/>
    <text x="${bWidth + 30}" y="5" font-family="Arial" font-size="10" fill="${colors.dimensions}">+${dims.height}m</text>

    <line x1="${-20}" y1="${bHeight}" x2="${bWidth + 20}" y2="${bHeight}"
          stroke="${colors.dimensions}" stroke-width="${lineweights.dimension}" stroke-dasharray="5,5"/>
    <text x="${bWidth + 30}" y="${bHeight + 5}" font-family="Arial" font-size="10" fill="${colors.dimensions}">+0.00</text>`;

    // Add scale bar
    svg += this.generateScaleBarSVG(10, bHeight + 40, scale);

    // Add title
    svg += `
    <text x="${bWidth / 2}" y="${bHeight + 80}"
          font-family="Arial" font-size="16" font-weight="bold" fill="${colors.labels}" text-anchor="middle">
      ${panelType.replace(/_/g, " ").toUpperCase()}
    </text>`;

    svg += `
  </g>
</svg>`;

    return svg;
  }

  /**
   * Generate section SVG
   */
  generateSectionSVG(panelType, masterDNA, { width, height }) {
    const { colors, lineweights } = this.config;
    const dims = masterDNA?.dimensions || { length: 15, height: 7.5, floors: 2 };

    const margin = 100;
    const scale = Math.min(
      (width - 2 * margin) / dims.length,
      (height - 2 * margin) / (dims.height + 3)
    );

    const bWidth = dims.length * scale;
    const bHeight = dims.height * scale;
    const floorHeight = bHeight / (dims.floors || 2);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <g transform="translate(${margin}, ${margin + 50})">`;

    // Draw section cut (bold black fill for walls)
    svg += `
    <rect x="0" y="0" width="20" height="${bHeight}" fill="${colors.sectionCut}"/>
    <rect x="${bWidth - 20}" y="0" width="20" height="${bHeight}" fill="${colors.sectionCut}"/>`;

    // Draw floor slabs
    for (let f = 0; f <= (dims.floors || 2); f++) {
      const y = f * floorHeight;
      svg += `
    <rect x="0" y="${y - 5}" width="${bWidth}" height="10" fill="${colors.sectionCut}"/>`;
    }

    // Draw roof triangle
    const roofPeak = Math.tan(35 * Math.PI / 180) * (bWidth / 2);
    svg += `
    <polygon points="0,0 ${bWidth / 2},${-roofPeak} ${bWidth},0"
             fill="none" stroke="${colors.outline}" stroke-width="${lineweights.outline}"/>`;

    // Add dimension chain
    svg += `
    <line x1="${-40}" y1="0" x2="${-40}" y2="${bHeight}"
          stroke="${colors.dimensions}" stroke-width="${lineweights.dimension}"/>
    <text x="${-50}" y="${bHeight / 2}" font-family="Arial" font-size="10" fill="${colors.dimensions}"
          transform="rotate(-90, ${-50}, ${bHeight / 2})">${dims.height}m</text>`;

    // Add scale bar
    svg += this.generateScaleBarSVG(10, bHeight + 40, scale);

    // Add title
    svg += `
    <text x="${bWidth / 2}" y="${bHeight + 80}"
          font-family="Arial" font-size="16" font-weight="bold" fill="${colors.labels}" text-anchor="middle">
      ${panelType.replace(/_/g, " ").toUpperCase()}
    </text>`;

    svg += `
  </g>
</svg>`;

    return svg;
  }

  /**
   * Generate site diagram SVG
   */
  generateSiteDiagramSVG(masterDNA, { width, height }) {
    const { colors, lineweights } = this.config;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <g transform="translate(100, 100)">
    <!-- Site boundary -->
    <rect x="0" y="0" width="${width - 200}" height="${height - 250}"
          fill="none" stroke="${colors.outline}" stroke-width="${lineweights.major}" stroke-dasharray="10,5"/>

    <!-- Building footprint -->
    <rect x="${(width - 200) / 4}" y="${(height - 250) / 4}"
          width="${(width - 200) / 2}" height="${(height - 250) / 2}"
          fill="#f0f0f0" stroke="${colors.outline}" stroke-width="${lineweights.outline}"/>

    <!-- North arrow -->
    <g transform="translate(${width - 280}, 30)">
      <polygon points="0,40 15,0 30,40" fill="none" stroke="${colors.outline}" stroke-width="2"/>
      <text x="15" y="55" font-family="Arial" font-size="14" fill="${colors.labels}" text-anchor="middle">N</text>
    </g>

    <!-- Title -->
    <text x="${(width - 200) / 2}" y="${height - 220}"
          font-family="Arial" font-size="16" font-weight="bold" fill="${colors.labels}" text-anchor="middle">
      SITE DIAGRAM
    </text>
  </g>
</svg>`;

    return svg;
  }

  /**
   * Generate scale bar SVG element
   */
  generateScaleBarSVG(x, y, scale) {
    const { colors, lineweights, scaleBar } = this.config;
    const barLength = scaleBar.barLength;
    const divisions = scaleBar.divisions;
    const divWidth = barLength / divisions;
    const metersPerDiv = Math.round(barLength / scale / divisions);

    let svg = `
    <g transform="translate(${x}, ${y})">
      <text x="0" y="-5" font-family="Arial" font-size="10" fill="${colors.dimensions}">${scaleBar.scale}</text>`;

    for (let i = 0; i < divisions; i++) {
      const fill = i % 2 === 0 ? colors.outline : colors.background;
      svg += `
      <rect x="${i * divWidth}" y="0" width="${divWidth}" height="8"
            fill="${fill}" stroke="${colors.outline}" stroke-width="${lineweights.dimension}"/>`;
    }

    svg += `
      <text x="0" y="20" font-family="Arial" font-size="8" fill="${colors.dimensions}">0</text>
      <text x="${barLength}" y="20" font-family="Arial" font-size="8" fill="${colors.dimensions}">${metersPerDiv * divisions}m</text>
    </g>`;

    return svg;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

const technicalGenerator = new TechnicalPanelGenerator();

export default technicalGenerator;

export { TECHNICAL_CONFIG };
