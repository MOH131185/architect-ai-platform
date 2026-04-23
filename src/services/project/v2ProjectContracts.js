export const UK_RESIDENTIAL_V2_PIPELINE_VERSION = "uk-residential-v2.0.0";

export const SUPPORTED_RESIDENTIAL_V2_SUBTYPES = Object.freeze([
  "detached-house",
  "semi-detached-house",
  "terraced-house",
  "villa",
  "cottage",
  "apartment-building",
  "multi-family",
  "duplex",
]);

export const STYLE_BLEND_CHANNELS = Object.freeze([
  "massing",
  "roof",
  "openings",
  "materials",
  "detailing",
]);

export const QUALITY_TIERS = Object.freeze(["baseline", "mid", "premium"]);

function clamp(value, minimum = 0, maximum = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return minimum;
  }
  return Math.max(minimum, Math.min(maximum, numeric));
}

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

export function isSupportedResidentialV2SubType(subType) {
  return SUPPORTED_RESIDENTIAL_V2_SUBTYPES.includes(String(subType || ""));
}

export function buildConfidenceBundle({
  score = 0,
  sources = [],
  fallbackReason = null,
  validation = {},
} = {}) {
  const normalizedScore = clamp(score);
  return {
    score: round(normalizedScore),
    rating:
      normalizedScore >= 0.85
        ? "high"
        : normalizedScore >= 0.6
          ? "medium"
          : normalizedScore >= 0.35
            ? "fair"
            : "low",
    sources: Array.isArray(sources) ? sources.filter(Boolean) : [],
    fallbackReason: fallbackReason || null,
    validation: validation || {},
  };
}

export function createEvidenceStage({
  stage,
  status = "ready",
  confidence = {},
  payload = {},
  warnings = [],
  blockers = [],
} = {}) {
  return {
    stage,
    status,
    confidence: buildConfidenceBundle(confidence),
    warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [],
    blockers: Array.isArray(blockers) ? blockers.filter(Boolean) : [],
    payload,
  };
}

export function createStyleBlendSpec({
  recommended = {},
  approved = {},
  portfolioEvidence = null,
  localStyleEvidence = null,
} = {}) {
  const normalizedRecommended = {};
  const normalizedApproved = {};

  STYLE_BLEND_CHANNELS.forEach((channel) => {
    const recommendedChannel = recommended[channel] || {};
    const approvedChannel = approved[channel] || {};
    normalizedRecommended[channel] = {
      localWeight: round(clamp(recommendedChannel.localWeight ?? 0.5)),
      portfolioWeight: round(clamp(recommendedChannel.portfolioWeight ?? 0.5)),
      rationale: recommendedChannel.rationale || null,
    };
    normalizedApproved[channel] = {
      localWeight: round(
        clamp(
          approvedChannel.localWeight ??
            normalizedRecommended[channel].localWeight,
        ),
      ),
      portfolioWeight: round(
        clamp(
          approvedChannel.portfolioWeight ??
            normalizedRecommended[channel].portfolioWeight,
        ),
      ),
      source:
        approvedChannel.source ||
        (approved[channel] ? "user-approved" : "recommended"),
    };
  });

  return {
    schema_version: "style-blend-spec-v1",
    portfolioEvidenceId: portfolioEvidence?.id || null,
    localStyleEvidenceId: localStyleEvidence?.id || null,
    recommended: normalizedRecommended,
    approved: normalizedApproved,
  };
}

export function createProjectBrief({
  projectType = null,
  targetAreaM2 = 0,
  qualityTier = "mid",
  preferences = {},
  requiredSpaces = [],
} = {}) {
  return {
    schema_version: "project-brief-v1",
    projectType,
    targetAreaM2: round(targetAreaM2, 2),
    qualityTier: QUALITY_TIERS.includes(qualityTier) ? qualityTier : "mid",
    preferences: preferences || {},
    requiredSpaces: Array.isArray(requiredSpaces) ? requiredSpaces : [],
  };
}

export function createSheetArtifactManifest({
  geometryHash = null,
  pipelineVersion = UK_RESIDENTIAL_V2_PIPELINE_VERSION,
  panels = {},
  confidence = {},
  validation = {},
} = {}) {
  return {
    schema_version: "sheet-artifact-manifest-v1",
    pipelineVersion,
    geometryHash,
    confidence: buildConfidenceBundle(confidence),
    validation,
    panels,
  };
}

export function createCostWorkbookManifest({
  geometryHash = null,
  pipelineVersion = UK_RESIDENTIAL_V2_PIPELINE_VERSION,
  tabs = [],
  currency = "GBP",
  assumptions = [],
  totals = {},
} = {}) {
  return {
    schema_version: "cost-workbook-manifest-v1",
    geometryHash,
    pipelineVersion,
    tabs,
    currency,
    assumptions,
    totals,
  };
}

export default {
  UK_RESIDENTIAL_V2_PIPELINE_VERSION,
  SUPPORTED_RESIDENTIAL_V2_SUBTYPES,
  STYLE_BLEND_CHANNELS,
  QUALITY_TIERS,
  isSupportedResidentialV2SubType,
  buildConfidenceBundle,
  createEvidenceStage,
  createStyleBlendSpec,
  createProjectBrief,
  createSheetArtifactManifest,
  createCostWorkbookManifest,
};
