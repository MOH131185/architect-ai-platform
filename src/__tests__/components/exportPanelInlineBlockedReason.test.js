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
});
