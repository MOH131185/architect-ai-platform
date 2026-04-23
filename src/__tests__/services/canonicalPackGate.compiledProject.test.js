jest.mock("../../services/canonical/CanonicalGeometryPackService.js", () => ({
  getControlForPanel: (pack, panelType) =>
    pack?.panels?.[panelType]?.dataUrl || null,
}));

import { validateBeforeGeneration } from "../../services/canonical/CanonicalPackGate.js";
import { COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES } from "../../services/validation/compiledProjectPublishConsistencyGate.js";

function createValidPack() {
  const svgDataUrl = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";

  return {
    status: "COMPLETE",
    geometryHash: "geom-shared",
    panels: {
      floor_plan_ground: { dataUrl: svgDataUrl },
      elevation_north: { dataUrl: svgDataUrl },
      elevation_south: { dataUrl: svgDataUrl },
      section_AA: { dataUrl: svgDataUrl },
    },
  };
}

function createElevation(orientation, windowCount, doorCount = 0) {
  return {
    orientation,
    svg: `<svg><text>${orientation}</text></svg>`,
    renderer: "deterministic-elevation-svg",
    format: "svg",
    window_count: windowCount,
    roofSilhouetteHash: "roof-shared",
    technical_quality_metadata: {
      door_count: doorCount,
      roof_silhouette_hash: "roof-shared",
    },
  };
}

function createValidCompiledProject() {
  return {
    geometryHashes: {
      twoD: "geom-shared",
      threeD: "geom-shared",
    },
    compiledGeometry: {
      facadeOpeningCounts: {
        N: { windowCount: 2, doorCount: 1 },
        S: { windowCount: 1, doorCount: 0 },
        E: { windowCount: 1, doorCount: 0 },
        W: { windowCount: 1, doorCount: 0 },
      },
      roofSilhouetteHash: "roof-shared",
    },
    hero: {
      panelType: "hero_3d",
      geometryHash: "geom-shared",
      roofSilhouetteHash: "roof-shared",
    },
    drawings: {
      plan: [
        {
          level_id: "ground",
          svg: "<svg><text>Ground Plan</text></svg>",
          renderer: "deterministic-plan-svg",
          format: "svg",
        },
      ],
      elevation: [
        createElevation("north", 2, 1),
        createElevation("south", 1, 0),
        createElevation("east", 1, 0),
        createElevation("west", 1, 0),
      ],
      section: [
        {
          section_type: "longitudinal",
          svg: "<svg><text>Section</text></svg>",
          renderer: "deterministic-section-svg",
          format: "svg",
          roofSilhouetteHash: "roof-shared",
          technical_quality_metadata: {
            section_direct_evidence_count: 2,
            section_exact_construction_clip_count: 1,
          },
        },
      ],
    },
    board: {
      metrics: {
        occupancyRatio: 0.62,
      },
      readability: {
        score: 0.81,
      },
    },
  };
}

function runGate(compiledProject) {
  return validateBeforeGeneration(
    createValidPack(),
    null,
    { levelCount: 1 },
    {
      strict: false,
      compiledProject,
    },
  );
}

function runStrictGate(compiledProject) {
  return () =>
    validateBeforeGeneration(
      createValidPack(),
      null,
      { levelCount: 1 },
      {
        strict: true,
        compiledProject,
      },
    );
}

function expectIssue(result, code, compiledProject) {
  expect(result.valid).toBe(false);
  expect(result.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code })]),
  );
  expect(result.compiledProjectReport.summary.issueCodes).toContain(code);
  expect(runStrictGate(compiledProject)).toThrow(code);
}

describe("CanonicalPackGate compiled-project publish/consistency checks", () => {
  test("passes a consistent compiled project", () => {
    const result = runGate(createValidCompiledProject());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.compiledProjectReport.valid).toBe(true);
  });

  test("fails when 2D and 3D geometry hashes differ", () => {
    const compiledProject = createValidCompiledProject();
    compiledProject.geometryHashes.threeD = "geom-3d-drift";

    const result = runGate(compiledProject);

    expectIssue(
      result,
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.GEOMETRY_HASH_MISMATCH_2D_3D,
      compiledProject,
    );
    expect(result.errors[0]).toContain(
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.GEOMETRY_HASH_MISMATCH_2D_3D,
    );
  });

  test("fails when facade opening counts disagree between elevations and compiled geometry", () => {
    const compiledProject = createValidCompiledProject();
    compiledProject.drawings.elevation[0].window_count = 1;
    compiledProject.drawings.elevation[0].technical_quality_metadata.door_count = 0;

    const result = runGate(compiledProject);

    expectIssue(
      result,
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.FACADE_OPENING_COUNT_MISMATCH,
      compiledProject,
    );
    expect(
      result.issues.find(
        (issue) =>
          issue.code ===
          COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.FACADE_OPENING_COUNT_MISMATCH,
      )?.details,
    ).toMatchObject({
      facade: "N",
      geometryOpeningCount: 3,
      elevationOpeningCount: 1,
    });
  });

  test("fails when roof silhouette signatures disagree across views", () => {
    const compiledProject = createValidCompiledProject();
    compiledProject.hero.roofSilhouetteHash = "roof-hero-drift";

    const result = runGate(compiledProject);

    expectIssue(
      result,
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.ROOF_SILHOUETTE_MISMATCH,
      compiledProject,
    );
    expect(
      result.issues.find(
        (issue) =>
          issue.code ===
          COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.ROOF_SILHOUETTE_MISMATCH,
      )?.details.signatures,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signature: "roof-shared" }),
        expect.objectContaining({ signature: "roof-hero-drift" }),
      ]),
    );
  });

  test("fails when a section cut does not intersect real geometry", () => {
    const compiledProject = createValidCompiledProject();
    compiledProject.drawings.section[0].sectionCutIntersectsGeometry = false;
    compiledProject.drawings.section[0].technical_quality_metadata =
      Object.assign(
        {},
        compiledProject.drawings.section[0].technical_quality_metadata,
        {
          section_direct_evidence_count: 0,
          section_exact_construction_clip_count: 0,
        },
      );

    const result = runGate(compiledProject);

    expectIssue(
      result,
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.SECTION_CUT_MISSING_GEOMETRY,
      compiledProject,
    );
    expect(
      result.issues.find(
        (issue) =>
          issue.code ===
          COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.SECTION_CUT_MISSING_GEOMETRY,
      )?.details.panelType,
    ).toBe("section_longitudinal");
  });

  test("fails when a technical panel is not a deterministic SVG", () => {
    const compiledProject = createValidCompiledProject();
    compiledProject.drawings.plan[0] = {
      level_id: "ground",
      imageUrl: "https://example.com/plan.png",
      renderer: "diffusion-panel",
      format: "png",
    };

    const result = runGate(compiledProject);

    expectIssue(
      result,
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.TECHNICAL_PANEL_NOT_DETERMINISTIC_SVG,
      compiledProject,
    );
    expect(
      result.issues.find(
        (issue) =>
          issue.code ===
          COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.TECHNICAL_PANEL_NOT_DETERMINISTIC_SVG,
      )?.details,
    ).toMatchObject({
      panelType: "floor_plan_ground",
      hasSvgPayload: false,
      deterministic: false,
      format: "png",
    });
  });

  test("fails when board occupancy or readability is below threshold", () => {
    const compiledProject = createValidCompiledProject();
    compiledProject.board.metrics.occupancyRatio = 0.2;
    compiledProject.board.readability.score = 0.42;

    const result = runGate(compiledProject);

    expectIssue(
      result,
      COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.BOARD_QUALITY_BELOW_THRESHOLD,
      compiledProject,
    );
    expect(
      result.issues.find(
        (issue) =>
          issue.code ===
          COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.BOARD_QUALITY_BELOW_THRESHOLD,
      )?.details.failedMetrics,
    ).toHaveLength(2);
  });
});
