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

  return {
    ...design,
    designId,
    id: design.id || designId,
    restoredFromHistory: true,
    composedSheetUrl: sheetUrl,
    resultUrl: sheetUrl,
    url: sheetUrl,
    pdfUrl,
    metadata,
    sheetMetadata: metadata,
    panelMap,
    panels,
    panelsByKey: panelMap,
    panelCoordinates: coordinates,
    coordinates,
    a1ArtifactManifest: artifactManifest,
    artifactManifest,
    a1Sheet: {
      ...sheet,
      sheetId: sheet.sheetId || design.sheetId || "default",
      url: firstDefined(sheet.url, sheetUrl),
      composedSheetUrl: firstDefined(sheet.composedSheetUrl, sheetUrl),
      pdfUrl: firstDefined(sheet.pdfUrl, pdfUrl),
      metadata,
      panelMap,
      panels: panelMap || panels,
      coordinates,
      artifactManifest,
    },
  };
}
