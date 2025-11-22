import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import a1LayoutComposer from './src/services/a1LayoutComposer.js';
import { GRID_SPEC, REQUIRED_PANELS } from './src/services/a1/a1LayoutConstants.js';

// Mock sharp
// We need to use the real sharp if available, or a mock if not. 
// Since we are in the user's environment, we assume sharp is installed.
// If not, we can't really test image generation.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('🚀 Starting Multi-Panel Layout Test...');

  // 1. Create mock panels
  console.log('🎨 Creating mock panels...');
  const panels = [];

  // Create a simple colored buffer for each panel
  // We'll use sharp to create these
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (e) {
    console.error('❌ Sharp not found. Cannot run test.');
    process.exit(1);
  }

  for (const type of REQUIRED_PANELS) {
    // Generate a random color
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);

    const buffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r, g, b, alpha: 1 }
      }
    })
      .png()
      .toBuffer();

    panels.push({
      type,
      buffer,
      label: type.toUpperCase().replace(/_/g, ' ')
    });
  }

  // 2. Compose A1 Sheet
  console.log('📐 Composing A1 sheet...');
  try {
    const result = await a1LayoutComposer.composeA1Sheet({
      panels,
      titleBlock: {
        projectName: 'TEST PROJECT',
        buildingTypeLabel: 'A1 LAYOUT TEST',
        locationDesc: 'Virtual Test Environment',
        scale: 'N.T.S.',
        date: new Date().toISOString().split('T')[0]
      }
    });

    // 3. Save output
    const outputPath = path.join('C:', 'tmp', 'multi-panel-test.png');
    // Ensure tmp dir exists
    const tmpDir = path.dirname(outputPath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result.buffer);
    console.log(`✅ Test complete! Saved to ${outputPath}`);
    console.log(`   Dimensions: ${result.metadata.width}x${result.metadata.height}`);
    console.log(`   Panel count: ${result.metadata.panelCount}`);

  } catch (error) {
    console.error('❌ Composition failed:', error);
  }
}

runTest();
