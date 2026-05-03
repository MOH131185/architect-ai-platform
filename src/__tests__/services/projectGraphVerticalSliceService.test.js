import {
  buildArchitectureProjectVerticalSlice,
  validateProjectGraphVerticalSlice,
  KNOWN_BUILDING_TYPES,
  buildKeyNotesPanelArtifact,
  buildTitleBlockPanelArtifact,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";
import {
  A1_TEST_RASTER_MODE_ENV,
  A1_TEST_RASTER_STUB_VALUE,
} from "../../services/render/svgRasteriser.js";

jest.setTimeout(420000);

function createReadingRoomBrief() {
  const siteMapDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSFIAAAeSAi8BTyQ1AAAAAElFTkSuQmCC";
  return {
    brief: {
      project_name: "Neighbourhood Reading Room",
      building_type: "community",
      site_input: {
        postcode: "N1 1AA",
        lat: 51.5416,
        lon: -0.1022,
      },
      target_gia_m2: 320,
      target_storeys: 2,
      client_goals: [
        "small public reading room",
        "community workshop",
        "cafe facing street",
        "quiet study upstairs",
        "warm local brick character",
      ],
      style_keywords: [
        "warm brick",
        "RIBA portfolio",
        "contextual contemporary",
      ],
      sustainability_ambition: "low_energy",
    },
    sitePolygon: [
      { lat: 51.54175, lng: -0.1024 },
      { lat: 51.54175, lng: -0.10195 },
      { lat: 51.54145, lng: -0.10195 },
      { lat: 51.54145, lng: -0.1024 },
    ],
    siteMetrics: {
      areaM2: 1040,
      orientationDeg: 8,
    },
    siteSnapshot: {
      dataUrl: siteMapDataUrl,
      sourceUrl: "provided-site-snapshot",
      attribution: "Provided site map",
      polygon: [
        { lat: 51.54175, lng: -0.1024 },
        { lat: 51.54175, lng: -0.10195 },
        { lat: 51.54145, lng: -0.10195 },
        { lat: 51.54145, lng: -0.1024 },
      ],
    },
  };
}

function createKensingtonReferenceMatchBrief() {
  const siteMapDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSFIAAAeSAi8BTyQ1AAAAAElFTkSuQmCC";
  return {
    referenceMatch: true,
    projectDetails: {
      projectName: "Stale Cherry House",
      address: "97 Bradford Street, Birmingham",
      area: 250,
      floorCount: 1,
      autoDetectedFloorCount: 1,
      floorCountLocked: false,
      subType: "detached-house",
    },
    brief: {
      project_name: "17 Kensington Road House",
      building_type: "dwelling",
      site_input: {
        address: "17 Kensington Rd, DN15 8BQ, UK",
        postcode: "DN15 8BQ",
        lat: 53.5912182,
        lon: -0.6883197,
      },
      target_gia_m2: 75,
      client_goals: [
        "compact two-storey family house",
        "reference-match RIBA A1 board",
        "local UK brick and timber material palette",
      ],
      style_keywords: ["red brick", "timber accent", "contemporary UK house"],
      sustainability_ambition: "low_energy",
    },
    sitePolygon: [
      { lat: 53.59131, lng: -0.68847 },
      { lat: 53.59131, lng: -0.68817 },
      { lat: 53.59112, lng: -0.68817 },
      { lat: 53.59112, lng: -0.68847 },
    ],
    siteMetrics: {
      areaM2: 2380,
      orientationDeg: 12,
    },
    siteSnapshot: {
      dataUrl: siteMapDataUrl,
      sourceUrl: "provided-site-snapshot",
      attribution: "Provided site map",
      polygon: [
        { lat: 53.59131, lng: -0.68847 },
        { lat: 53.59131, lng: -0.68817 },
        { lat: 53.59112, lng: -0.68817 },
        { lat: 53.59112, lng: -0.68847 },
      ],
    },
  };
}

function createLowConfidenceBradfordBoundaryBrief() {
  const estimatedBoundary = [
    { lat: 53.79224, lng: -1.75556 },
    { lat: 53.79224, lng: -1.75474 },
    { lat: 53.79162, lng: -1.75474 },
    { lat: 53.79162, lng: -1.75556 },
  ];
  const fallbackArea = 119408;

  return {
    projectDetails: {
      projectName: "Cherish Bradford Street",
      address: "97 Bradford Street, Bradford",
      area: 250,
      floorCount: 2,
      subType: "detached-house",
    },
    brief: {
      project_name: "Cherish Bradford Street",
      building_type: "dwelling",
      site_input: {
        address: "97 Bradford Street, Bradford",
        postcode: "BD1",
        lat: 53.79203,
        lon: -1.75524,
      },
      target_gia_m2: 250,
      target_storeys: 2,
      client_goals: ["family dwelling", "RIBA A1 site plan"],
      style_keywords: ["contextual brick", "residential"],
      sustainability_ambition: "low_energy",
    },
    sitePolygon: estimatedBoundary,
    siteMetrics: {
      areaM2: fallbackArea,
      orientationDeg: 10,
      boundaryAuthoritative: false,
      boundarySource: "Intelligent Fallback",
      boundaryConfidence: 0.4,
    },
    locationData: {
      coordinates: { lat: 53.79203, lng: -1.75524 },
      siteAnalysis: {
        siteBoundary: null,
        estimatedSiteBoundary: estimatedBoundary,
        surfaceArea: fallbackArea,
        estimatedSurfaceArea: fallbackArea,
        boundaryAuthoritative: false,
        boundaryEstimated: true,
        estimatedOnly: true,
        boundarySource: "Intelligent Fallback",
        boundaryConfidence: 0.4,
        fallbackReason: "No real boundary data available",
      },
    },
  };
}

function cloneForTest(value) {
  return JSON.parse(JSON.stringify(value));
}

let kensingtonReferenceMatchBuildPromise = null;

async function getKensingtonReferenceMatchResult() {
  if (!kensingtonReferenceMatchBuildPromise) {
    kensingtonReferenceMatchBuildPromise =
      buildArchitectureProjectVerticalSlice(
        createKensingtonReferenceMatchBrief(),
      );
  }
  return cloneForTest(await kensingtonReferenceMatchBuildPromise);
}

function wrapVisualsAsGeometryLockedImages(result) {
  const pngPayload =
    "AAA1x1BBBplaceholder_3dCCCgeometryRenderService" + "a".repeat(1600);
  return Object.fromEntries(
    Object.entries(result.artifacts.visuals3d).map(([panelType, artifact]) => [
      panelType,
      {
        ...artifact,
        asset_type: "geometry_locked_presentation_svg",
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artifact.width} ${artifact.height}" width="${artifact.width}" height="${artifact.height}"><image href="data:image/png;base64,${pngPayload}" x="0" y="0" width="${artifact.width}" height="${artifact.height}" preserveAspectRatio="xMidYMid slice"/></svg>`,
        metadata: {
          ...artifact.metadata,
          source: "project_graph_image_renderer",
          imageRenderFallback: false,
          imageRenderFallbackReason: null,
          imageRenderByteLength: 1200,
          imageProviderUsed: "openai",
          openaiImageUsed: true,
          hasPngImagePayload: true,
          openaiRequestId: `req_${panelType}`,
          presentationMode: "geometry_locked_image_render",
          visualFidelityStatus: "photoreal_geometry_locked",
          visualRenderMode: "photoreal_image_gen",
          renderProvenance: {
            sourceGeometryHash: result.geometryHash,
            referenceSource: "compiled_3d_control_svg",
            requestId: `req_${panelType}`,
          },
        },
      },
    ]),
  );
}

function expectPanelPlacementsDoNotOverlap(placements) {
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i];
      const b = placements[j];
      const overlaps =
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      expect({
        a: a.panelType,
        b: b.panelType,
        overlaps,
      }).toEqual({
        a: a.panelType,
        b: b.panelType,
        overlaps: false,
      });
    }
  }
}

function createOpenAIReasoningFetchMock() {
  let count = 0;
  return jest.fn().mockImplementation(async () => {
    count += 1;
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) =>
          ["x-request-id", "openai-request-id"].includes(name)
            ? `req_projectgraph_${count}`
            : null,
      },
      json: async () => ({
        choices: [
          {
            message: {
              content: `{"status":"ok","checkpoint":${count}}`,
            },
          },
        ],
        usage: {
          prompt_tokens: 2,
          completion_tokens: 1,
          total_tokens: 3,
        },
      }),
    };
  });
}

const expandedProjectGraphSubtypeCases = [
  ["hotel", "hospitality", "hotel", "hospitality_hotel", "beta"],
  ["resort", "hospitality", "resort", "hospitality_resort", "beta"],
  [
    "guest house",
    "hospitality",
    "guest-house",
    "hospitality_guest_house",
    "beta",
  ],
  ["warehouse", "industrial", "warehouse", "industrial_warehouse", "beta"],
  [
    "manufacturing",
    "industrial",
    "manufacturing",
    "industrial_manufacturing",
    "beta",
  ],
  ["workshop", "industrial", "workshop", "industrial_workshop", "beta"],
  ["museum", "cultural", "museum", "cultural_museum", "beta"],
  ["library", "cultural", "library", "cultural_library", "beta"],
  ["theatre", "cultural", "theatre", "cultural_theatre", "beta"],
  ["town hall", "government", "town-hall", "government_town_hall", "beta"],
  [
    "police station",
    "government",
    "police",
    "government_police_station",
    "beta",
  ],
  [
    "fire station",
    "government",
    "fire-station",
    "government_fire_station",
    "beta",
  ],
  ["mosque", "religious", "mosque", "religious_mosque", "beta"],
  ["church", "religious", "church", "religious_church", "beta"],
  ["temple", "religious", "temple", "religious_temple", "beta"],
  [
    "sports center",
    "recreation",
    "sports-center",
    "recreation_sports_center",
    "beta",
  ],
  ["gym", "recreation", "gym", "recreation_gym", "beta"],
  ["pool", "recreation", "pool", "recreation_pool", "beta"],
];

const projectGraphSubtypeSupportCases = [
  ["office", "commercial", "office", "office_studio", "production"],
  ["school", "education", "school", "education_studio", "beta"],
  ["clinic", "healthcare", "clinic", "clinic", "production"],
  ["hospital", "healthcare", "hospital", "hospital", "beta"],
  ...expandedProjectGraphSubtypeCases,
];

describe("projectGraphVerticalSliceService", () => {
  const originalModelSource = process.env.MODEL_SOURCE;
  const originalReasoningModel = process.env.OPENAI_REASONING_MODEL;
  const originalFastModel = process.env.OPENAI_FAST_MODEL;
  const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalReactGoogleMapsApiKey =
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const originalOpenAIApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAIImagesApiKey = process.env.OPENAI_IMAGES_API_KEY;
  const originalOpenAIReasoningApiKey = process.env.OPENAI_REASONING_API_KEY;
  const originalProjectGraphImageGenEnabled =
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED;
  const originalOpenAIStrictImageGen = process.env.OPENAI_STRICT_IMAGE_GEN;
  const originalA1TestRasterMode = process.env[A1_TEST_RASTER_MODE_ENV];
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.MODEL_SOURCE = "base";
    process.env.OPENAI_REASONING_MODEL = "gpt-5.4";
    process.env.OPENAI_FAST_MODEL = "gpt-5.4-mini";
    process.env.OPENAI_API_KEY = "sk-test-openai-base";
    process.env.OPENAI_IMAGES_API_KEY = "sk-test-openai-images";
    delete process.env.OPENAI_REASONING_API_KEY;
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "false";
    process.env.OPENAI_STRICT_IMAGE_GEN = "false";
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    // PR-D follow-up: opt the whole suite into the lightweight raster /
    // ink-metric stubs in svgRasteriser + analyseRenderedSheetPng so each
    // test validates metadata / layout / geometry without spending minutes
    // on the 300-DPI A1 PNG (~70 megapixels) and its 280M-iteration ink
    // walk. Tests that need the real raster path must override this.
    process.env[A1_TEST_RASTER_MODE_ENV] = A1_TEST_RASTER_STUB_VALUE;
    global.fetch = originalFetch;
  });

  afterEach(() => {
    if (originalModelSource === undefined) {
      delete process.env.MODEL_SOURCE;
    } else {
      process.env.MODEL_SOURCE = originalModelSource;
    }
    if (originalReasoningModel === undefined) {
      delete process.env.OPENAI_REASONING_MODEL;
    } else {
      process.env.OPENAI_REASONING_MODEL = originalReasoningModel;
    }
    if (originalFastModel === undefined) {
      delete process.env.OPENAI_FAST_MODEL;
    } else {
      process.env.OPENAI_FAST_MODEL = originalFastModel;
    }
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }
    if (originalReactGoogleMapsApiKey === undefined) {
      delete process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.REACT_APP_GOOGLE_MAPS_API_KEY = originalReactGoogleMapsApiKey;
    }
    if (originalOpenAIApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIApiKey;
    }
    if (originalOpenAIImagesApiKey === undefined) {
      delete process.env.OPENAI_IMAGES_API_KEY;
    } else {
      process.env.OPENAI_IMAGES_API_KEY = originalOpenAIImagesApiKey;
    }
    if (originalOpenAIReasoningApiKey === undefined) {
      delete process.env.OPENAI_REASONING_API_KEY;
    } else {
      process.env.OPENAI_REASONING_API_KEY = originalOpenAIReasoningApiKey;
    }
    if (originalProjectGraphImageGenEnabled === undefined) {
      delete process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED;
    } else {
      process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED =
        originalProjectGraphImageGenEnabled;
    }
    if (originalOpenAIStrictImageGen === undefined) {
      delete process.env.OPENAI_STRICT_IMAGE_GEN;
    } else {
      process.env.OPENAI_STRICT_IMAGE_GEN = originalOpenAIStrictImageGen;
    }
    if (originalA1TestRasterMode === undefined) {
      delete process.env[A1_TEST_RASTER_MODE_ENV];
    } else {
      process.env[A1_TEST_RASTER_MODE_ENV] = originalA1TestRasterMode;
    }
    global.fetch = originalFetch;
  });

  test("builds the brief to QA vertical slice from one ProjectGraph authority", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );

    expect(result.success).toBe(true);
    expect(result.qa.status).toBe("pass");
    expect(result.projectGraph.schema_version).toBe("project-graph-v1");
    expect(result.projectGraph.programme.spaces.length).toBeGreaterThan(4);
    expect(result.projectGraph.drawings.drawings.length).toBeGreaterThanOrEqual(
      4,
    );
    expect(result.artifacts.scene3d.source_model_hash).toBe(
      result.geometryHash,
    );
    expect(result.artifacts.a1Sheet.layoutVersion).toBe(
      "projectgraph-a1-reference-board-v1",
    );
    expect(result.artifacts.a1Sheet.svgString).toContain(
      `data-source-model-hash="${result.geometryHash}"`,
    );
    expect(result.artifacts.a1Sheet.svgString).toContain("@font-face");
    expect(result.artifacts.a1Sheet.svgString).toContain("ArchiAISans");
    expect(result.artifacts.a1Sheet.svgString).toContain("data:font/");
    expect(result.artifacts.a1Sheet.svgString).toContain(
      'data-raster-text-mode="font-paths"',
    );
    expect(result.artifacts.a1Sheet.svgString).not.toMatch(/<text\b/);
    expect(result.artifacts.a1Sheet.textRenderStatus).toMatchObject({
      mode: "font_paths",
      status: "pass",
      rasterSafe: true,
      remainingTextElementCount: 0,
    });
    expect(result.artifacts.textRenderStatus).toMatchObject({
      status: "pass",
      rasterTextMode: "font_paths",
    });
    expect(result.artifacts.presentationMode).toBe("deterministic_control");
    expect(result.artifacts.visualFidelityStatus).toBe(
      "degraded_control_render",
    );
    expect(result.artifacts.openaiConfigured).toBe(true);
    expect(result.artifacts.openaiReasoningUsed).toBe(false);
    expect(result.artifacts.openaiImageUsed).toBe(false);
    expect(result.artifacts.openaiImageFallbackReason).toBe("gate_disabled");
    expect(result.artifacts.openaiModelsUsed).toEqual([]);
    expect(result.artifacts.openaiRequestIds).toEqual([]);
    expect(result.artifacts.openaiUsage).toEqual([]);
    expect(result.artifacts.a1Sheet.metadata).toEqual(
      expect.objectContaining({
        openaiConfigured: true,
        openaiReasoningUsed: false,
        openaiImageUsed: false,
        openaiImageFallbackReason: "gate_disabled",
        openaiModelsUsed: [],
        openaiRequestIds: [],
        openaiUsage: [],
        visualPanelsFallbackReasons: expect.any(Object),
      }),
    );
    expect(
      Object.values(
        result.artifacts.a1Sheet.metadata.visualPanelsFallbackReasons,
      ),
    ).toEqual(expect.arrayContaining(["gate_disabled"]));
    expect(result.qa.openai).toEqual(
      expect.objectContaining({
        openaiConfigured: true,
        openaiReasoningUsed: false,
        openaiImageUsed: false,
        imageProviderUsed: "deterministic",
      }),
    );
    // Phase 5B — visual identity validation report attached to artifacts
    // and to sheet metadata. Deterministic-fallback path must not fail.
    // The validator is report-only; it never modifies the export gate
    // (the gate's decision is driven by its own evidence chain at
    // src/services/project/projectGraphVerticalSliceService.js Phase F
    // and is unchanged by this PR).
    expect(result.artifacts.visualIdentityValidation).toEqual(
      expect.objectContaining({
        version: "visual-manifest-validator-v1",
        strictMode: false,
      }),
    );
    expect(result.artifacts.visualIdentityValidation.status).not.toBe("fail");
    expect(result.artifacts.visualIdentityValidation.summary).toEqual(
      expect.objectContaining({ totalPanels: 4 }),
    );
    expect(
      Object.keys(result.artifacts.visualIdentityValidation.panels).sort(),
    ).toEqual(
      ["axonometric", "exterior_render", "hero_3d", "interior_3d"].sort(),
    );
    expect(
      result.artifacts.a1Sheet.metadata.visualIdentityValidation,
    ).toBeTruthy();
    expect(
      result.artifacts.a1Sheet.metadata.visualIdentityValidation.version,
    ).toBe("visual-manifest-validator-v1");
    expect(result.artifacts.a1Pdf.asset_type).toBe("a1_sheet_pdf");
    expect(result.artifacts.a1Pdf.sheet_size_mm).toEqual({
      width: 841,
      height: 594,
    });
    expect(result.artifacts.a1Pdf.source_model_hash).toBe(result.geometryHash);
    expect(result.artifacts.a1Pdf.renderedPngHash).toBeTruthy();
    expect(
      result.artifacts.a1Pdf.renderedProof.occupancy.nonBackgroundPixelRatio,
    ).toBeGreaterThan(0.015);
    expect(result.artifacts.renderedProof.renderedPngHash).toBe(
      result.artifacts.a1Pdf.renderedPngHash,
    );
    expect(result.artifacts.a1Pdf.renderedProof.textRenderStatus).toMatchObject(
      {
        status: "pass",
        rasterTextMode: "font_paths",
      },
    );
    expect(result.artifacts.siteMap.metadata.hasMapImage).toBe(true);
    expect(result.artifacts.siteMap.metadata.siteMapSource).toBe(
      "provided-site-snapshot",
    );
    expect(result.qa.issues.map((issue) => issue.code)).not.toContain(
      "SITE_MAP_FALLBACK_USED",
    );
    expect(result.artifacts.siteMap.svgString).toContain(
      'data-site-map-image="true"',
    );
    expect(result.artifacts.siteMap.svgString).not.toContain(
      "Site / Context Pack",
    );
    const placementByType = Object.fromEntries(
      result.artifacts.a1Sheet.panelPlacements.map((placement) => [
        placement.panelType,
        placement,
      ]),
    );
    expect(
      result.artifacts.a1Sheet.panelPlacements.map((p) => p.panelType),
    ).toEqual(
      expect.arrayContaining([
        "site_context",
        "floor_plan_ground",
        "floor_plan_first",
        "section_AA",
        "section_BB",
        "axonometric",
        "hero_3d",
        "interior_3d",
        "material_palette",
        "key_notes",
        "title_block",
      ]),
    );
    expectPanelPlacementsDoNotOverlap(result.artifacts.a1Sheet.panelPlacements);
    expect(placementByType.site_context.y).toBeLessThan(
      placementByType.section_AA.y,
    );
    expect(placementByType.material_palette.y).toBeGreaterThan(
      placementByType.section_AA.y,
    );
    expect(placementByType.title_block.x).toBeGreaterThan(
      placementByType.key_notes.x,
    );
    expect(result.artifacts.a1Sheet.svgString).toContain(
      'data-layout-version="projectgraph-a1-reference-board-v1"',
    );
    expect(result.artifacts.a1Sheet.svgString).toContain("MATERIAL PALETTE");
    expect(result.artifacts.a1Sheet.svgString).toContain("KEY NOTES");
    expect(result.artifacts.a1Sheet.svgString).toContain("Drawing No.");
    expect(result.artifacts.panelMap.material_palette.svgString).toContain(
      "<pattern",
    );
    expect(result.artifacts.panelMap.material_palette.svgString).toContain(
      "data-material-texture",
    );
    expect(result.artifacts.panelMap.material_palette.geometryHash).toBe(
      result.geometryHash,
    );
    expect(result.artifacts.panelMap.key_notes.geometryHash).toBe(
      result.geometryHash,
    );
    expect(result.artifacts.panelMap.title_block.geometryHash).toBe(
      result.geometryHash,
    );
    expect(Object.keys(result.artifacts.visuals3d).sort()).toEqual([
      "axonometric",
      "exterior_render",
      "hero_3d",
      "interior_3d",
    ]);
    for (const artifact of Object.values(result.artifacts.visuals3d)) {
      expect(artifact.source_model_hash).toBe(result.geometryHash);
      expect(artifact.authoritySource).toBe("project_graph_compiled_geometry");
      expect(artifact.svgString.length).toBeGreaterThan(1200);
      expect(artifact.metadata.camera).toEqual(expect.any(Object));
      expect(artifact.metadata.primitiveCount).toBeGreaterThanOrEqual(5);
      expect(artifact.metadata.sourceGeometryHash).toBe(result.geometryHash);
      expect(artifact.metadata.referenceSource).toBe("compiled_3d_control_svg");
      expect(artifact.metadata.imageRenderFallback).toBe(true);
      expect(artifact.metadata.imageProviderUsed).toBe("deterministic");
      expect(artifact.metadata.imageRenderFallbackReason).toBe("gate_disabled");
      expect(artifact.metadata.openaiConfigured).toBe(true);
      expect(artifact.metadata.openaiImageUsed).toBe(false);
      expect(artifact.metadata.presentationMode).toBe("deterministic_control");
      expect(artifact.metadata.visualFidelityStatus).toBe(
        "degraded_control_render",
      );
    }
    expect(result.qa.issues.map((issue) => issue.code)).toContain(
      "PRESENTATION_RENDER_FALLBACK_USED",
    );
    for (const artifact of Object.values(result.artifacts.drawings)) {
      expect(artifact.contentBounds).toEqual(
        expect.objectContaining({
          occupancyRatio: expect.any(Number),
          widthRatio: expect.any(Number),
          heightRatio: expect.any(Number),
        }),
      );
      expect(artifact.contentBounds.occupancyRatio).toBeGreaterThan(0.08);
      expect(artifact.normalizedViewBox).toMatch(/^-?\d/);
      expect(artifact.metadata.normalizedViewBox).toBe(
        artifact.normalizedViewBox,
      );
    }
    expect(result.artifacts.panelMap.site_context.url).toContain(
      "data:image/svg+xml",
    );
    expect(result.artifacts.panelMap.hero_3d.geometryHash).toBe(
      result.geometryHash,
    );

    // Phase D — visual manifest is attached and every visual panel shares
    // the same manifestHash so OpenAI image generation cannot drift the
    // building identity between hero_3d / exterior_render / interior_3d /
    // axonometric. With PROJECT_GRAPH_IMAGE_GEN_ENABLED=false the panels
    // are deterministic SVG fallbacks, but the lock still applies.
    expect(result.artifacts.visualManifest).toEqual(
      expect.objectContaining({
        version: "visual-manifest-v1",
        manifestId: expect.any(String),
        manifestHash: expect.any(String),
        storeyCount: expect.any(Number),
        negativeConstraints: expect.arrayContaining([
          expect.stringContaining("do not invent additional storeys"),
        ]),
      }),
    );
    expect(result.artifacts.visualManifestHash).toBe(
      result.artifacts.visualManifest.manifestHash,
    );
    expect(result.artifacts.visualManifest.geometryHash).toBe(
      result.geometryHash,
    );
    for (const visualPanelType of [
      "hero_3d",
      "exterior_render",
      "interior_3d",
      "axonometric",
    ]) {
      const visualPanel = result.artifacts.visuals3d[visualPanelType];
      expect(visualPanel).toBeDefined();
      expect(visualPanel.metadata.visualManifestHash).toBe(
        result.artifacts.visualManifest.manifestHash,
      );
      expect(visualPanel.metadata.visualManifestId).toBe(
        result.artifacts.visualManifest.manifestId,
      );
      expect(visualPanel.metadata.visualIdentityLocked).toBe(true);
      // Phase C metadata (gate disabled fallback) must coexist with Phase D
      // identity lock on the same panel artifact.
      expect(visualPanel.metadata.imageRenderFallback).toBe(true);
      expect(visualPanel.metadata.imageRenderFallbackReason).toBe(
        "gate_disabled",
      );
    }
    expect(result.projectGraph.sheets.sheets[0].exported_pdf_asset_id).toBe(
      result.artifacts.a1Pdf.asset_id,
    );
    expect(result.projectGraph.models3d.models[0].source_model_hash).toBe(
      result.geometryHash,
    );
    expect(result.projectGraph.models3d.models[0].asset_id).toBe(
      result.artifacts.scene3d.asset_id,
    );

    const programmeIds = new Set(
      result.projectGraph.programme.spaces.map((space) => space.space_id),
    );
    const modelIds = new Set(
      result.projectGraph.selected_design.spaces.map((space) => space.space_id),
    );
    for (const programmeId of programmeIds) {
      expect(modelIds.has(programmeId)).toBe(true);
    }

    const drawingHashes = new Set(
      result.projectGraph.drawings.drawings.map(
        (drawing) => drawing.source_model_hash,
      ),
    );
    expect([...drawingHashes]).toEqual([result.geometryHash]);
    expect(result.projectGraph.sheets.sheets[0].orientation).toBe("landscape");
    expect(result.modelRegistry.DRAWING_2D.deterministicGeometry).toBe(true);
    expect(result.modelRegistry.MODEL_3D.deterministicGeometry).toBe(true);
    expect(result.artifacts.executionTrace).toEqual(
      expect.objectContaining({
        source: "modelStepResolver",
        pipelineMode: "project_graph",
        modelProvenance: expect.arrayContaining([
          expect.objectContaining({
            stepId: "PROJECT_GRAPH",
            provider: "openai",
            apiKeyEnv: "OPENAI_API_KEY",
            fallbackUsed: expect.any(Boolean),
            fineTunedModelUsed: null,
          }),
          expect.objectContaining({
            stepId: "A1_SHEET",
            provider: "openai",
          }),
        ]),
        modelRoutes: expect.arrayContaining([
          expect.objectContaining({
            stepId: "PROJECT_GRAPH",
            apiKeyEnv: "OPENAI_API_KEY",
          }),
        ]),
        providerCalls: expect.arrayContaining([
          expect.objectContaining({
            stepId: "PROJECT_GRAPH",
            status: "skipped",
            providerUsed: "deterministic",
            fallbackReason: "test_runtime_provider_mock_not_supplied",
            openaiUsed: false,
            secretsRedacted: true,
          }),
          expect.objectContaining({
            stepId: "IMAGE_HERO_3D",
            provider: "openai",
            providerUsed: "deterministic",
            fallbackReason: "gate_disabled",
            openaiUsed: false,
          }),
        ]),
        providerFallbacks: expect.arrayContaining([
          expect.objectContaining({
            stepId: "IMAGE_HERO_3D",
            fallbackReason: "gate_disabled",
          }),
        ]),
        geometrySteps: expect.arrayContaining([
          expect.objectContaining({
            stepId: "DRAWING_2D",
            contentBoundsMeasured: true,
          }),
          expect.objectContaining({
            stepId: "MODEL_3D",
            primitiveCounts: expect.any(Object),
          }),
        ]),
        exportSteps: expect.arrayContaining([
          expect.objectContaining({
            stepId: "A1_EXPORT",
            renderedPngHash: expect.any(String),
          }),
        ]),
      }),
    );
    expect(JSON.stringify(result.artifacts.executionTrace)).not.toContain(
      "sk-",
    );
    expect(result.qa.checks.map((check) => check.code)).toContain(
      "A1_PDF_EXPORT_PRESENT_AND_SIZED",
    );
    expect(result.qa.checks.map((check) => check.code)).toContain(
      "A1_PDF_RENDER_PROOF_PRESENT",
    );
    expect(result.qa.checks.map((check) => check.code)).toContain(
      "REQUIRED_3D_PANELS_PRESENT",
    );
    expect(result.qa.checks.map((check) => check.code)).toContain(
      "TECHNICAL_DRAWINGS_CONTENT_BOUNDS_TIGHT",
    );
    expect(result.qa.checks.map((check) => check.code)).toContain(
      "PROJECT_GRAPH_REFERENCES_3D_PROJECTION",
    );
    // Plan §10 RIBA scorecard categories
    expect(result.qa.totalScore).toBeGreaterThanOrEqual(85);
    expect(result.qa.categoryScores).toEqual(
      expect.objectContaining({
        programme: expect.any(Object),
        consistency_2d_3d: expect.any(Object),
        site_context: expect.any(Object),
        climate: expect.any(Object),
        regulation: expect.any(Object),
        architecture: expect.any(Object),
        graphic: expect.any(Object),
      }),
    );
    // Each plan §10 category must total exactly the prescribed weight
    expect(result.qa.categoryScores.programme.max).toBe(20);
    expect(result.qa.categoryScores.consistency_2d_3d.max).toBe(20);
    expect(result.qa.categoryScores.site_context.max).toBe(15);
    expect(result.qa.categoryScores.climate.max).toBe(15);
    expect(result.qa.categoryScores.regulation.max).toBe(10);
    expect(result.qa.categoryScores.architecture.max).toBe(10);
    expect(result.qa.categoryScores.graphic.max).toBe(10);
  });

  test("executes OpenAI reasoning checkpoints when a provider mock is supplied", async () => {
    const fetchImpl = createOpenAIReasoningFetchMock();

    const result = await buildArchitectureProjectVerticalSlice({
      ...createReadingRoomBrief(),
      providerExecution: {
        openaiReasoning: {
          mode: "required",
          fetchImpl,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(result.artifacts.openaiReasoningUsed).toBe(true);
    expect(result.artifacts.openaiImageUsed).toBe(false);
    expect(result.artifacts.openaiRequestIds).toHaveLength(8);
    expect(result.artifacts.openaiUsage).toHaveLength(8);
    expect(result.artifacts.openaiModelsUsed).toEqual(
      expect.arrayContaining(["gpt-5.4", "gpt-5.4-mini"]),
    );
    expect(result.qa.openai).toEqual(
      expect.objectContaining({
        openaiReasoningUsed: true,
        reasoningProviderUsed: "openai",
      }),
    );
    for (const stepId of [
      "BRIEF",
      "SITE",
      "CLIMATE",
      "REGS",
      "PROGRAMME",
      "PROJECT_GRAPH",
      "A1_SHEET",
      "QA",
    ]) {
      expect(result.artifacts.executionTrace.providerCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepId,
            status: "ok",
            providerUsed: "openai",
            openaiUsed: true,
            requestId: expect.stringMatching(/^req_projectgraph_/),
            usage: expect.objectContaining({ total_tokens: 3 }),
            secretsRedacted: true,
          }),
        ]),
      );
    }
    expect(JSON.stringify(result.artifacts.executionTrace)).not.toContain(
      "sk-",
    );
  });

  test("fails closed when required OpenAI reasoning has no server key", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_REASONING_API_KEY;
    const fetchImpl = createOpenAIReasoningFetchMock();

    const result = await buildArchitectureProjectVerticalSlice({
      ...createReadingRoomBrief(),
      providerExecution: {
        openaiReasoning: {
          mode: "required",
          fetchImpl,
        },
      },
    });

    const blockedCalls = result.artifacts.executionTrace.providerCalls.filter(
      (call) => call.status === "blocked",
    );
    expect(result.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(blockedCalls).toHaveLength(8);
    expect(blockedCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: "PROJECT_GRAPH",
          fallbackReason: "missing_api_key",
          errorCode: "OPENAI_REASONING_API_KEY_MISSING",
          openaiUsed: false,
        }),
      ]),
    );
    expect(result.qa.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OPENAI_REASONING_PROVIDER_BLOCKED",
          severity: "error",
        }),
      ]),
    );
    expect(result.qa.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OPENAI_REASONING_PROVIDER_EXECUTED",
          status: "fail",
        }),
      ]),
    );
  });

  test("uses Google Static Maps metadata when no provided site map is supplied", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const pngBlob = new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSFIAAAeSAi8BTyQ1AAAAAElFTkSuQmCC",
          "base64",
        ),
      ],
      {
        type: "image/png",
      },
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => pngBlob,
    });

    const result = await buildArchitectureProjectVerticalSlice({
      brief: {
        project_name: "Google Map Smoke",
        building_type: "community",
        site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
        target_gia_m2: 320,
        target_storeys: 2,
      },
      sitePolygon: [
        { lat: 51.54175, lng: -0.1024 },
        { lat: 51.54175, lng: -0.10195 },
        { lat: 51.54145, lng: -0.10195 },
        { lat: 51.54145, lng: -0.1024 },
      ],
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(result.artifacts.siteMap.metadata.hasMapImage).toBe(true);
    expect(result.artifacts.siteMap.metadata.siteMapSource).toBe(
      "google-static-maps",
    );
    expect(result.artifacts.siteMap.svgString).toContain("Google Static Maps");
    expect(result.qa.issues.map((issue) => issue.code)).not.toContain(
      "SITE_MAP_FALLBACK_USED",
    );
  });

  test("flags deterministic fallback when no provided or Google map is available", async () => {
    const result = await buildArchitectureProjectVerticalSlice({
      brief: {
        project_name: "Fallback Map Smoke",
        building_type: "community",
        site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
        target_gia_m2: 320,
        target_storeys: 2,
      },
    });

    expect(result.artifacts.siteMap.metadata.hasMapImage).toBe(false);
    expect(result.artifacts.siteMap.metadata.siteMapSource).toBe(
      "deterministic-site-svg-fallback",
    );
    expect(result.artifacts.siteMap.svgString).toContain(
      "Deterministic fallback site diagram",
    );
    expect(result.artifacts.siteMap.svgString).not.toContain(
      "Google Static Maps",
    );
    expect(result.qa.issues.map((issue) => issue.code)).toContain(
      "SITE_MAP_FALLBACK_USED",
    );
  });

  test("does not propagate low-confidence fallback boundary area into ProjectGraph site authority", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const pngBlob = new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSFIAAAeSAi8BTyQ1AAAAAElFTkSuQmCC",
          "base64",
        ),
      ],
      {
        type: "image/png",
      },
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => pngBlob,
    });

    const input = createLowConfidenceBradfordBoundaryBrief();
    input.siteSnapshot = {
      mapType: "hybrid",
      sitePolygon: input.locationData.siteAnalysis.estimatedSiteBoundary,
      metadata: {
        sitePlanMode: "contextual_estimated_boundary",
        boundaryAuthoritative: false,
        boundaryEstimated: true,
        contextualBoundaryOverlayUsed: true,
        contextualBoundaryPolygon:
          input.locationData.siteAnalysis.estimatedSiteBoundary,
      },
    };

    const result = await buildArchitectureProjectVerticalSlice(input);
    const issueCodes = result.qa.issues.map((issue) => issue.code);
    const staticMapUrl = global.fetch.mock.calls[0][0];

    expect(global.fetch).toHaveBeenCalled();
    expect(staticMapUrl).toContain("visible=");
    expect(staticMapUrl).toContain("maptype=roadmap");
    expect(staticMapUrl).not.toContain("maptype=hybrid");
    expect(staticMapUrl).not.toContain("maptype=satellite");
    expect(staticMapUrl).not.toContain("path=");
    expect(staticMapUrl).toContain("53.79224,-1.75556");
    expect(result.success).toBe(true);
    expect(result.projectGraph.site.boundary_authoritative).toBe(false);
    expect(result.projectGraph.site.boundary_source).toBe(
      "Intelligent Fallback",
    );
    expect(result.projectGraph.site.boundary_confidence).toBe(0.4);
    expect(result.projectGraph.site.estimated_area_m2).toBe(119408);
    expect(result.projectGraph.site.area_m2).toBeLessThan(1000);
    expect(result.projectGraph.site.area_m2).not.toBe(119408);
    expect(result.artifacts.projectGeometry.site.area_m2).toBe(
      result.projectGraph.site.area_m2,
    );
    expect(
      result.projectGraph.site.data_quality.map((issue) => issue.code),
    ).toContain("SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE");
    expect(issueCodes).toContain("SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE");
    expect(result.artifacts.siteMap.metadata.hasMapImage).toBe(true);
    expect(result.artifacts.siteMap.metadata.siteMapSource).toBe(
      "google-static-maps",
    );
    expect(result.artifacts.siteMap.metadata.mapType).toBe("roadmap");
    expect(result.artifacts.siteMap.metadata.boundaryAuthoritative).toBe(false);
    expect(result.artifacts.siteMap.metadata.sitePlanMode).toBe(
      "contextual_estimated_boundary",
    );
    expect(result.artifacts.siteMap.svgString).toContain(
      "ESTIMATED / CONTEXTUAL - VERIFY",
    );
    expect(result.artifacts.siteMap.svgString).toContain("Google Static Maps");
    expect(result.artifacts.siteMap.svgString).not.toContain('opacity="0.38"');
    expect(result.artifacts.siteMap.svgString).toContain('fill="#b7d7a833"');
    expect(result.artifacts.siteMap.svgString).toContain('stroke="#e87524"');
    expect(result.artifacts.siteMap.svgString).toContain("Boundary estimated");
    expect(result.artifacts.siteMap.svgString).toContain(
      "Boundary source: Intelligent Fallback",
    );
    expect(result.artifacts.siteMap.svgString).toContain("MAIN ENTRY");
    expect(result.artifacts.siteMap.svgString).toContain('stroke="#1976D2"');
  });

  test("preserves high-confidence boundary behavior", async () => {
    const briefInput = createReadingRoomBrief();
    briefInput.locationData = {
      siteAnalysis: {
        siteBoundary: briefInput.sitePolygon,
        surfaceArea: 1040,
        boundaryAuthoritative: true,
        boundarySource: "OpenStreetMap",
        boundaryConfidence: 0.92,
      },
    };

    const result = await buildArchitectureProjectVerticalSlice(briefInput);

    expect(result.success).toBe(true);
    expect(result.projectGraph.site.boundary_authoritative).toBe(true);
    expect(result.projectGraph.site.area_m2).toBe(1040);
    expect(result.artifacts.siteMap.metadata.sitePlanMode).toBe(
      "authoritative_boundary",
    );
    expect(result.artifacts.siteMap.metadata.boundarySource).toBe(
      "OpenStreetMap",
    );
    expect(result.artifacts.siteMap.svgString).toContain("AUTHORITATIVE");
    expect(result.artifacts.siteMap.svgString).toContain('stroke="#1976D2"');
    expect(result.artifacts.siteMap.svgString).toContain("MAIN ENTRY");
    expect(result.artifacts.siteMap.svgString).toContain(
      "Boundary source: OpenStreetMap",
    );
    expect(result.qa.issues.map((issue) => issue.code)).not.toContain(
      "SITE_BOUNDARY_ESTIMATED_NOT_AUTHORITATIVE",
    );
  });

  test("manual_verified boundary overrides estimated metadata and threads main entry into A1 site plan", async () => {
    const briefInput = createReadingRoomBrief();
    const manualMainEntry = {
      orientation: "south",
      bearingDeg: 180,
      frontageEdgeId: "edge-0",
      mainEntryEdgeId: "edge-0",
      source: "manual",
      confidence: 1,
      warnings: [],
    };
    briefInput.mainEntry = manualMainEntry;
    briefInput.mainEntryDirection = manualMainEntry;
    briefInput.siteMetrics = {
      areaM2: 1040,
      area: 1040,
      surfaceAreaM2: 1040,
      boundaryAuthoritative: true,
      boundarySource: "manual_verified",
      boundaryConfidence: 1,
      hash: "manual-hash",
    };
    briefInput.locationData = {
      boundaryAuthoritative: true,
      boundarySource: "manual_verified",
      boundaryConfidence: 1,
      siteAnalysis: {
        siteBoundary: briefInput.sitePolygon,
        areaM2: 1040,
        surfaceAreaM2: 1040,
        boundaryAuthoritative: true,
        boundarySource: "manual_verified",
        boundaryConfidence: 1,
        estimatedOnly: false,
        mainEntry: manualMainEntry,
        mainEntryDirection: manualMainEntry,
      },
      mainEntry: manualMainEntry,
      mainEntryDirection: manualMainEntry,
    };

    const result = await buildArchitectureProjectVerticalSlice(briefInput);

    expect(result.success).toBe(true);
    expect(result.projectGraph.site.boundary_authoritative).toBe(true);
    expect(result.projectGraph.site.boundary_source).toBe("manual_verified");
    expect(result.projectGraph.site.boundary_confidence).toBe(1);
    expect(result.projectGraph.site.area_m2).toBe(1040);
    expect(result.projectGraph.site.main_entry).toEqual(manualMainEntry);
    expect(result.artifacts.siteMap.metadata.boundaryLabel).toBe(
      "MANUAL VERIFIED",
    );
    expect(result.artifacts.siteMap.metadata.mainEntry).toEqual(
      manualMainEntry,
    );
    expect(result.artifacts.siteMap.svgString).toContain("MANUAL VERIFIED");
    expect(result.artifacts.siteMap.svgString).toContain("MAIN ENTRY");
    expect(result.artifacts.siteMap.svgString).toContain('stroke="#1976D2"');
    expect(result.visualManifest.mainEntry).toEqual(manualMainEntry);
  });

  test.each([
    "dwelling",
    "multi_residential",
    "mixed_use",
    "community",
    "office_studio",
    "education_studio",
  ])(
    "produces a non-empty programme template for known building_type %s",
    async (buildingType) => {
      const briefInput = createReadingRoomBrief();
      briefInput.brief.building_type = buildingType;
      briefInput.brief.project_name = `Smoke Test ${buildingType}`;
      const result = await buildArchitectureProjectVerticalSlice(briefInput);

      expect(KNOWN_BUILDING_TYPES).toContain(buildingType);
      expect(
        result.projectGraph.programme.spaces.length,
      ).toBeGreaterThanOrEqual(6);
      expect(result.projectGraph.programme.template_provenance.source).toBe(
        "matched_template",
      );
      expect(
        result.projectGraph.programme.template_provenance.resolved_template,
      ).toBe(buildingType);
      expect(
        result.projectGraph.programme.template_provenance
          .programme_template_key,
      ).toBe(buildingType);
      const totalArea = result.projectGraph.programme.spaces.reduce(
        (sum, space) => sum + Number(space.target_area_m2 || 0),
        0,
      );
      const targetGia = briefInput.brief.target_gia_m2;
      expect(totalArea).toBeGreaterThan(targetGia * 0.9);
      expect(totalArea).toBeLessThan(targetGia * 1.1);
    },
  );

  test.each(projectGraphSubtypeSupportCases)(
    "maps %s category/subtype to ProjectGraph programme metadata and A1 wording",
    async (_label, category, subType, canonicalBuildingType, supportStatus) => {
      const briefInput = createReadingRoomBrief();
      delete briefInput.brief.building_type;
      briefInput.brief.project_name = `Registry Smoke ${canonicalBuildingType}`;
      briefInput.brief.target_gia_m2 = 520;
      briefInput.projectDetails = {
        category,
        subType,
        area: 520,
        floorCount: 2,
        floorCountLocked: true,
      };

      const brief =
        __projectGraphVerticalSliceInternals.normalizeBrief(briefInput);
      const programme = __projectGraphVerticalSliceInternals.buildProgramme({
        brief,
      });
      const site = __projectGraphVerticalSliceInternals.buildSiteContext({
        brief,
        sitePolygon: briefInput.sitePolygon,
        siteMetrics: briefInput.siteMetrics,
      });
      const climate = __projectGraphVerticalSliceInternals.buildClimatePack(
        brief,
        site,
      );
      const localStyle =
        __projectGraphVerticalSliceInternals.buildLocalStylePack(
          brief,
          site,
          climate,
        );
      const projectGeometry =
        __projectGraphVerticalSliceInternals.buildProjectGeometryFromProgramme({
          brief,
          site,
          programme,
          localStyle,
          climate,
        });
      const placedProgramme =
        __projectGraphVerticalSliceInternals.syncProgrammeActuals(
          programme,
          projectGeometry,
        );
      const compiledProject =
        __projectGraphVerticalSliceInternals.compileProject({
          projectGeometry,
          masterDNA: {
            projectName: brief.project_name,
            projectID: projectGeometry.project_id,
            styleDNA: projectGeometry.metadata.style_dna,
            rooms: placedProgramme.spaces,
          },
          locationData: {
            address: brief.site_input.address,
            coordinates: { lat: site.lat, lng: site.lon },
            climate: { type: climate.weather_source },
            localMaterials: localStyle.material_palette,
          },
        });
      const spaces = programme.spaces;
      const levelIndexes = new Set(
        spaces.map((space) => Number(space.target_level_index)),
      );
      const titleBlock = buildTitleBlockPanelArtifact({
        projectGraphId: projectGeometry.project_id,
        brief,
        geometryHash: compiledProject.geometryHash,
        sheetPlan: { sheet_number: "A1-TEST", label: "RIBA Stage 2 Test" },
      });
      const keyNotes = buildKeyNotesPanelArtifact({
        projectGraphId: projectGeometry.project_id,
        brief,
        site,
        climate,
        regulations: {},
        localStyle,
        geometryHash: compiledProject.geometryHash,
      });
      const programmeLabel = brief.project_type_support.label;

      expect(KNOWN_BUILDING_TYPES).toContain(canonicalBuildingType);
      expect(brief).toEqual(
        expect.objectContaining({
          building_type: canonicalBuildingType,
          canonical_building_type: canonicalBuildingType,
          original_category: category,
          original_subtype: subType,
          support_status: supportStatus,
          programme_template_key: canonicalBuildingType,
          project_type_route: "project_graph",
        }),
      );
      expect(brief.project_type_support).toEqual(
        expect.objectContaining({
          categoryId: category,
          subtypeId: subType,
          canonicalBuildingType,
          route: "project_graph",
          supportStatus,
        }),
      );
      expect(spaces.length).toBeGreaterThanOrEqual(6);
      expect(levelIndexes.has(0)).toBe(true);
      expect(Math.max(...levelIndexes)).toBeGreaterThanOrEqual(1);
      expect(projectGeometry.levels.length).toBeGreaterThan(0);
      expect(projectGeometry.rooms.length).toBeGreaterThan(0);
      expect(compiledProject.geometryHash).toEqual(expect.any(String));
      expect(programme.template_provenance).toEqual(
        expect.objectContaining({
          source: "matched_template",
          resolved_template: canonicalBuildingType,
          programme_template_key: canonicalBuildingType,
          support_status: supportStatus,
        }),
      );
      expect(brief.building_type).not.toBe("dwelling");
      expect(brief.building_type).not.toBe("detached-house");
      expect(spaces.map((space) => space.name).join(" ")).not.toMatch(
        /principal bedroom|living room|kitchen dining|kitchen\/dining/i,
      );
      expect(titleBlock.metadata).toEqual(
        expect.objectContaining({
          programmeLabel,
          buildingType: canonicalBuildingType,
          programmeTemplateKey: canonicalBuildingType,
        }),
      );
      expect(titleBlock.svgString).toContain(programmeLabel.toUpperCase());
      expect(keyNotes.metadata).toEqual(
        expect.objectContaining({
          programmeLabel,
          buildingType: canonicalBuildingType,
          programmeTemplateKey: canonicalBuildingType,
        }),
      );
      expect(keyNotes.svgString).toContain(`Programme: ${programmeLabel}.`);
    },
  );

  test("respects manual target_storeys=4 and emits one floor plan panel per level", async () => {
    const briefInput = createReadingRoomBrief();
    briefInput.brief.project_name = "Multi-Storey Reading Room";
    briefInput.brief.target_storeys = 4;
    // Scale GIA proportionally so programme area balances across the 4 levels.
    briefInput.brief.target_gia_m2 = 640;
    briefInput.brief.building_type = "multi_residential";
    const result = await buildArchitectureProjectVerticalSlice(briefInput);

    // Storey count must round-trip through the brief without silent capping.
    expect(result.projectGraph.brief.target_storeys).toBe(4);
    // Technical drawings emit one floor-plan SVG per level.
    const panelTypes = Object.values(result.artifacts.drawings || {})
      .map((artifact) => artifact.panel_type)
      .sort();
    expect(panelTypes).toEqual(
      expect.arrayContaining([
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
        "floor_plan_level3",
      ]),
    );
    // Programme spaces distribute across all 4 storeys, not just ground+first.
    const levelIndexes = new Set(
      result.projectGraph.programme.spaces.map(
        (space) => space.target_level_index,
      ),
    );
    expect(levelIndexes.has(0)).toBe(true);
    expect(Math.max(...levelIndexes)).toBeGreaterThanOrEqual(2);
    // Split 4+ storey outputs may move upper floor plans to companion sheets,
    // but the complete sheet series must still include every floor-plan panel.
    const sheetSeriesPanelTypes = (result.artifacts.sheetSeries || []).flatMap(
      (sheet) => sheet.panel_types || [],
    );
    expect(result.artifacts.a1Sheet.svgString).toContain("floor_plan_level2");
    expect(sheetSeriesPanelTypes).toEqual(
      expect.arrayContaining([
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
        "floor_plan_level3",
      ]),
    );
  });

  test("keeps uneven user programme GIA within tolerance across multi-storey geometry", async () => {
    const briefInput = createReadingRoomBrief();
    briefInput.brief.project_name = "Uneven User Programme";
    briefInput.brief.building_type = "dwelling";
    briefInput.brief.target_gia_m2 = 300;
    briefInput.brief.target_storeys = 3;
    briefInput.programSpaces = [
      { id: "entrance", name: "Entrance", area: 20, levelIndex: 0 },
      { id: "living", name: "Living", area: 70, levelIndex: 0 },
      { id: "kitchen", name: "Kitchen", area: 46.5, levelIndex: 0 },
      { id: "bed1", name: "Bedroom 1", area: 44.3, levelIndex: 1 },
      { id: "bed2", name: "Bedroom 2", area: 40, levelIndex: 1 },
      { id: "studio", name: "Studio", area: 45, levelIndex: 2 },
      { id: "bed3", name: "Bedroom 3", area: 34.2, levelIndex: 2 },
    ];

    const result = await buildArchitectureProjectVerticalSlice(briefInput);
    const actualGia =
      result.projectGraph.programme.area_summary.gross_internal_area_m2;
    const targetGia = result.projectGraph.brief.target_gia_m2;
    const areaDeltaRatio = Math.abs(actualGia - targetGia) / targetGia;

    expect(result.success).toBe(true);
    expect(areaDeltaRatio).toBeLessThanOrEqual(0.15);
    expect(result.qa.issues.map((issue) => issue.code)).not.toContain(
      "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
    );
  });

  test("unknown building_type does not silently render as a dwelling and is flagged in template_provenance", async () => {
    const briefInput = createReadingRoomBrief();
    briefInput.brief.building_type = "data-center";
    briefInput.brief.project_name = "Unknown Type Smoke";
    const result = await buildArchitectureProjectVerticalSlice(briefInput);

    expect(result.projectGraph.programme.template_provenance.source).toBe(
      "fallback_template",
    );
    expect(
      result.projectGraph.programme.template_provenance.requested_building_type,
    ).toBe("data-center");
    expect(
      result.projectGraph.programme.template_provenance.resolved_template,
    ).toBe("community");
    const dwellingSpaceNames = new Set([
      "Principal bedroom",
      "Bedroom 2",
      "Bedroom 3 or study",
    ]);
    const hasDwellingSpace = result.projectGraph.programme.spaces.some(
      (space) => dwellingSpaceNames.has(space.name),
    );
    expect(hasDwellingSpace).toBe(false);
  });

  test("QA fails when a 2D drawing drifts from the 3D model hash", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const tamperedGraph = {
      ...result.projectGraph,
      drawings: {
        ...result.projectGraph.drawings,
        drawings: result.projectGraph.drawings.drawings.map((drawing, index) =>
          index === 0
            ? { ...drawing, source_model_hash: "wrong-geometry-hash" }
            : drawing,
        ),
      },
    };

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: tamperedGraph,
      artifacts: result.artifacts,
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toContain(
      "SOURCE_MODEL_HASH_MISMATCH_2D",
    );
  });

  test("QA fails closed when rendered PDF proof and 3D panels are missing", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const strippedPanelArtifacts = Object.fromEntries(
      Object.entries(result.artifacts.panelArtifacts).filter(
        ([, artifact]) =>
          ![
            "hero_3d",
            "exterior_render",
            "axonometric",
            "interior_3d",
          ].includes(artifact.panel_type),
      ),
    );
    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        visuals3d: {},
        panelArtifacts: strippedPanelArtifacts,
        a1Pdf: {
          ...result.artifacts.a1Pdf,
          renderedProof: {
            renderedPngHash: null,
            passed: false,
            occupancy: { nonBackgroundPixelRatio: 0 },
          },
        },
      },
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "A1_PDF_RENDER_EMPTY",
        "REQUIRED_3D_PANEL_MISSING",
      ]),
    );
  });

  test("QA accepts geometry-locked OpenAI image wrappers with compiled 3D control provenance", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const pngPayload =
      "AAA1x1BBBplaceholder_3dCCCgeometryRenderService" + "a".repeat(1600);
    const imageWrappedVisuals = Object.fromEntries(
      Object.entries(result.artifacts.visuals3d).map(
        ([panelType, artifact]) => [
          panelType,
          {
            ...artifact,
            asset_type: "geometry_locked_presentation_svg",
            svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artifact.width} ${artifact.height}" width="${artifact.width}" height="${artifact.height}"><image href="data:image/png;base64,${pngPayload}" x="0" y="0" width="${artifact.width}" height="${artifact.height}" preserveAspectRatio="xMidYMid slice"/></svg>`,
            metadata: {
              ...artifact.metadata,
              source: "project_graph_image_renderer",
              imageRenderFallback: false,
              imageRenderFallbackReason: null,
              imageRenderByteLength: 1200,
              imageProviderUsed: "openai",
              openaiImageUsed: true,
              hasPngImagePayload: true,
              openaiRequestId: `req_${panelType}`,
              presentationMode: "geometry_locked_image_render",
              visualFidelityStatus: "photoreal_geometry_locked",
              visualRenderMode: "photoreal_image_gen",
              renderProvenance: {
                sourceGeometryHash: result.geometryHash,
                referenceSource: "compiled_3d_control_svg",
                requestId: `req_${panelType}`,
              },
            },
          },
        ],
      ),
    );

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        visuals3d: imageWrappedVisuals,
      },
    });

    expect(qa.status).toBe("pass");
    expect(qa.issues.map((issue) => issue.code)).not.toContain(
      "PLACEHOLDER_3D_RENDER_USED",
    );
    expect(qa.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REQUIRED_3D_PANELS_PRESENT",
          status: "pass",
        }),
      ]),
    );
  });

  test("reference-match export uses active Kensington brief data and blocks deterministic image fallback", async () => {
    const result = await getKensingtonReferenceMatchResult();

    expect(result.projectGraph.brief.reference_match).toBe(true);
    expect(result.projectGraph.brief.project_name).toBe(
      "17 Kensington Road House",
    );
    expect(result.projectGraph.brief.site_input.address).toBe(
      "17 Kensington Rd, DN15 8BQ, UK",
    );
    expect(result.projectGraph.brief.target_gia_m2).toBe(75);
    expect(result.projectGraph.brief.target_storeys).toBe(2);
    expect(result.success).toBe(false);
    expect(result.qa.status).toBe("fail");

    const titleBlock = Object.values(result.artifacts.panelArtifacts).find(
      (artifact) => artifact.panel_type === "title_block",
    );
    expect(titleBlock.metadata).toEqual(
      expect.objectContaining({
        briefInputHash: result.projectGraph.brief.brief_input_hash,
        projectName: "17 Kensington Road House",
        location: "17 Kensington Rd, DN15 8BQ, UK",
        targetGiaM2: 75,
        targetStoreys: 2,
      }),
    );
    expect(titleBlock.svgString).toContain("17 Kensington Road House");
    expect(titleBlock.svgString).toContain("17 Kensington Rd, DN15 8BQ, UK");
    expect(titleBlock.svgString).not.toContain("Stale Cherry House");
    expect(titleBlock.svgString).not.toContain("97 Bradford Street");

    const issueCodes = result.qa.issues.map((issue) => issue.code);
    expect(issueCodes).toContain("REFERENCE_MATCH_PHOTOREAL_FALLBACK_USED");
    expect(issueCodes).not.toContain("REFERENCE_MATCH_STALE_BRIEF_DATA");
    expect(issueCodes).not.toContain("REFERENCE_MATCH_UPPER_FLOOR_MISSING");
    expect(result.artifacts.a1Sheet.referenceMatch).toBe(true);
    expect(
      result.artifacts.a1Sheet.quality.panelReferenceMetrics.floor_plan_ground,
    ).toEqual(
      expect.objectContaining({
        slotOccupancy: expect.any(Number),
        sourceGeometryHash: result.geometryHash,
        briefInputHash: result.projectGraph.brief.brief_input_hash,
        renderMode: "compiled_technical_svg",
      }),
    );
    expect(result.artifacts.a1Sheet.quality.exportGate.allowed).toBe(false);
  });

  test("reference-match QA passes when visual panels are geometry-locked image renders", async () => {
    const result = await getKensingtonReferenceMatchResult();
    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        visuals3d: wrapVisualsAsGeometryLockedImages(result),
      },
    });

    expect(qa.status).toBe("pass");
    expect(qa.referenceMatch).toBe(true);
    expect(qa.issues.map((issue) => issue.code)).not.toContain(
      "REFERENCE_MATCH_PHOTOREAL_FALLBACK_USED",
    );
    expect(qa.issues.map((issue) => issue.code)).not.toContain(
      "REFERENCE_MATCH_LOW_PANEL_OCCUPANCY",
    );
    expect(qa.panelRenderabilityRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          panelType: "floor_plan_ground",
          slotOccupancy: expect.any(Number),
          sourceGeometryHash: result.geometryHash,
          renderMode: "compiled_technical_svg",
        }),
      ]),
    );
  });

  test("reference-match QA rejects repeated elevation identity hashes", async () => {
    const result = await getKensingtonReferenceMatchResult();
    const drawings = cloneForTest(result.artifacts.drawings);
    const north = Object.values(drawings).find(
      (artifact) => artifact.panel_type === "elevation_north",
    );
    const southEntry = Object.entries(drawings).find(
      ([, artifact]) => artifact.panel_type === "elevation_south",
    );
    drawings[southEntry[0]] = {
      ...drawings[southEntry[0]],
      svgString: north.svgString,
      svgHash: north.svgHash,
      contentBounds: north.contentBounds,
      normalizedViewBox: north.normalizedViewBox,
      technicalQualityMetadata: north.technicalQualityMetadata,
      metadata: {
        ...drawings[southEntry[0]].metadata,
        contentBounds: north.contentBounds,
        normalizedViewBox: north.normalizedViewBox,
        technicalQualityMetadata: north.technicalQualityMetadata,
      },
    };

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        drawings,
        visuals3d: wrapVisualsAsGeometryLockedImages(result),
      },
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toContain(
      "REFERENCE_MATCH_REPEATED_ELEVATION_IDENTITY",
    );
  });

  test("QA still catches visible 3D placeholder tokens outside embedded image data", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const artifact = result.artifacts.visuals3d.hero_3d;
    const visiblePlaceholderHero = {
      ...artifact,
      asset_type: "geometry_locked_presentation_svg",
      svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artifact.width} ${artifact.height}" width="${artifact.width}" height="${artifact.height}"><metadata>geometryRenderService placeholder_3d</metadata><image href="data:image/png;base64,${"a".repeat(1600)}" x="0" y="0" width="${artifact.width}" height="${artifact.height}" preserveAspectRatio="xMidYMid slice"/></svg>`,
      metadata: {
        ...artifact.metadata,
        source: "project_graph_image_renderer",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        imageRenderByteLength: 1200,
        imageProviderUsed: "openai",
        openaiImageUsed: true,
        hasPngImagePayload: true,
        openaiRequestId: "req_visible_placeholder",
        presentationMode: "geometry_locked_image_render",
        visualFidelityStatus: "photoreal_geometry_locked",
        visualRenderMode: "photoreal_image_gen",
        renderProvenance: {
          sourceGeometryHash: result.geometryHash,
          referenceSource: "compiled_3d_control_svg",
          requestId: "req_visible_placeholder",
        },
      },
    };

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        visuals3d: {
          ...result.artifacts.visuals3d,
          hero_3d: visiblePlaceholderHero,
        },
      },
    });

    const placeholderIssue = qa.issues.find(
      (issue) => issue.code === "PLACEHOLDER_3D_RENDER_USED",
    );

    expect(qa.status).toBe("fail");
    expect(placeholderIssue).toBeTruthy();
    expect(placeholderIssue.details.placeholder3dPanels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          panelType: "hero_3d",
          reason: "regex_match_placeholder",
        }),
      ]),
    );
  });

  test("QA fails when required 3D panels are visually empty despite matching names", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const weakHero = {
      ...result.artifacts.visuals3d.hero_3d,
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><text x="20" y="20">placeholder</text></svg>',
      metadata: {
        ...result.artifacts.visuals3d.hero_3d.metadata,
        camera: null,
        primitiveCount: 0,
        surfaceCount: 0,
      },
    };

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        visuals3d: {
          ...result.artifacts.visuals3d,
          hero_3d: weakHero,
        },
      },
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toContain(
      "PLACEHOLDER_3D_RENDER_USED",
    );
  });

  test("QA fails when technical drawings lack measured content bounds", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const tamperedDrawings = Object.fromEntries(
      Object.entries(result.artifacts.drawings).map(([assetId, artifact]) => [
        assetId,
        artifact.panel_type === "floor_plan_ground"
          ? {
              ...artifact,
              contentBounds: null,
              normalizedViewBox: null,
              metadata: {
                ...artifact.metadata,
                contentBounds: null,
                normalizedViewBox: null,
                technicalQualityMetadata: {
                  ...(artifact.metadata?.technicalQualityMetadata || {}),
                  contentBounds: null,
                  normalizedViewBox: null,
                },
              },
              technicalQualityMetadata: {
                ...(artifact.technicalQualityMetadata || {}),
                contentBounds: null,
                normalizedViewBox: null,
              },
            }
          : artifact,
      ]),
    );

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        drawings: tamperedDrawings,
      },
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "TECHNICAL_DRAWING_CONTENT_BOUNDS_MISSING",
        "TECHNICAL_DRAWING_VIEWBOX_NOT_TIGHT",
      ]),
    );
  });

  test("QA rejects frame-only render proof even when sheet ink ratio is high", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        a1Pdf: {
          ...result.artifacts.a1Pdf,
          renderedProof: {
            ...result.artifacts.a1Pdf.renderedProof,
            renderedPngHash: "hash-from-title-block-only-render",
            passed: true,
            occupancy: { nonBackgroundPixelRatio: 0.15 },
            requiredRenderablePanelCount: 11,
            requiredReadyPanelCount: 10,
            requiredMissingPanelCount: 1,
            missingRequiredPanels: ["floor_plan_ground"],
          },
        },
      },
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toContain(
      "A1_PDF_RENDER_EMPTY",
    );
  });

  test("QA fails when a technical panel artifact is mislabeled", async () => {
    const result = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const tamperedDrawings = Object.fromEntries(
      Object.entries(result.artifacts.drawings).map(([assetId, artifact]) => [
        assetId,
        artifact.panel_type === "section_AA"
          ? {
              ...artifact,
              metadata: {
                ...artifact.metadata,
                expectedPanelType: "section_BB",
              },
            }
          : artifact,
      ]),
    );

    const qa = validateProjectGraphVerticalSlice({
      projectGraph: result.projectGraph,
      artifacts: {
        ...result.artifacts,
        drawings: tamperedDrawings,
      },
    });

    expect(qa.status).toBe("fail");
    expect(qa.issues.map((issue) => issue.code)).toContain(
      "TECHNICAL_DRAWING_PANEL_ID_MISMATCH",
    );
  });

  test("ProjectGraph export hashes are deterministic for identical inputs", async () => {
    const first = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );
    const second = await buildArchitectureProjectVerticalSlice(
      createReadingRoomBrief(),
    );

    expect(second.artifacts.a1Pdf.renderedPngHash).toBe(
      first.artifacts.a1Pdf.renderedPngHash,
    );
    expect(second.artifacts.a1Pdf.pdfHash).toBe(first.artifacts.a1Pdf.pdfHash);
    expect(second.artifacts.a1Pdf.asset_id).toBe(
      first.artifacts.a1Pdf.asset_id,
    );
  });
});
