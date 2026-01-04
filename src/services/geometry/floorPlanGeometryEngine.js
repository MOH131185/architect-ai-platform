/**
 * Floor Plan Geometry Engine (MVP Implementation)
 *
 * Main orchestrator for geometry generation.
 * Converts ProgramDNA to GeometryDNA using:
 * - Room polygon generator (strip packing)
 * - Wall generator
 * - Opening generator
 * - Elevation generator
 * - Section generator
 *
 * Implements IFloorPlanGenerator interface.
 */

import {
  normalizeRoomsLevels,
  getFloorCount,
  validateRoomFloorDistribution,
  indexToLevelName,
} from '../../utils/levelNormalization.js';
import logger from '../core/logger.js';

import { generateAllElevations } from './elevationGenerator.js';
import { IFloorPlanGenerator, WALL_THICKNESSES, WALL_TYPES } from './IFloorPlanGenerator.js';
import { generateOpenings } from './openingGenerator.js';
import { generateRoomPolygons, fitsWithinBoundary } from './roomPolygonGenerator.js';
import { generateStandardSections } from './sectionGenerator.js';
import { generateStairs } from './stairGenerator.js';
import {
  generateWalls,
  generateStructuralGrid,
  identifyLoadBearingWalls,
  analyzeVerticalAlignment,
  generateVerticalAlignments,
  applyUKWallThicknesses,
} from './wallGenerator.js';

/**
 * MVP Floor Plan Generator
 *
 * Uses strip packing algorithm for room layout
 */
export class MVPFloorPlanGenerator extends IFloorPlanGenerator {
  constructor(options = {}) {
    super();
    this.gridSize = options.gridSize || 0.1; // 10cm grid
    this.defaultFloorHeight = options.floorHeight || 3.0;
    this.defaultSetbacks = options.setbacks || { front: 3, back: 3, left: 3, right: 3 };
  }

  _normalizeSitePolygon(sitePolygon) {
    if (!Array.isArray(sitePolygon) || sitePolygon.length < 3) {
      return null;
    }

    const hasXY = sitePolygon.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    if (hasXY) {
      return sitePolygon;
    }

    const hasLatLng = sitePolygon.every((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
    if (!hasLatLng) {
      return null;
    }

    // Convert lat/lng into a local XY system in meters.
    const origin = sitePolygon.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 }
    );
    origin.lat /= sitePolygon.length;
    origin.lng /= sitePolygon.length;

    return sitePolygon.map((p) => ({
      x: (p.lng - origin.lng) * 111320 * Math.cos((origin.lat * Math.PI) / 180),
      y: (p.lat - origin.lat) * 110540,
    }));
  }

  /**
   * Generate complete floor plan geometry from program
   *
   * @param {Object} program - ProgramDNA
   * @param {Object} constraints - Layout constraints
   * @returns {Promise<Object>} GeometryDNA
   */
  async generateLayout(program, constraints = {}) {
    logger.info('Starting geometry generation from program...');
    logger.info(`${program.rooms.length} rooms, ${program.metadata?.floors || 1} floors`);

    const startTime = Date.now();

    // Step 0: Normalize all room levels to integer floor indices
    // This ensures "Ground", "First", "Second" become 0, 1, 2
    const normalizedRooms = normalizeRoomsLevels(program.rooms);
    const normalizedProgram = {
      ...program,
      rooms: normalizedRooms,
    };

    const normalizedSitePolygon = this._normalizeSitePolygon(constraints.sitePolygon);
    const effectiveConstraints = {
      ...constraints,
      sitePolygon: normalizedSitePolygon,
    };

    // Step 1: Calculate building footprint
    const footprint = this.calculateFootprint(
      effectiveConstraints.sitePolygon,
      normalizedProgram.totalArea?.gross || this.calculateTotalArea(normalizedRooms),
      normalizedProgram.metadata?.floors || 1,
      effectiveConstraints.setbacks || this.defaultSetbacks
    );

    logger.info(`Footprint: ${footprint.width}m x ${footprint.length}m`);

    // Step 1.5: Generate structural grid
    const structuralGrid = generateStructuralGrid(footprint, {
      spanX: constraints.gridSpanX || 4.0,
      spanY: constraints.gridSpanY || 4.0,
    });

    // Step 2: Generate room polygons (with normalized rooms)
    const roomResult = generateRoomPolygons({
      rooms: normalizedRooms,
      footprint,
      adjacencyMatrix: normalizedProgram.adjacencyMatrix,
      siteBoundary: effectiveConstraints.sitePolygon,
    });

    // Step 3: Build floor geometries using centralized level normalization
    const floors = [];
    const floorCount = getFloorCount(normalizedRooms, 'floor');

    // Runtime guard: Validate floor distribution before proceeding
    const validation = validateRoomFloorDistribution(normalizedRooms, floorCount);
    if (!validation.valid) {
      logger.warn('[floorPlanGeometryEngine] Floor distribution issues detected:', {
        issues: validation.issues,
        floorCounts: Object.fromEntries(validation.floorCounts),
        totalRooms: normalizedRooms.length,
        expectedFloors: floorCount,
      });
    }

    for (let level = 0; level < floorCount; level++) {
      const floorPolygons = roomResult.floors[level] || [];
      const floorHeight = this.defaultFloorHeight;

      // Generate walls for this floor
      let walls = generateWalls({
        roomPolygons: floorPolygons,
        footprint,
        floorLevel: level,
        floorHeight,
      });

      // Apply UK wall thicknesses
      walls = applyUKWallThicknesses(walls, constraints.constructionType || 'masonry');

      // Identify load-bearing walls based on structural grid
      walls = identifyLoadBearingWalls(walls, structuralGrid);

      // Generate openings (doors and windows)
      const openings = generateOpenings({
        walls,
        roomPolygons: floorPolygons,
        adjacencyMatrix: program.adjacencyMatrix,
        buildingType: program.metadata?.buildingType || 'residential',
        floorLevel: level,
      });

      floors.push({
        level,
        height: floorHeight,
        boundary: footprint.polygon,
        rooms: floorPolygons,
        walls,
        openings,
      });

      logger.info(
        `Floor ${level}: ${floorPolygons.length} rooms, ${walls.length} walls, ${openings.length} openings`
      );
    }

    // Step 3.5: Generate stairs for multi-floor buildings
    let stairData = { stairs: [], shafts: [] };
    if (floorCount > 1) {
      stairData = generateStairs({
        floors,
        footprint,
        buildingType: program.metadata?.buildingType || 'residential',
        adjacencyMatrix: program.adjacencyMatrix,
      });

      // Add stair shafts to each floor's rooms as voids
      for (const shaft of stairData.shafts) {
        for (const floor of floors) {
          if (shaft.floors.includes(floor.level)) {
            floor.shafts = floor.shafts || [];
            floor.shafts.push({
              id: shaft.id,
              type: shaft.type,
              polygon: shaft.polygon,
              isVoid: floor.level > 0, // Upper floors have void for stair
            });
          }
        }
      }
    }

    // Step 3.6: Analyze vertical alignment
    const verticalAlignment = analyzeVerticalAlignment(floors);
    const verticalAlignments = generateVerticalAlignments(floors, structuralGrid);

    // Add stair shafts to vertical alignments
    verticalAlignments.shafts = stairData.shafts;

    // Step 4: Assemble GeometryDNA
    const geometryDNA = {
      floors,
      footprint,
      siteBoundary: effectiveConstraints.sitePolygon || null,
      structuralGrid,
      verticalAlignments,
      stairs: stairData,
      metadata: {
        totalRooms: program.rooms.length,
        totalFloors: floorCount,
        grossArea: program.totalArea?.gross || roomResult.metrics.totalTarget,
        netArea: roomResult.metrics.totalGenerated,
        areaAccuracy: roomResult.metrics.areaAccuracy,
        buildingType: program.metadata?.buildingType,
        constructionType: constraints.constructionType || 'masonry',
        hasStructuralGrid: true,
        hasVerticalAlignment: floorCount > 1,
        generatedAt: new Date().toISOString(),
        generationTime: Date.now() - startTime,
      },
    };

    // Step 5: Validate layout
    const layoutValidation = this.validateLayout(geometryDNA, effectiveConstraints);
    geometryDNA.validation = layoutValidation;

    // Add vertical alignment issues to validation
    if (verticalAlignment.issues.length > 0) {
      layoutValidation.structuralIssues = verticalAlignment.issues;
      layoutValidation.warnings.push(
        ...verticalAlignment.issues.filter((i) => i.severity === 'warning').map((i) => i.message)
      );
      layoutValidation.errors.push(
        ...verticalAlignment.issues.filter((i) => i.severity === 'error').map((i) => i.message)
      );
      layoutValidation.isValid = layoutValidation.errors.length === 0;
    }

    logger.info(`Geometry generation complete in ${geometryDNA.metadata.generationTime}ms`);
    logger.info(`Area accuracy: ${(roomResult.metrics.areaAccuracy * 100).toFixed(1)}%`);
    if (floorCount > 1) {
      logger.info(`Vertical alignment: ${verticalAlignment.aligned ? 'OK' : 'Issues found'}`);
      logger.info(`Stairs: ${stairData.stairs.length} flights, ${stairData.shafts.length} shafts`);
    }

    return geometryDNA;
  }

  /**
   * Generate complete package including elevations and sections
   */
  async generateCompletePackage(program, styleDNA = {}, constraints = {}) {
    // Generate base geometry
    const geometryDNA = await this.generateLayout(program, constraints);

    // Generate elevations
    const elevations = generateAllElevations(geometryDNA, styleDNA);

    // Generate sections
    const sections = generateStandardSections(geometryDNA, styleDNA);

    return {
      geometry: geometryDNA,
      elevations,
      sections,
      metadata: {
        ...geometryDNA.metadata,
        hasElevations: true,
        hasSections: true,
      },
    };
  }

  /**
   * Calculate building footprint from constraints
   */
  calculateFootprint(sitePolygon, totalArea, floors, setbacks) {
    const safeFloors = Math.max(1, Number(floors) || 1);

    // Area per floor
    const areaPerFloor = (Number(totalArea) || 0) / safeFloors;

    // Add wall allowance
    const grossAreaPerFloor = areaPerFloor * 1.1; // 10% for walls

    const normalizedSetbacks = {
      front: Math.max(0, Number(setbacks?.front) || 0),
      back: Math.max(0, Number(setbacks?.back) || 0),
      left: Math.max(0, Number(setbacks?.left) || 0),
      right: Math.max(0, Number(setbacks?.right) || 0),
    };

    const roundDownToGrid = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
      }
      return Math.floor(numeric / this.gridSize) * this.gridSize;
    };

    if (sitePolygon && sitePolygon.length >= 3) {
      // Calculate footprint within site boundary
      const siteBounds = this.calculateBounds(sitePolygon);

      const siteWidth = Number(siteBounds.width) || 0;
      const siteLength = Number(siteBounds.height) || 0;
      const siteArea = siteWidth * siteLength;

      const totalSetbackX = normalizedSetbacks.left + normalizedSetbacks.right;
      const totalSetbackY = normalizedSetbacks.front + normalizedSetbacks.back;

      // Apply setbacks, but relax them when they make the buildable rectangle impossible.
      let setbackFactor = 1;
      let effectiveSetbacks = normalizedSetbacks;
      let availableWidth = Math.max(0, siteWidth - totalSetbackX);
      let availableLength = Math.max(0, siteLength - totalSetbackY);
      let availableArea = availableWidth * availableLength;

      if (
        grossAreaPerFloor > 0 &&
        grossAreaPerFloor > availableArea &&
        siteArea >= grossAreaPerFloor &&
        (totalSetbackX > 0 || totalSetbackY > 0)
      ) {
        for (let factor = 0.9; factor >= 0; factor -= 0.1) {
          const candidateWidth = Math.max(0, siteWidth - totalSetbackX * factor);
          const candidateLength = Math.max(0, siteLength - totalSetbackY * factor);
          if (candidateWidth * candidateLength >= grossAreaPerFloor) {
            setbackFactor = factor;
            effectiveSetbacks = {
              front: normalizedSetbacks.front * factor,
              back: normalizedSetbacks.back * factor,
              left: normalizedSetbacks.left * factor,
              right: normalizedSetbacks.right * factor,
            };
            availableWidth = candidateWidth;
            availableLength = candidateLength;
            availableArea = availableWidth * availableLength;
            break;
          }
        }

        if (setbackFactor < 1) {
          logger.warn(
            `[Footprint] Setbacks too strict for required area; relaxing (factor=${setbackFactor.toFixed(1)})`
          );
        }
      }

      const originX = siteBounds.minX + effectiveSetbacks.left;
      const originY = siteBounds.minY + effectiveSetbacks.front;

      // Prefer a golden-ratio footprint, but preserve required area when possible.
      const aspectRatio = 1.618;
      const goldenWidth = Math.sqrt(grossAreaPerFloor / aspectRatio);
      const goldenLength = goldenWidth * aspectRatio;

      let finalWidth = goldenWidth;
      let finalLength = goldenLength;

      const goldenFits =
        grossAreaPerFloor > 0 && goldenWidth <= availableWidth && goldenLength <= availableLength;

      if (!goldenFits && grossAreaPerFloor > 0 && availableWidth > 0 && availableLength > 0) {
        const lengthFromWidth = grossAreaPerFloor / availableWidth;
        if (lengthFromWidth <= availableLength) {
          finalWidth = availableWidth;
          finalLength = lengthFromWidth;
        } else {
          const widthFromLength = grossAreaPerFloor / availableLength;
          if (widthFromLength <= availableWidth) {
            finalWidth = widthFromLength;
            finalLength = availableLength;
          } else {
            finalWidth = availableWidth;
            finalLength = availableLength;
          }
        }
      }

      finalWidth = Math.max(0, Math.min(finalWidth, availableWidth));
      finalLength = Math.max(0, Math.min(finalLength, availableLength));

      const roundedWidth = roundDownToGrid(finalWidth);
      const roundedLength = roundDownToGrid(finalLength);

      const fittedArea = roundedWidth * roundedLength;
      const fitsRequiredArea = grossAreaPerFloor <= 0 || fittedArea >= grossAreaPerFloor * 0.98;

      if (!fitsRequiredArea) {
        logger.warn(
          `Required area (${grossAreaPerFloor.toFixed(2)}m²) exceeds buildable site area (${availableArea.toFixed(2)}m²)`
        );
      }

      return {
        width: roundedWidth,
        length: roundedLength,
        polygon: this.rectangleToPolygon(originX, originY, roundedWidth, roundedLength),
        siteBoundary: sitePolygon,
        ...(!fitsRequiredArea ? { warning: 'Building may exceed site constraints' } : {}),
      };
    }

    // No site polygon - calculate from area alone
    const aspectRatio = 1.618;
    const width = Math.sqrt(grossAreaPerFloor / aspectRatio);
    const length = width * aspectRatio;

    const roundedWidth = roundDownToGrid(width);
    const roundedLength = roundDownToGrid(length);

    return {
      width: roundedWidth,
      length: roundedLength,
      polygon: this.rectangleToPolygon(0, 0, roundedWidth, roundedLength),
    };
  }

  /**
   * Validate layout against constraints
   */
  validateLayout(geometry, constraints) {
    const errors = [];
    const warnings = [];

    // Check site boundary fit
    if (constraints.sitePolygon && geometry.footprint) {
      const fits = fitsWithinBoundary(geometry.footprint.polygon, constraints.sitePolygon);
      if (!fits) {
        errors.push('Building footprint extends beyond site boundary');
      }
    }

    // Check room areas
    for (const floor of geometry.floors) {
      for (const room of floor.rooms) {
        if (room.area < 3) {
          warnings.push(`Room "${room.name}" is very small (${room.area}m²)`);
        }
      }
    }

    // Check wall count
    const totalWalls = geometry.floors.reduce((sum, f) => sum + f.walls.length, 0);
    if (totalWalls === 0) {
      errors.push('No walls generated');
    }

    // INTERIOR WALL VALIDATOR: If rooms are placed but no interior walls generated, fail
    // Uses WALL_TYPES.INTERIOR ('interior') as the canonical type
    for (const floor of geometry.floors) {
      const roomsPlaced = floor.rooms?.length || 0;
      const interiorWalls = (floor.walls || []).filter((w) => w.type === WALL_TYPES.INTERIOR);
      const interiorWallCount = interiorWalls.length;

      if (roomsPlaced > 1 && interiorWallCount === 0) {
        errors.push(
          `Floor ${floor.level}: ${roomsPlaced} rooms placed but 0 interior walls generated. ` +
            `Interior walls are required to separate rooms.`
        );
        logger.error(
          `[INTERIOR WALL VALIDATOR] Floor ${floor.level} FAILED: ${roomsPlaced} rooms, 0 interior walls`
        );
      } else if (roomsPlaced > 0) {
        logger.debug(
          `[INTERIOR WALL VALIDATOR] Floor ${floor.level}: ${roomsPlaced} rooms, ${interiorWallCount} interior walls`
        );
      }
    }

    // Check openings
    const totalOpenings = geometry.floors.reduce((sum, f) => sum + f.openings.length, 0);
    if (totalOpenings === 0) {
      warnings.push('No doors or windows generated');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        floorCount: geometry.floors.length,
        totalRooms: geometry.floors.reduce((sum, f) => sum + f.rooms.length, 0),
        totalWalls,
        totalOpenings,
      },
    };
  }

  /**
   * Optimize layout for objectives
   */
  async optimizeLayout(geometry, objectives = {}) {
    // TODO: Implement layout optimization
    // For MVP, return geometry as-is
    logger.info('Layout optimization not yet implemented - returning original');
    return geometry;
  }

  // Helper methods
  calculateBounds(polygon) {
    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  rectangleToPolygon(x, y, width, height) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }

  roundToGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  calculateTotalArea(rooms) {
    return rooms.reduce((sum, r) => sum + (r.area || 0), 0);
  }
}

/**
 * Create a floor plan generator instance
 */
export function createFloorPlanGenerator(options = {}) {
  return new MVPFloorPlanGenerator(options);
}

/**
 * Quick geometry generation helper
 */
export async function generateQuickGeometry(program, constraints = {}) {
  const generator = createFloorPlanGenerator();
  return generator.generateLayout(program, constraints);
}

/**
 * Generate complete architectural package
 */
export async function generateArchitecturalPackage(program, styleDNA = {}, constraints = {}) {
  const generator = createFloorPlanGenerator();
  return generator.generateCompletePackage(program, styleDNA, constraints);
}

export default {
  MVPFloorPlanGenerator,
  createFloorPlanGenerator,
  generateQuickGeometry,
  generateArchitecturalPackage,
};
