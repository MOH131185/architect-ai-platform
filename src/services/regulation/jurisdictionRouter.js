/**
 * UK jurisdiction router. Plan §6.4: route by nation; only England's Approved
 * Documents are evaluated by rule engines today. Wales / Scotland / Northern
 * Ireland return manual_review with explicit limitation notes pointing at the
 * nation-specific equivalents.
 */

const ENGLAND_POSTCODE_AREAS = new Set([
  "AL",
  "B",
  "BA",
  "BB",
  "BD",
  "BH",
  "BL",
  "BN",
  "BR",
  "BS",
  "CA",
  "CB",
  "CH",
  "CM",
  "CO",
  "CR",
  "CT",
  "CV",
  "CW",
  "DA",
  "DE",
  "DH",
  "DL",
  "DN",
  "DT",
  "DY",
  "E",
  "EC",
  "EN",
  "EX",
  "FY",
  "GL",
  "GU",
  "HA",
  "HD",
  "HG",
  "HP",
  "HR",
  "HU",
  "HX",
  "IG",
  "IP",
  "KT",
  "L",
  "LA",
  "LE",
  "LN",
  "LS",
  "LU",
  "M",
  "ME",
  "MK",
  "N",
  "NE",
  "NG",
  "NN",
  "NR",
  "NW",
  "OL",
  "OX",
  "PE",
  "PL",
  "PO",
  "PR",
  "RG",
  "RH",
  "RM",
  "S",
  "SE",
  "SG",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SP",
  "SR",
  "SS",
  "ST",
  "SW",
  "TA",
  "TF",
  "TN",
  "TQ",
  "TR",
  "TS",
  "TW",
  "UB",
  "W",
  "WA",
  "WC",
  "WD",
  "WF",
  "WN",
  "WR",
  "WS",
  "WV",
  "YO",
]);

const WALES_POSTCODE_AREAS = new Set([
  "CF",
  "LD",
  "LL",
  "NP",
  "SA",
  "SY",
  "CH",
]);
const SCOTLAND_POSTCODE_AREAS = new Set([
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
]);
const NORTHERN_IRELAND_POSTCODE_AREAS = new Set(["BT"]);

function postcodeArea(postcode) {
  if (!postcode || typeof postcode !== "string") return null;
  const trimmed = postcode.replace(/\s+/g, "").toUpperCase();
  const match = trimmed.match(/^([A-Z]{1,2})\d/);
  return match ? match[1] : null;
}

/**
 * Resolve UK jurisdiction from the brief. Postcode is most reliable; lat/lon is
 * a coarse fallback. Anything ambiguous returns "unknown_uk" so rule engines
 * can route to manual_review rather than silently applying English rules.
 */
export function resolveJurisdiction(brief = {}) {
  const postcode =
    brief?.site_input?.postcode ||
    brief?.site?.postcode ||
    brief?.postcode ||
    null;
  const area = postcodeArea(postcode);
  if (area) {
    if (NORTHERN_IRELAND_POSTCODE_AREAS.has(area)) return "northern_ireland";
    if (SCOTLAND_POSTCODE_AREAS.has(area)) return "scotland";
    if (WALES_POSTCODE_AREAS.has(area)) return "wales";
    if (ENGLAND_POSTCODE_AREAS.has(area)) return "england";
  }
  // Coarse lat/lon fallback for the four UK nations.
  const lat = Number(brief?.site_input?.lat);
  const lon = Number(brief?.site_input?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    // Northern Ireland: lat 54.0–55.4, lon -8.2 to -5.4
    if (lat >= 54 && lat <= 55.5 && lon >= -8.2 && lon <= -5.3)
      return "northern_ireland";
    // Scotland: lat ≥ 55.0 (excluding NI), lon -8.0 to -0.5
    if (lat > 55 && lon >= -8 && lon <= 0) return "scotland";
    // Wales: lat 51.3–53.5, lon -5.5 to -2.6
    if (lat >= 51.3 && lat <= 53.5 && lon >= -5.5 && lon <= -2.6) {
      return "wales";
    }
    // England: lat 49.8–55.8, lon -6.4 to 2.0 (with the Scotland/Wales/NI cuts above)
    if (lat >= 49.8 && lat <= 55.8 && lon >= -6.4 && lon <= 2.0)
      return "england";
  }
  return "unknown_uk";
}

const APPLICABLE_PARTS_DWELLING = [
  "A",
  "B",
  "F",
  "K",
  "L",
  "M",
  "O",
  "Q",
  "R",
  "S",
];
const APPLICABLE_PARTS_NON_DWELLING = [
  "A",
  "B",
  "F",
  "K",
  "L",
  "M",
  "Regulation 7",
];
const APPLICABLE_PARTS_MULTI_RES = [
  "A",
  "B",
  "E",
  "F",
  "K",
  "L",
  "M",
  "O",
  "Q",
  "R",
  "S",
];

export function getApplicablePartsFor(jurisdiction, buildingType) {
  if (jurisdiction !== "england" && jurisdiction !== "unknown_uk") {
    // Wales/Scotland/NI: parts model differs; defer to nation guidance.
    return [];
  }
  if (buildingType === "dwelling") return APPLICABLE_PARTS_DWELLING;
  if (buildingType === "multi_residential") return APPLICABLE_PARTS_MULTI_RES;
  if (buildingType === "mixed_use") return APPLICABLE_PARTS_MULTI_RES;
  return APPLICABLE_PARTS_NON_DWELLING;
}

export function jurisdictionLimitations(jurisdiction) {
  switch (jurisdiction) {
    case "england":
      return [];
    case "wales":
      return [
        "Wales applies its own Building Regulations (Welsh Government). Rule engine pre-checks are NOT executed; manual review by a Wales-registered consultant is required. See src/services/regulation/walesSourceRegistry.js for Wales-specific Approved Documents (Part L Wales 2022 + Planning Policy Wales Edition 12).",
      ];
    case "scotland":
      return [
        "Scotland applies the Building (Scotland) Regulations administered by Scottish Government via Building Standards (Technical Handbooks Domestic + Non-Domestic, Sections 0-7). Rule engine pre-checks are NOT executed; manual review by a Scotland-registered building standards verifier is required. See src/services/regulation/scotlandSourceRegistry.js for the 2024 Technical Handbooks and NPF4.",
      ];
    case "northern_ireland":
      return [
        "Northern Ireland applies the Building Regulations (Northern Ireland) — Technical Booklets B/D/E/F1/R. Rule engine pre-checks are NOT executed; manual review by a NI-registered consultant is required. See src/services/regulation/niSourceRegistry.js for the canonical Technical Booklets and SPPS.",
      ];
    case "unknown_uk":
    default:
      return [
        "UK nation could not be resolved from the brief. Rule engine routed to England by default; verify jurisdiction before relying on results.",
      ];
  }
}

/**
 * Return canonical source documents for the resolved jurisdiction so
 * precheck_results can cite real Wales/Scotland/NI guidance instead of
 * silently citing England's Approved Documents.
 */
export async function getNationSourceDocuments(jurisdiction) {
  switch (jurisdiction) {
    case "wales": {
      const mod = await import("./walesSourceRegistry.js");
      return [
        ...mod.APPROVED_DOCUMENTS_WALES.map((doc) => ({
          source_document_id: doc.document_id,
          title: doc.title,
          version: doc.version,
          url: doc.source_url,
          retrieved_at: doc.last_reviewed_at,
        })),
        {
          source_document_id: mod.WELSH_PLANNING_GUIDANCE.document_id,
          title: mod.WELSH_PLANNING_GUIDANCE.title,
          url: mod.WELSH_PLANNING_GUIDANCE.source_url,
          retrieved_at: null,
        },
      ];
    }
    case "scotland": {
      const mod = await import("./scotlandSourceRegistry.js");
      return [
        ...mod.TECHNICAL_HANDBOOKS_SCOTLAND.map((doc) => ({
          source_document_id: doc.document_id,
          title: doc.title,
          version: doc.version,
          url: doc.source_url,
          retrieved_at: doc.last_reviewed_at,
        })),
        {
          source_document_id: mod.SCOTTISH_PLANNING_GUIDANCE.document_id,
          title: mod.SCOTTISH_PLANNING_GUIDANCE.title,
          url: mod.SCOTTISH_PLANNING_GUIDANCE.source_url,
          retrieved_at: null,
        },
      ];
    }
    case "northern_ireland": {
      const mod = await import("./niSourceRegistry.js");
      return [
        ...mod.TECHNICAL_BOOKLETS_NI.map((doc) => ({
          source_document_id: doc.document_id,
          title: doc.title,
          version: doc.version,
          url: doc.source_url,
          retrieved_at: doc.last_reviewed_at,
        })),
        {
          source_document_id: mod.NI_PLANNING_GUIDANCE.document_id,
          title: mod.NI_PLANNING_GUIDANCE.title,
          url: mod.NI_PLANNING_GUIDANCE.source_url,
          retrieved_at: null,
        },
      ];
    }
    default:
      return [];
  }
}

export default {
  resolveJurisdiction,
  getApplicablePartsFor,
  jurisdictionLimitations,
};
