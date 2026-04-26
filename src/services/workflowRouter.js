/**
 * Workflow Router - Centralised pipeline mode → workflow resolution
 *
 * Maps PIPELINE_MODE values to concrete orchestrator functions.
 * Unsupported modes fail explicitly with a clear error.
 */

import {
  getCurrentPipelineMode,
  PIPELINE_MODE,
} from "../config/pipelineMode.js";

/**
 * Error thrown when an unsupported pipeline mode is requested.
 */
export class UnsupportedPipelineModeError extends Error {
  constructor(mode) {
    super(
      `Unsupported pipeline mode "${mode}". ` +
        `Supported: ${[...IMPLEMENTED_MODES].join(", ")}`,
    );
    this.name = "UnsupportedPipelineModeError";
    this.requestedMode = mode;
  }
}

/**
 * Supported modes and their workflow keys.
 *
 * project_graph  → handled by the client/API ProjectGraph vertical-slice path
 * multi_panel    → runs runMultiPanelA1Workflow (legacy explicit mode)
 * single_shot    → NOT IMPLEMENTED → explicit error (no dedicated single-shot path)
 * geometry_first → NOT IMPLEMENTED → explicit error
 * hybrid_openai  → NOT IMPLEMENTED → explicit error
 */
const IMPLEMENTED_MODES = new Set([
  PIPELINE_MODE.PROJECT_GRAPH,
  PIPELINE_MODE.MULTI_PANEL,
]);

/**
 * Resolve the current pipeline mode and return the workflow key.
 *
 * @param {string} [overrideMode] - Optional mode override (for testing)
 * @returns {{ mode: string, workflowKey: string }}
 * @throws {UnsupportedPipelineModeError} if mode is not implemented
 */
export function resolveWorkflowByMode(overrideMode) {
  const mode = overrideMode || getCurrentPipelineMode();

  if (!IMPLEMENTED_MODES.has(mode)) {
    throw new UnsupportedPipelineModeError(mode);
  }

  return {
    mode,
    workflowKey:
      mode === PIPELINE_MODE.PROJECT_GRAPH
        ? "project_graph_vertical_slice"
        : "multi_panel_a1",
  };
}

/**
 * Execute the resolved workflow via the orchestrator.
 *
 * @param {Object} orchestrator - dnaWorkflowOrchestrator (or compatible)
 * @param {Object} params - Workflow parameters (projectContext, locationData, etc.)
 * @param {Object} [options] - { onProgress }
 * @param {string} [overrideMode] - Optional mode override
 * @returns {Promise<Object>} Raw orchestrator result
 * @throws {UnsupportedPipelineModeError} if mode is not implemented
 */
export async function executeWorkflow(
  orchestrator,
  params,
  options = {},
  overrideMode,
) {
  const { mode, workflowKey } = resolveWorkflowByMode(overrideMode);

  if (mode === PIPELINE_MODE.PROJECT_GRAPH) {
    throw new Error(
      "ProjectGraph workflow is API-driven. Call /api/project/generate-vertical-slice instead of the legacy DNA orchestrator.",
    );
  }

  return orchestrator.runMultiPanelA1Workflow(params, options);
}

/**
 * Check whether a workflow label represents an A1-pipeline workflow.
 * Accepts both the current pipeline-mode constants (e.g. "multi_panel")
 * and the legacy label "multi-panel-a1" / "a1-sheet-one-shot".
 *
 * @param {string|undefined} workflow
 * @returns {boolean}
 */
export function isA1Workflow(workflow) {
  if (!workflow) return false;
  const A1_LABELS = new Set([
    PIPELINE_MODE.PROJECT_GRAPH,
    PIPELINE_MODE.MULTI_PANEL,
    MODIFY_WORKFLOW,
    "project-graph",
    "project-graph-vertical-slice",
    // Legacy labels retained for backwards-compatible UI checks
    "multi-panel-a1",
    "a1-sheet-one-shot",
    "a1-sheet",
  ]);
  return A1_LABELS.has(workflow);
}

/**
 * Canonical workflow label for modification operations.
 * Derived from the primary mode to avoid hardcoded strings.
 */
export const MODIFY_WORKFLOW = `${PIPELINE_MODE.MULTI_PANEL}-modify`;

export default {
  resolveWorkflowByMode,
  executeWorkflow,
  isA1Workflow,
  UnsupportedPipelineModeError,
  MODIFY_WORKFLOW,
};
