/**
 * SVG-to-PNG Renderer (Client-Side)
 *
 * Canvas-based converter for rendering canonical geometry pack SVGs
 * to high-resolution PNG data URLs. Used for:
 * - Client-side preview before server composition
 * - Debug output for geometry masks
 * - Fallback when compose endpoint is unavailable
 *
 * Primary rendering path is server-side Sharp (in /api/a1/compose).
 * This module is a client-side complement.
 *
 * @module services/svgToPngRenderer
 */

/**
 * Render an SVG string to a PNG data URL via Canvas.
 *
 * @param {string} svgString - SVG markup from Projections2D
 * @param {Object} [options]
 * @param {number} [options.width=1200]  - Output width in pixels
 * @param {number} [options.height=900]  - Output height in pixels
 * @param {number} [options.scale=2]     - DPI scale factor (2 = retina)
 * @param {string} [options.background='#ffffff'] - Background fill color
 * @returns {Promise<string>} PNG as data URL (data:image/png;base64,...)
 */
export async function svgToPng(svgString, options = {}) {
  const {
    width = 1200,
    height = 900,
    scale = 2,
    background = "#ffffff",
  } = options;

  if (!svgString || typeof svgString !== "string") {
    throw new Error("svgToPng: svgString is required");
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");

    // Fill background
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Scale for retina
    ctx.scale(scale, scale);

    const img = new Image();
    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(new Error(`SVG canvas draw failed: ${err.message}`));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image load failed"));
    };

    img.src = url;
  });
}

/**
 * Batch convert all panel SVGs in a canonical pack to PNG data URLs.
 *
 * @param {Object} canonicalPack - Pack from buildCanonicalPack()
 * @param {Object} [options] - Rendering options (passed to svgToPng)
 * @returns {Promise<Object>} Map of panelType → PNG data URL
 */
export async function renderPackToPng(canonicalPack, options = {}) {
  if (!canonicalPack?.panels) return {};

  const results = {};
  const entries = Object.entries(canonicalPack.panels);

  for (const [panelType, panelData] of entries) {
    if (panelData?.svgString) {
      try {
        results[panelType] = await svgToPng(panelData.svgString, options);
      } catch (err) {
        console.warn(
          `[svgToPngRenderer] Failed for ${panelType}:`,
          err.message,
        );
      }
    }
  }

  return results;
}

export default { svgToPng, renderPackToPng };
