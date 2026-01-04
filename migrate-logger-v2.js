const fs = require('fs');

function migrateFile(filePath) {
  console.log(`📝 Migrating: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Add logger import if not present
  if (!content.includes('import logger from')) {
    const importStatement = "import logger from '../utils/logger.js';\n";
    const lastImportMatch = content.match(/^import .+ from .+;$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      content = content.replace(lastImport, lastImport + '\n' + importStatement);
    } else {
      content = importStatement + '\n' + content;
    }
  }
  
  let replacements = 0;
  
  // Replace all console.log, console.error, console.warn with logger equivalents
  // This is more aggressive - replaces ALL console.* calls
  
  content = content.replace(/console\.log\(/g, () => { replacements++; return 'logger.info('; });
  content = content.replace(/console\.error\(/g, () => { replacements++; return 'logger.error('; });
  content.replace(/console\.warn\(/g, () => { replacements++; return 'logger.warn('; });
  content = content.replace(/console\.debug\(/g, () => { replacements++; return 'logger.debug('; });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Migrated ${replacements} console.* calls`);
    return replacements;
  } else {
    console.log('⚠️  No changes needed');
    return 0;
  }
}

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const replaced = migrateFile(filePath);
console.log(`\n🎉 Migration complete! Replaced ${replaced} calls.`);
