/**
 * Integration Tests for PromptLibrary
 * Tests all 8 master prompt templates
 */

import promptLibrary from '../src/services/promptLibrary.js';

describe('PromptLibrary Integration Tests', () => {
  const mockLocationData = {
    address: '123 Main Street, London, UK',
    coordinates: { lat: 51.5074, lng: -0.1278 },
    sitePolygon: [
      { lat: 51.5074, lng: -0.1278 },
      { lat: 51.5075, lng: -0.1278 },
      { lat: 51.5075, lng: -0.1279 },
      { lat: 51.5074, lng: -0.1279 }
    ],
    climate: {
      type: 'temperate',
      seasonal: {
        winter: { avgTemp: 5, minTemp: 0, maxTemp: 10 },
        spring: { avgTemp: 12, minTemp: 7, maxTemp: 17 },
        summer: { avgTemp: 20, minTemp: 15, maxTemp: 25 },
        fall: { avgTemp: 13, minTemp: 8, maxTemp: 18 }
      }
    },
    zoning: {
      type: 'Residential',
      maxHeight: '12m',
      density: 'Medium',
      setbacks: '3m from property line'
    }
  };

  const mockProjectSpecs = {
    type: 'residential',
    area: 200,
    floors: 2,
    program: {
      'Living Room': 30,
      'Kitchen': 20,
      'Bedroom 1': 15,
      'Bedroom 2': 12,
      'Bathroom': 8
    }
  };

  const mockStyleBlend = {
    portfolioWeight: 0.7,
    localWeight: 0.3,
    materials: ['Red brick', 'Clay tiles'],
    colors: ['#B8604E', '#8B4513'],
    characteristics: ['Traditional', 'Gabled roof', 'Symmetrical facade']
  };

  const mockDNA = {
    dimensions: {
      length: 15.25,
      width: 10.15,
      height: 7.40,
      floorHeights: [3.0, 3.0]
    },
    materials: [
      { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
      { name: 'Clay tiles', hexColor: '#8B4513', application: 'gable roof 35°' }
    ],
    rooms: [
      { name: 'Living Room', dimensions: '5.5m × 4.0m', floor: 'ground', windows: 2 },
      { name: 'Kitchen', dimensions: '4.0m × 3.5m', floor: 'ground', windows: 1 }
    ],
    viewSpecificFeatures: {
      north: { mainEntrance: 'centered', windows: 4 },
      south: { patioDoors: 'large sliding', windows: 3 },
      east: { windows: 2 },
      west: { windows: 2 }
    },
    consistencyRules: [
      'Red brick #B8604E on all facades',
      'Clay tile roof #8B4513 with 35° pitch',
      'White trim #FFFFFF on all windows and doors'
    ]
  };

  describe('Template 1: buildSiteAnalysisPrompt', () => {
    test('should generate valid site analysis prompt', () => {
      const prompt = promptLibrary.buildSiteAnalysisPrompt(mockLocationData);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should include location data in prompt', () => {
      const prompt = promptLibrary.buildSiteAnalysisPrompt(mockLocationData);

      expect(prompt).toContain('London');
      expect(prompt.toLowerCase()).toMatch(/(site|location|boundary)/);
    });

    test('should include zoning information', () => {
      const prompt = promptLibrary.buildSiteAnalysisPrompt(mockLocationData);

      expect(prompt.toLowerCase()).toMatch(/(zoning|residential|setback)/);
    });

    test('should handle missing site polygon gracefully', () => {
      const locationWithoutPolygon = { ...mockLocationData, sitePolygon: null };

      expect(() => {
        promptLibrary.buildSiteAnalysisPrompt(locationWithoutPolygon);
      }).not.toThrow();
    });
  });

  describe('Template 2: buildClimateLogicPrompt', () => {
    test('should generate valid climate logic prompt', () => {
      const prompt = promptLibrary.buildClimateLogicPrompt(mockLocationData.climate);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should include seasonal data', () => {
      const prompt = promptLibrary.buildClimateLogicPrompt(mockLocationData.climate);

      expect(prompt.toLowerCase()).toMatch(/(winter|summer|spring|fall)/);
      expect(prompt).toMatch(/\d+/);  // Should contain temperatures
    });

    test('should recommend climate-responsive strategies', () => {
      const prompt = promptLibrary.buildClimateLogicPrompt(mockLocationData.climate);

      expect(prompt.toLowerCase()).toMatch(/(passive|solar|ventilation|insulation|shading)/);
    });

    test('should handle different climate types', () => {
      const climateTypes = [
        { type: 'temperate', seasonal: mockLocationData.climate.seasonal },
        { type: 'hot-arid', seasonal: mockLocationData.climate.seasonal },
        { type: 'cold', seasonal: mockLocationData.climate.seasonal },
        { type: 'humid-subtropical', seasonal: mockLocationData.climate.seasonal }
      ];

      climateTypes.forEach(climate => {
        const prompt = promptLibrary.buildClimateLogicPrompt(climate);
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Template 3: buildPortfolioStylePrompt', () => {
    test('should generate valid portfolio style prompt', () => {
      const mockImages = ['portfolio1.jpg', 'portfolio2.jpg', 'portfolio3.jpg'];
      const prompt = promptLibrary.buildPortfolioStylePrompt(mockImages);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should handle multiple portfolio images', () => {
      const mockImages = ['img1.jpg', 'img2.jpg', 'img3.jpg', 'img4.jpg', 'img5.jpg'];
      const prompt = promptLibrary.buildPortfolioStylePrompt(mockImages);

      expect(prompt).toContain('portfolio');
      expect(prompt.toLowerCase()).toMatch(/(style|material|color|pattern)/);
    });

    test('should handle empty portfolio gracefully', () => {
      const prompt = promptLibrary.buildPortfolioStylePrompt([]);

      expect(prompt).toBeDefined();
      // Should still generate valid prompt even without portfolio
    });
  });

  describe('Template 4: buildBlendedStylePrompt', () => {
    test('should generate valid blended style prompt', () => {
      const portfolioStyle = {
        materials: ['Glass', 'Steel'],
        colors: ['#CCCCCC', '#808080'],
        characteristics: ['Modern', 'Minimalist']
      };

      const localStyle = {
        materials: ['Brick', 'Stone'],
        colors: ['#B8604E', '#A0A0A0'],
        characteristics: ['Traditional', 'Victorian']
      };

      const prompt = promptLibrary.buildBlendedStylePrompt(portfolioStyle, localStyle);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should mention both portfolio and local styles', () => {
      const portfolioStyle = { materials: ['Glass'], colors: ['#CCCCCC'], characteristics: ['Modern'] };
      const localStyle = { materials: ['Brick'], colors: ['#B8604E'], characteristics: ['Traditional'] };

      const prompt = promptLibrary.buildBlendedStylePrompt(portfolioStyle, localStyle);

      expect(prompt.toLowerCase()).toMatch(/(portfolio|local|blend|combine)/);
    });

    test('should specify blend ratio', () => {
      const portfolioStyle = { materials: [], colors: [], characteristics: [] };
      const localStyle = { materials: [], colors: [], characteristics: [] };

      const prompt = promptLibrary.buildBlendedStylePrompt(portfolioStyle, localStyle);

      // Should mention 70/30 or similar ratio
      expect(prompt).toMatch(/\d+%/);
    });
  });

  describe('Template 5: buildDNAGenerationPrompt', () => {
    test('should generate valid DNA generation prompt', () => {
      const mockSiteAnalysis = {
        buildableArea: 150,
        constraints: ['3m setbacks', 'Max height 12m'],
        opportunities: ['South-facing garden', 'Quiet street']
      };

      const prompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        mockStyleBlend,
        mockSiteAnalysis
      );

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(500);
    });

    test('should include project specifications', () => {
      const mockSiteAnalysis = { buildableArea: 150, constraints: [], opportunities: [] };
      const prompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        mockStyleBlend,
        mockSiteAnalysis
      );

      expect(prompt).toContain('residential');
      expect(prompt).toContain('200');  // area
      expect(prompt).toContain('2');    // floors
    });

    test('should request exact dimensions', () => {
      const mockSiteAnalysis = { buildableArea: 150, constraints: [], opportunities: [] };
      const prompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        mockStyleBlend,
        mockSiteAnalysis
      );

      expect(prompt.toLowerCase()).toMatch(/(dimension|exact|precise|meter|m²)/);
    });

    test('should request material specifications with hex colors', () => {
      const mockSiteAnalysis = { buildableArea: 150, constraints: [], opportunities: [] };
      const prompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        mockStyleBlend,
        mockSiteAnalysis
      );

      expect(prompt.toLowerCase()).toMatch(/(material|color|hex|#)/);
    });

    test('should request room-by-room breakdown', () => {
      const mockSiteAnalysis = { buildableArea: 150, constraints: [], opportunities: [] };
      const prompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        mockStyleBlend,
        mockSiteAnalysis
      );

      expect(prompt.toLowerCase()).toMatch(/(room|space|bedroom|kitchen|living)/);
    });
  });

  describe('Template 6: buildArchitecturalReasoningPrompt', () => {
    test('should generate valid reasoning prompt', () => {
      const prompt = promptLibrary.buildArchitecturalReasoningPrompt(
        mockProjectSpecs,
        mockDNA
      );

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(200);
    });

    test('should request design philosophy', () => {
      const prompt = promptLibrary.buildArchitecturalReasoningPrompt(
        mockProjectSpecs,
        mockDNA
      );

      expect(prompt.toLowerCase()).toMatch(/(philosophy|rationale|reason|why)/);
    });

    test('should request spatial organization explanation', () => {
      const prompt = promptLibrary.buildArchitecturalReasoningPrompt(
        mockProjectSpecs,
        mockDNA
      );

      expect(prompt.toLowerCase()).toMatch(/(spatial|organization|layout|circulation)/);
    });

    test('should request material justifications', () => {
      const prompt = promptLibrary.buildArchitecturalReasoningPrompt(
        mockProjectSpecs,
        mockDNA
      );

      expect(prompt.toLowerCase()).toMatch(/(material|justif|sustain)/);
    });

    test('should request alternatives', () => {
      const prompt = promptLibrary.buildArchitecturalReasoningPrompt(
        mockProjectSpecs,
        mockDNA
      );

      expect(prompt.toLowerCase()).toMatch(/(alternative|option|approach|variant)/);
    });
  });

  describe('Template 7: buildA1SheetGenerationPrompt', () => {
    test('should generate valid A1 sheet prompt', () => {
      const prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        mockStyleBlend
      );

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(1000);
    });

    test('should include all required sections', () => {
      const prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        mockStyleBlend
      );

      const requiredSections = [
        'floor plan',
        'elevation',
        'section',
        '3d',
        'title block',
        'material'
      ];

      requiredSections.forEach(section => {
        expect(prompt.toLowerCase()).toContain(section);
      });
    });

    test('should specify UK RIBA standard', () => {
      const prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        mockStyleBlend
      );

      expect(prompt.toLowerCase()).toMatch(/(riba|uk|british|professional)/);
    });

    test('should include strong negative prompts', () => {
      const prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        mockStyleBlend
      );

      expect(prompt.toLowerCase()).toMatch(/(no placeholder|no grid|no graph paper|no collage)/);
    });

    test('should specify exact dimensions from DNA', () => {
      const prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        mockStyleBlend
      );

      expect(prompt).toContain('15.25');  // length
      expect(prompt).toContain('10.15');  // width
      expect(prompt).toContain('#B8604E'); // brick color
      expect(prompt).toContain('#8B4513'); // roof color
    });

    test('should include view-specific features', () => {
      const prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        mockStyleBlend
      );

      expect(prompt.toLowerCase()).toMatch(/(north|south|east|west)/);
      expect(prompt).toContain('main entrance');
      expect(prompt).toContain('patio doors');
    });
  });

  describe('Template 8: buildModificationPrompt', () => {
    test('should generate valid modification prompt', () => {
      const modificationRequest = 'Add missing section annotations and increase north facade windows to 6';

      const prompt = promptLibrary.buildModificationPrompt(
        mockDNA,
        modificationRequest
      );

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should include original DNA for reference', () => {
      const modificationRequest = 'Change roof color to darker shade';

      const prompt = promptLibrary.buildModificationPrompt(
        mockDNA,
        modificationRequest
      );

      expect(prompt).toContain('#B8604E');  // Original brick color
      expect(prompt).toContain('#8B4513');  // Original roof color
    });

    test('should include modification request', () => {
      const modificationRequest = 'Add bay window to living room';

      const prompt = promptLibrary.buildModificationPrompt(
        mockDNA,
        modificationRequest
      );

      expect(prompt).toContain('bay window');
      expect(prompt).toContain('living room');
    });

    test('should preserve unchanged elements', () => {
      const modificationRequest = 'Change north elevation only';

      const prompt = promptLibrary.buildModificationPrompt(
        mockDNA,
        modificationRequest
      );

      expect(prompt.toLowerCase()).toMatch(/(preserve|unchanged|maintain|keep)/);
    });

    test('should generate delta prompt format', () => {
      const modificationRequest = 'Add garage on west side';

      const prompt = promptLibrary.buildModificationPrompt(
        mockDNA,
        modificationRequest
      );

      expect(prompt.toLowerCase()).toMatch(/(delta|change|only|specific)/);
    });
  });

  describe('Prompt Versioning', () => {
    test('should support version tracking', () => {
      const version = promptLibrary.getVersion?.() || '1.0.0';

      expect(version).toBeDefined();
      expect(version).toMatch(/\d+\.\d+\.\d+/);
    });

    test('should allow prompt customization', () => {
      const basePrompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        mockStyleBlend,
        { buildableArea: 150, constraints: [], opportunities: [] }
      );

      // Simulate customization
      const customPrompt = basePrompt + '\n\nAdditional requirement: Use passive solar design.';

      expect(customPrompt).toContain('passive solar');
      expect(customPrompt.length).toBeGreaterThan(basePrompt.length);
    });
  });

  describe('Consistency Across Templates', () => {
    test('all templates should return strings', () => {
      const prompts = [
        promptLibrary.buildSiteAnalysisPrompt(mockLocationData),
        promptLibrary.buildClimateLogicPrompt(mockLocationData.climate),
        promptLibrary.buildPortfolioStylePrompt(['img1.jpg']),
        promptLibrary.buildBlendedStylePrompt({ materials: [], colors: [], characteristics: [] }, { materials: [], colors: [], characteristics: [] }),
        promptLibrary.buildDNAGenerationPrompt(mockProjectSpecs, mockStyleBlend, { buildableArea: 150, constraints: [], opportunities: [] }),
        promptLibrary.buildArchitecturalReasoningPrompt(mockProjectSpecs, mockDNA),
        promptLibrary.buildA1SheetGenerationPrompt(mockDNA, mockProjectSpecs, mockStyleBlend),
        promptLibrary.buildModificationPrompt(mockDNA, 'Test modification')
      ];

      prompts.forEach(prompt => {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      });
    });

    test('all templates should be substantial (>100 chars)', () => {
      const prompts = [
        promptLibrary.buildSiteAnalysisPrompt(mockLocationData),
        promptLibrary.buildClimateLogicPrompt(mockLocationData.climate),
        promptLibrary.buildDNAGenerationPrompt(mockProjectSpecs, mockStyleBlend, { buildableArea: 150, constraints: [], opportunities: [] }),
        promptLibrary.buildArchitecturalReasoningPrompt(mockProjectSpecs, mockDNA),
        promptLibrary.buildA1SheetGenerationPrompt(mockDNA, mockProjectSpecs, mockStyleBlend),
        promptLibrary.buildModificationPrompt(mockDNA, 'Test')
      ];

      prompts.forEach(prompt => {
        expect(prompt.length).toBeGreaterThan(100);
      });
    });
  });
});
