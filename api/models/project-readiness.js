import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { assessA1ProjectReadiness } from "../../src/services/a1/a1ProjectReadinessService.js";
import {
  buildProjectReadinessResponse,
  validateProjectReadinessRequest,
} from "../../src/services/models/architectureBackendContracts.js";
import {
  config,
  enforceSchemaValidation,
  ensureFeatureEnabled,
  handleOptions,
  rejectInvalidMethod,
  sendError,
  setCors,
} from "./_shared.js";

export { config };

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!setCors(req, res)) {
    return sendError(
      res,
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origin is not allowed for this endpoint.",
      null,
      { endpoint: "project-readiness" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(res, ["useA1ProjectReadiness"], "project-readiness")
  ) {
    return;
  }

  try {
    const validation = validateProjectReadinessRequest(req.body || {});
    const featureFlags = [
      "useA1ProjectReadiness",
      "useFormalSchemaValidation",
      "useFormalSchemaEngine",
      "useComposeReadinessPhase5",
      "useComposeExecutionPlanning",
      "useA1RecoveryExecutionBridge",
      "useArtifactLifecycleStore",
      "useProjectRecoveryFlows",
      "useTechnicalPanelReadabilityChecks",
      "useA1TechnicalPanelGating",
      "useTechnicalPanelScoringPhase7",
      "useA1FontEmbeddingFix",
      "useA1ConsistencyGuards",
      "useTechnicalPanelScoringPhase8",
      "useTechnicalPanelComposeBlockingPhase8",
      "usePhase7EntityDependencies",
      "useSideFacadeExtractionPhase9",
      "useElevationRichnessPhase9",
      "useSectionSemanticSelectionPhase9",
      "useSectionGraphicsUpgradePhase9",
      "useDrawingFragmentScoringPhase9",
      "useA1FinalSheetRegressionChecksPhase9",
      "useA1PreComposeVerificationPhase9",
      "useSectionEvidencePhase10",
      "useSideFacadeSemanticsPhase10",
      "useSectionStrategyLibraryPhase10",
      "useSectionGraphicsMaturityPhase10",
      "useA1RegressionFixturesPhase10",
      "useRenderedTextVerificationPhase10",
      "useFinalTechnicalCredibilityChecksPhase10",
      "useUnifiedVerificationStatePhase10",
      "useFinalPublishabilityGatePhase10",
      "useFinalSheetRegressionProtectionPhase10",
      "usePostComposeVerificationPhase10",
      "useA1PublishabilityGatePhase10",
      "useTrueSectionEvidencePhase12",
      "useOCRTextVerificationPhase12",
      "useSideFacadeSchemaPhase12",
      "useCanonicalVerificationBundlePhase12",
      "useEvidenceDrivenPublishabilityPhase12",
      "useTrueSectionClippingPhase13",
      "useClippedSectionGraphicsPhase13",
      "useSectionTruthScoringPhase13",
      "useSectionCredibilityGatePhase13",
    ];
    if (!validation.ok) {
      return sendError(
        res,
        400,
        "INVALID_REQUEST",
        validation.errors.join(" "),
        {
          errors: validation.errors,
          warnings: validation.warnings,
        },
        {
          endpoint: "project-readiness",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "projectReadinessRequest",
      validation.normalized,
      "project-readiness",
      featureFlags,
    );
    if (!schemaValidation.valid) {
      return;
    }

    const projectGeometry = coerceToCanonicalProjectGeometry(
      validation.normalized.projectGeometry,
    );
    const geometrySchemaValidation = enforceSchemaValidation(
      res,
      "canonicalProjectGeometry",
      projectGeometry,
      "project-readiness",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const result = assessA1ProjectReadiness({
      projectGeometry,
      drawings: validation.normalized.drawings,
      visualPackage: validation.normalized.visualPackage,
      facadeGrammar: validation.normalized.facadeGrammar,
      validationReport: validation.normalized.validationReport,
      artifactStore: projectGeometry?.metadata?.project_artifact_store || null,
    });

    return res.status(200).json(
      buildProjectReadinessResponse({
        result,
        warnings: validation.warnings,
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "PROJECT_READINESS_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "project-readiness",
      },
    );
  }
}
