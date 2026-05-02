/**
 * Phase 5C — Site boundary response shaping.
 *
 * Pure helpers that turn raw OSM/Overpass elements into the canonical
 * `{ polygon, source, confidence, areaM2, ... }` shape that
 * `propertyBoundaryService.js` already understands. Keeping this in a
 * separate module so the endpoint and tests can import the same
 * normalisation without pulling in fetch/timeout machinery.
 *
 * IMPORTANT — safety contract preserved from PR #60/#62/#63:
 *   - low-confidence results never claim `boundaryAuthoritative: true`
 *   - the existing Intelligent Fallback path stays as the FINAL safety
 *     net (this module only deals with proxy results upstream of that)
 *   - confidence values mirror the bands used by
 *     `assessSiteBoundaryAuthority()` so downstream gating is unchanged
 */

export const PROXY_RESPONSE_SCHEMA_VERSION = "site-boundary-proxy-v1";

export const BOUNDARY_SOURCE = Object.freeze({
  OVERPASS_BUILDING_CONTAINS: "openstreetmap-overpass-building-contains-point",
  OVERPASS_BUILDING_NEAREST: "openstreetmap-overpass-building-nearest",
  OVERPASS_PARCEL_CONTAINS: "openstreetmap-overpass-parcel-contains-point",
  NONE: null,
});

const CONFIDENCE_BY_SOURCE = Object.freeze({
  [BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS]: 0.95,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS]: 0.92,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST]: 0.7,
});

const AUTHORITATIVE_BY_SOURCE = Object.freeze({
  [BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS]: true,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS]: true,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST]: false,
});

// A residential / small-parcel polygon should not exceed this area. Anything
// larger is almost certainly an OSM `landuse=*` district polygon (a whole
// neighbourhood) rather than the legal parcel of the address. Demote those
// candidates to "estimated" and prefer the building-contains polygon.
export const RESIDENTIAL_PARCEL_MAX_M2 = 5000;

// Vertex-count cap mirrors the same heuristic — district polygons frequently
// have 50+ vertices, while typical lot polygons sit well under this.
export const RESIDENTIAL_PARCEL_MAX_VERTICES = 30;

// `landuse` tag values that almost always indicate zoning districts rather
// than legal parcel boundaries. Treat any parcel candidate carrying one of
// these tags as non-authoritative even when it geometrically contains the
// query point.
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
  BUILDING_NEAREST_FALLBACK: "building_nearest_fallback",
  NONE: null,
});

/**
 * Inspect a candidate parcel polygon and decide whether it is plausibly the
 * legal lot boundary or a much larger zoning/landuse district. District
 * polygons routinely cover 20+ ha at a residential address point, which is
 * authoritative *for the district*, not for the parcel — and using one as
 * the site boundary produces wildly incorrect setbacks and areas downstream.
 *
 * Returns `null` when the candidate is plausible, otherwise an
 * `ESTIMATE_REASON` describing the demotion cause.
 */
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
  if (Number.isFinite(areaM2) && areaM2 > RESIDENTIAL_PARCEL_MAX_M2) {
    return ESTIMATE_REASON.PARCEL_OVERSIZED;
  }
  if (vertexCount > RESIDENTIAL_PARCEL_MAX_VERTICES) {
    return ESTIMATE_REASON.PARCEL_TOO_COMPLEX;
  }
  return null;
}

/**
 * Convert a raw Overpass `way` element with embedded `geometry` into
 * the canonical polygon shape `[{ lat, lng }, …]`.
 */
export function extractPolygonFromOverpassWay(element) {
  if (!element || element.type !== "way" || !Array.isArray(element.geometry)) {
    return [];
  }
  const polygon = [];
  for (const node of element.geometry) {
    if (
      Number.isFinite(Number(node?.lat)) &&
      Number.isFinite(Number(node?.lon))
    ) {
      polygon.push({ lat: Number(node.lat), lng: Number(node.lon) });
    }
  }
  return polygon;
}

/**
 * Compute polygon area in square metres using the spherical excess /
 * shoelace approximation good enough for parcel-scale polygons.
 */
export function polygonAreaM2(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  const earthRadiusM = 6_371_008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    sum +=
      toRad(b.lng - a.lng) *
      (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)));
  }
  return Math.abs((sum * earthRadiusM * earthRadiusM) / 2);
}

/**
 * Return true when the polygon contains the given point. Uses the ray-
 * casting algorithm; treats the polygon as closed (does NOT require the
 * caller to repeat the first vertex at the end).
 */
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
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].lng);
    const yi = Number(polygon[i].lat);
    const xj = Number(polygon[j].lng);
    const yj = Number(polygon[j].lat);
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonCentroid(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += Number(p.lat);
    lng += Number(p.lng);
  }
  return { lat: lat / polygon.length, lng: lng / polygon.length };
}

/**
 * Approximate haversine distance in metres for two `{lat,lng}` points.
 */
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

/**
 * Choose the best Overpass `way` element for the given point.
 *
 * Preference order:
 *   1. parcel polygon that contains the point AND passes the lot-plausibility
 *      classifier (small enough, simple enough, not a `landuse=*` district)
 *   2. building polygon that contains the point
 *   3. nearest building polygon (within 25 m of the point) — flagged
 *      non-authoritative so downstream gating treats it as estimated
 *
 * If a parcel candidate contained the point but failed the plausibility
 * classifier, the returned record carries `estimateReason` describing why
 * the parcel was demoted. Callers that still want to see that polygon for
 * map preview can read `demotedParcel`.
 *
 * Returns `{ element, polygon, source, estimateReason?, demotedParcel? }`
 * or null when nothing usable.
 */
export function selectBestOverpassWay({
  buildingElements = [],
  parcelElements = [],
  point,
}) {
  const checkPoint = point;
  let demotedParcel = null;
  let demotedReason = null;

  // 1. parcel containing the point (with plausibility check)
  for (const el of parcelElements) {
    const polygon = extractPolygonFromOverpassWay(el);
    if (polygon.length < 3 || !polygonContainsPoint(polygon, checkPoint)) {
      continue;
    }
    const reason = classifyParcelCandidate({ polygon, element: el });
    if (!reason) {
      return {
        element: el,
        polygon,
        source: BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS,
      };
    }
    // Capture the first demoted parcel so we can flag the reason on the
    // ultimate response even when we fall through to a building polygon.
    if (!demotedParcel) {
      demotedParcel = { element: el, polygon };
      demotedReason = reason;
    }
  }

  // 2. building containing the point
  for (const el of buildingElements) {
    const polygon = extractPolygonFromOverpassWay(el);
    if (polygon.length >= 3 && polygonContainsPoint(polygon, checkPoint)) {
      return {
        element: el,
        polygon,
        source: BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS,
        estimateReason: demotedReason,
        demotedParcel,
      };
    }
  }
  // 3. nearest building within 25 m
  let nearest = null;
  let nearestDistance = Infinity;
  for (const el of buildingElements) {
    const polygon = extractPolygonFromOverpassWay(el);
    if (polygon.length < 3) continue;
    const centroid = polygonCentroid(polygon);
    const d = distanceM(centroid, checkPoint);
    if (d < nearestDistance && d <= 25) {
      nearest = { element: el, polygon };
      nearestDistance = d;
    }
  }
  if (nearest) {
    return {
      element: nearest.element,
      polygon: nearest.polygon,
      source: BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST,
      estimateReason:
        demotedReason || ESTIMATE_REASON.BUILDING_NEAREST_FALLBACK,
      demotedParcel,
    };
  }
  return null;
}

/**
 * Cheap deterministic hash for cache keys — not crypto. Produces a
 * stable hex string for a polygon + source so identical results compare
 * equal across requests.
 */
export function hashBoundaryShape({ polygon, source }) {
  const input = JSON.stringify({
    source,
    polygon: (polygon || []).map((p) => [
      Number(p.lat).toFixed(6),
      Number(p.lng).toFixed(6),
    ]),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Build the canonical proxy response body. Deterministic for a given
 * input — used by both the live endpoint and the test fixtures.
 *
 * @param {object} params
 * @param {Array}  params.polygon      - canonical polygon, may be empty
 * @param {string|null} params.source  - one of BOUNDARY_SOURCE
 * @param {object} [params.osmElement] - the raw way element (for metadata)
 * @param {number} [params.queryRadiusM]
 * @param {boolean} [params.cached]
 * @param {string} [params.now]        - ISO timestamp; defaults to Date.now()
 */
export function buildBoundaryResponse({
  polygon = [],
  source = BOUNDARY_SOURCE.NONE,
  osmElement = null,
  queryRadiusM = 30,
  cached = false,
  now = null,
  estimateReason = null,
  demotedParcel = null,
} = {}) {
  const hasShape = Array.isArray(polygon) && polygon.length >= 3;
  const resolvedSource = hasShape ? source : BOUNDARY_SOURCE.NONE;
  const baseConfidence = hasShape
    ? CONFIDENCE_BY_SOURCE[resolvedSource] || 0
    : 0;
  // When a parcel candidate was demoted to a building polygon, treat the
  // result as estimated even if the building polygon itself is normally
  // authoritative — the user-facing site boundary is no longer the parcel
  // they were promised.
  const isEstimatedByDemotion = Boolean(estimateReason);
  const boundaryAuthoritative =
    hasShape && !isEstimatedByDemotion
      ? AUTHORITATIVE_BY_SOURCE[resolvedSource] === true
      : false;
  const confidence = isEstimatedByDemotion
    ? Math.min(baseConfidence, 0.7)
    : baseConfidence;
  const areaM2 = hasShape ? polygonAreaM2(polygon) : 0;
  const hash = hashBoundaryShape({ polygon, source: resolvedSource });

  return {
    schemaVersion: PROXY_RESPONSE_SCHEMA_VERSION,
    polygon: hasShape ? polygon : null,
    source: resolvedSource,
    confidence,
    boundaryAuthoritative,
    estimateReason: estimateReason || null,
    areaM2: Math.round(areaM2),
    hash,
    cached: Boolean(cached),
    timestamp: now || new Date().toISOString(),
    metadata: {
      osmId: osmElement?.id || null,
      osmType: osmElement?.type || null,
      buildingTag: osmElement?.tags?.building || null,
      landuseTag: osmElement?.tags?.landuse || null,
      addrHousenumber: osmElement?.tags?.["addr:housenumber"] || null,
      addrStreet: osmElement?.tags?.["addr:street"] || null,
      overpassQueryRadiusM: queryRadiusM,
      demotedParcel: demotedParcel
        ? {
            osmId: demotedParcel.element?.id || null,
            landuseTag: demotedParcel.element?.tags?.landuse || null,
            vertexCount: demotedParcel.polygon?.length || 0,
            areaM2: Math.round(polygonAreaM2(demotedParcel.polygon || [])),
          }
        : null,
    },
  };
}

/**
 * Build a "no polygon found" response. Same shape as a successful
 * response so the client never has to branch on `null` vs. object —
 * just on `polygon` being null. Returns a 200 from the endpoint, NOT a
 * 404, because "no boundary" is a valid (negative) result, not an error.
 */
export function buildEmptyResponse({
  reason = "no_polygon_found",
  cached = false,
  now = null,
  queryRadiusM = 30,
} = {}) {
  return {
    schemaVersion: PROXY_RESPONSE_SCHEMA_VERSION,
    polygon: null,
    source: BOUNDARY_SOURCE.NONE,
    confidence: 0,
    boundaryAuthoritative: false,
    estimateReason: null,
    areaM2: 0,
    hash: hashBoundaryShape({ polygon: [], source: null }),
    cached: Boolean(cached),
    timestamp: now || new Date().toISOString(),
    metadata: {
      reason,
      overpassQueryRadiusM: queryRadiusM,
    },
  };
}
