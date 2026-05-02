import {
  getBuildingTypeSelectorCategoryState,
  getBuildingTypeSelectorSubTypeState,
} from "../../components/specs/BuildingTypeSelector.jsx";
import { getCategoryById } from "../../data/buildingTypes.js";

describe("BuildingTypeSelector project type support", () => {
  test("keeps residential supported subtypes enabled", () => {
    const residential = getCategoryById("residential");
    const detached = residential.subTypes.find(
      (entry) => entry.id === "detached-house",
    );
    const mansion = residential.subTypes.find(
      (entry) => entry.id === "mansion",
    );

    expect(getBuildingTypeSelectorCategoryState(residential).isEnabled).toBe(
      true,
    );
    expect(
      getBuildingTypeSelectorSubTypeState("residential", detached).isEnabled,
    ).toBe(true);
    expect(
      getBuildingTypeSelectorSubTypeState("residential", detached).support,
    ).toEqual(
      expect.objectContaining({
        badgeLabel: "Residential V2",
        route: "residential_v2",
      }),
    );
    expect(
      getBuildingTypeSelectorSubTypeState("residential", mansion).isEnabled,
    ).toBe(false);
  });

  test("enables only the first non-residential ProjectGraph set", () => {
    const commercial = getCategoryById("commercial");
    const education = getCategoryById("education");
    const healthcare = getCategoryById("healthcare");
    const office = commercial.subTypes.find((entry) => entry.id === "office");
    const retail = commercial.subTypes.find((entry) => entry.id === "retail");
    const school = education.subTypes.find((entry) => entry.id === "school");
    const clinic = healthcare.subTypes.find((entry) => entry.id === "clinic");
    const hospital = healthcare.subTypes.find(
      (entry) => entry.id === "hospital",
    );

    expect(getBuildingTypeSelectorCategoryState(commercial).isEnabled).toBe(
      true,
    );
    expect(getBuildingTypeSelectorCategoryState(education).isEnabled).toBe(
      true,
    );
    expect(getBuildingTypeSelectorCategoryState(healthcare).isEnabled).toBe(
      true,
    );
    expect(getBuildingTypeSelectorSubTypeState("commercial", office)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "office_studio",
          badgeLabel: "ProjectGraph",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("education", school)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "education_studio",
          badgeLabel: "Beta ProjectGraph",
          supportStatus: "beta",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("healthcare", clinic)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "clinic",
          badgeLabel: "ProjectGraph",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("healthcare", hospital)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "hospital",
          badgeLabel: "Beta ProjectGraph",
          supportStatus: "beta",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("commercial", retail)).toEqual(
      expect.objectContaining({
        isEnabled: false,
        support: expect.objectContaining({
          badgeLabel: "Experimental/off",
          supportStatus: "disabled",
        }),
      }),
    );
  });

  test("unsupported categories stay visible but disabled", () => {
    const industrial = getCategoryById("industrial");
    const manufacturing = industrial.subTypes.find(
      (entry) => entry.id === "manufacturing",
    );

    expect(getBuildingTypeSelectorCategoryState(industrial)).toEqual(
      expect.objectContaining({
        isEnabled: false,
        supportSummary: expect.objectContaining({
          enabledInUi: false,
          enabledCount: 0,
        }),
      }),
    );
    expect(
      getBuildingTypeSelectorSubTypeState("industrial", manufacturing),
    ).toEqual(
      expect.objectContaining({
        isEnabled: false,
        support: expect.objectContaining({
          supportStatus: "disabled",
          badgeLabel: "Experimental/off",
        }),
      }),
    );
  });
});
