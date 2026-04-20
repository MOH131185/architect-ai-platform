import sharp from "sharp";

import { buildA1LabelZoneRegistry } from "./a1LabelZoneRegistry.js";
import { buildVerificationState } from "./a1VerificationStateModel.js";

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function stripTags(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTextNodes(sheetSvg = "") {
  const svg = String(sheetSvg || "");
  const nodes = [];
  const regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let match = regex.exec(svg);
  while (match) {
    const attributes = String(match[1] || "");
    const text = stripTags(match[2] || "");
    const xMatch = attributes.match(/\bx="([^"]+)"/i);
    const yMatch = attributes.match(/\by="([^"]+)"/i);
    nodes.push({
      text,
      x: xMatch ? Number(xMatch[1]) : null,
      y: yMatch ? Number(yMatch[1]) : null,
    });
    match = regex.exec(svg);
  }
  return nodes.filter((node) => node.text);
}

function resolveZoneBounds(zone = {}, width = null, height = null) {
  if (zone.bounds) {
    return {
      x: Number(zone.bounds.x || 0),
      y: Number(zone.bounds.y || 0),
      width: Number(zone.bounds.width || 0),
      height: Number(zone.bounds.height || 0),
    };
  }
  if (!width || !height || !zone.boundsNormalized) {
    return null;
  }
  return {
    x: Number(zone.boundsNormalized.x || 0) * width,
    y: Number(zone.boundsNormalized.y || 0) * height,
    width: Number(zone.boundsNormalized.width || 0) * width,
    height: Number(zone.boundsNormalized.height || 0) * height,
  };
}

function nodeInsideBounds(node = {}, bounds = null) {
  if (!bounds || node.x === null || node.y === null) {
    return false;
  }
  return (
    node.x >= bounds.x &&
    node.x <= bounds.x + bounds.width &&
    node.y >= bounds.y &&
    node.y <= bounds.y + bounds.height
  );
}

function resolveZoneStatus({
  required = false,
  expectedLabels = [],
  matchedLabels = [],
  evidenceScore = 0,
  minimumEvidenceScore = 0.2,
} = {}) {
  const expectedLabelMissing =
    Array.isArray(expectedLabels) &&
    expectedLabels.length > 0 &&
    matchedLabels.length === 0;

  if (required && expectedLabelMissing) {
    return "block";
  }

  if (expectedLabelMissing) {
    return "warning";
  }

  if (evidenceScore >= minimumEvidenceScore) {
    return "pass";
  }

  return required ? "block" : "warning";
}

function buildZoneResult({
  zone = {},
  matchedLabels = [],
  matchedNodes = [],
  varianceScore = null,
  verificationPhase = "pre_compose",
} = {}) {
  const evidenceScore = round(
    Math.min(
      1,
      matchedLabels.length * 0.45 +
        Math.min(0.55, matchedNodes.length * 0.18) +
        Number(varianceScore || 0) * 0.25,
    ),
  );
  const minimum = Number(zone.minimumEvidenceScore || 0.2);
  const status = resolveZoneStatus({
    required: zone.required === true,
    expectedLabels: zone.expectedLabels || [],
    matchedLabels,
    evidenceScore,
    minimumEvidenceScore: minimum,
  });

  return {
    id: zone.id,
    type: zone.type,
    required: zone.required === true,
    expectedLabels: zone.expectedLabels || [],
    bounds: zone.bounds || null,
    boundsNormalized: zone.boundsNormalized || null,
    minimumEvidenceScore: minimum,
    matchedLabels,
    textNodeCount: matchedNodes.length,
    varianceScore: varianceScore === null ? null : round(varianceScore),
    evidenceScore,
    status,
    evidenceState:
      verificationPhase === "post_compose" ? "verified" : "provisional",
  };
}

export function verifyRenderedTextZonesSync({
  sheetSvg = "",
  expectedLabels = [],
  coordinates = {},
  panelLabelMap = {},
  width = null,
  height = null,
  verificationPhase = "pre_compose",
} = {}) {
  const svg = String(sheetSvg || "");
  const textNodes = parseTextNodes(svg);
  const registry = buildA1LabelZoneRegistry({
    expectedLabels,
    coordinates,
    panelLabelMap,
  });

  const zones = (registry.zones || []).map((zone) => {
    const bounds = resolveZoneBounds(zone, width, height);
    const matchedNodes = bounds
      ? textNodes.filter((node) => nodeInsideBounds(node, bounds))
      : textNodes.filter((node) =>
          (zone.expectedLabels || []).some((label) =>
            String(node.text || "")
              .toUpperCase()
              .includes(String(label || "").toUpperCase()),
          ),
        );
    const labelEvidenceTexts = bounds
      ? matchedNodes.map((node) => node.text)
      : [svg, ...matchedNodes.map((node) => node.text)];
    const matchedLabels = unique(
      (zone.expectedLabels || []).filter((label) =>
        labelEvidenceTexts.some((text) =>
          String(text || "")
            .toUpperCase()
            .includes(String(label || "").toUpperCase()),
        ),
      ),
    );
    return buildZoneResult({
      zone,
      matchedLabels,
      matchedNodes,
      verificationPhase,
    });
  });

  const blockers = zones
    .filter((zone) => zone.status === "block")
    .map(
      (zone) =>
        `Rendered text zone ${zone.id} lacks enough evidence for reliable final-sheet labelling.`,
    );
  const warnings = zones
    .filter((zone) => zone.status === "warning")
    .map(
      (zone) =>
        `Rendered text zone ${zone.id} is present but weaker than preferred.`,
    );

  return {
    version: "phase10-a1-rendered-text-verification-v1",
    verificationPhase,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers,
    warnings,
    confidence: round(
      zones.length
        ? zones.reduce(
            (sum, zone) => sum + Number(zone.evidenceScore || 0),
            0,
          ) / zones.length
        : 0,
    ),
    zones,
    textNodeCount: textNodes.length,
    verificationState: buildVerificationState({
      phase: verificationPhase,
      status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
      blockers,
      warnings,
      confidence: zones.length
        ? zones.reduce(
            (sum, zone) => sum + Number(zone.evidenceScore || 0),
            0,
          ) / zones.length
        : 0,
      label: "renderedTextZone",
      evidenceSource: "svg_text",
    }),
  };
}

async function computeZoneVariance(renderedBuffer, zone = {}, width, height) {
  const bounds = resolveZoneBounds(zone, width, height);
  if (!bounds || !renderedBuffer) {
    return null;
  }
  const extractRegion = {
    left: Math.max(0, Math.floor(bounds.x)),
    top: Math.max(0, Math.floor(bounds.y)),
    width: Math.max(
      1,
      Math.min(width - Math.floor(bounds.x), Math.floor(bounds.width)),
    ),
    height: Math.max(
      1,
      Math.min(height - Math.floor(bounds.y), Math.floor(bounds.height)),
    ),
  };
  if (extractRegion.width <= 0 || extractRegion.height <= 0) {
    return null;
  }
  const stats = await sharp(renderedBuffer)
    .extract(extractRegion)
    .removeAlpha()
    .stats();
  const averageDeviation =
    (stats.channels || []).reduce(
      (sum, channel) => sum + Number(channel.stdev || 0),
      0,
    ) / Math.max(1, (stats.channels || []).length);
  return Math.min(1, averageDeviation / 48);
}

export async function verifyRenderedTextZones({
  sheetSvg = "",
  renderedBuffer = null,
  expectedLabels = [],
  coordinates = {},
  panelLabelMap = {},
  width = null,
  height = null,
  verificationPhase = renderedBuffer ? "post_compose" : "pre_compose",
} = {}) {
  const base = verifyRenderedTextZonesSync({
    sheetSvg,
    expectedLabels,
    coordinates,
    panelLabelMap,
    width,
    height,
    verificationPhase,
  });

  if (!renderedBuffer) {
    return base;
  }

  const metadata = await sharp(renderedBuffer).metadata();
  const renderedWidth = width || Number(metadata.width || 0);
  const renderedHeight = height || Number(metadata.height || 0);
  const upgradedZones = [];

  for (const zone of base.zones || []) {
    const varianceScore = await computeZoneVariance(
      renderedBuffer,
      zone,
      renderedWidth,
      renderedHeight,
    );
    upgradedZones.push({
      ...zone,
      varianceScore: varianceScore === null ? null : round(varianceScore),
      evidenceScore: round(
        Math.min(
          1,
          Number(zone.evidenceScore || 0) + Number(varianceScore || 0) * 0.18,
        ),
      ),
      status: resolveZoneStatus({
        required: zone.required === true,
        expectedLabels: zone.expectedLabels || [],
        matchedLabels: zone.matchedLabels || [],
        evidenceScore:
          Number(zone.evidenceScore || 0) + Number(varianceScore || 0) * 0.18,
        minimumEvidenceScore: Number(zone.minimumEvidenceScore || 0.2),
      }),
    });
  }

  const blockers = upgradedZones
    .filter((zone) => zone.status === "block")
    .map(
      (zone) =>
        `Rendered text zone ${zone.id} lacks enough raster evidence for reliable final-sheet labelling.`,
    );
  const warnings = upgradedZones
    .filter((zone) => zone.status === "warning")
    .map(
      (zone) =>
        `Rendered text zone ${zone.id} remains visually weak in the composed board.`,
    );

  return {
    ...base,
    verificationPhase,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: unique(blockers),
    warnings: unique(warnings),
    confidence: round(
      upgradedZones.length
        ? upgradedZones.reduce(
            (sum, zone) => sum + Number(zone.evidenceScore || 0),
            0,
          ) / upgradedZones.length
        : 0,
    ),
    zones: upgradedZones,
    verificationState: buildVerificationState({
      phase: verificationPhase,
      status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
      blockers,
      warnings,
      confidence: upgradedZones.length
        ? upgradedZones.reduce(
            (sum, zone) => sum + Number(zone.evidenceScore || 0),
            0,
          ) / upgradedZones.length
        : 0,
      label: "renderedTextZone",
      evidenceSource: renderedBuffer ? "rendered_output" : "svg_text",
    }),
  };
}

export default {
  verifyRenderedTextZones,
  verifyRenderedTextZonesSync,
};
