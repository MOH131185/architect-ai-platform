/**
 * Browser Storage Diagnostic Script
 *
 * Paste this entire script into your browser console (F12 → Console tab)
 * to diagnose storage issues.
 */

(async function runStorageDiagnostic() {
  console.log('🔍 ========================================');
  console.log('🔍 BROWSER STORAGE DIAGNOSTIC');
  console.log('🔍 ========================================\n');

  // Test 1: Check if localStorage is available
  console.log('1️⃣ Checking localStorage availability...');
  if (typeof localStorage === 'undefined') {
    console.error('❌ localStorage is NOT available');
    console.error('   Possible causes:');
    console.error('   - Browser doesn\'t support localStorage');
    console.error('   - Storage is disabled in browser settings');
    return;
  }
  console.log('✅ localStorage is available');

  // Test 2: Check browser and mode
  console.log('\n2️⃣ Browser information...');
  console.log('   User Agent:', navigator.userAgent);
  console.log('   Cookies enabled:', navigator.cookieEnabled);
  console.log('   Storage available:', 'localStorage' in window);

  // Test 3: Try a simple write/read
  console.log('\n3️⃣ Testing simple storage write/read...');
  const testKey = 'diagnostic_test_' + Date.now();
  const testValue = { test: 'data', timestamp: Date.now() };

  try {
    localStorage.setItem(testKey, JSON.stringify(testValue));
    console.log('✅ Write succeeded');

    const retrieved = localStorage.getItem(testKey);
    if (retrieved) {
      console.log('✅ Read succeeded');
      localStorage.removeItem(testKey);
      console.log('✅ Delete succeeded');
    } else {
      console.error('❌ Read failed - value not found');
    }
  } catch (error) {
    console.error('❌ Storage operation failed:', error.name, '-', error.message);
    console.error('   Error type:', error.constructor.name);
    console.error('   Error code:', error.code);

    if (error.name === 'SecurityError') {
      console.error('\n🔒 SECURITY ERROR DETECTED');
      console.error('   Solutions:');
      console.error('   1. Check if you\'re in Private/Incognito mode');
      console.error('   2. Check browser settings → Privacy → Cookies and site data');
      console.error('   3. Try adding an exception for localhost in browser settings');
      console.error('   4. Try a different browser (Chrome, Firefox, Edge)');
    } else if (error.name === 'QuotaExceededError') {
      console.error('\n💾 QUOTA EXCEEDED ERROR');
      console.error('   Storage is full. Clear old data:');
      console.error('   - Run: localStorage.clear()');
      console.error('   - Or use CLEAR_DESIGN_HISTORY.html utility');
    }
  }

  // Test 4: Check existing storage usage
  console.log('\n4️⃣ Checking existing storage...');
  const allKeys = Object.keys(localStorage);
  const archiKeys = allKeys.filter(k => k.startsWith('archiAI_'));

  console.log('   Total localStorage keys:', allKeys.length);
  console.log('   ArchiAI keys:', archiKeys.length);

  if (archiKeys.length > 0) {
    console.log('   ArchiAI keys:', archiKeys);

    let totalSize = 0;
    archiKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length;
        console.log(`   - ${key}: ${(value.length / 1024).toFixed(2)} KB`);
      }
    });
    console.log('   Total ArchiAI storage:', (totalSize / 1024).toFixed(2), 'KB');
  }

  // Test 5: Check if storageManager module is available
  console.log('\n5️⃣ Checking storageManager module...');
  try {
    const storageModule = await import('./src/utils/storageManager.js');
    const storage = storageModule.default;

    console.log('✅ storageManager module loaded');

    // Run storage test
    console.log('\n   Running storageManager.testStorage()...');
    const testResult = storage.testStorage();
    console.log('   Test result:', testResult);

    // Show debug info
    console.log('\n   Running storageManager.debugStorage()...');
    storage.debugStorage();

  } catch (error) {
    console.error('❌ Failed to load storageManager:', error.message);
    console.error('   This is expected if you\'re not running from the app');
  }

  // Test 6: Test design history write
  console.log('\n6️⃣ Testing design history write...');
  const testDesignHistory = [
    {
      designId: 'test_design_1',
      masterDNA: { test: 'data' },
      seed: 12345,
      createdAt: new Date().toISOString()
    }
  ];

  try {
    const historyKey = 'archiAI_design_history_test';
    const serialized = JSON.stringify({
      _data: testDesignHistory,
      _timestamp: Date.now()
    });

    console.log('   Test data size:', (serialized.length / 1024).toFixed(2), 'KB');

    localStorage.setItem(historyKey, serialized);
    console.log('✅ Design history write succeeded');

    const retrieved = localStorage.getItem(historyKey);
    const parsed = JSON.parse(retrieved);

    if (parsed._data && Array.isArray(parsed._data) && parsed._data.length === 1) {
      console.log('✅ Design history read succeeded');
      console.log('   Retrieved:', parsed._data[0].designId);
    } else {
      console.error('❌ Design history structure incorrect');
      console.error('   Expected: { _data: [...], _timestamp: ... }');
      console.error('   Got:', parsed);
    }

    localStorage.removeItem(historyKey);
    console.log('✅ Cleanup succeeded');

  } catch (error) {
    console.error('❌ Design history test failed:', error.name, '-', error.message);
    console.error('   Full error:', error);
  }

  // Test 7: Check storage estimate (if available)
  console.log('\n7️⃣ Storage estimate (if available)...');
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      console.log('   Quota:', (estimate.quota / 1024 / 1024).toFixed(2), 'MB');
      console.log('   Usage:', (estimate.usage / 1024 / 1024).toFixed(2), 'MB');
      console.log('   Available:', ((estimate.quota - estimate.usage) / 1024 / 1024).toFixed(2), 'MB');
      console.log('   Usage %:', ((estimate.usage / estimate.quota) * 100).toFixed(2), '%');
    } catch (error) {
      console.log('   Not available:', error.message);
    }
  } else {
    console.log('   Storage estimate API not available in this browser');
  }

  // Summary
  console.log('\n🔍 ========================================');
  console.log('🔍 DIAGNOSTIC COMPLETE');
  console.log('🔍 ========================================');
  console.log('\nIf storage tests passed but modification still fails:');
  console.log('1. Check Network tab for API errors');
  console.log('2. Look for JavaScript errors in Console');
  console.log('3. Try clearing all storage: localStorage.clear()');
  console.log('4. Refresh page (F5) and try again');
  console.log('\nIf storage tests failed:');
  console.log('1. Follow the suggestions for the specific error above');
  console.log('2. Try a different browser');
  console.log('3. Check browser security/privacy settings');
  console.log('4. See STORAGE_TROUBLESHOOTING.md for detailed solutions');
})();
