import { isFeatureEnabled } from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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
      return "#f6ede3";
    case "service":
      return "#edf3f7";
    case "core":
      return "#f1f1f1";
    default:
      return "#fcf8f1";
  }
}

function resolveRoomBBox(room = {}) {
  if (room?.bbox?.min_x !== undefined) {
    return room.bbox;
  }
  if (
    room?.bbox?.x !== undefined &&
    room?.bbox?.y !== undefined &&
    room?.bbox?.width !== undefined &&
    room?.bbox?.height !== undefined
  ) {
    return {
      min_x: room.bbox.x,
      min_y: room.bbox.y,
      max_x: Number(room.bbox.x) + Number(room.bbox.width),
      max_y: Number(room.bbox.y) + Number(room.bbox.height),
    };
  }
  return {
    min_x: 0,
    min_y: 0,
    max_x: 0,
    max_y: 0,
  };
}

function hasRoomGeometry(room = {}) {
  const bbox = resolveRoomBBox(room);
  return (
    (Array.isArray(room.polygon) && room.polygon.length >= 4) ||
    (Number(bbox.max_x) > Number(bbox.min_x) &&
      Number(bbox.max_y) > Number(bbox.min_y))
  );
}

function roomPolygon(room = {}) {
  if (Array.isArray(room.polygon) && room.polygon.length >= 4) {
    return room.polygon;
  }
  const bbox = resolveRoomBBox(room);
  if (
    Number(bbox.max_x) > Number(bbox.min_x) &&
    Number(bbox.max_y) > Number(bbox.min_y)
  ) {
    return [
      { x: bbox.min_x, y: bbox.min_y },
      { x: bbox.max_x, y: bbox.min_y },
      { x: bbox.max_x, y: bbox.max_y },
      { x: bbox.min_x, y: bbox.max_y },
    ];
  }
  return [];
}

function summarizePlanGeometry(rooms = []) {
  const totalRooms = rooms.length;
  const polygonRooms = rooms.filter(
    (room) => Array.isArray(room.polygon) && room.polygon.length >= 4,
  ).length;
  const boundedRooms = rooms.filter((room) => hasRoomGeometry(room)).length;
  const roomsWithArea = rooms.filter((room) =>
    Number.isFinite(Number(room.actual_area || room.target_area_m2)),
  ).length;
  const completeness = totalRooms
    ? clamp(
        (polygonRooms / totalRooms) * 0.45 +
          (boundedRooms / totalRooms) * 0.35 +
          (roomsWithArea / totalRooms) * 0.2,
        0,
        1,
      )
    : 0;

  return {
    totalRooms,
    polygonRooms,
    boundedRooms,
    roomsWithArea,
    completeness: Number(completeness.toFixed(3)),
    strongEnough: totalRooms > 0 && boundedRooms > 0 && completeness >= 0.45,
  };
}

function uppercaseLabel(value, fallback = "ROOM") {
  const text = String(value || fallback).trim();
  return (text || fallback).replace(/[_-]+/g, " ").toUpperCase();
}

function formatMeters(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0.0 m";
  }
  return `${numeric.toFixed(1)} m`;
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
      <text x="0" y="-16" font-size="12" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">N</text>
    </g>
  `;
}

function renderScaleAndTitle(level, width, height, padding) {
  return `
    <g id="title-block">
      <rect x="${padding}" y="${height - padding + 8}" width="360" height="58" fill="#fff" stroke="#222" stroke-width="1.3"/>
      <text x="${padding + 12}" y="${height - padding + 28}" font-size="15" font-family="Arial, sans-serif" font-weight="700">${escapeXml(level.name || "Plan")}</text>
      <text x="${padding + 12}" y="${height - padding + 45}" font-size="11" font-family="Arial, sans-serif" font-weight="700">Scale 1:100</text>
      <text x="${padding + 136}" y="${height - padding + 45}" font-size="11" font-family="Arial, sans-serif">North aligned</text>
      <text x="${padding + 252}" y="${height - padding + 45}" font-size="11" font-family="Arial, sans-serif">Geometry-locked</text>
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
      <line x1="${x + 12}" y1="${y + 46}" x2="${x + 44}" y2="${y + 46}" stroke="#2c78c4" stroke-width="2.8"/>
      <text x="${x + 52}" y="${y + 50}" font-size="10" font-family="Arial, sans-serif">Openings / glazing</text>
    </g>
  `;
}

function renderRoomLabel(labelPoint, room = {}) {
  const name = escapeXml(uppercaseLabel(room.name, "ROOM"));
  const areaValue = Number(room.actual_area || room.target_area_m2 || 0);
  const areaText = escapeXml(
    `${Number.isFinite(areaValue) ? areaValue.toFixed(1) : "0.0"} M2`,
  );
  const labelWidth = Math.max(72, name.length * 7.6);
  return `
    <g class="room-label">
      <rect x="${labelPoint.x - labelWidth / 2}" y="${labelPoint.y - 20}" width="${labelWidth}" height="18" rx="2" fill="#ffffff" fill-opacity="0.92" stroke="#d9d4ca" stroke-width="0.6"/>
      <rect x="${labelPoint.x - 32}" y="${labelPoint.y - 2}" width="64" height="14" rx="2" fill="#ffffff" fill-opacity="0.8" stroke="#e5dfd3" stroke-width="0.5"/>
      <text x="${labelPoint.x}" y="${labelPoint.y - 7}" font-size="13.5" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${name}</text>
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
      const bubbleY = Math.max(16, top.y - 10);
      return `
        <line x1="${top.x}" y1="${top.y}" x2="${bottom.x}" y2="${bottom.y}" stroke="#d7c8aa" stroke-width="1" stroke-dasharray="6 4"/>
        <circle cx="${top.x}" cy="${bubbleY}" r="9" fill="#fffdf9" stroke="#8c6b34" stroke-width="1"/>
        <text x="${top.x}" y="${bubbleY + 4}" font-size="10" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(axis.label)}</text>
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
      const bubbleX = Math.max(12, left.x - 12);
      return `
        <line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}" stroke="#d7c8aa" stroke-width="1" stroke-dasharray="6 4"/>
        <circle cx="${bubbleX}" cy="${left.y}" r="9" fill="#fffdf9" stroke="#8c6b34" stroke-width="1"/>
        <text x="${bubbleX}" y="${left.y + 4}" font-size="10" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(axis.label)}</text>
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
      const stepCount = 8;
      const stepSpacing = (bottomLeft.y - topLeft.y) / Math.max(stepCount, 1);
      const steps = Array.from({ length: stepCount }, (_, index) => {
        const y = Number((topLeft.y + stepSpacing * (index + 1)).toFixed(2));
        return `<line x1="${topLeft.x + 4}" y1="${y}" x2="${topRight.x - 4}" y2="${y}" stroke="#444" stroke-width="1"/>`;
      }).join("");

      return `
        <g class="stair-core">
          <rect x="${topLeft.x}" y="${topLeft.y}" width="${topRight.x - topLeft.x}" height="${bottomLeft.y - topLeft.y}" fill="#f5f5f5" stroke="#333" stroke-width="1.6"/>
          ${steps}
          <text x="${(topLeft.x + topRight.x) / 2}" y="${topLeft.y + 14}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">STAIR</text>
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

function renderExternalDimensions(bounds, project) {
  if (!bounds?.width || !bounds?.height) {
    return "";
  }

  const topLeft = project({ x: bounds.min_x, y: bounds.min_y });
  const topRight = project({ x: bounds.max_x, y: bounds.min_y });
  const bottomRight = project({ x: bounds.max_x, y: bounds.max_y });
  const offsetTop = topLeft.y - 28;
  const offsetRight = topRight.x + 28;

  return `
    <g id="external-dimensions">
      <line x1="${topLeft.x}" y1="${topLeft.y}" x2="${topLeft.x}" y2="${offsetTop}" stroke="#4b5563" stroke-width="1"/>
      <line x1="${topRight.x}" y1="${topRight.y}" x2="${topRight.x}" y2="${offsetTop}" stroke="#4b5563" stroke-width="1"/>
      <line x1="${topLeft.x}" y1="${offsetTop}" x2="${topRight.x}" y2="${offsetTop}" stroke="#111" stroke-width="1.2"/>
      <line x1="${topLeft.x}" y1="${offsetTop - 4}" x2="${topLeft.x}" y2="${offsetTop + 4}" stroke="#111" stroke-width="1.2"/>
      <line x1="${topRight.x}" y1="${offsetTop - 4}" x2="${topRight.x}" y2="${offsetTop + 4}" stroke="#111" stroke-width="1.2"/>
      <text x="${(topLeft.x + topRight.x) / 2}" y="${offsetTop - 6}" font-size="11" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(formatMeters(bounds.width))}</text>

      <line x1="${topRight.x}" y1="${topRight.y}" x2="${offsetRight}" y2="${topRight.y}" stroke="#4b5563" stroke-width="1"/>
      <line x1="${bottomRight.x}" y1="${bottomRight.y}" x2="${offsetRight}" y2="${bottomRight.y}" stroke="#4b5563" stroke-width="1"/>
      <line x1="${offsetRight}" y1="${topRight.y}" x2="${offsetRight}" y2="${bottomRight.y}" stroke="#111" stroke-width="1.2"/>
      <line x1="${offsetRight - 4}" y1="${topRight.y}" x2="${offsetRight + 4}" y2="${topRight.y}" stroke="#111" stroke-width="1.2"/>
      <line x1="${offsetRight - 4}" y1="${bottomRight.y}" x2="${offsetRight + 4}" y2="${bottomRight.y}" stroke="#111" stroke-width="1.2"/>
      <text x="${offsetRight + 14}" y="${(topRight.y + bottomRight.y) / 2}" font-size="11" font-family="Arial, sans-serif" font-weight="700" transform="rotate(90 ${offsetRight + 14} ${(topRight.y + bottomRight.y) / 2})" text-anchor="middle">${escapeXml(formatMeters(bounds.height))}</text>
    </g>
  `;
}

function renderFurnitureHints(rooms = [], project) {
  const hints = [];
  rooms.forEach((room) => {
    const bbox = resolveRoomBBox(room);
    const topLeft = project({ x: bbox.min_x, y: bbox.min_y });
    const bottomRight = project({ x: bbox.max_x, y: bbox.max_y });
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    const centerX = topLeft.x + width / 2;
    const centerY = topLeft.y + height / 2;
    const type = String(room.name || room.type || "").toLowerCase();

    if (width < 60 || height < 40) {
      return;
    }

    if (type.includes("living")) {
      hints.push(`
        <g class="furniture-hint living">
          <rect x="${centerX - 26}" y="${centerY - 10}" width="52" height="20" fill="none" stroke="#7b8794" stroke-width="1"/>
          <rect x="${centerX - 12}" y="${centerY + 14}" width="24" height="12" fill="none" stroke="#7b8794" stroke-width="1"/>
        </g>
      `);
    } else if (type.includes("kitchen")) {
      hints.push(`
        <g class="furniture-hint kitchen">
          <rect x="${topLeft.x + 10}" y="${topLeft.y + 10}" width="${Math.max(30, width - 20)}" height="10" fill="none" stroke="#7b8794" stroke-width="1"/>
          <rect x="${topLeft.x + 10}" y="${topLeft.y + 24}" width="${Math.max(24, width * 0.45)}" height="10" fill="none" stroke="#7b8794" stroke-width="1"/>
        </g>
      `);
    } else if (type.includes("bed")) {
      hints.push(`
        <g class="furniture-hint bedroom">
          <rect x="${centerX - 20}" y="${centerY - 24}" width="40" height="54" fill="none" stroke="#7b8794" stroke-width="1"/>
          <line x1="${centerX - 20}" y1="${centerY - 10}" x2="${centerX + 20}" y2="${centerY - 10}" stroke="#7b8794" stroke-width="1"/>
        </g>
      `);
    } else if (type.includes("bath")) {
      hints.push(`
        <g class="furniture-hint bathroom">
          <rect x="${centerX - 16}" y="${centerY - 10}" width="32" height="20" rx="10" fill="none" stroke="#7b8794" stroke-width="1"/>
          <circle cx="${centerX + 22}" cy="${centerY - 6}" r="6" fill="none" stroke="#7b8794" stroke-width="1"/>
        </g>
      `);
    } else if (type.includes("dining")) {
      hints.push(`
        <g class="furniture-hint dining">
          <rect x="${centerX - 22}" y="${centerY - 12}" width="44" height="24" fill="none" stroke="#7b8794" stroke-width="1"/>
          <circle cx="${centerX - 30}" cy="${centerY}" r="4" fill="none" stroke="#7b8794" stroke-width="1"/>
          <circle cx="${centerX + 30}" cy="${centerY}" r="4" fill="none" stroke="#7b8794" stroke-width="1"/>
        </g>
      `);
    }
  });

  return hints.join("");
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
  const levelRooms = (geometry.rooms || []).filter(
    (room) => room.level_id === level.id,
  );
  const geometrySummary = summarizePlanGeometry(levelRooms);
  const roomMap = new Map(levelRooms.map((room) => [room.id, room]));
  const wallMap = new Map(
    (geometry.walls || [])
      .filter((wall) => wall.level_id === level.id)
      .map((wall) => [wall.id, wall]),
  );

  if (
    isFeatureEnabled("usePlanRendererUpgradePhase8") &&
    !geometrySummary.strongEnough
  ) {
    return {
      svg: null,
      level_id: level.id,
      room_count: roomMap.size,
      stair_count: 0,
      renderer: "deterministic-plan-svg",
      title: level.name || "Plan",
      status: "blocked",
      blocking_reasons: [
        `Plan geometry for ${level.name || level.id || "level"} is incomplete: ${geometrySummary.totalRooms} rooms, ${geometrySummary.boundedRooms} bounded rooms, completeness ${geometrySummary.completeness}.`,
      ],
      technical_quality_metadata: {
        drawing_type: "plan",
        room_count: roomMap.size,
        geometry_complete: false,
        geometry_completeness: geometrySummary.completeness,
        room_label_count: 0,
        area_label_count: 0,
      },
    };
  }

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
      const bbox = resolveRoomBBox(room);
      const labelPoint = project(
        room.centroid || {
          x: (bbox.min_x + bbox.max_x) / 2,
          y: (bbox.min_y + bbox.max_y) / 2,
        },
      );
      return `
        <path d="${polygonPath(roomPolygon(room), project)}" fill="${roomFill(room.zone)}" stroke="#c2b29b" stroke-width="1.2"/>
        ${options.hideRoomLabels ? "" : renderRoomLabel(labelPoint, room)}
      `;
    })
    .join("");

  const wallMarkup = [...wallMap.values()]
    .map((wall) => {
      const start = project(wall.start);
      const end = project(wall.end);
      return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#111" stroke-width="${wall.exterior ? 7 : 4.5}" stroke-linecap="square"/>`;
    })
    .join("");

  const doorCount = (geometry.doors || []).filter(
    (door) => door.level_id === level.id,
  ).length;
  const windowCount = (geometry.windows || []).filter(
    (windowElement) => windowElement.level_id === level.id,
  ).length;
  const stairCount = (geometry.stairs || []).filter(
    (stair) => stair.level_id === level.id,
  ).length;
  const circulationPathCount = (geometry.circulation || []).filter(
    (path) => path.level_id === level.id,
  ).length;

  const doorMarkup = (geometry.doors || [])
    .filter((door) => door.level_id === level.id)
    .map((door) => {
      const wall = wallMap.get(door.wall_id);
      const position = project(door.position_m);
      const halfWidth = 8;
      if (wall?.orientation === "vertical") {
        return `
          <line x1="${position.x - halfWidth}" y1="${position.y}" x2="${position.x + halfWidth}" y2="${position.y}" stroke="#7a3d16" stroke-width="2.5"/>
          <path d="M ${position.x} ${position.y} A 18 18 0 0 1 ${position.x + 18} ${position.y + 18}" fill="none" stroke="#7a3d16" stroke-width="1.3"/>
        `;
      }
      return `
        <line x1="${position.x}" y1="${position.y - halfWidth}" x2="${position.x}" y2="${position.y + halfWidth}" stroke="#7a3d16" stroke-width="2.5"/>
        <path d="M ${position.x} ${position.y} A 18 18 0 0 1 ${position.x + 18} ${position.y - 18}" fill="none" stroke="#7a3d16" stroke-width="1.3"/>
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
        return `
          <line x1="${position.x - halfWidth}" y1="${position.y}" x2="${position.x + halfWidth}" y2="${position.y}" stroke="#2c78c4" stroke-width="3"/>
          <line x1="${position.x - halfWidth}" y1="${position.y - 3}" x2="${position.x + halfWidth}" y2="${position.y - 3}" stroke="#9fd0ef" stroke-width="1.2"/>
        `;
      }
      return `
        <line x1="${position.x}" y1="${position.y - halfWidth}" x2="${position.x}" y2="${position.y + halfWidth}" stroke="#2c78c4" stroke-width="3"/>
        <line x1="${position.x + 3}" y1="${position.y - halfWidth}" x2="${position.x + 3}" y2="${position.y + halfWidth}" stroke="#9fd0ef" stroke-width="1.2"/>
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
  const dimensionMarkup = renderExternalDimensions(bounds, project);
  const furnitureMarkup = renderFurnitureHints([...roomMap.values()], project);
  const gridAxisCount =
    (geometry.metadata?.structural_grid?.x_axes || []).length +
    (geometry.metadata?.structural_grid?.y_axes || []).length;
  const roomDensityScore = clamp(
    roomMap.size * 0.16 +
      doorCount * 0.05 +
      windowCount * 0.05 +
      stairCount * 0.08 +
      (geometrySummary.completeness || 0) * 0.4,
    0,
    1,
  );

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <path d="${siteOutline}" fill="none" stroke="#9ea3aa" stroke-width="1.5" stroke-dasharray="8 6"/>
  <path d="${buildableOutline}" fill="none" stroke="#d88f2d" stroke-width="1.8" stroke-dasharray="6 4"/>
  ${structuralGridMarkup}
  ${dimensionMarkup}
  <path d="${footprintPath}" fill="#fafafa" stroke="#555" stroke-width="1.5"/>
  ${roomMarkup}
  ${furnitureMarkup}
  ${wallMarkup}
  ${circulationMarkup}
  ${stairMarkup}
  ${doorMarkup}
  ${windowMarkup}
  ${renderNorthArrow(width, padding, geometry.site?.north_orientation_deg || 0)}
  ${renderScaleAndTitle(level, width, height, padding)}
  ${renderLegend(width, height, padding)}
  ${options.overlayMarkup || ""}
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
      geometry_complete: geometrySummary.strongEnough,
      geometry_completeness: geometrySummary.completeness,
      room_label_count: options.hideRoomLabels ? 0 : roomMap.size,
      area_label_count: options.hideRoomLabels ? 0 : roomMap.size,
      has_north_arrow: true,
      has_title_block: true,
      has_legend: true,
      has_external_dimensions: true,
      furniture_hint_count: (furnitureMarkup.match(/furniture-hint/g) || [])
        .length,
      grid_bubble_count: gridAxisCount,
      door_swing_count: doorCount,
      plan_density_score: Number(roomDensityScore.toFixed(3)),
      structural_grid_visible: Boolean(geometry.metadata?.structural_grid),
      line_hierarchy: {
        site_boundary: 1.5,
        buildable_outline: 1.8,
        interior_wall: 4.5,
        exterior_wall: 7,
        openings: 3,
      },
    },
  };
}

export default {
  renderPlanSvg,
};
