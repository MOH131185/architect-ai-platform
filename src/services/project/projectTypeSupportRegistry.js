import {
  BUILDING_CATEGORIES,
  getSubTypeById,
} from "../../data/buildingTypes.js";
import { isSupportedResidentialV2SubType } from "./v2ProjectContracts.js";

export const PROJECT_TYPE_SUPPORT_STATUS = Object.freeze({
  PRODUCTION: "production",
  BETA: "beta",
  EXPERIMENTAL: "experimental",
  DISABLED: "disabled",
});

export const PROJECT_TYPE_ROUTES = Object.freeze({
  RESIDENTIAL_V2: "residential_v2",
  PROJECT_GRAPH: "project_graph",
});

export const PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION =
  "project-graph-project-types-v1";

const DEFAULT_DISABLED_MESSAGE =
  "Experimental/off in the current production ProjectGraph rollout.";

// Per-subtype disabled reasons. Each entry replaces the generic
// `DEFAULT_DISABLED_MESSAGE` for one specific `category:subtype` pair so
// the UI can show the user *why* a type is not yet available rather than
// a one-size-fits-all "Experimental/off" badge. Entries are intentionally
// granular — when a programme template is authored end-to-end, the entry
// is removed and an `ENABLED_OVERRIDES` row takes its place.
//
// As of 2026-05-02: empty. The seven previously-disabled non-residential
// subtypes (commercial:retail, mixed-use, shopping-mall; healthcare:dental,
// lab; education:university, kindergarten) are now BETA via the same
// generic ProjectGraph route as warehouse / hotel / theatre etc. — the
// pipeline accepts the canonical building type as the programme template
// key and produces a deterministic programme from the brief area + spaces.
const DISABLED_REASONS = Object.freeze({});

const RESIDENTIAL_CANONICAL_BY_SUBTYPE = Object.freeze({
  "detached-house": "dwelling",
  "semi-detached-house": "dwelling",
  "terraced-house": "dwelling",
  villa: "dwelling",
  cottage: "dwelling",
  mansion: "dwelling",
  "apartment-building": "multi_residential",
  "multi-family": "multi_residential",
  duplex: "dwelling",
});

function betaProjectGraphSupport({
  canonicalBuildingType,
  programmeTemplateKey = canonicalBuildingType,
  label,
}) {
  return {
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.BETA,
    canonicalBuildingType,
    route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
    enabledInUi: true,
    message: `Beta ProjectGraph ${label} support is enabled.`,
    reason: `${label} is backed by a deterministic ProjectGraph programme template.`,
    programmeTemplateKey,
    badgeLabel: "Beta ProjectGraph",
  };
}

const ENABLED_OVERRIDES = Object.freeze({
  "commercial:office": {
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.PRODUCTION,
    canonicalBuildingType: "office_studio",
    route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
    enabledInUi: true,
    message: "ProjectGraph office support is enabled.",
    reason: "Office is backed by the ProjectGraph office programme template.",
    programmeTemplateKey: "office_studio",
    badgeLabel: "ProjectGraph",
  },
  "education:school": {
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.BETA,
    canonicalBuildingType: "education_studio",
    route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
    enabledInUi: true,
    message: "Beta ProjectGraph school support is enabled.",
    reason:
      "School is available as a beta ProjectGraph route with a deterministic education template.",
    programmeTemplateKey: "education_studio",
    badgeLabel: "Beta ProjectGraph",
  },
  "healthcare:clinic": {
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.PRODUCTION,
    canonicalBuildingType: "clinic",
    route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
    enabledInUi: true,
    message: "ProjectGraph clinic support is enabled.",
    reason: "Clinic is backed by the ProjectGraph clinic programme template.",
    programmeTemplateKey: "clinic",
    badgeLabel: "ProjectGraph",
  },
  "healthcare:hospital": {
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.BETA,
    canonicalBuildingType: "hospital",
    route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
    enabledInUi: true,
    message: "Beta ProjectGraph hospital support is enabled.",
    reason:
      "Hospital is available as a beta ProjectGraph route with a deterministic hospital template.",
    programmeTemplateKey: "hospital",
    badgeLabel: "Beta ProjectGraph",
  },
  "hospitality:hotel": betaProjectGraphSupport({
    canonicalBuildingType: "hospitality_hotel",
    label: "Hotel",
  }),
  "hospitality:resort": betaProjectGraphSupport({
    canonicalBuildingType: "hospitality_resort",
    label: "Resort",
  }),
  "hospitality:guest-house": betaProjectGraphSupport({
    canonicalBuildingType: "hospitality_guest_house",
    label: "Guest House",
  }),
  "industrial:warehouse": betaProjectGraphSupport({
    canonicalBuildingType: "industrial_warehouse",
    label: "Warehouse",
  }),
  "industrial:manufacturing": betaProjectGraphSupport({
    canonicalBuildingType: "industrial_manufacturing",
    label: "Manufacturing",
  }),
  "industrial:workshop": betaProjectGraphSupport({
    canonicalBuildingType: "industrial_workshop",
    label: "Workshop",
  }),
  "cultural:museum": betaProjectGraphSupport({
    canonicalBuildingType: "cultural_museum",
    label: "Museum",
  }),
  "cultural:library": betaProjectGraphSupport({
    canonicalBuildingType: "cultural_library",
    label: "Library",
  }),
  "cultural:theatre": betaProjectGraphSupport({
    canonicalBuildingType: "cultural_theatre",
    label: "Theatre",
  }),
  "government:town-hall": betaProjectGraphSupport({
    canonicalBuildingType: "government_town_hall",
    label: "Town Hall",
  }),
  "government:police": betaProjectGraphSupport({
    canonicalBuildingType: "government_police_station",
    label: "Police Station",
  }),
  "government:fire-station": betaProjectGraphSupport({
    canonicalBuildingType: "government_fire_station",
    label: "Fire Station",
  }),
  "religious:mosque": betaProjectGraphSupport({
    canonicalBuildingType: "religious_mosque",
    label: "Mosque",
  }),
  "religious:church": betaProjectGraphSupport({
    canonicalBuildingType: "religious_church",
    label: "Church",
  }),
  "religious:temple": betaProjectGraphSupport({
    canonicalBuildingType: "religious_temple",
    label: "Temple",
  }),
  "recreation:sports-center": betaProjectGraphSupport({
    canonicalBuildingType: "recreation_sports_center",
    label: "Sports Center",
  }),
  "recreation:gym": betaProjectGraphSupport({
    canonicalBuildingType: "recreation_gym",
    label: "Gym",
  }),
  "recreation:pool": betaProjectGraphSupport({
    canonicalBuildingType: "recreation_pool",
    label: "Swimming Pool",
  }),
  // Promoted from "Coming soon" to BETA on 2026-05-02. The ProjectGraph
  // pipeline accepts the canonical building type as the programme
  // template key and generates the programme from area + spaces brief
  // — same pattern as the BETA types above. End-to-end smoke is the
  // user's manual responsibility per the new BETA contract.
  "commercial:retail": betaProjectGraphSupport({
    canonicalBuildingType: "commercial_retail",
    label: "Retail Store",
  }),
  "commercial:mixed-use": betaProjectGraphSupport({
    canonicalBuildingType: "commercial_mixed_use",
    label: "Mixed-Use",
  }),
  "commercial:shopping-mall": betaProjectGraphSupport({
    canonicalBuildingType: "commercial_shopping_mall",
    label: "Shopping Mall",
  }),
  "healthcare:dental": betaProjectGraphSupport({
    canonicalBuildingType: "healthcare_dental",
    label: "Dental Clinic",
  }),
  "healthcare:lab": betaProjectGraphSupport({
    canonicalBuildingType: "healthcare_laboratory",
    label: "Laboratory",
  }),
  "education:university": betaProjectGraphSupport({
    canonicalBuildingType: "education_university",
    label: "University",
  }),
  "education:kindergarten": betaProjectGraphSupport({
    canonicalBuildingType: "education_kindergarten",
    label: "Kindergarten",
  }),
});

function registryKey(categoryId, subtypeId) {
  return `${String(categoryId || "").trim()}:${String(subtypeId || "").trim()}`;
}

function labelFor(categoryId, subtypeId) {
  const subType = getSubTypeById(categoryId, subtypeId);
  return subType?.label || subtypeId || categoryId || "Project type";
}

function createDisabledEntry(category, subType) {
  const key = registryKey(category.id, subType.id);
  const override = DISABLED_REASONS[key];
  return {
    categoryId: category.id,
    subtypeId: subType.id,
    label: subType.label,
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.DISABLED,
    canonicalBuildingType: null,
    route: null,
    enabledInUi: false,
    reason: override?.reason || DEFAULT_DISABLED_MESSAGE,
    message: override?.message || DEFAULT_DISABLED_MESSAGE,
    programmeTemplateKey: null,
    badgeLabel: override?.badgeLabel || "Experimental/off",
  };
}

function createResidentialEntry(category, subType) {
  const supported = isSupportedResidentialV2SubType(subType.id);
  if (!supported) {
    return {
      ...createDisabledEntry(category, subType),
      reason: "Outside the supported UK Residential V2 production subtype set.",
      message:
        "UK Residential V2 currently supports selected low-rise residential subtypes only.",
    };
  }

  return {
    categoryId: category.id,
    subtypeId: subType.id,
    label: subType.label,
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.PRODUCTION,
    canonicalBuildingType:
      RESIDENTIAL_CANONICAL_BY_SUBTYPE[subType.id] || "dwelling",
    route: PROJECT_TYPE_ROUTES.RESIDENTIAL_V2,
    enabledInUi: true,
    reason: "Supported by the production UK Residential V2 route.",
    message: "Production Residential V2 support is enabled.",
    programmeTemplateKey: subType.id,
    badgeLabel: "Residential V2",
  };
}

function buildRegistry() {
  const entries = [];
  Object.values(BUILDING_CATEGORIES).forEach((category) => {
    category.subTypes.forEach((subType) => {
      const key = registryKey(category.id, subType.id);
      if (category.id === "residential") {
        entries.push(createResidentialEntry(category, subType));
        return;
      }
      const override = ENABLED_OVERRIDES[key];
      if (override) {
        entries.push({
          categoryId: category.id,
          subtypeId: subType.id,
          label: subType.label,
          ...override,
        });
        return;
      }
      entries.push(createDisabledEntry(category, subType));
    });
  });
  return entries;
}

export const PROJECT_TYPE_SUPPORT_REGISTRY = Object.freeze(buildRegistry());

const PROJECT_TYPE_SUPPORT_BY_KEY = Object.freeze(
  Object.fromEntries(
    PROJECT_TYPE_SUPPORT_REGISTRY.map((entry) => [
      registryKey(entry.categoryId, entry.subtypeId),
      Object.freeze({ ...entry }),
    ]),
  ),
);

export function getProjectTypeSupport(categoryId, subtypeId) {
  const key = registryKey(categoryId, subtypeId);
  const entry = PROJECT_TYPE_SUPPORT_BY_KEY[key];
  if (entry) return entry;

  return {
    categoryId: categoryId || null,
    subtypeId: subtypeId || null,
    label: labelFor(categoryId, subtypeId),
    supportStatus: PROJECT_TYPE_SUPPORT_STATUS.DISABLED,
    canonicalBuildingType: null,
    route: null,
    enabledInUi: false,
    reason: DEFAULT_DISABLED_MESSAGE,
    message: DEFAULT_DISABLED_MESSAGE,
    programmeTemplateKey: null,
    badgeLabel: "Experimental/off",
  };
}

export function getProjectTypeSupportForDetails(projectDetails = {}) {
  return getProjectTypeSupport(
    projectDetails.category || projectDetails.buildingCategory,
    projectDetails.subType ||
      projectDetails.buildingSubType ||
      projectDetails.program,
  );
}

export function isProjectTypeEnabled(categoryId, subtypeId) {
  const support = getProjectTypeSupport(categoryId, subtypeId);
  return support.enabledInUi === true && Boolean(support.route);
}

export function isResidentialV2ProjectType(categoryId, subtypeId) {
  return (
    getProjectTypeSupport(categoryId, subtypeId).route ===
    PROJECT_TYPE_ROUTES.RESIDENTIAL_V2
  );
}

export function getCategorySupportSummary(categoryId) {
  const entries = PROJECT_TYPE_SUPPORT_REGISTRY.filter(
    (entry) => entry.categoryId === categoryId,
  );
  const enabledEntries = entries.filter((entry) => entry.enabledInUi === true);
  return {
    categoryId,
    entries,
    enabledEntries,
    enabledCount: enabledEntries.length,
    totalCount: entries.length,
    enabledInUi: enabledEntries.length > 0,
    supportStatuses: [...new Set(entries.map((entry) => entry.supportStatus))],
    message:
      enabledEntries.length > 0
        ? `${enabledEntries.length} supported project type${enabledEntries.length === 1 ? "" : "s"} available.`
        : DEFAULT_DISABLED_MESSAGE,
  };
}

export function buildProjectTypeSupportMetadata(support) {
  const resolved = support || getProjectTypeSupport(null, null);
  return {
    categoryId: resolved.categoryId,
    subtypeId: resolved.subtypeId,
    label: resolved.label,
    supportStatus: resolved.supportStatus,
    canonicalBuildingType: resolved.canonicalBuildingType,
    route: resolved.route,
    enabledInUi: resolved.enabledInUi,
    reason: resolved.reason,
    message: resolved.message,
    programmeTemplateKey: resolved.programmeTemplateKey,
  };
}

export default {
  PROJECT_TYPE_SUPPORT_STATUS,
  PROJECT_TYPE_ROUTES,
  PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION,
  PROJECT_TYPE_SUPPORT_REGISTRY,
  getProjectTypeSupport,
  getProjectTypeSupportForDetails,
  getCategorySupportSummary,
  isProjectTypeEnabled,
  isResidentialV2ProjectType,
  buildProjectTypeSupportMetadata,
};
