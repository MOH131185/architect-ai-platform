/**
 * Master Design Specification (MDS) Schema
 * Defines the complete architectural specification for consistency across all views
 */

/**
 * Validates that a value is a positive number
 */
const validatePositiveNumber = (value, fieldName) => {
  if (typeof value !== 'number' || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return true;
};

/**
 * Validates that a value is a non-empty string
 */
const validateString = (value, fieldName) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return true;
};

/**
 * Validates that a value is one of the allowed values
 */
const validateEnum = (value, allowedValues, fieldName) => {
  if (!allowedValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
  return true;
};

/**
 * Validates an array of strings
 */
const validateStringArray = (value, fieldName, minLength = 0) => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  if (value.length < minLength) {
    throw new Error(`${fieldName} must have at least ${minLength} items`);
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`${fieldName}[${index}] must be a non-empty string`);
    }
  });
  return true;
};

/**
 * MDS Schema Definition
 */
export const MDSSchema = {
  // Site Information
  site: {
    latitude: { type: 'number', required: true, validate: (v) => v >= -90 && v <= 90 },
    longitude: { type: 'number', required: true, validate: (v) => v >= -180 && v <= 180 },
    orientation: { type: 'number', required: true, validate: (v) => v >= 0 && v < 360 },
    polygon: { type: 'array', required: false }, // Array of [lat, lng] coordinates
    address: { type: 'string', required: true },
    zoning: { type: 'string', required: false },
    setbacks: {
      front: { type: 'number', required: false },
      rear: { type: 'number', required: false },
      left: { type: 'number', required: false },
      right: { type: 'number', required: false }
    }
  },

  // Climate Information
  climate: {
    type: { type: 'string', required: true, enum: ['tropical', 'arid', 'temperate', 'continental', 'polar'] },
    summary: { type: 'string', required: true },
    avgTempSummer: { type: 'number', required: false },
    avgTempWinter: { type: 'number', required: false },
    avgRainfall: { type: 'number', required: false },
    primaryWindDirection: { type: 'string', required: false }
  },

  // Building Dimensions
  dimensions: {
    floors: { type: 'number', required: true, validate: (v) => validatePositiveNumber(v, 'floors') && v <= 100 },
    grossArea: { type: 'number', required: true, validate: (v) => validatePositiveNumber(v, 'grossArea') },
    footprint: { type: 'number', required: true, validate: (v) => validatePositiveNumber(v, 'footprint') },
    height: { type: 'number', required: true, validate: (v) => validatePositiveNumber(v, 'height') },
    floorHeight: { type: 'number', required: true, validate: (v) => validatePositiveNumber(v, 'floorHeight') },
    length: { type: 'number', required: false },
    width: { type: 'number', required: false }
  },

  // Entry Configuration
  entry: {
    side: { type: 'string', required: true, enum: ['north', 'south', 'east', 'west'] },
    position: { type: 'string', required: false, enum: ['centered', 'left', 'right'] },
    width: { type: 'number', required: false },
    height: { type: 'number', required: false }
  },

  // Architectural Style
  style: {
    tags: { type: 'array', required: true, validate: (v) => validateStringArray(v, 'style.tags', 1) },
    primary: { type: 'string', required: true },
    secondary: { type: 'string', required: false },
    influences: { type: 'array', required: false }
  },

  // Materials Specification
  materials: {
    primary: { type: 'string', required: true },
    secondary: { type: 'string', required: false },
    accent: { type: 'string', required: false },
    facade: { type: 'string', required: true },
    roof: { type: 'string', required: true },
    structure: { type: 'string', required: true }
  },

  // Building Envelope
  envelope: {
    uValueWalls: { type: 'number', required: false }, // W/m²K
    uValueRoof: { type: 'number', required: false },
    uValueFloor: { type: 'number', required: false },
    uValueWindows: { type: 'number', required: false },
    glazingRatio: { type: 'number', required: false, validate: (v) => v >= 0 && v <= 1 }
  },

  // Building Program
  program: {
    type: 'array',
    required: true,
    schema: {
      name: { type: 'string', required: true },
      area: { type: 'number', required: true },
      count: { type: 'number', required: false, default: 1 },
      floor: { type: 'number', required: false },
      adjacentTo: { type: 'array', required: false }
    }
  },

  // Adjacency Rules
  rules: {
    stairs: {
      minWidth: { type: 'number', required: false, default: 1.2 },
      location: { type: 'string', required: false, enum: ['central', 'edge', 'corner'] }
    },
    corridors: {
      minWidth: { type: 'number', required: false, default: 1.5 },
      maxLength: { type: 'number', required: false }
    },
    structure: {
      system: { type: 'string', required: false, enum: ['load_bearing', 'frame', 'hybrid'] },
      gridSpacing: { type: 'number', required: false }
    }
  },

  // Blended Style Information
  blendedStyle: {
    localPercentage: { type: 'number', required: true, validate: (v) => v >= 0 && v <= 100 },
    portfolioPercentage: { type: 'number', required: true, validate: (v) => v >= 0 && v <= 100 },
    palette: { type: 'array', required: false },
    facadeRules: { type: 'string', required: false },
    description: { type: 'string', required: true }
  },

  // Seeds for Consistency
  seeds: {
    master: { type: 'number', required: true },
    floorPlan: { type: 'number', required: false },
    elevation: { type: 'number', required: false },
    axonometric: { type: 'number', required: false }
  },

  // Metadata
  metadata: {
    version: { type: 'string', required: true, default: '1.0.0' },
    timestamp: { type: 'string', required: true },
    projectId: { type: 'string', required: true },
    userId: { type: 'string', required: false }
  }
};

/**
 * Validates an MDS object against the schema
 * @param {Object} mds - The MDS object to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export const validateMDS = (mds) => {
  const errors = [];

  // Check required top-level fields
  const requiredFields = ['site', 'climate', 'dimensions', 'entry', 'style', 'materials', 'program', 'blendedStyle', 'seeds', 'metadata'];
  for (const field of requiredFields) {
    if (!mds[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate site
  if (mds.site) {
    if (typeof mds.site.latitude !== 'number' || mds.site.latitude < -90 || mds.site.latitude > 90) {
      errors.push('site.latitude must be between -90 and 90');
    }
    if (typeof mds.site.longitude !== 'number' || mds.site.longitude < -180 || mds.site.longitude > 180) {
      errors.push('site.longitude must be between -180 and 180');
    }
    if (typeof mds.site.orientation !== 'number' || mds.site.orientation < 0 || mds.site.orientation >= 360) {
      errors.push('site.orientation must be between 0 and 359');
    }
    if (!mds.site.address || typeof mds.site.address !== 'string') {
      errors.push('site.address must be a non-empty string');
    }
  }

  // Validate climate
  if (mds.climate) {
    const climateTypes = ['tropical', 'arid', 'temperate', 'continental', 'polar'];
    if (!climateTypes.includes(mds.climate.type)) {
      errors.push(`climate.type must be one of: ${climateTypes.join(', ')}`);
    }
    if (!mds.climate.summary || typeof mds.climate.summary !== 'string') {
      errors.push('climate.summary must be a non-empty string');
    }
  }

  // Validate dimensions
  if (mds.dimensions) {
    const dimensionFields = ['floors', 'grossArea', 'footprint', 'height', 'floorHeight'];
    for (const field of dimensionFields) {
      if (typeof mds.dimensions[field] !== 'number' || mds.dimensions[field] <= 0) {
        errors.push(`dimensions.${field} must be a positive number`);
      }
    }
    if (mds.dimensions.floors && mds.dimensions.floors > 100) {
      errors.push('dimensions.floors must not exceed 100');
    }
  }

  // Validate entry
  if (mds.entry) {
    const sides = ['north', 'south', 'east', 'west'];
    if (!sides.includes(mds.entry.side)) {
      errors.push(`entry.side must be one of: ${sides.join(', ')}`);
    }
  }

  // Validate style
  if (mds.style) {
    if (!Array.isArray(mds.style.tags) || mds.style.tags.length === 0) {
      errors.push('style.tags must be a non-empty array of strings');
    }
    if (!mds.style.primary || typeof mds.style.primary !== 'string') {
      errors.push('style.primary must be a non-empty string');
    }
  }

  // Validate materials
  if (mds.materials) {
    const requiredMaterials = ['primary', 'facade', 'roof', 'structure'];
    for (const field of requiredMaterials) {
      if (!mds.materials[field] || typeof mds.materials[field] !== 'string') {
        errors.push(`materials.${field} must be a non-empty string`);
      }
    }
  }

  // Validate program
  if (mds.program) {
    if (!Array.isArray(mds.program) || mds.program.length === 0) {
      errors.push('program must be a non-empty array');
    } else {
      mds.program.forEach((room, index) => {
        if (!room.name || typeof room.name !== 'string') {
          errors.push(`program[${index}].name must be a non-empty string`);
        }
        if (typeof room.area !== 'number' || room.area <= 0) {
          errors.push(`program[${index}].area must be a positive number`);
        }
      });
    }
  }

  // Validate blendedStyle
  if (mds.blendedStyle) {
    if (typeof mds.blendedStyle.localPercentage !== 'number' ||
        mds.blendedStyle.localPercentage < 0 ||
        mds.blendedStyle.localPercentage > 100) {
      errors.push('blendedStyle.localPercentage must be between 0 and 100');
    }
    if (typeof mds.blendedStyle.portfolioPercentage !== 'number' ||
        mds.blendedStyle.portfolioPercentage < 0 ||
        mds.blendedStyle.portfolioPercentage > 100) {
      errors.push('blendedStyle.portfolioPercentage must be between 0 and 100');
    }
    if (!mds.blendedStyle.description || typeof mds.blendedStyle.description !== 'string') {
      errors.push('blendedStyle.description must be a non-empty string');
    }
  }

  // Validate seeds
  if (mds.seeds) {
    if (typeof mds.seeds.master !== 'number') {
      errors.push('seeds.master must be a number');
    }
  }

  // Validate metadata
  if (mds.metadata) {
    if (!mds.metadata.version || typeof mds.metadata.version !== 'string') {
      errors.push('metadata.version must be a non-empty string');
    }
    if (!mds.metadata.timestamp || typeof mds.metadata.timestamp !== 'string') {
      errors.push('metadata.timestamp must be a non-empty string');
    }
    if (!mds.metadata.projectId || typeof mds.metadata.projectId !== 'string') {
      errors.push('metadata.projectId must be a non-empty string');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Creates a default MDS object with minimal required fields
 * @returns {Object} Default MDS object
 */
export const createDefaultMDS = () => {
  const now = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const masterSeed = Math.floor(Math.random() * 1000000);

  return {
    site: {
      latitude: 37.7749,
      longitude: -122.4194,
      orientation: 0,
      address: 'San Francisco, CA',
      polygon: []
    },
    climate: {
      type: 'temperate',
      summary: 'Mild temperate climate with Mediterranean characteristics'
    },
    dimensions: {
      floors: 2,
      grossArea: 200,
      footprint: 100,
      height: 6,
      floorHeight: 3
    },
    entry: {
      side: 'north',
      position: 'centered'
    },
    style: {
      tags: ['contemporary'],
      primary: 'contemporary'
    },
    materials: {
      primary: 'concrete',
      facade: 'glass',
      roof: 'membrane',
      structure: 'steel'
    },
    envelope: {},
    program: [
      { name: 'Living Room', area: 40, floor: 0 },
      { name: 'Kitchen', area: 25, floor: 0 },
      { name: 'Master Bedroom', area: 30, floor: 1 }
    ],
    rules: {
      stairs: { minWidth: 1.2 },
      corridors: { minWidth: 1.5 }
    },
    blendedStyle: {
      localPercentage: 50,
      portfolioPercentage: 50,
      description: 'Balanced contemporary design with local and portfolio influences'
    },
    seeds: {
      master: masterSeed,
      floorPlan: masterSeed + 1,
      elevation: masterSeed + 2,
      axonometric: masterSeed + 3
    },
    metadata: {
      version: '1.0.0',
      timestamp: now,
      projectId: projectId
    }
  };
};

export default {
  MDSSchema,
  validateMDS,
  createDefaultMDS
};