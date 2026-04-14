import { renderPlanSvg } from "../drawing/svgPlanRenderer.js";
import { renderElevationSvg } from "../drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../drawing/svgSectionRenderer.js";
import { createStableHash } from "../cad/projectGeometrySchema.js";

export function buildControlReferences(
  projectGeometry = {},
  styleDNA = {},
  viewType = "hero_3d",
  options = {},
) {
  const geometrySignature = createStableHash(
    JSON.stringify({
      project_id: projectGeometry.project_id,
      levels: projectGeometry.levels,
      rooms: projectGeometry.rooms,
      walls: projectGeometry.walls,
      roof: projectGeometry.roof,
    }),
  );

  const references = [];
  if (viewType.includes("plan") || options.includePlan !== false) {
    references.push({
      type: "plan_svg",
      content: renderPlanSvg(projectGeometry, options).svg,
    });
  }
  if (viewType.includes("elevation") || options.includeElevation) {
    references.push({
      type: "elevation_svg",
      content: renderElevationSvg(projectGeometry, styleDNA, {
        orientation: options.orientation || "south",
      }).svg,
    });
  }
  if (viewType.includes("section") || options.includeSection) {
    references.push({
      type: "section_svg",
      content: renderSectionSvg(projectGeometry, styleDNA, {
        sectionType: options.sectionType || "longitudinal",
      }).svg,
    });
  }

  return {
    geometrySignature,
    references,
  };
}

export default {
  buildControlReferences,
};
