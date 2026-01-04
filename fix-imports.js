/**
 * Fix Missing .js Extensions in Import Statements
 * 
 * Node ESM requires explicit .js extensions for relative imports.
 * This script fixes all imports in the services directory.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToFix = [
  'src/services/designHistoryService.js',
  'src/services/togetherAIReasoningService.js',
  'src/services/bimConsistencyChecker.js',
  'src/utils/geometry.js',
  'src/validators/siteSnapshotValidator.js',
  'src/rings/ring4-3d/massingGenerator.js'
];

function fixImportsInFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Fix relative imports without .js extension
  const importRegex = /^(import .* from ['"])(\.\/.+?)(['"];?)$/gm;
  
  content = content.replace(importRegex, (match, prefix, importPath, suffix) => {
    // Skip if already has extension
    if (importPath.endsWith('.js') || importPath.endsWith('.json') || importPath.endsWith('.ts')) {
      return match;
    }
    
    modified = true;
    return `${prefix}${importPath}.js${suffix}`;
  });

  // Fix parent directory imports
  const parentImportRegex = /^(import .* from ['"])(\.\.\/.+?)(['"];?)$/gm;
  
  content = content.replace(parentImportRegex, (match, prefix, importPath, suffix) => {
    // Skip if already has extension
    if (importPath.endsWith('.js') || importPath.endsWith('.json') || importPath.endsWith('.ts')) {
      return match;
    }
    
    modified = true;
    return `${prefix}${importPath}.js${suffix}`;
  });

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Fixed imports in: ${filePath}`);
  } else {
    console.log(`   No changes needed: ${filePath}`);
  }
}

console.log('🔧 Fixing import extensions...\n');

filesToFix.forEach(fixImportsInFile);

console.log('\n✅ Import fix complete!');
console.log('Run: node test-multi-panel-e2e.js');

