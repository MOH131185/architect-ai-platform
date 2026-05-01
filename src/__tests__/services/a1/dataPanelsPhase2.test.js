import {
  buildMaterialPalettePanelArtifact,
  buildKeyNoteItems,
  buildKeyNotesPanelArtifact,
  buildTitleBlockPanelArtifact,
} from "../../../services/project/projectGraphVerticalSliceService.js";
import { buildSheetDesignContext } from "../../../services/dnaPromptContext.js";
import { buildVisualManifest } from "../../../services/render/visualManifestService.js";
import { normalizeKey } from "../../../services/a1/composeCore.js";

function fixtureBrief(overrides = {}) {
  return {
    project_name: "Phase 2 Fixture House",
    project_graph_id: "pg-phase2-fixture-001",
    building_type: "detached_house",
    target_gia_m2: 162,
    target_storeys: 2,
    sustainability_ambition: "fabric-first",
    site_input: {
      address: "Test Lane, Birmingham, UK",
      postcode: "B1 1AA",
      lat: 52.48,
      lon: -1.9,
    },
    user_intent: { portfolio_mood: "riba_stage3" },
    brief_input_hash: "brief-hash-001",
    architect: "ArchAI Studio",
    studio_footer: "Architecture | Design | Planning",
    revision: "P02",
    status: "Issued for Comment",
    brief_date: "2026-05-01",
    ...overrides,
  };
}

function fixtureLocalStyle() {
  return {
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
    facade_grammar: { windowRhythm: "regular bay" },
  };
}

function fixtureCompiledProject() {
  return {
    geometryHash: "geom-phase2-fixture-001",
    levels: [{ height_m: 3.2 }, { height_m: 3.0 }],
    footprint: { length_m: 10.8, width_m: 7.5, area_m2: 81 },
    massing: { form: "compact rectangular" },
    roof: { form: "gable", pitch_deg: 35 },
    facadeGrammar: { windowRhythm: "regular bay" },
  };
}

function fixtureClimate() {
  return {
    zone: "Cfb",
    rainfall_mm: 850,
    sunPath: { summary: "low winter sun, shallow summer arc" },
    overheating: false,
    strategy: "fabric-first with summer shading",
  };
}

function fixtureRegulations() {
  return {
    partL: "Approved Document Part L 2021 fabric performance",
    fabric_first: true,
    flags: [],
    jurisdiction: "England",
  };
}

function fixtureSheetDesignContext() {
  const compiledProject = fixtureCompiledProject();
  const localStyle = fixtureLocalStyle();
  const climate = fixtureClimate();
  const regulations = fixtureRegulations();
  const brief = fixtureBrief();
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
    masterDNA: null,
    brief,
    compiledProject,
    climate,
    localStyle,
    regulations,
    region: "UK",
    projectGraphId: brief.project_graph_id,
    visualManifest,
  });
}

describe("Phase 2 — Material Palette panel", () => {
  test("renders 8 cards even when localStyle palette has fewer entries (canonical fallback top-up)", () => {
    const artifact = buildMaterialPalettePanelArtifact({
      projectGraphId: "pg-1",
      localStyle: fixtureLocalStyle(),
      compiledProject: fixtureCompiledProject(),
      styleDNA: null,
      brief: fixtureBrief(),
      geometryHash: "geom-1",
    });
    expect(artifact.panel_type).toBe("material_palette");
    expect(artifact.metadata.cardCount).toBe(8);
    expect(artifact.cardMetadata).toHaveLength(8);
  });

  test("renders 8 cards from SheetDesignContext when canonical palette delivers ≥8 entries", () => {
    const ctx = fixtureSheetDesignContext();
    const artifact = buildMaterialPalettePanelArtifact({
      projectGraphId: "pg-1",
      localStyle: fixtureLocalStyle(),
      compiledProject: fixtureCompiledProject(),
      styleDNA: null,
      brief: fixtureBrief(),
      geometryHash: "geom-1",
      sheetDesignContext: ctx,
    });
    expect(artifact.cardMetadata).toHaveLength(8);
    expect(artifact.metadata.sourceContext).toBe("sheet_design_context");
    expect(artifact.metadata.sheetDesignContextHash).toBe(ctx.contextHash);
  });

  test("each card metadata exposes a category label drawn from KIND_CATEGORY/application hints", () => {
    const artifact = buildMaterialPalettePanelArtifact({
      projectGraphId: "pg-1",
      localStyle: fixtureLocalStyle(),
      compiledProject: fixtureCompiledProject(),
      styleDNA: null,
      brief: fixtureBrief(),
      geometryHash: "geom-1",
    });
    const allowed = new Set([
      "EXTERIOR",
      "ROOF",
      "OPENINGS",
      "DETAIL",
      "LANDSCAPE",
    ]);
    artifact.cardMetadata.forEach((card) => {
      expect(typeof card.category).toBe("string");
      expect(allowed.has(card.category)).toBe(true);
    });
    expect(artifact.metadata.categoryCount).toBeGreaterThanOrEqual(3);
  });

  test("emits category label markup ABOVE each swatch (data-material-category attribute)", () => {
    const artifact = buildMaterialPalettePanelArtifact({
      projectGraphId: "pg-1",
      localStyle: fixtureLocalStyle(),
      compiledProject: fixtureCompiledProject(),
      styleDNA: null,
      brief: fixtureBrief(),
      geometryHash: "geom-1",
    });
    const matches =
      artifact.svgString.match(/data-material-category="[A-Z]+"/g) || [];
    expect(matches.length).toBe(8);
  });
});

describe("Phase 2 — Key Notes panel", () => {
  const expectedOrder = [
    "external_walls",
    "roof",
    "windows_doors",
    "heating_ventilation",
    "drainage",
    "sustainability",
    "climate_strategy",
    "dimensions_tolerances",
    "copyright",
  ];

  test("buildKeyNoteItems returns the canonical 9-group structure in deterministic order", () => {
    const groups = buildKeyNoteItems({
      brief: fixtureBrief(),
      site: { area_m2: 320 },
      climate: fixtureClimate(),
      regulations: fixtureRegulations(),
      localStyle: fixtureLocalStyle(),
    });
    expect(groups.map((g) => g.id)).toEqual(expectedOrder);
    groups.forEach((group) => {
      expect(typeof group.heading).toBe("string");
      expect(group.heading.length).toBeGreaterThan(0);
      expect(Array.isArray(group.lines)).toBe(true);
      expect(group.lines.length).toBeGreaterThan(0);
    });
  });

  test("Climate strategy is folded into Key Notes (not a separate panel) and includes a meaningful body line", () => {
    const groups = buildKeyNoteItems({
      brief: fixtureBrief(),
      site: { area_m2: 320 },
      climate: fixtureClimate(),
      regulations: fixtureRegulations(),
      localStyle: fixtureLocalStyle(),
      sheetDesignContext: fixtureSheetDesignContext(),
    });
    const climate = groups.find((g) => g.id === "climate_strategy");
    expect(climate).toBeTruthy();
    expect(climate.heading).toMatch(/Climate strategy/i);
    expect(climate.lines.length).toBeGreaterThanOrEqual(1);
    expect(climate.lines.join(" ")).toMatch(
      /cfb|temperate|fabric|passive|rainfall|overheating|shading|ventilation/i,
    );
  });

  test("buildKeyNotesPanelArtifact stamps groupOrder + groupIds + sourceContext metadata", () => {
    const ctx = fixtureSheetDesignContext();
    const artifact = buildKeyNotesPanelArtifact({
      projectGraphId: "pg-1",
      brief: fixtureBrief(),
      site: { area_m2: 320 },
      climate: fixtureClimate(),
      regulations: fixtureRegulations(),
      localStyle: fixtureLocalStyle(),
      geometryHash: "geom-1",
      sheetDesignContext: ctx,
    });
    expect(artifact.panel_type).toBe("key_notes");
    expect(artifact.metadata.noteCount).toBe(9);
    expect(artifact.metadata.groupIds).toEqual(expectedOrder);
    expect(artifact.metadata.groupOrder).toEqual(expectedOrder);
    expect(artifact.metadata.sourceContext).toBe("sheet_design_context");
    expect(artifact.metadata.sheetDesignContextHash).toBe(ctx.contextHash);
    expect(artifact.svgString).toMatch(/data-key-note-id="climate_strategy"/);
  });

  test("Key notes ordering is stable across two consecutive runs with identical inputs", () => {
    const fixedInputs = () => ({
      brief: fixtureBrief(),
      site: { area_m2: 320 },
      climate: fixtureClimate(),
      regulations: fixtureRegulations(),
      localStyle: fixtureLocalStyle(),
    });
    const groupsA = buildKeyNoteItems(fixedInputs());
    const groupsB = buildKeyNoteItems(fixedInputs());
    expect(groupsA.map((g) => g.id)).toEqual(groupsB.map((g) => g.id));
    expect(groupsA.map((g) => g.heading)).toEqual(
      groupsB.map((g) => g.heading),
    );
  });

  test("falls back gracefully when no SheetDesignContext is provided (legacy path)", () => {
    const artifact = buildKeyNotesPanelArtifact({
      projectGraphId: "pg-1",
      brief: fixtureBrief(),
      site: { area_m2: 320 },
      climate: fixtureClimate(),
      regulations: fixtureRegulations(),
      localStyle: fixtureLocalStyle(),
      geometryHash: "geom-1",
    });
    expect(artifact.metadata.sourceContext).toBe("legacy_dna");
    expect(artifact.metadata.noteCount).toBe(9);
  });
});

describe("Phase 2 — Title Block panel", () => {
  test("includes RIBA Stage / Status / Revision / Date / Drawing No. row keys", () => {
    const artifact = buildTitleBlockPanelArtifact({
      projectGraphId: "pg-1",
      brief: fixtureBrief(),
      geometryHash: "geom-1",
      sheetPlan: { sheet_number: "A1-001", label: "RIBA Stage 3 Master" },
    });
    expect(artifact.panel_type).toBe("title_block");
    const required = [
      "Project",
      "Location",
      "RIBA Stage",
      "Status",
      "Revision",
      "Date",
      "Drawing No.",
    ];
    required.forEach((key) => {
      expect(artifact.metadata.rowKeys).toContain(key);
    });
    expect(artifact.metadata.ribaStage).toBe("RIBA Stage 3");
    expect(artifact.metadata.revision).toBe("P02");
    expect(artifact.metadata.status).toBe("Issued for Comment");
    expect(artifact.metadata.date).toBe("2026-05-01");
    expect(artifact.metadata.drawingNumber).toBe("A1-001");
  });

  test("falls back to RIBA Stage 2 when brief has no portfolio_mood/riba_stage", () => {
    const briefSparse = fixtureBrief({
      user_intent: undefined,
      riba_stage: undefined,
    });
    const artifact = buildTitleBlockPanelArtifact({
      projectGraphId: "pg-1",
      brief: briefSparse,
      geometryHash: "geom-1",
      sheetPlan: null,
    });
    expect(artifact.metadata.ribaStage).toBe("RIBA Stage 2");
    expect(artifact.metadata.revision).toBe("P02");
  });

  test("renders architect name and studio footer in the SVG", () => {
    const artifact = buildTitleBlockPanelArtifact({
      projectGraphId: "pg-1",
      brief: fixtureBrief(),
      geometryHash: "geom-1",
      sheetPlan: { sheet_number: "A1-001", label: "RIBA Stage 3 Master" },
    });
    expect(artifact.svgString).toContain("ARCHAI STUDIO");
    expect(artifact.svgString).toContain("Architecture | Design | Planning");
    expect(artifact.metadata.architect).toBe("ArchAI Studio");
  });

  test("propagates SheetDesignContext hash and region into metadata when supplied", () => {
    const ctx = fixtureSheetDesignContext();
    const artifact = buildTitleBlockPanelArtifact({
      projectGraphId: "pg-1",
      brief: fixtureBrief(),
      geometryHash: "geom-1",
      sheetPlan: { sheet_number: "A1-001", label: "RIBA Stage 3 Master" },
      sheetDesignContext: ctx,
    });
    expect(artifact.metadata.sheetDesignContextHash).toBe(ctx.contextHash);
    expect(artifact.metadata.sourceContext).toBe("sheet_design_context");
    expect(artifact.metadata.location).toMatch(/UK/);
  });
});

describe("Phase 2 — schedules_notes / key_notes compose-routing compatibility", () => {
  test("normalizeKey('key_notes') routes to the schedules_notes legacy slot", () => {
    expect(normalizeKey("key_notes")).toBe("schedules_notes");
  });

  test("normalizeKey('schedules_notes') stays canonical", () => {
    expect(normalizeKey("schedules_notes")).toBe("schedules_notes");
  });

  test("normalizeKey legacy aliases ('schedules', 'notes') still resolve to schedules_notes", () => {
    expect(normalizeKey("schedules")).toBe("schedules_notes");
    expect(normalizeKey("notes")).toBe("schedules_notes");
  });
});
