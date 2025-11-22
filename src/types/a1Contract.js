/**
 * A1 Sheet Contract
 *
 * Defines the complete schema for A1 architectural sheet generation
 * including boundary constraints, required assets, metadata, and validation rules.
 *
 * This contract ensures:
 * - Buildings respect site boundaries and setbacks
 * - All required architectural views are present
 * - Style consistency is maintained
 * - Incremental edits are tracked
 */

/**
 * @typedef {Object} SiteBoundary
 * @property {Array<{lat: number, lng: number}>} polygon - Site boundary vertices (min 3 points)
 * @property {number} areaM2 - Total site area in square meters
 * @property {Object} setbacks - Required building setbacks in meters
 * @property {number} setbacks.front - Front yard setback (meters)
 * @property {number} setbacks.rear - Rear yard setback (meters)
 * @property {number} setbacks.sideLeft - Left side setback (meters)
 * @property {number} setbacks.sideRight - Right side setback (meters)
 * @property {Array<Object>} [easements] - Utility easements or restricted areas
 * @property {number} northAngle - Angle to true north (0-360 degrees)
 * @property {string} shapeType - Detected shape (rectangle, L-shape, irregular, etc.)
 */

/**
 * @typedef {Object} BuildingFootprint
 * @property {Array<{x: number, y: number}>} vertices - Building footprint vertices in site coordinates
 * @property {number} areaM2 - Building footprint area in square meters
 * @property {Object} dimensions - Building dimensions
 * @property {number} dimensions.length - Length (meters)
 * @property {number} dimensions.width - Width (meters)
 * @property {number} dimensions.height - Total height (meters)
 * @property {number} floorCount - Number of floors
 * @property {boolean} withinBoundary - Validation: footprint inside site boundary
 * @property {boolean} respectsSetbacks - Validation: respects all setbacks
 * @property {number} coverageRatio - Site coverage (building area / site area)
 */

/**
 * @typedef {Object} StyleTaxonomy
 * @property {string} period - Architectural period (Modern, Victorian, Georgian, etc.)
 * @property {Array<string>} materials - Primary materials with hex colors
 * @property {Object} massingCues - Massing characteristics
 * @property {string} massingCues.form - Overall form (compact, L-shaped, courtyard, etc.)
 * @property {string} massingCues.roofType - Roof type (flat, gable, hip, etc.)
 * @property {number} massingCues.roofPitch - Roof pitch in degrees (0-60)
 * @property {Object} facadePatterns - Facade characteristics
 * @property {string} facadePatterns.windowStyle - Window style (modern, sash, casement, etc.)
 * @property {string} facadePatterns.rythmPattern - Facade rhythm (regular, irregular, etc.)
 * @property {number} facadePatterns.windowToWallRatio - Typical ratio (0.0-1.0)
 * @property {Array<string>} detailElements - Characteristic details (quoins, cornices, etc.)
 * @property {number} complianceScore - Style compliance (0-5, computed post-generation)
 */

/**
 * @typedef {Object} A1Asset
 * @property {string} assetId - Unique asset identifier
 * @property {string} slotType - Slot category (site-map, floor-plan, elevation, section, 3d-view, interior)
 * @property {string} viewLabel - Human-readable label (e.g., "Ground Floor Plan", "North Elevation")
 * @property {string} url - Asset URL (image or data URL)
 * @property {Object} bbox - Bounding box on A1 sheet (normalized 0-1 coordinates)
 * @property {number} bbox.x - Left edge
 * @property {number} bbox.y - Top edge
 * @property {number} bbox.width - Width
 * @property {number} bbox.height - Height
 * @property {string} scale - Drawing scale (e.g., "1:100", "1:50", "not to scale")
 * @property {Object} source - Generation metadata
 * @property {string} source.model - AI model used
 * @property {number} source.seed - Generation seed
 * @property {string} source.prompt - Generation prompt (truncated)
 * @property {string} source.timestamp - ISO timestamp
 * @property {boolean} isRequired - Whether this asset is required by the contract
 * @property {boolean} isPresent - Whether this asset has been generated
 * @property {string} [revisionId] - Revision ID if edited
 */

/**
 * Required A1 sheet slots
 */
export const REQUIRED_SLOTS = {
  'site-map': {
    label: 'Site Map',
    description: 'Site context with boundary, north arrow, scale',
    scale: '1:500',
    minCount: 1,
    maxCount: 1
  },
  'floor-plan-ground': {
    label: 'Ground Floor Plan',
    description: 'Complete ground floor layout with dimensions',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  'floor-plan-upper': {
    label: 'Upper Floor Plan',
    description: 'Upper floor layout (if multi-story)',
    scale: '1:100',
    minCount: 0, // Optional for single-story
    maxCount: 1,
    conditional: (contract) => contract.buildingFootprint.floorCount > 1
  },
  'roof-plan': {
    label: 'Roof Plan',
    description: 'Roof layout with drainage and materials',
    scale: '1:200',
    minCount: 1,
    maxCount: 1
  },
  'elevation-north': {
    label: 'North Elevation',
    description: 'North facade with materials and dimensions',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  'elevation-south': {
    label: 'South Elevation',
    description: 'South facade',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  'elevation-east': {
    label: 'East Elevation',
    description: 'East facade',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  'elevation-west': {
    label: 'West Elevation',
    description: 'West facade',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  'section-longitudinal': {
    label: 'Longitudinal Section',
    description: 'Section through length of building',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  'section-transverse': {
    label: 'Transverse Section',
    description: 'Section through width of building',
    scale: '1:100',
    minCount: 1,
    maxCount: 1
  },
  '3d-exterior': {
    label: '3D Exterior View',
    description: 'Photorealistic exterior perspective',
    scale: 'not to scale',
    minCount: 1,
    maxCount: 2
  },
  '3d-axonometric': {
    label: '3D Axonometric View',
    description: 'Axonometric or isometric projection',
    scale: 'not to scale',
    minCount: 0, // Optional
    maxCount: 1
  },
  'interior-view': {
    label: 'Interior View',
    description: 'Interior perspective of main space',
    scale: 'not to scale',
    minCount: 1,
    maxCount: 2
  },
  'title-block': {
    label: 'Title Block',
    description: 'Project metadata and drawing register',
    scale: 'not to scale',
    minCount: 1,
    maxCount: 1
  },
  'legend': {
    label: 'Legend & Symbols',
    description: 'Drawing conventions and material legend',
    scale: 'not to scale',
    minCount: 1,
    maxCount: 1
  }
};

/**
 * @typedef {Object} A1Contract
 * @property {string} projectId - Unique project identifier
 * @property {string} revisionId - Current revision identifier
 * @property {SiteBoundary} siteBoundary - Site boundary and constraints
 * @property {BuildingFootprint} buildingFootprint - Building footprint (validated)
 * @property {StyleTaxonomy} styleTaxonomy - Style requirements
 * @property {Object<string, A1Asset>} assets - All assets keyed by assetId
 * @property {Object} metadata - Sheet metadata
 * @property {string} metadata.format - Sheet format (A1, A0, etc.)
 * @property {string} metadata.orientation - Sheet orientation (landscape, portrait)
 * @property {Object} metadata.dimensions - Sheet dimensions
 * @property {number} metadata.dimensions.widthMM - Width in millimeters
 * @property {number} metadata.dimensions.heightMM - Height in millimeters
 * @property {number} metadata.dimensions.widthPX - Width in pixels at 300 DPI
 * @property {number} metadata.dimensions.heightPX - Height in pixels at 300 DPI
 * @property {Object} validation - Validation results
 * @property {boolean} validation.boundaryCompliance - Building respects boundaries
 * @property {boolean} validation.styleCompliance - Style matches taxonomy
 * @property {boolean} validation.completeness - All required assets present
 * @property {number} validation.qualityScore - Overall quality (0-100)
 * @property {Array<string>} validation.warnings - Validation warnings
 * @property {Array<string>} validation.errors - Validation errors
 * @property {Array<Object>} revisionHistory - History of revisions
 */

/**
 * A1 sheet dimensions (ISO 216)
 */
export const A1_DIMENSIONS = {
  landscape: {
    widthMM: 841,
    heightMM: 594,
    aspectRatio: 1.416,
    widthPX_300DPI: 9933,
    heightPX_300DPI: 7016
  },
  portrait: {
    widthMM: 594,
    heightMM: 841,
    aspectRatio: 0.706,
    widthPX_300DPI: 7016,
    heightPX_300DPI: 9933
  }
};

/**
 * Create an empty A1 contract
 * @param {Object} params - Contract parameters
 * @returns {A1Contract}
 */
export function createA1Contract(params) {
  const {
    projectId,
    siteBoundary,
    buildingFootprint,
    styleTaxonomy,
    orientation = 'landscape'
  } = params;

  const dimensions = A1_DIMENSIONS[orientation];
  const revisionId = `rev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    projectId: projectId || `project-${Date.now()}`,
    revisionId,
    siteBoundary,
    buildingFootprint,
    styleTaxonomy,
    assets: {},
    metadata: {
      format: 'A1',
      orientation,
      dimensions
    },
    validation: {
      boundaryCompliance: false,
      styleCompliance: false,
      completeness: false,
      qualityScore: 0,
      warnings: [],
      errors: []
    },
    revisionHistory: [{
      revisionId,
      timestamp: new Date().toISOString(),
      action: 'created',
      description: 'Initial contract created'
    }]
  };
}

/**
 * Validate A1 contract completeness
 * @param {A1Contract} contract
 * @returns {Object} Validation result
 */
export function validateA1Completeness(contract) {
  const result = {
    valid: true,
    missingRequired: [],
    missingOptional: [],
    errors: [],
    warnings: []
  };

  // Check each required slot
  for (const [slotType, slotDef] of Object.entries(REQUIRED_SLOTS)) {
    const assetsOfType = Object.values(contract.assets).filter(a => a.slotType === slotType);
    const actualCount = assetsOfType.length;

    // Evaluate conditional requirements
    if (typeof slotDef.conditional === 'function') {
      if (!slotDef.conditional(contract)) {
        continue; // Skip conditional slots that don't apply
      }
    }

    // Check minimum count
    if (actualCount < slotDef.minCount) {
      const deficit = slotDef.minCount - actualCount;
      result.missingRequired.push({
        slotType,
        label: slotDef.label,
        needed: deficit,
        description: slotDef.description
      });
      result.valid = false;
      result.errors.push(`Missing ${deficit} required ${slotDef.label}(s)`);
    }

    // Check maximum count
    if (actualCount > slotDef.maxCount) {
      const excess = actualCount - slotDef.maxCount;
      result.warnings.push(`Too many ${slotDef.label}(s): ${actualCount} (max ${slotDef.maxCount})`);
    }
  }

  return result;
}

/**
 * Add asset to contract
 * @param {A1Contract} contract
 * @param {A1Asset} asset
 * @returns {A1Contract} Updated contract
 */
export function addAssetToContract(contract, asset) {
  const assetId = asset.assetId || `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    ...contract,
    assets: {
      ...contract.assets,
      [assetId]: {
        ...asset,
        assetId,
        isPresent: true
      }
    }
  };
}

/**
 * Create a new revision from existing contract
 * @param {A1Contract} baseContract
 * @param {string} description
 * @returns {A1Contract} New contract with new revisionId
 */
export function createRevision(baseContract, description) {
  const newRevisionId = `rev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    ...baseContract,
    revisionId: newRevisionId,
    revisionHistory: [
      ...baseContract.revisionHistory,
      {
        revisionId: newRevisionId,
        timestamp: new Date().toISOString(),
        action: 'revised',
        description,
        parentRevision: baseContract.revisionId
      }
    ]
  };
}

export default {
  REQUIRED_SLOTS,
  A1_DIMENSIONS,
  createA1Contract,
  validateA1Completeness,
  addAssetToContract,
  createRevision
};
