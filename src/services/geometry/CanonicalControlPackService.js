/**
 * Canonical Control Pack Service - Stub
 */

export const CONTROL_PACK_VIEWS = ["hero_3d", "interior_3d", "axonometric"];

export function generateControlPack(dna) {
  return {
    views: {},
    metadata: { timestamp: Date.now() },
  };
}

export function hasControlPack(data) {
  return !!(data && data.controlPack);
}

export function getControlForPanel(pack, panelType) {
  return null;
}

export function getControlPackDebugReport(pack) {
  return { status: "stub" };
}

export function validateControlPack(pack) {
  return { valid: true, errors: [] };
}

// Map panels to their canonical control views
export const PANEL_TO_CONTROL_MAP = {
  hero_3d: "hero_3d",
  interior_3d: "interior_3d",
  axonometric: "axonometric",
};

export function saveControlPackToDebugFolder(pack, folder) {
  return null;
}

export default {
  CONTROL_PACK_VIEWS,
  PANEL_TO_CONTROL_MAP,
  generateControlPack,
  hasControlPack,
  getControlForPanel,
  getControlPackDebugReport,
  validateControlPack,
  saveControlPackToDebugFolder,
};
