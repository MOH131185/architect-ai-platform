export const ESTIMATED_SITE_BOUNDARY_WARNING =
  "Site boundary is estimated only; verify the parcel boundary by survey before treating area or setbacks as authoritative.";

function hasUsablePolygon(polygon = []) {
  return Array.isArray(polygon) && polygon.length >= 3;
}

function boundarySourceLooksEstimated(source = "") {
  return /intelligent fallback|fallback|estimated/i.test(String(source || ""));
}

export function isEstimatedSiteBoundary(siteAnalysis = {}) {
  const confidence = Number(
    siteAnalysis?.boundaryConfidence ?? siteAnalysis?.confidence,
  );
  return (
    siteAnalysis?.boundaryAuthoritative === false ||
    siteAnalysis?.boundaryEstimated === true ||
    siteAnalysis?.estimatedOnly === true ||
    boundarySourceLooksEstimated(
      siteAnalysis?.boundarySource || siteAnalysis?.source,
    ) ||
    (Number.isFinite(confidence) && confidence < 0.6)
  );
}

export function resolveUiSiteBoundaryAuthority({
  siteAnalysis = {},
  analysisBoundary = [],
  estimatedBoundary = [],
  existingPolygon = [],
  detectedBuildingFootprint = [],
} = {}) {
  const analysisBoundaryEstimated = isEstimatedSiteBoundary(siteAnalysis);
  const authoritativeAnalysisBoundary =
    !analysisBoundaryEstimated && hasUsablePolygon(analysisBoundary)
      ? analysisBoundary
      : [];
  const contextualEstimatedBoundary = analysisBoundaryEstimated
    ? hasUsablePolygon(estimatedBoundary)
      ? estimatedBoundary
      : hasUsablePolygon(analysisBoundary)
        ? analysisBoundary
        : []
    : [];
  const existingAuthoritativeFallback =
    !analysisBoundaryEstimated &&
    !hasUsablePolygon(authoritativeAnalysisBoundary) &&
    !hasUsablePolygon(detectedBuildingFootprint) &&
    hasUsablePolygon(existingPolygon)
      ? existingPolygon
      : [];
  const sitePolygon = hasUsablePolygon(authoritativeAnalysisBoundary)
    ? authoritativeAnalysisBoundary
    : existingAuthoritativeFallback;
  const boundaryAuthoritative =
    hasUsablePolygon(sitePolygon) && !analysisBoundaryEstimated;

  return {
    sitePolygon,
    boundaryAuthoritative,
    boundaryEstimated: analysisBoundaryEstimated,
    contextualEstimatedBoundary,
    detectedBuildingFootprint: hasUsablePolygon(detectedBuildingFootprint)
      ? detectedBuildingFootprint
      : [],
    siteBoundaryWarning: analysisBoundaryEstimated
      ? siteAnalysis?.boundaryWarning || ESTIMATED_SITE_BOUNDARY_WARNING
      : null,
  };
}

export default {
  ESTIMATED_SITE_BOUNDARY_WARNING,
  isEstimatedSiteBoundary,
  resolveUiSiteBoundaryAuthority,
};
