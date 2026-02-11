/**
 * Model Router Service
 *
 * Central routing service for all LLM and image generation calls.
 * Automatically selects optimal models based on:
 * - Task type (DNA generation, reasoning, image generation, etc.)
 * - Available API keys (GPT-5, Claude, Together, etc.)
 * - Cost/latency/quality constraints
 * - Feature flags and user preferences
 *
 * Built on top of modelSelector.js with environment-driven selection.
 */

import modelSelector from "./modelSelector.js";
import { safeParseJsonFromLLM } from "../utils/parseJsonFromLLM.js";
import runtimeEnv from "../utils/runtimeEnv.js";
import logger from "../utils/logger.js";

const API_BASE_URL =
  process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";

// Environment detection for endpoint selection
const isDev =
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" ||
    window.location?.hostname === "127.0.0.1");

// Endpoint paths (dev: /api/together/*, prod: /api/together-*)
const ENDPOINTS = {
  togetherChat: isDev ? "/api/together/chat" : "/api/together-chat",
  togetherImage: isDev ? "/api/together/image" : "/api/together-image",
  openaiChat: "/api/openai/chat",
};

const DEFAULT_EMERGENCY_ENV_KEY = "OPENAI_MODEL_REASONING";

const TASK_ALIASES = {
  PROGRAM_SYNTHESIS: "DNA_GENERATION",
  PROGRAM_COMPLIANCE: "ARCHITECTURAL_REASONING",
  GEOMETRY_LAYOUT: "ARCHITECTURAL_REASONING",
  VISION_QA: "MATERIAL_DETECTION",
  A1_COMPOSE: "ARCHITECTURAL_REASONING",
  DRAWING_2D_CRITIC: "ARCHITECTURAL_REASONING",
  IMAGE_RENDER: "A1_SHEET_GENERATION",
};

const TASK_ENVIRONMENT_KEYS = {
  DNA_GENERATION: {
    primary: "AI_MODEL_DNA",
    fallback: "AI_FALLBACK_DNA",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  ARCHITECTURAL_REASONING: {
    primary: "AI_MODEL_REASONING",
    fallback: "AI_FALLBACK_REASONING",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  SITE_ANALYSIS: {
    primary: "AI_MODEL_SITE",
    fallback: "AI_FALLBACK_SITE",
  },
  CLIMATE_LOGIC: {
    primary: "AI_MODEL_CLIMATE",
  },
  BLENDED_STYLE_GENERATION: {
    primary: "AI_MODEL_STYLE",
  },
  PORTFOLIO_ANALYSIS: {
    primary: "AI_MODEL_PORTFOLIO",
    fallback: "AI_FALLBACK_PORTFOLIO",
    emergency: "OPENAI_MODEL_PORTFOLIO",
  },
  A1_SHEET_GENERATION: {
    primary: "AI_MODEL_IMAGE",
    fallback: "AI_FALLBACK_IMAGE",
  },
  TECHNICAL_2D: {
    primary: "AI_MODEL_TECHNICAL",
    fallback: "AI_FALLBACK_TECHNICAL",
  },
  PHOTOREALISTIC_3D: {
    primary: "AI_MODEL_3D",
    fallback: "AI_FALLBACK_3D",
  },
  MODIFICATION_REASONING: {
    primary: "AI_MODEL_MODIFY",
    fallback: "AI_FALLBACK_MODIFY",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  MODIFICATION_IMAGE: {
    primary: "AI_MODEL_MODIFY_IMAGE",
    fallback: "AI_FALLBACK_MODIFY_IMAGE",
  },
  MATERIAL_DETECTION: {
    primary: "AI_MODEL_MATERIAL",
    fallback: "AI_FALLBACK_MATERIAL",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  PROGRAM_SYNTHESIS: {
    primary: "AI_MODEL_PROGRAM_SYNTHESIS",
    fallback: "AI_FALLBACK_PROGRAM_SYNTHESIS",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  PROGRAM_COMPLIANCE: {
    primary: "AI_MODEL_PROGRAM_COMPLIANCE",
    fallback: "AI_FALLBACK_PROGRAM_COMPLIANCE",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  GEOMETRY_LAYOUT: {
    primary: "AI_MODEL_GEOMETRY_LAYOUT",
    fallback: "AI_FALLBACK_GEOMETRY_LAYOUT",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  VISION_QA: {
    primary: "AI_MODEL_VISION_QA",
    fallback: "AI_FALLBACK_VISION_QA",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  A1_COMPOSE: {
    primary: "AI_MODEL_A1_COMPOSE",
    fallback: "AI_FALLBACK_A1_COMPOSE",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  DRAWING_2D_CRITIC: {
    primary: "AI_MODEL_2D_CRITIC",
    fallback: "AI_FALLBACK_2D_CRITIC",
    emergency: DEFAULT_EMERGENCY_ENV_KEY,
  },
  IMAGE_RENDER: {
    primary: "AI_MODEL_IMAGE_RENDER",
    fallback: "AI_FALLBACK_IMAGE_RENDER",
  },
};

function readEnvVar(key) {
  if (!key) return null;
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    return null;
  }
  return process.env[key] || null;
}

function inferProviderFromModel(model, fallbackProvider = "together") {
  if (!model || typeof model !== "string") return fallbackProvider;
  const lowered = model.toLowerCase();
  if (
    lowered.startsWith("gpt-") ||
    lowered.startsWith("o1") ||
    lowered.startsWith("o3") ||
    lowered.startsWith("o4")
  ) {
    return "openai";
  }
  if (lowered.includes("claude")) return "claude";
  return fallbackProvider;
}

/**
 * Check which API keys are available in environment
 */
function getAvailableProviders() {
  // In browser, we can't directly access process.env server keys
  // Instead, we'll try to detect availability through proxy health checks
  // For now, assume Together is always available (primary), OpenAI optional

  const available = {
    together: true, // Always available (primary provider)
    openai: false, // Will be detected via proxy
    claude: false, // Future support
    gpt5: false, // Future support
  };

  // Check sessionStorage for cached availability
  try {
    const session = runtimeEnv.getSession();
    if (!session) {
      return available;
    }

    const cached = session.getItem("modelRouter_availability");
    if (cached) {
      const parsed = JSON.parse(cached);
      const age = Date.now() - (parsed.timestamp || 0);
      if (age < 5 * 60 * 1000) {
        // 5 minute cache
        return parsed.providers;
      }
    }
  } catch (e) {
    // Ignore cache errors
  }

  return available;
}

/**
 * Cache provider availability
 */
function cacheAvailability(providers) {
  try {
    const session = runtimeEnv.getSession();
    if (!session) {
      return;
    }

    session.setItem(
      "modelRouter_availability",
      JSON.stringify({
        providers,
        timestamp: Date.now(),
      }),
    );
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Detect provider availability by attempting a lightweight health check
 */
async function detectProviderAvailability() {
  const available = {
    together: false,
    openai: false,
    claude: false,
    gpt5: false,
  };

  // Check Together.ai
  try {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.togetherChat}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct-Turbo", // Lightweight model
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }),
    });
    available.together = response.status !== 401 && response.status !== 403;
  } catch (e) {
    // Network error or server down
    available.together = true; // Assume available, will fail gracefully later
  }

  // Check OpenAI
  try {
    const response = await fetch(`${API_BASE_URL}/api/openai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }),
    });
    available.openai = response.status !== 401 && response.status !== 403;
  } catch (e) {
    // OpenAI not available
  }

  cacheAvailability(available);
  return available;
}

class ModelRouter {
  constructor() {
    this.selector = modelSelector;
    this.availableProviders = getAvailableProviders();
    this.performanceCache = new Map(); // Track model performance

    logger.info("🧭 ModelRouter initialized");

    // Async detection in background
    detectProviderAvailability().then((providers) => {
      this.availableProviders = providers;
      logger.info("🧭 Provider availability detected:", providers);
    });
  }

  /**
   * Return normalized model configuration for a task.
   * Used by tests, diagnostics, and admin tooling.
   */
  getModelConfig(taskType) {
    const { requestedTask, resolvedTask } = this.resolveTaskType(taskType);
    const matrixEntry = this.selector.modelMatrix?.[resolvedTask];

    if (!matrixEntry) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    const overrides = this.getEnvironmentOverrides(requestedTask);
    const envKeys =
      TASK_ENVIRONMENT_KEYS[requestedTask] ||
      TASK_ENVIRONMENT_KEYS[resolvedTask] ||
      {};
    if (
      this.isStrictEnvRoutingEnabled() &&
      envKeys.primary &&
      !readEnvVar(envKeys.primary)
    ) {
      throw new Error(
        `Strict model routing enabled, but ${envKeys.primary} is not set for task ${requestedTask}`,
      );
    }

    const primaryModel =
      overrides.primary || matrixEntry.primary?.model || null;

    const config = {
      taskType: requestedTask,
      resolvedTaskType: resolvedTask,
      primary: primaryModel,
      fallback: overrides.fallback || matrixEntry.fallback?.model || null,
      emergency: overrides.emergency || matrixEntry.emergency?.model || null,
      provider: inferProviderFromModel(
        primaryModel,
        matrixEntry.primary?.provider || "together",
      ),
      params: { ...(matrixEntry.primary?.params || {}) },
      metadata: {
        costPerCall: matrixEntry.primary?.costPerCall ?? null,
        avgLatency: matrixEntry.primary?.avgLatency ?? null,
        reliability: matrixEntry.primary?.reliability ?? null,
        overrideKeys: envKeys,
      },
    };

    if (!config.primary) {
      throw new Error(`No primary model configured for ${requestedTask}`);
    }

    return config;
  }

  getEnvironmentOverrides(taskType) {
    const normalizedTask = this.normalizeTaskType(taskType);
    const resolvedTask = TASK_ALIASES[normalizedTask] || normalizedTask;
    const envKeys =
      TASK_ENVIRONMENT_KEYS[normalizedTask] ||
      TASK_ENVIRONMENT_KEYS[resolvedTask] ||
      {};

    const overrides = {
      primary: readEnvVar(envKeys.primary),
      fallback: readEnvVar(envKeys.fallback),
      emergency: readEnvVar(envKeys.emergency),
    };

    if (
      !overrides.emergency &&
      envKeys.emergency !== DEFAULT_EMERGENCY_ENV_KEY
    ) {
      overrides.emergency = readEnvVar(DEFAULT_EMERGENCY_ENV_KEY);
    }

    return overrides;
  }

  resolveTaskType(taskType) {
    const requestedTask = this.normalizeTaskType(taskType);
    return {
      requestedTask,
      resolvedTask: TASK_ALIASES[requestedTask] || requestedTask,
    };
  }

  normalizeTaskType(taskType) {
    if (!taskType || typeof taskType !== "string") {
      throw new Error("Task type is required");
    }
    return taskType.toUpperCase();
  }

  isStrictEnvRoutingEnabled() {
    return (
      readEnvVar("ARCHIAI_STRICT_MODEL_ROUTING") === "true" ||
      readEnvVar("REACT_APP_ARCHIAI_STRICT_MODEL_ROUTING") === "true"
    );
  }

  buildTaskCandidates(taskType, context = {}) {
    const { requestedTask, resolvedTask } = this.resolveTaskType(taskType);
    const matrixEntry = this.selector.modelMatrix?.[resolvedTask];
    if (!matrixEntry || !matrixEntry.primary) {
      throw new Error(`Unknown task type: ${requestedTask}`);
    }

    const dynamicPrimary = this.selector.selectModel(resolvedTask, {
      ...context,
      availableProviders: this.availableProviders,
    });
    const overrides = this.getEnvironmentOverrides(requestedTask);
    const envKeys =
      TASK_ENVIRONMENT_KEYS[requestedTask] ||
      TASK_ENVIRONMENT_KEYS[resolvedTask] ||
      {};
    if (
      this.isStrictEnvRoutingEnabled() &&
      envKeys.primary &&
      !readEnvVar(envKeys.primary)
    ) {
      throw new Error(
        `Strict model routing enabled, but ${envKeys.primary} is not set for task ${requestedTask}`,
      );
    }

    const applyOverride = (baseConfig, overrideModel) => {
      if (!baseConfig && !overrideModel) return null;
      const fallbackBase = baseConfig || dynamicPrimary || matrixEntry.primary;
      return {
        ...fallbackBase,
        model: overrideModel || fallbackBase.model,
        provider: inferProviderFromModel(
          overrideModel || fallbackBase.model,
          fallbackBase.provider || "together",
        ),
        params: { ...(fallbackBase.params || {}) },
      };
    };

    return {
      requestedTask,
      resolvedTask,
      primary: applyOverride(dynamicPrimary, overrides.primary),
      fallback: applyOverride(matrixEntry.fallback, overrides.fallback),
      emergency: applyOverride(matrixEntry.emergency, overrides.emergency),
    };
  }

  /**
   * Call LLM for text/reasoning tasks
   *
   * @param {string} taskType - Task type (DNA_GENERATION, SITE_ANALYSIS, etc.)
   * @param {Object} params - Call parameters
   * @param {string} params.systemPrompt - System message
   * @param {string} params.userPrompt - User message
   * @param {Object} [params.schema] - JSON schema for structured output
   * @param {number} [params.temperature] - Override temperature
   * @param {number} [params.maxTokens] - Override max tokens
   * @param {Object} [params.context] - Selection context (priority, budget, etc.)
   * @returns {Promise<Object>} Parsed response with metadata
   */
  async callLLM(taskType, params) {
    const {
      systemPrompt,
      userPrompt,
      schema = null,
      temperature,
      maxTokens,
      context = {},
    } = params;

    const startTime = Date.now();

    try {
      const taskCandidates = this.buildTaskCandidates(taskType, context);
      const selectionTier = context.useEmergency
        ? "emergency"
        : context.useFallback
          ? "fallback"
          : "primary";
      const modelConfig =
        taskCandidates[selectionTier] || taskCandidates.primary;
      if (!modelConfig?.model) {
        throw new Error(
          `No ${selectionTier} model available for ${taskCandidates.requestedTask}`,
        );
      }

      logger.info(`🧭 [ModelRouter] Task: ${taskCandidates.requestedTask}`);
      logger.info(`   Resolved Task: ${taskCandidates.resolvedTask}`);
      logger.info(`   Tier: ${selectionTier}`);
      logger.info(`   Model: ${modelConfig.model} (${modelConfig.provider})`);
      logger.info(
        `   Reasoning: ${modelConfig.reasoning || "env/matrix-selected"}`,
      );

      // Build messages
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      // Merge parameters
      const callParams = {
        ...modelConfig.params,
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      };

      // Add schema if provided
      if (schema && callParams.response_format) {
        callParams.response_format = { type: "json_object" };
      }

      let result;
      let actualModel = modelConfig.model;

      // Route to appropriate provider
      if (modelConfig.provider === "together") {
        result = await this.callTogetherChat(
          modelConfig.model,
          messages,
          callParams,
        );
      } else if (modelConfig.provider === "openai") {
        result = await this.callOpenAIChat(
          modelConfig.model,
          messages,
          callParams,
        );
      } else {
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
      }

      const latency = Date.now() - startTime;

      // Parse response
      const content =
        result.choices?.[0]?.message?.content || result.content || "";
      let parsed = content;

      // Try JSON parsing if schema was requested
      if (schema || callParams.response_format?.type === "json_object") {
        parsed = safeParseJsonFromLLM(content, {});
      }

      // Track performance
      this.trackPerformance(taskCandidates.requestedTask, actualModel, latency);

      logger.success(
        ` [ModelRouter] ${taskCandidates.requestedTask} completed in ${latency}ms`,
      );

      return {
        success: true,
        data: parsed,
        rawContent: content,
        metadata: {
          model: actualModel,
          provider: modelConfig.provider,
          taskType: taskCandidates.requestedTask,
          resolvedTaskType: taskCandidates.resolvedTask,
          selectionTier,
          latencyMs: latency,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(
        `❌ [ModelRouter] ${taskType} failed after ${latency}ms:`,
        error.message,
      );

      let taskCandidates = null;
      try {
        taskCandidates = this.buildTaskCandidates(taskType, context);
      } catch {
        taskCandidates = null;
      }

      if (
        !context.useFallback &&
        context.fallbackEnabled !== false &&
        taskCandidates?.fallback
      ) {
        logger.info(`🔄 [ModelRouter] Attempting fallback model...`);

        try {
          return await this.callLLM(taskType, {
            ...params,
            context: {
              ...context,
              useFallback: true,
              fallbackEnabled: false,
              emergencyEnabled: context.emergencyEnabled !== false,
            },
          });
        } catch (fallbackError) {
          logger.error(
            `❌ [ModelRouter] Fallback also failed:`,
            fallbackError.message,
          );
        }
      }

      if (
        !context.useEmergency &&
        context.emergencyEnabled !== false &&
        taskCandidates?.emergency
      ) {
        logger.info(`🚨 [ModelRouter] Attempting emergency model...`);
        try {
          return await this.callLLM(taskType, {
            ...params,
            context: {
              ...context,
              useEmergency: true,
              emergencyEnabled: false,
              fallbackEnabled: false,
            },
          });
        } catch (emergencyError) {
          logger.error(
            `❌ [ModelRouter] Emergency model also failed:`,
            emergencyError.message,
          );
        }
      }

      return {
        success: false,
        error: error.message,
        metadata: {
          taskType,
          latencyMs: latency,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Call image generation models
   *
   * @param {string} taskType - Task type (A1_SHEET_GENERATION, TECHNICAL_2D, PHOTOREALISTIC_3D)
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Main prompt
   * @param {string} [params.negativePrompt] - Negative prompt
   * @param {number} [params.seed] - Seed for consistency
   * @param {number} [params.width] - Image width
   * @param {number} [params.height] - Image height
   * @param {number} [params.steps] - Inference steps
   * @param {Object} [params.context] - Selection context
   * @returns {Promise<Object>} Generated image with metadata
   */
  async callImage(taskType, params) {
    const {
      prompt,
      negativePrompt,
      seed,
      width,
      height,
      steps,
      context = {},
    } = params;

    const startTime = Date.now();

    try {
      const taskCandidates = this.buildTaskCandidates(taskType, {
        ...context,
        availableProviders: this.availableProviders,
        originalSeed: seed,
      });
      const selectionTier = context.useEmergency
        ? "emergency"
        : context.useFallback
          ? "fallback"
          : "primary";
      const modelConfig =
        taskCandidates[selectionTier] || taskCandidates.primary;
      if (!modelConfig?.model) {
        throw new Error(
          `No ${selectionTier} image model available for ${taskCandidates.requestedTask}`,
        );
      }

      logger.info(
        `🧭 [ModelRouter] Image Task: ${taskCandidates.requestedTask}`,
      );
      logger.info(`   Resolved Task: ${taskCandidates.resolvedTask}`);
      logger.info(`   Tier: ${selectionTier}`);
      logger.info(`   Model: ${modelConfig.model}`);
      logger.info(
        `   Resolution: ${width || modelConfig.params.width}×${height || modelConfig.params.height}`,
      );

      // Merge parameters
      const callParams = {
        model: modelConfig.model,
        prompt,
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        width: width || modelConfig.params.width,
        height: height || modelConfig.params.height,
        seed: seed || modelConfig.params.seed,
        num_inference_steps: steps || modelConfig.params.num_inference_steps,
        guidance_scale: modelConfig.params.guidance_scale,
      };

      // Add scheduler if specified
      if (modelConfig.params.scheduler) {
        callParams.scheduler = modelConfig.params.scheduler;
      }

      if (modelConfig.provider !== "together") {
        throw new Error(
          `Unsupported image provider for ${taskCandidates.requestedTask}: ${modelConfig.provider}. Configure a Together image model for this task.`,
        );
      }

      // Call Together image API
      const response = await fetch(
        `${API_BASE_URL}${ENDPOINTS.togetherImage}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(callParams),
        },
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      // Track performance
      this.trackPerformance(
        taskCandidates.requestedTask,
        modelConfig.model,
        latency,
      );

      logger.success(` [ModelRouter] Image generated in ${latency}ms`);

      return {
        success: true,
        url: data.url,
        metadata: {
          model: modelConfig.model,
          provider: modelConfig.provider,
          taskType: taskCandidates.requestedTask,
          resolvedTaskType: taskCandidates.resolvedTask,
          selectionTier,
          width: callParams.width,
          height: callParams.height,
          seed: callParams.seed,
          steps: callParams.num_inference_steps,
          latencyMs: latency,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error(
        `❌ [ModelRouter] Image generation failed after ${latency}ms:`,
        error.message,
      );

      let taskCandidates = null;
      try {
        taskCandidates = this.buildTaskCandidates(taskType, context);
      } catch {
        taskCandidates = null;
      }

      if (
        !context.useFallback &&
        context.fallbackEnabled !== false &&
        taskCandidates?.fallback
      ) {
        logger.info(`🔄 [ModelRouter] Attempting fallback image model...`);

        try {
          return await this.callImage(taskType, {
            ...params,
            context: {
              ...context,
              useFallback: true,
              fallbackEnabled: false,
              emergencyEnabled: context.emergencyEnabled !== false,
            },
          });
        } catch (fallbackError) {
          logger.error(
            `❌ [ModelRouter] Fallback also failed:`,
            fallbackError.message,
          );
        }
      }

      if (
        !context.useEmergency &&
        context.emergencyEnabled !== false &&
        taskCandidates?.emergency
      ) {
        logger.info(`🚨 [ModelRouter] Attempting emergency image model...`);
        try {
          return await this.callImage(taskType, {
            ...params,
            context: {
              ...context,
              useEmergency: true,
              emergencyEnabled: false,
              fallbackEnabled: false,
            },
          });
        } catch (emergencyError) {
          logger.error(
            `❌ [ModelRouter] Emergency image model also failed:`,
            emergencyError.message,
          );
        }
      }

      return {
        success: false,
        error: error.message,
        metadata: {
          taskType,
          latencyMs: latency,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Call Together.ai chat API
   */
  async callTogetherChat(model, messages, params) {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.togetherChat}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        ...params,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Call OpenAI chat API
   */
  async callOpenAIChat(model, messages, params) {
    const response = await fetch(`${API_BASE_URL}${ENDPOINTS.openaiChat}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        ...params,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Track model performance for adaptive selection
   */
  trackPerformance(taskType, model, latencyMs) {
    const key = `${taskType}:${model}`;
    const existing = this.performanceCache.get(key) || {
      count: 0,
      totalLatency: 0,
      failures: 0,
    };

    existing.count++;
    existing.totalLatency += latencyMs;
    existing.avgLatency = existing.totalLatency / existing.count;
    existing.lastUsed = Date.now();

    this.performanceCache.set(key, existing);

    // Limit cache size
    if (this.performanceCache.size > 100) {
      const oldest = Array.from(this.performanceCache.entries()).sort(
        (a, b) => a[1].lastUsed - b[1].lastUsed,
      )[0];
      this.performanceCache.delete(oldest[0]);
    }
  }

  /**
   * Get rate limiting config for current provider
   */
  getRateLimiting(provider = "together") {
    return this.selector.getRateLimiting(provider);
  }

  /**
   * Calculate estimated cost for a workflow
   */
  calculateWorkflowCost(workflowType) {
    return this.selector.getWorkflowRecommendations(workflowType);
  }

  /**
   * Get performance stats
   */
  getPerformanceStats() {
    const stats = {};
    this.performanceCache.forEach((value, key) => {
      stats[key] = {
        avgLatency: Math.round(value.avgLatency),
        callCount: value.count,
        failureRate: value.failures / value.count,
      };
    });
    return stats;
  }
}

// Singleton instance
const modelRouter = new ModelRouter();

/**
 * Convenience methods for common tasks
 */

/**
 * Generate Design DNA using optimal model
 */
export async function generateDNA(params) {
  const {
    projectBrief,
    locationProfile,
    blendedStyle,
    siteMetrics,
    programSpaces,
    context,
  } = params;

  return await modelRouter.callLLM("DNA_GENERATION", {
    systemPrompt:
      "You are an expert architect creating detailed Design DNA for architectural projects. Always return valid JSON with exact specifications.",
    userPrompt: buildDNAPrompt({
      projectBrief,
      locationProfile,
      blendedStyle,
      siteMetrics,
      programSpaces,
    }),
    schema: true,
    temperature: 0.2,
    maxTokens: 4000,
    context: context || {},
  });
}

/**
 * Generate architectural reasoning
 */
export async function generateReasoning(params) {
  const { projectContext, context } = params;

  return await modelRouter.callLLM("ARCHITECTURAL_REASONING", {
    systemPrompt:
      "You are an expert architect providing design reasoning and recommendations. Return structured JSON.",
    userPrompt: buildReasoningPrompt(projectContext),
    schema: true,
    temperature: 0.7,
    maxTokens: 2000,
    context: context || {},
  });
}

/**
 * Generate A1 sheet image
 */
export async function generateA1SheetImage(params) {
  const { prompt, negativePrompt, seed, width, height, context } = params;

  return await modelRouter.callImage("A1_SHEET_GENERATION", {
    prompt,
    negativePrompt,
    seed,
    width: width || 1792,
    height: height || 1269,
    context: context || {},
  });
}

/**
 * Generate 2D technical drawing
 */
export async function generate2DTechnical(params) {
  const { prompt, negativePrompt, seed, context } = params;

  return await modelRouter.callImage("TECHNICAL_2D", {
    prompt,
    negativePrompt,
    seed,
    width: 1024,
    height: 1024,
    context: context || {},
  });
}

/**
 * Generate 3D photorealistic view
 */
export async function generate3DView(params) {
  const { prompt, negativePrompt, seed, context } = params;

  return await modelRouter.callImage("PHOTOREALISTIC_3D", {
    prompt,
    negativePrompt,
    seed,
    width: 1536,
    height: 1024,
    context: context || {},
  });
}

// Helper: Build DNA prompt (simplified - full version in promptLibrary)
function buildDNAPrompt({
  projectBrief,
  locationProfile,
  blendedStyle,
  siteMetrics,
  programSpaces,
}) {
  return `Generate Master Design DNA for:
Project: ${projectBrief || "Architectural project"}
Location: ${locationProfile?.address || "Not specified"}
Style: ${blendedStyle?.styleName || "Contemporary"}
Site: ${siteMetrics?.areaM2 || "TBD"}m²
Program: ${programSpaces?.map((s) => `${s.name}: ${s.area}m²`).join(", ") || "TBD"}

Return detailed JSON with dimensions, materials, rooms, elevations, and consistency rules.`;
}

// Helper: Build reasoning prompt (simplified)
function buildReasoningPrompt(projectContext) {
  return `Provide architectural design reasoning for:
${JSON.stringify(projectContext, null, 2)}

Return JSON with designPhilosophy, spatialOrganization, materialRecommendations, and environmentalConsiderations.`;
}

export default modelRouter;
export { modelRouter };
