import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";

const GEOMETRY_FIXTURE = {
  project_id: "drawing-demo",
  levels: [
    {
      id: "ground",
      name: "Ground Floor",
      rooms: [
        {
          id: "living",
          name: "Living Room",
          bbox: { x: 0, y: 0, width: 6, height: 4 },
        },
      ],
      walls: [],
      doors: [],
      windows: [],
      stairs: [],
    },
  ],
};

describe("Phase 1 SVG renderers", () => {
  test("renders a plan svg placeholder", () => {
    const result = renderPlanSvg(GEOMETRY_FIXTURE);

    expect(result.svg).toContain("<svg");
    expect(result.renderer).toBeDefined();
  });

  test("renders an elevation svg placeholder", () => {
    const result = renderElevationSvg(GEOMETRY_FIXTURE, {
      roof_language: "pitched-gable-or-hip",
    });

    expect(result.svg).toContain("<svg");
    expect(result.orientation).toBe("south");
  });

  test("renders a section svg placeholder", () => {
    const result = renderSectionSvg(GEOMETRY_FIXTURE);

    expect(result.svg).toContain("<svg");
    expect(result.section_type).toBe("longitudinal");
  });
});
