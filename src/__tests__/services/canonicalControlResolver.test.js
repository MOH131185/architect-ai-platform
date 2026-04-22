/**
 * Canonical Control Resolver Tests
 *
 * Verifies the resolver against the compiled-project canonical pack contract.
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
} from "../../services/canonical/CanonicalControlResolver.js";

const MOCK_DESIGN_FINGERPRINT = "fp_test_design_12345";

const createCompiledProjectPanel = (panelType, dataUrl) => ({
  dataUrl,
  url: dataUrl,
  path: `debug_runs/${MOCK_DESIGN_FINGERPRINT}/canonical/${panelType}.svg`,
  svgHash: `${panelType}_hash`,
  generatedAt: "2026-04-22T00:00:00.000Z",
  width: 1024,
  height: 1024,
  metadata: {
    source: "compiled_project",
    authoritySource: "compiled_project",
    panelType,
  },
});

const MOCK_CANONICAL_PACK = {
  designFingerprint: MOCK_DESIGN_FINGERPRINT,
  status: "COMPLETE",
  metadata: {
    source: "compiled_project",
    authoritySource: "compiled_project",
    compiledProjectSchemaVersion: "compiled-project-v1",
  },
  panels: {
    hero_3d: createCompiledProjectPanel(
      "hero_3d",
      "data:image/svg+xml;base64,aGVyb18zZF9jb250cm9s",
    ),
    interior_3d: createCompiledProjectPanel(
      "interior_3d",
      "data:image/svg+xml;base64,aW50ZXJpb3JfM2RfY29udHJvbA==",
    ),
    axonometric: createCompiledProjectPanel(
      "axonometric",
      "data:image/svg+xml;base64,YXhvbm9tZXRyaWNfY29udHJvbA==",
    ),
    floor_plan_ground: createCompiledProjectPanel(
      "floor_plan_ground",
      "data:image/svg+xml;base64,Zmxvb3JfcGxhbl9ncm91bmQ=",
    ),
    floor_plan_first: createCompiledProjectPanel(
      "floor_plan_first",
      "data:image/svg+xml;base64,Zmxvb3JfcGxhbl9maXJzdA==",
    ),
    elevation_north: createCompiledProjectPanel(
      "elevation_north",
      "data:image/svg+xml;base64,ZWxldmF0aW9uX25vcnRo",
    ),
    section_AA: createCompiledProjectPanel(
      "section_AA",
      "data:image/svg+xml;base64,c2VjdGlvbl9BQQ==",
    ),
  },
};

const MOCK_EMPTY_PACK = {
  designFingerprint: MOCK_DESIGN_FINGERPRINT,
  status: "COMPLETE",
  metadata: {
    source: "compiled_project",
    authoritySource: "compiled_project",
    compiledProjectSchemaVersion: "compiled-project-v1",
  },
  panels: {},
};

const MOCK_WRONG_FINGERPRINT_PACK = {
  ...MOCK_CANONICAL_PACK,
  designFingerprint: "fp_different_design_99999",
};

const MOCK_LEGACY_PACK = {
  designFingerprint: MOCK_DESIGN_FINGERPRINT,
  status: "COMPLETE",
  metadata: {
    source: "legacy_geometry_pack",
  },
  panels: {
    hero_3d: createCompiledProjectPanel(
      "hero_3d",
      "data:image/svg+xml;base64,bGVnYWN5X2hlcm8=",
    ),
  },
};

const MOCK_TRANSITION_PACK = {
  designFingerprint: MOCK_DESIGN_FINGERPRINT,
  status: "COMPLETE",
  metadata: {
    source: "compiled_project",
    authoritySource: "compiled_project",
    compiledProjectSchemaVersion: "compiled-project-v1",
  },
  panels: {
    canonical_floor_plan_ground: createCompiledProjectPanel(
      "canonical_floor_plan_ground",
      "data:image/svg+xml;base64,bGVnYWN5X2Zsb29yX3BsYW4=",
    ),
    canonical_elevation_north: createCompiledProjectPanel(
      "canonical_elevation_north",
      "data:image/svg+xml;base64,bGVnYWN5X2VsZXZhdGlvbg==",
    ),
    canonical_section_aa: createCompiledProjectPanel(
      "canonical_section_aa",
      "data:image/svg+xml;base64,bGVnYWN5X3NlY3Rpb24=",
    ),
  },
};

describe("requiresMandatoryCanonicalControl", () => {
  test("hero_3d requires mandatory canonical control", () => {
    expect(requiresMandatoryCanonicalControl("hero_3d")).toBe(true);
  });

  test("interior_3d requires mandatory canonical control", () => {
    expect(requiresMandatoryCanonicalControl("interior_3d")).toBe(true);
  });

  test("elevation_north does not require mandatory canonical control", () => {
    expect(requiresMandatoryCanonicalControl("elevation_north")).toBe(false);
  });

  test("MANDATORY_CANONICAL_CONTROL_PANELS lists both 3D mandatory panels", () => {
    expect(MANDATORY_CANONICAL_CONTROL_PANELS).toEqual([
      "hero_3d",
      "interior_3d",
    ]);
  });
});

describe("resolveControlImage", () => {
  test("resolves hero_3d to the compiled-project hero_3d panel", () => {
    const result = resolveControlImage(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result).not.toBeNull();
    expect(result.panelType).toBe("hero_3d");
    expect(result.canonicalPanelType).toBe("hero_3d");
    expect(result.requestedCanonicalPanelType).toBe("hero_3d");
    expect(result.controlSource).toBe("canonical");
    expect(result.isCanonical).toBe(true);
    expect(result.verifiedFingerprint).toBe(true);
  });

  test("resolves interior_3d to the compiled-project interior_3d panel", () => {
    const result = resolveControlImage(
      "interior_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result).not.toBeNull();
    expect(result.panelType).toBe("interior_3d");
    expect(result.canonicalPanelType).toBe("interior_3d");
    expect(result.requestedCanonicalPanelType).toBe("interior_3d");
  });

  test("resolves floor_plan_ground to the direct compiled-project plan key", () => {
    const result = resolveControlImage(
      "floor_plan_ground",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result).not.toBeNull();
    expect(result.canonicalPanelType).toBe("floor_plan_ground");
  });

  test("supports current floor_plan_level2 authority for floor_plan_second callers", () => {
    const pack = {
      ...MOCK_CANONICAL_PACK,
      panels: {
        floor_plan_level2: createCompiledProjectPanel(
          "floor_plan_level2",
          "data:image/svg+xml;base64,bGV2ZWwyX3BsYW4=",
        ),
      },
    };

    const result = resolveControlImage(
      "floor_plan_second",
      pack,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result).not.toBeNull();
    expect(result.canonicalPanelType).toBe("floor_plan_level2");
    expect(result.requestedCanonicalPanelType).toBe("floor_plan_level2");
  });

  test("falls back to legacy 2D aliases for compiled-project transition packs", () => {
    const result = resolveControlImage(
      "elevation_north",
      MOCK_TRANSITION_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result).not.toBeNull();
    expect(result.canonicalPanelType).toBe("canonical_elevation_north");
    expect(result.requestedCanonicalPanelType).toBe("elevation_north");
  });

  test("does not fall back hero_3d to removed 2D massing aliases", () => {
    const pack = {
      ...MOCK_TRANSITION_PACK,
      panels: {
        canonical_massing_3d: createCompiledProjectPanel(
          "canonical_massing_3d",
          "data:image/svg+xml;base64,b2xkX21hc3Npbmc=",
        ),
      },
    };

    const result = resolveControlImage(
      "hero_3d",
      pack,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result).toBeNull();
  });

  test("returns null for missing canonical pack", () => {
    expect(
      resolveControlImage("hero_3d", null, MOCK_DESIGN_FINGERPRINT),
    ).toBeNull();
  });

  test("returns null for empty canonical pack", () => {
    expect(
      resolveControlImage("hero_3d", MOCK_EMPTY_PACK, MOCK_DESIGN_FINGERPRINT),
    ).toBeNull();
  });

  test("returns null for fingerprint mismatch", () => {
    expect(
      resolveControlImage(
        "hero_3d",
        MOCK_WRONG_FINGERPRINT_PACK,
        MOCK_DESIGN_FINGERPRINT,
      ),
    ).toBeNull();
  });

  test("returns null for legacy packs that are not compiled-project based", () => {
    expect(
      resolveControlImage("hero_3d", MOCK_LEGACY_PACK, MOCK_DESIGN_FINGERPRINT),
    ).toBeNull();
  });

  test("includes control image metadata in the resolved payload", () => {
    const result = resolveControlImage(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result.controlImagePath).toContain("hero_3d");
    expect(result.controlImageSha256).toMatch(/^sha256_[0-9a-f]+$/);
    expect(result.canonicalFingerprint).toMatch(/^canon_[0-9a-f]+$/);
  });
});

describe("assertCanonicalControl", () => {
  test("throws for hero_3d without canonical control in strict mode", () => {
    expect(() => {
      assertCanonicalControl(
        "hero_3d",
        MOCK_EMPTY_PACK,
        MOCK_DESIGN_FINGERPRINT,
        { strictMode: true },
      );
    }).toThrow(/Cannot generate hero_3d without canonical control image/);
  });

  test("throws for interior_3d without canonical control in strict mode", () => {
    expect(() => {
      assertCanonicalControl("interior_3d", null, MOCK_DESIGN_FINGERPRINT, {
        strictMode: true,
      });
    }).toThrow(/Cannot generate interior_3d without canonical control image/);
  });

  test("does not throw for non-mandatory panels without canonical control", () => {
    expect(() => {
      assertCanonicalControl(
        "elevation_north",
        MOCK_EMPTY_PACK,
        MOCK_DESIGN_FINGERPRINT,
        { strictMode: true },
      );
    }).not.toThrow();
  });

  test("returns resolved control for hero_3d with a valid compiled-project pack", () => {
    const result = assertCanonicalControl(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
      { strictMode: true },
    );

    expect(result).not.toBeNull();
    expect(result.isCanonical).toBe(true);
  });
});

describe("buildCanonicalInitParams", () => {
  test("builds hero_3d init params from the compiled-project hero control", () => {
    const params = buildCanonicalInitParams(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(params).not.toBeNull();
    expect(params.init_image).toBe(MOCK_CANONICAL_PACK.panels.hero_3d.dataUrl);
    expect(params.strength).toBe(0.65);
  });

  test("builds interior_3d init params from the compiled-project interior control", () => {
    const params = buildCanonicalInitParams(
      "interior_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(params).not.toBeNull();
    expect(params.init_image).toBe(
      MOCK_CANONICAL_PACK.panels.interior_3d.dataUrl,
    );
    expect(params.strength).toBe(0.6);
  });

  test("uses tight technical control strengths for compiled technical panels", () => {
    const level2Pack = {
      ...MOCK_CANONICAL_PACK,
      panels: {
        floor_plan_level2: createCompiledProjectPanel(
          "floor_plan_level2",
          "data:image/svg+xml;base64,bGV2ZWwyX2luaXQ=",
        ),
      },
    };

    const params = buildCanonicalInitParams(
      "floor_plan_second",
      level2Pack,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(params.strength).toBe(0.15);
    expect(params._canonicalControl.canonicalPanelType).toBe(
      "floor_plan_level2",
    );
  });

  test("includes canonical debug metadata", () => {
    const params = buildCanonicalInitParams(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(params._canonicalControl).toMatchObject({
      controlSource: "canonical",
      designFingerprint: MOCK_DESIGN_FINGERPRINT,
      panelType: "hero_3d",
      canonicalPanelType: "hero_3d",
      verified: true,
    });
    expect(params._canonicalControl.controlImagePath).toContain("hero_3d");
    expect(params._canonicalControl.controlImageSha256).toMatch(
      /^sha256_[0-9a-f]+$/,
    );
    expect(params._canonicalControl.canonicalFingerprint).toMatch(
      /^canon_[0-9a-f]+$/,
    );
  });
});

describe("validateInitImageIsCanonical", () => {
  test("accepts a matching hero_3d control image", () => {
    const canonicalUrl = MOCK_CANONICAL_PACK.panels.hero_3d.dataUrl;
    const result = validateInitImageIsCanonical(
      "hero_3d",
      canonicalUrl,
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result.valid).toBe(true);
    expect(result.controlSource).toBe("canonical");
    expect(result.reason).toBe("HASH_MATCH");
  });

  test("rejects a non-matching hero_3d control image", () => {
    const result = validateInitImageIsCanonical(
      "hero_3d",
      "data:image/svg+xml;base64,ZGlmZmVyZW50",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result.valid).toBe(false);
    expect(result.controlSource).toBe("non_canonical");
    expect(result.reason).toBe("HASH_MISMATCH");
  });

  test("reports non-mandatory status for elevation panels", () => {
    const result = validateInitImageIsCanonical(
      "elevation_north",
      "any",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(result.isMandatory).toBe(false);
  });
});

describe("hash helpers", () => {
  test("computeControlImageHash is stable for identical content", () => {
    expect(computeControlImageHash("test content")).toBe(
      computeControlImageHash("test content"),
    );
  });

  test("computeCanonicalFingerprint is stable for identical inputs", () => {
    expect(
      computeCanonicalFingerprint("fp_design", "hero_3d", "sha256_123"),
    ).toBe(computeCanonicalFingerprint("fp_design", "hero_3d", "sha256_123"));
  });
});

describe("extractDebugReportFields", () => {
  test("extracts canonical debug fields from a resolved control", () => {
    const resolved = resolveControlImage(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );
    const fields = extractDebugReportFields(resolved);

    expect(fields.controlImagePath).toContain("hero_3d");
    expect(fields.controlImageSha256).toMatch(/^sha256_[0-9a-f]+$/);
    expect(fields.canonicalFingerprint).toMatch(/^canon_[0-9a-f]+$/);
    expect(fields.controlSource).toBe("canonical");
    expect(fields.isCanonical).toBe(true);
    expect(fields.verified).toBe(true);
  });
});

describe("PANEL_TO_CANONICAL_MAP", () => {
  test("maps hero_3d to the direct compiled-project hero key", () => {
    expect(PANEL_TO_CANONICAL_MAP.hero_3d).toBe("hero_3d");
  });

  test("maps interior_3d to the direct compiled-project interior key", () => {
    expect(PANEL_TO_CANONICAL_MAP.interior_3d).toBe("interior_3d");
  });

  test("maps floor_plan_ground to the direct compiled-project plan key", () => {
    expect(PANEL_TO_CANONICAL_MAP.floor_plan_ground).toBe("floor_plan_ground");
  });

  test("maps floor_plan_second callers to the level2 compiled-project key", () => {
    expect(PANEL_TO_CANONICAL_MAP.floor_plan_second).toBe("floor_plan_level2");
  });

  test("maps elevation_north to the direct compiled-project elevation key", () => {
    expect(PANEL_TO_CANONICAL_MAP.elevation_north).toBe("elevation_north");
  });
});

describe("acceptance criteria", () => {
  test("hero_3d resolves as canonical against the compiled-project pack", () => {
    const resolved = resolveControlImage(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(resolved.controlSource).toBe("canonical");
    expect(resolved.canonicalPanelType).toBe("hero_3d");
  });

  test("interior_3d resolves as canonical against the compiled-project pack", () => {
    const resolved = resolveControlImage(
      "interior_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );

    expect(resolved.controlSource).toBe("canonical");
    expect(resolved.canonicalPanelType).toBe("interior_3d");
  });

  test("sha256 matches the compiled-project hero control payload", () => {
    const resolved = resolveControlImage(
      "hero_3d",
      MOCK_CANONICAL_PACK,
      MOCK_DESIGN_FINGERPRINT,
    );
    const expectedHash = computeControlImageHash(
      MOCK_CANONICAL_PACK.panels.hero_3d.dataUrl,
    );

    expect(resolved.controlImageSha256).toBe(expectedHash);
  });

  test("generation is blocked for hero_3d without canonical control", () => {
    expect(() => {
      assertCanonicalControl("hero_3d", null, MOCK_DESIGN_FINGERPRINT, {
        strictMode: true,
      });
    }).toThrow();
  });

  test("generation is blocked for interior_3d without canonical control", () => {
    expect(() => {
      assertCanonicalControl(
        "interior_3d",
        MOCK_EMPTY_PACK,
        MOCK_DESIGN_FINGERPRINT,
        { strictMode: true },
      );
    }).toThrow();
  });
});
