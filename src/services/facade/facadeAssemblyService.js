import { createStableId } from "../cad/projectGeometrySchema.js";
import { resolveFacadeComponentFamily } from "./facadeComponentLibrary.js";
import { buildShadingElements } from "./shadingElementService.js";

function exteriorWallsForSide(projectGeometry = {}, side = "south") {
  return (projectGeometry.walls || []).filter(
    (wall) => wall.exterior && (wall.metadata?.side || wall.side) === side,
  );
}

export function assembleFacadeComponents(
  projectGeometry = {},
  styleDNA = {},
  facadeOrientation = {},
) {
  const componentFamily = resolveFacadeComponentFamily(
    styleDNA,
    facadeOrientation,
  );
  const exteriorWalls = exteriorWallsForSide(
    projectGeometry,
    facadeOrientation.side,
  );
  const groupedOpenings = (facadeOrientation.window_grouping || []).map(
    (group, index) => ({
      id: createStableId(
        "facade-opening-group",
        projectGeometry.project_id,
        facadeOrientation.side,
        index,
      ),
      type: componentFamily.opening_family,
      group_id: group.group_id || `group-${index}`,
      window_ids: group.window_ids || [],
      span_m: group.total_width_m || 0,
    }),
  );

  const bays = exteriorWalls.map((wall, index) => ({
    id: createStableId(
      "facade-bay",
      projectGeometry.project_id,
      facadeOrientation.side,
      wall.id,
    ),
    type: componentFamily.bay_family,
    wall_id: wall.id,
    span_m: Number(wall.length_m || 0),
    index,
  }));

  const shadingElements = buildShadingElements({
    projectGeometry,
    facadeOrientation,
    styleDNA,
    componentFamily,
  });

  return {
    side: facadeOrientation.side,
    component_family: componentFamily,
    bays,
    grouped_openings: groupedOpenings,
    shading_elements: shadingElements,
    feature_frames: (facadeOrientation.feature_frames || []).map(
      (frame, index) => ({
        ...frame,
        family: componentFamily.frame_family,
        index,
      }),
    ),
    balconies: (facadeOrientation.balcony_placeholders || []).map(
      (balcony) => ({
        ...balcony,
        family: componentFamily.balcony_family,
      }),
    ),
    parapet: {
      family: componentFamily.parapet_family,
      mode: facadeOrientation.parapet_mode || "none",
    },
  };
}

export default {
  assembleFacadeComponents,
};
