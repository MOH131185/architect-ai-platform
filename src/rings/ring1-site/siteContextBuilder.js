import { computeSunPath, deriveFacadeOrientation } from './solarEngine.js';
import { buildBoundaryContext } from './boundaryValidator.js';
import { getClimateDesignRules } from './climateRules.js';
import { computeSiteMetrics } from '../../utils/geometry.js';

function resolveSitePolygon({
  sitePolygon,
  detectedBuildingFootprint,
  siteAnalysis
}) {
  if (sitePolygon && sitePolygon.length >= 3) {
    return sitePolygon;
  }
  if (detectedBuildingFootprint && detectedBuildingFootprint.length >= 3) {
    return detectedBuildingFootprint;
  }
  if (siteAnalysis?.siteBoundary && siteAnalysis.siteBoundary.length >= 3) {
    return siteAnalysis.siteBoundary;
  }
  return null;
}

export function buildSiteContext({
  location,
  sitePolygon,
  detectedBuildingFootprint,
  siteAnalysis,
  climate,
  seasonalClimate,
  streetContext
} = {}) {
  if (!location?.coordinates) {
    return null;
  }

  const coordinates = location.coordinates;
  const polygon = resolveSitePolygon({
    sitePolygon,
    detectedBuildingFootprint,
    siteAnalysis
  });

  const boundaryContext = buildBoundaryContext({
    sitePolygon: polygon,
    coordinates,
    siteAnalysis,
    setbacks: siteAnalysis?.constraints,
    orientationDeg: siteAnalysis?.orientationDeg
  });

  const solar = computeSunPath(
    coordinates.lat,
    coordinates.lng,
    {
      preferredOrientationDeg: siteAnalysis?.optimalBuildingOrientation
    }
  );

  const climateRules = getClimateDesignRules(climate?.type, {
    solar,
    boundaryContext
  });

  const computedMetrics = polygon ? computeSiteMetrics(polygon) : null;
  const facadeOrientation = deriveFacadeOrientation({
    solar,
    streetContext
  });

  return {
    location: {
      address: location.address,
      coordinates
    },
    boundaries: boundaryContext,
    solar,
    climate: {
      type: climate?.type || 'Temperate Oceanic',
      seasonal: seasonalClimate?.seasonal || climate?.seasonal || {},
      rules: climateRules
    },
    street: streetContext || null,
    metrics: computedMetrics,
    facadeOrientation,
    timestamp: new Date().toISOString()
  };
}

