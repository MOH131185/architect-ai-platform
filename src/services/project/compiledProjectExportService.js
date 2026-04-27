import * as XLSX from "xlsx";
import {
  createCostWorkbookManifest,
  UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} from "./v2ProjectContracts.js";

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function dxfPair(code, value) {
  return `  ${code}\n${value}\n`;
}

function polygonPoints(candidate = []) {
  return Array.isArray(candidate) ? candidate : [];
}

function lineLength(start = {}, end = {}) {
  return Math.hypot(
    Number(end.x || 0) - Number(start.x || 0),
    Number(end.y || 0) - Number(start.y || 0),
  );
}

// AIA-style architectural layer palette. Colors are AutoCAD Color Index (ACI).
const DXF_LAYER_PALETTE = Object.freeze([
  { name: "A-WALL", color: 7, lineweight: 50 }, // structural / interior walls
  { name: "A-WALL-EXT", color: 1, lineweight: 70 }, // exterior shell
  { name: "A-DOOR", color: 4, lineweight: 30 },
  { name: "A-WINDOW", color: 5, lineweight: 30 },
  { name: "A-STAIR", color: 6, lineweight: 30 },
  { name: "A-ROOM", color: 8, lineweight: 18 },
  { name: "A-AREA", color: 8, lineweight: 13 },
  { name: "A-DIMS", color: 2, lineweight: 18 },
  { name: "A-TEXT", color: 7, lineweight: 18 },
  { name: "A-ANNO", color: 7, lineweight: 18 },
  { name: "A-SLAB", color: 3, lineweight: 25 },
  { name: "A-COLU", color: 1, lineweight: 50 }, // columns
  { name: "A-SITE", color: 30, lineweight: 35 },
  { name: "A-NORTH", color: 7, lineweight: 25 },
  { name: "A-METADATA", color: 9, lineweight: 13 }, // hidden provenance layer
]);

function levelPrefix(level, index) {
  if (!level) return "L00";
  const idx = Number.isFinite(Number(level.level_number))
    ? Number(level.level_number)
    : index;
  return `L${String(Math.max(0, idx)).padStart(2, "0")}`;
}

function levelLayerName(baseLayer, levelTag) {
  return levelTag ? `${levelTag}-${baseLayer}` : baseLayer;
}

function buildLayerTable(levelTags = []) {
  const layers = [];
  // Site / north / metadata layers are level-agnostic.
  const globalLayers = ["A-SITE", "A-NORTH", "A-METADATA", "A-TEXT"];
  const palette = new Map(DXF_LAYER_PALETTE.map((l) => [l.name, l]));
  for (const baseName of globalLayers) {
    const meta = palette.get(baseName);
    if (meta) layers.push({ ...meta, name: baseName });
  }
  // Per-level architectural layers.
  const perLevelBaseLayers = [
    "A-WALL",
    "A-WALL-EXT",
    "A-DOOR",
    "A-WINDOW",
    "A-STAIR",
    "A-ROOM",
    "A-AREA",
    "A-DIMS",
    "A-ANNO",
    "A-SLAB",
    "A-COLU",
  ];
  for (const tag of levelTags.length > 0 ? levelTags : ["L00"]) {
    for (const baseName of perLevelBaseLayers) {
      const meta = palette.get(baseName);
      if (meta) layers.push({ ...meta, name: `${tag}-${baseName}` });
    }
  }

  let content = "";
  content += dxfPair(0, "SECTION");
  content += dxfPair(2, "TABLES");
  content += dxfPair(0, "TABLE");
  content += dxfPair(2, "LAYER");
  content += dxfPair(70, String(layers.length));

  layers.forEach((layer) => {
    content += dxfPair(0, "LAYER");
    content += dxfPair(2, layer.name);
    content += dxfPair(70, 0);
    content += dxfPair(62, layer.color);
    content += dxfPair(6, "CONTINUOUS");
    if (Number.isFinite(layer.lineweight)) {
      content += dxfPair(370, String(layer.lineweight));
    }
  });

  content += dxfPair(0, "ENDTAB");
  content += dxfPair(0, "ENDSEC");
  return content;
}

function drawNorthArrow(originX = 0, originY = 0) {
  // 0.6 m tall arrow, level-agnostic A-NORTH layer.
  let content = "";
  const tip = { x: originX, y: originY + 0.6 };
  const left = { x: originX - 0.18, y: originY - 0.05 };
  const right = { x: originX + 0.18, y: originY - 0.05 };
  content += drawLine({ x: originX, y: originY }, tip, "A-NORTH");
  content += drawLine(tip, left, "A-NORTH");
  content += drawLine(tip, right, "A-NORTH");
  content += drawText(originX, originY + 0.75, "N", "A-NORTH", 0.25);
  return content;
}

function drawPolyline(points, layer, closed = true) {
  const poly = polygonPoints(points);
  if (poly.length < 2) {
    return "";
  }
  let content = "";
  content += dxfPair(0, "LWPOLYLINE");
  content += dxfPair(8, layer);
  content += dxfPair(90, poly.length);
  content += dxfPair(70, closed ? 1 : 0);
  poly.forEach((point) => {
    content += dxfPair(10, round(point.x, 4));
    content += dxfPair(20, round(point.y, 4));
  });
  return content;
}

function drawLine(start, end, layer) {
  let content = "";
  content += dxfPair(0, "LINE");
  content += dxfPair(8, layer);
  content += dxfPair(10, round(start.x, 4));
  content += dxfPair(20, round(start.y, 4));
  content += dxfPair(11, round(end.x, 4));
  content += dxfPair(21, round(end.y, 4));
  return content;
}

function drawText(x, y, text, layer = "A-TEXT", height = 0.22) {
  let content = "";
  content += dxfPair(0, "TEXT");
  content += dxfPair(8, layer);
  content += dxfPair(10, round(x, 4));
  content += dxfPair(20, round(y, 4));
  content += dxfPair(40, height);
  content += dxfPair(1, String(text || ""));
  return content;
}

function createIfcGuid(seed = "compiled-project") {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  let guid = "";
  let current = hash >>> 0;
  for (let index = 0; index < 22; index += 1) {
    current = (current * 1664525 + 1013904223) >>> 0;
    guid += alphabet[current % alphabet.length];
  }
  return guid;
}

const UK_RATE_TABLE = {
  areas: {
    "Gross Floor Area": 1650,
    "Slab Area": 140,
    "Roof Area": 155,
  },
  envelope: {
    "External Wall Area": 125,
    "Glazing Area": 520,
    "Envelope Perimeter": 42,
  },
  finishes: {
    "Internal Floor Finish": 48,
  },
  counts: {
    Doors: 420,
    Windows: 860,
    Stairs: 4800,
  },
};

export function exportCompiledProjectToDXF({
  compiledProject,
  projectName = "ArchiAI_Project",
  sourceModelHash = null,
  pipelineVersion = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for DXF export.",
    );
  }

  const levels =
    Array.isArray(compiledProject.levels) && compiledProject.levels.length
      ? compiledProject.levels
      : [{ id: "level-0", level_number: 0, name: "Ground" }];
  const levelTags = levels.map((level, index) => levelPrefix(level, index));

  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "HEADER");
  dxf += dxfPair(9, "$ACADVER");
  dxf += dxfPair(1, "AC1024");
  dxf += dxfPair(9, "$INSUNITS");
  dxf += dxfPair(70, "6"); // 6 = metres
  dxf += dxfPair(9, "$LIMMIN");
  dxf += dxfPair(10, "-50.0");
  dxf += dxfPair(20, "-50.0");
  dxf += dxfPair(9, "$LIMMAX");
  dxf += dxfPair(10, "50.0");
  dxf += dxfPair(20, "50.0");
  dxf += dxfPair(0, "ENDSEC");
  dxf += buildLayerTable(levelTags);
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "ENTITIES");

  // Site boundary on A-SITE (level-agnostic).
  const siteBoundary = compiledProject.site?.boundary_polygon || [];
  if (Array.isArray(siteBoundary) && siteBoundary.length >= 3) {
    dxf += drawPolyline(siteBoundary, "A-SITE", true);
  }
  // Buildable polygon (dashed surrogate via A-DIMS-style yellow).
  const buildablePolygon = compiledProject.site?.buildable_polygon || [];
  if (Array.isArray(buildablePolygon) && buildablePolygon.length >= 3) {
    dxf += drawPolyline(buildablePolygon, "A-SITE", true);
  }

  // North arrow at the top-left of the site bbox.
  let northX = 0;
  let northY = 0;
  if (Array.isArray(siteBoundary) && siteBoundary.length >= 3) {
    const xs = siteBoundary.map((p) => Number(p.x || 0));
    const ys = siteBoundary.map((p) => Number(p.y || 0));
    northX = Math.min(...xs) - 1.2;
    northY = Math.max(...ys) - 0.6;
  }
  dxf += drawNorthArrow(northX, northY);

  // Per-level entity emission.
  levels.forEach((level, index) => {
    const tag = levelTags[index];
    const inLevel = (entity) => entity.levelId === level.id;
    const slabs = (compiledProject.slabs || []).filter(inLevel);
    const walls = (compiledProject.walls || []).filter(inLevel);
    const rooms = (compiledProject.rooms || []).filter(inLevel);
    const openings = (compiledProject.openings || []).filter(inLevel);
    const stairs = (compiledProject.stairs || []).filter(inLevel);
    const columns = (compiledProject.columns || []).filter(inLevel);

    slabs.forEach((slab) => {
      dxf += drawPolyline(slab.polygon, levelLayerName("A-SLAB", tag), true);
    });
    walls.forEach((wall) => {
      const layer = wall.exterior
        ? levelLayerName("A-WALL-EXT", tag)
        : levelLayerName("A-WALL", tag);
      dxf += drawLine(wall.start, wall.end, layer);
    });
    columns.forEach((column) => {
      if (column?.position) {
        const x = Number(column.position.x || 0);
        const y = Number(column.position.y || 0);
        const half = Number(column.width_m || column.depth_m || 0.3) / 2;
        const layer = levelLayerName("A-COLU", tag);
        dxf += drawPolyline(
          [
            { x: x - half, y: y - half },
            { x: x + half, y: y - half },
            { x: x + half, y: y + half },
            { x: x - half, y: y + half },
          ],
          layer,
          true,
        );
      }
    });
    rooms.forEach((room) => {
      const roomLayer = levelLayerName("A-ROOM", tag);
      const areaLayer = levelLayerName("A-AREA", tag);
      dxf += drawPolyline(room.polygon, roomLayer, true);
      const bbox = room.bbox || {};
      const cx = Number((bbox.min_x + bbox.max_x) / 2 || 0);
      const cy = Number((bbox.min_y + bbox.max_y) / 2 || 0);
      dxf += drawText(cx, cy, room.name || room.type || "ROOM", areaLayer);
      dxf += drawText(
        cx,
        cy - 0.35,
        `${round(room.actual_area_m2 || room.target_area_m2 || 0, 1)} m2`,
        areaLayer,
        0.16,
      );
    });
    openings.forEach((opening) => {
      const position = opening.position_m || opening.position || { x: 0, y: 0 };
      const half = Number(opening.width_m || 0.9) / 2;
      const start = {
        x: Number(position.x || 0) - half,
        y: Number(position.y || 0),
      };
      const end = {
        x: Number(position.x || 0) + half,
        y: Number(position.y || 0),
      };
      const baseLayer =
        opening.type === "window" || opening.kind === "window"
          ? "A-WINDOW"
          : opening.type === "door" ||
              opening.kind === "door" ||
              opening.kind === "main_entrance"
            ? "A-DOOR"
            : "A-DOOR"; // unknown openings default to A-DOOR (more conservative than A-WINDOW)
      dxf += drawLine(start, end, levelLayerName(baseLayer, tag));
    });
    stairs.forEach((stair) => {
      const layer = levelLayerName("A-STAIR", tag);
      if (Array.isArray(stair.polygon) && stair.polygon.length >= 3) {
        dxf += drawPolyline(stair.polygon, layer, true);
      } else if (stair.start && stair.end) {
        dxf += drawLine(stair.start, stair.end, layer);
      }
    });
  });

  const footprint = compiledProject.footprint?.polygon || [];
  if (footprint.length) {
    dxf += drawPolyline(
      footprint,
      levelLayerName("A-WALL-EXT", levelTags[0] || "L00"),
      true,
    );
  }

  // Provenance metadata on a hidden A-METADATA layer (text below origin).
  const metadataLines = [
    `PROJECT: ${projectName}`,
    `GEOMETRY_HASH: ${compiledProject.geometryHash}`,
    sourceModelHash ? `SOURCE_MODEL_HASH: ${sourceModelHash}` : null,
    pipelineVersion ? `PIPELINE: ${pipelineVersion}` : null,
    `LEVELS: ${levels.length}`,
    `EXPORT_VERSION: dxf-archi-v2`,
  ].filter(Boolean);
  metadataLines.forEach((line, idx) => {
    dxf += drawText(0, -1.2 - idx * 0.4, line, "A-METADATA", 0.18);
  });

  dxf += dxfPair(0, "ENDSEC");
  dxf += dxfPair(0, "EOF");
  return dxf;
}

export function exportCompiledProjectToIFC({
  compiledProject,
  projectName = "ArchiAI Project",
  authorName = "ArchiAI",
  organizationName = "Architect AI Platform",
  sourceModelHash = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for IFC export.",
    );
  }

  let entity = 1;
  const next = () => entity++;
  const lines = [];
  const guidSeed = compiledProject.geometryHash;
  const guid = (suffix) => createIfcGuid(`${guidSeed}-${suffix}`);
  const safeName = (value) => String(value || "").replace(/'/g, "\\'");
  const safeProjectName = projectName.replace(/\s+/g, "_");

  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push(
    `FILE_DESCRIPTION(('ArchiAI Compiled Project export — geometry ${guidSeed}'),'2;1');`,
  );
  lines.push(
    `FILE_NAME('${safeProjectName}.ifc','1970-01-01T00:00:00',('${authorName}'),('${organizationName}'),'IFC4','CompiledProjectExportV2','');`,
  );
  lines.push("FILE_SCHEMA(('IFC4'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");

  // ===== shared geometry primitives ============================================
  const zeroPointId = next();
  lines.push(`#${zeroPointId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  const zAxisId = next();
  lines.push(`#${zAxisId}=IFCDIRECTION((0.,0.,1.));`);
  const xAxisId = next();
  lines.push(`#${xAxisId}=IFCDIRECTION((1.,0.,0.));`);
  const projectAxisId = next();
  lines.push(
    `#${projectAxisId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
  );

  // ===== units + context =======================================================
  const lengthUnitId = next();
  lines.push(`#${lengthUnitId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  const areaUnitId = next();
  lines.push(`#${areaUnitId}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  const volumeUnitId = next();
  lines.push(`#${volumeUnitId}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
  const planeAngleUnitId = next();
  lines.push(`#${planeAngleUnitId}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
  const unitsId = next();
  lines.push(
    `#${unitsId}=IFCUNITASSIGNMENT((#${lengthUnitId},#${areaUnitId},#${volumeUnitId},#${planeAngleUnitId}));`,
  );
  const contextId = next();
  lines.push(
    `#${contextId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${projectAxisId},$);`,
  );

  // ===== owner history (optional but expected by most BIM tools) ==============
  const personId = next();
  lines.push(
    `#${personId}=IFCPERSON($,'${safeName(authorName)}','${safeName(authorName)}',$,$,$,$,$);`,
  );
  const orgId = next();
  lines.push(
    `#${orgId}=IFCORGANIZATION($,'${safeName(organizationName)}','Architect AI Platform',$,$);`,
  );
  const personOrgId = next();
  lines.push(
    `#${personOrgId}=IFCPERSONANDORGANIZATION(#${personId},#${orgId},$);`,
  );
  const appId = next();
  lines.push(
    `#${appId}=IFCAPPLICATION(#${orgId},'compiled-project-export-v2','ArchiAI ProjectGraph IFC Exporter','ARCHIAI');`,
  );
  const ownerHistoryId = next();
  lines.push(
    `#${ownerHistoryId}=IFCOWNERHISTORY(#${personOrgId},#${appId},$,.NOCHANGE.,$,$,$,0);`,
  );

  // ===== project ==============================================================
  const projectId = next();
  lines.push(
    `#${projectId}=IFCPROJECT('${guid("project")}',#${ownerHistoryId},'${safeName(projectName)}','Compiled ProjectGraph vertical slice',$,$,$,(#${contextId}),#${unitsId});`,
  );

  // ===== site =================================================================
  const sitePlacementAxisId = next();
  lines.push(
    `#${sitePlacementAxisId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
  );
  const sitePlacementId = next();
  lines.push(
    `#${sitePlacementId}=IFCLOCALPLACEMENT($,#${sitePlacementAxisId});`,
  );
  const siteAreaM2 = Number(compiledProject.site?.area_m2 || 0);
  const siteId = next();
  lines.push(
    `#${siteId}=IFCSITE('${guid("site")}',#${ownerHistoryId},'Site',$,$,#${sitePlacementId},$,$,.ELEMENT.,$,$,${round(siteAreaM2, 3)},$,$);`,
  );

  // ===== building =============================================================
  const buildingPlacementAxisId = next();
  lines.push(
    `#${buildingPlacementAxisId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
  );
  const buildingPlacementId = next();
  lines.push(
    `#${buildingPlacementId}=IFCLOCALPLACEMENT(#${sitePlacementId},#${buildingPlacementAxisId});`,
  );
  const buildingId = next();
  lines.push(
    `#${buildingId}=IFCBUILDING('${guid("building")}',#${ownerHistoryId},'${safeName(projectName)}',$,$,#${buildingPlacementId},$,$,.ELEMENT.,$,$,$);`,
  );

  // ===== storeys ==============================================================
  const storeyByLevelId = new Map();
  const storeyIdsForRel = [];
  (compiledProject.levels || []).forEach((level, index) => {
    const pointId = next();
    lines.push(
      `#${pointId}=IFCCARTESIANPOINT((0.,0.,${round(level.elevation_m || 0, 3)}));`,
    );
    const axisPlacementId = next();
    lines.push(
      `#${axisPlacementId}=IFCAXIS2PLACEMENT3D(#${pointId},#${zAxisId},#${xAxisId});`,
    );
    const localPlacementId = next();
    lines.push(
      `#${localPlacementId}=IFCLOCALPLACEMENT(#${buildingPlacementId},#${axisPlacementId});`,
    );
    const storeyId = next();
    lines.push(
      `#${storeyId}=IFCBUILDINGSTOREY('${guid(`storey-${index}`)}',#${ownerHistoryId},'${safeName(level.name || `Level ${index}`)}',$,$,#${localPlacementId},$,$,.ELEMENT.,${round(level.elevation_m || 0, 3)});`,
    );
    storeyByLevelId.set(level.id, { storeyId, localPlacementId });
    storeyIdsForRel.push(storeyId);
  });

  // Aggregation: project → site → building → storeys
  const projectSiteRelId = next();
  lines.push(
    `#${projectSiteRelId}=IFCRELAGGREGATES('${guid("rel-project-site")}',#${ownerHistoryId},$,$,#${projectId},(#${siteId}));`,
  );
  const siteBuildingRelId = next();
  lines.push(
    `#${siteBuildingRelId}=IFCRELAGGREGATES('${guid("rel-site-building")}',#${ownerHistoryId},$,$,#${siteId},(#${buildingId}));`,
  );
  if (storeyIdsForRel.length > 0) {
    const buildingStoreyRelId = next();
    lines.push(
      `#${buildingStoreyRelId}=IFCRELAGGREGATES('${guid("rel-building-storeys")}',#${ownerHistoryId},$,$,#${buildingId},(${storeyIdsForRel.map((id) => `#${id}`).join(",")}));`,
    );
  }

  // ===== element placement helper ============================================
  const elementsByStorey = new Map(storeyIdsForRel.map((id) => [id, []]));
  function placeElementOnStorey(levelId, x, y) {
    const storey =
      storeyByLevelId.get(levelId) || storeyByLevelId.values().next().value;
    if (!storey) return null;
    const pointId = next();
    lines.push(
      `#${pointId}=IFCCARTESIANPOINT((${round(Number(x) || 0, 3)},${round(Number(y) || 0, 3)},0.));`,
    );
    const axisId = next();
    lines.push(
      `#${axisId}=IFCAXIS2PLACEMENT3D(#${pointId},#${zAxisId},#${xAxisId});`,
    );
    const placementId = next();
    lines.push(
      `#${placementId}=IFCLOCALPLACEMENT(#${storey.localPlacementId},#${axisId});`,
    );
    return { placementId, storeyId: storey.storeyId };
  }

  function recordElement(storeyId, elementId) {
    const arr = elementsByStorey.get(storeyId) || [];
    arr.push(elementId);
    elementsByStorey.set(storeyId, arr);
  }

  // ===== walls ================================================================
  (compiledProject.walls || []).forEach((wall, index) => {
    const start = wall.start || { x: 0, y: 0 };
    const placement = placeElementOnStorey(wall.levelId, start.x, start.y);
    if (!placement) return;
    const wallId = next();
    lines.push(
      `#${wallId}=IFCWALL('${guid(`wall-${index}`)}',#${ownerHistoryId},'${safeName(wall.id || `Wall ${index + 1}`)}',$,$,#${placement.placementId},$,$,${wall.exterior ? ".STANDARD." : ".STANDARD."});`,
    );
    recordElement(placement.storeyId, wallId);
  });

  // ===== slabs ================================================================
  (compiledProject.slabs || []).forEach((slab, index) => {
    const center = slab.bbox
      ? {
          x: (Number(slab.bbox.min_x || 0) + Number(slab.bbox.max_x || 0)) / 2,
          y: (Number(slab.bbox.min_y || 0) + Number(slab.bbox.max_y || 0)) / 2,
        }
      : { x: 0, y: 0 };
    const placement = placeElementOnStorey(slab.levelId, center.x, center.y);
    if (!placement) return;
    const slabId = next();
    lines.push(
      `#${slabId}=IFCSLAB('${guid(`slab-${index}`)}',#${ownerHistoryId},'${safeName(slab.id || `Slab ${index + 1}`)}',$,$,#${placement.placementId},$,$,.FLOOR.);`,
    );
    recordElement(placement.storeyId, slabId);
  });

  // ===== windows + doors ======================================================
  (compiledProject.openings || []).forEach((opening, index) => {
    const position = opening.position_m || opening.position || { x: 0, y: 0 };
    const placement = placeElementOnStorey(
      opening.levelId,
      position.x,
      position.y,
    );
    if (!placement) return;
    const isWindow = opening.type === "window" || opening.kind === "window";
    const isDoor =
      opening.type === "door" ||
      opening.kind === "door" ||
      opening.kind === "main_entrance";
    const width = Number(opening.width_m || 0.9);
    const height = Number(opening.head_height_m || (isWindow ? 1.2 : 2.1));
    const elementId = next();
    if (isWindow) {
      lines.push(
        `#${elementId}=IFCWINDOW('${guid(`window-${index}`)}',#${ownerHistoryId},'${safeName(opening.id || `Window ${index + 1}`)}',$,$,#${placement.placementId},$,$,${round(height, 3)},${round(width, 3)},.WINDOW.,.NOTDEFINED.,$);`,
      );
    } else if (isDoor || !isWindow) {
      lines.push(
        `#${elementId}=IFCDOOR('${guid(`door-${index}`)}',#${ownerHistoryId},'${safeName(opening.id || `Door ${index + 1}`)}',$,$,#${placement.placementId},$,$,${round(height, 3)},${round(width, 3)},.DOOR.,.NOTDEFINED.,$);`,
      );
    }
    recordElement(placement.storeyId, elementId);
  });

  // ===== stairs ===============================================================
  (compiledProject.stairs || []).forEach((stair, index) => {
    const center = stair.bbox
      ? {
          x:
            (Number(stair.bbox.min_x || 0) + Number(stair.bbox.max_x || 0)) / 2,
          y:
            (Number(stair.bbox.min_y || 0) + Number(stair.bbox.max_y || 0)) / 2,
        }
      : { x: 0, y: 0 };
    const placement = placeElementOnStorey(stair.levelId, center.x, center.y);
    if (!placement) return;
    const stairId = next();
    lines.push(
      `#${stairId}=IFCSTAIR('${guid(`stair-${index}`)}',#${ownerHistoryId},'${safeName(stair.id || `Stair ${index + 1}`)}',$,$,#${placement.placementId},$,$,.STRAIGHT_RUN_STAIR.);`,
    );
    recordElement(placement.storeyId, stairId);
  });

  // ===== rooms as IfcSpaces ===================================================
  (compiledProject.rooms || []).forEach((room, index) => {
    const center = room.bbox
      ? {
          x: (Number(room.bbox.min_x || 0) + Number(room.bbox.max_x || 0)) / 2,
          y: (Number(room.bbox.min_y || 0) + Number(room.bbox.max_y || 0)) / 2,
        }
      : { x: 0, y: 0 };
    const placement = placeElementOnStorey(room.levelId, center.x, center.y);
    if (!placement) return;
    const spaceId = next();
    lines.push(
      `#${spaceId}=IFCSPACE('${guid(`space-${index}`)}',#${ownerHistoryId},'${safeName(room.name || room.id || `Space ${index + 1}`)}',$,$,#${placement.placementId},$,$,.ELEMENT.,.INTERNAL.,${round(room.actual_area_m2 || room.target_area_m2 || 0, 3)});`,
    );
    recordElement(placement.storeyId, spaceId);
  });

  // ===== containment relations ===============================================
  for (const [storeyId, elementIds] of elementsByStorey.entries()) {
    if (elementIds.length === 0) continue;
    const relId = next();
    lines.push(
      `#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(`rel-storey-${storeyId}-elements`)}',#${ownerHistoryId},$,$,(${elementIds.map((id) => `#${id}`).join(",")}),#${storeyId});`,
    );
  }

  // ===== provenance comment ==================================================
  if (sourceModelHash) {
    lines.push(`/* SOURCE_MODEL_HASH: ${sourceModelHash} */`);
  }
  lines.push(`/* GEOMETRY_HASH: ${guidSeed} */`);
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  return lines.join("\n");
}

export function buildCostWorkbook({
  compiledProject,
  takeoff,
  projectName = "ArchiAI Project",
  qualityTier = "mid",
  region = "uk-average",
} = {}) {
  if (!compiledProject?.geometryHash || !takeoff?.items?.length) {
    throw new Error(
      "Compiled project and quantity takeoff are required for workbook export.",
    );
  }

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `${projectName} Cost Workbook`,
    Subject: "Architect AI Residential V2 Cost Workbook",
    Author: "ArchiAI Solution Ltd",
    CreatedDate: new Date(),
  };

  const qualityFactor =
    qualityTier === "premium" ? 1.15 : qualityTier === "baseline" ? 0.92 : 1;
  const regionFactor =
    region === "london" ? 1.14 : region === "northern" ? 0.94 : 1;

  const quantityRows = takeoff.items.map((item, index) => ({
    "#": index + 1,
    Category: item.category,
    Item: item.item,
    Unit: item.unit,
    Quantity: item.quantity,
  }));
  const ratesRows = takeoff.items.map((item) => {
    const baseRate =
      UK_RATE_TABLE[item.category]?.[item.item] ||
      UK_RATE_TABLE[item.category]?.default ||
      0;
    const unitRate = round(baseRate * qualityFactor * regionFactor, 2);
    return {
      Category: item.category,
      Item: item.item,
      Unit: item.unit,
      BaseRateGBP: round(baseRate, 2),
      AdjustedRateGBP: unitRate,
    };
  });
  const totalsRows = takeoff.items.map((item) => {
    const rateEntry = ratesRows.find((row) => row.Item === item.item);
    const lineTotal = round(
      item.quantity * Number(rateEntry?.AdjustedRateGBP || 0),
      2,
    );
    return {
      Category: item.category,
      Item: item.item,
      Quantity: item.quantity,
      Unit: item.unit,
      RateGBP: rateEntry?.AdjustedRateGBP || 0,
      LineTotalGBP: lineTotal,
    };
  });
  const grandTotal = round(
    totalsRows.reduce((sum, row) => sum + Number(row.LineTotalGBP || 0), 0),
    2,
  );

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      Project: projectName,
      GeometryHash: compiledProject.geometryHash,
      PipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
      QualityTier: qualityTier,
      Region: region,
      GrossFloorAreaM2: takeoff.summary?.grossFloorAreaM2 || 0,
      TotalGBP: grandTotal,
    },
  ]);
  const quantitiesSheet = XLSX.utils.json_to_sheet(quantityRows);
  const ratesSheet = XLSX.utils.json_to_sheet(ratesRows);
  const totalsSheet = XLSX.utils.json_to_sheet(totalsRows);
  const assumptionsSheet = XLSX.utils.json_to_sheet([
    { Assumption: "Market", Value: region },
    { Assumption: "Quality tier", Value: qualityTier },
    { Assumption: "Pricing basis", Value: "Internal UK residential table" },
    {
      Assumption: "Compiler authority",
      Value: compiledProject.metadata?.source || "compiled_project",
    },
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, quantitiesSheet, "Quantities");
  XLSX.utils.book_append_sheet(workbook, ratesSheet, "UnitRates");
  XLSX.utils.book_append_sheet(workbook, totalsSheet, "Totals");
  XLSX.utils.book_append_sheet(workbook, assumptionsSheet, "Assumptions");

  const workbookArray = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const manifest = createCostWorkbookManifest({
    geometryHash: compiledProject.geometryHash,
    pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
    tabs: workbook.SheetNames,
    assumptions: [
      "Internal UK residential rate table",
      `Quality factor ${qualityFactor}`,
      `Region factor ${regionFactor}`,
    ],
    totals: {
      totalGbp: grandTotal,
      grossFloorAreaM2: takeoff.summary?.grossFloorAreaM2 || 0,
    },
  });

  return {
    workbook,
    workbookArray,
    manifest,
    currency: "GBP",
    totalGbp: grandTotal,
  };
}

export default {
  exportCompiledProjectToDXF,
  exportCompiledProjectToIFC,
  buildCostWorkbook,
};
