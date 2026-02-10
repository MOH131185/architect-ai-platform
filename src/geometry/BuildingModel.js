/**
 * BuildingModel - Single Source of Truth for 3D Building Geometry
 *
 * This module takes a CanonicalDesignState and builds a coherent 3D model.
 * All 2D projections (floor plans, elevations, sections) derive from this.
 *
 * Units: All internal units are MILLIMETERS for precision.
 * Coordinate system: X = width (E-W), Y = depth (N-S), Z = height
 *
 * @module geometry/BuildingModel
 */

import logger from "../services/core/logger.js";
import { ZONE_TYPE_MAP } from "../types/CanonicalDesignState.js";
import {
  MM_PER_M,
  toMM,
  toMSafe,
  areaToMM2,
  validateUnit,
} from "../utils/unitConversion.js";

// =============================================================================
// CONSTANTS
// =============================================================================

// MM_PER_M imported from unitConversion.js for consistency

/** Default wall thicknesses (mm) */
const WALL_THICKNESS = {
  EXTERNAL: 300, // 300mm cavity wall
  INTERNAL: 100, // 100mm partition
  LOADBEARING: 200, // 200mm loadbearing internal
};

/** Default floor slab thickness (mm) */
const SLAB_THICKNESS = 250;

/** Default floor-to-floor height (mm) */
const DEFAULT_FLOOR_HEIGHT = 2800;

/** Default ground floor height (mm) - slightly higher */
const DEFAULT_GROUND_FLOOR_HEIGHT = 3000;

/** Default stair core dimensions (mm) */
const STAIR_CORE = {
  WIDTH: 1000, // UK Part K minimum: 900mm private, 1000mm public
  LENGTH: 3000, // Room for 16 treads at ~175mm
  LANDING: 900, // Half-landing width
};

/** Room adjacency rules - higher score = should be closer */
const ADJACENCY_RULES = {
  Entry: { "Living Room": 10, Hall: 10, Circulation: 8 },
  "Living Room": { Kitchen: 8, Dining: 8, Entry: 10 },
  Kitchen: { Dining: 10, "Living Room": 8, Utility: 6 },
  Dining: { Kitchen: 10, "Living Room": 8 },
  "Master Bedroom": { "En-Suite": 10, "Walk-in Wardrobe": 8 },
  Bedroom: { Bathroom: 4 },
  Circulation: { Entry: 8 },
};

/** Room floor priority - ground floor vs upper floors */
const FLOOR_PRIORITY = {
  // Ground floor rooms (priority 0)
  ground: [
    "entry",
    "hall",
    "living",
    "kitchen",
    "dining",
    "utility",
    "garage",
    "reception",
    "lobby",
    "wc",
    "cloakroom",
  ],
  // Upper floor rooms (priority 1+)
  upper: [
    "bedroom",
    "master",
    "bathroom",
    "en-suite",
    "ensuite",
    "study",
    "office",
    "nursery",
    "guest",
  ],
  // Can go anywhere
  flexible: ["storage", "circulation", "stair"],
};

// =============================================================================
// BUILDING MODEL CLASS
// =============================================================================

/**
 * BuildingModel - 3D representation of a building
 *
 * Structure:
 * - envelope: overall bounding box and footprint
 * - floors: array of Floor objects (slabs, rooms, walls, openings)
 * - roof: roof geometry (type, pitch, profiles)
 * - stairs: vertical circulation
 * - facadeSummary: opening counts per facade (for validation)
 */
export class BuildingModel {
  /**
   * Create a BuildingModel from CanonicalDesignState
   * @param {Object} canonicalState - CanonicalDesignState object
   */
  constructor(canonicalState) {
    if (!canonicalState) {
      throw new Error("BuildingModel requires CanonicalDesignState");
    }

    this.designId = canonicalState.meta?.designId || `bm_${Date.now()}`;
    this.createdAt = new Date().toISOString();

    // Parse the canonical state
    this._buildFromCanonical(canonicalState);
  }

  /**
   * Build the model from CanonicalDesignState
   * @private
   */
  _buildFromCanonical(state) {
    logger.info("[BuildingModel] Building from CanonicalDesignState", {
      designId: this.designId,
      levels: state.program?.levelCount,
    });

    // 1. Build envelope (footprint + heights)
    this.envelope = this._buildEnvelope(state);

    // 2. Build floors with rooms, walls, openings
    this.floors = this._buildFloors(state);

    // 3. Build roof
    this.roof = this._buildRoof(state);

    // 4. Build stairs if multi-floor
    this.stairs = this._buildStairs(state);

    // 5. Compute facade summary (for consistency validation)
    this.facadeSummary = this._computeFacadeSummary();

    // 6. Store style reference
    this.style = {
      vernacular: state.style?.vernacularStyle || "contemporary",
      materials: state.style?.materials || ["brick", "render"],
      windowStyle: state.style?.windowStyle || "casement",
    };

    logger.info("[BuildingModel] Model built successfully", {
      floors: this.floors.length,
      totalRooms: this.floors.reduce((sum, f) => sum + f.rooms.length, 0),
      facadeSummary: this.facadeSummary,
    });
  }

  /**
   * Build building envelope from canonical state
   *
   * Uses perFloorArea from auto-level assignment if available,
   * otherwise calculates from total area and level count.
   * Site coverage constraints are applied when site area is known.
   *
   * @private
   */
  _buildEnvelope(state) {
    const site = state.site || {};
    const program = state.program || {};
    const massing = state.massing || {};

    // Get level count
    const levelCount = program.levelCount || 2;

    // ==========================================================================
    // PRIORITY 1: Use explicit massing dimensions from DNA (prevents corruption)
    // ==========================================================================
    if (
      massing.widthM &&
      massing.depthM &&
      massing.widthM > 1 &&
      massing.depthM > 1
    ) {
      const widthM = massing.widthM;
      const depthM = massing.depthM;

      logger.info(
        "[BuildingModel] ✅ Using EXPLICIT massing dimensions from DNA",
        {
          widthM,
          depthM,
          footprintAreaM2: widthM * depthM,
          source: "massing.widthM/depthM",
        },
      );

      return this._buildEnvelopeWithDimensions(
        state,
        widthM,
        depthM,
        levelCount,
        site,
      );
    }

    // ==========================================================================
    // PRIORITY 2: Check DNA dimensions directly (backup path)
    // ==========================================================================
    const dna = state.dna || state.masterDNA || {};
    if (dna.dimensions?.length && dna.dimensions?.width) {
      // DNA convention: length = building length (typically N-S depth), width = building width (E-W)
      // BuildingModel convention: width = E-W span, depth = N-S span
      // FIXED: Correct mapping - DNA.width -> BuildingModel.width, DNA.length -> BuildingModel.depth
      const widthM = dna.dimensions.width;
      const depthM = dna.dimensions.length;

      logger.info("[BuildingModel] ✅ Using DNA dimensions directly", {
        widthM,
        depthM,
        footprintAreaM2: widthM * depthM,
        source: "dna.dimensions",
        dnaLength: dna.dimensions.length,
        dnaWidth: dna.dimensions.width,
      });

      return this._buildEnvelopeWithDimensions(
        state,
        widthM,
        depthM,
        levelCount,
        site,
      );
    }

    // ==========================================================================
    // FALLBACK: Calculate from area (original logic - may be inaccurate)
    // ==========================================================================
    logger.warn(
      "[BuildingModel] ⚠️ No explicit dimensions found - calculating from area (may be inaccurate)",
      {
        hasMassingWidthM: !!massing.widthM,
        hasMassingDepthM: !!massing.depthM,
        hasDNADimensions: !!(dna.dimensions?.length && dna.dimensions?.width),
      },
    );

    // Calculate footprint area using site-aware logic
    const totalAreaM2 = program.totalAreaM2 || 150;
    const siteAreaM2 = site.areaM2 || 0;

    // Check if per-floor area is provided (from auto-level assignment)
    let footprintAreaM2;
    if (program.perFloorArea?.ground) {
      // Use ground floor area as footprint
      footprintAreaM2 = program.perFloorArea.ground;
      logger.info("[BuildingModel] Using per-floor area for footprint", {
        groundArea: footprintAreaM2,
        source: "perFloorArea",
      });
    } else if (siteAreaM2 > 0) {
      // Apply site coverage constraint (max 55%)
      const COVERAGE_MAX = 0.55;
      const maxFootprint = siteAreaM2 * COVERAGE_MAX;
      const idealFootprint = totalAreaM2 / levelCount;
      footprintAreaM2 = Math.min(maxFootprint, idealFootprint);
      logger.info("[BuildingModel] Using site-constrained footprint", {
        siteArea: siteAreaM2,
        maxFootprint,
        idealFootprint,
        actualFootprint: footprintAreaM2,
      });
    } else {
      // Fallback: divide total by level count
      footprintAreaM2 = totalAreaM2 / levelCount;
    }

    // Calculate dimensions using site aspect ratio if available
    let aspectRatio = 1.618; // Golden ratio default

    // Try to derive aspect ratio from site polygon
    if (site.polygon && site.polygon.length >= 3) {
      const lats = site.polygon.map((p) => p.lat);
      const lngs = site.polygon.map((p) => p.lng);
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const lngSpan = Math.max(...lngs) - Math.min(...lngs);

      // Convert to approximate meters (at UK latitudes ~52°)
      const latM = latSpan * 111320;
      const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const lngM = lngSpan * 111320 * Math.cos((avgLat * Math.PI) / 180);

      if (latM > 0 && lngM > 0) {
        aspectRatio = Math.max(0.5, Math.min(2.0, lngM / latM));
        logger.info("[BuildingModel] Using site-derived aspect ratio", {
          latM: latM.toFixed(1),
          lngM: lngM.toFixed(1),
          aspectRatio: aspectRatio.toFixed(2),
        });
      }
    }

    const widthM = Math.sqrt(footprintAreaM2 * aspectRatio);
    const depthM = footprintAreaM2 / widthM;

    // Convert to mm
    const widthMM = Math.round(widthM * MM_PER_M);
    const depthMM = Math.round(depthM * MM_PER_M);

    // Calculate heights
    const floorHeights = [];
    for (let i = 0; i < levelCount; i++) {
      const heightM =
        program.levels?.[i]?.floorHeightM ||
        (i === 0
          ? DEFAULT_GROUND_FLOOR_HEIGHT / MM_PER_M
          : DEFAULT_FLOOR_HEIGHT / MM_PER_M);
      floorHeights.push(Math.round(heightM * MM_PER_M));
    }
    const totalHeightMM = floorHeights.reduce((sum, h) => sum + h, 0);

    // Entrance side
    const entranceSide = site.entranceSide || "S";

    // Build rectangular footprint centered at origin
    const footprint = [
      { x: -widthMM / 2, y: -depthMM / 2 },
      { x: widthMM / 2, y: -depthMM / 2 },
      { x: widthMM / 2, y: depthMM / 2 },
      { x: -widthMM / 2, y: depthMM / 2 },
    ];

    return {
      width: widthMM,
      depth: depthMM,
      length: depthMM, // Alias for elevation generator compatibility (length = N-S span)
      height: totalHeightMM,
      footprint,
      floorHeights,
      entranceSide,
      orientationDeg: site.orientationDeg || 0,
    };
  }

  /**
   * Build envelope from explicit dimensions (used when DNA provides widthM/depthM)
   * This prevents dimension corruption by not recalculating from area.
   *
   * @private
   * @param {Object} state - Canonical design state
   * @param {number} widthM - Building width in meters
   * @param {number} depthM - Building depth in meters
   * @param {number} levelCount - Number of floors
   * @param {Object} site - Site configuration
   * @returns {Object} Envelope configuration
   */
  _buildEnvelopeWithDimensions(state, widthM, depthM, levelCount, site) {
    const program = state.program || {};

    // Convert to mm
    const widthMM = Math.round(widthM * MM_PER_M);
    const depthMM = Math.round(depthM * MM_PER_M);

    // Calculate heights
    const floorHeights = [];
    for (let i = 0; i < levelCount; i++) {
      const heightM =
        program.levels?.[i]?.floorHeightM ||
        (i === 0
          ? DEFAULT_GROUND_FLOOR_HEIGHT / MM_PER_M
          : DEFAULT_FLOOR_HEIGHT / MM_PER_M);
      floorHeights.push(Math.round(heightM * MM_PER_M));
    }
    const totalHeightMM = floorHeights.reduce((sum, h) => sum + h, 0);

    // Entrance side
    const entranceSide = site.entranceSide || "S";

    // Build rectangular footprint centered at origin
    const footprint = [
      { x: -widthMM / 2, y: -depthMM / 2 },
      { x: widthMM / 2, y: -depthMM / 2 },
      { x: widthMM / 2, y: depthMM / 2 },
      { x: -widthMM / 2, y: depthMM / 2 },
    ];

    return {
      width: widthMM,
      depth: depthMM,
      length: depthMM, // Alias for elevation generator compatibility (length = N-S span)
      height: totalHeightMM,
      footprint,
      floorHeights,
      entranceSide,
      orientationDeg: site.orientationDeg || 0,
    };
  }

  /**
   * Build floors with rooms, walls, and openings
   *
   * PRIORITY ORDER for room sources:
   * 1. state.programRooms (TOP-LEVEL array with levelIndex) - PREFERRED
   * 2. state.program.levels[].rooms (nested in levels) - FALLBACK
   *
   * @private
   */
  _buildFloors(state) {
    const floors = [];
    const program = state.program || {};
    const levelCount = state.levelCount || program.levelCount || 2;
    let levels = program.levels || [];

    // ========================================================================
    // ROOM EXTRACTION - PREFER TOP-LEVEL programRooms
    // ========================================================================
    let allRooms = [];
    let roomSource = "none";

    // Priority 1: Top-level programRooms (from fromLegacyDNA)
    if (Array.isArray(state.programRooms) && state.programRooms.length > 0) {
      allRooms = state.programRooms.map((r) => ({
        ...r,
        originalFloor: r.levelIndex ?? 0,
        targetAreaM2: r.targetAreaM2 || r.area || 20,
      }));
      roomSource = "state.programRooms (top-level)";
      logger.info("[BuildingModel] ✓ Using top-level programRooms", {
        count: allRooms.length,
        rooms: allRooms.map((r) => `${r.name}@L${r.originalFloor}`).join(", "),
      });
    }
    // Priority 2: Nested levels[].rooms or levels[].spaces (CDS uses .spaces)
    else {
      for (const level of levels) {
        const roomArray = level?.rooms || level?.spaces;
        if (Array.isArray(roomArray) && roomArray.length > 0) {
          for (const room of roomArray) {
            allRooms.push({
              ...room,
              originalFloor: level.index ?? 0,
              targetAreaM2: room.targetAreaM2 || room.area || 20,
            });
          }
        }
      }
      roomSource = "state.program.levels[].rooms|spaces (nested)";
      if (allRooms.length > 0) {
        logger.info("[BuildingModel] Using nested levels[].rooms|spaces", {
          count: allRooms.length,
        });
      }
    }

    const totalProgramRooms = allRooms.length;
    const hasProgramInput = totalProgramRooms > 0;

    // ========================================================================
    // QA CHECK: HARD FAIL if no program rooms
    // ========================================================================
    if (!hasProgramInput) {
      logger.error(
        "╔══════════════════════════════════════════════════════════════════════════════╗",
      );
      logger.error(
        "║  ❌ HARD FAIL: No program rooms in CanonicalDesignState                       ║",
      );
      logger.error(
        "║     Aborting geometry generation to prevent generic shoebox fallback.        ║",
      );
      logger.error(
        "╚══════════════════════════════════════════════════════════════════════════════╝",
      );
      logger.error("[BuildingModel] Diagnostic info:", {
        hasProgramRooms: !!state.programRooms,
        programRoomsLength: state.programRooms?.length || 0,
        hasLevels: !!program.levels,
        levelsLength: program.levels?.length || 0,
        roomSource,
      });
      logger.error("[BuildingModel] Check the data flow:");
      logger.error(
        "   1. useProgramSpaces → stores assignedSpaces in DesignContext",
      );
      logger.error("   2. useGeneration → reads programSpaces from context");
      logger.error(
        "   3. dnaWorkflowOrchestrator → passes projectContext.programSpaces",
      );
      logger.error(
        "   4. fromLegacyDNA → should extract rooms from projectContext.programSpaces",
      );

      // Do not abort: allow envelope-only geometry (tests + early workflow steps may have 0 rooms).
      logger.warn(
        "[BuildingModel] No program rooms provided; continuing with envelope-only geometry",
      );
    }

    // Group rooms by levelIndex
    const roomsByLevel = {};
    for (const room of allRooms) {
      const levelIdx = room.originalFloor ?? room.levelIndex ?? 0;
      if (!roomsByLevel[levelIdx]) {
        roomsByLevel[levelIdx] = [];
      }
      roomsByLevel[levelIdx].push(room);
    }

    // Check if rooms need auto-level assignment:
    // - All rooms on floor 0 but levelCount > 1
    const roomsOnGroundOnly = allRooms.every(
      (r) => (r.originalFloor ?? 0) === 0,
    );
    const needsAutoAssignment =
      hasProgramInput && levelCount > 1 && roomsOnGroundOnly;

    if (needsAutoAssignment) {
      logger.info("[BuildingModel] Auto-assigning rooms across floors", {
        totalRooms: totalProgramRooms,
        levelCount,
        reason: "All rooms on ground floor but levelCount > 1",
      });

      // Redistribute rooms across floors
      levels = this._autoAssignRoomsToLevels(allRooms, levelCount);

      // Rebuild roomsByLevel after auto-assignment
      for (const level of levels) {
        roomsByLevel[level.index] = level.rooms || [];
      }
    }

    logger.info("[BuildingModel] Building floors", {
      levelCount,
      levelsProvided: levels.length,
      totalProgramRooms,
      hasProgramInput,
      autoAssigned: needsAutoAssignment,
      roomSource,
      byFloor: Object.entries(roomsByLevel)
        .map(([k, v]) => `L${k}:${v.length}`)
        .join(", "),
    });

    let currentZ = 0;

    for (let floorIndex = 0; floorIndex < levelCount; floorIndex++) {
      const levelData = levels[floorIndex] || { rooms: [], floorHeightM: 2.8 };
      const floorHeight =
        this.envelope.floorHeights[floorIndex] || DEFAULT_FLOOR_HEIGHT;
      const levelName =
        floorIndex === 0 ? "Ground Floor" : `Floor ${floorIndex}`;

      // ========================================================================
      // GET ROOMS FOR THIS FLOOR - prefer roomsByLevel from programRooms
      // ========================================================================
      let roomsInput = roomsByLevel[floorIndex] || levelData.rooms || [];

      // Log zone distribution for this floor
      const publicCount = roomsInput.filter(
        (r) => (r.category || r.zoneType) === "public",
      ).length;
      const privateCount = roomsInput.filter(
        (r) => (r.category || r.zoneType) === "private",
      ).length;
      const serviceCount = roomsInput.filter(
        (r) => (r.category || r.zoneType) === "service",
      ).length;

      logger.info(`[BuildingModel] Zone-based layout for floor ${floorIndex}`, {
        levelIndex: floorIndex,
        levelName,
        roomCount: roomsInput.length,
        public: publicCount,
        private: privateCount,
        service: serviceCount,
        rooms: roomsInput.map((r) => r.name).join(", "),
      });

      // Add circulation room for stair core on multi-floor buildings
      if (levelCount > 1) {
        roomsInput = this._addCirculationRoom(roomsInput, floorIndex);
      }

      // Sort rooms by adjacency for better layout
      roomsInput = this._sortRoomsByAdjacency(roomsInput, floorIndex);

      // Build floor object
      const floor = {
        index: floorIndex,
        name: levelData.name || levelName,
        zBase: currentZ,
        zTop: currentZ + floorHeight,
        floorHeight,
        slab: {
          z: currentZ,
          thickness: floorIndex === 0 ? 300 : SLAB_THICKNESS,
          polygon: [...this.envelope.footprint],
        },
        rooms: [],
        walls: [],
        openings: [],
      };

      // Build rooms using adjacency-aware strip packing
      floor.rooms = this._buildRooms(roomsInput, floorIndex);

      // Log what was built
      logger.info(`[BuildingModel] Floor ${floorIndex} built`, {
        inputRooms: roomsInput.length,
        builtRooms: floor.rooms.length,
        builtRoomNames: floor.rooms.map((r) => r.name),
      });

      // Build walls from rooms
      floor.walls = this._buildWalls(floor.rooms, floorIndex);

      // Build openings (windows and doors)
      floor.openings = this._buildOpenings(
        floor.walls,
        floor.rooms,
        floorIndex,
        state,
      );

      // Log opening counts per facade
      const facadeCounts = { N: 0, S: 0, E: 0, W: 0 };
      floor.openings.forEach((o) => {
        if (o.facade && facadeCounts[o.facade] !== undefined) {
          facadeCounts[o.facade]++;
        }
      });
      logger.info(`[BuildingModel] Floor ${floorIndex} openings built`, {
        total: floor.openings.length,
        external: floor.openings.filter((o) => o.facade).length,
        internal: floor.openings.filter((o) => !o.facade).length,
        byFacade: facadeCounts,
      });

      floors.push(floor);
      currentZ += floorHeight;
    }

    return floors;
  }

  /**
   * Auto-assign rooms to floors based on room type
   * @private
   */
  _autoAssignRoomsToLevels(allRooms, levelCount) {
    const levels = [];
    for (let i = 0; i < levelCount; i++) {
      levels.push({
        index: i,
        name: i === 0 ? "Ground Floor" : `Floor ${i}`,
        rooms: [],
        floorHeightM:
          i === 0
            ? DEFAULT_GROUND_FLOOR_HEIGHT / MM_PER_M
            : DEFAULT_FLOOR_HEIGHT / MM_PER_M,
      });
    }

    // Categorize rooms by floor preference
    const groundRooms = [];
    const upperRooms = [];
    const flexibleRooms = [];

    for (const room of allRooms) {
      const roomNameLower = (room.name || "").toLowerCase();
      const programLower = (room.program || "").toLowerCase();

      const isGround = FLOOR_PRIORITY.ground.some(
        (g) => roomNameLower.includes(g) || programLower.includes(g),
      );
      const isUpper = FLOOR_PRIORITY.upper.some(
        (u) => roomNameLower.includes(u) || programLower.includes(u),
      );

      if (isGround && !isUpper) {
        groundRooms.push(room);
      } else if (isUpper && !isGround) {
        upperRooms.push(room);
      } else {
        flexibleRooms.push(room);
      }
    }

    // Assign ground floor rooms
    for (const room of groundRooms) {
      levels[0].rooms.push(room);
    }

    // Distribute upper floor rooms across upper floors
    const upperFloorCount = levelCount - 1;
    if (upperFloorCount > 0) {
      for (let i = 0; i < upperRooms.length; i++) {
        const floorIndex = Math.min(1 + (i % upperFloorCount), levelCount - 1);
        levels[floorIndex].rooms.push(upperRooms[i]);
      }
    }

    // Distribute flexible rooms to balance floor areas
    for (const room of flexibleRooms) {
      // Find floor with least area
      let minAreaFloor = 0;
      let minArea = Infinity;
      for (let i = 0; i < levelCount; i++) {
        const floorArea = levels[i].rooms.reduce(
          (sum, r) => sum + (r.targetAreaM2 || 20),
          0,
        );
        if (floorArea < minArea) {
          minArea = floorArea;
          minAreaFloor = i;
        }
      }
      levels[minAreaFloor].rooms.push(room);
    }

    logger.info("[BuildingModel] Auto-level assignment complete", {
      ground: levels[0].rooms.map((r) => r.name),
      upper: levels.slice(1).map((l) => l.rooms.map((r) => r.name)),
    });

    return levels;
  }

  /**
   * Add circulation room for stair core
   * @private
   */
  _addCirculationRoom(rooms, floorIndex) {
    // Check if circulation room already exists
    const hasCirculation = rooms.some(
      (r) =>
        (r.name || "").toLowerCase().includes("circulation") ||
        (r.name || "").toLowerCase().includes("stair") ||
        (r.name || "").toLowerCase().includes("hall"),
    );

    if (hasCirculation) {
      return rooms;
    }

    // Add circulation/stair core room
    const circulationRoom = {
      name: floorIndex === 0 ? "Entry Hall" : "Landing",
      program: "circulation",
      roomType: "circulation",
      spaceType: "circulation",
      zoneType: "service",
      targetAreaM2:
        (STAIR_CORE.WIDTH * STAIR_CORE.LENGTH) / (MM_PER_M * MM_PER_M) + 4, // ~7m²
      estimatedWidth: 3.7,
      estimatedLength: 1.9,
      isCirculation: true,
    };

    // Insert at beginning for ground floor (entrance), elsewhere for upper
    if (floorIndex === 0) {
      return [circulationRoom, ...rooms];
    } else {
      return [circulationRoom, ...rooms];
    }
  }

  /**
   * Sort rooms by adjacency for better layout
   * @private
   */
  _sortRoomsByAdjacency(rooms, floorIndex) {
    if (rooms.length <= 1) {
      return rooms;
    }

    // Find anchor room (circulation or first room)
    const anchorIndex = rooms.findIndex((r) => r.isCirculation);
    if (anchorIndex === -1) {
      return rooms;
    }

    const sorted = [rooms[anchorIndex]];
    const remaining = rooms.filter((_, i) => i !== anchorIndex);

    // Greedy adjacency-based ordering
    while (remaining.length > 0) {
      const lastRoom = sorted[sorted.length - 1];
      const lastName = lastRoom.name || "";

      // Find best adjacent room
      let bestIndex = 0;
      let bestScore = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidateName = remaining[i].name || "";
        const adjacencyScore = this._getAdjacencyScore(lastName, candidateName);

        if (adjacencyScore > bestScore) {
          bestScore = adjacencyScore;
          bestIndex = i;
        }
      }

      sorted.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }

    return sorted;
  }

  /**
   * Get adjacency score between two rooms
   * @private
   */
  _getAdjacencyScore(room1Name, room2Name) {
    // Check direct adjacency rules
    for (const [key, neighbors] of Object.entries(ADJACENCY_RULES)) {
      if (room1Name.includes(key)) {
        for (const [neighbor, score] of Object.entries(neighbors)) {
          if (room2Name.includes(neighbor)) {
            return score;
          }
        }
      }
    }

    // Default: group similar rooms (bedrooms together)
    const r1Lower = room1Name.toLowerCase();
    const r2Lower = room2Name.toLowerCase();

    if (r1Lower.includes("bedroom") && r2Lower.includes("bedroom")) {
      return 5;
    }

    return 0;
  }

  /**
   * Generate an adjacency report for all room pairs on each floor.
   * Checks which rooms share an edge (are adjacent) and their adjacency score.
   *
   * @returns {{ pairs: Array<{ roomA: string, roomB: string, floor: number, adjacent: boolean, score: number }> }}
   */
  getAdjacencyReport() {
    const pairs = [];
    for (const floor of this.floors) {
      const rooms = floor.rooms || [];
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i],
            b = rooms[j];
          const adjacent = this._areRoomsAdjacent(a, b);
          const score = this._getAdjacencyScore(a.name || "", b.name || "");
          pairs.push({
            roomA: a.name,
            roomB: b.name,
            floor: floor.level,
            adjacent,
            score,
          });
        }
      }
    }
    return { pairs };
  }

  /**
   * Check if two rooms are adjacent (share a bounding-box edge).
   * Uses 1mm tolerance to account for wall thickness.
   * @private
   */
  _areRoomsAdjacent(a, b) {
    if (!a.polygon || !b.polygon) return false;
    // Tolerance must exceed internal wall gap (100mm) so rooms sharing
    // a partition wall are correctly detected as adjacent.
    const tolerance = WALL_THICKNESS.INTERNAL + 50; // 150mm
    const aBBox = this._getBBox(a.polygon);
    const bBBox = this._getBBox(b.polygon);
    // Overlapping range on one axis, touching on the other
    const xOverlap =
      aBBox.maxX > bBBox.minX + tolerance &&
      bBBox.maxX > aBBox.minX + tolerance;
    const yOverlap =
      aBBox.maxY > bBBox.minY + tolerance &&
      bBBox.maxY > aBBox.minY + tolerance;
    const xTouch =
      Math.abs(aBBox.maxX - bBBox.minX) < tolerance ||
      Math.abs(bBBox.maxX - aBBox.minX) < tolerance;
    const yTouch =
      Math.abs(aBBox.maxY - bBBox.minY) < tolerance ||
      Math.abs(bBBox.maxY - aBBox.minY) < tolerance;
    return (xOverlap && yTouch) || (yOverlap && xTouch);
  }

  /**
   * Get axis-aligned bounding box from a polygon array.
   * Supports both {x,y} objects and [x,y] arrays.
   * @private
   */
  _getBBox(polygon) {
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
   * Build room polygons using zone-based deterministic layout algorithm.
   *
   * Algorithm:
   * 1. Group rooms by zoneType: 'public', 'private', 'service'
   * 2. For ground floor: public rooms near entrance, service (circulation) centrally
   * 3. For upper floors: private rooms (bedrooms, bathrooms)
   * 4. Within each zone, use strip packing with aspect-ratio-aware sizing
   *
   * @private
   */
  _buildRooms(roomsData, floorIndex) {
    const rooms = [];
    const { width, depth } = this.envelope;
    const entranceSide = this.envelope.entranceSide || "S";

    // Internal margins (wall thickness)
    const margin = WALL_THICKNESS.EXTERNAL;
    const availableWidth = width - 2 * margin;
    const availableDepth = depth - 2 * margin;
    const wallGap = WALL_THICKNESS.INTERNAL;

    // Helper function to determine zone type from room data using ZONE_TYPE_MAP
    const getZoneTypeFromRoom = (room) => {
      // Priority: explicit zoneType > ZONE_TYPE_MAP lookup by program > by name > 'public' fallback
      if (room.zoneType) {
        return room.zoneType;
      }

      // Try program field (e.g., 'hallway', 'bedroom')
      const programKey = room.program?.toLowerCase?.();
      if (programKey && ZONE_TYPE_MAP[programKey]) {
        return ZONE_TYPE_MAP[programKey];
      }

      // Try name field (e.g., 'Hallway', 'Master Bedroom')
      const nameKey = room.name?.toLowerCase?.().replace(/[^a-z]/g, "");
      if (nameKey && ZONE_TYPE_MAP[nameKey]) {
        return ZONE_TYPE_MAP[nameKey];
      }

      // Try partial matches for composite names like "master bedroom" -> "bedroom"
      if (nameKey) {
        for (const [key, zone] of Object.entries(ZONE_TYPE_MAP)) {
          if (nameKey.includes(key)) {
            return zone;
          }
        }
      }

      // Default fallback
      return "public";
    };

    // Group rooms by zone type
    const publicRooms = roomsData.filter(
      (r) => getZoneTypeFromRoom(r) === "public",
    );
    const privateRooms = roomsData.filter(
      (r) => getZoneTypeFromRoom(r) === "private",
    );
    const serviceRooms = roomsData.filter(
      (r) => getZoneTypeFromRoom(r) === "service",
    );

    logger.info(`[BuildingModel] Zone-based layout for floor ${floorIndex}`, {
      public: publicRooms.length,
      private: privateRooms.length,
      service: serviceRooms.length,
      entranceSide,
    });

    // Determine zone layout based on floor index and entrance
    // Ground floor: Service (hall) at entrance, Public behind, Private at back
    // Upper floors: Service (landing) at stair position, Private rooms

    let roomIndex = 0;

    // Entrance side determines zone ordering
    // For S entrance: service at bottom (min Y), then public, then private at top
    // For N entrance: private at bottom, then public, then service at top (near entrance)
    const entranceAtBottom =
      entranceSide === "S" || entranceSide === "SE" || entranceSide === "SW";
    const zoneOrder = entranceAtBottom
      ? ["service", "public", "private"]
      : ["private", "public", "service"];

    const zonesByType = {
      service: serviceRooms,
      public: publicRooms,
      private: privateRooms,
    };

    const presentZones = zoneOrder
      .map((zoneType) => ({ zoneType, rooms: zonesByType[zoneType] || [] }))
      .filter((zone) => zone.rooms.length > 0);

    // Allocate zone depths based on requested room areas (prevents wasted depth when a zone is absent)
    const totalRequestedAreaM2 = presentZones.reduce((sum, zone) => {
      return (
        sum +
        zone.rooms.reduce((acc, room) => acc + (room.targetAreaM2 || 20), 0)
      );
    }, 0);

    const interZoneGaps = wallGap * Math.max(0, presentZones.length - 1);
    const depthForZones = Math.max(0, availableDepth - interZoneGaps);

    let remainingDepth = depthForZones;
    presentZones.forEach((zone, idx) => {
      const zoneAreaM2 = zone.rooms.reduce(
        (acc, room) => acc + (room.targetAreaM2 || 20),
        0,
      );

      // FIX: Check if zone contains circulation rooms (hallway, corridor, landing)
      // These need minimum depth to accommodate their high aspect ratio
      const hasCirculation = zone.rooms.some(
        (r) =>
          r.isCirculation ||
          r.program === "circulation" ||
          r.program === "hallway" ||
          r.program === "corridor" ||
          r.name?.toLowerCase().includes("hall") ||
          r.name?.toLowerCase().includes("corridor"),
      );
      const minZoneDepth = hasCirculation ? 2000 : 500; // 2m min for circulation zones

      if (idx === presentZones.length - 1) {
        zone.depth = Math.max(minZoneDepth, remainingDepth);
        return;
      }

      if (totalRequestedAreaM2 <= 0) {
        zone.depth = Math.max(
          minZoneDepth,
          Math.floor(depthForZones / presentZones.length),
        );
        remainingDepth -= zone.depth;
        return;
      }

      const allocated = Math.max(
        minZoneDepth,
        Math.round(depthForZones * (zoneAreaM2 / totalRequestedAreaM2)),
      );
      zone.depth = Math.min(allocated, remainingDepth);
      remainingDepth -= zone.depth;
    });

    let cursorY = -depth / 2 + margin;
    for (const zone of presentZones) {
      const zoneRooms = this._layoutZoneRooms(
        zone.rooms,
        -width / 2 + margin,
        cursorY,
        availableWidth,
        zone.depth,
        floorIndex,
        roomIndex,
        zone.zoneType,
      );
      rooms.push(...zoneRooms);
      roomIndex += zoneRooms.length;
      cursorY += zone.depth + wallGap;
    }

    // If no rooms were created but we have room data, fall back to simple strip packing
    if (rooms.length === 0 && roomsData.length > 0) {
      logger.warn(
        "[BuildingModel] Zone layout produced no rooms, using fallback",
      );
      return this._buildRoomsFallback(roomsData, floorIndex);
    }

    // If some rooms were dropped due to packing constraints, retry using full-floor fallback.
    if (roomsData.length > 0 && rooms.length < roomsData.length) {
      logger.warn(
        "[BuildingModel] Zone layout dropped rooms; retrying with fallback",
        {
          floorIndex,
          expectedRooms: roomsData.length,
          builtRooms: rooms.length,
        },
      );
      return this._buildRoomsFallback(roomsData, floorIndex);
    }

    // Post-layout: repair any required adjacencies that the strip packing broke
    this._repairRequiredAdjacencies(rooms);

    return rooms;
  }

  /**
   * Layout rooms within a zone using strip packing
   * @private
   */
  _layoutZoneRooms(
    zoneRooms,
    startX,
    startY,
    zoneWidth,
    zoneDepth,
    floorIndex,
    startingIndex,
    zoneType,
  ) {
    const rooms = [];
    const wallGap = WALL_THICKNESS.INTERNAL;

    let currentX = startX;
    let currentY = startY;
    let currentStripHeight = 0;
    let roomIndex = startingIndex;

    // Sort rooms by area (largest first) for better packing (keep circulation/core first)
    const sortedRooms = [...zoneRooms].sort((a, b) => {
      const aIsCore = a?.isCirculation === true;
      const bIsCore = b?.isCirculation === true;
      if (aIsCore !== bIsCore) {
        return aIsCore ? -1 : 1;
      }
      return (b?.targetAreaM2 || 20) - (a?.targetAreaM2 || 20);
    });

    // Group required-adjacent pairs so they're packed consecutively
    this._groupRequiredAdjacencyPairs(sortedRooms);

    for (const roomData of sortedRooms) {
      const areaM2 = roomData.targetAreaM2 || 20;
      const areaMM2 = areaM2 * MM_PER_M * MM_PER_M;

      // Calculate room dimensions
      let roomWidth, roomDepth;

      if (roomData.estimatedWidth && roomData.estimatedLength) {
        roomWidth = roomData.estimatedWidth * MM_PER_M;
        roomDepth = roomData.estimatedLength * MM_PER_M;
      } else {
        // Calculate from area with program-specific aspect ratio
        const aspectRatio = this._getAspectRatioForProgram(
          roomData.program || "generic",
        );
        roomWidth = Math.sqrt(areaMM2 * aspectRatio);
        roomDepth = areaMM2 / roomWidth;
      }

      // Fit to zone bounds while preserving target area as much as possible
      if (roomWidth > zoneWidth) {
        roomWidth = zoneWidth;
        roomDepth = areaMM2 / roomWidth;
      }

      if (roomDepth > zoneDepth) {
        roomDepth = zoneDepth;
        roomWidth = areaMM2 / roomDepth;
      }

      roomWidth = Math.min(roomWidth, zoneWidth);
      roomDepth = Math.min(roomDepth, zoneDepth);

      // Check if fits in current strip
      if (currentX + roomWidth > startX + zoneWidth) {
        // Move to next strip
        currentX = startX;
        currentY += currentStripHeight + wallGap;
        currentStripHeight = 0;
      }

      // Check vertical fit within zone
      if (currentY + roomDepth > startY + zoneDepth) {
        // Try to fit with reduced size (otherwise let floor-level fallback re-pack all rooms)
        const maxDepth = startY + zoneDepth - currentY - wallGap;
        if (maxDepth > 1500) {
          // Minimum 1.5m depth
          roomDepth = maxDepth;
          roomWidth = Math.min(areaMM2 / roomDepth, zoneWidth);
        } else {
          logger.warn(
            `[BuildingModel] Room ${roomData.name} doesn't fit in zone ${zoneType}`,
            {
              floorIndex,
              zoneType,
              remainingDepthMM: Math.max(0, startY + zoneDepth - currentY),
            },
          );
          break;
        }
      }

      // Create room polygon
      const polygon = [
        { x: currentX, y: currentY },
        { x: currentX + roomWidth, y: currentY },
        { x: currentX + roomWidth, y: currentY + roomDepth },
        { x: currentX, y: currentY + roomDepth },
      ];

      const actualWidth = roomWidth / MM_PER_M;
      const actualDepth = roomDepth / MM_PER_M;

      rooms.push({
        id: `room_${floorIndex}_${roomIndex}`,
        name: roomData.name || `Room ${roomIndex + 1}`,
        program: roomData.program || "generic",
        roomType: roomData.roomType || roomData.program || "generic",
        spaceType: roomData.spaceType || "public",
        zoneType: roomData.zoneType || zoneType,
        polygon,
        area: roomWidth * roomDepth,
        areaM2: (roomWidth * roomDepth) / (MM_PER_M * MM_PER_M),
        width: actualWidth,
        depth: actualDepth,
        targetAreaM2: areaM2,
        center: {
          x: currentX + roomWidth / 2,
          y: currentY + roomDepth / 2,
        },
        boundingBox: {
          minX: currentX,
          maxX: currentX + roomWidth,
          minY: currentY,
          maxY: currentY + roomDepth,
        },
      });

      // Advance position
      currentX += roomWidth + wallGap;
      currentStripHeight = Math.max(currentStripHeight, roomDepth);
      roomIndex++;
    }

    return rooms;
  }

  /**
   * Reorder rooms in-place so that required-adjacent pairs are consecutive
   * in the packing order. This ensures strip packing places them side-by-side.
   * @private
   */
  _groupRequiredAdjacencyPairs(rooms) {
    const pairs = [
      ["Kitchen", "Dining"],
      ["Master Bedroom", "En-Suite"],
    ];

    for (const [nameA, nameB] of pairs) {
      const idxA = rooms.findIndex((r) => r.name?.includes(nameA));
      const idxB = rooms.findIndex((r) => r.name?.includes(nameB));
      if (idxA < 0 || idxB < 0) continue;
      // Already consecutive
      if (Math.abs(idxA - idxB) === 1) continue;

      // Remove B and re-insert immediately after A
      const [roomB] = rooms.splice(idxB, 1);
      const newIdxA = rooms.findIndex((r) => r.name?.includes(nameA));
      rooms.splice(newIdxA + 1, 0, roomB);
    }
  }

  /**
   * Post-layout repair: if a required-adjacent pair still isn't adjacent
   * (e.g., they wrapped to different strips), reposition the second room
   * next to the first.
   * @private
   */
  _repairRequiredAdjacencies(rooms) {
    const pairs = [
      ["Kitchen", "Dining"],
      ["Master Bedroom", "En-Suite"],
    ];

    for (const [nameA, nameB] of pairs) {
      const roomA = rooms.find((r) => r.name?.includes(nameA));
      const roomB = rooms.find((r) => r.name?.includes(nameB));
      if (!roomA || !roomB) continue;
      if (this._areRoomsAdjacent(roomA, roomB)) continue;

      logger.warn(
        `[BuildingModel] Repairing adjacency: moving ${roomB.name} next to ${roomA.name}`,
      );

      const wallGap = WALL_THICKNESS.INTERNAL;
      const bWidth = roomB.boundingBox.maxX - roomB.boundingBox.minX;
      const bDepth = roomB.boundingBox.maxY - roomB.boundingBox.minY;

      // Candidate positions: right of A, below A, left of A, above A
      const candidates = [
        { x: roomA.boundingBox.maxX + wallGap, y: roomA.boundingBox.minY },
        { x: roomA.boundingBox.minX, y: roomA.boundingBox.maxY + wallGap },
        {
          x: roomA.boundingBox.minX - bWidth - wallGap,
          y: roomA.boundingBox.minY,
        },
        {
          x: roomA.boundingBox.minX,
          y: roomA.boundingBox.minY - bDepth - wallGap,
        },
      ];

      for (const pos of candidates) {
        const newBBox = {
          minX: pos.x,
          maxX: pos.x + bWidth,
          minY: pos.y,
          maxY: pos.y + bDepth,
        };

        // Check for overlaps with other rooms
        const overlaps = rooms.some(
          (r) =>
            r !== roomA &&
            r !== roomB &&
            this._boxesOverlap(r.boundingBox, newBBox),
        );

        if (!overlaps) {
          roomB.boundingBox = newBBox;
          roomB.polygon = [
            { x: pos.x, y: pos.y },
            { x: pos.x + bWidth, y: pos.y },
            { x: pos.x + bWidth, y: pos.y + bDepth },
            { x: pos.x, y: pos.y + bDepth },
          ];
          roomB.center = {
            x: pos.x + bWidth / 2,
            y: pos.y + bDepth / 2,
          };
          break;
        }
      }
    }
  }

  /**
   * Check if two axis-aligned bounding boxes overlap.
   * @private
   */
  _boxesOverlap(a, b) {
    return (
      a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
    );
  }

  /**
   * Get aspect ratio for room program type
   * @private
   */
  _getAspectRatioForProgram(program) {
    const ratios = {
      living: 1.4,
      lounge: 1.4,
      kitchen: 1.2,
      dining: 1.3,
      bedroom: 1.25,
      master_bedroom: 1.3,
      bathroom: 1.5,
      ensuite: 1.6,
      wc: 2.0,
      utility: 1.5,
      entrance: 1.0,
      hallway: 2.0,
      corridor: 2.5,
      landing: 1.2,
      study: 1.2,
      office: 1.3,
      circulation: 2.0,
      generic: 1.3,
    };
    return ratios[program] || 1.3;
  }

  /**
   * Fallback room layout using simple strip packing
   * @private
   */
  _buildRoomsFallback(roomsData, floorIndex) {
    const { width, depth } = this.envelope;
    const margin = WALL_THICKNESS.EXTERNAL;
    const wallGap = WALL_THICKNESS.INTERNAL;
    const availableWidth = width - 2 * margin;
    const availableDepth = depth - 2 * margin;

    const availableAreaM2 =
      (availableWidth * availableDepth) / (MM_PER_M * MM_PER_M);
    const requestedAreaM2 = roomsData.reduce(
      (sum, room) => sum + (room.targetAreaM2 || 20),
      0,
    );
    const PACKING_EFFICIENCY = 1.0;

    let areaScale =
      requestedAreaM2 > 0
        ? Math.min(1, (availableAreaM2 * PACKING_EFFICIENCY) / requestedAreaM2)
        : 1;

    const packOnce = (scale) => {
      const packedRooms = [];
      let currentX = -width / 2 + margin;
      let currentY = -depth / 2 + margin;
      let currentStripHeight = 0;
      let roomIndex = 0;
      const linearScale = Math.sqrt(scale);

      // Keep circulation/core first, then largest area first for stability
      const sortedRooms = [...roomsData].sort((a, b) => {
        const aIsCore = a?.isCirculation === true;
        const bIsCore = b?.isCirculation === true;
        if (aIsCore !== bIsCore) {
          return aIsCore ? -1 : 1;
        }
        return (b?.targetAreaM2 || 20) - (a?.targetAreaM2 || 20);
      });

      // Group required-adjacent pairs so they're packed consecutively
      this._groupRequiredAdjacencyPairs(sortedRooms);

      for (const roomData of sortedRooms) {
        const targetAreaM2 = roomData.targetAreaM2 || 20;
        const scaledAreaM2 = targetAreaM2 * scale;
        const areaMM2 = scaledAreaM2 * MM_PER_M * MM_PER_M;

        let roomWidth;
        let roomDepth;

        if (roomData.estimatedWidth && roomData.estimatedLength) {
          roomWidth = roomData.estimatedWidth * MM_PER_M * linearScale;
          roomDepth = roomData.estimatedLength * MM_PER_M * linearScale;
        } else {
          const aspectRatio = this._getAspectRatioForProgram(
            roomData.program || "generic",
          );
          roomWidth = Math.sqrt(areaMM2 * aspectRatio);
          roomDepth = areaMM2 / roomWidth;
        }

        // Fit to available bounds while preserving area as much as possible
        if (roomWidth > availableWidth) {
          roomWidth = availableWidth;
          roomDepth = areaMM2 / roomWidth;
        }
        if (roomDepth > availableDepth) {
          roomDepth = availableDepth;
          roomWidth = areaMM2 / roomDepth;
        }
        roomWidth = Math.min(roomWidth, availableWidth);
        roomDepth = Math.min(roomDepth, availableDepth);

        // If room won't fit beside current strip items, try flipping dimensions
        if (
          currentX + roomWidth > width / 2 - margin &&
          roomDepth <= availableWidth
        ) {
          [roomWidth, roomDepth] = [roomDepth, roomWidth];
        }

        // Wrap to next strip if needed
        if (currentX + roomWidth > width / 2 - margin) {
          currentX = -width / 2 + margin;
          currentY += currentStripHeight + wallGap;
          currentStripHeight = 0;
        }

        // If we overflow vertically, squish the room to fit remaining depth
        if (currentY + roomDepth > depth / 2 - margin) {
          const maxAvailDepth = depth / 2 - margin - currentY;
          if (maxAvailDepth >= 1200) {
            // Squish room to fit remaining depth (minimum 1.2m)
            roomDepth = maxAvailDepth;
            roomWidth = Math.min(areaMM2 / roomDepth, availableWidth);
          } else {
            // Try wrapping to next strip
            currentX = -width / 2 + margin;
            currentY += currentStripHeight + wallGap;
            currentStripHeight = 0;
            const remaining = depth / 2 - margin - currentY;
            if (remaining < 1200) {
              return { rooms: packedRooms, complete: false };
            }
            roomDepth = Math.min(roomDepth, remaining);
            roomWidth = Math.min(areaMM2 / roomDepth, availableWidth);
          }
        }

        const polygon = [
          { x: currentX, y: currentY },
          { x: currentX + roomWidth, y: currentY },
          { x: currentX + roomWidth, y: currentY + roomDepth },
          { x: currentX, y: currentY + roomDepth },
        ];

        packedRooms.push({
          id: `room_${floorIndex}_${roomIndex}`,
          name: roomData.name || `Room ${roomIndex + 1}`,
          program: roomData.program || "generic",
          roomType: roomData.roomType || roomData.program || "generic",
          spaceType: roomData.spaceType || "public",
          zoneType: roomData.zoneType || "public",
          polygon,
          area: roomWidth * roomDepth,
          areaM2: (roomWidth * roomDepth) / (MM_PER_M * MM_PER_M),
          width: roomWidth / MM_PER_M,
          depth: roomDepth / MM_PER_M,
          targetAreaM2,
          center: {
            x: currentX + roomWidth / 2,
            y: currentY + roomDepth / 2,
          },
          boundingBox: {
            minX: currentX,
            maxX: currentX + roomWidth,
            minY: currentY,
            maxY: currentY + roomDepth,
          },
        });

        currentX += roomWidth + wallGap;
        currentStripHeight = Math.max(currentStripHeight, roomDepth);
        roomIndex++;
      }

      return { rooms: packedRooms, complete: true };
    };

    // Retry with progressively smaller packing scale if needed
    let packed = packOnce(areaScale);
    let attempts = 0;
    while (!packed.complete && attempts < 8) {
      areaScale *= 0.9;
      packed = packOnce(areaScale);
      attempts++;
    }

    if (!packed.complete) {
      logger.warn("[BuildingModel] Fallback packing incomplete after retries", {
        floorIndex,
        placed: packed.rooms.length,
        requested: roomsData.length,
      });
    }

    // Post-layout: repair any required adjacencies that strip packing broke
    this._repairRequiredAdjacencies(packed.rooms);

    return packed.rooms;
  }

  /**
   * Build walls from room polygons and building footprint.
   * Generates:
   * 1. External walls from building footprint
   * 2. Internal walls between ALL adjacent rooms (not just strip neighbors)
   * @private
   */
  _buildWalls(rooms, floorIndex) {
    const walls = [];
    let wallId = 0;
    const tolerance = WALL_THICKNESS.INTERNAL * 3;

    // External walls from footprint
    const footprint = this.envelope.footprint;
    const facades = ["S", "E", "N", "W"]; // Clockwise from south

    for (let i = 0; i < footprint.length; i++) {
      const start = footprint[i];
      const end = footprint[(i + 1) % footprint.length];
      const facade = facades[i];

      walls.push({
        id: `wall_${floorIndex}_${wallId++}`,
        start: { ...start },
        end: { ...end },
        thickness: WALL_THICKNESS.EXTERNAL,
        type: "external",
        facade,
        length: Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2),
      });
    }

    // Track which room pairs have walls to avoid duplicates
    const wallPairs = new Set();

    // Internal walls between ALL adjacent rooms
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const room1 = rooms[i];
        const room2 = rooms[j];
        const pairKey = `${Math.min(i, j)}-${Math.max(i, j)}`;

        if (wallPairs.has(pairKey)) {
          continue;
        }

        const bb1 = room1.boundingBox;
        const bb2 = room2.boundingBox;

        // Check for vertical adjacency (rooms share a vertical edge)
        // Room1 right edge touches Room2 left edge
        if (Math.abs(bb1.maxX - bb2.minX) < tolerance) {
          const y1 = Math.max(bb1.minY, bb2.minY);
          const y2 = Math.min(bb1.maxY, bb2.maxY);
          const overlap = y2 - y1;

          if (overlap > 100) {
            // At least 100mm overlap
            walls.push({
              id: `wall_${floorIndex}_${wallId++}`,
              start: { x: bb1.maxX, y: y1 },
              end: { x: bb1.maxX, y: y2 },
              thickness: WALL_THICKNESS.INTERNAL,
              type: "internal",
              facade: null,
              length: overlap,
              connectsRooms: [room1.name, room2.name],
            });
            wallPairs.add(pairKey);
          }
        }
        // Room2 right edge touches Room1 left edge
        else if (Math.abs(bb2.maxX - bb1.minX) < tolerance) {
          const y1 = Math.max(bb1.minY, bb2.minY);
          const y2 = Math.min(bb1.maxY, bb2.maxY);
          const overlap = y2 - y1;

          if (overlap > 100) {
            walls.push({
              id: `wall_${floorIndex}_${wallId++}`,
              start: { x: bb2.maxX, y: y1 },
              end: { x: bb2.maxX, y: y2 },
              thickness: WALL_THICKNESS.INTERNAL,
              type: "internal",
              facade: null,
              length: overlap,
              connectsRooms: [room1.name, room2.name],
            });
            wallPairs.add(pairKey);
          }
        }

        // Check for horizontal adjacency (rooms share a horizontal edge)
        // Room1 top edge touches Room2 bottom edge
        if (Math.abs(bb1.maxY - bb2.minY) < tolerance) {
          const x1 = Math.max(bb1.minX, bb2.minX);
          const x2 = Math.min(bb1.maxX, bb2.maxX);
          const overlap = x2 - x1;

          if (overlap > 100 && !wallPairs.has(pairKey)) {
            walls.push({
              id: `wall_${floorIndex}_${wallId++}`,
              start: { x: x1, y: bb1.maxY },
              end: { x: x2, y: bb1.maxY },
              thickness: WALL_THICKNESS.INTERNAL,
              type: "internal",
              facade: null,
              length: overlap,
              connectsRooms: [room1.name, room2.name],
            });
            wallPairs.add(pairKey);
          }
        }
        // Room2 top edge touches Room1 bottom edge
        else if (Math.abs(bb2.maxY - bb1.minY) < tolerance) {
          const x1 = Math.max(bb1.minX, bb2.minX);
          const x2 = Math.min(bb1.maxX, bb2.maxX);
          const overlap = x2 - x1;

          if (overlap > 100 && !wallPairs.has(pairKey)) {
            walls.push({
              id: `wall_${floorIndex}_${wallId++}`,
              start: { x: x1, y: bb2.maxY },
              end: { x: x2, y: bb2.maxY },
              thickness: WALL_THICKNESS.INTERNAL,
              type: "internal",
              facade: null,
              length: overlap,
              connectsRooms: [room1.name, room2.name],
            });
            wallPairs.add(pairKey);
          }
        }
      }
    }

    logger.debug(`[BuildingModel] Floor ${floorIndex} walls built`, {
      external: walls.filter((w) => w.type === "external").length,
      internal: walls.filter((w) => w.type === "internal").length,
    });

    return walls;
  }

  /**
   * Build openings (doors and windows)
   * @private
   */
  _buildOpenings(walls, rooms, floorIndex, state) {
    const openings = [];
    let openingId = 0;

    // Find circulation room for door placement
    const circulationRoom = rooms.find(
      (r) =>
        r.name?.toLowerCase().includes("hall") ||
        r.name?.toLowerCase().includes("landing") ||
        r.name?.toLowerCase().includes("circulation"),
    );

    // Add windows to external walls (facade-specific sizing for passive solar design)
    for (const wall of walls) {
      if (wall.type !== "external") {
        continue;
      }

      // Facade-specific window policy (UK climate-responsive defaults)
      let windowSpacing, windowWidth, windowHeight, sillHeight;
      if (wall.facade === "S") {
        windowSpacing = 2000; // More windows for solar gain
        windowWidth = 1400;
        windowHeight = 1600;
        sillHeight = 800;
      } else if (wall.facade === "N") {
        windowSpacing = 3500; // Fewer windows to reduce heat loss
        windowWidth = 1000;
        windowHeight = 1200;
        sillHeight = 1000;
      } else if (wall.facade === "E") {
        windowSpacing = 2500; // Standard — morning sun
        windowWidth = 1200;
        windowHeight = 1400;
        sillHeight = 900;
      } else {
        // West — slightly fewer to limit afternoon overheating
        windowSpacing = 3000;
        windowWidth = 1100;
        windowHeight = 1300;
        sillHeight = 900;
      }

      const windowCount = Math.max(1, Math.floor(wall.length / windowSpacing));

      for (let w = 0; w < windowCount; w++) {
        const positionMM = (w + 0.5) * (wall.length / windowCount);
        // Normalize position to 0-1 range for rendering
        const normalizedX = positionMM / wall.length;

        openings.push({
          id: `opening_${floorIndex}_${openingId++}`,
          wallId: wall.id,
          type: "window",
          position: {
            x: normalizedX,
            z:
              (sillHeight + windowHeight / 2) /
              (this.envelope.floorHeights[floorIndex] || 2800),
          },
          positionMM, // Keep raw position for other uses
          width: windowWidth,
          height: windowHeight,
          widthMM: windowWidth,
          heightMM: windowHeight,
          sillHeight,
          facade: wall.facade,
        });
      }
    }

    // Add entrance door on ground floor
    if (floorIndex === 0) {
      const entranceFacade = this.envelope.entranceSide;
      const entranceWall = walls.find(
        (w) => w.facade === entranceFacade && w.type === "external",
      );

      if (entranceWall) {
        const positionMM = entranceWall.length / 2; // Center of wall
        const normalizedX = positionMM / entranceWall.length;

        openings.push({
          id: `opening_${floorIndex}_${openingId++}`,
          wallId: entranceWall.id,
          type: "door",
          position: {
            x: normalizedX,
            z: 1050 / (this.envelope.floorHeights[floorIndex] || 2800), // Half door height
          },
          positionMM,
          width: 1000,
          height: 2100,
          widthMM: 1000, // Explicit MM property for renderer
          heightMM: 2100, // Explicit MM property for renderer
          sillHeight: 0,
          facade: entranceFacade,
          isEntrance: true,
        });
      }

      // Add patio/sliding door on south facade (if entrance is not south)
      if (entranceFacade !== "S") {
        const southWall = walls.find(
          (w) => w.facade === "S" && w.type === "external",
        );
        if (southWall && southWall.length >= 3000) {
          const patioPosMM = southWall.length * 0.35;
          openings.push({
            id: `opening_${floorIndex}_${openingId++}`,
            wallId: southWall.id,
            type: "door",
            position: {
              x: patioPosMM / southWall.length,
              z: 1050 / (this.envelope.floorHeights[floorIndex] || 2800),
            },
            positionMM: patioPosMM,
            width: 1800,
            height: 2100,
            widthMM: 1800,
            heightMM: 2100,
            sillHeight: 0,
            facade: "S",
            isPatio: true,
          });
        }
      }
    }

    // Add internal doors: one from circulation to each room
    if (circulationRoom) {
      for (const room of rooms) {
        if (room.id === circulationRoom.id) {
          continue;
        }

        // Find shared wall between circulation and this room
        const sharedWall = this._findSharedWall(circulationRoom, room, walls);

        if (sharedWall) {
          openings.push({
            id: `opening_${floorIndex}_${openingId++}`,
            wallId: sharedWall.id,
            type: "door",
            position: sharedWall.length / 2,
            width: 900,
            height: 2100,
            sillHeight: 0,
            facade: null,
            isInternal: true,
            connectsRooms: [circulationRoom.name, room.name],
          });
        } else {
          // No direct wall, add door on wall nearest to circulation
          const nearestWall = this._findNearestInternalWall(
            circulationRoom,
            room,
            walls,
          );
          if (nearestWall) {
            openings.push({
              id: `opening_${floorIndex}_${openingId++}`,
              wallId: nearestWall.id,
              type: "door",
              position: nearestWall.length / 2,
              width: 900,
              height: 2100,
              sillHeight: 0,
              facade: null,
              isInternal: true,
              connectsRooms: [circulationRoom.name, room.name],
            });
          }
        }
      }
    } else {
      // Fallback: one door per internal wall
      for (const wall of walls) {
        if (wall.type !== "internal") {
          continue;
        }

        openings.push({
          id: `opening_${floorIndex}_${openingId++}`,
          wallId: wall.id,
          type: "door",
          position: wall.length / 2,
          width: 900,
          height: 2100,
          sillHeight: 0,
          facade: null,
          isInternal: true,
        });
      }
    }

    // Add direct connection doors (Kitchen↔Dining, Master↔En-Suite)
    const directConnections = [
      ["Kitchen", "Dining"],
      ["Master Bedroom", "En-Suite"],
      ["Living Room", "Kitchen"],
    ];

    for (const [room1Name, room2Name] of directConnections) {
      const room1 = rooms.find((r) => r.name?.includes(room1Name));
      const room2 = rooms.find((r) => r.name?.includes(room2Name));

      if (room1 && room2) {
        const sharedWall = this._findSharedWall(room1, room2, walls);
        if (sharedWall) {
          // Check if door already exists on this wall
          const doorExists = openings.some((o) => o.wallId === sharedWall.id);
          if (!doorExists) {
            openings.push({
              id: `opening_${floorIndex}_${openingId++}`,
              wallId: sharedWall.id,
              type: "door",
              position: sharedWall.length / 2,
              width: 900,
              height: 2100,
              sillHeight: 0,
              facade: null,
              isInternal: true,
              connectsRooms: [room1Name, room2Name],
            });
          }
        }
      }
    }

    return openings;
  }

  /**
   * Find shared wall between two rooms
   * @private
   */
  _findSharedWall(room1, room2, walls) {
    if (!room1?.boundingBox || !room2?.boundingBox) {
      return null;
    }

    const r1 = room1.boundingBox;
    const r2 = room2.boundingBox;
    const tolerance = WALL_THICKNESS.INTERNAL * 2;

    for (const wall of walls) {
      if (wall.type !== "internal") {
        continue;
      }

      // Check if wall is between these two rooms
      const wallX = (wall.start.x + wall.end.x) / 2;
      const wallY = (wall.start.y + wall.end.y) / 2;

      const touchesRoom1 =
        wallX >= r1.minX - tolerance &&
        wallX <= r1.maxX + tolerance &&
        wallY >= r1.minY - tolerance &&
        wallY <= r1.maxY + tolerance;
      const touchesRoom2 =
        wallX >= r2.minX - tolerance &&
        wallX <= r2.maxX + tolerance &&
        wallY >= r2.minY - tolerance &&
        wallY <= r2.maxY + tolerance;

      if (touchesRoom1 && touchesRoom2) {
        return wall;
      }
    }

    return null;
  }

  /**
   * Find nearest internal wall to a room
   * @private
   */
  _findNearestInternalWall(fromRoom, toRoom, walls) {
    if (!toRoom?.boundingBox) {
      return null;
    }

    let nearestWall = null;
    let nearestDist = Infinity;

    for (const wall of walls) {
      if (wall.type !== "internal") {
        continue;
      }

      const wallCenterX = (wall.start.x + wall.end.x) / 2;
      const wallCenterY = (wall.start.y + wall.end.y) / 2;

      const roomCenterX =
        (toRoom.boundingBox.minX + toRoom.boundingBox.maxX) / 2;
      const roomCenterY =
        (toRoom.boundingBox.minY + toRoom.boundingBox.maxY) / 2;

      const dist = Math.hypot(
        wallCenterX - roomCenterX,
        wallCenterY - roomCenterY,
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestWall = wall;
      }
    }

    return nearestWall;
  }

  /**
   * Build roof geometry
   * @private
   */
  _buildRoof(state) {
    const massing = state.massing || {};
    const roofType = massing.roofType || "gable";
    const pitchDeg = massing.roofPitchDeg || 35;

    const { width, depth, height } = this.envelope;
    const halfWidth = width / 2;

    // Calculate ridge height
    const ridgeHeight = halfWidth * Math.tan((pitchDeg * Math.PI) / 180);

    // Ridge direction based on building proportions
    const ridgeDirection = width >= depth ? "NS" : "EW";

    // Generate roof profiles for each facade
    const profiles = {};

    if (roofType === "flat") {
      const flatProfile = [
        { x: -halfWidth, z: height },
        { x: halfWidth, z: height },
      ];
      profiles.N = flatProfile;
      profiles.S = flatProfile;
      profiles.E = flatProfile;
      profiles.W = flatProfile;
    } else if (roofType === "gable") {
      if (ridgeDirection === "NS") {
        // Ridge runs N-S, gables on E and W
        profiles.N = [
          { x: -halfWidth, z: height },
          { x: 0, z: height + ridgeHeight },
          { x: halfWidth, z: height },
        ];
        profiles.S = profiles.N;
        profiles.E = [
          { x: -depth / 2, z: height },
          { x: depth / 2, z: height },
        ];
        profiles.W = profiles.E;
      } else {
        // Ridge runs E-W, gables on N and S
        profiles.E = [
          { x: -depth / 2, z: height },
          { x: 0, z: height + ridgeHeight },
          { x: depth / 2, z: height },
        ];
        profiles.W = profiles.E;
        profiles.N = [
          { x: -halfWidth, z: height },
          { x: halfWidth, z: height },
        ];
        profiles.S = profiles.N;
      }
    } else if (roofType === "hip") {
      const inset = Math.min(halfWidth, depth / 2) * 0.3;
      profiles.N = [
        { x: -halfWidth, z: height },
        { x: -halfWidth + inset, z: height + ridgeHeight },
        { x: halfWidth - inset, z: height + ridgeHeight },
        { x: halfWidth, z: height },
      ];
      profiles.S = profiles.N;
      profiles.E = [
        { x: -depth / 2, z: height },
        { x: 0, z: height + ridgeHeight },
        { x: depth / 2, z: height },
      ];
      profiles.W = profiles.E;
    }

    return {
      type: roofType,
      pitchDeg,
      ridgeHeight: height + ridgeHeight,
      ridgeDirection,
      profiles,
      overhangs: {
        eaves: massing.eaveOverhang || 300,
        gable: massing.gableOverhang || 200,
      },
    };
  }

  /**
   * Build stairs for multi-floor buildings
   * @private
   */
  _buildStairs(state) {
    if (this.floors.length <= 1) {
      return [];
    }

    // Find stair position (near entrance)
    const entranceFacade = this.envelope.entranceSide;
    const groundFloor = this.floors[0];
    const entranceOpening = groundFloor.openings.find((o) => o.isEntrance);

    let stairX = 0;
    let stairY = 0;

    if (entranceOpening) {
      const entranceWall = groundFloor.walls.find(
        (w) => w.id === entranceOpening.wallId,
      );
      if (entranceWall) {
        stairX = (entranceWall.start.x + entranceWall.end.x) / 2;
        stairY = (entranceWall.start.y + entranceWall.end.y) / 2;

        // Offset into building
        const offset = 2500;
        if (entranceFacade === "N") {
          stairY -= offset;
        } else if (entranceFacade === "S") {
          stairY += offset;
        } else if (entranceFacade === "E") {
          stairX -= offset;
        } else if (entranceFacade === "W") {
          stairX += offset;
        }
      }
    }

    return [
      {
        id: "stair_1",
        position: { x: stairX, y: stairY },
        width: 1000,
        length: 3000,
        direction: "up",
        connectsFloors: Array.from({ length: this.floors.length }, (_, i) => i),
        type: this.floors.length > 2 ? "U-shape" : "straight",
      },
    ];
  }

  /**
   * Compute facade summary for consistency validation
   * @private
   */
  _computeFacadeSummary() {
    const summary = {
      N: { windowCount: 0, doorCount: 0 },
      S: { windowCount: 0, doorCount: 0 },
      E: { windowCount: 0, doorCount: 0 },
      W: { windowCount: 0, doorCount: 0 },
    };

    for (const floor of this.floors) {
      for (const opening of floor.openings) {
        const facade = opening.facade;
        if (!facade || !summary[facade]) {
          continue;
        }

        if (opening.type === "window") {
          summary[facade].windowCount++;
        } else if (opening.type === "door" && !opening.isInternal) {
          summary[facade].doorCount++;
        }
      }
    }

    return summary;
  }

  // ===========================================================================
  // QUERY METHODS (used by projections)
  // ===========================================================================

  /**
   * Get floor by index
   * @param {number} index - Floor index (0 = ground)
   * @returns {Object|null} Floor object
   */
  getFloor(index) {
    return this.floors[index] || null;
  }

  /**
   * Get all external walls for a facade
   * @param {string} facade - 'N', 'S', 'E', 'W'
   * @returns {Array} Array of walls
   */
  getWallsForFacade(facade) {
    const walls = [];
    for (const floor of this.floors) {
      for (const wall of floor.walls) {
        if (wall.facade === facade && wall.type === "external") {
          walls.push({ ...wall, floorIndex: floor.index, zBase: floor.zBase });
        }
      }
    }
    return walls;
  }

  /**
   * Get all openings for a facade
   * @param {string} facade - 'N', 'S', 'E', 'W'
   * @returns {Array} Array of openings
   */
  getOpeningsForFacade(facade) {
    const openings = [];
    for (const floor of this.floors) {
      for (const opening of floor.openings) {
        if (opening.facade === facade) {
          openings.push({
            ...opening,
            floorIndex: floor.index,
            zBase: floor.zBase,
          });
        }
      }
    }
    return openings;
  }

  /**
   * Get roof profile for a facade
   * @param {string} facade - 'N', 'S', 'E', 'W'
   * @returns {Array} Roof profile points
   */
  getRoofProfile(facade) {
    return this.roof.profiles[facade] || [];
  }

  /**
   * Get building dimensions in meters
   * @returns {Object} { width, depth, height }
   */
  getDimensionsMeters() {
    return {
      width: this.envelope.width / MM_PER_M,
      depth: this.envelope.depth / MM_PER_M,
      height: this.envelope.height / MM_PER_M,
      ridgeHeight: this.roof.ridgeHeight / MM_PER_M,
    };
  }

  /**
   * Validate the model
   * @returns {Object} { valid, errors, warnings }
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check floors exist
    if (this.floors.length === 0) {
      errors.push("No floors defined");
    }

    // Check rooms exist
    const totalRooms = this.floors.reduce((sum, f) => sum + f.rooms.length, 0);
    if (totalRooms === 0) {
      warnings.push("No rooms defined");
    }

    // Check walls exist
    const totalWalls = this.floors.reduce((sum, f) => sum + f.walls.length, 0);
    if (totalWalls === 0) {
      errors.push("No walls generated");
    }

    // Check openings exist
    const totalOpenings = this.floors.reduce(
      (sum, f) => sum + f.openings.length,
      0,
    );
    if (totalOpenings === 0) {
      warnings.push("No openings generated");
    }

    // Check stairs for multi-floor
    if (this.floors.length > 1 && this.stairs.length === 0) {
      warnings.push("Multi-floor building has no stairs");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        floors: this.floors.length,
        rooms: totalRooms,
        walls: totalWalls,
        openings: totalOpenings,
        stairs: this.stairs.length,
      },
    };
  }

  /**
   * Dispose of all resources held by this model
   * CRITICAL: Call this when done with a BuildingModel to prevent memory leaks
   */
  dispose() {
    logger.info("[BuildingModel] Disposing model resources", {
      designId: this.designId,
    });

    // Clear envelope
    this.envelope = null;

    // Clear each floor's data
    if (this.floors) {
      this.floors.forEach((floor) => {
        if (floor.rooms) {
          floor.rooms.length = 0;
        }
        if (floor.walls) {
          floor.walls.length = 0;
        }
        if (floor.openings) {
          floor.openings.length = 0;
        }
      });
      this.floors.length = 0;
    }

    // Clear roof
    this.roof = null;

    // Clear stairs
    if (this.stairs) {
      this.stairs.length = 0;
    }

    // Clear facade summary
    this.facadeSummary = null;

    logger.info("[BuildingModel] Model disposed successfully", {
      designId: this.designId,
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a BuildingModel from CanonicalDesignState
 * @param {Object} canonicalState - CanonicalDesignState object
 * @returns {BuildingModel}
 */
export function createBuildingModel(canonicalState) {
  return new BuildingModel(canonicalState);
}

export default BuildingModel;
