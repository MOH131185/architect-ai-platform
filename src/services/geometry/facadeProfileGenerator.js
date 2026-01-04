/**
 * Facade Profile Generator
 *
 * Generates elevation projection data from populatedGeometry by:
 * 1. Detecting wall normal vectors to classify walls as N/S/E/W
 * 2. Projecting wall edges into 2D elevation space (horizontal position + Z height)
 * 3. Converting story heights into vertical level bands
 * 4. Projecting opening rectangles with sill/head heights
 *
 * Part of the Geometry Projection Layer (GPL).
 *
 * @module services/geometry/facadeProfileGenerator
 */

import { generateWallId, generateOpeningId } from '../../utils/idGenerator.js';
import logger from '../core/logger.js';

// ============ CONSTANTS ============

/**
 * Default sill heights per opening type (UK Building Regs)
 */
const DEFAULT_SILL_HEIGHTS = {
  window: 900, // 900mm standard window sill
  door: 0, // Doors at floor level
  entrance: 0,
  garage: 0,
  french: 0, // French doors at floor level
  patio: 0,
};

/**
 * Default opening heights per type
 */
const DEFAULT_OPENING_HEIGHTS = {
  window: 1200,
  door: 2100,
  entrance: 2100,
  garage: 2400,
  french: 2100,
  patio: 2100,
};

/**
 * Default opening widths per type
 */
const DEFAULT_OPENING_WIDTHS = {
  window: 1200,
  door: 900,
  entrance: 1000,
  garage: 2400,
  french: 1800,
  patio: 2400,
};

// ============ WALL CLASSIFICATION ============

/**
 * Classify wall orientation based on normal vector
 * @param {Object} wall - Wall with start and end points
 * @returns {string} Orientation: 'N', 'S', 'E', or 'W'
 */
export function classifyWallOrientation(wall) {
  // FIX: Handle both array format [x, y] and object format {x, y}
  const rawStart = wall.start || [0, 0];
  const rawEnd = wall.end || [0, 0];

  const start = {
    x: Array.isArray(rawStart) ? rawStart[0] : (rawStart.x ?? 0),
    y: Array.isArray(rawStart) ? rawStart[1] : (rawStart.y ?? 0),
  };
  const end = {
    x: Array.isArray(rawEnd) ? rawEnd[0] : (rawEnd.x ?? 0),
    y: Array.isArray(rawEnd) ? rawEnd[1] : (rawEnd.y ?? 0),
  };

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Normal vector (perpendicular, pointing outward)
  // For a wall from start to end, the normal is rotated 90 degrees
  const nx = dy;
  const ny = -dx;
  const length = Math.sqrt(nx * nx + ny * ny);

  if (length < 1) {
    // Degenerate wall - default to North
    return 'N';
  }

  const normX = nx / length;
  const normY = ny / length;

  // Classify: Y+ is North, Y- is South, X+ is East, X- is West
  if (Math.abs(normY) > Math.abs(normX)) {
    return normY > 0 ? 'N' : 'S';
  } else {
    return normX > 0 ? 'E' : 'W';
  }
}

/**
 * Check if wall is exterior (on building boundary)
 * @param {Object} wall - Wall object
 * @param {Object} buildingBounds - Building bounding box
 * @param {number} tolerance - Edge detection tolerance in mm
 * @returns {boolean}
 */
export function isExteriorWall(wall, buildingBounds, tolerance = 100) {
  const { minX, maxX, minY, maxY } = buildingBounds;

  // FIX: Handle both array format [x, y] and object format {x, y}
  const rawStart = wall.start || [0, 0];
  const rawEnd = wall.end || [0, 0];

  const start = {
    x: Array.isArray(rawStart) ? rawStart[0] : (rawStart.x ?? 0),
    y: Array.isArray(rawStart) ? rawStart[1] : (rawStart.y ?? 0),
  };
  const end = {
    x: Array.isArray(rawEnd) ? rawEnd[0] : (rawEnd.x ?? 0),
    y: Array.isArray(rawEnd) ? rawEnd[1] : (rawEnd.y ?? 0),
  };

  // Check if wall is along any building edge
  const onMinX = Math.abs(start.x - minX) < tolerance && Math.abs(end.x - minX) < tolerance;
  const onMaxX = Math.abs(start.x - maxX) < tolerance && Math.abs(end.x - maxX) < tolerance;
  const onMinY = Math.abs(start.y - minY) < tolerance && Math.abs(end.y - minY) < tolerance;
  const onMaxY = Math.abs(start.y - maxY) < tolerance && Math.abs(end.y - maxY) < tolerance;

  // FIX: Also check wall.type === 'external' (BuildingModel convention)
  return onMinX || onMaxX || onMinY || onMaxY || wall.exterior === true || wall.type === 'external';
}

// ============ WALL PROJECTION ============

/**
 * Project wall to elevation plane
 * @param {Object} wall - Wall with start, end points
 * @param {string} facade - Facade direction ('N', 'S', 'E', 'W')
 * @param {number} floorElevation - Floor elevation in mm
 * @param {number} floorHeight - Floor height in mm
 * @returns {Object} Wall line in elevation space
 */
export function projectWallToElevation(wall, facade, floorElevation, floorHeight) {
  // FIX: Handle both array format [x, y] and object format {x, y}
  const rawStart = wall.start || [0, 0];
  const rawEnd = wall.end || [0, 0];

  const start = {
    x: Array.isArray(rawStart) ? rawStart[0] : (rawStart.x ?? 0),
    y: Array.isArray(rawStart) ? rawStart[1] : (rawStart.y ?? 0),
  };
  const end = {
    x: Array.isArray(rawEnd) ? rawEnd[0] : (rawEnd.x ?? 0),
    y: Array.isArray(rawEnd) ? rawEnd[1] : (rawEnd.y ?? 0),
  };

  // For N/S facades, use X coordinate; for E/W, use Y coordinate
  const useX = facade === 'N' || facade === 'S';
  const h1 = useX ? start.x : start.y;
  const h2 = useX ? end.x : end.y;

  // FIX: Use deterministic ID instead of Date.now()
  const floorLevel = wall.floor || wall.floorLevel || 0;
  const orientation = facade || wall.facadeDirection || 'unknown';

  return {
    x1: Math.min(h1, h2),
    x2: Math.max(h1, h2),
    z1: floorElevation,
    z2: floorElevation + floorHeight,
    wallId: wall.id || generateWallId(floorLevel, orientation, 0),
    thickness: wall.thickness || 300,
    exterior: wall.exterior || false,
    floor: floorLevel,
  };
}

// ============ OPENING PROJECTION ============

/**
 * Calculate opening position along wall
 * @param {Object} opening - Opening object
 * @param {Object} wall - Parent wall
 * @returns {Object} Position { x, y }
 */
function getOpeningPosition(opening, wall) {
  // If opening has explicit position, use it
  if (opening.position) {
    return opening.position;
  }

  // FIX: Handle both array format [x, y] and object format {x, y}
  const rawStart = wall.start || [0, 0];
  const rawEnd = wall.end || [0, 0];

  const wallStart = {
    x: Array.isArray(rawStart) ? rawStart[0] : (rawStart.x ?? 0),
    y: Array.isArray(rawStart) ? rawStart[1] : (rawStart.y ?? 0),
  };
  const wallEnd = {
    x: Array.isArray(rawEnd) ? rawEnd[0] : (rawEnd.x ?? 0),
    y: Array.isArray(rawEnd) ? rawEnd[1] : (rawEnd.y ?? 0),
  };
  const wallCenterX = (wallStart.x + wallEnd.x) / 2;
  const wallCenterY = (wallStart.y + wallEnd.y) / 2;

  // Apply offset if provided
  const offset = opening.offset || 0;
  const dx = wallEnd.x - wallStart.x;
  const dy = wallEnd.y - wallStart.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1) {
    return { x: wallCenterX, y: wallCenterY };
  }

  return {
    x: wallCenterX + (dx / length) * offset,
    y: wallCenterY + (dy / length) * offset,
  };
}

/**
 * Project opening to elevation plane
 * @param {Object} opening - Opening object
 * @param {Object} wall - Parent wall (optional)
 * @param {string} facade - Facade direction
 * @param {number} floorElevation - Floor elevation in mm
 * @returns {Object} Opening rectangle in elevation space
 */
export function projectOpeningToElevation(opening, wall, facade, floorElevation) {
  // FIX: Handle multiple position formats:
  // 1. Direct x, y on opening (from GeometryPrimerV3)
  // 2. Nested position: { x, y }
  // 3. Calculate from parent wall
  let position;

  if (opening.x !== undefined || opening.y !== undefined) {
    // Direct x, y coordinates on opening object
    position = { x: opening.x ?? 0, y: opening.y ?? 0 };
  } else if (opening.position) {
    // Nested position object
    position = opening.position;
  } else if (wall) {
    // Calculate from parent wall
    position = getOpeningPosition(opening, wall);
  } else {
    // Fallback to (0, 0)
    position = { x: 0, y: 0 };
  }

  // For N/S facades, use X coordinate; for E/W, use Y coordinate
  const useX = facade === 'N' || facade === 'S';
  const posAlongFacade = useX ? position.x : position.y;

  // Get opening dimensions
  const type = opening.type || 'window';
  const width = opening.width || DEFAULT_OPENING_WIDTHS[type] || 1200;
  const height = opening.height || DEFAULT_OPENING_HEIGHTS[type] || 1200;
  const sillHeight = opening.sillHeight ?? DEFAULT_SILL_HEIGHTS[type] ?? 900;
  const headHeight = sillHeight + height;

  // FIX: Store x and z coordinates for PDE compatibility
  // FIX: Use deterministic ID instead of Date.now()
  const floorLevel = opening.floor ?? opening.floorLevel ?? wall?.floor ?? wall?.floorLevel ?? 0;
  const facadeDir = opening.facade || opening.facadeDirection || 'unknown';

  return {
    type,
    centerX: posAlongFacade,
    width,
    height,
    x: posAlongFacade - width / 2, // FIX: Add x for PDE
    z: floorElevation + sillHeight, // FIX: Add z for PDE (sill height from ground)
    x1: posAlongFacade - width / 2,
    x2: posAlongFacade + width / 2,
    sillZ: floorElevation + sillHeight,
    sillHeight: sillHeight, // FIX: Include sillHeight for PDE
    headZ: floorElevation + headHeight,
    openingId: opening.id || generateOpeningId(type, floorLevel, facadeDir, 0),
    floor: floorLevel,
    // FIX: Provide fallback wallId if wall is undefined
    wallId: wall?.id || generateWallId(floorLevel, facadeDir, 0),
  };
}

// ============ BOUNDS CALCULATION ============

/**
 * Calculate building bounds from populated geometry
 * @param {Object} populatedGeometry - Geometry with floors, rooms, walls
 * @returns {Object} Bounds { minX, maxX, minY, maxY, width, depth }
 */
export function calculateBuildingBounds(populatedGeometry) {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  const floors = populatedGeometry.floors || [];

  floors.forEach((floor) => {
    // Check floor boundary
    const boundary = floor.boundary || [];
    boundary.forEach((point) => {
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    // Check room polygons and walls inside rooms
    const rooms = floor.rooms || [];
    rooms.forEach((room) => {
      const polygon = room.polygon || [];
      polygon.forEach((point) => {
        const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });

      // Also check walls inside rooms
      const roomWalls = room.walls || [];
      roomWalls.forEach((wall) => {
        // FIX: Handle both array format [x, y] and object format {x, y}
        if (wall.start) {
          const startX = Array.isArray(wall.start) ? wall.start[0] : (wall.start.x ?? 0);
          const startY = Array.isArray(wall.start) ? wall.start[1] : (wall.start.y ?? 0);
          minX = Math.min(minX, startX);
          maxX = Math.max(maxX, startX);
          minY = Math.min(minY, startY);
          maxY = Math.max(maxY, startY);
        }
        if (wall.end) {
          const endX = Array.isArray(wall.end) ? wall.end[0] : (wall.end.x ?? 0);
          const endY = Array.isArray(wall.end) ? wall.end[1] : (wall.end.y ?? 0);
          minX = Math.min(minX, endX);
          maxX = Math.max(maxX, endX);
          minY = Math.min(minY, endY);
          maxY = Math.max(maxY, endY);
        }
      });
    });

    // Check walls at floor level
    const walls = floor.walls || [];
    walls.forEach((wall) => {
      // FIX: Handle both array format [x, y] and object format {x, y}
      if (wall.start) {
        const startX = Array.isArray(wall.start) ? wall.start[0] : (wall.start.x ?? 0);
        const startY = Array.isArray(wall.start) ? wall.start[1] : (wall.start.y ?? 0);
        minX = Math.min(minX, startX);
        maxX = Math.max(maxX, startX);
        minY = Math.min(minY, startY);
        maxY = Math.max(maxY, startY);
      }
      if (wall.end) {
        const endX = Array.isArray(wall.end) ? wall.end[0] : (wall.end.x ?? 0);
        const endY = Array.isArray(wall.end) ? wall.end[1] : (wall.end.y ?? 0);
        minX = Math.min(minX, endX);
        maxX = Math.max(maxX, endX);
        minY = Math.min(minY, endY);
        maxY = Math.max(maxY, endY);
      }
    });
  });

  // Handle edge case where no geometry found
  if (minX === Infinity) {
    minX = 0;
    maxX = 15000;
    minY = 0;
    maxY = 10000;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    depth: maxY - minY,
  };
}

// ============ MAIN GENERATOR ============

/**
 * Generate facade profiles from populated geometry
 * @param {Object} populatedGeometry - Geometry with floors, rooms, walls, openings
 * @param {Object} dimensions - Building dimensions { length, width, floorHeights }
 * @param {Object} roofConfig - Roof configuration { roof_type, roof_pitch, overhang }
 * @returns {Object} Facade profiles { N: {...}, S: {...}, E: {...}, W: {...} }
 */
export function generateFacadeProfiles(populatedGeometry, dimensions, roofConfig = {}) {
  logger.info('[FacadeProfileGenerator] Starting facade profile generation...');

  // [DEBUG-FPG] Log incoming geometry
  console.warn('[DEBUG-FPG] populatedGeometry.floors:', populatedGeometry?.floors?.length || 0);
  if (populatedGeometry?.floors) {
    populatedGeometry.floors.forEach((floor, i) => {
      console.warn(`[DEBUG-FPG] Floor ${i}:`, {
        walls: floor.walls?.length || 0,
        exteriorWalls: floor.walls?.filter((w) => w.exterior)?.length || 0,
        openings: floor.openings?.length || 0,
        rooms: floor.rooms?.length || 0,
        boundary: floor.boundary?.length || 0,
      });
    });
  }

  const floorHeights = dimensions.floorHeights || [3000, 2700];
  const totalWallHeight = floorHeights.reduce((sum, h) => sum + h, 0);

  // Initialize facade profiles
  const facades = {
    N: { wallLines: [], openingRects: [], roofLines: [], levels: [], totalHeight: totalWallHeight },
    S: { wallLines: [], openingRects: [], roofLines: [], levels: [], totalHeight: totalWallHeight },
    E: { wallLines: [], openingRects: [], roofLines: [], levels: [], totalHeight: totalWallHeight },
    W: { wallLines: [], openingRects: [], roofLines: [], levels: [], totalHeight: totalWallHeight },
  };

  // Calculate building bounds
  const bounds = calculateBuildingBounds(populatedGeometry);
  logger.info(`[FacadeProfileGenerator] Building bounds: ${bounds.width}mm x ${bounds.depth}mm`);

  // Generate level information
  let cumulativeElevation = 0;
  floorHeights.forEach((height, idx) => {
    const levelInfo = {
      index: idx,
      name: idx === 0 ? 'Ground Floor' : `Level ${idx}`,
      elevation: cumulativeElevation,
      height,
    };
    facades.N.levels.push(levelInfo);
    facades.S.levels.push({ ...levelInfo });
    facades.E.levels.push({ ...levelInfo });
    facades.W.levels.push({ ...levelInfo });
    cumulativeElevation += height;
  });

  // Process each floor
  const floors = populatedGeometry.floors || [];
  let currentElevation = 0;

  floors.forEach((floor, floorIndex) => {
    const floorHeight = floorHeights[floorIndex] || 2700;

    // Collect walls and openings from floor level
    let walls = floor.walls || [];
    let openings = floor.openings || [];

    // Also collect walls and openings from rooms (nested structure)
    const rooms = floor.rooms || [];
    rooms.forEach((room) => {
      if (room.walls && Array.isArray(room.walls)) {
        walls = walls.concat(room.walls);
      }
      if (room.openings && Array.isArray(room.openings)) {
        // Tag openings with their parent walls for proper association
        const taggedOpenings = room.openings.map((opening, idx) => {
          // If opening references a wall by index, link to actual wall
          if (typeof opening.wall === 'number' && room.walls && room.walls[opening.wall]) {
            return { ...opening, parentWall: room.walls[opening.wall] };
          }
          return opening;
        });
        openings = openings.concat(taggedOpenings);
      }
    });

    logger.info(
      `[FacadeProfileGenerator] Processing floor ${floorIndex}: ${walls.length} walls, ${openings.length} openings`
    );

    // [DEBUG-FPG] Log wall processing start
    console.warn(
      `[DEBUG-FPG] Floor ${floorIndex} - Processing ${walls.length} walls, ${openings.length} openings`
    );

    // Process walls
    walls.forEach((wall, wallIdx) => {
      // Check if exterior wall
      // FIX: BuildingModel uses type='external' but we were only checking wall.exterior
      const isExt =
        isExteriorWall(wall, bounds) || wall.exterior === true || wall.type === 'external';
      if (!isExt) {
        return;
      }

      // Classify wall orientation
      // FIX: Use existing facadeDirection if available, otherwise calculate
      const orientation = wall.facadeDirection || classifyWallOrientation(wall);

      // [DEBUG-FPG] Log each exterior wall processed
      if (wallIdx < 4) {
        console.warn(`[DEBUG-FPG] Exterior wall ${wallIdx}:`, {
          id: wall.id,
          orientation,
          start: wall.start,
          end: wall.end,
          exterior: wall.exterior,
          facadeDirection: wall.facadeDirection,
        });
      }

      // Project wall to elevation
      const wallLine = projectWallToElevation(wall, orientation, currentElevation, floorHeight);
      wallLine.floor = floorIndex;
      facades[orientation].wallLines.push(wallLine);

      // FIX: Process openings - match by wallId, wall, or facade direction matching wall orientation
      const wallOpenings = openings.filter((o) => {
        // Match by wallId
        if (o.wallId === wall.id || o.wall === wall.id) {
          return true;
        }
        // FIX: Match by facade property (e.g., opening.facade === 'N' matches wall orientation 'N')
        if (o.facade && o.facade === orientation) {
          return true;
        }
        return false;
      });

      // [DEBUG-FPG] Log openings matched to this wall
      if (wallOpenings.length > 0) {
        console.warn(
          `[DEBUG-FPG] Wall ${wall.id} (${orientation}) matched ${wallOpenings.length} openings`
        );
      }

      wallOpenings.forEach((opening) => {
        const openingRect = projectOpeningToElevation(opening, wall, orientation, currentElevation);
        facades[orientation].openingRects.push(openingRect);
      });
    });

    // Process openings with parentWall reference (from room-nested structure)
    openings.forEach((opening) => {
      if (opening.parentWall) {
        const wall = opening.parentWall;
        // Check if the parent wall is exterior
        // FIX: BuildingModel uses type='external' but we were only checking wall.exterior
        const isExt =
          isExteriorWall(wall, bounds) || wall.exterior === true || wall.type === 'external';
        if (!isExt) {
          return;
        }

        const orientation = wall.facadeDirection || classifyWallOrientation(wall);
        const openingRect = projectOpeningToElevation(opening, wall, orientation, currentElevation);
        openingRect.floor = floorIndex;
        facades[orientation].openingRects.push(openingRect);
        return;
      }

      // Skip openings that were already processed via wallId/wall ID match or facade property
      if (opening.wallId || typeof opening.wall === 'string' || opening.facade) {
        return;
      }

      // Process standalone openings (not assigned to specific walls)
      // Infer facade from opening position
      const pos = opening.position || {
        x: bounds.minX + bounds.width / 2,
        y: bounds.minY + bounds.depth / 2,
      };
      let facade = 'N';

      // Determine which edge the opening is closest to
      const distToN = Math.abs(pos.y - bounds.maxY);
      const distToS = Math.abs(pos.y - bounds.minY);
      const distToE = Math.abs(pos.x - bounds.maxX);
      const distToW = Math.abs(pos.x - bounds.minX);
      const minDist = Math.min(distToN, distToS, distToE, distToW);

      if (minDist === distToN) {
        facade = 'N';
      } else if (minDist === distToS) {
        facade = 'S';
      } else if (minDist === distToE) {
        facade = 'E';
      } else {
        facade = 'W';
      }

      const openingRect = projectOpeningToElevation(opening, null, facade, currentElevation);
      openingRect.floor = floorIndex;
      facades[facade].openingRects.push(openingRect);
    });

    currentElevation += floorHeight;
  });

  // If no walls found, create boundary walls from bounds
  if (
    facades.N.wallLines.length === 0 &&
    facades.S.wallLines.length === 0 &&
    facades.E.wallLines.length === 0 &&
    facades.W.wallLines.length === 0
  ) {
    logger.warn('[FacadeProfileGenerator] No exterior walls found, generating from bounds');

    let elevation = 0;
    floorHeights.forEach((height, idx) => {
      // North wall (at maxY)
      facades.N.wallLines.push({
        x1: bounds.minX,
        x2: bounds.maxX,
        z1: elevation,
        z2: elevation + height,
        wallId: `bound_n_${idx}`,
        thickness: 300,
        exterior: true,
        floor: idx,
      });

      // South wall (at minY)
      facades.S.wallLines.push({
        x1: bounds.minX,
        x2: bounds.maxX,
        z1: elevation,
        z2: elevation + height,
        wallId: `bound_s_${idx}`,
        thickness: 300,
        exterior: true,
        floor: idx,
      });

      // East wall (at maxX)
      facades.E.wallLines.push({
        x1: bounds.minY,
        x2: bounds.maxY,
        z1: elevation,
        z2: elevation + height,
        wallId: `bound_e_${idx}`,
        thickness: 300,
        exterior: true,
        floor: idx,
      });

      // West wall (at minX)
      facades.W.wallLines.push({
        x1: bounds.minY,
        x2: bounds.maxY,
        z1: elevation,
        z2: elevation + height,
        wallId: `bound_w_${idx}`,
        thickness: 300,
        exterior: true,
        floor: idx,
      });

      elevation += height;
    });
  }

  // Sort wall lines and openings by position
  ['N', 'S', 'E', 'W'].forEach((dir) => {
    facades[dir].wallLines.sort((a, b) => a.x1 - b.x1);
    facades[dir].openingRects.sort((a, b) => {
      if (a.floor !== b.floor) {
        return a.floor - b.floor;
      }
      return a.x1 - b.x1;
    });
  });

  // FIX BUG 3: Deduplicate and cap openings per facade
  // Prevents excessive openings from duplicate matching strategies
  const MAX_WINDOWS_PER_FACADE = 6;
  const MAX_DOORS_PER_FACADE = 2;

  ['N', 'S', 'E', 'W'].forEach((dir) => {
    const openings = facades[dir].openingRects;
    if (!openings || openings.length === 0) {
      return;
    }

    // Step 1: Deduplicate by opening ID
    const seenIds = new Set();
    const deduplicated = openings.filter((o) => {
      const key = o.openingId || `${o.type}_${o.floor}_${Math.round(o.x1)}`;
      if (seenIds.has(key)) {
        logger.debug(`[FPG] Removed duplicate opening: ${key} on ${dir} facade`);
        return false;
      }
      seenIds.add(key);
      return true;
    });

    // Step 2: Separate by type and cap
    const windows = deduplicated.filter((o) => o.type === 'window');
    const doors = deduplicated.filter(
      (o) => o.type === 'door' || o.type === 'entrance' || o.type === 'patio'
    );
    const other = deduplicated.filter(
      (o) => !['window', 'door', 'entrance', 'patio'].includes(o.type)
    );

    // Cap windows and doors
    const cappedWindows = windows.slice(0, MAX_WINDOWS_PER_FACADE);
    const cappedDoors = doors.slice(0, MAX_DOORS_PER_FACADE);

    if (windows.length > MAX_WINDOWS_PER_FACADE) {
      logger.warn(
        `[FPG] Capped ${dir} facade: ${windows.length} windows → ${MAX_WINDOWS_PER_FACADE}`
      );
    }
    if (doors.length > MAX_DOORS_PER_FACADE) {
      logger.warn(`[FPG] Capped ${dir} facade: ${doors.length} doors → ${MAX_DOORS_PER_FACADE}`);
    }

    // Recombine
    facades[dir].openingRects = [...cappedWindows, ...cappedDoors, ...other];

    logger.debug(
      `[FPG] ${dir} facade: ${facades[dir].openingRects.length} openings after dedup/cap`
    );
  });

  // FIX 2: Validate and ensure ALL 4 facades have wallLines and groundLine
  ['N', 'S', 'E', 'W'].forEach((dir) => {
    const isNS = dir === 'N' || dir === 'S';
    const facadeWidth = isNS ? bounds.width : bounds.depth;

    // Ensure wallLines exist for every floor
    if (!facades[dir].wallLines || facades[dir].wallLines.length === 0) {
      logger.warn(
        `[FacadeProfileGenerator] FIX 2: ${dir} facade missing wallLines - generating from bounds`
      );

      let elevation = 0;
      floorHeights.forEach((height, idx) => {
        facades[dir].wallLines.push({
          x1: 0,
          x2: facadeWidth,
          z1: elevation,
          z2: elevation + height,
          wallId: `generated_${dir}_${idx}`,
          thickness: 300,
          exterior: true,
          floor: idx,
        });
        elevation += height;
      });
    }

    // Ensure groundLine exists
    if (!facades[dir].groundLine) {
      facades[dir].groundLine = {
        x1: 0,
        x2: facadeWidth,
        z: 0,
      };
      logger.info(`[FacadeProfileGenerator] FIX 2: Added groundLine for ${dir} facade`);
    }

    // Ensure totalHeight is set
    if (!facades[dir].totalHeight) {
      facades[dir].totalHeight = totalWallHeight;
    }

    // Ensure levels array exists
    if (!facades[dir].levels || facades[dir].levels.length === 0) {
      let cumulativeEl = 0;
      facades[dir].levels = floorHeights.map((height, idx) => {
        const level = {
          index: idx,
          name: idx === 0 ? 'Ground Floor' : `Level ${idx}`,
          elevation: cumulativeEl,
          height,
        };
        cumulativeEl += height;
        return level;
      });
    }
  });

  // Log results
  logger.info(`[FacadeProfileGenerator] Complete:`);
  logger.info(
    `  - North: ${facades.N.wallLines.length} walls, ${facades.N.openingRects.length} openings, groundLine: ${facades.N.groundLine ? 'yes' : 'no'}`
  );
  logger.info(
    `  - South: ${facades.S.wallLines.length} walls, ${facades.S.openingRects.length} openings, groundLine: ${facades.S.groundLine ? 'yes' : 'no'}`
  );
  logger.info(
    `  - East: ${facades.E.wallLines.length} walls, ${facades.E.openingRects.length} openings, groundLine: ${facades.E.groundLine ? 'yes' : 'no'}`
  );
  logger.info(
    `  - West: ${facades.W.wallLines.length} walls, ${facades.W.openingRects.length} openings, groundLine: ${facades.W.groundLine ? 'yes' : 'no'}`
  );

  return facades;
}

// ============ EXPORTS ============

export default {
  generateFacadeProfiles,
  classifyWallOrientation,
  isExteriorWall,
  projectWallToElevation,
  projectOpeningToElevation,
  calculateBuildingBounds,
};
