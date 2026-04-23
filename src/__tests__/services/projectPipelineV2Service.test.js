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
      portfolioFiles: [{ name: "portfolio-1.jpg", type: "image/jpeg" }],
      materialWeight: 0.65,
      characteristicWeight: 0.55,
    });

    expect(bundle.supported).toBe(true);
    expect(bundle.pipelineVersion).toBe(UK_RESIDENTIAL_V2_PIPELINE_VERSION);
    expect(bundle.compiledProject?.geometryHash).toBeTruthy();
    expect(bundle.projectQuantityTakeoff?.items?.length).toBeGreaterThan(0);
    expect(bundle.styleBlendSpec?.approved?.materials).toBeTruthy();
    expect(bundle.validation?.valid).toBe(true);
  });
});
