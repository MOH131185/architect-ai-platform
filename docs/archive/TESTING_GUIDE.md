# Deterministic Testing Guide

## Overview

This guide explains how to run the comprehensive test suite for the deterministic refactor.

---

## Quick Start

### Run All Tests
```bash
node run-all-deterministic-tests.js
```

This will run all 5 test suites (53 tests total) and report results.

---

## Individual Test Suites

### 1. Pure Orchestrator Tests (10 tests)
Tests deterministic A1 sheet generation workflow.

```bash
node test-pure-orchestrator-deterministic.js
```

**What it tests**:
- Deterministic seed handling
- DNA normalization
- DNA hashing
- Prompt generation determinism
- Layout computation
- Baseline artifact creation
- Environment adapter
- ModifyRequest creation

**Expected output**: 10/10 tests passed

---

### 2. Drift Detection Tests (10 tests)
Tests DNA-level drift detection and thresholds.

```bash
node test-drift-detection.js
```

**What it tests**:
- No drift for identical DNA
- Dimension drift detection
- Material drift detection
- Style change detection
- Project type change detection
- Multiple changes compound drift
- Drift threshold enforcement
- Drift correction suggestions
- Floor count changes
- Material color changes

**Expected output**: 10/10 tests passed

---

### 3. Design History Repository Tests (10 tests)
Tests design persistence and versioning.

```bash
node test-design-history-repository.js
```

**What it tests**:
- Save design
- Get design by ID
- List designs
- Add version
- Get version
- Multiple versions
- Delete design
- Multiple designs
- Design ID uniqueness
- Timestamp tracking

**Expected output**: 10/10 tests passed

---

### 4. API Integration Tests (8 tests)
Tests API endpoints for deterministic behavior.

**⚠️ REQUIRES SERVER RUNNING**

```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Run tests
node test-api-deterministic.js
```

**What it tests**:
- Health check
- Together chat endpoint (deterministic mode)
- Together image endpoint (seed propagation)
- Sheet export endpoint
- Overlay endpoint
- Drift detect endpoint
- Error handling
- Structured error format

**Expected output**: 8/8 tests passed

---

### 5. E2E Deterministic Pipeline Tests (15 tests)
Tests complete workflow from site to modification.

```bash
node test-e2e-deterministic-pipeline.js
```

**What it tests**:
- Site snapshot normalization
- DNA generation
- DNA hashing
- Prompt generation
- Layout computation
- Baseline artifact creation
- Modify request creation
- Modify prompt building
- Drift detection (no drift)
- Drift detection (with changes)
- DNA comparison
- Deterministic filename generation
- Seed reuse in modify mode
- Consistency score calculation
- Workflow type tracking

**Expected output**: 15/15 tests passed

---

## Test Results

### Expected Output (All Tests)

```
🚀 Deterministic Test Suite

Running all deterministic tests...

📦 Pure Orchestrator Deterministic Tests
   Tests deterministic A1 sheet generation workflow
✅ PASS - 10/10 tests passed

📦 Drift Detection Tests
   Tests DNA-level and image-level drift detection
✅ PASS - 10/10 tests passed

📦 Design History Repository Tests
   Tests design persistence and versioning
✅ PASS - 10/10 tests passed

📦 API Deterministic Tests
   Tests API endpoints for deterministic behavior
✅ PASS - 8/8 tests passed

📦 E2E Deterministic Pipeline Tests
   Tests complete workflow from site to modification
✅ PASS - 15/15 tests passed

📊 TEST SUITE SUMMARY
Total: 5 passed, 0 failed (5 total)
Success rate: 100.0%

🎉 ALL TESTS PASSED! Deterministic refactor is working correctly.
```

---

## Troubleshooting

### Issue: "Cannot find module"
**Solution**: Ensure all dependencies are installed
```bash
npm install
```

### Issue: "API tests fail with connection error"
**Solution**: Start the server first
```bash
npm run server
```

### Issue: "Test fails with 'fetch is not defined'"
**Solution**: Use Node 18+ or install node-fetch
```bash
node --version  # Should be 18+
```

### Issue: "Storage tests fail"
**Solution**: Clear any existing test data
```bash
# Clear localStorage in browser console
localStorage.clear();
```

---

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: Deterministic Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run deterministic tests
        run: node run-all-deterministic-tests.js
      
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test_results.log
```

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test:deterministic": "node run-all-deterministic-tests.js",
    "test:unit": "node test-pure-orchestrator-deterministic.js && node test-drift-detection.js",
    "test:integration": "node test-api-deterministic.js",
    "test:e2e": "node test-e2e-deterministic-pipeline.js",
    "test:all": "npm run test:unit && npm run test:e2e"
  }
}
```

---

## Test Development

### Adding New Tests

1. **Create test file**: `test-my-feature.js`
2. **Import fixtures**: `const { mockDNA } = require('./__mocks__/fixtures');`
3. **Write assertions**: Use `assert()` and `assertEquals()`
4. **Add to runner**: Update `run-all-deterministic-tests.js`

### Example Test

```javascript
const { myFunction } = require('./src/services/myService');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🧪 Testing My Feature\n');
  
  // Test 1
  const result = myFunction({ input: 'test' });
  assert(result === 'expected', 'Function returns expected value');
  
  // Results
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests();
```

---

## Coverage Goals

### Current Coverage
- **Unit tests**: 30 tests
- **Integration tests**: 8 tests
- **E2E tests**: 15 tests
- **Total**: 53 tests

### Target Coverage
- **Core services**: ≥90%
- **API endpoints**: ≥80%
- **React components**: ≥60%
- **Overall**: ≥80%

### Next Steps
1. Add React component tests (RTL)
2. Add snapshot tests for prompts
3. Add performance benchmarks
4. Configure Jest coverage reporting

---

## Best Practices

### Writing Deterministic Tests
- ✅ Use fixed seeds
- ✅ Mock all external APIs
- ✅ Use fixtures for test data
- ✅ Assert on exact values
- ✅ Test same inputs → same outputs

### Avoiding Flaky Tests
- ✅ No random values
- ✅ No timestamps (use fixed dates)
- ✅ No network calls (mock everything)
- ✅ No file system dependencies
- ✅ Clean up after each test

### Test Organization
- ✅ One test suite per service
- ✅ Clear test names
- ✅ Descriptive assertions
- ✅ Proper setup/teardown
- ✅ Independent tests

---

## Resources

- **Test Fixtures**: `__mocks__/fixtures.js`
- **Together Mock**: `__mocks__/togetherMock.js`
- **Jest Setup**: `jest.setup.js`
- **Test Runner**: `run-all-deterministic-tests.js`

---

**Last Updated**: January 19, 2025
**Status**: Complete and ready for use

