import {
  fetchInspireParcelsNear,
  __resetFixtureCacheForTests,
  __testing,
} from "../inspirePolygonsClient.js";

// Co-ordinates from the committed `north-lincolnshire.json` synthetic
// fixture. Centre of the polygon is approximately (53.5906, -0.6507),
// the polygon spans (53.5905, -0.6509) to (53.5908, -0.6506).
const KENSINGTON_RD_POINT = { lat: 53.5906, lng: -0.6507 };

beforeEach(() => {
  __resetFixtureCacheForTests();
});

describe("fetchInspireParcelsNear", () => {
  test("returns the parcel for a point inside the synthetic 17 Kensington Rd polygon", () => {
    const matches = fetchInspireParcelsNear({
      ...KENSINGTON_RD_POINT,
      postcode: "DN15 8BQ",
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe("synthetic-17-kensington-rd-dn15-8bq");
    // Polygon converted into Overpass-shaped {lat, lon} geometry for the
    // selector.
    expect(matches[0].type).toBe("way");
    expect(Array.isArray(matches[0].geometry)).toBe(true);
    expect(matches[0].geometry.length).toBeGreaterThanOrEqual(3);
    expect(matches[0].geometry[0]).toHaveProperty("lat");
    expect(matches[0].geometry[0]).toHaveProperty("lon");
  });

  test("returns empty array when the point is just outside the polygon", () => {
    const matches = fetchInspireParcelsNear({
      lat: 53.595, // ~50m north of the synthetic polygon
      lng: -0.6507,
      postcode: "DN15 8BQ",
    });
    expect(matches).toEqual([]);
  });

  test("returns empty array for a non-DN postcode (no fixture covers it)", () => {
    const matches = fetchInspireParcelsNear({
      lat: 51.5074,
      lng: -0.1278,
      postcode: "EC1A 1AA",
    });
    expect(matches).toEqual([]);
  });

  test("returns empty array for invalid input without throwing", () => {
    expect(fetchInspireParcelsNear()).toEqual([]);
    expect(fetchInspireParcelsNear({})).toEqual([]);
    expect(
      fetchInspireParcelsNear({ lat: NaN, lng: NaN, postcode: "DN15 8BQ" }),
    ).toEqual([]);
    expect(
      fetchInspireParcelsNear({ lat: "x", lng: "y", postcode: "DN15 8BQ" }),
    ).toEqual([]);
  });

  test("falls back to scanning all fixtures when postcode is missing", () => {
    // Without a postcode the client tries every committed fixture; if the
    // point is inside one of them, that one wins. Here the point is in
    // the synthetic Kensington Rd polygon and there's only one fixture,
    // so the search succeeds.
    const matches = fetchInspireParcelsNear({
      ...KENSINGTON_RD_POINT,
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe("synthetic-17-kensington-rd-dn15-8bq");
  });

  test("loadFixture caches its result across calls", () => {
    const fixture1 = __testing.loadFixture("north-lincolnshire.json");
    const fixture2 = __testing.loadFixture("north-lincolnshire.json");
    // Reference equality — second call must return the exact cached array.
    expect(fixture1).toBe(fixture2);
  });

  test("loadFixture returns empty array for an unknown LA name", () => {
    const fixture = __testing.loadFixture("does-not-exist.json");
    expect(fixture).toEqual([]);
  });
});
