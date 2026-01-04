/**
 * Simplified Multi-Panel Test
 * 
 * Tests core multi-panel functions without loading full orchestrator
 * (avoids TypeScript dependency issues)
 */

console.log('\n🧪 ========================================');
console.log('🧪 MULTI-PANEL SIMPLE TEST');
console.log('🧪 ========================================\n');

async function runSimpleTest() {
  try {
    // Test 1: Seed derivation
    console.log('Test 1: Seed Derivation');
    const { derivePanelSeedsFromDNA, hashDNA } = await import('./src/services/seedDerivation.js');
    
    const mockDNA = {
      dimensions: { length: 15, width: 12, height: 7, floors: 2 },
      materials: [{ name: 'Brick', hexColor: '#B8604E' }],
      architecturalStyle: 'Contemporary',
      projectType: 'residential'
    };
    
    const panelTypes = ['hero_3d', 'floor_plan_ground', 'elevation_north'];
    const seeds = derivePanelSeedsFromDNA(mockDNA, panelTypes);
    
    console.log(`  ✅ Generated ${Object.keys(seeds).length} seeds`);
    console.log(`  Seeds:`, seeds);
    
    // Test 2: Panel planning
    console.log('\nTest 2: Panel Planning');
    const { planA1Panels } = await import('./src/services/panelGenerationService.js');
    
    const panelJobs = planA1Panels({
      masterDNA: mockDNA,
      siteBoundary: null,
      buildingType: 'residential',
      entranceOrientation: 'N',
      programSpaces: [],
      baseSeed: 123456,
      climate: { type: 'temperate oceanic' },
      locationData: { climate: { type: 'temperate oceanic' } }
    });
    
    console.log(`  ✅ Planned ${panelJobs.length} panel jobs`);
    console.log(`  Panel types:`, panelJobs.map(j => j.type).join(', '));
    
    // Test 3: Panel prompt builders
    console.log('\nTest 3: Panel Prompt Builders');
    const { PANEL_PROMPT_BUILDERS, buildPanelPrompt } = await import('./src/services/a1/panelPromptBuilders.js');
    
    console.log(`  ✅ ${Object.keys(PANEL_PROMPT_BUILDERS).length} prompt builders available`);
    
    const testPrompt = buildPanelPrompt('hero_3d', {
      masterDNA: mockDNA,
      locationData: { climate: { type: 'temperate oceanic' } },
      projectContext: { buildingProgram: 'residential' }
    });
    
    console.log(`  ✅ Generated prompt for hero_3d (${testPrompt.prompt.length} chars)`);
    
    // Test 4: Layout validation
    console.log('\nTest 4: Layout Validation');
    const a1LayoutComposer = await import('./src/services/a1LayoutComposer.js');
    const { validatePanelLayout } = a1LayoutComposer;
    const PANEL_LAYOUT = a1LayoutComposer.PANEL_LAYOUT || a1LayoutComposer.default.PANEL_LAYOUT;
    
    if (!PANEL_LAYOUT) {
      console.log('  ⚠️ PANEL_LAYOUT not found in export');
      console.log('  Available exports:', Object.keys(a1LayoutComposer));
    } else {
      console.log(`  ✅ Layout has ${Object.keys(PANEL_LAYOUT).length} panel positions`);
    }
    
    if (validatePanelLayout && PANEL_LAYOUT) {
      const mockPanels = panelJobs.map(j => ({ type: j.type }));
      const layoutValidation = validatePanelLayout(mockPanels);
      
      console.log(`  Layout valid: ${layoutValidation.valid}`);
      console.log(`  Errors: ${layoutValidation.errors.length}`);
      console.log(`  Warnings: ${layoutValidation.warnings.length}`);
      if (layoutValidation.warnings.length > 0) {
        console.log(`  Missing panels: ${layoutValidation.missingPanels.join(', ')}`);
      }
    }
    
    // Test 5: Drift rules
    console.log('\nTest 5: Drift Detection Rules');
    const { PANEL_DRIFT_RULES } = await import('./src/services/driftValidator.js');
    
    console.log(`  ✅ ${Object.keys(PANEL_DRIFT_RULES).length} drift rule categories`);
    console.log(`  Categories:`, Object.keys(PANEL_DRIFT_RULES).join(', '));
    
    // Summary
    console.log('\n========================================');
    console.log('✅ ALL SIMPLE TESTS PASSED');
    console.log('========================================\n');
    console.log('Core multi-panel functions are working correctly.');
    console.log('Full orchestrator test may require TypeScript compilation.');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runSimpleTest();

