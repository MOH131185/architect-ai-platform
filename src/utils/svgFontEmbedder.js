/**
 * SVG Font Embedder
 *
 * Injects a base64-encoded @font-face into SVG strings so that text renders
 * correctly in sandboxed contexts (Canvas Image, Sharp/librsvg on Vercel).
 *
 * Uses Inter (Google Fonts) fetched once and cached in memory.
 * Falls back gracefully if the font cannot be loaded.
 *
 * @module utils/svgFontEmbedder
 */

// Google Fonts CDN URL for Inter (Latin subset, woff2, variable font v20)
const INTER_REGULAR_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2";
// Inter Bold — same variable font file covers all weights in v20
const INTER_BOLD_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2";

let cachedRegular = null;
let cachedBold = null;
let fetchAttempted = false;

/**
 * Fetch a font from URL and return as base64 string.
 * Works in both browser (fetch + arrayBuffer) and Node.js (fetch or https).
 */
async function fetchFontAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Convert to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Load and cache both font weights. Only fetches once per process/page.
 */
async function ensureFontsLoaded() {
  if (fetchAttempted) return;
  fetchAttempted = true;
  try {
    const [regular, bold] = await Promise.all([
      fetchFontAsBase64(INTER_REGULAR_URL),
      fetchFontAsBase64(INTER_BOLD_URL),
    ]);
    cachedRegular = regular;
    cachedBold = bold;
  } catch (err) {
    console.warn("[svgFontEmbedder] Failed to load fonts:", err.message);
  }
}

/**
 * Build the <defs><style> block with embedded @font-face rules.
 */
function buildFontDefs() {
  if (!cachedRegular) return "";
  let css = `
    @font-face {
      font-family: 'EmbeddedSans';
      src: url(data:font/woff2;base64,${cachedRegular}) format('woff2');
      font-weight: normal;
      font-style: normal;
    }`;
  if (cachedBold) {
    css += `
    @font-face {
      font-family: 'EmbeddedSans';
      src: url(data:font/woff2;base64,${cachedBold}) format('woff2');
      font-weight: bold;
      font-style: normal;
    }`;
  }
  css += `
    text, tspan { font-family: 'EmbeddedSans', Arial, Helvetica, sans-serif !important; }`;
  return `<defs><style type="text/css">${css}</style></defs>`;
}

/**
 * Replace all font-family references in an SVG string with EmbeddedSans fallback.
 */
function replaceFontFamilies(svgString) {
  // Replace font-family="..." attribute values
  let result = svgString.replace(
    /font-family="([^"]*)"/g,
    (match, families) => {
      if (families.includes("EmbeddedSans")) return match;
      if (families.includes("monospace")) return match; // preserve monospace
      return `font-family="'EmbeddedSans', ${families}"`;
    },
  );
  // Replace font-family: '...' or font-family: ... in CSS
  result = result.replace(/font-family:\s*([^;}"]+)/g, (match, families) => {
    if (families.includes("EmbeddedSans")) return match;
    if (families.includes("monospace")) return match;
    return `font-family: 'EmbeddedSans', ${families.trim()}`;
  });
  return result;
}

/**
 * Embed a web font into an SVG string for sandboxed rendering contexts.
 *
 * @param {string} svgString - Raw SVG markup
 * @returns {Promise<string>} SVG with embedded @font-face and updated font-family references
 */
export async function embedFontInSVG(svgString) {
  if (!svgString || typeof svgString !== "string") return svgString;

  await ensureFontsLoaded();

  // If fonts couldn't be loaded, still try to return the SVG as-is
  if (!cachedRegular) return svgString;

  const fontDefs = buildFontDefs();

  // Insert <defs> after the <svg ...> opening tag
  let result = svgString.replace(/<svg([^>]*)>/, `<svg$1>${fontDefs}`);

  // Replace font-family references throughout
  result = replaceFontFamilies(result);

  return result;
}

/**
 * Synchronous version for use when fonts are already cached.
 * Call ensureFontsLoaded() once at startup, then use this for speed.
 */
export function embedFontInSVGSync(svgString) {
  if (!svgString || typeof svgString !== "string") return svgString;
  if (!cachedRegular) return svgString;

  const fontDefs = buildFontDefs();
  let result = svgString.replace(/<svg([^>]*)>/, `<svg$1>${fontDefs}`);
  result = replaceFontFamilies(result);
  return result;
}

/**
 * Pre-load fonts. Call once at app/server startup.
 */
export { ensureFontsLoaded };

export default { embedFontInSVG, embedFontInSVGSync, ensureFontsLoaded };
