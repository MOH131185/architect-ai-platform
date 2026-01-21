/**
 * Technical Drawing Generator
 *
 * Wires up deterministic SVG generators for Lane A (technical panels):
 * - Floor plans (via ArchitecturalFloorPlanGenerator)
 * - Elevations (via ArchitecturalElevationGenerator)
 * - Sections (via ArchitecturalSectionGenerator)
 *
 * These are DETERMINISTIC outputs (same DNA always produces same SVG).
 * No AI text rendering for schedules/notes - uses SVG templates with real fonts.
 *
 * @module technicalDrawingGenerator
 */

import {
  generateFromDNA as generateFloorPlanFromDNA,
  generateAllFloorPlanSVGs,
  FloorPlanValidationError,
} from "../svg/ArchitecturalFloorPlanGenerator.js";
import { generateFromDNA as generateElevationFromDNA } from "../svg/ArchitecturalElevationGenerator.js";
import { generateFromDNA as generateSectionFromDNA } from "../svg/ArchitecturalSectionGenerator.js";
import { validateSVG } from "../../utils/svgPathValidator.js";
import logger from "../../utils/logger.js";

/**
 * Generate floor plan SVG from DNA
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @param {number} options.floor - Floor index (0 = ground, 1 = first, etc.)
 * @param {boolean} options.showFurniture - Show furniture symbols (default: true)
 * @param {boolean} options.showDimensions - Show dimension lines (default: true)
 * @param {number} options.scale - Pixels per meter (default: 50)
 * @returns {string} SVG string
 * @throws {FloorPlanValidationError} If floor plan validation fails
 */
export function generateFloorPlanSVG(dna, options = {}) {
  const {
    floor = 0,
    showFurniture = true,
    showDimensions = true,
    scale = 50,
  } = options;

  logger.info(
    `[TechnicalDrawing] Generating floor plan SVG for floor ${floor}`,
  );

  try {
    // Use the full ArchitecturalFloorPlanGenerator via generateFromDNA
    const svg = generateFloorPlanFromDNA(dna, floor, {
      showFurniture,
      showDimensions,
      scale,
    });

    // Validate the generated SVG
    const validation = validateSVG(svg, {
      panelType: `floor_plan_${floor}`,
      generator: "technicalDrawingGenerator",
      invalidPathAction: "abort",
    });

    if (!validation.valid) {
      logger.error(
        `[TechnicalDrawing] Floor plan SVG validation failed: ${validation.invalidPathCount} invalid paths`,
      );
      throw new FloorPlanValidationError("SVG validation failed", {
        floor,
        invalidPathCount: validation.invalidPathCount,
        reason: "SVG_VALIDATION_FAILED",
      });
    }

    logger.info(
      `[TechnicalDrawing] Floor plan SVG generated successfully (${svg.length} chars)`,
    );
    return svg;
  } catch (error) {
    if (error instanceof FloorPlanValidationError) {
      throw error;
    }
    logger.error(
      `[TechnicalDrawing] Floor plan generation failed: ${error.message}`,
    );
    throw new FloorPlanValidationError(
      `Floor plan generation failed: ${error.message}`,
      {
        floor,
        reason: "GENERATION_ERROR",
        originalError: error.message,
      },
    );
  }
}

/**
 * Generate all floor plan SVGs for a building
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @returns {Object} Map of floor index to SVG string { 0: "...", 1: "...", ... }
 */
export function generateAllFloorPlans(dna, options = {}) {
  return generateAllFloorPlanSVGs(dna, [], options);
}

/**
 * Generate elevation SVG from DNA
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @param {string} options.orientation - Elevation orientation ('north', 'south', 'east', 'west')
 * @param {boolean} options.showDimensions - Show dimension lines (default: true)
 * @param {boolean} options.showMaterialPatterns - Show material patterns (default: true)
 * @param {number} options.scale - Pixels per meter (default: 50)
 * @returns {string} SVG string
 */
export function generateElevationSVG(dna, options = {}) {
  const {
    orientation = "north",
    showDimensions = true,
    showMaterialPatterns = true,
    scale = 50,
  } = options;

  logger.info(`[TechnicalDrawing] Generating elevation SVG for ${orientation}`);

  try {
    const svg = generateElevationFromDNA(dna, orientation, {
      showDimensions,
      showMaterialPatterns,
      scale,
    });

    // Validate the generated SVG
    const validation = validateSVG(svg, {
      panelType: `elevation_${orientation}`,
      generator: "technicalDrawingGenerator",
      invalidPathAction: "fallback",
    });

    if (!validation.valid) {
      logger.warn(
        `[TechnicalDrawing] Elevation SVG has ${validation.invalidPathCount} invalid paths, using sanitized version`,
      );
      return validation.sanitizedSVG;
    }

    logger.info(
      `[TechnicalDrawing] Elevation SVG generated successfully (${svg.length} chars)`,
    );
    return svg;
  } catch (error) {
    logger.error(
      `[TechnicalDrawing] Elevation generation failed: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Generate all elevation SVGs for a building
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @returns {Object} Map of orientation to SVG string
 */
export function generateAllElevations(dna, options = {}) {
  const orientations = ["north", "south", "east", "west"];
  const elevations = {};

  for (const orientation of orientations) {
    try {
      elevations[orientation] = generateElevationSVG(dna, {
        ...options,
        orientation,
      });
    } catch (error) {
      logger.warn(
        `[TechnicalDrawing] Failed to generate ${orientation} elevation: ${error.message}`,
      );
      elevations[orientation] = null;
    }
  }

  return elevations;
}

/**
 * Generate section SVG from DNA
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @param {string} options.sectionType - Section type ('longitudinal' for A-A, 'transverse' for B-B)
 * @param {boolean} options.showDimensions - Show dimension lines (default: true)
 * @param {boolean} options.showHatching - Show material hatching (default: true)
 * @param {number} options.scale - Drawing scale (default: 100 for 1:100)
 * @returns {string} SVG string
 */
export function generateSectionSVG(dna, options = {}) {
  const {
    sectionType = "longitudinal",
    showDimensions = true,
    showHatching = true,
    scale = 100,
  } = options;

  logger.info(`[TechnicalDrawing] Generating section SVG for ${sectionType}`);

  try {
    const svg = generateSectionFromDNA(dna, {
      sectionType,
      showDimensions,
      showHatching,
      scale,
    });

    // Validate the generated SVG
    const validation = validateSVG(svg, {
      panelType: `section_${sectionType}`,
      generator: "technicalDrawingGenerator",
      invalidPathAction: "fallback",
    });

    if (!validation.valid) {
      logger.warn(
        `[TechnicalDrawing] Section SVG has ${validation.invalidPathCount} invalid paths, using sanitized version`,
      );
      return validation.sanitizedSVG;
    }

    logger.info(
      `[TechnicalDrawing] Section SVG generated successfully (${svg.length} chars)`,
    );
    return svg;
  } catch (error) {
    logger.error(
      `[TechnicalDrawing] Section generation failed: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Generate all section SVGs for a building
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @returns {Object} Map of section type to SVG string
 */
export function generateAllSections(dna, options = {}) {
  return {
    longitudinal: generateSectionSVG(dna, {
      ...options,
      sectionType: "longitudinal",
    }),
    transverse: generateSectionSVG(dna, {
      ...options,
      sectionType: "transverse",
    }),
  };
}

/**
 * Generate schedules/notes panel as SVG
 * This is NOT AI-generated - uses SVG templates with real fonts.
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
export function generateSchedulesSVG(dna, options = {}) {
  const { width = 600, height = 400 } = options;

  logger.info("[TechnicalDrawing] Generating schedules/notes SVG");

  // Extract relevant data from DNA
  const rooms = dna?.rooms || dna?.program?.rooms || [];
  const materials = dna?.materials || [];
  const dimensions = dna?.dimensions || {};
  const projectName = dna?.projectName || "Architectural Project";

  // Build SVG with real text (not AI-generated)
  const parts = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  );

  // Title
  parts.push(
    `  <text x="${width / 2}" y="30" font-family="Arial, sans-serif" font-size="18" font-weight="bold" text-anchor="middle" fill="#1a1a1a">SCHEDULES &amp; NOTES</text>`,
  );

  // Room Schedule Table Header
  parts.push(`  <g id="room-schedule" transform="translate(20, 60)">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333">ROOM SCHEDULE</text>`,
  );
  parts.push(
    `    <line x1="0" y1="5" x2="260" y2="5" stroke="#333" stroke-width="1"/>`,
  );

  // Table headers
  parts.push(
    `    <text x="0" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Room</text>`,
  );
  parts.push(
    `    <text x="100" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Area (m²)</text>`,
  );
  parts.push(
    `    <text x="160" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Floor</text>`,
  );
  parts.push(
    `    <text x="210" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Finish</text>`,
  );
  parts.push(
    `    <line x1="0" y1="30" x2="260" y2="30" stroke="#666" stroke-width="0.5"/>`,
  );

  // Room rows
  let y = 45;
  const maxRooms = Math.min(rooms.length, 10);
  for (let i = 0; i < maxRooms; i++) {
    const room = rooms[i];
    const roomName = room.name || room.type || `Room ${i + 1}`;
    const area =
      room.area ||
      (room.dimensions?.width || 4) * (room.dimensions?.length || 4);
    const floor =
      room.floor ??
      (room.level === "ground" ? 0 : room.level === "first" ? 1 : 0);
    const finish = room.finish || "Plaster/Paint";

    parts.push(
      `    <text x="0" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${escapeXml(roomName.substring(0, 15))}</text>`,
    );
    parts.push(
      `    <text x="100" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${area.toFixed(1)}</text>`,
    );
    parts.push(
      `    <text x="160" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${floor === 0 ? "Ground" : `Level ${floor}`}</text>`,
    );
    parts.push(
      `    <text x="210" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${escapeXml(finish.substring(0, 12))}</text>`,
    );
    y += 15;
  }

  parts.push(`  </g>`);

  // Materials Schedule
  parts.push(`  <g id="material-schedule" transform="translate(300, 60)">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333">MATERIAL SCHEDULE</text>`,
  );
  parts.push(
    `    <line x1="0" y1="5" x2="260" y2="5" stroke="#333" stroke-width="1"/>`,
  );

  // Table headers
  parts.push(
    `    <text x="0" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Material</text>`,
  );
  parts.push(
    `    <text x="120" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Application</text>`,
  );
  parts.push(
    `    <text x="220" y="25" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#333">Color</text>`,
  );
  parts.push(
    `    <line x1="0" y1="30" x2="260" y2="30" stroke="#666" stroke-width="0.5"/>`,
  );

  // Material rows
  y = 45;
  const maxMaterials = Math.min(materials.length, 8);
  for (let i = 0; i < maxMaterials; i++) {
    const mat = materials[i];
    const matName = mat.name || mat.material || `Material ${i + 1}`;
    const application = mat.application || "General";
    const color = mat.hexColor || "#808080";

    parts.push(
      `    <text x="0" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${escapeXml(matName.substring(0, 18))}</text>`,
    );
    parts.push(
      `    <text x="120" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${escapeXml(application.substring(0, 15))}</text>`,
    );
    parts.push(
      `    <rect x="220" y="${y - 8}" width="15" height="10" fill="${color}" stroke="#333" stroke-width="0.5"/>`,
    );
    parts.push(
      `    <text x="240" y="${y}" font-family="Arial, sans-serif" font-size="8" fill="#666">${color}</text>`,
    );
    y += 15;
  }

  parts.push(`  </g>`);

  // General Notes
  parts.push(`  <g id="notes" transform="translate(20, ${height - 120})">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#333">GENERAL NOTES</text>`,
  );
  parts.push(
    `    <line x1="0" y1="5" x2="540" y2="5" stroke="#333" stroke-width="1"/>`,
  );

  const notes = [
    "1. All dimensions in millimeters unless otherwise noted.",
    "2. Refer to structural drawings for foundation details.",
    "3. All windows to comply with Part L Building Regulations.",
    "4. Coordinate with M&E drawings for service locations.",
    "5. Do not scale from drawings.",
  ];

  y = 25;
  for (const note of notes) {
    parts.push(
      `    <text x="0" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#333">${note}</text>`,
    );
    y += 15;
  }

  parts.push(`  </g>`);

  // Project Info Box
  parts.push(
    `  <g id="project-info" transform="translate(${width - 180}, ${height - 80})">`,
  );
  parts.push(
    `    <rect x="0" y="0" width="160" height="60" fill="none" stroke="#333" stroke-width="1"/>`,
  );
  parts.push(
    `    <line x1="0" y1="20" x2="160" y2="20" stroke="#333" stroke-width="0.5"/>`,
  );
  parts.push(
    `    <text x="80" y="14" font-family="Arial, sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#333">${escapeXml(projectName.substring(0, 20))}</text>`,
  );
  parts.push(
    `    <text x="5" y="35" font-family="Arial, sans-serif" font-size="8" fill="#666">Total Area: ${(dimensions.length || 15) * (dimensions.width || 10)}m²</text>`,
  );
  parts.push(
    `    <text x="5" y="50" font-family="Arial, sans-serif" font-size="8" fill="#666">Floors: ${dimensions.floors || dimensions.floorCount || 2}</text>`,
  );
  parts.push(`  </g>`);

  parts.push(`</svg>`);

  const svg = parts.join("\n");

  logger.info(
    `[TechnicalDrawing] Schedules SVG generated successfully (${svg.length} chars)`,
  );
  return svg;
}

/**
 * Generate climate card panel as SVG
 * This is NOT AI-generated - uses SVG templates with real fonts.
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} locationData - Location and climate data
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
export function generateClimateCardSVG(dna, locationData = {}, options = {}) {
  const { width = 400, height = 300 } = options;

  logger.info("[TechnicalDrawing] Generating climate card SVG");

  const climate = locationData?.climate || dna?.site?.climate || {};
  const sunPath = locationData?.sunPath || dna?.site?.sun_path || {};
  const address = locationData?.address || dna?.site?.address || "Location";

  const parts = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  );

  // Background
  parts.push(`  <rect width="${width}" height="${height}" fill="#f8f9fa"/>`);

  // Title
  parts.push(
    `  <text x="${width / 2}" y="25" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#1a1a1a">CLIMATE DATA</text>`,
  );
  parts.push(
    `  <text x="${width / 2}" y="45" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#666">${escapeXml(address.substring(0, 50))}</text>`,
  );

  // Climate type badge
  const climateType = climate.type || climate.zone || "Temperate";
  parts.push(`  <g transform="translate(20, 70)">`);
  parts.push(
    `    <rect x="0" y="0" width="120" height="30" rx="5" fill="#2c5282"/>`,
  );
  parts.push(
    `    <text x="60" y="20" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="white">${escapeXml(climateType)}</text>`,
  );
  parts.push(`  </g>`);

  // Seasonal temperatures
  const seasonal = climate.seasonal || {};
  const seasons = [
    { name: "Winter", data: seasonal.winter || {}, color: "#3182ce" },
    { name: "Spring", data: seasonal.spring || {}, color: "#38a169" },
    { name: "Summer", data: seasonal.summer || {}, color: "#d69e2e" },
    {
      name: "Autumn",
      data: seasonal.fall || seasonal.autumn || {},
      color: "#c05621",
    },
  ];

  parts.push(`  <g id="seasonal" transform="translate(20, 120)">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#333">SEASONAL CONDITIONS</text>`,
  );

  let x = 0;
  for (const season of seasons) {
    parts.push(`    <g transform="translate(${x}, 15)">`);
    parts.push(
      `      <rect x="0" y="0" width="80" height="50" rx="3" fill="${season.color}" fill-opacity="0.1" stroke="${season.color}" stroke-width="1"/>`,
    );
    parts.push(
      `      <text x="40" y="15" font-family="Arial, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="${season.color}">${season.name}</text>`,
    );
    parts.push(
      `      <text x="40" y="32" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#333">${season.data.avgTemp || season.data.temperature || "15"}°C</text>`,
    );
    parts.push(
      `      <text x="40" y="45" font-family="Arial, sans-serif" font-size="8" text-anchor="middle" fill="#666">${season.data.humidity || 60}% RH</text>`,
    );
    parts.push(`    </g>`);
    x += 90;
  }

  parts.push(`  </g>`);

  // Sun path info
  parts.push(`  <g id="sun-path" transform="translate(20, 200)">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#333">SUN PATH</text>`,
  );
  parts.push(
    `    <text x="0" y="20" font-family="Arial, sans-serif" font-size="9" fill="#666">Summer: ${escapeXml(sunPath.summer || "High altitude, long days")}</text>`,
  );
  parts.push(
    `    <text x="0" y="35" font-family="Arial, sans-serif" font-size="9" fill="#666">Winter: ${escapeXml(sunPath.winter || "Low altitude, short days")}</text>`,
  );
  parts.push(
    `    <text x="0" y="50" font-family="Arial, sans-serif" font-size="9" fill="#666">Optimal: ${escapeXml(sunPath.optimalOrientation || "South-facing")}</text>`,
  );
  parts.push(`  </g>`);

  // Design recommendations
  parts.push(`  <g id="recommendations" transform="translate(20, 260)">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#2c5282">DESIGN RECOMMENDATIONS</text>`,
  );
  parts.push(
    `    <text x="0" y="18" font-family="Arial, sans-serif" font-size="8" fill="#333">• Optimize glazing for passive solar gain</text>`,
  );
  parts.push(
    `    <text x="0" y="30" font-family="Arial, sans-serif" font-size="8" fill="#333">• Consider thermal mass for temperature stability</text>`,
  );
  parts.push(`  </g>`);

  parts.push(`</svg>`);

  const svg = parts.join("\n");

  logger.info(
    `[TechnicalDrawing] Climate card SVG generated successfully (${svg.length} chars)`,
  );
  return svg;
}

/**
 * Generate material palette panel as SVG
 * This is NOT AI-generated - uses SVG templates with real fonts.
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
export function generateMaterialPaletteSVG(dna, options = {}) {
  const { width = 400, height = 300 } = options;

  logger.info("[TechnicalDrawing] Generating material palette SVG");

  const materials = dna?.materials || [];

  const parts = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  );

  // Background
  parts.push(`  <rect width="${width}" height="${height}" fill="#ffffff"/>`);

  // Title
  parts.push(
    `  <text x="${width / 2}" y="25" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#1a1a1a">MATERIAL PALETTE</text>`,
  );

  // Material swatches
  const swatchSize = 60;
  const cols = 4;
  const startX = 30;
  const startY = 50;
  const spacingX = 90;
  const spacingY = 90;

  materials.slice(0, 12).forEach((mat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * spacingX;
    const y = startY + row * spacingY;
    const color = mat.hexColor || "#808080";
    const name = mat.name || `Material ${i + 1}`;
    const application = mat.application || "General";

    parts.push(`  <g transform="translate(${x}, ${y})">`);
    // Swatch
    parts.push(
      `    <rect x="0" y="0" width="${swatchSize}" height="${swatchSize}" fill="${color}" stroke="#333" stroke-width="1"/>`,
    );
    // Diagonal line for texture indication
    parts.push(
      `    <line x1="0" y1="${swatchSize}" x2="${swatchSize}" y2="0" stroke="white" stroke-width="0.5" opacity="0.3"/>`,
    );
    // Name
    parts.push(
      `    <text x="${swatchSize / 2}" y="${swatchSize + 12}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" text-anchor="middle" fill="#333">${escapeXml(name.substring(0, 12))}</text>`,
    );
    // Application
    parts.push(
      `    <text x="${swatchSize / 2}" y="${swatchSize + 22}" font-family="Arial, sans-serif" font-size="7" text-anchor="middle" fill="#666">${escapeXml(application.substring(0, 14))}</text>`,
    );
    parts.push(`  </g>`);
  });

  // Color codes legend at bottom
  parts.push(`  <g id="legend" transform="translate(20, ${height - 30})">`);
  parts.push(
    `    <text x="0" y="0" font-family="Arial, sans-serif" font-size="8" fill="#666">Color codes shown are for reference - verify with manufacturer samples</text>`,
  );
  parts.push(`  </g>`);

  parts.push(`</svg>`);

  const svg = parts.join("\n");

  logger.info(
    `[TechnicalDrawing] Material palette SVG generated successfully (${svg.length} chars)`,
  );
  return svg;
}

/**
 * Generate all technical drawings for a project
 *
 * @param {Object} dna - Master Design DNA
 * @param {Object} locationData - Location and climate data
 * @param {Object} options - Generation options
 * @returns {Object} Object containing all SVG strings keyed by panel type
 */
export function generateAllTechnicalDrawings(
  dna,
  locationData = {},
  options = {},
) {
  logger.info("[TechnicalDrawing] Generating all technical drawings");

  const results = {};
  const errors = [];

  // Floor plans
  try {
    results.floorPlans = generateAllFloorPlans(dna, options);
  } catch (error) {
    errors.push({ type: "floorPlans", error: error.message });
    results.floorPlans = {};
  }

  // Elevations
  try {
    results.elevations = generateAllElevations(dna, options);
  } catch (error) {
    errors.push({ type: "elevations", error: error.message });
    results.elevations = {};
  }

  // Sections
  try {
    results.sections = generateAllSections(dna, options);
  } catch (error) {
    errors.push({ type: "sections", error: error.message });
    results.sections = {};
  }

  // Schedules (SVG template, not AI)
  try {
    results.schedules = generateSchedulesSVG(dna, options);
  } catch (error) {
    errors.push({ type: "schedules", error: error.message });
    results.schedules = null;
  }

  // Climate card (SVG template, not AI)
  try {
    results.climateCard = generateClimateCardSVG(dna, locationData, options);
  } catch (error) {
    errors.push({ type: "climateCard", error: error.message });
    results.climateCard = null;
  }

  // Material palette (SVG template, not AI)
  try {
    results.materialPalette = generateMaterialPaletteSVG(dna, options);
  } catch (error) {
    errors.push({ type: "materialPalette", error: error.message });
    results.materialPalette = null;
  }

  if (errors.length > 0) {
    logger.warn(
      `[TechnicalDrawing] ${errors.length} generation errors occurred`,
      { errors },
    );
  }

  logger.info("[TechnicalDrawing] All technical drawings generated", {
    floorPlanCount: Object.keys(results.floorPlans).length,
    elevationCount: Object.keys(results.elevations).length,
    sectionCount: Object.keys(results.sections).length,
    hasSchedules: !!results.schedules,
    hasClimateCard: !!results.climateCard,
    hasMaterialPalette: !!results.materialPalette,
  });

  return results;
}

/**
 * Escape XML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const technicalDrawingGenerator = {
  generateFloorPlanSVG,
  generateAllFloorPlans,
  generateElevationSVG,
  generateAllElevations,
  generateSectionSVG,
  generateAllSections,
  generateSchedulesSVG,
  generateClimateCardSVG,
  generateMaterialPaletteSVG,
  generateAllTechnicalDrawings,
};

export default technicalDrawingGenerator;
