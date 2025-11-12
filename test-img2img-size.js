/**
 * Test script to diagnose image size issues with modification API
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');

// Create a dummy base64 image of specific size
function createDummyBase64Image(sizeMB) {
  // Base64 encoding increases size by ~33%
  const targetBytes = sizeMB * 1024 * 1024 * 0.75; // Adjust for base64 overhead

  // Create a simple PNG header
  const pngHeader = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  // Pad with 'A's to reach target size
  const padding = 'A'.repeat(Math.max(0, targetBytes - pngHeader.length));

  return `data:image/png;base64,${pngHeader}${padding}`;
}

async function testImageSizes() {
  console.log('\n🔍 Testing Image Size Limits for Modification API\n');
  console.log('========================================\n');

  const proxyUrl = 'http://localhost:3001/api/together/image';

  // Test different image sizes
  const sizes = [0.1, 0.5, 1, 2, 5, 6, 8, 10, 12]; // in MB

  for (const sizeMB of sizes) {
    const initImage = createDummyBase64Image(sizeMB);
    const actualSizeMB = (initImage.length / (1024 * 1024)).toFixed(2);

    console.log(`\n📦 Testing ${sizeMB}MB image (actual: ${actualSizeMB}MB)...`);

    const testParams = {
      model: 'black-forest-labs/FLUX.1-dev',
      prompt: 'Test modification prompt',
      negativePrompt: '',
      seed: 123456,
      width: 1264,
      height: 1792,
      num_inference_steps: 28,
      guidanceScale: 7.8,
      initImage: initImage,
      imageStrength: 0.30
    };

    try {
      const startTime = Date.now();
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testParams)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        console.log(`   ✅ SUCCESS - Response in ${responseTime}ms`);
      } else {
        const errorData = await response.json();
        console.log(`   ❌ FAILED - Status ${response.status}`);
        console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);

        // Check if it's a size-related error
        if (errorData.error && errorData.error.includes('too large')) {
          console.log(`   🚨 SIZE LIMIT REACHED at ${sizeMB}MB`);
          break;
        }
      }
    } catch (error) {
      console.log(`   ❌ NETWORK ERROR: ${error.message}`);

      // Check for specific errors
      if (error.message.includes('ECONNREFUSED')) {
        console.log('   🚨 Server not running on port 3001');
        break;
      }
      if (error.message.includes('socket hang up') || error.message.includes('EPIPE')) {
        console.log(`   🚨 REQUEST TOO LARGE - Server rejected at ${sizeMB}MB`);
        break;
      }
    }
  }

  console.log('\n========================================');
  console.log('📊 Size Test Complete\n');

  // Now test with actual A1 sheet size
  console.log('🖼️ Testing with realistic A1 sheet data URL...\n');

  // Create a realistic size image (5.5MB as seen in logs)
  const realisticImage = createDummyBase64Image(5.5);
  const realisticSizeMB = (realisticImage.length / (1024 * 1024)).toFixed(2);

  console.log(`   Image size: ${realisticSizeMB}MB`);
  console.log(`   This matches the actual A1 sheet size from logs`);

  const realisticParams = {
    model: 'black-forest-labs/FLUX.1-kontext-max', // Use the actual model
    prompt: 'Test modification prompt',
    negativePrompt: '',
    seed: 299631, // Use actual seed from logs
    width: 1264,
    height: 1792,
    num_inference_steps: 28,
    guidanceScale: 7.8,
    initImage: realisticImage,
    imageStrength: 0.30
  };

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(realisticParams)
    });

    if (response.ok) {
      console.log('   ✅ Realistic size test PASSED');
    } else {
      const errorData = await response.json();
      console.log('   ❌ Realistic size test FAILED');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);
    }
  } catch (error) {
    console.log('   ❌ Network error:', error.message);
  }

  console.log('\n========================================\n');
}

// Run the test
testImageSizes().catch(console.error);