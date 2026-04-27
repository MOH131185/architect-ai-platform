const DEFAULT_MODEL_SOURCE = "hybrid";
const DEFAULT_FALLBACK_POLICY = "use_base_when_ft_missing";

export const ARCHITECTURE_MODEL_STEP_CONFIG = Object.freeze({
  ROUTER: {
    label: "Request router",
    envPrefix: "STEP_00_ROUTER",
    baseKeys: ["STEP_00_ROUTER_MODEL", "OPENAI_FAST_MODEL"],
    fineTunedKeys: ["STEP_00_ROUTER_FT_MODEL"],
    defaultBaseModel: "gpt-5.4-mini",
  },
  ORCHESTRATOR: {
    label: "Generation orchestrator",
    envPrefix: "STEP_00_ORCHESTRATOR",
    baseKeys: ["STEP_00_ORCHESTRATOR_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_00_ORCHESTRATOR_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  BRIEF: {
    label: "Brief intake",
    envPrefix: "STEP_01_BRIEF",
    baseKeys: ["STEP_01_BRIEF_MODEL", "OPENAI_FAST_MODEL"],
    fineTunedKeys: ["STEP_01_BRIEF_FT_MODEL"],
    defaultBaseModel: "gpt-5.4-mini",
  },
  STYLE_DESIRE: {
    label: "Style desire",
    envPrefix: "STEP_01_STYLE_DESIRE",
    baseKeys: ["STEP_01_STYLE_DESIRE_MODEL", "OPENAI_FAST_MODEL"],
    fineTunedKeys: ["STEP_01_STYLE_DESIRE_FT_MODEL"],
    defaultBaseModel: "gpt-5.4-mini",
  },
  SITE: {
    label: "Site/context pack",
    envPrefix: "STEP_02_SITE",
    baseKeys: ["STEP_02_SITE_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_02_SITE_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  CLIMATE: {
    label: "Climate pack",
    envPrefix: "STEP_03_CLIMATE",
    baseKeys: ["STEP_03_CLIMATE_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_03_CLIMATE_RFT_MODEL", "STEP_03_CLIMATE_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  REGS: {
    label: "Regulation pack",
    envPrefix: "STEP_04_REGS",
    baseKeys: ["STEP_04_REGS_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_04_REGS_RFT_MODEL", "STEP_04_REGS_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  PROGRAMME: {
    label: "Programme generation",
    envPrefix: "STEP_05_PROGRAMME",
    baseKeys: ["STEP_05_PROGRAMME_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_05_PROGRAMME_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  CONCEPT: {
    label: "Concept narrative",
    envPrefix: "STEP_06_CONCEPT",
    baseKeys: ["STEP_06_CONCEPT_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_06_CONCEPT_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  MASSING: {
    label: "Massing JSON",
    envPrefix: "STEP_06_MASSING",
    baseKeys: ["STEP_06_MASSING_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_06_MASSING_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  PROJECT_GRAPH: {
    label: "ProjectGraph synthesis",
    envPrefix: "STEP_07_PROJECT_GRAPH",
    baseKeys: ["STEP_07_PROJECT_GRAPH_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_07_PROJECT_GRAPH_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  DRAWING_2D: {
    label: "2D labels and QA",
    envPrefix: "STEP_08_2D",
    baseKeys: [
      "STEP_08_2D_LABEL_MODEL",
      "STEP_08_2D_QA_MODEL",
      "OPENAI_FAST_MODEL",
    ],
    fineTunedKeys: ["STEP_08_2D_LABEL_FT_MODEL"],
    defaultBaseModel: "gpt-5.4-mini",
    deterministicGeometry: true,
  },
  MODEL_3D: {
    label: "3D validation",
    envPrefix: "STEP_09_3D",
    baseKeys: ["STEP_09_3D_QA_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_09_3D_VISION_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
    deterministicGeometry: true,
  },
  IMAGE: {
    label: "Presentation image support",
    envPrefix: "STEP_10_IMAGE",
    baseKeys: ["STEP_10_IMAGE_MODEL", "OPENAI_IMAGE_MODEL"],
    fineTunedKeys: [],
    defaultBaseModel: "gpt-image-2",
  },
  MATERIALS: {
    label: "Material strategy",
    envPrefix: "STEP_11_MATERIALS",
    baseKeys: ["STEP_11_MATERIALS_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_11_MATERIALS_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  A1_SHEET: {
    label: "A1 sheet composition",
    envPrefix: "STEP_12_A1_SHEET",
    baseKeys: ["STEP_12_A1_SHEET_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_12_A1_SHEET_DPO_MODEL", "STEP_12_A1_SHEET_FT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
  QA: {
    label: "QA and evals",
    envPrefix: "STEP_13_QA",
    baseKeys: ["STEP_13_QA_MODEL", "OPENAI_REASONING_MODEL"],
    fineTunedKeys: ["STEP_13_QA_RFT_MODEL", "STEP_13_QA_SFT_MODEL"],
    defaultBaseModel: "gpt-5.4",
  },
});

const STEP_ALIASES = Object.freeze({
  "00_ROUTER": "ROUTER",
  ROUTE: "ROUTER",
  "00_ORCHESTRATOR": "ORCHESTRATOR",
  BRIEF_INTAKE: "BRIEF",
  SITE_CONTEXT: "SITE",
  REGULATION: "REGS",
  REGULATIONS: "REGS",
  PROGRAM: "PROGRAMME",
  PROGRAMME_GENERATION: "PROGRAMME",
  PROJECTGRAPH: "PROJECT_GRAPH",
  PROJECT_GRAPH_GENERATION: "PROJECT_GRAPH",
  DNA_GENERATION: "PROJECT_GRAPH",
  "2D": "DRAWING_2D",
  "2D_PROJECTION": "DRAWING_2D",
  DRAWING: "DRAWING_2D",
  DRAWINGS: "DRAWING_2D",
  "3D": "MODEL_3D",
  "3D_PROJECTION": "MODEL_3D",
  MODEL: "MODEL_3D",
  VISION_QA: "MODEL_3D",
  TECHNICAL_2D: "DRAWING_2D",
  SHEET: "A1_SHEET",
  A1: "A1_SHEET",
  A1_COMPOSE: "A1_SHEET",
  A1_SHEET_GENERATION: "A1_SHEET",
  ARCHITECTURAL_REASONING: "CONCEPT",
  CLIMATE_LOGIC: "CLIMATE",
  SITE_ANALYSIS: "SITE",
  MATERIAL_DETECTION: "MATERIALS",
});

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeModelSource(value) {
  const normalized = String(value || DEFAULT_MODEL_SOURCE)
    .trim()
    .toLowerCase();
  if (["base", "hybrid", "fine_tuned"].includes(normalized)) {
    return normalized;
  }
  return DEFAULT_MODEL_SOURCE;
}

function readEnv(env, key) {
  if (!key || !env) {
    return "";
  }
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function firstEnv(env, keys = []) {
  for (const key of keys) {
    const value = readEnv(env, key);
    if (value) {
      return { key, value };
    }
  }
  return { key: null, value: "" };
}

function inferProvider(model) {
  const lowered = String(model || "").toLowerCase();
  if (
    lowered.startsWith("ft:gpt-") ||
    lowered.startsWith("ft:o") ||
    lowered.startsWith("gpt-") ||
    lowered.startsWith("o1") ||
    lowered.startsWith("o3") ||
    lowered.startsWith("o4") ||
    lowered.startsWith("gpt-image-") ||
    lowered.startsWith("text-embedding-")
  ) {
    return "openai";
  }
  if (lowered.includes("claude")) {
    return "anthropic";
  }
  if (lowered.includes("flux") || lowered.includes("llama")) {
    return "together";
  }
  return "unknown";
}

export function normalizeArchitectureStepId(stepId) {
  const normalized = normalizeKey(stepId);
  return STEP_ALIASES[normalized] || normalized;
}

export function resolveArchitectureStepModel(
  stepId,
  { env = typeof process !== "undefined" ? process.env : {} } = {},
) {
  const normalizedStep = normalizeArchitectureStepId(stepId);
  const config = ARCHITECTURE_MODEL_STEP_CONFIG[normalizedStep];

  if (!config) {
    throw new Error(`Unknown architecture model step: ${stepId}`);
  }

  const modelSource = normalizeModelSource(
    readEnv(env, "MODEL_SOURCE") || readEnv(env, "ARCHIAI_MODEL_SOURCE"),
  );
  const fallbackPolicy =
    readEnv(env, "MODEL_FALLBACK_POLICY") ||
    readEnv(env, "ARCHIAI_MODEL_FALLBACK_POLICY") ||
    DEFAULT_FALLBACK_POLICY;
  const apiKeyEnv =
    readEnv(env, `${config.envPrefix}_API_KEY_ENV`) || "OPENAI_API_KEY";
  const temperature = readEnv(env, `${config.envPrefix}_TEMPERATURE`);
  const base = firstEnv(env, config.baseKeys);
  const fineTuned = firstEnv(env, config.fineTunedKeys);
  const baseModel = base.value || config.defaultBaseModel;

  if (modelSource === "fine_tuned" && !fineTuned.value) {
    throw new Error(
      `${config.envPrefix} fine-tuned model is required when MODEL_SOURCE=fine_tuned`,
    );
  }

  const shouldUseFineTuned =
    (modelSource === "hybrid" || modelSource === "fine_tuned") &&
    Boolean(fineTuned.value);
  const resolvedModel = shouldUseFineTuned ? fineTuned.value : baseModel;
  const selectionSource = shouldUseFineTuned ? "fine_tuned" : "base";
  const baseFallbackUsed =
    !base.value || (Boolean(base.key) && base.key !== config.baseKeys[0]);
  const fineTunedFallbackUsed =
    modelSource === "hybrid" && !fineTuned.value && selectionSource === "base";

  return {
    step: normalizedStep,
    stepId: normalizedStep,
    label: config.label,
    model: resolvedModel,
    provider: inferProvider(resolvedModel),
    selectionSource,
    modelSource,
    fallbackPolicy,
    baseModel,
    baseEnvKey: base.key,
    fineTunedModel: fineTuned.value || null,
    fineTunedEnvKey: fineTuned.key,
    fineTunedModelUsed: shouldUseFineTuned ? fineTuned.value : null,
    fineTunedCandidateKeys: config.fineTunedKeys,
    apiKeyEnv,
    selectedEnvKey: shouldUseFineTuned ? fineTuned.key : base.key,
    temperature: temperature || null,
    deterministicGeometry: config.deterministicGeometry === true,
    baseFallbackUsed,
    fineTunedFallbackUsed,
    fallbackUsed: baseFallbackUsed || fineTunedFallbackUsed,
  };
}

export function resolveArchitectureModelRegistry({
  env = typeof process !== "undefined" ? process.env : {},
  steps = Object.keys(ARCHITECTURE_MODEL_STEP_CONFIG),
} = {}) {
  return Object.fromEntries(
    steps.map((step) => {
      const resolved = resolveArchitectureStepModel(step, { env });
      return [resolved.step, resolved];
    }),
  );
}

export default {
  ARCHITECTURE_MODEL_STEP_CONFIG,
  normalizeArchitectureStepId,
  resolveArchitectureStepModel,
  resolveArchitectureModelRegistry,
};
