/**
 * Building Types Taxonomy
 * 
 * Single source of truth for building categories, sub-types, icons, validation constraints,
 * and default program templates.
 */

export const BUILDING_CATEGORIES = {
  RESIDENTIAL: {
    id: 'residential',
    label: 'Residential',
    icon: 'Home',
    subTypes: [
      { id: 'single-family', label: 'Single-Family House', icon: 'Home' },
      { id: 'multi-family', label: 'Multi-Family', icon: 'Building2' },
      { id: 'villa', label: 'Villa', icon: 'Castle' },
      { id: 'cottage', label: 'Cottage', icon: 'TreePine' },
      { id: 'mansion', label: 'Mansion', icon: 'Crown' },
      { id: 'duplex', label: 'Duplex', icon: 'CopyPlus' }
    ],
    constraints: {
      minArea: 50,
      maxArea: 2000,
      minFloors: 1,
      maxFloors: 4,
      requiresNotes: false
    }
  },
  COMMERCIAL: {
    id: 'commercial',
    label: 'Commercial',
    icon: 'Briefcase',
    subTypes: [
      { id: 'office', label: 'Office Building', icon: 'Building' },
      { id: 'retail', label: 'Retail Store', icon: 'Store' },
      { id: 'mixed-use', label: 'Mixed-Use', icon: 'Layers' },
      { id: 'shopping-mall', label: 'Shopping Mall', icon: 'ShoppingBag' }
    ],
    constraints: {
      minArea: 100,
      maxArea: 10000,
      minFloors: 1,
      maxFloors: 40,
      requiresNotes: false
    }
  },
  HEALTHCARE: {
    id: 'healthcare',
    label: 'Healthcare',
    icon: 'Heart',
    subTypes: [
      { id: 'clinic', label: 'Medical Clinic', icon: 'Stethoscope' },
      { id: 'hospital', label: 'Hospital', icon: 'Hospital' },
      { id: 'dental', label: 'Dental Clinic', icon: 'Smile' },
      { id: 'lab', label: 'Laboratory', icon: 'FlaskConical' }
    ],
    constraints: {
      minArea: 200,
      maxArea: 50000,
      minFloors: 1,
      maxFloors: 12,
      requiresNotes: true
    }
  },
  EDUCATION: {
    id: 'education',
    label: 'Education',
    icon: 'GraduationCap',
    subTypes: [
      { id: 'school', label: 'School', icon: 'School' },
      { id: 'university', label: 'University', icon: 'Library' },
      { id: 'kindergarten', label: 'Kindergarten', icon: 'Baby' }
    ],
    constraints: {
      minArea: 500,
      maxArea: 20000,
      minFloors: 1,
      maxFloors: 6,
      requiresNotes: true
    }
  },
  HOSPITALITY: {
    id: 'hospitality',
    label: 'Hospitality',
    icon: 'Hotel',
    subTypes: [
      { id: 'hotel', label: 'Hotel', icon: 'Hotel' },
      { id: 'resort', label: 'Resort', icon: 'Palmtree' },
      { id: 'guest-house', label: 'Guest House', icon: 'Home' }
    ],
    constraints: {
      minArea: 500,
      maxArea: 30000,
      minFloors: 2,
      maxFloors: 40,
      requiresNotes: false
    }
  },
  INDUSTRIAL: {
    id: 'industrial',
    label: 'Industrial',
    icon: 'Factory',
    subTypes: [
      { id: 'warehouse', label: 'Warehouse', icon: 'Warehouse' },
      { id: 'manufacturing', label: 'Manufacturing', icon: 'Cog' },
      { id: 'workshop', label: 'Workshop', icon: 'Wrench' }
    ],
    constraints: {
      minArea: 500,
      maxArea: 50000,
      minFloors: 1,
      maxFloors: 3,
      requiresNotes: true
    }
  },
  CULTURAL: {
    id: 'cultural',
    label: 'Cultural',
    icon: 'Landmark',
    subTypes: [
      { id: 'museum', label: 'Museum', icon: 'Museum' },
      { id: 'library', label: 'Library', icon: 'Library' },
      { id: 'theatre', label: 'Theatre', icon: 'Drama' }
    ],
    constraints: {
      minArea: 500,
      maxArea: 20000,
      minFloors: 1,
      maxFloors: 5,
      requiresNotes: false
    }
  },
  GOVERNMENT: {
    id: 'government',
    label: 'Government',
    icon: 'Building2',
    subTypes: [
      { id: 'town-hall', label: 'Town Hall', icon: 'Building2' },
      { id: 'police', label: 'Police Station', icon: 'Shield' },
      { id: 'fire-station', label: 'Fire Station', icon: 'Flame' }
    ],
    constraints: {
      minArea: 500,
      maxArea: 10000,
      minFloors: 1,
      maxFloors: 4,
      requiresNotes: true
    }
  },
  RELIGIOUS: {
    id: 'religious',
    label: 'Religious',
    icon: 'Church',
    subTypes: [
      { id: 'mosque', label: 'Mosque', icon: 'Moon' },
      { id: 'church', label: 'Church', icon: 'Church' },
      { id: 'temple', label: 'Temple', icon: 'TentTree' }
    ],
    constraints: {
      minArea: 200,
      maxArea: 5000,
      minFloors: 1,
      maxFloors: 2,
      requiresNotes: false
    }
  },
  RECREATION: {
    id: 'recreation',
    label: 'Recreation',
    icon: 'Dumbbell',
    subTypes: [
      { id: 'sports-center', label: 'Sports Center', icon: 'Bike' },
      { id: 'gym', label: 'Gym', icon: 'Dumbbell' },
      { id: 'pool', label: 'Swimming Pool', icon: 'Waves' }
    ],
    constraints: {
      minArea: 300,
      maxArea: 10000,
      minFloors: 1,
      maxFloors: 3,
      requiresNotes: false
    }
  }
};

/**
 * Get all categories as array
 * @returns {Array} Array of category objects
 */
export function getAllCategories() {
  return Object.values(BUILDING_CATEGORIES);
}

/**
 * Get category by ID
 * @param {string} categoryId - Category ID
 * @returns {Object|null} Category object or null
 */
export function getCategoryById(categoryId) {
  return Object.values(BUILDING_CATEGORIES).find(cat => cat.id === categoryId) || null;
}

/**
 * Get sub-type by category and sub-type ID
 * @param {string} categoryId - Category ID
 * @param {string} subTypeId - Sub-type ID
 * @returns {Object|null} Sub-type object or null
 */
export function getSubTypeById(categoryId, subTypeId) {
  const category = getCategoryById(categoryId);
  if (!category) return null;
  return category.subTypes.find(st => st.id === subTypeId) || null;
}

/**
 * Validate building specs against category constraints
 * @param {string} categoryId - Category ID
 * @param {Object} specs - Building specs
 * @param {number} specs.area - Total area in m²
 * @param {number} specs.floors - Number of floors
 * @param {string} specs.notes - Custom notes
 * @returns {Object} Validation result
 */
export function validateBuildingSpecs(categoryId, specs) {
  const category = getCategoryById(categoryId);
  if (!category) {
    return {
      isValid: false,
      errors: ['Invalid building category'],
      warnings: []
    };
  }

  const { constraints } = category;
  const errors = [];
  const warnings = [];

  // Area validation
  if (specs.area < constraints.minArea) {
    errors.push(`Area ${specs.area}m² is below minimum ${constraints.minArea}m² for ${category.label}`);
  }
  if (specs.area > constraints.maxArea) {
    warnings.push(`Area ${specs.area}m² exceeds typical maximum ${constraints.maxArea}m² for ${category.label}`);
  }

  // Floor count validation
  if (specs.floors < constraints.minFloors) {
    errors.push(`Floor count ${specs.floors} is below minimum ${constraints.minFloors} for ${category.label}`);
  }
  if (specs.floors > constraints.maxFloors) {
    warnings.push(`Floor count ${specs.floors} exceeds typical maximum ${constraints.maxFloors} for ${category.label}`);
  }

  // Notes requirement
  if (constraints.requiresNotes && (!specs.notes || specs.notes.trim() === '')) {
    warnings.push(`${category.label} typically requires additional notes or specifications`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get display name for building type
 * @param {string} categoryId - Category ID
 * @param {string} subTypeId - Sub-type ID
 * @returns {string} Display name
 */
export function getBuildingTypeDisplayName(categoryId, subTypeId) {
  const category = getCategoryById(categoryId);
  if (!category) return 'Unknown';
  
  if (!subTypeId) return category.label;
  
  const subType = getSubTypeById(categoryId, subTypeId);
  return subType ? subType.label : category.label;
}

export default {
  BUILDING_CATEGORIES,
  getAllCategories,
  getCategoryById,
  getSubTypeById,
  validateBuildingSpecs,
  getBuildingTypeDisplayName
};

