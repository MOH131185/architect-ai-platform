import { resolveMainEntryDirection } from "../../../services/site/mainEntryDirectionService.js";

// 10m × 10m square site centred at lat=0,lng=0 (small enough that lat/lng
// degrees behave like Cartesian coordinates for the bearing math).
const SQUARE_SITE = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.0001 },
  { lat: 0.0001, lng: 0.0001 },
  { lat: 0.0001, lng: 0 },
];

describe("mainEntryDirectionService.resolveMainEntryDirection", () => {
  describe("manual override paths (always win)", () => {
    test("manualDirection wins over polygon inference", () => {
      const result = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualDirection: "south",
      });
      expect(result.source).toBe("manual");
      expect(result.direction).toBe("south");
      expect(result.confidence).toBe(1);
      expect(result.bearing).toBe(180);
    });

    test("manualDirection accepts short codes (N, S, E, W)", () => {
      const north = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualDirection: "N",
      });
      expect(north.direction).toBe("north");
      const east = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualDirection: "E",
      });
      expect(east.direction).toBe("east");
    });

    test("manualEdgeIndex wins over inference and yields outward bearing", () => {
      const result = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualEdgeIndex: 0,
      });
      expect(result.source).toBe("manual");
      expect(result.confidence).toBe(1);
      expect(result.edgeIndex).toBe(0);
      expect(typeof result.bearing).toBe("number");
      expect(result.direction).toBeDefined();
    });

    test("manualEdgeIndex wraps for negative or out-of-range values", () => {
      const wrapped = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualEdgeIndex: 4,
      });
      expect(wrapped.edgeIndex).toBe(0);
      const negative = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualEdgeIndex: -1,
      });
      expect(negative.edgeIndex).toBe(3);
    });

    test("manualDirection beats manualEdgeIndex when both supplied", () => {
      const result = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        manualDirection: "west",
        manualEdgeIndex: 0,
      });
      expect(result.direction).toBe("west");
      expect(result.edgeIndex).toBeNull();
    });
  });

  describe("inference path (no manual input)", () => {
    test("returns inferred direction with source='inferred' for a valid polygon", () => {
      const result = resolveMainEntryDirection({ sitePolygon: SQUARE_SITE });
      expect(result.source).toBe("inferred");
      expect(typeof result.bearing).toBe("number");
      expect(typeof result.direction).toBe("string");
      expect(result.direction.length).toBeGreaterThan(0);
      expect(result.rationale.length).toBeGreaterThan(0);
    });

    test("road proximity strategy is dominant when roads are provided", () => {
      // Road south of the site centroid should bias entry to "south".
      const result = resolveMainEntryDirection({
        sitePolygon: SQUARE_SITE,
        roadSegments: [
          {
            name: "Test Road",
            midpoint: { lat: -0.001, lng: 0.00005 },
          },
        ],
      });
      expect(result.source).toBe("inferred");
      // Confidence from road_proximity strategy is at least 0.85.
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(
        result.rationale.some((r) => r.strategy === "road_proximity"),
      ).toBe(true);
    });
  });

  describe("fallback path", () => {
    test("returns 'fallback' source when no polygon is available", () => {
      const result = resolveMainEntryDirection({});
      expect(result.source).toBe("fallback");
      expect(result.direction).toBe("north");
      expect(result.confidence).toBeLessThan(0.5);
    });

    test("returns 'fallback' source when polygon is too short", () => {
      const result = resolveMainEntryDirection({
        sitePolygon: [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ],
      });
      expect(result.source).toBe("fallback");
    });
  });
});
