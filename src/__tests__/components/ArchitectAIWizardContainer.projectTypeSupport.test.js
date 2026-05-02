jest.mock("../../utils/pdfToImages.js", () => ({
  convertPdfFileToImageFile: jest.fn(),
}));

import {
  assertProjectTypeSupportedForGeneration,
  resolveWizardProjectTypeSupport,
  shouldUseResidentialV2Route,
} from "../../components/ArchitectAIWizardContainer.jsx";

describe("ArchitectAIWizardContainer project type routing", () => {
  test("generation guard allows supported registry entries", () => {
    for (const projectDetails of [
      { category: "commercial", subType: "office" },
      { category: "education", subType: "school" },
      { category: "healthcare", subType: "clinic" },
      { category: "healthcare", subType: "hospital" },
    ]) {
      expect(assertProjectTypeSupportedForGeneration(projectDetails)).toEqual(
        expect.objectContaining({
          enabledInUi: true,
          route: "project_graph",
        }),
      );
    }
  });

  test("generation guard still blocks disabled entries", () => {
    expect(() =>
      assertProjectTypeSupportedForGeneration({
        category: "commercial",
        subType: "retail",
      }),
    ).toThrow(/not enabled|Experimental\/off/i);
  });

  test("residential still resolves to Residential V2", () => {
    const projectDetails = {
      category: "residential",
      subType: "detached-house",
    };

    expect(resolveWizardProjectTypeSupport(projectDetails)).toEqual(
      expect.objectContaining({
        canonicalBuildingType: "dwelling",
        route: "residential_v2",
        supportStatus: "production",
      }),
    );
    expect(shouldUseResidentialV2Route(projectDetails)).toBe(true);
    expect(
      shouldUseResidentialV2Route(projectDetails, {
        residentialV2Enabled: false,
      }),
    ).toBe(false);
  });
});
