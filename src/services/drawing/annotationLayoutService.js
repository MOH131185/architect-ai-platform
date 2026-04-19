import { resolveRenderableText } from "./textFallbackService.js";

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function overlap(left = {}, right = {}) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function resolvePlanAnchor(room = {}) {
  if (room.centroid?.x !== undefined && room.centroid?.y !== undefined) {
    return room.centroid;
  }
  return {
    x: (Number(room.bbox?.min_x || 0) + Number(room.bbox?.max_x || 0)) / 2,
    y: (Number(room.bbox?.min_y || 0) + Number(room.bbox?.max_y || 0)) / 2,
  };
}

function uppercaseLabel(value = "", fallback = "ROOM") {
  const text = String(value || fallback)
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return (text || fallback).toUpperCase();
}

function buildPlacement({
  id,
  text,
  x,
  y,
  fontSize = 12,
  placementMode = "ideal",
}) {
  const width = Math.max(
    70,
    Math.ceil(String(text || "").length * fontSize * 0.58),
  );
  const height = Math.max(20, Math.ceil(fontSize * 2.1));
  return {
    id,
    text,
    x,
    y,
    fontSize,
    box: {
      x: x - width / 2,
      y: y - height / 2,
      width,
      height,
    },
    placementMode,
  };
}

function choosePlacement(candidate = {}, occupied = []) {
  const shifts = [
    [0, 0, "ideal"],
    [0, -18, "offset-up"],
    [0, 18, "offset-down"],
    [24, 0, "offset-right"],
    [-24, 0, "offset-left"],
    [24, -18, "offset-right-up"],
    [-24, 18, "offset-left-down"],
    [-24, -18, "offset-left-up"],
    [24, 18, "offset-right-down"],
    [0, -34, "offset-up-deep"],
    [0, 34, "offset-down-deep"],
    [36, 0, "offset-right-wide"],
    [-36, 0, "offset-left-wide"],
  ];

  for (const [dx, dy, placementMode] of shifts) {
    const placed = buildPlacement({
      ...candidate,
      x: candidate.x + dx,
      y: candidate.y + dy,
      placementMode,
    });
    if (!occupied.some((entry) => overlap(entry.box, placed.box))) {
      return placed;
    }
  }

  return buildPlacement({
    ...candidate,
    placementMode: "fallback-overlap",
  });
}

function layoutPlanAnnotations(
  projectGeometry = {},
  levelId = null,
  project = null,
) {
  const rooms = (projectGeometry.rooms || [])
    .filter((room) => !levelId || room.level_id === levelId)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const occupied = [];
  const warnings = [];
  const placements = rooms.map((room) => {
    const label = resolveRenderableText(room.name, room.id || "Room");
    warnings.push(...label.warnings);
    const anchor = project(resolvePlanAnchor(room));
    const labelText = uppercaseLabel(label.text, room.id || "ROOM");
    const areaValue = Number(room.actual_area || room.target_area_m2 || 0);
    const compactRoom =
      Number(room.bbox?.width || room.width_m || 0) < 2.2 ||
      Number(room.bbox?.height || room.depth_m || 0) < 2.2;
    const placement = choosePlacement(
      {
        id: `annotation:room:${room.id}`,
        text: `${labelText} ${areaValue.toFixed(1)} M2`,
        x: anchor.x,
        y: anchor.y,
        fontSize: compactRoom ? 11.25 : 12.5,
      },
      occupied,
    );
    occupied.push(placement);
    return placement;
  });

  return {
    placements,
    warnings: unique(warnings),
  };
}

function layoutElevationAnnotations(drawing = {}) {
  const title = resolveRenderableText(drawing.title, "Elevation");
  return {
    placements: [
      buildPlacement({
        id: `annotation:elevation:title:${drawing.orientation || "default"}`,
        text: title.text,
        x: 160,
        y: 28,
        fontSize: 11.5,
      }),
    ],
    warnings: unique(title.warnings),
  };
}

function layoutSectionAnnotations(
  projectGeometry = {},
  sectionProfile = {},
  drawing = {},
  project = null,
) {
  const focusEntities = sectionProfile.focusEntityIds || [];
  const placements = [];
  const warnings = [];

  (projectGeometry.stairs || [])
    .filter(
      (stair) =>
        focusEntities.length === 0 ||
        focusEntities.includes(`entity:stair:${stair.id}`),
    )
    .slice(0, 1)
    .forEach((stair) => {
      const label = resolveRenderableText(stair.name, "Stair");
      warnings.push(...label.warnings);
      const bbox = stair.bbox || {};
      const anchor = project({
        x: (Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2,
        y: Number(bbox.min_y || 0),
      });
      placements.push(
        buildPlacement({
          id: `annotation:section:stair:${stair.id}`,
          text: `${label.text} focus`,
          x: anchor.x,
          y: Math.max(50, anchor.y - 24),
          fontSize: 11,
        }),
      );
    });

  const title = resolveRenderableText(
    drawing.title || sectionProfile.title,
    "Section",
  );
  warnings.push(...title.warnings);
  placements.push(
    buildPlacement({
      id: `annotation:section:title:${
        sectionProfile.id || drawing.section_type || "section"
      }`,
      text: title.text,
      x: 180,
      y: 28,
      fontSize: 11.5,
    }),
  );

  return {
    placements,
    warnings: unique(warnings),
  };
}

export function layoutAnnotations({
  drawingType = "plan",
  projectGeometry = {},
  levelId = null,
  drawing = {},
  sectionProfile = null,
  project = (point) => point,
} = {}) {
  if (drawingType === "plan") {
    return layoutPlanAnnotations(projectGeometry, levelId, project);
  }
  if (drawingType === "elevation") {
    return layoutElevationAnnotations(drawing);
  }
  if (drawingType === "section") {
    return layoutSectionAnnotations(
      projectGeometry,
      sectionProfile || {},
      drawing,
      project,
    );
  }
  return {
    placements: [],
    warnings: [],
  };
}

export default {
  layoutAnnotations,
};
