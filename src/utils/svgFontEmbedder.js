/**
 * SVG Font Embedder
 *
 * Injects a base64-encoded @font-face into SVG strings so text renders
 * correctly in Sharp/librsvg and other sandboxed rasterizers.
 *
 * The previous implementation depended entirely on a runtime Google Fonts
 * fetch and browser-only `btoa`. That was brittle in Node/Sharp contexts and
 * could silently fall back to missing glyphs. This version prefers local
 * system fonts when running under Node, then falls back to remote Inter.
 *
 * @module utils/svgFontEmbedder
 */

const INTER_REGULAR_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2";
const INTER_BOLD_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7.woff2";

const REGULAR_FONT_CANDIDATES = [
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/var/task/node_modules/@vercel/fonts/DejaVuSans.ttf",
];

const BOLD_FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/segoeuib.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
];

let cachedRegular = null;
let cachedBold = null;
let fontLoadingPromise = null;

function isNodeRuntime() {
  return Boolean(
    typeof process !== "undefined" &&
    process?.versions &&
    process.versions.node,
  );
}

function toBase64(bytes) {
  if (!bytes) {
    return null;
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  throw new Error("No base64 encoder available");
}

async function loadLocalFontAsBase64(paths, descriptor) {
  if (!isNodeRuntime()) {
    return null;
  }

  try {
    const fsModuleSpecifier = "node:fs/promises";
    const { readFile } = await import(
      /* webpackIgnore: true */ fsModuleSpecifier
    );

    for (const fontPath of paths) {
      try {
        const fontBuffer = await readFile(fontPath);
        if (fontBuffer?.length) {
          return {
            base64: fontBuffer.toString("base64"),
            mime: "font/ttf",
            format: "truetype",
            source: fontPath,
            descriptor,
          };
        }
      } catch {
        // Try next candidate path.
      }
    }
  } catch {
    // Ignore Node font loading failures and fall back to remote fetch.
  }

  return null;
}

async function fetchFontAsBase64(url, descriptor) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Font fetch failed: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return {
    base64: toBase64(new Uint8Array(buffer)),
    mime: "font/woff2",
    format: "woff2",
    source: url,
    descriptor,
  };
}

function normalizeTypography(svgString) {
  if (!svgString || typeof svgString !== "string") {
    return svgString;
  }

  return svgString
    .replace(/\u2026/g, "...")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00D7/g, "x")
    .replace(/\u00B2/g, "2")
    .replace(/\u00B0C/g, " C")
    .replace(/\u2713/g, "OK")
    .replace(/\u2717/g, "NO")
    .replace(/\u00A0/g, " ");
}

/**
 * Load and cache both font weights. Only resolves once per process/page.
 */
async function ensureFontsLoaded() {
  if (fontLoadingPromise) return fontLoadingPromise;
  fontLoadingPromise = (async () => {
    try {
      const [regular, bold] = await Promise.all([
        loadLocalFontAsBase64(REGULAR_FONT_CANDIDATES, "regular").then(
          (font) => font || fetchFontAsBase64(INTER_REGULAR_URL, "regular"),
        ),
        loadLocalFontAsBase64(BOLD_FONT_CANDIDATES, "bold").then(
          (font) => font || fetchFontAsBase64(INTER_BOLD_URL, "bold"),
        ),
      ]);
      cachedRegular = regular;
      cachedBold = bold;
    } catch (err) {
      console.warn("[svgFontEmbedder] Failed to load fonts:", err.message);
    }
  })();
  return fontLoadingPromise;
}

function buildEmbeddedFaceRule(font, weight) {
  if (!font?.base64) {
    return "";
  }
  return `
    @font-face {
      font-family: 'EmbeddedSans';
      src: url(data:${font.mime};base64,${font.base64}) format('${font.format}');
      font-weight: ${weight};
      font-style: normal;
    }`;
}

/**
 * Build the <defs><style> block with embedded @font-face rules.
 */
function buildFontDefs() {
  if (!cachedRegular?.base64) {
    return "";
  }

  let css = buildEmbeddedFaceRule(cachedRegular, "normal");
  if (cachedBold?.base64) {
    css += buildEmbeddedFaceRule(cachedBold, "bold");
  }
  css += `
    text, tspan { font-family: 'EmbeddedSans', 'Segoe UI', Arial, Helvetica, sans-serif !important; }`;
  return `<defs><style type="text/css">${css}</style></defs>`;
}

/**
 * Replace all font-family references in an SVG string with EmbeddedSans fallback.
 */
function replaceFontFamilies(svgString) {
  let result = normalizeTypography(svgString);

  result = result.replace(/font-family="([^"]*)"/g, (match, families) => {
    if (families.includes("EmbeddedSans") || families.includes("monospace")) {
      return match;
    }
    return 'font-family="EmbeddedSans, Segoe UI, Arial, Helvetica, sans-serif"';
  });

  result = result.replace(/font-family:\s*([^;}"]+)/g, (match, families) => {
    if (families.includes("EmbeddedSans") || families.includes("monospace")) {
      return match;
    }
    return "font-family: EmbeddedSans, 'Segoe UI', Arial, Helvetica, sans-serif";
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

  const normalizedSvg = replaceFontFamilies(svgString);

  // If fonts couldn't be loaded, still return typography-normalized SVG.
  if (!cachedRegular?.base64) return normalizedSvg;

  const fontDefs = buildFontDefs();

  // Insert <defs> after the <svg ...> opening tag
  const result = normalizedSvg.replace(/<svg([^>]*)>/, `<svg$1>${fontDefs}`);

  return result;
}

/**
 * Synchronous version for use when fonts are already cached.
 * Call ensureFontsLoaded() once at startup, then use this for speed.
 */
export function embedFontInSVGSync(svgString) {
  if (!svgString || typeof svgString !== "string") return svgString;
  const normalizedSvg = replaceFontFamilies(svgString);
  if (!cachedRegular?.base64) return normalizedSvg;

  const fontDefs = buildFontDefs();
  const result = normalizedSvg.replace(/<svg([^>]*)>/, `<svg$1>${fontDefs}`);
  return result;
}

/**
 * Pre-load fonts. Call once at app/server startup.
 */
export { ensureFontsLoaded };

export default { embedFontInSVG, embedFontInSVGSync, ensureFontsLoaded };
