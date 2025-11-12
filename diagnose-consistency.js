/**
 * Automated Consistency Diagnostic Script
 * Checks why 2D/3D results are inconsistent
 *
 * Usage: node diagnose-consistency.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 ========== CONSISTENCY DIAGNOSTIC ==========\n');

const issues = [];
const warnings = [];
const passes = [];

// ========================================
// TEST 1: Check .env file exists
// ========================================
console.log('TEST 1: Checking .env file...');
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  issues.push('❌ .env file not found - create it from .env.example');
} else {
  passes.push('✅ .env file exists');

  // Read .env contents
  const envContent = fs.readFileSync(envPath, 'utf-8');

  // TEST 2: Check TOGETHER_API_KEY
  console.log('TEST 2: Checking TOGETHER_API_KEY...');
  if (!envContent.includes('TOGETHER_API_KEY=') || envContent.includes('TOGETHER_API_KEY=your_')) {
    issues.push('❌ TOGETHER_API_KEY not set in .env - this is REQUIRED for DNA workflow');
    issues.push('   Get key from: https://api.together.ai/settings/api-keys');
    issues.push('   Add credits ($5-10): https://api.together.ai/settings/billing');
  } else {
    const keyMatch = envContent.match(/TOGETHER_API_KEY=(\S+)/);
    if (keyMatch && keyMatch[1].startsWith('tgp_v1_')) {
      passes.push('✅ TOGETHER_API_KEY is set and valid format');
    } else {
      warnings.push('⚠️  TOGETHER_API_KEY format looks incorrect (should start with tgp_v1_)');
    }
  }

  // TEST 3: Check REACT_APP_OPENAI_API_KEY (needed for DNA generation)
  console.log('TEST 3: Checking REACT_APP_OPENAI_API_KEY...');
  if (!envContent.includes('REACT_APP_OPENAI_API_KEY=') || envContent.includes('REACT_APP_OPENAI_API_KEY=your_')) {
    warnings.push('⚠️  REACT_APP_OPENAI_API_KEY not set - DNA generation will fail and fallback to legacy');
    warnings.push('   Get key from: https://platform.openai.com/api-keys');
  } else {
    passes.push('✅ REACT_APP_OPENAI_API_KEY is set');
  }

  // TEST 4: Check Google Maps API Key (nice to have)
  console.log('TEST 4: Checking REACT_APP_GOOGLE_MAPS_API_KEY...');
  if (!envContent.includes('REACT_APP_GOOGLE_MAPS_API_KEY=') || envContent.includes('REACT_APP_GOOGLE_MAPS_API_KEY=your_')) {
    warnings.push('⚠️  REACT_APP_GOOGLE_MAPS_API_KEY not set - location features limited');
  } else {
    passes.push('✅ REACT_APP_GOOGLE_MAPS_API_KEY is set');
  }
}

// ========================================
// TEST 5: Check togetherAIService.js delay
// ========================================
console.log('TEST 5: Checking rate limit delay in togetherAIService.js...');
const togetherServicePath = path.join(__dirname, 'src', 'services', 'togetherAIService.js');
if (!fs.existsSync(togetherServicePath)) {
  issues.push('❌ togetherAIService.js not found');
} else {
  const serviceContent = fs.readFileSync(togetherServicePath, 'utf-8');
  const delayMatch = serviceContent.match(/const\s+delayMs\s*=\s*(\d+)/);

  if (delayMatch) {
    const delay = parseInt(delayMatch[1]);
    if (delay < 6000) {
      issues.push(`❌ Rate limit delay is too short: ${delay}ms - should be at least 6000ms (6 seconds)`);
      issues.push('   This will cause only 2/13 views to generate (429 errors)');
      issues.push(`   Fix: Edit togetherAIService.js and set delayMs = 6000 or higher`);
    } else if (delay >= 6000 && delay < 8000) {
      warnings.push(`⚠️  Rate limit delay is ${delay}ms - acceptable but 8000ms (8 seconds) is more reliable`);
      passes.push('✅ Rate limit delay is >= 6 seconds (will work)');
    } else {
      passes.push(`✅ Rate limit delay is ${delay}ms (excellent - very reliable)`);
    }
  } else {
    warnings.push('⚠️  Could not find delayMs setting in togetherAIService.js');
  }
}

// ========================================
// TEST 6: Check DNA system files exist
// ========================================
console.log('TEST 6: Checking DNA system files...');
const dnaFiles = [
  'src/services/enhancedDNAGenerator.js',
  'src/services/dnaValidator.js',
  'src/services/dnaPromptGenerator.js',
  'src/services/fluxAIIntegrationService.js'
];

let dnaFilesOk = true;
dnaFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    issues.push(`❌ Missing DNA file: ${file}`);
    dnaFilesOk = false;
  }
});

if (dnaFilesOk) {
  passes.push('✅ All DNA system files present');
}

// ========================================
// TEST 7: Check server.js has Together.ai endpoints
// ========================================
console.log('TEST 7: Checking server.js API endpoints...');
const serverPath = path.join(__dirname, 'server.js');
if (!fs.existsSync(serverPath)) {
  issues.push('❌ server.js not found - API proxy required!');
  issues.push('   Run: npm run server (in separate terminal)');
} else {
  const serverContent = fs.readFileSync(serverPath, 'utf-8');

  if (!serverContent.includes('/api/together/chat') || !serverContent.includes('/api/together/image')) {
    issues.push('❌ server.js missing Together.ai endpoints');
    issues.push('   Required: /api/together/chat and /api/together/image');
  } else {
    passes.push('✅ server.js has Together.ai endpoints configured');
  }
}

// ========================================
// TEST 8: Check package.json has required dependencies
// ========================================
console.log('TEST 8: Checking dependencies...');
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const required = ['express', 'axios', 'cors'];
  const missing = required.filter(dep => !deps[dep]);

  if (missing.length > 0) {
    warnings.push(`⚠️  Missing dependencies: ${missing.join(', ')}`);
    warnings.push('   Run: npm install');
  } else {
    passes.push('✅ All required dependencies installed');
  }
}

// ========================================
// RESULTS SUMMARY
// ========================================
console.log('\n========== DIAGNOSTIC RESULTS ==========\n');

if (passes.length > 0) {
  console.log('✅ PASSING TESTS:\n');
  passes.forEach(pass => console.log('   ' + pass));
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS:\n');
  warnings.forEach(warning => console.log('   ' + warning));
  console.log('');
}

if (issues.length > 0) {
  console.log('❌ ISSUES FOUND:\n');
  issues.forEach(issue => console.log('   ' + issue));
  console.log('');
}

// ========================================
// DIAGNOSIS
// ========================================
console.log('\n========== DIAGNOSIS ==========\n');

if (issues.length === 0 && warnings.length === 0) {
  console.log('🎉 All tests passed! Your DNA consistency system should work.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Start servers: npm run dev');
  console.log('2. Generate a design and watch console for:');
  console.log('   "🧬 Using DNA-Enhanced FLUX workflow"');
  console.log('3. Wait 3 minutes for all 13 views');
  console.log('4. Verify all views have same materials/colors');
} else if (issues.length > 0) {
  console.log('🔴 CRITICAL ISSUES FOUND - DNA workflow will NOT work until fixed\n');
  console.log('Primary Issue:');

  if (issues.some(i => i.includes('TOGETHER_API_KEY'))) {
    console.log('❌ Missing TOGETHER_API_KEY');
    console.log('');
    console.log('FIX:');
    console.log('1. Go to https://api.together.ai/settings/api-keys');
    console.log('2. Create a new API key');
    console.log('3. Add to .env file: TOGETHER_API_KEY=tgp_v1_YOUR_KEY_HERE');
    console.log('4. Add $5-10 credits at https://api.together.ai/settings/billing');
    console.log('5. Restart servers: npm run dev');
  } else if (issues.some(i => i.includes('Rate limit delay'))) {
    console.log('❌ Rate limit delay too short - only 2/13 views will generate');
    console.log('');
    console.log('FIX:');
    console.log('1. Open src/services/togetherAIService.js');
    console.log('2. Find line with: const delayMs = XXXX');
    console.log('3. Change to: const delayMs = 8000;  // 8 seconds');
    console.log('4. Save file and restart servers');
  } else {
    console.log('See issues above and fix them before testing.');
  }
} else if (warnings.length > 0) {
  console.log('🟡 WARNINGS FOUND - System may work but with limitations\n');

  if (warnings.some(w => w.includes('REACT_APP_OPENAI_API_KEY'))) {
    console.log('⚠️  OpenAI API key missing - DNA generation will fail');
    console.log('');
    console.log('Impact: System will fall back to legacy generation without DNA');
    console.log('Result: 2D and 3D views will NOT be coordinated');
    console.log('');
    console.log('FIX:');
    console.log('1. Get OpenAI API key: https://platform.openai.com/api-keys');
    console.log('2. Add to .env: REACT_APP_OPENAI_API_KEY=sk-proj-...');
    console.log('3. Restart servers');
  }

  console.log('');
  console.log('You can test now, but expect the warnings to affect functionality.');
}

console.log('\n========== TEST COMPLETE ==========\n');

// Exit with appropriate code
if (issues.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
