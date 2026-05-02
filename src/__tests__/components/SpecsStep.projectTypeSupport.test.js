import { canProceedWithProjectType } from "../../components/steps/SpecsStep.jsx";

describe("SpecsStep project type support", () => {
  test.each([
    ["detached house", "residential", "detached-house"],
    ["office", "commercial", "office"],
    ["school", "education", "school"],
    ["clinic", "healthcare", "clinic"],
    ["hospital", "healthcare", "hospital"],
  ])("canProceed is true for supported %s", (_label, category, subType) => {
    expect(
      canProceedWithProjectType({
        area: 250,
        category,
        subType,
      }),
    ).toBe(true);
  });

  test.each([
    ["retail", "commercial", "retail"],
    ["hotel", "hospitality", "hotel"],
    ["manufacturing", "industrial", "manufacturing"],
    ["mansion", "residential", "mansion"],
  ])("canProceed is false for disabled %s", (_label, category, subType) => {
    expect(
      canProceedWithProjectType({
        area: 250,
        category,
        subType,
      }),
    ).toBe(false);
  });

  test("canProceed is false until area and subtype are present", () => {
    expect(
      canProceedWithProjectType({
        category: "commercial",
        subType: "office",
      }),
    ).toBe(false);
    expect(
      canProceedWithProjectType({
        area: 250,
        category: "commercial",
      }),
    ).toBe(false);
  });
});
