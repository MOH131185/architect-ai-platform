import {
  fetchTitleBoundariesNear,
  __testing,
} from "../digitalLandTitleBoundaryClient.js";

function makeFetchImpl(response, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(response),
  });
}

describe("fetchTitleBoundariesNear", () => {
  test("parses a Polygon feature into one Overpass-shaped element", async () => {
    const fetchImpl = makeFetchImpl({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-0.650657, 53.590488],
                [-0.650647, 53.590443],
                [-0.650235, 53.590476],
                [-0.650246, 53.590521],
                [-0.650657, 53.590488],
              ],
            ],
          },
          properties: {
            entity: 12002271632,
            reference: "31980029",
          },
        },
      ],
    });

    const elements = await fetchTitleBoundariesNear({
      lat: 53.5905,
      lng: -0.6505,
      fetchImpl,
    });

    expect(elements).toHaveLength(1);
    expect(elements[0]).toEqual(
      expect.objectContaining({
        type: "way",
        id: 12002271632,
        tags: expect.objectContaining({
          titleReference: "31980029",
          entity: 12002271632,
        }),
      }),
    );
    expect(elements[0].geometry.length).toBeGreaterThanOrEqual(3);
    expect(elements[0].geometry[0]).toEqual({
      lat: 53.590488,
      lon: -0.650657,
    });
    expect(elements[0].areaM2).toBeGreaterThan(0);
  });

  test("flattens MultiPolygon into one element per outer ring", async () => {
    const fetchImpl = makeFetchImpl({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [-0.65, 53.59],
                  [-0.65, 53.591],
                  [-0.649, 53.591],
                  [-0.649, 53.59],
                  [-0.65, 53.59],
                ],
              ],
              [
                [
                  [-0.648, 53.589],
                  [-0.648, 53.59],
                  [-0.647, 53.59],
                  [-0.647, 53.589],
                  [-0.648, 53.589],
                ],
              ],
            ],
          },
          properties: { entity: 1, reference: "ref-1" },
        },
      ],
    });

    const elements = await fetchTitleBoundariesNear({
      lat: 53.59,
      lng: -0.65,
      fetchImpl,
    });
    expect(elements).toHaveLength(2);
    for (const el of elements) {
      expect(el.tags.titleReference).toBe("ref-1");
    }
  });

  test("returns empty array when fetch fails", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network"));
    const elements = await fetchTitleBoundariesNear({
      lat: 53.59,
      lng: -0.65,
      fetchImpl,
    });
    expect(elements).toEqual([]);
  });

  test("returns empty array on non-OK HTTP status", async () => {
    const fetchImpl = makeFetchImpl({}, false);
    const elements = await fetchTitleBoundariesNear({
      lat: 53.59,
      lng: -0.65,
      fetchImpl,
    });
    expect(elements).toEqual([]);
  });

  test("returns empty array on malformed JSON shape", async () => {
    const fetchImpl = makeFetchImpl({ type: "Other", features: "not-array" });
    const elements = await fetchTitleBoundariesNear({
      lat: 53.59,
      lng: -0.65,
      fetchImpl,
    });
    expect(elements).toEqual([]);
  });

  test("returns empty array for invalid lat/lng", async () => {
    const fetchImpl = makeFetchImpl({});
    expect(
      await fetchTitleBoundariesNear({ lat: NaN, lng: 0, fetchImpl }),
    ).toEqual([]);
    expect(
      await fetchTitleBoundariesNear({ lat: 0, lng: NaN, fetchImpl }),
    ).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("encodes the POINT correctly in the WFS query", async () => {
    const fetchImpl = makeFetchImpl({
      type: "FeatureCollection",
      features: [],
    });
    await fetchTitleBoundariesNear({
      lat: 53.5905,
      lng: -0.6505,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain("dataset=title-boundary");
    expect(url).toContain("geometry_relation=intersects");
    // URL.searchParams encodes the space in "POINT(<lng> <lat>)" as "+"
    expect(url).toContain("geometry=POINT%28-0.6505+53.5905%29");
  });

  test("extractPolygonRings handles nullish geometry without throwing", () => {
    expect(__testing.extractPolygonRings(null)).toEqual([]);
    expect(__testing.extractPolygonRings({ type: "LineString" })).toEqual([]);
  });

  test("coordsToLatLon drops malformed pairs", () => {
    const out = __testing.coordsToLatLon([
      [-0.65, 53.59],
      ["bad", "data"],
      [null, undefined],
      [-0.6, 53.6],
    ]);
    expect(out).toEqual([
      { lat: 53.59, lon: -0.65 },
      { lat: 53.6, lon: -0.6 },
    ]);
  });
});
