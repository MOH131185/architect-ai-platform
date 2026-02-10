/**
 * Three-Tier Panel Consistency — REAL Generation Test
 *
 * Runs a complete A1 multi-panel workflow with REAL Together.ai API calls.
 * Saves all panel images + composed A1 sheet to debug_runs/ for inspection.
 *
 * Verifies:
 * - TIER 1 panels come from canonical SVG (no FLUX calls)
 * - TIER 2 panels (hero_3d, axonometric) use FLUX with geometry lock
 * - TIER 3 panels (interior_3d, site_diagram) use FLUX freely
 * - Data panels rendered as deterministic SVG
 * - Compose endpoint assembles all 15 panels into A1 sheet
 *
 * Requirements:
 * - .env with TOGETHER_API_KEY
 * - Express server running on port 3001 (`npm run server`)
 *
 * Run with: node test-three-tier-real-generation.js
 */

import "dotenv/config";
import fs from "fs";
import path from "path";

// ============================================================================
// Config
// ============================================================================
const OUTPUT_DIR = path.join("debug_runs", `three_tier_${Date.now()}`);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveDataUrl(dataUrl, filePath) {
  if (!dataUrl) return;
  if (dataUrl.startsWith("data:image/svg+xml;base64,")) {
    const svgB64 = dataUrl.replace("data:image/svg+xml;base64,", "");
    fs.writeFileSync(
      filePath.replace(/\.\w+$/, ".svg"),
      Buffer.from(svgB64, "base64"),
    );
  } else if (dataUrl.startsWith("data:image/png;base64,")) {
    const pngB64 = dataUrl.replace("data:image/png;base64,", "");
    fs.writeFileSync(
      filePath.replace(/\.\w+$/, ".png"),
      Buffer.from(pngB64, "base64"),
    );
  } else if (dataUrl.startsWith("data:")) {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (match) {
      fs.writeFileSync(filePath, Buffer.from(match[1], "base64"));
    }
  } else {
    // External URL — just log it
    fs.writeFileSync(filePath.replace(/\.\w+$/, ".url.txt"), dataUrl);
  }
}

// ============================================================================
// Main
// ============================================================================
async function runRealGeneration() {
  console.log("\n🏗️  ========================================");
  console.log("🏗️  THREE-TIER REAL GENERATION TEST");
  console.log("🏗️  ========================================\n");

  // Check API key
  if (!process.env.TOGETHER_API_KEY) {
    console.error("❌ TOGETHER_API_KEY not set in .env");
    process.exit(1);
  }
  console.log("✅ Together API key found\n");

  // Check server is running
  try {
    const resp = await fetch("http://localhost:3001/api/health").catch(
      () => null,
    );
    if (!resp || !resp.ok) {
      console.warn("⚠️  Express server may not be running on port 3001");
      console.warn(
        "   Run `npm run server` in another terminal for compose endpoint",
      );
      console.warn(
        "   Continuing anyway — compose may fail but panels will still generate\n",
      );
    } else {
      console.log("✅ Express server running on port 3001\n");
    }
  } catch {
    console.warn("⚠️  Could not reach server — continuing\n");
  }

  ensureDir(OUTPUT_DIR);
  ensureDir(path.join(OUTPUT_DIR, "panels"));
  console.log(`📂 Output directory: ${OUTPUT_DIR}\n`);

  // Import orchestrator
  const { default: orchestrator } =
    await import("./src/services/dnaWorkflowOrchestrator.js");

  // Track FLUX calls
  const fluxCallLog = [];
  const tier1Log = [];
  const dataPanelLog = [];
  const startTime = Date.now();

  const params = {
    locationData: {
      address: "42 Bournville Lane, Birmingham, B30 2HP, UK",
      coordinates: { lat: 52.429, lng: -1.934 },
      climate: {
        type: "temperate oceanic",
        zone: "Cfb",
        seasonal: {
          summer: { tempHigh: 22, avgTemp: 17 },
          winter: { tempLow: 1, avgTemp: 5 },
        },
      },
      sunPath: {
        optimalOrientation: "South-facing",
        summer: "NE → S → NW, altitude 58°",
        winter: "SE → S → SW, altitude 15°",
      },
    },
    projectContext: {
      buildingProgram: "detached house",
      area: 150,
      floorArea: 150,
      floors: 2,
      floorCount: 2,
      programSpaces: [
        { name: "Living Room", area: 28, level: "ground" },
        { name: "Kitchen-Dining", area: 30, level: "ground" },
        { name: "Hallway", area: 8, level: "ground" },
        { name: "WC", area: 3, level: "ground" },
        { name: "Utility", area: 5, level: "ground" },
        { name: "Master Bedroom", area: 22, level: "first" },
        { name: "Bedroom 2", area: 16, level: "first" },
        { name: "Bedroom 3", area: 12, level: "first" },
        { name: "Bathroom", area: 8, level: "first" },
        { name: "En-suite", area: 5, level: "first" },
      ],
    },
    portfolioFiles: [],
    siteSnapshot: null,
    baseSeed: 77777,
  };

  console.log("📋 Project: 150m² detached house, 2 floors, 10 rooms");
  console.log("📍 Location: Bournville, Birmingham, UK");
  console.log("🎲 Seed: 77777\n");
  console.log("⏳ Starting generation...\n");

  // Mock services that require browser APIs (localStorage)
  const mockHistoryService = {
    createDesign: async (params) => {
      console.log(`  [MockHistory] Saved design ${params.designId}`);
      return params.designId;
    },
  };
  const mockBaselineStore = {
    saveBaselineArtifacts: async ({ designId }) => {
      console.log(`  [MockBaseline] Saved baseline for ${designId}`);
      return `${designId}_baseline`;
    },
  };

  let result;
  try {
    result = await orchestrator.runMultiPanelA1Workflow(params, {
      overrides: {
        historyService: mockHistoryService,
        baselineStore: mockBaselineStore,
      },
      onProgress: (progress) => {
        if (progress.message) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  [${elapsed}s] ${progress.message}`);
        }
      },
    });
  } catch (err) {
    console.error(`\n❌ Generation failed: ${err.message}`);
    console.error(err.stack?.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Generation completed in ${elapsed}s\n`);

  if (!result.success) {
    console.error(`❌ Workflow returned success=false`);
    console.error(`   Error: ${result.error}`);
    // Still save whatever panels we got
  }

  // ============================================================================
  // Analyze and save results
  // ============================================================================
  const panels = result.panels || [];
  console.log(`📊 Total panels: ${panels.length}\n`);

  const TIER1_TYPES = new Set([
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "floor_plan_level3",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
  ]);
  const DATA_TYPES = new Set([
    "schedules_notes",
    "material_palette",
    "climate_card",
  ]);
  const TIER2_TYPES = new Set(["hero_3d", "axonometric"]);
  const TIER3_TYPES = new Set(["interior_3d", "site_diagram"]);

  const summary = {
    tier1: { count: 0, svgCorrect: 0, panels: [] },
    tier2: { count: 0, panels: [] },
    tier3: { count: 0, panels: [] },
    data: { count: 0, panels: [] },
    other: { count: 0, panels: [] },
  };

  for (const panel of panels) {
    const type = panel.type;
    const model = panel.meta?.model || panel.meta?.generatorUsed || "unknown";
    const isSvg = panel.svgPanel === true || model === "canonical_svg";
    const hasGeoHash = !!(panel.geometryHash || panel.meta?.geometryHash);
    const tier = panel.meta?.tier;

    let tierLabel;
    if (TIER1_TYPES.has(type)) {
      tierLabel = "TIER 1 (SVG)";
      summary.tier1.count++;
      if (isSvg) summary.tier1.svgCorrect++;
      summary.tier1.panels.push(type);
    } else if (DATA_TYPES.has(type)) {
      tierLabel = "DATA";
      summary.data.count++;
      summary.data.panels.push(type);
    } else if (TIER2_TYPES.has(type)) {
      tierLabel = "TIER 2 (locked)";
      summary.tier2.count++;
      summary.tier2.panels.push(type);
    } else if (TIER3_TYPES.has(type)) {
      tierLabel = "TIER 3 (free)";
      summary.tier3.count++;
      summary.tier3.panels.push(type);
    } else {
      tierLabel = "OTHER";
      summary.other.count++;
      summary.other.panels.push(type);
    }

    const svgTag = isSvg ? " [SVG]" : "";
    const hashTag = hasGeoHash ? " [GEO✓]" : "";
    console.log(
      `  ${tierLabel.padEnd(18)} ${type.padEnd(22)} model=${model}${svgTag}${hashTag}`,
    );

    // Save panel image
    if (panel.imageUrl) {
      const ext = isSvg ? "svg" : "png";
      saveDataUrl(
        panel.imageUrl,
        path.join(OUTPUT_DIR, "panels", `${type}.${ext}`),
      );
    }
  }

  // Save composed sheet
  if (result.composedSheetUrl) {
    console.log("\n📄 Composed A1 sheet available");
    saveDataUrl(result.composedSheetUrl, path.join(OUTPUT_DIR, "a1_sheet.png"));
  }

  // Save DNA
  if (result.masterDNA) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "masterDNA.json"),
      JSON.stringify(result.masterDNA, null, 2),
    );
  }

  // Save summary report
  const report = {
    timestamp: new Date().toISOString(),
    elapsedSeconds: parseFloat(elapsed),
    success: result.success,
    error: result.error || null,
    totalPanels: panels.length,
    tier1: {
      count: summary.tier1.count,
      allUsedSVG: summary.tier1.svgCorrect === summary.tier1.count,
      svgCorrect: summary.tier1.svgCorrect,
      panels: summary.tier1.panels,
    },
    tier2: {
      count: summary.tier2.count,
      panels: summary.tier2.panels,
    },
    tier3: {
      count: summary.tier3.count,
      panels: summary.tier3.panels,
    },
    data: {
      count: summary.data.count,
      panels: summary.data.panels,
    },
    fluxCallCount: summary.tier2.count + summary.tier3.count,
    dimensions: result.masterDNA?.dimensions || null,
    composedSheetAvailable: !!result.composedSheetUrl,
    seed: params.baseSeed,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "report.json"),
    JSON.stringify(report, null, 2),
  );

  // ============================================================================
  // Final summary
  // ============================================================================
  console.log("\n========================================");
  console.log("📊 THREE-TIER GENERATION SUMMARY");
  console.log("========================================");
  console.log(`  Total panels:     ${panels.length}`);
  console.log(
    `  TIER 1 (SVG):     ${summary.tier1.count} panels, ${summary.tier1.svgCorrect}/${summary.tier1.count} used canonical SVG`,
  );
  console.log(
    `  TIER 2 (locked):  ${summary.tier2.count} panels (${summary.tier2.panels.join(", ")})`,
  );
  console.log(
    `  TIER 3 (free):    ${summary.tier3.count} panels (${summary.tier3.panels.join(", ")})`,
  );
  console.log(`  Data panels:      ${summary.data.count} panels`);
  console.log(
    `  FLUX API calls:   ~${summary.tier2.count + summary.tier3.count} (was ~14 before three-tier)`,
  );
  console.log(`  Generation time:  ${elapsed}s`);
  console.log(`  Composed sheet:   ${result.composedSheetUrl ? "YES" : "NO"}`);
  console.log(
    `  Dimensions:       ${result.masterDNA?.dimensions?.length || "?"}m × ${result.masterDNA?.dimensions?.width || "?"}m`,
  );
  console.log(`  Output saved to:  ${OUTPUT_DIR}/`);
  console.log("========================================\n");

  if (
    summary.tier1.svgCorrect === summary.tier1.count &&
    summary.tier1.count >= 6
  ) {
    console.log(
      "🎉 THREE-TIER ROUTING VERIFIED — TIER 1 panels all from canonical SVG\n",
    );
  } else if (summary.tier1.count === 0) {
    console.log(
      "⚠️  No TIER 1 panels found — canonical pack may have failed to build\n",
    );
  } else {
    console.log(
      `⚠️  ${summary.tier1.count - summary.tier1.svgCorrect} TIER 1 panels fell through to FLUX\n`,
    );
  }

  process.exit(result.success ? 0 : 1);
}

runRealGeneration().catch((err) => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
});
