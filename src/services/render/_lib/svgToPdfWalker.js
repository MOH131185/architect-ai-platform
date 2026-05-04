/**
 * Phase 5D — walk a parsed SVG tree and emit pdf-lib draw calls.
 *
 * Pure: takes a parsed SVG tree (from lightweightSvgParser) plus a
 * pdf-lib `page` and `font` registry, and calls page.drawText / drawSvgPath
 * / drawRectangle / etc. directly. Returns a `{ drawCallCount, warnings,
 * skipped }` summary.
 *
 * Coordinate system: SVG is top-left origin, y down. PDF is bottom-left,
 * y up. The walker takes a `transform` callback `(svgX, svgY) => {x,y}`
 * so the orchestrator (`buildVectorPdfFromSheetSvg`) can centralise the
 * SVG-pt → PDF-pt mapping (including any centering / scaling needed for
 * the A1 page).
 *
 * Anything we don't understand is silently dropped with a warning. The
 * vector PDF is opt-in behind a flag and the raster pipeline remains
 * the production default — this walker is best-effort by design.
 */

import { rgb, degrees } from "pdf-lib";

const SUPPORTED_TAGS = new Set([
  "g",
  "svg",
  "rect",
  "line",
  "polyline",
  "polygon",
  "path",
  "circle",
  "ellipse",
  "text",
  "image",
]);

const DEFAULT_FONT_SIZE = 10;

/**
 * Parse an SVG hex/named colour into pdf-lib's `rgb(r,g,b)` (each 0..1).
 * Returns null when the input is "none", missing, or unparseable.
 */
export function parseSvgColor(input) {
  if (!input || input === "none" || input === "transparent") return null;
  const value = String(input).trim().toLowerCase();
  if (value === "white") return rgb(1, 1, 1);
  if (value === "black") return rgb(0, 0, 0);
  const named = NAMED_COLORS[value];
  if (named) return rgb(named[0] / 255, named[1] / 255, named[2] / 255);
  // #RGB or #RRGGBB
  const hex3 = value.match(/^#([0-9a-f]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].split("");
    return rgb(
      parseInt(r + r, 16) / 255,
      parseInt(g + g, 16) / 255,
      parseInt(b + b, 16) / 255,
    );
  }
  const hex6 = value.match(/^#([0-9a-f]{6})$/);
  if (hex6) {
    return rgb(
      parseInt(hex6[1].slice(0, 2), 16) / 255,
      parseInt(hex6[1].slice(2, 4), 16) / 255,
      parseInt(hex6[1].slice(4, 6), 16) / 255,
    );
  }
  // rgb(...) functional notation
  const rgbFn = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgbFn) {
    const parts = rgbFn[1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (parts.length >= 3) {
      return rgb(
        Math.max(0, Math.min(1, parts[0] / 255)),
        Math.max(0, Math.min(1, parts[1] / 255)),
        Math.max(0, Math.min(1, parts[2] / 255)),
      );
    }
  }
  return null;
}

const NAMED_COLORS = Object.freeze({
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  yellow: [255, 255, 0],
});

function num(v, fallback = 0) {
  if (v === undefined || v === null) return fallback;
  const n = Number(String(v).replace(/[^0-9.\-eE]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decode a `data:image/png;base64,…` or `data:image/jpeg;base64,…` URL
 * into a `{ kind, bytes }` pair. Returns null for any other shape (e.g.
 * `data:image/svg+xml`, raw URLs, or non-base64 encodings).
 */
export function decodeImageDataUrl(href) {
  if (typeof href !== "string" || !href.startsWith("data:")) return null;
  const match = href.match(
    /^data:(image\/(?:png|jpe?g))(?:;[^,]+)?;base64,(.*)$/i,
  );
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const kind = mime === "image/png" ? "png" : "jpeg";
  try {
    const bytes = Buffer.from(match[2], "base64");
    return { kind, bytes };
  } catch {
    return null;
  }
}

/**
 * Walk a parsed SVG element tree and emit pdf-lib draw calls. Returns
 * a summary report: number of draw calls emitted + per-tag count of
 * skipped elements + any warnings.
 *
 * @param {object} params
 * @param {object} params.root           - parsed SVG root element
 * @param {object} params.page           - pdf-lib PDFPage instance
 * @param {object} params.pdfDoc         - pdf-lib PDFDocument instance (for embedImage)
 * @param {object} params.fontRegular    - pdf-lib PDFFont
 * @param {object} [params.fontBold]     - pdf-lib PDFFont (optional)
 * @param {function} params.toPdfXY      - (svgX, svgY) → { x, y } in PDF pts
 * @param {number} [params.scale=1]      - SVG→PDF scale factor (also applied to widths)
 * @param {object} [params.viewBox]      - { minX, minY, width, height } from the root SVG
 * @returns {Promise<{ drawCalls: number, skipped: object, warnings: string[] }>}
 */
export async function walkSvgIntoPdf({
  root,
  page,
  pdfDoc,
  fontRegular,
  fontBold = null,
  toPdfXY,
  scale = 1,
  viewBox = null,
}) {
  const summary = { drawCalls: 0, skipped: {}, warnings: [] };
  if (!root || root.type !== "element") {
    summary.warnings.push("no_svg_root");
    return summary;
  }
  if (!page || !pdfDoc || !fontRegular || typeof toPdfXY !== "function") {
    throw new Error("walkSvgIntoPdf: missing page/pdfDoc/fontRegular/toPdfXY");
  }

  // Inherited style state — child <g>/<text> can override.
  const initialState = {
    fill: rgb(0, 0, 0),
    stroke: null,
    strokeWidth: 1,
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: "normal",
    textAnchor: "start",
    fillNone: false,
  };

  await visit(root, initialState, { translateX: 0, translateY: 0 });
  return summary;

  async function visit(node, state, translation) {
    if (!node || node.type !== "element") return;
    const localState = mergeState(state, node.attrs);
    const localTranslate = mergeTranslate(translation, node.attrs);

    if (!SUPPORTED_TAGS.has(node.name)) {
      summary.skipped[node.name] = (summary.skipped[node.name] || 0) + 1;
      return;
    }

    switch (node.name) {
      case "g":
      case "svg":
        for (const child of node.children) {
          if (child?.type === "element") {
            await visit(child, localState, localTranslate);
          }
        }
        return;

      case "rect": {
        const x = num(node.attrs.x) + localTranslate.translateX;
        const y = num(node.attrs.y) + localTranslate.translateY;
        const w = num(node.attrs.width);
        const h = num(node.attrs.height);
        if (w <= 0 || h <= 0) return;
        // SVG rect is top-left; convert top-left corner.
        const tl = toPdfXY(x, y);
        const br = toPdfXY(x + w, y + h);
        const pdfX = Math.min(tl.x, br.x);
        const pdfY = Math.min(tl.y, br.y);
        const width = Math.abs(br.x - tl.x);
        const height = Math.abs(br.y - tl.y);
        const opts = {
          x: pdfX,
          y: pdfY,
          width,
          height,
        };
        if (localState.fill && !localState.fillNone)
          opts.color = localState.fill;
        if (localState.stroke) {
          opts.borderColor = localState.stroke;
          opts.borderWidth = localState.strokeWidth * scale;
        }
        page.drawRectangle(opts);
        summary.drawCalls += 1;
        return;
      }

      case "line": {
        const x1 = num(node.attrs.x1) + localTranslate.translateX;
        const y1 = num(node.attrs.y1) + localTranslate.translateY;
        const x2 = num(node.attrs.x2) + localTranslate.translateX;
        const y2 = num(node.attrs.y2) + localTranslate.translateY;
        const start = toPdfXY(x1, y1);
        const end = toPdfXY(x2, y2);
        const stroke =
          localState.stroke ||
          (localState.fill && !localState.fillNone
            ? localState.fill
            : rgb(0, 0, 0));
        page.drawLine({
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          thickness: localState.strokeWidth * scale,
          color: stroke,
        });
        summary.drawCalls += 1;
        return;
      }

      case "polyline":
      case "polygon": {
        const pointsText = String(node.attrs.points || "").trim();
        if (!pointsText) return;
        const pairs = pointsText
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => Number.isFinite(n));
        if (pairs.length < 4) return;
        // Build SVG path data and use drawSvgPath (deterministic).
        const cmds = [];
        for (let i = 0; i + 1 < pairs.length; i += 2) {
          const cmd = i === 0 ? "M" : "L";
          const px = pairs[i] + localTranslate.translateX;
          const py = pairs[i + 1] + localTranslate.translateY;
          const pt = toPdfXY(px, py);
          cmds.push(`${cmd}${pt.x} ${pt.y}`);
        }
        if (node.name === "polygon") cmds.push("Z");
        const pathData = cmds.join(" ");
        drawPathOnPage({
          page,
          pathData,
          state: localState,
          scale,
        });
        summary.drawCalls += 1;
        return;
      }

      case "path": {
        const d = String(node.attrs.d || "").trim();
        if (!d) return;
        // pdf-lib's drawSvgPath uses SVG path syntax directly. We need
        // to translate the path's reference point: pdf-lib places the
        // path at (x, y) in PDF coords and treats the path data as
        // relative to that origin (with y flipped). For the master
        // sheet SVG every <path> is in the parent SVG's coordinate
        // system, so we anchor at the parent translate origin and let
        // pdf-lib handle the y-flip via its own internal convention.
        const anchor = toPdfXY(
          localTranslate.translateX,
          localTranslate.translateY,
        );
        const opts = {
          x: anchor.x,
          y: anchor.y,
          scale,
        };
        if (localState.fill && !localState.fillNone) {
          opts.color = localState.fill;
        }
        if (localState.stroke) {
          opts.borderColor = localState.stroke;
          opts.borderWidth = localState.strokeWidth * scale;
        }
        try {
          page.drawSvgPath(d, opts);
          summary.drawCalls += 1;
        } catch (err) {
          summary.warnings.push(
            `path_draw_failed:${(err?.message || "unknown").slice(0, 80)}`,
          );
        }
        return;
      }

      case "circle": {
        const cx = num(node.attrs.cx) + localTranslate.translateX;
        const cy = num(node.attrs.cy) + localTranslate.translateY;
        const r = num(node.attrs.r);
        if (r <= 0) return;
        const center = toPdfXY(cx, cy);
        const opts = {
          x: center.x,
          y: center.y,
          size: r * scale,
        };
        if (localState.fill && !localState.fillNone)
          opts.color = localState.fill;
        if (localState.stroke) {
          opts.borderColor = localState.stroke;
          opts.borderWidth = localState.strokeWidth * scale;
        }
        page.drawCircle(opts);
        summary.drawCalls += 1;
        return;
      }

      case "ellipse": {
        const cx = num(node.attrs.cx) + localTranslate.translateX;
        const cy = num(node.attrs.cy) + localTranslate.translateY;
        const rx = num(node.attrs.rx);
        const ry = num(node.attrs.ry);
        if (rx <= 0 || ry <= 0) return;
        const center = toPdfXY(cx, cy);
        const opts = {
          x: center.x,
          y: center.y,
          xScale: rx * scale,
          yScale: ry * scale,
        };
        if (localState.fill && !localState.fillNone)
          opts.color = localState.fill;
        if (localState.stroke) {
          opts.borderColor = localState.stroke;
          opts.borderWidth = localState.strokeWidth * scale;
        }
        page.drawEllipse(opts);
        summary.drawCalls += 1;
        return;
      }

      case "text": {
        const x = num(node.attrs.x) + localTranslate.translateX;
        const y = num(node.attrs.y) + localTranslate.translateY;
        const fontSize = num(node.attrs["font-size"], localState.fontSize);
        const textAnchor = node.attrs["text-anchor"] || localState.textAnchor;
        const fontWeight = node.attrs["font-weight"] || localState.fontWeight;
        const useBold =
          (fontWeight === "bold" || fontWeight === "700") && fontBold;
        const font = useBold ? fontBold : fontRegular;
        const colour = localState.fill || rgb(0, 0, 0);
        const textValue = collectTextContent(node).trim();
        if (!textValue) {
          // No direct text — handle <tspan> children
          for (const child of node.children) {
            if (child?.type === "element" && child.name === "tspan") {
              await drawTspan({
                tspan: child,
                anchorX: x,
                anchorY: y,
                inheritedFontSize: fontSize,
                inheritedAnchor: textAnchor,
                inheritedColor: colour,
                fontRegular,
                fontBold,
                page,
                toPdfXY,
                scale,
              });
            }
          }
          return;
        }
        const renderedSize = fontSize * scale;
        const widthPdf = font.widthOfTextAtSize(textValue, renderedSize);
        const alignmentDx =
          textAnchor === "middle"
            ? -widthPdf / 2
            : textAnchor === "end"
              ? -widthPdf
              : 0;
        const pdfPos = toPdfXY(x, y);
        page.drawText(textValue, {
          x: pdfPos.x + alignmentDx,
          y: pdfPos.y,
          size: renderedSize,
          font,
          color: colour,
        });
        summary.drawCalls += 1;
        return;
      }

      case "image": {
        const href =
          node.attrs.href ||
          node.attrs["xlink:href"] ||
          node.attrs["xmlnsXlink:href"] ||
          "";
        const decoded = decodeImageDataUrl(href);
        if (!decoded) {
          summary.skipped["image:non-data-url"] =
            (summary.skipped["image:non-data-url"] || 0) + 1;
          return;
        }
        const x = num(node.attrs.x) + localTranslate.translateX;
        const y = num(node.attrs.y) + localTranslate.translateY;
        const w = num(node.attrs.width);
        const h = num(node.attrs.height);
        if (w <= 0 || h <= 0) return;
        try {
          // pdf-lib's instanceof Uint8Array check fails in Jest+jsdom
          // when the global `Uint8Array` differs from Node's. Force a
          // copy through the realm-local constructor so the validator
          // accepts the buffer in both Node and jsdom test environments.
          const bytesView = new Uint8Array(
            decoded.bytes.buffer,
            decoded.bytes.byteOffset,
            decoded.bytes.byteLength,
          );
          const embedded =
            decoded.kind === "png"
              ? await pdfDoc.embedPng(bytesView)
              : await pdfDoc.embedJpg(bytesView);
          const tl = toPdfXY(x, y);
          const br = toPdfXY(x + w, y + h);
          const pdfX = Math.min(tl.x, br.x);
          const pdfY = Math.min(tl.y, br.y);
          const width = Math.abs(br.x - tl.x);
          const height = Math.abs(br.y - tl.y);
          page.drawImage(embedded, {
            x: pdfX,
            y: pdfY,
            width,
            height,
          });
          summary.drawCalls += 1;
        } catch (err) {
          summary.warnings.push(
            `image_embed_failed:${(err?.message || "unknown").slice(0, 80)}`,
          );
        }
        return;
      }

      default:
        summary.skipped[node.name] = (summary.skipped[node.name] || 0) + 1;
        return;
    }
  }

  async function drawTspan({
    tspan,
    anchorX,
    anchorY,
    inheritedFontSize,
    inheritedAnchor,
    inheritedColor,
    fontRegular: _fontRegular,
    fontBold: _fontBold,
    page: _page,
    toPdfXY: _toPdfXY,
    scale: _scale,
  }) {
    const fontSize = num(tspan.attrs["font-size"], inheritedFontSize);
    const fontWeight = tspan.attrs["font-weight"] || "normal";
    const textAnchor = tspan.attrs["text-anchor"] || inheritedAnchor;
    const fillAttr = tspan.attrs.fill;
    const colour = fillAttr
      ? parseSvgColor(fillAttr) || inheritedColor
      : inheritedColor;
    const useBold =
      (fontWeight === "bold" || fontWeight === "700") && _fontBold;
    const font = useBold ? _fontBold : _fontRegular;
    const dx = num(tspan.attrs.dx);
    const dy = num(tspan.attrs.dy);
    const tx = num(tspan.attrs.x, anchorX) + dx;
    const ty = num(tspan.attrs.y, anchorY) + dy;
    const text = collectTextContent(tspan).trim();
    if (!text) return;
    const renderedSize = fontSize * _scale;
    const widthPdf = font.widthOfTextAtSize(text, renderedSize);
    const alignmentDx =
      textAnchor === "middle"
        ? -widthPdf / 2
        : textAnchor === "end"
          ? -widthPdf
          : 0;
    const pdfPos = _toPdfXY(tx, ty);
    _page.drawText(text, {
      x: pdfPos.x + alignmentDx,
      y: pdfPos.y,
      size: renderedSize,
      font,
      color: colour,
    });
    summary.drawCalls += 1;
  }
}

function collectTextContent(node) {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (node.type !== "element") return "";
  let text = node.text || "";
  for (const child of node.children || []) {
    if (child?.type === "text") text += child.value;
    else if (child?.type === "element") text += collectTextContent(child);
  }
  return text;
}

function mergeState(parent, attrs = {}) {
  const next = { ...parent };
  if (attrs.fill !== undefined) {
    if (attrs.fill === "none") {
      next.fillNone = true;
      next.fill = null;
    } else {
      const parsed = parseSvgColor(attrs.fill);
      if (parsed) {
        next.fill = parsed;
        next.fillNone = false;
      }
    }
  }
  if (attrs.stroke !== undefined) {
    next.stroke = parseSvgColor(attrs.stroke);
  }
  if (attrs["stroke-width"] !== undefined) {
    next.strokeWidth = num(attrs["stroke-width"], next.strokeWidth);
  }
  if (attrs["font-size"] !== undefined) {
    next.fontSize = num(attrs["font-size"], next.fontSize);
  }
  if (attrs["font-weight"] !== undefined) {
    next.fontWeight = attrs["font-weight"];
  }
  if (attrs["text-anchor"] !== undefined) {
    next.textAnchor = attrs["text-anchor"];
  }
  return next;
}

/**
 * Compose nested transforms — only `translate(x, y)` is supported.
 * Anything more exotic (scale, rotate, matrix) is silently ignored.
 * For the master sheet SVG our pipeline only emits translates, so this
 * covers our use case.
 */
function mergeTranslate(parent, attrs = {}) {
  if (!attrs.transform) return parent;
  const match = String(attrs.transform).match(
    /translate\s*\(\s*(-?[\d.]+)\s*[,\s]\s*(-?[\d.]+)\s*\)/,
  );
  if (!match) return parent;
  const dx = num(match[1]);
  const dy = num(match[2]);
  return {
    translateX: parent.translateX + dx,
    translateY: parent.translateY + dy,
  };
}

function drawPathOnPage({ page, pathData, state, scale }) {
  const opts = { x: 0, y: 0, scale };
  if (state.fill && !state.fillNone) opts.color = state.fill;
  if (state.stroke) {
    opts.borderColor = state.stroke;
    opts.borderWidth = state.strokeWidth * scale;
  }
  page.drawSvgPath(pathData, opts);
}

export const __testing = Object.freeze({
  parseSvgColor,
  decodeImageDataUrl,
  num,
  collectTextContent,
  mergeTranslate,
});

// Avoid unused-import lint warnings for `degrees` if a future change
// removes the rotate() use case. Keeping the import as documentation
// of the pdf-lib helper available for further extension.
void degrees;
