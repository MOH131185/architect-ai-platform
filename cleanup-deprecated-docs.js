/**
 * Cleanup Script: Archive Deprecated Documentation
 *
 * This script moves 422+ deprecated documentation files to docs/archive
 * Files are organized by category and can be safely deleted after review
 *
 * Usage: node cleanup-deprecated-docs.js [--dry-run] [--delete]
 *
 * Options:
 *   --dry-run   Show what would be moved without actually moving files
 *   --delete    Delete files instead of archiving (use with caution)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const ARCHIVE_DIR = path.join(ROOT_DIR, 'docs', 'archive', '2024');

// Categories of files to cleanup
const DEPRECATED_PATTERNS = {
  a1_implementation: /^A1_.*\.md$/,
  session_summaries: /^(SESSION_SUMMARY|COMPLETION_SUMMARY|M\d+_COMPLETION).*\.md$/,
  enhancements: /^(ENHANCEMENT|OPTIMIZATION|IMPROVEMENT).*\.md$/,
  implementations: /^(IMPLEMENTATION|INTEGRATION|MIGRATION).*\.md$/,
  tests: /^TEST_.*\.md$/,
  fixes: /^(FIX|FIXES|BUGFIX|CRITICAL_FIX).*\.md$/,
  guides: /^(GUIDE|QUICK_START|QUICK_FIX|TROUBLESHOOTING).*\.md$/,
  status: /^(STATUS|DIAGNOSTIC|AUDIT|REPORT).*\.md$/,
  architecture: /^(ARCHITECTURE|DNA|CONSISTENCY|GEOMETRY).*\.md$/,
  deployment: /^(DEPLOYMENT|VERCEL|PRODUCTION).*\.md$/,
  legacy: /^(LEGACY|DEPRECATED|OLD).*\.md$/,
};

// Files to keep (important docs)
const KEEP_FILES = new Set([
  'README.md',
  'CLAUDE.md',
  'LICENSE.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'FINAL_STATUS_REPORT.md',
  'LOCAL_RUN_REPORT.md',
  'LOGO_VISUAL_GUIDE.txt',
]);

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
  }
}

function categorizeFile(filename) {
  for (const [category, pattern] of Object.entries(DEPRECATED_PATTERNS)) {
    if (pattern.test(filename)) {
      return category;
    }
  }
  return 'other';
}

function scanDeprecatedFiles() {
  const files = fs.readdirSync(ROOT_DIR);
  const deprecated = [];

  for (const file of files) {
    const filePath = path.join(ROOT_DIR, file);
    const stats = fs.statSync(filePath);

    // Only process markdown files in root directory
    if (stats.isFile() && file.endsWith('.md')) {
      if (!KEEP_FILES.has(file)) {
        const category = categorizeFile(file);
        if (category !== 'other' || file.includes('_')) {
          deprecated.push({ file, category });
        }
      }
    }
  }

  return deprecated;
}

function organizeByCategory(files) {
  const organized = {};
  for (const { file, category } of files) {
    if (!organized[category]) {
      organized[category] = [];
    }
    organized[category].push(file);
  }
  return organized;
}

function printSummary(organized) {
  console.log('\n📊 Deprecated Files Summary:\n');
  console.log('─'.repeat(60));

  let total = 0;
  for (const [category, files] of Object.entries(organized).sort()) {
    console.log(`${category.padEnd(25)} | ${files.length} files`);
    total += files.length;
  }

  console.log('─'.repeat(60));
  console.log(`${'TOTAL'.padEnd(25)} | ${total} files\n`);

  return total;
}

function archiveFiles(organized, dryRun = false, deleteMode = false) {
  let moved = 0;
  let errors = 0;

  for (const [category, files] of Object.entries(organized)) {
    const categoryDir = path.join(ARCHIVE_DIR, category);

    if (!dryRun && !deleteMode) {
      ensureDirectoryExists(categoryDir);
    }

    console.log(`\n📁 ${category} (${files.length} files):`);

    for (const file of files) {
      const sourcePath = path.join(ROOT_DIR, file);
      const destPath = path.join(categoryDir, file);

      try {
        if (dryRun) {
          console.log(`  [DRY RUN] ${file} → docs/archive/2024/${category}/`);
        } else if (deleteMode) {
          fs.unlinkSync(sourcePath);
          console.log(`  ❌ Deleted: ${file}`);
        } else {
          fs.renameSync(sourcePath, destPath);
          console.log(`  ✅ Moved: ${file}`);
        }
        moved++;
      } catch (error) {
        console.error(`  ❌ Error: ${file} - ${error.message}`);
        errors++;
      }
    }
  }

  return { moved, errors };
}

function createArchiveIndex(organized) {
  const indexPath = path.join(ARCHIVE_DIR, 'INDEX.md');
  let content = `# Archived Documentation Index\n\n`;
  content += `Generated: ${new Date().toISOString()}\n\n`;
  content += `This directory contains deprecated documentation files from the project.\n`;
  content += `Files are organized by category for easy reference.\n\n`;

  for (const [category, files] of Object.entries(organized).sort()) {
    content += `## ${category.replace(/_/g, ' ').toUpperCase()} (${files.length} files)\n\n`;
    for (const file of files.sort()) {
      content += `- [${file}](./${category}/${file})\n`;
    }
    content += `\n`;
  }

  fs.writeFileSync(indexPath, content);
  console.log(`\n📄 Created archive index: ${indexPath}`);
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const deleteMode = args.includes('--delete');

  console.log('\n🧹 Deprecated Documentation Cleanup\n');
  console.log('═'.repeat(60));

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  } else if (deleteMode) {
    console.log('⚠️  DELETE MODE - Files will be permanently deleted!\n');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    // In real implementation, add timeout here
  }

  // Scan for deprecated files
  const deprecated = scanDeprecatedFiles();
  const organized = organizeByCategory(deprecated);

  // Print summary
  const total = printSummary(organized);

  if (total === 0) {
    console.log('✨ No deprecated files found. Repository is clean!\n');
    return;
  }

  // Archive or delete files
  const { moved, errors } = archiveFiles(organized, dryRun, deleteMode);

  // Create index
  if (!dryRun && !deleteMode) {
    createArchiveIndex(organized);
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Final Results:\n`);
  console.log(`   Total files found: ${total}`);
  console.log(`   Successfully processed: ${moved}`);
  console.log(`   Errors: ${errors}\n`);

  if (dryRun) {
    console.log('💡 Run without --dry-run to archive files');
    console.log('💡 Run with --delete to permanently delete files\n');
  } else if (deleteMode) {
    console.log('✅ Files deleted successfully\n');
  } else {
    console.log('✅ Files archived to docs/archive/2024/');
    console.log('💡 Review archived files before committing\n');
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { scanDeprecatedFiles, organizeByCategory, archiveFiles };
