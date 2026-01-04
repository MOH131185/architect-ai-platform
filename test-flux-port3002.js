/**
 * Test FLUX on port 3002
 */

const fetch = require('node-fetch');

async function testFluxPort3002() {
  console.log('🚀 Testing FLUX.1 on port 3002...\n');

  console.log('📐 Testing FLUX Floor Plan...');
  try {
    const response = await fetch('http://localhost:3002/api/together/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Architectural floor plan, 2D overhead view',
        width: 512,
        height: 512,
        seed: 123,
        num_inference_steps: 4  // FLUX schnell needs only 1-12 steps
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success!', data);
    } else {
      console.log('❌ Failed:', response.status, response.statusText);
      const text = await response.text();
      console.log('Response:', text.substring(0, 200));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFluxPort3002();