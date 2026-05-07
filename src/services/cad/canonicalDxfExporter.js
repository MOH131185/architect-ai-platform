import {
  CANONICAL_DRAWING_MODEL_VERSION,
  validateCanonicalDrawingModel,
} from "./canonicalDrawingModel.js";

const DXF_EXPORT_VERSION = "canonical-drawing-dxf-v1";

const EXPORT_LAYER_OVERRIDES = Object.freeze([
  { name: "A-NORTH", color: 7, lineweight: 25, linetype: "CONTINUOUS" },
  { name: "A-METADATA", color: 9, lineweight: 13, linetype: "CONTINUOUS" },
  { name: "A-AREA", color: 8, lineweight: 13, linetype: "CONTINUOUS" },
  { name: "A-ANNO", color: 7, lineweight: 18, linetype: "CONTINUOUS" },
  { name: "A-SLAB", color: 3, lineweight: 25, linetype: "CONTINUOUS" },
  { name: "A-COLU", color: 1, lineweight: 50, linetype: "CONTINUOUS" },
]);

const PER_LEVEL_COMPAT_LAYERS = Object.freeze([
  "A-WALL",
  "A-WALL-EXT",
  "A-DOOR",
  "A-WINDOW",
  "A-STAIR",
  "A-ROOM",
  "A-AREA",
  "A-DIMS",
  "A-ANNO",
  "A-HATCH",
  "A-SLAB",
  "A-COLU",
]);

function round(value, precision = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function dxfPair(code, value) {
  return `  ${code}\n${value}\n`;
}

function dxfText(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "\\P")
    .replace(/[{}]/g, "");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function point(value = {}) {
  return {
    x: round(value.x),
    y: round(value.y),
    z: round(value.z),
  };
}

function levelTagFromEntity(entity = {}) {
  const candidates = [
    entity.levelId,
    entity.level_id,
    entity.metadata?.levelId,
    entity.metadata?.level_id,
    entity.viewId,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const match = String(candidate).match(/(?:level-|L)?(\d+)/i);
    if (match) {
      return `L${String(Number(match[1])).padStart(2, "0")}`;
    }
  }
  if (String(entity.viewId || "").includes("ground")) return "L00";
  return "L00";
}

function exportLayerName(entity = {}) {
  const baseLayer = String(entity.layer || "A-ANNO").toUpperCase();
  const levelTag = levelTagFromEntity(entity);
  if (entity.viewType === "floor_plan") {
    if (baseLayer === "S-SLAB") return `${levelTag}-A-SLAB`;
    if (baseLayer === "S-COLUMN") return `${levelTag}-A-COLU`;
    if (baseLayer === "A-TEXT" && entity.metadata?.role === "room_label") {
      return `${levelTag}-A-AREA`;
    }
    if (baseLayer === "A-TEXT") return `${levelTag}-A-ANNO`;
    if (baseLayer.startsWith("A-")) return `${levelTag}-${baseLayer}`;
  }
  return baseLayer;
}

function collectLevelTags(model = {}) {
  const tags = new Set(["L00"]);
  toArray(model.modelSpace?.entities).forEach((entity) => {
    if (entity.viewType === "floor_plan") {
      tags.add(levelTagFromEntity(entity));
    }
  });
  return [...tags].sort();
}

function layerMetadataFor(name, model = {}) {
  const baseName = String(name || "").replace(/^L\d{2}-/, "");
  const layer =
    toArray(model.layers).find((entry) => entry.name === name) ||
    toArray(model.layers).find((entry) => entry.name === baseName) ||
    EXPORT_LAYER_OVERRIDES.find((entry) => entry.name === name) ||
    EXPORT_LAYER_OVERRIDES.find((entry) => entry.name === baseName) ||
    {};
  return {
    name,
    color: Number.isFinite(Number(layer.color)) ? Number(layer.color) : 7,
    lineweight: Number.isFinite(Number(layer.lineweight))
      ? Number(layer.lineweight)
      : 18,
    linetype: layer.linetype || "CONTINUOUS",
  };
}

function collectLayerNames(model = {}) {
  const names = new Set();
  toArray(model.layers).forEach((layer) => {
    if (layer?.name) names.add(layer.name);
  });
  EXPORT_LAYER_OVERRIDES.forEach((layer) => names.add(layer.name));
  collectLevelTags(model).forEach((tag) => {
    PER_LEVEL_COMPAT_LAYERS.forEach((baseLayer) =>
      names.add(`${tag}-${baseLayer}`),
    );
  });
  toArray(model.modelSpace?.entities).forEach((entity) => {
    names.add(exportLayerName(entity));
  });
  names.add("A-TITLE");
  names.add("A-SITE");
  names.add("A-TEXT");
  names.add("A-METADATA");
  return [...names].sort();
}

function writeHeaderSection(model = {}) {
  const insunits = model.units === "meters" ? "6" : "0";
  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "HEADER");
  dxf += dxfPair(9, "$ACADVER");
  dxf += dxfPair(1, "AC1024");
  dxf += dxfPair(9, "$INSUNITS");
  dxf += dxfPair(70, insunits);
  dxf += dxfPair(9, "$LIMMIN");
  dxf += dxfPair(10, "-50.0");
  dxf += dxfPair(20, "-50.0");
  dxf += dxfPair(9, "$LIMMAX");
  dxf += dxfPair(10, "50.0");
  dxf += dxfPair(20, "50.0");
  dxf += dxfPair(0, "ENDSEC");
  return dxf;
}

function writeTablesSection(model = {}) {
  const layerNames = collectLayerNames(model);
  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "TABLES");
  dxf += dxfPair(0, "TABLE");
  dxf += dxfPair(2, "LTYPE");
  dxf += dxfPair(70, toArray(model.linetypes).length || 1);
  toArray(model.linetypes).forEach((linetype) => {
    dxf += dxfPair(0, "LTYPE");
    dxf += dxfPair(2, linetype.name || "CONTINUOUS");
    dxf += dxfPair(70, 0);
    dxf += dxfPair(3, linetype.name || "CONTINUOUS");
    dxf += dxfPair(72, 65);
    dxf += dxfPair(73, toArray(linetype.pattern).length);
    dxf += dxfPair(
      40,
      toArray(linetype.pattern).reduce(
        (sum, value) => sum + Math.abs(Number(value) || 0),
        0,
      ),
    );
    toArray(linetype.pattern).forEach((value) => {
      dxf += dxfPair(49, round(value));
      dxf += dxfPair(74, 0);
    });
  });
  dxf += dxfPair(0, "ENDTAB");
  dxf += dxfPair(0, "TABLE");
  dxf += dxfPair(2, "LAYER");
  dxf += dxfPair(70, layerNames.length);
  layerNames.forEach((name) => {
    const layer = layerMetadataFor(name, model);
    dxf += dxfPair(0, "LAYER");
    dxf += dxfPair(2, layer.name);
    dxf += dxfPair(70, 0);
    dxf += dxfPair(62, layer.color);
    dxf += dxfPair(6, layer.linetype);
    dxf += dxfPair(370, layer.lineweight);
  });
  dxf += dxfPair(0, "ENDTAB");
  dxf += dxfPair(0, "ENDSEC");
  return dxf;
}

function writeBlockEntity(block = {}) {
  let dxf = "";
  dxf += dxfPair(0, "BLOCK");
  dxf += dxfPair(8, "A-TITLE");
  dxf += dxfPair(2, block.name || "BLOCK");
  dxf += dxfPair(70, 0);
  dxf += dxfPair(10, 0);
  dxf += dxfPair(20, 0);
  dxf += dxfPair(30, 0);
  toArray(block.entities).forEach((entity) => {
    dxf += writeEntity(entity, {
      inBlock: true,
      fallbackLayer: entity.layer || "A-TITLE",
    });
  });
  dxf += dxfPair(0, "ENDBLK");
  dxf += dxfPair(8, "A-TITLE");
  return dxf;
}

function writeBlocksSection(model = {}) {
  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "BLOCKS");
  toArray(model.blocks).forEach((block) => {
    dxf += writeBlockEntity(block);
  });
  dxf += dxfPair(0, "ENDSEC");
  return dxf;
}

function writePolyline(entity = {}, layerName) {
  const points = toArray(entity.geometry?.points);
  if (points.length < 2) return "";
  let dxf = "";
  dxf += dxfPair(0, "LWPOLYLINE");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(90, points.length);
  dxf += dxfPair(70, entity.geometry?.closed === false ? 0 : 1);
  points.forEach((rawPoint) => {
    const p = point(rawPoint);
    dxf += dxfPair(10, p.x);
    dxf += dxfPair(20, p.y);
  });
  return dxf;
}

function writeLine(entity = {}, layerName) {
  const start = point(entity.geometry?.start);
  const end = point(entity.geometry?.end);
  let dxf = "";
  dxf += dxfPair(0, "LINE");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(10, start.x);
  dxf += dxfPair(20, start.y);
  dxf += dxfPair(30, start.z);
  dxf += dxfPair(11, end.x);
  dxf += dxfPair(21, end.y);
  dxf += dxfPair(31, end.z);
  return dxf;
}

function writeText(entity = {}, layerName) {
  const p = point(entity.geometry?.point);
  let dxf = "";
  dxf += dxfPair(0, "TEXT");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(10, p.x);
  dxf += dxfPair(20, p.y);
  dxf += dxfPair(40, round(entity.geometry?.height || 0.22));
  dxf += dxfPair(1, dxfText(entity.geometry?.text));
  dxf += dxfPair(7, entity.geometry?.styleName || "ARCH_BODY");
  return dxf;
}

function writeMText(entity = {}, layerName) {
  const p = point(entity.geometry?.point);
  let dxf = "";
  dxf += dxfPair(0, "MTEXT");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(10, p.x);
  dxf += dxfPair(20, p.y);
  dxf += dxfPair(40, round(entity.geometry?.height || 0.22));
  dxf += dxfPair(1, dxfText(entity.geometry?.text));
  dxf += dxfPair(7, entity.geometry?.styleName || "ARCH_BODY");
  return dxf;
}

function writeInsert(entity = {}, layerName) {
  const p = point(entity.geometry?.point);
  let dxf = "";
  dxf += dxfPair(0, "INSERT");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(2, entity.geometry?.blockName || "BLOCK");
  dxf += dxfPair(10, p.x);
  dxf += dxfPair(20, p.y);
  dxf += dxfPair(41, round(entity.geometry?.scale || 1));
  dxf += dxfPair(42, round(entity.geometry?.scale || 1));
  dxf += dxfPair(50, round(entity.geometry?.rotation || 0));
  return dxf;
}

function writeDimension(entity = {}, layerName) {
  const start = point(entity.geometry?.start);
  const end = point(entity.geometry?.end);
  const offset = point(entity.geometry?.offset);
  let dxf = "";
  dxf += dxfPair(0, "DIMENSION");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(10, offset.x);
  dxf += dxfPair(20, offset.y);
  dxf += dxfPair(11, offset.x);
  dxf += dxfPair(21, offset.y);
  dxf += dxfPair(13, start.x);
  dxf += dxfPair(23, start.y);
  dxf += dxfPair(14, end.x);
  dxf += dxfPair(24, end.y);
  dxf += dxfPair(70, 32);
  dxf += dxfPair(1, dxfText(entity.geometry?.text));
  dxf += dxfPair(3, entity.geometry?.styleName || "ARCH_100");
  return dxf;
}

function writeHatch(entity = {}, layerName) {
  const boundary = toArray(entity.geometry?.boundary);
  if (boundary.length < 3) return "";
  let dxf = "";
  dxf += dxfPair(0, "HATCH");
  dxf += dxfPair(8, layerName);
  dxf += dxfPair(10, 0);
  dxf += dxfPair(20, 0);
  dxf += dxfPair(30, 0);
  dxf += dxfPair(2, entity.geometry?.pattern || "SOLID");
  dxf += dxfPair(70, 0);
  dxf += dxfPair(71, 0);
  dxf += dxfPair(91, 1);
  dxf += dxfPair(92, 2);
  dxf += dxfPair(72, 1);
  dxf += dxfPair(73, 1);
  dxf += dxfPair(93, boundary.length);
  boundary.forEach((rawPoint) => {
    const p = point(rawPoint);
    dxf += dxfPair(10, p.x);
    dxf += dxfPair(20, p.y);
  });
  dxf += dxfPair(97, 0);
  dxf += dxfPair(75, 0);
  dxf += dxfPair(76, 1);
  return dxf;
}

function writeEntity(entity = {}, options = {}) {
  const layerName = options.fallbackLayer || exportLayerName(entity);
  switch (String(entity.type || "").toUpperCase()) {
    case "LWPOLYLINE":
      return writePolyline(entity, layerName);
    case "LINE":
      return writeLine(entity, layerName);
    case "TEXT":
      return writeText(entity, layerName);
    case "MTEXT":
      return writeMText(entity, layerName);
    case "INSERT":
      return writeInsert(entity, layerName);
    case "DIMENSION":
      return writeDimension(entity, layerName);
    case "HATCH":
      return writeHatch(entity, layerName);
    default:
      return "";
  }
}

function metadataTextEntity(text, index) {
  return {
    type: "TEXT",
    layer: "A-METADATA",
    geometry: {
      point: { x: 0, y: -1.2 - index * 0.4 },
      height: 0.18,
      text,
      styleName: "ARCH_BODY",
    },
  };
}

function northArrowEntities(model = {}) {
  const extents = model.modelSpace?.extents || {};
  const x = Number(extents.min_x || 0) - 1.2;
  const y = Number(extents.max_y || 0) - 0.6;
  return [
    {
      type: "LINE",
      layer: "A-NORTH",
      geometry: { start: { x, y }, end: { x, y: y + 0.6 } },
    },
    {
      type: "LINE",
      layer: "A-NORTH",
      geometry: { start: { x, y: y + 0.6 }, end: { x: x - 0.18, y: y - 0.05 } },
    },
    {
      type: "LINE",
      layer: "A-NORTH",
      geometry: { start: { x, y: y + 0.6 }, end: { x: x + 0.18, y: y - 0.05 } },
    },
    {
      type: "TEXT",
      layer: "A-NORTH",
      geometry: { point: { x, y: y + 0.75 }, height: 0.25, text: "N" },
    },
  ];
}

function titleBlockInsertEntities(model = {}) {
  return toArray(model.paperSpace?.sheets).map((sheet, index) => ({
    type: "INSERT",
    layer: "A-TITLE",
    geometry: {
      blockName: sheet.titleBlock || "TITLE_BLOCK_A1",
      point: { x: 0, y: 20 + index * 60 },
      scale: 1,
      rotation: 0,
    },
  }));
}

function writeEntitiesSection({
  model,
  sourceModelHash = null,
  pipelineVersion = null,
} = {}) {
  const metadataLines = [
    `PROJECT: ${model.sheetMetadata?.projectName || "Architect AI Project"}`,
    `GEOMETRY_HASH: ${model.geometryHash}`,
    `SOURCE_PROJECT_GRAPH_HASH: ${model.sourceProjectGraphHash}`,
    sourceModelHash ? `SOURCE_MODEL_HASH: ${sourceModelHash}` : null,
    pipelineVersion ? `PIPELINE: ${pipelineVersion}` : null,
    `EXPORT_VERSION: ${DXF_EXPORT_VERSION}`,
    `DRAWING_MODEL_VERSION: ${model.schema_version}`,
  ].filter(Boolean);
  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "ENTITIES");
  toArray(model.modelSpace?.entities).forEach((entity) => {
    dxf += writeEntity(entity);
  });
  northArrowEntities(model).forEach((entity) => {
    dxf += writeEntity(entity, { fallbackLayer: entity.layer });
  });
  titleBlockInsertEntities(model).forEach((entity) => {
    dxf += writeEntity(entity, { fallbackLayer: entity.layer });
  });
  metadataLines.forEach((line, index) => {
    dxf += writeEntity(metadataTextEntity(line, index), {
      fallbackLayer: "A-METADATA",
    });
  });
  dxf += dxfPair(0, "ENDSEC");
  return dxf;
}

function writeObjectsSection(model = {}) {
  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "OBJECTS");
  toArray(model.paperSpace?.sheets).forEach((sheet) => {
    dxf += dxfPair(0, "LAYOUT");
    dxf += dxfPair(1, sheet.sheetId || sheet.drawingNumber || "Sheet");
    dxf += dxfPair(70, 1);
    dxf += dxfPair(71, 1);
    dxf += dxfPair(10, 0);
    dxf += dxfPair(20, 0);
  });
  dxf += dxfPair(0, "ENDSEC");
  return dxf;
}

export function exportCanonicalDrawingModelToDXF({
  canonicalDrawingModel,
  sourceModelHash = null,
  pipelineVersion = null,
  strictValidation = true,
} = {}) {
  if (!canonicalDrawingModel) {
    throw new Error("canonicalDrawingModel is required for DXF export.");
  }
  if (
    canonicalDrawingModel.schema_version !== CANONICAL_DRAWING_MODEL_VERSION
  ) {
    throw new Error(
      "CanonicalDrawingModel schema_version is required for DXF export.",
    );
  }
  const validation = validateCanonicalDrawingModel(canonicalDrawingModel);
  if (strictValidation && !validation.valid) {
    const codes = validation.errors.map((error) => error.code).join(", ");
    throw new Error(`CanonicalDrawingModel failed DXF validation: ${codes}`);
  }
  let dxf = "";
  dxf += writeHeaderSection(canonicalDrawingModel);
  dxf += writeTablesSection(canonicalDrawingModel);
  dxf += writeBlocksSection(canonicalDrawingModel);
  dxf += writeEntitiesSection({
    model: canonicalDrawingModel,
    sourceModelHash,
    pipelineVersion,
  });
  dxf += writeObjectsSection(canonicalDrawingModel);
  dxf += dxfPair(0, "EOF");
  return dxf;
}

export default {
  exportCanonicalDrawingModelToDXF,
};
