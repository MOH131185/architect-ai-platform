const TEXT_ELEMENT_REGEX = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
const TSPAN_ELEMENT_REGEX = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi;
const POSITION_ATTR_PATTERN = /\s*\b(?:x|y|dx|dy)=(["'])(?:.*?)\1/gi;
const DEFAULT_REGULAR_FONT = "public/fonts/NotoSans-Regular.ttf";
const DEFAULT_BOLD_FONT = "public/fonts/NotoSans-Bold.ttf";

let opentypeModulePromise = null;
let parsedFontPromise = null;

function isNodeRuntime() {
  return Boolean(
    typeof process !== "undefined" &&
    process?.versions &&
    process.versions.node,
  );
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/");
}

function resolveFontPath(filename) {
  if (!isNodeRuntime()) {
    return filename;
  }
  const cwd = typeof process?.cwd === "function" ? process.cwd() : "";
  const lambdaRoot = process?.env?.LAMBDA_TASK_ROOT || "/var/task";
  const roots = [cwd, lambdaRoot, "/var/task", "."].filter(Boolean);
  const normalizedFile = String(filename || "").replace(/^[\\/]+/, "");
  return roots
    .map((root) => `${String(root).replace(/[\\/]+$/, "")}/${normalizedFile}`)
    .map(normalizePath);
}

async function readFirstAvailableFont(fontFilenames) {
  if (!isNodeRuntime()) {
    throw new Error("SVG text path conversion requires a Node runtime.");
  }

  const fsModuleSpecifier = "node:fs/promises";
  const { readFile } = await import(
    /* webpackIgnore: true */ fsModuleSpecifier
  );
  const candidates = fontFilenames.flatMap(resolveFontPath);
  const failures = [];
  for (const candidate of candidates) {
    try {
      const buffer = await readFile(candidate);
      if (buffer?.length) {
        return { buffer, source: candidate };
      }
    } catch (error) {
      failures.push(`${candidate}: ${error?.code || error?.message}`);
    }
  }
  throw new Error(`No bundled font could be loaded. ${failures.join("; ")}`);
}

async function loadOpenType() {
  if (!opentypeModulePromise) {
    opentypeModulePromise = import("opentype.js").then(
      (module) => module.default || module,
    );
  }
  return opentypeModulePromise;
}

async function loadBundledFonts() {
  if (!parsedFontPromise) {
    parsedFontPromise = (async () => {
      const [opentype, regularFont, boldFont] = await Promise.all([
        loadOpenType(),
        readFirstAvailableFont([DEFAULT_REGULAR_FONT]),
        readFirstAvailableFont([DEFAULT_BOLD_FONT]),
      ]);
      return {
        regular: opentype.parse(
          regularFont.buffer.buffer.slice(
            regularFont.buffer.byteOffset,
            regularFont.buffer.byteOffset + regularFont.buffer.byteLength,
          ),
        ),
        bold: opentype.parse(
          boldFont.buffer.buffer.slice(
            boldFont.buffer.byteOffset,
            boldFont.buffer.byteOffset + boldFont.buffer.byteLength,
          ),
        ),
        sources: {
          regular: regularFont.source,
          bold: boldFont.source,
        },
      };
    })();
  }
  return parsedFontPromise;
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXmlText(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(attrs = "", name) {
  const pattern = new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i");
  return attrs.match(pattern)?.[2] || null;
}

function getStyleValue(attrs = "", propertyName) {
  const style = getAttribute(attrs, "style");
  if (!style) return null;
  const pattern = new RegExp(`${propertyName}\\s*:\\s*([^;]+)`, "i");
  return style.match(pattern)?.[1]?.trim() || null;
}

function parseNumber(value, fallback = 0) {
  const match = String(value ?? "").match(/-?\d*\.?\d+/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFontSize(attrs = "", minimumFontSizePx = 0) {
  const raw =
    getAttribute(attrs, "font-size") || getStyleValue(attrs, "font-size");
  return Math.max(minimumFontSizePx || 0, parseNumber(raw, 12));
}

function resolveFontWeight(attrs = "") {
  return (
    getAttribute(attrs, "font-weight") ||
    getStyleValue(attrs, "font-weight") ||
    "400"
  );
}

function isBold(attrs = "") {
  const weight = String(resolveFontWeight(attrs)).trim().toLowerCase();
  return weight === "bold" || Number(weight) >= 600;
}

function resolveTextAnchor(attrs = "") {
  return (
    getAttribute(attrs, "text-anchor") ||
    getStyleValue(attrs, "text-anchor") ||
    "start"
  ).toLowerCase();
}

function resolveFill(attrs = "") {
  return getAttribute(attrs, "fill") || getStyleValue(attrs, "fill") || "#111";
}

function optionalAttribute(attrs = "", name) {
  const value = getAttribute(attrs, name);
  return value ? ` ${name}="${escapeXml(value)}"` : "";
}

function dataAttributes(attrs = "") {
  const out = [];
  attrs.replace(
    /\b(data-[\w:-]+)=(["'])(.*?)\2/gi,
    (_, name, _quote, value) => {
      out.push(` ${name}="${escapeXml(value)}"`);
      return "";
    },
  );
  return out.join("");
}

function countTextElements(svgString = "") {
  return (String(svgString || "").match(/<text\b/gi) || []).length;
}

function stripPositionAttributes(attrs = "") {
  return String(attrs || "")
    .replace(POSITION_ATTR_PATTERN, "")
    .trim();
}

function parseTspanChildren(innerText, parentAttrs) {
  const parentX = parseNumber(getAttribute(parentAttrs, "x"), 0);
  const parentY = parseNumber(getAttribute(parentAttrs, "y"), 0);
  const parentDx = parseNumber(getAttribute(parentAttrs, "dx"), 0);
  const parentDy = parseNumber(getAttribute(parentAttrs, "dy"), 0);
  let cursorX = parentX + parentDx;
  let cursorY = parentY + parentDy;

  const tspans = [];
  let foundExplicitPositioning = false;

  const matches = String(innerText || "").matchAll(TSPAN_ELEMENT_REGEX);
  for (const match of matches) {
    const tspanAttrs = match[1] || "";
    const tspanText = match[2] || "";
    const xRaw = getAttribute(tspanAttrs, "x");
    const yRaw = getAttribute(tspanAttrs, "y");
    const dxRaw = getAttribute(tspanAttrs, "dx");
    const dyRaw = getAttribute(tspanAttrs, "dy");
    const hasExplicit =
      xRaw !== null || yRaw !== null || dxRaw !== null || dyRaw !== null;
    if (hasExplicit) {
      foundExplicitPositioning = true;
    }

    if (xRaw !== null) {
      cursorX = parseNumber(xRaw, cursorX);
    } else if (dxRaw !== null) {
      cursorX += parseNumber(dxRaw, 0);
    }
    if (yRaw !== null) {
      cursorY = parseNumber(yRaw, cursorY);
    } else if (dyRaw !== null) {
      cursorY += parseNumber(dyRaw, 0);
    }

    tspans.push({
      attrs: tspanAttrs,
      innerText: tspanText,
      x: cursorX,
      y: cursorY,
    });
  }

  return { tspans, foundExplicitPositioning };
}

export function expandTspansToTextElements(svgString) {
  const source = String(svgString || "");
  if (!source.includes("<tspan")) {
    return source;
  }

  return source.replace(TEXT_ELEMENT_REGEX, (match, parentAttrs, innerText) => {
    const inner = String(innerText || "");
    if (!inner.includes("<tspan")) {
      return match;
    }
    const { tspans, foundExplicitPositioning } = parseTspanChildren(
      inner,
      parentAttrs,
    );
    if (!foundExplicitPositioning || tspans.length === 0) {
      return match;
    }

    const baseAttrs = stripPositionAttributes(parentAttrs);
    return tspans
      .map((tspan) => {
        const tspanStyleAttrs = stripPositionAttributes(tspan.attrs);
        const mergedAttrs = [baseAttrs, tspanStyleAttrs]
          .filter(Boolean)
          .join(" ");
        return `<text ${mergedAttrs} x="${tspan.x}" y="${tspan.y}">${tspan.innerText}</text>`;
      })
      .join("");
  });
}

function convertOneTextElement({
  attrs,
  rawText,
  fonts,
  minimumFontSizePx,
  decimalPlaces,
}) {
  const text = decodeXmlText(rawText);
  if (!text) {
    return null;
  }

  const fontSize = resolveFontSize(attrs, minimumFontSizePx);
  const x =
    parseNumber(getAttribute(attrs, "x"), 0) +
    parseNumber(getAttribute(attrs, "dx"), 0);
  const y =
    parseNumber(getAttribute(attrs, "y"), 0) +
    parseNumber(getAttribute(attrs, "dy"), 0);
  const font = isBold(attrs) ? fonts.bold : fonts.regular;
  const advance = font.getAdvanceWidth(text, fontSize, { kerning: true });
  const anchor = resolveTextAnchor(attrs);
  let drawX = x;
  if (anchor === "middle") {
    drawX -= advance / 2;
  } else if (anchor === "end") {
    drawX -= advance;
  }

  const path = font.getPath(text, drawX, y, fontSize, { kerning: true });
  const pathData = path.toPathData(decimalPlaces);
  if (!pathData) {
    return null;
  }

  const fill = resolveFill(attrs);
  const stroke = optionalAttribute(attrs, "stroke");
  const strokeWidth = optionalAttribute(attrs, "stroke-width");
  const strokeLinejoin = optionalAttribute(attrs, "stroke-linejoin");
  const paintOrder = optionalAttribute(attrs, "paint-order");
  const opacity = optionalAttribute(attrs, "opacity");
  const fillOpacity = optionalAttribute(attrs, "fill-opacity");
  const transform = optionalAttribute(attrs, "transform");
  const clipPath = optionalAttribute(attrs, "clip-path");
  const className = optionalAttribute(attrs, "class");
  const id = optionalAttribute(attrs, "id");
  const vectorEffect = optionalAttribute(attrs, "vector-effect");

  return `<path d="${escapeXml(pathData)}" fill="${escapeXml(fill)}"${stroke}${strokeWidth}${strokeLinejoin}${paintOrder}${opacity}${fillOpacity}${transform}${clipPath}${className}${id}${vectorEffect}${dataAttributes(attrs)} data-text-path="true" data-text-value="${escapeXml(text)}" data-font-size="${roundNumber(fontSize, 2)}"/>`;
}

function roundNumber(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

export async function convertSvgTextToPaths(svgString, options = {}) {
  const rawSource = String(svgString || "");
  const beforeTextElementCount = countTextElements(rawSource);
  if (!beforeTextElementCount) {
    return {
      svgString: rawSource,
      report: {
        version: "svg-text-path-converter-v1",
        mode: "font_paths",
        status: "pass",
        beforeTextElementCount,
        convertedTextCount: 0,
        remainingTextElementCount: 0,
        tspanExpandedTextCount: 0,
        fontSources: {},
        blockers: [],
      },
    };
  }

  const expandedSource = expandTspansToTextElements(rawSource);
  const expandedTextElementCount = countTextElements(expandedSource);
  const tspanExpandedTextCount = Math.max(
    0,
    expandedTextElementCount - beforeTextElementCount,
  );

  const fonts = await loadBundledFonts();
  let convertedTextCount = 0;
  const converted = expandedSource.replace(
    TEXT_ELEMENT_REGEX,
    (match, attrs, text) => {
      const replacement = convertOneTextElement({
        attrs,
        rawText: text,
        fonts,
        minimumFontSizePx: options.minimumFontSizePx || 0,
        decimalPlaces: options.decimalPlaces ?? 2,
      });
      if (!replacement) {
        return match;
      }
      convertedTextCount += 1;
      return replacement;
    },
  );
  const remainingTextElementCount = countTextElements(converted);
  const blockers =
    remainingTextElementCount > 0
      ? [
          `${remainingTextElementCount} SVG text elements remain after text-to-path conversion.`,
        ]
      : [];

  return {
    svgString: converted.replace(
      /<svg([^>]*)>/i,
      `<svg$1 data-raster-text-mode="font-paths">`,
    ),
    report: {
      version: "svg-text-path-converter-v1",
      mode: "font_paths",
      status: blockers.length ? "blocked" : "pass",
      beforeTextElementCount,
      expandedTextElementCount,
      tspanExpandedTextCount,
      convertedTextCount,
      remainingTextElementCount,
      fontSources: fonts.sources,
      blockers,
    },
  };
}

export function inspectSvgTextPathStatus(svgString = "") {
  const svg = String(svgString || "");
  const textElementCount = countTextElements(svg);
  const pathTextCount = (svg.match(/\bdata-text-path=(["'])true\1/gi) || [])
    .length;
  const labelCount = (svg.match(/\bdata-text-value=/gi) || []).length;
  const mode = svg.includes('data-raster-text-mode="font-paths"')
    ? "font_paths"
    : "svg_text";
  const blockers = [];
  if (mode === "font_paths" && textElementCount > 0) {
    blockers.push(`${textElementCount} SVG text elements remain.`);
  }
  return {
    version: "svg-text-path-status-v1",
    mode,
    status: blockers.length ? "blocked" : "pass",
    textElementCount,
    pathTextCount,
    labelCount,
    blockers,
  };
}

export default {
  convertSvgTextToPaths,
  expandTspansToTextElements,
  inspectSvgTextPathStatus,
};
