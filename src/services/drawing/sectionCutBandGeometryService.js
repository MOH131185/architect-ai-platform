import { isFeatureEnabled } from "../../config/featureFlags.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function uniqueNumbers(values = []) {
  return [
    ...new Set(
      (values || [])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => round(entry)),
    ),
  ].sort((left, right) => left - right);
}

function phase21TrueSectioningEnabled() {
  return (
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase21")
  );
}

export function buildSectionCutBandGeometry(sectionCut = {}, options = {}) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const phase21 = phase21TrueSectioningEnabled();
  const directBandWidth = Math.max(
    0.04,
    Number(options.directBand || (phase21 ? 0.12 : 0.14)),
  );
  const directHalfBand = directBandWidth / 2;
  const contextualHalfBand = Math.max(
    directHalfBand,
    Number(options.nearBand || (phase21 ? 0.8 : 0.9)),
  );
  return {
    axis,
    orthAxis: axis === "x" ? "y" : "x",
    coordinate: round(coordinate),
    direct: {
      minimum: round(coordinate - directHalfBand),
      maximum: round(coordinate + directHalfBand),
      width: round(directBandWidth),
    },
    contextual: {
      minimum: round(coordinate - contextualHalfBand),
      maximum: round(coordinate + contextualHalfBand),
      width: round(contextualHalfBand * 2),
    },
    phase21,
  };
}

export function resolveCutBandSampleCoordinates(
  cutBand = null,
  { sampleCount = 3, includeContextual = false } = {},
) {
  if (!cutBand) {
    return [];
  }
  const phase21 = cutBand.phase21 || phase21TrueSectioningEnabled();
  const baseSampleCount = Math.max(3, Math.trunc(Number(sampleCount || 3)));
  const resolvedSampleCount = phase21
    ? Math.max(baseSampleCount, 9)
    : baseSampleCount;
  const directValues = [];
  if (resolvedSampleCount <= 1) {
    directValues.push(cutBand.coordinate);
  } else {
    for (let index = 0; index < resolvedSampleCount; index += 1) {
      const ratio =
        resolvedSampleCount === 1 ? 0.5 : index / (resolvedSampleCount - 1);
      directValues.push(cutBand.direct.minimum + cutBand.direct.width * ratio);
    }
  }

  if (!includeContextual) {
    return uniqueNumbers([
      cutBand.direct.minimum,
      ...directValues,
      cutBand.coordinate,
      cutBand.direct.maximum,
    ]);
  }

  return uniqueNumbers([
    cutBand.contextual.minimum,
    cutBand.direct.minimum,
    ...directValues,
    cutBand.coordinate,
    cutBand.direct.maximum,
    cutBand.contextual.maximum,
  ]);
}

export function measureBandCoverage(
  sampleCoordinates = [],
  profileSegments = [],
) {
  const grouped = new Map();
  (profileSegments || []).forEach((segment) => {
    const key = round(segment.coordinate);
    const bucket = grouped.get(key) || [];
    bucket.push(segment);
    grouped.set(key, bucket);
  });
  const hitSampleCount = (sampleCoordinates || []).filter(
    (coordinate) => (grouped.get(round(coordinate)) || []).length > 0,
  ).length;
  const sampleCount = Math.max(1, Number(sampleCoordinates?.length || 0));
  return {
    sampleCount,
    hitSampleCount,
    coverageRatio: round(hitSampleCount / sampleCount),
  };
}

export function computeProfileContinuityMetric(profileSegments = []) {
  if (!Array.isArray(profileSegments) || profileSegments.length < 2) {
    return 0;
  }
  const sorted = [...profileSegments].sort(
    (left, right) => Number(left.coordinate) - Number(right.coordinate),
  );
  let matched = 0;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (!current || !next) {
      continue;
    }
    const orthOverlap =
      Math.min(Number(current.end), Number(next.end)) -
      Math.max(Number(current.start), Number(next.start));
    if (Number.isFinite(orthOverlap) && orthOverlap > 0) {
      matched += 1;
    }
  }
  const denominator = Math.max(1, sorted.length - 1);
  return round(matched / denominator);
}

export function classifyCutTruthKind({
  bandCoverageRatio = 0,
  exactProfileClipCount = 0,
  profileContinuity = 0,
  nearBoolean = false,
  directBandHit = false,
  midpointInsidePolygon = false,
}) {
  if (!directBandHit && !midpointInsidePolygon) {
    return "unsupported";
  }
  const coverage = Number(bandCoverageRatio || 0);
  const exactCount = Number(exactProfileClipCount || 0);
  const continuity = Number(profileContinuity || 0);
  if (nearBoolean && coverage >= 0.6 && exactCount >= 2 && continuity >= 0.34) {
    return "cut_face";
  }
  if (nearBoolean || (coverage >= 0.34 && exactCount >= 1)) {
    return "cut_profile";
  }
  if (midpointInsidePolygon || coverage >= 0.18) {
    return "contextual_profile";
  }
  return "derived_profile";
}

export default {
  buildSectionCutBandGeometry,
  resolveCutBandSampleCoordinates,
  measureBandCoverage,
  computeProfileContinuityMetric,
  classifyCutTruthKind,
};
