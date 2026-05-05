import {
  runDrawingConsistencyChecks,
  validateCrossViewConsistency,
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
