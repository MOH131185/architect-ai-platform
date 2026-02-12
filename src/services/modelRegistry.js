/**
 * ArchiAI Model Registry
 *
 * Central category-based registry for all AI models used in the platform.
 * Supports hot-swapping models via env vars without code changes.
 *
 * Categories:
 *   - layout:   Floor plan generation (LLM few-shot, RAG, GNN, fine-tuned)
 *   - render:   Image rendering (FLUX, ControlNet, SDXL+LoRA)
 *   - style:    Style transfer (text-prompt, LoRA weights)
 *   - dna:      Design DNA generation (LLM)
 *   - geometry: 3D model generation (SVG projections, Blender headless)
 *
 * Relationship to modelRouter.js:
 *   modelRouter.js is task-centric (DNA_GENERATION, A1_SHEET_GENERATION, etc.)
 *   modelRegistry.js is capability-centric (layout, render, style, dna, geometry)
 *   They complement each other — registry provides category defaults,
 *   router handles task-level overrides and API call execution.
 *
 * @module services/modelRegistry
 */

import { isFeatureEnabled } from "../config/featureFlags.js";
import logger from "../utils/logger.js";

// ─── Registry Definition ──────────────────────────────────────────────────────

const REGISTRY = {
  // ═══════════════════════════════════════════
  // FLOOR PLAN LAYOUT MODELS
  // ═══════════════════════════════════════════
  layout: {
    active: null, // resolved at init
    models: {
      "qwen3-235b-fewshot": {
        id: "qwen3-235b-fewshot",
        type: "llm",
        provider: "together",
        togetherModel: "Qwen/Qwen3-235B-A22B-fp8",
        supportsJsonMode: false,
        stripThinkingTags: true,
        temperature: 0.3,
        maxTokens: 4000,
        description: "Few-shot LLM layout with Qwen3 (no training needed)",
      },
      "llama-3.3-70b": {
        id: "llama-3.3-70b",
        type: "llm",
        provider: "together",
        togetherModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        supportsJsonMode: true,
        stripThinkingTags: false,
        temperature: 0.3,
        maxTokens: 4000,
        description: "Llama 3.3 70B with JSON mode (proven reliable)",
      },
      "qwen-2.5-7b": {
        id: "qwen-2.5-7b",
        type: "llm",
        provider: "together",
        togetherModel: "Qwen/Qwen2.5-7B-Instruct-Turbo",
        supportsJsonMode: true,
        stripThinkingTags: false,
        temperature: 0.3,
        maxTokens: 4000,
        description: "Lightweight serverless fallback",
      },
      "qwen3-235b-rag": {
        id: "qwen3-235b-rag",
        type: "llm-rag",
        provider: "together",
        togetherModel: "Qwen/Qwen3-235B-A22B-fp8",
        vectorDB: null, // Set when PINECONE_INDEX configured
        supportsJsonMode: false,
        stripThinkingTags: true,
        temperature: 0.3,
        maxTokens: 4000,
        description:
          "RAG-enhanced with RPLAN examples (activate when Pinecone ready)",
      },
      "graph2plan-gnn": {
        id: "graph2plan-gnn",
        type: "gnn",
        provider: "self-hosted",
        endpoint: null, // Set via GNN_SERVER_URL
        description: "Graph2Plan GNN (activate when GNN server deployed)",
      },
    },
    fallbackChain: ["qwen3-235b-fewshot", "llama-3.3-70b", "qwen-2.5-7b"],
    envOverrideKey: "AI_MODEL_LAYOUT",
  },

  // ═══════════════════════════════════════════
  // RENDERING MODELS
  // ═══════════════════════════════════════════
  render: {
    active: null,
    models: {
      "flux-1-dev": {
        id: "flux-1-dev",
        type: "flux",
        provider: "together",
        togetherModel: "black-forest-labs/FLUX.1-dev",
        steps: 40,
        guidanceScale: 3.5,
        description: "FLUX.1-dev primary renderer (img2img capable)",
      },
      "flux-kontext-max": {
        id: "flux-kontext-max",
        type: "flux",
        provider: "together",
        togetherModel: "black-forest-labs/FLUX.1-kontext-max",
        steps: 48,
        guidanceScale: 7.8,
        description: "FLUX Kontext Max for highest quality",
      },
      "controlnet-canny": {
        id: "controlnet-canny",
        type: "controlnet",
        provider: "replicate",
        replicateModel: "jagilley/controlnet-canny",
        replicateVersion:
          "aff48af9c68d162388d230a2ab003f68d2638d88307bdaf1c2f1ac95079c9613",
        steps: 30,
        guidanceScale: 7.5,
        controlnetStrength: 0.75,
        requiresCannyEdge: true,
        description: "ControlNet Canny for geometry-locked renders (Replicate)",
      },
      "controlnet-depth": {
        id: "controlnet-depth",
        type: "controlnet",
        provider: "replicate",
        replicateModel: "fofr/sdxl-controlnet",
        controlType: "depth",
        controlnetStrength: 0.8,
        description:
          "ControlNet Depth for Blender Z-pass (activate when Blender ready)",
      },
    },
    fallbackChain: ["flux-1-dev", "flux-kontext-max"],
    envOverrideKey: "AI_MODEL_RENDER",
  },

  // ═══════════════════════════════════════════
  // STYLE LoRA MODELS
  // ═══════════════════════════════════════════
  style: {
    active: null,
    models: {
      "prompt-only": {
        id: "prompt-only",
        type: "text-prompt",
        provider: "none",
        description: "Style via text prompt blending (no LoRA)",
      },
      "portfolio-lora": {
        id: "portfolio-lora",
        type: "lora",
        provider: "replicate",
        weightsUrl: null, // Set per user when LoRA trained
        triggerWord: "archstyle",
        weight: 0.7,
        description: "User portfolio LoRA (activate when trained)",
      },
      "vernacular-lora": {
        id: "vernacular-lora",
        type: "lora",
        provider: "replicate",
        presets: {
          "uk-georgian": { weightsUrl: null, triggerWord: "ukgeorgian" },
          "uk-victorian": { weightsUrl: null, triggerWord: "ukvictorian" },
          "uk-contemporary": { weightsUrl: null, triggerWord: "ukcontemp" },
          "uk-arts-crafts": { weightsUrl: null, triggerWord: "ukartcraft" },
        },
        weight: 0.3,
        description: "Regional vernacular LoRA (activate when trained)",
      },
    },
    fallbackChain: ["prompt-only"],
    envOverrideKey: "AI_MODEL_STYLE",
  },

  // ═══════════════════════════════════════════
  // DNA GENERATION (already working)
  // ═══════════════════════════════════════════
  dna: {
    active: null,
    models: {
      "qwen-2.5-72b": {
        id: "qwen-2.5-72b",
        type: "llm",
        provider: "together",
        togetherModel: "Qwen/Qwen2.5-72B-Instruct-Turbo",
        supportsJsonMode: true,
        temperature: 0.2,
        maxTokens: 4000,
        description: "Two-Pass DNA Generator (working, production default)",
      },
      "llama-3.3-70b": {
        id: "llama-3.3-70b",
        type: "llm",
        provider: "together",
        togetherModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        supportsJsonMode: true,
        temperature: 0.2,
        maxTokens: 4000,
        description: "Llama 3.3 70B DNA fallback",
      },
    },
    fallbackChain: ["qwen-2.5-72b", "llama-3.3-70b"],
    envOverrideKey: "AI_MODEL_DNA",
  },

  // ═══════════════════════════════════════════
  // 3D GEOMETRY MODELS
  // ═══════════════════════════════════════════
  geometry: {
    active: null,
    models: {
      "svg-projections": {
        id: "svg-projections",
        type: "svg",
        provider: "local",
        description: "Projections2D.js deterministic SVG (working)",
      },
      "blender-headless": {
        id: "blender-headless",
        type: "blender",
        provider: "self-hosted",
        endpoint: null, // Set via BLENDER_SERVER_URL
        outputs: ["clay_render", "depth_map", "canny_edges"],
        description:
          "Blender headless 3D (activate when Docker server deployed)",
      },
    },
    fallbackChain: ["svg-projections"],
    envOverrideKey: "AI_MODEL_GEOMETRY",
  },
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const CATEGORY_DEFAULTS = {
  layout: "qwen3-235b-fewshot",
  render: "flux-1-dev",
  style: "prompt-only",
  dna: "qwen-2.5-72b",
  geometry: "svg-projections",
};

// ─── Env-driven model ID aliases ──────────────────────────────────────────────
// Maps env var values (Together model IDs or short names) to registry model IDs

const MODEL_ID_ALIASES = {
  // Layout aliases
  "Qwen/Qwen3-235B-A22B": "qwen3-235b-fewshot",
  "meta-llama/Llama-3.3-70B-Instruct-Turbo": "llama-3.3-70b",
  "Qwen/Qwen2.5-7B-Instruct-Turbo": "qwen-2.5-7b",
  "qwen3-235b": "qwen3-235b-fewshot",
  llama3: "llama-3.3-70b",
  // Render aliases
  "black-forest-labs/FLUX.1-dev": "flux-1-dev",
  "black-forest-labs/FLUX.1-kontext-max": "flux-kontext-max",
  flux: "flux-1-dev",
  controlnet: "controlnet-canny",
  // DNA aliases
  "Qwen/Qwen2.5-72B-Instruct-Turbo": "qwen-2.5-72b",
};

// ─── Initialization ───────────────────────────────────────────────────────────

function resolveModelId(rawValue) {
  if (!rawValue) return null;
  return MODEL_ID_ALIASES[rawValue] || rawValue;
}

function initializeRegistry() {
  const env = typeof process !== "undefined" && process.env ? process.env : {};

  for (const [category, catDef] of Object.entries(REGISTRY)) {
    // 1. Start with default
    catDef.active = CATEGORY_DEFAULTS[category] || null;

    // 2. Apply env override if set
    if (catDef.envOverrideKey) {
      const envVal =
        env[catDef.envOverrideKey] || env[`REACT_APP_${catDef.envOverrideKey}`];
      if (envVal) {
        const resolved = resolveModelId(envVal);
        if (catDef.models[resolved]) {
          catDef.active = resolved;
          logger.info(
            `[ModelRegistry] ${category} model set from env: ${resolved}`,
          );
        } else {
          logger.warn(
            `[ModelRegistry] Unknown model "${envVal}" for ${category}, using default`,
          );
        }
      }
    }

    // 3. Inject runtime env values into model configs
    if (category === "layout") {
      const ragModel = catDef.models["qwen3-235b-rag"];
      if (ragModel) ragModel.vectorDB = env.PINECONE_INDEX || null;
      const gnnModel = catDef.models["graph2plan-gnn"];
      if (gnnModel) gnnModel.endpoint = env.GNN_SERVER_URL || null;
    }
    if (category === "geometry") {
      const blender = catDef.models["blender-headless"];
      if (blender) blender.endpoint = env.BLENDER_SERVER_URL || null;
    }
  }

  logger.info("[ModelRegistry] Initialized:", {
    layout: REGISTRY.layout.active,
    render: REGISTRY.render.active,
    style: REGISTRY.style.active,
    dna: REGISTRY.dna.active,
    geometry: REGISTRY.geometry.active,
  });
}

// Initialize on module load
initializeRegistry();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the active model configuration for a category.
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @returns {Object|null} Model config with id and all properties
 */
export function getActiveModel(category) {
  if (!isFeatureEnabled("modelRegistry")) return null;

  const cat = REGISTRY[category];
  if (!cat) {
    logger.warn(`[ModelRegistry] Unknown category: ${category}`);
    return null;
  }
  const activeId = cat.active;
  const model = cat.models[activeId];
  if (!model) {
    logger.warn(
      `[ModelRegistry] Active model "${activeId}" not found in ${category}`,
    );
    return null;
  }
  return { ...model };
}

/**
 * Get configuration for a specific model by category and ID.
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Model config or null
 */
export function getModelConfig(category, modelId) {
  const cat = REGISTRY[category];
  if (!cat) return null;
  const model = cat.models[modelId];
  return model ? { ...model } : null;
}

/**
 * Get the fallback chain for a category (active model first, then fallbacks).
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @returns {string[]} Ordered list of model IDs
 */
export function getFallbackChain(category) {
  if (!isFeatureEnabled("modelRegistry")) return [];

  const cat = REGISTRY[category];
  if (!cat) return [];
  const chain = [cat.active, ...(cat.fallbackChain || [])];
  // Deduplicate while preserving order
  return [...new Set(chain)].filter(Boolean);
}

/**
 * Check if a model is ready to use (has all required dependencies).
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if model can be used
 */
export function isModelReady(category, modelId) {
  const model = getModelConfig(category, modelId);
  if (!model) return false;

  const env = typeof process !== "undefined" && process.env ? process.env : {};

  // Check provider-specific requirements
  switch (model.type) {
    case "gnn":
      return !!model.endpoint;
    case "llm-rag":
      return !!model.vectorDB;
    case "lora":
      return !!model.weightsUrl;
    case "blender":
      return !!model.endpoint;
    case "controlnet":
      return !!(env.REPLICATE_API_TOKEN || env.REPLICATE_API_KEY);
    case "llm":
    case "llm-finetuned":
    case "flux":
    case "text-prompt":
    case "svg":
      return true;
    default:
      return true;
  }
}

/**
 * Register a new model at runtime (e.g., after LoRA training completes).
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @param {string} id - Model identifier
 * @param {Object} config - Model configuration
 */
export function registerModel(category, id, config) {
  if (!REGISTRY[category]) {
    REGISTRY[category] = { active: id, models: {}, fallbackChain: [] };
  }
  REGISTRY[category].models[id] = { id, ...config };
  logger.info(
    `[ModelRegistry] Registered ${category}/${id}: ${config.description || ""}`,
  );
}

/**
 * Switch the active model for a category.
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @param {string} modelId - Model identifier (must be registered)
 */
export function setActiveModel(category, modelId) {
  const cat = REGISTRY[category];
  if (!cat) throw new Error(`Unknown category: ${category}`);
  if (!cat.models[modelId]) {
    throw new Error(`Model "${modelId}" not registered in ${category}`);
  }
  cat.active = modelId;
  logger.info(`[ModelRegistry] Active ${category} model: ${modelId}`);
}

/**
 * Get all registered models for a category.
 *
 * @param {string} category - layout|render|style|dna|geometry
 * @returns {Object} Map of modelId -> config
 */
export function getModels(category) {
  const cat = REGISTRY[category];
  if (!cat) return {};
  return { ...cat.models };
}

/**
 * Get summary of all categories and their active models.
 *
 * @returns {Object} Map of category -> { active, models: string[] }
 */
export function getRegistrySummary() {
  const summary = {};
  for (const [category, cat] of Object.entries(REGISTRY)) {
    summary[category] = {
      active: cat.active,
      models: Object.keys(cat.models),
      fallbackChain: cat.fallbackChain,
    };
  }
  return summary;
}

export { REGISTRY as MODEL_REGISTRY };

export default {
  getActiveModel,
  getModelConfig,
  getFallbackChain,
  isModelReady,
  registerModel,
  setActiveModel,
  getModels,
  getRegistrySummary,
};
