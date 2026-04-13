import fs from "fs/promises";
import path from "path";
import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { getAdapterConfig } from "../../config/openSourceModels.js";
import {
  invokeOpenSourceAdapter,
  registerOpenSourceAdapter,
} from "../models/openSourceModelRouter.js";
import {
  buildPrecedentEmbeddingText,
  cosineSimilarity,
  embedPrecedent,
} from "./precedentEmbeddingService.js";

function getIndexPath(options = {}) {
  const configuredPath =
    options.indexPath ||
    getAdapterConfig("precedentSearch")?.indexPath ||
    "data/cache/precedent-index.json";
  return path.resolve(process.cwd(), configuredPath);
}

async function ensureIndexFile(indexPath) {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(indexPath, "[]", "utf8");
  }
}

export async function loadPrecedentIndex(options = {}) {
  const indexPath = getIndexPath(options);
  await ensureIndexFile(indexPath);
  const raw = await fs.readFile(indexPath, "utf8");
  return JSON.parse(raw);
}

export async function savePrecedentIndex(records = [], options = {}) {
  const indexPath = getIndexPath(options);
  await ensureIndexFile(indexPath);
  await fs.writeFile(indexPath, JSON.stringify(records, null, 2), "utf8");
  return indexPath;
}

async function normalizeAndEmbedCorpus(corpus = [], options = {}) {
  const embedded = [];
  for (let index = 0; index < corpus.length; index += 1) {
    embedded.push(await embedPrecedent(corpus[index], options));
  }
  return embedded;
}

export async function indexPrecedent(item = {}, options = {}) {
  const result = await indexPrecedents([item], options);
  return {
    ...result,
    indexed_id: item.id || null,
  };
}

export async function indexPrecedents(corpus = [], options = {}) {
  const existing =
    options.append !== false ? await loadPrecedentIndex(options) : [];
  const embedded = await normalizeAndEmbedCorpus(corpus, options);
  const merged = [...existing];

  embedded.forEach((record) => {
    const existingIndex = merged.findIndex((entry) => entry.id === record.id);
    if (existingIndex >= 0) {
      merged[existingIndex] = record;
    } else {
      merged.push(record);
    }
  });

  const indexPath = await savePrecedentIndex(merged, options);
  return {
    count: embedded.length,
    total: merged.length,
    indexPath,
  };
}

function matchesScalarFilter(recordValue, filterValue) {
  if (!filterValue) return true;
  return String(recordValue || "")
    .toLowerCase()
    .includes(String(filterValue).toLowerCase());
}

function matchesRequiredClasses(record = {}, requiredClasses = []) {
  if (!requiredClasses.length) return true;
  const labelSet = new Set(
    [
      ...(Array.isArray(record.semantic_labels) ? record.semantic_labels : []),
      ...Object.keys(record.object_counts || {}),
    ].map((value) => String(value).toLowerCase()),
  );
  return requiredClasses.every((requiredClass) =>
    labelSet.has(String(requiredClass).toLowerCase()),
  );
}

function applyMetadataFilters(records = [], filters = {}) {
  const requiredClasses = Array.isArray(filters.required_classes)
    ? filters.required_classes
    : Array.isArray(filters.requiredClasses)
      ? filters.requiredClasses
      : [];

  return records.filter((record) => {
    if (
      !matchesScalarFilter(
        record.building_type,
        filters.building_type || filters.buildingType,
      )
    )
      return false;
    if (!matchesScalarFilter(record.style, filters.style)) return false;
    if (
      !matchesScalarFilter(
        record.climate,
        filters.climate || filters.climate_zone,
      )
    )
      return false;
    if (
      !matchesScalarFilter(
        record.facade_language,
        filters.facade_language || filters.facadeLanguage,
      )
    )
      return false;
    if (filters.semantic && !matchesRequiredClasses(record, [filters.semantic]))
      return false;
    if (
      filters.instance &&
      !String(record.description || "").includes(filters.instance)
    )
      return false;
    if (filters.min_object_count) {
      const totalObjects = Object.values(record.object_counts || {}).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      );
      if (totalObjects < Number(filters.min_object_count)) return false;
    }
    return matchesRequiredClasses(record, requiredClasses);
  });
}

function buildMatchExplanation(record = {}, filters = {}) {
  const reasons = [];
  if (record.style) {
    reasons.push(`style:${record.style}`);
  }
  if (record.building_type) {
    reasons.push(`building_type:${record.building_type}`);
  }
  if (filters.climate && record.climate) {
    reasons.push(`climate:${record.climate}`);
  }
  if (
    Array.isArray(filters.required_classes) &&
    filters.required_classes.length
  ) {
    reasons.push(
      `classes:${filters.required_classes
        .filter((requiredClass) =>
          Object.keys(record.object_counts || {}).includes(requiredClass),
        )
        .join(",")}`,
    );
  }
  return reasons.filter(Boolean).join(" | ") || "metadata-only match";
}

async function runLocalSemanticSearch(payload = {}) {
  const limit = Number(payload.limit || 10);
  const corpus = Array.isArray(payload.corpus)
    ? await normalizeAndEmbedCorpus(payload.corpus, payload)
    : await loadPrecedentIndex(payload);
  const filteredCorpus = applyMetadataFilters(corpus, payload.filters || {});

  const queryEmbedding = await embedPrecedent(
    {
      id: "query",
      title: payload.query || "precedent search",
      description: buildPrecedentEmbeddingText({
        description: payload.query,
        ...payload.filters,
      }),
      semantic_labels: Array.isArray(payload.filters?.required_classes)
        ? payload.filters.required_classes
        : payload.filters?.semantic
          ? [payload.filters.semantic]
          : [],
    },
    payload,
  );

  const results = filteredCorpus
    .map((record) => ({
      ...record,
      similarity: cosineSimilarity(queryEmbedding.embedding, record.embedding),
      match_explanation: buildMatchExplanation(record, payload.filters || {}),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);

  return {
    status: "ready",
    adapterId: "semantic-json-search",
    provider: "local",
    total_candidates: filteredCorpus.length,
    metadata: {
      query: payload.query || "",
      applied_filters: payload.filters || {},
      embedding_adapter: queryEmbedding.embedding_adapter,
    },
    results,
  };
}

registerOpenSourceAdapter(
  "precedentSearch",
  "semantic-json-search",
  async (payload) => runLocalSemanticSearch(payload),
);

/**
 * Contract: searchSimilarPrecedents()
 */
export async function searchSimilarPrecedents(
  payload = {},
  filters = {},
  options = {},
) {
  const normalizedPayload =
    typeof payload === "string"
      ? {
          query: payload,
          filters,
          ...options,
        }
      : payload;
  const enabled = isFeatureEnabled("usePrecedentRetrieval");
  if (!enabled) {
    logger.warn(
      "[Retrieval] Feature flag disabled, using local JSON search anyway",
    );
  }

  const routed = await invokeOpenSourceAdapter(
    "precedentSearch",
    normalizedPayload,
    typeof payload === "string" ? options : filters,
  );

  if (routed?.results) {
    return {
      success: true,
      ...routed,
    };
  }

  const fallback = await runLocalSemanticSearch(normalizedPayload);
  return {
    success: true,
    ...fallback,
    warnings: Array.isArray(routed?.notes) ? routed.notes : [],
  };
}

export async function searchBySemanticLabel(semantic, options = {}) {
  return searchSimilarPrecedents({
    query: semantic,
    filters: { semantic },
    ...options,
  });
}

export async function searchSamplesContainingClasses(
  requiredClasses = [],
  options = {},
) {
  return searchSimilarPrecedents({
    query: requiredClasses.join(" "),
    filters: { required_classes: requiredClasses },
    ...options,
  });
}

export default {
  loadPrecedentIndex,
  savePrecedentIndex,
  indexPrecedent,
  indexPrecedents,
  searchSimilarPrecedents,
  searchBySemanticLabel,
  searchSamplesContainingClasses,
};
