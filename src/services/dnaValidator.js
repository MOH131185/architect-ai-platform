/**
 * Design DNA Validator Service
 * Validates building DNA specifications before image generation
 * Ensures consistency and prevents invalid configurations
 */

class DNAValidatorService {
  constructor() {
    console.log('🧬 DNA Validator Service initialized');
  }

  /**
   * Validate complete Design DNA before generation
   * @param {Object} designDNA - The design DNA to validate
   * @returns {Object} Validation result with errors and warnings
   */
  validateDesignDNA(designDNA) {
    console.log('🔍 Validating Design DNA...');

    const errors = [];
    const warnings = [];
    const suggestions = [];

    // 1. Validate dimensions
    this.validateDimensions(designDNA.dimensions, errors, warnings);

    // 2. Validate materials
    this.validateMaterials(designDNA.materials, errors, warnings);

    // 3. Validate roof configuration
    this.validateRoof(designDNA.roof, designDNA.dimensions, errors, warnings);

    // 4. Validate color palette
    this.validateColors(designDNA.colorPalette || designDNA.colors, errors, warnings);

    // 5. Validate floor count consistency
    this.validateFloorCount(designDNA.dimensions, errors, warnings);

    // 6. Validate levels and heights
    this.validateLevels(designDNA, errors, warnings);

    // 7. Validate entrance configuration
    this.validateEntrance(designDNA.entrance, errors, warnings);

    // 7. Validate window configuration
    this.validateWindows(designDNA.windows, errors, warnings);

    // 8. Cross-validate related fields
    this.crossValidate(designDNA, errors, warnings, suggestions);

    const isValid = errors.length === 0;

    console.log(`✅ DNA Validation complete: ${isValid ? 'VALID' : 'INVALID'}`);
    if (errors.length > 0) {
      console.log(`   ❌ Errors: ${errors.length}`);
      errors.forEach(e => console.log(`      - ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`   ⚠️  Warnings: ${warnings.length}`);
      warnings.forEach(w => console.log(`      - ${w}`));
    }
    if (suggestions.length > 0) {
      console.log(`   💡 Suggestions: ${suggestions.length}`);
      suggestions.forEach(s => console.log(`      - ${s}`));
    }

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      validatedDNA: isValid ? this.normalizeDesignDNA(designDNA) : null
    };
  }

  /**
   * Validate building dimensions
   */
  validateDimensions(dimensions, errors, warnings) {
    if (!dimensions) {
      errors.push('Dimensions are missing');
      return;
    }

    // Parse dimensions - support both old (height) and new (totalHeight) field names
    const length = parseFloat(dimensions.length);
    const width = parseFloat(dimensions.width);
    const height = parseFloat(dimensions.height || dimensions.totalHeight);
    const floors = parseInt(dimensions.floors || dimensions.floorCount);

    // Check for valid numbers
    if (isNaN(length) || length <= 0) {
      errors.push(`Invalid length: ${dimensions.length}`);
    } else if (length < 5) {
      warnings.push(`Building length is very small: ${length}m`);
    } else if (length > 50) {
      warnings.push(`Building length is very large: ${length}m`);
    }

    if (isNaN(width) || width <= 0) {
      errors.push(`Invalid width: ${dimensions.width}`);
    } else if (width < 5) {
      warnings.push(`Building width is very small: ${width}m`);
    } else if (width > 30) {
      warnings.push(`Building width is very large: ${width}m`);
    }

    if (isNaN(height) || height <= 0) {
      errors.push(`Invalid height: ${dimensions.height || dimensions.totalHeight}`);
    }

    if (isNaN(floors) || floors < 1) {
      errors.push(`Invalid floor count: ${dimensions.floors}`);
    } else if (floors > 10) {
      warnings.push(`Very tall building: ${floors} floors`);
    }

    // Check aspect ratio
    if (!isNaN(length) && !isNaN(width)) {
      const aspectRatio = length / width;
      if (aspectRatio > 3) {
        warnings.push(`Building is very elongated (ratio: ${aspectRatio.toFixed(1)}:1)`);
      } else if (aspectRatio < 0.5) {
        warnings.push(`Building is very wide (ratio: ${aspectRatio.toFixed(1)}:1)`);
      }
    }

    // Check floor height consistency
    if (!isNaN(height) && !isNaN(floors)) {
      const floorHeight = height / floors;
      if (floorHeight < 2.5) {
        errors.push(`Floor height too low: ${floorHeight.toFixed(1)}m per floor`);
      } else if (floorHeight > 5) {
        warnings.push(`Very high ceilings: ${floorHeight.toFixed(1)}m per floor`);
      }
    }
  }

  /**
   * Validate materials
   */
  validateMaterials(materials, errors, warnings) {
    if (!materials) {
      warnings.push('No materials specified');
      return;
    }

    const materialString = typeof materials === 'string' ? materials : materials.toString();
    const materialList = materialString.split(',').map(m => m.trim());

    if (materialList.length === 0) {
      warnings.push('No materials specified');
    } else if (materialList.length > 5) {
      warnings.push(`Too many materials (${materialList.length}), may cause visual confusion`);
    }

    // Check for conflicting materials
    const hasGlass = materialList.some(m => m.toLowerCase().includes('glass'));
    const hasConcrete = materialList.some(m => m.toLowerCase().includes('concrete'));
    const hasWood = materialList.some(m => m.toLowerCase().includes('wood') || m.toLowerCase().includes('timber'));
    const hasBrick = materialList.some(m => m.toLowerCase().includes('brick'));

    if (hasGlass && materialList.length === 1) {
      warnings.push('Building entirely in glass may not be realistic');
    }

    // Check material compatibility
    if (hasWood && hasConcrete && !hasBrick) {
      warnings.push('Wood and concrete combination may need transitional materials');
    }
  }

  /**
   * Validate roof configuration
   */
  validateRoof(roof, dimensions, errors, warnings) {
    if (!roof) {
      warnings.push('No roof configuration specified');
      return;
    }

    const roofType = (roof.type || '').toLowerCase();
    const validRoofTypes = ['flat', 'gable', 'hip', 'mansard', 'shed', 'pitched', 'dome', 'butterfly'];

    if (!validRoofTypes.includes(roofType)) {
      errors.push(`Invalid roof type: ${roof.type}. Valid types: ${validRoofTypes.join(', ')}`);
    }

    // Check roof pitch for sloped roofs
    if (['gable', 'hip', 'mansard', 'shed', 'pitched'].includes(roofType)) {
      if (roof.pitch) {
        const pitch = parseFloat(roof.pitch);
        if (isNaN(pitch) || pitch < 10 || pitch > 60) {
          warnings.push(`Unusual roof pitch: ${roof.pitch} degrees`);
        }
      }
    }

    // Check roof material compatibility
    if (roof.material) {
      const roofMaterial = roof.material.toLowerCase();
      if (roofType === 'flat' && roofMaterial.includes('tile')) {
        warnings.push('Tiles not suitable for flat roof');
      }
      if (roofType === 'gable' && roofMaterial.includes('membrane')) {
        warnings.push('Membrane typically used for flat roofs, not gable');
      }
    }
  }

  /**
   * Validate color palette
   */
  validateColors(colors, errors, warnings) {
    if (!colors) {
      warnings.push('No color palette specified');
      return;
    }

    // Check for hex color codes
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;

    if (colors.primary) {
      const primary = colors.primary || colors.facade;
      if (primary.startsWith('#') && !hexPattern.test(primary)) {
        errors.push(`Invalid hex color for primary: ${primary}`);
      }
    }

    // Check color contrast
    if (colors.facade === colors.trim) {
      warnings.push('Facade and trim colors are the same, consider contrast');
    }
  }

  /**
   * Validate floor count consistency
   */
  validateFloorCount(dimensions, errors, warnings) {
    if (!dimensions) return;

    const floors = parseInt(dimensions.floors || dimensions.floorCount);
    const height = parseFloat(dimensions.height || dimensions.totalHeight);
    const area = parseFloat(dimensions.totalArea);

    if (!isNaN(floors) && !isNaN(area)) {
      const areaPerFloor = area / floors;
      if (areaPerFloor > 500) {
        warnings.push(`Very large floor plates: ${areaPerFloor.toFixed(0)}m² per floor`);
      } else if (areaPerFloor < 50) {
        warnings.push(`Very small floor plates: ${areaPerFloor.toFixed(0)}m² per floor`);
      }
    }

    // Check if height matches floor count
    if (!isNaN(floors) && !isNaN(height)) {
      const expectedHeight = floors * 3.5; // Standard 3.5m per floor
      const difference = Math.abs(height - expectedHeight);
      if (difference > 2) {
        warnings.push(`Height (${height}m) doesn't match ${floors} floors (expected ~${expectedHeight}m)`);
      }
    }
  }

  /**
   * Validate levels and heights
   * Ensures level data is consistent and normalized
   */
  validateLevels(designDNA, errors, warnings) {
    if (!designDNA.dimensions && !designDNA.levels) return;

    const dimensions = designDNA.dimensions || {};
    const levels = designDNA.levels || [];
    const levelReasoning = designDNA.levelReasoning || {};

    // Validate numLevels
    const numLevels = parseInt(dimensions.numLevels || dimensions.floorCount || 2);
    if (isNaN(numLevels) || numLevels < 1) {
      errors.push(`Invalid numLevels: ${dimensions.numLevels}`);
    } else if (numLevels > 10) {
      warnings.push(`Very tall building: ${numLevels} levels`);
    }

    // Validate hasBasement
    const hasBasement = dimensions.hasBasement || false;
    if (typeof hasBasement !== 'boolean') {
      warnings.push('hasBasement should be boolean, defaulting to false');
    }

    // Validate levelReasoning
    if (levelReasoning.numLevels && parseInt(levelReasoning.numLevels) !== numLevels) {
      warnings.push(`levelReasoning.numLevels (${levelReasoning.numLevels}) doesn't match dimensions.numLevels (${numLevels})`);
    }

    // Validate levels array
    if (levels.length > 0) {
      const expectedLevelCount = numLevels + (hasBasement ? 1 : 0);
      if (levels.length !== expectedLevelCount) {
        warnings.push(`levels array length (${levels.length}) doesn't match expected (${expectedLevelCount} = ${numLevels} levels + ${hasBasement ? 'basement' : 'no basement'})`);
      }

      // Validate each level
      levels.forEach((level, index) => {
        // Normalize level names
        const normalizedLevel = level.level?.toLowerCase();
        const validLevels = ['basement', 'ground', 'first', 'second', 'third', 'fourth', 'fifth'];
        
        if (!normalizedLevel || !validLevels.includes(normalizedLevel)) {
          warnings.push(`Invalid level name: ${level.level} at index ${index}`);
        }

        // Validate level heights
        if (level.height) {
          const height = parseFloat(level.height);
          if (isNaN(height) || height < 2.0) {
            errors.push(`Invalid level height: ${level.height} for ${level.level}`);
          } else if (height > 4.5) {
            warnings.push(`Very high ceiling: ${level.height} for ${level.level}`);
          }
        }

        // Validate level numbers
        if (level.levelNumber !== undefined) {
          if (level.levelNumber < 0 || level.levelNumber > 10) {
            warnings.push(`Invalid levelNumber: ${level.levelNumber} for ${level.level}`);
          }
        }

        // Check consistency with dimensions
        if (normalizedLevel === 'ground' && dimensions.groundFloorHeight) {
          const dimHeight = parseFloat(dimensions.groundFloorHeight);
          const levelHeight = parseFloat(level.height);
          if (!isNaN(dimHeight) && !isNaN(levelHeight) && Math.abs(dimHeight - levelHeight) > 0.1) {
            warnings.push(`Ground floor height mismatch: dimensions.groundFloorHeight (${dimensions.groundFloorHeight}) vs levels[].height (${level.height})`);
          }
        }

        if (normalizedLevel === 'first' && dimensions.upperFloorHeight) {
          const dimHeight = parseFloat(dimensions.upperFloorHeight);
          const levelHeight = parseFloat(level.height);
          if (!isNaN(dimHeight) && !isNaN(levelHeight) && Math.abs(dimHeight - levelHeight) > 0.1) {
            warnings.push(`First floor height mismatch: dimensions.upperFloorHeight (${dimensions.upperFloorHeight}) vs levels[].height (${level.height})`);
          }
        }

        if (normalizedLevel === 'basement' && dimensions.basementHeight) {
          const dimHeight = parseFloat(dimensions.basementHeight);
          const levelHeight = parseFloat(level.height);
          if (!isNaN(dimHeight) && !isNaN(levelHeight) && Math.abs(dimHeight - levelHeight) > 0.1) {
            warnings.push(`Basement height mismatch: dimensions.basementHeight (${dimensions.basementHeight}) vs levels[].height (${level.height})`);
          }
        }
      });
    }

    // Validate floor heights consistency
    if (dimensions.groundFloorHeight && dimensions.upperFloorHeight) {
      const groundHeight = parseFloat(dimensions.groundFloorHeight);
      const upperHeight = parseFloat(dimensions.upperFloorHeight);
      
      if (!isNaN(groundHeight) && !isNaN(upperHeight)) {
        if (groundHeight < 2.4) {
          errors.push(`Ground floor height too low: ${dimensions.groundFloorHeight} (minimum 2.4m)`);
        }
        if (upperHeight < 2.4) {
          errors.push(`Upper floor height too low: ${dimensions.upperFloorHeight} (minimum 2.4m)`);
        }
      }
    }

    // Validate basement height if present
    if (hasBasement && dimensions.basementHeight) {
      const basementHeight = parseFloat(dimensions.basementHeight);
      if (!isNaN(basementHeight)) {
        if (basementHeight < 2.0) {
          errors.push(`Basement height too low: ${dimensions.basementHeight} (minimum 2.0m)`);
        } else if (basementHeight > 3.0) {
          warnings.push(`Unusually high basement: ${dimensions.basementHeight}`);
        }
      }
    }

    // Validate principal facade orientation
    if (designDNA.principalFacadeOrientation) {
      const validOrientations = ['N', 'S', 'E', 'W', 'north', 'south', 'east', 'west'];
      if (!validOrientations.includes(designDNA.principalFacadeOrientation)) {
        warnings.push(`Invalid principalFacadeOrientation: ${designDNA.principalFacadeOrientation}`);
      }
    }

    // Validate recommended elevations
    if (designDNA.recommendedElevations) {
      if (!Array.isArray(designDNA.recommendedElevations)) {
        warnings.push('recommendedElevations should be an array');
      } else if (designDNA.recommendedElevations.length !== 2) {
        warnings.push(`recommendedElevations should have exactly 2 elevations, found ${designDNA.recommendedElevations.length}`);
      } else {
        const validDirections = ['north', 'south', 'east', 'west'];
        designDNA.recommendedElevations.forEach((elev, idx) => {
          if (!validDirections.includes(elev.toLowerCase())) {
            warnings.push(`Invalid elevation direction in recommendedElevations[${idx}]: ${elev}`);
          }
        });
      }
    }
  }

  /**
   * Validate entrance configuration
   */
  validateEntrance(entrance, errors, warnings) {
    if (!entrance) {
      warnings.push('No entrance configuration specified');
      return;
    }

    const validFacades = ['N', 'S', 'E', 'W', 'north', 'south', 'east', 'west', 'North', 'South', 'East', 'West'];
    const facade = entrance.facade || entrance.direction;

    if (facade && !validFacades.includes(facade)) {
      errors.push(`Invalid entrance facade: ${facade}. Use N, S, E, W, or North, South, East, West`);
    }

    const validPositions = ['center', 'left', 'right'];
    if (entrance.position && !validPositions.includes(entrance.position)) {
      warnings.push(`Unusual entrance position: ${entrance.position}`);
    }

    // Check entrance width
    if (entrance.width) {
      const width = parseFloat(entrance.width);
      if (isNaN(width) || width < 0.8) {
        errors.push(`Entrance too narrow: ${entrance.width}`);
      } else if (width > 3) {
        warnings.push(`Very wide entrance: ${entrance.width}`);
      }
    }
  }

  /**
   * Validate window configuration
   */
  validateWindows(windows, errors, warnings) {
    if (!windows) {
      warnings.push('No window configuration specified');
      return;
    }

    const validPatterns = ['ribbon', 'punched', 'curtain wall', 'grid', 'irregular', 'symmetric'];
    if (windows.pattern && !validPatterns.some(p => windows.pattern.toLowerCase().includes(p))) {
      warnings.push(`Unusual window pattern: ${windows.pattern}`);
    }

    const validTypes = ['casement', 'sash', 'fixed', 'sliding', 'pivot', 'awning'];
    if (windows.type && !validTypes.some(t => windows.type.toLowerCase().includes(t))) {
      warnings.push(`Unusual window type: ${windows.type}`);
    }
  }

  /**
   * Cross-validate related fields
   */
  crossValidate(designDNA, errors, warnings, suggestions) {
    const { dimensions, roof, windows, materials } = designDNA;

    // Check flat roof with many floors
    if (roof?.type === 'flat' && dimensions?.floors > 3) {
      warnings.push('Flat roof on tall building may need special drainage');
    }

    // Handle both old (string) and new (object) materials format
    const materialsString = typeof materials === 'string'
      ? materials
      : materials?.exterior?.primary || '';

    // Check glass curtain wall with traditional style
    if (windows?.pattern === 'curtain wall' && materialsString.includes('brick')) {
      suggestions.push('Curtain wall typically pairs better with modern materials (steel, aluminum)');
    }

    // Check material count vs building size (skip if materials is object)
    const area = parseFloat(dimensions?.totalArea);
    if (typeof materials === 'string') {
      const materialCount = materials ? materials.split(',').length : 0;
      if (area > 500 && materialCount > 4) {
        warnings.push('Large building with many materials may look busy');
      }
    }

    // Check entrance vs building program
    if (designDNA.buildingProgram) {
      const program = designDNA.buildingProgram.toLowerCase();
      if (program.includes('office') && !designDNA.entrance) {
        suggestions.push('Office building should have clearly defined entrance');
      }
    }
  }

  /**
   * Normalize and clean Design DNA
   */
  normalizeDesignDNA(designDNA) {
    const normalized = JSON.parse(JSON.stringify(designDNA)); // Deep clone

    // Normalize dimensions
    if (normalized.dimensions) {
      if (normalized.dimensions.length) {
        normalized.dimensions.length = normalized.dimensions.length.toString().replace('m', '') + 'm';
      }
      if (normalized.dimensions.width) {
        normalized.dimensions.width = normalized.dimensions.width.toString().replace('m', '') + 'm';
      }
      // Support both old (height) and new (totalHeight) field names
      if (normalized.dimensions.height) {
        normalized.dimensions.height = normalized.dimensions.height.toString().replace('m', '') + 'm';
      }
      if (normalized.dimensions.totalHeight) {
        normalized.dimensions.totalHeight = normalized.dimensions.totalHeight.toString().replace('m', '') + 'm';
      }
      // Ensure floors is a number
      if (normalized.dimensions.floors || normalized.dimensions.floorCount) {
        normalized.dimensions.floors = parseInt(normalized.dimensions.floors || normalized.dimensions.floorCount);
      }
    }

    // Normalize entrance facade
    if (normalized.entrance?.facade) {
      normalized.entrance.facade = normalized.entrance.facade.charAt(0).toUpperCase();
    }

    // Normalize roof type
    if (normalized.roof?.type) {
      normalized.roof.type = normalized.roof.type.toLowerCase();
    }

    // Normalize levels array
    if (normalized.levels && Array.isArray(normalized.levels)) {
      normalized.levels = normalized.levels.map((level, index) => {
        const normalizedLevel = { ...level };
        
        // Normalize level name to lowercase standard names
        const levelNameMap = {
          'basement': 'basement',
          'ground': 'ground',
          'first': 'first',
          'second': 'second',
          'third': 'third',
          'fourth': 'fourth',
          'fifth': 'fifth',
          'upper': 'first', // Map "upper" to "first"
          'lower': 'ground' // Map "lower" to "ground"
        };
        
        const originalLevel = (level.level || '').toLowerCase();
        if (levelNameMap[originalLevel]) {
          normalizedLevel.level = levelNameMap[originalLevel];
        } else if (!normalizedLevel.level) {
          // Auto-assign based on index if missing
          if (index === 0 && normalized.dimensions?.hasBasement) {
            normalizedLevel.level = 'basement';
          } else if (index === 0 || (index === 1 && normalized.dimensions?.hasBasement)) {
            normalizedLevel.level = 'ground';
          } else {
            const levelNames = ['ground', 'first', 'second', 'third', 'fourth', 'fifth'];
            const offset = normalized.dimensions?.hasBasement ? 1 : 0;
            normalizedLevel.level = levelNames[index - offset] || 'first';
          }
        }
        
        // Ensure levelNumber is set
        if (normalizedLevel.levelNumber === undefined) {
          if (normalizedLevel.level === 'basement') {
            normalizedLevel.levelNumber = 0;
          } else {
            normalizedLevel.levelNumber = index + (normalized.dimensions?.hasBasement ? 0 : 1);
          }
        }
        
        // Normalize height format
        if (normalizedLevel.height && typeof normalizedLevel.height === 'string') {
          normalizedLevel.height = normalizedLevel.height.replace(/[^0-9.]/g, '') + 'm';
        }
        
        return normalizedLevel;
      });
    }

    // Normalize principalFacadeOrientation
    if (normalized.principalFacadeOrientation) {
      const orientationMap = {
        'north': 'N',
        'south': 'S',
        'east': 'E',
        'west': 'W',
        'N': 'N',
        'S': 'S',
        'E': 'E',
        'W': 'W'
      };
      const mappedOrientation = orientationMap[normalized.principalFacadeOrientation.toLowerCase()];
      if (mappedOrientation) {
        normalized.principalFacadeOrientation = mappedOrientation;
      }
    }

    // Normalize recommendedElevations
    if (normalized.recommendedElevations && Array.isArray(normalized.recommendedElevations)) {
      normalized.recommendedElevations = normalized.recommendedElevations.map(elev => {
        const elevLower = elev.toLowerCase();
        if (['north', 'south', 'east', 'west'].includes(elevLower)) {
          return elevLower;
        }
        return elev;
      });
    }

    return normalized;
  }

  /**
   * Auto-fix common DNA issues
   */
  autoFixDesignDNA(designDNA) {
    console.log('🔧 Attempting to auto-fix Design DNA issues...');

    const fixed = JSON.parse(JSON.stringify(designDNA)); // Deep clone

    // Fix missing dimensions
    if (!fixed.dimensions) {
      fixed.dimensions = {
        length: '15m',
        width: '10m',
        height: '7m',
        totalHeight: '7m', // Support new DNA format
        floors: 2
      };
    } else {
      // If dimensions exist but missing height/totalHeight, add both
      if (!fixed.dimensions.height && !fixed.dimensions.totalHeight) {
        fixed.dimensions.height = '7m';
        fixed.dimensions.totalHeight = '7m';
      } else if (fixed.dimensions.height && !fixed.dimensions.totalHeight) {
        // Sync totalHeight from height
        fixed.dimensions.totalHeight = fixed.dimensions.height;
      } else if (fixed.dimensions.totalHeight && !fixed.dimensions.height) {
        // Sync height from totalHeight
        fixed.dimensions.height = fixed.dimensions.totalHeight;
      }

      // Fix missing floors - check both property names
      if (!fixed.dimensions.floors && !fixed.dimensions.floorCount && !fixed.dimensions.floor_count) {
        fixed.dimensions.floors = 2;
        fixed.dimensions.floor_count = 2; // Support alternative naming
      }
    }

    // Fix missing materials
    if (!fixed.materials) {
      fixed.materials = 'brick, glass, concrete';
    }

    // Fix missing roof
    if (!fixed.roof) {
      fixed.roof = {
        type: 'gable',
        material: 'tiles'
      };
    }

    // Fix missing entrance
    if (!fixed.entrance) {
      fixed.entrance = {
        facade: 'N',
        position: 'center'
      };
    }

    // Fix missing windows
    if (!fixed.windows) {
      fixed.windows = {
        pattern: 'grid',
        type: 'casement'
      };
    }

    // Fix color palette issues
    if (fixed.colorPalette || fixed.colors) {
      const colors = fixed.colorPalette || fixed.colors;
      // If facade and trim colors are the same, differentiate them
      if (colors.facade && colors.trim && colors.facade === colors.trim) {
        // Make trim slightly darker or lighter
        colors.trim = '#FFFFFF'; // Default white trim for contrast
      }
    }

    // Re-validate the fixed DNA
    const validation = this.validateDesignDNA(fixed);

    if (validation.isValid) {
      console.log('✅ Design DNA auto-fixed successfully');
      return fixed;
    } else {
      console.log('⚠️  Auto-fix incomplete, manual intervention needed');
      return null;
    }
  }
}

export default new DNAValidatorService();