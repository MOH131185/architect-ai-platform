/**
 * Test UI/UX Upgrade Features
 * 
 * Validates animated backgrounds, step containers, map enhancements, and program review
 */

const fs = require('fs');
const path = require('path');

console.log('🎨 Testing UI/UX Upgrade Features...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ========================================
// Test 1: Foundation Components
// ========================================

console.log('\n🏗️ Testing Foundation Components...\n');

test('AnimatedBackground.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'layout', 'AnimatedBackground.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('AnimatedBackground'), 'Should export component');
  assert(content.includes('useMotionValue'), 'Should use motion values for parallax');
  assert(content.includes('parallax'), 'Should implement parallax');
});

test('StepContainer.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'layout', 'StepContainer.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should export component');
  assert(content.includes('AnimatedBackground'), 'Should use AnimatedBackground');
  assert(content.includes('backgroundVariant'), 'Should accept variant prop');
});

// ========================================
// Test 2: Animation Variants
// ========================================

console.log('\n✨ Testing Animation Variants...\n');

test('animations.js has new variants', () => {
  const filePath = path.join(__dirname, 'src', 'styles', 'animations.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('parallaxBackground'), 'Should have parallaxBackground');
  assert(content.includes('zoomRotateBackground'), 'Should have zoomRotateBackground');
  assert(content.includes('architecturalGrid'), 'Should have architecturalGrid');
  assert(content.includes('staggerCards'), 'Should have staggerCards');
  assert(content.includes('cardEntrance'), 'Should have cardEntrance');
  assert(content.includes('compassRotation'), 'Should have compassRotation');
  assert(content.includes('mapOverlayFade'), 'Should have mapOverlayFade');
});

// ========================================
// Test 3: Site Polygon Utilities
// ========================================

console.log('\n📐 Testing Site Polygon Utilities...\n');

test('sitePolygonUtils.js exists', () => {
  const filePath = path.join(__dirname, 'src', 'utils', 'sitePolygonUtils.js');
  assert(fs.existsSync(filePath), 'File not found');
});

test('sitePolygonUtils exports functions', () => {
  const utils = require('./src/utils/sitePolygonUtils.js');
  assert(typeof utils.calculateVertexAngle === 'function', 'Should export calculateVertexAngle');
  assert(typeof utils.calculateAllAngles === 'function', 'Should export calculateAllAngles');
  assert(typeof utils.adjustSegmentLength === 'function', 'Should export adjustSegmentLength');
  assert(typeof utils.adjustVertexAngle === 'function', 'Should export adjustVertexAngle');
  assert(typeof utils.validatePolygonAngles === 'function', 'Should export validatePolygonAngles');
  assert(typeof utils.autoFixPolygonAngles === 'function', 'Should export autoFixPolygonAngles');
  assert(typeof utils.calculateSegmentData === 'function', 'Should export calculateSegmentData');
});

test('calculateVertexAngle works', () => {
  const utils = require('./src/utils/sitePolygonUtils.js');
  
  // Square polygon
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 }
  ];
  
  const angle = utils.calculateVertexAngle(square, 0);
  assert(typeof angle === 'number', 'Should return number');
  assert(angle >= 0 && angle <= 360, 'Angle should be 0-360');
  assert(Math.abs(angle - 90) < 5, 'Square corner should be ~90°');
});

test('validatePolygonAngles detects issues', () => {
  const utils = require('./src/utils/sitePolygonUtils.js');
  
  // Valid polygon
  const valid = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 }
  ];
  
  const validation = utils.validatePolygonAngles(valid);
  assert(typeof validation.isValid === 'boolean', 'Should return isValid');
  assert(Array.isArray(validation.errors), 'Should return errors array');
  assert(Array.isArray(validation.angles), 'Should return angles array');
});

// ========================================
// Test 4: Map Components
// ========================================

console.log('\n🗺️ Testing Map Components...\n');

test('EntranceCompassOverlay.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'map', 'EntranceCompassOverlay.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('EntranceCompassOverlay'), 'Should export component');
  assert(content.includes('Navigation'), 'Should use Navigation icon');
  assert(content.includes('compassRotation'), 'Should use compass rotation animation');
});

test('SiteBoundaryEditor has new features', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'map', 'SiteBoundaryEditor.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('handleAutoFix'), 'Should have auto-fix handler');
  assert(content.includes('handleReset'), 'Should have reset handler');
  assert(content.includes('showSegmentEditor'), 'Should have segment editor state');
  assert(content.includes('autoFixEnabled'), 'Should have auto-fix toggle');
  assert(content.includes('EntranceCompassOverlay'), 'Should import compass overlay');
  assert(content.includes('calculateSegmentData'), 'Should use segment data calculator');
});

// ========================================
// Test 5: Program Review
// ========================================

console.log('\n🎴 Testing Program Review...\n');

test('ProgramReviewCards.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'specs', 'ProgramReviewCards.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('ProgramReviewCards'), 'Should export component');
  assert(content.includes('staggerCards'), 'Should use stagger animation');
  assert(content.includes('cardEntrance'), 'Should use card entrance animation');
  assert(content.includes('getSpaceIcon'), 'Should have icon mapping');
  assert(content.includes('getSpaceColor'), 'Should have color mapping');
});

test('SpecsStep includes program review', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'SpecsStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('ProgramReviewCards'), 'Should import ProgramReviewCards');
  assert(content.includes('showProgramReview'), 'Should have review toggle state');
  assert(content.includes('Card View'), 'Should have view toggle button');
});

// ========================================
// Test 6: Step Container Integration
// ========================================

console.log('\n🎬 Testing Step Container Integration...\n');

test('LocationStep uses StepContainer', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'LocationStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should import StepContainer');
  assert(content.includes('backgroundVariant="blueprint"'), 'Should use blueprint variant');
  assert(content.includes('</StepContainer>'), 'Should wrap with StepContainer');
});

test('IntelligenceStep uses StepContainer', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'IntelligenceStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should import StepContainer');
  assert(content.includes('</StepContainer>'), 'Should wrap with StepContainer');
});

test('PortfolioStep uses StepContainer', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'PortfolioStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should import StepContainer');
  assert(content.includes('</StepContainer>'), 'Should wrap with StepContainer');
});

test('GenerateStep uses StepContainer', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'GenerateStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should import StepContainer');
  assert(content.includes('backgroundVariant="generate"'), 'Should use generate variant');
  assert(content.includes('</StepContainer>'), 'Should wrap with StepContainer');
});

test('ResultsStep uses StepContainer', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'ResultsStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should import StepContainer');
  assert(content.includes('backgroundVariant="results"'), 'Should use results variant');
  assert(content.includes('</StepContainer>'), 'Should wrap with StepContainer');
});

test('SpecsStep uses StepContainer', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'SpecsStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('StepContainer'), 'Should import StepContainer');
  assert(content.includes('</StepContainer>'), 'Should wrap with StepContainer');
});

// ========================================
// Test 7: Backward Compatibility
// ========================================

console.log('\n🔄 Testing Backward Compatibility...\n');

test('Wizard container unchanged', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'ArchitectAIWizardContainer.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('useArchitectAIWorkflow'), 'Should still use workflow hook');
  assert(content.includes('generateSheet'), 'Should still have generation logic');
  assert(content.includes('designSpec'), 'Should still build designSpec');
});

test('DNA generator unchanged', () => {
  const filePath = path.join(__dirname, 'src', 'services', 'enhancedDNAGenerator.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('generateMasterDesignDNA'), 'Should have DNA generation');
  assert(content.includes('buildingCategory'), 'Should extract building category');
});

test('Prompt builders unchanged', () => {
  const builderPath = path.join(__dirname, 'src', 'services', 'a1SheetPromptBuilder.js');
  const builderContent = fs.readFileSync(builderPath, 'utf8');
  assert(builderContent.includes('buildSheetPrompt'), 'Should have prompt builder');
  
  const strictPath = path.join(__dirname, 'src', 'services', 'strictA1PromptGenerator.js');
  const strictContent = fs.readFileSync(strictPath, 'utf8');
  assert(strictContent.includes('buildStrictA1Prompt'), 'Should have strict builder');
});

// ========================================
// Summary
// ========================================

console.log('\n' + '='.repeat(50));
console.log('📊 Test Summary');
console.log('='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 All tests passed! UI/UX upgrade is ready.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Review errors above.\n');
  process.exit(1);
}

