import ukPack from "./data/uk.json" with { type: "json" };
import francePack from "./data/france.json" with { type: "json" };
import algeriaPack from "./data/algeria.json" with { type: "json" };
import genericPack from "./data/generic.json" with { type: "json" };

export const JURISDICTION_PACK_SERVICE_VERSION = "jurisdiction-pack-service-v1";

export const GENERIC_JURISDICTION_WARNING =
  "JURISDICTION_PACK_GENERIC_FALLBACK";

const PACKS = Object.freeze({
  uk: ukPack,
  france: francePack,
  algeria: algeriaPack,
  generic: genericPack,
});

const COUNTRY_ALIASES = Object.freeze({
  uk: "uk",
  gb: "uk",
  gbr: "uk",
  britain: "uk",
  "great britain": "uk",
  "united kingdom": "uk",
  england: "uk",
  scotland: "uk",
  wales: "uk",
  "northern ireland": "uk",
  fr: "france",
  fra: "france",
  france: "france",
  "republique francaise": "france",
  "république française": "france",
  dz: "algeria",
  dza: "algeria",
  algeria: "algeria",
  algerie: "algeria",
  algérie: "algeria",
  الجزائر: "algeria",
  generic: "generic",
  international: "generic",
});

const REQUIRED_PACK_FIELDS = Object.freeze([
  "jurisdictionId",
  "countryCode",
  "countryName",
  "version",
  "languages",
  "defaultLanguage",
  "units",
  "drawingScales",
  "titleBlockLabels",
  "drawingStatusLabels",
  "cadLayerPreferences",
  "defaultCadLayers",
  "materialHatchPreferences",
  "climateAssumptions",
  "localStyleDefaults",
  "planningRegulatoryChecklist",
  "structuralAssumptions",
  "mepAssumptions",
  "disclaimers",
  "reviewRequirements",
  "exportNamingConventions",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compactText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sourceGap(message, details = {}) {
  return {
    code: GENERIC_JURISDICTION_WARNING,
    severity: "warning",
    message,
    details,
  };
}

function resolveAlias(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (COUNTRY_ALIASES[raw]) return COUNTRY_ALIASES[raw];
  const compact = compactText(raw);
  return COUNTRY_ALIASES[compact] || null;
}

function inferFromAddress(address = "") {
  const raw = String(address || "");
  const compact = compactText(raw);
  if (!compact) return null;
  if (
    /\b(united kingdom|great britain|england|scotland|wales|northern ireland|scunthorpe)\b/i.test(
      raw,
    ) ||
    /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(raw)
  ) {
    return "uk";
  }
  if (
    /\b(france|paris|lyon|marseille|republique francaise|république française)\b/i.test(
      raw,
    ) ||
    (/\b\d{5}\b/.test(raw) && /\bfrance\b/i.test(raw))
  ) {
    return "france";
  }
  if (
    /\b(algeria|algerie|algérie|algiers|alger|oran|constantine|wilaya)\b/i.test(
      raw,
    ) ||
    /الجزائر/.test(raw) ||
    (/\b\d{5}\b/.test(raw) && /\b(dz|dza|algeria|algerie|algérie)\b/i.test(raw))
  ) {
    return "algeria";
  }
  if (compact.includes("alger")) return "algeria";
  return null;
}

function assertPackKnown(id, input) {
  if (id && PACKS[id]) return id;
  const error = new Error(
    `JURISDICTION_PACK_NOT_FOUND: ${input || "unknown jurisdiction"}`,
  );
  error.code = "JURISDICTION_PACK_NOT_FOUND";
  error.jurisdiction = input || null;
  throw error;
}

function packWithValidation(pack) {
  const cloned = clone(pack);
  const validation = validateJurisdictionPack(cloned);
  if (!validation.valid) {
    const error = new Error(
      `JURISDICTION_PACK_INVALID: ${validation.errors.map((entry) => entry.code).join(", ")}`,
    );
    error.code = "JURISDICTION_PACK_INVALID";
    error.errors = validation.errors;
    throw error;
  }
  return cloned;
}

export function loadJurisdictionPack(jurisdiction, options = {}) {
  const id = resolveAlias(jurisdiction) || compactText(jurisdiction);
  if (id && PACKS[id]) return packWithValidation(PACKS[id]);
  if (options.allowGenericFallback === true) {
    return packWithValidation(PACKS.generic);
  }
  assertPackKnown(id, jurisdiction);
  return null;
}

export function resolveJurisdictionPack({
  address = null,
  country = null,
  countryCode = null,
  coordinates = null,
  locale = null,
  brief = null,
} = {}) {
  const explicitJurisdiction =
    brief?.jurisdiction ||
    brief?.jurisdictionId ||
    brief?.jurisdiction_id ||
    brief?.regulatory_jurisdiction ||
    null;
  const explicitId = resolveAlias(explicitJurisdiction);
  if (explicitId && explicitId !== "generic") {
    return {
      pack: loadJurisdictionPack(explicitId),
      jurisdictionId: explicitId,
      source: "brief.jurisdiction",
      warnings: [],
      sourceGaps: [],
    };
  }

  const countryInput =
    countryCode ||
    country ||
    brief?.countryCode ||
    brief?.country_code ||
    brief?.country ||
    null;
  const countryId = resolveAlias(countryInput);
  if (countryId && countryId !== "generic") {
    return {
      pack: loadJurisdictionPack(countryId),
      jurisdictionId: countryId,
      source: countryCode || brief?.countryCode ? "countryCode" : "country",
      warnings: [],
      sourceGaps: [],
    };
  }

  const addressText = [
    address,
    brief?.address,
    brief?.site_input?.address,
    brief?.site_input?.postcode,
    brief?.siteInput?.address,
    brief?.siteInput?.postcode,
  ]
    .filter(Boolean)
    .join(" ");
  const addressId = inferFromAddress(addressText);
  if (addressId) {
    return {
      pack: loadJurisdictionPack(addressId),
      jurisdictionId: addressId,
      source: "address",
      warnings: [],
      sourceGaps: [],
    };
  }

  const localeId = resolveAlias(locale);
  if (localeId && localeId !== "generic") {
    return {
      pack: loadJurisdictionPack(localeId),
      jurisdictionId: localeId,
      source: "locale",
      warnings: [],
      sourceGaps: [],
    };
  }

  const warning = sourceGap(
    "Jurisdiction could not be resolved from explicit jurisdiction, country, address, locale, or coordinates; using declared generic advisory pack.",
    { address: addressText || null, country: countryInput, coordinates },
  );
  return {
    pack: loadJurisdictionPack("generic", { allowGenericFallback: true }),
    jurisdictionId: "generic",
    source: "generic_fallback",
    warnings: [warning],
    sourceGaps: [warning],
  };
}

export function summarizeJurisdictionPack(pack = null) {
  if (!pack) return null;
  return {
    jurisdictionId: pack.jurisdictionId || null,
    countryCode: pack.countryCode || null,
    countryName: pack.countryName || null,
    version: pack.version || null,
    languages: asArray(pack.languages),
    defaultLanguage: pack.defaultLanguage || null,
    units: clone(pack.units || {}),
    drawingScales: asArray(pack.drawingScales),
    titleBlockLabels: clone(pack.titleBlockLabels || {}),
    a1TitleBlockLabels: clone(pack.a1TitleBlockLabels || {}),
    alternateTitleBlockLabels: clone(pack.alternateTitleBlockLabels || {}),
    drawingStatusLabels: clone(pack.drawingStatusLabels || {}),
    cadLayerPreferences: clone(pack.cadLayerPreferences || {}),
    defaultCadLayers: asArray(pack.defaultCadLayers),
    materialHatchPreferences: clone(pack.materialHatchPreferences || {}),
    localStyleDefaults: clone(pack.localStyleDefaults || {}),
    climateAssumptions: clone(pack.climateAssumptions || {}),
    planningRegulatoryChecklist: clone(pack.planningRegulatoryChecklist || {}),
    structuralAssumptions: clone(pack.structuralAssumptions || {}),
    mepAssumptions: clone(pack.mepAssumptions || {}),
    disclaimers: clone(pack.disclaimers || {}),
    reviewRequirements: clone(pack.reviewRequirements || {}),
    exportNamingConventions: clone(pack.exportNamingConventions || {}),
  };
}

export function packHasFalseComplianceClaim(pack = {}) {
  const haystack = JSON.stringify(pack || {});
  return /\b(code compliant|approved for construction|certified for construction|legally approved|permit approved)\b/i.test(
    haystack,
  );
}

export function validateJurisdictionPack(pack = {}) {
  const errors = [];
  const warnings = [];
  REQUIRED_PACK_FIELDS.forEach((field) => {
    if (pack?.[field] === undefined || pack?.[field] === null) {
      errors.push({
        code: "JURISDICTION_PACK_FIELD_MISSING",
        message: `Jurisdiction pack is missing ${field}.`,
        details: { field },
      });
    }
  });
  if (!asArray(pack.languages).includes(pack.defaultLanguage)) {
    errors.push({
      code: "JURISDICTION_PACK_DEFAULT_LANGUAGE_INVALID",
      message: "defaultLanguage must be listed in languages.",
      details: { defaultLanguage: pack.defaultLanguage },
    });
  }
  if (!asArray(pack.defaultCadLayers).length) {
    errors.push({
      code: "JURISDICTION_PACK_CAD_LAYERS_MISSING",
      message: "Jurisdiction pack must declare default CAD layers.",
    });
  }
  if (!pack.disclaimers?.preliminaryAdvisory) {
    errors.push({
      code: "JURISDICTION_PACK_DISCLAIMER_MISSING",
      message:
        "Jurisdiction pack must include preliminary advisory disclaimer text.",
    });
  }
  if (packHasFalseComplianceClaim(pack)) {
    errors.push({
      code: "JURISDICTION_PACK_FALSE_COMPLIANCE_CLAIM",
      message:
        "Jurisdiction packs must not claim legal/code compliance or construction approval.",
    });
  }
  if (pack.jurisdictionId === "generic") {
    warnings.push(
      sourceGap("Generic jurisdiction pack is advisory fallback only."),
    );
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks: {
      hasVersion: Boolean(pack.version),
      hasCountryCode: Boolean(pack.countryCode),
      hasTitleBlockLabels: Boolean(pack.titleBlockLabels),
      hasCadLayers: asArray(pack.defaultCadLayers).length > 0,
      hasDisclaimer: Boolean(pack.disclaimers?.preliminaryAdvisory),
      falseComplianceClaim: packHasFalseComplianceClaim(pack),
    },
  };
}

export default {
  JURISDICTION_PACK_SERVICE_VERSION,
  GENERIC_JURISDICTION_WARNING,
  loadJurisdictionPack,
  resolveJurisdictionPack,
  summarizeJurisdictionPack,
  validateJurisdictionPack,
  packHasFalseComplianceClaim,
};
