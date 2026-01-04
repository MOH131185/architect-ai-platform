/**
 * Fix JSX Import Extensions
 * 
 * The previous fixer added .js to all imports, but some files are .jsx
 * This script checks actual file extensions and fixes them correctly.
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
      if (!['node_modules', 'build', 'dist', '.git', 'public'].includes(file)) {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const fileDir = path.dirname(filePath);

  // Match import statements with .js extension
  const importRegex = /^(import .* from ['"])(\.[^'"]+\.js)(['"];?)$/gm;
  
  content = content.replace(importRegex, (match, prefix, importPath, suffix) => {
    // Resolve the import path relative to current file
    const resolvedPath = path.resolve(fileDir, importPath);
    const resolvedDir = path.dirname(resolvedPath);
    const baseName = path.basename(resolvedPath, '.js');
    
    // Check if .jsx exists instead
    const jsxPath = path.join(resolvedDir, baseName + '.jsx');
    if (fs.existsSync(jsxPath)) {
      modified = true;
      const newImportPath = importPath.replace(/\.js$/, '.jsx');
      return `${prefix}${newImportPath}${suffix}`;
    }
    
    return match;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    const relativePath = path.relative(__dirname, filePath);
    console.log(`✅ Fixed: ${relativePath}`);
    return 1;
  }
  
  return 0;
}

console.log('🔧 Fixing .js → .jsx where needed...\n');

const srcDir = path.join(__dirname, 'src');
const jsFiles = getAllJsFiles(srcDir);

console.log(`Checking ${jsFiles.length} files\n`);

let fixedCount = 0;
jsFiles.forEach(file => {
  fixedCount += fixImportsInFile(file);
});

console.log(`\n✅ Fixed ${fixedCount} files`);

