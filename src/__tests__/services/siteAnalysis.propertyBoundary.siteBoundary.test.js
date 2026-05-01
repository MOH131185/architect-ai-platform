import {
  buildEstimatedBoundaryMetadata,
  detectPropertyBoundary,
  isEstimatedBoundaryResult,
  INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE,
  INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
} from "../../services/propertyBoundaryService.js";
import { assessSiteBoundaryAuthority } from "../../services/siteAnalysisService.js";
import { shouldEnableBoundaryAutoDetect } from "../../services/siteBoundaryAutoDetectPolicy.js";

const samplePolygon = [
  { lat: 53.79215, lng: -1.7554 },
  { lat: 53.79215, lng: -1.7551 },
  { lat: 53.79192, lng: -1.7551 },
  { lat: 53.79192, lng: -1.7554 },
];

describe("site boundary authority", () => {
  test("marks Intelligent Fallback metadata as estimated and non-authoritative", () => {
    const metadata = buildEstimatedBoundaryMetadata();

    expect(metadata).toMatchObject({
      boundaryAuthoritative: false,
      boundaryConfidence: INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE,
      boundarySource: INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
      fallbackReason: "No real boundary data available",
      estimatedOnly: true,
    });
  });

  test("does not treat Intelligent Fallback confidence 0.4 as authoritative", () => {
    const assessment = assessSiteBoundaryAuthority(
      {
        polygon: samplePolygon,
        source: INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
        confidence: 0.4,
        area: 119408,
        metadata: buildEstimatedBoundaryMetadata(),
      },
      { plotAreaM2: 450 },
    );

    expect(assessment.boundaryAuthoritative).toBe(false);
    expect(assessment.estimatedOnly).toBe(true);
    expect(assessment.boundaryWarningCode).toBe(
      "SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE",
    );
    expect(assessment.reasons).toEqual(
      expect.arrayContaining([
        "fallback_source",
        "low_confidence",
        "area_outlier",
      ]),
    );
    expect(assessment.authoritativeAreaM2).toBeNull();
    expect(assessment.estimatedAreaM2).toBe(119408);
  });

  test("classifies Intelligent Fallback as estimated for detection logs and UI auto-detect", () => {
    const fallbackResult = {
      polygon: samplePolygon,
      source: INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
      confidence: INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE,
      boundaryAuthoritative: false,
      estimatedOnly: true,
      metadata: buildEstimatedBoundaryMetadata(),
    };

    expect(isEstimatedBoundaryResult(fallbackResult)).toBe(true);
    expect(shouldEnableBoundaryAutoDetect(fallbackResult)).toBe(false);
    expect(
      shouldEnableBoundaryAutoDetect({
        boundarySource: "Google Places",
        boundaryConfidence: 0.4,
        boundaryAuthoritative: true,
      }),
    ).toBe(false);
    expect(
      shouldEnableBoundaryAutoDetect({
        boundarySource: "OpenStreetMap",
        boundaryConfidence: 0.92,
        boundaryAuthoritative: true,
      }),
    ).toBe(true);
  });

  test("keeps normal high-confidence boundaries authoritative", () => {
    const assessment = assessSiteBoundaryAuthority(
      {
        polygon: samplePolygon,
        source: "OpenStreetMap",
        confidence: 0.92,
        area: 520,
      },
      { plotAreaM2: 450 },
    );

    expect(assessment.boundaryAuthoritative).toBe(true);
    expect(assessment.estimatedOnly).toBe(false);
    expect(assessment.boundaryWarningCode).toBeNull();
    expect(assessment.authoritativeAreaM2).toBe(520);
  });

  test("browser-safe detection returns fallback with non-authoritative metadata", async () => {
    const boundary = await detectPropertyBoundary(
      { lat: 53.79203, lng: -1.75524 },
      "97 Bradford Street, Bradford",
    );

    expect(boundary.source).toBe(INTELLIGENT_FALLBACK_BOUNDARY_SOURCE);
    expect(boundary.confidence).toBe(INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE);
    expect(boundary.boundaryAuthoritative).toBe(false);
    expect(boundary.estimatedOnly).toBe(true);
    expect(boundary.metadata).toMatchObject({
      boundaryAuthoritative: false,
      estimatedOnly: true,
    });
  });
});
