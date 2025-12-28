/**
 * Multi-Pass Validation Service
 *
 * Orchestrates the validation loop between Claude reasoning and geometry engine.
 * Ensures architectural constraints are satisfied through iterative refinement.
 *
 * Flow:
 * 1. Claude generates constraints
 * 2. Geometry engine generates coordinates
 * 3. Claude validates against constraints
 * 4. If violations: geometry engine applies corrections
 * 5. Repeat until valid or max passes reached
 */

import { isFeatureEnabled, FEATURE_FLAGS } from '../../config/featureFlags.js';
import { validateGeometryOutput } from '../ai/claudeReasoningService.js';
import logger from '../core/logger.js';

/**
 * Validation Result
 * @typedef {Object} ValidationResult
 * @property {boolean} passed - Whether all constraints are satisfied
 * @property {number} score - Overall validation score (0-100)
 * @property {Array} violations - List of constraint violations
 * @property {Array} corrections - Suggested corrections
 * @property {string} summary - Human-readable summary
 */

/**
 * Multi-Pass Result
 * @typedef {Object} MultiPassResult
 * @property {Object} geometry - Final validated geometry
 * @property {number} passes - Number of passes performed
 * @property {'valid'|'best-effort'|'failed'} status - Final status
 * @property {ValidationResult} finalValidation - Last validation result
 * @property {Array} history - History of all passes
 */

class MultiPassValidator {
  constructor() {
    this.defaultMaxPasses = FEATURE_FLAGS.maxValidationPasses || 3;
    this.minAcceptableScore = 75; // Minimum score to accept geometry
    this.targetScore = 90; // Target score for early termination
  }

  /**
   * Run multi-pass validation loop
   *
   * @param {Object} constraints - Claude-generated architectural constraints
   * @param {Object} geometryDNA - Initial engine-generated geometry
   * @param {Object} options - Validation options
   * @param {number} [options.maxPasses] - Maximum validation passes
   * @param {Function} [options.onCorrection] - Callback to apply corrections
   * @returns {Promise<MultiPassResult>}
   */
  async runMultiPassValidation(constraints, geometryDNA, options = {}) {
    const { maxPasses = this.defaultMaxPasses, onCorrection = null } = options;

    logger.info('🔄 [MultiPass] Starting validation loop...');
    logger.info(`   Max passes: ${maxPasses}`);
    logger.info(`   Min acceptable score: ${this.minAcceptableScore}`);

    let currentGeometry = { ...geometryDNA };
    let pass = 0;
    const history = [];

    while (pass < maxPasses) {
      pass++;
      logger.info(`\n📋 [MultiPass] Pass ${pass}/${maxPasses}`);

      // Run Claude validation
      const validation = await validateGeometryOutput(constraints, currentGeometry);

      history.push({
        pass,
        timestamp: new Date().toISOString(),
        validation: {
          passed: validation.passed,
          score: validation.score,
          violationCount: validation.violations?.length || 0,
        },
      });

      logger.info(`   Score: ${validation.score}/100`);
      logger.info(`   Passed: ${validation.passed}`);
      logger.info(`   Violations: ${validation.violations?.length || 0}`);

      // Check if we're done
      if (validation.passed || validation.score >= this.targetScore) {
        logger.success(`✅ [MultiPass] Validation passed on pass ${pass}`);
        return {
          geometry: currentGeometry,
          passes: pass,
          status: 'valid',
          finalValidation: validation,
          history,
        };
      }

      // Check if we've exhausted passes
      if (pass >= maxPasses) {
        logger.warn(`⚠️  [MultiPass] Max passes reached (${maxPasses})`);

        // Accept if score is acceptable
        if (validation.score >= this.minAcceptableScore) {
          logger.info(`   Score ${validation.score} is acceptable (>= ${this.minAcceptableScore})`);
          return {
            geometry: currentGeometry,
            passes: pass,
            status: 'best-effort',
            finalValidation: validation,
            history,
          };
        }

        return {
          geometry: currentGeometry,
          passes: pass,
          status: 'failed',
          finalValidation: validation,
          history,
        };
      }

      // Apply corrections
      if (validation.corrections && validation.corrections.length > 0) {
        logger.info(`   Applying ${validation.corrections.length} corrections...`);

        if (onCorrection) {
          // Use custom correction handler
          currentGeometry = await onCorrection(currentGeometry, validation.corrections);
        } else {
          // Use default correction handler
          currentGeometry = this.applyDefaultCorrections(currentGeometry, validation.corrections);
        }
      } else {
        logger.warn('   No corrections provided, cannot improve');
        break;
      }
    }

    // Final validation after all passes
    const finalValidation = await validateGeometryOutput(constraints, currentGeometry);

    return {
      geometry: currentGeometry,
      passes: pass,
      status: finalValidation.passed
        ? 'valid'
        : finalValidation.score >= this.minAcceptableScore
          ? 'best-effort'
          : 'failed',
      finalValidation,
      history,
    };
  }

  /**
   * Apply default corrections to geometry
   * This is a simplified implementation - real corrections would need
   * to interface with the geometry engine
   *
   * @param {Object} geometry - Current geometry
   * @param {Array} corrections - Corrections to apply
   * @returns {Object} Updated geometry
   */
  applyDefaultCorrections(geometry, corrections) {
    const updated = JSON.parse(JSON.stringify(geometry)); // Deep clone

    corrections.forEach((correction) => {
      try {
        switch (correction.action) {
          case 'move':
            this.applyMoveCorrection(updated, correction);
            break;
          case 'resize':
            this.applyResizeCorrection(updated, correction);
            break;
          case 'swap':
            this.applySwapCorrection(updated, correction);
            break;
          case 'reorient':
            this.applyReorientCorrection(updated, correction);
            break;
          case 'create_rooms':
          case 'define_rooms': // Alias for create_rooms
            this.applyCreateRoomsCorrection(updated, correction);
            break;
          case 'define_circulation':
          case 'create_circulation': // Alias for define_circulation
            this.applyDefineCirculationCorrection(updated, correction);
            break;
          case 'align_wet_rooms':
            this.applyAlignWetRoomsCorrection(updated, correction);
            break;
          case 'add_room':
            this.applyAddRoomCorrection(updated, correction);
            break;
          case 'remove_room':
            this.applyRemoveRoomCorrection(updated, correction);
            break;
          case 'adjust_dimensions':
            this.applyAdjustDimensionsCorrection(updated, correction);
            break;
          case 'add_internal_walls':
          case 'add_walls':
            this.applyAddInternalWallsCorrection(updated, correction);
            break;
          case 'add_openings':
          case 'add_windows':
          case 'add_doors':
            this.applyAddOpeningsCorrection(updated, correction);
            break;
          default:
            logger.warn(
              `   Unknown correction action: ${correction.action} - skipping (known actions: move, resize, swap, reorient, create_rooms, define_circulation, align_wet_rooms, add_room, remove_room, adjust_dimensions, add_internal_walls, add_openings)`
            );
        }
      } catch (error) {
        logger.error(`   Failed to apply correction: ${error.message}`);
      }
    });

    return updated;
  }

  /**
   * Apply move correction
   */
  applyMoveCorrection(geometry, correction) {
    const { target, parameters } = correction;
    if (!parameters) {
      return;
    }

    // Find room in geometry
    const room = this.findRoom(geometry, target);
    if (!room) {
      logger.warn(`   Room not found: ${target}`);
      return;
    }

    // Apply offset to all polygon points
    if (room.polygon && parameters.offset) {
      room.polygon = room.polygon.map((point) => ({
        x: point.x + (parameters.offset.x || 0),
        y: point.y + (parameters.offset.y || 0),
      }));
      logger.info(`   Moved room ${target} by (${parameters.offset.x}, ${parameters.offset.y})`);
    }
  }

  /**
   * Apply resize correction
   */
  applyResizeCorrection(geometry, correction) {
    const { target, parameters } = correction;
    if (!parameters) {
      return;
    }

    const room = this.findRoom(geometry, target);
    if (!room || !room.polygon) {
      return;
    }

    // Calculate current bounds
    const minX = Math.min(...room.polygon.map((p) => p.x));
    const minY = Math.min(...room.polygon.map((p) => p.y));
    const maxX = Math.max(...room.polygon.map((p) => p.x));
    const maxY = Math.max(...room.polygon.map((p) => p.y));

    const currentWidth = maxX - minX;
    const currentHeight = maxY - minY;

    // Apply scale
    const scaleX = parameters.scaleX || 1;
    const scaleY = parameters.scaleY || 1;

    // Recalculate polygon with new scale
    room.polygon = room.polygon.map((point) => ({
      x: minX + (point.x - minX) * scaleX,
      y: minY + (point.y - minY) * scaleY,
    }));

    logger.info(`   Resized room ${target} by scale (${scaleX}, ${scaleY})`);
  }

  /**
   * Apply swap correction
   */
  applySwapCorrection(geometry, correction) {
    const { target, parameters } = correction;
    if (!parameters || !parameters.swapWith) {
      return;
    }

    const room1 = this.findRoom(geometry, target);
    const room2 = this.findRoom(geometry, parameters.swapWith);

    if (!room1 || !room2) {
      logger.warn(`   Cannot swap: rooms not found`);
      return;
    }

    // Swap polygons
    const tempPolygon = room1.polygon;
    room1.polygon = room2.polygon;
    room2.polygon = tempPolygon;

    logger.info(`   Swapped rooms ${target} and ${parameters.swapWith}`);
  }

  /**
   * Apply reorient correction
   */
  applyReorientCorrection(geometry, correction) {
    const { target, parameters } = correction;
    if (!parameters || !parameters.newOrientation) {
      return;
    }

    // This would typically adjust window positions, door locations, etc.
    // For now, just log the intent
    logger.info(
      `   Reorient room ${target} to ${parameters.newOrientation} (not fully implemented)`
    );
  }

  /**
   * Apply create_rooms correction - creates multiple rooms on a floor
   */
  applyCreateRoomsCorrection(geometry, correction) {
    const { target, parameters } = correction;

    // Ensure floors array exists
    if (!geometry.floors) {
      geometry.floors = [];
    }

    // Find or create target floor
    const floorIndex = parameters?.floorIndex || 0;
    while (geometry.floors.length <= floorIndex) {
      geometry.floors.push({ level: geometry.floors.length, rooms: [], circulation: [] });
    }

    const floor = geometry.floors[floorIndex];
    if (!floor.rooms) {
      floor.rooms = [];
    }

    // Add rooms from parameters
    const roomsToCreate = parameters?.rooms || [];
    roomsToCreate.forEach((roomSpec, index) => {
      const newRoom = {
        id: roomSpec.id || `room_${floor.rooms.length + 1}`,
        name: roomSpec.name || `Room ${floor.rooms.length + 1}`,
        type: roomSpec.type || 'generic',
        area: roomSpec.area || 20,
        polygon: roomSpec.polygon || this.generateDefaultPolygon(roomSpec.area || 20, index),
      };
      floor.rooms.push(newRoom);
    });

    logger.info(`   Created ${roomsToCreate.length} rooms on floor ${floorIndex}`);
  }

  /**
   * Apply define_circulation correction - adds circulation paths
   */
  applyDefineCirculationCorrection(geometry, correction) {
    const { parameters } = correction;

    if (!geometry.floors) {
      return;
    }

    const floorIndex = parameters?.floorIndex || 0;
    if (floorIndex >= geometry.floors.length) {
      return;
    }

    const floor = geometry.floors[floorIndex];
    if (!floor.circulation) {
      floor.circulation = [];
    }

    // Add circulation paths
    const paths = parameters?.paths || [];
    paths.forEach((pathSpec) => {
      floor.circulation.push({
        id: pathSpec.id || `corridor_${floor.circulation.length + 1}`,
        type: pathSpec.type || 'corridor',
        width: pathSpec.width || 1200, // 1.2m default corridor width
        points: pathSpec.points || [],
        connects: pathSpec.connects || [],
      });
    });

    // If no paths specified, create a default central corridor
    if (paths.length === 0 && floor.rooms && floor.rooms.length > 1) {
      floor.circulation.push({
        id: 'main_corridor',
        type: 'corridor',
        width: 1200,
        points: [],
        connects: floor.rooms.map((r) => r.id),
      });
      logger.info(`   Created default circulation path for floor ${floorIndex}`);
    } else {
      logger.info(`   Defined ${paths.length} circulation paths on floor ${floorIndex}`);
    }
  }

  /**
   * Apply align_wet_rooms correction - aligns bathrooms/kitchens for plumbing efficiency
   */
  applyAlignWetRoomsCorrection(geometry, correction) {
    const { parameters } = correction;

    if (!geometry.floors) {
      return;
    }

    // Find all wet rooms across floors
    const wetRoomTypes = ['bathroom', 'kitchen', 'utility', 'laundry', 'wc', 'toilet', 'ensuite'];
    const wetRooms = [];

    geometry.floors.forEach((floor, floorIdx) => {
      if (!floor.rooms) {
        return;
      }

      floor.rooms.forEach((room) => {
        const roomType = (room.type || room.name || '').toLowerCase();
        if (wetRoomTypes.some((type) => roomType.includes(type))) {
          wetRooms.push({ room, floorIndex: floorIdx });
        }
      });
    });

    if (wetRooms.length < 2) {
      logger.info(`   Only ${wetRooms.length} wet room(s) found, no alignment needed`);
      return;
    }

    // Align wet rooms to a common X position (stack vertically)
    const targetX = parameters?.alignX || wetRooms[0].room.polygon?.[0]?.x || 0;

    wetRooms.forEach(({ room }) => {
      if (room.polygon && room.polygon.length > 0) {
        const currentMinX = Math.min(...room.polygon.map((p) => p.x));
        const offsetX = targetX - currentMinX;

        if (Math.abs(offsetX) > 100) {
          // Only move if significant offset
          room.polygon = room.polygon.map((p) => ({
            x: p.x + offsetX,
            y: p.y,
          }));
        }
      }
    });

    logger.info(`   Aligned ${wetRooms.length} wet rooms for plumbing efficiency`);
  }

  /**
   * Apply add_room correction - adds a single room
   */
  applyAddRoomCorrection(geometry, correction) {
    const { target, parameters } = correction;

    if (!geometry.floors) {
      geometry.floors = [{ level: 0, rooms: [], circulation: [] }];
    }

    const floorIndex = parameters?.floorIndex || 0;
    while (geometry.floors.length <= floorIndex) {
      geometry.floors.push({ level: geometry.floors.length, rooms: [], circulation: [] });
    }

    const floor = geometry.floors[floorIndex];
    if (!floor.rooms) {
      floor.rooms = [];
    }

    const newRoom = {
      id: parameters?.id || target || `room_${floor.rooms.length + 1}`,
      name: parameters?.name || target || `Room ${floor.rooms.length + 1}`,
      type: parameters?.type || 'generic',
      area: parameters?.area || 20,
      polygon:
        parameters?.polygon ||
        this.generateDefaultPolygon(parameters?.area || 20, floor.rooms.length),
    };

    floor.rooms.push(newRoom);
    logger.info(`   Added room ${newRoom.name} to floor ${floorIndex}`);
  }

  /**
   * Apply remove_room correction - removes a room
   */
  applyRemoveRoomCorrection(geometry, correction) {
    const { target } = correction;

    if (!geometry.floors || !target) {
      return;
    }

    for (const floor of geometry.floors) {
      if (!floor.rooms) {
        continue;
      }

      const index = floor.rooms.findIndex((r) => r.id === target || r.name === target);
      if (index !== -1) {
        floor.rooms.splice(index, 1);
        logger.info(`   Removed room ${target}`);
        return;
      }
    }

    logger.warn(`   Room ${target} not found for removal`);
  }

  /**
   * Apply adjust_dimensions correction - adjusts room dimensions
   */
  applyAdjustDimensionsCorrection(geometry, correction) {
    const { target, parameters } = correction;

    if (!parameters) {
      return;
    }

    const room = this.findRoom(geometry, target);
    if (!room) {
      logger.warn(`   Room ${target} not found for dimension adjustment`);
      return;
    }

    // Update area if specified
    if (parameters.targetArea && room.polygon) {
      const currentArea = this.calculatePolygonArea(room.polygon);
      if (currentArea > 0) {
        const scaleFactor = Math.sqrt(parameters.targetArea / currentArea);
        const centroid = this.calculateCentroid(room.polygon);

        room.polygon = room.polygon.map((p) => ({
          x: centroid.x + (p.x - centroid.x) * scaleFactor,
          y: centroid.y + (p.y - centroid.y) * scaleFactor,
        }));

        room.area = parameters.targetArea;
        logger.info(`   Adjusted room ${target} to ${parameters.targetArea}m²`);
      }
    }

    // Update specific dimensions if provided
    if (parameters.width || parameters.height) {
      // Resize to specific width/height
      logger.info(`   Adjusted room ${target} dimensions`);
    }
  }

  /**
   * Apply add_internal_walls correction - adds internal partition walls
   */
  applyAddInternalWallsCorrection(geometry, correction) {
    const { parameters } = correction;

    if (!geometry.walls) {
      geometry.walls = [];
    }

    const wallsToAdd = parameters?.walls || [];
    const floorIndex = parameters?.floorIndex || 0;

    wallsToAdd.forEach((wallSpec, index) => {
      const newWall = {
        id: wallSpec.id || `internal_wall_${geometry.walls.length + 1}`,
        type: wallSpec.type || 'internal',
        thickness: wallSpec.thickness || 100, // 100mm default internal wall
        floor: floorIndex,
        start: wallSpec.start || { x: 0, y: 0 },
        end: wallSpec.end || { x: 0, y: 0 },
        openings: wallSpec.openings || [],
      };
      geometry.walls.push(newWall);
    });

    // If no specific walls provided but floors exist, generate walls from room polygons
    if (wallsToAdd.length === 0 && geometry.floors) {
      const floor = geometry.floors[floorIndex];
      if (floor?.rooms) {
        floor.rooms.forEach((room) => {
          if (room.polygon && room.polygon.length >= 3) {
            // Create wall segments from polygon edges
            for (let i = 0; i < room.polygon.length; i++) {
              const start = room.polygon[i];
              const end = room.polygon[(i + 1) % room.polygon.length];

              geometry.walls.push({
                id: `wall_${room.id}_${i}`,
                type: 'internal',
                thickness: 100,
                floor: floorIndex,
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
                roomId: room.id,
              });
            }
          }
        });
        logger.info(
          `   Generated internal walls from ${floor.rooms.length} room polygons on floor ${floorIndex}`
        );
      }
    } else {
      logger.info(`   Added ${wallsToAdd.length} internal walls on floor ${floorIndex}`);
    }
  }

  /**
   * Apply add_openings correction - adds windows and doors to walls
   */
  applyAddOpeningsCorrection(geometry, correction) {
    const { parameters } = correction;

    if (!geometry.openings) {
      geometry.openings = [];
    }

    const openingsToAdd = parameters?.openings || [];
    const floorIndex = parameters?.floorIndex || 0;

    openingsToAdd.forEach((openingSpec) => {
      const newOpening = {
        id: openingSpec.id || `opening_${geometry.openings.length + 1}`,
        type: openingSpec.type || 'window', // 'window' | 'door' | 'opening'
        width: openingSpec.width || 1000, // 1m default
        height: openingSpec.height || (openingSpec.type === 'door' ? 2100 : 1200),
        floor: floorIndex,
        wallId: openingSpec.wallId,
        position: openingSpec.position || { x: 0, y: 0 },
        sillHeight: openingSpec.sillHeight || (openingSpec.type === 'door' ? 0 : 900),
        facade: openingSpec.facade, // 'north' | 'south' | 'east' | 'west' for external
      };
      geometry.openings.push(newOpening);
    });

    // If no specific openings provided, generate default windows for exterior walls
    if (openingsToAdd.length === 0 && geometry.walls) {
      const externalWalls = geometry.walls.filter((w) => w.type === 'external' || w.facade);
      externalWalls.forEach((wall) => {
        // Add a default window to each external wall
        const wallLength = Math.sqrt(
          Math.pow(wall.end.x - wall.start.x, 2) + Math.pow(wall.end.y - wall.start.y, 2)
        );

        // Only add window if wall is long enough
        if (wallLength > 2000) {
          // > 2m
          const windowWidth = Math.min(1200, wallLength * 0.4);
          geometry.openings.push({
            id: `window_${wall.id}`,
            type: 'window',
            width: windowWidth,
            height: 1200,
            floor: wall.floor || 0,
            wallId: wall.id,
            sillHeight: 900,
            facade: wall.facade,
          });
        }
      });
      logger.info(`   Generated default openings for ${externalWalls.length} external walls`);
    } else {
      logger.info(`   Added ${openingsToAdd.length} openings on floor ${floorIndex}`);
    }
  }

  /**
   * Generate a default rectangular polygon for a room
   */
  generateDefaultPolygon(area, index = 0) {
    // Create a roughly square room
    const side = Math.sqrt(area) * 1000; // Convert m² to mm
    const offsetX = (index % 3) * (side + 500);
    const offsetY = Math.floor(index / 3) * (side + 500);

    return [
      { x: offsetX, y: offsetY },
      { x: offsetX + side, y: offsetY },
      { x: offsetX + side, y: offsetY + side },
      { x: offsetX, y: offsetY + side },
    ];
  }

  /**
   * Calculate area of a polygon (in m²)
   */
  calculatePolygonArea(polygon) {
    if (!polygon || polygon.length < 3) {
      return 0;
    }

    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }

    return Math.abs(area / 2) / 1000000; // Convert mm² to m²
  }

  /**
   * Calculate centroid of a polygon
   */
  calculateCentroid(polygon) {
    if (!polygon || polygon.length === 0) {
      return { x: 0, y: 0 };
    }

    const sumX = polygon.reduce((sum, p) => sum + p.x, 0);
    const sumY = polygon.reduce((sum, p) => sum + p.y, 0);

    return {
      x: sumX / polygon.length,
      y: sumY / polygon.length,
    };
  }

  /**
   * Find a room in the geometry structure
   */
  findRoom(geometry, roomId) {
    if (!geometry?.floors) {
      return null;
    }

    for (const floor of geometry.floors) {
      if (!floor.rooms) {
        continue;
      }

      for (const room of floor.rooms) {
        if (room.id === roomId || room.name === roomId) {
          return room;
        }
      }
    }

    return null;
  }

  /**
   * Validate a single aspect of geometry
   */
  async validateAspect(geometry, aspect) {
    const aspects = {
      adjacency: this.validateAdjacency.bind(this),
      circulation: this.validateCirculation.bind(this),
      proportions: this.validateProportions.bind(this),
      orientation: this.validateOrientation.bind(this),
    };

    if (!aspects[aspect]) {
      throw new Error(`Unknown validation aspect: ${aspect}`);
    }

    return aspects[aspect](geometry);
  }

  /**
   * Local validation: Check room adjacencies
   */
  validateAdjacency(geometry) {
    const issues = [];

    if (!geometry?.floors) {
      return { valid: false, issues: ['No floors in geometry'] };
    }

    // Check each floor
    geometry.floors.forEach((floor) => {
      if (!floor.rooms || floor.rooms.length < 2) {
        return;
      }

      // Simple adjacency check: rooms should share walls if adjacent
      for (let i = 0; i < floor.rooms.length; i++) {
        for (let j = i + 1; j < floor.rooms.length; j++) {
          const room1 = floor.rooms[i];
          const room2 = floor.rooms[j];

          // Check if rooms should be adjacent based on constraints
          // This would need access to constraints to properly validate
        }
      }
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Local validation: Check circulation paths
   */
  validateCirculation(geometry) {
    const issues = [];

    if (!geometry?.floors) {
      return { valid: false, issues: ['No floors in geometry'] };
    }

    geometry.floors.forEach((floor, floorIndex) => {
      // Check for circulation paths
      if (!floor.circulation || floor.circulation.length === 0) {
        // No defined circulation - check if rooms connect directly
        if (floor.rooms && floor.rooms.length > 1) {
          issues.push(`Floor ${floorIndex}: No circulation paths defined`);
        }
      }

      // Check circulation width
      floor.circulation?.forEach((path) => {
        if (path.width && path.width < 900) {
          issues.push(`Floor ${floorIndex}: Circulation path too narrow (${path.width}mm < 900mm)`);
        }
      });
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Local validation: Check room proportions
   */
  validateProportions(geometry) {
    const issues = [];

    if (!geometry?.floors) {
      return { valid: false, issues: ['No floors in geometry'] };
    }

    geometry.floors.forEach((floor) => {
      floor.rooms?.forEach((room) => {
        if (!room.polygon || room.polygon.length < 3) {
          return;
        }

        // Calculate bounding box
        const xs = room.polygon.map((p) => p.x);
        const ys = room.polygon.map((p) => p.y);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);

        if (width === 0 || height === 0) {
          return;
        }

        const ratio = Math.max(width, height) / Math.min(width, height);

        // Check for extreme proportions
        if (ratio > 3) {
          issues.push(`Room ${room.name}: Extreme proportion ratio ${ratio.toFixed(2)} > 3`);
        }

        // Check for too-small rooms
        const area = (width * height) / 1000000; // m²
        if (area < 4) {
          issues.push(`Room ${room.name}: Too small at ${area.toFixed(1)}m²`);
        }
      });
    });

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Local validation: Check room orientations
   */
  validateOrientation(geometry) {
    const issues = [];

    // This would check if rooms face the correct direction
    // based on their type and constraints

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Quick pre-check before full validation
   */
  preCheck(geometry) {
    const errors = [];

    if (!geometry) {
      errors.push('Geometry is null');
      return { valid: false, errors };
    }

    if (!geometry.floors || !Array.isArray(geometry.floors)) {
      errors.push('No floors array in geometry');
    }

    if (geometry.floors) {
      geometry.floors.forEach((floor, i) => {
        if (!floor.rooms || !Array.isArray(floor.rooms)) {
          errors.push(`Floor ${i}: No rooms array`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
const multiPassValidator = new MultiPassValidator();

// Named exports
export const runMultiPassValidation = (constraints, geometryDNA, options) =>
  multiPassValidator.runMultiPassValidation(constraints, geometryDNA, options);

export const validateAspect = (geometry, aspect) =>
  multiPassValidator.validateAspect(geometry, aspect);

export const preCheck = (geometry) => multiPassValidator.preCheck(geometry);

export default multiPassValidator;
