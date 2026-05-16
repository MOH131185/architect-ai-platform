import * as XLSX from "xlsx";
import {
  createCostWorkbookManifest,
  UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} from "./v2ProjectContracts.js";
import { buildCanonicalDrawingModelFromCompiledProject } from "../cad/canonicalDrawingModel.js";
import { exportCanonicalDrawingModelToDXF } from "../cad/canonicalDxfExporter.js";
import {
  buildStructuralModelFromCompiledProject,
  STRUCTURAL_REVIEW_DISCLAIMER,
} from "../structure/structuralModelService.js";
import { MEP_REVIEW_DISCLAIMER } from "../mep/mepModelService.js";
import ukRateCardV1 from "../../data/costRateCards/uk_v1.json" with { type: "json" };
// Phase 3 (Track 5): rate cards now split per building type. The legacy
// uk_v1 card stays imported for back-compat (legacy resolveRateCard
// callers still reference it); the v2 cards drive selectRateCard, which
// is the new authoritative resolver and ALSO carries per-category
// confidence widths + a contingency policy.
import ukResidentialV2 from "../../data/costRateCards/uk_residential_v2.json" with { type: "json" };
import ukCommercialV1 from "../../data/costRateCards/uk_commercial_v1.json" with { type: "json" };
import ukEducationV1 from "../../data/costRateCards/uk_education_v1.json" with { type: "json" };

function structuralDrawingsEnabledForIfc(options = {}) {
  if (options.structuralDrawingsEnabled === true) return true;
  if (options.structuralDrawingsEnabled === false) return false;
  return (
    String(process.env.STRUCTURAL_DRAWINGS_ENABLED || "").toLowerCase() ===
    "true"
  );
}

function mepDrawingsEnabledForIfc(options = {}) {
  if (options.mepDrawingsEnabled === true) return true;
  if (options.mepDrawingsEnabled === false) return false;
  return (
    String(process.env.MEP_DRAWINGS_ENABLED || "").toLowerCase() === "true"
  );
}

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function dxfPair(code, value) {
  return `  ${code}\n${value}\n`;
}

function polygonPoints(candidate = []) {
  return Array.isArray(candidate) ? candidate : [];
}

function lineLength(start = {}, end = {}) {
  return Math.hypot(
    Number(end.x || 0) - Number(start.x || 0),
    Number(end.y || 0) - Number(start.y || 0),
  );
}

// AIA-style architectural layer palette. Colors are AutoCAD Color Index (ACI).
const DXF_LAYER_PALETTE = Object.freeze([
  { name: "A-WALL", color: 7, lineweight: 50 }, // structural / interior walls
  { name: "A-WALL-EXT", color: 1, lineweight: 70 }, // exterior shell
  { name: "A-DOOR", color: 4, lineweight: 30 },
  { name: "A-WINDOW", color: 5, lineweight: 30 },
  { name: "A-STAIR", color: 6, lineweight: 30 },
  { name: "A-ROOM", color: 8, lineweight: 18 },
  { name: "A-AREA", color: 8, lineweight: 13 },
  { name: "A-DIMS", color: 2, lineweight: 18 },
  { name: "A-TEXT", color: 7, lineweight: 18 },
  { name: "A-ANNO", color: 7, lineweight: 18 },
  { name: "A-SLAB", color: 3, lineweight: 25 },
  { name: "A-COLU", color: 1, lineweight: 50 }, // columns
  { name: "A-SITE", color: 30, lineweight: 35 },
  { name: "A-NORTH", color: 7, lineweight: 25 },
  { name: "A-METADATA", color: 9, lineweight: 13 }, // hidden provenance layer
]);

function levelPrefix(level, index) {
  if (!level) return "L00";
  const idx = Number.isFinite(Number(level.level_number))
    ? Number(level.level_number)
    : index;
  return `L${String(Math.max(0, idx)).padStart(2, "0")}`;
}

function levelLayerName(baseLayer, levelTag) {
  return levelTag ? `${levelTag}-${baseLayer}` : baseLayer;
}

function buildLayerTable(levelTags = []) {
  const layers = [];
  // Site / north / metadata layers are level-agnostic.
  const globalLayers = ["A-SITE", "A-NORTH", "A-METADATA", "A-TEXT"];
  const palette = new Map(DXF_LAYER_PALETTE.map((l) => [l.name, l]));
  for (const baseName of globalLayers) {
    const meta = palette.get(baseName);
    if (meta) layers.push({ ...meta, name: baseName });
  }
  // Per-level architectural layers.
  const perLevelBaseLayers = [
    "A-WALL",
    "A-WALL-EXT",
    "A-DOOR",
    "A-WINDOW",
    "A-STAIR",
    "A-ROOM",
    "A-AREA",
    "A-DIMS",
    "A-ANNO",
    "A-SLAB",
    "A-COLU",
  ];
  for (const tag of levelTags.length > 0 ? levelTags : ["L00"]) {
    for (const baseName of perLevelBaseLayers) {
      const meta = palette.get(baseName);
      if (meta) layers.push({ ...meta, name: `${tag}-${baseName}` });
    }
  }

  let content = "";
  content += dxfPair(0, "SECTION");
  content += dxfPair(2, "TABLES");
  content += dxfPair(0, "TABLE");
  content += dxfPair(2, "LAYER");
  content += dxfPair(70, String(layers.length));

  layers.forEach((layer) => {
    content += dxfPair(0, "LAYER");
    content += dxfPair(2, layer.name);
    content += dxfPair(70, 0);
    content += dxfPair(62, layer.color);
    content += dxfPair(6, "CONTINUOUS");
    if (Number.isFinite(layer.lineweight)) {
      content += dxfPair(370, String(layer.lineweight));
    }
  });

  content += dxfPair(0, "ENDTAB");
  content += dxfPair(0, "ENDSEC");
  return content;
}

function drawNorthArrow(originX = 0, originY = 0) {
  // 0.6 m tall arrow, level-agnostic A-NORTH layer.
  let content = "";
  const tip = { x: originX, y: originY + 0.6 };
  const left = { x: originX - 0.18, y: originY - 0.05 };
  const right = { x: originX + 0.18, y: originY - 0.05 };
  content += drawLine({ x: originX, y: originY }, tip, "A-NORTH");
  content += drawLine(tip, left, "A-NORTH");
  content += drawLine(tip, right, "A-NORTH");
  content += drawText(originX, originY + 0.75, "N", "A-NORTH", 0.25);
  return content;
}

function drawPolyline(points, layer, closed = true) {
  const poly = polygonPoints(points);
  if (poly.length < 2) {
    return "";
  }
  let content = "";
  content += dxfPair(0, "LWPOLYLINE");
  content += dxfPair(8, layer);
  content += dxfPair(90, poly.length);
  content += dxfPair(70, closed ? 1 : 0);
  poly.forEach((point) => {
    content += dxfPair(10, round(point.x, 4));
    content += dxfPair(20, round(point.y, 4));
  });
  return content;
}

function drawLine(start, end, layer) {
  let content = "";
  content += dxfPair(0, "LINE");
  content += dxfPair(8, layer);
  content += dxfPair(10, round(start.x, 4));
  content += dxfPair(20, round(start.y, 4));
  content += dxfPair(11, round(end.x, 4));
  content += dxfPair(21, round(end.y, 4));
  return content;
}

function drawText(x, y, text, layer = "A-TEXT", height = 0.22) {
  let content = "";
  content += dxfPair(0, "TEXT");
  content += dxfPair(8, layer);
  content += dxfPair(10, round(x, 4));
  content += dxfPair(20, round(y, 4));
  content += dxfPair(40, height);
  content += dxfPair(1, String(text || ""));
  return content;
}

function createIfcGuid(seed = "compiled-project") {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  let guid = "";
  let current = hash >>> 0;
  for (let index = 0; index < 22; index += 1) {
    current = (current * 1664525 + 1013904223) >>> 0;
    guid += alphabet[current % alphabet.length];
  }
  return guid;
}

// Rate cards live in src/data/costRateCards/<id>.json. The residential UK
// card is loaded by default. Non-residential building types fall back to
// quantity-only mode (no inferred rates) — see resolveRateCard().
const RATE_CARDS = [ukRateCardV1];

const RESIDENTIAL_BUILDING_TYPES = new Set([
  "residential",
  "house",
  "apartment",
  "flat",
  "dwelling",
  "home",
  "residential_house",
  "residential_apartment",
  "uk_residential",
  "cottage",
  "bungalow",
  "detached",
  "semi_detached",
  "terrace",
  "terraced",
  "townhouse",
  "villa",
  "duplex",
]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveBuildingType(compiledProject) {
  return (
    compiledProject?.brief?.buildingType ||
    compiledProject?.brief?.building_type ||
    compiledProject?.metadata?.buildingType ||
    compiledProject?.metadata?.projectType ||
    compiledProject?.projectType ||
    null
  );
}

function resolveRateCard(buildingType) {
  const normalized = slugify(buildingType).replace(/-/g, "_");
  for (const card of RATE_CARDS) {
    if (normalized && card.buildingTypes?.[normalized]) {
      return { card, key: normalized };
    }
  }
  if (RESIDENTIAL_BUILDING_TYPES.has(normalized)) {
    const card = RATE_CARDS.find((c) => c.buildingTypes?.residential);
    if (card) return { card, key: "residential" };
  }
  // Default: no rate card matched. Workbook will run in quantity-only mode.
  return { card: null, key: null };
}

function resolveRate(rateCard, rateCardKey, category, item) {
  if (!rateCard || !rateCardKey) return null;
  const bucket = rateCard.buildingTypes?.[rateCardKey]?.rates?.[category];
  if (!bucket) return null;
  const value = bucket[item];
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return Number(value);
}

// Phase 3 audit cleanup: distinguish three rate-card outcomes per item:
//   - "rated"          → positive numeric rate (priced normally)
//   - "informational"  → explicit 0 in the rate card (line is intentionally
//                        uncosted but still surfaced in the takeoff — e.g.
//                        External Wall Length, which is captured for
//                        reference but priced via External Wall Area). Does
//                        NOT count against coverage %.
//   - "missing"        → no entry in the rate card at all. Counts toward
//                        MISSING_RATES and drives requiresReview.
//
// Codex non-blocker called out that 0 was being conflated with "missing",
// making every clean residential run flash amber. This split fixes that.
function resolveRateInfo(rateCard, rateCardKey, category, item) {
  if (!rateCard || !rateCardKey) return { kind: "missing", value: null };
  const bucket = rateCard.buildingTypes?.[rateCardKey]?.rates?.[category];
  if (!bucket || typeof bucket !== "object") {
    return { kind: "missing", value: null };
  }
  if (!Object.prototype.hasOwnProperty.call(bucket, item)) {
    return { kind: "missing", value: null };
  }
  const numeric = Number(bucket[item]);
  if (!Number.isFinite(numeric)) return { kind: "missing", value: null };
  if (numeric === 0) return { kind: "informational", value: 0 };
  if (numeric < 0) return { kind: "missing", value: null };
  return { kind: "rated", value: numeric };
}

// Phase 3 (Track 5): selectRateCard maps a building type to one of the
// per-typology rate cards and returns the fallback warning when the input
// doesn't match any known typology. The return shape is intentionally rich:
//
//   {
//     card,            // the resolved rate-card JSON object
//     key,             // building-type key inside card.buildingTypes
//     fallbackWarning, // null OR { code: "RATE_CARD_FALLBACK", message }
//   }
//
// Unknown / unmatched types fall back to uk_residential_v2 + a warning so
// the workbook still produces cost columns. Pre-Phase-3 callers used
// resolveRateCard which returned `card: null` for unknown types and the
// workbook ran in quantity-only mode — that gap is now filled by the
// fallback. The RATE_CARD_FALLBACK warning lands in the Summary sheet so
// reviewers can spot the proxy.
// Substring keywords for each typology. Order matters when a slug
// matches multiple categories (e.g. "school_office" — see test in
// selectRateCard.test.js); residential / education win over commercial
// because the matcher checks them first.
const RESIDENTIAL_KEYWORDS = [
  "residential",
  "dwelling",
  "house",
  "apartment",
  "flat",
  "cottage",
  "bungalow",
  "detached",
  "terrace",
  "townhouse",
  "villa",
  "duplex",
  "home",
];
const COMMERCIAL_KEYWORDS = [
  "office",
  "retail",
  "hospitality",
  "commercial",
  "mixed_use",
  "mixeduse",
  "workplace",
];
const EDUCATION_KEYWORDS = [
  "school",
  "university",
  "education",
  "college",
  "academy",
  "nursery",
];
export function selectRateCard(buildingType) {
  const slug = slugify(buildingType).replace(/-/g, "_");
  const segments = slug.split("_").filter(Boolean);
  // Word-boundary keyword match. Treats "_" as the boundary so
  // "office_studio" → matches "office" (commercial), but "warehouse"
  // does NOT match "house" (residential). Plural/inflected forms hit
  // via prefix check ("schools" → "school").
  const containsAny = (keywords) => {
    if (segments.length === 0) return false;
    // Multi-token keywords (e.g. "mixed_use") match the WHOLE slug;
    // single-token keywords match any segment plus its plural form.
    if (keywords.some((kw) => kw === slug)) return true;
    return segments.some((seg) =>
      keywords.some(
        (kw) => seg === kw || seg.startsWith(`${kw}s`) || seg === `${kw}s`,
      ),
    );
  };

  if (
    RESIDENTIAL_BUILDING_TYPES.has(slug) ||
    containsAny(RESIDENTIAL_KEYWORDS)
  ) {
    return {
      card: ukResidentialV2,
      key: "residential",
      fallbackWarning: null,
    };
  }
  if (containsAny(EDUCATION_KEYWORDS)) {
    return {
      card: ukEducationV1,
      key: "education",
      fallbackWarning: null,
    };
  }
  if (containsAny(COMMERCIAL_KEYWORDS)) {
    return {
      card: ukCommercialV1,
      key: "commercial",
      fallbackWarning: null,
    };
  }
  // Final fallback: use residential as a proxy and surface a warning.
  return {
    card: ukResidentialV2,
    key: "residential",
    fallbackWarning: {
      code: "RATE_CARD_FALLBACK",
      message: `No rate card for buildingType=${
        buildingType || "(unspecified)"
      }; using uk_residential_v2 as proxy. Reviewer should adjust rates manually.`,
    },
  };
}

// Phase 3 (Track 5): shared cost math used by both buildCostWorkbook
// (xlsx side effect) and buildCostSummary (panel-only summary). Producing
// both from one helper guarantees the workbook total matches the UI
// summary down to the penny.
export function computeCostBreakdown({
  compiledProject,
  takeoff,
  qualityTier = "mid",
  region = "uk-average",
} = {}) {
  if (!compiledProject?.geometryHash || !takeoff?.items?.length) {
    throw new Error(
      "Compiled project and quantity takeoff are required to compute cost breakdown.",
    );
  }
  const buildingType = resolveBuildingType(compiledProject);
  const {
    card: rateCard,
    key: rateCardKey,
    fallbackWarning: rateCardFallbackWarning,
  } = selectRateCard(buildingType);
  const qualityFactor =
    rateCard?.qualityFactors?.[qualityTier] ??
    (qualityTier === "premium" ? 1.15 : qualityTier === "baseline" ? 0.92 : 1);
  const regionFactor =
    rateCard?.regionFactors?.[region] ??
    (region === "london" ? 1.14 : region === "northern" ? 0.94 : 1);
  const rateCardMissing = !rateCard || !rateCardKey;
  const confidenceWidthsByCategory =
    rateCard?.buildingTypes?.[rateCardKey]?.confidenceWidths || null;
  const contingencyPolicy = rateCard?.contingency || {
    defaultPercent: 10,
    rationale: "Stage 2 design contingency (default).",
  };
  const widthFor = (category) => {
    const fallback = { low: 0.85, high: 1.2 };
    if (!confidenceWidthsByCategory) return fallback;
    return confidenceWidthsByCategory[category] || fallback;
  };

  const sortedItems = [...takeoff.items].sort((a, b) => {
    const aKey = `${slugify(a.category)}|${slugify(a.item)}`;
    const bKey = `${slugify(b.category)}|${slugify(b.item)}`;
    return aKey.localeCompare(bKey);
  });

  const enriched = sortedItems.map((item, index) => {
    const itemCode =
      `${slugify(item.category)}-${slugify(item.item)}` || `item-${index + 1}`;
    const rateInfo = resolveRateInfo(
      rateCard,
      rateCardKey,
      item.category,
      item.item,
    );
    const baseRate = rateInfo.kind === "rated" ? rateInfo.value : null;
    const adjustedRate =
      baseRate != null
        ? round(baseRate * qualityFactor * regionFactor, 2)
        : null;
    const subtotal =
      adjustedRate != null
        ? round(Number(item.quantity) * adjustedRate, 2)
        : null;
    const widths = widthFor(item.category);
    const rateLow =
      adjustedRate != null ? round(adjustedRate * widths.low, 2) : null;
    const rateHigh =
      adjustedRate != null ? round(adjustedRate * widths.high, 2) : null;
    const subtotalLow =
      rateLow != null ? round(Number(item.quantity) * rateLow, 2) : null;
    const subtotalHigh =
      rateHigh != null ? round(Number(item.quantity) * rateHigh, 2) : null;
    return {
      itemCode,
      description: item.item,
      category: item.category,
      unit: item.unit,
      quantity: Number(item.quantity) || 0,
      sourceElement: item.metadata?.sourceElement || item.category,
      level: item.metadata?.level || "—",
      // Phase 3 audit cleanup: rateKind disambiguates three states:
      //   - "rated"          → adjustedRate > 0, priced normally
      //   - "informational"  → explicit 0 in card (line shown but uncosted)
      //   - "missing"        → no entry in card (drives MISSING_RATES)
      rateKind: rateInfo.kind,
      baseRate,
      adjustedRate,
      rateLow,
      rateHigh,
      subtotal,
      subtotalLow,
      subtotalHigh,
    };
  });

  const grandTotal = enriched.reduce(
    (sum, row) => sum + (row.subtotal != null ? row.subtotal : 0),
    0,
  );
  const grandTotalLow = enriched.reduce(
    (sum, row) => sum + (row.subtotalLow != null ? row.subtotalLow : 0),
    0,
  );
  const grandTotalHigh = enriched.reduce(
    (sum, row) => sum + (row.subtotalHigh != null ? row.subtotalHigh : 0),
    0,
  );
  const totalEstimatedCost = rateCardMissing ? null : round(grandTotal, 2);
  const totalEstimatedCostLow = rateCardMissing
    ? null
    : round(grandTotalLow, 2);
  const totalEstimatedCostHigh = rateCardMissing
    ? null
    : round(grandTotalHigh, 2);
  const contingencyPct = Number(contingencyPolicy.defaultPercent || 10);
  const contingencyAllowance =
    totalEstimatedCost != null
      ? round((totalEstimatedCost * contingencyPct) / 100, 2)
      : null;
  const contingentTotal =
    totalEstimatedCost != null && contingencyAllowance != null
      ? round(totalEstimatedCost + contingencyAllowance, 2)
      : null;
  const giaM2 = Number(takeoff.summary?.grossFloorAreaM2 || 0);
  const costPerSqm =
    totalEstimatedCost != null && giaM2 > 0
      ? round(totalEstimatedCost / giaM2, 2)
      : null;
  // Phase 3 audit cleanup: split rate-card outcomes three ways. Items
  // intentionally priced at 0 (e.g. External Wall Length, shown for
  // reference but priced via the area line) are surfaced separately
  // and do NOT count against coverage — they're noise on the
  // MISSING_RATES path otherwise. Only items with no rate-card entry
  // count as missing.
  const missingRateItems = enriched
    .filter((row) => row.rateKind === "missing")
    .map((row) => ({
      itemCode: row.itemCode,
      description: row.description,
      category: row.category,
      unit: row.unit,
      quantity: row.quantity,
    }));
  const informationalItems = enriched
    .filter((row) => row.rateKind === "informational")
    .map((row) => ({
      itemCode: row.itemCode,
      description: row.description,
      category: row.category,
      unit: row.unit,
      quantity: row.quantity,
    }));
  const ratedItemCount = enriched.filter(
    (row) => row.rateKind === "rated",
  ).length;
  // Coverage: rated / (rated + missing). Informational items are
  // explicitly excluded from both numerator and denominator.
  const costableTotal = ratedItemCount + missingRateItems.length;
  const costCoveragePercent =
    costableTotal > 0
      ? Math.round((ratedItemCount / costableTotal) * 100)
      : 100;
  const missingRatesWarning =
    missingRateItems.length > 0
      ? {
          code: "MISSING_RATES",
          message: `${missingRateItems.length} of ${costableTotal} costable takeoff item(s) have no rate in ${rateCard?.id || "the selected rate card"} (coverage ${costCoveragePercent}%). Reviewer must price these manually before issuing as a cost plan.`,
          items: missingRateItems,
        }
      : null;
  const topDrivers = enriched
    .filter((row) => row.subtotal != null && row.subtotal > 0)
    .sort((a, b) => b.subtotal - a.subtotal)
    .slice(0, 5)
    .map((row) => ({
      itemCode: row.itemCode,
      description: row.description,
      category: row.category,
      subtotal: row.subtotal,
      subtotalLow: row.subtotalLow,
      subtotalHigh: row.subtotalHigh,
    }));

  return {
    enriched,
    grandTotal,
    grandTotalLow,
    grandTotalHigh,
    totalEstimatedCost,
    totalEstimatedCostLow,
    totalEstimatedCostHigh,
    contingencyPct,
    contingencyPolicy,
    contingencyAllowance,
    contingentTotal,
    giaM2,
    costPerSqm,
    topDrivers,
    rateCard,
    rateCardKey,
    rateCardMissing,
    rateCardFallbackWarning,
    missingRateItems,
    informationalItems,
    ratedItemCount,
    costCoveragePercent,
    missingRatesWarning,
    qualityFactor,
    regionFactor,
    qualityTier,
    region,
    buildingType,
  };
}

// Phase 3 (Track 5): public summary-only entry point. Wrappers compute the
// breakdown once and return just the costSummary object the
// CostSummaryPanel expects. No xlsx side effects — safe to call from the
// pipeline hot path on every generation.
export function buildCostSummary({
  compiledProject,
  takeoff,
  qualityTier = "mid",
  region = "uk-average",
} = {}) {
  const breakdown = computeCostBreakdown({
    compiledProject,
    takeoff,
    qualityTier,
    region,
  });
  return {
    schemaVersion: "cost-summary-v1",
    currency: "GBP",
    totalGbp: breakdown.totalEstimatedCost,
    totalLowGbp: breakdown.totalEstimatedCostLow,
    totalHighGbp: breakdown.totalEstimatedCostHigh,
    gia: breakdown.giaM2,
    costPerSqm: breakdown.costPerSqm,
    contingencyPercent: breakdown.contingencyPct,
    contingencyAllowanceGbp: breakdown.contingencyAllowance,
    contingentTotalGbp: breakdown.contingentTotal,
    topDrivers: breakdown.topDrivers,
    rateCardId: breakdown.rateCard?.id || null,
    rateCardKey: breakdown.rateCardKey,
    rateCardFallbackWarning: breakdown.rateCardFallbackWarning,
    // Phase 3 audit response: coverage signals so consumers can render
    // "requires review" rather than a clean READY when the rate card
    // didn't price every takeoff line OR a fallback rate card was used.
    missingRateItems: breakdown.missingRateItems,
    informationalItems: breakdown.informationalItems,
    ratedItemCount: breakdown.ratedItemCount,
    totalItemCount:
      breakdown.ratedItemCount + breakdown.missingRateItems.length,
    costCoveragePercent: breakdown.costCoveragePercent,
    missingRatesWarning: breakdown.missingRatesWarning,
    requiresReview:
      breakdown.missingRateItems.length > 0 ||
      breakdown.rateCardFallbackWarning != null,
    qualityTier: breakdown.qualityTier,
    region: breakdown.region,
    qualityFactor: breakdown.qualityFactor,
    regionFactor: breakdown.regionFactor,
    buildingType: breakdown.buildingType || null,
    geometryHash: compiledProject.geometryHash,
  };
}

function levelLookup(compiledProject) {
  const map = new Map();
  for (const level of compiledProject?.levels || []) {
    map.set(level.id, level);
  }
  return map;
}

function aggregateMaterials(compiledProject) {
  const buckets = new Map();
  const push = (material, discipline, quantity, unit, source, evidence) => {
    if (!material) return;
    const key = `${discipline}::${material}::${unit}`;
    const existing = buckets.get(key);
    const numeric = Number(quantity);
    const safeQty = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    if (existing) {
      existing.quantity = round(existing.quantity + safeQty, 3);
      if (evidence && !existing.evidence) existing.evidence = evidence;
      return;
    }
    buckets.set(key, {
      material,
      discipline,
      quantity: round(safeQty, 3),
      unit,
      source,
      evidence: evidence || null,
    });
  };

  const levels = levelLookup(compiledProject);

  for (const wall of compiledProject?.walls || []) {
    const length = Number(wall.length_m || lineLength(wall.start, wall.end));
    const height = Number(
      wall.height_m || levels.get(wall.levelId)?.height_m || 3,
    );
    const area = Number.isFinite(length * height) ? length * height : 0;
    push(
      wall.material || wall.material_id,
      wall.exterior ? "envelope" : "internal",
      area,
      "m2",
      wall.exterior ? "wall_exterior" : "wall_internal",
      wall.material_evidence || null,
    );
  }
  for (const slab of compiledProject?.slabs || []) {
    const area = Number(slab.area_m2 || polygonArea(slab.polygon || []));
    push(
      slab.material,
      "structural",
      area,
      "m2",
      "slab",
      slab.material_evidence,
    );
  }
  for (const plane of compiledProject?.roof?.planes || []) {
    const area = Number(plane.area_m2 || polygonArea(plane.polygon || []));
    push(
      plane.material || compiledProject?.roof?.material,
      "envelope",
      area,
      "m2",
      "roof",
      plane.material_evidence ||
        compiledProject?.roof?.material_evidence ||
        null,
    );
  }
  return Array.from(buckets.values()).sort((a, b) =>
    `${a.discipline}|${a.material}`.localeCompare(
      `${b.discipline}|${b.material}`,
    ),
  );
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += Number(current.x || 0) * Number(next.y || 0);
    area -= Number(next.x || 0) * Number(current.y || 0);
  }
  return Math.abs(area) / 2;
}

export function exportCompiledProjectToDXF({
  compiledProject,
  projectName = "ArchiAI_Project",
  sourceModelHash = null,
  pipelineVersion = null,
  includeDetailDrawings = false,
  detailDrawingsEnabled = false,
  // Phase 2 (Track 3): thread structural/MEP flags through to the
  // canonical drawing model so the DXF carries S-FOUNDATION / S-COLUMN /
  // S-BEAM / E-LIGHT / P-WATER / M-DUCT layers when the rest of the
  // handoff package does. Previously DXF export ignored these flags,
  // emitting an arch-only drawing while IFC carried full structural data
  // — the two artifacts disagreed about what the model contained.
  //
  // Defaults are intentionally `undefined` (NOT `false`): the explicit-
  // false override below would otherwise fire for callers that simply
  // omit the flag, suppressing structural/MEP even when env defaults
  // request them. `undefined` lets the env / helper chain decide.
  includeStructuralDrawings,
  structuralDrawingsEnabled,
  includeMepDrawings,
  mepDrawingsEnabled,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for DXF export.",
    );
  }
  // Phase 2 audit response: explicit `false` (on either alias) MUST
  // override env-true. Mirrors the slice-service helper.
  const structuralFlag =
    includeStructuralDrawings === false || structuralDrawingsEnabled === false
      ? false
      : includeStructuralDrawings === true ||
        structuralDrawingsEnabled === true ||
        structuralDrawingsEnabledForIfc({ structuralDrawingsEnabled });
  const mepFlag =
    includeMepDrawings === false || mepDrawingsEnabled === false
      ? false
      : includeMepDrawings === true ||
        mepDrawingsEnabled === true ||
        mepDrawingsEnabledForIfc({ mepDrawingsEnabled });
  const canonicalDrawingModel = buildCanonicalDrawingModelFromCompiledProject({
    compiledProject,
    projectName,
    structuralDrawingsEnabled: structuralFlag,
    mepDrawingsEnabled: mepFlag,
    includeDetailDrawings:
      includeDetailDrawings === true ||
      detailDrawingsEnabled === true ||
      String(process.env.DETAIL_DRAWINGS_ENABLED || "").toLowerCase() ===
        "true",
  });
  const baseDxf = exportCanonicalDrawingModelToDXF({
    canonicalDrawingModel,
    sourceModelHash,
    pipelineVersion,
  });
  // Phase 2 audit response (Codex blocker 4 + re-audit fix): the DXF
  // artifact must carry the same review disclaimers as the IFC + PDF
  // when its structural/MEP layers ship. DXF has no native disclaimer
  // slot, but group code 999 is the spec-approved comment line. We
  // place the 999 lines INSIDE the HEADER section so the file still
  // starts with `0\nSECTION` (preserves the AutoCAD parser contract +
  // the existing dxfExport.test.js "DXF preamble" assertion). Every
  // tested DXF parser preserves 999 inside HEADER as round-trip
  // comments; AutoCAD surfaces them in Drawing Properties.
  const dxfComments = [];
  dxfComments.push(
    `ArchiAI ProjectGraph DXF — geometryHash=${compiledProject.geometryHash}`,
  );
  if (structuralFlag)
    dxfComments.push(
      `STRUCTURAL_REVIEW_DISCLAIMER: ${STRUCTURAL_REVIEW_DISCLAIMER}`,
    );
  if (mepFlag)
    dxfComments.push(`MEP_REVIEW_DISCLAIMER: ${MEP_REVIEW_DISCLAIMER}`);
  if (dxfComments.length === 0) return baseDxf;
  const commentBlock = dxfComments
    .map((c) => `  999\n${String(c).replace(/\r?\n/g, " ").trim()}\n`)
    .join("");
  // Insert just after the HEADER section opener (`  2\nHEADER\n`) so the
  // file's first bytes remain `  0\nSECTION` and structured parsers see
  // a clean section preamble. Fall back to a leading prepend only if the
  // HEADER opener can't be located (defensive — should never happen with
  // the canonical DXF exporter).
  const headerMarker = "  2\nHEADER\n";
  const markerIdx = baseDxf.indexOf(headerMarker);
  if (markerIdx === -1) return commentBlock + baseDxf;
  const insertAt = markerIdx + headerMarker.length;
  return baseDxf.slice(0, insertAt) + commentBlock + baseDxf.slice(insertAt);
}

export function exportCompiledProjectToIFC({
  compiledProject,
  projectName = "ArchiAI Project",
  authorName = "ArchiAI",
  organizationName = "Architect AI Platform",
  sourceModelHash = null,
  // Phase 2 (Track 3) — optional structural model. When omitted and
  // STRUCTURAL_DRAWINGS_ENABLED=true, the structural model is derived
  // from the compiled project so the IFC file carries IfcColumn / IfcBeam
  // entities and the STRUCTURAL_REVIEW_DISCLAIMER. The flag-based fallback
  // keeps callers that already produce a structural model (the slice
  // service does this in buildDrawingSet) from paying the build cost twice.
  structuralModel = null,
  // Phase 2 audit response (re-audit fix): accept BOTH alias names for
  // the discipline flags and apply explicit-false-wins on either alias.
  // Previously the IFC exporter only honoured `structuralDrawingsEnabled`,
  // so a request body shaped `{ includeStructuralDrawings: false }`
  // silently fell back to env (which defaults true), leaking
  // IfcColumn/IfcBeam into an architectural-only export.
  structuralDrawingsEnabled,
  includeStructuralDrawings,
  mepDrawingsEnabled,
  includeMepDrawings,
  jurisdictionPack = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error(
      "Compiled project with geometryHash is required for IFC export.",
    );
  }
  const wallCount = Array.isArray(compiledProject.walls)
    ? compiledProject.walls.length
    : 0;
  const levelCount = Array.isArray(compiledProject.levels)
    ? compiledProject.levels.length
    : 0;
  if (wallCount === 0 || levelCount === 0) {
    throw new Error(
      "IFC_GEOMETRY_INSUFFICIENT: compiled geometry has no walls or storeys.",
    );
  }

  // Resolve the structural / MEP flags with the same explicit-false-wins
  // rule the DXF exporter applies:
  //   1. Either alias === false  → false (hard veto, ignore env / model).
  //   2. Either alias === true   → true.
  //   3. A pre-built structural model implies include.
  //   4. Otherwise consult env via the helper.
  let structuralFlag;
  if (
    structuralDrawingsEnabled === false ||
    includeStructuralDrawings === false
  ) {
    structuralFlag = false;
  } else if (
    structuralDrawingsEnabled === true ||
    includeStructuralDrawings === true ||
    structuralModel != null
  ) {
    structuralFlag = true;
  } else {
    structuralFlag = structuralDrawingsEnabledForIfc({
      structuralDrawingsEnabled,
    });
  }
  let mepFlag;
  if (mepDrawingsEnabled === false || includeMepDrawings === false) {
    mepFlag = false;
  } else if (mepDrawingsEnabled === true || includeMepDrawings === true) {
    mepFlag = true;
  } else {
    mepFlag = mepDrawingsEnabledForIfc({ mepDrawingsEnabled });
  }

  // Resolve the structural model on demand so IfcColumn/IfcBeam emission
  // works whether the caller provides a pre-built model or only the
  // compiled project. Explicit-false suppresses even a supplied model
  // (Codex audit invariant).
  let resolvedStructuralModel = structuralFlag ? structuralModel : null;
  if (structuralFlag && !resolvedStructuralModel) {
    try {
      resolvedStructuralModel = buildStructuralModelFromCompiledProject({
        compiledProject,
        jurisdictionPack,
      });
    } catch (err) {
      // Don't fail the whole IFC export if structural model assembly fails;
      // log and continue without columns/beams. The architectural shell
      // (walls/slabs/doors/windows) remains.
      // eslint-disable-next-line no-console
      console.warn(
        `[IFC] structuralModel build failed; columns/beams omitted: ${err?.message || "unknown"}`,
      );
      resolvedStructuralModel = null;
    }
  }
  const includeStructural = structuralFlag;
  const includeMepDisclaimer = mepFlag;

  let entity = 1;
  const next = () => entity++;
  const lines = [];
  const guidSeed = compiledProject.geometryHash;
  const guid = (suffix) => createIfcGuid(`${guidSeed}-${suffix}`);
  const safeName = (value) => String(value || "").replace(/'/g, "\\'");
  const safeProjectName = projectName.replace(/\s+/g, "_");

  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push(
    `FILE_DESCRIPTION(('ArchiAI Compiled Project export — geometry ${guidSeed}'),'2;1');`,
  );
  lines.push(
    `FILE_NAME('${safeProjectName}.ifc','1970-01-01T00:00:00',('${authorName}'),('${organizationName}'),'IFC4','CompiledProjectExportV2','');`,
  );
  lines.push("FILE_SCHEMA(('IFC4'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");

  // ===== shared geometry primitives ============================================
  const zeroPointId = next();
  lines.push(`#${zeroPointId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  const zAxisId = next();
  lines.push(`#${zAxisId}=IFCDIRECTION((0.,0.,1.));`);
  const xAxisId = next();
  lines.push(`#${xAxisId}=IFCDIRECTION((1.,0.,0.));`);
  const projectAxisId = next();
  lines.push(
    `#${projectAxisId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
  );

  // ===== units + context =======================================================
  const lengthUnitId = next();
  lines.push(`#${lengthUnitId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  const areaUnitId = next();
  lines.push(`#${areaUnitId}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  const volumeUnitId = next();
  lines.push(`#${volumeUnitId}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
  const planeAngleUnitId = next();
  lines.push(`#${planeAngleUnitId}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
  const unitsId = next();
  lines.push(
    `#${unitsId}=IFCUNITASSIGNMENT((#${lengthUnitId},#${areaUnitId},#${volumeUnitId},#${planeAngleUnitId}));`,
  );
  const contextId = next();
  lines.push(
    `#${contextId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${projectAxisId},$);`,
  );

  // ===== owner history (optional but expected by most BIM tools) ==============
  const personId = next();
  lines.push(
    `#${personId}=IFCPERSON($,'${safeName(authorName)}','${safeName(authorName)}',$,$,$,$,$);`,
  );
  const orgId = next();
  lines.push(
    `#${orgId}=IFCORGANIZATION($,'${safeName(organizationName)}','Architect AI Platform',$,$);`,
  );
  const personOrgId = next();
  lines.push(
    `#${personOrgId}=IFCPERSONANDORGANIZATION(#${personId},#${orgId},$);`,
  );
  const appId = next();
  lines.push(
    `#${appId}=IFCAPPLICATION(#${orgId},'compiled-project-export-v2','ArchiAI ProjectGraph IFC Exporter','ARCHIAI');`,
  );
  const ownerHistoryId = next();
  lines.push(
    `#${ownerHistoryId}=IFCOWNERHISTORY(#${personOrgId},#${appId},$,.NOCHANGE.,$,$,$,0);`,
  );

  // ===== project ==============================================================
  // Phase 2 (Track 3): the IfcProject Description is the canonical place
  // for the structural/MEP disclaimer + geometry hash so any BIM tool that
  // opens the file sees the "preliminary, engineer-review-required" caveat
  // before any element is enumerated. Single line (IFC4 strings can't
  // safely carry newlines without producing parse errors in some tools).
  const projectDescriptionParts = [
    "Compiled ProjectGraph vertical slice",
    `geometryHash=${guidSeed}`,
  ];
  if (resolvedStructuralModel || includeStructural) {
    projectDescriptionParts.push(STRUCTURAL_REVIEW_DISCLAIMER);
  }
  if (includeMepDisclaimer) {
    projectDescriptionParts.push(MEP_REVIEW_DISCLAIMER);
  }
  const projectDescription = safeName(projectDescriptionParts.join(" | "));
  const projectId = next();
  lines.push(
    `#${projectId}=IFCPROJECT('${guid("project")}',#${ownerHistoryId},'${safeName(projectName)}','${projectDescription}',$,$,$,(#${contextId}),#${unitsId});`,
  );

  // ===== site =================================================================
  const sitePlacementAxisId = next();
  lines.push(
    `#${sitePlacementAxisId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
  );
  const sitePlacementId = next();
  lines.push(
    `#${sitePlacementId}=IFCLOCALPLACEMENT($,#${sitePlacementAxisId});`,
  );
  const siteAreaM2 = Number(compiledProject.site?.area_m2 || 0);
  const siteId = next();
  lines.push(
    `#${siteId}=IFCSITE('${guid("site")}',#${ownerHistoryId},'Site',$,$,#${sitePlacementId},$,$,.ELEMENT.,$,$,${round(siteAreaM2, 3)},$,$);`,
  );

  // ===== building =============================================================
  const buildingPlacementAxisId = next();
  lines.push(
    `#${buildingPlacementAxisId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
  );
  const buildingPlacementId = next();
  lines.push(
    `#${buildingPlacementId}=IFCLOCALPLACEMENT(#${sitePlacementId},#${buildingPlacementAxisId});`,
  );
  const buildingId = next();
  lines.push(
    `#${buildingId}=IFCBUILDING('${guid("building")}',#${ownerHistoryId},'${safeName(projectName)}',$,$,#${buildingPlacementId},$,$,.ELEMENT.,$,$,$);`,
  );

  // ===== storeys ==============================================================
  const storeyByLevelId = new Map();
  const storeyIdsForRel = [];
  (compiledProject.levels || []).forEach((level, index) => {
    const pointId = next();
    lines.push(
      `#${pointId}=IFCCARTESIANPOINT((0.,0.,${round(level.elevation_m || 0, 3)}));`,
    );
    const axisPlacementId = next();
    lines.push(
      `#${axisPlacementId}=IFCAXIS2PLACEMENT3D(#${pointId},#${zAxisId},#${xAxisId});`,
    );
    const localPlacementId = next();
    lines.push(
      `#${localPlacementId}=IFCLOCALPLACEMENT(#${buildingPlacementId},#${axisPlacementId});`,
    );
    const storeyId = next();
    lines.push(
      `#${storeyId}=IFCBUILDINGSTOREY('${guid(`storey-${index}`)}',#${ownerHistoryId},'${safeName(level.name || `Level ${index}`)}',$,$,#${localPlacementId},$,$,.ELEMENT.,${round(level.elevation_m || 0, 3)});`,
    );
    storeyByLevelId.set(level.id, { storeyId, localPlacementId });
    storeyIdsForRel.push(storeyId);
  });

  // Aggregation: project → site → building → storeys
  const projectSiteRelId = next();
  lines.push(
    `#${projectSiteRelId}=IFCRELAGGREGATES('${guid("rel-project-site")}',#${ownerHistoryId},$,$,#${projectId},(#${siteId}));`,
  );
  const siteBuildingRelId = next();
  lines.push(
    `#${siteBuildingRelId}=IFCRELAGGREGATES('${guid("rel-site-building")}',#${ownerHistoryId},$,$,#${siteId},(#${buildingId}));`,
  );
  if (storeyIdsForRel.length > 0) {
    const buildingStoreyRelId = next();
    lines.push(
      `#${buildingStoreyRelId}=IFCRELAGGREGATES('${guid("rel-building-storeys")}',#${ownerHistoryId},$,$,#${buildingId},(${storeyIdsForRel.map((id) => `#${id}`).join(",")}));`,
    );
  }

  // ===== element placement helper ============================================
  const elementsByStorey = new Map(storeyIdsForRel.map((id) => [id, []]));
  function placeElementOnStorey(levelId, x, y) {
    const storey =
      storeyByLevelId.get(levelId) || storeyByLevelId.values().next().value;
    if (!storey) return null;
    const pointId = next();
    lines.push(
      `#${pointId}=IFCCARTESIANPOINT((${round(Number(x) || 0, 3)},${round(Number(y) || 0, 3)},0.));`,
    );
    const axisId = next();
    lines.push(
      `#${axisId}=IFCAXIS2PLACEMENT3D(#${pointId},#${zAxisId},#${xAxisId});`,
    );
    const placementId = next();
    lines.push(
      `#${placementId}=IFCLOCALPLACEMENT(#${storey.localPlacementId},#${axisId});`,
    );
    return { placementId, storeyId: storey.storeyId };
  }

  function recordElement(storeyId, elementId) {
    const arr = elementsByStorey.get(storeyId) || [];
    arr.push(elementId);
    elementsByStorey.set(storeyId, arr);
  }

  // ===== walls ================================================================
  (compiledProject.walls || []).forEach((wall, index) => {
    const start = wall.start || { x: 0, y: 0 };
    const placement = placeElementOnStorey(wall.levelId, start.x, start.y);
    if (!placement) return;
    const wallId = next();
    lines.push(
      `#${wallId}=IFCWALL('${guid(`wall-${index}`)}',#${ownerHistoryId},'${safeName(wall.id || `Wall ${index + 1}`)}',$,$,#${placement.placementId},$,$,${wall.exterior ? ".STANDARD." : ".STANDARD."});`,
    );
    recordElement(placement.storeyId, wallId);
  });

  // ===== slabs ================================================================
  (compiledProject.slabs || []).forEach((slab, index) => {
    const center = slab.bbox
      ? {
          x: (Number(slab.bbox.min_x || 0) + Number(slab.bbox.max_x || 0)) / 2,
          y: (Number(slab.bbox.min_y || 0) + Number(slab.bbox.max_y || 0)) / 2,
        }
      : { x: 0, y: 0 };
    const placement = placeElementOnStorey(slab.levelId, center.x, center.y);
    if (!placement) return;
    const slabId = next();
    lines.push(
      `#${slabId}=IFCSLAB('${guid(`slab-${index}`)}',#${ownerHistoryId},'${safeName(slab.id || `Slab ${index + 1}`)}',$,$,#${placement.placementId},$,$,.FLOOR.);`,
    );
    recordElement(placement.storeyId, slabId);
  });

  // ===== windows + doors ======================================================
  (compiledProject.openings || []).forEach((opening, index) => {
    const position = opening.position_m || opening.position || { x: 0, y: 0 };
    const placement = placeElementOnStorey(
      opening.levelId,
      position.x,
      position.y,
    );
    if (!placement) return;
    const isWindow = opening.type === "window" || opening.kind === "window";
    const isDoor =
      opening.type === "door" ||
      opening.kind === "door" ||
      opening.kind === "main_entrance";
    const width = Number(opening.width_m || 0.9);
    const height = Number(opening.head_height_m || (isWindow ? 1.2 : 2.1));
    const elementId = next();
    if (isWindow) {
      lines.push(
        `#${elementId}=IFCWINDOW('${guid(`window-${index}`)}',#${ownerHistoryId},'${safeName(opening.id || `Window ${index + 1}`)}',$,$,#${placement.placementId},$,$,${round(height, 3)},${round(width, 3)},.WINDOW.,.NOTDEFINED.,$);`,
      );
    } else if (isDoor || !isWindow) {
      lines.push(
        `#${elementId}=IFCDOOR('${guid(`door-${index}`)}',#${ownerHistoryId},'${safeName(opening.id || `Door ${index + 1}`)}',$,$,#${placement.placementId},$,$,${round(height, 3)},${round(width, 3)},.DOOR.,.NOTDEFINED.,$);`,
      );
    }
    recordElement(placement.storeyId, elementId);
  });

  // ===== structural columns + beams ==========================================
  // Phase 2 audit response (Codex blocker 3): emit IfcColumn / IfcBeam with
  // IfcExtrudedAreaSolid representation geometry so downstream BIM tools
  // (Revit / ArchiCAD / Solibri) see real product geometry in the model
  // space, not just an entry in the object tree. Geometry is PRELIMINARY
  // (default sections, no engineer review yet); the disclaimer rides in
  // each element's Description field and in the IfcProject Description.
  //
  // Column geometry: rectangular cross-section (width × depth) extruded
  // vertically by the level's height_m.
  // Beam geometry: rectangular cross-section (typ 200×400mm) extruded
  // along the beam's start→end axis, length = ||end − start||. The
  // solid's position is rotated so its local +Z aligns with the beam.
  function emitColumnRepresentation(widthM, depthM, heightM) {
    const profileOriginId = next();
    lines.push(`#${profileOriginId}=IFCCARTESIANPOINT((0.,0.));`);
    const profilePlacementId = next();
    lines.push(
      `#${profilePlacementId}=IFCAXIS2PLACEMENT2D(#${profileOriginId},$);`,
    );
    const profileId = next();
    lines.push(
      `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profilePlacementId},${round(
        widthM,
        3,
      )},${round(depthM, 3)});`,
    );
    const solidPositionId = next();
    lines.push(
      `#${solidPositionId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${zAxisId},#${xAxisId});`,
    );
    const solidId = next();
    lines.push(
      `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},#${solidPositionId},#${zAxisId},${round(
        heightM,
        3,
      )});`,
    );
    const shapeRepId = next();
    lines.push(
      `#${shapeRepId}=IFCSHAPEREPRESENTATION(#${contextId},'Body','SweptSolid',(#${solidId}));`,
    );
    const productShapeId = next();
    lines.push(
      `#${productShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`,
    );
    return productShapeId;
  }

  function emitBeamRepresentation(widthM, depthM, lengthM, ux, uy) {
    const profileOriginId = next();
    lines.push(`#${profileOriginId}=IFCCARTESIANPOINT((0.,0.));`);
    const profilePlacementId = next();
    lines.push(
      `#${profilePlacementId}=IFCAXIS2PLACEMENT2D(#${profileOriginId},$);`,
    );
    const profileId = next();
    lines.push(
      `#${profileId}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profilePlacementId},${round(
        widthM,
        3,
      )},${round(depthM, 3)});`,
    );
    // The solid's local +Z is the beam axis (ux, uy, 0); local +X is the
    // in-plane perpendicular so the profile lies in the plane normal to
    // the beam centroid.
    const beamAxisId = next();
    lines.push(
      `#${beamAxisId}=IFCDIRECTION((${round(ux, 5)},${round(uy, 5)},0.));`,
    );
    const beamPerpId = next();
    lines.push(
      `#${beamPerpId}=IFCDIRECTION((${round(-uy, 5)},${round(ux, 5)},0.));`,
    );
    const solidPositionId = next();
    lines.push(
      `#${solidPositionId}=IFCAXIS2PLACEMENT3D(#${zeroPointId},#${beamAxisId},#${beamPerpId});`,
    );
    // ExtrudedDirection (0,0,1) is in the solid position's local frame,
    // which puts it along the beam axis in world coordinates.
    const solidId = next();
    lines.push(
      `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},#${solidPositionId},#${zAxisId},${round(
        lengthM,
        3,
      )});`,
    );
    const shapeRepId = next();
    lines.push(
      `#${shapeRepId}=IFCSHAPEREPRESENTATION(#${contextId},'Body','SweptSolid',(#${solidId}));`,
    );
    const productShapeId = next();
    lines.push(
      `#${productShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`,
    );
    return productShapeId;
  }

  if (resolvedStructuralModel) {
    const levelHeightById = new Map();
    (compiledProject.levels || []).forEach((level) => {
      levelHeightById.set(level.id, Number(level.height_m || 3.0));
    });
    (resolvedStructuralModel.columns || []).forEach((column, index) => {
      const pos = column.position || { x: 0, y: 0 };
      const placement = placeElementOnStorey(column.levelId, pos.x, pos.y);
      if (!placement) return;
      const widthM = Number(column.width_m || 0.3);
      const depthM = Number(column.depth_m || column.width_m || 0.3);
      const heightM = levelHeightById.get(column.levelId) || 3.0;
      const repId = emitColumnRepresentation(widthM, depthM, heightM);
      const columnEntityId = next();
      const columnDescription =
        `PRELIMINARY ${column.type || "preliminary_column"} — ` +
        "geometry indicative; engineer review required.";
      lines.push(
        `#${columnEntityId}=IFCCOLUMN('${guid(`column-${index}`)}',#${ownerHistoryId},'${safeName(
          column.memberId || column.id || `Column ${index + 1}`,
        )}','${safeName(columnDescription)}',$,#${placement.placementId},#${repId},$,.COLUMN.);`,
      );
      recordElement(placement.storeyId, columnEntityId);
    });
    (resolvedStructuralModel.beams || []).forEach((beam, index) => {
      const start = beam.start || { x: 0, y: 0 };
      const end = beam.end || { x: 0, y: 0 };
      const dx = Number(end.x || 0) - Number(start.x || 0);
      const dy = Number(end.y || 0) - Number(start.y || 0);
      const lengthM = Math.hypot(dx, dy);
      if (lengthM < 0.01) return; // skip degenerate beams (no representation)
      const ux = dx / lengthM;
      const uy = dy / lengthM;
      const placement = placeElementOnStorey(beam.levelId, start.x, start.y);
      if (!placement) return;
      const widthM = Number(beam.width_m || 0.2);
      const depthM = Number(beam.depth_m || 0.4);
      const repId = emitBeamRepresentation(widthM, depthM, lengthM, ux, uy);
      const beamEntityId = next();
      const beamDescription =
        `PRELIMINARY ${beam.type || "preliminary_beam"} — ` +
        "geometry indicative; engineer review required.";
      lines.push(
        `#${beamEntityId}=IFCBEAM('${guid(`beam-${index}`)}',#${ownerHistoryId},'${safeName(
          beam.memberId || beam.id || `Beam ${index + 1}`,
        )}','${safeName(beamDescription)}',$,#${placement.placementId},#${repId},$,.BEAM.);`,
      );
      recordElement(placement.storeyId, beamEntityId);
    });
  }

  // ===== stairs ===============================================================
  (compiledProject.stairs || []).forEach((stair, index) => {
    const center = stair.bbox
      ? {
          x:
            (Number(stair.bbox.min_x || 0) + Number(stair.bbox.max_x || 0)) / 2,
          y:
            (Number(stair.bbox.min_y || 0) + Number(stair.bbox.max_y || 0)) / 2,
        }
      : { x: 0, y: 0 };
    const placement = placeElementOnStorey(stair.levelId, center.x, center.y);
    if (!placement) return;
    const stairId = next();
    lines.push(
      `#${stairId}=IFCSTAIR('${guid(`stair-${index}`)}',#${ownerHistoryId},'${safeName(stair.id || `Stair ${index + 1}`)}',$,$,#${placement.placementId},$,$,.STRAIGHT_RUN_STAIR.);`,
    );
    recordElement(placement.storeyId, stairId);
  });

  // ===== rooms as IfcSpaces ===================================================
  (compiledProject.rooms || []).forEach((room, index) => {
    const center = room.bbox
      ? {
          x: (Number(room.bbox.min_x || 0) + Number(room.bbox.max_x || 0)) / 2,
          y: (Number(room.bbox.min_y || 0) + Number(room.bbox.max_y || 0)) / 2,
        }
      : { x: 0, y: 0 };
    const placement = placeElementOnStorey(room.levelId, center.x, center.y);
    if (!placement) return;
    const spaceId = next();
    lines.push(
      `#${spaceId}=IFCSPACE('${guid(`space-${index}`)}',#${ownerHistoryId},'${safeName(room.name || room.id || `Space ${index + 1}`)}',$,$,#${placement.placementId},$,$,.ELEMENT.,.INTERNAL.,${round(room.actual_area_m2 || room.target_area_m2 || 0, 3)});`,
    );
    recordElement(placement.storeyId, spaceId);
  });

  // ===== containment relations ===============================================
  for (const [storeyId, elementIds] of elementsByStorey.entries()) {
    if (elementIds.length === 0) continue;
    const relId = next();
    lines.push(
      `#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(`rel-storey-${storeyId}-elements`)}',#${ownerHistoryId},$,$,(${elementIds.map((id) => `#${id}`).join(",")}),#${storeyId});`,
    );
  }

  // ===== provenance comment ==================================================
  if (sourceModelHash) {
    lines.push(`/* SOURCE_MODEL_HASH: ${sourceModelHash} */`);
  }
  lines.push(`/* GEOMETRY_HASH: ${guidSeed} */`);
  // Phase 2 (Track 3): repeat the structural / MEP disclaimers as IFC
  // comments so any tool that strips IfcProject.Description (or that
  // can't grep entities) still sees the warning when opened as text.
  if (resolvedStructuralModel || includeStructural) {
    lines.push(
      `/* STRUCTURAL_REVIEW_DISCLAIMER: ${STRUCTURAL_REVIEW_DISCLAIMER} */`,
    );
  }
  if (includeMepDisclaimer) {
    lines.push(`/* MEP_REVIEW_DISCLAIMER: ${MEP_REVIEW_DISCLAIMER} */`);
  }
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  return lines.join("\n");
}

export function buildCostWorkbook({
  compiledProject,
  takeoff,
  projectName = "ArchiAI Project",
  qualityTier = "mid",
  region = "uk-average",
  projectAddress = null,
  pipelineVersion = UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} = {}) {
  if (!compiledProject?.geometryHash || !takeoff?.items?.length) {
    throw new Error(
      "Compiled project and quantity takeoff are required for workbook export.",
    );
  }

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `${projectName} Cost Workbook`,
    Subject: "Architect AI Compiled Project Cost Workbook",
    Author: "ArchiAI Solution Ltd",
  };

  // Phase 3 audit response: buildCostWorkbook now delegates ALL cost math
  // to the shared `computeCostBreakdown` helper. Previously the workbook
  // duplicated the rate-card resolution, per-line confidence width math,
  // grand totals, contingency, and top-drivers logic — that duplication
  // risked drift between the workbook total and the UI summary. Now both
  // surfaces produce identical numbers from a single source of truth.
  const breakdown = computeCostBreakdown({
    compiledProject,
    takeoff,
    qualityTier,
    region,
  });
  const {
    enriched,
    totalEstimatedCost,
    totalEstimatedCostLow,
    totalEstimatedCostHigh,
    contingencyPct,
    contingencyPolicy,
    contingencyAllowance,
    contingentTotal,
    giaM2,
    costPerSqm,
    topDrivers,
    rateCard,
    rateCardKey,
    rateCardMissing,
    rateCardFallbackWarning,
    missingRateItems,
    informationalItems,
    ratedItemCount,
    costCoveragePercent,
    missingRatesWarning,
    qualityFactor,
    regionFactor,
    buildingType,
  } = breakdown;
  const rateCardLabel = rateCardMissing
    ? `rate card not configured for ${buildingType || "unknown building type"} (${region})`
    : `${rateCard.id} v${rateCard.version}`;
  const jurisdictionLabel =
    compiledProject?.metadata?.jurisdictionPack?.id ||
    compiledProject?.jurisdictionPack?.id ||
    compiledProject?.countryCode ||
    null;

  // ===== Summary ============================================================
  const summaryRows = [
    ["Field", "Value"],
    ["Project Name", projectName],
    ["Address", projectAddress || "—"],
    ["Jurisdiction", jurisdictionLabel || "—"],
    ["Building Type", buildingType || "—"],
    ["Geometry Hash", compiledProject.geometryHash],
    ["Pipeline Version", pipelineVersion],
    ["Total GIA (m²)", giaM2],
    [
      "Total Estimated Cost (GBP)",
      totalEstimatedCost != null ? totalEstimatedCost : "rate card missing",
    ],
    [
      "Total Estimated Cost — Low (GBP)",
      totalEstimatedCostLow != null ? totalEstimatedCostLow : "—",
    ],
    [
      "Total Estimated Cost — High (GBP)",
      totalEstimatedCostHigh != null ? totalEstimatedCostHigh : "—",
    ],
    ["Cost per m² GIA (GBP)", costPerSqm != null ? costPerSqm : "—"],
    [
      `Design Contingency (${contingencyPct}%)`,
      contingencyAllowance != null ? contingencyAllowance : "—",
    ],
    [
      "Contingent Subtotal (GBP)",
      contingentTotal != null ? contingentTotal : "—",
    ],
    ["Rate Card", rateCardLabel],
    [
      "Rate Card Source",
      rateCardFallbackWarning
        ? `${rateCardFallbackWarning.code}: ${rateCardFallbackWarning.message}`
        : `Direct match for buildingType=${buildingType || "(unspecified)"}.`,
    ],
    ["Quality Tier", qualityTier],
    ["Region", region],
    ["Currency", "GBP"],
    // Phase 3 audit response: cost coverage signal. Reviewers need to
    // see how much of the takeoff was actually priced before they sign
    // off on the total.
    [
      "Cost Coverage",
      `${ratedItemCount}/${ratedItemCount + missingRateItems.length} costable items priced (${costCoveragePercent}%)${informationalItems.length > 0 ? ` · ${informationalItems.length} informational item(s) intentionally uncosted` : ""}`,
    ],
    [
      "Missing Rate Items",
      missingRateItems.length > 0
        ? missingRateItems
            .map((m) => `${m.description} (${m.quantity} ${m.unit})`)
            .join("; ")
        : "—",
    ],
    [
      "Informational Items (uncosted by design)",
      informationalItems.length > 0
        ? informationalItems
            .map((i) => `${i.description} (${i.quantity} ${i.unit})`)
            .join("; ")
        : "—",
    ],
    [
      "Disclaimer",
      rateCardMissing
        ? "Preliminary estimate only — not a contractor quotation. No rate card configured for this building type; cost columns are unavailable."
        : `Preliminary estimate only — not a contractor quotation. Rates from ${rateCardLabel}.${
            rateCardFallbackWarning
              ? " Building type didn't match a known typology; residential proxy used — reviewer to adjust."
              : ""
          }${
            missingRatesWarning
              ? ` ${missingRateItems.length} takeoff items have no rate in this card — totals exclude them; reviewer must price manually.`
              : ""
          }`,
    ],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

  // ===== Quantity Takeoff ===================================================
  const quantityTakeoffRows = enriched.map((row) => ({
    "Item Code": row.itemCode,
    Description: row.description,
    "Discipline/Category": row.category,
    Quantity: row.quantity,
    Unit: row.unit,
    "Source Element": row.sourceElement,
    Level: row.level,
    "Geometry Hash": compiledProject.geometryHash,
  }));
  const quantityTakeoffSheet = XLSX.utils.json_to_sheet(quantityTakeoffRows);

  // ===== Cost Estimate =====================================================
  // Phase 3 (Track 5): Rate Low/High + Subtotal Low/High columns ride
  // beside the adjusted rate so reviewers see the per-line confidence
  // envelope. Widths are per-category (finishes ±20%, envelope ±15%,
  // counts ±10%, etc.) and pulled from the rate-card JSON.
  const costEstimateRows = enriched.map((row) => ({
    "Item Code": row.itemCode,
    Description: row.description,
    Quantity: row.quantity,
    Unit: row.unit,
    "Rate (GBP)": row.adjustedRate != null ? row.adjustedRate : "—",
    "Rate Low (GBP)": row.rateLow != null ? row.rateLow : "—",
    "Rate High (GBP)": row.rateHigh != null ? row.rateHigh : "—",
    "Subtotal (GBP)": row.subtotal != null ? row.subtotal : "—",
    "Subtotal Low (GBP)": row.subtotalLow != null ? row.subtotalLow : "—",
    "Subtotal High (GBP)": row.subtotalHigh != null ? row.subtotalHigh : "—",
    "Rate Source": rateCardMissing
      ? "rate card missing"
      : `${rateCard.id} v${rateCard.version} (${rateCardKey})`,
    Confidence: rateCardMissing
      ? "n/a"
      : rateCard.buildingTypes?.[rateCardKey]?.confidence || "medium",
    Assumptions: rateCardMissing
      ? "No rate card configured for this building type."
      : `Quality x${qualityFactor}, region x${regionFactor}.${
          rateCardFallbackWarning
            ? " Rate-card fallback (residential proxy)."
            : ""
        }`,
  }));
  const costEstimateSheet = XLSX.utils.json_to_sheet(costEstimateRows);

  // ===== Risk & Contingency ================================================
  // Phase 3 (Track 5): new sheet carrying the Stage-2 contingency line
  // and a starter risk register reviewers can fill in. The default
  // contingency percent is per-typology (residential 10%, commercial
  // 12%, education 11%); reviewers can override but the rate-card
  // policy is the documented baseline.
  const riskRows = [
    {
      "Risk Category": "Design Contingency",
      Description: `${contingencyPct}% allowance on the Stage 2 estimate. ${
        contingencyPolicy.rationale || ""
      }`.trim(),
      "Allowance (GBP)":
        contingencyAllowance != null ? contingencyAllowance : "—",
      "% of Subtotal": contingencyPct,
    },
    {
      "Risk Category": "Construction Contingency",
      Description:
        "Placeholder — procured by the cost manager downstream once the contractor is engaged. Not included in the Stage-2 design contingency above.",
      "Allowance (GBP)": 0,
      "% of Subtotal": 0,
    },
    {
      "Risk Category": "Statutory / Compliance Risk",
      Description:
        "Reviewer to itemise. Building-regs interpretation, planning amendments, fire-safety / accessibility upgrades that may emerge between RIBA Stage 2 and 4.",
      "Allowance (GBP)": 0,
      "% of Subtotal": 0,
    },
    {
      "Risk Category": "Abnormal Site Conditions",
      Description:
        "Reviewer to itemise. Ground conditions, contaminated land, party-wall awards, basement excavation, utility diversions — anything not visible in the compiled-project geometry.",
      "Allowance (GBP)": 0,
      "% of Subtotal": 0,
    },
    {
      "Risk Category": "Market & Tender Risk",
      Description:
        "Reviewer to itemise. Material price volatility, labour supply, programme-driven premium, tender returns above the Stage 2 estimate range.",
      "Allowance (GBP)": 0,
      "% of Subtotal": 0,
    },
    {
      "Risk Category": "Total Estimated Cost (GBP)",
      Description: "Pre-contingency. From Summary sheet.",
      "Allowance (GBP)": totalEstimatedCost != null ? totalEstimatedCost : "—",
      "% of Subtotal": "—",
    },
    {
      "Risk Category": "Contingent Subtotal (GBP)",
      Description:
        "Pre-contingency total + design contingency allowance. Reviewer should add the construction contingency and any abnormals BEFORE issuing as a cost plan.",
      "Allowance (GBP)": contingentTotal != null ? contingentTotal : "—",
      "% of Subtotal": "—",
    },
  ];
  // Phase 3 audit response: surface MISSING_RATES + RATE_CARD_FALLBACK
  // at the TOP of the Risk & Contingency sheet so reviewers see the
  // coverage gap before the contingency rollup. Both warnings stack;
  // RATE_CARD_FALLBACK sits above MISSING_RATES for prominence.
  if (missingRatesWarning) {
    riskRows.unshift({
      "Risk Category": missingRatesWarning.code,
      Description: missingRatesWarning.message,
      "Allowance (GBP)": "—",
      "% of Subtotal": "—",
    });
  }
  if (rateCardFallbackWarning) {
    riskRows.unshift({
      "Risk Category": rateCardFallbackWarning.code,
      Description: rateCardFallbackWarning.message,
      "Allowance (GBP)": "—",
      "% of Subtotal": "—",
    });
  }
  const riskContingencySheet = XLSX.utils.json_to_sheet(riskRows);

  // ===== Spaces & Areas =====================================================
  const levelMap = levelLookup(compiledProject);
  const spaceRows = [...(compiledProject.rooms || [])]
    .map((room, index) => ({
      "Space ID": room.id || `space-${index + 1}`,
      Name: room.name || `Space ${index + 1}`,
      "Type/Category": room.type || room.category || room.usage || "general",
      Level: levelMap.get(room.levelId)?.name || room.levelId || "—",
      "Area (m²)": round(
        Number(
          room.actual_area_m2 ||
            room.target_area_m2 ||
            polygonArea(room.polygon || []),
        ) || 0,
        2,
      ),
    }))
    .sort((a, b) => String(a["Space ID"]).localeCompare(String(b["Space ID"])));
  const spacesSheet = XLSX.utils.json_to_sheet(
    spaceRows.length
      ? spaceRows
      : [
          {
            "Space ID": "—",
            Name: "—",
            "Type/Category": "—",
            Level: "—",
            "Area (m²)": 0,
          },
        ],
  );

  // ===== Materials ==========================================================
  const materialEntries = aggregateMaterials(compiledProject);
  const materialRows = materialEntries.length
    ? materialEntries.map((entry) => ({
        Material: entry.material,
        Discipline: entry.discipline,
        "Area / Quantity": entry.quantity,
        Unit: entry.unit,
        Source: entry.source,
        "Jurisdiction Evidence":
          entry.evidence?.summary ||
          entry.evidence?.id ||
          (entry.evidence ? "see compiled project" : "—"),
      }))
    : [
        {
          Material: "—",
          Discipline: "—",
          "Area / Quantity": 0,
          Unit: "—",
          Source: "—",
          "Jurisdiction Evidence": "No material data on compiled project.",
        },
      ];
  const materialsSheet = XLSX.utils.json_to_sheet(materialRows);

  // ===== Assumptions & Exclusions ==========================================
  const assumptionsExclusionsRows = [
    {
      Section: "Assumptions",
      Detail: "Preliminary estimate only — not a contractor quotation.",
    },
    {
      Section: "Assumptions",
      Detail: `Rate card: ${rateCardLabel}.`,
    },
    {
      Section: "Assumptions",
      Detail: `Quality factor ${qualityFactor}, region factor ${regionFactor}.`,
    },
    {
      Section: "Assumptions",
      Detail:
        "Quantities derived deterministically from compiled project geometry — they are indicative early-stage takeoffs and not measured site quantities.",
    },
    { Section: "Exclusions", Detail: "VAT excluded." },
    {
      Section: "Exclusions",
      Detail: "Professional fees excluded unless explicitly included.",
    },
    {
      Section: "Exclusions",
      Detail: "Contingency: 0% (apply downstream as appropriate).",
    },
    {
      Section: "Exclusions",
      Detail:
        "Local authority / statutory fees, planning fees, and CIL excluded unless configured.",
    },
    {
      Section: "Exclusions",
      Detail:
        "Abnormals (ground conditions, demolition, infrastructure) excluded.",
    },
    {
      Section: "Exclusions",
      Detail:
        "Furniture, fittings & equipment (FF&E) excluded unless itemised.",
    },
  ];
  const assumptionsExclusionsSheet = XLSX.utils.json_to_sheet(
    assumptionsExclusionsRows,
  );

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(
    workbook,
    quantityTakeoffSheet,
    "Quantity Takeoff",
  );
  XLSX.utils.book_append_sheet(workbook, costEstimateSheet, "Cost Estimate");
  // Phase 3 (Track 5): Risk & Contingency sheet sits adjacent to the
  // Cost Estimate so reviewers see the contingency line right after the
  // cost rollup. New sheet count is 7 (was 6).
  XLSX.utils.book_append_sheet(
    workbook,
    riskContingencySheet,
    "Risk & Contingency",
  );
  XLSX.utils.book_append_sheet(workbook, spacesSheet, "Spaces & Areas");
  XLSX.utils.book_append_sheet(workbook, materialsSheet, "Materials");
  XLSX.utils.book_append_sheet(
    workbook,
    assumptionsExclusionsSheet,
    "Assumptions & Exclusions",
  );

  const workbookArray = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const manifest = createCostWorkbookManifest({
    geometryHash: compiledProject.geometryHash,
    pipelineVersion,
    tabs: workbook.SheetNames,
    assumptions: [
      `Rate card: ${rateCardLabel}`,
      `Quality factor ${qualityFactor}`,
      `Region factor ${regionFactor}`,
      "Preliminary estimate only — not a contractor quotation",
    ],
    totals: {
      totalGbp: totalEstimatedCost != null ? totalEstimatedCost : null,
      grossFloorAreaM2: takeoff.summary?.grossFloorAreaM2 || 0,
    },
  });

  // Phase 3 audit response: reuse the same buildCostSummary helper the
  // pipeline uses so the workbook + UI summary can never disagree. The
  // breakdown was computed above (line ~1406); we pass the same inputs
  // through buildCostSummary for a single source of truth.
  const costSummary = buildCostSummary({
    compiledProject,
    takeoff,
    qualityTier,
    region,
  });

  return {
    workbook,
    workbookArray,
    manifest,
    currency: "GBP",
    totalGbp: totalEstimatedCost,
    totalLowGbp: totalEstimatedCostLow,
    totalHighGbp: totalEstimatedCostHigh,
    contingencyAllowanceGbp: contingencyAllowance,
    contingentTotalGbp: contingentTotal,
    rateCard: rateCardMissing
      ? null
      : { id: rateCard.id, version: rateCard.version, key: rateCardKey },
    rateCardMissing,
    rateCardFallbackWarning,
    missingRateItems,
    informationalItems,
    ratedItemCount,
    costCoveragePercent,
    missingRatesWarning,
    costSummary,
  };
}

export default {
  exportCompiledProjectToDXF,
  exportCompiledProjectToIFC,
  buildCostWorkbook,
};
