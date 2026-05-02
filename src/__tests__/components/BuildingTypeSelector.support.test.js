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

  test("enables supported non-residential ProjectGraph templates", () => {
    const commercial = getCategoryById("commercial");
    const education = getCategoryById("education");
    const healthcare = getCategoryById("healthcare");
    const hospitality = getCategoryById("hospitality");
    const industrial = getCategoryById("industrial");
    const cultural = getCategoryById("cultural");
    const government = getCategoryById("government");
    const religious = getCategoryById("religious");
    const recreation = getCategoryById("recreation");
    const office = commercial.subTypes.find((entry) => entry.id === "office");
    const retail = commercial.subTypes.find((entry) => entry.id === "retail");
    const school = education.subTypes.find((entry) => entry.id === "school");
    const clinic = healthcare.subTypes.find((entry) => entry.id === "clinic");
    const hospital = healthcare.subTypes.find(
      (entry) => entry.id === "hospital",
    );
    const hotel = hospitality.subTypes.find((entry) => entry.id === "hotel");
    const warehouse = industrial.subTypes.find(
      (entry) => entry.id === "warehouse",
    );
    const museum = cultural.subTypes.find((entry) => entry.id === "museum");
    const townHall = government.subTypes.find(
      (entry) => entry.id === "town-hall",
    );
    const church = religious.subTypes.find((entry) => entry.id === "church");
    const sportsCenter = recreation.subTypes.find(
      (entry) => entry.id === "sports-center",
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
    for (const category of [
      hospitality,
      industrial,
      cultural,
      government,
      religious,
      recreation,
    ]) {
      expect(getBuildingTypeSelectorCategoryState(category).isEnabled).toBe(
        true,
      );
    }
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
    expect(getBuildingTypeSelectorSubTypeState("hospitality", hotel)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "hospitality_hotel",
          badgeLabel: "Beta ProjectGraph",
        }),
      }),
    );
    expect(
      getBuildingTypeSelectorSubTypeState("industrial", warehouse),
    ).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "industrial_warehouse",
          badgeLabel: "Beta ProjectGraph",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("cultural", museum)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "cultural_museum",
          badgeLabel: "Beta ProjectGraph",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("government", townHall)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "government_town_hall",
          badgeLabel: "Beta ProjectGraph",
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("religious", church)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "religious_church",
          badgeLabel: "Beta ProjectGraph",
        }),
      }),
    );
    expect(
      getBuildingTypeSelectorSubTypeState("recreation", sportsCenter),
    ).toEqual(
      expect.objectContaining({
        isEnabled: true,
        support: expect.objectContaining({
          canonicalBuildingType: "recreation_sports_center",
          badgeLabel: "Beta ProjectGraph",
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

  test("unsupported subtypes stay visible but disabled", () => {
    const commercial = getCategoryById("commercial");
    const retail = commercial.subTypes.find((entry) => entry.id === "retail");

    expect(getBuildingTypeSelectorCategoryState(commercial)).toEqual(
      expect.objectContaining({
        isEnabled: true,
        supportSummary: expect.objectContaining({
          enabledInUi: true,
          enabledCount: 1,
        }),
      }),
    );
    expect(getBuildingTypeSelectorSubTypeState("commercial", retail)).toEqual(
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
