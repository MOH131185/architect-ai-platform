import {
  buildCostWorkbook,
  exportCompiledProjectToDXF,
  exportCompiledProjectToIFC,
} from "../../services/project/compiledProjectExportService.js";
import { buildProjectPipelineV2Bundle } from "../../services/project/projectPipelineV2Service.js";

function createBundleInput() {
  return {
    projectDetails: {
      category: "residential",
      subType: "cottage",
      program: "cottage",
      area: 140,
      floorCount: 2,
      entranceDirection: "E",
    },
    locationData: {
      address: "22 Sample Road, York",
      coordinates: { lat: 53.96, lng: -1.08 },
      climate: { type: "temperate" },
      recommendedStyle: "Yorkshire vernacular",
      localMaterials: ["stone", "timber"],
    },
    sitePolygon: [
      { lat: 53.9602, lng: -1.0802 },
      { lat: 53.9602, lng: -1.0798 },
      { lat: 53.9599, lng: -1.0798 },
      { lat: 53.9599, lng: -1.0802 },
    ],
    siteMetrics: {
      areaM2: 360,
      perimeterM: 76,
      orientationDeg: 18,
      centroid: { lat: 53.96005, lng: -1.08 },
    },
    portfolioFiles: [],
  };
}

describe("compiledProjectExportService", () => {
  test("exports DXF, IFC, and workbook from compiled project authority", async () => {
    const bundle = await buildProjectPipelineV2Bundle(createBundleInput());

    const dxf = exportCompiledProjectToDXF({
      compiledProject: bundle.compiledProject,
      projectName: "Test Cottage",
    });
    const ifc = exportCompiledProjectToIFC({
      compiledProject: bundle.compiledProject,
      projectName: "Test Cottage",
    });
    const workbook = buildCostWorkbook({
      compiledProject: bundle.compiledProject,
      takeoff: bundle.projectQuantityTakeoff,
      projectName: "Test Cottage",
    });

    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf).toContain(bundle.compiledProject.geometryHash);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'))");
    expect(ifc).toContain("IFCBUILDING");
    expect(workbook.workbookArray).toBeTruthy();
    expect(workbook.manifest?.tabs).toEqual(
      expect.arrayContaining(["Summary", "Quantities", "UnitRates", "Totals"]),
    );
  });
});
