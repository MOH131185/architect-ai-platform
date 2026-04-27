/**
 * Planning Data API client (planning.data.gov.uk).
 *
 * - Conservation areas (dataset=conservation-area)
 * - Listed buildings (dataset=listed-building)
 *
 * The Planning Data API is open; no key required. We query by point using the
 * geometry query parameter. When fetch is not configured (Node CLI, offline)
 * the provider degrades to an empty envelope with confidence: 0 and a clear
 * data_quality note.
 *
 * Plan §6.2 / §14.
 */

import {
  emptyEnvelope,
  successEnvelope,
  errorEnvelope,
  getInjectedFetch,
  roundCoord,
} from "./providerInterface.js";

const SOURCE_ID = "planning.data.gov.uk";
const LICENSE_NOTE =
  "Planning Data Open Government Licence v3.0 (https://www.planning.data.gov.uk/about)";
const BASE_URL = "https://www.planning.data.gov.uk/entity.json";

function buildEntityUrl({ dataset, lat, lon }) {
  const params = new URLSearchParams({
    dataset,
    "geometry-relation": "intersects",
    geometry: `POINT(${roundCoord(lon, 6)} ${roundCoord(lat, 6)})`,
    limit: "10",
  });
  return `${BASE_URL}?${params.toString()}`;
}

async function queryDataset({ dataset, lat, lon, fetchImpl }) {
  if (!fetchImpl) {
    return emptyEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      reason: "no-fetch-available",
    });
  }
  const url = buildEntityUrl({ dataset, lat, lon });
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return errorEnvelope({
        source: SOURCE_ID,
        license_note: LICENSE_NOTE,
        error: `HTTP ${response.status}`,
      });
    }
    const json = await response.json();
    const entities = Array.isArray(json?.entities) ? json.entities : [];
    return successEnvelope({
      data: entities,
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      confidence: entities.length > 0 ? 1 : 0.6,
    });
  } catch (error) {
    return errorEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      error,
    });
  }
}

export async function fetchConservationAreas({ lat, lon, fetchImpl } = {}) {
  return queryDataset({
    dataset: "conservation-area",
    lat,
    lon,
    fetchImpl: getInjectedFetch(fetchImpl),
  });
}

export async function fetchListedBuildings({ lat, lon, fetchImpl } = {}) {
  return queryDataset({
    dataset: "listed-building",
    lat,
    lon,
    fetchImpl: getInjectedFetch(fetchImpl),
  });
}

/**
 * Convenience helper that runs both queries in parallel and merges into a
 * heritage_flags array shaped for SiteContext.
 */
export async function fetchPlanningHeritageFlags({ lat, lon, fetchImpl } = {}) {
  const f = getInjectedFetch(fetchImpl);
  const [conservation, listed] = await Promise.all([
    fetchConservationAreas({ lat, lon, fetchImpl: f }),
    fetchListedBuildings({ lat, lon, fetchImpl: f }),
  ]);
  const flags = [];
  if (Array.isArray(conservation.data)) {
    for (const entity of conservation.data) {
      flags.push({
        type: "conservation_area",
        entity_id: entity.entity || entity.id || null,
        name: entity.name || entity.reference || "Unnamed conservation area",
        source: SOURCE_ID,
        license_note: LICENSE_NOTE,
        confidence: conservation.confidence,
      });
    }
  }
  if (Array.isArray(listed.data)) {
    for (const entity of listed.data) {
      flags.push({
        type: "listed_building",
        entity_id: entity.entity || entity.id || null,
        name: entity.name || entity.reference || "Listed building",
        grade: entity.grade || null,
        source: SOURCE_ID,
        license_note: LICENSE_NOTE,
        confidence: listed.confidence,
      });
    }
  }
  return {
    heritage_flags: flags,
    sources: [
      { dataset: "conservation-area", envelope: conservation },
      { dataset: "listed-building", envelope: listed },
    ],
  };
}

export default {
  fetchConservationAreas,
  fetchListedBuildings,
  fetchPlanningHeritageFlags,
};
