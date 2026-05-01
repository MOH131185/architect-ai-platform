import {
  resolveUiSiteBoundaryAuthority,
  isEstimatedSiteBoundary,
} from "../../services/siteBoundaryUiAuthority.js";
import { buildSiteContext } from "../../rings/ring1-site/siteContextBuilder.js";

const fallbackBoundary = [
  { lat: 53.591, lng: -0.689 },
  { lat: 53.591, lng: -0.687 },
  { lat: 53.59, lng: -0.687 },
  { lat: 53.59, lng: -0.689 },
];

const buildingFootprint = [
  { lat: 53.5908, lng: -0.6886 },
  { lat: 53.5908, lng: -0.6882 },
  { lat: 53.5905, lng: -0.6882 },
  { lat: 53.5905, lng: -0.6886 },
];

describe("site boundary UI authority", () => {
  test("keeps Intelligent Fallback boundary estimated and building footprint contextual", () => {
    const result = resolveUiSiteBoundaryAuthority({
      siteAnalysis: {
        boundarySource: "Intelligent Fallback",
        boundaryConfidence: 0.4,
        boundaryAuthoritative: false,
        estimatedOnly: true,
      },
      analysisBoundary: fallbackBoundary,
      detectedBuildingFootprint: buildingFootprint,
    });

    expect(
      isEstimatedSiteBoundary({ boundarySource: "Intelligent Fallback" }),
    ).toBe(true);
    expect(result.boundaryAuthoritative).toBe(false);
    expect(result.boundaryEstimated).toBe(true);
    expect(result.sitePolygon).toEqual([]);
    expect(result.detectedBuildingFootprint).toEqual(buildingFootprint);
    expect(result.contextualEstimatedBoundary).toEqual(fallbackBoundary);
    expect(result.siteBoundaryWarning).toMatch(/estimated only/i);
  });

  test("uses high-confidence parcel boundary even when a building footprint exists", () => {
    const result = resolveUiSiteBoundaryAuthority({
      siteAnalysis: {
        boundarySource: "OpenStreetMap",
        boundaryConfidence: 0.92,
        boundaryAuthoritative: true,
      },
      analysisBoundary: fallbackBoundary,
      detectedBuildingFootprint: buildingFootprint,
    });

    expect(result.boundaryAuthoritative).toBe(true);
    expect(result.boundaryEstimated).toBe(false);
    expect(result.sitePolygon).toEqual(fallbackBoundary);
    expect(result.contextualEstimatedBoundary).toEqual([]);
    expect(result.detectedBuildingFootprint).toEqual(buildingFootprint);
  });

  test("site context can preserve a footprint without using it as site metrics", () => {
    const siteContext = buildSiteContext({
      location: {
        address: "17 Kensington Road",
        coordinates: { lat: 53.591237, lng: -0.688325 },
      },
      sitePolygon: [],
      detectedBuildingFootprint: buildingFootprint,
      siteAnalysis: {},
      allowBuildingFootprintAsSitePolygon: false,
    });

    expect(siteContext.metrics).toBeNull();
    expect(siteContext.location.address).toBe("17 Kensington Road");
  });
});
