/**
 * Phase 6 — Codex audit blocker #2 response.
 *
 * Locks the client-side hard-block contract for
 * exportService.exportHandoffPackage:
 *   1. allowed:false with NO blockers → refuse (legacy unsoftenable veto).
 *   2. unknown-category blocker → refuse.
 *   3. authority/geometry blocker → refuse.
 *   4. readability/graphic blocker → ALLOW (degraded mode).
 *   5. clean QA → ALLOW.
 *
 * Tests intercept the fetch so they never actually hit the network.
 */

import exportService from "../../services/exportService.js";

function sheetWithQa(a1ExportQa) {
  return {
    a1ExportQa,
    artifacts: {
      a1Sheet: { svgString: "<svg/>" },
    },
    projectId: "phase6-hard-block-test",
    projectName: "Phase 6 hard block test",
  };
}

describe("exportService.exportHandoffPackage — hard-block contract", () => {
  let originalFetch;
  let fetchInvoked;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchInvoked = false;
    globalThis.fetch = jest.fn(async () => {
      fetchInvoked = true;
      return {
        ok: true,
        headers: { get: () => null },
        blob: async () =>
          new Blob([new Uint8Array([0x50, 0x4b])], { type: "application/zip" }),
        json: async () => ({}),
      };
    });
    // Avoid the URL.createObjectURL / link.click DOM mock.
    if (!globalThis.URL?.createObjectURL) {
      globalThis.URL = globalThis.URL || {};
      globalThis.URL.createObjectURL = jest.fn(() => "blob:mock");
      globalThis.URL.revokeObjectURL = jest.fn();
    }
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("allowed:false with NO blockers → refuses + does not POST", async () => {
    const sheet = sheetWithQa({
      allowed: false,
      status: "blocked",
      blockers: [],
      warnings: [],
    });
    await expect(exportService.exportHandoffPackage({ sheet })).rejects.toThrow(
      /allowed:false/i,
    );
    expect(fetchInvoked).toBe(false);
  });

  test("unknown-category blocker → refuses + does not POST", async () => {
    const sheet = sheetWithQa({
      allowed: true,
      status: "blocked",
      blockers: [
        { category: "unknown", code: "MYSTERY_FAILURE", message: "?" },
      ],
      warnings: [],
    });
    await expect(exportService.exportHandoffPackage({ sheet })).rejects.toThrow(
      /unknown/i,
    );
    expect(fetchInvoked).toBe(false);
  });

  test("authority-category blocker → refuses", async () => {
    const sheet = sheetWithQa({
      allowed: false,
      status: "blocked",
      blockers: [
        {
          category: "authority",
          code: "GEOMETRY_SIGNATURE_FAILED",
          message: "x",
        },
      ],
      warnings: [],
    });
    await expect(exportService.exportHandoffPackage({ sheet })).rejects.toThrow(
      /authority/i,
    );
    expect(fetchInvoked).toBe(false);
  });

  test("geometry-category blocker → refuses", async () => {
    const sheet = sheetWithQa({
      allowed: false,
      status: "blocked",
      blockers: [
        { category: "geometry", code: "EDGE_CONSISTENCY_FAILED", message: "x" },
      ],
      warnings: [],
    });
    await expect(exportService.exportHandoffPackage({ sheet })).rejects.toThrow(
      /geometry/i,
    );
    expect(fetchInvoked).toBe(false);
  });

  test("readability-only blocker (degraded) → allows + POSTs", async () => {
    const sheet = sheetWithQa({
      allowed: true,
      status: "degraded",
      degradedExport: true,
      blockers: [
        { category: "readability", code: "TEXT_PROOF_LOW", message: "x" },
      ],
      warnings: [{ message: "small text" }],
    });
    const result = await exportService.exportHandoffPackage({ sheet });
    expect(fetchInvoked).toBe(true);
    expect(result.format).toBe("HANDOFF");
  });

  test("clean QA → allows + POSTs", async () => {
    const sheet = sheetWithQa({
      allowed: true,
      status: "pass",
      blockers: [],
      warnings: [],
    });
    const result = await exportService.exportHandoffPackage({ sheet });
    expect(fetchInvoked).toBe(true);
    expect(result.format).toBe("HANDOFF");
  });

  test("no a1ExportQa attached → allows + POSTs (back-compat)", async () => {
    const sheet = {
      artifacts: { a1Sheet: { svgString: "<svg/>" } },
      projectId: "x",
    };
    const result = await exportService.exportHandoffPackage({ sheet });
    expect(fetchInvoked).toBe(true);
    expect(result.format).toBe("HANDOFF");
  });
});
