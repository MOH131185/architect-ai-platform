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
      this.populatedGeometry.floors.forEach((floor) => {
        const level = floor.level ?? 0;
        floorMap[level] = (floor.rooms || []).map((room, index) => {
          // Extract dimensions from boundingBox or polygon
          let width, length, x, y;
          if (room.boundingBox) {
            width =
              room.boundingBox.width ||
              room.boundingBox.maxX - room.boundingBox.minX;
            length =
              room.boundingBox.height ||
              room.boundingBox.maxY - room.boundingBox.minY;
            x = room.boundingBox.minX ?? 0;
            y = room.boundingBox.minY ?? 0;
          } else if (room.polygon?.length >= 3) {
            // Calculate bounds from polygon
            const xs = room.polygon.map((p) => p.x);
            const ys = room.polygon.map((p) => p.y);
            x = Math.min(...xs);
            y = Math.min(...ys);
            width = Math.max(...xs) - x;
            length = Math.max(...ys) - y;
          } else {
            width = 4;
            length = 3;
            x = 0;
            y = 0;
          }

          return {
            name: room.name || room.id || `Room ${index + 1}`,
            type: this.normalizeRoomType(room.name || room.id),
            polygon: room.polygon, // CRITICAL: Keep polygon data!
            boundingBox: room.boundingBox,
            width: width,
            length: length,
            area: room.area || room.targetArea || width * length,
            x: x,
            y: y,
            windows: room.windows || this.estimateWindows(room.name, room.area),
            doors: room.doors || 1,
            features: room.features || [],
          };
        });
      });
      logger.debug(
        `[GeometryAdapter] Extracted rooms from populatedGeometry: ${JSON.stringify(Object.keys(floorMap).map((k) => `floor ${k}: ${floorMap[k].length} rooms`))}`,
      );
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
      wallMap[level] = (floor.walls || []).map((wall) => ({
        id: wall.id,
        start: wall.start,
        end: wall.end,
        thickness: wall.thickness || 0.3,
        type: wall.type || "exterior",
        isLoadBearing: wall.isLoadBearing,
        adjacentRooms: wall.adjacentRooms,
        openings: wall.openings || [],
      }));
    });

    if (Object.keys(wallMap).length > 0) {
      const totalWalls = Object.values(wallMap).reduce(
        (sum, walls) => sum + walls.length,
        0,
      );
      logger.debug(
        `[GeometryAdapter] Extracted ${totalWalls} walls from populatedGeometry`,
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
    const layoutRooms = hasPolygons
      ? rooms
      : this.autoLayoutRooms(rooms, floor);

    if (hasPolygons) {
      logger.debug(
        `[GeometryAdapter] Floor ${floor}: Using ${rooms.length} rooms with polygon data, ${walls.length} walls, ${openings.length} openings`,
      );
    }

    return {
      width: this.dimensions.width,
      length: this.dimensions.depth,
      rooms: layoutRooms,
      walls: walls, // NEW: Wall geometry from populatedGeometry
      openings: openings, // NEW: Door/window openings from populatedGeometry
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

    // Use the generateFromDNA function directly (elevation generator is function-based)
    const svg = generateElevationFromDNA(masterDNA, orientation, {
      scale: projectContext.scale || 50,
      showDimensions: true,
      showMaterialPatterns: true,
      showGroundContext: true,
      showLevelMarkers: true,
    });

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
