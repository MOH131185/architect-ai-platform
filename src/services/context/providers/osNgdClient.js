/**
 * Ordnance Survey National Geographic Database (NGD) building footprints
 * provider. Uses the OS Features API NGD collections endpoint
 * (`/features/ngd/ofa/v1/collections/<collection>/items`) with the
 * `bld-fts-buildingpart-1` collection to retrieve full building polygons +
 * height attributes in GeoJSON form. Authoritative UK building geometry —
 * higher fidelity than OS MasterMap heights alone (which lack polygons) and
 * higher confidence than OSM Overpass.
 *
 * Phase 2a: additive only. Provides building_footprints + enriches
 * neighbouring_buildings without touching local_boundary_polygon. Mirrors the
 * offline-safe envelope pattern from osMastermapClient.js.
 *
 * Server-only: OS_NGD_API_KEY is read from process.env. Never via REACT_APP_*.
 */

import {
  emptyEnvelope,
  errorEnvelope,
  successEnvelope,
  getInjectedFetch,
  roundCoord,
} from "./providerInterface.js";

const SOURCE_ID = "os-ngd-buildings";
const LICENSE_NOTE =
  "Ordnance Survey National Geographic Database (OS NGD). Requires OS_NGD_API_KEY; covered by your OS Data Hub agreement.";
const BASE_URL =
  "https://api.os.uk/features/ngd/ofa/v1/collections/bld-fts-buildingpart-1/items";

function buildBboxAround(lat, lon, radiusM = 60) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: roundCoord(lat - dLat, 6),
    minLon: roundCoord(lon - dLon, 6),
    maxLat: roundCoord(lat + dLat, 6),
    maxLon: roundCoord(lon + dLon, 6),
  };
}

function buildOsNgdUrl({ apiKey, lat, lon, radiusM, limit = 25 }) {
  const bbox = buildBboxAround(lat, lon, radiusM);
  const params = new URLSearchParams({
    key: apiKey,
    // OS Features API NGD bbox order is minLon,minLat,maxLon,maxLat (CRS84).
    bbox: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
    "bbox-crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
    limit: String(limit),
  });
  return `${BASE_URL}?${params.toString()}`;
}

function getApiKey(envOverride) {
  if (typeof envOverride === "string" && envOverride) return envOverride;
  if (typeof process !== "undefined" && process.env?.OS_NGD_API_KEY) {
    return process.env.OS_NGD_API_KEY;
  }
  return null;
}

function readPolygonRing(geometry) {
  if (!geometry || typeof geometry !== "object") return [];
  const { type, coordinates } = geometry;
  if (type === "Polygon" && Array.isArray(coordinates) && coordinates.length) {
    return coordinates[0]
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map(([lon, lat]) => ({
        lat: roundCoord(Number(lat), 6),
        lon: roundCoord(Number(lon), 6),
      }));
  }
  if (
    type === "MultiPolygon" &&
    Array.isArray(coordinates) &&
    coordinates.length
  ) {
    const ring = coordinates[0]?.[0] || [];
    return ring
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map(([lon, lat]) => ({
        lat: roundCoord(Number(lat), 6),
        lon: roundCoord(Number(lon), 6),
      }));
  }
  return [];
}

function pickHeight(props) {
  const heightFields = [
    "absoluteheightmaximum",
    "absoluteheightminimum",
    "relativeheightmaximum",
    "relativeheightminimum",
    "Height",
    "BuildingHeight",
    "height",
  ];
  for (const field of heightFields) {
    const candidate = Number(props?.[field]);
    if (Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return null;
}

function normaliseFeature(feature) {
  const props = feature?.properties || {};
  const height = pickHeight(props);
  const outline = readPolygonRing(feature?.geometry);
  return {
    id: `os-ngd-${feature?.id || props.osid || props.OBJECTID || ""}`,
    source: SOURCE_ID,
    outline_polygon: outline,
    center: outline.length
      ? {
          lat: outline.reduce((sum, p) => sum + p.lat, 0) / outline.length,
          lon: outline.reduce((sum, p) => sum + p.lon, 0) / outline.length,
        }
      : null,
    height_m: height,
    storey_count_estimated:
      typeof height === "number" ? Math.max(1, Math.round(height / 3)) : null,
    use_class:
      props.description || props.oslandusetiera || props.oslandusetierb || null,
    tags: props,
  };
}

export async function fetchBuildingFootprints({
  lat,
  lon,
  radiusM = 60,
  apiKey,
  fetchImpl,
} = {}) {
  const f = getInjectedFetch(fetchImpl);
  const key = getApiKey(apiKey);
  if (!f || !key) {
    return emptyEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      reason: !key ? "no-os-ngd-key" : "no-fetch-available",
    });
  }
  try {
    const response = await f(
      buildOsNgdUrl({ apiKey: key, lat, lon, radiusM }),
      { headers: { accept: "application/geo+json,application/json" } },
    );
    if (!response.ok) {
      return errorEnvelope({
        source: SOURCE_ID,
        license_note: LICENSE_NOTE,
        error: `HTTP ${response.status}`,
      });
    }
    const json = await response.json();
    const features = Array.isArray(json?.features) ? json.features : [];
    const buildings = features
      .map(normaliseFeature)
      .filter((b) => b.outline_polygon.length >= 3);
    return successEnvelope({
      data: buildings,
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      confidence: buildings.length > 0 ? 0.95 : 0.3,
    });
  } catch (error) {
    return errorEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      error,
    });
  }
}

/**
 * SiteContext-shaped wrapper. Returns building_footprints (full polygon
 * outlines) and a neighbouring_buildings summary derived from the same
 * footprints. The aggregator decides whether to prefer this over OS MasterMap
 * heights or OSM Overpass.
 */
export async function fetchOsNgdContext({
  lat,
  lon,
  radiusM = 60,
  apiKey,
  fetchImpl,
} = {}) {
  const envelope = await fetchBuildingFootprints({
    lat,
    lon,
    radiusM,
    apiKey,
    fetchImpl,
  });
  if (!Array.isArray(envelope.data) || envelope.data.length === 0) {
    return {
      neighbouring_buildings: [],
      building_footprints: [],
      context_height_stats: {
        sample_count: 0,
        source: envelope.source,
        license_note: envelope.license_note,
        confidence: envelope.confidence,
      },
      envelope,
    };
  }
  const heights = envelope.data
    .map((b) => Number(b.height_m))
    .filter((h) => Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  const stats = heights.length
    ? {
        min_m: heights[0],
        median_m: heights[Math.floor(heights.length / 2)],
        max_m: heights[heights.length - 1],
        sample_count: heights.length,
        source: envelope.source,
        license_note: envelope.license_note,
        confidence: envelope.confidence,
      }
    : {
        sample_count: 0,
        source: envelope.source,
        license_note: envelope.license_note,
        confidence: envelope.confidence,
      };
  return {
    neighbouring_buildings: envelope.data.slice(0, 10),
    building_footprints: envelope.data,
    context_height_stats: stats,
    envelope,
  };
}

export default { fetchBuildingFootprints, fetchOsNgdContext };
