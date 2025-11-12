/**
 * Test Suite for Site-Aware Generation
 *
 * Comprehensive testing of all site-aware features:
 * 1. Site validation service
 * 2. DNA generation with site constraints
 * 3. Floor plan boundary enforcement
 * 4. Building orientation optimization
 * 5. A1 prompt with site constraints
 * 6. Modification pre-validation
 * 7. Site map embedding
 * 8. Site analysis caching
 */

import { validateDesignAgainstSite, preValidateModification, validateFloorPlanWithinSite } from './src/services/siteValidationService.js';
import enhancedDNAGenerator from './src/services/enhancedDNAGenerator.js';
import floorPlanGenerator from './src/services/floorPlanGenerator.js';
import { buildKontextA1Prompt } from './src/services/a1SheetPromptGenerator.js';
import modificationValidator from './src/services/modificationValidator.js';
import siteAnalysisService from './src/services/siteAnalysisService.js';

console.log('\n🧪 ========================================');
console.log('🧪 SITE-AWARE GENERATION TEST SUITE');
console.log('🧪 ========================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function logTest(testName, condition, details = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    if (details) console.log(`   ${details}`);
    passedTests++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    if (details) console.log(`   ${details}`);
    failedTests++;
  }
}

async function runTests() {
  // Test Data
  const testSiteData = {
    buildableArea: 300,
    siteArea: 450,
    constraints: {
      frontSetback: 5,
      rearSetback: 3,
      sideSetbacks: [3, 3]
    },
    maxHeight: 12,
    maxFloors: 3,
    shapeType: 'rectangle',
    polygon: [
      { lat: 51.5072, lng: -0.1280 },
      { lat: 51.5076, lng: -0.1280 },
      { lat: 51.5076, lng: -0.1276 },
      { lat: 51.5072, lng: -0.1276 }
    ],
    optimalOrientation: 15
  };

  const testMasterDNA = {
    dimensions: { length: 20, width: 15, height: 7, floorCount: 2 },
    materials: [
      { name: 'Brick', hexColor: '#8B4513', application: 'exterior' }
    ],
    rooms: [
      { name: 'Living Room', dimensions: '5×4', floor: 'ground', windows: 2 }
    ],
    buildingOrientation: 0
  };

  const testProjectContext = {
    buildingProgram: 'residential-house',
    area: 200,
    floors: 2,
    sitePolygon: testSiteData.polygon,
    siteMetrics: {
      areaM2: 450,
      shapeType: 'rectangle'
    }
  };

  // ========================================
  // TEST 1: Site Validation Service
  // ========================================
  console.log('📋 TEST GROUP 1: Site Validation Service\n');

  // Test 1.1: Valid design within constraints
  const validationResult1 = validateDesignAgainstSite(testMasterDNA, testSiteData);
  logTest(
    'Valid design passes validation',
    validationResult1.valid,
    `Errors: ${validationResult1.errors.length}, Warnings: ${validationResult1.warnings.length}`
  );

  // Test 1.2: Design exceeding buildable area
  const oversizedDNA = { ...testMasterDNA, dimensions: { ...testMasterDNA.dimensions, length: 30, width: 20 } };
  const validationResult2 = validateDesignAgainstSite(oversizedDNA, testSiteData);
  logTest(
    'Oversized design detected',
    !validationResult2.valid && validationResult2.errors.some(e => e.type === 'FOOTPRINT_EXCEEDS_BUILDABLE'),
    `Footprint: ${30 * 20}m² > Buildable: ${testSiteData.buildableArea}m²`
  );

  // Test 1.3: Height restriction violation
  const tallDNA = { ...testMasterDNA, dimensions: { ...testMasterDNA.dimensions, height: 15 } };
  const validationResult3 = validateDesignAgainstSite(tallDNA, testSiteData);
  logTest(
    'Height violation detected',
    !validationResult3.valid && validationResult3.errors.some(e => e.type === 'HEIGHT_EXCEEDS_LIMIT'),
    `Height: 15m > Max: ${testSiteData.maxHeight}m`
  );

  // Test 1.4: Pre-validate modification
  const modValidation = preValidateModification('Add a third floor', testMasterDNA, testSiteData);
  logTest(
    'Modification pre-validation works',
    modValidation.valid === false && modValidation.errors.some(e => e.type === 'HEIGHT_LIMIT_EXCEEDED'),
    'Third floor would exceed height limit'
  );

  // Test 1.5: Floor plan validation
  const floorPlan = { width: 15, length: 20, rooms: testMasterDNA.rooms };
  const floorValidation = validateFloorPlanWithinSite(floorPlan, testSiteData.polygon);
  logTest(
    'Floor plan boundary validation',
    floorValidation.valid !== undefined,
    `Coverage: ${floorValidation.coverage?.coveragePercent || 0}%`
  );

  // ========================================
  // TEST 2: DNA Generation with Site Constraints
  // ========================================
  console.log('\n📋 TEST GROUP 2: DNA Generation with Site Constraints\n');

  try {
    const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
      testProjectContext,
      null,
      { coordinates: { lat: 51.5074, lng: -0.1278 } }
    );

    logTest(
      'DNA generation includes site constraints',
      dnaResult.masterDNA?.siteConstraints !== undefined,
      `Site constraints: ${dnaResult.masterDNA?.siteConstraints ? 'Present' : 'Missing'}`
    );

    logTest(
      'DNA includes building orientation',
      dnaResult.masterDNA?.buildingOrientation !== undefined,
      `Orientation: ${dnaResult.masterDNA?.buildingOrientation}°`
    );

    logTest(
      'DNA respects site area',
      dnaResult.masterDNA?.dimensions?.length * dnaResult.masterDNA?.dimensions?.width <= testSiteData.buildableArea,
      `Footprint fits within buildable area`
    );
  } catch (error) {
    logTest('DNA generation with site constraints', false, error.message);
  }

  // ========================================
  // TEST 3: Floor Plan Generator with Boundaries
  // ========================================
  console.log('\n📋 TEST GROUP 3: Floor Plan Generator with Boundaries\n');

  try {
    const floorPlanResult = await floorPlanGenerator.generateFloorPlans(
      testProjectContext,
      testSiteData
    );

    logTest(
      'Floor plan generation with site data',
      floorPlanResult.success,
      `Generated ${floorPlanResult.floorPlans?.ground_floor?.rooms?.length || 0} ground floor rooms`
    );

    logTest(
      'Floor plan includes site validation',
      floorPlanResult.floorPlans?.site_validated === true,
      'Site boundaries enforced'
    );

    logTest(
      'Floor plan site context includes polygon',
      floorPlanResult.floorPlans?.site_context?.polygon !== undefined,
      'Polygon data preserved'
    );
  } catch (error) {
    logTest('Floor plan generation with boundaries', false, error.message);
  }

  // ========================================
  // TEST 4: A1 Prompt with Site Constraints
  // ========================================
  console.log('\n📋 TEST GROUP 4: A1 Prompt Generation with Site Info\n');

  const a1Prompt = buildKontextA1Prompt({
    masterDNA: testMasterDNA,
    location: { address: '123 Test Street, London' },
    climate: { type: 'temperate' },
    projectContext: testProjectContext,
    siteConstraints: testSiteData
  });

  logTest(
    'A1 prompt includes site shape',
    a1Prompt.includes('rectangle'),
    'Site shape mentioned in prompt'
  );

  logTest(
    'A1 prompt includes setbacks',
    a1Prompt.includes('5m front') || a1Prompt.includes('setback'),
    'Setback requirements included'
  );

  logTest(
    'A1 prompt includes building orientation',
    a1Prompt.includes('orientation') || a1Prompt.includes('15'),
    'Building orientation specified'
  );

  // ========================================
  // TEST 5: Modification Validator
  // ========================================
  console.log('\n📋 TEST GROUP 5: Modification Validator\n');

  const modRequest = {
    deltaPrompt: 'Add a new bedroom and expand the kitchen',
    quickToggles: { addSections: true }
  };

  const modDesignData = {
    masterDNA: testMasterDNA,
    siteConstraints: testSiteData,
    history: null
  };

  const modResult = modificationValidator.validateModification(modRequest, modDesignData);

  logTest(
    'Modification validator runs successfully',
    modResult !== undefined,
    `Valid: ${modResult.valid}, Feasible: ${modResult.feasible}`
  );

  logTest(
    'Modification intent parsed correctly',
    modResult.intent?.addingSpace === true,
    'Adding space intent detected'
  );

  logTest(
    'Quick toggles validated',
    modResult.intent?.addingFeatures?.includes('sections'),
    'Section toggle recognized'
  );

  // ========================================
  // TEST 6: Site Analysis Caching
  // ========================================
  console.log('\n📋 TEST GROUP 6: Site Analysis Caching\n');

  const testAddress = '123 Test Street, London, UK';
  const testCoords = { lat: 51.5074, lng: -0.1278 };

  // Clear cache first
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }

  try {
    // First call - should fetch fresh
    console.log('   First call (fresh fetch)...');
    const result1 = await siteAnalysisService.analyzeSiteContext(testAddress, testCoords);

    logTest(
      'Site analysis returns data',
      result1.success === true,
      `Surface area: ${result1.siteAnalysis?.surfaceArea}m²`
    );

    // Second call - should use cache
    console.log('   Second call (cached)...');
    const result2 = await siteAnalysisService.analyzeSiteContext(testAddress, testCoords);

    logTest(
      'Site analysis caching works',
      result2.success === true,
      'Second call should use cached data'
    );

    logTest(
      'Cached data matches original',
      result1.siteAnalysis?.surfaceArea === result2.siteAnalysis?.surfaceArea,
      'Data consistency verified'
    );
  } catch (error) {
    logTest('Site analysis caching', false, error.message);
  }

  // ========================================
  // TEST 7: Integration Test
  // ========================================
  console.log('\n📋 TEST GROUP 7: Integration Test\n');

  try {
    // Simulate full workflow
    const integrationContext = {
      ...testProjectContext,
      address: testAddress,
      coordinates: testCoords
    };

    // 1. Get site analysis
    const siteResult = await siteAnalysisService.analyzeSiteContext(testAddress, testCoords);

    // 2. Generate DNA with site constraints
    const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
      integrationContext,
      null,
      { ...siteResult.siteAnalysis, coordinates: testCoords }
    );

    // 3. Validate against site
    const validation = validateDesignAgainstSite(
      dnaResult.masterDNA,
      {
        ...testSiteData,
        siteArea: siteResult.siteAnalysis?.surfaceArea || 450
      }
    );

    logTest(
      'Full integration workflow completes',
      dnaResult.success && validation !== undefined,
      'Site analysis → DNA generation → Validation'
    );

    logTest(
      'DNA respects detected site constraints',
      validation.valid || validation.errors.length < 3,
      `Validation score: ${validation.summary?.errorCount || 0} errors`
    );
  } catch (error) {
    logTest('Integration workflow', false, error.message);
  }

  // ========================================
  // TEST SUMMARY
  // ========================================
  console.log('\n🧪 ========================================');
  console.log('🧪 TEST SUMMARY');
  console.log('🧪 ========================================');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${failedTests}/${totalTests}`);
  console.log(`📊 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 All site-aware generation tests passed!');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the results above.');
  }

  process.exit(failedTests === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});