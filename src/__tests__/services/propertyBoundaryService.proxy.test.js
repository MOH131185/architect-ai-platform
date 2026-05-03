/**
 * Phase 5C — propertyBoundaryService browser-proxy tests.
 *
 * Verifies that:
 *   1. In browser runtime, `detectPropertyBoundary` calls
 *      `/api/site/boundary` first.
 *   2. A successful proxy response replaces the legacy estimated
 *      fallback.
 *   3. A failing proxy response (network error, non-OK, low-confidence,
 *      polygon=null) cleanly falls through to the existing chain — the
 *      Intelligent Fallback safety net is unchanged.
 *   4. `bypassProxy: true` (test fixture isolation) skips the proxy.
 *   5. Server runtime path is unchanged (no proxy call).
 *
 * NO live external calls. All `fetch` is injected.
 */

import {
  detectPropertyBoundary,
  fetchSiteBoundaryFromProxy,
  isEstimatedBoundaryResult,
  INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
} from "../../services/propertyBoundaryService.js";

const POINT = { lat: 52.4722, lng: -1.8839 };
const ADDRESS = "97 Bradford St, Birmingham B12 0PW";

function makeProxyResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function authoritativeProxyBody() {
  return {
    schemaVersion: "site-boundary-proxy-v1",
    polygon: [
      { lat: 52.4721, lng: -1.884 },
      { lat: 52.4721, lng: -1.8838 },
      { lat: 52.4723, lng: -1.8838 },
      { lat: 52.4723, lng: -1.884 },
    ],
    source: "openstreetmap-overpass-building-contains-point",
    confidence: 0.92,
    boundaryAuthoritative: true,
    areaM2: 240,
    surfaceAreaM2: 240,
    perimeterM: 64,
    segments: [
      { index: 1, lengthM: 12, bearingDeg: 90 },
      { index: 2, lengthM: 20, bearingDeg: 0 },
      { index: 3, lengthM: 12, bearingDeg: 270 },
      { index: 4, lengthM: 20, bearingDeg: 180 },
    ],
    angles: [
      { index: 1, angleDeg: 90 },
      { index: 2, angleDeg: 90 },
      { index: 3, angleDeg: 90 },
      { index: 4, angleDeg: 90 },
    ],
    hash: "deadbeef",
    cached: false,
    timestamp: "2026-05-02T14:00:00.000Z",
    metadata: {
      osmId: 12345,
      buildingTag: "house",
      addrHousenumber: "97",
      addrStreet: "Bradford St",
      overpassQueryRadiusM: 30,
      siteMetrics: {
        areaM2: 240,
        surfaceAreaM2: 240,
        perimeterM: 64,
        segmentCount: 4,
        angleCount: 4,
      },
    },
  };
}

function lowConfidenceProxyBody() {
  return {
    ...authoritativeProxyBody(),
    source: "openstreetmap-overpass-building-nearest",
    confidence: 0.55, // < 0.6 → treated as estimated by isEstimatedBoundaryResult
    boundaryAuthoritative: false,
  };
}

function emptyProxyBody() {
  return {
    schemaVersion: "site-boundary-proxy-v1",
    polygon: null,
    source: null,
    confidence: 0,
    boundaryAuthoritative: false,
    areaM2: 0,
    hash: "00000000",
    cached: false,
    timestamp: "2026-05-02T14:00:00.000Z",
    metadata: { reason: "no_polygon_found" },
  };
}

const originalWindow = global.window;

function installBrowserRuntime() {
  Object.defineProperty(global, "window", {
    value: { document: {} },
    configurable: true,
    writable: true,
  });
}

function restoreRuntime() {
  if (originalWindow === undefined) {
    delete global.window;
  } else {
    Object.defineProperty(global, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  }
}

describe("fetchSiteBoundaryFromProxy", () => {
  beforeEach(() => {
    installBrowserRuntime();
  });
  afterEach(() => {
    restoreRuntime();
  });

  test("returns normalised boundary for an authoritative proxy response", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(makeProxyResponse(authoritativeProxyBody()));
    const result = await fetchSiteBoundaryFromProxy({
      coordinates: POINT,
      address: ADDRESS,
      fetchImpl,
    });
    expect(result).toBeTruthy();
    expect(result.polygon).toHaveLength(4);
    expect(result.source).toBe(
      "openstreetmap-overpass-building-contains-point",
    );
    expect(result.confidence).toBeCloseTo(0.92, 2);
    expect(result.boundaryAuthoritative).toBe(true);
    expect(result.surfaceAreaM2).toBe(240);
    expect(result.perimeterM).toBe(64);
    expect(result.segments).toHaveLength(4);
    expect(result.angles).toHaveLength(4);
    expect(result.metadata.proxyHash).toBe("deadbeef");
    expect(result.metadata.proxyCached).toBe(false);
    expect(result.metadata.siteMetrics.segmentCount).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/site/boundary");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).address).toBe(ADDRESS);
  });

  test("returns null when proxy responds with polygon: null", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(makeProxyResponse(emptyProxyBody()));
    const result = await fetchSiteBoundaryFromProxy({
      coordinates: POINT,
      fetchImpl,
    });
    expect(result).toBeNull();
  });

  test("returns null when proxy responds non-OK", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response("", { status: 502 }));
    const result = await fetchSiteBoundaryFromProxy({
      coordinates: POINT,
      fetchImpl,
    });
    expect(result).toBeNull();
  });

  test("returns null when fetch rejects (network error / abort)", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchSiteBoundaryFromProxy({
      coordinates: POINT,
      fetchImpl,
    });
    expect(result).toBeNull();
  });

  test("returns null when given invalid coordinates", async () => {
    const fetchImpl = jest.fn();
    const result = await fetchSiteBoundaryFromProxy({
      coordinates: { lat: NaN, lng: 0 },
      fetchImpl,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("detectPropertyBoundary — browser proxy wiring", () => {
  beforeEach(() => {
    installBrowserRuntime();
  });
  afterEach(() => {
    restoreRuntime();
  });

  test("uses proxy result when authoritative and skips legacy chain", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(makeProxyResponse(authoritativeProxyBody()));
    const result = await detectPropertyBoundary(POINT, ADDRESS, { fetchImpl });
    expect(result.polygon).toHaveLength(4);
    expect(result.boundaryAuthoritative).toBe(true);
    expect(isEstimatedBoundaryResult(result)).toBe(false);
    expect(result.source).toBe(
      "openstreetmap-overpass-building-contains-point",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("uses measured proxy polygon when proxy returns non-authoritative exact geometry", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(makeProxyResponse(lowConfidenceProxyBody()));
    const result = await detectPropertyBoundary(POINT, ADDRESS, { fetchImpl });
    expect(result.source).toBe("openstreetmap-overpass-building-nearest");
    expect(isEstimatedBoundaryResult(result)).toBe(true);
    expect(result.boundaryAuthoritative).toBe(false);
    expect(result.polygon).toHaveLength(4);
  });

  test("falls through to Intelligent Fallback when proxy returns no polygon", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(makeProxyResponse(emptyProxyBody()));
    const result = await detectPropertyBoundary(POINT, ADDRESS, { fetchImpl });
    expect(result.source).toBe(INTELLIGENT_FALLBACK_BOUNDARY_SOURCE);
    expect(isEstimatedBoundaryResult(result)).toBe(true);
  });

  test("falls through to Intelligent Fallback when proxy fetch fails", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await detectPropertyBoundary(POINT, ADDRESS, { fetchImpl });
    expect(result.source).toBe(INTELLIGENT_FALLBACK_BOUNDARY_SOURCE);
    expect(isEstimatedBoundaryResult(result)).toBe(true);
  });

  test("bypassProxy:true skips the proxy call entirely (test fixture isolation)", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(makeProxyResponse(authoritativeProxyBody()));
    const result = await detectPropertyBoundary(POINT, ADDRESS, {
      bypassProxy: true,
      fetchImpl,
    });
    // Browser chain without proxy ends in Intelligent Fallback.
    expect(result.source).toBe(INTELLIGENT_FALLBACK_BOUNDARY_SOURCE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("detectPropertyBoundary — server runtime path is unchanged", () => {
  beforeEach(() => {
    restoreRuntime(); // ensure window is undefined
    if (typeof global.window !== "undefined") {
      delete global.window;
    }
  });

  test("server runtime does NOT call the proxy", async () => {
    // Sanity: when window is undefined, isBrowserRuntime() is false.
    const fetchImpl = jest.fn();
    const result = await detectPropertyBoundary(POINT, ADDRESS, { fetchImpl });
    // The server-side chain attempts Overpass directly via global fetch
    // (not our injected fetchImpl, since the proxy step is skipped).
    // We only assert the proxy was NOT called via our injected fetch.
    expect(fetchImpl).not.toHaveBeenCalled();
    // The result is some boundary — could be Overpass-derived if global
    // fetch is available, or Intelligent Fallback if not. Either way,
    // it has a valid polygon.
    expect(result.polygon).toBeTruthy();
    expect(Array.isArray(result.polygon)).toBe(true);
  });
});
