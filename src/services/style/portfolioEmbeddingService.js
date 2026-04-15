import logger from "../../utils/logger.js";
import { generateStyleEmbedding as routeStyleEmbedding } from "../models/openSourceModelRouter.js";

function normalizeReference(reference, index) {
  if (typeof reference === "string") {
    return {
      id: `portfolio-${index}`,
      url: reference,
      description: "",
      tags: [],
      materials: [],
      buildingType: null,
      style: null,
    };
  }

  return {
    id: reference.id || `portfolio-${index}`,
    url: reference.url || null,
    description: reference.description || reference.caption || "",
    tags: Array.isArray(reference.tags) ? reference.tags : [],
    materials: Array.isArray(reference.materials) ? reference.materials : [],
    buildingType: reference.buildingType || reference.program || null,
    style: reference.style || null,
  };
}

function countValues(values = []) {
  return values.reduce((accumulator, value) => {
    const key = String(value).toLowerCase();
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function takeTopKeys(counter = {}, limit = 5) {
  return Object.entries(counter)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export function summarizePortfolioReferences(references = []) {
  const normalized = references.map(normalizeReference);
  const tags = normalized.flatMap((reference) => reference.tags);
  const materials = normalized.flatMap((reference) => reference.materials);
  const styles = normalized.map((reference) => reference.style).filter(Boolean);
  const buildingTypes = normalized
    .map((reference) => reference.buildingType)
    .filter(Boolean);

  return {
    references: normalized,
    reference_count: normalized.length,
    dominant_tags: takeTopKeys(countValues(tags)),
    dominant_materials: takeTopKeys(countValues(materials)),
    dominant_styles: takeTopKeys(countValues(styles)),
    dominant_building_types: takeTopKeys(countValues(buildingTypes)),
  };
}

export async function analyzePortfolioReferences(
  portfolioReferences = [],
  options = {},
) {
  const summary = summarizePortfolioReferences(portfolioReferences);
  const embedding = await routeStyleEmbedding(
    {
      references: summary.references,
      promptContext: [
        summary.dominant_tags.join(" "),
        summary.dominant_materials.join(" "),
        summary.dominant_styles.join(" "),
      ],
    },
    options,
  );

  logger.debug("[Style] Portfolio references analyzed", {
    referenceCount: summary.reference_count,
    adapterId: embedding.adapterId,
  });

  return {
    summary,
    embedding,
  };
}

/**
 * Contract: generateStyleEmbedding()
 *
 * Converts a portfolio image/reference set into a deterministic embedding plus
 * extracted style signals. The adapter behind this can later be swapped to
 * CLIP/SigLIP/IP-Adapter-aware inference without touching the callers.
 */
export async function generateStyleEmbedding(
  portfolioReferences = [],
  options = {},
) {
  const { summary, embedding: routed } = await analyzePortfolioReferences(
    portfolioReferences,
    options,
  );

  return {
    ...routed,
    summary,
  };
}

export default {
  analyzePortfolioReferences,
  generateStyleEmbedding,
  summarizePortfolioReferences,
};
