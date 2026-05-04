import { resolveMainEntryDirection } from "../services/site/mainEntryDirectionService.js";
import { selectContextualBoundaryPolygon } from "../services/siteBoundaryAutoDetectPolicy.js";

const FULL_DIRECTION_TO_SHORT = Object.freeze({
  north: "N",
  northeast: "NE",
  east: "E",
  southeast: "SE",
  south: "S",
  southwest: "SW",
  west: "W",
  northwest: "NW",
});

export const normalizeMainEntryDirectionCode = (orientation) => {
  const raw = String(orientation || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (FULL_DIRECTION_TO_SHORT[raw.toLowerCase()]) {
    return FULL_DIRECTION_TO_SHORT[raw.toLowerCase()];
  }
  return upper;
};

const getManualMainEntryEdgeIndex = (projectDetails = {}) => {
  const candidates = [
    projectDetails.manualMainEntryEdgeIndex,
    projectDetails.manualFrontageEdgeIndex,
    projectDetails.mainEntryEdgeIndex,
    projectDetails.frontageEdgeIndex,
  ];
  const match = candidates.find((value) => Number.isFinite(Number(value)));
  return match === undefined ? null : Number(match);
};

const hasManualEntranceDirection = (projectDetails = {}) =>
  Boolean(projectDetails.entranceManualOverride) ||
  (projectDetails.entranceAutoDetected === false &&
    Boolean(projectDetails.entranceDirection) &&
    !["", "N"].includes(String(projectDetails.entranceDirection)));

const toFiniteCoordinate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeLatLngPoint = (point) => {
  if (!point || typeof point !== "object") return null;
  const lat = toFiniteCoordinate(point.lat);
  const lng = toFiniteCoordinate(point.lng ?? point.lon);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const normalizeLatLngPolygon = (polygon = []) => {
  if (!Array.isArray(polygon)) return [];
  const normalized = polygon.map(normalizeLatLngPoint).filter(Boolean);
  return normalized.length >= 3 ? normalized : [];
};

export const resolveEntranceSitePolygonForWizard = ({
  sitePolygon = [],
  locationData = null,
} = {}) => {
  const authoritativeSitePolygon = normalizeLatLngPolygon(sitePolygon);
  if (authoritativeSitePolygon.length >= 3) {
    return {
      sitePolygon: authoritativeSitePolygon,
      source: "site_polygon",
      boundaryAuthoritative: true,
      warning: null,
    };
  }

  const authoritativeCandidates = [
    locationData?.siteBoundary,
    locationData?.polygon,
    locationData?.siteAnalysis?.authoritativeSiteBoundary,
    locationData?.siteAnalysis?.siteBoundary,
    locationData?.metadata?.siteBoundary,
  ];
  const authoritativeFallback = authoritativeCandidates
    .map(normalizeLatLngPolygon)
    .find((candidate) => candidate.length >= 3);
  const boundaryAuthoritative =
    locationData?.boundaryAuthoritative === true ||
    locationData?.siteAnalysis?.boundaryAuthoritative === true ||
    locationData?.metadata?.boundaryAuthoritative === true;
  if (authoritativeFallback?.length >= 3 && boundaryAuthoritative) {
    return {
      sitePolygon: authoritativeFallback,
      source: "location_authoritative_boundary",
      boundaryAuthoritative: true,
      warning: null,
    };
  }

  const contextualBoundary = normalizeLatLngPolygon(
    selectContextualBoundaryPolygon(locationData),
  );
  if (contextualBoundary.length >= 3) {
    return {
      sitePolygon: contextualBoundary,
      source: "contextual_estimated_boundary",
      boundaryAuthoritative: false,
      warning:
        "Entrance auto-detect used an estimated site boundary; verify the parcel boundary before treating frontage as final.",
    };
  }

  return {
    sitePolygon: [],
    source: "unavailable",
    boundaryAuthoritative: false,
    warning: null,
  };
};

export const buildEntranceDetectionUnavailableResult = ({
  polygonLength = 0,
} = {}) => ({
  orientation: null,
  bearingDeg: null,
  frontageEdgeId: null,
  mainEntryEdgeId: null,
  source: "unavailable",
  confidence: 0,
  warnings: ["Site polygon required before entrance auto-detection can run."],
  direction: null,
  bearing: null,
  rationale: [
    {
      strategy: "site_polygon_required",
      weight: 0,
      message:
        "Site polygon required: draw or auto-detect a usable boundary with at least 3 points.",
    },
  ],
  label: "Site polygon required",
  edgeIndex: null,
  detectionUnavailable: true,
  code: "site_polygon_required",
  polygonLength,
});

export const buildMainEntryForWizard = ({
  projectDetails = {},
  sitePolygon = [],
  roadSegments = null,
  sunPath = null,
  ignoreManualOverride = false,
} = {}) => {
  const shouldIgnoreManualOverride = Boolean(ignoreManualOverride);
  const manualEdgeIndex = shouldIgnoreManualOverride
    ? null
    : getManualMainEntryEdgeIndex(projectDetails);
  const manualDirection =
    !shouldIgnoreManualOverride && hasManualEntranceDirection(projectDetails)
      ? projectDetails.entranceDirection
      : null;
  return resolveMainEntryDirection({
    sitePolygon,
    roadSegments,
    sunPath,
    manualEdgeIndex,
    manualDirection,
  });
};
