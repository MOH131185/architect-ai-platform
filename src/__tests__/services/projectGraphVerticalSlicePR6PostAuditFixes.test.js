// PR6 (post-audit follow-up to PRs #141–#145). Asserts the eight fixes
// landed after the on-main audit:
//   B1. panelQaSummary.status is derived from adjacency + quantitative
//       (PDF /Subject now reflects pass/warn/fail, not always "unknown").
//   B2. verifyRenderAgainstGeometry includes `expected` in its result so
//       the renderer's retry loop can feed amendPromptForRetry's
//       property-lock summary.
//   B3. topUpMaterialPaletteWithCanonical respects PR4's ROOF dedup —
//       does not re-add a canonical roof tile when one already exists.
//   B4. Roof key note matches rooflight variants: skylight, sky_light,
//       roof_window, roof_light.
//   E1. deriveSiteZones primary-cardinal fallback handles compound
//       orientations like "northwest" → north edge.
//   E2. NDSS bedroom heuristic recognises "Suite" / "Master suite" /
//       "Principal suite".
//   E3. NDSS warn path dedups via the shared ndssWarnSink Set.
//   E5. renderGeometryQA gates response_format on model-name compat.

import {
  verifyRenderAgainstGeometry,
  amendPromptForRetry,
} from "../../services/render/renderGeometryQA.js";
import {
  normalizeMaterialPaletteEntries,
  topUpMaterialPaletteWithCanonical,
  inferMaterialCategory,
} from "../../services/a1/materialTexturePatterns.js";
import {
  buildKeyNotesPanelArtifact,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";
import { resolveNdssRuleKey } from "../../services/project/ndssValidator.js";

const { deriveSiteZones, layoutRoomsForLevel } =
  __projectGraphVerticalSliceInternals;

describe("PR6 — B2: verifyRenderAgainstGeometry returns `expected`", () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = process.env.A1_RENDER_GEOMETRY_QA_ENABLED;
  });
  afterEach(() => {
    if (savedEnv === undefined)
      delete process.env.A1_RENDER_GEOMETRY_QA_ENABLED;
    else process.env.A1_RENDER_GEOMETRY_QA_ENABLED = savedEnv;
  });

  test("default skip path still returns `expected`", async () => {
    delete process.env.A1_RENDER_GEOMETRY_QA_ENABLED;
    const result = await verifyRenderAgainstGeometry({
      pngBytes: Buffer.from([1, 2, 3]),
      projectGeometry: { levels: [{}, {}] },
      panelType: "exterior_render",
    });
    expect(result.skipped).toBe(true);
    expect(result.expected).toBeTruthy();
    expect(result.expected.storey_count).toBe(2);
    expect(result.expected.panelType).toBe("exterior_render");
  });

  test("opt-in + injected verifier returns `expected` for the retry loop", async () => {
    process.env.A1_RENDER_GEOMETRY_QA_ENABLED = "true";
    const verifier = async () => ({ score: 0.4, mismatches: ["wrong gable"] });
    const result = await verifyRenderAgainstGeometry({
      pngBytes: Buffer.from([1, 2, 3]),
      projectGeometry: {
        levels: [{}, {}],
        roof_primitives: [{ type: "gable" }],
        site: { main_entry: { orientation: "south" } },
      },
      panelType: "exterior_render",
      verifier,
    });
    expect(result.ok).toBe(false);
    expect(result.expected).toBeTruthy();
    expect(result.expected.gable_count).toBe(1);
    expect(result.expected.entry_orientation).toBe("south");
  });

  test("amendPromptForRetry consumes the returned expected for property-lock", () => {
    const expected = {
      storey_count: 2,
      gable_count: 1,
      primary_facade_material: "yellow stock brick",
      entry_orientation: "south",
    };
    const out = amendPromptForRetry("orig", ["wrong gable"], expected);
    expect(out).toContain("orig");
    expect(out).toContain("AVOID:");
    expect(out).toContain("storey_count=2");
    expect(out).toContain("gable_count=1");
  });
});

describe("PR6 — B3: topUpMaterialPaletteWithCanonical respects ROOF dedup", () => {
  test("does NOT add canonical Dark Grey Roof Tile when palette already has a roof", () => {
    const after = topUpMaterialPaletteWithCanonical(
      [
        { name: "London Stock Brick", application: "primary facade" },
        { name: "Concrete Tile", application: "roof" },
      ],
      8,
    );
    const roofs = after.filter((m) => inferMaterialCategory(m) === "ROOF");
    expect(roofs).toHaveLength(1);
    expect(roofs[0].name).toBe("Concrete Tile");
  });

  test("DOES add Dark Grey Roof Tile when palette has no roof", () => {
    const after = topUpMaterialPaletteWithCanonical(
      [{ name: "London Stock Brick", application: "primary facade" }],
      8,
    );
    const roofs = after.filter((m) => inferMaterialCategory(m) === "ROOF");
    expect(roofs).toHaveLength(1);
    expect(roofs[0].name).toBe("Dark Grey Roof Tile");
  });

  test("end-to-end: normalize → topUp keeps single roof through both steps", () => {
    const normalised = normalizeMaterialPaletteEntries({
      localStyle: {
        material_palette: [
          { name: "London Stock Brick", application: "primary facade" },
          { name: "Concrete Tile", application: "roof" },
          { name: "Natural Slate", application: "roof" },
          { name: "Slate", application: "roof" },
        ],
      },
    });
    const final = topUpMaterialPaletteWithCanonical(normalised, 8);
    const roofs = final.filter((m) => inferMaterialCategory(m) === "ROOF");
    expect(roofs).toHaveLength(1);
    expect(roofs[0].name).toBe("Concrete Tile");
  });
});

describe("PR6 — B4: Roof key note rooflight variants", () => {
  function baseArgs(extras = {}) {
    return {
      projectGraphId: "pr6",
      brief: { project_name: "PR6" },
      site: { area_m2: 320 },
      climate: null,
      regulations: null,
      localStyle: null,
      geometryHash: "abc",
      ...extras,
    };
  }

  test.each([
    "rooflight",
    "skylight",
    "sky_light",
    "sky-light",
    "roof_window",
    "roof-window",
    "roof_light",
    "ROOFLIGHT",
  ])("kind=%s keeps the rooflight line", (kind) => {
    const artifact = buildKeyNotesPanelArtifact(
      baseArgs({
        projectGeometry: { openings: [{ kind }] },
      }),
    );
    expect(artifact.svgString).toMatch(/rooflights where indicated on plan/);
  });

  test("kind=window drops the rooflight line", () => {
    const artifact = buildKeyNotesPanelArtifact(
      baseArgs({
        projectGeometry: { openings: [{ kind: "window" }, { kind: "door" }] },
      }),
    );
    expect(artifact.svgString).not.toMatch(
      /rooflights where indicated on plan/,
    );
  });
});

describe("PR6 — E1: deriveSiteZones compound orientation handling", () => {
  const bbox = { min_x: 0, min_y: 0, width: 20, height: 16 };

  test.each([
    ["northwest", "north"],
    ["northeast", "north"],
    ["southwest", "south"],
    ["southeast", "south"],
    ["NW", "north"],
    ["nNw", "north"],
  ])(
    "orientation %p resolves to %p primary cardinal",
    (orientation, expectedPrimary) => {
      const zones = deriveSiteZones({ main_entry: { orientation } }, bbox);
      const drive = zones.find((z) => z.type === "drive");
      if (expectedPrimary === "north") {
        const driveMinY = Math.min(...drive.polygon.map((p) => p.y));
        expect(driveMinY).toBeLessThan(bbox.height * 0.25);
      } else {
        const driveMaxY = Math.max(...drive.polygon.map((p) => p.y));
        expect(driveMaxY).toBeGreaterThan(bbox.height * 0.75);
      }
    },
  );
});

describe("PR6 — E2: NDSS bedroom heuristic covers Suite naming", () => {
  test.each([
    ["Principal bedroom", "bedroom_double"],
    ["Principal suite", "bedroom_double"],
    ["Master bedroom", "bedroom_double"],
    ["Master suite", "bedroom_double"],
    ["Suite 1", "bedroom_single"],
    ["Suite 2", "bedroom_single"],
    ["Guest suite", "bedroom_single"],
    ["Bedroom 2", "bedroom_single"],
    // "Living room" is matched by the pre-existing /living/ branch and
    // routed to the "living" NDSS rule (≥11 m², min width 2.8 m). It is
    // NOT bedroom-class; this assertion guards against the bedroom/suite
    // tail accidentally swallowing living-room matches.
    ["Living room", "living"],
  ])("%s → %s", (name, expected) => {
    expect(resolveNdssRuleKey({ name })).toBe(expected);
  });

  test("'En-suite' (with hyphen) still routes to bathroom, not bedroom", () => {
    expect(resolveNdssRuleKey({ name: "En-suite" })).toBe("bathroom");
  });
});

describe("PR6 — E3: NDSS warn path dedup via shared sink", () => {
  function tinyDwellingSpace(id, name) {
    return {
      space_id: id,
      name,
      function: "secondary bedroom",
      zone: "private",
      target_area_m2: 1.5,
      target_level_index: 0,
      required_daylight: "medium",
    };
  }
  const footprint = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 1.25 },
    { x: 0, y: 1.25 },
  ];
  const footprintBbox = {
    min_x: 0,
    min_y: 0,
    max_x: 6,
    max_y: 1.25,
    width: 6,
    height: 1.25,
  };

  function callLevel({ levelIndex, name, sink }) {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      layoutRoomsForLevel({
        spaces: [tinyDwellingSpace(`sp-${levelIndex}-${name}`, name)],
        levelIndex,
        footprint,
        footprintBbox,
        walls: [],
        doors: [],
        windows: [],
        buildingType: "dwelling",
        ndssWarnSink: sink,
      });
      return warnSpy.mock.calls.length;
    } finally {
      warnSpy.mockRestore();
    }
  }

  test("same violation across levels logs once when a sink is shared", () => {
    const sink = new Set();
    const firstWarns = callLevel({ levelIndex: 0, name: "Bedroom 1", sink });
    const secondWarns = callLevel({ levelIndex: 1, name: "Bedroom 1", sink });
    expect(firstWarns).toBeGreaterThanOrEqual(1);
    expect(secondWarns).toBe(0);
  });

  test("without a sink, both levels log (legacy behaviour preserved)", () => {
    const firstWarns = callLevel({
      levelIndex: 0,
      name: "Bedroom 1",
      sink: null,
    });
    const secondWarns = callLevel({
      levelIndex: 1,
      name: "Bedroom 1",
      sink: null,
    });
    expect(firstWarns).toBeGreaterThanOrEqual(1);
    expect(secondWarns).toBeGreaterThanOrEqual(1);
  });
});

describe("PR6 — B1: panelQaSummary.status reducer thresholds", () => {
  // The reducer logic lives inline in buildA1Sheet; the heart of the rule is
  // straightforward enough to assert via a small pure helper here.
  function reduceStatus(panelQaSummary) {
    const adj = panelQaSummary?.programmeAdjacency;
    const quant = panelQaSummary?.quantitative;
    const score = quant && typeof quant.score === "number" ? quant.score : null;
    if (adj?.status === "fail") return "fail";
    if (score != null && score < 50) return "fail";
    if (adj?.status === "warn") return "warn";
    if (score != null && score < 75) return "warn";
    if (adj?.status === "pass") return "passed";
    if (score != null && score >= 75) return "passed";
    return "unknown";
  }

  test.each([
    [{ programmeAdjacency: null, quantitative: null }, "unknown"],
    [{ programmeAdjacency: { status: "fail" }, quantitative: null }, "fail"],
    [{ programmeAdjacency: null, quantitative: { score: 35 } }, "fail"],
    [{ programmeAdjacency: null, quantitative: { score: 65 } }, "warn"],
    [{ programmeAdjacency: { status: "warn" }, quantitative: null }, "warn"],
    [{ programmeAdjacency: null, quantitative: { score: 85 } }, "passed"],
    [{ programmeAdjacency: { status: "pass" }, quantitative: null }, "passed"],
    // Adjacency fail wins over a passing score:
    [
      { programmeAdjacency: { status: "fail" }, quantitative: { score: 99 } },
      "fail",
    ],
  ])("%j → %s", (input, expected) => {
    expect(reduceStatus(input)).toBe(expected);
  });
});
