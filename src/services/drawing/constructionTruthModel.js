function normalizeToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

export const ROOF_EXPLICIT_PRIMITIVE_FAMILIES = [
  "roof_plane",
  "roof_edge",
  "eave",
  "ridge",
  "parapet",
  "roof_break",
  "dormer_attachment",
  "hip",
  "valley",
];

export const ROOF_STRUCTURAL_EDGE_FAMILIES = [
  "roof_edge",
  "eave",
  "ridge",
  "parapet",
  "roof_break",
  "hip",
  "valley",
];

export const FOUNDATION_EXPLICIT_TYPES = [
  "continuous_footing",
  "perimeter_footing",
  "strip_footing_zone",
  "foundation_zone",
  "base_wall_footing",
  "wall_footing",
];

export const BASE_CONDITION_EXPLICIT_TYPES = [
  "ground_line",
  "plinth_line",
  "slab_ground_interface",
  "grade_break",
  "step_line",
  "base_wall_condition",
];

export function isExplicitRoofPrimitiveFamily(family = "") {
  return ROOF_EXPLICIT_PRIMITIVE_FAMILIES.includes(normalizeToken(family));
}

export function isStructuralRoofPrimitiveFamily(family = "") {
  return ROOF_STRUCTURAL_EDGE_FAMILIES.includes(normalizeToken(family));
}

export function isExplicitFoundationType(type = "") {
  return FOUNDATION_EXPLICIT_TYPES.includes(normalizeToken(type));
}

export function isExplicitGroundConditionType(type = "") {
  return BASE_CONDITION_EXPLICIT_TYPES.includes(normalizeToken(type));
}

export function normalizeRoofPrimitiveSupportMode(primitive = {}) {
  const explicitMode = normalizeToken(
    primitive.support_mode || primitive.supportMode,
  );
  if (explicitMode) {
    return explicitMode;
  }

  const family = normalizeToken(
    primitive.primitive_family || primitive.primitiveFamily || primitive.type,
  );
  if (isExplicitRoofPrimitiveFamily(family)) {
    return "explicit_generated";
  }
  if (
    family.includes("derived_roof_profile") ||
    family.includes("roof_profile")
  ) {
    return "derived_profile_only";
  }
  if (family.includes("roof_language")) {
    return "roof_language_only";
  }
  return "derived_profile_only";
}

export function normalizeFoundationSupportMode(foundation = {}) {
  const explicitMode = normalizeToken(
    foundation.support_mode || foundation.supportMode,
  );
  if (explicitMode) {
    return explicitMode;
  }
  if (isExplicitFoundationType(foundation.foundation_type || foundation.type)) {
    return "explicit_ground_primitives";
  }
  return "contextual_ground_relation";
}

export function normalizeBaseConditionSupportMode(baseCondition = {}) {
  const explicitMode = normalizeToken(
    baseCondition.support_mode || baseCondition.supportMode,
  );
  if (explicitMode) {
    return explicitMode;
  }
  if (
    isExplicitGroundConditionType(
      baseCondition.condition_type || baseCondition.type,
    )
  ) {
    return "explicit_ground_primitives";
  }
  return "contextual_ground_relation";
}

export function carriesExplicitConstructionTruth(entry = {}) {
  const supportMode = normalizeToken(entry.support_mode || entry.supportMode);
  if (
    supportMode === "explicit_generated" ||
    supportMode === "explicit_ground_primitives"
  ) {
    return true;
  }
  if (supportMode) {
    return false;
  }

  return (
    isExplicitRoofPrimitiveFamily(entry.primitive_family || entry.type) ||
    isExplicitFoundationType(entry.foundation_type || entry.type) ||
    isExplicitGroundConditionType(entry.condition_type || entry.type)
  );
}

export function truthBucketFromMode(mode = "missing") {
  const normalized = normalizeToken(mode);
  if (
    normalized === "explicit_generated" ||
    normalized === "explicit_ground_primitives"
  ) {
    return "direct";
  }
  if (normalized === "contextual_ground_relation") {
    return "contextual";
  }
  if (
    normalized === "derived_profile_only" ||
    normalized === "derived_perimeter" ||
    normalized === "roof_language_only"
  ) {
    return "derived";
  }
  return "unsupported";
}

export function resolveEntryTruthState(entry = {}, isDirect = false) {
  if (!entry) {
    return "none";
  }
  if (isDirect && carriesExplicitConstructionTruth(entry)) {
    return "direct";
  }

  const mode = normalizeToken(entry.support_mode || entry.supportMode);
  const bucket = truthBucketFromMode(mode);
  if (bucket === "contextual") {
    return "contextual";
  }
  if (bucket === "derived") {
    return "derived";
  }
  return "contextual";
}

export function normalizeSupportModes(entries = [], kind = "roof") {
  return unique(
    (entries || [])
      .map((entry) =>
        kind === "roof"
          ? normalizeRoofPrimitiveSupportMode(entry)
          : kind === "foundation"
            ? normalizeFoundationSupportMode(entry)
            : normalizeBaseConditionSupportMode(entry),
      )
      .filter(Boolean),
  );
}

export function countPrimitiveFamilies(entries = [], families = []) {
  return (entries || []).filter((entry) =>
    families.includes(
      normalizeToken(
        entry.primitive_family ||
          entry.foundation_type ||
          entry.condition_type ||
          entry.type,
      ),
    ),
  ).length;
}

export function countExplicitGroundRelationPrimitives(baseConditions = []) {
  return (baseConditions || []).filter((entry) => {
    const supportMode = normalizeBaseConditionSupportMode(entry);
    const conditionType = normalizeToken(entry.condition_type || entry.type);
    return (
      supportMode === "explicit_ground_primitives" ||
      (supportMode === "contextual_ground_relation" &&
        conditionType === "base_wall_condition")
    );
  }).length;
}

export function summarizeCanonicalRoofTruth({
  roofPrimitives = [],
  roof = {},
  style = {},
} = {}) {
  const families = unique(
    (roofPrimitives || [])
      .map((entry) => entry.primitive_family)
      .filter(Boolean),
  );
  const supportModes = normalizeSupportModes(roofPrimitives, "roof");
  const explicitGeneratedCount = (roofPrimitives || []).filter((entry) =>
    carriesExplicitConstructionTruth({
      ...entry,
      support_mode: normalizeRoofPrimitiveSupportMode(entry),
    }),
  ).length;

  let supportMode = "missing";
  if (
    supportModes.includes("explicit_generated") ||
    (supportModes.length === 0 && explicitGeneratedCount > 0)
  ) {
    supportMode = "explicit_generated";
  } else if (
    supportModes.includes("derived_profile_only") ||
    roof?.polygon?.length ||
    roof?.bbox
  ) {
    supportMode = "derived_profile_only";
  } else if (
    supportModes.includes("roof_language_only") ||
    roof?.type ||
    style?.roof_type
  ) {
    supportMode = "roof_language_only";
  }

  return {
    support_mode: supportMode,
    primitive_count: Number((roofPrimitives || []).length || 0),
    explicit_generated_count: explicitGeneratedCount,
    primitive_families: families,
    plane_count: countPrimitiveFamilies(roofPrimitives, ["roof_plane"]),
    ridge_count: countPrimitiveFamilies(roofPrimitives, ["ridge"]),
    edge_count: countPrimitiveFamilies(roofPrimitives, [
      "roof_edge",
      "eave",
      "ridge",
      "parapet",
      "roof_break",
      "hip",
      "valley",
    ]),
    parapet_count: countPrimitiveFamilies(roofPrimitives, ["parapet"]),
    roof_break_count: countPrimitiveFamilies(roofPrimitives, ["roof_break"]),
    dormer_attachment_count: countPrimitiveFamilies(roofPrimitives, [
      "dormer_attachment",
    ]),
    hip_count: countPrimitiveFamilies(roofPrimitives, ["hip"]),
    valley_count: countPrimitiveFamilies(roofPrimitives, ["valley"]),
  };
}

export function summarizeCanonicalFoundationTruth({
  projectGeometry = {},
  foundations = [],
  baseConditions = [],
} = {}) {
  const conditionTypes = unique(
    (baseConditions || []).map((entry) => entry.condition_type).filter(Boolean),
  );
  const foundationTypes = unique(
    (foundations || []).map((entry) => entry.foundation_type).filter(Boolean),
  );
  const supportModes = [
    ...normalizeSupportModes(foundations, "foundation"),
    ...normalizeSupportModes(baseConditions, "base"),
  ];
  const explicitGroundRelationCount =
    countExplicitGroundRelationPrimitives(baseConditions);

  let supportMode = "missing";
  if (
    explicitGroundRelationCount > 0 ||
    supportModes.includes("explicit_ground_primitives") ||
    ((foundations || []).length > 0 &&
      supportModes.every(
        (entry) => !entry || entry === "explicit_ground_primitives",
      ))
  ) {
    supportMode = "explicit_ground_primitives";
  } else if (
    (baseConditions || []).length > 0 ||
    supportModes.includes("contextual_ground_relation") ||
    supportModes.includes("derived_perimeter") ||
    projectGeometry.walls?.some((wall) => wall.exterior)
  ) {
    supportMode = "contextual_ground_relation";
  }

  return {
    support_mode: supportMode,
    foundation_count: Number((foundations || []).length || 0),
    base_condition_count: Number((baseConditions || []).length || 0),
    foundation_types: foundationTypes,
    condition_types: conditionTypes,
    explicit_ground_relation_count: explicitGroundRelationCount,
    foundation_zone_count: countPrimitiveFamilies(foundations, [
      "foundation_zone",
      "strip_footing_zone",
    ]),
    base_wall_condition_count: countPrimitiveFamilies(baseConditions, [
      "base_wall_condition",
    ]),
  };
}

export function resolveRoofTruthMode({
  roofPrimitives = [],
  roofSummary = {},
  roof = {},
} = {}) {
  const explicitPrimitiveCount = Number((roofPrimitives || []).length || 0);
  const supportModes = normalizeSupportModes(roofPrimitives, "roof");
  if (
    supportModes.includes("explicit_generated") ||
    (supportModes.length === 0 && explicitPrimitiveCount > 0)
  ) {
    return "explicit_generated";
  }
  if (supportModes.includes("derived_profile_only")) {
    return "derived_profile_only";
  }
  if (supportModes.includes("roof_language_only")) {
    return "roof_language_only";
  }
  return (
    normalizeToken(roofSummary.support_mode) ||
    (roof?.type ? "derived_profile_only" : "missing")
  );
}

export function resolveFoundationTruthMode({
  foundations = [],
  baseConditions = [],
  foundationSummary = {},
} = {}) {
  const explicitFoundationCount = Number((foundations || []).length || 0);
  const explicitBaseConditionCount = Number((baseConditions || []).length || 0);
  const supportModes = [
    ...normalizeSupportModes(foundations, "foundation"),
    ...normalizeSupportModes(baseConditions, "base"),
  ];
  const explicitGroundRelationCount =
    countExplicitGroundRelationPrimitives(baseConditions);
  if (
    explicitGroundRelationCount > 0 ||
    supportModes.includes("explicit_ground_primitives") ||
    (supportModes.length === 0 && explicitFoundationCount > 0)
  ) {
    return "explicit_ground_primitives";
  }
  if (
    supportModes.includes("contextual_ground_relation") ||
    supportModes.includes("derived_perimeter") ||
    (supportModes.length === 0 && explicitBaseConditionCount > 0)
  ) {
    return "contextual_ground_relation";
  }
  return normalizeToken(foundationSummary.support_mode) || "missing";
}

export default {
  ROOF_EXPLICIT_PRIMITIVE_FAMILIES,
  ROOF_STRUCTURAL_EDGE_FAMILIES,
  FOUNDATION_EXPLICIT_TYPES,
  BASE_CONDITION_EXPLICIT_TYPES,
  isExplicitRoofPrimitiveFamily,
  isStructuralRoofPrimitiveFamily,
  isExplicitFoundationType,
  isExplicitGroundConditionType,
  normalizeRoofPrimitiveSupportMode,
  normalizeFoundationSupportMode,
  normalizeBaseConditionSupportMode,
  normalizeSupportModes,
  carriesExplicitConstructionTruth,
  resolveEntryTruthState,
  truthBucketFromMode,
  countPrimitiveFamilies,
  countExplicitGroundRelationPrimitives,
  summarizeCanonicalRoofTruth,
  summarizeCanonicalFoundationTruth,
  resolveRoofTruthMode,
  resolveFoundationTruthMode,
};
