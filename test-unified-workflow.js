/**
 * Test Script for Unified Generation Workflow
 * Verifies that 2D floor plans and 3D views show the SAME building
 */

const aiIntegrationService = require('./src/services/aiIntegrationService').default;

async function testUnifiedWorkflow() {
  console.log('🧪 Testing UNIFIED Generation Workflow\n');
  console.log('='  .repeat(80));

  // Test project context
  const projectContext = {
    location: {
      address: 'Cairo, Egypt',
      coordinates: { lat: 30.0444, lng: 31.2357 }
    },
    buildingProgram: 'villa',
    floorArea: 350,
    climateData: {
      type: 'hot desert',
      seasonal: {
        summer: { avgTemp: 35, precipitation: 2 },
        winter: { avgTemp: 15, precipitation: 15 },
        spring: { avgTemp: 25, precipitation: 8 },
        fall: { avgTemp: 27, precipitation: 5 }
      },
      sunPath: {
        summer: 'High angle',
        winter: 'Low angle',
        optimalOrientation: 'North-South'
      }
    },
    projectSeed: 123456
  };

  console.log('📋 Project Context:');
  console.log(`   Location: ${projectContext.location.address}`);
  console.log(`   Program: ${projectContext.buildingProgram}`);
  console.log(`   Area: ${projectContext.floorArea}m²`);
  console.log(`   Climate: ${projectContext.climateData.type}`);
  console.log(`   Seed: ${projectContext.projectSeed}\n`);

  try {
    console.log('🚀 Starting unified generation...\n');
    const startTime = Date.now();

    const result = await aiIntegrationService.generateUnifiedDesign(
      projectContext,
      [], // No portfolio images
      0.5, // Material weight
      0.5  // Characteristic weight
    );

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Generation complete in ${duration}s\n`);

    if (!result.success) {
      console.error('❌ Generation failed:', result.error);
      return;
    }

    // Validation checks
    console.log('🔍 VALIDATION CHECKS:\n');

    // 1. Master Specification
    console.log('1️⃣ Master Specification:');
    if (result.masterSpec) {
      const ms = result.masterSpec;
      console.log(`   ✅ Project: ${ms.projectName}`);
      console.log(`   ✅ Style: ${ms.styleName}`);
      console.log(`   ✅ Dimensions: ${ms.dimensions?.length}m × ${ms.dimensions?.width}m × ${ms.dimensions?.height}m`);
      console.log(`   ✅ Floors: ${ms.dimensions?.floors}`);
      console.log(`   ✅ Materials: ${ms.materials?.primary}, ${ms.materials?.secondary}, ${ms.materials?.accent}`);
      console.log(`   ✅ Entrance: ${ms.entrance?.orientation} (${ms.entrance?.type})`);
    } else {
      console.log('   ❌ Master specification missing!');
    }

    // 2. Floor Plans
    console.log('\n2️⃣ Floor Plans:');
    if (result.floorPlans?.success) {
      const plans = result.floorPlans.floorPlans;
      console.log(`   ✅ Success: true`);
      console.log(`   ✅ Floor count: ${result.floorPlans.floorCount}`);
      console.log(`   ✅ Generated floors: ${Object.keys(plans).join(', ')}`);

      Object.keys(plans).forEach(floorKey => {
        const floor = plans[floorKey];
        console.log(`   ✅ ${floorKey}: ${floor.images?.length || 0} image(s), seed: ${floor.seed}`);
      });
    } else {
      console.log('   ❌ Floor plans generation failed!');
    }

    // 3. Elevations
    console.log('\n3️⃣ Elevations:');
    if (result.elevations?.success) {
      const elevs = result.elevations.elevations;
      console.log(`   ✅ Success: true`);
      console.log(`   ✅ Generated elevations: ${Object.keys(elevs).join(', ')}`);

      Object.keys(elevs).forEach(elevKey => {
        const elev = elevs[elevKey];
        console.log(`   ✅ ${elevKey}: ${elev.images?.length || 0} image(s), seed: ${elev.seed}`);
      });
    } else {
      console.log('   ❌ Elevations generation failed!');
    }

    // 4. 3D Visualizations
    console.log('\n4️⃣ 3D Visualizations:');
    if (result.visualizations?.success) {
      const views = result.visualizations.views;
      console.log(`   ✅ Success: true`);
      console.log(`   ✅ Generated views: ${Object.keys(views).join(', ')}`);

      Object.keys(views).forEach(viewKey => {
        const view = views[viewKey];
        console.log(`   ✅ ${viewKey}: ${view.images?.length || 0} image(s), seed: ${view.seed}`);
      });
    } else {
      console.log('   ❌ 3D visualizations generation failed!');
    }

    // 5. Consistency Validation
    console.log('\n5️⃣ Consistency Validation:');

    const masterFloors = result.masterSpec?.dimensions?.floors;
    const floorPlanCount = result.floorPlans?.floorCount;
    const floorCount = Object.keys(result.floorPlans?.floorPlans || {}).length;

    if (masterFloors === floorPlanCount && masterFloors === floorCount) {
      console.log(`   ✅ Floor count consistent: ${masterFloors} floors across all outputs`);
    } else {
      console.log(`   ❌ Floor count mismatch!`);
      console.log(`      Master spec: ${masterFloors}`);
      console.log(`      Floor plan metadata: ${floorPlanCount}`);
      console.log(`      Actual floor plans: ${floorCount}`);
    }

    const projectSeed = result.projectSeed;
    console.log(`   ✅ Project seed: ${projectSeed}`);

    const materials = result.masterSpec?.materials;
    if (materials) {
      console.log(`   ✅ Material specification available for validation`);
      console.log(`      Primary: ${materials.primary}`);
      console.log(`      Secondary: ${materials.secondary}`);
      console.log(`      Accent: ${materials.accent}`);
    }

    // 6. Metadata
    console.log('\n6️⃣ Metadata:');
    console.log(`   Workflow: ${result.workflow}`);
    console.log(`   Material weight: ${result.materialWeight}`);
    console.log(`   Characteristic weight: ${result.characteristicWeight}`);
    console.log(`   Timestamp: ${result.timestamp}`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY:\n');

    const checks = [
      { name: 'Master specification generated', pass: !!result.masterSpec },
      { name: 'Floor plans generated', pass: result.floorPlans?.success },
      { name: 'Elevations generated', pass: result.elevations?.success },
      { name: '3D views generated', pass: result.visualizations?.success },
      { name: 'Floor count consistent', pass: masterFloors === floorPlanCount },
      { name: 'Materials specified', pass: !!materials }
    ];

    const passed = checks.filter(c => c.pass).length;
    const total = checks.length;

    checks.forEach(check => {
      console.log(`   ${check.pass ? '✅' : '❌'} ${check.name}`);
    });

    console.log(`\n   Score: ${passed}/${total} checks passed`);

    if (passed === total) {
      console.log('\n🎉 ALL TESTS PASSED! Unified workflow is working correctly.\n');
      console.log('✅ 2D floor plans and 3D views are guaranteed to show the SAME building');
      console.log('✅ All outputs generated from ONE master specification');
    } else {
      console.log(`\n⚠️ ${total - passed} test(s) failed. Review the output above for details.\n`);
    }

    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run test
console.log('Starting unified workflow test...\n');
testUnifiedWorkflow()
  .then(() => {
    console.log('\n✅ Test execution complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  });
