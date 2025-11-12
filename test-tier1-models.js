/**
 * Test Together.ai Build Tier 1 Models (with $30 credits)
 */

const fetch = require('node-fetch');
require('dotenv').config();

async function testTier1Models() {
  const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

  console.log('🧪 Testing Together.ai Build Tier 1 Models...');
  console.log('💰 You have $30 credits - testing what works!\n');

  // Test Stable Diffusion 2.1 (should work on Tier 1)
  console.log('📐 Test 1: Stable Diffusion 2.1');
  try {
    const sd21Response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'stabilityai/stable-diffusion-2-1',
        prompt: 'Modern house architectural rendering, 2 floors, clean design',
        width: 512,
        height: 512,
        steps: 25,
        n: 1
      })
    });

    const sd21Data = await sd21Response.json();
    if (sd21Response.ok) {
      console.log('✅ Stable Diffusion 2.1 WORKS!');
      console.log('   Image URL:', sd21Data.data[0].url);
    } else {
      console.log('❌ SD 2.1 blocked:', sd21Data.error?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test Stable Diffusion XL (might work)
  console.log('\n📐 Test 2: Stable Diffusion XL');
  try {
    const sdxlResponse = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'stabilityai/stable-diffusion-xl-base-1.0',
        prompt: 'Architectural floor plan, technical drawing, black lines on white',
        width: 1024,
        height: 1024,
        steps: 25,
        n: 1
      })
    });

    const sdxlData = await sdxlResponse.json();
    if (sdxlResponse.ok) {
      console.log('✅ SDXL WORKS on Tier 1!');
      console.log('   Image URL:', sdxlData.data[0].url);
    } else {
      console.log('❌ SDXL blocked:', sdxlData.error?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test OpenJourney (free model)
  console.log('\n📐 Test 3: OpenJourney (Free)');
  try {
    const ojResponse = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'prompthero/openjourney',
        prompt: 'Architectural visualization of modern house',
        width: 512,
        height: 512,
        steps: 25,
        n: 1
      })
    });

    const ojData = await ojResponse.json();
    if (ojResponse.ok) {
      console.log('✅ OpenJourney WORKS!');
      console.log('   Image URL:', ojData.data[0].url);
    } else {
      console.log('❌ OpenJourney blocked:', ojData.error?.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n📊 Summary:');
  console.log('   💰 Credits: $30 (Build Tier 1)');
  console.log('   🎯 For FLUX.1-kontext-max: Need $50 total (Build Tier 2)');
  console.log('   ✅ Can use: SD 2.1, OpenJourney, and other Tier 1 models');
  console.log('   ⏳ Options: Add $20 more OR use available models now');
}

testTier1Models();