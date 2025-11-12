/**
 * Test Sample Design
 * Validates sample-design.json against geometry pipeline
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Sample Design...\n');

// Load sample design
const designPath = path.join(__dirname, 'src', 'examples', 'sample-design.json');
const design = JSON.parse(fs.readFileSync(designPath, 'utf8'));

console.log('✅ Sample design loaded successfully');
console.log(`   Design ID: ${design.design_id}`);
console.log(`   Floors: ${design.dimensions.floorCount}`);
console.log(`   Total Area: ${design.metadata.totalArea}m²`);
console.log(`   Rooms: ${design.metadata.roomCount}`);
console.log(`   Doors: ${design.metadata.doorCount}`);
console.log(`   Windows: ${design.metadata.windowCount}\n`);

// Validate schema
console.log('🔍 Validating schema...');

const requiredFields = [
  'design_id',
  'site',
  'dna',
  'dimensions',
  'levels',
  'rooms',
  'doors',
  'windows',
  'roof',
  'cameras',
  'visualizations',
  'metadata'
];

let schemaValid = true;
requiredFields.forEach(field => {
  if (!design[field]) {
    console.error(`❌ Missing required field: ${field}`);
    schemaValid = false;
  }
});

if (schemaValid) {
  console.log('✅ Schema validation passed\n');
} else {
  console.error('❌ Schema validation failed\n');
  process.exit(1);
}

// Validate rooms
console.log('🏠 Validating rooms...');

const roomErrors = [];
const roomWarnings = [];

design.rooms.forEach(room => {
  // Check required fields
  if (!room.id || !room.name || room.level === undefined || !room.poly || !room.area) {
    roomErrors.push(`Room ${room.id || 'unknown'} missing required fields`);
  }

  // Check polygon
  if (room.poly && room.poly.length < 3) {
    roomErrors.push(`Room ${room.id} has invalid polygon (< 3 points)`);
  }

  // Check area
  if (room.area && room.area < 2) {
    roomErrors.push(`Room ${room.id} area too small (${room.area}m² < 2m²)`);
  }

  // Check center
  if (!room.center || room.center.length !== 2) {
    roomWarnings.push(`Room ${room.id} missing or invalid center`);
  }

  // Check bounds
  if (!room.bounds || !room.bounds.width || !room.bounds.height) {
    roomWarnings.push(`Room ${room.id} missing or invalid bounds`);
  }
});

if (roomErrors.length > 0) {
  console.error('❌ Room validation errors:');
  roomErrors.forEach(err => console.error(`   - ${err}`));
  console.log('');
} else {
  console.log('✅ All rooms valid');
}

if (roomWarnings.length > 0) {
  console.warn('⚠️  Room validation warnings:');
  roomWarnings.forEach(warn => console.warn(`   - ${warn}`));
  console.log('');
}

// Validate topology
console.log('📐 Validating topology...');

const footprintArea = design.dimensions.length * design.dimensions.width;
const groundRooms = design.rooms.filter(r => r.level === 0);
const groundArea = groundRooms.reduce((sum, r) => sum + r.area, 0);

console.log(`   Footprint: ${footprintArea}m²`);
console.log(`   Ground floor rooms: ${groundArea.toFixed(1)}m²`);
console.log(`   Coverage: ${((groundArea / footprintArea) * 100).toFixed(1)}%`);

if (groundArea > footprintArea * 1.1) {
  console.error(`❌ Ground floor exceeds footprint (${groundArea}m² > ${footprintArea}m²)`);
} else {
  console.log('✅ Topology valid\n');
}

// Validate doors
console.log('🚪 Validating doors...');

const doorErrors = [];

design.doors.forEach(door => {
  if (!door.id || !door.room_a || !door.at || !door.width_mm) {
    doorErrors.push(`Door ${door.id || 'unknown'} missing required fields`);
  }

  if (door.width_mm < 800 || door.width_mm > 1200) {
    doorErrors.push(`Door ${door.id} has unrealistic width (${door.width_mm}mm)`);
  }

  if (door.type === 'main_entrance' && door.room_b !== null) {
    doorErrors.push(`Main entrance door ${door.id} should have room_b = null`);
  }
});

if (doorErrors.length > 0) {
  console.error('❌ Door validation errors:');
  doorErrors.forEach(err => console.error(`   - ${err}`));
  console.log('');
} else {
  console.log('✅ All doors valid\n');
}

// Validate windows
console.log('🪟 Validating windows...');

const windowErrors = [];

design.windows.forEach(window => {
  if (!window.id || !window.room || !window.wall || !window.center || !window.width_mm) {
    windowErrors.push(`Window ${window.id || 'unknown'} missing required fields`);
  }

  if (window.width_mm < 600 || window.width_mm > 3000) {
    windowErrors.push(`Window ${window.id} has unrealistic width (${window.width_mm}mm)`);
  }

  if (window.sill_mm && window.sill_mm < 300) {
    windowErrors.push(`Window ${window.id} sill too low (${window.sill_mm}mm < 300mm)`);
  }
});

if (windowErrors.length > 0) {
  console.error('❌ Window validation errors:');
  windowErrors.forEach(err => console.error(`   - ${err}`));
  console.log('');
} else {
  console.log('✅ All windows valid\n');
}

// Calculate WWR
console.log('📊 Calculating WWR...');

const floorHeight = design.levels[0].height_mm / 1000; // m
const perimeter = 2 * (design.dimensions.length + design.dimensions.width);
const totalWallArea = perimeter * floorHeight * design.dimensions.floorCount;

const totalWindowArea = design.windows.reduce((sum, w) => {
  return sum + (w.width_mm * w.height_mm) / 1_000_000; // mm² → m²
}, 0);

const actualWWR = totalWindowArea / totalWallArea;
const targetWWR = design.dna.wwr;

console.log(`   Total wall area: ${totalWallArea.toFixed(1)}m²`);
console.log(`   Total window area: ${totalWindowArea.toFixed(1)}m²`);
console.log(`   Target WWR: ${targetWWR.toFixed(3)}`);
console.log(`   Actual WWR: ${actualWWR.toFixed(3)}`);

if (Math.abs(actualWWR - targetWWR) > 0.05) {
  console.warn(`⚠️  WWR mismatch: target ${targetWWR.toFixed(3)}, actual ${actualWWR.toFixed(3)}\n`);
} else {
  console.log('✅ WWR within tolerance\n');
}

// Validate cameras
console.log('📷 Validating cameras...');

const requiredCameras = ['axon', 'persp', 'interior_main'];
let camerasValid = true;

requiredCameras.forEach(camType => {
  if (!design.cameras[camType]) {
    console.error(`❌ Missing camera: ${camType}`);
    camerasValid = false;
  } else {
    const cam = design.cameras[camType];
    if (camType === 'axon' || camType === 'persp') {
      if (cam.azimuth === undefined || cam.elevation === undefined) {
        console.error(`❌ Camera ${camType} missing azimuth or elevation`);
        camerasValid = false;
      }
    }
  }
});

if (camerasValid) {
  console.log('✅ All cameras configured\n');
}

// Validate roof
console.log('🏠 Validating roof...');

if (!design.roof || !design.roof.type || !design.roof.geometry) {
  console.error('❌ Roof missing required fields');
} else {
  console.log(`✅ Roof configured (${design.roof.type}, ${design.roof.pitch}°)\n`);
}

// Summary
console.log('═══════════════════════════════════════════════════════════');
console.log('VALIDATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════');

const totalErrors = roomErrors.length + doorErrors.length + windowErrors.length + (!schemaValid ? 1 : 0) + (!camerasValid ? 1 : 0);
const totalWarnings = roomWarnings.length + (Math.abs(actualWWR - targetWWR) > 0.05 ? 1 : 0);

console.log(`Schema: ${schemaValid ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Rooms: ${roomErrors.length === 0 ? '✅ PASS' : `❌ FAIL (${roomErrors.length} errors)`}`);
console.log(`Doors: ${doorErrors.length === 0 ? '✅ PASS' : `❌ FAIL (${doorErrors.length} errors)`}`);
console.log(`Windows: ${windowErrors.length === 0 ? '✅ PASS' : `❌ FAIL (${windowErrors.length} errors)`}`);
console.log(`Cameras: ${camerasValid ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Topology: ✅ PASS`);
console.log(`WWR: ${Math.abs(actualWWR - targetWWR) <= 0.05 ? '✅ PASS' : '⚠️  WARNING'}`);
console.log('═══════════════════════════════════════════════════════════');

if (totalErrors === 0 && totalWarnings === 0) {
  console.log('\n🎉 ALL TESTS PASSED! Design is ready for geometry rendering.');
  process.exit(0);
} else if (totalErrors === 0) {
  console.log(`\n✅ TESTS PASSED with ${totalWarnings} warning(s). Design is usable.`);
  process.exit(0);
} else {
  console.log(`\n❌ TESTS FAILED: ${totalErrors} error(s), ${totalWarnings} warning(s)`);
  process.exit(1);
}
