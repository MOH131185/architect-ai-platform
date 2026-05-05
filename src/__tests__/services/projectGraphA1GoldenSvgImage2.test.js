import fs from "fs";
import path from "path";
import {
  buildRequiredA1PanelTypes,
  buildTitleBlockPanelArtifact,
  buildVisual3DPanelArtifacts,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";
import {
  evaluateFinalA1ExportGate,
  resolveA1RenderContract,
} from "../../services/a1/a1FinalExportContract.js";
import { computeCDSHashSync } from "../../services/validation/cdsHash.js";
import { renderProjectGraphPanelImage } from "../../services/render/projectGraphImageRenderer.js";
import { ensureCompiledProjectRenderInputs } from "../../services/compiler/compiledProjectRenderInputs.js";

jest.mock("../../services/render/projectGraphImageRenderer.js", () => ({
  renderProjectGraphPanelImage: jest.fn(),
}));

jest.mock("../../services/compiler/compiledProjectRenderInputs.js", () => ({
  ensureCompiledProjectRenderInputs: jest.fn(),
}));

const { buildPanelPlacements, buildSheetSvg } =
  __projectGraphVerticalSliceInternals;

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "evals/golden/uk_house_svg_image2/manifest.json"),
    "utf8",
  ),
);

const GEOMETRY_HASH = fixture.expected.geometryHash;
const VISUAL_MANIFEST = {
  manifestId: "golden-uk-house-visual-manifest",
  manifestHash: fixture.expected.visualManifestHash,
  geometryHash: GEOMETRY_HASH,
  buildingType: "detached-house",
  storeyCount: 2,
  roof: {
    form: "gable",
    ridgeOrientation: "east-west",
    materialName: "charcoal standing seam",
  },
  primaryFacadeMaterial: {
    name: "buff brick",
    hex: "#c8ad7f",
    application: "walls",
  },
  windowMaterial: "white frames",
  doorMaterial: "timber entrance bay",
  windowRhythm: "regular domestic openings",
  entranceOrientation: "front-left timber bay",
};

const VISUAL_PANEL_TYPES = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];

function makeControlSvg(panelType) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">',
    `<g id="golden-control-${panelType}" data-reference-source="compiled_3d_control_svg">`,
    '<path class="massing-shell" d="M210 610 L210 330 L600 150 L990 330 L990 610 Z" fill="#f6f6f2" stroke="#111"/>',
    '<path class="gable-roof" d="M210 330 L600 150 L990 330" fill="none" stroke="#111" stroke-width="8"/>',
    '<rect class="opening window" x="315" y="390" width="110" height="120" fill="#dbeafe" stroke="#111"/>',
    '<rect class="opening entrance" x="535" y="455" width="130" height="155" fill="#8b5a2b" stroke="#111"/>',
    '<rect class="opening window" x="775" y="390" width="110" height="120" fill="#dbeafe" stroke="#111"/>',
    "</g>",
    "</svg>",
  ].join("");
}

function makeRenderInputs() {
  return Object.fromEntries(
    VISUAL_PANEL_TYPES.map((panelType) => {
      const svgString = makeControlSvg(panelType);
      return [
        panelType,
        {
          svgString,
          svgHash: `golden-control-svg-hash-${panelType}`,
          width: 1200,
          height: 800,
          metadata: {
            width: 1200,
            height: 800,
            normalizedViewBox: "0 0 1200 800",
            camera: { view: panelType },
            primitiveCount: 9,
            surfaceCount: 9,
            geometryHash: GEOMETRY_HASH,
          },
        },
      ];
    }),
  );
}

function technicalSvg(panelType, title, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" data-golden-panel="${panelType}">`,
    '<rect width="1200" height="800" fill="#ffffff"/>',
    `<text class="drawing-title" x="60" y="72">${title}</text>`,
    body,
    '<g id="scale-bar" class="scale-marker"><line x1="60" y1="735" x2="260" y2="735" stroke="#111" stroke-width="4"/><text x="60" y="765">SCALE 1:100</text></g>',
    "</svg>",
  ].join("");
}

function technicalArtifact(panelType, drawingType, title, body) {
  const svgString = technicalSvg(panelType, title, body);
  return {
    asset_id: `asset-golden-${panelType}`,
    asset_type: "compiled_project_panel_svg",
    panel_type: panelType,
    panelType,
    source_model_hash: GEOMETRY_HASH,
    geometryHash: GEOMETRY_HASH,
    sourceGeometryHash: GEOMETRY_HASH,
    svgHash: computeCDSHashSync({ panelType, svgString, GEOMETRY_HASH }),
    technicalDrawing: true,
    renderer: "deterministic_svg",
    source: "compiled_project_technical_panel",
    providerUsed: "deterministic_svg",
    width: 1200,
    height: 800,
    svgString,
    metadata: {
      source: "compiled_project_technical_panel",
      renderer: "deterministic_svg",
      sourceType: "deterministic_svg",
      providerUsed: "deterministic_svg",
      technicalDrawing: true,
      drawingType,
      geometryHash: GEOMETRY_HASH,
      sourceGeometryHash: GEOMETRY_HASH,
      technicalDrawingFromImageModel: false,
      imageModelGenerated: false,
      technicalQualityMetadata: {
        has_scale_bar: true,
        has_overall_dimensions: true,
        room_label_count: drawingType === "plan" ? 5 : 0,
        contentBounds: {
          x: 40,
          y: 40,
          width: 1120,
          height: 720,
          occupancyRatio: 0.78,
          widthRatio: 0.93,
          heightRatio: 0.9,
        },
      },
    },
  };
}

function planBody(level, rooms) {
  return [
    `<g id="${level}-blueprint" class="cad-layer-walls cad-lineweight-outline blueprint-linework">`,
    '<g id="north-arrow" class="cad-layer-dimensions cad-lineweight-detail"><path d="M1090 105 L1115 175 L1090 158 L1065 175 Z" fill="#111"/><text x="1080" y="92">N</text></g>',
    '<g id="title-block" class="cad-layer-dimensions cad-lineweight-detail"><text x="905" y="735">A1-GOLDEN / PROJECTGRAPH</text></g>',
    '<rect x="170" y="140" width="840" height="520" fill="none" stroke="#0f172a" stroke-width="8"/>',
    '<line class="cad-layer-walls cad-lineweight-primary" x1="480" y1="140" x2="480" y2="660" stroke="#0f172a" stroke-width="5"/>',
    '<line class="cad-layer-walls cad-lineweight-primary" x1="170" y1="410" x2="1010" y2="410" stroke="#0f172a" stroke-width="5"/>',
    '<g class="dimension-chain cad-layer-dimensions cad-lineweight-detail" id="overall-dimensions"><line x1="170" y1="105" x2="1010" y2="105" stroke="#1d4ed8"/><text x="550" y="95">8.4m</text><line x1="1045" y1="140" x2="1045" y2="660" stroke="#1d4ed8"/><text x="1065" y="410">7.2m</text></g>',
    '<g class="opening-layer"><rect class="door-symbol" x="560" y="620" width="90" height="40"/><rect class="window-symbol" x="275" y="132" width="110" height="16"/><rect class="window-symbol" x="780" y="132" width="110" height="16"/></g>',
    '<g id="plan-section-markers" class="cad-layer-dimensions"><line class="section-marker" data-section-label="A-A" x1="220" y1="235" x2="960" y2="235" stroke="#7c2d12" stroke-width="3"/><line class="section-marker" data-section-label="B-B" x1="390" y1="170" x2="390" y2="625" stroke="#7c2d12" stroke-width="3"/></g>',
    rooms
      .map(
        (room, index) =>
          `<g><text class="room-label" x="${230 + (index % 3) * 275}" y="${250 + Math.floor(index / 3) * 235}">${room}</text><text class="room-area-label" x="${230 + (index % 3) * 275}" y="${274 + Math.floor(index / 3) * 235}" data-room-area-m2="${12 + index}">${12 + index} m2</text></g>`,
      )
      .join(""),
    "</g>",
  ].join("");
}

function elevationBody() {
  return [
    '<g id="golden-north-elevation" class="cad-layer-walls cad-lineweight-outline elevation-linework">',
    '<line id="ground-line" class="cad-layer-ground cad-lineweight-primary" x1="90" y1="650" x2="1110" y2="650" stroke="#111" stroke-width="5"/>',
    '<line class="cad-layer-datums cad-lineweight-detail" data-datum-role="ffl-ground" x1="150" y1="650" x2="1080" y2="650" stroke="#1d4ed8"/><text x="155" y="638">FFL +0.000</text>',
    '<line class="cad-layer-datums cad-lineweight-detail" data-datum-role="eaves" x1="205" y1="330" x2="995" y2="330" stroke="#1d4ed8"/><text x="155" y="324">EAVES +5.600</text>',
    '<line class="cad-layer-datums cad-lineweight-detail" data-datum-role="ridge" x1="540" y1="155" x2="660" y2="155" stroke="#1d4ed8"/><text x="665" y="160">RIDGE +7.800</text>',
    '<rect class="buff-brick-wall cad-lineweight-primary" x="220" y="330" width="760" height="320" fill="none" stroke="#111" stroke-width="6"/>',
    '<path class="gable-roof-line charcoal-standing-seam cad-lineweight-primary" d="M220 330 L600 155 L980 330" fill="none" stroke="#111" stroke-width="8"/>',
    '<rect class="white-frame-window" x="320" y="405" width="105" height="115" fill="none" stroke="#1d4ed8" stroke-width="4"/>',
    '<rect class="timber-entrance-bay" x="540" y="470" width="125" height="180" fill="none" stroke="#92400e" stroke-width="5"/>',
    '<rect class="white-frame-window" x="775" y="405" width="105" height="115" fill="none" stroke="#1d4ed8" stroke-width="4"/>',
    '<text x="220" y="690">NORTH ELEVATION</text>',
    "</g>",
  ].join("");
}

function sectionBody() {
  return [
    '<g id="golden-section-aa" class="cad-layer-walls cad-lineweight-cut section-linework">',
    '<line id="ground-line" class="cad-layer-ground cad-lineweight-primary" x1="120" y1="650" x2="1080" y2="650" stroke="#111" stroke-width="5"/>',
    '<path class="section-cut-wall cad-lineweight-cut" d="M260 650 V320 H940 V650" fill="none" stroke="#111" stroke-width="8"/>',
    '<path class="section-roof" d="M260 320 L600 145 L940 320" fill="none" stroke="#111" stroke-width="8"/>',
    '<line class="floor-slab" x1="260" y1="485" x2="940" y2="485" stroke="#111" stroke-width="6"/>',
    '<g class="cad-vertical-dimension-chain cad-layer-dimensions"><line x1="1015" y1="650" x2="1015" y2="145" stroke="#1d4ed8"/><text x="1030" y="405">7.8m ridge</text></g>',
    '<text class="room-label" x="350" y="590">Kitchen / dining</text>',
    '<text class="room-label" x="350" y="420">Bedroom</text>',
    '<text x="120" y="705">SECTION A-A</text>',
    "</g>",
  ].join("");
}

function dataArtifact(panelType, label, body) {
  return technicalArtifact(
    panelType,
    "data",
    label,
    `<g id="golden-${panelType}">${body}</g>`,
  );
}

function buildTechnicalArtifacts() {
  const artifacts = [
    technicalArtifact(
      "site_context",
      "site",
      "SITE / CONTEXT",
      '<g id="golden-site-context"><rect class="site-boundary" x="220" y="150" width="760" height="500" fill="none" stroke="#111" stroke-width="6"/><path class="context-road" d="M120 690 H1080" stroke="#888" stroke-width="18"/><text x="250" y="230">UK detached house plot</text></g>',
    ),
    technicalArtifact(
      "floor_plan_ground",
      "plan",
      "GROUND FLOOR PLAN",
      planBody("ground", [
        "Hall",
        "Living room",
        "Kitchen / dining",
        "WC",
        "Utility",
      ]),
    ),
    technicalArtifact(
      "floor_plan_first",
      "plan",
      "FIRST FLOOR PLAN",
      planBody("first", [
        "Bedroom 1",
        "Bedroom 2",
        "Bedroom 3",
        "Bathroom",
        "Landing",
      ]),
    ),
    technicalArtifact(
      "elevation_north",
      "elevation",
      "NORTH ELEVATION",
      elevationBody(),
    ),
    technicalArtifact(
      "elevation_south",
      "elevation",
      "SOUTH ELEVATION",
      elevationBody(),
    ),
    technicalArtifact(
      "elevation_east",
      "elevation",
      "EAST ELEVATION",
      elevationBody(),
    ),
    technicalArtifact(
      "elevation_west",
      "elevation",
      "WEST ELEVATION",
      elevationBody(),
    ),
    technicalArtifact("section_AA", "section", "SECTION A-A", sectionBody()),
    technicalArtifact("section_BB", "section", "SECTION B-B", sectionBody()),
    dataArtifact(
      "material_palette",
      "MATERIALS",
      '<rect x="90" y="150" width="160" height="90" fill="#c8ad7f"/><text x="280" y="200">Buff brick walls</text><rect x="90" y="280" width="160" height="90" fill="#30343b"/><text x="280" y="330">Charcoal standing seam roof</text><rect x="90" y="410" width="160" height="90" fill="#f8fafc" stroke="#111"/><text x="280" y="460">White window frames</text>',
    ),
    dataArtifact(
      "key_notes",
      "NOTES",
      '<text x="80" y="160">ProjectGraph authority: compiled geometry controls all panels.</text><text x="80" y="230">Technical panels are deterministic SVG blueprint drawings.</text><text x="80" y="300">Visual panels are image2 edits from control SVG references.</text>',
    ),
  ];
  const titleBlock = buildTitleBlockPanelArtifact({
    projectGraphId: "golden-projectgraph-uk-house",
    brief: {
      project_name: fixture.brief.project_name,
      site_input: { address: "Golden UK detached house test plot" },
      target_gia_m2: 121,
      target_storeys: 2,
      brief_input_hash: "golden-brief-hash",
    },
    geometryHash: GEOMETRY_HASH,
    visualManifest: VISUAL_MANIFEST,
    sheetPlan: {
      sheet_number: "A1-GOLDEN",
      label: "SVG + IMAGE2 ACCEPTANCE",
      revision: "P06",
      date: "2026-05-05",
    },
  });
  artifacts.push(titleBlock);
  return Object.fromEntries(
    artifacts.map((artifact) => [artifact.asset_id, artifact]),
  );
}

async function buildGoldenArtifacts() {
  const technicalArtifacts = buildTechnicalArtifacts();
  const visualArtifacts = await buildVisual3DPanelArtifacts({
    compiledProject: {
      geometryHash: GEOMETRY_HASH,
      levels: [{ id: "ground" }, { id: "first" }],
      roof: { type: "gable", summary: { ridge_count: 1 } },
      rooms: [],
      openings: [],
      walls: [],
    },
    geometryHash: GEOMETRY_HASH,
    brief: {
      project_name: fixture.brief.project_name,
      building_type: "detached-house",
      target_storeys: 2,
      generation_seed: 260606,
    },
    visualManifest: VISUAL_MANIFEST,
    programmeSummary: {
      levels: [
        { name: "Ground", rooms: fixture.brief.programme.ground },
        { name: "First", rooms: fixture.brief.programme.first },
      ],
    },
    region: "UK",
    sheetDesignContext: {
      contextHash: "golden-sheet-design-context",
      visualManifestHash: VISUAL_MANIFEST.manifestHash,
    },
  });
  return {
    ...technicalArtifacts,
    ...visualArtifacts,
  };
}

function artifactsByPanelType(panelArtifacts) {
  return Object.fromEntries(
    Object.values(panelArtifacts).map((artifact) => [
      artifact.panel_type,
      artifact,
    ]),
  );
}

function panelEvidence(artifact) {
  return {
    type: artifact.panel_type,
    panelType: artifact.panel_type,
    status: "ready",
    hasSvg: Boolean(artifact.svgString),
    geometryHash: artifact.geometryHash || artifact.source_model_hash,
    sourceGeometryHash:
      artifact.sourceGeometryHash ||
      artifact.metadata?.sourceGeometryHash ||
      artifact.geometryHash ||
      artifact.source_model_hash,
    visualManifestHash:
      artifact.visualManifestHash ||
      artifact.metadata?.visualManifestHash ||
      null,
    visualIdentityLocked:
      artifact.visualIdentityLocked === true ||
      artifact.metadata?.visualIdentityLocked === true,
    referenceSource:
      artifact.referenceSource || artifact.metadata?.referenceSource || null,
    provider: artifact.provider || artifact.metadata?.provider || null,
    providerUsed:
      artifact.providerUsed || artifact.metadata?.providerUsed || null,
    imageProviderUsed:
      artifact.imageProviderUsed ||
      artifact.metadata?.imageProviderUsed ||
      null,
    imageRenderFallback:
      artifact.imageRenderFallback ??
      artifact.metadata?.imageRenderFallback ??
      null,
    imageRenderFallbackReason:
      artifact.imageRenderFallbackReason ||
      artifact.metadata?.imageRenderFallbackReason ||
      null,
    model: artifact.model || artifact.metadata?.model || null,
    requestId: artifact.requestId || artifact.metadata?.requestId || null,
    usage: artifact.usage || artifact.metadata?.usage || null,
    controlSvgHash:
      artifact.controlSvgHash || artifact.metadata?.controlSvgHash || null,
    svgString: artifact.svgString,
    metadata: artifact.metadata || {},
  };
}

function buildDrawingsForGate(byPanel) {
  return {
    plan: [
      {
        level_id: "0",
        svg: byPanel.floor_plan_ground.svgString,
        sheet_mode: false,
        window_count: 2,
        door_count: 1,
        room_label_count: 5,
        area_label_count: 5,
        dimension_chain_count: 1,
        section_marker_count: 2,
        section_marker_labels: ["A-A", "B-B"],
        cad_layer_classes: ["cad-layer-walls", "cad-layer-dimensions"],
        cad_lineweight_classes: [
          "cad-lineweight-outline",
          "cad-lineweight-primary",
        ],
      },
      {
        level_id: "1",
        svg: byPanel.floor_plan_first.svgString,
        sheet_mode: false,
        window_count: 2,
        door_count: 0,
        room_label_count: 5,
        area_label_count: 5,
        dimension_chain_count: 1,
        section_marker_count: 2,
        section_marker_labels: ["A-A", "B-B"],
        cad_layer_classes: ["cad-layer-walls", "cad-layer-dimensions"],
        cad_lineweight_classes: [
          "cad-lineweight-outline",
          "cad-lineweight-primary",
        ],
      },
    ],
    elevation: [
      {
        svg: byPanel.elevation_north.svgString,
        window_count: 1,
        door_count: 1,
        cad_layer_classes: ["cad-layer-walls", "cad-layer-datums"],
        cad_lineweight_classes: ["cad-lineweight-outline"],
      },
      {
        svg: byPanel.elevation_south.svgString,
        window_count: 1,
        door_count: 0,
        cad_layer_classes: ["cad-layer-walls", "cad-layer-datums"],
        cad_lineweight_classes: ["cad-lineweight-outline"],
      },
      {
        svg: byPanel.elevation_east.svgString,
        window_count: 1,
        door_count: 0,
        cad_layer_classes: ["cad-layer-walls", "cad-layer-datums"],
        cad_lineweight_classes: ["cad-lineweight-outline"],
      },
      {
        svg: byPanel.elevation_west.svgString,
        window_count: 1,
        door_count: 0,
        cad_layer_classes: ["cad-layer-walls", "cad-layer-datums"],
        cad_lineweight_classes: ["cad-lineweight-outline"],
      },
    ],
    section: [
      {
        svg: byPanel.section_AA.svgString,
        section_id: "AA",
        floor_count: 2,
        ground_line_count: 1,
        stair_count: 0,
        vertical_dimension_chain_count: 1,
        cad_layer_classes: ["cad-layer-walls", "cad-layer-dimensions"],
        cad_lineweight_classes: ["cad-lineweight-cut"],
      },
      {
        svg: byPanel.section_BB.svgString,
        section_id: "BB",
        floor_count: 2,
        ground_line_count: 1,
        stair_count: 0,
        vertical_dimension_chain_count: 1,
        cad_layer_classes: ["cad-layer-walls", "cad-layer-dimensions"],
        cad_lineweight_classes: ["cad-lineweight-cut"],
      },
    ],
  };
}

function buildGoldenSheet(panelArtifacts) {
  const panelPlacements = buildPanelPlacements({
    drawingSet: { drawings: [] },
    panelArtifacts,
    targetStoreys: 2,
    layoutTemplate: fixture.expected.layout,
    geometryHash: GEOMETRY_HASH,
    briefInputHash: "golden-brief-hash",
  });
  const svgString = buildSheetSvg({
    projectGraphId: "golden-projectgraph-uk-house",
    brief: {
      project_name: fixture.brief.project_name,
      reference_match: false,
      brief_input_hash: "golden-brief-hash",
    },
    geometryHash: GEOMETRY_HASH,
    panelPlacements,
    panelArtifacts,
    qaStatus: "pass",
    sheetNumber: "A1-GOLDEN",
    sheetLabel: "SVG + IMAGE2 ACCEPTANCE",
    layoutTemplate: fixture.expected.layout,
    visualManifest: VISUAL_MANIFEST,
  });
  return {
    svgString,
    svgHash: computeCDSHashSync({ svgString }),
    panelPlacements,
  };
}

function buildGoldenGateInputs({
  panelArtifacts,
  sheetArtifact,
  visualPanels,
}) {
  const byPanel = artifactsByPanelType(panelArtifacts);
  const panelRegistry = [
    ...buildRequiredA1PanelTypes(2, fixture.expected.layout),
    "exterior_render",
  ];
  return {
    renderContract: resolveA1RenderContract({ renderIntent: "final_a1" }),
    pdfUrl: "data:application/pdf;base64,Z29sZGVu",
    finalSheetRegression: {
      finalSheetRegressionReady: true,
      hardBlockers: [],
    },
    postComposeVerification: {
      publishability: { status: "pass", blockers: [] },
      renderedTextZone: {
        status: "pass",
        blockers: [],
        ocr: { available: true },
        ocrEvidenceQuality: "verified",
      },
    },
    glyphIntegrity: { status: "pass", blockers: [] },
    rasterGlyphIntegrity: { status: "pass", warnings: [], suspectZones: [] },
    pdfMetadata: {
      dpi: 300,
      pdfRenderMode: "raster_textpaths_300dpi",
      textRenderMode: "font_paths",
      rasterIntegrityStatus: "pass",
      sourceSvgHash: sheetArtifact.svgHash,
      emptyFrameFallbackUsed: false,
    },
    sheetArtifact,
    panels: Object.values(panelArtifacts).map(panelEvidence),
    panelRegistry,
    targetStoreys: 2,
    visualManifest: VISUAL_MANIFEST,
    visualPanels,
    materialPalette: {
      cards: [
        {
          name: "Buff brick",
          label: "Buff brick",
          materialSignature: "buff_brick",
          textureKind: "procedural_svg_pattern",
          source: "procedural_svg_pattern",
        },
      ],
    },
    openaiProvider: {
      openaiConfigured: true,
      openaiReasoningUsed: false,
      openaiImageUsed: true,
      openaiRequestIds: VISUAL_PANEL_TYPES.map((type) => `req-golden-${type}`),
      providerFallbacks: [],
    },
    presentationSummary: {
      presentationMode: "geometry_locked_image_render",
      fallbackPanels: [],
      renderedPanels: VISUAL_PANEL_TYPES,
    },
    expectedGeometryHash: GEOMETRY_HASH,
    strictPhotoreal: true,
    imageGenEnabled: true,
    scope: "compose_final",
    drawings: buildDrawingsForGate(byPanel),
    projectGeometry: {
      levels: [{ id: "ground" }, { id: "first" }],
      windows: [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }],
      doors: [{ id: "d1" }],
      stairs: [],
    },
    sheetSetPlan: { required: false, generated: true },
  };
}

describe("Phase 6 golden A1 SVG + image2 ProjectGraph acceptance", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.OPENAI_STRICT_IMAGE_GEN = "true";
    process.env.OPENAI_IMAGES_API_KEY = "sk-test-golden-images";
    ensureCompiledProjectRenderInputs.mockReturnValue(makeRenderInputs());
    renderProjectGraphPanelImage.mockImplementation(async ({ panelType }) => ({
      pngBuffer: Buffer.from(`golden-image2-edit-${panelType}`),
      provider: "openai",
      providerUsed: "openai",
      imageProviderUsed: "openai",
      imageRenderFallback: false,
      imageRenderFallbackReason: null,
      openaiConfigured: true,
      provenance: {
        panelType,
        provider: "openai",
        providerUsed: "openai",
        imageProviderUsed: "openai",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        model: "gpt-image-2",
        size: "1536x1024",
        requestId: `req-golden-${panelType}`,
        usage: { total_tokens: 42 },
        sourceGeometryHash: GEOMETRY_HASH,
        referenceSource: "compiled_3d_control_svg",
      },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  test("golden UK detached A1 sheet embeds SVG technical panels and image2 visual panels from one ProjectGraph authority", async () => {
    const panelArtifacts = await buildGoldenArtifacts();
    const byPanel = artifactsByPanelType(panelArtifacts);
    const visualPanels = VISUAL_PANEL_TYPES.map((type) =>
      panelEvidence(byPanel[type]),
    );
    const sheetArtifact = buildGoldenSheet(panelArtifacts);
    const gate = evaluateFinalA1ExportGate(
      buildGoldenGateInputs({
        panelArtifacts,
        sheetArtifact,
        visualPanels,
      }),
    );

    expect(renderProjectGraphPanelImage).toHaveBeenCalledTimes(4);
    expect(renderProjectGraphPanelImage).toHaveBeenCalledWith(
      expect.objectContaining({
        panelType: "axonometric",
        deterministicSvg: expect.stringContaining(
          'data-reference-source="compiled_3d_control_svg"',
        ),
        geometryHash: GEOMETRY_HASH,
      }),
    );

    expect(byPanel.floor_plan_ground.svgString).toContain("<svg");
    expect(byPanel.floor_plan_first.svgString).toContain("<svg");
    expect(
      Object.keys(byPanel).filter((type) => type.startsWith("elevation_"))
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      Object.keys(byPanel).filter((type) => type.startsWith("section_")).length,
    ).toBeGreaterThanOrEqual(1);

    expect(byPanel.hero_3d || byPanel.exterior_render).toBeTruthy();
    expect(byPanel.axonometric).toBeTruthy();
    expect(byPanel.interior_3d).toBeTruthy();

    for (const panelType of ["floor_plan_ground", "floor_plan_first"]) {
      expect(byPanel[panelType].svgString).toContain("room-label");
      expect(byPanel[panelType].svgString).toContain("dimension-chain");
      expect(byPanel[panelType].svgString).toContain("scale-marker");
      expect(byPanel[panelType].svgString).toContain("cad-layer");
      expect(byPanel[panelType].metadata.technicalDrawingFromImageModel).toBe(
        false,
      );
      expect(byPanel[panelType].metadata.imageModelGenerated).toBe(false);
    }

    for (const panel of visualPanels) {
      expect(panel.referenceSource).toBe("compiled_3d_control_svg");
      expect(panel.imageProviderUsed).toBe("openai");
      expect(panel.imageRenderFallback).toBe(false);
      expect(panel.visualIdentityLocked).toBe(true);
      expect(panel.visualManifestHash).toBe(VISUAL_MANIFEST.manifestHash);
      expect(panel.geometryHash).toBe(GEOMETRY_HASH);
    }

    const projectPanelHashes = new Set(
      Object.values(byPanel)
        .filter(
          (artifact) =>
            artifact.panel_type?.startsWith("floor_plan_") ||
            artifact.panel_type?.startsWith("elevation_") ||
            artifact.panel_type?.startsWith("section_") ||
            VISUAL_PANEL_TYPES.includes(artifact.panel_type),
        )
        .map((artifact) => artifact.geometryHash || artifact.source_model_hash),
    );
    expect([...projectPanelHashes]).toEqual([GEOMETRY_HASH]);
    expect(
      new Set(visualPanels.map((panel) => panel.visualManifestHash)),
    ).toEqual(new Set([VISUAL_MANIFEST.manifestHash]));

    expect(sheetArtifact.svgString).toContain("<svg");
    expect(sheetArtifact.svgString).toContain("GROUND FLOOR PLAN");
    expect(sheetArtifact.svgString).toContain("FIRST FLOOR PLAN");
    expect(sheetArtifact.svgString).toContain("room-label");
    expect(sheetArtifact.svgString).toContain("data:image/png;base64");
    expect(sheetArtifact.svgString).toContain("IMAGE2 EDIT");
    expect(sheetArtifact.svgString).toContain("TITLE BLOCK");
    expect(sheetArtifact.svgString).toContain(GEOMETRY_HASH);
    expect(sheetArtifact.svgString).toContain(VISUAL_MANIFEST.manifestHash);
    expect(sheetArtifact.svgString).not.toContain('data-panel-missing="true"');

    expect(gate.status).toBe("pass");
    expect(gate.allowed).toBe(true);
    expect(gate.blockers).toEqual([]);
    expect(gate.evidence.projectPanelAuthorityStatus.codes).toEqual([]);
    expect(gate.evidence.sheetArtifactStatus.hasSheetSvgString).toBe(true);
  });

  test("golden export gate fails when axonometric drifts from the shared manifest or geometry hash", async () => {
    const panelArtifacts = await buildGoldenArtifacts();
    const baseSheet = buildGoldenSheet(panelArtifacts);
    const byPanel = artifactsByPanelType(panelArtifacts);
    const baseVisualPanels = VISUAL_PANEL_TYPES.map((type) =>
      panelEvidence(byPanel[type]),
    );

    const manifestDriftPanels = baseVisualPanels.map((panel) =>
      panel.type === "axonometric"
        ? {
            ...panel,
            visualManifestHash: "different-golden-manifest",
            metadata: {
              ...panel.metadata,
              visualManifestHash: "different-golden-manifest",
            },
          }
        : panel,
    );
    const manifestGate = evaluateFinalA1ExportGate(
      buildGoldenGateInputs({
        panelArtifacts,
        sheetArtifact: baseSheet,
        visualPanels: manifestDriftPanels,
      }),
    );

    expect(manifestGate.allowed).toBe(false);
    expect(manifestGate.evidence.projectPanelAuthorityStatus.codes).toContain(
      "VISUAL_MANIFEST_HASH_MISMATCH",
    );

    const geometryDriftPanels = baseVisualPanels.map((panel) =>
      panel.type === "axonometric"
        ? {
            ...panel,
            geometryHash: "different-golden-geometry",
            sourceGeometryHash: "different-golden-geometry",
            metadata: {
              ...panel.metadata,
              geometryHash: "different-golden-geometry",
              sourceGeometryHash: "different-golden-geometry",
            },
          }
        : panel,
    );
    const geometryGate = evaluateFinalA1ExportGate(
      buildGoldenGateInputs({
        panelArtifacts,
        sheetArtifact: baseSheet,
        visualPanels: geometryDriftPanels,
      }),
    );

    expect(geometryGate.allowed).toBe(false);
    expect(geometryGate.evidence.projectPanelAuthorityStatus.codes).toContain(
      "PROJECT_PANEL_GEOMETRY_HASH_MISMATCH",
    );
  });
});
