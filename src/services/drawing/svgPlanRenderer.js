import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";

const PLAN_FONT = "EmbeddedSans, 'Segoe UI', Arial, sans-serif";

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
      <text x="0" y="-16" font-size="12" font-family="${PLAN_FONT}" text-anchor="middle">N</text>
    </g>
  `;
}

function renderScaleAndTitle(level, width, height, padding) {
  return `
    <g id="title-block">
      <rect x="${padding}" y="${height - padding + 8}" width="320" height="52" fill="#fff" stroke="#333" stroke-width="1.2"/>
      <text x="${padding + 12}" y="${height - padding + 28}" font-size="15" font-family="${PLAN_FONT}" font-weight="bold">${escapeXml(level.name || "Plan")}</text>
      <text x="${padding + 12}" y="${height - padding + 44}" font-size="11" font-family="${PLAN_FONT}">Scale 1:100 @ A1</text>
      <text x="${padding + 190}" y="${height - padding + 44}" font-size="11" font-family="${PLAN_FONT}">Geometry-locked</text>
    </g>
  `;
}

function renderLegend(width, height, padding) {
  const x = width - padding - 210;
  const y = height - padding + 8;
  return `
    <g id="plan-legend">
      <rect x="${x}" y="${y}" width="210" height="52" fill="#fff" stroke="#333" stroke-width="1.2"/>
      <line x1="${x + 12}" y1="${y + 16}" x2="${x + 44}" y2="${y + 16}" stroke="#9ea3aa" stroke-width="1.5" stroke-dasharray="8 6"/>
      <text x="${x + 52}" y="${y + 20}" font-size="10" font-family="${PLAN_FONT}">Site boundary</text>
      <line x1="${x + 12}" y1="${y + 32}" x2="${x + 44}" y2="${y + 32}" stroke="#d88f2d" stroke-width="1.8" stroke-dasharray="6 4"/>
      <text x="${x + 52}" y="${y + 36}" font-size="10" font-family="${PLAN_FONT}">Buildable envelope</text>
      <line x1="${x + 12}" y1="${y + 46}" x2="${x + 44}" y2="${y + 46}" stroke="#2c78c4" stroke-width="2.5"/>
      <text x="${x + 52}" y="${y + 50}" font-size="10" font-family="${PLAN_FONT}">Openings / windows</text>
    </g>
  `;
}

/**
 * Grid reference bubbles (A/B/C along the top, 1/2/3 down the left side).
 * Pulled from geometry.metadata.structural_grid.*_axes when available.
 * @private
 */
function renderGridBubbles(geometry, bounds, project, padding) {
  const grid = geometry.metadata?.structural_grid;
  if (!grid) return "";

  const projectedTop = project({ x: bounds.min_x, y: bounds.min_y });
  const projectedBottom = project({ x: bounds.min_x, y: bounds.max_y });

  const xBubbles = (grid.x_axes || [])
    .map((axis, i) => {
      const label = axis.label || String.fromCharCode(65 + i); // A, B, C...
      const pos = project({ x: axis.position_m, y: bounds.min_y });
      return `
        <g class="grid-bubble">
          <circle cx="${pos.x}" cy="${Math.max(24, projectedTop.y - 22)}" r="12" fill="#fff" stroke="#111" stroke-width="1.2"/>
          <text x="${pos.x}" y="${Math.max(24, projectedTop.y - 22) + 4}" font-size="12" font-family="${PLAN_FONT}" font-weight="bold" text-anchor="middle">${escapeXml(label)}</text>
        </g>
      `;
    })
    .join("");

  const yBubbles = (grid.y_axes || [])
    .map((axis, i) => {
      const label = axis.label || String(i + 1); // 1, 2, 3...
      const pos = project({ x: bounds.min_x, y: axis.position_m });
      return `
        <g class="grid-bubble">
          <circle cx="${Math.max(24, projectedTop.x - 22)}" cy="${pos.y}" r="12" fill="#fff" stroke="#111" stroke-width="1.2"/>
          <text x="${Math.max(24, projectedTop.x - 22)}" y="${pos.y + 4}" font-size="12" font-family="${PLAN_FONT}" font-weight="bold" text-anchor="middle">${escapeXml(label)}</text>
        </g>
      `;
    })
    .join("");

  // Suppress warning — projectedBottom reserved for future extent-end bubbles.
  void projectedBottom;
  void padding;
  return `<g id="grid-bubbles">${xBubbles}${yBubbles}</g>`;
}

/**
 * Running + segment dimension strings along each facade of the building
 * footprint. Draws one outer "running" tier and one inner "segment" tier per
 * side, matching RIBA convention.
 * @private
 */
function renderFootprintDimensions(footprint, project, padding) {
  if (!footprint?.polygon?.length) return "";
  const pts = footprint.polygon;
  const proj = pts.map(project);
  const n = proj.length;
  if (n < 2) return "";

  const bbox = pts.reduce(
    (acc, p) => ({
      min_x: Math.min(acc.min_x, p.x),
      max_x: Math.max(acc.max_x, p.x),
      min_y: Math.min(acc.min_y, p.y),
      max_y: Math.max(acc.max_y, p.y),
    }),
    { min_x: Infinity, max_x: -Infinity, min_y: Infinity, max_y: -Infinity },
  );

  const topRunY = project({ x: 0, y: bbox.min_y }).y - 44;
  const leftRunX = project({ x: bbox.min_x, y: 0 }).x - 44;

  const totalWidth = (bbox.max_x - bbox.min_x).toFixed(2);
  const totalDepth = (bbox.max_y - bbox.min_y).toFixed(2);

  const topLeft = project({ x: bbox.min_x, y: bbox.min_y });
  const topRight = project({ x: bbox.max_x, y: bbox.min_y });
  const bottomLeft = project({ x: bbox.min_x, y: bbox.max_y });

  const runningTop = `
    <g class="dim-running-top">
      <line x1="${topLeft.x}" y1="${topRunY}" x2="${topRight.x}" y2="${topRunY}" stroke="#111" stroke-width="1.2"/>
      <line x1="${topLeft.x}" y1="${topRunY - 4}" x2="${topLeft.x}" y2="${topRunY + 4}" stroke="#111" stroke-width="1.2"/>
      <line x1="${topRight.x}" y1="${topRunY - 4}" x2="${topRight.x}" y2="${topRunY + 4}" stroke="#111" stroke-width="1.2"/>
      <text x="${(topLeft.x + topRight.x) / 2}" y="${topRunY - 6}" font-size="11" font-family="${PLAN_FONT}" font-weight="bold" text-anchor="middle">${totalWidth} m</text>
    </g>
  `;

  const runningLeft = `
    <g class="dim-running-left">
      <line x1="${leftRunX}" y1="${topLeft.y}" x2="${leftRunX}" y2="${bottomLeft.y}" stroke="#111" stroke-width="1.2"/>
      <line x1="${leftRunX - 4}" y1="${topLeft.y}" x2="${leftRunX + 4}" y2="${topLeft.y}" stroke="#111" stroke-width="1.2"/>
      <line x1="${leftRunX - 4}" y1="${bottomLeft.y}" x2="${leftRunX + 4}" y2="${bottomLeft.y}" stroke="#111" stroke-width="1.2"/>
      <text x="${leftRunX - 8}" y="${(topLeft.y + bottomLeft.y) / 2}" font-size="11" font-family="${PLAN_FONT}" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${leftRunX - 8} ${(topLeft.y + bottomLeft.y) / 2})">${totalDepth} m</text>
    </g>
  `;

  // Individual segment dimensions — inner tier, per facade side.
  const segments = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const midWorld = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const mid = project(midWorld);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.2) continue;
    segments.push(
      `<text x="${mid.x}" y="${mid.y - 6}" font-size="10" font-family="${PLAN_FONT}" text-anchor="middle" fill="#333">${length.toFixed(2)} m</text>`,
    );
  }

  void padding;
  return `<g id="footprint-dimensions">${runningTop}${runningLeft}${segments.join("")}</g>`;
}

/**
 * Furniture hints. Lightweight rectangle primitives so rooms read as
 * inhabited rather than empty boxes. Keyed off room.type / room.zone.
 * @private
 */
function renderFurnitureHints(room, project) {
  if (!room?.bbox) return "";
  const { bbox } = room;
  const w = bbox.max_x - bbox.min_x;
  const h = bbox.max_y - bbox.min_y;
  if (w < 1.5 || h < 1.5) return "";
  const type = (room.type || room.name || "").toLowerCase();
  const centerX = (bbox.min_x + bbox.max_x) / 2;
  const centerY = (bbox.min_y + bbox.max_y) / 2;

  const stroke = "#8b8278";
  const fill = "rgba(139, 130, 120, 0.08)";
  const rect = (x, y, rw, rh) => {
    const tl = project({ x, y });
    const br = project({ x: x + rw, y: y + rh });
    return `<rect x="${tl.x}" y="${tl.y}" width="${br.x - tl.x}" height="${br.y - tl.y}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`;
  };

  if (/bed/.test(type)) {
    // Bed 1.5m × 2.0m centered
    return rect(centerX - 0.75, centerY - 1, 1.5, 2);
  }
  if (/living|lounge|family/.test(type)) {
    // Sofa 2.2m × 0.9m + coffee table
    return (
      rect(centerX - 1.1, centerY - 0.45, 2.2, 0.9) +
      rect(centerX - 0.4, centerY + 0.7, 0.8, 0.5)
    );
  }
  if (/kitchen/.test(type)) {
    // Kitchen island 2.4m × 0.9m
    return rect(centerX - 1.2, centerY - 0.45, 2.4, 0.9);
  }
  if (/dining/.test(type)) {
    // Dining table 1.6m × 0.9m
    return rect(centerX - 0.8, centerY - 0.45, 1.6, 0.9);
  }
  if (/bath|wc|toilet/.test(type)) {
    // Basin + toilet outlines, small
    return (
      rect(bbox.min_x + 0.2, bbox.min_y + 0.2, 0.6, 0.4) +
      rect(bbox.max_x - 0.7, bbox.max_y - 0.8, 0.5, 0.6)
    );
  }
  return "";
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
          <text x="${(topLeft.x + topRight.x) / 2}" y="${topLeft.y + 14}" font-size="10" font-family="${PLAN_FONT}" text-anchor="middle">STAIR</text>
          <line x1="${(topLeft.x + topRight.x) / 2}" y1="${bottomLeft.y - 16}" x2="${(topLeft.x + topRight.x) / 2}" y2="${topLeft.y + 24}" stroke="#333" stroke-width="1.4"/>
          <path d="M ${(topLeft.x + topRight.x) / 2} ${topLeft.y + 20} L ${(topLeft.x + topRight.x) / 2 - 4} ${topLeft.y + 28} L ${(topLeft.x + topRight.x) / 2 + 4} ${topLeft.y + 28} Z" fill="#333"/>
          <text x="${(topLeft.x + topRight.x) / 2}" y="${bottomLeft.y - 4}" font-size="9" font-family="${PLAN_FONT}" text-anchor="middle">UP</text>
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
  const padding = 90;
  const bounds = getSourceBounds(geometry, level);
  const project = buildTransform(bounds, width, height - 70, padding);
  const roomMap = new Map(
    (geometry.rooms || [])
      .filter((room) => room.level_id === level.id)
      .map((room) => [room.id, room]),
  );

  // Tier C6 — hard-fail at the renderer boundary on empty geometry. An empty
  // plan rectangle is a silent bug upstream; surface it loudly instead of
  // shipping an empty sheet.
  const strict = options.strict !== false;
  if (strict && roomMap.size === 0) {
    throw new Error(
      `[svgPlanRenderer] No rooms found for level "${level.id}" — refusing to render empty plan. ` +
        `Upstream geometry has ${geometry.rooms?.length || 0} total rooms across ${geometry.levels?.length || 0} levels.`,
    );
  }

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
  const footprint = geometry.footprints.find(
    (fp) => fp.id === level.footprint_id,
  );
  const footprintPath = polygonPath(footprint?.polygon || [], project);

  const roomMarkup = [...roomMap.values()]
    .map((room) => {
      const labelPoint = project(
        room.centroid || {
          x: (room.bbox.min_x + room.bbox.max_x) / 2,
          y: (room.bbox.min_y + room.bbox.max_y) / 2,
        },
      );
      const roomName = String(room.name || room.type || "ROOM").toUpperCase();
      const areaText = `${Number(room.actual_area || room.target_area || 0).toFixed(1)} m²`;
      const furniture = renderFurnitureHints(room, project);
      return `
        <path d="${polygonPath(room.polygon, project)}" fill="${roomFill(room.zone)}" stroke="#cabfae" stroke-width="1.2"/>
        ${furniture}
        <text x="${labelPoint.x}" y="${labelPoint.y - 6}" font-size="14" font-family="${PLAN_FONT}" font-weight="bold" text-anchor="middle" fill="#1a1a1a">${escapeXml(roomName)}</text>
        <text x="${labelPoint.x}" y="${labelPoint.y + 12}" font-size="11" font-family="${PLAN_FONT}" text-anchor="middle" fill="#333">${escapeXml(areaText)}</text>
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
      const leaf = Number(door.width_m || 0.9);
      const scaled = Math.max(10, leaf * 28);
      if (wall?.orientation === "vertical") {
        return `
          <line x1="${position.x - scaled / 2}" y1="${position.y}" x2="${position.x + scaled / 2}" y2="${position.y}" stroke="#7a3d16" stroke-width="2.5"/>
          <path d="M ${position.x - scaled / 2} ${position.y} A ${scaled} ${scaled} 0 0 1 ${position.x - scaled / 2} ${position.y + scaled}" fill="none" stroke="#7a3d16" stroke-width="1.2"/>
        `;
      }
      return `
        <line x1="${position.x}" y1="${position.y - scaled / 2}" x2="${position.x}" y2="${position.y + scaled / 2}" stroke="#7a3d16" stroke-width="2.5"/>
        <path d="M ${position.x} ${position.y - scaled / 2} A ${scaled} ${scaled} 0 0 1 ${position.x + scaled} ${position.y - scaled / 2}" fill="none" stroke="#7a3d16" stroke-width="1.2"/>
      `;
    })
    .join("");

  // Window markup now includes an inner parallel line for the sill marker.
  const windowMarkup = (geometry.windows || [])
    .filter((windowElement) => windowElement.level_id === level.id)
    .map((windowElement) => {
      const wall = wallMap.get(windowElement.wall_id);
      const position = project(windowElement.position_m);
      const leaf = Number(windowElement.width_m || 1.0);
      const scaled = Math.max(12, leaf * 28);
      if (wall?.orientation === "vertical") {
        return `
          <line x1="${position.x - scaled / 2}" y1="${position.y}" x2="${position.x + scaled / 2}" y2="${position.y}" stroke="#2c78c4" stroke-width="2.5"/>
          <line x1="${position.x - scaled / 2}" y1="${position.y + 4}" x2="${position.x + scaled / 2}" y2="${position.y + 4}" stroke="#2c78c4" stroke-width="1"/>
        `;
      }
      return `
        <line x1="${position.x}" y1="${position.y - scaled / 2}" x2="${position.x}" y2="${position.y + scaled / 2}" stroke="#2c78c4" stroke-width="2.5"/>
        <line x1="${position.x + 4}" y1="${position.y - scaled / 2}" x2="${position.x + 4}" y2="${position.y + scaled / 2}" stroke="#2c78c4" stroke-width="1"/>
      `;
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
  const gridBubblesMarkup = renderGridBubbles(
    geometry,
    bounds,
    project,
    padding,
  );
  const dimensionsMarkup = renderFootprintDimensions(
    footprint,
    project,
    padding,
  );

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
  ${dimensionsMarkup}
  ${gridBubblesMarkup}
  ${renderNorthArrow(width, padding, geometry.site?.north_orientation_deg || 0)}
  ${renderScaleAndTitle(level, width, height, padding)}
  ${renderLegend(width, height, padding)}
</svg>`;

  return {
    svg,
    level_id: level.id,
    room_count: roomMap.size,
    stair_count: (geometry.stairs || []).filter(
      (stair) => stair.level_id === level.id,
    ).length,
    renderer: "deterministic-plan-svg",
    title: level.name || "Plan",
  };
}

export default {
  renderPlanSvg,
};
