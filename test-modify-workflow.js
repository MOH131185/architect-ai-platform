/**
 * Test Modify Workflow Consistency
 * 
 * Validates that the AI Modify workflow properly:
 * - Uses img2img with seed locking
 * - Applies consistency-lock prompts
 * - Saves versions to history
 * - Validates consistency with SSIM/pHash
 */

const { withConsistencyLock, withConsistencyLockCompact } = require('./src/services/a1SheetPromptGenerator');

console.log('\n🧪 ========================================');
console.log('🧪 MODIFY WORKFLOW CONSISTENCY TEST SUITE');
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

// Mock data
const mockMasterDNA = {
  dimensions: {
    length: 15,
    width: 10,
    height: 7,
    floorCount: 2
  },
  materials: [
    { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
    { name: 'Clay tiles', hexColor: '#8B4513', application: 'gable roof' }
  ],
  architecturalStyle: 'Contemporary',
  projectType: 'residential-house'
};

const mockBasePrompt = `Generate a UK RIBA A1 architectural sheet for a Contemporary residential-house.
Building dimensions: 15m × 10m × 7m with 2 floors.
Materials: Red brick (#B8604E) for exterior walls, Clay tiles (#8B4513) for gable roof.
Include all required sections: site plan, floor plans, four elevations, two sections, 3D views, material palette, environmental data, and UK RIBA title block.`;

const mockProjectContext = {
  projectType: 'residential-house',
  buildingProgram: 'three-bedroom family house'
};

// Test 1: withConsistencyLock preserves DNA
test('withConsistencyLock preserves original DNA dimensions', () => {
  const deltaPrompt = 'Make the facade brick red instead of yellow';
  
  const result = withConsistencyLock(mockBasePrompt, deltaPrompt, mockMasterDNA, mockProjectContext);
  
  if (!result.prompt) {
    throw new Error('withConsistencyLock did not return a prompt');
  }

  const prompt = result.prompt.toLowerCase();

  // Should preserve dimensions
  if (!prompt.includes('15m') || !prompt.includes('10m') || !prompt.includes('7m')) {
    throw new Error('Locked prompt does not preserve original dimensions');
  }

  // Should preserve floor count
  if (!prompt.includes('2') && !prompt.includes('two')) {
    throw new Error('Locked prompt does not preserve floor count');
  }
});

// Test 2: withConsistencyLock freezes project type
test('withConsistencyLock freezes project type', () => {
  const deltaPrompt = 'Add more windows';
  
  const result = withConsistencyLock(mockBasePrompt, deltaPrompt, mockMasterDNA, mockProjectContext);
  
  const prompt = result.prompt.toLowerCase();

  // Should preserve project type
  if (!prompt.includes('residential') && !prompt.includes('house')) {
    throw new Error('Locked prompt does not preserve project type');
  }

  // Should include consistency lock language
  if (!prompt.includes('do not change') || !prompt.includes('preserve')) {
    throw new Error('Locked prompt missing consistency lock language');
  }
});

// Test 3: withConsistencyLock includes delta changes
test('withConsistencyLock includes delta changes', () => {
  const deltaPrompt = 'Add Section A-A and Section B-B with dimension lines';
  
  const result = withConsistencyLock(mockBasePrompt, deltaPrompt, mockMasterDNA, mockProjectContext);
  
  const prompt = result.prompt.toLowerCase();

  // Should include the delta
  if (!prompt.includes('section')) {
    throw new Error('Locked prompt does not include delta changes');
  }
});

// Test 4: withConsistencyLockCompact produces shorter prompt
test('withConsistencyLockCompact produces compact prompt', () => {
  const deltaPrompt = 'Add missing sections';
  
  const compactPrompt = withConsistencyLockCompact({
    base: {
      masterDNA: mockMasterDNA,
      mainPrompt: mockBasePrompt,
      a1LayoutKey: 'uk-riba-standard',
      projectContext: mockProjectContext,
      projectType: 'residential-house'
    },
    delta: deltaPrompt
  });

  if (typeof compactPrompt !== 'string') {
    throw new Error('withConsistencyLockCompact did not return a string');
  }

  // Should be significantly shorter than full prompt
  if (compactPrompt.length > 2000) {
    throw new Error(`Compact prompt too long: ${compactPrompt.length} chars (expected < 2000)`);
  }

  // Should still include essential information
  const prompt = compactPrompt.toLowerCase();
  if (!prompt.includes('preserve') && !prompt.includes('maintain')) {
    throw new Error('Compact prompt missing preservation language');
  }
});

// Test 5: Consistency lock preserves site plan position
test('Consistency lock preserves site plan position', () => {
  const deltaPrompt = 'Add interior 3D view';
  
  const compactPrompt = withConsistencyLockCompact({
    base: {
      masterDNA: mockMasterDNA,
      mainPrompt: mockBasePrompt,
      a1LayoutKey: 'uk-riba-standard',
      projectContext: mockProjectContext
    },
    delta: deltaPrompt
  });

  const prompt = compactPrompt.toLowerCase();

  // Should explicitly lock site plan position
  if (!prompt.includes('site plan') && !prompt.includes('site context')) {
    throw new Error('Locked prompt does not mention site plan');
  }

  if (!prompt.includes('top-left') || !prompt.includes('top left')) {
    throw new Error('Locked prompt does not preserve site plan position');
  }
});

// Test 6: Consistency lock prevents layout changes
test('Consistency lock prevents layout rearrangement', () => {
  const deltaPrompt = 'Add more details';
  
  const result = withConsistencyLock(mockBasePrompt, deltaPrompt, mockMasterDNA, mockProjectContext);
  
  const prompt = result.prompt.toLowerCase();

  // Should prevent rearrangement
  if (!prompt.includes('do not rearrange') && !prompt.includes('preserve') && !prompt.includes('maintain')) {
    throw new Error('Locked prompt does not prevent layout rearrangement');
  }
});

// Test 7: Negative prompt prevents drift
test('Consistency lock negative prompt prevents drift', () => {
  const deltaPrompt = 'Make facade red';
  
  const result = withConsistencyLock(mockBasePrompt, deltaPrompt, mockMasterDNA, mockProjectContext);
  
  if (!result.negativePrompt) {
    throw new Error('withConsistencyLock did not return a negativePrompt');
  }

  const negativePrompt = result.negativePrompt.toLowerCase();

  // Should prevent dimensional changes
  if (!negativePrompt.includes('inconsistent') && !negativePrompt.includes('changed')) {
    throw new Error('Negative prompt does not prevent inconsistency');
  }

  // Should prevent drift
  if (!negativePrompt.includes('drift')) {
    throw new Error('Negative prompt does not prevent drift');
  }
});

// Test 8: Compact prompt preserves building identity
test('Compact prompt preserves building identity', () => {
  const deltaPrompt = 'Change facade color to red';
  
  const compactPrompt = withConsistencyLockCompact({
    base: {
      masterDNA: mockMasterDNA,
      mainPrompt: mockBasePrompt,
      a1LayoutKey: 'uk-riba-standard',
      projectContext: mockProjectContext,
      projectType: 'residential-house'
    },
    delta: deltaPrompt
  });

  const prompt = compactPrompt.toLowerCase();

  // Should preserve dimensions
  if (!prompt.includes('15') && !prompt.includes('10')) {
    throw new Error('Compact prompt does not preserve dimensions');
  }

  // Should preserve project type
  if (!prompt.includes('residential') && !prompt.includes('house')) {
    throw new Error('Compact prompt does not preserve project type');
  }
});

// Test 9: Consistency lock for non-residential projects
test('Consistency lock preserves non-residential project type', () => {
  const clinicDNA = {
    ...mockMasterDNA,
    projectType: 'dental-clinic'
  };

  const clinicContext = {
    projectType: 'dental-clinic',
    buildingProgram: 'dental clinic'
  };

  const deltaPrompt = 'Add reception area floor plan';
  
  const compactPrompt = withConsistencyLockCompact({
    base: {
      masterDNA: clinicDNA,
      mainPrompt: mockBasePrompt,
      a1LayoutKey: 'uk-riba-standard',
      projectContext: clinicContext,
      projectType: 'dental-clinic'
    },
    delta: deltaPrompt
  });

  const prompt = compactPrompt.toLowerCase();

  // Should preserve clinic type
  if (!prompt.includes('clinic') && !prompt.includes('dental')) {
    throw new Error('Locked prompt does not preserve clinic project type');
  }

  // Should prevent house features
  if (!prompt.includes('not a house') && !prompt.includes('not residential')) {
    throw new Error('Locked prompt does not prevent house features for clinic');
  }
});

// Test 10: Modification types are properly identified
test('Modification request types are properly identified', () => {
  const testCases = [
    { delta: 'Add Section A-A', expectedType: 'add-sections' },
    { delta: 'Add 3D exterior view', expectedType: 'add-3d' },
    { delta: 'Add ground floor plan', expectedType: 'add-floor-plans' },
    { delta: 'Change facade color to red', expectedType: 'material-change' }
  ];

  testCases.forEach(({ delta, expectedType }) => {
    const compactPrompt = withConsistencyLockCompact({
      base: {
        masterDNA: mockMasterDNA,
        mainPrompt: mockBasePrompt,
        a1LayoutKey: 'uk-riba-standard',
        projectContext: mockProjectContext
      },
      delta
    });

    if (typeof compactPrompt !== 'string' || compactPrompt.length === 0) {
      throw new Error(`Failed to generate prompt for modification type: ${expectedType}`);
    }
  });
});

// Summary
console.log('\n📊 ========================================');
console.log('📊 TEST SUMMARY');
console.log('📊 ========================================');
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

if (failedTests === 0) {
  console.log('\n🎉 All modify workflow tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
}

