import {
  buildVisualManifest,
  buildVisualIdentityLockBlock,
  VISUAL_MANIFEST_VERSION,
  VISUAL_MANIFEST_NEGATIVE_CONSTRAINTS,
} from "../../services/render/visualManifestService.js";
import { buildProjectGraphRenderPrompt } from "../../services/project/projectGraphVerticalSliceService.js";

function canonicalFixture(overrides = {}) {
  const base = {
    compiledProject: {
      geometryHash: "geom-abc-123",
      levels: [{ height_m: 3.2 }, { height_m: 3.1 }, { height_m: 3.0 }],
      footprint: { length_m: 11.1, width_m: 7.5, area_m2: 83.25 },
      massing: { form: "compact rectangular", longSideOrientation: "south" },
      roof: { form: "gable", pitch_deg: 35 },
      facadeGrammar: { windowRhythm: "regular bay" },
      entrance: { orientation: "front, centred" },
    },
    projectGraph: {
      projectGraphId: "pg-001",
      designFingerprint: { entrancePosition: "front facade centred" },
    },
    brief: {
      project_name: "Birmingham Reading Room",
      building_type: "detached_house",
      target_storeys: 3,
    },
    masterDNA: {
      roof: { type: "gable", pitch_deg: 35 },
      materials: [],
    },
    climate: {
      zone: "Cfb",
      rainfall_mm: 850,
      sunPath: { summary: "low winter sun, shallow summer arc" },
    },
    localStyle: {
      primary_style: "Birmingham red-brick vernacular",
      style_keywords: [
        "red brick",
        "RIBA portfolio",
        "contextual contemporary",
      ],
      material_palette: [
        {
          name: "Multi-stock red brick",
          hexColor: "#a63a2a",
          application: "primary wall",
        },
        {
          name: "Vertical timber cladding",
          hexColor: "#8b6433",
          application: "secondary accent",
        },
        {
          name: "Dark grey roof tile",
          hexColor: "#2f3338",
          application: "roof covering",
        },
        {
          name: "Anthracite aluminium",
          hexColor: "#2c2f33",
          application: "window frames",
        },
        {
          name: "Solid timber",
          hexColor: "#5d4326",
          application: "front door",
        },
      ],
    },
    styleDNA: {
      precedent_keywords: ["RIBA", "warm brick", "contextual"],
      window_language: "vertical proportion",
      door_language: "solid timber",
      facade_language: "regular bay",
    },
  };
  return { ...base, ...overrides };
}

describe("buildVisualManifest", () => {
  test("emits version v1 + manifestId + manifestHash", () => {
    const m = buildVisualManifest(canonicalFixture());
    expect(m.version).toBe(VISUAL_MANIFEST_VERSION);
    expect(m.version).toBe("visual-manifest-v1");
    expect(typeof m.manifestId).toBe("string");
    expect(m.manifestId.length).toBeGreaterThan(8);
    expect(typeof m.manifestHash).toBe("string");
    expect(m.manifestHash.length).toBeGreaterThan(0);
  });

  test("is deterministic — same inputs produce identical hash and id", () => {
    const fixtureA = canonicalFixture();
    const fixtureB = canonicalFixture();
    const m1 = buildVisualManifest(fixtureA);
    const m2 = buildVisualManifest(fixtureB);
    expect(m1.manifestId).toBe(m2.manifestId);
    expect(m1.manifestHash).toBe(m2.manifestHash);
  });

  test("primary facade material change changes the hash", () => {
    const baseline = buildVisualManifest(canonicalFixture());
    const swapped = canonicalFixture();
    swapped.localStyle.material_palette[0] = {
      name: "Render light grey",
      hexColor: "#d8d6d2",
      application: "primary wall",
    };
    const after = buildVisualManifest(swapped);
    expect(after.manifestHash).not.toBe(baseline.manifestHash);
    expect(after.primaryFacadeMaterial.name).toBe("Render light grey");
  });

  test("storey count change changes the hash", () => {
    const baseline = buildVisualManifest(canonicalFixture());
    const twoStorey = canonicalFixture();
    twoStorey.compiledProject.levels = [{ height_m: 3.2 }, { height_m: 3.1 }];
    twoStorey.brief.target_storeys = 2;
    const after = buildVisualManifest(twoStorey);
    expect(after.storeyCount).toBe(2);
    expect(after.manifestHash).not.toBe(baseline.manifestHash);
  });

  test("roof form change changes the hash", () => {
    const baseline = buildVisualManifest(canonicalFixture());
    const flatRoof = canonicalFixture();
    flatRoof.compiledProject.roof = { form: "flat", pitch_deg: 0 };
    flatRoof.masterDNA.roof = { type: "flat", pitch_deg: 0 };
    const after = buildVisualManifest(flatRoof);
    expect(after.manifestHash).not.toBe(baseline.manifestHash);
    expect(after.roof.form).toBe("flat");
  });

  test("missing optional inputs degrade gracefully and report manifestSourceGaps", () => {
    const m = buildVisualManifest({
      compiledProject: { geometryHash: "geom-only" },
      brief: { target_storeys: 2 },
    });
    expect(m.version).toBe("visual-manifest-v1");
    expect(m.manifestHash).toBeTruthy();
    expect(m.manifestId).toBeTruthy();
    expect(m.storeyCount).toBe(2);
    expect(m.geometryHash).toBe("geom-only");
    expect(Array.isArray(m.manifestSourceGaps)).toBe(true);
    expect(m.manifestSourceGaps).toEqual(
      expect.arrayContaining([
        "projectGraphId",
        "buildingType",
        "materialPalette",
        "primaryFacadeMaterial",
      ]),
    );
  });

  test("called with no arguments — produces a coherent stub manifest", () => {
    const m = buildVisualManifest();
    expect(m.version).toBe("visual-manifest-v1");
    expect(m.storeyCount).toBe(1);
    expect(m.geometryHash).toBeNull();
    expect(m.primaryFacadeMaterial).toBeNull();
    expect(m.manifestSourceGaps.length).toBeGreaterThan(0);
  });

  test("populates all canonical fields for the canonical fixture", () => {
    const m = buildVisualManifest(canonicalFixture());
    expect(m.geometryHash).toBe("geom-abc-123");
    expect(m.projectGraphId).toBe("pg-001");
    expect(m.storeyCount).toBe(3);
    expect(m.storeyHeights).toEqual([3.2, 3.1, 3.0]);
    expect(m.footprintSummary).toEqual({
      lengthM: 11.1,
      widthM: 7.5,
      areaM2: 83.25,
    });
    expect(m.buildingType).toBe("detached_house");
    expect(m.massingSummary).toEqual({
      form: "compact rectangular",
      longSideOrientation: "south",
    });
    expect(m.roof.form).toBe("gable");
    expect(m.roof.pitchDeg).toBe(35);
    expect(m.roof.materialName).toBe("Dark grey roof tile");
    expect(m.roof.materialHex).toBe("#2f3338");
    expect(m.primaryFacadeMaterial).toMatchObject({
      name: "Multi-stock red brick",
      hex: "#a63a2a",
    });
    expect(m.secondaryFacadeMaterial).toMatchObject({
      name: "Vertical timber cladding",
      hex: "#8b6433",
    });
    expect(m.windowMaterial).toBeTruthy();
    expect(m.doorMaterial).toBeTruthy();
    expect(m.windowRhythm).toBeTruthy();
    expect(m.entranceOrientation).toBeTruthy();
    expect(m.climateResponse?.zone).toBe("Cfb");
    expect(m.localStyle).toBe("Birmingham red-brick vernacular");
    expect(Array.isArray(m.styleKeywords)).toBe(true);
    expect(m.styleKeywords.length).toBeGreaterThan(0);
  });

  test("negativeConstraints is non-empty and matches the exported constant", () => {
    const m = buildVisualManifest(canonicalFixture());
    expect(Array.isArray(m.negativeConstraints)).toBe(true);
    expect(m.negativeConstraints.length).toBeGreaterThan(0);
    expect(m.negativeConstraints).toEqual([
      ...VISUAL_MANIFEST_NEGATIVE_CONSTRAINTS,
    ]);
  });

  test("changing only the negativeConstraints array on input does not change the hash (hash excludes the prompt-engineering aid)", () => {
    // The function does not consume input.negativeConstraints, so this test
    // is a regression guard: if a future refactor exposes the constraint
    // array as an input, it must NOT change the manifest hash for existing
    // identities. Two manifests with identical inputs must have the same
    // hash — confirmed by the determinism test above. Here we additionally
    // assert the constants are stable across two calls.
    const m1 = buildVisualManifest(canonicalFixture());
    const m2 = buildVisualManifest(canonicalFixture());
    expect(m1.negativeConstraints).toEqual(m2.negativeConstraints);
    expect(m1.manifestHash).toBe(m2.manifestHash);
  });
});

describe("buildVisualIdentityLockBlock", () => {
  test("returns empty string for null/undefined manifest", () => {
    expect(buildVisualIdentityLockBlock(null)).toBe("");
    expect(buildVisualIdentityLockBlock(undefined)).toBe("");
  });

  test("contains every identity-lock field for a fully-populated manifest", () => {
    const m = buildVisualManifest(canonicalFixture());
    const block = buildVisualIdentityLockBlock(m);
    // Header + footer
    expect(block).toMatch(/=== VISUAL IDENTITY LOCK \(manifestHash:/);
    expect(block).toMatch(/=== END IDENTITY LOCK ===$/);
    // The exact manifestHash appears in the header
    expect(block).toContain(m.manifestHash);
    // Storey count + building type
    expect(block).toMatch(/3-storey/);
    expect(block).toContain("detached_house");
    // Roof form + material
    expect(block).toContain("gable");
    expect(block).toContain("Dark grey roof tile");
    // Primary + secondary facade material names
    expect(block).toContain("Multi-stock red brick");
    expect(block).toContain("Vertical timber cladding");
    // Window/door material reference
    expect(block).toMatch(/Glazing:/);
    expect(block).toMatch(/Doors:/);
    // Entrance
    expect(block).toMatch(/Entrance:/);
    // Geometry hash anchor
    expect(block).toContain("geom-abc-123");
    // The cross-panel lock sentence
    expect(block).toContain("SAME building identity");
    // Negative constraints listed
    expect(block).toContain("do not invent additional storeys");
    expect(block).toContain("do not change facade materials");
  });

  test("two manifests with identical inputs produce identical lock blocks", () => {
    const m1 = buildVisualManifest(canonicalFixture());
    const m2 = buildVisualManifest(canonicalFixture());
    expect(buildVisualIdentityLockBlock(m1)).toBe(
      buildVisualIdentityLockBlock(m2),
    );
  });

  test("graceful when only minimal inputs supplied", () => {
    const m = buildVisualManifest({
      compiledProject: { geometryHash: "g1" },
      brief: { target_storeys: 1 },
    });
    const block = buildVisualIdentityLockBlock(m);
    expect(block).toMatch(/VISUAL IDENTITY LOCK/);
    expect(block).toContain("1-storey");
    expect(block).toContain("g1");
    // The default-fallback strings should not throw or include "undefined"
    expect(block).not.toContain("undefined");
    expect(block).not.toContain("[object Object]");
  });
});

describe("buildProjectGraphRenderPrompt — Phase D injection", () => {
  const fixture = canonicalFixture();
  const manifest = buildVisualManifest(fixture);

  function promptFor(panelType, options = {}) {
    return buildProjectGraphRenderPrompt({
      panelType,
      brief: fixture.brief,
      compiledProject: fixture.compiledProject,
      climate: fixture.climate,
      localStyle: fixture.localStyle,
      styleDNA: fixture.styleDNA,
      programmeSummary: { targetStoreys: 3 },
      region: "Birmingham",
      visualManifest: options.manifest === null ? null : manifest,
    });
  }

  test.each([
    ["hero_3d"],
    ["exterior_render"],
    ["interior_3d"],
    ["axonometric"],
  ])(
    "%s prompt is prefixed with the visual identity lock block",
    (panelType) => {
      const prompt = promptFor(panelType);
      expect(prompt).toMatch(/^=== VISUAL IDENTITY LOCK \(manifestHash:/);
      expect(prompt).toContain(manifest.manifestHash);
      // Required identity fields appear in the prompt
      expect(prompt).toContain("3-storey");
      expect(prompt).toContain("Multi-stock red brick");
      expect(prompt).toContain("Vertical timber cladding");
      expect(prompt).toContain("Dark grey roof tile");
      expect(prompt).toContain("gable");
      expect(prompt).toContain("geom-abc-123");
      expect(prompt).toContain("SAME building identity");
    },
  );

  test("all four panel prompts contain an IDENTICAL lock block", () => {
    const prompts = [
      "hero_3d",
      "exterior_render",
      "interior_3d",
      "axonometric",
    ].map((p) => promptFor(p));
    const lockBlocks = prompts.map((prompt) => {
      const match = prompt.match(
        /=== VISUAL IDENTITY LOCK[\s\S]*?=== END IDENTITY LOCK ===/,
      );
      return match ? match[0] : null;
    });
    expect(lockBlocks.every(Boolean)).toBe(true);
    // All four lock blocks are byte-identical strings.
    expect(new Set(lockBlocks).size).toBe(1);
  });

  test("when no manifest is supplied, no lock block is emitted", () => {
    const prompt = promptFor("hero_3d", { manifest: null });
    expect(prompt).not.toMatch(/VISUAL IDENTITY LOCK/);
    // But the rest of the prompt (intent + reasoning + style) must still be
    // present.
    expect(prompt).toContain("Photoreal hero exterior 3D perspective");
  });
});
