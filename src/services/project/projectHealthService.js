import { assessA1ProjectReadiness } from "../a1/a1ProjectReadinessService.js";
import { buildProjectRecoveryPlan } from "./projectRecoveryService.js";
import { planProjectRollback } from "./projectRollbackPlanner.js";

export function assessProjectHealth({
  projectGeometry = {},
  drawings = null,
  visualPackage = null,
  facadeGrammar = null,
  validationReport = null,
  artifactStore = null,
} = {}) {
  const readiness = assessA1ProjectReadiness({
    projectGeometry,
    drawings,
    visualPackage,
    facadeGrammar,
    validationReport,
    artifactStore,
  });
  const recoveryPlan = buildProjectRecoveryPlan({
    projectGeometry,
    drawings,
    facadeGrammar,
    visualPackage,
    panelCandidates: readiness.panelCandidates || [],
    artifactStore: readiness.artifactStore || artifactStore,
    readiness,
    validationReport,
  });
  const rollbackPlan = planProjectRollback(projectGeometry);

  return {
    version: readiness.finalSheetRegression
      ? readiness.finalSheetRegression?.roofTruthQuality ||
        readiness.finalSheetRegression?.foundationTruthQuality
        ? "phase15-project-health-v1"
        : readiness.finalSheetRegression?.sectionDirectEvidenceQuality
          ? "phase13-project-health-v1"
          : "phase12-project-health-v1"
      : "phase8-project-health-v1",
    healthStatus:
      readiness.composeReady === true
        ? "healthy"
        : recoveryPlan.nonRecoverableIssues.length
          ? "blocked"
          : "recoverable",
    readiness,
    recoveryPlan,
    rollbackPlan,
    technicalPanelHealth: readiness.technicalPanelGate || null,
    consistencyGuard: readiness.consistencyGuard || null,
    fontReadiness: readiness.fontReadiness || null,
    finalSheetRegression: readiness.finalSheetRegression || null,
    renderedTextZone: readiness.renderedTextZone || null,
    technicalCredibility: readiness.technicalCredibility || null,
    publishability: readiness.publishability || null,
    verification: readiness.verification || null,
    verificationState: readiness.verificationState || null,
    technicalPackageStrength: {
      composeReady: readiness.composeReady === true,
      technicalReady: readiness.technicalPanelGate?.technicalReady !== false,
      consistencyReady: readiness.consistencyGuard?.consistencyReady !== false,
      finalSheetRegressionReady:
        readiness.finalSheetRegression?.finalSheetRegressionReady !== false,
      publishable: readiness.publishability?.publishable === true,
      freshPanelCount: readiness.freshPanels?.length || 0,
      stalePanelCount: readiness.stalePanels?.length || 0,
      missingPanelCount: readiness.missingPanels?.length || 0,
    },
    remainingBlockers: [
      ...(readiness.blockingReasons || []),
      ...(readiness.technicalPanelGate?.blockingReasons || []),
      ...(readiness.consistencyGuard?.blockingReasons || []),
      ...(readiness.finalSheetRegression?.blockers || []),
      ...(readiness.technicalCredibility?.blockers || []),
      ...(readiness.publishability?.blockers || []),
    ],
    recoveryExecutionBridge: readiness.recoveryExecutionBridge || null,
  };
}

export default {
  assessProjectHealth,
};
