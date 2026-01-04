/**
 * SVG Pipeline Test
 *
 * Tests the SSoT SVG generation pipeline using the DNA from the detached house test.
 * Generates floor plans, elevations, sections, and 3D views as vector SVGs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Dynamic imports for ESM modules
async function loadModules() {
  const modulePath = path.join(PROJECT_ROOT, 'src/services/svg/index.js');
  // Convert Windows path to file:// URL for ESM import
  const moduleUrl = 'file:///' + modulePath.replace(/\\/g, '/');
  const SVGServices = await import(moduleUrl);
  return SVGServices;
}

// Load the DNA from the previous test
const DNA_PATH = path.join(
  PROJECT_ROOT,
  'outputs/detached-house-DN158BQ-2025-12-28T13-19-02-155Z-dna.json'
);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'outputs/svg-test');

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  SVG PIPELINE TEST - Professional Architectural Drawings');
  console.log('═'.repeat(70) + '\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load DNA
  console.log('📋 Loading Design DNA...');
  if (!fs.existsSync(DNA_PATH)) {
    console.error('❌ DNA file not found. Run the detached house test first.');
    process.exit(1);
  }

  const dna = JSON.parse(fs.readFileSync(DNA_PATH, 'utf-8'));
  console.log(`   ✓ Loaded DNA for ${dna.dimensions.length}m × ${dna.dimensions.width}m building`);
  console.log(`   ✓ ${dna.rooms.length} rooms over ${dna.dimensions.floors} floors`);
  console.log(`   ✓ ${dna.materials.length} materials defined`);

  // Load SVG services
  console.log('\n📦 Loading SVG Services...');
  const SVGServices = await loadModules();
  console.log('   ✓ SVG generators loaded');

  // Prepare geometry-like data structure from DNA for the generators
  const geometry = buildGeometryFromDNA(dna);

  const results = {
    floorPlans: {},
    elevations: {},
    sections: {},
    views3D: {},
    axonometric: {},
  };

  // Generate Floor Plans
  console.log('\n🏠 Generating Floor Plans...');
  for (let floor = 0; floor < dna.dimensions.floors; floor++) {
    const floorName = floor === 0 ? 'ground' : `first`;
    try {
      const svg = SVGServices.generateFloorPlanFromDNA(dna, floor, {
        scale: 50,
        showDimensions: true,
        showFurniture: true,
        showRoomLabels: true,
      });

      const filename = `floor_plan_${floorName}.svg`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
      results.floorPlans[floorName] = filename;
      console.log(`   ✓ ${floorName} floor plan → ${filename}`);
    } catch (error) {
      console.log(`   ⚠ ${floorName} floor plan: ${error.message}`);
    }
  }

  // Generate Elevations
  console.log('\n🏛️ Generating Elevations...');
  for (const direction of ['north', 'south', 'east', 'west']) {
    try {
      const svg = SVGServices.generateElevationFromDNA(dna, direction, {
        scale: 50,
        showDimensions: true,
        showLevelMarkers: true,
        showGroundContext: true,
        showMaterialPatterns: true,
      });

      const filename = `elevation_${direction}.svg`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
      results.elevations[direction] = filename;
      console.log(`   ✓ ${direction} elevation → ${filename}`);
    } catch (error) {
      console.log(`   ⚠ ${direction} elevation: ${error.message}`);
    }
  }

  // Generate Sections
  console.log('\n📐 Generating Sections...');
  for (const sectionType of ['longitudinal', 'transverse']) {
    try {
      const svg = SVGServices.generateSectionFromDNA(dna, sectionType, {
        scale: 50,
        showStructure: true,
        showDimensions: true,
        showLevels: true,
        showRoomLabels: true,
        showFoundation: true,
      });

      const filename = `section_${sectionType}.svg`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
      results.sections[sectionType] = filename;
      console.log(`   ✓ ${sectionType} section → ${filename}`);
    } catch (error) {
      console.log(`   ⚠ ${sectionType} section: ${error.message}`);
    }
  }

  // Generate 3D Views
  console.log('\n🎨 Generating 3D Views...');
  const viewTypes = [
    { name: 'perspective', type: 'perspective' },
    { name: 'isometric', type: 'isometric' },
    { name: 'axonometric', type: 'axonometric' },
  ];

  for (const view of viewTypes) {
    try {
      const svg = SVGServices.generateView(dna, view.type, {
        scale: 25,
        showGround: true,
        showShadow: true,
      });

      const filename = `3d_${view.name}.svg`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
      results.views3D[view.name] = filename;
      console.log(`   ✓ ${view.name} view → ${filename}`);
    } catch (error) {
      console.log(`   ⚠ ${view.name} view: ${error.message}`);
    }
  }

  // Generate Axonometric Views
  console.log('\n🔷 Generating Axonometric Views...');
  const axonTypes = ['standard', 'cutaway', 'exploded'];
  for (const axonType of axonTypes) {
    try {
      let svg;
      switch (axonType) {
        case 'standard':
          svg = SVGServices.generateStandardAxon(dna, { scale: 25 });
          break;
        case 'cutaway':
          svg = SVGServices.generateCutawayAxon(dna, { scale: 25 });
          break;
        case 'exploded':
          svg = SVGServices.generateExplodedAxon(dna, { scale: 25 });
          break;
      }

      const filename = `axon_${axonType}.svg`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
      results.axonometric[axonType] = filename;
      console.log(`   ✓ ${axonType} axonometric → ${filename}`);
    } catch (error) {
      console.log(`   ⚠ ${axonType} axonometric: ${error.message}`);
    }
  }

  // Generate complete package
  console.log('\n📦 Generating Complete Package...');
  try {
    const package_ = SVGServices.generateCompletePackage(dna, {
      floorPlanScale: 50,
      elevationScale: 50,
      sectionScale: 50,
      geometryScale: 25,
      showDimensions: true,
      showLabels: true,
      showFurniture: true,
    });

    // Save manifest
    const manifest = {
      project: 'Detached House DN15 8BQ',
      generatedAt: new Date().toISOString(),
      dnaHash: package_.metadata?.dnaHash,
      files: results,
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('   ✓ manifest.json saved');
  } catch (error) {
    console.log(`   ⚠ Complete package: ${error.message}`);
  }

  // Summary
  const totalFiles = Object.values(results).reduce((acc, obj) => acc + Object.keys(obj).length, 0);

  console.log('\n' + '═'.repeat(70));
  console.log('  SVG PIPELINE TEST COMPLETE');
  console.log('═'.repeat(70));
  console.log(`   📁 Output Directory: ${OUTPUT_DIR}`);
  console.log(`   📄 Files Generated: ${totalFiles}`);
  console.log('');
  console.log('   Generated Views:');
  console.log(`     • Floor Plans: ${Object.keys(results.floorPlans).length}`);
  console.log(`     • Elevations: ${Object.keys(results.elevations).length}`);
  console.log(`     • Sections: ${Object.keys(results.sections).length}`);
  console.log(`     • 3D Views: ${Object.keys(results.views3D).length}`);
  console.log(`     • Axonometric: ${Object.keys(results.axonometric).length}`);
  console.log('═'.repeat(70) + '\n');

  // List output files
  console.log('📂 Output Files:');
  const files = fs.readdirSync(OUTPUT_DIR);
  files.forEach((file) => {
    const stats = fs.statSync(path.join(OUTPUT_DIR, file));
    const size = (stats.size / 1024).toFixed(1);
    console.log(`   ${file} (${size} KB)`);
  });
}

/**
 * Build geometry-like structure from DNA for generators that need it
 */
function buildGeometryFromDNA(dna) {
  const { dimensions, rooms, materials, style, roof } = dna;

  // Group rooms by floor
  const floorRooms = {};
  rooms.forEach((room) => {
    const floor = room.floor || 0;
    if (!floorRooms[floor]) {floorRooms[floor] = [];}
    floorRooms[floor].push(room);
  });

  // Calculate room positions using strip-packing algorithm
  Object.keys(floorRooms).forEach((floor) => {
    const floorRoomList = floorRooms[floor];
    let currentX = 0.3; // Start after exterior wall
    let currentY = 0.3;
    let rowHeight = 0;
    const maxWidth = dimensions.width - 0.6; // Account for walls

    floorRoomList.forEach((room) => {
      const roomDims = room.dimensions || {};
      const roomWidth = roomDims.length || 4;
      const roomLength = roomDims.width || 4;

      // Check if room fits in current row
      if (currentX + roomWidth > maxWidth) {
        currentX = 0.3;
        currentY += rowHeight + 0.1; // Add internal wall thickness
        rowHeight = 0;
      }

      room.x = currentX;
      room.y = currentY;
      room.width = roomWidth;
      room.length = roomLength;
      room.area = roomWidth * roomLength;
      room.hasDoor = true;

      currentX += roomWidth + 0.1;
      rowHeight = Math.max(rowHeight, roomLength);
    });
  });

  return {
    dimensions: {
      width: dimensions.width,
      length: dimensions.length,
      height: dimensions.height,
    },
    floors: Object.keys(floorRooms).map((floor) => ({
      level: parseInt(floor),
      height: dimensions.floorHeights?.[floor] || 3,
      rooms: floorRooms[floor],
    })),
    materials: materials,
    roof: roof,
    style: style,
    openings: generateOpenings(dna),
    getFloorPlanData: (floor) => ({
      width: dimensions.width,
      length: dimensions.length,
      rooms: floorRooms[floor] || [],
      wallThickness: 0.3,
      name: floor === 0 ? 'Ground Floor' : `Floor ${floor}`,
    }),
  };
}

/**
 * Generate window/door openings from DNA
 */
function generateOpenings(dna) {
  const openings = {
    north: [],
    south: [],
    east: [],
    west: [],
  };

  // Extract windows from rooms
  dna.rooms.forEach((room, index) => {
    const windows = room.windows || [];
    const floor = room.floor || 0;

    // Place windows based on room position
    const direction = index % 2 === 0 ? 'south' : 'north';
    windows.forEach((win, winIndex) => {
      openings[direction].push({
        type: 'window',
        floor: floor,
        x: 2 + index * 2 + winIndex,
        y: 1,
        width: 1.2,
        height: 1.4,
      });
    });
  });

  // Add main entrance
  openings.south.push({
    type: 'door',
    floor: 0,
    x: dna.dimensions.width / 2,
    y: 0,
    width: 1.0,
    height: 2.1,
  });

  return openings;
}

// Run
main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
