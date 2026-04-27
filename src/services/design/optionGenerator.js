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
}) {
  // aspect = width / depth (so width = sqrt(area * aspect), depth = area / width)
  let width = Math.sqrt(Math.max(1, footprintArea) * Math.max(0.5, aspect));
  let depth = footprintArea / Math.max(1, width);
  if (longAxis === "ns") {
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
 * Generate ≥3 rectangular design options with different aspect/orientation.
 * Returns an array of OptionSpec; pass to optionScorer.scoreOption.
 *
 * @returns {Array<object>}
 */
export function generateRectangularOptions({
  brief,
  site,
  levelAreas = [],
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

  return [
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

export default { generateRectangularOptions };
