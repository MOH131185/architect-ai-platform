/**
 * Pipeline Mode Configuration
 *
 * Reads PIPELINE_MODE from environment and returns the effective mode.
 * No more hardcoded MULTI_PANEL override.
 */

export const PIPELINE_MODE = {
  SINGLE_SHOT: "single_shot",
  MULTI_PANEL: "multi_panel",
  GEOMETRY_FIRST: "geometry_first",
  HYBRID_OPENAI: "hybrid_openai",
};

export const TECHNICAL_PANELS = ["floor_plan", "elevation", "section"];
export const STYLED_3D_PANELS = ["perspective", "3d_view"];

export const PIPELINE_TECHNICAL_PANELS = TECHNICAL_PANELS;
export const PIPELINE_3D_PANELS = STYLED_3D_PANELS;

/**
 * Normalise a raw mode string to a known PIPELINE_MODE value.
 */
function normaliseMode(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/[-\s]/g, "_");
  if (s === "single_shot" || s === "singleshot")
    return PIPELINE_MODE.SINGLE_SHOT;
  if (s === "multi_panel" || s === "multipanel")
    return PIPELINE_MODE.MULTI_PANEL;
  if (s === "geometry_first" || s === "geometryfirst")
    return PIPELINE_MODE.GEOMETRY_FIRST;
  if (s === "hybrid_openai" || s === "hybridopenai" || s === "hybrid")
    return PIPELINE_MODE.HYBRID_OPENAI;
  return null;
}

export function isOption2Mode(mode) {
  return mode === PIPELINE_MODE.GEOMETRY_FIRST;
}

/**
 * Get the effective pipeline mode.
 *
 * Priority:
 *   1. REACT_APP_PIPELINE_MODE (browser env via CRA)
 *   2. PIPELINE_MODE (server env / .env)
 *   3. Default: MULTI_PANEL
 */
export function getCurrentPipelineMode() {
  // Browser (CRA injects REACT_APP_ prefixed vars)
  const browserMode =
    typeof process !== "undefined" && process.env?.REACT_APP_PIPELINE_MODE;
  if (browserMode) {
    const norm = normaliseMode(browserMode);
    if (norm) return norm;
  }

  // Server / .env
  const serverMode =
    typeof process !== "undefined" && process.env?.PIPELINE_MODE;
  if (serverMode) {
    const norm = normaliseMode(serverMode);
    if (norm) return norm;
  }

  // Default
  return PIPELINE_MODE.MULTI_PANEL;
}

export function logPipelineConfig() {
  const mode = getCurrentPipelineMode();
  console.log("Pipeline Mode:", mode);
  return mode;
}

export default PIPELINE_MODE;
