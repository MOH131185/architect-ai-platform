import {
  runDrawingConsistencyChecks,
  validateTechnicalPanelAuthority,
  validateCrossViewConsistency,
  validateVisualPanelLocks,
  validateTechnicalPanelContract,
} from "../../services/validation/drawingConsistencyChecks.js";

const SVG_HEADER = '<svg xmlns="http://www.w3.org/2000/svg">';
const SVG_FOOTER = "</svg>";

function planSvg({
  northArrow = true,
  titleBlock = true,
  scaleBar = true,
  roomLabel = true,
  dimensionChain = true,
  roomArea = true,
  sectionMarker = true,
} = {}) {
  return [
    SVG_HEADER,
    northArrow ? '<g id="north-arrow"/>' : "",
    titleBlock ? '<g id="title-block"/>' : "",
    scaleBar ? '<g id="scale-bar"/>' : "",
    '<g class="cad-layer-walls cad-lineweight-cut"/>',
    roomLabel ? '<text class="room-label">Living Room</text>' : "",
    roomArea
      ? '<text class="room-area-label" data-room-area-m2="24.0">24.0 m2</text>'
      : "",
    dimensionChain ? '<g class="dimension-chain"/>' : "",
    sectionMarker
      ? '<g id="plan-section-markers"><g class="section-marker cad-section-marker" data-section-label="A-A"/></g>'
      : "",
    SVG_FOOTER,
  ].join("");
}

function elevationSvg({
  groundLine = true,
  fflMarker = true,
  eavesDatum = true,
  ridgeDatum = true,
} = {}) {
  return [
    SVG_HEADER,
    '<g class="cad-layer-material-hatches cad-lineweight-outline"/>',
    groundLine ? '<line id="ground-line"/>' : "",
    fflMarker ? '<text data-datum-role="ffl-ground">FFL +0.000</text>' : "",
    eavesDatum ? '<text data-datum-role="eaves">EAVES +6.200</text>' : "",
    ridgeDatum ? '<text data-datum-role="ridge">RIDGE +7.200</text>' : "",
    SVG_FOOTER,
  ].join("");
}

function sectionSvg({
  groundLine = true,
  sectionId = true,
  verticalDimension = true,
} = {}) {
  return [
    SVG_HEADER,
    groundLine
      ? '<g id="phase3-section-ground-hatch" class="cad-layer-ground cad-lineweight-cut"><line id="ground-line"/></g>'
      : "",
    verticalDimension
      ? '<g class="cad-layer-dimensions cad-vertical-dimension-chain cad-lineweight-detail"/>'
      : "",
    sectionId ? "<text>Section A-A</text>" : "",
    SVG_FOOTER,
  ].join("");
}

const AUTHORITY_GEOMETRY_HASH = "geometry-hash-OK";
const AUTHORITY_VISUAL_MANIFEST_HASH = "visual-manifest-hash-OK";
const VISUAL_AUTHORITY_PANEL_TYPES = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];

function visualAuthorityPanel(type, overrides = {}) {
  return {
    type,
    geometryHash: AUTHORITY_GEOMETRY_HASH,
    sourceGeometryHash: AUTHORITY_GEOMETRY_HASH,
    source_model_hash: AUTHORITY_GEOMETRY_HASH,
    visualManifestHash: AUTHORITY_VISUAL_MANIFEST_HASH,
    visualIdentityLocked: true,
    provider: "openai",
    providerUsed: "openai",
    imageProviderUsed: "openai",
    referenceSource: "compiled_3d_control_svg",
    imageRenderFallback: false,
    ...overrides,
  };
}

function visualAuthorityPanels(overridesByType = {}) {
  return VISUAL_AUTHORITY_PANEL_TYPES.map((type) =>
    visualAuthorityPanel(type, overridesByType[type] || {}),
  );
}

function technicalAuthorityPanel(type, overrides = {}) {
  return {
    panel_type: type,
    svgString:
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
    geometryHash: AUTHORITY_GEOMETRY_HASH,
    source_model_hash: AUTHORITY_GEOMETRY_HASH,
    renderer: "deterministic_svg",
    providerUsed: "deterministic_svg",
    imageProviderUsed: "none",
    technicalDrawing: true,
    metadata: {
      source: "compiled_project_technical_panel",
      renderer: "deterministic_svg",
      providerUsed: "deterministic_svg",
      imageProviderUsed: "none",
      technicalDrawing: true,
      geometryHash: AUTHORITY_GEOMETRY_HASH,
      sourceGeometryHash: AUTHORITY_GEOMETRY_HASH,
    },
    ...overrides,
  };
}

function technicalAuthorityPanels(overridesByType = {}) {
  return {
    floor_plan_ground: technicalAuthorityPanel(
      "floor_plan_ground",
      overridesByType.floor_plan_ground || {},
    ),
    floor_plan_first: technicalAuthorityPanel(
      "floor_plan_first",
      overridesByType.floor_plan_first || {},
    ),
    elevation_north: technicalAuthorityPanel(
      "elevation_north",
      overridesByType.elevation_north || {},
    ),
    section_AA: technicalAuthorityPanel(
      "section_AA",
      overridesByType.section_AA || {},
    ),
  };
}

function productionPlanSvg() {
  return [
    SVG_HEADER,
    '<g id="north-arrow"/>',
    '<g id="title-block"/>',
    '<g id="blueprint-scale-bar"/>',
    '<g class="cad-layer-walls cad-lineweight-cut"/>',
    '<g id="plan-room-labels"><g class="plan-room-label" data-room-area-m2="32.0"><text>Reading Room</text><text class="room-area-label">32.0 m2</text></g></g>',
    '<g class="dimension-chain horizontal cad-dimension-chain"/>',
    '<g id="plan-section-markers"><g class="section-marker cad-section-marker" data-section-label="A-A"/></g>',
    SVG_FOOTER,
  ].join("");
}

function productionElevationSvg() {
  return [
    SVG_HEADER,
    '<g id="phase8-ground-line" class="cad-layer-site-ground cad-lineweight-outline"/>',
    '<g class="cad-layer-material-hatches"/>',
    '<g class="phase8-window"/>',
    '<text data-datum-role="ffl-ground">FFL +0.000</text>',
    '<text data-datum-role="eaves">EAVES +6.200</text>',
    '<text data-datum-role="ridge">RIDGE +7.200</text>',
    SVG_FOOTER,
  ].join("");
}

function productionSectionSvg() {
  return [
    SVG_HEADER,
    '<g id="phase3-section-ground-hatch" class="cad-layer-ground cad-lineweight-cut"/>',
    '<g class="cad-layer-dimensions cad-vertical-dimension-chain cad-lineweight-detail"/>',
    '<g id="phase8-section-stair-cuts"/>',
    SVG_FOOTER,
  ].join("");
}

describe("ProjectGraph A1 authority lock validators", () => {
  test("visual panel with mismatched geometryHash fails", () => {
    const result = validateVisualPanelLocks({
      panels: visualAuthorityPanels({
        hero_3d: { geometryHash: "wrong-geometry-hash" },
      }),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
      expectedVisualManifestHash: AUTHORITY_VISUAL_MANIFEST_HASH,
      imageGenEnabled: true,
      strictPhotoreal: true,
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "PROJECT_PANEL_GEOMETRY_HASH_MISMATCH",
    );
    expect(result.checks.geometryMismatchPanels).toContain("hero_3d");
  });

  test("visual panel with mismatched visualManifestHash fails", () => {
    const result = validateVisualPanelLocks({
      panels: visualAuthorityPanels({
        axonometric: { visualManifestHash: "wrong-manifest-hash" },
      }),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
      expectedVisualManifestHash: AUTHORITY_VISUAL_MANIFEST_HASH,
      imageGenEnabled: true,
      strictPhotoreal: true,
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "VISUAL_MANIFEST_HASH_MISMATCH",
    );
    expect(result.checks.visualManifestMismatchPanels).toContain("axonometric");
  });

  test("visual panel imageRenderFallback=true fails in strict image mode", () => {
    const result = validateVisualPanelLocks({
      panels: visualAuthorityPanels({
        exterior_render: { imageRenderFallback: true },
      }),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
      expectedVisualManifestHash: AUTHORITY_VISUAL_MANIFEST_HASH,
      imageGenEnabled: true,
      strictPhotoreal: true,
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "STRICT_IMAGE_RENDER_FALLBACK",
    );
    expect(result.checks.strictFallbackPanels).toContain("exterior_render");
  });

  test("visual panel using openai without compiled control SVG reference fails as text-only generation", () => {
    const result = validateVisualPanelLocks({
      panels: visualAuthorityPanels({
        interior_3d: { referenceSource: "prompt_text_only" },
      }),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
      expectedVisualManifestHash: AUTHORITY_VISUAL_MANIFEST_HASH,
      imageGenEnabled: true,
      strictPhotoreal: true,
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "VISUAL_PANEL_TEXT_ONLY_IMAGE_GENERATION",
    );
    expect(result.checks.textOnlyVisualPanels).toContain("interior_3d");
  });

  test("technical panel with imageProviderUsed=openai fails", () => {
    const result = validateTechnicalPanelAuthority({
      technicalPanels: technicalAuthorityPanels({
        floor_plan_ground: {
          imageProviderUsed: "openai",
          providerUsed: "openai",
        },
      }),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "TECHNICAL_PANEL_IMAGE_MODEL_USED",
    );
    expect(result.checks.imageModelPanels).toContain("floor_plan_ground");
  });

  test("technical panel missing geometryHash fails", () => {
    const result = validateTechnicalPanelAuthority({
      technicalPanels: technicalAuthorityPanels({
        section_AA: {
          geometryHash: null,
          sourceGeometryHash: null,
          source_model_hash: null,
          metadata: {
            source: "compiled_project_technical_panel",
            renderer: "deterministic_svg",
            technicalDrawing: true,
            geometryHash: null,
            sourceGeometryHash: null,
          },
        },
      }),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
    });

    expect(result.errors.map((error) => error.code)).toContain(
      "TECHNICAL_PANEL_GEOMETRY_HASH_MISSING",
    );
    expect(result.checks.missingGeometryHashPanels).toContain("section_AA");
  });

  test("valid deterministic SVG technical panels and geometry-locked visual panels pass", () => {
    const visual = validateVisualPanelLocks({
      panels: visualAuthorityPanels(),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
      expectedVisualManifestHash: AUTHORITY_VISUAL_MANIFEST_HASH,
      imageGenEnabled: true,
      strictPhotoreal: true,
    });
    const technical = validateTechnicalPanelAuthority({
      technicalPanels: technicalAuthorityPanels(),
      expectedGeometryHash: AUTHORITY_GEOMETRY_HASH,
    });

    expect(visual.errors).toEqual([]);
    expect(visual.warnings).toEqual([]);
    expect(technical.errors).toEqual([]);
    expect(technical.warnings).toEqual([]);
  });
});

describe("runDrawingConsistencyChecks — per-view reliability", () => {
  test("clean drawings produce no errors and no per-view warnings", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: {
        levels: [{ id: 0 }, { id: 1 }],
        windows: [],
        stairs: [],
      },
      drawings: {
        plan: [
          { level_id: "0", svg: planSvg() },
          { level_id: "1", svg: planSvg() },
        ],
        elevation: [{ svg: elevationSvg(), window_count: 0 }],
        section: [{ svg: sectionSvg(), stair_count: 0 }],
      },
      enableCrossViewChecks: false,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("plan missing scale-bar / room-label / dimension-chain surfaces warnings (not errors)", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }] },
      drawings: {
        plan: [
          {
            level_id: "0",
            svg: planSvg({
              scaleBar: false,
              roomLabel: false,
              dimensionChain: false,
            }),
          },
        ],
        elevation: [{ svg: elevationSvg() }],
        section: [{ svg: sectionSvg() }],
      },
      enableCrossViewChecks: false,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("scale-bar"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("room-label"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("dimension-chain"))).toBe(
      true,
    );
  });

  test("elevation without ground-line or FFL markers warns", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }] },
      drawings: {
        plan: [{ level_id: "0", svg: planSvg() }],
        elevation: [
          { svg: elevationSvg({ groundLine: false, fflMarker: false }) },
        ],
        section: [{ svg: sectionSvg() }],
      },
      enableCrossViewChecks: false,
    });
    expect(result.warnings.some((w) => w.includes("ground-line"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("FFL"))).toBe(true);
  });

  test("section without ground-line or section identifier warns", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }] },
      drawings: {
        plan: [{ level_id: "0", svg: planSvg() }],
        elevation: [{ svg: elevationSvg() }],
        section: [{ svg: sectionSvg({ groundLine: false, sectionId: false }) }],
      },
      enableCrossViewChecks: false,
    });
    expect(
      result.warnings.some(
        (w) => w.includes("section") && w.includes("ground-line"),
      ),
    ).toBe(true);
    expect(result.warnings.some((w) => w.includes("section identifier"))).toBe(
      true,
    );
  });

  test("accepts current board-v2 renderer markers and forwarded counts", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: {
        levels: [{ id: 0 }, { id: 1 }],
        windows: [{ id: "window-1" }],
        stairs: [{ id: "stair-1" }],
      },
      drawings: {
        plan: [
          {
            level_id: "0",
            svg: productionPlanSvg(),
            window_count: 1,
            room_label_count: 1,
            dimension_chain_count: 1,
          },
          {
            level_id: "1",
            svg: productionPlanSvg(),
            window_count: 0,
            room_label_count: 1,
            dimension_chain_count: 1,
          },
        ],
        elevation: [{ svg: productionElevationSvg(), window_count: 1 }],
        section: [
          {
            svg: productionSectionSvg(),
            section_id: "SECTION A-A",
            stair_count: 1,
            floor_count: 2,
          },
        ],
      },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("CAD-grade QA warnings are non-blocking export warnings only", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: {
        levels: [{ id: 0 }],
        windows: [{ id: "w1" }],
        doors: [{ id: "d1" }],
      },
      drawings: {
        plan: [
          {
            level_id: "0",
            svg: planSvg({
              roomLabel: false,
              roomArea: false,
              dimensionChain: false,
              sectionMarker: false,
            }),
            window_count: 1,
            door_count: 1,
          },
        ],
        elevation: [
          {
            svg: elevationSvg({
              fflMarker: false,
              eavesDatum: false,
              ridgeDatum: false,
            }),
            window_count: 1,
            door_count: 1,
          },
        ],
        section: [
          {
            svg: sectionSvg({
              groundLine: false,
              verticalDimension: false,
            }),
            section_id: "SECTION A-A",
          },
        ],
      },
      enableCrossViewChecks: false,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checks.cadGradeTechnicalQa).toBe(true);
    expect(result.checks.cadGradeTechnicalQaBlocking).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("CAD_QA_PLAN_ROOM_LABELS"),
        expect.stringContaining("CAD_QA_PLAN_ROOM_AREAS"),
        expect.stringContaining("CAD_QA_PLAN_DIMENSIONS"),
        expect.stringContaining("CAD_QA_SECTION_MARKERS_MISSING"),
        expect.stringContaining("CAD_QA_ELEVATION_FFL_DATUM"),
        expect.stringContaining("CAD_QA_ELEVATION_EAVES_DATUM"),
        expect.stringContaining("CAD_QA_ELEVATION_RIDGE_DATUM"),
        expect.stringContaining("CAD_QA_SECTION_GROUND_LINE"),
        expect.stringContaining("CAD_QA_SECTION_VERTICAL_DIMENSION"),
      ]),
    );
  });

  test("CAD-grade QA aligns compact section ids with plan markers", () => {
    const matching = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }] },
      drawings: {
        plan: [{ level_id: "0", svg: planSvg() }],
        elevation: [{ svg: elevationSvg() }],
        section: [{ svg: sectionSvg(), panel_type: "section_AA" }],
      },
      enableCrossViewChecks: false,
    });
    expect(matching.warnings.join("\n")).not.toContain(
      "CAD_QA_SECTION_MARKER_ALIGNMENT",
    );

    const mismatched = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }] },
      drawings: {
        plan: [{ level_id: "0", svg: planSvg() }],
        elevation: [{ svg: elevationSvg() }],
        section: [{ svg: sectionSvg(), panel_type: "section_BB" }],
      },
      enableCrossViewChecks: false,
    });
    expect(mismatched.warnings.join("\n")).toContain(
      "CAD_QA_SECTION_MARKER_ALIGNMENT",
    );
  });

  // Hotfix coverage: in the A1 sheet, the global title-block + north arrow
  // are rendered ONCE on the sheet chrome, so the per-panel plan SVGs
  // intentionally omit those markers when sheetMode:true. Standalone exports
  // (single-plan PDFs / vector previews) still must carry them.
  describe("sheet-mode plan marker relaxation", () => {
    test("standalone plan missing north-arrow still fails", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [
            {
              level_id: "0",
              svg: planSvg({ northArrow: false }),
            },
          ],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("north-arrow marker"))).toBe(
        true,
      );
    });

    test("standalone plan missing title-block still fails", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [{ level_id: "0", svg: planSvg({ titleBlock: false }) }],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("title-block marker"))).toBe(
        true,
      );
    });

    test("sheet-mode plan missing north-arrow does NOT fail for that reason", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [
            {
              level_id: "0",
              sheet_mode: true,
              svg: planSvg({ northArrow: false }),
            },
          ],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      expect(result.errors.some((e) => e.includes("north-arrow marker"))).toBe(
        false,
      );
    });

    test("sheet-mode plan missing title-block does NOT fail for that reason", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [
            {
              level_id: "0",
              sheet_mode: true,
              svg: planSvg({ titleBlock: false }),
            },
          ],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      expect(result.errors.some((e) => e.includes("title-block marker"))).toBe(
        false,
      );
    });

    test("sheet-mode signal also accepted via technical_quality_metadata", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [
            {
              level_id: "0",
              technical_quality_metadata: { sheet_mode: true },
              svg: planSvg({ northArrow: false, titleBlock: false }),
            },
          ],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      expect(
        result.errors.some(
          (e) =>
            e.includes("north-arrow marker") ||
            e.includes("title-block marker"),
        ),
      ).toBe(false);
    });

    test("sheet-mode signal also accepted via camelCase technicalQualityMetadata", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [
            {
              level_id: "0",
              technicalQualityMetadata: { sheet_mode: true },
              svg: planSvg({ northArrow: false, titleBlock: false }),
            },
          ],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      expect(
        result.errors.some(
          (e) =>
            e.includes("north-arrow marker") ||
            e.includes("title-block marker"),
        ),
      ).toBe(false);
    });

    test("sheet-mode plan with another real error (missing SVG) still fails", () => {
      const result = runDrawingConsistencyChecks({
        projectGeometry: { levels: [{ id: 0 }] },
        drawings: {
          plan: [{ level_id: "0", sheet_mode: true /* svg omitted */ }],
          elevation: [{ svg: elevationSvg() }],
          section: [{ svg: sectionSvg() }],
        },
        enableCrossViewChecks: false,
      });
      // Sheet-mode plans still must carry SVG content; the relaxation is
      // limited to the two specific marker checks.
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing SVG content"))).toBe(
        true,
      );
    });

    test("sheet-mode does not silence cross-view storey/window inconsistency", () => {
      // Cross-view warnings still fire — sheet-mode only relaxes the two
      // chrome marker requirements, not the consistency checks themselves.
      const warnings = validateCrossViewConsistency({
        drawings: {
          plan: [
            {
              sheet_mode: true,
              window_count: 8,
              svg: planSvg({ northArrow: false, titleBlock: false }),
            },
          ],
          elevation: [
            { svg: elevationSvg(), window_count: 2 },
            { svg: elevationSvg(), window_count: 2 },
          ],
          section: [{ svg: sectionSvg() }],
        },
        projectGeometry: { levels: [{ id: 0 }] },
      });
      // 8 plan windows vs 4 elevation windows → mismatch warning still fires.
      expect(
        warnings.some(
          (w) => w.includes("plan reports") && w.includes("windows"),
        ),
      ).toBe(true);
    });
  });
});

describe("validateTechnicalPanelContract — deterministic provenance", () => {
  function technicalPanel(type, overrides = {}) {
    return {
      type,
      svgString: `<svg xmlns="http://www.w3.org/2000/svg" data-panel-id="${type}"></svg>`,
      technicalDrawing: true,
      renderer: "deterministic_svg",
      imageProviderUsed: "none",
      providerUsed: "deterministic_svg",
      provider: "deterministic",
      geometryHash: "geometry-hash-1",
      sourceGeometryHash: "geometry-hash-1",
      source_model_hash: "geometry-hash-1",
      svgHash: `svg-${type}`,
      ...overrides,
    };
  }

  function errorCodes(result) {
    return result.errors.map((error) => error.code);
  }

  test("passes valid deterministic SVG technical panels", () => {
    const result = validateTechnicalPanelContract({
      expectedGeometryHash: "geometry-hash-1",
      technicalPanels: [
        technicalPanel("floor_plan_ground"),
        technicalPanel("elevation_north"),
        technicalPanel("section_AA"),
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.checks.passed).toBe(true);
  });

  test("fails when technicalDrawing is missing", () => {
    const panel = technicalPanel("floor_plan_ground");
    delete panel.technicalDrawing;
    const result = validateTechnicalPanelContract({
      expectedGeometryHash: "geometry-hash-1",
      technicalPanels: [panel],
    });

    expect(errorCodes(result)).toContain(
      "TECHNICAL_PANEL_NOT_MARKED_DETERMINISTIC",
    );
  });

  test('fails when imageProviderUsed="openai"', () => {
    const result = validateTechnicalPanelContract({
      expectedGeometryHash: "geometry-hash-1",
      technicalPanels: [
        technicalPanel("floor_plan_ground", {
          imageProviderUsed: "openai",
        }),
      ],
    });

    expect(errorCodes(result)).toContain("TECHNICAL_PANEL_IMAGE_MODEL_USED");
  });

  test('fails when providerUsed="gpt-image-1.5"', () => {
    const result = validateTechnicalPanelContract({
      expectedGeometryHash: "geometry-hash-1",
      technicalPanels: [
        technicalPanel("section_AA", {
          providerUsed: "gpt-image-1.5",
        }),
      ],
    });

    expect(errorCodes(result)).toContain("TECHNICAL_PANEL_IMAGE_MODEL_USED");
  });

  test("fails when geometryHash/source hash fields are missing", () => {
    const panel = technicalPanel("elevation_north");
    delete panel.geometryHash;
    delete panel.sourceGeometryHash;
    delete panel.source_model_hash;
    const result = validateTechnicalPanelContract({
      expectedGeometryHash: "geometry-hash-1",
      technicalPanels: [panel],
    });

    expect(errorCodes(result)).toContain(
      "TECHNICAL_PANEL_GEOMETRY_HASH_MISSING",
    );
  });

  test("fails when geometry hash differs from expectedGeometryHash", () => {
    const result = validateTechnicalPanelContract({
      expectedGeometryHash: "geometry-hash-1",
      technicalPanels: [
        technicalPanel("section_BB", {
          geometryHash: "geometry-hash-2",
          sourceGeometryHash: "geometry-hash-2",
          source_model_hash: "geometry-hash-2",
        }),
      ],
    });

    expect(errorCodes(result)).toContain(
      "TECHNICAL_PANEL_GEOMETRY_HASH_MISMATCH",
    );
  });
});

describe("validateCrossViewConsistency — Phase 5 cross-view checks", () => {
  test("plan window count matching elevation window count produces no warning", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [{ window_count: 8 }],
        elevation: [{ window_count: 4 }, { window_count: 4 }],
        section: [],
      },
      projectGeometry: { levels: [] },
    });
    expect(
      warnings.some((w) => w.includes("plan reports") && w.includes("windows")),
    ).toBe(false);
  });

  test("plan/elevation window count mismatch warns", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [{ window_count: 10 }],
        elevation: [{ window_count: 6 }],
        section: [],
      },
      projectGeometry: { levels: [] },
    });
    expect(
      warnings.some(
        (w) =>
          w.includes("plan reports 10") && w.includes("elevations report 6"),
      ),
    ).toBe(true);
  });

  test("two-storey project with single-storey section warns", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [{}, {}],
        elevation: [],
        section: [{ floor_count: 1 }],
      },
      projectGeometry: { levels: [{ id: 0 }, { id: 1 }] },
    });
    expect(
      warnings.some((w) => w.includes("section must span all storeys")),
    ).toBe(true);
  });

  test("plan count mismatch with project graph levels warns", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [{}],
        elevation: [],
        section: [],
      },
      projectGeometry: { levels: [{ id: 0 }, { id: 1 }] },
    });
    expect(warnings.some((w) => w.includes("plan(s) returned for 2"))).toBe(
      true,
    );
  });

  test("panels with mismatched visualManifestHash warn — 2D/3D from different geometry", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [],
        elevation: [],
        section: [],
        panels: [
          {
            metadata: {
              visualManifestHash: "abc",
              visualIdentityLocked: true,
            },
          },
          {
            metadata: {
              visualManifestHash: "def",
              visualIdentityLocked: true,
            },
          },
        ],
      },
      projectGeometry: { levels: [] },
    });
    expect(
      warnings.some((w) => w.includes("different visualManifestHash")),
    ).toBe(true);
  });

  test("panels with visualIdentityLocked=false warn", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [],
        elevation: [],
        section: [],
        panels: [
          {
            metadata: { visualManifestHash: "abc", visualIdentityLocked: true },
          },
          {
            metadata: {
              visualManifestHash: "abc",
              visualIdentityLocked: false,
            },
          },
        ],
      },
      projectGeometry: { levels: [] },
    });
    expect(warnings.some((w) => w.includes("visualIdentityLocked=false"))).toBe(
      true,
    );
  });

  test("panels all sharing the same hash and locked produce no warning", () => {
    const warnings = validateCrossViewConsistency({
      drawings: {
        plan: [],
        elevation: [],
        section: [],
        panels: [
          {
            metadata: { visualManifestHash: "abc", visualIdentityLocked: true },
          },
          {
            metadata: { visualManifestHash: "abc", visualIdentityLocked: true },
          },
        ],
      },
      projectGeometry: { levels: [] },
    });
    expect(warnings).toEqual([]);
  });
});

describe("runDrawingConsistencyChecks — cross-view integration", () => {
  test("cross-view warnings flow through when enableCrossViewChecks=true (default)", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }, { id: 1 }] },
      drawings: {
        plan: [
          { level_id: "0", svg: planSvg(), window_count: 10 },
          { level_id: "1", svg: planSvg(), window_count: 0 },
        ],
        elevation: [{ svg: elevationSvg(), window_count: 6 }],
        section: [{ svg: sectionSvg(), floor_count: 1 }],
      },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("plan reports 10"))).toBe(
      true,
    );
    expect(
      result.warnings.some((w) => w.includes("section must span all storeys")),
    ).toBe(true);
    expect(result.checks.crossViewChecks).toBe(true);
  });

  test("cross-view warnings can be suppressed via enableCrossViewChecks=false", () => {
    const result = runDrawingConsistencyChecks({
      projectGeometry: { levels: [{ id: 0 }, { id: 1 }] },
      drawings: {
        plan: [
          { level_id: "0", svg: planSvg(), window_count: 10 },
          { level_id: "1", svg: planSvg(), window_count: 0 },
        ],
        elevation: [{ svg: elevationSvg(), window_count: 6 }],
        section: [{ svg: sectionSvg(), floor_count: 1 }],
      },
      enableCrossViewChecks: false,
    });
    expect(result.warnings.some((w) => w.includes("plan reports 10"))).toBe(
      false,
    );
    expect(result.checks.crossViewChecks).toBe(false);
  });
});
