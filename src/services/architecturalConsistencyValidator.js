/**
 * Architectural Consistency Validator
 * 
 * Validates that generated A1 sheets maintain perfect consistency across all panels.
 * Uses architectural logic to detect:
 * - Window count mismatches
 * - Dimension inconsistencies
 * - Material variations
 * - Geometry drift
 * - Floor count errors
 * 
 * This is NOT artistic validation - this is ARCHITECTURAL LOGIC validation.
 */

import logger from '../utils/logger.js';

/**
 * Validate A1 sheet consistency against DNA locks
 * @param {Object} params - Validation parameters
 * @returns {Object} Validation result
 */
export async function validateA1SheetConsistency({
  generatedImageUrl,
  masterDNA,
  consistencyLocks,
  strictMode = true
}) {
  logger.info('Validating A1 sheet consistency', { strictMode }, '🔍');

  const errors = [];
  const warnings = [];
  const validations = [];

  // 1. Validate dimensional consistency
  const dimensionalValidation = validateDimensionalConsistency(masterDNA, consistencyLocks);
  validations.push(dimensionalValidation);
  errors.push(...dimensionalValidation.errors);
  warnings.push(...dimensionalValidation.warnings);

  // 2. Validate material consistency
  const materialValidation = validateMaterialConsistency(masterDNA, consistencyLocks);
  validations.push(materialValidation);
  errors.push(...materialValidation.errors);
  warnings.push(...materialValidation.warnings);

  // 3. Validate window consistency
  const windowValidation = validateWindowConsistency(masterDNA, consistencyLocks);
  validations.push(windowValidation);
  errors.push(...windowValidation.errors);
  warnings.push(...windowValidation.warnings);

  // 4. Validate roof consistency
  const roofValidation = validateRoofConsistency(masterDNA, consistencyLocks);
  validations.push(roofValidation);
  errors.push(...roofValidation.errors);
  warnings.push(...roofValidation.warnings);

  // 5. Validate floor count consistency
  const floorValidation = validateFloorCountConsistency(masterDNA, consistencyLocks);
  validations.push(floorValidation);
  errors.push(...floorValidation.errors);
  warnings.push(...floorValidation.warnings);

  // 6. Validate door consistency
  const doorValidation = validateDoorConsistency(masterDNA, consistencyLocks);
  validations.push(doorValidation);
  errors.push(...doorValidation.errors);
  warnings.push(...doorValidation.warnings);

  // Calculate consistency score
  const consistencyScore = calculateConsistencyScore(validations);

  const isValid = strictMode ? errors.length === 0 : consistencyScore >= 0.95;

  logger.info('Consistency validation complete', {
    score: consistencyScore,
    errors: errors.length,
    warnings: warnings.length,
    valid: isValid
  });

  if (errors.length > 0) {
    logger.error('Consistency errors detected', { errors });
  }

  if (warnings.length > 0) {
    logger.warn('Consistency warnings detected', { warnings });
  }

  return {
    valid: isValid,
    consistencyScore,
    errors,
    warnings,
    validations,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate dimensional consistency
 * @private
 */
function validateDimensionalConsistency(masterDNA, locks) {
  const errors = [];
  const warnings = [];

  const dimensions = masterDNA.dimensions || {};

  // Check length
  const length = parseFloat(dimensions.length);
  const expectedLength = parseFloat(locks.EXACT_LENGTH);
  if (Math.abs(length - expectedLength) > 0.1) {
    errors.push(`Length mismatch: expected ${expectedLength}m, got ${length}m`);
  }

  // Check width
  const width = parseFloat(dimensions.width);
  const expectedWidth = parseFloat(locks.EXACT_WIDTH);
  if (Math.abs(width - expectedWidth) > 0.1) {
    errors.push(`Width mismatch: expected ${expectedWidth}m, got ${width}m`);
  }

  // Check height
  const height = parseFloat(dimensions.totalHeight || dimensions.height);
  const expectedHeight = parseFloat(locks.EXACT_HEIGHT);
  if (Math.abs(height - expectedHeight) > 0.1) {
    errors.push(`Height mismatch: expected ${expectedHeight}m, got ${height}m`);
  }

  // Check floor count
  const floorCount = parseInt(dimensions.floorCount || dimensions.floors);
  const expectedFloorCount = parseInt(locks.EXACT_FLOOR_COUNT);
  if (floorCount !== expectedFloorCount) {
    errors.push(`Floor count mismatch: expected ${expectedFloorCount}, got ${floorCount}`);
  }

  // Check ground floor height
  const groundHeight = parseFloat(dimensions.groundFloorHeight);
  const expectedGroundHeight = parseFloat(locks.EXACT_GROUND_HEIGHT);
  if (Math.abs(groundHeight - expectedGroundHeight) > 0.1) {
    warnings.push(`Ground floor height mismatch: expected ${expectedGroundHeight}m, got ${groundHeight}m`);
  }

  // Check upper floor height
  if (floorCount > 1) {
    const upperHeight = parseFloat(dimensions.upperFloorHeight);
    const expectedUpperHeight = parseFloat(locks.EXACT_UPPER_HEIGHT);
    if (Math.abs(upperHeight - expectedUpperHeight) > 0.1) {
      warnings.push(`Upper floor height mismatch: expected ${expectedUpperHeight}m, got ${upperHeight}m`);
    }
  }

  return {
    category: 'dimensions',
    valid: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 1.0 : 0.0
  };
}

/**
 * Validate material consistency
 * @private
 */
function validateMaterialConsistency(masterDNA, locks) {
  const errors = [];
  const warnings = [];

  const materials = masterDNA.materials || [];
  const colorPalette = masterDNA.colorPalette || {};

  // Check facade color
  const facadeColor = colorPalette.facade || materials[0]?.hexColor || materials[0]?.color;
  const expectedFacadeColor = locks.EXACT_FACADE_COLOR;
  if (facadeColor && facadeColor.toUpperCase() !== expectedFacadeColor.toUpperCase()) {
    errors.push(`Facade color mismatch: expected ${expectedFacadeColor}, got ${facadeColor}`);
  }

  // Check trim color
  const trimColor = colorPalette.trim;
  const expectedTrimColor = locks.EXACT_TRIM_COLOR;
  if (trimColor && trimColor.toUpperCase() !== expectedTrimColor.toUpperCase()) {
    errors.push(`Trim color mismatch: expected ${expectedTrimColor}, got ${trimColor}`);
  }

  // Check trim is different from facade
  if (facadeColor && trimColor && facadeColor.toUpperCase() === trimColor.toUpperCase()) {
    warnings.push('Trim color should be different from facade color for contrast');
  }

  // Check roof color
  const roofColor = masterDNA.roof?.color;
  const expectedRoofColor = locks.EXACT_ROOF_COLOR_LOCK;
  if (roofColor && roofColor.toUpperCase() !== expectedRoofColor.toUpperCase()) {
    errors.push(`Roof color mismatch: expected ${expectedRoofColor}, got ${roofColor}`);
  }

  return {
    category: 'materials',
    valid: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 1.0 : 0.5
  };
}

/**
 * Validate window consistency
 * @private
 */
function validateWindowConsistency(masterDNA, locks) {
  const errors = [];
  const warnings = [];

  const elevations = masterDNA.elevations || {};

  // Extract window counts from elevations
  const northCount = extractWindowCount(elevations.north);
  const southCount = extractWindowCount(elevations.south);
  const eastCount = extractWindowCount(elevations.east);
  const westCount = extractWindowCount(elevations.west);

  const totalCount = northCount + southCount + eastCount + westCount;

  // Check against locks
  const expectedNorth = parseInt(locks.EXACT_WINDOW_COUNT_NORTH);
  const expectedSouth = parseInt(locks.EXACT_WINDOW_COUNT_SOUTH);
  const expectedEast = parseInt(locks.EXACT_WINDOW_COUNT_EAST);
  const expectedWest = parseInt(locks.EXACT_WINDOW_COUNT_WEST);
  const expectedTotal = parseInt(locks.EXACT_WINDOW_TOTAL);

  if (northCount !== expectedNorth) {
    errors.push(`North elevation window count mismatch: expected ${expectedNorth}, got ${northCount}`);
  }

  if (southCount !== expectedSouth) {
    errors.push(`South elevation window count mismatch: expected ${expectedSouth}, got ${southCount}`);
  }

  if (eastCount !== expectedEast) {
    errors.push(`East elevation window count mismatch: expected ${expectedEast}, got ${eastCount}`);
  }

  if (westCount !== expectedWest) {
    errors.push(`West elevation window count mismatch: expected ${expectedWest}, got ${westCount}`);
  }

  if (totalCount !== expectedTotal) {
    errors.push(`Total window count mismatch: expected ${expectedTotal}, got ${totalCount}`);
  }

  // Check window type consistency
  const windowType = masterDNA.windows?.type || masterDNA.materials?.windows?.type;
  const expectedWindowType = locks.EXACT_WINDOW_TYPE;
  if (windowType && windowType !== expectedWindowType) {
    warnings.push(`Window type mismatch: expected ${expectedWindowType}, got ${windowType}`);
  }

  return {
    category: 'windows',
    valid: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 1.0 : Math.max(0, 1.0 - (errors.length * 0.2))
  };
}

/**
 * Extract window count from elevation features
 * @private
 */
function extractWindowCount(elevation) {
  if (!elevation || !elevation.features) return 0;

  const featuresText = elevation.features.join(' ').toLowerCase();
  const match = featuresText.match(/(\d+)\s+windows?/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Validate roof consistency
 * @private
 */
function validateRoofConsistency(masterDNA, locks) {
  const errors = [];
  const warnings = [];

  const roof = masterDNA.roof || {};

  // Check roof type
  const roofType = roof.type?.toLowerCase();
  const expectedRoofType = locks.EXACT_ROOF_TYPE?.toLowerCase();
  if (roofType && roofType !== expectedRoofType) {
    errors.push(`Roof type mismatch: expected ${expectedRoofType}, got ${roofType}`);
  }

  // Check roof pitch
  const roofPitch = parseFloat(roof.pitch);
  const expectedRoofPitch = parseFloat(locks.EXACT_ROOF_PITCH);
  if (!isNaN(roofPitch) && !isNaN(expectedRoofPitch)) {
    if (Math.abs(roofPitch - expectedRoofPitch) > 1) {
      errors.push(`Roof pitch mismatch: expected ${expectedRoofPitch}°, got ${roofPitch}°`);
    }
  }

  // Check roof material
  const roofMaterial = roof.material;
  const expectedRoofMaterial = locks.EXACT_ROOF_MATERIAL;
  if (roofMaterial && roofMaterial !== expectedRoofMaterial) {
    warnings.push(`Roof material mismatch: expected ${expectedRoofMaterial}, got ${roofMaterial}`);
  }

  return {
    category: 'roof',
    valid: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 1.0 : 0.5
  };
}

/**
 * Validate floor count consistency
 * @private
 */
function validateFloorCountConsistency(masterDNA, locks) {
  const errors = [];
  const warnings = [];

  const dimensions = masterDNA.dimensions || {};
  const floorCount = parseInt(dimensions.floorCount || dimensions.floors);
  const expectedFloorCount = parseInt(locks.EXACT_FLOOR_COUNT);

  if (floorCount !== expectedFloorCount) {
    errors.push(`Floor count mismatch: expected ${expectedFloorCount}, got ${floorCount}`);
  }

  // Check if floor plans exist for each floor
  const floorPlans = masterDNA.floorPlans || {};
  if (floorCount >= 1 && !floorPlans.ground) {
    warnings.push('Ground floor plan missing');
  }
  if (floorCount >= 2 && !floorPlans.first && !floorPlans.upper) {
    warnings.push('First floor plan missing');
  }

  // Check if elevations show correct floor count
  const elevations = masterDNA.elevations || {};
  Object.entries(elevations).forEach(([direction, elevation]) => {
    if (elevation.features) {
      const featuresText = elevation.features.join(' ').toLowerCase();
      // Check for floor count mentions
      const floorMatch = featuresText.match(/(\d+)\s+floors?/);
      if (floorMatch) {
        const mentionedFloors = parseInt(floorMatch[1]);
        if (mentionedFloors !== expectedFloorCount) {
          warnings.push(`${direction} elevation mentions ${mentionedFloors} floors, expected ${expectedFloorCount}`);
        }
      }
    }
  });

  return {
    category: 'floor_count',
    valid: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 1.0 : 0.0
  };
}

/**
 * Validate door consistency
 * @private
 */
function validateDoorConsistency(masterDNA, locks) {
  const errors = [];
  const warnings = [];

  const entrance = masterDNA.entrance || {};
  const doors = masterDNA.materials?.doors?.main || masterDNA.doors?.main || {};

  // Check door location
  const doorLocation = entrance.facade || entrance.direction;
  const expectedDoorLocation = locks.EXACT_DOOR_LOCATION;
  if (doorLocation && doorLocation !== expectedDoorLocation) {
    errors.push(`Door location mismatch: expected ${expectedDoorLocation} facade, got ${doorLocation} facade`);
  }

  // Check door position
  const doorPosition = entrance.position;
  const expectedDoorPosition = locks.EXACT_DOOR_POSITION;
  if (doorPosition && doorPosition !== expectedDoorPosition) {
    warnings.push(`Door position mismatch: expected ${expectedDoorPosition}, got ${doorPosition}`);
  }

  // Check door width
  const doorWidth = parseFloat(doors.width || entrance.width);
  const expectedDoorWidth = parseFloat(locks.EXACT_DOOR_WIDTH);
  if (!isNaN(doorWidth) && !isNaN(expectedDoorWidth)) {
    if (Math.abs(doorWidth - expectedDoorWidth) > 0.1) {
      warnings.push(`Door width mismatch: expected ${expectedDoorWidth}m, got ${doorWidth}m`);
    }
  }

  // Check door color
  const doorColor = doors.color;
  const expectedDoorColor = locks.EXACT_DOOR_COLOR;
  if (doorColor && doorColor.toUpperCase() !== expectedDoorColor.toUpperCase()) {
    warnings.push(`Door color mismatch: expected ${expectedDoorColor}, got ${doorColor}`);
  }

  return {
    category: 'doors',
    valid: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 1.0 : 0.8
  };
}

/**
 * Calculate overall consistency score
 * @private
 */
function calculateConsistencyScore(validations) {
  if (validations.length === 0) return 0;

  const totalScore = validations.reduce((sum, v) => sum + v.score, 0);
  return totalScore / validations.length;
}

/**
 * Generate consistency report
 * @param {Object} validationResult - Validation result
 * @returns {string} Human-readable report
 */
export function generateConsistencyReport(validationResult) {
  const { valid, consistencyScore, errors, warnings, validations } = validationResult;

  let report = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += '🔍 ARCHITECTURAL CONSISTENCY VALIDATION REPORT\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  report += `Overall Status: ${valid ? '✅ VALID' : '❌ INVALID'}\n`;
  report += `Consistency Score: ${(consistencyScore * 100).toFixed(1)}%\n\n`;

  // Category breakdown
  report += 'Category Breakdown:\n';
  validations.forEach(v => {
    const status = v.valid ? '✅' : '❌';
    const score = (v.score * 100).toFixed(0);
    report += `  ${status} ${v.category.toUpperCase()}: ${score}%\n`;
  });
  report += '\n';

  // Errors
  if (errors.length > 0) {
    report += `❌ ERRORS (${errors.length}):\n`;
    errors.forEach((error, idx) => {
      report += `  ${idx + 1}. ${error}\n`;
    });
    report += '\n';
  }

  // Warnings
  if (warnings.length > 0) {
    report += `⚠️  WARNINGS (${warnings.length}):\n`;
    warnings.forEach((warning, idx) => {
      report += `  ${idx + 1}. ${warning}\n`;
    });
    report += '\n';
  }

  if (valid) {
    report += '✅ All consistency checks passed. A1 sheet is architecturally consistent.\n';
  } else {
    report += '❌ Consistency checks failed. A1 sheet requires regeneration with stricter locks.\n';
  }

  report += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

  return report;
}

/**
 * Auto-fix consistency issues in DNA
 * @param {Object} masterDNA - Master DNA
 * @param {Object} consistencyLocks - Consistency locks
 * @returns {Object} Fixed DNA
 */
export function autoFixConsistencyIssues(masterDNA, consistencyLocks) {
  logger.info('Auto-fixing consistency issues', null, '🔧');

  const fixed = JSON.parse(JSON.stringify(masterDNA)); // Deep clone

  // Fix dimensions
  if (fixed.dimensions) {
    fixed.dimensions.length = parseFloat(consistencyLocks.EXACT_LENGTH);
    fixed.dimensions.width = parseFloat(consistencyLocks.EXACT_WIDTH);
    fixed.dimensions.height = parseFloat(consistencyLocks.EXACT_HEIGHT);
    fixed.dimensions.totalHeight = parseFloat(consistencyLocks.EXACT_HEIGHT);
    fixed.dimensions.floorCount = parseInt(consistencyLocks.EXACT_FLOOR_COUNT);
    fixed.dimensions.groundFloorHeight = parseFloat(consistencyLocks.EXACT_GROUND_HEIGHT);
    fixed.dimensions.upperFloorHeight = parseFloat(consistencyLocks.EXACT_UPPER_HEIGHT);
  }

  // Fix roof
  if (fixed.roof) {
    fixed.roof.type = consistencyLocks.EXACT_ROOF_TYPE;
    fixed.roof.pitch = parseFloat(consistencyLocks.EXACT_ROOF_PITCH);
    fixed.roof.material = consistencyLocks.EXACT_ROOF_MATERIAL;
    fixed.roof.color = consistencyLocks.EXACT_ROOF_COLOR_LOCK;
  }

  // Fix colors
  if (fixed.colorPalette) {
    fixed.colorPalette.facade = consistencyLocks.EXACT_FACADE_COLOR;
    fixed.colorPalette.trim = consistencyLocks.EXACT_TRIM_COLOR;
    fixed.colorPalette.roof = consistencyLocks.EXACT_ROOF_COLOR_LOCK;
  }

  // Fix entrance
  if (fixed.entrance) {
    fixed.entrance.facade = consistencyLocks.EXACT_DOOR_LOCATION;
    fixed.entrance.position = consistencyLocks.EXACT_DOOR_POSITION;
    fixed.entrance.width = parseFloat(consistencyLocks.EXACT_DOOR_WIDTH);
  }

  logger.success('Consistency issues auto-fixed');

  return fixed;
}

export default {
  validateA1SheetConsistency,
  generateConsistencyReport,
  autoFixConsistencyIssues
};

