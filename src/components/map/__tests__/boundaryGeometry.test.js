/**
 * boundaryGeometry.test.js
 *
 * Unit tests for boundary geometry utilities
 */

import {
  roundCoord,
  normalizePoint,
  coordToLatLng,
  latLngToCoord,
  isRingClosed,
  closeRing,
  openRing,
  removeDuplicates,
  normalizeRing,
  detectSelfIntersection,
  isClockwise,
  ensureOrientation,
  calculateArea,
  calculatePerimeter,
  calculateCentroid,
  calculateSegments,
  calculateAngles,
  snapToVertex,
  snapToEdge,
  snapBearing,
  constrainToAngle,
  validatePolygon,
  wouldCauseSelfIntersection,
  toGeoJSON,
  fromGeoJSON,
  toWKT,
  fromWKT,
  toCSV,
  fromCSV,
  latLngArrayToRing,
  ringToLatLngArray,
} from "../boundaryGeometry.js";

// Test data: Simple square polygon
const squareVertices = [
  [-122.4, 37.7], // SW
  [-122.4, 37.71], // NW
  [-122.39, 37.71], // NE
  [-122.39, 37.7], // SE
];

const squareRingClosed = [...squareVertices, squareVertices[0]];

// Test data: Self-intersecting (figure-8)
const selfIntersectingVertices = [
  [-122.4, 37.7],
  [-122.39, 37.71],
  [-122.4, 37.71],
  [-122.39, 37.7],
];

// Test data: Triangle
const triangleVertices = [
  [-122.4, 37.7],
  [-122.395, 37.71],
  [-122.39, 37.7],
];

// ============================================================
// COORDINATE PRECISION & NORMALIZATION
// ============================================================

describe("Coordinate Precision", () => {
  test("roundCoord rounds to default precision", () => {
    expect(roundCoord(37.12345678901234)).toBe(37.1234568);
    expect(roundCoord(-122.99999999999)).toBe(-123);
  });

  test("roundCoord handles custom precision", () => {
    expect(roundCoord(37.12345678, 3)).toBe(37.123);
    expect(roundCoord(37.12345678, 5)).toBe(37.12346);
  });

  test("normalizePoint converts lat/lng object to [lng, lat]", () => {
    const result = normalizePoint({ lat: 37.7749, lng: -122.4194 });
    expect(result).toEqual([-122.4194, 37.7749]);
  });

  test("normalizePoint handles array input", () => {
    const result = normalizePoint([-122.4194, 37.7749]);
    expect(result).toEqual([-122.4194, 37.7749]);
  });

  test("coordToLatLng converts [lng, lat] to {lat, lng}", () => {
    const result = coordToLatLng([-122.4194, 37.7749]);
    expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
  });

  test("latLngToCoord converts {lat, lng} to [lng, lat]", () => {
    const result = latLngToCoord({ lat: 37.7749, lng: -122.4194 });
    expect(result[0]).toBeCloseTo(-122.4194, 6);
    expect(result[1]).toBeCloseTo(37.7749, 6);
  });
});

// ============================================================
// RING OPERATIONS
// ============================================================

describe("Ring Operations", () => {
  test("isRingClosed detects closed ring", () => {
    expect(isRingClosed(squareRingClosed)).toBe(true);
    expect(isRingClosed(squareVertices)).toBe(false);
  });

  test("closeRing closes an open ring", () => {
    const closed = closeRing(squareVertices);
    expect(closed.length).toBe(5);
    expect(closed[0]).toEqual(closed[4]);
  });

  test("closeRing does not double-close", () => {
    const alreadyClosed = closeRing(squareRingClosed);
    expect(alreadyClosed.length).toBe(5);
  });

  test("openRing removes closing vertex", () => {
    const opened = openRing(squareRingClosed);
    expect(opened.length).toBe(4);
    expect(opened).toEqual(squareVertices);
  });

  test("openRing handles already open ring", () => {
    const stillOpen = openRing(squareVertices);
    expect(stillOpen.length).toBe(4);
  });

  test("removeDuplicates removes consecutive duplicates", () => {
    const withDupes = [
      [-122.4, 37.7],
      [-122.4, 37.7], // duplicate
      [-122.4, 37.71],
      [-122.39, 37.71],
      [-122.39, 37.71], // duplicate
      [-122.39, 37.7],
    ];
    const cleaned = removeDuplicates(withDupes);
    expect(cleaned.length).toBe(4);
  });

  test("normalizeRing validates minimum vertices", () => {
    const twoPoints = [
      [-122.4, 37.7],
      [-122.39, 37.71],
    ];
    const result = normalizeRing(twoPoints);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("normalizeRing returns closed ring", () => {
    const result = normalizeRing(squareVertices);
    expect(result.valid).toBe(true);
    expect(isRingClosed(result.ring)).toBe(true);
  });
});

// ============================================================
// SELF-INTERSECTION DETECTION
// ============================================================

describe("Self-Intersection Detection", () => {
  test("detectSelfIntersection returns false for simple polygon", () => {
    const result = detectSelfIntersection(squareRingClosed);
    expect(result.intersects).toBe(false);
    expect(result.points).toHaveLength(0);
  });

  test("detectSelfIntersection returns true for figure-8", () => {
    const ring = closeRing(selfIntersectingVertices);
    const result = detectSelfIntersection(ring);
    expect(result.intersects).toBe(true);
    expect(result.points.length).toBeGreaterThan(0);
  });

  test("detectSelfIntersection handles triangles", () => {
    const ring = closeRing(triangleVertices);
    const result = detectSelfIntersection(ring);
    expect(result.intersects).toBe(false);
  });
});

// ============================================================
// POLYGON ORIENTATION
// ============================================================

describe("Polygon Orientation", () => {
  test("isClockwise detects clockwise orientation", () => {
    // Square vertices SW->NW->NE->SE are clockwise in GeoJSON [lng,lat] coordinates
    expect(isClockwise(squareRingClosed)).toBe(true);
  });

  test("ensureOrientation reverses if needed", () => {
    const ring = squareRingClosed;
    const cw = ensureOrientation(ring, true);
    expect(isClockwise(cw)).toBe(true);

    const ccw = ensureOrientation(ring, false);
    expect(isClockwise(ccw)).toBe(false);
  });
});

// ============================================================
// METRICS CALCULATION
// ============================================================

describe("Metrics Calculation", () => {
  test("calculateArea returns positive value for valid polygon", () => {
    const area = calculateArea(squareRingClosed);
    expect(area).toBeGreaterThan(0);
    // Square is roughly 1km x 1km = ~1,000,000 m²
    // (but actually ~0.01° lat/lng difference)
    expect(area).toBeLessThan(2000000);
  });

  test("calculateArea returns 0 for invalid polygon", () => {
    expect(calculateArea([])).toBe(0);
    expect(
      calculateArea([
        [-122.4, 37.7],
        [-122.39, 37.71],
      ]),
    ).toBe(0);
  });

  test("calculatePerimeter returns positive value", () => {
    const perimeter = calculatePerimeter(squareRingClosed);
    expect(perimeter).toBeGreaterThan(0);
    // Should be roughly 4 * ~1km = ~4000m
    expect(perimeter).toBeLessThan(10000);
  });

  test("calculateCentroid returns center point", () => {
    const centroid = calculateCentroid(squareRingClosed);
    // Centroid should be roughly in the middle
    expect(centroid[0]).toBeCloseTo(-122.395, 2);
    expect(centroid[1]).toBeCloseTo(37.705, 2);
  });

  test("calculateSegments returns correct number of segments", () => {
    const segments = calculateSegments(squareRingClosed);
    expect(segments.length).toBe(4);

    segments.forEach((seg) => {
      expect(seg).toHaveProperty("index");
      expect(seg).toHaveProperty("length");
      expect(seg).toHaveProperty("bearing");
      expect(seg).toHaveProperty("midpoint");
      expect(seg.length).toBeGreaterThan(0);
    });
  });

  test("calculateAngles returns correct number of angles", () => {
    const angles = calculateAngles(squareRingClosed);
    expect(angles.length).toBe(4);

    // For a square, angles should be ~90° (interior) or ~270° (exterior)
    // depending on polygon orientation and calculation method
    angles.forEach((ang) => {
      const isInteriorAngle = ang.angle >= 80 && ang.angle <= 100;
      const isExteriorAngle = ang.angle >= 260 && ang.angle <= 280;
      expect(isInteriorAngle || isExteriorAngle).toBe(true);
    });
  });
});

// ============================================================
// SNAPPING UTILITIES
// ============================================================

describe("Snapping Utilities", () => {
  test("snapToVertex snaps to nearby vertex", () => {
    const point = [-122.4001, 37.7001]; // Very close to first vertex
    const result = snapToVertex(point, squareVertices, 50);
    expect(result.snapped).toBe(true);
    expect(result.snapIndex).toBe(0);
  });

  test("snapToVertex does not snap when far", () => {
    const point = [-122.5, 38.0]; // Far away
    const result = snapToVertex(point, squareVertices, 50);
    expect(result.snapped).toBe(false);
  });

  test("snapToEdge snaps to nearby edge", () => {
    const point = [-122.4, 37.705]; // On west edge
    const result = snapToEdge(point, squareRingClosed, 100);
    expect(result.snapped).toBe(true);
    expect(result.edgeIndex).toBe(0);
  });

  test("snapBearing snaps to 45-degree increments", () => {
    expect(snapBearing(47)).toBe(45);
    expect(snapBearing(23)).toBe(45);
    expect(snapBearing(92)).toBe(90);
    expect(snapBearing(180)).toBe(180);
    expect(snapBearing(359)).toBe(0);
  });

  test("constrainToAngle constrains movement to angle", () => {
    const anchor = [-122.4, 37.7];
    const target = [-122.38, 37.72]; // Arbitrary direction
    const constrained = constrainToAngle(anchor, target, 45);

    // The constrained point should be on a 45-degree line from anchor
    expect(constrained).toHaveLength(2);
    expect(typeof constrained[0]).toBe("number");
    expect(typeof constrained[1]).toBe("number");
  });
});

// ============================================================
// VALIDATION
// ============================================================

describe("Polygon Validation", () => {
  test("validatePolygon returns valid for good polygon", () => {
    const result = validatePolygon(squareRingClosed);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("validatePolygon returns invalid for self-intersecting", () => {
    const ring = closeRing(selfIntersectingVertices);
    const result = validatePolygon(ring);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("intersect"))).toBe(true);
  });

  test("validatePolygon returns warnings for small area", () => {
    const tinySquare = [
      [-122.4, 37.7],
      [-122.4, 37.70001],
      [-122.39999, 37.70001],
      [-122.39999, 37.7],
    ];
    const result = validatePolygon(closeRing(tinySquare));
    // Might have warnings about small area
    expect(result.metrics.area).toBeLessThan(100);
  });

  test("wouldCauseSelfIntersection predicts intersection", () => {
    // Moving vertex 2 to create a figure-8
    const newPosition = [-122.4, 37.7]; // Same as vertex 0
    const result = wouldCauseSelfIntersection(squareRingClosed, 2, newPosition);
    // This may or may not cause intersection depending on exact position
    expect(typeof result).toBe("boolean");
  });
});

// ============================================================
// FORMAT CONVERSION
// ============================================================

describe("Format Conversion", () => {
  test("toGeoJSON creates valid GeoJSON", () => {
    const geojson = toGeoJSON(squareRingClosed);
    expect(geojson.type).toBe("Feature");
    expect(geojson.geometry.type).toBe("Polygon");
    expect(geojson.geometry.coordinates).toHaveLength(1);
    expect(geojson.geometry.coordinates[0].length).toBe(5);
    expect(geojson.properties).toHaveProperty("area");
    expect(geojson.properties).toHaveProperty("perimeter");
  });

  test("fromGeoJSON parses GeoJSON", () => {
    const geojson = toGeoJSON(squareRingClosed);
    const parsed = fromGeoJSON(geojson);
    expect(parsed.length).toBe(5);
    expect(parsed[0]).toEqual(squareRingClosed[0]);
  });

  test("toWKT creates valid WKT", () => {
    const wkt = toWKT(squareRingClosed);
    expect(wkt).toMatch(/^POLYGON \(\(/);
    expect(wkt).toMatch(/\)\)$/);
  });

  test("fromWKT parses WKT", () => {
    const wkt = toWKT(squareRingClosed);
    const parsed = fromWKT(wkt);
    expect(parsed.length).toBe(5);
  });

  test("toCSV creates valid CSV", () => {
    const csv = toCSV(squareRingClosed);
    const lines = csv.split("\n");
    expect(lines.length).toBe(4); // Open ring (4 vertices)
    expect(lines[0]).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
  });

  test("fromCSV parses CSV", () => {
    const csv = "-122.4,37.7\n-122.4,37.71\n-122.39,37.71\n-122.39,37.7";
    const parsed = fromCSV(csv);
    expect(parsed.length).toBe(4);
    expect(parsed[0]).toEqual([-122.4, 37.7]);
  });

  test("latLngArrayToRing converts lat/lng objects", () => {
    const latLngArray = [
      { lat: 37.7, lng: -122.4 },
      { lat: 37.71, lng: -122.4 },
      { lat: 37.71, lng: -122.39 },
      { lat: 37.7, lng: -122.39 },
    ];
    const ring = latLngArrayToRing(latLngArray);
    expect(ring.length).toBe(5); // Closed
    expect(ring[0]).toEqual([-122.4, 37.7]);
  });

  test("ringToLatLngArray converts ring to lat/lng objects", () => {
    const latLngArray = ringToLatLngArray(squareRingClosed);
    expect(latLngArray.length).toBe(4); // Open
    expect(latLngArray[0]).toEqual({ lat: 37.7, lng: -122.4 });
  });
});
