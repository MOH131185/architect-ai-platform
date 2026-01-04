/**
 * Test Clinic A1 Generation
 * 
 * Validates that clinic projects generate complete A1 sheets with all required sections
 * Tests new A1 template validation system
 */

const { buildA1SheetPrompt } = require('./src/services/a1/A1PromptService.js');
const a1SheetValidator = require('./src/services/a1/A1ValidationService.js').default;

console.log('🧪 Testing Clinic A1 Prompt Generation with Template Validation\n');

// Test clinic project type
const clinicDNA = {
  dimensions: {
    length: 20,
    width: 15,
    height: 10,
    floorHeights: [3.5, 3.5, 3.0]
  },
  materials: [
    { name: 'Concrete', hexColor: '#8B8680', application: 'exterior walls' },
    { name: 'Glass', hexColor: '#87CEEB', application: 'curtain wall' },
    { name: 'Metal', hexColor: '#708090', application: 'roof system' }
  ],
  rooms: [
    { name: 'Reception', dimensions: '8m × 6m', floor: 'ground' },
    { name: 'Waiting Area', dimensions: '10m × 8m', floor: 'ground' },
    { name: 'Consultation Room 1', dimensions: '4m × 3.5m', floor: 'ground' },
    { name: 'Consultation Room 2', dimensions: '4m × 3.5m', floor: 'ground' },
    { name: 'Treatment Room', dimensions: '5m × 4m', floor: 'upper' },
    { name: 'Office', dimensions: '4m × 3m', floor: 'upper' }
  ],
  viewSpecificFeatures: {
    north: { mainEntrance: true, windows: 6 },
    south: { windows: 8 },
    east: { windows: 4 },
    west: { windows: 4 }
  },
  architecturalStyle: 'Modern Healthcare'
};

const clinicContext = {
  projectType: 'clinic',
  buildingProgram: 'Medical Clinic',
  programSpaces: [
    { name: 'Reception', area: 48, count: 1, level: 'ground' },
    { name: 'Waiting Area', area: 80, count: 1, level: 'ground' },
    { name: 'Consultation Room', area: 14, count: 2, level: 'ground' },
    { name: 'Treatment Room', area: 20, count: 1, level: 'upper' },
    { name: 'Office', area: 12, count: 1, level: 'upper' }
  ]
};

const location = {
  address: '123 Healthcare Street, London, UK',
  coordinates: { lat: 51.5074, lng: -0.1278 }
};

const climate = {
  type: 'Temperate',
  seasonal: {
    summer: { avgTemp: '20°C' },
    winter: { avgTemp: '5°C' }
  }
};

try {
  console.log('📋 Test 1: Get required sections from validator...\n');
  
  const requiredSections = a1SheetValidator.getRequiredSections(clinicContext);
  console.log(`✅ Required sections: ${requiredSections.length}`);
  requiredSections.forEach(section => {
    console.log(`   - ${section.name} (${section.id})`);
  });

  console.log('\n📋 Test 2: Generating A1 prompt for clinic project...\n');
  
  const { prompt, negativePrompt } = buildA1SheetPrompt({
    masterDNA: clinicDNA,
    location,
    climate,
    projectContext: clinicContext,
    projectMeta: { name: 'Test Clinic', projectType: 'clinic' },
    requiredSections // Pass required sections to prompt builder
  });

  console.log('✅ Prompt generated successfully\n');
  
  console.log('📋 Test 3: Validate template completeness...\n');
  
  const templateValidation = a1SheetValidator.validateA1TemplateCompleteness({
    prompt,
    masterDNA: clinicDNA,
    projectContext: clinicContext
  });

  if (!templateValidation.valid) {
    console.error('❌ FAILED: Template validation failed');
    console.error('   Missing mandatory:', templateValidation.missingMandatory.join(', '));
    console.error('   Score:', templateValidation.score);
    process.exit(1);
  }

  console.log(`✅ Template validation passed (${templateValidation.score}% completeness)`);
  console.log(`   Present sections: ${templateValidation.presentSections.length}`);
  
  if (templateValidation.missingRecommended.length > 0) {
    console.log(`   ⚠️  Missing recommended: ${templateValidation.missingRecommended.join(', ')}`);
  }

  console.log('\n📋 Test 4: Validate required sections for clinic...\n');

  const promptUpper = prompt.toUpperCase();

  // Check for clinic-specific restrictions
  if (!promptUpper.includes('NO SINGLE-FAMILY HOUSE') && !promptUpper.includes('NO RESIDENTIAL HOUSE')) {
    console.error('❌ FAILED: Clinic restrictions not strong enough');
    process.exit(1);
  }

  console.log('✅ Clinic-specific restrictions present');

  // Check for all four elevations
  const elevationCount = ['NORTH ELEVATION', 'SOUTH ELEVATION', 'EAST ELEVATION', 'WEST ELEVATION']
    .filter(elev => promptUpper.includes(elev)).length;
  
  if (elevationCount < 4) {
    console.error(`❌ FAILED: Only ${elevationCount}/4 elevations specified`);
    process.exit(1);
  }

  console.log(`✅ All 4 elevations specified`);

  // Check for both sections
  const sectionCount = ['SECTION A-A', 'SECTION B-B']
    .filter(section => promptUpper.includes(section)).length;
  
  if (sectionCount < 2) {
    console.error(`❌ FAILED: Only ${sectionCount}/2 sections specified`);
    process.exit(1);
  }

  console.log(`✅ Both sections specified`);

  // Check for interior view
  if (!promptUpper.includes('INTERIOR')) {
    console.warn('⚠️  Warning: Interior view not explicitly mentioned');
  } else {
    console.log('✅ Interior view specified');
  }

  console.log('\n📋 Test Summary:');
  console.log('   ✓ Template validation system working');
  console.log('   ✓ Required sections API functional');
  console.log('   ✓ Location Plan present');
  console.log('   ✓ Ground Floor Plan present');
  console.log('   ✓ All 4 Elevations (North, South, East, West)');
  console.log('   ✓ Both Sections (A-A, B-B)');
  console.log('   ✓ 3D Views present');
  console.log('   ✓ Title Block present');
  console.log('   ✓ Clinic-specific restrictions enforced');
  console.log(`   ✓ Template completeness: ${templateValidation.score}%`);
  console.log('\n✅ ALL TESTS PASSED - Clinic A1 prompt validation complete');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

