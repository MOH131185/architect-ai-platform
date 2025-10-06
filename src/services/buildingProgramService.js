/**
 * Building Program and Massing Service
 * Calculates optimal building configuration based on site area, building type, and zoning
 */

class BuildingProgramService {
  /**
   * Calculate building program and massing
   * @param {string} buildingType - Type of building (residential-detached, residential-semi-detached, commercial, mixed-use, etc.)
   * @param {number} siteArea - Site area in square meters
   * @param {Object} zoning - Zoning information including height limits, setbacks, FAR
   * @param {Object} location - Location data with address and coordinates
   * @returns {Object} Comprehensive building program with massing calculations
   */
  calculateBuildingProgram(buildingType, siteArea, zoning, location) {
    try {
      console.log('Calculating building program for:', buildingType, siteArea, 'm²');

      // Parse building type and subtype
      const { primaryType, subType } = this.parseBuildingType(buildingType);

      // Calculate buildable area considering setbacks
      const buildableArea = this.calculateBuildableArea(siteArea, zoning);

      // Determine optimal number of stories
      const storiesRecommendation = this.calculateOptimalStories(
        buildableArea,
        zoning,
        primaryType,
        subType
      );

      // Calculate floor areas
      const floorAreas = this.calculateFloorAreas(
        buildableArea,
        storiesRecommendation.recommended,
        primaryType
      );

      // Generate room program based on building type
      const roomProgram = this.generateRoomProgram(
        primaryType,
        subType,
        floorAreas.totalGrossArea,
        storiesRecommendation.recommended
      );

      // Calculate structural implications
      const structuralConsiderations = this.determineStructuralSystem(
        storiesRecommendation.recommended,
        floorAreas.typicalFloorArea,
        primaryType
      );

      // Calculate parking requirements
      const parkingRequirements = this.calculateParkingRequirements(
        primaryType,
        subType,
        roomProgram,
        location
      );

      return {
        buildingType: {
          primary: primaryType,
          subType: subType,
          description: this.getBuildingTypeDescription(primaryType, subType)
        },
        siteAnalysis: {
          totalSiteArea: {
            squareMeters: Math.round(siteArea),
            squareFeet: Math.round(siteArea * 10.764)
          },
          buildableArea: {
            squareMeters: Math.round(buildableArea),
            squareFeet: Math.round(buildableArea * 10.764),
            percentage: Math.round((buildableArea / siteArea) * 100)
          },
          setbacks: zoning?.setbacks || 'Standard setbacks apply'
        },
        massing: {
          stories: storiesRecommendation,
          floorAreas,
          footprint: {
            squareMeters: Math.round(floorAreas.groundFloorArea),
            squareFeet: Math.round(floorAreas.groundFloorArea * 10.764)
          },
          height: {
            meters: Math.round(storiesRecommendation.recommended * 3.5 * 10) / 10,
            feet: Math.round(storiesRecommendation.recommended * 3.5 * 3.28)
          },
          coverageRatio: Math.round((floorAreas.groundFloorArea / siteArea) * 100)
        },
        roomProgram,
        structuralConsiderations,
        parkingRequirements,
        efficiency: this.calculateEfficiency(floorAreas),
        recommendations: this.generateRecommendations(
          primaryType,
          subType,
          storiesRecommendation,
          siteArea,
          buildableArea,
          zoning
        )
      };
    } catch (error) {
      console.error('Building program calculation error:', error);
      return this.getFallbackProgram(buildingType, siteArea);
    }
  }

  /**
   * Parse building type into primary type and subtype
   */
  parseBuildingType(buildingType) {
    const type = buildingType.toLowerCase();

    if (type.includes('residential')) {
      if (type.includes('detached')) {
        return { primaryType: 'residential', subType: 'detached' };
      } else if (type.includes('semi-detached') || type.includes('semi detached')) {
        return { primaryType: 'residential', subType: 'semi-detached' };
      } else if (type.includes('townhouse') || type.includes('row house')) {
        return { primaryType: 'residential', subType: 'townhouse' };
      } else if (type.includes('apartment') || type.includes('multi-family')) {
        return { primaryType: 'residential', subType: 'multi-family' };
      } else {
        return { primaryType: 'residential', subType: 'detached' };
      }
    } else if (type.includes('commercial')) {
      if (type.includes('office')) {
        return { primaryType: 'commercial', subType: 'office' };
      } else if (type.includes('retail')) {
        return { primaryType: 'commercial', subType: 'retail' };
      } else {
        return { primaryType: 'commercial', subType: 'general' };
      }
    } else if (type.includes('mixed')) {
      return { primaryType: 'mixed-use', subType: 'residential-commercial' };
    } else if (type.includes('industrial')) {
      return { primaryType: 'industrial', subType: 'general' };
    } else if (type.includes('institutional')) {
      return { primaryType: 'institutional', subType: 'general' };
    } else {
      return { primaryType: 'commercial', subType: 'general' };
    }
  }

  /**
   * Get building type description
   */
  getBuildingTypeDescription(primaryType, subType) {
    const descriptions = {
      'residential-detached': 'Single-family detached dwelling',
      'residential-semi-detached': 'Semi-detached dwelling (duplex)',
      'residential-townhouse': 'Townhouse or row house',
      'residential-multi-family': 'Multi-family apartment building',
      'commercial-office': 'Commercial office building',
      'commercial-retail': 'Retail commercial building',
      'commercial-general': 'General commercial building',
      'mixed-use-residential-commercial': 'Mixed-use building with residential and commercial spaces',
      'industrial-general': 'Industrial building',
      'institutional-general': 'Institutional building'
    };

    return descriptions[`${primaryType}-${subType}`] || 'Building';
  }

  /**
   * Calculate buildable area considering setbacks
   */
  calculateBuildableArea(siteArea, zoning) {
    // Extract setback information from zoning
    let frontSetback = 5; // default 5m
    let sideSetback = 3; // default 3m
    let rearSetback = 5; // default 5m

    if (zoning?.setbacks) {
      const setbackStr = zoning.setbacks.toLowerCase();

      // Parse front setback
      const frontMatch = setbackStr.match(/front[:\s]+(\d+)/);
      if (frontMatch) frontSetback = parseFloat(frontMatch[1]);

      // Parse side setback
      const sideMatch = setbackStr.match(/side[s]?[:\s]+(\d+)/);
      if (sideMatch) sideSetback = parseFloat(sideMatch[1]);

      // Parse rear setback
      const rearMatch = setbackStr.match(/rear[:\s]+(\d+)/);
      if (rearMatch) rearSetback = parseFloat(rearMatch[1]);
    }

    // Assume rectangular lot; estimate dimensions
    const lotWidth = Math.sqrt(siteArea * 1.5); // Assuming 2:3 depth-to-width ratio
    const lotDepth = siteArea / lotWidth;

    const buildableWidth = Math.max(0, lotWidth - (2 * sideSetback));
    const buildableDepth = Math.max(0, lotDepth - frontSetback - rearSetback);

    return Math.max(0, buildableWidth * buildableDepth);
  }

  /**
   * Calculate optimal number of stories
   */
  calculateOptimalStories(buildableArea, zoning, primaryType, subType) {
    // Parse maximum height from zoning
    let maxStories = 3; // default

    if (zoning?.maxHeight) {
      const heightStr = zoning.maxHeight.toLowerCase();

      // Try to extract meters or feet
      const metersMatch = heightStr.match(/(\d+)[- ]?(\d+)?[- ]?m(?:eters)?/);
      const feetMatch = heightStr.match(/(\d+)[- ]?(\d+)?[- ]?f(?:eet|t)?/);

      if (metersMatch) {
        const meters = parseFloat(metersMatch[1]);
        maxStories = Math.floor(meters / 3.5); // 3.5m typical floor height
      } else if (feetMatch) {
        const feet = parseFloat(feetMatch[1]);
        maxStories = Math.floor(feet / 11.5); // 11.5ft typical floor height
      }
    }

    // Determine optimal stories based on building type
    let recommendedStories;
    let reasoning;

    if (primaryType === 'residential') {
      if (subType === 'detached' || subType === 'semi-detached') {
        recommendedStories = Math.min(2, maxStories);
        reasoning = `${recommendedStories}-story design typical for ${subType} residential`;
      } else if (subType === 'townhouse') {
        recommendedStories = Math.min(3, maxStories);
        reasoning = '3-story design maximizes livable area for townhouse typology';
      } else {
        // Multi-family
        recommendedStories = Math.min(4, maxStories);
        reasoning = 'Multi-story design for multi-family residential';
      }
    } else if (primaryType === 'commercial') {
      recommendedStories = Math.min(3, maxStories);
      reasoning = 'Multi-story commercial design for efficient land use';
    } else if (primaryType === 'mixed-use') {
      recommendedStories = Math.min(4, maxStories);
      reasoning = 'Mixed-use typically requires multiple stories: retail ground floor + residential/office above';
    } else {
      recommendedStories = Math.min(2, maxStories);
      reasoning = 'Standard multi-story configuration';
    }

    return {
      recommended: recommendedStories,
      maximum: maxStories,
      minimum: 1,
      reasoning,
      zoningConstraint: zoning?.maxHeight || 'Standard height limits'
    };
  }

  /**
   * Calculate floor areas
   */
  calculateFloorAreas(buildableArea, stories, primaryType) {
    // Circulation and core factor
    let circulationFactor = 0.15; // 15% for residential
    if (primaryType === 'commercial') circulationFactor = 0.20; // 20% for commercial
    if (primaryType === 'mixed-use') circulationFactor = 0.18;

    const groundFloorArea = buildableArea * 0.85; // 85% site coverage typical
    const typicalFloorArea = groundFloorArea * 0.95; // Upper floors slightly smaller

    const totalGrossArea = groundFloorArea + (typicalFloorArea * (stories - 1));
    const totalNetArea = totalGrossArea * (1 - circulationFactor);

    return {
      groundFloorArea: Math.round(groundFloorArea),
      typicalFloorArea: Math.round(typicalFloorArea),
      totalGrossArea: Math.round(totalGrossArea),
      totalNetArea: Math.round(totalNetArea),
      circulationArea: Math.round(totalGrossArea - totalNetArea),
      circulationPercentage: Math.round(circulationFactor * 100)
    };
  }

  /**
   * Generate room program based on building type
   */
  generateRoomProgram(primaryType, subType, totalArea, stories) {
    if (primaryType === 'residential') {
      return this.generateResidentialProgram(subType, totalArea, stories);
    } else if (primaryType === 'commercial') {
      return this.generateCommercialProgram(subType, totalArea, stories);
    } else if (primaryType === 'mixed-use') {
      return this.generateMixedUseProgram(totalArea, stories);
    } else {
      return this.generateGenericProgram(totalArea, stories);
    }
  }

  /**
   * Generate residential room program
   */
  generateResidentialProgram(subType, totalArea, stories) {
    const program = {
      type: 'residential',
      subType,
      spaces: []
    };

    // Calculate number of bedrooms based on area
    let bedrooms = Math.floor(totalArea / 40); // ~40m² per bedroom rule of thumb
    bedrooms = Math.max(2, Math.min(bedrooms, 5)); // 2-5 bedrooms

    if (subType === 'detached') {
      program.spaces = [
        { name: 'Living Room', area: Math.round(totalArea * 0.20), count: 1 },
        { name: 'Dining Room', area: Math.round(totalArea * 0.12), count: 1 },
        { name: 'Kitchen', area: Math.round(totalArea * 0.12), count: 1 },
        { name: 'Master Bedroom with En-suite', area: Math.round(totalArea * 0.18), count: 1 },
        { name: 'Bedroom', area: Math.round(totalArea * 0.10), count: bedrooms - 1 },
        { name: 'Bathroom', area: Math.round(totalArea * 0.05), count: Math.ceil(bedrooms / 2) },
        { name: 'Laundry', area: Math.round(totalArea * 0.03), count: 1 },
        { name: 'Entry/Foyer', area: Math.round(totalArea * 0.05), count: 1 },
        { name: 'Circulation/Stairs', area: Math.round(totalArea * 0.10), count: 1 },
        { name: 'Storage/Utility', area: Math.round(totalArea * 0.05), count: 1 }
      ];
      program.bedrooms = bedrooms;
      program.bathrooms = Math.ceil(bedrooms / 2) + 1;
    } else if (subType === 'semi-detached') {
      bedrooms = Math.min(bedrooms, 4);
      program.spaces = [
        { name: 'Living/Dining', area: Math.round(totalArea * 0.25), count: 1 },
        { name: 'Kitchen', area: Math.round(totalArea * 0.12), count: 1 },
        { name: 'Master Bedroom with En-suite', area: Math.round(totalArea * 0.18), count: 1 },
        { name: 'Bedroom', area: Math.round(totalArea * 0.11), count: bedrooms - 1 },
        { name: 'Bathroom', area: Math.round(totalArea * 0.06), count: 1 },
        { name: 'Entry/Stairs', area: Math.round(totalArea * 0.12), count: 1 },
        { name: 'Storage', area: Math.round(totalArea * 0.06), count: 1 }
      ];
      program.bedrooms = bedrooms;
      program.bathrooms = 2;
    } else if (subType === 'townhouse') {
      bedrooms = Math.min(bedrooms, 4);
      program.spaces = [
        { name: 'Living/Dining (Ground)', area: Math.round(totalArea * 0.22), count: 1 },
        { name: 'Kitchen (Ground)', area: Math.round(totalArea * 0.10), count: 1 },
        { name: 'Powder Room (Ground)', area: Math.round(totalArea * 0.03), count: 1 },
        { name: 'Master Bedroom with En-suite', area: Math.round(totalArea * 0.16), count: 1 },
        { name: 'Bedroom', area: Math.round(totalArea * 0.11), count: bedrooms - 1 },
        { name: 'Bathroom', area: Math.round(totalArea * 0.06), count: 1 },
        { name: 'Stairs/Circulation', area: Math.round(totalArea * 0.14), count: 1 },
        { name: 'Storage/Laundry', area: Math.round(totalArea * 0.05), count: 1 }
      ];
      program.bedrooms = bedrooms;
      program.bathrooms = 2.5;
    } else {
      // Multi-family: calculate number of units
      const units = Math.floor(totalArea / 70); // ~70m² per unit
      program.spaces = [
        { name: '1-Bedroom Units', area: 50, count: Math.ceil(units * 0.3) },
        { name: '2-Bedroom Units', area: 75, count: Math.ceil(units * 0.5) },
        { name: '3-Bedroom Units', area: 100, count: Math.floor(units * 0.2) },
        { name: 'Lobby/Common Areas', area: Math.round(totalArea * 0.05), count: 1 },
        { name: 'Circulation/Corridors', area: Math.round(totalArea * 0.12), count: stories },
        { name: 'Amenity Space', area: Math.round(totalArea * 0.03), count: 1 }
      ];
      program.units = units;
    }

    return program;
  }

  /**
   * Generate commercial room program
   */
  generateCommercialProgram(subType, totalArea, stories) {
    const program = {
      type: 'commercial',
      subType,
      spaces: []
    };

    if (subType === 'office') {
      const workstations = Math.floor(totalArea / 10); // 10m² per workstation
      program.spaces = [
        { name: 'Open Office/Workstations', area: Math.round(totalArea * 0.45), count: 1, capacity: workstations },
        { name: 'Private Offices', area: Math.round(totalArea * 0.15), count: Math.ceil(workstations * 0.1) },
        { name: 'Meeting Rooms', area: Math.round(totalArea * 0.10), count: Math.ceil(workstations / 20) },
        { name: 'Reception/Lobby', area: Math.round(totalArea * 0.08), count: 1 },
        { name: 'Break Room/Kitchen', area: Math.round(totalArea * 0.05), count: Math.ceil(stories / 2) },
        { name: 'Restrooms', area: Math.round(totalArea * 0.06), count: stories * 2 },
        { name: 'IT/Server Room', area: Math.round(totalArea * 0.02), count: 1 },
        { name: 'Storage', area: Math.round(totalArea * 0.03), count: stories },
        { name: 'Circulation', area: Math.round(totalArea * 0.06), count: stories }
      ];
      program.workstations = workstations;
    } else if (subType === 'retail') {
      program.spaces = [
        { name: 'Sales Floor', area: Math.round(totalArea * 0.60), count: 1 },
        { name: 'Storage/Back of House', area: Math.round(totalArea * 0.15), count: 1 },
        { name: 'Staff Areas', area: Math.round(totalArea * 0.05), count: 1 },
        { name: 'Restrooms', area: Math.round(totalArea * 0.05), count: 2 },
        { name: 'Receiving/Loading', area: Math.round(totalArea * 0.08), count: 1 },
        { name: 'Office/Management', area: Math.round(totalArea * 0.04), count: 1 },
        { name: 'Circulation', area: Math.round(totalArea * 0.03), count: 1 }
      ];
    } else {
      program.spaces = [
        { name: 'Primary Function Space', area: Math.round(totalArea * 0.55), count: 1 },
        { name: 'Support Spaces', area: Math.round(totalArea * 0.20), count: 1 },
        { name: 'Staff/Admin', area: Math.round(totalArea * 0.10), count: 1 },
        { name: 'Restrooms', area: Math.round(totalArea * 0.06), count: stories * 2 },
        { name: 'Circulation', area: Math.round(totalArea * 0.09), count: stories }
      ];
    }

    return program;
  }

  /**
   * Generate mixed-use program
   */
  generateMixedUseProgram(totalArea, stories) {
    const groundFloorCommercial = totalArea / stories;
    const residentialArea = totalArea - groundFloorCommercial;

    return {
      type: 'mixed-use',
      subType: 'residential-commercial',
      spaces: [
        { name: 'Ground Floor Retail', area: Math.round(groundFloorCommercial * 0.70), count: 1, floor: 'Ground' },
        { name: 'Ground Floor Storage/BOH', area: Math.round(groundFloorCommercial * 0.20), count: 1, floor: 'Ground' },
        { name: 'Ground Floor Restrooms/Utilities', area: Math.round(groundFloorCommercial * 0.10), count: 1, floor: 'Ground' },
        { name: 'Residential Units', area: Math.round(residentialArea * 0.80), count: Math.floor(residentialArea / 70), floor: 'Upper Floors' },
        { name: 'Residential Circulation', area: Math.round(residentialArea * 0.15), count: stories - 1, floor: 'Upper Floors' },
        { name: 'Residential Amenities', area: Math.round(residentialArea * 0.05), count: 1, floor: 'Upper Floors' }
      ],
      commercialArea: Math.round(groundFloorCommercial),
      residentialArea: Math.round(residentialArea),
      residentialUnits: Math.floor(residentialArea / 70)
    };
  }

  /**
   * Generate generic program
   */
  generateGenericProgram(totalArea, stories) {
    return {
      type: 'generic',
      spaces: [
        { name: 'Primary Function Spaces', area: Math.round(totalArea * 0.60), count: stories },
        { name: 'Support Spaces', area: Math.round(totalArea * 0.20), count: stories },
        { name: 'Circulation', area: Math.round(totalArea * 0.15), count: stories },
        { name: 'Utilities/MEP', area: Math.round(totalArea * 0.05), count: stories }
      ]
    };
  }

  /**
   * Determine structural system
   */
  determineStructuralSystem(stories, floorArea, primaryType) {
    let system;
    let columnSpacing;
    let slabType;
    let foundationType;

    if (stories <= 2) {
      if (primaryType === 'residential') {
        system = 'Timber frame or light-gauge steel';
        columnSpacing = 'N/A (bearing wall system)';
        slabType = 'Ground floor: Concrete slab on grade; Upper: Timber/steel joists';
        foundationType = 'Strip footings or slab-on-grade';
      } else {
        system = 'Steel frame or reinforced concrete';
        columnSpacing = '6-8m typical';
        slabType = 'Reinforced concrete or composite steel deck';
        foundationType = 'Spread footings';
      }
    } else if (stories <= 5) {
      system = 'Reinforced concrete frame or steel frame';
      columnSpacing = '6-9m typical';
      slabType = 'Post-tensioned concrete or composite steel deck';
      foundationType = 'Mat foundation or pile caps';
    } else {
      system = 'Reinforced concrete core with perimeter columns';
      columnSpacing = '8-12m typical';
      slabType = 'Post-tensioned concrete slabs';
      foundationType = 'Deep foundations (piles or caissons)';
    }

    return {
      primarySystem: system,
      columnSpacing,
      slabType,
      foundationType,
      lateralSystem: stories > 3 ? 'Shear walls or moment frames' : 'Shear walls',
      estimatedColumnSize: this.estimateColumnSize(stories, floorArea),
      estimatedSlabThickness: this.estimateSlabThickness(columnSpacing)
    };
  }

  /**
   * Estimate column size
   */
  estimateColumnSize(stories, floorArea) {
    const loadPerFloor = floorArea * 5; // kN (simplified)
    const totalLoad = loadPerFloor * stories;

    if (totalLoad < 1000) {
      return '200x200mm or 250x250mm';
    } else if (totalLoad < 3000) {
      return '300x300mm or 350x350mm';
    } else {
      return '400x400mm or larger';
    }
  }

  /**
   * Estimate slab thickness
   */
  estimateSlabThickness(spacingStr) {
    const spacing = parseFloat(spacingStr) || 6;

    if (spacing <= 6) {
      return '150-200mm';
    } else if (spacing <= 9) {
      return '200-250mm';
    } else {
      return '250-300mm (or post-tensioned)';
    }
  }

  /**
   * Calculate parking requirements
   */
  calculateParkingRequirements(primaryType, subType, roomProgram, location) {
    let spaces = 0;
    let reasoning = '';

    if (primaryType === 'residential') {
      if (subType === 'detached' || subType === 'semi-detached') {
        spaces = 2; // Typical 2 spaces per dwelling
        reasoning = 'Standard residential parking: 2 spaces per dwelling unit';
      } else if (subType === 'townhouse') {
        spaces = 2;
        reasoning = 'Townhouse parking: 2 spaces per unit (garage + driveway/surface)';
      } else if (subType === 'multi-family' && roomProgram.units) {
        spaces = Math.ceil(roomProgram.units * 1.25); // 1.25 spaces per unit
        reasoning = `Multi-family parking: 1.25 spaces per unit × ${roomProgram.units} units`;
      }
    } else if (primaryType === 'commercial') {
      if (subType === 'office' && roomProgram.workstations) {
        spaces = Math.ceil(roomProgram.workstations * 0.3); // 1 space per 3-4 employees
        reasoning = `Office parking: 1 space per 3-4 employees (${roomProgram.workstations} workstations)`;
      } else if (subType === 'retail') {
        spaces = Math.ceil(roomProgram.spaces[0].area / 30); // 1 space per 30m² retail
        reasoning = 'Retail parking: 1 space per 30m² of sales floor';
      } else {
        spaces = 10;
        reasoning = 'Standard commercial parking provision';
      }
    } else if (primaryType === 'mixed-use') {
      const residential = Math.ceil((roomProgram.residentialUnits || 0) * 1.0);
      const commercial = Math.ceil((roomProgram.commercialArea || 0) / 40);
      spaces = residential + commercial;
      reasoning = `Mixed-use: ${residential} residential + ${commercial} commercial spaces`;
    }

    // Check for urban location (may reduce parking requirements)
    const isUrban = location?.address?.toLowerCase().includes('city') ||
                    location?.address?.toLowerCase().includes('downtown');

    if (isUrban) {
      spaces = Math.ceil(spaces * 0.75); // 25% reduction for urban locations
      reasoning += ' (reduced for urban location with transit access)';
    }

    return {
      requiredSpaces: spaces,
      reasoning,
      type: spaces <= 4 ? 'Surface parking or garage' : 'Surface lot or structured parking',
      accessibility: Math.max(1, Math.ceil(spaces * 0.04)), // 4% accessible spaces minimum
      bicycleSpaces: Math.ceil(spaces * 0.25) // 1 bicycle space per 4 car spaces
    };
  }

  /**
   * Calculate building efficiency
   */
  calculateEfficiency(floorAreas) {
    const netToGrossRatio = (floorAreas.totalNetArea / floorAreas.totalGrossArea) * 100;

    let rating;
    if (netToGrossRatio >= 85) {
      rating = 'Excellent';
    } else if (netToGrossRatio >= 80) {
      rating = 'Very Good';
    } else if (netToGrossRatio >= 75) {
      rating = 'Good';
    } else if (netToGrossRatio >= 70) {
      rating = 'Fair';
    } else {
      rating = 'Poor - consider design optimization';
    }

    return {
      netToGrossRatio: Math.round(netToGrossRatio),
      rating,
      circulationPercentage: floorAreas.circulationPercentage,
      note: 'Net-to-gross ratio measures usable space efficiency'
    };
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(primaryType, subType, storiesRec, siteArea, buildableArea, zoning) {
    const recommendations = [];

    // Site utilization
    const utilizationRate = (buildableArea / siteArea) * 100;
    if (utilizationRate < 50) {
      recommendations.push({
        category: 'Site Planning',
        recommendation: 'Consider increasing building footprint to better utilize available site area',
        benefit: 'Maximize land use efficiency while maintaining required setbacks'
      });
    }

    // Massing strategy
    recommendations.push({
      category: 'Massing',
      recommendation: `${storiesRec.recommended}-story configuration optimizes building program within zoning constraints`,
      benefit: storiesRec.reasoning
    });

    // Structural efficiency
    if (primaryType === 'commercial' || primaryType === 'mixed-use') {
      recommendations.push({
        category: 'Structural',
        recommendation: 'Use regular column grid (6-9m spacing) for flexibility and cost efficiency',
        benefit: 'Enables open floor plans and future adaptability'
      });
    }

    // Residential-specific
    if (primaryType === 'residential') {
      recommendations.push({
        category: 'Residential Design',
        recommendation: 'Orient primary living spaces toward best solar exposure and views',
        benefit: 'Enhances livability and energy performance'
      });

      if (subType === 'detached' || subType === 'semi-detached') {
        recommendations.push({
          category: 'Outdoor Space',
          recommendation: 'Provide private outdoor space (deck/patio) for each unit',
          benefit: 'Increases market appeal and quality of life'
        });
      }
    }

    // Mixed-use specific
    if (primaryType === 'mixed-use') {
      recommendations.push({
        category: 'Mixed-Use Planning',
        recommendation: 'Separate entrances for commercial (street-level) and residential (side/rear)',
        benefit: 'Maintains privacy and security for residents'
      });
    }

    // Sustainability
    recommendations.push({
      category: 'Sustainability',
      recommendation: 'Maximize natural daylighting; target 75% of occupied spaces within 7.5m of windows',
      benefit: 'Reduces lighting loads and improves occupant well-being'
    });

    return recommendations;
  }

  /**
   * Fallback program
   */
  getFallbackProgram(buildingType, siteArea) {
    return {
      buildingType: {
        primary: 'commercial',
        subType: 'general',
        description: buildingType
      },
      siteAnalysis: {
        totalSiteArea: { squareMeters: siteArea, squareFeet: Math.round(siteArea * 10.764) },
        buildableArea: { squareMeters: Math.round(siteArea * 0.6), squareFeet: Math.round(siteArea * 0.6 * 10.764) }
      },
      massing: {
        stories: { recommended: 2, reasoning: 'Standard 2-story configuration' },
        floorAreas: {
          totalGrossArea: Math.round(siteArea * 1.0),
          totalNetArea: Math.round(siteArea * 0.85)
        }
      },
      roomProgram: { type: 'generic', spaces: [] },
      recommendations: [],
      isFallback: true
    };
  }
}

export default new BuildingProgramService();
