// Test floor plan generation and extraction
// This script tests the floor plan generation logic after removing construction documentation

import replicateService from './src/services/replicateService.js';
import aiIntegrationService from './src/services/aiIntegrationService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testFloorPlanGeneration() {
  console.log('🔍 Testing Floor Plan Generation...\n');

  // Test context with sample data
  const testContext = {
    floorArea: 250,
    buildingProgram: 'modern house',
    architecturalStyle: 'contemporary',
    materials: 'concrete and glass',
    location: {
      address: '123 Main St, San Francisco, CA',
      coordinates: { lat: 37.7749, lng: -122.4194 }
    },
    projectSeed: 123456
  };

  try {
    console.log('1️⃣ Testing replicateService.generateMultiLevelFloorPlans...');
    const floorPlanResult = await replicateService.generateMultiLevelFloorPlans(testContext, true);

    console.log('\n📊 Floor Plan Result Structure:');
    console.log('- success:', floorPlanResult.success);
    console.log('- floorCount:', floorPlanResult.floorCount);
    console.log('- projectSeed:', floorPlanResult.projectSeed);
    console.log('- floorPlans keys:', Object.keys(floorPlanResult.floorPlans || {}));

    if (floorPlanResult.floorPlans) {
      console.log('\n📋 Floor Plan Details:');
      if (floorPlanResult.floorPlans.ground) {
        console.log('✅ Ground floor:', {
          hasImages: !!floorPlanResult.floorPlans.ground.images,
          imageCount: floorPlanResult.floorPlans.ground.images?.length || 0,
          firstImage: floorPlanResult.floorPlans.ground.images?.[0]?.substring(0, 50) + '...'
        });
      }
      if (floorPlanResult.floorPlans.upper) {
        console.log('✅ Upper floor:', {
          hasImages: !!floorPlanResult.floorPlans.upper.images,
          imageCount: floorPlanResult.floorPlans.upper.images?.length || 0,
          firstImage: floorPlanResult.floorPlans.upper.images?.[0]?.substring(0, 50) + '...'
        });
      }
      if (floorPlanResult.floorPlans.roof) {
        console.log('✅ Roof plan:', {
          hasImages: !!floorPlanResult.floorPlans.roof.images,
          imageCount: floorPlanResult.floorPlans.roof.images?.length || 0,
          firstImage: floorPlanResult.floorPlans.roof.images?.[0]?.substring(0, 50) + '...'
        });
      }
    }

    // Simulate the extraction logic from ArchitectAIEnhanced.js
    console.log('\n2️⃣ Testing extraction logic (simulating extractFloorPlanImages)...');
    const aiResult = { floorPlans: floorPlanResult.floorPlans };
    const extractedPlans = {};

    // This matches the fixed extraction logic
    if (aiResult.floorPlans?.ground) {
      const plans = aiResult.floorPlans;
      if (plans.ground?.images && plans.ground.images.length > 0) {
        extractedPlans.ground = plans.ground.images[0];
        console.log('✅ Extracted ground floor plan');
      }
      if (plans.upper?.images && plans.upper.images.length > 0) {
        extractedPlans.upper = plans.upper.images[0];
        console.log('✅ Extracted upper floor plan');
      }
      if (plans.roof?.images && plans.roof.images.length > 0) {
        extractedPlans.roof = plans.roof.images[0];
        console.log('✅ Extracted roof plan');
      }
    }

    console.log('\n📊 Extraction Summary:');
    console.log('- Total extracted:', Object.keys(extractedPlans).length);
    console.log('- Extracted keys:', Object.keys(extractedPlans));

    if (Object.keys(extractedPlans).length > 0) {
      console.log('\n✅ SUCCESS: Floor plans generated and extracted correctly!');
    } else {
      console.log('\n⚠️ WARNING: No floor plans were extracted. Check the structure.');
    }

  } catch (error) {
    console.error('\n❌ ERROR during testing:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testFloorPlanGeneration();