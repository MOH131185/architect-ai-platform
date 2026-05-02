/**
 * Project Type Auto-Detection
 *
 * Deterministic keyword classifier that suggests a `category:subType` pair
 * from the user's textual brief / title / description on the wizard's main
 * entry. The output is purely a *suggestion* — the wizard still requires
 * an explicit user selection before generation. Confidence is scored from
 * the matched keywords' total weight relative to the text length so that
 * a single drive-by keyword in a long unrelated brief does not produce a
 * false-positive suggestion.
 *
 * No LLM call — this runs synchronously in the browser and is safe to
 * invoke on every keystroke (the wizard debounces, but the function itself
 * is cheap).
 *
 * IMPORTANT: this only proposes types that are currently `enabledInUi` in
 * the project type support registry. We never suggest a disabled type
 * because doing so would surface a non-actionable chip to the user.
 */

import { getProjectTypeSupport } from "../services/project/projectTypeSupportRegistry.js";

const MIN_CONFIDENCE_TO_SURFACE = 0.5;

// Keyword tables. Each entry maps a `categoryId:subtypeId` to a list of
// `{ keyword, weight }`. Higher weight = stronger signal; multiple
// matches accumulate. Keywords match whole words (case-insensitive,
// also tolerating short suffixes like "house" → "houses").
//
// Hand-curated against the registry's enabled types. When a new type is
// enabled in the registry, add a row here so the auto-detector can suggest
// it. When a type is disabled, leaving the row in place is harmless — the
// helper filters disabled suggestions out at lookup time.
const KEYWORDS = Object.freeze({
  "residential:detached-house": [
    { keyword: "detached", weight: 1.0 },
    { keyword: "single family", weight: 0.9 },
    { keyword: "family home", weight: 0.7 },
    { keyword: "single-family", weight: 0.9 },
    { keyword: "standalone home", weight: 0.7 },
  ],
  "residential:semi-detached-house": [
    { keyword: "semi-detached", weight: 1.0 },
    { keyword: "semi detached", weight: 1.0 },
    { keyword: "semi", weight: 0.4 },
  ],
  "residential:terraced-house": [
    { keyword: "terraced", weight: 1.0 },
    { keyword: "terrace house", weight: 0.9 },
    { keyword: "row house", weight: 0.7 },
    { keyword: "townhouse", weight: 0.6 },
  ],
  "residential:villa": [
    { keyword: "villa", weight: 1.0 },
    { keyword: "estate", weight: 0.4 },
  ],
  "residential:cottage": [
    { keyword: "cottage", weight: 1.0 },
    { keyword: "country house", weight: 0.5 },
  ],
  "residential:apartment-building": [
    { keyword: "apartment", weight: 1.0 },
    { keyword: "flat block", weight: 0.9 },
    { keyword: "block of flats", weight: 0.9 },
    { keyword: "condo", weight: 0.7 },
  ],
  "residential:multi-family": [
    { keyword: "multi-family", weight: 1.0 },
    { keyword: "multi family", weight: 1.0 },
    { keyword: "multi-unit", weight: 0.8 },
  ],
  "residential:duplex": [{ keyword: "duplex", weight: 1.0 }],
  "commercial:office": [
    { keyword: "office", weight: 1.0 },
    { keyword: "co-working", weight: 0.9 },
    { keyword: "coworking", weight: 0.9 },
    { keyword: "workplace", weight: 0.6 },
    { keyword: "workspace", weight: 0.6 },
  ],
  "healthcare:clinic": [
    { keyword: "clinic", weight: 1.0 },
    { keyword: "surgery", weight: 0.7 },
    { keyword: "medical centre", weight: 0.9 },
    { keyword: "medical center", weight: 0.9 },
    { keyword: "gp practice", weight: 0.8 },
  ],
  "healthcare:hospital": [{ keyword: "hospital", weight: 1.0 }],
  "education:school": [
    { keyword: "school", weight: 1.0 },
    { keyword: "academy", weight: 0.7 },
    { keyword: "primary", weight: 0.6 },
    { keyword: "secondary school", weight: 0.9 },
  ],
  "hospitality:hotel": [
    { keyword: "hotel", weight: 1.0 },
    { keyword: "boutique hotel", weight: 1.0 },
  ],
  "hospitality:resort": [{ keyword: "resort", weight: 1.0 }],
  "hospitality:guest-house": [
    { keyword: "guest house", weight: 1.0 },
    { keyword: "guesthouse", weight: 1.0 },
    { keyword: "bed and breakfast", weight: 0.9 },
    { keyword: "b&b", weight: 0.8 },
  ],
  "industrial:warehouse": [
    { keyword: "warehouse", weight: 1.0 },
    { keyword: "logistics", weight: 0.6 },
    { keyword: "storage facility", weight: 0.7 },
  ],
  "industrial:manufacturing": [
    { keyword: "manufacturing", weight: 1.0 },
    { keyword: "factory", weight: 0.9 },
    { keyword: "production plant", weight: 0.8 },
  ],
  "industrial:workshop": [
    { keyword: "workshop", weight: 1.0 },
    { keyword: "maker space", weight: 0.7 },
  ],
  "cultural:museum": [
    { keyword: "museum", weight: 1.0 },
    { keyword: "gallery", weight: 0.7 },
  ],
  "cultural:library": [{ keyword: "library", weight: 1.0 }],
  "cultural:theatre": [
    { keyword: "theatre", weight: 1.0 },
    { keyword: "theater", weight: 1.0 },
    { keyword: "auditorium", weight: 0.7 },
  ],
  "government:town-hall": [
    { keyword: "town hall", weight: 1.0 },
    { keyword: "civic centre", weight: 0.8 },
    { keyword: "civic center", weight: 0.8 },
  ],
  "government:police": [{ keyword: "police station", weight: 1.0 }],
  "government:fire-station": [{ keyword: "fire station", weight: 1.0 }],
  "religious:mosque": [
    { keyword: "mosque", weight: 1.0 },
    { keyword: "masjid", weight: 1.0 },
  ],
  "religious:church": [
    { keyword: "church", weight: 1.0 },
    { keyword: "chapel", weight: 0.7 },
  ],
  "religious:temple": [{ keyword: "temple", weight: 1.0 }],
  "recreation:sports-center": [
    { keyword: "sports centre", weight: 1.0 },
    { keyword: "sports center", weight: 1.0 },
    { keyword: "leisure centre", weight: 0.9 },
  ],
  "recreation:gym": [
    { keyword: "gym", weight: 1.0 },
    { keyword: "fitness studio", weight: 0.9 },
    { keyword: "fitness centre", weight: 0.8 },
  ],
  "recreation:pool": [
    { keyword: "swimming pool", weight: 1.0 },
    { keyword: "lido", weight: 0.7 },
  ],
});

function normaliseText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsKeyword(haystack, keyword) {
  if (!haystack || !keyword) return false;
  const needle = normaliseText(keyword);
  if (!needle) return false;
  // Word-boundary match. The replacement above turns `&` into a literal
  // character, so escape regex specials.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|\\s)${escaped}(s|es)?(\\s|$)`, "i");
  return pattern.test(haystack);
}

/**
 * Run the keyword classifier against a brief / title / description.
 *
 * @param {object} params
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @param {string} [params.brief]
 * @param {string} [params.customNotes]
 * @returns {{
 *   category: string,
 *   subType: string,
 *   confidence: number,
 *   matchedKeywords: string[],
 *   ranking: Array<{ key: string, score: number }>,
 * } | null}
 *   Returns the highest-scoring `enabledInUi` suggestion, or null when no
 *   suggestion clears `MIN_CONFIDENCE_TO_SURFACE` or when the text is
 *   empty.
 */
export function detectProjectTypeFromBrief({
  title = "",
  description = "",
  brief = "",
  customNotes = "",
} = {}) {
  const haystack = normaliseText(
    [title, description, brief, customNotes].filter(Boolean).join(" "),
  );
  if (!haystack) return null;

  const ranking = [];
  for (const [key, keywords] of Object.entries(KEYWORDS)) {
    let score = 0;
    const matched = [];
    for (const { keyword, weight } of keywords) {
      if (containsKeyword(haystack, keyword)) {
        score += weight;
        matched.push(keyword);
      }
    }
    if (score > 0) {
      ranking.push({ key, score, matched });
    }
  }

  if (ranking.length === 0) return null;
  ranking.sort((a, b) => b.score - a.score);

  // Length normaliser — divides by sqrt(words) so a long brief does not
  // dilute a strong signal too aggressively. Single strong keyword in a
  // short brief wins.
  const wordCount = haystack.split(" ").length;
  const lengthFactor = Math.max(1, Math.sqrt(Math.min(wordCount, 60) / 6));
  const top = ranking[0];

  // Disambiguation gate: when the second-best is within 0.2 of the top,
  // the brief is genuinely ambiguous. Refuse to pick rather than guess.
  const second = ranking[1];
  if (second && top.score - second.score < 0.2 && top.score < 1.5) {
    return null;
  }

  const confidence = Math.min(1, top.score / lengthFactor);
  if (confidence < MIN_CONFIDENCE_TO_SURFACE) return null;

  const [category, subType] = top.key.split(":");

  // Final filter: the suggestion must correspond to a currently-enabled
  // entry in the support registry. If the type was deactivated upstream
  // we silently drop the suggestion rather than surfacing a chip the
  // user cannot act on.
  const support = getProjectTypeSupport(category, subType);
  if (!support || support.enabledInUi !== true) return null;

  return {
    category,
    subType,
    confidence,
    matchedKeywords: top.matched,
    ranking: ranking.map((entry) => ({ key: entry.key, score: entry.score })),
  };
}

export const __testing = Object.freeze({
  KEYWORDS,
  MIN_CONFIDENCE_TO_SURFACE,
  containsKeyword,
  normaliseText,
});

export default detectProjectTypeFromBrief;
