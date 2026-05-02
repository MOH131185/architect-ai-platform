/**
 * Digital Land title-boundary API client
 *
 * HM Land Registry's INSPIRE Index Polygons are republished by Digital
 * Land (DLUHC, https://www.planning.data.gov.uk/) as the
 * `title-boundary` dataset, queryable per-point in real time:
 *
 *   GET https://www.planning.data.gov.uk/entity.geojson
 *       ?dataset=title-boundary
 *       &geometry_relation=intersects
 *       &geometry=POINT(<lng>+<lat>)
 *       &limit=5
 *
 * The response is a GeoJSON FeatureCollection of polygons whose
 * geometry intersects the query point. Each Feature carries a
 * `title-boundary` reference (HM Land Registry's INSPIRE ID) and an
 * entity ID that is stable across refreshes.
 *
 * This replaces the bundled `inspirePolygonsClient.js` fixture-based
 * approach. Advantages:
 *   - No GDAL or other local tooling required.
 *   - No bundled fixture (the title-boundary dataset is 800+ MB
 *     globally — bundling per-LA is impractical).
 *   - Always up-to-date — Digital Land refreshes daily.
 *   - Coverage is England + Wales (Scotland uses RoS, NI uses LPS;
 *     the proxy still gates by `isEnglandOrWales` postcode/lat-lng
 *     check before calling this client).
 *
 * Output shape: an array of Overpass-shaped `way` elements so the
 * existing `selectBestBoundaryCandidate` ranks them uniformly:
 *
 *   { id, type: "way", geometry: [{lat, lon}, …], tags: { titleReference, entity }, areaM2 }
 */

import { polygonAreaM2 } from "./boundaryNormalize.js";

const DIGITAL_LAND_API = "https://www.planning.data.gov.uk/entity.geojson";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;

/**
 * Fetch title-boundary polygons that contain or intersect the query
 * point. Returns an empty array on any failure (network, timeout,
 * malformed response) — the proxy treats that as "no match" and falls
 * through to OSM, preserving the existing safety chain.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {function} [params.fetchImpl]
 * @param {number} [params.timeoutMs]
 * @returns {Promise<Array>}
 */
export async function fetchTitleBoundariesNear({
  lat,
  lng,
  fetchImpl = typeof fetch === "function" ? fetch : null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") return [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const url = new URL(DIGITAL_LAND_API);
  url.searchParams.set("dataset", "title-boundary");
  url.searchParams.set("geometry_relation", "intersects");
  url.searchParams.set("geometry", `POINT(${lng} ${lat})`);
  url.searchParams.set("limit", String(MAX_RESULTS));

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort("title_boundary_timeout"), timeoutMs)
    : null;

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/geo+json" },
      signal: controller?.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    return [];
  }
  if (timer) clearTimeout(timer);

  if (!response.ok) return [];

  let json;
  try {
    json = await response.json();
  } catch {
    return [];
  }

  if (json?.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    return [];
  }

  const elements = [];
  for (const feature of json.features) {
    const polygons = extractPolygonRings(feature?.geometry);
    if (polygons.length === 0) continue;
    // Each ring is a separate `way` so the selector can rank them
    // independently — usually MultiPolygon outputs are alternative
    // representations of the same parcel and we want the smallest one
    // that still contains the point.
    for (const ring of polygons) {
      if (ring.length < 3) continue;
      elements.push({
        id: feature?.properties?.entity || null,
        type: "way",
        geometry: ring,
        tags: {
          titleReference: feature?.properties?.reference || null,
          entity: feature?.properties?.entity || null,
        },
        areaM2: polygonAreaM2(
          ring.map(({ lat: la, lon: ln }) => ({ lat: la, lng: ln })),
        ),
      });
    }
  }
  return elements;
}

/**
 * Walk the GeoJSON geometry tree and emit each linear ring (the outer
 * ring of each Polygon) as `[{lat, lon}, …]`. Inner rings (holes) are
 * intentionally ignored — the boundary proxy does not model holes and
 * downstream consumers (A1 site plan, Google Maps overlay) flatten to
 * the outer perimeter anyway.
 */
function extractPolygonRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    const outer = geometry.coordinates?.[0] || [];
    return [coordsToLatLon(outer)];
  }
  if (geometry.type === "MultiPolygon") {
    const rings = [];
    for (const polygon of geometry.coordinates || []) {
      const outer = polygon?.[0] || [];
      const ring = coordsToLatLon(outer);
      if (ring.length >= 3) rings.push(ring);
    }
    return rings;
  }
  return [];
}

function coordsToLatLon(coords) {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lon: lng };
    })
    .filter(Boolean);
}

export const __testing = Object.freeze({
  DIGITAL_LAND_API,
  extractPolygonRings,
  coordsToLatLon,
});

export default fetchTitleBoundariesNear;
