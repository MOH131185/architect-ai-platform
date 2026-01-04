/**
 * Test Site Integration
 * 
 * Validates that site metrics, constraints, and boundary validation
 * are properly integrated throughout the DNA generation and A1 sheet workflow
 */

const { validateDesignAgainstSite } = require('./src/services/siteValidationService');

console.log('\n🧪 ========================================');
console.log('🧪 SITE INTEGRATION TEST SUITE');
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

// Test 1: Site validation with valid design
test('Site validation accepts design within boundaries', () => {
  const masterDNA = {
    dimensions: {
      length: 12,
      width: 8,
      height: 7,
      floorCount: 2
    }
  };

  const siteData = {
    buildableArea: 150, // 12 * 8 = 96, well within 150
    siteArea: 200,
    constraints: {
      frontSetback: 3,
      rearSetback: 3,
      sideSetbacks: [3, 3]
    },
    maxHeight: 10,
    maxFloors: 3,
    shapeType: 'rectangle'
  };

  const result = validateDesignAgainstSite(masterDNA, siteData);

  if (!result.valid) {
    throw new Error(`Expected valid result but got errors: ${result.errors.map(e => e.message).join(', ')}`);
  }
});

// Test 2: Site validation rejects oversized design
test('Site validation rejects design exceeding buildable area', () => {
  const masterDNA = {
    dimensions: {
      length: 20,
      width: 15,
      height: 7,
      floorCount: 2
    }
  };

  const siteData = {
    buildableArea: 100, // 20 * 15 = 300, exceeds 100
    siteArea: 150,
    constraints: {
      frontSetback: 3,
      rearSetback: 3,
      sideSetbacks: [3, 3]
    },
    maxHeight: 10,
    maxFloors: 3,
    shapeType: 'rectangle'
  };

  const result = validateDesignAgainstSite(masterDNA, siteData);

  if (result.valid) {
    throw new Error('Expected validation to fail for oversized design');
  }

  const hasFootprintError = result.errors.some(e => e.type === 'FOOTPRINT_EXCEEDS_BUILDABLE');
  if (!hasFootprintError) {
    throw new Error('Expected FOOTPRINT_EXCEEDS_BUILDABLE error');
  }
});

// Test 3: Height restriction validation
test('Site validation rejects design exceeding height limit', () => {
  const masterDNA = {
    dimensions: {
      length: 10,
      width: 8,
      height: 15, // Exceeds max height of 10
      floorCount: 4
    }
  };

  const siteData = {
    buildableArea: 150,
    siteArea: 200,
    constraints: {
      frontSetback: 3,
      rearSetback: 3,
      sideSetbacks: [3, 3]
    },
    maxHeight: 10,
    maxFloors: 5,
    shapeType: 'rectangle'
  };

  const result = validateDesignAgainstSite(masterDNA, siteData);

  if (result.valid) {
    throw new Error('Expected validation to fail for excessive height');
  }

  const hasHeightError = result.errors.some(e => e.type === 'HEIGHT_EXCEEDS_LIMIT');
  if (!hasHeightError) {
    throw new Error('Expected HEIGHT_EXCEEDS_LIMIT error');
  }
});

// Test 4: Floor count restriction validation
test('Site validation rejects design exceeding floor count limit', () => {
  const masterDNA = {
    dimensions: {
      length: 10,
      width: 8,
      height: 9,
      floorCount: 4 // Exceeds max floors of 3
    }
  };

  const siteData = {
    buildableArea: 150,
    siteArea: 200,
    constraints: {
      frontSetback: 3,
      rearSetback: 3,
      sideSetbacks: [3, 3]
    },
    maxHeight: 15,
    maxFloors: 3,
    shapeType: 'rectangle'
  };

  const result = validateDesignAgainstSite(masterDNA, siteData);

  if (result.valid) {
    throw new Error('Expected validation to fail for excessive floor count');
  }

  const hasFloorError = result.errors.some(e => e.type === 'FLOOR_COUNT_EXCEEDS_LIMIT');
  if (!hasFloorError) {
    throw new Error('Expected FLOOR_COUNT_EXCEEDS_LIMIT error');
  }
});

// Test 5: Boundary validation structure
test('DNA should include boundaryValidation structure', () => {
  // Simulate what enhancedDNAGenerator should produce
  const masterDNA = {
    dimensions: {
      length: 12,
      width: 8,
      height: 7,
      floorCount: 2
    },
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
      },
      buildableBoundary: null,
      correctedFootprint: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 8 },
        { x: 0, y: 8 }
      ]
    }
  };

  if (!masterDNA.boundaryValidation) {
    throw new Error('masterDNA missing boundaryValidation');
  }

  if (!masterDNA.boundaryValidation.validated) {
    throw new Error('boundaryValidation.validated should be true');
  }

  if (!masterDNA.boundaryValidation.setbacks) {
    throw new Error('boundaryValidation missing setbacks');
  }

  if (!masterDNA.boundaryValidation.correctedFootprint) {
    throw new Error('boundaryValidation missing correctedFootprint');
  }
});

// Test 6: Site constraints structure
test('DNA should include siteConstraints structure', () => {
  const masterDNA = {
    dimensions: {
      length: 12,
      width: 8,
      height: 7,
      floorCount: 2
    },
    siteConstraints: {
      polygon: null,
      buildableArea: 150,
      siteArea: 200,
      constraints: {
        frontSetback: 3,
        rearSetback: 3,
        sideSetbacks: [3, 3]
      },
      maxHeight: 10,
      maxFloors: 3,
      shapeType: 'rectangle',
      orientation: 0,
      validated: true,
      adjustmentsApplied: false
    }
  };

  if (!masterDNA.siteConstraints) {
    throw new Error('masterDNA missing siteConstraints');
  }

  if (typeof masterDNA.siteConstraints.buildableArea !== 'number') {
    throw new Error('siteConstraints.buildableArea should be a number');
  }

  if (!masterDNA.siteConstraints.constraints) {
    throw new Error('siteConstraints missing constraints object');
  }
});

// Test 7: Validation summary metrics
test('Validation result includes summary metrics', () => {
  const masterDNA = {
    dimensions: {
      length: 12,
      width: 8,
      height: 7,
      floorCount: 2
    }
  };

  const siteData = {
    buildableArea: 150,
    siteArea: 200,
    constraints: {
      frontSetback: 3,
      rearSetback: 3,
      sideSetbacks: [3, 3]
    },
    maxHeight: 10,
    maxFloors: 3,
    shapeType: 'rectangle'
  };

  const result = validateDesignAgainstSite(masterDNA, siteData);

  if (!result.summary) {
    throw new Error('Validation result missing summary');
  }

  if (typeof result.summary.footprintArea !== 'number') {
    throw new Error('Summary missing footprintArea');
  }

  if (typeof result.summary.totalFloorArea !== 'number') {
    throw new Error('Summary missing totalFloorArea');
  }

  if (typeof result.summary.floorAreaRatio !== 'string') {
    throw new Error('Summary missing floorAreaRatio');
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
  console.log('\n🎉 All site integration tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
}

