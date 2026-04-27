import {
  buildArchitectureProjectVerticalSlice,
  validateProjectGraphVerticalSlice,
  KNOWN_BUILDING_TYPES,
} from "../../services/project/projectGraphVerticalSliceService.js";

jest.setTimeout(180000);

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

describe("projectGraphVerticalSliceService", () => {
  const originalModelSource = process.env.MODEL_SOURCE;
  const originalReasoningModel = process.env.OPENAI_REASONING_MODEL;
  const originalFastModel = process.env.OPENAI_FAST_MODEL;
  const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalReactGoogleMapsApiKey =
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.MODEL_SOURCE = "base";
    process.env.OPENAI_REASONING_MODEL = "gpt-5.4";
    process.env.OPENAI_FAST_MODEL = "gpt-5.4-mini";
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
    expect(result.artifacts.a1Sheet.svgString).toContain(
      `data-source-model-hash="${result.geometryHash}"`,
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
    expect(Object.keys(result.artifacts.visuals3d).sort()).toEqual([
      "axonometric",
      "hero_3d",
      "interior_3d",
    ]);
    for (const artifact of Object.values(result.artifacts.visuals3d)) {
      expect(artifact.source_model_hash).toBe(result.geometryHash);
      expect(artifact.authoritySource).toBe("project_graph_compiled_geometry");
      expect(artifact.svgString.length).toBeGreaterThan(1200);
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
          !["hero_3d", "axonometric", "interior_3d"].includes(
            artifact.panel_type,
          ),
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
