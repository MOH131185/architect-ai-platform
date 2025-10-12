#!/usr/bin/env node

/**
 * Test floor plan generation and check status
 */

const http = require('http');

console.log('🧪 Testing Floor Plan Generation and Status Check\n');
console.log('═══════════════════════════════════════════════════════\n');

async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function testFloorPlanGeneration() {
  console.log('📐 Step 1: Creating Floor Plan Prediction\n');

  const requestData = JSON.stringify({
    version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    input: {
      prompt: "ARCHITECTURAL FLOOR PLAN: Professional 2D architectural floor plan, ground level technical blueprint of 2-story contemporary house (200m²), showing clear wall outlines as thick black lines, door openings with arc swing indicators, window openings, room labels, north arrow, scale 1:100, CAD-style technical drawing, orthographic top-down view, NO 3D, NO perspective, flat 2D documentation",
      negative_prompt: "3D rendering, perspective view, isometric, photorealistic, colored, shaded",
      num_outputs: 1,
      width: 1024,
      height: 1024,
      num_inference_steps: 45,
      guidance_scale: 8.5,
      seed: 123456
    }
  });

  const createResponse = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/replicate/predictions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    }
  }, requestData);

  if (createResponse.statusCode === 200 || createResponse.statusCode === 201) {
    console.log('   ✅ Prediction created successfully');
    console.log(`   Prediction ID: ${createResponse.data.id}`);
    console.log(`   Initial Status: ${createResponse.data.status}`);

    return createResponse.data.id;
  } else {
    console.log(`   ❌ Failed to create prediction: ${createResponse.statusCode}`);
    console.log('   Error:', createResponse.data);
    return null;
  }
}

async function checkPredictionStatus(predictionId) {
  console.log('\n📊 Step 2: Checking Prediction Status\n');

  let attempts = 0;
  const maxAttempts = 30; // Check for up to 60 seconds
  const delay = 2000; // Check every 2 seconds

  while (attempts < maxAttempts) {
    attempts++;

    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/replicate/predictions/${predictionId}`,
      method: 'GET'
    });

    if (response.statusCode === 200) {
      const prediction = response.data;
      console.log(`   Attempt ${attempts}: Status = ${prediction.status}`);

      if (prediction.status === 'succeeded') {
        console.log('\n   ✅ Prediction completed successfully!');
        console.log('   Output URLs:');
        if (prediction.output && Array.isArray(prediction.output)) {
          prediction.output.forEach((url, idx) => {
            console.log(`      Image ${idx + 1}: ${url}`);
          });
        }
        return prediction;
      } else if (prediction.status === 'failed') {
        console.log('\n   ❌ Prediction failed');
        console.log('   Error:', prediction.error);
        return prediction;
      } else if (prediction.status === 'canceled') {
        console.log('\n   ⚠️ Prediction was canceled');
        return prediction;
      }

      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      console.log(`   ❌ Failed to check status: ${response.statusCode}`);
      return null;
    }
  }

  console.log('\n   ⏱️ Timeout: Prediction is still processing after 60 seconds');
  return null;
}

async function runTest() {
  try {
    // Create prediction
    const predictionId = await testFloorPlanGeneration();

    if (!predictionId) {
      console.log('\n❌ Test failed: Could not create prediction');
      return;
    }

    // Check status until complete
    const result = await checkPredictionStatus(predictionId);

    if (result && result.status === 'succeeded') {
      console.log('\n✅ Test Complete: Floor plan generated successfully');
      console.log('\n💡 Key Findings:');
      console.log('   - Replicate API is working');
      console.log('   - Floor plan generation is successful');
      console.log('   - Images are being generated (not placeholders)');
      console.log('\n🔍 Next Steps:');
      console.log('   - Check if the UI is correctly extracting these URLs');
      console.log('   - Ensure the waitForCompletion function is working');
      console.log('   - Verify the data structure matches what the UI expects');
    } else {
      console.log('\n❌ Test failed: Floor plan generation did not complete successfully');
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
  }
}

// Run the test
runTest().catch(console.error);