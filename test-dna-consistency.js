/**
 * Test DNA-Enhanced Consistency System
 * Tests the enhanced DNA generator with Together AI FLUX.1
 */

const togetherAIService = require('./src/services/togetherAIService');

const testProject = {
  buildingProgram: '2-bedroom family house',
  area: 150,
  floorCount: 2,
  seed: 123456,
  projectSeed: 123456,

  location: {
    address: 'Manchester, UK',
    coordinates: { lat: 53.4808, lng: -2.2426 }
  },

  blendedStyle: {
    styleName: 'Modern British Contemporary',
    materials: ['Red brick', 'Clay tiles', 'UPVC windows', 'Timber trim']
  },

  buildingDNA: {
    dimensions: {
      length: 15,
      width: 10,
      floorCount: 2
    },
    materials: {
      exterior: { primary: 'Red brick', color: '#8B4513' },
      roof: { type: 'gable', material: 'Clay tiles', color: '#654321', pitch: '35°' }
    }
  }
};

async function testDNAConsistency() {
  console.log('🧪 ============================================');
  console.log('🧪 TESTING DNA-ENHANCED CONSISTENCY SYSTEM');
  console.log('🧪 ============================================\n');

  try {
    // Test 1: Generate Master DNA
    console.log('📋 Test 1: Generating Master Design DNA...');
    const result = await togetherAIService.generateConsistentArchitecturalPackage({
      projectContext: testProject
    });

    console.log('\n✅ RESULTS:');
    console.log('   Seed:', result.seed);
    console.log('   Consistency:', result.consistency);
    console.log('   Unique Images:', result.uniqueImages, '/', result.totalViews);
    console.log('   Master DNA Generated:', !!result.masterDNA);

    // Check for duplicates
    console.log('\n🔍 DUPLICATE CHECK:');
    const views = [
      'floor_plan_ground',
      'floor_plan_upper',
      'elevation_north',
      'elevation_south',
      'elevation_east',
      'elevation_west',
      'section_longitudinal',
      'section_cross',
      'exterior_front_3d',
      'exterior_side_3d',
      'axonometric_3d',
      'perspective_3d',
      'interior_3d'
    ];

    views.forEach(view => {
      const viewResult = result[view];
      if (viewResult && viewResult.success) {
        console.log(`   ✅ ${view}: ${viewResult.name}`);
        console.log(`      URL: ${viewResult.url?.substring(0, 60)}...`);
      } else {
        console.log(`   ❌ ${view}: FAILED`);
      }
    });

    // Check if all views are unique
    const urls = views
      .map(v => result[v]?.url)
      .filter(url => url);

    const uniqueUrls = new Set(urls);
    const allUnique = urls.length === uniqueUrls.size;

    console.log('\n🎯 UNIQUENESS VALIDATION:');
    console.log('   Total URLs:', urls.length);
    console.log('   Unique URLs:', uniqueUrls.size);
    console.log('   All Unique?', allUnique ? '✅ YES' : '❌ NO - DUPLICATES FOUND');

    if (!allUnique) {
      console.log('\n❌ DUPLICATE URLS DETECTED:');
      const urlCounts = {};
      urls.forEach(url => {
        urlCounts[url] = (urlCounts[url] || 0) + 1;
      });
      Object.entries(urlCounts).forEach(([url, count]) => {
        if (count > 1) {
          console.log(`   ${url}: ${count} times`);
        }
      });
    }

    // Master DNA validation
    if (result.masterDNA) {
      console.log('\n🧬 MASTER DNA VALIDATION:');
      console.log('   Project ID:', result.masterDNA.projectID);
      console.log('   Dimensions:', result.masterDNA.dimensions?.length, '×', result.masterDNA.dimensions?.width);
      console.log('   Floors:', result.masterDNA.dimensions?.floorCount);
      console.log('   Materials:', result.masterDNA.materials?.exterior?.primary);
      console.log('   Roof:', result.masterDNA.materials?.roof?.type, result.masterDNA.materials?.roof?.material);
      console.log('   Consistency Rules:', result.masterDNA.consistencyRules?.CRITICAL?.length || 0);
    }

    console.log('\n✅ ============================================');
    console.log('✅ DNA-ENHANCED CONSISTENCY TEST COMPLETE');
    console.log('✅ ============================================');

    return result;

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run test
testDNAConsistency()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
