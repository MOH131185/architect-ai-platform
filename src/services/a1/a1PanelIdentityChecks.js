import { getCanonicalMaterialPalette } from "../design/canonicalMaterialPalette.js";
import { resolveHeroGenerationDependencies } from "../design/heroDesignAuthorityService.js";

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function compareText(expected = "", actual = "", options = {}) {
  const left = normalizeText(expected);
  const right = normalizeText(actual);
  if (!left && !right) {
    return {
      matches: true,
      expected,
      actual,
      missingActual: false,
      missingExpected: false,
      note: options.note || null,
    };
  }
  if (left && !right) {
    return {
      matches: false,
      expected,
      actual,
      missingActual: true,
      missingExpected: false,
      note: options.note || null,
    };
  }
  if (!left && right) {
    return {
      matches: true,
      expected,
      actual,
      missingActual: false,
      missingExpected: true,
      note: options.note || null,
    };
  }

  const matches =
    left === right ||
    left.includes(right) ||
    right.includes(left) ||
    (options.aliases || []).some((alias) => {
      const normalized = normalizeText(alias);
      return normalized === left || normalized === right;
    });

  return {
    matches,
    expected,
    actual,
    missingActual: false,
    missingExpected: false,
    note: options.note || null,
  };
}

function normalizeRoofLanguageValue(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.includes("flat") || normalized.includes("parapet")) {
    return "flat";
  }
  if (normalized.includes("hip")) {
    return "hip";
  }
  if (normalized.includes("gable") || normalized.includes("pitched")) {
    return "pitched";
  }
  if (normalized.includes("shed")) {
    return "shed";
  }
  return normalized;
}

function deriveExpectedEntrance(projectGeometry = {}) {
  const entrance =
    projectGeometry?.entrances?.[0] || projectGeometry?.doors?.[0];
  if (!entrance?.position_m) {
    return null;
  }
  return `front facade near ${Math.round(Number(entrance.position_m.x || 0) * 10) / 10}m datum`;
}

function deriveExpectedWindowRhythm(
  projectGeometry = {},
  facadeGrammar = null,
) {
  return (
    resolveHeroGenerationDependencies({
      projectGeometry,
      facadeGrammar,
    }).windowRhythm || null
  );
}

export function runHeroIdentityChecks({
  visualPackage = null,
  projectGeometry = {},
  facadeGrammar = null,
} = {}) {
  const heroIdentity =
    visualPackage?.identitySpec ||
    visualPackage?.designFingerprint?.heroIdentitySpec ||
    null;
  const canonicalPalette = getCanonicalMaterialPalette({
    dna: {},
    projectGeometry,
    facadeGrammar: facadeGrammar || {},
  });
  const expected = {
    storeyCount: Math.max(1, (projectGeometry.levels || []).length),
    roofLanguage:
      facadeGrammar?.style_bridge?.roof_language ||
      projectGeometry?.roof?.type ||
      null,
    windowRhythm: deriveExpectedWindowRhythm(projectGeometry, facadeGrammar),
    entrancePosition: deriveExpectedEntrance(projectGeometry),
    primaryMaterial: canonicalPalette.primary?.name || null,
    roofMaterial: canonicalPalette.roof?.name || null,
  };
  const expectedRoofLanguage = normalizeRoofLanguageValue(
    expected.roofLanguage,
  );
  const actualRoofLanguage = normalizeRoofLanguageValue(
    heroIdentity?.roofLanguage,
  );
  const comparisons = [
    {
      key: "storeyCount",
      expected: expected.storeyCount,
      actual: heroIdentity?.storeyCount || null,
      missingActual:
        heroIdentity?.storeyCount === undefined ||
        heroIdentity?.storeyCount === null,
      matches:
        heroIdentity?.storeyCount !== undefined &&
        heroIdentity?.storeyCount !== null &&
        Number(heroIdentity?.storeyCount || 0) === Number(expected.storeyCount),
    },
    {
      key: "roofLanguage",
      expected: expected.roofLanguage,
      actual: heroIdentity?.roofLanguage,
      missingActual: !actualRoofLanguage,
      matches: !expectedRoofLanguage
        ? true
        : Boolean(actualRoofLanguage) &&
          expectedRoofLanguage === actualRoofLanguage,
    },
    {
      key: "windowRhythm",
      ...compareText(expected.windowRhythm, heroIdentity?.windowRhythm),
    },
    {
      key: "entrancePosition",
      ...compareText(expected.entrancePosition, heroIdentity?.entrancePosition),
    },
    {
      key: "primaryMaterial",
      ...compareText(
        expected.primaryMaterial,
        heroIdentity?.primaryMaterial?.name,
      ),
    },
    {
      key: "roofMaterial",
      ...compareText(expected.roofMaterial, heroIdentity?.roofMaterial?.name),
    },
  ];

  const blockers = [];
  const warnings = [];

  comparisons.forEach((comparison) => {
    if (comparison.matches) {
      return;
    }
    if (comparison.missingActual) {
      warnings.push(
        `Hero identity metadata for ${comparison.key} is missing; expected "${comparison.expected}".`,
      );
      return;
    }
    if (comparison.key === "storeyCount" || comparison.key === "roofLanguage") {
      blockers.push(
        `Hero identity drift detected for ${comparison.key}: expected "${comparison.expected}" but received "${comparison.actual}".`,
      );
      return;
    }
    warnings.push(
      `Hero identity drift detected for ${comparison.key}: expected "${comparison.expected}" but received "${comparison.actual}".`,
    );
  });

  return {
    version: "phase8-a1-panel-identity-checks-v1",
    expected,
    comparisons,
    warnings,
    blockers,
    driftDetected: blockers.length > 0 || warnings.length > 0,
  };
}

export default {
  runHeroIdentityChecks,
};
