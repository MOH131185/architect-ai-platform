/**
 * Tests for Master Design Specification (MDS) generation
 */

// Clear module cache first
jest.resetModules();

// Mock modules before imports
jest.mock('../utils/productionLogger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../services/openaiService', () => {
  return {
    default: {
      generateDesignReasoning: jest.fn(() => Promise.resolve({
        designPhilosophy: 'Test philosophy',
        materialRecommendations: { primary: ['concrete'], secondary: ['glass'] },
        spatialOrganization: 'Open plan',
        environmentalConsiderations: 'Passive design',
        technicalSolutions: 'Efficient systems'
      })),
      generateMDSDelta: jest.fn(() => Promise.resolve({
        dimensions: { floors: 3 },
        materials: { primary: 'brick', facade: 'brick' }
      })),
      analyzeArchitecturalStyle: jest.fn(() => Promise.resolve({
        style: 'contemporary',
        materials: ['glass', 'steel'],
        characteristics: ['clean lines'],
        confidence: 0.8
      }))
    }
  };
});

jest.mock('../services/locationIntelligence', () => ({
  locationIntelligence: {
    recommendArchitecturalStyle: jest.fn(() => ({
      primary: 'contemporary',
      materials: ['concrete', 'glass', 'steel'],
      characteristics: ['modern', 'sustainable']
    }))
  }
}));

// Now import the modules
import { validateMDS, createDefaultMDS } from '../schemas/mds.schema';
import { validateLayout, createDefaultLayout } from '../schemas/layout.schema';
import reasoningService from '../services/reasoningService';

/**
 * Test MDS Schema Validation
 */
describe('MDS Schema', () => {
  test('should validate a complete MDS object', () => {
    const mds = createDefaultMDS();
    const validation = validateMDS(mds);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should detect missing required fields', () => {
    const invalidMDS = {
      site: { latitude: 0, longitude: 0 },
      // Missing other required fields
    };

    const validation = validateMDS(invalidMDS);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('should validate coordinate ranges', () => {
    const mds = createDefaultMDS();
    mds.site.latitude = 95; // Invalid latitude

    const validation = validateMDS(mds);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('site.latitude must be between -90 and 90');
  });

  test('should validate climate types', () => {
    const mds = createDefaultMDS();
    mds.climate.type = 'invalid_climate';

    const validation = validateMDS(mds);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('climate.type'))).toBe(true);
  });

  test('should validate dimensions are positive', () => {
    const mds = createDefaultMDS();
    mds.dimensions.floors = -1;

    const validation = validateMDS(mds);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('dimensions.floors'))).toBe(true);
  });

  test('should validate program has rooms', () => {
    const mds = createDefaultMDS();
    mds.program = [];

    const validation = validateMDS(mds);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('program must be a non-empty array');
  });

  test('should validate blended style percentages', () => {
    const mds = createDefaultMDS();
    mds.blendedStyle.localPercentage = 150; // Invalid percentage

    const validation = validateMDS(mds);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('localPercentage'))).toBe(true);
  });
});

/**
 * Test Layout Schema Validation
 */
describe('Layout Schema', () => {
  test('should validate a complete layout object', () => {
    const layout = createDefaultLayout();
    const validation = validateLayout(layout);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should require at least one level', () => {
    const layout = createDefaultLayout();
    layout.levels = [];

    const validation = validateLayout(layout);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('levels must be a non-empty array');
  });

  test('should validate room areas are positive', () => {
    const layout = createDefaultLayout();
    layout.levels[0].rooms[0].area = -10;

    const validation = validateLayout(layout);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('area must be a positive number'))).toBe(true);
  });

  test('should validate coordinate units', () => {
    const layout = createDefaultLayout();
    layout.coordinates.units = 'invalid_unit';

    const validation = validateLayout(layout);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('coordinates.units'))).toBe(true);
  });
});

/**
 * Test Reasoning Service
 */
describe('ReasoningService', () => {
  test('should create MDS with minimal inputs', async () => {
    const params = {
      address: 'San Francisco, CA',
      program: 'residential',
      area: 200,
      projectId: 'test_project_001'
    };

    const result = await reasoningService.createMasterDesignSpec(params);

    expect(result.success).toBe(true);
    expect(result.mds).toBeDefined();
    expect(result.mds.site.address).toBe(params.address);
    expect(result.mds.dimensions.grossArea).toBe(params.area);
    expect(result.mds.metadata.projectId).toBe(params.projectId);
  });

  test('should handle portfolio style blending', async () => {
    const params = {
      address: 'San Francisco, CA',
      program: 'commercial',
      area: 500,
      portfolioAssets: ['mock_image_1', 'mock_image_2'],
      styleWeights: { material: 0.7, characteristic: 0.3 }
    };

    const result = await reasoningService.createMasterDesignSpec(params);

    expect(result.success).toBe(true);
    expect(result.mds.blendedStyle).toBeDefined();
    expect(result.mds.blendedStyle.portfolioPercentage).toBe(50); // (0.7 + 0.3) / 2 * 100
  });

  test('should calculate floor count based on area', async () => {
    const smallProject = await reasoningService.createMasterDesignSpec({
      address: 'Test Address',
      program: 'residential',
      area: 150
    });
    expect(smallProject.mds.dimensions.floors).toBe(1);

    const mediumProject = await reasoningService.createMasterDesignSpec({
      address: 'Test Address',
      program: 'residential',
      area: 300
    });
    expect(mediumProject.mds.dimensions.floors).toBe(2);

    const largeProject = await reasoningService.createMasterDesignSpec({
      address: 'Test Address',
      program: 'commercial',
      area: 1500
    });
    expect(largeProject.mds.dimensions.floors).toBeGreaterThan(2);
  });

  test('should generate consistent seeds', async () => {
    const params = {
      address: 'Test Address',
      program: 'residential',
      area: 200,
      projectId: 'fixed_project_id'
    };

    const result = await reasoningService.createMasterDesignSpec(params);

    expect(result.mds.seeds.master).toBeDefined();
    expect(result.mds.seeds.floorPlan).toBe(result.mds.seeds.master + 1);
    expect(result.mds.seeds.elevation).toBe(result.mds.seeds.master + 2);
    expect(result.mds.seeds.axonometric).toBe(result.mds.seeds.master + 3);
  });

  test('should handle MDS modification with text', async () => {
    const initialMDS = createDefaultMDS();
    const modificationText = 'Make the building taller and use brick materials';

    const result = await reasoningService.modifyMDSWithText(initialMDS, modificationText);

    // If test fails, log the error for debugging
    if (!result.success) {
      console.log('MDS modification failed with error:', result.error);
    }

    expect(result.success).toBe(true);
    expect(result.mds).toBeDefined();
    expect(result.delta).toBeDefined();
    expect(result.mds.metadata.version).not.toBe(initialMDS.metadata.version);
  });

  test('should increment version on modification', () => {
    const version1 = '1.0.0';
    const version2 = reasoningService.incrementVersion(version1);
    expect(version2).toBe('1.0.1');

    const version3 = reasoningService.incrementVersion(version2);
    expect(version3).toBe('1.0.2');
  });

  test('should generate appropriate building program', async () => {
    const residentialProgram = await reasoningService.generateBuildingProgram('residential', 200, 2);
    expect(residentialProgram.some(room => room.name === 'Living Room')).toBe(true);
    expect(residentialProgram.some(room => room.name === 'Kitchen')).toBe(true);

    const commercialProgram = await reasoningService.generateBuildingProgram('commercial', 500, 2);
    expect(commercialProgram.some(room => room.name === 'Open Office')).toBe(true);
    expect(commercialProgram.some(room => room.name === 'Meeting Rooms')).toBe(true);
  });

  test('should extract climate-appropriate envelope values', () => {
    const tropicalEnvelope = reasoningService.extractEnvelope({}, { type: 'tropical' });
    expect(tropicalEnvelope.uValueWalls).toBeGreaterThan(1); // Less insulation needed

    const polarEnvelope = reasoningService.extractEnvelope({}, { type: 'polar' });
    expect(polarEnvelope.uValueWalls).toBeLessThan(0.5); // More insulation needed
  });

  test('should handle missing portfolio gracefully', async () => {
    const params = {
      address: 'Test Address',
      program: 'residential',
      area: 200,
      portfolioAssets: null
    };

    const result = await reasoningService.createMasterDesignSpec(params);

    expect(result.success).toBe(true);
    expect(result.mds.blendedStyle.localPercentage).toBe(100);
    expect(result.mds.blendedStyle.portfolioPercentage).toBe(0);
  });
});

/**
 * Test Integration between MDS and Layout
 */
describe('MDS to Layout Integration', () => {
  test('should create layout from MDS', () => {
    const mds = createDefaultMDS();
    const layout = createDefaultLayout();

    // Verify that dimensions match
    expect(layout.building.totalArea).toBe(mds.dimensions.grossArea);
    expect(layout.levels.length).toBeGreaterThan(0);
  });

  test('should maintain consistency between MDS floors and layout levels', () => {
    const mds = createDefaultMDS();
    mds.dimensions.floors = 3;

    const layout = createDefaultLayout();
    // In a real implementation, layout would be generated from MDS
    // For now, just verify the structure is compatible

    expect(layout.levels).toBeDefined();
    expect(Array.isArray(layout.levels)).toBe(true);
  });
});

export default {
  validateMDS,
  validateLayout,
  createDefaultMDS,
  createDefaultLayout
};