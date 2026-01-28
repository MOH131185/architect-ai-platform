import dnaWorkflowOrchestrator from '../src/services/dnaWorkflowOrchestrator.js';
import { getRequiredPanels } from '../src/services/a1/a1LayoutConstants.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const FLOOR_COUNT = 2;
const PANEL_TYPES = getRequiredPanels(FLOOR_COUNT);

function buildPanelJobs() {
  return PANEL_TYPES.map((type, index) => ({
    id: `${type}-${index}`,
    type,
    width: 640,
    height: 480,
    prompt: `prompt-${type}`,
    negativePrompt: `negative-${type}`,
    seed: 1000 + index,
    dnaSnapshot: {},
    meta: { index }
  }));
}

function buildPanelSeeds() {
  return PANEL_TYPES.reduce((acc, type, index) => {
    acc[type] = 500 + index;
    return acc;
  }, {});
}

async function main() {
  const panelJobs = buildPanelJobs();
  const panelSeeds = buildPanelSeeds();
  const generatedImages = {};

  const mockSeedUtils = {
    derivePanelSeedsFromDNA: () => panelSeeds
  };

  const mockPanelService = {
    planA1Panels: () => panelJobs
  };

  const mockTogetherService = {
    generateArchitecturalImage: async ({ viewType, width, height, seed }) => {      
      generatedImages[viewType] = { width, height, seed };
      return {
        url: `https://example.com/${viewType}.png`,
        seedUsed: seed,
        metadata: { width, height },
        model: 'mock'
      };
    }
  };

  const mockDriftValidator = {
    validatePanelConsistency: async () => ({ valid: true, driftScore: 0 }),
    validateMultiPanelConsistency: () => ({ valid: true, consistencyScore: 0.99 })
  };

  const fakeCoordinates = PANEL_TYPES.reduce((acc, type, index) => {
    acc[type] = { x: index * 10, y: 0, width: 100, height: 80 };
    return acc;
  }, {});

  const composePayloads = [];
  const mockComposeClient = async (_url, options) => {
    composePayloads.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return {
          composedSheetUrl: 'data:image/png;base64,FAKE',
          coordinates: fakeCoordinates,
          metadata: { width: 1792, height: 1269 }
        };
      }
    };
  };

  const baselineBundles = [];
  const mockBaselineStore = {
    async saveBaselineArtifacts({ designId, sheetId, bundle }) {
      baselineBundles.push({ designId, sheetId, bundle });
      return 'baseline-key';
    }
  };

  const mockHistoryService = {
    async createDesign() {
      return 'history-id';
    }
  };

  const mockDNAGenerator = {
    async generateMasterDesignDNA() {
      return {
        success: true,
        masterDNA: {
          dimensions: { length: 20, width: 15, height: 9, floors: FLOOR_COUNT },
          entranceDirection: 'N',
          rooms: [{ name: 'Living Room', area: 30, level: 'Ground' }],
        },
      };
    },
  };

  const mockDNAValidator = {
    validateDesignDNA() {
      return { isValid: true, errors: [], warnings: [] };
    },
    autoFixDesignDNA() {
      return null;
    },
  };

  const result = await dnaWorkflowOrchestrator.runMultiPanelA1Workflow({        
    locationData: { climate: { type: 'temperate' }, sitePolygon: [] },
    projectContext: { buildingProgram: 'house', floors: FLOOR_COUNT, programSpaces: [] },
    siteSnapshot: { dataUrl: 'data:image/png;base64,SITE' },
    baseSeed: 42
  }, {
    overrides: {
      useTwoPassDNA: false,
      dnaGenerator: mockDNAGenerator,
      dnaValidator: mockDNAValidator,
      seedUtils: mockSeedUtils,
      panelService: mockPanelService,
      togetherAIService: mockTogetherService,
      driftValidator: mockDriftValidator,
      composeClient: mockComposeClient,
      baselineStore: mockBaselineStore,
      historyService: mockHistoryService,
      panelTypes: PANEL_TYPES,
      panelDelayMs: 0
    }
  });

  if (result.panels.length !== PANEL_TYPES.length) {
    throw new Error(`Expected ${PANEL_TYPES.length} panels, got ${result.panels.length}`);
  }

  if (composePayloads.length !== 1) {
    throw new Error('Expected compose API to be called once');
  }

  if (baselineBundles.length !== 1) {
    throw new Error('Expected baseline artifacts to be saved once');
  }

  const savedBundle = baselineBundles[0].bundle;
  const panelKeys = Object.keys(savedBundle.panels || {});
  if (panelKeys.length !== PANEL_TYPES.length) {
    throw new Error('Baseline bundle is missing panel entries');
  }

  if (savedBundle.metadata.width !== 1792 || savedBundle.metadata.height !== 1269) {
    throw new Error('Composed sheet dimensions are incorrect');
  }

  console.log('✅ Multi-panel workflow smoke test passed');
}

main().catch((error) => {
  console.error('❌ Multi-panel workflow test failed');
  console.error(error);
  process.exit(1);
});

