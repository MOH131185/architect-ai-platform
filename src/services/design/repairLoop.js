/**
 * Self-correction repair loop. Plan §6.13:
 *
 *   Generate option → QA → identify failures → repair model → re-run QA
 *   → compose sheet
 *
 * Maximum repair passes is configurable; defaults to 3 (plan §6.13). Hard
 * blockers (model-hash mismatch, A1 wrong size, missing programme schedule,
 * site-boundary violation) skip the loop and fail fast.
 */

export const HARD_BLOCKER_CODES = new Set([
  "SOURCE_MODEL_HASH_MISMATCH_2D",
  "SOURCE_MODEL_HASH_MISMATCH_3D",
  "PROJECT_GRAPH_3D_REFERENCE_MISSING",
  "A1_PDF_EXPORT_MISSING_OR_WRONG_SIZE",
  "A1_SHEET_MODEL_HASH_MISMATCH",
  "A1_SHEET_REFERENCE_MISSING",
]);

const REPAIR_STRATEGIES = Object.freeze({
  PROGRAMME_AREA_OUTSIDE_TOLERANCE: "scale_storey_count",
  PROGRAMME_SPACE_MISSING_IN_MODEL: "rebalance_bands",
});

/**
 * Inspect QA issues and return a repair action set, or null if no repair is
 * available for the observed issue mix. Pure function — does not mutate input.
 *
 * @param {object} qa - QA result (qa.issues array).
 * @param {object} input - Original input passed to the slice builder.
 * @returns {{strategy: string, mutatedInput: object}|null}
 */
export function planRepair(qa, input) {
  const issues = Array.isArray(qa?.issues) ? qa.issues : [];
  if (issues.length === 0) return null;

  for (const issue of issues) {
    if (HARD_BLOCKER_CODES.has(issue.code)) {
      return { strategy: "hard_blocker_no_repair", mutatedInput: null };
    }
  }

  const giaIssue = issues.find(
    (issue) => issue.code === "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
  );
  if (giaIssue) {
    const target = Number(giaIssue.details?.targetGia || 0);
    const actual = Number(giaIssue.details?.actualGia || 0);
    if (target > 0 && actual > 0) {
      const ratio = actual / target;
      const currentStoreys = Math.max(
        1,
        Number(input?.brief?.target_storeys || 1),
      );
      // If actual < 0.85 * target and we can add a storey within plan §6.7's
      // 4-storey upper bound, do that. If actual > 1.15 * target and we have
      // ≥2 storeys, drop one. Otherwise the repair is a no-op (manual review).
      if (ratio < 0.85 && currentStoreys < 4) {
        return {
          strategy: REPAIR_STRATEGIES.PROGRAMME_AREA_OUTSIDE_TOLERANCE,
          mutatedInput: {
            ...input,
            brief: {
              ...input.brief,
              target_storeys: currentStoreys + 1,
            },
            _repairReason: `GIA ${actual} m² ≪ ${target} m² target; adding a storey to absorb shortfall.`,
          },
        };
      }
      if (ratio > 1.15 && currentStoreys > 1) {
        return {
          strategy: REPAIR_STRATEGIES.PROGRAMME_AREA_OUTSIDE_TOLERANCE,
          mutatedInput: {
            ...input,
            brief: {
              ...input.brief,
              target_storeys: currentStoreys - 1,
            },
            _repairReason: `GIA ${actual} m² ≫ ${target} m² target; reducing storey count.`,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Run the slice builder with up to maxAttempts repair passes.
 *
 * @param {Function} sliceBuilder - async (input) => result
 * @param {object} input
 * @param {{ maxAttempts?: number }} [options]
 * @returns {Promise<object>} result with repair_attempts and repair_history fields.
 */
export async function runWithRepair(sliceBuilder, input, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 3));
  const history = [];
  let lastResult = null;
  let currentInput = input;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await sliceBuilder(currentInput);
    history.push({
      attempt,
      success: result?.success === true,
      score: result?.qa?.totalScore ?? null,
      hardFailures: (result?.qa?.issues || []).filter((issue) =>
        HARD_BLOCKER_CODES.has(issue.code),
      ).length,
      issueCodes: (result?.qa?.issues || []).map((issue) => issue.code),
      repair_strategy: currentInput?._repairReason || null,
    });
    lastResult = result;
    if (result?.success) {
      break;
    }
    const plan = planRepair(result?.qa, currentInput);
    if (
      !plan ||
      !plan.mutatedInput ||
      plan.strategy === "hard_blocker_no_repair"
    ) {
      history[history.length - 1].repair_strategy =
        plan?.strategy || "no_strategy_available";
      break;
    }
    currentInput = plan.mutatedInput;
  }

  if (lastResult) {
    return {
      ...lastResult,
      repair_attempts: history.length,
      repair_history: history,
    };
  }
  return {
    success: false,
    repair_attempts: history.length,
    repair_history: history,
    error: "slice builder returned no result",
  };
}

export default { planRepair, runWithRepair, HARD_BLOCKER_CODES };
