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
  test("ExportRow declares an inline reason data-testid that is gated on showBlockedReason", () => {
    // Track 1 (Phase 1) renamed `showInlineReason` → `showBlockedReason`
    // and introduced a separate `showSubtitle` for the always-visible
    // degraded "NOT FINAL — not for issue or construction" line. Either
    // path must still be conditional, not always rendered.
    expect(SOURCE).toMatch(
      /const\s+showBlockedReason\s*=\s*isBlocked\s*&&\s*Boolean\(blockedReason\)/,
    );
    expect(SOURCE).toMatch(/data-testid="export-blocked-reason"/);
  });

  test("ExportRow short-circuits the inline reason when no blockedReason", () => {
    // The block must be conditional, not always rendered — otherwise we'd
    // print "Not yet generated" under every READY row.
    expect(SOURCE).toMatch(/showBlockedReason\s*&&\s*\(/);
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
    // Track 1 (Phase 1): sheetQaBlocked now distinguishes hard blocks
    // from degraded exports. It must fire on `allowed === false` (the
    // gate's most explicit veto, never softenable) and on legacy
    // status:"blocked" records without `degradedExport === true`. A
    // status:"blocked" + degradedExport:true record means the PDF was
    // emitted with a PRELIMINARY watermark — sheet exports stay open.
    expect(SOURCE).toMatch(
      /sheetQaBlocked\s*=[\s\S]{0,80}a1ExportQa\?\.allowed\s*===\s*false[\s\S]{0,160}a1ExportQa\?\.status\s*===\s*"blocked"[\s\S]{0,160}a1ExportQa\?\.degradedExport\s*!==\s*true/,
    );
    expect(SOURCE).toMatch(
      /sheetQaWarning\s*=[\s\S]{0,200}a1ExportQa\?\.status\s*===\s*"warning"/,
    );
  });

  test("sheetQaBlocked fires on allowed:false even when status is not 'blocked' (defence in depth)", () => {
    // The widened predicate covers cases where a gate demotes via
    // `allowed: false` but leaves `status: "pass"` or "warning". Without
    // this, exports could slip past the banner + service refusal.
    expect(SOURCE).toMatch(/a1ExportQa\?\.allowed\s*===\s*false/);
  });

  test("sheetQaDegraded is computed and is mutually exclusive with sheetQaBlocked", () => {
    // Track 1 (Phase 1) + Codex audit: degraded exports must be a third
    // state (status "degraded" or degradedExport:true), distinct from
    // blocked. The two predicates must NEVER both be true for the same
    // a1ExportQa — `sheetQaDegraded` is gated on `!sheetQaBlocked`.
    expect(SOURCE).toMatch(
      /sheetQaDegraded\s*=\s*\n?\s*!sheetQaBlocked\s*&&[\s\S]{0,200}a1ExportQa\?\.degradedExport\s*===\s*true/,
    );
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
      /data-testid="a1-qa-blocked-banner"[\s\S]{0,400}A1 export blocked — sheet failed final QA\./,
    );
  });

  test("QA-warning banner is rendered when status === 'warning' and not blocked", () => {
    expect(SOURCE).toMatch(/data-testid="a1-qa-warning-banner"/);
    // Track 1 (Phase 1): `sheetQaWarning` is itself defined as
    // `!sheetQaBlocked && !sheetQaDegraded && status === "warning"`, so
    // the JSX condition is now just `{sheetQaWarning && (`. The
    // exclusivity used to be re-asserted in the JSX expression; that
    // duplication is gone.
    expect(SOURCE).toMatch(/\{sheetQaWarning\s*&&\s*\(/);
  });

  // --------------------------------------------------------------------
  // Track 1 (Phase 1) + Codex audit: degraded export contract
  // --------------------------------------------------------------------

  test("QA-degraded banner is rendered with PRELIMINARY copy when degradedExport is true", () => {
    expect(SOURCE).toMatch(/data-testid="a1-qa-degraded-banner"/);
    expect(SOURCE).toMatch(
      /data-testid="a1-qa-degraded-banner"[\s\S]{0,500}Export degraded — PDF emitted with PRELIMINARY stamp\./,
    );
  });

  test("Copy QA report button is reachable from every QA banner", () => {
    // The Copy button uses a single internal `CopyQaReportButton` helper
    // — must be invoked from blocked, degraded, and warning banner JSX.
    const matches = SOURCE.match(/<CopyQaReportButton\s+tone=/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(SOURCE).toMatch(/data-testid="a1-qa-copy-report"/);
  });

  test("sheet export rows (PDF/PNG) receive degraded status + NOT-FINAL subtitle", () => {
    // Codex audit blocker: degraded sheet rows must NEVER render as plain
    // green READY. The PDF/PNG rows must take `status` + `subtitle` props
    // wired to the QA-aware helpers; ExportRow then renders an amber
    // PRELIMINARY chip + the "NOT FINAL — not for issue or construction"
    // subtitle line.
    expect(SOURCE).toMatch(
      /label="Export as PDF"[\s\S]{0,400}status=\{sheetExportStatus\("pdf"\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as PDF"[\s\S]{0,400}subtitle=\{sheetExportSubtitle\("pdf"\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as PNG"[\s\S]{0,400}status=\{sheetExportStatus\("png"\)\}/,
    );
    expect(SOURCE).toMatch(
      /label="Export as PNG"[\s\S]{0,400}subtitle=\{sheetExportSubtitle\("png"\)\}/,
    );
    expect(SOURCE).toMatch(
      /sheetExportSubtitle\s*=[\s\S]{0,200}NOT FINAL — not for issue or construction/,
    );
  });

  test("ExportRow renders a degraded subtitle data-testid when status is 'degraded'", () => {
    // Confirms the ExportRow component itself exposes a regression marker
    // so QA / a11y tooling can detect the degraded visual without
    // inspecting style classes.
    expect(SOURCE).toMatch(
      /data-testid=\{[\s\S]{0,80}"export-degraded-subtitle"[\s\S]{0,80}\}/,
    );
    expect(SOURCE).toMatch(
      /data-export-degraded=\{isDegraded\s*\?\s*"true"\s*:\s*undefined\}/,
    );
  });

  test("ExportRow disables the button only for hard-blocked rows; degraded stays clickable", () => {
    // The watermarked PDF is still meant to be downloadable. ExportRow
    // must not flip `disabled` on degraded rows.
    expect(SOURCE).toMatch(
      /const\s+isDisabled\s*=\s*isBlocked\s*\|\|\s*\(!available\s*&&\s*!isDegraded\)/,
    );
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
