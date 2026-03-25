/**
 * Canonical progress reporter adapter for dnaWorkflowOrchestrator.
 * Keeps the callback payload stable while the orchestrator focuses on stages.
 */
export function createProgressReporter(progressCallback) {
  return (stage, message, percent) => {
    if (!progressCallback) {
      return;
    }

    const clamped =
      typeof percent === "number" && Number.isFinite(percent)
        ? Math.max(0, Math.min(100, Math.round(percent)))
        : undefined;

    try {
      progressCallback({
        stage,
        message,
        percent: clamped,
        percentage: clamped,
      });
    } catch {
      // Progress callbacks are non-critical and should never break the workflow.
    }
  };
}
