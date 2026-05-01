/**
 * Phase E — Shared deterministic material texture cards for the A1 material
 * palette panel. Used by both the A1 compose path
 * (`composeDataPanels.buildMaterialPaletteBuffer`) and the ProjectGraph
 * vertical slice (`projectGraphVerticalSliceService.buildMaterialPalettePanelArtifact`).
 *
 * Default behaviour is fully deterministic: procedural SVG `<pattern>`
 * definitions, no OpenAI calls, no Sharp dependency. An optional AI texture
 * thumbnail overlay can be enabled per-call via the `thumbnailProvider` hook
 * AND the `MATERIAL_TEXTURE_THUMBNAILS_ENABLED=true` env flag; if anything
 * fails we fall back to the procedural pattern, never crash the sheet.
 */

const CANONICAL_TEXTURE_KINDS = Object.freeze([
  "red_multi_brick",
  "vertical_timber_cladding",
  "dark_grey_roof_tile",
  "anthracite_aluminium_frame",
  "timber_front_door",
  "dark_metal_rainwater_goods",
  "light_render",
  "natural_stone_paving",
]);

// Order matters. First match wins, so `door` and `rainwater` rules sit above
// the broader `timber`/`metal` rules; otherwise "timber front door" would
// classify as cladding and "metal rainwater downpipe" as a window frame.
const MATERIAL_KEYWORD_MAP = Object.freeze([
  {
    kind: "timber_front_door",
    pattern:
      /\b(front|entrance|main)\s*door\b|\b(timber|wood(en)?)\s+door\b|\bdoor\b/i,
  },
  {
    kind: "dark_metal_rainwater_goods",
    pattern: /\brainwater\b|\bgutter(s|ing)?\b|\bdownpipe\b|\bmetal\s+trim\b/i,
  },
  {
    kind: "red_multi_brick",
    pattern:
      /\b(red\s+|multi[-\s]?)?brick(work)?\b|\bmasonry\b|\bterracotta\b/i,
  },
  {
    kind: "dark_grey_roof_tile",
    pattern:
      /\broof\b|\bslate\b|\b(roof\s+)?tile\b|\bshingle\b|\bstanding\s+seam\b/i,
  },
  {
    kind: "anthracite_aluminium_frame",
    pattern:
      /\baluminium\b|\baluminum\b|\banthracite\b|\bwindow(\s+frame)?\b|\bglazing\b|\bglass\b|\bzinc\b/i,
  },
  {
    kind: "vertical_timber_cladding",
    pattern:
      /\btimber\b|\bwood(en)?\b|\boak\b|\bcedar\b|\bboarding\b|\bcladding\b/i,
  },
  {
    kind: "natural_stone_paving",
    pattern: /\bstone\b|\bpaving\b|\bflagstone\b/i,
  },
  {
    kind: "light_render",
    pattern: /\brender\b|\bstucco\b|\blime\b|\bplaster\b/i,
  },
]);

const KIND_HEX = Object.freeze({
  red_multi_brick: "#b6634a",
  vertical_timber_cladding: "#b08455",
  dark_grey_roof_tile: "#343a40",
  anthracite_aluminium_frame: "#4a4f55",
  timber_front_door: "#6f4a2a",
  dark_metal_rainwater_goods: "#2a2e33",
  light_render: "#d7d2c8",
  natural_stone_paving: "#c1b8aa",
});

const KIND_APPLICATION = Object.freeze({
  red_multi_brick: "external wall",
  vertical_timber_cladding: "facade accent",
  dark_grey_roof_tile: "roof finish",
  anthracite_aluminium_frame: "openings",
  timber_front_door: "entrance door",
  dark_metal_rainwater_goods: "rainwater goods",
  light_render: "external wall",
  natural_stone_paving: "landscape / plinth",
});

// Phase 2 — high-level category labels that appear above each swatch on the
// presentation-v3 material palette panel ("EXTERIOR", "ROOF", "OPENINGS",
// "DETAIL", "LANDSCAPE"). Mapped from the canonical texture kind so callers
// don't have to guess.
const KIND_CATEGORY = Object.freeze({
  red_multi_brick: "EXTERIOR",
  vertical_timber_cladding: "EXTERIOR",
  light_render: "EXTERIOR",
  dark_grey_roof_tile: "ROOF",
  anthracite_aluminium_frame: "OPENINGS",
  timber_front_door: "OPENINGS",
  dark_metal_rainwater_goods: "DETAIL",
  natural_stone_paving: "LANDSCAPE",
});

const APPLICATION_CATEGORY_HINTS = Object.freeze([
  {
    pattern: /\b(roof|tile|slate|shingle|standing\s+seam)\b/i,
    category: "ROOF",
  },
  { pattern: /\b(window|opening|glaz|frame|door)\b/i, category: "OPENINGS" },
  {
    pattern: /\b(rainwater|gutter|downpipe|trim|detail|fitting)\b/i,
    category: "DETAIL",
  },
  {
    pattern: /\b(landscape|paving|plinth|stone|garden|hard\s*standing)\b/i,
    category: "LANDSCAPE",
  },
  {
    pattern: /\b(wall|facade|cladding|render|brick|stucco|exterior)\b/i,
    category: "EXTERIOR",
  },
]);

export function inferMaterialCategory(material = {}) {
  const kind = materialTextureKind(
    material.name || material,
    material.application || "",
  );
  if (KIND_CATEGORY[kind]) return KIND_CATEGORY[kind];
  const haystack =
    `${material.application || ""} ${material.name || ""}`.toLowerCase();
  for (const hint of APPLICATION_CATEGORY_HINTS) {
    if (hint.pattern.test(haystack)) return hint.category;
  }
  return "DETAIL";
}

const CANONICAL_FALLBACK_MATERIALS = Object.freeze([
  { name: "Red Multi Brick", kind: "red_multi_brick" },
  { name: "Vertical Timber Cladding", kind: "vertical_timber_cladding" },
  { name: "Dark Grey Roof Tile", kind: "dark_grey_roof_tile" },
  { name: "Anthracite Aluminium Frame", kind: "anthracite_aluminium_frame" },
  { name: "Timber Front Door", kind: "timber_front_door" },
  { name: "Dark Metal Rainwater Goods", kind: "dark_metal_rainwater_goods" },
  { name: "Light Render", kind: "light_render" },
  { name: "Natural Stone Paving", kind: "natural_stone_paving" },
]);

const HEX_INDEX_FALLBACKS = Object.freeze([
  "#b6634a",
  "#b08455",
  "#343a40",
  "#d7d2c8",
  "#5f7482",
  "#c1b8aa",
  "#6f756c",
  "#8a6f59",
]);

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAsciiLabel(value) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/×/g, "x")
    .replace(/²/g, "2")
    .replace(/°C/g, " C")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E]/g, "");
}

function clampText(value, maxChars = 28) {
  const normalized = toAsciiLabel(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function fnv1aHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function materialTextureKind(name = "", application = "") {
  const haystack =
    `${String(name ?? "")} ${String(application ?? "")}`.toLowerCase();
  for (const rule of MATERIAL_KEYWORD_MAP) {
    if (rule.pattern.test(haystack)) return rule.kind;
  }
  return "light_render";
}

export function inferMaterialHex(name = "", index = 0, application = "") {
  const kind = materialTextureKind(name, application);
  const kindHex = KIND_HEX[kind];
  if (kindHex) return kindHex;
  return HEX_INDEX_FALLBACKS[index % HEX_INDEX_FALLBACKS.length];
}

export function inferMaterialApplication(name = "", application = "") {
  if (application && String(application).trim())
    return String(application).trim();
  const kind = materialTextureKind(name);
  return KIND_APPLICATION[kind] || "finish";
}

/**
 * Stable signature derived from name + application + hex. Used as both pattern
 * ID seed and thumbnail cache key; identical inputs always produce identical
 * signatures.
 */
export function materialSignature(material) {
  const source =
    material && typeof material === "object" ? material : { name: material };
  const name = toAsciiLabel(source.name || source.material || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const application = toAsciiLabel(source.application || source.use || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const hex = String(source.hexColor || source.hex || source.color_hex || "")
    .toLowerCase()
    .trim();
  return fnv1aHash(`${name}|${application}|${hex}`);
}

function patternIdFor(signature) {
  return `mat-tex-${signature}`;
}

const KIND_OVERLAY = Object.freeze({
  red_multi_brick:
    '<path d="M0 12 H72 M0 36 H72 M0 60 H72 M16 0 V12 M52 12 V36 M16 36 V60 M52 60 V72" stroke="#5b2f25" stroke-width="2" opacity="0.45"/>',
  vertical_timber_cladding:
    '<path d="M8 0 V72 M22 0 V72 M36 0 V72 M50 0 V72 M64 0 V72" stroke="#5c3b21" stroke-width="2.4" opacity="0.42"/><path d="M5 18 C18 8 24 30 40 18 C52 10 58 22 64 16" fill="none" stroke="#f0c88f" stroke-width="1.5" opacity="0.45"/>',
  dark_grey_roof_tile:
    '<path d="M0 12 H72 M0 28 H72 M0 44 H72 M0 60 H72" stroke="#15191d" stroke-width="2" opacity="0.55"/><path d="M14 0 L4 72 M38 0 L26 72 M62 0 L50 72" stroke="#60666c" stroke-width="1.4" opacity="0.5"/>',
  anthracite_aluminium_frame:
    '<rect x="6" y="6" width="60" height="60" fill="none" stroke="#1a1d22" stroke-width="3" opacity="0.55"/><line x1="36" y1="6" x2="36" y2="66" stroke="#1a1d22" stroke-width="2" opacity="0.5"/><line x1="6" y1="36" x2="66" y2="36" stroke="#1a1d22" stroke-width="2" opacity="0.5"/>',
  timber_front_door:
    '<rect x="10" y="6" width="52" height="60" fill="none" stroke="#3a2412" stroke-width="2.5" opacity="0.6"/><rect x="16" y="12" width="40" height="22" fill="none" stroke="#3a2412" stroke-width="1.6" opacity="0.55"/><rect x="16" y="40" width="40" height="22" fill="none" stroke="#3a2412" stroke-width="1.6" opacity="0.55"/><circle cx="56" cy="36" r="1.5" fill="#d6b06a" opacity="0.85"/>',
  dark_metal_rainwater_goods:
    '<line x1="36" y1="0" x2="36" y2="72" stroke="#0f1316" stroke-width="6" opacity="0.7"/><rect x="30" y="14" width="12" height="6" fill="#0f1316" opacity="0.7"/><rect x="30" y="52" width="12" height="6" fill="#0f1316" opacity="0.7"/>',
  light_render:
    '<circle cx="12" cy="14" r="2" fill="#ffffff" opacity="0.55"/><circle cx="48" cy="28" r="2.4" fill="#ffffff" opacity="0.45"/><circle cx="30" cy="56" r="1.8" fill="#7c756c" opacity="0.4"/><circle cx="62" cy="62" r="2.1" fill="#7c756c" opacity="0.35"/><circle cx="22" cy="40" r="1.6" fill="#ffffff" opacity="0.35"/>',
  natural_stone_paving:
    '<path d="M8 10 L30 4 L54 12 L66 30 L52 58 L24 66 L4 44 Z" fill="none" stroke="#7f776d" stroke-width="2" opacity="0.55"/><path d="M0 36 H72 M36 0 V72" stroke="#f3eee7" stroke-width="2" opacity="0.5"/>',
});

/**
 * Build a single SVG `<pattern>` definition for a material. Pattern IDs are
 * derived from `materialSignature(material)`, so identical inputs always
 * produce identical IDs (deterministic + cacheable).
 */
export function buildMaterialTexturePattern(material, options = {}) {
  const signature = options.signature || materialSignature(material);
  const id = options.id || patternIdFor(signature);
  const kind = materialTextureKind(material?.name, material?.application);
  const baseHex = escapeXml(
    material?.hexColor ||
      material?.hex ||
      inferMaterialHex(
        material?.name,
        options.index ?? 0,
        material?.application,
      ),
  );
  const overlay = KIND_OVERLAY[kind] || KIND_OVERLAY.light_render;
  const svg = `<pattern id="${id}" width="72" height="72" patternUnits="userSpaceOnUse" data-material-texture="${kind}" data-material-signature="${signature}"><rect width="72" height="72" fill="${baseHex}"/>${overlay}</pattern>`;
  return { id, kind, signature, svg };
}

function normalizeEntry(entry, index, source) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const name = entry.replace(/\s+/g, " ").trim();
    if (!name) return null;
    return {
      name,
      hexColor: inferMaterialHex(name, index),
      application: inferMaterialApplication(name),
      source,
    };
  }
  if (typeof entry !== "object") return null;
  const name = String(
    entry.name ||
      entry.material ||
      entry.label ||
      entry.type ||
      entry.primary ||
      entry.finish ||
      "",
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  const explicitHex = entry.hexColor || entry.hex || entry.color_hex || null;
  const explicitApp = entry.application || entry.use || entry.role || null;
  return {
    name,
    hexColor: explicitHex || inferMaterialHex(name, index, explicitApp || ""),
    application: inferMaterialApplication(name, explicitApp || ""),
    source: source || entry.source || "project_graph",
  };
}

function pushAll(target, value, source) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => pushAll(target, entry, source));
    return;
  }
  if (typeof value === "string") {
    target.push({ raw: value, source });
    return;
  }
  if (typeof value === "object") {
    if (
      value.name ||
      value.material ||
      value.label ||
      value.type ||
      value.primary ||
      value.finish
    ) {
      target.push({ raw: value, source });
      return;
    }
    Object.entries(value).forEach(([key, nested]) => {
      if (typeof nested === "string") {
        target.push({ raw: { name: nested, application: key }, source });
      } else if (nested && typeof nested === "object") {
        target.push({
          raw: { ...nested, application: nested.application || key },
          source,
        });
      }
    });
  }
}

/**
 * Normalise material entries from heterogeneous sources, dedupe by lowercase
 * name, and fall back to the canonical 8-material set when nothing usable was
 * supplied. Capped at 8 entries.
 */
export function normalizeMaterialPaletteEntries({
  localStyle = null,
  compiledProject = null,
  styleDNA = null,
  brief = null,
  masterDNA = null,
  materials = null,
} = {}) {
  const collected = [];
  pushAll(collected, materials, "project_graph");
  pushAll(
    collected,
    localStyle?.material_palette_with_provenance,
    "local_style",
  );
  pushAll(collected, localStyle?.material_palette, "local_style");
  pushAll(collected, localStyle?.materials_local, "local_style");
  pushAll(collected, localStyle?.local_materials, "local_style");
  pushAll(collected, styleDNA?.materials, "style_dna");
  pushAll(collected, styleDNA?.local_materials, "style_dna");
  pushAll(collected, masterDNA?.materials, "master_dna");
  pushAll(collected, masterDNA?.style?.materials, "master_dna");
  pushAll(collected, masterDNA?._structured?.style?.materials, "master_dna");
  pushAll(collected, compiledProject?.materials, "compiled_project");
  pushAll(collected, brief?.user_intent?.material_preferences, "user_intent");

  const byName = new Map();
  collected.forEach(({ raw, source }) => {
    const normalized = normalizeEntry(raw, byName.size, source);
    if (!normalized) return;
    const key = normalized.name.toLowerCase();
    if (byName.has(key)) return;
    byName.set(key, normalized);
  });

  if (byName.size === 0) {
    CANONICAL_FALLBACK_MATERIALS.forEach((entry, index) => {
      byName.set(entry.name.toLowerCase(), {
        name: entry.name,
        hexColor:
          KIND_HEX[entry.kind] ||
          HEX_INDEX_FALLBACKS[index % HEX_INDEX_FALLBACKS.length],
        application: KIND_APPLICATION[entry.kind] || "finish",
        source: "deterministic_fallback",
      });
    });
  }

  return Array.from(byName.values()).slice(0, 8);
}

/**
 * Phase 2 — top up an existing materials list to a target size using the
 * canonical 8-material fallback set. Used by the presentation-v3 material
 * palette panel so the 2×4 grid always renders 8 cards even when the
 * SheetDesignContext / DNA collection is shorter.
 *
 * Existing entries are kept verbatim and dedupe against the fallback by
 * lowercase name. Returns at most `targetSize` entries.
 */
export function topUpMaterialPaletteWithCanonical(
  materials = [],
  targetSize = 8,
) {
  const result = Array.isArray(materials) ? materials.filter(Boolean) : [];
  if (result.length >= targetSize) return result.slice(0, targetSize);
  const known = new Set(
    result.map((entry) => String(entry?.name || "").toLowerCase()),
  );
  for (
    let i = 0;
    i < CANONICAL_FALLBACK_MATERIALS.length && result.length < targetSize;
    i += 1
  ) {
    const fallback = CANONICAL_FALLBACK_MATERIALS[i];
    const key = fallback.name.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    result.push({
      name: fallback.name,
      hexColor:
        KIND_HEX[fallback.kind] ||
        HEX_INDEX_FALLBACKS[i % HEX_INDEX_FALLBACKS.length],
      application: KIND_APPLICATION[fallback.kind] || "finish",
      source: "deterministic_fallback_topup",
    });
  }
  return result.slice(0, targetSize);
}

function buildSingleCard({ material, index, layout, sourceTag, thumbnailUrl }) {
  const signature = materialSignature(material);
  const pattern = buildMaterialTexturePattern(material, { signature, index });
  const x = layout.startX + layout.col * (layout.cardWidth + layout.gapX);
  const y = layout.startY + layout.row * (layout.cardHeight + layout.gapY);
  const labelOffset = layout.labelOffset ?? 22;
  const subLabelOffset =
    layout.subLabelOffset ?? labelOffset + (layout.subLabelGap ?? 22);
  const labelFontSize = layout.labelFontSize ?? 18;
  const subLabelFontSize = layout.subLabelFontSize ?? 14;
  const fontFamily = layout.fontFamily || "Arial, Helvetica, sans-serif";
  const labelText = clampText(
    String(material.name || "").toUpperCase(),
    layout.labelMaxChars ?? 28,
  );
  const application = clampText(
    material.application || "",
    layout.subLabelMaxChars ?? 32,
  );
  const safeFill = thumbnailUrl ? `url(#${pattern.id})` : `url(#${pattern.id})`;
  const overlayImage = thumbnailUrl
    ? `<image href="${escapeXml(thumbnailUrl)}" x="${x}" y="${y}" width="${layout.cardWidth}" height="${layout.cardHeight}" preserveAspectRatio="xMidYMid slice" data-material-thumbnail="true"/>`
    : "";
  // Phase 2 — optional small category label rendered above each swatch
  // ("EXTERIOR" / "ROOF" / "OPENINGS" / "DETAIL" / "LANDSCAPE"). Driven by
  // either an explicit `material.category` or inferred from kind/application.
  const showCategoryLabel = layout.showCategoryLabel === true;
  const categoryFromMaterial = material.category
    ? String(material.category).trim().toUpperCase()
    : null;
  const category =
    categoryFromMaterial ||
    (showCategoryLabel ? inferMaterialCategory(material) : null);
  const categoryFontSize =
    layout.categoryFontSize ?? Math.max(9, subLabelFontSize - 2);
  const categoryOffset =
    layout.categoryOffset ?? Math.max(8, categoryFontSize + 2);
  const categorySvg =
    showCategoryLabel && category
      ? `<text x="${x}" y="${y - categoryOffset / 2}" font-size="${categoryFontSize}" font-family="${fontFamily}" font-weight="700" fill="#666666" letter-spacing="1.5" class="sheet-critical-label" data-text-role="critical">${escapeXml(category)}</text>`
      : "";
  const cardSvg = `<g data-material-index="${index + 1}" data-material-signature="${signature}" data-material-source="${sourceTag}"${category ? ` data-material-category="${escapeXml(category)}"` : ""}>
  ${categorySvg}
  <rect x="${x}" y="${y}" width="${layout.cardWidth}" height="${layout.cardHeight}" fill="${safeFill}" stroke="#111111" stroke-width="${layout.strokeWidth ?? 2}" data-material-texture="${escapeXml(pattern.kind)}"/>
  ${overlayImage}
  <text x="${x}" y="${y + layout.cardHeight + labelOffset}" font-size="${labelFontSize}" font-family="${fontFamily}" font-weight="700" fill="#111111" class="sheet-critical-label" data-text-role="critical">${escapeXml(labelText)}</text>
  ${application ? `<text x="${x}" y="${y + layout.cardHeight + subLabelOffset}" font-size="${subLabelFontSize}" font-family="${fontFamily}" fill="#444444">${escapeXml(application)}</text>` : ""}
</g>`;
  return {
    pattern,
    cardSvg,
    metadata: {
      materialSignature: signature,
      label: labelText,
      application: application || "",
      category: category || null,
      textureKind: pattern.kind,
      source: sourceTag,
      fallbackAvailable: true,
      hex:
        material.hexColor ||
        material.hex ||
        inferMaterialHex(material.name, index, material.application),
    },
  };
}

function resolveLayout(layout = {}) {
  const cols = Math.max(1, layout.cols || 4);
  const rows = Math.max(1, layout.rows || 2);
  const max = Math.min(layout.max ?? cols * rows, 8);
  return {
    cols,
    rows,
    max,
    cardWidth: layout.cardWidth || 170,
    cardHeight: layout.cardHeight || 96,
    gapX: layout.gapX ?? 24,
    gapY: layout.gapY ?? 78,
    startX: layout.startX ?? 44,
    startY: layout.startY ?? 86,
    labelOffset: layout.labelOffset,
    subLabelOffset: layout.subLabelOffset,
    subLabelGap: layout.subLabelGap,
    labelFontSize: layout.labelFontSize,
    subLabelFontSize: layout.subLabelFontSize,
    fontFamily: layout.fontFamily,
    labelMaxChars: layout.labelMaxChars,
    subLabelMaxChars: layout.subLabelMaxChars,
    strokeWidth: layout.strokeWidth,
    // Phase 2 — optional category label band above each swatch.
    showCategoryLabel: layout.showCategoryLabel === true,
    categoryFontSize: layout.categoryFontSize,
    categoryOffset: layout.categoryOffset,
  };
}

/**
 * Synchronous procedural variant. Always returns deterministic SVG patterns;
 * does not call any external provider. This is the safe default for both the
 * compose path and the ProjectGraph path.
 *
 * Returns:
 *   {
 *     defs:        string  // joined <pattern> defs (place inside <defs>)
 *     cards:       string  // joined <g>...</g> card fragments
 *     cardMetadata: Array<{ materialSignature, label, application, textureKind,
 *                           source: 'procedural_svg_pattern',
 *                           fallbackAvailable: true, hex }>
 *   }
 */
export function buildMaterialPaletteCards({
  materials,
  layout: layoutInput,
} = {}) {
  const layout = resolveLayout(layoutInput);
  const list = (Array.isArray(materials) ? materials : []).slice(0, layout.max);
  const defs = [];
  const cards = [];
  const cardMetadata = [];
  list.forEach((material, index) => {
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    const built = buildSingleCard({
      material,
      index,
      layout: { ...layout, col, row },
      sourceTag: "procedural_svg_pattern",
    });
    defs.push(built.pattern.svg);
    cards.push(built.cardSvg);
    cardMetadata.push(built.metadata);
  });
  return {
    defs: defs.join(""),
    cards: cards.join("\n"),
    cardMetadata,
  };
}

function isThumbnailFlagEnabled(env) {
  const source =
    env && typeof env === "object"
      ? env
      : typeof process !== "undefined"
        ? process.env
        : {};
  const value = source?.MATERIAL_TEXTURE_THUMBNAILS_ENABLED;
  return String(value ?? "").toLowerCase() === "true";
}

/**
 * Async variant that may invoke an optional `thumbnailProvider` per material.
 * Behaviour matrix:
 *   - flag off                                 -> all cards source = procedural_svg_pattern
 *   - flag on, no provider                     -> procedural fallback
 *   - flag on, provider throws/returns null    -> procedural fallback (no rejection)
 *   - flag on, provider returns { url }        -> source = ai_texture_thumbnail, image overlay
 *
 * In every case a working procedural pattern is emitted underneath, so the
 * sheet renders correctly even if an upstream `<image href>` fails to resolve.
 */
export async function buildMaterialPaletteCardsAsync({
  materials,
  layout: layoutInput,
  thumbnailProvider = null,
  env = null,
} = {}) {
  const layout = resolveLayout(layoutInput);
  const list = (Array.isArray(materials) ? materials : []).slice(0, layout.max);
  const flagEnabled = isThumbnailFlagEnabled(env);
  const useProvider = flagEnabled && typeof thumbnailProvider === "function";

  const defs = [];
  const cards = [];
  const cardMetadata = [];

  for (let index = 0; index < list.length; index += 1) {
    const material = list[index];
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    let thumbnailUrl = null;
    let sourceTag = "procedural_svg_pattern";
    if (useProvider) {
      const signature = materialSignature(material);
      try {
        const result = await thumbnailProvider({
          materialSignature: signature,
          label: material.name,
          application: material.application || "",
          textureKind: materialTextureKind(material.name, material.application),
          hex:
            material.hexColor ||
            material.hex ||
            inferMaterialHex(material.name, index, material.application),
        });
        if (
          result &&
          typeof result === "object" &&
          typeof result.url === "string" &&
          result.url.trim()
        ) {
          thumbnailUrl = result.url.trim();
          sourceTag = "ai_texture_thumbnail";
        }
      } catch {
        // Swallow — procedural fallback is already deterministic and safe.
        thumbnailUrl = null;
        sourceTag = "procedural_svg_pattern";
      }
    }
    const built = buildSingleCard({
      material,
      index,
      layout: { ...layout, col, row },
      sourceTag,
      thumbnailUrl,
    });
    defs.push(built.pattern.svg);
    cards.push(built.cardSvg);
    cardMetadata.push(built.metadata);
  }

  return {
    defs: defs.join(""),
    cards: cards.join("\n"),
    cardMetadata,
  };
}

export {
  CANONICAL_TEXTURE_KINDS,
  MATERIAL_KEYWORD_MAP,
  CANONICAL_FALLBACK_MATERIALS,
  KIND_HEX,
  KIND_APPLICATION,
  KIND_CATEGORY,
};
