/**
 * Direct FLUX test to verify it's working
 */

const fetch = require('node-fetch');
require('dotenv').config();

async function testFLUXWorking() {
  const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

  console.log('🎨 Direct FLUX.1-dev test with Together.ai API');
  console.log(`🔑 Using API Key: ${TOGETHER_API_KEY.substring(0, 20)}...\n`);

  // Test FLUX.1-dev directly
  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-dev',
        prompt: 'Architectural floor plan, technical drawing, black lines white background, 2 story house',
        width: 1024,
        height: 1024,
        steps: 28,
        n: 1,
        seed: 123456
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ FLUX.1-dev IS WORKING!');
      console.log('📊 Response:', JSON.stringify(data, null, 2));
      console.log('\n🎨 Generated Image URL:', data.data[0].url);
      console.log('\n💰 Cost: ~$0.04 per image');
      console.log('🚀 Your $50 credits give you ~1250 images!');

      return data.data[0].url;
    } else {
      console.error('❌ FLUX.1-dev error:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return null;
  }
}

testFLUXWorking();