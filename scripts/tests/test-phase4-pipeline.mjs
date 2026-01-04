#!/usr/bin/env node
/**
 * Test Phase 4: A1 Sheet Assembler Pipeline
 *
 * Prerequisites:
 * 1. Python 3.10+ with genarch package installed
 * 2. reportlab, svglib, Pillow installed
 * 3. genarch run_001 output exists in runs/run_001/
 *
 * Usage:
 *   node scripts/tests/test-phase4-pipeline.mjs
 *
 * This test:
 * 1. Runs the Phase 4 A1 assembler
 * 2. Validates output PDF exists
 * 3. Validates manifest JSON
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
const RUN_PATH = path.join(PROJECT_ROOT, 'runs/run_001');
const OUTPUT_DIR = path.join(RUN_PATH, 'phase4');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'A1_sheet.pdf');
const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'sheet_manifest.json');

async function checkPython() {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  try {
    const { stdout } = await execPromise(`${pythonCmd} --version`);
    console.log(`✓ Python found: ${stdout.trim()}`);
    return pythonCmd;
  } catch (err) {
    console.error('✗ Python not found');
    return null;
  }
}

async function checkDependencies(pythonCmd) {
  console.log('\n=== Checking Dependencies ===\n');

  const deps = ['reportlab', 'svglib', 'PIL'];
  let allPresent = true;

  for (const dep of deps) {
    try {
      await execPromise(`${pythonCmd} -c "import ${dep}"`);
      console.log(`✓ ${dep} found`);
    } catch (err) {
      console.error(`✗ ${dep} not found. Install with: pip install ${dep === 'PIL' ? 'Pillow' : dep}`);
      allPresent = false;
    }
  }

  return allPresent;
}

async function checkPrerequisites() {
  console.log('\n=== Checking Prerequisites ===\n');

  // Check run folder
  if (!fs.existsSync(RUN_PATH)) {
    console.error(`✗ Run folder not found: ${RUN_PATH}`);
    console.error('  Run genarch first: python -m genarch --constraints genarch/constraints.example.json --out runs/run_001 --seed 123');
    return false;
  }
  console.log(`✓ Run folder found: ${RUN_PATH}`);

  // Check plan.json
  const planPath = path.join(RUN_PATH, 'plan.json');
  if (!fs.existsSync(planPath)) {
    console.error(`✗ plan.json not found: ${planPath}`);
    return false;
  }
  console.log(`✓ plan.json found`);

  return true;
}

async function runPhase4(pythonCmd) {
  console.log('\n=== Running Phase 4 A1 Assembler ===\n');

  // Clean up previous output
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }

  const cmd = `${pythonCmd} -m genarch.phase4 --run "${RUN_PATH}" --verbose`;
  console.log(`Command: ${cmd}\n`);

  try {
    const { stdout, stderr } = await execPromise(cmd, {
      cwd: PROJECT_ROOT,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log('Output:');
    console.log(stdout);

    if (stderr) {
      console.log('stderr:', stderr);
    }

    return true;
  } catch (err) {
    console.error('Phase 4 failed:', err.message);
    if (err.stdout) console.log('stdout:', err.stdout);
    if (err.stderr) console.log('stderr:', err.stderr);
    return false;
  }
}

async function validateOutput() {
  console.log('\n=== Validating Output ===\n');

  // Check PDF exists
  if (!fs.existsSync(OUTPUT_PDF)) {
    console.error(`✗ PDF not found: ${OUTPUT_PDF}`);
    return false;
  }
  const pdfStats = fs.statSync(OUTPUT_PDF);
  console.log(`✓ PDF found: ${OUTPUT_PDF} (${(pdfStats.size / 1024).toFixed(1)} KB)`);

  // Check manifest exists
  if (!fs.existsSync(OUTPUT_MANIFEST)) {
    console.error(`✗ Manifest not found: ${OUTPUT_MANIFEST}`);
    return false;
  }
  console.log(`✓ Manifest found: ${OUTPUT_MANIFEST}`);

  // Parse and validate manifest
  try {
    const manifest = JSON.parse(fs.readFileSync(OUTPUT_MANIFEST, 'utf8'));

    console.log(`\nManifest validation:`);
    console.log(`  Version: ${manifest.version}`);
    console.log(`  Phase: ${manifest.phase}`);
    console.log(`  Generated: ${manifest.generated_at}`);
    console.log(`  Page: ${manifest.page?.format} ${manifest.page?.orientation}`);
    console.log(`  Scale: ${manifest.scale?.chosen} (auto: ${manifest.scale?.auto_selected})`);

    if (manifest.panels) {
      console.log(`  Panels:`);
      for (const [name, panel] of Object.entries(manifest.panels)) {
        const source = panel.source || '(generated)';
        const vector = panel.vector ? ' [VECTOR]' : '';
        const dpi = panel.effective_dpi ? ` (${panel.effective_dpi} DPI)` : '';
        console.log(`    - ${name}: ${source}${vector}${dpi}`);
      }
    }

    if (manifest.warnings && manifest.warnings.length > 0) {
      console.log(`  Warnings: ${manifest.warnings.length}`);
      for (const w of manifest.warnings) {
        console.log(`    - ${w}`);
      }
    } else {
      console.log(`  Warnings: None`);
    }

    return true;
  } catch (err) {
    console.error(`✗ Could not parse manifest: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('  Phase 4: A1 Sheet Assembler Test');
  console.log('========================================');

  // Check Python
  const pythonCmd = await checkPython();
  if (!pythonCmd) {
    console.log('\n[SKIPPED] Python not available');
    process.exit(0);
  }

  // Check dependencies
  const depsOk = await checkDependencies(pythonCmd);
  if (!depsOk) {
    console.log('\n[SKIPPED] Missing dependencies');
    console.log('\nTo install dependencies:');
    console.log('  pip install reportlab svglib Pillow');
    process.exit(0);
  }

  // Check prerequisites
  if (!(await checkPrerequisites())) {
    console.log('\n[SKIPPED] Prerequisites not met');
    console.log('\nTo generate test data:');
    console.log('  python -m genarch --constraints genarch/constraints.example.json --out runs/run_001 --seed 123');
    process.exit(0);
  }

  // Run Phase 4
  const phase4Success = await runPhase4(pythonCmd);
  if (!phase4Success) {
    console.error('\n[FAILED] Phase 4 execution failed');
    process.exit(1);
  }

  // Validate output
  const valid = await validateOutput();
  if (!valid) {
    console.error('\n[FAILED] Output validation failed');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  [SUCCESS] Phase 4 Test Complete!');
  console.log('========================================');
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  console.log('Files generated:');
  fs.readdirSync(OUTPUT_DIR).forEach(f => console.log(`  - ${f}`));

  // Open PDF (optional)
  console.log(`\nTo view the PDF:`);
  if (process.platform === 'win32') {
    console.log(`  start "${OUTPUT_PDF}"`);
  } else if (process.platform === 'darwin') {
    console.log(`  open "${OUTPUT_PDF}"`);
  } else {
    console.log(`  xdg-open "${OUTPUT_PDF}"`);
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
