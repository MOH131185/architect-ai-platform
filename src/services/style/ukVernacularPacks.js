/**
 * UK Regional Vernacular Style Packs
 *
 * Pure-data registry mapping a UK location (lat/lng + postcode) to a regional
 * vernacular style pack. Each pack carries materials, facade language, roof
 * language, fenestration rhythm, plus a descriptive narrative and historical
 * period — directly addressing the Berkeley ML-for-architecture review's §4.3
 * recommendation to "enrich datasets with qualitative elements, such as
 * descriptive narratives and historical contexts" and to use locally-sourced
 * data as a transfer-learning-by-curation strategy that mitigates bias toward
 * dominant metropolitan datasets.
 *
 * Resolution order:
 *   1. Postcode area prefix (deterministic, exact lookup).
 *   2. Lat/lng inside-bbox match (geometric fallback).
 *   3. uk-generic default.
 *
 * Adding a new pack:
 *   - Define it in PACKS with the full key set.
 *   - Add postcode area prefixes to POSTCODE_PREFIX_MAP.
 *   - (Optional) add a lat/lng bbox to BBOX_MATCHERS for postcodeless inputs.
 */

const PACK_ID = Object.freeze({
  LONDON_STUCCO_TERRACE: "london-stucco-terrace",
  LONDON_VICTORIAN_TERRACE: "london-victorian-terrace",
  MANCHESTER_BACK_TO_BACK: "manchester-back-to-back",
  EDINBURGH_TENEMENT: "edinburgh-tenement",
  COTSWOLDS_COTTAGE: "cotswolds-cottage",
  UK_GENERIC: "uk-generic",
});

const PACKS = Object.freeze({
  [PACK_ID.LONDON_STUCCO_TERRACE]: {
    packId: PACK_ID.LONDON_STUCCO_TERRACE,
    label: "London stucco terrace",
    region: "London — Westminster / Kensington / Chelsea / Notting Hill",
    materials: [
      "white stucco render",
      "yellow London stock brick base",
      "natural slate roof",
      "cast iron railings",
      "painted timber sash windows",
      "York stone steps",
    ],
    facade_language: "stucco-fronted with rusticated ground floor and parapet",
    roof_language: "concealed-behind-parapet pitched slate",
    window_language:
      "tall sash windows, vertically proportioned, diminishing per floor",
    fenestration_rhythm: "regular bay rhythm with central or off-centre door",
    modernity_default: 0.3,
    parapet_default: true,
    semi_basement_default: true,
    layout_archetype: "linear_side_hall",
    descriptive_narrative:
      "Early-19th-century Regency / Italianate stucco terrace typical of Notting Hill, Belgravia, and Bayswater — white painted stucco upper floors over a rusticated yellow-brick or stucco base, a parapet concealing a slate roof, tall sash windows reducing in height with each storey, cast-iron front-area railings, and York stone front steps over a semi-basement.",
    historical_period: "Regency and early Victorian (c. 1820–1860)",
    conservation_typical: true,
    references: [
      "Westminster Conservation Area Audits",
      "RBKC Notting Hill conservation area appraisal",
    ],
  },
  [PACK_ID.LONDON_VICTORIAN_TERRACE]: {
    packId: PACK_ID.LONDON_VICTORIAN_TERRACE,
    label: "London Victorian terrace",
    region:
      "Inner / outer London — Hackney, Islington, Camden, Wandsworth, Lewisham",
    materials: [
      "yellow London stock brick",
      "red brick dressings",
      "natural slate roof",
      "painted timber sash windows",
      "tiled pathway",
      "stone or moulded brick lintels",
    ],
    facade_language:
      "exposed stock-brick with polychromatic dressings and bay windows",
    roof_language: "front-pitched slate with chimneys",
    window_language: "sash windows with stone or moulded brick lintels",
    fenestration_rhythm:
      "ground-floor bay window flanked by entrance, two windows above",
    modernity_default: 0.32,
    parapet_default: false,
    semi_basement_default: false,
    layout_archetype: "linear_side_hall",
    descriptive_narrative:
      "Mid-to-late Victorian terraced house typical of inner and outer London — yellow London stock brick walls with red-brick dressings around openings, slate roofs visible from the street, painted-timber double-hung sash windows, a ground-floor canted or square bay window, and a tessellated tile entrance path. Privately speculative housing built en masse 1860–1900.",
    historical_period: "Victorian (1837–1901)",
    conservation_typical: true,
    references: [
      "Survey of London — multiple Victorian terrace volumes",
      "London Borough conservation area appraisals",
    ],
  },
  [PACK_ID.MANCHESTER_BACK_TO_BACK]: {
    packId: PACK_ID.MANCHESTER_BACK_TO_BACK,
    label: "Manchester / Northern back-to-back",
    region:
      "Manchester, Salford, Leeds, Sheffield — industrial inner districts",
    materials: [
      "red engineering brick",
      "blue Welsh slate roof",
      "stone window sills and lintels",
      "painted timber sash windows",
      "cast iron downpipes",
    ],
    facade_language:
      "narrow plain brick frontage, no front garden, direct-to-pavement door",
    roof_language: "simple front-pitched slate, party-wall chimneys",
    window_language: "narrow sash windows with stone sills",
    fenestration_rhythm:
      "single bay per dwelling — door + window at ground, two windows above",
    modernity_default: 0.3,
    parapet_default: false,
    semi_basement_default: false,
    layout_archetype: "narrow_two_up_two_down",
    descriptive_narrative:
      "Worker housing of the 19th-century industrial north — narrow-frontage two-storey terraces in red engineering brick with blue Welsh slate roofs, plain stone sills and lintels, no front garden (door opens directly onto the pavement), and shared rear yards or alleys (ginnels). Many surviving examples are listed conservation-area stock; modern interventions favour respectful infill.",
    historical_period: "Mid-late Victorian to Edwardian (1840–1910)",
    conservation_typical: true,
    references: [
      "Manchester City Council conservation area appraisals",
      "English Heritage — Pevsner Buildings of England (Manchester volume)",
    ],
  },
  [PACK_ID.EDINBURGH_TENEMENT]: {
    packId: PACK_ID.EDINBURGH_TENEMENT,
    label: "Edinburgh sandstone tenement",
    region: "Edinburgh — New Town, Marchmont, Bruntsfield, Stockbridge",
    materials: [
      "Craigleith / Hailes sandstone ashlar",
      "natural Scotch slate",
      "painted timber sash-and-case windows",
      "cast iron railings",
      "stone string courses",
    ],
    facade_language:
      "ashlar sandstone elevation with horizontal string courses and stone cornice",
    roof_language: "slate piended or pitched with stone chimney stacks",
    window_language:
      "tall sash-and-case windows, often six-over-six panes, diminishing per floor",
    fenestration_rhythm:
      "regular paired or tripartite bays per flat, common stair central",
    modernity_default: 0.28,
    parapet_default: false,
    semi_basement_default: true,
    layout_archetype: "tenement_common_stair",
    descriptive_narrative:
      "Four-to-five-storey-plus-attic Edinburgh tenement — Craigleith or Hailes sandstone ashlar elevation, natural Scotch slate roof, tall painted-timber sash-and-case windows with twelve or six panes diminishing in height per floor, a common (shared) stair entered from the street, and basement flats below pavement level reached via a sunken area. The dominant Georgian-to-Edwardian housing form of the New Town and the late-Victorian colonies.",
    historical_period: "Georgian to Edwardian (1770–1910)",
    conservation_typical: true,
    references: [
      "City of Edinburgh Council conservation area character appraisals",
      "Historic Environment Scotland tenement guidance",
    ],
  },
  [PACK_ID.COTSWOLDS_COTTAGE]: {
    packId: PACK_ID.COTSWOLDS_COTTAGE,
    label: "Cotswolds / oolitic limestone cottage",
    region:
      "Cotswolds AONB — Gloucestershire, west Oxfordshire, north-east Somerset",
    materials: [
      "honey-coloured oolitic limestone",
      "Cotswold stone slate roof",
      "oak window frames",
      "leaded casement glass",
      "stone mullion windows",
    ],
    facade_language:
      "rough-coursed limestone walls with stone dressings and small openings",
    roof_language: "steep-pitched stone-slate with stone gables and chimneys",
    window_language:
      "stone-mullion casement windows, small panes, deep reveals",
    fenestration_rhythm:
      "asymmetric small-opening rhythm with a stone-surround front door",
    modernity_default: 0.22,
    parapet_default: false,
    semi_basement_default: false,
    layout_archetype: "central_stair_square",
    descriptive_narrative:
      "Vernacular Cotswolds cottage — coursed-rubble or rough-ashlar oolitic limestone walls in a honey-yellow tone, very steep-pitched roofs of locally quarried Cotswold stone slates that diminish in size up the slope, oak-framed leaded-light casement windows under stone mullions, gables with kneelers, and stone copings. Generally listed or in conservation areas; new build in this region must justify deviation from the local character.",
    historical_period: "17th–19th century vernacular (continuous tradition)",
    conservation_typical: true,
    references: [
      "Cotswolds AONB Local Distinctiveness and Landscape Strategy",
      "Cotswold District Council design guide",
    ],
  },
  [PACK_ID.UK_GENERIC]: {
    packId: PACK_ID.UK_GENERIC,
    label: "UK generic contextual masonry",
    region: "United Kingdom — fallback when no regional pack matches",
    materials: ["brick", "render", "natural slate", "timber boarding", "stone"],
    facade_language: "rhythmic-openings-with-solid-masonry",
    roof_language: "pitched-gable-or-hip",
    window_language: "vertical-punched-openings",
    fenestration_rhythm: "regular bay rhythm",
    modernity_default: 0.5,
    parapet_default: false,
    semi_basement_default: false,
    layout_archetype: null,
    descriptive_narrative:
      "Default UK contextual masonry pack used when no regional vernacular has been resolved. Favours weather-resistant masonry envelopes, moderate roof pitches, and contextual street rhythm without committing to a specific regional language.",
    historical_period: null,
    conservation_typical: false,
    references: [],
  },
});

const POSTCODE_PREFIX_MAP = Object.freeze({
  // London — stucco terrace heartlands (W2 Bayswater, W11 Notting Hill,
  // W8 Kensington, SW1 Belgravia, SW3 Chelsea, SW7 South Kensington)
  W2: PACK_ID.LONDON_STUCCO_TERRACE,
  W8: PACK_ID.LONDON_STUCCO_TERRACE,
  W11: PACK_ID.LONDON_STUCCO_TERRACE,
  SW1: PACK_ID.LONDON_STUCCO_TERRACE,
  SW3: PACK_ID.LONDON_STUCCO_TERRACE,
  SW5: PACK_ID.LONDON_STUCCO_TERRACE,
  SW7: PACK_ID.LONDON_STUCCO_TERRACE,
  SW10: PACK_ID.LONDON_STUCCO_TERRACE,
  // Inner / outer London Victorian terraced districts
  N1: PACK_ID.LONDON_VICTORIAN_TERRACE,
  N4: PACK_ID.LONDON_VICTORIAN_TERRACE,
  N5: PACK_ID.LONDON_VICTORIAN_TERRACE,
  N7: PACK_ID.LONDON_VICTORIAN_TERRACE,
  N16: PACK_ID.LONDON_VICTORIAN_TERRACE,
  E1: PACK_ID.LONDON_VICTORIAN_TERRACE,
  E2: PACK_ID.LONDON_VICTORIAN_TERRACE,
  E5: PACK_ID.LONDON_VICTORIAN_TERRACE,
  E8: PACK_ID.LONDON_VICTORIAN_TERRACE,
  E9: PACK_ID.LONDON_VICTORIAN_TERRACE,
  E17: PACK_ID.LONDON_VICTORIAN_TERRACE,
  NW1: PACK_ID.LONDON_VICTORIAN_TERRACE,
  NW3: PACK_ID.LONDON_VICTORIAN_TERRACE,
  NW5: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SE1: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SE15: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SE22: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW2: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW4: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW9: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW11: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW12: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW17: PACK_ID.LONDON_VICTORIAN_TERRACE,
  SW18: PACK_ID.LONDON_VICTORIAN_TERRACE,
  // Manchester / Salford / Leeds / Sheffield industrial cores
  M1: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M3: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M4: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M5: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M11: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M14: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M16: PACK_ID.MANCHESTER_BACK_TO_BACK,
  M21: PACK_ID.MANCHESTER_BACK_TO_BACK,
  LS1: PACK_ID.MANCHESTER_BACK_TO_BACK,
  LS6: PACK_ID.MANCHESTER_BACK_TO_BACK,
  LS11: PACK_ID.MANCHESTER_BACK_TO_BACK,
  S1: PACK_ID.MANCHESTER_BACK_TO_BACK,
  S2: PACK_ID.MANCHESTER_BACK_TO_BACK,
  S3: PACK_ID.MANCHESTER_BACK_TO_BACK,
  // Edinburgh tenement areas
  EH1: PACK_ID.EDINBURGH_TENEMENT,
  EH2: PACK_ID.EDINBURGH_TENEMENT,
  EH3: PACK_ID.EDINBURGH_TENEMENT,
  EH7: PACK_ID.EDINBURGH_TENEMENT,
  EH8: PACK_ID.EDINBURGH_TENEMENT,
  EH9: PACK_ID.EDINBURGH_TENEMENT,
  EH10: PACK_ID.EDINBURGH_TENEMENT,
  EH11: PACK_ID.EDINBURGH_TENEMENT,
  EH12: PACK_ID.EDINBURGH_TENEMENT,
  // Cotswolds (Gloucestershire GL50–56, Oxfordshire OX7, OX18)
  GL50: PACK_ID.COTSWOLDS_COTTAGE,
  GL51: PACK_ID.COTSWOLDS_COTTAGE,
  GL52: PACK_ID.COTSWOLDS_COTTAGE,
  GL54: PACK_ID.COTSWOLDS_COTTAGE,
  GL55: PACK_ID.COTSWOLDS_COTTAGE,
  GL56: PACK_ID.COTSWOLDS_COTTAGE,
  OX7: PACK_ID.COTSWOLDS_COTTAGE,
  OX18: PACK_ID.COTSWOLDS_COTTAGE,
});

const BBOX_MATCHERS = Object.freeze([
  // London stucco zone (Hyde Park / Bayswater / Notting Hill / Kensington)
  {
    packId: PACK_ID.LONDON_STUCCO_TERRACE,
    minLat: 51.494,
    maxLat: 51.527,
    minLng: -0.215,
    maxLng: -0.16,
  },
  // Greater London (catch-all → Victorian terrace)
  {
    packId: PACK_ID.LONDON_VICTORIAN_TERRACE,
    minLat: 51.28,
    maxLat: 51.69,
    minLng: -0.51,
    maxLng: 0.34,
  },
  // Greater Manchester
  {
    packId: PACK_ID.MANCHESTER_BACK_TO_BACK,
    minLat: 53.39,
    maxLat: 53.55,
    minLng: -2.36,
    maxLng: -2.06,
  },
  // Edinburgh
  {
    packId: PACK_ID.EDINBURGH_TENEMENT,
    minLat: 55.91,
    maxLat: 55.99,
    minLng: -3.32,
    maxLng: -3.13,
  },
  // Cotswolds AONB approximation
  {
    packId: PACK_ID.COTSWOLDS_COTTAGE,
    minLat: 51.5,
    maxLat: 52.1,
    minLng: -2.25,
    maxLng: -1.45,
  },
]);

function normalisePostcode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function postcodeAreaPrefix(postcode) {
  const norm = normalisePostcode(postcode);
  if (!norm) return "";
  // Match "<area letters><district digits>" — e.g. "W2 5SH" → "W2", "SW1A 1AA" → "SW1A".
  // We strip the inward code (last 3 chars: digit + 2 letters) by space split when present,
  // otherwise by trimming the trailing 3 chars.
  const parts = norm.split(" ");
  const outward =
    parts.length >= 2 ? parts[0] : norm.slice(0, Math.max(0, norm.length - 3));
  // Reduce "SW1A" → try SW1A first then SW1.
  return outward;
}

function lookupByPostcode(postcode) {
  const outward = postcodeAreaPrefix(postcode);
  if (!outward) return null;
  if (POSTCODE_PREFIX_MAP[outward]) return POSTCODE_PREFIX_MAP[outward];
  // Try shorter variants (SW1A → SW1)
  if (outward.length > 2) {
    const shorter = outward.replace(/[A-Z]+$/, "");
    if (shorter && POSTCODE_PREFIX_MAP[shorter])
      return POSTCODE_PREFIX_MAP[shorter];
  }
  return null;
}

function lookupByLatLng(lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return null;
  for (const matcher of BBOX_MATCHERS) {
    if (
      numLat >= matcher.minLat &&
      numLat <= matcher.maxLat &&
      numLng >= matcher.minLng &&
      numLng <= matcher.maxLng
    ) {
      return matcher.packId;
    }
  }
  return null;
}

function lookByCountryHint(regionName) {
  const norm = String(regionName || "")
    .trim()
    .toLowerCase();
  if (!norm) return null;
  if (
    norm.includes("united kingdom") ||
    norm.includes("uk") ||
    norm.includes("england") ||
    norm.includes("scotland") ||
    norm.includes("wales") ||
    norm.includes("british")
  ) {
    return PACK_ID.UK_GENERIC;
  }
  return null;
}

/**
 * Resolve a UK regional vernacular pack for a site.
 *
 * @param {object} args
 * @param {number} [args.lat]
 * @param {number} [args.lng]
 * @param {string} [args.postcode]
 * @param {string} [args.regionName]  Free-text region/country (used only as a UK-generic hint)
 * @returns {object} A vernacular pack record. Always returns a pack — falls back to uk-generic.
 */
export function resolveUKVernacular({
  lat = null,
  lng = null,
  postcode = "",
  regionName = "",
} = {}) {
  const byPostcode = lookupByPostcode(postcode);
  if (byPostcode) {
    return { ...PACKS[byPostcode], resolution_source: "postcode" };
  }
  const byBBox = lookupByLatLng(lat, lng);
  if (byBBox) {
    return { ...PACKS[byBBox], resolution_source: "bbox" };
  }
  const byHint = lookByCountryHint(regionName);
  if (byHint) {
    return { ...PACKS[byHint], resolution_source: "country_hint" };
  }
  return { ...PACKS[PACK_ID.UK_GENERIC], resolution_source: "default" };
}

/**
 * List every defined pack id (test introspection helper).
 */
export function listVernacularPackIds() {
  return Object.values(PACK_ID);
}

/**
 * Fetch a pack by id. Returns undefined for unknown ids.
 */
export function getVernacularPack(packId) {
  return PACKS[packId];
}

export const __testing__ = {
  POSTCODE_PREFIX_MAP,
  BBOX_MATCHERS,
  PACKS,
  postcodeAreaPrefix,
};
