/**
 * Pre-UI-smoke fix #1 — fresh PROJECT_GRAPH result must win over input
 * designSpec.
 *
 * Codex audit caught a regression in the V2 / multi_panel result
 * normalisation block: `compiledProject`, `projectQuantityTakeoff`, and
 * `geometryHash` were pulled from `params.designSpec` first, so a stale
 * designSpec could overwrite the fresh raw ProjectGraph result. Same
 * pattern for `exportManifest`, `sheetArtifactManifest`, and the newly
 * added `a1ExportQa` extraction.
 *
 * The hook depends on React + the slice API + design-history persistence,
 * so this test uses the same source-string-contract pattern as the
 * existing engineering-attach test — it locks the priority order of each
 * `||` chain without spinning up the full pipeline. The exact chains are
 * captured below; any future refactor that drops `multiPanelResult?.` from
 * the first position will fail this test.
 */

import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../hooks/useArchitectAIWorkflow.js"),
  "utf8",
);

describe("useArchitectAIWorkflow — fresh PROJECT_GRAPH result authority", () => {
  test("compiledProject prefers multiPanelResult over designSpec", () => {
    expect(SOURCE).toMatch(
      /const compiledProject\s*=\s*\n\s*multiPanelResult\?\.compiledProject\s*\|\|\s*\n\s*params\.designSpec\?\.compiledProject/,
    );
  });

  test("projectQuantityTakeoff prefers multiPanelResult over designSpec", () => {
    expect(SOURCE).toMatch(
      /const projectQuantityTakeoff\s*=\s*\n\s*multiPanelResult\?\.projectQuantityTakeoff\s*\|\|\s*\n\s*params\.designSpec\?\.projectQuantityTakeoff/,
    );
  });

  test("geometryHash prefers multiPanelResult top-level over compiledProject-derived", () => {
    expect(SOURCE).toMatch(
      /const geometryHash\s*=\s*\n\s*multiPanelResult\?\.geometryHash\s*\|\|\s*\n\s*compiledProject\?\.geometryHash/,
    );
  });

  test("serverExportManifest prefers multiPanelResult top-level over metadata", () => {
    expect(SOURCE).toMatch(
      /const serverExportManifest\s*=\s*\n\s*multiPanelResult\?\.exportManifest\s*\|\|\s*\n\s*multiPanelResult\?\.metadata\?\.exportManifest/,
    );
  });

  test("sheetArtifactManifest prefers multiPanelResult.sheetArtifactManifest over rebuilt one", () => {
    expect(SOURCE).toMatch(
      /const sheetArtifactManifest\s*=\s*\n\s*multiPanelResult\?\.sheetArtifactManifest\s*\|\|\s*\n\s*createSheetArtifactManifest\(/,
    );
  });

  test("a1ExportQa is extracted with multiPanelResult-first priority", () => {
    expect(SOURCE).toMatch(
      /const a1ExportQa\s*=\s*\n\s*multiPanelResult\?\.a1ExportQa\s*\|\|\s*\n\s*multiPanelResult\?\.metadata\?\.a1ExportQa/,
    );
  });

  test("a1ExportQa is surfaced on sheetResult top-level (V2 normaliser)", () => {
    // The V2/multi_panel sheetResult object lists `a1ExportQa,` right after
    // `sheetArtifactManifest,` so it flows into history + ExportPanel.
    expect(SOURCE).toMatch(/sheetArtifactManifest,\s*\n\s*a1ExportQa,/);
  });

  test("a1ExportQa is also surfaced on metadata so it persists via VERSION_METADATA_KEYS", () => {
    // `metadata: { ... sheetArtifactManifest, a1ExportQa, panelCount: ... }`
    expect(SOURCE).toMatch(
      /sheetArtifactManifest,\s*\n\s*a1ExportQa,\s*\n\s*panelCount:/,
    );
  });
});
