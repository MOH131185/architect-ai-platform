/**
 * Procedural Geometry Service (v2 - Program-Logical Layout)
 *
 * Generates strict "Geometry Masks" (walls, windows, doors) as SVG
 * for injection into the AI generation pipeline as initImage.
 *
 * V2 UPGRADE: Program-aware layout engine that:
 * - Places stair/core first (aligned across floors)
 * - Allocates public rooms on ground floor near entrance
 * - Stacks wet rooms (WC/bath/utility) vertically
 * - Places bedrooms/private rooms on upper floors
 * - Creates corridor graph connecting all rooms
 *
 * Drawing Rules (The "Truth"):
 * - Canvas: Black background (#000000)
 * - Exterior Walls: Thick white lines (stroke-width="5")
 * - Interior Walls: Thinner white lines (stroke-width="3")
 * - Glazing: Cyan lines (#00FFFF) for windows
 * - Doors: Gaps in walls (dark gray #444444)
 * - Stair Core: Magenta outline (#FF00FF)
 * - Circulation: Yellow dashed (#FFFF00)
 *
 * @module services/geometry/ProceduralGeometryService
 */

/**
 * ============================================================================
 * STRENGTH SEMANTICS DOCUMENTATION
 * ============================================================================
 *
 * TERMINOLOGY:
 * - `controlStrength`: This is DIRECTLY passed to Together.ai as `image_strength`
 * - `image_strength` / `strength`: Together.ai API parameter for img2img denoising
 *
 * HOW IT WORKS:
 * Together.ai's FLUX img2img uses `image_strength` (0.0 - 1.0) to control how much
 * the output adheres to the init_image vs. being generated from the prompt.
 *
 *   LOWER strength (< 0.25) = PRESERVE mode (strict adherence to init_image)
 *   MEDIUM strength (0.25-0.5) = MODIFY mode (targeted changes)
 *   HIGHER strength (> 0.5) = TRANSFORM mode (significant changes)
 *
 * IMPORTANT: Lower strength = MORE control over geometry, not less!
 *
 * RECOMMENDED VALUES FOR GEOMETRY MASKS:
 * ┌──────────────────────────┬─────────────┬────────────────────────────────────┐
 * │ Panel Type               │ Strength    │ Rationale                          │
 * ├──────────────────────────┼─────────────┼────────────────────────────────────┤
 * │ floor_plan_ground/first  │ 0.25 (low)  │ PRESERVE mode - strict walls       │
 * │ floor_plan_level2        │ 0.25 (low)  │ PRESERVE mode - strict walls       │
 * │ hero_3d (footprint only) │ 0.45 (med)  │ MODIFY mode - allow 3D interp      │
 * │ elevation_*              │ 0.50 (med)  │ TRANSFORM edge - balance facade    │
 * │ interior_3d              │ 0.45 (med)  │ MODIFY mode - interior variation   │
 * │ axonometric              │ 0.40 (med)  │ MODIFY mode - massing must match   │
 * └──────────────────────────┴─────────────┴────────────────────────────────────┘
 *
 * NO INVERSION IN CURRENT PIPELINE:
 * The controlStrength value set in panelGenerationService is passed DIRECTLY
 * to Together.ai without inversion. So:
 *
 *   generateParams.strength = job.meta.controlStrength || 0.25;
 *   // If controlStrength=0.25, API receives strength=0.25 (PRESERVE mode)
 *
 * This means controlStrength follows Together.ai semantics directly:
 *   - Low controlStrength (0.2-0.3) = strict geometry adherence
 *   - Medium controlStrength (0.4-0.5) = balanced
 *   - High controlStrength (0.6+) = loose geometry (NOT recommended for floor plans)
 *
 * FLOOR PLAN BEST PRACTICE:
 * For floor plans, use controlStrength = 0.25 to ensure:
 * - Walls appear exactly where the geometry mask shows them
 * - Room proportions match the SVG layout precisely
 * - AI "inks" the geometry rather than inventing its own layout
 */

import logger from "../core/logger.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  BACKGROUND: "#000000",
  EXTERIOR_WALL: "#FFFFFF",
  INTERIOR_WALL: "#FFFFFF",
  WINDOW: "#00FFFF",
  DOOR: "#444444",
  STAIR_CORE: "#FF00FF",
  CIRCULATION: "#FFFF00",
  ROOM_LABEL: "#888888",
};

const STROKE_WIDTHS = {
  EXTERIOR_WALL: 5,
  INTERIOR_WALL: 3,
  WINDOW: 2,
  STAIR_CORE: 4,
  CIRCULATION: 2,
};

// Target dimensions for different panel types (must be multiples of 16)
const TARGET_DIMENSIONS = {
  floor_plan: { width: 1504, height: 1504 }, // 1500 rounded to multiple of 16
  hero_3d: { width: 2000, height: 2000 }, // Already multiple of 16
  default: { width: 1504, height: 1504 },
};

const DEFAULT_PADDING_RATIO = 0.05;

// Room type classifications for layout logic
const ROOM_TYPES = {
  // Public rooms (ground floor, near entrance)
  PUBLIC: [
    "living",
    "living room",
    "lounge",
    "reception",
    "foyer",
    "entrance",
    "hall",
    "lobby",
  ],
  // Semi-public (ground floor)
  SEMI_PUBLIC: [
    "dining",
    "dining room",
    "kitchen",
    "study",
    "office",
    "home office",
  ],
  // Wet rooms (stack vertically)
  WET: [
    "bathroom",
    "bath",
    "wc",
    "toilet",
    "shower",
    "utility",
    "laundry",
    "en-suite",
    "ensuite",
  ],
  // Private rooms (upper floors)
  PRIVATE: [
    "bedroom",
    "master bedroom",
    "guest bedroom",
    "nursery",
    "dressing",
  ],
  // Service rooms
  SERVICE: [
    "storage",
    "closet",
    "pantry",
    "garage",
    "plant room",
    "mechanical",
  ],
  // Circulation (special handling)
  CIRCULATION: ["corridor", "hallway", "landing", "stairs", "staircase"],
};

// Minimum room dimensions in meters
const MIN_ROOM_SIZES = {
  bedroom: { width: 2.7, depth: 3.0 },
  bathroom: { width: 1.8, depth: 2.4 },
  kitchen: { width: 2.4, depth: 3.0 },
  living: { width: 3.5, depth: 4.0 },
  dining: { width: 2.7, depth: 3.0 },
  study: { width: 2.4, depth: 2.7 },
  utility: { width: 1.5, depth: 2.0 },
  corridor: { width: 1.0, depth: 1.0 },
  default: { width: 2.4, depth: 2.7 },
};

// Stair core dimensions
const STAIR_CORE = {
  width: 2.8, // meters
  depth: 3.2, // meters
  position: "center-back", // center-back, center, side
};

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

export class ProceduralGeometryService {
  constructor(options = {}) {
    this.targetWidth = options.targetWidth || TARGET_DIMENSIONS.default.width;
    this.targetHeight =
      options.targetHeight || TARGET_DIMENSIONS.default.height;
    this.paddingRatio = options.paddingRatio || DEFAULT_PADDING_RATIO;
    this.debugMode = options.debugMode || false;
  }

  /**
   * Snap dimension to multiple of 16 (Together.ai requirement)
   */
  snapToMultipleOf16(value) {
    return Math.floor(value / 16) * 16;
  }

  /**
   * Calculate scale factor to fit footprint in target dimensions
   */
  calculateScale(footprintWidth, footprintDepth, targetWidth, targetHeight) {
    const padding = Math.min(targetWidth, targetHeight) * this.paddingRatio;
    const availableWidth = targetWidth - padding * 2;
    const availableHeight = targetHeight - padding * 2;

    const scaleX = availableWidth / footprintWidth;
    const scaleY = availableHeight / footprintDepth;

    return Math.min(scaleX, scaleY);
  }

  /**
   * Generate program-logical floor plan geometry masks
   *
   * @param {Object} masterDNA - DNA with dimensions, rooms, floors
   * @param {Object} options - Generation options
   * @returns {Object} Complete layout with floors, metadata, and mask info
   */
  generateLayout(masterDNA, options = {}) {
    if (!masterDNA) {
      logger.warn("[ProceduralGeometry] No masterDNA provided");
      return null;
    }

    // Snap target dimensions to multiples of 16
    const floorPlanDims = {
      width: this.snapToMultipleOf16(
        options.floorPlanWidth || TARGET_DIMENSIONS.floor_plan.width,
      ),
      height: this.snapToMultipleOf16(
        options.floorPlanHeight || TARGET_DIMENSIONS.floor_plan.height,
      ),
    };
    const hero3dDims = {
      width: this.snapToMultipleOf16(
        options.hero3dWidth || TARGET_DIMENSIONS.hero_3d.width,
      ),
      height: this.snapToMultipleOf16(
        options.hero3dHeight || TARGET_DIMENSIONS.hero_3d.height,
      ),
    };

    // Extract building dimensions
    const dims = masterDNA.dimensions || {};
    const footprintWidth = dims.length || dims.width || 15;
    const footprintDepth = dims.width || dims.depth || 10;
    const floorCount = dims.floors || dims.floorCount || 2;
    const shape = this.inferShape(masterDNA);

    logger.info(
      `[ProceduralGeometry] Generating PROGRAM-LOGICAL masks for ${floorCount} floors`,
    );
    logger.info(
      `  Footprint: ${footprintWidth}m × ${footprintDepth}m (${shape})`,
    );
    logger.info(
      `  Floor plan target: ${floorPlanDims.width}×${floorPlanDims.height}px (snapped to 16)`,
    );
    logger.info(
      `  Hero 3D target: ${hero3dDims.width}×${hero3dDims.height}px (snapped to 16)`,
    );

    // Extract program spaces from DNA
    const programSpaces = this.extractProgramSpaces(masterDNA);
    logger.info(`  Program spaces: ${programSpaces.length} rooms extracted`);

    // Calculate scales
    const floorPlanScale = this.calculateScale(
      footprintWidth,
      footprintDepth,
      floorPlanDims.width,
      floorPlanDims.height,
    );
    const hero3dScale = this.calculateScale(
      footprintWidth,
      footprintDepth,
      hero3dDims.width,
      hero3dDims.height,
    );

    // Generate program-logical layout for each floor
    const floors = {};
    const floorMetadata = {};

    for (let i = 0; i < floorCount; i++) {
      // Compute room layout for this floor
      const floorLayout = this.computeFloorLayout(
        masterDNA,
        i,
        floorCount,
        footprintWidth,
        footprintDepth,
        shape,
        programSpaces,
      );

      // Generate SVG
      floors[i] = this.generateFloorSVG(
        masterDNA,
        i,
        footprintWidth,
        footprintDepth,
        shape,
        floorLayout,
        floorPlanDims.width,
        floorPlanDims.height,
        floorPlanScale,
      );
      floors[i].dataUrl = this.svgToBase64(floors[i].svgString);

      // Store metadata
      floorMetadata[i] = this.buildFloorMetadata(floorLayout, i);
    }

    // Generate hero_3d version (ground floor at larger dimensions)
    const groundLayout = this.computeFloorLayout(
      masterDNA,
      0,
      floorCount,
      footprintWidth,
      footprintDepth,
      shape,
      programSpaces,
    );
    const hero3dFloor = this.generateFloorSVG(
      masterDNA,
      0,
      footprintWidth,
      footprintDepth,
      shape,
      groundLayout,
      hero3dDims.width,
      hero3dDims.height,
      hero3dScale,
    );
    hero3dFloor.dataUrl = this.svgToBase64(hero3dFloor.svgString);

    const result = {
      floors,
      groundFloor: floors[0],
      groundFloorDataUrl: floors[0]?.dataUrl || null,
      hero3dFloor,
      hero3dDataUrl: hero3dFloor.dataUrl,
      // NEW: Per-floor metadata with room polygons, doors, circulation
      floorMetadata,
      metadata: {
        footprintWidth,
        footprintDepth,
        floorCount,
        shape,
        floorPlanDimensions: floorPlanDims,
        hero3dDimensions: hero3dDims,
        floorPlanScale,
        hero3dScale,
        programSpacesCount: programSpaces.length,
        generatedAt: new Date().toISOString(),
        version: "2.0-program-logical",
      },
    };

    logger.info(
      `[ProceduralGeometry] ✅ Generated ${floorCount} program-logical floor masks`,
    );
    logger.info(`  Floor plan scale: ${floorPlanScale.toFixed(1)} px/m`);
    logger.info(`  Hero 3D scale: ${hero3dScale.toFixed(1)} px/m`);

    return result;
  }

  // ============================================================================
  // PROGRAM SPACE EXTRACTION
  // ============================================================================

  /**
   * Extract program spaces from masterDNA
   */
  extractProgramSpaces(masterDNA) {
    const rooms = [];

    // Try multiple paths for room data
    const sources = [
      masterDNA._structured?.program?.rooms,
      masterDNA.program?.rooms,
      masterDNA.rooms,
      masterDNA.programSpaces,
    ];

    for (const source of sources) {
      if (Array.isArray(source) && source.length > 0) {
        for (const room of source) {
          rooms.push(this.normalizeRoom(room));
        }
        break;
      }
    }

    // If no rooms found:
    // - With programLock / strict mode: refuse default program generation
    // - Without: generate default program (legacy behavior)
    if (rooms.length === 0) {
      const hasProgramLock = !!(
        masterDNA.programLock ||
        masterDNA._programLock ||
        masterDNA.programSpacesLock
      );
      if (hasProgramLock) {
        logger.warn(
          "[ProceduralGeometry] No rooms extracted from DNA, but programLock is present — refusing to generate default program",
        );
        return [];
      }
      const buildingType =
        masterDNA.buildingType || masterDNA.type || "residential";
      const floorCount = masterDNA.dimensions?.floors || 2;
      return this.generateDefaultProgram(buildingType, floorCount);
    }

    return rooms;
  }

  /**
   * Normalize room data to consistent format
   */
  normalizeRoom(room) {
    const name = (room.name || room.type || "Room").toLowerCase();
    const area = room.area || room.area_m2 || room.size || 20;

    return {
      name: room.name || room.type || "Room",
      type: this.classifyRoomType(name),
      area: area,
      floor: this.normalizeFloorIndex(room.floor || room.level || 0),
      minWidth:
        room.minWidth ||
        MIN_ROOM_SIZES[this.getRoomCategory(name)]?.width ||
        2.4,
      minDepth:
        room.minDepth ||
        MIN_ROOM_SIZES[this.getRoomCategory(name)]?.depth ||
        2.7,
      requiresExteriorWall: this.requiresExteriorWall(name),
      isWetRoom: this.isWetRoom(name),
    };
  }

  /**
   * Classify room type for layout logic
   */
  classifyRoomType(name) {
    const nameLower = name.toLowerCase();

    for (const [type, keywords] of Object.entries(ROOM_TYPES)) {
      if (keywords.some((kw) => nameLower.includes(kw))) {
        return type;
      }
    }

    return "SEMI_PUBLIC"; // Default
  }

  /**
   * Get room category for minimum sizes
   */
  getRoomCategory(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes("bed")) return "bedroom";
    if (
      nameLower.includes("bath") ||
      nameLower.includes("wc") ||
      nameLower.includes("toilet")
    )
      return "bathroom";
    if (nameLower.includes("kitchen")) return "kitchen";
    if (nameLower.includes("living") || nameLower.includes("lounge"))
      return "living";
    if (nameLower.includes("dining")) return "dining";
    if (nameLower.includes("study") || nameLower.includes("office"))
      return "study";
    if (nameLower.includes("utility") || nameLower.includes("laundry"))
      return "utility";
    if (nameLower.includes("corridor") || nameLower.includes("hall"))
      return "corridor";
    return "default";
  }

  /**
   * Check if room needs exterior wall (for natural light)
   */
  requiresExteriorWall(name) {
    const nameLower = name.toLowerCase();
    const needsLight = [
      "bedroom",
      "living",
      "kitchen",
      "dining",
      "study",
      "office",
    ];
    return needsLight.some((r) => nameLower.includes(r));
  }

  /**
   * Check if room is a wet room (for vertical stacking)
   */
  isWetRoom(name) {
    const nameLower = name.toLowerCase();
    return ROOM_TYPES.WET.some((w) => nameLower.includes(w));
  }

  /**
   * Generate default program for building type
   */
  generateDefaultProgram(buildingType, floorCount) {
    const programs = {
      residential: [
        { name: "Living Room", area: 25, floor: 0 },
        { name: "Kitchen", area: 15, floor: 0 },
        { name: "Dining Room", area: 12, floor: 0 },
        { name: "WC", area: 3, floor: 0 },
        { name: "Master Bedroom", area: 18, floor: 1 },
        { name: "Bedroom 2", area: 14, floor: 1 },
        { name: "Bedroom 3", area: 12, floor: 1 },
        { name: "Bathroom", area: 6, floor: 1 },
      ],
      office: [
        { name: "Reception", area: 20, floor: 0 },
        { name: "Open Plan Office", area: 60, floor: 0 },
        { name: "Meeting Room 1", area: 15, floor: 0 },
        { name: "WC", area: 8, floor: 0 },
        { name: "Office Suite 1", area: 30, floor: 1 },
        { name: "Office Suite 2", area: 30, floor: 1 },
        { name: "Break Room", area: 15, floor: 1 },
        { name: "WC", area: 8, floor: 1 },
      ],
      healthcare: [
        { name: "Reception", area: 25, floor: 0 },
        { name: "Waiting Area", area: 30, floor: 0 },
        { name: "Consultation 1", area: 15, floor: 0 },
        { name: "Consultation 2", area: 15, floor: 0 },
        { name: "WC", area: 6, floor: 0 },
        { name: "Treatment Room", area: 20, floor: 1 },
        { name: "Staff Room", area: 15, floor: 1 },
        { name: "Storage", area: 10, floor: 1 },
      ],
    };

    const defaultProgram = programs[buildingType] || programs.residential;
    return defaultProgram.map((room) => this.normalizeRoom(room));
  }

  // ============================================================================
  // PROGRAM-LOGICAL LAYOUT COMPUTATION
  // ============================================================================

  /**
   * Compute room layout for a floor using program logic
   */
  computeFloorLayout(
    masterDNA,
    floorIndex,
    floorCount,
    width,
    depth,
    shape,
    programSpaces,
  ) {
    // Filter rooms for this floor
    let floorRooms = programSpaces.filter((r) => r.floor === floorIndex);

    // If no rooms assigned to this floor:
    // - With programLock (strict): refuse heuristic redistribution
    // - Without lock: distribute evenly (legacy behavior)
    if (floorRooms.length === 0) {
      const hasProgramLock = programSpaces.some(
        (s) => s.hard === true || s.lockedLevel !== undefined,
      );
      if (hasProgramLock) {
        // P0: Do not invent rooms for levels not in the lock
        logger.info(
          `[ProceduralGeometry] No rooms assigned to floor ${floorIndex} by programLock — skipping layout`,
        );
        return {
          rooms: [],
          circulation: null,
          stairCore: null,
          wetStack: null,
        };
      }
      const roomsPerFloor = Math.ceil(programSpaces.length / floorCount);
      const startIdx = floorIndex * roomsPerFloor;
      floorRooms = programSpaces.slice(startIdx, startIdx + roomsPerFloor);
    }

    // 1. Place stair core first (consistent across all floors)
    const stairCore = this.placeStairCore(width, depth, shape);

    // 2. Define circulation zone
    const circulation = this.defineCirculation(
      width,
      depth,
      stairCore,
      floorIndex,
    );

    // 3. Identify wet room stack position (consistent across floors)
    const wetStackPosition = this.computeWetStackPosition(
      width,
      depth,
      stairCore,
    );

    // 4. Allocate rooms to zones
    const allocatedRooms = this.allocateRoomsToZones(
      floorRooms,
      floorIndex,
      width,
      depth,
      stairCore,
      circulation,
      wetStackPosition,
    );

    // 5. Generate room polygons
    const roomPolygons = this.generateRoomPolygons(
      allocatedRooms,
      width,
      depth,
      stairCore,
      circulation,
    );

    // 6. Generate door openings
    const doors = this.generateDoorOpenings(
      roomPolygons,
      circulation,
      stairCore,
      floorIndex,
    );

    return {
      rooms: roomPolygons,
      stairCore,
      circulation,
      doors,
      wetStackPosition,
      floorIndex,
    };
  }

  /**
   * Place stair core (consistent position across floors)
   */
  placeStairCore(width, depth, shape) {
    // Position stair core at center-back by default
    const coreWidth = Math.min(STAIR_CORE.width, width * 0.25);
    const coreDepth = Math.min(STAIR_CORE.depth, depth * 0.3);

    // Center horizontally, back of building
    const x = (width - coreWidth) / 2;
    const y = 0; // Back of building (top in plan view)

    return {
      x,
      y,
      width: coreWidth,
      depth: coreDepth,
      polygon: [
        { x: x, y: y },
        { x: x + coreWidth, y: y },
        { x: x + coreWidth, y: y + coreDepth },
        { x: x, y: y + coreDepth },
      ],
    };
  }

  /**
   * Define main circulation zone
   */
  defineCirculation(width, depth, stairCore, floorIndex) {
    const corridorWidth = 1.2; // meters

    // Main corridor runs from stair core toward entrance
    const path = [];

    // Start from stair core
    const startX = stairCore.x + stairCore.width / 2;
    const startY = stairCore.y + stairCore.depth;

    // End near entrance (bottom/south)
    const endX = width / 2;
    const endY = depth - 1.5; // Near entrance

    // Simple L-shaped or straight corridor
    if (Math.abs(startX - endX) < 1) {
      // Straight corridor
      path.push({ x: startX, y: startY });
      path.push({ x: endX, y: endY });
    } else {
      // L-shaped corridor
      path.push({ x: startX, y: startY });
      path.push({ x: startX, y: (startY + endY) / 2 });
      path.push({ x: endX, y: (startY + endY) / 2 });
      path.push({ x: endX, y: endY });
    }

    return {
      path,
      width: corridorWidth,
      bbox: {
        x: Math.min(startX, endX) - corridorWidth / 2,
        y: startY,
        width: Math.abs(endX - startX) + corridorWidth,
        depth: endY - startY,
      },
    };
  }

  /**
   * Compute position for wet room stack
   */
  computeWetStackPosition(width, depth, stairCore) {
    // Place wet rooms adjacent to stair core (for plumbing efficiency)
    const wetWidth = 2.5;
    const wetDepth = 2.5;

    // Position to left of stair core
    return {
      x: stairCore.x - wetWidth - 0.3,
      y: stairCore.y,
      width: wetWidth,
      depth: wetDepth,
    };
  }

  /**
   * Allocate rooms to zones based on type
   */
  allocateRoomsToZones(
    rooms,
    floorIndex,
    width,
    depth,
    stairCore,
    circulation,
    wetStackPosition,
  ) {
    const allocated = [];

    // Separate rooms by type
    const publicRooms = rooms.filter((r) => r.type === "PUBLIC");
    const semiPublicRooms = rooms.filter((r) => r.type === "SEMI_PUBLIC");
    const wetRooms = rooms.filter((r) => r.type === "WET" || r.isWetRoom);
    const privateRooms = rooms.filter((r) => r.type === "PRIVATE");
    const serviceRooms = rooms.filter((r) => r.type === "SERVICE");

    // Ground floor: public and semi-public rooms
    if (floorIndex === 0) {
      // Public rooms near entrance (south side)
      let currentX = 0.3;
      const publicY = depth * 0.5;

      for (const room of publicRooms) {
        const roomWidth = Math.sqrt(room.area * 1.2);
        const roomDepth = room.area / roomWidth;
        allocated.push({
          ...room,
          zone: "public",
          x: currentX,
          y: publicY,
          width: roomWidth,
          depth: roomDepth,
        });
        currentX += roomWidth + 0.15;
      }

      // Semi-public rooms (kitchen, dining) - middle zone
      currentX = 0.3;
      for (const room of semiPublicRooms) {
        const roomWidth = Math.sqrt(room.area * 1.1);
        const roomDepth = room.area / roomWidth;
        allocated.push({
          ...room,
          zone: "semi-public",
          x: currentX,
          y: stairCore.y + stairCore.depth + 0.5,
          width: roomWidth,
          depth: roomDepth,
        });
        currentX += roomWidth + 0.15;
      }
    }

    // Upper floors: private rooms (bedrooms)
    if (floorIndex > 0) {
      let currentX = 0.3;
      const bedroomY = depth * 0.4;

      for (const room of privateRooms) {
        const roomWidth = Math.sqrt(room.area * 1.15);
        const roomDepth = room.area / roomWidth;
        allocated.push({
          ...room,
          zone: "private",
          x: currentX,
          y: bedroomY,
          width: roomWidth,
          depth: roomDepth,
        });
        currentX += roomWidth + 0.15;
      }
    }

    // Wet rooms: place in wet stack position (all floors)
    for (const room of wetRooms) {
      const roomWidth = Math.min(
        wetStackPosition.width,
        Math.sqrt(room.area * 0.8),
      );
      const roomDepth = room.area / roomWidth;
      allocated.push({
        ...room,
        zone: "wet-stack",
        x: wetStackPosition.x,
        y: wetStackPosition.y,
        width: roomWidth,
        depth: roomDepth,
      });
    }

    // Service rooms: near stair core
    for (const room of serviceRooms) {
      const roomWidth = Math.sqrt(room.area);
      const roomDepth = room.area / roomWidth;
      allocated.push({
        ...room,
        zone: "service",
        x: stairCore.x + stairCore.width + 0.3,
        y: stairCore.y,
        width: roomWidth,
        depth: roomDepth,
      });
    }

    return allocated;
  }

  /**
   * Generate room polygons from allocated positions
   */
  generateRoomPolygons(allocatedRooms, width, depth, stairCore, circulation) {
    const polygons = [];

    for (const room of allocatedRooms) {
      // Clamp room to building bounds
      const x = Math.max(0.15, Math.min(room.x, width - room.width - 0.15));
      const y = Math.max(0.15, Math.min(room.y, depth - room.depth - 0.15));
      const w = Math.min(room.width, width - x - 0.15);
      const d = Math.min(room.depth, depth - y - 0.15);

      polygons.push({
        name: room.name,
        type: room.type,
        zone: room.zone,
        area: room.area,
        computedArea: w * d,
        polygon: [
          { x: x, y: y },
          { x: x + w, y: y },
          { x: x + w, y: y + d },
          { x: x, y: y + d },
        ],
        bbox: { x, y, width: w, depth: d },
        centroid: { x: x + w / 2, y: y + d / 2 },
      });
    }

    return polygons;
  }

  /**
   * Generate door openings connecting rooms to circulation
   */
  generateDoorOpenings(roomPolygons, circulation, stairCore, floorIndex) {
    const doors = [];
    const doorWidth = 0.9; // meters

    // Add door for each room connecting to circulation
    for (const room of roomPolygons) {
      // Find closest point on circulation path
      const closestPoint = this.findClosestPointOnPath(
        room.centroid,
        circulation.path,
      );

      // Door position on room edge facing circulation
      const doorPos = this.computeDoorPosition(
        room.bbox,
        closestPoint,
        doorWidth,
      );

      doors.push({
        roomName: room.name,
        position: doorPos,
        width: doorWidth,
        connectsTo: "circulation",
      });
    }

    // Main entrance door (ground floor only)
    if (floorIndex === 0) {
      doors.push({
        roomName: "entrance",
        position: {
          x: stairCore.x + stairCore.width / 2,
          y: stairCore.y + stairCore.depth + 3,
        },
        width: 1.2,
        connectsTo: "exterior",
        isMainEntrance: true,
      });
    }

    // Stair core door
    doors.push({
      roomName: "stair-core",
      position: {
        x: stairCore.x + stairCore.width / 2,
        y: stairCore.y + stairCore.depth,
      },
      width: doorWidth,
      connectsTo: "circulation",
    });

    return doors;
  }

  /**
   * Find closest point on circulation path to a given point
   */
  findClosestPointOnPath(point, path) {
    if (!path || path.length === 0) return point;

    let closestPoint = path[0];
    let minDist = Infinity;

    for (let i = 0; i < path.length - 1; i++) {
      const segStart = path[i];
      const segEnd = path[i + 1];

      // Project point onto segment
      const projected = this.projectPointOnSegment(point, segStart, segEnd);
      const dist = this.distance(point, projected);

      if (dist < minDist) {
        minDist = dist;
        closestPoint = projected;
      }
    }

    return closestPoint;
  }

  /**
   * Project point onto line segment
   */
  projectPointOnSegment(point, segStart, segEnd) {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) return segStart;

    let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    return {
      x: segStart.x + t * dx,
      y: segStart.y + t * dy,
    };
  }

  /**
   * Compute door position on room edge
   */
  computeDoorPosition(roomBbox, targetPoint, doorWidth) {
    const { x, y, width, depth } = roomBbox;

    // Determine which edge is closest to target
    const edges = [
      { side: "top", pos: { x: x + width / 2, y: y } },
      { side: "bottom", pos: { x: x + width / 2, y: y + depth } },
      { side: "left", pos: { x: x, y: y + depth / 2 } },
      { side: "right", pos: { x: x + width, y: y + depth / 2 } },
    ];

    let closestEdge = edges[0];
    let minDist = Infinity;

    for (const edge of edges) {
      const dist = this.distance(edge.pos, targetPoint);
      if (dist < minDist) {
        minDist = dist;
        closestEdge = edge;
      }
    }

    return closestEdge.pos;
  }

  /**
   * Calculate distance between two points
   */
  distance(p1, p2) {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  }

  // ============================================================================
  // SVG GENERATION
  // ============================================================================

  /**
   * Generate SVG for a single floor using program-logical layout
   */
  generateFloorSVG(
    masterDNA,
    floorIndex,
    footprintWidth,
    footprintDepth,
    shape,
    floorLayout,
    targetWidth,
    targetHeight,
    scale,
  ) {
    const effectiveScale =
      scale ||
      this.calculateScale(
        footprintWidth,
        footprintDepth,
        targetWidth,
        targetHeight,
      );
    const padding = Math.min(targetWidth, targetHeight) * this.paddingRatio;

    this._currentScale = effectiveScale;
    this._currentPadding = padding;

    const scaledWidth = footprintWidth * effectiveScale;
    const scaledDepth = footprintDepth * effectiveScale;
    const offsetX = (targetWidth - scaledWidth) / 2;
    const offsetY = (targetHeight - scaledDepth) / 2;

    this._currentOffsetX = offsetX;
    this._currentOffsetY = offsetY;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">`;
    svg += `<rect width="100%" height="100%" fill="${COLORS.BACKGROUND}"/>`;

    // Draw exterior walls
    svg += this.drawExteriorWalls(footprintWidth, footprintDepth, shape);

    // Draw stair core
    if (floorLayout.stairCore) {
      svg += this.drawStairCore(floorLayout.stairCore);
    }

    // Draw circulation path
    if (floorLayout.circulation) {
      svg += this.drawCirculation(floorLayout.circulation);
    }

    // Draw room walls
    if (floorLayout.rooms) {
      svg += this.drawProgramRooms(floorLayout.rooms);
    }

    // Draw doors
    if (floorLayout.doors) {
      svg += this.drawDoorOpenings(floorLayout.doors, floorIndex);
    }

    // Draw windows
    svg += this.drawWindows(
      masterDNA,
      floorIndex,
      footprintWidth,
      footprintDepth,
    );

    svg += "</svg>";

    return {
      svgString: svg,
      width: targetWidth,
      height: targetHeight,
      floorIndex,
      scale: effectiveScale,
    };
  }

  /**
   * Draw exterior walls
   */
  drawExteriorWalls(width, depth, shape) {
    const scale = this._currentScale;
    const offsetX = this._currentOffsetX;
    const offsetY = this._currentOffsetY;
    const w = width * scale;
    const d = depth * scale;

    let svg = "";

    if (shape === "L-shape") {
      const notchW = w * 0.4;
      const notchD = d * 0.4;
      const points = [
        `${offsetX},${offsetY}`,
        `${offsetX + w - notchW},${offsetY}`,
        `${offsetX + w - notchW},${offsetY + notchD}`,
        `${offsetX + w},${offsetY + notchD}`,
        `${offsetX + w},${offsetY + d}`,
        `${offsetX},${offsetY + d}`,
      ].join(" ");
      svg += `<polygon points="${points}" fill="none" stroke="${COLORS.EXTERIOR_WALL}" stroke-width="${STROKE_WIDTHS.EXTERIOR_WALL}" stroke-linejoin="miter"/>`;
    } else {
      svg += `<rect x="${offsetX}" y="${offsetY}" width="${w}" height="${d}" fill="none" stroke="${COLORS.EXTERIOR_WALL}" stroke-width="${STROKE_WIDTHS.EXTERIOR_WALL}"/>`;
    }

    return svg;
  }

  /**
   * Draw stair core
   */
  drawStairCore(stairCore) {
    const scale = this._currentScale;
    const offsetX = this._currentOffsetX;
    const offsetY = this._currentOffsetY;

    const x = offsetX + stairCore.x * scale;
    const y = offsetY + stairCore.y * scale;
    const w = stairCore.width * scale;
    const d = stairCore.depth * scale;

    let svg = "";

    // Stair core outline
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${d}" fill="none" stroke="${COLORS.STAIR_CORE}" stroke-width="${STROKE_WIDTHS.STAIR_CORE}"/>`;

    // Stair treads (simplified)
    const treadCount = 6;
    const treadDepth = d / treadCount;
    for (let i = 1; i < treadCount; i++) {
      const ty = y + i * treadDepth;
      svg += `<line x1="${x}" y1="${ty}" x2="${x + w}" y2="${ty}" stroke="${COLORS.STAIR_CORE}" stroke-width="1"/>`;
    }

    return svg;
  }

  /**
   * Draw circulation path
   */
  drawCirculation(circulation) {
    const scale = this._currentScale;
    const offsetX = this._currentOffsetX;
    const offsetY = this._currentOffsetY;

    if (!circulation.path || circulation.path.length < 2) return "";

    const pathPoints = circulation.path
      .map((p) => `${offsetX + p.x * scale},${offsetY + p.y * scale}`)
      .join(" ");

    return `<polyline points="${pathPoints}" fill="none" stroke="${COLORS.CIRCULATION}" stroke-width="${STROKE_WIDTHS.CIRCULATION}" stroke-dasharray="8,4"/>`;
  }

  /**
   * Draw program rooms
   */
  drawProgramRooms(rooms) {
    const scale = this._currentScale;
    const offsetX = this._currentOffsetX;
    const offsetY = this._currentOffsetY;

    let svg = "";

    for (const room of rooms) {
      const points = room.polygon
        .map((p) => `${offsetX + p.x * scale},${offsetY + p.y * scale}`)
        .join(" ");

      svg += `<polygon points="${points}" fill="none" stroke="${COLORS.INTERIOR_WALL}" stroke-width="${STROKE_WIDTHS.INTERIOR_WALL}"/>`;

      // Room label (optional, small text)
      const cx = offsetX + room.centroid.x * scale;
      const cy = offsetY + room.centroid.y * scale;
      svg += `<text x="${cx}" y="${cy}" fill="${COLORS.ROOM_LABEL}" font-size="10" text-anchor="middle" dominant-baseline="middle">${room.name.substring(0, 8)}</text>`;
    }

    return svg;
  }

  /**
   * Draw door openings
   */
  drawDoorOpenings(doors, floorIndex) {
    const scale = this._currentScale;
    const offsetX = this._currentOffsetX;
    const offsetY = this._currentOffsetY;

    let svg = "";

    for (const door of doors) {
      const x = offsetX + door.position.x * scale;
      const y = offsetY + door.position.y * scale;
      const w = door.width * scale;

      if (door.isMainEntrance) {
        // Main entrance - larger door with arc
        svg += `<rect x="${x - w / 2}" y="${y - 5}" width="${w}" height="10" fill="${COLORS.DOOR}"/>`;
        svg += `<path d="M ${x - w / 2} ${y} A ${w} ${w} 0 0 1 ${x + w / 2} ${y}" fill="none" stroke="${COLORS.INTERIOR_WALL}" stroke-width="1" stroke-dasharray="3,3"/>`;
      } else {
        // Interior door
        svg += `<rect x="${x - w / 2}" y="${y - 3}" width="${w}" height="6" fill="${COLORS.DOOR}"/>`;
      }
    }

    return svg;
  }

  /**
   * Draw windows
   */
  drawWindows(masterDNA, floorIndex, width, depth) {
    const scale = this._currentScale;
    const offsetX = this._currentOffsetX;
    const offsetY = this._currentOffsetY;
    const w = width * scale;
    const d = depth * scale;

    let svg = "";

    const windowsPerWall = Math.max(2, Math.min(5, Math.ceil(width / 3)));
    const windowWidth = 30;
    const windowHeight = 40;

    // North wall
    svg += this.drawWallWindows(
      offsetX + w * 0.15,
      offsetY - STROKE_WIDTHS.EXTERIOR_WALL / 2,
      w * 0.7,
      windowsPerWall,
      windowWidth,
      windowHeight,
      "horizontal",
    );

    // South wall
    svg += this.drawWallWindows(
      offsetX + w * 0.15,
      offsetY + d - STROKE_WIDTHS.EXTERIOR_WALL / 2 - windowHeight,
      w * 0.7,
      windowsPerWall,
      windowWidth,
      windowHeight,
      "horizontal",
    );

    // East wall
    const eastWindowCount = Math.max(1, Math.ceil(depth / 4));
    svg += this.drawWallWindows(
      offsetX + w - STROKE_WIDTHS.EXTERIOR_WALL / 2 - windowWidth,
      offsetY + d * 0.2,
      d * 0.6,
      eastWindowCount,
      windowWidth,
      windowHeight,
      "vertical",
    );

    // West wall
    svg += this.drawWallWindows(
      offsetX - STROKE_WIDTHS.EXTERIOR_WALL / 2,
      offsetY + d * 0.2,
      d * 0.6,
      eastWindowCount,
      windowWidth,
      windowHeight,
      "vertical",
    );

    return svg;
  }

  /**
   * Draw windows along a wall
   */
  drawWallWindows(
    startX,
    startY,
    availableLength,
    count,
    windowWidth,
    windowHeight,
    orientation,
  ) {
    let svg = "";
    const spacing = availableLength / (count + 1);

    for (let i = 1; i <= count; i++) {
      let x, y;
      if (orientation === "horizontal") {
        x = startX + spacing * i - windowWidth / 2;
        y = startY;
      } else {
        x = startX;
        y = startY + spacing * i - windowHeight / 2;
      }
      svg += `<rect x="${x}" y="${y}" width="${windowWidth}" height="${windowHeight}" fill="none" stroke="${COLORS.WINDOW}" stroke-width="${STROKE_WIDTHS.WINDOW}"/>`;
    }

    return svg;
  }

  // ============================================================================
  // METADATA GENERATION
  // ============================================================================

  /**
   * Build floor metadata object for debugging and validation
   */
  buildFloorMetadata(floorLayout, floorIndex) {
    const metadata = {
      floorIndex,
      stairCore: floorLayout.stairCore
        ? {
            bbox: {
              x: floorLayout.stairCore.x,
              y: floorLayout.stairCore.y,
              width: floorLayout.stairCore.width,
              depth: floorLayout.stairCore.depth,
            },
            area: floorLayout.stairCore.width * floorLayout.stairCore.depth,
          }
        : null,
      circulation: floorLayout.circulation
        ? {
            path: floorLayout.circulation.path,
            corridorWidth: floorLayout.circulation.width,
            bbox: floorLayout.circulation.bbox,
          }
        : null,
      rooms: floorLayout.rooms.map((room) => ({
        name: room.name,
        type: room.type,
        zone: room.zone,
        bbox: room.bbox,
        polygon: room.polygon,
        area: room.area,
        computedArea: room.computedArea,
        centroid: room.centroid,
      })),
      doors: floorLayout.doors.map((door) => ({
        roomName: door.roomName,
        position: door.position,
        width: door.width,
        connectsTo: door.connectsTo,
        isMainEntrance: door.isMainEntrance || false,
      })),
      wetStackPosition: floorLayout.wetStackPosition,
      totalArea: floorLayout.rooms.reduce(
        (sum, r) => sum + (r.computedArea || 0),
        0,
      ),
      roomCount: floorLayout.rooms.length,
    };

    return metadata;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Infer building shape from DNA
   */
  inferShape(masterDNA) {
    const geometryRules =
      masterDNA._structured?.geometry_rules || masterDNA.geometry_rules || {};
    const massing = geometryRules.massing || masterDNA.massing;

    if (massing && typeof massing === "string") {
      const massingLower = massing.toLowerCase();
      if (massingLower.includes("l-shape") || massingLower.includes("l shape"))
        return "L-shape";
      if (massingLower.includes("u-shape") || massingLower.includes("u shape"))
        return "U-shape";
      if (massingLower.includes("courtyard")) return "courtyard";
    }

    const dims = masterDNA.dimensions || {};
    const length = dims.length || 15;
    const width = dims.width || 10;
    if (length / width > 2.5) return "elongated";

    return "rectangular";
  }

  /**
   * Normalize floor index
   */
  normalizeFloorIndex(floor) {
    if (typeof floor === "number") return floor;
    const floorStr = String(floor).toLowerCase();
    if (floorStr.includes("ground") || floorStr === "0") return 0;
    if (floorStr.includes("first") || floorStr === "1") return 1;
    if (floorStr.includes("second") || floorStr === "2") return 2;
    if (floorStr.includes("third") || floorStr === "3") return 3;
    return parseInt(floor) || 0;
  }

  /**
   * Convert SVG string to base64 data URL
   */
  svgToBase64(svgString) {
    if (!svgString) return null;

    if (typeof window !== "undefined" && typeof btoa === "function") {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
    }

    if (typeof Buffer !== "undefined") {
      return `data:image/svg+xml;base64,${Buffer.from(svgString).toString("base64")}`;
    }

    return `data:image/svg+xml,${encodeURIComponent(svgString)}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createProceduralGeometryService(options = {}) {
  return new ProceduralGeometryService(options);
}

export function generateGeometryMasks(masterDNA, options = {}) {
  const service = new ProceduralGeometryService(options);
  return service.generateLayout(masterDNA, options);
}

export { TARGET_DIMENSIONS, COLORS, STROKE_WIDTHS, ROOM_TYPES };

export default ProceduralGeometryService;
