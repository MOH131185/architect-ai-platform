/**
 * Post-UI-smoke QA-wiring fix — `buildA1ExportQaFromGate` contract.
 *
 * Codex audit caught that panel QA "fail" never folded into a1ExportQa,
 * so a sheet whose own PDF /Subject metadata read "QA status: fail"
 * could still be downloaded — neither the ExportPanel red banner nor
 * the exportService refusal fired. This helper consolidates the two
 * parallel QA channels (structured export gate + panel QA reducer) into
 * a single contract every consumer can trust.
 *
 * Tests target the helper directly via __projectGraphVerticalSliceInternals
 * to avoid spinning up the rest of the slice machinery.
 */

import { __projectGraphVerticalSliceInternals } from "../../services/project/projectGraphVerticalSliceService.js";

const { buildA1ExportQaFromGate } = __projectGraphVerticalSliceInternals;

const PASS_GATE = Object.freeze({
  status: "pass",
  allowed: true,
  blockers: [],
  warnings: [],
  demotedToPreview: false,
  scope: "compose_final",
  version: "phase-f-a1-export-gate-v1",
});

describe("buildA1ExportQaFromGate", () => {
  test("returns null when both inputs are absent", () => {
    expect(buildA1ExportQaFromGate({})).toBeNull();
    expect(buildA1ExportQaFromGate()).toBeNull();
    expect(
      buildA1ExportQaFromGate({ exportGate: null, panelQaSummary: null }),
    ).toBeNull();
  });

  test("panel QA fail forces blocked + allowed:false + PANEL_QA_FAILED blocker", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "fail" },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.panelQaStatus).toBe("fail");
    expect(
      result.blockers.some(
        (b) => b?.code === "PANEL_QA_FAILED" && b?.severity === "blocker",
      ),
    ).toBe(true);
  });

  test("panel QA 'failed' is treated the same as 'fail'", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "failed" },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
  });

  test("panel QA 'blocked' (defensive) is treated as fail", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "blocked" },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
  });

  test("panel QA warn appends PANEL_QA_WARNING; does NOT escalate to blocked", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "warn" },
    });
    expect(result.status).toBe("warning");
    expect(result.allowed).toBe(true);
    expect(
      result.warnings.some(
        (w) => w?.code === "PANEL_QA_WARNING" && w?.severity === "warning",
      ),
    ).toBe(true);
    expect(result.blockers.some((b) => b?.code === "PANEL_QA_FAILED")).toBe(
      false,
    );
  });

  test("export gate allowed:false forces blocked even if status is 'pass'", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE, allowed: false },
      panelQaSummary: { status: "passed" },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
  });

  test("export gate status 'blocked' is preserved (panel QA absent)", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        status: "blocked",
        allowed: false,
        blockers: [
          {
            code: "PANEL_GEOMETRY_HASH_MISMATCH",
            severity: "blocker",
            message: "2D/3D mismatch",
          },
        ],
        warnings: [],
      },
      panelQaSummary: null,
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(
      result.blockers.some((b) => b?.code === "PANEL_GEOMETRY_HASH_MISMATCH"),
    ).toBe(true);
    // No PANEL_QA_FAILED because panel QA was not provided.
    expect(result.blockers.some((b) => b?.code === "PANEL_QA_FAILED")).toBe(
      false,
    );
  });

  test("export gate status 'fail' (defensive) maps to blocked", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { status: "fail", allowed: true },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
  });

  test("clean pass — both channels green produce status 'pass'", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "passed" },
    });
    expect(result.status).toBe("pass");
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.panelQaStatus).toBe("passed");
  });

  test("invariant — status === 'blocked' whenever allowed is false", () => {
    const cases = [
      { exportGate: { ...PASS_GATE, allowed: false } },
      {
        exportGate: { ...PASS_GATE },
        panelQaSummary: { status: "fail" },
      },
      { exportGate: { status: "blocked", allowed: false } },
    ];
    for (const input of cases) {
      const result = buildA1ExportQaFromGate(input);
      if (result.allowed === false) {
        expect(result.status).toBe("blocked");
      }
    }
  });

  test("does not mutate input arrays", () => {
    const gateBlockers = [{ code: "ORIG_BLOCK", severity: "blocker" }];
    const gateWarnings = [{ code: "ORIG_WARN", severity: "warning" }];
    const exportGate = {
      ...PASS_GATE,
      blockers: gateBlockers,
      warnings: gateWarnings,
    };
    buildA1ExportQaFromGate({
      exportGate,
      panelQaSummary: { status: "fail" },
    });
    // Inputs untouched.
    expect(gateBlockers).toEqual([{ code: "ORIG_BLOCK", severity: "blocker" }]);
    expect(gateWarnings).toEqual([{ code: "ORIG_WARN", severity: "warning" }]);
  });

  test("reads qaStatus alias when panelQaSummary uses that key", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { qaStatus: "fail" },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.panelQaStatus).toBe("fail");
  });

  test("only panel QA provided — gate absent — emits a usable shape", () => {
    const result = buildA1ExportQaFromGate({
      panelQaSummary: { status: "fail" },
    });
    expect(result).not.toBeNull();
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("compose_final");
    expect(result.version).toBe("phase-f-a1-export-gate-v1");
    expect(result.blockers.some((b) => b?.code === "PANEL_QA_FAILED")).toBe(
      true,
    );
  });
});
