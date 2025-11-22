/**
 * Test A1 Sheet Completeness
 * 
 * Validates that A1 sheet prompts include all required RIBA sections
 * and that the validation system properly checks for completeness
 */

const { buildA1SheetPrompt } = require('./src/services/a1SheetPromptGenerator');

console.log('\n🧪 ========================================');
console.log('🧪 A1 SHEET COMPLETENESS TEST SUITE');
console.log('🧪 ========================================\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASSED: ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${error.message}`);
    failedTests++;
  }
}

// Create mock DNA for testing
const mockMasterDNA = {
  dimensions: {
    length: 15,
    width: 10,
    height: 7,
    floorCount: 2,
    floorHeights: [3.0, 2.7]
  },
  materials: [
    { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
    { name: 'Clay tiles', hexColor: '#8B4513', application: 'gable roof' },
    { name: 'UPVC windows', hexColor: '#FFFFFF', application: 'windows' }
  ],
  rooms: [
    { name: 'Living Room', dimensions: '5.5m × 4.0m', floor: 'ground', windows: 2 },
    { name: 'Kitchen', dimensions: '4.0m × 3.5m', floor: 'ground', windows: 1 },
    { name: 'Master Bedroom', dimensions: '4.5m × 3.5m', floor: 'upper', windows: 2 }
  ],
  viewSpecificFeatures: {
    north: { mainEntrance: true, windows: 4 },
    south: { patioDoors: true, windows: 3 },
    east: { windows: 2 },
    west: { windows: 2 }
  },
  architecturalStyle: 'Contemporary',
  boundaryValidation: {
    validated: true,
    compliant: true,
    compliancePercentage: 100,
    wasCorrected: false,
    setbacks: {
      front: 3,
      rear: 3,
      sideLeft: 3,
      sideRight: 3
    }
  },
  siteConstraints: {
    buildableArea: 150,
    siteArea: 200,
    shapeType: 'rectangle'
  }
};

const mockLocation = {
  address: 'Birmingham, UK',
  climate: { type: 'Temperate oceanic' },
  sunPath: { optimalOrientation: 'south' },
  zoning: { type: 'residential', maxHeight: '10m' }
};

const mockProjectContext = {
  projectType: 'residential-house',
  buildingProgram: 'three-bedroom family house'
};

// Test 1: Prompt includes site plan section
test('A1 prompt includes site plan section', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('site plan') && !prompt.includes('location plan')) {
    throw new Error('Prompt missing site plan section');
  }

  if (!prompt.includes('north arrow')) {
    throw new Error('Prompt missing north arrow requirement');
  }

  if (!prompt.includes('scale bar') && !prompt.includes('scale:')) {
    throw new Error('Prompt missing scale bar requirement');
  }
});

// Test 2: Prompt includes all four elevations
test('A1 prompt includes all four elevations', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('north elevation')) {
    throw new Error('Prompt missing north elevation');
  }

  if (!prompt.includes('south elevation')) {
    throw new Error('Prompt missing south elevation');
  }

  if (!prompt.includes('east elevation')) {
    throw new Error('Prompt missing east elevation');
  }

  if (!prompt.includes('west elevation')) {
    throw new Error('Prompt missing west elevation');
  }
});

// Test 3: Prompt includes both sections
test('A1 prompt includes both required sections', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('section a-a') && !prompt.includes('longitudinal section')) {
    throw new Error('Prompt missing Section A-A (longitudinal)');
  }

  if (!prompt.includes('section b-b') && !prompt.includes('transverse section')) {
    throw new Error('Prompt missing Section B-B (transverse)');
  }
});

// Test 4: Prompt includes floor plans
test('A1 prompt includes floor plans', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('ground floor plan')) {
    throw new Error('Prompt missing ground floor plan');
  }

  if (!prompt.includes('first floor') && !prompt.includes('upper floor')) {
    throw new Error('Prompt missing upper floor plan');
  }
});

// Test 5: Prompt includes 3D views
test('A1 prompt includes 3D views', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('3d') && !prompt.includes('perspective') && !prompt.includes('exterior')) {
    throw new Error('Prompt missing 3D views');
  }

  if (!prompt.includes('axonometric')) {
    throw new Error('Prompt missing axonometric view');
  }
});

// Test 6: Prompt includes title block
test('A1 prompt includes UK RIBA title block', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('title block')) {
    throw new Error('Prompt missing title block');
  }

  if (!prompt.includes('riba')) {
    throw new Error('Prompt missing RIBA reference');
  }

  if (!prompt.includes('arb') && !prompt.includes('architect')) {
    throw new Error('Prompt missing architect/ARB information');
  }
});

// Test 7: Prompt includes material palette
test('A1 prompt includes material palette', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('material') && !prompt.includes('materials')) {
    throw new Error('Prompt missing material palette');
  }

  if (!prompt.includes('hex') && !prompt.includes('color')) {
    throw new Error('Prompt missing color specifications');
  }
});

// Test 8: Prompt includes environmental data
test('A1 prompt includes environmental performance data', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('environmental') && !prompt.includes('climate') && !prompt.includes('sustainability')) {
    throw new Error('Prompt missing environmental performance');
  }
});

// Test 9: Negative prompt prevents placeholder aesthetics
test('Negative prompt prevents placeholder/grid aesthetics', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const negativePrompt = result.negativePrompt.toLowerCase();

  if (!negativePrompt.includes('grid') && !negativePrompt.includes('graph paper')) {
    throw new Error('Negative prompt missing grid/graph paper prevention');
  }

  if (!negativePrompt.includes('placeholder')) {
    throw new Error('Negative prompt missing placeholder prevention');
  }
});

// Test 10: Prompt enforces landscape orientation
test('A1 prompt enforces landscape orientation', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('landscape')) {
    throw new Error('Prompt missing landscape orientation requirement');
  }

  if (!prompt.includes('841') || !prompt.includes('594')) {
    throw new Error('Prompt missing A1 landscape dimensions (841×594mm)');
  }
});

// Test 11: Non-residential projects have appropriate restrictions
test('Non-residential projects include project type restrictions', () => {
  const clinicDNA = { ...mockMasterDNA };
  const clinicContext = {
    projectType: 'dental-clinic',
    buildingProgram: 'dental clinic'
  };

  const result = buildA1SheetPrompt({
    masterDNA: clinicDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: clinicContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('clinic') && !prompt.includes('dental')) {
    throw new Error('Clinic prompt missing project type specification');
  }

  // Should have restrictions against house features
  if (!prompt.includes('not a house') && !prompt.includes('not residential')) {
    throw new Error('Clinic prompt missing house prevention');
  }
});

// Test 12: Consistency rules are included
test('A1 prompt includes consistency rules', () => {
  const result = buildA1SheetPrompt({
    masterDNA: mockMasterDNA,
    location: mockLocation,
    climate: mockLocation.climate,
    projectContext: mockProjectContext
  });

  const prompt = result.prompt.toLowerCase();

  if (!prompt.includes('consistency') && !prompt.includes('consistent')) {
    throw new Error('Prompt missing consistency requirements');
  }

  if (!prompt.includes('same building')) {
    throw new Error('Prompt missing "same building" consistency rule');
  }
});

// Summary
console.log('\n📊 ========================================');
console.log('📊 TEST SUMMARY');
console.log('📊 ========================================');
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

if (failedTests === 0) {
  console.log('\n🎉 All A1 completeness tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
}

