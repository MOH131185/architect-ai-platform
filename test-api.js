/**
 * Test script to verify Replicate API functionality
 * Run with: node test-api.js
 */

require('dotenv').config();

const REPLICATE_API_KEY = process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY;

console.log('🔍 Testing Replicate API Configuration...\n');

// Check if API key exists
if (!REPLICATE_API_KEY) {
  console.error('❌ REPLICATE_API_KEY / REPLICATE_API_TOKEN is not set in .env file');
  process.exit(1);
}

console.log('✅ API Key found:', REPLICATE_API_KEY.substring(0, 10) + '...');

// Test direct Replicate API call
async function testDirectAPI() {
  console.log('\n📡 Testing direct Replicate API call...');

  try {
    // Create a simple test prediction
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: {
          prompt: "A simple test image of a red square",
          width: 512,
          height: 512,
          num_inference_steps: 20
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', response.status, data);
      return null;
    }

    console.log('✅ Prediction created:', data.id);
    console.log('   Status:', data.status);
    console.log('   URLs:', data.urls);

    return data.id;
  } catch (error) {
    console.error('❌ Failed to create prediction:', error.message);
    return null;
  }
}

// Check prediction status
async function checkPredictionStatus(predictionId) {
  console.log(`\n⏳ Checking prediction ${predictionId} status...`);

  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_KEY}`
        }
      });

      const data = await response.json();

      console.log(`   Attempt ${attempts + 1}: Status = ${data.status}`);

      if (data.status === 'succeeded') {
        console.log('✅ Prediction succeeded!');
        console.log('   Output:', data.output);
        return data.output;
      } else if (data.status === 'failed') {
        console.error('❌ Prediction failed:', data.error);
        return null;
      }

      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;

    } catch (error) {
      console.error('❌ Failed to check status:', error.message);
      return null;
    }
  }

  console.error('❌ Prediction timed out');
  return null;
}

// Main test
async function runTest() {
  console.log('🚀 Starting Replicate API test...\n');

  // Test direct API
  const predictionId = await testDirectAPI();

  if (predictionId) {
    // Check status
    const output = await checkPredictionStatus(predictionId);

    if (output) {
      console.log('\n🎉 SUCCESS! API is working correctly');
      console.log('Generated image URL:', Array.isArray(output) ? output[0] : output);
    } else {
      console.log('\n⚠️ API call succeeded but generation failed');
    }
  } else {
    console.log('\n❌ FAILED: Could not create prediction');
  }

  console.log('\n📊 Test Summary:');
  console.log('- API Key: ' + (REPLICATE_API_KEY ? '✅' : '❌'));
  console.log('- Create Prediction: ' + (predictionId ? '✅' : '❌'));
  console.log('- Get Results: ' + (predictionId ? '✅' : '❌'));
}

runTest();
