/**
 * Direct test of Together.ai FLUX with refresh
 */

const fetch = require('node-fetch');
require('dotenv').config();

async function testFLUXDirect() {
  const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

  console.log('🔄 Testing FLUX.1-kontext-max with $50 credits...');
  console.log('💰 Balance: $50 (should be Build Tier 2)\n');

  // First, let's check what models are available
  console.log('📋 Checking available models...');
  try {
    const modelsResponse = await fetch('https://api.together.xyz/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      }
    });

    if (modelsResponse.ok) {
      const models = await modelsResponse.json();
      const imageModels = models.filter(m => m.display_type === 'image' || m.name.includes('flux'));
      console.log(`Found ${imageModels.length} image models`);

      const fluxModel = imageModels.find(m => m.name.includes('flux'));
      if (fluxModel) {
        console.log('✅ FLUX model found:', fluxModel.name);
      }
    }
  } catch (error) {
    console.error('Error checking models:', error.message);
  }

  // Try FLUX with minimal parameters
  console.log('\n🎨 Attempting FLUX.1-kontext-max generation...');
  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',  // Try schnell version (might be lower tier)
        prompt: 'Modern house architectural rendering',
        width: 512,
        height: 512,
        steps: 4,
        n: 1
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✅ FLUX.1-schnell WORKS!');
      console.log('   Image URL:', data.data[0].url);
    } else {
      console.log('❌ FLUX.1-schnell blocked:', data.error?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Try FLUX.1-dev
  console.log('\n🎨 Attempting FLUX.1-dev...');
  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-dev',
        prompt: 'Architectural floor plan, technical drawing',
        width: 1024,
        height: 1024,
        steps: 28,
        n: 1
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✅ FLUX.1-dev WORKS!');
      console.log('   Image URL:', data.data[0].url);
    } else {
      console.log('❌ FLUX.1-dev blocked:', data.error?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n📌 Note: If still showing Tier 1:');
  console.log('   1. Log out and back in at together.ai');
  console.log('   2. Generate a new API key');
  console.log('   3. Update the .env file with new key');
  console.log('   4. Restart the servers');
}

testFLUXDirect();