/**
 * Phase 2 export-fix — V1 ProjectGraph result attaches the engineering
 * bundle at top level.
 *
 * The full hook can't be exercised in isolation (depends on the slice API,
 * sheet composition, design-history persistence, etc.), and the
 * components mounting it use heavy mocks. The contract we care about for
 * Phase 2 is narrow: after `buildArchitectureProjectVerticalSlice`
 * resolves, the returned design object MUST expose top-level fields for
 *   - `compiledProject`
 *   - `geometryHash`
 *   - `projectQuantityTakeoff`
 *   - `sheetArtifactManifest`
 *   - `exportManifest`
 * so design-history persistence has named fields to preserve and
 * ExportPanel can render correct readiness without diving into
 * `artifacts.*` (which has historically shifted shape).
 *
 * Structural source check matches the pattern other hook tests in this
 * repo use (see `projectGraphPayload.test.js` for precedent) — it locks
 * the contract without spinning up React + fetch + slice machinery.
 */

import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../hooks/useArchitectAIWorkflow.js"),
  "utf8",
);

function extractProjectGraphReturnBlock() {
  // Locate the `workflow: PIPELINE_MODE.PROJECT_GRAPH,` marker inside the
  // `return { ... }` of the V1 normaliser and walk forward until braces
  // balance. Keeps the test resilient to surrounding refactors.
  const marker = "workflow: PIPELINE_MODE.PROJECT_GRAPH,";
  const startIdx = SOURCE.indexOf(marker);
  expect(startIdx).toBeGreaterThan(-1);
  // Scan backwards to the enclosing `{`.
  let braceStart = startIdx;
  while (braceStart > 0 && SOURCE[braceStart] !== "{") braceStart -= 1;
  let depth = 0;
  let i = braceStart;
  while (i < SOURCE.length) {
    const ch = SOURCE[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(braceStart, i + 1);
    }
    i += 1;
  }
  return null;
}

describe("useArchitectAIWorkflow V1 ProjectGraph result — engineering bundle attach", () => {
  let block;
  beforeAll(() => {
    block = extractProjectGraphReturnBlock();
    expect(block).toBeTruthy();
  });

  test("returns top-level compiledProject", () => {
    expect(block).toMatch(/^\s*compiledProject:\s*/m);
  });

  test("returns top-level geometryHash", () => {
    expect(block).toMatch(/^\s*geometryHash:\s*/m);
  });

  test("returns top-level projectQuantityTakeoff (Phase 2)", () => {
    expect(block).toMatch(/^\s*projectQuantityTakeoff:\s*/m);
  });

  test("returns top-level sheetArtifactManifest (Phase 2)", () => {
    expect(block).toMatch(/^\s*sheetArtifactManifest:\s*/m);
  });

  test("returns top-level exportManifest built via buildClientExportManifest", () => {
    expect(block).toMatch(/exportManifest:\s*buildClientExportManifest\(/);
  });
});
