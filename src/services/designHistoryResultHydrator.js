import { buildExportManifestFromSummary } from "./export/buildClientExportManifest.js";

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizePanelMap(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((panel, index) => {
          if (!panel || typeof panel !== "object") {
            return null;
          }
          const key =
            panel.key ||
            panel.id ||
            panel.type ||
            panel.panelType ||
            panel.panel_type ||
            `panel_${index}`;
          return [key, panel];
        })
        .filter(Boolean),
    );
  }

  if (typeof value === "object") {
    return value;
  }

  return null;
}

function normalizePanels(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "object") {
    return Object.entries(value).map(([key, panel]) => ({
      key,
      type: panel?.type || panel?.panelType || panel?.panel_type || key,
      label: panel?.label || panel?.name || key,
      ...(panel || {}),
    }));
  }

  return [];
}

export function buildSheetResultFromDesignHistoryEntry(design = {}) {
  if (!design || typeof design !== "object") {
    return null;
  }

  const designId = design.designId || design.id || null;
  const sheet = design.a1Sheet || {};
  const metadata = {
    ...(sheet.metadata || {}),
    ...(design.sheetMetadata || {}),
    ...(design.metadata || {}),
    designId,
    restoredFromHistory: true,
  };
  const sheetUrl = firstDefined(
    design.composedSheetUrl,
    design.resultUrl,
    design.url,
    design.a1SheetUrl,
    sheet.composedSheetUrl,
    sheet.url,
  );
  const pdfUrl = firstDefined(design.pdfUrl, sheet.pdfUrl);
  const panelMap = normalizePanelMap(
    firstDefined(
      design.panelMap,
      design.panelsByKey,
      design.panels,
      sheet.panelMap,
      sheet.panels,
      metadata.panelMap,
      metadata.panels,
    ),
  );
  const panels = normalizePanels(firstDefined(design.panels, panelMap));
  const coordinates = firstDefined(
    design.panelCoordinates,
    design.coordinates,
    sheet.coordinates,
    metadata.panelCoordinates,
    metadata.coordinates,
  );
  const artifactManifest = firstDefined(
    design.a1ArtifactManifest,
    design.artifactManifest,
    sheet.artifactManifest,
    metadata.artifactManifest,
  );

  // Phase 2 export-fix: restore the engineering bundle the design history
  // compactor strips on save. The repository persists a slim
  // `compiledProjectExportSummary` + `exportManifest` pair specifically so
  // ExportPanel can render correct READY/BLOCKED rows after a reload.
  //
  // The full `compiledProject` is intentionally NOT restored here — it was
  // never persisted (would blow the localStorage budget). Callers that need
  // to re-export an engineering format from a restored design either
  // (a) regenerate, or (b) consume the prebaked artifact-package via
  // designData.package.signedUrl / downloadRoute. The manifest tells the UI
  // which formats *would* succeed when those bytes are in scope.
  const geometryHash = firstDefined(
    design.geometryHash,
    sheet.geometryHash,
    metadata.geometryHash,
  );
  const compiledProjectExportSummary = firstDefined(
    design.compiledProjectExportSummary,
    sheet.compiledProjectExportSummary,
    metadata.compiledProjectExportSummary,
  );
  let restoredExportManifest = firstDefined(
    design.exportManifest,
    sheet.exportManifest,
    metadata.exportManifest,
  );
  if (!restoredExportManifest && compiledProjectExportSummary) {
    restoredExportManifest = buildExportManifestFromSummary({
      summary: compiledProjectExportSummary,
      projectName: design.projectName || metadata.projectName,
      pipelineVersion: design.pipelineVersion || metadata.pipelineVersion,
    });
  }
  const restoredSheetArtifactManifest = firstDefined(
    design.sheetArtifactManifest,
    sheet.sheetArtifactManifest,
    metadata.sheetArtifactManifest,
  );
  // Restore the A1 export QA gate so ExportPanel still renders the red
  // banner and exportService still refuses PNG/PDF/SVG when the original
  // generation was blocked (Phase 3/4 contract). The repository persists
  // a small `{ status, blockers: [...] }` summary in versionMetadata.
  const restoredA1ExportQa = firstDefined(
    design.a1ExportQa,
    sheet.a1ExportQa,
    metadata.a1ExportQa,
  );

  return {
    ...design,
    designId,
    id: design.id || designId,
    restoredFromHistory: true,
    composedSheetUrl: sheetUrl,
    resultUrl: sheetUrl,
    url: sheetUrl,
    pdfUrl,
    metadata: { ...metadata, a1ExportQa: restoredA1ExportQa },
    sheetMetadata: { ...metadata, a1ExportQa: restoredA1ExportQa },
    panelMap,
    panels,
    panelsByKey: panelMap,
    panelCoordinates: coordinates,
    coordinates,
    a1ArtifactManifest: artifactManifest,
    artifactManifest,
    geometryHash,
    compiledProjectExportSummary,
    exportManifest: restoredExportManifest,
    sheetArtifactManifest: restoredSheetArtifactManifest,
    a1ExportQa: restoredA1ExportQa,
    a1Sheet: {
      ...sheet,
      sheetId: sheet.sheetId || design.sheetId || "default",
      url: firstDefined(sheet.url, sheetUrl),
      composedSheetUrl: firstDefined(sheet.composedSheetUrl, sheetUrl),
      pdfUrl: firstDefined(sheet.pdfUrl, pdfUrl),
      metadata: { ...metadata, a1ExportQa: restoredA1ExportQa },
      panelMap,
      panels: panelMap || panels,
      coordinates,
      artifactManifest,
      a1ExportQa: restoredA1ExportQa,
    },
  };
}
