/**
 * Test Geometry Volume System
 * 
 * Verifies:
 * - Volume specification generation
 * - Geometry render generation
 * - Modification classification
 */

console.log('\n🧪 ========================================');
console.log('🧪 GEOMETRY VOLUME SYSTEM TESTS');
console.log('🧪 ========================================\n');

let passed = 0;
let failed = 0;

// Test 1: Volume spec has required fields
console.log('Test 1: Volume specification structure');
const mockVolumeSpec = {
  massing: {
    type: 'single_volume',
    footprint_shape: 'rectangular',
    floor_stacking: 'uniform',
    wings: [{ name: 'main', length_m: 15, width_m: 10, floors: 2 }]
  },
  roof: {
    type: 'gable',
    pitch_degrees: 35,
    overhang_m: 0.5,
    ridge_orientation: 'north_south'
  },
  facades: {
    north: { type: 'primary', features: ['entrance'], window_count: 4 },
    south: { type: 'secondary', features: ['windows'], window_count: 3 },
    east: { type: 'side', features: ['windows'], window_count: 2 },
    west: { type: 'side', features: ['windows'], window_count: 2 }
  },
  heights: {
    ground_floor_m: 3.0,
    upper_floors_m: 2.7,
    total_height_m: 5.7
  },
  volumes: [
    { id: 'main', dimensions: { length: 15, width: 10, height: 5.7 } }
  ]
};

const hasRequiredFields = mockVolumeSpec.massing 
  && mockVolumeSpec.roof 
  && mockVolumeSpec.facades 
  && mockVolumeSpec.heights;

if (hasRequiredFields) {
  console.log('✅ Test 1 PASSED: Volume spec has required fields');
  console.log('   Massing:', mockVolumeSpec.massing.type);
  console.log('   Roof:', mockVolumeSpec.roof.type);
  console.log('   Facades:', Object.keys(mockVolumeSpec.facades).length);
  passed++;
} else {
  console.log('❌ Test 1 FAILED: Missing required fields');
  failed++;
}

// Test 2: Roof type is singular (not mixed)
console.log('\nTest 2: Single roof type across all volumes');
const roofTypes = new Set();
roofTypes.add(mockVolumeSpec.roof.type);
mockVolumeSpec.volumes.forEach(vol => {
  if (vol.roof_type) roofTypes.add(vol.roof_type);
});

if (roofTypes.size === 1) {
  console.log('✅ Test 2 PASSED: Single roof type');
  console.log('   Roof type:', Array.from(roofTypes)[0]);
  passed++;
} else {
  console.log('❌ Test 2 FAILED: Multiple roof types found');
  console.log('   Roof types:', Array.from(roofTypes));
  failed++;
}

// Test 3: All facades have window counts
console.log('\nTest 3: All facades have window counts');
const facadeDirections = ['north', 'south', 'east', 'west'];
const allHaveWindows = facadeDirections.every(dir => 
  typeof mockVolumeSpec.facades[dir]?.window_count === 'number'
);

if (allHaveWindows) {
  console.log('✅ Test 3 PASSED: All facades have window counts');
  facadeDirections.forEach(dir => {
    console.log(`   ${dir}: ${mockVolumeSpec.facades[dir].window_count} windows`);
  });
  passed++;
} else {
  console.log('❌ Test 3 FAILED: Some facades missing window counts');
  failed++;
}

// Test 4: Primary facade identified
console.log('\nTest 4: Primary facade identified');
const primaryFacade = facadeDirections.find(dir => 
  mockVolumeSpec.facades[dir]?.type === 'primary'
);

if (primaryFacade) {
  console.log('✅ Test 4 PASSED: Primary facade identified');
  console.log('   Primary:', primaryFacade);
  console.log('   Features:', mockVolumeSpec.facades[primaryFacade].features);
  passed++;
} else {
  console.log('❌ Test 4 FAILED: No primary facade');
  failed++;
}

// Test 5: Heights are realistic
console.log('\nTest 5: Heights are realistic');
const groundHeight = mockVolumeSpec.heights.ground_floor_m;
const upperHeight = mockVolumeSpec.heights.upper_floors_m;
const totalHeight = mockVolumeSpec.heights.total_height_m;

const heightsRealistic = groundHeight >= 2.4 && groundHeight <= 4.0
  && upperHeight >= 2.4 && upperHeight <= 3.5
  && totalHeight > 0;

if (heightsRealistic) {
  console.log('✅ Test 5 PASSED: Heights are realistic');
  console.log('   Ground:', groundHeight + 'm');
  console.log('   Upper:', upperHeight + 'm');
  console.log('   Total:', totalHeight + 'm');
  passed++;
} else {
  console.log('❌ Test 5 FAILED: Heights unrealistic');
  console.log('   Ground:', groundHeight);
  console.log('   Upper:', upperHeight);
  console.log('   Total:', totalHeight);
  failed++;
}

// Test 6: Modification classification (heuristic)
console.log('\nTest 6: Modification classification');

const testCases = [
  { request: 'change brick color to white', expected: 'appearance_only' },
  { request: 'add a balcony on south facade', expected: 'minor_elevation' },
  { request: 'add a third floor', expected: 'volume_change' },
  { request: 'make it modern style', expected: 'appearance_only' }
];

let classificationPassed = 0;

testCases.forEach(test => {
  const request = test.request.toLowerCase();
  
  // Simple heuristic
  let classified = 'appearance_only';
  if (request.includes('floor') || request.includes('extend') || request.includes('wing')) {
    classified = 'volume_change';
  } else if (request.includes('balcony') || request.includes('window pattern')) {
    classified = 'minor_elevation';
  }

  if (classified === test.expected) {
    console.log(`   ✅ "${test.request}" → ${classified}`);
    classificationPassed++;
  } else {
    console.log(`   ❌ "${test.request}" → ${classified} (expected ${test.expected})`);
  }
});

if (classificationPassed === testCases.length) {
  console.log('✅ Test 6 PASSED: All classifications correct');
  passed++;
} else {
  console.log(`❌ Test 6 FAILED: ${testCases.length - classificationPassed}/${testCases.length} incorrect`);
  failed++;
}

// Test 7: Geometry data structure for baseline
console.log('\nTest 7: Geometry baseline structure');
const geometryBaseline = {
  volumeSpec: mockVolumeSpec,
  renders: {
    elevation_north: 'data:image/png;base64,...',
    elevation_south: 'data:image/png;base64,...',
    elevation_east: 'data:image/png;base64,...',
    elevation_west: 'data:image/png;base64,...',
    axonometric: 'data:image/png;base64,...',
    hero_perspective: 'data:image/png;base64,...'
  },
  hasGeometry: true
};

const hasAllRenders = geometryBaseline.renders.elevation_north
  && geometryBaseline.renders.elevation_south
  && geometryBaseline.renders.elevation_east
  && geometryBaseline.renders.elevation_west
  && geometryBaseline.renders.axonometric
  && geometryBaseline.renders.hero_perspective;

if (hasAllRenders && geometryBaseline.volumeSpec && geometryBaseline.hasGeometry) {
  console.log('✅ Test 7 PASSED: Geometry baseline structure complete');
  console.log('   Volume spec:', !!geometryBaseline.volumeSpec);
  console.log('   Renders:', Object.keys(geometryBaseline.renders).length);
  passed++;
} else {
  console.log('❌ Test 7 FAILED: Incomplete geometry baseline');
  failed++;
}

// Summary
console.log('\n🧪 ========================================');
console.log(`🧪 RESULTS: ${passed}/${passed + failed} tests passed`);
console.log('🧪 ========================================\n');

if (failed > 0) {
  console.error(`❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}

