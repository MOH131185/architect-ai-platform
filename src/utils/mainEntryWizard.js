import { resolveMainEntryDirection } from "../services/site/mainEntryDirectionService.js";

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
