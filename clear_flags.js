// Quick Fix Script - Run this in Browser Console
// This will clear the cached feature flags and force hybrid mode

// 1. Clear old feature flags from sessionStorage
sessionStorage.removeItem('featureFlags');

// 2. Force-enable Hybrid A1 Mode
const { setFeatureFlag } = await import('./src/config/featureFlags.js');
setFeatureFlag('hybridA1Mode', true);

// 3. Verify it's enabled
const { isFeatureEnabled } = await import('./src/config/featureFlags.js');
console.log('Hybrid A1 Mode enabled:', isFeatureEnabled('hybridA1Mode'));

// 4. Reload the page
location.reload();
