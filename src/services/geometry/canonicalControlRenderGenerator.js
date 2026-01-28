/**
 * Canonical Control Render Generator - Stub
 */

export function hasControlRenders(data) {
  return false;
}

export function getControlImageForPanel(data, panelType) {
  return null;
}

export function getControlImageDebugReport(data) {
  return {};
}

export function generateCanonicalControlRenders(dna) {
  return {
    renders: {},
    timestamp: Date.now(),
  };
}

export function requireControlImageForPanel(data, panelType) {
  return null;
}

export default {
  hasControlRenders,
  getControlImageForPanel,
  getControlImageDebugReport,
  generateCanonicalControlRenders,
  requireControlImageForPanel,
};
