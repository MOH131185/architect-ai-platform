/**
 * Postcode → region detection
 *
 * The HM Land Registry INSPIRE Index Polygons dataset only covers England
 * and Wales. Scotland uses RoS Cadastral Map (separate API, separate
 * licence) and Northern Ireland uses LPS (also separate). To avoid noisy
 * fallback fetches we gate the INSPIRE source by country before issuing
 * the lookup.
 *
 * The detector uses the postcode's outward-code prefix (e.g. "BT", "EH")
 * when available, and falls back to a coarse England/Wales lat/lng bbox
 * when the postcode is missing or malformed.
 *
 * Pure helper, no network I/O. Intended for both the server proxy and
 * any client-side gating that wants to avoid making the proxy call when
 * the address is clearly outside coverage.
 */

// UK postcode area prefixes we explicitly EXCLUDE from INSPIRE coverage.
// Sources: Royal Mail postcode area boundaries; HM Land Registry's INSPIRE
// dataset README ("England and Wales" only).
const EXCLUDED_POSTCODE_AREAS = Object.freeze(
  new Set([
    // Northern Ireland
    "BT",
    // Scotland — full set of Royal Mail postcode areas
    "AB",
    "DD",
    "DG",
    "EH",
    "FK",
    "G",
    "HS",
    "IV",
    "KA",
    "KW",
    "KY",
    "ML",
    "PA",
    "PH",
    "TD",
    "ZE",
    // Crown dependencies — separate land registries, not in INSPIRE
    "IM", // Isle of Man
    "JE", // Jersey
    "GY", // Guernsey
  ]),
);

// Welsh postcode areas (within INSPIRE coverage). We don't use this list to
// gate inclusion (everything not excluded is included), but it documents the
// Welsh prefixes for clarity and for any future per-country routing.
export const WELSH_POSTCODE_AREAS = Object.freeze(
  new Set(["CF", "LD", "LL", "NP", "SA", "SY"]),
);

// Coarse bounding box for England + Wales (used when postcode is absent).
// North: ~55.81° (Berwick-upon-Tweed). South: ~49.86° (Lizard Point).
// West: ~-5.70° (just east of Pembrokeshire's St David's Head at
// -5.32°W; intentionally tight enough to exclude Dublin at -6.26°W).
// East: ~1.77° (Lowestoft).
// The box is generous on the Scottish-border side so we don't false-
// negative on Northumberland; the postcode list catches Scottish
// addresses that happen to fall inside the bbox. The west bound is the
// only side where Welsh coverage and Irish exclusion are in tension —
// Pembrokeshire is the westernmost UK land here so anywhere further
// west is reliably non-UK.
const ENGLAND_WALES_BBOX = Object.freeze({
  minLat: 49.86,
  maxLat: 55.81,
  minLng: -5.7,
  maxLng: 1.77,
});

/**
 * Extract the postcode "area" (the leading 1–2 letters of the outward
 * code). Returns the uppercased area or null when the input does not
 * look like a UK postcode.
 *
 * Examples: "DN15 8BQ" → "DN", "EH8 9YL" → "EH", "G4 0AA" → "G",
 * "75001 Paris" → null.
 */
export function extractPostcodeArea(postcode) {
  if (typeof postcode !== "string") return null;
  const trimmed = postcode.trim().toUpperCase();
  if (!trimmed) return null;
  // UK outward codes: 1 or 2 letters then a digit. We only need the
  // letters at the start.
  const match = trimmed.match(/^([A-Z]{1,2})\s*\d/);
  if (!match) return null;
  return match[1];
}

/**
 * Returns true when the address is in England or Wales (i.e. inside
 * INSPIRE coverage). When `postcode` is provided it is the source of
 * truth; otherwise we fall back to a coarse lat/lng bounding box.
 *
 * Returns false for missing inputs (we can't be sure). Returns false for
 * Scottish, Northern Irish, and non-UK postcodes / coordinates.
 */
export function isEnglandOrWales({
  postcode = null,
  lat = null,
  lng = null,
} = {}) {
  const area = extractPostcodeArea(postcode);
  if (area) {
    return !EXCLUDED_POSTCODE_AREAS.has(area);
  }
  // No usable postcode — try the bbox.
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const { minLat, maxLat, minLng, maxLng } = ENGLAND_WALES_BBOX;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
  }
  return false;
}

export const __testing = Object.freeze({
  EXCLUDED_POSTCODE_AREAS,
  ENGLAND_WALES_BBOX,
});

export default isEnglandOrWales;
