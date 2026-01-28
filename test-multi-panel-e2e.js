/**
 * Multi-Panel A1 End-to-End Test
 * 
 * Tests the complete multi-panel workflow with mocked Together AI and composition.
 * Validates:
 * - 12-14 panels are generated (depends on floor count)
 * - Each panel has unique seed
 * - Composition API is called
 * - Baseline bundle stores all panels and seeds
 * - Response shape matches expectations
 */

// Mock environment for Node.js execution
if (typeof process !== 'undefined' && process.env) {
  process.env.NODE_ENV = 'test';
}

import { getRequiredPanels } from './src/services/a1/a1LayoutConstants.js';

// ============================================================================
// Mock Services
// ============================================================================

/**
 * Generate a colored rectangle as base64 PNG
 */
function generateColoredRectangle(seed, width = 100, height = 100) {
  // Simple colored rectangle based on seed
  const color = `#${((seed * 123456) % 0xFFFFFF).toString(16).padStart(6, '0')}`;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${color}"/>
    <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="14">Seed: ${seed}</text>
  </svg>`;
  return Buffer.from(svg).toString('base64');
}

/**
 * Mock Together AI Service
 */
const mockTogetherAI = {
  generateArchitecturalImage: async (params) => {
    const { seed, width, height, viewType } = params;
    console.log(`  [Mock] Generating ${viewType} with seed ${seed}`);
    
    return {
      url: `data:image/png;base64,${generateColoredRectangle(seed, width, height)}`,
      seedUsed: seed,
      metadata: { width, height, model: 'FLUX.1-dev' }
    };
  }
};

/**
 * Mock Composition Client
 */
const mockComposeClient = async (url, options) => {
  const body = JSON.parse(options.body);
  console.log(`  [Mock] Composing ${body.panels.length} panels`);
  
  // Generate mock coordinates for all panels
  const coordinates = {};
  body.panels.forEach((panel, i) => {
    coordinates[panel.type] = {
      x: (i % 4) * 400,
      y: Math.floor(i / 4) * 300,
      width: 400,
      height: 300
    };
  });
  
  return {
    ok: true,
    json: async () => ({
      composedSheetUrl: `data:image/png;base64,${generateColoredRectangle(12345, 1792, 1269)}`,
      coordinates,
      metadata: {
        width: 1792,
        height: 1269,
        panelCount: body.panels.length,
        composedAt: new Date().toISOString()
      }
    })
  };
};

/**
 * Mock Baseline Artifact Store
 */
const mockBaselineStore = {
  savedBundles: [],
  saveBaselineArtifacts: async ({ designId, sheetId, bundle }) => {
    console.log(`  [Mock] Saving baseline for ${designId}/${sheetId}`);
    mockBaselineStore.savedBundles.push({ designId, sheetId, bundle });
    return `${designId}_${sheetId}_baseline`;
  },
  getLastBundle: () => {
    return mockBaselineStore.savedBundles[mockBaselineStore.savedBundles.length - 1];
  }
};

/**
 * Mock Design History Service
 */
const mockHistoryService = {
  savedDesigns: [],
  createDesign: async (params) => {
    console.log(`  [Mock] Saving design ${params.designId} to history`);
    mockHistoryService.savedDesigns.push(params);
    return params.designId;
  },
  getLastDesign: () => {
    return mockHistoryService.savedDesigns[mockHistoryService.savedDesigns.length - 1];
  }
};

/**
 * Mock DNA Generator
 */
const mockDNAGenerator = {
  generateMasterDesignDNA: async (projectContext, portfolioAnalysis, locationData) => {
    console.log('  [Mock] Generating Master DNA');
    return {
      success: true,
      masterDNA: {
        dimensions: {
          length: 15,
          width: 12,
          height: 7,
          floors: 2,
          floorHeights: [3.0, 3.0]
        },
        materials: [
          { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
          { name: 'Clay tiles', hexColor: '#8B4513', application: 'roof' },
          { name: 'Timber', hexColor: '#D2691E', application: 'windows' }
        ],
        architecturalStyle: 'Contemporary',
        projectType: 'residential',
        entranceDirection: 'N',
        rooms: [
          { name: 'Living Room', dimensions: '5.5m × 4.0m', floor: 'ground' }
        ]
      },
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Mock DNA Validator
 */
const mockDNAValidator = {
  validateDesignDNA: (dna) => {
    console.log('  [Mock] Validating DNA');
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  },
  autoFixDesignDNA: (dna) => {
    console.log('  [Mock] Auto-fixing DNA (no changes needed)');
    return null; // No fixes needed for mock
  }
};

/**
 * Mock Drift Validator
 */
const mockDriftValidator = {
  validatePanelConsistency: async (params) => ({
    valid: true,
    panelType: params.panelType,
    driftScore: 0.02,
    errors: [],
    warnings: []
  }),
  validateMultiPanelConsistency: (panels) => ({
    valid: true,
    consistencyScore: 0.98,
    validPanels: panels.length,
    totalPanels: panels.length,
    failedPanels: []
  })
};

// ============================================================================
// Test Execution
// ============================================================================

async function runTest() {
  console.log('\n🧪 ========================================');
  console.log('🧪 MULTI-PANEL A1 E2E TEST');
  console.log('🧪 ========================================\n');

  try {
    // Import orchestrator
    const { default: dnaWorkflowOrchestrator } = await import('./src/services/dnaWorkflowOrchestrator.js');

    // Test parameters
    const testParams = {
      locationData: {
        address: 'Test Street, Birmingham, UK',
        coordinates: { lat: 52.4862, lng: -1.8904 },
        climate: { type: 'temperate oceanic' }
      },
      projectContext: {
        buildingProgram: 'three-bedroom family house',
        floorArea: 150,
        floors: 2,
        programSpaces: [
          { name: 'Living Room', area: 30, level: 'ground' },
          { name: 'Kitchen', area: 20, level: 'ground' },
          { name: 'Master Bedroom', area: 25, level: 'first' }
        ]
      },
      portfolioFiles: [],
      siteSnapshot: null,
      baseSeed: 123456
    };

    // Test overrides with mocks
    const testOverrides = {
      useTwoPassDNA: false,
      panelDelayMs: 0,
      dnaGenerator: mockDNAGenerator,
      dnaValidator: mockDNAValidator,
      togetherAIService: mockTogetherAI,
      driftValidator: mockDriftValidator,
      baselineStore: mockBaselineStore,
      historyService: mockHistoryService,
      composeClient: mockComposeClient
    };

    console.log('📋 Running multi-panel workflow with mocks...\n');

    // Execute workflow
    const result = await dnaWorkflowOrchestrator.runMultiPanelA1Workflow(
      testParams,
      { overrides: testOverrides }
    );

    // ============================================================================
    // Assertions
    // ============================================================================

    console.log('\n✅ Workflow completed, running assertions...\n');

    let passedTests = 0;
    let failedTests = 0;

    // Test 1: Success flag
    if (result.success === true) {
      console.log('✅ Test 1: Workflow returned success=true');
      passedTests++;
    } else {
      console.log('❌ Test 1: Workflow failed or returned success=false');
      console.log('   Error:', result.error);
      failedTests++;
    }

    // Test 2: Correct number of panels generated (floor-count dependent)
    const floorCount = result.masterDNA?.dimensions?.floors || 2;
    const expectedPanelCount = getRequiredPanels(floorCount).length;
    if (result.panels && result.panels.length === expectedPanelCount) {
      console.log(`✅ Test 2: Generated ${result.panels.length} panels (expected ${expectedPanelCount})`);
      passedTests++;
    } else if (result.panels && result.panels.length >= expectedPanelCount - 1 && result.panels.length <= expectedPanelCount + 1) {
      console.log(`✅ Test 2: Generated ${result.panels.length} panels (acceptable range: ${expectedPanelCount - 1}-${expectedPanelCount + 1})`);
      passedTests++;
    } else {
      console.log(`❌ Test 2: Generated ${result.panels?.length || 0} panels (expected ${expectedPanelCount})`);
      failedTests++;
    }

    // Test 3: Each panel has unique seed
    const seeds = result.panels?.map(p => p.seed) || [];
    const uniqueSeeds = new Set(seeds);
    if (uniqueSeeds.size === seeds.length && seeds.length > 0) {
      console.log(`✅ Test 3: All ${seeds.length} panels have unique seeds`);
      passedTests++;
    } else {
      console.log(`❌ Test 3: Seed collision detected (${uniqueSeeds.size} unique / ${seeds.length} total)`);
      failedTests++;
    }

    // Test 4: Composition API was called
    if (result.composedSheetUrl && result.composedSheetUrl.startsWith('data:image')) {
      console.log('✅ Test 4: Composition API returned composed sheet URL');
      passedTests++;
    } else {
      console.log('❌ Test 4: No composed sheet URL in result');
      failedTests++;
    }

    // Test 5: Baseline bundle saved
    const lastBundle = mockBaselineStore.getLastBundle();
    if (lastBundle && lastBundle.bundle.panels) {
      const panelCount = Object.keys(lastBundle.bundle.panels).length;
      console.log(`✅ Test 5: Baseline bundle saved with ${panelCount} panel entries`);
      passedTests++;
    } else {
      console.log('❌ Test 5: Baseline bundle not saved or missing panels');
      failedTests++;
    }

    // Test 6: Panel seeds stored in baseline
    if (lastBundle && lastBundle.bundle.seeds && lastBundle.bundle.seeds.panelSeeds) {
      const seedCount = Object.keys(lastBundle.bundle.seeds.panelSeeds).length;
      console.log(`✅ Test 6: Baseline bundle has ${seedCount} panel seeds`);
      passedTests++;
    } else {
      console.log('❌ Test 6: Baseline bundle missing panel seeds');
      failedTests++;
    }

    // Test 7: Composed sheet metadata panel count
    if (result.metadata && result.metadata.panelCount === expectedPanelCount) {
      console.log(`✅ Test 7: Metadata shows ${result.metadata.panelCount} panels`);
      passedTests++;
    } else {
      console.log(`❌ Test 7: Metadata panel count ${result.metadata?.panelCount || 0} does not match expected ${expectedPanelCount}`);
      failedTests++;
    }

    // Test 8: Coordinates returned
    const coordCount = result.coordinates ? Object.keys(result.coordinates).length : 0;
    if (coordCount === expectedPanelCount) {
      console.log(`✅ Test 8: Coordinates returned for ${coordCount} panels`);
      passedTests++;
    } else {
      console.log(`❌ Test 8: Coordinates count ${coordCount} does not match expected ${expectedPanelCount}`);
      failedTests++;
    }

    // Test 9: Design saved to history
    const lastDesign = mockHistoryService.getLastDesign();
    if (lastDesign && lastDesign.panelMap) {
      const historyPanelCount = Object.keys(lastDesign.panelMap).length;
      console.log(`✅ Test 9: Design history saved with ${historyPanelCount} panels`);
      passedTests++;
    } else {
      console.log('❌ Test 9: Design history not saved or missing panelMap');
      failedTests++;
    }

    // Test 10: Consistency report
    if (result.consistencyReport && result.consistencyReport.consistencyScore >= 0.9) {
      console.log(`✅ Test 10: Consistency score ${(result.consistencyReport.consistencyScore * 100).toFixed(1)}%`);
      passedTests++;
    } else {
      console.log('❌ Test 10: Consistency report missing or low score');
      failedTests++;
    }

    // ============================================================================
    // Summary
    // ============================================================================

    console.log('\n========================================');
    console.log(`📊 TEST RESULTS: ${passedTests}/${passedTests + failedTests} passed`);
    console.log('========================================\n');

    if (failedTests === 0) {
      console.log('🎉 ALL TESTS PASSED - Multi-panel pipeline is fully functional!\n');
      process.exit(0);
    } else {
      console.log(`⚠️  ${failedTests} TEST(S) FAILED - See details above\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST EXECUTION FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run test (auto-execute)
runTest().catch(err => {
  console.error('❌ Unhandled test error:', err);
  process.exit(1);
});

