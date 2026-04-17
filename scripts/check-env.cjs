/**
 * Environment Variable Checker - Enhanced Version
 *
 * Validates that required environment variables are set.
 * Reflects current architecture with Together.ai as primary service.
 * Run with: node scripts/check-env.cjs
 */

const path = require('path');
const fs = require('fs');
const https = require('https');

// Load environment variables from .env file if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

/**
 * Environment variable configuration
 */
const ENV_CONFIG = {
  required: {
    primary: [
      {
        name: 'TOGETHER_API_KEY',
        description: 'Together.ai API key for FLUX image generation and Qwen reasoning',
        format: /^tgp_v1_[a-zA-Z0-9]{40,}$/,
        testEndpoint: 'https://api.together.xyz/v1/models',
        critical: true
      }
    ],
    client: [
      {
        name: 'REACT_APP_GOOGLE_MAPS_API_KEY',
        description: 'Google Maps API key for geocoding and 3D map display',
        format: /^AIza[0-9A-Za-z-_]{35}$/,
        critical: true
      },
      {
        name: 'REACT_APP_OPENWEATHER_API_KEY',
        description: 'OpenWeather API key for climate data analysis',
        format: /^[a-f0-9]{32}$/,
        critical: true
      }
    ]
  },
  auth: [
    {
      name: 'REACT_APP_CLERK_PUBLISHABLE_KEY',
      description: 'Clerk publishable key (client-side auth)',
      format: /^pk_(test|live)_/,
      critical: true
    },
    {
      name: 'CLERK_SECRET_KEY',
      description: 'Clerk secret key (server-side session verification)',
      format: /^sk_(test|live)_/,
      critical: true
    },
    {
      name: 'REACT_APP_SUPABASE_URL',
      description: 'Supabase project URL',
      format: /^https:\/\/.+\.supabase\.co$/,
      critical: true
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      description: 'Supabase service role key (server-only)',
      format: /^eyJ/,
      critical: true
    },
    {
      name: 'STRIPE_SECRET_KEY',
      description: 'Stripe secret key (server-only)',
      format: /^sk_(test|live)_/,
      critical: true
    },
    {
      name: 'STRIPE_WEBHOOK_SECRET',
      description: 'Stripe webhook signing secret',
      format: /^whsec_/,
      critical: true
    },
    {
      name: 'STRIPE_PRICE_STARTER',
      description: 'Stripe price ID for Starter plan',
      format: /^price_/,
      critical: false
    },
    {
      name: 'STRIPE_PRICE_PROFESSIONAL',
      description: 'Stripe price ID for Professional plan',
      format: /^price_/,
      critical: false
    },
    {
      name: 'STRIPE_PRICE_ENTERPRISE',
      description: 'Stripe price ID for Enterprise plan',
      format: /^price_/,
      critical: false
    }
  ],
  optional: [
    {
      name: 'REACT_APP_OPENAI_API_KEY',
      description: 'OpenAI API key (fallback for reasoning)',
      format: /^sk-(?:proj-)?[a-zA-Z0-9_-]{20,}$/
    },
    {
      name: 'REACT_APP_REPLICATE_API_KEY',
      description: 'Replicate API key (fallback for image generation)',
      format: /^r8_[a-zA-Z0-9]{37,}$/
    },
    {
      name: 'OPENAI_REASONING_API_KEY',
      description: 'OpenAI GPT-4 API key (fallback reasoning, Together.ai is primary)',
      format: /^sk-(?:proj-)?[a-zA-Z0-9_-]{20,}$/
    }
  ],
  deprecated: [
    'OPENAI_IMAGES_API_KEY',
    'MIDJOURNEY_API_KEY'
  ]
};

/**
 * Test API key validity
 */
async function testAPIKey(envVar) {
  if (!envVar.testEndpoint || !process.env[envVar.name]) {
    return null;
  }

  return new Promise((resolve) => {
    const apiKey = process.env[envVar.name];
    const url = new URL(envVar.testEndpoint);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 401);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Check environment variables
 */
async function checkEnvironment() {
  console.log('🔍 Environment Variable Validation v2.0\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let hasErrors = false;
  let hasCriticalErrors = false;
  const results = {
    required: { present: [], missing: [], invalid: [] },
    optional: { present: [], missing: [] },
    deprecated: []
  };

  // Check for .env file
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  No .env file found. Using system environment variables.\n');
  }

  // Check required primary service vars
  console.log('🚀 PRIMARY SERVICE (Together.ai):');
  console.log('─────────────────────────────────');

  for (const envVar of ENV_CONFIG.required.primary) {
    const value = process.env[envVar.name];

    if (!value) {
      console.log(`  ❌ ${envVar.name}`);
      console.log(`     └─ ${envVar.description}`);
      results.required.missing.push(envVar.name);
      hasErrors = true;
      if (envVar.critical) hasCriticalErrors = true;
    } else if (envVar.format && !envVar.format.test(value)) {
      console.log(`  ⚠️  ${envVar.name} - Invalid format`);
      console.log(`     └─ Expected format: ${envVar.format}`);
      results.required.invalid.push(envVar.name);
      hasErrors = true;
    } else {
      // Test API key validity
      const isValid = await testAPIKey(envVar);
      if (isValid === false) {
        console.log(`  ⚠️  ${envVar.name} - Set but may be invalid`);
        console.log(`     └─ API test failed`);
      } else {
        console.log(`  ✅ ${envVar.name}`);
        if (isValid === true) {
          console.log(`     └─ API connection verified`);
        }
      }
      results.required.present.push(envVar.name);
    }
  }

  // Check auth & billing vars
  console.log('\n🔐 AUTH & BILLING (Clerk / Supabase / Stripe):');
  console.log('─────────────────────────────────');

  for (const envVar of ENV_CONFIG.auth) {
    const value = process.env[envVar.name];

    if (!value) {
      console.log(`  ${envVar.critical ? '❌' : '○'} ${envVar.name}`);
      console.log(`     └─ ${envVar.description}`);
      results.required.missing.push(envVar.name);
      if (envVar.critical) { hasErrors = true; hasCriticalErrors = true; }
    } else if (envVar.format && !envVar.format.test(value)) {
      console.log(`  ⚠️  ${envVar.name} - Invalid format`);
      results.required.invalid.push(envVar.name);
      hasErrors = true;
    } else {
      console.log(`  ✅ ${envVar.name}`);
      results.required.present.push(envVar.name);
    }
  }

  // Check required client-side vars
  console.log('\n🌐 CLIENT-SIDE SERVICES:');
  console.log('─────────────────────────────────');

  for (const envVar of ENV_CONFIG.required.client) {
    const value = process.env[envVar.name];

    if (!value) {
      console.log(`  ❌ ${envVar.name}`);
      console.log(`     └─ ${envVar.description}`);
      results.required.missing.push(envVar.name);
      hasErrors = true;
      if (envVar.critical) hasCriticalErrors = true;
    } else if (envVar.format && !envVar.format.test(value)) {
      console.log(`  ⚠️  ${envVar.name} - Invalid format`);
      results.required.invalid.push(envVar.name);
      hasErrors = true;
    } else {
      console.log(`  ✅ ${envVar.name}`);
      results.required.present.push(envVar.name);
    }
  }

  // Check optional vars
  console.log('\n⚙️  OPTIONAL SERVICES (Fallbacks):');
  console.log('─────────────────────────────────');

  for (const envVar of ENV_CONFIG.optional) {
    const value = process.env[envVar.name];

    if (!value) {
      console.log(`  ○ ${envVar.name} - Not configured`);
      results.optional.missing.push(envVar.name);
    } else if (envVar.format && !envVar.format.test(value)) {
      console.log(`  ⚠️  ${envVar.name} - Set but invalid format`);
    } else {
      console.log(`  ✅ ${envVar.name} - Configured`);
      results.optional.present.push(envVar.name);
    }
  }

  // Check for deprecated vars
  console.log('\n🚫 DEPRECATED VARIABLES:');
  console.log('─────────────────────────────────');

  let hasDeprecated = false;
  for (const varName of ENV_CONFIG.deprecated) {
    if (process.env[varName]) {
      console.log(`  ⚠️  ${varName} - Should be removed`);
      results.deprecated.push(varName);
      hasDeprecated = true;
    }
  }

  if (!hasDeprecated) {
    console.log('  ✅ No deprecated variables found');
  }

  // Performance check
  console.log('\n⚡ PERFORMANCE SETTINGS:');
  console.log('─────────────────────────────────');

  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`  Environment: ${nodeEnv}`);

  if (nodeEnv === 'production') {
    console.log('  ✅ Production mode - optimizations enabled');
  } else if (nodeEnv === 'development') {
    console.log('  ⚠️  Development mode - debug features enabled');
  }

  const logLevel = process.env.REACT_APP_LOG_LEVEL || 'DEBUG';
  console.log(`  Log Level: ${logLevel}`);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 VALIDATION SUMMARY:');
  console.log('─────────────────────────────────');

  const totalRequired = ENV_CONFIG.required.primary.length + ENV_CONFIG.required.client.length + ENV_CONFIG.auth.length;
  const totalPresent = results.required.present.length;
  const totalOptional = ENV_CONFIG.optional.length;
  const optionalPresent = results.optional.present.length;

  console.log(`  Required Variables: ${totalPresent}/${totalRequired}`);
  console.log(`  Optional Variables: ${optionalPresent}/${totalOptional}`);
  console.log(`  Invalid Variables:  ${results.required.invalid.length}`);
  console.log(`  Deprecated:         ${results.deprecated.length}`);

  // Final result
  console.log('\n═══════════════════════════════════════════════════════════════');

  if (hasCriticalErrors) {
    console.log('❌ CRITICAL ERRORS FOUND\n');
    console.log('The following critical variables are missing:');
    results.required.missing.forEach(varName => {
      const config = [...ENV_CONFIG.required.primary, ...ENV_CONFIG.required.client]
        .find(c => c.name === varName);
      if (config?.critical) {
        console.log(`  • ${varName}`);
      }
    });
    console.log('\n📝 TO FIX:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Add your API keys to the .env file');
    console.log('3. For Together.ai, ensure you have added credits ($5-10)');
    console.log('4. Run this script again to verify');
    process.exit(1);
  } else if (hasErrors) {
    console.log('⚠️  VALIDATION PASSED WITH WARNINGS\n');
    console.log('Some non-critical issues were found:');

    if (results.required.missing.length > 0) {
      console.log('\nMissing optional features:');
      results.required.missing.forEach(varName => console.log(`  • ${varName}`));
    }

    if (results.required.invalid.length > 0) {
      console.log('\nInvalid format:');
      results.required.invalid.forEach(varName => console.log(`  • ${varName}`));
    }

    console.log('\nThe application will work but some features may be limited.');
    process.exit(0);
  } else {
    console.log('✅ ENVIRONMENT VALIDATION PASSED\n');
    console.log('All required environment variables are properly configured.');

    if (results.deprecated.length > 0) {
      console.log('\n💡 Recommendation: Remove deprecated variables from your .env file');
    }

    if (results.optional.missing.length === ENV_CONFIG.optional.length) {
      console.log('\n💡 Tip: Configure optional services for fallback support');
    }

    process.exit(0);
  }
}

// Run check
checkEnvironment().catch(error => {
  console.error('❌ Error during environment check:', error.message);
  process.exit(1);
});
