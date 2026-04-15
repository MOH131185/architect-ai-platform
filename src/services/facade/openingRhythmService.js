function sortOpeningsByAxis(openings = [], axis = "x") {
  return [...openings].sort(
    (left, right) =>
      Number(left.position_m?.[axis] || 0) -
      Number(right.position_m?.[axis] || 0),
  );
}

function spacingSeries(openings = [], axis = "x") {
  const series = [];
  for (let index = 1; index < openings.length; index += 1) {
    const previous = Number(openings[index - 1].position_m?.[axis] || 0);
    const current = Number(openings[index].position_m?.[axis] || 0);
    series.push(Number((current - previous).toFixed(3)));
  }
  return series;
}

export function buildOpeningRhythm({
  projectGeometry,
  side = "south",
  orientationAxis = "x",
} = {}) {
  const wallIds = new Set(
    (projectGeometry.walls || [])
      .filter((wall) => wall.exterior && wall.metadata?.side === side)
      .map((wall) => wall.id),
  );
  const openings = (projectGeometry.windows || []).filter((opening) =>
    wallIds.has(opening.wall_id),
  );
  const sorted = sortOpeningsByAxis(openings, orientationAxis);
  const spacing = spacingSeries(sorted, orientationAxis);
  const averageSpacing =
    spacing.length > 0
      ? Number(
          (
            spacing.reduce((sum, value) => sum + value, 0) / spacing.length
          ).toFixed(3),
        )
      : 0;

  return {
    side,
    opening_count: sorted.length,
    spacing_series_m: spacing,
    average_spacing_m: averageSpacing,
    grouped_windows: sorted.map((opening, index) => ({
      id: opening.id,
      group_id: `${side}-window-group-${index}`,
      width_m: Number(opening.width_m || 0),
    })),
  };
}

export default {
  buildOpeningRhythm,
};
