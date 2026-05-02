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
    expect(enabledNonResidentialKeys()).toEqual([
      "commercial:office",
      "education:school",
      "healthcare:clinic",
      "healthcare:hospital",
    ]);

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
          badgeLabel: "Experimental/off",
        }),
      );
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
});
