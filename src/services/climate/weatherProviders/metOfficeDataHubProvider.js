/**
 * Met Office DataHub site-specific forecast provider — primary climate source
 * for the project_graph pipeline. UK national weather service; authority='high'.
 *
 * Server-only: METOFFICE_DATAHUB_API_KEY is read from process.env. Never via
 * REACT_APP_*. Returns an offline-safe envelope when the key or fetch is
 * unavailable so the chain in weatherService.js falls through cleanly.
 */

import {
  degreesToCardinal,
  inferClimateZone,
  successEnvelope,
  errorEnvelope,
  runProviderCall,
} from "./_chainHelpers.js";

const PROVIDER_NAME = "met-office-datahub";
const AUTHORITY = "high";
const SOURCE_ID = "met-office-datahub";
const LICENSE_NOTE =
  "Met Office DataHub site-specific forecast (https://www.metoffice.gov.uk/services/data/datapoint). Requires METOFFICE_DATAHUB_API_KEY; covered by your DataHub subscription.";
const DEFAULT_BASE_URL = "https://data.hub.api.metoffice.gov.uk";

function getApiKey(envOverride) {
  if (typeof envOverride === "string" && envOverride) return envOverride;
  if (
    typeof process !== "undefined" &&
    process.env?.METOFFICE_DATAHUB_API_KEY
  ) {
    return process.env.METOFFICE_DATAHUB_API_KEY;
  }
  return null;
}

function getBaseUrl(override) {
  if (typeof override === "string" && override) return override;
  if (
    typeof process !== "undefined" &&
    process.env?.METOFFICE_DATAHUB_BASE_URL
  ) {
    return process.env.METOFFICE_DATAHUB_BASE_URL;
  }
  return DEFAULT_BASE_URL;
}

function summariseTimeSeries(timeSeries) {
  // Met Office DataHub site-specific responses contain timeSeries entries
  // with screenTemperature (°C), windSpeed10m (m/s),
  // windDirectionFrom10m (degrees), totalPrecipAmount (mm).
  const first = timeSeries[0] || {};
  const temps = timeSeries
    .map((row) => Number(row?.screenTemperature ?? row?.airTemperature))
    .filter((t) => Number.isFinite(t));
  const min = temps.length ? Math.min(...temps) : null;
  const max = temps.length ? Math.max(...temps) : null;
  const current = Number.isFinite(Number(first.screenTemperature))
    ? Number(first.screenTemperature)
    : Number.isFinite(Number(first.airTemperature))
      ? Number(first.airTemperature)
      : null;
  const windSpeed = Number(first.windSpeed10m ?? first.windSpeedAt10m);
  const windDirRaw = Number(
    first.windDirectionFrom10m ?? first.windDirection ?? 0,
  );
  const windDir = Number.isFinite(windDirRaw) ? windDirRaw : 0;
  const cardinal = degreesToCardinal(windDir);
  const precipNext24h = timeSeries.slice(0, 24).reduce((sum, row) => {
    const v = Number(row?.totalPrecipAmount);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  return {
    temperature: { current, min, max, unit: "°C" },
    wind: {
      speed: Number.isFinite(windSpeed) ? windSpeed : null,
      direction: windDir,
      cardinal,
      prevailing: cardinal,
      unit: "m/s",
    },
    precipitation: {
      daily: precipNext24h,
      daily_sum: precipNext24h,
      unit: "mm",
    },
    climateZone: inferClimateZone(current),
    summary: `Met Office: ${current ?? "—"}°C, wind ${cardinal} ${
      Number.isFinite(windSpeed) ? `${windSpeed.toFixed(1)} m/s` : "n/a"
    }`,
  };
}

export async function fetchWeather({
  lat,
  lon,
  fetchImpl,
  apiKey,
  baseUrl,
  timeoutMs,
} = {}) {
  return runProviderCall({
    providerName: PROVIDER_NAME,
    authority: AUTHORITY,
    source: SOURCE_ID,
    licenseNote: LICENSE_NOTE,
    fetchImpl,
    apiKey: getApiKey(apiKey),
    apiKeyRequired: true,
    noKeyReason: "no-metoffice-datahub-key",
    timeoutMs,
    async runFetch({ fetchImpl: f, apiKey: key }) {
      const url = `${getBaseUrl(baseUrl)}/sitespecific/v0/point/hourly?latitude=${encodeURIComponent(
        lat,
      )}&longitude=${encodeURIComponent(lon)}`;
      const response = await f(url, {
        headers: { apikey: key, accept: "application/json" },
      });
      if (!response.ok) {
        return {
          data: null,
          provider: PROVIDER_NAME,
          authority: AUTHORITY,
          envelope: errorEnvelope({
            source: SOURCE_ID,
            licenseNote: LICENSE_NOTE,
            reason: `HTTP ${response.status}`,
          }),
        };
      }
      const json = await response.json();
      const timeSeries = Array.isArray(
        json?.features?.[0]?.properties?.timeSeries,
      )
        ? json.features[0].properties.timeSeries
        : Array.isArray(json?.timeSeries)
          ? json.timeSeries
          : [];
      if (timeSeries.length === 0) {
        return {
          data: null,
          provider: PROVIDER_NAME,
          authority: AUTHORITY,
          envelope: errorEnvelope({
            source: SOURCE_ID,
            licenseNote: LICENSE_NOTE,
            reason: "empty-timeseries",
          }),
        };
      }
      return {
        data: summariseTimeSeries(timeSeries),
        provider: PROVIDER_NAME,
        authority: AUTHORITY,
        envelope: successEnvelope({
          source: SOURCE_ID,
          licenseNote: LICENSE_NOTE,
        }),
      };
    },
  });
}

export const __metOfficeInternals = Object.freeze({
  summariseTimeSeries,
  PROVIDER_NAME,
  AUTHORITY,
});

export default { fetchWeather };
