// Phase 4 — A1 export gate: promote technical content-empty + cross-view
// inconsistency to blocking, keep visual-panel failures warning-only.
//
// Coverage:
//   1. evaluateTechnicalPanelEvidence — floor plans now in technical set;
//      schedules_notes excluded; per-panel blockedPanels detail; absent
//      panels stay warning at every scope (stable gate contract).
//   2. evaluateCrossViewConsistencyEvidence — drawingConsistencyChecks errors
//      become CROSS_VIEW_INCONSISTENT blockers; warnings stay warnings;
//      drawings absent → silent pass.
//   3. extractTechnicalGroupBlockers — filters to technical sources only.
//   4. evaluateFinalA1ExportGate end-to-end — technical issues block;
//      visual-only issues warn but never block from technical group.
//   5. applyUpstreamGateTechnicalBlockersToQa — folds technical blockers
//      into qa.status=fail with code A1_EXPORT_GATE_TECHNICAL_BLOCKED.

import {
  evaluateFinalA1ExportGate,
  extractTechnicalGroupBlockers,
  resolveA1RenderContract,
} from "../../../services/a1/a1FinalExportContract.js";
import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

const { applyUpstreamGateTechnicalBlockersToQa } =
  __projectGraphVerticalSliceInternals;

// A realistic 2-storey panel registry. Phase 4 doesn't widen the registry —
// the slice still uses buildRequiredA1PanelTypes(target_storeys, template).
// We mirror what that returns for a 2-storey presentation-v3 sheet so the
// gate's evaluateRequiredPanelEvidence sees its inputs satisfied in the
// happy-path tests below.
const TWO_STOREY_REQUIRED_REGISTRY = [
  "floor_plan_ground",
  "floor_plan_first",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
  "hero_3d",
  "interior_3d",
  "axonometric",
  "material_palette",
  "schedules_notes",
  "title_block",
];

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function readyPanel(type) {
  return { type, status: "ready", hasSvg: true };
}

function blankPanel(type) {
  return { type, status: "blocked", hasSvg: false };
}

function planSvg({
  northArrow = true,
  titleBlock = true,
  scaleBar = true,
  roomLabel = true,
  dimensionChain = true,
} = {}) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    northArrow ? '<g id="north-arrow"/>' : "",
    titleBlock ? '<g id="title-block"/>' : "",
    scaleBar ? '<g id="scale-bar"/>' : "",
    roomLabel ? '<text class="room-label">Living Room</text>' : "",
    dimensionChain ? '<g class="dimension-chain"/>' : "",
    "</svg>",
  ].join("");
}

function elevationSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg"><line id="ground-line"/><text>FFL +0.000</text></svg>';
}

function sectionSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg"><line id="ground-line"/><text>Section A-A</text></svg>';
}

function fullPanelSet() {
  return [
    readyPanel("floor_plan_ground"),
    readyPanel("floor_plan_first"),
    readyPanel("elevation_north"),
    readyPanel("elevation_south"),
    readyPanel("elevation_east"),
    readyPanel("elevation_west"),
    readyPanel("section_AA"),
    readyPanel("section_BB"),
    readyPanel("hero_3d"),
    readyPanel("interior_3d"),
    readyPanel("axonometric"),
    readyPanel("exterior_render"),
    readyPanel("material_palette"),
    readyPanel("schedules_notes"),
    readyPanel("title_block"),
  ];
}

function fullDrawingSet() {
  return {
    plan: [
      { level_id: "0", svg: planSvg() },
      { level_id: "1", svg: planSvg() },
    ],
    elevation: [
      { svg: elevationSvg(), window_count: 0 },
      { svg: elevationSvg(), window_count: 0 },
      { svg: elevationSvg(), window_count: 0 },
      { svg: elevationSvg(), window_count: 0 },
    ],
    section: [
      { svg: sectionSvg(), stair_count: 0 },
      { svg: sectionSvg(), stair_count: 0 },
    ],
  };
}

function geometry({ levels = 2 } = {}) {
  return {
    levels: Array.from({ length: levels }, (_, idx) => ({ id: String(idx) })),
    windows: [],
    stairs: [],
  };
}

function gateInputs(overrides = {}) {
  return {
    renderContract: resolveA1RenderContract({
      renderIntent: "final_a1",
      skipPdf: true,
    }),
    panels: fullPanelSet(),
    panelRegistry: TWO_STOREY_REQUIRED_REGISTRY,
    targetStoreys: 2,
    visualManifest: {
      manifestHash: "manifest-hash-1",
    },
    visualPanels: [],
    materialPalette: { cards: [{ name: "Brick" }] },
    openaiProvider: { ready: true },
    drawings: fullDrawingSet(),
    projectGeometry: geometry(),
    scope: "upstream_partial",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. evaluateTechnicalPanelEvidence — covered indirectly via the gate.
// ---------------------------------------------------------------------------

describe("Phase 4 — evaluateTechnicalPanelEvidence (via gate)", () => {
  test("floor plans are now in the technical set — blank floor_plan_ground blocks", () => {
    const panels = fullPanelSet().map((panel) =>
      panel.type === "floor_plan_ground" ? blankPanel(panel.type) : panel,
    );
    const gate = evaluateFinalA1ExportGate(gateInputs({ panels }));
    expect(gate.evidence.technicalPanelStatus.status).toBe("blocked");
    expect(gate.evidence.technicalPanelStatus.blank).toContain(
      "floor_plan_ground",
    );
    expect(gate.evidence.technicalPanelStatus.codes).toContain(
      "PANEL_CONTENT_EMPTY",
    );
    expect(gate.evidence.technicalPanelStatus.blockers[0]).toMatch(
      /PANEL_CONTENT_EMPTY/,
    );
    expect(gate.evidence.technicalPanelStatus.blockedPanels[0]).toMatchObject({
      type: "floor_plan_ground",
      code: "PANEL_CONTENT_EMPTY",
    });
  });

  test("schedules_notes (data panel) is NOT in the technical set — blank schedules_notes does not block", () => {
    const panels = fullPanelSet().map((panel) =>
      panel.type === "schedules_notes" ? blankPanel(panel.type) : panel,
    );
    const gate = evaluateFinalA1ExportGate(gateInputs({ panels }));
    expect(gate.evidence.technicalPanelStatus.status).toBe("pass");
    expect(gate.evidence.technicalPanelStatus.blank).toEqual([]);
  });

  test("axonometric and site_diagram are listed for later phases — blank blocks today", () => {
    const panels = fullPanelSet().map((panel) =>
      panel.type === "axonometric" ? blankPanel(panel.type) : panel,
    );
    const gate = evaluateFinalA1ExportGate(gateInputs({ panels }));
    expect(gate.evidence.technicalPanelStatus.status).toBe("blocked");
    expect(gate.evidence.technicalPanelStatus.blank).toContain("axonometric");
  });

  test("panels missing → warning at every scope (stable gate contract: absent evidence does not block)", () => {
    // Phase 4 design rule: real content-empty enforcement fires via
    // panelIsBlank only when panels ARE provided. Absent panels stays a
    // warning at every scope so legacy compose callers that don't pass
    // per-panel data continue to pass the gate (their hard failures come
    // from PDF/OCR/glyph evidence, not technical panel presence).
    const upstream = evaluateFinalA1ExportGate(
      gateInputs({ panels: [], scope: "upstream_partial" }),
    );
    expect(upstream.evidence.technicalPanelStatus.status).toBe("warning");
    expect(upstream.evidence.technicalPanelStatus.blockers).toEqual([]);

    const composeFinal = evaluateFinalA1ExportGate(
      gateInputs({ panels: [], scope: "compose_final" }),
    );
    expect(composeFinal.evidence.technicalPanelStatus.status).toBe("warning");
    expect(composeFinal.evidence.technicalPanelStatus.blockers).toEqual([]);
  });

  test("all elevation panels OK → pass", () => {
    const gate = evaluateFinalA1ExportGate(gateInputs());
    expect(gate.evidence.technicalPanelStatus.status).toBe("pass");
    expect(gate.evidence.technicalPanelStatus.blockers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. evaluateCrossViewConsistencyEvidence — covered via the gate.
// ---------------------------------------------------------------------------

describe("Phase 4 — evaluateCrossViewConsistencyEvidence (via gate)", () => {
  test("plan SVG missing north-arrow → CROSS_VIEW_INCONSISTENT blocker", () => {
    const drawings = {
      plan: [
        { level_id: "0", svg: planSvg({ northArrow: false }) },
        { level_id: "1", svg: planSvg() },
      ],
      elevation: fullDrawingSet().elevation,
      section: fullDrawingSet().section,
    };
    const gate = evaluateFinalA1ExportGate(gateInputs({ drawings }));
    expect(gate.evidence.crossViewConsistencyStatus.status).toBe("blocked");
    expect(gate.evidence.crossViewConsistencyStatus.codes).toContain(
      "CROSS_VIEW_INCONSISTENT",
    );
    expect(gate.evidence.crossViewConsistencyStatus.blockers[0]).toMatch(
      /CROSS_VIEW_INCONSISTENT/,
    );
    expect(gate.evidence.crossViewConsistencyStatus.blockers[0]).toMatch(
      /north-arrow/,
    );
  });

  test("plan SVG missing scale-bar → warning only (not blocker)", () => {
    const drawings = {
      plan: [
        { level_id: "0", svg: planSvg({ scaleBar: false }) },
        { level_id: "1", svg: planSvg() },
      ],
      elevation: fullDrawingSet().elevation,
      section: fullDrawingSet().section,
    };
    const gate = evaluateFinalA1ExportGate(gateInputs({ drawings }));
    expect(gate.evidence.crossViewConsistencyStatus.status).toBe("warning");
    expect(gate.evidence.crossViewConsistencyStatus.blockers).toEqual([]);
    expect(
      gate.evidence.crossViewConsistencyStatus.warnings.length,
    ).toBeGreaterThan(0);
  });

  test("valid drawings → pass", () => {
    const gate = evaluateFinalA1ExportGate(gateInputs());
    expect(gate.evidence.crossViewConsistencyStatus.status).toBe("pass");
  });

  test("drawings absent → silent pass (no opinion, no warning)", () => {
    // Phase 4: callers that don't opt into cross-view evidence (e.g., the
    // compose route that has no drawings to pass) must not see a new
    // warning materialise. The evaluator returns evaluated=false to signal
    // "no opinion" instead.
    const gate = evaluateFinalA1ExportGate(gateInputs({ drawings: null }));
    expect(gate.evidence.crossViewConsistencyStatus.status).toBe("pass");
    expect(gate.evidence.crossViewConsistencyStatus.blockers).toEqual([]);
    expect(gate.evidence.crossViewConsistencyStatus.warnings).toEqual([]);
    expect(gate.evidence.crossViewConsistencyStatus.evaluated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. extractTechnicalGroupBlockers
// ---------------------------------------------------------------------------

describe("Phase 4 — extractTechnicalGroupBlockers", () => {
  test("returns blocked=false when nothing fails", () => {
    const gate = evaluateFinalA1ExportGate(gateInputs());
    const summary = extractTechnicalGroupBlockers(gate);
    expect(summary.blocked).toBe(false);
    expect(summary.blockers).toEqual([]);
  });

  test("returns blocked=true with PANEL_CONTENT_EMPTY when a floor plan is blank", () => {
    const panels = fullPanelSet().map((panel) =>
      panel.type === "floor_plan_first" ? blankPanel(panel.type) : panel,
    );
    const gate = evaluateFinalA1ExportGate(gateInputs({ panels }));
    const summary = extractTechnicalGroupBlockers(gate);
    expect(summary.blocked).toBe(true);
    expect(summary.codes).toContain("PANEL_CONTENT_EMPTY");
    expect(summary.sources).toContain("technicalPanelStatus");
    expect(summary.blockedPanels[0].type).toBe("floor_plan_first");
  });

  test("returns blocked=true with CROSS_VIEW_INCONSISTENT when drawings are bad", () => {
    const drawings = {
      plan: [{ level_id: "0", svg: planSvg({ titleBlock: false }) }],
      elevation: fullDrawingSet().elevation,
      section: fullDrawingSet().section,
    };
    const gate = evaluateFinalA1ExportGate(
      gateInputs({ drawings, projectGeometry: geometry({ levels: 1 }) }),
    );
    const summary = extractTechnicalGroupBlockers(gate);
    expect(summary.blocked).toBe(true);
    expect(summary.codes).toContain("CROSS_VIEW_INCONSISTENT");
    expect(summary.sources).toContain("crossViewConsistencyStatus");
  });

  test("visual-panel manifest mismatch is NOT in technical group (warning-only)", () => {
    const visualPanels = [
      {
        type: "hero_3d",
        visualManifestHash: "different-hash",
        visualIdentityLocked: true,
      },
    ];
    const gate = evaluateFinalA1ExportGate(gateInputs({ visualPanels }));
    const summary = extractTechnicalGroupBlockers(gate);
    // The visual manifest mismatch produces a gate-level blocker, but
    // extractTechnicalGroupBlockers must NOT include it in the technical
    // summary — visual concerns stay non-fatal at the slice level.
    expect(summary.sources).not.toContain("visualPanelStatus");
    expect(summary.sources).not.toContain("visualManifestStatus");
  });

  test("not_applicable gate (preview, not final A1) → blocked=false", () => {
    const gate = {
      status: "not_applicable",
      allowed: true,
      blockers: [],
      evidence: {},
    };
    expect(extractTechnicalGroupBlockers(gate).blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. evaluateFinalA1ExportGate — visual-only failures stay warning-only.
// ---------------------------------------------------------------------------

describe("Phase 4 — gate-level visual vs technical separation", () => {
  test("visual manifest mismatch blocks at gate level but is excluded from technical-group", () => {
    const visualPanels = [
      {
        type: "hero_3d",
        visualManifestHash: "different-hash",
        visualIdentityLocked: true,
      },
    ];
    const gate = evaluateFinalA1ExportGate(gateInputs({ visualPanels }));
    // Gate may report blocked overall (because visualPanelStatus blocks),
    // but the technical-group filter must keep blocked=false so the slice
    // does not 422 on visual-only issues.
    const summary = extractTechnicalGroupBlockers(gate);
    expect(summary.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. applyUpstreamGateTechnicalBlockersToQa — folds blockers into qa.status.
// ---------------------------------------------------------------------------

describe("Phase 4 — applyUpstreamGateTechnicalBlockersToQa", () => {
  function passingQa() {
    return { status: "pass", checks: [], issues: [], score: 100 };
  }

  test("no upstream gate → qa unchanged", () => {
    const qa = passingQa();
    const result = applyUpstreamGateTechnicalBlockersToQa(qa, null);
    expect(result).toBe(qa);
  });

  test("upstream gate with no technical blockers → qa unchanged", () => {
    const gate = evaluateFinalA1ExportGate(gateInputs());
    const qa = passingQa();
    const result = applyUpstreamGateTechnicalBlockersToQa(qa, gate);
    expect(result.status).toBe("pass");
    expect(result.upstreamGateTechnicalBlocked).toBeUndefined();
  });

  test("PANEL_CONTENT_EMPTY → qa.status=fail with code A1_EXPORT_GATE_TECHNICAL_BLOCKED", () => {
    const panels = fullPanelSet().map((panel) =>
      panel.type === "floor_plan_ground" ? blankPanel(panel.type) : panel,
    );
    const gate = evaluateFinalA1ExportGate(gateInputs({ panels }));
    const result = applyUpstreamGateTechnicalBlockersToQa(passingQa(), gate);
    expect(result.status).toBe("fail");
    expect(result.upstreamGateTechnicalBlocked).toBe(true);
    expect(result.issues[0].code).toBe("A1_EXPORT_GATE_TECHNICAL_BLOCKED");
    expect(result.issues[0].severity).toBe("error");
    expect(result.issues[0].details.codes).toContain("PANEL_CONTENT_EMPTY");
    expect(result.issues[0].details.blockedPanels[0].type).toBe(
      "floor_plan_ground",
    );
    const check = result.checks.find(
      (c) => c.code === "A1_EXPORT_GATE_TECHNICAL_PANELS_PASS",
    );
    expect(check).toBeDefined();
    expect(check.status).toBe("fail");
  });

  test("CROSS_VIEW_INCONSISTENT → qa.status=fail", () => {
    const drawings = {
      plan: [{ level_id: "0", svg: planSvg({ northArrow: false }) }],
      elevation: fullDrawingSet().elevation,
      section: fullDrawingSet().section,
    };
    const gate = evaluateFinalA1ExportGate(
      gateInputs({ drawings, projectGeometry: geometry({ levels: 1 }) }),
    );
    const result = applyUpstreamGateTechnicalBlockersToQa(passingQa(), gate);
    expect(result.status).toBe("fail");
    expect(result.issues[0].details.codes).toContain("CROSS_VIEW_INCONSISTENT");
  });

  test("visual-only failures → qa unchanged (warning-only at slice level)", () => {
    const visualPanels = [
      {
        type: "hero_3d",
        visualManifestHash: "different-hash",
        visualIdentityLocked: true,
      },
    ];
    const gate = evaluateFinalA1ExportGate(gateInputs({ visualPanels }));
    const qa = passingQa();
    const result = applyUpstreamGateTechnicalBlockersToQa(qa, gate);
    expect(result.status).toBe("pass");
    expect(result.upstreamGateTechnicalBlocked).toBeUndefined();
  });
});
