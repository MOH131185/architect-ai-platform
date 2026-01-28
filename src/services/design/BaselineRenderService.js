/**
 * Baseline Render Service - Stub
 */

export const BASELINE_VIEW_TYPES = {
  FLOOR_PLAN: "floor_plan",
  ELEVATION: "elevation",
  SECTION: "section",
};

export function requiresBaselineControl(panelType) {
  return false;
}

export function getBaselineForPanel(data, panelType) {
  return null;
}

export function applyBaselineControl(params) {
  return params;
}

export default {
  BASELINE_VIEW_TYPES,
  requiresBaselineControl,
  getBaselineForPanel,
  applyBaselineControl,
};
