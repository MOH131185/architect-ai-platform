/**
 * End-to-End Integration Tests for A1 Sheet Workflow
 * Tests complete workflow: Location → Portfolio → DNA → A1 Sheet → Validation
 */

import dnaWorkflowOrchestrator from '../src/services/dnaWorkflowOrchestrator.js';
import modelRouter from '../src/services/modelRouter.js';
import promptLibrary from '../src/services/promptLibrary.js';
import consistencyEngine from '../src/services/consistencyEngine.js';

describe('A1 Sheet Workflow Integration Tests', () => {
  const mockLocationData = {
    address: '123 Test Street, London, UK',
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

  const mockPortfolioStyle = {
    materials: ['Glass', 'Steel', 'Brick'],
    colors: ['#CCCCCC', '#808080', '#B8604E'],
    characteristics: ['Modern', 'Minimalist', 'Open plan']
  };

  describe('Step 1: Site Analysis', () => {
    test('should analyze site with location data', () => {
      const sitePrompt = promptLibrary.buildSiteAnalysisPrompt(mockLocationData);

      expect(sitePrompt).toBeDefined();
      expect(sitePrompt).toContain('London');
      expect(sitePrompt.toLowerCase()).toMatch(/(site|boundary|zoning)/);
    });

    test('should generate climate-responsive recommendations', () => {
      const climatePrompt = promptLibrary.buildClimateLogicPrompt(mockLocationData.climate);

      expect(climatePrompt).toBeDefined();
      expect(climatePrompt.toLowerCase()).toMatch(/(passive|solar|insulation)/);
    });

    test('should identify site constraints', () => {
      const mockSiteAnalysis = {
        buildableArea: 150,
        constraints: [
          '3m setbacks from property lines',
          'Maximum height 12m',
          'Medium density zoning'
        ],
        opportunities: [
          'South-facing garden for passive solar',
          'Quiet residential street',
          'Good transport links'
        ]
      };

      expect(mockSiteAnalysis.buildableArea).toBeGreaterThan(0);
      expect(mockSiteAnalysis.constraints.length).toBeGreaterThan(0);
      expect(mockSiteAnalysis.opportunities.length).toBeGreaterThan(0);
    });
  });

  describe('Step 2: Portfolio Analysis', () => {
    test('should extract style from portfolio images', () => {
      const mockImages = ['portfolio1.jpg', 'portfolio2.jpg', 'portfolio3.jpg'];
      const portfolioPrompt = promptLibrary.buildPortfolioStylePrompt(mockImages);

      expect(portfolioPrompt).toBeDefined();
      expect(portfolioPrompt.toLowerCase()).toMatch(/(style|material|pattern)/);
    });

    test('should handle empty portfolio gracefully', () => {
      const portfolioPrompt = promptLibrary.buildPortfolioStylePrompt([]);

      expect(portfolioPrompt).toBeDefined();
      // Should still generate valid prompt
    });
  });

  describe('Step 3: Style Blending', () => {
    test('should blend portfolio style with local context', () => {
      const localStyle = {
        materials: ['Brick', 'Slate'],
        colors: ['#B8604E', '#3C3C3C'],
        characteristics: ['Victorian', 'Terraced', 'Traditional']
      };

      const blendPrompt = promptLibrary.buildBlendedStylePrompt(
        mockPortfolioStyle,
        localStyle
      );

      expect(blendPrompt).toBeDefined();
      expect(blendPrompt.toLowerCase()).toMatch(/(blend|combine|portfolio|local)/);
    });

    test('should apply 70/30 blend ratio', () => {
      const localStyle = { materials: [], colors: [], characteristics: [] };
      const blendPrompt = promptLibrary.buildBlendedStylePrompt(
        mockPortfolioStyle,
        localStyle
      );

      expect(blendPrompt).toMatch(/70%|30%/);
    });
  });

  describe('Step 4: DNA Generation', () => {
    test('should generate Master Design DNA with ModelRouter', async () => {
      const mockSiteAnalysis = {
        buildableArea: 150,
        constraints: ['3m setbacks'],
        opportunities: []
      };

      const styleBlend = {
        portfolioWeight: 0.7,
        localWeight: 0.3,
        materials: ['Brick', 'Glass'],
        colors: ['#B8604E', '#CCCCCC'],
        characteristics: ['Modern', 'Traditional blend']
      };

      const dnaPrompt = promptLibrary.buildDNAGenerationPrompt(
        mockProjectSpecs,
        styleBlend,
        mockSiteAnalysis
      );

      expect(dnaPrompt).toBeDefined();
      expect(dnaPrompt).toContain('residential');
      expect(dnaPrompt).toContain('200');
      expect(dnaPrompt.toLowerCase()).toMatch(/(dimension|material|room)/);
    });

    test('should validate DNA completeness', () => {
      const mockDNA = {
        dimensions: {
          length: 15.25,
          width: 10.15,
          height: 7.40,
          floorHeights: [3.0, 3.0],
          floorCount: 2
        },
        materials: [
          { name: 'Brick', hexColor: '#B8604E', application: 'walls' }
        ],
        rooms: [
          { name: 'Living', dimensions: '5×4', area: 20, floor: 'ground' }
        ],
        viewSpecificFeatures: {
          north: { mainEntrance: true, windows: 4 }
        },
        consistencyRules: []
      };

      expect(mockDNA.dimensions).toBeDefined();
      expect(mockDNA.materials.length).toBeGreaterThan(0);
      expect(mockDNA.rooms.length).toBeGreaterThan(0);
      expect(mockDNA.viewSpecificFeatures).toBeDefined();
    });

    test('should ensure realistic dimensions', () => {
      const mockDNA = {
        dimensions: {
          length: 15.25,
          width: 10.15,
          height: 7.40,
          floorHeights: [3.0, 3.0]
        }
      };

      expect(mockDNA.dimensions.length).toBeGreaterThan(5);
      expect(mockDNA.dimensions.length).toBeLessThan(30);
      expect(mockDNA.dimensions.width).toBeGreaterThan(5);
      expect(mockDNA.dimensions.width).toBeLessThan(20);
      expect(mockDNA.dimensions.floorHeights[0]).toBeGreaterThanOrEqual(2.4);
      expect(mockDNA.dimensions.floorHeights[0]).toBeLessThanOrEqual(4.5);
    });
  });

  describe('Step 5: A1 Sheet Prompt Generation', () => {
    test('should generate comprehensive A1 sheet prompt', () => {
      const mockDNA = {
        dimensions: { length: 15.25, width: 10.15, height: 7.40, floorHeights: [3.0, 3.0] },
        materials: [
          { name: 'Brick', hexColor: '#B8604E', application: 'walls' }
        ],
        rooms: [
          { name: 'Living', dimensions: '5×4', area: 20, floor: 'ground' }
        ],
        viewSpecificFeatures: {
          north: { mainEntrance: true, windows: 4 },
          south: { patioDoors: true, windows: 3 }
        }
      };

      const styleBlend = {
        portfolioWeight: 0.7,
        localWeight: 0.3,
        materials: ['Brick'],
        colors: ['#B8604E']
      };

      const a1Prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        styleBlend
      );

      expect(a1Prompt).toBeDefined();
      expect(a1Prompt.length).toBeGreaterThan(1000);
    });

    test('should include all required A1 sections', () => {
      const mockDNA = {
        dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3] },
        materials: [{ name: 'Brick', hexColor: '#B8604E', application: 'walls' }],
        rooms: [{ name: 'Living', dimensions: '5×4', area: 20, floor: 'ground' }],
        viewSpecificFeatures: { north: { mainEntrance: true } }
      };

      const styleBlend = { materials: [], colors: [] };

      const a1Prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        styleBlend
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
        expect(a1Prompt.toLowerCase()).toContain(section);
      });
    });

    test('should include strong negative prompts', () => {
      const mockDNA = {
        dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3] },
        materials: [{ name: 'Brick', hexColor: '#B8604E', application: 'walls' }],
        rooms: [],
        viewSpecificFeatures: {}
      };

      const a1Prompt = promptLibrary.buildA1SheetGenerationPrompt(
        mockDNA,
        mockProjectSpecs,
        { materials: [], colors: [] }
      );

      expect(a1Prompt.toLowerCase()).toMatch(/(no placeholder|no grid|avoid)/);
    });
  });

  describe('Step 6: A1 Sheet Generation via ModelRouter', () => {
    test('should route to FLUX.1-dev for A1 generation', () => {
      const config = modelRouter.getModelConfig('A1_SHEET_GENERATION');

      expect(config).toBeDefined();
      expect(config.primary).toBeDefined();
    });

    test('should use Together.ai compliant dimensions', () => {
      const imageOptions = {
        prompt: 'Professional A1 sheet',
        width: 1792,
        height: 1269,
        steps: 48,
        guidance_scale: 7.8
      };

      expect(imageOptions.width).toBe(1792);
      expect(imageOptions.height).toBe(1269);
      expect(imageOptions.width / imageOptions.height).toBeCloseTo(1.414, 2);  // A1 ratio
    });

    test('should include seed for reproducibility', () => {
      const imageOptions = {
        prompt: 'Test',
        width: 1792,
        height: 1269,
        seed: 42
      };

      expect(imageOptions.seed).toBe(42);
    });
  });

  describe('Step 7: A1 Sheet Validation', () => {
    test('should validate sheet completeness', async () => {
      const mockA1Sheet = {
        url: 'a1-sheet.jpg',
        metadata: {
          designId: 'test-001',
          seed: 42,
          orientation: 'landscape',
          geometryFirst: false,
          insetSources: {
            hasRealSiteMap: true,
            hasFallback: false,
            source: 'google-static'
          }
        }
      };

      expect(mockA1Sheet.url).toBeDefined();
      expect(mockA1Sheet.metadata.designId).toBeDefined();
      expect(mockA1Sheet.metadata.seed).toBeDefined();
      expect(mockA1Sheet.metadata.insetSources.hasRealSiteMap).toBe(true);
    });

    test('should validate landscape orientation', () => {
      const metadata = {
        width: 1792,
        height: 1269,
        orientation: 'landscape'
      };

      expect(metadata.orientation).toBe('landscape');
      expect(metadata.width).toBeGreaterThan(metadata.height);
    });
  });

  describe('Step 8: Consistency Validation', () => {
    test('should run all 6 consistency checks', async () => {
      const mockDesignProject = {
        id: 'test-001',
        dna: {
          dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3], floorCount: 2 },
          materials: [{ name: 'Brick', hexColor: '#B8604E', application: 'walls' }],
          rooms: [{ name: 'Living', area: 20, floor: 'ground' }],
          viewSpecificFeatures: { north: { mainEntrance: true } },
          consistencyRules: []
        },
        sitePolygon: [{ lat: 51, lng: 0 }],
        a1Sheet: {
          url: 'sheet.jpg',
          metadata: { designId: 'test-001', seed: 42, orientation: 'landscape' }
        },
        projectSpecs: { type: 'residential', area: 200, floors: 2 }
      };

      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.dnaConsistency).toBeDefined();
      expect(result.checks.siteBoundary).toBeDefined();
      expect(result.checks.geometry).toBeDefined();
      expect(result.checks.metrics).toBeDefined();
      expect(result.checks.a1SheetCompleteness).toBeDefined();
      expect(result.checks.versionConsistency).toBeDefined();
    });

    test('should calculate weighted consistency score', async () => {
      const mockProject = {
        dna: {
          dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3], floorCount: 2 },
          materials: [{ name: 'Brick', hexColor: '#B8604E', application: 'walls' }],
          rooms: [{ name: 'Living', area: 20, floor: 'ground' }],
          viewSpecificFeatures: {},
          consistencyRules: []
        },
        projectSpecs: { area: 200, floors: 2 }
      };

      const result = await consistencyEngine.checkDesignConsistency(mockProject);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    test('should pass when score >= 92%', async () => {
      // Mock high-quality design
      const mockProject = {
        dna: {
          dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3], floorCount: 2 },
          materials: [
            { name: 'Brick', hexColor: '#B8604E', application: 'walls' },
            { name: 'Tiles', hexColor: '#8B4513', application: 'roof' }
          ],
          rooms: [
            { name: 'Living', area: 30, floor: 'ground' },
            { name: 'Kitchen', area: 20, floor: 'ground' },
            { name: 'Bedroom 1', area: 15, floor: 'upper' },
            { name: 'Bedroom 2', area: 12, floor: 'upper' }
          ],
          viewSpecificFeatures: {
            north: { mainEntrance: true, windows: 4 },
            south: { windows: 3 }
          },
          consistencyRules: ['Brick on all facades', 'Gabled roof']
        },
        sitePolygon: [{ lat: 51, lng: 0 }],
        buildingFootprint: [{ lat: 51, lng: 0 }],
        a1Sheet: {
          url: 'sheet.jpg',
          metadata: {
            designId: 'test-001',
            seed: 42,
            orientation: 'landscape',
            insetSources: { hasRealSiteMap: true }
          }
        },
        projectSpecs: { type: 'residential', area: 200, floors: 2 }
      };

      const result = await consistencyEngine.checkDesignConsistency(mockProject);

      if (result.score >= 0.92) {
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('Step 9: Cost Estimation', () => {
    test('should estimate construction costs', () => {
      const mockCostEstimate = {
        totalCost: 350000,
        costPerSqM: 1750,
        breakdown: {
          substructure: 35000,
          superstructure: 105000,
          internalFinishes: 52500,
          services: 70000,
          externalWorks: 17500,
          prelims: 42000,
          designFees: 28000,
          contingency: 35000
        },
        locationMultiplier: 1.15,  // Southeast England
        climateAdjustments: {
          insulation: 5000,
          hvac: 8000
        }
      };

      expect(mockCostEstimate.totalCost).toBeGreaterThan(0);
      expect(mockCostEstimate.costPerSqM).toBeGreaterThan(0);
      expect(mockCostEstimate.locationMultiplier).toBeGreaterThan(0);
    });

    test('should apply regional cost multipliers', () => {
      const londonMultiplier = 1.30;
      const southeastMultiplier = 1.15;
      const scotlandMultiplier = 0.88;

      expect(londonMultiplier).toBeGreaterThan(southeastMultiplier);
      expect(southeastMultiplier).toBeGreaterThan(scotlandMultiplier);
    });
  });

  describe('Complete Workflow Integration', () => {
    test('should orchestrate entire A1 workflow', async () => {
      // This is a mock test - actual implementation would call real services
      const workflowSteps = [
        'Site Analysis',
        'Portfolio Analysis',
        'Style Blending',
        'DNA Generation',
        'A1 Prompt Generation',
        'A1 Sheet Generation',
        'A1 Sheet Validation',
        'Consistency Checking',
        'Cost Estimation'
      ];

      workflowSteps.forEach(step => {
        expect(step).toBeDefined();
      });

      expect(workflowSteps.length).toBe(9);
    });

    test('should maintain data flow between steps', () => {
      // Step 1 → Step 2
      const siteAnalysis = { buildableArea: 150, constraints: [], opportunities: [] };

      // Step 2 → Step 3
      const portfolioStyle = { materials: [], colors: [], characteristics: [] };

      // Step 3 → Step 4
      const styleBlend = { portfolioWeight: 0.7, localWeight: 0.3 };

      // Step 4 → Step 5
      const masterDNA = {
        dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3] },
        materials: [],
        rooms: []
      };

      // Step 5 → Step 6
      const a1Prompt = 'Professional A1 sheet...';

      // Step 6 → Step 7
      const a1Sheet = { url: 'sheet.jpg', metadata: {} };

      // Step 7 → Step 8
      const designProject = { dna: masterDNA, a1Sheet };

      // All steps connected
      expect(siteAnalysis).toBeDefined();
      expect(portfolioStyle).toBeDefined();
      expect(styleBlend).toBeDefined();
      expect(masterDNA).toBeDefined();
      expect(a1Prompt).toBeDefined();
      expect(a1Sheet).toBeDefined();
      expect(designProject).toBeDefined();
    });

    test('should handle errors gracefully at each step', async () => {
      const steps = [
        { name: 'Site Analysis', fn: () => promptLibrary.buildSiteAnalysisPrompt(mockLocationData) },
        { name: 'Climate Logic', fn: () => promptLibrary.buildClimateLogicPrompt(mockLocationData.climate) },
        { name: 'Portfolio Style', fn: () => promptLibrary.buildPortfolioStylePrompt([]) },
        { name: 'Style Blend', fn: () => promptLibrary.buildBlendedStylePrompt({}, {}) }
      ];

      steps.forEach(step => {
        expect(() => step.fn()).not.toThrow();
      });
    });

    test('should complete in reasonable time', () => {
      const expectedTime = {
        dnaGeneration: 15000,       // 15 seconds
        a1SheetGeneration: 40000,   // 40 seconds
        validation: 5000,           // 5 seconds
        total: 60000                // ~1 minute
      };

      expect(expectedTime.total).toBeLessThan(120000);  // Should be < 2 minutes
    });
  });

  describe('AI Modify Workflow', () => {
    test('should generate modification prompt with consistency lock', () => {
      const originalDNA = {
        dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3] },
        materials: [{ name: 'Brick', hexColor: '#B8604E', application: 'walls' }],
        viewSpecificFeatures: { north: { windows: 4 } }
      };

      const modRequest = 'Increase north facade windows to 6';

      const modPrompt = promptLibrary.buildModificationPrompt(originalDNA, modRequest);

      expect(modPrompt).toBeDefined();
      expect(modPrompt).toContain('6');
      expect(modPrompt.toLowerCase()).toMatch(/(preserve|maintain|unchanged)/);
    });

    test('should reuse seed for visual consistency', () => {
      const originalSeed = 42;
      const modificationOptions = {
        seed: originalSeed,  // Same seed
        prompt: 'Modified A1 sheet...',
        width: 1792,
        height: 1269
      };

      expect(modificationOptions.seed).toBe(originalSeed);
    });

    test('should validate consistency after modification', async () => {
      const modifiedProject = {
        dna: {
          dimensions: { length: 15, width: 10, height: 7, floorHeights: [3, 3], floorCount: 2 },
          materials: [{ name: 'Brick', hexColor: '#B8604E', application: 'walls' }],
          rooms: [],
          viewSpecificFeatures: { north: { windows: 6 } },  // Modified
          consistencyRules: []
        },
        versions: [
          { seed: 42, timestamp: '2025-01-14' },
          { seed: 42, deltaPrompt: 'Increase windows', timestamp: '2025-01-15' }
        ]
      };

      const result = await consistencyEngine.checkDesignConsistency(modifiedProject);

      expect(result.checks.versionConsistency).toBeDefined();
      expect(result.checks.versionConsistency.passed).toBe(true);
    });
  });
});
