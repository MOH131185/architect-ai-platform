import logger from './logger.js';

function cloneData(value) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    logger.warn('Failed to deep-clone value for sanitization', error);
    return null;
  }
}

export function stripDataUrl(url) {
  if (!url) {
    return null;
  }

  if (typeof url !== 'string') {
    return url;
  }

  if (url.startsWith('data:')) {
    const sizeKB = (url.length / 1024).toFixed(2);
    logger.warn(`Stripping data URL from storage (${sizeKB}KB)`);
    return `[DATA_URL_REMOVED_${sizeKB}KB]`;
  }

  return url;
}

function createDataUrlPlaceholder(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return dataUrl;
  }

  const sizeKB = (dataUrl.length / 1024).toFixed(2);
  return `[DATA_URL_REMOVED_${sizeKB}KB]`;
}

/**
 * Recursively remove `data:` URLs from an object/array payload.
 * Mutates the input (intended for cloned, storage-bound data).
 */
export function stripDataUrlsDeep(value, options = {}) {
  const { maxDepth = 12, logSummary = false, label = 'payload' } = options;

  if (!value || typeof value !== 'object') {
    return value;
  }

  const visited = new WeakSet();
  const stack = [{ node: value, depth: 0 }];

  let strippedCount = 0;
  let strippedChars = 0;

  while (stack.length > 0) {
    const { node, depth } = stack.pop();

    if (!node || typeof node !== 'object') {
      continue;
    }

    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    if (depth >= maxDepth) {
      continue;
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const entry = node[i];
        if (typeof entry === 'string' && entry.startsWith('data:')) {
          strippedCount += 1;
          strippedChars += entry.length;
          node[i] = createDataUrlPlaceholder(entry);
        } else if (entry && typeof entry === 'object') {
          stack.push({ node: entry, depth: depth + 1 });
        }
      }
      continue;
    }

    Object.keys(node).forEach(key => {
      const entry = node[key];

      if (typeof entry === 'string' && entry.startsWith('data:')) {
        strippedCount += 1;
        strippedChars += entry.length;
        node[key] = createDataUrlPlaceholder(entry);
        return;
      }

      if (entry && typeof entry === 'object') {
        stack.push({ node: entry, depth: depth + 1 });
      }
    });
  }

  if (logSummary && strippedCount > 0) {
    logger.warn(`Stripped ${strippedCount} data URLs from ${label}`, {
      strippedCount,
      estimatedStrippedKB: (strippedChars / 1024).toFixed(2)
    });
  }

  return value;
}

export function compressMasterDNA(dna) {
  if (!dna || typeof dna !== 'object') {
    return dna;
  }

  const compressed = {
    dimensions: dna.dimensions,
    materials: dna.materials?.slice(0, 5),
    rooms: dna.rooms?.map(room => ({
      name: room.name,
      dimensions: room.dimensions,
      floor: room.floor
    })),
    viewSpecificFeatures: dna.viewSpecificFeatures,
    consistencyRules: dna.consistencyRules?.slice(0, 10)
  };

  return compressed;
}

export function sanitizeSheetMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  const sanitized = cloneData(metadata) || {};

  stripDataUrlsDeep(sanitized);

  if (sanitized.dataUrl) {
    delete sanitized.dataUrl;
  }

  if (sanitized.imageUrl) {
    sanitized.imageUrl = stripDataUrl(sanitized.imageUrl);
  }

  if (sanitized.resultUrl) {
    sanitized.resultUrl = stripDataUrl(sanitized.resultUrl);
  }

  if (sanitized.composedSheetUrl) {
    sanitized.composedSheetUrl = stripDataUrl(sanitized.composedSheetUrl);
  }

  if (sanitized.url) {
    sanitized.url = stripDataUrl(sanitized.url);
  }

  if (sanitized.panelMap) {
    sanitized.panelMap = sanitizePanelMap(sanitized.panelMap);
  }

  if (Array.isArray(sanitized.panels)) {
    sanitized.panels = sanitizePanelLayout(sanitized.panels);
  } else if (sanitized.panels && typeof sanitized.panels === 'object') {
    sanitized.panels = sanitizePanelMap(sanitized.panels);
  }

  if (Array.isArray(sanitized.panelLayout)) {
    sanitized.panelLayout = sanitizePanelLayout(sanitized.panelLayout);
  }

  if (Array.isArray(sanitized.panelsArray)) {
    sanitized.panelsArray = sanitizePanelLayout(sanitized.panelsArray);
  }

  return sanitized;
}

export function sanitizePanelLayout(panels) {
  if (!Array.isArray(panels)) {
    return null;
  }

  const cloned = cloneData(panels);
  if (!Array.isArray(cloned)) {
    return null;
  }

  return cloned.map(panel => {
    if (!panel || typeof panel !== 'object') {
      return null;
    }

    stripDataUrlsDeep(panel);

    if (panel.imageUrl) {
      panel.imageUrl = stripDataUrl(panel.imageUrl);
    }

    if (panel.previewUrl) {
      panel.previewUrl = stripDataUrl(panel.previewUrl);
    }

    if (panel.url) {
      panel.url = stripDataUrl(panel.url);
    }

    if (panel.dataUrl) {
      const placeholder = stripDataUrl(panel.dataUrl);
      if (!panel.imageUrl && placeholder) {
        panel.imageUrl = placeholder;
      }
      delete panel.dataUrl;
    }

    if (panel.attachment && typeof panel.attachment === 'string') {
      panel.attachment = stripDataUrl(panel.attachment);
    }

    return panel;
  }).filter(Boolean);
}

export function sanitizePanelMap(panelMap) {
  if (!panelMap || typeof panelMap !== 'object') {
    return null;
  }

  const cloned = cloneData(panelMap);

  if (!cloned || typeof cloned !== 'object') {
    return null;
  }

  Object.keys(cloned).forEach(key => {
    const panel = cloned[key];

    if (!panel || typeof panel !== 'object') {
      return;
    }

    const sanitizedPanel = cloneData(panel) || {};

    stripDataUrlsDeep(sanitizedPanel);

    if (sanitizedPanel.imageUrl) {
      sanitizedPanel.imageUrl = stripDataUrl(sanitizedPanel.imageUrl);
    }

    if (sanitizedPanel.url) {
      sanitizedPanel.url = stripDataUrl(sanitizedPanel.url);
    }

    if (sanitizedPanel.previewUrl) {
      sanitizedPanel.previewUrl = stripDataUrl(sanitizedPanel.previewUrl);      
    }

    if (sanitizedPanel.dataUrl) {
      const placeholder = stripDataUrl(sanitizedPanel.dataUrl);
      if (!sanitizedPanel.imageUrl && placeholder) {
        sanitizedPanel.imageUrl = placeholder;
      }
      delete sanitizedPanel.dataUrl;
    }

    cloned[key] = sanitizedPanel;
  });

  return cloned;
}
