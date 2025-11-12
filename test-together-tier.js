/**
 * Check Together.ai account tier and balance
 */

const fetch = require('node-fetch');
require('dotenv').config();

async function checkTogetherAccount() {
  const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

  if (!TOGETHER_API_KEY) {
    console.error('❌ TOGETHER_API_KEY not found in .env');
    return;
  }

  console.log('🔍 Checking Together.ai account status...');
  console.log(`🔑 API Key: ${TOGETHER_API_KEY.substring(0, 20)}...`);

  // Check account status
  try {
    const accountResponse = await fetch('https://api.together.xyz/v1/account', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      }
    });

    if (accountResponse.ok) {
      const accountData = await accountResponse.json();
      console.log('\n✅ Account Status:', JSON.stringify(accountData, null, 2));
    } else {
      console.log('❌ Could not get account status');
    }
  } catch (error) {
    console.error('Error checking account:', error.message);
  }

  // Try a simple completion to check if API works
  console.log('\n🧪 Testing simple completion...');
  try {
    const testResponse = await fetch('https://api.together.xyz/v1/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-2-7b-chat-hf',
        prompt: 'Hello',
        max_tokens: 10
      })
    });

    const testData = await testResponse.json();
    if (testResponse.ok) {
      console.log('✅ API is working!');
    } else {
      console.log('❌ API test failed:', testData);
    }
  } catch (error) {
    console.error('Error testing API:', error.message);
  }

  // Test FLUX specifically
  console.log('\n🎨 Testing FLUX.1-kontext-max...');
  try {
    const fluxResponse = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-kontext-max',
        prompt: 'Simple test',
        width: 512,
        height: 512,
        steps: 4,
        n: 1
      })
    });

    const fluxData = await fluxResponse.json();
    if (fluxResponse.ok) {
      console.log('✅ FLUX.1-kontext-max is WORKING!');
      console.log('   Image URL:', fluxData.data[0].url);
    } else {
      console.log('❌ FLUX still blocked:', fluxData.error);
    }
  } catch (error) {
    console.error('Error testing FLUX:', error.message);
  }
}

checkTogetherAccount();