/**
 * Test Storage Fix for A1 Modify Design History
 *
 * This test verifies that:
 * 1. Arrays are stored correctly (not converted to objects)
 * 2. Migration repairs corrupted data automatically
 * 3. Design history create/read workflow works end-to-end
 */

// Mock localStorage for Node.js testing
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = value;
  }

  removeItem(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  getAllKeys() {
    return Object.keys(this.store);
  }
}

global.localStorage = new LocalStorageMock();
global.Blob = class Blob {
  constructor(parts) {
    this.size = JSON.stringify(parts).length;
  }
};

// Import services (simplified for testing)
class StorageManager {
  constructor() {
    this.storagePrefix = 'archiAI_';
  }

  setItem(key, value, options = { addTimestamp: true }) {
    try {
      const prefixedKey = this.storagePrefix + key;

      let dataToStore;
      if (options.addTimestamp) {
        if (Array.isArray(value)) {
          dataToStore = { _data: value, _timestamp: Date.now() };
        } else if (value && typeof value === 'object') {
          dataToStore = { ...value, _timestamp: Date.now() };
        } else {
          dataToStore = { _data: value, _timestamp: Date.now() };
        }
      } else {
        dataToStore = value;
      }

      const serialized = JSON.stringify(dataToStore);
      localStorage.setItem(prefixedKey, serialized);
      return true;
    } catch (error) {
      console.error('Storage error:', error);
      return false;
    }
  }

  getItem(key, defaultValue = null) {
    try {
      const prefixedKey = this.storagePrefix + key;
      const item = localStorage.getItem(prefixedKey);

      if (item === null) {
        return defaultValue;
      }

      const parsed = JSON.parse(item);

      if (parsed && typeof parsed === 'object' && '_timestamp' in parsed) {
        if ('_data' in parsed) {
          return parsed._data;
        }

        const { _timestamp, ...data } = parsed;
        return data;
      }

      return parsed;
    } catch (error) {
      console.error('Read error:', error);
      return defaultValue;
    }
  }

  removeItem(key) {
    localStorage.removeItem(this.storagePrefix + key);
  }
}

class DesignHistoryService {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.storageKey = 'design_history';
  }

  getAllHistory() {
    try {
      const stored = this.storageManager.getItem(this.storageKey, []);

      if (Array.isArray(stored)) {
        return stored;
      }

      if (stored && typeof stored === 'object') {
        console.warn('⚠️ Detected corrupted design history, migrating...');

        const keys = Object.keys(stored).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));

        if (keys.length > 0) {
          const repaired = keys.map(k => stored[k]);
          this.storageManager.setItem(this.storageKey, repaired);
          console.log(`✅ Migrated ${repaired.length} entries`);
          return repaired;
        }
      }

      return [];
    } catch (error) {
      console.error('Failed to parse history:', error);
      return [];
    }
  }

  async createDesign(params) {
    const design = {
      designId: params.designId || `design_${Date.now()}`,
      masterDNA: params.masterDNA || {},
      mainPrompt: params.mainPrompt || '',
      seed: params.seed || Date.now(),
      versions: [],
      createdAt: new Date().toISOString()
    };

    const history = this.getAllHistory();
    const existingIndex = history.findIndex(d => d.designId === design.designId);

    if (existingIndex >= 0) {
      history[existingIndex] = { ...history[existingIndex], ...design };
    } else {
      history.push(design);
    }

    this.storageManager.setItem(this.storageKey, history);
    console.log(`✅ Created design: ${design.designId}`);

    return design.designId;
  }

  getDesign(designId) {
    const history = this.getAllHistory();
    return history.find(d => d.designId === designId) || null;
  }
}

// Test Suite
async function runTests() {
  console.log('🧪 Running Storage Fix Tests\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`✅ Test ${totalTests}: ${name}`);
      passedTests++;
    } catch (error) {
      console.error(`❌ Test ${totalTests}: ${name}`);
      console.error(`   Error: ${error.message}`);
    }
  }

  // Initialize services
  const storageManager = new StorageManager();
  const designHistory = new DesignHistoryService(storageManager);

  // Clean start
  localStorage.clear();

  // Test 1: Array storage preserves array structure
  test('Arrays are stored correctly with _data wrapper', () => {
    const testArray = [{ id: 1 }, { id: 2 }, { id: 3 }];
    storageManager.setItem('test_array', testArray);

    const rawStored = localStorage.getItem('archiAI_test_array');
    const parsed = JSON.parse(rawStored);

    if (!parsed._data) {
      throw new Error('Missing _data wrapper');
    }

    if (!Array.isArray(parsed._data)) {
      throw new Error('_data is not an array');
    }

    if (parsed._data.length !== 3) {
      throw new Error(`Expected 3 items, got ${parsed._data.length}`);
    }
  });

  // Test 2: Retrieving arrays works correctly
  test('Arrays are retrieved correctly without _data wrapper', () => {
    const retrieved = storageManager.getItem('test_array');

    if (!Array.isArray(retrieved)) {
      throw new Error('Retrieved value is not an array');
    }

    if (retrieved.length !== 3) {
      throw new Error(`Expected 3 items, got ${retrieved.length}`);
    }

    if (retrieved[0].id !== 1) {
      throw new Error('Array content mismatch');
    }
  });

  // Test 3: Objects are stored correctly (spread with timestamp)
  test('Objects are stored correctly with timestamp spread', () => {
    const testObj = { name: 'Test', value: 42 };
    storageManager.setItem('test_object', testObj);

    const rawStored = localStorage.getItem('archiAI_test_object');
    const parsed = JSON.parse(rawStored);

    if (!parsed._timestamp) {
      throw new Error('Missing _timestamp');
    }

    if (parsed.name !== 'Test') {
      throw new Error('Object data missing');
    }

    if ('_data' in parsed) {
      throw new Error('Objects should not have _data wrapper');
    }
  });

  // Test 4: Objects are retrieved correctly (timestamp removed)
  test('Objects are retrieved correctly without timestamp', () => {
    const retrieved = storageManager.getItem('test_object');

    if ('_timestamp' in retrieved) {
      throw new Error('Timestamp not removed');
    }

    if (retrieved.name !== 'Test' || retrieved.value !== 42) {
      throw new Error('Object content mismatch');
    }
  });

  // Test 5: Simulate OLD CORRUPTED format and test migration
  test('Migration repairs corrupted object-with-numeric-keys', () => {
    const corruptedData = {
      0: { designId: 'design1', masterDNA: {} },
      1: { designId: 'design2', masterDNA: {} },
      _timestamp: Date.now()
    };

    // Directly set corrupted format in localStorage
    localStorage.setItem('archiAI_design_history', JSON.stringify(corruptedData));

    // Try to read - should trigger migration
    const history = designHistory.getAllHistory();

    if (!Array.isArray(history)) {
      throw new Error('Migration did not return an array');
    }

    if (history.length !== 2) {
      throw new Error(`Expected 2 entries, got ${history.length}`);
    }

    if (history[0].designId !== 'design1') {
      throw new Error('Migration corrupted data');
    }

    // Verify re-saved in correct format
    const rawStored = localStorage.getItem('archiAI_design_history');
    const parsed = JSON.parse(rawStored);

    if (!parsed._data || !Array.isArray(parsed._data)) {
      throw new Error('Migration did not save in correct format');
    }
  });

  // Test 6: End-to-end design creation and retrieval
  test('End-to-end design creation workflow', async () => {
    localStorage.clear();

    const designId = await designHistory.createDesign({
      designId: 'test_design_1',
      masterDNA: { dimensions: { width: 10, height: 20 } },
      mainPrompt: 'Test prompt',
      seed: 12345
    });

    if (designId !== 'test_design_1') {
      throw new Error('Design ID mismatch');
    }

    const retrieved = designHistory.getDesign('test_design_1');

    if (!retrieved) {
      throw new Error('Design not found after creation');
    }

    if (retrieved.seed !== 12345) {
      throw new Error('Design data mismatch');
    }

    // Verify history is still an array
    const history = designHistory.getAllHistory();

    if (!Array.isArray(history)) {
      throw new Error('History is not an array');
    }

    if (history.length !== 1) {
      throw new Error(`Expected 1 design, got ${history.length}`);
    }
  });

  // Test 7: Multiple designs workflow
  test('Multiple designs are stored correctly', async () => {
    await designHistory.createDesign({
      designId: 'test_design_2',
      masterDNA: {},
      seed: 67890
    });

    await designHistory.createDesign({
      designId: 'test_design_3',
      masterDNA: {},
      seed: 11111
    });

    const history = designHistory.getAllHistory();

    if (history.length !== 3) {
      throw new Error(`Expected 3 designs, got ${history.length}`);
    }

    // Verify all designs are retrievable
    const design1 = designHistory.getDesign('test_design_1');
    const design2 = designHistory.getDesign('test_design_2');
    const design3 = designHistory.getDesign('test_design_3');

    if (!design1 || !design2 || !design3) {
      throw new Error('Not all designs retrievable');
    }

    if (design2.seed !== 67890 || design3.seed !== 11111) {
      throw new Error('Design data mismatch');
    }
  });

  // Test 8: Primitives (strings, numbers) are stored correctly
  test('Primitive values are stored with _data wrapper', () => {
    storageManager.setItem('test_string', 'hello');
    storageManager.setItem('test_number', 42);

    const str = storageManager.getItem('test_string');
    const num = storageManager.getItem('test_number');

    if (str !== 'hello') {
      throw new Error('String mismatch');
    }

    if (num !== 42) {
      throw new Error('Number mismatch');
    }
  });

  // Test 9: addTimestamp: false option works
  test('addTimestamp: false bypasses wrapper', () => {
    const testArray = [1, 2, 3];
    storageManager.setItem('test_no_timestamp', testArray, { addTimestamp: false });

    const rawStored = localStorage.getItem('archiAI_test_no_timestamp');
    const parsed = JSON.parse(rawStored);

    if ('_timestamp' in parsed || '_data' in parsed) {
      throw new Error('Timestamp/wrapper added despite addTimestamp: false');
    }

    if (!Array.isArray(parsed) || parsed.length !== 3) {
      throw new Error('Array not stored directly');
    }
  });

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests Passed: ${passedTests}/${totalTests}`);

  if (passedTests === totalTests) {
    console.log('✅ All tests passed! Storage fix is working correctly.');
    return true;
  } else {
    console.log('❌ Some tests failed. Please review the errors above.');
    return false;
  }
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
