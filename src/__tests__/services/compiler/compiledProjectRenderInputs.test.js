import { ensureCompiledProjectRenderInputs } from "../../../services/compiler/compiledProjectRenderInputs.js";

const REQUIRED_3D_PANELS = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createCompiledProject(renderInputs = {}) {
  const footprint = rectangle(0, 0, 12, 9);
  return {
    projectId: "compiled-render-input-test",
    geometryHash: "geom-render-input-test",
    envelope: {
      width_m: 12,
      depth_m: 9,
      height_m: 6,
    },
    footprint: {
      polygon: footprint,
    },
    levels: [
      {
        id: "level-0",
        level_number: 0,
        height_m: 3,
        footprint: { polygon: footprint },
      },
    ],
    roof: {
      type: "gable",
    },
    walls: [
      {
        id: "wall-1",
        levelId: "level-0",
        start: { x: 3, y: 0 },
        end: { x: 3, y: 9 },
      },
      {
        id: "wall-2",
        levelId: "level-0",
        start: { x: 0, y: 4.5 },
        end: { x: 12, y: 4.5 },
      },
    ],
    renderInputs,
  };
}

function weakPlaceholderInputs() {
  return {
    hero_3d: {
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>placeholder_3d</text></svg>',
      dataUrl:
        "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%221%22%20height%3D%221%22%3E%3C%2Fsvg%3E",
      metadata: {
        source: "placeholder",
        model: "placeholder",
        primitiveCount: 0,
      },
    },
    exterior_render: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    axonometric: {
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 1,0 1,1"/></svg>',
      metadata: {
        source: "compiled_project",
        primitiveCount: 1,
      },
    },
    interior_3d: {
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg"><desc>geometryRenderService</desc><polygon points="0,0 1,0 1,1"/></svg>',
      metadata: {
        source: "compiled_project",
        primitiveCount: 1,
        camera: { projection: "orthographic" },
      },
    },
  };
}

describe("ensureCompiledProjectRenderInputs", () => {
  test("rebuilds weak placeholder 3D render inputs from compiled geometry", () => {
    const renderInputs = ensureCompiledProjectRenderInputs(
      createCompiledProject(weakPlaceholderInputs()),
    );

    REQUIRED_3D_PANELS.forEach((panelType) => {
      const renderInput = renderInputs[panelType];
      expect(renderInput).toBeTruthy();
      expect(renderInput.svgString).toContain("<svg");
      expect(renderInput.svgString).not.toMatch(
        /placeholder_3d|geometryRenderService/i,
      );
      expect(renderInput.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(renderInput.metadata.source).toBe("compiled_project");
      expect(renderInput.metadata.primitiveCount).toBeGreaterThanOrEqual(5);
      expect(renderInput.metadata.camera).toEqual(expect.any(Object));
    });
  });

  test("preserves existing strong compiled control SVGs", () => {
    const base = ensureCompiledProjectRenderInputs(createCompiledProject());
    const strongHero = {
      ...base.hero_3d,
      metadata: {
        ...base.hero_3d.metadata,
        customMarker: "preserve-me",
      },
    };

    const renderInputs = ensureCompiledProjectRenderInputs(
      createCompiledProject({ hero_3d: strongHero }),
    );

    expect(renderInputs.hero_3d.metadata.customMarker).toBe("preserve-me");
    expect(renderInputs.hero_3d.svgString).toBe(strongHero.svgString);
  });
});
