import logger from "../../utils/logger.js";
import { embedPrecedent as routePrecedentEmbedding } from "../models/openSourceModelRouter.js";

function normalizePrecedent(precedent = {}, index = 0) {
  return {
    id: precedent.id || `precedent-${index}`,
    title: precedent.title || precedent.name || `Precedent ${index + 1}`,
    description: precedent.description || "",
    building_type: precedent.building_type || precedent.buildingType || null,
    style: precedent.style || null,
    climate: precedent.climate || precedent.climate_zone || null,
    facade_language:
      precedent.facade_language || precedent.facadeLanguage || null,
    materials: Array.isArray(precedent.materials) ? precedent.materials : [],
    tags: Array.isArray(precedent.tags) ? precedent.tags : [],
    image_urls: Array.isArray(precedent.image_urls)
      ? precedent.image_urls
      : Array.isArray(precedent.imageUrls)
        ? precedent.imageUrls
        : [],
    semantic_labels: Array.isArray(precedent.semantic_labels)
      ? precedent.semantic_labels
      : Array.isArray(precedent.semanticLabels)
        ? precedent.semanticLabels
        : [],
    object_counts: precedent.object_counts || precedent.objectCounts || {},
    metadata: precedent.metadata || {},
  };
}

export function buildPrecedentEmbeddingText(precedent = {}) {
  const normalized = normalizePrecedent(precedent);
  return [
    normalized.title,
    normalized.description,
    normalized.building_type,
    normalized.style,
    normalized.climate,
    normalized.facade_language,
    normalized.materials.join(" "),
    normalized.tags.join(" "),
    normalized.semantic_labels.join(" "),
    Object.entries(normalized.object_counts)
      .map(([key, value]) => `${key}:${value}`)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Contract: embedPrecedent()
 */
export async function embedPrecedent(precedent = {}, options = {}) {
  const normalized = normalizePrecedent(precedent);
  const embeddingResult = await routePrecedentEmbedding(
    {
      references: [
        {
          url: normalized.image_urls[0] || null,
          description: buildPrecedentEmbeddingText(normalized),
          style: normalized.style,
          climate: normalized.climate,
          buildingType: normalized.building_type,
          tags: normalized.tags,
          materials: normalized.materials,
        },
      ],
    },
    options,
  );

  logger.debug("[Retrieval] Embedded precedent", {
    id: normalized.id,
    adapterId: embeddingResult.adapterId,
  });

  return {
    ...normalized,
    embedding: embeddingResult.embedding,
    embedding_dimension: embeddingResult.dimension,
    embedding_adapter: embeddingResult.adapterId,
  };
}

export function cosineSimilarity(vectorA = [], vectorB = []) {
  if (
    !Array.isArray(vectorA) ||
    !Array.isArray(vectorB) ||
    vectorA.length !== vectorB.length
  ) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < vectorA.length; index += 1) {
    dotProduct += vectorA[index] * vectorB[index];
    magnitudeA += vectorA[index] * vectorA[index];
    magnitudeB += vectorB[index] * vectorB[index];
  }

  if (!magnitudeA || !magnitudeB) {
    return 0;
  }

  return dotProduct / Math.sqrt(magnitudeA * magnitudeB);
}

export default {
  normalizePrecedent,
  buildPrecedentEmbeddingText,
  embedPrecedent,
  cosineSimilarity,
};
