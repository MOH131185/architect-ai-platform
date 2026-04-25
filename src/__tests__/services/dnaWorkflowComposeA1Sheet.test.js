import { buildComposePayload } from "../../services/dnaWorkflow/composeA1Sheet.js";
import { runA1FinalSheetRegression } from "../../services/a1/a1FinalSheetRegressionService.js";

describe("dnaWorkflow composeA1Sheet payload", () => {
  test("sends final A1 export flags and shared verification evidence", () => {
    const payload = buildComposePayload({
      canonicalPack: {
        geometryHash: "geometry-123",
        metadata: { authoritySource: "compiled_project" },
      },
      designId: "design-123",
      floorCount: 2,
      generatedPanels: [
        {
          type: "floor_plan_ground",
          label: "GROUND FLOOR PLAN",
          imageUrl: "<svg><text>GROUND FLOOR PLAN</text></svg>",
          meta: {
            designFingerprint: "fingerprint-123",
            geometryHash: "geometry-123",
            authorityUsed: "compiled_project_plan",
            authoritySource: "compiled_project",
          },
        },
      ],
      locationData: {
        address: "London",
      },
      masterDNA: {
        dnaHash: "dna-123",
        rooms: [{ name: "Kitchen", floor: 0 }],
      },
      programLock: { hash: "program-123" },
      projectContext: {
        projectName: "A1 Test Project",
        compiledProject: {
          compiledProjectSchemaVersion: "v1",
          geometryHash: "geometry-123",
          drawings: {
            floor_plan_ground: { geometryHash: "geometry-123" },
          },
          technicalPanelQuality: {
            status: "verified",
          },
        },
        finalSheetSvg:
          '<svg><text x="10" y="20">GROUND FLOOR PLAN</text></svg>',
      },
      runId: "run-123",
    });

    expect(payload).toMatchObject({
      renderIntent: "final_a1",
      printMaster: true,
      highRes: true,
      enforcePreComposeVerification: true,
      enforcePostComposeVerification: true,
      enforceRenderedText: true,
      designFingerprint: "fingerprint-123",
      geometryHash: "geometry-123",
      programHash: "program-123",
    });
    expect(payload.drawings).toMatchObject({
      plan: [
        {
          panel_type: "floor_plan_ground",
          geometryHash: "geometry-123",
        },
      ],
      elevation: [],
      section: [],
    });
    expect(payload.technicalPanelQuality).toEqual({ status: "verified" });
    expect(payload.finalSheetSvg).toContain("GROUND FLOOR PLAN");
    expect(payload.sheetTextContract.requiredLabels).toEqual(
      expect.arrayContaining(["GROUND FLOOR PLAN", "A1 Test Project"]),
    );
  });

  test("derives Phase 9 drawing evidence from canonical pack when project context omits drawings", () => {
    const canonicalPanel = (title, metadata = {}) => ({
      title,
      svgString: `<svg><text>${title}</text></svg>`,
      svgHash: `${title}-hash`,
      geometryHash: "geometry-123",
      status: "ready",
      technicalQualityMetadata: {
        geometry_complete: true,
        facade_richness_score: 0.72,
        section_usefulness_score: 0.74,
        section_direct_evidence_quality: "verified",
        section_construction_truth_quality: "verified",
        roof_truth_quality: "verified",
        roof_truth_mode: "explicit_generated",
        foundation_truth_quality: "verified",
        foundation_truth_mode: "explicit_ground_primitives",
        ...metadata,
      },
      metadata: {
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion: "compiled-project-v1",
      },
    });

    const payload = buildComposePayload({
      canonicalPack: {
        geometryHash: "geometry-123",
        metadata: { authoritySource: "compiled_project" },
        panels: {
          floor_plan_ground: canonicalPanel("GROUND FLOOR PLAN", {
            room_count: 8,
            wall_count: 24,
          }),
          elevation_east: canonicalPanel("EAST ELEVATION", {
            window_count: 6,
            level_label_count: 2,
          }),
          elevation_west: canonicalPanel("WEST ELEVATION", {
            window_count: 5,
            level_label_count: 2,
          }),
          section_AA: canonicalPanel("SECTION AA", {
            section_strategy_id: "longitudinal-a",
            section_strategy_name: "Longitudinal section",
          }),
        },
      },
      designId: "design-123",
      floorCount: 2,
      generatedPanels: [
        {
          type: "floor_plan_ground",
          label: "GROUND FLOOR PLAN",
          imageUrl: "<svg><text>GROUND FLOOR PLAN</text></svg>",
          meta: {
            designFingerprint: "fingerprint-123",
            geometryHash: "geometry-123",
            authorityUsed: "compiled_project_canonical_pack",
            authoritySource: "compiled_project",
          },
        },
      ],
      locationData: {},
      masterDNA: {
        dnaHash: "dna-123",
        rooms: [{ name: "Kitchen", floor: 0 }],
      },
      programLock: { hash: "program-123" },
      projectContext: {
        projectName: "A1 Test Project",
        compiledProject: {
          compiledProjectSchemaVersion: "compiled-project-v1",
          geometryHash: "geometry-123",
        },
      },
      runId: "run-123",
    });

    expect(payload.drawings.elevation.map((entry) => entry.orientation)).toEqual(
      expect.arrayContaining(["east", "west"]),
    );
    expect(payload.drawings.section[0]).toMatchObject({
      section_type: "longitudinal",
      section_profile: {
        strategyId: "longitudinal-a",
      },
    });
    expect(payload.drawings.elevation[0].technical_quality_metadata).toMatchObject(
      {
        geometry_complete: true,
      },
    );

    const finalSheetRegression = runA1FinalSheetRegression({
      drawings: payload.drawings,
      sheetSvg: `
        <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
          <style>@font-face{font-family:ArchiAISans;src:url(data:font/ttf;base64,AA==)}</style>
          <text x="20" y="145" font-family="ArchiAISans" font-size="16">GROUND FLOOR PLAN</text>
        </svg>
      `,
      fontReadiness: { readyForEmbedding: true, fullEmbeddingReady: true },
      expectedLabels: ["GROUND FLOOR PLAN"],
      coordinates: {
        floor_plan_ground: { x: 0, y: 0, width: 280, height: 160 },
      },
      panelLabelMap: {
        floor_plan_ground: "GROUND FLOOR PLAN",
      },
      width: 1200,
      height: 800,
    });

    expect(finalSheetRegression.blockers).not.toEqual(
      expect.arrayContaining([
        "Elevation east is missing from the technical set.",
        "Elevation west is missing from the technical set.",
      ]),
    );
  });

  test("does not let empty or malformed project drawings suppress canonical evidence", () => {
    const canonicalPanel = (title, metadata = {}) => ({
      title,
      svgString: `<svg><text>${title}</text></svg>`,
      svgHash: `${title}-hash`,
      geometryHash: "geometry-123",
      status: "ready",
      technicalQualityMetadata: {
        geometry_complete: true,
        facade_richness_score: 0.72,
        section_usefulness_score: 0.74,
        section_direct_evidence_quality: "verified",
        section_construction_truth_quality: "verified",
        ...metadata,
      },
      metadata: {
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion: "compiled-project-v1",
      },
    });

    const payload = buildComposePayload({
      canonicalPack: {
        geometryHash: "geometry-123",
        panels: {
          elevation_east: canonicalPanel("EAST ELEVATION"),
          elevation_west: canonicalPanel("WEST ELEVATION"),
          section_BB: canonicalPanel("SECTION BB", {
            section_strategy_id: "transverse-b",
          }),
        },
      },
      designId: "design-123",
      floorCount: 2,
      generatedPanels: [
        {
          type: "elevation_east",
          label: "EAST ELEVATION",
          imageUrl: "<svg><text>EAST ELEVATION</text></svg>",
          meta: {
            designFingerprint: "fingerprint-123",
            geometryHash: "geometry-123",
            authorityUsed: "compiled_project_canonical_pack",
            authoritySource: "compiled_project",
          },
        },
      ],
      locationData: {},
      masterDNA: { dnaHash: "dna-123", rooms: [] },
      programLock: { hash: "program-123" },
      projectContext: {
        drawings: {},
        compiledProject: {
          drawings: {
            floor_plan_ground: { geometryHash: "stale-shape" },
          },
        },
      },
      runId: "run-123",
    });

    expect(payload.drawings.elevation.map((entry) => entry.orientation)).toEqual(
      expect.arrayContaining(["east", "west"]),
    );
    expect(payload.drawings.section[0]).toMatchObject({
      section_type: "transverse",
      section_profile: { strategyId: "transverse-b" },
    });
  });
});
