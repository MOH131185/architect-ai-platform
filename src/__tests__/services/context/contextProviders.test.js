import { fetchPlanningHeritageFlags } from "../../../services/context/providers/planningDataClient.js";
import { fetchFloodRisk } from "../../../services/context/providers/floodMapClient.js";
import { fetchNeighbouringContext } from "../../../services/context/providers/overpassClient.js";
import {
  fetchBuildingFootprints,
  fetchOsNgdContext,
} from "../../../services/context/providers/osNgdClient.js";
import { enrichSiteContext } from "../../../services/context/contextAggregator.js";

function mockJsonFetch(map) {
  return jest.fn(async (url) => {
    for (const [pattern, response] of Object.entries(map)) {
      if (url.includes(pattern)) {
        return {
          ok: response.status ? response.status < 400 : true,
          status: response.status || 200,
          json: async () => response.body,
        };
      }
    }
    throw new Error(`mockJsonFetch: no match for ${url}`);
  });
}

describe("planningDataClient", () => {
  test("returns confidence 0 when no fetch is available", async () => {
    const out = await fetchPlanningHeritageFlags({
      lat: 51.5,
      lon: -0.1,
      fetchImpl: null,
    });
    expect(out.heritage_flags).toEqual([]);
    expect(out.sources[0].envelope.confidence).toBe(0);
    expect(out.sources[0].envelope.error).toBe("no-fetch-available");
  });

  test("merges conservation-area + listed-building entities into heritage_flags", async () => {
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": {
        body: {
          entities: [{ entity: 100, name: "Islington CA" }],
        },
      },
      "dataset=listed-building": {
        body: {
          entities: [{ entity: 200, name: "201 Upper Street", grade: "II" }],
        },
      },
    });
    const out = await fetchPlanningHeritageFlags({
      lat: 51.5416,
      lon: -0.1022,
      fetchImpl,
    });
    expect(out.heritage_flags.length).toBe(2);
    expect(out.heritage_flags[0].type).toBe("conservation_area");
    expect(out.heritage_flags[1].type).toBe("listed_building");
    expect(out.heritage_flags[1].grade).toBe("II");
  });

  test("returns error envelope on non-200 response", async () => {
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": { status: 503, body: {} },
      "dataset=listed-building": { status: 503, body: {} },
    });
    const out = await fetchPlanningHeritageFlags({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.heritage_flags).toEqual([]);
    expect(out.sources[0].envelope.error).toMatch(/HTTP 503/);
  });
});

describe("floodMapClient", () => {
  test("returns 'low' status when EA returns no flood areas", async () => {
    const fetchImpl = mockJsonFetch({
      floodAreas: { body: { items: [] } },
    });
    const out = await fetchFloodRisk({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.flood_risk.status).toBe("low");
    expect(out.flood_risk.confidence).toBeGreaterThan(0);
  });

  test("returns 'monitored' status with named areas when EA returns hits", async () => {
    const fetchImpl = mockJsonFetch({
      floodAreas: {
        body: {
          items: [
            { label: "River Lea Lower", fwdCode: "012WA1" },
            { label: "Hertford Brook", fwdCode: "012WA2" },
          ],
        },
      },
    });
    const out = await fetchFloodRisk({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.flood_risk.status).toBe("monitored");
    expect(out.flood_risk.monitored_area_names).toEqual(
      expect.arrayContaining(["River Lea Lower", "Hertford Brook"]),
    );
  });

  test("propagates network error gracefully", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const out = await fetchFloodRisk({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.flood_risk.status).toBe("unknown");
    expect(out.flood_risk.error).toMatch(/ECONNRESET/);
  });
});

describe("overpassClient", () => {
  test("estimates building heights from OSM tags", async () => {
    const fetchImpl = mockJsonFetch({
      "overpass-api": {
        body: {
          elements: [
            {
              id: 1,
              center: { lat: 51.5, lon: -0.1 },
              tags: { building: "yes", height: "12.5" },
            },
            {
              id: 2,
              center: { lat: 51.5, lon: -0.1 },
              tags: { building: "residential", "building:levels": "4" },
            },
            {
              id: 3,
              center: { lat: 51.5, lon: -0.1 },
              tags: { building: "yes" }, // no height
            },
          ],
        },
      },
    });
    const out = await fetchNeighbouringContext({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.neighbouring_buildings.length).toBe(3);
    expect(out.neighbouring_buildings[0].height_m).toBeCloseTo(12.5);
    expect(out.neighbouring_buildings[1].height_m).toBeCloseTo(12); // 4 levels × 3 m
    expect(out.context_height_stats.sample_count).toBe(2);
    expect(out.context_height_stats.median_m).toBeGreaterThan(0);
  });
});

describe("enrichSiteContext", () => {
  test("offline default returns site untouched plus a CONTEXT_PROVIDERS_OFFLINE flag", async () => {
    const baseSite = {
      lat: 51.5,
      lon: -0.1,
      data_quality: [{ code: "SITE_BOUNDARY_PROVIDED" }],
      heritage_flags: [],
    };
    const enriched = await enrichSiteContext(baseSite, {});
    expect(enriched.heritage_flags).toEqual([]);
    expect(
      enriched.data_quality.find((q) => q.code === "CONTEXT_PROVIDERS_OFFLINE"),
    ).toBeTruthy();
  });

  test("activated path with successful providers does NOT carry CONTEXT_PROVIDERS_OFFLINE", async () => {
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": { body: { entities: [] } },
      "dataset=listed-building": { body: { entities: [] } },
      floodAreas: { body: { items: [] } },
      "overpass-api": { body: { elements: [] } },
    });
    const baseSite = {
      lat: 51.5,
      lon: -0.1,
      data_quality: [],
      heritage_flags: [],
    };
    const enriched = await enrichSiteContext(baseSite, { fetchImpl });
    const offline = enriched.data_quality.find(
      (q) => q.code === "CONTEXT_PROVIDERS_OFFLINE",
    );
    expect(offline).toBeUndefined();
  });

  test("merges provider results into site context when fetch is supplied", async () => {
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": {
        body: { entities: [{ entity: 100, name: "Islington CA" }] },
      },
      "dataset=listed-building": { body: { entities: [] } },
      floodAreas: { body: { items: [] } },
      "overpass-api": {
        body: {
          elements: [{ id: 1, tags: { building: "yes", height: "10" } }],
        },
      },
    });
    const baseSite = {
      lat: 51.5416,
      lon: -0.1022,
      data_quality: [],
      heritage_flags: [],
      neighbouring_buildings: [],
      context_height_stats: {},
    };
    const enriched = await enrichSiteContext(baseSite, { fetchImpl });
    expect(enriched.heritage_flags.length).toBe(1);
    expect(enriched.heritage_flags[0].type).toBe("conservation_area");
    expect(enriched.flood_risk.status).toBe("low");
    expect(enriched.neighbouring_buildings.length).toBe(1);
    const dqCodes = enriched.data_quality.map((q) => q.code);
    expect(dqCodes).toEqual(
      expect.arrayContaining([
        "PLANNING_DATA_CONSERVATION_AREA_OK",
        "EA_FLOOD_LOOKUP_OK",
        "OSM_OVERPASS_OK",
      ]),
    );
  });

  test("emits warnings when providers fail without throwing", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("timeout");
    });
    const baseSite = {
      lat: 51.5,
      lon: -0.1,
      data_quality: [],
      heritage_flags: [],
    };
    const enriched = await enrichSiteContext(baseSite, { fetchImpl });
    const warnCodes = enriched.data_quality
      .filter((q) => q.severity === "warning")
      .map((q) => q.code);
    expect(warnCodes).toEqual(
      expect.arrayContaining(["EA_FLOOD_LOOKUP_ERROR", "OSM_OVERPASS_ERROR"]),
    );
  });

  test("per-provider timeout emits *_TIMEOUT warnings and does NOT fail the slice", async () => {
    // A fetch that never resolves; settleWithin should bound it and emit
    // *_TIMEOUT codes for every provider that actually attempted fetch.
    // OS MasterMap and OS NGD both require their respective env keys to
    // attempt fetch — we set both so all five providers exercise the
    // timeout path.
    const originalMmKey = process.env.OS_MASTERMAP_API_KEY;
    const originalNgdKey = process.env.OS_NGD_API_KEY;
    process.env.OS_MASTERMAP_API_KEY = "test-os-mastermap-key";
    process.env.OS_NGD_API_KEY = "test-os-ngd-key";
    try {
      const fetchImpl = jest.fn(
        () => new Promise(() => {}), // hang forever
      );
      const baseSite = {
        lat: 51.5,
        lon: -0.1,
        data_quality: [],
        heritage_flags: [],
      };
      const enriched = await enrichSiteContext(baseSite, {
        fetchImpl,
        providerTimeoutMs: 25,
      });
      const codes = enriched.data_quality.map((q) => q.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          "PLANNING_DATA_TIMEOUT",
          "EA_FLOOD_LOOKUP_TIMEOUT",
          "OS_MASTERMAP_TIMEOUT",
          "OS_NGD_TIMEOUT",
          "OSM_OVERPASS_TIMEOUT",
        ]),
      );
      // Slice did not throw and returned a usable site object.
      expect(enriched.heritage_flags).toEqual([]);
      expect(enriched.providers).toEqual(expect.any(Array));
      expect(enriched.providers.every((p) => p.status === "timeout")).toBe(
        true,
      );
    } finally {
      if (originalMmKey === undefined) {
        delete process.env.OS_MASTERMAP_API_KEY;
      } else {
        process.env.OS_MASTERMAP_API_KEY = originalMmKey;
      }
      if (originalNgdKey === undefined) {
        delete process.env.OS_NGD_API_KEY;
      } else {
        process.env.OS_NGD_API_KEY = originalNgdKey;
      }
    }
  });

  test("provenance manifest carries name + authority + fetched_at + status for every provider", async () => {
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": {
        body: { entities: [{ entity: 1, name: "Test CA" }] },
      },
      "dataset=listed-building": { body: { entities: [] } },
      floodAreas: { body: { items: [] } },
      "overpass-api": {
        body: {
          elements: [{ id: 1, tags: { building: "yes", height: "10" } }],
        },
      },
    });
    const baseSite = {
      lat: 51.5,
      lon: -0.1,
      data_quality: [],
      heritage_flags: [],
    };
    const enriched = await enrichSiteContext(baseSite, { fetchImpl });
    expect(enriched.providers).toEqual(expect.any(Array));
    const names = enriched.providers.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "planning.data.gov.uk",
        "environment-agency-flood-monitoring",
        "os-mastermap-building-heights",
        "os-ngd-buildings",
        "openstreetmap-overpass",
      ]),
    );
    for (const p of enriched.providers) {
      expect(typeof p.name).toBe("string");
      expect(["high", "medium", "low"]).toContain(p.authority);
      expect(["ok", "error", "timeout", "not_used"]).toContain(p.status);
      expect(p).toHaveProperty("fetched_at");
      expect(Array.isArray(p.fields_supplied)).toBe(true);
    }
    // No factual provider may be branded as OpenAI / GPT.
    expect(enriched.providers.some((p) => /openai|gpt/i.test(p.name))).toBe(
      false,
    );
  });

  test("browser-runtime guard refuses to invoke providers", async () => {
    // Simulate a real browser runtime: jsdom already defines window+document;
    // we strip process.versions.node so isRealBrowserRuntime() returns true.
    const originalNode = process.versions.node;
    Object.defineProperty(process.versions, "node", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const fetchImpl = jest.fn(async () => {
        throw new Error("network fetch must not be called in browser guard");
      });
      const baseSite = {
        lat: 51.5,
        lon: -0.1,
        data_quality: [],
        heritage_flags: [],
      };
      const enriched = await enrichSiteContext(baseSite, { fetchImpl });
      expect(
        enriched.data_quality.find(
          (q) => q.code === "CONTEXT_PROVIDERS_BROWSER_GUARD",
        ),
      ).toBeTruthy();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.versions, "node", {
        value: originalNode,
        configurable: true,
        writable: true,
      });
    }
  });
});

// ----- OS NGD building footprints (Phase 2a) ----------------------------------

function ngdSampleFeature(id, height, originLat, originLon) {
  // Tiny ~5m square ring around (originLat, originLon).
  const d = 0.00005;
  return {
    id,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [originLon - d, originLat - d],
          [originLon + d, originLat - d],
          [originLon + d, originLat + d],
          [originLon - d, originLat + d],
          [originLon - d, originLat - d],
        ],
      ],
    },
    properties: {
      osid: id,
      relativeheightmaximum: height,
      description: "residential",
    },
  };
}

describe("osNgdClient", () => {
  const originalKey = process.env.OS_NGD_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OS_NGD_API_KEY;
    else process.env.OS_NGD_API_KEY = originalKey;
  });

  test("returns empty envelope with reason when OS_NGD_API_KEY absent", async () => {
    delete process.env.OS_NGD_API_KEY;
    const fetchImpl = jest.fn();
    const out = await fetchBuildingFootprints({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.data).toBeNull();
    expect(out.error).toBe("no-os-ngd-key");
    expect(out.confidence).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("normalises NGD GeoJSON features into building polygons + heights", async () => {
    process.env.OS_NGD_API_KEY = "test-os-ngd-key";
    const fetchImpl = mockJsonFetch({
      "api.os.uk/features/ngd": {
        body: {
          features: [
            ngdSampleFeature("osid-1", 9, 51.5, -0.1),
            ngdSampleFeature("osid-2", 12, 51.5, -0.1),
          ],
        },
      },
    });
    const out = await fetchOsNgdContext({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.building_footprints).toHaveLength(2);
    expect(out.building_footprints[0].outline_polygon.length).toBeGreaterThan(
      3,
    );
    expect(out.building_footprints[0].height_m).toBe(9);
    expect(out.building_footprints[0].storey_count_estimated).toBeGreaterThan(
      0,
    );
    expect(out.neighbouring_buildings.length).toBe(2);
    expect(out.context_height_stats.sample_count).toBe(2);
    expect(out.envelope.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("propagates HTTP error gracefully", async () => {
    process.env.OS_NGD_API_KEY = "test-os-ngd-key";
    const fetchImpl = mockJsonFetch({
      "api.os.uk/features/ngd": { status: 503, body: {} },
    });
    const out = await fetchBuildingFootprints({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.data).toBeNull();
    expect(out.error).toMatch(/HTTP 503/);
  });
});

describe("enrichSiteContext + OS NGD", () => {
  const originalKey = process.env.OS_NGD_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OS_NGD_API_KEY;
    else process.env.OS_NGD_API_KEY = originalKey;
  });

  test("OS_NGD_API_KEY absent -> OS_NGD_NOT_USED, slice still completes", async () => {
    delete process.env.OS_NGD_API_KEY;
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": { body: { entities: [] } },
      "dataset=listed-building": { body: { entities: [] } },
      floodAreas: { body: { items: [] } },
      "overpass-api": { body: { elements: [] } },
    });
    const enriched = await enrichSiteContext(
      { lat: 51.5, lon: -0.1, data_quality: [], heritage_flags: [] },
      { fetchImpl },
    );
    const codes = enriched.data_quality.map((q) => q.code);
    expect(codes).toContain("OS_NGD_NOT_USED");
    expect(codes).not.toContain("OS_NGD_TIMEOUT");
    expect(codes).not.toContain("OS_NGD_ERROR");
    const ngdProvider = enriched.providers.find(
      (p) => p.name === "os-ngd-buildings",
    );
    expect(ngdProvider).toBeDefined();
    expect(ngdProvider.status).toBe("not_used");
    expect(ngdProvider.authority).toBe("high");
    expect(ngdProvider.fields_supplied).toEqual([]);
  });

  test("successful OS NGD response -> OS_NGD_OK, populates neighbouring_buildings + building_footprints", async () => {
    process.env.OS_NGD_API_KEY = "test-os-ngd-key";
    const fetchImpl = mockJsonFetch({
      "dataset=conservation-area": { body: { entities: [] } },
      "dataset=listed-building": { body: { entities: [] } },
      floodAreas: { body: { items: [] } },
      "overpass-api": { body: { elements: [] } },
      "api.os.uk/features/ngd": {
        body: {
          features: [
            ngdSampleFeature("osid-A", 10, 51.5, -0.1),
            ngdSampleFeature("osid-B", 14, 51.5, -0.1),
            ngdSampleFeature("osid-C", 18, 51.5, -0.1),
          ],
        },
      },
    });
    const enriched = await enrichSiteContext(
      {
        lat: 51.5,
        lon: -0.1,
        data_quality: [],
        heritage_flags: [],
        neighbouring_buildings: [],
      },
      { fetchImpl },
    );
    const codes = enriched.data_quality.map((q) => q.code);
    expect(codes).toContain("OS_NGD_OK");
    expect(enriched.building_footprints).toHaveLength(3);
    expect(enriched.building_footprints[0]).toEqual(
      expect.objectContaining({
        source: "os-ngd-buildings",
        height_m: expect.any(Number),
        outline_polygon: expect.any(Array),
      }),
    );
    expect(enriched.neighbouring_buildings.length).toBeGreaterThan(0);
    expect(enriched.neighbouring_buildings[0].source).toBe("os-ngd-buildings");
    const ngdProvider = enriched.providers.find(
      (p) => p.name === "os-ngd-buildings",
    );
    expect(ngdProvider.status).toBe("ok");
    expect(ngdProvider.fields_supplied).toEqual(
      expect.arrayContaining([
        "building_footprints",
        "neighbouring_buildings",
        "context_height_stats",
      ]),
    );
    // OS MasterMap and OSM should NOT also claim neighbouring_buildings —
    // OS NGD is the highest authority and supplied them.
    const mmProvider = enriched.providers.find(
      (p) => p.name === "os-mastermap-building-heights",
    );
    const osmProvider = enriched.providers.find(
      (p) => p.name === "openstreetmap-overpass",
    );
    expect(mmProvider.fields_supplied).not.toContain("neighbouring_buildings");
    expect(osmProvider.fields_supplied).not.toContain("neighbouring_buildings");
  });

  test("OS NGD timeout emits OS_NGD_TIMEOUT warning without failing the slice", async () => {
    process.env.OS_NGD_API_KEY = "test-os-ngd-key";
    const fetchImpl = jest.fn((url) => {
      if (url.includes("api.os.uk/features/ngd")) {
        return new Promise(() => {}); // hang OS NGD only
      }
      // Return a plausible empty response for all other providers.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });
    const enriched = await enrichSiteContext(
      { lat: 51.5, lon: -0.1, data_quality: [], heritage_flags: [] },
      { fetchImpl, providerTimeoutMs: 25 },
    );
    const codes = enriched.data_quality.map((q) => q.code);
    expect(codes).toContain("OS_NGD_TIMEOUT");
    const ngdProvider = enriched.providers.find(
      (p) => p.name === "os-ngd-buildings",
    );
    expect(ngdProvider.status).toBe("timeout");
    // Slice still produces a usable site object.
    expect(enriched.building_footprints).toEqual([]);
  });
});
