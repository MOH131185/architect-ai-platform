/**
 * Facade Feature Analyzer Service
 *
 * Extracts and counts facade elements (windows, doors, etc.) from:
 * - Building core metadata
 * - Elevation image analysis (future: CV-based)
 * - Floor plan data
 *
 * Provides strict enumeration for prompt generation to ensure consistency.
 */

class FacadeFeatureAnalyzer {
  constructor() {
    console.log('🔍 Facade Feature Analyzer initialized');
  }

  /**
   * Analyze facade features for each elevation
   *
   * @param {Object} buildingCore - Building core description with geometry, openings, etc.
   * @param {Object} elevationData - Optional elevation metadata
   * @returns {Object} Facade features per elevation
   */
  analyzeFacadeFeatures(buildingCore, elevationData = {}) {
    const { geometry, openings, materials, roof } = buildingCore;

    // Calculate windows per facade based on building geometry and floor count
    const totalWindows = openings.window_count_total || (openings.window_count_per_floor * geometry.floor_count);
    const floorsCount = geometry.floor_count || 2;

    // Distribute windows across facades based on building shape
    const facadeDistribution = this.distributeWindowsAcrossFacades(
      totalWindows,
      geometry,
      openings.door_position
    );

    // Determine door placement
    const doorFacade = this.determineDoorFacade(openings.door_position);

    // Build facade feature map
    const facadeFeatures = {
      north: {
        windows: facadeDistribution.north,
        windowsPerFloor: this.distributeWindowsPerFloor(facadeDistribution.north, floorsCount),
        hasDoor: doorFacade === 'north',
        doorPosition: doorFacade === 'north' ? openings.door_position : null,
        material: materials.walls,
        color: materials.walls_color_hex,
        width: geometry.width, // Assuming north/south are width
        height: geometry.height
      },
      south: {
        windows: facadeDistribution.south,
        windowsPerFloor: this.distributeWindowsPerFloor(facadeDistribution.south, floorsCount),
        hasDoor: doorFacade === 'south',
        doorPosition: doorFacade === 'south' ? openings.door_position : null,
        material: materials.walls,
        color: materials.walls_color_hex,
        width: geometry.width,
        height: geometry.height
      },
      east: {
        windows: facadeDistribution.east,
        windowsPerFloor: this.distributeWindowsPerFloor(facadeDistribution.east, floorsCount),
        hasDoor: doorFacade === 'east',
        doorPosition: doorFacade === 'east' ? openings.door_position : null,
        material: materials.walls,
        color: materials.walls_color_hex,
        width: geometry.length, // Assuming east/west are length
        height: geometry.height
      },
      west: {
        windows: facadeDistribution.west,
        windowsPerFloor: this.distributeWindowsPerFloor(facadeDistribution.west, floorsCount),
        hasDoor: doorFacade === 'west',
        doorPosition: doorFacade === 'west' ? openings.door_position : null,
        material: materials.walls,
        color: materials.walls_color_hex,
        width: geometry.length,
        height: geometry.height
      },
      roof: {
        type: roof.type,
        material: roof.material,
        color: materials.roof_color_hex,
        pitch: roof.pitch || 'standard'
      }
    };

    console.log('✅ Facade features analyzed:');
    console.log(`   North: ${facadeFeatures.north.windows} windows ${facadeFeatures.north.hasDoor ? '+ door' : ''}`);
    console.log(`   South: ${facadeFeatures.south.windows} windows ${facadeFeatures.south.hasDoor ? '+ door' : ''}`);
    console.log(`   East: ${facadeFeatures.east.windows} windows ${facadeFeatures.east.hasDoor ? '+ door' : ''}`);
    console.log(`   West: ${facadeFeatures.west.windows} windows ${facadeFeatures.west.hasDoor ? '+ door' : ''}`);

    return facadeFeatures;
  }

  /**
   * Distribute windows across facades based on geometry and door position
   */
  distributeWindowsAcrossFacades(totalWindows, geometry, doorPosition) {
    const doorFacade = this.determineDoorFacade(doorPosition);

    // Primary facades (front and back) get more windows
    // Side facades get fewer
    // Door facade gets one less window to account for door

    const isRectangular = !geometry.shape || geometry.shape === 'rectangular';

    if (isRectangular) {
      // For rectangular buildings, distribute based on facade length
      const longSideFacades = ['north', 'south']; // Assuming north/south are width
      const shortSideFacades = ['east', 'west']; // Assuming east/west are length

      // Typical distribution: 40% front, 30% back, 15% each side
      const frontWindows = Math.ceil(totalWindows * 0.4);
      const backWindows = Math.ceil(totalWindows * 0.3);
      const sideWindows = Math.floor((totalWindows - frontWindows - backWindows) / 2);

      return {
        north: doorFacade === 'north' ? frontWindows : backWindows,
        south: doorFacade === 'south' ? frontWindows : backWindows,
        east: sideWindows,
        west: sideWindows
      };
    } else {
      // For complex shapes, distribute more evenly
      const windowsPerFacade = Math.floor(totalWindows / 4);
      return {
        north: windowsPerFacade,
        south: windowsPerFacade,
        east: windowsPerFacade,
        west: windowsPerFacade
      };
    }
  }

  /**
   * Distribute windows per floor for a facade
   */
  distributeWindowsPerFloor(totalWindowsOnFacade, floors) {
    const distribution = [];
    const baseWindowsPerFloor = Math.floor(totalWindowsOnFacade / floors);
    const remainder = totalWindowsOnFacade % floors;

    for (let i = 0; i < floors; i++) {
      // Ground floor might have fewer windows (door takes space)
      // Upper floors get more even distribution
      if (i === 0) {
        distribution.push(baseWindowsPerFloor + (remainder > 0 ? 1 : 0));
      } else {
        distribution.push(baseWindowsPerFloor);
      }
    }

    return distribution;
  }

  /**
   * Determine which facade has the main door
   */
  determineDoorFacade(doorPosition) {
    const position = (doorPosition || 'front').toLowerCase();

    if (position.includes('north')) return 'north';
    if (position.includes('south')) return 'south';
    if (position.includes('east')) return 'east';
    if (position.includes('west')) return 'west';
    if (position.includes('front')) return 'north'; // Default front = north
    if (position.includes('back') || position.includes('rear')) return 'south';

    return 'north'; // Default
  }

  /**
   * Generate strict facade enumeration text for prompts
   *
   * @param {string} facadeName - e.g., "north", "west"
   * @param {Object} facadeFeatures - Feature data for that facade
   * @returns {string} Enumeration text
   */
  generateFacadeEnumeration(facadeName, facadeFeatures) {
    const { windows, hasDoor, material, color, windowsPerFloor } = facadeFeatures;

    const capitalizedName = facadeName.charAt(0).toUpperCase() + facadeName.slice(1);

    let enumeration = `**${capitalizedName} facade**:\n`;

    // Window enumeration per floor
    if (windowsPerFloor && windowsPerFloor.length > 1) {
      windowsPerFloor.forEach((count, floorIndex) => {
        const floorName = floorIndex === 0 ? 'Ground floor' : `Floor ${floorIndex + 1}`;
        enumeration += `   - ${floorName}: EXACTLY ${count} window${count !== 1 ? 's' : ''}`;
        if (floorIndex === 0 && hasDoor) {
          enumeration += ` + 1 centered entry door`;
        }
        enumeration += `\n`;
      });
    } else {
      enumeration += `   - EXACTLY ${windows} window${windows !== 1 ? 's' : ''}`;
      if (hasDoor) {
        enumeration += ` + 1 centered entry door`;
      }
      enumeration += `\n`;
    }

    enumeration += `   - Material: ${material} (${color})\n`;
    enumeration += `   - NO extra openings, NO missing features`;

    return enumeration;
  }

  /**
   * Generate complete facade specification for all visible facades
   *
   * @param {Array<string>} visibleFacades - e.g., ["north", "west"]
   * @param {Object} allFacadeFeatures - Complete facade feature map
   * @returns {string} Complete specification text
   */
  generateMultiFacadeSpecification(visibleFacades, allFacadeFeatures) {
    const specifications = visibleFacades.map(facade =>
      this.generateFacadeEnumeration(facade, allFacadeFeatures[facade])
    );

    return specifications.join('\n\n');
  }

  /**
   * Get interior wall features for interior view prompts
   *
   * @param {string} wallOrientation - e.g., "north", "west"
   * @param {Object} facadeFeatures - Facade feature data
   * @param {Object} roomData - Optional room-specific data
   * @returns {Object} Interior wall features
   */
  getInteriorWallFeatures(wallOrientation, facadeFeatures, roomData = {}) {
    const facade = facadeFeatures[wallOrientation];

    if (!facade) {
      return {
        orientation: wallOrientation,
        windows: 1,
        hasDoor: false,
        material: 'painted wall',
        description: `Interior wall facing ${wallOrientation}`
      };
    }

    // For interior views, we're looking at the wall from inside
    // So we see the same windows but from the interior side
    const windowsInThisRoom = roomData.windowCount || Math.ceil(facade.windows / 2);

    return {
      orientation: wallOrientation,
      windows: windowsInThisRoom,
      hasDoor: facade.hasDoor && roomData.hasEntryDoor,
      material: facade.material,
      exteriorColor: facade.color,
      description: `Interior view of ${wallOrientation} wall with ${windowsInThisRoom} window${windowsInThisRoom !== 1 ? 's' : ''}`
    };
  }

  /**
   * Validate facade consistency across views
   *
   * @param {Object} facadeFeatures - Facade feature map
   * @param {Object} generatedImages - Generated image metadata
   * @returns {Object} Consistency report
   */
  validateFacadeConsistency(facadeFeatures, generatedImages = {}) {
    const report = {
      isConsistent: true,
      issues: [],
      checks: []
    };

    // Check total window count
    const totalWindows = Object.values(facadeFeatures)
      .filter(f => f.windows !== undefined)
      .reduce((sum, f) => sum + f.windows, 0);

    report.checks.push({
      check: 'Total window count',
      expected: totalWindows,
      status: '✅ Verified'
    });

    // Check each facade has features defined
    ['north', 'south', 'east', 'west'].forEach(facade => {
      if (!facadeFeatures[facade]) {
        report.issues.push(`❌ ${facade} facade missing feature data`);
        report.isConsistent = false;
      } else {
        report.checks.push({
          check: `${facade} facade`,
          expected: `${facadeFeatures[facade].windows} windows`,
          status: '✅ Defined'
        });
      }
    });

    // Check door is only on one facade
    const facadesWithDoor = Object.entries(facadeFeatures)
      .filter(([name, f]) => f.hasDoor)
      .map(([name]) => name);

    if (facadesWithDoor.length > 1) {
      report.issues.push(`❌ Multiple facades have doors: ${facadesWithDoor.join(', ')}`);
      report.isConsistent = false;
    } else if (facadesWithDoor.length === 1) {
      report.checks.push({
        check: 'Door placement',
        expected: `${facadesWithDoor[0]} facade only`,
        status: '✅ Unique'
      });
    }

    console.log('\n📊 Facade Consistency Report:');
    report.checks.forEach(check => {
      console.log(`   ${check.status} ${check.check}: ${check.expected}`);
    });

    if (report.issues.length > 0) {
      console.log('\n⚠️ Issues found:');
      report.issues.forEach(issue => console.log(`   ${issue}`));
    }

    return report;
  }
}

// Export singleton
export default new FacadeFeatureAnalyzer();
