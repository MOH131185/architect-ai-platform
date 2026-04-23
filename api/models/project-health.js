import { coerceToCanonicalProjectGeometry } from "../../src/services/cad/geometryFactory.js";
import { assessProjectHealth } from "../../src/services/project/projectHealthService.js";
import {
  buildProjectHealthResponse,
  validateProjectHealthRequest,
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
      { endpoint: "project-health" },
    );
  }
  if (rejectInvalidMethod(req, res)) return;
  if (
    !ensureFeatureEnabled(
      res,
      ["useA1ProjectReadiness", "useProjectRecoveryFlows"],
      "project-health",
    )
  ) {
    return;
  }

  try {
    const validation = validateProjectHealthRequest(req.body || {});
    const featureFlags = [
      "useA1ProjectReadiness",
      "useProjectRecoveryFlows",
      "useComposeExecutionPlanning",
      "useA1TechnicalPanelGating",
      "useA1RecoveryExecutionBridge",
      "useTechnicalPanelScoringPhase7",
      "useA1FontEmbeddingFix",
      "useA1ConsistencyGuards",
      "useTechnicalPanelScoringPhase8",
      "useTechnicalPanelComposeBlockingPhase8",
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
      "useSectionConstructionTruthPhase14",
      "useDraftingGradeSectionGraphicsPhase14",
      "useSectionConstructionScoringPhase14",
      "useSectionConstructionCredibilityGatePhase14",
      "useRoofFoundationSectionTruthPhase15",
      "useRoofFoundationSectionCredibilityGatePhase15",
      "useRicherCanonicalRoofFoundationGeometryPhase16",
      "useRoofFoundationCredibilityGatePhase16",
      "useExplicitRoofPrimitiveSynthesisPhase17",
      "useExplicitFoundationPrimitiveSynthesisPhase17",
      "useDeeperRoofFoundationClippingPhase17",
      "useCanonicalConstructionTruthModelPhase17",
      "useRoofFoundationCredibilityGatePhase17",
      "useDeeperSectionClippingPhase18",
      "useConstructionTruthDrivenSectionRankingPhase18",
      "useSectionConstructionCredibilityGatePhase18",
      "useDeeperSectionClippingPhase19",
      "useDraftingGradeSectionGraphicsPhase19",
      "useConstructionTruthDrivenSectionRankingPhase19",
      "useSectionConstructionCredibilityGatePhase19",
      "useNearBooleanSectioningPhase20",
      "useCentralizedSectionTruthModelPhase20",
      "useDraftingGradeSectionGraphicsPhase20",
      "useConstructionTruthDrivenSectionRankingPhase20",
      "useSectionConstructionCredibilityGatePhase20",
      "useTrueGeometricSectioningPhase21",
      "useCentralizedSectionTruthModelPhase21",
      "useDraftingGradeSectionGraphicsPhase21",
      "useConstructionTruthDrivenSectionRankingPhase21",
      "useSectionConstructionCredibilityGatePhase21",
      "useFormalSchemaValidation",
      "useFormalSchemaEngine",
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
          endpoint: "project-health",
          featureFlags,
        },
      );
    }

    const schemaValidation = enforceSchemaValidation(
      res,
      "projectHealthRequest",
      validation.normalized,
      "project-health",
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
      "project-health",
      featureFlags,
    );
    if (!geometrySchemaValidation.valid) {
      return;
    }

    const result = assessProjectHealth({
      projectGeometry,
      drawings: validation.normalized.drawings,
      visualPackage: validation.normalized.visualPackage,
      facadeGrammar: validation.normalized.facadeGrammar,
      validationReport: validation.normalized.validationReport,
      artifactStore: projectGeometry?.metadata?.project_artifact_store || null,
    });

    return res.status(200).json(
      buildProjectHealthResponse({
        result,
        warnings: validation.warnings,
        featureFlags,
      }),
    );
  } catch (error) {
    return sendError(
      res,
      500,
      "PROJECT_HEALTH_FAILED",
      error.message,
      error.details || null,
      {
        endpoint: "project-health",
      },
    );
  }
}
