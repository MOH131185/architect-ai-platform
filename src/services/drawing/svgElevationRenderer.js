import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function orientationToSide(orientation = "south") {
  const normalized = String(orientation || "south").toLowerCase();
  if (["north", "south", "east", "west"].includes(normalized)) {
    return normalized;
  }
  return "south";
}

function metricsFromGeometry(geometry = {}) {
  const buildable = geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      width: 12,
      height: 10,
    };
  const levels = geometry.levels || [];
  const totalHeight =
    levels.reduce((sum, level) => sum + Number(level.height_m || 3.2), 0) ||
    3.2;

  return {
    width_m: buildable.width || 12,
    depth_m: buildable.height || 10,
    total_height_m: totalHeight,
    level_count: Math.max(1, levels.length),
  };
}

function projectAlongOrientation(room = {}, orientation = "south") {
  const side = orientationToSide(orientation);
  if (side === "east" || side === "west") {
    return {
      start: room.bbox.min_y,
      end: room.bbox.max_y,
    };
  }
  return {
    start: room.bbox.min_x,
    end: room.bbox.max_x,
  };
}

export function renderElevationSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const orientation = orientationToSide(options.orientation || "south");
  const metrics = metricsFromGeometry(geometry);
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = 80;
  const horizontalExtent =
    orientation === "east" || orientation === "west"
      ? metrics.depth_m
      : metrics.width_m;
  const scale = Math.min(
    (width - padding * 2) / Math.max(horizontalExtent, 1),
    (height - padding * 2) / Math.max(metrics.total_height_m + 1, 1),
  );

  const baseX = (width - horizontalExtent * scale) / 2;
  const baseY = height - padding;
  const roofType = String(styleDNA.roof_language || "").includes("flat")
    ? "flat"
    : "pitched";
  const facade = `<rect x="${baseX}" y="${baseY - metrics.total_height_m * scale}" width="${horizontalExtent * scale}" height="${metrics.total_height_m * scale}" fill="#fff" stroke="#111" stroke-width="2.5"/>`;
  const roof =
    roofType === "flat"
      ? `<rect x="${baseX}" y="${baseY - metrics.total_height_m * scale - 14}" width="${horizontalExtent * scale}" height="14" fill="#e8e8e8" stroke="#111" stroke-width="2"/>`
      : `<path d="M ${baseX} ${baseY - metrics.total_height_m * scale} L ${baseX + (horizontalExtent * scale) / 2} ${baseY - metrics.total_height_m * scale - 56} L ${baseX + horizontalExtent * scale} ${baseY - metrics.total_height_m * scale}" fill="#f3f3f3" stroke="#111" stroke-width="2.5"/>`;

  let currentLevelBase = baseY;
  const floorLines = (geometry.levels || [])
    .map((level) => {
      currentLevelBase -= Number(level.height_m || 3.2) * scale;
      return `<line x1="${baseX}" y1="${currentLevelBase}" x2="${baseX + horizontalExtent * scale}" y2="${currentLevelBase}" stroke="#777" stroke-width="1.2"/>`;
    })
    .join("");

  const matchingWindows = (geometry.windows || []).filter((windowElement) => {
    const wall = (geometry.walls || []).find(
      (entry) => entry.id === windowElement.wall_id,
    );
    return wall?.metadata?.side === orientation;
  });

  const windowMarkup = matchingWindows
    .map((windowElement) => {
      const wall = (geometry.walls || []).find(
        (entry) => entry.id === windowElement.wall_id,
      );
      const room = (geometry.rooms || []).find(
        (entry) => entry.id === wall?.room_ids?.[0],
      );
      if (!room || !wall) {
        return "";
      }

      const level = (geometry.levels || []).find(
        (entry) => entry.id === room.level_id,
      );
      const levelBaseHeight = (geometry.levels || [])
        .filter((entry) => entry.level_number < level.level_number)
        .reduce((sum, entry) => sum + Number(entry.height_m || 3.2), 0);
      const projection = projectAlongOrientation(room, orientation);
      const startX = baseX + projection.start * scale;
      const widthPx = Math.max(
        18,
        (projection.end - projection.start) * scale * 0.45,
      );
      const sillY =
        baseY - (levelBaseHeight + windowElement.sill_height_m + 0.9) * scale;
      const windowHeight = Math.max(
        18,
        (windowElement.head_height_m - windowElement.sill_height_m) *
          scale *
          0.65,
      );

      return `<rect x="${startX + 10}" y="${sillY - windowHeight}" width="${widthPx}" height="${windowHeight}" fill="none" stroke="#245f9d" stroke-width="2"/>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${padding}" y="34" font-size="22" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(`Elevation - ${orientation}`)}</text>
  <line x1="${padding}" y1="${baseY}" x2="${width - padding}" y2="${baseY}" stroke="#333" stroke-width="2"/>
  ${roof}
  ${facade}
  ${floorLines}
  ${windowMarkup}
</svg>`;

  return {
    svg,
    orientation,
    renderer: "deterministic-elevation-svg",
    title: `Elevation - ${orientation}`,
  };
}

export default {
  renderElevationSvg,
};
