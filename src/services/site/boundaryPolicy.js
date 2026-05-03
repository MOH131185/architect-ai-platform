/**
 * Browser-safe site boundary policy helpers.
 *
 * Keep this module free of server-only imports. Frontend services, map UI,
 * tests, and API parity checks can all import these pure helpers without
 * tripping CRA's "outside src" restriction.
 */

export const BOUNDARY_POLICY_VERSION = "site-boundary-policy-v3";

export const RESIDENTIAL_PARCEL_MAX_M2 = 1500;
export const RESIDENTIAL_PARCEL_MAX_VERTICES = 30;
export const RESIDENTIAL_BUILDING_MAX_M2 = 600;

const DISTRICT_LANDUSE_TAGS = Object.freeze(
  new Set([
    "residential",
    "commercial",
    "industrial",
    "retail",
    "education",
    "institutional",
    "religious",
    "recreation_ground",
    "farmland",
    "forest",
    "meadow",
    "village_green",
  ]),
);

export const ESTIMATE_REASON = Object.freeze({
  PARCEL_OVERSIZED: "parcel_oversized",
  PARCEL_LANDUSE_DISTRICT: "parcel_landuse_district",
  PARCEL_TOO_COMPLEX: "parcel_too_complex",
  BUILDING_OVERSIZED: "building_oversized",
  BUILDING_NEAREST_FALLBACK: "building_nearest_fallback",
  NONE: null,
});

function coerceFiniteNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function readBoundaryAreaM2(boundary) {
  if (!boundary || typeof boundary !== "object") {
    return 0;
  }
  return (
    coerceFiniteNumber(boundary.areaM2) ??
    coerceFiniteNumber(boundary.area) ??
    coerceFiniteNumber(boundary.surfaceAreaM2) ??
    coerceFiniteNumber(boundary.surfaceArea) ??
    coerceFiniteNumber(boundary?.metadata?.areaM2) ??
    coerceFiniteNumber(boundary?.metadata?.area) ??
    coerceFiniteNumber(boundary?.metadata?.surfaceAreaM2) ??
    coerceFiniteNumber(boundary?.metadata?.surfaceArea) ??
    0
  );
}

export function normalizeBoundaryAreaFields(boundary) {
  if (!boundary || typeof boundary !== "object") {
    return boundary ?? null;
  }
  const areaM2 = readBoundaryAreaM2(boundary);
  return {
    ...boundary,
    area: areaM2,
    areaM2,
    surfaceAreaM2: areaM2,
  };
}

export function polygonAreaM2(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  const earthRadiusM = 6_371_008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    sum +=
      toRad(Number(b.lng) - Number(a.lng)) *
      (2 + Math.sin(toRad(Number(a.lat))) + Math.sin(toRad(Number(b.lat))));
  }
  return Math.abs((sum * earthRadiusM * earthRadiusM) / 2);
}

export function distanceM(a, b) {
  if (!a || !b) return Infinity;
  const earthRadiusM = 6_371_008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLat = lat2 - lat1;
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

export function polygonContainsPoint(polygon, point) {
  if (
    !Array.isArray(polygon) ||
    polygon.length < 3 ||
    !point ||
    !Number.isFinite(Number(point.lat)) ||
    !Number.isFinite(Number(point.lng))
  ) {
    return false;
  }
  const x = Number(point.lng);
  const y = Number(point.lat);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = Number(polygon[i].lng);
    const yi = Number(polygon[i].lat);
    const xj = Number(polygon[j].lng);
    const yj = Number(polygon[j].lat);
    // Named intermediates so prettier doesn't strip parens we'd need to satisfy
    // eslint-no-mixed-operators. Pure ray-casting algorithm.
    const yiAbove = yi > y;
    const yjAbove = yj > y;
    const straddlesY = yiAbove !== yjAbove;
    const intercept = ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    const intersects = straddlesY && x < intercept;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function classifyBuildingCandidate({ polygon }) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return null;
  }
  const areaM2 = polygonAreaM2(polygon);
  if (Number.isFinite(areaM2) && areaM2 > RESIDENTIAL_BUILDING_MAX_M2) {
    return ESTIMATE_REASON.BUILDING_OVERSIZED;
  }
  return null;
}

export function classifyParcelCandidate({ polygon, element }) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return null;
  }
  const vertexCount = polygon.length;
  const areaM2 = polygonAreaM2(polygon);
  const landuseTag = element?.tags?.landuse;
  if (landuseTag && DISTRICT_LANDUSE_TAGS.has(String(landuseTag))) {
    return ESTIMATE_REASON.PARCEL_LANDUSE_DISTRICT;
  }
  if (Number.isFinite(areaM2) && areaM2 >= RESIDENTIAL_PARCEL_MAX_M2) {
    return ESTIMATE_REASON.PARCEL_OVERSIZED;
  }
  if (vertexCount > RESIDENTIAL_PARCEL_MAX_VERTICES) {
    return ESTIMATE_REASON.PARCEL_TOO_COMPLEX;
  }
  return null;
}

export function polygonPerimeterM(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    perimeter += distanceM(polygon[i], polygon[(i + 1) % polygon.length]);
  }
  return perimeter;
}

export function hashBoundaryShape({
  polygon = [],
  source = null,
  policyVersion = BOUNDARY_POLICY_VERSION,
} = {}) {
  const input = JSON.stringify({
    source,
    policyVersion,
    polygon: (polygon || []).map((p) => [
      Number(p.lat).toFixed(6),
      Number(p.lng).toFixed(6),
    ]),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizePolygon(polygon) {
  if (!Array.isArray(polygon)) return [];
  return polygon
    .map((point) => ({
      lat: Number(point?.lat),
      lng: Number(point?.lng),
    }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function orientation(a, b, c) {
  const value =
    (Number(b.lng) - Number(a.lng)) * (Number(c.lat) - Number(b.lat)) -
    (Number(b.lat) - Number(a.lat)) * (Number(c.lng) - Number(b.lng));
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    Math.min(Number(a.lng), Number(c.lng)) <= Number(b.lng) + 1e-12 &&
    Number(b.lng) <= Math.max(Number(a.lng), Number(c.lng)) + 1e-12 &&
    Math.min(Number(a.lat), Number(c.lat)) <= Number(b.lat) + 1e-12 &&
    Number(b.lat) <= Math.max(Number(a.lat), Number(c.lat)) + 1e-12
  );
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

export function validateBoundaryPolygonForManualVerification(polygon) {
  const normalized = normalizePolygon(polygon);
  const warnings = [];
  if (normalized.length < 3) {
    warnings.push("Manual boundary needs at least 3 valid points.");
    return {
      valid: false,
      isSelfIntersecting: false,
      reason: "too_few_points",
      warnings,
      polygon: normalized,
    };
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const a1 = normalized[i];
    const a2 = normalized[(i + 1) % normalized.length];
    for (let j = i + 1; j < normalized.length; j += 1) {
      const adjacent =
        j === i ||
        j === (i + 1) % normalized.length ||
        i === (j + 1) % normalized.length;
      if (adjacent) continue;
      const b1 = normalized[j];
      const b2 = normalized[(j + 1) % normalized.length];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        warnings.push("Manual boundary is self-intersecting.");
        return {
          valid: false,
          isSelfIntersecting: true,
          reason: "self_intersecting",
          warnings,
          polygon: normalized,
        };
      }
    }
  }

  const areaM2 = polygonAreaM2(normalized);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    warnings.push("Manual boundary area must be greater than zero.");
    return {
      valid: false,
      isSelfIntersecting: false,
      reason: "zero_area",
      warnings,
      polygon: normalized,
    };
  }

  return {
    valid: true,
    isSelfIntersecting: false,
    reason: null,
    warnings,
    polygon: normalized,
  };
}

export function buildManualVerifiedBoundary({
  polygon,
  metrics = null,
  validation = null,
  geoJSON = null,
  primaryFrontEdge = null,
} = {}) {
  const normalizedValidation =
    validation?.valid === true && Array.isArray(polygon)
      ? {
          valid: true,
          isSelfIntersecting: Boolean(validation.isSelfIntersecting),
          reason: null,
          warnings: Array.isArray(validation.warnings)
            ? validation.warnings
            : [],
          polygon: normalizePolygon(polygon),
        }
      : validateBoundaryPolygonForManualVerification(polygon);
  const normalizedPolygon = normalizedValidation.polygon;

  if (!normalizedValidation.valid || normalizedPolygon.length < 3) {
    // PR-C re-review blocker 1: include explicit manualVerified=false +
    // clearManualVerified=true so parents that previously saved a
    // manual_verified boundary know to drop it from authoritative state
    // when the polygon is cleared, becomes invalid, or self-intersects.
    return {
      polygon: normalizedPolygon,
      areaM2: 0,
      area: 0,
      surfaceAreaM2: 0,
      perimeterM: 0,
      hash: null,
      boundaryAuthoritative: false,
      boundarySource: "manual_invalid",
      source: "manual_invalid",
      boundaryConfidence: 0,
      confidence: 0,
      estimateReason: normalizedValidation.reason || "manual_boundary_invalid",
      estimatedOnly: true,
      manualVerified: false,
      clearManualVerified: true,
      reason: "manual_boundary_invalid_or_cleared",
      policyVersion: BOUNDARY_POLICY_VERSION,
      invalid: true,
      validation: normalizedValidation,
      warnings: normalizedValidation.warnings,
    };
  }

  const areaM2 =
    coerceFiniteNumber(metrics?.areaM2) ??
    coerceFiniteNumber(metrics?.area?.value) ??
    coerceFiniteNumber(metrics?.area) ??
    polygonAreaM2(normalizedPolygon);
  const perimeterM =
    coerceFiniteNumber(metrics?.perimeterM) ??
    coerceFiniteNumber(metrics?.perimeter?.value) ??
    coerceFiniteNumber(metrics?.perimeter) ??
    polygonPerimeterM(normalizedPolygon);

  return {
    polygon: normalizedPolygon,
    areaM2,
    area: areaM2,
    surfaceAreaM2: areaM2,
    perimeterM,
    hash: hashBoundaryShape({
      polygon: normalizedPolygon,
      source: "manual_verified",
    }),
    boundaryAuthoritative: true,
    boundarySource: "manual_verified",
    source: "manual_verified",
    boundaryConfidence: 1,
    confidence: 1,
    estimateReason: null,
    estimatedOnly: false,
    manualVerified: true,
    clearManualVerified: false,
    policyVersion: BOUNDARY_POLICY_VERSION,
    geoJSON,
    primaryFrontEdge,
    validation: {
      ...normalizedValidation,
      warnings: normalizedValidation.warnings || [],
    },
    warnings: normalizedValidation.warnings || [],
  };
}

export default {
  BOUNDARY_POLICY_VERSION,
  ESTIMATE_REASON,
  RESIDENTIAL_PARCEL_MAX_M2,
  RESIDENTIAL_PARCEL_MAX_VERTICES,
  RESIDENTIAL_BUILDING_MAX_M2,
  classifyParcelCandidate,
  classifyBuildingCandidate,
  polygonAreaM2,
  polygonContainsPoint,
  distanceM,
  polygonPerimeterM,
  hashBoundaryShape,
  normalizeBoundaryAreaFields,
  readBoundaryAreaM2,
  validateBoundaryPolygonForManualVerification,
  buildManualVerifiedBoundary,
};
