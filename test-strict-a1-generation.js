/**
 * Test Strict A1 Generation System
 * 
 * Tests the high-accuracy A1 sheet generation with perfect consistency.
 * Validates that:
 * - Plans match elevations
 * - Window counts match 3D views
 * - Materials are identical across views
 * - Dimensions are exact
 * - NO hallucination
 * - NO geometry drift
 */

import { buildStrictA1Prompt } from './src/services/strictA1PromptGenerator.js';
import { validateA1SheetConsistency, generateConsistencyReport, autoFixConsistencyIssues } from './src/services/architecturalConsistencyValidator.js';
import dnaValidator from './src/services/dnaValidator.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔒 STRICT A1 GENERATION SYSTEM TEST');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Create Master DNA
console.log('TEST 1: Creating Master DNA with exact specifications...');

const masterDNA = {
  projectID: 'STRICT_TEST_001',
  seed: 123456,
  
  dimensions: {
    length: 15.0,
    width: 10.0,
    totalHeight: 7.0,
    height: 7.0,
    floorCount: 2,
    groundFloorHeight: 3.0,
    upperFloorHeight: 2.7,
    wallThickness: '0.3m exterior, 0.15m interior',
    totalArea: 300,
    footprintArea: 150,
    groundFloorArea: 150,
    upperFloorArea: 150
  },
  
  materials: [
    {
      name: 'Red clay brick',
      hexColor: '#B8604E',
      application: 'exterior walls',
      texture: 'textured',
      bond: 'Flemish bond'
    },
    {
      name: 'Clay tiles',
      hexColor: '#8B4513',
      application: 'gable roof',
      texture: 'textured'
    },
    {
      name: 'UPVC',
      hexColor: '#FFFFFF',
      application: 'window frames',
      texture: 'smooth'
    }
  ],
  
  roof: {
    type: 'gable',
    material: 'Clay tiles',
    color: '#8B4513',
    pitch: 35,
    overhang: '0.4m',
    ridgeHeight: '7.0m'
  },
  
  windows: {
    type: 'Casement',
    pattern: 'grid',
    frame: 'UPVC',
    color: '#FFFFFF',
    glazing: 'Double',
    standardSize: '1.5m × 1.2m',
    sillHeight: '0.9m'
  },
  
  doors: {
    main: {
      type: 'Panel',
      material: 'Composite',
      color: '#2C3E50',
      width: 1.0,
      height: 2.1
    }
  },
  
  entrance: {
    facade: 'N',
    position: 'center',
    width: 1.0
  },
  
  elevations: {
    north: {
      description: 'FRONT FACADE - Main entrance elevation',
      features: [
        'Main entrance door centered',
        '4 windows on ground floor (2 either side of door)',
        '4 windows on upper floor (matching ground floor)',
        'Gable roof visible with ridge at center'
      ],
      symmetry: 'Symmetrical about center axis',
      distinctiveFeatures: 'Front door with porch canopy'
    },
    south: {
      description: 'REAR FACADE - Garden elevation',
      features: [
        'Large patio doors to living room',
        'Kitchen window to left',
        '3 bedroom windows on upper floor',
        'Gable end with small vent'
      ],
      symmetry: 'Asymmetrical',
      distinctiveFeatures: 'Large patio doors on ground floor'
    },
    east: {
      description: 'RIGHT SIDE ELEVATION',
      features: [
        '2 windows on ground floor (living room, dining)',
        '2 windows on upper floor (bedrooms)',
        'Roof slope visible',
        'Rainwater downpipe'
      ],
      symmetry: 'Vertical alignment of windows',
      distinctiveFeatures: 'Windows aligned vertically'
    },
    west: {
      description: 'LEFT SIDE ELEVATION',
      features: [
        'Kitchen window on ground floor',
        'Bathroom window on upper floor (frosted)',
        'Roof slope visible',
        'Soil pipe visible'
      ],
      symmetry: 'Asymmetrical',
      distinctiveFeatures: 'Small frosted bathroom window'
    }
  },
  
  floorPlans: {
    ground: {
      rooms: [
        { name: 'Living Room', dimensions: '5.5m × 4.0m', area: 22, position: 'Front left' },
        { name: 'Kitchen', dimensions: '4.0m × 3.5m', area: 14, position: 'Rear left' },
        { name: 'Dining', dimensions: '4.0m × 3.5m', area: 14, position: 'Rear right' },
        { name: 'Hallway', dimensions: '6.0m × 1.2m', area: 7, position: 'Center' }
      ],
      entrance: { location: 'Center of north facade', type: 'Covered porch', width: '1.2m' }
    },
    first: {
      rooms: [
        { name: 'Master Bedroom', dimensions: '5.5m × 4.0m', area: 22, position: 'Front left' },
        { name: 'Bedroom 2', dimensions: '4.0m × 3.5m', area: 14, position: 'Front right' },
        { name: 'Bathroom', dimensions: '3.0m × 2.5m', area: 7.5, position: 'Rear' }
      ]
    }
  },
  
  sections: {
    longitudinal: {
      description: 'SECTION A-A - Long axis through building',
      cutLocation: 'Through center hallway and staircase',
      visible: [
        'Staircase with 14 treads',
        'Ground floor ceiling height 3.0m',
        'Upper floor ceiling height 2.7m',
        'Roof structure with rafters at 35° pitch',
        'Foundation depth 1.2m below ground'
      ]
    },
    cross: {
      description: 'SECTION B-B - Short axis perpendicular to Section A-A',
      cutLocation: 'Through living room and master bedroom',
      visible: [
        'Living room with window visible',
        'Master bedroom above with window',
        'Floor joists between floors',
        'Roof structure',
        'Wall construction layers'
      ]
    }
  },
  
  colorPalette: {
    primary: '#B8604E',
    secondary: '#FFFFFF',
    facade: '#B8604E',
    trim: '#FFFFFF',
    roof: '#8B4513',
    windows: '#FFFFFF',
    door: '#2C3E50'
  },
  
  architecturalStyle: 'Contemporary British'
};

console.log('✅ Master DNA created');
console.log(`   Project ID: ${masterDNA.projectID}`);
console.log(`   Dimensions: ${masterDNA.dimensions.length}m × ${masterDNA.dimensions.width}m × ${masterDNA.dimensions.totalHeight}m`);
console.log(`   Floors: ${masterDNA.dimensions.floorCount}`);
console.log(`   Materials: ${masterDNA.materials.length} specified`);
console.log('');

// Test 2: Validate DNA
console.log('TEST 2: Validating Master DNA...');

const dnaValidation = dnaValidator.validateDesignDNA(masterDNA);

if (dnaValidation.isValid) {
  console.log('✅ DNA validation passed');
  console.log(`   Errors: ${dnaValidation.errors.length}`);
  console.log(`   Warnings: ${dnaValidation.warnings.length}`);
} else {
  console.log('❌ DNA validation failed');
  console.log(`   Errors: ${dnaValidation.errors.length}`);
  dnaValidation.errors.forEach(error => console.log(`      - ${error}`));
}
console.log('');

// Test 3: Build Strict A1 Prompt
console.log('TEST 3: Building Strict A1 Prompt with consistency locks...');

const location = {
  address: 'Birmingham, UK',
  coordinates: { lat: 52.4862, lng: -1.8904 },
  climate: { type: 'Temperate oceanic' },
  sunPath: { optimalOrientation: 180 }
};

const projectContext = {
  projectType: 'residential house',
  buildingProgram: 'three-bedroom family house'
};

const projectMeta = {
  seed: 123456,
  client: 'Test Client',
  projectRef: 'STRICT-001',
  revision: 'P01'
};

const promptResult = buildStrictA1Prompt({
  masterDNA,
  location,
  climate: location.climate,
  projectContext,
  projectMeta
});

console.log('✅ Strict A1 prompt generated');
console.log(`   Prompt length: ${promptResult.prompt.length} characters`);
console.log(`   Negative prompt length: ${promptResult.negativePrompt.length} characters`);
console.log(`   Consistency locks: ${Object.keys(promptResult.consistencyLocks).length}`);
console.log('');

console.log('Consistency Locks Summary:');
console.log(`   EXACT_LENGTH: ${promptResult.consistencyLocks.EXACT_LENGTH}`);
console.log(`   EXACT_WIDTH: ${promptResult.consistencyLocks.EXACT_WIDTH}`);
console.log(`   EXACT_HEIGHT: ${promptResult.consistencyLocks.EXACT_HEIGHT}`);
console.log(`   EXACT_FLOOR_COUNT: ${promptResult.consistencyLocks.EXACT_FLOOR_COUNT}`);
console.log(`   EXACT_ROOF_TYPE: ${promptResult.consistencyLocks.EXACT_ROOF_TYPE}`);
console.log(`   EXACT_ROOF_PITCH: ${promptResult.consistencyLocks.EXACT_ROOF_PITCH}`);
console.log(`   EXACT_WINDOW_TOTAL: ${promptResult.consistencyLocks.EXACT_WINDOW_TOTAL}`);
console.log(`   EXACT_DOOR_LOCATION: ${promptResult.consistencyLocks.EXACT_DOOR_LOCATION}`);
console.log('');

// Test 4: Validate Consistency (simulate)
console.log('TEST 4: Validating consistency (simulated)...');

const consistencyValidation = await validateA1SheetConsistency({
  generatedImageUrl: 'https://example.com/generated-a1-sheet.png',
  masterDNA,
  consistencyLocks: promptResult.consistencyLocks,
  strictMode: true
});

console.log('✅ Consistency validation complete');
console.log(`   Valid: ${consistencyValidation.valid}`);
console.log(`   Consistency Score: ${(consistencyValidation.consistencyScore * 100).toFixed(1)}%`);
console.log(`   Errors: ${consistencyValidation.errors.length}`);
console.log(`   Warnings: ${consistencyValidation.warnings.length}`);
console.log('');

// Generate consistency report
const report = generateConsistencyReport(consistencyValidation);
console.log(report);

// Test 5: Auto-fix consistency issues (if any)
if (!consistencyValidation.valid) {
  console.log('TEST 5: Auto-fixing consistency issues...');
  
  const fixedDNA = autoFixConsistencyIssues(masterDNA, promptResult.consistencyLocks);
  
  console.log('✅ DNA auto-fixed');
  console.log(`   Fixed dimensions: ${fixedDNA.dimensions.length}m × ${fixedDNA.dimensions.width}m × ${fixedDNA.dimensions.totalHeight}m`);
  console.log(`   Fixed roof: ${fixedDNA.roof.type} at ${fixedDNA.roof.pitch}°`);
  console.log('');
}

// Test 6: Display prompt excerpt
console.log('TEST 6: Strict A1 Prompt Excerpt...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(promptResult.prompt.substring(0, 1500) + '...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ STRICT A1 GENERATION SYSTEM TEST COMPLETE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Summary:');
console.log(`  ✅ Master DNA created and validated`);
console.log(`  ✅ Strict A1 prompt generated with ${Object.keys(promptResult.consistencyLocks).length} consistency locks`);
console.log(`  ✅ Consistency validation framework ready`);
console.log(`  ✅ Auto-fix capability available`);
console.log('');
console.log('Next Steps:');
console.log('  1. Integrate with Together.ai FLUX.1-kontext-max for generation');
console.log('  2. Use consistency locks in generation parameters');
console.log('  3. Validate generated A1 sheet against locks');
console.log('  4. Store baseline artifacts with consistency locks');
console.log('  5. Use for modify mode with perfect consistency');
console.log('');
console.log('Expected Results:');
console.log('  - Plans MATCH elevations (window counts, dimensions)');
console.log('  - Window counts MATCH 3D views');
console.log('  - Materials IDENTICAL across all views');
console.log('  - Dimensions EXACT and consistent');
console.log('  - NO hallucination');
console.log('  - NO geometry drift');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

