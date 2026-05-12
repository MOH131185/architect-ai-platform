// PR5 of the A1 defect remediation plan. Asserts:
//   1. verifyRenderAgainstGeometry default-skips when A1_RENDER_GEOMETRY_QA_ENABLED
//      is unset (env-gated opt-in), so existing render paths are unaffected.
//   2. verifyRenderAgainstGeometry with the gate ON and an injected verifier
//      returns the verifier's verdict normalised; missing PNG yields skipped.
//   3. amendPromptForRetry appends an AVOID clause + a property-lock summary
//      when given mismatches; passes through unchanged on empty input.
//   4. deriveExpectedPropertiesFromGeometry pulls storey / gable / material /
//      window-count from a ProjectGraph-shaped object.
//   5. Title block builder renders the new Drawn by + Checked by rows and
//      honours sheetPlan.issue_date as a date fallback.

import {
  verifyRenderAgainstGeometry,
  amendPromptForRetry,
  deriveExpectedPropertiesFromGeometry,
  RENDER_GEOMETRY_QA_PASS_THRESHOLD,
} from "../../services/render/renderGeometryQA.js";
import { buildTitleBlockPanelArtifact } from "../../services/project/projectGraphVerticalSliceService.js";

describe("PR5 — verifyRenderAgainstGeometry env gating", () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env.A1_RENDER_GEOMETRY_QA_ENABLED;
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.A1_RENDER_GEOMETRY_QA_ENABLED;
    } else {
      process.env.A1_RENDER_GEOMETRY_QA_ENABLED = originalEnv;
    }
  });

  test("default (env unset): skipped with ok=true so existing renderers don't gate", async () => {
    delete process.env.A1_RENDER_GEOMETRY_QA_ENABLED;
    const result = await verifyRenderAgainstGeometry({
      pngBytes: Buffer.from([1, 2, 3]),
      projectGeometry: { levels: [{}, {}] },
      panelType: "exterior_render",
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("qa_gate_disabled");
  });

  test("opted-in (env=true): missing pngBytes → skipped with reason", async () => {
    process.env.A1_RENDER_GEOMETRY_QA_ENABLED = "true";
    const result = await verifyRenderAgainstGeometry({
      pngBytes: null,
      projectGeometry: { levels: [{}, {}] },
      panelType: "exterior_render",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("missing_png_bytes");
  });

  test("opted-in with injected verifier: normalises score + ok + mismatches", async () => {
    process.env.A1_RENDER_GEOMETRY_QA_ENABLED = "true";
    const verifier = jest.fn().mockResolvedValue({
      score: 0.42,
      mismatches: ["two gables vs expected one", "wrong façade brick colour"],
    });
    const result = await verifyRenderAgainstGeometry({
      pngBytes: Buffer.from([1, 2, 3]),
      projectGeometry: {
        levels: [{}, {}],
        roof_primitives: [{ type: "gable" }],
      },
      panelType: "exterior_render",
      verifier,
    });
    expect(verifier).toHaveBeenCalled();
    expect(result.score).toBeCloseTo(0.42);
    expect(result.ok).toBe(false); // 0.42 < 0.7 threshold
    expect(result.mismatches).toEqual([
      "two gables vs expected one",
      "wrong façade brick colour",
    ]);
  });

  test("opted-in with verifier returning above-threshold score: ok=true", async () => {
    process.env.A1_RENDER_GEOMETRY_QA_ENABLED = "true";
    const verifier = jest.fn().mockResolvedValue({
      score: 0.92,
      mismatches: [],
    });
    const result = await verifyRenderAgainstGeometry({
      pngBytes: Buffer.from([1, 2, 3]),
      projectGeometry: { levels: [{}, {}] },
      panelType: "exterior_render",
      verifier,
    });
    expect(result.ok).toBe(true);
    expect(result.score).toBeCloseTo(0.92);
  });

  test("threshold constant matches plan (0.7)", () => {
    expect(RENDER_GEOMETRY_QA_PASS_THRESHOLD).toBe(0.7);
  });
});

describe("PR5 — amendPromptForRetry", () => {
  test("appends AVOID clause + property-lock summary when mismatches present", () => {
    const original = "Photoreal render of a 2-storey dwelling.";
    const amended = amendPromptForRetry(
      original,
      ["two gables vs expected one", "wrong façade brick colour"],
      {
        storey_count: 2,
        gable_count: 1,
        primary_facade_material: "yellow stock brick",
        entry_orientation: "south",
      },
    );
    expect(amended).toContain(original);
    expect(amended).toMatch(/AVOID:/);
    expect(amended).toContain("two gables vs expected one");
    expect(amended).toContain("storey_count=2");
    expect(amended).toContain("gable_count=1");
    expect(amended).toContain("yellow stock brick");
  });

  test("passes original prompt through unchanged when mismatches empty", () => {
    const original = "Photoreal render.";
    expect(amendPromptForRetry(original, [])).toBe(original);
    expect(amendPromptForRetry(original, null)).toBe(original);
  });
});

describe("PR5 — deriveExpectedPropertiesFromGeometry", () => {
  test("pulls storey / gable / window count + façade material", () => {
    const expected = deriveExpectedPropertiesFromGeometry(
      {
        levels: [{ id: "0" }, { id: "1" }],
        roof_primitives: [
          { type: "gable" },
          { type: "gable" },
          { type: "ridge" },
        ],
        openings: [
          { kind: "window" },
          { kind: "window" },
          { kind: "window" },
          { kind: "door", exterior: true },
          { kind: "door", exterior: false },
        ],
        materials: [
          { name: "London Stock Brick", application: "primary facade" },
          { name: "Concrete Tile", application: "roof" },
        ],
        site: { main_entry: { orientation: "south" } },
        roof: { ridge_height_m: 7.28 },
      },
      "exterior_render",
    );
    expect(expected.storey_count).toBe(2);
    expect(expected.gable_count).toBe(2);
    expect(expected.window_count_approx).toBe(3);
    expect(expected.exterior_door_count_approx).toBe(1);
    expect(expected.primary_facade_material).toBe("London Stock Brick");
    expect(expected.entry_orientation).toBe("south");
    expect(expected.ridge_height_m).toBeCloseTo(7.28);
    expect(expected.panelType).toBe("exterior_render");
  });

  test("handles missing fields gracefully (all null)", () => {
    const expected = deriveExpectedPropertiesFromGeometry({}, null);
    expect(expected.storey_count).toBeNull();
    expect(expected.gable_count).toBeNull();
    expect(expected.primary_facade_material).toBeNull();
    expect(expected.entry_orientation).toBeNull();
  });
});

describe("PR5 — title block Drawn by / Checked by rows", () => {
  function baseArgs(extras = {}) {
    return {
      projectGraphId: "pg-pr5",
      brief: { project_name: "PR5 Test Dwelling" },
      geometryHash: "abc123",
      sheetPlan: null,
      ...extras,
    };
  }

  test("defaults: Drawn by = AI, Checked by = —", () => {
    const artifact = buildTitleBlockPanelArtifact(baseArgs());
    expect(artifact.svgString).toMatch(/Drawn by/);
    expect(artifact.svgString).toMatch(/Checked by/);
    // Default Drawn by value "AI" should appear near a Drawn by label.
    expect(artifact.svgString).toMatch(/>AI</);
    // Default Checked by uses em-dash; SVG-escapes to literal —.
    expect(artifact.svgString).toMatch(/Checked by/);
  });

  test("honours brief.team.drawn_by and brief.team.checked_by", () => {
    const artifact = buildTitleBlockPanelArtifact(
      baseArgs({
        brief: {
          project_name: "PR5",
          team: { drawn_by: "MR", checked_by: "JL" },
        },
      }),
    );
    expect(artifact.svgString).toMatch(/>MR</);
    expect(artifact.svgString).toMatch(/>JL</);
    // Defaults should NOT appear.
    expect(artifact.svgString).not.toMatch(/>AI</);
  });

  test("honours sheetPlan.issue_date as a date fallback", () => {
    const artifact = buildTitleBlockPanelArtifact(
      baseArgs({
        brief: { project_name: "PR5" },
        sheetPlan: { issue_date: "2026-04-15" },
      }),
    );
    expect(artifact.svgString).toMatch(/2026-04-15/);
  });

  test("brief.brief_date takes precedence over sheetPlan.issue_date", () => {
    const artifact = buildTitleBlockPanelArtifact(
      baseArgs({
        brief: { project_name: "PR5", brief_date: "2026-03-01" },
        sheetPlan: { issue_date: "2026-04-15" },
      }),
    );
    expect(artifact.svgString).toMatch(/2026-03-01/);
    expect(artifact.svgString).not.toMatch(/2026-04-15/);
  });
});
