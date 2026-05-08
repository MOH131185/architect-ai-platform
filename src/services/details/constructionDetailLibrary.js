import {
  createStableHash,
  createStableId,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { summarizeJurisdictionPack } from "../jurisdiction/jurisdictionPackService.js";

export const CONSTRUCTION_DETAIL_LIBRARY_VERSION =
  "construction-detail-library-v1";
export const CONSTRUCTION_DETAIL_PANEL_VERSION = "construction-detail-panel-v1";

export const DETAIL_REVIEW_DISCLAIMER =
  "PRELIMINARY CONSTRUCTION DETAIL INFORMATION ONLY - not for construction. Review, coordination, code compliance, and approval by the responsible architect and engineer are required.";

export const REQUIRED_CONSTRUCTION_DETAIL_TYPES = Object.freeze([
  "wall_foundation_junction",
  "floor_wall_junction",
  "roof_eaves_detail",
  "roof_ridge_detail",
  "window_head_sill_jamb",
  "door_threshold_detail",
  "stair_detail",
  "wet_room_floor_wall_detail",
  "drainage_inspection_chamber",
  "mep_riser_detail",
]);

export const REQUIRED_DETAIL_CAD_LAYERS = Object.freeze([
  "A-DETAIL",
  "A-DETAIL-DIMS",
  "A-DETAIL-TEXT",
  "A-DETAIL-HATCH",
  "A-CALLOUT",
  "D-CONCRETE",
  "D-MASONRY",
  "D-INSULATION",
  "D-TIMBER",
  "D-MEMBRANE",
  "D-EARTH",
  "D-GLAZING",
  "D-METAL",
]);

const DETAIL_DEFINITIONS = Object.freeze([
  {
    detailType: "wall_foundation_junction",
    detailTitle: "Wall/Foundation Junction",
    detailScale: "1:10",
    group: "architectural",
    materialLayers: ["earth", "concrete", "masonry", "insulation", "membrane"],
    sourceElements: ["foundations", "walls", "slabs"],
  },
  {
    detailType: "floor_wall_junction",
    detailTitle: "Floor/Wall Junction",
    detailScale: "1:10",
    group: "architectural",
    materialLayers: ["concrete", "masonry", "insulation", "timber"],
    sourceElements: ["slabs", "walls"],
  },
  {
    detailType: "roof_eaves_detail",
    detailTitle: "Roof Eaves Detail",
    detailScale: "1:5",
    group: "envelope",
    materialLayers: ["timber", "insulation", "membrane", "masonry"],
    sourceElements: ["roof", "walls"],
  },
  {
    detailType: "roof_ridge_detail",
    detailTitle: "Roof Ridge Detail",
    detailScale: "1:5",
    group: "envelope",
    materialLayers: ["timber", "insulation", "membrane", "metal"],
    sourceElements: ["roof"],
  },
  {
    detailType: "window_head_sill_jamb",
    detailTitle: "Window Head/Sill/Jamb",
    detailScale: "1:5",
    group: "envelope",
    materialLayers: ["masonry", "insulation", "glazing", "membrane", "metal"],
    sourceElements: ["openings", "walls"],
  },
  {
    detailType: "door_threshold_detail",
    detailTitle: "Door Threshold Detail",
    detailScale: "1:5",
    group: "architectural",
    materialLayers: ["concrete", "masonry", "timber", "membrane", "metal"],
    sourceElements: ["openings", "slabs"],
  },
  {
    detailType: "stair_detail",
    detailTitle: "Stair Detail",
    detailScale: "1:10",
    group: "architectural",
    materialLayers: ["timber", "metal", "concrete"],
    sourceElements: ["stairs", "levels"],
  },
  {
    detailType: "wet_room_floor_wall_detail",
    detailTitle: "Wet Room Floor/Wall Detail",
    detailScale: "1:5",
    group: "wetroom_drainage",
    materialLayers: ["concrete", "membrane", "insulation", "masonry"],
    sourceElements: ["rooms", "slabs"],
  },
  {
    detailType: "drainage_inspection_chamber",
    detailTitle: "Drainage Inspection Chamber",
    detailScale: "1:20",
    group: "wetroom_drainage",
    materialLayers: ["earth", "concrete", "masonry", "membrane"],
    sourceElements: ["site", "rooms"],
  },
  {
    detailType: "mep_riser_detail",
    detailTitle: "MEP Riser Detail",
    detailScale: "1:10",
    group: "mep_riser",
    materialLayers: ["masonry", "metal", "membrane", "insulation"],
    sourceElements: ["rooms", "levels"],
  },
]);

function toArray(value) {
  return Array.isArray(value) ? value : [];
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

function projectContext(compiledProject = {}) {
  return {
    levelCount: toArray(compiledProject.levels).length || 1,
    roomCount: toArray(compiledProject.rooms).length,
    wallCount: toArray(compiledProject.walls).length,
    openingCount: toArray(compiledProject.openings).length,
    hasWetRooms: toArray(compiledProject.rooms).some((room) =>
      /bath|wc|toilet|shower|wet|utility|laundry/i.test(
        `${room.type || ""} ${room.roomType || ""} ${room.name || ""}`,
      ),
    ),
    hasStairs: toArray(compiledProject.stairs).length > 0,
    hasRoof:
      toArray(compiledProject.roof_primitives).length > 0 ||
      Boolean(compiledProject.roof),
  };
}

function layerForMaterial(material) {
  return (
    {
      concrete: "D-CONCRETE",
      masonry: "D-MASONRY",
      insulation: "D-INSULATION",
      timber: "D-TIMBER",
      membrane: "D-MEMBRANE",
      earth: "D-EARTH",
      glazing: "D-GLAZING",
      metal: "D-METAL",
    }[material] || "A-DETAIL-HATCH"
  );
}

function detailBasePoint(index) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: roundMetric(column * 5.2),
    y: roundMetric(row * -3.4),
  };
}

function buildDetailDxfEntities(definition, index) {
  const base = detailBasePoint(index);
  const id = definition.detailType;
  const materialHatches = definition.materialLayers.map(
    (material, layerIndex) => {
      const x0 = roundMetric(base.x + 0.25 + layerIndex * 0.34);
      const y0 = roundMetric(base.y + 0.35);
      return {
        type: "HATCH",
        layer: layerForMaterial(material),
        points: [
          { x: x0, y: y0 },
          { x: roundMetric(x0 + 0.28), y: y0 },
          { x: roundMetric(x0 + 0.28), y: roundMetric(y0 + 1.3) },
          { x: x0, y: roundMetric(y0 + 1.3) },
        ],
        material,
        role: "detail_material_hatch",
      };
    },
  );

  return [
    {
      type: "LWPOLYLINE",
      layer: "A-DETAIL",
      points: [
        { x: base.x, y: base.y },
        { x: roundMetric(base.x + 4.4), y: base.y },
        { x: roundMetric(base.x + 4.4), y: roundMetric(base.y + 2.6) },
        { x: base.x, y: roundMetric(base.y + 2.6) },
      ],
      closed: true,
      role: "detail_outline",
    },
    {
      type: "HATCH",
      layer: "A-DETAIL-HATCH",
      points: [
        { x: roundMetric(base.x + 2.65), y: roundMetric(base.y + 0.35) },
        { x: roundMetric(base.x + 3.15), y: roundMetric(base.y + 0.35) },
        { x: roundMetric(base.x + 3.15), y: roundMetric(base.y + 1.3) },
        { x: roundMetric(base.x + 2.65), y: roundMetric(base.y + 1.3) },
      ],
      material: "generic_detail",
      role: "detail_material_hatch",
    },
    ...materialHatches,
    {
      type: "LINE",
      layer: "A-DETAIL",
      start: { x: roundMetric(base.x + 0.3), y: roundMetric(base.y + 1.9) },
      end: { x: roundMetric(base.x + 4.05), y: roundMetric(base.y + 1.9) },
      role: "detail_section_line",
    },
    {
      type: "DIMENSION",
      layer: "A-DETAIL-DIMS",
      start: { x: base.x, y: base.y },
      end: { x: roundMetric(base.x + 4.4), y: base.y },
      offset: { x: base.x, y: roundMetric(base.y - 0.35) },
      text: `${definition.detailScale} coordination dimension`,
      role: "detail_dimension",
    },
    {
      type: "TEXT",
      layer: "A-DETAIL-TEXT",
      point: { x: base.x, y: roundMetric(base.y + 2.9) },
      text: `${definition.detailTitle} ${definition.detailScale}`,
      height: 0.18,
      role: "detail_title",
    },
    {
      type: "TEXT",
      layer: "A-CALLOUT",
      point: { x: roundMetric(base.x + 3.1), y: roundMetric(base.y + 2.35) },
      text: `CALLOUT ${id}`,
      height: 0.14,
      role: "detail_callout_reference",
    },
    {
      type: "INSERT",
      layer: "A-CALLOUT",
      blockName: "DETAIL_CALLOUT",
      point: { x: roundMetric(base.x + 3.85), y: roundMetric(base.y + 2.15) },
      role: "detail_callout",
    },
  ];
}

function svgEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function materialPatternDefinitions() {
  return `<defs>
<pattern id="hatch-concrete" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 L8 0" stroke="#57606a" stroke-width="1"/></pattern>
<pattern id="hatch-masonry" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 0 H12 M0 4 H12 M0 8 H12 M6 0 V4 M0 4 V8" stroke="#784421" stroke-width="1"/></pattern>
<pattern id="hatch-insulation" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 C3 0 6 8 9 4 S12 4 12 4" stroke="#c084fc" stroke-width="1" fill="none"/></pattern>
<pattern id="hatch-timber" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 2 H10 M0 7 H10" stroke="#8b5a2b" stroke-width="1"/></pattern>
<pattern id="hatch-earth" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#6b4f2a"/><circle cx="8" cy="6" r="1" fill="#6b4f2a"/></pattern>
<pattern id="hatch-glazing" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 L8 0" stroke="#2563eb" stroke-width="1"/></pattern>
<pattern id="hatch-membrane" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3 H6" stroke="#dc2626" stroke-width="1"/></pattern>
</defs>`;
}

function hatchClass(material) {
  return `hatch-${material}`;
}

function buildDetailSvg(definition, index, detailId) {
  const x = 28 + (index % 2) * 250;
  const y = 54 + Math.floor(index / 2) * 170;
  const hatches = definition.materialLayers
    .map((material, layerIndex) => {
      const fill = `url(#hatch-${material})`;
      return `<rect class="${hatchClass(material)} detail-hatch" x="${x + 14 + layerIndex * 24}" y="${y + 36}" width="22" height="86" fill="${fill}" stroke="#1f2937"/>`;
    })
    .join("");
  return `<g class="construction-detail" data-detail-id="${svgEscape(detailId)}" data-detail-type="${svgEscape(definition.detailType)}">
<rect class="detail-frame" x="${x}" y="${y}" width="220" height="142"/>
<text class="detail-title" x="${x + 10}" y="${y + 20}">${svgEscape(definition.detailTitle)}</text>
<text class="detail-scale" x="${x + 10}" y="${y + 38}">Scale ${svgEscape(definition.detailScale)}</text>
${hatches}
<line class="detail-line" x1="${x + 16}" y1="${y + 122}" x2="${x + 196}" y2="${y + 122}"/>
<line class="detail-dimension" x1="${x + 16}" y1="${y + 132}" x2="${x + 196}" y2="${y + 132}"/>
<text class="dimension-label" x="${x + 68}" y="${y + 128}">dimension</text>
<circle class="callout-marker" cx="${x + 190}" cy="${y + 30}" r="12"/>
<text class="callout-label" x="${x + 176}" y="${y + 34}">${svgEscape(detailId)}</text>
</g>`;
}

function buildConstructionDetail(definition, index, context) {
  const detailId = createStableId(
    "construction-detail",
    context.geometryHash,
    definition.detailType,
  );
  const annotations = [
    `${definition.detailTitle} is preliminary and coordination-only.`,
    "Verify dimensions, materials, fire, acoustic, waterproofing, and structural requirements before construction.",
  ];
  const dimensions = [
    {
      id: `${definition.detailType}-dimension-1`,
      label: `${definition.detailScale} coordination dimension`,
      layer: "A-DETAIL-DIMS",
    },
  ];
  const hatches = definition.materialLayers.map((material) => ({
    material,
    layer: layerForMaterial(material),
    pattern: `hatch-${material}`,
  }));
  const dxfEntities = buildDetailDxfEntities(definition, index).map((entity) =>
    entity.role === "detail_callout_reference"
      ? { ...entity, text: `CALLOUT ${detailId}` }
      : entity,
  );
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220" data-technical-drawing="true" data-image-provider-used="none">${materialPatternDefinitions()}${buildDetailSvg(definition, 0, detailId)}<text class="review" x="18" y="204">${svgEscape(DETAIL_REVIEW_DISCLAIMER)}</text></svg>`;
  const draft = {
    version: CONSTRUCTION_DETAIL_LIBRARY_VERSION,
    detailId,
    detailType: definition.detailType,
    detailTitle: definition.detailTitle,
    detailScale: definition.detailScale,
    group: definition.group,
    geometryHash: context.geometryHash,
    sourceProjectGraphHash: context.sourceProjectGraphHash,
    jurisdiction: context.jurisdiction,
    sourceElements: definition.sourceElements,
    materialLayers: definition.materialLayers,
    annotations,
    dimensions,
    hatches,
    reviewRequired: true,
    disclaimer: DETAIL_REVIEW_DISCLAIMER,
    relatedDrawingRefs: [`REF-${String(index + 1).padStart(2, "0")}`],
    cadLayers: [...REQUIRED_DETAIL_CAD_LAYERS],
    svgString,
    dxfEntities,
    imageProviderUsed: "none",
    technicalDrawing: true,
  };
  return {
    ...draft,
    detailHash: createStableHash(JSON.stringify(draft)),
  };
}

export function buildConstructionDetailLibraryFromCompiledProject({
  compiledProject,
  jurisdiction = null,
  jurisdictionPack = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required to build construction details.",
    );
  }
  const context = {
    geometryHash: compiledProject.geometryHash,
    sourceProjectGraphHash: sourceProjectGraphHashOf(compiledProject),
    jurisdiction:
      jurisdictionPack?.jurisdictionId ||
      jurisdictionOf(compiledProject, jurisdiction),
    projectContext: projectContext(compiledProject),
  };
  const jurisdictionPackSummary = jurisdictionPack
    ? summarizeJurisdictionPack(jurisdictionPack)
    : null;
  const disclaimers = [
    DETAIL_REVIEW_DISCLAIMER,
    jurisdictionPackSummary?.disclaimers?.details,
    jurisdictionPackSummary?.disclaimers?.preliminaryAdvisory,
  ].filter(Boolean);
  const details = DETAIL_DEFINITIONS.map((definition, index) =>
    buildConstructionDetail(definition, index, context),
  );
  const draft = {
    version: CONSTRUCTION_DETAIL_LIBRARY_VERSION,
    detailLibraryId: createStableId(
      "construction-detail-library",
      context.geometryHash,
    ),
    geometryHash: context.geometryHash,
    sourceProjectGraphHash: context.sourceProjectGraphHash,
    jurisdiction: context.jurisdiction,
    jurisdictionPack: jurisdictionPackSummary,
    jurisdictionPackVersion: jurisdictionPackSummary?.version || null,
    reviewRequired: true,
    disclaimer: DETAIL_REVIEW_DISCLAIMER,
    disclaimers,
    requiredDetailTypes: [...REQUIRED_CONSTRUCTION_DETAIL_TYPES],
    requiredCadLayers: [...REQUIRED_DETAIL_CAD_LAYERS],
    details,
    detailIds: details.map((detail) => detail.detailId),
    projectContext: context.projectContext,
    imageProviderUsed: "none",
    technicalDrawing: true,
  };
  return {
    ...draft,
    detailLibraryHash: createStableHash(JSON.stringify(draft)),
  };
}

function panelTitle(panelType) {
  return {
    detail_sheet_architectural: "Architectural Construction Details",
    detail_sheet_envelope: "Envelope Construction Details",
    detail_sheet_wetroom_drainage: "Wet Room and Drainage Details",
    detail_sheet_mep_riser: "MEP Riser Detail",
    detail_notes: "Construction Detail Notes",
  }[panelType];
}

function detailsForPanel(detailLibrary, panelType) {
  const details = toArray(detailLibrary.details);
  if (panelType === "detail_sheet_architectural") {
    return details.filter((detail) => detail.group === "architectural");
  }
  if (panelType === "detail_sheet_envelope") {
    return details.filter((detail) => detail.group === "envelope");
  }
  if (panelType === "detail_sheet_wetroom_drainage") {
    return details.filter((detail) => detail.group === "wetroom_drainage");
  }
  if (panelType === "detail_sheet_mep_riser") {
    return details.filter((detail) => detail.group === "mep_riser");
  }
  return details;
}

function buildPanelSvg(detailLibrary, panelType) {
  const details = detailsForPanel(detailLibrary, panelType);
  const detailMarkup =
    panelType === "detail_notes"
      ? toArray(detailLibrary.details)
          .map(
            (detail, index) =>
              `<text class="detail-note" x="48" y="${110 + index * 20}">${svgEscape(detail.detailId)} - ${svgEscape(detail.detailTitle)} - ${svgEscape(detail.detailScale)}</text>`,
          )
          .join("")
      : details
          .map((detail, index) =>
            buildDetailSvg(detail, index, detail.detailId),
          )
          .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="620" viewBox="0 0 820 620" role="img" data-panel-type="${panelType}" data-technical-drawing="true" data-image-provider-used="none">
${materialPatternDefinitions()}
<style>
.sheet{fill:#fbfcf8;stroke:#1f3552;stroke-width:2}.title{font:700 23px monospace;fill:#15233a}.subtitle,.detail-note{font:13px monospace;fill:#29415f}.detail-frame{fill:#fff;stroke:#1f2937;stroke-width:1.5}.detail-title{font:700 12px monospace;fill:#111827}.detail-scale,.dimension-label,.callout-label{font:10px monospace;fill:#111827}.detail-line{stroke:#111827;stroke-width:2}.detail-dimension{stroke:#dc2626;stroke-width:1.5;marker-start:url(#dim);marker-end:url(#dim)}.callout-marker{fill:#fff;stroke:#2563eb;stroke-width:2}.review{font:700 12px monospace;fill:#9b2c2c}
</style>
<rect class="sheet" x="16" y="16" width="788" height="588"/>
<text class="title" x="36" y="48">${svgEscape(panelTitle(panelType))}</text>
<text class="subtitle" x="36" y="72">PRELIMINARY DETAILS - ARCHITECT / ENGINEER REVIEW REQUIRED</text>
<metadata>{"panelType":"${panelType}","geometryHash":"${detailLibrary.geometryHash}","detailLibraryHash":"${detailLibrary.detailLibraryHash}","technicalDrawing":true,"imageProviderUsed":"none"}</metadata>
${detailMarkup}
<text class="review" x="36" y="590">${svgEscape(DETAIL_REVIEW_DISCLAIMER)}</text>
</svg>`;
}

function buildPanel(detailLibrary, panelType) {
  const svgString = buildPanelSvg(detailLibrary, panelType);
  return {
    panelType,
    drawingType: "detail",
    version: CONSTRUCTION_DETAIL_PANEL_VERSION,
    title: panelTitle(panelType),
    svgString,
    svgHash: createStableHash(svgString),
    width: 820,
    height: 620,
    renderer: "deterministic_svg",
    providerUsed: "deterministic_svg",
    imageProviderUsed: "none",
    technicalDrawing: true,
    geometryHash: detailLibrary.geometryHash,
    sourceGeometryHash: detailLibrary.geometryHash,
    sourceProjectGraphHash: detailLibrary.sourceProjectGraphHash,
    detailLibraryHash: detailLibrary.detailLibraryHash,
    detailHashes: detailsForPanel(detailLibrary, panelType).map(
      (detail) => detail.detailHash,
    ),
    reviewRequired: true,
    status: "ready",
    metadata: {
      panelType,
      drawingType: "detail",
      detailLibraryHash: detailLibrary.detailLibraryHash,
      reviewRequired: true,
      imageProviderUsed: "none",
      renderer: "deterministic_svg",
    },
  };
}

export function buildConstructionDetailPanelsFromDetailLibrary(
  detailLibrary = {},
) {
  const detailPanels = {
    detail_sheet_architectural: buildPanel(
      detailLibrary,
      "detail_sheet_architectural",
    ),
    detail_sheet_envelope: buildPanel(detailLibrary, "detail_sheet_envelope"),
    detail_sheet_wetroom_drainage: buildPanel(
      detailLibrary,
      "detail_sheet_wetroom_drainage",
    ),
    detail_sheet_mep_riser: buildPanel(detailLibrary, "detail_sheet_mep_riser"),
    detail_notes: buildPanel(detailLibrary, "detail_notes"),
  };
  return { detailLibrary, detailPanels };
}

export function buildConstructionDetailPanelsFromCompiledProject({
  compiledProject,
  jurisdiction = null,
  jurisdictionPack = null,
} = {}) {
  const detailLibrary = buildConstructionDetailLibraryFromCompiledProject({
    compiledProject,
    jurisdiction,
    jurisdictionPack,
  });
  return buildConstructionDetailPanelsFromDetailLibrary(detailLibrary);
}

export function validateConstructionDetailLibrary(
  detailLibrary = {},
  { compiledProject = null } = {},
) {
  const errors = [];
  const details = toArray(detailLibrary.details);
  const detailTypes = new Set(details.map((detail) => detail.detailType));
  if (!detailLibrary.detailLibraryHash) {
    errors.push({ code: "DETAIL_LIBRARY_HASH_MISSING" });
  }
  if (!detailLibrary.geometryHash) {
    errors.push({ code: "DETAIL_LIBRARY_GEOMETRY_HASH_MISSING" });
  }
  if (
    compiledProject?.geometryHash &&
    detailLibrary.geometryHash &&
    detailLibrary.geometryHash !== compiledProject.geometryHash
  ) {
    errors.push({ code: "DETAIL_LIBRARY_GEOMETRY_HASH_MISMATCH" });
  }
  if (detailLibrary.reviewRequired !== true) {
    errors.push({ code: "DETAIL_LIBRARY_REVIEW_REQUIRED_MISSING" });
  }
  if (
    !toArray(detailLibrary.disclaimers)
      .join(" ")
      .match(/architect and engineer/i)
  ) {
    errors.push({ code: "DETAIL_LIBRARY_DISCLAIMER_MISSING" });
  }
  REQUIRED_CONSTRUCTION_DETAIL_TYPES.forEach((detailType) => {
    if (!detailTypes.has(detailType)) {
      errors.push({
        code: "DETAIL_LIBRARY_REQUIRED_DETAIL_MISSING",
        detailType,
      });
    }
  });
  details.forEach((detail) => {
    if (!detail.detailHash) {
      errors.push({ code: "DETAIL_HASH_MISSING", detailId: detail.detailId });
    }
    if (detail.reviewRequired !== true) {
      errors.push({
        code: "DETAIL_REVIEW_REQUIRED_MISSING",
        detailId: detail.detailId,
      });
    }
    if (detail.imageProviderUsed && detail.imageProviderUsed !== "none") {
      errors.push({
        code: "DETAIL_IMAGE_PROVIDER_FORBIDDEN",
        detailId: detail.detailId,
      });
    }
    if (!toArray(detail.hatches).length) {
      errors.push({
        code: "DETAIL_HATCHES_MISSING",
        detailId: detail.detailId,
      });
    }
    if (!toArray(detail.dimensions).length) {
      errors.push({
        code: "DETAIL_DIMENSIONS_MISSING",
        detailId: detail.detailId,
      });
    }
    if (
      !toArray(detail.dxfEntities).some((entity) =>
        entity.role?.includes("callout"),
      )
    ) {
      errors.push({
        code: "DETAIL_CALLOUTS_MISSING",
        detailId: detail.detailId,
      });
    }
    if (
      `${detail.disclaimer || ""} ${toArray(detail.annotations).join(" ")}`.match(
        /approved for construction|code compliant|certified/i,
      )
    ) {
      errors.push({
        code: "DETAIL_FALSE_APPROVAL_CLAIM",
        detailId: detail.detailId,
      });
    }
  });
  if (
    detailLibrary.imageProviderUsed &&
    detailLibrary.imageProviderUsed !== "none"
  ) {
    errors.push({ code: "DETAIL_LIBRARY_IMAGE_PROVIDER_FORBIDDEN" });
  }
  return {
    valid: errors.length === 0,
    errors,
    checks: {
      detailCount: details.length,
      requiredDetailTypesPresent: REQUIRED_CONSTRUCTION_DETAIL_TYPES.every(
        (detailType) => detailTypes.has(detailType),
      ),
      hasDetailLibraryHash: Boolean(detailLibrary.detailLibraryHash),
      geometryHashMatches:
        !compiledProject?.geometryHash ||
        detailLibrary.geometryHash === compiledProject.geometryHash,
      reviewRequired: detailLibrary.reviewRequired === true,
      imageProviderUsed: detailLibrary.imageProviderUsed || null,
    },
  };
}

export default {
  CONSTRUCTION_DETAIL_LIBRARY_VERSION,
  CONSTRUCTION_DETAIL_PANEL_VERSION,
  DETAIL_REVIEW_DISCLAIMER,
  REQUIRED_CONSTRUCTION_DETAIL_TYPES,
  REQUIRED_DETAIL_CAD_LAYERS,
  buildConstructionDetailLibraryFromCompiledProject,
  buildConstructionDetailPanelsFromDetailLibrary,
  buildConstructionDetailPanelsFromCompiledProject,
  validateConstructionDetailLibrary,
};
