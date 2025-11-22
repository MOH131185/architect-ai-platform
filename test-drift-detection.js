/**
 * Drift Detection Tests
 * 
 * Tests DNA-level and image-level drift detection.
 * Run with: node test-drift-detection.js
 */

const { detectDNADrift, DRIFT_THRESHOLDS } = require('./src/services/driftValidator');
const { mockDNA } = require('./__mocks__/fixtures');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🧪 Testing Drift Detection\n');
  console.log('='.repeat(60));

  // Test 1: No drift for identical DNA
  console.log('\n📋 Test 1: No drift for identical DNA');
  const noDrift = detectDNADrift(mockDNA, mockDNA);
  assert(noDrift.driftScore === 0, 'Identical DNA has zero drift');
  assert(!noDrift.hasDrift, 'Identical DNA has no drift flag');
  assert(noDrift.errors.length === 0, 'Identical DNA has no errors');

  // Test 2: Dimension drift detection
  console.log('\n📋 Test 2: Dimension drift detection');
  const modifiedDNA = {
    ...mockDNA,
    dimensions: {
      ...mockDNA.dimensions,
      length: 20.0 // Changed from 15.25
    }
  };
  
  const dimDrift = detectDNADrift(mockDNA, modifiedDNA);
  assert(dimDrift.driftScore > 0, 'Modified dimensions cause drift');
  assert(dimDrift.hasDrift, 'Drift flag is set for modified dimensions');
  assert(dimDrift.errors.length > 0, 'Dimension drift produces errors');

  // Test 3: Material drift detection
  console.log('\n📋 Test 3: Material drift detection');
  const modifiedMaterials = {
    ...mockDNA,
    materials: [
      { name: 'Concrete', hexColor: '#CCCCCC', application: 'exterior walls' } // Different material
    ]
  };
  
  const matDrift = detectDNADrift(mockDNA, modifiedMaterials);
  assert(matDrift.driftScore > 0, 'Modified materials cause drift');
  assert(matDrift.hasDrift, 'Drift flag is set for modified materials');

  // Test 4: Style change detection
  console.log('\n📋 Test 4: Style change detection');
  const modifiedStyle = {
    ...mockDNA,
    architecturalStyle: 'Victorian' // Changed from Contemporary
  };
  
  const styleDrift = detectDNADrift(mockDNA, modifiedStyle);
  assert(styleDrift.driftScore > 0, 'Modified style causes drift');
  assert(styleDrift.errors.some(e => e.includes('Style changed')), 'Style change is reported');

  // Test 5: Project type change detection
  console.log('\n📋 Test 5: Project type change detection');
  const modifiedType = {
    ...mockDNA,
    projectType: 'clinic' // Changed from residential
  };
  
  const typeDrift = detectDNADrift(mockDNA, modifiedType);
  assert(typeDrift.driftScore > 0, 'Modified project type causes drift');
  assert(typeDrift.errors.some(e => e.includes('Project type changed')), 'Type change is reported');

  // Test 6: Multiple changes compound drift
  console.log('\n📋 Test 6: Multiple changes compound drift');
  const multipleChanges = {
    ...mockDNA,
    dimensions: { ...mockDNA.dimensions, length: 20.0 },
    architecturalStyle: 'Victorian',
    projectType: 'clinic'
  };
  
  const multiDrift = detectDNADrift(mockDNA, multipleChanges);
  assert(multiDrift.driftScore > dimDrift.driftScore, 'Multiple changes increase drift score');
  assert(multiDrift.errors.length >= 3, 'Multiple changes produce multiple errors');

  // Test 7: Drift threshold enforcement
  console.log('\n📋 Test 7: Drift threshold enforcement');
  assert(DRIFT_THRESHOLDS.DNA.OVERALL === 0.10, 'Overall DNA threshold is 10%');
  
  const minorChange = {
    ...mockDNA,
    dimensions: { ...mockDNA.dimensions, length: 15.50 } // Minor change (1.6% drift)
  };
  
  const minorDrift = detectDNADrift(mockDNA, minorChange);
  assert(minorDrift.driftScore < DRIFT_THRESHOLDS.DNA.OVERALL, 'Minor changes below threshold');
  assert(!minorDrift.hasDrift, 'Minor changes do not trigger drift flag');

  // Test 8: Drift correction suggestions
  console.log('\n📋 Test 8: Drift correction suggestions');
  const { suggestDriftCorrections } = require('./src/services/driftValidator');
  
  const corrections = suggestDriftCorrections(dimDrift);
  assert(corrections.corrections.length > 0, 'Corrections are suggested for drift');
  assert(corrections.canAutoCorrect !== undefined, 'Auto-correct flag is set');

  // Test 9: Floor count change
  console.log('\n📋 Test 9: Floor count change');
  const modifiedFloors = {
    ...mockDNA,
    dimensions: { ...mockDNA.dimensions, floors: 3 } // Changed from 2
  };
  
  const floorDrift = detectDNADrift(mockDNA, modifiedFloors);
  assert(floorDrift.errors.some(e => e.includes('Floor count changed')), 'Floor count change is detected');

  // Test 10: Material color change
  console.log('\n📋 Test 10: Material color change');
  const modifiedColors = {
    ...mockDNA,
    materials: [
      { name: 'Red brick', hexColor: '#FF0000', application: 'exterior walls' }, // Different color
      ...mockDNA.materials.slice(1)
    ]
  };
  
  const colorDrift = detectDNADrift(mockDNA, modifiedColors);
  assert(colorDrift.driftScore > 0, 'Material color changes cause drift');

  // Results
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All drift detection tests passed!\n');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite error:', error);
  process.exit(1);
});

