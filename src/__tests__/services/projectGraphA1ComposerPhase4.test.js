import {
  buildTitleBlockPanelArtifact,
  computePanelSlotFitMetrics,
  selectPanelContentViewBox,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";

const {
  buildA1PdfSourceMetadata,
  buildPanelPlacements,
  buildSheetSvg,
  wrapPngAsSvgPanel,
} = __projectGraphVerticalSliceInternals;

const GEOMETRY_HASH = "geometry-hash-phase4";
const VISUAL_MANIFEST = {
  manifestId: "visual-manifest-phase4",
  manifestHash: "visual-manifest-hash-phase4",
  geometryHash: GEOMETRY_HASH,
};

function svgArtifact(panelType, body, metadata = {}) {
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#fff"/>${body}</svg>`;
  return {
    asset_id: `asset-${panelType}`,
    asset_type: "compiled_project_panel_svg",
    panel_type: panelType,
    panelType,
    source_model_hash: GEOMETRY_HASH,
    geometryHash: GEOMETRY_HASH,
    svgHash: `svg-hash-${panelType}`,
    width: 1000,
    height: 700,
    svgString,
    metadata: {
      geometryHash: GEOMETRY_HASH,
      sourceGeometryHash: GEOMETRY_HASH,
      ...metadata,
    },
  };
}

function visualArtifact(panelType, { fallback = false } = {}) {
  const pngPayload = Buffer.from(`phase4-${panelType}`).toString("base64");
  const imageSvg = fallback
    ? `<g id="deterministic-control-${panelType}"><path d="M100 520 L500 160 L900 520 Z" fill="#e9eef2" stroke="#223"/></g>`
    : `<image href="data:image/png;base64,${pngPayload}" x="0" y="0" width="1000" height="700" preserveAspectRatio="xMidYMid meet" data-fit-mode="object-contain"/>`;
  return svgArtifact(panelType, imageSvg, {
    source: fallback
      ? "compiled_project_render_inputs"
      : "project_graph_image_renderer",
    visualManifestHash: VISUAL_MANIFEST.manifestHash,
    visualManifestId: VISUAL_MANIFEST.manifestId,
    visualIdentityLocked: true,
    referenceSource: "compiled_3d_control_svg",
    imageRenderFallback: fallback,
    imageRenderFallbackReason: fallback ? "gate_disabled" : null,
    imageProviderUsed: fallback ? "deterministic" : "openai",
    providerUsed: fallback ? "deterministic" : "openai",
    controlSvgHash: `control-${panelType}`,
  });
}

function dataArtifact(panelType, label) {
  return svgArtifact(
    panelType,
    `<text x="80" y="120" font-size="48">${label}</text>`,
    { source: "project_graph_data_panel" },
  );
}

function buildFixtureArtifacts({ fallbackHero = false } = {}) {
  const artifacts = [
    svgArtifact(
      "site_context",
      '<g id="phase4-site-context"><text x="60" y="100">SITE / CONTEXT</text></g>',
    ),
    svgArtifact(
      "floor_plan_ground",
      '<g id="phase4-dimension-chain" class="dimension-chain"><text class="room-label">Living Room</text><path d="M80 80 H920 V620 H80 Z"/></g>',
      {
        drawingType: "plan",
        technicalQualityMetadata: {
          normalizedViewBox: "40 40 920 620",
          contentBounds: {
            x: 40,
            y: 40,
            width: 920,
            height: 620,
            occupancyRatio: 0.72,
            widthRatio: 0.92,
            heightRatio: 0.88,
          },
        },
      },
    ),
    svgArtifact(
      "floor_plan_first",
      '<g id="phase4-first-plan"><text class="room-label">Bedroom</text><path d="M80 80 H920 V620 H80 Z"/></g>',
    ),
    svgArtifact("elevation_north", '<g id="phase4-north-elevation"/>'),
    svgArtifact("elevation_south", '<g id="phase4-south-elevation"/>'),
    svgArtifact("elevation_east", '<g id="phase4-east-elevation"/>'),
    svgArtifact("elevation_west", '<g id="phase4-west-elevation"/>'),
    svgArtifact("section_AA", '<g id="phase4-section-aa"/>'),
    svgArtifact("section_BB", '<g id="phase4-section-bb"/>'),
    visualArtifact("hero_3d", { fallback: fallbackHero }),
    visualArtifact("axonometric"),
    visualArtifact("interior_3d"),
    dataArtifact("material_palette", "MATERIALS"),
    dataArtifact("key_notes", "NOTES"),
    dataArtifact("title_block", "TITLE"),
  ];
  return Object.fromEntries(
    artifacts.map((artifact) => [artifact.asset_id, artifact]),
  );
}

function buildFixtureSheet({ fallbackHero = false } = {}) {
  const panelArtifacts = buildFixtureArtifacts({ fallbackHero });
  const panelPlacements = buildPanelPlacements({
    drawingSet: { drawings: [] },
    panelArtifacts,
    targetStoreys: 2,
    layoutTemplate: "presentation-v3",
    geometryHash: GEOMETRY_HASH,
    briefInputHash: "brief-hash-phase4",
  });
  return buildSheetSvg({
    projectGraphId: "project-phase4",
    brief: {
      project_name: "Phase 4 Composer Test",
      reference_match: false,
      brief_input_hash: "brief-hash-phase4",
    },
    geometryHash: GEOMETRY_HASH,
    panelPlacements,
    panelArtifacts,
    qaStatus: "pending",
    sheetNumber: "A1-01",
    sheetLabel: "Phase 4",
    layoutTemplate: "presentation-v3",
    visualManifest: VISUAL_MANIFEST,
  });
}

describe("ProjectGraph A1 composer Phase 4", () => {
  test("final sheet SVG embeds actual technical SVG content, not empty frames", () => {
    const svg = buildFixtureSheet();

    expect(svg).toContain("phase4-dimension-chain");
    expect(svg).toContain("Living Room");
    expect(svg).toContain("GROUND FLOOR PLAN");
    expect(svg).toContain('data-panel-kind="technical"');
    expect(svg).not.toContain('data-panel-missing="true"');
  });

  test("visual image panels are embedded when image2 artifacts are present", () => {
    const svg = buildFixtureSheet();

    expect(svg).toContain('data-panel-id="hero_3d"');
    expect(svg).toContain('data-panel-id="axonometric"');
    expect(svg).toContain('data-panel-id="interior_3d"');
    expect(svg).toContain("EXTERIOR PERSPECTIVE");
    expect(svg).toContain("AXONOMETRIC");
    expect(svg).toContain("INTERIOR VIEW");
    expect(svg).toContain("data:image/png;base64");
    expect(svg).toContain("IMAGE2 EDIT");
  });

  test("embedded panels use object-contain preserveAspectRatio behavior", () => {
    const svg = buildFixtureSheet();
    const wrappedPng = wrapPngAsSvgPanel(
      Buffer.from("phase4-png"),
      "0 0 1000 700",
      1000,
      700,
    );

    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('data-fit-mode="object-contain"');
    expect(wrappedPng).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(wrappedPng).not.toContain("xMidYMid slice");
  });

  test("title block and provenance footer include geometry and visual manifest hashes", () => {
    const titleBlock = buildTitleBlockPanelArtifact({
      projectGraphId: "project-phase4",
      brief: {
        project_name: "Phase 4 Composer Test",
        site_input: { address: "1 Test Street" },
        target_gia_m2: 200,
        target_storeys: 2,
      },
      geometryHash: GEOMETRY_HASH,
      visualManifest: VISUAL_MANIFEST,
      sheetPlan: {
        sheet_number: "A1-01",
        label: "RIBA Stage 2",
        revision: "P02",
        date: "2026-05-05",
      },
    });
    const svg = buildFixtureSheet();

    expect(titleBlock.svgString).toContain(
      `geometryHash ${GEOMETRY_HASH.slice(0, 18)}`,
    );
    expect(titleBlock.svgString).toContain(
      `visualManifestHash ${VISUAL_MANIFEST.manifestHash.slice(0, 18)}`,
    );
    expect(svg).toContain('data-provenance-footer="true"');
    expect(svg).toContain(GEOMETRY_HASH);
    expect(svg).toContain(VISUAL_MANIFEST.manifestHash);
    expect(svg).toContain("ProjectGraph authority");
  });

  test("PDF source metadata points at sheetArtifact.svgString", () => {
    const metadata = buildA1PdfSourceMetadata({
      asset_id: "asset-a1-svg",
      svgHash: "sheet-svg-hash-phase4",
      svgString: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        sourceSvgHash: "sheet-svg-hash-phase4",
        sourceSvgAssetId: "asset-a1-svg",
        sheetArtifactSvgStringUsed: true,
        sourceSvgRole: "sheetArtifact.svgString",
        emptyFrameFallbackUsed: false,
      }),
    );
  });

  test("fallback visual panels are labeled deterministic and do not claim OpenAI success", () => {
    const svg = buildFixtureSheet({ fallbackHero: true });

    expect(svg).toContain('data-panel-id="hero_3d"');
    expect(svg).toContain('data-image-render-fallback="true"');
    expect(svg).toContain('data-provider-used="deterministic"');
    expect(svg).toContain("DETERMINISTIC FALLBACK");
    expect(svg).toContain("fallback hero_3d");
  });

  test("visual badges stay clipped inside panel bounds and footer reserve avoids clipping", () => {
    const panelArtifacts = buildFixtureArtifacts();
    const panelPlacements = buildPanelPlacements({
      drawingSet: { drawings: [] },
      panelArtifacts,
      targetStoreys: 2,
      layoutTemplate: "presentation-v3",
      geometryHash: GEOMETRY_HASH,
      briefInputHash: "brief-hash-phase4",
    });
    const svg = buildSheetSvg({
      projectGraphId: "project-phase4",
      brief: {
        project_name: "Phase 4 Composer Test",
        reference_match: false,
        brief_input_hash: "brief-hash-phase4",
      },
      geometryHash: GEOMETRY_HASH,
      panelPlacements,
      panelArtifacts,
      qaStatus: "pending",
      sheetNumber: "A1-01",
      sheetLabel: "Phase 4",
      layoutTemplate: "presentation-v3",
      visualManifest: VISUAL_MANIFEST,
    });
    const lastPanelBottom = Math.max(
      ...panelPlacements.map((placement) => placement.y + placement.height),
    );
    const badgeMatch = svg.match(
      /data-visual-provider-badge="true"[^>]*clip-path="url\(#([^)]+)\)"[\s\S]*?<rect x="([^"]+)" y="([^"]+)" width="([^"]+)"/,
    );

    expect(lastPanelBottom).toBeLessThanOrEqual(570);
    expect(svg).toContain('data-provenance-footer="true"');
    expect(svg).toContain('<rect x="6" y="574" width="829" height="14"');
    expect(badgeMatch).toBeTruthy();
    expect(Number(badgeMatch[2])).toBeGreaterThanOrEqual(10);
    expect(Number(badgeMatch[4])).toBeLessThanOrEqual(48);
  });

  test("presentation-v3 elevation embedding uses tight content bounds", () => {
    const elevation = svgArtifact(
      "elevation_east",
      '<g id="tight-elevation"><path d="M120 220 H880 V480 H120 Z"/><text x="120" y="510">LEVEL 01</text><text x="760" y="510">SCALE 1:100</text></g>',
      {
        drawingType: "elevation",
        technicalQualityMetadata: {
          normalizedViewBox: "0 0 1000 700",
          contentBounds: {
            x: 100,
            y: 220,
            width: 820,
            height: 260,
            occupancyRatio: 0.3046,
            widthRatio: 0.82,
            heightRatio: 0.3714,
          },
        },
      },
    );
    const viewBox = selectPanelContentViewBox({
      panelType: "elevation_east",
      artifact: elevation,
      layoutTemplate: "presentation-v3",
    });
    const values = viewBox.split(/\s+/).map(Number);
    const fit = computePanelSlotFitMetrics({
      panelType: "elevation_east",
      artifact: elevation,
      placement: {
        panelType: "elevation_east",
        title: "East Elevation",
        scale: "1:100",
        x: 580,
        y: 190,
        width: 251,
        height: 117,
      },
      layoutTemplate: "presentation-v3",
    });

    expect(values[0]).toBeCloseTo(87.7, 1);
    expect(values[1]).toBeCloseTo(216.1, 1);
    expect(values[2]).toBeCloseTo(844.6, 1);
    expect(values[3]).toBeCloseTo(267.8, 1);
    expect(fit.viewBox).toBe(viewBox);
    expect(fit.occupancyRatio).toBeGreaterThanOrEqual(0.75);
    expect(fit.occupancyRatio).toBeLessThanOrEqual(0.9);
  });
});
