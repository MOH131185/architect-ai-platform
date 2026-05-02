import { BUILDING_CATEGORIES } from "../../data/buildingTypes.js";
import {
  PROJECT_TYPE_ROUTES,
  PROJECT_TYPE_SUPPORT_REGISTRY,
  PROJECT_TYPE_SUPPORT_STATUS,
  getProjectTypeSupport,
} from "../../services/project/projectTypeSupportRegistry.js";
import { SUPPORTED_RESIDENTIAL_V2_SUBTYPES } from "../../services/project/v2ProjectContracts.js";

const enabledNonResidentialKeys = () =>
  PROJECT_TYPE_SUPPORT_REGISTRY.filter(
    (entry) => entry.categoryId !== "residential" && entry.enabledInUi,
  )
    .map((entry) => `${entry.categoryId}:${entry.subtypeId}`)
    .sort();

const expandedProjectGraphTemplateCases = [
  ["hospitality", "hotel", "hospitality_hotel"],
  ["hospitality", "resort", "hospitality_resort"],
  ["hospitality", "guest-house", "hospitality_guest_house"],
  ["industrial", "warehouse", "industrial_warehouse"],
  ["industrial", "manufacturing", "industrial_manufacturing"],
  ["industrial", "workshop", "industrial_workshop"],
  ["cultural", "museum", "cultural_museum"],
  ["cultural", "library", "cultural_library"],
  ["cultural", "theatre", "cultural_theatre"],
  ["government", "town-hall", "government_town_hall"],
  ["government", "police", "government_police_station"],
  ["government", "fire-station", "government_fire_station"],
  ["religious", "mosque", "religious_mosque"],
  ["religious", "church", "religious_church"],
  ["religious", "temple", "religious_temple"],
  ["recreation", "sports-center", "recreation_sports_center"],
  ["recreation", "gym", "recreation_gym"],
  ["recreation", "pool", "recreation_pool"],
];

describe("projectTypeSupportRegistry", () => {
  test("keeps the Residential V2 supported subtype set unchanged", () => {
    const residentialSubtypes = BUILDING_CATEGORIES.RESIDENTIAL.subTypes.map(
      (entry) => entry.id,
    );

    const enabledResidential = PROJECT_TYPE_SUPPORT_REGISTRY.filter(
      (entry) => entry.categoryId === "residential" && entry.enabledInUi,
    )
      .map((entry) => entry.subtypeId)
      .sort();

    expect(enabledResidential).toEqual(
      [...SUPPORTED_RESIDENTIAL_V2_SUBTYPES].sort(),
    );

    for (const subtypeId of residentialSubtypes) {
      const support = getProjectTypeSupport("residential", subtypeId);
      if (SUPPORTED_RESIDENTIAL_V2_SUBTYPES.includes(subtypeId)) {
        expect(support).toEqual(
          expect.objectContaining({
            enabledInUi: true,
            route: PROJECT_TYPE_ROUTES.RESIDENTIAL_V2,
            supportStatus: PROJECT_TYPE_SUPPORT_STATUS.PRODUCTION,
          }),
        );
      } else {
        expect(support).toEqual(
          expect.objectContaining({
            enabledInUi: false,
            route: null,
            supportStatus: PROJECT_TYPE_SUPPORT_STATUS.DISABLED,
          }),
        );
      }
    }
  });

  test("enables only supported non-residential ProjectGraph templates", () => {
    expect(enabledNonResidentialKeys()).toEqual(
      [
        "commercial:office",
        "education:school",
        "healthcare:clinic",
        "healthcare:hospital",
        ...expandedProjectGraphTemplateCases.map(
          ([category, subtype]) => `${category}:${subtype}`,
        ),
      ].sort(),
    );

    expect(getProjectTypeSupport("commercial", "office")).toEqual(
      expect.objectContaining({
        canonicalBuildingType: "office_studio",
        programmeTemplateKey: "office_studio",
        route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
      }),
    );
    expect(getProjectTypeSupport("education", "school")).toEqual(
      expect.objectContaining({
        canonicalBuildingType: "education_studio",
        programmeTemplateKey: "education_studio",
        route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
      }),
    );
    expect(getProjectTypeSupport("healthcare", "clinic")).toEqual(
      expect.objectContaining({
        canonicalBuildingType: "clinic",
        programmeTemplateKey: "clinic",
        route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
      }),
    );
    expect(getProjectTypeSupport("healthcare", "hospital")).toEqual(
      expect.objectContaining({
        canonicalBuildingType: "hospital",
        programmeTemplateKey: "hospital",
        route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
      }),
    );

    for (const [
      category,
      subtype,
      canonicalBuildingType,
    ] of expandedProjectGraphTemplateCases) {
      expect(getProjectTypeSupport(category, subtype)).toEqual(
        expect.objectContaining({
          canonicalBuildingType,
          programmeTemplateKey: canonicalBuildingType,
          route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
          supportStatus: PROJECT_TYPE_SUPPORT_STATUS.BETA,
          badgeLabel: "Beta ProjectGraph",
        }),
      );
    }
  });

  test("unsupported categories and subtypes remain disabled with a clear status", () => {
    const supportedNonResidential = new Set(enabledNonResidentialKeys());

    for (const entry of PROJECT_TYPE_SUPPORT_REGISTRY) {
      if (
        entry.categoryId === "residential" ||
        supportedNonResidential.has(`${entry.categoryId}:${entry.subtypeId}`)
      ) {
        continue;
      }

      expect(entry).toEqual(
        expect.objectContaining({
          enabledInUi: false,
          supportStatus: PROJECT_TYPE_SUPPORT_STATUS.DISABLED,
          route: null,
          canonicalBuildingType: null,
        }),
      );
      // Either generic "Experimental/off" or per-subtype "Coming soon"
      // for entries that have an explicit DISABLED_REASONS row.
      expect(["Experimental/off", "Coming soon"]).toContain(entry.badgeLabel);
    }

    expect(getProjectTypeSupport("civic", "museum")).toEqual(
      expect.objectContaining({
        enabledInUi: false,
        supportStatus: PROJECT_TYPE_SUPPORT_STATUS.DISABLED,
        route: null,
        canonicalBuildingType: null,
        badgeLabel: "Experimental/off",
      }),
    );
  });

  test("disabled commercial/healthcare/education subtypes surface a per-subtype 'Coming soon' message", () => {
    const comingSoonKeys = [
      ["commercial", "retail"],
      ["commercial", "mixed-use"],
      ["commercial", "shopping-mall"],
      ["healthcare", "dental"],
      ["healthcare", "lab"],
      ["education", "university"],
      ["education", "kindergarten"],
    ];
    for (const [category, subtype] of comingSoonKeys) {
      const support = getProjectTypeSupport(category, subtype);
      expect(support).toEqual(
        expect.objectContaining({
          enabledInUi: false,
          badgeLabel: "Coming soon",
          supportStatus: PROJECT_TYPE_SUPPORT_STATUS.DISABLED,
        }),
      );
      expect(support.message).toBeTruthy();
      expect(support.message).not.toEqual(
        expect.stringContaining("Experimental/off"),
      );
    }
  });

  test("residential mansion is enabled on the production V2 route", () => {
    const mansion = getProjectTypeSupport("residential", "mansion");
    expect(mansion).toEqual(
      expect.objectContaining({
        enabledInUi: true,
        route: PROJECT_TYPE_ROUTES.RESIDENTIAL_V2,
        supportStatus: PROJECT_TYPE_SUPPORT_STATUS.PRODUCTION,
        canonicalBuildingType: "dwelling",
        programmeTemplateKey: "mansion",
        badgeLabel: "Residential V2",
      }),
    );
    expect(SUPPORTED_RESIDENTIAL_V2_SUBTYPES).toContain("mansion");
  });
});
