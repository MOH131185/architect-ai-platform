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
export const BOUNDARY_POLICY_VERSION = "site-boundary-policy-v5";

export const BOUNDARY_SOURCE = Object.freeze({
  // Digital Land's real-time `title-boundary` API (republished HMLR
  // INSPIRE polygons). Highest authority — live, daily-refreshed, the
  // authoritative legal lot boundary recorded by the Land Registry.
  // See `digitalLandTitleBoundaryClient.js`.
  DIGITAL_LAND_TITLE_BOUNDARY: "digital-land-title-boundary-contains-point",
  // HM Land Registry INSPIRE Index Polygons via offline-converted
  // fixtures under `inspireData/`. Same data as Digital Land but
  // bundled — used as a fallback if the live API is unavailable.
  INSPIRE_PARCEL_CONTAINS: "hm-land-registry-inspire-parcel-contains-point",
  OVERPASS_BUILDING_CONTAINS: "openstreetmap-overpass-building-contains-point",
  OVERPASS_BUILDING_NEAREST: "openstreetmap-overpass-building-nearest",
  OVERPASS_PARCEL_CONTAINS: "openstreetmap-overpass-parcel-contains-point",
  NONE: null,
});

const CONFIDENCE_BY_SOURCE = Object.freeze({
  // Digital Land's live API beats every other source because it is the
  // current, refreshed legal-lot record straight from HMLR.
  [BOUNDARY_SOURCE.DIGITAL_LAND_TITLE_BOUNDARY]: 0.99,
  // INSPIRE fixture is the same data, just stale at fixture-build time.
  [BOUNDARY_SOURCE.INSPIRE_PARCEL_CONTAINS]: 0.98,
  [BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS]: 0.95,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS]: 0.92,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST]: 0.7,
});

const AUTHORITATIVE_BY_SOURCE = Object.freeze({
  [BOUNDARY_SOURCE.DIGITAL_LAND_TITLE_BOUNDARY]: true,
  [BOUNDARY_SOURCE.INSPIRE_PARCEL_CONTAINS]: true,
  [BOUNDARY_SOURCE.OVERPASS_PARCEL_CONTAINS]: true,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS]: true,
  [BOUNDARY_SOURCE.OVERPASS_BUILDING_NEAREST]: false,
});

// A residential / small-parcel polygon should not exceed this area. Anything
// larger is almost certainly an OSM `landuse=*` district polygon (a whole
// neighbourhood) or a multi-house terrace block rather than the legal parcel
// of the address. Demote those candidates to "estimated" and prefer the
// building-contains polygon.
//
// Tuned 2026-05-03 from 1500 → 1000 m² after 17 Kensington Rd, DN15 8BQ
// returned a ~1257 m² title/parcel polygon for an apartment/single-address
// case whose expected footprint is closer to ~67 m². Typical UK residential
// lots are 100–500 m²; 1000 m² keeps generous lots while rejecting multi-unit
// blocks and terrace-row title polygons before they become authoritative.
export const RESIDENTIAL_PARCEL_MAX_M2 = 1000;

// Vertex-count cap mirrors the same heuristic — district polygons frequently
// have 50+ vertices, while typical lot polygons sit well under this.
export const RESIDENTIAL_PARCEL_MAX_VERTICES = 30;

// A single residential building footprint is rarely larger than this. When
// Overpass returns a building polygon larger than this for a residential
// address, it is almost certainly a multi-unit terrace block, an apartment
// block being treated as a single building, or a non-residential structure
// at that postcode. Demote it to estimated like an oversized parcel.
export const RESIDENTIAL_BUILDING_MAX_M2 = 600;
export const RESIDENTIAL_NEAREST_BUILDING_MAX_DISTANCE_M = 18;
export const RESIDENTIAL_TARGET_BUILDING_AREA_M2 = 80;

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
  BUILDING_OVERSIZED: "building_oversized",
  BUILDING_NEAREST_FALLBACK: "building_nearest_fallback",
  NONE: null,
});

/**
 * Inspect a candidate building polygon and decide whether it is plausibly a
 * single-residence footprint or a larger multi-unit / non-residential
 * structure. When the building polygon is implausibly large, callers
 * should still use it (better than nothing) but flag the result as
 * estimated so downstream A1 layout treats setbacks/areas with caution.
 */
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
  if (Number.isFinite(areaM2) && areaM2 >= RESIDENTIAL_PARCEL_MAX_M2) {
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

function roundMetric(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return 0;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function polygonPerimeterM(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    perimeter += distanceM(polygon[i], polygon[(i + 1) % polygon.length]);
  }
  return perimeter;
}

export function bearingDegrees(a, b) {
  if (!a || !b) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return roundMetric((toDeg(Math.atan2(y, x)) + 360) % 360, 2);
}

export function polygonSegmentDetails(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 2) return [];
  return polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return {
      index: index + 1,
      lengthM: roundMetric(distanceM(start, end), 2),
      bearingDeg: bearingDegrees(start, end),
      start,
      end,
    };
  });
}

function localVectorMeters(origin, point) {
  const latScaleM = 111_320;
  const lngScaleM =
    111_320 * Math.cos((Number(origin?.lat || 0) * Math.PI) / 180);
  return {
    x: (Number(point.lng) - Number(origin.lng)) * lngScaleM,
    y: (Number(point.lat) - Number(origin.lat)) * latScaleM,
  };
}

export function polygonInteriorAngles(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return [];
  return polygon.map((vertex, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    const a = localVectorMeters(vertex, previous);
    const b = localVectorMeters(vertex, next);
    const dot = a.x * b.x + a.y * b.y;
    const magA = Math.sqrt(a.x * a.x + a.y * a.y);
    const magB = Math.sqrt(b.x * b.x + b.y * b.y);
    const cosine =
      magA > 0 && magB > 0 ? Math.max(-1, Math.min(1, dot / (magA * magB))) : 1;
    return {
      index: index + 1,
      angleDeg: roundMetric((Math.acos(cosine) * 180) / Math.PI, 2),
      vertex,
    };
  });
}

export function buildBoundaryMeasurements(polygon) {
  const hasShape = Array.isArray(polygon) && polygon.length >= 3;
  if (!hasShape) {
    return {
      areaM2: 0,
      surfaceAreaM2: 0,
      perimeterM: 0,
      segmentCount: 0,
      angleCount: 0,
      segments: [],
      angles: [],
    };
  }
  const areaM2 = Math.round(polygonAreaM2(polygon));
  const segments = polygonSegmentDetails(polygon);
  const angles = polygonInteriorAngles(polygon);
  return {
    areaM2,
    surfaceAreaM2: areaM2,
    perimeterM: roundMetric(polygonPerimeterM(polygon), 2),
    segmentCount: segments.length,
    angleCount: angles.length,
    segments,
    angles,
  };
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
    const yiAbove = yi > y;
    const yjAbove = yj > y;
    const intersect =
      yiAbove !== yjAbove &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistanceM(point, a, b) {
  if (!point || !a || !b) return Infinity;
  const p = localVectorMeters(point, point);
  const start = localVectorMeters(point, a);
  const end = localVectorMeters(point, b);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= Number.EPSILON) {
    return Math.sqrt(
      (p.x - start.x) * (p.x - start.x) + (p.y - start.y) * (p.y - start.y),
    );
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq),
  );
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return Math.sqrt(
    (p.x - projected.x) * (p.x - projected.x) +
      (p.y - projected.y) * (p.y - projected.y),
  );
}

function pointToPolygonDistanceM(polygon, point) {
  if (!Array.isArray(polygon) || polygon.length < 3 || !point) return Infinity;
  if (polygonContainsPoint(polygon, point)) return 0;
  let minDistance = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    minDistance = Math.min(
      minDistance,
      pointToSegmentDistanceM(
        point,
        polygon[i],
        polygon[(i + 1) % polygon.length],
      ),
    );
  }
  return minDistance;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function addressMatchScore(element, address) {
  const normalizedAddress = normalizeSearchText(address);
  if (!normalizedAddress) return 0;
  const tags = element?.tags || {};
  let score = 0;
  const houseNumber = normalizeSearchText(tags["addr:housenumber"]);
  const street = normalizeSearchText(tags["addr:street"]);
  const name = normalizeSearchText(tags.name);
  if (houseNumber && normalizedAddress.split(" ").includes(houseNumber)) {
    score += 5;
  }
  if (street && normalizedAddress.includes(street)) {
    score += 3;
  }
  if (name && normalizedAddress.includes(name)) {
    score += 1;
  }
  return score;
}

function collectPlausibleBuildingCandidates({
  buildingElements = [],
  point,
  address = null,
}) {
  return buildingElements
    .map((element) => {
      const polygon = extractPolygonFromOverpassWay(element);
      if (polygon.length < 3) return null;
      const estimateReason = classifyBuildingCandidate({ polygon });
      const containsPoint = polygonContainsPoint(polygon, point);
      return {
        element,
        polygon,
        estimateReason,
        containsPoint,
        distanceToPointM: pointToPolygonDistanceM(polygon, point),
        areaM2: polygonAreaM2(polygon),
        addressScore: addressMatchScore(element, address),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.addressScore !== a.addressScore) {
        return b.addressScore - a.addressScore;
      }
      if (Number(b.containsPoint) !== Number(a.containsPoint)) {
        return Number(b.containsPoint) - Number(a.containsPoint);
      }
      if (a.distanceToPointM !== b.distanceToPointM) {
        return a.distanceToPointM - b.distanceToPointM;
      }
      return (
        Math.abs(a.areaM2 - RESIDENTIAL_TARGET_BUILDING_AREA_M2) -
        Math.abs(b.areaM2 - RESIDENTIAL_TARGET_BUILDING_AREA_M2)
      );
    });
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
 * Choose the best boundary candidate for the given point.
 *
 * Preference order:
 *   1. INSPIRE Index Polygon (HM Land Registry, England + Wales) — the
 *      legal lot boundary. Reuses the same plausibility classifier as
 *      OSM parcels so a corrupted INSPIRE entry can still be skipped.
 *   2. OSM parcel polygon that contains the point AND passes the
 *      lot-plausibility classifier
 *   3. OSM building polygon that contains the point
 *   4. Nearest OSM building polygon (within 25 m of the point) — flagged
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
export function selectBestBoundaryCandidate({
  inspireElements = [],
  buildingElements = [],
  parcelElements = [],
  point,
  address = null,
}) {
  const checkPoint = point;
  let demotedParcel = null;
  let demotedReason = null;
  const buildingCandidates = collectPlausibleBuildingCandidates({
    buildingElements,
    point: checkPoint,
    address,
  });

  // 0. INSPIRE / Digital Land title-boundary containing the point.
  // Both source kinds flow through this list; we tell them apart by
  // looking for the `titleReference` tag the Digital Land client adds.
  // Live Digital Land entries are tagged with the higher-confidence
  // source value so the response carries provenance accurately. Both
  // are legal lot boundaries so they bypass the OSM `landuse=*`
  // exclusion in `classifyParcelCandidate`, but the size/vertex
  // sanity check still applies — a corrupted entry covering 50 ha is
  // still wrong.
  for (const el of inspireElements) {
    const polygon = extractPolygonFromOverpassWay(el);
    if (polygon.length < 3 || !polygonContainsPoint(polygon, checkPoint)) {
      continue;
    }
    const reason = classifyParcelCandidate({ polygon, element: el });
    if (!reason) {
      const isDigitalLand = Boolean(el?.tags?.titleReference);
      return {
        element: el,
        polygon,
        source: isDigitalLand
          ? BOUNDARY_SOURCE.DIGITAL_LAND_TITLE_BOUNDARY
          : BOUNDARY_SOURCE.INSPIRE_PARCEL_CONTAINS,
      };
    }
    // INSPIRE returned an implausible polygon — log via demotedReason
    // and fall through to OSM rather than failing the whole request.
    if (!demotedParcel) {
      demotedParcel = { element: el, polygon };
      demotedReason = reason;
    }
  }

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

  // 2. building containing the point. A plausibly-sized building wins
  // immediately. An oversized building (terraced row joined into one OSM
  // polygon, factory shed, school block, etc.) is NOT returned as the
  // primary candidate — it would mis-set the user's site by an order of
  // magnitude. We capture it as `demotedParcel` so callers can render it
  // as a faint reference, then fall through to the nearest-building
  // search and ultimately to a null result that prompts manual drawing.
  for (const candidate of buildingCandidates) {
    if (!candidate.containsPoint) continue;
    if (!candidate.estimateReason) {
      return {
        element: candidate.element,
        polygon: candidate.polygon,
        source: BOUNDARY_SOURCE.OVERPASS_BUILDING_CONTAINS,
        estimateReason: demotedReason || null,
        demotedParcel,
      };
    }
    if (!demotedParcel) {
      demotedParcel = {
        element: candidate.element,
        polygon: candidate.polygon,
      };
      demotedReason = demotedReason || candidate.estimateReason;
    }
  }
  // 3. nearest building within 25 m, with the same plausibility check —
  // an oversized building does not become a plausible site boundary just
  // because no closer candidate exists.
  const nearest = buildingCandidates.find(
    (candidate) =>
      !candidate.estimateReason &&
      candidate.distanceToPointM <= RESIDENTIAL_NEAREST_BUILDING_MAX_DISTANCE_M,
  );
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
 * Backwards-compatible alias for `selectBestBoundaryCandidate`. Existing
 * callers that pass only Overpass elements continue to work unchanged;
 * `inspireElements` defaults to `[]` so the new INSPIRE branch is
 * skipped for non-INSPIRE call sites.
 */
export function selectBestOverpassWay({
  buildingElements = [],
  parcelElements = [],
  point,
} = {}) {
  return selectBestBoundaryCandidate({
    inspireElements: [],
    buildingElements,
    parcelElements,
    point,
  });
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
  const measurements = buildBoundaryMeasurements(hasShape ? polygon : []);
  const areaM2 = measurements.areaM2;
  const hash = hashBoundaryShape({ polygon, source: resolvedSource });

  return {
    schemaVersion: PROXY_RESPONSE_SCHEMA_VERSION,
    policyVersion: BOUNDARY_POLICY_VERSION,
    polygon: hasShape ? polygon : null,
    source: resolvedSource,
    confidence,
    boundaryAuthoritative,
    estimateReason: estimateReason || null,
    areaM2,
    surfaceAreaM2: measurements.surfaceAreaM2,
    perimeterM: measurements.perimeterM,
    segments: measurements.segments,
    angles: measurements.angles,
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
      siteMetrics: {
        areaM2,
        surfaceAreaM2: measurements.surfaceAreaM2,
        perimeterM: measurements.perimeterM,
        segmentCount: measurements.segmentCount,
        angleCount: measurements.angleCount,
      },
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
    policyVersion: BOUNDARY_POLICY_VERSION,
    polygon: null,
    source: BOUNDARY_SOURCE.NONE,
    confidence: 0,
    boundaryAuthoritative: false,
    estimateReason: null,
    areaM2: 0,
    surfaceAreaM2: 0,
    perimeterM: 0,
    segments: [],
    angles: [],
    hash: hashBoundaryShape({ polygon: [], source: null }),
    cached: Boolean(cached),
    timestamp: now || new Date().toISOString(),
    metadata: {
      reason,
      overpassQueryRadiusM: queryRadiusM,
      siteMetrics: {
        areaM2: 0,
        surfaceAreaM2: 0,
        perimeterM: 0,
        segmentCount: 0,
        angleCount: 0,
      },
    },
  };
}
