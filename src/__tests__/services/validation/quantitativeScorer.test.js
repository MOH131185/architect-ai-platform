import {
  computeQuantitativeMetrics,
  __testing__,
} from "../../../services/validation/qaScorers/quantitativeScorer.js";

const { bandedScore, METRIC_DEFS } = __testing__;

describe("bandedScore — internals", () => {
  test("value inside ideal band returns 100", () => {
    expect(bandedScore(0.95, 0.85, 1.15, 0.7, 1.3)).toBe(100);
    expect(bandedScore(1.0, 0.85, 1.15, 0.7, 1.3)).toBe(100);
    expect(bandedScore(1.15, 0.85, 1.15, 0.7, 1.3)).toBe(100);
  });

  test("value at hard floor returns 0", () => {
    expect(bandedScore(0.7, 0.85, 1.15, 0.7, 1.3)).toBe(0);
    expect(bandedScore(0.6, 0.85, 1.15, 0.7, 1.3)).toBe(0);
  });

  test("value mid-band scales linearly", () => {
    const score = bandedScore(0.775, 0.85, 1.15, 0.7, 1.3);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  test("non-finite input returns null", () => {
    expect(bandedScore(NaN, 0.85, 1.15, 0.7, 1.3)).toBeNull();
    expect(bandedScore(undefined, 0.85, 1.15, 0.7, 1.3)).toBeNull();
  });
});

describe("computeQuantitativeMetrics — empty input", () => {
  test("no projectGraph, no artifacts → all metrics null, score null", () => {
    const result = computeQuantitativeMetrics({});
    expect(result.score).toBeNull();
    expect(result.breakdown.length).toBe(METRIC_DEFS.length);
    expect(result.breakdown.every((m) => m.score === null)).toBe(true);
  });
});

describe("computeQuantitativeMetrics — programme_area_satisfied", () => {
  test("perfect programme area → 100", () => {
    const projectGraph = {
      programme: {
        spaces: [
          { space_id: "a", target_area_m2: 20, actual_area_m2: 20 },
          { space_id: "b", target_area_m2: 15, actual_area_m2: 15 },
        ],
      },
    };
    const result = computeQuantitativeMetrics({ projectGraph });
    const metric = result.breakdown.find(
      (m) => m.metric === "programme_area_satisfied",
    );
    expect(metric.value).toBeCloseTo(1.0);
    expect(metric.score).toBe(100);
  });

  test("under-allocated programme (40% short) → 0", () => {
    const projectGraph = {
      programme: {
        spaces: [
          { space_id: "a", target_area_m2: 20, actual_area_m2: 12 },
          { space_id: "b", target_area_m2: 15, actual_area_m2: 9 },
        ],
      },
    };
    const result = computeQuantitativeMetrics({ projectGraph });
    const metric = result.breakdown.find(
      (m) => m.metric === "programme_area_satisfied",
    );
    expect(metric.value).toBeCloseTo(0.6);
    expect(metric.score).toBe(0);
  });

  test("missing target areas → null", () => {
    const projectGraph = {
      programme: { spaces: [{ space_id: "a", target_area_m2: 0 }] },
    };
    const result = computeQuantitativeMetrics({ projectGraph });
    const metric = result.breakdown.find(
      (m) => m.metric === "programme_area_satisfied",
    );
    expect(metric.value).toBeNull();
    expect(metric.score).toBeNull();
  });
});

describe("computeQuantitativeMetrics — geometry_hash_consistency", () => {
  test("all drawings share the same hash → 100", () => {
    const projectGraph = {
      selected_design: { source_model_hash: "h-abc" },
      drawings: {
        drawings: [
          { id: "p1", source_model_hash: "h-abc" },
          { id: "p2", source_model_hash: "h-abc" },
        ],
      },
    };
    const result = computeQuantitativeMetrics({ projectGraph });
    const metric = result.breakdown.find(
      (m) => m.metric === "geometry_hash_consistency",
    );
    expect(metric.score).toBe(100);
  });

  test("any mismatch → 0", () => {
    const projectGraph = {
      selected_design: { source_model_hash: "h-abc" },
      drawings: {
        drawings: [
          { id: "p1", source_model_hash: "h-abc" },
          { id: "p2", source_model_hash: "h-xyz" },
        ],
      },
    };
    const result = computeQuantitativeMetrics({ projectGraph });
    const metric = result.breakdown.find(
      (m) => m.metric === "geometry_hash_consistency",
    );
    expect(metric.score).toBe(0);
  });
});

describe("computeQuantitativeMetrics — programme_adjacency_score", () => {
  test("uses adjacencyResult.score when supplied", () => {
    const result = computeQuantitativeMetrics({
      adjacencyResult: { score: 92, status: "pass", packId: "residential-v1" },
    });
    const metric = result.breakdown.find(
      (m) => m.metric === "programme_adjacency_score",
    );
    expect(metric.value).toBe(92);
    expect(metric.score).toBe(92);
  });

  test("missing adjacency result → null", () => {
    const result = computeQuantitativeMetrics({});
    const metric = result.breakdown.find(
      (m) => m.metric === "programme_adjacency_score",
    );
    expect(metric.score).toBeNull();
  });
});

describe("computeQuantitativeMetrics — window_wall_ratio", () => {
  test("ideal residential WWR → 100", () => {
    // Aim for ~0.22 ratio: 4 large windows (1.8 m × 1.5 m = 2.7 m² each = 10.8 m²)
    // against 2 short walls (4 m × 2.7 m = 10.8 m² each = 21.6 m²) → 0.5 → too high.
    // Use 4 windows (1.5 × 1.2 = 1.8 m² each = 7.2 m²) against walls totalling
    // ~32.4 m² → 0.222.
    const artifacts = {
      compiledProject: {
        openings: [
          {
            kind: "window",
            width_m: 1.5,
            sill_height_m: 0.9,
            head_height_m: 2.1,
          },
          {
            kind: "window",
            width_m: 1.5,
            sill_height_m: 0.9,
            head_height_m: 2.1,
          },
          {
            kind: "window",
            width_m: 1.5,
            sill_height_m: 0.9,
            head_height_m: 2.1,
          },
          {
            kind: "window",
            width_m: 1.5,
            sill_height_m: 0.9,
            head_height_m: 2.1,
          },
        ],
        walls: [
          {
            id: "w1",
            length_m: 6,
            height_m: 2.7,
            start: { x: 0, y: 0 },
            end: { x: 6, y: 0 },
          },
          {
            id: "w2",
            length_m: 6,
            height_m: 2.7,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 4 },
          },
        ],
      },
    };
    const result = computeQuantitativeMetrics({ artifacts });
    const metric = result.breakdown.find(
      (m) => m.metric === "window_wall_ratio",
    );
    expect(metric.value).toBeGreaterThan(0.18);
    expect(metric.value).toBeLessThan(0.3);
    expect(metric.score).toBe(100);
  });
});

describe("computeQuantitativeMetrics — overall headline score", () => {
  test("weighted average across metrics that return a score", () => {
    const projectGraph = {
      programme: {
        spaces: [{ space_id: "a", target_area_m2: 20, actual_area_m2: 20 }],
      },
      selected_design: { source_model_hash: "h" },
      drawings: { drawings: [{ id: "d", source_model_hash: "h" }] },
    };
    const result = computeQuantitativeMetrics({
      projectGraph,
      adjacencyResult: { score: 80 },
    });
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("computeQuantitativeMetrics — output shape", () => {
  test("breakdown items carry metric/value/score/target/weight/source", () => {
    const result = computeQuantitativeMetrics({});
    for (const m of result.breakdown) {
      expect(m).toEqual(
        expect.objectContaining({
          metric: expect.any(String),
          target: expect.any(Object),
          weight: expect.any(Number),
          source: expect.any(String),
        }),
      );
    }
  });
});
