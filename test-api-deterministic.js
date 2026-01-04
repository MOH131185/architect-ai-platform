/**
 * API Integration Tests (Deterministic)
 * 
 * Tests API endpoints for deterministic behavior.
 * Run with: node test-api-deterministic.js
 * 
 * NOTE: Requires server running on localhost:3001
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001';

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
  console.log('\n🧪 Testing API Endpoints (Deterministic)\n');
  console.log('='.repeat(60));
  console.log('⚠️  NOTE: Server must be running on localhost:3001\n');

  // Test 1: Health check
  console.log('📋 Test 1: Health check');
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    
    assert(response.ok, 'Health endpoint responds');
    assert(data.status === 'ok', 'Health status is ok');
  } catch (error) {
    console.error(`❌ FAIL: Health check - ${error.message}`);
    console.error('⚠️  Make sure server is running: npm run server');
    failed++;
    process.exit(1);
  }

  // Test 2: Together chat endpoint (deterministic mode)
  console.log('\n📋 Test 2: Together chat endpoint (deterministic mode)');
  try {
    const response = await fetch(`${API_BASE}/api/together/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
        messages: [
          { role: 'system', content: 'You are an architect.' },
          { role: 'user', content: 'Design a house.' }
        ],
        deterministicMode: true
      })
    });

    const data = await response.json();
    
    assert(response.ok, 'Chat endpoint responds');
    assert(data.content !== undefined, 'Response has content');
    assert(data.model !== undefined, 'Response has model');
    assert(data.traceId !== undefined, 'Response has traceId');
    assert(data.settings !== undefined, 'Response has settings');
    assert(data.settings.temperature === 0.1, 'Deterministic mode uses temperature 0.1');
  } catch (error) {
    console.error(`❌ FAIL: Chat endpoint - ${error.message}`);
    failed++;
  }

  // Test 3: Together image endpoint (seed propagation)
  console.log('\n📋 Test 3: Together image endpoint (seed propagation)');
  try {
    const testSeed = 999888;
    const response = await fetch(`${API_BASE}/api/together/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-dev',
        prompt: 'Test architectural image',
        seed: testSeed,
        width: 1792,
        height: 1269,
        num_inference_steps: 48
      })
    });

    const data = await response.json();
    
    assert(response.ok, 'Image endpoint responds');
    assert(data.seedUsed === testSeed, `Seed is preserved (expected ${testSeed}, got ${data.seedUsed})`);
    assert(data.url !== undefined, 'Response has image URL');
    assert(data.traceId !== undefined, 'Response has traceId');
    assert(data.metadata !== undefined, 'Response has metadata');
  } catch (error) {
    console.error(`❌ FAIL: Image endpoint - ${error.message}`);
    failed++;
  }

  // Test 4: Sheet export endpoint
  console.log('\n📋 Test 4: Sheet export endpoint');
  try {
    const response = await fetch(`${API_BASE}/api/sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        designId: 'test_design_123',
        sheetType: 'ARCH',
        versionId: 'base',
        sheetMetadata: {},
        overlays: [],
        format: 'png',
        imageUrl: 'https://mock.com/image.png'
      })
    });

    const data = await response.json();
    
    assert(response.ok, 'Sheet endpoint responds');
    assert(data.url !== undefined, 'Response has URL');
    assert(data.filename !== undefined, 'Response has filename');
    assert(data.checksum !== undefined, 'Response has checksum');
    assert(data.designId === 'test_design_123', 'Design ID is preserved');
  } catch (error) {
    console.error(`❌ FAIL: Sheet endpoint - ${error.message}`);
    failed++;
  }

  // Test 5: Overlay endpoint
  console.log('\n📋 Test 5: Overlay endpoint');
  try {
    const response = await fetch(`${API_BASE}/api/overlay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseImageUrl: 'https://mock.com/image.png',
        overlays: [
          { id: 'overlay1', type: 'site-boundary', dataUrl: 'data:...', position: {} }
        ],
        format: 'png'
      })
    });

    const data = await response.json();
    
    assert(response.ok, 'Overlay endpoint responds');
    assert(data.url !== undefined, 'Response has URL');
    assert(data.width !== undefined, 'Response has width');
    assert(data.height !== undefined, 'Response has height');
  } catch (error) {
    console.error(`❌ FAIL: Overlay endpoint - ${error.message}`);
    failed++;
  }

  // Test 6: Drift detect endpoint
  console.log('\n📋 Test 6: Drift detect endpoint');
  try {
    const response = await fetch(`${API_BASE}/api/drift-detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baselineUrl: 'https://mock.com/baseline.png',
        candidateUrl: 'https://mock.com/candidate.png',
        panelCoordinates: [
          { id: 'panel1', name: 'Test Panel', x: 0, y: 0, width: 100, height: 100 }
        ]
      })
    });

    const data = await response.json();
    
    assert(response.ok, 'Drift detect endpoint responds');
    assert(data.wholeSheet !== undefined, 'Response has whole-sheet metrics');
    assert(data.panels !== undefined, 'Response has panel metrics');
    assert(data.summary !== undefined, 'Response has summary');
  } catch (error) {
    console.error(`❌ FAIL: Drift detect endpoint - ${error.message}`);
    failed++;
  }

  // Test 7: Error handling - missing parameters
  console.log('\n📋 Test 7: Error handling - missing parameters');
  try {
    const response = await fetch(`${API_BASE}/api/sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing designId and imageUrl
        format: 'png'
      })
    });

    const data = await response.json();
    
    assert(!response.ok, 'Endpoint rejects invalid input');
    assert(data.error !== undefined, 'Error response has error field');
    assert(data.error.code !== undefined, 'Error has code');
    assert(data.error.message !== undefined, 'Error has message');
  } catch (error) {
    console.error(`❌ FAIL: Error handling - ${error.message}`);
    failed++;
  }

  // Test 8: Structured error format
  console.log('\n📋 Test 8: Structured error format');
  try {
    const response = await fetch(`${API_BASE}/api/together/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing messages array
        model: 'test'
      })
    });

    const data = await response.json();
    
    assert(!response.ok, 'Endpoint rejects invalid input');
    assert(data.error.code === 'INVALID_INPUT', 'Error code is INVALID_INPUT');
    assert(data.error.message.includes('required'), 'Error message mentions requirement');
  } catch (error) {
    console.error(`❌ FAIL: Structured error - ${error.message}`);
    failed++;
  }

  // Results
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All API tests passed!\n');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite error:', error);
  process.exit(1);
});

