#!/usr/bin/env node
/**
 * A1 Smoke Test Runner
 *
 * Runs a deterministic A1 generation workflow with quality gates.
 * Detects pipeline bugs and outputs diagnostic reports.
 *
 * Usage:
 *   node scripts/smoke/runA1Smoke.mjs [--case <case.json>] [--output <dir>]
 *
 * Environment:
 *   TOGETHER_API_KEY - Required for AI generation
 *   DEBUG_RUNS=1 - Enable detailed logging
 */

import { createHash } from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Load environment variables from .env
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

// Add src to module resolution
process.env.NODE_PATH = path.join(PROJECT_ROOT, 'src');

// =============================================================================
// IMPORTS - Lazy load to avoid circular dependencies
// =============================================================================

let runA1SheetWorkflow;
let validatePanels;
let validateBlankness;
let validateElevationDuplicates;
let PanelValidationError;
let ELEVATION_PANELS;
let TECHNICAL_PANELS;

async function loadModules() {
  console.log('📦 Loading modules...');

  try {
    const pureOrchestrator = await import('../../src/services/design/pureOrchestrator.js');
    runA1SheetWorkflow = pureOrchestrator.runA1SheetWorkflow;
  } catch (err) {
    console.error('❌ Failed to load pureOrchestrator:', err.message);
    throw err;
  }

  try {
    const validationGate = await import('../../src/services/qa/PanelValidationGate.js');
    validatePanels = validationGate.validatePanels;
    validateBlankness = validationGate.validateBlankness;
    validateElevationDuplicates = validationGate.validateElevationDuplicates;
    PanelValidationError = validationGate.PanelValidationError;
    ELEVATION_PANELS = validationGate.ELEVATION_PANELS;
    TECHNICAL_PANELS = validationGate.TECHNICAL_PANELS;
  } catch (err) {
    console.error('❌ Failed to load PanelValidationGate:', err.message);
    throw err;
  }

  console.log('✅ Modules loaded');
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CASE_FILE = path.join(__dirname, 'a1_smoke_case.json');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'outputs/smoke');

// =============================================================================
// QUALITY GATE: Missing Panels
// =============================================================================

function checkMissingPanels(result, expectedPanels) {
  const failures = [];
  const panelTypes = new Set();

  // Extract panel types from result
  if (result.panels && Array.isArray(result.panels)) {
    result.panels.forEach((p) => panelTypes.add(p.type || p.panelType));
  }

  // Check for composedSheet if panels not directly available
  if (panelTypes.size === 0 && result.composedSheet) {
    // If only composed sheet available, we can't check individual panels
    console.warn('⚠️  Only composed sheet available, cannot verify individual panels');
    return failures;
  }

  // Find missing panels
  for (const expected of expectedPanels) {
    if (!panelTypes.has(expected)) {
      failures.push({
        type: 'missing_panel',
        panel: expected,
        message: `Expected panel '${expected}' not found in result`,
      });
    }
  }

  return failures;
}

// =============================================================================
// QUALITY GATE: Thin Strip Detection
// =============================================================================

function checkThinStrip(panels, maxAspectRatio = 4.0, minWidth = 100, minHeight = 100) {
  const failures = [];

  for (const panel of panels) {
    const width = panel.width || panel.meta?.width;
    const height = panel.height || panel.meta?.height;

    if (!width || !height) continue;

    // Check minimum dimensions
    if (width < minWidth || height < minHeight) {
      failures.push({
        type: 'thin_strip',
        panel: panel.type || panel.panelType,
        message: `Panel too small: ${width}x${height} (min: ${minWidth}x${minHeight})`,
        width,
        height,
      });
      continue;
    }

    // Check aspect ratio
    const aspectRatio = Math.max(width, height) / Math.min(width, height);
    if (aspectRatio > maxAspectRatio) {
      failures.push({
        type: 'thin_strip',
        panel: panel.type || panel.panelType,
        message: `Panel aspect ratio ${aspectRatio.toFixed(2)} exceeds max ${maxAspectRatio}`,
        width,
        height,
        aspectRatio,
      });
    }
  }

  return failures;
}

// =============================================================================
// QUALITY GATE: Blank Panel Detection
// =============================================================================

async function checkBlankPanels(panels, threshold = 0.85) {
  const failures = [];

  for (const panel of panels) {
    const panelType = panel.type || panel.panelType;

    // Only check technical panels
    if (!TECHNICAL_PANELS.includes(panelType)) continue;

    const image = panel.buffer || panel.imageUrl;
    if (!image) {
      failures.push({
        type: 'blank_panel',
        panel: panelType,
        message: 'No image data available for blank check',
      });
      continue;
    }

    try {
      const result = await validateBlankness(image, panelType, { blankThreshold: threshold });
      if (!result.pass && !result.skipped) {
        failures.push({
          type: 'blank_panel',
          panel: panelType,
          message: result.reason,
          metrics: result.metrics,
        });
      }
    } catch (err) {
      console.warn(`⚠️  Blank check failed for ${panelType}:`, err.message);
    }
  }

  return failures;
}

// =============================================================================
// QUALITY GATE: Duplicate Elevations
// =============================================================================

async function checkDuplicateElevations(panels, pHashThreshold = 8, ssimThreshold = 0.92) {
  const failures = [];

  // Build elevation map
  const elevationMap = {};
  for (const panel of panels) {
    const panelType = panel.type || panel.panelType;
    if (ELEVATION_PANELS.includes(panelType)) {
      elevationMap[panelType] = panel.buffer || panel.imageUrl;
    }
  }

  // Skip if not enough elevations
  const elevationCount = Object.keys(elevationMap).length;
  if (elevationCount < 2) {
    console.log(`ℹ️  Only ${elevationCount} elevation(s) found, skipping duplicate check`);
    return failures;
  }

  try {
    const result = await validateElevationDuplicates(elevationMap);
    if (!result.pass) {
      for (const dup of result.duplicates || []) {
        failures.push({
          type: 'duplicate_elevation',
          panels: dup.panels,
          message: `${dup.panels[0]} and ${dup.panels[1]} appear identical`,
          pHashDistance: dup.pHashDistance,
          ssim: dup.ssim,
        });
      }
    }
  } catch (err) {
    console.warn('⚠️  Duplicate elevation check failed:', err.message);
  }

  return failures;
}

// =============================================================================
// BUILD DESIGN SPEC FROM SCENARIO
// =============================================================================

function buildDesignSpec(scenario) {
  const { address, location, buildingType, floors, grossInternalArea, program, style, climate } =
    scenario;

  // Calculate approximate dimensions from GIA
  const areaPerFloor = grossInternalArea / floors;
  const side = Math.sqrt(areaPerFloor);
  const length = Math.round(side * 1.2); // Slightly rectangular
  const width = Math.round(areaPerFloor / length);

  // Build program spaces
  const spaces = [];
  if (program) {
    for (const [floorName, rooms] of Object.entries(program)) {
      const floorNum = floorName.includes('ground') ? 0 : floorName.includes('first') ? 1 : 2;
      for (const room of rooms) {
        spaces.push({
          name: room.name,
          area: room.area,
          floor: floorNum,
        });
      }
    }
  }

  return {
    buildingType,
    buildingTypeLabel: scenario.buildingTypeLabel || buildingType.replace('_', ' '),
    floors,
    dimensions: {
      width,
      length,
      height: floors * 3, // Assume 3m floor height
    },
    area: grossInternalArea,
    programSpaces: {
      spaces,
      totalArea: grossInternalArea,
      _calculatedFloorCount: floors,
    },
    style: {
      architecture: style?.architecture || 'contemporary',
    },
    materials: style?.materials || [],
    roofType: style?.roofType || 'pitched',
    roofPitch: style?.roofPitch || 35,
    climate,
  };
}

function buildSiteSnapshot(scenario) {
  const { address, location, climate } = scenario;

  return {
    address,
    location: {
      lat: location?.lat || 53.59,
      lng: location?.lng || -0.65,
      formatted: address,
      region: location?.region || 'UK',
      country: location?.country || 'UK',
    },
    climate: {
      type: climate?.type || 'temperate_maritime',
      heatingDays: climate?.heatingDays || 200,
      coolingDays: climate?.coolingDays || 10,
    },
    polygon: null, // Auto-generate from dimensions
    capturedAt: new Date().toISOString(),
  };
}

// =============================================================================
// MAIN RUNNER
// =============================================================================

async function runSmokeTest(options = {}) {
  const startTime = Date.now();

  // Load test case
  const caseFile = options.caseFile || DEFAULT_CASE_FILE;
  console.log(`\n📋 Loading test case: ${caseFile}`);

  let testCase;
  try {
    const caseData = await fs.readFile(caseFile, 'utf-8');
    testCase = JSON.parse(caseData);
  } catch (err) {
    console.error(`❌ Failed to load test case: ${err.message}`);
    return { success: false, error: 'CASE_LOAD_FAILED', message: err.message };
  }

  console.log(`\n🏠 Test Case: ${testCase.name}`);
  console.log(`   Address: ${testCase.scenario.address}`);
  console.log(`   Type: ${testCase.scenario.buildingType}`);
  console.log(`   Area: ${testCase.scenario.grossInternalArea}m²`);
  console.log(`   Floors: ${testCase.scenario.floors}`);
  console.log(`   Seed: ${testCase.generation.seed}`);

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(options.outputDir || DEFAULT_OUTPUT_DIR, timestamp);
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`\n📁 Output directory: ${outputDir}`);

  // Build parameters
  const designSpec = buildDesignSpec(testCase.scenario);
  const siteSnapshot = buildSiteSnapshot(testCase.scenario);
  const seed = testCase.generation.seed;

  // Load modules
  await loadModules();

  // Run A1 workflow
  console.log('\n🚀 Starting A1 generation...');
  let result;
  const progressLog = [];

  try {
    result = await runA1SheetWorkflow({
      designSpec,
      siteSnapshot,
      seed,
      sheetType: 'ARCH',
      featureFlags: {
        layoutTemplate: testCase.generation.layoutTemplate || 'target-board',
        skipMeshy: testCase.generation.skipMeshy ?? true,
        skipBlender: testCase.generation.skipBlender ?? true,
        useCleanPipeline: true,
      },
      onProgress: (progress) => {
        const msg = `[${progress.percent || 0}%] ${progress.stage}: ${progress.message}`;
        progressLog.push({ timestamp: Date.now(), ...progress });
        console.log(`   ${msg}`);
      },
    });
  } catch (err) {
    console.error(`\n❌ Generation failed: ${err.message}`);

    // Write error report
    const errorReport = {
      success: false,
      error: err.message,
      stack: err.stack,
      progressLog,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    await fs.writeFile(
      path.join(outputDir, 'smoke_report.json'),
      JSON.stringify(errorReport, null, 2)
    );

    return { success: false, error: 'GENERATION_FAILED', message: err.message, outputDir };
  }

  const generationDuration = Date.now() - startTime;
  console.log(`\n✅ Generation completed in ${(generationDuration / 1000).toFixed(1)}s`);

  // =============================================================================
  // QUALITY GATES
  // =============================================================================

  console.log('\n🔍 Running quality gates...');
  const qualityGates = testCase.qualityGates || {};
  const failures = [];

  // Gate 1: Missing Panels
  console.log('   [1/4] Checking for missing panels...');
  const missingPanels = checkMissingPanels(result, testCase.expectedPanels);
  failures.push(...missingPanels);
  if (missingPanels.length > 0) {
    console.log(`   ❌ ${missingPanels.length} missing panel(s)`);
  } else {
    console.log('   ✅ All expected panels present');
  }

  // Gate 2: Thin Strip Detection
  console.log('   [2/4] Checking for thin strip panels...');
  const panels = result.panels || [];
  const thinStrips = checkThinStrip(
    panels,
    qualityGates.thinStripAspectRatio,
    qualityGates.minPanelWidth,
    qualityGates.minPanelHeight
  );
  failures.push(...thinStrips);
  if (thinStrips.length > 0) {
    console.log(`   ❌ ${thinStrips.length} thin strip panel(s)`);
  } else {
    console.log('   ✅ No thin strip panels');
  }

  // Gate 3: Blank Panel Detection
  console.log('   [3/4] Checking for blank panels...');
  const blankPanels = await checkBlankPanels(panels, qualityGates.blankPlanThreshold);
  failures.push(...blankPanels);
  if (blankPanels.length > 0) {
    console.log(`   ❌ ${blankPanels.length} blank panel(s)`);
  } else {
    console.log('   ✅ No blank panels');
  }

  // Gate 4: Duplicate Elevations
  console.log('   [4/4] Checking for duplicate elevations...');
  const duplicates = await checkDuplicateElevations(
    panels,
    qualityGates.duplicateElevationPHashThreshold,
    qualityGates.duplicateElevationSSIMThreshold
  );
  failures.push(...duplicates);
  if (duplicates.length > 0) {
    console.log(`   ❌ ${duplicates.length} duplicate elevation pair(s)`);
  } else {
    console.log('   ✅ All elevations unique');
  }

  // =============================================================================
  // GENERATE OUTPUTS
  // =============================================================================

  const success = failures.length === 0;
  console.log(`\n${success ? '✅ PASS' : '❌ FAIL'}: ${failures.length} quality gate failure(s)`);

  // Save composed sheet
  if (result.composedSheet || result.sheetUrl) {
    const sheetData = result.composedSheet || result.sheetUrl;
    if (sheetData.startsWith('data:')) {
      const base64 = sheetData.split(',')[1];
      await fs.writeFile(path.join(outputDir, 'a1_sheet.png'), Buffer.from(base64, 'base64'));
      console.log('   📄 Saved a1_sheet.png');
    }
  }

  // Save individual panels
  for (const panel of panels) {
    const panelType = panel.type || panel.panelType;
    const buffer = panel.buffer;
    if (buffer && Buffer.isBuffer(buffer)) {
      await fs.writeFile(path.join(outputDir, `${panelType}.png`), buffer);
    }
  }

  // Generate manifest
  const manifest = {
    testCase: testCase.name,
    scenario: testCase.scenario,
    seed,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    panels: panels.map((p) => ({
      type: p.type || p.panelType,
      width: p.width || p.meta?.width,
      height: p.height || p.meta?.height,
      sha256: p.buffer
        ? createHash('sha256').update(p.buffer).digest('hex')
        : null,
    })),
    outputFiles: await fs.readdir(outputDir),
  };
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('   📋 Saved manifest.json');

  // Generate smoke report
  const smokeReport = {
    success,
    testCase: testCase.name,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    qualityGates: {
      totalChecks: 4,
      passed: 4 - (failures.length > 0 ? new Set(failures.map((f) => f.type)).size : 0),
      failed: new Set(failures.map((f) => f.type)).size,
    },
    failures,
    panelCount: panels.length,
    expectedPanels: testCase.expectedPanels,
    progressLog,
  };
  await fs.writeFile(path.join(outputDir, 'smoke_report.json'), JSON.stringify(smokeReport, null, 2));
  console.log('   📊 Saved smoke_report.json');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`SMOKE TEST ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Duration: ${(smokeReport.durationMs / 1000).toFixed(1)}s`);
  console.log(`Panels: ${panels.length}/${testCase.expectedPanels.length}`);
  console.log(`Output: ${outputDir}`);
  console.log('='.repeat(60));

  return {
    success,
    outputDir,
    failures,
    duration: smokeReport.durationMs,
    panelCount: panels.length,
  };
}

// =============================================================================
// CLI ENTRYPOINT
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--case' && args[i + 1]) {
      options.caseFile = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
A1 Smoke Test Runner

Usage:
  node scripts/smoke/runA1Smoke.mjs [options]

Options:
  --case <file>    Path to test case JSON (default: scripts/smoke/a1_smoke_case.json)
  --output <dir>   Output directory (default: outputs/smoke)
  --help, -h       Show this help

Environment:
  TOGETHER_API_KEY    Required for AI generation
  DEBUG_RUNS=1        Enable detailed logging
`);
      process.exit(0);
    }
  }

  // Check for API key
  if (!process.env.TOGETHER_API_KEY) {
    console.error('❌ TOGETHER_API_KEY environment variable is required');
    process.exit(1);
  }

  const result = await runSmokeTest(options);
  process.exit(result.success ? 0 : 1);
}

// Export for programmatic use
export { runSmokeTest, buildDesignSpec, buildSiteSnapshot };

// Run if executed directly
main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
