import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { getAdapterConfig } from "../../config/openSourceModels.js";
import { generateVisualization } from "../models/openSourceModelRouter.js";
import {
  analyzePortfolioReferences,
  generateStyleEmbedding,
} from "./portfolioEmbeddingService.js";
import { getLocationStyleRules } from "./locationStyleRules.js";

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function inferModernityLevel(styleIntent = "", locationRules = {}) {
  const value = String(styleIntent || "").toLowerCase();
  if (value.includes("traditional") || value.includes("heritage")) return 0.25;
  if (value.includes("contemporary")) return 0.72;
  if (value.includes("minimal") || value.includes("modern")) return 0.82;
  return clamp01(locationRules.modernity_level, 0.55);
}

function mergeKeywords(...lists) {
  return [
    ...new Set(
      lists
        .flat()
        .filter(Boolean)
        .map((entry) => String(entry).toLowerCase()),
    ),
  ];
}

function buildConditioningHooks({
  portfolioSummary,
  locationRules,
  controlImages = [],
}) {
  const styleConditioning = getAdapterConfig("styleConditioning");
  const visualization = getAdapterConfig("visualization");

  return {
    ip_adapter: {
      enabled: Boolean(
        styleConditioning?.id === "ip-adapter-hook" ||
        visualization?.id === "ip-adapter-hook",
      ),
      reference_count: portfolioSummary.reference_count,
      note: "Hook only. Attach an external IP-Adapter endpoint when ready.",
    },
    lora: {
      enabled:
        styleConditioning?.id === "portfolio-lora-pack" ||
        styleConditioning?.id === "regional-lora-pack",
      portfolio_pack_hint: portfolioSummary.dominant_styles[0] || null,
      region_pack_hint: locationRules.region,
      note: "LoRA packs are not loaded by default in this MVP.",
    },
    controlnet: {
      enabled: controlImages.length > 0,
      reference_count: controlImages.length,
      note: controlImages.length
        ? "Control images supplied and ready for future ControlNet routing."
        : "No control images supplied.",
    },
    visual_provider: {
      family: visualization?.type || "external",
      adapter: visualization?.id || "unknown",
    },
  };
}

function buildInfluenceWeights(
  portfolioReferences,
  locationRules,
  options = {},
) {
  const requestedPortfolioWeight = clamp01(
    options.portfolioWeight,
    portfolioReferences.length ? 0.55 : 0.25,
  );
  const requestedLocationWeight = clamp01(
    options.locationWeight,
    1 - requestedPortfolioWeight,
  );
  const total = requestedPortfolioWeight + requestedLocationWeight || 1;

  return {
    portfolio: Number((requestedPortfolioWeight / total).toFixed(2)),
    location: Number((requestedLocationWeight / total).toFixed(2)),
    location_region: locationRules.region,
  };
}

export function mergeStyleInfluences(...influences) {
  return influences.reduce((merged, influence) => {
    if (!influence || typeof influence !== "object") {
      return merged;
    }

    Object.entries(influence).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        merged[key] = [
          ...new Set([...(merged[key] || []), ...value.filter(Boolean)]),
        ];
        return;
      }

      if (value && typeof value === "object") {
        merged[key] = {
          ...(merged[key] || {}),
          ...value,
        };
        return;
      }

      if (value !== undefined && value !== null && value !== "") {
        merged[key] = value;
      }
    });

    return merged;
  }, {});
}

/**
 * Contract: buildStyleDNA()
 *
 * Produces a normalized Style DNA object that blends portfolio style, regional
 * priors, and prompt intent without depending on fine-tuning.
 */
export async function buildStyleDNA(request = {}, options = {}) {
  const enabled = isFeatureEnabled("useOpenSourceStyleEngine");
  const portfolioReferences = [
    ...(Array.isArray(request.portfolioReferences)
      ? request.portfolioReferences
      : []),
    ...(Array.isArray(request.portfolioImages) ? request.portfolioImages : []),
  ];
  const { summary: portfolioSummary, embedding: portfolioEmbedding } =
    await analyzePortfolioReferences(portfolioReferences, options);
  const locationRules = getLocationStyleRules(request.location || {});
  const influence = buildInfluenceWeights(
    portfolioReferences,
    locationRules,
    options,
  );
  const controlImages = Array.isArray(request.controlImages)
    ? request.controlImages
    : [];
  const promptInfluence = {
    style_intent: request.styleIntent || request.prompt || "",
    building_type: request.buildingType || request.building_type || null,
    technical_constraints: Array.isArray(request.technicalConstraints)
      ? request.technicalConstraints
      : [],
  };
  const mergedInfluence = mergeStyleInfluences(
    {
      region: locationRules.region,
      climate_zone: locationRules.climate_zone,
      local_materials: locationRules.local_materials,
      facade_language: locationRules.facade_language,
      roof_language: locationRules.roof_language,
      window_language: locationRules.window_language,
      massing_language: locationRules.massing_language,
      technical_constraints: locationRules.technical_constraints,
      precedent_keywords: locationRules.precedent_keywords,
    },
    {
      portfolio_influence: {
        reference_count: portfolioSummary.reference_count,
        dominant_tags: portfolioSummary.dominant_tags,
        dominant_materials: portfolioSummary.dominant_materials,
        dominant_styles: portfolioSummary.dominant_styles,
      },
    },
    promptInfluence,
  );

  const styleDNA = {
    schema_version: "style-dna-v1",
    region: mergedInfluence.region,
    climate_zone: mergedInfluence.climate_zone,
    local_materials: mergedInfluence.local_materials,
    facade_language: mergedInfluence.facade_language,
    roof_language: mergedInfluence.roof_language,
    window_language: mergedInfluence.window_language,
    massing_language: mergedInfluence.massing_language,
    portfolio_influence: {
      weight: influence.portfolio,
      reference_count: portfolioSummary.reference_count,
      dominant_tags: portfolioSummary.dominant_tags,
      dominant_materials: portfolioSummary.dominant_materials,
      embedding_adapter: portfolioEmbedding.adapterId,
    },
    location_influence: {
      weight: influence.location,
      precedent_keywords: locationRules.precedent_keywords,
      technical_constraints: locationRules.technical_constraints,
    },
    modernity_level: inferModernityLevel(
      request.styleIntent || request.prompt,
      locationRules,
    ),
    technical_constraints: mergedInfluence.technical_constraints,
    style_intent: mergedInfluence.style_intent,
    building_type: mergedInfluence.building_type,
    style_keywords: mergeKeywords(
      portfolioSummary.dominant_tags,
      portfolioSummary.dominant_materials,
      portfolioSummary.dominant_styles,
      locationRules.precedent_keywords,
    ),
    conditioning: buildConditioningHooks({
      portfolioSummary,
      locationRules,
      controlImages,
    }),
    prompt_bridge: [
      request.prompt || null,
      request.styleIntent || null,
      locationRules.facade_language,
      locationRules.roof_language,
      locationRules.window_language,
    ]
      .filter(Boolean)
      .join(", "),
    embeddings: {
      portfolio: {
        dimension: portfolioEmbedding.dimension,
        adapter: portfolioEmbedding.adapterId,
        vector: portfolioEmbedding.embedding,
      },
    },
    applied_rule_ids: [locationRules.rule_id].filter(Boolean),
    applied_rule_notes: locationRules.notes || [],
    status: enabled ? "ready" : "feature_disabled_local_fallback",
  };

  logger.debug("[Style] Built Style DNA", {
    region: styleDNA.region,
    portfolioWeight: styleDNA.portfolio_influence.weight,
    locationWeight: styleDNA.location_influence.weight,
  });

  return styleDNA;
}

/**
 * Helper for future visualization calls. This intentionally stays optional and
 * returns provider metadata when no external model is attached.
 */
export async function generateStyleVisualization(payload = {}, options = {}) {
  return generateVisualization(payload, options);
}

export default {
  analyzePortfolioReferences,
  buildStyleDNA,
  getLocationStyleRules,
  generateStyleEmbedding,
  generateStyleVisualization,
  mergeStyleInfluences,
};
