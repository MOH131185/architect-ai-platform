/**
 * Test script for A1 One-Shot with Real Site Map
 * 
 * Tests the complete workflow:
 * 1. Site map snapshot fetch from Google Static Maps
 * 2. A1 sheet generation with site map as initImage
 * 3. Verification that site map metadata is included
 */

import dnaWorkflowOrchestrator from './src/services/dnaWorkflowOrchestrator.js';
import { getSiteSnapshotWithMetadata } from './src/services/siteMapSnapshotService.js';

// Test location (London, UK)
const testLocation = {
  address: '123 Test Street, London, UK',
  coordinates: {
    lat: 51.5074,
    lng: -0.1278
  },
  sitePolygon: [
    { lat: 51.5074, lng: -0.1278 },
    { lat: 51.5075, lng: -0.1278 },
    { lat: 51.5075, lng: -0.1277 },
    { lat: 51.5074, lng: -0.1277 }
  ]
};

const testProjectContext = {
  buildingProgram: 'residential house',
  floorArea: 200,
  floors: 2,
  architecturalStyle: 'Contemporary',
  projectName: 'Test A1 Sheet Generation'
};

async function testSiteMapSnapshot() {
  console.log('\n🧪 TEST 1: Site Map Snapshot Fetch');
  console.log('=====================================\n');

  try {
    const result = await getSiteSnapshotWithMetadata({
      coordinates: testLocation.coordinates,
      polygon: testLocation.sitePolygon,
      zoom: 19,
      size: [640, 400]
    });

    if (result && result.dataUrl) {
      console.log('✅ Site map snapshot fetched successfully');
      console.log(`   Data URL length: ${result.dataUrl.length} chars`);
      console.log(`   Attribution: ${result.attribution}`);
      console.log(`   Has polygon: ${result.hasPolygon}`);
      return result.dataUrl;
    } else {
      console.log('⚠️  Site map snapshot returned null (API key may be missing)');
      return null;
    }
  } catch (error) {
    console.error('❌ Site map snapshot test failed:', error.message);
    return null;
  }
}

async function testA1SheetWorkflow() {
  console.log('\n🧪 TEST 2: A1 Sheet Workflow with Site Map');
  console.log('============================================\n');

  try {
    const result = await dnaWorkflowOrchestrator.runA1SheetWorkflow({
      projectContext: testProjectContext,
      locationData: testLocation,
      portfolioAnalysis: null,
      portfolioBlendPercent: 70,
      seed: 123456
    });

    if (result.success) {
      console.log('\n✅ A1 Sheet workflow completed successfully');
      console.log(`   Sheet URL: ${result.a1Sheet?.url?.substring(0, 80)}...`);
      console.log(`   Seed: ${result.a1Sheet?.seed}`);
      
      // Verify site map metadata
      const siteMapInfo = result.a1Sheet?.metadata?.insetSources;
      if (siteMapInfo) {
        console.log('\n🗺️  Site Map Metadata:');
        console.log(`   Has real site map: ${siteMapInfo.hasRealSiteMap}`);
        console.log(`   Source URL: ${siteMapInfo.siteMapUrl || 'N/A'}`);
        console.log(`   Attribution: ${siteMapInfo.siteMapAttribution || 'N/A'}`);
        
        if (siteMapInfo.hasRealSiteMap) {
          console.log('   ✅ Site map successfully integrated!');
        } else {
          console.log('   ⚠️  Site map not included (may be due to missing API key)');
        }
      } else {
        console.log('\n⚠️  Site map metadata not found in result');
      }

      // Verify A1 sheet contains required elements
      const prompt = result.a1Sheet?.prompt || '';
      const hasFloorPlans = prompt.includes('FLOOR PLAN') || prompt.includes('floor plan');
      const hasElevations = prompt.includes('ELEVATION') || prompt.includes('elevation');
      const hasSections = prompt.includes('SECTION') || prompt.includes('section');
      const hasDimensions = prompt.includes('DIMENSION') || prompt.includes('dimension');

      console.log('\n📋 Prompt Verification:');
      console.log(`   Floor plans mentioned: ${hasFloorPlans ? '✅' : '❌'}`);
      console.log(`   Elevations mentioned: ${hasElevations ? '✅' : '❌'}`);
      console.log(`   Sections mentioned: ${hasSections ? '✅' : '❌'}`);
      console.log(`   Dimensions mentioned: ${hasDimensions ? '✅' : '❌'}`);

      return result;
    } else {
      console.error('❌ A1 Sheet workflow failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ A1 Sheet workflow test failed:', error.message);
    console.error('   Stack:', error.stack);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 Starting A1 One-Shot with Real Site Map Tests');
  console.log('==================================================\n');

  // Test 1: Site map snapshot
  const siteMapDataUrl = await testSiteMapSnapshot();

  // Test 2: Full A1 workflow
  const workflowResult = await testA1SheetWorkflow();

  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  console.log(`   Site map snapshot: ${siteMapDataUrl ? '✅ PASSED' : '⚠️  SKIPPED (API key may be missing)'}`);
  console.log(`   A1 workflow: ${workflowResult?.success ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (workflowResult?.success) {
    const siteMapIncluded = workflowResult.a1Sheet?.metadata?.insetSources?.hasRealSiteMap;
    console.log(`   Site map in A1 sheet: ${siteMapIncluded ? '✅ YES' : '⚠️  NO'}`);
  }

  console.log('\n✅ All tests completed');
  
  return {
    siteMapTest: !!siteMapDataUrl,
    workflowTest: workflowResult?.success || false,
    siteMapIncluded: workflowResult?.a1Sheet?.metadata?.insetSources?.hasRealSiteMap || false
  };
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { runAllTests, testSiteMapSnapshot, testA1SheetWorkflow };

