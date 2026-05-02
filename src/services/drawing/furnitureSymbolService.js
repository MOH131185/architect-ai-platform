/**
 * Phase 3 — Deterministic furniture symbol library for floor-plan polish.
 *
 * Pure SVG primitives, no geometry mutation, no external state. Each symbol
 * scales to the available room rectangle and falls back to a no-op when the
 * room is too small for a meaningful glyph.
 *
 * Symbol selection is keyed by `room.semantic_type` when present, otherwise
 * by lowercase substring match against `room.name`. Same inputs → same SVG
 * markup, so the geometryHash boundary is preserved (renderers consume only;
 * never write back into compiledProject).
 *
 * Symbol set:
 *   sofa, bed, dining_table, kitchen_counter, kitchen_island,
 *   wc, basin, stair_arrow
 */

const TOKEN_PATTERNS = Object.freeze([
  { token: "stair_arrow", pattern: /\b(stair|stairs|landing)\b/i },
  { token: "wc", pattern: /\b(wc|toilet|cloak|powder)\b/i },
  { token: "basin", pattern: /\b(basin|wash|vanity|hand\s*wash)\b/i },
  { token: "kitchen_island", pattern: /\bisland\b/i },
  { token: "kitchen_counter", pattern: /\bkitchen|utility|pantry\b/i },
  { token: "dining_table", pattern: /\bdining\b/i },
  { token: "bed", pattern: /\bbed(room)?|master\b/i },
  { token: "sofa", pattern: /\b(living|lounge|sitting|family|reception)\b/i },
  // Bath has both basin + WC + tub; we render the bath block elsewhere
  // (existing renderer covers it). Skipping here to avoid double-render.
]);

const KNOWN_TOKENS = Object.freeze(
  new Set(TOKEN_PATTERNS.map((entry) => entry.token)),
);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value, precision = 2) {
  return num(value).toFixed(precision);
}

/**
 * Resolve the symbol token for a room. Honors explicit `room.semantic_type`
 * first (e.g. "kitchen_island"), falls back to fuzzy name matching.
 */
export function resolveFurnitureToken(room = {}) {
  const explicit = String(room.semantic_type || room.semanticType || "")
    .trim()
    .toLowerCase();
  if (explicit && KNOWN_TOKENS.has(explicit)) return explicit;
  const haystack = String(room.name || room.id || "").toLowerCase();
  if (!haystack) return null;
  for (const entry of TOKEN_PATTERNS) {
    if (entry.pattern.test(haystack)) return entry.token;
  }
  return null;
}

function sofaSymbol(rect, theme) {
  const sofaW = Math.min(rect.width * 0.46, 86);
  const sofaH = Math.min(rect.height * 0.22, 30);
  const x = rect.x + Math.max(8, rect.width * 0.06);
  const y = rect.y + Math.max(8, rect.height * 0.08);
  const cushionH = Math.max(6, sofaH * 0.34);
  const armW = Math.max(4, sofaW * 0.06);
  // Sofa body + back cushion + side arms + occasional table
  return `<g class="furniture-sofa">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(sofaW)}" height="${fmt(sofaH)}" fill="none" stroke="${theme.lineLight}" stroke-width="0.95" rx="5" ry="5"/>
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(sofaW)}" height="${fmt(cushionH)}" fill="none" stroke="${theme.guide}" stroke-width="0.8" rx="4" ry="4"/>
    <rect x="${fmt(x)}" y="${fmt(y + cushionH + 1)}" width="${fmt(armW)}" height="${fmt(sofaH - cushionH - 2)}" fill="none" stroke="${theme.guide}" stroke-width="0.7"/>
    <rect x="${fmt(x + sofaW - armW)}" y="${fmt(y + cushionH + 1)}" width="${fmt(armW)}" height="${fmt(sofaH - cushionH - 2)}" fill="none" stroke="${theme.guide}" stroke-width="0.7"/>
    <rect x="${fmt(rect.x + rect.width * 0.54)}" y="${fmt(rect.y + rect.height * 0.55)}" width="${fmt(Math.min(28, rect.width * 0.2))}" height="${fmt(Math.min(18, rect.height * 0.15))}" fill="none" stroke="${theme.guide}" stroke-width="0.7" rx="3" ry="3"/>
  </g>`;
}

function bedSymbol(rect, theme) {
  const bedW = Math.min(rect.width * 0.5, 80);
  const bedH = Math.min(rect.height * 0.34, 50);
  const x = rect.x + Math.max(8, rect.width * 0.08);
  const y = rect.y + Math.max(8, rect.height * 0.08);
  const pillowH = Math.max(6, bedH * 0.18);
  return `<g class="furniture-bed">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(bedW)}" height="${fmt(bedH)}" fill="none" stroke="${theme.lineLight}" stroke-width="0.95" rx="4" ry="4"/>
    <rect x="${fmt(x + 3)}" y="${fmt(y + 3)}" width="${fmt(bedW - 6)}" height="${fmt(pillowH)}" fill="none" stroke="${theme.guide}" stroke-width="0.7" rx="2" ry="2"/>
    <line x1="${fmt(x + bedW * 0.5)}" y1="${fmt(y + pillowH + 5)}" x2="${fmt(x + bedW * 0.5)}" y2="${fmt(y + bedH - 4)}" stroke="${theme.guide}" stroke-width="0.7"/>
    <rect x="${fmt(x + bedW + 6)}" y="${fmt(y)}" width="${fmt(Math.min(16, rect.width * 0.1))}" height="${fmt(Math.min(20, rect.height * 0.18))}" fill="none" stroke="${theme.guide}" stroke-width="0.7"/>
  </g>`;
}

function diningTableSymbol(rect, theme) {
  const tableW = Math.min(rect.width * 0.42, 70);
  const tableH = Math.min(rect.height * 0.26, 28);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const x = cx - tableW / 2;
  const y = cy - tableH / 2;
  const chairR = Math.min(4.2, Math.min(rect.width, rect.height) * 0.04);
  const chairs = [];
  // 2 chairs along top + 2 along bottom for a rectangular table.
  for (const t of [0.25, 0.75]) {
    chairs.push(
      `<circle cx="${fmt(x + tableW * t)}" cy="${fmt(y - chairR - 2)}" r="${fmt(chairR, 1)}" fill="none" stroke="${theme.guide}" stroke-width="0.7"/>`,
      `<circle cx="${fmt(x + tableW * t)}" cy="${fmt(y + tableH + chairR + 2)}" r="${fmt(chairR, 1)}" fill="none" stroke="${theme.guide}" stroke-width="0.7"/>`,
    );
  }
  return `<g class="furniture-dining">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(tableW)}" height="${fmt(tableH)}" fill="none" stroke="${theme.lineLight}" stroke-width="0.95" rx="3" ry="3"/>
    ${chairs.join("")}
  </g>`;
}

function kitchenCounterSymbol(rect, theme) {
  const counterDepth = Math.min(rect.height * 0.16, 18);
  const x = rect.x + 6;
  const y = rect.y + 6;
  return `<g class="furniture-kitchen-counter">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(rect.width - 12)}" height="${fmt(counterDepth)}" fill="none" stroke="${theme.lineLight}" stroke-width="0.95"/>
    <line x1="${fmt(x + rect.width * 0.32)}" y1="${fmt(y)}" x2="${fmt(x + rect.width * 0.32)}" y2="${fmt(y + counterDepth)}" stroke="${theme.guide}" stroke-width="0.7"/>
    <line x1="${fmt(x + rect.width * 0.62)}" y1="${fmt(y)}" x2="${fmt(x + rect.width * 0.62)}" y2="${fmt(y + counterDepth)}" stroke="${theme.guide}" stroke-width="0.7"/>
  </g>`;
}

function kitchenIslandSymbol(rect, theme) {
  // Use central area; works for both dedicated island rooms and kitchens.
  const islandW = Math.min(rect.width * 0.5, 92);
  const islandH = Math.min(rect.height * 0.22, 26);
  const x = rect.x + (rect.width - islandW) / 2;
  const y = rect.y + rect.height * 0.5 - islandH / 2;
  return `<g class="furniture-kitchen-island">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(islandW)}" height="${fmt(islandH)}" fill="none" stroke="${theme.lineLight}" stroke-width="1.05" rx="3" ry="3"/>
    <line x1="${fmt(x + islandW * 0.5)}" y1="${fmt(y)}" x2="${fmt(x + islandW * 0.5)}" y2="${fmt(y + islandH)}" stroke="${theme.guide}" stroke-width="0.7"/>
  </g>`;
}

function wcSymbol(rect, theme) {
  const w = Math.min(rect.width * 0.36, 22);
  const h = Math.min(rect.height * 0.34, 30);
  const x = rect.x + 8;
  const y = rect.y + 8;
  return `<g class="furniture-wc">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(Math.max(6, h * 0.3))}" fill="none" stroke="${theme.lineLight}" stroke-width="0.9" rx="2" ry="2"/>
    <rect x="${fmt(x + 1)}" y="${fmt(y + h * 0.3 + 1)}" width="${fmt(w - 2)}" height="${fmt(h - h * 0.3 - 2)}" fill="none" stroke="${theme.guide}" stroke-width="0.85" rx="${fmt(w / 3, 1)}" ry="${fmt(w / 3, 1)}"/>
  </g>`;
}

function basinSymbol(rect, theme) {
  const w = Math.min(rect.width * 0.32, 22);
  const h = Math.min(rect.height * 0.18, 14);
  const x = rect.x + rect.width - w - 8;
  const y = rect.y + 8;
  return `<g class="furniture-basin">
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="${theme.lineLight}" stroke-width="0.9" rx="2" ry="2"/>
    <rect x="${fmt(x + 2)}" y="${fmt(y + 2)}" width="${fmt(w - 4)}" height="${fmt(h - 4)}" fill="none" stroke="${theme.guide}" stroke-width="0.7" rx="${fmt(Math.min(w, h) / 4, 1)}" ry="${fmt(Math.min(w, h) / 4, 1)}"/>
  </g>`;
}

function stairArrowSymbol(rect, theme) {
  // Lightweight UP-arrow centered on the room. Direction is conventional
  // (towards top of plan) — when the actual stair vector is unknown we still
  // give a clear visual cue that this is a stair.
  const cx = rect.x + rect.width / 2;
  const arrowH = Math.min(rect.height * 0.5, 60);
  const arrowW = Math.min(rect.width * 0.3, 28);
  const tipY = rect.y + 10;
  const tailY = tipY + arrowH;
  const headW = arrowW * 0.6;
  return `<g class="furniture-stair-arrow">
    <line x1="${fmt(cx)}" y1="${fmt(tailY)}" x2="${fmt(cx)}" y2="${fmt(tipY + 6)}" stroke="${theme.lineMuted}" stroke-width="1.1"/>
    <polyline points="${fmt(cx - headW / 2)},${fmt(tipY + 12)} ${fmt(cx)},${fmt(tipY)} ${fmt(cx + headW / 2)},${fmt(tipY + 12)}" fill="none" stroke="${theme.lineMuted}" stroke-width="1.1" stroke-linejoin="miter"/>
    <text x="${fmt(cx + headW / 2 + 4)}" y="${fmt(tipY + 14)}" font-size="9" font-family="Arial, sans-serif" fill="${theme.lineMuted}">UP</text>
  </g>`;
}

const SYMBOL_RENDERERS = Object.freeze({
  sofa: sofaSymbol,
  bed: bedSymbol,
  dining_table: diningTableSymbol,
  kitchen_counter: kitchenCounterSymbol,
  kitchen_island: kitchenIslandSymbol,
  wc: wcSymbol,
  basin: basinSymbol,
  stair_arrow: stairArrowSymbol,
});

/**
 * Render a deterministic furniture symbol for a room rectangle. Returns an
 * empty string when no token resolves or the rect is too small. The caller
 * (svgPlanRenderer) decides whether to wrap the markup in a group; this
 * helper returns the inner SVG fragment only.
 */
export function renderFurnitureSymbol(room, rect, theme) {
  if (!rect || !theme) return "";
  if (rect.width < 60 || rect.height < 50) return "";
  const token = resolveFurnitureToken(room);
  if (!token) return "";
  const renderer = SYMBOL_RENDERERS[token];
  if (!renderer) return "";
  try {
    return renderer(rect, theme);
  } catch {
    return "";
  }
}

export const FURNITURE_TOKENS = Object.freeze(Array.from(KNOWN_TOKENS));
export const FURNITURE_SYMBOL_VERSION = "phase3-furniture-symbol-v1";
