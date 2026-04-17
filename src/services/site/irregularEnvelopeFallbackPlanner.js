import { deriveBuildableEnvelope } from "./buildableEnvelopeService.js";
import { resolveIrregularSiteFallback } from "./siteFallbackStrategies.js";
import { partitionIrregularSite } from "./sitePartitioningService.js";

function isEnvelopeLike(value = null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value.buildable_bbox ||
      value.constraints?.buildable_area_ratio !== undefined),
  );
}

export function planIrregularEnvelopeFallback(site = {}, envelope = null) {
  const resolvedEnvelope = isEnvelopeLike(envelope)
    ? envelope
    : deriveBuildableEnvelope(site);
  const fallback = resolveIrregularSiteFallback(site, resolvedEnvelope);
  const partitioning = partitionIrregularSite(site, resolvedEnvelope);

  return {
    version: "phase6-irregular-envelope-fallback-v1",
    envelope: resolvedEnvelope,
    siteScore: fallback.siteScore,
    heuristicConfidence: fallback.heuristicConfidence,
    confidenceClass:
      fallback.heuristicConfidence >= 0.75
        ? "high"
        : fallback.heuristicConfidence >= 0.5
          ? "medium"
          : "low",
    searchStrategies: fallback.searchStrategies,
    partitions: partitioning.partitions,
    warnings: [
      ...new Set([
        ...(fallback.warnings || []),
        ...(partitioning.warnings || []),
      ]),
    ],
  };
}

export default {
  planIrregularEnvelopeFallback,
};
