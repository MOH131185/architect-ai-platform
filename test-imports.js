// Test if ArchitectAIEnhanced exports correctly
const path = require('path');

console.log('Testing imports...\n');

try {
  // This won't work in Node.js because it's React code, but we can check the file
  const fs = require('fs');
  const filePath = path.join(__dirname, 'src', 'ArchitectAIEnhanced.js');

  if (fs.existsSync(filePath)) {
    console.log('✅ ArchitectAIEnhanced.js exists');

    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for export statement
    if (content.includes('export default ArchitectAIEnhanced')) {
      console.log('✅ Has default export');
    } else {
      console.log('❌ Missing default export');
    }

    // Check for component definition
    if (content.includes('const ArchitectAIEnhanced = ') || content.includes('function ArchitectAIEnhanced')) {
      console.log('✅ Component is defined');
    } else {
      console.log('❌ Component not found');
    }

    // Check for syntax errors (basic check)
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    console.log(`\nBrace balance: ${openBraces} open, ${closeBraces} close`);
    console.log(`Paren balance: ${openParens} open, ${closeParens} close`);

    if (openBraces === closeBraces && openParens === closeParens) {
      console.log('✅ Braces and parentheses are balanced');
    } else {
      console.log('❌ Syntax error likely - unbalanced braces or parentheses');
    }
  } else {
    console.log('❌ ArchitectAIEnhanced.js not found');
  }

  // Check ErrorBoundary
  const ebPath = path.join(__dirname, 'src', 'components', 'ErrorBoundary.jsx');
  if (fs.existsSync(ebPath)) {
    console.log('\n✅ ErrorBoundary.jsx exists');
    const ebContent = fs.readFileSync(ebPath, 'utf-8');
    if (ebContent.includes('export default ErrorBoundary')) {
      console.log('✅ ErrorBoundary has default export');
    }
  } else {
    console.log('\n❌ ErrorBoundary.jsx not found');
  }

} catch (error) {
  console.error('Error:', error.message);
}
