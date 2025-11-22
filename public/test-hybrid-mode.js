// Test script to verify Hybrid A1 Mode configuration
// Run this in the browser console to check the current state

console.log('=== Hybrid A1 Mode Diagnostic ===');

// 1. Check if featureFlags module is loaded
try {
    const { FEATURE_FLAGS, isFeatureEnabled } = await import('./src/config/featureFlags.js');

    console.log('\n1. Feature Flags Module:');
    console.log('   FEATURE_FLAGS.hybridA1Mode:', FEATURE_FLAGS.hybridA1Mode);
    console.log('   isFeatureEnabled("hybridA1Mode"):', isFeatureEnabled('hybridA1Mode'));

    // 2. Check sessionStorage
    console.log('\n2. SessionStorage:');
    const stored = sessionStorage.getItem('featureFlags');
    console.log('   Raw value:', stored);
    if (stored) {
        const parsed = JSON.parse(stored);
        console.log('   Parsed:', parsed);
        console.log('   hybridA1Mode in storage:', parsed.hybridA1Mode);
    }

    // 3. Force enable if needed
    if (!isFeatureEnabled('hybridA1Mode')) {
        console.log('\n3. ❌ Hybrid mode is DISABLED. Enabling now...');
        sessionStorage.removeItem('featureFlags');
        FEATURE_FLAGS.hybridA1Mode = true;
        sessionStorage.setItem('featureFlags', JSON.stringify({ hybridA1Mode: true }));
        console.log('   ✅ Hybrid mode enabled. Reload the page.');
    } else {
        console.log('\n3. ✅ Hybrid mode is ENABLED');
    }

    // 4. Check orchestrator
    console.log('\n4. Checking orchestrator...');
    const { default: orchestrator } = await import('./src/services/dnaWorkflowOrchestrator.js');
    console.log('   Orchestrator loaded:', !!orchestrator);
    console.log('   runHybridA1Workflow exists:', typeof orchestrator.runHybridA1Workflow === 'function');

    console.log('\n=== Diagnostic Complete ===');
    console.log('If Hybrid mode is enabled, your next generation will use panel-based workflow.');

} catch (error) {
    console.error('❌ Error during diagnostic:', error);
}
