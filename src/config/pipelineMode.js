/**
 * Pipeline Mode Configuration
 * Stub implementation
 */

export const PIPELINE_MODE = {
  SINGLE_SHOT: "single_shot",
  MULTI_PANEL: "multi_panel",
  GEOMETRY_FIRST: "geometry_first",
};

export const TECHNICAL_PANELS = ["floor_plan", "elevation", "section"];
export const STYLED_3D_PANELS = ["perspective", "3d_view"];

export const PIPELINE_TECHNICAL_PANELS = TECHNICAL_PANELS;
export const PIPELINE_3D_PANELS = STYLED_3D_PANELS;

export function isOption2Mode(mode) {
  return mode === PIPELINE_MODE.GEOMETRY_FIRST;
}

export function getCurrentPipelineMode() {
  return PIPELINE_MODE.MULTI_PANEL;
}

export function logPipelineConfig() {
  console.log("Pipeline Mode:", getCurrentPipelineMode());
}

export default PIPELINE_MODE;
