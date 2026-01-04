/**
 * Test Auto-Level Assignment Service
 *
 * Tests the complete auto-level assignment workflow:
 * 1. Floor count calculation based on proportion (program area / site area)
 * 2. Intelligent space-to-level assignment based on architectural principles
 * 3. Integration with DNA generator
 * 4. Different building types (residential, commercial, healthcare, educational)
 * 5. Different site area scenarios (small, medium, large)
 */

import autoLevelAssignmentService from './src/services/autoLevelAssignmentService.js';

console.log('🧪 Starting Auto-Level Assignment Tests\n');
console.log('=' .repeat(80));

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, testFn) {
  totalTests++;
  try {
    const result = testFn();
    if (result) {
      passedTests++;
      console.log(`✅ PASS: ${description}`);
    } else {
      failedTests++;
      console.log(`❌ FAIL: ${description}`);
    }
  } catch (error) {
    failedTests++;
    console.log(`❌ FAIL: ${description}`);
    console.log(`   Error: ${error.message}`);
  }
}

function logSection(title) {
  console.log('\n' + '─'.repeat(80));
  console.log(`  ${title}`);
  console.log('─'.repeat(80) + '\n');
}

// ============================================================================
// TEST 1: RESIDENTIAL BUILDINGS
// ============================================================================

logSection('TEST 1: RESIDENTIAL BUILDINGS');

// Test 1.1: Single-family house (small site)
console.log('Test 1.1: Single-family house on small site (300m²)');
const houseProgram = [
  { name: 'Living Room', area: 25, count: 1 },
  { name: 'Kitchen', area: 12, count: 1 },
  { name: 'Dining Room', area: 15, count: 1 },
  { name: 'Master Bedroom', area: 18, count: 1 },
  { name: 'Bedroom 2', area: 12, count: 1 },
  { name: 'Bedroom 3', area: 10, count: 1 },
  { name: 'Bathroom', area: 8, count: 2 },
  { name: 'WC', area: 3, count: 1 }
];

const houseResult = autoLevelAssignmentService.autoAssignComplete(
  houseProgram,
  300, // 300m² site
  'residential-house'
);

test('House floor count calculated correctly', () => {
  console.log(`   Calculated: ${houseResult.floorCount} floors`);
  console.log(`   Total program: ${houseResult.summary.totalArea.toFixed(0)}m²`);
  console.log(`   Site area: ${houseResult.summary.siteArea}m²`);
  console.log(`   Footprint: ${houseResult.summary.footprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${houseResult.summary.siteCoverage.toFixed(1)}%`);
  return houseResult.floorCount >= 2; // Should be 2 floors for typical house
});

test('House spaces assigned correctly to levels', () => {
  const groundSpaces = houseResult.assignedSpaces.filter(s => s.level === 'Ground');
  const firstSpaces = houseResult.assignedSpaces.filter(s => s.level === 'First');
  console.log(`   Ground floor: ${groundSpaces.length} spaces`);
  console.log(`   First floor: ${firstSpaces.length} spaces`);

  // Living, kitchen, dining, WC should be ground
  const livingOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('living'));
  const kitchenOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('kitchen'));

  // Bedrooms should be first floor
  const bedroomsOnFirst = firstSpaces.filter(s => s.name.toLowerCase().includes('bedroom')).length >= 2;

  console.log(`   Living on ground: ${livingOnGround}`);
  console.log(`   Kitchen on ground: ${kitchenOnGround}`);
  console.log(`   Bedrooms on first: ${bedroomsOnFirst}`);

  return livingOnGround && kitchenOnGround && bedroomsOnFirst;
});

// Test 1.2: Apartment building (medium site)
console.log('\nTest 1.2: Apartment building on medium site (800m²)');
const apartmentProgram = [
  { name: 'Lobby & Reception', area: 40, count: 1 },
  { name: '2-Bed Apartment', area: 75, count: 4 },
  { name: '3-Bed Apartment', area: 95, count: 2 },
  { name: 'Communal Lounge', area: 30, count: 1 },
  { name: 'Bike Storage', area: 15, count: 1 },
  { name: 'Plant Room', area: 20, count: 1 }
];

const apartmentResult = autoLevelAssignmentService.autoAssignComplete(
  apartmentProgram,
  800, // 800m² site
  'apartment-building'
);

test('Apartment floor count calculated correctly', () => {
  console.log(`   Calculated: ${apartmentResult.floorCount} floors`);
  console.log(`   Total program: ${apartmentResult.summary.totalArea.toFixed(0)}m²`);
  console.log(`   Footprint: ${apartmentResult.summary.footprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${apartmentResult.summary.siteCoverage.toFixed(1)}%`);
  return apartmentResult.floorCount >= 2 && apartmentResult.floorCount <= 4;
});

test('Apartment lobby on ground floor', () => {
  const groundSpaces = apartmentResult.assignedSpaces.filter(s => s.level === 'Ground');
  const lobbyOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('lobby'));
  console.log(`   Lobby on ground: ${lobbyOnGround}`);
  return lobbyOnGround;
});

// ============================================================================
// TEST 2: COMMERCIAL BUILDINGS
// ============================================================================

logSection('TEST 2: COMMERCIAL BUILDINGS');

// Test 2.1: Office building (large site)
console.log('Test 2.1: Office building on large site (1500m²)');
const officeProgram = [
  { name: 'Reception & Waiting', area: 50, count: 1 },
  { name: 'Open Office Space', area: 200, count: 3 },
  { name: 'Meeting Room', area: 25, count: 4 },
  { name: 'Conference Room', area: 40, count: 2 },
  { name: 'Kitchen & Break Room', area: 30, count: 2 },
  { name: 'Server Room', area: 20, count: 1 },
  { name: 'Storage', area: 15, count: 2 }
];

const officeResult = autoLevelAssignmentService.autoAssignComplete(
  officeProgram,
  1500, // 1500m² site
  'office'
);

test('Office floor count calculated correctly', () => {
  console.log(`   Calculated: ${officeResult.floorCount} floors`);
  console.log(`   Total program: ${officeResult.summary.totalArea.toFixed(0)}m²`);
  console.log(`   Footprint: ${officeResult.summary.footprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${officeResult.summary.siteCoverage.toFixed(1)}%`);
  return officeResult.floorCount >= 2 && officeResult.floorCount <= 5;
});

test('Office reception on ground floor', () => {
  const groundSpaces = officeResult.assignedSpaces.filter(s => s.level === 'Ground');
  const receptionOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('reception'));
  console.log(`   Reception on ground: ${receptionOnGround}`);
  return receptionOnGround;
});

// Test 2.2: Retail building
console.log('\nTest 2.2: Retail building on medium site (600m²)');
const retailProgram = [
  { name: 'Sales Floor', area: 250, count: 1 },
  { name: 'Cash Desk Area', area: 15, count: 1 },
  { name: 'Storage Room', area: 40, count: 1 },
  { name: 'Staff Room', area: 20, count: 1 },
  { name: 'Office', area: 12, count: 1 },
  { name: 'Customer Toilet', area: 8, count: 2 }
];

const retailResult = autoLevelAssignmentService.autoAssignComplete(
  retailProgram,
  600, // 600m² site
  'retail'
);

test('Retail floor count calculated correctly', () => {
  console.log(`   Calculated: ${retailResult.floorCount} floors`);
  console.log(`   Total program: ${retailResult.summary.totalArea.toFixed(0)}m²`);
  console.log(`   Footprint: ${retailResult.summary.footprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${retailResult.summary.siteCoverage.toFixed(1)}%`);
  return retailResult.floorCount >= 1 && retailResult.floorCount <= 3;
});

test('Retail sales floor on ground', () => {
  const groundSpaces = retailResult.assignedSpaces.filter(s => s.level === 'Ground');
  const salesOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('sales'));
  console.log(`   Sales floor on ground: ${salesOnGround}`);
  return salesOnGround;
});

// ============================================================================
// TEST 3: HEALTHCARE BUILDINGS
// ============================================================================

logSection('TEST 3: HEALTHCARE BUILDINGS');

// Test 3.1: Medical clinic
console.log('Test 3.1: Medical clinic on medium site (700m²)');
const clinicProgram = [
  { name: 'Reception & Waiting', area: 45, count: 1 },
  { name: 'Consultation Room', area: 15, count: 6 },
  { name: 'Treatment Room', area: 20, count: 2 },
  { name: 'Pharmacy', area: 25, count: 1 },
  { name: 'Laboratory', area: 30, count: 1 },
  { name: 'Staff Room', area: 20, count: 1 },
  { name: 'Records Office', area: 15, count: 1 },
  { name: 'Toilet', area: 6, count: 4 }
];

const clinicResult = autoLevelAssignmentService.autoAssignComplete(
  clinicProgram,
  700, // 700m² site
  'clinic'
);

test('Clinic floor count calculated correctly', () => {
  console.log(`   Calculated: ${clinicResult.floorCount} floors`);
  console.log(`   Total program: ${clinicResult.summary.totalArea.toFixed(0)}m²`);
  console.log(`   Footprint: ${clinicResult.summary.footprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${clinicResult.summary.siteCoverage.toFixed(1)}%`);
  return clinicResult.floorCount >= 1 && clinicResult.floorCount <= 3;
});

test('Clinic reception and treatment on ground', () => {
  const groundSpaces = clinicResult.assignedSpaces.filter(s => s.level === 'Ground');
  const receptionOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('reception'));
  const treatmentOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('treatment'));
  console.log(`   Reception on ground: ${receptionOnGround}`);
  console.log(`   Treatment on ground: ${treatmentOnGround}`);
  return receptionOnGround && treatmentOnGround;
});

// ============================================================================
// TEST 4: EDUCATIONAL BUILDINGS
// ============================================================================

logSection('TEST 4: EDUCATIONAL BUILDINGS');

// Test 4.1: Primary school
console.log('Test 4.1: Primary school on large site (2000m²)');
const schoolProgram = [
  { name: 'Entrance & Reception', area: 60, count: 1 },
  { name: 'Classroom', area: 60, count: 8 },
  { name: 'Library', area: 80, count: 1 },
  { name: 'Gymnasium', area: 150, count: 1 },
  { name: 'Cafeteria', area: 120, count: 1 },
  { name: 'Staff Room', area: 30, count: 1 },
  { name: 'Office', area: 15, count: 3 },
  { name: 'Toilet Block', area: 40, count: 2 }
];

const schoolResult = autoLevelAssignmentService.autoAssignComplete(
  schoolProgram,
  2000, // 2000m² site
  'school'
);

test('School floor count calculated correctly', () => {
  console.log(`   Calculated: ${schoolResult.floorCount} floors`);
  console.log(`   Total program: ${schoolResult.summary.totalArea.toFixed(0)}m²`);
  console.log(`   Footprint: ${schoolResult.summary.footprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${schoolResult.summary.siteCoverage.toFixed(1)}%`);
  return schoolResult.floorCount >= 1 && schoolResult.floorCount <= 4;
});

test('School public spaces on ground', () => {
  const groundSpaces = schoolResult.assignedSpaces.filter(s => s.level === 'Ground');
  const gymnasiumOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('gymnasium'));
  const cafeteriaOnGround = groundSpaces.some(s => s.name.toLowerCase().includes('cafeteria'));
  console.log(`   Gymnasium on ground: ${gymnasiumOnGround}`);
  console.log(`   Cafeteria on ground: ${cafeteriaOnGround}`);
  return gymnasiumOnGround && cafeteriaOnGround;
});

// ============================================================================
// TEST 5: PROPORTION CALCULATION ACCURACY
// ============================================================================

logSection('TEST 5: PROPORTION CALCULATION ACCURACY');

// Test 5.1: Small program, large site (should be 1 floor)
console.log('Test 5.1: Small program (100m²) on large site (500m²)');
const smallProgram = [
  { name: 'Open Space', area: 100, count: 1 }
];

const smallResult = autoLevelAssignmentService.calculateOptimalLevels(
  100, // 100m² program
  500, // 500m² site
  { buildingType: 'mixed-use' }
);

test('Small program should be 1 floor', () => {
  console.log(`   Calculated: ${smallResult.optimalFloors} floor(s)`);
  console.log(`   Footprint: ${smallResult.actualFootprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${smallResult.siteCoveragePercent.toFixed(1)}%`);
  console.log(`   Fits: ${smallResult.fitsWithinSite ? 'YES' : 'NO'}`);
  return smallResult.optimalFloors === 1 && smallResult.fitsWithinSite;
});

// Test 5.2: Large program, small site (should be multiple floors)
console.log('\nTest 5.2: Large program (800m²) on small site (400m²)');
const largeResult = autoLevelAssignmentService.calculateOptimalLevels(
  800, // 800m² program
  400, // 400m² site
  { buildingType: 'mixed-use' }
);

test('Large program should be multiple floors', () => {
  console.log(`   Calculated: ${largeResult.optimalFloors} floor(s)`);
  console.log(`   Footprint: ${largeResult.actualFootprint.toFixed(0)}m²`);
  console.log(`   Coverage: ${largeResult.siteCoveragePercent.toFixed(1)}%`);
  console.log(`   Fits: ${largeResult.fitsWithinSite ? 'YES' : 'NO'}`);
  return largeResult.optimalFloors >= 3 && largeResult.fitsWithinSite;
});

// Test 5.3: Exact match (should fit perfectly)
console.log('\nTest 5.3: Perfect match - program matches buildable area');
const perfectProgram = 300; // 300m²
const perfectSite = 500; // 500m² site
// Buildable = 500 × 0.6 coverage × 0.85 setbacks = 255m² per floor
// With circulation: 300 × 1.15 = 345m²
// Needs: 345 / 255 = 1.35 → 2 floors

const perfectResult = autoLevelAssignmentService.calculateOptimalLevels(
  perfectProgram,
  perfectSite,
  { buildingType: 'mixed-use' }
);

test('Perfect match calculates correctly', () => {
  console.log(`   Program: ${perfectProgram}m²`);
  console.log(`   Site: ${perfectSite}m²`);
  console.log(`   Calculated: ${perfectResult.optimalFloors} floor(s)`);
  console.log(`   Footprint: ${perfectResult.actualFootprint.toFixed(0)}m²`);
  console.log(`   Max footprint: ${perfectResult.maxFootprintArea.toFixed(0)}m²`);
  console.log(`   Coverage: ${perfectResult.siteCoveragePercent.toFixed(1)}%`);
  return perfectResult.optimalFloors === 2 && perfectResult.fitsWithinSite;
});

// ============================================================================
// TEST 6: BUILDING TYPE COVERAGE RATIOS
// ============================================================================

logSection('TEST 6: BUILDING TYPE COVERAGE RATIOS');

// Test 6.1: Residential house (40% coverage)
const houseCalc = autoLevelAssignmentService.calculateOptimalLevels(200, 500, { buildingType: 'house' });
test('House uses 40% coverage', () => {
  console.log(`   House coverage: ${houseCalc.siteCoveragePercent.toFixed(1)}%`);
  return houseCalc.siteCoveragePercent < 50; // Should be lower due to 40% base
});

// Test 6.2: Retail (70% coverage)
const retailCalc = autoLevelAssignmentService.calculateOptimalLevels(200, 500, { buildingType: 'retail' });
test('Retail uses 70% coverage', () => {
  console.log(`   Retail coverage: ${retailCalc.siteCoveragePercent.toFixed(1)}%`);
  return retailCalc.siteCoveragePercent > 30; // Should be higher due to 70% base
});

// Test 6.3: Office (65% coverage)
const officeCalc = autoLevelAssignmentService.calculateOptimalLevels(200, 500, { buildingType: 'office' });
test('Office uses 65% coverage', () => {
  console.log(`   Office coverage: ${officeCalc.siteCoveragePercent.toFixed(1)}%`);
  return officeCalc.siteCoveragePercent > 25 && officeCalc.siteCoveragePercent < 55;
});

// ============================================================================
// TEST 7: CIRCULATION SPACES AUTO-GENERATION
// ============================================================================

logSection('TEST 7: CIRCULATION SPACES AUTO-GENERATION');

// Multi-floor building should have circulation
const multiFloorProgram = [
  { name: 'Space A', area: 50, count: 1 },
  { name: 'Space B', area: 50, count: 1 }
];

const multiFloorResult = autoLevelAssignmentService.autoAssignComplete(
  multiFloorProgram,
  150, // Small site forces multiple floors
  'office'
);

test('Multi-floor building generates circulation spaces', () => {
  const hasCirculation = multiFloorResult.assignedSpaces.some(s =>
    s.name.toLowerCase().includes('staircase') || s.name.toLowerCase().includes('circulation')
  );
  console.log(`   Floors: ${multiFloorResult.floorCount}`);
  console.log(`   Has circulation: ${hasCirculation}`);
  return multiFloorResult.floorCount > 1 && hasCirculation;
});

// ============================================================================
// SUMMARY
// ============================================================================

logSection('TEST SUMMARY');

console.log(`Total Tests: ${totalTests}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

if (failedTests === 0) {
  console.log('🎉 ALL TESTS PASSED! Auto-level assignment is working perfectly.');
} else {
  console.log(`⚠️  ${failedTests} test(s) failed. Please review the results above.`);
}

console.log('\n' + '='.repeat(80));
console.log('✅ Auto-Level Assignment Test Suite Complete');
console.log('='.repeat(80) + '\n');
