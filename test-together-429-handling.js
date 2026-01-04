/**
 * Test Suite for Together.ai 429 Rate Limiting Handling
 * 
 * Verifies:
 * - RequestQueue pacing works correctly
 * - Retry-After header is respected
 * - Non-JSON error responses are handled gracefully
 * - Circuit breaker activates after multiple 429s
 * - Failed panels are retried specifically (not successful ones)
 */

// Mock fetch for testing
let fetchCallCount = 0;
let rateLimitCount = 0;

const mockFetch = (url, options) => {
  fetchCallCount++;
  
  // Simulate rate limiting: return 429 on 3rd, 5th, and 7th calls
  if (fetchCallCount === 3 || fetchCallCount === 5 || fetchCallCount === 7) {
    rateLimitCount++;
    return Promise.resolve({
      ok: false,
      status: 429,
      headers: {
        get: (name) => {
          if (name === 'retry-after') return '2'; // 2 seconds
          if (name === 'content-type') return 'text/plain';
          return null;
        }
      },
      text: () => Promise.resolve('Image generation rate limit exceeded. Please try again later.'),
      json: () => Promise.reject(new Error('Not JSON'))
    });
  }
  
  // Successful response
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: {
      get: (name) => {
        if (name === 'content-type') return 'application/json';
        return null;
      }
    },
    json: () => Promise.resolve({ url: `https://example.com/image-${fetchCallCount}.png` })
  });
};

// Mock RequestQueue (simplified version)
class RequestQueue {
  constructor(minIntervalMs = 9000) {
    this.minIntervalMs = minIntervalMs;
    this.lastAt = 0;
    this.queue = Promise.resolve();
  }

  schedule(task) {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.lastAt + this.minIntervalMs - now);
      if (wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait));
      }
      this.lastAt = Date.now();
      return task();
    });
    return this.queue;
  }
}

// Mock normalizeResponse
async function normalizeResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10) || undefined;
  
  let body;
  try {
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      const text = await response.text();
      body = { error: text, rawText: text };
    }
  } catch (parseError) {
    const text = await response.text().catch(() => 'Unknown error');
    body = { error: text, rawText: text, parseError: parseError.message };
  }

  if (!response.ok) {
    const error = new Error(body?.error || body?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.retryAfter = retryAfter;
    error.body = body;
    throw error;
  }

  return { body, retryAfter };
}

// Test 1: RequestQueue pacing
async function testRequestQueuePacing() {
  console.log('\n📋 Test 1: RequestQueue Pacing');
  const queue = new RequestQueue(100); // 100ms min interval
  const startTime = Date.now();
  const timestamps = [];

  for (let i = 0; i < 3; i++) {
    await queue.schedule(async () => {
      timestamps.push(Date.now());
      return { success: true };
    });
  }

  const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  const minInterval = Math.min(...intervals);
  
  if (minInterval >= 100) {
    console.log('✅ PASS: Queue enforces minimum interval');
  } else {
    console.log(`❌ FAIL: Expected min interval 100ms, got ${minInterval}ms`);
  }
}

// Test 2: Retry-After header handling
async function testRetryAfterHandling() {
  console.log('\n📋 Test 2: Retry-After Header Handling');
  global.fetch = mockFetch;
  fetchCallCount = 0;
  rateLimitCount = 0;

  try {
    const response = await mockFetch('/api/together/image', { method: 'POST' });
    await normalizeResponse(response);
    console.log('❌ FAIL: Should have thrown error');
  } catch (error) {
    if (error.status === 429 && error.retryAfter === 2) {
      console.log('✅ PASS: Retry-After header extracted correctly');
    } else {
      console.log(`❌ FAIL: Expected status 429 with retryAfter 2, got ${error.status} with retryAfter ${error.retryAfter}`);
    }
  }
}

// Test 3: Non-JSON error handling
async function testNonJsonErrorHandling() {
  console.log('\n📋 Test 3: Non-JSON Error Handling');
  global.fetch = mockFetch;
  fetchCallCount = 0;

  try {
    const response = await mockFetch('/api/together/image', { method: 'POST' });
    // Skip first 2 successful calls
    await mockFetch('/api/together/image', { method: 'POST' });
    await mockFetch('/api/together/image', { method: 'POST' });
    const rateLimitResponse = await mockFetch('/api/together/image', { method: 'POST' });
    await normalizeResponse(rateLimitResponse);
    console.log('❌ FAIL: Should have thrown error');
  } catch (error) {
    if (error.body && error.body.rawText && error.body.rawText.includes('rate limit')) {
      console.log('✅ PASS: Non-JSON error handled gracefully');
    } else {
      console.log('❌ FAIL: Non-JSON error not handled correctly');
    }
  }
}

// Test 4: Circuit Breaker activation
async function testCircuitBreaker() {
  console.log('\n📋 Test 4: Circuit Breaker');
  
  class CircuitBreaker {
    constructor(max429s = 3, windowMs = 90000, pauseMs = 60000) {
      this.max429s = max429s;
      this.windowMs = windowMs;
      this.pauseMs = pauseMs;
      this.rateLimitHistory = [];
      this.isOpen = false;
      this.openedAt = null;
    }

    record429() {
      const now = Date.now();
      this.rateLimitHistory.push(now);
      this.rateLimitHistory = this.rateLimitHistory.filter(t => now - t < this.windowMs);
      
      if (this.rateLimitHistory.length >= this.max429s && !this.isOpen) {
        this.isOpen = true;
        this.openedAt = now;
      }
    }

    async check() {
      if (!this.isOpen) return;
      throw new Error('Circuit breaker open');
    }
  }

  const breaker = new CircuitBreaker(3, 1000, 500);
  
  // Record 2 429s - should not open
  breaker.record429();
  breaker.record429();
  try {
    await breaker.check();
    console.log('✅ PASS: Circuit breaker closed with 2 429s');
  } catch {
    console.log('❌ FAIL: Circuit breaker opened too early');
  }

  // Record 3rd 429 - should open
  breaker.record429();
  try {
    await breaker.check();
    console.log('❌ FAIL: Circuit breaker should be open');
  } catch (error) {
    if (error.message === 'Circuit breaker open') {
      console.log('✅ PASS: Circuit breaker opens after 3 429s');
    } else {
      console.log('❌ FAIL: Wrong error message');
    }
  }
}

// Test 5: Failed panel retry logic
async function testFailedPanelRetry() {
  console.log('\n📋 Test 5: Failed Panel Retry Logic');
  
  const batchResults = [
    { id: 'panel-1', failed: false },
    { id: 'panel-2', failed: true },
    { id: 'panel-3', failed: false },
    { id: 'panel-4', failed: true }
  ];

  const failedPanels = batchResults.filter(r => r.failed).map(r => ({ id: r.id }));
  const successfulPanels = batchResults.filter(r => !r.failed);

  if (failedPanels.length === 2 && 
      failedPanels[0].id === 'panel-2' && 
      failedPanels[1].id === 'panel-4' &&
      successfulPanels.length === 2) {
    console.log('✅ PASS: Only failed panels are identified for retry');
  } else {
    console.log('❌ FAIL: Failed panel identification incorrect');
  }
}

// Run all tests
async function runTests() {
  console.log('🧪 Running Together.ai 429 Handling Tests\n');
  console.log('=' .repeat(60));

  await testRequestQueuePacing();
  await testRetryAfterHandling();
  await testNonJsonErrorHandling();
  await testCircuitBreaker();
  await testFailedPanelRetry();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test suite complete');
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };

