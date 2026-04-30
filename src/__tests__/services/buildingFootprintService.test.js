import {
  calculatePolygonArea,
  convertGeoJsonToMapCoords,
  normalizeGeoJsonRingCoordinates,
} from "../../services/buildingFootprintService.js";

describe("buildingFootprintService", () => {
  test("unwraps nested Google/GeoJSON polygon rings into numeric map coordinates", () => {
    const nestedCoordinates = [
      [
        [-1.893, 52.483],
        [-1.892, 52.483],
        [-1.892, 52.482],
        [-1.893, 52.482],
        [-1.893, 52.483],
      ],
    ];

    const ring = normalizeGeoJsonRingCoordinates(nestedCoordinates);
    const mapCoords = convertGeoJsonToMapCoords(nestedCoordinates);

    expect(ring).toHaveLength(5);
    expect(mapCoords).toHaveLength(5);
    mapCoords.forEach((point) => {
      expect(Number.isFinite(point.lat)).toBe(true);
      expect(Number.isFinite(point.lng)).toBe(true);
    });
    expect(calculatePolygonArea(mapCoords)).toBeGreaterThan(0);
  });

  test("rejects malformed footprint rings instead of returning array-valued coordinates", () => {
    const malformedCoordinates = [[[[-1.893], [52.483]]]];

    expect(normalizeGeoJsonRingCoordinates(malformedCoordinates)).toEqual([]);
    expect(convertGeoJsonToMapCoords(malformedCoordinates)).toEqual([]);
  });
});
