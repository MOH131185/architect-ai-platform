/**
 * Phase 5C — `/api/site/boundary` proxy tests.
 *
 * All tests use mocked Overpass responses. NO live external calls. The
 * fixtures are deliberately small and fictional — they prove the
 * normalisation, fallback, and cache logic without depending on real
 * OSM data or current Cherish House polygon shape (manual smoke only).
 */

import {
  resolveBoundaryRequest,
  __testing,
} from "../../../api/site/boundary.js";
import {
  buildBoundaryResponse,
  buildEmptyResponse,
  selectBestOverpassWay,
  polygonAreaM2,
  polygonContainsPoint,
  hashBoundaryShape,
  BOUNDARY_SOURCE,
  PROXY_RESPONSE_SCHEMA_VERSION,
} from "../../../api/site/_lib/boundaryNormalize.js";
import {
  buildBuildingQuery,
  buildParcelQuery,
  runOverpassQuery,
  fetchBuildingAndParcel,
  OverpassRateLimitError,
  OverpassTimeoutError,
} from "../../../api/site/_lib/overpassClient.js";

const POINT = { lat: 52.4722, lng: -1.8839 }; // Bradford St area, but fictional polygon
const OVERPASS_ONLY = { enableTitleBoundaryLookup: false };

function makeBuildingWay(id, points, tags = {}) {
  return {
    type: "way",
    id,
    geometry: points.map(([lat, lng]) => ({ lat, lon: lng })),
    tags: { building: "yes", ...tags },
  };
}

function makeOverpassResponse(elements) {
  return new Response(JSON.stringify({ version: 0.6, elements }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function clearProxyCache() {
  __testing.cache.clear();
}

beforeEach(() => {
  clearProxyCache();
});

describe("api/site/boundary — request validation", () => {
  test("rejects invalid lat/lng", async () => {
    const r = await resolveBoundaryRequest({ lat: "abc", lng: -1.88 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_lat_lng");
  });

  test("rejects out-of-range lat/lng", async () => {
    const r = await resolveBoundaryRequest({ lat: 100, lng: 0 });
    expect(r.status).toBe(400);
  });
});

describe("api/site/boundary — Overpass success path", () => {
  test("returns authoritative polygon when building contains the point", async () => {
    const containingBuilding = makeBuildingWay(
      111,
      [
        [52.4721, -1.884],
        [52.4721, -1.8838],
        [52.4723, -1.8838],
        [52.4723, -1.884],
      ],
      { "addr:housenumber": "97", "addr:street": "Bradford St" },
    );
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(makeOverpassResponse([containingBuilding]))
      .mockResolvedValueOnce(makeOverpassResponse([])); // parcel query empty

    const r = await resolveBoundaryRequest({
      ...OVERPASS_ONLY,
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });

    expect(r.status).toBe(200);
    expect(r.body.schemaVersion).toBe(PROXY_RESPONSE_SCHEMA_VERSION);
    expect(r.body.polygon).toBeTruthy();
    expect(r.body.polygon).toHaveLength(4);
    expect(r.body.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS);
    expect(r.body.confidence).toBeGreaterThan(0.9);
    expect(r.body.boundaryAuthoritative).toBe(true);
    expect(r.body.areaM2).toBeGreaterThan(0);
    expect(r.body.surfaceAreaM2).toBe(r.body.areaM2);
    expect(r.body.perimeterM).toBeGreaterThan(0);
    expect(r.body.segments).toHaveLength(4);
    expect(r.body.angles).toHaveLength(4);
    expect(r.body.metadata.siteMetrics.segmentCount).toBe(4);
    expect(r.body.metadata.osmId).toBe(111);
    expect(r.body.metadata.addrHousenumber).toBe("97");
    expect(r.body.metadata.addrStreet).toBe("Bradford St");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("nearest building (≤ 25 m) is returned as non-authoritative", async () => {
    // Building offset ~11 m N of the query point (centroid distance),
    // not containing it. Polygon spans 52.47227 → 52.47233 latitude.
    const nearbyBuilding = makeBuildingWay(222, [
      [52.47227, -1.884],
      [52.47227, -1.8838],
      [52.47233, -1.8838],
      [52.47233, -1.884],
    ]);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(makeOverpassResponse([nearbyBuilding]))
      .mockResolvedValueOnce(makeOverpassResponse([]));

    const r = await resolveBoundaryRequest({
      ...OVERPASS_ONLY,
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.polygon).toBeTruthy();
    expect(r.body.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST);
    expect(r.body.confidence).toBeGreaterThan(0.5);
    expect(r.body.confidence).toBeLessThan(0.9);
    expect(r.body.boundaryAuthoritative).toBe(false);
  });
});

describe("api/site/boundary — empty / fallback paths", () => {
  test("returns polygon=null when Overpass returns no elements", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(makeOverpassResponse([]))
      .mockResolvedValueOnce(makeOverpassResponse([]));

    const r = await resolveBoundaryRequest({
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.polygon).toBeNull();
    expect(r.body.source).toBeNull();
    expect(r.body.boundaryAuthoritative).toBe(false);
    expect(r.body.areaM2).toBe(0);
    expect(r.body.metadata.reason).toBe("no_polygon_found");
  });

  test("returns polygon=null when Overpass times out (AbortError)", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchImpl = jest.fn().mockRejectedValue(abortErr);

    const r = await resolveBoundaryRequest({
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.polygon).toBeNull();
    expect(r.body.boundaryAuthoritative).toBe(false);
    expect(r.body.metadata.reason).toBe("overpass_timeout");
  });

  test("returns polygon=null when Overpass rate-limits (429)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response("Too Many Requests", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const r = await resolveBoundaryRequest({
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.polygon).toBeNull();
    expect(r.body.metadata.reason).toBe("overpass_rate_limited");
  });

  test("returns polygon=null on malformed Overpass JSON", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const r = await resolveBoundaryRequest({
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.polygon).toBeNull();
    expect(r.body.metadata.reason).toBe("overpass_unavailable");
  });

  test("never claims authoritative for empty / errored responses", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response("", { status: 503 }));
    const r = await resolveBoundaryRequest({
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: false,
    });
    expect(r.body.polygon).toBeNull();
    expect(r.body.boundaryAuthoritative).toBe(false);
    expect(r.body.confidence).toBe(0);
  });
});

describe("api/site/boundary — caching", () => {
  test("second identical request is served from in-memory cache", async () => {
    const containingBuilding = makeBuildingWay(333, [
      [52.4721, -1.884],
      [52.4721, -1.8838],
      [52.4723, -1.8838],
      [52.4723, -1.884],
    ]);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(makeOverpassResponse([containingBuilding]))
      .mockResolvedValueOnce(makeOverpassResponse([]));

    const first = await resolveBoundaryRequest({
      ...OVERPASS_ONLY,
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: true,
    });
    expect(first.body.cached).toBe(false);
    expect(first.body.polygon).toBeTruthy();

    // Cached call: no further fetch invocations
    const second = await resolveBoundaryRequest({
      ...OVERPASS_ONLY,
      lat: POINT.lat,
      lng: POINT.lng,
      fetchImpl,
      useCache: true,
    });
    expect(second.body.cached).toBe(true);
    expect(second.body.hash).toBe(first.body.hash);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("cache key changes with rounded lat/lng", () => {
    const k1 = __testing.cacheKey({
      lat: 52.4722,
      lng: -1.8839,
      buildingRadiusM: 30,
      parcelRadiusM: 50,
    });
    const k2 = __testing.cacheKey({
      lat: 52.4723,
      lng: -1.8839,
      buildingRadiusM: 30,
      parcelRadiusM: 50,
    });
    expect(k1).not.toBe(k2);
  });
});

describe("api/site/boundary — pure helpers", () => {
  test("polygonContainsPoint detects containment", () => {
    const square = [
      { lat: 52.0, lng: -1.0 },
      { lat: 52.0, lng: -0.99 },
      { lat: 52.01, lng: -0.99 },
      { lat: 52.01, lng: -1.0 },
    ];
    expect(polygonContainsPoint(square, { lat: 52.005, lng: -0.995 })).toBe(
      true,
    );
    expect(polygonContainsPoint(square, { lat: 52.05, lng: -0.5 })).toBe(false);
  });

  test("polygonAreaM2 returns positive area for a small UK plot", () => {
    const square = [
      { lat: 52.0, lng: -1.0 },
      { lat: 52.0, lng: -0.99 },
      { lat: 52.01, lng: -0.99 },
      { lat: 52.01, lng: -1.0 },
    ];
    const a = polygonAreaM2(square);
    expect(a).toBeGreaterThan(100_000);
    expect(a).toBeLessThan(2_000_000);
  });

  test("hashBoundaryShape is deterministic and source-sensitive", () => {
    const polygon = [
      { lat: 52, lng: -1 },
      { lat: 52, lng: -0.99 },
      { lat: 52.01, lng: -0.99 },
    ];
    const h1 = hashBoundaryShape({
      polygon,
      source: BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS,
    });
    const h2 = hashBoundaryShape({
      polygon,
      source: BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS,
    });
    const h3 = hashBoundaryShape({
      polygon,
      source: BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST,
    });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(typeof h1).toBe("string");
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });

  test("buildBoundaryResponse returns empty shape when polygon is short", () => {
    const r = buildBoundaryResponse({
      polygon: [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
      source: BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS,
    });
    expect(r.polygon).toBeNull();
    expect(r.source).toBeNull();
    expect(r.boundaryAuthoritative).toBe(false);
  });

  test("selectBestOverpassWay prefers a containing building over a nearby one", () => {
    const containingBuilding = makeBuildingWay(1, [
      [52.4721, -1.884],
      [52.4721, -1.8838],
      [52.4723, -1.8838],
      [52.4723, -1.884],
    ]);
    const farBuilding = makeBuildingWay(2, [
      [52.5, -1.0],
      [52.5, -0.99],
      [52.51, -0.99],
    ]);
    const best = selectBestOverpassWay({
      buildingElements: [farBuilding, containingBuilding],
      parcelElements: [],
      point: POINT,
    });
    expect(best?.element?.id).toBe(1);
    expect(best?.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS);
  });

  // Regression: 17 Kensington Rd DN15 8BQ — UK terraced house ~67 m² where
  // OS/OSM treats the whole row as one ~1260 m² building polygon. Returning
  // that polygon as the user's site boundary mis-sets area by ~19x. The
  // selector must reject the oversized candidate so the caller can surface
  // a "please draw" prompt instead of an authoritative-looking wrong shape.
  test("selectBestOverpassWay rejects an oversized building polygon (terrace block)", () => {
    // ~40 m × 30 m polygon centred on POINT → ~1200 m² (well above 600 m²
    // RESIDENTIAL_BUILDING_MAX_M2 threshold). At lat 52.4722, 1° lat ≈ 111 km
    // and 1° lng ≈ 67.6 km, so 0.00018° lat ≈ 20 m and 0.00022° lng ≈ 15 m.
    const oversizedTerrace = makeBuildingWay(99, [
      [52.4722 - 0.00018, -1.8839 - 0.00022],
      [52.4722 - 0.00018, -1.8839 + 0.00022],
      [52.4722 + 0.00018, -1.8839 + 0.00022],
      [52.4722 + 0.00018, -1.8839 - 0.00022],
    ]);
    const best = selectBestOverpassWay({
      buildingElements: [oversizedTerrace],
      parcelElements: [],
      point: POINT,
    });
    expect(best).toBeNull();
  });

  test("selectBestOverpassWay falls through oversized building to a plausible neighbour", () => {
    const oversizedTerrace = makeBuildingWay(99, [
      [52.4722 - 0.00018, -1.8839 - 0.00022],
      [52.4722 - 0.00018, -1.8839 + 0.00022],
      [52.4722 + 0.00018, -1.8839 + 0.00022],
      [52.4722 + 0.00018, -1.8839 - 0.00022],
    ]);
    // Plausible ~7 m × 7 m house (~49 m²) ~10 m east of POINT, well within
    // the 25 m nearest-fallback radius and well under 600 m².
    const eastLngOffset = 10 / 67_600; // ~10 m east
    const smallNeighbour = makeBuildingWay(
      100,
      [
        [52.4722 - 0.00003, -1.8839 + eastLngOffset - 0.00005],
        [52.4722 - 0.00003, -1.8839 + eastLngOffset + 0.00005],
        [52.4722 + 0.00003, -1.8839 + eastLngOffset + 0.00005],
        [52.4722 + 0.00003, -1.8839 + eastLngOffset - 0.00005],
      ],
      { building: "house" },
    );
    const best = selectBestOverpassWay({
      buildingElements: [oversizedTerrace, smallNeighbour],
      parcelElements: [],
      point: POINT,
    });
    expect(best?.element?.id).toBe(100);
    expect(best?.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST);
  });
});

describe("api/site/boundary — Overpass query construction", () => {
  test("buildBuildingQuery embeds lat/lng and radius", () => {
    const q = buildBuildingQuery({ lat: 52, lng: -1, radiusM: 25 });
    expect(q).toContain("around:25,52,-1");
    expect(q).toContain('way["building"]');
  });

  test("buildParcelQuery embeds lat/lng and radius", () => {
    const q = buildParcelQuery({ lat: 52, lng: -1, radiusM: 60 });
    expect(q).toContain("around:60,52,-1");
    expect(q).toContain('way["landuse"]');
  });
});

describe("api/site/boundary — runOverpassQuery low-level", () => {
  test("retries once on 5xx and succeeds on second attempt", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(makeOverpassResponse([]));

    const result = await runOverpassQuery({
      query: "[out:json];out;",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.elements).toEqual([]);
  });

  test("throws OverpassRateLimitError on 429 (no retry)", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      runOverpassQuery({ query: "[out:json];out;", fetchImpl }),
    ).rejects.toBeInstanceOf(OverpassRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("throws OverpassTimeoutError when fetch aborts", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchImpl = jest.fn().mockRejectedValue(abortErr);
    await expect(
      runOverpassQuery({ query: "[out:json];out;", fetchImpl }),
    ).rejects.toBeInstanceOf(OverpassTimeoutError);
  });

  test("fetchBuildingAndParcel returns both error fields without throwing when one query fails", async () => {
    const fetchImpl = jest
      .fn()
      // building OK
      .mockResolvedValueOnce(makeOverpassResponse([{ type: "way", id: 1 }]))
      // parcel 503 then 503 again (retry exhausted; throws)
      .mockResolvedValue(new Response("", { status: 503 }));

    const result = await fetchBuildingAndParcel({
      lat: 52,
      lng: -1,
      fetchImpl,
    });
    expect(result.buildingElements).toHaveLength(1);
    expect(result.parcelError).toBeTruthy();
  });
});

describe("api/site/boundary — buildEmptyResponse shape", () => {
  test("documents the no-polygon shape callers depend on", () => {
    const r = buildEmptyResponse({ reason: "no_polygon_found" });
    expect(r.polygon).toBeNull();
    expect(r.source).toBeNull();
    expect(r.boundaryAuthoritative).toBe(false);
    expect(r.confidence).toBe(0);
    expect(r.areaM2).toBe(0);
    expect(r.schemaVersion).toBe(PROXY_RESPONSE_SCHEMA_VERSION);
  });
});
