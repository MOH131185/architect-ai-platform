/**
 * Canonical Design State Schema
 *
 * Single source of truth for all architectural design data.
 * This schema captures:
 * - Site: boundary, orientation, entrance, setbacks
 * - Program: levels, rooms with sizes and adjacencies
 * - Massing: footprint shape, roof type, heights
 * - Style: reference to StyleProfile
 * - Constraints: circulation, window ratios, structural rules
 *
 * Used by:
 * - DNA generators (twoPassDNAGenerator.js)
 * - Geometry pipeline (masterGeometryBuilder.js)
 * - Panel generation (panelGenerationService.js)
 * - A1 sheet composition (A1SheetGenerator.js)
 *
 * @module types/CanonicalDesignState
 */

import logger from '../services/core/logger.js';
import { distributeRoomsToFloors } from '../services/spatial/floorDistributor.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Valid entrance directions
 * @type {string[]}
 */
export const ENTRANCE_DIRECTIONS = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

/**
 * Valid footprint shapes
 * @type {string[]}
 */
export const FOOTPRINT_SHAPES = ['rectangular', 'L', 'T', 'U', 'courtyard', 'custom'];

/**
 * Valid roof types
 * @type {string[]}
 */
export const ROOF_TYPES = ['flat', 'gable', 'hip', 'shed', 'mansard', 'butterfly', 'sawtooth'];

/**
 * Default floor height in meters
 * @type {number}
 */
export const DEFAULT_FLOOR_HEIGHT = 2.7;

/**
 * Default ground floor height in meters (typically higher)
 * @type {number}
 */
export const DEFAULT_GROUND_FLOOR_HEIGHT = 3.0;

/**
 * UK Building Regulations minimum circulation width (mm)
 * @type {number}
 */
export const MIN_CIRCULATION_WIDTH_MM = 900;

// =============================================================================
// TYPE DEFINITIONS (JSDoc for IDE support)
// =============================================================================

/**
 * 2D Point
 * @typedef {Object} Point2D
 * @property {number} x - X coordinate in meters
 * @property {number} y - Y coordinate in meters
 */

/**
 * Geographic coordinate
 * @typedef {Object} GeoPoint
 * @property {number} lat - Latitude
 * @property {number} lng - Longitude
 */

/**
 * Site section of CanonicalDesignState
 * @typedef {Object} CanonicalSite
 * @property {GeoPoint[]} boundary - Site boundary polygon as lat/lng coordinates
 * @property {number} areaM2 - Site area in square meters
 * @property {number} orientationDeg - Site orientation in degrees from north (0-360)
 * @property {string} entranceSide - Main entrance direction ('N', 'S', 'E', 'W', etc.)
 * @property {Object} setbacks - Setback distances from boundary
 * @property {number} setbacks.front - Front setback in meters
 * @property {number} setbacks.rear - Rear setback in meters
 * @property {number} setbacks.left - Left side setback in meters
 * @property {number} setbacks.right - Right side setback in meters
 * @property {Object} [climate] - Climate data
 * @property {string} [climate.zone] - Climate zone (temperate, continental, etc.)
 * @property {Object} [climate.seasonal] - Seasonal data
 * @property {Object} [sunPath] - Sun path data
 * @property {string} [sunPath.optimalOrientation] - Optimal solar orientation
 */

/**
 * Room specification within a level
 * @typedef {Object} CanonicalRoom
 * @property {string} id - Unique room identifier
 * @property {string} name - Display name (e.g., "Living Room", "Master Bedroom")
 * @property {string} program - Room program type (living, bedroom, kitchen, etc.)
 * @property {string} roomType - Alias for program - bedroom, living, kitchen, circulation, etc.
 * @property {number} targetAreaM2 - Target area in square meters
 * @property {number} [estimatedWidth] - Estimated room width in meters (auto-calculated)
 * @property {number} [estimatedLength] - Estimated room length in meters (auto-calculated)
 * @property {string} spaceType - Space classification: 'public', 'private', or 'circulation'
 * @property {string} zoneType - Zone classification: 'public', 'private', or 'service'
 * @property {string[]} adjacentTo - Array of room IDs this room should be adjacent to
 * @property {string} [daylightOrientation] - Preferred facade for daylight ('N', 'S', 'E', 'W', 'any')
 * @property {boolean} [requiresExternalWall] - Must have exterior wall (default: true for habitable rooms)
 * @property {Object} [constraints] - Room-specific constraints
 * @property {number} [constraints.minWidth] - Minimum width in meters
 * @property {number} [constraints.maxAspectRatio] - Maximum length/width ratio
 */

/**
 * Space type classification for rooms
 * Determines placement priority and adjacency rules
 * @type {Object.<string, string>}
 */
export const SPACE_TYPE_MAP = {
  // Public spaces - typically on ground floor, near entrance
  living: 'public',
  lounge: 'public',
  sitting: 'public',
  dining: 'public',
  kitchen: 'public',
  entrance: 'public',
  reception: 'public',
  waiting: 'public',
  foyer: 'public',
  gallery: 'public',

  // Private spaces - typically on upper floors or rear of building
  bedroom: 'private',
  master_bedroom: 'private',
  guest_bedroom: 'private',
  bathroom: 'private',
  ensuite: 'private',
  wc: 'private',
  study: 'private',
  office: 'private',
  consultation: 'private',
  treatment: 'private',

  // Circulation/Service spaces
  circulation: 'circulation',
  landing: 'circulation',
  hallway: 'circulation',
  corridor: 'circulation',
  stairwell: 'circulation',
  utility: 'circulation',
  storage: 'circulation',
  garage: 'circulation',

  // Default
  generic: 'public',
};

/**
 * Zone type classification for rooms (for geometry layout)
 * Maps room program to zone: 'public', 'private', or 'service'
 * @type {Object.<string, string>}
 */
export const ZONE_TYPE_MAP = {
  // Public zone - main living areas, near entrance
  living: 'public',
  lounge: 'public',
  sitting: 'public',
  dining: 'public',
  kitchen: 'public',
  entrance: 'public',
  reception: 'public',
  waiting: 'public',
  foyer: 'public',
  gallery: 'public',

  // Private zone - bedrooms, bathrooms, quiet spaces
  bedroom: 'private',
  master_bedroom: 'private',
  guest_bedroom: 'private',
  bathroom: 'private',
  ensuite: 'private',
  wc: 'private',
  study: 'private',
  office: 'private',
  consultation: 'private',
  treatment: 'private',
  nursery: 'private',

  // Service zone - circulation, utilities, storage
  circulation: 'service',
  landing: 'service',
  hallway: 'service',
  corridor: 'service',
  stairwell: 'service',
  utility: 'service',
  storage: 'service',
  garage: 'service',
  laundry: 'service',
  pantry: 'service',

  // Default
  generic: 'public',
};

/**
 * Level (floor) specification
 * @typedef {Object} CanonicalLevel
 * @property {number} index - Floor index (0 = ground, 1 = first, -1 = basement)
 * @property {string} name - Display name ("Ground Floor", "First Floor", etc.)
 * @property {number} floorHeightM - Floor-to-ceiling height in meters
 * @property {CanonicalRoom[]} rooms - Rooms on this level
 * @property {number} [grossAreaM2] - Gross internal floor area
 */

/**
 * Program section of CanonicalDesignState
 * @typedef {Object} CanonicalProgram
 * @property {string} buildingType - Building type identifier (residential_house, clinic, office, etc.)
 * @property {string} buildingCategory - Category (residential, commercial, healthcare, etc.)
 * @property {number} totalAreaM2 - Total gross internal floor area
 * @property {number} levelCount - Number of levels (including basement if any)
 * @property {CanonicalLevel[]} levels - Array of level specifications
 */

/**
 * Massing section of CanonicalDesignState
 * @typedef {Object} CanonicalMassing
 * @property {string} footprintShape - Building footprint shape
 * @property {Point2D[]} [footprintPolygon] - Custom footprint polygon (for 'custom' shape)
 * @property {string} roofType - Roof type
 * @property {number} roofPitchDeg - Roof pitch in degrees (0 for flat)
 * @property {string} [ridgeDirection] - Ridge direction for gable/hip ('N-S', 'E-W')
 * @property {number} totalHeightM - Total building height to ridge in meters
 * @property {number} eaveHeightM - Height to eave/parapet in meters
 * @property {Object} [wings] - Wing configuration for L/T/U shapes
 */

/**
 * Style profile reference
 * @typedef {Object} CanonicalStyleRef
 * @property {string} profileId - Reference to StyleProfile ID
 * @property {Object} blendWeights - Style blend weights
 * @property {number} blendWeights.location - Location/vernacular weight (0-1)
 * @property {number} blendWeights.portfolio - User portfolio weight (0-1)
 * @property {number} blendWeights.variation - Random variation weight (0-1)
 * @property {string} vernacularStyle - Primary vernacular style name
 * @property {string[]} materials - Primary material names
 * @property {string} windowStyle - Window style (sash, casement, etc.)
 */

/**
 * Design constraints
 * @typedef {Object} CanonicalConstraints
 * @property {Object} adjacencyMatrix - Room adjacency requirements (roomId -> roomId[])
 * @property {number} circulationWidthMm - Minimum circulation width in mm
 * @property {number} windowToWallRatio - Target window-to-wall ratio (0.15-0.25)
 * @property {number} [maxStructuralSpanM] - Maximum structural span in meters
 * @property {string} [gridModuleM] - Planning grid module (e.g., "1.2m")
 */

/**
 * Metadata section
 * @typedef {Object} CanonicalMeta
 * @property {string} designId - Unique design identifier
 * @property {string} version - Schema version
 * @property {string} createdAt - ISO timestamp
 * @property {string} [dnaHash] - Hash of DNA for change detection
 * @property {string} [generatorVersion] - Generator version used
 */

/**
 * Room geometry within a floor
 * @typedef {Object} GeometryRoom
 * @property {string} id - Room identifier
 * @property {string} name - Room name
 * @property {string} program - Room program type
 * @property {Point2D[]} polygon - Room boundary polygon
 * @property {number} area - Actual computed area in m²
 * @property {number} targetArea - Target area in m²
 */

/**
 * Wall geometry
 * @typedef {Object} GeometryWall
 * @property {string} id - Wall identifier
 * @property {Point2D} start - Start point
 * @property {Point2D} end - End point
 * @property {number} thickness - Wall thickness in mm
 * @property {string} type - 'external' | 'internal' | 'party'
 * @property {boolean} loadBearing - Is load-bearing
 */

/**
 * Opening geometry (door/window)
 * @typedef {Object} GeometryOpening
 * @property {string} id - Opening identifier
 * @property {string} type - 'door' | 'window'
 * @property {string} wallId - Parent wall ID
 * @property {number} position - Position along wall (0-1)
 * @property {number} width - Width in meters
 * @property {number} height - Height in meters
 * @property {number} sillHeight - Sill height from floor in meters (for windows)
 */

/**
 * Stair geometry
 * @typedef {Object} GeometryStair
 * @property {string} id - Stair identifier
 * @property {string} type - 'straight' | 'L-shape' | 'U-shape' | 'spiral'
 * @property {Point2D[]} polygon - Stair footprint polygon
 * @property {number} bottomFloor - Starting floor index
 * @property {number} topFloor - Ending floor index
 * @property {number} riseHeight - Individual riser height in mm
 * @property {number} goingDepth - Individual tread depth in mm
 * @property {number} totalRisers - Total number of risers
 * @property {'up' | 'down'} direction - Direction of travel from bottom
 */

/**
 * Floor geometry collection
 * @typedef {Object} GeometryFloor
 * @property {number} level - Floor index (0 = ground)
 * @property {number} height - Floor-to-ceiling height in meters
 * @property {Point2D[]} boundary - Floor boundary polygon
 * @property {GeometryRoom[]} rooms - Room geometries
 * @property {GeometryWall[]} walls - Wall geometries
 * @property {GeometryOpening[]} openings - Door/window geometries
 * @property {GeometryStair[]} stairs - Stairs starting on this floor
 */

/**
 * Geometry Model - complete spatial representation per floor
 * @typedef {Object} GeometryModel
 * @property {GeometryFloor[]} floors - Array of floor geometries
 * @property {Object} footprint - Building footprint
 * @property {Point2D[]} footprint.polygon - Footprint polygon
 * @property {number} footprint.width - Footprint width in meters
 * @property {number} footprint.length - Footprint length in meters
 * @property {Object} structuralGrid - Structural grid information
 * @property {Object} metadata - Generation metadata
 */

/**
 * Facade opening position
 * @typedef {Object} FacadeOpening
 * @property {string} id - Opening identifier
 * @property {string} type - 'window' | 'door'
 * @property {number} x - X position from facade left (meters)
 * @property {number} y - Y position from ground (meters)
 * @property {number} width - Opening width (meters)
 * @property {number} height - Opening height (meters)
 * @property {number} floor - Floor index this opening is on
 * @property {string} [style] - Window/door style reference
 */

/**
 * Single facade representation
 * @typedef {Object} FacadeElevation
 * @property {string} orientation - 'N' | 'S' | 'E' | 'W'
 * @property {number} width - Total facade width (meters)
 * @property {number} height - Total facade height (meters)
 * @property {FacadeOpening[]} openings - Windows and doors on this facade
 * @property {Object} roofProfile - Roof profile for this elevation
 * @property {Point2D[]} roofProfile.points - Roof outline points
 * @property {string} roofProfile.type - 'gable_end' | 'gable_side' | 'hip' | 'flat'
 */

/**
 * Facade Model - window/door positions by elevation
 * @typedef {Object} FacadeModel
 * @property {FacadeElevation} north - North elevation
 * @property {FacadeElevation} south - South elevation
 * @property {FacadeElevation} east - East elevation
 * @property {FacadeElevation} west - West elevation
 * @property {Object} windowToWallRatio - Window-to-wall ratio per facade
 * @property {number} totalOpenings - Total count of all openings
 */

/**
 * Canonical renders from geometry engine
 * @typedef {Object} CanonicalRenders
 * @property {Object.<number, string>} floorPlansSVG - SVG strings keyed by floor index
 * @property {Object.<string, string>} elevationsSVG - SVG strings keyed by orientation (N/S/E/W)
 * @property {Object.<string, string>} sectionsSVG - SVG strings keyed by section name (A-A, B-B)
 * @property {Object.<string, string>} massing3DViewsPNG - Base64 PNG strings keyed by view name
 */

/**
 * Complete Canonical Design State
 * @typedef {Object} CanonicalDesignState
 * @property {CanonicalMeta} meta - Metadata
 * @property {string} designFingerprint - SHA-256 hash of design (DNA + geometry) for tracking
 * @property {CanonicalSite} site - Site information
 * @property {CanonicalProgram} program - Building program
 * @property {CanonicalMassing} massing - Massing/form
 * @property {CanonicalStyleRef} style - Style reference
 * @property {CanonicalConstraints} constraints - Design constraints
 * @property {GeometryModel} [geometryModel] - Complete spatial geometry by floor
 * @property {FacadeModel} [facadeModel] - Window/door positions by elevation
 * @property {CanonicalRenders} [canonicalRenders] - Pre-rendered SVG/PNG from geometry engine
 * @property {Object} [masterDNA] - Final master DNA (for backward compatibility)
 */

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Generate unique design ID
 * @returns {string}
 */
export function generateDesignId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `design_${timestamp}_${random}`;
}

/**
 * Create empty CanonicalSite
 * @param {Object} [defaults] - Default values
 * @returns {CanonicalSite}
 */
export function createEmptySite(defaults = {}) {
  return {
    boundary: defaults.boundary || [],
    areaM2: defaults.areaM2 || 0,
    orientationDeg: defaults.orientationDeg || 0,
    entranceSide: defaults.entranceSide || 'S',
    setbacks: {
      front: defaults.setbacks?.front || 3,
      rear: defaults.setbacks?.rear || 6,
      left: defaults.setbacks?.left || 1.5,
      right: defaults.setbacks?.right || 1.5,
    },
    climate: defaults.climate || { zone: 'temperate' },
    sunPath: defaults.sunPath || { optimalOrientation: 'south' },
  };
}

/**
 * Estimate room dimensions from target area
 * Uses typical aspect ratios based on room program type
 * @param {number} areaM2 - Target area in square meters
 * @param {string} program - Room program type
 * @returns {{ width: number, length: number }}
 */
function estimateRoomDimensions(areaM2, program) {
  // Typical aspect ratios by room type (width:length)
  const aspectRatios = {
    living: 1.4, // Living rooms tend to be wider
    lounge: 1.4,
    kitchen: 1.2, // Kitchens are more square
    dining: 1.3,
    bedroom: 1.25, // Bedrooms are slightly rectangular
    master_bedroom: 1.3,
    bathroom: 1.5, // Bathrooms are typically narrow and long
    ensuite: 1.6,
    wc: 2.0, // WCs are very narrow
    utility: 1.5,
    entrance: 1.0, // Entrance halls are often square
    hallway: 3.0, // Hallways are long and narrow
    corridor: 4.0,
    landing: 1.2,
    study: 1.2,
    office: 1.3,
    reception: 1.2,
    waiting: 1.3,
    consultation: 1.2,
    treatment: 1.3,
    storage: 1.5,
    garage: 2.0,
    generic: 1.3,
  };

  const aspectRatio = aspectRatios[program] || 1.3;

  // Calculate width and length from area and aspect ratio
  // area = width * length, aspect = length / width
  // therefore: width = sqrt(area / aspect), length = sqrt(area * aspect)
  const width = Math.sqrt(areaM2 / aspectRatio);
  const length = areaM2 / width;

  // Round to 1 decimal place
  return {
    width: Math.round(width * 10) / 10,
    length: Math.round(length * 10) / 10,
  };
}

/**
 * Get space type classification for a room program
 * @param {string} program - Room program type
 * @returns {string} - 'public', 'private', or 'circulation'
 */
function getSpaceType(program) {
  return SPACE_TYPE_MAP[program] || SPACE_TYPE_MAP['generic'];
}

/**
 * Get zone type classification for a room program
 * @param {string} program - Room program type
 * @returns {string} - 'public', 'private', or 'service'
 */
function getZoneType(program) {
  return ZONE_TYPE_MAP[program] || ZONE_TYPE_MAP['generic'];
}

/**
 * Create empty CanonicalRoom
 * @param {Object} roomData - Room data
 * @returns {CanonicalRoom}
 */
export function createRoom(roomData) {
  const id = roomData.id || `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const program = roomData.program || detectProgramFromName(roomData.name);
  const targetAreaM2 = roomData.targetAreaM2 ?? roomData.area ?? roomData.area_m2 ?? 20;
  const dimensions = estimateRoomDimensions(targetAreaM2, program);

  return {
    id,
    name: roomData.name || 'Room',
    program,
    roomType: program, // Alias for program - used by BuildingModel
    targetAreaM2,
    estimatedWidth: roomData.estimatedWidth ?? dimensions.width,
    estimatedLength: roomData.estimatedLength ?? dimensions.length,
    spaceType: roomData.spaceType || getSpaceType(program),
    zoneType: roomData.zoneType || getZoneType(program), // 'public', 'private', or 'service'
    adjacentTo: roomData.adjacentTo || [],
    daylightOrientation: roomData.daylightOrientation || roomData.orientation || 'any',
    requiresExternalWall: roomData.requiresExternalWall !== false,
    constraints: roomData.constraints || {},
  };
}

/**
 * Create empty CanonicalLevel
 * @param {number} index - Floor index
 * @param {Object} [defaults] - Default values
 * @returns {CanonicalLevel}
 */
export function createLevel(index, defaults = {}) {
  const names = {
    '-1': 'Basement',
    0: 'Ground Floor',
    1: 'First Floor',
    2: 'Second Floor',
    3: 'Third Floor',
  };
  return {
    index,
    name: defaults.name || names[String(index)] || `Floor ${index}`,
    floorHeightM:
      defaults.floorHeightM || (index === 0 ? DEFAULT_GROUND_FLOOR_HEIGHT : DEFAULT_FLOOR_HEIGHT),
    rooms: defaults.rooms || [],
    grossAreaM2: defaults.grossAreaM2 || 0,
  };
}

/**
 * Create empty CanonicalProgram
 * @param {Object} [defaults] - Default values
 * @returns {CanonicalProgram}
 */
export function createEmptyProgram(defaults = {}) {
  return {
    buildingType: defaults.buildingType || 'residential_house',
    buildingCategory: defaults.buildingCategory || 'residential',
    totalAreaM2: defaults.totalAreaM2 || 150,
    levelCount: defaults.levelCount || 2,
    levels: defaults.levels || [],
  };
}

/**
 * Create empty CanonicalMassing
 * @param {Object} [defaults] - Default values
 * @returns {CanonicalMassing}
 */
export function createEmptyMassing(defaults = {}) {
  return {
    footprintShape: defaults.footprintShape || 'rectangular',
    footprintPolygon: defaults.footprintPolygon || null,
    // NEW: Explicit building dimensions from DNA (prevents recalculation from area)
    widthM: defaults.widthM || null, // Building width (X-axis, facade facing street)
    depthM: defaults.depthM || null, // Building depth (Y-axis, front to back)
    roofType: defaults.roofType || 'gable',
    roofPitchDeg: defaults.roofPitchDeg || 35,
    ridgeDirection: defaults.ridgeDirection || 'E-W',
    totalHeightM: defaults.totalHeightM || 8,
    eaveHeightM: defaults.eaveHeightM || 6,
    wings: defaults.wings || null,
  };
}

/**
 * Create empty CanonicalStyleRef
 * @param {Object} [defaults] - Default values
 * @returns {CanonicalStyleRef}
 */
export function createEmptyStyleRef(defaults = {}) {
  return {
    profileId: defaults.profileId || null,
    blendWeights: {
      location: defaults.blendWeights?.location ?? 0.3,
      portfolio: defaults.blendWeights?.portfolio ?? 0.6,
      variation: defaults.blendWeights?.variation ?? 0.1,
    },
    vernacularStyle: defaults.vernacularStyle || 'contemporary',
    materials: defaults.materials || ['brick', 'render'],
    windowStyle: defaults.windowStyle || 'casement',
  };
}

/**
 * Create empty CanonicalConstraints
 * @param {Object} [defaults] - Default values
 * @returns {CanonicalConstraints}
 */
export function createEmptyConstraints(defaults = {}) {
  return {
    adjacencyMatrix: defaults.adjacencyMatrix || {},
    circulationWidthMm: defaults.circulationWidthMm || MIN_CIRCULATION_WIDTH_MM,
    windowToWallRatio: defaults.windowToWallRatio || 0.2,
    maxStructuralSpanM: defaults.maxStructuralSpanM || 6,
    gridModuleM: defaults.gridModuleM || '1.2m',
  };
}

/**
 * Compute SHA-256 hash of data for design fingerprint
 * @param {Object} data - Data to hash
 * @returns {string} - Hex string of SHA-256 hash
 */
export function computeDesignFingerprint(data) {
  try {
    // Use a simple hash function for browser compatibility
    const str = JSON.stringify(data, (key, value) => {
      // Exclude volatile fields from fingerprint
      if (key === 'createdAt' || key === 'timestamp' || key === 'generatedAt') {
        return undefined;
      }
      return value;
    });

    // Simple hash implementation (djb2 algorithm, converted to hex-like string)
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert to positive hex-like string and pad
    const positiveHash = Math.abs(hash);
    const fingerprint = `fp_${positiveHash.toString(16).padStart(8, '0')}_${Date.now().toString(36)}`;
    return fingerprint;
  } catch (err) {
    logger.warn('[computeDesignFingerprint] Failed to compute fingerprint:', err.message);
    return `fp_fallback_${Date.now().toString(36)}`;
  }
}

/**
 * Create empty GeometryModel
 * @returns {GeometryModel}
 */
export function createEmptyGeometryModel() {
  return {
    floors: [],
    footprint: {
      polygon: [],
      width: 0,
      length: 0,
    },
    structuralGrid: null,
    metadata: {
      generatedAt: null,
      generationTime: 0,
      totalRooms: 0,
      totalWalls: 0,
      totalOpenings: 0,
    },
  };
}

/**
 * Create empty FacadeModel
 * @returns {FacadeModel}
 */
export function createEmptyFacadeModel() {
  const createEmptyFacade = (orientation) => ({
    orientation,
    width: 0,
    height: 0,
    openings: [],
    roofProfile: {
      points: [],
      type: 'flat',
    },
  });

  return {
    north: createEmptyFacade('N'),
    south: createEmptyFacade('S'),
    east: createEmptyFacade('E'),
    west: createEmptyFacade('W'),
    windowToWallRatio: { N: 0, S: 0, E: 0, W: 0 },
    totalOpenings: 0,
  };
}

/**
 * Create empty CanonicalRenders
 * @returns {CanonicalRenders}
 */
export function createEmptyCanonicalRenders() {
  return {
    floorPlansSVG: {},
    elevationsSVG: {},
    sectionsSVG: {},
    massing3DViewsPNG: {},
  };
}

/**
 * Create complete CanonicalDesignState
 * @param {Object} [data] - Initial data
 * @returns {CanonicalDesignState}
 */
export function createCanonicalDesignState(data = {}) {
  const state = {
    meta: {
      designId: data.meta?.designId || generateDesignId(),
      version: '2.0', // Version bump for new schema
      createdAt: data.meta?.createdAt || new Date().toISOString(),
      dnaHash: data.meta?.dnaHash || null,
      generatorVersion: data.meta?.generatorVersion || '2.0',
    },
    designFingerprint: null, // Will be computed after all data is set
    site: createEmptySite(data.site),
    program: createEmptyProgram(data.program),
    massing: createEmptyMassing(data.massing),
    style: createEmptyStyleRef(data.style),
    constraints: createEmptyConstraints(data.constraints),
    // New fields for Canonical Design State
    geometryModel: data.geometryModel || null,
    facadeModel: data.facadeModel || null,
    canonicalRenders: data.canonicalRenders || null,
    masterDNA: data.masterDNA || null,
  };

  // Compute fingerprint from immutable design data
  state.designFingerprint =
    data.designFingerprint ||
    computeDesignFingerprint({
      site: state.site,
      program: state.program,
      massing: state.massing,
      style: state.style,
    });

  return state;
}

// =============================================================================
// CONVERSION FUNCTIONS
// =============================================================================

/**
 * Detect room program type from name
 * @param {string} name - Room name
 * @returns {string} - Program type
 */
function detectProgramFromName(name) {
  if (!name) {
    return 'generic';
  }
  const n = name.toLowerCase();

  // Circulation spaces - check these first (before 'hall' catches 'hallway')
  if (n.includes('hallway') || n.includes('corridor')) {
    return 'hallway';
  }
  if (n.includes('landing') || n.includes('stair')) {
    return 'landing';
  }

  // Living spaces
  if (n.includes('living') || n.includes('lounge') || n.includes('sitting')) {
    return 'living';
  }
  if (n.includes('kitchen')) {
    return 'kitchen';
  }
  if (n.includes('dining')) {
    return 'dining';
  }

  // Bedrooms and private spaces
  if (n.includes('master') || n.includes('main bed')) {
    return 'master_bedroom';
  }
  if (n.includes('bedroom') || n.includes('bed ')) {
    return 'bedroom';
  }
  if (n.includes('bathroom') || n.includes('bath ')) {
    return 'bathroom';
  }
  if (n.includes('en-suite') || n.includes('ensuite')) {
    return 'ensuite';
  }
  if (n.includes('wc') || n.includes('toilet') || n.includes('cloakroom')) {
    return 'wc';
  }

  // Service spaces
  if (n.includes('utility')) {
    return 'utility';
  }
  if (n.includes('garage')) {
    return 'garage';
  }
  if (n.includes('storage')) {
    return 'storage';
  }

  // Entrance and public areas - check after 'hallway'
  if (n.includes('hall') || n.includes('entrance') || n.includes('foyer')) {
    return 'entrance';
  }

  // Workspaces
  if (n.includes('study') || n.includes('office')) {
    return 'study';
  }

  // Commercial/healthcare spaces
  if (n.includes('reception')) {
    return 'reception';
  }
  if (n.includes('waiting')) {
    return 'waiting';
  }
  if (n.includes('consultation') || n.includes('consulting')) {
    return 'consultation';
  }
  if (n.includes('treatment')) {
    return 'treatment';
  }

  return 'generic';
}

/**
 * Convert legacy DNA format to CanonicalDesignState
 *
 * IMPORTANT: programFromUI takes highest priority as a hard constraint.
 * If DNA has no valid rooms, we fall back to programFromUI.
 *
 * @param {Object} legacyDNA - Legacy DNA object
 * @param {Object} [siteSnapshot] - Site snapshot data
 * @param {Object} [projectContext] - Project context (includes programSpaces from UI)
 * @param {Array} [programFromUI] - Direct program spaces from UI (highest priority fallback)
 * @returns {CanonicalDesignState}
 */
export function fromLegacyDNA(
  legacyDNA,
  siteSnapshot = null,
  projectContext = {},
  programFromUI = null
) {
  if (!legacyDNA) {
    logger.warn('[fromLegacyDNA] No DNA provided, returning empty state');
    return createCanonicalDesignState();
  }

  // Extract structured DNA if available
  const structured = legacyDNA._structured || legacyDNA;

  // Build site from siteSnapshot and DNA
  const site = createEmptySite({
    boundary: siteSnapshot?.sitePolygon || structured.site?.polygon || [],
    areaM2: siteSnapshot?.areaM2 || structured.site?.area_m2 || projectContext.area || 0,
    orientationDeg: structured.site?.orientation || 0,
    entranceSide: legacyDNA.entranceDirection || projectContext.entranceDirection || 'S',
    climate: siteSnapshot?.climate || { zone: structured.site?.climate_zone || 'temperate' },
    sunPath: { optimalOrientation: structured.site?.sun_path || 'south' },
  });

  // Get floor count from various sources
  // PRIORITY ORDER: projectContext (user input) > structured.program > legacyDNA.dimensions
  // User input should take precedence over AI-generated values
  const floorCount =
    projectContext.floors ||
    projectContext.floorCount ||
    structured.program?.floors ||
    legacyDNA.dimensions?.floors ||
    legacyDNA.dimensions?.floorCount ||
    2;

  logger.info('[DEBUG fromLegacyDNA] Floor count resolved', {
    resolved: floorCount,
    sources: {
      'legacyDNA.dimensions.floors': legacyDNA.dimensions?.floors,
      'legacyDNA.dimensions.floorCount': legacyDNA.dimensions?.floorCount,
      'structured.program.floors': structured.program?.floors,
      'projectContext.floors': projectContext.floors,
      'projectContext.floorCount': projectContext.floorCount,
    },
  });

  // ============================================================================
  // ROOM EXTRACTION - PRIORITY ORDER:
  // 1. programFromUI (direct parameter - HIGHEST PRIORITY as hard constraint)
  // 2. projectContext.programSpaces (array from UI context)
  // 3. legacyDNA.rooms (direct DNA rooms)
  // 4. structured.program?.rooms (nested DNA rooms)
  // 5. legacyDNA.program?.spaces (alternative DNA format)
  // ============================================================================

  let rawRooms = [];
  let roomSource = 'none';

  // Priority 1: Direct programFromUI parameter (HARD CONSTRAINT)
  if (Array.isArray(programFromUI) && programFromUI.length > 0) {
    rawRooms = programFromUI;
    roomSource = 'programFromUI (direct parameter)';
    logger.info('[fromLegacyDNA] ✓ Using programFromUI as hard constraint', {
      roomCount: rawRooms.length,
      source: roomSource,
      rooms: rawRooms.map((r) => `${r.name} (${r.level || r.floor})`).join(', '),
    });
  }
  // Priority 2: projectContext.programSpaces (ARRAY - NOT .spaces!)
  else if (Array.isArray(projectContext.programSpaces) && projectContext.programSpaces.length > 0) {
    rawRooms = projectContext.programSpaces;
    roomSource = 'projectContext.programSpaces (array)';
    logger.info('[fromLegacyDNA] ✓ Using programSpaces from projectContext', {
      roomCount: rawRooms.length,
      source: roomSource,
      rooms: rawRooms.map((r) => `${r.name} (${r.level || r.floor})`).join(', '),
    });
  }
  // Priority 3: legacyDNA.programRooms (rooms with proper floor distribution from dnaWorkflowOrchestrator)
  // CRITICAL FIX: This is where distributed rooms from STEP 2.07 are stored
  else if (Array.isArray(legacyDNA.programRooms) && legacyDNA.programRooms.length > 0) {
    rawRooms = legacyDNA.programRooms.map((r) => ({
      name: r.name,
      area_m2: r.area || r.area_m2 || 20,
      floor: r.floor ?? r.levelIndex ?? 0,
      orientation: r.orientation || 'any',
      program: r.program || 'generic',
    }));
    roomSource = 'legacyDNA.programRooms (distributed)';
    logger.info('[fromLegacyDNA] ✓ Using programRooms with floor distribution', {
      roomCount: rawRooms.length,
      source: roomSource,
      byFloor: rawRooms.reduce((acc, r) => {
        const f = r.floor === 0 ? 'Ground' : r.floor === 1 ? 'First' : `Floor ${r.floor}`;
        acc[f] = (acc[f] || 0) + 1;
        return acc;
      }, {}),
    });
  }
  // Priority 4: legacyDNA.rooms
  else if (Array.isArray(legacyDNA.rooms) && legacyDNA.rooms.length > 0) {
    rawRooms = legacyDNA.rooms;
    roomSource = 'legacyDNA.rooms';
    logger.info('[fromLegacyDNA] Using rooms from legacyDNA.rooms', {
      roomCount: rawRooms.length,
      source: roomSource,
    });
  }
  // Priority 4: structured.program?.rooms
  else if (Array.isArray(structured.program?.rooms) && structured.program.rooms.length > 0) {
    rawRooms = structured.program.rooms;
    roomSource = 'structured.program.rooms';
    logger.info('[fromLegacyDNA] Using rooms from structured.program.rooms', {
      roomCount: rawRooms.length,
      source: roomSource,
    });
  }
  // Priority 5: legacyDNA.program?.spaces
  else if (Array.isArray(legacyDNA.program?.spaces) && legacyDNA.program.spaces.length > 0) {
    rawRooms = legacyDNA.program.spaces;
    roomSource = 'legacyDNA.program.spaces';
    logger.info('[fromLegacyDNA] Using rooms from legacyDNA.program.spaces', {
      roomCount: rawRooms.length,
      source: roomSource,
    });
  }
  // FALLBACK: Check for projectContext.programSpaces.spaces (legacy nested format)
  else if (projectContext.programSpaces?.spaces?.length > 0) {
    rawRooms = projectContext.programSpaces.spaces;
    roomSource = 'projectContext.programSpaces.spaces (legacy nested)';
    logger.info('[fromLegacyDNA] Using rooms from legacy nested format', {
      roomCount: rawRooms.length,
      source: roomSource,
    });
  }

  // Log warning if no rooms found
  if (rawRooms.length === 0) {
    logger.warn('[fromLegacyDNA] ⚠️ NO ROOMS FOUND from any source!', {
      hasProgramFromUI: !!programFromUI,
      programFromUILength: programFromUI?.length || 0,
      hasProgramSpaces: !!projectContext.programSpaces,
      programSpacesIsArray: Array.isArray(projectContext.programSpaces),
      programSpacesLength: projectContext.programSpaces?.length || 0,
      hasLegacyRooms: !!legacyDNA.rooms,
      legacyRoomsLength: legacyDNA.rooms?.length || 0,
      hasStructuredRooms: !!structured.program?.rooms,
      structuredRoomsLength: structured.program?.rooms?.length || 0,
    });
  }

  // Normalize rooms - convert various formats to standard format
  // Also handle 'count' field to expand rooms (e.g., Bedroom x2 -> Bedroom 1, Bedroom 2)
  const normalizedRooms = [];

  rawRooms.forEach((r) => {
    const baseName = r.name || r.roomName || r.label || 'Room';
    const area = parseFloat(r.area_m2 || r.area || r.areaM2 || r.targetArea) || 20;
    const floor = normalizeFloorString(r.floor ?? r.level ?? r.levelIndex ?? 0);
    const orientation = r.orientation || r.daylightOrientation || 'any';
    const program = r.program || detectProgramFromName(baseName);
    const count = parseInt(r.count, 10) || 1;

    if (count === 1) {
      normalizedRooms.push({
        name: baseName,
        area_m2: area,
        floor,
        orientation,
        program,
      });
    } else {
      // Expand rooms with count > 1 (e.g., "Bedroom" x2 -> "Bedroom 1", "Bedroom 2")
      for (let i = 1; i <= count; i++) {
        normalizedRooms.push({
          name: `${baseName} ${i}`,
          area_m2: area,
          floor,
          orientation,
          program,
        });
      }
    }
  });

  // Log detailed floor distribution
  const byFloorMap = normalizedRooms.reduce((acc, r) => {
    const floorName = r.floor === 0 ? 'Ground' : r.floor === 1 ? 'First' : `Floor ${r.floor}`;
    acc[floorName] = (acc[floorName] || 0) + 1;
    return acc;
  }, {});

  logger.info('[fromLegacyDNA] Normalized rooms by floor', {
    totalRooms: normalizedRooms.length,
    byFloor: byFloorMap,
    source: roomSource,
    rooms: normalizedRooms.map((r) => `${r.name}@floor${r.floor}`).join(', '),
  });

  // IMPORTANT: Do NOT fall back to empty rooms when program exists
  // This ensures the program specification is actually used
  const hasProgramInput = rawRooms.length > 0;

  // ============================================================================
  // BUG FIX: Auto-redistribute rooms if all are on floor 0 but floorCount > 1
  // This handles UI cases where rooms are created without level assignment
  // ============================================================================
  let redistributedRooms = normalizedRooms;
  const allRoomsOnGroundFloor = normalizedRooms.every((r) => r.floor === 0);
  const needsRedistribution = hasProgramInput && floorCount > 1 && allRoomsOnGroundFloor;

  if (needsRedistribution) {
    logger.info('[fromLegacyDNA] 🔄 Redistributing rooms: all on floor 0 but floorCount > 1');

    try {
      const distributionResult = distributeRoomsToFloors(
        normalizedRooms.map((r) => ({
          ...r,
          name: r.name,
          type: r.program,
          area_m2: r.area_m2,
        })),
        {
          buildingType:
            legacyDNA.buildingType || structured.typology?.building_type || 'single-family',
          floorCount: floorCount,
          siteArea: projectContext.area || 150,
          enforceCirculation: true,
        }
      );

      if (distributionResult.success) {
        // Rebuild normalizedRooms with updated floor assignments
        redistributedRooms = [];
        for (const [floorIdx, rooms] of Object.entries(distributionResult.floors)) {
          for (const room of rooms) {
            redistributedRooms.push({
              ...room,
              floor: parseInt(floorIdx, 10),
            });
          }
        }

        logger.info('[fromLegacyDNA] ✓ Redistribution complete', {
          originalByFloor: byFloorMap,
          newByFloor: distributionResult.summary.roomsPerFloor,
        });
      }
    } catch (err) {
      logger.warn('[fromLegacyDNA] Room redistribution failed, using original assignment', {
        error: err.message,
      });
    }
  }

  const levels = [];
  for (let i = 0; i < floorCount; i++) {
    const levelRooms = redistributedRooms
      .filter((r) => r.floor === i)
      .map((r) =>
        createRoom({
          name: r.name,
          targetAreaM2: r.area_m2,
          daylightOrientation: r.orientation,
          program: r.program,
        })
      );

    // Log if level has no rooms but program input exists
    if (levelRooms.length === 0 && hasProgramInput) {
      logger.warn(`[fromLegacyDNA] Level ${i} has 0 rooms but program input exists`, {
        floorIndex: i,
        totalNormalizedRooms: redistributedRooms.length,
        floorDistribution: redistributedRooms.map((r) => ({ name: r.name, floor: r.floor })),
      });
    }

    levels.push(createLevel(i, { rooms: levelRooms }));
  }

  // Build program
  const program = createEmptyProgram({
    buildingType:
      legacyDNA.buildingType || structured.typology?.building_type || 'residential_house',
    buildingCategory:
      legacyDNA.buildingCategory || structured.typology?.building_category || 'residential',
    totalAreaM2:
      projectContext.totalArea ||
      legacyDNA.dimensions?.totalArea ||
      normalizedRooms.reduce((sum, r) => sum + (r.area_m2 || 20), 0),
    levelCount: floorCount,
    levels,
  });

  // Build massing - CRITICAL: Extract explicit dimensions from DNA to prevent corruption
  // DNA uses: dimensions.length (width), dimensions.width (depth)
  // Note: DNA naming is confusing - "length" is the building width (facade), "width" is depth (front-to-back)
  const dnaLength = legacyDNA.dimensions?.length || structured.geometry?.dimensions?.length;
  const dnaWidth = legacyDNA.dimensions?.width || structured.geometry?.dimensions?.width;
  const dnaDepth = legacyDNA.dimensions?.depth || structured.geometry?.dimensions?.depth;

  // FIX: Calculate fallback dimensions from total area when DNA doesn't provide them
  // This ensures BuildingModel always gets explicit dimensions
  let fallbackWidthM = null;
  let fallbackDepthM = null;
  if (!dnaLength && !dnaWidth) {
    const totalAreaM2 =
      legacyDNA.totalArea ||
      structured.program?.total_area_m2 ||
      program.levels.reduce(
        (sum, lvl) => sum + lvl.rooms.reduce((s, r) => s + (r.targetAreaM2 || 20), 0),
        0
      ) ||
      150;
    const footprintAreaM2 = totalAreaM2 / floorCount;
    // Use 1.5:1 aspect ratio (width:depth) for typical residential
    const aspectRatio = 1.5;
    fallbackWidthM = Math.sqrt(footprintAreaM2 * aspectRatio);
    fallbackDepthM = footprintAreaM2 / fallbackWidthM;
    logger.info('[fromLegacyDNA] Calculated fallback dimensions from area', {
      totalAreaM2,
      footprintAreaM2,
      fallbackWidthM: Math.round(fallbackWidthM * 10) / 10,
      fallbackDepthM: Math.round(fallbackDepthM * 10) / 10,
    });
  }

  const massing = createEmptyMassing({
    footprintShape: structured.geometry?.massing?.footprint_shape || 'rectangular',
    // FIXED: Pass explicit dimensions from DNA - with fallback calculation
    widthM: dnaLength || dnaWidth || fallbackWidthM, // Building facade width
    depthM: dnaDepth || (dnaWidth && dnaLength ? dnaWidth : null) || fallbackDepthM, // Building depth
    roofType: structured.geometry?.roof?.type || structured.geometry_rules?.roof_type || 'gable',
    roofPitchDeg: structured.geometry?.roof?.pitch_degrees || 35,
    totalHeightM: legacyDNA.dimensions?.height || legacyDNA.dimensions?.totalHeight || 8,
    eaveHeightM:
      (legacyDNA.dimensions?.groundFloorHeight || 3) +
      (floorCount - 1) * (legacyDNA.dimensions?.upperFloorHeight || 2.7),
  });

  logger.info('[fromLegacyDNA] Massing dimensions extracted', {
    dnaLength,
    dnaWidth,
    dnaDepth,
    massingWidthM: massing.widthM,
    massingDepthM: massing.depthM,
  });

  // Build style reference
  const style = createEmptyStyleRef({
    vernacularStyle:
      legacyDNA.architecturalStyle || structured.style?.architecture || 'contemporary',
    materials: structured.style?.materials || legacyDNA.materials?.map((m) => m.name) || ['brick'],
    windowStyle: structured.style?.windows?.pattern?.includes('sash') ? 'sash' : 'casement',
  });

  // Build constraints with adjacency matrix
  const adjacencyMatrix = buildAdjacencyMatrix(program.levels);
  const constraints = createEmptyConstraints({
    adjacencyMatrix,
    circulationWidthMm: MIN_CIRCULATION_WIDTH_MM,
    windowToWallRatio: 0.2,
  });

  // ============================================================================
  // BUILD programRooms ARRAY (TOP-LEVEL FOR EASY ACCESS BY BuildingModel)
  // Each room has levelIndex for floor assignment
  // NOTE: Use redistributedRooms (which may have updated floor assignments)
  // ============================================================================
  const programRooms = redistributedRooms.map((r, idx) => ({
    id: `room_${idx}`,
    name: r.name,
    area: r.area_m2,
    targetAreaM2: r.area_m2,
    levelIndex: r.floor, // 0 = ground, 1 = first, etc.
    levelName: r.floor === 0 ? 'Ground' : r.floor === 1 ? 'First' : `Floor ${r.floor}`,
    category: inferCategoryFromProgram(r.program),
    program: r.program,
    orientation: r.orientation,
    zoneType: ZONE_TYPE_MAP[r.program] || 'public',
    spaceType: SPACE_TYPE_MAP[r.program] || 'public',
  }));

  logger.info('[fromLegacyDNA] Created programRooms array', {
    totalRooms: programRooms.length,
    byLevel: programRooms.reduce((acc, r) => {
      acc[r.levelName] = (acc[r.levelName] || 0) + 1;
      return acc;
    }, {}),
    rooms: programRooms.map((r) => `${r.name}@${r.levelName}`).join(', '),
  });

  // ============================================================================
  // QA CHECKS: Validate programRooms before returning
  // ============================================================================

  // QA CHECK 1: HARD FAIL if no program rooms
  if (programRooms.length === 0) {
    logger.error(
      '❌ QA FAIL: No program rooms in CanonicalDesignState – geometry will receive empty program!'
    );
    logger.error('   This will result in a generic shoebox building.');
    logger.error('   Check: programSpaces from UI → projectContext.programSpaces → fromLegacyDNA');
    // Note: We don't throw here to allow graceful degradation, but this is a critical warning
  }

  // QA CHECK 2: Warn if levelCount doesn't match rooms distribution
  const maxLevelInRooms =
    programRooms.length > 0 ? Math.max(...programRooms.map((r) => r.levelIndex || 0)) : 0;
  const effectiveLevelCount = maxLevelInRooms + 1;

  if (effectiveLevelCount < floorCount) {
    logger.warn(
      `⚠️  QA WARNING: levelCount (${floorCount}) > floors with rooms (${effectiveLevelCount})`
    );
    logger.warn(
      `   Rooms are only assigned to floors 0-${maxLevelInRooms}, but ${floorCount} floors requested.`
    );
    logger.warn(`   Consider redistributing rooms or adjusting floor count.`);
  }

  // QA CHECK 3: Warn if total room area is too small
  const totalRoomArea = programRooms.reduce((sum, r) => sum + (r.targetAreaM2 || 0), 0);
  if (totalRoomArea < 30 && programRooms.length > 0) {
    logger.warn(`⚠️  QA WARNING: Total room area (${totalRoomArea.toFixed(1)}m²) seems very small`);
  }

  return {
    meta: {
      designId: generateDesignId(),
      version: '1.0',
      createdAt: new Date().toISOString(),
      dnaHash: null,
      generatorVersion: '2.0',
    },
    site,
    program,
    massing,
    style,
    constraints,
    // TOP-LEVEL programRooms for easy access by BuildingModel
    programRooms,
    levelCount: floorCount,
    levels: program.levels.map((l) => l.name || (l.index === 0 ? 'Ground' : `Floor ${l.index}`)),
  };
}

/**
 * Infer category from room program type
 * @param {string} program - Room program type
 * @returns {string} - 'public', 'private', or 'service'
 */
function inferCategoryFromProgram(program) {
  const p = (program || '').toLowerCase();

  // Service/circulation
  if (
    p.includes('hall') ||
    p.includes('landing') ||
    p.includes('circulation') ||
    p.includes('stair') ||
    p.includes('utility') ||
    p.includes('storage')
  ) {
    return 'service';
  }

  // Private
  if (
    p.includes('bedroom') ||
    p.includes('bathroom') ||
    p.includes('ensuite') ||
    p.includes('wc') ||
    p.includes('study') ||
    p.includes('nursery')
  ) {
    return 'private';
  }

  // Public (default)
  return 'public';
}

/**
 * Convert CanonicalDesignState to legacy DNA format
 * For backward compatibility with existing code
 * @param {CanonicalDesignState} state - Canonical state
 * @returns {Object} - Legacy DNA format
 */
export function toLegacyDNA(state) {
  if (!state) {
    return null;
  }

  // Flatten rooms from all levels
  const allRooms = state.program.levels.flatMap((level, levelIndex) =>
    level.rooms.map((room) => ({
      name: room.name,
      area_m2: room.targetAreaM2,
      area: room.targetAreaM2,
      floor: levelIndex,
      orientation: room.daylightOrientation || 'any',
    }))
  );

  // Calculate dimensions
  const totalRoomArea = allRooms.reduce((sum, r) => sum + (r.area_m2 || 20), 0);
  const footprintArea = totalRoomArea / state.program.levelCount;
  const width = Math.sqrt(footprintArea / 1.5);
  const length = footprintArea / width;

  return {
    // Dimensions
    dimensions: {
      length: Math.round(length * 10) / 10,
      width: Math.round(width * 10) / 10,
      height: state.massing.totalHeightM,
      floors: state.program.levelCount,
      totalHeight: state.massing.totalHeightM,
      floorCount: state.program.levelCount,
      footprintArea,
      groundFloorHeight: state.program.levels[0]?.floorHeightM || DEFAULT_GROUND_FLOOR_HEIGHT,
      upperFloorHeight: state.program.levels[1]?.floorHeightM || DEFAULT_FLOOR_HEIGHT,
      totalArea: state.program.totalAreaM2,
    },

    // Materials
    materials: state.style.materials.map((mat, idx) => ({
      name: mat,
      hexColor: idx === 0 ? '#B8604E' : idx === 1 ? '#8B4513' : '#CCCCCC',
      application: idx === 0 ? 'exterior walls' : idx === 1 ? 'roof' : 'trim',
    })),

    // Roof
    roof: {
      type: state.massing.roofType,
      pitch: state.massing.roofPitchDeg,
      material: state.style.materials[1] || 'tiles',
    },

    // Rooms (flattened)
    rooms: allRooms,

    // Building type
    buildingType: state.program.buildingType,
    buildingCategory: state.program.buildingCategory,
    projectType: state.program.buildingType,

    // Style
    architecturalStyle: state.style.vernacularStyle,

    // Entrance
    entranceDirection: state.site.entranceSide,

    // Site
    siteConstraints: {
      polygon: state.site.boundary,
      areaM2: state.site.areaM2,
      orientation: state.site.orientationDeg,
      setbacks: state.site.setbacks,
    },

    // Climate
    climateDesign: {
      zone: state.site.climate?.zone || 'temperate',
      orientation: state.site.sunPath?.optimalOrientation || 'south',
    },

    // Geometry rules
    geometry_rules: {
      roof_type: state.massing.roofType,
      max_span: `${state.constraints.maxStructuralSpanM}m`,
      grid: state.constraints.gridModuleM,
    },

    // Structured version (for compatibility)
    _structured: {
      site: {
        polygon: state.site.boundary,
        area_m2: state.site.areaM2,
        orientation: state.site.orientationDeg,
        climate_zone: state.site.climate?.zone,
        sun_path: state.site.sunPath?.optimalOrientation,
      },
      program: {
        floors: state.program.levelCount,
        rooms: allRooms,
      },
      style: {
        architecture: state.style.vernacularStyle,
        materials: state.style.materials,
        windows: { pattern: 'regular grid', proportion: '3:5' },
      },
      geometry_rules: {
        roof_type: state.massing.roofType,
        max_span: `${state.constraints.maxStructuralSpanM}m`,
        grid: state.constraints.gridModuleM,
      },
    },

    // Store canonical reference
    _canonical: state,

    // Version
    version: '2.0',
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize floor string to number
 * @param {string|number} floor - Floor value
 * @returns {number}
 */
function normalizeFloorString(floor) {
  if (typeof floor === 'number') {
    return floor;
  }
  if (!floor) {
    return 0;
  }

  const str = String(floor).toLowerCase().trim();
  const map = {
    ground: 0,
    g: 0,
    0: 0,
    ground_floor: 0,
    first: 1,
    1: 1,
    upper: 1,
    first_floor: 1,
    second: 2,
    2: 2,
    second_floor: 2,
    third: 3,
    3: 3,
    third_floor: 3,
    basement: -1,
    lower: -1,
    lower_ground: -1,
  };
  return map[str] ?? 0;
}

/**
 * Build adjacency matrix from levels
 * Creates default adjacencies based on room programs
 * @param {CanonicalLevel[]} levels - Levels with rooms
 * @returns {Object} - Adjacency matrix
 */
function buildAdjacencyMatrix(levels) {
  const matrix = {};

  // Default adjacency rules based on room program
  const defaultAdjacencies = {
    living: ['entrance', 'dining', 'kitchen'],
    kitchen: ['dining', 'utility', 'living'],
    dining: ['kitchen', 'living'],
    master_bedroom: ['ensuite', 'bathroom'],
    bedroom: ['bathroom', 'circulation'],
    entrance: ['living', 'circulation'],
    circulation: ['entrance', 'bedroom', 'bathroom'],
    reception: ['waiting', 'office'],
    waiting: ['reception', 'consultation'],
    consultation: ['waiting', 'treatment'],
  };

  // Collect all rooms with their IDs
  const allRooms = levels.flatMap((level) => level.rooms);

  // Build matrix
  allRooms.forEach((room) => {
    const program = room.program || 'generic';
    const defaultAdj = defaultAdjacencies[program] || [];

    // Find rooms that match default adjacencies
    const adjacentIds = allRooms
      .filter((r) => r.id !== room.id && defaultAdj.includes(r.program))
      .map((r) => r.id);

    if (adjacentIds.length > 0) {
      matrix[room.id] = adjacentIds;
    }
  });

  return matrix;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Is valid
 * @property {string[]} errors - Critical errors (fail-fast)
 * @property {string[]} warnings - Non-critical warnings
 */

/**
 * Validate CanonicalDesignState
 * @param {CanonicalDesignState} state - State to validate
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.strict] - Fail on warnings too
 * @returns {ValidationResult}
 */
export function validateCanonicalDesignState(state, options = {}) {
  const errors = [];
  const warnings = [];

  if (!state) {
    errors.push('State is null or undefined');
    return { valid: false, errors, warnings };
  }

  // Meta validation
  if (!state.meta?.designId) {
    errors.push('meta.designId is required');
  }

  // Site validation
  if (!state.site) {
    errors.push('site section is required');
  } else {
    if (!ENTRANCE_DIRECTIONS.includes(state.site.entranceSide)) {
      warnings.push(`Invalid entranceSide: ${state.site.entranceSide}, using 'S'`);
    }
    if (state.site.areaM2 <= 0) {
      warnings.push('site.areaM2 should be positive');
    }
  }

  // Program validation
  if (!state.program) {
    errors.push('program section is required');
  } else {
    if (state.program.levelCount < 1) {
      errors.push('program.levelCount must be at least 1');
    }
    if (!state.program.levels || state.program.levels.length === 0) {
      errors.push('program.levels must have at least one level');
    } else {
      // Validate each level has rooms
      state.program.levels.forEach((level, i) => {
        if (!level.rooms || level.rooms.length === 0) {
          warnings.push(`Level ${i} (${level.name}) has no rooms`);
        }
      });

      // Validate total area roughly matches sum of room areas
      const totalRoomArea = state.program.levels
        .flatMap((l) => l.rooms)
        .reduce((sum, r) => sum + (r.targetAreaM2 || 0), 0);

      const areaRatio = totalRoomArea / (state.program.totalAreaM2 || 1);
      if (areaRatio < 0.7 || areaRatio > 1.3) {
        warnings.push(
          `Room areas (${totalRoomArea.toFixed(0)}m²) differ significantly from totalAreaM2 (${state.program.totalAreaM2}m²)`
        );
      }
    }
  }

  // Massing validation
  if (!state.massing) {
    errors.push('massing section is required');
  } else {
    if (!FOOTPRINT_SHAPES.includes(state.massing.footprintShape)) {
      warnings.push(`Unknown footprintShape: ${state.massing.footprintShape}`);
    }
    if (!ROOF_TYPES.includes(state.massing.roofType)) {
      warnings.push(`Unknown roofType: ${state.massing.roofType}`);
    }
    if (state.massing.totalHeightM <= 0) {
      errors.push('massing.totalHeightM must be positive');
    }
  }

  // Style validation
  if (!state.style) {
    errors.push('style section is required');
  } else {
    const weights = state.style.blendWeights;
    if (weights) {
      const sum = (weights.location || 0) + (weights.portfolio || 0) + (weights.variation || 0);
      if (Math.abs(sum - 1.0) > 0.01) {
        warnings.push(`Style blend weights should sum to 1.0 (got ${sum.toFixed(2)})`);
      }
    }
  }

  // Constraints validation
  if (state.constraints) {
    if (state.constraints.circulationWidthMm < MIN_CIRCULATION_WIDTH_MM) {
      warnings.push(
        `circulationWidthMm (${state.constraints.circulationWidthMm}) below UK minimum (${MIN_CIRCULATION_WIDTH_MM})`
      );
    }
  }

  const valid = errors.length === 0 && (!options.strict || warnings.length === 0);

  return { valid, errors, warnings };
}

/**
 * Validate and throw on critical errors (fail-fast)
 * @param {CanonicalDesignState} state - State to validate
 * @param {string} [context] - Context for error message
 * @throws {Error} If validation fails
 */
export function validateOrThrow(state, context = 'CanonicalDesignState') {
  const result = validateCanonicalDesignState(state);

  if (!result.valid) {
    const errorMsg = `${context} validation failed: ${result.errors.join('; ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (result.warnings.length > 0) {
    logger.warn(`${context} validation warnings:`, result.warnings);
  }

  return state;
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Check if CanonicalDesignState has complete geometry data
 * Required for panel generation
 * @param {CanonicalDesignState} state - State to check
 * @returns {boolean}
 */
export function hasCompleteGeometry(state) {
  if (!state) {return false;}
  if (!state.geometryModel) {return false;}
  if (!state.geometryModel.floors || state.geometryModel.floors.length === 0) {return false;}

  // Check each floor has rooms
  const hasRooms = state.geometryModel.floors.every(
    (floor) => floor.rooms && floor.rooms.length > 0
  );

  return hasRooms;
}

/**
 * Check if CanonicalDesignState has complete facade data
 * Required for elevation panels
 * @param {CanonicalDesignState} state - State to check
 * @returns {boolean}
 */
export function hasCompleteFacade(state) {
  if (!state) {return false;}
  if (!state.facadeModel) {return false;}

  const orientations = ['north', 'south', 'east', 'west'];
  return orientations.every((dir) => state.facadeModel[dir] && state.facadeModel[dir].width > 0);
}

/**
 * Check if CanonicalDesignState has canonical renders ready
 * Required for SVG panel generation
 * @param {CanonicalDesignState} state - State to check
 * @returns {boolean}
 */
export function hasCanonicalRenders(state) {
  if (!state) {return false;}
  if (!state.canonicalRenders) {return false;}

  // Check at least one floor plan SVG exists
  const hasFloorPlans = Object.keys(state.canonicalRenders.floorPlansSVG || {}).length > 0;

  return hasFloorPlans;
}

/**
 * Check if CanonicalDesignState is ready for panel generation
 * All required fields must be present
 * @param {CanonicalDesignState} state - State to check
 * @returns {{ ready: boolean, missing: string[] }}
 */
export function isReadyForPanelGeneration(state) {
  const missing = [];

  if (!state) {
    return { ready: false, missing: ['state'] };
  }

  if (!state.designFingerprint) {
    missing.push('designFingerprint');
  }

  if (!state.geometryModel || !hasCompleteGeometry(state)) {
    missing.push('geometryModel (complete floors with rooms)');
  }

  if (!state.facadeModel || !hasCompleteFacade(state)) {
    missing.push('facadeModel (all four orientations)');
  }

  if (!state.canonicalRenders || !hasCanonicalRenders(state)) {
    missing.push('canonicalRenders');
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export default {
  // Constants
  ENTRANCE_DIRECTIONS,
  FOOTPRINT_SHAPES,
  ROOF_TYPES,
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_GROUND_FLOOR_HEIGHT,
  MIN_CIRCULATION_WIDTH_MM,
  SPACE_TYPE_MAP,
  ZONE_TYPE_MAP,

  // Factory functions
  generateDesignId,
  createEmptySite,
  createRoom,
  createLevel,
  createEmptyProgram,
  createEmptyMassing,
  createEmptyStyleRef,
  createEmptyConstraints,
  createCanonicalDesignState,
  createEmptyGeometryModel,
  createEmptyFacadeModel,
  createEmptyCanonicalRenders,

  // Fingerprint
  computeDesignFingerprint,

  // Conversion functions
  fromLegacyDNA,
  toLegacyDNA,

  // Validation
  validateCanonicalDesignState,
  validateOrThrow,

  // Ready checks
  hasCompleteGeometry,
  hasCompleteFacade,
  hasCanonicalRenders,
  isReadyForPanelGeneration,
};
