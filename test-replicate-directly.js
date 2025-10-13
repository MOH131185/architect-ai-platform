#!/usr/bin/env node

/**
 * Direct test of Replicate API through proxy
 * This tests floor plan generation specifically
 */

const http = require('http');

console.log('🧪 Testing Replicate API directly for floor plan generation\n');
console.log('═══════════════════════════════════════════════════════\n');

async function testFloorPlanGeneration() {
  console.log('📐 Testing Floor Plan Generation via Replicate API\n');

  const requestData = JSON.stringify({
    version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    input: {
      prompt: "ARCHITECTURAL FLOOR PLAN: Professional 2D architectural floor plan, ground level technical blueprint of 2-story contemporary house with north-facing entrance (200m² total area), ground floor containing: entrance hall, living room, kitchen, dining area, entrance on north side, showing clear wall outlines as thick black lines, door openings with arc swing indicators, window openings as parallel lines in walls, room names and area labels in m², furniture layout indicators, dimension lines with measurements, grid lines if applicable, north arrow indicator, scale notation 1:100, professional CAD-style technical drawing, clean black lines on white background, orthographic top-down view only, architectural drafting standards, NO 3D elements whatsoever, NO perspective, NO shading, NO rendering, flat 2D technical documentation",
      negative_prompt: "3D rendering, perspective view, isometric, axonometric, exterior view, building facade, photorealistic, colored, shaded, rendered, artistic, elevation, section, site plan, landscape, trees, cars, people, sky, clouds, shadows, materials, textures, lighting effects, reflections, 3D visualization, architectural photography, street view, aerial perspective, building exterior, outdoor environment",
      num_outputs: 1,
      width: 1024,
      height: 1024,
      num_inference_steps: 45,
      guidance_scale: 8.5,
      seed: 123456
    }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/replicate/predictions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    console.log('📤 Sending request to proxy server at http://localhost:3001/api/replicate/predictions\n');

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`   Status Code: ${res.statusCode}`);

          if (res.statusCode === 201 || res.statusCode === 200) {
            console.log('   ✅ Replicate API Response Successful');
            console.log(`   Prediction ID: ${json.id || 'N/A'}`);
            console.log(`   Status: ${json.status || 'N/A'}`);
            console.log(`   Created At: ${json.created_at || 'N/A'}`);

            if (json.urls) {
              console.log(`   URLs:`, json.urls);
            }

            console.log('\n   💡 Floor plan generation request accepted by Replicate');
            console.log('   📊 The prediction will process asynchronously');

            if (json.id) {
              console.log(`\n   To check status, poll: http://localhost:3001/api/replicate/predictions/${json.id}`);
            }

          } else if (res.statusCode === 401) {
            console.log('   ❌ Replicate API: 401 Unauthorized');
            console.log('   🔧 Check REACT_APP_REPLICATE_API_KEY in .env');
            console.log(`   Error details: ${json.detail || json.error || 'Unknown'}`);
          } else if (res.statusCode === 404) {
            console.log('   ❌ 404 Not Found');
            console.log('   🔧 Check if proxy server is running on port 3001');
          } else {
            console.log(`   ⚠️  Unexpected status: ${res.statusCode}`);
            console.log(`   Error: ${json.detail || json.error || 'Unknown'}`);
            console.log(`   Full response:`, JSON.stringify(json, null, 2));
          }
        } catch (e) {
          console.error('   ❌ Failed to parse response:', e.message);
          console.error('   Raw response:', data);
        }
        console.log('');
        resolve();
      });
    });

    req.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        console.error(`   ❌ Connection refused - Proxy server not running on port 3001`);
        console.error(`   🔧 Run 'npm run server' to start the proxy server`);
      } else {
        console.error(`   ❌ Request failed: ${error.message}`);
      }
      resolve();
    });

    req.write(requestData);
    req.end();
  });
}

// Run the test
testFloorPlanGeneration().catch(console.error);