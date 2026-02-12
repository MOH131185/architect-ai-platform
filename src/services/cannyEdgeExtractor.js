/**
 * Canny Edge Extractor
 *
 * Converts canonical geometry SVG drawings (from Projections2D.js)
 * into Canny-edge-style images (white lines on black background)
 * for ControlNet conditioning.
 *
 * Since canonical SVGs are already clean line drawings, no actual
 * Canny edge detection (OpenCV) is needed — we just invert colors:
 * remove fills, set strokes to white, set background to black.
 *
 * Works in two contexts:
 * - Client-side: Canvas-based rendering
 * - Server-side: Sharp-based rendering (Vercel/server.cjs)
 *
 * @module services/cannyEdgeExtractor
 */

import logger from "../utils/logger.js";

/**
 * Convert SVG to Canny edge image (white lines on black background).
 *
 * @param {string} svgString - SVG from Projections2D or other geometry generators
 * @param {Object} [options]
 * @param {number} [options.width=1024] - Output width in pixels
 * @param {number} [options.height=1024] - Output height in pixels
 * @param {number} [options.strokeWidth=2] - Line width for edge strokes
 * @returns {Promise<string>} PNG as data URL (data:image/png;base64,...)
 */
export async function extractCannyEdges(svgString, options = {}) {
  const { width = 1024, height = 1024, strokeWidth = 2 } = options;

  if (!svgString || typeof svgString !== "string") {
    throw new Error("extractCannyEdges requires an SVG string");
  }

  // Transform SVG for Canny edge style
  let cannySvg = svgString;

  // Remove text elements (ControlNet should only see structural edges)
  cannySvg = cannySvg.replace(/<text[^>]*>[\s\S]*?<\/text>/g, "");
  cannySvg = cannySvg.replace(/<tspan[^>]*>[\s\S]*?<\/tspan>/g, "");

  // Remove dimension annotation groups
  cannySvg = cannySvg.replace(
    /<g[^>]*class="[^"]*dimensions[^"]*"[^>]*>[\s\S]*?<\/g>/g,
    "",
  );

  // Remove all fill colors except 'none' (set to none)
  cannySvg = cannySvg.replace(/fill="(?!none)[^"]*"/g, 'fill="none"');
  cannySvg = cannySvg.replace(/fill:\s*(?!none)[^;}"]+/g, "fill: none");

  // Set all strokes to white
  cannySvg = cannySvg.replace(/stroke="[^"]*"/g, 'stroke="#ffffff"');
  cannySvg = cannySvg.replace(/stroke:\s*[^;}"]+/g, "stroke: #ffffff");

  // Normalize stroke widths
  cannySvg = cannySvg.replace(
    /stroke-width="[^"]*"/g,
    `stroke-width="${strokeWidth}"`,
  );
  cannySvg = cannySvg.replace(
    /stroke-width:\s*[^;}"]+/g,
    `stroke-width: ${strokeWidth}`,
  );

  // Inject black background rect after <svg> opening tag
  cannySvg = cannySvg.replace(
    /<svg([^>]*)>/,
    `<svg$1><rect width="100%" height="100%" fill="#000000"/>`,
  );

  // Update viewBox/dimensions for consistent output
  cannySvg = cannySvg.replace(/width="[^"]*"/, `width="${width}"`);
  cannySvg = cannySvg.replace(/height="[^"]*"/, `height="${height}"`);

  logger.info(
    `[CannyEdge] Extracting edges at ${width}x${height} (stroke: ${strokeWidth}px)`,
  );

  // Choose rendering path based on environment
  const isServer =
    typeof document === "undefined" || typeof window === "undefined";

  if (isServer) {
    return renderWithSharp(cannySvg, width, height);
  }
  return renderWithCanvas(cannySvg, width, height);
}

/**
 * Server-side rendering using Sharp.
 * @private
 */
async function renderWithSharp(svg, width, height) {
  try {
    // Use webpackIgnore comment to prevent webpack from bundling sharp (Node-only)
    const sharp = (await import(/* webpackIgnore: true */ "sharp")).default;
    const buffer = await sharp(Buffer.from(svg))
      .resize(width, height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0 },
      })
      .png()
      .toBuffer();
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (err) {
    throw new Error(`Canny edge Sharp rendering failed: ${err.message}`);
  }
}

/**
 * Client-side rendering using Canvas API.
 * @private
 */
function renderWithCanvas(svg, width, height) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error("Canny edge Canvas rendering failed: " + err));
    };
    img.src = url;
  });
}

export default { extractCannyEdges };
