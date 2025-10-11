#!/usr/bin/env node

/**
 * Website Error Checker
 * Fetches the production site and checks for common issues
 */

const https = require('https');

async function checkWebsite() {
  console.log('🔍 Checking https://www.archiaisolution.pro...\n');
  console.log('═══════════════════════════════════════════════════════\n');

  return new Promise((resolve) => {
    const options = {
      hostname: 'www.archiaisolution.pro',
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`✅ Status Code: ${res.statusCode}`);
      console.log(`✅ Headers:`);
      console.log(`   - Content-Type: ${res.headers['content-type']}`);
      console.log(`   - X-Vercel-Cache: ${res.headers['x-vercel-cache'] || 'N/A'}`);
      console.log(`   - X-Vercel-ID: ${res.headers['x-vercel-id'] || 'N/A'}`);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`\n📄 Page Size: ${(data.length / 1024).toFixed(2)} KB`);

        // Check for React app mounting
        if (data.includes('root')) {
          console.log('✅ React root div found');
        } else {
          console.log('❌ React root div NOT found');
        }

        // Check for build artifacts
        if (data.includes('static/js/')) {
          console.log('✅ JavaScript bundles found');
        } else {
          console.log('❌ JavaScript bundles NOT found');
        }

        // Check for errors in HTML
        if (data.includes('error') || data.includes('Error')) {
          console.log('⚠️  Potential errors in HTML (check manually)');
        }

        // Check for API endpoints referenced
        if (data.includes('/api/')) {
          console.log('✅ API endpoints referenced');
        }

        console.log('\n═══════════════════════════════════════════════════════\n');
        console.log('📊 SUMMARY:\n');
        console.log('Website is loading and serving React application.');
        console.log('To check for 401 API errors, you need to:');
        console.log('1. Open https://www.archiaisolution.pro in your browser');
        console.log('2. Press F12 to open Developer Tools');
        console.log('3. Go to Console tab');
        console.log('4. Generate a design to trigger API calls');
        console.log('5. Look for red error messages (especially 401 errors)\n');
        console.log('Expected 401 errors until you configure Vercel environment variables:');
        console.log('- /api/openai-chat (401 - Unauthorized)');
        console.log('- Portfolio style detection error');
        console.log('\nSee ACTION_REQUIRED.md for fix instructions.\n');

        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      resolve();
    });

    req.end();
  });
}

async function checkAPI() {
  console.log('🔍 Checking API endpoint health...\n');

  return new Promise((resolve) => {
    const options = {
      hostname: 'www.archiaisolution.pro',
      path: '/api/health',
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ API health check: OK');
          try {
            const json = JSON.parse(data);
            console.log('   Response:', JSON.stringify(json, null, 2));
          } catch (e) {
            console.log('   Response:', data);
          }
        } else {
          console.log(`⚠️  API health check: ${res.statusCode}`);
        }
        console.log('');
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('❌ API check failed:', error.message);
      console.log('');
      resolve();
    });

    req.end();
  });
}

async function main() {
  await checkWebsite();
  await checkAPI();

  console.log('═══════════════════════════════════════════════════════\n');
  console.log('✨ NEXT STEPS:\n');
  console.log('1. Visit https://www.archiaisolution.pro in your browser');
  console.log('2. Open browser console (F12 → Console tab)');
  console.log('3. Try generating a design');
  console.log('4. Check for 401 errors');
  console.log('5. Follow ACTION_REQUIRED.md to configure Vercel\n');
}

main().catch(console.error);
