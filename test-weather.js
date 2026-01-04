import weatherService from './src/services/weatherService.js';

async function testWeather() {
    console.log('Testing Weather Service...');
    try {
        // London coordinates
        const data = await weatherService.getClimateData(51.5074, -0.1278);
        console.log('Weather Data:', JSON.stringify(data, null, 2));

        if (data.temperature && data.wind && data.precipitation) {
            console.log('✅ Weather Service returned expected structure');
        } else {
            console.error('❌ Weather Service returned unexpected structure');
        }
    } catch (error) {
        console.error('❌ Weather Service failed:', error);
    }
}

testWeather();
