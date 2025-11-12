/**
 * Debug script for A1 modification API issue
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function testModifyAPI() {
  console.log('\n🔍 Testing A1 Modification API Parameters\n');
  console.log('========================================\n');

  // Check if Together API key exists
  const togetherKey = process.env.TOGETHER_API_KEY;
  if (!togetherKey) {
    console.error('❌ TOGETHER_API_KEY not found in .env');
    return;
  }
  console.log('✅ TOGETHER_API_KEY found:', togetherKey.substring(0, 10) + '...');

  // Test parameters that would be sent from the client
  const testParams = {
    model: 'black-forest-labs/FLUX.1-dev',
    prompt: 'Test modification prompt',
    negativePrompt: '',
    seed: 123456,
    width: 1264,
    height: 1792,
    num_inference_steps: 28,
    guidanceScale: 7.8,
    // These are the problematic parameters
    initImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // 1x1 red pixel
    imageStrength: 0.30
  };

  console.log('\n📦 Test parameters:');
  console.log('   Model:', testParams.model);
  console.log('   Width x Height:', testParams.width, 'x', testParams.height);
  console.log('   Steps:', testParams.num_inference_steps);
  console.log('   Guidance:', testParams.guidanceScale);
  console.log('   Has initImage:', !!testParams.initImage);
  console.log('   Image strength:', testParams.imageStrength);

  // Test 1: Direct Together API call
  console.log('\n📡 Test 1: Direct Together.ai API call...\n');

  const requestBody = {
    model: testParams.model,
    prompt: testParams.prompt,
    negative_prompt: testParams.negativePrompt,
    width: testParams.width,
    height: testParams.height,
    seed: testParams.seed,
    steps: testParams.num_inference_steps,
    guidance_scale: testParams.guidanceScale,
    n: 1,
    // Together.ai expects these exact field names
    init_image: testParams.initImage,
    image_strength: testParams.imageStrength
  };

  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Direct API call succeeded!');
      console.log('   Image URL:', data.data?.[0]?.url ? 'Generated' : 'Missing');
    } else {
      console.error('❌ Direct API call failed:', response.status);
      console.error('   Error response:', JSON.stringify(data, null, 2));

      // Check specific error messages
      if (data.error?.message?.includes('init_image')) {
        console.error('\n🚨 ISSUE: init_image parameter problem');
        console.error('   The API is rejecting the init_image parameter');
      }
      if (data.error?.message?.includes('image_strength')) {
        console.error('\n🚨 ISSUE: image_strength parameter problem');
        console.error('   The API is rejecting the image_strength parameter');
      }
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }

  // Test 2: Local proxy endpoint
  console.log('\n📡 Test 2: Local proxy endpoint...\n');

  const proxyUrl = 'http://localhost:3001/api/together/image';

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testParams) // Send with client parameter names
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Proxy endpoint succeeded!');
      console.log('   Image URL:', data.url ? 'Generated' : 'Missing');
    } else {
      console.error('❌ Proxy endpoint failed:', response.status);
      console.error('   Error response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.error('   Is the dev server running on port 3001?');
  }

  console.log('\n========================================\n');
  console.log('📊 Diagnosis Complete\n');
}

// Run the test
testModifyAPI().catch(console.error);