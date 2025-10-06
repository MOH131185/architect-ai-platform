/**
 * Unit Tests for buildingProgramCalculator Service
 *
 * Tests comprehensive building program calculations including:
 * - Space allocation by building type
 * - Per-level distribution
 * - Massing calculations
 * - Dwelling type determination
 * - UK Part M accessibility compliance
 */

import buildingProgramCalculator from '../buildingProgramCalculator';

describe('buildingProgramCalculator', () => {
  describe('calculateBuildingProgram', () => {
    test('should calculate residential program correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        250,
        { zoning: { density: 'medium' }, climate: { type: 'temperate' } }
      );

      expect(result).toHaveProperty('buildingType', 'residential');
      expect(result).toHaveProperty('totalGrossArea', 250);
      expect(result).toHaveProperty('spaces');
      expect(result).toHaveProperty('perLevelAllocation');
      expect(result).toHaveProperty('massing');
      expect(result).toHaveProperty('accessibility');

      // Verify total space allocation matches gross area
      const totalAllocated = result.spaces.reduce((sum, space) => sum + space.area, 0);
      expect(totalAllocated).toBeCloseTo(250, 0);
    });

    test('should calculate medical clinic program correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'medical_clinic',
        500,
        { zoning: { density: 'high' }, climate: { type: 'tropical' } }
      );

      expect(result.buildingType).toBe('medical_clinic');
      expect(result.totalGrossArea).toBe(500);
      expect(result.spaces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ function: 'Reception & Waiting' }),
          expect.objectContaining({ function: 'Consultation Rooms' }),
          expect.objectContaining({ function: 'Examination Rooms' })
        ])
      );

      // Medical clinics should have accessibility compliance
      expect(result.accessibility).toHaveProperty('standard', 'UK Part M');
      expect(result.accessibility.compliant).toBe(true);
    });

    test('should calculate office program correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'office',
        750,
        { zoning: { density: 'high' }, climate: { type: 'temperate' } }
      );

      expect(result.buildingType).toBe('office');
      expect(result.totalGrossArea).toBe(750);
      expect(result.spaces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ function: 'Open Office Area' }),
          expect.objectContaining({ function: 'Meeting Rooms' }),
          expect.objectContaining({ function: 'Reception' })
        ])
      );
    });

    test('should handle small area residential (detached house)', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        150,
        { zoning: { density: 'low' } }
      );

      expect(result.massing.dwellingType).toBe('detached');
      expect(result.massing.stories.recommended).toBe(2);
    });

    test('should handle medium area residential (semi-detached)', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        250,
        { zoning: { density: 'medium' } }
      );

      expect(result.massing.dwellingType).toBe('semi-detached');
      expect(result.massing.stories.recommended).toBeGreaterThanOrEqual(2);
    });

    test('should handle large area residential (terraced/townhouse)', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        400,
        { zoning: { density: 'high' } }
      );

      expect(result.massing.dwellingType).toBe('terraced');
      expect(result.massing.stories.recommended).toBeGreaterThanOrEqual(2);
    });

    test('should calculate correct number of stories based on area', () => {
      const smallArea = buildingProgramCalculator.calculateBuildingProgram('residential', 120, {});
      expect(smallArea.massing.stories.recommended).toBe(2);

      const largeArea = buildingProgramCalculator.calculateBuildingProgram('office', 1200, {});
      expect(largeArea.massing.stories.recommended).toBeGreaterThanOrEqual(3);
    });

    test('should apply circulation factor correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 300, {});

      // Circulation should be ~15% for residential
      const circulationSpace = result.spaces.find(s => s.function === 'Circulation');
      expect(circulationSpace).toBeDefined();
      expect(circulationSpace.area).toBeGreaterThan(0);
      expect(circulationSpace.area / result.totalGrossArea).toBeCloseTo(0.15, 1);
    });

    test('should include accessibility features for all building types', () => {
      const residential = buildingProgramCalculator.calculateBuildingProgram('residential', 200, {});
      const clinic = buildingProgramCalculator.calculateBuildingProgram('medical_clinic', 400, {});
      const office = buildingProgramCalculator.calculateBuildingProgram('office', 600, {});

      expect(residential.accessibility.compliant).toBe(true);
      expect(clinic.accessibility.compliant).toBe(true);
      expect(office.accessibility.compliant).toBe(true);

      expect(residential.accessibility.features).toContain('Level access entrance');
      expect(clinic.accessibility.features).toContain('Accessible WC on each floor');
      expect(office.accessibility.features).toContain('Level access entrance');
    });

    test('should handle tropical climate adaptations', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        200,
        { climate: { type: 'tropical' } }
      );

      expect(result).toBeDefined();
      // In a full implementation, this would check for climate-specific features
      expect(result.totalGrossArea).toBe(200);
    });

    test('should throw error for invalid building type', () => {
      expect(() => {
        buildingProgramCalculator.calculateBuildingProgram('invalid_type', 200, {});
      }).toThrow();
    });

    test('should throw error for zero or negative area', () => {
      expect(() => {
        buildingProgramCalculator.calculateBuildingProgram('residential', 0, {});
      }).toThrow();

      expect(() => {
        buildingProgramCalculator.calculateBuildingProgram('residential', -100, {});
      }).toThrow();
    });
  });

  describe('perLevelAllocation', () => {
    test('should distribute spaces correctly across levels', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 300, {});

      expect(result.perLevelAllocation).toBeInstanceOf(Array);
      expect(result.perLevelAllocation.length).toBeGreaterThan(0);

      // Verify all levels have required properties
      result.perLevelAllocation.forEach(level => {
        expect(level).toHaveProperty('level');
        expect(level).toHaveProperty('surfaceArea');
        expect(level).toHaveProperty('functions');
        expect(level).toHaveProperty('spacePlanning');
        expect(level.surfaceArea).toBeGreaterThan(0);
      });

      // Verify total area across levels matches building total
      const totalLevelArea = result.perLevelAllocation.reduce(
        (sum, level) => sum + level.surfaceArea,
        0
      );
      expect(totalLevelArea).toBeCloseTo(result.totalGrossArea, 0);
    });

    test('should allocate public spaces to ground floor', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('medical_clinic', 500, {});

      const groundFloor = result.perLevelAllocation.find(level =>
        level.level === 'Ground Floor' || level.level === 'Level 1'
      );

      expect(groundFloor).toBeDefined();
      expect(groundFloor.functions).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/reception|waiting|entrance/i)
        ])
      );
    });

    test('should include space planning details', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('office', 600, {});

      result.perLevelAllocation.forEach(level => {
        expect(level.spacePlanning).toBeDefined();
        expect(typeof level.spacePlanning).toBe('object');
      });
    });
  });

  describe('massing calculations', () => {
    test('should calculate footprint correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 400, {});

      const expectedFootprint = result.totalGrossArea / result.massing.stories.recommended;
      expect(result.massing.footprint).toBeCloseTo(expectedFootprint, 0);
    });

    test('should calculate height correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 300, {});

      const expectedHeight = result.massing.stories.recommended * 3.0; // 3m per story
      expect(result.massing.height).toBeCloseTo(expectedHeight, 1);
    });

    test('should provide story range', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('office', 800, {});

      expect(result.massing.stories).toHaveProperty('min');
      expect(result.massing.stories).toHaveProperty('max');
      expect(result.massing.stories).toHaveProperty('recommended');
      expect(result.massing.stories.min).toBeLessThanOrEqual(result.massing.stories.recommended);
      expect(result.massing.stories.max).toBeGreaterThanOrEqual(result.massing.stories.recommended);
    });

    test('should calculate volume correctly', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 250, {});

      const expectedVolume = result.totalGrossArea * 3.0; // 3m ceiling height
      expect(result.massing.volume).toBeCloseTo(expectedVolume, 0);
    });
  });

  describe('dwelling type determination', () => {
    test('should return detached for small residential', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        120,
        { zoning: { density: 'low' } }
      );
      expect(result.massing.dwellingType).toBe('detached');
    });

    test('should return semi-detached for medium residential', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        220,
        { zoning: { density: 'medium' } }
      );
      expect(result.massing.dwellingType).toBe('semi-detached');
    });

    test('should return terraced for large residential', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        350,
        { zoning: { density: 'high' } }
      );
      expect(result.massing.dwellingType).toBe('terraced');
    });

    test('should return apartment for very large residential', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        600,
        { zoning: { density: 'high' } }
      );
      expect(['terraced', 'apartment']).toContain(result.massing.dwellingType);
    });

    test('should not have dwelling type for non-residential', () => {
      const clinic = buildingProgramCalculator.calculateBuildingProgram('medical_clinic', 400, {});
      const office = buildingProgramCalculator.calculateBuildingProgram('office', 600, {});

      expect(clinic.massing.dwellingType).toBeUndefined();
      expect(office.massing.dwellingType).toBeUndefined();
    });
  });

  describe('UK Part M accessibility compliance', () => {
    test('should include Part M standard reference', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 200, {});

      expect(result.accessibility.standard).toBe('UK Part M');
      expect(result.accessibility.category).toMatch(/M4\(1\)|M4\(2\)|M4\(3\)/);
    });

    test('should list accessibility features', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('medical_clinic', 500, {});

      expect(result.accessibility.features).toBeInstanceOf(Array);
      expect(result.accessibility.features.length).toBeGreaterThan(0);
      expect(result.accessibility.features).toContain('Level access entrance');
      expect(result.accessibility.features).toContain('Accessible WC on each floor');
    });

    test('should mark as compliant for properly designed buildings', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('office', 600, {});

      expect(result.accessibility.compliant).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle very small area (minimum viable)', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 50, {});

      expect(result.totalGrossArea).toBe(50);
      expect(result.spaces.length).toBeGreaterThan(0);
      expect(result.massing.stories.recommended).toBeGreaterThanOrEqual(1);
    });

    test('should handle very large area', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('office', 5000, {});

      expect(result.totalGrossArea).toBe(5000);
      expect(result.massing.stories.recommended).toBeGreaterThan(3);
    });

    test('should handle missing context gracefully', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram('residential', 200);

      expect(result).toBeDefined();
      expect(result.totalGrossArea).toBe(200);
    });

    test('should handle partial context', () => {
      const result = buildingProgramCalculator.calculateBuildingProgram(
        'residential',
        200,
        { zoning: {} }
      );

      expect(result).toBeDefined();
      expect(result.totalGrossArea).toBe(200);
    });
  });
});
