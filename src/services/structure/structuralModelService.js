import {
  buildBoundingBoxFromPolygon,
  computeCentroid,
  createStableHash,
  createStableId,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { summarizeJurisdictionPack } from "../jurisdiction/jurisdictionPackService.js";
import { buildStructuralGrid } from "./structuralGridService.js";

export const STRUCTURAL_MODEL_VERSION = "structural-model-v1";
export const STRUCTURAL_DRAWING_PANEL_VERSION = "structural-drawing-panel-v1";

export const STRUCTURAL_REVIEW_DISCLAIMER =
  "PRELIMINARY STRUCTURAL INFORMATION ONLY - not for construction. Review and calculations by a licensed structural engineer are required.";

export const REQUIRED_STRUCTURAL_CAD_LAYERS = Object.freeze([
  "S-FOUNDATION",
  "S-COLUMN",
  "S-BEAM",
  "S-SLAB",
  "S-ROOF",
  "S-GRID",
  "S-NOTES",
  "S-DIMS",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function point(value = {}) {
  return {
    x: roundMetric(value.x),
    y: roundMetric(value.y),
  };
}

function polygon(points = []) {
  return toArray(points).map(point);
}

function hasPolygon(points = []) {
  return Array.isArray(points) && points.length >= 3;
}

function sourceProjectGraphHashOf(compiledProject = {}) {
  return (
    compiledProject.sourceProjectGraphHash ||
    compiledProject.projectGraphHash ||
    compiledProject.project_graph_hash ||
    compiledProject.metadata?.sourceProjectGraphHash ||
    compiledProject.metadata?.projectGraphHash ||
    compiledProject.geometryHash ||
    null
  );
}

function jurisdictionOf(compiledProject = {}) {
  return (
    compiledProject.jurisdiction ||
    compiledProject.regulations?.jurisdiction ||
    compiledProject.metadata?.jurisdiction ||
    "generic"
  );
}

function levelsOf(compiledProject = {}) {
  return toArray(compiledProject.levels).length
    ? toArray(compiledProject.levels)
    : [{ id: "level-0", level_number: 0, name: "Ground", elevation_m: 0 }];
}

function levelIdOf(entry = {}) {
  return entry.levelId || entry.level_id || entry.level || "level-0";
}

function levelName(level = {}, index = 0) {
  if (Number(level.level_number) === 0 || index === 0) return "ground";
  return `level${Number(level.level_number) || index}`;
}

function candidateFootprint(compiledProject = {}) {
  const slab = toArray(compiledProject.slabs).find((entry) =>
    hasPolygon(entry.polygon),
  );
  if (slab) return polygon(slab.polygon);
  if (hasPolygon(compiledProject.footprint?.polygon)) {
    return polygon(compiledProject.footprint.polygon);
  }
  if (hasPolygon(compiledProject.site?.buildable_polygon)) {
    return polygon(compiledProject.site.buildable_polygon);
  }
  if (hasPolygon(compiledProject.site?.boundary_polygon)) {
    return polygon(compiledProject.site.boundary_polygon);
  }
  return rectangleToPolygon(0, 0, 12, 8);
}

function bboxOf(compiledProject = {}) {
  return buildBoundingBoxFromPolygon(candidateFootprint(compiledProject));
}

function expandedPolygonFromBbox(bbox = {}, offset = 0.35) {
  return rectangleToPolygon(
    Number(bbox.min_x || 0) - offset,
    Number(bbox.min_y || 0) - offset,
    Number(bbox.width || 12) + offset * 2,
    Number(bbox.height || 8) + offset * 2,
  );
}

function memberId(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function buildDesignBasis(compiledProject = {}) {
  const storeyCount = levelsOf(compiledProject).length;
  return {
    status: "preliminary",
    designStage: "concept_structural_coordination",
    buildingUse:
      compiledProject.buildingType ||
      compiledProject.metadata?.buildingType ||
      "residential",
    storeyCount,
    materialSystem:
      compiledProject.materials?.structure?.primary ||
      compiledProject.materials?.structural?.primary ||
      "masonry / timber / reinforced concrete assumptions",
    codeBasis:
      "Jurisdiction-specific structural code checks have not been performed.",
    loadingBasis:
      "Indicative residential dead/live load assumptions only; no engineer calculations.",
  };
}

function buildAssumptions(compiledProject = {}) {
  return [
    "Preliminary structural layout is derived deterministically from compiled ProjectGraph geometry.",
    "Foundation sizes, reinforcement, bearing capacity, lateral stability, and member sizing are placeholders pending structural engineering.",
    `Jurisdiction is ${jurisdictionOf(compiledProject)}; local code verification is required.`,
    "Ground conditions, drainage, retaining requirements, wind, seismic, and snow loads are not calculated in this slice.",
  ];
}

function buildFoundationSystem(
  compiledProject = {},
  bbox = bboxOf(compiledProject),
) {
  const explicitFoundations = toArray(compiledProject.foundations)
    .filter((foundation) => hasPolygon(foundation.polygon))
    .map((foundation, index) => ({
      id: foundation.id || memberId("FND", index),
      memberId: foundation.memberId || memberId("FND", index),
      type: foundation.type || "strip_foundation",
      polygon: polygon(foundation.polygon),
      levelId: levelIdOf(foundation),
      status: "preliminary",
    }));
  const foundations = explicitFoundations.length
    ? explicitFoundations
    : [
        {
          id: "foundation-derived-001",
          memberId: "FND-001",
          type: "preliminary_raft_or_strip_foundation_zone",
          polygon: expandedPolygonFromBbox(bbox, 0.35),
          levelId: "level-0",
          status: "preliminary",
        },
      ];
  return {
    systemType: "preliminary strip/raft foundation coordination zone",
    reviewRequired: true,
    foundations,
  };
}

function buildSlabs(compiledProject = {}) {
  const footprint = candidateFootprint(compiledProject);
  const levels = levelsOf(compiledProject);
  const explicitSlabs = toArray(compiledProject.slabs)
    .filter((slab) => hasPolygon(slab.polygon))
    .map((slab, index) => ({
      id: slab.id || memberId("SLAB", index),
      memberId: slab.memberId || memberId("SLAB", index),
      levelId: levelIdOf(slab),
      type: slab.type || "preliminary_floor_slab",
      polygon: polygon(slab.polygon),
      thickness_m: Number(slab.thickness_m || 0.15),
      status: "preliminary",
    }));
  if (explicitSlabs.length) return explicitSlabs;
  return levels.map((level, index) => ({
    id: `slab-derived-${index + 1}`,
    memberId: memberId("SLAB", index),
    levelId: level.id || `level-${index}`,
    type: index === 0 ? "ground_bearing_slab" : "upper_floor_slab",
    polygon: footprint,
    thickness_m: 0.15,
    status: "preliminary",
  }));
}

function buildLoadBearingWalls(compiledProject = {}) {
  return toArray(compiledProject.walls)
    .filter((wall) => wall.exterior || wall.loadBearing || wall.structural)
    .map((wall, index) => ({
      id: wall.id || memberId("LBW", index),
      memberId: wall.memberId || memberId("LBW", index),
      levelId: levelIdOf(wall),
      type: wall.exterior ? "external_load_bearing_wall" : "load_bearing_wall",
      start: point(wall.start),
      end: point(wall.end),
      thickness_m: Number(wall.thickness_m || (wall.exterior ? 0.3 : 0.2)),
      status: "preliminary",
    }))
    .filter((wall) => wall.start && wall.end);
}

function buildGrid(compiledProject = {}, bbox = bboxOf(compiledProject)) {
  const projectGeometry = {
    project_id:
      compiledProject.project_id ||
      compiledProject.projectId ||
      compiledProject.geometryHash,
    site: {
      buildable_bbox: bbox,
      boundary_bbox: bbox,
    },
    levels: levelsOf(compiledProject),
  };
  const grid =
    compiledProject.structuralGrid || buildStructuralGrid(projectGeometry);
  return {
    ...grid,
    source: compiledProject.structuralGrid
      ? "compiled_project"
      : "structuralModelService",
  };
}

function buildColumns(compiledProject = {}, structuralGrid = {}) {
  const explicitColumns = toArray(compiledProject.columns).map(
    (column, index) => ({
      id: column.id || memberId("COL", index),
      memberId: column.memberId || memberId("COL", index),
      levelId: levelIdOf(column),
      type: column.type || "preliminary_column",
      position: point(column.position || column.position_m),
      width_m: Number(column.width_m || 0.3),
      depth_m: Number(column.depth_m || column.width_m || 0.3),
      status: "preliminary",
    }),
  );
  if (explicitColumns.length) return explicitColumns;
  return toArray(structuralGrid.suggested_columns)
    .slice(0, 36)
    .map((column, index) => ({
      id: column.id || memberId("COL", index),
      memberId: memberId("COL", index),
      levelId: column.level_id || "level-0",
      type: "preliminary_grid_column",
      position: point(column),
      width_m: 0.25,
      depth_m: 0.25,
      status: "preliminary",
    }));
}

function buildBeams(
  compiledProject = {},
  structuralGrid = {},
  bbox = bboxOf(compiledProject),
) {
  const explicitBeams = toArray(compiledProject.beams).map((beam, index) => ({
    id: beam.id || memberId("BM", index),
    memberId: beam.memberId || memberId("BM", index),
    levelId: levelIdOf(beam),
    type: beam.type || "preliminary_beam",
    start: point(beam.start),
    end: point(beam.end),
    status: "preliminary",
  }));
  if (explicitBeams.length) return explicitBeams;
  return toArray(structuralGrid.y_axes)
    .slice(1, -1)
    .map((axis, index) => ({
      id: memberId("BM", index),
      memberId: memberId("BM", index),
      levelId: "level-0",
      type: "preliminary_grid_beam",
      start: { x: bbox.min_x, y: axis.position_m },
      end: { x: bbox.max_x, y: axis.position_m },
      status: "preliminary",
    }));
}

function buildRoofFraming(
  compiledProject = {},
  bbox = bboxOf(compiledProject),
) {
  const roofOutline = toArray(compiledProject.roof_primitives).find((roof) =>
    hasPolygon(roof.polygon),
  );
  const outline = roofOutline
    ? polygon(roofOutline.polygon)
    : candidateFootprint(compiledProject);
  const roofBbox = buildBoundingBoxFromPolygon(outline);
  const rafterCount = Math.max(
    4,
    Math.min(18, Math.ceil((roofBbox.width || 10) / 0.9)),
  );
  const rafters = Array.from({ length: rafterCount }, (_, index) => {
    const x =
      roofBbox.min_x +
      ((index + 0.5) * (roofBbox.width || bbox.width || 10)) / rafterCount;
    return {
      id: memberId("RFT", index),
      memberId: memberId("RFT", index),
      type: "preliminary_rafter",
      start: { x: roundMetric(x), y: roofBbox.min_y },
      end: { x: roundMetric(x), y: roofBbox.max_y },
      spacing_m: roundMetric((roofBbox.width || 10) / rafterCount),
      status: "preliminary",
    };
  });
  return {
    id: roofOutline?.id || "roof-framing-derived-001",
    memberId: "ROOF-001",
    type: "preliminary_roof_framing",
    outline,
    rafters,
    levelId: levelIdOf(
      roofOutline || { levelId: levelsOf(compiledProject).at(-1)?.id },
    ),
    status: "preliminary",
  };
}

function buildSchedules({
  foundations,
  slabs,
  beams,
  columns,
  loadBearingWalls,
  roofFraming,
}) {
  return {
    foundations: foundations.map((member) => ({
      memberId: member.memberId,
      type: member.type,
      status: member.status,
    })),
    slabs: slabs.map((member) => ({
      memberId: member.memberId,
      levelId: member.levelId,
      type: member.type,
      thickness_m: member.thickness_m,
    })),
    beams: beams.map((member) => ({
      memberId: member.memberId,
      levelId: member.levelId,
      type: member.type,
    })),
    columns: columns.map((member) => ({
      memberId: member.memberId,
      levelId: member.levelId,
      type: member.type,
    })),
    loadBearingWalls: loadBearingWalls.map((member) => ({
      memberId: member.memberId,
      levelId: member.levelId,
      type: member.type,
    })),
    roofFraming: roofFraming.rafters.map((member) => ({
      memberId: member.memberId,
      type: member.type,
      spacing_m: member.spacing_m,
    })),
  };
}

export function buildStructuralModelFromCompiledProject({
  compiledProject,
  jurisdiction = null,
  jurisdictionPack = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required to build StructuralModel.",
    );
  }
  const bbox = bboxOf(compiledProject);
  const structuralGrid = buildGrid(compiledProject, bbox);
  const foundationSystem = buildFoundationSystem(compiledProject, bbox);
  const slabs = buildSlabs(compiledProject);
  const columns = buildColumns(compiledProject, structuralGrid);
  const beams = buildBeams(compiledProject, structuralGrid, bbox);
  const loadBearingWalls = buildLoadBearingWalls(compiledProject);
  const roofFraming = buildRoofFraming(compiledProject, bbox);
  const foundations = foundationSystem.foundations;
  const designBasis = buildDesignBasis(compiledProject);
  const assumptions = buildAssumptions(compiledProject);
  const preliminaryLoadPathNotes = [
    "Loads conceptually transfer from roof framing to beams/load-bearing walls, then to slabs/foundations.",
    "Column/grid coordination is indicative and must be rationalized by structural engineer calculations.",
    "Lateral stability, uplift, disproportionate collapse, and movement joints are not calculated.",
  ];
  const jurisdictionPackSummary = jurisdictionPack
    ? summarizeJurisdictionPack(jurisdictionPack)
    : null;
  const disclaimers = [
    STRUCTURAL_REVIEW_DISCLAIMER,
    jurisdictionPackSummary?.disclaimers?.structural,
    jurisdictionPackSummary?.disclaimers?.preliminaryAdvisory,
  ].filter(Boolean);
  const partial = {
    version: STRUCTURAL_MODEL_VERSION,
    geometryHash: compiledProject.geometryHash,
    sourceProjectGraphHash: sourceProjectGraphHashOf(compiledProject),
    jurisdiction:
      jurisdictionPackSummary?.jurisdictionId ||
      jurisdiction ||
      jurisdictionOf(compiledProject),
    jurisdictionPack: jurisdictionPackSummary,
    jurisdictionPackVersion: jurisdictionPackSummary?.version || null,
    designBasis,
    assumptions,
    disclaimers,
    reviewRequired: true,
    foundationSystem,
    foundations,
    slabs,
    beams,
    columns,
    loadBearingWalls,
    roofFraming,
    structuralGrid,
    memberIds: [
      ...foundations,
      ...slabs,
      ...beams,
      ...columns,
      ...loadBearingWalls,
      ...roofFraming.rafters,
    ].map((member) => member.memberId),
    preliminaryLoadPathNotes,
    schedules: buildSchedules({
      foundations,
      slabs,
      beams,
      columns,
      loadBearingWalls,
      roofFraming,
    }),
    requiredCadLayers: [...REQUIRED_STRUCTURAL_CAD_LAYERS],
    imageProviderUsed: "none",
    technicalDrawing: true,
  };
  const structuralModelHash = createStableHash(JSON.stringify(partial));
  return {
    structuralModelId: createStableId(
      "structural-model",
      compiledProject.geometryHash,
      structuralModelHash,
    ),
    structuralModelHash,
    ...partial,
  };
}

function structuralViewBox(structuralModel = {}) {
  const points = [
    ...toArray(structuralModel.foundationSystem?.foundations).flatMap(
      (foundation) => foundation.polygon || [],
    ),
    ...toArray(structuralModel.slabs).flatMap((slab) => slab.polygon || []),
    ...(structuralModel.roofFraming?.outline || []),
  ];
  const bbox = buildBoundingBoxFromPolygon(
    points.length ? points : rectangleToPolygon(0, 0, 12, 8),
  );
  const pad = 1.5;
  return {
    bbox,
    minX: bbox.min_x - pad,
    minY: bbox.min_y - pad,
    width: Math.max(1, bbox.width + pad * 2),
    height: Math.max(1, bbox.height + pad * 2),
  };
}

function svgPoint(pointValue = {}, viewBox = structuralViewBox()) {
  const x =
    ((Number(pointValue.x || 0) - viewBox.minX) / viewBox.width) * 860 + 70;
  const y =
    620 - ((Number(pointValue.y || 0) - viewBox.minY) / viewBox.height) * 520;
  return { x: roundMetric(x, 2), y: roundMetric(y, 2) };
}

function svgPolyline(points = [], viewBox, className, extra = "") {
  const coords = polygon(points)
    .map((entry) => {
      const p = svgPoint(entry, viewBox);
      return `${p.x},${p.y}`;
    })
    .join(" ");
  return `<polygon class="${className}" points="${coords}" ${extra}/>`;
}

function svgLine(start, end, viewBox, className, extra = "") {
  const a = svgPoint(start, viewBox);
  const b = svgPoint(end, viewBox);
  return `<line class="${className}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${extra}/>`;
}

function svgText(pointValue, viewBox, text, className = "s-note", dy = 0) {
  const p = svgPoint(pointValue, viewBox);
  return `<text class="${className}" x="${p.x}" y="${roundMetric(p.y + dy, 2)}">${String(text || "")}</text>`;
}

function gridSvg(structuralModel = {}, viewBox) {
  const bbox = viewBox.bbox;
  const xLines = toArray(structuralModel.structuralGrid?.x_axes)
    .map((axis) => {
      const top = svgPoint({ x: axis.position_m, y: bbox.max_y }, viewBox);
      const bottom = svgPoint({ x: axis.position_m, y: bbox.min_y }, viewBox);
      return `<line class="s-grid-line" x1="${top.x}" y1="${top.y}" x2="${bottom.x}" y2="${bottom.y}"/><circle class="s-grid-bubble" cx="${top.x}" cy="${top.y - 18}" r="12"/><text class="s-grid-label" x="${top.x - 4}" y="${top.y - 14}">${axis.label}</text>`;
    })
    .join("");
  const yLines = toArray(structuralModel.structuralGrid?.y_axes)
    .map((axis) => {
      const left = svgPoint({ x: bbox.min_x, y: axis.position_m }, viewBox);
      const right = svgPoint({ x: bbox.max_x, y: axis.position_m }, viewBox);
      return `<line class="s-grid-line" x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}"/><circle class="s-grid-bubble" cx="${left.x - 18}" cy="${left.y}" r="12"/><text class="s-grid-label" x="${left.x - 22}" y="${left.y + 4}">${axis.label}</text>`;
    })
    .join("");
  return `<g class="s-grid">${xLines}${yLines}</g>`;
}

function commonSvgShell({ panelType, title, structuralModel, body }) {
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700" role="img" aria-label="${title}">
<metadata>{"panelType":"${panelType}","geometryHash":"${structuralModel.geometryHash}","structuralModelHash":"${structuralModel.structuralModelHash}","technicalDrawing":true,"imageProviderUsed":"none"}</metadata>
<style>
.sheet{fill:#f8faf5;stroke:#263238;stroke-width:2}
.title{font:700 24px Arial;fill:#1d2b21}
.subtitle,.s-note{font:13px Arial;fill:#263238}
.disclaimer{font:700 13px Arial;fill:#8a3b12}
.s-foundation{fill:#d7ccc8;stroke:#5d4037;stroke-width:3}
.s-slab{fill:#e8eef2;stroke:#455a64;stroke-width:2}
.s-beam{stroke:#bf360c;stroke-width:5}
.s-column{fill:#bf360c;stroke:#5d1f0d;stroke-width:2}
.s-roof{fill:none;stroke:#6a1b9a;stroke-width:2}
.s-rafter{stroke:#6a1b9a;stroke-width:1.5}
.s-grid-line{stroke:#1565c0;stroke-width:1;stroke-dasharray:7 5}
.s-grid-bubble{fill:#fff;stroke:#1565c0;stroke-width:2}
.s-grid-label{font:700 11px Arial;fill:#1565c0}
.member-tag{font:700 12px Arial;fill:#111}
.s-note-box{fill:#fff8e1;stroke:#8a6d1d;stroke-width:1.5}
</style>
<rect class="sheet" x="10" y="10" width="980" height="680"/>
<text class="title" x="36" y="46">${title}</text>
<text class="subtitle" x="36" y="68">PRELIMINARY STRUCTURAL - ENGINEER REVIEW REQUIRED</text>
${body}
<text class="disclaimer" x="36" y="670">${STRUCTURAL_REVIEW_DISCLAIMER}</text>
</svg>`;
  return {
    panelType,
    drawingType: "structural",
    width: 1000,
    height: 700,
    svgString,
    svgHash: createStableHash(svgString),
    status: "ready",
    technicalDrawing: true,
    imageProviderUsed: "none",
    providerUsed: "deterministic_svg",
    renderer: "deterministic_svg",
    geometryHash: structuralModel.geometryHash,
    sourceGeometryHash: structuralModel.geometryHash,
    sourceProjectGraphHash: structuralModel.sourceProjectGraphHash,
    structuralModelHash: structuralModel.structuralModelHash,
    reviewRequired: true,
    metadata: {
      version: STRUCTURAL_DRAWING_PANEL_VERSION,
      structuralModelHash: structuralModel.structuralModelHash,
      reviewRequired: true,
      disclaimer: STRUCTURAL_REVIEW_DISCLAIMER,
      imageProviderUsed: "none",
      technicalDrawing: true,
    },
    technicalQualityMetadata: {
      version: STRUCTURAL_DRAWING_PANEL_VERSION,
      panel_type: panelType,
      geometryHash: structuralModel.geometryHash,
      sourceGeometryHash: structuralModel.geometryHash,
      structuralModelHash: structuralModel.structuralModelHash,
      memberTags: structuralModel.memberIds,
      gridAxisCount:
        toArray(structuralModel.structuralGrid?.x_axes).length +
        toArray(structuralModel.structuralGrid?.y_axes).length,
      reviewRequired: true,
      imageProviderUsed: "none",
    },
  };
}

function foundationPanel(structuralModel, viewBox) {
  const body = [
    gridSvg(structuralModel, viewBox),
    ...toArray(structuralModel.foundationSystem?.foundations).map(
      (foundation) => svgPolyline(foundation.polygon, viewBox, "s-foundation"),
    ),
    ...toArray(structuralModel.foundationSystem?.foundations).map(
      (foundation) =>
        svgText(
          computeCentroid(foundation.polygon),
          viewBox,
          foundation.memberId,
          "member-tag",
        ),
    ),
  ].join("");
  return commonSvgShell({
    panelType: "foundation_plan",
    title: "STRUCTURAL FOUNDATION PLAN",
    structuralModel,
    body,
  });
}

function floorPanel(structuralModel, viewBox, levelId, panelType, title) {
  const slabs = toArray(structuralModel.slabs).filter(
    (slab) => slab.levelId === levelId,
  );
  const columns = toArray(structuralModel.columns).filter(
    (column) =>
      column.levelId === levelId || panelType === "structural_ground_floor",
  );
  const beams = toArray(structuralModel.beams).filter(
    (beam) =>
      beam.levelId === levelId || panelType === "structural_ground_floor",
  );
  const body = [
    gridSvg(structuralModel, viewBox),
    ...slabs.map((slab) => svgPolyline(slab.polygon, viewBox, "s-slab")),
    ...beams.map((beam) => svgLine(beam.start, beam.end, viewBox, "s-beam")),
    ...columns.map((column) => {
      const p = svgPoint(column.position, viewBox);
      return `<rect class="s-column" x="${p.x - 7}" y="${p.y - 7}" width="14" height="14"/><text class="member-tag" x="${p.x + 10}" y="${p.y - 8}">${column.memberId}</text>`;
    }),
    ...beams.map((beam) =>
      svgText(
        {
          x: (beam.start.x + beam.end.x) / 2,
          y: (beam.start.y + beam.end.y) / 2,
        },
        viewBox,
        beam.memberId,
        "member-tag",
        -6,
      ),
    ),
  ].join("");
  return commonSvgShell({ panelType, title, structuralModel, body });
}

function roofPanel(structuralModel, viewBox) {
  const body = [
    gridSvg(structuralModel, viewBox),
    svgPolyline(
      structuralModel.roofFraming?.outline || [],
      viewBox,
      "s-roof",
      'fill="none"',
    ),
    ...toArray(structuralModel.roofFraming?.rafters).map((rafter) =>
      svgLine(rafter.start, rafter.end, viewBox, "s-rafter"),
    ),
    ...toArray(structuralModel.roofFraming?.rafters)
      .slice(0, 6)
      .map((rafter) =>
        svgText(
          {
            x: (rafter.start.x + rafter.end.x) / 2,
            y: (rafter.start.y + rafter.end.y) / 2,
          },
          viewBox,
          rafter.memberId,
          "member-tag",
        ),
      ),
  ].join("");
  return commonSvgShell({
    panelType: "roof_framing_plan",
    title: "STRUCTURAL ROOF FRAMING PLAN",
    structuralModel,
    body,
  });
}

function sectionPanel(structuralModel) {
  const body = `<g class="s-section">
<line class="s-foundation" x1="120" y1="560" x2="880" y2="560"/>
<line class="s-column" x1="230" y1="560" x2="230" y2="210"/>
<line class="s-column" x1="770" y1="560" x2="770" y2="210"/>
<line class="s-beam" x1="200" y1="300" x2="800" y2="300"/>
<line class="s-roof" x1="160" y1="210" x2="500" y2="110"/>
<line class="s-roof" x1="500" y1="110" x2="840" y2="210"/>
<text class="member-tag" x="240" y="284">PRELIMINARY LOAD PATH</text>
<text class="s-note" x="120" y="595">Loads: roof framing -> beams/walls/columns -> foundations. Engineer calculations required.</text>
</g>`;
  return commonSvgShell({
    panelType: "structural_section",
    title: "STRUCTURAL SECTION",
    structuralModel,
    body,
  });
}

function notesPanel(structuralModel) {
  const notes = [
    ...structuralModel.preliminaryLoadPathNotes,
    ...structuralModel.assumptions,
  ];
  const body = `<rect class="s-note-box" x="44" y="90" width="912" height="500"/>
${notes
  .slice(0, 10)
  .map(
    (note, index) =>
      `<text class="s-note" x="68" y="${130 + index * 34}">${index + 1}. ${note}</text>`,
  )
  .join("")}
<text class="member-tag" x="68" y="520">Structural model hash: ${structuralModel.structuralModelHash}</text>`;
  return commonSvgShell({
    panelType: "structural_notes",
    title: "STRUCTURAL NOTES",
    structuralModel,
    body,
  });
}

export function buildStructuralDrawingPanelsFromStructuralModel(
  structuralModel = {},
) {
  const viewBox = structuralViewBox(structuralModel);
  const levels = [
    ...new Set(toArray(structuralModel.slabs).map((slab) => slab.levelId)),
  ];
  const panels = {
    foundation_plan: foundationPanel(structuralModel, viewBox),
    structural_ground_floor: floorPanel(
      structuralModel,
      viewBox,
      levels[0] || "level-0",
      "structural_ground_floor",
      "STRUCTURAL GROUND FLOOR PLAN",
    ),
    roof_framing_plan: roofPanel(structuralModel, viewBox),
    structural_section: sectionPanel(structuralModel),
    structural_notes: notesPanel(structuralModel),
  };
  if (levels.length > 1) {
    panels.structural_upper_floor = floorPanel(
      structuralModel,
      viewBox,
      levels[1],
      "structural_upper_floor",
      "STRUCTURAL UPPER FLOOR PLAN",
    );
  }
  return panels;
}

export function buildStructuralDrawingPanelsFromCompiledProject({
  compiledProject,
  jurisdiction = null,
  jurisdictionPack = null,
} = {}) {
  const structuralModel = buildStructuralModelFromCompiledProject({
    compiledProject,
    jurisdiction,
    jurisdictionPack,
  });
  return {
    structuralModel,
    structuralPanels:
      buildStructuralDrawingPanelsFromStructuralModel(structuralModel),
  };
}

export function validateStructuralModel(
  structuralModel = {},
  { compiledProject = null } = {},
) {
  const errors = [];
  const warnings = [];
  if (structuralModel.version !== STRUCTURAL_MODEL_VERSION) {
    errors.push({ code: "STRUCTURAL_MODEL_VERSION_INVALID" });
  }
  if (!structuralModel.structuralModelHash) {
    errors.push({ code: "STRUCTURAL_MODEL_HASH_MISSING" });
  }
  if (!structuralModel.geometryHash) {
    errors.push({ code: "STRUCTURAL_MODEL_GEOMETRY_HASH_MISSING" });
  }
  if (
    compiledProject?.geometryHash &&
    structuralModel.geometryHash !== compiledProject.geometryHash
  ) {
    errors.push({ code: "STRUCTURAL_MODEL_GEOMETRY_HASH_MISMATCH" });
  }
  if (structuralModel.reviewRequired !== true) {
    errors.push({ code: "STRUCTURAL_MODEL_REVIEW_REQUIRED_MISSING" });
  }
  if (
    !toArray(structuralModel.disclaimers)
      .join(" ")
      .match(/licensed structural engineer/i)
  ) {
    errors.push({ code: "STRUCTURAL_MODEL_DISCLAIMER_MISSING" });
  }
  if (!toArray(structuralModel.foundationSystem?.foundations).length) {
    errors.push({ code: "STRUCTURAL_MODEL_FOUNDATIONS_MISSING" });
  }
  if (!toArray(structuralModel.slabs).length) {
    errors.push({ code: "STRUCTURAL_MODEL_SLABS_MISSING" });
  }
  if (!toArray(structuralModel.roofFraming?.rafters).length) {
    errors.push({ code: "STRUCTURAL_MODEL_ROOF_FRAMING_MISSING" });
  }
  if (structuralModel.imageProviderUsed !== "none") {
    errors.push({ code: "STRUCTURAL_MODEL_IMAGE_PROVIDER_FORBIDDEN" });
  }
  REQUIRED_STRUCTURAL_CAD_LAYERS.forEach((layerName) => {
    if (!toArray(structuralModel.requiredCadLayers).includes(layerName)) {
      errors.push({
        code: "STRUCTURAL_MODEL_REQUIRED_LAYER_MISSING",
        layerName,
      });
    }
  });
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks: {
      hasStructuralModelHash: Boolean(structuralModel.structuralModelHash),
      reviewRequired: structuralModel.reviewRequired === true,
      imageProviderUsed: structuralModel.imageProviderUsed || null,
      foundationCount: toArray(structuralModel.foundationSystem?.foundations)
        .length,
      slabCount: toArray(structuralModel.slabs).length,
      roofFramingCount: toArray(structuralModel.roofFraming?.rafters).length,
    },
  };
}

export default {
  STRUCTURAL_MODEL_VERSION,
  STRUCTURAL_DRAWING_PANEL_VERSION,
  STRUCTURAL_REVIEW_DISCLAIMER,
  REQUIRED_STRUCTURAL_CAD_LAYERS,
  buildStructuralModelFromCompiledProject,
  buildStructuralDrawingPanelsFromStructuralModel,
  buildStructuralDrawingPanelsFromCompiledProject,
  validateStructuralModel,
};
