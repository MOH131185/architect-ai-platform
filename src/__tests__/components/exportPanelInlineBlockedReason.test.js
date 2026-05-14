/**
 * Phase 2 export-fix — ExportPanel must surface blocked reasons inline.
 *
 * Pre-Phase-2, blocked reasons were only available through a hover tooltip
 * on the StatusChip. That made the reason effectively invisible on touch
 * devices and on quick visual scans. ExportPanel is mounted via heavy
 * dependency-mocked component tests elsewhere; this regression marker uses
 * a structural source check (matching the pattern of
 * architectAIWizardHandleExportRethrow.test.js) so the contract is locked
 * down without spinning up a full render.
 *
 * The contract: when an export row is `!available && blockedReason`, the
 * component renders a secondary <span> with `data-testid="export-blocked-reason"`
 * containing the human-readable reason. Removing that block would silently
 * regress the UX back to tooltip-only.
 */

import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../components/ExportPanel.jsx"),
  "utf8",
);

describe("ExportPanel — inline blocked reason rendering", () => {
  test("ExportRow declares an inline reason data-testid that is gated on showInlineReason", () => {
    expect(SOURCE).toMatch(
      /const\s+showInlineReason\s*=\s*!available\s*&&\s*Boolean\(blockedReason\)/,
    );
    expect(SOURCE).toMatch(/data-testid="export-blocked-reason"/);
  });

  test("ExportRow short-circuits the inline reason when no blockedReason", () => {
    // The block must be conditional, not always rendered — otherwise we'd
    // print "Not yet generated" under every READY row.
    expect(SOURCE).toMatch(/showInlineReason\s*&&\s*\(/);
  });

  test("BLOCKED_REASON_LABELS still maps the structured codes ExportPanel cares about", () => {
    for (const code of [
      "COMPILED_PROJECT_MISSING",
      "GEOMETRY_HASH_MISSING",
      "IFC_GEOMETRY_INSUFFICIENT",
      "QUANTITY_TAKEOFF_UNAVAILABLE",
    ]) {
      expect(SOURCE).toContain(code);
    }
  });

  test("geometryHash resolution prefers the top-level field (Phase 2 contract)", () => {
    // After Phase 2, the wizard hook attaches geometryHash at top level so
    // it survives design-history hydration. The panel must read that first
    // — falling back to compiledProject.geometryHash for freshly-generated
    // sheets keeps the current path intact.
    expect(SOURCE).toMatch(
      /geometryHash\s*=\s*\n?\s*designData\?\.geometryHash\s*\|\|\s*\n?\s*designData\?\.compiledProject\?\.geometryHash/,
    );
  });

  test("ExportRow tags the rendered button with status + blocked-reason data attributes", () => {
    // Lets QA + a11y tooling enumerate which rows are blocked without
    // depending on visual styling.
    expect(SOURCE).toMatch(/data-export-status=\{status\}/);
    expect(SOURCE).toMatch(/data-export-blocked-reason=/);
  });

  test("imports applyHistoryRestoreGate from the manifest module", () => {
    // Phase 2 amendment — without this import the gate isn't wired up.
    // Prettier breaks the line at the curly, leaving a trailing comma
    // after `applyHistoryRestoreGate,` so the regex must allow it.
    expect(SOURCE).toMatch(
      /import\s+buildClientExportManifest\s*,\s*\{\s*applyHistoryRestoreGate\s*,?\s*\}/,
    );
  });

  test("manifest resolution funnels through applyHistoryRestoreGate", () => {
    // The hydrator-restored manifest must be passed through the gate so
    // engineering rows are forced OFF when compiledProject is absent.
    expect(SOURCE).toMatch(
      /return\s+applyHistoryRestoreGate\(\{[^}]*restoredFromHistory:\s*designData\?\.restoredFromHistory\s*===\s*true[^}]*hasCompiledProject:\s*Boolean\(designData\?\.compiledProject\)/,
    );
  });

  test("BLOCKED_REASON_LABELS includes the regenerate-required label", () => {
    // The structured code must map to the user-readable string the
    // reviewer specified; otherwise the inline reason renders the raw
    // code as fallback.
    expect(SOURCE).toMatch(
      /REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT:\s*\n?\s*"Regenerate required — compiled project was not persisted in history\."/,
    );
  });

  test("Authority chip (geometryHash display) is preserved when engineering rows are disabled", () => {
    // The authority block must keep rendering when geometryHash is
    // present, even after the gate disables every engineering row. We
    // assert the source still wraps the chip in `{geometryHash && (...)}`
    // — the gate doesn't strip geometryHash from the manifest.
    expect(SOURCE).toMatch(
      /\{geometryHash\s*&&\s*\(\s*\n?\s*<div[^>]*>[\s\S]*?text-eyebrow[\s\S]*?Authority/,
    );
  });

  // --------------------------------------------------------------------
  // Phase 3 export-fix: A1 QA blocking surface
  // --------------------------------------------------------------------

  test("BLOCKED_REASON_LABELS includes the A1_QA_BLOCKED label", () => {
    expect(SOURCE).toMatch(
      /A1_QA_BLOCKED:\s*\n?\s*"A1 export blocked — sheet failed final layout\/readability QA\."/,
    );
  });

  test("ExportPanel reads a1ExportQa.status from designData", () => {
    expect(SOURCE).toMatch(/designData\?\.a1ExportQa/);
    // Post-UI-smoke QA-wiring fix: sheetQaBlocked must also fire on
    // `allowed === false`, not only `status === "blocked"`. The
    // multiline + flexible whitespace allows either ordering after
    // prettier wraps the line.
    expect(SOURCE).toMatch(
      /sheetQaBlocked\s*=\s*\n?\s*a1ExportQa\?\.status\s*===\s*"blocked"\s*\|\|\s*a1ExportQa\?\.allowed\s*===\s*false/,
    );
    expect(SOURCE).toMatch(
      /sheetQaWarning\s*=\s*!sheetQaBlocked\s*&&\s*a1ExportQa\?\.status\s*===\s*"warning"/,
    );
  });

  test("sheetQaBlocked fires on allowed:false even when status is not 'blocked' (defence in depth)", () => {
    // The widened predicate covers cases where a gate demotes via
    // `allowed: false` but leaves `status: "pass"` or "warning". Without
    // this, exports could slip past the banner + service refusal.
    expect(SOURCE).toMatch(/a1ExportQa\?\.allowed\s*===\s*false/);
  });

  test("sheet export rows (PNG/PDF) route through the QA-gated helpers", () => {
    expect(SOURCE).toMatch(
      /label="Export as PDF"[\s\S]{0,200}available=\{sheetExportAvailable\("pdf",\s*true\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as PNG"[\s\S]{0,200}available=\{sheetExportAvailable\("png",\s*true\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as PDF"[\s\S]{0,200}blockedReason=\{sheetExportBlockedReason\("pdf"\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as PNG"[\s\S]{0,200}blockedReason=\{sheetExportBlockedReason\("png"\)\}/,
    );
  });

  test("sheetExportAvailable returns false for PNG/PDF/SVG when QA blocked", () => {
    expect(SOURCE).toMatch(
      /if\s*\(\s*sheetQaBlocked\s*&&\s*isSheetKey\(key\)\s*\)\s*return\s+false/,
    );
    expect(SOURCE).toMatch(
      /SHEET_EXPORT_KEYS\s*=\s*\[\s*"png",\s*"pdf",\s*"svg"\s*\]/,
    );
  });

  test("QA-blocked banner is rendered with the required testid + role copy", () => {
    expect(SOURCE).toMatch(
      /data-testid="a1-qa-blocked-banner"[\s\S]{0,300}A1 export blocked — sheet failed final layout\/readability QA\./,
    );
  });

  test("QA-warning banner is rendered when status === 'warning' and not blocked", () => {
    expect(SOURCE).toMatch(/data-testid="a1-qa-warning-banner"/);
    expect(SOURCE).toMatch(/\{sheetQaWarning\s*&&\s*!sheetQaBlocked\s*&&/);
  });

  test("engineering rows still use the Phase-2 helpers — QA gate is sheet-scoped only", () => {
    // DXF/IFC/JSON/XLSX continue to read from `isAvailable` + `blockedReason`,
    // not the new sheet-gated helpers. The QA gate is intentionally
    // restricted to PNG/PDF/SVG (the print master) — engineering rows
    // have their own readiness logic (Phase 2 manifest + restore gate).
    expect(SOURCE).toMatch(
      /label="Export as DXF \(CAD\)"[\s\S]{0,200}available=\{isAvailable\("dxf",\s*false\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as IFC \(BIM\)"[\s\S]{0,200}available=\{isAvailable\("ifc",\s*false\)\}/,
    );
  });
});
