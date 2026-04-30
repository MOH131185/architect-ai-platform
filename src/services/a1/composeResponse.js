/**
 * Response shaping helpers for the A1 compose route.
 * Keeps headers, payload normalization, and response contract assembly out of
 * the HTTP handler body.
 */

import { readPanelAuthorityMetadata } from "./composeRuntime.js";

export function buildPanelsByKey(panels, coordinates, panelMetricsByType = {}) {
  const panelsByKey = {};
  for (const panel of panels || []) {
    if (!panel?.type) {
      continue;
    }
    const authority = readPanelAuthorityMetadata(panel);
    const slotMetrics = panelMetricsByType?.[panel.type] || null;
    panelsByKey[panel.type] = {
      type: panel.type,
      imageUrl: panel.imageUrl || null,
      url: panel.imageUrl || null,
      hasBuffer: !!panel.buffer,
      coordinates: coordinates?.[panel.type] || null,
      geometryHash: authority.geometryHash,
      svgHash: authority.svgHash,
      sourceType: authority.sourceType,
      authorityUsed: authority.authorityUsed,
      authoritySource: authority.authoritySource,
      panelAuthorityReason: authority.panelAuthorityReason,
      generatorUsed: authority.generatorUsed,
      compiledProjectSchemaVersion: authority.compiledProjectSchemaVersion,
      slotMetrics,
      renderSanity: slotMetrics?.renderSanity || null,
    };
  }
  return panelsByKey;
}

export function normalizeComposeQaResults(qaResults) {
  if (!qaResults) {
    return null;
  }

  return {
    allPassed: qaResults.allPassed,
    summary: qaResults.summary,
    failures: qaResults.failures || [],
    warnings: qaResults.warnings || [],
    skipped: qaResults.skipped || false,
    error: qaResults.error || null,
  };
}

export function normalizeComposeCritiqueResults(critiqueResults) {
  if (!critiqueResults) {
    return null;
  }

  return {
    overallPass: critiqueResults.overall_pass,
    layoutIssues: critiqueResults.layout_issues || [],
    missingItems: critiqueResults.missing_items || [],
    illegibleItems: critiqueResults.illegible_items || [],
    regeneratePanels: critiqueResults.regenerate_panels || [],
    ribaCompliance: critiqueResults.riba_compliance || null,
    visualScore: critiqueResults.visual_score || null,
    skipped: critiqueResults.skipped || false,
    error: critiqueResults.error || null,
  };
}

export function buildComposeSuccessPayload({
  sheetUrl,
  pdfUrl,
  coordinates,
  panelsByKey,
  qaResults,
  critiqueResults,
  metadata,
  traceId,
  runId,
  manifestUrl = null,
}) {
  // Phase F: surface the export gate result on a stable top-level path so
  // clients (UI, downstream services) can distinguish Final A1 vs Preview /
  // Warning / Blocked without parsing the broader metadata object.
  const exportGate =
    metadata?.exportGate || metadata?.finalA1ExportGate || null;

  return {
    success: true,
    sheetUrl,
    composedSheetUrl: sheetUrl,
    url: sheetUrl,
    pdfUrl,
    coordinates,
    panelsByKey,
    qa: normalizeComposeQaResults(qaResults),
    critique: normalizeComposeCritiqueResults(critiqueResults),
    quality: { exportGate },
    trace: {
      traceId: traceId || null,
      runId: runId || null,
      manifestUrl,
    },
    metadata,
  };
}

export default {
  buildPanelsByKey,
  normalizeComposeQaResults,
  normalizeComposeCritiqueResults,
  buildComposeSuccessPayload,
};
