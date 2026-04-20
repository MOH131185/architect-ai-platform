import sharp from "sharp";

import { isFeatureEnabled } from "../../config/featureFlags.js";
import { recognizeA1RenderedZones } from "./a1OCRService.js";
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

function deriveZoneEvidenceState({
  verificationPhase = "pre_compose",
  status = "warning",
  matchedLabels = [],
  ocrEvidenceState = "provisional",
  evidenceScore = 0,
  varianceScore = null,
  textNodeCount = 0,
} = {}) {
  if (status === "block") {
    return "blocked";
  }
  if (
    verificationPhase === "post_compose" &&
    matchedLabels.length > 0 &&
    ocrEvidenceState === "verified"
  ) {
    return "verified";
  }
  if (
    verificationPhase === "post_compose" &&
    matchedLabels.length > 0 &&
    Number(evidenceScore || 0) >= 0.64 &&
    (Number(varianceScore || 0) >= 0.18 || Number(textNodeCount || 0) > 0)
  ) {
    return "verified";
  }
  if (status === "pass") {
    return verificationPhase === "post_compose" ? "weak" : "provisional";
  }
  return "weak";
}

function resolveZoneMethods({
  expectedLabels = [],
  matchedLabels = [],
  matchedNodes = [],
  varianceScore = null,
  ocrMatchedLabels = [],
  ocrText = "",
} = {}) {
  return unique([
    expectedLabels.length ? "metadata" : null,
    matchedLabels.length ? "svg_text" : null,
    matchedNodes.length ? "zone_text_nodes" : null,
    Number(varianceScore || 0) > 0 ? "raster_variance" : null,
    ocrMatchedLabels.length || String(ocrText || "").trim() ? "ocr" : null,
  ]);
}

function buildZoneResult({
  zone = {},
  matchedLabels = [],
  matchedNodes = [],
  varianceScore = null,
  ocrText = "",
  ocrConfidence = null,
  ocrMatchedLabels = [],
  ocrEvidenceState = "provisional",
  verificationPhase = "pre_compose",
} = {}) {
  const combinedMatchedLabels = unique([...matchedLabels, ...ocrMatchedLabels]);
  const evidenceScore = round(
    Math.min(
      1,
      combinedMatchedLabels.length * 0.45 +
        Math.min(0.55, matchedNodes.length * 0.18) +
        Number(varianceScore || 0) * 0.18 +
        (Number(ocrConfidence || 0) > 0
          ? Math.min(
              0.22,
              Number(ocrConfidence || 0) *
                (ocrMatchedLabels.length ? 0.22 : 0.1),
            )
          : 0),
    ),
  );
  const minimum = Number(zone.minimumEvidenceScore || 0.2);
  const status = resolveZoneStatus({
    required: zone.required === true,
    expectedLabels: zone.expectedLabels || [],
    matchedLabels: combinedMatchedLabels,
    evidenceScore,
    minimumEvidenceScore: minimum,
  });
  const methodsUsed = resolveZoneMethods({
    expectedLabels: zone.expectedLabels || [],
    matchedLabels: combinedMatchedLabels,
    matchedNodes,
    varianceScore,
    ocrMatchedLabels,
    ocrText,
  });

  return {
    id: zone.id,
    type: zone.type,
    required: zone.required === true,
    expectedLabels: zone.expectedLabels || [],
    bounds: zone.bounds || null,
    boundsNormalized: zone.boundsNormalized || null,
    minimumEvidenceScore: minimum,
    matchedLabels: combinedMatchedLabels,
    textNodeCount: matchedNodes.length,
    varianceScore: varianceScore === null ? null : round(varianceScore),
    ocrText,
    ocrConfidence:
      ocrConfidence === null || ocrConfidence === undefined
        ? null
        : round(ocrConfidence),
    ocrMatchedLabels,
    ocrEvidenceState,
    methodsUsed,
    evidenceScore,
    status,
    evidenceState: deriveZoneEvidenceState({
      verificationPhase,
      status,
      matchedLabels: combinedMatchedLabels,
      ocrEvidenceState,
      evidenceScore,
      varianceScore,
      textNodeCount: matchedNodes.length,
    }),
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
    version: "phase12-a1-rendered-text-verification-v1",
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
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  if (left >= width || top >= height) {
    return null;
  }
  const extractRegion = {
    left,
    top,
    width: Math.max(
      1,
      Math.min(width - left, Math.max(0, Math.floor(bounds.width))),
    ),
    height: Math.max(
      1,
      Math.min(height - top, Math.max(0, Math.floor(bounds.height))),
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
  ocrAdapter = null,
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
  const useOCR =
    isFeatureEnabled("useOCRTextVerificationPhase12") ||
    isFeatureEnabled("useOCRTextVerificationPhase11");
  const ocrResults = useOCR
    ? await recognizeA1RenderedZones({
        renderedBuffer,
        zones: base.zones || [],
        width: renderedWidth,
        height: renderedHeight,
        ocrAdapter,
      })
    : null;
  const upgradedZones = [];

  for (const [index, zone] of (base.zones || []).entries()) {
    const varianceScore = await computeZoneVariance(
      renderedBuffer,
      zone,
      renderedWidth,
      renderedHeight,
    );
    const ocrZone = ocrResults?.zoneResults?.[index] || null;
    const ocrMatchedLabels = ocrZone?.matchedLabels || [];
    const upgradedScore =
      Number(zone.evidenceScore || 0) +
      Number(varianceScore || 0) * 0.18 +
      (Number(ocrZone?.confidence || 0) > 0
        ? Math.min(
            0.22,
            Number(ocrZone?.confidence || 0) *
              (ocrMatchedLabels.length ? 0.22 : 0.1),
          )
        : 0);
    upgradedZones.push({
      ...zone,
      varianceScore: varianceScore === null ? null : round(varianceScore),
      ocrText: ocrZone?.text || "",
      ocrConfidence:
        ocrZone?.confidence === null || ocrZone?.confidence === undefined
          ? null
          : round(ocrZone.confidence),
      ocrMatchedLabels,
      ocrEvidenceState: ocrZone?.evidenceState || "provisional",
      matchedLabels: unique([
        ...(zone.matchedLabels || []),
        ...ocrMatchedLabels,
      ]),
      evidenceScore: round(Math.min(1, upgradedScore)),
      status: resolveZoneStatus({
        required: zone.required === true,
        expectedLabels: zone.expectedLabels || [],
        matchedLabels: unique([
          ...(zone.matchedLabels || []),
          ...ocrMatchedLabels,
        ]),
        evidenceScore: upgradedScore,
        minimumEvidenceScore: Number(zone.minimumEvidenceScore || 0.2),
      }),
      evidenceState: deriveZoneEvidenceState({
        verificationPhase,
        status: resolveZoneStatus({
          required: zone.required === true,
          expectedLabels: zone.expectedLabels || [],
          matchedLabels: unique([
            ...(zone.matchedLabels || []),
            ...ocrMatchedLabels,
          ]),
          evidenceScore: upgradedScore,
          minimumEvidenceScore: Number(zone.minimumEvidenceScore || 0.2),
        }),
        matchedLabels: unique([
          ...(zone.matchedLabels || []),
          ...ocrMatchedLabels,
        ]),
        ocrEvidenceState: ocrZone?.evidenceState || "provisional",
        evidenceScore: upgradedScore,
        varianceScore,
        textNodeCount: Number(zone.textNodeCount || 0),
      }),
      methodsUsed: resolveZoneMethods({
        expectedLabels: zone.expectedLabels || [],
        matchedLabels: unique([
          ...(zone.matchedLabels || []),
          ...ocrMatchedLabels,
        ]),
        matchedNodes: new Array(Number(zone.textNodeCount || 0)).fill(null),
        varianceScore,
        ocrMatchedLabels,
        ocrText: ocrZone?.text || "",
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
    version: "phase12-a1-rendered-text-verification-v1",
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
    ocr: ocrResults || {
      version: "phase12-a1-ocr-service-v1",
      available: false,
      source: "unavailable",
      fallbackUsed: true,
      summary: {
        availableCount: 0,
        verifiedCount: 0,
        weakCount: 0,
        provisionalCount: upgradedZones.length,
      },
    },
    ocrEvidenceQuality:
      ocrResults?.summary?.verifiedCount > 0
        ? "verified"
        : ocrResults?.summary?.availableCount > 0
          ? "weak"
          : "provisional",
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
    methodsUsed: unique(
      upgradedZones.flatMap((zone) => zone.methodsUsed || []),
    ),
  };
}

export default {
  verifyRenderedTextZones,
  verifyRenderedTextZonesSync,
};
