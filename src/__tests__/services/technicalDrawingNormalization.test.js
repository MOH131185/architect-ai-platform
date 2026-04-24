import { resolveHeroGenerationDependencies } from "../../services/design/heroDesignAuthorityService";
import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer";
import { buildSectionConstructionGeometry } from "../../services/drawing/sectionConstructionGeometryService";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer";
import { projectFacadeGeometry } from "../../services/facade/facadeProjectionService";

function buildOffsetGeometry() {
  return {
    site: {
      buildable_bbox: {
        min_x: 100,
        min_y: 200,
        max_x: 140,
        max_y: 240,
        width: 40,
        height: 40,
      },
      boundary_bbox: {
        min_x: 100,
        min_y: 200,
        max_x: 140,
        max_y: 240,
        width: 40,
        height: 40,
      },
    },
    levels: [
      { id: "level-0", level_number: 0, height_m: 3.2 },
      { id: "level-1", level_number: 1, height_m: 3.2 },
    ],
    footprints: [
      {
        id: "fp-0",
        level_id: "level-0",
        bbox: {
          min_x: 110,
          min_y: 205,
          max_x: 120,
          max_y: 213,
          width: 10,
          height: 8,
        },
      },
      {
        id: "fp-1",
        level_id: "level-1",
        bbox: {
          min_x: 110,
          min_y: 205,
          max_x: 120,
          max_y: 213,
          width: 10,
          height: 8,
        },
      },
    ],
    walls: [
      {
        id: "wall-south-0",
        exterior: true,
        side: "south",
        level_id: "level-0",
        start: { x: 110, y: 205 },
        end: { x: 120, y: 205 },
        thickness_m: 0.2,
      },
      {
        id: "wall-south-1",
        exterior: true,
        side: "south",
        level_id: "level-1",
        start: { x: 110, y: 205 },
        end: { x: 120, y: 205 },
        thickness_m: 0.2,
      },
      {
        id: "wall-north-0",
        exterior: true,
        side: "north",
        level_id: "level-0",
        start: { x: 110, y: 213 },
        end: { x: 120, y: 213 },
        thickness_m: 0.2,
      },
      {
        id: "wall-east-0",
        exterior: true,
        side: "east",
        level_id: "level-0",
        start: { x: 120, y: 205 },
        end: { x: 120, y: 213 },
        thickness_m: 0.2,
      },
      {
        id: "wall-west-0",
        exterior: true,
        side: "west",
        level_id: "level-0",
        start: { x: 110, y: 205 },
        end: { x: 110, y: 213 },
        thickness_m: 0.2,
      },
    ],
    windows: [
      {
        id: "window-south-0",
        wall_id: "wall-south-0",
        level_id: "level-0",
        position_m: { x: 115, y: 205 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-south-1",
        wall_id: "wall-south-1",
        level_id: "level-1",
        position_m: { x: 116, y: 205 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-south-0",
        wall_id: "wall-south-0",
        level_id: "level-0",
        position_m: { x: 112.5, y: 205 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    rooms: [
      {
        id: "room-living",
        name: "Living",
        level_id: "level-0",
        actual_area: 30,
        bbox: {
          min_x: 110,
          min_y: 205,
          max_x: 116,
          max_y: 210,
          width: 6,
          height: 5,
        },
      },
      {
        id: "room-bedroom",
        name: "Bedroom",
        level_id: "level-1",
        actual_area: 28,
        bbox: {
          min_x: 114,
          min_y: 206,
          max_x: 120,
          max_y: 211,
          width: 6,
          height: 5,
        },
      },
    ],
    roof: {
      type: "pitched gable",
    },
  };
}

function extractCoordinateValues(svg = "") {
  return [...svg.matchAll(/\s(?:x|x1|x2)="(-?\d+(?:\.\d+)?)"/g)].map((match) =>
    Number(match[1]),
  );
}

describe("technical drawing normalization", () => {
  test("facade projection uses building envelope instead of site bounds", () => {
    const projection = projectFacadeGeometry(buildOffsetGeometry(), "south");

    expect(projection.sideWidthM).toBeGreaterThan(8);
    expect(projection.sideWidthM).toBeLessThan(12);
    expect(projection.projectedWindows[0].center_m).toBeGreaterThan(0);
    expect(projection.projectedWindows[0].center_m).toBeLessThan(6.5);
    expect(projection.projectedDoors[0].center_m).toBeGreaterThan(0);
    expect(projection.projectedDoors[0].center_m).toBeLessThan(4);
  });

  test("section construction geometry normalizes section spans to the building origin", () => {
    const geometry = buildOffsetGeometry();
    const sectionEvidence = {
      intersections: {
        rooms: geometry.rooms,
        walls: [
          {
            id: "wall-cut-0",
            level_id: "level-0",
            thickness_m: 0.2,
            bbox: {
              min_x: 112,
              min_y: 205,
              max_x: 112.2,
              max_y: 213,
              width: 0.2,
              height: 8,
            },
          },
        ],
        openings: [
          {
            id: "opening-cut-0",
            level_id: "level-0",
            bbox: {
              min_x: 111,
              min_y: 207,
              max_x: 112.4,
              max_y: 207.2,
              width: 1.4,
              height: 0.2,
            },
            clipGeometry: {
              sillHeightM: 0.9,
              headHeightM: 2.1,
            },
          },
        ],
      },
      summary: {
        geometryCommunicable: true,
      },
    };

    const construction = buildSectionConstructionGeometry({
      geometry,
      sectionType: "longitudinal",
      sectionEvidence,
      baseX: 100,
      baseY: 600,
      scale: 20,
    });

    expect(construction.rooms[0].x).toBeGreaterThanOrEqual(90);
    expect(construction.rooms[0].x).toBeLessThanOrEqual(120);
    expect(construction.rooms[1].x).toBeGreaterThanOrEqual(100);
    expect(construction.rooms[1].x).toBeLessThanOrEqual(140);
    expect(construction.foundation.x).toBeGreaterThan(80);
    expect(construction.foundation.x).toBeLessThan(110);
  });

  test("elevation and section SVGs stay on-canvas for offset geometry", () => {
    const geometry = buildOffsetGeometry();
    const elevation = renderElevationSvg(
      geometry,
      {},
      { orientation: "south" },
    );
    const section = renderSectionSvg(
      geometry,
      {},
      { sectionType: "longitudinal" },
    );
    const elevationXs = extractCoordinateValues(elevation.svg);
    const sectionXs = extractCoordinateValues(section.svg);

    expect(Math.min(...elevationXs)).toBeGreaterThanOrEqual(-10);
    expect(Math.max(...elevationXs)).toBeLessThanOrEqual(1210);
    expect(Math.min(...sectionXs)).toBeGreaterThanOrEqual(-100);
    expect(Math.max(...sectionXs)).toBeLessThanOrEqual(1210);
  });

  test("hero dependency resolution tolerates null geometry inputs", () => {
    expect(() =>
      resolveHeroGenerationDependencies({
        projectGeometry: null,
        compiledProject: null,
      }),
    ).not.toThrow();
  });
});
