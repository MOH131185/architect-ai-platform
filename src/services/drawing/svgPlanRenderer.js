import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";

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

function getSourceBounds(geometry, level = null) {
  return (
    geometry.site?.boundary_bbox ||
    geometry.site?.buildable_bbox ||
    level?.buildable_bbox ||
    geometry.footprints?.[0]?.bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
      width: 12,
      height: 10,
    }
  );
}

function roomFill(zone = "public") {
  switch (zone) {
    case "private":
      return "#f8f0e6";
    case "service":
      return "#eef3f8";
    case "core":
      return "#f1f1f1";
    default:
      return "#fbfaf7";
  }
}

function buildTransform(bounds, width, height, padding) {
  const scale = Math.min(
    (width - padding * 2) / Math.max(bounds.width, 1),
    (height - padding * 2) / Math.max(bounds.height, 1),
  );

  return (point = {}) => ({
    x: Number((padding + (point.x - bounds.min_x) * scale).toFixed(2)),
    y: Number((padding + (point.y - bounds.min_y) * scale).toFixed(2)),
  });
}

function polygonPath(points = [], project) {
  if (!Array.isArray(points) || !points.length) {
    return "";
  }

  return (
    points
      .map((point, index) => {
        const projected = project(point);
        return `${index === 0 ? "M" : "L"} ${projected.x} ${projected.y}`;
      })
      .join(" ") + " Z"
  );
}

function renderNorthArrow(width, padding, northRotationDeg = 0) {
  const x = width - padding - 36;
  const y = padding - 10;
  return `
    <g id="north-arrow" transform="translate(${x} ${y}) rotate(${northRotationDeg})">
      <line x1="0" y1="28" x2="0" y2="0" stroke="#111" stroke-width="2.5"/>
      <path d="M 0 -10 L -7 5 L 7 5 Z" fill="#111"/>
      <text x="0" y="-16" font-size="12" font-family="Arial, sans-serif" text-anchor="middle">N</text>
    </g>
  `;
}

function renderScaleAndTitle(level, width, height, padding) {
  return `
    <g id="title-block">
      <rect x="${padding}" y="${height - padding + 8}" width="280" height="48" fill="#fff" stroke="#333" stroke-width="1.2"/>
      <text x="${padding + 12}" y="${height - padding + 28}" font-size="15" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(level.name || "Plan")}</text>
      <text x="${padding + 12}" y="${height - padding + 44}" font-size="11" font-family="Arial, sans-serif">Scale placeholder 1:100</text>
    </g>
  `;
}

export function renderPlanSvg(geometryInput = {}, options = {}) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const level = findLevel(geometry, options);

  if (!level) {
    throw new Error("No level data available for plan rendering");
  }

  const width = options.width || 1200;
  const height = options.height || 900;
  const padding = 70;
  const bounds = getSourceBounds(geometry, level);
  const project = buildTransform(bounds, width, height - 70, padding);
  const roomMap = new Map(
    (geometry.rooms || [])
      .filter((room) => room.level_id === level.id)
      .map((room) => [room.id, room]),
  );
  const wallMap = new Map(
    (geometry.walls || [])
      .filter((wall) => wall.level_id === level.id)
      .map((wall) => [wall.id, wall]),
  );

  const siteOutline = polygonPath(
    geometry.site?.boundary_polygon || [],
    project,
  );
  const buildableOutline = polygonPath(
    geometry.site?.buildable_polygon || [],
    project,
  );
  const footprintPath = polygonPath(
    geometry.footprints.find((footprint) => footprint.id === level.footprint_id)
      ?.polygon || [],
    project,
  );

  const roomMarkup = [...roomMap.values()]
    .map((room) => {
      const labelPoint = project(
        room.centroid || {
          x: (room.bbox.min_x + room.bbox.max_x) / 2,
          y: (room.bbox.min_y + room.bbox.max_y) / 2,
        },
      );
      return `
        <path d="${polygonPath(room.polygon, project)}" fill="${roomFill(room.zone)}" stroke="#cabfae" stroke-width="1.2"/>
        <text x="${labelPoint.x}" y="${labelPoint.y}" font-size="13" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(room.name)}</text>
      `;
    })
    .join("");

  const wallMarkup = [...wallMap.values()]
    .map((wall) => {
      const start = project(wall.start);
      const end = project(wall.end);
      return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#111" stroke-width="${wall.exterior ? 6 : 4}" stroke-linecap="square"/>`;
    })
    .join("");

  const doorMarkup = (geometry.doors || [])
    .filter((door) => door.level_id === level.id)
    .map((door) => {
      const wall = wallMap.get(door.wall_id);
      const position = project(door.position_m);
      const halfWidth = 8;
      if (wall?.orientation === "vertical") {
        return `<line x1="${position.x - halfWidth}" y1="${position.y}" x2="${position.x + halfWidth}" y2="${position.y}" stroke="#7a3d16" stroke-width="2.5"/>`;
      }
      return `<line x1="${position.x}" y1="${position.y - halfWidth}" x2="${position.x}" y2="${position.y + halfWidth}" stroke="#7a3d16" stroke-width="2.5"/>`;
    })
    .join("");

  const windowMarkup = (geometry.windows || [])
    .filter((windowElement) => windowElement.level_id === level.id)
    .map((windowElement) => {
      const wall = wallMap.get(windowElement.wall_id);
      const position = project(windowElement.position_m);
      const halfWidth = 10;
      if (wall?.orientation === "vertical") {
        return `<line x1="${position.x - halfWidth}" y1="${position.y}" x2="${position.x + halfWidth}" y2="${position.y}" stroke="#2c78c4" stroke-width="2.5"/>`;
      }
      return `<line x1="${position.x}" y1="${position.y - halfWidth}" x2="${position.x}" y2="${position.y + halfWidth}" stroke="#2c78c4" stroke-width="2.5"/>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <path d="${siteOutline}" fill="none" stroke="#9ea3aa" stroke-width="1.5" stroke-dasharray="8 6"/>
  <path d="${buildableOutline}" fill="none" stroke="#d88f2d" stroke-width="1.8" stroke-dasharray="6 4"/>
  <path d="${footprintPath}" fill="#fafafa" stroke="#555" stroke-width="1.5"/>
  ${roomMarkup}
  ${wallMarkup}
  ${doorMarkup}
  ${windowMarkup}
  ${renderNorthArrow(width, padding, geometry.site?.north_orientation_deg || 0)}
  ${renderScaleAndTitle(level, width, height, padding)}
</svg>`;

  return {
    svg,
    level_id: level.id,
    renderer: "deterministic-plan-svg",
    title: level.name || "Plan",
  };
}

export default {
  renderPlanSvg,
};
