const DRAWING_THRESHOLDS = {
  plan: {
    blocking: 0.68,
    warning: 0.8,
    minimumAnnotationCompleteness: 0.72,
    minimumLabelPresence: 0.7,
  },
  elevation: {
    blocking: 0.64,
    warning: 0.76,
    minimumAnnotationCompleteness: 0.68,
  },
  section: {
    blocking: 0.7,
    warning: 0.82,
    minimumAnnotationCompleteness: 0.74,
    minimumSectionUsefulness: 0.62,
  },
  unknown: {
    blocking: 0.65,
    warning: 0.75,
    minimumAnnotationCompleteness: 0.68,
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
