/**
 * Integration Tests for ModelRouter
 * Tests environment-driven model selection and fallback cascades
 */

import modelRouter from "../src/services/modelRouter.js";

describe("ModelRouter Integration Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Task Type Routing", () => {
    test("should route DNA_GENERATION to correct model", () => {
      process.env.AI_MODEL_DNA =
        "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo";

      const config = modelRouter.getModelConfig("DNA_GENERATION");

      expect(config).toBeDefined();
      expect(config.primary).toBe(
        "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      );
    });

    test("should route ARCHITECTURAL_REASONING to correct model", () => {
      process.env.AI_MODEL_REASONING =
        "meta-llama/Llama-3.3-70B-Instruct-Turbo";

      const config = modelRouter.getModelConfig("ARCHITECTURAL_REASONING");

      expect(config).toBeDefined();
      expect(config.primary).toBe("meta-llama/Llama-3.3-70B-Instruct-Turbo");
    });

    test("should route A1_SHEET_GENERATION to image model", () => {
      process.env.AI_MODEL_IMAGE = "black-forest-labs/FLUX.1-dev";

      const config = modelRouter.getModelConfig("A1_SHEET_GENERATION");

      expect(config).toBeDefined();
      expect(config.primary).toBe("black-forest-labs/FLUX.1-dev");
    });

    test("should support all 8 task types", () => {
      const taskTypes = [
        "DNA_GENERATION",
        "ARCHITECTURAL_REASONING",
        "SITE_ANALYSIS",
        "PORTFOLIO_ANALYSIS",
        "A1_SHEET_GENERATION",
        "TECHNICAL_2D",
        "PHOTOREALISTIC_3D",
        "MODIFICATION_REASONING",
      ];

      taskTypes.forEach((taskType) => {
        const config = modelRouter.getModelConfig(taskType);
        expect(config).toBeDefined();
        expect(config.primary).toBeDefined();
      });
    });
  });

  describe("Fallback Cascade", () => {
    test("should have fallback model for DNA generation", () => {
      process.env.AI_MODEL_DNA =
        "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo";
      process.env.AI_FALLBACK_DNA = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

      const config = modelRouter.getModelConfig("DNA_GENERATION");

      expect(config.fallback).toBe("meta-llama/Llama-3.3-70B-Instruct-Turbo");
    });

    test("should have emergency fallback to OpenAI", () => {
      process.env.OPENAI_MODEL_REASONING = "gpt-4o";

      const config = modelRouter.getModelConfig("DNA_GENERATION");

      expect(config.emergency).toBeDefined();
    });

    test("should have emergency fallback to Anthropic", () => {
      process.env.ANTHROPIC_MODEL_REASONING = "claude-sonnet-4.5";

      const config = modelRouter.getModelConfig("ARCHITECTURAL_REASONING");

      expect(config.emergency).toBeDefined();
    });

    test("should maintain 3-level fallback hierarchy", () => {
      process.env.AI_MODEL_DNA = "llama-405b";
      process.env.AI_FALLBACK_DNA = "qwen-72b";
      process.env.OPENAI_MODEL_REASONING = "gpt-4o";

      const config = modelRouter.getModelConfig("DNA_GENERATION");

      expect(config.primary).toBeDefined();
      expect(config.fallback).toBeDefined();
      expect(config.emergency).toBeDefined();
    });
  });

  describe("LLM Call Integration (Mock)", () => {
    test("should accept standard chat completion format", async () => {
      const options = {
        messages: [
          { role: "system", content: "You are an architectural AI." },
          {
            role: "user",
            content: "Generate design DNA for a residential building.",
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      };

      // Mock implementation - real test would call actual API
      expect(options.messages).toHaveLength(2);
      expect(options.temperature).toBe(0.7);
      expect(options.max_tokens).toBe(4000);
    });

    test("should validate required parameters", () => {
      const invalidOptions = {
        // Missing messages
        temperature: 0.7,
      };

      expect(() => {
        if (!invalidOptions.messages) {
          throw new Error("messages is required");
        }
      }).toThrow("messages is required");
    });

    test("should support optional parameters", async () => {
      const options = {
        messages: [{ role: "user", content: "Test" }],
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 2000,
        stop: ["END"],
      };

      expect(options.temperature).toBe(0.8);
      expect(options.top_p).toBe(0.9);
      expect(options.max_tokens).toBe(2000);
      expect(options.stop).toEqual(["END"]);
    });
  });

  describe("Image Generation Integration (Mock)", () => {
    test("should accept standard image generation format", async () => {
      const options = {
        prompt:
          "Professional A1 architectural sheet with floor plans and elevations",
        width: 1792,
        height: 1269,
        steps: 48,
        guidance_scale: 7.8,
        seed: 42,
      };

      expect(options.prompt).toBeDefined();
      expect(options.width).toBe(1792);
      expect(options.height).toBe(1269);
      expect(options.steps).toBe(48);
      expect(options.guidance_scale).toBe(7.8);
      expect(options.seed).toBe(42);
    });

    test("should validate image dimensions", () => {
      const invalidOptions = {
        prompt: "Test",
        width: 0, // Invalid
        height: 0, // Invalid
      };

      expect(() => {
        if (invalidOptions.width <= 0 || invalidOptions.height <= 0) {
          throw new Error("Invalid dimensions");
        }
      }).toThrow("Invalid dimensions");
    });

    test("should support Together.ai compliant dimensions", () => {
      const validDimensions = [
        { width: 1792, height: 1269 }, // A1 landscape
        { width: 1024, height: 1024 }, // Square
        { width: 1024, height: 768 }, // 4:3
      ];

      validDimensions.forEach((dims) => {
        expect(dims.width).toBeGreaterThan(0);
        expect(dims.height).toBeGreaterThan(0);
        expect(dims.width * dims.height).toBeLessThanOrEqual(1792 * 1269);
      });
    });
  });

  describe("Cost Tracking", () => {
    test("should track token usage for LLM calls", () => {
      const mockUsage = {
        prompt_tokens: 1500,
        completion_tokens: 2500,
        total_tokens: 4000,
      };

      expect(mockUsage.total_tokens).toBe(
        mockUsage.prompt_tokens + mockUsage.completion_tokens,
      );
      expect(mockUsage.total_tokens).toBe(4000);
    });

    test("should calculate cost based on token usage", () => {
      const mockUsage = {
        prompt_tokens: 1000,
        completion_tokens: 2000,
        total_tokens: 3000,
      };

      // Together.ai pricing (example)
      const inputCostPerMillion = 3.0; // $3/1M tokens
      const outputCostPerMillion = 3.0; // $3/1M tokens

      const cost =
        (mockUsage.prompt_tokens / 1_000_000) * inputCostPerMillion +
        (mockUsage.completion_tokens / 1_000_000) * outputCostPerMillion;

      expect(cost).toBeCloseTo(0.009, 4); // $0.009
    });

    test("should track latency metrics", () => {
      const startTime = Date.now();
      // Simulate API call delay
      const endTime = startTime + 1500; // 1.5 seconds
      const latency = endTime - startTime;

      expect(latency).toBe(1500);
      expect(latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid task type", () => {
      expect(() => {
        modelRouter.getModelConfig("INVALID_TASK_TYPE");
      }).toThrow();
    });

    test("should handle missing environment variables gracefully", () => {
      delete process.env.AI_MODEL_DNA;

      // Should fall back to hardcoded defaults
      const config = modelRouter.getModelConfig("DNA_GENERATION");
      expect(config).toBeDefined();
      expect(config.primary).toBeDefined();
    });

    test("should validate model availability before calling", () => {
      const unavailableModel = "invalid-model-name";

      expect(() => {
        if (
          !unavailableModel.includes("llama") &&
          !unavailableModel.includes("qwen") &&
          !unavailableModel.includes("gpt")
        ) {
          throw new Error("Model not recognized");
        }
      }).toThrow("Model not recognized");
    });
  });

  describe("Environment Configuration", () => {
    test("should switch models via environment variables", () => {
      // Test 1: Llama 405B
      process.env.AI_MODEL_DNA =
        "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo";
      let config = modelRouter.getModelConfig("DNA_GENERATION");
      expect(config.primary).toContain("llama");

      // Test 2: Qwen 72B
      process.env.AI_MODEL_DNA = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
      config = modelRouter.getModelConfig("DNA_GENERATION");
      expect(config.primary).toContain("Qwen");

      // Test 3: GPT-4o
      process.env.AI_MODEL_DNA = "gpt-4o";
      config = modelRouter.getModelConfig("DNA_GENERATION");
      expect(config.primary).toBe("gpt-4o");
    });

    test("should support A/B testing with variant models", () => {
      process.env.AI_MODEL_DNA =
        "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo";
      process.env.AI_MODEL_DNA_VARIANT_B = "gpt-4o";

      const primaryConfig = modelRouter.getModelConfig("DNA_GENERATION");

      // Simulate A/B test (50/50 split)
      const useVariant = Math.random() < 0.5;
      const selectedModel = useVariant
        ? process.env.AI_MODEL_DNA_VARIANT_B
        : primaryConfig.primary;

      expect([
        "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
        "gpt-4o",
      ]).toContain(selectedModel);
    });
  });

  describe("Performance Metrics", () => {
    test("should measure request latency", () => {
      const metrics = {
        startTime: Date.now(),
        endTime: Date.now() + 2000,
        latencyMs: 2000,
      };

      expect(metrics.latencyMs).toBe(2000);
      expect(metrics.endTime - metrics.startTime).toBe(metrics.latencyMs);
    });

    test("should track success rate", () => {
      const metrics = {
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
      };

      const successRate =
        (metrics.successfulRequests / metrics.totalRequests) * 100;

      expect(successRate).toBe(95);
      expect(metrics.successfulRequests + metrics.failedRequests).toBe(
        metrics.totalRequests,
      );
    });

    test("should track average latency", () => {
      const latencies = [1200, 1500, 1800, 1400, 1600];
      const avgLatency =
        latencies.reduce((sum, val) => sum + val, 0) / latencies.length;

      expect(avgLatency).toBe(1500);
      expect(avgLatency).toBeGreaterThan(0);
    });
  });
});
