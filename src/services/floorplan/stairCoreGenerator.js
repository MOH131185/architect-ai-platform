import {
  buildBoundingBoxFromRect,
  createStableId,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { createStairGeometry } from "../cad/geometryFactory.js";

function chooseVariant(buildableBbox = {}, constraints = {}) {
  const requested =
    constraints.coreVariant ||
    constraints.core_variant ||
    constraints.stairVariant ||
    constraints.stair_variant;
  if (
    ["central", "west", "east", "side-west", "side-east"].includes(requested)
  ) {
    return requested;
  }

  const width = Number(buildableBbox.width || 0);
  const depth = Number(buildableBbox.height || 0);
  const aspectRatio = depth > 0 ? width / depth : 0;

  // Side cores preserve larger uninterrupted rooms for the default residential
  // solver. Central cores are still available explicitly, but should not be
  // the default unless the plate is wide enough to absorb the split.
  if (width >= 20 && aspectRatio >= 1.4) {
    return "central";
  }

  return "side-west";
}

function resolveCoreFootprint(buildableBbox = {}, variant = "side-west") {
  const width = roundMetric(
    Math.max(2.8, Math.min(3.4, (buildableBbox.width || 12) * 0.18)),
  );
  const depth = roundMetric(
    Math.max(4.8, Math.min(5.8, (buildableBbox.height || 10) * 0.42)),
  );
  const centerY = roundMetric(
    buildableBbox.min_y + (buildableBbox.height - depth) / 2,
  );

  if (variant === "central") {
    const centerX = roundMetric(
      buildableBbox.min_x + (buildableBbox.width - width) / 2,
    );
    return {
      variant,
      bbox: buildBoundingBoxFromRect(centerX, centerY, width, depth),
    };
  }

  if (variant === "east" || variant === "side-east") {
    const x = roundMetric(buildableBbox.max_x - width);
    return {
      variant: "side-east",
      bbox: buildBoundingBoxFromRect(x, centerY, width, depth),
    };
  }

  return {
    variant: "side-west",
    bbox: buildBoundingBoxFromRect(buildableBbox.min_x, centerY, width, depth),
  };
}

function buildRemainingSegments(buildableBbox = {}, coreFootprint = {}) {
  const core = coreFootprint.bbox;
  if (!core) {
    return [buildableBbox];
  }

  if (coreFootprint.variant === "central") {
    return [
      buildBoundingBoxFromRect(
        buildableBbox.min_x,
        buildableBbox.min_y,
        Math.max(2.6, core.min_x - buildableBbox.min_x),
        buildableBbox.height,
      ),
      buildBoundingBoxFromRect(
        core.max_x,
        buildableBbox.min_y,
        Math.max(2.6, buildableBbox.max_x - core.max_x),
        buildableBbox.height,
      ),
    ].filter((bbox) => bbox.width > 2.4);
  }

  if (coreFootprint.variant === "side-east") {
    return [
      buildBoundingBoxFromRect(
        buildableBbox.min_x,
        buildableBbox.min_y,
        Math.max(2.6, core.min_x - buildableBbox.min_x),
        buildableBbox.height,
      ),
    ];
  }

  return [
    buildBoundingBoxFromRect(
      core.max_x,
      buildableBbox.min_y,
      Math.max(2.6, buildableBbox.max_x - core.max_x),
      buildableBbox.height,
    ),
  ];
}

export function resolveStairCorePlan({
  buildableBbox = {},
  levelCount = 1,
  constraints = {},
} = {}) {
  if (levelCount <= 1) {
    return {
      required: false,
      variant: "none",
      levels: [],
      placementSegments: [buildableBbox],
    };
  }

  const coreFootprint = resolveCoreFootprint(
    buildableBbox,
    chooseVariant(buildableBbox, constraints),
  );

  return {
    required: true,
    variant: coreFootprint.variant,
    levels: Array.from({ length: levelCount }, (_, index) => ({
      level_number: index,
      core_bbox: coreFootprint.bbox,
      landing_depth_m: 1.2,
      stair_width_m: coreFootprint.bbox.width,
      stair_depth_m: coreFootprint.bbox.height,
    })),
    placementSegments: buildRemainingSegments(buildableBbox, coreFootprint),
  };
}

export function generateStairCore({
  projectId = "phase3-project",
  levels = [],
  buildableBbox = {},
  constraints = {},
} = {}) {
  const plan = resolveStairCorePlan({
    buildableBbox,
    levelCount: levels.length,
    constraints,
  });

  if (!plan.required) {
    return {
      variant: "none",
      stairs: [],
      coreRooms: [],
      plan,
    };
  }

  const stairs = levels.map((level, index) =>
    createStairGeometry(projectId, level.id, {
      id: createStableId("stair", projectId, level.id, plan.variant, index),
      type: "doglegged",
      x: plan.levels[index].core_bbox.min_x,
      y: plan.levels[index].core_bbox.min_y,
      width_m: plan.levels[index].core_bbox.width,
      depth_m: plan.levels[index].core_bbox.height,
      bbox: plan.levels[index].core_bbox,
      polygon: rectangleToPolygon(
        plan.levels[index].core_bbox.min_x,
        plan.levels[index].core_bbox.min_y,
        plan.levels[index].core_bbox.width,
        plan.levels[index].core_bbox.height,
      ),
      connects_to_level:
        index < levels.length - 1 ? levels[index + 1].level_number : null,
      source: "stair-core-generator",
    }),
  );

  const coreRooms = levels.map((level, index) => ({
    id: createStableId("room", projectId, level.id, "stair-core"),
    name: "Stair Core",
    type: "stair_core",
    zone: "core",
    privacy_level: 1,
    requires_daylight: false,
    wet_zone: false,
    access_requirements: ["vertical_circulation"],
    adjacency_preferences: [],
    target_area: roundMetric(
      plan.levels[index].core_bbox.width * plan.levels[index].core_bbox.height,
    ),
    min_area: roundMetric(
      plan.levels[index].core_bbox.width * plan.levels[index].core_bbox.height,
    ),
    max_area: roundMetric(
      plan.levels[index].core_bbox.width * plan.levels[index].core_bbox.height,
    ),
    actual_area: roundMetric(
      plan.levels[index].core_bbox.width * plan.levels[index].core_bbox.height,
    ),
    bbox: plan.levels[index].core_bbox,
    polygon: rectangleToPolygon(
      plan.levels[index].core_bbox.min_x,
      plan.levels[index].core_bbox.min_y,
      plan.levels[index].core_bbox.width,
      plan.levels[index].core_bbox.height,
    ),
    centroid: {
      x: roundMetric(
        plan.levels[index].core_bbox.min_x +
          plan.levels[index].core_bbox.width / 2,
      ),
      y: roundMetric(
        plan.levels[index].core_bbox.min_y +
          plan.levels[index].core_bbox.height / 2,
      ),
    },
    metadata: {
      generated: true,
      core_variant: plan.variant,
    },
    source: "stair-core-generator",
  }));

  return {
    variant: plan.variant,
    stairs,
    coreRooms,
    plan,
  };
}

export default {
  generateStairCore,
  resolveStairCorePlan,
};
