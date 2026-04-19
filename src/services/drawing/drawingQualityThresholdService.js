import { isFeatureEnabled } from "../../config/featureFlags.js";

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
  const base =
    DRAWING_THRESHOLDS[String(drawingType || "").toLowerCase()] ||
    DRAWING_THRESHOLDS.unknown;

  if (!isFeatureEnabled("useDrawingFragmentScoringPhase9")) {
    return base;
  }

  if (drawingType === "plan") {
    return {
      ...base,
      warning: 0.75,
      blocking: 0.65,
      minimumPlanDensity: 0.6,
      minimumGeometryCompleteness: 0.56,
    };
  }
  if (drawingType === "elevation") {
    return {
      ...base,
      warning: 0.73,
      blocking: 0.63,
      minimumGeometryCompleteness: 0.56,
      minimumElevationRichness: 0.62,
    };
  }
  if (drawingType === "section") {
    return {
      ...base,
      warning: 0.77,
      blocking: 0.67,
      minimumGeometryCompleteness: 0.56,
      minimumSectionUsefulness: 0.68,
    };
  }

  return base;
}

export default {
  getDrawingQualityThresholds,
};
