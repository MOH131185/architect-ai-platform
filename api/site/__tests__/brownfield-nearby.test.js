import { resolveBrownfieldRequest } from "../brownfield-nearby.js";

describe("resolveBrownfieldRequest", () => {
  test("returns 400 for invalid lat/lng", async () => {
    const result = await resolveBrownfieldRequest({ lat: NaN, lng: 0 });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("invalid_lat_lng");
  });

  test("returns Scunthorpe-area sites for a valid DN15 query", async () => {
    const result = await resolveBrownfieldRequest({
      lat: 53.5905,
      lng: -0.65,
      postcode: "DN15 8BQ",
      radiusM: 2000,
    });
    expect(result.status).toBe(200);
    expect(result.body.schemaVersion).toBe("brownfield-nearby-v1");
    expect(Array.isArray(result.body.sites)).toBe(true);
    expect(result.body.count).toBe(result.body.sites.length);
    expect(result.body.attribution).toContain("Open Government Licence");
  });

  test("clamps radiusM to safe bounds", async () => {
    const tooLarge = await resolveBrownfieldRequest({
      lat: 53.5905,
      lng: -0.65,
      radiusM: 999999, // way over MAX
    });
    expect(tooLarge.body.radiusM).toBeLessThanOrEqual(10000);

    const tooSmall = await resolveBrownfieldRequest({
      lat: 53.5905,
      lng: -0.65,
      radiusM: 1, // under MIN of 100
    });
    expect(tooSmall.body.radiusM).toBeGreaterThanOrEqual(100);
  });

  test("clamps limit to 1..100", async () => {
    const tooLarge = await resolveBrownfieldRequest({
      lat: 53.5905,
      lng: -0.65,
      radiusM: 5000,
      limit: 9999,
    });
    expect(tooLarge.body.sites.length).toBeLessThanOrEqual(100);
  });

  test("non-UK location returns 0 sites without error", async () => {
    const result = await resolveBrownfieldRequest({
      lat: 48.8566,
      lng: 2.3522,
      postcode: null,
    });
    expect(result.status).toBe(200);
    expect(result.body.count).toBe(0);
    expect(result.body.sites).toEqual([]);
  });
});
