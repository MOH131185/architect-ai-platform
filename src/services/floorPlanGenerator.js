/**
 * Floor Plan Generator Service
 *
 * Generates detailed, intelligent floor plans with:
 * - Project type-specific room layouts (house/office/retail/cafe)
 * - Room labels, dimensions, and purposes
 * - Circulation paths and flow diagrams
 * - Furniture placement suggestions
 * - Door swings and window placements
 * - Site-aware design (fits buildable area)
 *
 * Integrates with:
 * - floorPlanReasoningService (GPT-4o intelligent layouts)
 * - siteAnalysisService (site constraints)
 * - facadeFeatureAnalyzer (window counts)
 */

import floorPlanReasoningService from './floorPlanReasoningService.js';
import siteAnalysisService from './siteAnalysisService.js';
import facadeFeatureAnalyzer from './facadeFeatureAnalyzer.js';
import { validateFloorPlanWithinSite } from './siteValidationService.js';
import logger from '../utils/logger.js';


class FloorPlanGenerator {
  constructor() {
    logger.info('🏗️  Floor Plan Generator initialized');
    this.reasoningService = floorPlanReasoningService;
    this.siteService = siteAnalysisService;
    this.facadeAnalyzer = facadeFeatureAnalyzer;
  }

  /**
   * Generate complete floor plans with intelligent reasoning
   *
   * @param {Object} projectContext - Project details (building_program, floors, floor_area, etc.)
   * @param {Object} siteData - Site analysis data (optional, will fetch if not provided)
   * @returns {Object} Complete floor plan data with reasoning and annotations
   */
  async generateFloorPlans(projectContext, siteData = null) {
    logger.info(`\n🏗️  Generating intelligent floor plans for ${projectContext.building_program}...`);
    logger.info(`   Project: ${projectContext.floors}-story, ${projectContext.floor_area}m² total`);

    try {
      // 1. Get or fetch site analysis
      if (!siteData && projectContext.address) {
        logger.info('   📍 Fetching site analysis...');
        const siteResult = await this.siteService.analyzeSiteContext(
          projectContext.address,
          projectContext.coordinates || { lat: 0, lng: 0 }
        );
        siteData = siteResult.siteAnalysis;
      }

      // Fallback if no site data
      if (!siteData) {
        siteData = this.siteService.getFallbackSiteAnalysis(
          projectContext.address || 'Unknown',
          projectContext.coordinates || { lat: 0, lng: 0 }
        );
      }

      // 2. Generate intelligent floor plan reasoning using GPT-4o
      logger.info('   🧠 Generating intelligent layout reasoning...');
      const reasoningResult = await this.reasoningService.generateFloorPlanReasoning(
        projectContext,
        siteData
      );

      // 2b. Enforce entry consistency (main entrance on ground floor)
      let reasoning = this.enforceEntranceConsistency(
        reasoningResult.reasoning,
        projectContext,
        siteData
      );

      // 3. Build detailed floor plan data structure
      logger.info('   📐 Building detailed floor plan data...');
      const floorPlans = this.buildFloorPlanData(reasoning, projectContext, siteData);

      // 4. Add circulation analysis
      logger.info('   🚶 Analyzing circulation...');
      floorPlans.circulation = this.analyzeCirculation(reasoning, floorPlans);

      // 5. Add room relationship analysis
      logger.info('   🔗 Analyzing room relationships...');
      floorPlans.relationships = this.analyzeRoomRelationships(reasoning, floorPlans);

      // 6. Generate annotations and labels
      logger.info('   🏷️  Generating annotations...');
      floorPlans.annotations = this.generateAnnotations(reasoning, floorPlans);

      // 7. Calculate efficiency metrics
      logger.info('   📊 Calculating efficiency metrics...');
      floorPlans.metrics = this.calculateEfficiencyMetrics(reasoning, floorPlans, projectContext);

      // 8. Generate UI display data
      floorPlans.ui_display = this.generateUIDisplayData(reasoning, floorPlans);

      logger.success(' Floor plans generated successfully!');
      logger.info(`   Ground floor: ${floorPlans.ground_floor.rooms.length} rooms`);
      if (floorPlans.upper_floors && floorPlans.upper_floors.length > 0) {
        logger.info(`   Upper floors: ${floorPlans.upper_floors.length} floor(s)`);
      }
      logger.info(`   Circulation efficiency: ${floorPlans.metrics.circulation_efficiency}%`);
      logger.info(`   Layout quality: ${floorPlans.metrics.layout_quality}`);

      return {
        success: true,
        floorPlans: floorPlans,
        reasoning: reasoning,
        siteContext: siteData,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('❌ Floor plan generation failed:', error);
      return {
        success: false,
        floorPlans: this.getFallbackFloorPlans(projectContext),
        error: error.message
      };
    }
  }

  /**
   * Build detailed floor plan data structure from reasoning
   */
  buildFloorPlanData(reasoning, projectContext, siteData) {
    // Extract site polygon if available
    const sitePolygon = siteData?.polygon || projectContext?.sitePolygon || null;

    // Validate and adjust building footprint to fit within site
    let footprint = reasoning.building_footprint;
    if (sitePolygon && footprint) {
      const validationResult = validateFloorPlanWithinSite(
        { width: footprint.width, length: footprint.depth, rooms: reasoning.ground_floor.rooms },
        sitePolygon
      );

      if (!validationResult.valid) {
        logger.warn('⚠️ Floor plan exceeds site boundaries, adjusting...');
        // Calculate scale factor to fit within site
        const scaleFactor = 0.85; // Reduce to 85% to ensure fit with setbacks
        footprint.width = Math.floor(footprint.width * scaleFactor);
        footprint.depth = Math.floor(footprint.depth * scaleFactor);
        logger.info(`   📐 Adjusted footprint to ${footprint.width}m × ${footprint.depth}m`);
      }
    }

    const floorPlans = {
      project_name: projectContext.project_name || 'Untitled Project',
      building_type: projectContext.building_program,
      total_floors: projectContext.floors || 2,
      total_area: projectContext.floor_area || 200,
      building_footprint: footprint,
      layout_strategy: reasoning.layout_strategy,
      design_principles: reasoning.design_principles || [],
      site_validated: sitePolygon ? true : false,

      // Ground floor
      ground_floor: this.buildFloorData(
        reasoning.ground_floor,
        0,
        footprint,
        siteData
      ),

      // Upper floors
      upper_floors: [],

      // Site context
      site_context: {
        buildable_area: siteData?.buildableArea,
        constraints: siteData?.constraints,
        polygon: sitePolygon,
        orientation: siteData?.optimalOrientation || 0,
        optimalBuildingOrientation: siteData?.optimalBuildingOrientation
      }
    };

    // Add upper floor if exists
    if (reasoning.upper_floor && projectContext.floors > 1) {
      floorPlans.upper_floors.push(
        this.buildFloorData(
          reasoning.upper_floor,
          1,
          reasoning.building_footprint,
          siteData
        )
      );
    }

    return floorPlans;
  }

  /**
   * Enforce that the main entrance is on the ground floor and not on upper floors.
   * Also ensures a clearly labeled entry/foyer exists on the ground floor.
   */
  enforceEntranceConsistency(reasoning, projectContext, siteData) {
    try {
      const result = reasoning || {};
      const floors = Math.max(1, projectContext?.floors || result?.floors || 1);

      // Ensure ground floor structure exists
      result.ground_floor = result.ground_floor || { rooms: [], access_points: [] };
      result.ground_floor.rooms = Array.isArray(result.ground_floor.rooms) ? result.ground_floor.rooms : [];
      result.ground_floor.access_points = Array.isArray(result.ground_floor.access_points) ? result.ground_floor.access_points : [];

      // 1) Ground floor must include 'main entrance' in access_points
      const hasGroundMainEntrance = result.ground_floor.access_points.some(ap =>
        typeof ap === 'string' && ap.toLowerCase().includes('main') && ap.toLowerCase().includes('entrance')
      );
      if (!hasGroundMainEntrance) {
        result.ground_floor.access_points.unshift('main entrance');
      }

      // 2) Ground floor should have an Entry/Foyer room
      const gfRooms = result.ground_floor.rooms;
      const entryIdx = gfRooms.findIndex(r => typeof r?.name === 'string' && /(\bentry\b|entrance|foyer)/i.test(r.name));
      if (entryIdx === -1) {
        const totalArea = Number(projectContext?.floor_area) || 100;
        const perFloor = totalArea / floors;
        const approxArea = Math.max(4, Math.round(perFloor * 0.05)); // ~5% per-floor area, min 4 m²
        gfRooms.unshift({
          name: 'Entry / Foyer',
          area: approxArea,
          dimensions: 'approx 2.0m x 2.5m',
          position: siteData?.optimalBuildingOrientation?.primaryFrontage || 'front',
          reasoning: 'Main entrance transition from street; addresses primary frontage'
        });
      } else {
        // Nudge entry position to the primary frontage if missing/central
        const entry = gfRooms[entryIdx];
        if (!entry.position || /(central|internal)/i.test(String(entry.position))) {
          entry.position = siteData?.optimalBuildingOrientation?.primaryFrontage || 'front';
        }
      }

      // 3) Upper floors must not have a main entrance
      if (floors > 1 && result.upper_floor) {
        if (Array.isArray(result.upper_floor.access_points)) {
          result.upper_floor.access_points = result.upper_floor.access_points.filter(ap =>
            !(typeof ap === 'string' && /main\s*entrance/i.test(ap))
          );
        }

        if (Array.isArray(result.upper_floor.rooms)) {
          result.upper_floor.rooms = result.upper_floor.rooms.map(room => {
            if (typeof room?.name === 'string' && /(\bentry\b|entrance|foyer)/i.test(room.name)) {
              return {
                ...room,
                name: 'Landing / Upper Lobby',
                reasoning: 'Arrival space from internal stairs; no exterior entrance on upper floor'
              };
            }
            return room;
          });
        }
      }

      return result;
    } catch (e) {
      logger.warn('Entrance consistency enforcement failed; returning original reasoning:', e?.message);
      return reasoning;
    }
  }

  /**
   * Build detailed floor data for a single floor
   */
  buildFloorData(floorReasoning, floorNumber, footprint, siteData) {
    const floorName = floorNumber === 0 ? 'Ground Floor' : `Floor ${floorNumber + 1}`;

    const floorData = {
      floor_number: floorNumber,
      floor_name: floorName,
      purpose: floorReasoning.purpose,
      total_area: floorReasoning.rooms.reduce((sum, room) => sum + room.area, 0),
      rooms: [],
      circulation: floorReasoning.circulation,
      access_points: floorReasoning.access_points || [],
      vertical_alignment: floorReasoning.vertical_alignment || null
    };

    // Build detailed room data
    floorReasoning.rooms.forEach((room, index) => {
      floorData.rooms.push({
        id: `${floorName.replace(/\s/g, '_')}_Room_${index + 1}`,
        name: room.name,
        area: room.area,
        dimensions: room.dimensions,
        position: room.position,
        reasoning: room.reasoning,

        // Additional details
        function: this.getRoomFunction(room.name),
        natural_light: this.hasNaturalLight(room.position, room.name),
        privacy_level: this.getPrivacyLevel(room.name, floorNumber),
        accessibility: this.getAccessibility(room.name, floorNumber),

        // Furniture/fixtures suggestions
        fixtures: this.getSuggestedFixtures(room.name),

        // Annotations
        annotation: this.generateRoomAnnotation(room, floorNumber)
      });
    });

    return floorData;
  }

  /**
   * Get room function category
   */
  getRoomFunction(roomName) {
    const name = roomName.toLowerCase();

    if (name.includes('living') || name.includes('dining') || name.includes('family')) {
      return 'living_space';
    } else if (name.includes('kitchen') || name.includes('pantry')) {
      return 'cooking_service';
    } else if (name.includes('bedroom') || name.includes('master')) {
      return 'sleeping';
    } else if (name.includes('bathroom') || name.includes('ensuite') || name.includes('wc')) {
      return 'bathroom';
    } else if (name.includes('office') || name.includes('study') || name.includes('workspace')) {
      return 'work';
    } else if (name.includes('garage') || name.includes('carport') || name.includes('parking')) {
      return 'vehicle_storage';
    } else if (name.includes('storage') || name.includes('laundry') || name.includes('utility')) {
      return 'utility';
    } else if (name.includes('entry') || name.includes('hallway') || name.includes('corridor')) {
      return 'circulation';
    }

    return 'other';
  }

  /**
   * Check if room has natural light
   */
  hasNaturalLight(position, roomName) {
    const name = roomName.toLowerCase();

    // Rooms on exterior positions have natural light
    if (position && !position.toLowerCase().includes('central') && !position.toLowerCase().includes('internal')) {
      return true;
    }

    // Some rooms typically have windows
    if (name.includes('living') || name.includes('bedroom') || name.includes('kitchen')) {
      return true;
    }

    // Some rooms may not
    if (name.includes('storage') || name.includes('garage') || name.includes('pantry')) {
      return false;
    }

    return true; // Default
  }

  /**
   * Get privacy level for room
   */
  getPrivacyLevel(roomName, floorNumber) {
    const name = roomName.toLowerCase();

    if (name.includes('bedroom') || name.includes('bathroom') || name.includes('ensuite')) {
      return 'high';
    } else if (name.includes('study') || name.includes('office')) {
      return 'medium';
    } else if (name.includes('living') || name.includes('dining') || name.includes('kitchen')) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Get accessibility requirements
   */
  getAccessibility(roomName, floorNumber) {
    const name = roomName.toLowerCase();

    if (floorNumber === 0) {
      if (name.includes('wc') || name.includes('bathroom')) {
        return 'accessible_required';
      } else if (name.includes('bedroom')) {
        return 'accessible_preferred';
      }
      return 'accessible';
    }

    return 'stairs_required';
  }

  /**
   * Get suggested fixtures for room
   */
  getSuggestedFixtures(roomName) {
    const name = roomName.toLowerCase();
    const fixtures = [];

    if (name.includes('kitchen')) {
      fixtures.push('Sink', 'Cooktop', 'Oven', 'Refrigerator', 'Dishwasher', 'Cabinets');
    } else if (name.includes('bathroom') || name.includes('ensuite') || name.includes('wc')) {
      fixtures.push('Toilet', 'Sink/Vanity');
      if (!name.includes('wc')) {
        fixtures.push('Shower', 'Bath');
      }
    } else if (name.includes('laundry')) {
      fixtures.push('Washing Machine', 'Dryer', 'Sink', 'Storage');
    } else if (name.includes('bedroom')) {
      fixtures.push('Bed', 'Wardrobe', 'Bedside tables');
    } else if (name.includes('living')) {
      fixtures.push('Sofa', 'TV unit', 'Coffee table');
    } else if (name.includes('dining')) {
      fixtures.push('Dining table', 'Chairs');
    }

    return fixtures;
  }

  /**
   * Generate room annotation text
   */
  generateRoomAnnotation(room, floorNumber) {
    const floorLabel = floorNumber === 0 ? 'GF' : `F${floorNumber + 1}`;
    return `${floorLabel}-${room.name.replace(/\s/g, '')} (${room.area}m²)`;
  }

  /**
   * Analyze circulation flow
   */
  analyzeCirculation(reasoning, floorPlans) {
    const circulation = {
      efficiency: reasoning.circulation_efficiency || 'Unknown',
      strategy: reasoning.ground_floor?.circulation || 'Undefined',
      flow_description: reasoning.ground_floor?.circulation || 'Central circulation',

      vertical_circulation: null,
      horizontal_circulation: {
        ground_floor: reasoning.ground_floor?.circulation,
        upper_floor: reasoning.upper_floor?.circulation
      },

      // Circulation analysis
      hallway_percentage: this.calculateHallwayPercentage(floorPlans),
      access_efficiency: 'Good', // Would be calculated
      flow_quality: 'Efficient' // Would be calculated
    };

    // Add vertical circulation if multi-story
    if (floorPlans.total_floors > 1 && reasoning.upper_floor) {
      circulation.vertical_circulation = {
        type: 'staircase',
        location: reasoning.upper_floor.vertical_alignment || 'Central',
        description: reasoning.upper_floor.vertical_alignment || 'Staircase connecting floors'
      };
    }

    return circulation;
  }

  /**
   * Calculate hallway percentage
   */
  calculateHallwayPercentage(floorPlans) {
    let totalArea = 0;
    let circulationArea = 0;

    // Ground floor
    floorPlans.ground_floor.rooms.forEach(room => {
      totalArea += room.area;
      if (room.function === 'circulation') {
        circulationArea += room.area;
      }
    });

    // Upper floors
    if (floorPlans.upper_floors) {
      floorPlans.upper_floors.forEach(floor => {
        floor.rooms.forEach(room => {
          totalArea += room.area;
          if (room.function === 'circulation') {
            circulationArea += room.area;
          }
        });
      });
    }

    return totalArea > 0 ? Math.round((circulationArea / totalArea) * 100) : 0;
  }

  /**
   * Analyze room relationships
   */
  analyzeRoomRelationships(reasoning, floorPlans) {
    const relationships = {
      adjacencies: [],
      functional_zones: [],
      privacy_zones: []
    };

    // Identify functional zones
    const zones = this.identifyFunctionalZones(floorPlans);
    relationships.functional_zones = zones;

    // Identify privacy zones
    relationships.privacy_zones = [
      {
        zone: 'Public',
        description: 'Living, dining, kitchen',
        rooms: floorPlans.ground_floor.rooms
          .filter(r => r.privacy_level === 'low')
          .map(r => r.name)
      },
      {
        zone: 'Private',
        description: 'Bedrooms, bathrooms',
        rooms: [
          ...floorPlans.ground_floor.rooms.filter(r => r.privacy_level === 'high'),
          ...(floorPlans.upper_floors[0]?.rooms || []).filter(r => r.privacy_level === 'high')
        ].map(r => r.name)
      }
    ];

    return relationships;
  }

  /**
   * Identify functional zones
   */
  identifyFunctionalZones(floorPlans) {
    const zones = [];

    // Living zone
    const livingRooms = floorPlans.ground_floor.rooms.filter(r =>
      r.function === 'living_space'
    );
    if (livingRooms.length > 0) {
      zones.push({
        zone: 'Living Zone',
        floor: 'Ground Floor',
        rooms: livingRooms.map(r => r.name),
        description: 'Social and entertainment spaces'
      });
    }

    // Sleeping zone
    const sleepingRooms = [
      ...floorPlans.ground_floor.rooms,
      ...(floorPlans.upper_floors[0]?.rooms || [])
    ].filter(r => r.function === 'sleeping');

    if (sleepingRooms.length > 0) {
      zones.push({
        zone: 'Sleeping Zone',
        floor: floorPlans.total_floors > 1 ? 'Upper Floor' : 'Ground Floor',
        rooms: sleepingRooms.map(r => r.name),
        description: 'Private sleeping areas'
      });
    }

    // Service zone
    const serviceRooms = floorPlans.ground_floor.rooms.filter(r =>
      r.function === 'cooking_service' || r.function === 'utility'
    );
    if (serviceRooms.length > 0) {
      zones.push({
        zone: 'Service Zone',
        floor: 'Ground Floor',
        rooms: serviceRooms.map(r => r.name),
        description: 'Kitchen, laundry, and utility spaces'
      });
    }

    return zones;
  }

  /**
   * Generate annotations for floor plans
   */
  generateAnnotations(reasoning, floorPlans) {
    const annotations = {
      title: `${floorPlans.building_type} - ${floorPlans.total_floors} ${floorPlans.total_floors > 1 ? 'Stories' : 'Story'}`,
      subtitle: `Total Area: ${floorPlans.total_area}m² | Footprint: ${floorPlans.building_footprint.length}m × ${floorPlans.building_footprint.width}m`,

      layout_strategy: floorPlans.layout_strategy,
      design_principles: floorPlans.design_principles,

      natural_light_strategy: reasoning.natural_light_strategy,
      privacy_strategy: reasoning.privacy_strategy,

      labels: [],
      dimensions: [],
      notes: []
    };

    // Generate room labels
    floorPlans.ground_floor.rooms.forEach(room => {
      annotations.labels.push({
        text: room.annotation,
        position: room.position,
        room_id: room.id
      });
    });

    // Generate dimension annotations
    annotations.dimensions.push({
      label: 'Building Length',
      value: `${floorPlans.building_footprint.length}m`
    });
    annotations.dimensions.push({
      label: 'Building Width',
      value: `${floorPlans.building_footprint.width}m`
    });

    // Generate notes
    annotations.notes.push(`Layout: ${floorPlans.layout_strategy}`);
    annotations.notes.push(`Circulation: ${floorPlans.circulation?.strategy || 'Efficient flow'}`);

    return annotations;
  }

  /**
   * Calculate efficiency metrics
   */
  calculateEfficiencyMetrics(reasoning, floorPlans, projectContext) {
    const metrics = {
      circulation_efficiency: parseInt(reasoning.circulation_efficiency) || 85,
      space_utilization: this.calculateSpaceUtilization(floorPlans, projectContext),
      natural_light_coverage: this.calculateNaturalLightCoverage(floorPlans),
      privacy_score: this.calculatePrivacyScore(floorPlans),
      functionality_score: this.calculateFunctionalityScore(floorPlans, projectContext),

      layout_quality: 'A+', // Would be calculated from above metrics
      overall_grade: 'Excellent'
    };

    // Calculate overall grade
    const avgScore = (
      metrics.circulation_efficiency +
      metrics.space_utilization +
      metrics.natural_light_coverage +
      metrics.privacy_score +
      metrics.functionality_score
    ) / 5;

    if (avgScore >= 90) metrics.layout_quality = 'A+';
    else if (avgScore >= 80) metrics.layout_quality = 'A';
    else if (avgScore >= 70) metrics.layout_quality = 'B+';
    else metrics.layout_quality = 'B';

    return metrics;
  }

  /**
   * Calculate space utilization
   */
  calculateSpaceUtilization(floorPlans, projectContext) {
    const usableArea = floorPlans.ground_floor.total_area +
      (floorPlans.upper_floors[0]?.total_area || 0);
    const totalArea = projectContext.floor_area || usableArea;

    return Math.min(Math.round((usableArea / totalArea) * 100), 100);
  }

  /**
   * Calculate natural light coverage
   */
  calculateNaturalLightCoverage(floorPlans) {
    let totalRooms = floorPlans.ground_floor.rooms.length;
    let litRooms = floorPlans.ground_floor.rooms.filter(r => r.natural_light).length;

    if (floorPlans.upper_floors[0]) {
      totalRooms += floorPlans.upper_floors[0].rooms.length;
      litRooms += floorPlans.upper_floors[0].rooms.filter(r => r.natural_light).length;
    }

    return totalRooms > 0 ? Math.round((litRooms / totalRooms) * 100) : 0;
  }

  /**
   * Calculate privacy score
   */
  calculatePrivacyScore(floorPlans) {
    // Check if private rooms (bedrooms, bathrooms) are separated from public spaces
    const groundFloorPrivateRooms = floorPlans.ground_floor.rooms.filter(r =>
      r.privacy_level === 'high'
    ).length;

    const upperFloorPrivateRooms = floorPlans.upper_floors[0]?.rooms.filter(r =>
      r.privacy_level === 'high'
    ).length || 0;

    // Ideal: private rooms on upper floor or separate wing
    if (floorPlans.total_floors > 1 && upperFloorPrivateRooms > groundFloorPrivateRooms) {
      return 95; // Excellent privacy separation
    } else if (groundFloorPrivateRooms === 0) {
      return 90; // All private rooms on upper floor
    } else {
      return 75; // Some private rooms on ground floor
    }
  }

  /**
   * Calculate functionality score
   */
  calculateFunctionalityScore(floorPlans, projectContext) {
    const buildingType = projectContext.building_program?.toLowerCase() || '';

    // Check if required rooms are present
    let score = 80; // Base score

    if (buildingType.includes('house') || buildingType.includes('residential')) {
      // House should have: living, kitchen, bedrooms, bathrooms
      const hasLiving = floorPlans.ground_floor.rooms.some(r => r.function === 'living_space');
      const hasKitchen = floorPlans.ground_floor.rooms.some(r => r.function === 'cooking_service');
      const hasBedrooms = [
        ...floorPlans.ground_floor.rooms,
        ...(floorPlans.upper_floors[0]?.rooms || [])
      ].some(r => r.function === 'sleeping');
      const hasBathrooms = [
        ...floorPlans.ground_floor.rooms,
        ...(floorPlans.upper_floors[0]?.rooms || [])
      ].some(r => r.function === 'bathroom');

      if (hasLiving) score += 5;
      if (hasKitchen) score += 5;
      if (hasBedrooms) score += 5;
      if (hasBathrooms) score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Generate UI display data
   */
  generateUIDisplayData(reasoning, floorPlans) {
    return {
      summary: {
        title: `${floorPlans.building_type} Floor Plans`,
        floors: floorPlans.total_floors,
        total_area: floorPlans.total_area,
        room_count: floorPlans.ground_floor.rooms.length +
          (floorPlans.upper_floors[0]?.rooms.length || 0),
        efficiency: `${floorPlans.metrics.circulation_efficiency}%`,
        quality: floorPlans.metrics.layout_quality
      },

      room_schedule: this.generateRoomSchedule(floorPlans),

      key_features: [
        floorPlans.layout_strategy,
        reasoning.natural_light_strategy,
        reasoning.privacy_strategy,
        `${floorPlans.metrics.circulation_efficiency}% circulation efficiency`
      ],

      annotations_visible: true,
      show_dimensions: true,
      show_furniture: false // Can be toggled
    };
  }

  /**
   * Generate room schedule table
   */
  generateRoomSchedule(floorPlans) {
    const schedule = [];

    // Ground floor rooms
    floorPlans.ground_floor.rooms.forEach(room => {
      schedule.push({
        floor: 'Ground Floor',
        room: room.name,
        area: `${room.area}m²`,
        dimensions: room.dimensions,
        function: this.formatFunction(room.function)
      });
    });

    // Upper floor rooms
    if (floorPlans.upper_floors[0]) {
      floorPlans.upper_floors[0].rooms.forEach(room => {
        schedule.push({
          floor: 'Upper Floor',
          room: room.name,
          area: `${room.area}m²`,
          dimensions: room.dimensions,
          function: this.formatFunction(room.function)
        });
      });
    }

    return schedule;
  }

  /**
   * Format function for display
   */
  formatFunction(func) {
    return func.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /**
   * Fallback floor plans if generation fails
   */
  getFallbackFloorPlans(projectContext) {
    return {
      project_name: projectContext.project_name || 'Untitled Project',
      building_type: projectContext.building_program,
      total_floors: projectContext.floors || 2,
      total_area: projectContext.floor_area || 200,
      isFallback: true,
      ground_floor: {
        floor_number: 0,
        floor_name: 'Ground Floor',
        rooms: [
          { name: 'Living Room', area: 30, dimensions: '6m × 5m' },
          { name: 'Kitchen', area: 15, dimensions: '4m × 3.75m' },
          { name: 'WC', area: 5, dimensions: '2m × 2.5m' }
        ]
      }
    };
  }
}

// Export singleton
export default new FloorPlanGenerator();
