/**
 * Test Two-Pass DNA Generation
 * 
 * Verifies the new strict DNA pipeline:
 * - Two-pass generation (Author + Reviewer)
 * - Structured schema validation
 * - Deterministic repair
 * - No fallback DNA
 */

const { validateDNASchema, normalizeRawDNA, buildDNARequestPayload } = require('./src/services/dnaSchema.js');
const { repairDNA, ensureRequiredSections } = require('./src/services/dnaRepair.js');

console.log('\n🧪 ========================================');
console.log('🧪 TWO-PASS DNA GENERATION TESTS');
console.log('🧪 ========================================\n');

let passed = 0;
let failed = 0;

// Test 1: DNA schema validation
console.log('Test 1: DNA schema validation');
const validDNA = {
  site: {
    polygon: [],
    area_m2: 150,
    orientation: 0,
    climate_zone: 'temperate',
    sun_path: 'south',
    wind_profile: 'moderate'
  },
  program: {
    floors: 2,
    rooms: [
      { name: 'Living Room', area_m2: 25, floor: 'ground', orientation: 'south' }
    ]
  },
  style: {
    architecture: 'contemporary',
    materials: ['brick', 'wood'],
    windows: { pattern: 'regular grid', proportion: '3:5' }
  },
  geometry_rules: {
    grid: '1m grid',
    max_span: '6m',
    roof_type: 'gable'
  }
};

const validation1 = validateDNASchema(validDNA);
if (validation1.valid) {
  console.log('✅ Test 1 PASSED: Valid DNA passes schema validation');
  passed++;
} else {
  console.log('❌ Test 1 FAILED: Valid DNA rejected');
  console.log('   Missing:', validation1.missing);
  console.log('   Errors:', validation1.errors);
  failed++;
}

// Test 2: Missing sections detected
console.log('\nTest 2: Missing sections detected');
const incompleteDNA = {
  site: { area_m2: 150 },
  // Missing program, style, geometry_rules
};

const validation2 = validateDNASchema(incompleteDNA);
if (!validation2.valid && validation2.missing.length === 3) {
  console.log('✅ Test 2 PASSED: Missing sections detected');
  console.log('   Missing:', validation2.missing);
  passed++;
} else {
  console.log('❌ Test 2 FAILED: Missing sections not detected');
  console.log('   Valid:', validation2.valid);
  console.log('   Missing:', validation2.missing);
  failed++;
}

// Test 3: Normalize raw DNA
console.log('\nTest 3: Normalize raw DNA');
const rawDNA = {
  site: { area_m2: '150', climate_zone: 'temperate' },
  program: { floors: '2', rooms: [] },
  style: { architecture: 'modern', materials: ['brick'] },
  geometry_rules: { roof_type: 'gable' }
};

try {
  const normalized = normalizeRawDNA(rawDNA);
  if (typeof normalized.site.area_m2 === 'number' && typeof normalized.program.floors === 'number') {
    console.log('✅ Test 3 PASSED: Raw DNA normalized correctly');
    console.log('   area_m2 type:', typeof normalized.site.area_m2);
    console.log('   floors type:', typeof normalized.program.floors);
    passed++;
  } else {
    console.log('❌ Test 3 FAILED: Types not normalized');
    failed++;
  }
} catch (error) {
  console.log('❌ Test 3 FAILED:', error.message);
  failed++;
}

// Test 4: Ensure required sections
console.log('\nTest 4: Ensure required sections');
const emptyDNA = {};
const repaired = ensureRequiredSections(emptyDNA);

if (repaired.site && repaired.program && repaired.style && repaired.geometry_rules) {
  console.log('✅ Test 4 PASSED: Required sections added');
  console.log('   Sections:', Object.keys(repaired));
  passed++;
} else {
  console.log('❌ Test 4 FAILED: Missing sections after repair');
  console.log('   Sections:', Object.keys(repaired));
  failed++;
}

// Test 5: Build DNA request payload
console.log('\nTest 5: Build DNA request payload');
const locationData = {
  climate: { type: 'temperate' },
  sunPath: { optimalOrientation: 'south' }
};
const siteMetrics = {
  areaM2: 200,
  orientationDeg: 45,
  sitePolygon: []
};
const programSpec = {
  floors: 2,
  programSpaces: [
    { name: 'Living', area: 25, floor: 'ground' }
  ]
};

const payload = buildDNARequestPayload(locationData, siteMetrics, programSpec, null);

if (payload.site && payload.program && payload.style && payload.geometry_rules) {
  console.log('✅ Test 5 PASSED: Request payload built correctly');
  console.log('   Site area:', payload.site.area_m2);
  console.log('   Floors:', payload.program.floors);
  console.log('   Style:', payload.style.architecture);
  passed++;
} else {
  console.log('❌ Test 5 FAILED: Incomplete payload');
  console.log('   Payload:', payload);
  failed++;
}

// Test 6: Full DNA repair pipeline
console.log('\nTest 6: Full DNA repair pipeline');
const partialDNA = {
  site: { area_m2: 150 },
  program: { floors: 2 },
  style: {},
  geometry_rules: {}
};

const context = {
  locationData: { climate: { type: 'temperate' } },
  projectSpec: { floors: 2, programSpaces: [] },
  portfolioSummary: { dominantStyle: 'modern' }
};

const fullyRepaired = repairDNA(partialDNA, context);
const validation6 = validateDNASchema(fullyRepaired);

if (validation6.valid) {
  console.log('✅ Test 6 PASSED: DNA fully repaired and valid');
  console.log('   Style:', fullyRepaired.style.architecture);
  console.log('   Materials:', fullyRepaired.style.materials);
  console.log('   Roof:', fullyRepaired.geometry_rules.roof_type);
  passed++;
} else {
  console.log('❌ Test 6 FAILED: Repaired DNA still invalid');
  console.log('   Missing:', validation6.missing);
  console.log('   Errors:', validation6.errors);
  failed++;
}

// Test 7: Reject invalid DNA types
console.log('\nTest 7: Reject invalid DNA types');
const invalidDNA = {
  site: { area_m2: -100 }, // Negative area
  program: { floors: 0 }, // Zero floors
  style: { materials: [] }, // Empty materials
  geometry_rules: {}
};

const validation7 = validateDNASchema(invalidDNA);
if (!validation7.valid && validation7.errors.length > 0) {
  console.log('✅ Test 7 PASSED: Invalid DNA rejected');
  console.log('   Errors:', validation7.errors);
  passed++;
} else {
  console.log('❌ Test 7 FAILED: Invalid DNA not rejected');
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

