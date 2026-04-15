import { createStableId } from "../cad/projectGeometrySchema.js";

function wallCenter(wall = {}) {
  return {
    x: (Number(wall.start?.x || 0) + Number(wall.end?.x || 0)) / 2,
    y: (Number(wall.start?.y || 0) + Number(wall.end?.y || 0)) / 2,
  };
}

export function buildSupportPaths(projectGeometry = {}) {
  const walls = (projectGeometry.walls || []).filter((wall) => wall.exterior);
  return walls.map((wall, index) => ({
    id: createStableId(
      "support-path",
      projectGeometry.project_id,
      wall.id,
      index,
    ),
    level_id: wall.level_id,
    source_wall_id: wall.id,
    centroid: wallCenter(wall),
    orientation: wall.orientation || "horizontal",
    length_m: Number(wall.length_m || 0),
  }));
}

export default {
  buildSupportPaths,
};
