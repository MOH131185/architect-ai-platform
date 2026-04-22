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

export const EMBEDDED_FONT_FAMILY = "ArchiAISans";
export const EMBEDDED_FONT_STACK =
  "'ArchiAISans', 'DejaVu Sans', 'Segoe UI', Arial, Helvetica, sans-serif";

const LOCAL_REGULAR_FONT_FILENAMES = [
  "public/fonts/DejaVuSans.ttf",
  "public/fonts/DejaVuSans-Regular.ttf",
  "public/fonts/NotoSans-Regular.ttf",
];

const LOCAL_BOLD_FONT_FILENAMES = [
  "public/fonts/DejaVuSans-Bold.ttf",
  "public/fonts/NotoSans-Bold.ttf",
];

const SYSTEM_REGULAR_FONT_CANDIDATES = [
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/var/task/node_modules/@vercel/fonts/DejaVuSans.ttf",
];

const SYSTEM_BOLD_FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/segoeuib.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
];

let fontLoadPromise = null;
let resolvedFonts = null; // Set once the promise resolves; used by sync API

function getNodeBuiltinModule(moduleName) {
  if (!isNodeRuntime()) {
    return null;
  }

  try {
    if (typeof process?.getBuiltinModule === "function") {
      return process.getBuiltinModule(moduleName);
    }
  } catch {
    return null;
  }

  return null;
}

function isNodeRuntime() {
  return Boolean(
    typeof process !== "undefined" &&
    process?.versions &&
    process.versions.node,
  );
}

function resolveLocalFontCandidates(fontFilenames = []) {
  if (!isNodeRuntime()) {
    return [];
  }

  const cwd = typeof process?.cwd === "function" ? process.cwd() : "";
  const lambdaTaskRoot = process?.env?.LAMBDA_TASK_ROOT || "/var/task";
  const roots = [cwd, lambdaTaskRoot, "/var/task", "."].filter(Boolean);

  const candidates = [];
  for (const root of roots) {
    for (const filename of fontFilenames) {
      const normalizedRoot = String(root).replace(/[\\/]+$/, "");
      const normalizedFile = String(filename).replace(/^[\\/]+/, "");
      candidates.push(
        `${normalizedRoot}/${normalizedFile}`.replace(/\\/g, "/"),
      );
    }
  }
  return [...new Set(candidates)];
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
  const isTtf = url.endsWith(".ttf");
  return {
    base64: toBase64(new Uint8Array(buffer)),
    mime: isTtf ? "font/ttf" : "font/woff2",
    format: isTtf ? "truetype" : "woff2",
    source: url,
    descriptor,
  };
}

async function loadFontDescriptor({
  descriptor,
  localCandidates = [],
  fallbackUrl = null,
} = {}) {
  try {
    const localFont = await loadLocalFontAsBase64(localCandidates, descriptor);
    if (localFont?.base64) {
      return localFont;
    }
    if (!fallbackUrl) {
      return null;
    }
    return await fetchFontAsBase64(fallbackUrl, descriptor);
  } catch (error) {
    console.warn(
      `[svgFontEmbedder] Failed to load ${descriptor} font: ${error.message}`,
    );
    return null;
  }
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

function ensureRootFontFamily(svgString) {
  if (!svgString || typeof svgString !== "string") {
    return svgString;
  }

  const rootFontFamily = `font-family="${EMBEDDED_FONT_STACK}"`;
  const rootStyle = `style="font-family: ${EMBEDDED_FONT_STACK};"`;

  return svgString.replace(/<svg([^>]*)>/i, (match, attrs = "") => {
    if (/font-family\s*=/.test(attrs)) {
      return match;
    }
    if (/style\s*=/.test(attrs)) {
      return `<svg${attrs.replace(
        /style=(["'])(.*?)\1/i,
        (styleMatch, quote, styleValue) =>
          `style=${quote}font-family: ${EMBEDDED_FONT_STACK}; ${styleValue}${quote}`,
      )}>`;
    }
    return `<svg${attrs} ${rootFontFamily} ${rootStyle}>`;
  });
}

/**
 * Load both font weights. Uses a promise singleton so the first caller
 * creates the fetch and all subsequent callers await the same promise.
 * No race condition: concurrent callers share one in-flight request.
 *
 * @returns {Promise<{regular: object|null, bold: object|null}>}
 */
async function ensureFontsLoaded() {
  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      const [regular, bold] = await Promise.all([
        loadFontDescriptor({
          descriptor: "regular",
          localCandidates: [
            ...resolveLocalFontCandidates(LOCAL_REGULAR_FONT_FILENAMES),
            ...SYSTEM_REGULAR_FONT_CANDIDATES,
          ],
          fallbackUrl: INTER_REGULAR_URL,
        }),
        loadFontDescriptor({
          descriptor: "bold",
          localCandidates: [
            ...resolveLocalFontCandidates(LOCAL_BOLD_FONT_FILENAMES),
            ...SYSTEM_BOLD_FONT_CANDIDATES,
          ],
          fallbackUrl: INTER_BOLD_URL,
        }),
      ]);
      resolvedFonts = { regular, bold };
      return resolvedFonts;
    })();
  }
  return fontLoadPromise;
}

function buildEmbeddedFaceRule(font, weight) {
  if (!font?.base64) {
    return "";
  }
  return `
    @font-face {
      font-family: '${EMBEDDED_FONT_FAMILY}';
      src: url(data:${font.mime};base64,${font.base64}) format('${font.format}');
      font-weight: ${weight};
      font-style: normal;
      font-display: swap;
    }`;
}

/**
 * Build the <defs><style> block with embedded @font-face rules.
 */
function buildFontStyleBlock(regular, bold) {
  if (!regular?.base64) {
    return "";
  }

  let css = buildEmbeddedFaceRule(regular, "normal");
  if (bold?.base64) {
    css += buildEmbeddedFaceRule(bold, "bold");
  }
  css += `
    svg, text, tspan {
      font-family: ${EMBEDDED_FONT_STACK} !important;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }
    .font-regular { font-weight: 400; }
    .font-bold { font-weight: 700; }`;
  return `<style type="text/css">${css}</style>`;
}

/**
 * Replace all font-family references in an SVG string with EmbeddedSans fallback.
 */
function replaceFontFamilies(svgString) {
  let result = ensureRootFontFamily(normalizeTypography(svgString));

  result = result.replace(/font-family="([^"]*)"/g, (match, families) => {
    if (
      families.includes(EMBEDDED_FONT_FAMILY) ||
      families.includes("monospace")
    ) {
      return match;
    }
    return `font-family="${EMBEDDED_FONT_STACK}"`;
  });

  result = result.replace(/font-family:\s*([^;}"]+)/g, (match, families) => {
    if (
      families.includes(EMBEDDED_FONT_FAMILY) ||
      families.includes("monospace")
    ) {
      return match;
    }
    return `font-family: ${EMBEDDED_FONT_STACK}`;
  });

  return result;
}

function injectFontStyle(svgString, styleBlock) {
  if (!styleBlock) {
    return svgString;
  }
  if (
    svgString.includes("@font-face") &&
    svgString.includes(EMBEDDED_FONT_FAMILY)
  ) {
    return svgString;
  }
  if (/<defs[^>]*>/i.test(svgString)) {
    return svgString.replace(/<defs([^>]*)>/i, `<defs$1>${styleBlock}`);
  }
  return svgString.replace(
    /<svg([^>]*)>/i,
    `<svg$1><defs>${styleBlock}</defs>`,
  );
}

/**
 * Embed a web font into an SVG string for sandboxed rendering contexts.
 *
 * @param {string} svgString - Raw SVG markup
 * @returns {Promise<string>} SVG with embedded @font-face and updated font-family references
 */
export async function embedFontInSVG(svgString) {
  if (!svgString || typeof svgString !== "string") return svgString;

  const { regular, bold } = await ensureFontsLoaded();

  const normalizedSvg = replaceFontFamilies(svgString);

  // If fonts couldn't be loaded, still return typography-normalized SVG.
  if (!regular?.base64) return normalizedSvg;

  return injectFontStyle(normalizedSvg, buildFontStyleBlock(regular, bold));
}

/**
 * Synchronous version for use when fonts are already cached.
 * Call ensureFontsLoaded() once at startup and await it, then use this for speed.
 * If fonts haven't loaded yet, returns typography-normalized SVG without embedded fonts.
 */
export function embedFontInSVGSync(svgString) {
  if (!svgString || typeof svgString !== "string") return svgString;
  const normalizedSvg = replaceFontFamilies(svgString);

  if (!resolvedFonts?.regular?.base64) return normalizedSvg;

  return injectFontStyle(
    normalizedSvg,
    buildFontStyleBlock(resolvedFonts.regular, resolvedFonts.bold),
  );
}

export function getFontEmbeddingReadinessSync() {
  const regularCandidates = resolveLocalFontCandidates(
    LOCAL_REGULAR_FONT_FILENAMES,
  );
  const boldCandidates = resolveLocalFontCandidates(LOCAL_BOLD_FONT_FILENAMES);
  const fileExists = (candidate) => {
    if (!candidate || !isNodeRuntime()) {
      return false;
    }

    try {
      const fsModule = getNodeBuiltinModule("fs");
      if (!fsModule?.existsSync) {
        return false;
      }
      return fsModule.existsSync(candidate);
    } catch {
      return false;
    }
  };
  const bundledRegularAvailable = regularCandidates.some((candidate) =>
    fileExists(candidate),
  );
  const bundledBoldAvailable = boldCandidates.some((candidate) =>
    fileExists(candidate),
  );
  const regularReadyForEmbedding =
    bundledRegularAvailable || Boolean(resolvedFonts?.regular?.base64);
  const boldReadyForEmbedding =
    bundledBoldAvailable || Boolean(resolvedFonts?.bold?.base64);
  const fullEmbeddingReady = regularReadyForEmbedding && boldReadyForEmbedding;

  return {
    version: "phase8-svg-font-readiness-v1",
    family: EMBEDDED_FONT_FAMILY,
    stack: EMBEDDED_FONT_STACK,
    localRegularCandidates: regularCandidates,
    localBoldCandidates: boldCandidates,
    bundledRegularPreferred: regularCandidates[0] || null,
    bundledBoldPreferred: boldCandidates[0] || null,
    bundledRegularAvailable,
    bundledBoldAvailable,
    bundledFontsAvailable: bundledRegularAvailable && bundledBoldAvailable,
    fontsLoaded: Boolean(resolvedFonts?.regular?.base64),
    boldLoaded: Boolean(resolvedFonts?.bold?.base64),
    regularReadyForEmbedding,
    boldReadyForEmbedding,
    readyForEmbedding: regularReadyForEmbedding,
    fullEmbeddingReady,
    degradedEmbedding: regularReadyForEmbedding && !fullEmbeddingReady,
  };
}

/**
 * Pre-load fonts. Call once at app/server startup.
 */
export { ensureFontsLoaded };

export default {
  EMBEDDED_FONT_FAMILY,
  EMBEDDED_FONT_STACK,
  embedFontInSVG,
  embedFontInSVGSync,
  ensureFontsLoaded,
  getFontEmbeddingReadinessSync,
};
