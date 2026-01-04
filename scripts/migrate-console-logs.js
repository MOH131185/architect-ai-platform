/**
 * Console.log Migration Script
 *
 * Automatically converts console.log statements to use the new logger utility.
 * Run with: node scripts/migrate-console-logs.js [--dry-run] [--file=path]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  sourceDir: path.join(__dirname, '..', 'src'),
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  excludeDirs: ['node_modules', 'build', 'dist', '.git'],
  excludeFiles: ['logger.js', 'errors.js', 'performance.js'], // Don't modify utility files

  // Mapping of console methods to logger methods
  methodMapping: {
    'console.log': 'logger.info',
    'console.error': 'logger.error',
    'console.warn': 'logger.warn',
    'console.info': 'logger.info',
    'console.debug': 'logger.debug',
    'console.trace': 'logger.trace',
  },

  // Patterns to identify different types of logs
  patterns: {
    api: /API|endpoint|fetch|request|response/i,
    dna: /DNA|master.*dna|design.*dna/i,
    generation: /generat|creat.*image|flux|together/i,
    workflow: /workflow|step|stage|process/i,
    error: /error|fail|exception|catch/i,
    performance: /performance|timer|duration|took|elapsed/i,
    debug: /debug|detail|verbose|trace/i
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const specificFile = args.find(arg => arg.startsWith('--file='))?.split('=')[1];

// Statistics
const stats = {
  filesProcessed: 0,
  filesModified: 0,
  logsReplaced: 0,
  errors: 0,
  byType: {}
};

/**
 * Process a single file
 */
function processFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  const fileName = path.basename(filePath);

  // Skip excluded files
  if (config.excludeFiles.includes(fileName)) {
    console.log(`⏭️  Skipping ${relativePath} (excluded file)`);
    return;
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ Error reading ${relativePath}:`, error.message);
    stats.errors++;
    return;
  }

  stats.filesProcessed++;

  // Check if file already imports logger
  const hasLoggerImport = content.includes("from './utils/logger'") ||
                         content.includes('from "../utils/logger"') ||
                         content.includes("from './logger'") ||
                         content.includes('from "../logger"');

  let modified = content;
  let replacementCount = 0;

  // Replace console statements
  for (const [consoleMethod, loggerMethod] of Object.entries(config.methodMapping)) {
    const regex = new RegExp(`${consoleMethod}\\(`, 'g');
    const matches = modified.match(regex);

    if (matches) {
      const count = matches.length;
      replacementCount += count;

      // Determine appropriate logger method based on content
      modified = modified.replace(regex, (match, offset) => {
        // Get the log content (next 100 chars for context)
        const context = modified.substring(offset, offset + 200);

        // Determine log type based on patterns
        let method = loggerMethod;

        if (config.patterns.api.test(context)) {
          stats.byType.api = (stats.byType.api || 0) + 1;
          // Keep default method for API logs
        } else if (config.patterns.dna.test(context)) {
          stats.byType.dna = (stats.byType.dna || 0) + 1;
          // Keep default method for DNA logs
        } else if (config.patterns.generation.test(context)) {
          stats.byType.generation = (stats.byType.generation || 0) + 1;
          // Keep default method for generation logs
        } else if (config.patterns.workflow.test(context)) {
          stats.byType.workflow = (stats.byType.workflow || 0) + 1;
          // Keep default method for workflow logs
        } else if (config.patterns.error.test(context)) {
          method = 'logger.error';
          stats.byType.error = (stats.byType.error || 0) + 1;
        } else if (config.patterns.performance.test(context)) {
          method = 'logger.debug';
          stats.byType.performance = (stats.byType.performance || 0) + 1;
        } else if (config.patterns.debug.test(context)) {
          method = 'logger.debug';
          stats.byType.debug = (stats.byType.debug || 0) + 1;
        } else {
          stats.byType.general = (stats.byType.general || 0) + 1;
        }

        return `${method}(`;
      });
    }
  }

  // Add logger import if needed and file was modified
  if (replacementCount > 0 && !hasLoggerImport) {
    // Determine the correct import path based on file location
    const fileDir = path.dirname(filePath);
    const relativeToSrc = path.relative(fileDir, path.join(__dirname, '..', 'src'));
    const utilsPath = path.join(relativeToSrc, 'utils', 'logger').replace(/\\/g, '/');

    // Find the right place to add import (after other imports)
    const importRegex = /^(import .* from .*;\n)+/m;
    const importMatch = modified.match(importRegex);

    if (importMatch) {
      // Add after existing imports
      const lastImportEnd = importMatch.index + importMatch[0].length;
      modified = modified.slice(0, lastImportEnd) +
                `import logger from '${utilsPath}';\n` +
                modified.slice(lastImportEnd);
    } else {
      // Add at the beginning of file
      modified = `import logger from '${utilsPath}';\n\n` + modified;
    }
  }

  // Write file if modified
  if (replacementCount > 0) {
    console.log(`✏️  ${relativePath}: Replacing ${replacementCount} console statements`);

    if (!isDryRun) {
      try {
        fs.writeFileSync(filePath, modified, 'utf8');
        stats.filesModified++;
        stats.logsReplaced += replacementCount;
      } catch (error) {
        console.error(`❌ Error writing ${relativePath}:`, error.message);
        stats.errors++;
      }
    } else {
      // In dry run, just count the changes
      stats.filesModified++;
      stats.logsReplaced += replacementCount;
    }
  }
}

/**
 * Recursively process directory
 */
function processDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      // Skip excluded directories
      if (!config.excludeDirs.includes(item)) {
        processDirectory(itemPath);
      }
    } else if (stat.isFile()) {
      // Process files with correct extensions
      const ext = path.extname(item);
      if (config.extensions.includes(ext)) {
        processFile(itemPath);
      }
    }
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔄 Console.log Migration Script');
  console.log('═══════════════════════════════════════════════\n');

  if (isDryRun) {
    console.log('🔍 Running in DRY RUN mode (no files will be modified)\n');
  } else {
    console.log('⚠️  Running in WRITE mode (files will be modified)\n');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    // Give user time to cancel
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      // Wait
    }
  }

  if (specificFile) {
    // Process single file
    if (fs.existsSync(specificFile)) {
      console.log(`Processing single file: ${specificFile}\n`);
      processFile(specificFile);
    } else {
      console.error(`❌ File not found: ${specificFile}`);
      process.exit(1);
    }
  } else {
    // Process entire source directory
    console.log(`Processing directory: ${config.sourceDir}\n`);
    processDirectory(config.sourceDir);
  }

  // Print statistics
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 MIGRATION STATISTICS:\n');

  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Console statements replaced: ${stats.logsReplaced}`);
  console.log(`Errors: ${stats.errors}`);

  if (Object.keys(stats.byType).length > 0) {
    console.log('\nReplacement by type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  if (isDryRun) {
    console.log('\n✅ Dry run complete. No files were modified.');
    console.log('Run without --dry-run to apply changes.');
  } else if (stats.filesModified > 0) {
    console.log('\n✅ Migration complete! Files have been updated.');
    console.log('\n📝 Next steps:');
    console.log('1. Review the changes with: git diff');
    console.log('2. Test the application: npm start');
    console.log('3. Commit the changes: git commit -am "refactor: migrate console.log to logger utility"');
  } else {
    console.log('\n✅ No changes needed. All files are already using logger or have no console statements.');
  }
}

// Run the script
main();