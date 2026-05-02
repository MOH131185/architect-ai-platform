/**
 * `/api/site/brownfield-nearby` — supplementary brownfield development
 * sites overlay.
 *
 * Distinct from `/api/site/boundary` (legal-lot polygon) — this endpoint
 * returns POINT-shaped Brownfield Land Register sites near a query
 * lat/lng for the wizard map's "Nearby development sites" toggle. The
 * data is sourced from the council Brownfield Land Register CSV
 * (released under Open Government Licence v3.0) and pre-converted to
 * WGS84 in `api/site/_lib/brownfieldData/`.
 *
 * Request:
 *   GET  /api/site/brownfield-nearby?lat=53.59&lng=-0.65[&radiusM=2000&limit=20&postcode=DN15]
 *
 * Response (200):
 *   {
 *     schemaVersion: "brownfield-nearby-v1",
 *     count: number,
 *     sites: Array<{
 *       ref, name, lat, lng, hectares, planningStatus, ownership,
 *       planningUrl, lastUpdated, distanceM
 *     }>,
 *     attribution: "Contains public sector information licensed …"
 *   }
 *
 * Returns an empty `sites` array when no brownfield fixture covers the
 * requested area — the client should treat that as "feature unavailable"
 * rather than an error.
 */

import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { findNearbyBrownfieldSites } from "./_lib/brownfieldClient.js";

const SCHEMA_VERSION = "brownfield-nearby-v1";
const DEFAULT_RADIUS_M = 2000;
const MAX_RADIUS_M = 10000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function resolveBrownfieldRequest({
  lat,
  lng,
  radiusM = DEFAULT_RADIUS_M,
  limit = DEFAULT_LIMIT,
  postcode = null,
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

  const safeRadius = clampNumber(radiusM, DEFAULT_RADIUS_M, 100, MAX_RADIUS_M);
  const safeLimit = clampNumber(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);

  const sites = findNearbyBrownfieldSites({
    lat,
    lng,
    radiusM: safeRadius,
    limit: safeLimit,
    postcode,
  });

  return {
    status: 200,
    body: {
      schemaVersion: SCHEMA_VERSION,
      count: sites.length,
      radiusM: safeRadius,
      sites,
      attribution:
        "Contains public sector information licensed under the Open Government Licence v3.0 (council Brownfield Land Register).",
      timestamp: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, POST, OPTIONS" });
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const source = req.method === "GET" ? req.query || {} : req.body || {};
  const params = {
    lat: Number(source.lat),
    lng: Number(source.lng),
    radiusM: Number(source.radiusM) || DEFAULT_RADIUS_M,
    limit: Number(source.limit) || DEFAULT_LIMIT,
    postcode: typeof source.postcode === "string" ? source.postcode : null,
  };

  try {
    const { status, body } = await resolveBrownfieldRequest(params);
    res.status(status).json(body);
  } catch (err) {
    console.warn(
      "[/api/site/brownfield-nearby] handler error:",
      err?.message || err,
    );
    res.status(200).json({
      schemaVersion: SCHEMA_VERSION,
      count: 0,
      sites: [],
      error: err?.message || String(err),
    });
  }
}
