/**
 * OpenWeather provider — final fallback in the chain. Authority='low' because
 * it's a commercial aggregator and not the UK national weather authority.
 *
 * Server-only: OPENWEATHER_API_KEY is read from process.env. Never via
 * REACT_APP_* (client-side OpenWeather usage stays in the legacy
 * src/services/climateService.js path which is not in this PR's scope).
 */

import {
  degreesToCardinal,
  inferClimateZone,
  successEnvelope,
  errorEnvelope,
  runProviderCall,
} from "./_chainHelpers.js";

const PROVIDER_NAME = "openweather";
const AUTHORITY = "low";
const SOURCE_ID = "openweather";
const LICENSE_NOTE =
  "OpenWeather (https://openweathermap.org). Subject to OpenWeather licence; requires OPENWEATHER_API_KEY.";
const DEFAULT_BASE_URL = "https://api.openweathermap.org";

function getApiKey(envOverride) {
  if (typeof envOverride === "string" && envOverride) return envOverride;
  if (typeof process !== "undefined" && process.env?.OPENWEATHER_API_KEY) {
    return process.env.OPENWEATHER_API_KEY;
  }
  return null;
}

function getBaseUrl(override) {
  if (typeof override === "string" && override) return override;
  if (typeof process !== "undefined" && process.env?.OPENWEATHER_BASE_URL) {
    return process.env.OPENWEATHER_BASE_URL;
  }
  return DEFAULT_BASE_URL;
}

function summariseOpenWeather(json) {
  const main = json?.main || {};
  const wind = json?.wind || {};
  const rain = json?.rain || {};
  const tempCurrent = Number.isFinite(Number(main.temp))
    ? Number(main.temp)
    : null;
  const min = Number.isFinite(Number(main.temp_min))
    ? Number(main.temp_min)
    : null;
  const max = Number.isFinite(Number(main.temp_max))
    ? Number(main.temp_max)
    : null;
  const windSpeed = Number.isFinite(Number(wind.speed))
    ? Number(wind.speed)
    : null;
  const windDirRaw = Number(wind.deg ?? 0);
  const windDir = Number.isFinite(windDirRaw) ? windDirRaw : 0;
  const cardinal = degreesToCardinal(windDir);
  const precip = Number(rain["1h"]) || Number(rain["3h"]) || 0;
  return {
    temperature: { current: tempCurrent, min, max, unit: "°C" },
    wind: {
      speed: windSpeed,
      direction: windDir,
      cardinal,
      prevailing: cardinal,
      unit: "m/s",
    },
    precipitation: { daily: precip, daily_sum: precip, unit: "mm" },
    climateZone: inferClimateZone(tempCurrent),
    summary: `OpenWeather: ${tempCurrent ?? "—"}°C, wind ${cardinal} ${
      Number.isFinite(windSpeed) ? `${windSpeed} m/s` : "n/a"
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
    noKeyReason: "no-openweather-key",
    timeoutMs,
    async runFetch({ fetchImpl: f, apiKey: key }) {
      const url = `${getBaseUrl(
        baseUrl,
      )}/data/2.5/weather?lat=${encodeURIComponent(
        lat,
      )}&lon=${encodeURIComponent(lon)}&appid=${encodeURIComponent(key)}&units=metric`;
      const response = await f(url, {
        headers: { accept: "application/json" },
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
      if (!json?.main && !json?.wind) {
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
        data: summariseOpenWeather(json),
        provider: PROVIDER_NAME,
        authority: AUTHORITY,
        envelope: successEnvelope({
          source: SOURCE_ID,
          licenseNote: LICENSE_NOTE,
          confidence: 0.7,
        }),
      };
    },
  });
}

export const __openWeatherInternals = Object.freeze({
  summariseOpenWeather,
  PROVIDER_NAME,
  AUTHORITY,
});

export default { fetchWeather };
