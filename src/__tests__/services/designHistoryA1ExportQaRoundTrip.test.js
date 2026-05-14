/**
 * Pre-UI-smoke fix #4 — a1ExportQa round-trips through design history.
 *
 * Codex audit caught two gaps:
 *   1. `VERSION_METADATA_KEYS` in designHistoryRepository.js did not
 *      include `a1ExportQa`, so the QA gate was silently dropped on save.
 *   2. `buildSheetResultFromDesignHistoryEntry` in
 *      designHistoryResultHydrator.js never read `a1ExportQa`, so a
 *      QA-blocked design reloaded from history bypassed the ExportPanel
 *      banner + exportService refusal.
 *
 * Phase 3/4 export gate refuses sheet exports when
 * `sheet.a1ExportQa.status === "blocked"`. After this fix the same gate
 * fires for restored designs.
 */

import { buildSheetResultFromDesignHistoryEntry } from "../../services/designHistoryResultHydrator.js";

const BLOCKED_QA = Object.freeze({
  status: "blocked",
  blockers: [
    {
      code: "PANEL_GEOMETRY_HASH_MISMATCH",
      severity: "blocker",
      message: "Panel geometry hash mismatch (2D/3D).",
    },
  ],
});

const PASS_QA = Object.freeze({
  status: "pass",
  blockers: [],
});

describe("buildSheetResultFromDesignHistoryEntry — a1ExportQa restoration", () => {
  test("restores blocked a1ExportQa from top-level field", () => {
    const result = buildSheetResultFromDesignHistoryEntry({
      designId: "design-1",
      composedSheetUrl: "http://example.test/sheet.png",
      a1ExportQa: BLOCKED_QA,
      a1Sheet: { sheetId: "default" },
      metadata: {},
    });
    expect(result.a1ExportQa).toEqual(BLOCKED_QA);
    expect(result.metadata.a1ExportQa).toEqual(BLOCKED_QA);
    expect(result.sheetMetadata.a1ExportQa).toEqual(BLOCKED_QA);
    expect(result.a1Sheet.a1ExportQa).toEqual(BLOCKED_QA);
    expect(result.a1Sheet.metadata.a1ExportQa).toEqual(BLOCKED_QA);
  });

  test("restores a1ExportQa persisted inside metadata (VERSION_METADATA_KEYS path)", () => {
    // designHistoryRepository.sanitizeVersionMetadata pulls only the keys
    // listed in VERSION_METADATA_KEYS, so a1ExportQa survives on save via
    // `metadata.a1ExportQa` rather than at the top level.
    const result = buildSheetResultFromDesignHistoryEntry({
      designId: "design-2",
      composedSheetUrl: "http://example.test/sheet.png",
      a1Sheet: { sheetId: "default" },
      metadata: { a1ExportQa: BLOCKED_QA },
    });
    expect(result.a1ExportQa).toEqual(BLOCKED_QA);
  });

  test("restores a1ExportQa from a1Sheet.a1ExportQa fallback", () => {
    const result = buildSheetResultFromDesignHistoryEntry({
      designId: "design-3",
      composedSheetUrl: "http://example.test/sheet.png",
      a1Sheet: { sheetId: "default", a1ExportQa: BLOCKED_QA },
      metadata: {},
    });
    expect(result.a1ExportQa).toEqual(BLOCKED_QA);
  });

  test("preserves a passing a1ExportQa unchanged", () => {
    const result = buildSheetResultFromDesignHistoryEntry({
      designId: "design-4",
      composedSheetUrl: "http://example.test/sheet.png",
      a1ExportQa: PASS_QA,
      a1Sheet: { sheetId: "default" },
      metadata: {},
    });
    expect(result.a1ExportQa).toEqual(PASS_QA);
  });

  test("returns undefined a1ExportQa when nothing was persisted (no false-positive gate)", () => {
    const result = buildSheetResultFromDesignHistoryEntry({
      designId: "design-5",
      composedSheetUrl: "http://example.test/sheet.png",
      a1Sheet: { sheetId: "default" },
      metadata: {},
    });
    expect(result.a1ExportQa).toBeUndefined();
  });

  test("top-level a1ExportQa wins over metadata.a1ExportQa when both are present", () => {
    const TOP = {
      ...BLOCKED_QA,
      blockers: [{ code: "TOP", severity: "blocker" }],
    };
    const META = {
      ...BLOCKED_QA,
      blockers: [{ code: "META", severity: "blocker" }],
    };
    const result = buildSheetResultFromDesignHistoryEntry({
      designId: "design-6",
      composedSheetUrl: "http://example.test/sheet.png",
      a1ExportQa: TOP,
      a1Sheet: { sheetId: "default" },
      metadata: { a1ExportQa: META },
    });
    expect(result.a1ExportQa).toEqual(TOP);
  });
});

describe("designHistoryRepository VERSION_METADATA_KEYS — a1ExportQa allowlisted", () => {
  test("includes a1ExportQa so sanitizeVersionMetadata persists it", () => {
    // The keys list is a private constant; assert via the module's source
    // (the repository file is a CJS module loaded by other tests too).
    // Reading the source rather than importing keeps this test independent
    // of the storage adapter wiring.
    // eslint-disable-next-line global-require
    const fs = require("fs");
    // eslint-disable-next-line global-require
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../services/designHistoryRepository.js"),
      "utf8",
    );
    const match = src.match(
      /const VERSION_METADATA_KEYS\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(match).toBeTruthy();
    expect(match[1]).toMatch(/"a1ExportQa"/);
  });
});
