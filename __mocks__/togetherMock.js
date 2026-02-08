/**
 * Together AI Mock
 *
 * Provides deterministic mock responses for Together.ai API calls.
 * Used in tests to avoid real API calls and ensure determinism.
 */

/**
 * Mock DNA generation response (Qwen reasoning)
 */
export const mockDNAResponse = {
  content: JSON.stringify({
    dimensions: {
      length: 15.25,
      width: 10.15,
      height: 7.4,
      floors: 2,
      floorHeights: [3.0, 2.8],
    },
    materials: [
      { name: "Red brick", hexColor: "#B8604E", application: "exterior walls" },
      { name: "Clay tiles", hexColor: "#8B4513", application: "gable roof" },
      {
        name: "UPVC windows",
        hexColor: "#FFFFFF",
        application: "windows and doors",
      },
    ],
    rooms: [
      {
        name: "Living Room",
        dimensions: "5.5m × 4.0m",
        floor: "ground",
        features: ["fireplace", "bay window"],
      },
      {
        name: "Kitchen",
        dimensions: "4.0m × 3.5m",
        floor: "ground",
        features: ["island", "pantry"],
      },
      {
        name: "Master Bedroom",
        dimensions: "4.5m × 3.8m",
        floor: "first",
        features: ["ensuite", "built-in wardrobe"],
      },
    ],
    viewSpecificFeatures: {
      north: {
        mainEntrance: "centered",
        windows: 4,
        features: ["porch", "canopy"],
      },
      south: {
        patioDoors: "large sliding",
        windows: 3,
        features: ["garden access"],
      },
      east: { windows: 2, features: ["side entrance"] },
      west: { windows: 2, features: ["utility access"] },
    },
    consistencyRules: [
      "All windows must be UPVC white",
      "Red brick on all elevations",
      "Clay tile roof at 35° pitch",
      "Ground floor height 3.0m, first floor 2.8m",
    ],
    architecturalStyle: "Contemporary",
    projectType: "residential",
    version: "1.0",
  }),
  model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  usage: { prompt_tokens: 500, completion_tokens: 800, total_tokens: 1300 },
  latencyMs: 12000,
  traceId: "trace_mock_12345",
};

/**
 * Mock image generation response (FLUX)
 */
export const mockImageResponse = {
  url: "https://mock-together-api.com/image_12345.png",
  seedUsed: 123456,
  model: "black-forest-labs/FLUX.1-dev",
  latencyMs: 45000,
  traceId: "trace_mock_67890",
  metadata: {
    width: 1792,
    height: 1269,
    steps: 48,
    guidanceScale: 7.8,
    generationMode: "text-to-image",
    hasInitImage: false,
    imageStrength: null,
  },
};

/**
 * Mock img2img response (modify mode)
 */
export const mockImg2ImgResponse = {
  url: "https://mock-together-api.com/image_modified_12345.png",
  seedUsed: 123456, // Same seed as baseline
  model: "black-forest-labs/FLUX.1-dev",
  latencyMs: 48000,
  traceId: "trace_mock_modify_67890",
  metadata: {
    width: 1792,
    height: 1269,
    steps: 48,
    guidanceScale: 9.0,
    generationMode: "image-to-image",
    hasInitImage: true,
    imageStrength: 0.14,
  },
};

/**
 * Mock Together AI client
 */
export class MockTogetherAIClient {
  constructor(env) {
    this.env = env;
    this.callCount = 0;
  }

  async generateReasoning({ prompt, options = {} }) {
    this.callCount++;

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      ...mockDNAResponse,
      settings: {
        temperature: options.temperature || 0.1,
        topP: options.topP || 0.9,
        maxTokens: options.maxTokens || 2000,
      },
    };
  }

  async generateA1SheetImage(params) {
    this.callCount++;

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    return {
      imageUrls: [mockImageResponse.url],
      seedUsed: params.seed || 123456,
      model: params.model || "black-forest-labs/FLUX.1-dev",
      latencyMs: 45000,
      traceId: `trace_mock_${Date.now()}`,
      metadata: {
        width: params.width || 1792,
        height: params.height || 1269,
        steps: params.steps || 48,
        guidanceScale: params.guidanceScale || 7.8,
        hasInitImage: false,
        imageStrength: null,
      },
    };
  }

  async generateModifyImage(params) {
    this.callCount++;

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (!params.initImage) {
      throw new Error("initImage required for modify mode");
    }

    return {
      imageUrls: [mockImg2ImgResponse.url],
      seedUsed: params.seed || 123456,
      model: params.model || "black-forest-labs/FLUX.1-dev",
      latencyMs: 48000,
      traceId: `trace_mock_modify_${Date.now()}`,
      metadata: {
        width: params.width || 1792,
        height: params.height || 1269,
        steps: params.steps || 48,
        guidanceScale: params.guidanceScale || 9.0,
        hasInitImage: true,
        imageStrength: params.imageStrength || 0.14,
        retried: false,
      },
    };
  }
}

/**
 * Create mock Together AI client
 */
export function createMockTogetherAIClient(env) {
  return new MockTogetherAIClient(env);
}

/**
 * Mock fetch responses for Together API
 */
export function mockTogetherFetch() {
  global.fetch = jest.fn((url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};

    // Chat endpoint
    if (
      url.includes("/chat/completions") ||
      url.includes("/api/together/chat")
    ) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: mockDNAResponse.content } }],
          usage: mockDNAResponse.usage,
          model: mockDNAResponse.model,
        }),
      });
    }

    // Image endpoint
    if (
      url.includes("/images/generations") ||
      url.includes("/api/together/image")
    ) {
      const isModify = !!body.initImage || !!body.init_image;
      const response = isModify ? mockImg2ImgResponse : mockImageResponse;

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ url: response.url }],
          seed: body.seed || response.seedUsed,
        }),
      });
    }

    // Default: return empty response
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });
}

/**
 * Reset mock
 */
export function resetMock() {
  if (global.fetch && global.fetch.mockClear) {
    global.fetch.mockClear();
  }
}

export default {
  mockDNAResponse,
  mockImageResponse,
  mockImg2ImgResponse,
  MockTogetherAIClient,
  createMockTogetherAIClient,
  mockTogetherFetch,
  resetMock,
};
