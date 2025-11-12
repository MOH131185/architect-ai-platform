/**
 * Site Validation Service
 *
 * Pre-validates designs against site constraints before generation
 * Ensures buildings fit within boundaries, respect setbacks, and comply with zoning
 * Prevents wasted generation time on invalid designs
 */

/**
 * Validate design against site constraints
 * @param {Object} masterDNA - Design DNA with dimensions and layout
 * @param {Object} siteData - Site constraints and metrics
 * @returns {Object} Validation result with errors and warnings
 */
export function validateDesignAgainstSite(masterDNA, siteData) {
  const errors = [];
  const warnings = [];

  if (!masterDNA || !siteData) {
    return {
      valid: false,
      errors: ['Missing design or site data'],
      warnings: []
    };
  }

  // Extract site constraints
  const {
    buildableArea = Infinity,
    siteArea = Infinity,
    constraints = {},
    maxHeight = Infinity,
    maxFloors = Infinity,
    shapeType = 'rectangle',
    polygon = null
  } = siteData;

  const {
    frontSetback = 0,
    rearSetback = 0,
    sideSetbacks = [0, 0]
  } = constraints;

  // Check 1: Building footprint within buildable area
  const footprintArea = (masterDNA.dimensions?.length || 0) * (masterDNA.dimensions?.width || 0);

  if (footprintArea > buildableArea) {
    errors.push({
      type: 'FOOTPRINT_EXCEEDS_BUILDABLE',
      message: `Building footprint (${footprintArea.toFixed(1)}m²) exceeds buildable area (${buildableArea.toFixed(1)}m²)`,
      severity: 'high',
      suggestion: `Reduce building dimensions or increase floor count`
    });
  }

  // Check 2: Total floor area reasonable for site
  const totalFloorArea = footprintArea * (masterDNA.dimensions?.floorCount || 1);
  const floorAreaRatio = totalFloorArea / siteArea;

  if (floorAreaRatio > 3.0) {
    warnings.push({
      type: 'HIGH_FLOOR_AREA_RATIO',
      message: `Floor area ratio (${floorAreaRatio.toFixed(2)}) is very high for this site`,
      severity: 'medium',
      suggestion: 'Consider reducing building size or floor count'
    });
  }

  // Check 3: Height restrictions
  const buildingHeight = masterDNA.dimensions?.height || 0;

  if (buildingHeight > maxHeight) {
    errors.push({
      type: 'HEIGHT_EXCEEDS_LIMIT',
      message: `Building height (${buildingHeight}m) exceeds maximum allowed (${maxHeight}m)`,
      severity: 'high',
      suggestion: `Reduce floor heights or floor count`
    });
  }

  // Check 4: Floor count restrictions
  const floorCount = masterDNA.dimensions?.floorCount || 1;

  if (floorCount > maxFloors) {
    errors.push({
      type: 'FLOOR_COUNT_EXCEEDS_LIMIT',
      message: `Floor count (${floorCount}) exceeds maximum allowed (${maxFloors})`,
      severity: 'high',
      suggestion: `Reduce to ${maxFloors} floors maximum`
    });
  }

  // Check 5: Setback violations
  const buildingLength = masterDNA.dimensions?.length || 0;
  const buildingWidth = masterDNA.dimensions?.width || 0;
  const requiredLength = buildingLength + frontSetback + rearSetback;
  const requiredWidth = buildingWidth + sideSetbacks[0] + sideSetbacks[1];

  if (polygon && polygon.length >= 4) {
    // Calculate approximate site dimensions from polygon
    const { siteBounds } = calculateSiteBounds(polygon);

    if (requiredLength > siteBounds.length) {
      errors.push({
        type: 'SETBACK_VIOLATION_LENGTH',
        message: `Building + setbacks (${requiredLength.toFixed(1)}m) exceeds site length (${siteBounds.length.toFixed(1)}m)`,
        severity: 'high',
        suggestion: 'Reduce building length or request setback variance'
      });
    }

    if (requiredWidth > siteBounds.width) {
      errors.push({
        type: 'SETBACK_VIOLATION_WIDTH',
        message: `Building + setbacks (${requiredWidth.toFixed(1)}m) exceeds site width (${siteBounds.width.toFixed(1)}m)`,
        severity: 'high',
        suggestion: 'Reduce building width or request setback variance'
      });
    }
  }

  // Check 6: Shape compatibility
  if (shapeType === 'L-shape' && masterDNA.buildingShape !== 'L-shape') {
    warnings.push({
      type: 'SHAPE_MISMATCH',
      message: `Site is ${shapeType} but building is rectangular`,
      severity: 'low',
      suggestion: 'Consider L-shaped building for better site utilization'
    });
  }

  // Check 7: Orientation optimization
  if (siteData.optimalOrientation && !masterDNA.buildingOrientation) {
    warnings.push({
      type: 'ORIENTATION_NOT_OPTIMIZED',
      message: `Building orientation not optimized for site (optimal: ${siteData.optimalOrientation}°)`,
      severity: 'medium',
      suggestion: `Rotate building ${siteData.optimalOrientation}° from North for better solar gain`
    });
  }

  // Check 8: Room layout feasibility
  if (masterDNA.rooms && Array.isArray(masterDNA.rooms)) {
    const totalRoomArea = masterDNA.rooms.reduce((sum, room) => {
      const [length, width] = (room.dimensions || '0x0').split('×').map(d => parseFloat(d) || 0);
      return sum + (length * width);
    }, 0);

    const efficiency = totalRoomArea / footprintArea;

    if (efficiency > 0.95) {
      warnings.push({
        type: 'UNREALISTIC_SPACE_EFFICIENCY',
        message: `Space efficiency (${(efficiency * 100).toFixed(1)}%) is unrealistically high`,
        severity: 'medium',
        suggestion: 'Allow for circulation space, walls, and utilities (typical: 75-85%)'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      footprintArea,
      totalFloorArea,
      floorAreaRatio: floorAreaRatio.toFixed(2),
      canProceed: errors.length === 0
    }
  };
}

/**
 * Validate modification request against site constraints
 * @param {string} deltaPrompt - Modification request
 * @param {Object} masterDNA - Current design DNA
 * @param {Object} siteConstraints - Site limitations
 * @returns {Object} Pre-validation result
 */
export function preValidateModification(deltaPrompt, masterDNA, siteConstraints) {
  const warnings = [];
  const errors = [];
  const suggestions = [];

  if (!deltaPrompt || !masterDNA || !siteConstraints) {
    return { valid: true, warnings, errors, suggestions };
  }

  const modificationLower = deltaPrompt.toLowerCase();

  // Parse modification intent
  const isAddingSpace = /add.*(room|bedroom|bathroom|kitchen|space|area)/i.test(modificationLower);
  const isExpanding = /expand|enlarge|bigger|increase.*size/i.test(modificationLower);
  const isAddingFloor = /add.*(floor|story|storey|level)/i.test(modificationLower);
  const isAddingWindows = /add.*(window|glazing|glass)/i.test(modificationLower);

  // Current metrics
  const currentFootprint = (masterDNA.dimensions?.length || 0) * (masterDNA.dimensions?.width || 0);
  const currentFloors = masterDNA.dimensions?.floorCount || 1;
  const currentHeight = masterDNA.dimensions?.height || 0;

  // Check space additions
  if (isAddingSpace || isExpanding) {
    const estimatedNewFootprint = currentFootprint * 1.2; // Rough 20% increase estimate
    const buildableArea = siteConstraints?.buildableArea || Infinity;

    if (buildableArea !== Infinity && estimatedNewFootprint > buildableArea) {
      warnings.push({
        type: 'SPACE_ADDITION_MAY_EXCEED',
        message: 'This modification may exceed site boundaries',
        detail: `Estimated footprint (${estimatedNewFootprint.toFixed(1)}m²) vs buildable (${buildableArea.toFixed(1)}m²)`,
        suggestion: 'Consider adding space vertically instead of horizontally'
      });

      if (currentFloors < (siteConstraints.maxFloors || 3)) {
        suggestions.push(`Add a ${currentFloors + 1}${getOrdinalSuffix(currentFloors + 1)} floor instead`);
      }
    }
  }

  // Check floor additions
  if (isAddingFloor) {
    if (currentFloors >= (siteConstraints.maxFloors || Infinity)) {
      errors.push({
        type: 'MAX_FLOORS_REACHED',
        message: `Cannot add floor: maximum ${siteConstraints.maxFloors} floors already reached`,
        severity: 'high'
      });
    }

    const newHeight = currentHeight + (currentHeight / currentFloors); // Estimate
    if (newHeight > (siteConstraints.maxHeight || Infinity)) {
      errors.push({
        type: 'HEIGHT_LIMIT_EXCEEDED',
        message: `Adding floor would exceed height limit (${siteConstraints.maxHeight}m)`,
        severity: 'high'
      });
    }
  }

  // Check window additions for structural feasibility
  if (isAddingWindows) {
    const currentWindows = countWindows(masterDNA);
    const wallArea = estimateWallArea(masterDNA);
    const windowToWallRatio = currentWindows * 2 / wallArea; // Assume 2m² per window

    if (windowToWallRatio > 0.4) {
      warnings.push({
        type: 'HIGH_GLAZING_RATIO',
        message: 'Adding more windows may compromise structural integrity',
        detail: 'Current window-to-wall ratio already high',
        suggestion: 'Consider larger windows instead of more windows'
      });
    }
  }

  // Check if modification conflicts with site shape
  if (siteConstraints?.shapeType === 'L-shape' && isExpanding) {
    warnings.push({
      type: 'L_SHAPE_EXPANSION_COMPLEX',
      message: 'Expanding L-shaped building requires careful planning',
      suggestion: 'Ensure expansion follows the L-shape geometry'
    });
  }

  // Note: Climate checks removed - climate is not part of siteConstraints structure
  // Climate should be checked separately in the calling code if needed

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    estimatedMetrics: {
      newFootprint: isAddingSpace ? currentFootprint * 1.2 : currentFootprint,
      newFloors: isAddingFloor ? currentFloors + 1 : currentFloors,
      feasible: errors.length === 0 && warnings.length < 3
    }
  };
}

/**
 * Calculate site bounds from polygon
 * @param {Array} polygon - Array of {lat, lng} points
 * @returns {Object} Site dimensions
 */
function calculateSiteBounds(polygon) {
  if (!polygon || polygon.length < 3) {
    return { siteBounds: { length: 0, width: 0 } };
  }

  // Find min/max coordinates
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  polygon.forEach(point => {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  });

  // Convert to meters (rough approximation)
  const latDiff = (maxLat - minLat) * 111000; // 1 degree lat ≈ 111km
  const lngDiff = (maxLng - minLng) * 111000 * Math.cos(minLat * Math.PI / 180);

  return {
    siteBounds: {
      length: Math.max(latDiff, lngDiff),
      width: Math.min(latDiff, lngDiff)
    }
  };
}

/**
 * Count windows in design
 */
function countWindows(masterDNA) {
  let count = 0;

  // Count from rooms
  if (masterDNA.rooms && Array.isArray(masterDNA.rooms)) {
    masterDNA.rooms.forEach(room => {
      count += room.windows || 0;
    });
  }

  // Count from view-specific features
  if (masterDNA.viewSpecificFeatures) {
    Object.values(masterDNA.viewSpecificFeatures).forEach(view => {
      if (view.windows) count += view.windows;
    });
  }

  return count || 10; // Default estimate
}

/**
 * Estimate wall area
 */
function estimateWallArea(masterDNA) {
  const perimeter = 2 * ((masterDNA.dimensions?.length || 15) + (masterDNA.dimensions?.width || 10));
  const height = masterDNA.dimensions?.height || 7;
  return perimeter * height;
}

/**
 * Get ordinal suffix
 */
function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Check if floor plan fits within site polygon
 * @param {Object} floorPlan - Floor plan with room layout
 * @param {Array} sitePolygon - Site boundary points
 * @returns {Object} Validation result
 */
export function validateFloorPlanWithinSite(floorPlan, sitePolygon) {
  if (!floorPlan || !sitePolygon || sitePolygon.length < 3) {
    return { valid: true, violations: [] }; // Skip validation if data missing
  }

  const violations = [];

  // Convert floor plan to polygon points
  const buildingCorners = [
    { x: 0, y: 0 },
    { x: floorPlan.width, y: 0 },
    { x: floorPlan.width, y: floorPlan.length },
    { x: 0, y: floorPlan.length }
  ];

  // Check each corner is within site
  buildingCorners.forEach((corner, i) => {
    if (!isPointInPolygon(corner, sitePolygon)) {
      violations.push({
        type: 'CORNER_OUTSIDE_BOUNDARY',
        corner: i + 1,
        position: corner,
        message: `Building corner ${i + 1} extends beyond site boundary`
      });
    }
  });

  // Check rooms don't violate boundaries
  if (floorPlan.rooms && Array.isArray(floorPlan.rooms)) {
    floorPlan.rooms.forEach(room => {
      if (room.x + room.width > floorPlan.width || room.y + room.length > floorPlan.length) {
        violations.push({
          type: 'ROOM_OUTSIDE_BUILDING',
          room: room.name,
          message: `Room "${room.name}" extends beyond building envelope`
        });
      }
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    coverage: calculateCoverage(buildingCorners, sitePolygon)
  };
}

/**
 * Check if point is inside polygon
 */
function isPointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x || polygon[i].lng;
    const yi = polygon[i].y || polygon[i].lat;
    const xj = polygon[j].x || polygon[j].lng;
    const yj = polygon[j].y || polygon[j].lat;

    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculate building coverage percentage
 */
function calculateCoverage(buildingPolygon, sitePolygon) {
  // Simplified calculation
  const buildingArea = calculatePolygonArea(buildingPolygon);
  const siteArea = calculatePolygonArea(sitePolygon);

  return {
    buildingArea,
    siteArea,
    coveragePercent: siteArea > 0 ? (buildingArea / siteArea * 100).toFixed(1) : '0.0'
  };
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const xi = polygon[i].x || polygon[i].lng || 0;
    const yi = polygon[i].y || polygon[i].lat || 0;
    const xj = polygon[j].x || polygon[j].lng || 0;
    const yj = polygon[j].y || polygon[j].lat || 0;
    area += xi * yj - xj * yi;
  }

  return Math.abs(area / 2);
}

export default {
  validateDesignAgainstSite,
  preValidateModification,
  validateFloorPlanWithinSite
};