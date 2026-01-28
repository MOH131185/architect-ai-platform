/**
 * Floor Plan Validator
 *
 * Validates generated floor plan layouts for:
 * - Room connectivity (all rooms reachable via doors/circulation)
 * - No polygon overlaps (rooms don't intersect)
 * - Stair alignment (vertical circulation aligns across floors)
 * - Area tolerance (actual room areas within tolerance of target)
 *
 * @module services/validation/FloorPlanValidator
 */

import logger from "../../utils/logger.js";

/**
 * Floor plan validation error
 */
export class FloorPlanValidationError extends Error {
  constructor(errors, warnings = []) {
    super(`Floor plan validation failed: ${errors.join("; ")}`);
    this.name = "FloorPlanValidationError";
    this.errors = errors;
    this.warnings = warnings;
    this.recoverable = warnings.length > 0 && errors.length === 0;
  }
}

/**
 * Floor Plan Validator Class
 */
export class FloorPlanValidator {
  constructor(options = {}) {
    this.areaTolerance = options.areaTolerance ?? 0.15; // 15% default
    this.stairAlignmentTolerance = options.stairAlignmentTolerance ?? 0.5; // 0.5m tolerance
    this.minCirculationWidth = options.minCirculationWidth ?? 0.9; // 900mm UK Building Regs
  }

  /**
   * Validate room connectivity
   * Ensures all rooms are reachable from the entrance via doors/circulation
   *
   * @param {Array} floors - Array of floor objects with rooms and doors
   * @returns {Object} { valid: boolean, disconnectedRooms: string[] }
   */
  validateConnectivity(floors) {
    const disconnectedRooms = [];

    for (const floor of floors) {
      const rooms = floor.rooms || [];
      const doors = floor.doors || [];

      if (rooms.length === 0) continue;

      // Build adjacency graph from doors
      const adjacency = this.buildAdjacencyGraph(rooms, doors);

      // Find entrance room (usually lobby, hall, or main entrance)
      const entranceRoom = this.findEntranceRoom(rooms, floor.index);

      if (!entranceRoom) {
        // If no entrance on this floor, check if stair connects to it
        const stairRoom = rooms.find(
          (r) =>
            r.name?.toLowerCase().includes("stair") ||
            r.program?.toLowerCase().includes("circulation"),
        );
        if (!stairRoom && floor.index > 0) {
          // Upper floors need stair connection
          disconnectedRooms.push(
            `Floor ${floor.index}: No stair/circulation found`,
          );
          continue;
        }
      }

      // BFS from entrance to find all reachable rooms
      const startRoom = entranceRoom || rooms[0];
      const reachable = this.bfsReachable(startRoom.id, adjacency);

      // Check which rooms are not reachable
      for (const room of rooms) {
        if (!reachable.has(room.id)) {
          disconnectedRooms.push(
            `${room.name || room.id} (Floor ${floor.index})`,
          );
        }
      }
    }

    return {
      valid: disconnectedRooms.length === 0,
      disconnectedRooms,
    };
  }

  /**
   * Build adjacency graph from rooms and doors
   */
  buildAdjacencyGraph(rooms, doors) {
    const adjacency = new Map();

    // Initialize adjacency list for each room
    for (const room of rooms) {
      adjacency.set(room.id, new Set());
    }

    // Add edges from doors
    for (const door of doors) {
      const room1 = door.room1 || door.fromRoom;
      const room2 = door.room2 || door.toRoom;

      if (room1 && room2) {
        if (adjacency.has(room1)) adjacency.get(room1).add(room2);
        if (adjacency.has(room2)) adjacency.get(room2).add(room1);
      }
    }

    // Also check for rooms marked as adjacent
    for (const room of rooms) {
      if (room.adjacentTo) {
        const adjacentIds = Array.isArray(room.adjacentTo)
          ? room.adjacentTo
          : [room.adjacentTo];
        for (const adjId of adjacentIds) {
          if (adjacency.has(adjId)) {
            adjacency.get(room.id).add(adjId);
            adjacency.get(adjId).add(room.id);
          }
        }
      }
    }

    return adjacency;
  }

  /**
   * Find entrance room on a floor
   */
  findEntranceRoom(rooms, floorIndex) {
    // Ground floor should have main entrance
    if (floorIndex === 0) {
      return rooms.find(
        (r) =>
          r.isEntrance ||
          r.name?.toLowerCase().includes("entrance") ||
          r.name?.toLowerCase().includes("lobby") ||
          r.name?.toLowerCase().includes("hall") ||
          r.name?.toLowerCase().includes("foyer") ||
          r.name?.toLowerCase().includes("reception"),
      );
    }
    // Upper floors - look for stair landing
    return rooms.find(
      (r) =>
        r.name?.toLowerCase().includes("stair") ||
        r.name?.toLowerCase().includes("landing") ||
        r.program === "circulation",
    );
  }

  /**
   * BFS to find all reachable rooms from start
   */
  bfsReachable(startId, adjacency) {
    const visited = new Set();
    const queue = [startId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;

      visited.add(current);

      const neighbors = adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return visited;
  }

  /**
   * Validate no room polygon overlaps
   *
   * @param {Object} floorPlanResult - Floor plan with room polygons
   * @returns {Object} { valid: boolean, overlappingPairs: Array }
   */
  validateNoOverlaps(floorPlanResult) {
    const overlappingPairs = [];
    const floors = floorPlanResult.floors || [floorPlanResult];

    for (const floor of floors) {
      const rooms = floor.rooms || floor.roomPolygons || [];

      // Check each pair of rooms for overlap
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const room1 = rooms[i];
          const room2 = rooms[j];

          if (this.polygonsOverlap(room1.polygon, room2.polygon)) {
            overlappingPairs.push([
              room1.name || room1.id,
              room2.name || room2.id,
            ]);
          }
        }
      }
    }

    return {
      valid: overlappingPairs.length === 0,
      overlappingPairs,
    };
  }

  /**
   * Check if two polygons overlap (simplified axis-aligned bounding box check)
   * For more accurate check, use proper polygon intersection algorithm
   */
  polygonsOverlap(poly1, poly2) {
    if (!poly1 || !poly2 || poly1.length < 3 || poly2.length < 3) {
      return false;
    }

    // Get bounding boxes
    const bbox1 = this.getBoundingBox(poly1);
    const bbox2 = this.getBoundingBox(poly2);

    // Check AABB overlap (with small epsilon for touching edges)
    const epsilon = 0.01;
    return !(
      bbox1.maxX <= bbox2.minX + epsilon ||
      bbox2.maxX <= bbox1.minX + epsilon ||
      bbox1.maxY <= bbox2.minY + epsilon ||
      bbox2.maxY <= bbox1.minY + epsilon
    );
  }

  /**
   * Get axis-aligned bounding box of polygon
   */
  getBoundingBox(polygon) {
    const xs = polygon.map((p) => p.x ?? p[0] ?? 0);
    const ys = polygon.map((p) => p.y ?? p[1] ?? 0);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  /**
   * Validate stair alignment across floors
   *
   * @param {Array} floors - Array of floor objects
   * @returns {Object} { valid: boolean, misalignedStairs: string[] }
   */
  validateStairAlignment(floors) {
    const misalignedStairs = [];

    if (floors.length < 2) {
      // Single floor, no alignment needed
      return { valid: true, misalignedStairs: [] };
    }

    // Find stairs on each floor
    const stairsByFloor = floors.map((floor, index) => {
      const stairs =
        floor.stairs ||
        (floor.rooms || []).filter(
          (r) =>
            r.name?.toLowerCase().includes("stair") ||
            r.program === "stair" ||
            r.type === "stair",
        );
      return { floorIndex: index, stairs };
    });

    // Check alignment between consecutive floors
    for (let i = 0; i < stairsByFloor.length - 1; i++) {
      const lowerFloor = stairsByFloor[i];
      const upperFloor = stairsByFloor[i + 1];

      for (const lowerStair of lowerFloor.stairs) {
        let hasAlignedStair = false;

        for (const upperStair of upperFloor.stairs) {
          if (this.stairsAlign(lowerStair, upperStair)) {
            hasAlignedStair = true;
            break;
          }
        }

        if (!hasAlignedStair && upperFloor.stairs.length > 0) {
          misalignedStairs.push(
            `Stair on floor ${lowerFloor.floorIndex} does not align with floor ${upperFloor.floorIndex}`,
          );
        }
      }
    }

    return {
      valid: misalignedStairs.length === 0,
      misalignedStairs,
    };
  }

  /**
   * Check if two stairs align vertically
   */
  stairsAlign(stair1, stair2) {
    // Get center points
    const center1 = this.getCenter(stair1.polygon || stair1.position);
    const center2 = this.getCenter(stair2.polygon || stair2.position);

    if (!center1 || !center2) return true; // Can't determine, assume OK

    // Check if centers are within tolerance
    const dx = Math.abs(center1.x - center2.x);
    const dy = Math.abs(center1.y - center2.y);

    return (
      dx <= this.stairAlignmentTolerance && dy <= this.stairAlignmentTolerance
    );
  }

  /**
   * Get center point of polygon or position
   */
  getCenter(polygonOrPosition) {
    if (!polygonOrPosition) return null;

    if (
      polygonOrPosition.x !== undefined &&
      polygonOrPosition.y !== undefined
    ) {
      return polygonOrPosition;
    }

    if (Array.isArray(polygonOrPosition) && polygonOrPosition.length > 0) {
      const xs = polygonOrPosition.map((p) => p.x ?? p[0] ?? 0);
      const ys = polygonOrPosition.map((p) => p.y ?? p[1] ?? 0);
      return {
        x: xs.reduce((a, b) => a + b, 0) / xs.length,
        y: ys.reduce((a, b) => a + b, 0) / ys.length,
      };
    }

    return null;
  }

  /**
   * Validate room areas are within tolerance of targets
   *
   * @param {Array} rooms - Array of room objects with actual areas
   * @param {Array} programSpaces - Array of target program spaces
   * @param {number} tolerance - Tolerance percentage (default 0.15 = 15%)
   * @returns {Object} { valid: boolean, outOfTolerance: Array }
   */
  validateAreaTolerance(rooms, programSpaces, tolerance = this.areaTolerance) {
    const outOfTolerance = [];

    if (!programSpaces || programSpaces.length === 0) {
      // No targets to compare against
      return { valid: true, outOfTolerance: [] };
    }

    // Build map of target areas by room name/type
    const targetAreas = new Map();
    for (const space of programSpaces) {
      const key = (space.name || space.type || "").toLowerCase();
      targetAreas.set(key, space.area || space.targetAreaM2 || space.area_m2);
    }

    // Check each room
    for (const room of rooms) {
      const key = (room.name || room.type || "").toLowerCase();
      const targetArea = targetAreas.get(key);

      if (!targetArea) continue; // No target for this room

      const actualArea =
        room.area || room.areaM2 || this.calculatePolygonArea(room.polygon);

      if (actualArea) {
        const diff = Math.abs(actualArea - targetArea) / targetArea;

        if (diff > tolerance) {
          outOfTolerance.push({
            room: room.name || room.id,
            target: targetArea,
            actual: actualArea,
            difference: `${(diff * 100).toFixed(1)}%`,
          });
        }
      }
    }

    return {
      valid: outOfTolerance.length === 0,
      outOfTolerance,
    };
  }

  /**
   * Calculate area of a polygon using shoelace formula
   */
  calculatePolygonArea(polygon) {
    if (!polygon || polygon.length < 3) return 0;

    let area = 0;
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = polygon[i].x ?? polygon[i][0] ?? 0;
      const yi = polygon[i].y ?? polygon[i][1] ?? 0;
      const xj = polygon[j].x ?? polygon[j][0] ?? 0;
      const yj = polygon[j].y ?? polygon[j][1] ?? 0;

      area += xi * yj - xj * yi;
    }

    return Math.abs(area) / 2;
  }

  /**
   * Run all validations
   *
   * @param {Object} floorPlanResult - Generated floor plan result
   * @param {Array} programSpaces - Target program spaces
   * @returns {Object} Complete validation result
   */
  validate(floorPlanResult, programSpaces = []) {
    logger.info("Validating floor plan layout...");

    const floors = floorPlanResult.floors || [floorPlanResult];
    const allRooms = floors.flatMap((f) => f.rooms || []);

    const connectivity = this.validateConnectivity(floors);
    const overlaps = this.validateNoOverlaps(floorPlanResult);
    const stairs = this.validateStairAlignment(floors);
    const areas = this.validateAreaTolerance(allRooms, programSpaces);

    const errors = [];
    const warnings = [];

    // Connectivity errors are critical
    if (!connectivity.valid) {
      errors.push(
        `Disconnected rooms: ${connectivity.disconnectedRooms.join(", ")}`,
      );
    }

    // Overlaps are critical
    if (!overlaps.valid) {
      errors.push(
        `Overlapping rooms: ${overlaps.overlappingPairs
          .map((p) => p.join(" & "))
          .join(", ")}`,
      );
    }

    // Stair misalignment is critical for multi-floor
    if (!stairs.valid) {
      errors.push(
        `Stair alignment issues: ${stairs.misalignedStairs.join(", ")}`,
      );
    }

    // Area tolerance is a warning (not critical)
    if (!areas.valid) {
      warnings.push(
        `Rooms out of area tolerance: ${areas.outOfTolerance
          .map((r) => `${r.room} (${r.difference})`)
          .join(", ")}`,
      );
    }

    const valid = errors.length === 0;

    const result = {
      valid,
      errors,
      warnings,
      details: {
        connectivity,
        overlaps,
        stairs,
        areas,
      },
    };

    if (valid) {
      logger.success("Floor plan validation passed");
      if (warnings.length > 0) {
        warnings.forEach((w) => logger.warn(`  Warning: ${w}`));
      }
    } else {
      logger.error("Floor plan validation failed");
      errors.forEach((e) => logger.error(`  Error: ${e}`));
    }

    return result;
  }
}

// Singleton instance
const floorPlanValidator = new FloorPlanValidator();

export default floorPlanValidator;
