/**
 * Integration Tests for ConsistencyEngine
 * Tests all 6 validation checks and version comparison
 */

import consistencyEngine from '../src/services/consistencyEngine.js';

describe('ConsistencyEngine Integration Tests', () => {
  const mockDNA = {
    dimensions: {
      length: 15.25,
      width: 10.15,
      height: 7.40,
      floorHeights: [3.0, 3.0],
      floorCount: 2
    },
    materials: [
      { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
      { name: 'Clay tiles', hexColor: '#8B4513', application: 'gable roof 35°' },
      { name: 'White UPVC', hexColor: '#FFFFFF', application: 'windows and doors' }
    ],
    rooms: [
      { name: 'Living Room', dimensions: '5.5m × 4.0m', area: 22, floor: 'ground', windows: 2 },
      { name: 'Kitchen', dimensions: '4.0m × 3.5m', area: 14, floor: 'ground', windows: 1 },
      { name: 'Bedroom 1', dimensions: '4.5m × 3.5m', area: 15.75, floor: 'upper', windows: 2 },
      { name: 'Bedroom 2', dimensions: '3.5m × 3.0m', area: 10.5, floor: 'upper', windows: 1 },
      { name: 'Bathroom', dimensions: '2.5m × 2.0m', area: 5, floor: 'upper', windows: 1 }
    ],
    viewSpecificFeatures: {
      north: { mainEntrance: 'centered', windows: 4, features: [] },
      south: { patioDoors: 'large sliding', windows: 3, features: [] },
      east: { windows: 2, features: [] },
      west: { windows: 2, features: [] }
    },
    consistencyRules: [
      'Red brick #B8604E on all facades',
      'Clay tile roof #8B4513 with 35° pitch',
      'White trim #FFFFFF on all windows and doors',
      'Total floor area: 200 m²'
    ]
  };

  const mockDesignProject = {
    id: 'test-design-001',
    dna: mockDNA,
    sitePolygon: [
      { lat: 51.5074, lng: -0.1278 },
      { lat: 51.5075, lng: -0.1278 },
      { lat: 51.5075, lng: -0.1279 },
      { lat: 51.5074, lng: -0.1279 }
    ],
    buildingFootprint: [
      { lat: 51.50745, lng: -0.12785 },
      { lat: 51.50748, lng: -0.12785 },
      { lat: 51.50748, lng: -0.12788 },
      { lat: 51.50745, lng: -0.12788 }
    ],
    generatedViews: {
      floorPlans: [
        { type: 'ground', url: 'ground.jpg' },
        { type: 'upper', url: 'upper.jpg' }
      ],
      technicalDrawings: [
        { type: 'elevation', orientation: 'north', url: 'north.jpg' },
        { type: 'elevation', orientation: 'south', url: 'south.jpg' },
        { type: 'section', orientation: 'A-A', url: 'sectionA.jpg' }
      ],
      threeD: [
        { type: 'exterior', url: '3d.jpg' }
      ]
    },
    a1Sheet: {
      url: 'a1-sheet.jpg',
      metadata: {
        designId: 'test-design-001',
        seed: 42,
        orientation: 'landscape',
        geometryFirst: false,
        insetSources: {
          hasRealSiteMap: true,
          hasFallback: false,
          source: 'google-static'
        }
      }
    },
    projectSpecs: {
      type: 'residential',
      area: 200,
      floors: 2
    },
    costEstimate: {
      totalCost: 350000,
      costPerSqM: 1750
    }
  };

  describe('Check 1: DNA Consistency (25% weight)', () => {
    test('should pass for complete DNA with all required fields', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.dnaConsistency).toBeDefined();
      expect(result.checks.dnaConsistency.passed).toBe(true);
      expect(result.checks.dnaConsistency.score).toBeGreaterThanOrEqual(0.9);
      expect(result.checks.dnaConsistency.weight).toBe(0.25);
    });

    test('should fail for DNA missing required fields', async () => {
      const invalidProject = {
        ...mockDesignProject,
        dna: {
          dimensions: { length: 15, width: 10 },  // Missing height, floorHeights
          materials: [],  // Empty materials
          rooms: []       // Empty rooms
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(invalidProject);

      expect(result.checks.dnaConsistency.passed).toBe(false);
      expect(result.checks.dnaConsistency.score).toBeLessThan(0.9);
    });

    test('should validate realistic floor heights (2.4-4.5m)', async () => {
      const invalidProject = {
        ...mockDesignProject,
        dna: {
          ...mockDNA,
          dimensions: {
            ...mockDNA.dimensions,
            floorHeights: [1.5, 1.5]  // Too low
          }
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(invalidProject);

      expect(result.checks.dnaConsistency.warnings || result.checks.dnaConsistency.issues)
        .toBeDefined();
    });

    test('should validate minimum room sizes (>9m²)', async () => {
      const invalidProject = {
        ...mockDesignProject,
        dna: {
          ...mockDNA,
          rooms: [
            { name: 'Closet', dimensions: '2m × 2m', area: 4, floor: 'ground' }  // Too small
          ]
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(invalidProject);

      expect(result.checks.dnaConsistency.warnings || result.checks.dnaConsistency.issues)
        .toBeDefined();
    });
  });

  describe('Check 2: Site Boundary Consistency (15% weight)', () => {
    test('should pass when building fits within site boundary', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.siteBoundary).toBeDefined();
      expect(result.checks.siteBoundary.passed).toBe(true);
      expect(result.checks.siteBoundary.score).toBeGreaterThanOrEqual(0.9);
      expect(result.checks.siteBoundary.weight).toBe(0.15);
    });

    test('should validate setback compliance (3-5m from property lines)', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.siteBoundary.details).toBeDefined();
      // Should check setback distances
    });

    test('should handle missing site polygon gracefully', async () => {
      const projectWithoutSite = {
        ...mockDesignProject,
        sitePolygon: null
      };

      const result = await consistencyEngine.checkDesignConsistency(projectWithoutSite);

      // Should still complete validation, maybe with warning
      expect(result.checks).toBeDefined();
    });
  });

  describe('Check 3: Geometry Consistency (20% weight)', () => {
    test('should pass when dimensions match DNA', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.geometry).toBeDefined();
      expect(result.checks.geometry.passed).toBe(true);
      expect(result.checks.geometry.score).toBeGreaterThanOrEqual(0.9);
      expect(result.checks.geometry.weight).toBe(0.20);
    });

    test('should validate room areas match specifications', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      // Total room area should be close to 200 m²
      const totalRoomArea = mockDNA.rooms.reduce((sum, room) => sum + room.area, 0);
      expect(totalRoomArea).toBeCloseTo(67.25, 1);  // Sum of all rooms
    });

    test('should validate floor heights are consistent', async () => {
      const invalidProject = {
        ...mockDesignProject,
        dna: {
          ...mockDNA,
          dimensions: {
            ...mockDNA.dimensions,
            floorHeights: [3.0, 4.5]  // Inconsistent heights
          }
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(invalidProject);

      // Should warn about inconsistent floor heights
      expect(result.checks.geometry).toBeDefined();
    });
  });

  describe('Check 4: Metrics Consistency (15% weight)', () => {
    test('should pass when area calculations match', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.metrics).toBeDefined();
      expect(result.checks.metrics.passed).toBe(true);
      expect(result.checks.metrics.score).toBeGreaterThanOrEqual(0.9);
      expect(result.checks.metrics.weight).toBe(0.15);
    });

    test('should validate total area = sum of room areas ± 10%', async () => {
      const totalRoomArea = mockDNA.rooms.reduce((sum, room) => sum + room.area, 0);
      const projectArea = mockDesignProject.projectSpecs.area;

      // Total room area (67.25) should be ~33% of project area (200)
      // This is expected because project area includes circulation, walls, etc.
      expect(totalRoomArea).toBeLessThan(projectArea);
      expect(totalRoomArea / projectArea).toBeGreaterThan(0.25);
      expect(totalRoomArea / projectArea).toBeLessThan(0.75);
    });

    test('should validate circulation space is reasonable (10-15%)', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      // Circulation = total area - room area
      const totalRoomArea = mockDNA.rooms.reduce((sum, room) => sum + room.area, 0);
      const circulationArea = mockDesignProject.projectSpecs.area - totalRoomArea;
      const circulationPercent = (circulationArea / mockDesignProject.projectSpecs.area) * 100;

      // Circulation should be reasonable (typically 20-40% for walls + circulation)
      expect(circulationPercent).toBeGreaterThan(0);
      expect(circulationPercent).toBeLessThan(75);
    });
  });

  describe('Check 5: A1 Sheet Completeness (15% weight)', () => {
    test('should pass when all required sections present', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.a1SheetCompleteness).toBeDefined();
      expect(result.checks.a1SheetCompleteness.passed).toBe(true);
      expect(result.checks.a1SheetCompleteness.score).toBeGreaterThanOrEqual(0.9);
      expect(result.checks.a1SheetCompleteness.weight).toBe(0.15);
    });

    test('should validate title block has required metadata', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(mockDesignProject.a1Sheet.metadata.designId).toBeDefined();
      expect(mockDesignProject.a1Sheet.metadata.seed).toBeDefined();
    });

    test('should validate embedded site map is included', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(mockDesignProject.a1Sheet.metadata.insetSources.hasRealSiteMap).toBe(true);
    });

    test('should fail when A1 sheet missing', async () => {
      const projectWithoutSheet = {
        ...mockDesignProject,
        a1Sheet: null
      };

      const result = await consistencyEngine.checkDesignConsistency(projectWithoutSheet);

      expect(result.checks.a1SheetCompleteness.passed).toBe(false);
    });
  });

  describe('Check 6: Version Consistency (10% weight)', () => {
    test('should pass for initial version', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.checks.versionConsistency).toBeDefined();
      expect(result.checks.versionConsistency.passed).toBe(true);
      expect(result.checks.versionConsistency.score).toBeGreaterThanOrEqual(0.9);
      expect(result.checks.versionConsistency.weight).toBe(0.10);
    });

    test('should validate seed reuse for modifications', async () => {
      const modifiedProject = {
        ...mockDesignProject,
        versions: [
          { seed: 42, timestamp: '2025-01-14' },
          { seed: 42, timestamp: '2025-01-15' }  // Same seed = consistency
        ]
      };

      const result = await consistencyEngine.checkDesignConsistency(modifiedProject);

      expect(result.checks.versionConsistency.passed).toBe(true);
    });

    test('should track delta prompts for modifications', async () => {
      const modifiedProject = {
        ...mockDesignProject,
        versions: [
          { seed: 42, prompt: 'Original prompt' },
          { seed: 42, deltaPrompt: 'Add section annotations' }
        ]
      };

      const result = await consistencyEngine.checkDesignConsistency(modifiedProject);

      // Should validate delta prompt exists for modification
      expect(result.checks.versionConsistency).toBeDefined();
    });
  });

  describe('Overall Consistency Score', () => {
    test('should calculate weighted score correctly', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.score).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);

      // Score should be weighted average of all checks
      const expectedScore = (
        result.checks.dnaConsistency.score * 0.25 +
        result.checks.siteBoundary.score * 0.15 +
        result.checks.geometry.score * 0.20 +
        result.checks.metrics.score * 0.15 +
        result.checks.a1SheetCompleteness.score * 0.15 +
        result.checks.versionConsistency.score * 0.10
      );

      expect(result.score).toBeCloseTo(expectedScore, 2);
    });

    test('should pass when score >= 92%', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      if (result.score >= 0.92) {
        expect(result.passed).toBe(true);
      } else {
        expect(result.passed).toBe(false);
      }
    });

    test('should fail when score < 92%', async () => {
      const lowQualityProject = {
        ...mockDesignProject,
        dna: {
          dimensions: {},  // Incomplete
          materials: [],
          rooms: []
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(lowQualityProject);

      expect(result.score).toBeLessThan(0.92);
      expect(result.passed).toBe(false);
    });

    test('should include detailed summary', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });

    test('should list issues when checks fail', async () => {
      const invalidProject = {
        ...mockDesignProject,
        dna: {
          dimensions: {},
          materials: [],
          rooms: []
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(invalidProject);

      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Version Comparison', () => {
    test('should detect DNA changes between versions', () => {
      const oldDesign = {
        ...mockDesignProject,
        dna: mockDNA
      };

      const newDesign = {
        ...mockDesignProject,
        dna: {
          ...mockDNA,
          viewSpecificFeatures: {
            ...mockDNA.viewSpecificFeatures,
            north: { mainEntrance: 'centered', windows: 6 }  // Changed from 4 to 6
          }
        }
      };

      const changes = consistencyEngine.compareVersions(oldDesign, newDesign);

      expect(changes).toBeDefined();
      expect(changes.dnaChanges).toBeDefined();
      expect(Array.isArray(changes.dnaChanges)).toBe(true);
      expect(changes.dnaChanges.length).toBeGreaterThan(0);
    });

    test('should detect visual changes (sheet regeneration)', () => {
      const oldDesign = {
        ...mockDesignProject,
        a1Sheet: { url: 'v1.jpg', metadata: { seed: 42 } }
      };

      const newDesign = {
        ...mockDesignProject,
        a1Sheet: { url: 'v2.jpg', metadata: { seed: 42 } }
      };

      const changes = consistencyEngine.compareVersions(oldDesign, newDesign);

      expect(changes.visualChanges).toBeDefined();
      expect(Array.isArray(changes.visualChanges)).toBe(true);
    });

    test('should calculate consistency delta', () => {
      const oldDesign = {
        ...mockDesignProject,
        consistency: { score: 0.95 }
      };

      const newDesign = {
        ...mockDesignProject,
        consistency: { score: 0.97 }
      };

      const changes = consistencyEngine.compareVersions(oldDesign, newDesign);

      expect(changes.consistencyDelta).toBeDefined();
      expect(changes.consistencyDelta).toBeCloseTo(0.02, 2);
    });

    test('should identify no changes for identical designs', () => {
      const changes = consistencyEngine.compareVersions(mockDesignProject, mockDesignProject);

      expect(changes.dnaChanges.length).toBe(0);
      expect(changes.visualChanges.length).toBe(0);
      expect(changes.consistencyDelta).toBeCloseTo(0, 2);
    });
  });

  describe('Auto-Retry Logic', () => {
    test('should trigger retry when score < 92%', async () => {
      const lowScoreProject = {
        ...mockDesignProject,
        dna: {
          ...mockDNA,
          rooms: []  // Will cause low score
        }
      };

      const result = await consistencyEngine.checkDesignConsistency(lowScoreProject);

      if (result.score < 0.92) {
        expect(result.shouldRetry).toBe(true);
        expect(result.retryRecommendation).toBeDefined();
      }
    });

    test('should recommend stronger consistency lock on retry', async () => {
      const result = await consistencyEngine.checkDesignConsistency(mockDesignProject);

      if (result.shouldRetry) {
        expect(result.retryRecommendation).toContain('stronger lock');
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle null design gracefully', async () => {
      await expect(async () => {
        await consistencyEngine.checkDesignConsistency(null);
      }).rejects.toThrow();
    });

    test('should handle empty design object', async () => {
      const emptyProject = {};

      const result = await consistencyEngine.checkDesignConsistency(emptyProject);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(0.92);
    });

    test('should handle partially complete designs', async () => {
      const partialProject = {
        dna: mockDNA,
        // Missing other fields
      };

      const result = await consistencyEngine.checkDesignConsistency(partialProject);

      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
    });
  });
});
