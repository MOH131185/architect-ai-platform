/**
 * Test Together.ai FLUX.1-kontext-max API
 */

const fetch = require('node-fetch');
require('dotenv').config();

async function testTogetherAPI() {
  const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

  if (!TOGETHER_API_KEY) {
    console.error('❌ TOGETHER_API_KEY not found in .env');
    return;
  }

  console.log('🧪 Testing Together.ai FLUX.1-kontext-max...');
  console.log(`🔑 API Key: ${TOGETHER_API_KEY.substring(0, 20)}...`);

  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-kontext-max',
        prompt: 'Modern residential house exterior, architectural rendering, 2 floors, clean minimalist design',
        width: 1024,
        height: 1024,
        steps: 28,
        n: 1
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Together.ai API Error:', JSON.stringify(data, null, 2));
      return;
    }

    console.log('✅ Together.ai Response:', JSON.stringify(data, null, 2));
    console.log('\n🎨 Generated Image URL:', data.data[0].url);
    console.log('\n✅ Test Successful!');

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
  }
}

testTogetherAPI();