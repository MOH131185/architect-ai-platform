import {
  isResidentialBuildingType,
  resolvePresentationLayoutTemplate,
} from "../../services/project/projectGraphVerticalSliceService.js";

describe("Phase B residential layout routing", () => {
  test("residential typologies are detected", () => {
    expect(isResidentialBuildingType("residential")).toBe(true);
    expect(isResidentialBuildingType("detached_house")).toBe(true);
    expect(isResidentialBuildingType("detached-house")).toBe(true);
    expect(isResidentialBuildingType("Detached House")).toBe(true);
    expect(isResidentialBuildingType("multi_residential")).toBe(true);
    expect(isResidentialBuildingType("apartment")).toBe(true);
    expect(isResidentialBuildingType("flat")).toBe(true);
    expect(isResidentialBuildingType("loft_conversion")).toBe(true);
    expect(isResidentialBuildingType("townhouse")).toBe(true);
    expect(isResidentialBuildingType("residential_estate")).toBe(true); // substring catch
    expect(isResidentialBuildingType("dwelling")).toBe(true);
  });

  test("non-residential typologies fall through to board-v2", () => {
    expect(isResidentialBuildingType("office_studio")).toBe(false);
    expect(isResidentialBuildingType("community")).toBe(false);
    expect(isResidentialBuildingType("education_studio")).toBe(false);
    expect(isResidentialBuildingType("mixed_use")).toBe(false);
    expect(isResidentialBuildingType(null)).toBe(false);
    expect(isResidentialBuildingType("")).toBe(false);
    expect(isResidentialBuildingType(undefined)).toBe(false);
  });

  test("resolvePresentationLayoutTemplate routes residential to presentation-v3", () => {
    expect(
      resolvePresentationLayoutTemplate({ building_type: "detached_house" }),
    ).toBe("presentation-v3");
    expect(
      resolvePresentationLayoutTemplate({ building_type: "multi_residential" }),
    ).toBe("presentation-v3");
    expect(
      resolvePresentationLayoutTemplate({ buildingType: "residential" }),
    ).toBe("presentation-v3");
  });

  test("resolvePresentationLayoutTemplate routes non-residential to board-v2", () => {
    expect(
      resolvePresentationLayoutTemplate({ building_type: "office_studio" }),
    ).toBe("board-v2");
    expect(
      resolvePresentationLayoutTemplate({ building_type: "mixed_use" }),
    ).toBe("board-v2");
    expect(resolvePresentationLayoutTemplate({})).toBe("board-v2");
    expect(resolvePresentationLayoutTemplate({ building_type: null })).toBe(
      "board-v2",
    );
  });
});
