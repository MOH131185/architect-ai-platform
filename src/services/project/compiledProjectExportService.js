import * as XLSX from "xlsx";
import {
  createCostWorkbookManifest,
  UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} from "./v2ProjectContracts.js";
import { buildCanonicalDrawingModelFromCompiledProject } from "../cad/canonicalDrawingModel.js";
import { exportCanonicalDrawingModelToDXF } from "../cad/canonicalDxfExporter.js";
import ukRateCardV1 from "../../data/costRateCards/uk_v1.json";

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

// Rate cards live in src/data/costRateCards/<id>.json. The residential UK
// card is loaded by default. Non-residential building types fall back to
// quantity-only mode (no inferred rates) — see resolveRateCard().
const RATE_CARDS = [ukRateCardV1];

const RESIDENTIAL_BUILDING_TYPES = new Set([
  "residential",
  "house",
  "apartment",
  "flat",
  "dwelling",
  "home",
  "residential_house",
  "residential_apartment",
  "uk_residential",
  "cottage",
  "bungalow",
  "detached",
  "semi_detached",
  "terrace",
  "terraced",
  "townhouse",
  "villa",
  "duplex",
]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveBuildingType(compiledProject) {
  return (
    compiledProject?.brief?.buildingType ||
    compiledProject?.brief?.building_type ||
    compiledProject?.metadata?.buildingType ||
    compiledProject?.metadata?.projectType ||
    compiledProject?.projectType ||
    null
  );
}

function resolveRateCard(buildingType) {
  const normalized = slugify(buildingType).replace(/-/g, "_");
  for (const card of RATE_CARDS) {
    if (normalized && card.buildingTypes?.[normalized]) {
      return { card, key: normalized };
    }
  }
  if (RESIDENTIAL_BUILDING_TYPES.has(normalized)) {
    const card = RATE_CARDS.find((c) => c.buildingTypes?.residential);
    if (card) return { card, key: "residential" };
  }
  // Default: no rate card matched. Workbook will run in quantity-only mode.
  return { card: null, key: null };
}

function resolveRate(rateCard, rateCardKey, category, item) {
  if (!rateCard || !rateCardKey) return null;
  const bucket = rateCard.buildingTypes?.[rateCardKey]?.rates?.[category];
  if (!bucket) return null;
  const value = bucket[item];
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return Number(value);
}

function levelLookup(compiledProject) {
  const map = new Map();
  for (const level of compiledProject?.levels || []) {
    map.set(level.id, level);
  }
  return map;
}

function aggregateMaterials(compiledProject) {
  const buckets = new Map();
  const push = (material, discipline, quantity, unit, source, evidence) => {
    if (!material) return;
    const key = `${discipline}::${material}::${unit}`;
    const existing = buckets.get(key);
    const numeric = Number(quantity);
    const safeQty = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    if (existing) {
      existing.quantity = round(existing.quantity + safeQty, 3);
      if (evidence && !existing.evidence) existing.evidence = evidence;
      return;
    }
    buckets.set(key, {
      material,
      discipline,
      quantity: round(safeQty, 3),
      unit,
      source,
      evidence: evidence || null,
    });
  };

  const levels = levelLookup(compiledProject);

  for (const wall of compiledProject?.walls || []) {
    const length = Number(wall.length_m || lineLength(wall.start, wall.end));
    const height = Number(
      wall.height_m || levels.get(wall.levelId)?.height_m || 3,
    );
    const area = Number.isFinite(length * height) ? length * height : 0;
    push(
      wall.material || wall.material_id,
      wall.exterior ? "envelope" : "internal",
      area,
      "m2",
      wall.exterior ? "wall_exterior" : "wall_internal",
      wall.material_evidence || null,
    );
  }
  for (const slab of compiledProject?.slabs || []) {
    const area = Number(slab.area_m2 || polygonArea(slab.polygon || []));
    push(
      slab.material,
      "structural",
      area,
      "m2",
      "slab",
      slab.material_evidence,
    );
  }
  for (const plane of compiledProject?.roof?.planes || []) {
    const area = Number(plane.area_m2 || polygonArea(plane.polygon || []));
    push(
      plane.material || compiledProject?.roof?.material,
      "envelope",
      area,
      "m2",
      "roof",
      plane.material_evidence ||
        compiledProject?.roof?.material_evidence ||
        null,
    );
  }
  return Array.from(buckets.values()).sort((a, b) =>
    `${a.discipline}|${a.material}`.localeCompare(
      `${b.discipline}|${b.material}`,
    ),
  );
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += Number(current.x || 0) * Number(next.y || 0);
    area -= Number(next.x || 0) * Number(current.y || 0);
  }
  return Math.abs(area) / 2;
}

export function exportCompiledProjectToDXF({
  compiledProject,
  projectName = "ArchiAI_Project",
  sourceModelHash = null,
  pipelineVersion = null,
  includeDetailDrawings = false,
  detailDrawingsEnabled = false,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for DXF export.",
    );
  }
  const canonicalDrawingModel = buildCanonicalDrawingModelFromCompiledProject({
    compiledProject,
    projectName,
    includeDetailDrawings:
      includeDetailDrawings === true ||
      detailDrawingsEnabled === true ||
      String(process.env.DETAIL_DRAWINGS_ENABLED || "").toLowerCase() ===
        "true",
  });
  return exportCanonicalDrawingModelToDXF({
    canonicalDrawingModel,
    sourceModelHash,
    pipelineVersion,
  });
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
  const wallCount = Array.isArray(compiledProject.walls)
    ? compiledProject.walls.length
    : 0;
  const levelCount = Array.isArray(compiledProject.levels)
    ? compiledProject.levels.length
    : 0;
  if (wallCount === 0 || levelCount === 0) {
    throw new Error(
      "IFC_GEOMETRY_INSUFFICIENT: compiled geometry has no walls or storeys.",
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
  projectAddress = null,
  pipelineVersion = UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} = {}) {
  if (!compiledProject?.geometryHash || !takeoff?.items?.length) {
    throw new Error(
      "Compiled project and quantity takeoff are required for workbook export.",
    );
  }

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `${projectName} Cost Workbook`,
    Subject: "Architect AI Compiled Project Cost Workbook",
    Author: "ArchiAI Solution Ltd",
  };

  const buildingType = resolveBuildingType(compiledProject);
  const { card: rateCard, key: rateCardKey } = resolveRateCard(buildingType);
  const qualityFactor =
    rateCard?.qualityFactors?.[qualityTier] ??
    (qualityTier === "premium" ? 1.15 : qualityTier === "baseline" ? 0.92 : 1);
  const regionFactor =
    rateCard?.regionFactors?.[region] ??
    (region === "london" ? 1.14 : region === "northern" ? 0.94 : 1);
  const rateCardMissing = !rateCard || !rateCardKey;
  const rateCardLabel = rateCardMissing
    ? `rate card not configured for ${buildingType || "unknown building type"} (${region})`
    : `${rateCard.id} v${rateCard.version}`;
  const jurisdictionLabel =
    compiledProject?.metadata?.jurisdictionPack?.id ||
    compiledProject?.jurisdictionPack?.id ||
    compiledProject?.countryCode ||
    null;

  // Stable, deterministic ordering for all derived rows.
  const sortedItems = [...takeoff.items].sort((a, b) => {
    const aKey = `${slugify(a.category)}|${slugify(a.item)}`;
    const bKey = `${slugify(b.category)}|${slugify(b.item)}`;
    return aKey.localeCompare(bKey);
  });

  const enriched = sortedItems.map((item, index) => {
    const itemCode =
      `${slugify(item.category)}-${slugify(item.item)}` || `item-${index + 1}`;
    const baseRate = resolveRate(
      rateCard,
      rateCardKey,
      item.category,
      item.item,
    );
    const adjustedRate =
      baseRate != null
        ? round(baseRate * qualityFactor * regionFactor, 2)
        : null;
    const subtotal =
      adjustedRate != null
        ? round(Number(item.quantity) * adjustedRate, 2)
        : null;
    return {
      itemCode,
      description: item.item,
      category: item.category,
      unit: item.unit,
      quantity: Number(item.quantity) || 0,
      sourceElement: item.metadata?.sourceElement || item.category,
      level: item.metadata?.level || "—",
      baseRate,
      adjustedRate,
      subtotal,
    };
  });

  const grandTotal = enriched.reduce(
    (sum, row) => sum + (row.subtotal != null ? row.subtotal : 0),
    0,
  );
  const totalEstimatedCost = rateCardMissing ? null : round(grandTotal, 2);

  // ===== Summary ============================================================
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Field", "Value"],
    ["Project Name", projectName],
    ["Address", projectAddress || "—"],
    ["Jurisdiction", jurisdictionLabel || "—"],
    ["Building Type", buildingType || "—"],
    ["Geometry Hash", compiledProject.geometryHash],
    ["Pipeline Version", pipelineVersion],
    ["Total GIA (m²)", Number(takeoff.summary?.grossFloorAreaM2 || 0)],
    [
      "Total Estimated Cost (GBP)",
      totalEstimatedCost != null ? totalEstimatedCost : "rate card missing",
    ],
    ["Rate Card", rateCardLabel],
    ["Quality Tier", qualityTier],
    ["Region", region],
    ["Currency", "GBP"],
    [
      "Disclaimer",
      rateCardMissing
        ? "Preliminary estimate only — not a contractor quotation. No rate card configured for this building type; cost columns are unavailable."
        : `Preliminary estimate only — not a contractor quotation. Rates from ${rateCardLabel}.`,
    ],
  ]);

  // ===== Quantity Takeoff ===================================================
  const quantityTakeoffRows = enriched.map((row) => ({
    "Item Code": row.itemCode,
    Description: row.description,
    "Discipline/Category": row.category,
    Quantity: row.quantity,
    Unit: row.unit,
    "Source Element": row.sourceElement,
    Level: row.level,
    "Geometry Hash": compiledProject.geometryHash,
  }));
  const quantityTakeoffSheet = XLSX.utils.json_to_sheet(quantityTakeoffRows);

  // ===== Cost Estimate =====================================================
  const costEstimateRows = enriched.map((row) => ({
    "Item Code": row.itemCode,
    Description: row.description,
    Quantity: row.quantity,
    Unit: row.unit,
    "Rate (GBP)": row.adjustedRate != null ? row.adjustedRate : "—",
    "Subtotal (GBP)": row.subtotal != null ? row.subtotal : "—",
    "Rate Source": rateCardMissing
      ? "rate card missing"
      : `${rateCard.id} v${rateCard.version} (${rateCardKey})`,
    Confidence: rateCardMissing
      ? "n/a"
      : rateCard.buildingTypes?.[rateCardKey]?.confidence || "medium",
    Assumptions: rateCardMissing
      ? "No rate card configured for this building type."
      : `Quality x${qualityFactor}, region x${regionFactor}.`,
  }));
  const costEstimateSheet = XLSX.utils.json_to_sheet(costEstimateRows);

  // ===== Spaces & Areas =====================================================
  const levelMap = levelLookup(compiledProject);
  const spaceRows = [...(compiledProject.rooms || [])]
    .map((room, index) => ({
      "Space ID": room.id || `space-${index + 1}`,
      Name: room.name || `Space ${index + 1}`,
      "Type/Category": room.type || room.category || room.usage || "general",
      Level: levelMap.get(room.levelId)?.name || room.levelId || "—",
      "Area (m²)": round(
        Number(
          room.actual_area_m2 ||
            room.target_area_m2 ||
            polygonArea(room.polygon || []),
        ) || 0,
        2,
      ),
    }))
    .sort((a, b) => String(a["Space ID"]).localeCompare(String(b["Space ID"])));
  const spacesSheet = XLSX.utils.json_to_sheet(
    spaceRows.length
      ? spaceRows
      : [
          {
            "Space ID": "—",
            Name: "—",
            "Type/Category": "—",
            Level: "—",
            "Area (m²)": 0,
          },
        ],
  );

  // ===== Materials ==========================================================
  const materialEntries = aggregateMaterials(compiledProject);
  const materialRows = materialEntries.length
    ? materialEntries.map((entry) => ({
        Material: entry.material,
        Discipline: entry.discipline,
        "Area / Quantity": entry.quantity,
        Unit: entry.unit,
        Source: entry.source,
        "Jurisdiction Evidence":
          entry.evidence?.summary ||
          entry.evidence?.id ||
          (entry.evidence ? "see compiled project" : "—"),
      }))
    : [
        {
          Material: "—",
          Discipline: "—",
          "Area / Quantity": 0,
          Unit: "—",
          Source: "—",
          "Jurisdiction Evidence": "No material data on compiled project.",
        },
      ];
  const materialsSheet = XLSX.utils.json_to_sheet(materialRows);

  // ===== Assumptions & Exclusions ==========================================
  const assumptionsExclusionsRows = [
    {
      Section: "Assumptions",
      Detail: "Preliminary estimate only — not a contractor quotation.",
    },
    {
      Section: "Assumptions",
      Detail: `Rate card: ${rateCardLabel}.`,
    },
    {
      Section: "Assumptions",
      Detail: `Quality factor ${qualityFactor}, region factor ${regionFactor}.`,
    },
    {
      Section: "Assumptions",
      Detail:
        "Quantities derived deterministically from compiled project geometry — they are indicative early-stage takeoffs and not measured site quantities.",
    },
    { Section: "Exclusions", Detail: "VAT excluded." },
    {
      Section: "Exclusions",
      Detail: "Professional fees excluded unless explicitly included.",
    },
    {
      Section: "Exclusions",
      Detail: "Contingency: 0% (apply downstream as appropriate).",
    },
    {
      Section: "Exclusions",
      Detail:
        "Local authority / statutory fees, planning fees, and CIL excluded unless configured.",
    },
    {
      Section: "Exclusions",
      Detail:
        "Abnormals (ground conditions, demolition, infrastructure) excluded.",
    },
    {
      Section: "Exclusions",
      Detail:
        "Furniture, fittings & equipment (FF&E) excluded unless itemised.",
    },
  ];
  const assumptionsExclusionsSheet = XLSX.utils.json_to_sheet(
    assumptionsExclusionsRows,
  );

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(
    workbook,
    quantityTakeoffSheet,
    "Quantity Takeoff",
  );
  XLSX.utils.book_append_sheet(workbook, costEstimateSheet, "Cost Estimate");
  XLSX.utils.book_append_sheet(workbook, spacesSheet, "Spaces & Areas");
  XLSX.utils.book_append_sheet(workbook, materialsSheet, "Materials");
  XLSX.utils.book_append_sheet(
    workbook,
    assumptionsExclusionsSheet,
    "Assumptions & Exclusions",
  );

  const workbookArray = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const manifest = createCostWorkbookManifest({
    geometryHash: compiledProject.geometryHash,
    pipelineVersion,
    tabs: workbook.SheetNames,
    assumptions: [
      `Rate card: ${rateCardLabel}`,
      `Quality factor ${qualityFactor}`,
      `Region factor ${regionFactor}`,
      "Preliminary estimate only — not a contractor quotation",
    ],
    totals: {
      totalGbp: totalEstimatedCost != null ? totalEstimatedCost : null,
      grossFloorAreaM2: takeoff.summary?.grossFloorAreaM2 || 0,
    },
  });

  return {
    workbook,
    workbookArray,
    manifest,
    currency: "GBP",
    totalGbp: totalEstimatedCost,
    rateCard: rateCardMissing
      ? null
      : { id: rateCard.id, version: rateCard.version, key: rateCardKey },
    rateCardMissing,
  };
}

export default {
  exportCompiledProjectToDXF,
  exportCompiledProjectToIFC,
  buildCostWorkbook,
};
