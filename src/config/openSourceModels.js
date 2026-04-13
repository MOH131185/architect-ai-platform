/**
 * Open-Source Model Registry and Adapter Catalog
 *
 * Phase 1 keeps this layer declarative and honest:
 * - no heavy model weights are downloaded
 * - no local inference is claimed unless a lightweight placeholder exists
 * - remote entries are opt-in hooks only until wired in Phase 2
 */

const env =
  typeof process !== "undefined" && process.env
    ? process.env
    : Object.create(null);

const DEFAULT_PRECEDENT_INDEX_PATH =
  env.OPEN_SOURCE_PRECEDENT_INDEX_PATH || "data/cache/precedent-index.json";

const REQUIRED_REGISTRY_FIELDS = [
  "id",
  "label",
  "category",
  "family",
  "integration_status",
  "local_or_remote",
  "input_types",
  "output_types",
  "strengths",
  "weaknesses",
  "recommended_use",
  "env_requirements",
  "adapter_key",
];

export const MODEL_CATEGORY_TO_FAMILY = {
  portfolio_style: ["styleEmbedding", "styleConditioning"],
  regional_style: ["styleConditioning"],
  floorplan_generation: ["floorplan"],
  technical_drawings: ["technicalDrawing"],
  visualization: ["visualization"],
  precedent_retrieval: ["precedentEmbedding", "precedentSearch"],
  cad_understanding: ["cadUnderstanding"],
};

export const OPEN_SOURCE_MODEL_REGISTRY = {
  portfolio_style: [
    {
      id: "portfolio-clip-heuristic",
      label: "Portfolio CLIP Heuristic Placeholder",
      category: "portfolio_style",
      family: "styleEmbedding",
      integration_status: "scaffolded_local_placeholder",
      local_or_remote: "local",
      input_types: ["image_references", "portfolio_metadata", "style_tags"],
      output_types: ["style_embedding", "portfolio_style_summary"],
      strengths: [
        "Deterministic and Windows-friendly",
        "Safe default for local development",
        "Supports stable tests without external inference",
      ],
      weaknesses: [
        "Not a real visual encoder",
        "Cannot capture nuanced composition semantics",
      ],
      recommended_use:
        "Phase 1 portfolio influence analysis and contract testing before real embedding services are wired.",
      env_requirements: [],
      adapter_key: "clip-local-heuristic",
    },
    {
      id: "portfolio-ip-adapter-hook",
      label: "Portfolio IP-Adapter Hook",
      category: "portfolio_style",
      family: "styleConditioning",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["image_references", "prompt_context", "control_images"],
      output_types: ["conditioning_payload", "adapter_routing"],
      strengths: [
        "Clean future path for portfolio-conditioned image synthesis",
        "Keeps API contract stable while integration is deferred",
      ],
      weaknesses: [
        "No endpoint attached by default",
        "Does not perform inference in Phase 1",
      ],
      recommended_use:
        "Future portfolio-conditioned visualization once an external IP-Adapter service exists.",
      env_requirements: ["OPEN_SOURCE_IP_ADAPTER_ENDPOINT"],
      adapter_key: "ip-adapter-hook",
    },
  ],

  regional_style: [
    {
      id: "regional-prompt-rules",
      label: "Regional Prompt Rules",
      category: "regional_style",
      family: "styleConditioning",
      integration_status: "ready_local_rules",
      local_or_remote: "local",
      input_types: ["location", "climate", "building_type"],
      output_types: ["regional_style_rules", "technical_constraints"],
      strengths: [
        "Deterministic and transparent",
        "Good fit for climate-aware scaffolding",
      ],
      weaknesses: [
        "Rule-based only",
        "Requires richer precedent data in later phases",
      ],
      recommended_use:
        "Primary Phase 1 regional style influence layer for contextual architecture prompts and constraints.",
      env_requirements: [],
      adapter_key: "prompt-only",
    },
    {
      id: "regional-lora-pack-hook",
      label: "Regional LoRA Pack Hook",
      category: "regional_style",
      family: "styleConditioning",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["location", "regional_style_code", "prompt_context"],
      output_types: ["conditioning_payload", "style_pack_selection"],
      strengths: [
        "Future path for vernacular style packs",
        "Can be introduced without changing API shape",
      ],
      weaknesses: [
        "No packs loaded by default",
        "Would need model storage and training workflow later",
      ],
      recommended_use:
        "Phase 2+ regional style conditioning when curated vernacular packs exist.",
      env_requirements: ["OPEN_SOURCE_REGION_LORA_DIR"],
      adapter_key: "regional-lora-pack",
    },
  ],

  floorplan_generation: [
    {
      id: "constraint-solver",
      label: "Structured Constraint Solver",
      category: "floorplan_generation",
      family: "floorplan",
      integration_status: "ready_local_placeholder",
      local_or_remote: "local",
      input_types: [
        "site_boundary",
        "building_type",
        "room_program",
        "target_area",
        "levels",
        "adjacency_preferences",
      ],
      output_types: ["layout_graph", "room_boxes", "zoning_summary"],
      strengths: [
        "Deterministic and testable",
        "Supports clean structured contracts",
        "No text-to-image dependency",
      ],
      weaknesses: [
        "Not an optimized architectural planner",
        "Uses simple allocation heuristics",
      ],
      recommended_use:
        "Primary Phase 1 fallback for backend floorplan contracts and structured geometry handoff.",
      env_requirements: [],
      adapter_key: "constraint-solver",
    },
    {
      id: "house-diffusion-hook",
      label: "House Diffusion Hook",
      category: "floorplan_generation",
      family: "floorplan",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: [
        "structured_program",
        "adjacency_graph",
        "site_constraints",
      ],
      output_types: ["layout_candidates", "room_geometry"],
      strengths: [
        "Natural future fit for learned structured layout generation",
        "Category contract already defined",
      ],
      weaknesses: [
        "No runtime endpoint configured",
        "No model downloaded in Phase 1",
      ],
      recommended_use:
        "Future structured generation backend once a remote service or lightweight deployment exists.",
      env_requirements: ["OPEN_SOURCE_FLOORPLAN_ENDPOINT"],
      adapter_key: "house-diffusion-hook",
    },
    {
      id: "graph2plan-hook",
      label: "Graph2Plan Hook",
      category: "floorplan_generation",
      family: "floorplan",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["adjacency_graph", "level_constraints", "room_program"],
      output_types: ["graph_conditioned_layout"],
      strengths: ["Good conceptual fit for adjacency-first layout generation"],
      weaknesses: [
        "No inference backend configured",
        "Requires a specialized service later",
      ],
      recommended_use:
        "Alternative Phase 2 route for graph-conditioned planning experiments.",
      env_requirements: ["OPEN_SOURCE_GRAPH_PLAN_ENDPOINT"],
      adapter_key: "graph2plan-hook",
    },
  ],

  technical_drawings: [
    {
      id: "svg-vector-engine",
      label: "SVG Vector Technical Drawing Engine",
      category: "technical_drawings",
      family: "technicalDrawing",
      integration_status: "ready_local_placeholder",
      local_or_remote: "local",
      input_types: ["project_geometry", "layout_graph", "drawing_types"],
      output_types: ["plan_svg", "elevation_svg", "section_svg"],
      strengths: [
        "Deterministic geometry-based output",
        "No diffusion dependency",
        "Easy to validate in tests",
      ],
      weaknesses: [
        "Graphic fidelity is intentionally minimal in Phase 1",
        "Annotation richness is limited",
      ],
      recommended_use:
        "Primary Phase 1 engine for technical drawing placeholders and geometry contracts.",
      env_requirements: [],
      adapter_key: "svg-vector-engine",
    },
    {
      id: "lineart-stylizer-hook",
      label: "Line Art Stylizer Hook",
      category: "technical_drawings",
      family: "technicalDrawing",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["svg_linework", "drawing_context"],
      output_types: ["stylized_linework"],
      strengths: ["Can layer on top of deterministic SVGs later"],
      weaknesses: ["No configured service in Phase 1"],
      recommended_use:
        "Optional future refinement pass after core geometry-based drawing generation is stable.",
      env_requirements: ["OPEN_SOURCE_LINEART_ENDPOINT"],
      adapter_key: "lineart-stylizer-hook",
    },
  ],

  visualization: [
    {
      id: "flux-hook",
      label: "FLUX Visualization Hook",
      category: "visualization",
      family: "visualization",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["prompt", "style_dna", "control_images"],
      output_types: ["render_job", "image_urls"],
      strengths: [
        "Clean provider routing contract",
        "Compatible with current future-facing visualization plans",
      ],
      weaknesses: ["No local weights or endpoint by default"],
      recommended_use:
        "Future image rendering once a remote visualization provider is attached.",
      env_requirements: ["OPEN_SOURCE_FLUX_ENDPOINT"],
      adapter_key: "flux-hook",
    },
    {
      id: "sdxl-hook",
      label: "SDXL Visualization Hook",
      category: "visualization",
      family: "visualization",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["prompt", "style_dna", "conditioning_payload"],
      output_types: ["render_job", "image_urls"],
      strengths: ["Alternative provider routing path"],
      weaknesses: ["No endpoint configured in Phase 1"],
      recommended_use:
        "Alternative future renderer when FLUX is not the preferred provider.",
      env_requirements: ["OPEN_SOURCE_SDXL_ENDPOINT"],
      adapter_key: "sdxl-hook",
    },
    {
      id: "controlnet-hook",
      label: "ControlNet Visualization Hook",
      category: "visualization",
      family: "visualization",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["prompt", "control_images", "project_geometry"],
      output_types: ["geometry_locked_render_job"],
      strengths: ["Future path for geometry-aware rendering"],
      weaknesses: ["Not attached in Phase 1"],
      recommended_use:
        "Phase 2+ geometry-locked visual synthesis once conditioning services are operational.",
      env_requirements: ["OPEN_SOURCE_CONTROLNET_ENDPOINT"],
      adapter_key: "controlnet-hook",
    },
  ],

  precedent_retrieval: [
    {
      id: "clip-precedent-heuristic",
      label: "Precedent Embedding Heuristic",
      category: "precedent_retrieval",
      family: "precedentEmbedding",
      integration_status: "scaffolded_local_placeholder",
      local_or_remote: "local",
      input_types: ["precedent_metadata", "image_reference", "semantic_labels"],
      output_types: ["precedent_embedding"],
      strengths: [
        "Deterministic local fallback",
        "Supports lightweight indexing immediately",
      ],
      weaknesses: ["Not a real multimodal embedding model"],
      recommended_use:
        "Phase 1 metadata-plus-heuristic embedding for precedent indexing and search contracts.",
      env_requirements: [],
      adapter_key: "clip-local-heuristic",
    },
    {
      id: "semantic-json-search",
      label: "Semantic JSON Search",
      category: "precedent_retrieval",
      family: "precedentSearch",
      integration_status: "ready_local_placeholder",
      local_or_remote: "local",
      input_types: ["query", "filters", "corpus", "metadata"],
      output_types: ["ranked_precedents", "match_scores", "match_explanations"],
      strengths: [
        "Works with file-backed JSON only",
        "Supports metadata filtering",
        "No vector database dependency",
      ],
      weaknesses: [
        "Scale is limited",
        "Search quality depends on heuristic embeddings",
      ],
      recommended_use:
        "Primary Phase 1 precedent retrieval backend until a vector database is added.",
      env_requirements: [],
      adapter_key: "semantic-json-search",
    },
    {
      id: "vector-db-hook",
      label: "Vector Database Hook",
      category: "precedent_retrieval",
      family: "precedentSearch",
      integration_status: "remote_hook_unwired",
      local_or_remote: "remote",
      input_types: ["query_embedding", "metadata_filters"],
      output_types: ["ranked_precedents"],
      strengths: ["Future path to scalable retrieval"],
      weaknesses: ["No vector database provisioned in Phase 1"],
      recommended_use:
        "Phase 2+ retrieval scaling once pgvector, Qdrant, Pinecone, or equivalent is introduced.",
      env_requirements: ["OPEN_SOURCE_VECTOR_DB_ENDPOINT"],
      adapter_key: "vector-db-hook",
    },
  ],

  cad_understanding: [
    {
      id: "arch-structured-normalizer",
      label: "Architectural Structured Normalizer",
      category: "cad_understanding",
      family: "cadUnderstanding",
      integration_status: "ready_local_placeholder",
      local_or_remote: "local",
      input_types: ["cad_json", "svg_geometry", "structured_layout"],
      output_types: ["normalized_architectural_geometry"],
      strengths: [
        "Simple JSON contract",
        "Good fit for DXF/SVG/JSON ingestion staging",
        "No heavy CAD model dependency",
      ],
      weaknesses: [
        "Rule-based normalization only",
        "No learned semantic understanding yet",
      ],
      recommended_use:
        "Primary Phase 1 normalization layer before richer CAD understanding is introduced.",
      env_requirements: [],
      adapter_key: "arch-structured-normalizer",
    },
    {
      id: "archcad-hook",
      label: "ArchCAD Dataset Hook",
      category: "cad_understanding",
      family: "cadUnderstanding",
      integration_status: "dataset_hook_only",
      local_or_remote: "local",
      input_types: ["archcad_like_structured_data"],
      output_types: ["normalized_architectural_geometry"],
      strengths: ["Reserves a clean slot for structured CAD datasets"],
      weaknesses: ["No active parsing backend attached"],
      recommended_use:
        "Future structured CAD ingestion once dataset-specific parsers are promoted into the runtime.",
      env_requirements: [],
      adapter_key: "archcad-hook",
    },
  ],
};

export const OPEN_SOURCE_MODEL_FAMILIES = {
  styleEmbedding: {
    defaultAdapter:
      env.OPEN_SOURCE_STYLE_EMBEDDING_ADAPTER || "clip-local-heuristic",
    fallbackAdapters: ["clip-local-heuristic", "siglip-local-heuristic"],
    adapters: {
      "clip-local-heuristic": {
        id: "clip-local-heuristic",
        family: "styleEmbedding",
        provider: "local",
        type: "heuristic-embedding",
        dimensions: 96,
        description:
          "Deterministic local embedding placeholder for portfolio/style references.",
      },
      "siglip-local-heuristic": {
        id: "siglip-local-heuristic",
        family: "styleEmbedding",
        provider: "local",
        type: "heuristic-embedding",
        dimensions: 96,
        description: "Alternative local heuristic embedding profile.",
      },
      "ip-adapter-hook": {
        id: "ip-adapter-hook",
        family: "styleEmbedding",
        provider: "external",
        type: "ip-adapter",
        endpoint: env.OPEN_SOURCE_IP_ADAPTER_ENDPOINT || null,
        description: "Hook for future IP-Adapter style conditioning endpoints.",
      },
    },
  },

  styleConditioning: {
    defaultAdapter: env.OPEN_SOURCE_STYLE_CONDITIONING_ADAPTER || "prompt-only",
    fallbackAdapters: ["prompt-only"],
    adapters: {
      "prompt-only": {
        id: "prompt-only",
        family: "styleConditioning",
        provider: "local",
        type: "text-conditioning",
        description: "Prompt-level style blending with no external weights.",
      },
      "portfolio-lora-pack": {
        id: "portfolio-lora-pack",
        family: "styleConditioning",
        provider: "external",
        type: "lora-pack",
        directory: env.OPEN_SOURCE_LORA_PACK_DIR || null,
        description: "Hook for future user-specific LoRA packs.",
      },
      "regional-lora-pack": {
        id: "regional-lora-pack",
        family: "styleConditioning",
        provider: "external",
        type: "lora-pack",
        directory: env.OPEN_SOURCE_REGION_LORA_DIR || null,
        description: "Hook for future region-specific LoRA packs.",
      },
      "controlnet-hook": {
        id: "controlnet-hook",
        family: "styleConditioning",
        provider: "external",
        type: "controlnet",
        endpoint: env.OPEN_SOURCE_CONTROLNET_ENDPOINT || null,
        description: "Hook for ControlNet line/depth conditioning.",
      },
      "ip-adapter-hook": {
        id: "ip-adapter-hook",
        family: "styleConditioning",
        provider: "external",
        type: "ip-adapter",
        endpoint: env.OPEN_SOURCE_IP_ADAPTER_ENDPOINT || null,
        description: "Hook for portfolio-conditioned style transfer.",
      },
    },
  },

  floorplan: {
    defaultAdapter: env.OPEN_SOURCE_FLOORPLAN_ADAPTER || "constraint-solver",
    fallbackAdapters: [
      "constraint-solver",
      "house-diffusion-hook",
      "graph2plan-hook",
    ],
    adapters: {
      "constraint-solver": {
        id: "constraint-solver",
        family: "floorplan",
        provider: "local",
        type: "structured-solver",
        description: "Deterministic adjacency/zoning solver fallback.",
      },
      "house-diffusion-hook": {
        id: "house-diffusion-hook",
        family: "floorplan",
        provider: "external",
        type: "floorplan-model",
        endpoint: env.OPEN_SOURCE_FLOORPLAN_ENDPOINT || null,
        description: "Hook for future HouseDiffusion-like plan generators.",
      },
      "graph2plan-hook": {
        id: "graph2plan-hook",
        family: "floorplan",
        provider: "external",
        type: "graph-plan-model",
        endpoint: env.OPEN_SOURCE_GRAPH_PLAN_ENDPOINT || null,
        description: "Hook for future graph-conditioned layout models.",
      },
    },
  },

  technicalDrawing: {
    defaultAdapter:
      env.OPEN_SOURCE_TECHNICAL_DRAWING_ADAPTER || "svg-vector-engine",
    fallbackAdapters: ["svg-vector-engine", "lineart-stylizer-hook"],
    adapters: {
      "svg-vector-engine": {
        id: "svg-vector-engine",
        family: "technicalDrawing",
        provider: "local",
        type: "deterministic-svg",
        description: "Native SVG linework renderer from structured geometry.",
      },
      "lineart-stylizer-hook": {
        id: "lineart-stylizer-hook",
        family: "technicalDrawing",
        provider: "external",
        type: "line-art",
        endpoint: env.OPEN_SOURCE_LINEART_ENDPOINT || null,
        description: "Future stylization pass for line-art refinement.",
      },
    },
  },

  visualization: {
    defaultAdapter: env.OPEN_SOURCE_VISUAL_PROVIDER || "flux-hook",
    fallbackAdapters: ["flux-hook", "sdxl-hook", "controlnet-hook"],
    adapters: {
      "flux-hook": {
        id: "flux-hook",
        family: "visualization",
        provider: "external",
        type: "flux",
        endpoint: env.OPEN_SOURCE_FLUX_ENDPOINT || null,
        description: "FLUX provider hook for visualization rendering.",
      },
      "sdxl-hook": {
        id: "sdxl-hook",
        family: "visualization",
        provider: "external",
        type: "sdxl",
        endpoint: env.OPEN_SOURCE_SDXL_ENDPOINT || null,
        description: "SDXL provider hook for visualization rendering.",
      },
      "controlnet-hook": {
        id: "controlnet-hook",
        family: "visualization",
        provider: "external",
        type: "controlnet",
        endpoint: env.OPEN_SOURCE_CONTROLNET_ENDPOINT || null,
        description:
          "ControlNet visualization hook for geometry-locked renders.",
      },
      "ip-adapter-hook": {
        id: "ip-adapter-hook",
        family: "visualization",
        provider: "external",
        type: "ip-adapter",
        endpoint: env.OPEN_SOURCE_IP_ADAPTER_ENDPOINT || null,
        description: "IP-Adapter hook for visual style transfer.",
      },
    },
  },

  precedentEmbedding: {
    defaultAdapter:
      env.OPEN_SOURCE_PRECEDENT_EMBEDDING_ADAPTER || "clip-local-heuristic",
    fallbackAdapters: ["clip-local-heuristic", "siglip-hook"],
    adapters: {
      "clip-local-heuristic": {
        id: "clip-local-heuristic",
        family: "precedentEmbedding",
        provider: "local",
        type: "heuristic-embedding",
        dimensions: 96,
        description: "Local deterministic precedent embedding placeholder.",
      },
      "siglip-hook": {
        id: "siglip-hook",
        family: "precedentEmbedding",
        provider: "external",
        type: "siglip",
        endpoint: env.OPEN_SOURCE_SIGLIP_ENDPOINT || null,
        description: "Hook for a future SigLIP embedding service.",
      },
    },
  },

  precedentSearch: {
    defaultAdapter:
      env.OPEN_SOURCE_PRECEDENT_SEARCH_ADAPTER || "semantic-json-search",
    fallbackAdapters: ["semantic-json-search"],
    adapters: {
      "semantic-json-search": {
        id: "semantic-json-search",
        family: "precedentSearch",
        provider: "local",
        type: "json-index",
        indexPath: DEFAULT_PRECEDENT_INDEX_PATH,
        description:
          "Local JSON index with cosine scoring and metadata filters.",
      },
      "vector-db-hook": {
        id: "vector-db-hook",
        family: "precedentSearch",
        provider: "external",
        type: "vector-db",
        endpoint: env.OPEN_SOURCE_VECTOR_DB_ENDPOINT || null,
        description: "Future Pinecone/pgvector/Qdrant adapter hook.",
      },
    },
  },

  cadUnderstanding: {
    defaultAdapter: env.OPEN_SOURCE_CAD_ADAPTER || "arch-structured-normalizer",
    fallbackAdapters: ["arch-structured-normalizer"],
    adapters: {
      "arch-structured-normalizer": {
        id: "arch-structured-normalizer",
        family: "cadUnderstanding",
        provider: "local",
        type: "schema-normalizer",
        description:
          "Structured normalization for CAD/plan elements before model usage.",
      },
      "archcad-hook": {
        id: "archcad-hook",
        family: "cadUnderstanding",
        provider: "local",
        type: "dataset-hook",
        description: "Hook for parsed ArchCAD-like structured datasets.",
      },
    },
  },
};

export function getArchitectureModelCategories() {
  return Object.keys(OPEN_SOURCE_MODEL_REGISTRY);
}

export function getModelsByCategory(category) {
  return [...(OPEN_SOURCE_MODEL_REGISTRY[category] || [])];
}

export function getModelRegistryEntry(category, modelId) {
  return (
    getModelsByCategory(category).find(
      (entry) => entry.id === modelId || entry.adapter_key === modelId,
    ) || null
  );
}

export function getModelCategoryFamilies(category) {
  const families = MODEL_CATEGORY_TO_FAMILY[category];
  if (Array.isArray(families) && families.length) {
    return [...families];
  }

  return [
    ...new Set(
      getModelsByCategory(category)
        .map((entry) => entry.family)
        .filter(Boolean),
    ),
  ];
}

export function validateOpenSourceModelRegistry() {
  const errors = [];
  const warnings = [];
  const categoryNames = getArchitectureModelCategories();

  categoryNames.forEach((category) => {
    const models = getModelsByCategory(category);
    if (!models.length) {
      errors.push(`Category "${category}" has no registered models.`);
      return;
    }

    models.forEach((entry) => {
      REQUIRED_REGISTRY_FIELDS.forEach((field) => {
        if (!(field in entry)) {
          errors.push(
            `Model "${entry.id}" in "${category}" is missing "${field}".`,
          );
        }
      });

      if (!getModelFamilyConfig(entry.family)) {
        errors.push(
          `Model "${entry.id}" references unknown family "${entry.family}".`,
        );
      }

      if (!Array.isArray(entry.env_requirements)) {
        errors.push(
          `Model "${entry.id}" must define env_requirements as an array.`,
        );
      }

      if (
        !Array.isArray(entry.input_types) ||
        !Array.isArray(entry.output_types)
      ) {
        errors.push(
          `Model "${entry.id}" must define input_types/output_types arrays.`,
        );
      }

      if (
        Array.isArray(entry.env_requirements) &&
        entry.local_or_remote === "remote" &&
        entry.env_requirements.length === 0
      ) {
        warnings.push(
          `Remote model "${entry.id}" has no env requirements declared.`,
        );
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    category_count: categoryNames.length,
    model_count: categoryNames.reduce(
      (count, category) => count + getModelsByCategory(category).length,
      0,
    ),
  };
}

export function getModelFamilyConfig(family) {
  return OPEN_SOURCE_MODEL_FAMILIES[family] || null;
}

export function getPreferredAdapterId(family, requestedAdapterId = null) {
  const familyConfig = getModelFamilyConfig(family);
  if (!familyConfig) {
    return null;
  }

  if (requestedAdapterId) {
    return requestedAdapterId;
  }

  return familyConfig.defaultAdapter;
}

export function getAdapterConfig(family, adapterId = null) {
  const familyConfig = getModelFamilyConfig(family);
  if (!familyConfig) {
    return null;
  }

  const resolvedAdapterId = getPreferredAdapterId(family, adapterId);
  return familyConfig.adapters[resolvedAdapterId] || null;
}

export function getOpenSourceModelSummary() {
  return {
    categories: Object.fromEntries(
      getArchitectureModelCategories().map((category) => [
        category,
        {
          families: getModelCategoryFamilies(category),
          modelIds: getModelsByCategory(category).map((entry) => entry.id),
        },
      ]),
    ),
    families: Object.fromEntries(
      Object.entries(OPEN_SOURCE_MODEL_FAMILIES).map(([family, config]) => [
        family,
        {
          defaultAdapter: config.defaultAdapter,
          fallbackAdapters: [...config.fallbackAdapters],
          adapters: Object.keys(config.adapters),
        },
      ]),
    ),
    validation: validateOpenSourceModelRegistry(),
  };
}

export default OPEN_SOURCE_MODEL_FAMILIES;
