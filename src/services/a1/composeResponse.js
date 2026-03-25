/**
 * Response shaping helpers for the A1 compose route.
 * Keeps headers, payload normalization, and response contract assembly out of
 * the HTTP handler body.
 */

export function buildPanelsByKey(panels, coordinates) {
  const panelsByKey = {};
  for (const panel of panels || []) {
    if (!panel?.type) {
      continue;
    }
    panelsByKey[panel.type] = {
      type: panel.type,
      url: panel.imageUrl || null,
      hasBuffer: !!panel.buffer,
      coordinates: coordinates?.[panel.type] || null,
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
