#!/usr/bin/env node
/**
 * Geometry Mask Test Suite
 *
 * Tests for ProceduralGeometryService v2 (program-logical layout engine).
 * Run with: node scripts/tests/test-geometry-mask.mjs
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import of the service (use pathToFileURL for Windows compatibility)
const servicePath = join(__dirname, '../../src/services/geometry/ProceduralGeometryService.js');
const serviceUrl = pathToFileURL(servicePath).href;
const ProceduralGeometryService = await import(serviceUrl)
  .then((m) => m.ProceduralGeometryService || m.default?.ProceduralGeometryService);

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDefined(value, message) {
  if (value === undefined || value === null) {
    throw new Error(`${message}: value is undefined/null`);
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

console.log('\n🧪 Geometry Mask Test Suite (ProceduralGeometryService v2)\n');
console.log('=' .repeat(60));

// Test 1: Service instantiation
console.log('\n📦 Test Group: Service Instantiation');
test('Service class can be instantiated', () => {
  const service = new ProceduralGeometryService();
  assertDefined(service, 'Service should exist');
  assertDefined(service.generateLayout, 'generateLayout method should exist');
});

// Test 2: Basic layout generation
console.log('\n📐 Test Group: Basic Layout Generation');

const basicDNA = {
  dimensions: {
    length: 15,
    width: 10,
    floors: 2,
  },
  buildingType: 'residential',
  programSpaces: [
    { name: 'Living Room', area: 25, floor: 0 },
    { name: 'Kitchen', area: 15, floor: 0 },
    { name: 'Bathroom', area: 6, floor: 0 },
    { name: 'Master Bedroom', area: 20, floor: 1 },
    { name: 'Guest Bedroom', area: 15, floor: 1 },
    { name: 'Ensuite', area: 5, floor: 1 },
  ],
};

test('Generates layout from basic DNA', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);
  assertDefined(result, 'Result should exist');
  assertDefined(result.floors, 'floors should exist');
  assertDefined(result.groundFloor, 'groundFloor should exist');
  assertDefined(result.metadata, 'metadata should exist');
});

test('Output dimensions are multiples of 16', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  Object.entries(result.floors).forEach(([floorIndex, floorData]) => {
    assertTrue(floorData.width % 16 === 0, `Floor ${floorIndex} width (${floorData.width}) must be multiple of 16`);
    assertTrue(floorData.height % 16 === 0, `Floor ${floorIndex} height (${floorData.height}) must be multiple of 16`);
  });
});

test('SVG string is valid XML', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  Object.entries(result.floors).forEach(([floorIndex, floorData]) => {
    assertTrue(floorData.svgString.startsWith('<svg'), `Floor ${floorIndex} SVG should start with <svg`);
    assertTrue(floorData.svgString.endsWith('</svg>'), `Floor ${floorIndex} SVG should end with </svg>`);
    assertTrue(floorData.svgString.includes('xmlns'), `Floor ${floorIndex} SVG should have xmlns attribute`);
  });
});

test('Data URL is valid base64 SVG', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  Object.entries(result.floors).forEach(([floorIndex, floorData]) => {
    assertTrue(
      floorData.dataUrl.startsWith('data:image/svg+xml;base64,'),
      `Floor ${floorIndex} dataUrl should be base64 SVG`
    );
  });
});

// Test 3: Floor metadata
console.log('\n📊 Test Group: Floor Metadata');

test('Metadata includes version string', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);
  assertEqual(result.metadata.version, '2.0-program-logical', 'Version should be 2.0-program-logical');
});

test('Floor metadata has required fields', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  assertDefined(result.floorMetadata, 'floorMetadata should exist');

  Object.entries(result.floorMetadata).forEach(([floorIndex, meta]) => {
    assertDefined(meta.rooms, `Floor ${floorIndex} should have rooms array`);
    assertDefined(meta.stairCore, `Floor ${floorIndex} should have stairCore`);
    assertDefined(meta.circulation, `Floor ${floorIndex} should have circulation`);
    assertDefined(meta.totalArea, `Floor ${floorIndex} should have totalArea`);
  });
});

test('Room metadata includes bounding boxes', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  Object.entries(result.floorMetadata).forEach(([floorIndex, meta]) => {
    meta.rooms.forEach((room, i) => {
      // The API uses 'bbox' not 'bounds'
      assertDefined(room.bbox, `Floor ${floorIndex} room ${i} should have bbox`);
      assertDefined(room.bbox.x, `Floor ${floorIndex} room ${i} bbox should have x`);
      assertDefined(room.bbox.y, `Floor ${floorIndex} room ${i} bbox should have y`);
      assertDefined(room.bbox.width, `Floor ${floorIndex} room ${i} bbox should have width`);
      assertDefined(room.bbox.depth, `Floor ${floorIndex} room ${i} bbox should have depth`);
    });
  });
});

// Test 4: Program-aware layout logic
console.log('\n🏠 Test Group: Program-Aware Layout Logic');

test('Stair core is consistent across floors', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  const floor0Core = result.floorMetadata[0]?.stairCore;
  const floor1Core = result.floorMetadata[1]?.stairCore;

  assertDefined(floor0Core, 'Ground floor should have stair core');
  assertDefined(floor1Core, 'First floor should have stair core');

  // Core position should be identical across floors (use bbox.x, bbox.y)
  assertEqual(floor0Core.bbox.x, floor1Core.bbox.x, 'Stair core X should match across floors');
  assertEqual(floor0Core.bbox.y, floor1Core.bbox.y, 'Stair core Y should match across floors');
  assertEqual(floor0Core.bbox.width, floor1Core.bbox.width, 'Stair core width should match across floors');
  assertEqual(floor0Core.bbox.depth, floor1Core.bbox.depth, 'Stair core depth should match across floors');
});

test('Wet rooms are stacked vertically', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);

  // Find bathroom positions on each floor
  const floor0Wet = result.floorMetadata[0]?.rooms.filter((r) =>
    ['bathroom', 'wc', 'utility'].some((w) => r.name.toLowerCase().includes(w))
  );
  const floor1Wet = result.floorMetadata[1]?.rooms.filter((r) =>
    ['bathroom', 'ensuite', 'wc'].some((w) => r.name.toLowerCase().includes(w))
  );

  if (floor0Wet.length > 0 && floor1Wet.length > 0) {
    // Wet rooms should be near each other (within reasonable tolerance)
    const tolerance = 100; // pixels
    // Use bbox.x instead of bounds.x
    const floor0WetX = floor0Wet[0].bbox?.x ?? 0;
    const floor1WetX = floor1Wet[0].bbox?.x ?? 0;

    assertTrue(
      Math.abs(floor0WetX - floor1WetX) < tolerance,
      `Wet rooms should stack vertically (diff: ${Math.abs(floor0WetX - floor1WetX)}px)`
    );
  } else {
    // If no wet rooms found on both floors, that's OK - skip this test
    console.log('     (Skipped: No wet rooms found on both floors)');
  }
});

// Test 5: Different building types
console.log('\n🏢 Test Group: Building Type Variations');

const officesDNA = {
  dimensions: { length: 20, width: 15, floors: 3 },
  buildingType: 'office',
};

test('Generates layout for office building', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(officesDNA);
  assertDefined(result, 'Result should exist');
  assertEqual(Object.keys(result.floors).length, 3, 'Should have 3 floors');
});

const clinicDNA = {
  dimensions: { length: 25, width: 18, floors: 2 },
  buildingType: 'medical',
  programSpaces: [
    { name: 'Reception', area: 30, floor: 0 },
    { name: 'Waiting Room', area: 40, floor: 0 },
    { name: 'Exam Room 1', area: 15, floor: 0 },
    { name: 'Exam Room 2', area: 15, floor: 0 },
    { name: 'Staff Room', area: 20, floor: 1 },
    { name: 'Storage', area: 15, floor: 1 },
  ],
};

test('Generates layout for medical clinic', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(clinicDNA);
  assertDefined(result, 'Result should exist');
  assertTrue(result.floorMetadata[0].rooms.length >= 2, 'Ground floor should have rooms');
});

// Test 6: Edge cases
console.log('\n⚠️ Test Group: Edge Cases');

test('Handles missing dimensions gracefully', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout({ buildingType: 'residential' });
  assertDefined(result, 'Should generate even without dimensions');
  assertDefined(result.floors, 'Should have floors');
});

test('Handles empty programSpaces', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout({
    dimensions: { length: 12, width: 8, floors: 1 },
    programSpaces: [],
  });
  assertDefined(result, 'Should generate with empty program');
  assertDefined(result.floors[0], 'Should have ground floor');
});

test('Handles single-floor building', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout({
    dimensions: { length: 10, width: 8, floors: 1 },
    buildingType: 'residential',
  });
  assertEqual(Object.keys(result.floors).length, 1, 'Should have exactly 1 floor');
});

// Test 7: Hero 3D floor (special case)
console.log('\n🎨 Test Group: Hero 3D Floor');

test('Generates hero3dFloor for 3D views', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);
  assertDefined(result.hero3dFloor, 'hero3dFloor should exist');
  assertDefined(result.hero3dFloor.dataUrl, 'hero3dFloor should have dataUrl');
});

test('Hero 3D dimensions match target (2000×2000)', () => {
  const service = new ProceduralGeometryService();
  const result = service.generateLayout(basicDNA);
  assertEqual(result.hero3dFloor.width, 2000, 'Hero 3D width should be 2000');
  assertEqual(result.hero3dFloor.height, 2000, 'Hero 3D height should be 2000');
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '=' .repeat(60));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ Some tests failed!\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
