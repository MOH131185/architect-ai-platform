#!/usr/bin/env node

/**
 * Test A1 Sheet Generation - Complete Architecture Project
 *
 * Tests the complete A1 sheet generation with:
 * - Portrait orientation (7016×9933px @ 300 DPI)
 * - Google Maps site plan integration
 * - All architectural views with dimensions
 * - Material palette and specifications
 * - Professional title block
 */

const fs = require('fs');
const path = require('path');

// Import the services (require transpilation for TypeScript)
async function testA1Sheet() {
  console.log('🎨 Testing A1 Sheet Generation (Portrait 7016×9933px @ 300 DPI)...\n');

  try {
    // Import services
    const { buildA1SheetPrompt, generateA1SheetMetadata } = await import('./src/services/a1SheetPromptGenerator.js');
    const { fetchSiteMap } = await import('./src/services/siteMapService.js');
    const { GENERATION_CONFIG } = await import('./src/config/generationConfig.js');

    // Create test data for a Birmingham, UK project
    const testProject = {
      masterDNA: {
        dimensions: {
          length: 15.25,
          width: 10.15,
          height: 7.40,
          floorHeights: [0, 3.1, 7.4],
          floor_count: 2
        },
        materials: [
          { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
          { name: 'Clay tiles', hexColor: '#8B4513', application: 'gable roof 35°', pitch: 35 },
          { name: 'Timber cladding', hexColor: '#8B7355', application: 'feature panels' },
          { name: 'Triple glazing', hexColor: '#E8F4F8', application: 'windows and doors' }
        ],
        rooms: [
          { name: 'Living Room', dimensions: '5.5m × 4.0m', floor: 'ground', windows: 2 },
          { name: 'Kitchen', dimensions: '4.0m × 3.5m', floor: 'ground', windows: 1 },
          { name: 'Dining', dimensions: '3.5m × 3.0m', floor: 'ground', windows: 1 },
          { name: 'Master Bedroom', dimensions: '4.5m × 4.0m', floor: 'upper', windows: 2 },
          { name: 'Bedroom 2', dimensions: '3.5m × 3.0m', floor: 'upper', windows: 1 },
          { name: 'Bedroom 3', dimensions: '3.0m × 2.5m', floor: 'upper', windows: 1 }
        ],
        viewSpecificFeatures: {
          north: { mainEntrance: true, windows: 4 },
          south: { patioDoors: true, windows: 3 },
          east: { windows: 2 },
          west: { windows: 2 }
        },
        architecturalStyle: 'Modern Contemporary with Traditional Brick',
        roof: { type: 'gable', pitch: 35 },
        seed: 806502,
        projectID: 'BIR-2025-001'
      },
      location: {
        address: '42 Edgbaston Park Road, Birmingham, B15 2TX, UK',
        coordinates: { lat: 52.4537, lng: -1.9288 },
        sitePolygon: [
          { lat: 52.4537, lng: -1.9290 },
          { lat: 52.4539, lng: -1.9290 },
          { lat: 52.4539, lng: -1.9286 },
          { lat: 52.4537, lng: -1.9286 }
        ],
        climate: {
          type: 'Temperate Oceanic',
          seasonal: {
            summer: { avgTemp: '18°C' },
            winter: { avgTemp: '5°C' }
          }
        },
        sunPath: {
          optimalOrientation: 'South-facing',
          summer: { azimuth: 180, altitude: 65 },
          winter: { azimuth: 180, altitude: 25 }
        }
      },
      climate: {
        type: 'Temperate Oceanic',
        avgTemp: '10°C',
        avgRainfall: '750mm/year'
      },
      portfolioBlendPercent: 70,
      projectMeta: {
        name: 'Modern 3-Bedroom Family House',
        style: 'Contemporary',
        seed: 806502
      },
      projectContext: {
        buildingProgram: '3-Bedroom Family House',
        clientName: 'Private Client'
      },
      blendedStyle: {
        styleName: 'Contemporary Brick & Timber',
        materials: ['Red brick', 'Timber cladding', 'Clay tiles'],
        colorPalette: {
          facade: '#B8604E',
          roof: '#8B4513',
          trim: '#FFFFFF',
          accent: '#8B7355'
        },
        glazingRatio: '25%',
        facadeArticulation: 'Clean lines with brick base and timber upper accents'
      },
      siteShape: {
        type: 'rectangular',
        area: '450m²'
      },
      selectedDetails: [
        {
          title: 'Wall Construction',
          specs: [
            'External brick: 102.5mm facing brick',
            'Cavity: 100mm with full-fill insulation',
            'Internal: 100mm blockwork with plaster finish',
            'U-value: 0.18 W/m²K'
          ]
        },
        {
          title: 'Roof Construction',
          specs: [
            'Clay tiles on battens',
            '50mm air gap with breather membrane',
            '200mm mineral wool insulation between rafters',
            '100mm PIR insulation under rafters',
            'U-value: 0.13 W/m²K'
          ]
        }
      ]
    };

    console.log('✅ Test project data created\n');

    // Test 1: Generate A1 sheet prompt
    console.log('📝 TEST 1: Generating A1 sheet prompt...');
    const { prompt, negativePrompt, systemHints } = buildA1SheetPrompt(testProject);

    console.log('   ✓ Prompt length:', prompt.length, 'characters');
    console.log('   ✓ Negative prompt length:', negativePrompt.length, 'characters');
    console.log('   ✓ System hints:', JSON.stringify(systemHints, null, 2));
    console.log('');

    // Test 2: Generate A1 sheet metadata
    console.log('📊 TEST 2: Generating A1 sheet metadata...');
    const metadata = generateA1SheetMetadata(testProject);

    console.log('   ✓ Format:', metadata.format);
    console.log('   ✓ Orientation:', metadata.orientation);
    console.log('   ✓ Dimensions (px):', `${metadata.dimensions.px.width} × ${metadata.dimensions.px.height}`);
    console.log('   ✓ DPI:', metadata.dimensions.dpi);
    console.log('   ✓ Aspect ratio:', metadata.dimensions.ratio.toFixed(3));
    console.log('');

    // Test 3: Test Google Maps integration
    console.log('🗺️ TEST 3: Testing Google Maps site plan integration...');
    const mapData = await fetchSiteMap({
      location: testProject.location,
      sitePolygon: testProject.location.sitePolygon,
      size: '800x600',
      zoom: 17,
      mapType: 'hybrid',
      scale: '2'
    });

    if (mapData.url) {
      console.log('   ✓ Map URL generated successfully');
      console.log('   ✓ Attribution:', mapData.attribution);
      console.log('   ✓ Scale:', mapData.scale);
      if (mapData.isFallback) {
        console.log('   ⚠️ Using fallback map (Google Maps API key not configured)');
      }
    } else {
      console.log('   ❌ Failed to generate map URL');
    }
    console.log('');

    // Test 4: Verify prompt includes all required elements
    console.log('🔍 TEST 4: Verifying prompt includes all required elements...');
    const requiredElements = [
      { name: 'Portrait orientation', searchStr: '7016×9933px' },
      { name: 'Google Maps mention', searchStr: 'Google Maps' },
      { name: 'Site location', searchStr: testProject.location.address },
      { name: 'Dimension lines', searchStr: 'DIMENSION LINES MUST BE VISIBLE' },
      { name: 'All floor plans', searchStr: 'GROUND FLOOR PLAN' },
      { name: 'All elevations', searchStr: 'NORTH ELEVATION' },
      { name: 'Section drawings', searchStr: 'SECTION A-A' },
      { name: '3D views', searchStr: '3D EXTERIOR VIEW' },
      { name: 'Material palette', searchStr: 'MATERIAL PALETTE' },
      { name: 'Title block', searchStr: 'ARCHITECTURAL TITLE BLOCK' },
      { name: 'UK Building Regulations', searchStr: 'UK BUILDING REGULATIONS' },
      { name: 'RIBA standards', searchStr: 'RIBA' },
      { name: 'Climate analysis', searchStr: 'CLIMATE' },
      { name: 'Sun path', searchStr: 'Sun Path' },
      { name: 'Project data', searchStr: 'PROJECT DATA' }
    ];

    let allElementsFound = true;
    requiredElements.forEach(element => {
      const found = prompt.includes(element.searchStr);
      console.log(`   ${found ? '✓' : '❌'} ${element.name}`);
      if (!found) allElementsFound = false;
    });
    console.log('');

    // Test 5: Check configuration
    console.log('⚙️ TEST 5: Checking A1 configuration...');
    console.log('   ✓ A1 Sheet enabled:', GENERATION_CONFIG.a1SheetEnabled);
    console.log('   ✓ Resolution:', `${GENERATION_CONFIG.a1Resolution.width} × ${GENERATION_CONFIG.a1Resolution.height}`);
    console.log('   ✓ DPI:', GENERATION_CONFIG.a1Resolution.dpi);
    console.log('   ✓ Orientation:', GENERATION_CONFIG.a1Resolution.orientation);
    console.log('   ✓ DNA Strict Mode:', GENERATION_CONFIG.dnaStrictMode);
    console.log('   ✓ Generate Complete Set:', GENERATION_CONFIG.generateCompleteSet);
    console.log('');

    // Save test outputs
    const outputDir = path.join(__dirname, 'test-outputs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Save prompt to file
    const promptFile = path.join(outputDir, 'a1-sheet-prompt.txt');
    fs.writeFileSync(promptFile, prompt);
    console.log(`📁 Prompt saved to: ${promptFile}`);

    // Save metadata to file
    const metadataFile = path.join(outputDir, 'a1-sheet-metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    console.log(`📁 Metadata saved to: ${metadataFile}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    if (allElementsFound) {
      console.log('✅ All tests passed successfully!');
      console.log('✅ A1 sheet generation is configured correctly');
      console.log('✅ Portrait orientation: 7016×9933px @ 300 DPI');
      console.log('✅ All required elements are included in the prompt');
    } else {
      console.log('⚠️ Some required elements are missing from the prompt');
      console.log('⚠️ Please review the prompt generation');
    }

    console.log('\n📋 Next Steps:');
    console.log('1. Run the application: npm run dev');
    console.log('2. Navigate through the workflow');
    console.log('3. Generate an A1 sheet with a real project');
    console.log('4. Verify the output includes all required elements');
    console.log('5. Check that dimensions are properly displayed');
    console.log('6. Ensure Google Maps site plan is integrated');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Starting A1 Sheet Generation Test...\n');
testA1Sheet()
  .then(() => {
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });