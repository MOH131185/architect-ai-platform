import {
  buildEntranceDetectionUnavailableResult,
  buildMainEntryForWizard,
  resolveEntranceSitePolygonForWizard,
} from "../../utils/mainEntryWizard.js";

const SQUARE_SITE = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.0001 },
  { lat: 0.0001, lng: 0.0001 },
  { lat: 0.0001, lng: 0 },
];

describe("mainEntryWizard.buildMainEntryForWizard", () => {
  test("explicit auto-detect ignores current manual SE selection and infers from roads", () => {
    const result = buildMainEntryForWizard({
      projectDetails: {
        entranceDirection: "SE",
        entranceManualOverride: true,
        entranceAutoDetected: false,
      },
      sitePolygon: SQUARE_SITE,
      roadSegments: [
        {
          name: "North Road",
          midpoint: { lat: 0.001, lng: 0.00005 },
        },
      ],
      ignoreManualOverride: true,
    });

    expect(result.source).toBe("inferred");
    expect(result.direction).toBe("north");
    expect(result.direction).not.toBe("southeast");
    expect(
      result.rationale.some((item) => item.strategy === "road_proximity"),
    ).toBe(true);
  });

  test("background auto-trigger path still respects current manual selection", () => {
    const result = buildMainEntryForWizard({
      projectDetails: {
        entranceDirection: "SE",
        entranceManualOverride: true,
        entranceAutoDetected: false,
      },
      sitePolygon: SQUARE_SITE,
      roadSegments: [
        {
          name: "North Road",
          midpoint: { lat: 0.001, lng: 0.00005 },
        },
      ],
      ignoreManualOverride: false,
    });

    expect(result.source).toBe("manual");
    expect(result.direction).toBe("southeast");
    expect(result.confidence).toBe(1);
  });
});

describe("mainEntryWizard.buildEntranceDetectionUnavailableResult", () => {
  test("returns a warning-shaped result when no usable site polygon exists", () => {
    const result = buildEntranceDetectionUnavailableResult({
      polygonLength: 2,
    });

    expect(result.source).toBe("unavailable");
    expect(result.confidence).toBe(0);
    expect(result.detectionUnavailable).toBe(true);
    expect(result.rationale[0].strategy).toBe("site_polygon_required");
    expect(result.polygonLength).toBe(2);
  });
});

describe("mainEntryWizard.resolveEntranceSitePolygonForWizard", () => {
  test("uses contextual estimated boundary when authoritative sitePolygon is empty", () => {
    const result = resolveEntranceSitePolygonForWizard({
      sitePolygon: [],
      locationData: {
        boundaryAuthoritative: false,
        boundaryEstimated: true,
        boundaryConfidence: 0.4,
        contextualSiteBoundary: SQUARE_SITE,
      },
    });

    expect(result.sitePolygon).toEqual(SQUARE_SITE);
    expect(result.source).toBe("contextual_estimated_boundary");
    expect(result.boundaryAuthoritative).toBe(false);
    expect(result.warning).toMatch(/estimated site boundary/i);
  });

  test("prefers the authoritative wizard sitePolygon when it exists", () => {
    const result = resolveEntranceSitePolygonForWizard({
      sitePolygon: SQUARE_SITE,
      locationData: {
        boundaryAuthoritative: false,
        contextualSiteBoundary: [
          { lat: 1, lng: 1 },
          { lat: 1, lng: 2 },
          { lat: 2, lng: 2 },
        ],
      },
    });

    expect(result.sitePolygon).toEqual(SQUARE_SITE);
    expect(result.source).toBe("site_polygon");
    expect(result.boundaryAuthoritative).toBe(true);
  });
});
