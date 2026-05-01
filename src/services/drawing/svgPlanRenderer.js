import { isFeatureEnabled } from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  getBlueprintTheme,
  getLevelDrawingBoundsWithSource,
  resolveCompiledProjectGeometryInput,
} from "./drawingBounds.js";
import { getSheetTypography } from "./sheetTypographyService.js";

const IDENTITY_TYPOGRAPHY = { fontScale: 1, strokeScale: 1 };

function scaleSize(base, multiplier) {
  return Math.round(Number(base || 0) * Number(multiplier || 1) * 100) / 100;
}

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

function round(value, precision = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function formatNumber(value, precision = 2) {
  return round(value, precision).toFixed(precision);
}

function formatMeters(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0.0 m";
  }
  return `${numeric.toFixed(1)} m`;
}

function pointFrom(value = {}, fallback = {}) {
  return {
    x: Number.isFinite(Number(value?.x))
      ? Number(value.x)
      : Number(fallback?.x || 0),
    y: Number.isFinite(Number(value?.y))
      ? Number(value.y)
      : Number(fallback?.y || 0),
  };
}

function sortByStableKey(items = [], keyBuilder = (entry) => entry?.id || "") {
  return [...(items || [])].sort((left, right) =>
    String(keyBuilder(left)).localeCompare(String(keyBuilder(right))),
  );
}

function stableParity(seed = "") {
  let hash = 0;
  const text = String(seed || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % 2 === 0;
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
      min_x: Number(room.bbox.x),
      min_y: Number(room.bbox.y),
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

function getRoomDimensionText(room = {}) {
  const bbox = resolveRoomBBox(room);
  const width = Number(bbox.max_x) - Number(bbox.min_x);
  const depth = Number(bbox.max_y) - Number(bbox.min_y);
  if (!(width > 0 && depth > 0)) {
    return "";
  }

  const primary = Math.max(width, depth);
  const secondary = Math.min(width, depth);
  return `${primary.toFixed(1)} x ${secondary.toFixed(1)} M`;
}

function projectRoomRect(room = {}, project) {
  const bbox = resolveRoomBBox(room);
  if (
    !(
      Number(bbox.max_x) > Number(bbox.min_x) &&
      Number(bbox.max_y) > Number(bbox.min_y)
    )
  ) {
    return null;
  }

  const topLeft = project({ x: bbox.min_x, y: bbox.min_y });
  const bottomRight = project({ x: bbox.max_x, y: bbox.max_y });
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

function roomPolygon(room = {}) {
  if (Array.isArray(room.polygon) && room.polygon.length >= 3) {
    return room.polygon.map((point) => pointFrom(point));
  }
  const bbox = resolveRoomBBox(room);
  if (
    Number(bbox.max_x) > Number(bbox.min_x) &&
    Number(bbox.max_y) > Number(bbox.min_y)
  ) {
    return [
      { x: Number(bbox.min_x), y: Number(bbox.min_y) },
      { x: Number(bbox.max_x), y: Number(bbox.min_y) },
      { x: Number(bbox.max_x), y: Number(bbox.max_y) },
      { x: Number(bbox.min_x), y: Number(bbox.max_y) },
    ];
  }
  return [];
}

function hasRoomGeometry(room = {}) {
  return roomPolygon(room).length >= 3;
}

function summarizePlanGeometry(rooms = [], walls = [], hasFootprint = false) {
  const totalRooms = rooms.length;
  const boundedRooms = rooms.filter((room) => hasRoomGeometry(room)).length;
  const roomsWithArea = rooms.filter((room) =>
    Number.isFinite(Number(room.actual_area || room.target_area_m2)),
  ).length;
  const wallCount = (walls || []).length;
  const completeness = totalRooms
    ? clamp(
        (boundedRooms / totalRooms) * 0.55 +
          (roomsWithArea / totalRooms) * 0.2 +
          Math.min(0.15, wallCount * 0.025) +
          (hasFootprint ? 0.1 : 0),
        0,
        1,
      )
    : 0;

  return {
    totalRooms,
    boundedRooms,
    roomsWithArea,
    wallCount,
    completeness: Number(completeness.toFixed(3)),
    strongEnough: totalRooms > 0 && boundedRooms > 0 && completeness >= 0.45,
  };
}

function uppercaseLabel(value, fallback = "ROOM") {
  const text = String(value || fallback).trim();
  return (text || fallback).replace(/[_-]+/g, " ").toUpperCase();
}

function polygonPath(points = [], project) {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    typeof project !== "function"
  ) {
    return "";
  }
  const projected = points.map((point) => project(point));
  const allFinite = projected.every(
    (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (!allFinite) {
    return "";
  }
  return `${projected
    .map(
      (p, index) =>
        `${index === 0 ? "M" : "L"} ${formatNumber(p.x)} ${formatNumber(p.y)}`,
    )
    .join(" ")} Z`;
}

function wallVectors(wall = {}) {
  const start = pointFrom(wall.start);
  const end = pointFrom(wall.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    return null;
  }
  return {
    start,
    end,
    length,
    dir: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
  };
}

function wallPolygon(wall = {}) {
  const vectors = wallVectors(wall);
  if (!vectors) {
    return [];
  }
  const halfThickness = Math.max(
    0.05,
    Number(wall.thickness_m || (wall.exterior ? 0.3 : 0.14)) / 2,
  );
  return [
    {
      x: vectors.start.x + vectors.normal.x * halfThickness,
      y: vectors.start.y + vectors.normal.y * halfThickness,
    },
    {
      x: vectors.end.x + vectors.normal.x * halfThickness,
      y: vectors.end.y + vectors.normal.y * halfThickness,
    },
    {
      x: vectors.end.x - vectors.normal.x * halfThickness,
      y: vectors.end.y - vectors.normal.y * halfThickness,
    },
    {
      x: vectors.start.x - vectors.normal.x * halfThickness,
      y: vectors.start.y - vectors.normal.y * halfThickness,
    },
  ];
}

function resolveInteriorNormal(wall = {}, vectors = {}) {
  const side = String(wall.metadata?.side || wall.side || "")
    .trim()
    .toLowerCase();
  if (side === "south") return { x: 0, y: 1 };
  if (side === "north") return { x: 0, y: -1 };
  if (side === "east") return { x: -1, y: 0 };
  if (side === "west") return { x: 1, y: 0 };
  return vectors.normal || { x: 0, y: 1 };
}

function chooseScaleBarMeters(scalePxPerMeter = 1) {
  const candidates = [0.5, 1, 2, 5, 10, 20];
  const maxWidthPx = 160;
  const eligible = candidates.filter(
    (entry) => entry * Math.max(scalePxPerMeter, 1) <= maxWidthPx,
  );
  return eligible[eligible.length - 1] || 1;
}

function buildTransform(bounds, width, height, layout = {}) {
  const availableWidth = Math.max(1, width - layout.left - layout.right);
  const availableHeight = Math.max(1, height - layout.top - layout.bottom);
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );

  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const offsetX = layout.left + (availableWidth - contentWidth) / 2;
  const offsetY = layout.top + (availableHeight - contentHeight) / 2;

  return {
    scale,
    availableWidth,
    availableHeight,
    offsetX,
    offsetY,
    project(point = {}) {
      return {
        x: offsetX + (Number(point.x || 0) - bounds.min_x) * scale,
        y: offsetY + (Number(point.y || 0) - bounds.min_y) * scale,
      };
    },
  };
}

// Room labels were too crowded at the original sheet-mode font scale.
// Damp them by 18% so they remain legible without dominating the plan.
const ROOM_LABEL_FONT_DAMP = 0.82;

function renderRoomLabel(
  room = {},
  project,
  theme,
  typo = IDENTITY_TYPOGRAPHY,
  roomNumber = "",
) {
  const bbox = resolveRoomBBox(room);
  const centroid = pointFrom(room.centroid, {
    x: (Number(bbox.min_x) + Number(bbox.max_x)) / 2,
    y: (Number(bbox.min_y) + Number(bbox.max_y)) / 2,
  });
  const labelPoint = project(centroid);
  const rawName = uppercaseLabel(room.name, "ROOM");
  const name = escapeXml(roomNumber ? `${roomNumber} ${rawName}` : rawName);
  const areaValue = Number(room.actual_area || room.target_area_m2 || 0);
  const areaText = `${Number.isFinite(areaValue) ? areaValue.toFixed(1) : "0.0"} M2`;
  const dimensionText = getRoomDimensionText(room);
  const secondaryLine = dimensionText
    ? `${areaText} · ${dimensionText}`
    : areaText;
  const labelFontScale = typo.fontScale * ROOM_LABEL_FONT_DAMP;
  const nameSize = scaleSize(13, labelFontScale);
  const subSize = scaleSize(10, labelFontScale);
  const labelWidth = Math.max(
    scaleSize(110, labelFontScale),
    name.length * nameSize * 0.65,
    secondaryLine.length * subSize * 0.6,
  );
  const labelHeight = scaleSize(38, labelFontScale);
  const halfHeight = labelHeight / 2;
  const nameOffset = scaleSize(6, labelFontScale);
  const subOffset = scaleSize(10, labelFontScale);
  const stroke = scaleSize(0.95, typo.strokeScale);

  return `
    <g class="plan-room-label">
      <rect x="${formatNumber(labelPoint.x - labelWidth / 2)}" y="${formatNumber(
        labelPoint.y - halfHeight,
      )}" width="${formatNumber(labelWidth)}" height="${formatNumber(
        labelHeight,
      )}" fill="${theme.paper}" fill-opacity="0.95" stroke="${theme.guide}" stroke-width="${stroke}" rx="4" ry="4"/>
      <text x="${formatNumber(labelPoint.x)}" y="${formatNumber(
        labelPoint.y - nameOffset,
      )}" font-size="${nameSize}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">${name}</text>
      <text x="${formatNumber(labelPoint.x)}" y="${formatNumber(
        labelPoint.y + subOffset,
      )}" font-size="${subSize}" font-family="Arial, sans-serif" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        secondaryLine,
      )}</text>
    </g>
  `;
}

function renderFurnitureHints(rooms = [], project, theme) {
  const entries = sortByStableKey(rooms).flatMap((room) => {
    const rect = projectRoomRect(room, project);
    if (!rect || rect.width < 70 || rect.height < 56) {
      return [];
    }

    const name = String(room.name || room.id || "").toLowerCase();
    const stroke = theme.lineLight;
    const guide = theme.guide;
    const furniture = [];

    if (name.includes("living") || name.includes("lounge")) {
      const sofaW = Math.min(rect.width * 0.42, 72);
      const sofaH = Math.min(rect.height * 0.2, 26);
      furniture.push(
        `<rect x="${formatNumber(rect.x + 8)}" y="${formatNumber(rect.y + 8)}" width="${formatNumber(sofaW)}" height="${formatNumber(sofaH)}" fill="none" stroke="${stroke}" stroke-width="0.95" rx="5" ry="5"/>`,
        `<rect x="${formatNumber(rect.x + 8)}" y="${formatNumber(rect.y + 8)}" width="${formatNumber(sofaW)}" height="${formatNumber(Math.max(6, sofaH * 0.38))}" fill="none" stroke="${guide}" stroke-width="0.8" rx="4" ry="4"/>`,
        `<rect x="${formatNumber(rect.x + rect.width * 0.52)}" y="${formatNumber(rect.y + rect.height * 0.56)}" width="${formatNumber(Math.min(30, rect.width * 0.22))}" height="${formatNumber(Math.min(18, rect.height * 0.16))}" fill="none" stroke="${guide}" stroke-width="0.8" rx="3" ry="3"/>`,
      );
    } else if (name.includes("kitchen")) {
      const counterDepth = Math.min(rect.height * 0.16, 16);
      furniture.push(
        `<rect x="${formatNumber(rect.x + 6)}" y="${formatNumber(rect.y + 6)}" width="${formatNumber(rect.width - 12)}" height="${formatNumber(counterDepth)}" fill="none" stroke="${stroke}" stroke-width="0.95"/>`,
        `<rect x="${formatNumber(rect.x + rect.width * 0.22)}" y="${formatNumber(rect.y + rect.height * 0.48)}" width="${formatNumber(Math.min(rect.width * 0.42, 68))}" height="${formatNumber(Math.min(rect.height * 0.2, 20))}" fill="none" stroke="${guide}" stroke-width="0.85" rx="3" ry="3"/>`,
      );
    } else if (name.includes("bed")) {
      const bedW = Math.min(rect.width * 0.46, 74);
      const bedH = Math.min(rect.height * 0.3, 44);
      furniture.push(
        `<rect x="${formatNumber(rect.x + 8)}" y="${formatNumber(rect.y + 8)}" width="${formatNumber(bedW)}" height="${formatNumber(bedH)}" fill="none" stroke="${stroke}" stroke-width="0.95" rx="4" ry="4"/>`,
        `<line x1="${formatNumber(rect.x + 8 + bedW * 0.5)}" y1="${formatNumber(rect.y + 8)}" x2="${formatNumber(rect.x + 8 + bedW * 0.5)}" y2="${formatNumber(rect.y + 8 + bedH)}" stroke="${guide}" stroke-width="0.8"/>`,
        `<rect x="${formatNumber(rect.x + bedW + 14)}" y="${formatNumber(rect.y + 10)}" width="${formatNumber(Math.min(16, rect.width * 0.12))}" height="${formatNumber(Math.min(24, rect.height * 0.22))}" fill="none" stroke="${guide}" stroke-width="0.8"/>`,
      );
    } else if (name.includes("study") || name.includes("office")) {
      furniture.push(
        `<rect x="${formatNumber(rect.x + 8)}" y="${formatNumber(rect.y + 8)}" width="${formatNumber(Math.min(rect.width * 0.42, 64))}" height="${formatNumber(Math.min(rect.height * 0.18, 18))}" fill="none" stroke="${stroke}" stroke-width="0.95"/>`,
        `<circle cx="${formatNumber(rect.x + rect.width * 0.34)}" cy="${formatNumber(rect.y + rect.height * 0.46)}" r="${formatNumber(Math.min(9, rect.width * 0.07), 1)}" fill="none" stroke="${guide}" stroke-width="0.8"/>`,
      );
    } else if (name.includes("dining")) {
      furniture.push(
        `<rect x="${formatNumber(rect.x + rect.width * 0.28)}" y="${formatNumber(rect.y + rect.height * 0.28)}" width="${formatNumber(Math.min(rect.width * 0.34, 54))}" height="${formatNumber(Math.min(rect.height * 0.2, 20))}" fill="none" stroke="${stroke}" stroke-width="0.95" rx="3" ry="3"/>`,
        `<circle cx="${formatNumber(rect.x + rect.width * 0.26)}" cy="${formatNumber(rect.y + rect.height * 0.38)}" r="3.2" fill="none" stroke="${guide}" stroke-width="0.8"/>`,
        `<circle cx="${formatNumber(rect.x + rect.width * 0.66)}" cy="${formatNumber(rect.y + rect.height * 0.38)}" r="3.2" fill="none" stroke="${guide}" stroke-width="0.8"/>`,
      );
    } else if (name.includes("bath")) {
      furniture.push(
        `<rect x="${formatNumber(rect.x + 8)}" y="${formatNumber(rect.y + 8)}" width="${formatNumber(Math.min(rect.width * 0.46, 60))}" height="${formatNumber(Math.min(rect.height * 0.22, 22))}" fill="none" stroke="${stroke}" stroke-width="0.95" rx="8" ry="8"/>`,
        `<rect x="${formatNumber(rect.x + rect.width * 0.64)}" y="${formatNumber(rect.y + 10)}" width="${formatNumber(Math.min(rect.width * 0.18, 18))}" height="${formatNumber(Math.min(rect.height * 0.18, 18))}" fill="none" stroke="${guide}" stroke-width="0.8"/>`,
      );
    }

    if (!furniture.length) {
      return [];
    }

    return [
      `<g class="plan-furniture-hint" data-room-id="${escapeXml(room.id || room.name || "")}">${furniture.join("")}</g>`,
    ];
  });

  return {
    markup: entries.length
      ? `<g id="phase8-plan-furniture">${entries.join("")}</g>`
      : "",
    count: entries.length,
  };
}

function renderWallMarkup(
  walls = [],
  project,
  theme,
  typo = IDENTITY_TYPOGRAPHY,
) {
  const orderedWalls = [...(walls || [])].sort((left, right) => {
    if (Boolean(right.exterior) !== Boolean(left.exterior)) {
      return Number(Boolean(right.exterior)) - Number(Boolean(left.exterior));
    }
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
  const exteriorStroke = scaleSize(2.05, typo.strokeScale);
  const interiorStroke = scaleSize(1.28, typo.strokeScale);

  return orderedWalls
    .map((wall) => {
      const path = polygonPath(wallPolygon(wall), project);
      if (!path) {
        return "";
      }
      const fill = wall.exterior ? theme.poche : theme.pocheSoft;
      const stroke = wall.exterior ? theme.line : theme.lineMuted;
      const strokeWidth = wall.exterior ? exteriorStroke : interiorStroke;
      return `<path d="${path}" fill="${fill}" fill-opacity="${wall.exterior ? "0.98" : "0.76"}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="miter" data-wall-role="${wall.exterior ? "exterior" : "interior"}"/>`;
    })
    .join("");
}

function renderWindowMarkup(
  windows = [],
  wallMap = new Map(),
  project,
  scale,
  theme,
) {
  return sortByStableKey(
    windows,
    (entry) =>
      `${entry.wall_id || ""}:${entry.position_m?.x || 0}:${entry.position_m?.y || 0}:${entry.id || ""}`,
  )
    .map((windowElement) => {
      const wall = wallMap.get(windowElement.wall_id);
      const vectors = wallVectors(wall);
      if (!vectors) {
        return "";
      }
      const widthM = Math.max(0.6, Number(windowElement.width_m || 1.2));
      const thicknessM = Math.max(
        0.12,
        Number(wall.thickness_m || (wall.exterior ? 0.3 : 0.14)),
      );
      const center = pointFrom(windowElement.position_m, {
        x: (vectors.start.x + vectors.end.x) / 2,
        y: (vectors.start.y + vectors.end.y) / 2,
      });
      const half = widthM / 2;
      const a = {
        x: center.x - vectors.dir.x * half,
        y: center.y - vectors.dir.y * half,
      };
      const b = {
        x: center.x + vectors.dir.x * half,
        y: center.y + vectors.dir.y * half,
      };
      const inset = thicknessM * 0.16;
      const a1 = project({
        x: a.x + vectors.normal.x * inset,
        y: a.y + vectors.normal.y * inset,
      });
      const b1 = project({
        x: b.x + vectors.normal.x * inset,
        y: b.y + vectors.normal.y * inset,
      });
      const a2 = project({
        x: a.x - vectors.normal.x * inset,
        y: a.y - vectors.normal.y * inset,
      });
      const b2 = project({
        x: b.x - vectors.normal.x * inset,
        y: b.y - vectors.normal.y * inset,
      });
      const gapA = project(a);
      const gapB = project(b);
      const gapWidth = Math.max(6, thicknessM * scale + 2);

      return `
        <g class="plan-window" data-window-id="${escapeXml(windowElement.id || "")}">
          <line x1="${formatNumber(gapA.x)}" y1="${formatNumber(gapA.y)}" x2="${formatNumber(
            gapB.x,
          )}" y2="${formatNumber(gapB.y)}" stroke="${theme.paper}" stroke-width="${formatNumber(
            gapWidth,
          )}" stroke-linecap="square"/>
          <line x1="${formatNumber(a1.x)}" y1="${formatNumber(a1.y)}" x2="${formatNumber(
            a2.x,
          )}" y2="${formatNumber(a2.y)}" stroke="${theme.guide}" stroke-width="0.95"/>
          <line x1="${formatNumber(b1.x)}" y1="${formatNumber(b1.y)}" x2="${formatNumber(
            b2.x,
          )}" y2="${formatNumber(b2.y)}" stroke="${theme.guide}" stroke-width="0.95"/>
          <line x1="${formatNumber(a1.x)}" y1="${formatNumber(a1.y)}" x2="${formatNumber(
            b1.x,
          )}" y2="${formatNumber(b1.y)}" stroke="${theme.lineMuted}" stroke-width="1.2"/>
          <line x1="${formatNumber(a2.x)}" y1="${formatNumber(a2.y)}" x2="${formatNumber(
            b2.x,
          )}" y2="${formatNumber(b2.y)}" stroke="${theme.lineMuted}" stroke-width="1.2"/>
          <line x1="${formatNumber((a1.x + a2.x) / 2)}" y1="${formatNumber(
            (a1.y + a2.y) / 2,
          )}" x2="${formatNumber((b1.x + b2.x) / 2)}" y2="${formatNumber(
            (b1.y + b2.y) / 2,
          )}" stroke="${theme.lineLight}" stroke-width="0.8"/>
        </g>
      `;
    })
    .join("");
}

function renderDoorMarkup(
  doors = [],
  wallMap = new Map(),
  project,
  scale,
  theme,
) {
  return sortByStableKey(
    doors,
    (entry) =>
      `${entry.wall_id || ""}:${entry.position_m?.x || 0}:${entry.position_m?.y || 0}:${entry.id || ""}`,
  )
    .map((door) => {
      const wall = wallMap.get(door.wall_id);
      const vectors = wallVectors(wall);
      if (!vectors) {
        return "";
      }

      const widthM = Math.max(0.75, Number(door.width_m || 0.9));
      const thicknessM = Math.max(
        0.12,
        Number(wall.thickness_m || (wall.exterior ? 0.3 : 0.14)),
      );
      const center = pointFrom(door.position_m, {
        x: (vectors.start.x + vectors.end.x) / 2,
        y: (vectors.start.y + vectors.end.y) / 2,
      });
      const half = widthM / 2;
      const start = {
        x: center.x - vectors.dir.x * half,
        y: center.y - vectors.dir.y * half,
      };
      const end = {
        x: center.x + vectors.dir.x * half,
        y: center.y + vectors.dir.y * half,
      };
      const hingeLeft = String(door.metadata?.swing || door.swing || "")
        .toLowerCase()
        .includes("right")
        ? false
        : String(door.metadata?.swing || door.swing || "")
              .toLowerCase()
              .includes("left")
          ? true
          : stableParity(door.id || `${center.x}:${center.y}`);
      const inward =
        String(door.metadata?.swing || door.swing || "")
          .toLowerCase()
          .includes("out") === true
          ? false
          : true;
      const interiorNormal = resolveInteriorNormal(wall, vectors);
      const swingVector = {
        x: interiorNormal.x * (inward ? 1 : -1),
        y: interiorNormal.y * (inward ? 1 : -1),
      };
      const hingePoint = hingeLeft ? start : end;
      const closedEnd = hingeLeft ? end : start;
      const openEnd = {
        x: hingePoint.x + swingVector.x * widthM,
        y: hingePoint.y + swingVector.y * widthM,
      };
      const hingePx = project(hingePoint);
      const closedPx = project(closedEnd);
      const openPx = project(openEnd);
      const gapStart = project(start);
      const gapEnd = project(end);
      const radiusPx = Math.max(10, widthM * scale);
      const gapWidth = Math.max(6, thicknessM * scale + 2.5);
      const closedVector = {
        x: closedPx.x - hingePx.x,
        y: closedPx.y - hingePx.y,
      };
      const openVector = {
        x: openPx.x - hingePx.x,
        y: openPx.y - hingePx.y,
      };
      const sweepFlag =
        closedVector.x * openVector.y - closedVector.y * openVector.x >= 0
          ? 1
          : 0;

      return `
        <g class="plan-door" data-door-id="${escapeXml(door.id || "")}">
          <line x1="${formatNumber(gapStart.x)}" y1="${formatNumber(
            gapStart.y,
          )}" x2="${formatNumber(gapEnd.x)}" y2="${formatNumber(
            gapEnd.y,
          )}" stroke="${theme.paper}" stroke-width="${formatNumber(
            gapWidth,
          )}" stroke-linecap="square"/>
          <line x1="${formatNumber(hingePx.x)}" y1="${formatNumber(
            hingePx.y,
          )}" x2="${formatNumber(closedPx.x)}" y2="${formatNumber(
            closedPx.y,
          )}" stroke="${theme.guide}" stroke-width="0.85"/>
          <line x1="${formatNumber(hingePx.x)}" y1="${formatNumber(
            hingePx.y,
          )}" x2="${formatNumber(openPx.x)}" y2="${formatNumber(
            openPx.y,
          )}" stroke="${theme.line}" stroke-width="1.55"/>
          <path d="M ${formatNumber(closedPx.x)} ${formatNumber(
            closedPx.y,
          )} A ${formatNumber(radiusPx)} ${formatNumber(
            radiusPx,
          )} 0 0 ${sweepFlag} ${formatNumber(openPx.x)} ${formatNumber(
            openPx.y,
          )}" fill="none" stroke="${theme.lineMuted}" stroke-width="1.15"/>
          <circle cx="${formatNumber(hingePx.x)}" cy="${formatNumber(
            hingePx.y,
          )}" r="1.8" fill="${theme.line}"/>
        </g>
      `;
    })
    .join("");
}

function renderStairMarkup(stairs = [], project, theme) {
  return sortByStableKey(stairs)
    .map((stair) => {
      const bbox = stair.bbox || {};
      const min = pointFrom({
        x: bbox.min_x,
        y: bbox.min_y,
      });
      const max = pointFrom({
        x: bbox.max_x,
        y: bbox.max_y,
      });
      if (!(max.x > min.x && max.y > min.y)) {
        return "";
      }
      const topLeft = project({ x: min.x, y: min.y });
      const topRight = project({ x: max.x, y: min.y });
      const bottomLeft = project({ x: min.x, y: max.y });
      const width = bottomLeft.x
        ? topRight.x - topLeft.x
        : topRight.x - topLeft.x;
      const height = bottomLeft.y - topLeft.y;
      const verticalRun = height >= width;
      const treadCount = Math.max(
        6,
        Math.round((verticalRun ? height : width) / 18),
      );
      const treads = Array.from({ length: treadCount }, (_, index) => {
        const ratio = (index + 1) / (treadCount + 1);
        if (verticalRun) {
          const y = topLeft.y + height * ratio;
          return `<line x1="${formatNumber(topLeft.x + 4)}" y1="${formatNumber(
            y,
          )}" x2="${formatNumber(topRight.x - 4)}" y2="${formatNumber(
            y,
          )}" stroke="${theme.lineLight}" stroke-width="0.9"/>`;
        }
        const x = topLeft.x + width * ratio;
        return `<line x1="${formatNumber(x)}" y1="${formatNumber(
          topLeft.y + 4,
        )}" x2="${formatNumber(x)}" y2="${formatNumber(
          bottomLeft.y - 4,
        )}" stroke="${theme.lineLight}" stroke-width="0.9"/>`;
      }).join("");

      const arrowStart = verticalRun
        ? {
            x: (topLeft.x + topRight.x) / 2,
            y: bottomLeft.y - 16,
          }
        : {
            x: topLeft.x + 16,
            y: (topLeft.y + bottomLeft.y) / 2,
          };
      const arrowEnd = verticalRun
        ? {
            x: arrowStart.x,
            y: topLeft.y + 18,
          }
        : {
            x: topRight.x - 18,
            y: arrowStart.y,
          };
      const arrowHead = verticalRun
        ? `M ${formatNumber(arrowEnd.x)} ${formatNumber(
            arrowEnd.y - 6,
          )} L ${formatNumber(arrowEnd.x - 4)} ${formatNumber(
            arrowEnd.y + 2,
          )} L ${formatNumber(arrowEnd.x + 4)} ${formatNumber(
            arrowEnd.y + 2,
          )} Z`
        : `M ${formatNumber(arrowEnd.x + 6)} ${formatNumber(
            arrowEnd.y,
          )} L ${formatNumber(arrowEnd.x - 2)} ${formatNumber(
            arrowEnd.y - 4,
          )} L ${formatNumber(arrowEnd.x - 2)} ${formatNumber(
            arrowEnd.y + 4,
          )} Z`;

      return `
        <g class="plan-stair" data-stair-id="${escapeXml(stair.id || "")}">
          <rect x="${formatNumber(topLeft.x)}" y="${formatNumber(
            topLeft.y,
          )}" width="${formatNumber(topRight.x - topLeft.x)}" height="${formatNumber(
            bottomLeft.y - topLeft.y,
          )}" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.45"/>
          ${treads}
          <line x1="${formatNumber(topLeft.x + 6)}" y1="${formatNumber(
            topLeft.y + 6,
          )}" x2="${formatNumber(topRight.x - 6)}" y2="${formatNumber(
            topLeft.y + 6,
          )}" stroke="${theme.guide}" stroke-width="0.85" stroke-dasharray="4 3"/>
          <line x1="${formatNumber(arrowStart.x)}" y1="${formatNumber(
            arrowStart.y,
          )}" x2="${formatNumber(arrowEnd.x)}" y2="${formatNumber(
            arrowEnd.y,
          )}" stroke="${theme.line}" stroke-width="1.35"/>
          <path d="${arrowHead}" fill="${theme.line}"/>
          <text x="${formatNumber(
            (topLeft.x + topRight.x) / 2,
          )}" y="${formatNumber(bottomLeft.y - 6)}" font-size="10" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">UP</text>
        </g>
      `;
    })
    .join("");
}

function renderCirculationMarkup(paths = [], project, theme) {
  return sortByStableKey(paths)
    .map((path) => {
      const polyline = Array.isArray(path.polyline) ? path.polyline : [];
      if (polyline.length < 2) {
        return "";
      }
      const points = polyline
        .map((point) => {
          const projected = project(point);
          return `${formatNumber(projected.x)},${formatNumber(projected.y)}`;
        })
        .join(" ");
      return `<polyline points="${points}" fill="none" stroke="${theme.guide}" stroke-width="1" stroke-dasharray="8 5"/>`;
    })
    .join("");
}

function renderNorthArrow(
  width,
  layout,
  theme,
  northRotationDeg = 0,
  typo = IDENTITY_TYPOGRAPHY,
) {
  const x = width - layout.right + 24;
  const y = layout.top - 10;
  const stroke = scaleSize(2, typo.strokeScale);
  const fontSize = scaleSize(11, typo.fontScale);
  const tail = scaleSize(26, typo.fontScale);
  const head = scaleSize(9, typo.fontScale);
  const wing = scaleSize(6, typo.fontScale);
  const flick = scaleSize(4, typo.fontScale);
  const labelOffset = scaleSize(15, typo.fontScale);
  return `
    <g id="north-arrow" transform="translate(${formatNumber(x)} ${formatNumber(
      y,
    )}) rotate(${formatNumber(northRotationDeg, 0)})">
      <line x1="0" y1="${formatNumber(tail)}" x2="0" y2="0" stroke="${theme.line}" stroke-width="${stroke}"/>
      <path d="M 0 ${formatNumber(-head)} L ${formatNumber(-wing)} ${formatNumber(flick)} L ${formatNumber(wing)} ${formatNumber(flick)} Z" fill="${theme.line}"/>
      <text x="0" y="${formatNumber(-labelOffset)}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">N</text>
    </g>
  `;
}

function renderExternalDimensions(
  bounds,
  project,
  layout,
  width,
  height,
  theme,
  typo = IDENTITY_TYPOGRAPHY,
) {
  if (!bounds?.width || !bounds?.height) {
    return "";
  }

  const topLeft = project({ x: bounds.min_x, y: bounds.min_y });
  const topRight = project({ x: bounds.max_x, y: bounds.min_y });
  const bottomLeft = project({ x: bounds.min_x, y: bounds.max_y });
  const bottomRight = project({ x: bounds.max_x, y: bounds.max_y });
  const topY = layout.top - 16;
  const rightX = width - layout.right + 22;
  const bottomY = height - layout.bottom + 18;
  const leftX = layout.left - 22;
  const fontSize = scaleSize(10, typo.fontScale);
  const fontOffset = scaleSize(6, typo.fontScale);
  const tick = scaleSize(3, typo.strokeScale);
  const witness = scaleSize(0.9, typo.strokeScale);
  const dim = scaleSize(1.1, typo.strokeScale);
  const widthText = escapeXml(formatMeters(bounds.width));
  const heightText = escapeXml(formatMeters(bounds.height));

  const drawHorizontal = (
    lineY,
    leftX2,
    rightX2,
    leftRefY,
    rightRefY,
    text,
  ) => `
      <line x1="${formatNumber(leftX2)}" y1="${formatNumber(
        leftRefY,
      )}" x2="${formatNumber(leftX2)}" y2="${formatNumber(
        lineY,
      )}" stroke="${theme.lineMuted}" stroke-width="${witness}"/>
      <line x1="${formatNumber(rightX2)}" y1="${formatNumber(
        rightRefY,
      )}" x2="${formatNumber(rightX2)}" y2="${formatNumber(
        lineY,
      )}" stroke="${theme.lineMuted}" stroke-width="${witness}"/>
      <line x1="${formatNumber(leftX2)}" y1="${formatNumber(
        lineY,
      )}" x2="${formatNumber(rightX2)}" y2="${formatNumber(
        lineY,
      )}" stroke="${theme.line}" stroke-width="${dim}"/>
      <line x1="${formatNumber(leftX2)}" y1="${formatNumber(
        lineY - tick,
      )}" x2="${formatNumber(leftX2)}" y2="${formatNumber(
        lineY + tick,
      )}" stroke="${theme.line}" stroke-width="${dim}"/>
      <line x1="${formatNumber(rightX2)}" y1="${formatNumber(
        lineY - tick,
      )}" x2="${formatNumber(rightX2)}" y2="${formatNumber(
        lineY + tick,
      )}" stroke="${theme.line}" stroke-width="${dim}"/>
      <text x="${formatNumber((leftX2 + rightX2) / 2)}" y="${formatNumber(
        lineY - fontOffset,
      )}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${text}</text>`;

  const drawVertical = (
    lineX,
    topY2,
    bottomY2,
    topRefX,
    bottomRefX,
    labelOffsetSign,
    text,
  ) => {
    const labelX = lineX + labelOffsetSign * scaleSize(14, typo.fontScale);
    const midY = (topY2 + bottomY2) / 2;
    return `
      <line x1="${formatNumber(topRefX)}" y1="${formatNumber(
        topY2,
      )}" x2="${formatNumber(lineX)}" y2="${formatNumber(
        topY2,
      )}" stroke="${theme.lineMuted}" stroke-width="${witness}"/>
      <line x1="${formatNumber(bottomRefX)}" y1="${formatNumber(
        bottomY2,
      )}" x2="${formatNumber(lineX)}" y2="${formatNumber(
        bottomY2,
      )}" stroke="${theme.lineMuted}" stroke-width="${witness}"/>
      <line x1="${formatNumber(lineX)}" y1="${formatNumber(
        topY2,
      )}" x2="${formatNumber(lineX)}" y2="${formatNumber(
        bottomY2,
      )}" stroke="${theme.line}" stroke-width="${dim}"/>
      <line x1="${formatNumber(lineX - tick)}" y1="${formatNumber(
        topY2,
      )}" x2="${formatNumber(lineX + tick)}" y2="${formatNumber(
        topY2,
      )}" stroke="${theme.line}" stroke-width="${dim}"/>
      <line x1="${formatNumber(lineX - tick)}" y1="${formatNumber(
        bottomY2,
      )}" x2="${formatNumber(lineX + tick)}" y2="${formatNumber(
        bottomY2,
      )}" stroke="${theme.line}" stroke-width="${dim}"/>
      <text x="${formatNumber(labelX)}" y="${formatNumber(
        midY,
      )}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" transform="rotate(${labelOffsetSign > 0 ? 90 : -90} ${formatNumber(
        labelX,
      )} ${formatNumber(midY)})" text-anchor="middle">${text}</text>`;
  };

  return `
    <g id="external-dimensions">
      ${drawHorizontal(topY, topLeft.x, topRight.x, topLeft.y, topRight.y, widthText)}
      ${drawVertical(rightX, topRight.y, bottomRight.y, topRight.x, bottomRight.x, 1, heightText)}
      ${drawHorizontal(bottomY, bottomLeft.x, bottomRight.x, bottomLeft.y, bottomRight.y, widthText)}
      ${drawVertical(leftX, topLeft.y, bottomLeft.y, topLeft.x, bottomLeft.x, -1, heightText)}
    </g>
  `;
}

function renderScaleBar(
  scalePxPerMeter,
  width,
  height,
  layout,
  theme,
  options = {},
  typo = IDENTITY_TYPOGRAPHY,
) {
  const barMeters = chooseScaleBarMeters(scalePxPerMeter);
  const barWidthPx = barMeters * scalePxPerMeter;
  const x = width - layout.right - barWidthPx - 8;
  const y = Number.isFinite(options.y)
    ? options.y
    : height - layout.bottom + 44;
  const midX = x + barWidthPx / 2;
  const labelYOffset = Number.isFinite(options.labelYOffset)
    ? scaleSize(options.labelYOffset, typo.fontScale)
    : scaleSize(16, typo.fontScale);
  const labelFontSize = scaleSize(
    Number.isFinite(options.fontSize) ? options.fontSize : 10,
    typo.fontScale,
  );
  const tickHalf = scaleSize(4, typo.strokeScale);
  const stroke = scaleSize(1.6, typo.strokeScale);

  return {
    markup: `
      <g id="blueprint-scale-bar">
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y,
        )}" stroke="${theme.line}" stroke-width="${stroke}"/>
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y - tickHalf,
        )}" x2="${formatNumber(x)}" y2="${formatNumber(
          y + tickHalf,
        )}" stroke="${theme.line}" stroke-width="${stroke}"/>
        <line x1="${formatNumber(midX)}" y1="${formatNumber(
          y - tickHalf,
        )}" x2="${formatNumber(midX)}" y2="${formatNumber(
          y + tickHalf,
        )}" stroke="${theme.line}" stroke-width="${stroke}"/>
        <line x1="${formatNumber(x + barWidthPx)}" y1="${formatNumber(
          y - tickHalf,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y + tickHalf,
        )}" stroke="${theme.line}" stroke-width="${stroke}"/>
        <text x="${formatNumber(midX)}" y="${formatNumber(
          y + labelYOffset,
        )}" font-size="${labelFontSize}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(
          `${barMeters} m`,
        )}</text>
      </g>
    `,
    barMeters,
  };
}

function renderTitleBlock(
  level,
  width,
  height,
  layout,
  theme,
  metadata = {},
  typo = IDENTITY_TYPOGRAPHY,
) {
  const x = layout.left;
  const y = height - layout.bottom + 16;
  const occupancyText = `${Math.round(
    Number(metadata.slotOccupancyRatio || 0) * 100,
  )}% slot occupancy`;
  const titleSize = scaleSize(14, typo.fontScale);
  const subSize = scaleSize(10, typo.fontScale);
  const blockWidth = scaleSize(318, typo.fontScale);
  const blockHeight = scaleSize(46, typo.fontScale);
  const stroke = scaleSize(1.1, typo.strokeScale);
  const padX = scaleSize(12, typo.fontScale);
  const titleY = scaleSize(17, typo.fontScale);
  const subY = scaleSize(34, typo.fontScale);

  return `
    <g id="title-block">
      <rect x="${formatNumber(x)}" y="${formatNumber(
        y,
      )}" width="${formatNumber(blockWidth)}" height="${formatNumber(
        blockHeight,
      )}" fill="${theme.paper}" stroke="${theme.line}" stroke-width="${stroke}"/>
      <text x="${formatNumber(x + padX)}" y="${formatNumber(
        y + titleY,
      )}" font-size="${titleSize}" font-family="Arial, sans-serif" font-weight="700" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        `${level.name || "Plan"} PLAN`,
      )}</text>
      <text x="${formatNumber(x + padX)}" y="${formatNumber(
        y + subY,
      )}" font-size="${subSize}" font-family="Arial, sans-serif" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        `Bounds ${metadata.boundsSource || "building_derived"} · ${occupancyText}`,
      )}</text>
    </g>
  `;
}

export function renderPlanSvg(geometryInput = {}, options = {}) {
  const rawGeometry = resolveCompiledProjectGeometryInput(geometryInput);
  const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
  const theme = getBlueprintTheme();
  const level = findLevel(geometry, options);

  if (!level) {
    throw new Error("No level data available for plan rendering");
  }

  const width = options.width || 1200;
  const height = options.height || 900;
  const sheetMode = options.sheetMode === true;
  const typo = getSheetTypography(sheetMode);
  const showInternalTitleBlock =
    !sheetMode || options.showInternalTitleBlock === true;
  const includeSiteContext = options.includeSiteContext === true && !sheetMode;
  const layout = sheetMode
    ? { left: 20, top: 22, right: 28, bottom: 62 }
    : { left: 46, top: 56, right: 88, bottom: 118 };
  const { bounds, source: boundsSource } = getLevelDrawingBoundsWithSource(
    geometry,
    level.id,
  );
  const transform = buildTransform(bounds, width, height, layout);
  const project = transform.project;
  const levelRooms = sortByStableKey(
    (geometry.rooms || []).filter((room) => room.level_id === level.id),
    (room) => `${room.id || ""}:${room.name || ""}`,
  );
  const levelWalls = sortByStableKey(
    (geometry.walls || []).filter((wall) => wall.level_id === level.id),
    (wall) => `${wall.exterior ? "0" : "1"}:${wall.id || ""}`,
  );
  const wallMap = new Map(levelWalls.map((wall) => [wall.id, wall]));
  const footprint = (geometry.footprints || []).find(
    (entry) => entry.id === level.footprint_id || entry.level_id === level.id,
  );
  const geometrySummary = summarizePlanGeometry(
    levelRooms,
    levelWalls,
    Array.isArray(footprint?.polygon) && footprint.polygon.length >= 3,
  );

  if (
    isFeatureEnabled("usePlanRendererUpgradePhase8") &&
    !geometrySummary.strongEnough
  ) {
    return {
      svg: null,
      level_id: level.id,
      room_count: levelRooms.length,
      stair_count: 0,
      renderer: "deterministic-plan-svg",
      title: level.name || "Plan",
      status: "blocked",
      blocking_reasons: [
        `Plan geometry for ${level.name || level.id || "level"} is incomplete: ${geometrySummary.totalRooms} rooms, ${geometrySummary.boundedRooms} bounded rooms, completeness ${geometrySummary.completeness}.`,
      ],
      technical_quality_metadata: {
        drawing_type: "plan",
        room_count: levelRooms.length,
        geometry_complete: false,
        geometry_completeness: geometrySummary.completeness,
        room_label_count: 0,
        area_label_count: 0,
        blueprint_theme: theme.name,
        bounds_source: boundsSource,
      },
    };
  }

  const slotOccupancyRatio = Number(
    clamp(
      (bounds.width * transform.scale * (bounds.height * transform.scale)) /
        Math.max(transform.availableWidth * transform.availableHeight, 1),
      0,
      1,
    ).toFixed(3),
  );

  const roomFillStroke = scaleSize(0.9, typo.strokeScale);
  const roomFillMarkup = levelRooms
    .map((room) => {
      const path = polygonPath(roomPolygon(room), project);
      if (!path) {
        return "";
      }
      return `
        <path d="${path}" fill="${theme.paper}" stroke="${theme.lineLight}" stroke-width="${roomFillStroke}"/>
      `;
    })
    .join("");
  const roomLabelMarkup = options.hideRoomLabels
    ? ""
    : levelRooms
        .map((room, index) =>
          renderRoomLabel(
            room,
            project,
            theme,
            typo,
            `R${String(index + 1).padStart(2, "0")}`,
          ),
        )
        .join("");
  const wallMarkup = renderWallMarkup(levelWalls, project, theme, typo);
  const doorEntries = (geometry.doors || []).filter(
    (door) => door.level_id === level.id,
  );
  const windowEntries = (geometry.windows || []).filter(
    (windowElement) => windowElement.level_id === level.id,
  );
  const stairEntries = (geometry.stairs || []).filter(
    (stair) => stair.level_id === level.id,
  );
  const circulationEntries = (geometry.circulation || []).filter(
    (path) => path.level_id === level.id,
  );
  const stairMarkup = renderStairMarkup(stairEntries, project, theme);
  const circulationMarkup = renderCirculationMarkup(
    circulationEntries,
    project,
    theme,
  );
  const doorMarkup = renderDoorMarkup(
    doorEntries,
    wallMap,
    project,
    transform.scale,
    theme,
  );
  const windowMarkup = renderWindowMarkup(
    windowEntries,
    wallMap,
    project,
    transform.scale,
    theme,
  );
  const footprintPath = polygonPath(footprint?.polygon || [], project);
  const siteOutline = includeSiteContext
    ? polygonPath(geometry.site?.boundary_polygon || [], project)
    : "";
  const buildableOutline = includeSiteContext
    ? polygonPath(geometry.site?.buildable_polygon || [], project)
    : "";
  const dimensionMarkup = renderExternalDimensions(
    bounds,
    project,
    layout,
    width,
    height,
    theme,
    typo,
  );
  const scaleBar = renderScaleBar(
    transform.scale,
    width,
    height,
    layout,
    theme,
    showInternalTitleBlock
      ? {}
      : { y: height - 34, labelYOffset: 14, fontSize: 9 },
    typo,
  );
  const titleBlock = showInternalTitleBlock
    ? renderTitleBlock(
        level,
        width,
        height,
        layout,
        theme,
        {
          slotOccupancyRatio,
          boundsSource,
        },
        typo,
      )
    : "";
  const furnitureHints = renderFurnitureHints(levelRooms, project, theme);
  const doorCount = doorEntries.length;
  const windowCount = windowEntries.length;
  const stairCount = stairEntries.length;
  const circulationPathCount = circulationEntries.length;
  const roomDensityScore = clamp(
    levelRooms.length * 0.16 +
      doorCount * 0.05 +
      windowCount * 0.05 +
      stairCount * 0.08 +
      (geometrySummary.completeness || 0) * 0.4,
    0,
    1,
  );

  const siteStroke = scaleSize(1, typo.strokeScale);
  const buildableStroke = scaleSize(1, typo.strokeScale);
  const footprintStroke = scaleSize(1.1, typo.strokeScale);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-theme="${theme.name}" data-bounds-source="${boundsSource}">
  <rect width="${width}" height="${height}" fill="${theme.paper}"/>
  ${
    siteOutline
      ? `<path d="${siteOutline}" fill="none" stroke="${theme.guide}" stroke-width="${siteStroke}" stroke-dasharray="8 5"/>`
      : ""
  }
  ${
    buildableOutline
      ? `<path d="${buildableOutline}" fill="none" stroke="${theme.lineLight}" stroke-width="${buildableStroke}" stroke-dasharray="4 4"/>`
      : ""
  }
  ${footprintPath ? `<path d="${footprintPath}" fill="none" stroke="${theme.lineMuted}" stroke-width="${footprintStroke}"/>` : ""}
  ${roomFillMarkup}
  ${furnitureHints.markup}
  <g id="plan-walls">${wallMarkup}</g>
  <g id="plan-openings">${windowMarkup}${doorMarkup}</g>
  ${circulationMarkup ? `<g id="plan-circulation">${circulationMarkup}</g>` : ""}
  ${stairMarkup ? `<g id="plan-stairs">${stairMarkup}</g>` : ""}
  ${roomLabelMarkup ? `<g id="plan-room-labels">${roomLabelMarkup}</g>` : ""}
  ${dimensionMarkup}
  ${!sheetMode ? renderNorthArrow(width, layout, theme, geometry.site?.north_orientation_deg || 0, typo) : ""}
  ${titleBlock}
  ${scaleBar.markup}
  ${options.overlayMarkup || ""}
</svg>`;

  return {
    svg,
    level_id: level.id,
    room_count: levelRooms.length,
    stair_count: stairCount,
    renderer: "deterministic-plan-svg",
    title: level.name || "Plan",
    technical_quality_metadata: {
      drawing_type: "plan",
      sheet_mode: sheetMode,
      wall_count: levelWalls.length,
      door_count: doorCount,
      window_count: windowCount,
      stair_count: stairCount,
      circulation_path_count: circulationPathCount,
      room_count: levelRooms.length,
      geometry_complete: geometrySummary.strongEnough,
      geometry_completeness: geometrySummary.completeness,
      room_label_count: options.hideRoomLabels ? 0 : levelRooms.length,
      area_label_count: options.hideRoomLabels ? 0 : levelRooms.length,
      has_north_arrow: !sheetMode,
      has_title_block: showInternalTitleBlock,
      has_legend: false,
      has_external_dimensions: true,
      has_scale_bar: true,
      furniture_hint_count: furnitureHints.count,
      door_swing_count: doorCount,
      plan_density_score: Number(roomDensityScore.toFixed(3)),
      bounds_source: boundsSource,
      blueprint_theme: theme.name,
      slot_occupancy_ratio: slotOccupancyRatio,
      sheet_occupancy_quality: slotOccupancyRatio >= 0.55 ? "strong" : "weak",
      scale_bar_meters: scaleBar.barMeters,
      line_hierarchy: {
        exterior_wall: 2.05,
        interior_wall: 1.28,
        room_outline: 0.9,
        opening_line: 1.2,
        furniture_hint: 0.95,
        dimensions: 1.1,
      },
    },
  };
}

export default {
  renderPlanSvg,
};
