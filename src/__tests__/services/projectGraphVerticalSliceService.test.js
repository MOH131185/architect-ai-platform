import {
  buildArchitectureProjectVerticalSlice,
  validateProjectGraphVerticalSlice,
  KNOWN_BUILDING_TYPES,
} from "../../services/project/projectGraphVerticalSliceService.js";

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
      const totalArea = result.projectGraph.programme.spaces.reduce(
        (sum, space) => sum + Number(space.target_area_m2 || 0),
        0,
      );
      const targetGia = briefInput.brief.target_gia_m2;
      expect(totalArea).toBeGreaterThan(targetGia * 0.9);
      expect(totalArea).toBeLessThan(targetGia * 1.1);
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
    briefInput.brief.building_type = "warehouse";
    briefInput.brief.project_name = "Unknown Type Smoke";
    const result = await buildArchitectureProjectVerticalSlice(briefInput);

    expect(result.projectGraph.programme.template_provenance.source).toBe(
      "fallback_template",
    );
    expect(
      result.projectGraph.programme.template_provenance.requested_building_type,
    ).toBe("warehouse");
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
