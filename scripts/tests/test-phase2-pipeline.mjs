#!/usr/bin/env node
/**
 * Test Phase 2: ControlNet Snapshots Pipeline
 *
 * Prerequisites:
 * 1. Blender installed and in PATH (or set BLENDER_PATH env var)
 * 2. genarch run_001 output exists in runs/run_001/model.glb
 * 3. OpenCV installed: pip install opencv-python numpy
 *
 * Usage:
 *   node scripts/tests/test-phase2-pipeline.mjs
 *
 * This test:
 * 1. Runs Blender with controlnet_rendering.py
 * 2. Runs postprocess.py for canny edge detection
 * 3. Validates output files
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MODEL_PATH = path.join(PROJECT_ROOT, 'runs/run_001/model.glb');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'blender_scripts/phase2_config.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'runs/run_001/phase2');
const CONTROLNET_SCRIPT = path.join(PROJECT_ROOT, 'blender_scripts/controlnet_rendering.py');
const POSTPROCESS_SCRIPT = path.join(PROJECT_ROOT, 'blender_scripts/postprocess.py');

async function checkBlender() {
  const blenderPath = process.env.BLENDER_PATH || 'blender';
  try {
    const { stdout } = await execPromise(`"${blenderPath}" --version`);
    console.log(`✓ Blender found: ${stdout.split('\n')[0]}`);
    return blenderPath;
  } catch (err) {
    console.error('✗ Blender not found. Install Blender or set BLENDER_PATH.');
    console.error('  Download from: https://www.blender.org/download/');
    return null;
  }
}

async function checkPrerequisites() {
  console.log('\n=== Checking Prerequisites ===\n');

  // Check model file
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`✗ Model not found: ${MODEL_PATH}`);
    console.error('  Run genarch first: python -m genarch --constraints genarch/constraints.example.json --out runs/run_001 --seed 123');
    return false;
  }
  console.log(`✓ Model found: ${MODEL_PATH}`);

  // Check config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`✗ Config not found: ${CONFIG_PATH}`);
    return false;
  }
  console.log(`✓ Config found: ${CONFIG_PATH}`);

  // Check scripts
  if (!fs.existsSync(CONTROLNET_SCRIPT)) {
    console.error(`✗ ControlNet script not found: ${CONTROLNET_SCRIPT}`);
    return false;
  }
  console.log(`✓ ControlNet script found`);

  if (!fs.existsSync(POSTPROCESS_SCRIPT)) {
    console.error(`✗ Postprocess script not found: ${POSTPROCESS_SCRIPT}`);
    return false;
  }
  console.log(`✓ Postprocess script found`);

  return true;
}

async function runBlenderRender(blenderPath) {
  console.log('\n=== Running Blender ControlNet Rendering ===\n');

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const cmd = `"${blenderPath}" -b -P "${CONTROLNET_SCRIPT}" -- --in "${MODEL_PATH}" --config "${CONFIG_PATH}" --out "${OUTPUT_DIR}"`;
  console.log(`Command: ${cmd}\n`);

  try {
    const { stdout, stderr } = await execPromise(cmd, {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log('Blender output:');
    console.log(stdout);

    if (stderr && !stderr.includes('Blender')) {
      console.log('Blender stderr:', stderr);
    }

    return true;
  } catch (err) {
    console.error('Blender failed:', err.message);
    return false;
  }
}

async function runPostprocess() {
  console.log('\n=== Running Postprocess (Canny Edge Detection) ===\n');

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const cmd = `"${pythonCmd}" "${POSTPROCESS_SCRIPT}" --input "${OUTPUT_DIR}" --output "${OUTPUT_DIR}"`;
  console.log(`Command: ${cmd}\n`);

  try {
    const { stdout, stderr } = await execPromise(cmd, { timeout: 30000 });
    console.log(stdout);
    if (stderr) console.log('stderr:', stderr);
    return true;
  } catch (err) {
    console.warn('Postprocess warning:', err.message);
    console.log('(Postprocessing is optional - Blender renders are still valid)');
    return false;
  }
}

async function validateOutput() {
  console.log('\n=== Validating Output ===\n');

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  const camerasPath = path.join(OUTPUT_DIR, 'cameras.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`✗ Manifest not found: ${manifestPath}`);
    return false;
  }
  console.log(`✓ Manifest found`);

  if (!fs.existsSync(camerasPath)) {
    console.error(`✗ Cameras JSON not found: ${camerasPath}`);
    return false;
  }
  console.log(`✓ Cameras JSON found`);

  // Parse manifest
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`\nManifest version: ${manifest.version}`);
  console.log(`Phase: ${manifest.phase}`);
  console.log(`Renders: ${manifest.renders?.length || 0} cameras`);

  // Check for expected files
  const expectedPasses = ['clay', 'normal', 'depth', 'mask'];
  const expectedCameras = ['floor_plan', 'section_AA', 'hero_perspective', 'elevation_N', 'elevation_S', 'elevation_E', 'elevation_W'];

  let fileCount = 0;
  let missing = [];

  for (const cam of expectedCameras) {
    for (const pass of expectedPasses) {
      const filename = `${cam}_${pass}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);
      if (fs.existsSync(filepath)) {
        fileCount++;
      } else {
        missing.push(filename);
      }
    }
  }

  console.log(`\nExpected files: ${expectedCameras.length * expectedPasses.length}`);
  console.log(`Found files: ${fileCount}`);

  if (missing.length > 0 && missing.length < 10) {
    console.log(`Missing: ${missing.join(', ')}`);
  }

  // Check for canny edges (postprocessed)
  const cannyFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('_canny.png'));
  console.log(`Canny edge files: ${cannyFiles.length}`);

  // Parse cameras.json
  const cameras = JSON.parse(fs.readFileSync(camerasPath, 'utf8'));
  console.log(`\nCameras JSON version: ${cameras.version}`);
  console.log(`Resolution: ${cameras.resolution?.width}x${cameras.resolution?.height}`);
  console.log(`Coordinate system: up=${cameras.coordinate_system?.up}, forward=${cameras.coordinate_system?.forward}`);
  console.log(`Camera count: ${cameras.cameras?.length}`);

  return fileCount > 0;
}

async function main() {
  console.log('========================================');
  console.log('  Phase 2: ControlNet Snapshots Test');
  console.log('========================================');

  // Check Blender
  const blenderPath = await checkBlender();
  if (!blenderPath) {
    console.log('\n[SKIPPED] Blender not available');
    console.log('\nTo run this test:');
    console.log('1. Install Blender from https://www.blender.org/download/');
    console.log('2. Add Blender to PATH, or set BLENDER_PATH environment variable');
    console.log('3. Re-run this test');
    process.exit(0);
  }

  // Check prerequisites
  if (!(await checkPrerequisites())) {
    process.exit(1);
  }

  // Run Blender
  const blenderSuccess = await runBlenderRender(blenderPath);
  if (!blenderSuccess) {
    console.error('\n[FAILED] Blender rendering failed');
    process.exit(1);
  }

  // Run postprocess
  await runPostprocess();

  // Validate
  const valid = await validateOutput();
  if (!valid) {
    console.error('\n[FAILED] Output validation failed');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  [SUCCESS] Phase 2 Test Complete!');
  console.log('========================================');
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  console.log('Files generated:');
  fs.readdirSync(OUTPUT_DIR).forEach(f => console.log(`  - ${f}`));
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
