/**
 * Direct Together.ai API Test
 * Tests the Together.ai API directly to diagnose issues
 */

require('dotenv').config();

async function testTogetherAPI() {
  const apiKey = process.env.TOGETHER_API_KEY;

  console.log('🔍 Testing Together.ai API directly...\n');

  if (!apiKey) {
    console.error('❌ TOGETHER_API_KEY not found in .env');
    process.exit(1);
  }

  console.log('✅ API Key found:', apiKey.substring(0, 15) + '...');

  // Test 1: Simple text-to-image with FLUX.1-dev
  console.log('\n📝 Test 1: FLUX.1-dev text-to-image generation');
  console.log('   Generating a simple architectural test image...');

  const requestBody = {
    model: 'black-forest-labs/FLUX.1-dev',
    prompt: 'Modern minimalist house with clean lines, white walls, flat roof, large windows, professional architectural rendering',
    width: 1024,
    height: 768,
    steps: 28,
    n: 1
  };

  console.log('   Request:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('\n   Response status:', response.status);
    console.log('   Response headers:');
    console.log('     - Content-Type:', response.headers.get('content-type'));
    console.log('     - Retry-After:', response.headers.get('retry-after') || 'none');
    console.log('     - Rate-Limit-Remaining:', response.headers.get('x-ratelimit-remaining') || 'none');

    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { error: text, rawText: text };
    }

    if (!response.ok) {
      console.error('\n❌ API request failed!');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(data, null, 2));

      if (response.status === 401) {
        console.error('\n💡 Suggestion: Check if your API key is valid and has not expired');
      } else if (response.status === 402) {
        console.error('\n💡 Suggestion: Check if your Together.ai account has sufficient credits');
        console.error('   Add credits at: https://api.together.ai/settings/billing');
      } else if (response.status === 429) {
        console.error('\n💡 Suggestion: Rate limit exceeded. Wait and try again.');
      } else if (response.status === 500) {
        console.error('\n💡 Suggestion: Together.ai server error. This is usually temporary.');
        console.error('   Try again in a few minutes or check https://status.together.ai');
      }

      process.exit(1);
    }

    console.log('\n✅ Image generated successfully!');
    console.log('   Image URL:', data.data?.[0]?.url?.substring(0, 80) + '...');
    console.log('   Response structure:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('\n❌ Network error:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }

  // Test 2: Check account status via API
  console.log('\n📊 Test 2: Checking Together.ai account status...');

  try {
    const response = await fetch('https://api.together.xyz/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const models = await response.json();
      const fluxModels = models.filter(m => m.id && m.id.includes('FLUX'));
      console.log(`✅ API key valid - Found ${fluxModels.length} FLUX models available`);
      console.log('   Available FLUX models:');
      fluxModels.forEach(m => {
        console.log(`     - ${m.id}`);
      });
    } else {
      console.error('❌ Failed to fetch models');
      const data = await response.json();
      console.error('   Error:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Model list check failed:', error.message);
  }

  console.log('\n✅ All tests completed!');
}

testTogetherAPI().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
