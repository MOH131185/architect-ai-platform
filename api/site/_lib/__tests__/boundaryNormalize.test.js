import {
  BOUNDARY_SOURCE,
  ESTIMATE_REASON,
  RESIDENTIAL_BUILDING_MAX_M2,
  RESIDENTIAL_PARCEL_MAX_M2,
  RESIDENTIAL_PARCEL_MAX_VERTICES,
  buildBoundaryResponse,
  classifyBuildingCandidate,
  classifyParcelCandidate,
  polygonAreaM2,
  selectBestBoundaryCandidate,
  selectBestOverpassWay,
} from "../boundaryNormalize.js";

// Build a square polygon centred on (lat, lng) whose half-edge in metres
// is approximately the given size. Quick-and-dirty conversion using
// degrees-per-metre at latitude — accurate enough for area sanity tests.
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

function wayWithGeometry(polygon, tags = {}, id = 1) {
  return {
    id,
    type: "way",
    geometry: polygon.map(({ lat, lng }) => ({ lat, lon: lng })),
    tags,
  };
}

const POINT = { lat: 52.4898, lng: -1.8832 };

describe("classifyParcelCandidate", () => {
  test("accepts a small residential lot polygon", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 15); // ~900 m²
    const reason = classifyParcelCandidate({
      polygon,
      element: { tags: { boundary: "land_lot" } },
    });
    expect(reason).toBeNull();
  });

  test("rejects a polygon with landuse=residential as a district", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 15);
    const reason = classifyParcelCandidate({
      polygon,
      element: { tags: { landuse: "residential" } },
    });
    expect(reason).toBe(ESTIMATE_REASON.PARCEL_LANDUSE_DISTRICT);
  });

  test("rejects an oversized parcel even without landuse tag", () => {
    // 250m half-edge → 500m × 500m → 250,000 m² — clearly a district
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 250);
    expect(polygonAreaM2(polygon)).toBeGreaterThan(RESIDENTIAL_PARCEL_MAX_M2);
    const reason = classifyParcelCandidate({ polygon, element: {} });
    expect(reason).toBe(ESTIMATE_REASON.PARCEL_OVERSIZED);
  });

  test("rejects a polygon with too many vertices", () => {
    const polygon = [];
    for (let i = 0; i < RESIDENTIAL_PARCEL_MAX_VERTICES + 5; i += 1) {
      const angle = (i / (RESIDENTIAL_PARCEL_MAX_VERTICES + 5)) * 2 * Math.PI;
      polygon.push({
        lat: POINT.lat + Math.sin(angle) * 0.0001,
        lng: POINT.lng + Math.cos(angle) * 0.0001,
      });
    }
    const reason = classifyParcelCandidate({ polygon, element: {} });
    expect(reason).toBe(ESTIMATE_REASON.PARCEL_TOO_COMPLEX);
  });

  test("rejects a multi-house terrace block (~1500 m²) under the tightened threshold", () => {
    // 17 Kensington Rd DN15 8BQ regression: a polygon spanning ~5 terraced
    // houses came back at roughly 1500 m². Under the previous 5000 m²
    // threshold this slipped through; the tightened 1500 m² threshold
    // (with strict-greater comparison) now demotes it.
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 25); // ~2500 m²
    const reason = classifyParcelCandidate({ polygon, element: {} });
    expect(reason).toBe(ESTIMATE_REASON.PARCEL_OVERSIZED);
  });
});

describe("classifyBuildingCandidate", () => {
  test("accepts a single residential building footprint", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 6); // ~144 m²
    const reason = classifyBuildingCandidate({ polygon });
    expect(reason).toBeNull();
  });

  test("flags an oversized building as estimated (multi-unit / non-residential)", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 25); // ~2500 m²
    expect(polygonAreaM2(polygon)).toBeGreaterThan(RESIDENTIAL_BUILDING_MAX_M2);
    const reason = classifyBuildingCandidate({ polygon });
    expect(reason).toBe(ESTIMATE_REASON.BUILDING_OVERSIZED);
  });
});

describe("selectBestOverpassWay", () => {
  test("returns a small parcel as authoritative when it contains the point", () => {
    const parcel = squarePolygonAround(POINT.lat, POINT.lng, 12); // ~576 m²
    const result = selectBestOverpassWay({
      parcelElements: [wayWithGeometry(parcel, { boundary: "land_lot" })],
      buildingElements: [],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS);
    expect(result?.estimateReason).toBeUndefined();
  });

  test("falls back to the building polygon when the parcel is a landuse district", () => {
    const district = squarePolygonAround(POINT.lat, POINT.lng, 200); // ~160k m²
    const building = squarePolygonAround(POINT.lat, POINT.lng, 6); // ~144 m²
    const result = selectBestOverpassWay({
      parcelElements: [
        wayWithGeometry(district, { landuse: "residential" }, 1),
      ],
      buildingElements: [wayWithGeometry(building, { building: "yes" }, 2)],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS);
    expect(result?.estimateReason).toBe(
      ESTIMATE_REASON.PARCEL_LANDUSE_DISTRICT,
    );
    expect(result?.demotedParcel?.element?.tags?.landuse).toBe("residential");
  });

  test("falls back to the building polygon when the parcel is oversized", () => {
    const oversized = squarePolygonAround(POINT.lat, POINT.lng, 100); // ~40k m²
    const building = squarePolygonAround(POINT.lat, POINT.lng, 6);
    const result = selectBestOverpassWay({
      parcelElements: [wayWithGeometry(oversized, {}, 1)],
      buildingElements: [wayWithGeometry(building, { building: "yes" }, 2)],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS);
    expect(result?.estimateReason).toBe(ESTIMATE_REASON.PARCEL_OVERSIZED);
  });

  test("returns null when neither parcel nor building contains the point", () => {
    const farAway = squarePolygonAround(POINT.lat + 1, POINT.lng + 1, 6);
    const result = selectBestOverpassWay({
      parcelElements: [],
      buildingElements: [wayWithGeometry(farAway, { building: "yes" })],
      point: POINT,
    });
    expect(result).toBeNull();
  });

  test("rejects an oversized building polygon (terraced row joined as one OSM building)", () => {
    // Returning a 1600 m² terrace polygon as the user's site boundary is
    // wildly wrong for an individual ~67 m² house. The selector must
    // refuse the oversized candidate and return null so the caller can
    // prompt the user to draw manually.
    const oversizedBuilding = squarePolygonAround(POINT.lat, POINT.lng, 20); // ~1600 m²
    const result = selectBestOverpassWay({
      parcelElements: [],
      buildingElements: [
        wayWithGeometry(oversizedBuilding, { building: "yes" }, 1),
      ],
      point: POINT,
    });
    expect(result).toBeNull();
  });

  test("a small building stays authoritative when no parcel was demoted", () => {
    const building = squarePolygonAround(POINT.lat, POINT.lng, 6);
    const result = selectBestOverpassWay({
      parcelElements: [],
      buildingElements: [wayWithGeometry(building, { building: "yes" }, 1)],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS);
    expect(result?.estimateReason).toBeNull();
  });
});

describe("selectBestBoundaryCandidate (INSPIRE precedence)", () => {
  test("an INSPIRE polygon containing the point wins over an Overpass parcel", () => {
    const inspirePolygon = squarePolygonAround(POINT.lat, POINT.lng, 8);
    const overpassParcel = squarePolygonAround(POINT.lat, POINT.lng, 12);
    const result = selectBestBoundaryCandidate({
      inspireElements: [
        wayWithGeometry(inspirePolygon, { inspireId: "12345" }, 1),
      ],
      parcelElements: [
        wayWithGeometry(overpassParcel, { boundary: "land_lot" }, 2),
      ],
      buildingElements: [],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.INSPIRE_PARCEL_CONTAINS);
    expect(result?.element?.tags?.inspireId).toBe("12345");
  });

  test("falls back to Overpass parcel when INSPIRE has no match", () => {
    const overpassParcel = squarePolygonAround(POINT.lat, POINT.lng, 12);
    const result = selectBestBoundaryCandidate({
      inspireElements: [],
      parcelElements: [
        wayWithGeometry(overpassParcel, { boundary: "land_lot" }, 1),
      ],
      buildingElements: [],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS);
  });

  test("falls back to OSM when INSPIRE entry is implausibly large", () => {
    const oversizedInspire = squarePolygonAround(POINT.lat, POINT.lng, 100); // ~40k m²
    const overpassParcel = squarePolygonAround(POINT.lat, POINT.lng, 12);
    const result = selectBestBoundaryCandidate({
      inspireElements: [
        wayWithGeometry(oversizedInspire, { inspireId: "bad" }, 1),
      ],
      parcelElements: [
        wayWithGeometry(overpassParcel, { boundary: "land_lot" }, 2),
      ],
      buildingElements: [],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS);
  });

  test("backwards-compatible: selectBestOverpassWay alias still works", () => {
    const overpassParcel = squarePolygonAround(POINT.lat, POINT.lng, 12);
    const result = selectBestOverpassWay({
      parcelElements: [wayWithGeometry(overpassParcel)],
      buildingElements: [],
      point: POINT,
    });
    expect(result?.source).toBe(BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS);
  });
});

describe("INSPIRE confidence in buildBoundaryResponse", () => {
  test("INSPIRE_PARCEL_CONTAINS produces highest confidence (0.98)", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 8);
    const body = buildBoundaryResponse({
      polygon,
      source: BOUNDARY_SOURCE.INSPIRE_PARCEL_CONTAINS,
    });
    expect(body.boundaryAuthoritative).toBe(true);
    expect(body.confidence).toBeCloseTo(0.98, 2);
    expect(body.source).toBe(BOUNDARY_SOURCE.INSPIRE_PARCEL_CONTAINS);
  });
});

describe("buildBoundaryResponse", () => {
  test("preserves authoritative semantics for a small parcel", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 12);
    const body = buildBoundaryResponse({
      polygon,
      source: BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS,
    });
    expect(body.boundaryAuthoritative).toBe(true);
    expect(body.estimateReason).toBeNull();
    expect(body.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("demotes building-contains response when estimateReason is set", () => {
    const polygon = squarePolygonAround(POINT.lat, POINT.lng, 6);
    const body = buildBoundaryResponse({
      polygon,
      source: BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS,
      estimateReason: ESTIMATE_REASON.PARCEL_LANDUSE_DISTRICT,
      demotedParcel: {
        element: { id: 99, tags: { landuse: "residential" } },
        polygon: squarePolygonAround(POINT.lat, POINT.lng, 200),
      },
    });
    expect(body.boundaryAuthoritative).toBe(false);
    expect(body.estimateReason).toBe(ESTIMATE_REASON.PARCEL_LANDUSE_DISTRICT);
    expect(body.confidence).toBeLessThanOrEqual(0.7);
    expect(body.metadata.demotedParcel?.landuseTag).toBe("residential");
  });
});
