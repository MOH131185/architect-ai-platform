/**
 * Canonical Control Resolver Tests
 *
 * ACCEPTANCE CRITERIA:
 * 1. hero_3d and interior_3d panels show controlSource=canonical
 * 2. sha256 matches a file inside the canonical pack folder
 * 3. resolveControlImage returns null if no valid canonical control
 * 4. assertCanonicalControl throws for mandatory panels without control
 */

import {
  resolveControlImage,
  assertCanonicalControl,
  buildCanonicalInitParams,
  requiresMandatoryCanonicalControl,
  validateInitImageIsCanonical,
  computeControlImageHash,
  computeCanonicalFingerprint,
  extractDebugReportFields,
  MANDATORY_CANONICAL_CONTROL_PANELS,
  PANEL_TO_CANONICAL_MAP,
} from '../../services/canonical/CanonicalControlResolver.js';

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_DESIGN_FINGERPRINT = 'fp_test_design_12345';

const MOCK_CANONICAL_PACK = {
  designFingerprint: MOCK_DESIGN_FINGERPRINT,
  status: 'complete',
  panels: {
    canonical_massing_3d: {
      dataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0i...',
      url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0i...',
      path: 'debug_runs/fp_test_design_12345/canonical/canonical_massing_3d.svg',
      svgHash: 'abc123',
      generatedAt: '2025-01-01T00:00:00.000Z',
      width: 1024,
      height: 1024,
    },
    canonical_floor_plan_ground: {
      dataUrl: 'data:image/svg+xml;base64,Zmxvb3JfcGxhbl9ncm91bmQ=',
      url: 'data:image/svg+xml;base64,Zmxvb3JfcGxhbl9ncm91bmQ=',
      path: 'debug_runs/fp_test_design_12345/canonical/canonical_floor_plan_ground.svg',
      svgHash: 'floor123',
      width: 1024,
      height: 1024,
    },
    canonical_elevation_north: {
      dataUrl: 'data:image/svg+xml;base64,ZWxldmF0aW9uX25vcnRo',
      url: 'data:image/svg+xml;base64,ZWxldmF0aW9uX25vcnRo',
      path: 'debug_runs/fp_test_design_12345/canonical/canonical_elevation_north.svg',
      svgHash: 'elev123',
      width: 1024,
      height: 1024,
    },
  },
};

const MOCK_EMPTY_PACK = {
  designFingerprint: MOCK_DESIGN_FINGERPRINT,
  status: 'partial',
  panels: {},
};

const MOCK_WRONG_FINGERPRINT_PACK = {
  designFingerprint: 'fp_different_design_99999',
  status: 'complete',
  panels: {
    canonical_massing_3d: {
      dataUrl: 'data:image/svg+xml;base64,WRONG_DESIGN...',
    },
  },
};

// =============================================================================
// TESTS: requiresMandatoryCanonicalControl
// =============================================================================

describe('requiresMandatoryCanonicalControl', () => {
  test('hero_3d requires mandatory canonical control', () => {
    expect(requiresMandatoryCanonicalControl('hero_3d')).toBe(true);
  });

  test('interior_3d requires mandatory canonical control', () => {
    expect(requiresMandatoryCanonicalControl('interior_3d')).toBe(true);
  });

  test('elevation_north does NOT require mandatory canonical control', () => {
    expect(requiresMandatoryCanonicalControl('elevation_north')).toBe(false);
  });

  test('floor_plan_ground does NOT require mandatory canonical control', () => {
    expect(requiresMandatoryCanonicalControl('floor_plan_ground')).toBe(false);
  });

  test('site_diagram does NOT require mandatory canonical control', () => {
    expect(requiresMandatoryCanonicalControl('site_diagram')).toBe(false);
  });

  test('MANDATORY_CANONICAL_CONTROL_PANELS contains hero_3d and interior_3d', () => {
    expect(MANDATORY_CANONICAL_CONTROL_PANELS).toContain('hero_3d');
    expect(MANDATORY_CANONICAL_CONTROL_PANELS).toContain('interior_3d');
    expect(MANDATORY_CANONICAL_CONTROL_PANELS.length).toBe(2);
  });
});

// =============================================================================
// TESTS: resolveControlImage
// =============================================================================

describe('resolveControlImage', () => {
  test('resolves hero_3d to canonical_massing_3d', () => {
    const result = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);

    expect(result).not.toBeNull();
    expect(result.panelType).toBe('hero_3d');
    expect(result.canonicalPanelType).toBe('canonical_massing_3d');
    expect(result.controlSource).toBe('canonical');
    expect(result.isCanonical).toBe(true);
    expect(result.verifiedFingerprint).toBe(true);
  });

  test('resolves interior_3d to canonical_massing_3d', () => {
    const result = resolveControlImage('interior_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);

    expect(result).not.toBeNull();
    expect(result.panelType).toBe('interior_3d');
    expect(result.canonicalPanelType).toBe('canonical_massing_3d');
    expect(result.isCanonical).toBe(true);
  });

  test('returns null for missing canonical pack', () => {
    const result = resolveControlImage('hero_3d', null, MOCK_DESIGN_FINGERPRINT);
    expect(result).toBeNull();
  });

  test('returns null for empty canonical pack', () => {
    const result = resolveControlImage('hero_3d', MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT);
    expect(result).toBeNull();
  });

  test('returns null for fingerprint mismatch', () => {
    const result = resolveControlImage(
      'hero_3d',
      MOCK_WRONG_FINGERPRINT_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(result).toBeNull();
  });

  test('returns null for missing designFingerprint', () => {
    const result = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, null);
    expect(result).toBeNull();
  });

  test('returns null for panel type without canonical mapping', () => {
    const result = resolveControlImage(
      'unknown_panel',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(result).toBeNull();
  });

  test('includes controlImagePath in result', () => {
    const result = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);
    expect(result.controlImagePath).toBeTruthy();
    expect(result.controlImagePath).toContain('canonical_massing_3d');
  });

  test('includes controlImageSha256 in result', () => {
    const result = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);
    expect(result.controlImageSha256).toBeTruthy();
    expect(result.controlImageSha256).toMatch(/^sha256_[0-9a-f]+$/);
  });

  test('includes canonicalFingerprint in result', () => {
    const result = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);
    expect(result.canonicalFingerprint).toBeTruthy();
    expect(result.canonicalFingerprint).toMatch(/^canon_[0-9a-f]+$/);
  });
});

// =============================================================================
// TESTS: assertCanonicalControl
// =============================================================================

describe('assertCanonicalControl', () => {
  test('throws for hero_3d without canonical control (strict mode)', () => {
    expect(() => {
      assertCanonicalControl('hero_3d', MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT, {
        strictMode: true,
      });
    }).toThrow(/Cannot generate hero_3d without canonical control image/);
  });

  test('throws for interior_3d without canonical control (strict mode)', () => {
    expect(() => {
      assertCanonicalControl('interior_3d', null, MOCK_DESIGN_FINGERPRINT, { strictMode: true });
    }).toThrow(/Cannot generate interior_3d without canonical control image/);
  });

  test('does NOT throw for elevation_north without control (non-mandatory)', () => {
    expect(() => {
      assertCanonicalControl('elevation_north', MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT, {
        strictMode: true,
      });
    }).not.toThrow();
  });

  test('returns resolved control for hero_3d with valid pack', () => {
    const result = assertCanonicalControl('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT, {
      strictMode: true,
    });
    expect(result).not.toBeNull();
    expect(result.isCanonical).toBe(true);
  });

  test('returns null for mandatory panel without control (non-strict mode)', () => {
    const result = assertCanonicalControl('hero_3d', MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT, {
      strictMode: false,
    });
    expect(result).toBeNull();
  });
});

// =============================================================================
// TESTS: buildCanonicalInitParams
// =============================================================================

describe('buildCanonicalInitParams', () => {
  test('builds init_image params for hero_3d', () => {
    const params = buildCanonicalInitParams(
      'hero_3d',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );

    expect(params).not.toBeNull();
    expect(params.init_image).toBeTruthy();
    expect(params.strength).toBeGreaterThan(0);
    expect(params.strength).toBeLessThanOrEqual(1);
  });

  test('includes _canonicalControl metadata', () => {
    const params = buildCanonicalInitParams(
      'hero_3d',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );

    expect(params._canonicalControl).toBeTruthy();
    expect(params._canonicalControl.controlSource).toBe('canonical');
    expect(params._canonicalControl.controlImagePath).toBeTruthy();
    expect(params._canonicalControl.controlImageSha256).toBeTruthy();
    expect(params._canonicalControl.canonicalFingerprint).toBeTruthy();
    expect(params._canonicalControl.verified).toBe(true);
  });

  test('uses correct strength for hero_3d (0.65)', () => {
    const params = buildCanonicalInitParams(
      'hero_3d',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(params.strength).toBe(0.65);
  });

  test('uses correct strength for interior_3d (0.60)', () => {
    const params = buildCanonicalInitParams(
      'interior_3d',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(params.strength).toBe(0.6);
  });

  test('throws for mandatory panel without control (strict mode)', () => {
    expect(() => {
      buildCanonicalInitParams('hero_3d', MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT, {
        strictMode: true,
      });
    }).toThrow();
  });
});

// =============================================================================
// TESTS: validateInitImageIsCanonical
// =============================================================================

describe('validateInitImageIsCanonical', () => {
  test('validates matching init_image as canonical', () => {
    const canonicalUrl = MOCK_CANONICAL_PACK.panels.canonical_massing_3d.dataUrl;
    const result = validateInitImageIsCanonical(
      'hero_3d',
      canonicalUrl,
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );

    expect(result.valid).toBe(true);
    expect(result.controlSource).toBe('canonical');
    expect(result.reason).toBe('HASH_MATCH');
  });

  test('rejects non-matching init_image', () => {
    const nonCanonicalUrl = 'data:image/svg+xml;base64,DIFFERENT_CONTENT...';
    const result = validateInitImageIsCanonical(
      'hero_3d',
      nonCanonicalUrl,
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );

    expect(result.valid).toBe(false);
    expect(result.controlSource).toBe('non_canonical');
    expect(result.reason).toBe('HASH_MISMATCH');
  });

  test('reports isMandatory=true for hero_3d', () => {
    const result = validateInitImageIsCanonical(
      'hero_3d',
      'any',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(result.isMandatory).toBe(true);
  });

  test('reports isMandatory=false for elevation_north', () => {
    const result = validateInitImageIsCanonical(
      'elevation_north',
      'any',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(result.isMandatory).toBe(false);
  });
});

// =============================================================================
// TESTS: Hash Functions
// =============================================================================

describe('computeControlImageHash', () => {
  test('returns consistent hash for same content', () => {
    const hash1 = computeControlImageHash('test content');
    const hash2 = computeControlImageHash('test content');
    expect(hash1).toBe(hash2);
  });

  test('returns different hash for different content', () => {
    const hash1 = computeControlImageHash('content A');
    const hash2 = computeControlImageHash('content B');
    expect(hash1).not.toBe(hash2);
  });

  test('returns sha256_ prefixed hash', () => {
    const hash = computeControlImageHash('test');
    expect(hash).toMatch(/^sha256_[0-9a-f]+$/);
  });

  test('handles null content', () => {
    const hash = computeControlImageHash(null);
    expect(hash).toBe('null_content');
  });
});

describe('computeCanonicalFingerprint', () => {
  test('returns canon_ prefixed fingerprint', () => {
    const fp = computeCanonicalFingerprint('fp_design', 'hero_3d', 'sha256_123');
    expect(fp).toMatch(/^canon_[0-9a-f]+$/);
  });

  test('returns consistent fingerprint for same inputs', () => {
    const fp1 = computeCanonicalFingerprint('fp_design', 'hero_3d', 'sha256_123');
    const fp2 = computeCanonicalFingerprint('fp_design', 'hero_3d', 'sha256_123');
    expect(fp1).toBe(fp2);
  });

  test('returns different fingerprint for different inputs', () => {
    const fp1 = computeCanonicalFingerprint('fp_design_A', 'hero_3d', 'sha256_123');
    const fp2 = computeCanonicalFingerprint('fp_design_B', 'hero_3d', 'sha256_123');
    expect(fp1).not.toBe(fp2);
  });
});

// =============================================================================
// TESTS: extractDebugReportFields
// =============================================================================

describe('extractDebugReportFields', () => {
  test('extracts all required fields from resolved control', () => {
    const resolved = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);
    const fields = extractDebugReportFields(resolved);

    expect(fields.controlImagePath).toBeTruthy();
    expect(fields.controlImageSha256).toBeTruthy();
    expect(fields.canonicalFingerprint).toBeTruthy();
    expect(fields.controlSource).toBe('canonical');
    expect(fields.isCanonical).toBe(true);
    expect(fields.verified).toBe(true);
  });

  test('returns null fields for null resolved control', () => {
    const fields = extractDebugReportFields(null);

    expect(fields.controlImagePath).toBeNull();
    expect(fields.controlImageSha256).toBeNull();
    expect(fields.canonicalFingerprint).toBeNull();
    expect(fields.controlSource).toBe('none');
    expect(fields.isCanonical).toBe(false);
    expect(fields.verified).toBe(false);
  });
});

// =============================================================================
// TESTS: PANEL_TO_CANONICAL_MAP
// =============================================================================

describe('PANEL_TO_CANONICAL_MAP', () => {
  test('hero_3d maps to canonical_massing_3d', () => {
    expect(PANEL_TO_CANONICAL_MAP.hero_3d).toBe('canonical_massing_3d');
  });

  test('interior_3d maps to canonical_massing_3d', () => {
    expect(PANEL_TO_CANONICAL_MAP.interior_3d).toBe('canonical_massing_3d');
  });

  test('floor_plan_ground maps to canonical_floor_plan_ground', () => {
    expect(PANEL_TO_CANONICAL_MAP.floor_plan_ground).toBe('canonical_floor_plan_ground');
  });

  test('elevation_north maps to canonical_elevation_north', () => {
    expect(PANEL_TO_CANONICAL_MAP.elevation_north).toBe('canonical_elevation_north');
  });
});

// =============================================================================
// TESTS: Acceptance Criteria Integration
// =============================================================================

describe('Acceptance Criteria: hero_3d/interior_3d canonical control', () => {
  test('hero_3d shows controlSource=canonical when using canonical pack', () => {
    const resolved = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);
    expect(resolved.controlSource).toBe('canonical');
  });

  test('interior_3d shows controlSource=canonical when using canonical pack', () => {
    const resolved = resolveControlImage(
      'interior_3d',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );
    expect(resolved.controlSource).toBe('canonical');
  });

  test('sha256 in result matches computed hash of canonical pack content', () => {
    const resolved = resolveControlImage('hero_3d', MOCK_CANONICAL_PACK, MOCK_DESIGN_FINGERPRINT);
    const expectedHash = computeControlImageHash(
      MOCK_CANONICAL_PACK.panels.canonical_massing_3d.dataUrl
    );
    expect(resolved.controlImageSha256).toBe(expectedHash);
  });

  test('generation is BLOCKED for hero_3d without canonical control', () => {
    expect(() => {
      assertCanonicalControl('hero_3d', null, MOCK_DESIGN_FINGERPRINT, { strictMode: true });
    }).toThrow();
  });

  test('generation is BLOCKED for interior_3d without canonical control', () => {
    expect(() => {
      assertCanonicalControl('interior_3d', MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT, {
        strictMode: true,
      });
    }).toThrow();
  });

  test('DEBUG_REPORT fields are populated for canonical control', () => {
    const params = buildCanonicalInitParams(
      'hero_3d',
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT
    );

    // These fields MUST be in DEBUG_REPORT per acceptance criteria
    expect(params._canonicalControl.controlImagePath).toBeTruthy();
    expect(params._canonicalControl.controlImageSha256).toBeTruthy();
    expect(params._canonicalControl.canonicalFingerprint).toBeTruthy();
  });
});
