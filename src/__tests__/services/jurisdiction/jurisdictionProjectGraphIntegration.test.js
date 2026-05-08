import {
  __projectGraphVerticalSliceInternals,
  buildTitleBlockPanelArtifact,
} from "../../../services/project/projectGraphVerticalSliceService.js";
import { loadJurisdictionPack } from "../../../services/jurisdiction/jurisdictionPackService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-jurisdiction-project-001",
    projectGraphHash: "project-graph-hash-jurisdiction-project-001",
    projectName: "Jurisdiction Integration Fixture",
    jurisdiction: "france",
    metadata: { countryCode: "FR" },
    locationData: {
      address: "Rue de Rivoli, 75001 Paris, France",
      countryCode: "FR",
    },
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 8 },
        { x: 0, y: 8 },
      ],
    },
    levels: [{ id: "level-0", level_number: 0, name: "Ground", height_m: 3 }],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        polygon: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
          { x: 10, y: 7 },
          { x: 1, y: 7 },
        ],
      },
    ],
    rooms: [
      {
        id: "room-1",
        levelId: "level-0",
        name: "Living",
        type: "living",
        polygon: [
          { x: 1, y: 1 },
          { x: 7, y: 1 },
          { x: 7, y: 7 },
          { x: 1, y: 7 },
        ],
      },
    ],
    walls: [
      {
        id: "wall-1",
        levelId: "level-0",
        exterior: true,
        start: { x: 1, y: 1 },
        end: { x: 10, y: 1 },
      },
    ],
    openings: [
      {
        id: "door-1",
        levelId: "level-0",
        type: "door",
        width_m: 1,
        position_m: { x: 4, y: 1 },
      },
    ],
  };
}

describe("jurisdiction ProjectGraph integration", () => {
  test("A1 title block uses France title labels when France pack is supplied", () => {
    const francePack = loadJurisdictionPack("france");
    const artifact = buildTitleBlockPanelArtifact({
      projectGraphId: "project-graph-france-001",
      brief: {
        project_name: "Maison Test",
        target_gia_m2: 120,
        target_storeys: 2,
        building_type: "dwelling",
        site_input: { address: "Paris, France" },
      },
      geometryHash: "geometry-hash-france-title-001",
      sheetPlan: { sheet_number: "A1-01", scale: "1:100" },
      jurisdictionPack: francePack,
    });

    expect(artifact.svgString).toContain(">Projet<");
    expect(artifact.svgString).toContain(">ECHELLE<");
    expect(artifact.metadata.jurisdictionPack.countryCode).toBe("FR");
    expect(artifact.metadata.jurisdictionPack.titleBlockLabels.title).toBe(
      "TITRE",
    );
    expect(artifact.metadata.titleBlockLabels.scale).toBe("ECHELLE");
  });

  test("drawing-set metadata carries selected jurisdiction pack and title labels", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      { layoutTemplate: "presentation-v3" },
    );

    expect(result.drawingSet.jurisdictionPack).toEqual(
      expect.objectContaining({
        jurisdictionId: "france",
        countryCode: "FR",
        version: "jurisdiction-pack-france-v1",
      }),
    );
    expect(result.drawingSet.titleBlockLabels.project).toBe("Projet");
    expect(result.technicalBuild).toEqual(
      expect.objectContaining({
        jurisdictionPack: expect.objectContaining({ countryCode: "FR" }),
      }),
    );
  });
});
