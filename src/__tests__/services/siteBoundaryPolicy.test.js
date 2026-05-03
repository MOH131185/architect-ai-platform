import {
  buildBoundaryMeasurements,
  classifyParcelCandidate,
  ESTIMATE_REASON,
  polygonAreaM2,
} from "../../services/site/boundaryPolicy.js";

const POINT = { lat: 53.591237, lng: -0.688325 };

function squarePolygonAround(lat, lng, halfEdgeM) {
  const latPerM = 1 / 111_000;
  const lngPerM = 1 / (111_000 * Math.cos((lat * Math.PI) / 180));
  const dLat = halfEdgeM * latPerM;
  const dLng = halfEdgeM * lngPerM;
  return [
    { lat: lat - dLat, lng: lng - dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng - dLng },
  ];
}

describe("site boundary policy", () => {
  test("keeps a generous residential lot below 1000 m2 plausible", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 15);

    expect(polygonAreaM2(polygon)).toBeLessThan(1000);
    expect(classifyParcelCandidate({ polygon, element: {} })).toBeNull();
  });

  test("demotes Kensington-scale apartment/title polygons around 1260 m2", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 17.75);
    const areaM2 = polygonAreaM2(polygon);

    expect(areaM2).toBeGreaterThan(1200);
    expect(areaM2).toBeLessThan(1500);
    expect(classifyParcelCandidate({ polygon, element: {} })).toBe(
      ESTIMATE_REASON.PARCEL_OVERSIZED,
    );
  });

  test("returns surface, perimeter, segment, and angle measurements", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 5);
    const measurements = buildBoundaryMeasurements(polygon);

    expect(measurements.surfaceAreaM2).toBe(measurements.areaM2);
    expect(measurements.perimeterM).toBeGreaterThan(35);
    expect(measurements.segments).toHaveLength(4);
    expect(measurements.angles).toHaveLength(4);
    expect(measurements.segments[0]).toHaveProperty("lengthM");
    expect(measurements.segments[0]).toHaveProperty("bearingDeg");
    expect(measurements.angles[0]).toHaveProperty("angleDeg");
  });
});
