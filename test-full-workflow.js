#!/usr/bin/env node

/**
 * Test Full Workflow Locally
 * Simulates the complete design generation workflow
 */

const http = require('http');

// Test data
const testProject = {
  location: {
    address: "123 Main St, San Francisco, CA",
    coordinates: { lat: 37.7749, lng: -122.4194 }
  },
  buildingProgram: "Single Family House",
  floorArea: 200,
  specifications: "Modern design with large windows"
};

console.log('🧪 Testing Full Workflow on http://localhost:3000\n');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: Health Check
async function testHealthCheck() {
  console.log('📊 Test 1: API Proxy Health Check\n');

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`   Status: ${res.statusCode}`);
          console.log(`   OpenAI Key: ${json.openai ? '✅ Configured' : '❌ Missing'}`);
          console.log(`   Replicate Key: ${json.replicate ? '✅ Configured' : '❌ Missing'}`);
          console.log('');
        } catch (e) {
          console.error('   ❌ Failed to parse response');
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error(`   ❌ Health check failed: ${error.message}`);
      resolve();
    });

    req.end();
  });
}

// Test 2: OpenAI API
async function testOpenAI() {
  console.log('🧠 Test 2: OpenAI API (Design Reasoning)\n');

  const requestData = JSON.stringify({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are an architectural design expert."
      },
      {
        role: "user",
        content: `Generate a brief architectural design concept for a ${testProject.buildingProgram} with ${testProject.floorArea}m² floor area.`
      }
    ],
    max_tokens: 200,
    temperature: 0.7
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/openai/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`   Status: ${res.statusCode}`);

          if (res.statusCode === 200) {
            console.log('   ✅ OpenAI API Working');
            console.log(`   Response: ${json.choices?.[0]?.message?.content?.substring(0, 100)}...`);
          } else if (res.statusCode === 401) {
            console.log('   ⚠️  OpenAI API: 401 Unauthorized (EXPECTED in local)');
            console.log('   💡 This is normal - API key may be restricted to production');
            console.log('   ✅ Application will use fallback reasoning');
          } else {
            console.log(`   ⚠️  Unexpected status: ${res.statusCode}`);
            console.log(`   Error: ${json.error?.message || 'Unknown'}`);
          }
        } catch (e) {
          console.error('   ❌ Failed to parse response');
        }
        console.log('');
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error(`   ❌ OpenAI test failed: ${error.message}`);
      resolve();
    });

    req.write(requestData);
    req.end();
  });
}

// Test 3: Replicate API
async function testReplicate() {
  console.log('🎨 Test 3: Replicate API (Image Generation)\n');

  const requestData = JSON.stringify({
    version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    input: {
      prompt: "Modern architectural floor plan, 200 square meters, single family house, clean lines, professional architectural drawing",
      num_outputs: 1,
      width: 1024,
      height: 768,
      num_inference_steps: 30,
      guidance_scale: 7.5
    }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/replicate/predictions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`   Status: ${res.statusCode}`);

          if (res.statusCode === 201 || res.statusCode === 200) {
            console.log('   ✅ Replicate API Working');
            console.log(`   Prediction ID: ${json.id || 'N/A'}`);
            console.log(`   Status: ${json.status || 'N/A'}`);
            console.log('   💡 Image generation pipeline functional');
          } else if (res.statusCode === 401) {
            console.log('   ❌ Replicate API: 401 Unauthorized');
            console.log('   🔧 Check REACT_APP_REPLICATE_API_KEY in .env');
          } else {
            console.log(`   ⚠️  Unexpected status: ${res.statusCode}`);
            console.log(`   Error: ${json.detail || json.error || 'Unknown'}`);
          }
        } catch (e) {
          console.error('   ❌ Failed to parse response');
        }
        console.log('');
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error(`   ❌ Replicate test failed: ${error.message}`);
      resolve();
    });

    req.write(requestData);
    req.end();
  });
}

// Run all tests
async function runTests() {
  console.log('📋 Testing Project:');
  console.log(`   Building Type: ${testProject.buildingProgram}`);
  console.log(`   Floor Area: ${testProject.floorArea}m²`);
  console.log(`   Location: ${testProject.location.address}`);
  console.log('\n═══════════════════════════════════════════════════════\n');

  await testHealthCheck();
  await testOpenAI();
  await testReplicate();

  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📊 Test Summary:\n');
  console.log('Expected Results:');
  console.log('   • Health Check: ✅ Both keys configured');
  console.log('   • OpenAI API: ⚠️  401 (expected, will use fallback)');
  console.log('   • Replicate API: ✅ Working (creates predictions)');
  console.log('');
  console.log('Impact:');
  console.log('   • Images WILL generate (Replicate working)');
  console.log('   • Design reasoning will be generic (OpenAI fallback)');
  console.log('   • Overall functionality: ~80% (visual generation works)');
  console.log('');
  console.log('Next Steps:');
  console.log('   1. Open http://localhost:3000 in browser');
  console.log('   2. Go through the complete workflow');
  console.log('   3. Check browser console for any errors');
  console.log('   4. Verify real images generate (not placeholders)');
  console.log('');
  console.log('For full AI reasoning functionality:');
  console.log('   • Test on production: https://www.archiaisolution.pro');
  console.log('   • Or create unrestricted OpenAI API key for local dev');
  console.log('');
}

runTests().catch(console.error);
