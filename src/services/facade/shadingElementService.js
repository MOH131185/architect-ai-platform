import { createStableId } from "../cad/projectGeometrySchema.js";

export function buildShadingElements({
  projectGeometry = {},
  facadeOrientation = {},
  styleDNA = {},
  componentFamily = {},
} = {}) {
  const shadingType =
    componentFamily.shading_family ||
    facadeOrientation.shading_elements?.[0] ||
    "slender-overhang";
  const count = shadingType === "vertical-fins" ? 4 : 2;

  return Array.from({ length: count }, (_, index) => ({
    id: createStableId(
      "shading",
      projectGeometry.project_id,
      facadeOrientation.side,
      shadingType,
      index,
    ),
    type: shadingType,
    side: facadeOrientation.side,
    climate_hint: styleDNA.climate_zone || "unknown",
    index,
  }));
}

export default {
  buildShadingElements,
};
