import logger from '../utils/logger.js';

/**
 * Detail Selection Service
 * AI-driven selection of critical technical details based on climate, materials, and building type
 * Selects the two most complex details that architects/builders need to know
 */

class DetailSelectionService {
  constructor() {
    logger.info('🔧 Detail Selection Service initialized');
  }

  /**
   * Select two critical technical details based on design DNA and context
   * @param {Object} masterDNA - Master Design DNA
   * @param {Object} location - Location data with climate
   * @param {Object} projectContext - Project context
   * @returns {Array} Array of 2 detail objects with specifications
   */
  selectCriticalDetails(masterDNA, location, projectContext) {
    logger.info('🔧 Selecting critical technical details...');

    const climate = location?.climate || {};
    const climateType = climate.type || 'Temperate';
    const materials = masterDNA.materials || {};
    const buildingProgram = projectContext?.buildingProgram || 'residential';
    const roofType = masterDNA.roof?.type || materials.roof?.type || 'gable';

    // Available detail types with complexity scores
    const availableDetails = [
      {
        id: 'wall_roof_junction',
        name: 'Wall-to-Roof Junction Detail',
        description: 'Critical thermal and moisture barrier where wall meets roof',
        complexity: 9,
        climateRelevance: {
          'Cold': 10,
          'Continental': 10,
          'Temperate': 8,
          'Mediterranean': 7,
          'Hot': 6
        },
        materialRelevance: {
          'gable': 10,
          'hip': 10,
          'flat': 8,
          'mansard': 9
        },
        scale: '1:10',
        criticalFor: ['thermal bridging', 'moisture management', 'structural continuity']
      },
      {
        id: 'window_framing',
        name: 'Window Framing Detail',
        description: 'Window installation with thermal break, flashing, and sealant',
        complexity: 8,
        climateRelevance: {
          'Cold': 10,
          'Continental': 10,
          'Temperate': 8,
          'Mediterranean': 7,
          'Hot': 6
        },
        materialRelevance: {
          'Casement': 9,
          'Sash': 8,
          'Fixed': 7
        },
        scale: '1:5',
        criticalFor: ['thermal performance', 'waterproofing', 'air tightness']
      },
      {
        id: 'slab_foundation',
        name: 'Slab-to-Foundation Junction',
        description: 'Ground floor slab connection to foundation walls with DPM',
        complexity: 8,
        climateRelevance: {
          'Cold': 9,
          'Continental': 9,
          'Temperate': 7,
          'Mediterranean': 6,
          'Hot': 5
        },
        materialRelevance: {},
        scale: '1:10',
        criticalFor: ['moisture prevention', 'structural connection', 'thermal continuity']
      },
      {
        id: 'roof_eaves',
        name: 'Roof Eaves Detail',
        description: 'Eaves, soffit, fascia, and rainwater management',
        complexity: 7,
        climateRelevance: {
          'Cold': 8,
          'Continental': 8,
          'Temperate': 7,
          'Mediterranean': 8,
          'Hot': 6
        },
        materialRelevance: {
          'gable': 9,
          'hip': 9,
          'flat': 5
        },
        scale: '1:10',
        criticalFor: ['water management', 'ventilation', 'aesthetic finish']
      },
      {
        id: 'stair_guardrail',
        name: 'Stair and Guardrail Detail',
        description: 'Stair construction, handrail, and guardrail compliance',
        complexity: 7,
        climateRelevance: {},
        materialRelevance: {},
        scale: '1:5',
        criticalFor: ['safety compliance', 'structural design', 'accessibility']
      },
      {
        id: 'wall_construction',
        name: 'Wall Construction Assembly',
        description: 'Multi-layer wall construction: cladding, insulation, structure, vapour barrier',
        complexity: 9,
        climateRelevance: {
          'Cold': 10,
          'Continental': 10,
          'Temperate': 9,
          'Mediterranean': 7,
          'Hot': 6
        },
        materialRelevance: {},
        scale: '1:10',
        criticalFor: ['thermal performance', 'moisture management', 'structural integrity']
      },
      {
        id: 'door_threshold',
        name: 'Door Threshold Detail',
        description: 'External door threshold with weatherproofing and accessibility',
        complexity: 6,
        climateRelevance: {
          'Cold': 8,
          'Continental': 8,
          'Temperate': 7,
          'Mediterranean': 6,
          'Hot': 5
        },
        materialRelevance: {},
        scale: '1:5',
        criticalFor: ['waterproofing', 'accessibility', 'thermal bridging']
      },
      {
        id: 'roof_ridge',
        name: 'Roof Ridge Detail',
        description: 'Roof ridge with ventilation, waterproofing, and finish',
        complexity: 7,
        climateRelevance: {
          'Cold': 8,
          'Continental': 8,
          'Temperate': 7,
          'Mediterranean': 8,
          'Hot': 6
        },
        materialRelevance: {
          'gable': 9,
          'hip': 8,
          'flat': 3
        },
        scale: '1:10',
        criticalFor: ['ventilation', 'waterproofing', 'aesthetic finish']
      }
    ];

    // Score each detail based on relevance
    const scoredDetails = availableDetails.map(detail => {
      let score = detail.complexity;

      // Climate relevance
      const climateScore = detail.climateRelevance[climateType] || 5;
      score += climateScore * 0.3;

      // Material relevance
      if (detail.materialRelevance && Object.keys(detail.materialRelevance).length > 0) {
        let materialScore = 0;
        if (detail.id === 'wall_roof_junction' || detail.id === 'roof_eaves' || detail.id === 'roof_ridge') {
          const roofRelevance = detail.materialRelevance[roofType] || 5;
          materialScore = roofRelevance;
        } else if (detail.id === 'window_framing') {
          const windowType = materials.windows?.type || 'Casement';
          const windowRelevance = detail.materialRelevance[windowType] || 5;
          materialScore = windowRelevance;
        }
        score += materialScore * 0.2;
      }

      // Building program relevance
      if (buildingProgram.toLowerCase().includes('residential')) {
        if (detail.id === 'stair_guardrail') score += 2;
        if (detail.id === 'door_threshold') score += 1;
      }

      return {
        ...detail,
        totalScore: score
      };
    });

    // Sort by score and select top 2
    const selectedDetails = scoredDetails
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 2)
      .map((detail, index) => ({
        ...detail,
        order: index + 1,
        label: `Detail ${index === 0 ? 'A' : 'B'}`,
        callout: this.generateDetailCallout(detail, masterDNA, location)
      }));

    logger.success(` Selected ${selectedDetails.length} critical details:`);
    selectedDetails.forEach((detail, idx) => {
      logger.info(`   ${idx + 1}. ${detail.name} (Score: ${detail.totalScore.toFixed(1)}, Scale: ${detail.scale})`);
    });

    return selectedDetails;
  }

  /**
   * Generate detailed callout specification for a technical detail
   */
  generateDetailCallout(detail, masterDNA, location) {
    const materials = masterDNA.materials || {};
    const climate = location?.climate || {};
    const climateType = climate.type || 'Temperate';

    const callouts = {
      wall_roof_junction: {
        title: 'Wall-to-Roof Junction Detail',
        scale: '1:10',
        layers: [
          'Roof covering (tiles/slate)',
          'Roof membrane/underlay',
          'Insulation layer (min 150mm)',
          'Vapour barrier',
          'Wall structure',
          'Wall cladding',
          'Cavity insulation',
          'Eaves ventilation',
          'Drip edge and flashing'
        ],
        annotations: [
          'Ensure continuous thermal barrier',
          'Prevent thermal bridging',
          'Provide adequate ventilation',
          'Waterproof flashing detail',
          'Comply with Part L (thermal) requirements'
        ],
        climateSpecific: climateType === 'Cold' || climateType === 'Continental' ? [
          'Increased insulation thickness required',
          'Enhanced vapour barrier',
          'Frost protection consideration'
        ] : []
      },
      window_framing: {
        title: 'Window Framing Detail',
        scale: '1:5',
        layers: [
          'Window frame (UPVC/Timber/Aluminum)',
          'Thermal break (if applicable)',
          'Double/triple glazing',
          'Sealant bead',
          'Flashing/weatherproofing',
          'Internal reveal',
          'Sill detail',
          'Insulation around opening'
        ],
        annotations: [
          'Maintain thermal continuity',
          'Prevent air leakage',
          'Proper drainage path',
          'Condensation prevention',
          'Structural support for opening'
        ],
        climateSpecific: climateType === 'Cold' || climateType === 'Continental' ? [
          'Triple glazing recommended',
          'Enhanced thermal breaks',
          'Condensation drainage system'
        ] : []
      },
      slab_foundation: {
        title: 'Slab-to-Foundation Junction',
        scale: '1:10',
        layers: [
          'Ground floor slab',
          'DPM (Damp Proof Membrane)',
          'Insulation layer',
          'Foundation wall',
          'DPC (Damp Proof Course)',
          'Cavity tray',
          'External ground level',
          'Drainage/gravel'
        ],
        annotations: [
          'Continuous DPM/DPC',
          'Prevent rising damp',
          'Thermal bridge prevention',
          'Structural connection',
          'Ground level management'
        ],
        climateSpecific: []
      },
      roof_eaves: {
        title: 'Roof Eaves Detail',
        scale: '1:10',
        layers: [
          'Roof covering',
          'Fascia board',
          'Soffit',
          'Eaves ventilation',
          'Gutter system',
          'Downpipe connection',
          'Wall junction',
          'Insulation continuity'
        ],
        annotations: [
          'Ventilation requirements',
          'Water management',
          'Aesthetic finish',
          'Structural support',
          'Maintenance access'
        ],
        climateSpecific: climateType === 'Hot' || climateType === 'Mediterranean' ? [
          'Solar shading consideration',
          'Enhanced drainage capacity'
        ] : []
      },
      stair_guardrail: {
        title: 'Stair and Guardrail Detail',
        scale: '1:5',
        layers: [
          'Stair tread and riser',
          'Stringer/structural support',
          'Handrail',
          'Balusters/guardrail',
          'Floor connection',
          'Nosing detail',
          'Safety compliance'
        ],
        annotations: [
          'Part K compliance (safety)',
          'Minimum 900mm guardrail height',
          'Maximum 100mm gaps',
          'Handrail ergonomics',
          'Structural support'
        ],
        climateSpecific: []
      },
      wall_construction: {
        title: 'Wall Construction Assembly',
        scale: '1:10',
        layers: [
          'External cladding',
          'Cavity (ventilated)',
          'Outer leaf structure',
          'Insulation layer',
          'Vapour barrier',
          'Inner leaf structure',
          'Internal finish'
        ],
        annotations: [
          'Thermal performance (U-value)',
          'Moisture management',
          'Structural integrity',
          'Vapour control',
          'Fire resistance'
        ],
        climateSpecific: climateType === 'Cold' || climateType === 'Continental' ? [
          'Increased insulation thickness',
          'Enhanced vapour barrier',
          'Air tightness layer'
        ] : []
      },
      door_threshold: {
        title: 'Door Threshold Detail',
        scale: '1:5',
        layers: [
          'Door leaf',
          'Threshold',
          'Weather seal',
          'DPM continuity',
          'Floor finish',
          'Drainage channel',
          'Accessibility compliance'
        ],
        annotations: [
          'Level threshold (Part M)',
          'Waterproofing',
          'Thermal break',
          'Accessibility compliance',
          'Drainage'
        ],
        climateSpecific: []
      },
      roof_ridge: {
        title: 'Roof Ridge Detail',
        scale: '1:10',
        layers: [
          'Ridge tiles/capping',
          'Ventilation system',
          'Roof membrane',
          'Insulation',
          'Structural support',
          'Underlay',
          'Fixing details'
        ],
        annotations: [
          'Ventilation requirements',
          'Waterproofing',
          'Structural integrity',
          'Aesthetic finish',
          'Maintenance access'
        ],
        climateSpecific: []
      }
    };

    return callouts[detail.id] || callouts.wall_roof_junction;
  }
}

export default new DetailSelectionService();

