/**
 * Enhanced Technical Drawing Adapter
 *
 * Bridge layer that connects the panelGenerationService to the enhanced SVG generators.
 * This adapter:
 * 1. Takes masterDNA (same interface as technicalDrawingGenerator.js)
 * 2. Creates geometry objects with floor plan data
 * 3. Calls enhanced generators for professional output
 *
 * Enhanced generators provide:
 * - Furniture symbols (beds, sofas, toilets, etc.)
 * - Door swings with 90° arcs
 * - Wall hatching (poche)
 * - Dimension lines
 * - Material patterns in elevations
 * - Structural details in sections
 *
 * @module enhancedTechnicalDrawingAdapter
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../core/logger.js";
import {
  generateFromDNA as generateElevationFromDNA,
  MATERIAL_PATTERNS,
} from "../svg/ArchitecturalElevationGenerator.js";
import ArchitecturalFloorPlanGenerator, {
  FURNITURE_SYMBOLS,
  WALL_PATTERNS,
} from "../svg/ArchitecturalFloorPlanGenerator.js";

// Elevation and Section generators export functions directly (not classes)

import {
  generateFromDNA as generateSectionFromDNA,
  HATCH_PATTERNS,
} from "../svg/ArchitecturalSectionGenerator.js";

/**
 * Convert SVG string to data URL format
 * This matches the format expected by CleanPanelOrchestrator
 */
function svgToDataUrl(svg) {
  if (!svg) {
    return null;
  }
  try {
    // Use base64 encoding for reliable cross-browser support
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
  } catch (error) {
    logger.error("[EnhancedAdapter] Failed to encode SVG to data URL:", error);
    return null;
  }
}

/**
 * Wrap SVG result in the format expected by CleanPanelOrchestrator
 * Returns { dataUrl, svg, metadata } object
 */
function wrapSVGResult(svg, metadata = {}) {
  if (!svg) {
    return null;
  }
  const dataUrl = svgToDataUrl(svg);
  if (!dataUrl) {
    return null;
  }
  return {
    dataUrl,
    svg,
    metadata: {
      ...metadata,
      generator: "enhanced",
      timestamp: Date.now(),
    },
  };
}

/**
 * GeometryAdapter - Creates geometry-like objects from DNA for enhanced generators
 * This bridges the gap between DNA format and enhanced generator requirements
 */
class GeometryAdapter {
  constructor(masterDNA) {
    this.dna = masterDNA;
    // CRITICAL: Extract populatedGeometry which has room polygons, wall coordinates, opening positions
    // Check multiple sources:
    // 1. masterDNA.populatedGeometry (direct)
    // 2. masterDNA.geometryDNA (contains floors from spread populatedGeometry)
    // 3. masterDNA.geometry (legacy location)
    this.populatedGeometry = this.extractPopulatedGeometry(masterDNA);
    this.dimensions = this.extractDimensions();
    this.rooms = this.extractRooms();
    this.walls = this.extractWalls(); // NEW: Extract wall geometry
    this.materials = this.extractMaterials();
    this.openings = this.extractOpenings();

    // Debug logging to verify geometry data flow
    if (this.populatedGeometry?.floors?.length > 0) {
      const totalRooms = this.populatedGeometry.floors.reduce(
        (sum, f) => sum + (f.rooms?.length || 0),
        0,
      );
      const totalWalls = this.populatedGeometry.floors.reduce(
        (sum, f) => sum + (f.walls?.length || 0),
        0,
      );
      logger.info(
        `[GeometryAdapter] Using populatedGeometry: ${this.populatedGeometry.floors.length} floors, ${totalRooms} rooms, ${totalWalls} walls`,
      );
    } else {
      logger.warn(
        "[GeometryAdapter] No populatedGeometry found, falling back to DNA rooms",
      );
    }
  }

  /**
   * Extract populatedGeometry from multiple possible sources
   * The geometry data may be in different locations depending on how it was passed
   */
  extractPopulatedGeometry(masterDNA) {
    if (!masterDNA) {
      return null;
    }

    // Priority 1: Direct populatedGeometry property
    if (masterDNA.populatedGeometry?.floors?.length > 0) {
      logger.debug(
        "[GeometryAdapter] Found populatedGeometry directly on masterDNA",
      );
      return masterDNA.populatedGeometry;
    }

    // Priority 2: geometryDNA (populatedGeometry is spread into this by orchestrator)
    // geometryDNA.floors would have the room polygons and wall coordinates
    if (masterDNA.geometryDNA?.floors?.length > 0) {
      logger.debug(
        "[GeometryAdapter] Found floors in geometryDNA, using as populatedGeometry",
      );
      return masterDNA.geometryDNA;
    }

    // Priority 3: geometry property (legacy/alternate location)
    if (masterDNA.geometry?.floors?.length > 0) {
      logger.debug(
        "[GeometryAdapter] Found floors in geometry, using as populatedGeometry",
      );
      return masterDNA.geometry;
    }

    // Priority 4: Check for floors at top level (some pipelines put it there)
    if (masterDNA.floors?.length > 0) {
      logger.debug("[GeometryAdapter] Found floors at top level of masterDNA");
      return { floors: masterDNA.floors };
    }

    return null;
  }

  extractDimensions() {
    const dims = this.dna?.dimensions || this.dna?.geometry?.dimensions || {};

    // CRITICAL: Extract floor count from canonical geometry (same source as sections)
    // Priority: 1) masterGeometry.floors.length 2) dims.floors 3) rooms distribution 4) floorHeights.length
    let floors = dims.floors;

    // If no explicit floors, derive from geometry floors array
    if (!floors && this.dna?.geometry?.floors?.length) {
      floors = this.dna.geometry.floors.length;
    }

    // If still no floors, derive from rooms distribution
    if (!floors && (this.dna?.rooms || this.dna?.program?.rooms)) {
      const rooms = this.dna?.rooms || this.dna?.program?.rooms || [];
      const maxFloor = rooms.reduce((max, room) => {
        const roomFloor =
          room.floor ??
          (room.level === "ground"
            ? 0
            : room.level === "first"
              ? 1
              : (room.level ?? 0));
        return Math.max(max, roomFloor);
      }, 0);
      floors = maxFloor + 1; // Convert 0-indexed to count
    }

    // If still no floors, derive from floorHeights array length
    if (!floors && dims.floorHeights?.length) {
      floors = dims.floorHeights.length;
    }

    // Absolute fallback: calculate from total height and typical floor height
    if (!floors) {
      const totalHeight = dims.height || 7;
      const typicalFloorHeight = 2.7;
      floors = Math.max(1, Math.round(totalHeight / typicalFloorHeight));
      logger.warn(
        `[GeometryAdapter] No explicit floor count found, derived ${floors} floors from height ${totalHeight}m`,
      );
    }

    // Generate floorHeights array if not provided
    const floorHeights = dims.floorHeights || Array(floors).fill(2.7);

    return {
      width: dims.width || dims.length || 12,
      length: dims.depth || dims.length || 10,
      depth: dims.depth || dims.length || 10,
      height: dims.height || 7,
      floors,
      floorHeights,
      wallThickness: dims.wallThickness || 0.3,
      internalWallThickness: dims.internalWallThickness || 0.1,
    };
  }

  extractRooms() {
    const floorMap = {};

    // PRIORITY 1: Use populatedGeometry floors (has polygon data, wall coordinates, openings)
    if (this.populatedGeometry?.floors?.length > 0) {
      // PHASE 1A: First pass — compute global min X/Y per floor for origin normalization
      // BuildingModel uses MM with center-origin (e.g., x: -6000, y: -4500)
      // Generators expect meters with top-left origin (e.g., x: 0.3, y: 0.3)
      const floorBounds = {};
      this.populatedGeometry.floors.forEach((floor) => {
        const level = floor.level ?? 0;
        let globalMinX = Infinity, globalMinY = Infinity;
        let globalMaxX = -Infinity, globalMaxY = -Infinity;

        (floor.rooms || []).forEach((room) => {
          if (room.boundingBox) {
            const minX = room.boundingBox.minX ?? 0;
            const minY = room.boundingBox.minY ?? 0;
            const maxX = room.boundingBox.maxX ?? (minX + (room.boundingBox.width || 0));
            const maxY = room.boundingBox.maxY ?? (minY + (room.boundingBox.height || 0));
            globalMinX = Math.min(globalMinX, minX);
            globalMinY = Math.min(globalMinY, minY);
            globalMaxX = Math.max(globalMaxX, maxX);
            globalMaxY = Math.max(globalMaxY, maxY);
          } else if (room.polygon?.length >= 3) {
            room.polygon.forEach((p) => {
              globalMinX = Math.min(globalMinX, p.x);
              globalMinY = Math.min(globalMinY, p.y);
              globalMaxX = Math.max(globalMaxX, p.x);
              globalMaxY = Math.max(globalMaxY, p.y);
            });
          }
        });

        // Detect if coordinates are in MM (typical BuildingModel values are > 500)
        const isMM = Math.abs(globalMinX) > 500 || Math.abs(globalMinY) > 500 ||
                     Math.abs(globalMaxX) > 500 || Math.abs(globalMaxY) > 500;

        floorBounds[level] = { globalMinX, globalMinY, globalMaxX, globalMaxY, isMM };
      });

      // Store floor bounds for use by extractWalls() and getFloorOpenings()
      this._floorBounds = floorBounds;

      this.populatedGeometry.floors.forEach((floor) => {
        const level = floor.level ?? 0;
        const bounds = floorBounds[level] || { globalMinX: 0, globalMinY: 0, isMM: false };
        const { globalMinX, globalMinY, isMM } = bounds;
        // Offset for wall thickness so rooms don't start at edge
        const wallOffset = this.dimensions?.wallThickness || 0.3;

        floorMap[level] = (floor.rooms || []).map((room, index) => {
          // Extract dimensions from boundingBox or polygon
          let width, length, x, y;
          if (room.boundingBox) {
            const rawMinX = room.boundingBox.minX ?? 0;
            const rawMinY = room.boundingBox.minY ?? 0;
            const rawWidth = room.boundingBox.width || (room.boundingBox.maxX - rawMinX) || 0;
            const rawLength = room.boundingBox.height || (room.boundingBox.maxY - rawMinY) || 0;

            if (isMM) {
              // Convert MM center-origin → meters top-left origin
              x = ((rawMinX - globalMinX) / 1000) + wallOffset;
              y = ((rawMinY - globalMinY) / 1000) + wallOffset;
              width = rawWidth / 1000;
              length = rawLength / 1000;
            } else {
              // Already in meters, just normalize origin
              x = (rawMinX - globalMinX) + wallOffset;
              y = (rawMinY - globalMinY) + wallOffset;
              width = rawWidth;
              length = rawLength;
            }
          } else if (room.polygon?.length >= 3) {
            // Calculate bounds from polygon
            const xs = room.polygon.map((p) => p.x);
            const ys = room.polygon.map((p) => p.y);
            const pMinX = Math.min(...xs);
            const pMinY = Math.min(...ys);

            if (isMM) {
              x = ((pMinX - globalMinX) / 1000) + wallOffset;
              y = ((pMinY - globalMinY) / 1000) + wallOffset;
              width = (Math.max(...xs) - pMinX) / 1000;
              length = (Math.max(...ys) - pMinY) / 1000;
            } else {
              x = (pMinX - globalMinX) + wallOffset;
              y = (pMinY - globalMinY) + wallOffset;
              width = Math.max(...xs) - pMinX;
              length = Math.max(...ys) - pMinY;
            }
          } else {
            width = 4;
            length = 3;
            x = wallOffset;
            y = wallOffset;
          }

          // Convert polygon points to meters with top-left origin
          let normalizedPolygon = room.polygon;
          if (room.polygon?.length >= 3 && isMM) {
            normalizedPolygon = room.polygon.map((p) => ({
              x: ((p.x - globalMinX) / 1000) + wallOffset,
              y: ((p.y - globalMinY) / 1000) + wallOffset,
            }));
          } else if (room.polygon?.length >= 3) {
            normalizedPolygon = room.polygon.map((p) => ({
              x: (p.x - globalMinX) + wallOffset,
              y: (p.y - globalMinY) + wallOffset,
            }));
          }

          // Convert area from mm² to m² if needed
          let area = room.area || room.targetArea || width * length;
          if (isMM && area > 100000) {
            area = area / 1000000; // mm² → m²
          }

          // Determine which wall has a door based on touchesFacades
          const touchesFacades = room.touchesFacades || [];
          const hasDoor = true; // All rooms get doors
          let doorWall = 'west'; // default
          if (touchesFacades.includes('south')) {
            doorWall = 'south';
          } else if (touchesFacades.includes('north')) {
            doorWall = 'north';
          } else if (touchesFacades.includes('east')) {
            doorWall = 'east';
          } else if (touchesFacades.includes('west')) {
            doorWall = 'west';
          }
          // Hallways get doors on the long axis
          const roomName = (room.name || room.id || '').toLowerCase();
          if (roomName.includes('hall') || roomName.includes('landing')) {
            doorWall = width > length ? 'south' : 'east';
          }

          return {
            name: room.name || room.id || `Room ${index + 1}`,
            type: this.normalizeRoomType(room.name || room.id),
            polygon: normalizedPolygon, // Normalized polygon in meters
            boundingBox: room.boundingBox,
            width: width,
            length: length,
            area: area,
            x: x,
            y: y,
            windows: room.windows || this.estimateWindows(room.name, area),
            doors: room.doors || 1,
            hasDoor: hasDoor,
            doorWall: doorWall,
            touchesFacades: touchesFacades,
            features: room.features || [],
          };
        });
      });
      logger.debug(
        `[GeometryAdapter] Extracted rooms from populatedGeometry: ${JSON.stringify(Object.keys(floorMap).map((k) => `floor ${k}: ${floorMap[k].length} rooms`))}`,
      );

      // Log coordinate conversion details
      Object.keys(floorBounds).forEach((level) => {
        const b = floorBounds[level];
        if (b.isMM) {
          logger.info(
            `[GeometryAdapter] Floor ${level}: MM→meters conversion applied. Raw bounds: (${b.globalMinX}, ${b.globalMinY}) → (${b.globalMaxX}, ${b.globalMaxY}) mm`,
          );
        }
      });

      return floorMap;
    }

    // FALLBACK: Use DNA rooms (no polygon data, will auto-layout)
    const rooms = this.dna?.rooms || this.dna?.program?.rooms || [];

    rooms.forEach((room, index) => {
      const floor = room.floor || (room.level === "ground" ? 0 : 1);
      if (!floorMap[floor]) {
        floorMap[floor] = [];
      }

      // Parse dimensions string like "5.5m × 4.0m" or use numeric values
      let width, length;
      if (typeof room.dimensions === "string") {
        const match = room.dimensions.match(/([\d.]+)m?\s*[×x]\s*([\d.]+)m?/i);
        if (match) {
          width = parseFloat(match[1]);
          length = parseFloat(match[2]);
        }
      } else if (room.dimensions) {
        width = room.dimensions.width || room.dimensions.x || 4;
        length = room.dimensions.length || room.dimensions.y || 3;
      }

      // Calculate area if not provided
      const area = room.area || (width && length ? width * length : 15);
      if (!width || !length) {
        // Estimate from area with golden ratio-ish proportions
        width = Math.sqrt(area * 1.3);
        length = area / width;
      }

      floorMap[floor].push({
        name: room.name || `Room ${index + 1}`,
        type: this.normalizeRoomType(room.name || room.type),
        width: width,
        length: length,
        area: area,
        x: room.x || 0,
        y: room.y || 0,
        windows: room.windows || this.estimateWindows(room.name, area),
        doors: room.doors || 1,
        features: room.features || [],
      });
    });

    return floorMap;
  }

  /**
   * Extract wall geometry from populatedGeometry
   * Walls have start/end coordinates and thickness
   */
  extractWalls() {
    if (!this.populatedGeometry?.floors) {
      return {};
    }

    const wallMap = {};
    this.populatedGeometry.floors.forEach((floor) => {
      const level = floor.level ?? 0;
      const bounds = this._floorBounds?.[level] || { globalMinX: 0, globalMinY: 0, isMM: false };
      const { globalMinX, globalMinY, isMM } = bounds;
      const wallOffset = this.dimensions?.wallThickness || 0.3;

      wallMap[level] = (floor.walls || []).map((wall) => {
        // Convert wall coordinates from MM center-origin to meters top-left origin
        let start = wall.start;
        let end = wall.end;
        let thickness = wall.thickness || 300; // default 300mm

        if (isMM && start && end) {
          start = {
            x: ((start.x - globalMinX) / 1000) + wallOffset,
            y: ((start.y - globalMinY) / 1000) + wallOffset,
          };
          end = {
            x: ((end.x - globalMinX) / 1000) + wallOffset,
            y: ((end.y - globalMinY) / 1000) + wallOffset,
          };
          thickness = thickness > 1 ? thickness / 1000 : thickness; // mm → meters
        } else if (start && end) {
          start = {
            x: (start.x - globalMinX) + wallOffset,
            y: (start.y - globalMinY) + wallOffset,
          };
          end = {
            x: (end.x - globalMinX) + wallOffset,
            y: (end.y - globalMinY) + wallOffset,
          };
          thickness = thickness > 1 ? thickness / 1000 : thickness;
        }

        return {
          id: wall.id,
          start: start,
          end: end,
          thickness: thickness,
          type: wall.type || "exterior",
          isLoadBearing: wall.isLoadBearing,
          adjacentRooms: wall.adjacentRooms,
          openings: (wall.openings || []).map((opening) => {
            // Convert opening positions too
            if (isMM && opening.position !== undefined) {
              return {
                ...opening,
                position: opening.position / 1000,
                width: (opening.width || 1200) / 1000,
                height: (opening.height || 1400) / 1000,
              };
            }
            return opening;
          }),
        };
      });
    });

    if (Object.keys(wallMap).length > 0) {
      const totalWalls = Object.values(wallMap).reduce(
        (sum, walls) => sum + walls.length,
        0,
      );
      logger.debug(
        `[GeometryAdapter] Extracted ${totalWalls} walls from populatedGeometry (coordinates normalized to meters)`,
      );
    }

    return wallMap;
  }

  normalizeRoomType(name) {
    // Map room names to furniture symbol keys
    const nameNorm = (name || "").toLowerCase();
    if (nameNorm.includes("living") || nameNorm.includes("lounge")) {
      return "Living Room";
    }
    if (nameNorm.includes("kitchen") && nameNorm.includes("din")) {
      return "Kitchen/Diner";
    }
    if (nameNorm.includes("kitchen")) {
      return "Kitchen";
    }
    if (nameNorm.includes("master") || nameNorm.includes("main bedroom")) {
      return "Master Bedroom";
    }
    if (nameNorm.includes("bedroom 2") || nameNorm.includes("bed 2")) {
      return "Bedroom 2";
    }
    if (nameNorm.includes("bedroom 3") || nameNorm.includes("bed 3")) {
      return "Bedroom 3";
    }
    if (nameNorm.includes("bedroom")) {
      return "Bedroom";
    }
    if (nameNorm.includes("family bath")) {
      return "Family Bathroom";
    }
    if (nameNorm.includes("en-suite") || nameNorm.includes("ensuite")) {
      return "En-Suite";
    }
    if (nameNorm.includes("bath")) {
      return "Bathroom";
    }
    if (nameNorm.includes("wc") || nameNorm.includes("toilet")) {
      return "WC";
    }
    if (nameNorm.includes("cloakroom")) {
      return "Cloakroom";
    }
    if (nameNorm.includes("dining")) {
      return "Dining Room";
    }
    if (nameNorm.includes("utility")) {
      return "Utility Room";
    }
    if (nameNorm.includes("study") || nameNorm.includes("office")) {
      return "Study";
    }
    if (nameNorm.includes("hall")) {
      return "Hallway";
    }
    if (nameNorm.includes("landing")) {
      return "Landing";
    }
    if (nameNorm.includes("garage")) {
      return "Garage";
    }
    return name; // Return as-is if no match
  }

  estimateWindows(roomName, area) {
    const name = (roomName || "").toLowerCase();
    if (name.includes("living") || name.includes("lounge")) {
      return 2;
    }
    if (name.includes("kitchen")) {
      return 1;
    }
    if (name.includes("bedroom")) {
      return 1;
    }
    if (name.includes("bath") || name.includes("wc")) {
      return 1;
    }
    if (name.includes("hall") || name.includes("landing")) {
      return 0;
    }
    return area > 15 ? 2 : 1;
  }

  extractMaterials() {
    const materials = this.dna?.materials || this.dna?.style?.materials || [];
    const result = {
      exterior: "#D4C4B0",
      roof: "#5C4033",
      windows: "#87CEEB",
      doors: "#8B4513",
      floor: "#DEB887",
    };

    materials.forEach((m) => {
      const app = (m.application || "").toLowerCase();
      if (
        app.includes("exterior") ||
        app.includes("wall") ||
        app.includes("facade")
      ) {
        result.exterior = m.hexColor || result.exterior;
      }
      if (app.includes("roof")) {
        result.roof = m.hexColor || result.roof;
      }
      if (app.includes("window")) {
        result.windows = m.hexColor || result.windows;
      }
      if (app.includes("door")) {
        result.doors = m.hexColor || result.doors;
      }
    });

    return result;
  }

  extractOpenings() {
    // PRIORITY 1: Extract real openings from populatedGeometry (BuildingModel data)
    if (this.populatedGeometry?.floors?.length > 0) {
      const openings = [];
      const directionalOpenings = { north: [], south: [], east: [], west: [] };

      this.populatedGeometry.floors.forEach((floor) => {
        const level = floor.level ?? 0;
        const bounds = this._floorBounds?.[level] || { globalMinX: 0, globalMinY: 0, isMM: false };
        const { globalMinX, globalMinY, isMM } = bounds;
        const wallOffset = this.dimensions?.wallThickness || 0.3;

        // Collect openings from floor-level array
        (floor.openings || []).forEach((opening) => {
          const facade = opening.facade || opening.wall || 'south';
          const rawWidth = opening.width || 1200;
          const rawHeight = opening.height || 1400;
          const rawX = opening.x ?? opening.position ?? 0;

          const width = isMM && rawWidth > 10 ? rawWidth / 1000 : rawWidth;
          const height = isMM && rawHeight > 10 ? rawHeight / 1000 : rawHeight;
          const x = isMM && Math.abs(rawX) > 10 ? ((rawX - globalMinX) / 1000) + wallOffset : rawX;

          const normalizedOpening = {
            type: opening.type || 'window',
            facade: facade,
            floor: level,
            width: width,
            height: height,
            sillHeight: opening.sillHeight ? (isMM ? opening.sillHeight / 1000 : opening.sillHeight) : 0.9,
            x: x,
          };

          openings.push(normalizedOpening);
          if (directionalOpenings[facade]) {
            directionalOpenings[facade].push(normalizedOpening);
          }
        });

        // Also collect from wall-embedded openings
        (floor.walls || []).forEach((wall) => {
          (wall.openings || []).forEach((opening) => {
            const facade = wall.facade || this._inferFacadeFromWall(wall) || 'south';
            const rawWidth = opening.width || 1200;
            const rawHeight = opening.height || 1400;

            const width = isMM && rawWidth > 10 ? rawWidth / 1000 : rawWidth;
            const height = isMM && rawHeight > 10 ? rawHeight / 1000 : rawHeight;

            // Compute x position along the wall
            let x = 0;
            if (opening.position !== undefined) {
              x = isMM ? ((opening.position - globalMinX) / 1000) + wallOffset : opening.position;
            } else if (wall.start) {
              // Mid-point of wall
              const midX = (wall.start.x + wall.end.x) / 2;
              x = isMM ? ((midX - globalMinX) / 1000) + wallOffset : midX;
            }

            const normalizedOpening = {
              type: opening.type || 'window',
              facade: facade,
              floor: level,
              width: width,
              height: height,
              sillHeight: 0.9,
              x: x,
            };

            openings.push(normalizedOpening);
            if (directionalOpenings[facade]) {
              directionalOpenings[facade].push(normalizedOpening);
            }
          });
        });
      });

      if (openings.length > 0) {
        logger.info(
          `[GeometryAdapter] Extracted ${openings.length} real openings from populatedGeometry: N=${directionalOpenings.north.length} S=${directionalOpenings.south.length} E=${directionalOpenings.east.length} W=${directionalOpenings.west.length}`,
        );
        // Store directional map for floor plan window rendering
        this._directionalOpenings = directionalOpenings;
        return openings;
      }
    }

    // FALLBACK: Synthesize openings from DNA viewSpecificFeatures
    const viewFeatures = this.dna?.viewSpecificFeatures || {};
    const openings = [];

    ["north", "south", "east", "west"].forEach((orientation) => {
      const features = viewFeatures[orientation] || {};
      const windows = features.windows || features.windowCount || 2;
      const doors = features.doors || (features.mainEntrance ? 1 : 0);

      for (let i = 0; i < windows; i++) {
        openings.push({
          type: "window",
          facade: orientation,
          floor: Math.floor(i / 2),
          width: 1.2,
          height: 1.4,
          sillHeight: 0.9,
        });
      }

      if (doors) {
        openings.push({
          type: "door",
          facade: orientation,
          floor: 0,
          width: 1.0,
          height: 2.1,
        });
      }
    });

    return openings;
  }

  /**
   * Infer facade direction from wall start/end coordinates
   * Horizontal walls (same Y) are north/south; vertical walls (same X) are east/west
   */
  _inferFacadeFromWall(wall) {
    if (!wall.start || !wall.end) return null;
    const dx = Math.abs(wall.end.x - wall.start.x);
    const dy = Math.abs(wall.end.y - wall.start.y);

    if (dx > dy) {
      // Horizontal wall — check if it's at min Y (north) or max Y (south)
      return wall.start.y < 0 ? 'north' : 'south';
    } else {
      // Vertical wall — check if it's at min X (west) or max X (east)
      return wall.start.x < 0 ? 'west' : 'east';
    }
  }

  /**
   * Get floor plan data for a specific floor
   * This method is required by ArchitecturalFloorPlanGenerator
   *
   * ENHANCED: Now returns walls and openings from populatedGeometry
   */
  getFloorPlanData(floor = 0) {
    const rooms = this.rooms[floor] || [];
    const walls = this.walls?.[floor] || [];
    const openings = this.getFloorOpenings(floor);

    if (rooms.length === 0 && floor === 0) {
      // Generate default rooms if none defined
      const defaultData = this.generateDefaultFloorPlan(floor);
      return {
        ...defaultData,
        walls: walls,
        openings: openings,
      };
    }

    // Check if rooms already have polygon data (from populatedGeometry)
    // If yes, use them directly without auto-layout to preserve exact geometry
    const hasPolygons = rooms.some((r) => r.polygon?.length >= 3);
    const hasExplicitRoomLayout = rooms.every(
      (r) =>
        Number.isFinite(Number(r.x)) &&
        Number.isFinite(Number(r.y)) &&
        Number.isFinite(Number(r.width)) &&
        Number.isFinite(Number(r.length)),
    );

    const strictGeometryFidelity =
      isFeatureEnabled("strictGeometryMaskGate") ||
      isFeatureEnabled("strictCanonicalGeometryPack") ||
      isFeatureEnabled("programGeometryFidelityGate");

    // In strict mode, do not invent room layouts when authoritative geometry is missing.
    if (strictGeometryFidelity && !hasPolygons && !hasExplicitRoomLayout) {
      logger.warn(
        `[GeometryAdapter] Floor ${floor}: missing polygon/explicit room layout in strict geometry mode`,
      );
      return null;
    }

    const layoutRooms = hasPolygons
      ? rooms
      : hasExplicitRoomLayout
        ? rooms
        : this.autoLayoutRooms(rooms, floor);

    if (hasPolygons) {
      logger.debug(
        `[GeometryAdapter] Floor ${floor}: Using ${rooms.length} rooms with polygon data, ${walls.length} walls, ${openings.length} openings`,
      );
    }

    // Build directional openings map for floor plan window rendering
    const directionalOpenings = this._directionalOpenings || { north: [], south: [], east: [], west: [] };
    // Filter openings for this specific floor
    const floorDirectionalOpenings = {};
    ['north', 'south', 'east', 'west'].forEach((dir) => {
      floorDirectionalOpenings[dir] = (directionalOpenings[dir] || []).filter(
        (o) => o.floor === floor || o.floor === undefined,
      );
    });

    return {
      width: this.dimensions.width,
      length: this.dimensions.depth,
      rooms: layoutRooms,
      walls: walls, // Wall geometry from populatedGeometry (normalized to meters)
      openings: floorDirectionalOpenings, // Directional openings map for floor plan windows
      wallThickness: this.dimensions.wallThickness,
      internalWallThickness: this.dimensions.internalWallThickness,
    };
  }

  /**
   * Get openings (doors, windows) for a specific floor from populatedGeometry
   */
  getFloorOpenings(floor = 0) {
    if (!this.populatedGeometry?.floors) {
      return [];
    }

    const floorData = this.populatedGeometry.floors.find(
      (f) => (f.level ?? 0) === floor,
    );
    if (!floorData) {
      return [];
    }

    // Collect openings from floor-level openings array
    const floorOpenings = floorData.openings || [];

    // Also collect openings embedded in walls
    const wallOpenings = (floorData.walls || []).flatMap((wall) => {
      return (wall.openings || []).map((opening) => ({
        ...opening,
        wallId: wall.id,
        wallStart: wall.start,
        wallEnd: wall.end,
      }));
    });

    return [...floorOpenings, ...wallOpenings];
  }

  generateDefaultFloorPlan(floor) {
    // P0: In strict mode, do NOT generate default/fallback floor plans
    // They create ambiguous content that contradicts the programLock
    if (
      isFeatureEnabled("strictNoFallback") &&
      !isFeatureEnabled("allowTechnicalFallback")
    ) {
      logger.warn(
        `[EnhancedAdapter] generateDefaultFloorPlan(${floor}) blocked by strictNoFallback — no fallback allowed`,
      );
      return null;
    }

    const buildingType =
      this.dna?.buildingType ||
      this.dna?.program?.buildingType ||
      "Residential";

    // Default rooms based on building type
    const defaultRooms =
      floor === 0
        ? [
            {
              name: "Living Room",
              type: "Living Room",
              width: 5.5,
              length: 4.0,
              windows: 2,
            },
            {
              name: "Kitchen/Diner",
              type: "Kitchen/Diner",
              width: 4.5,
              length: 3.5,
              windows: 1,
            },
            {
              name: "Hallway",
              type: "Hallway",
              width: 3.0,
              length: 2.0,
              windows: 0,
            },
            { name: "WC", type: "WC", width: 1.5, length: 1.8, windows: 1 },
          ]
        : [
            {
              name: "Master Bedroom",
              type: "Master Bedroom",
              width: 4.5,
              length: 3.5,
              windows: 1,
            },
            {
              name: "Bedroom 2",
              type: "Bedroom 2",
              width: 3.5,
              length: 3.0,
              windows: 1,
            },
            {
              name: "Bedroom 3",
              type: "Bedroom 3",
              width: 3.0,
              length: 2.8,
              windows: 1,
            },
            {
              name: "Family Bathroom",
              type: "Family Bathroom",
              width: 2.5,
              length: 2.0,
              windows: 1,
            },
            {
              name: "Landing",
              type: "Landing",
              width: 2.0,
              length: 2.0,
              windows: 0,
            },
          ];

    return {
      width: this.dimensions.width,
      length: this.dimensions.depth,
      rooms: this.autoLayoutRooms(defaultRooms, floor),
      wallThickness: this.dimensions.wallThickness,
      internalWallThickness: this.dimensions.internalWallThickness,
    };
  }

  autoLayoutRooms(rooms, floor) {
    // Simple grid-based layout algorithm
    const buildingWidth = this.dimensions.width;
    const buildingDepth = this.dimensions.depth;
    const wallThick = this.dimensions.wallThickness;

    let currentX = wallThick;
    let currentY = wallThick;
    let rowHeight = 0;
    const layoutRooms = [];

    rooms.forEach((room, index) => {
      const roomWidth = room.width || 4;
      const roomLength = room.length || 3;

      // Check if room fits in current row
      if (currentX + roomWidth > buildingWidth - wallThick) {
        // Move to next row
        currentX = wallThick;
        currentY += rowHeight + this.dimensions.internalWallThickness;
        rowHeight = 0;
      }

      layoutRooms.push({
        ...room,
        x: currentX,
        y: currentY,
        width: roomWidth,
        length: roomLength,
        area: room.area || roomWidth * roomLength,
        doors: room.doors || 1,
      });

      currentX += roomWidth + this.dimensions.internalWallThickness;
      rowHeight = Math.max(rowHeight, roomLength);
    });

    return layoutRooms;
  }

  /**
   * Get elevation data for a specific orientation
   */
  getElevationData(orientation = "south") {
    const viewFeatures = this.dna?.viewSpecificFeatures?.[orientation] || {};

    return {
      orientation,
      width:
        orientation === "north" || orientation === "south"
          ? this.dimensions.width
          : this.dimensions.depth,
      height: this.dimensions.height,
      floors: this.dimensions.floors,
      floorHeights: this.dimensions.floorHeights,
      materials: this.materials,
      openings: this.openings.filter((o) => o.facade === orientation),
      roofType: this.dna?.style?.roofType || this.dna?.roofType || "gable",
      roofPitch: this.dna?.style?.roofPitch || 35,
      features: viewFeatures,
    };
  }

  /**
   * Get section data for a specific cut type
   */
  getSectionData(sectionType = "longitudinal") {
    const isLongitudinal =
      sectionType === "longitudinal" || sectionType === "long";

    return {
      type: sectionType,
      width: isLongitudinal ? this.dimensions.depth : this.dimensions.width,
      height: this.dimensions.height,
      floors: this.dimensions.floors,
      floorHeights: this.dimensions.floorHeights,
      wallThickness: this.dimensions.wallThickness,
      materials: this.materials,
      roofType: this.dna?.style?.roofType || "gable",
      roofPitch: this.dna?.style?.roofPitch || 35,
      foundationType: this.dna?.structure?.foundationType || "strip",
      rooms: isLongitudinal
        ? this.getSectionRooms("vertical")
        : this.getSectionRooms("horizontal"),
    };
  }

  getSectionRooms(direction) {
    // Get rooms that intersect with the section cut
    const result = [];
    Object.keys(this.rooms).forEach((floor) => {
      this.rooms[floor].forEach((room) => {
        result.push({
          ...room,
          floor: parseInt(floor),
        });
      });
    });
    return result;
  }
}

/**
 * Generate enhanced floor plan SVG from DNA
 * Drop-in replacement for technicalDrawingGenerator.generateFloorPlanSVG
 *
 * @param {Object} masterDNA - Design DNA
 * @param {string|number} floor - Floor level ('ground', 'first', 0, 1, etc.)
 * @param {Object} projectContext - Additional context
 * @returns {string} SVG string
 */
export function generateEnhancedFloorPlanSVG(
  masterDNA,
  floor = "ground",
  projectContext = {},
) {
  try {
    // Check feature flag
    if (!isFeatureEnabled("enhancedSVGGenerators")) {
      logger.debug(
        "[EnhancedAdapter] Feature flag disabled, falling back to basic generator",
      );
      return null; // Signal to use fallback
    }

    // Convert floor string to number
    const floorIndex =
      typeof floor === "string"
        ? floor === "ground"
          ? 0
          : floor === "first"
            ? 1
            : parseInt(floor.replace(/\D/g, "")) || 0
        : floor;

    // Create geometry adapter from DNA
    const geometry = new GeometryAdapter(masterDNA);

    // Create enhanced generator with professional options
    const generator = new ArchitecturalFloorPlanGenerator({
      scale: projectContext.scale || 50,
      showFurniture: true,
      showDimensions: true,
      showDoorSwings: true,
      showRoomLabels: true,
      wallThickness: geometry.dimensions.wallThickness,
      internalWallThickness: geometry.dimensions.internalWallThickness,
    });

    // Generate the SVG
    const svg = generator.generate(geometry, floorIndex);

    logger.info(
      `[EnhancedAdapter] Generated enhanced floor plan for floor ${floorIndex}`,
    );

    // CRITICAL FIX: Wrap SVG in expected format { dataUrl, svg, metadata }
    // CleanPanelOrchestrator checks for result?.dataUrl - plain strings fail this check
    return wrapSVGResult(svg, { type: "floor_plan", floor: floorIndex });
  } catch (error) {
    logger.error("[EnhancedAdapter] Floor plan generation failed:", error);
    return null; // Signal to use fallback
  }
}

/**
 * Generate enhanced elevation SVG from DNA
 * Drop-in replacement for technicalDrawingGenerator.generateElevationSVG
 *
 * Uses the ArchitecturalElevationGenerator which provides:
 * - Material patterns (brick, timber, render, stone, slate)
 * - Window details with glazing bars and sills
 * - Door details with panels
 * - Ground line with context
 * - Level markers and dimension lines
 *
 * @param {Object} masterDNA - Design DNA
 * @param {string} orientation - Facade orientation ('north', 'south', 'east', 'west')
 * @param {Object} projectContext - Additional context
 * @returns {string} SVG string
 */
export function generateEnhancedElevationSVG(
  masterDNA,
  orientation = "south",
  projectContext = {},
) {
  try {
    if (!isFeatureEnabled("enhancedSVGGenerators")) {
      logger.debug(
        "[EnhancedAdapter] Feature flag disabled, falling back to basic generator",
      );
      return null;
    }

    // Create geometry adapter to extract real opening positions
    const geometry = new GeometryAdapter(masterDNA);

    // Build elevation options with real openings if available
    const elevationOptions = {
      scale: projectContext.scale || 50,
      showDimensions: true,
      showMaterialPatterns: true,
      showGroundContext: true,
      showLevelMarkers: true,
    };

    // Pass real openings from populatedGeometry to elevation generator
    const facadeOpenings = geometry.openings.filter((o) => o.facade === orientation);
    if (facadeOpenings.length > 0) {
      elevationOptions.realOpenings = facadeOpenings;
      logger.debug(
        `[EnhancedAdapter] Passing ${facadeOpenings.length} real openings to ${orientation} elevation`,
      );
    }

    // Use the generateFromDNA function directly (elevation generator is function-based)
    const svg = generateElevationFromDNA(masterDNA, orientation, elevationOptions);

    logger.info(
      `[EnhancedAdapter] Generated enhanced ${orientation} elevation with material patterns`,
    );

    // CRITICAL FIX: Wrap SVG in expected format { dataUrl, svg, metadata }
    return wrapSVGResult(svg, { type: "elevation", orientation });
  } catch (error) {
    logger.error("[EnhancedAdapter] Elevation generation failed:", error);
    return null;
  }
}

/**
 * Generate enhanced section SVG from DNA
 * Drop-in replacement for technicalDrawingGenerator.generateSectionSVG
 *
 * Uses the ArchitecturalSectionGenerator which provides:
 * - Cut wall hatching (concrete, brick, etc.)
 * - Floor structure with slab thickness
 * - Roof structure details
 * - Foundation types (strip, raft, pile)
 * - Room labels and level markers
 * - Dimension lines
 *
 * @param {Object} masterDNA - Design DNA
 * @param {string} sectionType - Section type ('longitudinal', 'transverse')
 * @param {Object} projectContext - Additional context
 * @param {number} cutPosition - Position of cut (0.0 to 1.0)
 * @returns {string} SVG string
 */
export function generateEnhancedSectionSVG(
  masterDNA,
  sectionType = "longitudinal",
  projectContext = {},
  cutPosition = 0.5,
) {
  try {
    if (!isFeatureEnabled("enhancedSVGGenerators")) {
      logger.debug(
        "[EnhancedAdapter] Feature flag disabled, falling back to basic generator",
      );
      return null;
    }

    // Use the generateFromDNA function directly (section generator is function-based)
    const svg = generateSectionFromDNA(masterDNA, sectionType, {
      scale: projectContext.scale || 50,
      showStructure: true,
      showDimensions: true,
      showLevels: true,
      showRoomLabels: true,
      showFoundation: true,
    });

    logger.info(
      `[EnhancedAdapter] Generated enhanced ${sectionType} section with structural details`,
    );

    // CRITICAL FIX: Wrap SVG in expected format { dataUrl, svg, metadata }
    return wrapSVGResult(svg, { type: "section", sectionType });
  } catch (error) {
    logger.error("[EnhancedAdapter] Section generation failed:", error);
    return null;
  }
}

/**
 * Generate all technical drawings (floor plans, elevations, sections)
 * Enhanced version with furniture, materials, and structural details
 *
 * @param {Object} masterDNA - Design DNA
 * @param {Object} projectContext - Additional context
 * @param {Object} options - Generation options
 * @returns {Object} Object containing all SVG strings
 */
export async function generateAllEnhancedDrawings(
  masterDNA,
  projectContext = {},
  options = {},
) {
  const results = {
    floorPlans: {},
    elevations: {},
    sections: {},
    metadata: {
      generator: "enhanced",
      timestamp: new Date().toISOString(),
      features: [
        "furniture",
        "dimensions",
        "doorSwings",
        "materials",
        "structure",
      ],
    },
  };

  const floors = masterDNA?.dimensions?.floors || 2;

  // Generate floor plans
  for (let floor = 0; floor < floors; floor++) {
    const floorName = floor === 0 ? "ground" : `floor_${floor}`;
    results.floorPlans[floorName] = generateEnhancedFloorPlanSVG(
      masterDNA,
      floor,
      projectContext,
    );
  }

  // Generate elevations
  ["north", "south", "east", "west"].forEach((orientation) => {
    results.elevations[orientation] = generateEnhancedElevationSVG(
      masterDNA,
      orientation,
      projectContext,
    );
  });

  // Generate sections
  ["longitudinal", "transverse"].forEach((sectionType) => {
    results.sections[sectionType] = generateEnhancedSectionSVG(
      masterDNA,
      sectionType,
      projectContext,
    );
  });

  return results;
}

/**
 * Check if enhanced generator can handle this panel type
 */
export function canGenerateEnhanced(panelType) {
  const enhancedPanels = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_second",
    "floor_plan",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "section_longitudinal",
    "section_transverse",
  ];

  return enhancedPanels.includes(panelType);
}

/**
 * Generate technical panel based on type
 * Unified entry point for enhanced generation
 */
export function generateEnhancedPanel(
  panelType,
  masterDNA,
  projectContext = {},
) {
  if (!canGenerateEnhanced(panelType)) {
    return null;
  }

  // Floor plans
  if (panelType.startsWith("floor_plan")) {
    const floorMatch = panelType.match(/floor_plan_(\w+)/);
    const floor = floorMatch ? floorMatch[1] : "ground";
    return generateEnhancedFloorPlanSVG(masterDNA, floor, projectContext);
  }

  // Elevations
  if (panelType.startsWith("elevation_")) {
    const orientation = panelType.replace("elevation_", "");
    return generateEnhancedElevationSVG(masterDNA, orientation, projectContext);
  }

  // Sections
  if (panelType.startsWith("section_")) {
    const sectionType =
      panelType.includes("AA") || panelType.includes("longitudinal")
        ? "longitudinal"
        : "transverse";
    return generateEnhancedSectionSVG(masterDNA, sectionType, projectContext);
  }

  return null;
}

// Export the GeometryAdapter and constants for testing and direct use
export {
  GeometryAdapter,
  FURNITURE_SYMBOLS,
  MATERIAL_PATTERNS,
  HATCH_PATTERNS,
};

export default {
  generateEnhancedFloorPlanSVG,
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
  generateAllEnhancedDrawings,
  generateEnhancedPanel,
  canGenerateEnhanced,
  GeometryAdapter,
  FURNITURE_SYMBOLS,
  MATERIAL_PATTERNS,
  HATCH_PATTERNS,
};
