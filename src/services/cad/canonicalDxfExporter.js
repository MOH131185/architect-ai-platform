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

function stableHexHandle(...parts) {
  const input = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(6, "0");
}

function point(value = {}) {
  return {
    x: round(value.x),
    y: round(value.y),
    z: round(value.z),
  };
}

function writeSpaceMarkers(entity = {}) {
  let dxf = "";
  if (entity.paperSpace === true) {
    dxf += dxfPair(67, 1);
  }
  if (entity.paperSpaceLayout) {
    dxf += dxfPair(410, entity.paperSpaceLayout);
  }
  return dxf;
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
  dxf += writeSpaceMarkers(entity);
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
  dxf += writeSpaceMarkers(entity);
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
  dxf += writeSpaceMarkers(entity);
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
  dxf += writeSpaceMarkers(entity);
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
  dxf += writeSpaceMarkers(entity);
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
  dxf += writeSpaceMarkers(entity);
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

function writeViewport(entity = {}, layerName) {
  const p = point(entity.geometry?.center);
  const viewCenter = point(entity.geometry?.viewCenter);
  let dxf = "";
  dxf += dxfPair(0, "VIEWPORT");
  dxf += dxfPair(5, entity.handle || stableHexHandle("viewport", entity.id));
  if (entity.ownerHandle) {
    dxf += dxfPair(330, entity.ownerHandle);
  }
  dxf += dxfPair(100, "AcDbEntity");
  dxf += dxfPair(8, layerName);
  dxf += writeSpaceMarkers(entity);
  dxf += dxfPair(100, "AcDbViewport");
  dxf += dxfPair(10, p.x);
  dxf += dxfPair(20, p.y);
  dxf += dxfPair(30, 0);
  dxf += dxfPair(40, round(entity.geometry?.width || 0));
  dxf += dxfPair(41, round(entity.geometry?.height || 0));
  dxf += dxfPair(68, entity.geometry?.status || 1);
  dxf += dxfPair(69, entity.geometry?.viewportNumber || 1);
  dxf += dxfPair(12, viewCenter.x);
  dxf += dxfPair(22, viewCenter.y);
  dxf += dxfPair(45, round(entity.geometry?.viewHeight || 1));
  dxf += dxfPair(51, 0);
  dxf += dxfPair(90, 0);
  dxf += dxfPair(1, dxfText(entity.geometry?.name || entity.id || "VIEWPORT"));
  return dxf;
}

function writeHatch(entity = {}, layerName) {
  const boundary = toArray(entity.geometry?.boundary);
  if (boundary.length < 3) return "";
  let dxf = "";
  dxf += dxfPair(0, "HATCH");
  dxf += dxfPair(8, layerName);
  dxf += writeSpaceMarkers(entity);
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
    case "VIEWPORT":
      return writeViewport(entity, layerName);
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
      type: "INSERT",
      layer: "A-NORTH",
      geometry: {
        blockName: "NORTH_ARROW",
        point: { x, y },
        scale: 0.05,
        rotation: 0,
      },
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

function paperSpaceEntity(entity = {}, sheet = {}) {
  return {
    ...entity,
    paperSpace: true,
    paperSpaceLayout: sheet.sheetId || sheet.sheetNumber || "Layout1",
  };
}

function paperSpaceTextEntity(sheet, text, x, y, height = 3.2) {
  return paperSpaceEntity(
    {
      type: "TEXT",
      layer: "A-TITLE",
      geometry: {
        point: { x, y },
        height,
        text,
        styleName: "ARCH_BODY",
      },
    },
    sheet,
  );
}

function paperSpacePolylineEntity(sheet, points, layer = "A-TITLE") {
  return paperSpaceEntity(
    {
      type: "LWPOLYLINE",
      layer,
      geometry: {
        points,
        closed: true,
      },
    },
    sheet,
  );
}

function paperSpaceInsertEntity(sheet, blockName, x, y, scale = 1) {
  return paperSpaceEntity(
    {
      type: "INSERT",
      layer: "A-TITLE",
      geometry: {
        blockName,
        point: { x, y },
        scale,
        rotation: 0,
      },
    },
    sheet,
  );
}

function nativeViewportEntity(sheet, viewport = {}, viewportIndex = 0) {
  const nativeViewport = viewport.nativeViewport || {};
  const viewportSize = viewport.size || { width: 520, height: 360 };
  const origin = viewport.origin || { x: 30, y: 60 };
  return paperSpaceEntity(
    {
      id: viewport.viewportId || `viewport-${viewportIndex + 1}`,
      type: "VIEWPORT",
      layer: "A-TITLE",
      handle:
        nativeViewport.viewportHandle ||
        stableHexHandle("viewport", sheet.sheetId, viewport.viewportId),
      ownerHandle: sheet.nativeLayout?.blockRecordHandle,
      geometry: {
        name: viewport.viewId || viewport.viewportId || "VIEWPORT",
        center: nativeViewport.center || {
          x: origin.x + viewportSize.width / 2,
          y: origin.y + viewportSize.height / 2,
        },
        width: nativeViewport.width || viewportSize.width,
        height: nativeViewport.height || viewportSize.height,
        viewCenter: nativeViewport.viewCenter || { x: 0, y: 0 },
        viewHeight: nativeViewport.viewHeight || 1,
        viewportNumber: viewportIndex + 1,
        status: 1,
      },
    },
    sheet,
  );
}

function buildPaperSpaceEntities(model = {}) {
  const entities = [];
  toArray(model.paperSpace?.sheets).forEach((sheet, sheetIndex) => {
    const size =
      sheet.paperSizeMm ||
      (sheet.orientation === "portrait"
        ? { width: 594, height: 841 }
        : { width: 841, height: 594 });
    const width = Number(size.width || 841);
    const height = Number(size.height || 594);
    const layoutName =
      sheet.sheetId || sheet.sheetNumber || `Sheet-${sheetIndex + 1}`;
    const titleOriginY = 24;
    entities.push(
      paperSpacePolylineEntity(sheet, [
        { x: 10, y: 10 },
        { x: width - 10, y: 10 },
        { x: width - 10, y: height - 10 },
        { x: 10, y: height - 10 },
      ]),
    );
    entities.push(
      paperSpaceInsertEntity(
        sheet,
        sheet.titleBlock || "TITLE_BLOCK_A1",
        width - 200,
        15,
        1,
      ),
    );
    entities.push(
      paperSpaceTextEntity(
        sheet,
        `PAPER_SPACE_LAYOUT: ${layoutName}`,
        18,
        height - 20,
        2.6,
      ),
      paperSpaceTextEntity(
        sheet,
        `DRAWING_NUMBER: ${sheet.sheetNumber || sheet.drawingNumber}`,
        width - 190,
        60,
        3.2,
      ),
      paperSpaceTextEntity(
        sheet,
        `TITLE: ${sheet.title}`,
        width - 190,
        52,
        3.2,
      ),
      paperSpaceTextEntity(
        sheet,
        `SCALE: ${sheet.scale}`,
        width - 190,
        44,
        2.8,
      ),
      paperSpaceTextEntity(
        sheet,
        `REVISION: ${sheet.revision}`,
        width - 190,
        36,
        2.8,
      ),
      paperSpaceTextEntity(
        sheet,
        `STATUS: ${sheet.status}`,
        width - 190,
        28,
        2.8,
      ),
      paperSpaceTextEntity(
        sheet,
        `GEOMETRY_HASH: ${sheet.geometryHash}`,
        18,
        titleOriginY,
        2.2,
      ),
      paperSpaceTextEntity(
        sheet,
        `SOURCE_PROJECT_GRAPH_HASH: ${sheet.sourceProjectGraphHash}`,
        18,
        titleOriginY - 7,
        2.2,
      ),
    );
    toArray(sheet.viewports).forEach((viewport, viewportIndex) => {
      const origin = viewport.origin || { x: 30, y: 60 };
      const viewportSize = viewport.size || { width: 520, height: 360 };
      entities.push(
        paperSpacePolylineEntity(sheet, [
          origin,
          { x: origin.x + viewportSize.width, y: origin.y },
          {
            x: origin.x + viewportSize.width,
            y: origin.y + viewportSize.height,
          },
          { x: origin.x, y: origin.y + viewportSize.height },
        ]),
      );
      entities.push(
        paperSpaceTextEntity(
          sheet,
          `VIEWPORT: ${viewport.viewId} ${viewport.scale}`,
          origin.x,
          origin.y - 6 - viewportIndex * 4,
          2.4,
        ),
      );
      entities.push(nativeViewportEntity(sheet, viewport, viewportIndex));
    });
    if (sheet.sheetId === "A-100") {
      entities.push(
        paperSpaceInsertEntity(sheet, "NORTH_ARROW", 40, height - 70, 1),
      );
    }
    if (sheet.sheetId === "A-101") {
      entities.push(
        paperSpaceInsertEntity(sheet, "SECTION_MARKER", 75, 110, 1),
      );
    }
  });
  return entities;
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
  buildPaperSpaceEntities(model).forEach((entity) => {
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

function sheetSizeMm(sheet = {}) {
  return (
    sheet.paperSizeMm ||
    (sheet.orientation === "portrait"
      ? { width: 594, height: 841 }
      : { width: 841, height: 594 })
  );
}

function layoutNameOf(sheet = {}, index = 0) {
  return (
    sheet.layoutName ||
    sheet.sheetId ||
    sheet.sheetNumber ||
    sheet.drawingNumber ||
    `Sheet-${index + 1}`
  );
}

function writeLayoutObject(sheet = {}, index = 0, layoutDictionaryHandle) {
  const layoutName = layoutNameOf(sheet, index);
  const nativeLayout = sheet.nativeLayout || {};
  const plotSettings = sheet.plotSettings || nativeLayout.plotSettings || {};
  const size = sheetSizeMm(sheet);
  const layoutHandle =
    nativeLayout.layoutHandle || stableHexHandle("layout", layoutName);
  const blockRecordHandle =
    nativeLayout.blockRecordHandle ||
    stableHexHandle("block-record", layoutName);
  let dxf = "";
  dxf += dxfPair(0, "LAYOUT");
  dxf += dxfPair(5, layoutHandle);
  dxf += dxfPair(330, layoutDictionaryHandle);
  dxf += dxfPair(100, "AcDbPlotSettings");
  dxf += dxfPair(1, plotSettings.plotConfigurationName || "DWG To PDF.pc3");
  dxf += dxfPair(2, plotSettings.canonicalMediaName || sheet.paperSize || "A1");
  dxf += dxfPair(4, plotSettings.plotStyleTable || "archiai-monochrome.ctb");
  dxf += dxfPair(6, plotSettings.plotPaperUnits || "mm");
  dxf += dxfPair(40, 0);
  dxf += dxfPair(41, 0);
  dxf += dxfPair(42, 0);
  dxf += dxfPair(43, 0);
  dxf += dxfPair(44, 0);
  dxf += dxfPair(45, 0);
  dxf += dxfPair(46, round(size.width));
  dxf += dxfPair(47, round(size.height));
  dxf += dxfPair(48, round(size.width));
  dxf += dxfPair(49, round(size.height));
  dxf += dxfPair(70, 688);
  dxf += dxfPair(72, plotSettings.plotRotation || 0);
  dxf += dxfPair(74, 5);
  dxf += dxfPair(100, "AcDbLayout");
  dxf += dxfPair(1, layoutName);
  dxf += dxfPair(70, 1);
  dxf += dxfPair(71, nativeLayout.tabOrder || index + 1);
  dxf += dxfPair(10, 0);
  dxf += dxfPair(20, 0);
  dxf += dxfPair(11, round(size.width));
  dxf += dxfPair(21, round(size.height));
  dxf += dxfPair(12, 0);
  dxf += dxfPair(22, 0);
  dxf += dxfPair(32, 0);
  dxf += dxfPair(14, 0);
  dxf += dxfPair(24, 0);
  dxf += dxfPair(34, 0);
  dxf += dxfPair(15, 1);
  dxf += dxfPair(25, 0);
  dxf += dxfPair(35, 0);
  dxf += dxfPair(146, 0);
  dxf += dxfPair(13, 0);
  dxf += dxfPair(23, 0);
  dxf += dxfPair(33, 0);
  dxf += dxfPair(16, 0);
  dxf += dxfPair(26, 1);
  dxf += dxfPair(36, 0);
  dxf += dxfPair(17, 0);
  dxf += dxfPair(27, 0);
  dxf += dxfPair(37, 1);
  dxf += dxfPair(76, 0);
  dxf += dxfPair(330, blockRecordHandle);
  dxf += dxfPair(
    999,
    `PLOT_CONFIGURATION: ${plotSettings.plotConfigurationName || "DWG To PDF.pc3"}`,
  );
  dxf += dxfPair(
    999,
    `CANONICAL_MEDIA_NAME: ${plotSettings.canonicalMediaName || sheet.paperSize || "A1"}`,
  );
  dxf += dxfPair(
    999,
    `PLOT_STYLE_TABLE: ${plotSettings.plotStyleTable || "archiai-monochrome.ctb"}`,
  );
  return dxf;
}

function writeObjectsSection(model = {}) {
  const sheets = toArray(model.paperSpace?.sheets);
  const namedObjectDictionaryHandle = stableHexHandle("named-objects");
  const layoutDictionaryHandle = stableHexHandle("layout-dictionary");
  const plotStyleMetadata = model.plotStyleMetadata || {};
  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "OBJECTS");
  dxf += dxfPair(
    999,
    `PLOT_STYLE_METADATA: mode=${plotStyleMetadata.mode || "ctb"} ctb=${plotStyleMetadata.ctbFile || "archiai-monochrome.ctb"} stb=${plotStyleMetadata.stbFile || "none"}`,
  );
  dxf += dxfPair(999, "CTB_STB_MAPPING: layer-weight-to-ctb");
  dxf += dxfPair(0, "DICTIONARY");
  dxf += dxfPair(5, namedObjectDictionaryHandle);
  dxf += dxfPair(100, "AcDbDictionary");
  dxf += dxfPair(3, "ACAD_LAYOUT");
  dxf += dxfPair(350, layoutDictionaryHandle);
  dxf += dxfPair(0, "DICTIONARY");
  dxf += dxfPair(5, layoutDictionaryHandle);
  dxf += dxfPair(330, namedObjectDictionaryHandle);
  dxf += dxfPair(100, "AcDbDictionary");
  sheets.forEach((sheet, index) => {
    dxf += dxfPair(3, layoutNameOf(sheet, index));
    dxf += dxfPair(
      350,
      sheet.nativeLayout?.layoutHandle ||
        stableHexHandle("layout", layoutNameOf(sheet, index)),
    );
  });
  sheets.forEach((sheet, index) => {
    dxf += writeLayoutObject(sheet, index, layoutDictionaryHandle);
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
  const validation = validateCanonicalDrawingModel(canonicalDrawingModel, {
    dimensionPolicy: strictValidation ? "error" : "warn",
  });
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
