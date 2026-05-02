import {
  buildProjectGraphRenderPrompt,
  RENDER_PROMPT_IDENTITY_VERSION,
} from "../../services/project/projectGraphVerticalSliceService.js";
import { buildSheetDesignContext } from "../../services/dnaPromptContext.js";
import { buildVisualManifest } from "../../services/render/visualManifestService.js";
import {
  isFeatureEnabled,
  setFeatureFlag,
  resetFeatureFlags,
} from "../../config/featureFlags.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geom-phase4-001",
    levels: [{ height_m: 3.2 }, { height_m: 3.0 }],
    footprint: { length_m: 10.8, width_m: 7.5, area_m2: 81 },
    massing: { form: "compact rectangular" },
    roof: { form: "gable", pitch_deg: 35 },
    facadeGrammar: { windowRhythm: "regular bay" },
  };
}

function fixtureBrief() {
  return {
    // Avoid the words "cutaway" / "cut-away" in fixture strings so the
    // flag-off prompt assertions do not get false positives from the
    // project name being echoed into the prompt header.
    project_name: "Phase 4 Identity Fixture",
    project_graph_id: "pg-phase4-001",
    building_type: "detached_house",
    target_storeys: 2,
    target_gia_m2: 162,
    site_input: {
      address: "Test Lane, Birmingham",
      postcode: "B1 1AA",
      lat: 52.48,
      lon: -1.9,
    },
    user_intent: { portfolio_mood: "riba_stage3" },
  };
}

function fixtureLocalStyle() {
  return {
    primary_style: "Birmingham red-brick vernacular",
    style_keywords: ["red brick"],
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
    ],
  };
}

function fixtureClimate() {
  return { zone: "Cfb", rainfall_mm: 850, strategy: "fabric-first" };
}

function fixtureSheetDesignContext({ withProgrammeSpaces = true } = {}) {
  const compiledProject = fixtureCompiledProject();
  const brief = fixtureBrief();
  const localStyle = fixtureLocalStyle();
  const climate = fixtureClimate();
  const programmeSummary = withProgrammeSpaces
    ? {
        rooms: [
          { name: "Living Room", area_m2: 24, floor: "Ground" },
          { name: "Kitchen with Island", area_m2: 22, floor: "Ground" },
          { name: "Master Bedroom", area_m2: 18, floor: "First" },
          { name: "Bedroom 2", area_m2: 12, floor: "First" },
        ],
      }
    : { rooms: [] };
  const visualManifest = buildVisualManifest({
    compiledProject,
    projectGraph: { projectGraphId: brief.project_graph_id },
    brief,
    masterDNA: null,
    climate,
    localStyle,
    materialPalette: localStyle.material_palette,
  });
  return buildSheetDesignContext({
    masterDNA: { _structured: { program: { rooms: programmeSummary.rooms } } },
    brief,
    compiledProject,
    climate,
    localStyle,
    region: "UK",
    projectGraphId: brief.project_graph_id,
    visualManifest,
  });
}

function buildVisualManifestForFixture() {
  const compiledProject = fixtureCompiledProject();
  const brief = fixtureBrief();
  const localStyle = fixtureLocalStyle();
  const climate = fixtureClimate();
  return buildVisualManifest({
    compiledProject,
    projectGraph: { projectGraphId: brief.project_graph_id },
    brief,
    masterDNA: null,
    climate,
    localStyle,
    materialPalette: localStyle.material_palette,
  });
}

function buildPromptArgs(overrides = {}) {
  const brief = fixtureBrief();
  const visualManifest = buildVisualManifestForFixture();
  return {
    panelType: "axonometric",
    brief,
    compiledProject: fixtureCompiledProject(),
    climate: fixtureClimate(),
    localStyle: fixtureLocalStyle(),
    styleDNA: null,
    programmeSummary: null,
    region: "UK",
    visualManifest,
    sheetDesignContext: null,
    axonometricCutawayEnabled: false,
    ...overrides,
  };
}

describe("Phase 4 — feature flag wiring", () => {
  beforeEach(() => {
    resetFeatureFlags();
  });
  afterEach(() => {
    resetFeatureFlags();
  });

  test("axonometricCutawayEnabled is registered in FEATURE_FLAGS and defaults to false", () => {
    expect(isFeatureEnabled("axonometricCutawayEnabled")).toBe(false);
  });

  test("setFeatureFlag('axonometricCutawayEnabled', true) flips the flag at runtime", () => {
    setFeatureFlag("axonometricCutawayEnabled", true);
    expect(isFeatureEnabled("axonometricCutawayEnabled")).toBe(true);
  });
});

describe("Phase 4 — buildProjectGraphRenderPrompt cutaway gating", () => {
  test("flag OFF preserves the original axonometric prompt (no cutaway language)", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: false,
        sheetDesignContext: fixtureSheetDesignContext(),
      }),
    );
    expect(prompt).toContain("axonometric");
    expect(prompt).not.toMatch(/cutaway/i);
    expect(prompt).not.toMatch(/cut.away/i);
    expect(prompt).not.toMatch(/sectional axonometric/i);
  });

  test("flag ON adds cutaway / interior-exposed requirements to the axonometric prompt", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: true,
        sheetDesignContext: fixtureSheetDesignContext(),
      }),
    );
    expect(prompt).toMatch(/CUTAWAY axonometric/);
    expect(prompt).toMatch(/sectional axonometric/i);
    expect(prompt).toMatch(/cut-?away/i);
    expect(prompt).toMatch(/interior rooms.*visible|rooms.*visible/i);
  });

  test("flag ON injects programme/rooms from SheetDesignContext when available", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: true,
        sheetDesignContext: fixtureSheetDesignContext({
          withProgrammeSpaces: true,
        }),
      }),
    );
    // Programme rooms should appear in the cutaway intent
    expect(prompt).toMatch(/Living Room/);
    expect(prompt).toMatch(/Master Bedroom/);
    expect(prompt).toMatch(/programme/i);
  });

  test("flag ON preserves identity constraints from visualManifest (storeys/roof/materials/window/entrance)", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: true,
        sheetDesignContext: fixtureSheetDesignContext(),
      }),
    );
    expect(prompt).toMatch(/VISUAL IDENTITY LOCK/i);
    expect(prompt).toMatch(/2-storey/);
    expect(prompt).toMatch(/gable|roof/i);
    expect(prompt).toMatch(/Multi-stock red brick|brick/);
    expect(prompt).toMatch(/regular bay|window rhythm/i);
    expect(prompt).toMatch(/entrance/i);
    // Identity constraints from visualContinuity block
    expect(prompt).toMatch(/Preserve roof form/);
    expect(prompt).toMatch(/Preserve facade material order/);
  });

  test("flag ON only mutates the axonometric panel — hero_3d / exterior_render / interior_3d are unchanged", () => {
    for (const panelType of ["hero_3d", "exterior_render", "interior_3d"]) {
      const flagOff = buildProjectGraphRenderPrompt(
        buildPromptArgs({
          panelType,
          axonometricCutawayEnabled: false,
          sheetDesignContext: fixtureSheetDesignContext(),
        }),
      );
      const flagOn = buildProjectGraphRenderPrompt(
        buildPromptArgs({
          panelType,
          axonometricCutawayEnabled: true,
          sheetDesignContext: fixtureSheetDesignContext(),
        }),
      );
      expect(flagOn).toBe(flagOff);
    }
  });

  test("RENDER_PROMPT_IDENTITY_VERSION export is stable v1", () => {
    expect(RENDER_PROMPT_IDENTITY_VERSION).toBe(
      "phase4-render-prompt-identity-v1",
    );
  });
});

describe("Phase 4 — visual identity metadata surface", () => {
  test("buildProjectGraphRenderPrompt emits the visual continuity block (manifest-driven)", () => {
    const prompt = buildProjectGraphRenderPrompt(buildPromptArgs());
    expect(prompt).toMatch(/VISUAL IDENTITY LOCK/i);
    expect(prompt).toMatch(/VISUAL CONTINUITY CONSTRAINTS/);
    // The identity lock includes the manifestHash so all four panels share
    // a single deterministic identity surface.
    expect(prompt).toMatch(/manifestHash:\s*[a-f0-9]+/);
  });

  test("flag-on cutaway path still emits identity lock + continuity constraints", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: true,
        sheetDesignContext: fixtureSheetDesignContext(),
      }),
    );
    expect(prompt).toMatch(/VISUAL IDENTITY LOCK/i);
    expect(prompt).toMatch(/VISUAL CONTINUITY CONSTRAINTS/);
    expect(prompt).toMatch(/Preserve facade material order/);
  });
});

describe("Phase 4 — defensive behaviour", () => {
  test("flag ON without programmeSummary falls back to a generic 'principal rooms' line (no crash)", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: true,
        sheetDesignContext: fixtureSheetDesignContext({
          withProgrammeSpaces: false,
        }),
      }),
    );
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(500);
    expect(prompt).toMatch(/programme/i);
  });

  test("flag ON without sheetDesignContext does not crash; uses generic interior reveal text", () => {
    const prompt = buildProjectGraphRenderPrompt(
      buildPromptArgs({
        axonometricCutawayEnabled: true,
        sheetDesignContext: null,
      }),
    );
    expect(typeof prompt).toBe("string");
    expect(prompt).toMatch(/CUTAWAY axonometric/);
  });
});
