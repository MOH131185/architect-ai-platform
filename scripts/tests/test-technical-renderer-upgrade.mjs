import assert from "node:assert/strict";

import {
  generateEnhancedFloorPlanSVG,
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
} from "../../src/services/design/enhancedTechnicalDrawingAdapter.js";
import {
  generateClimateCardSVG,
  generateMaterialPaletteSVG,
  generateSchedulesSVG,
} from "../../src/services/design/technicalDrawingGenerator.js";
import {
  getEnvelopeDrawingBounds,
  getLevelDrawingBounds,
} from "../../src/services/drawing/drawingBounds.js";

function rectangle(x, y, width, height) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

const sampleDNA = {
  id: "phase21-smoke",
  architecturalStyle: "Contemporary timber",
  roof: {
    type: "pitched_gable",
    roof_language: "pitched gable",
  },
  dimensions: {
    width: 10,
    length: 14,
    depth: 10,
    floors: 2,
    floorHeights: [3, 3],
    wallThickness: 0.3,
    internalWallThickness: 0.12,
  },
  materials: [
    {
      name: "Thermally modified timber",
      application: "facade",
      hexColor: "#9b6a46",
    },
    { name: "Standing seam metal", application: "roof", hexColor: "#5b6470" },
    {
      name: "Powder coated aluminium",
      application: "window",
      hexColor: "#2f3944",
    },
  ],
  site: {
    address: "Benchmark Site",
    climate: {
      type: "Cool temperate",
      seasonal: {
        winter: { avgTemp: 4, humidity: 74 },
        spring: { avgTemp: 11, humidity: 66 },
        summer: { avgTemp: 21, humidity: 58 },
        autumn: { avgTemp: 12, humidity: 71 },
      },
    },
    sun_path: {
      summer: "High solar altitude",
      winter: "Low solar altitude",
      optimalOrientation: "South-east living spaces",
    },
  },
  populatedGeometry: {
    floors: [
      {
        id: "ground",
        level: 0,
        polygon: rectangle(0, 0, 14, 10),
        rooms: [
          {
            id: "living",
            name: "Living Room",
            polygon: rectangle(0, 0, 8, 5),
            area: 40,
          },
          {
            id: "kitchen",
            name: "Kitchen / Dining",
            polygon: rectangle(8, 0, 6, 5),
            area: 30,
          },
          {
            id: "hall",
            name: "Hall",
            polygon: rectangle(0, 5, 4, 5),
            area: 20,
          },
          {
            id: "study",
            name: "Study",
            polygon: rectangle(4, 5, 4, 5),
            area: 20,
          },
          {
            id: "utility",
            name: "Utility",
            polygon: rectangle(8, 5, 6, 5),
            area: 30,
          },
        ],
        walls: [
          {
            id: "g-north",
            start: { x: 0, y: 0 },
            end: { x: 14, y: 0 },
            type: "exterior",
            openings: [
              {
                id: "gw-1",
                type: "window",
                width: 2.2,
                height: 1.5,
                position: { x: 4, y: 0 },
              },
            ],
          },
          {
            id: "g-east",
            start: { x: 14, y: 0 },
            end: { x: 14, y: 10 },
            type: "exterior",
            openings: [
              {
                id: "gw-2",
                type: "window",
                width: 1.6,
                height: 1.5,
                position: { x: 14, y: 3 },
              },
            ],
          },
          {
            id: "g-south",
            start: { x: 14, y: 10 },
            end: { x: 0, y: 10 },
            type: "exterior",
            openings: [
              {
                id: "gd-1",
                type: "door",
                width: 1.0,
                height: 2.1,
                position: { x: 7, y: 10 },
              },
            ],
          },
          {
            id: "g-west",
            start: { x: 0, y: 10 },
            end: { x: 0, y: 0 },
            type: "exterior",
            openings: [
              {
                id: "gw-3",
                type: "window",
                width: 1.4,
                height: 1.5,
                position: { x: 0, y: 7 },
              },
            ],
          },
          {
            id: "g-partition-1",
            start: { x: 8, y: 0 },
            end: { x: 8, y: 10 },
            type: "interior",
          },
          {
            id: "g-partition-2",
            start: { x: 0, y: 5 },
            end: { x: 14, y: 5 },
            type: "interior",
          },
        ],
        openings: [
          {
            id: "g-floor-door",
            type: "door",
            wallId: "g-partition-2",
            width: 0.9,
            height: 2.1,
            position: { x: 4, y: 5 },
          },
        ],
        stairs: [
          {
            id: "stair-core",
            type: "straight_run",
            polygon: rectangle(5.5, 3.5, 2, 4),
            connects_to_level: 1,
          },
        ],
      },
      {
        id: "first",
        level: 1,
        polygon: rectangle(0, 0, 14, 10),
        rooms: [
          {
            id: "bed-1",
            name: "Main Bedroom",
            polygon: rectangle(0, 0, 8, 5),
            area: 40,
          },
          {
            id: "bed-2",
            name: "Bedroom 2",
            polygon: rectangle(8, 0, 6, 5),
            area: 30,
          },
          {
            id: "landing",
            name: "Landing",
            polygon: rectangle(0, 5, 6, 5),
            area: 30,
          },
          {
            id: "bath",
            name: "Bathroom",
            polygon: rectangle(6, 5, 4, 5),
            area: 20,
          },
          {
            id: "bed-3",
            name: "Bedroom 3",
            polygon: rectangle(10, 5, 4, 5),
            area: 20,
          },
        ],
        walls: [
          {
            id: "f-north",
            start: { x: 0, y: 0 },
            end: { x: 14, y: 0 },
            type: "exterior",
            openings: [
              {
                id: "fw-1",
                type: "window",
                width: 2.2,
                height: 1.5,
                position: { x: 4, y: 0 },
              },
            ],
          },
          {
            id: "f-east",
            start: { x: 14, y: 0 },
            end: { x: 14, y: 10 },
            type: "exterior",
            openings: [
              {
                id: "fw-2",
                type: "window",
                width: 1.8,
                height: 1.5,
                position: { x: 14, y: 2.8 },
              },
            ],
          },
          {
            id: "f-south",
            start: { x: 14, y: 10 },
            end: { x: 0, y: 10 },
            type: "exterior",
            openings: [
              {
                id: "fw-3",
                type: "window",
                width: 2.0,
                height: 1.5,
                position: { x: 9, y: 10 },
              },
            ],
          },
          {
            id: "f-west",
            start: { x: 0, y: 10 },
            end: { x: 0, y: 0 },
            type: "exterior",
            openings: [
              {
                id: "fw-4",
                type: "window",
                width: 1.4,
                height: 1.5,
                position: { x: 0, y: 7 },
              },
            ],
          },
          {
            id: "f-partition-1",
            start: { x: 8, y: 0 },
            end: { x: 8, y: 5 },
            type: "interior",
          },
          {
            id: "f-partition-2",
            start: { x: 0, y: 5 },
            end: { x: 14, y: 5 },
            type: "interior",
          },
        ],
      },
    ],
  },
};

const oversizedSiteGeometry = {
  site: {
    boundary_bbox: {
      min_x: -20,
      min_y: -15,
      max_x: 40,
      max_y: 30,
      width: 60,
      height: 45,
    },
    buildable_bbox: {
      min_x: -10,
      min_y: -8,
      max_x: 28,
      max_y: 24,
      width: 38,
      height: 32,
    },
  },
  levels: [{ id: "ground", footprint_id: "fp-ground" }],
  footprints: [
    {
      id: "fp-ground",
      level_id: "ground",
      polygon: rectangle(0, 0, 14, 10),
      bbox: { min_x: 0, min_y: 0, max_x: 14, max_y: 10, width: 14, height: 10 },
    },
  ],
  rooms: [
    {
      id: "living",
      level_id: "ground",
      polygon: rectangle(0, 0, 8, 5),
      bbox: { min_x: 0, min_y: 0, max_x: 8, max_y: 5, width: 8, height: 5 },
    },
  ],
  walls: [
    {
      id: "wall-1",
      level_id: "ground",
      start: { x: 0, y: 0 },
      end: { x: 14, y: 0 },
    },
    {
      id: "wall-2",
      level_id: "ground",
      start: { x: 14, y: 0 },
      end: { x: 14, y: 10 },
    },
  ],
};

const levelBounds = getLevelDrawingBounds(oversizedSiteGeometry, "ground");
assert.equal(levelBounds.width, 14, "level drawing bounds should follow the building footprint");
assert.equal(levelBounds.height, 10, "level drawing bounds should ignore oversized site extents");

const envelopeBounds = getEnvelopeDrawingBounds(oversizedSiteGeometry);
assert.equal(envelopeBounds.width, 14, "elevation/section bounds should follow the building envelope");
assert.equal(envelopeBounds.height, 10, "envelope bounds should ignore oversized site extents");

const plan = generateEnhancedFloorPlanSVG(sampleDNA, "ground", {
  targetWidth: 960,
  targetHeight: 720,
  sheetMode: true,
});
assert.ok(
  plan?.dataUrl?.startsWith("data:image/svg+xml;base64,"),
  "plan should return SVG data URL",
);
assert.ok(
  plan?.svg?.includes("ArchiAISans"),
  "plan SVG should use embedded font stack",
);
assert.equal(plan?.metadata?.renderer, "deterministic-plan-svg");
assert.ok(
  !plan?.svg?.includes("Site Boundary"),
  "sheet-mode floor plan should not include site-context legend noise",
);

const elevation = generateEnhancedElevationSVG(sampleDNA, "south", {
  targetWidth: 960,
  targetHeight: 720,
  sheetMode: true,
});
assert.ok(
  elevation?.dataUrl?.startsWith("data:image/svg+xml;base64,"),
  "elevation should return SVG data URL",
);
assert.ok(
  elevation?.svg?.includes("ArchiAISans"),
  "elevation SVG should use embedded font stack",
);
assert.equal(elevation?.metadata?.renderer, "deterministic-elevation-svg");

const section = generateEnhancedSectionSVG(sampleDNA, "longitudinal", {
  targetWidth: 960,
  targetHeight: 720,
  sheetMode: true,
});
assert.ok(
  section?.dataUrl?.startsWith("data:image/svg+xml;base64,"),
  "section should return SVG data URL",
);
assert.ok(
  section?.svg?.includes("ArchiAISans"),
  "section SVG should use embedded font stack",
);
assert.equal(section?.metadata?.renderer, "deterministic-section-svg");

const schedules = generateSchedulesSVG(sampleDNA, { width: 500, height: 340 });
assert.ok(
  schedules.includes("ArchiAISans"),
  "schedules SVG should use embedded font stack",
);

const climate = generateClimateCardSVG(sampleDNA, sampleDNA.site, {
  width: 500,
  height: 340,
});
assert.ok(
  climate.includes("ArchiAISans"),
  "climate SVG should use embedded font stack",
);

const materials = generateMaterialPaletteSVG(sampleDNA, {
  width: 500,
  height: 340,
});
assert.ok(
  materials.includes("ArchiAISans"),
  "material SVG should use embedded font stack",
);

console.log("technical renderer upgrade smoke test passed");
