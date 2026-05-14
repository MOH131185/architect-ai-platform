/**
 * Phase 4 — 2D/3D panel geometry + material consistency validator.
 *
 * Asserts the contract every consumer of the A1 export gate relies on:
 *
 *  - Every 2D and 3D panel must reference the same
 *    `compiledProject.geometryHash`. 3D mismatches are blockers; 2D
 *    panels missing the hash are warnings (deterministic SVGs aren't
 *    always stamped, but mismatches must still block).
 *
 *  - Every 3D panel must carry `visualManifestHash`, a
 *    `materialPaletteHash`, and camera/view metadata. Missing manifest
 *    hash is a blocker; missing palette hash or camera/view is a
 *    warning (the renderer doesn't always stamp them, but explicit
 *    mismatches against the active manifest/palette ARE blockers).
 *
 *  - Domain-level agreement between `visualManifest` and
 *    `compiledProject`/`materialPalette` for floor count, roof type,
 *    entrance orientation, opening count, and primary facade material.
 *
 * Silent pass when no Phase 4 inputs are supplied so legacy call sites
 * keep their previous gate result.
 */

import runPanelGeometryConsistencyChecks, {
  PANEL_CONSISTENCY_CODES,
  PANEL_TYPES_3D,
  PHASE_4_PANEL_CONSISTENCY_VERSION,
} from "../../../services/validation/panelGeometryConsistencyChecks.js";

const GEOMETRY_HASH = "geom-consistent-abc";
const VISUAL_MANIFEST_HASH = "mfst-hash-123";
const MATERIAL_PALETTE_HASH = "palette-hash-xyz";

function freshCompiledProject({
  geometryHash = GEOMETRY_HASH,
  levels = 2,
  roof = "gable",
  entrance = "south",
  openings = 8,
} = {}) {
  return {
    geometryHash,
    levels: new Array(levels).fill({}),
    openings: new Array(openings).fill({}),
    roof: { form: roof },
    entranceOrientation: entrance,
  };
}

function freshVisualManifest({
  manifestHash = VISUAL_MANIFEST_HASH,
  geometryHash = GEOMETRY_HASH,
  storeyCount = 2,
  roof = "gable",
  entrance = "south",
  primary = "brick",
  fingerprint = [4, 4],
} = {}) {
  return {
    manifestHash,
    geometryHash,
    storeyCount,
    roof: { form: roof },
    entranceOrientation: entrance,
    primaryFacadeMaterial: { name: primary },
    windowRhythmFingerprint: fingerprint,
  };
}

function freshMaterialPalette({
  hash = MATERIAL_PALETTE_HASH,
  primary = "brick",
} = {}) {
  return { hash, primary: { name: primary } };
}

function panel3D(overrides = {}) {
  return {
    panel_type: "hero_3d",
    geometryHash: GEOMETRY_HASH,
    visualManifestHash: VISUAL_MANIFEST_HASH,
    materialPaletteHash: MATERIAL_PALETTE_HASH,
    cameraId: "cam-hero-01",
    viewDirection: "south-west",
    ...overrides,
  };
}

function panel2D(overrides = {}) {
  return {
    panel_type: "floor_plan_ground",
    geometryHash: GEOMETRY_HASH,
    ...overrides,
  };
}

describe("runPanelGeometryConsistencyChecks — happy path", () => {
  test("returns pass when every panel + manifest + palette agree", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [
        panel3D({ panel_type: "hero_3d" }),
        panel3D({ panel_type: "interior_3d" }),
        panel3D({ panel_type: "exterior_render" }),
        panel3D({ panel_type: "axonometric" }),
        panel2D({ panel_type: "floor_plan_ground" }),
        panel2D({ panel_type: "elevation_north" }),
        panel2D({ panel_type: "section_AA" }),
      ],
    });
    expect(result.evaluated).toBe(true);
    expect(result.status).toBe("pass");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.codes).toEqual([]);
    expect(result.version).toBe(PHASE_4_PANEL_CONSISTENCY_VERSION);
  });

  test("returns silent pass when no inputs are supplied", () => {
    const result = runPanelGeometryConsistencyChecks({});
    expect(result.evaluated).toBe(false);
    expect(result.status).toBe("pass");
    expect(result.blockers).toEqual([]);
  });
});

describe("runPanelGeometryConsistencyChecks — geometry-hash gate", () => {
  test("blocks when a 3D panel uses a stale geometryHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [
        panel3D({ panel_type: "hero_3d", geometryHash: "stale-geom-xyz" }),
        panel2D({ panel_type: "floor_plan_ground" }),
      ],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
    );
    expect(result.blockers.some((m) => m.includes("hero_3d"))).toBe(true);
    expect(result.mismatches.geometryHash).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          panelType: "hero_3d",
          severity: "blocker",
          actual: "stale-geom-xyz",
          expected: GEOMETRY_HASH,
        }),
      ]),
    );
  });

  test("blocks when a 3D panel has no geometryHash at all", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D({ panel_type: "hero_3d", geometryHash: null })],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISSING,
    );
  });

  test("warns (not blocks) when a 2D panel has no geometryHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [
        panel2D({ panel_type: "floor_plan_ground", geometryHash: null }),
      ],
    });
    // 2D missing-hash is a warning. Stale match for the 3D would block.
    expect(result.blockers).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.status).toBe("warning");
  });

  test("blocks when a 2D panel carries a mismatched geometryHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [
        panel2D({
          panel_type: "elevation_south",
          geometryHash: "wrong-geom",
        }),
      ],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
    );
  });

  test("falls back to visualManifest.geometryHash when compiledProject is absent", () => {
    const result = runPanelGeometryConsistencyChecks({
      visualManifest: freshVisualManifest({ geometryHash: GEOMETRY_HASH }),
      panels: [panel3D({ geometryHash: "stale-geom" })],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
    );
  });
});

describe("runPanelGeometryConsistencyChecks — visual-manifest + palette gate", () => {
  test("blocks when a 3D panel is missing visualManifestHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D({ visualManifestHash: null })],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.VISUAL_MANIFEST_HASH_MISSING,
    );
  });

  test("blocks when a 3D panel has a mismatched visualManifestHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D({ visualManifestHash: "wrong-mfst" })],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.VISUAL_MANIFEST_HASH_MISMATCH,
    );
  });

  test("warns when a 3D panel is missing materialPaletteHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D({ materialPaletteHash: null })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.MATERIAL_PALETTE_HASH_MISSING,
    );
    expect(result.status).toBe("warning");
  });

  test("blocks when a 3D panel has a mismatched materialPaletteHash", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D({ materialPaletteHash: "wrong-palette" })],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.MATERIAL_PALETTE_HASH_MISMATCH,
    );
  });

  test("warns when a 3D panel has no cameraId / viewDirection", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D({ cameraId: null, viewDirection: null, metadata: {} })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.CAMERA_VIEW_METADATA_MISSING,
    );
  });

  test("accepts metadata-nested cameraId / viewDirection", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [
        panel3D({
          cameraId: null,
          viewDirection: null,
          metadata: { cameraId: "cam-meta", viewDirection: "north" },
        }),
      ],
    });
    expect(result.codes).not.toContain(
      PANEL_CONSISTENCY_CODES.CAMERA_VIEW_METADATA_MISSING,
    );
  });
});

describe("runPanelGeometryConsistencyChecks — domain-level checks", () => {
  test("blocks when visualManifest storeyCount disagrees with compiledProject", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject({ levels: 2 }),
      visualManifest: freshVisualManifest({ storeyCount: 3 }),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D()],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.FLOOR_COUNT_MISMATCH,
    );
    expect(result.mismatches.floorCount).toEqual(
      expect.objectContaining({ manifest: 3, compiled: 2 }),
    );
  });

  test("blocks when visualManifest.roof.form differs from compiledProject", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject({ roof: "flat" }),
      visualManifest: freshVisualManifest({ roof: "gable" }),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D()],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(PANEL_CONSISTENCY_CODES.ROOF_TYPE_MISMATCH);
  });

  test("warns on entrance orientation mismatch (contextual, not a blocker)", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject({ entrance: "north" }),
      visualManifest: freshVisualManifest({ entrance: "south" }),
      materialPalette: freshMaterialPalette(),
      panels: [panel3D()],
    });
    expect(result.blockers).toEqual([]);
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.ENTRANCE_ORIENTATION_MISMATCH,
    );
    expect(result.status).toBe("warning");
  });

  test("warns on primary facade material mismatch", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest({ primary: "render" }),
      materialPalette: freshMaterialPalette({ primary: "brick" }),
      panels: [panel3D()],
    });
    expect(result.blockers).toEqual([]);
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PRIMARY_FACADE_MATERIAL_MISMATCH,
    );
    expect(result.status).toBe("warning");
  });

  test("warns on opening count mismatch (rhythm fingerprint sum)", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject({ openings: 8 }),
      visualManifest: freshVisualManifest({ fingerprint: [3, 3] }), // sum=6
      materialPalette: freshMaterialPalette(),
      panels: [panel3D()],
    });
    expect(result.blockers).toEqual([]);
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.OPENING_COUNT_MISMATCH,
    );
    expect(result.mismatches.openingCount).toEqual(
      expect.objectContaining({ manifest: 6, compiled: 8 }),
    );
  });

  test("PANEL_TYPES_3D covers the four canonical 3D panel keys", () => {
    expect([...PANEL_TYPES_3D].sort()).toEqual(
      ["axonometric", "exterior_render", "hero_3d", "interior_3d"].sort(),
    );
  });
});

describe("runPanelGeometryConsistencyChecks — drawings input", () => {
  test("treats every drawings.{plan,elevation,section} entry as a 2D panel", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      drawings: {
        plan: [{ panel_type: "floor_plan_ground", geometryHash: "wrong-geom" }],
        elevation: [
          { panel_type: "elevation_north", geometryHash: GEOMETRY_HASH },
        ],
        section: [{ panel_type: "section_AA", geometryHash: GEOMETRY_HASH }],
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
    );
    expect(
      result.mismatches.geometryHash.some(
        (m) => m.panelType === "floor_plan_ground",
      ),
    ).toBe(true);
  });
});

describe("runPanelGeometryConsistencyChecks — site_context is 2D authority", () => {
  // Pre-UI-smoke fix #5 — `site_context` is an active panel in the
  // ProjectGraph 2D set but pre-fix was not in PANEL_TYPE_2D_PREFIXES,
  // so the validator silently ignored its geometryHash. After the fix it
  // gets the standard 2D severity split: missing hash = warning,
  // mismatched hash = blocker.

  function siteContextPanel(overrides = {}) {
    return {
      panel_type: "site_context",
      geometryHash: GEOMETRY_HASH,
      ...overrides,
    };
  }

  test("site_context with matching geometryHash passes", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [siteContextPanel()],
    });
    expect(result.status).toBe("pass");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("site_context missing geometryHash warns (does not block)", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [siteContextPanel({ geometryHash: null })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.status).toBe("warning");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("site_context with mismatched geometryHash blocks", () => {
    const result = runPanelGeometryConsistencyChecks({
      compiledProject: freshCompiledProject(),
      visualManifest: freshVisualManifest(),
      materialPalette: freshMaterialPalette(),
      panels: [siteContextPanel({ geometryHash: "stale-site-context" })],
    });
    expect(result.status).toBe("blocked");
    expect(result.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
    );
    expect(
      result.mismatches.geometryHash.some(
        (m) => m.panelType === "site_context",
      ),
    ).toBe(true);
  });
});
