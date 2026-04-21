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

export function buildSectionCutBandGeometry(sectionCut = {}, options = {}) {
  const axis = sectionCut.axis || "x";
  const coordinate = Number(sectionCut.coordinate || 0);
  const directBandWidth = Math.max(0.04, Number(options.directBand || 0.14));
  const directHalfBand = directBandWidth / 2;
  const contextualHalfBand = Math.max(
    directHalfBand,
    Number(options.nearBand || 0.9),
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
  };
}

export function resolveCutBandSampleCoordinates(
  cutBand = null,
  { sampleCount = 3, includeContextual = false } = {},
) {
  if (!cutBand) {
    return [];
  }
  const resolvedSampleCount = Math.max(3, Math.trunc(Number(sampleCount || 3)));
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

export default {
  buildSectionCutBandGeometry,
  resolveCutBandSampleCoordinates,
  measureBandCoverage,
};
