import {
  parseEpw,
  loadEpwBuffer,
} from "../../../services/climate/weatherProviders/epwLoader.js";
import {
  UKCP18_DATASET,
  ukcp18ReferenceFor,
} from "../../../services/climate/weatherProviders/ukcp18Reference.js";
import { fetchWeather as fetchMetOffice } from "../../../services/climate/weatherProviders/metOfficeDataHubProvider.js";
import { fetchWeather as fetchOpenMeteo } from "../../../services/climate/weatherProviders/openMeteoProvider.js";
import { fetchWeather as fetchOpenWeather } from "../../../services/climate/weatherProviders/openWeatherProvider.js";
import { weatherService } from "../../../services/weatherService.js";

function fakeEpwHeader({ rowCount = 8760, lat = 51.5, lon = -0.1 } = {}) {
  const header = [
    `LOCATION,London,,GBR,IWEC,037790,${lat},${lon},0.0,5.0`,
    "DESIGN CONDITIONS,0",
    "TYPICAL/EXTREME PERIODS,0",
    "GROUND TEMPERATURES,0",
    "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
    "COMMENTS 1,Synthetic test fixture",
    "COMMENTS 2,Generated for unit test",
    "DATA PERIODS,1,1,Data,Sunday,1/1,12/31",
  ].join("\n");
  const data = new Array(rowCount).fill("1,1,1,0,0,test").join("\n");
  return rowCount > 0 ? `${header}\n${data}` : header;
}

describe("epwLoader", () => {
  test("rejects empty input", () => {
    expect(() => parseEpw("")).toThrow(/non-empty/);
  });

  test("rejects malformed header", () => {
    expect(() => parseEpw("HEADERWRONG\n".repeat(10))).toThrow(
      /header malformed/,
    );
  });

  test("parses location header for lat/lon/elevation/timezone", () => {
    const text = fakeEpwHeader({ rowCount: 0, lat: 51.5074, lon: -0.1278 });
    const out = parseEpw(text);
    expect(out.location.lat).toBeCloseTo(51.5074);
    expect(out.location.lon).toBeCloseTo(-0.1278);
    expect(out.location.country).toBe("GBR");
    expect(out.location.elevation_m).toBe(5);
    expect(out.location.timezone_hours).toBe(0);
  });

  test("classifies a full-year EPW as info-severity", () => {
    const text = fakeEpwHeader({ rowCount: 8760 });
    const out = parseEpw(text);
    expect(out.is_full_year).toBe(true);
    expect(out.data_row_count).toBe(8760);
    expect(out.data_quality.severity).toBe("info");
  });

  test("classifies a near-complete EPW (8000 rows) as warning", () => {
    const text = fakeEpwHeader({ rowCount: 8000 });
    const out = parseEpw(text);
    expect(out.is_full_year).toBe(false);
    expect(out.data_quality.severity).toBe("warning");
  });

  test("classifies a tiny EPW (10 rows) as error", () => {
    const text = fakeEpwHeader({ rowCount: 10 });
    const out = parseEpw(text);
    expect(out.data_quality.severity).toBe("error");
  });

  test("loadEpwBuffer accepts string input", () => {
    const text = fakeEpwHeader({ rowCount: 100 });
    const out = loadEpwBuffer(text);
    expect(out.data_row_count).toBe(100);
  });
});

describe("ukcp18Reference", () => {
  test("UKCP18_DATASET cites Met Office", () => {
    expect(UKCP18_DATASET.title).toMatch(/Met Office UKCP18/i);
    expect(UKCP18_DATASET.source_url).toMatch(/metoffice\.gov\.uk/);
    expect(UKCP18_DATASET.scenarios).toEqual(
      expect.arrayContaining(["RCP4.5", "RCP8.5"]),
    );
  });

  test("ukcp18ReferenceFor records site coords without live fetch", () => {
    const ref = ukcp18ReferenceFor({ lat: 51.5, lon: -0.1 });
    expect(ref.site_query.lat).toBe(51.5);
    expect(ref.site_query.query_resolved).toBe(false);
    expect(ref.data_quality.message).toMatch(/external downscaling/i);
  });

  test("missing coords still attaches dataset metadata", () => {
    const ref = ukcp18ReferenceFor({});
    expect(ref.site_query).toBeNull();
    expect(ref.dataset).toBe(UKCP18_DATASET);
  });
});

// --------------------------------------------------------------------------
// Phase 3: Met Office DataHub → Open-Meteo → OpenWeather provider chain.
// --------------------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 400, status, json: async () => body };
}

const SAMPLE_METOFFICE_TIMESERIES = {
  features: [
    {
      properties: {
        timeSeries: [
          {
            screenTemperature: 12.5,
            windSpeed10m: 4.2,
            windDirectionFrom10m: 200,
            totalPrecipAmount: 0.3,
          },
          {
            screenTemperature: 11.8,
            windSpeed10m: 4.5,
            windDirectionFrom10m: 210,
            totalPrecipAmount: 0.1,
          },
        ],
      },
    },
  ],
};

const SAMPLE_OPEN_METEO = {
  current_weather: { temperature: 13.4, windspeed: 14, winddirection: 180 },
  daily: {
    temperature_2m_max: [16.5],
    temperature_2m_min: [9.5],
    precipitation_sum: [0.5],
    wind_direction_10m_dominant: [180],
  },
};

const SAMPLE_OPENWEATHER = {
  main: { temp: 11.0, temp_min: 9.0, temp_max: 14.0 },
  wind: { speed: 4.0, deg: 90 },
  rain: { "1h": 0.2 },
};

describe("metOfficeDataHubProvider", () => {
  const originalKey = process.env.METOFFICE_DATAHUB_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.METOFFICE_DATAHUB_API_KEY;
    else process.env.METOFFICE_DATAHUB_API_KEY = originalKey;
  });

  test("returns offline envelope when METOFFICE_DATAHUB_API_KEY is absent", async () => {
    delete process.env.METOFFICE_DATAHUB_API_KEY;
    const fetchImpl = jest.fn();
    const out = await fetchMetOffice({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data).toBeNull();
    expect(out.envelope.error).toBe("no-metoffice-datahub-key");
    expect(out.provider).toBe("met-office-datahub");
    expect(out.authority).toBe("high");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("normalises a successful timeSeries response", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-key";
    const fetchImpl = jest.fn(async () =>
      jsonResponse(SAMPLE_METOFFICE_TIMESERIES),
    );
    const out = await fetchMetOffice({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data.temperature.current).toBe(12.5);
    expect(out.data.temperature.min).toBe(11.8);
    expect(out.data.temperature.max).toBe(12.5);
    expect(out.data.wind.speed).toBe(4.2);
    expect(out.data.wind.cardinal).toBe("S");
    expect(out.data.precipitation.daily).toBeCloseTo(0.4, 5);
    expect(out.data.climateZone).toBe("Temperate");
    expect(out.envelope.error).toBeNull();
    expect(out.envelope.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("returns error envelope on HTTP 503", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-key";
    const fetchImpl = jest.fn(async () => jsonResponse({}, 503));
    const out = await fetchMetOffice({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data).toBeNull();
    expect(out.envelope.error).toMatch(/HTTP 503/);
  });

  test("times out after providerTimeoutMs and returns timeout envelope", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-key";
    const fetchImpl = jest.fn(() => new Promise(() => {}));
    const out = await fetchMetOffice({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
      timeoutMs: 25,
    });
    expect(out.__timedOut).toBe(true);
    expect(out.envelope.error).toMatch(/timeout/);
  });
});

describe("openMeteoProvider", () => {
  test("normalises a successful Open-Meteo response (no key required)", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(SAMPLE_OPEN_METEO));
    const out = await fetchOpenMeteo({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data.temperature.current).toBe(13.4);
    expect(out.data.wind.speed).toBe(14);
    expect(out.data.wind.cardinal).toBe("S");
    expect(out.data.precipitation.daily).toBe(0.5);
    expect(out.envelope.error).toBeNull();
    expect(out.authority).toBe("medium");
  });

  test("propagates HTTP 502 as error envelope", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}, 502));
    const out = await fetchOpenMeteo({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data).toBeNull();
    expect(out.envelope.error).toMatch(/HTTP 502/);
  });

  test("times out after providerTimeoutMs and returns timeout envelope", async () => {
    const fetchImpl = jest.fn(() => new Promise(() => {}));
    const out = await fetchOpenMeteo({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
      timeoutMs: 25,
    });
    expect(out.__timedOut).toBe(true);
    expect(out.envelope.error).toMatch(/timeout/);
    expect(out.provider).toBe("open-meteo");
    expect(out.authority).toBe("medium");
  });
});

describe("openWeatherProvider", () => {
  const originalKey = process.env.OPENWEATHER_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = originalKey;
  });

  test("returns offline envelope when OPENWEATHER_API_KEY is absent", async () => {
    delete process.env.OPENWEATHER_API_KEY;
    const fetchImpl = jest.fn();
    const out = await fetchOpenWeather({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data).toBeNull();
    expect(out.envelope.error).toBe("no-openweather-key");
    expect(out.authority).toBe("low");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("normalises a successful OpenWeather response", async () => {
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = jest.fn(async () => jsonResponse(SAMPLE_OPENWEATHER));
    const out = await fetchOpenWeather({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data.temperature.current).toBe(11);
    expect(out.data.wind.speed).toBe(4);
    expect(out.data.wind.cardinal).toBe("E");
    expect(out.data.precipitation.daily).toBe(0.2);
    expect(out.authority).toBe("low");
    expect(out.envelope.error).toBeNull();
  });

  test("propagates HTTP 401 as error envelope (invalid key)", async () => {
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = jest.fn(async () => jsonResponse({}, 401));
    const out = await fetchOpenWeather({ lat: 51.5, lon: -0.1, fetchImpl });
    expect(out.data).toBeNull();
    expect(out.envelope.error).toMatch(/HTTP 401/);
    expect(out.provider).toBe("openweather");
    expect(out.authority).toBe("low");
  });

  test("times out after providerTimeoutMs and returns timeout envelope", async () => {
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = jest.fn(() => new Promise(() => {}));
    const out = await fetchOpenWeather({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
      timeoutMs: 25,
    });
    expect(out.__timedOut).toBe(true);
    expect(out.envelope.error).toMatch(/timeout/);
  });
});

describe("weatherService chain", () => {
  const originalMo = process.env.METOFFICE_DATAHUB_API_KEY;
  const originalOw = process.env.OPENWEATHER_API_KEY;
  afterEach(() => {
    if (originalMo === undefined) delete process.env.METOFFICE_DATAHUB_API_KEY;
    else process.env.METOFFICE_DATAHUB_API_KEY = originalMo;
    if (originalOw === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = originalOw;
  });

  function chainFetch({ metOffice, openMeteo, openWeather }) {
    return jest.fn(async (url) => {
      if (typeof url !== "string") return jsonResponse({});
      if (url.includes("data.hub.api.metoffice.gov.uk")) {
        return metOffice ?? jsonResponse({}, 503);
      }
      if (url.includes("api.open-meteo.com")) {
        return openMeteo ?? jsonResponse({}, 503);
      }
      if (url.includes("api.openweathermap.org")) {
        return openWeather ?? jsonResponse({}, 503);
      }
      return jsonResponse({});
    });
  }

  test("Met Office success → returns HIGH authority and does not call fallback providers", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse(SAMPLE_METOFFICE_TIMESERIES),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    expect(out.provider).toBe("met-office-datahub");
    expect(out.authority).toBe("high");
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).toContain("WEATHER_AUTHORITY_HIGH");
    expect(codes).not.toContain("WEATHER_PROVIDER_FALLBACK");
    // The chain stopped after Met Office — only one provider record present.
    expect(out.providers).toHaveLength(1);
    expect(out.providers[0].name).toBe("met-office-datahub");
    expect(out.providers[0].status).toBe("ok");
    // Backwards-compatible output shape preserved.
    expect(out.temperature).toEqual(
      expect.objectContaining({ unit: "°C", current: expect.any(Number) }),
    );
    expect(out.wind).toEqual(
      expect.objectContaining({ cardinal: expect.any(String) }),
    );
    expect(out.precipitation).toEqual(expect.objectContaining({ unit: "mm" }));
    expect(typeof out.summary).toBe("string");
    expect(typeof out.climateZone).toBe("string");
  });

  test("Met Office HTTP 503 → falls through to Open-Meteo (MEDIUM)", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse({}, 503),
      openMeteo: jsonResponse(SAMPLE_OPEN_METEO),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    expect(out.provider).toBe("open-meteo");
    expect(out.authority).toBe("medium");
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).toContain("WEATHER_PROVIDER_ERROR");
    expect(codes).toContain("WEATHER_PROVIDER_FALLBACK");
    expect(codes).toContain("WEATHER_AUTHORITY_MEDIUM");
    expect(out.providers.map((p) => p.name)).toEqual([
      "met-office-datahub",
      "open-meteo",
    ]);
  });

  test("Met Office + Open-Meteo fail → OpenWeather (LOW)", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse({}, 503),
      openMeteo: jsonResponse({}, 503),
      openWeather: jsonResponse(SAMPLE_OPENWEATHER),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    expect(out.provider).toBe("openweather");
    expect(out.authority).toBe("low");
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).toContain("WEATHER_AUTHORITY_LOW");
    expect(codes.filter((c) => c === "WEATHER_PROVIDER_FALLBACK").length).toBe(
      2,
    );
    expect(out.providers).toHaveLength(3);
  });

  test("All providers fail → deterministic fallback marked WEATHER_AUTHORITY_LOW", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse({}, 503),
      openMeteo: jsonResponse({}, 503),
      openWeather: jsonResponse({}, 503),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    expect(out.provider).toBe("deterministic-fallback");
    expect(out.authority).toBe("low");
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).toContain("WEATHER_PROVIDER_FALLBACK");
    expect(codes).toContain("WEATHER_AUTHORITY_LOW");
    expect(out.providers.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        "met-office-datahub",
        "open-meteo",
        "openweather",
        "deterministic-fallback",
      ]),
    );
    // Backwards-compatible shape still present even on full fallback.
    expect(out.temperature.unit).toBe("°C");
    expect(out.wind.cardinal).toBe("SW");
    expect(out.climateZone).toBe("Temperate");
  });

  test("OpenAI / GPT names never appear among weather provider records", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse(SAMPLE_METOFFICE_TIMESERIES),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    for (const provider of out.providers) {
      expect(provider.name).not.toMatch(/openai|gpt|chatgpt/i);
    }
  });

  test("provider record carries name + authority + fetched_at + status + fields_supplied", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse(SAMPLE_METOFFICE_TIMESERIES),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    const record = out.providers[0];
    expect(record.name).toBe("met-office-datahub");
    expect(record.authority).toBe("high");
    expect(record).toHaveProperty("fetched_at");
    expect(["ok", "error", "timeout", "not_used"]).toContain(record.status);
    expect(record.fields_supplied).toEqual(
      expect.arrayContaining([
        "temperature",
        "wind",
        "precipitation",
        "climateZone",
      ]),
    );
  });

  // --- Codex review additions: explicit timeout + chain-fallthrough coverage ---

  test("Met Office error + Open-Meteo timeout → OpenWeather (LOW) with WEATHER_PROVIDER_TIMEOUT", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse({}, 503),
      openMeteo: new Promise(() => {}), // hang only this provider
      openWeather: jsonResponse(SAMPLE_OPENWEATHER),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, {
      fetchImpl,
      providerTimeoutMs: 25,
    });
    expect(out.provider).toBe("openweather");
    expect(out.authority).toBe("low");
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).toContain("WEATHER_PROVIDER_ERROR"); // Met Office HTTP 503
    expect(codes).toContain("WEATHER_PROVIDER_TIMEOUT"); // Open-Meteo hung
    expect(codes).toContain("WEATHER_PROVIDER_FALLBACK"); // chain advanced
    expect(codes).toContain("WEATHER_AUTHORITY_LOW"); // OpenWeather succeeded
    const names = out.providers.map((p) => p.name);
    expect(names).toEqual(["met-office-datahub", "open-meteo", "openweather"]);
    // The Open-Meteo record reflects the timeout outcome.
    const openMeteoRecord = out.providers.find((p) => p.name === "open-meteo");
    expect(openMeteoRecord.status).toBe("timeout");
    expect(openMeteoRecord.fields_supplied).toEqual([]);
  });

  test("Met Office error + Open-Meteo error + OpenWeather error → deterministic fallback", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse({}, 503),
      openMeteo: jsonResponse({}, 502),
      openWeather: jsonResponse({}, 401),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, { fetchImpl });
    expect(out.provider).toBe("deterministic-fallback");
    expect(out.authority).toBe("low");
    const codes = out.data_quality.map((q) => q.code);
    // Each upstream provider emits its own WEATHER_PROVIDER_ERROR code.
    expect(codes.filter((c) => c === "WEATHER_PROVIDER_ERROR").length).toBe(3);
    expect(codes).toContain("WEATHER_PROVIDER_FALLBACK");
    expect(codes).toContain("WEATHER_AUTHORITY_LOW");
    // Backwards-compatible shape preserved on full-error fallback.
    expect(out.temperature.unit).toBe("°C");
    expect(out.summary).toMatch(/unavailable|fallback/i);
  });

  test("Met Office error + Open-Meteo error + OpenWeather timeout → deterministic fallback", async () => {
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    process.env.OPENWEATHER_API_KEY = "test-ow-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse({}, 503),
      openMeteo: jsonResponse({}, 502),
      openWeather: new Promise(() => {}), // hang only OpenWeather
    });
    const out = await weatherService.getClimateData(51.5, -0.1, {
      fetchImpl,
      providerTimeoutMs: 25,
    });
    expect(out.provider).toBe("deterministic-fallback");
    expect(out.authority).toBe("low");
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).toContain("WEATHER_PROVIDER_TIMEOUT");
    expect(codes).toContain("WEATHER_PROVIDER_FALLBACK");
    expect(codes).toContain("WEATHER_AUTHORITY_LOW");
    const owRecord = out.providers.find((p) => p.name === "openweather");
    expect(owRecord.status).toBe("timeout");
    // Deterministic-fallback record present and marked ok with full fields.
    const fallbackRecord = out.providers.find(
      (p) => p.name === "deterministic-fallback",
    );
    expect(fallbackRecord.status).toBe("ok");
    expect(fallbackRecord.fields_supplied).toEqual(
      expect.arrayContaining([
        "temperature",
        "wind",
        "precipitation",
        "climateZone",
      ]),
    );
  });

  test("Met Office success + Open-Meteo timeout never invoked (chain stops at first success)", async () => {
    // Sanity: a hanging Open-Meteo mock should not affect a Met Office success
    // because the chain must short-circuit.
    process.env.METOFFICE_DATAHUB_API_KEY = "test-mo-key";
    const fetchImpl = chainFetch({
      metOffice: jsonResponse(SAMPLE_METOFFICE_TIMESERIES),
      openMeteo: new Promise(() => {}),
    });
    const out = await weatherService.getClimateData(51.5, -0.1, {
      fetchImpl,
      providerTimeoutMs: 25,
    });
    expect(out.provider).toBe("met-office-datahub");
    expect(out.providers).toHaveLength(1);
    const codes = out.data_quality.map((q) => q.code);
    expect(codes).not.toContain("WEATHER_PROVIDER_TIMEOUT");
    expect(codes).not.toContain("WEATHER_PROVIDER_FALLBACK");
  });
});
