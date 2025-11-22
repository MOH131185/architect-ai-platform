/**
 * Test Fixtures
 * 
 * Provides sample data for tests:
 * - DNA objects
 * - SiteSnapshots
 * - SheetResults
 * - ModifyRequests
 */

export const mockDNA = {
  dimensions: {
    length: 15.25,
    width: 10.15,
    height: 7.40,
    floors: 2,
    floorHeights: [3.0, 2.8]
  },
  materials: [
    { name: 'Red brick', hexColor: '#B8604E', application: 'exterior walls' },
    { name: 'Clay tiles', hexColor: '#8B4513', application: 'gable roof' },
    { name: 'UPVC windows', hexColor: '#FFFFFF', application: 'windows and doors' }
  ],
  rooms: [
    { name: 'Living Room', dimensions: '5.5m × 4.0m', floor: 'ground', features: ['fireplace'] },
    { name: 'Kitchen', dimensions: '4.0m × 3.5m', floor: 'ground', features: ['island'] },
    { name: 'Master Bedroom', dimensions: '4.5m × 3.8m', floor: 'first', features: ['ensuite'] }
  ],
  viewSpecificFeatures: {
    north: { mainEntrance: 'centered', windows: 4 },
    south: { patioDoors: 'large sliding', windows: 3 },
    east: { windows: 2 },
    west: { windows: 2 }
  },
  consistencyRules: [
    'All windows must be UPVC white',
    'Red brick on all elevations',
    'Clay tile roof at 35° pitch'
  ],
  architecturalStyle: 'Contemporary',
  projectType: 'residential',
  version: '1.0'
};

export const mockSiteSnapshot = {
  address: '123 Test Street, Birmingham, UK',
  coordinates: { lat: 52.4862, lng: -1.8904 },
  sitePolygon: [
    { lat: 52.4862, lng: -1.8904 },
    { lat: 52.4863, lng: -1.8904 },
    { lat: 52.4863, lng: -1.8903 },
    { lat: 52.4862, lng: -1.8903 }
  ],
  climate: {
    type: 'temperate oceanic',
    seasonal: {
      winter: { avgTemp: '5°C', precipitation: 'High', solar: 'Low' },
      spring: { avgTemp: '12°C', precipitation: 'Moderate', solar: 'Moderate' },
      summer: { avgTemp: '18°C', precipitation: 'Low', solar: 'High' },
      fall: { avgTemp: '10°C', precipitation: 'High', solar: 'Moderate' }
    }
  },
  zoning: {
    type: 'Residential',
    maxHeight: '12m',
    density: 'Medium',
    setbacks: 'Front: 5m, Side: 3m, Rear: 8m'
  },
  dataUrl: null,
  metadata: {}
};

export const mockSheetMetadata = {
  format: 'A1',
  orientation: 'landscape',
  dimensions: {
    mm: { width: 841, height: 594 },
    px: { width: 1792, height: 1269 },
    dpi: 300,
    ratio: 1.414,
    isLandscape: true
  },
  generatedAt: '2025-01-19T12:00:00.000Z',
  dnaVersion: '1.0',
  portfolioBlend: 70,
  location: '123 Test Street, Birmingham, UK',
  style: 'Contemporary',
  hasSitePlan: false,
  sitePlanPolicy: 'placeholder',
  panels: [],
  panelMap: null,
  model: 'FLUX.1-dev',
  width: 1792,
  height: 1269,
  a1LayoutKey: 'uk-riba-standard',
  dnaHash: 'abc123',
  siteHash: 'xyz789'
};

export const mockSheetResult = {
  url: 'https://mock-api.com/sheet_12345.png',
  originalUrl: 'https://mock-api.com/sheet_12345.png',
  seed: 123456,
  prompt: 'Mock A1 sheet prompt...',
  negativePrompt: 'Mock negative prompt...',
  metadata: mockSheetMetadata,
  dna: mockDNA,
  validation: { isValid: true, score: 0.98 },
  consistencyScore: 0.98,
  workflow: 'a1-sheet-deterministic'
};

export const mockModifyRequest = {
  designId: 'design_12345',
  sheetId: 'sheet_67890',
  versionId: 'base',
  quickToggles: {
    addSections: true,
    add3DView: false,
    addInterior3D: false,
    addDetails: false,
    addFloorPlans: false,
    addSitePlan: false
  },
  customPrompt: 'Add missing sections A-A and B-B',
  targetPanels: [],
  strictLock: true,
  imageStrength: null
};

export const mockBaselineArtifactBundle = {
  designId: 'design_12345',
  sheetId: 'sheet_67890',
  baselineImageUrl: 'https://mock-api.com/baseline_12345.png',
  siteSnapshotUrl: null,
  baselineDNA: mockDNA,
  baselineLayout: {
    panelCoordinates: [
      { id: 'site-plan', x: 0, y: 0, width: 597, height: 253, row: 1, col: 1 },
      { id: 'ground-floor', x: 597, y: 0, width: 597, height: 253, row: 1, col: 2 },
      { id: '3d-hero', x: 1194, y: 0, width: 598, height: 253, row: 1, col: 3 }
    ],
    layoutKey: 'uk-riba-standard',
    sheetWidth: 1792,
    sheetHeight: 1269
  },
  metadata: {
    seed: 123456,
    model: 'FLUX.1-dev',
    dnaHash: 'abc123',
    layoutHash: 'layout456',
    width: 1792,
    height: 1269,
    a1LayoutKey: 'uk-riba-standard'
  },
  seeds: { base: 123456 },
  basePrompt: 'Mock base prompt...'
};

export const mockDesignSpec = {
  buildingProgram: 'three-bedroom house',
  floorArea: 200,
  programSpaces: [
    { name: 'Living Room', area: 35, count: 1, level: 'ground' },
    { name: 'Kitchen', area: 20, count: 1, level: 'ground' },
    { name: 'Bedroom', area: 15, count: 3, level: 'first' }
  ],
  entranceDirection: 'N',
  portfolioBlend: {
    materialWeight: 0.7,
    characteristicWeight: 0.7
  },
  sheetConfig: {
    size: 'A1',
    orientation: 'landscape',
    dpi: 300,
    format: 'PNG'
  }
};

export const mockEnvironment = {
  isBrowser: false,
  isNode: true,
  api: {
    urls: {
      togetherImage: '/api/together/image',
      togetherChat: '/api/together/chat',
      sheet: '/api/sheet',
      overlay: '/api/overlay',
      driftDetect: '/api/drift-detect'
    },
    keys: {
      togetherApiKey: 'test-together-key'
    }
  },
  flags: {
    get: jest.fn((key, defaultValue) => defaultValue),
    set: jest.fn(),
    isEnabled: jest.fn(() => false)
  },
  storage: {
    get: jest.fn(),
    set: jest.fn()
  }
};

export default {
  mockDNA,
  mockSiteSnapshot,
  mockSheetMetadata,
  mockSheetResult,
  mockModifyRequest,
  mockBaselineArtifactBundle,
  mockDesignSpec,
  mockEnvironment
};

