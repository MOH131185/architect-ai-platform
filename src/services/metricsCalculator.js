/**
 * Metrics Calculator Service
 *
 * Calculates key architectural metrics from Design DNA and geometry:
 * - GIA (Gross Internal Area) / NIA (Net Internal Area)
 * - WWR (Window-to-Wall Ratio)
 * - Circulation percentage
 * - Room schedule
 * - Daylight proxy metrics
 * - Compliance with UK Building Regulations
 */

class MetricsCalculator {
  /**
   * Calculate comprehensive metrics from design data
   *
   * @param {Object} designData - Complete design data (DNA + geometry)
   * @returns {Object} Calculated metrics
   */
  calculateMetrics(designData) {
    console.log('📊 Calculating design metrics...');

    const { masterDNA, geometryData, projectContext } = designData;

    // Calculate hash for traceability
    const designHash = this.calculateDesignHash(designData);

    // Calculate areas
    const areas = this.calculateAreas(masterDNA, geometryData);

    // Calculate WWR (Window-to-Wall Ratio)
    const wwr = this.calculateWWR(masterDNA, geometryData);

    // Calculate circulation percentage
    const circulation = this.calculateCirculation(masterDNA);

    // Generate room schedule
    const roomSchedule = this.generateRoomSchedule(masterDNA);

    // Calculate daylight proxy
    const daylightMetrics = this.calculateDaylightProxy(masterDNA, wwr);

    // Check compliance
    const compliance = this.checkCompliance(masterDNA, areas, wwr);

    // Climate data
    const climateMetrics = this.extractClimateMetrics(masterDNA, projectContext);

    const metrics = {
      design_id: masterDNA?.projectID || `DESIGN_${Date.now()}`,
      seed: masterDNA?.seed || 0,
      design_hash: designHash,
      timestamp: new Date().toISOString(),

      // Areas
      areas: {
        gia_m2: areas.gia,
        nia_m2: areas.nia,
        circulation_m2: areas.circulation,
        circulation_percent: circulation.percentage,
        footprint_m2: areas.footprint,
        total_floor_area_m2: areas.totalFloorArea,
        site_coverage_percent: areas.siteCoverage
      },

      // Fenestration
      fenestration: {
        wwr: wwr.overall,
        wwr_north: wwr.byFacade.north,
        wwr_south: wwr.byFacade.south,
        wwr_east: wwr.byFacade.east,
        wwr_west: wwr.byFacade.west,
        total_window_area_m2: wwr.totalWindowArea,
        total_wall_area_m2: wwr.totalWallArea
      },

      // Daylight
      daylight: {
        average_df_proxy: daylightMetrics.averageDF,
        min_df_proxy: daylightMetrics.minDF,
        rooms_with_adequate_light: daylightMetrics.adequateRooms,
        total_rooms: daylightMetrics.totalRooms,
        compliance_percent: daylightMetrics.compliancePercent
      },

      // Rooms
      rooms: {
        total: roomSchedule.length,
        schedule: roomSchedule,
        largest: roomSchedule.reduce((max, r) => r.area_m2 > max.area_m2 ? r : max, roomSchedule[0]),
        smallest: roomSchedule.reduce((min, r) => r.area_m2 < min.area_m2 ? r : min, roomSchedule[0])
      },

      // Climate
      climate: climateMetrics,

      // Compliance
      compliance: compliance,

      // Summary
      summary: {
        floors: masterDNA?.dimensions?.floorCount || 2,
        total_height_m: masterDNA?.dimensions?.totalHeight || 6.0,
        footprint_dimensions: `${masterDNA?.dimensions?.length || 0}m × ${masterDNA?.dimensions?.width || 0}m`,
        roof_type: masterDNA?.roof?.type || 'gable',
        architectural_style: masterDNA?.architecturalStyle || 'Contemporary'
      }
    };

    console.log('✅ Metrics calculated:');
    console.log(`   GIA: ${metrics.areas.gia_m2.toFixed(1)}m²`);
    console.log(`   WWR: ${(metrics.fenestration.wwr * 100).toFixed(1)}%`);
    console.log(`   Circulation: ${metrics.areas.circulation_percent.toFixed(1)}%`);
    console.log(`   Compliance: ${compliance.overall_pass ? '✅' : '⚠️'}`);

    return metrics;
  }

  /**
   * Calculate design hash for traceability (simple hash for browser)
   */
  calculateDesignHash(designData) {
    try {
      const jsonString = JSON.stringify({
        dna: designData.masterDNA,
        seed: designData.masterDNA?.seed,
        dimensions: designData.masterDNA?.dimensions
      });

      // Simple hash function for browser (not cryptographically secure, but sufficient for tracing)
      let hash = 0;
      for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }

      // Convert to hex and pad to 16 characters
      const hexHash = Math.abs(hash).toString(16).padStart(16, '0');
      return hexHash.substring(0, 16);
    } catch (error) {
      console.error('Hash calculation failed:', error);
      return 'N/A';
    }
  }

  /**
   * Calculate GIA, NIA, and related areas
   */
  calculateAreas(masterDNA, geometryData) {
    const dimensions = masterDNA?.dimensions || {};
    const floorPlans = masterDNA?.floorPlans || {};

    // Calculate footprint from dimensions
    const length = parseFloat(dimensions.length) || 12;
    const width = parseFloat(dimensions.width) || 8;
    const footprint = length * width;

    // Calculate GIA (Gross Internal Area) - all floor areas including walls
    const floorCount = dimensions.floorCount || 2;
    const gia = footprint * floorCount;

    // Calculate total room areas from floor plans (NIA - Net Internal Area)
    let totalRoomArea = 0;
    let circulationArea = 0;

    ['ground', 'upper'].forEach(level => {
      const levelData = floorPlans[level];
      if (levelData && levelData.rooms) {
        levelData.rooms.forEach(room => {
          const area = this.parseArea(room.area || room.dimensions);
          if (room.name && (room.name.toLowerCase().includes('hallway') ||
                            room.name.toLowerCase().includes('corridor') ||
                            room.name.toLowerCase().includes('landing') ||
                            room.name.toLowerCase().includes('stairs'))) {
            circulationArea += area;
          }
          totalRoomArea += area;
        });
      }
    });

    // If no room data, estimate NIA as 85% of GIA (typical efficiency)
    const nia = totalRoomArea > 0 ? totalRoomArea : gia * 0.85;

    // If no circulation data, estimate as 15% of GIA
    if (circulationArea === 0) {
      circulationArea = gia * 0.15;
    }

    // Calculate site coverage if site metrics available
    const siteArea = geometryData?.siteMetrics?.areaM2 || footprint / 0.6; // Assume 60% coverage
    const siteCoverage = (footprint / siteArea) * 100;

    return {
      gia: gia,
      nia: nia,
      footprint: footprint,
      totalFloorArea: gia,
      circulation: circulationArea,
      siteCoverage: siteCoverage
    };
  }

  /**
   * Calculate Window-to-Wall Ratio
   */
  calculateWWR(masterDNA, geometryData) {
    const dimensions = masterDNA?.dimensions || {};
    const elevations = masterDNA?.elevations || {};
    const windows = masterDNA?.windows || {};

    // Calculate wall areas (excluding roof)
    const length = parseFloat(dimensions.length) || 12;
    const width = parseFloat(dimensions.width) || 8;
    const height = parseFloat(dimensions.totalHeight) || 6;

    const wallAreas = {
      north: length * height,
      south: length * height,
      east: width * height,
      west: width * height
    };

    const totalWallArea = Object.values(wallAreas).reduce((sum, a) => sum + a, 0);

    // Calculate window areas from view-specific features or standard window size
    const standardWindowSize = windows.standardSize || '1.5m × 1.2m';
    const [windowWidth, windowHeight] = this.parseDimensions(standardWindowSize);
    const standardWindowArea = windowWidth * windowHeight;

    let totalWindowArea = 0;
    const wwrByFacade = {};

    Object.keys(wallAreas).forEach(direction => {
      const elevData = elevations[direction];
      let windowCount = 0;

      if (elevData && elevData.features) {
        // Count windows mentioned in features
        elevData.features.forEach(feature => {
          const match = feature.match(/(\d+)\s+windows?/i);
          if (match) {
            windowCount += parseInt(match[1]);
          }
        });
      }

      // Fallback: estimate from view-specific features
      if (windowCount === 0) {
        const viewFeatures = masterDNA?.viewSpecificFeatures?.[direction];
        windowCount = viewFeatures?.windows || 2;
      }

      const facadeWindowArea = windowCount * standardWindowArea;
      totalWindowArea += facadeWindowArea;
      wwrByFacade[direction] = facadeWindowArea / wallAreas[direction];
    });

    const overallWWR = totalWindowArea / totalWallArea;

    return {
      overall: overallWWR,
      byFacade: wwrByFacade,
      totalWindowArea: totalWindowArea,
      totalWallArea: totalWallArea
    };
  }

  /**
   * Calculate circulation percentage
   */
  calculateCirculation(masterDNA) {
    const floorPlans = masterDNA?.floorPlans || {};
    let totalArea = 0;
    let circulationArea = 0;

    ['ground', 'upper'].forEach(level => {
      const levelData = floorPlans[level];
      if (levelData && levelData.rooms) {
        levelData.rooms.forEach(room => {
          const area = this.parseArea(room.area || room.dimensions);
          totalArea += area;

          if (room.name && (room.name.toLowerCase().includes('hallway') ||
                            room.name.toLowerCase().includes('corridor') ||
                            room.name.toLowerCase().includes('landing') ||
                            room.name.toLowerCase().includes('stairs'))) {
            circulationArea += area;
          }
        });
      }
    });

    const percentage = totalArea > 0 ? (circulationArea / totalArea) * 100 : 15;

    return {
      area: circulationArea,
      percentage: percentage
    };
  }

  /**
   * Generate room schedule from floor plans
   */
  generateRoomSchedule(masterDNA) {
    const floorPlans = masterDNA?.floorPlans || {};
    const schedule = [];

    ['ground', 'upper'].forEach((level, levelIndex) => {
      const levelData = floorPlans[level];
      if (levelData && levelData.rooms) {
        levelData.rooms.forEach((room, roomIndex) => {
          const area = this.parseArea(room.area || room.dimensions);
          const dimensions = room.dimensions || 'N/A';

          schedule.push({
            id: `${level}_${roomIndex}`,
            level: level === 'ground' ? 'Ground' : 'Upper',
            level_number: levelIndex,
            name: room.name || 'Room',
            area_m2: area,
            dimensions: dimensions,
            position: room.position || 'N/A',
            windows: this.extractWindowCount(room),
            doors: this.extractDoorCount(room)
          });
        });
      }
    });

    // Sort by level, then by area
    schedule.sort((a, b) => {
      if (a.level_number !== b.level_number) return a.level_number - b.level_number;
      return b.area_m2 - a.area_m2;
    });

    return schedule;
  }

  /**
   * Calculate daylight factor proxy based on WWR and room depth
   */
  calculateDaylightProxy(masterDNA, wwrData) {
    const floorPlans = masterDNA?.floorPlans || {};
    const rooms = [];

    ['ground', 'upper'].forEach(level => {
      const levelData = floorPlans[level];
      if (levelData && levelData.rooms) {
        levelData.rooms.forEach(room => {
          const windowCount = this.extractWindowCount(room);
          const area = this.parseArea(room.area || room.dimensions);

          // Estimate DF proxy: (window_count × 2.5) / sqrt(area)
          // This is a rough proxy - real DF calculation requires 3D geometry
          const dfProxy = windowCount > 0 ? (windowCount * 2.5) / Math.sqrt(area) : 0;

          rooms.push({
            name: room.name,
            df_proxy: dfProxy,
            adequate: dfProxy >= 0.02 // 2% DF minimum for habitable rooms
          });
        });
      }
    });

    const totalRooms = rooms.length;
    const adequateRooms = rooms.filter(r => r.adequate).length;
    const averageDF = rooms.reduce((sum, r) => sum + r.df_proxy, 0) / totalRooms || 0;
    const minDF = Math.min(...rooms.map(r => r.df_proxy));

    return {
      averageDF: averageDF,
      minDF: minDF,
      adequateRooms: adequateRooms,
      totalRooms: totalRooms,
      compliancePercent: (adequateRooms / totalRooms) * 100
    };
  }

  /**
   * Extract climate metrics
   */
  extractClimateMetrics(masterDNA, projectContext) {
    const climateData = projectContext?.locationData?.climate || masterDNA?.climateDesign || {};

    return {
      hdd: climateData.hdd || climateData.heatingDegreeDays || 2800,
      cdd: climateData.cdd || climateData.coolingDegreeDays || 120,
      prevailing_wind: climateData.prevailing_wind || climateData.prevailingWind || 'SW',
      wwr_recommended: climateData.wwr || 0.32,
      climate_zone: climateData.type || 'Temperate'
    };
  }

  /**
   * Check UK Building Regulations compliance
   */
  checkCompliance(masterDNA, areas, wwrData) {
    const materials = masterDNA?.materials || {};
    const dimensions = masterDNA?.dimensions || {};

    // Extract door width
    const doorWidth = this.extractDimension(materials?.doors?.main?.width || '0.9m');

    // Estimate corridor width from circulation description
    const corridorWidth = 0.9; // Default assumption

    // Estimate stair pitch from roof pitch (usually similar)
    const roofPitch = parseFloat(masterDNA?.roof?.pitch) || 35;
    const stairPitch = Math.min(roofPitch, 42); // Stairs typically less steep than roof

    // Get floor heights for head height check
    const floorHeight = parseFloat(dimensions.groundFloorHeight) || 3.0;
    const headHeight = floorHeight - 0.3; // Minus structure/finishes

    const checks = {
      door_width: {
        value: doorWidth,
        required: 0.8,
        unit: 'm',
        pass: doorWidth >= 0.8,
        rule: 'Min door width ≥800mm (Part M)'
      },
      corridor_width: {
        value: corridorWidth,
        required: 0.9,
        unit: 'm',
        pass: corridorWidth >= 0.9,
        rule: 'Corridor ≥900mm (Part M)'
      },
      stair_pitch: {
        value: stairPitch,
        required: 42,
        unit: '°',
        pass: stairPitch <= 42,
        rule: 'Stair pitch ≤42° (Part K)'
      },
      wwr: {
        value: wwrData.overall,
        required_min: 0.25,
        required_max: 0.45,
        unit: 'ratio',
        pass: wwrData.overall >= 0.25 && wwrData.overall <= 0.45,
        rule: 'WWR 0.25-0.45 (Part L)'
      },
      head_height: {
        value: headHeight,
        required: 2.0,
        unit: 'm',
        pass: headHeight >= 2.0,
        rule: 'Head height ≥2.0m (Part M)'
      }
    };

    const overall_pass = Object.values(checks).every(c => c.pass);
    const pass_count = Object.values(checks).filter(c => c.pass).length;
    const total_checks = Object.keys(checks).length;

    return {
      checks: checks,
      overall_pass: overall_pass,
      pass_count: pass_count,
      total_checks: total_checks,
      compliance_percent: (pass_count / total_checks) * 100
    };
  }

  // --- Helper Methods ---

  parseArea(areaString) {
    if (typeof areaString === 'number') return areaString;
    if (!areaString) return 0;

    // Try to parse "XXm²" format
    const areaMatch = areaString.match(/(\d+\.?\d*)\s*m²/);
    if (areaMatch) return parseFloat(areaMatch[1]);

    // Try to parse "XXm × YYm" format and calculate
    const dims = this.parseDimensions(areaString);
    if (dims) return dims[0] * dims[1];

    return 0;
  }

  parseDimensions(dimString) {
    if (!dimString) return [0, 0];

    const match = dimString.match(/(\d+\.?\d*)\s*m?\s*[×x]\s*(\d+\.?\d*)\s*m?/);
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])];
    }
    return [0, 0];
  }

  extractDimension(dimString) {
    if (typeof dimString === 'number') return dimString;
    if (!dimString) return 0;

    const match = dimString.match(/(\d+\.?\d*)\s*m/);
    return match ? parseFloat(match[1]) : 0;
  }

  extractWindowCount(room) {
    if (!room.windows) return 0;
    if (typeof room.windows === 'number') return room.windows;
    if (Array.isArray(room.windows)) return room.windows.length;

    // Try to count from description
    const countMatch = JSON.stringify(room.windows).match(/(\d+)\s+windows?/i);
    return countMatch ? parseInt(countMatch[1]) : 0;
  }

  extractDoorCount(room) {
    if (!room.doors) return 1; // Assume at least one door per room
    if (typeof room.doors === 'number') return room.doors;
    if (Array.isArray(room.doors)) return room.doors.length;
    return 1;
  }
}

export default new MetricsCalculator();

// CommonJS compatibility for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new MetricsCalculator();
}
