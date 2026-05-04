/* global globalThis */
/**
 * Context aggregator — runs all UK provider clients in parallel and merges the
 * results onto an existing SiteContext object. Plan §6.2.
 *
 * Opt-in: only runs when the caller passes a fetchImpl (or `useDefaultFetch`)
 * because the slice is otherwise deterministic and offline-safe.
 *
 * Phase 1 amendments (2026-05-03):
 *   #4 Server-only guard: refuse to run in real browser runtimes (jsdom in
 *      tests is allowed because process.versions.node is present).
 *   #5 Per-provider timeouts: every outbound call is bounded; a timeout
 *      becomes a *_TIMEOUT data_quality warning, not a failed slice.
 *   #2 Provenance: site.providers[] manifest carries
 *      { name, authority, fetched_at, status, fields_supplied } for every
 *      provider invocation.
 *
 * Phase 2a (2026-05-03):
 *   Adds OS NGD building footprints. Additive only — the user-drawn boundary
 *   (site.local_boundary_polygon) is never replaced. OS NGD is preferred for
 *   neighbouring_buildings when available (richest source: full polygons +
 *   heights) and supplies a new site.building_footprints field.
 */

import { fetchPlanningHeritageFlags } from "./providers/planningDataClient.js";
import { fetchFloodRisk } from "./providers/floodMapClient.js";
import { fetchNeighbouringContext } from "./providers/overpassClient.js";
import { fetchOsHeightContext } from "./providers/osMastermapClient.js";
import { fetchOsNgdContext } from "./providers/osNgdClient.js";
import { errorEnvelope } from "./providers/providerInterface.js";

const PLANNING_SOURCE = "planning.data.gov.uk";
const FLOOD_SOURCE = "environment-agency-flood-monitoring";
const OS_SOURCE = "os-mastermap-building-heights";
const OS_NGD_SOURCE = "os-ngd-buildings";
const OSM_SOURCE = "openstreetmap-overpass";

const PROVIDER_AUTHORITY = Object.freeze({
  [PLANNING_SOURCE]: "high",
  [FLOOD_SOURCE]: "high",
  [OS_SOURCE]: "high",
  [OS_NGD_SOURCE]: "high",
  [OSM_SOURCE]: "medium",
});

const DEFAULT_PROVIDER_TIMEOUT_MS = 8000;

function defaultFetch() {
  return typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : null;
}

// Distinguishes a real browser tab from jsdom (which has window AND a Node
// process). Real browsers either lack `process` entirely or lack
// `process.versions.node`.
function isRealBrowserRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  if (typeof process === "undefined") return true;
  if (!process.versions || !process.versions.node) return true;
  return false;
}

function resolveTimeoutMs(options) {
  const fromOptions = Number(options?.providerTimeoutMs);
  if (Number.isFinite(fromOptions) && fromOptions > 0) return fromOptions;
  if (
    typeof process !== "undefined" &&
    process?.env?.CONTEXT_PROVIDERS_TIMEOUT_MS
  ) {
    const fromEnv = Number(process.env.CONTEXT_PROVIDERS_TIMEOUT_MS);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  }
  return DEFAULT_PROVIDER_TIMEOUT_MS;
}

// Resolves to whatever the provider returned, OR — on timeout — to the
// supplied offline-shape with __timedOut: true so the merge step can detect
// the timeout and emit a *_TIMEOUT data_quality warning. Never rejects.
function settleWithin(promise, fallbackOnTimeout, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ...fallbackOnTimeout(),
        __timedOut: true,
        __timeoutMs: timeoutMs,
      });
    }, timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ...fallbackOnTimeout(),
          __error: err?.message || String(err),
        });
      });
  });
}

const offlinePlanning = () => ({
  heritage_flags: [],
  sources: [
    {
      dataset: "conservation-area",
      envelope: errorEnvelope({ source: PLANNING_SOURCE, error: "timeout" }),
    },
    {
      dataset: "listed-building",
      envelope: errorEnvelope({ source: PLANNING_SOURCE, error: "timeout" }),
    },
  ],
});

const offlineFlood = () => ({
  flood_risk: {
    status: "unknown",
    source: FLOOD_SOURCE,
    confidence: 0,
    error: "timeout",
  },
  envelope: errorEnvelope({ source: FLOOD_SOURCE, error: "timeout" }),
});

const offlineOsHeights = () => ({
  neighbouring_buildings: [],
  context_height_stats: {
    sample_count: 0,
    source: OS_SOURCE,
    confidence: 0,
  },
  envelope: errorEnvelope({ source: OS_SOURCE, error: "timeout" }),
});

const offlineOsNgd = () => ({
  neighbouring_buildings: [],
  building_footprints: [],
  context_height_stats: {
    sample_count: 0,
    source: OS_NGD_SOURCE,
    confidence: 0,
  },
  envelope: errorEnvelope({ source: OS_NGD_SOURCE, error: "timeout" }),
});

const offlineNeighbours = () => ({
  neighbouring_buildings: [],
  context_height_stats: { source: OSM_SOURCE, confidence: 0 },
  envelope: errorEnvelope({ source: OSM_SOURCE, error: "timeout" }),
});

function envelopeFetchedAt(envelope) {
  return envelope?.fetched_at || null;
}

function buildProviderManifest({
  planning,
  flood,
  osHeights,
  osNgd,
  neighbours,
  useOsHeights,
  useOsNgd,
}) {
  const planningEnvelopes = (planning.sources || []).map((s) => s.envelope);
  const planningTimedOut = Boolean(planning.__timedOut);
  const planningHasError = planningEnvelopes.every((e) => e?.error);
  const planningStatus = planningTimedOut
    ? "timeout"
    : planningHasError
      ? "error"
      : "ok";
  const planningFetchedAt =
    planningEnvelopes.find((e) => e && !e.error)?.fetched_at || null;

  const floodTimedOut = Boolean(flood.__timedOut);
  const floodStatus = floodTimedOut
    ? "timeout"
    : flood.envelope?.error
      ? "error"
      : "ok";

  const ngdTimedOut = Boolean(osNgd.__timedOut);
  const ngdHasKnownNonError =
    osNgd.envelope?.error && osNgd.envelope.error !== "no-os-ngd-key";
  const ngdStatus = ngdTimedOut
    ? "timeout"
    : ngdHasKnownNonError
      ? "error"
      : useOsNgd
        ? "ok"
        : "not_used";

  const osTimedOut = Boolean(osHeights.__timedOut);
  const osHasKnownNonError =
    osHeights.envelope?.error &&
    osHeights.envelope.error !== "no-os-mastermap-key";
  const osStatus = osTimedOut
    ? "timeout"
    : osHasKnownNonError
      ? "error"
      : useOsHeights
        ? "ok"
        : "not_used";

  const osmTimedOut = Boolean(neighbours.__timedOut);
  const osmStatus = osmTimedOut
    ? "timeout"
    : neighbours.envelope?.error
      ? "error"
      : "ok";

  return [
    {
      name: PLANNING_SOURCE,
      authority: PROVIDER_AUTHORITY[PLANNING_SOURCE],
      fetched_at: planningFetchedAt,
      status: planningStatus,
      fields_supplied:
        planningStatus === "ok" && planning.heritage_flags?.length > 0
          ? ["heritage_flags"]
          : [],
    },
    {
      name: FLOOD_SOURCE,
      authority: PROVIDER_AUTHORITY[FLOOD_SOURCE],
      fetched_at: envelopeFetchedAt(flood.envelope),
      status: floodStatus,
      fields_supplied: floodStatus === "ok" ? ["flood_risk"] : [],
    },
    {
      name: OS_NGD_SOURCE,
      authority: PROVIDER_AUTHORITY[OS_NGD_SOURCE],
      fetched_at: envelopeFetchedAt(osNgd.envelope),
      status: ngdStatus,
      fields_supplied:
        ngdStatus === "ok"
          ? [
              "building_footprints",
              "neighbouring_buildings",
              "context_height_stats",
            ]
          : [],
    },
    {
      name: OS_SOURCE,
      authority: PROVIDER_AUTHORITY[OS_SOURCE],
      fetched_at: envelopeFetchedAt(osHeights.envelope),
      status: osStatus,
      fields_supplied:
        osStatus === "ok" && !useOsNgd
          ? ["neighbouring_buildings", "context_height_stats"]
          : [],
    },
    {
      name: OSM_SOURCE,
      authority: PROVIDER_AUTHORITY[OSM_SOURCE],
      fetched_at: envelopeFetchedAt(neighbours.envelope),
      status: osmStatus,
      fields_supplied:
        osmStatus === "ok" && !useOsHeights && !useOsNgd
          ? ["neighbouring_buildings", "context_height_stats"]
          : [],
    },
  ];
}

/**
 * Enrich a SiteContext with heritage flags, flood risk, and neighbour buildings
 * pulled from open UK data sources. Mutation-free — returns a new site object.
 *
 * @param {object} site - The deterministic SiteContext from buildSiteContext.
 * @param {object} options
 * @param {Function} [options.fetchImpl] - Custom fetch (test stub or polyfill).
 * @param {boolean} [options.useDefaultFetch] - If true, use globalThis.fetch.
 * @param {number} [options.providerTimeoutMs] - Per-provider timeout. Defaults
 *   to CONTEXT_PROVIDERS_TIMEOUT_MS env or 8000ms.
 * @returns {Promise<object>} Enriched site context.
 */
export async function enrichSiteContext(site, options = {}) {
  // Phase 1 amendment #4: server-only guard. Real browsers (no Node process)
  // are refused; jsdom + Node tests are allowed.
  if (isRealBrowserRuntime()) {
    return {
      ...site,
      data_quality: [
        ...(site.data_quality || []),
        {
          code: "CONTEXT_PROVIDERS_BROWSER_GUARD",
          severity: "warning",
          message:
            "UK context providers refuse to run in browser runtime; deterministic-only site pack used.",
        },
      ],
      providers: site.providers || [],
    };
  }

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
      providers: site.providers || [],
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
      providers: site.providers || [],
    };
  }

  const timeoutMs = resolveTimeoutMs(options);

  const [planning, flood, osHeights, osNgd, neighbours] = await Promise.all([
    settleWithin(
      fetchPlanningHeritageFlags({ lat, lon, fetchImpl }),
      offlinePlanning,
      timeoutMs,
    ),
    settleWithin(
      fetchFloodRisk({ lat, lon, fetchImpl }),
      offlineFlood,
      timeoutMs,
    ),
    settleWithin(
      fetchOsHeightContext({
        lat,
        lon,
        apiKey: options.osMastermapApiKey,
        fetchImpl,
      }),
      offlineOsHeights,
      timeoutMs,
    ),
    settleWithin(
      fetchOsNgdContext({
        lat,
        lon,
        apiKey: options.osNgdApiKey,
        fetchImpl,
      }),
      offlineOsNgd,
      timeoutMs,
    ),
    settleWithin(
      fetchNeighbouringContext({ lat, lon, fetchImpl }),
      offlineNeighbours,
      timeoutMs,
    ),
  ]);

  // Phase 2a: OS NGD is the highest-fidelity source (full polygons + heights)
  // and is preferred for neighbouring_buildings + building_footprints when it
  // returns data with confidence ≥ 0.9. OS MasterMap heights remain the next
  // tier; OSM Overpass is the open-data fallback.
  const useOsNgd =
    osNgd?.envelope?.confidence >= 0.9 &&
    Array.isArray(osNgd.building_footprints) &&
    osNgd.building_footprints.length > 0;
  const useOsHeights =
    !useOsNgd &&
    osHeights?.envelope?.confidence >= 0.9 &&
    osHeights.neighbouring_buildings.length > 0;
  const heightContext = useOsNgd
    ? osNgd
    : useOsHeights
      ? osHeights
      : neighbours;

  const dataQuality = [...(site.data_quality || [])];

  if (planning.__timedOut) {
    dataQuality.push({
      code: "PLANNING_DATA_TIMEOUT",
      severity: "warning",
      message: `Planning Data lookup timed out after ${planning.__timeoutMs}ms; deterministic fallback used.`,
      source: PLANNING_SOURCE,
    });
  } else {
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
  }

  if (flood.__timedOut) {
    dataQuality.push({
      code: "EA_FLOOD_LOOKUP_TIMEOUT",
      severity: "warning",
      message: `EA flood lookup timed out after ${flood.__timeoutMs}ms; deterministic fallback used.`,
      source: FLOOD_SOURCE,
    });
  } else if (flood.envelope.error) {
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

  if (neighbours.__timedOut) {
    dataQuality.push({
      code: "OSM_OVERPASS_TIMEOUT",
      severity: "warning",
      message: `OSM Overpass lookup timed out after ${neighbours.__timeoutMs}ms; deterministic fallback used.`,
      source: OSM_SOURCE,
    });
  } else if (neighbours.envelope.error) {
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

  if (osNgd.__timedOut) {
    dataQuality.push({
      code: "OS_NGD_TIMEOUT",
      severity: "warning",
      message: `OS NGD building-footprints lookup timed out after ${osNgd.__timeoutMs}ms; deterministic fallback used.`,
      source: OS_NGD_SOURCE,
    });
  } else if (
    osNgd?.envelope?.error &&
    osNgd.envelope.error !== "no-os-ngd-key"
  ) {
    dataQuality.push({
      code: "OS_NGD_ERROR",
      severity: "warning",
      message: `OS NGD building-footprints lookup failed: ${osNgd.envelope.error}`,
      source: osNgd.envelope.source,
    });
  } else if (useOsNgd) {
    dataQuality.push({
      code: "OS_NGD_OK",
      severity: "info",
      message: `OS NGD returned ${osNgd.building_footprints.length} authoritative building footprint(s); preferring over OS MasterMap heights and OSM Overpass for neighbouring_buildings.`,
      source: osNgd.envelope.source,
    });
  } else {
    dataQuality.push({
      code: "OS_NGD_NOT_USED",
      severity: "info",
      message:
        osNgd?.envelope?.error === "no-os-ngd-key"
          ? "OS NGD key not configured; falling back to OS MasterMap / OSM Overpass for neighbouring buildings."
          : "OS NGD returned no authoritative footprints; falling back to OS MasterMap / OSM Overpass for neighbouring buildings.",
      source: osNgd?.envelope?.source || OS_NGD_SOURCE,
    });
  }

  if (osHeights.__timedOut) {
    dataQuality.push({
      code: "OS_MASTERMAP_TIMEOUT",
      severity: "warning",
      message: `OS MasterMap lookup timed out after ${osHeights.__timeoutMs}ms; deterministic fallback used.`,
      source: OS_SOURCE,
    });
  } else if (
    osHeights?.envelope?.error &&
    osHeights.envelope.error !== "no-os-mastermap-key"
  ) {
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
          : useOsNgd
            ? "OS NGD already supplied authoritative footprints; OS MasterMap heights not consulted."
            : "OS MasterMap returned no authoritative heights; falling back to OSM Overpass.",
      source: osHeights?.envelope?.source || OS_SOURCE,
    });
  }

  const providers = buildProviderManifest({
    planning,
    flood,
    osHeights,
    osNgd,
    neighbours,
    useOsHeights,
    useOsNgd,
  });

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
    building_footprints:
      useOsNgd && Array.isArray(osNgd.building_footprints)
        ? osNgd.building_footprints
        : site.building_footprints || [],
    data_quality: dataQuality,
    providers: [...(site.providers || []), ...providers],
  };
}

export const __aggregatorInternals = Object.freeze({
  isRealBrowserRuntime,
  settleWithin,
  PROVIDER_AUTHORITY,
  PLANNING_SOURCE,
  FLOOD_SOURCE,
  OS_SOURCE,
  OS_NGD_SOURCE,
  OSM_SOURCE,
});

export default { enrichSiteContext };
