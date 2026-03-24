import { ArchitecturalFloorPlanGenerator } from "../../services/svg/ArchitecturalFloorPlanGenerator.js";

function createMockGeometry() {
  return {
    dimensions: { width: 10, length: 8 },
    openings: {
      north: [{ floor: 0, type: "window", x: 3 }],
      south: [],
      east: [],
      west: [],
    },
    getFloorPlanData() {
      return {
        width: 10,
        length: 8,
        wallThickness: 0.3,
        name: "Ground Floor",
        rooms: [
          {
            name: "Living Room",
            x: 0.3,
            y: 0.3,
            width: 4.2,
            length: 3.2,
            area: 13.44,
            hasDoor: true,
          },
          {
            name: "Kitchen",
            x: 4.8,
            y: 0.3,
            width: 2.8,
            length: 3.2,
            area: 8.96,
            hasDoor: true,
          },
        ],
        walls: [
          {
            id: "ext-n",
            type: "exterior",
            thickness: 0.3,
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
          },
          {
            id: "ext-e",
            type: "exterior",
            thickness: 0.3,
            start: { x: 10, y: 0 },
            end: { x: 10, y: 8 },
          },
          {
            id: "ext-s",
            type: "exterior",
            thickness: 0.3,
            start: { x: 10, y: 8 },
            end: { x: 0, y: 8 },
          },
          {
            id: "ext-w",
            type: "exterior",
            thickness: 0.3,
            start: { x: 0, y: 8 },
            end: { x: 0, y: 0 },
          },
          {
            id: "int-1",
            type: "interior",
            thickness: 0.12,
            start: { x: 4.5, y: 0.3 },
            end: { x: 4.5, y: 3.5 },
          },
        ],
      };
    },
  };
}

describe("ArchitecturalFloorPlanGenerator sheetMode", () => {
  it("suppresses internal chrome in sheetMode", () => {
    const generator = new ArchitecturalFloorPlanGenerator({
      sheetMode: true,
      showDimensions: true,
      showFurniture: true,
    });

    const svg = generator.generate(createMockGeometry(), 0);

    expect(svg).not.toContain('class="north-arrow"');
    expect(svg).not.toContain('class="scale-bar"');
    expect(svg).not.toContain("Ground Floor");
  });

  it("applies heavier structural line weights in sheetMode", () => {
    const baseGenerator = new ArchitecturalFloorPlanGenerator({
      showDimensions: true,
      showFurniture: true,
    });
    const sheetGenerator = new ArchitecturalFloorPlanGenerator({
      sheetMode: true,
      showDimensions: true,
      showFurniture: true,
    });

    const baseSvg = baseGenerator.generate(createMockGeometry(), 0);
    const sheetSvg = sheetGenerator.generate(createMockGeometry(), 0);

    expect(baseSvg).toContain('stroke-width="1.5"');
    expect(sheetSvg).toContain('stroke-width="2.25"');
    expect(baseSvg).toContain('stroke-width="0.5"');
    expect(sheetSvg).toContain('stroke-width="0.75"');
    expect(baseSvg).toContain('stroke-width="2"');
    expect(sheetSvg).toContain('stroke-width="3"');
  });

  it("respects showNorthArrow when sheetMode is off", () => {
    const generator = new ArchitecturalFloorPlanGenerator({
      showNorthArrow: false,
      showDimensions: false,
      showFurniture: false,
    });

    const svg = generator.generate(createMockGeometry(), 0);

    expect(svg).not.toContain('class="north-arrow"');
    expect(svg).toContain('class="scale-bar"');
  });
});
