/**
 * Property Boundary Detection Service
 * Detects real property boundaries using multiple data sources
 * Supports polygons, triangles, irregular shapes, and complex geometries
 */

const API_ENDPOINTS = {
  OVERPASS: "https://overpass-api.de/api/interpreter",
  NOMINATIM: "https://nominatim.openstreetmap.org/search",
};

// Phase 5C: server-side proxy that runs the same Overpass queries but
// without browser CORS restrictions. The browser path calls this URL
// instead of skipping Overpass and going straight to the estimated
// fallback. A fetch failure / non-OK response / null polygon causes the
// caller to fall through to the existing Intelligent Fallback chain —
// the proxy is purely additive evidence, never the safety net itself.
export const SITE_BOUNDARY_PROXY_URL = "/api/site/boundary";
export const SITE_BOUNDARY_PROXY_TIMEOUT_MS = 9000;

export const INTELLIGENT_FALLBACK_BOUNDARY_SOURCE = "Intelligent Fallback";
export const INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE = 0.4;

export function buildEstimatedBoundaryMetadata({
  source = INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
  confidence = INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE,
  reason = "No real boundary data available",
  extra = {},
  ...rest
} = {}) {
  return {
    ...rest,
    ...extra,
    boundaryAuthoritative: false,
    boundaryConfidence: confidence,
    boundarySource: source,
    fallbackReason: reason,
    estimatedOnly: true,
  };
}

export function isEstimatedBoundaryResult(result = {}) {
  const source = String(
    result?.boundarySource ||
      result?.source ||
      result?.metadata?.boundarySource ||
      result?.metadata?.source ||
      "",
  );
  const confidence = Number(
    result?.boundaryConfidence ??
      result?.confidence ??
      result?.metadata?.boundaryConfidence,
  );
  const lowConfidence = Number.isFinite(confidence) && confidence < 0.6;

  return (
    result?.boundaryAuthoritative === false ||
    result?.metadata?.boundaryAuthoritative === false ||
    result?.estimatedOnly === true ||
    result?.metadata?.estimatedOnly === true ||
    /intelligent fallback|fallback/i.test(source) ||
    lowConfidence
  );
}

function isBrowserRuntime() {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
}

/**
 * Phase 5C: call the server-side `/api/site/boundary` proxy from the
 * browser. Returns a normalised `{ polygon, source, confidence,
 * boundaryAuthoritative, ... }` object on success, or `null` on any
 * failure (network error, timeout, non-OK status, empty result, or
 * low-confidence response). A null return is the explicit signal for
 * `detectPropertyBoundary` to continue down the existing chain into the
 * Intelligent Fallback — the proxy is *additive* evidence and never a
 * replacement for the existing safety net.
 *
 * Pure-ish: the only side effects are the fetch and a console.warn on
 * failure. Accepts an injected `fetchImpl` so tests can mock without
 * monkey-patching globals.
 *
 * @param {object} params
 * @param {{lat:number,lng:number}} params.coordinates
 * @param {string} [params.address]
 * @param {string} [params.proxyUrl=SITE_BOUNDARY_PROXY_URL]
 * @param {number} [params.timeoutMs=SITE_BOUNDARY_PROXY_TIMEOUT_MS]
 * @param {function} [params.fetchImpl]
 * @returns {Promise<Object|null>}
 */
/**
 * Extract a UK postcode from a free-form address string. Returns null
 * for non-UK addresses. The proxy uses this to gate INSPIRE lookups by
 * country (England + Wales only).
 */
export function extractPostcodeFromAddress(address) {
  if (typeof address !== "string") return null;
  // UK postcode pattern: 1-2 letters + 1-2 digits + optional letter,
  // space, 1 digit + 2 letters. Anchor to word boundary so we don't
  // match house-number-like fragments.
  const match = address.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return match ? match[1].toUpperCase().replace(/\s+/g, " ").trim() : null;
}

export async function fetchSiteBoundaryFromProxy({
  coordinates,
  address = null,
  postcode = null,
  proxyUrl = SITE_BOUNDARY_PROXY_URL,
  timeoutMs = SITE_BOUNDARY_PROXY_TIMEOUT_MS,
  fetchImpl = typeof fetch === "function" ? fetch : null,
} = {}) {
  if (typeof fetchImpl !== "function") return null;
  if (
    !coordinates ||
    !Number.isFinite(Number(coordinates.lat)) ||
    !Number.isFinite(Number(coordinates.lng))
  ) {
    return null;
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(
        () => controller.abort("site_boundary_proxy_timeout"),
        timeoutMs,
      )
    : null;

  // Resolve postcode: explicit param wins; otherwise try extracting from
  // the address. The proxy does its own gating with `isEnglandOrWales`,
  // so passing a non-UK postcode (or omitting it) is safe.
  const resolvedPostcode =
    postcode || extractPostcodeFromAddress(address) || null;

  try {
    const response = await fetchImpl(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng),
        postcode: resolvedPostcode,
      }),
      signal: controller?.signal,
    });
    if (!response.ok) {
      console.warn(
        `[site-boundary-proxy] non-OK response ${response.status}; falling through to existing chain`,
      );
      return null;
    }
    const json = await response.json();
    if (!json || !Array.isArray(json.polygon) || json.polygon.length < 3) {
      // No polygon found server-side. The browser chain falls through
      // to the existing Intelligent Fallback path. We deliberately do
      // NOT promote `polygon: null` from the proxy to anything else.
      return null;
    }
    return {
      polygon: json.polygon,
      shapeType: analyzeShapeType(json.polygon),
      source: json.source,
      confidence: Number(json.confidence) || 0,
      area: Number(json.areaM2) || 0,
      boundaryAuthoritative: Boolean(json.boundaryAuthoritative),
      boundaryConfidence: Number(json.confidence) || 0,
      boundarySource: json.source,
      metadata: {
        ...(json.metadata || {}),
        proxyHash: json.hash,
        proxyCached: Boolean(json.cached),
        proxySchemaVersion: json.schemaVersion,
      },
    };
  } catch (error) {
    console.warn(
      `[site-boundary-proxy] fetch failed (${error?.name || "error"}: ${error?.message || error}); falling through to existing chain`,
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createSeededRandom(seedInput) {
  let seed = 2166136261;
  const input = String(seedInput || "");

  for (let i = 0; i < input.length; i++) {
    seed ^= input.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return function seededRandom() {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Detect property boundary shape from coordinates.
 *
 * Phase 5C: the browser path now starts by calling the
 * `/api/site/boundary` server proxy so Overpass evidence is available
 * without CORS. If the proxy returns no polygon, we fall through to
 * the existing chain (which still ends in the Intelligent Fallback).
 * The estimated-boundary safety net at the bottom of the chain is
 * untouched — the proxy is purely additive evidence.
 *
 * @param {Object} coordinates - { lat, lng }
 * @param {string} address - Full address string
 * @param {Object} [options]
 * @param {boolean} [options.bypassProxy=false] - skip the `/api/site/boundary`
 *        proxy call. Used by Jest fixtures that stub the existing chain
 *        directly so the proxy doesn't interfere with their assertions.
 *        The corresponding env override is `BYPASS_SITE_BOUNDARY_PROXY=true`.
 * @param {function} [options.fetchImpl] - injected fetch for the proxy
 *        call (tests).
 * @returns {Promise<Object>} Boundary data with shape type
 */
export async function detectPropertyBoundary(
  coordinates,
  address,
  options = {},
) {
  console.log("🔍 Detecting property boundary for:", address);

  try {
    const browserRuntime = isBrowserRuntime();
    const bypassProxy =
      options?.bypassProxy === true ||
      (typeof process !== "undefined" &&
        String(process.env?.BYPASS_SITE_BOUNDARY_PROXY || "")
          .toLowerCase()
          .trim() === "true");

    // Phase 5C: server-side proxy call. Browser-only — server runtime
    // already calls Overpass directly via the existing chain, so we
    // skip the proxy hop there.
    if (browserRuntime && !bypassProxy) {
      const proxyResult = await fetchSiteBoundaryFromProxy({
        coordinates,
        address,
        fetchImpl: options?.fetchImpl,
      });
      if (
        proxyResult &&
        Array.isArray(proxyResult.polygon) &&
        proxyResult.polygon.length >= 3
      ) {
        const estimated = isEstimatedBoundaryResult(proxyResult);
        if (estimated) {
          console.warn(
            `⚠️ Proxy returned a low-confidence boundary (source=${proxyResult.source}, confidence=${proxyResult.confidence}); falling through to existing chain.`,
          );
        } else {
          console.log(
            `✅ Boundary detected via /api/site/boundary: ${proxyResult.shapeType} (${proxyResult.polygon.length} pts, source=${proxyResult.source})`,
          );
          return proxyResult;
        }
      }
    }

    // Try multiple detection methods in order of accuracy
    const methods = browserRuntime
      ? [
          () => detectFromGoogleMaps(coordinates, address),
          () => generateIntelligentFallback(coordinates, address),
        ]
      : [
          () => detectFromOSMParcel(coordinates),
          () => detectFromOSMBuilding(coordinates),
          () => detectFromGoogleMaps(coordinates, address),
          () => detectFromNearbyFeatures(coordinates),
          () => generateIntelligentFallback(coordinates, address),
        ];

    if (browserRuntime) {
      console.info(
        "Falling through to CORS-safe browser chain (proxy returned no authoritative polygon).",
      );
    }

    for (const method of methods) {
      try {
        const result = await method();
        if (result && result.polygon && result.polygon.length >= 3) {
          const estimatedBoundary = isEstimatedBoundaryResult(result);

          if (estimatedBoundary) {
            console.warn(
              "⚠️ Estimated boundary generated:",
              result.shapeType,
              "with",
              result.polygon.length,
              "points",
            );
          } else {
            console.log(
              "✅ Boundary detected:",
              result.shapeType,
              "with",
              result.polygon.length,
              "points",
            );
          }

          return result;
        }
      } catch (error) {
        console.warn("Detection method failed:", error.message);
        continue;
      }
    }

    // If all methods fail, return intelligent fallback
    return generateIntelligentFallback(coordinates, address);
  } catch (error) {
    console.error("❌ Property boundary detection failed:", error);
    return generateIntelligentFallback(coordinates, address);
  }
}

/**
 * Detect boundary from OpenStreetMap land parcel data
 */
async function detectFromOSMParcel(coordinates) {
  if (isBrowserRuntime()) return null;

  const { lat, lng } = coordinates;
  const radius = 50; // meters

  // Query for land parcels, property boundaries, and plots
  const query = `
    [out:json][timeout:25];
    (
      way["landuse"](around:${radius},${lat},${lng});
      way["boundary"="administrative"](around:${radius},${lat},${lng});
      relation["landuse"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch(API_ENDPOINTS.OVERPASS, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });

  if (!response.ok) throw new Error("OSM Overpass API failed");

  const data = await response.json();

  if (data.elements && data.elements.length > 0) {
    // Find the closest parcel to the coordinates
    const closestParcel = findClosestElement(data.elements, coordinates);

    if (closestParcel) {
      const polygon = extractPolygonFromElement(closestParcel);
      const shapeType = analyzeShapeType(polygon);

      return {
        polygon,
        shapeType,
        source: "OSM Parcel",
        confidence: 0.95,
        area: calculatePolygonArea(polygon),
        metadata: {
          landuse: closestParcel.tags?.landuse,
          osmId: closestParcel.id,
        },
      };
    }
  }

  return null;
}

/**
 * Detect boundary from OpenStreetMap building footprint
 */
async function detectFromOSMBuilding(coordinates) {
  if (isBrowserRuntime()) return null;

  const { lat, lng } = coordinates;
  const radius = 30; // meters

  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:${radius},${lat},${lng});
      relation["building"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch(API_ENDPOINTS.OVERPASS, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });

  if (!response.ok) throw new Error("OSM building query failed");

  const data = await response.json();

  if (data.elements && data.elements.length > 0) {
    const closestBuilding = findClosestElement(data.elements, coordinates);

    if (closestBuilding) {
      const buildingPolygon = extractPolygonFromElement(closestBuilding);

      // Expand building footprint by 15% to estimate property boundary
      const expandedPolygon = expandPolygon(buildingPolygon, 1.15);
      const shapeType = analyzeShapeType(expandedPolygon);

      return {
        polygon: expandedPolygon,
        shapeType,
        source: "OSM Building (expanded)",
        confidence: 0.75,
        area: calculatePolygonArea(expandedPolygon),
        metadata: {
          buildingType: closestBuilding.tags?.building,
          osmId: closestBuilding.id,
        },
      };
    }
  }

  return null;
}

/**
 * Detect boundary from Google Maps (if API available)
 */
async function detectFromGoogleMaps(coordinates, address) {
  // This would use Google Maps Places API or Geocoding API
  // to get property boundary if available
  // For now, return null to try other methods
  return null;
}

/**
 * Detect boundary from nearby features (roads, paths, etc.)
 */
async function detectFromNearbyFeatures(coordinates) {
  if (isBrowserRuntime()) return null;

  const { lat, lng } = coordinates;
  const radius = 40;

  // Query for roads and paths that might define property boundaries
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](around:${radius},${lat},${lng});
      way["barrier"](around:${radius},${lat},${lng});
    );
    out geom;
  `;

  const response = await fetch(API_ENDPOINTS.OVERPASS, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });

  if (!response.ok) throw new Error("Nearby features query failed");

  const data = await response.json();

  if (data.elements && data.elements.length >= 2) {
    // Try to construct a boundary from nearby linear features
    const polygon = constructBoundaryFromFeatures(data.elements, coordinates);

    if (polygon && polygon.length >= 3) {
      const shapeType = analyzeShapeType(polygon);

      return {
        polygon,
        shapeType,
        source: "Nearby Features",
        confidence: 0.6,
        area: calculatePolygonArea(polygon),
      };
    }
  }

  return null;
}

/**
 * Generate intelligent fallback based on location type
 */
function generateIntelligentFallback(coordinates, address) {
  const { lat, lng } = coordinates;
  const addressLower = String(address || "").toLowerCase();
  const rng = createSeededRandom(
    `${lat.toFixed(6)}:${lng.toFixed(6)}:${addressLower}`,
  );

  // Analyze address to determine likely lot type
  const isUrban =
    addressLower.includes("street") ||
    addressLower.includes("avenue") ||
    addressLower.includes("road");
  const isCorner =
    addressLower.includes("corner") || addressLower.includes("junction");

  let polygon, shapeType;

  if (isCorner) {
    // Corner lots are often L-shaped or pentagonal
    polygon = generateLShapedLot(coordinates, 25, 20);
    shapeType = "L-shaped";
  } else if (isUrban) {
    // Urban lots can be rectangular or irregular
    const isNarrow = rng() > 0.5; // Could be enhanced with street analysis
    if (isNarrow) {
      polygon = generateRectangularLot(coordinates, 12, 30); // Narrow urban lot
      shapeType = "rectangular";
    } else {
      polygon = generateIrregularQuad(coordinates, 20, 25, rng);
      shapeType = "irregular quadrilateral";
    }
  } else {
    // Suburban/rural lots can be larger and more varied
    const shapes = ["rectangular", "pentagon", "irregular"];
    const randomShape = shapes[Math.floor(rng() * shapes.length)];

    if (randomShape === "pentagon") {
      polygon = generatePentagonLot(coordinates, 30);
      shapeType = "pentagon";
    } else if (randomShape === "irregular") {
      polygon = generateIrregularPolygon(coordinates, 6, 25, 35, rng);
      shapeType = "irregular polygon";
    } else {
      polygon = generateRectangularLot(coordinates, 25, 30);
      shapeType = "rectangular";
    }
  }

  return {
    polygon,
    shapeType,
    source: INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
    confidence: INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE,
    boundaryAuthoritative: false,
    boundaryConfidence: INTELLIGENT_FALLBACK_BOUNDARY_CONFIDENCE,
    boundarySource: INTELLIGENT_FALLBACK_BOUNDARY_SOURCE,
    fallbackReason: "No real boundary data available",
    estimatedOnly: true,
    area: calculatePolygonArea(polygon),
    metadata: buildEstimatedBoundaryMetadata({
      reason: "No real boundary data available",
      addressAnalysis: { isUrban, isCorner },
    }),
  };
}

/**
 * Find the closest OSM element to coordinates
 */
function findClosestElement(elements, coordinates) {
  let closest = null;
  let minDistance = Infinity;

  for (const element of elements) {
    const centroid = calculateElementCentroid(element);
    const distance = calculateDistance(coordinates, centroid);

    if (distance < minDistance) {
      minDistance = distance;
      closest = element;
    }
  }

  return closest;
}

/**
 * Extract polygon coordinates from OSM element
 */
function extractPolygonFromElement(element) {
  const polygon = [];

  if (element.type === "way" && element.geometry) {
    for (const node of element.geometry) {
      polygon.push({ lat: node.lat, lng: node.lon });
    }
  } else if (element.type === "relation" && element.members) {
    // Handle relations (more complex geometries)
    for (const member of element.members) {
      if (member.role === "outer" && member.geometry) {
        for (const node of member.geometry) {
          polygon.push({ lat: node.lat, lng: node.lon });
        }
      }
    }
  }

  return polygon;
}

/**
 * Analyze polygon shape type
 */
export function analyzeShapeType(polygon) {
  if (!polygon || polygon.length < 3) return "invalid";

  const vertices = polygon.length;

  if (vertices === 3) return "triangle";
  if (vertices === 4) {
    // Check if rectangle or irregular quad
    if (isRectangle(polygon)) return "rectangle";
    return "irregular quadrilateral";
  }
  if (vertices === 5) return "pentagon";
  if (vertices === 6) return "hexagon";
  if (vertices > 6 && vertices <= 8) return "polygon";

  return "complex polygon";
}

/**
 * Check if polygon is a rectangle
 */
function isRectangle(polygon) {
  if (polygon.length !== 4) return false;

  // Calculate angles between consecutive sides
  const angles = [];
  for (let i = 0; i < 4; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % 4];
    const p3 = polygon[(i + 2) % 4];

    const angle = calculateAngle(p1, p2, p3);
    angles.push(angle);
  }

  // Check if all angles are approximately 90 degrees
  const tolerance = 10; // degrees
  return angles.every((angle) => Math.abs(angle - 90) < tolerance);
}

/**
 * Calculate angle between three points in degrees
 */
function calculateAngle(p1, p2, p3) {
  const v1 = { x: p1.lng - p2.lng, y: p1.lat - p2.lat };
  const v2 = { x: p3.lng - p2.lng, y: p3.lat - p2.lat };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  const cosAngle = dot / (mag1 * mag2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

  return angleRad * (180 / Math.PI);
}

/**
 * Calculate element centroid
 */
function calculateElementCentroid(element) {
  const polygon = extractPolygonFromElement(element);

  if (polygon.length === 0) return { lat: 0, lng: 0 };

  const sum = polygon.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: sum.lat / polygon.length,
    lng: sum.lng / polygon.length,
  };
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(coord1, coord2) {
  const R = 6371e3; // Earth radius in meters
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate polygon area in square meters
 */
export function calculatePolygonArea(polygon) {
  if (polygon.length < 3) return 0;

  let area = 0;
  const R = 6371000; // Earth radius in meters

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    area +=
      (p2.lng - p1.lng) *
      (2 +
        Math.sin((p1.lat * Math.PI) / 180) +
        Math.sin((p2.lat * Math.PI) / 180));
  }

  area = Math.abs((area * R * R) / 2);

  return area;
}

/**
 * Expand polygon by a scale factor
 */
function expandPolygon(polygon, scale) {
  const centroid = polygon.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat / polygon.length,
      lng: acc.lng + point.lng / polygon.length,
    }),
    { lat: 0, lng: 0 },
  );

  return polygon.map((point) => ({
    lat: centroid.lat + (point.lat - centroid.lat) * scale,
    lng: centroid.lng + (point.lng - centroid.lng) * scale,
  }));
}

/**
 * Construct boundary from linear features
 */
function constructBoundaryFromFeatures(features, centerCoords) {
  // This is a simplified implementation
  // A more sophisticated version would analyze road/path intersections
  // and construct a likely property boundary

  const points = [];

  for (const feature of features) {
    if (feature.geometry && feature.geometry.length > 0) {
      // Find the closest point on this feature to the center
      let closestPoint = feature.geometry[0];
      let minDist = calculateDistance(centerCoords, {
        lat: closestPoint.lat,
        lng: closestPoint.lon,
      });

      for (const node of feature.geometry) {
        const dist = calculateDistance(centerCoords, {
          lat: node.lat,
          lng: node.lon,
        });
        if (dist < minDist) {
          minDist = dist;
          closestPoint = node;
        }
      }

      points.push({ lat: closestPoint.lat, lng: closestPoint.lon });
    }
  }

  if (points.length < 3) return null;

  // Sort points by angle from center to create a polygon
  return sortPointsByAngle(points, centerCoords);
}

/**
 * Sort points by angle from center
 */
function sortPointsByAngle(points, center) {
  return points.sort((a, b) => {
    const angleA = Math.atan2(a.lat - center.lat, a.lng - center.lng);
    const angleB = Math.atan2(b.lat - center.lat, b.lng - center.lng);
    return angleA - angleB;
  });
}

/**
 * Generate rectangular lot
 */
function generateRectangularLot(center, widthMeters, depthMeters) {
  const { lat, lng } = center;

  // Convert meters to approximate degrees
  const latOffset = depthMeters / 2 / 111320;
  const lngOffset =
    widthMeters / 2 / (111320 * Math.cos((lat * Math.PI) / 180));

  return [
    { lat: lat + latOffset, lng: lng - lngOffset }, // Top-left
    { lat: lat + latOffset, lng: lng + lngOffset }, // Top-right
    { lat: lat - latOffset, lng: lng + lngOffset }, // Bottom-right
    { lat: lat - latOffset, lng: lng - lngOffset }, // Bottom-left
  ];
}

/**
 * Generate L-shaped lot
 */
function generateLShapedLot(center, widthMeters, depthMeters) {
  const { lat, lng } = center;

  const latOffset = depthMeters / 111320;
  const lngOffset = widthMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  return [
    { lat: lat + latOffset, lng: lng - lngOffset },
    { lat: lat + latOffset, lng: lng + lngOffset * 0.6 },
    { lat: lat + latOffset * 0.4, lng: lng + lngOffset * 0.6 },
    { lat: lat + latOffset * 0.4, lng: lng + lngOffset },
    { lat: lat - latOffset, lng: lng + lngOffset },
    { lat: lat - latOffset, lng: lng - lngOffset },
  ];
}

/**
 * Generate pentagonal lot
 */
function generatePentagonLot(center, radiusMeters) {
  const { lat, lng } = center;
  const polygon = [];

  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2; // Start from top
    const latOffset = (radiusMeters * Math.sin(angle)) / 111320;
    const lngOffset =
      (radiusMeters * Math.cos(angle)) /
      (111320 * Math.cos((lat * Math.PI) / 180));

    polygon.push({
      lat: lat + latOffset,
      lng: lng + lngOffset,
    });
  }

  return polygon;
}

/**
 * Generate irregular quadrilateral
 */
function generateIrregularQuad(
  center,
  widthMeters,
  depthMeters,
  rng = Math.random,
) {
  const { lat, lng } = center;

  const latOffset = depthMeters / 111320;
  const lngOffset = widthMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  // Add some randomness to make it irregular
  const variance = 0.15;

  return [
    {
      lat: lat + latOffset * (1 + (rng() - 0.5) * variance),
      lng: lng - lngOffset * (1 + (rng() - 0.5) * variance),
    },
    {
      lat: lat + latOffset * (1 + (rng() - 0.5) * variance),
      lng: lng + lngOffset * (1 + (rng() - 0.5) * variance),
    },
    {
      lat: lat - latOffset * (1 + (rng() - 0.5) * variance),
      lng: lng + lngOffset * (1 + (rng() - 0.5) * variance),
    },
    {
      lat: lat - latOffset * (1 + (rng() - 0.5) * variance),
      lng: lng - lngOffset * (1 + (rng() - 0.5) * variance),
    },
  ];
}

/**
 * Generate irregular polygon
 */
function generateIrregularPolygon(
  center,
  sides,
  minRadiusMeters,
  maxRadiusMeters,
  rng = Math.random,
) {
  const { lat, lng } = center;
  const polygon = [];

  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const radius =
      minRadiusMeters + rng() * (maxRadiusMeters - minRadiusMeters);

    const latOffset = (radius * Math.sin(angle)) / 111320;
    const lngOffset =
      (radius * Math.cos(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));

    polygon.push({
      lat: lat + latOffset,
      lng: lng + lngOffset,
    });
  }

  return polygon;
}

/**
 * Simplify polygon (remove redundant vertices)
 */
export function simplifyPolygon(polygon, tolerance = 0.00001) {
  if (polygon.length <= 3) return polygon;

  const simplified = [polygon[0]];

  for (let i = 1; i < polygon.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = polygon[i];
    const next = polygon[i + 1];

    // Calculate distance from current point to line between prev and next
    const distance = pointToLineDistance(curr, prev, next);

    if (distance > tolerance) {
      simplified.push(curr);
    }
  }

  simplified.push(polygon[polygon.length - 1]);

  return simplified;
}

/**
 * Calculate point-to-line distance
 */
function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart.lat;
    yy = lineStart.lng;
  } else if (param > 1) {
    xx = lineEnd.lat;
    yy = lineEnd.lng;
  } else {
    xx = lineStart.lat + param * C;
    yy = lineStart.lng + param * D;
  }

  const dx = point.lat - xx;
  const dy = point.lng - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validate polygon (check for self-intersections)
 */
export function validatePolygon(polygon) {
  if (!polygon || polygon.length < 3) {
    return { valid: false, error: "Polygon must have at least 3 vertices" };
  }

  // Check for self-intersections
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    for (let j = i + 2; j < polygon.length; j++) {
      if (j === polygon.length - 1 && i === 0) continue; // Skip adjacent edges

      const p3 = polygon[j];
      const p4 = polygon[(j + 1) % polygon.length];

      if (linesIntersect(p1, p2, p3, p4)) {
        return { valid: false, error: "Polygon has self-intersections" };
      }
    }
  }

  return { valid: true };
}

/**
 * Check if two line segments intersect
 */
function linesIntersect(p1, p2, p3, p4) {
  const denominator =
    (p4.lng - p3.lng) * (p2.lat - p1.lat) -
    (p4.lat - p3.lat) * (p2.lng - p1.lng);

  if (denominator === 0) return false; // Parallel lines

  const ua =
    ((p4.lat - p3.lat) * (p1.lng - p3.lng) -
      (p4.lng - p3.lng) * (p1.lat - p3.lat)) /
    denominator;

  const ub =
    ((p2.lat - p1.lat) * (p1.lng - p3.lng) -
      (p2.lng - p1.lng) * (p1.lat - p3.lat)) /
    denominator;

  return ua > 0 && ua < 1 && ub > 0 && ub < 1;
}

export default {
  detectPropertyBoundary,
  simplifyPolygon,
  validatePolygon,
  calculatePolygonArea,
  analyzeShapeType,
};
