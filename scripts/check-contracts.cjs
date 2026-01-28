/**
 * Design DNA Contract Checker
 *
 * Validates that Design DNA contracts are correctly imported and exported.
 * Run with: node scripts/check-contracts.js
 */

const fs = require('fs');
const path = require('path');

/**
 * Files to check
 */
const FILES_TO_CHECK = [
  {
    path: 'src/domain/dna.js',
    expectedExports: ['DNA_VERSION', 'createMeta', 'createError', 'isFallbackResult', 'getTotalCost']
  },
  {
    path: 'src/domain/validators.js',
    expectedExports: ['ensure', 'validateLocationProfile', 'validateDesignReasoning', 'validateDesignResult']
  },
  {
    path: 'src/config/appConfig.js',
    expectedExports: ['getApiKey', 'hasApiKey', 'getFeatureFlag', 'getApiUrl', 'ServiceName']
  },
  {
    path: 'src/services/apiClient.js',
    expectedExports: ['get', 'post', 'put', 'patch', 'del', 'handleResponse']
  },
  {
    path: 'src/services/adapters/openaiAdapter.js',
    expectedExports: ['adaptDesignReasoning', 'adaptFeasibilityAnalysis', 'createFallbackDesignReasoning']
  }
  // Note: replicateAdapter.js removed (deprecated - Together.ai only)
];

/**
 * Check if a file exists and contains expected exports
 */
function checkFile(fileInfo) {
  const filePath = path.join(__dirname, '..', fileInfo.path);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log(`  ❌ ${fileInfo.path} - File not found`);
    return false;
  }

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for expected exports
  const missingExports = [];
  for (const exportName of fileInfo.expectedExports) {
    // Match: export function/const/class OR export async function
    const exportPattern = new RegExp(`export\\s+(async\\s+)?(function|const|class)\\s+${exportName}\\b`);
    const namedExportPattern = new RegExp(`export\\s*\\{[^}]*${exportName}[^}]*\\}`);

    if (!exportPattern.test(content) && !namedExportPattern.test(content)) {
      missingExports.push(exportName);
    }
  }

  if (missingExports.length > 0) {
    console.log(`  ⚠️  ${fileInfo.path} - Missing exports: ${missingExports.join(', ')}`);
    return false;
  }

  console.log(`  ✅ ${fileInfo.path}`);
  return true;
}

/**
 * Run contract checks
 */
function checkContracts() {
  console.log('🔍 Checking Design DNA contracts...\n');

  let allPassed = true;

  for (const fileInfo of FILES_TO_CHECK) {
    const passed = checkFile(fileInfo);
    if (!passed) {
      allPassed = false;
    }
  }

  console.log('');

  if (allPassed) {
    console.log('✅ Contract check PASSED');
    console.log('All Design DNA contracts are correctly defined.');
    process.exit(0);
  } else {
    console.log('❌ Contract check FAILED');
    console.log('Some contract files are missing or incomplete.');
    process.exit(1);
  }
}

// Run check
checkContracts();
