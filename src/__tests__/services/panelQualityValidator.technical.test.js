import {
  getPanelsForRegeneration,
  validatePanel,
  validatePanelBatch,
} from "../../services/quality/panelQualityValidator.js";

function toSvgDataUrl(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

describe("panelQualityValidator technical drawing checks", () => {
  const dnaSnapshot = {
    rooms: [
      { name: "Living Room", floor: 0 },
      { name: "Kitchen", floor: 0 },
    ],
  };

  test("fails floor plan SVG without required technical structure", () => {
    const panel = {
      type: "floor_plan_ground",
      width: 1024,
      height: 1024,
      imageUrl: toSvgDataUrl(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
      ),
    };

    const result = validatePanel(panel, dnaSnapshot);

    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "floor_plan_missing_room_labels",
        "floor_plan_missing_dimensions",
        "floor_plan_missing_wall_geometry",
      ]),
    );
  });

  test("passes floor plan SVG with labels, dimensions, and wall geometry", () => {
    const panel = {
      type: "floor_plan_ground",
      width: 1200,
      height: 900,
      imageUrl: toSvgDataUrl(`
        <svg xmlns="http://www.w3.org/2000/svg">
          <g class="room-labels">
            <text>Living Room 20m²</text>
            <text>Kitchen 12m²</text>
          </g>
          <g class="dimensions">
            <line class="dimension-line" x1="0" y1="0" x2="100" y2="0" />
          </g>
          <g class="exterior-walls">
            <rect x="0" y="0" width="100" height="80" />
          </g>
        </svg>
      `),
    };

    const result = validatePanel(panel, dnaSnapshot);

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.75);
  });

  test("batch validation identifies failed panel for regeneration", () => {
    const goodPanel = {
      type: "floor_plan_ground",
      width: 1024,
      height: 1024,
      imageUrl: toSvgDataUrl(`
        <svg xmlns="http://www.w3.org/2000/svg">
          <g class="room-labels"><text>Living Room</text><text>Kitchen</text></g>
          <g class="dimensions"><line class="dimension-line" x1="0" y1="0" x2="1" y2="1"/></g>
          <g class="exterior-walls"><rect width="10" height="10"/></g>
        </svg>
      `),
    };
    const badPanel = {
      type: "section_AA",
      width: 400,
      height: 400,
      imageUrl: toSvgDataUrl(
        '<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="1" y2="1"/></svg>',
      ),
    };

    const batch = validatePanelBatch([goodPanel, badPanel], dnaSnapshot);
    const tagged = batch.results.map(({ panel, validation }) => ({
      ...panel,
      validation,
    }));
    const toRegenerate = getPanelsForRegeneration(tagged, dnaSnapshot);

    expect(batch.failedCount).toBe(1);
    expect(toRegenerate).toHaveLength(1);
    expect(toRegenerate[0].type).toBe("section_AA");
  });
});
