import {
  fetchBuildingHeights,
  fetchOsHeightContext,
} from "../../../services/context/providers/osMastermapClient.js";

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
    throw new Error(`mock: no match for ${url}`);
  });
}

describe("osMastermapClient", () => {
  const previousKey = process.env.OS_MASTERMAP_API_KEY;
  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.OS_MASTERMAP_API_KEY;
    } else {
      process.env.OS_MASTERMAP_API_KEY = previousKey;
    }
  });

  test("returns no-os-mastermap-key when no env var or apiKey is supplied", async () => {
    delete process.env.OS_MASTERMAP_API_KEY;
    const out = await fetchBuildingHeights({
      lat: 51.5,
      lon: -0.1,
      fetchImpl: jest.fn(),
    });
    expect(out.confidence).toBe(0);
    expect(out.error).toBe("no-os-mastermap-key");
    expect(out.license_note).toMatch(/Ordnance Survey/i);
  });

  test("uses env OS_MASTERMAP_API_KEY when provided", async () => {
    process.env.OS_MASTERMAP_API_KEY = "test-key-123";
    const fetchImpl = mockJsonFetch({
      "api.os.uk": {
        body: {
          features: [
            {
              id: 1,
              properties: { RelHMax: 12.5, OSLandUseTier1: "Residential" },
            },
            {
              id: 2,
              properties: { Height: 8 },
            },
          ],
        },
      },
    });
    const out = await fetchBuildingHeights({
      lat: 51.5416,
      lon: -0.1022,
      fetchImpl,
    });
    expect(out.error).toBeNull();
    expect(out.data.length).toBe(2);
    expect(out.data[0].height_m).toBeCloseTo(12.5);
    expect(out.confidence).toBeGreaterThanOrEqual(0.9);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("key=test-key-123"),
      expect.any(Object),
    );
  });

  test("explicit apiKey override takes precedence over env", async () => {
    process.env.OS_MASTERMAP_API_KEY = "env-key";
    const fetchImpl = mockJsonFetch({
      "api.os.uk": { body: { features: [] } },
    });
    await fetchBuildingHeights({
      lat: 51.5,
      lon: -0.1,
      apiKey: "explicit-key",
      fetchImpl,
    });
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain("key=explicit-key");
    expect(calledUrl).not.toContain("key=env-key");
  });

  test("fetchOsHeightContext summarises building heights", async () => {
    process.env.OS_MASTERMAP_API_KEY = "test-key";
    const fetchImpl = mockJsonFetch({
      "api.os.uk": {
        body: {
          features: [
            { id: 1, properties: { RelHMax: 6 } },
            { id: 2, properties: { RelHMax: 9 } },
            { id: 3, properties: { RelHMax: 12 } },
          ],
        },
      },
    });
    const out = await fetchOsHeightContext({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.neighbouring_buildings.length).toBe(3);
    expect(out.context_height_stats.median_m).toBe(9);
    expect(out.context_height_stats.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("returns error envelope when OS API responds with non-200", async () => {
    process.env.OS_MASTERMAP_API_KEY = "test-key";
    const fetchImpl = mockJsonFetch({
      "api.os.uk": { status: 401, body: {} },
    });
    const out = await fetchBuildingHeights({
      lat: 51.5,
      lon: -0.1,
      fetchImpl,
    });
    expect(out.error).toMatch(/HTTP 401/);
    expect(out.confidence).toBe(0);
  });
});
