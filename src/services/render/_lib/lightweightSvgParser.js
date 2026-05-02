/**
 * Phase 5D — focused SVG parser for the pipeline's master sheet SVG.
 *
 * No XML/DOM dependency. Our pipeline emits a known subset of SVG and we
 * only need the elements actually rendered in `composeCore` /
 * `composeDataPanels` outputs. Anything more exotic (clipPath, mask,
 * filter, foreignObject, animations) is silently dropped because the
 * vector PDF path is opt-in behind a flag and the raster pipeline
 * remains the production default.
 *
 * Returns a tree of nodes:
 *   {
 *     type: "element",
 *     name: "rect",
 *     attrs: { ... },
 *     children: [],     // child nodes (mixed elements + text)
 *     text: null,       // direct inline text content (for <text>/<tspan>)
 *   }
 *
 * Or a text node:
 *   { type: "text", value: "Some text content" }
 *
 * The parser is deliberately permissive: malformed SVG produces a
 * partial tree rather than throwing, so the calling exporter can warn
 * and fall back without breaking the raster path. Callers must treat
 * the result as best-effort.
 */

const TAG_RE = /<\s*(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:\s+[^>]*?)?)(\/?)\s*>/g;
const ATTR_RE = /([a-zA-Z_][a-zA-Z0-9:_-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

const VOID_ELEMENTS = new Set([
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "param",
  "source",
  "track",
  "wbr",
]);

const SKIP_ELEMENTS = new Set([
  "defs",
  "style",
  "clipPath",
  "mask",
  "filter",
  "foreignObject",
  "metadata",
  "title",
  "desc",
]);

/**
 * Parse the attribute portion of an opening tag (e.g. ` x="1" y="2"`)
 * into a flat object.
 */
export function parseAttrs(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(attrText)) !== null) {
    const name = match[1];
    const value = match[3] !== undefined ? match[3] : match[4] || "";
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/**
 * Cheap XML entity decoder for the entities our pipeline actually emits.
 * Not a full HTML5 spec implementation — purpose-built for the master
 * sheet SVG.
 */
export function decodeEntities(text) {
  if (typeof text !== "string" || !text.includes("&")) return text;
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10)),
    );
}

/**
 * Strip CDATA, comments, processing instructions, and DOCTYPE from the
 * input. Cheaper than handling them properly inside the main parser.
 */
function stripIgnored(input) {
  return String(input)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "");
}

function makeElement(name, attrs) {
  return {
    type: "element",
    name,
    attrs,
    children: [],
    text: null,
  };
}

/**
 * Parse an SVG string into a lightweight tree. Returns `{ root, warnings }`.
 * `root` is the outermost `<svg>` element (or the first element found
 * when no <svg> wrapper is present). `warnings` is an array of strings
 * the caller may surface in metadata.
 *
 * @param {string} svgString
 * @returns {{ root: object|null, warnings: string[] }}
 */
export function parseSvg(svgString) {
  const warnings = [];
  if (typeof svgString !== "string" || svgString.length === 0) {
    return { root: null, warnings: ["empty_input"] };
  }
  const cleaned = stripIgnored(svgString);
  const stack = [];
  const documentRoot = makeElement("#document", {});
  stack.push(documentRoot);
  let lastIndex = 0;
  TAG_RE.lastIndex = 0;
  let match;
  let tagCount = 0;
  while ((match = TAG_RE.exec(cleaned)) !== null) {
    const before = cleaned.slice(lastIndex, match.index);
    if (before && before.trim().length > 0 && stack.length > 1) {
      const top = stack[stack.length - 1];
      const text = decodeEntities(before);
      if (top.name === "text" || top.name === "tspan") {
        // Inline text content for <text>/<tspan> — accumulate
        top.text = (top.text || "") + text;
      } else {
        top.children.push({ type: "text", value: text });
      }
    }
    lastIndex = match.index + match[0].length;
    tagCount += 1;
    if (tagCount > 200_000) {
      warnings.push("aborting_after_200k_tags");
      break;
    }
    const isClose = match[1] === "/";
    const tagName = match[2];
    const attrText = match[3] || "";
    const isSelfClose = match[4] === "/" || VOID_ELEMENTS.has(tagName);
    if (isClose) {
      // Pop until the matching open tag (best-effort — tolerate
      // mismatched closes by walking back).
      let popped = null;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === tagName) {
          popped = stack[i];
          stack.length = i;
          break;
        }
      }
      if (!popped) {
        warnings.push(`unmatched_close_${tagName}`);
      }
      continue;
    }
    if (SKIP_ELEMENTS.has(tagName)) {
      // Skip the entire body of these elements: locate the matching
      // close tag and jump past it without parsing the contents. This
      // protects the parser from <style> CSS contents and similar.
      const closeRe = new RegExp(`</\\s*${tagName}\\s*>`, "i");
      const sub = cleaned.slice(TAG_RE.lastIndex);
      const closeMatch = sub.match(closeRe);
      if (closeMatch) {
        TAG_RE.lastIndex += closeMatch.index + closeMatch[0].length;
        lastIndex = TAG_RE.lastIndex;
      }
      continue;
    }
    const attrs = parseAttrs(attrText);
    const element = makeElement(tagName, attrs);
    const top = stack[stack.length - 1];
    top.children.push(element);
    if (!isSelfClose) {
      stack.push(element);
    }
  }
  // Find the first <svg> child of the document root (or the first
  // element if no <svg> exists, for tolerance).
  const svgRoot =
    documentRoot.children.find(
      (n) => n?.type === "element" && n.name === "svg",
    ) ||
    documentRoot.children.find((n) => n?.type === "element") ||
    null;
  if (!svgRoot) warnings.push("no_root_element");
  return { root: svgRoot, warnings };
}

/**
 * Convenience: depth-first iterator over element nodes only (skips
 * text nodes). Yields `{ node, parent, ancestors }` for each element.
 */
export function* walkElements(root) {
  if (!root || root.type !== "element") return;
  const stack = [{ node: root, ancestors: [] }];
  while (stack.length > 0) {
    const { node, ancestors } = stack.pop();
    yield { node, ancestors };
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child?.type === "element") {
          stack.push({ node: child, ancestors: [...ancestors, node] });
        }
      }
    }
  }
}

export const __testing = Object.freeze({
  TAG_RE,
  ATTR_RE,
  VOID_ELEMENTS,
  SKIP_ELEMENTS,
  stripIgnored,
});
