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

  if (sanitized.dataUrl) {
    delete sanitized.dataUrl;
  }

  if (sanitized.imageUrl) {
    sanitized.imageUrl = stripDataUrl(sanitized.imageUrl);
  }

  return sanitized;
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

    if (sanitizedPanel.imageUrl) {
      sanitizedPanel.imageUrl = stripDataUrl(sanitizedPanel.imageUrl);
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
