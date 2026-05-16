/**
 * Phase 3 audit response — costSummary wiring contract.
 *
 * Codex caught that the original Phase 3 surfacing was wired into the
 * legacy V2 pipeline, not the production ProjectGraph slice. This is a
 * structural source-grep regression marker (same pattern as
 * exportPanelInlineBlockedReason.test.js) that pins the wiring so a
 * future refactor of the slice can't silently drop the costSummary
 * surface.
 *
 * The wiring chain we lock down here:
 *   1. projectGraphVerticalSliceService imports buildCostSummary
 *   2. projectGraphVerticalSliceService passes the real
 *      `technicalBuild.mepModel` into buildProjectQuantityTakeoff
 *   3. projectGraphVerticalSliceService computes a `projectCostSummary`
 *      after the takeoff and exposes it on `artifacts.costSummary` AND
 *      on the top-level result
 *   4. useArchitectAIWorkflow surfaces `costSummary` from either source
 *      and threads it through buildClientExportManifest
 */

import fs from "fs";
import path from "path";

const SLICE_SOURCE = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../services/project/projectGraphVerticalSliceService.js",
  ),
  "utf8",
);

const WORKFLOW_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../../hooks/useArchitectAIWorkflow.js"),
  "utf8",
);

describe("ProjectGraph slice costSummary wiring (Codex audit)", () => {
  test("slice imports buildCostSummary from compiledProjectExportService", () => {
    expect(SLICE_SOURCE).toMatch(
      /import\s*\{\s*buildCostSummary\s*\}\s*from\s*"\.\/compiledProjectExportService\.js"/,
    );
  });

  test("slice passes the real technicalBuild.mepModel into buildProjectQuantityTakeoff", () => {
    // The takeoff call must include `mepModel` so MEP rows actually
    // come through. Without this, MEP_DRAWINGS_ENABLED=true produces
    // structural/MEP panels but zero MEP cost items.
    expect(SLICE_SOURCE).toMatch(
      /buildProjectQuantityTakeoff\([^)]*\{[^}]*mepModel\s*:[^}]*\}/s,
    );
    expect(SLICE_SOURCE).toMatch(
      /productionMepModel\s*=\s*technicalBuild\?\.\s*mepModel/,
    );
  });

  test("slice calls buildCostSummary after the takeoff and stores it in projectCostSummary", () => {
    expect(SLICE_SOURCE).toMatch(/let\s+projectCostSummary\s*=\s*null/);
    expect(SLICE_SOURCE).toMatch(/projectCostSummary\s*=\s*buildCostSummary\(/);
  });

  test("slice surfaces costSummary on artifacts AND at the top-level result", () => {
    // artifacts.costSummary = projectCostSummary
    expect(SLICE_SOURCE).toMatch(
      /costSummary:\s*projectCostSummary,[\s\S]{0,400}projectGeometry/,
    );
    // top-level costSummary, immediately after a1ExportQa
    expect(SLICE_SOURCE).toMatch(
      /a1ExportQa,[\s\S]{0,300}costSummary:\s*projectCostSummary/,
    );
  });

  test("useArchitectAIWorkflow surfaces costSummary at the top-level workflow output", () => {
    expect(WORKFLOW_SOURCE).toMatch(
      /costSummary:[\s\S]{0,200}verticalSlice\.costSummary[\s\S]{0,200}verticalSlice\.artifacts\?\.\s*costSummary/,
    );
  });

  test("useArchitectAIWorkflow threads costSummary into buildClientExportManifest", () => {
    expect(WORKFLOW_SOURCE).toMatch(
      /buildClientExportManifest\(\{[\s\S]{0,800}costSummary:[\s\S]{0,200}verticalSlice\.costSummary/,
    );
  });
});
