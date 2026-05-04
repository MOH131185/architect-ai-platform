/**
 * Open-Meteo provider — free, key-less, public API. Authority='medium' because
 * it's a model-driven aggregator rather than a national weather service.
 *
 * This is the existing weatherService.js Open-Meteo logic refactored as a
 * provider so weatherService can chain it after Met Office DataHub.
 */

import {
  degreesToCardinal,
  inferClimateZone,
  successEnvelope,
  errorEnvelope,
  runProviderCall,
} from "./_chainHelpers.js";

const PROVIDER_NAME = "open-meteo";
const AUTHORITY = "medium";
const SOURCE_ID = "open-meteo";
const LICENSE_NOTE =
  "Open-Meteo (https://open-meteo.com). Non-commercial use is free; no API key required.";
const DEFAULT_BASE_URL = "https://api.open-meteo.com";

function getBaseUrl(override) {
  if (typeof override === "string" && override) return override;
  if (typeof process !== "undefined" && process.env?.OPEN_METEO_BASE_URL) {
    return process.env.OPEN_METEO_BASE_URL;
  }
  return DEFAULT_BASE_URL;
}

function summariseOpenMeteo(json) {
  const current = json?.current_weather || {};
  const daily = json?.daily || {};
  const tempCurrent = Number.isFinite(Number(current.temperature))
    ? Number(current.temperature)
    : null;
  const min = Number(daily.temperature_2m_min?.[0]);
  const max = Number(daily.temperature_2m_max?.[0]);
  const windDirRaw = Number(
    current.winddirection ?? daily.wind_direction_10m_dominant?.[0] ?? 0,
  );
  const windDir = Number.isFinite(windDirRaw) ? windDirRaw : 0;
  const cardinal = degreesToCardinal(windDir);
  return {
    temperature: {
      current: tempCurrent,
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
      unit: "°C",
    },
    wind: {
      speed: Number.isFinite(Number(current.windspeed))
        ? Number(current.windspeed)
        : null,
      direction: windDir,
      cardinal,
      prevailing: cardinal,
      unit: "km/h",
    },
    precipitation: {
      daily: Number(daily.precipitation_sum?.[0]) || 0,
      daily_sum: Number(daily.precipitation_sum?.[0]) || 0,
      unit: "mm",
    },
    climateZone: inferClimateZone(tempCurrent),
    summary: `Open-Meteo: ${tempCurrent ?? "—"}°C, wind ${cardinal} ${
      Number.isFinite(Number(current.windspeed))
        ? `${current.windspeed} km/h`
        : "n/a"
    }`,
  };
}

export async function fetchWeather({
  lat,
  lon,
  fetchImpl,
  baseUrl,
  timeoutMs,
} = {}) {
  return runProviderCall({
    providerName: PROVIDER_NAME,
    authority: AUTHORITY,
    source: SOURCE_ID,
    licenseNote: LICENSE_NOTE,
    fetchImpl,
    apiKey: null,
    apiKeyRequired: false,
    timeoutMs,
    async runFetch({ fetchImpl: f }) {
      const url = `${getBaseUrl(
        baseUrl,
      )}/v1/forecast?latitude=${encodeURIComponent(
        lat,
      )}&longitude=${encodeURIComponent(
        lon,
      )}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&current_weather=true&timezone=auto&forecast_days=1`;
      const response = await f(url);
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
      if (!json?.current_weather && !json?.daily) {
        return {
          data: null,
          provider: PROVIDER_NAME,
          authority: AUTHORITY,
          envelope: errorEnvelope({
            source: SOURCE_ID,
            licenseNote: LICENSE_NOTE,
            reason: "empty-response",
          }),
        };
      }
      return {
        data: summariseOpenMeteo(json),
        provider: PROVIDER_NAME,
        authority: AUTHORITY,
        envelope: successEnvelope({
          source: SOURCE_ID,
          licenseNote: LICENSE_NOTE,
          confidence: 0.85,
        }),
      };
    },
  });
}

export const __openMeteoInternals = Object.freeze({
  summariseOpenMeteo,
  PROVIDER_NAME,
  AUTHORITY,
});

export default { fetchWeather };
