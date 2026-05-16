/**
 * Track 1 (Phase 1): blocker categorisation for the A1 export QA fold.
 *
 * Categorises A1 export blockers so the UI surfaces every failure as
 * `{category} · {code}: {message}` instead of one generic line, and so
 * `buildA1ExportQaFromGate` can decide whether a degraded PDF is safe to
 * emit. Categories drive two downstream behaviours:
 *
 *   - `degradedExport` = true iff every blocker has a category in
 *     `DEGRADABLE_BLOCKER_CATEGORIES`. The PDF artifact is still produced
 *     and stamped "PRELIMINARY — QA WARNINGS"; the ZIP/handoff path stays
 *     open.
 *   - `geometry` and `authority` blockers continue to hard-block —
 *     shipping a sheet with unauthoritative geometry would leak it
 *     downstream into DXF/IFC/GLB which all key off the same
 *     `geometryHash`.
 *
 * This module is intentionally a leaf with no other imports so it can be
 * unit-tested and consumed without dragging the rest of the A1ExportGate
 * dependency graph along.
 *
 * @module services/qa/blockerCategories
 */

export const BLOCKER_CATEGORIES = Object.freeze({
  AUTHORITY: "authority",
  GEOMETRY: "geometry",
  READABILITY: "readability",
  GRAPHIC: "graphic",
  UNKNOWN: "unknown",
});

export const DEGRADABLE_BLOCKER_CATEGORIES = Object.freeze(
  new Set([BLOCKER_CATEGORIES.GRAPHIC, BLOCKER_CATEGORIES.READABILITY]),
);

// Ordered prefix → category list. Longest / most-specific prefixes first so
// `MISSING_CANONICAL_3D_RENDERS` matches before `MISSING_`. The bare
// `PANEL_QA_FAILED` synthetic blocker is handled separately below because it
// carries a subtype string that distinguishes geometry vs readability.
const CATEGORY_PREFIX_MAP = Object.freeze([
  // authority — geometry/identity/integrity invariants
  ["MISSING_CANONICAL_3D_RENDERS", BLOCKER_CATEGORIES.AUTHORITY],
  ["CANONICAL_3D_VALIDATION_FAILED", BLOCKER_CATEGORIES.AUTHORITY],
  ["MISSING_CANONICAL_CONTROL", BLOCKER_CATEGORIES.AUTHORITY],
  ["MISSING_CANONICAL_PACK", BLOCKER_CATEGORIES.AUTHORITY],
  ["MISSING_REQUIRED_PANEL", BLOCKER_CATEGORIES.AUTHORITY],
  ["MISSING_PANELS", BLOCKER_CATEGORIES.AUTHORITY],
  ["INVALID_PANELS_FORMAT", BLOCKER_CATEGORIES.AUTHORITY],
  ["EMPTY_PANELS", BLOCKER_CATEGORIES.AUTHORITY],
  ["COMPILED_PROJECT_MISSING", BLOCKER_CATEGORIES.AUTHORITY],
  ["GEOMETRY_HASH_MISSING", BLOCKER_CATEGORIES.AUTHORITY],
  ["GEOMETRY_SIGNATURE_FAILED", BLOCKER_CATEGORIES.AUTHORITY],
  ["INTEGRITY_", BLOCKER_CATEGORIES.AUTHORITY],
  // geometry — cross-view consistency / visual divergence / panel geometry
  ["EDGE_CONSISTENCY_FAILED", BLOCKER_CATEGORIES.GEOMETRY],
  ["VISUAL_CONSISTENCY_FAILED", BLOCKER_CATEGORIES.GEOMETRY],
  ["CROSS_VIEW_", BLOCKER_CATEGORIES.GEOMETRY],
  ["PANEL_GEOMETRY_", BLOCKER_CATEGORIES.GEOMETRY],
  // readability — text proof / tofu / glyph integrity
  ["TEXT_PROOF_", BLOCKER_CATEGORIES.READABILITY],
  ["GLYPH_INTEGRITY_", BLOCKER_CATEGORIES.READABILITY],
  ["FONT_", BLOCKER_CATEGORIES.READABILITY],
  // graphic — sanity / layout heuristics
  ["RENDER_SANITY_", BLOCKER_CATEGORIES.GRAPHIC],
  ["LAYOUT_", BLOCKER_CATEGORIES.GRAPHIC],
  ["OCCUPANCY_", BLOCKER_CATEGORIES.GRAPHIC],
  ["THIN_STRIP_", BLOCKER_CATEGORIES.GRAPHIC],
]);

// Hard categories are non-softenable: a blocker whose CODE derives to
// `authority` or `geometry` must keep that category even if the caller
// supplied a softer `category` field. This guards against misconfigured /
// adversarial inputs like `{code: "GEOMETRY_HASH_MISSING", category:
// "graphic"}` that would otherwise route through the degradedExport path
// and ship unauthoritative geometry. Soft codes (`graphic`, `readability`,
// `unknown`) accept caller-supplied overrides because callers may legitimately
// want to MAKE a soft code stricter (fail closed) or label a code the prefix
// map doesn't yet know.
const HARD_CATEGORIES = Object.freeze(
  new Set([BLOCKER_CATEGORIES.AUTHORITY, BLOCKER_CATEGORIES.GEOMETRY]),
);

const VALID_CATEGORIES = Object.freeze(
  new Set(Object.values(BLOCKER_CATEGORIES)),
);

function deriveCategoryFromText(text) {
  if (!text) return BLOCKER_CATEGORIES.UNKNOWN;
  // PANEL_QA_FAILED carries an optional subtype after `:` — :geometry_* /
  // :alignment_* / :hash_* route to geometry; :readability_* / :text_* /
  // :glyph_* / :label_* route to readability. The bare synthetic blocker
  // emitted by `buildA1ExportQaFromGate` when the panel QA reducer reports
  // "fail" carries no subtype, so we cannot tell whether the failure is
  // cosmetic or structural — fall through to UNKNOWN (non-degradable) so
  // we fail closed.
  if (/^PANEL_QA_FAILED/.test(text)) {
    if (
      /^PANEL_QA_FAILED:(?:geometry|alignment|hash|signature|projection)/i.test(
        text,
      )
    ) {
      return BLOCKER_CATEGORIES.GEOMETRY;
    }
    if (
      /^PANEL_QA_FAILED:(?:readability|text|glyph|label|font|caption)/i.test(
        text,
      )
    ) {
      return BLOCKER_CATEGORIES.READABILITY;
    }
    return BLOCKER_CATEGORIES.UNKNOWN;
  }
  for (const [prefix, category] of CATEGORY_PREFIX_MAP) {
    if (text.startsWith(prefix)) return category;
  }
  return BLOCKER_CATEGORIES.UNKNOWN;
}

/**
 * Map an A1 export blocker (string `"PREFIX: detail"` or structured object
 * with `.code` / `.category`) to a category. Resolution rules:
 *
 *   1. Derive a category from the blocker's code/message via the prefix map.
 *   2. If the derived category is HARD (authority/geometry), return it —
 *      a caller-supplied `category` field can NEVER soften a hard code.
 *   3. Else if a caller-supplied `category` is set and recognised, return
 *      it (allows callers to label unknown codes or fail closed on soft
 *      codes by promoting them to authority/geometry).
 *   4. Else return the derived category (may be UNKNOWN — treated as
 *      non-degradable downstream, so we fail closed for unrecognised codes).
 *
 * @param {string|{code?: string, category?: string}} blocker
 * @returns {string} one of BLOCKER_CATEGORIES.*
 */
export function categorizeBlocker(blocker) {
  if (blocker == null) return BLOCKER_CATEGORIES.UNKNOWN;

  let explicit = null;
  let source = blocker;
  if (typeof blocker === "object") {
    if (typeof blocker.category === "string") {
      const cleaned = blocker.category.trim();
      if (cleaned.length > 0 && VALID_CATEGORIES.has(cleaned)) {
        explicit = cleaned;
      }
    }
    source = blocker.code || blocker.reason || blocker.message || "";
  }
  const text = String(source || "").trim();
  const derived = deriveCategoryFromText(text);

  // Step 2: hard-category codes are authoritative. Even if the caller
  // claimed a softer category, we never honour it for codes that derive
  // to authority/geometry — that's the safety invariant the Codex audit
  // flagged as a Phase 1 blocker.
  if (HARD_CATEGORIES.has(derived)) return derived;

  // Step 3: trust an explicit, valid caller category for soft / unknown
  // codes (lets callers label new codes the prefix map doesn't know, and
  // lets them promote a soft code to a hard one when they want to fail
  // closed).
  if (explicit) return explicit;

  // Step 4: derived (graphic / readability / unknown).
  return derived;
}

/**
 * True when every blocker has a category that may still emit a stamped
 * PDF. Empty list → false (no blockers means a clean export, not a
 * degraded one).
 *
 * @param {Array<string|{code?: string, category?: string}>} blockers
 * @returns {boolean}
 */
export function blockersAreDegradable(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return false;
  return blockers.every((b) =>
    DEGRADABLE_BLOCKER_CATEGORIES.has(categorizeBlocker(b)),
  );
}
