/**
 * Design History Repository Tests
 * 
 * Tests design persistence, versioning, and migration.
 * Run with: node test-design-history-repository.js
 */

const designHistoryRepository = require('./src/services/designHistoryRepository').default;
const { mockDNA, mockSheetMetadata } = require('./__mocks__/fixtures');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🧪 Testing Design History Repository\n');
  console.log('='.repeat(60));

  // Clear repository before tests
  await designHistoryRepository.clearAllDesigns();

  // Test 1: Save design
  console.log('\n📋 Test 1: Save design');
  const design1 = await designHistoryRepository.saveDesign({
    dna: mockDNA,
    basePrompt: 'Test prompt',
    seed: 123456,
    sheetType: 'ARCH',
    sheetMetadata: mockSheetMetadata,
    overlays: [],
    projectContext: { buildingProgram: 'house' },
    locationData: { address: 'Test Address' },
    resultUrl: 'https://mock.com/image.png'
  });

  assert(design1.designId !== undefined, 'Design ID is generated');
  assert(design1.dna !== undefined, 'DNA is saved');
  assert(design1.seed === 123456, 'Seed is preserved');

  // Test 2: Get design by ID
  console.log('\n📋 Test 2: Get design by ID');
  const retrieved = await designHistoryRepository.getDesignById(design1.designId);
  
  assert(retrieved !== null, 'Design can be retrieved');
  assert(retrieved.designId === design1.designId, 'Retrieved design has correct ID');
  assert(retrieved.seed === 123456, 'Retrieved design has correct seed');

  // Test 3: List designs
  console.log('\n📋 Test 3: List designs');
  const designs = await designHistoryRepository.listDesigns();
  
  assert(designs.length === 1, 'One design in repository');
  assert(designs[0].designId === design1.designId, 'Listed design matches saved design');

  // Test 4: Add version
  console.log('\n📋 Test 4: Add version');
  const versionId = await designHistoryRepository.addVersion(design1.designId, {
    resultUrl: 'https://mock.com/image_v2.png',
    deltaPrompt: 'Add sections',
    seed: 123456,
    driftScore: 0.05,
    consistencyScore: 0.95
  });

  assert(versionId !== undefined, 'Version ID is generated');
  assert(versionId.startsWith('v'), 'Version ID has correct format');

  // Test 5: Get version
  console.log('\n📋 Test 5: Get version');
  const version = await designHistoryRepository.getVersion(design1.designId, versionId);
  
  assert(version !== null, 'Version can be retrieved');
  assert(version.versionId === versionId, 'Version has correct ID');
  assert(version.driftScore === 0.05, 'Version has correct drift score');

  // Test 6: Multiple versions
  console.log('\n📋 Test 6: Multiple versions');
  const versionId2 = await designHistoryRepository.addVersion(design1.designId, {
    resultUrl: 'https://mock.com/image_v3.png',
    deltaPrompt: 'Add 3D views',
    seed: 123456,
    driftScore: 0.08
  });

  const updatedDesign = await designHistoryRepository.getDesignById(design1.designId);
  assert(updatedDesign.versions.length === 2, 'Design has two versions');

  // Test 7: Delete design
  console.log('\n📋 Test 7: Delete design');
  const deleted = await designHistoryRepository.deleteDesign(design1.designId);
  
  assert(deleted === true, 'Design can be deleted');
  
  const deletedDesign = await designHistoryRepository.getDesignById(design1.designId);
  assert(deletedDesign === null, 'Deleted design cannot be retrieved');

  // Test 8: Save multiple designs
  console.log('\n📋 Test 8: Save multiple designs');
  const design2 = await designHistoryRepository.saveDesign({
    dna: mockDNA,
    basePrompt: 'Test prompt 2',
    seed: 789012,
    sheetType: 'ARCH'
  });

  const design3 = await designHistoryRepository.saveDesign({
    dna: mockDNA,
    basePrompt: 'Test prompt 3',
    seed: 345678,
    sheetType: 'STRUCTURE'
  });

  const allDesigns = await designHistoryRepository.listDesigns();
  assert(allDesigns.length === 2, 'Two designs in repository');

  // Test 9: Design ID uniqueness
  console.log('\n📋 Test 9: Design ID uniqueness');
  const ids = allDesigns.map(d => d.designId);
  const uniqueIds = new Set(ids);
  assert(uniqueIds.size === ids.length, 'All design IDs are unique');

  // Test 10: Timestamp tracking
  console.log('\n📋 Test 10: Timestamp tracking');
  assert(design2.createdAt !== undefined, 'Created timestamp is set');
  assert(design2.updatedAt !== undefined, 'Updated timestamp is set');
  assert(new Date(design2.createdAt).getTime() > 0, 'Created timestamp is valid');

  // Cleanup
  await designHistoryRepository.clearAllDesigns();

  // Results
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All repository tests passed!\n');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite error:', error);
  process.exit(1);
});

