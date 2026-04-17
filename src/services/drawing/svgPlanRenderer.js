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
      <rect x="${padding}" y="${height - padding + 8}" width="320" height="52" fill="#fff" stroke="#333" stroke-width="1.2"/>
      <text x="${padding + 12}" y="${height - padding + 28}" font-size="15" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(level.name || "Plan")}</text>
      <text x="${padding + 12}" y="${height - padding + 44}" font-size="11" font-family="Arial, sans-serif">Scale placeholder 1:100</text>
      <text x="${padding + 190}" y="${height - padding + 44}" font-size="11" font-family="Arial, sans-serif">Geometry-locked</text>
    </g>
  `;
}

function renderLegend(width, height, padding) {
  const x = width - padding - 190;
  const y = height - padding + 8;
  return `
    <g id="plan-legend">
      <rect x="${x}" y="${y}" width="190" height="52" fill="#fff" stroke="#333" stroke-width="1.2"/>
      <line x1="${x + 12}" y1="${y + 16}" x2="${x + 44}" y2="${y + 16}" stroke="#9ea3aa" stroke-width="1.5" stroke-dasharray="8 6"/>
      <text x="${x + 52}" y="${y + 20}" font-size="10" font-family="Arial, sans-serif">Site Boundary</text>
      <line x1="${x + 12}" y1="${y + 32}" x2="${x + 44}" y2="${y + 32}" stroke="#d88f2d" stroke-width="1.8" stroke-dasharray="6 4"/>
      <text x="${x + 52}" y="${y + 36}" font-size="10" font-family="Arial, sans-serif">Buildable Envelope</text>
      <line x1="${x + 12}" y1="${y + 46}" x2="${x + 44}" y2="${y + 46}" stroke="#2c78c4" stroke-width="2.5"/>
      <text x="${x + 52}" y="${y + 50}" font-size="10" font-family="Arial, sans-serif">Openings</text>
    </g>
  `;
}

function renderRoomLabel(labelPoint, room = {}) {
  const name = escapeXml(room.name || "Room");
  const areaText = escapeXml(`${Number(room.actual_area || 0).toFixed(1)} m2`);
  const labelWidth = Math.max(64, name.length * 7.2);
  return `
    <g class="room-label">
      <rect x="${labelPoint.x - labelWidth / 2}" y="${labelPoint.y - 18}" width="${labelWidth}" height="16" rx="2" fill="#ffffff" fill-opacity="0.88"/>
      <rect x="${labelPoint.x - 28}" y="${labelPoint.y - 2}" width="56" height="14" rx="2" fill="#ffffff" fill-opacity="0.75"/>
      <text x="${labelPoint.x}" y="${labelPoint.y - 6}" font-size="13.5" font-family="Arial, sans-serif" font-weight="600" text-anchor="middle">${name}</text>
      <text x="${labelPoint.x}" y="${labelPoint.y + 8}" font-size="10.5" font-family="Arial, sans-serif" text-anchor="middle">${areaText}</text>
    </g>
  `;
}

function renderStructuralGridMarkers(geometry = {}, project) {
  const grid = geometry.metadata?.structural_grid;
  if (!grid) {
    return "";
  }

  const xMarkup = (grid.x_axes || [])
    .map((axis) => {
      const top = project({
        x: axis.position_m,
        y: geometry.site?.boundary_bbox?.min_y || 0,
      });
      const bottom = project({
        x: axis.position_m,
        y: geometry.site?.boundary_bbox?.max_y || 0,
      });
      return `
        <line x1="${top.x}" y1="${top.y}" x2="${bottom.x}" y2="${bottom.y}" stroke="#d7c8aa" stroke-width="1" stroke-dasharray="6 4"/>
        <text x="${top.x}" y="${Math.max(16, top.y - 8)}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(axis.label)}</text>
      `;
    })
    .join("");

  const yMarkup = (grid.y_axes || [])
    .map((axis) => {
      const left = project({
        x: geometry.site?.boundary_bbox?.min_x || 0,
        y: axis.position_m,
      });
      const right = project({
        x: geometry.site?.boundary_bbox?.max_x || 0,
        y: axis.position_m,
      });
      return `
        <line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}" stroke="#d7c8aa" stroke-width="1" stroke-dasharray="6 4"/>
        <text x="${Math.max(10, left.x - 10)}" y="${left.y + 4}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(axis.label)}</text>
      `;
    })
    .join("");

  return `<g id="structural-grid">${xMarkup}${yMarkup}</g>`;
}

function renderStairMarkup(stairs = [], project) {
  return stairs
    .map((stair) => {
      const bbox = stair.bbox || {};
      const topLeft = project({ x: bbox.min_x, y: bbox.min_y });
      const topRight = project({ x: bbox.max_x, y: bbox.min_y });
      const bottomLeft = project({ x: bbox.min_x, y: bbox.max_y });
      const stepCount = 6;
      const stepSpacing = (bottomLeft.y - topLeft.y) / Math.max(stepCount, 1);
      const steps = Array.from({ length: stepCount }, (_, index) => {
        const y = Number((topLeft.y + stepSpacing * (index + 1)).toFixed(2));
        return `<line x1="${topLeft.x + 4}" y1="${y}" x2="${topRight.x - 4}" y2="${y}" stroke="#444" stroke-width="1"/>`;
      }).join("");

      return `
        <g class="stair-core">
          <rect x="${topLeft.x}" y="${topLeft.y}" width="${topRight.x - topLeft.x}" height="${bottomLeft.y - topLeft.y}" fill="#f5f5f5" stroke="#333" stroke-width="1.6"/>
          ${steps}
          <text x="${(topLeft.x + topRight.x) / 2}" y="${topLeft.y + 14}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">Stair</text>
          <line x1="${(topLeft.x + topRight.x) / 2}" y1="${bottomLeft.y - 16}" x2="${(topLeft.x + topRight.x) / 2}" y2="${topLeft.y + 24}" stroke="#333" stroke-width="1.4"/>
          <path d="M ${(topLeft.x + topRight.x) / 2} ${topLeft.y + 20} L ${(topLeft.x + topRight.x) / 2 - 4} ${topLeft.y + 28} L ${(topLeft.x + topRight.x) / 2 + 4} ${topLeft.y + 28} Z" fill="#333"/>
          <text x="${(topLeft.x + topRight.x) / 2}" y="${bottomLeft.y - 4}" font-size="9" font-family="Arial, sans-serif" text-anchor="middle">UP</text>
        </g>
      `;
    })
    .join("");
}

function renderCirculationMarkup(paths = [], project) {
  return paths
    .map((path) => {
      const polyline = Array.isArray(path.polyline) ? path.polyline : [];
      if (!polyline.length) {
        return "";
      }

      const points = polyline
        .map((point) => {
          const projected = project(point);
          return `${projected.x},${projected.y}`;
        })
        .join(" ");
      return `<polyline points="${points}" fill="none" stroke="#6d7f8f" stroke-width="1.8" stroke-dasharray="6 3"/>`;
    })
    .join("");
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
        ${renderRoomLabel(labelPoint, room)}
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
        return `
          <line x1="${position.x - halfWidth}" y1="${position.y}" x2="${position.x + halfWidth}" y2="${position.y}" stroke="#7a3d16" stroke-width="2.5"/>
          <path d="M ${position.x} ${position.y} A 12 12 0 0 1 ${position.x + 12} ${position.y + 12}" fill="none" stroke="#7a3d16" stroke-width="1.2"/>
        `;
      }
      return `
        <line x1="${position.x}" y1="${position.y - halfWidth}" x2="${position.x}" y2="${position.y + halfWidth}" stroke="#7a3d16" stroke-width="2.5"/>
        <path d="M ${position.x} ${position.y} A 12 12 0 0 1 ${position.x + 12} ${position.y - 12}" fill="none" stroke="#7a3d16" stroke-width="1.2"/>
      `;
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

  const stairMarkup = renderStairMarkup(
    (geometry.stairs || []).filter((stair) => stair.level_id === level.id),
    project,
  );
  const circulationMarkup = renderCirculationMarkup(
    (geometry.circulation || []).filter((path) => path.level_id === level.id),
    project,
  );
  const structuralGridMarkup = renderStructuralGridMarkers(geometry, project);
  const stairCount = (geometry.stairs || []).filter(
    (stair) => stair.level_id === level.id,
  ).length;
  const doorCount = (geometry.doors || []).filter(
    (door) => door.level_id === level.id,
  ).length;
  const windowCount = (geometry.windows || []).filter(
    (windowElement) => windowElement.level_id === level.id,
  ).length;
  const circulationPathCount = (geometry.circulation || []).filter(
    (path) => path.level_id === level.id,
  ).length;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <path d="${siteOutline}" fill="none" stroke="#9ea3aa" stroke-width="1.5" stroke-dasharray="8 6"/>
  <path d="${buildableOutline}" fill="none" stroke="#d88f2d" stroke-width="1.8" stroke-dasharray="6 4"/>
  ${structuralGridMarkup}
  <path d="${footprintPath}" fill="#fafafa" stroke="#555" stroke-width="1.5"/>
  ${roomMarkup}
  ${wallMarkup}
  ${circulationMarkup}
  ${stairMarkup}
  ${doorMarkup}
  ${windowMarkup}
  ${renderNorthArrow(width, padding, geometry.site?.north_orientation_deg || 0)}
  ${renderScaleAndTitle(level, width, height, padding)}
  ${renderLegend(width, height, padding)}
</svg>`;

  return {
    svg,
    level_id: level.id,
    room_count: roomMap.size,
    stair_count: stairCount,
    renderer: "deterministic-plan-svg",
    title: level.name || "Plan",
    technical_quality_metadata: {
      drawing_type: "plan",
      wall_count: wallMap.size,
      door_count: doorCount,
      window_count: windowCount,
      stair_count: stairCount,
      circulation_path_count: circulationPathCount,
      room_count: roomMap.size,
      room_label_count: roomMap.size,
      area_label_count: roomMap.size,
      has_north_arrow: true,
      has_title_block: true,
      has_legend: true,
      structural_grid_visible: Boolean(geometry.metadata?.structural_grid),
      line_hierarchy: {
        site_boundary: 1.5,
        buildable_outline: 1.8,
        interior_wall: 4,
        exterior_wall: 6,
        openings: 2.5,
      },
    },
  };
}

export default {
  renderPlanSvg,
};
