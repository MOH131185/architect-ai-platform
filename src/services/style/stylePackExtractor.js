import CryptoJS from "crypto-js";
import {
  STYLE_PACK_VERSION,
  validateStylePack,
} from "../../schemas/stylePack.js";

const DETERMINISTIC_EXTRACTED_AT = "1970-01-01T00:00:00.000Z";

const MATERIAL_FALLBACKS_BY_TYPE = Object.freeze({
  community: ["brick", "timber", "stone"],
  dwelling: ["brick", "timber", "slate"],
  multi_residential: ["brick", "concrete", "aluminium"],
  mixed_use: ["brick", "timber", "glass"],
  office_studio: ["brick", "concrete", "glass"],
  education_studio: ["brick", "timber", "polycarbonate"],
  default: ["brick", "timber", "glass"],
});

const MATERIAL_SYNONYMS = Object.freeze({
  "red brick": "brick",
  "stock brick": "brick",
  "warm stock brick": "brick",
  "london stock": "brick",
  masonry: "brick",
  wood: "timber",
  "timber shopfront": "timber",
  "timber cladding": "timber",
  "timber boarding": "timber",
  "slate roof": "slate",
  "clay tile": "tile",
  tiles: "tile",
  glazing: "glass",
  glazed: "glass",
  "curtain wall": "glass",
  aluminium: "metal",
  aluminum: "metal",
  steel: "metal",
  zinc: "metal",
  stucco: "render",
});

const MATERIAL_TERMS = Object.freeze([
  "brick",
  "stone",
  "timber",
  "wood",
  "concrete",
  "glass",
  "glazing",
  "steel",
  "metal",
  "aluminium",
  "render",
  "stucco",
  "slate",
  "tile",
  "terracotta",
  "zinc",
  "polycarbonate",
]);

const COLOUR_TERMS = Object.freeze([
  "red",
  "buff",
  "white",
  "black",
  "grey",
  "gray",
  "green",
  "bronze",
  "cream",
  "dark",
  "warm",
]);

const STYLE_TERMS = Object.freeze([
  "victorian",
  "georgian",
  "edwardian",
  "terrace",
  "terraced",
  "shopfront",
  "sash",
  "paired",
  "regular",
  "asymmetric",
  "courtyard",
  "l-shaped",
  "u-shaped",
  "articulated",
  "pavilion",
  "loft",
  "industrial",
  "parapet",
  "flat roof",
  "green roof",
  "pitched",
  "gable",
  "mansard",
  "gambrel",
  "glazed",
]);

const NUMBER_WORDS = Object.freeze({
  one: 1,
  single: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
});

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value) {
  const normalized = normalizeText(value)
    .replace(/\b(colou?r|material|finish)\b/g, "")
    .trim();
  return MATERIAL_SYNONYMS[normalized] || normalized;
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== "file" && key !== "preview")
        .sort()
        .map((key) => [key, stableClone(value[key])]),
    );
  }
  return value;
}

export function stableStylePackStringify(value) {
  return JSON.stringify(stableClone(value));
}

function sha256Hex(value) {
  return CryptoJS.SHA256(String(value)).toString(CryptoJS.enc.Hex);
}

function recordName(record, index) {
  return String(record?.name || record?.fileName || `portfolio-${index + 1}`);
}

function recordDigest(record) {
  const direct =
    record?.bytesOrTextDigest ||
    record?.contentHash ||
    record?.sha256 ||
    record?.hash ||
    record?.digest ||
    null;
  if (direct) return String(direct);
  return sha256Hex(
    stableStylePackStringify({
      name: record?.name || record?.fileName || null,
      type: record?.type || null,
      size: record?.size || null,
      text:
        record?.text ||
        record?.pdfText ||
        record?.extractedText ||
        record?.contentText ||
        record?.plainText ||
        null,
      dataUrl: record?.dataUrl || null,
      portfolioStyleEvidence: record?.portfolioStyleEvidence || null,
    }),
  );
}

function getSortedRecords(portfolioFiles) {
  return [...(Array.isArray(portfolioFiles) ? portfolioFiles : [])]
    .map((record, index) => ({
      record,
      index,
      name: recordName(record, index),
      digest: recordDigest(record),
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.digest.localeCompare(right.digest),
    );
}

function pushCount(map, raw, weight = 1) {
  const token = normalizeToken(raw);
  if (!token) return;
  map.set(token, (map.get(token) || 0) + weight);
}

function countMatches(text, terms) {
  return terms.reduce((count, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp(`\\b${escaped}\\b`, "gi"));
    return count + (matches ? matches.length : 0);
  }, 0);
}

function collectRecordText(record = {}) {
  const evidence = record.portfolioStyleEvidence || {};
  return [
    record.text,
    record.pdfText,
    record.extractedText,
    record.contentText,
    record.plainText,
    evidence.rawText,
    ...(Array.isArray(evidence.styleKeywords) ? evidence.styleKeywords : []),
    ...(Array.isArray(evidence.materials) ? evidence.materials : []),
    ...(Array.isArray(evidence.buildingTypes) ? evidence.buildingTypes : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function aggregateEvidence(sortedRecords) {
  const materials = new Map();
  const colours = new Map();
  const styleKeywords = new Map();
  const buildingTypes = new Map();
  const drawingTypes = new Map();
  const textParts = [];

  for (const { record } of sortedRecords) {
    const evidence = record?.portfolioStyleEvidence || {};
    textParts.push(collectRecordText(record));
    for (const value of evidence.materials || [])
      pushCount(materials, value, 2);
    for (const value of evidence.colours || evidence.colors || []) {
      pushCount(colours, value, 2);
    }
    for (const value of evidence.styleKeywords || []) {
      pushCount(styleKeywords, value, 2);
    }
    for (const value of evidence.buildingTypes || []) {
      pushCount(buildingTypes, value, 2);
    }
    for (const value of evidence.drawingTypes || []) {
      pushCount(drawingTypes, value, 2);
    }
  }

  const text = normalizeText(textParts.join(" "));
  for (const term of MATERIAL_TERMS) {
    const count = countMatches(text, [term]);
    if (count > 0) pushCount(materials, term, count);
  }
  for (const term of COLOUR_TERMS) {
    const count = countMatches(text, [term]);
    if (count > 0) pushCount(colours, term, count);
  }
  for (const term of STYLE_TERMS) {
    const count = countMatches(text, [term]);
    if (count > 0) pushCount(styleKeywords, term, count);
  }

  return {
    materials,
    colours,
    styleKeywords,
    buildingTypes,
    drawingTypes,
    text,
  };
}

function rankedEntries(map) {
  return [...map.entries()]
    .filter(([key]) => key)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([key]) => key);
}

function materialFamilies(aggregate, briefHints = {}) {
  const ranked = rankedEntries(aggregate.materials);
  const fallback =
    MATERIAL_FALLBACKS_BY_TYPE[briefHints.buildingType] ||
    MATERIAL_FALLBACKS_BY_TYPE.default;
  const source = ranked.length ? ranked : fallback;
  const primary = [...new Set(source)].slice(0, 3);
  const secondary = ranked
    .filter((entry) => !primary.includes(entry))
    .slice(0, 4);
  const accents = rankedEntries(aggregate.colours).slice(0, 6);
  return {
    primary: primary.length ? primary : fallback.slice(0, 1),
    secondary,
    accents,
  };
}

function roofPitchDistribution(aggregate, briefHints = {}) {
  const text = aggregate.text;
  const counts = {
    flat: countMatches(text, ["flat roof", "parapet", "green roof"]),
    low: countMatches(text, ["low pitch", "shallow pitch"]),
    medium: countMatches(text, ["pitched", "gable", "hipped", "slate", "tile"]),
    steep: countMatches(text, ["mansard", "gambrel", "steep"]),
  };
  if (Object.values(counts).every((value) => value === 0)) {
    if (briefHints.buildingType === "community") counts.low = 1;
    else counts.medium = 1;
  }
  const total =
    Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  const dominant = Object.entries(counts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0][0];
  return {
    flatPct: round(counts.flat / total),
    lowPct: round(counts.low / total),
    mediumPct: round(counts.medium / total),
    steepPct: round(counts.steep / total),
    dominant,
  };
}

function extractFloorCount(text, briefHints = {}) {
  const digitMatch = text.match(
    /\b([1-9]|1[0-2])\s*[- ]?(storey|storeys|story|stories|floor|floors)\b/i,
  );
  if (digitMatch) return Number(digitMatch[1]);
  const wordPattern = Object.keys(NUMBER_WORDS).join("|");
  const wordMatch = text.match(
    new RegExp(
      `\\b(${wordPattern})\\s*[- ]?(storey|storeys|story|stories|floor|floors)\\b`,
      "i",
    ),
  );
  if (wordMatch) return NUMBER_WORDS[wordMatch[1]];
  return Math.max(1, Math.min(12, Number(briefHints.target_storeys || 2) || 2));
}

function massingTendency(aggregate, briefHints = {}) {
  const text = aggregate.text;
  let form = "compact";
  if (/\bcourtyard\b/.test(text)) form = "courtyard";
  else if (/\bu[- ]?shaped|\bu shape\b/.test(text)) form = "U";
  else if (/\bl[- ]?shaped|\bl shape\b/.test(text)) form = "L";
  else if (/\barticulated|stepped|fragmented\b/.test(text))
    form = "articulated";

  const floorMode = extractFloorCount(text, briefHints);
  let aspectRatioRange = [0.8, 2.5];
  if (/\bterrace|narrow frontage|narrow front|deep plot\b/.test(text)) {
    aspectRatioRange = [0.35, 0.75];
  } else if (/\blong bar|linear bar|elongated\b/.test(text)) {
    aspectRatioRange = [1.8, 3.2];
  } else if (form === "courtyard") {
    aspectRatioRange = [0.8, 1.4];
  }

  return {
    form,
    floorCount: {
      min: floorMode,
      mode: floorMode,
      max: floorMode,
    },
    aspectRatioRange,
  };
}

function openingRhythm(aggregate) {
  const text = aggregate.text;
  const terrace = /\bterrace|terraced\b/.test(text);
  const paired = /\bgeorgian|paired|sash\b/.test(text);
  const asymmetric = /\basymmetric|irregular\b/.test(text);
  return {
    moduleMm: /\bloft\b/.test(text) ? 2400 : terrace ? 1200 : 1500,
    repetition: paired ? "paired" : asymmetric ? "asymmetric" : "regular",
    sillHeightMm: /\bshopfront|full height|full-height\b/.test(text)
      ? 450
      : 900,
  };
}

function facadeModule(aggregate) {
  const text = aggregate.text;
  return {
    baySpacingMm: /\bterrace|terraced\b/.test(text) ? 2400 : 3000,
    floorHeightMm: /\bshopfront|loft|warehouse\b/.test(text) ? 3400 : 3000,
  };
}

function windowToWallRatio(aggregate) {
  const text = aggregate.text;
  let overall = 0.3;
  if (/\bglazed|glass|shopfront|curtain wall\b/.test(text)) overall += 0.12;
  if (/\bsolid|fortress|blank facade\b/.test(text)) overall -= 0.08;
  overall = round(clamp(overall, 0.15, 0.7));
  return {
    overall,
    byElevation: {
      N: round(clamp(overall - 0.1, 0, 0.95)),
      S: round(clamp(overall + 0.1, 0, 0.95)),
      E: overall,
      W: overall,
    },
  };
}

function layoutArchetype(aggregate) {
  const text = aggregate.text;
  if (
    /\bterrace|terraced|side hall|narrow frontage|narrow front\b/.test(text)
  ) {
    return "linear_side_hall";
  }
  if (/\bback-to-back|two up two down|two-up two-down\b/.test(text)) {
    return "narrow_two_up_two_down";
  }
  if (/\btenement\b/.test(text)) return "tenement_common_stair";
  if (/\bcottage\b/.test(text)) return "central_stair_square";
  if (/\bcourtyard\b/.test(text)) return "courtyard";
  if (/\bpavilion\b/.test(text)) return "pavilion";
  return null;
}

function confidenceFor(aggregate) {
  const buckets = [
    aggregate.materials.size > 0,
    aggregate.colours.size > 0,
    aggregate.styleKeywords.size > 0,
    aggregate.buildingTypes.size > 0,
    aggregate.drawingTypes.size > 0,
    /\broof|gable|pitched|flat|parapet|mansard\b/.test(aggregate.text),
    /\bstorey|story|floor|terrace|courtyard|frontage|plot\b/.test(
      aggregate.text,
    ),
  ].filter(Boolean).length;
  return round(clamp(buckets / 7, 0.2, 0.95));
}

export function computeStylePackHash(pack) {
  if (!pack) return null;
  const withoutVolatileTimestamp = stableClone(pack);
  if (withoutVolatileTimestamp.provenance) {
    delete withoutVolatileTimestamp.provenance.extractedAt;
  }
  return sha256Hex(stableStylePackStringify(withoutVolatileTimestamp));
}

export function extractStylePack({
  portfolioFiles = [],
  briefHints = {},
  extractorVersion = STYLE_PACK_VERSION,
} = {}) {
  if (!Array.isArray(portfolioFiles) || portfolioFiles.length === 0) {
    return null;
  }

  const sortedRecords = getSortedRecords(portfolioFiles);
  const envSeed =
    typeof process !== "undefined" && process.env?.STYLE_PACK_SEED
      ? String(process.env.STYLE_PACK_SEED).trim()
      : "";
  const seed = /^[a-f0-9]{64}$/.test(envSeed)
    ? envSeed
    : sha256Hex(sortedRecords.map((entry) => entry.digest).join("|"));
  const aggregate = aggregateEvidence(sortedRecords);
  const pack = {
    version: extractorVersion,
    windowToWallRatio: windowToWallRatio(aggregate),
    roofPitchDistribution: roofPitchDistribution(aggregate, briefHints),
    openingRhythm: openingRhythm(aggregate),
    materialFamilies: materialFamilies(aggregate, briefHints),
    massingTendency: massingTendency(aggregate, briefHints),
    facadeModule: facadeModule(aggregate),
    layout_archetype: layoutArchetype(aggregate),
    provenance: {
      sourceFiles: sortedRecords.map((entry) => entry.name),
      // PLAN-AMBIGUITY: extractedAt is schema-required but v1 Style Pack JSON must be deterministic, so the extractor uses a stable timestamp.
      extractedAt: DETERMINISTIC_EXTRACTED_AT,
      extractorVersion,
      confidence: confidenceFor(aggregate),
      seed,
      evidence: {
        materials: rankedEntries(aggregate.materials).slice(0, 8),
        colours: rankedEntries(aggregate.colours).slice(0, 8),
        styleKeywords: rankedEntries(aggregate.styleKeywords).slice(0, 12),
        buildingTypes: rankedEntries(aggregate.buildingTypes).slice(0, 6),
        drawingTypes: rankedEntries(aggregate.drawingTypes).slice(0, 6),
      },
    },
  };

  const validation = validateStylePack(pack);
  if (!validation.valid) {
    throw new Error(
      `Style Pack validation failed: ${validation.errors
        .map((error) => `${error.path} ${error.message}`)
        .join("; ")}`,
    );
  }
  return pack;
}

export default {
  extractStylePack,
  computeStylePackHash,
};
