#!/usr/bin/env node

/**
 * Test OpenAI API Endpoint
 * Makes a simple request to verify the API is working
 */

const https = require('https');

async function testOpenAI() {
  console.log('🧪 Testing OpenAI API endpoint...\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const requestData = JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "API is working!" in exactly 3 words.' }
    ],
    max_tokens: 10,
    temperature: 0.7
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'www.archiaisolution.pro',
      path: '/api/openai-chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    console.log('📤 Sending test request to /api/openai-chat...\n');

    const req = https.request(options, (res) => {
      console.log(`📥 Response Status: ${res.statusCode}`);
      console.log(`📥 Response Headers:`, res.headers);
      console.log('');

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode === 200) {
            console.log('✅ SUCCESS! OpenAI API is working!\n');
            console.log('Response:', JSON.stringify(json, null, 2));
            console.log('\n═══════════════════════════════════════════════════════\n');
            console.log('🎉 Your API keys are configured correctly in Vercel!');
            console.log('🎉 The image generation issue should be RESOLVED!');
            console.log('\n📋 Next steps:');
            console.log('1. Visit https://www.archiaisolution.pro');
            console.log('2. Try generating a design');
            console.log('3. Images should now generate successfully!\n');
          } else if (res.statusCode === 401) {
            console.log('❌ FAILED: 401 Unauthorized\n');
            console.log('Error:', JSON.stringify(json, null, 2));
            console.log('\n═══════════════════════════════════════════════════════\n');
            console.log('⚠️  API key is configured but INVALID');
            console.log('\n📋 Possible issues:');
            console.log('1. The API key in Vercel is incorrect or expired');
            console.log('2. The API key doesn\'t have proper permissions');
            console.log('3. OpenAI account has billing issues');
            console.log('\n🔧 To fix:');
            console.log('1. Go to https://platform.openai.com/api-keys');
            console.log('2. Generate a NEW API key');
            console.log('3. Update REACT_APP_OPENAI_API_KEY in Vercel');
            console.log('4. Redeploy the application\n');
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

testOpenAI().catch(console.error);
