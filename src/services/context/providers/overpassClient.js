/**
 * OpenStreetMap Overpass client — neighbouring building footprints + heights.
 *
 * Free open-data fallback. The Overpass server is rate-limited; production
 * deployments should run their own mirror or cache responses. For our slice we
 * fetch buildings within a 60 m radius of the site lat/lon and surface them as
 * NeighbourBuilding[] for SiteContext.
 *
 * Plan §6.2 / §14 / §1.3.
 */

import {
  emptyEnvelope,
  errorEnvelope,
  successEnvelope,
  getInjectedFetch,
  roundCoord,
} from "./providerInterface.js";

const SOURCE_ID = "openstreetmap-overpass";
const LICENSE_NOTE =
  "OpenStreetMap data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)";
const BASE_URL = "https://overpass-api.de/api/interpreter";

function buildQuery({ lat, lon, radiusM = 60 }) {
  const lat6 = roundCoord(lat, 6);
  const lon6 = roundCoord(lon, 6);
  return `
[out:json][timeout:10];
(
  way(around:${radiusM},${lat6},${lon6})["building"];
);
out tags center;`.trim();
}

function estimateHeightFromTags(tags = {}) {
  if (tags.height) {
    const num = Number(String(tags.height).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(num) && num > 0) return num;
  }
  if (tags["building:levels"]) {
    const lvls = Number(tags["building:levels"]);
    if (Number.isFinite(lvls) && lvls > 0) return lvls * 3.0;
  }
  return null;
}

export async function fetchNearbyBuildings({
  lat,
  lon,
  radiusM = 60,
  fetchImpl,
} = {}) {
  const f = getInjectedFetch(fetchImpl);
  if (!f) {
    return emptyEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      reason: "no-fetch-available",
    });
  }
  const body = `data=${encodeURIComponent(buildQuery({ lat, lon, radiusM }))}`;
  try {
    const response = await f(BASE_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) {
      return errorEnvelope({
        source: SOURCE_ID,
        license_note: LICENSE_NOTE,
        error: `HTTP ${response.status}`,
      });
    }
    const json = await response.json();
    const elements = Array.isArray(json?.elements) ? json.elements : [];
    const buildings = elements.map((el) => {
      const tags = el.tags || {};
      const height = estimateHeightFromTags(tags);
      return {
        id: `osm-way-${el.id}`,
        source: SOURCE_ID,
        center: el.center || null,
        height_m: height,
        building_use: tags.building || "yes",
        levels:
          tags["building:levels"] !== undefined
            ? Number(tags["building:levels"])
            : null,
        tags,
      };
    });
    return successEnvelope({
      data: buildings,
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      confidence: buildings.length > 0 ? 0.85 : 0.4,
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
 * Summarise neighbour buildings for SiteContext: counts + height stats.
 */
export async function fetchNeighbouringContext({
  lat,
  lon,
  radiusM = 60,
  fetchImpl,
} = {}) {
  const envelope = await fetchNearbyBuildings({
    lat,
    lon,
    radiusM,
    fetchImpl,
  });
  if (!Array.isArray(envelope.data) || envelope.data.length === 0) {
    return {
      neighbouring_buildings: [],
      context_height_stats: {
        source: envelope.source,
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
    context_height_stats: stats,
    envelope,
  };
}

export default { fetchNearbyBuildings, fetchNeighbouringContext };
