/**
 * POST /api/models/search-precedents
 *
 * Request:
 * {
 *   "query": "contemporary brick courtyard house",
 *   "filters": {
 *     "climate": "marine-temperate",
 *     "building_type": "residential",
 *     "required_classes": ["wall", "door"]
 *   },
 *   "corpus": [{ "id": "precedent-1", "title": "..." }],
 *   "persist": false,
 *   "limit": 5
 * }
 */

import {
  buildSearchPrecedentsResponse,
  validateSearchPrecedentsRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import { getRecommendedModel } from "../../src/services/models/openSourceModelRouter.js";
import {
  indexPrecedents,
  searchSimilarPrecedents,
} from "../../src/services/retrieval/precedentSearchService.js";
import {
  config,
  ensureFeatureEnabled,
  handleOptions,
  rejectInvalidMethod,
  sendError,
  setCors,
} from "./_shared.js";

export { config };

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!setCors(req, res)) {
    return sendError(
      res,
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origin is not allowed for this endpoint.",
      null,
      { endpoint: "search-precedents" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(res, ["usePrecedentRetrieval"], "search-precedents")
  ) {
    return;
  }

  try {
    const validation = validateSearchPrecedentsRequest(req.body || {});
    if (!validation.ok) {
      return sendError(
        res,
        400,
        "INVALID_REQUEST",
        validation.errors.join(" "),
        {
          errors: validation.errors,
          warnings: validation.warnings,
        },
        {
          endpoint: "search-precedents",
          featureFlags: ["usePrecedentRetrieval"],
        },
      );
    }

    let indexResult = null;
    if (
      Array.isArray(validation.normalized.corpus) &&
      validation.normalized.corpus.length &&
      validation.normalized.persist
    ) {
      indexResult = await indexPrecedents(validation.normalized.corpus, {
        append: validation.normalized.append,
        indexPath: validation.normalized.indexPath,
      });
    }

    const result = await searchSimilarPrecedents({
      query: validation.normalized.query,
      filters: validation.normalized.filters,
      corpus: validation.normalized.persist
        ? null
        : validation.normalized.corpus,
      limit: validation.normalized.limit,
      indexPath: validation.normalized.indexPath,
    });

    return res.status(200).json(
      buildSearchPrecedentsResponse({
        result,
        index: indexResult,
        warnings: [...validation.warnings, ...(result.warnings || [])],
        selectedModelStrategy: getRecommendedModel("precedent_retrieval", {
          preferLocal: true,
          useCase: validation.normalized.query || "precedent retrieval",
        }),
        featureFlags: ["usePrecedentRetrieval"],
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "PRECEDENT_SEARCH_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "search-precedents",
        featureFlags: ["usePrecedentRetrieval"],
      },
    );
  }
}
