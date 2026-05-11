import { createStableId } from "../cad/projectGeometrySchema.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";
import {
  computeBlendWeights,
  computeMaterialPalette,
} from "./localStylePack.js";
import { summarizePortfolioReferences } from "./portfolioEmbeddingService.js";
import { detectConflicts } from "../design/constraintPriority.js";

export const STYLE_BLEND_MANIFEST_VERSION = "style-blend-manifest-v1";

const PRIORITY = Object.freeze([
  "safety",
  "programme",
  "climate",
  "local",
  "user",
  "portfolio",
]);

const GLASS_RISK_TERMS = Object.freeze([
  "all-glass",
  "fully glazed",
  "frameless glass",
  "mirrored facade",
  "highly reflective glazing",
  "curtain wall",
]);

const CONTEXT_RISK_TERMS = Object.freeze([
  "sci-fi",
  "futurism",
  "alien geometry",
  "blob form",
  "parametric ribbon",
]);

const DETACHED_TERMS = Object.freeze([
  "detached",
  "standalone villa",
  "freestanding",
  "open sides",
]);

export const STYLE_BLEND_PORTFOLIO_LIMITS = Object.freeze({
  strongLocal: 0.05,
  default: 0.25,
});

const UK_VERNACULAR_BLEED_TERMS = Object.freeze([
  "ukVernacularPacks",
  "REGIONAL VERNACULAR (UK pack)",
  "UK pack",
  "london-stucco-terrace",
  "london-victorian-terrace",
  "edinburgh-tenement",
  "manchester-back-to-back",
  "cotswolds-cottage",
  "London stucco terrace",
  "London Victorian terrace",
  "Edinburgh tenement",
  "Manchester back-to-back",
  "Cotswolds cottage",
  "UK vernacular",
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function lc(value) {
  return compactText(value).toLowerCase();
}

function comparableText(value) {
  return lc(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry != null);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values
        .flat()
        .map((entry) =>
          typeof entry === "string"
            ? compactText(entry)
            : compactText(entry?.name || entry?.material || entry?.label),
        )
        .filter(Boolean),
    ),
  ];
}

function asNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function materialName(entry) {
  if (typeof entry === "string") return compactText(entry);
  return compactText(entry?.name || entry?.material || entry?.label || "");
}

function inferApplication(name = "", explicit = "") {
  const text = lc(`${name} ${explicit}`);
  if (/roof|tile|slate|zinc|standing seam|terracotta/.test(text)) {
    return "roof";
  }
  if (/window|glaz|glass|frame|aluminium|aluminum|door/.test(text)) {
    return "openings";
  }
  if (/brick|render|stone|stucco|masonry|cladding|facade|wall/.test(text)) {
    return "primary facade";
  }
  if (/timber|screen|brise|soffit|trim|coping|metal/.test(text)) {
    return "detail";
  }
  return explicit || "finish";
}

function normalizeWeights(weights = {}) {
  const base = {
    local: Math.max(0, Number(weights.local) || 0),
    user: Math.max(0, Number(weights.user) || 0),
    climate: Math.max(0, Number(weights.climate) || 0),
    portfolio: Math.max(0, Number(weights.portfolio) || 0),
  };
  const total = Object.values(base).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { local: 0.4, user: 0.25, climate: 0.2, portfolio: 0.15 };
  }
  const rounded = {
    local: round(base.local / total),
    user: round(base.user / total),
    climate: round(base.climate / total),
    portfolio: round(base.portfolio / total),
  };
  const delta = round(
    1 - (rounded.local + rounded.user + rounded.climate + rounded.portfolio),
  );
  rounded.local = round(rounded.local + delta);
  return rounded;
}

function redistributePortfolioWeight(weights, reason) {
  const normalized = normalizeWeights(weights);
  const portfolio = normalized.portfolio;
  if (portfolio <= 0) return { weights: normalized, redistribution: null };
  const recipients = ["local", "user", "climate"];
  const recipientTotal = recipients.reduce(
    (sum, key) => sum + normalized[key],
    0,
  );
  const next = { ...normalized, portfolio: 0 };
  recipients.forEach((key) => {
    const share = recipientTotal > 0 ? normalized[key] / recipientTotal : 1 / 3;
    next[key] = next[key] + portfolio * share;
  });
  return {
    weights: normalizeWeights(next),
    redistribution: {
      from: "portfolio",
      amount: round(portfolio),
      to: recipients,
      reason,
    },
  };
}

function capPortfolioWeight(weights, cap, reason) {
  const normalized = normalizeWeights(weights);
  if (normalized.portfolio <= cap) {
    return { weights: normalized, redistribution: null };
  }
  const excess = normalized.portfolio - cap;
  const next = { ...normalized, portfolio: cap };
  const recipients = ["local", "climate", "user"];
  const recipientTotal = recipients.reduce(
    (sum, key) => sum + normalized[key],
    0,
  );
  recipients.forEach((key) => {
    const share = recipientTotal > 0 ? normalized[key] / recipientTotal : 1 / 3;
    next[key] = next[key] + excess * share;
  });
  return {
    weights: normalizeWeights(next),
    redistribution: {
      from: "portfolio",
      amount: round(excess),
      cap: round(cap),
      to: recipients,
      reason,
    },
  };
}

function buildPortfolioEvidence({
  portfolioItems = [],
  portfolioProfile = null,
  selectedPortfolioMood = null,
} = {}) {
  const references = [
    ...toArray(portfolioItems),
    ...toArray(portfolioProfile?.references),
    ...toArray(portfolioProfile?.items),
  ];
  const summary = summarizePortfolioReferences(references);
  const profileMaterials = uniqueStrings([
    portfolioProfile?.materials,
    portfolioProfile?.dominant_materials,
    portfolioProfile?.facadeMaterials,
  ]);
  const profileStyles = uniqueStrings([
    portfolioProfile?.styles,
    portfolioProfile?.dominant_styles,
    portfolioProfile?.style,
  ]);
  const profileTags = uniqueStrings([
    portfolioProfile?.tags,
    portfolioProfile?.dominant_tags,
    portfolioProfile?.keywords,
  ]);
  const profileColours = uniqueStrings([
    portfolioProfile?.colours,
    portfolioProfile?.colors,
    portfolioProfile?.dominant_colours,
    portfolioProfile?.dominant_colors,
  ]);
  const profilePresentationKeywords = uniqueStrings([
    portfolioProfile?.presentationKeywords,
    portfolioProfile?.dominant_presentation_keywords,
    portfolioProfile?.presentation_keywords,
  ]);
  const profileDrawingTypes = uniqueStrings([
    portfolioProfile?.drawingTypes,
    portfolioProfile?.dominant_drawing_types,
    portfolioProfile?.drawing_types,
  ]);
  const profileBuildingTypes = uniqueStrings([
    portfolioProfile?.buildingTypes,
    portfolioProfile?.dominant_building_types,
    portfolioProfile?.buildingType,
  ]);
  const materials = uniqueStrings([
    summary.dominant_materials,
    profileMaterials,
  ]);
  const styles = uniqueStrings([summary.dominant_styles, profileStyles]);
  const tags = uniqueStrings([summary.dominant_tags, profileTags]);
  const colours = uniqueStrings([summary.dominant_colours, profileColours]);
  const presentationKeywords = uniqueStrings([
    summary.dominant_presentation_keywords,
    profilePresentationKeywords,
  ]);
  const drawingTypes = uniqueStrings([
    summary.dominant_drawing_types,
    profileDrawingTypes,
  ]);
  const buildingTypes = uniqueStrings([
    summary.dominant_building_types,
    profileBuildingTypes,
  ]);
  const hasPortfolioEvidence =
    summary.reference_count > 0 ||
    materials.length > 0 ||
    styles.length > 0 ||
    tags.length > 0 ||
    colours.length > 0 ||
    presentationKeywords.length > 0 ||
    drawingTypes.length > 0 ||
    buildingTypes.length > 0;

  return {
    source: hasPortfolioEvidence ? "portfolio_inputs" : "none",
    hasPortfolioEvidence,
    referenceCount: summary.reference_count,
    selectedPortfolioMood: hasPortfolioEvidence
      ? selectedPortfolioMood || null
      : null,
    materials,
    styles,
    tags,
    colours,
    styleKeywords: styles,
    presentationKeywords,
    drawingTypes,
    buildingTypes,
    sourceGaps: summary.sourceGaps || [],
    graphicPresentationStyle:
      portfolioProfile?.graphicPresentationStyle ||
      portfolioProfile?.boardStyle ||
      (hasPortfolioEvidence ? selectedPortfolioMood || null : null),
    titleBlockStyle:
      portfolioProfile?.titleBlockStyle ||
      portfolioProfile?.graphicBoardStyle ||
      null,
  };
}

function buildLocalEvidence({ localStyle, site, jurisdictionPack }) {
  const provenance =
    localStyle?.style_provenance &&
    typeof localStyle.style_provenance === "object"
      ? localStyle.style_provenance
      : {};
  const jurisdictionEvidence = localStyle?.jurisdictionEvidence || null;
  const jurisdictionDefaults = jurisdictionPack?.localStyleDefaults || {};
  const materials = uniqueStrings([
    provenance.materials,
    localStyle?.material_palette,
    localStyle?.materials_local,
    localStyle?.local_materials,
    jurisdictionEvidence?.materials,
    jurisdictionDefaults.materials,
  ]);
  const heritageFlags = Array.isArray(site?.heritage_flags)
    ? site.heritage_flags
    : [];
  return {
    source:
      provenance.source ||
      jurisdictionEvidence?.source ||
      (materials.length ? "localStylePack" : "none"),
    packId:
      provenance.packId ||
      provenance.ukVernacularPackId ||
      jurisdictionEvidence?.packVersion ||
      jurisdictionPack?.version ||
      null,
    label:
      provenance.packLabel ||
      provenance.label ||
      localStyle?.primary_style ||
      jurisdictionPack?.countryName ||
      null,
    jurisdictionId:
      jurisdictionEvidence?.jurisdictionId ||
      jurisdictionPack?.jurisdictionId ||
      null,
    materials,
    facadeLanguage:
      provenance.facade_language ||
      localStyle?.facade_language ||
      localStyle?.styleDNA?.facade_language ||
      jurisdictionDefaults.facadeLanguage ||
      jurisdictionDefaults.facade_language ||
      null,
    roofLanguage:
      provenance.roof_language ||
      localStyle?.roof_language ||
      localStyle?.styleDNA?.roof_language ||
      jurisdictionDefaults.roofLanguage ||
      jurisdictionDefaults.roof_language ||
      null,
    windowLanguage:
      provenance.window_language ||
      localStyle?.window_language ||
      localStyle?.styleDNA?.window_language ||
      jurisdictionDefaults.windowLanguage ||
      jurisdictionDefaults.window_language ||
      null,
    massingLanguage:
      provenance.layout_archetype ||
      localStyle?.massing_language ||
      localStyle?.styleDNA?.massing_language ||
      jurisdictionDefaults.massingLanguage ||
      jurisdictionDefaults.massing_language ||
      null,
    heritageFlags: clone(heritageFlags),
    conservationTypical: provenance.conservation_typical === true,
  };
}

function buildClimateEvidence(climate = {}) {
  const overheatingRisk =
    climate?.overheating?.risk_level ||
    climate?.overheatingRisk ||
    climate?.overheating_risk ||
    "unknown";
  return {
    source: climate?.weather_source || climate?.source || "deterministic",
    zone: climate?.zone || climate?.koppen || climate?.climateZone || null,
    overheatingRisk,
    rainfallMm:
      asNumberOrNull(climate?.rainfall_mm) ??
      asNumberOrNull(climate?.annual_rainfall_mm) ??
      asNumberOrNull(climate?.precipitation_mm),
    climateResponses: uniqueStrings([
      climate?.design_recommendations,
      climate?.recommendations,
      climate?.material_weathering_notes,
    ]),
  };
}

function buildUserIntentEvidence(brief = {}, userSettings = {}) {
  const userIntent = {
    ...(brief?.user_intent || {}),
    ...(userSettings || {}),
  };
  return {
    styleKeywords: uniqueStrings(userIntent.style_keywords),
    avoidKeywords: uniqueStrings(userIntent.avoid_keywords),
    materialPreferences: uniqueStrings(userIntent.material_preferences),
    portfolioMood: userIntent.portfolio_mood || null,
    localBlendStrength: asNumberOrNull(userIntent.local_blend_strength),
    innovationStrength: asNumberOrNull(userIntent.innovation_strength),
    portfolioStyleStrength: asNumberOrNull(userIntent.portfolio_style_strength),
    portfolioMaterialWeight: asNumberOrNull(
      userIntent.portfolio_material_weight,
    ),
    localMaterialStrength: asNumberOrNull(userIntent.local_material_strength),
  };
}

function hasAnyTerm(values, terms) {
  const haystack = uniqueStrings(values).join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function isRejectedPortfolioMaterial(name, rejectedInfluences = []) {
  const material = lc(name);
  if (!material) return false;
  const rejectedText = rejectedInfluences
    .map((entry) => lc(entry.influence))
    .join(" ");
  if (rejectedText.includes(material)) return true;
  if (/glass|glaz|curtain wall/.test(rejectedText)) {
    return GLASS_RISK_TERMS.some((term) => material.includes(lc(term)));
  }
  if (/uk vernacular|uk pack/.test(rejectedText)) {
    return UK_VERNACULAR_BLEED_TERMS.some((term) =>
      material.includes(lc(term)),
    );
  }
  return false;
}

function isRejectedPortfolioText(value, rejectedInfluences = []) {
  const text = lc(value);
  if (!text) return false;
  const rejectedText = rejectedInfluences
    .map((entry) => lc(entry.influence))
    .join(" ");
  if (rejectedText.includes(text)) return true;
  if (/uk vernacular|uk pack/.test(rejectedText)) {
    return UK_VERNACULAR_BLEED_TERMS.some((term) => text.includes(lc(term)));
  }
  if (/glass|glaz|curtain wall/.test(rejectedText)) {
    return GLASS_RISK_TERMS.some((term) => text.includes(lc(term)));
  }
  if (/sci-fi|futur|alien|blob|parametric/.test(rejectedText)) {
    return CONTEXT_RISK_TERMS.some((term) => text.includes(lc(term)));
  }
  return false;
}

function isFranceOrAlgeriaContext({ brief, site, localEvidence } = {}) {
  const text = lc(
    [
      localEvidence?.jurisdictionId,
      localEvidence?.label,
      brief?.jurisdiction,
      brief?.site_input?.address,
      brief?.site_input?.country,
      site?.country,
      site?.countryName,
      site?.address,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return /\b(france|algeria)\b/.test(text);
}

function isTerracedContext({ brief, localEvidence, compiledProject }) {
  const text = [
    brief?.building_type,
    brief?.original_subtype,
    brief?.project_type_support?.subtypeId,
    localEvidence?.massingLanguage,
    compiledProject?.attachmentType,
    compiledProject?.metadata?.attachmentType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const partyWalls =
    Array.isArray(compiledProject?.partyWalls) &&
    compiledProject.partyWalls.length > 0;
  return /terrace|terraced|row-house|townhouse/.test(text) || partyWalls;
}

function makeRejectedInfluence({
  source = "portfolio",
  influence,
  rejectedBy,
  reason,
  severity = "warning",
}) {
  return {
    source,
    influence,
    rejectedBy,
    reason,
    severity,
  };
}

export function resolveStyleConflicts({
  brief,
  site,
  climate,
  localEvidence,
  portfolioEvidence,
  userIntentEvidence,
  regulations,
  programme,
  localStyle,
  compiledProject,
  initialWeights,
} = {}) {
  const conflicts = detectConflicts({
    brief,
    site,
    climate,
    programme,
    regulations,
    localStyle,
  }).map((conflict) => ({
    ...conflict,
    source: "constraintPriority",
  }));
  const rejectedInfluences = [];
  const qaWarnings = [];
  const qaErrors = [];
  let resolvedWeights = normalizeWeights(initialWeights);
  const redistributions = [];

  if (!portfolioEvidence?.hasPortfolioEvidence) {
    const redistributed = redistributePortfolioWeight(
      resolvedWeights,
      "No portfolio evidence was supplied; portfolio weight was redistributed to local, user, and climate sources.",
    );
    resolvedWeights = redistributed.weights;
    if (redistributed.redistribution) {
      redistributions.push(redistributed.redistribution);
      qaWarnings.push({
        code: "STYLE_BLEND_PORTFOLIO_EVIDENCE_EMPTY",
        severity: "warning",
        message:
          "Portfolio evidence is empty; portfolio influence is zero and redistributed transparently.",
      });
    }
  }

  const overheatingRisk = climate?.overheating?.risk_level || "unknown";
  const portfolioTokens = [
    portfolioEvidence?.materials,
    portfolioEvidence?.styles,
    portfolioEvidence?.tags,
  ];
  if (
    ["high", "medium", "moderate"].includes(lc(overheatingRisk)) &&
    hasAnyTerm(portfolioTokens, GLASS_RISK_TERMS)
  ) {
    rejectedInfluences.push(
      makeRejectedInfluence({
        influence: "unshaded/high-glass portfolio facade language",
        rejectedBy: "climate",
        reason:
          "Climate suitability outranks portfolio identity where overheating risk is material.",
      }),
    );
    conflicts.push({
      conflict_id: "climate-overrides-portfolio-glazing",
      higher_priority: "climate",
      lower_priority: "portfolio",
      higher_priority_kept: `overheating risk = ${overheatingRisk}`,
      lower_priority_dropped: "unshaded/high-glass portfolio facade language",
      severity: "warning",
      summary:
        "Climate suitability reduced portfolio glazing influence because overheating risk is material.",
      source: "styleBlendManifest",
    });
    const capped = capPortfolioWeight(
      resolvedWeights,
      0.05,
      "Climate conflict reduced portfolio influence.",
    );
    resolvedWeights = capped.weights;
    if (capped.redistribution) redistributions.push(capped.redistribution);
  }

  if (
    isFranceOrAlgeriaContext({ brief, site, localEvidence }) &&
    hasAnyTerm(portfolioTokens, UK_VERNACULAR_BLEED_TERMS)
  ) {
    rejectedInfluences.push(
      makeRejectedInfluence({
        influence: "UK vernacular portfolio language",
        rejectedBy: "local/jurisdiction",
        reason:
          "Resolved France/Algeria jurisdiction evidence outranks incompatible UK-vernacular portfolio references.",
      }),
    );
    conflicts.push({
      conflict_id: "jurisdiction-overrides-uk-vernacular-portfolio",
      higher_priority: "local",
      lower_priority: "portfolio",
      higher_priority_kept:
        localEvidence?.jurisdictionId || "resolved non-UK jurisdiction",
      lower_priority_dropped: "UK vernacular portfolio language",
      severity: "warning",
      summary:
        "Local jurisdiction evidence rejected UK-vernacular portfolio language.",
      source: "styleBlendManifest",
    });
    const capped = capPortfolioWeight(
      resolvedWeights,
      0.05,
      "Jurisdiction conflict reduced incompatible portfolio influence.",
    );
    resolvedWeights = capped.weights;
    if (capped.redistribution) redistributions.push(capped.redistribution);
  }

  const heritageFlagged =
    Array.isArray(localEvidence?.heritageFlags) &&
    localEvidence.heritageFlags.length > 0;
  if (
    (heritageFlagged || localEvidence?.conservationTypical === true) &&
    hasAnyTerm(portfolioTokens, CONTEXT_RISK_TERMS)
  ) {
    rejectedInfluences.push(
      makeRejectedInfluence({
        influence: "context-incompatible futuristic portfolio language",
        rejectedBy: "local",
        reason:
          "Local heritage/context constraints outrank portfolio identity.",
      }),
    );
    conflicts.push({
      conflict_id: "local-overrides-portfolio-context",
      higher_priority: "local",
      lower_priority: "portfolio",
      higher_priority_kept: "heritage/conservation local context",
      lower_priority_dropped:
        "context-incompatible futuristic portfolio language",
      severity: "warning",
      summary:
        "Local heritage/context reduced portfolio influence because the portfolio language conflicts with the site context.",
      source: "styleBlendManifest",
    });
    const capped = capPortfolioWeight(
      resolvedWeights,
      0.05,
      "Local heritage/context conflict reduced portfolio influence.",
    );
    resolvedWeights = capped.weights;
    if (capped.redistribution) redistributions.push(capped.redistribution);
  }

  if (
    isTerracedContext({ brief, localEvidence, compiledProject }) &&
    hasAnyTerm(portfolioEvidence?.buildingTypes, DETACHED_TERMS)
  ) {
    rejectedInfluences.push(
      makeRejectedInfluence({
        influence: "detached/freestanding portfolio typology",
        rejectedBy: "programme/local",
        reason:
          "Terraced programme/local typology outranks incompatible portfolio building type.",
      }),
    );
    conflicts.push({
      conflict_id: "programme-local-overrides-detached-portfolio",
      higher_priority: "programme/local",
      lower_priority: "portfolio",
      higher_priority_kept: "terraced/row-house typology",
      lower_priority_dropped: "detached/freestanding portfolio typology",
      severity: "warning",
      summary:
        "Terraced local/programme context rejected detached portfolio typology.",
      source: "styleBlendManifest",
    });
    const capped = capPortfolioWeight(
      resolvedWeights,
      0.05,
      "Terraced typology conflict reduced portfolio influence.",
    );
    resolvedWeights = capped.weights;
    if (capped.redistribution) redistributions.push(capped.redistribution);
  }

  const hardBlockerCount = Number(
    regulations?.rule_summary?.hard_blocker_count,
  );
  if (Number.isFinite(hardBlockerCount) && hardBlockerCount > 0) {
    qaErrors.push({
      code: "STYLE_BLEND_SAFETY_BLOCKER_PRESENT",
      severity: "error",
      message:
        "Safety/statutory blockers are present; style blending cannot override them.",
    });
  }

  return {
    conflicts,
    rejectedInfluences,
    resolvedWeights,
    redistributions,
    qaWarnings,
    qaErrors,
  };
}

function addMaterial(scored, entry, source, weight) {
  const name = materialName(entry);
  if (!name || weight <= 0) return;
  const key = lc(name);
  const existing = scored.get(key) || {
    name,
    material: name,
    score: 0,
    sources: new Set(),
    sourceTags: new Set(),
    application: inferApplication(name, entry?.application || entry?.role),
  };
  existing.score += Number(weight) || 0;
  existing.sources.add(source);
  existing.sourceTags.add(source);
  scored.set(key, existing);
}

function buildResolvedPalette({
  localStyle,
  localEvidence,
  climateEvidence,
  userIntentEvidence,
  portfolioEvidence,
  weights,
  materialWeights,
  rejectedInfluences,
}) {
  const scored = new Map();
  const rejectedText = rejectedInfluences
    .map((entry) => lc(entry.influence))
    .join(" ");

  const provenanceEntries = Array.isArray(
    localStyle?.material_palette_with_provenance,
  )
    ? localStyle.material_palette_with_provenance
    : [];
  provenanceEntries.forEach((entry) => {
    const sources = Array.isArray(entry.sources) ? entry.sources : ["local"];
    sources.forEach((source) => {
      if (source === "portfolio" && !portfolioEvidence.hasPortfolioEvidence) {
        return;
      }
      addMaterial(
        scored,
        entry.material || entry.name || entry,
        source,
        materialWeights[source] || weights[source] || 0,
      );
    });
  });

  localEvidence.materials.forEach((entry) =>
    addMaterial(scored, entry, "local", materialWeights.local || weights.local),
  );
  climateEvidence.climateResponses.forEach((entry) =>
    addMaterial(
      scored,
      entry,
      "climate",
      materialWeights.climate || weights.climate,
    ),
  );
  userIntentEvidence.materialPreferences.forEach((entry) =>
    addMaterial(scored, entry, "user", materialWeights.user || weights.user),
  );
  if (portfolioEvidence.hasPortfolioEvidence && weights.portfolio > 0) {
    portfolioEvidence.materials.forEach((entry) => {
      if (
        rejectedText &&
        isRejectedPortfolioMaterial(entry, rejectedInfluences)
      ) {
        return;
      }
      addMaterial(
        scored,
        entry,
        "portfolio",
        materialWeights.portfolio || weights.portfolio,
      );
    });
  }

  return [...scored.values()]
    .map((entry) => {
      const sourceTags = [...entry.sourceTags].sort();
      return {
        name: entry.name,
        material: entry.material,
        score: round(entry.score),
        sources: [...entry.sources].sort(),
        sourceTags,
        provenanceLabel: sourceTags.join("+"),
        application: `${entry.application} | ${sourceTags.join("+")}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function deriveLanguage({ localValue, userValues, portfolioValues, rejected }) {
  if (localValue) return { value: localValue, source: "local" };
  const user = uniqueStrings(userValues)[0] || null;
  if (user) return { value: user, source: "user" };
  const portfolio = uniqueStrings(portfolioValues).find(
    (entry) => !isRejectedPortfolioText(entry, rejected),
  );
  if (portfolio) return { value: portfolio, source: "portfolio" };
  return { value: null, source: null };
}

export function buildStyleBlendManifest({
  brief = {},
  site = {},
  climate = {},
  localStyle = {},
  portfolioItems = [],
  portfolioProfile = null,
  jurisdictionPack = null,
  jurisdictionPackResolution = null,
  compiledProject = null,
  projectGraphId = null,
  programme = null,
  regulations = null,
  userSettings = {},
} = {}) {
  const userIntentEvidence = buildUserIntentEvidence(brief, userSettings);
  const localEvidence = buildLocalEvidence({
    localStyle,
    site,
    jurisdictionPack,
  });
  const climateEvidence = buildClimateEvidence(climate);
  const portfolioEvidence = buildPortfolioEvidence({
    portfolioItems,
    portfolioProfile,
    selectedPortfolioMood: userIntentEvidence.portfolioMood,
  });
  const styleWeights = localStyle?.blend_weights
    ? normalizeWeights(localStyle.blend_weights)
    : computeBlendWeights({
        localBlendStrength: userIntentEvidence.localBlendStrength,
        innovationStrength: userIntentEvidence.innovationStrength,
        portfolioStyleStrength: userIntentEvidence.portfolioStyleStrength,
      });
  let materialPalette;
  try {
    materialPalette = computeMaterialPalette({
      brief,
      site,
      climate,
      jurisdictionPack,
      paletteSize: 8,
    });
  } catch {
    materialPalette = null;
  }
  const materialWeights = normalizeWeights(
    localStyle?.material_blend_weights ||
      materialPalette?.material_weights ||
      styleWeights,
  );
  const conflictResolution = resolveStyleConflicts({
    brief,
    site,
    climate,
    localEvidence,
    portfolioEvidence,
    userIntentEvidence,
    regulations,
    programme,
    localStyle,
    compiledProject,
    initialWeights: styleWeights,
  });
  const resolvedWeights = conflictResolution.resolvedWeights;
  const resolvedMaterialWeights = portfolioEvidence.hasPortfolioEvidence
    ? materialWeights
    : redistributePortfolioWeight(
        materialWeights,
        "No portfolio evidence was supplied; portfolio material weight was redistributed.",
      ).weights;
  const resolvedPalette = buildResolvedPalette({
    localStyle,
    localEvidence,
    climateEvidence,
    userIntentEvidence,
    portfolioEvidence,
    weights: resolvedWeights,
    materialWeights: resolvedMaterialWeights,
    rejectedInfluences: conflictResolution.rejectedInfluences,
  });

  const facade = deriveLanguage({
    localValue: localEvidence.facadeLanguage,
    userValues: userIntentEvidence.styleKeywords,
    portfolioValues: [portfolioEvidence.styles, portfolioEvidence.tags],
    rejected: conflictResolution.rejectedInfluences,
  });
  const roof = deriveLanguage({
    localValue: localEvidence.roofLanguage,
    userValues: userIntentEvidence.styleKeywords.filter((entry) =>
      /roof|tile|slate|parapet|gable|flat/i.test(entry),
    ),
    portfolioValues: [portfolioEvidence.styles, portfolioEvidence.tags],
    rejected: conflictResolution.rejectedInfluences,
  });
  const windows = deriveLanguage({
    localValue: localEvidence.windowLanguage,
    userValues: userIntentEvidence.styleKeywords.filter((entry) =>
      /window|opening|glaz|fenestration|rhythm/i.test(entry),
    ),
    portfolioValues: [portfolioEvidence.tags],
    rejected: conflictResolution.rejectedInfluences,
  });
  const massing = deriveLanguage({
    localValue: localEvidence.massingLanguage,
    userValues: userIntentEvidence.styleKeywords.filter((entry) =>
      /massing|terrace|courtyard|compact|villa|detached/i.test(entry),
    ),
    portfolioValues: [portfolioEvidence.buildingTypes, portfolioEvidence.tags],
    rejected: conflictResolution.rejectedInfluences,
  });

  const sourceGaps = [];
  const qaWarnings = [...conflictResolution.qaWarnings];
  if (!localEvidence.materials.length) {
    sourceGaps.push({
      code: "STYLE_BLEND_LOCAL_EVIDENCE_MISSING",
      severity: "warning",
      message:
        "No local material evidence was available; downstream renderers must use explicit source gaps rather than invented local evidence.",
    });
  }
  if (
    !jurisdictionPack ||
    jurisdictionPack?.jurisdictionId === "generic" ||
    jurisdictionPackResolution?.source === "generic_fallback"
  ) {
    sourceGaps.push({
      code: "STYLE_BLEND_JURISDICTION_PACK_MISSING",
      severity: "warning",
      message:
        "Specific jurisdiction/local style pack was not resolved; using advisory generic evidence only.",
    });
  }
  sourceGaps.push(...(jurisdictionPackResolution?.sourceGaps || []));
  sourceGaps.push(...(portfolioEvidence.sourceGaps || []));
  qaWarnings.push(...sourceGaps);

  const jurisdiction = {
    jurisdictionId:
      jurisdictionPack?.jurisdictionId || localEvidence.jurisdictionId || null,
    countryCode: jurisdictionPack?.countryCode || null,
    countryName: jurisdictionPack?.countryName || null,
    packVersion: jurisdictionPack?.version || null,
    resolutionSource: jurisdictionPackResolution?.source || null,
  };
  const location = {
    address: brief?.site_input?.address || site?.address || null,
    postcode: brief?.site_input?.postcode || site?.postcode || null,
    lat: brief?.site_input?.lat ?? site?.lat ?? null,
    lon: brief?.site_input?.lon ?? site?.lon ?? null,
    region: site?.region || site?.country || brief?.site_input?.region || null,
  };
  const manifestBody = {
    version: STYLE_BLEND_MANIFEST_VERSION,
    jurisdiction,
    location,
    geometryHash:
      compiledProject?.geometryHash || compiledProject?.geometry_hash || null,
    projectGraphId: projectGraphId || null,
    localStyleEvidence: localEvidence,
    portfolioStyleEvidence: portfolioEvidence,
    userIntentEvidence,
    climateEvidence,
    blendWeights: resolvedWeights,
    requestedBlendWeights: normalizeWeights(styleWeights),
    materialWeights: resolvedMaterialWeights,
    requestedMaterialWeights: normalizeWeights(materialWeights),
    resolvedPalette,
    facadeLanguage:
      facade.value || localEvidence.facadeLanguage || "contextual facade",
    facadeLanguageSource: facade.source,
    roofLanguage: roof.value || localEvidence.roofLanguage || "contextual roof",
    roofLanguageSource: roof.source,
    windowLanguage:
      windows.value || localEvidence.windowLanguage || "contextual openings",
    windowLanguageSource: windows.source,
    massingLanguage: massing.value,
    massingLanguageSource: massing.source,
    detailLanguage:
      resolvedPalette
        .filter((entry) => /detail|openings/.test(entry.application))
        .map((entry) => entry.name)
        .slice(0, 3)
        .join(", ") ||
      localEvidence.windowLanguage ||
      resolvedPalette
        .map((entry) => entry.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(", ") ||
      "contextual detailing",
    graphicPresentationStyle:
      portfolioEvidence.hasPortfolioEvidence &&
      !conflictResolution.rejectedInfluences.some((entry) =>
        /graphic/i.test(entry.influence),
      )
        ? portfolioEvidence.graphicPresentationStyle
        : null,
    conflicts: conflictResolution.conflicts,
    rejectedInfluences: conflictResolution.rejectedInfluences,
    redistributions: conflictResolution.redistributions,
    qaWarnings,
    qaErrors: conflictResolution.qaErrors,
    sourceGaps,
    authorityPriority: [...PRIORITY],
  };
  const manifestHash = computeCDSHashSync(manifestBody);
  const manifestId = createStableId(
    "style-blend",
    manifestHash,
    manifestBody.geometryHash || "no-geometry",
  );
  return {
    ...manifestBody,
    manifestId,
    manifestHash,
  };
}

function asIssue(code, severity, message, details = {}) {
  return { code, severity, message, details };
}

function issueSeverity(strict, fallback = "warning") {
  return strict ? "error" : fallback;
}

function collectTextFragments(value, depth = 0) {
  if (value == null || depth > 5) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextFragments(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => collectTextFragments(value[key], depth + 1));
  }
  return [];
}

function materialNamesFromEvidence(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.flatMap((entry) => {
        if (entry == null) return [];
        if (typeof entry === "string") return [entry];
        return [
          materialName(entry),
          entry.material,
          entry.name,
          entry.label,
          entry.displayName,
        ];
      }),
    );
  }
  if (typeof value === "object") {
    return uniqueStrings([
      materialNamesFromEvidence(value.materials),
      materialNamesFromEvidence(value.palette),
      materialNamesFromEvidence(value.resolvedPalette),
      materialNamesFromEvidence(value.cardMetadata),
      materialNamesFromEvidence(value.metadata?.materials),
    ]);
  }
  return [];
}

function namesOverlap(left = [], right = []) {
  const normalizedLeft = left.map(comparableText).filter(Boolean);
  const normalizedRight = right.map(comparableText).filter(Boolean);
  return normalizedLeft.some((a) =>
    normalizedRight.some((b) => a.includes(b) || b.includes(a)),
  );
}

function normalizeEvidenceArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
}

function promptTextFromEvidence(record) {
  if (!record || typeof record !== "object") return "";
  return [
    record.promptText,
    record.finalPrompt,
    record.lockBlock,
    record.prompt,
    record.metadata?.promptText,
    record.metadata?.finalPrompt,
    record.metadata?.lockBlock,
    record.metadata?.prompt,
  ]
    .map(compactText)
    .filter(Boolean)
    .join("\n");
}

function promptHashFromEvidence(record) {
  return (
    record?.styleBlendManifestHash ||
    record?.metadata?.styleBlendManifestHash ||
    null
  );
}

function collectPromptEvidence({ promptEvidence, panelArtifacts }) {
  const supplied = normalizeEvidenceArray(promptEvidence);
  const panels = normalizeEvidenceArray(panelArtifacts).filter((artifact) =>
    ["hero_3d", "exterior_render", "interior_3d", "axonometric"].includes(
      artifact?.panel_type || artifact?.panelType,
    ),
  );
  return [...supplied, ...panels];
}

function promptContainsExpectedHash(text, expected) {
  if (!text || !expected) return false;
  return (
    text.includes(`styleBlendManifestHash: ${expected}`) ||
    text.includes(`StyleBlendManifest: ${expected}`) ||
    text.includes(expected)
  );
}

function rejectedPromptTerms(rejectedInfluences = []) {
  const terms = new Set();
  rejectedInfluences.forEach((entry) => {
    const influence = compactText(entry?.influence || entry?.message || "");
    if (!influence) return;
    terms.add(influence);
    const text = lc(influence);
    if (/glass|glaz|curtain wall/.test(text)) {
      [...GLASS_RISK_TERMS, "all glass", "high glass"].forEach((term) =>
        terms.add(term),
      );
    }
    if (/sci-fi|futur|alien|blob|parametric/.test(text)) {
      [...CONTEXT_RISK_TERMS, "futuristic"].forEach((term) => terms.add(term));
    }
    if (/detached house/.test(text)) {
      terms.add("detached house");
    }
    if (/uk vernacular|uk pack/.test(text)) {
      UK_VERNACULAR_BLEED_TERMS.forEach((term) => terms.add(term));
    }
  });
  return [...terms].map(comparableText).filter((term) => term.length > 3);
}

function textContainsComparableTerm(text, term) {
  const normalized = comparableText(text);
  const needle = comparableText(term);
  return Boolean(normalized && needle && normalized.includes(needle));
}

function isStrongLocalContext(styleBlendManifest) {
  const localEvidence = styleBlendManifest?.localStyleEvidence || {};
  const conflicts = Array.isArray(styleBlendManifest?.conflicts)
    ? styleBlendManifest.conflicts
    : [];
  const rejected = Array.isArray(styleBlendManifest?.rejectedInfluences)
    ? styleBlendManifest.rejectedInfluences
    : [];
  const localWeight = Number(styleBlendManifest?.blendWeights?.local || 0);
  const explicitLocalConstraint =
    localEvidence.conservationTypical === true ||
    (Array.isArray(localEvidence.heritageFlags) &&
      localEvidence.heritageFlags.length > 0);
  const conflictBackedConstraint =
    conflicts.some(
      (conflict) =>
        lc(conflict?.lower_priority).includes("portfolio") &&
        /local|jurisdiction|heritage|conservation|climate|programme/.test(
          lc(conflict?.higher_priority || conflict?.higher_priority_kept),
        ),
    ) ||
    rejected.some((entry) =>
      /local|jurisdiction|heritage|conservation|climate|programme/.test(
        lc(entry?.rejectedBy),
      ),
    );
  return (
    explicitLocalConstraint ||
    conflictBackedConstraint ||
    (localWeight >= 0.55 &&
      (explicitLocalConstraint || conflictBackedConstraint))
  );
}

function isFranceOrAlgeria(jurisdiction = {}) {
  const id = lc(jurisdiction.jurisdictionId);
  const code = lc(jurisdiction.countryCode);
  const name = lc(jurisdiction.countryName);
  return (
    ["fr", "fra", "dz", "dza"].includes(code) ||
    id === "france" ||
    id === "algeria" ||
    name.includes("france") ||
    name.includes("algeria")
  );
}

function buildJurisdictionBleedText({
  styleBlendManifest,
  visualManifest,
  sheetDesignContext,
  a1MaterialPalette,
  promptRecords,
}) {
  const visualEvidence = visualManifest
    ? {
        localStyle: visualManifest.localStyle,
        styleKeywords: visualManifest.styleKeywords,
        materials: visualManifest.materials,
        resolvedPalette: visualManifest.resolvedPalette,
        styleBlend: visualManifest.styleBlend,
        facadeLanguage: visualManifest.facadeLanguage,
        roofLanguage: visualManifest.roofLanguage,
        windowLanguage: visualManifest.windowLanguage,
        detailLanguage: visualManifest.detailLanguage,
      }
    : null;
  const sheetEvidence = sheetDesignContext
    ? {
        style: sheetDesignContext.style,
        materials: sheetDesignContext.materials,
        portfolioBlend: sheetDesignContext.portfolioBlend,
      }
    : null;
  return [
    collectTextFragments(styleBlendManifest?.localStyleEvidence),
    collectTextFragments(styleBlendManifest?.resolvedPalette),
    collectTextFragments({
      facadeLanguage: styleBlendManifest?.facadeLanguage,
      roofLanguage: styleBlendManifest?.roofLanguage,
      windowLanguage: styleBlendManifest?.windowLanguage,
      detailLanguage: styleBlendManifest?.detailLanguage,
    }),
    collectTextFragments(visualEvidence),
    collectTextFragments(sheetEvidence),
    collectTextFragments(a1MaterialPalette),
    promptRecords.map(promptTextFromEvidence),
  ]
    .flat()
    .join("\n");
}

export function evaluateStyleBlendQA({
  styleBlendManifest = null,
  visualManifest = null,
  sheetDesignContext = null,
  panelArtifacts = null,
  a1MaterialPalette = null,
  promptEvidence = null,
  strict = true,
} = {}) {
  const issues = [];
  if (!styleBlendManifest?.manifestHash) {
    issues.push(
      asIssue(
        "STYLE_BLEND_MANIFEST_MISSING",
        "error",
        "StyleBlendManifest is missing from the ProjectGraph output.",
      ),
    );
  }
  const expected = styleBlendManifest?.manifestHash || null;
  if (
    expected &&
    visualManifest?.styleBlendManifestHash &&
    visualManifest.styleBlendManifestHash !== expected
  ) {
    issues.push(
      asIssue(
        "STYLE_BLEND_VISUAL_MANIFEST_HASH_MISMATCH",
        "error",
        "visualManifest.styleBlendManifestHash does not match StyleBlendManifest.manifestHash.",
        {
          expected,
          actual: visualManifest.styleBlendManifestHash,
        },
      ),
    );
  }
  if (
    expected &&
    sheetDesignContext?.styleBlendManifestHash &&
    sheetDesignContext.styleBlendManifestHash !== expected
  ) {
    issues.push(
      asIssue(
        "STYLE_BLEND_SHEET_CONTEXT_HASH_MISMATCH",
        "error",
        "SheetDesignContext styleBlendManifestHash does not match StyleBlendManifest.manifestHash.",
        {
          expected,
          actual: sheetDesignContext.styleBlendManifestHash,
        },
      ),
    );
  }
  const panels = panelArtifacts ? Object.values(panelArtifacts) : [];
  const visualPanels = panels.filter((artifact) =>
    ["hero_3d", "exterior_render", "interior_3d", "axonometric"].includes(
      artifact?.panel_type || artifact?.panelType,
    ),
  );
  visualPanels.forEach((artifact) => {
    const panelType = artifact.panel_type || artifact.panelType;
    const actual =
      artifact.styleBlendManifestHash ||
      artifact.metadata?.styleBlendManifestHash ||
      null;
    if (expected && actual !== expected) {
      issues.push(
        asIssue(
          "STYLE_BLEND_VISUAL_PANEL_HASH_MISSING_OR_MISMATCHED",
          "warning",
          `Visual panel ${panelType} does not carry the matching styleBlendManifestHash.`,
          { panelType, expected, actual },
        ),
      );
    }
  });
  if (
    styleBlendManifest?.portfolioStyleEvidence?.hasPortfolioEvidence ===
      false &&
    Number(styleBlendManifest?.blendWeights?.portfolio || 0) > 0
  ) {
    issues.push(
      asIssue(
        "STYLE_BLEND_EMPTY_PORTFOLIO_HAS_WEIGHT",
        "error",
        "Portfolio weight must be zero when no portfolio evidence exists.",
        { blendWeights: styleBlendManifest.blendWeights },
      ),
    );
  }
  const missingLanguageFields = [
    "facadeLanguage",
    "roofLanguage",
    "windowLanguage",
    "detailLanguage",
  ].filter((field) => !compactText(styleBlendManifest?.[field]));
  if (
    !Array.isArray(styleBlendManifest?.resolvedPalette) ||
    styleBlendManifest.resolvedPalette.length === 0
  ) {
    missingLanguageFields.push("resolvedPalette");
  }
  if (styleBlendManifest?.manifestHash && missingLanguageFields.length > 0) {
    issues.push(
      asIssue(
        "STYLE_BLEND_MANIFEST_LANGUAGE_MISSING",
        issueSeverity(strict),
        "StyleBlendManifest is missing required language or palette fields.",
        { missingFields: missingLanguageFields },
      ),
    );
  }

  const resolvedMaterialNames = materialNamesFromEvidence(
    styleBlendManifest?.resolvedPalette,
  );
  const a1MaterialNames = materialNamesFromEvidence(a1MaterialPalette);
  if (
    styleBlendManifest?.manifestHash &&
    a1MaterialPalette != null &&
    resolvedMaterialNames.length > 0 &&
    (a1MaterialNames.length === 0 ||
      !namesOverlap(resolvedMaterialNames, a1MaterialNames))
  ) {
    issues.push(
      asIssue(
        "STYLE_BLEND_A1_PALETTE_DRIFT",
        issueSeverity(strict),
        "A1 material palette evidence does not match the resolved StyleBlendManifest palette.",
        {
          resolvedMaterialNames,
          a1MaterialNames,
        },
      ),
    );
  }

  if (
    styleBlendManifest?.manifestHash &&
    isStrongLocalContext(styleBlendManifest) &&
    Number(styleBlendManifest?.blendWeights?.portfolio || 0) >
      STYLE_BLEND_PORTFOLIO_LIMITS.strongLocal
  ) {
    issues.push(
      asIssue(
        "STYLE_BLEND_PORTFOLIO_OVERWEIGHT",
        issueSeverity(strict),
        "Portfolio weight exceeds the allowed cap for heritage/high-local constraint contexts.",
        {
          portfolioWeight: Number(styleBlendManifest.blendWeights.portfolio),
          allowedPortfolioWeight: STYLE_BLEND_PORTFOLIO_LIMITS.strongLocal,
          blendWeights: styleBlendManifest.blendWeights,
        },
      ),
    );
  }

  const promptRecords = collectPromptEvidence({
    promptEvidence,
    panelArtifacts,
  });
  promptRecords.forEach((record, index) => {
    const panelType =
      record?.panel_type || record?.panelType || `prompt_${index}`;
    const text = promptTextFromEvidence(record);
    const actualHash = promptHashFromEvidence(record);
    if (
      expected &&
      ((text && !promptContainsExpectedHash(text, expected)) ||
        (record?.promptHash && actualHash !== expected))
    ) {
      issues.push(
        asIssue(
          "STYLE_BLEND_PROMPT_HASH_MISSING",
          issueSeverity(strict),
          `Prompt evidence for ${panelType} does not carry the matching styleBlendManifestHash.`,
          { panelType, expected, actual: actualHash },
        ),
      );
    }
  });

  const rejectedTerms = rejectedPromptTerms(
    styleBlendManifest?.rejectedInfluences || [],
  );
  promptRecords.forEach((record, index) => {
    const text = promptTextFromEvidence(record);
    if (!text || rejectedTerms.length === 0) return;
    const leakedTerm = rejectedTerms.find((term) =>
      textContainsComparableTerm(text, term),
    );
    if (leakedTerm) {
      issues.push(
        asIssue(
          "STYLE_BLEND_REJECTED_INFLUENCE_LEAK",
          issueSeverity(strict),
          "Final prompt evidence contains a rejected style influence.",
          {
            panelType:
              record?.panel_type || record?.panelType || `prompt_${index}`,
            leakedTerm,
          },
        ),
      );
    }
  });

  if (isFranceOrAlgeria(styleBlendManifest?.jurisdiction || {})) {
    const bleedText = buildJurisdictionBleedText({
      styleBlendManifest,
      visualManifest,
      sheetDesignContext,
      a1MaterialPalette,
      promptRecords,
    });
    const matchedTerm = UK_VERNACULAR_BLEED_TERMS.find((term) =>
      textContainsComparableTerm(bleedText, term),
    );
    if (matchedTerm) {
      issues.push(
        asIssue(
          "STYLE_BLEND_JURISDICTION_VERNACULAR_BLEED",
          issueSeverity(strict),
          "France/Algeria style evidence contains UK vernacular pack language.",
          {
            jurisdiction: styleBlendManifest.jurisdiction,
            matchedTerm,
          },
        ),
      );
    }
  }

  (styleBlendManifest?.qaErrors || []).forEach((issue) =>
    issues.push(asIssue(issue.code, "error", issue.message, issue)),
  );
  (styleBlendManifest?.qaWarnings || []).forEach((issue) =>
    issues.push(asIssue(issue.code, "warning", issue.message, issue)),
  );

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  return {
    version: "style-blend-qa-v1",
    status: errorCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass",
    expectedStyleBlendManifestHash: expected,
    errorCount,
    warningCount,
    issues,
  };
}

export default {
  STYLE_BLEND_MANIFEST_VERSION,
  buildStyleBlendManifest,
  resolveStyleConflicts,
  evaluateStyleBlendQA,
};
