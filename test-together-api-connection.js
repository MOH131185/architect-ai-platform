/**
 * Quick Together AI API Connection Test
 * Tests if the API key works and generation is possible
 */

const fetch = require('node-fetch');
require('dotenv').config();

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

async function testTogetherAI() {
  console.log('🧪 Testing Together AI API Connection...\n');

  // Test 1: Check API key exists
  console.log('TEST 1: API Key Check');
  if (!TOGETHER_API_KEY) {
    console.error('❌ FAILED: TOGETHER_API_KEY not found in .env');
    console.log('   Solution: Add TOGETHER_API_KEY=tgp_v1_... to .env file');
    return false;
  }
  console.log('✅ PASSED: API key found');
  console.log(`   Key starts with: ${TOGETHER_API_KEY.substring(0, 15)}...`);
  console.log('');

  // Test 2: Check API authentication
  console.log('TEST 2: API Authentication');
  try {
    const authResponse = await fetch('https://api.together.xyz/v1/models', {
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      }
    });

    if (!authResponse.ok) {
      console.error('❌ FAILED: API authentication failed');
      console.error(`   Status: ${authResponse.status} ${authResponse.statusText}`);
      const errorData = await authResponse.text();
      console.error(`   Error: ${errorData.substring(0, 200)}`);
      return false;
    }

    console.log('✅ PASSED: API authentication successful');
    console.log(`   Status: ${authResponse.status} OK`);
    console.log('');
  } catch (error) {
    console.error('❌ FAILED: Network error');
    console.error(`   Error: ${error.message}`);
    return false;
  }

  // Test 3: Test simple image generation
  console.log('TEST 3: Simple Image Generation');
  console.log('   Generating test image...');

  try {
    const startTime = Date.now();

    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-dev',
        prompt: 'A simple red cube on a white background, minimal, 3D render',
        width: 512,
        height: 512,
        steps: 20,
        n: 1
      })
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ FAILED: Image generation failed');
      console.error(`   Status: ${response.status} ${response.statusText}`);
      console.error(`   Error: ${JSON.stringify(errorData, null, 2)}`);
      return false;
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.output?.[0];

    if (!imageUrl) {
      console.error('❌ FAILED: No image URL in response');
      console.error(`   Response: ${JSON.stringify(data, null, 2)}`);
      return false;
    }

    console.log('✅ PASSED: Image generated successfully');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Image URL: ${imageUrl.substring(0, 60)}...`);
    console.log('');
  } catch (error) {
    console.error('❌ FAILED: Generation error');
    console.error(`   Error: ${error.message}`);
    return false;
  }

  // Test 4: Test rate limiting (2 rapid requests)
  console.log('TEST 4: Rate Limit Behavior');
  console.log('   Making 2 rapid requests...');

  try {
    const request1 = fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-dev',
        prompt: 'Test image 1',
        width: 512,
        height: 512,
        steps: 4, // Faster
        n: 1
      })
    });

    const request2 = fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-dev',
        prompt: 'Test image 2',
        width: 512,
        height: 512,
        steps: 4,
        n: 1
      })
    });

    const [response1, response2] = await Promise.all([request1, request2]);

    if (response1.status === 429 || response2.status === 429) {
      console.warn('⚠️  WARNING: Rate limit hit with rapid requests');
      console.warn('   This is expected - need delays between requests');
      console.warn('   Recommendation: 4-6 seconds between requests');
    } else if (response1.ok && response2.ok) {
      console.log('✅ PASSED: Both rapid requests succeeded');
      console.log('   Rate limits are generous or queue-based');
    } else {
      console.warn(`⚠️  MIXED: Request 1: ${response1.status}, Request 2: ${response2.status}`);
    }
    console.log('');
  } catch (error) {
    console.error('❌ FAILED: Rate limit test error');
    console.error(`   Error: ${error.message}`);
  }

  return true;
}

// Run tests
testTogetherAI().then(success => {
  if (success) {
    console.log('═══════════════════════════════════════');
    console.log('🎉 ALL TESTS PASSED');
    console.log('═══════════════════════════════════════');
    console.log('Your Together AI setup is working correctly!');
    console.log('');
    console.log('Recommendations:');
    console.log('  ✓ Use 4-6 second delays between requests');
    console.log('  ✓ Implement retry logic for transient failures');
    console.log('  ✓ Monitor rate limits in production');
    console.log('');
  } else {
    console.log('═══════════════════════════════════════');
    console.log('❌ TESTS FAILED');
    console.log('═══════════════════════════════════════');
    console.log('Please fix the issues above before continuing.');
    console.log('');
  }
  process.exit(success ? 0 : 1);
});