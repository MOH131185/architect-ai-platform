/**
 * Quantitative QA scorer (paper §4.6).
 *
 * Aggregates a small set of measurable architectural metrics computed entirely
 * from data already present on the project graph and compiled project. Each
 * metric is a 0–100 score with a numeric `value`, a `target`, a `weight`, and
 * a `source` string for traceability. The headline score is the weighted
 * average of metrics that produced a value (null metrics are skipped).
 *
 * Metrics:
 *   1. programme_area_satisfied — Σ actual_area / Σ target_area, target 1.00
 *      ± 0.15 tolerance band (1.0 → 100, ±0.15 → 60, ±0.30+ → 0).
 *   2. geometry_hash_consistency — derived from existing
 *      DRAWINGS_SHARE_MODEL_HASH check on the QA report (binary 0 or 100).
 *   3. programme_adjacency_score — passed in from
 *      programmeAdjacencyValidator.
 *   4. window_wall_ratio — Σ window opening width × height / Σ wall area,
 *      target band 0.18–0.30 (residential daylight rule of thumb).
 *   5. plan_perimeter_ratio — 4π × Σ room areas / perimeter² (compactness;
 *      1.0 = perfect circle, 0.78 = square, < 0.5 = ribbon).
 *   6. south_facing_aperture_pct — south aperture m² / total aperture m² when
 *      orientation metadata is present, else null.
 */

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null) return [];
  return [value];
}

function clamp01(value) {
  if (!isFiniteNumber(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function bandedScore(value, idealLow, idealHigh, hardLow, hardHigh) {
  if (!isFiniteNumber(value)) return null;
  if (value >= idealLow && value <= idealHigh) return 100;
  if (value < idealLow) {
    if (value <= hardLow) return 0;
    return Math.round(100 * ((value - hardLow) / (idealLow - hardLow)));
  }
  // value > idealHigh
  if (value >= hardHigh) return 0;
  return Math.round(100 * ((hardHigh - value) / (hardHigh - idealHigh)));
}

function programmeAreaSatisfaction(projectGraph) {
  const spaces = toArray(projectGraph?.programme?.spaces);
  if (spaces.length === 0) return { value: null, score: null };
  let actualSum = 0;
  let targetSum = 0;
  for (const space of spaces) {
    const target = Number(space.target_area_m2 || space.targetAreaM2 || 0);
    const actual = Number(
      space.actual_area_m2 ?? space.actualAreaM2 ?? target ?? 0,
    );
    if (target > 0) {
      targetSum += target;
      actualSum += actual;
    }
  }
  if (targetSum === 0) return { value: null, score: null };
  const ratio = actualSum / targetSum;
  // 1.0 ideal; 0.85–1.15 → 100, 0.70/1.30 → 0.
  const score = bandedScore(ratio, 0.85, 1.15, 0.7, 1.3);
  return { value: Number(ratio.toFixed(3)), score };
}

function geometryHashConsistency(projectGraph) {
  const geometryHash = projectGraph?.selected_design?.source_model_hash || null;
  const drawings = toArray(projectGraph?.drawings?.drawings);
  if (!geometryHash || drawings.length === 0) {
    return { value: null, score: null };
  }
  const hashes = new Set(drawings.map((d) => d?.source_model_hash));
  const consistent = hashes.size === 1 && hashes.has(geometryHash);
  return { value: consistent ? 1 : 0, score: consistent ? 100 : 0 };
}

function adjacencyScoreMetric(adjacencyResult) {
  if (!adjacencyResult || !isFiniteNumber(Number(adjacencyResult.score))) {
    return { value: null, score: null };
  }
  const value = Number(adjacencyResult.score);
  return { value, score: Math.round(value) };
}

function windowWallRatio(compiledProject) {
  const openings = toArray(compiledProject?.openings).filter(
    (entry) => entry?.kind === "window" || entry?.type === "window",
  );
  const walls = toArray(compiledProject?.walls);
  if (openings.length === 0 || walls.length === 0) {
    return { value: null, score: null };
  }
  let openingArea = 0;
  for (const opening of openings) {
    const width = Number(opening.width_m || opening.widthM || 0);
    const head = Number(opening.head_height_m || opening.headHeightM || 0);
    const sill = Number(opening.sill_height_m || opening.sillHeightM || 0);
    const height = Math.max(0, head - sill);
    if (width > 0 && height > 0) {
      openingArea += width * height;
    }
  }
  let wallArea = 0;
  for (const wall of walls) {
    const length = Number(
      wall.length_m ||
        wall.lengthM ||
        (wall.start && wall.end
          ? Math.hypot(
              Number(wall.end.x || 0) - Number(wall.start.x || 0),
              Number(wall.end.y || 0) - Number(wall.start.y || 0),
            )
          : 0),
    );
    const height = Number(wall.height_m || wall.heightM || 2.7);
    if (length > 0 && height > 0) {
      wallArea += length * height;
    }
  }
  if (wallArea === 0) return { value: null, score: null };
  const ratio = openingArea / wallArea;
  // Residential daylight rule-of-thumb band: 0.18–0.30 ideal.
  const score = bandedScore(ratio, 0.18, 0.3, 0.05, 0.5);
  return { value: Number(ratio.toFixed(3)), score };
}

function planPerimeterRatio(compiledProject) {
  const rooms = toArray(compiledProject?.rooms);
  if (rooms.length === 0) return { value: null, score: null };
  // Aggregate per-level: building-scale compactness uses total floor footprint
  // perimeter approximated by the sum of external wall lengths.
  let totalArea = 0;
  for (const room of rooms) {
    const area = Number(room.actual_area_m2 || room.actualAreaM2 || 0);
    if (area > 0) totalArea += area;
  }
  const externalWalls = toArray(compiledProject?.walls).filter(
    (wall) => toArray(wall?.room_ids).length === 1,
  );
  let perimeter = 0;
  for (const wall of externalWalls) {
    const length = Number(
      wall.length_m ||
        wall.lengthM ||
        (wall.start && wall.end
          ? Math.hypot(
              Number(wall.end.x || 0) - Number(wall.start.x || 0),
              Number(wall.end.y || 0) - Number(wall.start.y || 0),
            )
          : 0),
    );
    if (length > 0) perimeter += length;
  }
  if (totalArea === 0 || perimeter === 0) return { value: null, score: null };
  const ratio = (4 * Math.PI * totalArea) / (perimeter * perimeter);
  // 1.0 = perfect circle, ≈0.785 = square, ≤0.5 = ribbon. Score band:
  // 0.55–0.85 ideal (compact-articulated), 0.30/1.00 → 0.
  const score = bandedScore(ratio, 0.55, 0.85, 0.3, 1.0);
  return { value: Number(ratio.toFixed(3)), score };
}

function southFacingAperturePct(projectGraph, compiledProject) {
  // Prefer pre-computed environmental metadata when present.
  const env = projectGraph?.environmental || projectGraph?.environment || {};
  const south = Number(
    env.south_aperture_m2 ?? env.southAperture ?? env.south ?? NaN,
  );
  const total = Number(
    env.total_aperture_m2 ?? env.totalAperture ?? env.total ?? NaN,
  );
  if (isFiniteNumber(south) && isFiniteNumber(total) && total > 0) {
    const pct = clamp01(south / total);
    const score = bandedScore(pct, 0.3, 0.6, 0.05, 0.95);
    return { value: Number(pct.toFixed(3)), score };
  }
  // Fallback: infer from compiledProject.openings if they carry orientation
  // metadata (heading / facing / facade key in cardinals).
  const openings = toArray(compiledProject?.openings).filter(
    (entry) => entry?.kind === "window" || entry?.type === "window",
  );
  if (openings.length === 0) return { value: null, score: null };
  let southArea = 0;
  let totalArea = 0;
  for (const opening of openings) {
    const facing = String(
      opening.facing || opening.facade || opening.orientation || "",
    ).toLowerCase();
    const width = Number(opening.width_m || 0);
    const head = Number(opening.head_height_m || 0);
    const sill = Number(opening.sill_height_m || 0);
    const area = Math.max(0, width * (head - sill));
    if (area <= 0) continue;
    totalArea += area;
    if (facing.includes("s") && !facing.includes("n")) {
      // accept "south", "south-east", "south-west"
      southArea += area;
    }
  }
  if (totalArea === 0) return { value: null, score: null };
  const pct = southArea / totalArea;
  const score = bandedScore(pct, 0.3, 0.6, 0.05, 0.95);
  return { value: Number(pct.toFixed(3)), score };
}

const METRIC_DEFS = [
  {
    key: "programme_area_satisfied",
    weight: 6,
    target: { ideal: 1.0, band: [0.85, 1.15] },
    source: "projectGraph.programme.spaces",
    compute: (input) => programmeAreaSatisfaction(input.projectGraph),
  },
  {
    key: "geometry_hash_consistency",
    weight: 5,
    target: { ideal: 1, band: [1, 1] },
    source: "projectGraph.drawings.drawings[].source_model_hash",
    compute: (input) => geometryHashConsistency(input.projectGraph),
  },
  {
    key: "programme_adjacency_score",
    weight: 6,
    target: { ideal: 100, band: [85, 100] },
    source: "programmeAdjacencyValidator",
    compute: (input) => adjacencyScoreMetric(input.adjacencyResult),
  },
  {
    key: "window_wall_ratio",
    weight: 4,
    target: { ideal: 0.24, band: [0.18, 0.3] },
    source: "compiledProject.openings + walls",
    compute: (input) => windowWallRatio(input.compiledProject),
  },
  {
    key: "plan_perimeter_ratio",
    weight: 3,
    target: { ideal: 0.7, band: [0.55, 0.85] },
    source: "compiledProject.rooms + walls",
    compute: (input) => planPerimeterRatio(input.compiledProject),
  },
  {
    key: "south_facing_aperture_pct",
    weight: 3,
    target: { ideal: 0.45, band: [0.3, 0.6] },
    source: "projectGraph.environmental | compiledProject.openings.facing",
    compute: (input) =>
      southFacingAperturePct(input.projectGraph, input.compiledProject),
  },
];

/**
 * Compute the quantitative QA block.
 *
 * @param {object} args
 * @param {object} args.projectGraph
 * @param {object} args.artifacts            Vertical-slice artifacts
 *   (specifically `artifacts.compiledProject`).
 * @param {object} [args.adjacencyResult]    Output of validateProgrammeAdjacency.
 * @returns {{
 *   score: number | null,
 *   breakdown: Array<{ metric, value, score, target, weight, source }>
 * }}
 */
export function computeQuantitativeMetrics({
  projectGraph = null,
  artifacts = {},
  adjacencyResult = null,
} = {}) {
  const compiledProject = artifacts?.compiledProject || null;
  const ctx = { projectGraph, compiledProject, adjacencyResult };
  const breakdown = [];
  let weightSum = 0;
  let weightedScore = 0;
  for (const def of METRIC_DEFS) {
    let result = { value: null, score: null };
    try {
      result = def.compute(ctx) || result;
    } catch (error) {
      result = {
        value: null,
        score: null,
        error: String(error?.message || error),
      };
    }
    breakdown.push({
      metric: def.key,
      value: result.value,
      score: result.score,
      target: def.target,
      weight: def.weight,
      source: def.source,
      error: result.error || null,
    });
    if (isFiniteNumber(result.score)) {
      weightedScore += result.score * def.weight;
      weightSum += def.weight;
    }
  }
  const score = weightSum > 0 ? Math.round(weightedScore / weightSum) : null;
  return { score, breakdown };
}

export const __testing__ = {
  bandedScore,
  programmeAreaSatisfaction,
  geometryHashConsistency,
  adjacencyScoreMetric,
  windowWallRatio,
  planPerimeterRatio,
  southFacingAperturePct,
  METRIC_DEFS,
};
