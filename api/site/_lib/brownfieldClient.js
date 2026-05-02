/**
 * Brownfield Land Register client
 *
 * Reads pre-converted slim JSON fixtures from disk and returns sites
 * within a radius of a query lat/lng. The fixtures are produced offline
 * by `scripts/brownfield/convert-csv.cjs` from the official council
 * Brownfield Land Register CSVs (released under Open Government Licence
 * v3.0).
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

const fixtureCache = new Map();

/**
 * Map a UK postcode area (the leading 1–2 letters) to the brownfield
 * fixture file(s) that cover it. Postcode areas span multiple Local
 * Authorities; the runtime filter still applies a radius check so a
 * DN postcode address outside North Lincs simply gets an empty list.
 */
const POSTCODE_AREA_TO_FIXTURES = Object.freeze({
  DN: ["north-lincolnshire.json"],
});

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
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} [params.radiusM=2000]
 * @param {number} [params.limit=20]
 * @param {string|null} [params.postcode]
 */
export function findNearbyBrownfieldSites({
  lat,
  lng,
  radiusM = 2000,
  limit = 20,
  postcode = null,
} = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  let candidateFiles = [];
  if (typeof postcode === "string" && postcode.trim()) {
    const area = postcode
      .trim()
      .toUpperCase()
      .match(/^([A-Z]{1,2})/)?.[1];
    if (area && POSTCODE_AREA_TO_FIXTURES[area]) {
      candidateFiles = POSTCODE_AREA_TO_FIXTURES[area];
    }
  }
  if (candidateFiles.length === 0) {
    candidateFiles = Object.values(POSTCODE_AREA_TO_FIXTURES).flat();
  }

  const point = { lat, lng };
  const matches = [];
  for (const filename of candidateFiles) {
    const sites = loadFixture(filename);
    for (const site of sites) {
      if (
        !Number.isFinite(Number(site?.lat)) ||
        !Number.isFinite(Number(site?.lng))
      ) {
        continue;
      }
      const distance = haversineDistanceM(point, {
        lat: Number(site.lat),
        lng: Number(site.lng),
      });
      if (distance <= radiusM) {
        matches.push({
          ...site,
          distanceM: Math.round(distance),
          sourceFile: filename,
        });
      }
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
  POSTCODE_AREA_TO_FIXTURES,
  haversineDistanceM,
  loadFixture,
});

export default findNearbyBrownfieldSites;
