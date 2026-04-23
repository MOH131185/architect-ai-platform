import {
  collectTechnicalPanelGeometryHashes,
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
});
