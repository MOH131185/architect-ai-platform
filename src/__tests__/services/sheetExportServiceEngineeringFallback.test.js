import sheetExportService from "../../services/sheetExportService.js";
import bimService from "../../services/bimService.js";

describe("sheetExportService engineering exports fail closed", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("legacy IFC export does not emit a DNA-derived placeholder", async () => {
    const ifcSpy = jest.spyOn(bimService, "exportToIFC");

    await expect(
      sheetExportService.export({
        format: "ifc",
        designProject: {
          projectName: "Placeholder Risk",
          masterDNA: { dimensions: { length: 8, width: 6, floorCount: 2 } },
        },
      }),
    ).rejects.toThrow(/compiled-project .*\/api\/project\/export\/ifc/i);

    expect(ifcSpy).not.toHaveBeenCalled();
    expect(sheetExportService.generateIFCPlaceholder).toBeUndefined();
  });

  test("legacy RVT export does not call the placeholder BIM path", async () => {
    const rvtSpy = jest.spyOn(bimService, "exportToRVT");

    await expect(
      sheetExportService.export({
        format: "rvt",
        designProject: {
          projectName: "Placeholder Risk",
          masterDNA: { dimensions: { length: 8, width: 6, floorCount: 2 } },
        },
      }),
    ).rejects.toThrow(/Placeholder RVT output is disabled/i);

    expect(rvtSpy).not.toHaveBeenCalled();
    expect(sheetExportService.generateRVTPlaceholder).toBeUndefined();
  });

  test("DXF export surfaces BIM failures without falling back to fake CAD", async () => {
    jest.spyOn(bimService, "exportToDWG").mockImplementation(() => {
      throw new Error("converter failed");
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      sheetExportService.export({
        format: "dxf",
        designProject: {
          projectName: "DXF Risk",
          masterDNA: { dimensions: { length: 8, width: 6, floorCount: 2 } },
        },
      }),
    ).rejects.toThrow(/Placeholder CAD output is disabled/i);

    expect(sheetExportService.generateDWGPlaceholder).toBeUndefined();
  });
});
