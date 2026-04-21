import {
  buildBoundingBoxFromPolygon,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { deriveGroundRelationSemantics } from "../site/buildableEnvelopeService.js";
import {
  normalizeFoundationSupportMode,
  normalizeBaseConditionSupportMode,
  summarizeCanonicalFoundationTruth as summarizeCanonicalFoundationTruthModel,
} from "../drawing/constructionTruthModel.js";

function rectanglePolygonFromBounds(minX, minY, maxX, maxY) {
  return rectangleToPolygon(
    roundMetric(minX),
    roundMetric(minY),
    roundMetric(maxX - minX),
    roundMetric(maxY - minY),
  );
}

function getPrimaryFootprint(projectGeometry = {}) {
  return (
    projectGeometry.footprints?.[0] || {
      polygon: projectGeometry.site?.buildable_polygon || [],
      bbox: projectGeometry.site?.buildable_bbox || null,
    }
  );
}

export function deriveBaseConditionSemantics(projectGeometry = {}, input = {}) {
  const site = input.site || projectGeometry.site || {};
  const envelope = {
    boundary_polygon: projectGeometry.site?.boundary_polygon,
    buildable_polygon: projectGeometry.site?.buildable_polygon,
    boundary_bbox: projectGeometry.site?.boundary_bbox,
    buildable_bbox: projectGeometry.site?.buildable_bbox,
    constraints: projectGeometry.site?.constraints,
  };
  return deriveGroundRelationSemantics(site, envelope);
}

export function synthesizeFoundationZonePayloads(projectGeometry = {}) {
  const footprint = getPrimaryFootprint(projectGeometry);
  const bbox =
    footprint.bbox ||
    buildBoundingBoxFromPolygon(
      footprint.polygon || projectGeometry.site?.buildable_polygon || [],
    );
  if (!bbox) {
    return [];
  }
  const foundationDepth = 0.82;
  const inset = 0.18;
  const zonePolygon =
    footprint.polygon?.length > 0
      ? footprint.polygon
      : rectanglePolygonFromBounds(
          bbox.min_x + inset,
          bbox.min_y + inset,
          bbox.max_x - inset,
          bbox.max_y - inset,
        );
  return [
    {
      foundation_type: "foundation_zone",
      polygon: zonePolygon,
      bbox: buildBoundingBoxFromPolygon(zonePolygon),
      depth_m: foundationDepth,
      thickness_m: 0.45,
      support_mode: "explicit_ground_primitives",
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-foundation-zone",
      },
    },
  ];
}

export function buildBaseWallConditionPayloads(
  projectGeometry = {},
  semantics = null,
) {
  const resolvedSemantics =
    semantics || deriveBaseConditionSemantics(projectGeometry, {});
  return (projectGeometry.walls || [])
    .filter((wall) => wall.exterior === true || wall.kind === "exterior")
    .map((wall, index) => ({
      id: wall.id ? `base-wall:${wall.id}` : undefined,
      condition_type: "base_wall_condition",
      level_id: wall.level_id || null,
      start: wall.start,
      end: wall.end,
      bbox:
        wall.bbox ||
        buildBoundingBoxFromPolygon([wall.start, wall.end].filter(Boolean)),
      plinth_height_m: roundMetric(resolvedSemantics.plinthHeightM || 0.15),
      ground_line_elevation_m: roundMetric(resolvedSemantics.gradeDeltaM || 0),
      support_mode: "explicit_ground_primitives",
      wall_id: wall.id || `wall:${index}`,
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-base-wall-condition",
        wall_id: wall.id || null,
      },
    }));
}

export function deriveGroundRelationPrimitives(
  projectGeometry = {},
  input = {},
) {
  const semantics = deriveBaseConditionSemantics(projectGeometry, input);
  const footprint = getPrimaryFootprint(projectGeometry);
  const bbox =
    footprint.bbox ||
    buildBoundingBoxFromPolygon(
      footprint.polygon || projectGeometry.site?.buildable_polygon || [],
    );
  if (!bbox) {
    return [];
  }
  const width = Number(bbox.width || 0);
  const height = Number(bbox.height || 0);
  const baseConditions = [
    {
      condition_type: semantics.groundCondition,
      polygon:
        footprint.polygon?.length > 0
          ? footprint.polygon
          : rectanglePolygonFromBounds(
              bbox.min_x,
              bbox.min_y,
              bbox.max_x,
              bbox.max_y,
            ),
      bbox,
      plinth_height_m: semantics.plinthHeightM,
      ground_line_elevation_m: 0,
      support_mode: "explicit_ground_primitives",
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-ground-condition",
      },
    },
    {
      condition_type: "ground_line",
      start: { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
      end: { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
      bbox: buildBoundingBoxFromPolygon([
        { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
        { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
      ]),
      plinth_height_m: semantics.plinthHeightM,
      ground_line_elevation_m: 0,
      support_mode: "explicit_ground_primitives",
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-ground-line",
      },
    },
  ];

  if (semantics.plinthHeightM > 0.02) {
    baseConditions.push({
      condition_type: "plinth_line",
      start: {
        x: roundMetric(bbox.min_x),
        y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
      },
      end: {
        x: roundMetric(bbox.max_x),
        y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
      },
      bbox: buildBoundingBoxFromPolygon([
        {
          x: roundMetric(bbox.min_x),
          y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
        },
        {
          x: roundMetric(bbox.max_x),
          y: roundMetric(bbox.max_y - Math.min(height * 0.04, 0.35)),
        },
      ]),
      plinth_height_m: semantics.plinthHeightM,
      ground_line_elevation_m: semantics.plinthHeightM,
      support_mode: "explicit_ground_primitives",
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-plinth-line",
      },
    });
  }

  if (projectGeometry.slabs?.length) {
    const slab = projectGeometry.slabs[0];
    baseConditions.push({
      condition_type: "slab_ground_interface",
      level_id: slab.level_id || null,
      polygon: slab.polygon || [],
      bbox: slab.bbox || bbox,
      plinth_height_m: semantics.plinthHeightM,
      ground_line_elevation_m: 0,
      support_mode: "explicit_ground_primitives",
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-slab-ground-interface",
        slab_id: slab.id || null,
      },
    });
  }

  if (semantics.hasStepCondition || semantics.supportMode === "graded") {
    baseConditions.push({
      condition_type: semantics.hasStepCondition ? "step_line" : "grade_break",
      start: {
        x: roundMetric(bbox.min_x + width * 0.25),
        y: roundMetric(bbox.max_y - height * 0.08),
      },
      end: {
        x: roundMetric(bbox.max_x - width * 0.25),
        y: roundMetric(bbox.max_y - height * 0.18),
      },
      bbox: buildBoundingBoxFromPolygon([
        {
          x: roundMetric(bbox.min_x + width * 0.25),
          y: roundMetric(bbox.max_y - height * 0.08),
        },
        {
          x: roundMetric(bbox.max_x - width * 0.25),
          y: roundMetric(bbox.max_y - height * 0.18),
        },
      ]),
      plinth_height_m: semantics.plinthHeightM,
      ground_line_elevation_m: semantics.gradeDeltaM,
      support_mode: "explicit_ground_primitives",
      provenance: {
        source: "foundation-primitive-synthesis-service",
        derivation: "phase17-ground-step",
      },
    });
  }

  return [
    ...baseConditions,
    ...buildBaseWallConditionPayloads(projectGeometry, semantics),
  ].map((entry) => ({
    ...entry,
    support_mode: normalizeBaseConditionSupportMode(entry),
  }));
}

export function buildCanonicalFoundationPrimitivePayloads({
  projectGeometry = {},
  input = {},
} = {}) {
  const explicit = input.foundations || [];
  const explicitBaseConditions =
    input.base_conditions || input.baseConditions || [];
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map((entry) => ({
      ...entry,
      support_mode: normalizeFoundationSupportMode(entry),
    }));
  }
  if (Array.isArray(explicitBaseConditions) && explicitBaseConditions.length) {
    return [];
  }

  const exteriorWalls = (projectGeometry.walls || []).filter(
    (wall) => wall.exterior === true || wall.kind === "exterior",
  );
  const perimeterPayloads = exteriorWalls.map((wall) => ({
    foundation_type: "perimeter_footing",
    level_id: wall.level_id || null,
    start: wall.start,
    end: wall.end,
    bbox:
      wall.bbox ||
      buildBoundingBoxFromPolygon([wall.start, wall.end].filter(Boolean)),
    depth_m: 0.8,
    thickness_m: Math.max(0.38, Number(wall.thickness_m || 0.2) + 0.14),
    support_mode: "explicit_ground_primitives",
    provenance: {
      source: "foundation-primitive-synthesis-service",
      derivation: "phase17-exterior-wall-footing",
      wall_id: wall.id || null,
    },
  }));

  return [
    ...perimeterPayloads,
    ...synthesizeFoundationZonePayloads(projectGeometry),
  ].map((entry) => ({
    ...entry,
    support_mode: normalizeFoundationSupportMode(entry),
  }));
}

export function summarizeCanonicalFoundationTruth({
  projectGeometry = {},
  foundations = [],
  baseConditions = [],
} = {}) {
  return summarizeCanonicalFoundationTruthModel({
    projectGeometry,
    foundations,
    baseConditions,
  });
}

export default {
  deriveBaseConditionSemantics,
  synthesizeFoundationZonePayloads,
  buildBaseWallConditionPayloads,
  deriveGroundRelationPrimitives,
  buildCanonicalFoundationPrimitivePayloads,
  summarizeCanonicalFoundationTruth,
};
