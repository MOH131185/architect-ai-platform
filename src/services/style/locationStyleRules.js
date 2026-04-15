/**
 * Location Style Rules
 *
 * Deterministic heuristics that translate region/climate metadata into
 * architectural style priors. This is the "location half" of Style DNA.
 */

function normalizeText(value, fallback = "unknown") {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  return value.trim();
}

function lower(value) {
  return normalizeText(value, "").toLowerCase();
}

function buildRuleSet(overrides = {}) {
  return {
    rule_id: overrides.rule_id || "global-generic",
    region: overrides.region || "global",
    climate_zone: overrides.climate_zone || "temperate",
    local_materials: overrides.local_materials || ["brick", "timber", "stone"],
    facade_language: overrides.facade_language || "balanced-solid-void",
    roof_language: overrides.roof_language || "pitched",
    window_language: overrides.window_language || "vertically-proportioned",
    massing_language: overrides.massing_language || "compact-articulated",
    modernity_level: overrides.modernity_level ?? 0.55,
    technical_constraints: overrides.technical_constraints || [],
    precedent_keywords: overrides.precedent_keywords || [],
    notes: overrides.notes || [],
  };
}

export function resolveLocationStyleRules(location = {}) {
  const region = lower(location.region || location.country || location.city);
  const climate = lower(
    location.climate_zone || location.climate || location.climateZone,
  );

  if (
    region.includes("uk") ||
    region.includes("england") ||
    region.includes("london")
  ) {
    return buildRuleSet({
      rule_id: "uk-contextual-masonry",
      region: "united_kingdom",
      climate_zone: climate || "marine-temperate",
      local_materials: ["brick", "stone", "render", "timber"],
      facade_language: "rhythmic-openings-with-solid-masonry",
      roof_language: "pitched-gable-or-hip",
      window_language: "vertical-punched-openings",
      massing_language: "street-aligned-compact-volumes",
      modernity_level: 0.52,
      technical_constraints: [
        "prioritize weather protection and durable masonry envelopes",
        "favor contextual street rhythm and moderate roof pitches",
      ],
      precedent_keywords: [
        "terrace",
        "townhouse",
        "courtyard",
        "masonry",
        "contextual",
      ],
      notes: [
        "UK contextual masonry and temperate weather protection rules applied.",
      ],
    });
  }

  if (
    region.includes("mediterranean") ||
    region.includes("spain") ||
    region.includes("italy") ||
    region.includes("greece")
  ) {
    return buildRuleSet({
      rule_id: "mediterranean-courtyard-shade",
      region: "mediterranean",
      climate_zone: climate || "hot-dry-summer",
      local_materials: ["stucco", "terracotta", "stone", "timber"],
      facade_language: "deep-shadow-openings-and-loggias",
      roof_language: "low-pitch-tile",
      window_language: "shaded-recessed-openings",
      massing_language: "courtyard-clustered",
      modernity_level: 0.48,
      technical_constraints: [
        "control solar gain with deep reveals and shaded outdoor transitions",
      ],
      precedent_keywords: [
        "courtyard",
        "loggia",
        "stucco",
        "terracotta",
        "shaded",
      ],
      notes: ["Mediterranean courtyard and solar shading rules applied."],
    });
  }

  if (
    region.includes("nordic") ||
    region.includes("sweden") ||
    region.includes("norway") ||
    region.includes("finland")
  ) {
    return buildRuleSet({
      rule_id: "nordic-compact-envelope",
      region: "nordic",
      climate_zone: climate || "cold-temperate",
      local_materials: ["timber", "metal", "stone"],
      facade_language: "minimal-planar-envelope",
      roof_language: "steep-pitched-or-compact-flat",
      window_language: "carefully-framed-large-openings",
      massing_language: "clean-compact-volumes",
      modernity_level: 0.7,
      technical_constraints: [
        "prioritize insulation, snow shedding, and daylight capture",
      ],
      precedent_keywords: [
        "timber",
        "minimal",
        "pitched roof",
        "thermal envelope",
      ],
      notes: ["Nordic daylight and thermal-envelope rules applied."],
    });
  }

  if (
    region.includes("gulf") ||
    region.includes("uae") ||
    region.includes("saudi") ||
    climate.includes("hot")
  ) {
    return buildRuleSet({
      rule_id: "hot-arid-screened-massing",
      region: region || "hot-arid",
      climate_zone: climate || "hot-arid",
      local_materials: ["stone", "lime render", "concrete", "metal shading"],
      facade_language: "layered-screens-and-shadow",
      roof_language: "flat-roof",
      window_language: "recessed-screened-openings",
      massing_language: "courtyard-and-shaded-bar",
      modernity_level: 0.66,
      technical_constraints: [
        "reduce solar exposure through massing depth and facade screening",
      ],
      precedent_keywords: [
        "mashrabiya",
        "screen",
        "courtyard",
        "shade",
        "thermal mass",
      ],
      notes: ["Hot-arid screening and thermal-mass rules applied."],
    });
  }

  return buildRuleSet({
    rule_id: "global-generic",
    region: normalizeText(location.region || location.country || "global"),
    climate_zone: normalizeText(
      location.climate_zone || location.climate || "temperate",
    ),
    local_materials: ["brick", "stone", "timber"],
    precedent_keywords: ["contextual", "modern", "regional"],
    notes: ["Generic contextual rule set applied."],
  });
}

export function getLocationStyleRules(location = {}) {
  return resolveLocationStyleRules(location);
}

export function buildLocationStylePromptBlock(location = {}) {
  const rules = resolveLocationStyleRules(location);

  return [
    "LOCATION STYLE RULES",
    `Region: ${rules.region}`,
    `Climate zone: ${rules.climate_zone}`,
    `Facade language: ${rules.facade_language}`,
    `Roof language: ${rules.roof_language}`,
    `Window language: ${rules.window_language}`,
    `Massing language: ${rules.massing_language}`,
    `Local materials: ${rules.local_materials.join(", ")}`,
  ].join("\n");
}

export default {
  getLocationStyleRules,
  resolveLocationStyleRules,
  buildLocationStylePromptBlock,
};
