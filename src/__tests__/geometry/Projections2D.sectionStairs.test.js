describe("Projections2D section stair SVG guards", () => {
  test("projectSection skips invalid stair coordinates instead of emitting NaN", async () => {
    const { projectSection } = await import("../../geometry/Projections2D.js");

    const model = {
      envelope: { height: 5700 },
      roof: { ridgeHeight: 7800 },
      stairs: [
        {
          width: 1000,
          length: 3000,
          position: { x: Number.NaN, y: 1500 },
        },
      ],
      floors: [
        {
          index: 0,
          zBase: 0,
          zTop: 3000,
          floorHeight: 3000,
          slab: { thickness: 200 },
          rooms: [],
        },
        {
          index: 1,
          zBase: 3000,
          zTop: 5700,
          floorHeight: 2700,
          slab: { thickness: 200 },
          rooms: [],
        },
      ],
      getDimensionsMeters() {
        return { width: 10, depth: 8, ridgeHeight: 7.8 };
      },
      getRoofProfile(orientation) {
        if (orientation === "N") {
          return [
            { x: -5000, z: 3000 },
            { x: 0, z: 7800 },
            { x: 5000, z: 3000 },
          ];
        }

        return [
          { x: -4000, z: 3000 },
          { x: 4000, z: 3000 },
        ];
      },
    };

    const svg = projectSection(model, "longitudinal");

    expect(svg).not.toMatch(/NaN/i);
    expect(svg).not.toMatch(/undefined/i);
  });
});
