/**
 * Automated Logger Migration Script
 * Helps migrate console.* calls to centralized logger
 * 
 * Usage: node migrate-logger.js <file-path>
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  // console.log with emojis
  { pattern: /console\.log\('🧠([^']+)'\)/g, replacement: "logger.ai('$1')" },
  { pattern: /console\.log\('✅([^']+)'\)/g, replacement: "logger.success('$1')" },
  { pattern: /console\.log\('⏳([^']+)'\)/g, replacement: "logger.loading('$1')" },
  { pattern: /console\.log\('🌐([^']+)'\)/g, replacement: "logger.api('$1')" },
  { pattern: /console\.log\('⏱️([^']+)'\)/g, replacement: "logger.performance('$1')" },
  { pattern: /console\.log\('🔒([^']+)'\)/g, replacement: "logger.security('$1')" },
  { pattern: /console\.log\('📁([^']+)'\)/g, replacement: "logger.file('$1')" },
  
  // console.log with template literals
  { pattern: /console\.log\(`🧠([^`]+)`\)/g, replacement: "logger.ai(`$1`)" },
  { pattern: /console\.log\(`✅([^`]+)`\)/g, replacement: "logger.success(`$1`)" },
  { pattern: /console\.log\(`⏳([^`]+)`\)/g, replacement: "logger.loading(`$1`)" },
  
  // Basic console calls
  { pattern: /console\.log\(([^)]+)\)/g, replacement: "logger.info($1)" },
  { pattern: /console\.error\(([^)]+)\)/g, replacement: "logger.error($1)" },
  { pattern: /console\.warn\(([^)]+)\)/g, replacement: "logger.warn($1)" },
  { pattern: /console\.debug\(([^)]+)\)/g, replacement: "logger.debug($1)" },
];

function migrateFile(filePath) {
  console.log(`\n📝 Migrating: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Add logger import if not present
  if (!content.includes('import logger from')) {
    const importStatement = "import logger from '../utils/logger.js';\n";
    // Find the last import statement
    const lastImportMatch = content.match(/^import .+ from .+;$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      content = content.replace(lastImport, lastImport + '\n' + importStatement);
    } else {
      // No imports found, add at top
      content = importStatement + '\n' + content;
    }
  }
  
  // Apply migrations
  let replacements = 0;
  MIGRATIONS.forEach(({ pattern, replacement }) => {
    const matches = content.match(pattern);
    if (matches) {
      replacements += matches.length;
      content = content.replace(pattern, replacement);
    }
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Migrated ${replacements} console.* calls`);
    return replacements;
  } else {
    console.log('⚠️  No changes needed');
    return 0;
  }
}

// Main execution
if (process.argv.length < 3) {
  console.log('Usage: node migrate-logger.js <file-path>');
  process.exit(1);
}

const filePath = process.argv[2];
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const replaced = migrateFile(filePath);
console.log(`\n🎉 Migration complete! Replaced ${replaced} calls.`);
console.log('⚠️  IMPORTANT: Review the changes manually before committing!');
