/**
 * Brownfield Land Register client
 *
 * Reads a single national pre-converted JSON fixture (national.json,
 * produced by `scripts/brownfield/convert-national.cjs` from the
 * Digital Land consolidated brownfield-land dataset) and returns sites
 * within a radius of a query lat/lng. The Digital Land feed already
 * carries WGS84 `POINT(lng lat)` geometry so no projection is needed
 * at runtime.
 *
 * Coverage: every English Local Authority that publishes a brownfield
 * register — ~35,000 sites across ~300 councils. Loaded once per
 * Vercel Function cold start (Fluid Compute warmth re-uses the cache).
 *
 * This is purposefully separate from `inspirePolygonsClient.js`:
 *   - INSPIRE polygons are *legal lot boundaries* — used for the auto-
 *     detected site polygon on the wizard map.
 *   - Brownfield sites are *development opportunities* with centre
 *     points + area in hectares — surfaced as map markers next to the
 *     legal boundary so the user can spot nearby development plots.
 */

import fs from "node:fs";
import path from "node:path";

const BROWNFIELD_DATA_DIR = path.resolve(
  process.cwd(),
  "api",
  "site",
  "_lib",
  "brownfieldData",
);

const NATIONAL_FIXTURE = "national.json";

const fixtureCache = new Map();

function loadFixture(filename) {
  const cached = fixtureCache.get(filename);
  if (cached) return cached;

  const fullPath = path.join(BROWNFIELD_DATA_DIR, filename);
  let raw;
  try {
    raw = fs.readFileSync(fullPath, "utf8");
  } catch {
    fixtureCache.set(filename, []);
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fixtureCache.set(filename, []);
    return [];
  }
  if (!Array.isArray(parsed)) {
    fixtureCache.set(filename, []);
    return [];
  }
  fixtureCache.set(filename, parsed);
  return parsed;
}

// Earth radius in metres for haversine (matches boundaryNormalize.js).
const EARTH_RADIUS_M = 6_371_008.8;

function haversineDistanceM(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLat = lat2 - lat1;
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Return brownfield sites within `radiusM` metres of the given point,
 * sorted by distance (nearest first). Limited to `limit` results.
 *
 * The query is a linear scan against the national fixture; with ~35k
 * sites that's cheap (single-digit milliseconds) and avoids needing a
 * spatial index on the data.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} [params.radiusM=2000]
 * @param {number} [params.limit=20]
 * @param {string|null} [params.postcode] — currently unused; reserved
 *   for future LA-scoped routing if the fixture ever splits per-region.
 */
export function findNearbyBrownfieldSites({
  lat,
  lng,
  radiusM = 2000,
  limit = 20,
  // eslint-disable-next-line no-unused-vars
  postcode = null,
} = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const sites = loadFixture(NATIONAL_FIXTURE);
  const point = { lat, lng };
  const matches = [];

  // Cheap pre-filter: skip sites whose lat/lng diff alone exceeds the
  // radius converted to degrees. ~111 km/degree of latitude, so the
  // bound is `radiusM / 111000` in latitude and slightly more for
  // longitude (we use the same bound — slightly conservative which is
  // fine, the haversine still applies).
  const latDeg = radiusM / 111000 + 0.001;
  for (const site of sites) {
    if (
      !Number.isFinite(Number(site?.lat)) ||
      !Number.isFinite(Number(site?.lng))
    ) {
      continue;
    }
    if (Math.abs(Number(site.lat) - lat) > latDeg) continue;
    if (Math.abs(Number(site.lng) - lng) > latDeg * 2) continue;
    const distance = haversineDistanceM(point, {
      lat: Number(site.lat),
      lng: Number(site.lng),
    });
    if (distance <= radiusM) {
      matches.push({ ...site, distanceM: Math.round(distance) });
    }
  }
  matches.sort((a, b) => a.distanceM - b.distanceM);
  return matches.slice(0, limit);
}

/**
 * Test-only: clear the in-memory fixture cache.
 */
export function __resetBrownfieldFixtureCacheForTests() {
  fixtureCache.clear();
}

export const __testing = Object.freeze({
  BROWNFIELD_DATA_DIR,
  NATIONAL_FIXTURE,
  haversineDistanceM,
  loadFixture,
});

export default findNearbyBrownfieldSites;
