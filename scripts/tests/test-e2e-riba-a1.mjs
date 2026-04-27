/**
 * RIBA A1 Plan §9 acceptance test — Neighbourhood Reading Room.
 *
 * Loads fixtures/briefs/uk_small_community_library.json, drives
 * buildArchitectureProjectVerticalSlice end-to-end (no HTTP), then asserts
 * every pass criterion in plan §9 plus the §10 scorecard threshold of 85.
 *
 * Run: npm run test:e2e:riba
 *
 * Pass criteria (plan §9):
 *  - All programme spaces appear in schedule and plan (qa_status === "placed").
 *  - Actual GIA within ±15% of target.
 *  - Drawings and 3D share the same source_model_hash.
 *  - A1 PDF page size correct (841×594 mm).
 *  - Sheet contains source/provenance + professional-review disclaimer.
 *
 * Plan §10 scorecard: totalScore >= 85.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

import { buildArchitectureProjectVerticalSlice } from "../../src/services/project/projectGraphVerticalSliceService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const FIXTURE_PATH = resolve(
  REPO_ROOT,
  "fixtures/briefs/uk_small_community_library.json",
);
const GOLDEN_DIR = resolve(REPO_ROOT, "evals/golden/uk_library");
const MANIFEST_PATH = resolve(GOLDEN_DIR, "manifest.json");
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === "1";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const results = { passed: 0, failed: 0, tests: [] };

function expect(name, fn) {
  try {
    fn();
    results.passed += 1;
    results.tests.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed += 1;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------

if (!existsSync(FIXTURE_PATH)) {
  console.error(`✗ fixture missing at ${FIXTURE_PATH}`);
  process.exit(2);
}
if (!existsSync(MANIFEST_PATH)) {
  console.error(`✗ golden manifest missing at ${MANIFEST_PATH}`);
  process.exit(2);
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

// Match the env shape used by the Jest unit test, so deterministic-model
// resolution behaves identically.
process.env.MODEL_SOURCE = process.env.MODEL_SOURCE || "base";
process.env.OPENAI_REASONING_MODEL =
  process.env.OPENAI_REASONING_MODEL || "gpt-5.4";
process.env.OPENAI_FAST_MODEL =
  process.env.OPENAI_FAST_MODEL || "gpt-5.4-mini";

// ---------------------------------------------------------------------------
// Run vertical slice
// ---------------------------------------------------------------------------

console.log("\nRunning ProjectGraph vertical slice for Reading Room fixture...\n");
const t0 = Date.now();
let result;
try {
  result = await buildArchitectureProjectVerticalSlice({ brief: fixture });
} catch (error) {
  console.error(`\n✗ vertical slice threw: ${error.message}\n`);
  console.error(error.stack);
  process.exit(1);
}
const elapsedMs = Date.now() - t0;
console.log(`  vertical slice completed in ${elapsedMs} ms\n`);

// ---------------------------------------------------------------------------
// Plan §9 acceptance assertions
// ---------------------------------------------------------------------------

console.log("Plan §9 acceptance criteria:");

expect("vertical slice succeeded (qa.status === 'pass')", () => {
  assertEqual(result.success, true, "result.success");
  assertEqual(result.qa.status, "pass", "result.qa.status");
});

expect("model_version_id is non-empty and matches geometryHash slice", () => {
  const mvId = result.projectGraph.model_version_id;
  assert(typeof mvId === "string" && mvId.length > 0, "model_version_id missing");
  assert(
    mvId.includes(result.geometryHash.slice(0, 12)),
    `model_version_id (${mvId}) does not embed geometryHash prefix`,
  );
});

expect("every drawing.source_model_hash === geometryHash", () => {
  const drawings = result.projectGraph.drawings.drawings;
  assert(drawings.length >= 4, `expected ≥4 drawings, got ${drawings.length}`);
  for (const d of drawings) {
    assertEqual(
      d.source_model_hash,
      result.geometryHash,
      `drawing ${d.drawing_id} hash`,
    );
  }
});

expect("3D scene asset shares geometryHash", () => {
  assertEqual(
    result.artifacts.scene3d.source_model_hash,
    result.geometryHash,
    "scene3d hash",
  );
  assertEqual(
    result.projectGraph.models3d.models[0].source_model_hash,
    result.geometryHash,
    "models3d[0] hash",
  );
});

expect("A1 sheet artifact shares geometryHash", () => {
  assertEqual(
    result.artifacts.a1Sheet.source_model_hash,
    result.geometryHash,
    "a1Sheet hash",
  );
});

expect("A1 PDF artifact reports 841×594 mm", () => {
  const sm = result.artifacts.a1Pdf.sheet_size_mm;
  assertEqual(sm.width, 841, "PDF width mm");
  assertEqual(sm.height, 594, "PDF height mm");
  assertEqual(
    result.artifacts.a1Pdf.orientation,
    "landscape",
    "PDF orientation",
  );
});

await (async () => {
  // Re-parse the PDF dataUrl independently to verify physical page geometry.
  const dataUrl = result.artifacts.a1Pdf.dataUrl;
  const base64 = dataUrl.replace(/^data:application\/pdf;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  let pdf;
  let parseError = null;
  try {
    pdf = await PDFDocument.load(bytes);
  } catch (error) {
    parseError = error;
  }

  expect("PDF re-parses cleanly via pdf-lib", () => {
    assert(!parseError, `pdf-lib load threw: ${parseError?.message || ""}`);
    assert(pdf, "pdf object missing");
  });

  if (pdf) {
    expect("PDF physical page size is A1 landscape (mm tolerance 1)", () => {
      const page = pdf.getPage(0);
      const { width: wPt, height: hPt } = page.getSize();
      const mmPerPt = 25.4 / 72;
      const wMm = wPt * mmPerPt;
      const hMm = hPt * mmPerPt;
      assert(
        Math.abs(wMm - 841) < 1,
        `width ${wMm.toFixed(2)} mm not within 1 mm of 841`,
      );
      assert(
        Math.abs(hMm - 594) < 1,
        `height ${hMm.toFixed(2)} mm not within 1 mm of 594`,
      );
    });

    expect("PDF has exactly one page", () => {
      assertEqual(pdf.getPageCount(), 1, "page count");
    });
  }
})();

expect("disclaimer is present on QA report", () => {
  const disclaimer = result.qa.disclaimer || "";
  assert(disclaimer.length > 0, "qa.disclaimer empty");
  assert(
    /professional review/i.test(disclaimer),
    `disclaimer missing 'professional review' phrase: ${disclaimer.slice(0, 80)}`,
  );
});

expect("sheet title block carries the disclaimer", () => {
  const sheet = result.projectGraph.sheets.sheets[0];
  const tbDisclaimer = sheet?.title_block?.disclaimer || "";
  assert(
    /professional review/i.test(tbDisclaimer),
    "title_block.disclaimer missing professional review phrase",
  );
});

expect("sheet SVG embeds the disclaimer as drawn text", () => {
  const svg = result.artifacts.a1Sheet.svgString || "";
  assert(svg.length > 0, "sheet SVG empty");
  assert(
    /professional review/i.test(svg),
    "sheet SVG does not contain disclaimer text",
  );
  assert(
    svg.includes(`data-source-model-hash="${result.geometryHash}"`),
    "sheet SVG missing source_model_hash data attribute",
  );
});

expect("every programme space is placed in the model", () => {
  const spaces = result.projectGraph.programme.spaces;
  assert(spaces.length >= 6, `expected ≥6 programme spaces, got ${spaces.length}`);
  const unplaced = spaces.filter((s) => s.qa_status !== "placed");
  assert(
    unplaced.length === 0,
    `${unplaced.length} programme spaces unplaced: ${unplaced.map((s) => s.name).join(", ")}`,
  );
});

expect("actual GIA within ±15% of target", () => {
  const target = fixture.target_gia_m2;
  const actual = result.projectGraph.programme.area_summary.gross_internal_area_m2;
  const ratio = Math.abs(actual - target) / target;
  assert(
    ratio <= manifest.tolerances.gia_m2.max_relative_deviation,
    `GIA deviation ${(ratio * 100).toFixed(1)}% > ${(manifest.tolerances.gia_m2.max_relative_deviation * 100).toFixed(1)}% (target ${target}, actual ${actual})`,
  );
});

expect("provenance has at least 3 records", () => {
  const prov = result.projectGraph.provenance || [];
  assert(prov.length >= 3, `expected ≥3 provenance records, got ${prov.length}`);
});

// ---------------------------------------------------------------------------
// Plan §10 scorecard
// ---------------------------------------------------------------------------

console.log("\nPlan §10 scorecard:");

expect("totalScore >= 85", () => {
  const target = manifest.tolerances.qa_score.min_total;
  assert(
    result.qa.totalScore >= target,
    `totalScore ${result.qa.totalScore} < ${target}`,
  );
});

expect("category breakdown matches plan §10 weights", () => {
  const cs = result.qa.categoryScores || {};
  const expected = manifest.tolerances.qa_score.category_weights;
  const actualMax = {
    programme: cs.programme?.max,
    consistency_2d_3d: cs.consistency_2d_3d?.max,
    site_context: cs.site_context?.max,
    climate: cs.climate?.max,
    regulation: cs.regulation?.max,
    architecture: cs.architecture?.max,
    graphic: cs.graphic?.max,
  };
  for (const [cat, weight] of Object.entries(expected)) {
    assertEqual(actualMax[cat], weight, `category ${cat} max`);
  }
});

expect("legacy score field still present and >= 85", () => {
  assert(
    typeof result.qa.score === "number",
    `expected qa.score to be a number, got ${typeof result.qa.score}`,
  );
  assert(result.qa.score >= 85, `legacy qa.score ${result.qa.score} < 85`);
});

// ---------------------------------------------------------------------------
// Golden-snapshot capture (opt-in via UPDATE_GOLDENS=1)
// ---------------------------------------------------------------------------

if (UPDATE_GOLDENS) {
  console.log("\n[UPDATE_GOLDENS=1] writing golden snapshots...");
  if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });
  const projectGraphPath = resolve(GOLDEN_DIR, "projectgraph.json");
  const qaPath = resolve(GOLDEN_DIR, "qa.json");
  const sheetSvgPath = resolve(GOLDEN_DIR, "sheet.svg");
  // Strip non-deterministic fields from the snapshot so diffs stay meaningful.
  const snapshotGraph = stripVolatile(result.projectGraph);
  writeFileSync(projectGraphPath, JSON.stringify(snapshotGraph, null, 2));
  writeFileSync(qaPath, JSON.stringify(stripVolatile(result.qa), null, 2));
  writeFileSync(sheetSvgPath, result.artifacts.a1Sheet.svgString || "");
  console.log(`  wrote ${projectGraphPath}`);
  console.log(`  wrote ${qaPath}`);
  console.log(`  wrote ${sheetSvgPath}`);
}

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === "created_at" || key === "updated_at" || key === "retrieved_at") continue;
      if (key === "last_checked_at") continue;
      out[key] = stripVolatile(v);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nResults: ${results.passed} passed, ${results.failed} failed`);
console.log(`Total elapsed (incl. assertions): ${Date.now() - t0} ms`);

if (results.failed > 0) {
  console.error("\n✗ RIBA A1 acceptance test FAILED");
  process.exit(1);
}
console.log("\n✓ RIBA A1 acceptance test PASSED");
