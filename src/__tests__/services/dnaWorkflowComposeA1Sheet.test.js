import { buildComposePayload } from "../../services/dnaWorkflow/composeA1Sheet.js";

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
    expect(payload.drawings).toEqual({
      floor_plan_ground: { geometryHash: "geometry-123" },
    });
    expect(payload.technicalPanelQuality).toEqual({ status: "verified" });
    expect(payload.finalSheetSvg).toContain("GROUND FLOOR PLAN");
    expect(payload.sheetTextContract.requiredLabels).toEqual(
      expect.arrayContaining(["GROUND FLOOR PLAN", "A1 Test Project"]),
    );
  });
});
