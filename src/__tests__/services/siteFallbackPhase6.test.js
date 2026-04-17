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
});
