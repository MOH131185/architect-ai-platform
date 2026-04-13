import logger from "../../utils/logger.js";
import { generate as generateArchitecturalPlan } from "../svg/ArchitecturalFloorPlanGenerator.js";
import { normalizeArchitecturalGeometry } from "../cad/archElementNormalizer.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function findLevel(geometry, options = {}) {
  if (options.levelId) {
    return (
      geometry.levels.find((level) => level.id === options.levelId) ||
      geometry.levels[0]
    );
  }

  if (Number.isFinite(options.levelNumber)) {
    return (
      geometry.levels.find(
        (level) => level.level_number === options.levelNumber,
      ) || geometry.levels[0]
    );
  }

  return geometry.levels[0];
}

function deriveDimensions(level) {
  const roomBounds = level.rooms.map((room) => ({
    x2:
      (room.bbox?.x || room.x_m || 0) + (room.bbox?.width || room.width_m || 0),
    y2:
      (room.bbox?.y || room.y_m || 0) +
      (room.bbox?.height || room.depth_m || 0),
  }));
  const width = Math.max(12, ...roomBounds.map((bound) => bound.x2));
  const depth = Math.max(10, ...roomBounds.map((bound) => bound.y2));
  return { width_m: width, depth_m: depth };
}

function buildFallbackPlanSvg(level, options = {}) {
  const width = options.width || 1200;
  const height = options.height || 900;
  const padding = 60;
  const dimensions = deriveDimensions(level);
  const scale = Math.min(
    (width - padding * 2) / Math.max(dimensions.width_m, 1),
    (height - padding * 2) / Math.max(dimensions.depth_m, 1),
  );

  const roomRects = level.rooms
    .map((room) => {
      const x = padding + (room.bbox?.x || room.x_m || 0) * scale;
      const y = padding + (room.bbox?.y || room.y_m || 0) * scale;
      const roomWidth = Math.max(
        24,
        (room.bbox?.width || room.width_m || 3) * scale,
      );
      const roomHeight = Math.max(
        24,
        (room.bbox?.height || room.depth_m || 3) * scale,
      );
      const labelX = x + roomWidth / 2;
      const labelY = y + roomHeight / 2;
      return `
        <rect x="${x}" y="${y}" width="${roomWidth}" height="${roomHeight}" fill="white" stroke="#111" stroke-width="3"/>
        <text x="${labelX}" y="${labelY}" font-size="16" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle">${escapeXml(room.name || room.semantic || "Room")}</text>
      `;
    })
    .join("");

  const wallLines = level.walls
    .map((wall) => {
      const start = wall.geometry?.start || wall.points?.[0];
      const end = wall.geometry?.end || wall.points?.[1];
      if (!start || !end) return "";
      return `
        <line x1="${padding + start.x * scale}" y1="${padding + start.y * scale}"
              x2="${padding + end.x * scale}" y2="${padding + end.y * scale}"
              stroke="#000" stroke-width="5"/>
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${padding}" y="30" font-size="20" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(level.name || "Plan")}</text>
  ${roomRects}
  ${wallLines}
</svg>`;
}

export function renderPlanSvg(geometryInput = {}, options = {}) {
  const geometry =
    geometryInput?.schema_version === "open-source-geometry-v1"
      ? geometryInput
      : normalizeArchitecturalGeometry(geometryInput, {
          source: "technical-drawing-plan",
        });
  const level = findLevel(geometry, options);

  if (!level) {
    throw new Error("No level data available for plan rendering");
  }

  const dimensions = deriveDimensions(level);
  const renderGeometry = {
    rooms: level.rooms.map((room) => ({
      name: room.name || room.semantic,
      x: room.bbox?.x || room.x_m || 0,
      y: room.bbox?.y || room.y_m || 0,
      width: room.bbox?.width || room.width_m || 3,
      depth: room.bbox?.height || room.depth_m || 3,
      area: room.area_m2 || room.target_area_m2 || 9,
    })),
    walls: level.walls,
    doors: level.doors,
    stairs: level.stairs,
    dimensions: {
      width: dimensions.width_m,
      length: dimensions.depth_m,
    },
    floor: level.level_number || 0,
    floorLabel: level.name || "Ground Floor",
  };

  if (options.tryLegacyGenerator) {
    try {
      const svg = generateArchitecturalPlan(
        renderGeometry,
        renderGeometry.floor,
        options,
      );
      return {
        svg,
        level_id: level.id,
        renderer: "architectural-floor-plan-generator",
      };
    } catch (error) {
      logger.warn(
        "[Drawing] Falling back to simple plan SVG renderer",
        error.message,
      );
      return {
        svg: buildFallbackPlanSvg(level, options),
        level_id: level.id,
        renderer: "fallback-plan-svg",
        warning: error.message,
      };
    }
  }

  return {
    svg: buildFallbackPlanSvg(level, options),
    level_id: level.id,
    renderer: "fallback-plan-svg",
  };
}

export default {
  renderPlanSvg,
};
