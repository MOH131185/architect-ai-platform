/**
 * ArchitecturalFloorPlanGenerator.js
 *
 * Professional architectural floor plan SVG generation with:
 * - Furniture symbols per room type
 * - Door swings (90° arcs)
 * - Wall hatching (poche)
 * - Dimension lines
 * - North arrow and scale bar
 * - Room labels with areas
 *
 * Based on UK architectural drawing conventions (BS 1192)
 *
 * @module ArchitecturalFloorPlanGenerator
 */

/**
 * Custom error for floor plan validation failures
 * Used by panel regeneration/repair logic to detect degenerate floor plans
 */
export class FloorPlanValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'FloorPlanValidationError';
    this.details = details;
    this.isRecoverable = true; // Signal to orchestrator that regen/repair should be attempted
  }
}

/**
 * Furniture symbols configuration per room type
 * Dimensions in meters, will be scaled to SVG
 */
const FURNITURE_SYMBOLS = {
  'Living Room': [
    { type: 'sofa', width: 2.2, depth: 0.9, position: 'center-wall', offset: { x: 0.3, y: 0.3 } },
    { type: 'coffee-table', width: 1.2, depth: 0.6, position: 'center', offset: { x: 0, y: 0 } },
    { type: 'armchair', width: 0.8, depth: 0.8, position: 'corner', offset: { x: 0.3, y: 0.3 } },
    {
      type: 'tv-unit',
      width: 1.5,
      depth: 0.4,
      position: 'opposite-wall',
      offset: { x: 0.2, y: 0.1 },
    },
  ],
  Lounge: [
    { type: 'sofa', width: 2.2, depth: 0.9, position: 'center-wall', offset: { x: 0.3, y: 0.3 } },
    { type: 'coffee-table', width: 1.2, depth: 0.6, position: 'center', offset: { x: 0, y: 0 } },
  ],
  Kitchen: [
    { type: 'counter-L', width: 'wall', depth: 0.6, position: 'L-shape' },
    { type: 'sink', width: 0.6, depth: 0.5, position: 'counter-center' },
    { type: 'cooktop', width: 0.6, depth: 0.6, position: 'counter-right' },
    { type: 'fridge', width: 0.7, depth: 0.7, position: 'corner', offset: { x: 0.1, y: 0.1 } },
  ],
  'Kitchen/Diner': [
    { type: 'counter-L', width: 'wall', depth: 0.6, position: 'L-shape' },
    { type: 'sink', width: 0.6, depth: 0.5, position: 'counter-center' },
    { type: 'cooktop', width: 0.6, depth: 0.6, position: 'counter-right' },
    { type: 'fridge', width: 0.7, depth: 0.7, position: 'corner', offset: { x: 0.1, y: 0.1 } },
    { type: 'dining-table', width: 1.4, depth: 0.8, position: 'room-center' },
    { type: 'chairs', count: 4, around: 'table' },
  ],
  'Master Bedroom': [
    {
      type: 'double-bed',
      width: 1.8,
      depth: 2.0,
      position: 'center-wall',
      offset: { x: 0, y: 0.1 },
    },
    {
      type: 'wardrobe',
      width: 1.8,
      depth: 0.6,
      position: 'opposite-wall',
      offset: { x: 0.2, y: 0.1 },
    },
    {
      type: 'bedside-table',
      width: 0.5,
      depth: 0.4,
      position: 'bed-left',
      offset: { x: -0.1, y: 0 },
    },
    {
      type: 'bedside-table',
      width: 0.5,
      depth: 0.4,
      position: 'bed-right',
      offset: { x: 0.1, y: 0 },
    },
  ],
  Bedroom: [
    { type: 'single-bed', width: 1.0, depth: 2.0, position: 'corner', offset: { x: 0.1, y: 0.1 } },
    {
      type: 'wardrobe',
      width: 1.2,
      depth: 0.6,
      position: 'opposite-wall',
      offset: { x: 0.2, y: 0.1 },
    },
    { type: 'desk', width: 1.2, depth: 0.6, position: 'window-wall', offset: { x: 0.2, y: 0.1 } },
  ],
  'Bedroom 2': [
    {
      type: 'double-bed',
      width: 1.5,
      depth: 2.0,
      position: 'center-wall',
      offset: { x: 0, y: 0.1 },
    },
    {
      type: 'wardrobe',
      width: 1.4,
      depth: 0.6,
      position: 'opposite-wall',
      offset: { x: 0.2, y: 0.1 },
    },
  ],
  'Bedroom 3': [
    { type: 'single-bed', width: 1.0, depth: 2.0, position: 'corner', offset: { x: 0.1, y: 0.1 } },
    { type: 'wardrobe', width: 1.0, depth: 0.6, position: 'wall', offset: { x: 0.2, y: 0.1 } },
  ],
  Bathroom: [
    { type: 'bath', width: 1.7, depth: 0.7, position: 'wall', offset: { x: 0.1, y: 0.1 } },
    { type: 'toilet', width: 0.4, depth: 0.7, position: 'wall', offset: { x: 0.1, y: 0 } },
    { type: 'basin', width: 0.5, depth: 0.4, position: 'wall', offset: { x: 0.1, y: 0 } },
  ],
  'Family Bathroom': [
    { type: 'bath', width: 1.7, depth: 0.7, position: 'wall', offset: { x: 0.1, y: 0.1 } },
    { type: 'toilet', width: 0.4, depth: 0.7, position: 'adjacent-wall', offset: { x: 0.1, y: 0 } },
    { type: 'basin', width: 0.6, depth: 0.45, position: 'adjacent-wall', offset: { x: 0.1, y: 0 } },
  ],
  'En-Suite': [
    { type: 'shower', width: 0.9, depth: 0.9, position: 'corner', offset: { x: 0.05, y: 0.05 } },
    { type: 'toilet', width: 0.4, depth: 0.65, position: 'wall', offset: { x: 0.1, y: 0 } },
    { type: 'basin', width: 0.45, depth: 0.35, position: 'wall', offset: { x: 0.1, y: 0 } },
  ],
  WC: [
    { type: 'toilet', width: 0.4, depth: 0.65, position: 'wall', offset: { x: 0.1, y: 0.1 } },
    { type: 'basin', width: 0.4, depth: 0.3, position: 'adjacent', offset: { x: 0.1, y: 0 } },
  ],
  Cloakroom: [
    { type: 'toilet', width: 0.4, depth: 0.65, position: 'wall', offset: { x: 0.1, y: 0.1 } },
    { type: 'basin', width: 0.4, depth: 0.3, position: 'adjacent', offset: { x: 0.1, y: 0 } },
  ],
  'Dining Room': [
    { type: 'dining-table', width: 1.8, depth: 1.0, position: 'center', offset: { x: 0, y: 0 } },
    { type: 'chairs', count: 6, around: 'table' },
    { type: 'sideboard', width: 1.5, depth: 0.45, position: 'wall', offset: { x: 0.2, y: 0.1 } },
  ],
  'Utility Room': [
    {
      type: 'washing-machine',
      width: 0.6,
      depth: 0.6,
      position: 'wall',
      offset: { x: 0.1, y: 0.1 },
    },
    { type: 'dryer', width: 0.6, depth: 0.6, position: 'adjacent', offset: { x: 0.1, y: 0 } },
    { type: 'utility-sink', width: 0.5, depth: 0.4, position: 'wall', offset: { x: 0.1, y: 0 } },
  ],
  Study: [
    { type: 'desk', width: 1.4, depth: 0.7, position: 'window-wall', offset: { x: 0.2, y: 0.1 } },
    { type: 'office-chair', width: 0.6, depth: 0.6, position: 'desk-front' },
    { type: 'bookshelf', width: 1.2, depth: 0.35, position: 'wall', offset: { x: 0.1, y: 0.1 } },
  ],
  'Home Office': [
    { type: 'desk', width: 1.6, depth: 0.8, position: 'window-wall', offset: { x: 0.2, y: 0.1 } },
    { type: 'office-chair', width: 0.6, depth: 0.6, position: 'desk-front' },
    { type: 'bookshelf', width: 1.4, depth: 0.35, position: 'wall', offset: { x: 0.1, y: 0.1 } },
  ],
  'Entrance Hall': [
    {
      type: 'console-table',
      width: 1.0,
      depth: 0.35,
      position: 'wall',
      offset: { x: 0.2, y: 0.1 },
    },
  ],
  Hallway: [],
  Landing: [],
};

/**
 * SVG patterns for wall hatching
 */
const WALL_PATTERNS = {
  exterior: `
    <pattern id="exterior-wall-hatch" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect width="8" height="8" fill="#333"/>
    </pattern>
  `,
  interior: `
    <pattern id="interior-wall-hatch" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill="#666"/>
    </pattern>
  `,
  diagonal: `
    <pattern id="diagonal-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="10" stroke="#444" stroke-width="2"/>
    </pattern>
  `,
};

/**
 * Architectural Floor Plan Generator class
 */
class ArchitecturalFloorPlanGenerator {
  /**
   * @param {Object} options - Generator options
   * @param {number} options.scale - Pixels per meter (default: 50)
   * @param {number} options.wallThickness - Exterior wall thickness in meters (default: 0.3)
   * @param {number} options.internalWallThickness - Interior wall thickness (default: 0.1)
   * @param {boolean} options.showFurniture - Show furniture symbols (default: true)
   * @param {boolean} options.showDimensions - Show dimension lines (default: true)
   * @param {boolean} options.showDoorSwings - Show door swing arcs (default: true)
   */
  constructor(options = {}) {
    this.scale = options.scale || 50; // pixels per meter
    this.wallThickness = options.wallThickness || 0.3;
    this.internalWallThickness = options.internalWallThickness || 0.1;
    this.showFurniture = options.showFurniture !== false;
    this.showDimensions = options.showDimensions !== false;
    this.showDoorSwings = options.showDoorSwings !== false;
    this.margin = options.margin || 80; // margin for dimensions
    this.strokeWidth = options.strokeWidth || 1;

    // Colors
    this.colors = {
      wall: '#333333',
      wallFill: '#333333',
      internalWall: '#555555',
      window: '#87CEEB',
      door: '#8B4513',
      furniture: '#999999',
      dimension: '#666666',
      text: '#333333',
      roomFill: '#FFFFFF',
      background: '#FFFFFF',
    };
  }

  /**
   * Generate floor plan SVG
   * @param {Object} geometry - Building geometry from BuildingGeometry class
   * @param {number} floor - Floor level to generate (0 = ground, 1 = first, etc.)
   * @param {Object} options - Generation options
   * @param {number} options.expectedRoomCount - Expected number of rooms (from program DNA)
   * @returns {string} SVG string
   * @throws {FloorPlanValidationError} If floor plan validation fails
   */
  generate(geometry, floor = 0, options = {}) {
    const { expectedRoomCount = 0 } = options;
    const floorData = geometry.getFloorPlanData(floor);

    // HARD GATE #1: Fail if no floor data exists
    if (!floorData) {
      throw new FloorPlanValidationError(
        `No floor data for floor ${floor}. Cannot generate floor plan.`,
        {
          floor,
          expectedRoomCount,
          reason: 'MISSING_FLOOR_DATA',
        }
      );
    }

    const { width, length, rooms, wallThickness } = floorData;

    // HARD GATE #2: Fail if program expects rooms but geometry has none
    const actualRoomCount = rooms?.length || 0;
    if (expectedRoomCount > 0 && actualRoomCount === 0) {
      throw new FloorPlanValidationError(
        `Floor ${floor} expected ${expectedRoomCount} rooms but geometry has 0. Geometry placement failed.`,
        {
          floor,
          expectedRoomCount,
          actualRoomCount,
          reason: 'EMPTY_ROOM_GEOMETRY',
        }
      );
    }

    // HARD GATE #3: Fail if >1 room expected but only perimeter (no interior walls will be drawn)
    if (expectedRoomCount > 1 && actualRoomCount <= 1) {
      throw new FloorPlanValidationError(
        `Floor ${floor} expected ${expectedRoomCount} rooms but geometry only has ${actualRoomCount}. Interior walls will be missing.`,
        {
          floor,
          expectedRoomCount,
          actualRoomCount,
          reason: 'INSUFFICIENT_ROOMS_FOR_INTERIOR_WALLS',
        }
      );
    }

    // Calculate SVG dimensions with margins
    const svgWidth = width * this.scale + this.margin * 2;
    const svgHeight = length * this.scale + this.margin * 2;

    // Start building SVG
    const parts = [];

    // SVG header and defs
    parts.push(this.generateHeader(svgWidth, svgHeight));
    parts.push(this.generateDefs());

    // Background
    parts.push(
      `<rect width="${svgWidth}" height="${svgHeight}" fill="${this.colors.background}"/>`
    );

    // Transform group to handle margins
    parts.push(`<g transform="translate(${this.margin}, ${this.margin})">`);

    // Check if we have polygon-based geometry data
    const hasPolygons = rooms?.some((r) => r.polygon?.length >= 3);
    const hasWalls = floorData.walls?.length > 0;

    if (hasPolygons || hasWalls) {
      console.log(
        `[FloorPlanGenerator] Using polygon-based rendering: ${rooms?.length} rooms with polygons, ${floorData.walls?.length || 0} walls`
      );
    }

    // Draw exterior walls (with hatching) - use geometry walls if available
    if (hasWalls) {
      parts.push(this.drawWallsFromGeometry(floorData.walls, 'exterior'));
    } else {
      parts.push(this.drawExteriorWalls(width, length));
    }

    // Draw rooms - use polygons if available for accurate geometry
    if (hasPolygons) {
      parts.push(this.drawRoomsWithPolygons(rooms));
    } else {
      parts.push(this.drawRooms(rooms, width, length));
    }

    // Draw internal walls - use geometry walls if available
    if (hasWalls) {
      parts.push(this.drawWallsFromGeometry(floorData.walls, 'interior'));
    } else {
      parts.push(this.drawInternalWalls(rooms, width, length));
    }

    // Draw doors with swings
    if (this.showDoorSwings) {
      parts.push(this.drawDoors(rooms, width, length));
    }

    // Draw windows
    parts.push(this.drawWindows(geometry, floor));

    // Draw furniture
    if (this.showFurniture) {
      parts.push(this.drawFurniture(rooms));
    }

    // Draw room labels
    parts.push(this.drawRoomLabels(rooms));

    // Close transform group
    parts.push('</g>');

    // Draw dimensions (outside the floor plan)
    if (this.showDimensions) {
      parts.push(this.drawDimensions(width, length, rooms));
    }

    // Draw north arrow
    parts.push(this.drawNorthArrow(svgWidth - 60, 60));

    // Draw scale bar
    parts.push(this.drawScaleBar(this.margin, svgHeight - 30));

    // Draw title
    parts.push(this.drawTitle(svgWidth / 2, 30, floorData.name || `Floor ${floor}`));

    // Close SVG
    parts.push('</svg>');

    return parts.join('\n');
  }

  /**
   * Generate SVG header with crisp orthographic line rendering
   */
  generateHeader(width, height) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges">`;
  }

  /**
   * Generate SVG defs (patterns, gradients, markers)
   */
  generateDefs() {
    return `
      <defs>
        ${WALL_PATTERNS.exterior}
        ${WALL_PATTERNS.interior}
        ${WALL_PATTERNS.diagonal}

        <!-- Dimension arrow markers -->
        <marker id="dim-arrow-start" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto">
          <path d="M10,0 L0,3 L10,6" fill="none" stroke="${this.colors.dimension}" stroke-width="1"/>
        </marker>
        <marker id="dim-arrow-end" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto">
          <path d="M0,0 L10,3 L0,6" fill="none" stroke="${this.colors.dimension}" stroke-width="1"/>
        </marker>

        <!-- Door swing arc clip -->
        <clipPath id="door-swing-clip">
          <rect x="-100" y="-100" width="1000" height="1000"/>
        </clipPath>
      </defs>
    `;
  }

  /**
   * Draw exterior walls with hatching
   */
  drawExteriorWalls(width, length) {
    const w = width * this.scale;
    const l = length * this.scale;
    const t = this.wallThickness * this.scale;

    return `
      <g class="exterior-walls">
        <!-- Exterior wall outline -->
        <rect x="0" y="0" width="${w}" height="${l}"
              fill="none" stroke="${this.colors.wall}" stroke-width="${t}"/>

        <!-- Wall hatching (poche) -->
        <!-- Top wall -->
        <rect x="0" y="0" width="${w}" height="${t}" fill="url(#exterior-wall-hatch)"/>
        <!-- Bottom wall -->
        <rect x="0" y="${l - t}" width="${w}" height="${t}" fill="url(#exterior-wall-hatch)"/>
        <!-- Left wall -->
        <rect x="0" y="0" width="${t}" height="${l}" fill="url(#exterior-wall-hatch)"/>
        <!-- Right wall -->
        <rect x="${w - t}" y="0" width="${t}" height="${l}" fill="url(#exterior-wall-hatch)"/>
      </g>
    `;
  }

  /**
   * Draw rooms with fills
   */
  drawRooms(rooms, buildingWidth, buildingLength) {
    if (!rooms || rooms.length === 0) {
      return '';
    }

    const parts = ['<g class="rooms">'];

    rooms.forEach((room, index) => {
      const x = (room.x || 0) * this.scale;
      const y = (room.y || 0) * this.scale;
      const w = (room.width || 4) * this.scale;
      const h = (room.length || 4) * this.scale;

      parts.push(`
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
              fill="${this.colors.roomFill}" stroke="none"
              data-room="${room.name}" data-index="${index}"/>
      `);
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw internal walls
   */
  drawInternalWalls(rooms, buildingWidth, buildingLength) {
    if (!rooms || rooms.length === 0) {
      return '';
    }

    const parts = ['<g class="internal-walls">'];
    const t = this.internalWallThickness * this.scale;

    // Draw walls between adjacent rooms
    rooms.forEach((room, i) => {
      const x = (room.x || 0) * this.scale;
      const y = (room.y || 0) * this.scale;
      const w = (room.width || 4) * this.scale;
      const h = (room.length || 4) * this.scale;

      // Right wall
      if (x + w < buildingWidth * this.scale - this.wallThickness * this.scale) {
        parts.push(`
          <rect x="${x + w}" y="${y}" width="${t}" height="${h}"
                fill="url(#interior-wall-hatch)" stroke="${this.colors.internalWall}" stroke-width="0.5"/>
        `);
      }

      // Bottom wall
      if (y + h < buildingLength * this.scale - this.wallThickness * this.scale) {
        parts.push(`
          <rect x="${x}" y="${y + h}" width="${w}" height="${t}"
                fill="url(#interior-wall-hatch)" stroke="${this.colors.internalWall}" stroke-width="0.5"/>
        `);
      }
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw rooms using polygon data from populatedGeometry
   * This produces accurate room shapes instead of rectangles
   */
  drawRoomsWithPolygons(rooms) {
    if (!rooms || rooms.length === 0) {
      return '';
    }

    const parts = ['<g class="rooms-polygons">'];

    rooms.forEach((room, index) => {
      if (!room.polygon || room.polygon.length < 3) {
        // Fallback to rectangle if no polygon
        const x = (room.x || 0) * this.scale;
        const y = (room.y || 0) * this.scale;
        const w = (room.width || 4) * this.scale;
        const h = (room.length || 4) * this.scale;
        parts.push(`
          <rect x="${x}" y="${y}" width="${w}" height="${h}"
                fill="${this.colors.roomFill}" stroke="none"
                data-room="${room.name}" data-index="${index}"/>
        `);
        return;
      }

      // Convert polygon points to SVG coordinates
      const points = room.polygon
        .map((p) => {
          // Handle both mm (>100) and meter (<100) units
          const x = p.x > 100 ? (p.x / 1000) * this.scale : p.x * this.scale;
          const y = p.y > 100 ? (p.y / 1000) * this.scale : p.y * this.scale;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

      parts.push(`
        <polygon points="${points}"
                 fill="${this.colors.roomFill}" stroke="none"
                 data-room="${room.name}" data-index="${index}"/>
      `);
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw walls using geometry data from populatedGeometry
   * Walls have start/end coordinates and thickness
   * @param {Array} walls - Wall array with start, end, thickness, type
   * @param {string} filterType - 'exterior', 'interior', or 'all'
   */
  drawWallsFromGeometry(walls, filterType = 'all') {
    if (!walls || walls.length === 0) {
      return '';
    }

    const parts = [`<g class="walls-geometry-${filterType}">`];

    walls.forEach((wall) => {
      if (!wall.start || !wall.end) {
        return;
      }

      // Filter by wall type if specified
      const wallType = (wall.type || 'exterior').toLowerCase();
      if (
        filterType === 'exterior' &&
        !wallType.includes('exterior') &&
        !wallType.includes('external')
      ) {
        return;
      }
      if (
        filterType === 'interior' &&
        (wallType.includes('exterior') || wallType.includes('external'))
      ) {
        return;
      }

      // Handle both mm and meter units
      const startX =
        wall.start.x > 100 ? (wall.start.x / 1000) * this.scale : wall.start.x * this.scale;
      const startY =
        wall.start.y > 100 ? (wall.start.y / 1000) * this.scale : wall.start.y * this.scale;
      const endX = wall.end.x > 100 ? (wall.end.x / 1000) * this.scale : wall.end.x * this.scale;
      const endY = wall.end.y > 100 ? (wall.end.y / 1000) * this.scale : wall.end.y * this.scale;

      // Calculate wall thickness in pixels
      const thickness =
        wall.thickness > 1
          ? (wall.thickness / 1000) * this.scale // mm to pixels
          : wall.thickness * this.scale; // meters to pixels

      // Calculate wall angle and perpendicular offset
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length < 1) {return;} // Skip degenerate walls

      // Perpendicular vector for wall thickness
      const nx = -dy / length;
      const ny = dx / length;
      const halfThick = thickness / 2;

      // Create wall polygon (rectangle with thickness)
      const x1 = startX + nx * halfThick;
      const y1 = startY + ny * halfThick;
      const x2 = startX - nx * halfThick;
      const y2 = startY - ny * halfThick;
      const x3 = endX - nx * halfThick;
      const y3 = endY - ny * halfThick;
      const x4 = endX + nx * halfThick;
      const y4 = endY + ny * halfThick;

      const points = `${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)}`;

      const isExterior = wallType.includes('exterior') || wallType.includes('external');
      const fillPattern = isExterior ? 'url(#exterior-wall-hatch)' : 'url(#interior-wall-hatch)';
      const strokeColor = isExterior ? this.colors.wall : this.colors.internalWall;

      parts.push(`
        <polygon points="${points}"
                 fill="${fillPattern}" stroke="${strokeColor}" stroke-width="0.5"
                 data-wall-id="${wall.id || ''}" data-wall-type="${wallType}"/>
      `);

      // Draw openings in walls (doors, windows)
      if (wall.openings && wall.openings.length > 0) {
        wall.openings.forEach((opening) => {
          parts.push(
            this.drawWallOpening(opening, wall, startX, startY, endX, endY, length, thickness)
          );
        });
      }
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw an opening (door/window) in a wall
   */
  drawWallOpening(opening, wall, startX, startY, endX, endY, wallLength, wallThickness) {
    // Position is distance from wall start to opening center
    const position =
      opening.position > 100
        ? (opening.position / 1000) * this.scale
        : opening.position * this.scale;

    const openingWidth =
      opening.width > 100
        ? (opening.width / 1000) * this.scale
        : (opening.width || 0.9) * this.scale;

    // Calculate opening position along wall
    const t = position / ((wallLength / this.scale) * (wall.start.x > 100 ? 1000 : 1));
    const centerX = startX + (endX - startX) * Math.min(1, Math.max(0, t));
    const centerY = startY + (endY - startY) * Math.min(1, Math.max(0, t));

    // Direction along wall
    const dx = ((endX - startX) / wallLength) * this.scale;
    const dy = ((endY - startY) / wallLength) * this.scale;

    const halfWidth = openingWidth / 2;
    const x1 = centerX - dx * halfWidth;
    const y1 = centerY - dy * halfWidth;
    const x2 = centerX + dx * halfWidth;
    const y2 = centerY + dy * halfWidth;

    if (opening.type === 'door') {
      // Door: clear opening with door swing
      return `
        <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
              x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
              stroke="${this.colors.background}" stroke-width="${wallThickness + 2}"/>
        <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
              x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
              stroke="${this.colors.door}" stroke-width="2"/>
      `;
    } else {
      // Window: parallel lines indicating glazing
      return `
        <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
              x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
              stroke="${this.colors.background}" stroke-width="${wallThickness + 2}"/>
        <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
              x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
              stroke="${this.colors.window}" stroke-width="3"/>
        <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
              x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
              stroke="${this.colors.wall}" stroke-width="1"/>
      `;
    }
  }

  /**
   * Draw doors with swing arcs
   */
  drawDoors(rooms, buildingWidth, buildingLength) {
    const parts = ['<g class="doors">'];
    const doorWidth = 0.9 * this.scale; // 900mm door
    const doorThickness = 0.05 * this.scale;

    rooms.forEach((room, index) => {
      if (!room.hasDoor && room.name !== 'Entrance Hall' && room.name !== 'Hallway') {
        return;
      }

      const x = (room.x || 0) * this.scale;
      const y = (room.y || 0) * this.scale;
      const w = (room.width || 4) * this.scale;
      const h = (room.length || 4) * this.scale;

      // Determine door position based on room type
      let doorX, doorY, rotation, swingDirection;

      const roomName = (room.name || '').toLowerCase();

      if (roomName.includes('entrance')) {
        // Main entrance on south wall (bottom)
        doorX = x + w / 2 - doorWidth / 2;
        doorY = y + h - doorThickness;
        rotation = 0;
        swingDirection = 'inward';
      } else if (
        roomName.includes('bathroom') ||
        roomName.includes('wc') ||
        roomName.includes('en-suite')
      ) {
        // Bathroom doors open outward
        doorX = x;
        doorY = y + h / 3;
        rotation = 90;
        swingDirection = 'outward';
      } else {
        // Interior doors - position on left wall
        doorX = x - doorThickness;
        doorY = y + h / 3;
        rotation = 90;
        swingDirection = 'inward';
      }

      // Draw door leaf
      parts.push(`
        <rect x="${doorX}" y="${doorY}" width="${doorWidth}" height="${doorThickness}"
              fill="${this.colors.door}" stroke="${this.colors.wall}" stroke-width="0.5"
              transform="rotate(${rotation}, ${doorX}, ${doorY})"/>
      `);

      // Draw door swing arc
      const arcRadius = doorWidth;
      const arcStartX = rotation === 0 ? doorX : doorX + doorThickness;
      const arcStartY = rotation === 0 ? doorY : doorY;

      if (swingDirection === 'inward') {
        parts.push(this.drawDoorSwingArc(arcStartX, arcStartY, arcRadius, rotation, 'left'));
      } else {
        parts.push(this.drawDoorSwingArc(arcStartX, arcStartY, arcRadius, rotation + 180, 'right'));
      }
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw door swing arc
   */
  drawDoorSwingArc(x, y, radius, baseAngle, side) {
    const startAngle = baseAngle * (Math.PI / 180);
    const sweepAngle = (side === 'left' ? -90 : 90) * (Math.PI / 180);
    const endAngle = startAngle + sweepAngle;

    const startX = x + radius * Math.cos(startAngle);
    const startY = y + radius * Math.sin(startAngle);
    const endX = x + radius * Math.cos(endAngle);
    const endY = y + radius * Math.sin(endAngle);

    const largeArc = Math.abs(sweepAngle) > Math.PI ? 1 : 0;
    const sweep = sweepAngle > 0 ? 1 : 0;

    return `
      <path d="M ${x} ${y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY} Z"
            fill="none" stroke="${this.colors.dimension}" stroke-width="0.5" stroke-dasharray="3,2"/>
    `;
  }

  /**
   * Draw windows on exterior walls
   */
  drawWindows(geometry, floor) {
    const parts = ['<g class="windows">'];
    const openings = geometry.openings || {};
    const windowWidth = 1.2 * this.scale;
    const windowDepth = 0.15 * this.scale;

    // Draw windows for each direction
    ['north', 'south', 'east', 'west'].forEach((direction) => {
      const directionOpenings = openings[direction] || [];
      const windowsOnFloor = directionOpenings.filter(
        (o) => o.floor === floor && o.type === 'window'
      );

      windowsOnFloor.forEach((win) => {
        const x = win.x * this.scale;
        const y = win.y * this.scale || 0;

        let wx, wy, ww, wh;

        switch (direction) {
          case 'north':
            wx = x - windowWidth / 2;
            wy = 0;
            ww = windowWidth;
            wh = windowDepth;
            break;
          case 'south':
            wx = x - windowWidth / 2;
            wy = geometry.dimensions.length * this.scale - windowDepth;
            ww = windowWidth;
            wh = windowDepth;
            break;
          case 'east':
            wx = geometry.dimensions.width * this.scale - windowDepth;
            wy = x - windowWidth / 2;
            ww = windowDepth;
            wh = windowWidth;
            break;
          case 'west':
            wx = 0;
            wy = x - windowWidth / 2;
            ww = windowDepth;
            wh = windowWidth;
            break;
        }

        // Window opening (break in wall)
        parts.push(`
          <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}"
                fill="${this.colors.background}" stroke="none"/>
        `);

        // Window frame
        parts.push(`
          <rect x="${wx}" y="${wy}" width="${ww}" height="${wh}"
                fill="none" stroke="${this.colors.wall}" stroke-width="2"/>
        `);

        // Window glass indication (parallel lines)
        if (direction === 'north' || direction === 'south') {
          parts.push(`
            <line x1="${wx + 2}" y1="${wy + wh / 2}" x2="${wx + ww - 2}" y2="${wy + wh / 2}"
                  stroke="${this.colors.window}" stroke-width="2"/>
          `);
        } else {
          parts.push(`
            <line x1="${wx + ww / 2}" y1="${wy + 2}" x2="${wx + ww / 2}" y2="${wy + wh - 2}"
                  stroke="${this.colors.window}" stroke-width="2"/>
          `);
        }
      });
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw furniture symbols
   */
  drawFurniture(rooms) {
    const parts = ['<g class="furniture" opacity="0.6">'];

    rooms.forEach((room) => {
      const roomName = room.name || '';
      const furniture = this.getFurnitureForRoom(roomName);

      if (!furniture || furniture.length === 0) {
        return;
      }

      const x = (room.x || 0) * this.scale;
      const y = (room.y || 0) * this.scale;
      const w = (room.width || 4) * this.scale;
      const h = (room.length || 4) * this.scale;

      furniture.forEach((item) => {
        const symbol = this.drawFurnitureSymbol(item, x, y, w, h);
        if (symbol) {
          parts.push(symbol);
        }
      });
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Get furniture configuration for a room
   */
  getFurnitureForRoom(roomName) {
    // Exact match first
    if (FURNITURE_SYMBOLS[roomName]) {
      return FURNITURE_SYMBOLS[roomName];
    }

    // Partial match
    const lowerName = roomName.toLowerCase();
    for (const [key, value] of Object.entries(FURNITURE_SYMBOLS)) {
      if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName)) {
        return value;
      }
    }

    return [];
  }

  /**
   * Draw individual furniture symbol
   */
  drawFurnitureSymbol(item, roomX, roomY, roomW, roomH) {
    const itemW = (typeof item.width === 'number' ? item.width : 1) * this.scale;
    const itemH = (item.depth || 0.5) * this.scale;
    const offset = item.offset || { x: 0, y: 0 };

    let x, y;

    // Calculate position based on position type
    switch (item.position) {
      case 'center':
        x = roomX + roomW / 2 - itemW / 2;
        y = roomY + roomH / 2 - itemH / 2;
        break;
      case 'center-wall':
        x = roomX + roomW / 2 - itemW / 2;
        y = roomY + offset.y * this.scale;
        break;
      case 'corner':
        x = roomX + offset.x * this.scale;
        y = roomY + offset.y * this.scale;
        break;
      case 'wall':
        x = roomX + offset.x * this.scale;
        y = roomY + offset.y * this.scale;
        break;
      case 'opposite-wall':
        x = roomX + roomW - itemW - offset.x * this.scale;
        y = roomY + roomH - itemH - offset.y * this.scale;
        break;
      case 'room-center':
        x = roomX + roomW / 2 - itemW / 2;
        y = roomY + roomH * 0.6 - itemH / 2;
        break;
      default:
        x = roomX + roomW / 2 - itemW / 2;
        y = roomY + roomH / 2 - itemH / 2;
    }

    // Draw based on furniture type
    return this.getFurnitureShape(item.type, x, y, itemW, itemH);
  }

  /**
   * Get SVG shape for furniture type
   */
  getFurnitureShape(type, x, y, w, h) {
    const stroke = this.colors.furniture;
    const fill = 'none';

    switch (type) {
      case 'sofa':
        return `
          <g class="sofa">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h * 0.3}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'double-bed':
      case 'single-bed':
        return `
          <g class="bed">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <rect x="${x + w * 0.1}" y="${y + 2}" width="${w * 0.8}" height="${h * 0.2}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
            <line x1="${x}" y1="${y + h * 0.3}" x2="${x + w}" y2="${y + h * 0.3}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'bath':
        return `
          <g class="bath">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <ellipse cx="${x + w * 0.7}" cy="${y + h * 0.3}" rx="${w * 0.08}" ry="${h * 0.1}" fill="${stroke}"/>
          </g>
        `;

      case 'shower':
        return `
          <g class="shower">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${stroke}" stroke-width="0.5" stroke-dasharray="4,2"/>
            <line x1="${x + w}" y1="${y}" x2="${x}" y2="${y + h}" stroke="${stroke}" stroke-width="0.5" stroke-dasharray="4,2"/>
            <circle cx="${x + w * 0.5}" cy="${y + h * 0.3}" r="${Math.min(w, h) * 0.1}" fill="${stroke}"/>
          </g>
        `;

      case 'toilet':
        return `
          <g class="toilet">
            <ellipse cx="${x + w / 2}" cy="${y + h * 0.6}" rx="${w * 0.45}" ry="${h * 0.35}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <rect x="${x + w * 0.2}" y="${y}" width="${w * 0.6}" height="${h * 0.3}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
          </g>
        `;

      case 'basin':
        return `
          <g class="basin">
            <ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w * 0.45}" ry="${h * 0.4}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <circle cx="${x + w / 2}" cy="${y + h * 0.4}" r="${Math.min(w, h) * 0.08}" fill="${stroke}"/>
          </g>
        `;

      case 'sink':
        return `
          <g class="sink">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.15}" fill="${stroke}"/>
          </g>
        `;

      case 'cooktop':
        return `
          <g class="cooktop">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <circle cx="${x + w * 0.3}" cy="${y + h * 0.35}" r="${Math.min(w, h) * 0.15}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
            <circle cx="${x + w * 0.7}" cy="${y + h * 0.35}" r="${Math.min(w, h) * 0.15}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
            <circle cx="${x + w * 0.3}" cy="${y + h * 0.65}" r="${Math.min(w, h) * 0.12}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
            <circle cx="${x + w * 0.7}" cy="${y + h * 0.65}" r="${Math.min(w, h) * 0.12}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'fridge':
        return `
          <g class="fridge">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <line x1="${x}" y1="${y + h * 0.4}" x2="${x + w}" y2="${y + h * 0.4}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'dining-table':
        return `
          <g class="dining-table">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
          </g>
        `;

      case 'desk':
        return `
          <g class="desk">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
          </g>
        `;

      case 'wardrobe':
        return `
          <g class="wardrobe">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'coffee-table':
        return `
          <g class="coffee-table">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'armchair':
        return `
          <g class="armchair">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h * 0.25}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      case 'washing-machine':
      case 'dryer':
        return `
          <g class="${type}">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
            <circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.3}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>
          </g>
        `;

      default:
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>`;
    }
  }

  /**
   * Draw room labels with names and areas
   */
  drawRoomLabels(rooms) {
    const parts = ['<g class="room-labels">'];

    rooms.forEach((room) => {
      const x = (room.x || 0) * this.scale + ((room.width || 4) * this.scale) / 2;
      const y = (room.y || 0) * this.scale + ((room.length || 4) * this.scale) / 2;

      const area = room.area || room.width * room.length;
      const areaText = `${area.toFixed(1)}m²`;

      parts.push(`
        <text x="${x}" y="${y - 8}" text-anchor="middle" font-family="Arial, sans-serif"
              font-size="11" font-weight="bold" fill="${this.colors.text}">${room.name || 'Room'}</text>
        <text x="${x}" y="${y + 8}" text-anchor="middle" font-family="Arial, sans-serif"
              font-size="9" fill="${this.colors.dimension}">${areaText}</text>
      `);
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw dimension lines
   */
  drawDimensions(width, length, rooms) {
    const parts = ['<g class="dimensions">'];
    const dimOffset = 25;

    // Overall width dimension (top)
    parts.push(
      this.drawDimensionLine(
        this.margin,
        this.margin - dimOffset,
        this.margin + width * this.scale,
        this.margin - dimOffset,
        `${width.toFixed(2)}m`,
        'horizontal'
      )
    );

    // Overall length dimension (right)
    parts.push(
      this.drawDimensionLine(
        this.margin + width * this.scale + dimOffset,
        this.margin,
        this.margin + width * this.scale + dimOffset,
        this.margin + length * this.scale,
        `${length.toFixed(2)}m`,
        'vertical'
      )
    );

    // Room dimensions (simplified)
    rooms.forEach((room) => {
      if (room.width && room.width > 2) {
        const rx = this.margin + (room.x || 0) * this.scale;
        const ry = this.margin + (room.y || 0) * this.scale;
        const rw = room.width * this.scale;
        const rh = room.length * this.scale;

        // Width inside room
        parts.push(`
          <text x="${rx + rw / 2}" y="${ry + rh - 15}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="8" fill="${this.colors.dimension}">
            ${room.width.toFixed(1)}m
          </text>
        `);

        // Length inside room (rotated)
        parts.push(`
          <text x="${rx + 12}" y="${ry + rh / 2}" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="8" fill="${this.colors.dimension}"
                transform="rotate(-90, ${rx + 12}, ${ry + rh / 2})">
            ${room.length.toFixed(1)}m
          </text>
        `);
      }
    });

    parts.push('</g>');
    return parts.join('\n');
  }

  /**
   * Draw a dimension line with text
   */
  drawDimensionLine(x1, y1, x2, y2, text, orientation) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const tick = 5;
    let tick1, tick2, textY, textRotate;

    if (orientation === 'horizontal') {
      tick1 = `M${x1},${y1 - tick} L${x1},${y1 + tick}`;
      tick2 = `M${x2},${y2 - tick} L${x2},${y2 + tick}`;
      textY = midY - 5;
      textRotate = '';
    } else {
      tick1 = `M${x1 - tick},${y1} L${x1 + tick},${y1}`;
      tick2 = `M${x2 - tick},${y2} L${x2 + tick},${y2}`;
      textY = midY;
      textRotate = `transform="rotate(-90, ${midX + 15}, ${textY})"`;
    }

    return `
      <g class="dimension-line">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="${this.colors.dimension}" stroke-width="0.5"
              marker-start="url(#dim-arrow-start)" marker-end="url(#dim-arrow-end)"/>
        <path d="${tick1}" stroke="${this.colors.dimension}" stroke-width="0.5"/>
        <path d="${tick2}" stroke="${this.colors.dimension}" stroke-width="0.5"/>
        <text x="${orientation === 'horizontal' ? midX : midX + 15}" y="${textY}"
              text-anchor="middle" font-family="Arial, sans-serif" font-size="10"
              fill="${this.colors.dimension}" ${textRotate}>${text}</text>
      </g>
    `;
  }

  /**
   * Draw north arrow
   */
  drawNorthArrow(x, y) {
    const size = 30;

    return `
      <g class="north-arrow" transform="translate(${x}, ${y})">
        <polygon points="0,-${size / 2} ${size / 4},${size / 2} 0,${size / 4} -${size / 4},${size / 2}"
                 fill="#333" stroke="#333" stroke-width="1"/>
        <text x="0" y="-${size / 2 + 5}" text-anchor="middle"
              font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#333">N</text>
      </g>
    `;
  }

  /**
   * Draw scale bar
   */
  drawScaleBar(x, y) {
    const barLength = 2 * this.scale; // 2 meters
    const barHeight = 6;

    return `
      <g class="scale-bar" transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${barLength / 2}" height="${barHeight}" fill="#333"/>
        <rect x="${barLength / 2}" y="0" width="${barLength / 2}" height="${barHeight}" fill="#fff" stroke="#333" stroke-width="0.5"/>
        <text x="0" y="${barHeight + 12}" font-family="Arial, sans-serif" font-size="8" fill="#333">0</text>
        <text x="${barLength / 2}" y="${barHeight + 12}" font-family="Arial, sans-serif" font-size="8" fill="#333" text-anchor="middle">1m</text>
        <text x="${barLength}" y="${barHeight + 12}" font-family="Arial, sans-serif" font-size="8" fill="#333" text-anchor="end">2m</text>
        <text x="${barLength / 2}" y="-5" font-family="Arial, sans-serif" font-size="9" fill="#333" text-anchor="middle">Scale 1:${Math.round(1000 / this.scale)}</text>
      </g>
    `;
  }

  /**
   * Draw title
   */
  drawTitle(x, y, text) {
    return `
      <text x="${x}" y="${y}" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#333">
        ${text}
      </text>
    `;
  }

  /**
   * Generate empty plan fallback - DEPRECATED
   * This method should NOT be used in production. Use the hard gates instead.
   * Keeping for backward compatibility with tests/mocks only.
   * @deprecated Use hard validation gates - panels should fail, not produce placeholders
   */
  generateEmptyPlan() {
    console.warn(
      '[FloorPlanGenerator] generateEmptyPlan() is DEPRECATED. Floor plans should fail validation, not produce placeholders.'
    );
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
        <rect width="400" height="300" fill="#f5f5f5"/>
        <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="14" fill="#999">
          No floor plan data available
        </text>
      </svg>
    `;
  }

  /**
   * Validate generated floor plan SVG for degenerate content
   * Called after generation to ensure SVG contains expected elements
   * @param {string} svg - Generated SVG string
   * @param {Object} options - Validation options
   * @param {number} options.expectedRoomCount - Expected number of rooms
   * @param {number} options.floor - Floor level
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  static validateFloorPlanSVG(svg, options = {}) {
    const { expectedRoomCount = 0, floor = 0 } = options;
    const errors = [];
    const warnings = [];

    if (!svg || typeof svg !== 'string') {
      errors.push('SVG is null or not a string');
      return { valid: false, errors, warnings };
    }

    // Check for minimum SVG structure
    if (!svg.includes('<svg') || !svg.includes('</svg>')) {
      errors.push('Invalid SVG structure: missing svg tags');
      return { valid: false, errors, warnings };
    }

    // Check for viewBox (required for proper scaling)
    if (!svg.includes('viewBox=')) {
      warnings.push('SVG missing viewBox attribute - may cause scaling issues');
    }

    // Count room elements (data-room attribute on rects)
    const roomRegex = /<rect[^>]*data-room="([^"]+)"/g;
    const roomMatches = [...svg.matchAll(roomRegex)];
    const actualRoomCount = roomMatches.length;

    // Hard validation: if expected rooms > 0, actual must match
    if (expectedRoomCount > 0 && actualRoomCount === 0) {
      errors.push(`Floor ${floor}: Expected ${expectedRoomCount} room elements but found 0 in SVG`);
    }

    // Check for interior walls when multiple rooms expected
    const hasInteriorWalls =
      svg.includes('class="internal-walls"') &&
      svg.includes('<rect') &&
      svg.includes('interior-wall-hatch');

    if (expectedRoomCount > 1 && !hasInteriorWalls) {
      errors.push(
        `Floor ${floor}: Expected interior walls for ${expectedRoomCount} rooms but none found in SVG`
      );
    }

    // Check for room labels
    const hasRoomLabels = svg.includes('class="room-labels"');
    if (expectedRoomCount > 0 && !hasRoomLabels) {
      warnings.push('Floor plan missing room labels');
    }

    // Check for dimensions
    const hasDimensions =
      svg.includes('class="dimensions"') || svg.includes('class="dimension-line"');
    if (!hasDimensions) {
      warnings.push('Floor plan missing dimension lines');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        actualRoomCount,
        hasInteriorWalls,
        hasRoomLabels,
        hasDimensions,
      },
    };
  }
}

// Door swing radius constant for 90° arc
const DOOR_SWING_RADIUS = 0.9; // meters (standard door width)

/**
 * Convenience function to generate floor plan from geometry
 * @param {Object} geometry - Building geometry
 * @param {number} floor - Floor level
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
function generate(geometry, floor = 0, options = {}) {
  const generator = new ArchitecturalFloorPlanGenerator(options);
  return generator.generate(geometry, floor, options);
}

/**
 * Generate floor plan directly from DNA
 * @param {Object} dna - Design DNA
 * @param {number} floor - Floor level
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
function generateFromDNA(dna, floor = 0, options = {}) {
  const geometry = buildGeometryFromDNA(dna, floor);
  const generator = new ArchitecturalFloorPlanGenerator(options);
  return generator.generate(geometry, floor, options);
}

/**
 * Build geometry structure from DNA for floor plan generation
 */
function buildGeometryFromDNA(dna, targetFloor = 0) {
  const { dimensions, rooms, materials } = dna;

  // Filter rooms for the target floor
  const floorRooms = rooms.filter((r) => (r.floor || 0) === targetFloor);

  // Calculate room positions using strip-packing
  let currentX = 0.3;
  let currentY = 0.3;
  let rowHeight = 0;
  const maxWidth = dimensions.width - 0.6;

  const positionedRooms = floorRooms.map((room) => {
    const roomDims = room.dimensions || {};
    const roomWidth = roomDims.length || roomDims.width || 4;
    const roomLength = roomDims.width || roomDims.height || 4;

    // Check if room fits in current row
    if (currentX + roomWidth > maxWidth) {
      currentX = 0.3;
      currentY += rowHeight + 0.1;
      rowHeight = 0;
    }

    const positioned = {
      ...room,
      x: currentX,
      y: currentY,
      width: roomWidth,
      length: roomLength,
      area: roomWidth * roomLength,
      hasDoor: true,
    };

    currentX += roomWidth + 0.1;
    rowHeight = Math.max(rowHeight, roomLength);

    return positioned;
  });

  return {
    dimensions: {
      width: dimensions.width,
      length: dimensions.length,
      height: dimensions.height,
    },
    openings: {},
    getFloorPlanData: (floor) => ({
      width: dimensions.width,
      length: dimensions.length,
      rooms: positionedRooms,
      wallThickness: 0.3,
      name: floor === 0 ? 'Ground Floor' : `Floor ${floor}`,
    }),
  };
}

/**
 * Public API: Generate floor plan SVG from floor data
 *
 * This is the primary export for canonical floor plan generation.
 * Used by CanonicalDesignState to populate canonicalRenders.floorPlansSVG
 *
 * @param {Object} floorData - Floor data containing rooms, walls, doors, stairs
 * @param {Object} options - Generation options
 * @param {boolean} options.showFurniture - Include furniture symbols (default: true)
 * @param {boolean} options.showDimensions - Show dimension lines (default: true)
 * @param {boolean} options.showNorthArrow - Show north arrow (default: true)
 * @param {number} options.scale - Pixels per meter (default: 50)
 * @param {number} options.northRotation - North arrow rotation in degrees (default: 0)
 * @returns {string} SVG string
 */
export function generateFloorPlanSVG(floorData, options = {}) {
  const {
    showFurniture = true,
    showDimensions = true,
    showNorthArrow = true,
    scale = 50,
    northRotation = 0,
  } = options;

  // Convert floorData to geometry format expected by generator
  const geometry = {
    rooms: floorData.rooms || [],
    walls: floorData.walls || [],
    doors: floorData.doors || [],
    stairs: floorData.stairs || [],
    dimensions: floorData.dimensions || {
      width: floorData.width || 15,
      length: floorData.length || 10,
    },
    floor: floorData.floorIndex ?? floorData.floor ?? 0,
    floorLabel: floorData.floorLabel || `Floor ${floorData.floorIndex ?? 0}`,
    northRotation,
  };

  const generator = new ArchitecturalFloorPlanGenerator({
    scale,
    showLabels: true,
    showGrid: false,
    showFurniture,
    showDimensions,
    showNorthArrow,
    northRotation,
  });

  return generator.generate(geometry, geometry.floor, options);
}

/**
 * Generate all floor plan SVGs for a building
 *
 * @param {Object} masterDNA - Master design DNA
 * @param {Array} programSpaces - Program spaces array
 * @param {Object} options - Generation options
 * @returns {Object} Map of floor index to SVG string { 0: "...", 1: "...", ... }
 */
export function generateAllFloorPlanSVGs(masterDNA, programSpaces = [], options = {}) {
  const floorCount = masterDNA.dimensions?.floors || masterDNA.dimensions?.floorCount || 1;
  const floorPlansSVG = {};

  for (let floorIndex = 0; floorIndex < floorCount; floorIndex++) {
    try {
      const svg = generateFromDNA(masterDNA, floorIndex, {
        ...options,
        showFurniture: options.showFurniture ?? true,
        showDimensions: options.showDimensions ?? true,
        showNorthArrow: floorIndex === 0, // Only show north arrow on ground floor
      });
      floorPlansSVG[floorIndex] = svg;
    } catch (error) {
      console.warn(`Failed to generate SVG for floor ${floorIndex}:`, error.message);
      floorPlansSVG[floorIndex] = null;
    }
  }

  return floorPlansSVG;
}

// Export
// FloorPlanValidationError is already exported at class definition
export default ArchitecturalFloorPlanGenerator;
export {
  ArchitecturalFloorPlanGenerator,
  FURNITURE_SYMBOLS,
  WALL_PATTERNS,
  DOOR_SWING_RADIUS,
  generate,
  generateFromDNA,
};
