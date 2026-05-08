import {
  DETAIL_REVIEW_DISCLAIMER,
  REQUIRED_CONSTRUCTION_DETAIL_TYPES,
  buildConstructionDetailLibraryFromCompiledProject,
  buildConstructionDetailPanelsFromCompiledProject,
  validateConstructionDetailLibrary,
} from "../../../services/details/constructionDetailLibrary.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-detail-001",
    projectGraphHash: "project-graph-hash-detail-001",
    projectName: "Detail Fixture",
    jurisdiction: "uk",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 12 },
        { x: 0, y: 12 },
      ],
    },
    levels: [
      { id: "level-0", level_number: 0, name: "Ground", height_m: 3.2 },
      { id: "level-1", level_number: 1, name: "First", height_m: 3.2 },
    ],
    rooms: [
      { id: "living", name: "Living", type: "living" },
      { id: "bath", name: "Bathroom", type: "bathroom" },
    ],
    walls: [{ id: "wall-1" }],
    openings: [{ id: "window-1", type: "window" }],
    stairs: [{ id: "stair-1" }],
    roof_primitives: [{ id: "roof-1" }],
  };
}

describe("constructionDetailLibrary", () => {
  test("builds deterministic required construction details with authority hashes", () => {
    const first = buildConstructionDetailLibraryFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const second = buildConstructionDetailLibraryFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const detailTypes = first.details.map((detail) => detail.detailType);

    expect(first.geometryHash).toBe("geometry-hash-detail-001");
    expect(first.sourceProjectGraphHash).toBe("project-graph-hash-detail-001");
    expect(first.detailLibraryHash).toBe(second.detailLibraryHash);
    expect(detailTypes).toEqual(
      expect.arrayContaining(REQUIRED_CONSTRUCTION_DETAIL_TYPES),
    );
    first.details.forEach((detail) => {
      expect(detail.detailHash).toBeTruthy();
      expect(detail.geometryHash).toBe(first.geometryHash);
      expect(detail.sourceProjectGraphHash).toBe(first.sourceProjectGraphHash);
      expect(detail.reviewRequired).toBe(true);
      expect(detail.disclaimer).toBe(DETAIL_REVIEW_DISCLAIMER);
      expect(detail.svgString).toContain('data-image-provider-used="none"');
      expect(detail.dxfEntities.length).toBeGreaterThan(0);
    });
  });

  test("generates deterministic SVG detail panels with hatches, dimensions, callouts, and disclaimer", () => {
    const { detailLibrary, detailPanels } =
      buildConstructionDetailPanelsFromCompiledProject({
        compiledProject: fixtureCompiledProject(),
      });

    expect(Object.keys(detailPanels)).toEqual(
      expect.arrayContaining([
        "detail_sheet_architectural",
        "detail_sheet_envelope",
        "detail_sheet_wetroom_drainage",
        "detail_sheet_mep_riser",
        "detail_notes",
      ]),
    );
    Object.values(detailPanels).forEach((panel) => {
      expect(panel.svgString).toContain("<svg");
      expect(panel.svgString).toContain("hatch-concrete");
      expect(panel.svgString).toContain("hatch-masonry");
      expect(panel.svgString).toContain("hatch-insulation");
      expect(panel.svgString).toContain("detail-dimension");
      expect(panel.svgString).toContain("callout");
      expect(panel.svgString).toContain("ARCHITECT / ENGINEER REVIEW REQUIRED");
      expect(panel.technicalDrawing).toBe(true);
      expect(panel.imageProviderUsed).toBe("none");
      expect(panel.renderer).toBe("deterministic_svg");
      expect(panel.reviewRequired).toBe(true);
      expect(panel.geometryHash).toBe(detailLibrary.geometryHash);
      expect(panel.sourceGeometryHash).toBe(detailLibrary.geometryHash);
    });
    expect(detailPanels.detail_sheet_architectural.svgString).toContain(
      "Wall/Foundation Junction",
    );
    expect(detailPanels.detail_sheet_envelope.svgString).toContain(
      "Roof Eaves Detail",
    );
    expect(detailPanels.detail_sheet_wetroom_drainage.svgString).toContain(
      "Drainage Inspection Chamber",
    );
    expect(detailPanels.detail_sheet_mep_riser.svgString).toContain(
      "MEP Riser Detail",
    );
  });

  test("validates detail QA failures for missing hash, disclaimer, required type, hatches, dimensions, callouts, and image provider", () => {
    const detailLibrary = buildConstructionDetailLibraryFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    expect(
      validateConstructionDetailLibrary(detailLibrary, {
        compiledProject: fixtureCompiledProject(),
      }).valid,
    ).toBe(true);

    const broken = validateConstructionDetailLibrary(
      {
        ...detailLibrary,
        detailLibraryHash: null,
        disclaimers: [],
        imageProviderUsed: "openai",
        details: detailLibrary.details
          .filter((detail) => detail.detailType !== "wall_foundation_junction")
          .map((detail, index) =>
            index === 0
              ? {
                  ...detail,
                  detailHash: null,
                  hatches: [],
                  dimensions: [],
                  dxfEntities: [],
                  imageProviderUsed: "openai",
                }
              : detail,
          ),
      },
      { compiledProject: fixtureCompiledProject() },
    );
    const codes = broken.errors.map((error) => error.code);

    expect(broken.valid).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "DETAIL_LIBRARY_HASH_MISSING",
        "DETAIL_LIBRARY_DISCLAIMER_MISSING",
        "DETAIL_LIBRARY_REQUIRED_DETAIL_MISSING",
        "DETAIL_HASH_MISSING",
        "DETAIL_HATCHES_MISSING",
        "DETAIL_DIMENSIONS_MISSING",
        "DETAIL_CALLOUTS_MISSING",
        "DETAIL_IMAGE_PROVIDER_FORBIDDEN",
        "DETAIL_LIBRARY_IMAGE_PROVIDER_FORBIDDEN",
      ]),
    );
  });
});
