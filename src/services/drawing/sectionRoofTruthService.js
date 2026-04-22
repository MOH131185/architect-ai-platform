import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  resolveRoofTruthMode,
  truthBucketFromMode,
} from "./constructionTruthModel.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function classifyQuality(score = 0) {
  const resolved = Number(score || 0);
  if (resolved >= 0.72) return "verified";
  if (resolved >= 0.42) return "weak";
  return "blocked";
}

function phase21TruthEnabled() {
  return (
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21")
  );
}

function roofSupportPenalty(mode = "missing") {
  switch (String(mode || "").toLowerCase()) {
    case "explicit_generated":
      return 0;
    case "derived_profile_only":
      return 0.12;
    case "roof_language_only":
      return 0.2;
    default:
      return 0.28;
  }
}

export function assessSectionRoofTruth(sectionEvidence = {}, geometry = {}) {
  const summary = sectionEvidence.summary || {};
  const roofElements = sectionEvidence.intersections?.roofElements || [];
  const exactDirect = roofElements.filter(
    (entry) => entry.exactClip === true,
  ).length;
  const directCount = Number(roofElements.length || 0);
  const nearCount = Number(
    (sectionEvidence.intersections?.nearRoofElements || []).length,
  );
  const inferredCount = Number(
    (sectionEvidence.intersections?.inferredRoofElements || []).length,
  );
  const unsupportedCount = Number(
    (sectionEvidence.intersections?.unsupportedRoofElements || []).length,
  );
  const supportMode = resolveRoofTruthMode({
    roofPrimitives: geometry?.roof_primitives || geometry?.roofElements || [],
    roofSummary: geometry?.metadata?.canonical_construction_truth?.roof || {},
    roof: geometry?.roof || {},
  });
  const hasRoofLanguage = Boolean(
    geometry?.roof?.type || sectionEvidence?.roofLanguage,
  );
  const explicitRoofPrimitiveCount = Number(
    sectionEvidence.sectionIntersections?.explicitRoofPrimitiveCount ||
      (geometry?.roof_primitives || geometry?.roofElements || []).length ||
      0,
  );
  const directTruthCount = Number(summary?.roofDirectTruthCount || 0);
  const contextualTruthCount = Number(summary?.roofContextualTruthCount || 0);
  const derivedTruthCount = Number(summary?.roofDerivedTruthCount || 0);
  const explicitGeneratedCount = Number(
    geometry?.metadata?.canonical_construction_truth?.roof
      ?.explicit_generated_count || 0,
  );
  const parapetCount = Number(
    sectionEvidence.sectionIntersections?.explicitParapetCount || 0,
  );
  const roofBreakCount = Number(
    sectionEvidence.sectionIntersections?.explicitRoofBreakCount || 0,
  );
  const hipCount = Number(
    sectionEvidence.sectionIntersections?.explicitHipCount || 0,
  );
  const valleyCount = Number(
    sectionEvidence.sectionIntersections?.explicitValleyCount || 0,
  );
  const dormerAttachmentCount = Number(
    sectionEvidence.sectionIntersections?.explicitDormerAttachmentCount || 0,
  );
  const edgeCount = Number(
    sectionEvidence.sectionIntersections?.explicitRoofEdgeCount || 0,
  );
  const directPrimitiveFamilies = [
    ...new Set(
      roofElements
        .map((entry) => entry.primitive_family || entry.type || null)
        .filter(Boolean),
    ),
  ];
  const derivedOnly =
    String(supportMode).toLowerCase() === "derived_profile_only" ||
    (
      sectionEvidence.sectionIntersections?.geometrySupport?.roofElements || []
    ).every((entry) =>
      ["derived_roof_profile", "bbox", "missing_geometry"].includes(
        String(entry),
      ),
    );
  const phase21 = phase21TruthEnabled();
  const faceBundle = sectionEvidence.sectionFaceBundle || null;
  const roofFaces = faceBundle?.perKind?.roofs || null;
  const cutFaceCount = phase21 ? Number(roofFaces?.cutFaceCount || 0) : 0;
  const cutProfileCount = phase21 ? Number(roofFaces?.cutProfileCount || 0) : 0;
  const contextualFaceCount = phase21
    ? Number(roofFaces?.contextualCount || 0)
    : 0;
  const derivedFaceCount = phase21 ? Number(roofFaces?.derivedCount || 0) : 0;

  const score = round(
    Math.min(1, exactDirect * 0.34) +
      Math.min(0.18, directCount * 0.08) +
      Math.min(0.18, directTruthCount * 0.08) +
      Math.min(0.08, contextualTruthCount * 0.03) +
      Math.min(0.14, explicitGeneratedCount * 0.03) +
      Math.min(0.1, edgeCount * 0.03) +
      Math.min(0.08, parapetCount * 0.03) +
      Math.min(0.08, roofBreakCount * 0.03) +
      Math.min(0.08, hipCount * 0.03) +
      Math.min(0.08, valleyCount * 0.03) +
      Math.min(0.06, dormerAttachmentCount * 0.03) +
      (String(supportMode).toLowerCase() === "explicit_generated" &&
      exactDirect > 0
        ? 0.14
        : 0) +
      (String(supportMode).toLowerCase() === "derived_profile_only" &&
      (nearCount > 0 || hasRoofLanguage)
        ? 0.12
        : 0) +
      (hasRoofLanguage ? 0.08 : 0) +
      Math.min(0.12, nearCount * 0.05) +
      Math.min(0.08, inferredCount * 0.03) +
      (phase21 ? Math.min(0.18, cutFaceCount * 0.08) : 0) +
      (phase21 ? Math.min(0.1, cutProfileCount * 0.04) : 0) -
      Math.min(0.08, derivedTruthCount * 0.025) -
      Math.min(0.18, unsupportedCount * 0.08) -
      (phase21 ? Math.min(0.06, derivedFaceCount * 0.02) : 0) -
      roofSupportPenalty(supportMode) -
      (derivedOnly ? 0.04 : 0),
  );

  return {
    score,
    quality: classifyQuality(score),
    supportMode,
    truthState: truthBucketFromMode(supportMode),
    exactDirectCount: exactDirect,
    directCount,
    nearCount,
    inferredCount,
    directTruthCount,
    contextualTruthCount,
    derivedTruthCount,
    unsupportedCount,
    derivedOnly,
    hasRoofLanguage,
    explicitRoofPrimitiveCount,
    explicitGeneratedCount,
    edgeCount,
    parapetCount,
    roofBreakCount,
    hipCount,
    valleyCount,
    dormerAttachmentCount,
    directPrimitiveFamilies,
    cutFaceCount,
    cutProfileCount,
    contextualFaceCount,
    derivedFaceCount,
    phase21,
  };
}

export default {
  assessSectionRoofTruth,
};
