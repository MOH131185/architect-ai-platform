import { canProceedWithProjectType } from "../../components/steps/SpecsStep.jsx";

describe("SpecsStep project type support", () => {
  test.each([
    // Production
    ["detached house", "residential", "detached-house"],
    ["mansion", "residential", "mansion"],
    ["office", "commercial", "office"],
    ["clinic", "healthcare", "clinic"],
    // Beta — existing
    ["school", "education", "school"],
    ["hospital", "healthcare", "hospital"],
    ["hotel", "hospitality", "hotel"],
    ["manufacturing", "industrial", "manufacturing"],
    // Beta — newly enabled 2026-05-02
    ["retail", "commercial", "retail"],
    ["mixed-use", "commercial", "mixed-use"],
    ["shopping-mall", "commercial", "shopping-mall"],
    ["dental", "healthcare", "dental"],
    ["lab", "healthcare", "lab"],
    ["university", "education", "university"],
    ["kindergarten", "education", "kindergarten"],
  ])("canProceed is true for supported %s", (_label, category, subType) => {
    expect(
      canProceedWithProjectType({
        area: 250,
        category,
        subType,
      }),
    ).toBe(true);
  });

  test("canProceed is false for unsupported residential subtypes that are not in the V2 set", () => {
    // Every BUILDING_CATEGORIES.RESIDENTIAL subtype is now in V2; we use a
    // synthetic non-existent subtype to keep regression coverage on the
    // disabled-path. Genuinely-unsupported categories (e.g. "civic") flow
    // through the same path.
    expect(
      canProceedWithProjectType({
        area: 250,
        category: "civic",
        subType: "memorial",
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
