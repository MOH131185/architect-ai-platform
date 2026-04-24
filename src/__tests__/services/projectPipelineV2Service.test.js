import { buildProjectPipelineV2Bundle } from "../../services/project/projectPipelineV2Service.js";
import { UK_RESIDENTIAL_V2_PIPELINE_VERSION } from "../../services/project/v2ProjectContracts.js";

function createSitePolygon() {
  return [
    { lat: 51.5001, lng: -0.1201 },
    { lat: 51.5001, lng: -0.1197 },
    { lat: 51.4998, lng: -0.1197 },
    { lat: 51.4998, lng: -0.1201 },
  ];
}

describe("projectPipelineV2Service", () => {
  const baseInput = {
    locationData: {
      address: "10 Example Street, London",
      coordinates: { lat: 51.5, lng: -0.12 },
      climate: { type: "temperate" },
      recommendedStyle: "Contemporary Local",
      localMaterials: ["brick", "timber"],
    },
    sitePolygon: createSitePolygon(),
    siteMetrics: {
      areaM2: 420,
      perimeterM: 84,
      orientationDeg: 12,
      centroid: { lat: 51.49995, lng: -0.1199 },
    },
  };

  test("builds a supported UK residential compiled-project bundle", async () => {
    const bundle = await buildProjectPipelineV2Bundle({
      projectDetails: {
        category: "residential",
        subType: "detached-house",
        program: "detached-house",
        area: 185,
        floorCount: 2,
        entranceDirection: "S",
      },
      ...baseInput,
      portfolioFiles: [{ name: "portfolio-1.jpg", type: "image/jpeg" }],
      materialWeight: 0.65,
      characteristicWeight: 0.55,
    });

    expect(bundle.supported).toBe(true);
    expect(bundle.pipelineVersion).toBe(UK_RESIDENTIAL_V2_PIPELINE_VERSION);
    expect(bundle.compiledProject?.geometryHash).toBeTruthy();
    expect(bundle.technicalPack?.geometryHash).toBe(
      bundle.compiledProject?.geometryHash,
    );
    expect(bundle.compiledProject?.technicalPack?.geometryHash).toBe(
      bundle.compiledProject?.geometryHash,
    );
    expect(bundle.technicalPack?.panelTypes).toEqual(
      expect.arrayContaining([
        "floor_plan_ground",
        "elevation_north",
        "section_AA",
      ]),
    );
    expect(bundle.layoutQuality?.source).toBe("runtime_layout_geometry");
    expect(bundle.compiledProject?.layoutQuality?.fallbackUsed).toBe(true);
    expect(bundle.projectQuantityTakeoff?.items?.length).toBeGreaterThan(0);
    expect(bundle.styleBlendSpec?.approved?.materials).toBeTruthy();
    expect(bundle.validation?.valid).toBe(true);
    expect(bundle.authorityReadiness?.ready).toBe(true);
    expect(bundle.authorityReadiness?.authoritySource).toBe("compiled_project");
    expect(bundle.compiledProject?.footprint?.area_m2).toBeGreaterThan(60);
    expect(bundle.compiledProject?.footprint?.area_m2).toBeLessThan(140);
    expect(
      bundle.compiledProject?.site?.constraints?.boundary_area_m2,
    ).toBeGreaterThan(bundle.compiledProject?.footprint?.area_m2);
    expect(bundle.projectQuantityTakeoff?.summary?.roofAreaM2).toBeLessThan(
      160,
    );
    expect(bundle.deliveryStages?.stages?.map((stage) => stage.id)).toEqual(
      expect.arrayContaining([
        "brief_locked",
        "compiled_project_ready",
        "deterministic_technical_pack_ready",
        "geometry_locked_visuals_ready",
        "compose_passed",
        "publishability_passed",
      ]),
    );
    expect(bundle.exportManifest?.exports?.json?.available).toBe(true);
    expect(bundle.reviewSurface?.supported).toBe(true);
    expect(bundle.reviewSurface?.createJob?.endpoint).toBe("/api/genarch/jobs");
  });

  test("respects manual floor lock in program brief and geometry", async () => {
    const bundle = await buildProjectPipelineV2Bundle({
      projectDetails: {
        category: "residential",
        subType: "detached-house",
        program: "detached-house",
        area: 140,
        floorCount: 3,
        floorCountLocked: true,
        entranceDirection: "S",
      },
      programSpaces: [
        {
          id: "living-0",
          name: "Living Room",
          label: "Living Room",
          area: 28,
          count: 1,
          level: "Ground",
          levelIndex: 0,
          spaceType: "living-room",
        },
        {
          id: "bedroom-1",
          name: "Bedroom 1",
          label: "Bedroom 1",
          area: 14,
          count: 1,
          level: "First",
          levelIndex: 1,
          spaceType: "bedroom",
        },
      ],
      ...baseInput,
    });

    expect(bundle.programBrief?.levelCount).toBe(3);
    expect(bundle.projectGeometry?.levels).toHaveLength(3);
    expect(
      bundle.programBrief?.spaces?.some((space) => space.levelIndex === 2),
    ).toBe(true);
    expect(bundle.projectGeometry?.levels?.[2]?.rooms?.length).toBeGreaterThan(
      0,
    );
    expect(bundle.technicalPack?.panelTypes).toEqual(
      expect.arrayContaining([
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
      ]),
    );
  });

  test("uses space level label when levelIndex is stale", async () => {
    const bundle = await buildProjectPipelineV2Bundle({
      projectDetails: {
        category: "residential",
        subType: "detached-house",
        program: "detached-house",
        area: 140,
        floorCount: 2,
        floorCountLocked: true,
        entranceDirection: "S",
      },
      programSpaces: [
        {
          id: "living-0",
          name: "Living Room",
          label: "Living Room",
          area: 28,
          count: 1,
          level: "Ground",
          levelIndex: 0,
          spaceType: "living-room",
        },
        {
          id: "bedroom-1",
          name: "Bedroom 1",
          label: "Bedroom 1",
          area: 14,
          count: 1,
          level: "First",
          levelIndex: 0,
          spaceType: "bedroom",
        },
      ],
      ...baseInput,
    });

    const firstFloorRooms = bundle.projectGeometry?.levels?.[1]?.rooms || [];
    const groundFloorRooms = bundle.projectGeometry?.levels?.[0]?.rooms || [];
    expect(
      firstFloorRooms.some((room) => room?.name?.includes("Bedroom")),
    ).toBe(true);
    expect(
      groundFloorRooms.some((room) => room?.name?.includes("Bedroom")),
    ).toBe(false);
  });
});
