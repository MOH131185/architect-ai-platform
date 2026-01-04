/**
 * Utility functions for handling image URLs and preventing unnecessary proxying
 */

/**
 * Checks if a URL is a data URL or blob URL (even if URL-encoded)
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is a data or blob URL
 */
export function isDataOrBlobUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check for direct data/blob URLs
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return true;
  }

  // Check for URL-encoded data URLs
  try {
    if (url.includes('%3A') || url.includes('%2F')) {
      const decoded = decodeURIComponent(url);
      if (decoded.startsWith('data:') || decoded.startsWith('blob:')) {
        return true;
      }
    }
  } catch (e) {
    // If decoding fails, it's not a URL-encoded data URL
  }

  // Check if URL is already proxied and contains a data URL
  if (url.includes('/api/proxy') && url.includes('url=')) {
    try {
      const urlMatch = url.match(/[?&]url=([^&]+)/);
      if (urlMatch) {
        const decoded = decodeURIComponent(urlMatch[1]);
        if (decoded.startsWith('data:') || decoded.startsWith('blob:')) {
          return true;
        }
      }
    } catch (e) {
      // Ignore extraction errors
    }
  }

  return false;
}

/**
 * Extracts a data URL from a proxied URL if present
 * @param {string} url - The URL to check
 * @returns {string|null} The extracted data URL, or null if not found
 */
export function extractDataUrlFromProxy(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // If it's already a direct data URL, return it
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  // Check if URL is proxied and contains a data URL (check this FIRST)
  if (url.includes('/api/proxy') && url.includes('url=')) {
    try {
      // Try to extract the URL parameter
      const urlMatch = url.match(/[?&]url=([^&]+)/);
      if (urlMatch) {
        let decoded = urlMatch[1];
        // May need multiple decodes if double-encoded
        try {
          decoded = decodeURIComponent(decoded);
          // Try one more decode in case it was double-encoded
          if (decoded.includes('%3A') || decoded.includes('%2F')) {
            decoded = decodeURIComponent(decoded);
          }
        } catch (e) {
          // If decoding fails, try the original
        }

        if (
          decoded.startsWith('data:image/') ||
          decoded.startsWith('data:') ||
          decoded.startsWith('blob:')
        ) {
          return decoded;
        }
      }
    } catch (e) {
      // Ignore extraction errors
    }
  }

  // Try to decode entire URL if URL-encoded
  try {
    if (url.includes('%3A') || url.includes('%2F')) {
      let decoded = decodeURIComponent(url);
      // Try one more decode in case it was double-encoded
      if (decoded.includes('%3A') || decoded.includes('%2F')) {
        decoded = decodeURIComponent(decoded);
      }
      if (
        decoded.startsWith('data:image/') ||
        decoded.startsWith('data:') ||
        decoded.startsWith('blob:')
      ) {
        return decoded;
      }
    }
  } catch (e) {
    // Ignore decoding errors
  }

  return null;
}

/**
 * Determines if a URL should be proxied
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL should be proxied
 */
export function shouldProxyUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Never proxy data URLs or blob URLs
  if (isDataOrBlobUrl(url)) {
    return false;
  }

  // Don't proxy if already proxied
  if (url.includes('/api/proxy-image') || url.includes('/api/proxy/image')) {
    return false;
  }

  // Don't proxy same-origin URLs
  if (typeof window !== 'undefined') {
    try {
      const urlObj = new URL(url, window.location.origin);
      if (urlObj.origin === window.location.origin) {
        return false;
      }
    } catch (e) {
      // If URL parsing fails, might be a relative URL - don't proxy
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return false;
      }
    }
  }

  // Proxy remote URLs that need CORS bypass
  return true;
}

/**
 * Returns a proxied URL for CORS bypass if the URL is from a known problematic domain.
 * Uses /api/proxy-image endpoint to fetch images server-side.
 *
 * @param {string} url - The original image URL
 * @param {Object} options - Options
 * @param {boolean} [options.forceProxy=false] - Force proxying even for same-origin URLs
 * @returns {string} Proxied URL if needed, or original URL
 */
export function getProxiedUrl(url, options = {}) {
  const { forceProxy = false } = options;

  if (!url || typeof url !== 'string') {
    return url;
  }

  // Don't proxy data URLs or blob URLs
  if (isDataOrBlobUrl(url)) {
    return url;
  }

  // Don't double-proxy
  if (url.includes('/api/proxy-image') || url.includes('/api/proxy/image')) {
    return url;
  }

  // Check if URL needs proxying
  if (!forceProxy && !shouldProxyUrl(url)) {
    return url;
  }

  // Known domains that need CORS proxying
  const corsProblematicDomains = [
    'api.together.ai',
    'api.together.xyz',
    'together.ai',
    'together.xyz',
    'replicate.delivery',
    'pbxt.replicate.delivery',
  ];

  try {
    const urlObj = new URL(url);
    const needsProxy =
      forceProxy ||
      corsProblematicDomains.some(
        (domain) => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );

    if (needsProxy) {
      // Return proxied URL
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      return `${baseUrl}/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Invalid URL, return as-is
  }

  return url;
}

/**
 * Loads an image via the proxy endpoint.
 * Useful for browser environments that need CORS bypass.
 *
 * @param {string} url - Image URL to load
 * @returns {Promise<Uint8Array|null>} Image data or null on failure
 */
export async function loadImageViaProxy(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Don't proxy data URLs
  if (isDataOrBlobUrl(url)) {
    return null;
  }

  try {
    const proxiedUrl = getProxiedUrl(url, { forceProxy: true });
    const response = await fetch(proxiedUrl);

    if (!response.ok) {
      console.warn(`[imageUrlUtils] Proxy fetch failed: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.warn(`[imageUrlUtils] Proxy load failed:`, error.message);
    return null;
  }
}

// ============================================================================
// CACHE-BUSTING UTILITIES
// ============================================================================
// Adds runId querystring to image URLs to prevent stale cache display.
// This ensures browser requests fresh images for each unique run.

/**
 * Add runId querystring to an image URL for cache busting.
 * This prevents browser from reusing cached images from previous runs.
 *
 * @param {string} url - Image URL (http:// or data:)
 * @param {string} runId - Unique run identifier
 * @returns {string} URL with runId querystring
 */
export function appendRunIdToUrl(url, runId) {
  if (!url) {return url;}

  // Don't modify data URLs (already unique per generation)
  if (url.startsWith('data:')) {
    return url;
  }

  // Don't modify blob URLs (already unique)
  if (url.startsWith('blob:')) {
    return url;
  }

  // Parse URL and add runId
  try {
    const baseUrl =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const urlObj = new URL(url, baseUrl);
    if (runId) {
      urlObj.searchParams.set('runId', runId);
    }
    // Also add timestamp for extra cache busting
    urlObj.searchParams.set('_t', Date.now().toString(36));
    return urlObj.toString();
  } catch {
    // If URL parsing fails, try simple string concatenation
    const separator = url.includes('?') ? '&' : '?';
    const params = [];
    if (runId) {
      params.push(`runId=${encodeURIComponent(runId)}`);
    }
    params.push(`_t=${Date.now().toString(36)}`);
    return `${url}${separator}${params.join('&')}`;
  }
}

/**
 * Add cache-busting parameters to a panel's image URL.
 * Uses panel's runId, designFingerprint, or seed for uniqueness.
 *
 * @param {Object} panel - Panel object with imageUrl and optional runId/designFingerprint/seed
 * @returns {string} Cache-busted image URL
 */
export function getCacheBustedPanelUrl(panel) {
  if (!panel?.imageUrl && !panel?.url) {return null;}

  const imageUrl = panel.imageUrl || panel.url;
  const runId =
    panel.runId ||
    panel.meta?.runId ||
    panel.designFingerprint ||
    panel._designFingerprint ||
    panel.seed?.toString();

  return appendRunIdToUrl(imageUrl, runId);
}

/**
 * Process all panel URLs in a result object to add cache-busting.
 *
 * @param {Object} result - Generation result with panels
 * @param {string} runId - Run identifier to use for all panels
 * @returns {Object} Result with cache-busted URLs
 */
export function cacheBustAllPanelUrls(result, runId) {
  if (!result) {return result;}

  const processedResult = { ...result };
  const effectiveRunId =
    runId || result.designFingerprint || result.designId || result.runId || Date.now().toString(36);

  // Process panels array
  if (Array.isArray(result.panels)) {
    processedResult.panels = result.panels.map((panel) => ({
      ...panel,
      imageUrl: appendRunIdToUrl(panel.imageUrl, effectiveRunId),
      url: appendRunIdToUrl(panel.url, effectiveRunId),
    }));
  }

  // Process panelMap object
  if (result.panelMap && typeof result.panelMap === 'object') {
    processedResult.panelMap = {};
    for (const [key, panel] of Object.entries(result.panelMap)) {
      processedResult.panelMap[key] = {
        ...panel,
        imageUrl: appendRunIdToUrl(panel.imageUrl, effectiveRunId),
        url: appendRunIdToUrl(panel.url, effectiveRunId),
      };
    }
  }

  // Process composedSheetUrl
  if (result.composedSheetUrl) {
    processedResult.composedSheetUrl = appendRunIdToUrl(result.composedSheetUrl, effectiveRunId);
  }

  // Process a1Sheet
  if (result.a1Sheet) {
    processedResult.a1Sheet = {
      ...result.a1Sheet,
      url: appendRunIdToUrl(result.a1Sheet.url, effectiveRunId),
    };
  }

  return processedResult;
}
