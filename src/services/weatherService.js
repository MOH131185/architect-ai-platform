import logger from "../utils/logger.js";
import { fetchWeather as fetchMetOffice } from "./climate/weatherProviders/metOfficeDataHubProvider.js";
import { fetchWeather as fetchOpenMeteo } from "./climate/weatherProviders/openMeteoProvider.js";
import { fetchWeather as fetchOpenWeather } from "./climate/weatherProviders/openWeatherProvider.js";

/**
 * Weather Service
 *
 * Phase 3: provider chain Met Office DataHub → Open-Meteo → OpenWeather →
 * deterministic fallback. Output remains backwards-compatible with the
 * pre-Phase-3 shape — { temperature, wind, precipitation, climateZone,
 * summary } — and gains additive fields { provider, authority, providers[],
 * data_quality[] } so the slice service can populate
 * provenanceManifest.climateDataProviders without further plumbing.
 *
 * Server-only: API keys are read from process.env on the server. Each
 * provider also layers a real-browser-runtime guard, so even if a client
 * accidentally calls weatherService.getClimateData it will fall straight
 * through to the deterministic fallback without leaking keys or making
 * cross-origin calls.
 */

function buildProviderRecord({ result, fieldsSupplied }) {
  return {
    name: result.provider,
    authority: result.authority,
    fetched_at: result.envelope?.fetched_at || null,
    status: result.__timedOut
      ? "timeout"
      : result.envelope?.error
        ? "error"
        : "ok",
    fields_supplied:
      result.envelope?.error || result.__timedOut ? [] : fieldsSupplied,
  };
}

function buildAuthorityCode(authority) {
  if (authority === "high") return "WEATHER_AUTHORITY_HIGH";
  if (authority === "medium") return "WEATHER_AUTHORITY_MEDIUM";
  return "WEATHER_AUTHORITY_LOW";
}

function fallbackReasonOf(result) {
  if (result.__timedOut) return `timeout-${result.__timeoutMs}ms`;
  return result.envelope?.error || "unknown";
}

function recordProviderOutcome({ providers, dataQuality, result, fields }) {
  providers.push(buildProviderRecord({ result, fieldsSupplied: fields }));
  if (result.__timedOut) {
    dataQuality.push({
      code: "WEATHER_PROVIDER_TIMEOUT",
      severity: "warning",
      message: `${result.provider} timed out after ${result.__timeoutMs}ms; chain falling through.`,
      source: result.provider,
    });
  } else if (result.envelope?.error) {
    dataQuality.push({
      code: "WEATHER_PROVIDER_ERROR",
      severity: "warning",
      message: `${result.provider} failed: ${result.envelope.error}; chain falling through.`,
      source: result.provider,
    });
  }
}

function buildDeterministicFallback(providers, dataQuality) {
  dataQuality.push({
    code: "WEATHER_PROVIDER_FALLBACK",
    severity: "warning",
    message:
      "All weather providers (Met Office DataHub, Open-Meteo, OpenWeather) failed; deterministic fallback used.",
    source: "deterministic-fallback",
  });
  dataQuality.push({
    code: "WEATHER_AUTHORITY_LOW",
    severity: "warning",
    message:
      "No live weather authority available; climate pack uses deterministic fallback.",
    source: "deterministic-fallback",
  });
  providers.push({
    name: "deterministic-fallback",
    authority: "low",
    fetched_at: null,
    status: "ok",
    fields_supplied: ["temperature", "wind", "precipitation", "climateZone"],
  });
  return {
    ...weatherService.getFallbackData(),
    provider: "deterministic-fallback",
    authority: "low",
    providers,
    data_quality: dataQuality,
  };
}

export const weatherService = {
  /**
   * Fetch climate data via the Met Office → Open-Meteo → OpenWeather chain.
   *
   * @param {number} lat - Latitude.
   * @param {number} lng - Longitude.
   * @param {object} [options]
   * @param {Function} [options.fetchImpl] - Custom fetch (test stub).
   * @param {string} [options.metOfficeApiKey] - Override env key.
   * @param {string} [options.openWeatherApiKey] - Override env key.
   * @param {number} [options.providerTimeoutMs] - Per-provider timeout.
   * @returns {Promise<object>} Climate object with the original
   *   { temperature, wind, precipitation, climateZone, summary } shape plus
   *   { provider, authority, providers[], data_quality[] } provenance.
   */
  async getClimateData(lat, lng, options = {}) {
    const providers = [];
    const dataQuality = [];
    const callOptions = {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.providerTimeoutMs,
    };

    try {
      // 1. Met Office DataHub (primary, authority=high)
      const metOffice = await fetchMetOffice({
        lat,
        lon: lng,
        apiKey: options.metOfficeApiKey,
        ...callOptions,
      });
      if (metOffice.data && !metOffice.envelope?.error) {
        providers.push(
          buildProviderRecord({
            result: metOffice,
            fieldsSupplied: [
              "temperature",
              "wind",
              "precipitation",
              "climateZone",
            ],
          }),
        );
        dataQuality.push({
          code: buildAuthorityCode(metOffice.authority),
          severity: "info",
          message: `Met Office DataHub returned authoritative weather (authority=${metOffice.authority}).`,
          source: metOffice.provider,
        });
        return {
          ...metOffice.data,
          provider: metOffice.provider,
          authority: metOffice.authority,
          providers,
          data_quality: dataQuality,
        };
      }
      recordProviderOutcome({
        providers,
        dataQuality,
        result: metOffice,
        fields: ["temperature", "wind", "precipitation", "climateZone"],
      });
      dataQuality.push({
        code: "WEATHER_PROVIDER_FALLBACK",
        severity: "info",
        message: `Falling back from Met Office DataHub to Open-Meteo (reason: ${fallbackReasonOf(
          metOffice,
        )}).`,
        source: "weather-chain",
      });

      // 2. Open-Meteo (fallback, authority=medium)
      const openMeteo = await fetchOpenMeteo({
        lat,
        lon: lng,
        ...callOptions,
      });
      if (openMeteo.data && !openMeteo.envelope?.error) {
        providers.push(
          buildProviderRecord({
            result: openMeteo,
            fieldsSupplied: [
              "temperature",
              "wind",
              "precipitation",
              "climateZone",
            ],
          }),
        );
        dataQuality.push({
          code: buildAuthorityCode(openMeteo.authority),
          severity: "info",
          message: `Open-Meteo returned weather data (authority=${openMeteo.authority}).`,
          source: openMeteo.provider,
        });
        return {
          ...openMeteo.data,
          provider: openMeteo.provider,
          authority: openMeteo.authority,
          providers,
          data_quality: dataQuality,
        };
      }
      recordProviderOutcome({
        providers,
        dataQuality,
        result: openMeteo,
        fields: ["temperature", "wind", "precipitation", "climateZone"],
      });
      dataQuality.push({
        code: "WEATHER_PROVIDER_FALLBACK",
        severity: "info",
        message: `Falling back from Open-Meteo to OpenWeather (reason: ${fallbackReasonOf(
          openMeteo,
        )}).`,
        source: "weather-chain",
      });

      // 3. OpenWeather (final fallback, authority=low)
      const openWeather = await fetchOpenWeather({
        lat,
        lon: lng,
        apiKey: options.openWeatherApiKey,
        ...callOptions,
      });
      if (openWeather.data && !openWeather.envelope?.error) {
        providers.push(
          buildProviderRecord({
            result: openWeather,
            fieldsSupplied: [
              "temperature",
              "wind",
              "precipitation",
              "climateZone",
            ],
          }),
        );
        dataQuality.push({
          code: buildAuthorityCode(openWeather.authority),
          severity: "info",
          message: `OpenWeather returned weather data (authority=${openWeather.authority}).`,
          source: openWeather.provider,
        });
        return {
          ...openWeather.data,
          provider: openWeather.provider,
          authority: openWeather.authority,
          providers,
          data_quality: dataQuality,
        };
      }
      recordProviderOutcome({
        providers,
        dataQuality,
        result: openWeather,
        fields: ["temperature", "wind", "precipitation", "climateZone"],
      });
    } catch (error) {
      logger.error("Weather provider chain threw unexpectedly:", error);
      dataQuality.push({
        code: "WEATHER_PROVIDER_ERROR",
        severity: "warning",
        message: `Weather provider chain threw: ${error?.message || error}`,
        source: "weather-chain",
      });
    }

    // 4. Deterministic fallback when all providers fail / are unavailable.
    return buildDeterministicFallback(providers, dataQuality);
  },

  /**
   * Process raw API response into architectural climate summary.
   * Retained for any consumers that imported processWeatherData directly
   * before the chain refactor; new code should use getClimateData and read
   * the provenance fields.
   */
  processWeatherData(data) {
    const current = data.current_weather || {};
    const daily = data.daily || {};
    const windDir =
      current.winddirection || daily.wind_direction_10m_dominant?.[0] || 0;
    const cardinalWind = this.degreesToCardinal(windDir);
    const temp = current.temperature || 15;
    let climateZone = "Temperate";
    if (temp > 25) climateZone = "Tropical";
    if (temp > 35) climateZone = "Arid";
    if (temp < 5) climateZone = "Cold";
    if (temp < -5) climateZone = "Polar";
    return {
      temperature: {
        current: current.temperature,
        min: daily.temperature_2m_min?.[0],
        max: daily.temperature_2m_max?.[0],
        unit: "°C",
      },
      wind: {
        speed: current.windspeed,
        direction: windDir,
        cardinal: cardinalWind,
        prevailing: cardinalWind,
        unit: "km/h",
      },
      precipitation: {
        daily: daily.precipitation_sum?.[0] || 0,
        daily_sum: daily.precipitation_sum?.[0] || 0,
        unit: "mm",
      },
      climateZone,
      summary: `Current conditions: ${current.temperature}°C, Wind ${cardinalWind} at ${current.windspeed} km/h`,
    };
  },

  degreesToCardinal(degrees) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index =
      Math.round(((degrees %= 360) < 0 ? degrees + 360 : degrees) / 45) % 8;
    return dirs[index];
  },

  getFallbackData() {
    return {
      temperature: { current: 15, min: 10, max: 20, unit: "°C" },
      wind: {
        speed: 10,
        direction: 225,
        cardinal: "SW",
        prevailing: "SW",
        unit: "km/h",
      },
      precipitation: { daily: 0, daily_sum: 0, unit: "mm" },
      climateZone: "Temperate",
      summary: "Weather data unavailable; UK temperate fallback assumption.",
    };
  },
};

export default weatherService;
