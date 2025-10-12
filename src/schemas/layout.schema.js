/**
 * Canonical Layout Schema
 * Defines the geometric representation of building layouts for DXF export
 */

/**
 * Point type definition
 */
export const PointSchema = {
  x: { type: 'number', required: true },
  y: { type: 'number', required: true },
  z: { type: 'number', required: false, default: 0 }
};

/**
 * Line segment type definition
 */
export const LineSchema = {
  start: { type: 'object', required: true, schema: PointSchema },
  end: { type: 'object', required: true, schema: PointSchema },
  type: { type: 'string', required: false, enum: ['wall', 'door', 'window', 'partition'] }
};

/**
 * Polygon type definition
 */
export const PolygonSchema = {
  points: {
    type: 'array',
    required: true,
    minLength: 3,
    schema: PointSchema
  },
  closed: { type: 'boolean', required: false, default: true }
};

/**
 * Room definition
 */
export const RoomSchema = {
  id: { type: 'string', required: true },
  name: { type: 'string', required: true },
  polygon: { type: 'object', required: true, schema: PolygonSchema },
  area: { type: 'number', required: true },
  height: { type: 'number', required: false, default: 3.0 },
  type: { type: 'string', required: false },
  floor: { type: 'number', required: true }
};

/**
 * Wall definition
 */
export const WallSchema = {
  id: { type: 'string', required: true },
  line: { type: 'object', required: true, schema: LineSchema },
  thickness: { type: 'number', required: false, default: 0.2 },
  height: { type: 'number', required: false, default: 3.0 },
  type: { type: 'string', required: false, enum: ['exterior', 'interior', 'partition'] }
};

/**
 * Opening definition (doors and windows)
 */
export const OpeningSchema = {
  id: { type: 'string', required: true },
  type: { type: 'string', required: true, enum: ['door', 'window'] },
  position: { type: 'object', required: true, schema: PointSchema },
  width: { type: 'number', required: true },
  height: { type: 'number', required: true },
  wallId: { type: 'string', required: false },
  orientation: { type: 'number', required: false, default: 0 }
};

/**
 * Level/Floor definition
 */
export const LevelSchema = {
  index: { type: 'number', required: true },
  name: { type: 'string', required: true },
  elevation: { type: 'number', required: true },
  height: { type: 'number', required: true },
  rooms: { type: 'array', required: true, schema: RoomSchema },
  walls: { type: 'array', required: true, schema: WallSchema },
  openings: { type: 'array', required: false, schema: OpeningSchema },
  footprint: { type: 'object', required: false, schema: PolygonSchema }
};

/**
 * Complete Layout Schema
 */
export const LayoutSchema = {
  // Building Information
  building: {
    name: { type: 'string', required: false },
    type: { type: 'string', required: false },
    totalArea: { type: 'number', required: true },
    footprintArea: { type: 'number', required: true },
    height: { type: 'number', required: true }
  },

  // Coordinate System
  coordinates: {
    system: { type: 'string', required: false, default: 'local' },
    units: { type: 'string', required: true, enum: ['meters', 'millimeters', 'feet', 'inches'] },
    origin: { type: 'object', required: false, schema: PointSchema }
  },

  // Site Boundary
  site: {
    boundary: { type: 'object', required: false, schema: PolygonSchema },
    setbacks: {
      front: { type: 'number', required: false },
      rear: { type: 'number', required: false },
      left: { type: 'number', required: false },
      right: { type: 'number', required: false }
    }
  },

  // Building Levels
  levels: {
    type: 'array',
    required: true,
    minLength: 1,
    schema: LevelSchema
  },

  // Structural Grid
  grid: {
    type: { type: 'string', required: false, enum: ['orthogonal', 'radial', 'irregular'] },
    spacing: {
      x: { type: 'number', required: false },
      y: { type: 'number', required: false }
    },
    lines: {
      x: { type: 'array', required: false }, // Array of x-coordinates
      y: { type: 'array', required: false }  // Array of y-coordinates
    }
  },

  // Metadata
  metadata: {
    version: { type: 'string', required: true, default: '1.0.0' },
    timestamp: { type: 'string', required: true },
    projectId: { type: 'string', required: true },
    mdsId: { type: 'string', required: false }
  }
};

/**
 * Validates a layout object against the schema
 * @param {Object} layout - The layout object to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export const validateLayout = (layout) => {
  const errors = [];

  // Check required top-level fields
  if (!layout.building) {
    errors.push('Missing required field: building');
  } else {
    if (typeof layout.building.totalArea !== 'number' || layout.building.totalArea <= 0) {
      errors.push('building.totalArea must be a positive number');
    }
    if (typeof layout.building.footprintArea !== 'number' || layout.building.footprintArea <= 0) {
      errors.push('building.footprintArea must be a positive number');
    }
    if (typeof layout.building.height !== 'number' || layout.building.height <= 0) {
      errors.push('building.height must be a positive number');
    }
  }

  // Validate coordinates
  if (!layout.coordinates) {
    errors.push('Missing required field: coordinates');
  } else {
    const validUnits = ['meters', 'millimeters', 'feet', 'inches'];
    if (!validUnits.includes(layout.coordinates.units)) {
      errors.push(`coordinates.units must be one of: ${validUnits.join(', ')}`);
    }
  }

  // Validate levels
  if (!layout.levels) {
    errors.push('Missing required field: levels');
  } else if (!Array.isArray(layout.levels) || layout.levels.length === 0) {
    errors.push('levels must be a non-empty array');
  } else {
    layout.levels.forEach((level, index) => {
      if (typeof level.index !== 'number') {
        errors.push(`levels[${index}].index must be a number`);
      }
      if (!level.name || typeof level.name !== 'string') {
        errors.push(`levels[${index}].name must be a non-empty string`);
      }
      if (typeof level.elevation !== 'number') {
        errors.push(`levels[${index}].elevation must be a number`);
      }
      if (typeof level.height !== 'number' || level.height <= 0) {
        errors.push(`levels[${index}].height must be a positive number`);
      }
      if (!Array.isArray(level.rooms)) {
        errors.push(`levels[${index}].rooms must be an array`);
      } else {
        level.rooms.forEach((room, roomIndex) => {
          if (!room.id) errors.push(`levels[${index}].rooms[${roomIndex}].id is required`);
          if (!room.name) errors.push(`levels[${index}].rooms[${roomIndex}].name is required`);
          if (typeof room.area !== 'number' || room.area <= 0) {
            errors.push(`levels[${index}].rooms[${roomIndex}].area must be a positive number`);
          }
          if (!room.polygon || !room.polygon.points || !Array.isArray(room.polygon.points)) {
            errors.push(`levels[${index}].rooms[${roomIndex}].polygon must have points array`);
          }
        });
      }
      if (!Array.isArray(level.walls)) {
        errors.push(`levels[${index}].walls must be an array`);
      }
    });
  }

  // Validate metadata
  if (!layout.metadata) {
    errors.push('Missing required field: metadata');
  } else {
    if (!layout.metadata.timestamp) {
      errors.push('metadata.timestamp is required');
    }
    if (!layout.metadata.projectId) {
      errors.push('metadata.projectId is required');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Creates a default layout object
 * @returns {Object} Default layout object
 */
export const createDefaultLayout = () => {
  const now = new Date().toISOString();
  const projectId = `layout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    building: {
      name: 'Default Building',
      type: 'residential',
      totalArea: 200,
      footprintArea: 100,
      height: 6
    },
    coordinates: {
      system: 'local',
      units: 'meters',
      origin: { x: 0, y: 0, z: 0 }
    },
    site: {
      boundary: {
        points: [
          { x: -20, y: -20 },
          { x: 20, y: -20 },
          { x: 20, y: 20 },
          { x: -20, y: 20 }
        ],
        closed: true
      }
    },
    levels: [
      {
        index: 0,
        name: 'Ground Floor',
        elevation: 0,
        height: 3,
        rooms: [
          {
            id: 'room_001',
            name: 'Living Room',
            polygon: {
              points: [
                { x: 0, y: 0 },
                { x: 8, y: 0 },
                { x: 8, y: 5 },
                { x: 0, y: 5 }
              ],
              closed: true
            },
            area: 40,
            floor: 0
          }
        ],
        walls: [
          {
            id: 'wall_001',
            line: {
              start: { x: 0, y: 0 },
              end: { x: 8, y: 0 },
              type: 'wall'
            },
            thickness: 0.2,
            type: 'exterior'
          }
        ],
        openings: [
          {
            id: 'door_001',
            type: 'door',
            position: { x: 4, y: 0 },
            width: 0.9,
            height: 2.1,
            wallId: 'wall_001'
          }
        ]
      }
    ],
    grid: {
      type: 'orthogonal',
      spacing: { x: 6, y: 6 },
      lines: {
        x: [0, 6, 12],
        y: [0, 6, 12]
      }
    },
    metadata: {
      version: '1.0.0',
      timestamp: now,
      projectId: projectId
    }
  };
};

/**
 * Converts a layout to DXF-friendly format
 * @param {Object} layout - The layout object
 * @returns {Object} DXF-ready geometry
 */
export const layoutToDXFGeometry = (layout) => {
  const dxfData = {
    layers: {},
    entities: []
  };

  // Create layers
  dxfData.layers = {
    'SITE': { color: 7 },    // White
    'WALLS': { color: 1 },   // Red
    'ROOMS': { color: 2 },   // Yellow
    'DOORS': { color: 3 },   // Green
    'WINDOWS': { color: 4 }, // Cyan
    'TEXT': { color: 7 },    // White
    'DIMS': { color: 5 },    // Blue
    'GRID': { color: 8 }     // Gray
  };

  // Convert site boundary
  if (layout.site?.boundary) {
    dxfData.entities.push({
      type: 'POLYLINE',
      layer: 'SITE',
      points: layout.site.boundary.points
    });
  }

  // Convert each level
  layout.levels.forEach((level) => {
    // Add rooms
    level.rooms.forEach((room) => {
      dxfData.entities.push({
        type: 'POLYLINE',
        layer: 'ROOMS',
        points: room.polygon.points,
        elevation: level.elevation
      });
      // Add room label
      const center = calculatePolygonCenter(room.polygon.points);
      dxfData.entities.push({
        type: 'TEXT',
        layer: 'TEXT',
        position: { ...center, z: level.elevation },
        text: `${room.name}\n${room.area} m²`,
        height: 0.3
      });
    });

    // Add walls
    level.walls.forEach((wall) => {
      dxfData.entities.push({
        type: 'LINE',
        layer: 'WALLS',
        start: { ...wall.line.start, z: level.elevation },
        end: { ...wall.line.end, z: level.elevation }
      });
    });

    // Add openings
    if (level.openings) {
      level.openings.forEach((opening) => {
        const layer = opening.type === 'door' ? 'DOORS' : 'WINDOWS';
        dxfData.entities.push({
          type: opening.type === 'door' ? 'ARC' : 'LINE',
          layer: layer,
          position: { ...opening.position, z: level.elevation },
          width: opening.width,
          height: opening.height
        });
      });
    }
  });

  // Add grid lines
  if (layout.grid?.lines) {
    layout.grid.lines.x?.forEach(x => {
      dxfData.entities.push({
        type: 'LINE',
        layer: 'GRID',
        start: { x, y: -50, z: 0 },
        end: { x, y: 50, z: 0 }
      });
    });
    layout.grid.lines.y?.forEach(y => {
      dxfData.entities.push({
        type: 'LINE',
        layer: 'GRID',
        start: { x: -50, y, z: 0 },
        end: { x: 50, y, z: 0 }
      });
    });
  }

  return dxfData;
};

/**
 * Helper function to calculate polygon center
 */
const calculatePolygonCenter = (points) => {
  const sum = points.reduce((acc, point) => ({
    x: acc.x + point.x,
    y: acc.y + point.y
  }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
};

export default {
  LayoutSchema,
  validateLayout,
  createDefaultLayout,
  layoutToDXFGeometry
};