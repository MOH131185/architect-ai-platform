/**
 * Design-option generator. Plan §6.7: candidate generation must produce
 * multiple typological variants (≥3) for scoring before geometry is finalised.
 *
 * V1 generates rectangular variants with different aspects and orientations
 * (long axis E-W vs N-S). Courtyard / L-shape / pavilion typologies will be
 * added once the placer supports non-convex polygons.
 */

import {
  buildBoundingBoxFromPolygon,
  rectangleToPolygon,
} from "../cad/projectGeometrySchema.js";

function clampToBuildable(width, depth, buildableBbox, targetArea) {
  // Preserve the target footprint area when clamping against the buildable
  // bounding box. If width exceeds the buildable width, depth is rebalanced;
  // if depth exceeds the buildable depth, width is rebalanced. Final values
  // are bounded by buildable dims and a hard 8 m floor.
  let w = Math.max(8, Number(width) || 0);
  let d = Math.max(8, Number(depth) || 0);
  const area = Number(targetArea) > 0 ? Number(targetArea) : w * d;
  if (w > buildableBbox.width) {
    w = Math.max(8, buildableBbox.width);
    d = area / w;
  }
  if (d > buildableBbox.height) {
    d = Math.max(8, buildableBbox.height);
    w = area / d;
  }
  if (w > buildableBbox.width) {
    w = Math.max(8, buildableBbox.width);
  }
  if (d > buildableBbox.height) {
    d = Math.max(8, buildableBbox.height);
  }
  return { width: w, depth: d };
}

function makeOption({
  optionId,
  label,
  typology,
  aspect,
  longAxis,
  footprintArea,
  buildableBbox,
  preserveAspect = false,
}) {
  // aspect = width / depth (so width = sqrt(area * aspect), depth = area / width)
  let width = Math.sqrt(Math.max(1, footprintArea) * Math.max(0.5, aspect));
  let depth = footprintArea / Math.max(1, width);
  if (longAxis === "ns" && preserveAspect !== true) {
    [width, depth] = [depth, width];
  }
  const sized = clampToBuildable(width, depth, buildableBbox, footprintArea);
  const x =
    Number(buildableBbox.min_x || 0) +
    Math.max(0, (Number(buildableBbox.width || 0) - sized.width) / 2);
  const y =
    Number(buildableBbox.min_y || 0) +
    Math.max(0, (Number(buildableBbox.height || 0) - sized.depth) / 2);
  const polygon = rectangleToPolygon(x, y, sized.width, sized.depth);
  return {
    option_id: optionId,
    label,
    typology,
    aspect: Number(aspect.toFixed(3)),
    long_axis: longAxis,
    archetype_preferred: preserveAspect === true,
    footprint_polygon: polygon,
    footprint_bbox: buildBoundingBoxFromPolygon(polygon),
    footprint_width_m: sized.width,
    footprint_depth_m: sized.depth,
    fits_buildable:
      sized.width >= 8 &&
      sized.depth >= 8 &&
      sized.width <= buildableBbox.width + 0.001 &&
      sized.depth <= buildableBbox.height + 0.001,
  };
}

/**
 * Phase C — UK regional vernacular layout archetypes (paper §4.3).
 *
 * Each archetype declares an aspect preference + long-axis orientation that
 * the option generator can emit alongside the default candidates. The
 * archetype is read from `localStyle.style_provenance.layout_archetype`
 * (propagated from `vernacularPack.layout_archetype` by Phase A). When the
 * archetype is null / unknown, behaviour falls back to the existing 4-option
 * set so non-UK and flag-off runs are unchanged.
 *
 * `aspect` is `width / depth`, so values < 1 mean the plot is deeper than
 * wide (the long axis is street-to-back) — the canonical London terrace
 * shape. Values > 1 mean wide-and-shallow.
 *
 * @private
 */
const ARCHETYPE_OPTION_SPECS = Object.freeze({
  // London stucco terrace + Victorian terrace — narrow front, deep plot,
  // long axis runs front-to-back (perpendicular to the street).
  linear_side_hall: [
    {
      optionId: "option-archetype-terrace-narrow-deep",
      label: "Terrace — narrow front, deep plot (side hall)",
      typology: "linear_side_hall_narrow",
      aspect: 0.42,
      longAxis: "ns",
    },
    {
      optionId: "option-archetype-terrace-medium",
      label: "Terrace — medium front-to-back (side hall)",
      typology: "linear_side_hall_medium",
      aspect: 0.55,
      longAxis: "ns",
    },
  ],
  // Manchester back-to-back — narrow frontage, two-up two-down, slightly
  // less deep than London terrace because the back is shared with the next
  // dwelling.
  narrow_two_up_two_down: [
    {
      optionId: "option-archetype-back-to-back",
      label: "Back-to-back — narrow frontage two-up two-down",
      typology: "narrow_two_up_two_down",
      aspect: 0.55,
      longAxis: "ns",
    },
  ],
  // Edinburgh tenement — square or slightly deep plan with a common stair
  // off a single shared entrance.
  tenement_common_stair: [
    {
      optionId: "option-archetype-tenement",
      label: "Tenement — common-stair plan",
      typology: "tenement_common_stair",
      aspect: 0.85,
      longAxis: "ns",
    },
  ],
  // Cotswolds cottage — near-square plan, central stair, rooms around the
  // stair core.
  central_stair_square: [
    {
      optionId: "option-archetype-cottage-square",
      label: "Cottage — near-square central-stair plan",
      typology: "central_stair_square",
      aspect: 1.05,
      longAxis: "ew",
    },
  ],
});

/**
 * Generate ≥3 rectangular design options with different aspect/orientation.
 * Returns an array of OptionSpec; pass to optionScorer.scoreOption.
 *
 * When `localStyle.style_provenance.layout_archetype` resolves a UK regional
 * archetype, the generator prepends archetype-specific candidates ahead of
 * the default 4 so the scorer / selector picks one of them when it fits the
 * site. Pack-off runs are unchanged.
 *
 * @returns {Array<object>}
 */
export function generateRectangularOptions({
  brief,
  site,
  levelAreas = [],
  archetype = null,
} = {}) {
  if (!brief || !site) {
    throw new Error("generateRectangularOptions requires {brief, site}");
  }
  const buildableBbox = buildBoundingBoxFromPolygon(
    site.buildable_polygon || [],
  );
  const levelCount = Math.max(1, Number(brief.target_storeys || 1));
  const footprintArea = Math.max(
    24,
    ...levelAreas,
    Number(brief.target_gia_m2 || 120) / levelCount,
  );

  // Default aspect from brief building type, used as the reference option.
  const defaultAspect = brief.building_type === "community" ? 1.45 : 1.25;

  const archetypeKey =
    typeof archetype === "string" && archetype.trim().length > 0
      ? archetype.trim()
      : null;
  const archetypeSpecs = archetypeKey
    ? ARCHETYPE_OPTION_SPECS[archetypeKey] || []
    : [];
  const archetypeOptions = archetypeSpecs.map((spec) =>
    makeOption({
      optionId: spec.optionId,
      label: spec.label,
      typology: spec.typology,
      aspect: spec.aspect,
      longAxis: spec.longAxis,
      footprintArea,
      buildableBbox,
      preserveAspect: true,
    }),
  );

  return [
    // Archetype-specific candidates lead so the scorer can promote them
    // when they fit the buildable polygon. Falls through to the default
    // four if no archetype is supplied or the buildable polygon rejects
    // them.
    ...archetypeOptions,
    makeOption({
      optionId: "option-bar-ew",
      label: "Bar — long axis east-west",
      typology: "bar",
      aspect: 2.0,
      longAxis: "ew",
      footprintArea,
      buildableBbox,
    }),
    makeOption({
      optionId: "option-compact",
      label: "Compact block",
      typology: "compact",
      aspect: 1.0,
      longAxis: "ew",
      footprintArea,
      buildableBbox,
    }),
    makeOption({
      optionId: "option-typology-default",
      label: `Programme-fit ${defaultAspect.toFixed(2)} aspect`,
      typology: "default",
      aspect: defaultAspect,
      longAxis: "ew",
      footprintArea,
      buildableBbox,
    }),
    makeOption({
      optionId: "option-bar-ns",
      label: "Bar — long axis north-south",
      typology: "bar_ns",
      aspect: 2.0,
      longAxis: "ns",
      footprintArea,
      buildableBbox,
    }),
  ];
}

export const __optionGeneratorTesting = Object.freeze({
  ARCHETYPE_OPTION_SPECS,
});

export default { generateRectangularOptions };
