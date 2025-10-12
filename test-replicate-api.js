#!/usr/bin/env node

/**
 * Test Replicate API Endpoint
 * Verifies Replicate API key is working
 */

const https = require('https');

async function testReplicate() {
  console.log('🧪 Testing Replicate API endpoint...\n');
  console.log('═══════════════════════════════════════════════════════\n');

  // Simple test prompt
  const requestData = JSON.stringify({
    version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    input: {
      prompt: "test architectural rendering",
      num_outputs: 1,
      width: 512,
      height: 512,
      num_inference_steps: 20
    }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'www.archiaisolution.pro',
      path: '/api/replicate-predictions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    console.log('📤 Sending test prediction request to /api/replicate-predictions...\n');

    const req = https.request(options, (res) => {
      console.log(`📥 Response Status: ${res.statusCode}`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode === 201 || res.statusCode === 200) {
            console.log('✅ SUCCESS! Replicate API is working!\n');
            console.log('Prediction Created:');
            console.log(`  - ID: ${json.id || 'N/A'}`);
            console.log(`  - Status: ${json.status || 'N/A'}`);
            console.log(`  - Model: SDXL`);
            console.log('\n═══════════════════════════════════════════════════════\n');
            console.log('🎉 Both OpenAI and Replicate APIs are working!');
            console.log('🎉 Image generation should now work completely!');
            console.log('\n📋 Next steps:');
            console.log('1. Visit https://www.archiaisolution.pro');
            console.log('2. Go through the complete workflow');
            console.log('3. Generate a design');
            console.log('4. Real architectural images should appear!\n');
          } else if (res.statusCode === 401) {
            console.log('❌ FAILED: 401 Unauthorized\n');
            console.log('Error:', JSON.stringify(json, null, 2));
            console.log('\n═══════════════════════════════════════════════════════\n');
            console.log('⚠️  Replicate API key is configured but INVALID');
            console.log('\n📋 To fix:');
            console.log('1. Check your Replicate account: https://replicate.com/account');
            console.log('2. Get your API token from: https://replicate.com/account/api-tokens');
            console.log('3. Update REACT_APP_REPLICATE_API_KEY in Vercel');
            console.log('4. Redeploy the application\n');
          } else if (res.statusCode === 402) {
            console.log('❌ FAILED: 402 Payment Required\n');
            console.log('Error:', JSON.stringify(json, null, 2));
            console.log('\n═══════════════════════════════════════════════════════\n');
            console.log('⚠️  Insufficient credits in Replicate account');
            console.log('\n📋 To fix:');
            console.log('1. Go to: https://replicate.com/account/billing');
            console.log('2. Add credits to your account');
            console.log('3. Retry generation\n');
          } else {
            console.log(`⚠️  Unexpected status: ${res.statusCode}\n`);
            console.log('Response:', JSON.stringify(json, null, 2));
          }
        } catch (e) {
          console.error('❌ Failed to parse response:', e.message);
          console.log('Raw response:', data);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      resolve();
    });

    req.write(requestData);
    req.end();
  });
}

testReplicate().catch(console.error);
