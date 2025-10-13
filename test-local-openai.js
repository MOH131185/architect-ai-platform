#!/usr/bin/env node

/**
 * Test Local OpenAI API Proxy
 * Sends a simple request to localhost:3001 to trigger debug logging
 */

const http = require('http');

async function testLocalOpenAI() {
  console.log('🧪 Testing local OpenAI API proxy...\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const requestData = JSON.stringify({
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: "Say 'API test successful' in one sentence."
      }
    ],
    max_tokens: 50,
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

    console.log('📤 Sending test request to http://localhost:3001/api/openai/chat...\n');

    const req = http.request(options, (res) => {
      console.log(`📥 Response Status: ${res.statusCode}\n`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode === 200) {
            console.log('✅ SUCCESS! Local OpenAI API proxy is working!\n');
            console.log('Response:', JSON.stringify(json, null, 2));
          } else if (res.statusCode === 401) {
            console.log('❌ FAILED: 401 Unauthorized\n');
            console.log('Error:', JSON.stringify(json, null, 2));
            console.log('\n═══════════════════════════════════════════════════════\n');
            console.log('⚠️  Check the API proxy server logs above for details');
            console.log('📋 The server should show:');
            console.log('   - API key format and length');
            console.log('   - Error response from OpenAI\n');
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
      console.log('\n⚠️  Make sure the API proxy server is running:');
      console.log('   npm run server\n');
      resolve();
    });

    req.write(requestData);
    req.end();
  });
}

testLocalOpenAI().catch(console.error);
