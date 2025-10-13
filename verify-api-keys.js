/**
 * API Key Verification Script
 * Tests all API keys to ensure they're valid before deploying to Vercel
 *
 * Usage: node verify-api-keys.js
 */

require('dotenv').config();
const https = require('https');

const results = {
  openai: { status: '⏳ Testing...', valid: null },
  replicate: { status: '⏳ Testing...', valid: null },
  googlemaps: { status: '⏳ Testing...', valid: null },
  openweather: { status: '⏳ Testing...', valid: null }
};

console.log('\n🔍 Verifying API Keys from .env file...\n');

// Test OpenAI API Key
async function testOpenAI() {
  return new Promise((resolve) => {
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;

    if (!apiKey) {
      results.openai.status = '❌ Missing';
      results.openai.valid = false;
      resolve();
      return;
    }

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        results.openai.status = '✅ Valid';
        results.openai.valid = true;
      } else if (res.statusCode === 401) {
        results.openai.status = '❌ Invalid (401 Unauthorized)';
        results.openai.valid = false;
      } else {
        results.openai.status = `⚠️ Unexpected status: ${res.statusCode}`;
        results.openai.valid = false;
      }
      resolve();
    });

    req.on('error', (error) => {
      results.openai.status = `❌ Error: ${error.message}`;
      results.openai.valid = false;
      resolve();
    });

    req.end();
  });
}

// Test Replicate API Key
async function testReplicate() {
  return new Promise((resolve) => {
    const apiKey = process.env.REACT_APP_REPLICATE_API_KEY;

    if (!apiKey) {
      results.replicate.status = '❌ Missing';
      results.replicate.valid = false;
      resolve();
      return;
    }

    const options = {
      hostname: 'api.replicate.com',
      path: '/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        results.replicate.status = '✅ Valid';
        results.replicate.valid = true;
      } else if (res.statusCode === 401) {
        results.replicate.status = '❌ Invalid (401 Unauthorized)';
        results.replicate.valid = false;
      } else {
        results.replicate.status = `⚠️ Unexpected status: ${res.statusCode}`;
        results.replicate.valid = false;
      }
      resolve();
    });

    req.on('error', (error) => {
      results.replicate.status = `❌ Error: ${error.message}`;
      results.replicate.valid = false;
      resolve();
    });

    req.end();
  });
}

// Test Google Maps API Key
async function testGoogleMaps() {
  return new Promise((resolve) => {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      results.googlemaps.status = '❌ Missing';
      results.googlemaps.valid = false;
      resolve();
      return;
    }

    const options = {
      hostname: 'maps.googleapis.com',
      path: `/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=${apiKey}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'OK') {
            results.googlemaps.status = '✅ Valid';
            results.googlemaps.valid = true;
          } else if (json.status === 'REQUEST_DENIED') {
            results.googlemaps.status = '❌ Invalid (Request Denied)';
            results.googlemaps.valid = false;
          } else {
            results.googlemaps.status = `⚠️ Status: ${json.status}`;
            results.googlemaps.valid = false;
          }
        } catch (e) {
          results.googlemaps.status = `❌ Parse error: ${e.message}`;
          results.googlemaps.valid = false;
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      results.googlemaps.status = `❌ Error: ${error.message}`;
      results.googlemaps.valid = false;
      resolve();
    });

    req.end();
  });
}

// Test OpenWeather API Key
async function testOpenWeather() {
  return new Promise((resolve) => {
    const apiKey = process.env.REACT_APP_OPENWEATHER_API_KEY;

    if (!apiKey) {
      results.openweather.status = '❌ Missing';
      results.openweather.valid = false;
      resolve();
      return;
    }

    const options = {
      hostname: 'api.openweathermap.org',
      path: `/data/2.5/weather?q=London&appid=${apiKey}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.cod === 200) {
            results.openweather.status = '✅ Valid';
            results.openweather.valid = true;
          } else if (json.cod === 401) {
            results.openweather.status = '❌ Invalid (401 Unauthorized)';
            results.openweather.valid = false;
          } else {
            results.openweather.status = `⚠️ Code: ${json.cod}`;
            results.openweather.valid = false;
          }
        } catch (e) {
          results.openweather.status = `❌ Parse error: ${e.message}`;
          results.openweather.valid = false;
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      results.openweather.status = `❌ Error: ${error.message}`;
      results.openweather.valid = false;
      resolve();
    });

    req.end();
  });
}

// Run all tests
async function runTests() {
  console.log('Testing API keys...\n');

  await Promise.all([
    testOpenAI(),
    testReplicate(),
    testGoogleMaps(),
    testOpenWeather()
  ]);

  // Print results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 API Key Verification Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`OpenAI API Key:        ${results.openai.status}`);
  console.log(`Replicate API Key:     ${results.replicate.status}`);
  console.log(`Google Maps API Key:   ${results.googlemaps.status}`);
  console.log(`OpenWeather API Key:   ${results.openweather.status}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if all valid
  const allValid = Object.values(results).every(r => r.valid === true);

  if (allValid) {
    console.log('✅ All API keys are valid and ready for Vercel deployment!');
    console.log('\n📋 Next Steps:');
    console.log('1. Open Vercel Dashboard');
    console.log('2. Go to Settings → Environment Variables');
    console.log('3. Add all 4 keys for Production, Preview, and Development');
    console.log('4. Redeploy your application');
    console.log('\n📖 See VERCEL_API_SETUP.md for detailed instructions\n');
    process.exit(0);
  } else {
    console.log('❌ Some API keys are invalid or missing!');
    console.log('\n🔧 Actions Required:');

    if (!results.openai.valid) {
      console.log('   • OpenAI: Get a valid API key from https://platform.openai.com/api-keys');
    }
    if (!results.replicate.valid) {
      console.log('   • Replicate: Get a valid API key from https://replicate.com/account/api-tokens');
    }
    if (!results.googlemaps.valid) {
      console.log('   • Google Maps: Check your API key at https://console.cloud.google.com/apis/credentials');
    }
    if (!results.openweather.valid) {
      console.log('   • OpenWeather: Get a valid API key from https://openweathermap.org/api');
    }

    console.log('\n📝 Update your .env file with valid keys and run this script again.\n');
    process.exit(1);
  }
}

runTests();
