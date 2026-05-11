import { getProjectTypeSupport } from "./projectTypeSupportRegistry.js";
import { levelName } from "./levelUtils.js";
import { syncProgramToFloorCount } from "./floorCountAuthority.js";

const DEFAULT_NON_RESIDENTIAL_ROWS = Object.freeze([
  ["Arrival and reception", "arrival", "public", 0.1, 0],
  ["Primary programme space", "primary", "semi_public", 0.34, 0],
  ["Flexible support space", "support", "semi_public", 0.16, "upper"],
  ["Staff and administration", "admin", "private", 0.12, "upper"],
  ["Storage and back-of-house", "service", "service", 0.08, 0],
  ["Plant and services", "plant", "service", 0.06, "upper"],
  ["WCs and welfare", "welfare", "service", 0.05, 0],
  ["Circulation and vertical core", "circulation", "circulation", 0.09, "all"],
]);

const PROGRAMME_ROWS_BY_TYPE = Object.freeze({
  office_studio: [
    ["Reception and client waiting", "arrival", "public", 0.08, 0],
    ["Open office studio", "workplace", "workplace", 0.34, "all"],
    ["Meeting rooms", "meeting", "semi_public", 0.12, "all"],
    ["Focus rooms and phone booths", "focus", "private", 0.06, "upper"],
    ["Staff kitchen and breakout", "amenity", "semi_public", 0.08, "upper"],
    ["Print, store and IT", "support", "service", 0.06, "upper"],
    ["WCs and lockers", "welfare", "service", 0.05, "all"],
    ["Plant and risers", "plant", "service", 0.05, "upper"],
    ["Circulation and stair core", "circulation", "circulation", 0.16, "all"],
  ],
  clinic: [
    ["Reception and records", "arrival", "public", 0.08, 0],
    ["Waiting area", "waiting", "public", 0.1, 0],
    ["Consult rooms", "consult", "clinical", 0.24, "all"],
    ["Treatment rooms", "treatment", "clinical", 0.14, "all"],
    ["Clean and dirty utility", "clinical_support", "service", 0.08, "upper"],
    ["Staff base and admin", "admin", "private", 0.1, "upper"],
    ["Accessible WCs", "welfare", "service", 0.06, 0],
    ["Storage and plant", "plant", "service", 0.08, "upper"],
    ["Clinical circulation", "circulation", "circulation", 0.12, "all"],
  ],
  hospital: [
    ["Admissions and reception", "arrival", "public", 0.07, 0],
    ["Outpatient assessment", "outpatient", "clinical", 0.13, 0],
    ["Diagnostics", "diagnostics", "clinical", 0.11, 0],
    ["Ward and day rooms", "ward", "clinical", 0.25, "upper"],
    ["Treatment suites", "treatment", "clinical", 0.11, "upper"],
    [
      "Clinical support and pharmacy",
      "clinical_support",
      "service",
      0.09,
      "upper",
    ],
    ["Staff and administration", "admin", "private", 0.08, "upper"],
    ["Plant and logistics", "plant", "service", 0.07, "upper"],
    [
      "Hospital circulation and lifts",
      "circulation",
      "circulation",
      0.09,
      "all",
    ],
  ],
  education_studio: [
    ["Entrance and administration", "arrival", "public", 0.08, 0],
    ["Classrooms", "classroom", "teaching", 0.34, "all"],
    ["Library and resource space", "resource", "teaching", 0.1, "upper"],
    ["Assembly and multipurpose hall", "assembly", "semi_public", 0.14, 0],
    ["Dining and kitchen support", "dining", "service", 0.1, 0],
    ["Staff workroom", "staff", "private", 0.06, "upper"],
    ["WCs and storage", "welfare", "service", 0.08, "all"],
    ["Plant and services", "plant", "service", 0.04, "upper"],
    ["Learning circulation", "circulation", "circulation", 0.06, "all"],
  ],
  commercial_retail: [
    ["Shopfront and entrance", "arrival", "public", 0.06, 0],
    ["Sales floor", "sales", "public", 0.46, 0],
    [
      "Fitting or consultation area",
      "customer_support",
      "semi_public",
      0.08,
      0,
    ],
    ["Checkout and customer service", "checkout", "public", 0.06, 0],
    ["Stockroom", "stock", "service", 0.14, "upper"],
    ["Staff room and office", "staff", "private", 0.06, "upper"],
    ["Loading and refuse", "logistics", "service", 0.06, 0],
    ["WCs and circulation", "circulation", "circulation", 0.08, "all"],
  ],
  commercial_mixed_use: [
    ["Public lobby", "arrival", "public", 0.07, 0],
    ["Retail or active frontage", "retail", "public", 0.2, 0],
    [
      "Workplace or community floorspace",
      "workplace",
      "semi_public",
      0.25,
      "all",
    ],
    ["Flexible studio units", "studio", "semi_public", 0.14, "upper"],
    ["Shared amenity", "amenity", "semi_public", 0.08, "upper"],
    ["Back-of-house and stores", "service", "service", 0.08, 0],
    ["Plant and services", "plant", "service", 0.06, "upper"],
    ["Mixed-use circulation core", "circulation", "circulation", 0.12, "all"],
  ],
  commercial_shopping_mall: [
    ["Main entrance mall", "arrival", "public", 0.08, 0],
    ["Anchor retail", "retail", "public", 0.24, 0],
    ["Inline retail units", "retail", "public", 0.28, "all"],
    ["Food and seating court", "food", "public", 0.1, "upper"],
    ["Service corridor and loading", "logistics", "service", 0.1, 0],
    ["Management and security", "admin", "private", 0.04, "upper"],
    ["WCs and parent room", "welfare", "service", 0.06, "all"],
    [
      "Mall circulation and vertical links",
      "circulation",
      "circulation",
      0.1,
      "all",
    ],
  ],
  healthcare_dental: [
    ["Reception and waiting", "arrival", "public", 0.16, 0],
    ["Dental surgeries", "surgery", "clinical", 0.3, "all"],
    [
      "Decontamination suite",
      "decontamination",
      "clinical_support",
      0.1,
      "upper",
    ],
    ["Imaging room", "imaging", "clinical", 0.08, 0],
    ["Clean store and lab bench", "clinical_support", "service", 0.08, "upper"],
    ["Staff and admin", "admin", "private", 0.08, "upper"],
    ["Accessible WC", "welfare", "service", 0.05, 0],
    ["Plant and dental services", "plant", "service", 0.05, "upper"],
    ["Clinical circulation", "circulation", "circulation", 0.1, "all"],
  ],
  healthcare_laboratory: [
    ["Reception and sample drop-off", "arrival", "public", 0.06, 0],
    ["Wet laboratory", "lab", "technical", 0.3, "all"],
    ["Dry laboratory", "lab", "technical", 0.18, "upper"],
    ["Specimen processing", "processing", "technical", 0.12, 0],
    ["Clean stores and cold room", "support", "service", 0.1, "upper"],
    ["Write-up and admin", "admin", "private", 0.08, "upper"],
    ["Welfare and changing", "welfare", "service", 0.06, 0],
    ["Plant and extraction", "plant", "service", 0.06, "upper"],
    ["Laboratory circulation", "circulation", "circulation", 0.04, "all"],
  ],
  education_university: [
    ["Arrival and student services", "arrival", "public", 0.06, 0],
    ["Teaching rooms", "teaching", "teaching", 0.24, "all"],
    ["Lecture theatre", "lecture", "teaching", 0.14, 0],
    ["Research studios or labs", "research", "technical", 0.16, "upper"],
    ["Library and study commons", "resource", "semi_public", 0.12, "upper"],
    ["Staff offices", "staff", "private", 0.08, "upper"],
    ["Cafe and student amenity", "amenity", "public", 0.08, 0],
    ["Stores, WCs and plant", "service", "service", 0.08, "all"],
    ["Academic circulation", "circulation", "circulation", 0.04, "all"],
  ],
  education_kindergarten: [
    ["Secure arrival and reception", "arrival", "public", 0.08, 0],
    ["Early-years play rooms", "classroom", "teaching", 0.36, 0],
    ["Nap and quiet room", "quiet", "private", 0.1, 0],
    ["Dining and food prep", "dining", "service", 0.1, 0],
    ["Staff and admin", "staff", "private", 0.08, "upper"],
    ["Child WCs and changing", "welfare", "service", 0.1, 0],
    ["Stores and buggy park", "storage", "service", 0.06, 0],
    ["Plant and circulation", "circulation", "circulation", 0.12, "all"],
  ],
});

const FAMILY_TEMPLATE_ALIASES = Object.freeze({
  hospitality_hotel: "hospitality_hotel",
  hospitality_resort: "hospitality_hotel",
  hospitality_guest_house: "hospitality_hotel",
  industrial_warehouse: "industrial_warehouse",
  industrial_manufacturing: "industrial_warehouse",
  industrial_workshop: "industrial_warehouse",
  cultural_museum: "education_studio",
  cultural_library: "education_studio",
  cultural_theatre: "education_studio",
  government_town_hall: "office_studio",
  government_police_station: "office_studio",
  government_fire_station: "office_studio",
  religious_mosque: "education_studio",
  religious_church: "education_studio",
  religious_temple: "education_studio",
  recreation_sports_center: "education_studio",
  recreation_gym: "education_studio",
  recreation_pool: "education_studio",
});

const PROGRAMME_GUIDANCE_BY_TYPE = Object.freeze({
  clinic:
    "Include reception, waiting, consult/treatment rooms, clinical support, staff/admin, storage, clean/dirty utility, toilets, plant, and circulation.",
  hospital:
    "Include reception/admissions, outpatient or emergency care, diagnostics, wards, clinical support, staff/admin, logistics, plant, toilets, and circulation.",
  office_studio:
    "Include reception, open office, meeting rooms, focus rooms, shared support, staff amenities, storage, plant, toilets, and circulation.",
  education_studio:
    "Include classrooms, admin, staff areas, library or resource space, assembly or multipurpose space, dining/support, toilets, storage, plant, and circulation.",
  commercial_retail:
    "Include sales floor, shopfront, checkout, fitting/customer support, stockroom, staff support, loading, toilets, plant, and circulation.",
  commercial_mixed_use:
    "Include active ground-floor frontage, public lobby, upper workplace/community space, shared amenity, service/back-of-house, plant, and a separated circulation core.",
  commercial_shopping_mall:
    "Include mall concourse, anchor and inline retail, food court, management/security, loading/service corridor, toilets, plant, and vertical circulation.",
  healthcare_dental:
    "Include reception, waiting, dental surgeries, imaging, decontamination, clean storage, staff/admin, accessible toilets, plant, and circulation.",
  healthcare_laboratory:
    "Include reception/drop-off, wet and dry labs, specimen processing, clean stores, write-up/admin, welfare/changing, extraction plant, and circulation.",
  education_university:
    "Include teaching rooms, lecture space, research/studio or lab space, library/study commons, student services, staff offices, amenity, toilets, plant, and circulation.",
  education_kindergarten:
    "Include secure arrival, play rooms, quiet/nap space, dining/prep, child WCs/changing, staff/admin, buggy/storage, plant, and circulation.",
});

function resolveTemplateRows(canonicalBuildingType) {
  return (
    PROGRAMME_ROWS_BY_TYPE[canonicalBuildingType] ||
    PROGRAMME_ROWS_BY_TYPE[FAMILY_TEMPLATE_ALIASES[canonicalBuildingType]] ||
    DEFAULT_NON_RESIDENTIAL_ROWS
  );
}

function assignTemplateLevel(levelHint, rowIndex, floorCount) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  if (levelHint === "all") {
    return rowIndex % safeFloorCount;
  }
  if (levelHint === "upper") {
    return safeFloorCount > 1 ? 1 + (rowIndex % (safeFloorCount - 1)) : 0;
  }
  const numeric = Number(levelHint);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(safeFloorCount - 1, Math.floor(numeric)));
  }
  return 0;
}

function normalizeRatios(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row[3] || 0), 0);
  if (total <= 0) return rows.map(() => 1 / rows.length);
  return rows.map((row) => Number(row[3] || 0) / total);
}

export function getProgrammeGuidanceForProjectType(canonicalBuildingType) {
  return (
    PROGRAMME_GUIDANCE_BY_TYPE[canonicalBuildingType] ||
    "Put public and high-footfall spaces on Ground, with support, staff, teaching, workplace, clinical, logistics, plant, and circulation spaces distributed logically across the remaining levels."
  );
}

export function generateDeterministicProgramSpaces({
  projectDetails = {},
  projectTypeSupport = null,
  floorCount = 1,
  targetAreaM2 = null,
  source = "deterministic_project_graph_template",
} = {}) {
  const support =
    projectTypeSupport ||
    getProjectTypeSupport(projectDetails.category, projectDetails.subType);
  if (support?.enabledInUi !== true || !support?.route) {
    const err = new Error(
      support?.message ||
        "This project type is not enabled for production generation.",
    );
    err.code = "PROJECT_TYPE_UNSUPPORTED";
    throw err;
  }

  const target = Math.max(
    1,
    Number(targetAreaM2 ?? projectDetails.area ?? projectDetails.totalAreaM2) ||
      1,
  );
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  const canonicalBuildingType =
    support.canonicalBuildingType ||
    projectDetails.canonicalBuildingType ||
    projectDetails.program ||
    projectDetails.subType ||
    projectDetails.category ||
    "building";
  const rows = resolveTemplateRows(canonicalBuildingType);
  const ratios = normalizeRatios(rows);
  let allocated = 0;
  const rawSpaces = rows.map(
    ([name, type, category, _ratio, levelHint], index) => {
      const isLast = index === rows.length - 1;
      const area = isLast
        ? Math.max(1, Math.round((target - allocated) * 10) / 10)
        : Math.max(1, Math.round(target * ratios[index] * 10) / 10);
      allocated += area;
      const levelIndex = assignTemplateLevel(levelHint, index, safeFloorCount);
      return {
        id: `space_${canonicalBuildingType}_${index + 1}`,
        name,
        label: name,
        area,
        count: 1,
        type,
        category,
        spaceType: type,
        level: levelName(levelIndex),
        levelIndex,
        level_index: levelIndex,
        source,
      };
    },
  );

  const syncResult = syncProgramToFloorCount(rawSpaces, safeFloorCount, {
    buildingType: canonicalBuildingType,
    projectDetails,
  });
  const spaces = syncResult.spaces.map((space, index) => ({
    ...space,
    id: space.id || `space_${canonicalBuildingType}_${index + 1}`,
    name: String(space.name || space.label || `Space ${index + 1}`),
    label: String(space.label || space.name || `Space ${index + 1}`),
    area: Math.max(0, Number(space.area || 0)),
    count: Math.max(1, Number(space.count || 1)),
    type: space.type || space.spaceType || space.category || space.name,
    category: space.category || space.type || space.spaceType || space.name,
    spaceType: space.spaceType || space.type || space.category || space.name,
  }));
  spaces._calculatedFloorCount = syncResult.spaces._calculatedFloorCount;
  spaces._floorMetrics = syncResult.spaces._floorMetrics;
  return {
    spaces,
    warnings: syncResult.warnings,
    source,
    canonicalBuildingType,
  };
}

export default {
  generateDeterministicProgramSpaces,
  getProgrammeGuidanceForProjectType,
};
