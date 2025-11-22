/**
 * Fix ALL Missing .js Extensions in Import Statements
 * 
 * Recursively scans src/ directory and fixes all relative imports.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, build, etc.
      if (!['node_modules', 'build', 'dist', '.git', 'public'].includes(file)) {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const originalContent = content;

  // Fix relative imports without .js extension
  // Matches: import ... from './something' or '../something'
  const importRegex = /^(import .* from ['"])(\.[^'"]+)(['"];?)$/gm;
  
  content = content.replace(importRegex, (match, prefix, importPath, suffix) => {
    // Skip if already has extension
    if (importPath.match(/\.(js|jsx|json|ts|tsx|css|scss)$/)) {
      return match;
    }
    
    // Skip if it's a directory import (ends with /)
    if (importPath.endsWith('/')) {
      return match;
    }
    
    modified = true;
    return `${prefix}${importPath}.js${suffix}`;
  });

  if (modified && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    const relativePath = path.relative(__dirname, filePath);
    console.log(`✅ Fixed: ${relativePath}`);
    return 1;
  }
  
  return 0;
}

console.log('🔧 Scanning and fixing all import extensions...\n');

const srcDir = path.join(__dirname, 'src');
const jsFiles = getAllJsFiles(srcDir);

console.log(`Found ${jsFiles.length} JS/JSX files\n`);

let fixedCount = 0;
jsFiles.forEach(file => {
  fixedCount += fixImportsInFile(file);
});

console.log(`\n✅ Fixed ${fixedCount} files`);
console.log('Run: node test-multi-panel-e2e.js');

