/**
 * Geometry Module
 *
 * Layer 2 of the Architecture-AI Pipeline
 * Generates 2D/3D geometry from ProgramDNA.
 *
 * @module services/geometry
 */

// Local imports for default export object (must be at top per ESLint import/first)
// Sorted alphabetically by path to satisfy import/order
import {
  generateAllElevations as _generateAllElevations,
  ORIENTATIONS as _ORIENTATIONS,
} from './elevationGenerator.js';
import { createFloorPlanGenerator as _createFloorPlanGenerator } from './floorPlanGeometryEngine.js';
import {
  WALL_TYPES as _WALL_TYPES,
  OPENING_TYPES as _OPENING_TYPES,
} from './IFloorPlanGenerator.js';
import {
  createAdjustmentEngine as _createAdjustmentEngine,
  adjustGeometry as _adjustGeometry,
  UK_MIN_ROOM_SIZES as _UK_MIN_ROOM_SIZES,
  GRID_SETTINGS as _GRID_SETTINGS,
  CONSTRAINTS as _CONSTRAINTS,
} from './manualAdjustmentEngine.js';
import { generateOpenings as _generateOpenings } from './openingGenerator.js';
import { generateRoomPolygons as _generateRoomPolygons } from './roomPolygonGenerator.js';
import {
  generateStandardSections as _generateStandardSections,
  SECTION_TYPES as _SECTION_TYPES,
} from './sectionGenerator.js';
import { generateWalls as _generateWalls } from './wallGenerator.js';

// Interface - re-export types and constants
export {
  default as IFloorPlanGenerator,
  WALL_TYPES,
  WALL_THICKNESSES,
  OPENING_TYPES,
  OPENING_DEFAULTS,
} from './IFloorPlanGenerator.js';

// Room Polygon Generator
export {
  default as roomPolygonGenerator,
  generateRoomPolygons,
  calculatePolygonArea,
  pointInPolygon,
  polygonsOverlap,
  fitsWithinBoundary,
} from './roomPolygonGenerator.js';

// Wall Generator
export {
  default as wallGenerator,
  generateWalls,
  getWallsForRoom,
  getExteriorWallsByOrientation,
  getWallCenter,
  getWallAngle,
  getWallNormal,
  getPositionOnWall,
  isPointOnWall,
  splitWallAtPoint,
} from './wallGenerator.js';

// Opening Generator
export {
  default as openingGenerator,
  generateOpenings,
  validateOpenings,
} from './openingGenerator.js';

// Elevation Generator
export {
  default as elevationGenerator,
  generateElevation,
  generateAllElevations,
  profileToSVGPath,
  openingToSVGRect,
  getVisibleOpenings,
  ORIENTATIONS,
} from './elevationGenerator.js';

// Section Generator
export {
  default as sectionGenerator,
  generateSection,
  generateStandardSections,
  sectionProfileToSVGPath,
  generateHatchPattern,
  SECTION_TYPES,
} from './sectionGenerator.js';

// Manual Adjustment Engine
export {
  default as manualAdjustmentEngine,
  ManualAdjustmentEngine,
  createAdjustmentEngine,
  adjustGeometry,
  UK_MIN_ROOM_SIZES,
  GRID_SETTINGS,
  CONSTRAINTS,
} from './manualAdjustmentEngine.js';

// Main Engine
export {
  default as floorPlanGeometryEngine,
  MVPFloorPlanGenerator,
  createFloorPlanGenerator,
  generateQuickGeometry,
  generateArchitecturalPackage,
} from './floorPlanGeometryEngine.js';

/**
 * Quick helper: Generate geometry from program
 *
 * @param {Object} program - ProgramDNA
 * @param {Object} [constraints] - Layout constraints
 * @returns {Promise<Object>} GeometryDNA
 *
 * @example
 * const geometry = await generateGeometry(programDNA, {
 *   sitePolygon: [{x: 0, y: 0}, {x: 20, y: 0}, {x: 20, y: 15}, {x: 0, y: 15}],
 * });
 */
export async function generateGeometry(program, constraints = {}) {
  const { MVPFloorPlanGenerator } = await import('./floorPlanGeometryEngine.js');
  const generator = new MVPFloorPlanGenerator();
  return generator.generateLayout(program, constraints);
}

/**
 * Generate complete package with elevations and sections
 */
export async function generateCompleteGeometry(program, styleDNA = {}, constraints = {}) {
  const { MVPFloorPlanGenerator } = await import('./floorPlanGeometryEngine.js');
  const generator = new MVPFloorPlanGenerator();
  return generator.generateCompletePackage(program, styleDNA, constraints);
}

// Default export uses locally imported names
const geometryModule = {
  generateGeometry,
  generateCompleteGeometry,
  createFloorPlanGenerator: _createFloorPlanGenerator,
  generateRoomPolygons: _generateRoomPolygons,
  generateWalls: _generateWalls,
  generateOpenings: _generateOpenings,
  generateAllElevations: _generateAllElevations,
  generateStandardSections: _generateStandardSections,
  // Manual Adjustment
  createAdjustmentEngine: _createAdjustmentEngine,
  adjustGeometry: _adjustGeometry,
  // Constants
  WALL_TYPES: _WALL_TYPES,
  OPENING_TYPES: _OPENING_TYPES,
  ORIENTATIONS: _ORIENTATIONS,
  SECTION_TYPES: _SECTION_TYPES,
  UK_MIN_ROOM_SIZES: _UK_MIN_ROOM_SIZES,
  GRID_SETTINGS: _GRID_SETTINGS,
  CONSTRAINTS: _CONSTRAINTS,
};

export default geometryModule;
