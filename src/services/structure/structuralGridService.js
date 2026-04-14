import { createStableId, roundMetric } from "../cad/projectGeometrySchema.js";

function axisSeries(length = 12, minSpacing = 3.6) {
  const usableLength = Math.max(length, minSpacing * 2);
  const divisions = Math.max(2, Math.round(usableLength / minSpacing));
  const spacing = usableLength / divisions;
  return Array.from({ length: divisions + 1 }, (_, index) =>
    roundMetric(index * spacing),
  );
}

export function buildStructuralGrid(projectGeometry = {}) {
  const bbox = projectGeometry.site?.buildable_bbox ||
    projectGeometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      width: 12,
      height: 10,
    };

  const xSeries = axisSeries(bbox.width || 12, 3.6).map((offset, index) => ({
    id: createStableId("grid-x", projectGeometry.project_id, index),
    label: String.fromCharCode(65 + index),
    position_m: roundMetric((bbox.min_x || 0) + offset),
  }));
  const ySeries = axisSeries(bbox.height || 10, 3.6).map((offset, index) => ({
    id: createStableId("grid-y", projectGeometry.project_id, index),
    label: `${index + 1}`,
    position_m: roundMetric((bbox.min_y || 0) + offset),
  }));

  const spans = [
    ...xSeries.slice(1).map((axis, index) => ({
      direction: "x",
      from: xSeries[index].label,
      to: axis.label,
      span_m: roundMetric(axis.position_m - xSeries[index].position_m),
    })),
    ...ySeries.slice(1).map((axis, index) => ({
      direction: "y",
      from: ySeries[index].label,
      to: axis.label,
      span_m: roundMetric(axis.position_m - ySeries[index].position_m),
    })),
  ];

  const suggestedColumns = (projectGeometry.levels || []).flatMap((level) =>
    xSeries.flatMap((xAxis) =>
      ySeries.map((yAxis) => ({
        id: createStableId(
          "column",
          projectGeometry.project_id,
          level.id,
          xAxis.label,
          yAxis.label,
        ),
        level_id: level.id,
        x: xAxis.position_m,
        y: yAxis.position_m,
        source: "structural-grid-service",
      })),
    ),
  );

  return {
    schema_version: "structural-grid-v1",
    project_id: projectGeometry.project_id,
    x_axes: xSeries,
    y_axes: ySeries,
    spans,
    suggested_columns: suggestedColumns,
  };
}

export default {
  buildStructuralGrid,
};
