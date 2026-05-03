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
  // Caller may pass [lng, lat] or [x, y] — the bearing math just needs a
  // consistent orientation; we use atan2 on the deltas.
  const dx = Number(edge.end[0]) - Number(edge.start[0]);
  const dy = Number(edge.end[1]) - Number(edge.start[1]);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  const radians = Math.atan2(dy, dx);
  return ((radians * 180) / Math.PI + 360) % 360;
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
 *   direction: string,
 *   bearing: number,
 *   confidence: number,
 *   rationale: Array<object>,
 *   label: string,
 *   source: 'manual'|'inferred'|'fallback',
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
    return {
      direction: normalized,
      bearing: bearingFromCardinalLabel(normalized),
      confidence: 1,
      rationale: [
        {
          strategy: "manual_direction",
          weight: 1,
          message: `Manual override: main entry on the ${normalized} side`,
        },
      ],
      label: capitalize(normalized),
      source: "manual",
      edgeIndex: null,
    };
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
        // Outward bearing perpendicular to the edge (right-hand side).
        const outward = (edgeBearing + 90 + 360) % 360;
        const direction = bearingToCardinalFull(outward);
        return {
          direction,
          bearing: outward,
          confidence: 1,
          rationale: [
            {
              strategy: "manual_edge",
              weight: 1,
              message: `Manual override: main entry on edge ${idx} (${direction})`,
            },
          ],
          label: capitalize(direction),
          source: "manual",
          edgeIndex: idx,
        };
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
      return {
        direction: shortDirectionToFull(inferred.direction) || inferred.label,
        bearing: Number(inferred.bearing) || 0,
        confidence: Number(inferred.confidence) || 0.5,
        rationale: inferred.rationale || [],
        label: inferred.label || "North",
        source: "inferred",
        edgeIndex: null,
      };
    }
  }

  return {
    direction: "north",
    bearing: 0,
    confidence: 0.2,
    rationale: [
      {
        strategy: "fallback",
        weight: 0.2,
        message: "No site polygon available; defaulting to north",
      },
    ],
    label: "North",
    source: "fallback",
    edgeIndex: null,
  };
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
