/**
 * DNA Schema Definition
 * 
 * Defines the structured JSON schema for Master Design DNA.
 * All DNA must conform to this schema with four top-level keys:
 * - site: Site context (polygon, area, orientation, climate, sun path, wind)
 * - program: Building program (floors, rooms with dimensions and orientation)
 * - style: Architectural style (architecture type, materials, windows)
 * - geometry_rules: Geometric constraints (grid, max span, roof type)
 */

import logger from '../utils/logger.js';

/**
 * Build DNA request payload for Qwen
 * Converts raw project inputs into structured JSON format
 */
export function buildDNARequestPayload(locationData, siteMetrics, programSpec, portfolioSummary) {
  const payload = {
    site: {
      polygon: siteMetrics?.sitePolygon || [],
      area_m2: siteMetrics?.areaM2 || 0,
      orientation: siteMetrics?.orientationDeg || 0,
      climate_zone: locationData?.climate?.type || 'temperate',
      sun_path: locationData?.sunPath?.optimalOrientation || 'south',
      wind_profile: locationData?.climate?.seasonal?.winter?.wind || 'moderate'
    },
    program: {
      floors: programSpec?.floors || 2,
      rooms: (programSpec?.programSpaces || []).map(room => ({
        name: room.name || 'Room',
        area_m2: room.area || 20,
        floor: room.floor || 'ground',
        orientation: room.preferredOrientation || 'any'
      }))
    },
    style: {
      architecture: portfolioSummary?.dominantStyle || locationData?.recommendedStyle || 'contemporary',
      materials: portfolioSummary?.materials || locationData?.localStyles?.[0]?.materials || ['brick', 'wood', 'glass'],
      windows: {
        pattern: 'regular grid',
        proportion: '3:5'
      }
    },
    geometry_rules: {
      grid: '1m grid',
      max_span: '6m',
      roof_type: 'gable'
    },
    // NEW: Geometry volume section for 3D massing
    geometry: {
      massing: {
        type: 'single_volume', // single_volume, multi_wing, courtyard, etc.
        footprint_shape: 'rectangular',
        floor_stacking: 'uniform' // uniform, setback, cantilever
      },
      roof: {
        type: 'gable', // gable, hip, flat, shed, etc.
        pitch_degrees: 35,
        overhang_m: 0.5
      },
      facades: {
        north: { type: 'primary', features: ['entrance', 'windows'] },
        south: { type: 'secondary', features: ['windows', 'balcony'] },
        east: { type: 'side', features: ['windows'] },
        west: { type: 'side', features: ['windows'] }
      },
      heights: {
        ground_floor_m: 3.0,
        upper_floors_m: 2.7,
        parapet_m: 0.3
      }
    }
  };

  return payload;
}

/**
 * Normalize raw DNA from Qwen response
 * Ensures all required fields exist and are properly typed
 */
export function normalizeRawDNA(rawDNA) {
  if (!rawDNA || typeof rawDNA !== 'object') {
    throw new Error('Invalid DNA: must be an object');
  }

  const normalized = {
    // Site section
    site: {
      polygon: Array.isArray(rawDNA.site?.polygon) ? rawDNA.site.polygon : [],
      area_m2: parseFloat(rawDNA.site?.area_m2) || 0,
      orientation: parseFloat(rawDNA.site?.orientation) || 0,
      climate_zone: String(rawDNA.site?.climate_zone || 'temperate'),
      sun_path: String(rawDNA.site?.sun_path || 'south'),
      wind_profile: String(rawDNA.site?.wind_profile || 'moderate')
    },

    // Program section
    program: {
      floors: parseInt(rawDNA.program?.floors) || 2,
      rooms: Array.isArray(rawDNA.program?.rooms) ? rawDNA.program.rooms.map(room => ({
        name: String(room.name || 'Room'),
        area_m2: parseFloat(room.area_m2 || room.area || 20),
        floor: String(room.floor || 'ground'),
        orientation: String(room.orientation || 'any')
      })) : []
    },

    // Style section
    style: {
      architecture: String(rawDNA.style?.architecture || 'contemporary'),
      materials: Array.isArray(rawDNA.style?.materials) ? rawDNA.style.materials : ['brick', 'wood'],
      windows: {
        pattern: String(rawDNA.style?.windows?.pattern || 'regular grid'),
        proportion: String(rawDNA.style?.windows?.proportion || '3:5')
      }
    },

    // Geometry rules section
    geometry_rules: {
      grid: String(rawDNA.geometry_rules?.grid || '1m grid'),
      max_span: String(rawDNA.geometry_rules?.max_span || '6m'),
      roof_type: String(rawDNA.geometry_rules?.roof_type || 'gable')
    },

    // NEW: Geometry volume section (optional, for 3D massing)
    geometry: rawDNA.geometry ? {
      massing: {
        type: String(rawDNA.geometry.massing?.type || 'single_volume'),
        footprint_shape: String(rawDNA.geometry.massing?.footprint_shape || 'rectangular'),
        floor_stacking: String(rawDNA.geometry.massing?.floor_stacking || 'uniform')
      },
      roof: {
        type: String(rawDNA.geometry.roof?.type || rawDNA.geometry_rules?.roof_type || 'gable'),
        pitch_degrees: parseFloat(rawDNA.geometry.roof?.pitch_degrees) || 35,
        overhang_m: parseFloat(rawDNA.geometry.roof?.overhang_m) || 0.5
      },
      facades: {
        north: rawDNA.geometry.facades?.north || { type: 'primary', features: ['entrance', 'windows'] },
        south: rawDNA.geometry.facades?.south || { type: 'secondary', features: ['windows'] },
        east: rawDNA.geometry.facades?.east || { type: 'side', features: ['windows'] },
        west: rawDNA.geometry.facades?.west || { type: 'side', features: ['windows'] }
      },
      heights: {
        ground_floor_m: parseFloat(rawDNA.geometry.heights?.ground_floor_m) || 3.0,
        upper_floors_m: parseFloat(rawDNA.geometry.heights?.upper_floors_m) || 2.7,
        parapet_m: parseFloat(rawDNA.geometry.heights?.parapet_m) || 0.3
      }
    } : undefined
  };

  return normalized;
}

/**
 * Validate DNA schema structure
 * Returns { valid: boolean, missing: string[], errors: string[] }
 */
export function validateDNASchema(dna) {
  const missing = [];
  const errors = [];

  // Check top-level keys
  const requiredKeys = ['site', 'program', 'style', 'geometry_rules'];
  for (const key of requiredKeys) {
    if (!dna[key]) {
      missing.push(key);
    }
  }

  // Check site fields
  if (dna.site) {
    if (!Array.isArray(dna.site.polygon)) {
      errors.push('site.polygon must be an array');
    }
    if (typeof dna.site.area_m2 !== 'number' || dna.site.area_m2 <= 0) {
      errors.push('site.area_m2 must be a positive number');
    }
  }

  // Check program fields
  if (dna.program) {
    if (typeof dna.program.floors !== 'number' || dna.program.floors < 1) {
      errors.push('program.floors must be a positive integer');
    }
    if (!Array.isArray(dna.program.rooms) || dna.program.rooms.length === 0) {
      errors.push('program.rooms must be a non-empty array');
    }
  }

  // Check style fields
  if (dna.style) {
    if (!dna.style.architecture) {
      errors.push('style.architecture is required');
    }
    if (!Array.isArray(dna.style.materials) || dna.style.materials.length === 0) {
      errors.push('style.materials must be a non-empty array');
    }
  }

  // Check geometry_rules fields
  if (dna.geometry_rules) {
    if (!dna.geometry_rules.roof_type) {
      errors.push('geometry_rules.roof_type is required');
    }
  }

  const valid = missing.length === 0 && errors.length === 0;

  if (!valid) {
    logger.warn('DNA schema validation failed', { missing, errors });
  }

  return { valid, missing, errors };
}

/**
 * Convert structured DNA to legacy format
 * For backwards compatibility with existing code
 */
export function convertToLegacyDNA(structuredDNA) {
  const legacy = {
    // Dimensions from program
    dimensions: {
      length: 15, // Default, should be computed from rooms
      width: 10,
      height: structuredDNA.program.floors * 3.2,
      floors: structuredDNA.program.floors,
      totalHeight: structuredDNA.program.floors * 3.2,
      floorCount: structuredDNA.program.floors
    },

    // Materials from style
    materials: structuredDNA.style.materials.map((mat, idx) => ({
      name: mat,
      hexColor: idx === 0 ? '#B8604E' : idx === 1 ? '#8B4513' : '#CCCCCC',
      application: idx === 0 ? 'exterior walls' : idx === 1 ? 'roof' : 'trim'
    })),

    // Roof from geometry_rules
    roof: {
      type: structuredDNA.geometry_rules.roof_type,
      pitch: 35,
      material: structuredDNA.style.materials[1] || 'tiles'
    },

    // Rooms from program
    rooms: structuredDNA.program.rooms,

    // Architecture style
    architecturalStyle: structuredDNA.style.architecture,

    // Site context
    locationContext: `${structuredDNA.site.climate_zone} climate, ${structuredDNA.site.sun_path} orientation`,

    // Climate design
    climateDesign: {
      zone: structuredDNA.site.climate_zone,
      orientation: structuredDNA.site.sun_path
    },

    // Store structured version
    _structured: structuredDNA
  };

  return legacy;
}

/**
 * Extract structured DNA from legacy format
 * For reading existing designs
 */
export function extractStructuredDNA(legacyDNA) {
  // If already has _structured, return it
  if (legacyDNA._structured) {
    return legacyDNA._structured;
  }

  // Otherwise, convert from legacy format
  const structured = {
    site: {
      polygon: [],
      area_m2: (legacyDNA.dimensions?.length || 15) * (legacyDNA.dimensions?.width || 10),
      orientation: 0,
      climate_zone: legacyDNA.climateDesign?.zone || 'temperate',
      sun_path: legacyDNA.climateDesign?.orientation || 'south',
      wind_profile: 'moderate'
    },
    program: {
      floors: legacyDNA.dimensions?.floors || legacyDNA.dimensions?.floorCount || 2,
      rooms: legacyDNA.rooms || []
    },
    style: {
      architecture: legacyDNA.architecturalStyle || 'contemporary',
      materials: (legacyDNA.materials || []).map(m => m.name || m),
      windows: {
        pattern: 'regular grid',
        proportion: '3:5'
      }
    },
    geometry_rules: {
      grid: '1m grid',
      max_span: '6m',
      roof_type: legacyDNA.roof?.type || 'gable'
    }
  };

  return structured;
}

export default {
  buildDNARequestPayload,
  normalizeRawDNA,
  validateDNASchema,
  convertToLegacyDNA,
  extractStructuredDNA
};

