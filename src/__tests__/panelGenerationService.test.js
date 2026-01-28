/**
 * Panel Generation Service Tests
 *
 * Tests for panel planning with deterministic seeds and geometry mask support.
 */

// Mock feature flags to control test behavior
jest.mock('../config/featureFlags.js', () => ({
  isFeatureEnabled: jest.fn((flag) => {
    if (flag === 'strictPreflightGate') return false; // Skip preflight in tests
    if (flag === 'strictCanonicalDesignState') return false;
    return false;
  }),
  getFeatureValue: jest.fn(() => null),
  setFeatureFlag: jest.fn(),
  getFeatureFlags: jest.fn(() => ({})),
}));

// Mock the validation module
jest.mock('../services/validation/GenerationPreflight.js', () => ({
  __esModule: true,
  generationPreflight: {
    validate: jest.fn(() => ({ valid: true, warnings: [] })),
    validateAsync: jest.fn(() => Promise.resolve({ valid: true, warnings: [] })),
  },
  GenerationPreflight: {
    validate: jest.fn(() => ({ valid: true, warnings: [] })),
    validateAsync: jest.fn(() => Promise.resolve({ valid: true, warnings: [] })),
  },
  PreflightError: class PreflightError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.isPreflightError = true;
    }
  },
  default: {
    generationPreflight: {
      validate: jest.fn(() => ({ valid: true, warnings: [] })),
    },
  },
}));

// Mock logger to suppress output during tests (correct path for panelGenerationService)
jest.mock('../services/core/logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    setLevel: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    Logger: jest.fn(() => mockLogger),
    LOG_LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  };
});

// Mock CDS check functions
jest.mock('../services/canonical/CanonicalDesignStateService.js', () => ({
  isReadyForPanelGeneration: jest.fn(() => ({ ready: false, missing: [] })),
}));

// Mock fingerprint service
jest.mock('../services/design/designFingerprintService.js', () => ({
  hasFingerprint: jest.fn(() => false),
  getFingerprint: jest.fn(() => null),
  getHeroControlForPanel: jest.fn(() => null),
  HERO_REFERENCE_PANELS: ['interior_3d', 'axonometric', 'elevation_north', 'elevation_south'],
}));

describe('panelGenerationService', () => {
  let planA1Panels;
  let generateA1PanelsSequential;

  beforeAll(async () => {
    // Dynamic import to handle ESM
    const module = await import('../services/design/panelGenerationService.js');
    planA1Panels = module.planA1Panels;
    generateA1PanelsSequential = module.generateA1PanelsSequential;
  });

  describe('planA1Panels', () => {
    test('plans default panels with deterministic seeds', async () => {
      const jobs = await planA1Panels({
        masterDNA: {
          architecturalStyle: 'Modern',
          dimensions: { length: 15, width: 10, floors: 2 },
        },
        buildingType: 'office',
        baseSeed: 42,
      });

      const types = jobs.map((job) => job.type);
      expect(types).toContain('hero_3d');
      expect(types).toContain('interior_3d');
      expect(types).toContain('site_diagram');
      expect(types).toContain('floor_plan_ground');
      expect(types).toContain('floor_plan_first');
      expect(types).toContain('elevation_north');
      expect(types).toContain('section_AA');

      // Each job should have a unique seed
      expect(new Set(jobs.map((j) => j.seed)).size).toBe(jobs.length);
    });

    test('includes geometry mask metadata when geometryMasks provided', async () => {
      // Create mock geometry masks (simulating ProceduralGeometryService output)
      const mockGeometryMasks = {
        floors: {
          0: {
            svgString: '<svg>...</svg>',
            dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
            width: 1500,
            height: 1500,
            floorIndex: 0,
          },
          1: {
            svgString: '<svg>...</svg>',
            dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
            width: 1500,
            height: 1500,
            floorIndex: 1,
          },
        },
        groundFloor: {
          svgString: '<svg>...</svg>',
          dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
          width: 1500,
          height: 1500,
          floorIndex: 0,
        },
        groundFloorDataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
        metadata: {
          width: 15,
          depth: 10,
          floorCount: 2,
          shape: 'rectangular',
          scale: 50,
        },
      };

      const jobs = await planA1Panels({
        masterDNA: {
          architecturalStyle: 'Modern',
          dimensions: { length: 15, width: 10, floors: 2 },
        },
        buildingType: 'residential',
        baseSeed: 123,
        geometryMasks: mockGeometryMasks,
      });

      // Find floor plan jobs
      const floorPlanGround = jobs.find((j) => j.type === 'floor_plan_ground');
      const floorPlanFirst = jobs.find((j) => j.type === 'floor_plan_first');
      const hero3d = jobs.find((j) => j.type === 'hero_3d');

      // Floor plan ground should have geometry mask
      expect(floorPlanGround).toBeDefined();
      expect(floorPlanGround.meta.useGeometryMask).toBe(true);
      expect(floorPlanGround.meta.controlImage).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(floorPlanGround.meta.controlStrength).toBeCloseTo(0.65, 1);

      // Floor plan first should have geometry mask
      expect(floorPlanFirst).toBeDefined();
      expect(floorPlanFirst.meta.useGeometryMask).toBe(true);
      expect(floorPlanFirst.meta.controlImage).toMatch(/^data:image\/svg\+xml;base64,/);

      // Hero 3D should have geometry mask (ground floor for footprint)
      expect(hero3d).toBeDefined();
      expect(hero3d.meta.useGeometryMask).toBe(true);
      expect(hero3d.meta.controlImage).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(hero3d.meta.controlStrength).toBeCloseTo(0.45, 1);
    });

    test('does not set geometry mask when geometryMasks not provided', async () => {
      const jobs = await planA1Panels({
        masterDNA: {
          architecturalStyle: 'Modern',
          dimensions: { length: 15, width: 10, floors: 2 },
        },
        buildingType: 'office',
        baseSeed: 456,
        // No geometryMasks
      });

      const floorPlanGround = jobs.find((j) => j.type === 'floor_plan_ground');
      expect(floorPlanGround).toBeDefined();
      expect(floorPlanGround.meta.useGeometryMask).toBeFalsy();
    });
  });

  describe('generateA1PanelsSequential', () => {
    test('generates panels sequentially with mocked client', async () => {
      const jobs = await planA1Panels({
        masterDNA: { architecturalStyle: 'Modern', dimensions: { floors: 2 } },
        buildingType: 'office',
        baseSeed: 7,
      });

      // Only test first 2 jobs for speed
      const testJobs = jobs.slice(0, 2);

      const mockClient = {
        generateImage: jest.fn((params) =>
          Promise.resolve({
            url: `http://example.com/${params.seed}.png`,
            metadata: { width: params.width, height: params.height },
            seedUsed: params.seed,
          })
        ),
      };

      const results = await generateA1PanelsSequential(testJobs, mockClient);

      expect(mockClient.generateImage).toHaveBeenCalledTimes(testJobs.length);
      expect(results.map((r) => r.type)).toEqual(testJobs.map((j) => j.type));

      results.forEach((panel) => {
        expect(panel.imageUrl).toContain('.png');
        expect(panel.width).toBeGreaterThan(0);
        expect(panel.height).toBeGreaterThan(0);
        expect(panel.seed).toBeGreaterThanOrEqual(0);
      });
    });

    test('passes init_image and strength for geometry mask panels', async () => {
      const mockGeometryMasks = {
        floors: {
          0: {
            dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
            width: 1500,
            height: 1500,
          },
        },
        groundFloor: {
          dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
        },
        groundFloorDataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov...',
      };

      const jobs = await planA1Panels({
        masterDNA: {
          architecturalStyle: 'Modern',
          dimensions: { length: 15, width: 10, floors: 1 },
        },
        buildingType: 'residential',
        baseSeed: 999,
        geometryMasks: mockGeometryMasks,
      });

      // Get floor_plan_ground job only
      const floorPlanJob = jobs.find((j) => j.type === 'floor_plan_ground');
      expect(floorPlanJob).toBeDefined();

      const mockClient = {
        generateImage: jest.fn((params) =>
          Promise.resolve({
            url: `http://example.com/${params.seed}.png`,
            metadata: { width: params.width, height: params.height },
            seedUsed: params.seed,
          })
        ),
      };

      await generateA1PanelsSequential([floorPlanJob], mockClient);

      // Verify generateImage was called with init_image
      expect(mockClient.generateImage).toHaveBeenCalledTimes(1);
      const callParams = mockClient.generateImage.mock.calls[0][0];

      // The generateParams should have init_image set from job.meta.controlImage
      expect(callParams.init_image).toBeDefined();
      expect(callParams.init_image).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(callParams.strength).toBeGreaterThan(0);
    });
  });
});
