const DRAWING_THRESHOLDS = {
  plan: {
    pass: 0.82,
    warning: 0.72,
    blocking: 0.62,
    minimumAnnotationCompleteness: 0.72,
    minimumLabelPresence: 0.72,
    minimumGeometryCompleteness: 0.5,
    minimumPlanDensity: 0.56,
  },
  elevation: {
    pass: 0.8,
    warning: 0.7,
    blocking: 0.6,
    minimumAnnotationCompleteness: 0.66,
    minimumGeometryCompleteness: 0.5,
    minimumElevationRichness: 0.54,
  },
  section: {
    pass: 0.84,
    warning: 0.74,
    blocking: 0.64,
    minimumAnnotationCompleteness: 0.72,
    minimumGeometryCompleteness: 0.5,
    minimumSectionUsefulness: 0.62,
  },
  unknown: {
    pass: 0.78,
    warning: 0.68,
    blocking: 0.58,
    minimumAnnotationCompleteness: 0.68,
    minimumGeometryCompleteness: 0.5,
  },
};

export function getDrawingQualityThresholds(drawingType = "unknown") {
  return (
    DRAWING_THRESHOLDS[String(drawingType || "").toLowerCase()] ||
    DRAWING_THRESHOLDS.unknown
  );
}

export default {
  getDrawingQualityThresholds,
};
