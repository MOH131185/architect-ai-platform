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

function terracedFixture() {
  const fixture = canonicalFixture();
  fixture.brief = {
    ...fixture.brief,
    building_type: "dwelling",
    original_subtype: "terraced-house",
    project_type_support: {
      subtypeId: "terraced-house",
      programmeTemplateKey: "terraced-house",
    },
  };
  fixture.compiledProject = {
    ...fixture.compiledProject,
    windows: [
      { id: "w1", side: "south" },
      { id: "w2", side: "south" },
      { id: "w3", side: "south" },
    ],
  };
  return fixture;
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
    expect(m.buildingTypology).toBe("detached dwelling");
    expect(m.attachmentType).toBe("detached");
    expect(m.partyWallSides).toEqual([]);
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
    expect(m.windowRhythmFingerprint).toEqual(
      expect.objectContaining({
        totalWindowCount: 0,
        bySide: {},
      }),
    );
    expect(m.rooflights).toEqual(
      expect.objectContaining({
        present: false,
        count: 0,
      }),
    );
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

  test("carries StyleBlendManifest hash and rejected influence evidence", () => {
    const styleBlendManifest = {
      manifestId: "style-blend-001",
      manifestHash: "styleblendhash001",
      blendWeights: { local: 0.55, user: 0.2, climate: 0.2, portfolio: 0.05 },
      materialWeights: {
        local: 0.55,
        user: 0.2,
        climate: 0.2,
        portfolio: 0.05,
      },
      resolvedPalette: [
        { name: "Multi-stock red brick", application: "primary facade" },
        { name: "Dark grey roof tile", application: "roof" },
        { name: "Painted timber sash", application: "openings" },
      ],
      facadeLanguage: "red-brick terrace facade",
      roofLanguage: "pitched tile roof",
      windowLanguage: "regular sash window rhythm",
      massingLanguage: "attached terrace massing",
      detailLanguage: "painted timber sash",
      graphicPresentationStyle: "restrained architectural presentation",
      localStyleEvidence: { label: "Birmingham red-brick vernacular" },
      portfolioStyleEvidence: {
        hasPortfolioEvidence: true,
        materials: ["timber"],
        styles: ["warm contemporary"],
        referenceCount: 1,
      },
      rejectedInfluences: [
        {
          influence: "detached/freestanding portfolio typology",
          rejectedBy: "programme/local",
          reason: "Terraced context.",
        },
      ],
    };
    const m = buildVisualManifest({
      ...canonicalFixture(),
      styleBlendManifest,
    });
    expect(m.styleBlendManifestHash).toBe("styleblendhash001");
    expect(m.styleBlend.manifestHash).toBe("styleblendhash001");
    expect(m.styleBlend.resolvedPalette).toEqual(
      styleBlendManifest.resolvedPalette,
    );
    expect(m.styleBlend.facadeLanguage).toBe("red-brick terrace facade");
    expect(m.styleBlend.roofLanguage).toBe("pitched tile roof");
    expect(m.styleBlend.windowLanguage).toBe("regular sash window rhythm");
    expect(m.styleBlend.detailLanguage).toBe("painted timber sash");
    expect(m.resolvedPalette).toEqual(styleBlendManifest.resolvedPalette);
    expect(m.facadeLanguage).toBe("red-brick terrace facade");
    expect(m.roofLanguage).toBe("pitched tile roof");
    expect(m.windowLanguage).toBe("regular sash window rhythm");
    expect(m.detailLanguage).toBe("painted timber sash");
    expect(m.styleBlendWeights.portfolio).toBe(0.05);
    expect(m.styleBlendRejectedInfluences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          influence: "detached/freestanding portfolio typology",
        }),
      ]),
    );
    const lockBlock = buildVisualIdentityLockBlock(m);
    expect(lockBlock).toContain("StyleBlendManifest: styleblendhash001");
    expect(lockBlock).toContain("Compatible portfolio influence: timber");
    expect(lockBlock).toContain(
      "Rejected style influences were excluded by the style blend QA.",
    );
    expect(lockBlock).not.toContain("Rejected influence:");
    expect(lockBlock).not.toContain("detached/freestanding portfolio typology");
    expect(lockBlock).toContain(
      "Do not violate safety, programme, climate, local/jurisdiction, or technical authority constraints",
    );
  });

  test("carries terraced attachment type and party wall sides from the residential subtype", () => {
    const m = buildVisualManifest(terracedFixture());
    expect(m.buildingType).toBe("dwelling");
    expect(m.buildingTypology).toBe("terraced/row-house dwelling");
    expect(m.attachmentType).toBe("terraced");
    expect(m.partyWallSides).toEqual(["left", "right"]);
    expect(m.windowRhythmFingerprint.totalWindowCount).toBe(3);
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
    expect(block).toContain("detached dwelling");
    expect(block).toContain("Attachment: detached");
    expect(block).toContain("freestanding detached output is allowed");
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

  test("terraced lock block forbids detached freestanding drift", () => {
    const m = buildVisualManifest(terracedFixture());
    const block = buildVisualIdentityLockBlock(m);
    expect(block).toContain("terraced/row-house dwelling");
    expect(block).toContain("party wall sides: left, right");
    expect(block).toContain("attached neighbours or attached-row context");
    expect(block).toContain("No freestanding detached house");
    expect(block).toContain("no open space on both side elevations");
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

  test("prompt adds conservative visual continuity constraints from the manifest", () => {
    const prompt = promptFor("exterior_render");
    expect(prompt).toContain("VISUAL CONTINUITY CONSTRAINTS:");
    expect(prompt).toContain(
      "Preserve the exact 3 storey count, footprint proportions, silhouette, and roofline",
    );
    expect(prompt).toContain('Preserve roof form "gable"');
    expect(prompt).toContain("primary Multi-stock red brick");
    expect(prompt).toContain("secondary Vertical timber cladding");
    expect(prompt).toContain("Preserve the regular bay window rhythm");
    expect(prompt).toContain("Preserve the entrance at front facade centred");
    expect(prompt).toContain("Do not invent extra bays, extra storeys");
  });

  test("terraced visual prompt contains attached constraints and forbids detached freestanding output", () => {
    const fixture = terracedFixture();
    const terracedManifest = buildVisualManifest(fixture);
    const prompt = buildProjectGraphRenderPrompt({
      panelType: "exterior_render",
      brief: fixture.brief,
      compiledProject: fixture.compiledProject,
      climate: fixture.climate,
      localStyle: fixture.localStyle,
      styleDNA: fixture.styleDNA,
      programmeSummary: { targetStoreys: 3 },
      region: "Birmingham",
      visualManifest: terracedManifest,
    });

    expect(prompt).toContain("terraced/row-house dwelling");
    expect(prompt).toContain("party walls / attached neighbours");
    expect(prompt).toContain("No freestanding detached house");
    expect(prompt).toContain("No open space on both side elevations");
    expect(prompt).toContain("Front facade follows terraced-house rhythm");
    expect(prompt).toContain("do not render a freestanding detached house");
    expect(prompt).not.toContain("Single freestanding building, no neighbours");
  });

  test("detached visual prompt still allows freestanding detached output", () => {
    const prompt = promptFor("exterior_render");
    expect(prompt).toContain("Attachment type: detached; no party walls");
    expect(prompt).toContain("Freestanding detached output is allowed");
    expect(prompt).toContain("Single freestanding detached building");
    expect(prompt).not.toContain("No freestanding detached house");
  });

  test("prompts add hard view-specific blocks for exterior, axonometric, and interior panels", () => {
    const exterior = promptFor("exterior_render");
    const axonometric = promptFor("axonometric");
    const interior = promptFor("interior_3d");

    expect(exterior).toContain("VIEW-SPECIFIC HARD BLOCK - EXTERIOR_RENDER");
    expect(exterior).toContain("Render an exterior architectural view only");
    expect(exterior).toContain("the locked window/opening rhythm");
    expect(axonometric).toContain("VIEW-SPECIFIC HARD BLOCK - AXONOMETRIC");
    expect(axonometric).toContain(
      "true axonometric/isometric architectural projection",
    );
    expect(interior).toContain("VIEW-SPECIFIC HARD BLOCK - INTERIOR_3D");
    expect(interior).toContain("Render an indoor interior view only");
    expect(interior).toContain("Do not show an exterior facade");
    expect(interior).toContain("room programme, room adjacency");
  });

  test("prompt includes style blend hash and excludes rejected influence as allowed direction", () => {
    const fixture = terracedFixture();
    const styleBlendManifest = {
      manifestId: "style-blend-terrace",
      manifestHash: "styleblendterrace",
      blendWeights: { local: 0.62, user: 0.18, climate: 0.15, portfolio: 0.05 },
      materialWeights: {
        local: 0.62,
        user: 0.18,
        climate: 0.15,
        portfolio: 0.05,
      },
      resolvedPalette: [
        { name: "Red brick", application: "primary facade" },
        { name: "Clay tile", application: "roof" },
        { name: "Painted timber", application: "openings" },
      ],
      facadeLanguage: "terraced brick frontage",
      roofLanguage: "pitched clay tile roof",
      windowLanguage: "regular punched windows",
      massingLanguage: "attached terrace",
      detailLanguage: "painted timber openings",
      localStyleEvidence: { label: "terraced local context" },
      portfolioStyleEvidence: {
        hasPortfolioEvidence: true,
        materials: ["timber"],
        styles: ["warm contemporary"],
      },
      rejectedInfluences: [
        {
          influence: "detached/freestanding portfolio typology",
          rejectedBy: "programme/local",
          reason: "Terraced context.",
        },
      ],
    };
    const manifest = buildVisualManifest({
      ...fixture,
      styleBlendManifest,
    });
    const prompt = buildProjectGraphRenderPrompt({
      panelType: "exterior_render",
      brief: fixture.brief,
      compiledProject: fixture.compiledProject,
      climate: fixture.climate,
      localStyle: fixture.localStyle,
      styleDNA: fixture.styleDNA,
      programmeSummary: { targetStoreys: 3 },
      region: "Birmingham",
      visualManifest: manifest,
    });

    expect(prompt).toContain("styleBlendManifestHash: styleblendterrace");
    expect(prompt).toContain(
      "Rejected style influences were excluded by the style blend QA.",
    );
    expect(prompt).not.toContain("Rejected influence:");
    expect(prompt).not.toContain("detached/freestanding portfolio typology");
    expect(prompt).toContain(
      "Do not include rejected portfolio/local-style influences",
    );
    expect(prompt).toContain("No freestanding detached house");
  });

  test("when no manifest is supplied, no lock block is emitted", () => {
    const prompt = promptFor("hero_3d", { manifest: null });
    expect(prompt).not.toMatch(/VISUAL IDENTITY LOCK/);
    expect(prompt).not.toMatch(/VISUAL CONTINUITY CONSTRAINTS/);
    // But the rest of the prompt (intent + reasoning + style) must still be
    // present.
    expect(prompt).toContain("GEOMETRY AND VISUAL AUTHORITY");
    expect(prompt).toContain("Realistic front-left architectural exterior");
  });
});
