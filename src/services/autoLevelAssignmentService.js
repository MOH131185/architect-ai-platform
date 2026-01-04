/**
 * Auto Level Assignment Service
 *
 * Automatically calculates optimal number of levels and assigns program spaces
 * based on the proportion between total program area and site area.
 *
 * Key Logic:
 * 1. Calculate optimal floor count: totalProgramArea / (siteArea × coverageRatio)
 * 2. Distribute spaces across floors based on architectural principles
 * 3. Ensure ground floor has public/accessible spaces
 * 4. Ensure upper floors have private/specialized spaces
 */

import logger from '../utils/logger.js';

class AutoLevelAssignmentService {
  constructor() {
    logger.info('🏢 Auto Level Assignment Service initialized');
  }

  /**
   * Calculate optimal number of levels based on program area and site area
   * @param {number} totalProgramArea - Total area of all program spaces (m²)
   * @param {number} siteArea - Site area from location (m²)
   * @param {Object} options - Optional parameters
   * @returns {Object} Floor count and metrics
   */
  calculateOptimalLevels(totalProgramArea, siteArea, options = {}) {
    const {
      buildingType = 'mixed-use',
      maxHeight = Infinity,
      maxFloors = 10,
      minFloorHeight = 2.7,  // meters
      typicalFloorHeight = 3.0,  // meters
      coverageRatio = 0.6,  // 60% default site coverage
      circulationFactor = 1.15  // 15% circulation allowance
    } = options;

    logger.info('Calculating optimal floor count', {
      programArea: totalProgramArea,
      siteArea,
      buildingType
    }, '🏢');

    // Step 1: Adjust coverage ratio based on building type and density
    let adjustedCoverage = coverageRatio;

    if (buildingType.toLowerCase().includes('house') || buildingType.toLowerCase().includes('villa')) {
      adjustedCoverage = 0.4; // 40% for low-density residential
    } else if (buildingType.toLowerCase().includes('retail') || buildingType.toLowerCase().includes('commercial')) {
      adjustedCoverage = 0.7; // 70% for commercial
    } else if (buildingType.toLowerCase().includes('apartment') || buildingType.toLowerCase().includes('office')) {
      adjustedCoverage = 0.65; // 65% for medium-density
    }

    // Step 2: Calculate buildable footprint
    const setbackReduction = 0.85; // 15% lost to setbacks
    const maxFootprintArea = siteArea * adjustedCoverage * setbackReduction;

    logger.info(`   Site area: ${siteArea.toFixed(0)}m²`);
    logger.info(`   Coverage ratio: ${(adjustedCoverage * 100).toFixed(0)}%`);
    logger.info(`   Max footprint: ${maxFootprintArea.toFixed(0)}m²`);

    // Step 3: Account for circulation
    const totalAreaWithCirculation = totalProgramArea * circulationFactor;

    logger.info(`   Program area: ${totalProgramArea.toFixed(0)}m²`);
    logger.info(`   With circulation: ${totalAreaWithCirculation.toFixed(0)}m²`);

    // Step 4: Calculate minimum floors needed
    const minFloorsNeeded = Math.ceil(totalAreaWithCirculation / maxFootprintArea);

    logger.info(`   Min floors needed: ${minFloorsNeeded}`);

    // Step 5: Check height restrictions
    let maxFloorsAllowed = maxFloors;
    if (maxHeight !== Infinity) {
      maxFloorsAllowed = Math.floor(maxHeight / typicalFloorHeight);
      logger.info(`   Max floors allowed (height): ${maxFloorsAllowed}`);
    }

    // Step 6: Determine optimal floor count
    const optimalFloors = Math.min(Math.max(minFloorsNeeded, 1), maxFloorsAllowed);

    // Step 7: Calculate actual footprint needed
    const actualFootprint = totalAreaWithCirculation / optimalFloors;

    // Step 8: Check if fits within site
    const fitsWithinSite = actualFootprint <= maxFootprintArea;
    const siteCoveragePercent = (actualFootprint / siteArea) * 100;

    logger.info(`   Optimal floors: ${optimalFloors}`);
    logger.info(`   Actual footprint: ${actualFootprint.toFixed(0)}m²`);
    logger.info(`   Site coverage: ${siteCoveragePercent.toFixed(1)}%`);
    logger.info(`   Fits within site: ${fitsWithinSite ? 'YES ✅' : 'NO ❌'}`);

    return {
      optimalFloors,
      minFloorsNeeded,
      maxFloorsAllowed,
      actualFootprint,
      maxFootprintArea,
      siteCoveragePercent,
      fitsWithinSite,
      floorHeight: typicalFloorHeight,
      totalHeight: optimalFloors * typicalFloorHeight,
      reasoning: this._generateFloorCountReasoning(
        optimalFloors,
        totalProgramArea,
        siteArea,
        actualFootprint,
        maxFootprintArea,
        buildingType
      )
    };
  }

  /**
   * Generate reasoning for floor count decision
   * @private
   */
  _generateFloorCountReasoning(floors, programArea, siteArea, footprint, maxFootprint, buildingType) {
    const reasons = [];

    reasons.push(`${floors} floors optimal to fit ${programArea.toFixed(0)}m² program within ${siteArea.toFixed(0)}m² site`);

    if (footprint > maxFootprint * 0.9) {
      reasons.push(`Footprint utilization high (${(footprint/maxFootprint*100).toFixed(0)}%) - efficient site usage`);
    } else if (footprint < maxFootprint * 0.5) {
      reasons.push(`Footprint utilization low (${(footprint/maxFootprint*100).toFixed(0)}%) - consider reducing floors or increasing program`);
    }

    if (floors === 1) {
      reasons.push('Single-story design - ideal for accessibility and horizontal circulation');
    } else if (floors === 2) {
      reasons.push('Two-story design - good balance of compactness and accessibility');
    } else if (floors >= 3) {
      reasons.push(`${floors}-story design - vertical circulation (stairs/lift) required`);
    }

    return reasons.join('. ');
  }

  /**
   * Automatically assign program spaces to levels based on architectural principles
   * @param {Array} programSpaces - Array of program space objects
   * @param {number} optimalFloors - Calculated optimal floor count
   * @param {string} buildingType - Type of building
   * @returns {Array} Program spaces with level assignments
   */
  autoAssignSpacesToLevels(programSpaces, optimalFloors, buildingType = 'mixed-use') {
    if (!programSpaces || programSpaces.length === 0) {
      logger.warn('No program spaces to assign');
      return [];
    }

    logger.info('Auto-assigning spaces to levels', {
      spaceCount: programSpaces.length,
      floors: optimalFloors,
      buildingType
    }, '🏢');

    // Step 1: Categorize spaces by priority
    const categorized = this._categorizeSpacesByPriority(programSpaces, buildingType);

    // Step 2: Calculate area per floor
    const totalArea = programSpaces.reduce((sum, space) =>
      sum + (parseFloat(space.area || 0) * (space.count || 1)), 0
    );
    const targetAreaPerFloor = totalArea / optimalFloors;

    logger.info(`   Target area per floor: ${targetAreaPerFloor.toFixed(0)}m²`);

    // Step 3: Assign spaces to levels
    const levels = this._generateLevelNames(optimalFloors);
    const assignedSpaces = this._distributeSpacesAcrossLevels(
      categorized,
      levels,
      targetAreaPerFloor,
      buildingType
    );

    // Step 4: Log distribution
    levels.forEach((level, idx) => {
      const spacesOnLevel = assignedSpaces.filter(s => s.level === level);
      const areaOnLevel = spacesOnLevel.reduce((sum, s) =>
        sum + (parseFloat(s.area || 0) * (s.count || 1)), 0
      );
      logger.info(`   ${level}: ${spacesOnLevel.length} spaces, ${areaOnLevel.toFixed(0)}m²`);
    });

    return assignedSpaces;
  }

  /**
   * Categorize spaces by priority (ground vs upper floors)
   * @private
   */
  _categorizeSpacesByPriority(spaces, buildingType) {
    const categories = {
      groundPriority: [],    // Must be on ground floor
      firstPriority: [],     // Prefer first floor
      upperPriority: [],     // Prefer upper floors
      flexible: []           // Can be on any floor
    };

    spaces.forEach(space => {
      const name = space.name.toLowerCase();
      const type = buildingType.toLowerCase();

      // Ground floor priorities (PUBLIC ACCESS, ACCESSIBILITY, HEAVY SERVICES)
      if (
        name.includes('reception') || name.includes('waiting') || name.includes('lobby') ||
        name.includes('entrance') || name.includes('foyer') ||
        name.includes('sales') || name.includes('retail') || name.includes('shop') ||
        name.includes('restaurant') || name.includes('cafe') || name.includes('dining') ||
        name.includes('kitchen') || name.includes('laboratory') || name.includes('lab') ||
        name.includes('treatment') || name.includes('consultation') || name.includes('medical') ||
        name.includes('pharmacy') || name.includes('emergency') ||
        name.includes('gym') || name.includes('gymnasium') || name.includes('cafeteria') ||
        name.includes('library') || (name.includes('toilet') && !name.includes('staff'))
      ) {
        categories.groundPriority.push(space);
      }
      // First floor priorities (SEMI-PRIVATE, ADMINISTRATION)
      else if (
        name.includes('office') || name.includes('admin') || name.includes('staff room') ||
        name.includes('meeting') || name.includes('conference') ||
        name.includes('records') || name.includes('archive') ||
        name.includes('classroom') || name.includes('study')
      ) {
        categories.firstPriority.push(space);
      }
      // Upper floor priorities (PRIVATE, RESIDENTIAL)
      else if (
        name.includes('bedroom') || name.includes('bathroom') || name.includes('ensuite') ||
        name.includes('master') || name.includes('private') ||
        name.includes('study') || name.includes('den') || name.includes('loft') ||
        name.includes('roof') || name.includes('terrace') || name.includes('balcony')
      ) {
        categories.upperPriority.push(space);
      }
      // Building type specific
      else if (type.includes('house') || type.includes('villa') || type.includes('residential')) {
        // Residential: Living spaces ground, bedrooms upper
        if (name.includes('living') || name.includes('lounge') || name.includes('wc')) {
          categories.groundPriority.push(space);
        } else if (name.includes('bed') || name.includes('bath')) {
          categories.upperPriority.push(space);
        } else {
          categories.flexible.push(space);
        }
      } else if (type.includes('clinic') || type.includes('hospital') || type.includes('medical')) {
        // Healthcare: Treatment ground, admin upper
        if (name.includes('patient') || name.includes('ward')) {
          categories.groundPriority.push(space);
        } else {
          categories.flexible.push(space);
        }
      } else {
        categories.flexible.push(space);
      }
    });

    logger.info('   Categorized spaces:');
    logger.info(`     Ground priority: ${categories.groundPriority.length}`);
    logger.info(`     First priority: ${categories.firstPriority.length}`);
    logger.info(`     Upper priority: ${categories.upperPriority.length}`);
    logger.info(`     Flexible: ${categories.flexible.length}`);

    return categories;
  }

  /**
   * Generate level names based on floor count
   * @private
   */
  _generateLevelNames(floorCount) {
    const levels = ['Ground'];

    if (floorCount >= 2) {
      levels.push('First');
    }
    if (floorCount >= 3) {
      levels.push('Second');
    }
    if (floorCount >= 4) {
      levels.push('Third');
    }
    if (floorCount >= 5) {
      for (let i = 5; i <= floorCount; i++) {
        levels.push(`${i - 1}th`);
      }
    }

    return levels;
  }

  /**
   * Distribute spaces across levels to balance area
   * @private
   */
  _distributeSpacesAcrossLevels(categorized, levels, targetAreaPerFloor, buildingType) {
    const assigned = [];
    const floorAreas = levels.map(() => 0);

    // Helper to calculate space area
    const getSpaceArea = (space) => parseFloat(space.area || 0) * (space.count || 1);

    // Step 1: Assign ground priority spaces to ground floor
    categorized.groundPriority.forEach(space => {
      assigned.push({ ...space, level: 'Ground' });
      floorAreas[0] += getSpaceArea(space);
    });

    // Step 2: Assign first priority spaces to first floor (if exists)
    if (levels.length >= 2) {
      categorized.firstPriority.forEach(space => {
        assigned.push({ ...space, level: 'First' });
        floorAreas[1] += getSpaceArea(space);
      });
    } else {
      // If only 1 floor, add to ground
      categorized.firstPriority.forEach(space => {
        assigned.push({ ...space, level: 'Ground' });
        floorAreas[0] += getSpaceArea(space);
      });
    }

    // Step 3: Assign upper priority spaces to upper floors
    if (levels.length >= 2) {
      const upperStartIdx = levels.length >= 3 ? 2 : 1; // Start from Second or First
      let upperIdx = upperStartIdx;

      categorized.upperPriority.forEach(space => {
        assigned.push({ ...space, level: levels[upperIdx] });
        floorAreas[upperIdx] += getSpaceArea(space);

        // Rotate through upper floors to balance
        upperIdx = (upperIdx + 1 - upperStartIdx) % (levels.length - upperStartIdx) + upperStartIdx;
      });
    } else {
      // If only 1 floor, add to ground
      categorized.upperPriority.forEach(space => {
        assigned.push({ ...space, level: 'Ground' });
        floorAreas[0] += getSpaceArea(space);
      });
    }

    // Step 4: Distribute flexible spaces to balance floor areas
    categorized.flexible.forEach(space => {
      // Find floor with least area
      const minAreaIdx = floorAreas.indexOf(Math.min(...floorAreas));
      assigned.push({ ...space, level: levels[minAreaIdx] });
      floorAreas[minAreaIdx] += getSpaceArea(space);
    });

    // Step 5: Add circulation spaces if needed
    levels.forEach((level, idx) => {
      const hasStaircase = assigned.some(s =>
        s.level === level && (s.name.toLowerCase().includes('stair') || s.name.toLowerCase().includes('circulation'))
      );

      if (!hasStaircase && levels.length > 1) {
        // Add staircase/circulation
        const circulationArea = Math.max(8, floorAreas[idx] * 0.15); // 15% or 8m² minimum
        assigned.push({
          name: idx === 0 ? 'Staircase & Circulation' : 'Circulation',
          area: circulationArea.toFixed(0),
          count: 1,
          level
        });
      }
    });

    return assigned;
  }

  /**
   * Complete auto-assignment: calculate levels AND assign spaces
   * @param {Array} programSpaces - Program spaces to assign
   * @param {number} siteArea - Site area in m²
   * @param {string} buildingType - Building type
   * @param {Object} constraints - Optional constraints (maxHeight, maxFloors)
   * @returns {Object} Result with assigned spaces and metrics
   */
  autoAssignComplete(programSpaces, siteArea, buildingType = 'mixed-use', constraints = {}) {
    logger.info('🤖 AUTO-ASSIGNMENT: Starting complete auto-level assignment', null, '🏢');

    // Step 1: Calculate total program area
    const totalProgramArea = programSpaces.reduce((sum, space) =>
      sum + (parseFloat(space.area || 0) * (space.count || 1)), 0
    );

    // Step 2: Calculate optimal floor count
    const floorCalc = this.calculateOptimalLevels(totalProgramArea, siteArea, {
      buildingType,
      ...constraints
    });

    // Step 3: Auto-assign spaces to levels
    const assignedSpaces = this.autoAssignSpacesToLevels(
      programSpaces,
      floorCalc.optimalFloors,
      buildingType
    );

    logger.info('✅ AUTO-ASSIGNMENT: Complete', null, '🏢');

    return {
      success: true,
      assignedSpaces,
      floorCount: floorCalc.optimalFloors,
      floorMetrics: floorCalc,
      summary: {
        totalSpaces: assignedSpaces.length,
        totalArea: totalProgramArea,
        siteArea,
        floors: floorCalc.optimalFloors,
        footprint: floorCalc.actualFootprint,
        siteCoverage: floorCalc.siteCoveragePercent,
        reasoning: floorCalc.reasoning
      }
    };
  }
}

// Export singleton
const autoLevelAssignmentService = new AutoLevelAssignmentService();
export default autoLevelAssignmentService;
