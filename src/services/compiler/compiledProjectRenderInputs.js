import {
  buildBoundingBoxFromPolygon,
  normalizePolygon,
  rectangleToPolygon,
} from "../cad/projectGeometrySchema.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";

const EXTERIOR_VIEW_SPECS = {
  hero_3d: {
    panelType: "hero_3d",
    width: 1600,
    height: 1100,
    padding: 120,
    yawDeg: -34,
    pitchDeg: 28,
    perspective: true,
    visibleSides: ["south", "east"],
    title: "Compiled Hero 3D Control",
    renderKind: "compiled_exterior_oblique",
    theme: {
      background: "#f6f3ee",
      ground: "#e6dfd3",
      primaryWall: "#d5c6b2",
      secondaryWall: "#bda98f",
      roofPrimary: "#8c7764",
      roofSecondary: "#73604e",
      glass: "#dfe8ef",
      door: "#7d6148",
      stroke: "#342b25",
      ridge: "#2b241e",
    },
  },
  exterior_render: {
    panelType: "exterior_render",
    width: 1600,
    height: 1100,
    padding: 110,
    yawDeg: -10,
    pitchDeg: 14,
    perspective: true,
    visibleSides: ["south"],
    title: "Compiled Exterior Render Control",
    renderKind: "compiled_exterior_front",
    theme: {
      background: "#eef1f4",
      ground: "#d6cfc1",
      primaryWall: "#c8b89c",
      secondaryWall: "#a89077",
      roofPrimary: "#74604c",
      roofSecondary: "#5b4a3a",
      glass: "#cbd9e3",
      door: "#5c4631",
      stroke: "#1f1a14",
      ridge: "#181410",
    },
  },
  axonometric: {
    panelType: "axonometric",
    width: 1500,
    height: 1050,
    padding: 110,
    yawDeg: 38,
    pitchDeg: 34,
    perspective: false,
    visibleSides: ["south", "west"],
    title: "Compiled Axonometric Control",
    renderKind: "compiled_axonometric",
    theme: {
      background: "#ffffff",
      ground: "#f2f2f2",
      primaryWall: "#f5f5f5",
      secondaryWall: "#dddddd",
      roofPrimary: "#e7e7e7",
      roofSecondary: "#cfcfcf",
      glass: "#ffffff",
      door: "#cbcbcb",
      stroke: "#202020",
      ridge: "#111111",
    },
  },
};

const INTERIOR_VIEW_SPEC = {
  panelType: "interior_3d",
  width: 1400,
  height: 1024,
  padding: 100,
  yawDeg: -34,
  pitchDeg: 26,
  perspective: true,
  title: "Compiled Interior Control",
  renderKind: "compiled_interior_cutaway",
  theme: {
    background: "#f8f5ef",
    floor: "#eadfce",
    wallBack: "#f4efe6",
    wallSide: "#e4dacb",
    stair: "#d0c1ad",
    interiorWall: "#7f7060",
    opening: "#e6eef4",
    stroke: "#3a3028",
    cutLine: "#5e4d40",
  },
};

const REQUIRED_3D_VIEW_TYPES = Object.freeze([
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
]);
const MIN_COMPILED_CONTROL_PRIMITIVES = 5;
const PLACEHOLDER_RENDER_RE =
  /(?:placeholder|placeholder_3d|geometryRenderService|via\.placeholder|1x1)/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function svgToDataUrl(svgString) {
  if (!svgString || typeof svgString !== "string") return null;
  try {
    const encoded =
      typeof btoa === "function"
        ? btoa(unescape(encodeURIComponent(svgString)))
        : Buffer.from(svgString, "utf-8").toString("base64");
    return `data:image/svg+xml;base64,${encoded}`;
  } catch {
    return null;
  }
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePolygonLike(candidate) {
  const polygon = normalizePolygon(candidate);
  return polygon.length >= 3 ? polygon : [];
}

function resolveBBox(candidate = {}) {
  if (isPlainObject(candidate?.bbox)) {
    const bbox = candidate.bbox;
    const minX = Number(bbox.min_x ?? bbox.x ?? 0);
    const minY = Number(bbox.min_y ?? bbox.y ?? 0);
    const maxX = Number(bbox.max_x ?? minX + Number(bbox.width || 0));
    const maxY = Number(bbox.max_y ?? minY + Number(bbox.height || 0));
    return {
      min_x: minX,
      min_y: minY,
      max_x: maxX,
      max_y: maxY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  const polygon = [
    normalizePolygonLike(candidate?.polygon),
    normalizePolygonLike(candidate?.footprint?.polygon),
    normalizePolygonLike(candidate?.footprint),
  ].find((entry) => entry.length >= 3);

  if (polygon?.length) {
    return buildBoundingBoxFromPolygon(polygon);
  }

  const minX = Number(candidate.min_x ?? candidate.x ?? 0);
  const minY = Number(candidate.min_y ?? candidate.y ?? 0);
  const width = Number(candidate.width ?? 0);
  const height = Number(candidate.height ?? 0);
  return {
    min_x: minX,
    min_y: minY,
    max_x: Number(candidate.max_x ?? minX + width),
    max_y: Number(candidate.max_y ?? minY + height),
    width,
    height,
  };
}

function bboxToPolygon(bbox = {}) {
  return rectangleToPolygon(
    Number(bbox.min_x || 0),
    Number(bbox.min_y || 0),
    Number(bbox.width || 0),
    Number(bbox.height || 0),
  );
}

function resolvePrimaryFootprint(compiledProject = {}) {
  const candidates = [
    compiledProject.footprint?.polygon,
    compiledProject.levels?.[0]?.footprint?.polygon,
    compiledProject.levels?.[0]?.footprint,
    compiledProject.roof?.polygon,
    compiledProject.site?.buildable_polygon,
  ];
  const polygon = candidates
    .map((entry) => normalizePolygonLike(entry))
    .find((entry) => entry.length >= 3);
  if (polygon?.length) {
    return polygon;
  }
  const bbox = resolveBBox(
    compiledProject.footprint ||
      compiledProject.levels?.[0]?.footprint ||
      compiledProject.roof ||
      compiledProject.site?.buildable_bbox ||
      compiledProject.site?.boundary_bbox ||
      {},
  );
  return bbox.width > 0 || bbox.height > 0 ? bboxToPolygon(bbox) : [];
}

function resolveBaseHeight(compiledProject = {}) {
  const levelHeights = toArray(compiledProject.levels).map((level) => {
    if (Number.isFinite(Number(level.top_m))) {
      return Number(level.top_m);
    }
    const elevation = Number(level.elevation_m || level.bottom_m || 0);
    const height = Number(level.height_m || 0);
    return elevation + height;
  });
  const envelopeHeight = Number(compiledProject.envelope?.height_m || 0);
  const fallbackSum = toArray(compiledProject.levels).reduce(
    (sum, level) => sum + Number(level.height_m || 0),
    0,
  );
  return Math.max(envelopeHeight, fallbackSum, ...levelHeights, 3);
}

function resolveRoofKind(compiledProject = {}) {
  const roofType = String(compiledProject.roof?.type || "")
    .trim()
    .toLowerCase();
  if (roofType.includes("flat")) return "flat";
  if (roofType.includes("hip")) return "hip";
  if (roofType.includes("shed") || roofType.includes("mono")) return "shed";
  return "gable";
}

function resolveRoofAxis(compiledProject = {}, width = 0, depth = 0) {
  const ridge = toArray(compiledProject.roof?.ridges)[0];
  if (ridge?.start && ridge?.end) {
    const dx = Math.abs(Number(ridge.end.x || 0) - Number(ridge.start.x || 0));
    const dy = Math.abs(Number(ridge.end.y || 0) - Number(ridge.start.y || 0));
    return dx >= dy ? "x" : "y";
  }
  return width >= depth ? "x" : "y";
}

function resolveRoofRise(compiledProject = {}, width = 0, depth = 0) {
  const explicitRise = Math.max(
    0,
    ...toArray(compiledProject.roof?.ridges).map((ridge) =>
      Number(ridge.ridge_height_m || 0),
    ),
  );
  const slopeDeg = Math.max(
    0,
    ...toArray(compiledProject.roof?.planes).map((plane) =>
      Number(plane.slope_deg || 0),
    ),
  );
  const roofAxis = resolveRoofAxis(compiledProject, width, depth);
  const halfSpan = Math.max(0.5, (roofAxis === "x" ? depth : width) / 2);
  const derivedRise =
    slopeDeg > 0
      ? Math.tan((slopeDeg * Math.PI) / 180) * halfSpan
      : Math.max(1.2, halfSpan * 0.42);
  return round(
    clamp(explicitRise || derivedRise, 0.8, Math.max(1.2, halfSpan * 1.2)),
  );
}

function resolveExteriorGeometry(compiledProject = {}) {
  const footprint = resolvePrimaryFootprint(compiledProject);
  const bbox = buildBoundingBoxFromPolygon(footprint);
  const width = round(
    Number(compiledProject.envelope?.width_m || bbox.width || 0),
  );
  const depth = round(
    Number(compiledProject.envelope?.depth_m || bbox.height || 0),
  );
  const baseHeight = round(resolveBaseHeight(compiledProject));
  const roofKind = resolveRoofKind(compiledProject);
  const roofAxis = resolveRoofAxis(compiledProject, width, depth);
  const roofRise =
    roofKind === "flat" ? 0 : resolveRoofRise(compiledProject, width, depth);
  return {
    footprint,
    bbox,
    width: width || 10,
    depth: depth || 8,
    baseHeight,
    roofKind,
    roofAxis,
    roofRise,
    totalHeight: round(baseHeight + roofRise),
  };
}

function resolveGroundLevel(compiledProject = {}) {
  return (
    toArray(compiledProject.levels)
      .slice()
      .sort(
        (left, right) =>
          Number(left.level_number || 0) - Number(right.level_number || 0),
      )[0] || {}
  );
}

function buildWallSideMap(compiledProject = {}) {
  return new Map(
    toArray(compiledProject.walls).map((wall) => [
      wall.id || wall.sourceId,
      String(wall.side || wall.facade || wall.metadata?.side || "")
        .trim()
        .toLowerCase(),
    ]),
  );
}

function collectOpeningRecords(compiledProject = {}, footprintBBox = {}) {
  const wallSideById = buildWallSideMap(compiledProject);
  const normalizedOpenings = [
    ...toArray(compiledProject.openings),
    ...toArray(compiledProject.windows).map((opening) => ({
      ...opening,
      type: "window",
    })),
    ...toArray(compiledProject.doors).map((opening) => ({
      ...opening,
      type: "door",
    })),
  ];

  return normalizedOpenings.map((opening) => {
    const side = String(
      opening.side ||
        opening.facade ||
        opening.metadata?.side ||
        wallSideById.get(opening.wallId || opening.wall_id || null) ||
        "",
    )
      .trim()
      .toLowerCase();
    const position = opening.position_m || opening.position || {};
    const centerX = Number(position.x ?? 0);
    const centerY = Number(position.y ?? 0);
    const widthM = Number(opening.width_m ?? opening.width ?? 1.2) || 1.2;
    const sill =
      Number(
        opening.sill_height_m ??
          opening.sillHeightM ??
          (opening.type === "door" ? 0 : 0.9),
      ) || 0;
    const head =
      Number(
        opening.head_height_m ??
          opening.headHeightM ??
          (opening.type === "door" ? 2.2 : 2.1),
      ) || sill + 2.1;
    const centerM =
      side === "east" || side === "west"
        ? centerY - Number(footprintBBox.min_y || 0)
        : centerX - Number(footprintBBox.min_x || 0);

    return {
      id:
        opening.id ||
        opening.sourceId ||
        opening.wallId ||
        opening.wall_id ||
        "opening",
      type:
        String(opening.type || opening.kind || "window").toLowerCase() ===
        "door"
          ? "door"
          : "window",
      side,
      center_m: round(centerM),
      width_m: round(widthM),
      sill_height_m: round(sill),
      head_height_m: round(Math.max(head, sill + 1)),
      levelId: opening.levelId || opening.level_id || null,
      position_m: { x: round(centerX), y: round(centerY) },
      wallId: opening.wallId || opening.wall_id || null,
      roomIds: cloneData(opening.roomIds || opening.room_ids || []),
    };
  });
}

function resolveFacadeEntry(
  compiledProject = {},
  side,
  openingRecords = [],
  geometry = {},
) {
  const facadeMap =
    compiledProject.facades?.byOrientation ||
    compiledProject.facades?.bySide ||
    compiledProject.facades ||
    {};
  const existing = facadeMap?.[side];
  if (
    existing?.projectedOpenings?.length ||
    existing?.projectedWindows?.length ||
    existing?.projectedDoors?.length
  ) {
    const openings = existing.projectedOpenings?.length
      ? existing.projectedOpenings
      : [
          ...toArray(existing.projectedWindows).map((entry) => ({
            ...entry,
            kind: "window",
          })),
          ...toArray(existing.projectedDoors).map((entry) => ({
            ...entry,
            kind: "door",
          })),
        ];
    return {
      side,
      width_m:
        Number(existing.metrics?.width_m || 0) ||
        (side === "east" || side === "west" ? geometry.depth : geometry.width),
      total_height_m:
        Number(existing.metrics?.total_height_m || 0) || geometry.baseHeight,
      projectedOpenings: openings.map((entry) => ({
        kind:
          String(entry.kind || entry.type || "window").toLowerCase() === "door"
            ? "door"
            : "window",
        center_m: round(Number(entry.center_m || 0)),
        width_m: round(Number(entry.width_m || 1.2)),
        sill_height_m: round(
          Number(entry.sill_height_m || (entry.kind === "door" ? 0 : 0.9)),
        ),
        head_height_m: round(
          Number(entry.head_height_m || (entry.kind === "door" ? 2.2 : 2.1)),
        ),
      })),
    };
  }

  const span =
    side === "east" || side === "west" ? geometry.depth : geometry.width;
  return {
    side,
    width_m: span,
    total_height_m: geometry.baseHeight,
    projectedOpenings: openingRecords
      .filter((entry) => entry.side === side)
      .map((entry) => ({
        kind: entry.type,
        center_m: entry.center_m,
        width_m: entry.width_m,
        sill_height_m: entry.sill_height_m,
        head_height_m: entry.head_height_m,
      })),
  };
}

function transformPoint(point, spec, center, perspectiveDistance) {
  const yaw = (Number(spec.yawDeg || 0) * Math.PI) / 180;
  const pitch = (Number(spec.pitchDeg || 0) * Math.PI) / 180;
  const x0 = Number(point.x || 0) - center.x;
  const y0 = Number(point.y || 0) - center.y;
  const z0 = Number(point.z || 0);

  const x1 = x0 * Math.cos(yaw) - y0 * Math.sin(yaw);
  const y1 = x0 * Math.sin(yaw) + y0 * Math.cos(yaw);
  const y2 = y1 * Math.cos(pitch) - z0 * Math.sin(pitch);
  const depth = y1 * Math.sin(pitch) + z0 * Math.cos(pitch);
  const perspectiveScale = spec.perspective
    ? perspectiveDistance /
      (perspectiveDistance + depth + perspectiveDistance * 0.25)
    : 1;

  return {
    x: x1 * perspectiveScale,
    y: -y2 * perspectiveScale,
    depth,
  };
}

function createProjector(surfaces = [], spec = {}, worldBounds = {}) {
  const center = {
    x: Number(worldBounds.width || 0) / 2,
    y: Number(worldBounds.depth || 0) / 2,
  };
  const perspectiveDistance = Math.max(
    18,
    (Number(worldBounds.width || 0) +
      Number(worldBounds.depth || 0) +
      Number(worldBounds.totalHeight || 0)) *
      1.45,
  );

  const transformedPoints = surfaces.flatMap((surface) =>
    toArray(surface.points).map((point) =>
      transformPoint(point, spec, center, perspectiveDistance),
    ),
  );

  const minX = Math.min(...transformedPoints.map((point) => point.x));
  const maxX = Math.max(...transformedPoints.map((point) => point.x));
  const minY = Math.min(...transformedPoints.map((point) => point.y));
  const maxY = Math.max(...transformedPoints.map((point) => point.y));

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Number(spec.padding || 80);
  const availableWidth = Math.max(
    100,
    Number(spec.width || 1200) - padding * 2,
  );
  const availableHeight = Math.max(
    100,
    Number(spec.height || 900) - padding * 2,
  );
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const offsetX =
    (Number(spec.width || 1200) - width * scale) / 2 - minX * scale;
  const offsetY =
    (Number(spec.height || 900) - height * scale) / 2 - minY * scale;

  return (point) => {
    const transformed = transformPoint(
      point,
      spec,
      center,
      perspectiveDistance,
    );
    return {
      x: round(transformed.x * scale + offsetX, 2),
      y: round(transformed.y * scale + offsetY, 2),
      depth: transformed.depth,
    };
  };
}

function buildRectOpeningSurface(
  side,
  facade,
  geometry,
  opening,
  fill,
  stroke,
  strokeWidth,
) {
  const span = Math.max(
    0.1,
    Number(facade.width_m || 0) ||
      (side === "east" || side === "west" ? geometry.depth : geometry.width),
  );
  const targetSpan =
    side === "east" || side === "west" ? geometry.depth : geometry.width;
  const scale = targetSpan / span;
  const halfWidth = (Number(opening.width_m || 1.2) * scale) / 2;
  const center = Number(opening.center_m || 0) * scale;
  const sill = Number(opening.sill_height_m || 0);
  const head = Math.max(sill + 1, Number(opening.head_height_m || sill + 2.1));

  let points = null;
  if (side === "south") {
    points = [
      { x: center - halfWidth, y: geometry.depth, z: sill },
      { x: center + halfWidth, y: geometry.depth, z: sill },
      { x: center + halfWidth, y: geometry.depth, z: head },
      { x: center - halfWidth, y: geometry.depth, z: head },
    ];
  } else if (side === "north") {
    points = [
      { x: center - halfWidth, y: 0, z: sill },
      { x: center + halfWidth, y: 0, z: sill },
      { x: center + halfWidth, y: 0, z: head },
      { x: center - halfWidth, y: 0, z: head },
    ];
  } else if (side === "east") {
    points = [
      { x: geometry.width, y: center - halfWidth, z: sill },
      { x: geometry.width, y: center + halfWidth, z: sill },
      { x: geometry.width, y: center + halfWidth, z: head },
      { x: geometry.width, y: center - halfWidth, z: head },
    ];
  } else if (side === "west") {
    points = [
      { x: 0, y: center - halfWidth, z: sill },
      { x: 0, y: center + halfWidth, z: sill },
      { x: 0, y: center + halfWidth, z: head },
      { x: 0, y: center - halfWidth, z: head },
    ];
  }

  return points
    ? {
        type: "polygon",
        points,
        fill,
        stroke,
        strokeWidth,
        order: 40,
      }
    : null;
}

function buildRoofSurfaces(geometry = {}, visibleSides = [], theme = {}) {
  const eave = geometry.baseHeight;
  const ridge = geometry.totalHeight;
  const surfaces = [];
  const ridgeLines = [];

  if (geometry.roofKind === "flat" || geometry.roofRise <= 0) {
    surfaces.push({
      type: "polygon",
      points: [
        { x: 0, y: 0, z: eave },
        { x: geometry.width, y: 0, z: eave },
        { x: geometry.width, y: geometry.depth, z: eave },
        { x: 0, y: geometry.depth, z: eave },
      ],
      fill: theme.roofPrimary,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 30,
    });
    return { surfaces, ridgeLines };
  }

  if (geometry.roofKind === "shed") {
    const riseAxis = geometry.roofAxis === "x" ? "y" : "x";
    const highX = riseAxis === "x" ? geometry.width : 0;
    const highY = riseAxis === "y" ? geometry.depth : 0;
    surfaces.push({
      type: "polygon",
      points: [
        { x: 0, y: 0, z: riseAxis === "x" ? eave : eave },
        { x: geometry.width, y: 0, z: riseAxis === "x" ? ridge : eave },
        {
          x: geometry.width,
          y: geometry.depth,
          z: riseAxis === "y" ? ridge : riseAxis === "x" ? ridge : eave,
        },
        { x: 0, y: geometry.depth, z: riseAxis === "y" ? ridge : eave },
      ],
      fill: theme.roofPrimary,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 30,
    });
    ridgeLines.push([
      { x: highX, y: 0, z: ridge },
      { x: highX, y: geometry.depth, z: ridge },
    ]);
    if (riseAxis === "y") {
      ridgeLines[0] = [
        { x: 0, y: highY, z: ridge },
        { x: geometry.width, y: highY, z: ridge },
      ];
    }
    return { surfaces, ridgeLines };
  }

  if (geometry.roofKind === "hip") {
    const insetRatio = 0.18;
    if (geometry.roofAxis === "x") {
      const inset = geometry.width * insetRatio;
      const ridgeY = geometry.depth / 2;
      surfaces.push(
        {
          type: "polygon",
          points: [
            { x: 0, y: 0, z: eave },
            { x: geometry.width, y: 0, z: eave },
            { x: geometry.width - inset, y: ridgeY, z: ridge },
            { x: inset, y: ridgeY, z: ridge },
          ],
          fill: theme.roofPrimary,
          stroke: theme.stroke,
          strokeWidth: 2,
          order: 30,
        },
        {
          type: "polygon",
          points: [
            { x: 0, y: geometry.depth, z: eave },
            { x: geometry.width, y: geometry.depth, z: eave },
            { x: geometry.width - inset, y: ridgeY, z: ridge },
            { x: inset, y: ridgeY, z: ridge },
          ],
          fill: theme.roofSecondary,
          stroke: theme.stroke,
          strokeWidth: 2,
          order: 29,
        },
      );
      ridgeLines.push([
        { x: inset, y: ridgeY, z: ridge },
        { x: geometry.width - inset, y: ridgeY, z: ridge },
      ]);
    } else {
      const inset = geometry.depth * insetRatio;
      const ridgeX = geometry.width / 2;
      surfaces.push(
        {
          type: "polygon",
          points: [
            { x: 0, y: 0, z: eave },
            { x: 0, y: geometry.depth, z: eave },
            { x: ridgeX, y: geometry.depth - inset, z: ridge },
            { x: ridgeX, y: inset, z: ridge },
          ],
          fill: theme.roofPrimary,
          stroke: theme.stroke,
          strokeWidth: 2,
          order: 30,
        },
        {
          type: "polygon",
          points: [
            { x: geometry.width, y: 0, z: eave },
            { x: geometry.width, y: geometry.depth, z: eave },
            { x: ridgeX, y: geometry.depth - inset, z: ridge },
            { x: ridgeX, y: inset, z: ridge },
          ],
          fill: theme.roofSecondary,
          stroke: theme.stroke,
          strokeWidth: 2,
          order: 29,
        },
      );
      ridgeLines.push([
        { x: ridgeX, y: inset, z: ridge },
        { x: ridgeX, y: geometry.depth - inset, z: ridge },
      ]);
    }
    return { surfaces, ridgeLines };
  }

  if (geometry.roofAxis === "x") {
    surfaces.push(
      {
        type: "polygon",
        points: [
          { x: 0, y: 0, z: eave },
          { x: geometry.width, y: 0, z: eave },
          { x: geometry.width, y: geometry.depth / 2, z: ridge },
          { x: 0, y: geometry.depth / 2, z: ridge },
        ],
        fill: visibleSides.includes("south")
          ? theme.roofPrimary
          : theme.roofSecondary,
        stroke: theme.stroke,
        strokeWidth: 2,
        order: 30,
      },
      {
        type: "polygon",
        points: [
          { x: 0, y: geometry.depth / 2, z: ridge },
          { x: geometry.width, y: geometry.depth / 2, z: ridge },
          { x: geometry.width, y: geometry.depth, z: eave },
          { x: 0, y: geometry.depth, z: eave },
        ],
        fill: theme.roofSecondary,
        stroke: theme.stroke,
        strokeWidth: 2,
        order: 29,
      },
    );
    ridgeLines.push([
      { x: 0, y: geometry.depth / 2, z: ridge },
      { x: geometry.width, y: geometry.depth / 2, z: ridge },
    ]);
    return { surfaces, ridgeLines };
  }

  surfaces.push(
    {
      type: "polygon",
      points: [
        { x: 0, y: 0, z: eave },
        { x: geometry.width / 2, y: 0, z: ridge },
        { x: geometry.width / 2, y: geometry.depth, z: ridge },
        { x: 0, y: geometry.depth, z: eave },
      ],
      fill: theme.roofPrimary,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 30,
    },
    {
      type: "polygon",
      points: [
        { x: geometry.width / 2, y: 0, z: ridge },
        { x: geometry.width, y: 0, z: eave },
        { x: geometry.width, y: geometry.depth, z: eave },
        { x: geometry.width / 2, y: geometry.depth, z: ridge },
      ],
      fill: theme.roofSecondary,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 29,
    },
  );
  ridgeLines.push([
    { x: geometry.width / 2, y: 0, z: ridge },
    { x: geometry.width / 2, y: geometry.depth, z: ridge },
  ]);
  return { surfaces, ridgeLines };
}

function buildExteriorSurfaces(compiledProject = {}, spec = {}) {
  const geometry = resolveExteriorGeometry(compiledProject);
  const openingRecords = collectOpeningRecords(compiledProject, geometry.bbox);
  const visibleSides = toArray(spec.visibleSides).filter(Boolean);
  const theme = spec.theme;
  const surfaces = [
    {
      type: "polygon",
      points: [
        { x: -geometry.width * 0.08, y: -geometry.depth * 0.08, z: 0 },
        { x: geometry.width * 1.08, y: -geometry.depth * 0.08, z: 0 },
        { x: geometry.width * 1.08, y: geometry.depth * 1.08, z: 0 },
        { x: -geometry.width * 0.08, y: geometry.depth * 1.08, z: 0 },
      ],
      fill: theme.ground,
      stroke: "none",
      strokeWidth: 0,
      order: 0,
    },
  ];

  visibleSides.forEach((side, index) => {
    const facade = resolveFacadeEntry(
      compiledProject,
      side,
      openingRecords,
      geometry,
    );
    let facePoints = null;
    if (side === "south") {
      facePoints = [
        { x: 0, y: geometry.depth, z: 0 },
        { x: geometry.width, y: geometry.depth, z: 0 },
        { x: geometry.width, y: geometry.depth, z: geometry.baseHeight },
        { x: 0, y: geometry.depth, z: geometry.baseHeight },
      ];
    } else if (side === "north") {
      facePoints = [
        { x: 0, y: 0, z: 0 },
        { x: geometry.width, y: 0, z: 0 },
        { x: geometry.width, y: 0, z: geometry.baseHeight },
        { x: 0, y: 0, z: geometry.baseHeight },
      ];
    } else if (side === "east") {
      facePoints = [
        { x: geometry.width, y: 0, z: 0 },
        { x: geometry.width, y: geometry.depth, z: 0 },
        { x: geometry.width, y: geometry.depth, z: geometry.baseHeight },
        { x: geometry.width, y: 0, z: geometry.baseHeight },
      ];
    } else if (side === "west") {
      facePoints = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: geometry.depth, z: 0 },
        { x: 0, y: geometry.depth, z: geometry.baseHeight },
        { x: 0, y: 0, z: geometry.baseHeight },
      ];
    }

    if (!facePoints) return;
    surfaces.push({
      type: "polygon",
      points: facePoints,
      fill: index === 0 ? theme.primaryWall : theme.secondaryWall,
      stroke: theme.stroke,
      strokeWidth: spec.panelType === "axonometric" ? 2 : 2.4,
      order: 10 + index,
    });

    facade.projectedOpenings.forEach((opening) => {
      const surface = buildRectOpeningSurface(
        side,
        facade,
        geometry,
        opening,
        opening.kind === "door" ? theme.door : theme.glass,
        theme.stroke,
        spec.panelType === "axonometric" ? 1.4 : 1.8,
      );
      if (surface) {
        surfaces.push(surface);
      }
    });
  });

  const roof = buildRoofSurfaces(geometry, visibleSides, theme);
  surfaces.push(...roof.surfaces);
  roof.ridgeLines.forEach((line) => {
    surfaces.push({
      type: "polyline",
      points: line,
      fill: "none",
      stroke: theme.ridge,
      strokeWidth: spec.panelType === "axonometric" ? 1.7 : 2,
      order: 55,
    });
  });

  return { geometry, surfaces };
}

function resolveGroundPlanGeometry(compiledProject = {}) {
  const level = resolveGroundLevel(compiledProject);
  const polygonCandidates = [
    normalizePolygonLike(level.footprint?.polygon || level.footprint),
    normalizePolygonLike(compiledProject.footprint?.polygon),
    resolvePrimaryFootprint(compiledProject),
  ];
  const polygon = polygonCandidates.find((entry) => entry.length >= 3) || [];
  const bbox = buildBoundingBoxFromPolygon(
    polygon?.length ? polygon : resolvePrimaryFootprint(compiledProject),
  );
  return {
    levelId: level.id || level.sourceId || null,
    width: Number(bbox.width || compiledProject.envelope?.width_m || 10) || 10,
    depth: Number(bbox.height || compiledProject.envelope?.depth_m || 8) || 8,
    height: Number(level.height_m || 3) || 3,
    bbox,
  };
}

function buildInteriorSurfaces(compiledProject = {}, spec = {}) {
  const ground = resolveGroundPlanGeometry(compiledProject);
  const theme = spec.theme;
  const openingRecords = collectOpeningRecords(
    compiledProject,
    ground.bbox,
  ).filter((opening) => !ground.levelId || opening.levelId === ground.levelId);
  const surfaces = [
    {
      type: "polygon",
      points: [
        { x: 0, y: 0, z: 0 },
        { x: ground.width, y: 0, z: 0 },
        { x: ground.width, y: ground.depth, z: 0 },
        { x: 0, y: ground.depth, z: 0 },
      ],
      fill: theme.floor,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 0,
    },
    {
      type: "polygon",
      points: [
        { x: 0, y: 0, z: 0 },
        { x: ground.width, y: 0, z: 0 },
        { x: ground.width, y: 0, z: ground.height },
        { x: 0, y: 0, z: ground.height },
      ],
      fill: theme.wallBack,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 10,
    },
    {
      type: "polygon",
      points: [
        { x: ground.width, y: 0, z: 0 },
        { x: ground.width, y: ground.depth, z: 0 },
        { x: ground.width, y: ground.depth, z: ground.height },
        { x: ground.width, y: 0, z: ground.height },
      ],
      fill: theme.wallSide,
      stroke: theme.stroke,
      strokeWidth: 2,
      order: 11,
    },
  ];

  openingRecords
    .filter((opening) => opening.side === "north" || opening.side === "east")
    .forEach((opening) => {
      const facade = {
        width_m: opening.side === "east" ? ground.depth : ground.width,
      };
      const surface = buildRectOpeningSurface(
        opening.side,
        facade,
        {
          width: ground.width,
          depth: ground.depth,
          baseHeight: ground.height,
        },
        opening,
        theme.opening,
        theme.stroke,
        1.5,
      );
      if (surface) {
        surface.order = 30;
        surfaces.push(surface);
      }
    });

  toArray(compiledProject.walls)
    .filter((wall) => {
      const levelId = wall.levelId || wall.level_id || null;
      return (
        (!ground.levelId || !levelId || levelId === ground.levelId) &&
        !Boolean(wall.exterior) &&
        wall.start &&
        wall.end
      );
    })
    .forEach((wall) => {
      surfaces.push({
        type: "polyline",
        points: [
          {
            x: Number(wall.start.x || 0) - Number(ground.bbox.min_x || 0),
            y: Number(wall.start.y || 0) - Number(ground.bbox.min_y || 0),
            z: 0,
          },
          {
            x: Number(wall.end.x || 0) - Number(ground.bbox.min_x || 0),
            y: Number(wall.end.y || 0) - Number(ground.bbox.min_y || 0),
            z: 0,
          },
        ],
        fill: "none",
        stroke: theme.interiorWall,
        strokeWidth: 3,
        order: 18,
      });
    });

  toArray(compiledProject.stairs)
    .filter((stair) => {
      const levelId = stair.levelId || stair.level_id || null;
      return !ground.levelId || !levelId || levelId === ground.levelId;
    })
    .forEach((stair) => {
      const stairPolygon = normalizePolygonLike(stair.polygon);
      const stairBBox =
        stairPolygon.length >= 3
          ? buildBoundingBoxFromPolygon(stairPolygon)
          : resolveBBox(stair.bbox || {});
      if (!(stairBBox.width > 0 && stairBBox.height > 0)) return;
      surfaces.push({
        type: "polygon",
        points: [
          {
            x: stairBBox.min_x - Number(ground.bbox.min_x || 0),
            y: stairBBox.min_y - Number(ground.bbox.min_y || 0),
            z: 0,
          },
          {
            x: stairBBox.max_x - Number(ground.bbox.min_x || 0),
            y: stairBBox.min_y - Number(ground.bbox.min_y || 0),
            z: 0,
          },
          {
            x: stairBBox.max_x - Number(ground.bbox.min_x || 0),
            y: stairBBox.max_y - Number(ground.bbox.min_y || 0),
            z: 0.45,
          },
          {
            x: stairBBox.min_x - Number(ground.bbox.min_x || 0),
            y: stairBBox.max_y - Number(ground.bbox.min_y || 0),
            z: 0.45,
          },
        ],
        fill: theme.stair,
        stroke: theme.cutLine,
        strokeWidth: 1.6,
        order: 16,
      });
    });

  return {
    geometry: {
      width: ground.width,
      depth: ground.depth,
      totalHeight: ground.height,
    },
    surfaces,
  };
}

function surfaceToSvg(projector, surface) {
  const projected = toArray(surface.points).map((point) => projector(point));
  const points = projected.map((point) => `${point.x},${point.y}`).join(" ");
  const style = [
    `fill="${escapeXml(surface.fill || "none")}"`,
    `stroke="${escapeXml(surface.stroke || "none")}"`,
    `stroke-width="${round(Number(surface.strokeWidth || 1), 2)}"`,
    `stroke-linejoin="round"`,
    `stroke-linecap="round"`,
  ].join(" ");

  if (surface.type === "polyline") {
    return `<polyline points="${points}" ${style} />`;
  }
  return `<polygon points="${points}" ${style} />`;
}

function buildSceneDecorationDefs(spec) {
  const isExterior =
    spec.renderKind?.startsWith("compiled_exterior") ||
    spec.panelType === "hero_3d" ||
    spec.panelType === "exterior_render";
  const isAxonometric = spec.renderKind === "compiled_axonometric";
  const isInterior = spec.renderKind === "compiled_interior_cutaway";
  const skyTop = isAxonometric ? spec.theme.background : "#cfdbe6";
  const skyHorizon = spec.theme.background || "#eef2f6";
  const groundNear = spec.theme.ground || "#d6cfc1";
  const groundFar = isAxonometric ? spec.theme.ground : "#bcb4a3";
  return [
    `<defs>`,
    `<linearGradient id="cri-sky" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${escapeXml(skyTop)}"/>`,
    `<stop offset="100%" stop-color="${escapeXml(skyHorizon)}"/>`,
    `</linearGradient>`,
    `<linearGradient id="cri-ground" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${escapeXml(groundFar)}"/>`,
    `<stop offset="100%" stop-color="${escapeXml(groundNear)}"/>`,
    `</linearGradient>`,
    `<radialGradient id="cri-vignette" cx="50%" cy="55%" r="65%">`,
    `<stop offset="60%" stop-color="rgba(0,0,0,0)"/>`,
    `<stop offset="100%" stop-color="rgba(0,0,0,0.18)"/>`,
    `</radialGradient>`,
    `<filter id="cri-soft-shadow" x="-15%" y="-15%" width="130%" height="130%">`,
    `<feGaussianBlur in="SourceAlpha" stdDeviation="6"/>`,
    `<feOffset dx="0" dy="8"/>`,
    `<feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>`,
    `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`,
    `</filter>`,
    `</defs>`,
  ]
    .filter(Boolean)
    .join("");
}

function buildSceneBackdrop(spec) {
  const w = spec.width;
  const h = spec.height;
  const isAxonometric = spec.renderKind === "compiled_axonometric";
  const isInterior = spec.renderKind === "compiled_interior_cutaway";
  if (isInterior) {
    return `<rect width="${w}" height="${h}" fill="${escapeXml(spec.theme.background)}"/>`;
  }
  if (isAxonometric) {
    return [
      `<rect width="${w}" height="${h}" fill="${escapeXml(spec.theme.background)}"/>`,
      `<rect x="0" y="${Math.round(h * 0.62)}" width="${w}" height="${h - Math.round(h * 0.62)}" fill="url(#cri-ground)" opacity="0.35"/>`,
    ].join("");
  }
  return [
    `<rect width="${w}" height="${Math.round(h * 0.62)}" fill="url(#cri-sky)"/>`,
    `<rect x="0" y="${Math.round(h * 0.62)}" width="${w}" height="${h - Math.round(h * 0.62)}" fill="url(#cri-ground)"/>`,
    `<line x1="0" y1="${Math.round(h * 0.62)}" x2="${w}" y2="${Math.round(h * 0.62)}" stroke="${escapeXml(spec.theme.stroke)}" stroke-width="0.6" opacity="0.18"/>`,
  ].join("");
}

function buildSceneOverlay(spec) {
  const w = spec.width;
  const h = spec.height;
  const isInterior = spec.renderKind === "compiled_interior_cutaway";
  if (isInterior) {
    return "";
  }
  return `<rect width="${w}" height="${h}" fill="url(#cri-vignette)" pointer-events="none"/>`;
}

function renderSceneToSvg(title, surfaces, sceneGeometry, spec) {
  if (!surfaces.length) return null;
  const projector = createProjector(surfaces, spec, sceneGeometry);
  const ordered = surfaces
    .map((surface) => {
      const projectedDepths = toArray(surface.points).map(
        (point) => projector(point).depth,
      );
      const averageDepth =
        projectedDepths.reduce((sum, value) => sum + value, 0) /
        Math.max(projectedDepths.length, 1);
      return {
        ...surface,
        averageDepth,
      };
    })
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.averageDepth - right.averageDepth;
    });

  const body = ordered
    .map((surface) => surfaceToSvg(projector, surface))
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.width} ${spec.height}" width="${spec.width}" height="${spec.height}">`,
    `<title>${escapeXml(title)}</title>`,
    buildSceneDecorationDefs(spec),
    buildSceneBackdrop(spec),
    `<g filter="url(#cri-soft-shadow)">${body}</g>`,
    buildSceneOverlay(spec),
    `</svg>`,
  ].join("\n");
}

function summarizeScenePrimitives(surfaces = []) {
  const byType = {};
  toArray(surfaces).forEach((surface) => {
    const type = surface?.type || "polygon";
    byType[type] = (byType[type] || 0) + 1;
  });
  return {
    primitiveCount: toArray(surfaces).length,
    surfaceCount: toArray(surfaces).length,
    polygonCount: byType.polygon || 0,
    polylineCount: byType.polyline || 0,
    byType,
  };
}

function countSvgScenePrimitives(svgString = "") {
  return (String(svgString || "").match(/<(?:polygon|polyline|path)\b/gi) || [])
    .length;
}

function renderInputLooksPlaceholder(entry = {}, svgString = "") {
  const metadata = isPlainObject(entry?.metadata) ? entry.metadata : {};
  const text = [
    svgString,
    entry?.dataUrl,
    entry?.url,
    entry?.imageUrl,
    entry?.sourceType,
    entry?.source,
    metadata.source,
    metadata.sourceType,
    metadata.model,
    metadata.renderKind,
  ]
    .filter(Boolean)
    .join(" ");
  return PLACEHOLDER_RENDER_RE.test(text);
}

function renderInputHasUsableControlSvg(entry = null) {
  if (!isPlainObject(entry) || typeof entry.svgString !== "string") {
    return false;
  }
  const svgString = entry.svgString.trim();
  if (!svgString || renderInputLooksPlaceholder(entry, svgString)) {
    return false;
  }
  const primitiveCount = Number(
    entry.metadata?.primitiveCount ??
      entry.metadata?.surfaceCount ??
      countSvgScenePrimitives(svgString),
  );
  return primitiveCount >= MIN_COMPILED_CONTROL_PRIMITIVES;
}

function viewSpecForPanelType(panelType = "") {
  if (panelType === "interior_3d") {
    return INTERIOR_VIEW_SPEC;
  }
  return EXTERIOR_VIEW_SPECS[panelType] || {};
}

function cameraMetadataFromSpec(spec = {}) {
  return {
    projection: spec.perspective ? "perspective" : "orthographic",
    yawDeg: spec.yawDeg,
    pitchDeg: spec.pitchDeg,
    visibleSides: Array.isArray(spec.visibleSides)
      ? [...spec.visibleSides]
      : [],
  };
}

function buildRenderInputRecord(
  panelType,
  svgString,
  spec,
  geometryHash = null,
  scene = {},
) {
  if (!svgString) return null;
  const svgHash = computeCDSHashSync({ panelType, svg: svgString });
  const primitiveSummary = summarizeScenePrimitives(scene.surfaces || []);
  return {
    panelType,
    viewType: panelType,
    width: spec.width,
    height: spec.height,
    svgString,
    dataUrl: svgToDataUrl(svgString),
    svgHash,
    sourceType: "compiled_render_input",
    title: spec.title,
    geometryHash: geometryHash || null,
    metadata: {
      source: "compiled_project",
      panelType,
      sourceType: "compiled_render_input",
      renderKind: spec.renderKind,
      geometryHash: geometryHash || null,
      svgHash,
      deterministic: true,
      camera: cameraMetadataFromSpec(spec),
      ...primitiveSummary,
      sceneGeometry: cloneData(scene.geometry || null),
    },
  };
}

function normalizeExistingRenderInput(panelType, entry, geometryHash = null) {
  if (!isPlainObject(entry) && typeof entry !== "string") {
    return null;
  }

  if (typeof entry === "string") {
    return {
      panelType,
      viewType: panelType,
      width: null,
      height: null,
      svgString: null,
      dataUrl: entry.startsWith("data:") ? entry : null,
      url: entry.startsWith("data:") ? null : entry,
      sourceType: "compiled_render_input",
      geometryHash: geometryHash || null,
      metadata: {
        source: "compiled_project",
        panelType,
        sourceType: "compiled_render_input",
        geometryHash: geometryHash || null,
        deterministic: true,
      },
    };
  }

  const svgString = entry.svgString || entry.svg || null;
  const dataUrl =
    entry.dataUrl ||
    entry.url ||
    entry.imageUrl ||
    (svgString ? svgToDataUrl(svgString) : null);
  if (!svgString && !dataUrl) {
    return null;
  }
  const svgHash = svgString
    ? computeCDSHashSync({ panelType, svg: svgString })
    : entry.svgHash || null;
  const fallbackSpec = viewSpecForPanelType(panelType);
  const existingMetadata = cloneData(entry.metadata || {}) || {};
  const fallbackPrimitiveCount =
    existingMetadata.primitiveCount ||
    existingMetadata.surfaceCount ||
    countSvgScenePrimitives(svgString || "");
  return {
    ...cloneData(entry),
    panelType: entry.panelType || entry.viewType || panelType,
    viewType: entry.viewType || panelType,
    svgString,
    dataUrl,
    svgHash,
    sourceType: entry.sourceType || entry.source || "compiled_render_input",
    geometryHash: geometryHash || entry.geometryHash || null,
    metadata: {
      ...existingMetadata,
      source: "compiled_project",
      panelType,
      sourceType: entry.sourceType || entry.source || "compiled_render_input",
      geometryHash: geometryHash || entry.geometryHash || null,
      ...(svgHash ? { svgHash } : {}),
      deterministic: true,
      camera: existingMetadata.camera || cameraMetadataFromSpec(fallbackSpec),
      primitiveCount: fallbackPrimitiveCount,
      surfaceCount: existingMetadata.surfaceCount || fallbackPrimitiveCount,
    },
  };
}

export function buildCompiledProjectRenderInputs(
  compiledProject = {},
  options = {},
) {
  const geometryHash =
    compiledProject.geometryHash || options.geometryHash || null;
  const requestedViews =
    toArray(options.views).filter((view) =>
      REQUIRED_3D_VIEW_TYPES.includes(view),
    ) || REQUIRED_3D_VIEW_TYPES;
  const requestedSet = new Set(
    requestedViews.length ? requestedViews : REQUIRED_3D_VIEW_TYPES,
  );
  const renderInputs = {};

  if (requestedSet.has("hero_3d")) {
    const scene = buildExteriorSurfaces(
      compiledProject,
      EXTERIOR_VIEW_SPECS.hero_3d,
    );
    const svgString = renderSceneToSvg(
      EXTERIOR_VIEW_SPECS.hero_3d.title,
      scene.surfaces,
      scene.geometry,
      EXTERIOR_VIEW_SPECS.hero_3d,
    );
    const record = buildRenderInputRecord(
      "hero_3d",
      svgString,
      EXTERIOR_VIEW_SPECS.hero_3d,
      geometryHash,
      scene,
    );
    if (record) {
      renderInputs.hero_3d = record;
    }
  }

  if (requestedSet.has("exterior_render")) {
    const scene = buildExteriorSurfaces(
      compiledProject,
      EXTERIOR_VIEW_SPECS.exterior_render,
    );
    const svgString = renderSceneToSvg(
      EXTERIOR_VIEW_SPECS.exterior_render.title,
      scene.surfaces,
      scene.geometry,
      EXTERIOR_VIEW_SPECS.exterior_render,
    );
    const record = buildRenderInputRecord(
      "exterior_render",
      svgString,
      EXTERIOR_VIEW_SPECS.exterior_render,
      geometryHash,
      scene,
    );
    if (record) {
      renderInputs.exterior_render = record;
    }
  }

  if (requestedSet.has("axonometric")) {
    const scene = buildExteriorSurfaces(
      compiledProject,
      EXTERIOR_VIEW_SPECS.axonometric,
    );
    const svgString = renderSceneToSvg(
      EXTERIOR_VIEW_SPECS.axonometric.title,
      scene.surfaces,
      scene.geometry,
      EXTERIOR_VIEW_SPECS.axonometric,
    );
    const record = buildRenderInputRecord(
      "axonometric",
      svgString,
      EXTERIOR_VIEW_SPECS.axonometric,
      geometryHash,
      scene,
    );
    if (record) {
      renderInputs.axonometric = record;
    }
  }

  if (requestedSet.has("interior_3d")) {
    const scene = buildInteriorSurfaces(compiledProject, INTERIOR_VIEW_SPEC);
    const svgString = renderSceneToSvg(
      INTERIOR_VIEW_SPEC.title,
      scene.surfaces,
      scene.geometry,
      INTERIOR_VIEW_SPEC,
    );
    const record = buildRenderInputRecord(
      "interior_3d",
      svgString,
      INTERIOR_VIEW_SPEC,
      geometryHash,
      scene,
    );
    if (record) {
      renderInputs.interior_3d = record;
    }
  }

  return renderInputs;
}

export function ensureCompiledProjectRenderInputs(
  compiledProject = {},
  options = {},
) {
  const geometryHash =
    compiledProject.geometryHash || options.geometryHash || null;
  const existing = {};
  const renderMap = compiledProject.renderInputs || {};

  REQUIRED_3D_VIEW_TYPES.forEach((panelType) => {
    const normalized = normalizeExistingRenderInput(
      panelType,
      renderMap[panelType],
      geometryHash,
    );
    if (renderInputHasUsableControlSvg(normalized)) {
      existing[panelType] = normalized;
    }
  });

  const missingViews = REQUIRED_3D_VIEW_TYPES.filter(
    (panelType) => !existing[panelType],
  );
  if (!missingViews.length) {
    return existing;
  }

  return {
    ...buildCompiledProjectRenderInputs(compiledProject, {
      ...options,
      views: missingViews,
      geometryHash,
    }),
    ...existing,
  };
}

export default {
  buildCompiledProjectRenderInputs,
  ensureCompiledProjectRenderInputs,
};
