import {
  collectTechnicalPanelGeometryHashes,
  findPanelsWithDisallowedTechnicalAuthority,
  findTechnicalPanelsMissingAuthorityMetadata,
  findTechnicalPanelsMissingGeometryHash,
  getOpusSheetCritic,
} from "../../services/a1/composeRuntime.js";

describe("composeRuntime", () => {
  test("getOpusSheetCritic returns a usable critic export", async () => {
    const criticExport = await getOpusSheetCritic();
    expect(criticExport).toBeTruthy();

    const critic =
      typeof criticExport === "function" ? new criticExport() : criticExport;

    expect(typeof critic.critiqueSheet).toBe("function");
  });

  test("tracks technical panel geometry hashes separately from visual panels", () => {
    const panels = [
      {
        type: "hero_3d",
        geometryHash: "geom-visual",
      },
      {
        type: "floor_plan_ground",
        meta: { geometryHash: "geom-tech" },
      },
      {
        type: "section_AA",
      },
      {
        type: "elevation_north",
        geometryHash: "geom-tech",
      },
    ];

    expect(collectTechnicalPanelGeometryHashes(panels)).toEqual(["geom-tech"]);
    expect(findTechnicalPanelsMissingGeometryHash(panels)).toEqual([
      "section_AA",
    ]);
  });

  test("flags missing technical authority metadata separately from geometry hash", () => {
    const panels = [
      {
        type: "floor_plan_ground",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "compiled_project_canonical_pack",
          authoritySource: "compiled_project",
          compiledProjectSchemaVersion: "compiled-project-v1",
        },
      },
      {
        type: "section_AA",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "compiled_project_canonical_pack",
        },
      },
    ];

    expect(findTechnicalPanelsMissingAuthorityMetadata(panels)).toEqual([
      {
        panelType: "section_AA",
        missing: ["compiledProjectSchemaVersion"],
      },
    ]);
  });

  test("rejects prompt-only authority for deterministic technical drawings", () => {
    const panels = [
      {
        type: "floor_plan_ground",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "prompt_only",
          authoritySource: "prompt_only",
          generatorUsed: "flux",
        },
      },
      {
        type: "site_diagram",
        meta: {
          geometryHash: "geom-tech",
          authorityUsed: "deterministic_svg",
          authoritySource: "site_evidence",
        },
      },
    ];

    expect(findPanelsWithDisallowedTechnicalAuthority(panels)).toEqual([
      {
        panelType: "floor_plan_ground",
        authorityUsed: "prompt_only",
        authoritySource: "prompt_only",
        generatorUsed: "flux",
        panelAuthorityReason: null,
      },
    ]);
  });
});
