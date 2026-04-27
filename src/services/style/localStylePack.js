/**
 * LocalStylePack — weighted material/style blend per plan §6.5.
 *
 *   final_style =
 *     0.40 * local_context
 *   + 0.25 * user_intent
 *   + 0.20 * climate_suitability
 *   + 0.15 * portfolio_identity
 *
 * `local_blend_strength` (0..1) scales the local-context share; the
 * complementary mass shifts to portfolio identity. `innovation_strength` (0..1)
 * scales the portfolio share; the complement shifts to local context. The two
 * sliders are bounded so that the weights always sum to 1.0 and the user/climate
 * shares stay near their plan-mandated values.
 */

const PLAN_WEIGHTS = Object.freeze({
  local: 0.4,
  user: 0.25,
  climate: 0.2,
  portfolio: 0.15,
});

function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

/**
 * Compute the four blend weights given the two user sliders.
 * Returns an object summing to 1.0 (within 1e-9).
 */
export function computeBlendWeights({
  localBlendStrength = 0.5,
  innovationStrength = 0.5,
} = {}) {
  const local = clamp01(localBlendStrength, 0.5);
  const innovation = clamp01(innovationStrength, 0.5);

  // Local share: scaled around the plan default (0.4). Range [0.2, 0.6].
  const localWeight = 0.2 + 0.4 * local;
  // Portfolio share: scaled around the plan default (0.15). Range [0.05, 0.25].
  const portfolioWeight = 0.05 + 0.2 * innovation;
  // User and climate are fixed at the plan values; rebalance the residual to
  // keep the total at 1.0.
  const fixedSum = PLAN_WEIGHTS.user + PLAN_WEIGHTS.climate;
  const remaining = 1 - localWeight - portfolioWeight;
  const userWeight = PLAN_WEIGHTS.user * (remaining / fixedSum);
  const climateWeight = PLAN_WEIGHTS.climate * (remaining / fixedSum);

  return {
    local: round(localWeight, 4),
    user: round(userWeight, 4),
    climate: round(climateWeight, 4),
    portfolio: round(portfolioWeight, 4),
  };
}

/**
 * Materials by UK regional vernacular and building type. Used as the local
 * context source until a live Planning Data + OSM provider lands (Tier 2.2).
 */
const LOCAL_PALETTES_BY_TYPE = Object.freeze({
  community: [
    "warm stock brick",
    "stone plinth",
    "timber rainscreen",
    "standing seam metal",
    "clay roof tile",
  ],
  dwelling: [
    "warm stock brick",
    "render with detailed reveals",
    "timber boarding",
    "concrete tile",
    "slate",
  ],
  multi_residential: [
    "stock brick",
    "GRC panel",
    "metal balcony soffit",
    "fibre cement panel",
    "anodised aluminium window frame",
  ],
  mixed_use: [
    "stock brick",
    "shopfront timber screen",
    "GRC retail spandrel",
    "warm timber lining",
    "metal canopy",
  ],
  office_studio: [
    "exposed brick",
    "polished concrete soffit",
    "warm timber screen",
    "anodised aluminium glazing",
    "clay tile",
  ],
  education_studio: [
    "warm stock brick",
    "robust glazed brick base",
    "timber lining",
    "polycarbonate clerestory",
    "metal standing seam",
  ],
});

const PORTFOLIO_PALETTES = Object.freeze({
  riba_stage2: [
    "restrained brick",
    "thoughtful timber accent",
    "neutral lime render",
    "dark metal flashing",
  ],
  riba_stage3: [
    "stock brick",
    "timber soffit",
    "metal coping",
    "clear glass with mullion rhythm",
  ],
  developer_preapp: [
    "selected facing brick",
    "balcony aluminium",
    "fibre cement infill",
    "neutral render",
  ],
  competition_board: [
    "bold brick contrast",
    "expressive timber",
    "metal cladding rhythm",
    "shadow-gap detailing",
  ],
  clean_academic: [
    "white render",
    "exposed brick",
    "timber accent",
    "minimal metal trim",
  ],
});

const CLIMATE_PALETTES_BY_RISK = Object.freeze({
  high: [
    "external timber brise-soleil",
    "deep masonry reveals",
    "perforated metal screen",
    "high-albedo render",
  ],
  medium: [
    "external timber screen",
    "deep brick reveals",
    "ventilated rainscreen",
    "warm timber soffit",
  ],
  low: [
    "warm brick",
    "timber boarding",
    "standing seam roof",
    "deep window reveal",
  ],
  unknown: ["warm brick", "timber boarding", "standing seam roof"],
});

function localContextPalette(brief, site) {
  const list =
    LOCAL_PALETTES_BY_TYPE[brief.building_type] ||
    LOCAL_PALETTES_BY_TYPE.community;
  // Heritage flags from site (when populated by Tier 2.2 providers) tighten
  // the palette toward conservation-area materials.
  const heritageFlagged =
    Array.isArray(site?.heritage_flags) && site.heritage_flags.length > 0;
  if (heritageFlagged) {
    return [...list, "lime mortar", "matched stock brick", "natural slate"];
  }
  return list;
}

function userPalette(brief) {
  const explicit = Array.isArray(brief?.user_intent?.material_preferences)
    ? brief.user_intent.material_preferences
    : [];
  const fromKeywords = Array.isArray(brief?.user_intent?.style_keywords)
    ? brief.user_intent.style_keywords.filter((kw) =>
        /brick|timber|stone|concrete|glass|metal|render|tile|slate/i.test(kw),
      )
    : [];
  return [...new Set([...explicit, ...fromKeywords])];
}

function climatePalette(climate) {
  const risk = climate?.overheating?.risk_level || "unknown";
  return CLIMATE_PALETTES_BY_RISK[risk] || CLIMATE_PALETTES_BY_RISK.unknown;
}

function portfolioPalette(brief) {
  const mood = brief?.user_intent?.portfolio_mood || "riba_stage2";
  return PORTFOLIO_PALETTES[mood] || PORTFOLIO_PALETTES.riba_stage2;
}

function normaliseMaterialName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

/**
 * Compute the weighted material palette. Each candidate material gets a score
 * proportional to the sum of source weights it appears in; the top N highest-
 * scoring materials form the final palette.
 */
export function computeMaterialPalette({
  brief,
  site,
  climate,
  paletteSize = 6,
}) {
  const sourcePalettes = {
    local: localContextPalette(brief, site),
    user: userPalette(brief),
    climate: climatePalette(climate),
    portfolio: portfolioPalette(brief),
  };
  const weights = computeBlendWeights({
    localBlendStrength: brief?.user_intent?.local_blend_strength,
    innovationStrength: brief?.user_intent?.innovation_strength,
  });

  const scoreByName = new Map();
  const displayByName = new Map();
  const sourcesByName = new Map();
  for (const [sourceKey, palette] of Object.entries(sourcePalettes)) {
    const w = weights[sourceKey] || 0;
    for (const raw of palette || []) {
      const key = normaliseMaterialName(raw);
      if (!key) continue;
      scoreByName.set(key, (scoreByName.get(key) || 0) + w);
      if (!displayByName.has(key)) displayByName.set(key, raw);
      const sources = sourcesByName.get(key) || new Set();
      sources.add(sourceKey);
      sourcesByName.set(key, sources);
    }
  }

  const ranked = [...scoreByName.entries()]
    .map(([key, score]) => ({
      material: displayByName.get(key) || key,
      score: round(score, 4),
      sources: [...(sourcesByName.get(key) || [])].sort(),
    }))
    .sort((a, b) => b.score - a.score || a.material.localeCompare(b.material));

  return {
    palette: ranked.slice(0, paletteSize).map((entry) => entry.material),
    palette_with_provenance: ranked.slice(0, paletteSize),
    source_palettes: sourcePalettes,
    weights,
  };
}

export function buildLocalStylePackV2({
  brief,
  site,
  climate,
  createStableId,
  paletteSize = 6,
} = {}) {
  const blend = computeMaterialPalette({ brief, site, climate, paletteSize });
  const styleKeywords = Array.isArray(brief?.user_intent?.style_keywords)
    ? brief.user_intent.style_keywords
    : [];
  const avoidKeywords = Array.isArray(brief?.user_intent?.avoid_keywords)
    ? brief.user_intent.avoid_keywords
    : [];
  return {
    style_pack_id: createStableId
      ? createStableId(
          "local-style",
          brief?.project_name || "project",
          blend.palette,
        )
      : null,
    primary_style: styleKeywords.join(", "),
    avoid_keywords: avoidKeywords,
    material_palette: blend.palette,
    material_palette_with_provenance: blend.palette_with_provenance,
    source_palettes: blend.source_palettes,
    blend_weights: blend.weights,
    blend_rationale: [
      `local context contributes ${(blend.weights.local * 100).toFixed(1)}% (slider local_blend_strength=${brief?.user_intent?.local_blend_strength ?? 0.5})`,
      `user intent contributes ${(blend.weights.user * 100).toFixed(1)}%`,
      `climate suitability contributes ${(blend.weights.climate * 100).toFixed(1)}% (overheating risk=${climate?.overheating?.risk_level || "unknown"})`,
      `portfolio mood contributes ${(blend.weights.portfolio * 100).toFixed(1)}% (slider innovation_strength=${brief?.user_intent?.innovation_strength ?? 0.5}, mood=${brief?.user_intent?.portfolio_mood || "riba_stage2"})`,
    ],
    climate_notes: Array.isArray(climate?.material_weathering_notes)
      ? climate.material_weathering_notes
      : [],
    local_blend_strength: brief?.user_intent?.local_blend_strength ?? 0.5,
    innovation_strength: brief?.user_intent?.innovation_strength ?? 0.5,
    data_quality: Array.isArray(site?.data_quality) ? site.data_quality : [],
  };
}

export default {
  computeBlendWeights,
  computeMaterialPalette,
  buildLocalStylePackV2,
};
