/**
 * INSPIRE Index Polygons client
 *
 * Reads pre-converted GeoJSON parcel fixtures from disk and returns
 * polygons that contain (or are near to) a query lat/lng. The fixtures
 * are produced offline by `scripts/inspire/download-and-convert.cjs`
 * from HM Land Registry's monthly INSPIRE bulk distribution; we never
 * fetch INSPIRE at request time because (a) HMLR distributes only as
 * bulk GML downloads, not as a real-time WFS, and (b) we want the proxy
 * to stay fast and air-gap-friendly.
 *
 * Coverage today: only the Local Authority files committed under
 * `inspireData/`. Anywhere outside those LAs returns an empty list and
 * the boundary proxy falls through to its OSM/Overpass chain.
 *
 * The runtime API does NOT need a projection library — the fixtures are
 * already in WGS84 (EPSG:4326) because the offline conversion runs
 * `ogr2ogr -t_srs EPSG:4326`. Removing the proj4 dependency keeps the
 * cold-start small.
 */

import fs from "node:fs";
import path from "node:path";
import { polygonContainsPoint, polygonAreaM2 } from "./boundaryNormalize.js";

// Resolve the fixture directory from the project root rather than
// `import.meta.url`. react-scripts/Jest uses a babel transform that
// rejects `import.meta` outside true ESM, and Vercel Functions run with
// `process.cwd()` set to the project root, so this works in both.
const INSPIRE_DATA_DIR = path.resolve(
  process.cwd(),
  "api",
  "site",
  "_lib",
  "inspireData",
);

// Module-scope cache of loaded fixtures. The Vercel Function instance
// reuses these across requests under Fluid Compute, so loading is a
// one-time cost per cold start.
const fixtureCache = new Map();

/**
 * Map a postcode area to the INSPIRE fixture file that covers it. Only
 * Local Authorities with a committed fixture are listed here; the rest
 * fall through to OSM. Extend this map as you add more `*.json` files
 * under `inspireData/`.
 *
 * Note: a postcode area can span multiple LAs (e.g. DN covers North
 * Lincolnshire, North East Lincolnshire, Doncaster, etc.). For now we
 * only have North Lincolnshire so any DN address tries that file; if
 * the address is outside North Lincs the polygon-contains-point check
 * returns false and the caller falls through to OSM. That is correct
 * behaviour and degrades gracefully.
 */
const POSTCODE_AREA_TO_FIXTURES = Object.freeze({
  // North Lincolnshire covers DN15-DN21 (Scunthorpe, Brigg, Barton-upon-
  // Humber). Other DN postcodes fall through.
  DN: ["north-lincolnshire.json"],
});

function loadFixture(filename) {
  const cached = fixtureCache.get(filename);
  if (cached) return cached;

  const fullPath = path.join(INSPIRE_DATA_DIR, filename);
  let raw;
  try {
    raw = fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    // Fixture not committed yet — log once at cold start, then cache the
    // empty value so we don't keep retrying file system access.
    fixtureCache.set(filename, []);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fixtureCache.set(filename, []);
    return [];
  }

  // Accept either an array of `{inspireId, polygon}` entries or a
  // GeoJSON FeatureCollection (the format ogr2ogr produces). The
  // FeatureCollection branch translates Feature.geometry.coordinates
  // (GeoJSON: [lng, lat]) into the canonical {lat, lng} polygon shape
  // the rest of the proxy expects.
  let entries = [];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (
    parsed?.type === "FeatureCollection" &&
    Array.isArray(parsed.features)
  ) {
    entries = parsed.features.map((feature) => {
      const inspireId =
        feature?.properties?.INSPIREID ||
        feature?.properties?.inspireId ||
        feature?.id ||
        null;
      const ring = feature?.geometry?.coordinates?.[0] || [];
      const polygon = ring.map(([lng, lat]) => ({
        lat: Number(lat),
        lng: Number(lng),
      }));
      return { inspireId, polygon };
    });
  }

  // Pre-compute bounding boxes once at load time so the request-time
  // filter is cheap.
  const indexed = entries
    .filter(
      (entry) => Array.isArray(entry?.polygon) && entry.polygon.length >= 3,
    )
    .map((entry) => {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const p of entry.polygon) {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      return {
        inspireId: entry.inspireId || null,
        polygon: entry.polygon,
        bbox: { minLat, maxLat, minLng, maxLng },
      };
    });

  fixtureCache.set(filename, indexed);
  return indexed;
}

function bboxContainsPoint(bbox, { lat, lng }, paddingDeg = 0) {
  if (!bbox) return false;
  return (
    lat >= bbox.minLat - paddingDeg &&
    lat <= bbox.maxLat + paddingDeg &&
    lng >= bbox.minLng - paddingDeg &&
    lng <= bbox.maxLng + paddingDeg
  );
}

/**
 * Returns the list of INSPIRE parcel polygons that contain (or are very
 * close to) the query point. The result is shaped like Overpass
 * `way` elements minus the OSM-specific bits, so
 * `selectBestBoundaryCandidate` can treat it uniformly:
 *
 *   { id: <inspireId>, type: "way", geometry: [{lat, lon}, …], tags: {} }
 *
 * Returns an empty array when:
 *   - inputs are missing/invalid,
 *   - no fixture covers the postcode area,
 *   - the fixture has no polygon containing the point.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {string|null} [params.postcode]
 */
export function fetchInspireParcelsNear({ lat, lng, postcode = null } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  // Resolve the candidate fixture set. When the postcode is missing we
  // try every committed fixture (slow but correct for small fixture
  // sets); when the postcode area is known we narrow to its LA list.
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
    const indexed = loadFixture(filename);
    for (const entry of indexed) {
      // Cheap bbox reject before the polygon ray cast.
      if (!bboxContainsPoint(entry.bbox, point, 0.0001)) continue;
      if (!polygonContainsPoint(entry.polygon, point)) continue;
      matches.push({
        id: entry.inspireId,
        type: "way",
        geometry: entry.polygon.map(({ lat: la, lng: ln }) => ({
          lat: la,
          lon: ln,
        })),
        tags: { inspireId: entry.inspireId },
        sourceFile: filename,
        areaM2: polygonAreaM2(entry.polygon),
      });
    }
  }
  return matches;
}

/**
 * Test-only: clear the in-memory fixture cache. Useful when a test
 * stubs `fs.readFileSync` and needs the next call to re-read the
 * fixture.
 */
export function __resetFixtureCacheForTests() {
  fixtureCache.clear();
}

export const __testing = Object.freeze({
  INSPIRE_DATA_DIR,
  POSTCODE_AREA_TO_FIXTURES,
  loadFixture,
});

export default fetchInspireParcelsNear;
