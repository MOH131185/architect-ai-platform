/* global globalThis */
/**
 * Context aggregator — runs all UK provider clients in parallel and merges the
 * results onto an existing SiteContext object. Plan §6.2.
 *
 * Opt-in: only runs when the caller passes a fetchImpl (or `useDefaultFetch`)
 * because the slice is otherwise deterministic and offline-safe.
 */

import { fetchPlanningHeritageFlags } from "./providers/planningDataClient.js";
import { fetchFloodRisk } from "./providers/floodMapClient.js";
import { fetchNeighbouringContext } from "./providers/overpassClient.js";
import { fetchOsHeightContext } from "./providers/osMastermapClient.js";

function defaultFetch() {
  return typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : null;
}

/**
 * Enrich a SiteContext with heritage flags, flood risk, and neighbour buildings
 * pulled from open UK data sources. Mutation-free — returns a new site object.
 *
 * @param {object} site - The deterministic SiteContext from buildSiteContext.
 * @param {object} options
 * @param {Function} [options.fetchImpl] - Custom fetch (test stub or polyfill).
 * @param {boolean} [options.useDefaultFetch] - If true, use globalThis.fetch.
 * @returns {Promise<object>} Enriched site context.
 */
export async function enrichSiteContext(site, options = {}) {
  const fetchImpl =
    options.fetchImpl ||
    (options.useDefaultFetch === true ? defaultFetch() : null);
  if (!fetchImpl) {
    return {
      ...site,
      data_quality: [
        ...(site.data_quality || []),
        {
          code: "CONTEXT_PROVIDERS_OFFLINE",
          severity: "info",
          message:
            "UK context providers (Planning Data, EA flood, OSM Overpass) were not invoked; deterministic-only site pack used.",
        },
      ],
    };
  }
  const lat = Number(site?.lat);
  const lon = Number(site?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      ...site,
      data_quality: [
        ...(site.data_quality || []),
        {
          code: "CONTEXT_PROVIDERS_NO_COORDS",
          severity: "warning",
          message:
            "Site lat/lon missing or invalid; UK context providers were not invoked.",
        },
      ],
    };
  }

  const [planning, flood, osHeights, neighbours] = await Promise.all([
    fetchPlanningHeritageFlags({ lat, lon, fetchImpl }),
    fetchFloodRisk({ lat, lon, fetchImpl }),
    fetchOsHeightContext({
      lat,
      lon,
      apiKey: options.osMastermapApiKey,
      fetchImpl,
    }),
    fetchNeighbouringContext({ lat, lon, fetchImpl }),
  ]);
  // OS MasterMap is preferred over OSM Overpass when an authoritative
  // result was returned (confidence ≥ 0.9). OSM stays as fallback.
  const useOsHeights =
    osHeights?.envelope?.confidence >= 0.9 &&
    osHeights.neighbouring_buildings.length > 0;
  const heightContext = useOsHeights ? osHeights : neighbours;

  const dataQuality = [...(site.data_quality || [])];
  for (const sourceEnvelope of planning.sources) {
    if (sourceEnvelope.envelope.error) {
      dataQuality.push({
        code: `PLANNING_DATA_${sourceEnvelope.dataset.replace(/[^A-Z]+/gi, "_").toUpperCase()}_ERROR`,
        severity: "warning",
        message: `Planning Data lookup for ${sourceEnvelope.dataset} failed: ${sourceEnvelope.envelope.error}`,
        source: sourceEnvelope.envelope.source,
      });
    } else {
      dataQuality.push({
        code: `PLANNING_DATA_${sourceEnvelope.dataset.replace(/[^A-Z]+/gi, "_").toUpperCase()}_OK`,
        severity: "info",
        message: `Planning Data lookup for ${sourceEnvelope.dataset} succeeded with confidence ${sourceEnvelope.envelope.confidence}.`,
        source: sourceEnvelope.envelope.source,
      });
    }
  }
  if (flood.envelope.error) {
    dataQuality.push({
      code: "EA_FLOOD_LOOKUP_ERROR",
      severity: "warning",
      message: `EA flood lookup failed: ${flood.envelope.error}`,
      source: flood.envelope.source,
    });
  } else {
    dataQuality.push({
      code: "EA_FLOOD_LOOKUP_OK",
      severity: "info",
      message: `EA flood lookup succeeded with confidence ${flood.envelope.confidence}.`,
      source: flood.envelope.source,
    });
  }
  if (neighbours.envelope.error) {
    dataQuality.push({
      code: "OSM_OVERPASS_ERROR",
      severity: "warning",
      message: `OSM Overpass lookup failed: ${neighbours.envelope.error}`,
      source: neighbours.envelope.source,
    });
  } else {
    dataQuality.push({
      code: "OSM_OVERPASS_OK",
      severity: "info",
      message: `OSM Overpass lookup succeeded; ${neighbours.neighbouring_buildings.length} neighbour(s) within radius.`,
      source: neighbours.envelope.source,
    });
  }
  if (osHeights?.envelope?.error) {
    dataQuality.push({
      code: "OS_MASTERMAP_ERROR",
      severity: "warning",
      message: `OS MasterMap height lookup failed: ${osHeights.envelope.error}`,
      source: osHeights.envelope.source,
    });
  } else if (useOsHeights) {
    dataQuality.push({
      code: "OS_MASTERMAP_OK",
      severity: "info",
      message: `OS MasterMap (licensed) returned ${osHeights.neighbouring_buildings.length} authoritative building height(s); preferring over OSM Overpass.`,
      source: osHeights.envelope.source,
    });
  } else {
    dataQuality.push({
      code: "OS_MASTERMAP_NOT_USED",
      severity: "info",
      message:
        osHeights?.envelope?.error === "no-os-mastermap-key"
          ? "OS MasterMap key not configured; falling back to OSM Overpass."
          : "OS MasterMap returned no authoritative heights; falling back to OSM Overpass.",
      source: osHeights?.envelope?.source || "os-mastermap-building-heights",
    });
  }

  return {
    ...site,
    heritage_flags: [
      ...(site.heritage_flags || []),
      ...planning.heritage_flags,
    ],
    flood_risk: flood.flood_risk || site.flood_risk,
    neighbouring_buildings:
      heightContext.neighbouring_buildings.length > 0
        ? heightContext.neighbouring_buildings
        : site.neighbouring_buildings,
    context_height_stats:
      heightContext.context_height_stats?.sample_count > 0
        ? heightContext.context_height_stats
        : site.context_height_stats,
    data_quality: dataQuality,
  };
}

export default { enrichSiteContext };
