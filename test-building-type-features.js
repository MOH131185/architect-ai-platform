/**
 * Test Building Type & Program Features
 * 
 * Validates the new building taxonomy, entrance orientation, and program generator
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Building Type & Program Features...\n');

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
// Test 1: Building Types Data File
// ========================================

console.log('\n📁 Testing buildingTypes.js...\n');

test('buildingTypes.js exists', () => {
  const filePath = path.join(__dirname, 'src', 'data', 'buildingTypes.js');
  assert(fs.existsSync(filePath), 'File not found');
});

test('buildingTypes exports categories', () => {
  const buildingTypes = require('./src/data/buildingTypes.js');
  assert(buildingTypes.BUILDING_CATEGORIES, 'BUILDING_CATEGORIES not exported');
  assert(Object.keys(buildingTypes.BUILDING_CATEGORIES).length >= 10, 'Expected 10+ categories');
});

test('getAllCategories works', () => {
  const { getAllCategories } = require('./src/data/buildingTypes.js');
  const categories = getAllCategories();
  assert(Array.isArray(categories), 'Should return array');
  assert(categories.length >= 10, 'Should have 10+ categories');
  assert(categories[0].id, 'Category should have id');
  assert(categories[0].label, 'Category should have label');
  assert(categories[0].icon, 'Category should have icon');
  assert(Array.isArray(categories[0].subTypes), 'Category should have subTypes');
});

test('getCategoryById works', () => {
  const { getCategoryById } = require('./src/data/buildingTypes.js');
  const healthcare = getCategoryById('healthcare');
  assert(healthcare, 'Should find healthcare category');
  assert(healthcare.label === 'Healthcare', 'Should have correct label');
  assert(healthcare.subTypes.length >= 4, 'Healthcare should have 4+ sub-types');
});

test('validateBuildingSpecs works', () => {
  const { validateBuildingSpecs } = require('./src/data/buildingTypes.js');
  
  // Valid specs
  const valid = validateBuildingSpecs('healthcare', { area: 500, floors: 2, notes: 'Test' });
  assert(valid.isValid, 'Should be valid');
  assert(valid.errors.length === 0, 'Should have no errors');
  
  // Invalid specs (too small)
  const invalid = validateBuildingSpecs('healthcare', { area: 100, floors: 2, notes: '' });
  assert(!invalid.isValid, 'Should be invalid');
  assert(invalid.errors.length > 0, 'Should have errors');
});

// ========================================
// Test 2: Entrance Orientation Utils
// ========================================

console.log('\n🧭 Testing entranceOrientation.js...\n');

test('entranceOrientation.js exists', () => {
  const filePath = path.join(__dirname, 'src', 'utils', 'entranceOrientation.js');
  assert(fs.existsSync(filePath), 'File not found');
});

test('getAllDirections works', () => {
  const { getAllDirections } = require('./src/utils/entranceOrientation.js');
  const directions = getAllDirections();
  assert(Array.isArray(directions), 'Should return array');
  assert(directions.length === 8, 'Should have 8 directions');
  assert(directions[0].code, 'Direction should have code');
  assert(directions[0].label, 'Direction should have label');
  assert(typeof directions[0].bearing === 'number', 'Direction should have bearing');
});

test('bearingToDirection works', () => {
  const { default: utils } = require('./src/utils/entranceOrientation.js');
  assert(utils.bearingToDirection(0) === 'N', '0° should be North');
  assert(utils.bearingToDirection(90) === 'E', '90° should be East');
  assert(utils.bearingToDirection(180) === 'S', '180° should be South');
  assert(utils.bearingToDirection(270) === 'W', '270° should be West');
  assert(utils.bearingToDirection(45) === 'NE', '45° should be Northeast');
});

test('getOppositeDirection works', () => {
  const { getOppositeDirection } = require('./src/utils/entranceOrientation.js');
  assert(getOppositeDirection('N') === 'S', 'North opposite is South');
  assert(getOppositeDirection('E') === 'W', 'East opposite is West');
  assert(getOppositeDirection('NE') === 'SW', 'Northeast opposite is Southwest');
});

test('inferEntranceDirection with simple polygon', () => {
  const { inferEntranceDirection } = require('./src/utils/entranceOrientation.js');
  
  const sitePolygon = [
    { lat: 52.5, lng: -1.8 },
    { lat: 52.5001, lng: -1.8 },
    { lat: 52.5001, lng: -1.7999 },
    { lat: 52.5, lng: -1.7999 }
  ];
  
  const result = inferEntranceDirection({ sitePolygon });
  assert(result.direction, 'Should return direction');
  assert(typeof result.confidence === 'number', 'Should have confidence');
  assert(result.confidence >= 0.5 && result.confidence <= 1, 'Confidence should be 0.5-1.0');
  assert(Array.isArray(result.rationale), 'Should have rationale');
  assert(result.rationale.length > 0, 'Should have at least one rationale');
});

// ========================================
// Test 3: Program Import/Export Service
// ========================================

console.log('\n📊 Testing ProgramImportExportService.js...\n');

test('ProgramImportExportService exists', () => {
  const filePath = path.join(__dirname, 'src', 'services', 'ProgramImportExportService.js');
  assert(fs.existsSync(filePath), 'File not found');
});

test('exportToCSV works', () => {
  const { exportToCSV } = require('./src/services/ProgramImportExportService.js');
  
  const spaces = [
    { label: 'Reception', area: 30, count: 1, level: 'Ground', notes: '' },
    { label: 'Office', area: 20, count: 2, level: 'First', notes: 'Private' }
  ];
  
  const blob = exportToCSV(spaces);
  assert(blob instanceof Blob, 'Should return Blob');
  assert(blob.type === 'text/csv;charset=utf-8;', 'Should be CSV type');
});

test('exportToXLSX works', () => {
  const { exportToXLSX } = require('./src/services/ProgramImportExportService.js');
  
  const spaces = [
    { label: 'Reception', area: 30, count: 1, level: 'Ground', notes: '' }
  ];
  
  const metadata = { buildingType: 'clinic', area: 500 };
  const blob = exportToXLSX(spaces, metadata);
  
  assert(blob instanceof Blob, 'Should return Blob');
  assert(blob.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Should be XLSX type');
});

// ========================================
// Test 4: Component Files
// ========================================

console.log('\n🎨 Testing Component Files...\n');

test('BuildingTypeSelector.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'specs', 'BuildingTypeSelector.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('BuildingTypeSelector'), 'Should export component');
  assert(content.includes('getAllCategories'), 'Should import buildingTypes');
});

test('EntranceDirectionSelector.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'specs', 'EntranceDirectionSelector.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('EntranceDirectionSelector'), 'Should export component');
  assert(content.includes('getAllDirections'), 'Should import entranceOrientation');
  assert(content.includes('Navigation'), 'Should use Navigation icon');
});

test('BuildingProgramTable.jsx exists', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'specs', 'BuildingProgramTable.jsx');
  assert(fs.existsSync(filePath), 'File not found');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('BuildingProgramTable'), 'Should export component');
  assert(content.includes('ChevronUp'), 'Should support reordering');
  assert(content.includes('Trash2'), 'Should support deletion');
});

// ========================================
// Test 5: Integration Points
// ========================================

console.log('\n🔗 Testing Integration Points...\n');

test('SpecsStep imports new components', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'steps', 'SpecsStep.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('BuildingTypeSelector'), 'Should import BuildingTypeSelector');
  assert(content.includes('EntranceDirectionSelector'), 'Should import EntranceDirectionSelector');
  assert(content.includes('BuildingProgramTable'), 'Should import BuildingProgramTable');
});

test('ArchitectAIWizardContainer has new handlers', () => {
  const filePath = path.join(__dirname, 'src', 'components', 'ArchitectAIWizardContainer.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('handleImportProgram'), 'Should have import handler');
  assert(content.includes('handleExportProgram'), 'Should have export handler');
  assert(content.includes('handleAutoDetectEntrance'), 'Should have auto-detect handler');
  assert(content.includes('buildingCategory'), 'Should use buildingCategory');
  assert(content.includes('buildingSubType'), 'Should use buildingSubType');
  assert(content.includes('entranceOrientation'), 'Should use entranceOrientation');
});

test('schemas.js includes new types', () => {
  const filePath = path.join(__dirname, 'src', 'types', 'schemas.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('ProgramSpace'), 'Should define ProgramSpace typedef');
  assert(content.includes('buildingCategory'), 'Should include buildingCategory in DNA');
  assert(content.includes('entranceDirection'), 'Should include entranceDirection in DNA');
  assert(content.includes('programSpaces'), 'Should include programSpaces in DNA');
});

test('enhancedDNAGenerator extracts new fields', () => {
  const filePath = path.join(__dirname, 'src', 'services', 'enhancedDNAGenerator.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('buildingCategory'), 'Should extract buildingCategory');
  assert(content.includes('buildingSubType'), 'Should extract buildingSubType');
  assert(content.includes('entranceOrientation'), 'Should extract entranceOrientation');
  assert(content.includes('buildingTaxonomy'), 'Should add buildingTaxonomy metadata');
});

test('strictA1PromptGenerator includes entrance lock', () => {
  const filePath = path.join(__dirname, 'src', 'services', 'strictA1PromptGenerator.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('EXACT_ENTRANCE_DIRECTION'), 'Should have entrance lock');
  assert(content.includes('ENTRANCE ORIENTATION LOCK'), 'Should include entrance lock section');
  assert(content.includes('fullBuildingType'), 'Should build full building type');
  assert(content.includes('programSpaces'), 'Should extract program spaces');
});

test('a1SheetPromptBuilder includes new metadata', () => {
  const filePath = path.join(__dirname, 'src', 'services', 'a1SheetPromptBuilder.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('buildingCategory'), 'Should extract buildingCategory');
  assert(content.includes('entranceDirection'), 'Should extract entranceDirection');
  assert(content.includes('Main Entrance:'), 'Should include entrance in prompt');
  assert(content.includes('Building Type:'), 'Should include building type in prompt');
});

// ========================================
// Test 6: Program Space Analyzer
// ========================================

console.log('\n🏗️ Testing programSpaceAnalyzer.js...\n');

test('programSpaceAnalyzer has new methods', () => {
  const analyzer = require('./src/services/programSpaceAnalyzer.js');
  assert(typeof analyzer.getTemplateForType === 'function', 'Should have getTemplateForType');
  assert(typeof analyzer.generateProgramFromSpecs === 'function', 'Should have generateProgramFromSpecs');
  assert(typeof analyzer.validateProgramTable === 'function', 'Should have validateProgramTable');
});

test('getTemplateForType returns template', () => {
  const analyzer = require('./src/services/programSpaceAnalyzer.js');
  const template = analyzer.getTemplateForType('healthcare', 'clinic');
  assert(template, 'Should return template');
  assert(template.name, 'Template should have name');
  assert(template.category, 'Template should have category');
});

test('generateProgramFromSpecs generates spaces', () => {
  const analyzer = require('./src/services/programSpaceAnalyzer.js');
  const specs = {
    category: 'healthcare',
    subType: 'clinic',
    area: 500,
    floorCount: 2
  };
  
  const program = analyzer.generateProgramFromSpecs(specs);
  assert(program.spaces, 'Should have spaces');
  assert(Array.isArray(program.spaces), 'Spaces should be array');
  assert(program.spaces.length > 0, 'Should generate at least one space');
  assert(program.totalProgramArea > 0, 'Should calculate total area');
});

test('validateProgramTable validates correctly', () => {
  const analyzer = require('./src/services/programSpaceAnalyzer.js');
  
  const validSpaces = [
    { label: 'Reception', area: 30, count: 1 },
    { label: 'Office', area: 20, count: 2 }
  ];
  
  const validation = analyzer.validateProgramTable(validSpaces);
  assert(validation.isValid, 'Valid spaces should pass');
  assert(validation.totalArea === 70, 'Should calculate total correctly (30 + 20*2)');
  
  const invalidSpaces = [
    { label: '', area: 30, count: 1 }, // Missing label
    { label: 'Office', area: -10, count: 1 } // Negative area
  ];
  
  const invalidValidation = analyzer.validateProgramTable(invalidSpaces);
  assert(!invalidValidation.isValid, 'Invalid spaces should fail');
  assert(invalidValidation.errors.length > 0, 'Should have errors');
});

// ========================================
// Test 7: Schema Updates
// ========================================

console.log('\n📝 Testing schemas.js updates...\n');

test('normalizeDNA includes new fields', () => {
  const { normalizeDNA } = require('./src/types/schemas.js');
  
  const dna = {
    dimensions: { length: 15, width: 10, height: 7, floors: 2 },
    materials: [],
    buildingCategory: 'healthcare',
    buildingSubType: 'clinic',
    entranceDirection: 'S',
    programSpaces: [{ label: 'Reception', area: 30 }]
  };
  
  const normalized = normalizeDNA(dna);
  assert(normalized.buildingCategory === 'healthcare', 'Should preserve buildingCategory');
  assert(normalized.buildingSubType === 'clinic', 'Should preserve buildingSubType');
  assert(normalized.entranceDirection === 'S', 'Should preserve entranceDirection');
  assert(Array.isArray(normalized.programSpaces), 'Should preserve programSpaces');
  assert(normalized.programSpaces.length === 1, 'Should have program spaces');
});

test('normalizeDNA defaults new fields', () => {
  const { normalizeDNA } = require('./src/types/schemas.js');
  
  const dna = {
    dimensions: { length: 15, width: 10 },
    materials: []
  };
  
  const normalized = normalizeDNA(dna);
  assert(normalized.entranceDirection === 'N', 'Should default entranceDirection to N');
  assert(Array.isArray(normalized.programSpaces), 'Should default programSpaces to []');
  assert(normalized.programSpaces.length === 0, 'Should have empty program spaces');
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
  console.log('\n🎉 All tests passed! Building type features are ready.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Review errors above.\n');
  process.exit(1);
}

