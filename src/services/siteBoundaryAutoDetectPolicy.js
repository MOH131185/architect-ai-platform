const ESTIMATED_BOUNDARY_WARNING_CODE =
  "SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE";
const BOUNDARY_AUTHORITY_CONFIDENCE_THRESHOLD = 0.6;

function hasUsablePolygon(polygon) {
  return Array.isArray(polygon) && polygon.length >= 3;
}

function firstUsablePolygon(candidates = []) {
  return candidates.find(hasUsablePolygon) || [];
}

function getBoundaryConfidence(locationData = {}) {
  const confidence = Number(
    locationData.boundaryConfidence ??
      locationData.confidence ??
      locationData.siteAnalysis?.boundaryConfidence ??
      locationData.siteAnalysis?.confidence ??
      locationData.metadata?.boundaryConfidence,
  );

  return Number.isFinite(confidence) ? confidence : null;
}

function hasEstimatedBoundarySource(locationData = {}) {
  const source = String(
    locationData.boundarySource ||
      locationData.siteAnalysis?.boundarySource ||
      locationData.metadata?.boundarySource ||
      "",
  );

  return /intelligent fallback|fallback|remote-site placeholder/i.test(source);
}

/**
 * True when the site boundary is the dashed-amber 50 m × 50 m placeholder
 * surfaced by `/api/site/boundary` for remote/desert/unmapped locations.
 * Distinct from the "intelligent fallback" path because this placeholder
 * is generated server-side after both OSM evidence AND a highway-density
 * probe come back empty — strongest signal we have for "no data here".
 */
export function hasRemoteSitePlaceholder(locationData = {}) {
  if (!locationData) return false;
  if (
    locationData.placeholder === true ||
    locationData.siteAnalysis?.placeholder === true ||
    locationData.metadata?.placeholder === true
  ) {
    return true;
  }
  const source = String(
    locationData.boundarySource ||
      locationData.siteAnalysis?.boundarySource ||
      locationData.metadata?.boundarySource ||
      "",
  );
  return /remote-site placeholder/i.test(source);
}

export function shouldEnableBoundaryAutoDetect(locationData = null) {
  if (!locationData) return true;

  if (
    locationData.boundaryAuthoritative === false ||
    locationData.siteAnalysis?.boundaryAuthoritative === false ||
    locationData.metadata?.boundaryAuthoritative === false
  ) {
    return false;
  }

  if (
    locationData.boundaryEstimated === true ||
    locationData.estimatedOnly === true ||
    locationData.siteAnalysis?.boundaryEstimated === true ||
    locationData.siteAnalysis?.estimatedOnly === true ||
    locationData.metadata?.estimatedOnly === true
  ) {
    return false;
  }

  if (
    locationData.boundaryWarningCode === ESTIMATED_BOUNDARY_WARNING_CODE ||
    locationData.siteAnalysis?.boundaryWarningCode ===
      ESTIMATED_BOUNDARY_WARNING_CODE
  ) {
    return false;
  }

  if (hasEstimatedBoundarySource(locationData)) {
    return false;
  }

  const confidence = getBoundaryConfidence(locationData);
  if (
    confidence !== null &&
    confidence < BOUNDARY_AUTHORITY_CONFIDENCE_THRESHOLD
  ) {
    return false;
  }

  return true;
}

export function selectContextualBoundaryPolygon(locationData = null) {
  if (!locationData || shouldEnableBoundaryAutoDetect(locationData)) {
    return [];
  }

  return firstUsablePolygon([
    locationData.buildingFootprint,
    locationData.detectedBuildingFootprint,
    locationData.siteAnalysis?.buildingFootprint,
    locationData.siteAnalysis?.detectedBuildingFootprint,
    locationData.metadata?.buildingFootprint,
    locationData.contextualSiteBoundary,
    locationData.estimatedSiteBoundary,
    locationData.siteBoundary,
    locationData.polygon,
    locationData.siteAnalysis?.contextualSiteBoundary,
    locationData.siteAnalysis?.estimatedSiteBoundary,
    locationData.siteAnalysis?.siteBoundary,
    locationData.metadata?.contextualSiteBoundary,
    locationData.metadata?.estimatedSiteBoundary,
  ]);
}

export default shouldEnableBoundaryAutoDetect;
