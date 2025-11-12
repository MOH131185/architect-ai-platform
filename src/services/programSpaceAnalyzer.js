/**
 * Program Space Analyzer Service
 * Building type validation, space logic, and optimal floor count calculation
 * Includes adjacency matrices and building code compliance
 */

class ProgramSpaceAnalyzer {
  constructor() {
    this.buildingTypeTemplates = this.initializeBuildingTemplates();
    this.adjacencyMatrices = this.initializeAdjacencyMatrices();
    this.circulationRatios = this.initializeCirculationRatios();
    this.buildingCodes = this.initializeBuildingCodes();
  }

  /**
   * Initialize comprehensive building type templates
   */
  initializeBuildingTemplates() {
    return {
      // Medical Facilities
      'clinic': {
        name: 'Medical Clinic',
        category: 'healthcare',
        minArea: 200, // m²
        maxArea: 2000,
        spaces: {
          required: [
            { name: 'Reception', minArea: 20, maxArea: 40, minHeight: 2.7, quantity: 1 },
            { name: 'Waiting Area', minArea: 30, maxArea: 60, minHeight: 2.7, quantity: 1 },
            { name: 'Consultation Room', minArea: 12, maxArea: 20, minHeight: 2.7, quantity: '3-8' },
            { name: 'Treatment Room', minArea: 15, maxArea: 25, minHeight: 2.7, quantity: '1-3' },
            { name: 'Staff Room', minArea: 15, maxArea: 30, minHeight: 2.7, quantity: 1 },
            { name: 'Storage', minArea: 10, maxArea: 30, minHeight: 2.4, quantity: '1-2' },
            { name: 'Accessible WC', minArea: 5, maxArea: 7, minHeight: 2.4, quantity: '2-4' },
            { name: 'Utility Room', minArea: 8, maxArea: 15, minHeight: 2.4, quantity: 1 }
          ],
          optional: [
            { name: 'Laboratory', minArea: 20, maxArea: 40, minHeight: 2.7 },
            { name: 'X-Ray Room', minArea: 25, maxArea: 40, minHeight: 3.0 },
            { name: 'Pharmacy', minArea: 15, maxArea: 30, minHeight: 2.7 },
            { name: 'Meeting Room', minArea: 15, maxArea: 30, minHeight: 2.7 }
          ]
        },
        occupancyLoad: 7, // m² per person
        maxFloors: 3,
        preferredFloors: 1,
        accessibility: 'full',
        specialRequirements: [
          'Medical gas systems',
          'Enhanced ventilation',
          'Privacy acoustics',
          'Infection control finishes',
          'Emergency power backup'
        ]
      },
      'hospital': {
        name: 'Hospital',
        category: 'healthcare',
        minArea: 5000,
        maxArea: 50000,
        spaces: {
          required: [
            { name: 'Emergency Department', minArea: 400, maxArea: 1000, minHeight: 3.0, quantity: 1 },
            { name: 'Reception/Admissions', minArea: 50, maxArea: 150, minHeight: 3.0, quantity: 1 },
            { name: 'Waiting Areas', minArea: 100, maxArea: 300, minHeight: 2.7, quantity: '3-10' },
            { name: 'Patient Ward', minArea: 300, maxArea: 800, minHeight: 2.7, quantity: '4-20' },
            { name: 'Operating Theatre', minArea: 50, maxArea: 80, minHeight: 3.5, quantity: '2-10' },
            { name: 'ICU', minArea: 200, maxArea: 500, minHeight: 3.0, quantity: '1-3' },
            { name: 'Radiology', minArea: 150, maxArea: 400, minHeight: 3.0, quantity: 1 },
            { name: 'Laboratory', minArea: 100, maxArea: 300, minHeight: 2.7, quantity: '1-3' },
            { name: 'Pharmacy', minArea: 80, maxArea: 200, minHeight: 2.7, quantity: 1 },
            { name: 'Kitchen', minArea: 150, maxArea: 400, minHeight: 3.0, quantity: 1 },
            { name: 'Laundry', minArea: 100, maxArea: 250, minHeight: 3.0, quantity: 1 },
            { name: 'Morgue', minArea: 50, maxArea: 150, minHeight: 2.7, quantity: 1 }
          ],
          optional: [
            { name: 'Chapel', minArea: 50, maxArea: 150, minHeight: 3.0 },
            { name: 'Cafeteria', minArea: 100, maxArea: 300, minHeight: 2.7 },
            { name: 'Gift Shop', minArea: 30, maxArea: 80, minHeight: 2.7 },
            { name: 'Rehabilitation', minArea: 150, maxArea: 400, minHeight: 3.0 }
          ]
        },
        occupancyLoad: 10,
        maxFloors: 12,
        preferredFloors: '4-8',
        accessibility: 'full',
        specialRequirements: [
          'Helipad',
          'Multiple elevators (bed-sized)',
          'Medical gas infrastructure',
          'Isolation room HVAC',
          'Emergency generators',
          'Decontamination facilities'
        ]
      },

      // Office Buildings
      'office': {
        name: 'Office Building',
        category: 'commercial',
        minArea: 200,
        maxArea: 10000,
        spaces: {
          required: [
            { name: 'Reception/Lobby', minArea: 20, maxArea: 100, minHeight: 3.0, quantity: 1 },
            { name: 'Open Office', minArea: 100, maxArea: 2000, minHeight: 2.7, quantity: '1-10' },
            { name: 'Private Office', minArea: 10, maxArea: 30, minHeight: 2.7, quantity: '2-20' },
            { name: 'Meeting Room', minArea: 15, maxArea: 50, minHeight: 2.7, quantity: '2-10' },
            { name: 'Break Room', minArea: 20, maxArea: 60, minHeight: 2.7, quantity: '1-5' },
            { name: 'WC', minArea: 20, maxArea: 50, minHeight: 2.4, quantity: '2-10' },
            { name: 'Storage', minArea: 10, maxArea: 50, minHeight: 2.4, quantity: '1-5' },
            { name: 'Server Room', minArea: 10, maxArea: 30, minHeight: 2.7, quantity: '1-2' }
          ],
          optional: [
            { name: 'Conference Room', minArea: 30, maxArea: 100, minHeight: 2.7 },
            { name: 'Executive Office', minArea: 25, maxArea: 60, minHeight: 2.7 },
            { name: 'Gym/Wellness', minArea: 50, maxArea: 200, minHeight: 3.0 },
            { name: 'Cafeteria', minArea: 50, maxArea: 200, minHeight: 2.7 }
          ]
        },
        occupancyLoad: 10,
        maxFloors: 40,
        preferredFloors: '2-6',
        accessibility: 'full',
        specialRequirements: [
          'Raised access floors for cabling',
          'HVAC zones per floor',
          'Fire escape stairs',
          'Backup power for emergency systems',
          'High-speed internet infrastructure'
        ]
      },

      // Educational Facilities
      'school': {
        name: 'School',
        category: 'educational',
        minArea: 1000,
        maxArea: 20000,
        spaces: {
          required: [
            { name: 'Classroom', minArea: 50, maxArea: 70, minHeight: 3.0, quantity: '10-40' },
            { name: 'Administration', minArea: 80, maxArea: 200, minHeight: 2.7, quantity: 1 },
            { name: 'Library', minArea: 100, maxArea: 400, minHeight: 3.0, quantity: 1 },
            { name: 'Cafeteria', minArea: 150, maxArea: 500, minHeight: 3.0, quantity: 1 },
            { name: 'Kitchen', minArea: 50, maxArea: 150, minHeight: 3.0, quantity: 1 },
            { name: 'Assembly Hall', minArea: 200, maxArea: 800, minHeight: 4.5, quantity: 1 },
            { name: 'Gymnasium', minArea: 300, maxArea: 1000, minHeight: 6.0, quantity: 1 },
            { name: 'Science Lab', minArea: 60, maxArea: 90, minHeight: 3.0, quantity: '2-6' },
            { name: 'Computer Lab', minArea: 60, maxArea: 90, minHeight: 2.7, quantity: '1-3' },
            { name: 'Staff Room', minArea: 40, maxArea: 100, minHeight: 2.7, quantity: 1 },
            { name: 'WC Block', minArea: 30, maxArea: 80, minHeight: 2.4, quantity: '4-10' },
            { name: 'Storage', minArea: 20, maxArea: 100, minHeight: 2.4, quantity: '2-8' }
          ],
          optional: [
            { name: 'Art Room', minArea: 60, maxArea: 90, minHeight: 3.0 },
            { name: 'Music Room', minArea: 60, maxArea: 100, minHeight: 3.5 },
            { name: 'Drama Studio', minArea: 80, maxArea: 150, minHeight: 4.0 },
            { name: 'Swimming Pool', minArea: 300, maxArea: 800, minHeight: 6.0 }
          ]
        },
        occupancyLoad: 2, // m² per student in classroom
        maxFloors: 4,
        preferredFloors: '1-3',
        accessibility: 'full',
        specialRequirements: [
          'Outdoor play areas',
          'Natural daylight in classrooms',
          'Acoustic treatment',
          'Safe pickup/dropoff zones',
          'Emergency assembly points',
          'Secure perimeter'
        ]
      },

      // Retail
      'retail': {
        name: 'Retail Store',
        category: 'commercial',
        minArea: 50,
        maxArea: 5000,
        spaces: {
          required: [
            { name: 'Sales Floor', minArea: 30, maxArea: 3000, minHeight: 3.0, quantity: 1 },
            { name: 'Storage/Back of House', minArea: 10, maxArea: 500, minHeight: 2.7, quantity: 1 },
            { name: 'Checkout Area', minArea: 5, maxArea: 50, minHeight: 2.7, quantity: 1 },
            { name: 'Staff Area', minArea: 10, maxArea: 50, minHeight: 2.7, quantity: 1 },
            { name: 'Customer WC', minArea: 10, maxArea: 30, minHeight: 2.4, quantity: '1-3' },
            { name: 'Loading Bay', minArea: 20, maxArea: 100, minHeight: 4.0, quantity: '1-2' }
          ],
          optional: [
            { name: 'Fitting Rooms', minArea: 15, maxArea: 50, minHeight: 2.4 },
            { name: 'Customer Service', minArea: 10, maxArea: 30, minHeight: 2.7 },
            { name: 'Cafe/Food Court', minArea: 30, maxArea: 200, minHeight: 2.7 }
          ]
        },
        occupancyLoad: 3,
        maxFloors: 3,
        preferredFloors: 1,
        accessibility: 'full',
        specialRequirements: [
          'Storefront glazing',
          'Security systems',
          'Display lighting',
          'POS infrastructure',
          'Emergency exits'
        ]
      },

      // Residential
      'residential': {
        name: 'Residential Building',
        category: 'residential',
        minArea: 50,
        maxArea: 10000,
        spaces: {
          required: [
            { name: 'Living Room', minArea: 20, maxArea: 50, minHeight: 2.4, quantity: '1 per unit' },
            { name: 'Kitchen', minArea: 8, maxArea: 25, minHeight: 2.4, quantity: '1 per unit' },
            { name: 'Bedroom', minArea: 9, maxArea: 25, minHeight: 2.4, quantity: '1-4 per unit' },
            { name: 'Bathroom', minArea: 4, maxArea: 12, minHeight: 2.3, quantity: '1-3 per unit' },
            { name: 'Entrance Hall', minArea: 3, maxArea: 15, minHeight: 2.4, quantity: '1 per unit' },
            { name: 'Storage', minArea: 2, maxArea: 10, minHeight: 2.3, quantity: '1-2 per unit' }
          ],
          optional: [
            { name: 'Dining Room', minArea: 10, maxArea: 25, minHeight: 2.4 },
            { name: 'Study/Office', minArea: 8, maxArea: 20, minHeight: 2.4 },
            { name: 'Utility Room', minArea: 4, maxArea: 10, minHeight: 2.3 },
            { name: 'Balcony/Terrace', minArea: 5, maxArea: 30, minHeight: 2.4 }
          ]
        },
        occupancyLoad: 40, // m² per person
        maxFloors: 30,
        preferredFloors: '2-4',
        accessibility: 'adaptable',
        specialRequirements: [
          'Natural ventilation',
          'Private outdoor space',
          'Sound insulation between units',
          'Secure entry systems',
          'Refuse storage'
        ]
      },

      // Hotel
      'hotel': {
        name: 'Hotel',
        category: 'hospitality',
        minArea: 1000,
        maxArea: 30000,
        spaces: {
          required: [
            { name: 'Lobby/Reception', minArea: 50, maxArea: 500, minHeight: 3.5, quantity: 1 },
            { name: 'Guest Room', minArea: 20, maxArea: 60, minHeight: 2.5, quantity: '20-300' },
            { name: 'Corridor', minArea: 50, maxArea: 500, minHeight: 2.4, quantity: 'per floor' },
            { name: 'Restaurant', minArea: 100, maxArea: 500, minHeight: 2.7, quantity: '1-3' },
            { name: 'Kitchen', minArea: 80, maxArea: 300, minHeight: 3.0, quantity: 1 },
            { name: 'Bar/Lounge', minArea: 50, maxArea: 200, minHeight: 2.7, quantity: '1-2' },
            { name: 'Conference Room', minArea: 50, maxArea: 300, minHeight: 2.7, quantity: '2-10' },
            { name: 'Back of House', minArea: 200, maxArea: 1000, minHeight: 2.7, quantity: 1 },
            { name: 'Laundry', minArea: 50, maxArea: 200, minHeight: 2.7, quantity: 1 }
          ],
          optional: [
            { name: 'Spa/Wellness', minArea: 100, maxArea: 500, minHeight: 2.7 },
            { name: 'Swimming Pool', minArea: 150, maxArea: 500, minHeight: 4.0 },
            { name: 'Gym', minArea: 50, maxArea: 200, minHeight: 3.0 },
            { name: 'Business Center', minArea: 30, maxArea: 100, minHeight: 2.7 }
          ]
        },
        occupancyLoad: 15,
        maxFloors: 40,
        preferredFloors: '5-15',
        accessibility: 'full',
        specialRequirements: [
          'Fire-rated corridors',
          'Multiple elevators',
          '24/7 operations',
          'Guest room sound insulation',
          'Emergency lighting',
          'Central HVAC with room controls'
        ]
      }
    };
  }

  /**
   * Initialize adjacency matrices for different building types
   */
  initializeAdjacencyMatrices() {
    return {
      'clinic': {
        'Reception': { 'Waiting Area': 3, 'Entrance': 3, 'Consultation Room': 1 },
        'Waiting Area': { 'Reception': 3, 'WC': 2, 'Consultation Room': 2 },
        'Consultation Room': { 'Waiting Area': 2, 'Treatment Room': 2, 'Corridor': 3 },
        'Treatment Room': { 'Consultation Room': 2, 'Storage': 2, 'Corridor': 3 },
        'Staff Room': { 'Corridor': 3, 'Storage': 1, 'WC': 1 }
      },
      'office': {
        'Reception/Lobby': { 'Entrance': 3, 'Open Office': 2, 'WC': 2, 'Elevator': 3 },
        'Open Office': { 'Meeting Room': 3, 'Break Room': 2, 'Private Office': 2 },
        'Meeting Room': { 'Open Office': 3, 'Reception/Lobby': 1, 'Corridor': 3 },
        'Break Room': { 'Open Office': 2, 'WC': 2, 'Corridor': 3 },
        'Server Room': { 'Corridor': 3, 'Storage': 1 }
      },
      'school': {
        'Classroom': { 'Corridor': 3, 'WC Block': 1, 'Outdoor': 1 },
        'Administration': { 'Entrance': 3, 'Reception': 3, 'Staff Room': 2 },
        'Library': { 'Corridor': 3, 'Computer Lab': 2, 'Quiet Area': 3 },
        'Cafeteria': { 'Kitchen': 3, 'Assembly Hall': 2, 'Outdoor': 2 },
        'Gymnasium': { 'Changing Rooms': 3, 'Storage': 2, 'Outdoor': 2 },
        'Science Lab': { 'Prep Room': 3, 'Storage': 3, 'Corridor': 3 }
      }
    };
  }

  /**
   * Initialize circulation ratios by building type and density
   */
  initializeCirculationRatios() {
    return {
      'clinic': { min: 0.20, max: 0.30, typical: 0.25 },
      'hospital': { min: 0.35, max: 0.45, typical: 0.40 },
      'office': { min: 0.15, max: 0.25, typical: 0.20 },
      'school': { min: 0.25, max: 0.35, typical: 0.30 },
      'retail': { min: 0.10, max: 0.20, typical: 0.15 },
      'residential': { min: 0.10, max: 0.20, typical: 0.15 },
      'hotel': { min: 0.30, max: 0.40, typical: 0.35 }
    };
  }

  /**
   * Initialize building code requirements
   */
  initializeBuildingCodes() {
    return {
      egress: {
        minCorridorWidth: 1.8, // meters
        minDoorWidth: 0.9,
        maxTravelDistance: 45, // meters to exit
        minStairWidth: 1.2,
        maxOccupantsPerExit: 250
      },
      accessibility: {
        minDoorClearance: 0.85,
        maxRampSlope: 0.083, // 1:12
        minTurningCircle: 1.5,
        minAccessibleWC: 2.2, // m²
        elevatorRequired: 2 // floors
      },
      fire: {
        maxCompartmentArea: 2000, // m²
        minCeilingHeight: 2.4,
        fireRatingFloors: 60, // minutes
        fireRatingWalls: 30,
        sprinklerRequired: 1000 // m² threshold
      },
      structural: {
        minFloorLoadResidential: 2.0, // kN/m²
        minFloorLoadOffice: 3.5,
        minFloorLoadRetail: 5.0,
        minFloorLoadStorage: 7.5,
        maxSpanConcrete: 8.0, // meters
        maxSpanSteel: 12.0
      }
    };
  }

  /**
   * Analyze and validate program spaces
   */
  async analyzeProgram(projectData) {
    const { projectType, totalArea, siteArea, numberOfLevels, specifications } = projectData;

    // Get building template
    const template = this.buildingTypeTemplates[projectType] || this.buildingTypeTemplates['residential'];

    // Validate total area against template
    const areaValidation = this.validateArea(totalArea, template);

    // Generate space program
    const spaceProgram = this.generateSpaceProgram(totalArea, template, specifications);

    // Calculate optimal floor count
    const floorAnalysis = this.calculateOptimalFloors(totalArea, siteArea, template, projectData.zoning);

    // Generate adjacency requirements
    const adjacencies = this.generateAdjacencyRequirements(projectType, spaceProgram);

    // Check building code compliance
    const codeCompliance = this.checkCodeCompliance(spaceProgram, floorAnalysis, template);

    // Calculate circulation and efficiency
    const efficiency = this.calculateEfficiency(spaceProgram, template);

    // Generate cost estimates
    const costEstimate = this.estimateCosts(spaceProgram, floorAnalysis, projectData.location);

    return {
      template,
      areaValidation,
      spaceProgram,
      floorAnalysis,
      adjacencies,
      codeCompliance,
      efficiency,
      costEstimate,
      recommendations: this.generateRecommendations(areaValidation, floorAnalysis, codeCompliance)
    };
  }

  /**
   * Validate area against template requirements
   */
  validateArea(totalArea, template) {
    const validation = {
      isValid: true,
      issues: [],
      warnings: []
    };

    if (totalArea < template.minArea) {
      validation.isValid = false;
      validation.issues.push(`Total area ${totalArea}m² is below minimum ${template.minArea}m² for ${template.name}`);
    }

    if (totalArea > template.maxArea) {
      validation.warnings.push(`Total area ${totalArea}m² exceeds typical maximum ${template.maxArea}m² for ${template.name}`);
    }

    // Check if area can accommodate minimum required spaces
    const minRequiredArea = template.spaces.required.reduce((sum, space) => {
      const quantity = typeof space.quantity === 'number' ? space.quantity : 1;
      return sum + (space.minArea * quantity);
    }, 0);

    if (totalArea < minRequiredArea * 1.3) { // Include circulation
      validation.warnings.push(`Tight fit: minimum required spaces need ${minRequiredArea}m² plus circulation`);
    }

    return validation;
  }

  /**
   * Generate detailed space program
   */
  generateSpaceProgram(totalArea, template, specifications) {
    const program = {
      spaces: [],
      totalProgramArea: 0,
      netArea: 0,
      grossArea: totalArea,
      circulationArea: 0
    };

    // Calculate circulation
    const circulationRatio = this.circulationRatios[template.category]?.typical || 0.20;
    program.netArea = totalArea * (1 - circulationRatio);
    program.circulationArea = totalArea * circulationRatio;

    // Add required spaces
    let remainingArea = program.netArea;
    template.spaces.required.forEach(space => {
      const quantity = this.parseQuantity(space.quantity, totalArea);

      for (let i = 0; i < quantity; i++) {
        const spaceArea = this.calculateSpaceArea(space, remainingArea, totalArea);
        program.spaces.push({
          name: `${space.name}${quantity > 1 ? ` ${i + 1}` : ''}`,
          type: space.name,
          area: spaceArea,
          minHeight: space.minHeight,
          required: true,
          adjacencies: []
        });
        program.totalProgramArea += spaceArea;
        remainingArea -= spaceArea;
      }
    });

    // Add optional spaces if area permits
    if (remainingArea > 50 && specifications?.includeOptional) {
      template.spaces.optional?.forEach(space => {
        if (remainingArea > space.minArea) {
          const spaceArea = Math.min(space.maxArea, remainingArea * 0.3);
          program.spaces.push({
            name: space.name,
            type: space.name,
            area: spaceArea,
            minHeight: space.minHeight,
            required: false,
            adjacencies: []
          });
          program.totalProgramArea += spaceArea;
          remainingArea -= spaceArea;
        }
      });
    }

    // Add circulation spaces
    program.spaces.push({
      name: 'Circulation',
      type: 'Circulation',
      area: program.circulationArea,
      minHeight: 2.4,
      required: true,
      description: 'Corridors, stairs, elevators, lobbies'
    });

    return program;
  }

  /**
   * Calculate optimal number of floors
   */
  calculateOptimalFloors(totalArea, siteArea, template, zoning) {
    const analysis = {
      recommended: 1,
      min: 1,
      max: template.maxFloors,
      reasoning: [],
      footprintEfficiency: 0
    };

    // Calculate maximum footprint based on site
    const maxFootprint = siteArea * (zoning?.maxCoverage || 0.6);

    // Calculate minimum floors needed
    analysis.min = Math.ceil(totalArea / maxFootprint);

    // Check against template preferences
    const preferred = template.preferredFloors;
    if (typeof preferred === 'number') {
      analysis.recommended = preferred;
    } else if (typeof preferred === 'string' && preferred.includes('-')) {
      const [min, max] = preferred.split('-').map(Number);
      analysis.recommended = Math.max(analysis.min, min);
    }

    // Adjust for site constraints
    if (zoning?.maxHeight) {
      const maxHeightMeters = parseFloat(zoning.maxHeight);
      const floorHeight = 3.5; // Average floor-to-floor height
      const maxFloorsByHeight = Math.floor(maxHeightMeters / floorHeight);
      analysis.max = Math.min(analysis.max, maxFloorsByHeight);
      analysis.reasoning.push(`Height limit of ${zoning.maxHeight} allows maximum ${maxFloorsByHeight} floors`);
    }

    // Calculate efficiency
    const footprint = totalArea / analysis.recommended;
    analysis.footprintEfficiency = (footprint / siteArea) * 100;

    // Optimize for building type
    if (template.category === 'healthcare' && template.preferredFloors === 1) {
      analysis.recommended = 1;
      analysis.reasoning.push('Single story preferred for accessibility and emergency evacuation');
    } else if (template.category === 'commercial' && siteArea < 500) {
      analysis.recommended = Math.max(3, analysis.min);
      analysis.reasoning.push('Vertical development maximizes small site');
    }

    // Structural efficiency
    if (analysis.recommended > 6) {
      analysis.reasoning.push('Consider concrete frame or steel structure for heights above 6 floors');
    }

    return analysis;
  }

  /**
   * Generate adjacency requirements
   */
  generateAdjacencyRequirements(projectType, spaceProgram) {
    const matrix = this.adjacencyMatrices[projectType] || {};
    const requirements = [];

    spaceProgram.spaces.forEach(space => {
      const adjacencies = matrix[space.type] || {};

      Object.entries(adjacencies).forEach(([adjacent, priority]) => {
        requirements.push({
          space: space.name,
          adjacent: adjacent,
          priority: priority, // 1 = nice to have, 2 = important, 3 = critical
          type: this.getAdjacencyType(priority)
        });
      });
    });

    return {
      matrix: requirements,
      critical: requirements.filter(r => r.priority === 3),
      important: requirements.filter(r => r.priority === 2),
      optional: requirements.filter(r => r.priority === 1)
    };
  }

  /**
   * Check building code compliance
   */
  checkCodeCompliance(spaceProgram, floorAnalysis, template) {
    const compliance = {
      isCompliant: true,
      issues: [],
      recommendations: []
    };

    const codes = this.buildingCodes;

    // Check egress requirements
    const totalOccupancy = Math.ceil(spaceProgram.grossArea / template.occupancyLoad);
    const requiredExits = Math.ceil(totalOccupancy / codes.egress.maxOccupantsPerExit);

    if (requiredExits > 1) {
      compliance.recommendations.push(`Provide minimum ${requiredExits} exits for ${totalOccupancy} occupants`);
    }

    // Check accessibility
    if (floorAnalysis.recommended >= codes.accessibility.elevatorRequired) {
      compliance.recommendations.push('Elevator required for accessibility');
    }

    // Check fire safety
    if (spaceProgram.grossArea > codes.fire.sprinklerRequired) {
      compliance.recommendations.push('Automatic sprinkler system required');
    }

    // Check structural requirements
    const floorLoad = codes.structural[`minFloorLoad${template.name.replace(' ', '')}`] ||
                     codes.structural.minFloorLoadOffice;
    compliance.recommendations.push(`Design for minimum floor load of ${floorLoad} kN/m²`);

    // Check minimum heights
    spaceProgram.spaces.forEach(space => {
      if (space.minHeight < codes.fire.minCeilingHeight) {
        compliance.issues.push(`${space.name} height ${space.minHeight}m below minimum ${codes.fire.minCeilingHeight}m`);
        compliance.isCompliant = false;
      }
    });

    return compliance;
  }

  /**
   * Calculate space efficiency
   */
  calculateEfficiency(spaceProgram, template) {
    const efficiency = {
      netToGross: 0,
      circulationRatio: 0,
      spaceUtilization: 0,
      rating: 'Standard'
    };

    efficiency.netToGross = (spaceProgram.netArea / spaceProgram.grossArea) * 100;
    efficiency.circulationRatio = (spaceProgram.circulationArea / spaceProgram.grossArea) * 100;
    efficiency.spaceUtilization = (spaceProgram.totalProgramArea / spaceProgram.netArea) * 100;

    // Rate efficiency
    if (efficiency.netToGross > 80) {
      efficiency.rating = 'Excellent';
    } else if (efficiency.netToGross > 75) {
      efficiency.rating = 'Good';
    } else if (efficiency.netToGross > 70) {
      efficiency.rating = 'Standard';
    } else {
      efficiency.rating = 'Below Average';
    }

    efficiency.summary = `${efficiency.rating} efficiency with ${Math.round(efficiency.netToGross)}% net-to-gross ratio`;

    return efficiency;
  }

  /**
   * Estimate construction costs
   */
  estimateCosts(spaceProgram, floorAnalysis, location) {
    // Base costs per m² by building type (GBP)
    const baseCosts = {
      'clinic': 2500,
      'hospital': 3500,
      'office': 2000,
      'school': 1800,
      'retail': 1500,
      'residential': 1600,
      'hotel': 2200
    };

    const baseCost = baseCosts[spaceProgram.template?.category] || 2000;

    // Adjust for number of floors
    let floorMultiplier = 1.0;
    if (floorAnalysis.recommended > 4) {
      floorMultiplier = 1.1 + (floorAnalysis.recommended - 4) * 0.02;
    }

    // Location multiplier
    const locationMultiplier = this.getLocationCostMultiplier(location);

    // Calculate total cost
    const costPerSqm = baseCost * floorMultiplier * locationMultiplier;
    const totalCost = costPerSqm * spaceProgram.grossArea;

    return {
      costPerSqm: Math.round(costPerSqm),
      totalCost: Math.round(totalCost),
      breakdown: {
        structure: Math.round(totalCost * 0.25),
        envelope: Math.round(totalCost * 0.20),
        services: Math.round(totalCost * 0.25),
        finishes: Math.round(totalCost * 0.20),
        contingency: Math.round(totalCost * 0.10)
      },
      currency: 'GBP',
      confidence: 'Preliminary estimate'
    };
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(areaValidation, floorAnalysis, codeCompliance) {
    const recommendations = [];

    // Area recommendations
    if (!areaValidation.isValid) {
      recommendations.push({
        type: 'critical',
        message: areaValidation.issues[0],
        action: 'Increase total area or reconsider building type'
      });
    }

    // Floor recommendations
    if (floorAnalysis.recommended !== floorAnalysis.min) {
      recommendations.push({
        type: 'optimization',
        message: `Consider ${floorAnalysis.recommended} floors for optimal layout`,
        action: floorAnalysis.reasoning.join('; ')
      });
    }

    // Code compliance recommendations
    codeCompliance.recommendations.forEach(rec => {
      recommendations.push({
        type: 'compliance',
        message: rec,
        action: 'Include in design specifications'
      });
    });

    return recommendations;
  }

  // Helper methods

  parseQuantity(quantity, totalArea) {
    if (typeof quantity === 'number') return quantity;
    if (typeof quantity === 'string') {
      if (quantity.includes('-')) {
        const [min, max] = quantity.split('-').map(Number);
        // Scale based on total area
        const ratio = totalArea / 1000; // per 1000m²
        return Math.max(min, Math.min(max, Math.round(min + (max - min) * ratio)));
      }
      if (quantity.includes('per')) {
        return 1; // Handle per-unit calculations separately
      }
    }
    return 1;
  }

  calculateSpaceArea(space, remainingArea, totalArea) {
    const scaleFactor = totalArea / 1000; // Scale to building size
    const targetArea = space.minArea + (space.maxArea - space.minArea) * Math.min(scaleFactor, 1);
    return Math.min(targetArea, remainingArea * 0.3); // Don't take more than 30% of remaining
  }

  getAdjacencyType(priority) {
    switch(priority) {
      case 3: return 'Critical - Direct connection required';
      case 2: return 'Important - Close proximity preferred';
      case 1: return 'Optional - Convenient if possible';
      default: return 'No requirement';
    }
  }

  getLocationCostMultiplier(location) {
    // UK location multipliers
    if (location?.includes('London')) return 1.35;
    if (location?.includes('Manchester')) return 1.15;
    if (location?.includes('Birmingham')) return 1.10;
    if (location?.includes('Edinburgh')) return 1.20;
    return 1.0; // Default UK average
  }
}

module.exports = new ProgramSpaceAnalyzer();