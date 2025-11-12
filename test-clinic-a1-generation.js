/**
 * Test Clinic A1 Generation
 * 
 * Validates that clinic projects generate complete A1 sheets with all required sections
 */

const { buildA1SheetPrompt } = require('./src/services/a1SheetPromptGenerator');

console.log('🧪 Testing Clinic A1 Prompt Generation\n');

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
  console.log('📋 Generating A1 prompt for clinic project...\n');
  
  const { prompt, negativePrompt } = buildA1SheetPrompt({
    masterDNA: clinicDNA,
    location,
    climate,
    projectContext: clinicContext,
    projectMeta: { name: 'Test Clinic', projectType: 'clinic' }
  });

  console.log('✅ Prompt generated successfully\n');
  
  // Validate required sections for clinic
  const requiredSections = [
    'LOCATION PLAN',
    'GROUND FLOOR PLAN',
    'ELEVATION',
    'SECTION',
    '3D VIEW',
    'TITLE BLOCK'
  ];

  const promptUpper = prompt.toUpperCase();
  const missingSections = requiredSections.filter(section => !promptUpper.includes(section));

  if (missingSections.length > 0) {
    console.error('❌ FAILED: Missing required sections:', missingSections.join(', '));
    process.exit(1);
  }

  // Check for clinic-specific restrictions
  if (!promptUpper.includes('NO SINGLE-FAMILY HOUSE') && !promptUpper.includes('NO RESIDENTIAL HOUSE')) {
    console.warn('⚠️  Warning: Clinic restrictions may not be strong enough');
  }

  // Check for all four elevations
  const elevationCount = ['NORTH ELEVATION', 'SOUTH ELEVATION', 'EAST ELEVATION', 'WEST ELEVATION']
    .filter(elev => promptUpper.includes(elev)).length;
  
  if (elevationCount < 4) {
    console.error(`❌ FAILED: Only ${elevationCount}/4 elevations specified`);
    process.exit(1);
  }

  // Check for both sections
  const sectionCount = ['SECTION A-A', 'SECTION B-B']
    .filter(section => promptUpper.includes(section)).length;
  
  if (sectionCount < 2) {
    console.error(`❌ FAILED: Only ${sectionCount}/2 sections specified`);
    process.exit(1);
  }

  console.log('✅ All required sections present:');
  console.log('   ✓ Location Plan');
  console.log('   ✓ Ground Floor Plan');
  console.log('   ✓ All 4 Elevations (North, South, East, West)');
  console.log('   ✓ Both Sections (A-A, B-B)');
  console.log('   ✓ 3D Views');
  console.log('   ✓ Title Block');
  console.log('\n✅ Clinic A1 prompt validation PASSED');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

