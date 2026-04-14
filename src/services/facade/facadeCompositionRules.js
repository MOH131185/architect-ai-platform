import { getLocationStyleRules } from "../style/locationStyleRules.js";

export function mergeGeometryRulesWithStyleDNA(
  projectGeometry = {},
  styleDNA = {},
) {
  const locationRules = getLocationStyleRules({
    region: styleDNA.region,
    climate_zone: styleDNA.climate_zone,
  });

  return {
    climate_zone: styleDNA.climate_zone || locationRules.climate_zone,
    facade_language: styleDNA.facade_language || locationRules.facade_language,
    roof_language: styleDNA.roof_language || locationRules.roof_language,
    window_language: styleDNA.window_language || locationRules.window_language,
    massing_language:
      styleDNA.massing_language || locationRules.massing_language,
    local_materials: styleDNA.local_materials?.length
      ? styleDNA.local_materials
      : locationRules.local_materials,
    technical_constraints: [
      ...(styleDNA.technical_constraints || []),
      ...(locationRules.technical_constraints || []),
    ],
    floor_count: (projectGeometry.levels || []).length,
  };
}

export function buildFacadeCompositionRules(
  projectGeometry = {},
  styleDNA = {},
) {
  const merged = mergeGeometryRulesWithStyleDNA(projectGeometry, styleDNA);
  const floorCount = Math.max(1, (projectGeometry.levels || []).length);

  return ["north", "south", "east", "west"].map((side) => ({
    side,
    shading_strategy:
      merged.climate_zone?.includes("hot") ||
      merged.facade_language.includes("shadow")
        ? "deep-reveal-and-screen"
        : "minimal-overhang",
    opening_language: merged.window_language,
    roofline_language: merged.roof_language,
    material_palette: merged.local_materials,
    material_zone_assignment:
      floorCount > 1
        ? [
            { zone: "base", material: merged.local_materials[0] || "brick" },
            {
              zone: "upper",
              material:
                merged.local_materials[1] ||
                merged.local_materials[0] ||
                "timber",
            },
          ]
        : [{ zone: "body", material: merged.local_materials[0] || "brick" }],
    feature_frame:
      merged.facade_language.includes("screen") ||
      merged.facade_language.includes("rhythmic")
        ? "expressed-frame"
        : "none",
    balcony_placeholder:
      side === "south" && floorCount > 1 ? "shaded-projection" : "none",
    parapet_mode: merged.roof_language.includes("flat") ? "parapet" : "eaves",
    target_solid_void_ratio:
      side === "north"
        ? 0.72
        : merged.climate_zone?.includes("hot")
          ? 0.68
          : 0.58,
  }));
}

export default {
  buildFacadeCompositionRules,
  mergeGeometryRulesWithStyleDNA,
};
