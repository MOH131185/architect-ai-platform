import { safeNumber } from "../cad/architecturalSchema.js";
import {
  interpretSiteConstraints,
  normalizeBoundaryPolygon,
} from "./siteConstraintInterpreter.js";

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function buildBoundingBox(points = []) {
  if (!Array.isArray(points) || !points.length) {
    return {
      min_x: 0,
      min_y: 0,
      max_x: 0,
      max_y: 0,
      width: 0,
      height: 0,
    };
  }

  const xs = points.map((point) => Number(point.x || 0));
  const ys = points.map((point) => Number(point.y || 0));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    min_x: roundMetric(minX),
    min_y: roundMetric(minY),
    max_x: roundMetric(maxX),
    max_y: roundMetric(maxY),
    width: roundMetric(maxX - minX),
    height: roundMetric(maxY - minY),
  };
}

function rectangleToPolygon(x, y, width, height) {
  return [
    { x: roundMetric(x), y: roundMetric(y) },
    { x: roundMetric(x + width), y: roundMetric(y) },
    { x: roundMetric(x + width), y: roundMetric(y + height) },
    { x: roundMetric(x), y: roundMetric(y + height) },
  ];
}

function computePolygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area +=
      Number(current.x || 0) * Number(next.y || 0) -
      Number(next.x || 0) * Number(current.y || 0);
  }

  return roundMetric(Math.abs(area) / 2);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pointOnSegment(point = {}, start = {}, end = {}, epsilon = 0.02) {
  const cross =
    (Number(point.y || 0) - Number(start.y || 0)) *
      (Number(end.x || 0) - Number(start.x || 0)) -
    (Number(point.x || 0) - Number(start.x || 0)) *
      (Number(end.y || 0) - Number(start.y || 0));
  if (Math.abs(cross) > epsilon) {
    return false;
  }

  const dot =
    (Number(point.x || 0) - Number(start.x || 0)) *
      (Number(end.x || 0) - Number(start.x || 0)) +
    (Number(point.y || 0) - Number(start.y || 0)) *
      (Number(end.y || 0) - Number(start.y || 0));
  if (dot < -epsilon) {
    return false;
  }

  const squaredLength =
    (Number(end.x || 0) - Number(start.x || 0)) ** 2 +
    (Number(end.y || 0) - Number(start.y || 0)) ** 2;
  return dot <= squaredLength + epsilon;
}

function pointInPolygon(point = {}, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    if (pointOnSegment(point, previous, current)) {
      return true;
    }

    const currentY = Number(current.y ?? 0);
    const previousY = Number(previous.y ?? 0);
    const pointY = Number(point.y ?? 0);
    const deltaY = previousY - currentY || 0.000001;
    const crossesScanline =
      currentY > pointY ? !(previousY > pointY) : previousY > pointY;
    const intersectionX =
      ((Number(previous.x || 0) - Number(current.x || 0)) *
        (pointY - currentY)) /
        deltaY +
      Number(current.x || 0);
    const intersects = crossesScanline && Number(point.x || 0) < intersectionX;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function insetBoundaryPoint(point, centroid, boundaryBbox, setbacks = {}) {
  const xInset =
    point.x >= centroid.x
      ? Number(setbacks.right || 0)
      : Number(setbacks.left || 0);
  const yInset =
    point.y >= centroid.y
      ? Number(setbacks.rear || 0)
      : Number(setbacks.front || 0);
  const xFactor = clamp(
    (xInset / Math.max(boundaryBbox.width, 1)) * 1.8,
    0,
    0.42,
  );
  const yFactor = clamp(
    (yInset / Math.max(boundaryBbox.height, 1)) * 1.8,
    0,
    0.42,
  );

  return {
    x: roundMetric(point.x + (centroid.x - point.x) * xFactor),
    y: roundMetric(point.y + (centroid.y - point.y) * yFactor),
  };
}

function buildInsetPolygon(
  boundaryPolygon = [],
  centroid = {},
  boundaryBbox = {},
  setbacks = {},
) {
  const inset = boundaryPolygon.map((point) =>
    insetBoundaryPoint(point, centroid, boundaryBbox, setbacks),
  );
  const insetArea = computePolygonArea(inset);
  const insetInsideBoundary =
    inset.length >= 3 &&
    inset.every((point) => pointInPolygon(point, boundaryPolygon));
  if (inset.length >= 3 && insetArea > 4 && insetInsideBoundary) {
    return inset;
  }

  const minX = boundaryBbox.min_x + Number(setbacks.left || 0);
  const minY = boundaryBbox.min_y + Number(setbacks.front || 0);
  const maxX = boundaryBbox.max_x - Number(setbacks.right || 0);
  const maxY = boundaryBbox.max_y - Number(setbacks.rear || 0);
  const width = Math.max(4, maxX - minX);
  const height = Math.max(4, maxY - minY);
  return rectangleToPolygon(minX, minY, width, height);
}

function buildPrimaryFitBbox(
  boundaryBbox = {},
  setbacks = {},
  irregularityScore = 0,
) {
  const minX = boundaryBbox.min_x + Number(setbacks.left || 0);
  const minY = boundaryBbox.min_y + Number(setbacks.front || 0);
  const maxX = boundaryBbox.max_x - Number(setbacks.right || 0);
  const maxY = boundaryBbox.max_y - Number(setbacks.rear || 0);
  const rawWidth = Math.max(4, maxX - minX);
  const rawHeight = Math.max(4, maxY - minY);
  // Preserve the legacy Phase 2 rectangular-envelope contract for regular lots.
  // Only tighten the primary fit box when the site shape is meaningfully irregular.
  const shrinkFactor =
    irregularityScore < 0.02 ? 1 : irregularityScore >= 0.2 ? 0.94 : 0.98;
  const width = roundMetric(rawWidth * shrinkFactor);
  const height = roundMetric(rawHeight * shrinkFactor);

  return {
    min_x: roundMetric(minX),
    min_y: roundMetric(minY),
    max_x: roundMetric(minX + width),
    max_y: roundMetric(minY + height),
    width,
    height,
  };
}

export function deriveBuildableEnvelope(site = {}, options = {}) {
  const interpreted = interpretSiteConstraints(site);
  const boundaryPolygon = normalizeBoundaryPolygon(site);
  const buildablePolygon = buildInsetPolygon(
    boundaryPolygon,
    interpreted.centroid,
    interpreted.boundary_bbox,
    interpreted.setbacks,
  );
  const primaryFitBbox = buildPrimaryFitBbox(
    interpreted.boundary_bbox,
    interpreted.setbacks,
    interpreted.irregularity_score,
  );
  const boundaryArea = Math.max(interpreted.boundary_area_m2, 0.001);
  const buildableArea = computePolygonArea(buildablePolygon);
  const buildableAreaRatio = roundMetric(buildableArea / boundaryArea);
  const warnings = [...interpreted.warnings];

  if (buildableAreaRatio < 0.55) {
    warnings.push(
      "Setbacks and site geometry significantly reduce the buildable area; solver choices will be constrained.",
    );
  }
  if (primaryFitBbox.width / Math.max(primaryFitBbox.height, 0.001) > 2.8) {
    warnings.push(
      "Buildable envelope is strongly elongated; corridor efficiency and daylight balance may degrade.",
    );
  }

  return {
    boundary_polygon: boundaryPolygon,
    boundary_bbox: interpreted.boundary_bbox,
    buildable_polygon: buildablePolygon,
    buildable_bbox: primaryFitBbox,
    buildable_fit_bbox: primaryFitBbox,
    setbacks: interpreted.setbacks,
    north_orientation_deg: interpreted.north_orientation_deg,
    constraints: {
      boundary_area_m2: interpreted.boundary_area_m2,
      buildable_area_m2: buildableArea,
      buildable_area_ratio: buildableAreaRatio,
      irregularity_score: interpreted.irregularity_score,
      compactness_score: interpreted.compactness_score,
      dominant_axis: primaryFitBbox.width >= primaryFitBbox.height ? "x" : "y",
      constrained_site:
        interpreted.irregularity_score >= 0.18 || buildableAreaRatio < 0.55,
    },
    warnings,
    options: {
      source: options.source || "phase4-buildable-envelope-service",
    },
  };
}

export function validateFootprintAgainstEnvelope(
  footprint = [],
  envelope = {},
) {
  const polygon = Array.isArray(footprint)
    ? footprint
    : footprint?.polygon || [];
  const buildablePolygon = Array.isArray(envelope.buildable_polygon)
    ? envelope.buildable_polygon
    : [];
  const buildableBbox =
    envelope.buildable_bbox || envelope.buildable_fit_bbox || envelope;
  const errors = [];
  const warnings = [];

  if (!polygon.length) {
    return {
      valid: false,
      errors: ["Footprint polygon is required for envelope validation."],
      warnings,
    };
  }

  polygon.forEach((point, index) => {
    const x = Number(point.x || 0);
    const y = Number(point.y || 0);
    const insidePolygon = buildablePolygon.length
      ? pointInPolygon(point, buildablePolygon)
      : x >= Number(buildableBbox.min_x || 0) - 0.01 &&
        x <= Number(buildableBbox.max_x || 0) + 0.01 &&
        y >= Number(buildableBbox.min_y || 0) - 0.01 &&
        y <= Number(buildableBbox.max_y || 0) + 0.01;
    if (!insidePolygon) {
      errors.push(
        `footprint point ${index} lies outside the buildable envelope.`,
      );
    }
  });

  const footprintArea = computePolygonArea(polygon);
  const buildableArea = computePolygonArea(envelope.buildable_polygon || []);
  if (
    buildableArea > 0 &&
    footprintArea / Math.max(buildableArea, 0.001) > 0.92
  ) {
    warnings.push(
      "Footprint nearly fills the buildable envelope; facade articulation and circulation flexibility will be limited.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      footprint_area_m2: footprintArea,
      buildable_area_m2: buildableArea,
    },
  };
}

export function buildEnvelopeFallback(site = {}, footprint = {}) {
  const width = Math.max(
    12,
    safeNumber(footprint.width_m ?? footprint.width, 18),
  );
  const depth = Math.max(
    10,
    safeNumber(footprint.depth_m ?? footprint.depth, 14),
  );
  return deriveBuildableEnvelope({
    ...site,
    boundary_polygon:
      site.boundary_polygon || rectangleToPolygon(0, 0, width, depth),
  });
}

export function deriveGroundRelationSemantics(site = {}, envelope = {}) {
  const resolvedEnvelope =
    envelope && Object.keys(envelope).length
      ? envelope
      : deriveBuildableEnvelope(site);
  const siteArea = Number(
    resolvedEnvelope.constraints?.boundary_area_m2 ||
      computePolygonArea(resolvedEnvelope.boundary_polygon || []),
  );
  const buildableArea = Number(
    resolvedEnvelope.constraints?.buildable_area_m2 ||
      computePolygonArea(resolvedEnvelope.buildable_polygon || []),
  );
  const buildableAreaRatio =
    siteArea > 0 ? roundMetric(buildableArea / Math.max(siteArea, 0.001)) : 1;
  const gradeDeltaM = roundMetric(
    site.grade_delta_m ??
      site.gradeDeltaM ??
      site.topography?.grade_delta_m ??
      site.topography?.gradeDeltaM ??
      site.slope_height_m ??
      site.slopeHeightM ??
      0,
  );
  const plinthHeightM = roundMetric(
    site.plinth_height_m ??
      site.plinthHeightM ??
      site.base_plinth_height_m ??
      site.basePlinthHeightM ??
      (gradeDeltaM >= 0.45 ? 0.28 : 0.15),
  );
  const explicitGroundCondition = String(
    site.base_condition ||
      site.baseCondition ||
      site.ground_condition ||
      site.groundCondition ||
      site.topography?.condition ||
      "",
  )
    .trim()
    .toLowerCase();

  let supportMode = String(site.support_mode || site.supportMode || "")
    .trim()
    .toLowerCase();
  if (!supportMode) {
    if (
      explicitGroundCondition.includes("step") ||
      explicitGroundCondition.includes("terrace") ||
      gradeDeltaM >= 1.2
    ) {
      supportMode = "stepped_grade";
    } else if (
      explicitGroundCondition.includes("slope") ||
      explicitGroundCondition.includes("grade") ||
      gradeDeltaM >= 0.5
    ) {
      supportMode = "graded";
    } else if (plinthHeightM >= 0.22) {
      supportMode = "raised_plinth";
    } else {
      supportMode = "ground_bearing";
    }
  }

  return {
    supportMode,
    groundCondition:
      explicitGroundCondition ||
      (supportMode === "stepped_grade"
        ? "stepped_grade"
        : supportMode === "graded"
          ? "graded_ground"
          : supportMode === "raised_plinth"
            ? "raised_plinth"
            : "level_ground"),
    plinthHeightM,
    gradeDeltaM,
    buildableAreaRatio,
    constrainedSite:
      Boolean(resolvedEnvelope.constraints?.constrained_site) ||
      buildableAreaRatio < 0.62,
    hasStepCondition: supportMode === "stepped_grade",
    hasRaisedPlinth: supportMode === "raised_plinth",
    evidenceSource:
      explicitGroundCondition || site.support_mode || site.supportMode
        ? "site_conditions"
        : "envelope_constraints",
  };
}

export default {
  deriveBuildableEnvelope,
  validateFootprintAgainstEnvelope,
  buildEnvelopeFallback,
  deriveGroundRelationSemantics,
};
