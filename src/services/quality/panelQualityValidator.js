/**
 * Panel Quality Validator
 *
 * Provides lightweight panel checks for image presence and minimum resolution.
 */

export const QUALITY_THRESHOLDS = {
  minConsistencyScore: 0.75,
  minResolution: 512,
  minAspectRatio: 0.25,
  maxAspectRatio: 4.0,
};

function readResolution(panel) {
  const width = Number(panel?.width || panel?.meta?.width || 0);
  const height = Number(panel?.height || panel?.meta?.height || 0);
  return { width, height };
}

export function validatePanel(panel) {
  const issues = [];
  let score = 1;

  if (!panel?.imageUrl) {
    issues.push("missing_image_url");
    score -= 0.55;
  }

  const { width, height } = readResolution(panel);
  if (width > 0 && height > 0) {
    if (width < QUALITY_THRESHOLDS.minResolution) {
      issues.push(`width_below_min_${QUALITY_THRESHOLDS.minResolution}`);
      score -= 0.15;
    }
    if (height < QUALITY_THRESHOLDS.minResolution) {
      issues.push(`height_below_min_${QUALITY_THRESHOLDS.minResolution}`);
      score -= 0.15;
    }

    const aspect = width / height;
    if (
      aspect < QUALITY_THRESHOLDS.minAspectRatio ||
      aspect > QUALITY_THRESHOLDS.maxAspectRatio
    ) {
      issues.push("invalid_aspect_ratio");
      score -= 0.1;
    }
  } else {
    issues.push("missing_resolution_metadata");
    score -= 0.15;
  }

  if (!panel?.prompt) {
    issues.push("missing_prompt_metadata");
    score -= 0.05;
  }

  score = Math.max(0, Math.min(1, score));
  const passed = score >= QUALITY_THRESHOLDS.minConsistencyScore;

  return {
    passed,
    score,
    issues,
  };
}

export function validatePanelBatch(panels = []) {
  const results = (panels || []).map((panel) => ({
    panel,
    validation: validatePanel(panel),
  }));

  const failed = results.filter((r) => !r.validation.passed);
  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.validation.score, 0) / results.length
      : 1;

  return {
    passed: failed.length === 0,
    score: averageScore,
    total: results.length,
    failedCount: failed.length,
    results,
  };
}

export function getPanelsForRegeneration(panels = []) {
  return (panels || []).filter((panel) => {
    if (panel?.validation) {
      return panel.validation.passed === false;
    }
    return !validatePanel(panel).passed;
  });
}

export default {
  QUALITY_THRESHOLDS,
  validatePanel,
  validatePanelBatch,
  getPanelsForRegeneration,
};
