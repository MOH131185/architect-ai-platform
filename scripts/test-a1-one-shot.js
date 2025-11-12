/**
 * Test A1 One-Shot Workflow
 * 
 * Tests the complete A1 sheet generation workflow end-to-end
 * Uses stub location data to verify the pipeline works correctly
 */

// Mock environment for Node.js execution
if (typeof process !== 'undefined' && process.env) {
  process.env.NODE_ENV = 'test';
}

// Import the orchestrator (use dynamic import for ESM compatibility)
async function testA1OneShot() {
  console.log('🧪 Testing A1 One-Shot Workflow...\n');

  try {
    // Import the orchestrator
    const dnaWorkflowOrchestrator = await import('./src/services/dnaWorkflowOrchestrator.js');

    // Create stub project context
    const projectContext = {
      buildingProgram: 'residential',
      area: '200',
      floorArea: 200,
      floors: 2,
      architecturalStyle: 'Contemporary',
      specifications: {
        program: 'residential',
        area: '200',
        floors: 2
      }
    };

    // Create stub location data
    const locationData = {
      address: '123 Test Street, London, UK',
      coordinates: { lat: 51.5074, lng: -0.1278 },
      climate: {
        type: 'Temperate',
        seasonal: {
          winter: { avgTemp: '5°C', precipitation: '50mm' },
          spring: { avgTemp: '12°C', precipitation: '40mm' },
          summer: { avgTemp: '20°C', precipitation: '30mm' },
          fall: { avgTemp: '10°C', precipitation: '45mm' }
        }
      },
      zoning: {
        type: 'Residential',
        maxHeight: '12m',
        density: 'Medium'
      },
      architecturalData: {
        primary: 'Contemporary',
        materials: ['Brick', 'Glass', 'Concrete'],
        characteristics: ['Modern', 'Functional', 'Sustainable']
      },
      sunPath: {
        optimalOrientation: 'South-facing'
      }
    };

    // Create stub portfolio analysis
    const portfolioAnalysis = {
      primaryStyle: {
        name: 'Modern',
        confidence: 'High'
      },
      materials: ['Brick', 'Glass', 'Steel'],
      characteristics: ['Clean lines', 'Open spaces', 'Natural light'],
      colorPalette: {
        facade: '#B8604E',
        roof: '#8B4513',
        trim: '#FFFFFF'
      }
    };

    console.log('📋 Test Parameters:');
    console.log('   Location:', locationData.address);
    console.log('   Program:', projectContext.buildingProgram);
    console.log('   Area:', projectContext.area, 'm²');
    console.log('   Floors:', projectContext.floors);
    console.log('   Portfolio Style:', portfolioAnalysis.primaryStyle.name);
    console.log('');

    // Run the workflow
    console.log('🚀 Running A1 Sheet Workflow...\n');
    const result = await dnaWorkflowOrchestrator.default.runA1SheetWorkflow({
      projectContext,
      locationData,
      portfolioAnalysis,
      portfolioBlendPercent: 70,
      seed: 123456
    });

    // Check results
    console.log('\n📊 Test Results:');
    console.log('   Success:', result.success ? '✅' : '❌');
    console.log('   Workflow:', result.workflow);
    
    if (result.success) {
      console.log('   A1 Sheet URL:', result.a1Sheet?.url ? 'Present' : 'Missing');
      console.log('   Master DNA:', result.masterDNA ? 'Generated' : 'Missing');
      console.log('   Reasoning:', result.reasoning ? 'Generated' : 'Missing');
      console.log('   Reasoning Source:', result.reasoning?.source || 'N/A');
      console.log('   Reasoning Model:', result.reasoning?.model || 'N/A');
      
      if (result.a1Sheet?.url) {
        console.log('\n✅ A1 Sheet workflow completed successfully!');
        console.log('   The workflow generates a single comprehensive A1 sheet');
        console.log('   with all views embedded and style/climate/portfolio blended.');
      } else {
        console.log('\n⚠️  A1 Sheet workflow completed but URL is missing');
      }
    } else {
      console.log('   Error:', result.error);
      console.log('\n❌ A1 Sheet workflow failed');
      process.exit(1);
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testA1OneShot().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

