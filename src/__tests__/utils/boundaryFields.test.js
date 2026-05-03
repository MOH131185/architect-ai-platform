import {
  buildManualVerifiedBoundary,
  normalizeBoundaryAreaFields,
  normalizeAreaM2,
  readBoundaryAreaM2,
  validateBoundaryPolygonForManualVerification,
} from "../../utils/boundaryFields.js";

describe("boundaryFields.normalizeAreaM2", () => {
  test("prefers areaM2 when present", () => {
    const result = normalizeAreaM2({
      areaM2: 425,
      area: 999,
      surfaceAreaM2: 111,
    });
    expect(result.areaM2).toBe(425);
    expect(result.area).toBe(425);
    expect(result.surfaceAreaM2).toBe(425);
  });

  test("falls back to legacy `area` when areaM2 missing", () => {
    const result = normalizeAreaM2({ area: 320 });
    expect(result.areaM2).toBe(320);
    expect(result.area).toBe(320);
    expect(result.surfaceAreaM2).toBe(320);
  });

  test("reads from metadata.areaM2 when top-level missing", () => {
    const result = normalizeAreaM2({ metadata: { areaM2: 540 } });
    expect(result.areaM2).toBe(540);
  });

  test("returns 0 area when no candidate is finite", () => {
    const result = normalizeAreaM2({ shapeType: "rectangle" });
    expect(result.areaM2).toBe(0);
  });

  test("preserves all other fields (does not mutate input)", () => {
    const input = {
      area: 100,
      shapeType: "rectangle",
      polygon: [{ lat: 0, lng: 0 }],
    };
    const result = normalizeAreaM2(input);
    expect(result.shapeType).toBe("rectangle");
    expect(result.polygon).toBe(input.polygon);
    // input must not have been mutated
    expect(input.areaM2).toBeUndefined();
  });

  test("returns null for null input", () => {
    expect(normalizeAreaM2(null)).toBeNull();
    expect(normalizeAreaM2(undefined)).toBeNull();
  });
});

describe("boundaryFields.normalizeBoundaryAreaFields", () => {
  test("normalizes area, areaM2, and surfaceAreaM2 consistently", () => {
    const result = normalizeBoundaryAreaFields({ surfaceAreaM2: "640" });
    expect(result.area).toBe(640);
    expect(result.areaM2).toBe(640);
    expect(result.surfaceAreaM2).toBe(640);
  });
});

describe("boundaryFields.readBoundaryAreaM2", () => {
  test("returns areaM2 when set", () => {
    expect(readBoundaryAreaM2({ areaM2: 250 })).toBe(250);
  });

  test("falls back to area, then surfaceAreaM2, then 0", () => {
    expect(readBoundaryAreaM2({ area: 180 })).toBe(180);
    expect(readBoundaryAreaM2({ surfaceAreaM2: 90 })).toBe(90);
    expect(readBoundaryAreaM2({ shapeType: "x" })).toBe(0);
  });

  test("rejects non-finite numbers", () => {
    expect(readBoundaryAreaM2({ area: "not a number" })).toBe(0);
    expect(readBoundaryAreaM2({ area: NaN })).toBe(0);
  });
});

describe("manual verified boundary contract", () => {
  const validPolygon = [
    { lat: 52.0, lng: -1.0 },
    { lat: 52.0, lng: -0.999 },
    { lat: 52.001, lng: -0.999 },
    { lat: 52.001, lng: -1.0 },
  ];

  const bowTiePolygon = [
    { lat: 52.0, lng: -1.0 },
    { lat: 52.001, lng: -0.999 },
    { lat: 52.0, lng: -0.999 },
    { lat: 52.001, lng: -1.0 },
  ];

  test("rejects self-intersecting polygons", () => {
    const validation =
      validateBoundaryPolygonForManualVerification(bowTiePolygon);
    expect(validation.valid).toBe(false);
    expect(validation.isSelfIntersecting).toBe(true);
  });

  test("invalid polygon does not become manual_verified", () => {
    const result = buildManualVerifiedBoundary({ polygon: bowTiePolygon });
    expect(result.invalid).toBe(true);
    expect(result.boundaryAuthoritative).toBe(false);
    expect(result.boundarySource).not.toBe("manual_verified");
  });

  test("valid polygon emits a complete manual_verified boundary", () => {
    const result = buildManualVerifiedBoundary({ polygon: validPolygon });
    expect(result.boundaryAuthoritative).toBe(true);
    expect(result.boundarySource).toBe("manual_verified");
    expect(result.source).toBe("manual_verified");
    expect(result.boundaryConfidence).toBe(1);
    expect(result.confidence).toBe(1);
    expect(result.areaM2).toBeGreaterThan(0);
    expect(result.area).toBe(result.areaM2);
    expect(result.surfaceAreaM2).toBe(result.areaM2);
    expect(result.perimeterM).toBeGreaterThan(0);
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.estimateReason).toBeNull();
    expect(result.estimatedOnly).toBe(false);
    expect(result.policyVersion).toMatch(/^site-boundary-policy-/);
    // PR-C re-review blocker 1: explicit verified flags on the valid path.
    expect(result.manualVerified).toBe(true);
    expect(result.clearManualVerified).toBe(false);
  });
});

// PR-C re-review blocker 1: parents that previously stored a manual_verified
// boundary need an explicit clear signal when the polygon is cleared,
// becomes invalid, or self-intersects. Verify the clear payload shape so
// SiteBoundaryEditorV2 + ArchitectAIWizardContainer.handleBoundaryUpdated
// stay in lock-step.
describe("manual boundary clear / invalid contract (PR-C blocker 1)", () => {
  test("empty polygon emits a clear payload with clearManualVerified=true", () => {
    const result = buildManualVerifiedBoundary({ polygon: [] });
    expect(result.invalid).toBe(true);
    expect(result.boundaryAuthoritative).toBe(false);
    expect(result.boundarySource).toBe("manual_invalid");
    expect(result.source).toBe("manual_invalid");
    expect(result.boundaryConfidence).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.estimatedOnly).toBe(true);
    expect(result.manualVerified).toBe(false);
    expect(result.clearManualVerified).toBe(true);
    expect(result.reason).toBe("manual_boundary_invalid_or_cleared");
    expect(result.areaM2).toBe(0);
  });

  test("polygon with fewer than 3 points emits a clear payload", () => {
    const result = buildManualVerifiedBoundary({
      polygon: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.001 },
      ],
    });
    expect(result.invalid).toBe(true);
    expect(result.clearManualVerified).toBe(true);
    expect(result.manualVerified).toBe(false);
    expect(result.reason).toBe("manual_boundary_invalid_or_cleared");
  });

  test("self-intersecting polygon emits a clear payload", () => {
    const bowTie = [
      { lat: 52.0, lng: -1.0 },
      { lat: 52.001, lng: -0.999 },
      { lat: 52.0, lng: -0.999 },
      { lat: 52.001, lng: -1.0 },
    ];
    const result = buildManualVerifiedBoundary({ polygon: bowTie });
    expect(result.invalid).toBe(true);
    expect(result.clearManualVerified).toBe(true);
    expect(result.manualVerified).toBe(false);
    expect(result.estimateReason).toBe("self_intersecting");
  });

  test("clear payload preserves estimateReason from validator while still flagging clearManualVerified", () => {
    const result = buildManualVerifiedBoundary({ polygon: [] });
    // estimateReason carries the granular validator code; reason carries the
    // human-facing top-level signal the parent should display in the UI.
    expect(result.estimateReason).toBe("too_few_points");
    expect(result.reason).toBe("manual_boundary_invalid_or_cleared");
  });
});

describe("area normalization fallback chain (PR-C blocker 2)", () => {
  test("preserves area when only surfaceAreaM2 is set", () => {
    expect(readBoundaryAreaM2({ surfaceAreaM2: 1234 })).toBe(1234);
    const normalized = normalizeBoundaryAreaFields({ surfaceAreaM2: 1234 });
    expect(normalized.area).toBe(1234);
    expect(normalized.areaM2).toBe(1234);
    expect(normalized.surfaceAreaM2).toBe(1234);
  });

  test("preserves area when only surfaceArea is set", () => {
    expect(readBoundaryAreaM2({ surfaceArea: 880 })).toBe(880);
    const normalized = normalizeBoundaryAreaFields({ surfaceArea: 880 });
    expect(normalized.area).toBe(880);
    expect(normalized.areaM2).toBe(880);
    expect(normalized.surfaceAreaM2).toBe(880);
  });

  test("priority: areaM2 > area > surfaceAreaM2 > surfaceArea", () => {
    expect(
      readBoundaryAreaM2({
        areaM2: 1,
        area: 2,
        surfaceAreaM2: 3,
        surfaceArea: 4,
      }),
    ).toBe(1);
    expect(
      readBoundaryAreaM2({ area: 2, surfaceAreaM2: 3, surfaceArea: 4 }),
    ).toBe(2);
    expect(readBoundaryAreaM2({ surfaceAreaM2: 3, surfaceArea: 4 })).toBe(3);
    expect(readBoundaryAreaM2({ surfaceArea: 4 })).toBe(4);
    expect(readBoundaryAreaM2({})).toBe(0);
  });

  test("metadata.surfaceArea is honoured when top-level is missing", () => {
    expect(readBoundaryAreaM2({ metadata: { surfaceArea: 555 } })).toBe(555);
  });
});
