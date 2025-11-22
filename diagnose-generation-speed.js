/**
 * Diagnose A1 Generation Speed Issues
 * 
 * Checks configuration, workflow, and identifies bottlenecks
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Diagnosing A1 Generation Speed...\n');

const issues = [];
const warnings = [];
const info = [];

// ========================================
// Check 1: Verify A1-Only Workflow
// ========================================

console.log('📋 Checking workflow configuration...\n');

try {
  const wizardPath = path.join(__dirname, 'src', 'components', 'ArchitectAIWizardContainer.jsx');
  const wizardContent = fs.readFileSync(wizardPath, 'utf8');
  
  if (wizardContent.includes('generateSheet')) {
    console.log('✅ Wizard uses generateSheet (correct)');
    info.push('Using modern workflow hook');
  } else {
    console.log('❌ Wizard does not use generateSheet');
    issues.push('Wizard may be using legacy workflow');
  }
  
  if (wizardContent.includes('generateConsistentArchitecturalPackage')) {
    console.log('⚠️  WARNING: Wizard references 13-view workflow');
    warnings.push('Legacy 13-view code found - may cause 3+ minute generations');
  } else {
    console.log('✅ No 13-view workflow references found');
  }
  
  if (wizardContent.includes('runA1SheetWorkflow')) {
    console.log('✅ References A1 sheet workflow');
  }
} catch (error) {
  console.log('❌ Could not read wizard file');
  issues.push('Wizard file not found or not readable');
}

// ========================================
// Check 2: Verify Preset Integration
// ========================================

console.log('\n⚙️  Checking FLUX preset integration...\n');

try {
  const presetPath = path.join(__dirname, 'src', 'config', 'fluxPresets.js');
  
  if (fs.existsSync(presetPath)) {
    console.log('✅ fluxPresets.js exists');
    const presetContent = fs.readFileSync(presetPath, 'utf8');
    
    if (presetContent.includes('A1_ARCH_FINAL')) {
      console.log('✅ A1_ARCH_FINAL preset defined');
      
      // Check parameters
      if (presetContent.includes('steps: 48')) {
        console.log('✅ Generate mode: 48 steps (optimal)');
      }
      if (presetContent.includes('steps: 32')) {
        console.log('✅ Modify mode: 32 steps (optimal)');
      }
      if (presetContent.includes('cfg: 7.8')) {
        console.log('✅ Generate CFG: 7.8 (optimal)');
      }
      if (presetContent.includes('cfg: 6.5')) {
        console.log('✅ Modify CFG: 6.5 (optimal)');
      }
    } else {
      console.log('❌ A1_ARCH_FINAL preset not found');
      issues.push('Preset not configured');
    }
  } else {
    console.log('⚠️  fluxPresets.js not found (using defaults)');
    warnings.push('Preset file missing - may use suboptimal parameters');
  }
} catch (error) {
  console.log('❌ Could not check preset file');
}

// ========================================
// Check 3: Verify Client Integration
// ========================================

console.log('\n🔌 Checking Together.ai client...\n');

try {
  const clientPath = path.join(__dirname, 'src', 'services', 'togetherAIClient.js');
  const clientContent = fs.readFileSync(clientPath, 'utf8');
  
  if (clientContent.includes('getA1Preset')) {
    console.log('✅ Client imports A1_ARCH_FINAL preset');
  } else {
    console.log('⚠️  Client does not import preset (using hardcoded values)');
    warnings.push('Client may not use optimized parameters');
  }
  
  if (clientContent.includes('RateLimiter')) {
    console.log('✅ Rate limiter configured');
    
    if (clientContent.includes('new RateLimiter(6000)')) {
      console.log('✅ Rate limiter: 6 second minimum interval');
    }
  }
  
  if (clientContent.includes('generateA1SheetImage')) {
    console.log('✅ generateA1SheetImage method exists');
  }
  
  if (clientContent.includes('generateModifyImage')) {
    console.log('✅ generateModifyImage method exists');
  }
} catch (error) {
  console.log('❌ Could not check client file');
}

// ========================================
// Check 4: Check Environment
// ========================================

console.log('\n🌍 Checking environment...\n');

try {
  require('dotenv').config();
  
  if (process.env.TOGETHER_API_KEY) {
    console.log('✅ TOGETHER_API_KEY is set');
    const key = process.env.TOGETHER_API_KEY;
    if (key.startsWith('tgp_v1_')) {
      console.log('✅ API key format valid');
    } else {
      console.log('⚠️  API key format unexpected');
      warnings.push('API key may be invalid');
    }
  } else {
    console.log('❌ TOGETHER_API_KEY not set');
    issues.push('API key missing - generation will fail');
  }
} catch (error) {
  console.log('⚠️  Could not load .env file');
  warnings.push('Environment variables may not be loaded');
}

// ========================================
// Check 5: Verify Orchestrator
// ========================================

console.log('\n🎭 Checking orchestrator...\n');

try {
  const orchestratorPath = path.join(__dirname, 'src', 'services', 'pureOrchestrator.js');
  const orchestratorContent = fs.readFileSync(orchestratorPath, 'utf8');
  
  if (orchestratorContent.includes('getA1Preset')) {
    console.log('✅ Orchestrator uses A1_ARCH_FINAL preset');
  } else {
    console.log('⚠️  Orchestrator may not use preset');
    warnings.push('Orchestrator may use hardcoded parameters');
  }
  
  if (orchestratorContent.includes('shouldRetryForDrift')) {
    console.log('✅ Drift-based retry logic integrated');
  }
  
  if (orchestratorContent.includes('generateA1SheetImage')) {
    console.log('✅ Orchestrator calls single image generation');
  }
  
  // Check for 13-view references
  if (orchestratorContent.includes('13') || orchestratorContent.includes('thirteen')) {
    console.log('⚠️  Found references to 13 views');
    warnings.push('May have legacy 13-view code');
  } else {
    console.log('✅ No 13-view references found');
  }
} catch (error) {
  console.log('❌ Could not check orchestrator file');
}

// ========================================
// Summary
// ========================================

console.log('\n' + '='.repeat(60));
console.log('📊 DIAGNOSTIC SUMMARY');
console.log('='.repeat(60));

if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ Configuration looks correct!');
  console.log('\nExpected generation time: 60-75 seconds');
  console.log('\nIf still slow, check:');
  console.log('1. Browser console for actual step timing');
  console.log('2. Network tab for API response times');
  console.log('3. Together.ai API status');
  console.log('4. Server logs (npm run server)');
} else {
  if (issues.length > 0) {
    console.log('\n❌ ISSUES FOUND:');
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`);
    });
  }
}

if (info.length > 0) {
  console.log('\nℹ️  INFO:');
  info.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item}`);
  });
}

console.log('\n' + '='.repeat(60));
console.log('\n📖 For detailed diagnostic steps, see:');
console.log('   A1_GENERATION_TIMING_DIAGNOSTIC.md');
console.log('\n🔧 To test API connectivity:');
console.log('   node test-together-api-connection.js');
console.log('\n');

process.exit(issues.length > 0 ? 1 : 0);

