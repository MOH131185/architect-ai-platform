/**
 * Open-Source Model Router
 *
 * Central provider abstraction for open-source-ready capabilities. Phase 1
 * keeps this intentionally lightweight: it resolves configured adapters,
 * exposes clean capability contracts, and registers local fallback handlers
 * without claiming that heavyweight models are installed.
 */

import {
  getAdapterConfig,
  getArchitectureModelCategories,
  getModelCategoryFamilies,
  getModelFamilyConfig,
  getModelRegistryEntry,
  getModelsByCategory,
  getPreferredAdapterId,
  validateOpenSourceModelRegistry,
} from "../../config/openSourceModels.js";
import {
  getFeatureValue,
  isFeatureEnabled,
} from "../../config/featureFlags.js";
import logger from "../../utils/logger.js";

const VECTOR_DIMENSION = 96;
const ADAPTER_REGISTRY = new Map();

const CATEGORY_FLAG_MAP = {
  portfolio_style: "useOpenSourceStyleEngine",
  regional_style: "useOpenSourceStyleEngine",
  floorplan_generation: "useFloorplanEngine",
  technical_drawings: "useTechnicalDrawingEngine",
  visualization: "useModelRegistryRouter",
  precedent_retrieval: "usePrecedentRetrieval",
  cad_understanding: "useCadUnderstandingLayer",
};

function getFamilyRegistry(family) {
  if (!ADAPTER_REGISTRY.has(family)) {
    ADAPTER_REGISTRY.set(family, new Map());
  }
  return ADAPTER_REGISTRY.get(family);
}

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, component) => sum + component * component, 0),
  );

  if (!magnitude) {
    return vector.map(() => 0);
  }

  return vector.map((component) => component / magnitude);
}

function averageVectors(vectors) {
  if (!vectors.length) {
    return normalizeVector(new Array(VECTOR_DIMENSION).fill(0.001));
  }

  const aggregate = new Array(vectors[0].length).fill(0);
  vectors.forEach((vector) => {
    vector.forEach((component, index) => {
      aggregate[index] += component;
    });
  });

  return normalizeVector(
    aggregate.map((component) => component / vectors.length),
  );
}

function hashString(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function buildDeterministicVector(seedText, dimension = VECTOR_DIMENSION) {
  const safeSeed = String(seedText || "archiai-empty-seed");
  const hash = hashString(safeSeed);
  const vector = new Array(dimension).fill(0).map((_, index) => {
    const phase = (hash % 100000) * 0.0001;
    const waveA = Math.sin(phase + index * 0.13);
    const waveB = Math.cos(phase * 0.7 + index * 0.07);
    const waveC = Math.sin((safeSeed.length + 1) * 0.19 + index * 0.11);
    const tokenEffect = Math.sin((hash % 997) * (index + 1) * 0.0003);
    return waveA * 0.35 + waveB * 0.3 + waveC * 0.2 + tokenEffect * 0.15;
  });

  return normalizeVector(vector);
}

function serializeReference(reference) {
  if (typeof reference === "string") {
    return reference;
  }

  if (!reference || typeof reference !== "object") {
    return "";
  }

  return [
    reference.url,
    reference.description,
    reference.style,
    reference.region,
    reference.buildingType,
    reference.climate,
    ...(Array.isArray(reference.tags) ? reference.tags : []),
    ...(Array.isArray(reference.materials) ? reference.materials : []),
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildHeuristicEmbeddingPayload(payload = {}) {
  const references = Array.isArray(payload.references)
    ? payload.references
    : [];
  const promptContext = Array.isArray(payload.promptContext)
    ? payload.promptContext
    : [payload.promptContext].filter(Boolean);
  const seeds = [
    ...references.map(serializeReference).filter(Boolean),
    ...promptContext.map((entry) => String(entry)),
  ];
  const vectors = seeds.map((seed) => buildDeterministicVector(seed));
  return {
    embedding: averageVectors(vectors),
    sourceCount: seeds.length,
    seeds,
  };
}

function buildVisualizationPlaceholder(adapter, payload = {}) {
  return {
    status: "not_configured",
    adapterId: adapter?.id || "unknown",
    provider: adapter?.provider || "external",
    endpointConfigured: Boolean(adapter?.endpoint),
    prompt: payload.prompt || "",
    controlImageUrl: payload.controlImageUrl || null,
    styleDNA: payload.styleDNA || null,
    notes: [
      "No heavyweight visualization model is downloaded by default.",
      "Wire this adapter to a local or remote FLUX/SDXL/IP-Adapter service later.",
    ],
  };
}

function buildStructuredCadResponse(payload = {}) {
  return {
    status: "ready",
    adapterId: "arch-structured-normalizer",
    provider: "local",
    summary: {
      projectId: payload.project_id || payload.projectId || null,
      levelCount: Array.isArray(payload.levels) ? payload.levels.length : 0,
      elementFamilies: [
        "walls",
        "doors",
        "windows",
        "stairs",
        "columns",
        "beams",
        "furniture",
        "rooms",
        "labels",
      ],
    },
  };
}

function registerBuiltInAdapters() {
  registerOpenSourceAdapter(
    "styleEmbedding",
    "clip-local-heuristic",
    async (payload) => {
      const result = buildHeuristicEmbeddingPayload(payload);
      return {
        adapterId: "clip-local-heuristic",
        provider: "local",
        model: "clip-local-heuristic",
        dimension: result.embedding.length,
        embedding: result.embedding,
        sourceCount: result.sourceCount,
        seeds: result.seeds,
      };
    },
  );

  registerOpenSourceAdapter(
    "styleEmbedding",
    "siglip-local-heuristic",
    async (payload) => {
      const result = buildHeuristicEmbeddingPayload(payload);
      return {
        adapterId: "siglip-local-heuristic",
        provider: "local",
        model: "siglip-local-heuristic",
        dimension: result.embedding.length,
        embedding: result.embedding.map(
          (value, index) =>
            clamp01((value + 1) / 2) * (index % 2 === 0 ? 1 : -1),
        ),
        sourceCount: result.sourceCount,
        seeds: result.seeds,
      };
    },
  );

  registerOpenSourceAdapter(
    "precedentEmbedding",
    "clip-local-heuristic",
    async (payload) => {
      const result = buildHeuristicEmbeddingPayload(payload);
      return {
        adapterId: "clip-local-heuristic",
        provider: "local",
        model: "precedent-local-heuristic",
        dimension: result.embedding.length,
        embedding: result.embedding,
        sourceCount: result.sourceCount,
      };
    },
  );

  registerOpenSourceAdapter(
    "visualization",
    "flux-hook",
    async (payload, { adapterConfig }) =>
      buildVisualizationPlaceholder(adapterConfig, payload),
  );
  registerOpenSourceAdapter(
    "visualization",
    "sdxl-hook",
    async (payload, { adapterConfig }) =>
      buildVisualizationPlaceholder(adapterConfig, payload),
  );
  registerOpenSourceAdapter(
    "visualization",
    "controlnet-hook",
    async (payload, { adapterConfig }) =>
      buildVisualizationPlaceholder(adapterConfig, payload),
  );
  registerOpenSourceAdapter(
    "visualization",
    "ip-adapter-hook",
    async (payload, { adapterConfig }) =>
      buildVisualizationPlaceholder(adapterConfig, payload),
  );

  registerOpenSourceAdapter(
    "cadUnderstanding",
    "arch-structured-normalizer",
    async (payload) => buildStructuredCadResponse(payload),
  );
}

function isEntryEnvReady(entry = {}) {
  const requirements = Array.isArray(entry.env_requirements)
    ? entry.env_requirements
    : [];
  if (!requirements.length) {
    return true;
  }

  const runtimeEnv =
    typeof process !== "undefined" && process.env
      ? process.env
      : Object.create(null);

  return requirements.every((key) => {
    const value = runtimeEnv[key];
    return value !== undefined && value !== null && value !== "";
  });
}

function getEntryStatus(entry = {}) {
  const resolved = resolveOpenSourceAdapter(entry.family, entry.adapter_key, {
    allowFallback: false,
  });
  return {
    ...entry,
    integrationStatus: entry.integration_status,
    localOrRemote: entry.local_or_remote,
    inputTypes: entry.input_types,
    outputTypes: entry.output_types,
    recommendedUse: entry.recommended_use,
    envRequirements: entry.env_requirements,
    adapterKey: entry.adapter_key,
    env_ready: isEntryEnvReady(entry),
    envReady: isEntryEnvReady(entry),
    handler_available: Boolean(resolved.handler),
    handlerAvailable: Boolean(resolved.handler),
    adapter_configured: Boolean(resolved.adapterConfig),
    adapterConfigured: Boolean(resolved.adapterConfig),
    adapter_config: resolved.adapterConfig,
    adapterConfig: resolved.adapterConfig,
  };
}

function scoreModelForContext(entry, context = {}) {
  let score = 0;
  const needsLocal = context.preferLocal === true || context.offline === true;
  const prefersRemote = context.preferRemote === true;
  const needsReady = context.requireReady !== false;

  if (entry.local_or_remote === "local") score += 3;
  if (entry.local_or_remote === "remote") score += prefersRemote ? 2 : 0;
  if (needsLocal && entry.local_or_remote === "local") score += 4;
  if (needsReady && isEntryEnvReady(entry)) score += 2;
  if (entry.integration_status.includes("ready")) score += 2;
  if (entry.integration_status.includes("scaffolded")) score += 1;
  if (entry.recommended_use.toLowerCase().includes("phase 1")) score += 1;

  const useCase = String(context.useCase || context.intent || "").toLowerCase();
  if (useCase) {
    const haystack = [
      entry.label,
      entry.recommended_use,
      ...(entry.strengths || []),
      ...(entry.input_types || []),
      ...(entry.output_types || []),
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(useCase)) score += 2;
  }

  return score;
}

function getCategoryFlag(category) {
  return CATEGORY_FLAG_MAP[category] || "useModelRegistryRouter";
}

function resolveCategoryEntry(category, providerId = null, context = {}) {
  const models = getModelsByCategory(category);
  if (!models.length) {
    throw new Error(`Unknown model category: ${category}`);
  }

  if (providerId) {
    const direct = getModelRegistryEntry(category, providerId);
    if (direct) {
      return direct;
    }
  }

  const scored = models
    .map((entry) => ({ entry, score: scoreModelForContext(entry, context) }))
    .sort((left, right) => right.score - left.score);

  return scored[0]?.entry || models[0];
}

export function registerOpenSourceAdapter(family, adapterId, handler) {
  const registry = getFamilyRegistry(family);
  registry.set(adapterId, handler);
}

export function resolveOpenSourceAdapter(
  family,
  requestedAdapterId = null,
  options = {},
) {
  const familyConfig = getModelFamilyConfig(family);
  if (!familyConfig) {
    throw new Error(`Unknown open-source model family: ${family}`);
  }

  const preferredAdapterId = getPreferredAdapterId(family, requestedAdapterId);
  const registry = getFamilyRegistry(family);
  const allowFallback = options.allowFallback !== false;
  const candidateIds = allowFallback
    ? [
        preferredAdapterId,
        ...familyConfig.fallbackAdapters.filter(
          (adapterId) => adapterId !== preferredAdapterId,
        ),
      ].filter(Boolean)
    : [preferredAdapterId].filter(Boolean);

  for (const adapterId of candidateIds) {
    if (registry.has(adapterId)) {
      return {
        adapterId,
        handler: registry.get(adapterId),
        adapterConfig: getAdapterConfig(family, adapterId),
        requestedAdapterId: preferredAdapterId,
        fallbackUsed: adapterId !== preferredAdapterId,
      };
    }
  }

  return {
    adapterId: preferredAdapterId,
    handler: null,
    adapterConfig: getAdapterConfig(family, preferredAdapterId),
    requestedAdapterId: preferredAdapterId,
    fallbackUsed: false,
  };
}

export async function invokeOpenSourceAdapter(
  family,
  payload = {},
  options = {},
) {
  const requestedAdapterId = options.adapterId || payload.adapterId || null;
  const directResolution = resolveOpenSourceAdapter(
    family,
    requestedAdapterId,
    {
      allowFallback: false,
    },
  );
  const resolved = directResolution.handler
    ? directResolution
    : resolveOpenSourceAdapter(family, requestedAdapterId, {
        allowFallback: options.allowFallback !== false,
      });
  const { adapterId, handler, adapterConfig, fallbackUsed } = resolved;

  if (!handler) {
    return {
      status: "unavailable",
      adapterId,
      requestedAdapterId,
      provider: adapterConfig?.provider || "unknown",
      family,
      notes: [
        "No handler is registered for this adapter in the current runtime.",
        "Register a local handler or wire a remote provider later.",
      ],
    };
  }

  logger.debug(`[OpenSourceRouter] Invoking ${family}:${adapterId}`);
  const result = await handler(payload, {
    ...options,
    adapterId,
    adapterConfig,
    family,
  });

  if (!fallbackUsed) {
    return result;
  }

  return {
    ...result,
    requestedAdapterId,
    fallbackUsed: true,
    notes: [
      ...(Array.isArray(result?.notes) ? result.notes : []),
      `Requested adapter "${requestedAdapterId}" was unavailable; using fallback adapter "${adapterId}".`,
    ],
  };
}

export function getAvailableModelsByCategory(category) {
  return getModelsByCategory(category).map(getEntryStatus);
}

export function getRecommendedModel(category, context = {}) {
  const selectedModel = getEntryStatus(
    resolveCategoryEntry(category, null, context),
  );
  const flagName = getCategoryFlag(category);
  return {
    category,
    selectedModel,
    feature_flag: flagName,
    feature_enabled: isFeatureEnabled(flagName),
    rationale: [
      selectedModel.local_or_remote === "local"
        ? "Local-first option selected for reliability and lightweight development."
        : "Remote hook selected because the context explicitly prefers an external provider.",
      selectedModel.integration_status.includes("ready")
        ? "Entry is marked ready/scaffolded for current Phase 1 contracts."
        : "Entry remains a hook and will need Phase 2 integration work.",
    ],
  };
}

export function resolveModelAdapter(category, providerId = null, context = {}) {
  const entry = resolveCategoryEntry(category, providerId, context);
  const resolved = resolveOpenSourceAdapter(entry.family, entry.adapter_key, {
    allowFallback: false,
  });

  return {
    category,
    family: entry.family,
    model: getEntryStatus(entry),
    resolvedAdapterId: resolved.adapterId,
    resolvedAdapterKey: resolved.adapterId,
    handlerAvailable: Boolean(resolved.handler),
    adapterConfig: resolved.adapterConfig,
    familiesInCategory: getModelCategoryFamilies(category),
  };
}

export function validateModelConfig() {
  const registryValidation = validateOpenSourceModelRegistry();
  const adapterErrors = [];

  getArchitectureModelCategories().forEach((category) => {
    getModelsByCategory(category).forEach((entry) => {
      const adapterConfig = getAdapterConfig(entry.family, entry.adapter_key);
      if (!adapterConfig) {
        adapterErrors.push(
          `Category "${category}" entry "${entry.id}" points to unknown adapter "${entry.adapter_key}".`,
        );
      }
    });
  });

  return {
    valid: registryValidation.valid && adapterErrors.length === 0,
    errors: [...registryValidation.errors, ...adapterErrors],
    warnings: [...registryValidation.warnings],
  };
}

export function getModelStatus() {
  const categories = Object.fromEntries(
    getArchitectureModelCategories().map((category) => [
      category,
      {
        flag: getCategoryFlag(category),
        featureFlag: getCategoryFlag(category),
        enabled: Boolean(getFeatureValue(getCategoryFlag(category))),
        featureEnabled: Boolean(getFeatureValue(getCategoryFlag(category))),
        availableModels: getAvailableModelsByCategory(category),
        recommended: getRecommendedModel(category).selectedModel,
      },
    ]),
  );

  return {
    router: {
      enabled: Boolean(getFeatureValue("useModelRegistryRouter")),
      registeredFamilies: [...ADAPTER_REGISTRY.keys()],
    },
    phase2: {
      canonicalGeometry: Boolean(getFeatureValue("useCanonicalGeometryPhase2")),
      adjacencySolver: Boolean(getFeatureValue("useAdjacencySolver")),
      deterministicSvgPlans: Boolean(
        getFeatureValue("useDeterministicSvgPlans"),
      ),
      validationEngine: Boolean(getFeatureValue("useGeometryValidationEngine")),
      failClosedTechnicalFlow: Boolean(
        getFeatureValue("useFailClosedTechnicalFlow"),
      ),
    },
    categories,
    validation: validateModelConfig(),
  };
}

export async function generateStyleEmbedding(payload = {}, options = {}) {
  return invokeOpenSourceAdapter("styleEmbedding", payload, options);
}

export async function generateLayoutFromProgram(payload = {}, options = {}) {
  return invokeOpenSourceAdapter("floorplan", payload, options);
}

export async function generateTechnicalDrawings(payload = {}, options = {}) {
  return invokeOpenSourceAdapter("technicalDrawing", payload, options);
}

export async function generateVisualization(payload = {}, options = {}) {
  return invokeOpenSourceAdapter("visualization", payload, options);
}

export async function embedPrecedent(payload = {}, options = {}) {
  return invokeOpenSourceAdapter("precedentEmbedding", payload, options);
}

export async function searchSimilarPrecedents(payload = {}, options = {}) {
  return invokeOpenSourceAdapter("precedentSearch", payload, options);
}

registerBuiltInAdapters();

export default {
  registerOpenSourceAdapter,
  resolveOpenSourceAdapter,
  invokeOpenSourceAdapter,
  getAvailableModelsByCategory,
  getRecommendedModel,
  resolveModelAdapter,
  getModelStatus,
  validateModelConfig,
  generateStyleEmbedding,
  generateLayoutFromProgram,
  generateTechnicalDrawings,
  generateVisualization,
  embedPrecedent,
  searchSimilarPrecedents,
};
