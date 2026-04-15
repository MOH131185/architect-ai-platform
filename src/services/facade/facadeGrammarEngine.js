import { createStableId } from "../cad/projectGeometrySchema.js";
import { assembleFacadeComponents } from "./facadeAssemblyService.js";
import {
  buildFacadeCompositionRules,
  mergeGeometryRulesWithStyleDNA,
} from "./facadeCompositionRules.js";
import { buildOpeningRhythm } from "./openingRhythmService.js";

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function sideAxis(side) {
  return side === "east" || side === "west" ? "y" : "x";
}

function solidVoidRatio(projectGeometry = {}, side = "south") {
  const wallArea = (projectGeometry.walls || [])
    .filter((wall) => wall.exterior && wall.metadata?.side === side)
    .reduce((sum, wall) => sum + Number(wall.length_m || 0), 0);
  const openingArea = (projectGeometry.windows || [])
    .filter((windowElement) => {
      const wall = (projectGeometry.walls || []).find(
        (entry) => entry.id === windowElement.wall_id,
      );
      return wall?.metadata?.side === side;
    })
    .reduce(
      (sum, windowElement) =>
        sum +
        Number(windowElement.width_m || 0) *
          Math.max(
            1,
            Number(windowElement.head_height_m || 2.1) -
              Number(windowElement.sill_height_m || 0.9),
          ),
      0,
    );

  if (!wallArea) return 1;
  const normalized =
    1 - Math.min(0.95, openingArea / Math.max(wallArea * 3.2, 1));
  return Number(normalized.toFixed(3));
}

export function applyStyleDNAToFacade(
  projectGeometry = {},
  styleDNA = {},
  options = {},
) {
  const baseRules = mergeGeometryRulesWithStyleDNA(projectGeometry, styleDNA);
  const compositionRules = buildFacadeCompositionRules(
    projectGeometry,
    styleDNA,
  );

  return {
    schema_version: "facade-grammar-v1",
    id: createStableId(
      "facade-grammar",
      projectGeometry.project_id,
      baseRules.facade_language,
    ),
    project_id: projectGeometry.project_id,
    style_bridge: {
      facade_language: baseRules.facade_language,
      roof_language: baseRules.roof_language,
      window_language: baseRules.window_language,
      climate_zone: baseRules.climate_zone,
      local_materials: baseRules.local_materials,
    },
    orientations: compositionRules.map((rule) => {
      const rhythm = buildOpeningRhythm({
        projectGeometry,
        side: rule.side,
        orientationAxis: sideAxis(rule.side),
      });
      const orientation = {
        side: rule.side,
        opening_rhythm: rhythm,
        solid_void_ratio: solidVoidRatio(projectGeometry, rule.side),
        target_solid_void_ratio: rule.target_solid_void_ratio,
        shading_elements:
          rule.shading_strategy === "deep-reveal-and-screen"
            ? ["deep-reveal", "screen"]
            : ["slender-overhang"],
        material_zones: rule.material_zone_assignment,
        window_grouping: rhythm.grouped_windows,
        balcony_placeholders:
          rule.balcony_placeholder === "none"
            ? []
            : [
                {
                  id: createStableId(
                    "balcony",
                    projectGeometry.project_id,
                    rule.side,
                  ),
                  type: rule.balcony_placeholder,
                },
              ],
        feature_frames:
          rule.feature_frame === "none"
            ? []
            : [
                {
                  id: createStableId(
                    "frame",
                    projectGeometry.project_id,
                    rule.side,
                  ),
                  type: rule.feature_frame,
                },
              ],
        roofline_language: rule.roofline_language,
        parapet_mode: rule.parapet_mode,
      };
      return {
        ...orientation,
        components: assembleFacadeComponents(
          projectGeometry,
          styleDNA,
          orientation,
        ),
      };
    }),
    notes: dedupe([
      "Facade grammar is derived from canonical geometry, Style DNA, and regional climate rules.",
      ...(options.notes || []),
    ]),
  };
}

export function applyStyleDNAToOpenings(projectGeometry = {}, styleDNA = {}) {
  const windowLanguage = String(
    styleDNA.window_language || "balanced",
  ).toLowerCase();
  const widthMultiplier =
    windowLanguage.includes("grouped") || windowLanguage.includes("horizontal")
      ? 1.12
      : 1;

  return (projectGeometry.windows || []).map((windowElement) => ({
    ...windowElement,
    metadata: {
      ...(windowElement.metadata || {}),
      style_window_language: styleDNA.window_language || null,
      suggested_width_m: Number(
        (Number(windowElement.width_m || 0) * widthMultiplier).toFixed(3),
      ),
    },
  }));
}

export function buildFacadeGrammar(
  projectGeometry = {},
  styleDNA = {},
  options = {},
) {
  const grammar = applyStyleDNAToFacade(projectGeometry, styleDNA, options);
  const openingOverrides = applyStyleDNAToOpenings(projectGeometry, styleDNA);

  return {
    ...grammar,
    opening_overrides: openingOverrides,
    component_library_version: "phase4-facade-components-v1",
  };
}

export default {
  applyStyleDNAToFacade,
  applyStyleDNAToOpenings,
  mergeGeometryRulesWithStyleDNA,
  buildFacadeGrammar,
};
