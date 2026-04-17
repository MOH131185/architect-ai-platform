import { planIrregularEnvelopeFallback } from "../../services/site/irregularEnvelopeFallbackPlanner.js";

describe("Phase 6 irregular site fallback planner", () => {
  test("returns deterministic partitions and warnings for narrow sites", () => {
    const result = planIrregularEnvelopeFallback({
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 6 },
        { x: 0, y: 6 },
      ],
      setbacks: { all: 0.5 },
    });

    expect(result.partitions.map((entry) => entry.id)).toEqual([
      "partition:circulation-spine",
      "partition:main-strip",
    ]);
    expect(result.warnings.some((entry) => entry.includes("narrow"))).toBe(
      true,
    );
    expect(["medium", "low"]).toContain(result.confidenceClass);
  });

  test("recomputes the envelope instead of trusting a partial fallback envelope", () => {
    const result = planIrregularEnvelopeFallback(
      {
        boundary_polygon: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 8 },
          { x: 0, y: 8 },
        ],
        setbacks: { all: 1 },
      },
      {
        buildable_polygon: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    );

    expect(result.envelope.buildable_bbox.width).toBeGreaterThan(10);
    expect(result.envelope.buildable_bbox.height).toBeGreaterThan(4);
  });
});
