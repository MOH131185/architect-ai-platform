import logger from '../utils/logger.js';

const DEFAULT_MIN_WIDTH = 800;
const DEFAULT_MIN_HEIGHT = 800;
const DEFAULT_MAX_AGE_MINUTES = 30;

function normalizeSnapshotInput(input) {
  if (!input) {
    return null;
  }

  if (typeof input === 'string') {
    return { dataUrl: input };
  }

  if (input.attachment && !input.dataUrl) {
    return {
      ...input,
      dataUrl: input.attachment
    };
  }

  return input;
}

function extractCapturedAt(snapshot) {
  return snapshot?.capturedAt || snapshot?.metadata?.capturedAt || snapshot?.timestamp || snapshot?.metadata?.timestamp || null;
}

function extractSize(snapshot) {
  const size = snapshot?.size || snapshot?.metadata?.size;

  if (!size) {
    return null;
  }

  const width = typeof size.width === 'string' ? parseInt(size.width, 10) : size.width;
  const height = typeof size.height === 'string' ? parseInt(size.height, 10) : size.height;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return { width, height };
}

function getAgeMs(capturedAt) {
  if (!capturedAt) {
    return null;
  }

  const timestamp = Date.parse(capturedAt);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Date.now() - timestamp;
}

async function measureDataUrlDimensions(dataUrl) {
  if (typeof window === 'undefined' || typeof Image === 'undefined' || !dataUrl || !dataUrl.startsWith('data:')) {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function validateSiteSnapshot(snapshotInput, options = {}) {
  const {
    minWidth = DEFAULT_MIN_WIDTH,
    minHeight = DEFAULT_MIN_HEIGHT,
    maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES,
    allowMissing = false,
    context = 'generation'
  } = options;

  const errors = [];
  const warnings = [];
  const snapshot = normalizeSnapshotInput(snapshotInput);

  if (!snapshot || !snapshot.dataUrl) {
    if (allowMissing) {
      return {
        valid: true,
        warnings: ['No site snapshot provided; validation skipped'],
        errors,
        details: { context }
      };
    }

    errors.push({
      code: 'MISSING_SNAPSHOT',
      message: 'Site snapshot is required but missing. Please capture the site map again.'
    });

    return {
      valid: false,
      errors,
      warnings,
      details: { context }
    };
  }

  const details = {
    context,
    capturedAt: null,
    width: null,
    height: null,
    dataLengthKB: Math.round((snapshot.dataUrl.length / 1024) * 100) / 100
  };

  const capturedAt = extractCapturedAt(snapshot);
  details.capturedAt = capturedAt;

  if (!capturedAt) {
    errors.push({
      code: 'MISSING_TIMESTAMP',
      message: 'Site snapshot timestamp missing. Please recapture to refresh metadata.'
    });
  } else {
    const ageMs = getAgeMs(capturedAt);
    if (ageMs === null) {
      errors.push({
        code: 'INVALID_TIMESTAMP',
        message: 'Unable to parse site snapshot timestamp. Recapture is required.'
      });
    } else if (ageMs > maxAgeMinutes * 60 * 1000) {
      const ageMinutes = Math.round(ageMs / 60000);
      errors.push({
        code: 'SNAPSHOT_STALE',
        message: `Site snapshot is ${ageMinutes} minutes old. Capture must be less than ${maxAgeMinutes} minutes old.`
      });
    }
  }

  let size = extractSize(snapshot);

  if (!size) {
    size = await measureDataUrlDimensions(snapshot.dataUrl);
  }

  if (!size) {
    warnings.push('Unable to determine site snapshot resolution. Ensure capture is at least 800×800.');
  } else {
    details.width = size.width;
    details.height = size.height;

    if (size.width < minWidth || size.height < minHeight) {
      errors.push({
        code: 'LOW_RESOLUTION',
        message: `Site snapshot resolution ${size.width}×${size.height}px is below ${minWidth}×${minHeight}px minimum.`
      });
    }
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('Site snapshot validation failed', {
      context,
      errors,
      warnings,
      capturedAt,
      size
    });
  }

  return {
    valid,
    errors,
    warnings,
    details
  };
}

export default {
  validateSiteSnapshot
};
