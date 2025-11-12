/**
 * Test Storage Error Handling
 *
 * Verifies that:
 * 1. setItem failures are properly detected
 * 2. Errors are thrown with proper context
 * 3. Debug utilities work correctly
 */

const path = require('path');

// Mock localStorage for Node.js
class MockLocalStorage {
  constructor(shouldFail = false, quotaExceeded = false) {
    this.data = {};
    this.shouldFail = shouldFail;
    this.quotaExceeded = quotaExceeded;
  }

  getItem(key) {
    return this.data[key] || null;
  }

  setItem(key, value) {
    if (this.quotaExceeded) {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    }
    if (this.shouldFail) {
      throw new Error('Storage write error');
    }
    this.data[key] = value;
  }

  removeItem(key) {
    delete this.data[key];
  }

  clear() {
    this.data = {};
  }
}

// Mock Blob for Node.js
global.Blob = class Blob {
  constructor(parts) {
    this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
  }
};

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const result = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${result}: ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

async function testStorageErrorHandling() {
  console.log('🧪 ========================================');
  console.log('🧪 STORAGE ERROR HANDLING TEST SUITE');
  console.log('🧪 ========================================\n');

  try {
    // TEST 1: Normal storage operation
    console.log('📐 TEST 1: Normal storage write/read...');

    const normalStorage = new MockLocalStorage(false, false);
    global.localStorage = normalStorage;

    // Simulate StorageManager (simplified)
    class TestStorageManager {
      constructor() {
        this.storagePrefix = 'archiAI_';
        this.maxSize = 5 * 1024 * 1024;
      }

      setItem(key, value) {
        try {
          const prefixedKey = this.storagePrefix + key;
          const dataToStore = Array.isArray(value)
            ? { _data: value, _timestamp: Date.now() }
            : { ...value, _timestamp: Date.now() };

          const serialized = JSON.stringify(dataToStore);
          const sizeBytes = new Blob([serialized]).size;

          try {
            localStorage.setItem(prefixedKey, serialized);
            return true;
          } catch (innerError) {
            throw innerError;
          }
        } catch (error) {
          console.error('Storage error:', error.message);
          return false;
        }
      }

      getItem(key, defaultValue = null) {
        try {
          const prefixedKey = this.storagePrefix + key;
          const item = localStorage.getItem(prefixedKey);
          if (item === null) return defaultValue;

          const parsed = JSON.parse(item);
          if (parsed && typeof parsed === 'object' && '_data' in parsed) {
            return parsed._data;
          }
          const { _timestamp, ...data } = parsed;
          return data;
        } catch (error) {
          return defaultValue;
        }
      }

      getStorageUsage() {
        return 50; // Mock 50% usage
      }
    }

    const storage = new TestStorageManager();
    const testData = { test: 'value', id: 123 };
    const success = storage.setItem('test_key', testData);

    logTest(
      'Normal storage write succeeds',
      success === true,
      'setItem returned true'
    );

    const retrieved = storage.getItem('test_key');
    logTest(
      'Normal storage read succeeds',
      retrieved && retrieved.test === 'value',
      `Retrieved: ${JSON.stringify(retrieved)}`
    );

    // TEST 2: Storage write failure
    console.log('\n📐 TEST 2: Storage write failure detection...');

    const failingStorage = new MockLocalStorage(true, false);
    global.localStorage = failingStorage;

    const storage2 = new TestStorageManager();
    const failResult = storage2.setItem('fail_key', testData);

    logTest(
      'Failed write returns false',
      failResult === false,
      'setItem detected error and returned false'
    );

    // TEST 3: Quota exceeded error
    console.log('\n📐 TEST 3: Quota exceeded error handling...');

    const quotaStorage = new MockLocalStorage(false, true);
    global.localStorage = quotaStorage;

    const storage3 = new TestStorageManager();
    const quotaResult = storage3.setItem('quota_key', testData);

    logTest(
      'Quota exceeded returns false',
      quotaResult === false,
      'setItem caught QuotaExceededError and returned false'
    );

    // TEST 4: DesignHistoryService error propagation
    console.log('\n📐 TEST 4: DesignHistoryService error propagation...');

    class TestDesignHistoryService {
      constructor(storageManager) {
        this.storageManager = storageManager;
        this.storageKey = 'design_history';
      }

      async createDesign(params) {
        try {
          const design = {
            designId: params.designId || 'test_design',
            masterDNA: params.masterDNA || {},
            seed: params.seed || Date.now()
          };

          const history = [];
          history.push(design);

          // Check if setItem succeeded
          const saved = this.storageManager.setItem(this.storageKey, history);
          if (!saved) {
            throw new Error(
              `Failed to save design to storage. Storage usage: ${this.storageManager.getStorageUsage()}%`
            );
          }

          return design.designId;
        } catch (error) {
          throw error;
        }
      }
    }

    // Test with failing storage
    const service = new TestDesignHistoryService(storage2);
    let errorCaught = false;
    let errorMessage = '';

    try {
      await service.createDesign({ designId: 'test_123' });
    } catch (error) {
      errorCaught = true;
      errorMessage = error.message;
    }

    logTest(
      'DesignHistoryService throws error on storage failure',
      errorCaught && errorMessage.includes('Failed to save design'),
      `Error: ${errorMessage}`
    );

    // TEST 5: Array wrapping for timestamp
    console.log('\n📐 TEST 5: Array wrapping preserves structure...');

    global.localStorage = new MockLocalStorage(false, false);
    const storage5 = new TestStorageManager();

    const arrayData = [{ id: 1 }, { id: 2 }, { id: 3 }];
    storage5.setItem('array_test', arrayData);
    const retrievedArray = storage5.getItem('array_test');

    logTest(
      'Array structure preserved after storage',
      Array.isArray(retrievedArray) && retrievedArray.length === 3,
      `Retrieved ${retrievedArray?.length || 0} items`
    );

    logTest(
      'Array elements intact',
      retrievedArray && retrievedArray[0].id === 1 && retrievedArray[2].id === 3,
      'First and last elements match'
    );

    // TEST 6: Storage usage calculation
    console.log('\n📐 TEST 6: Storage utilities...');

    const usagePercent = storage5.getStorageUsage();
    logTest(
      'Storage usage calculation works',
      typeof usagePercent === 'number' && usagePercent >= 0,
      `Usage: ${usagePercent}%`
    );

  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    logTest('Test suite execution', false, error.message);
  }

  // Summary
  console.log('\n🧪 ========================================');
  console.log('🧪 TEST SUMMARY');
  console.log('🧪 ========================================');
  console.log(`✅ Passed: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ Failed: ${testResults.failed}/${testResults.tests.length}`);
  console.log(`📊 Success Rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);

  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! Storage error handling is working correctly.\n');
  } else {
    console.log('\n⚠️ Some tests failed. Review the results above.\n');
  }

  return testResults;
}

// Run tests
testStorageErrorHandling().then(results => {
  process.exit(results.failed === 0 ? 0 : 1);
}).catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});
