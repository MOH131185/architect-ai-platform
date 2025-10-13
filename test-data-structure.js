#!/usr/bin/env node

/**
 * Test the exact data structure returned from Replicate
 * This will help debug what the UI should be extracting
 */

const http = require('http');

console.log('🧪 Testing Data Structure from Replicate Service\n');
console.log('═══════════════════════════════════════════════════════\n');

// Simulate the exact call pattern from replicateService.js
async function simulateReplicateService() {
  console.log('📋 Simulating replicateService.generateMultiLevelFloorPlans()\n');

  // First create a prediction
  const createResponse = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/replicate/predictions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    input: {
      prompt: "ARCHITECTURAL FLOOR PLAN: Professional 2D architectural floor plan, ground level technical blueprint",
      negative_prompt: "3D rendering, perspective view",
      num_outputs: 1,
      width: 1024,
      height: 1024,
      num_inference_steps: 45,
      guidance_scale: 8.5,
      seed: 123456
    }
  }));

  if (createResponse.statusCode === 200 || createResponse.statusCode === 201) {
    const predictionId = createResponse.data.id;
    console.log(`   ✅ Prediction created: ${predictionId}\n`);

    // Wait for completion (simulating waitForCompletion)
    let attempts = 0;
    while (attempts < 30) {
      attempts++;

      const statusResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/replicate/predictions/${predictionId}`,
        method: 'GET'
      });

      if (statusResponse.statusCode === 200) {
        const prediction = statusResponse.data;

        if (prediction.status === 'succeeded') {
          console.log('   ✅ Prediction succeeded!\n');
          console.log('   📊 Data Structure Analysis:\n');

          // This is what gets returned from waitForCompletion
          console.log('   1. prediction object (from waitForCompletion):');
          console.log(`      - status: ${prediction.status}`);
          console.log(`      - output type: ${typeof prediction.output}`);
          console.log(`      - output is array: ${Array.isArray(prediction.output)}`);
          console.log(`      - output length: ${prediction.output?.length || 0}`);

          // This is what generateArchitecturalImage returns
          const architecturalImageResult = {
            success: true,
            images: prediction.output,  // This line is from replicateService.js line 236
            predictionId: prediction.id,
            timestamp: new Date().toISOString()
          };

          console.log('\n   2. generateArchitecturalImage() returns:');
          console.log(`      - success: ${architecturalImageResult.success}`);
          console.log(`      - images type: ${typeof architecturalImageResult.images}`);
          console.log(`      - images is array: ${Array.isArray(architecturalImageResult.images)}`);
          console.log(`      - images length: ${architecturalImageResult.images?.length || 0}`);
          console.log(`      - first image URL: ${architecturalImageResult.images?.[0] || 'NONE'}`);

          // This is what generateMultiLevelFloorPlans returns for ground floor
          const multiLevelResult = {
            success: true,
            floorPlans: {
              ground: architecturalImageResult
            },
            floorCount: 1,
            projectSeed: 123456,
            timestamp: new Date().toISOString()
          };

          console.log('\n   3. generateMultiLevelFloorPlans() returns:');
          console.log(`      - success: ${multiLevelResult.success}`);
          console.log(`      - floorPlans.ground.success: ${multiLevelResult.floorPlans.ground.success}`);
          console.log(`      - floorPlans.ground.images type: ${typeof multiLevelResult.floorPlans.ground.images}`);
          console.log(`      - floorPlans.ground.images is array: ${Array.isArray(multiLevelResult.floorPlans.ground.images)}`);
          console.log(`      - floorPlans.ground.images[0]: ${multiLevelResult.floorPlans.ground.images?.[0] || 'NONE'}`);

          console.log('\n   💡 IMPORTANT: The UI should extract images like this:');
          console.log('      const groundImage = result.floorPlans.ground.images[0];');
          console.log(`      Expected: ${multiLevelResult.floorPlans.ground.images?.[0]}`);

          return multiLevelResult;
        } else if (prediction.status === 'failed') {
          console.log('   ❌ Prediction failed');
          return null;
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('   ⏱️ Timeout waiting for prediction');
  } else {
    console.log(`   ❌ Failed to create prediction: ${createResponse.statusCode}`);
  }
}

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
    if (data) req.write(data);
    req.end();
  });
}

// Run the test
simulateReplicateService().catch(console.error);