import logger from '../utils/logger.js';

/**
 * DNA Normalization Service
 *
 * Ensures Design DNA has consistent structure regardless of source:
 * - Fallback DNA
 * - LLM-generated DNA
 * - User-modified DNA
 *
 * Normalizes:
 * - Materials (always array)
 * - Floors (always number)
 * - Color palette (always array)
 * - Entrance config (always object)
 * - Dimensions (consistent property names)
 */

/**
 * Normalize Design DNA to consistent structure
 * @param {Object} dna - Raw DNA object
 * @param {Object} ctx - Optional context (floors, area, etc.)
 * @returns {Object} Normalized DNA
 */
export function normalizeDNA(dna, ctx = {}) {
  if (!dna || typeof dna !== 'object') {
    logger.warn('Invalid DNA input, using minimal fallback');
    return createMinimalDNA(ctx);
  }

  const normalized = { ...dna };

  // ========================================
  // MATERIALS NORMALIZATION
  // ========================================
  // Ensure materials is always an array of objects
  if (!normalized.materials) {
    normalized.materials = [
      { name: 'brick', hexColor: '#B8604E', application: 'exterior walls' },
      { name: 'tiles', hexColor: '#8B4513', application: 'roof' }
    ];
  } else if (typeof normalized.materials === 'string') {
    // Convert string to array
    normalized.materials = normalized.materials.split(',').map(m => ({
      name: m.trim(),
      hexColor: '#999999',
      application: 'structure'
    }));
  } else if (typeof normalized.materials === 'object' && !Array.isArray(normalized.materials)) {
    // Convert object to array
    const materialsArray = [];
    if (normalized.materials.exterior?.primary) {
      materialsArray.push({
        name: normalized.materials.exterior.primary,
        hexColor: normalized.materials.exterior.color_hex || '#B8604E',
        application: 'exterior walls'
      });
    }
    if (normalized.materials.roof?.material) {
      materialsArray.push({
        name: normalized.materials.roof.material,
        hexColor: normalized.materials.roof.color_hex || '#8B4513',
        application: 'roof'
      });
    }
    if (normalized.materials.secondary) {
      materialsArray.push({
        name: normalized.materials.secondary,
        hexColor: '#CCCCCC',
        application: 'accents'
      });
    }
    normalized.materials = materialsArray.length > 0 ? materialsArray : [
      { name: 'contemporary materials', hexColor: '#999999', application: 'structure' }
    ];
  } else if (Array.isArray(normalized.materials)) {
    // Ensure each material is an object
    normalized.materials = normalized.materials.map(m => {
      if (typeof m === 'string') {
        return { name: m, hexColor: '#999999', application: 'structure' };
      }
      return {
        name: m.name || 'material',
        hexColor: m.hexColor || m.color_hex || m.color || '#999999',
        application: m.application || m.use || 'structure'
      };
    });
  }

  // ========================================
  // FLOORS NORMALIZATION
  // ========================================
  // Ensure floors is a number
  if (!normalized.dimensions) {
    normalized.dimensions = {};
  }

  const floors = normalized.dimensions.floors ||
                 normalized.dimensions.floor_count ||
                 normalized.dimensions.floorCount ||
                 normalized.floors ||
                 ctx.floors ||
                 2;

  normalized.dimensions.floors = parseInt(floors);
  normalized.dimensions.floor_count = normalized.dimensions.floors; // Alternative naming
  normalized.floors = normalized.dimensions.floors; // Top-level convenience

  // ========================================
  // DIMENSIONS NORMALIZATION
  // ========================================
  // Ensure all dimension properties exist
  normalized.dimensions.length = normalized.dimensions.length || normalized.dimensions.width || 15;
  normalized.dimensions.width = normalized.dimensions.width || normalized.dimensions.depth || 12;
  normalized.dimensions.height = normalized.dimensions.height || normalized.dimensions.totalHeight || 7;
  normalized.dimensions.totalHeight = normalized.dimensions.height; // Sync

  // Floor heights
  if (!normalized.dimensions.floorHeights) {
    const floorHeight = normalized.dimensions.height / normalized.dimensions.floors;
    normalized.dimensions.floorHeights = Array(normalized.dimensions.floors).fill(floorHeight);
  }

  // ========================================
  // ROOMS NORMALIZATION
  // ========================================
  // Ensure rooms is an array
  if (!normalized.rooms || !Array.isArray(normalized.rooms)) {
    normalized.rooms = generateDefaultRooms(normalized.dimensions.floors);
  }

  // ========================================
  // COLOR PALETTE NORMALIZATION
  // ========================================
  if (!normalized.colorPalette && !normalized.color_palette) {
    normalized.colorPalette = {
      primary: normalized.materials[0]?.hexColor || '#B8604E',
      secondary: normalized.materials[1]?.hexColor || '#8B4513',
      accent: '#FFFFFF',
      description: 'Harmonious color palette derived from materials'
    };
  } else if (normalized.color_palette && !normalized.colorPalette) {
    // Sync camelCase version from snake_case
    normalized.colorPalette = normalized.color_palette;
  } else if (Array.isArray(normalized.colorPalette)) {
    // Convert array to object
    normalized.colorPalette = {
      primary: normalized.colorPalette[0] || '#B8604E',
      secondary: normalized.colorPalette[1] || '#8B4513',
      accent: normalized.colorPalette[2] || '#FFFFFF',
      description: 'Color palette'
    };
  }

  // Ensure description exists
  if (normalized.colorPalette && !normalized.colorPalette.description) {
    normalized.colorPalette.description = 'Harmonious color palette';
  }

  // ========================================
  // ENTRANCE CONFIG NORMALIZATION
  // ========================================
  if (!normalized.entranceConfig && !normalized.entrance) {
    // Create both entranceConfig and entrance for compatibility
    normalized.entranceConfig = {
      orientation: 'north',
      position: 'centered'
    };
    normalized.entrance = {
      facade: 'N',
      position: 'center'
    };
  } else if (normalized.entrance && !normalized.entranceConfig) {
    // Sync entranceConfig from entrance
    normalized.entranceConfig = {
      orientation: normalized.entrance.facade || 'north',
      position: normalized.entrance.position || 'centered'
    };
  } else if (normalized.entranceConfig && !normalized.entrance) {
    // Sync entrance from entranceConfig
    normalized.entrance = {
      facade: (normalized.entranceConfig.orientation || 'north').charAt(0).toUpperCase(),
      position: normalized.entranceConfig.position || 'center'
    };
  }

  // ========================================
  // ARCHITECTURAL STYLE NORMALIZATION
  // ========================================
  normalized.architecturalStyle = normalized.architecturalStyle ||
                                   normalized.architectural_style?.name ||
                                   ctx.style ||
                                   'Contemporary';

  // ========================================
  // VIEW SPECIFIC FEATURES NORMALIZATION
  // ========================================
  if (!normalized.viewSpecificFeatures && !normalized.view_specific_notes) {
    normalized.viewSpecificFeatures = {
      north: { mainEntrance: true, windows: 4 },
      south: { patioDoors: true, windows: 3 },
      east: { windows: 2 },
      west: { windows: 2 }
    };
  }

  return normalized;
}

/**
 * Create minimal fallback DNA
 * @param {Object} ctx - Context with floors, area, style
 * @returns {Object} Minimal DNA structure
 */
function createMinimalDNA(ctx = {}) {
  const floors = ctx.floors || 2;
  const area = ctx.area || 200;
  const style = ctx.style || 'Contemporary';

  return {
    dimensions: {
      length: 15,
      width: 12,
      height: 7,
      totalHeight: 7,
      floors,
      floor_count: floors,
      floorHeights: Array(floors).fill(7 / floors),
      totalArea: area
    },
    materials: [
      { name: 'brick', hexColor: '#B8604E', application: 'exterior walls' },
      { name: 'tiles', hexColor: '#8B4513', application: 'roof' }
    ],
    rooms: generateDefaultRooms(floors),
    colorPalette: {
      primary: '#B8604E',
      secondary: '#8B4513',
      accent: '#FFFFFF',
      description: 'Warm traditional palette with red-brown brick and dark grey roof'
    },
    entrance: {
      facade: 'N',
      position: 'center'
    },
    entranceConfig: {
      orientation: 'north',
      position: 'centered'
    },
    architecturalStyle: style,
    viewSpecificFeatures: {
      north: { mainEntrance: true, windows: 4 },
      south: { patioDoors: true, windows: 3 },
      east: { windows: 2 },
      west: { windows: 2 }
    },
    isFallback: true
  };
}

/**
 * Generate default rooms based on floor count
 * @param {number} floors - Number of floors
 * @returns {Array} Room configurations
 */
function generateDefaultRooms(floors = 2) {
  const rooms = [
    { name: 'Living Room', dimensions: '5.5m × 4.0m', floor: 'ground', features: ['windows', 'entrance'] },
    { name: 'Kitchen', dimensions: '4.0m × 3.5m', floor: 'ground', features: ['windows'] },
    { name: 'Entry Hall', dimensions: '3.0m × 2.5m', floor: 'ground', features: ['entrance'] }
  ];

  if (floors > 1) {
    rooms.push(
      { name: 'Bedroom 1', dimensions: '4.0m × 3.5m', floor: 'upper', features: ['windows'] },
      { name: 'Bedroom 2', dimensions: '3.5m × 3.0m', floor: 'upper', features: ['windows'] },
      { name: 'Bathroom', dimensions: '2.5m × 2.0m', floor: 'upper', features: ['window'] }
    );
  }

  return rooms;
}

/**
 * Validate normalized DNA structure
 * @param {Object} dna - Normalized DNA
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateNormalizedDNA(dna) {
  const errors = [];

  if (!dna.dimensions) errors.push('Missing dimensions');
  if (!Array.isArray(dna.materials)) errors.push('Materials must be array');
  if (!dna.dimensions?.floors) errors.push('Missing floors');
  if (!dna.colorPalette) errors.push('Missing color palette');

  return {
    valid: errors.length === 0,
    errors
  };
}

export default normalizeDNA;
