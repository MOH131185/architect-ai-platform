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

function buildLayerTable() {
  const layers = [
    { name: "A-WALL", color: 7 },
    { name: "A-OPEN", color: 4 },
    { name: "A-ROOM", color: 8 },
    { name: "A-DIMS", color: 2 },
    { name: "A-TEXT", color: 7 },
    { name: "A-SLAB", color: 3 },
  ];

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
  });

  content += dxfPair(0, "ENDTAB");
  content += dxfPair(0, "ENDSEC");
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
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for DXF export.",
    );
  }

  const level = compiledProject.levels?.[0];
  const rooms = (compiledProject.rooms || []).filter(
    (room) => !level || room.levelId === level.id,
  );
  const walls = (compiledProject.walls || []).filter(
    (wall) => !level || wall.levelId === level.id,
  );
  const openings = (compiledProject.openings || []).filter(
    (opening) => !level || opening.levelId === level.id,
  );
  const slabs = (compiledProject.slabs || []).filter(
    (slab) => !level || slab.levelId === level.id,
  );

  let dxf = "";
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "HEADER");
  dxf += dxfPair(9, "$ACADVER");
  dxf += dxfPair(1, "AC1024");
  dxf += dxfPair(9, "$INSUNITS");
  dxf += dxfPair(70, "6");
  dxf += dxfPair(0, "ENDSEC");
  dxf += buildLayerTable();
  dxf += dxfPair(0, "SECTION");
  dxf += dxfPair(2, "ENTITIES");

  slabs.forEach((slab) => {
    dxf += drawPolyline(slab.polygon, "A-SLAB", true);
  });
  walls.forEach((wall) => {
    dxf += drawLine(wall.start, wall.end, "A-WALL");
  });
  rooms.forEach((room) => {
    dxf += drawPolyline(room.polygon, "A-ROOM", true);
    const bbox = room.bbox || {};
    const cx = Number((bbox.min_x + bbox.max_x) / 2 || 0);
    const cy = Number((bbox.min_y + bbox.max_y) / 2 || 0);
    dxf += drawText(cx, cy, room.name || room.type || "ROOM");
    dxf += drawText(
      cx,
      cy - 0.35,
      `${round(room.actual_area_m2 || room.target_area_m2 || 0, 1)} m2`,
      "A-TEXT",
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
    dxf += drawLine(start, end, "A-OPEN");
  });

  const footprint = compiledProject.footprint?.polygon || [];
  if (footprint.length) {
    dxf += drawPolyline(footprint, "A-WALL", true);
  }

  dxf += drawText(0, -1.2, projectName);
  dxf += drawText(0, -1.6, `Geometry: ${compiledProject.geometryHash}`);
  dxf += dxfPair(0, "ENDSEC");
  dxf += dxfPair(0, "EOF");
  return dxf;
}

export function exportCompiledProjectToIFC({
  compiledProject,
  projectName = "ArchiAI Project",
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for IFC export.",
    );
  }

  let entity = 1;
  const next = () => entity++;
  const lines = [];
  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push("FILE_DESCRIPTION(('ArchiAI Compiled Project'),'2;1');");
  lines.push(
    `FILE_NAME('${projectName.replace(/\s+/g, "_")}.ifc','${new Date().toISOString()}',('ArchiAI'),('Architect AI Platform'),'IFC4','CompiledProjectExport','');`,
  );
  lines.push("FILE_SCHEMA(('IFC4'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");

  const originPointId = next();
  const axisId = next();
  const contextId = next();
  const unitsId = next();
  const projectId = next();

  lines.push(`#${originPointId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`#${axisId}=IFCAXIS2PLACEMENT3D(#${originPointId},$,$);`);
  lines.push(
    `#${contextId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axisId},$);`,
  );
  lines.push(
    `#${unitsId}=IFCUNITASSIGNMENT((IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.),IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.),IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)));`,
  );
  lines.push(
    `#${projectId}=IFCPROJECT('${createIfcGuid(compiledProject.geometryHash)}',$,'${projectName}',$,$,$,$,(#${contextId}),#${unitsId});`,
  );

  const buildingPlacementId = next();
  const buildingAxisId = next();
  const buildingId = next();
  lines.push(`#${buildingAxisId}=IFCAXIS2PLACEMENT3D(#${originPointId},$,$);`);
  lines.push(
    `#${buildingPlacementId}=IFCLOCALPLACEMENT($,#${buildingAxisId});`,
  );
  lines.push(
    `#${buildingId}=IFCBUILDING('${createIfcGuid(`${compiledProject.geometryHash}-building`)}',$,'${projectName}',$,$,#${buildingPlacementId},$,$,.ELEMENT.,$,$,$);`,
  );

  (compiledProject.levels || []).forEach((level, index) => {
    const pointId = next();
    const axisPlacementId = next();
    const localPlacementId = next();
    const storeyId = next();
    lines.push(
      `#${pointId}=IFCCARTESIANPOINT((0.,0.,${round(level.elevation_m || 0, 3)}));`,
    );
    lines.push(`#${axisPlacementId}=IFCAXIS2PLACEMENT3D(#${pointId},$,$);`);
    lines.push(
      `#${localPlacementId}=IFCLOCALPLACEMENT(#${buildingPlacementId},#${axisPlacementId});`,
    );
    lines.push(
      `#${storeyId}=IFCBUILDINGSTOREY('${createIfcGuid(`${compiledProject.geometryHash}-storey-${index}`)}',$,'${level.name || `Level ${index}`}',$,$,#${localPlacementId},$,$,.ELEMENT.,${round(level.elevation_m || 0, 3)});`,
    );
  });

  (compiledProject.walls || []).forEach((wall, index) => {
    const placementPointId = next();
    const placementAxisId = next();
    const placementId = next();
    const wallId = next();
    const start = wall.start || { x: 0, y: 0 };
    lines.push(
      `#${placementPointId}=IFCCARTESIANPOINT((${round(start.x, 3)},${round(start.y, 3)},${round(wall.elevation_m || 0, 3)}));`,
    );
    lines.push(
      `#${placementAxisId}=IFCAXIS2PLACEMENT3D(#${placementPointId},$,$);`,
    );
    lines.push(
      `#${placementId}=IFCLOCALPLACEMENT(#${buildingPlacementId},#${placementAxisId});`,
    );
    lines.push(
      `#${wallId}=IFCWALL('${createIfcGuid(`${compiledProject.geometryHash}-wall-${index}`)}',$,'${wall.id || `Wall ${index + 1}`}',$,$,#${placementId},$,$,$);`,
    );
  });

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
