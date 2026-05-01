const ESTIMATED_BOUNDARY_WARNING_CODE =
  "SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE";
const BOUNDARY_AUTHORITY_CONFIDENCE_THRESHOLD = 0.6;

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

  return /intelligent fallback|fallback/i.test(source);
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

export default shouldEnableBoundaryAutoDetect;
