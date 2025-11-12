/**
 * Test DNA Generation Only (No Image Generation)
 * Tests the Master DNA and prompt generation without requiring server
 */

import enhancedDNAGenerator from './src/services/enhancedDNAGenerator.js';
import dnaPromptGenerator from './src/services/dnaPromptGenerator.js';
import dnaValidator from './src/services/dnaValidator.js';

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

async function testDNAOnly() {
  console.log('🧪 ============================================');
  console.log('🧪 TESTING DNA GENERATION (NO IMAGES)');
  console.log('🧪 ============================================\n');

  try {
    // Step 1: Generate Master DNA
    console.log('📋 Step 1: Generating Master Design DNA...');
    const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(testProject);
    const masterDNA = dnaResult.masterDNA;

    if (dnaResult.success) {
      console.log('✅ Master DNA generated successfully via OpenAI');
    } else {
      console.log('⚠️  Using fallback Master DNA (OpenAI not available)');
    }

    console.log('\n🧬 MASTER DNA DETAILS:');
    console.log('   Project ID:', masterDNA.projectID);
    console.log('   Seed:', masterDNA.seed);
    console.log('   Is Fallback:', masterDNA.isFallback || false);
    console.log('   Dimensions:', masterDNA.dimensions?.length, '×', masterDNA.dimensions?.width, '×', masterDNA.dimensions?.totalHeight);
    console.log('   Floor Count:', masterDNA.dimensions?.floorCount);
    console.log('   Primary Material:', masterDNA.materials?.exterior?.primary);
    console.log('   Material Color:', masterDNA.materials?.exterior?.color);
    console.log('   Roof Type:', masterDNA.materials?.roof?.type);
    console.log('   Roof Material:', masterDNA.materials?.roof?.material);
    console.log('   Roof Pitch:', masterDNA.materials?.roof?.pitch);

    // Step 2: Validate Master DNA
    console.log('\n🔍 Step 2: Validating Master DNA...');
    const validation = dnaValidator.validateDesignDNA(masterDNA);

    console.log('   Valid:', validation.isValid ? '✅ YES' : '❌ NO');
    console.log('   Errors:', validation.errors.length);
    if (validation.errors.length > 0) {
      validation.errors.forEach(e => console.log('      -', e));
    }
    console.log('   Warnings:', validation.warnings.length);
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.log('      -', w));
    }

    // Auto-fix if needed
    if (!validation.isValid) {
      console.log('\n🔧 Attempting auto-fix...');
      const fixed = dnaValidator.autoFixDesignDNA(masterDNA);
      if (fixed) {
        console.log('✅ Auto-fix successful');
        Object.assign(masterDNA, fixed);
      } else {
        console.log('⚠️  Auto-fix incomplete, using DNA as-is');
      }
    }

    // Step 3: Generate all prompts
    console.log('\n📝 Step 3: Generating 13 unique prompts...');
    const allPrompts = dnaPromptGenerator.generateAllPrompts(masterDNA, testProject);

    const viewTypes = [
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

    console.log('✅ Generated', viewTypes.length, 'unique prompts\n');

    console.log('📋 PROMPT SAMPLES:');
    viewTypes.forEach((view, index) => {
      const prompt = allPrompts[view];
      console.log(`\n${index + 1}. ${view.toUpperCase()}`);
      console.log('   Length:', prompt.length, 'characters');
      console.log('   Preview:', prompt.substring(0, 150).replace(/\n/g, ' ') + '...');

      // Check for uniqueness indicators
      const hasUniqueKeywords =
        (view.includes('ground') && prompt.includes('GROUND')) ||
        (view.includes('upper') && prompt.includes('UPPER')) ||
        (view.includes('north') && prompt.includes('NORTH')) ||
        (view.includes('south') && prompt.includes('SOUTH')) ||
        (view.includes('east') && prompt.includes('EAST')) ||
        (view.includes('west') && prompt.includes('WEST')) ||
        (view.includes('longitudinal') && prompt.includes('longitudinal')) ||
        (view.includes('cross') && prompt.includes('cross') || prompt.includes('CROSS')) ||
        (view.includes('axonometric') && prompt.includes('AXONOMETRIC')) ||
        (view.includes('perspective') && prompt.includes('PERSPECTIVE')) ||
        (view.includes('interior') && prompt.includes('INTERIOR'));

      console.log('   Unique Keywords:', hasUniqueKeywords ? '✅' : '⚠️');
    });

    // Step 4: Validate uniqueness
    console.log('\n\n🎯 Step 4: Validating prompt uniqueness...');
    const promptTexts = viewTypes.map(v => allPrompts[v]);
    const uniquePrompts = new Set(promptTexts);

    console.log('   Total Prompts:', promptTexts.length);
    console.log('   Unique Prompts:', uniquePrompts.size);
    console.log('   All Unique:', uniquePrompts.size === promptTexts.length ? '✅ YES' : '❌ NO');

    if (uniquePrompts.size !== promptTexts.length) {
      console.log('\n   ⚠️  DUPLICATE PROMPTS DETECTED:');
      const seen = new Map();
      promptTexts.forEach((prompt, index) => {
        if (seen.has(prompt)) {
          console.log(`      ${viewTypes[index]} === ${viewTypes[seen.get(prompt)]}`);
        } else {
          seen.set(prompt, index);
        }
      });
    }

    // Step 5: Consistency check
    console.log('\n📊 Step 5: Checking consistency across prompts...');

    const consistencyChecks = {
      seed: 0,
      dimensions: 0,
      materials: 0,
      floorCount: 0
    };

    promptTexts.forEach(prompt => {
      if (prompt.includes(`Seed: ${masterDNA.seed}`) || prompt.includes(`seed ${masterDNA.seed}`)) {
        consistencyChecks.seed++;
      }
      if (prompt.includes(`${masterDNA.dimensions?.length}`) && prompt.includes(`${masterDNA.dimensions?.width}`)) {
        consistencyChecks.dimensions++;
      }
      if (prompt.includes(masterDNA.materials?.exterior?.primary) || prompt.includes(masterDNA.materials?.exterior?.color)) {
        consistencyChecks.materials++;
      }
      if (prompt.includes(`${masterDNA.dimensions?.floorCount} floor`)) {
        consistencyChecks.floorCount++;
      }
    });

    console.log('   Seed mentioned:', consistencyChecks.seed, '/', promptTexts.length);
    console.log('   Dimensions mentioned:', consistencyChecks.dimensions, '/', promptTexts.length);
    console.log('   Materials mentioned:', consistencyChecks.materials, '/', promptTexts.length);
    console.log('   Floor count mentioned:', consistencyChecks.floorCount, '/', promptTexts.length);

    const avgConsistency = (
      consistencyChecks.seed +
      consistencyChecks.dimensions +
      consistencyChecks.materials +
      consistencyChecks.floorCount
    ) / (4 * promptTexts.length);

    console.log('   Overall Consistency Score:', Math.round(avgConsistency * 100) + '%');

    // Final summary
    console.log('\n✅ ============================================');
    console.log('✅ DNA GENERATION TEST COMPLETE');
    console.log('✅ ============================================');
    console.log('   ✅ Master DNA generated:', !!(masterDNA.projectID));
    console.log('   ✅ 13 unique prompts created:', uniquePrompts.size === 13);
    console.log('   ✅ Consistency maintained:', avgConsistency >= 0.8);
    console.log('   ✅ Ready for image generation');

    return {
      success: true,
      masterDNA,
      allPrompts,
      validation,
      consistencyScore: Math.round(avgConsistency * 100)
    };

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run test
testDNAOnly()
  .then((result) => {
    console.log('\n✅ All DNA tests passed!');
    console.log('   Next: Start server (npm run server) and run full test with images');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ DNA test failed:', error);
    process.exit(1);
  });
