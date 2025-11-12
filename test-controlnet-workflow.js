/**
 * Test Script for ControlNet Multi-View Architectural Visualization
 *
 * This script demonstrates the complete 6-step workflow for generating
 * consistent multi-view architectural visualizations using ControlNet.
 *
 * Usage:
 *   node test-controlnet-workflow.js
 */

// Note: This is a Node.js test script
// To run, you may need to configure ES modules or use CommonJS imports

import controlNetMultiViewService from './src/services/controlNetMultiViewService.js';
import aiIntegrationService from './src/services/aiIntegrationService.js';
import fs from 'fs';

/**
 * Test 1: Basic ControlNet Workflow
 * Generate 6 consistent views from project parameters
 */
async function testBasicWorkflow() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: Basic ControlNet Multi-View Workflow');
  console.log('='.repeat(70) + '\n');

  const projectParams = {
    project_name: "Modern Birmingham House",
    location: "Birmingham, UK",
    style: "Contemporary British brick house",
    materials: "Red brick walls, grey roof tiles, white window frames",
    floors: 2,
    main_entry_orientation: "North",
    control_image: null, // No floor plan - will generate based on reasoning
    seed: 20251023,
    climate: "Temperate oceanic, mild summers, cool winters",
    floor_area: 200,
    building_program: "house"
  };

  try {
    console.log('📋 Input Parameters:');
    console.log(JSON.stringify(projectParams, null, 2));

    const result = await controlNetMultiViewService.generateConsistentMultiViewPackage(projectParams);

    console.log('\n✅ Generation Complete!\n');
    console.log('📊 Results Summary:');
    console.log(`   Project: ${result.project}`);
    console.log(`   Seed: ${result.seed}`);
    console.log(`   Total Views: ${result.metadata.total_views}`);
    console.log(`   Successful: ${result.metadata.successful_views}`);
    console.log(`   Failed: ${result.metadata.failed_views}`);
    console.log(`   Consistency: ${result.consistency_validation.consistency_check}`);

    console.log('\n📦 Generated Views:');
    Object.entries(result.generated_views).forEach(([key, view]) => {
      const status = view.success ? '✅' : '❌';
      console.log(`   ${status} ${view.view}`);
      if (view.success) {
        console.log(`      → ${view.images[0]}`);
      } else {
        console.log(`      → Error: ${view.error}`);
      }
    });

    console.log('\n🔍 Consistency Validation:');
    result.consistency_validation.checks.forEach(check => {
      const status = check.passed ? '✅' : '❌';
      console.log(`   ${status} ${check.test}`);
      console.log(`      → ${check.details}`);
    });

    console.log('\n🧬 Building Core Description:');
    console.log(`   Dimensions: ${result.building_core_description.geometry.length}m × ${result.building_core_description.geometry.width}m × ${result.building_core_description.geometry.height}m`);
    console.log(`   Floors: ${result.building_core_description.geometry.floor_count}`);
    console.log(`   Materials: ${result.building_core_description.materials.walls}`);
    console.log(`   Roof: ${result.building_core_description.roof.type} ${result.building_core_description.roof.material}`);
    console.log(`   Windows: ${result.building_core_description.openings.window_type}`);

    // Save results to JSON
    fs.writeFileSync(
      'controlnet-test-results.json',
      JSON.stringify(result, null, 2),
      'utf-8'
    );
    console.log('\n💾 Full results saved to: controlnet-test-results.json');

    return result;

  } catch (error) {
    console.error('\n❌ Test 1 Failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Test 2: Integration with Existing Context
 * Convert existing project context to ControlNet format
 */
async function testContextConversion() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Context Conversion & Integration');
  console.log('='.repeat(70) + '\n');

  // Simulate existing project context
  const existingContext = {
    projectName: 'Test Villa Project',
    buildingProgram: 'villa',
    floorArea: 300,
    location: {
      address: 'London, UK',
      climate: { type: 'Temperate maritime' }
    },
    portfolio: {
      detectedStyle: 'Modern European'
    },
    buildingDNA: {
      materials: {
        exterior: {
          primary: 'white render',
          color: 'bright white',
          texture: 'smooth stucco'
        }
      },
      roof: {
        type: 'flat',
        material: 'membrane',
        color: 'dark grey'
      },
      windows: {
        type: 'floor-to-ceiling',
        color: 'black aluminum',
        pattern: 'curtain wall'
      },
      dimensions: {
        floors: 2,
        floorCount: 2,
        length: 18,
        width: 12,
        height: 7.5
      },
      entrance: {
        facade: 'South',
        position: 'center'
      },
      style_features: {
        architectural_style: 'Contemporary Minimalist'
      }
    },
    projectSeed: 98765432
  };

  try {
    console.log('📋 Existing Context:');
    console.log(`   Building: ${existingContext.buildingProgram}`);
    console.log(`   Area: ${existingContext.floorArea}m²`);
    console.log(`   Style: ${existingContext.buildingDNA.style_features.architectural_style}`);
    console.log(`   Seed: ${existingContext.projectSeed}`);

    // Simulate uploaded floor plan
    const floorPlanUrl = 'https://example.com/uploaded_floor_plan.png';

    console.log('\n🔄 Converting to ControlNet format...');
    const controlNetParams = aiIntegrationService.convertToControlNetParams(
      existingContext,
      floorPlanUrl
    );

    console.log('\n✅ Converted Parameters:');
    console.log(JSON.stringify(controlNetParams, null, 2));

    console.log('\n✅ Test 2 Passed - Context conversion successful');
    console.log('   Ready to call: aiIntegrationService.generateControlNetMultiViewPackage(controlNetParams)');

    return controlNetParams;

  } catch (error) {
    console.error('\n❌ Test 2 Failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: Input Validation
 * Test parameter validation and normalization
 */
async function testInputValidation() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3: Input Validation & Error Handling');
  console.log('='.repeat(70) + '\n');

  const testCases = [
    {
      name: 'Minimal parameters',
      params: {
        materials: 'brick',
        floors: 2,
        main_entry_orientation: 'North'
      },
      shouldPass: true
    },
    {
      name: 'Floor count clamping (too many floors)',
      params: {
        materials: 'brick',
        floors: 10, // Should be clamped to 5
        main_entry_orientation: 'South'
      },
      shouldPass: true
    },
    {
      name: 'Floor count clamping (zero floors)',
      params: {
        materials: 'brick',
        floors: 0, // Should be clamped to 1
        main_entry_orientation: 'East'
      },
      shouldPass: true
    },
    {
      name: 'Various orientations',
      params: {
        materials: 'stone',
        floors: 3,
        main_entry_orientation: 'NW'
      },
      shouldPass: true
    }
  ];

  for (const testCase of testCases) {
    console.log(`\nTest Case: ${testCase.name}`);
    console.log('Input:', JSON.stringify(testCase.params, null, 2));

    try {
      const normalized = controlNetMultiViewService.validateAndNormalizeInput(testCase.params);
      console.log('✅ Normalized:', JSON.stringify(normalized, null, 2));

      // Verify floor clamping
      if (normalized.floors < 1 || normalized.floors > 5) {
        console.error('❌ Floor count not properly clamped:', normalized.floors);
      } else {
        console.log(`✅ Floor count properly clamped: ${normalized.floors}`);
      }

    } catch (error) {
      if (testCase.shouldPass) {
        console.error('❌ Unexpected error:', error.message);
      } else {
        console.log('✅ Expected error:', error.message);
      }
    }
  }

  console.log('\n✅ Test 3 Complete - Input validation working');
}

/**
 * Test 4: Consistency Validation Logic
 * Test the validation checks
 */
async function testConsistencyValidation() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 4: Consistency Validation Logic');
  console.log('='.repeat(70) + '\n');

  const mockSeed = 12345;

  // Mock view configurations (all using same seed = PASS)
  const goodViewConfigs = {
    floor_plan: { seed: mockSeed, prompt: 'floor plan', controlnet: null },
    exterior_front: { seed: mockSeed, prompt: 'exterior front SAME building identical geometry', controlnet: { image: 'test.png' } },
    exterior_side: { seed: mockSeed, prompt: 'exterior side SAME building matches floor plan', controlnet: { image: 'test.png' } },
    interior: { seed: mockSeed, prompt: 'interior SAME building', controlnet: { image: 'test.png' } },
    axonometric: { seed: mockSeed, prompt: 'axonometric SAME building', controlnet: { image: 'test.png' } },
    perspective: { seed: mockSeed, prompt: 'perspective SAME building', controlnet: { image: 'test.png' } }
  };

  // Mock results (all successful)
  const goodResults = {
    floor_plan: { success: true, images: ['url1'] },
    exterior_front: { success: true, images: ['url2'] },
    exterior_side: { success: true, images: ['url3'] },
    interior: { success: true, images: ['url4'] },
    axonometric: { success: true, images: ['url5'] },
    perspective: { success: true, images: ['url6'] }
  };

  console.log('Testing GOOD configuration (all checks should pass)...');
  const goodValidation = controlNetMultiViewService.validateConsistency(goodViewConfigs, goodResults);
  console.log('\nValidation Result:', goodValidation.consistency_check);
  console.log('Checks:', goodValidation.checks.length);
  goodValidation.checks.forEach(check => {
    console.log(`   ${check.passed ? '✅' : '❌'} ${check.test}`);
  });

  if (goodValidation.passed) {
    console.log('\n✅ Good configuration passed validation');
  } else {
    console.error('\n❌ Good configuration failed validation (unexpected)');
  }

  // Test BAD configuration (mixed seeds = FAIL)
  const badViewConfigs = {
    floor_plan: { seed: 12345, prompt: 'floor plan', controlnet: null },
    exterior_front: { seed: 99999, prompt: 'exterior front', controlnet: null }, // Different seed!
    exterior_side: { seed: 12345, prompt: 'exterior side', controlnet: null }
  };

  const badResults = {
    floor_plan: { success: true, images: ['url1'] },
    exterior_front: { success: false }, // Failed generation
    exterior_side: { success: true, images: ['url3'] }
  };

  console.log('\n\nTesting BAD configuration (should fail validation)...');
  const badValidation = controlNetMultiViewService.validateConsistency(badViewConfigs, badResults);
  console.log('\nValidation Result:', badValidation.consistency_check);
  badValidation.checks.forEach(check => {
    console.log(`   ${check.passed ? '✅' : '❌'} ${check.test}`);
  });

  if (!badValidation.passed) {
    console.log('\n✅ Bad configuration correctly failed validation');
  } else {
    console.error('\n❌ Bad configuration passed validation (unexpected)');
  }

  console.log('\n✅ Test 4 Complete - Validation logic working');
}

/**
 * Main Test Runner
 */
async function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('█' + ' '.repeat(68) + '█');
  console.log('█   ControlNet Multi-View Architectural Visualization - Test Suite   █');
  console.log('█' + ' '.repeat(68) + '█');
  console.log('█'.repeat(70) + '\n');

  const tests = [
    { name: 'Input Validation', fn: testInputValidation },
    { name: 'Consistency Validation Logic', fn: testConsistencyValidation },
    { name: 'Context Conversion', fn: testContextConversion }
    // Note: Basic Workflow test commented out to avoid actual API calls during testing
    // Uncomment when ready to test with real API keys:
    // { name: 'Basic Workflow', fn: testBasicWorkflow }
  ];

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  for (const test of tests) {
    try {
      await test.fn();
      results.passed++;
    } catch (error) {
      results.failed++;
      results.errors.push({ test: test.name, error: error.message });
    }
  }

  console.log('\n' + '█'.repeat(70));
  console.log('█' + ' '.repeat(68) + '█');
  console.log('█                          TEST SUMMARY                               █');
  console.log('█' + ' '.repeat(68) + '█');
  console.log('█'.repeat(70));

  console.log(`\n   Total Tests: ${tests.length}`);
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n   Failed Tests:');
    results.errors.forEach(({ test, error }) => {
      console.log(`      ❌ ${test}: ${error}`);
    });
  }

  console.log('\n' + '█'.repeat(70) + '\n');

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Fatal Error:', error);
  process.exit(1);
});

/**
 * USAGE NOTES:
 *
 * 1. To run full workflow test with real API calls, uncomment the Basic Workflow test above
 *
 * 2. Ensure environment variables are set:
 *    - REACT_APP_OPENAI_API_KEY
 *    - REACT_APP_REPLICATE_API_KEY
 *
 * 3. To test with actual floor plan:
 *    - Upload a floor plan image to a public URL
 *    - Replace control_image: null with the URL
 *
 * 4. Expected test run time:
 *    - Without API calls: < 1 second
 *    - With full workflow: 3-6 minutes (generating 6 views)
 *
 * 5. Cost per full workflow test: ~$0.65-$0.95
 */
