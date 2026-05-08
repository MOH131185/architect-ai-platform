import {
  buildBoundingBoxFromPolygon,
  computeCentroid,
  createStableHash,
  createStableId,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { summarizeJurisdictionPack } from "../jurisdiction/jurisdictionPackService.js";

export const MEP_MODEL_VERSION = "mep-model-v1";
export const MEP_DRAWING_PANEL_VERSION = "mep-drawing-panel-v1";

export const MEP_REVIEW_DISCLAIMER =
  "PRELIMINARY MEP INFORMATION ONLY - not for construction. Review, sizing, calculations, and coordination by a qualified MEP engineer are required.";

export const REQUIRED_MEP_CAD_LAYERS = Object.freeze([
  "E-LIGHT",
  "E-POWER",
  "E-SWITCH",
  "E-DATA",
  "P-WATER",
  "P-DRAIN",
  "P-SANITARY",
  "M-DUCT",
  "M-VENT",
  "M-EQUIP",
  "MEP-RISER",
  "MEP-NOTES",
  "MEP-DIMS",
]);

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function finiteMetric(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMetric(numeric, 3) : fallback;
}

function point(value = {}) {
  return {
    x: finiteMetric(value.x ?? value.x_m ?? value.left ?? 0),
    y: finiteMetric(value.y ?? value.y_m ?? value.top ?? 0),
  };
}

function polygon(value) {
  return toArray(value).map(point);
}

function hasPolygon(value) {
  return polygon(value).length >= 3;
}

function sourceProjectGraphHashOf(compiledProject = {}) {
  return (
    compiledProject.sourceProjectGraphHash ||
    compiledProject.projectGraphHash ||
    compiledProject.projectGraph?.hash ||
    compiledProject.metadata?.sourceProjectGraphHash ||
    compiledProject.metadata?.projectGraphHash ||
    compiledProject.geometryHash ||
    null
  );
}

function jurisdictionOf(compiledProject = {}, jurisdiction = null) {
  return (
    jurisdiction ||
    compiledProject.jurisdiction ||
    compiledProject.project?.jurisdiction ||
    compiledProject.metadata?.jurisdiction ||
    "generic"
  );
}

function roomName(room = {}) {
  return String(
    room.name || room.type || room.roomType || room.label || room.id || "",
  );
}

function roomKind(room = {}) {
  return String(
    room.type || room.roomType || room.category || roomName(room),
  ).toLowerCase();
}

function isKitchen(room = {}) {
  return /kitchen|cuisine/.test(
    `${roomKind(room)} ${roomName(room).toLowerCase()}`,
  );
}

function isWetRoom(room = {}) {
  return /bath|wc|toilet|shower|ensuite|utility|laundry|wet|sanitary/.test(
    `${roomKind(room)} ${roomName(room).toLowerCase()}`,
  );
}

function isHabitableRoom(room = {}) {
  const text = `${roomKind(room)} ${roomName(room).toLowerCase()}`;
  return /living|bed|dining|study|office|kitchen|lounge|family|habitable/.test(
    text,
  );
}

function isCirculation(room = {}) {
  return /corridor|hall|landing|stair|circulation/.test(
    `${roomKind(room)} ${roomName(room).toLowerCase()}`,
  );
}

function levelIdOf(room = {}) {
  return room.levelId || room.level_id || room.level || "level-0";
}

function roomPolygon(room = {}) {
  if (hasPolygon(room.polygon)) return polygon(room.polygon);
  if (hasPolygon(room.boundary)) return polygon(room.boundary);
  if (room.center || room.position || room.position_m) {
    const center = point(room.center || room.position || room.position_m);
    const w = finiteMetric(room.width_m || room.width || 3, 3);
    const d = finiteMetric(room.depth_m || room.height_m || room.depth || 3, 3);
    return [
      { x: center.x - w / 2, y: center.y - d / 2 },
      { x: center.x + w / 2, y: center.y - d / 2 },
      { x: center.x + w / 2, y: center.y + d / 2 },
      { x: center.x - w / 2, y: center.y + d / 2 },
    ];
  }
  return [];
}

function roomCenter(room = {}) {
  const poly = roomPolygon(room);
  if (poly.length >= 3) return computeCentroid(poly);
  return point(room.center || room.position || room.position_m || {});
}

function roomBBox(room = {}) {
  const poly = roomPolygon(room);
  if (poly.length >= 3) return buildBoundingBoxFromPolygon(poly);
  const center = roomCenter(room);
  return {
    min_x: center.x - 1,
    max_x: center.x + 1,
    min_y: center.y - 1,
    max_y: center.y + 1,
    width: 2,
    height: 2,
  };
}

function collectProjectPoints(compiledProject = {}) {
  const points = [];
  toArray(compiledProject.rooms).forEach((room) =>
    points.push(...roomPolygon(room)),
  );
  toArray(compiledProject.slabs).forEach((slab) =>
    points.push(...polygon(slab.polygon)),
  );
  points.push(...polygon(compiledProject.site?.buildable_polygon));
  points.push(...polygon(compiledProject.site?.boundary_polygon));
  return points;
}

function projectBBox(compiledProject = {}) {
  const points = collectProjectPoints(compiledProject);
  if (points.length >= 2) return buildBoundingBoxFromPolygon(points);
  return { min_x: 0, min_y: 0, max_x: 12, max_y: 8, width: 12, height: 8 };
}

function makeFixtureId(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function offsetPoint(base, dx, dy) {
  return {
    x: roundMetric((base?.x || 0) + dx, 3),
    y: roundMetric((base?.y || 0) + dy, 3),
  };
}

function buildRoomInventory(compiledProject = {}) {
  const rooms = toArray(compiledProject.rooms).map((room, index) => ({
    id: room.id || room.sourceId || `room-${index + 1}`,
    name: roomName(room) || `Room ${index + 1}`,
    type: roomKind(room) || "room",
    levelId: levelIdOf(room),
    center: roomCenter(room),
    bbox: roomBBox(room),
    polygon: roomPolygon(room),
    isWetRoom: isWetRoom(room),
    isKitchen: isKitchen(room),
    isHabitable: isHabitableRoom(room),
    isCirculation: isCirculation(room),
  }));

  if (rooms.length) return rooms;

  const bbox = projectBBox(compiledProject);
  return [
    {
      id: "room-default-living",
      name: "Living",
      type: "living",
      levelId: "level-0",
      center: {
        x: roundMetric(bbox.min_x + bbox.width / 2),
        y: roundMetric(bbox.min_y + bbox.height / 2),
      },
      bbox,
      polygon: [
        { x: bbox.min_x, y: bbox.min_y },
        { x: bbox.max_x, y: bbox.min_y },
        { x: bbox.max_x, y: bbox.max_y },
        { x: bbox.min_x, y: bbox.max_y },
      ],
      isWetRoom: false,
      isKitchen: false,
      isHabitable: true,
      isCirculation: false,
    },
  ];
}

function buildRisers(compiledProject, rooms) {
  const bbox = projectBBox(compiledProject);
  const serviceRoom =
    rooms.find((room) => room.isWetRoom || room.isKitchen) || rooms[0];
  const center = serviceRoom?.center || {
    x: bbox.min_x + bbox.width * 0.85,
    y: bbox.min_y + bbox.height * 0.25,
  };
  return [
    {
      id: "MEP-RISER-001",
      tag: "RS-001",
      levelId: serviceRoom?.levelId || "level-0",
      position: offsetPoint(center, 0.45, 0.45),
      serves: ["water", "drainage", "ventilation"],
      reviewRequired: true,
    },
  ];
}

function buildElectricalLayouts(rooms) {
  const lightingFixtures = [];
  const powerOutlets = [];
  const switches = [];
  const dataPoints = [];

  rooms.forEach((room, index) => {
    if (room.isHabitable || room.isCirculation || room.isKitchen) {
      lightingFixtures.push({
        id: makeFixtureId("LT", lightingFixtures.length),
        tag: makeFixtureId("LT", lightingFixtures.length),
        roomId: room.id,
        roomName: room.name,
        levelId: room.levelId,
        point: room.center,
        fixtureType: room.isKitchen ? "linear_kitchen_task" : "ceiling_light",
      });
      powerOutlets.push({
        id: makeFixtureId("PWR", powerOutlets.length),
        tag: makeFixtureId("PWR", powerOutlets.length),
        roomId: room.id,
        roomName: room.name,
        levelId: room.levelId,
        point: offsetPoint(room.center, -0.45, -0.35),
        outletType: room.isKitchen ? "kitchen_counter_socket" : "double_socket",
      });
      switches.push({
        id: makeFixtureId("SW", switches.length),
        tag: makeFixtureId("SW", switches.length),
        roomId: room.id,
        roomName: room.name,
        levelId: room.levelId,
        point: { x: room.bbox.min_x + 0.35, y: room.bbox.min_y + 0.35 },
        switchType: "one_way_switch",
      });
      if (/study|office|bed|living/i.test(`${room.type} ${room.name}`)) {
        dataPoints.push({
          id: makeFixtureId("DATA", dataPoints.length),
          tag: makeFixtureId("DATA", dataPoints.length),
          roomId: room.id,
          roomName: room.name,
          levelId: room.levelId,
          point: offsetPoint(room.center, 0.45, -0.35),
          outletType: "data_point",
        });
      }
    }
  });

  return {
    lightingLayout: { fixtures: lightingFixtures },
    powerSocketLayout: { outlets: powerOutlets, switches, dataPoints },
  };
}

function routeToRiser(room, riser, idPrefix, index) {
  return {
    id: makeFixtureId(idPrefix, index),
    roomId: room.id,
    roomName: room.name,
    levelId: room.levelId,
    start: room.center,
    end: riser.position,
    riserId: riser.id,
  };
}

function buildPlumbingAndDrainage(rooms, risers) {
  const riser = risers[0];
  const serviceRooms = rooms.filter((room) => room.isWetRoom || room.isKitchen);
  const plumbingFixtures = [];
  const drainageFixtures = [];
  const supplyLines = [];
  const wasteLines = [];

  serviceRooms.forEach((room) => {
    const fixtureTag = room.isKitchen
      ? "SK"
      : room.name.match(/wc|toilet/i)
        ? "WC"
        : "SAN";
    plumbingFixtures.push({
      id: makeFixtureId("HW", plumbingFixtures.length),
      tag: `${fixtureTag}-${String(plumbingFixtures.length + 1).padStart(3, "0")}`,
      roomId: room.id,
      roomName: room.name,
      levelId: room.levelId,
      point: offsetPoint(room.center, -0.25, 0.25),
      fixtureType: room.isKitchen ? "sink_supply" : "sanitary_supply",
    });
    drainageFixtures.push({
      id: makeFixtureId("DR", drainageFixtures.length),
      tag: `DR-${String(drainageFixtures.length + 1).padStart(3, "0")}`,
      roomId: room.id,
      roomName: room.name,
      levelId: room.levelId,
      point: offsetPoint(room.center, 0.25, 0.25),
      fixtureType: room.isKitchen ? "sink_waste" : "sanitary_waste",
    });
    supplyLines.push(routeToRiser(room, riser, "WTR", supplyLines.length));
    wasteLines.push(routeToRiser(room, riser, "WST", wasteLines.length));
  });

  return {
    plumbingSupplyLayout: { fixtures: plumbingFixtures, lines: supplyLines },
    drainageWasteLayout: { fixtures: drainageFixtures, lines: wasteLines },
  };
}

function buildVentilation(rooms, risers) {
  const riser = risers[0];
  const extractRooms = rooms.filter((room) => room.isWetRoom || room.isKitchen);
  const habitableRooms = rooms.filter(
    (room) => room.isHabitable && !room.isWetRoom,
  );
  const extractFans = extractRooms.map((room, index) => ({
    id: makeFixtureId("EF", index),
    tag: makeFixtureId("EF", index),
    roomId: room.id,
    roomName: room.name,
    levelId: room.levelId,
    point: offsetPoint(room.center, 0, -0.45),
    fanType: "extract_fan",
  }));
  const routes = extractRooms.map((room, index) =>
    routeToRiser(room, riser, "VENT", index),
  );
  const supplyMarkers = habitableRooms.map((room, index) => ({
    id: makeFixtureId("SA", index),
    tag: makeFixtureId("SA", index),
    roomId: room.id,
    roomName: room.name,
    levelId: room.levelId,
    point: offsetPoint(room.center, 0, 0.45),
    markerType: "background_ventilation",
  }));
  return {
    ventilationHvacLayout: {
      extractFans,
      routes,
      supplyMarkers,
      notes: [
        "Ventilation routes are indicative only.",
        "Fan duties, pressure drops, acoustic limits, and duct sizes are not calculated.",
      ],
    },
  };
}

function buildEquipment(compiledProject, risers) {
  const bbox = projectBBox(compiledProject);
  return [
    {
      id: "MEP-EQ-001",
      tag: "EQ-001",
      equipmentType: "domestic_plant_allowance",
      position: risers[0]?.position || { x: bbox.max_x - 1, y: bbox.min_y + 1 },
      levelId: risers[0]?.levelId || "level-0",
      note: "Indicative plant location pending engineer coordination.",
    },
  ];
}

function buildRoomFixtureMapping(rooms) {
  return {
    wetRooms: rooms.filter((room) => room.isWetRoom).map((room) => room.id),
    kitchens: rooms.filter((room) => room.isKitchen).map((room) => room.id),
    habitableRooms: rooms
      .filter((room) => room.isHabitable)
      .map((room) => room.id),
    circulationRooms: rooms
      .filter((room) => room.isCirculation)
      .map((room) => room.id),
  };
}

function buildSchedules(mepModelDraft) {
  return {
    lightingSchedule: mepModelDraft.electricalLightingLayout.fixtures.map(
      (fixture) => ({
        id: fixture.id,
        tag: fixture.tag,
        type: fixture.fixtureType,
        roomId: fixture.roomId,
      }),
    ),
    powerSchedule: mepModelDraft.electricalPowerSocketLayout.outlets.map(
      (outlet) => ({
        id: outlet.id,
        tag: outlet.tag,
        type: outlet.outletType,
        roomId: outlet.roomId,
      }),
    ),
    plumbingSchedule: [
      ...mepModelDraft.plumbingSupplyLayout.fixtures,
      ...mepModelDraft.drainageWasteLayout.fixtures,
    ].map((fixture) => ({
      id: fixture.id,
      tag: fixture.tag,
      type: fixture.fixtureType,
      roomId: fixture.roomId,
    })),
    ventilationSchedule: mepModelDraft.ventilationHvacLayout.extractFans.map(
      (fan) => ({
        id: fan.id,
        tag: fan.tag,
        type: fan.fanType,
        roomId: fan.roomId,
      }),
    ),
  };
}

export function buildMepModelFromCompiledProject({
  compiledProject,
  jurisdiction = null,
  jurisdictionPack = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required to build MepModel.",
    );
  }

  const rooms = buildRoomInventory(compiledProject);
  const risers = buildRisers(compiledProject, rooms);
  const electrical = buildElectricalLayouts(rooms);
  const hydraulic = buildPlumbingAndDrainage(rooms, risers);
  const ventilation = buildVentilation(rooms, risers);
  const jurisdictionPackSummary = jurisdictionPack
    ? summarizeJurisdictionPack(jurisdictionPack)
    : null;
  const disclaimers = [
    MEP_REVIEW_DISCLAIMER,
    jurisdictionPackSummary?.disclaimers?.mep,
    jurisdictionPackSummary?.disclaimers?.preliminaryAdvisory,
  ].filter(Boolean);
  const draft = {
    version: MEP_MODEL_VERSION,
    geometryHash: compiledProject.geometryHash,
    sourceProjectGraphHash: sourceProjectGraphHashOf(compiledProject),
    jurisdiction:
      jurisdictionPackSummary?.jurisdictionId ||
      jurisdictionOf(compiledProject, jurisdiction),
    jurisdictionPack: jurisdictionPackSummary,
    jurisdictionPackVersion: jurisdictionPackSummary?.version || null,
    designBasis: {
      status: "preliminary",
      outputType: "coordination_model",
      units: "meters",
      reviewRequired: true,
      standardsBasis: "generic preliminary MEP coordination assumptions",
    },
    assumptions: [
      "MEP layouts are deterministic coordination diagrams derived from compiled project room geometry.",
      "No pipe sizing, pressure drop, ventilation duty, circuit loading, discrimination, or code compliance calculations are performed.",
      "Fixture counts and routes are preliminary placeholders for qualified MEP engineer review.",
    ],
    disclaimers,
    reviewRequired: true,
    imageProviderUsed: "none",
    technicalDrawing: true,
    electricalLightingLayout: electrical.lightingLayout,
    electricalPowerSocketLayout: electrical.powerSocketLayout,
    plumbingSupplyLayout: hydraulic.plumbingSupplyLayout,
    drainageWasteLayout: hydraulic.drainageWasteLayout,
    ventilationHvacLayout: ventilation.ventilationHvacLayout,
    risersShafts: risers,
    equipmentPlantLocations: buildEquipment(compiledProject, risers),
    roomFixtureMapping: buildRoomFixtureMapping(rooms),
    mepLegends: [
      { code: "LT", label: "Light fitting" },
      { code: "SW", label: "Switch" },
      { code: "PWR", label: "Power/socket outlet" },
      { code: "DATA", label: "Data point" },
      { code: "WTR", label: "Plumbing supply route" },
      { code: "DR", label: "Drainage/waste route" },
      { code: "EF", label: "Extract fan" },
      { code: "RS", label: "Riser/shaft" },
    ],
    coordinationNotes: [
      "Coordinate risers with structural openings and fire/acoustic compartmentation.",
      "Coordinate wet room drainage falls, pipe zones, and access panels before construction.",
      "Coordinate electrical points with furniture layouts and final client requirements.",
    ],
    preliminaryClashNotes: [
      "No automated clash detection is performed in this slice.",
      "Riser and plant locations are indicative and must be coordinated with structure and architecture.",
    ],
    requiredCadLayers: [...REQUIRED_MEP_CAD_LAYERS],
  };

  const schedules = buildSchedules(draft);
  const partial = { ...draft, schedules };
  const mepModelHash = createStableHash(JSON.stringify(partial));
  return {
    ...partial,
    mepModelId: createStableId(
      "mep-model",
      compiledProject.geometryHash,
      mepModelHash,
    ),
    mepModelHash,
    memberIds: [
      ...partial.electricalLightingLayout.fixtures,
      ...partial.electricalPowerSocketLayout.outlets,
      ...partial.electricalPowerSocketLayout.switches,
      ...partial.electricalPowerSocketLayout.dataPoints,
      ...partial.plumbingSupplyLayout.fixtures,
      ...partial.drainageWasteLayout.fixtures,
      ...partial.ventilationHvacLayout.extractFans,
      ...partial.risersShafts,
      ...partial.equipmentPlantLocations,
    ].map((item) => item.tag || item.id),
  };
}

function svgEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transformPointFactory(mepModel) {
  const allPoints = [
    ...mepModel.electricalLightingLayout.fixtures.map((item) => item.point),
    ...mepModel.electricalPowerSocketLayout.outlets.map((item) => item.point),
    ...mepModel.plumbingSupplyLayout.lines.flatMap((line) => [
      line.start,
      line.end,
    ]),
    ...mepModel.drainageWasteLayout.lines.flatMap((line) => [
      line.start,
      line.end,
    ]),
    ...mepModel.ventilationHvacLayout.routes.flatMap((line) => [
      line.start,
      line.end,
    ]),
  ];
  const bbox =
    allPoints.length >= 2
      ? buildBoundingBoxFromPolygon(allPoints)
      : { min_x: 0, min_y: 0, width: 12, height: 8 };
  const margin = 70;
  const width = 760;
  const height = 560;
  const scale = Math.min(
    (width - margin * 2) / Math.max(bbox.width || 1, 1),
    (height - margin * 2) / Math.max(bbox.height || 1, 1),
  );
  return (pt) => ({
    x: roundMetric(margin + (Number(pt?.x || 0) - bbox.min_x) * scale, 2),
    y: roundMetric(
      height - margin - (Number(pt?.y || 0) - bbox.min_y) * scale,
      2,
    ),
  });
}

function svgSymbol({ point: pt, className, label, shape = "circle" }) {
  const tag = svgEscape(label);
  if (shape === "rect") {
    return `<rect class="${className}" x="${pt.x - 8}" y="${pt.y - 8}" width="16" height="16" /><text class="fixture-tag" x="${pt.x + 12}" y="${pt.y - 8}">${tag}</text>`;
  }
  if (shape === "triangle") {
    return `<path class="${className}" d="M ${pt.x} ${pt.y - 10} L ${pt.x + 10} ${pt.y + 8} L ${pt.x - 10} ${pt.y + 8} Z" /><text class="fixture-tag" x="${pt.x + 12}" y="${pt.y - 8}">${tag}</text>`;
  }
  return `<circle class="${className}" cx="${pt.x}" cy="${pt.y}" r="8" /><text class="fixture-tag" x="${pt.x + 12}" y="${pt.y - 8}">${tag}</text>`;
}

function svgRoute({ start, end, className, label }) {
  return `<line class="${className}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" /><text class="route-tag" x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2 - 6}">${svgEscape(label)}</text>`;
}

function buildPanel({ mepModel, panelType, title, body }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="620" viewBox="0 0 820 620" role="img" data-panel-type="${panelType}" data-technical-drawing="true" data-image-provider-used="none">
<style>
.sheet{fill:#f8fbff;stroke:#1f3552;stroke-width:2}.title{font:700 24px monospace;fill:#13263f}.subtitle,.note{font:13px monospace;fill:#28415f}.mep-light-symbol{fill:#fff7b0;stroke:#8a6d00;stroke-width:2}.mep-socket-symbol{fill:#e7f0ff;stroke:#0050a4;stroke-width:2}.mep-switch-symbol{fill:#eef;stroke:#334;stroke-width:2}.mep-water-route{stroke:#1078d4;stroke-width:3;fill:none}.mep-drain-route{stroke:#7247a8;stroke-width:3;stroke-dasharray:8 5;fill:none}.mep-vent-route{stroke:#0b8f6a;stroke-width:3;fill:none}.mep-riser-symbol{fill:#fff;stroke:#c43;stroke-width:3}.mep-equipment-symbol{fill:#f6f1ea;stroke:#704214;stroke-width:2}.fixture-tag,.route-tag{font:11px monospace;fill:#13263f}.mep-legend{fill:#fff;stroke:#7b8da8;stroke-width:1}.review{font:700 13px monospace;fill:#9b2c2c}
</style>
<rect class="sheet" x="16" y="16" width="788" height="588" />
<text class="title" x="36" y="44">${svgEscape(title)}</text>
<text class="subtitle" x="36" y="68">PRELIMINARY MEP - QUALIFIED MEP ENGINEER REVIEW REQUIRED</text>
<metadata>{"panelType":"${panelType}","geometryHash":"${mepModel.geometryHash}","mepModelHash":"${mepModel.mepModelHash}","technicalDrawing":true,"imageProviderUsed":"none"}</metadata>
${body}
<g class="mep-legend"><rect x="560" y="420" width="220" height="150" /><text class="note" x="574" y="444">MEP LEGEND</text><text class="note" x="574" y="466">LT light fitting</text><text class="note" x="574" y="488">PWR socket outlet</text><text class="note" x="574" y="510">WTR water route</text><text class="note" x="574" y="532">DR drain/waste route</text><text class="note" x="574" y="554">EF extract fan / vent route</text></g>
<text class="review" x="36" y="590">${svgEscape(MEP_REVIEW_DISCLAIMER)}</text>
</svg>`;
  const svgHash = createStableHash(svg);
  return {
    panelType,
    drawingType: "mep",
    version: MEP_DRAWING_PANEL_VERSION,
    title,
    svgString: svg,
    svgHash,
    width: 820,
    height: 620,
    renderer: "deterministic_svg",
    providerUsed: "deterministic_svg",
    imageProviderUsed: "none",
    technicalDrawing: true,
    geometryHash: mepModel.geometryHash,
    sourceGeometryHash: mepModel.geometryHash,
    sourceProjectGraphHash: mepModel.sourceProjectGraphHash,
    mepModelHash: mepModel.mepModelHash,
    reviewRequired: true,
    status: "ready",
    metadata: {
      panelType,
      drawingType: "mep",
      mepModelHash: mepModel.mepModelHash,
      reviewRequired: true,
      imageProviderUsed: "none",
      renderer: "deterministic_svg",
    },
  };
}

export function buildMepDrawingPanelsFromMepModel(mepModel = {}) {
  const mapPoint = transformPointFactory(mepModel);
  const riserSymbols = toArray(mepModel.risersShafts)
    .map((riser) =>
      svgSymbol({
        point: mapPoint(riser.position),
        className: "mep-riser-symbol",
        label: riser.tag || riser.id,
        shape: "rect",
      }),
    )
    .join("");
  const lighting = toArray(mepModel.electricalLightingLayout?.fixtures)
    .map((fixture) =>
      svgSymbol({
        point: mapPoint(fixture.point),
        className: "mep-light-symbol",
        label: fixture.tag,
      }),
    )
    .join("");
  const sockets = [
    ...toArray(mepModel.electricalPowerSocketLayout?.outlets).map((outlet) =>
      svgSymbol({
        point: mapPoint(outlet.point),
        className: "mep-socket-symbol",
        label: outlet.tag,
        shape: "rect",
      }),
    ),
    ...toArray(mepModel.electricalPowerSocketLayout?.switches).map((sw) =>
      svgSymbol({
        point: mapPoint(sw.point),
        className: "mep-switch-symbol",
        label: sw.tag,
        shape: "triangle",
      }),
    ),
  ].join("");
  const waterRoutes = toArray(mepModel.plumbingSupplyLayout?.lines)
    .map((line) =>
      svgRoute({
        start: mapPoint(line.start),
        end: mapPoint(line.end),
        className: "mep-water-route",
        label: line.id,
      }),
    )
    .join("");
  const drainRoutes = toArray(mepModel.drainageWasteLayout?.lines)
    .map((line) =>
      svgRoute({
        start: mapPoint(line.start),
        end: mapPoint(line.end),
        className: "mep-drain-route",
        label: line.id,
      }),
    )
    .join("");
  const ventRoutes = toArray(mepModel.ventilationHvacLayout?.routes)
    .map((line) =>
      svgRoute({
        start: mapPoint(line.start),
        end: mapPoint(line.end),
        className: "mep-vent-route",
        label: line.id,
      }),
    )
    .join("");
  const extractFans = toArray(mepModel.ventilationHvacLayout?.extractFans)
    .map((fan) =>
      svgSymbol({
        point: mapPoint(fan.point),
        className: "mep-vent-route",
        label: fan.tag,
        shape: "triangle",
      }),
    )
    .join("");
  const equipment = toArray(mepModel.equipmentPlantLocations)
    .map((item) =>
      svgSymbol({
        point: mapPoint(item.position),
        className: "mep-equipment-symbol",
        label: item.tag,
        shape: "rect",
      }),
    )
    .join("");
  const notes = [
    ...toArray(mepModel.coordinationNotes),
    ...toArray(mepModel.preliminaryClashNotes),
  ]
    .slice(0, 8)
    .map(
      (note, index) =>
        `<text class="note" x="56" y="${130 + index * 24}">${svgEscape(note)}</text>`,
    )
    .join("");

  const mepPanels = {
    mep_lighting_plan: buildPanel({
      mepModel,
      panelType: "mep_lighting_plan",
      title: "MEP Lighting Plan",
      body: `<g>${lighting}${riserSymbols}</g>`,
    }),
    mep_power_plan: buildPanel({
      mepModel,
      panelType: "mep_power_plan",
      title: "MEP Power and Data Plan",
      body: `<g>${sockets}${riserSymbols}</g>`,
    }),
    mep_plumbing_plan: buildPanel({
      mepModel,
      panelType: "mep_plumbing_plan",
      title: "MEP Plumbing Supply Plan",
      body: `<g>${waterRoutes}${riserSymbols}</g>`,
    }),
    mep_drainage_plan: buildPanel({
      mepModel,
      panelType: "mep_drainage_plan",
      title: "MEP Drainage and Waste Plan",
      body: `<g>${drainRoutes}${riserSymbols}</g>`,
    }),
    mep_ventilation_plan: buildPanel({
      mepModel,
      panelType: "mep_ventilation_plan",
      title: "MEP Ventilation Plan",
      body: `<g>${ventRoutes}${extractFans}${riserSymbols}</g>`,
    }),
    mep_schematic_notes: buildPanel({
      mepModel,
      panelType: "mep_schematic_notes",
      title: "MEP Schematic Notes",
      body: `<g>${equipment}${notes}</g>`,
    }),
  };

  return { mepModel, mepPanels };
}

export function buildMepDrawingPanelsFromCompiledProject({
  compiledProject,
  jurisdiction = null,
  jurisdictionPack = null,
} = {}) {
  const mepModel = buildMepModelFromCompiledProject({
    compiledProject,
    jurisdiction,
    jurisdictionPack,
  });
  return buildMepDrawingPanelsFromMepModel(mepModel);
}

export function validateMepModel(
  mepModel = {},
  { compiledProject = null } = {},
) {
  const errors = [];
  if (!mepModel.mepModelHash) errors.push({ code: "MEP_MODEL_HASH_MISSING" });
  if (!mepModel.geometryHash)
    errors.push({ code: "MEP_MODEL_GEOMETRY_HASH_MISSING" });
  if (
    compiledProject?.geometryHash &&
    mepModel.geometryHash &&
    mepModel.geometryHash !== compiledProject.geometryHash
  ) {
    errors.push({ code: "MEP_MODEL_GEOMETRY_HASH_MISMATCH" });
  }
  if (mepModel.reviewRequired !== true)
    errors.push({ code: "MEP_MODEL_REVIEW_REQUIRED_MISSING" });
  if (
    !toArray(mepModel.disclaimers)
      .join(" ")
      .match(/qualified MEP engineer/i)
  ) {
    errors.push({ code: "MEP_MODEL_DISCLAIMER_MISSING" });
  }
  const wetRooms = toArray(mepModel.roomFixtureMapping?.wetRooms);
  const habitableRooms = toArray(mepModel.roomFixtureMapping?.habitableRooms);
  if (wetRooms.length && !toArray(mepModel.drainageWasteLayout?.lines).length) {
    errors.push({ code: "MEP_MODEL_WET_ROOM_DRAINAGE_MISSING" });
  }
  if (
    habitableRooms.length &&
    !toArray(mepModel.electricalLightingLayout?.fixtures).length
  ) {
    errors.push({ code: "MEP_MODEL_HABITABLE_LIGHTING_MISSING" });
  }
  if (mepModel.imageProviderUsed !== "none")
    errors.push({ code: "MEP_MODEL_IMAGE_PROVIDER_FORBIDDEN" });
  return {
    valid: errors.length === 0,
    errors,
    checks: {
      hasMepModelHash: Boolean(mepModel.mepModelHash),
      geometryHashMatches:
        !compiledProject?.geometryHash ||
        mepModel.geometryHash === compiledProject.geometryHash,
      reviewRequired: mepModel.reviewRequired === true,
      imageProviderUsed: mepModel.imageProviderUsed || null,
      wetRoomCount: wetRooms.length,
      habitableRoomCount: habitableRooms.length,
      lightingFixtureCount: toArray(mepModel.electricalLightingLayout?.fixtures)
        .length,
      drainageRouteCount: toArray(mepModel.drainageWasteLayout?.lines).length,
    },
  };
}

export default {
  MEP_MODEL_VERSION,
  MEP_DRAWING_PANEL_VERSION,
  MEP_REVIEW_DISCLAIMER,
  REQUIRED_MEP_CAD_LAYERS,
  buildMepModelFromCompiledProject,
  buildMepDrawingPanelsFromMepModel,
  buildMepDrawingPanelsFromCompiledProject,
  validateMepModel,
};
