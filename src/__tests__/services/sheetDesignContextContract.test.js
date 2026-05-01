import {
  buildSheetDesignContext,
  assertSheetDesignContext,
  SHEET_DESIGN_CONTEXT_VERSION,
  SHEET_DESIGN_CONTEXT_KEYS,
} from "../../services/dnaPromptContext.js";
import { buildVisualManifest } from "../../services/render/visualManifestService.js";

function canonicalManifestInputs(overrides = {}) {
  const base = {
    compiledProject: {
      geometryHash: "geom-sdc-001",
      levels: [{ height_m: 3.2 }, { height_m: 3.0 }],
      footprint: { length_m: 10.8, width_m: 7.5, area_m2: 81 },
      massing: { form: "compact rectangular" },
      roof: { form: "gable", pitch_deg: 35 },
      facadeGrammar: { windowRhythm: "regular bay" },
      entrance: { orientation: "front, centred" },
    },
    projectGraph: {
      projectGraphId: "pg-sdc-001",
      designFingerprint: { entrancePosition: "front facade centred" },
    },
    brief: {
      project_name: "Phase 1 Fixture House",
      building_type: "detached_house",
      target_storeys: 2,
      project_graph_id: "pg-sdc-001",
    },
    masterDNA: {
      roof: { type: "gable", pitch_deg: 35 },
      materials: [],
      dimensions: { length: 10.8, width: 7.5 },
    },
    climate: {
      zone: "Cfb",
      rainfall_mm: 850,
      sunPath: { summary: "low winter sun, shallow summer arc" },
      overheating: false,
      strategy: "fabric-first with summer shading",
    },
    localStyle: {
      primary_style: "Birmingham red-brick vernacular",
      style_keywords: ["red brick", "contextual contemporary"],
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
      ],
      style_weights: { local: 0.4, portfolio: 0.15, climate: 0.2, user: 0.25 },
    },
    styleDNA: {
      precedent_keywords: ["RIBA", "warm brick"],
      window_language: "vertical proportion",
      door_language: "solid timber",
      facade_language: "regular bay",
      roof_language: "pitched gable",
      massing_language: "two-storey detached",
    },
    regulations: {
      partL: "Approved Document Part L 2021 — fabric performance",
      fabric_first: true,
      flags: ["overheating-check-recommended"],
    },
  };
  return { ...base, ...overrides };
}

function buildContextFromInputs(inputs, manifestOverrides = {}) {
  const visualManifest = buildVisualManifest({
    compiledProject: inputs.compiledProject,
    projectGraph: inputs.projectGraph,
    brief: inputs.brief,
    masterDNA: inputs.masterDNA,
    climate: inputs.climate,
    localStyle: inputs.localStyle,
    styleDNA: inputs.styleDNA,
    materialPalette: inputs.localStyle?.material_palette,
    ...manifestOverrides,
  });
  return buildSheetDesignContext({
    masterDNA: inputs.masterDNA,
    brief: inputs.brief,
    compiledProject: inputs.compiledProject,
    climate: inputs.climate,
    localStyle: inputs.localStyle,
    styleDNA: inputs.styleDNA,
    regulations: inputs.regulations,
    region: "UK",
    projectGraphId: inputs.projectGraph?.projectGraphId,
    visualManifest,
  });
}

describe("SheetDesignContext — Phase 1 contract", () => {
  test("returns a deep-frozen object stamped with the v1 version", () => {
    const ctx = buildContextFromInputs(canonicalManifestInputs());
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.style)).toBe(true);
    expect(Object.isFrozen(ctx.materials)).toBe(true);
    expect(Object.isFrozen(ctx.climate)).toBe(true);
    expect(ctx.version).toBe(SHEET_DESIGN_CONTEXT_VERSION);
    for (const key of SHEET_DESIGN_CONTEXT_KEYS) {
      expect(ctx).toHaveProperty(key);
    }
  });

  test("is deterministic — same inputs produce the same contextHash", () => {
    const inputsA = canonicalManifestInputs();
    const inputsB = canonicalManifestInputs();
    const ctxA = buildContextFromInputs(inputsA);
    const ctxB = buildContextFromInputs(inputsB);
    expect(ctxA.contextHash).toBe(ctxB.contextHash);
    expect(ctxA.materials.length).toBe(ctxB.materials.length);
    expect(ctxA.style.descriptor).toBe(ctxB.style.descriptor);
  });

  test("hash changes when geometryHash changes", () => {
    const baseline = canonicalManifestInputs();
    const drifted = canonicalManifestInputs({
      compiledProject: {
        ...baseline.compiledProject,
        geometryHash: "geom-sdc-002",
      },
    });
    const ctxA = buildContextFromInputs(baseline);
    const ctxB = buildContextFromInputs(drifted);
    expect(ctxA.contextHash).not.toBe(ctxB.contextHash);
    expect(ctxA.geometryHash).toBe("geom-sdc-001");
    expect(ctxB.geometryHash).toBe("geom-sdc-002");
  });

  test("hash changes when material palette changes", () => {
    const baseline = canonicalManifestInputs();
    const drifted = canonicalManifestInputs({
      localStyle: {
        ...baseline.localStyle,
        material_palette: [
          {
            name: "Concrete render",
            hexColor: "#dfdcd4",
            application: "primary wall",
          },
          ...baseline.localStyle.material_palette.slice(1),
        ],
      },
    });
    const ctxA = buildContextFromInputs(baseline);
    const ctxB = buildContextFromInputs(drifted);
    expect(ctxA.contextHash).not.toBe(ctxB.contextHash);
  });

  test("wraps the same visualManifest by reference and shares its hash", () => {
    const inputs = canonicalManifestInputs();
    const visualManifest = buildVisualManifest({
      compiledProject: inputs.compiledProject,
      projectGraph: inputs.projectGraph,
      brief: inputs.brief,
      masterDNA: inputs.masterDNA,
      climate: inputs.climate,
      localStyle: inputs.localStyle,
      styleDNA: inputs.styleDNA,
      materialPalette: inputs.localStyle.material_palette,
    });
    const ctx = buildSheetDesignContext({
      masterDNA: inputs.masterDNA,
      brief: inputs.brief,
      compiledProject: inputs.compiledProject,
      climate: inputs.climate,
      localStyle: inputs.localStyle,
      styleDNA: inputs.styleDNA,
      regulations: inputs.regulations,
      projectGraphId: inputs.projectGraph.projectGraphId,
      visualManifest,
    });
    expect(ctx.visualManifest).toBe(visualManifest);
    expect(ctx.geometryHash).toBe(visualManifest.geometryHash);
  });

  test("normalises materials with name + hex + application", () => {
    const ctx = buildContextFromInputs(canonicalManifestInputs());
    expect(Array.isArray(ctx.materials)).toBe(true);
    expect(ctx.materials.length).toBeGreaterThan(0);
    for (const mat of ctx.materials) {
      expect(typeof mat.name).toBe("string");
      expect(mat.name.length).toBeGreaterThan(0);
      expect(mat).toHaveProperty("hexColor");
      expect(mat).toHaveProperty("application");
    }
  });

  test("style descriptor stays meaningful even with sparse style inputs", () => {
    const ctx = buildSheetDesignContext({
      brief: { building_type: "detached_house" },
      compiledProject: { geometryHash: "h-1", levels: [{}] },
      visualManifest: buildVisualManifest({
        compiledProject: { geometryHash: "h-1", levels: [{}] },
        projectGraph: { projectGraphId: "p-1" },
        brief: { building_type: "detached_house", target_storeys: 1 },
      }),
    });
    expect(ctx.style.architecture).toBe("contemporary");
    expect(typeof ctx.style.descriptor).toBe("string");
  });

  test("propagates climate summary including overheating flag and strategy", () => {
    const ctx = buildContextFromInputs(canonicalManifestInputs());
    expect(ctx.climate).not.toBeNull();
    expect(ctx.climate.zone).toBe("Cfb");
    expect(ctx.climate.rainfallMm).toBe(850);
    expect(ctx.climate.overheating).toBe(false);
    expect(ctx.climate.strategy).toMatch(/fabric/i);
  });

  test("captures portfolio blend weights when localStyle exposes them", () => {
    const ctx = buildContextFromInputs(canonicalManifestInputs());
    expect(ctx.portfolioBlend).not.toBeNull();
    expect(ctx.portfolioBlend.localWeight).toBe(0.4);
    expect(ctx.portfolioBlend.portfolioWeight).toBe(0.15);
    expect(ctx.portfolioBlend.climateWeight).toBe(0.2);
    expect(ctx.portfolioBlend.userWeight).toBe(0.25);
  });

  test("frozen materials cannot be mutated by consumers", () => {
    const ctx = buildContextFromInputs(canonicalManifestInputs());
    expect(() => {
      ctx.materials.push({
        name: "Injected",
        hexColor: "#000",
        application: "x",
      });
    }).toThrow();
    expect(() => {
      ctx.materials[0].name = "Mutated";
    }).toThrow();
  });
});

describe("assertSheetDesignContext — warn-only Phase 1 behaviour", () => {
  test("returns ok:true with no gaps for a fully-populated context", () => {
    const ctx = buildContextFromInputs(canonicalManifestInputs());
    const report = assertSheetDesignContext(ctx);
    expect(report.ok).toBe(true);
    expect(report.gaps).toEqual([]);
    expect(report.frozen).toBe(true);
  });

  test("returns ok:false with structured gaps when the context is missing", () => {
    const report = assertSheetDesignContext(null);
    expect(report.ok).toBe(false);
    expect(report.gaps).toContain("context");
  });

  test("does not throw when required keys are missing in non-strict mode", () => {
    expect(() => assertSheetDesignContext({})).not.toThrow();
    const report = assertSheetDesignContext({});
    expect(report.ok).toBe(false);
    expect(report.gaps.length).toBeGreaterThan(0);
  });

  test("does throw when strict=true and required keys are missing", () => {
    expect(() => assertSheetDesignContext({}, { strict: true })).toThrow();
  });

  test("flags non-frozen contexts even when fields are present", () => {
    const fakeCtx = {
      version: SHEET_DESIGN_CONTEXT_VERSION,
      geometryHash: "h",
      materials: [{ name: "x", hexColor: "#000", application: "y" }],
      style: { architecture: "contemporary" },
      visualManifest: { manifestHash: "m" },
      contextHash: "c",
    };
    const report = assertSheetDesignContext(fakeCtx);
    expect(report.frozen).toBe(false);
    expect(report.warnings.some((w) => /not frozen/i.test(w))).toBe(true);
  });
});
