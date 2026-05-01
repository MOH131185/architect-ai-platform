const TWO_STOREY_FAMILY_HOUSE_MIN_AREA_M2 = 140;

const TWO_STOREY_FAMILY_HOUSE_TYPES = new Set([
  "detached",
  "detached-house",
  "dwelling",
  "family-house",
  "house",
  "private-house",
  "single-dwelling",
  "single-family",
  "single-family-house",
]);

const SINGLE_LEVEL_FAMILY_HOUSE_EXCLUSIONS = new Set([
  "annexe",
  "bungalow",
  "cottage",
  "studio",
]);

function normalizePolicyToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstPositiveNumber(values = []) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

export function extractResidentialPolicyAreaM2(input = {}) {
  return firstPositiveNumber([
    input.area,
    input.targetAreaM2,
    input.target_area_m2,
    input.target_gia_m2,
    input.totalAreaM2,
    input.total_area_m2,
    input.giaM2,
    input.floorArea,
    input.programAreaM2,
    input.programme?.area_summary?.gross_internal_area_m2,
    input.programme?.grossInternalAreaM2,
  ]);
}

export function isTwoStoreyFamilyHouseCandidate(input = {}) {
  const tokens = [
    input.subType,
    input.buildingSubType,
    input.building_type,
    input.buildingType,
    input.program,
    input.category,
  ]
    .map(normalizePolicyToken)
    .filter(Boolean);

  if (tokens.some((token) => SINGLE_LEVEL_FAMILY_HOUSE_EXCLUSIONS.has(token))) {
    return false;
  }

  return tokens.some(
    (token) =>
      TWO_STOREY_FAMILY_HOUSE_TYPES.has(token) ||
      (token.includes("house") && !token.includes("apartment")) ||
      token.includes("dwelling"),
  );
}

export function resolveResidentialFloorCountPolicy(
  input = {},
  requestedFloorCount = 1,
  { maxFloors = null } = {},
) {
  const requested = Math.max(1, Math.floor(Number(requestedFloorCount) || 1));
  const cap =
    Number.isFinite(Number(maxFloors)) && Number(maxFloors) > 0
      ? Math.max(1, Math.floor(Number(maxFloors)))
      : null;
  const targetAreaM2 = extractResidentialPolicyAreaM2(input);
  const candidate = isTwoStoreyFamilyHouseCandidate(input);
  const locked = Boolean(input.floorCountLocked || input.levelCountLocked);
  const meetsAreaThreshold =
    Number.isFinite(Number(targetAreaM2)) &&
    Number(targetAreaM2) >= TWO_STOREY_FAMILY_HOUSE_MIN_AREA_M2;
  const blockedByMaxFloors = Boolean(cap && cap < 2);
  const applied =
    !locked &&
    candidate &&
    meetsAreaThreshold &&
    requested < 2 &&
    !blockedByMaxFloors;

  return {
    applied,
    floorCount: applied ? 2 : requested,
    requestedFloorCount: requested,
    minimumFloorCount: applied ? 2 : 1,
    targetAreaM2,
    areaThresholdM2: TWO_STOREY_FAMILY_HOUSE_MIN_AREA_M2,
    candidate,
    locked,
    maxFloors: cap,
    blockedByMaxFloors,
    reason: applied ? "two_storey_family_house_default" : null,
  };
}

export default {
  extractResidentialPolicyAreaM2,
  isTwoStoreyFamilyHouseCandidate,
  resolveResidentialFloorCountPolicy,
};
