import React from 'react';

// Test if we can import the component
console.log('Attempting to import ArchitectAIEnhanced...');

let ArchitectAIEnhanced;
try {
  const module = require('./ArchitectAIEnhanced');
  console.log('Module imported:', module);
  console.log('Module keys:', Object.keys(module));
  console.log('Module.default:', module.default);
  console.log('Type of module.default:', typeof module.default);

  ArchitectAIEnhanced = module.default;
} catch (error) {
  console.error('Failed to import:', error);
}

function TestApp() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Import Test</h1>
      <p>Check the console for import details</p>
      {ArchitectAIEnhanced && typeof ArchitectAIEnhanced === 'function' ? (
        <p style={{ color: 'green' }}>✅ ArchitectAIEnhanced is a valid function</p>
      ) : (
        <p style={{ color: 'red' }}>❌ ArchitectAIEnhanced is not a function: {typeof ArchitectAIEnhanced}</p>
      )}
    </div>
  );
}

export default TestApp;
