// Test script to verify location analysis APIs
const axios = require('axios');
require('dotenv').config();

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const OPENWEATHER_API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY;

async function testGoogleGeocoding() {
  console.log('\n🗺️  Testing Google Geocoding API...');

  if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ REACT_APP_GOOGLE_MAPS_API_KEY not found in .env');
    return false;
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: '1600 Amphitheatre Parkway, Mountain View, CA',
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK') {
      const result = response.data.results[0];
      console.log('✅ Google Geocoding API working');
      console.log(`   Address: ${result.formatted_address}`);
      console.log(`   Coords: ${result.geometry.location.lat}, ${result.geometry.location.lng}`);
      return true;
    } else {
      console.error(`❌ Geocoding failed with status: ${response.data.status}`);
      if (response.data.error_message) {
        console.error(`   Error: ${response.data.error_message}`);
      }
      return false;
    }
  } catch (error) {
    console.error('❌ Google Geocoding API error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

async function testOpenWeatherAPI() {
  console.log('\n☀️  Testing OpenWeather API...');

  if (!OPENWEATHER_API_KEY) {
    console.error('❌ REACT_APP_OPENWEATHER_API_KEY not found in .env');
    return false;
  }

  try {
    // Test with Mountain View coordinates
    const lat = 37.4220;
    const lng = -122.0841;

    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        lat: lat,
        lon: lng,
        appid: OPENWEATHER_API_KEY,
        units: 'metric'
      }
    });

    if (response.data && response.data.main) {
      console.log('✅ OpenWeather API working');
      console.log(`   Location: ${response.data.name}`);
      console.log(`   Temperature: ${response.data.main.temp}°C`);
      console.log(`   Weather: ${response.data.weather[0].description}`);
      return true;
    } else {
      console.error('❌ OpenWeather API returned unexpected data');
      return false;
    }
  } catch (error) {
    console.error('❌ OpenWeather API error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════');
  console.log('🔍 Location Analysis API Tests');
  console.log('═══════════════════════════════════════');

  const geocodingWorks = await testGoogleGeocoding();
  const weatherWorks = await testOpenWeatherAPI();

  console.log('\n═══════════════════════════════════════');
  console.log('📊 Test Results Summary');
  console.log('═══════════════════════════════════════');
  console.log(`Google Geocoding: ${geocodingWorks ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`OpenWeather API: ${weatherWorks ? '✅ PASS' : '❌ FAIL'}`);

  if (geocodingWorks && weatherWorks) {
    console.log('\n✅ All location APIs are working correctly!');
    console.log('\n💡 If "Analyze Location" button still not working, check:');
    console.log('   1. Browser console for JavaScript errors');
    console.log('   2. Network tab for failed requests');
    console.log('   3. React dev tools for component state');
  } else {
    console.log('\n❌ Some APIs failed - location analysis will not work properly');
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
