/**
 * Ordnance Survey MasterMap Building Heights provider (licensed).
 *
 * Uses the OS Features API ('os/maps/buildings' + 'Building Height Attribute'
 * dataset) when an OS_MASTERMAP_API_KEY is configured. Without a key the
 * provider returns an empty envelope with confidence: 0 and a clear
 * data_quality entry — mirrors the offline-safe pattern from T2.2.
 *
 * Plan §1.3 / §6.2. OS MasterMap is preferred over OSM Overpass when both
 * are available because the height attribute is authoritative; the aggregator
 * routes to OS first.
 */

import {
  emptyEnvelope,
  errorEnvelope,
  successEnvelope,
  getInjectedFetch,
  roundCoord,
} from "./providerInterface.js";

const SOURCE_ID = "os-mastermap-building-heights";
const LICENSE_NOTE =
  "Ordnance Survey MasterMap (licensed). Requires OS_MASTERMAP_API_KEY; covered by your OS Data Hub agreement.";
const BASE_URL = "https://api.os.uk/features/v1/wfs";

function buildBboxAround(lat, lon, radiusM = 60) {
  // Approximate bbox in WGS84 degrees. 1° lat ≈ 111,320 m. 1° lon at lat
  // varies; we use a uniform approximation since we only need a tight bbox.
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: roundCoord(lat - dLat, 6),
    minLon: roundCoord(lon - dLon, 6),
    maxLat: roundCoord(lat + dLat, 6),
    maxLon: roundCoord(lon + dLon, 6),
  };
}

function buildOSWfsUrl({ apiKey, lat, lon, radiusM, typeName }) {
  const bbox = buildBboxAround(lat, lon, radiusM);
  const params = new URLSearchParams({
    key: apiKey,
    service: "WFS",
    request: "GetFeature",
    version: "2.0.0",
    typeNames: typeName,
    outputFormat: "GEOJSON",
    srsName: "urn:ogc:def:crs:EPSG::4326",
    bbox: `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon},urn:ogc:def:crs:EPSG::4326`,
    count: "20",
  });
  return `${BASE_URL}?${params.toString()}`;
}

function getApiKey(envOverride) {
  if (typeof envOverride === "string" && envOverride) return envOverride;
  if (typeof process !== "undefined" && process.env?.OS_MASTERMAP_API_KEY) {
    return process.env.OS_MASTERMAP_API_KEY;
  }
  return null;
}

function normaliseFeature(feature) {
  const props = feature?.properties || {};
  const heightFields = [
    "RelHMax",
    "RelHMin",
    "RelH2",
    "AbsHMax",
    "AbsHMin",
    "Height",
    "BuildingHeight",
  ];
  let height = null;
  for (const field of heightFields) {
    const candidate = Number(props[field]);
    if (Number.isFinite(candidate) && candidate > 0 && height === null) {
      height = candidate;
    }
  }
  return {
    id: `os-${feature?.id || props.OBJECTID || ""}`,
    source: SOURCE_ID,
    height_m: height,
    use_class: props.OSLandUseTier1 || props.OSLandUseTierA || null,
    storey_count_estimated:
      typeof height === "number" ? Math.max(1, Math.round(height / 3)) : null,
    tags: props,
  };
}

export async function fetchBuildingHeights({
  lat,
  lon,
  radiusM = 60,
  apiKey,
  fetchImpl,
  typeName = "Topography_TopographicArea",
} = {}) {
  const f = getInjectedFetch(fetchImpl);
  const key = getApiKey(apiKey);
  if (!f || !key) {
    return emptyEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      reason: !key ? "no-os-mastermap-key" : "no-fetch-available",
    });
  }
  try {
    const response = await f(
      buildOSWfsUrl({ apiKey: key, lat, lon, radiusM, typeName }),
      { headers: { accept: "application/json" } },
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
    const buildings = features.map(normaliseFeature).filter((b) => b.height_m);
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
 * Convenience helper that summarises OS heights into a SiteContext shape.
 */
export async function fetchOsHeightContext({
  lat,
  lon,
  radiusM = 60,
  apiKey,
  fetchImpl,
} = {}) {
  const envelope = await fetchBuildingHeights({
    lat,
    lon,
    radiusM,
    apiKey,
    fetchImpl,
  });
  if (!Array.isArray(envelope.data) || envelope.data.length === 0) {
    return {
      neighbouring_buildings: [],
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
  return {
    neighbouring_buildings: envelope.data.slice(0, 10),
    context_height_stats: {
      min_m: heights[0],
      median_m: heights[Math.floor(heights.length / 2)],
      max_m: heights[heights.length - 1],
      sample_count: heights.length,
      source: envelope.source,
      license_note: envelope.license_note,
      confidence: envelope.confidence,
    },
    envelope,
  };
}

export default { fetchBuildingHeights, fetchOsHeightContext };
