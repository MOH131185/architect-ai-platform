/**
 * Phase 5C — `/api/site/boundary` server proxy.
 *
 * Browser code cannot call Overpass directly because OSM does not send
 * CORS headers. This Vercel Function runs the same Overpass query
 * server-side, normalises the response, and returns a stable JSON
 * shape that `propertyBoundaryService.js` can consume from the browser.
 *
 * Request:
 *   GET  /api/site/boundary?lat=52.4&lng=-1.9
 *   POST /api/site/boundary  with JSON { lat, lng, buildingRadiusM?, parcelRadiusM? }
 *
 * Response (200 always when the request is well-formed):
 *   {
 *     schemaVersion: "site-boundary-proxy-v1",
 *     polygon: [{lat,lng}, …] | null,
 *     source:  "openstreetmap-overpass-building-contains-point" | … | null,
 *     confidence: 0.0–0.95,
 *     boundaryAuthoritative: bool,
 *     areaM2: integer,
 *     hash: hex string,
 *     cached: bool,
 *     timestamp: ISO,
 *     metadata: { osmId, buildingTag, … }
 *   }
 *
 * The endpoint NEVER returns the legacy "Intelligent Fallback" estimated
 * polygon. When Overpass returns nothing, the response carries
 * `polygon: null` and `boundaryAuthoritative: false`; the browser
 * client (`propertyBoundaryService.js`) is responsible for falling
 * through to the existing fallback chain. This keeps the proxy purely
 * about authoritative evidence.
 *
 * Caching: per-instance LRU keyed on `${lat},${lng}` rounded to 6 dp.
 * Hits are served without an Overpass call. We deliberately do NOT use
 * Vercel Runtime Cache (KV) in Phase 5C to keep the diff small and
 * avoid a marketplace dep; Lambda warmth on Vercel covers most cases
 * within the 10-minute idle window. A KV upgrade is a follow-up.
 */

import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import {
  fetchBuildingAndParcel,
  OverpassRateLimitError,
  OverpassTimeoutError,
} from "./_lib/overpassClient.js";
import {
  buildBoundaryResponse,
  buildEmptyResponse,
  selectBestOverpassWay,
} from "./_lib/boundaryNormalize.js";

const CACHE_MAX_ENTRIES = 256;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for found
const CACHE_NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1 hour for negatives

const cache = new Map();

function cacheKey({ lat, lng, buildingRadiusM, parcelRadiusM }) {
  return [
    Number(lat).toFixed(6),
    Number(lng).toFixed(6),
    Number(buildingRadiusM),
    Number(parcelRadiusM),
  ].join("|");
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU position
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  const ttl = value?.polygon ? CACHE_TTL_MS : CACHE_NEGATIVE_TTL_MS;
  cache.set(key, {
    expiresAt: Date.now() + ttl,
    value,
  });
}

function parseLatLng(req) {
  if (req.method === "GET") {
    const lat = Number(req.query?.lat);
    const lng = Number(req.query?.lng);
    return {
      lat,
      lng,
      buildingRadiusM: Number(req.query?.buildingRadiusM) || 30,
      parcelRadiusM: Number(req.query?.parcelRadiusM) || 50,
    };
  }
  const body = req.body || {};
  return {
    lat: Number(body.lat),
    lng: Number(body.lng),
    buildingRadiusM: Number(body.buildingRadiusM) || 30,
    parcelRadiusM: Number(body.parcelRadiusM) || 50,
  };
}

function isValidPoint(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Pure handler used by Jest. The default export wraps this with
 * Vercel-style req/res. Tests can call this directly with already-
 * parsed inputs and an injected `fetchImpl`.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} [params.buildingRadiusM]
 * @param {number} [params.parcelRadiusM]
 * @param {function} [params.fetchImpl]
 * @param {boolean} [params.useCache=true]
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function resolveBoundaryRequest({
  lat,
  lng,
  buildingRadiusM = 30,
  parcelRadiusM = 50,
  fetchImpl,
  useCache = true,
} = {}) {
  if (!isValidPoint(lat, lng)) {
    return {
      status: 400,
      body: {
        error: "invalid_lat_lng",
        message: "Both lat and lng must be finite numbers in valid ranges.",
      },
    };
  }

  const key = cacheKey({ lat, lng, buildingRadiusM, parcelRadiusM });
  if (useCache) {
    const cached = cacheGet(key);
    if (cached) {
      return {
        status: 200,
        body: { ...cached, cached: true },
      };
    }
  }

  let buildingElements;
  let parcelElements;
  let overpassError;
  try {
    const result = await fetchBuildingAndParcel({
      lat,
      lng,
      buildingRadiusM,
      parcelRadiusM,
      fetchImpl,
    });
    buildingElements = result.buildingElements;
    parcelElements = result.parcelElements;
  } catch (err) {
    overpassError = err;
    buildingElements = [];
    parcelElements = [];
  }

  let body;
  if (overpassError) {
    const reason = overpassError.rateLimited
      ? "overpass_rate_limited"
      : overpassError.timedOut
        ? "overpass_timeout"
        : "overpass_unavailable";
    body = buildEmptyResponse({
      reason,
      cached: false,
      queryRadiusM: buildingRadiusM,
    });
    body.metadata = {
      ...body.metadata,
      overpassError: overpassError?.message || String(overpassError),
    };
    if (useCache) cacheSet(key, body);
    return { status: 200, body };
  }

  const best = selectBestOverpassWay({
    buildingElements,
    parcelElements,
    point: { lat, lng },
  });

  if (!best) {
    body = buildEmptyResponse({
      reason: "no_polygon_found",
      cached: false,
      queryRadiusM: buildingRadiusM,
    });
  } else {
    body = buildBoundaryResponse({
      polygon: best.polygon,
      source: best.source,
      osmElement: best.element,
      queryRadiusM: buildingRadiusM,
      cached: false,
    });
  }
  if (useCache) cacheSet(key, body);
  return { status: 200, body };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, POST, OPTIONS" });
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const params = parseLatLng(req);
  try {
    const { status, body } = await resolveBoundaryRequest(params);
    res.status(status).json(body);
  } catch (err) {
    // Defensive: pure handler shouldn't throw on its own, but if a
    // surprise happens (e.g. fetch missing in runtime), degrade to
    // empty response so the browser falls through to fallback rather
    // than seeing a 500.
    console.warn("[/api/site/boundary] handler error:", err?.message || err);
    const body = buildEmptyResponse({
      reason: "proxy_handler_error",
      cached: false,
      queryRadiusM: params?.buildingRadiusM || 30,
    });
    body.metadata = {
      ...body.metadata,
      handlerError: err?.message || String(err),
    };
    res.status(200).json(body);
  }
}

export const __testing = Object.freeze({
  cache,
  cacheKey,
  cacheGet,
  cacheSet,
  parseLatLng,
  isValidPoint,
  OverpassRateLimitError,
  OverpassTimeoutError,
});
