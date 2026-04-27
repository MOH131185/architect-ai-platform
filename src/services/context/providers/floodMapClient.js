/**
 * Environment Agency flood-risk client.
 *
 * Uses the Real Time flood-monitoring + flood-risk endpoints from the EA
 * developer portal. For an early-stage AI architecture pipeline we only need
 * the tier (Zone 1 / 2 / 3) and source provenance. Full hydrology requires
 * a paid licence.
 *
 * When fetch is unavailable, returns an empty envelope so the slice can
 * proceed with data_quality: confidence 0 + an explicit "verify locally"
 * limitation.
 *
 * Plan §6.2 / §1.3.
 */

import {
  emptyEnvelope,
  errorEnvelope,
  successEnvelope,
  getInjectedFetch,
  roundCoord,
} from "./providerInterface.js";

const SOURCE_ID = "environment-agency-flood-monitoring";
const LICENSE_NOTE =
  "Environment Agency Open Government Licence (https://environment.data.gov.uk/flood-monitoring/doc/reference)";

// The EA hosts a "flood-areas" lookup keyed by lat/lon. The endpoint returns
// flood-area metadata for areas containing the point.
const BASE_URL =
  "https://environment.data.gov.uk/flood-monitoring/id/floodAreas";

function buildUrl({ lat, lon }) {
  const params = new URLSearchParams({
    lat: String(roundCoord(lat, 6)),
    long: String(roundCoord(lon, 6)),
    dist: "0.5", // km — tight bound around the point
  });
  return `${BASE_URL}?${params.toString()}`;
}

export async function fetchFloodAreas({ lat, lon, fetchImpl } = {}) {
  const f = getInjectedFetch(fetchImpl);
  if (!f) {
    return emptyEnvelope({
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      reason: "no-fetch-available",
    });
  }
  try {
    const response = await f(buildUrl({ lat, lon }), {
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
    const items = Array.isArray(json?.items) ? json.items : [];
    return successEnvelope({
      data: items,
      source: SOURCE_ID,
      license_note: LICENSE_NOTE,
      confidence: items.length > 0 ? 1 : 0.6,
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
 * Translate raw EA flood-areas into a SiteContext.flood_risk shape.
 */
export async function fetchFloodRisk({ lat, lon, fetchImpl } = {}) {
  const envelope = await fetchFloodAreas({ lat, lon, fetchImpl });
  if (!envelope.data || envelope.error) {
    return {
      flood_risk: {
        status: "unknown",
        source: envelope.source,
        license_note: envelope.license_note,
        confidence: envelope.confidence,
        error: envelope.error,
      },
      envelope,
    };
  }
  const items = envelope.data;
  const status = items.length === 0 ? "low" : "monitored";
  const named = items
    .map((item) => item?.label || item?.fwdCode || item?.notation)
    .filter(Boolean);
  return {
    flood_risk: {
      status,
      monitored_area_count: items.length,
      monitored_area_names: named.slice(0, 5),
      source: envelope.source,
      license_note: envelope.license_note,
      confidence: envelope.confidence,
      verify_locally:
        "EA flood-monitoring lookup is indicative; consult flood-map-for-planning before progressing.",
    },
    envelope,
  };
}

export default { fetchFloodAreas, fetchFloodRisk };
