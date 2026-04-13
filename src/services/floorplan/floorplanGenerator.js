import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  invokeOpenSourceAdapter,
  registerOpenSourceAdapter,
} from "../models/openSourceModelRouter.js";
import {
  applyLayoutConstraints,
  buildAdjacencyGraph,
  buildLayoutSummary,
  solveLayoutConstraints,
  validateProgram,
} from "./layoutConstraintEngine.js";

export {
  applyLayoutConstraints,
  buildAdjacencyGraph,
  validateProgram,
} from "./layoutConstraintEngine.js";

async function runConstraintSolver(payload = {}) {
  const layout = solveLayoutConstraints(payload);
  return {
    status: "ready",
    adapterId: "constraint-solver",
    provider: "local",
    layout,
    summary: buildLayoutSummary(layout),
  };
}

registerOpenSourceAdapter("floorplan", "constraint-solver", async (payload) =>
  runConstraintSolver(payload),
);

/**
 * Structured floorplan generation contract.
 *
 * For now this prefers the deterministic local solver. If a future open-source
 * model adapter is configured, the same contract can route there first and then
 * fall back to the solver when unavailable.
 */
export async function generateLayoutFromProgram(request = {}, options = {}) {
  const enabled = isFeatureEnabled("useFloorplanEngine");
  const preferredAdapterId = options.adapterId || request.adapterId || null;
  const programInput =
    request.room_program ||
    request.roomProgram ||
    request.program?.rooms ||
    request.program ||
    [];
  const programValidation = validateProgram(programInput);

  if (!enabled) {
    logger.warn(
      "[Floorplan] Feature flag disabled, using local fallback anyway",
    );
  }
  if (!programValidation.isValid) {
    throw new Error(programValidation.errors.join("; "));
  }

  const routed = await invokeOpenSourceAdapter("floorplan", request, {
    adapterId: preferredAdapterId,
  });

  if (routed?.layout) {
    const constrainedLayout = applyLayoutConstraints(
      routed.layout,
      request.constraints || {},
    );
    return {
      success: true,
      provider: routed.provider,
      adapterId: routed.adapterId,
      layout: constrainedLayout,
      layoutGraph:
        constrainedLayout.adjacency_graph ||
        buildAdjacencyGraph(programValidation.normalizedProgram),
      zoningSummary: constrainedLayout.zoning || null,
      summary: routed.summary || buildLayoutSummary(constrainedLayout),
      validation: programValidation,
      warnings: [
        ...programValidation.warnings,
        ...(Array.isArray(constrainedLayout.constraint_report?.warnings)
          ? constrainedLayout.constraint_report.warnings
          : []),
        ...(routed.status === "unavailable" ? routed.notes : []),
      ],
      nextSteps: [
        "Refine room packing with a learned planner or search algorithm in Phase 2.",
        "Add geometry-aware circulation and daylight optimization after layout validation is stable.",
      ],
    };
  }

  const fallback = await runConstraintSolver(request);
  const constrainedLayout = applyLayoutConstraints(
    fallback.layout,
    request.constraints || {},
  );
  return {
    success: true,
    provider: fallback.provider,
    adapterId: fallback.adapterId,
    layout: constrainedLayout,
    layoutGraph:
      constrainedLayout.adjacency_graph ||
      buildAdjacencyGraph(programValidation.normalizedProgram),
    zoningSummary: constrainedLayout.zoning || null,
    summary: buildLayoutSummary(constrainedLayout),
    validation: programValidation,
    warnings: [
      ...programValidation.warnings,
      ...(Array.isArray(constrainedLayout.constraint_report?.warnings)
        ? constrainedLayout.constraint_report.warnings
        : []),
      "Requested floorplan model adapter was unavailable.",
      ...(Array.isArray(routed?.notes) ? routed.notes : []),
    ],
    nextSteps: [
      "Attach a structured floorplan model adapter once provider routing is ready.",
      "Promote constraint_report into a richer optimization loop in Phase 2.",
    ],
  };
}

export default {
  applyLayoutConstraints,
  buildAdjacencyGraph,
  generateLayoutFromProgram,
  validateProgram,
};
