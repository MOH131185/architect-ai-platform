import { deriveBuildableEnvelope } from "./buildableEnvelopeService.js";
import { scoreIrregularSite } from "./irregularSiteScoringService.js";

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function createPartition(id, role, minX, minY, maxX, maxY) {
  return {
    id,
    role,
    bbox: {
      min_x: roundMetric(minX),
      min_y: roundMetric(minY),
      max_x: roundMetric(maxX),
      max_y: roundMetric(maxY),
      width: roundMetric(maxX - minX),
      height: roundMetric(maxY - minY),
    },
  };
}

export function partitionIrregularSite(site = {}, envelope = null) {
  const resolvedEnvelope = envelope || deriveBuildableEnvelope(site);
  const siteScore = scoreIrregularSite(site, resolvedEnvelope);
  const bbox = resolvedEnvelope.buildable_bbox || {
    min_x: 0,
    min_y: 0,
    max_x: 12,
    max_y: 10,
    width: 12,
    height: 10,
  };
  const minX = Number(bbox.min_x || 0);
  const minY = Number(bbox.min_y || 0);
  const maxX = Number(bbox.max_x || minX + Number(bbox.width || 0));
  const maxY = Number(bbox.max_y || minY + Number(bbox.height || 0));
  const midX = minX + (maxX - minX) / 2;
  const midY = minY + (maxY - minY) / 2;

  let partitions = [
    createPartition(
      "partition:primary-band",
      "primary_band",
      minX,
      minY,
      maxX,
      maxY,
    ),
  ];
  const warnings = [...(siteScore.warnings || [])];

  if (siteScore.siteClass === "narrow") {
    const serviceWidth = Math.max(1.4, (maxX - minX) * 0.22);
    partitions = [
      createPartition(
        "partition:circulation-spine",
        "circulation_spine",
        minX,
        minY,
        minX + serviceWidth,
        maxY,
      ),
      createPartition(
        "partition:main-strip",
        "main_strip",
        minX + serviceWidth,
        minY,
        maxX,
        maxY,
      ),
    ];
    warnings.push(
      "Partitioning reserves a deterministic circulation spine because the buildable envelope is narrow.",
    );
  } else if (siteScore.siteClass === "asymmetric") {
    partitions = [
      createPartition(
        "partition:daylight-front",
        "daylight_front",
        minX,
        minY,
        maxX,
        midY,
      ),
      createPartition(
        "partition:service-rear",
        "service_rear",
        minX,
        midY,
        maxX,
        maxY,
      ),
    ];
    warnings.push(
      "Partitioning biases a daylight-facing front band and a service-focused rear band for asymmetric sites.",
    );
  } else if (siteScore.siteClass === "awkward") {
    const coreWidth = Math.max(2.2, (maxX - minX) * 0.28);
    partitions = [
      createPartition(
        "partition:core-block",
        "core_block",
        minX,
        minY,
        minX + coreWidth,
        maxY,
      ),
      createPartition(
        "partition:flex-band",
        "flex_band",
        minX + coreWidth,
        minY,
        maxX,
        maxY,
      ),
      createPartition(
        "partition:daylight-edge",
        "daylight_edge",
        midX,
        minY,
        maxX,
        maxY,
      ),
    ];
    warnings.push(
      "Partitioning preserves a deterministic core block because the site is awkward for single-pass packing.",
    );
  }

  return {
    version: "phase6-site-partitioning-v1",
    siteScore,
    partitions,
    warnings,
  };
}

export default {
  partitionIrregularSite,
};
