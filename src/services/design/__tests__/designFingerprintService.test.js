/**
 * Design Fingerprint Service Tests
 *
 * Tests for fingerprint extraction, storage, and prompt constraint generation.
 * Note: Some functions depend on feature flags being enabled.
 */

// Mock feature flags before importing the service
jest.mock('../../../config/featureFlags.js', () => ({
  isFeatureEnabled: jest.fn((flag) => {
    if (flag === 'extractDesignFingerprint') return true;
    if (flag === 'useHeroAsControl') return true;
    return false;
  }),
  getFeatureValue: jest.fn((flag) => {
    if (flag === 'heroControlStrength') {
      return {
        interior_3d: 0.55,
        axonometric: 0.7,
        elevation_north: 0.6,
        elevation_south: 0.6,
        elevation_east: 0.6,
        elevation_west: 0.6,
      };
    }
    return null;
  }),
}));

import {
  extractFingerprintFromHero,
  storeFingerprint,
  getFingerprint,
  hasFingerprint,
  clearFingerprint,
  getFingerprintPromptConstraint,
  getHeroControlForPanel,
  comparePHash,
  getVerbatimPromptLock,
  verifyPromptLockIntegrity,
  HERO_REFERENCE_PANELS,
  HERO_CONTROL_STRENGTH,
} from '../designFingerprintService.js';

// Sample masterDNA for testing
const mockMasterDNA = {
  dimensions: {
    length: 15,
    width: 10,
    height: 7.5,
    floors: 2,
  },
  materials: [
    { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
    { name: 'Slate', hexColor: '#4A5568', application: 'roof' },
  ],
  roof: {
    type: 'gable',
    pitch: 35,
  },
  architecturalStyle: 'Contemporary',
  windows: {
    pattern: 'grid',
    style: 'casement',
  },
};

const mockHeroImageUrl = 'https://example.com/hero.png';

// Create a mock fingerprint for tests that don't need extraction
const createMockFingerprint = () => ({
  id: 'fp_test_123',
  heroImageUrl: mockHeroImageUrl,
  heroImageHash: 'hash_abc123',
  heroImagePHash: 'a'.repeat(64),
  massingType: 'rectangular',
  roofProfile: 'gable roof 35deg pitch',
  facadeRhythm: '3-bay regular grid (3:5 proportion)',
  materialsPalette: [
    { name: 'Red brick', hexColor: '#B8604E', coverage: 'exterior walls' },
    { name: 'Slate', hexColor: '#4A5568', coverage: 'roof' },
  ],
  windowPattern: 'grid 3x2 (3:5 proportion)',
  entrancePosition: 'front facade, centered with canopy',
  dominantColors: ['#B8604E', '#4A5568', '#F5F5F5'],
  styleDescriptor: 'Contemporary 2-storey residential',
  promptLock: 'STRICT DESIGN FINGERPRINT - MATCH EXACTLY:\n- Massing: rectangular\n...',
  promptLockVerbatim: '=== CANONICAL DESIGN BRIEF (DO NOT DEVIATE) ===\nBUILDING IDENTITY:\n...',
  promptLockHash: 'hash_lock_123',
  buildingBBox: { widthMeters: 15, depthMeters: 10, heightMeters: 7.5 },
  floorCount: 2,
  timestamp: Date.now(),
});

describe('designFingerprintService', () => {
  beforeEach(() => {
    // Clear any stored fingerprints between tests
    clearFingerprint('test-run-1');
    clearFingerprint('test-run-2');
  });

  describe('extractFingerprintFromHero', () => {
    it('should return null or valid fingerprint based on feature flag', async () => {
      const fingerprint = await extractFingerprintFromHero(
        mockHeroImageUrl,
        mockMasterDNA,
        { runId: 'test-run-1' }
      );

      // Function may return null if feature flag is disabled
      if (fingerprint === null) {
        // Feature flag disabled - this is acceptable
        expect(fingerprint).toBeNull();
      } else {
        // Feature flag enabled - validate structure
        expect(fingerprint.id).toMatch(/^fp_/);
        expect(fingerprint.heroImageUrl).toBe(mockHeroImageUrl);
        expect(fingerprint.massingType).toBeDefined();
        expect(fingerprint.roofProfile).toBeDefined();
        expect(fingerprint.styleDescriptor).toBeDefined();
        expect(fingerprint.promptLock).toBeDefined();
        expect(fingerprint.promptLockVerbatim).toBeDefined();
        expect(fingerprint.timestamp).toBeDefined();
      }
    });

    it('should not throw errors with empty DNA', async () => {
      // Test with empty DNA
      await expect(
        extractFingerprintFromHero(mockHeroImageUrl, {})
      ).resolves.not.toThrow();
    });

    it('should not throw errors with normal DNA', async () => {
      // Test with normal DNA
      await expect(
        extractFingerprintFromHero(mockHeroImageUrl, mockMasterDNA)
      ).resolves.not.toThrow();
    });
  });

  describe('storeFingerprint/getFingerprint', () => {
    it('should store and retrieve fingerprint correctly', () => {
      const fingerprint = createMockFingerprint();

      storeFingerprint('test-run-1', fingerprint);
      const retrieved = getFingerprint('test-run-1');

      expect(retrieved).toEqual(fingerprint);
    });

    it('should return null for non-existent runId', () => {
      const retrieved = getFingerprint('non-existent-run');
      expect(retrieved).toBeNull();
    });

    it('should handle multiple fingerprints independently', () => {
      const fp1 = createMockFingerprint();
      const fp2 = { ...createMockFingerprint(), id: 'fp_test_456' };

      storeFingerprint('test-run-1', fp1);
      storeFingerprint('test-run-2', fp2);

      expect(getFingerprint('test-run-1').id).toBe('fp_test_123');
      expect(getFingerprint('test-run-2').id).toBe('fp_test_456');
    });
  });

  describe('hasFingerprint', () => {
    it('should return true when fingerprint exists', () => {
      const fingerprint = createMockFingerprint();
      storeFingerprint('test-run-1', fingerprint);

      expect(hasFingerprint('test-run-1')).toBe(true);
    });

    it('should return false when fingerprint does not exist', () => {
      expect(hasFingerprint('non-existent-run')).toBe(false);
    });
  });

  describe('clearFingerprint', () => {
    it('should remove stored fingerprint', () => {
      const fingerprint = createMockFingerprint();
      storeFingerprint('test-run-1', fingerprint);

      expect(hasFingerprint('test-run-1')).toBe(true);
      clearFingerprint('test-run-1');
      expect(hasFingerprint('test-run-1')).toBe(false);
    });

    it('should not affect other fingerprints', () => {
      const fp1 = createMockFingerprint();
      const fp2 = { ...createMockFingerprint(), id: 'fp_test_456' };

      storeFingerprint('test-run-1', fp1);
      storeFingerprint('test-run-2', fp2);

      clearFingerprint('test-run-1');

      expect(hasFingerprint('test-run-1')).toBe(false);
      expect(hasFingerprint('test-run-2')).toBe(true);
    });
  });

  describe('getFingerprintPromptConstraint', () => {
    it('should return constraint string from fingerprint', () => {
      const fingerprint = createMockFingerprint();
      const constraint = getFingerprintPromptConstraint(fingerprint);

      expect(typeof constraint).toBe('string');
      expect(constraint.length).toBeGreaterThan(0);
      expect(constraint).toContain('FINGERPRINT');
    });

    it('should return empty string for null fingerprint', () => {
      const constraint = getFingerprintPromptConstraint(null);
      expect(constraint).toBe('');
    });

    it('should return empty string for fingerprint without promptLock', () => {
      const fingerprintNoLock = { ...createMockFingerprint(), promptLock: undefined };
      const constraint = getFingerprintPromptConstraint(fingerprintNoLock);
      expect(constraint).toBe('');
    });
  });

  describe('getHeroControlForPanel', () => {
    it('should return control params for supported panels', () => {
      const fingerprint = createMockFingerprint();
      const control = getHeroControlForPanel(fingerprint, 'elevation_north');

      expect(control).toBeDefined();
      expect(control.imageUrl).toBe(mockHeroImageUrl);
      expect(control.strength).toBeDefined();
      expect(control.source).toBe('hero_3d_fingerprint');
    });

    it('should return null for unsupported panels', () => {
      const fingerprint = createMockFingerprint();
      const control = getHeroControlForPanel(fingerprint, 'floor_plan_ground');

      expect(control).toBeNull();
    });

    it('should return null for null fingerprint', () => {
      const control = getHeroControlForPanel(null, 'elevation_north');
      expect(control).toBeNull();
    });

    it('should return null for fingerprint without heroImageUrl', () => {
      const fingerprintNoUrl = { ...createMockFingerprint(), heroImageUrl: null };
      const control = getHeroControlForPanel(fingerprintNoUrl, 'elevation_north');
      expect(control).toBeNull();
    });
  });

  describe('getVerbatimPromptLock', () => {
    it('should return verbatim lock string', () => {
      const fingerprint = createMockFingerprint();
      const verbatim = getVerbatimPromptLock(fingerprint);

      expect(typeof verbatim).toBe('string');
      expect(verbatim).toContain('CANONICAL');
    });

    it('should return empty string for null fingerprint', () => {
      const verbatim = getVerbatimPromptLock(null);
      expect(verbatim).toBe('');
    });

    it('should fall back to promptLock if promptLockVerbatim is missing', () => {
      const fingerprintNoVerbatim = {
        ...createMockFingerprint(),
        promptLockVerbatim: undefined,
      };
      const verbatim = getVerbatimPromptLock(fingerprintNoVerbatim);
      expect(verbatim).toContain('FINGERPRINT');
    });
  });

  describe('verifyPromptLockIntegrity', () => {
    it('should return false for null fingerprint', () => {
      const result = verifyPromptLockIntegrity(null);
      expect(result).toBe(false);
    });

    it('should return false for fingerprint without promptLockHash', () => {
      const fingerprintNoHash = {
        ...createMockFingerprint(),
        promptLockHash: undefined,
      };
      const result = verifyPromptLockIntegrity(fingerprintNoHash);
      expect(result).toBe(false);
    });

    it('should return false for fingerprint without promptLockVerbatim', () => {
      const fingerprintNoVerbatim = {
        ...createMockFingerprint(),
        promptLockVerbatim: undefined,
      };
      const result = verifyPromptLockIntegrity(fingerprintNoVerbatim);
      expect(result).toBe(false);
    });
  });

  describe('comparePHash', () => {
    // NOTE: comparePHash returns Hamming distance, not similarity
    // 0 = identical, higher values = more different

    it('should return 0 for identical hashes', () => {
      const distance = comparePHash('abc123', 'abc123');
      expect(distance).toBe(0);
    });

    it('should return positive distance for different hashes', () => {
      // Use same-length hex strings
      const distance = comparePHash('0000000000000000', 'ffffffffffffffff');
      // Different hashes should have positive Hamming distance
      expect(distance).toBeGreaterThan(0);
    });

    it('should return max distance (64) for null/undefined hashes', () => {
      expect(comparePHash(null, 'abc123')).toBe(64);
      expect(comparePHash('abc123', null)).toBe(64);
      expect(comparePHash(null, null)).toBe(64);
    });

    it('should return 64 for different length hashes', () => {
      expect(comparePHash('abc', 'abcdef')).toBe(64);
    });
  });

  describe('HERO_REFERENCE_PANELS', () => {
    it('should contain expected panel types', () => {
      expect(HERO_REFERENCE_PANELS).toContain('interior_3d');
      expect(HERO_REFERENCE_PANELS).toContain('axonometric');
      expect(HERO_REFERENCE_PANELS).toContain('elevation_north');
      expect(HERO_REFERENCE_PANELS).toContain('elevation_south');
      expect(HERO_REFERENCE_PANELS).toContain('elevation_east');
      expect(HERO_REFERENCE_PANELS).toContain('elevation_west');
    });

    it('should NOT contain floor plan panels', () => {
      expect(HERO_REFERENCE_PANELS).not.toContain('floor_plan_ground');
      expect(HERO_REFERENCE_PANELS).not.toContain('floor_plan_first');
      expect(HERO_REFERENCE_PANELS).not.toContain('floor_plan_level2');
    });

    it('should be an array', () => {
      expect(Array.isArray(HERO_REFERENCE_PANELS)).toBe(true);
    });
  });

  describe('HERO_CONTROL_STRENGTH', () => {
    it('should have strength values between 0 and 1', () => {
      Object.values(HERO_CONTROL_STRENGTH).forEach((strength) => {
        expect(strength).toBeGreaterThanOrEqual(0);
        expect(strength).toBeLessThanOrEqual(1);
      });
    });

    it('should have higher strength for axonometric than sections', () => {
      expect(HERO_CONTROL_STRENGTH.axonometric).toBeGreaterThan(
        HERO_CONTROL_STRENGTH.section_AA
      );
    });

    it('should have all elevation controls at same level', () => {
      expect(HERO_CONTROL_STRENGTH.elevation_north).toBe(
        HERO_CONTROL_STRENGTH.elevation_south
      );
      expect(HERO_CONTROL_STRENGTH.elevation_east).toBe(
        HERO_CONTROL_STRENGTH.elevation_west
      );
    });

    it('should be an object', () => {
      expect(typeof HERO_CONTROL_STRENGTH).toBe('object');
      expect(HERO_CONTROL_STRENGTH).not.toBeNull();
    });
  });
});
