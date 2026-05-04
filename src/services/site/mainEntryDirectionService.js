/**
 * Main Entry Direction Service
 *
 * Resolves the main entry / frontage direction for a site, combining the
 * existing `inferEntranceDirection` heuristics (longest edge, road proximity,
 * solar gain) with an optional manual override. Manual override always wins
 * so users can correct the auto-detected direction without re-running the
 * pipeline.
 *
 * Result shape is consistent so downstream consumers (plan entry arrow,
 * elevation orientation mapping, 3D hero camera, A1 manifest) can read the
 * same field names regardless of which strategy produced the answer.
 *
 * @module services/site/mainEntryDirectionService
 */

import {
  inferEntranceDirection,
  getOppositeDirection,
} from "../../utils/entranceOrientation.js";

const SHORT_TO_FULL = Object.freeze({
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
});

function shortDirectionToFull(short) {
  const upper = String(short || "")
    .toUpperCase()
    .trim();
  return SHORT_TO_FULL[upper] || null;
}

function bearingFromEdge(edge) {
  if (!edge || !Array.isArray(edge.start) || !Array.isArray(edge.end)) {
    return null;
  }
  const dx = Number(edge.end[0]) - Number(edge.start[0]);
  const dy = Number(edge.end[1]) - Number(edge.start[1]);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  // Compass bearing: 0 = north, 90 = east.
  const radians = Math.atan2(dx, dy);
  return ((radians * 180) / Math.PI + 360) % 360;
}

function polygonSignedArea(sitePolygon) {
  if (!Array.isArray(sitePolygon) || sitePolygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < sitePolygon.length; i += 1) {
    const a = sitePolygon[i];
    const b = sitePolygon[(i + 1) % sitePolygon.length];
    sum += Number(a.lng) * Number(b.lat) - Number(b.lng) * Number(a.lat);
  }
  return sum / 2;
}

function edgeId(index) {
  return Number.isFinite(Number(index)) ? `edge-${Number(index)}` : null;
}

function makeResult({
  orientation,
  bearingDeg,
  frontageEdgeId = null,
  mainEntryEdgeId = null,
  source,
  confidence,
  warnings = [],
  rationale = [],
  edgeIndex = null,
  label = null,
}) {
  const normalizedBearing = ((Number(bearingDeg) % 360) + 360) % 360;
  const normalizedOrientation =
    orientation || bearingToCardinalFull(normalizedBearing);
  return {
    orientation: normalizedOrientation,
    bearingDeg: normalizedBearing,
    frontageEdgeId,
    mainEntryEdgeId,
    source,
    confidence,
    warnings,
    direction: normalizedOrientation,
    bearing: normalizedBearing,
    rationale,
    label: label || capitalize(normalizedOrientation),
    edgeIndex,
  };
}

/**
 * Resolve the main entry direction for a site.
 *
 * @param {object} input
 * @param {Array<{lat: number, lng: number}>} input.sitePolygon - Site boundary
 * @param {Array<object>} [input.roadSegments] - Nearby road segments
 * @param {object} [input.sunPath] - Solar path data
 * @param {number} [input.manualEdgeIndex] - 0-based vertex index of the edge
 *   the user manually marked as the main entry edge. The edge runs from
 *   sitePolygon[manualEdgeIndex] to sitePolygon[manualEdgeIndex + 1] (wrap).
 * @param {string} [input.manualDirection] - Direct cardinal override
 *   (e.g. "north", "south"). Wins over manualEdgeIndex if both are present.
 * @returns {{
 *   orientation: string,
 *   bearingDeg: number,
 *   frontageEdgeId: string|null,
 *   mainEntryEdgeId: string|null,
 *   source: 'manual'|'inferred'|'fallback',
 *   confidence: number,
 *   warnings: Array<string>,
 *   direction: string,
 *   bearing: number,
 *   edgeIndex: number|null
 * }}
 */
export function resolveMainEntryDirection({
  sitePolygon = null,
  roadSegments = null,
  sunPath = null,
  manualEdgeIndex = null,
  manualDirection = null,
} = {}) {
  // Manual cardinal direction wins.
  if (manualDirection) {
    const normalized =
      shortDirectionToFull(manualDirection) ||
      String(manualDirection).toLowerCase().trim();
    const bearingDeg = bearingFromCardinalLabel(normalized);
    return makeResult({
      orientation: normalized,
      bearingDeg,
      confidence: 1,
      rationale: [
        {
          strategy: "manual_direction",
          weight: 1,
          message: `Manual override: main entry on the ${normalized} side`,
        },
      ],
      source: "manual",
      edgeIndex: null,
      label: capitalize(normalized),
    });
  }

  // Manual edge selection: derive the outward bearing perpendicular to the
  // selected edge so the entry arrow points OUT of the site (matches the
  // "longest edge" strategy behaviour). Note: Number(null) === 0 is finite,
  // so we must explicitly exclude null/undefined before the finite check.
  if (
    Array.isArray(sitePolygon) &&
    sitePolygon.length >= 3 &&
    manualEdgeIndex !== null &&
    manualEdgeIndex !== undefined &&
    Number.isFinite(Number(manualEdgeIndex))
  ) {
    const idx =
      ((Number(manualEdgeIndex) % sitePolygon.length) + sitePolygon.length) %
      sitePolygon.length;
    const start = sitePolygon[idx];
    const end = sitePolygon[(idx + 1) % sitePolygon.length];
    if (start && end) {
      const edgeBearing = bearingFromEdge({
        start: [Number(start.lng), Number(start.lat)],
        end: [Number(end.lng), Number(end.lat)],
      });
      if (Number.isFinite(edgeBearing)) {
        // Outward bearing perpendicular to the edge. For counter-clockwise
        // rings the interior lies to the left, so outward is to the right.
        const isCounterClockwise = polygonSignedArea(sitePolygon) > 0;
        const outward =
          (edgeBearing + (isCounterClockwise ? 90 : -90) + 360) % 360;
        const direction = bearingToCardinalFull(outward);
        return makeResult({
          orientation: direction,
          bearingDeg: outward,
          frontageEdgeId: edgeId(idx),
          mainEntryEdgeId: edgeId(idx),
          confidence: 1,
          rationale: [
            {
              strategy: "manual_edge",
              weight: 1,
              message: `Manual override: main entry on edge ${idx} (${direction})`,
            },
          ],
          source: "manual",
          edgeIndex: idx,
          label: capitalize(direction),
        });
      }
    }
  }

  // Fall back to the existing inference heuristics.
  if (Array.isArray(sitePolygon) && sitePolygon.length >= 3) {
    const inferred = inferEntranceDirection({
      sitePolygon,
      roadSegments,
      sunPath,
    });
    if (inferred) {
      const bearingDeg = Number(inferred.bearing) || 0;
      const orientation =
        shortDirectionToFull(inferred.direction) ||
        String(inferred.label || "")
          .toLowerCase()
          .trim() ||
        bearingToCardinalFull(bearingDeg);
      return makeResult({
        orientation,
        bearingDeg,
        confidence: Number(inferred.confidence) || 0.5,
        rationale: inferred.rationale || [],
        source: "inferred",
        edgeIndex: null,
        frontageEdgeId: inferred.frontageEdgeId || null,
        mainEntryEdgeId: inferred.mainEntryEdgeId || null,
        label: inferred.label || capitalize(orientation),
      });
    }
  }

  return makeResult({
    orientation: "north",
    bearingDeg: 0,
    confidence: 0.2,
    rationale: [
      {
        strategy: "fallback",
        weight: 0.2,
        message: "No site polygon available; defaulting to north",
      },
    ],
    source: "fallback",
    edgeIndex: null,
    label: "North",
    warnings: ["No site polygon available; defaulting to north."],
  });
}

function bearingFromCardinalLabel(label) {
  const lookup = {
    north: 0,
    northeast: 45,
    east: 90,
    southeast: 135,
    south: 180,
    southwest: 225,
    west: 270,
    northwest: 315,
  };
  return lookup[String(label || "").toLowerCase()] ?? 0;
}

function bearingToCardinalFull(bearing) {
  const normalized = ((Number(bearing) % 360) + 360) % 360;
  if (normalized < 22.5 || normalized >= 337.5) return "north";
  if (normalized < 67.5) return "northeast";
  if (normalized < 112.5) return "east";
  if (normalized < 157.5) return "southeast";
  if (normalized < 202.5) return "south";
  if (normalized < 247.5) return "southwest";
  if (normalized < 292.5) return "west";
  return "northwest";
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { getOppositeDirection };

export default {
  resolveMainEntryDirection,
  getOppositeDirection,
};
