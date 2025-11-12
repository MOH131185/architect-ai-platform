/**
 * A1 Sheet Overlay Utilities
 *
 * Composites additional insets (e.g., Google Maps site snapshot) onto the
 * generated A1 sheet image so the final deliverable visibly includes the site plan.
 *
 * This runs in the browser, uses the API proxy to fetch cross‑origin images,
 * and returns a data URL that replaces the base image URL.
 */

const API_BASE_URL = process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';

/**
 * Load an image URL (including cross‑origin) into a HTMLImageElement.
 * Uses the proxy when needed to avoid CORS tainting the canvas.
 * @param {string} url - Remote URL or data URL
 * @returns {Promise<HTMLImageElement>} loaded image element
 */
async function loadImage(url) {
  return new Promise(async (resolve, reject) => {
    try {
      let source = url;

      // If not a data URL, fetch via proxy to avoid CORS
      if (!url.startsWith('data:')) {
        const proxyUrl = `${API_BASE_URL}/api/proxy/image?url=${encodeURIComponent(url)}`;
        const resp = await fetch(proxyUrl);
        if (!resp.ok) {
          return reject(new Error(`Failed to fetch image via proxy (${resp.status})`));
        }
        const blob = await resp.blob();
        source = URL.createObjectURL(blob);
      }

      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error('Failed to load image'));
      img.src = source;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Overlay a site map snapshot into the A1 sheet image.
 *
 * Placement defaults:
 * - portrait: top‑left inset (~34% width, ~16% height)
 * - landscape: top‑left inset (~28% width, ~22% height)
 *
 * @param {string} baseImageUrl - A1 sheet image URL (Together CDN or data URL)
 * @param {string} siteMapDataUrl - Data URL from Google Static Maps service
 * @param {Object} options - { orientation: 'portrait'|'landscape', label?: string }
 * @returns {Promise<string>} data URL (image/png) of composited sheet
 */
export async function overlaySiteMapOnA1Sheet(baseImageUrl, siteMapDataUrl, options = {}) {
  const { orientation = 'portrait', label = 'SITE PLAN' } = options;

  if (!baseImageUrl || !siteMapDataUrl) {
    throw new Error('overlaySiteMapOnA1Sheet requires baseImageUrl and siteMapDataUrl');
  }

  // Load images
  const [baseImg, mapImg] = await Promise.all([
    loadImage(baseImageUrl),
    loadImage(siteMapDataUrl)
  ]);

  // Create canvas at base image size
  const canvas = document.createElement('canvas');
  canvas.width = baseImg.naturalWidth || baseImg.width;
  canvas.height = baseImg.naturalHeight || baseImg.height;
  const ctx = canvas.getContext('2d');

  // Draw base image
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

  // Compute inset placement
  const isPortrait = orientation === 'portrait';
  const insetWidth = Math.round((isPortrait ? 0.34 : 0.28) * canvas.width);
  const insetHeight = Math.round((isPortrait ? 0.16 : 0.22) * canvas.height);
  const insetX = Math.round(0.025 * canvas.width); // small left margin
  const insetY = Math.round(0.04 * canvas.height); // small top margin

  // Frame background (white with border)
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = Math.max(2, Math.floor(canvas.width / 800));
  ctx.fillRect(insetX, insetY, insetWidth, insetHeight);
  ctx.strokeRect(insetX, insetY, insetWidth, insetHeight);
  ctx.restore();

  // Draw map image inside frame with small padding
  const pad = Math.max(4, Math.floor(insetWidth * 0.015));
  ctx.drawImage(
    mapImg,
    insetX + pad,
    insetY + pad + 12, // leave room for label
    insetWidth - pad * 2,
    insetHeight - pad * 2 - 16
  );

  // Label text
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.max(10, Math.floor(insetWidth / 22))}px Arial`;
  ctx.fillText(label, insetX + pad, insetY + pad + 10);
  ctx.restore();

  // Return composited PNG data URL
  return canvas.toDataURL('image/png');
}

export default {
  overlaySiteMapOnA1Sheet
};

