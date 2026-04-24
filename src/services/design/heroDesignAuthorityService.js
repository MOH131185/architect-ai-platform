import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { getCanonicalMaterialPalette } from "./canonicalMaterialPalette.js";

function toArray(value) {
  return Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [value]
      : [];
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function hasNonEmptyValue(value) {
  return normalizeText(value).length > 0;
}

function hasGeometryFootprint(projectGeometry = {}, compiledProject = {}) {
  const resolvedProjectGeometry = projectGeometry || {};
  const resolvedCompiledProject = compiledProject || {};
  if ((resolvedProjectGeometry.footprints || []).length > 0) {
    return true;
  }
  if ((resolvedProjectGeometry.footprint?.polygon || []).length > 0) {
    return true;
  }
  if ((resolvedCompiledProject.footprint?.polygon || []).length > 0) {
    return true;
  }
  return false;
}

function isGeometryValidationPassing(
  projectGeometry = {},
  compiledProject = {},
) {
  const resolvedProjectGeometry = projectGeometry || {};
  const resolvedCompiledProject = compiledProject || {};
  const compiledValid = resolvedCompiledProject?.validation?.valid;
  if (compiledValid === false) {
    return false;
  }

  const status = normalizeText(
    resolvedProjectGeometry?.metadata?.status,
  ).toLowerCase();
  if (!status) {
    return true;
  }

  return status !== "invalid";
}

function resolveFacadeGrammar(
  projectGeometry = {},
  styleDNA = {},
  facadeGrammar = null,
) {
  if (facadeGrammar) {
    return facadeGrammar;
  }

  if (projectGeometry?.metadata?.facade_grammar) {
    return projectGeometry.metadata.facade_grammar;
  }

  if (!projectGeometry?.project_id) {
    return null;
  }

  try {
    return buildFacadeGrammar(projectGeometry, styleDNA, {});
  } catch (error) {
    return null;
  }
}

function summarizeCompiledFacade(entry = {}) {
  const side = normalizeText(entry.side || entry.orientation || "unknown");
  const evidenceQuality = normalizeText(
    entry?.evidenceSummary?.schemaCredibilityQuality,
  ).toLowerCase();
  const openingCount = Number(
    entry.rhythmCount ||
      entry?.evidenceSummary?.openingGroupCount ||
      (entry.projectedOpenings || []).length ||
      0,
  );
  const materialZoneCount = toArray(entry.materialZones).length;
  const featureFamilyCount = toArray(entry.featureFamilies).length;
  const blocked =
    normalizeText(entry.status).toLowerCase() === "block" ||
    evidenceQuality === "block";

  return {
    side,
    openingCount,
    materialZoneCount,
    featureFamilyCount,
    blocked,
    hasSchema:
      hasNonEmptyValue(side) &&
      (openingCount > 0 ||
        materialZoneCount > 0 ||
        featureFamilyCount > 0 ||
        Boolean(entry.evidenceSummary)),
  };
}

function summarizeGrammarFacade(entry = {}) {
  const side = normalizeText(entry.side || entry.orientation || "unknown");
  const openingCount = Number(entry?.opening_rhythm?.opening_count || 0);
  const materialZoneCount = toArray(entry.material_zones).length;
  const featureFamilyCount = Object.keys(entry.components || {}).length;

  return {
    side,
    openingCount,
    materialZoneCount,
    featureFamilyCount,
    blocked: false,
    hasSchema:
      hasNonEmptyValue(side) &&
      (Boolean(entry.opening_rhythm) ||
        materialZoneCount > 0 ||
        featureFamilyCount > 0),
  };
}

function resolveFacadeSummaries({
  compiledProject = {},
  facadeGrammar = null,
}) {
  const compiledFacades = toArray(compiledProject?.facades?.list).map(
    summarizeCompiledFacade,
  );
  if (compiledFacades.length > 0) {
    return {
      source: "compiled_facades",
      entries: compiledFacades,
    };
  }

  const grammarFacades = toArray(facadeGrammar?.orientations).map(
    summarizeGrammarFacade,
  );
  if (grammarFacades.length > 0) {
    return {
      source: "facade_grammar",
      entries: grammarFacades,
    };
  }

  return {
    source: "missing",
    entries: [],
  };
}

function buildOpeningRhythmDescriptor(entries = []) {
  const active = entries
    .filter((entry) => entry.openingCount > 0 && hasNonEmptyValue(entry.side))
    .sort((left, right) => {
      if (right.openingCount !== left.openingCount) {
        return right.openingCount - left.openingCount;
      }
      return left.side.localeCompare(right.side);
    });

  if (!active.length) {
    return null;
  }

  const uniqueCounts = [...new Set(active.map((entry) => entry.openingCount))];
  if (active.length === 1) {
    return `${active[0].openingCount}-opening ${active[0].side} facade rhythm`;
  }
  if (uniqueCounts.length === 1) {
    return `${uniqueCounts[0]}-opening rhythm across ${active.length} facades`;
  }

  return `facade-specific opening rhythm: ${active
    .slice(0, 3)
    .map((entry) => `${entry.side} ${entry.openingCount}`)
    .join(", ")}`;
}

function collectMaterialSignals({
  styleDNA = {},
  projectGeometry = {},
  facadeGrammar = null,
  compiledProject = {},
}) {
  const styleMaterials = Array.isArray(styleDNA?.materials)
    ? styleDNA.materials
    : Object.values(styleDNA?.materials || {}).filter(Boolean);
  const geometryMaterials = [
    ...(projectGeometry?.metadata?.material_palette?.entries || []),
    ...(projectGeometry?.metadata?.materialPalette?.entries || []),
    ...(projectGeometry?.metadata?.facade_materials || []),
  ];
  const grammarMaterials = [
    ...(facadeGrammar?.material_zones || []),
    ...toArray(facadeGrammar?.orientations).flatMap(
      (entry) => entry?.material_zones || [],
    ),
  ];
  const compiledMaterials = [
    ...toArray(compiledProject?.materials?.palette),
    ...toArray(compiledProject?.materials?.facadeZoneMaterials),
    ...toArray(compiledProject?.facades?.list).flatMap(
      (entry) => entry?.materialZones || [],
    ),
  ];

  return [
    ...styleMaterials,
    ...geometryMaterials,
    ...grammarMaterials,
    ...compiledMaterials,
  ].filter((entry) =>
    typeof entry === "string"
      ? hasNonEmptyValue(entry)
      : hasNonEmptyValue(
          entry?.material ||
            entry?.name ||
            entry?.type ||
            entry?.label ||
            entry?.application,
        ),
  );
}

function resolveMaterialAuthority({
  styleDNA = {},
  projectGeometry = {},
  facadeGrammar = null,
  compiledProject = {},
}) {
  const signals = collectMaterialSignals({
    styleDNA,
    projectGeometry,
    facadeGrammar,
    compiledProject,
  });
  const canonicalPalette =
    projectGeometry?.project_id || facadeGrammar
      ? getCanonicalMaterialPalette({
          dna: styleDNA,
          projectGeometry,
          facadeGrammar: facadeGrammar || {},
        })
      : null;

  const compiledHasExplicitPalette =
    hasNonEmptyValue(compiledProject?.materials?.primary) ||
    hasNonEmptyValue(compiledProject?.materials?.secondary) ||
    toArray(compiledProject?.materials?.palette).length > 0 ||
    toArray(compiledProject?.materials?.facadeZoneMaterials).length > 0;

  return {
    finalized:
      signals.length > 0 &&
      Boolean(canonicalPalette?.primary || compiledHasExplicitPalette),
    signalCount: signals.length,
    source: canonicalPalette
      ? "canonical_material_palette"
      : compiledHasExplicitPalette
        ? "compiled_materials"
        : "missing",
    canonicalPalette,
  };
}

export function resolveHeroGenerationDependencies({
  projectGeometry = {},
  styleDNA = {},
  facadeGrammar = null,
  compiledProject = {},
} = {}) {
  const resolvedFacadeGrammar = resolveFacadeGrammar(
    projectGeometry,
    styleDNA,
    facadeGrammar,
  );
  const facadeSummaries = resolveFacadeSummaries({
    compiledProject,
    facadeGrammar: resolvedFacadeGrammar,
  });
  const schemaEntries = facadeSummaries.entries.filter(
    (entry) => entry.hasSchema,
  );
  const blockedEntries = facadeSummaries.entries.filter(
    (entry) => entry.blocked,
  );
  const totalOpeningCount = facadeSummaries.entries.reduce(
    (sum, entry) => sum + Number(entry.openingCount || 0),
    0,
  );
  const materialAuthority = resolveMaterialAuthority({
    styleDNA,
    projectGeometry,
    facadeGrammar: resolvedFacadeGrammar,
    compiledProject,
  });
  const windowRhythm = buildOpeningRhythmDescriptor(facadeSummaries.entries);
  const canonicalGeometryFinalized =
    Boolean(
      compiledProject?.geometryHash || projectGeometry?.project_id || null,
    ) &&
    hasGeometryFootprint(projectGeometry, compiledProject) &&
    Math.max(
      (compiledProject?.levels || []).length,
      (projectGeometry?.levels || []).length,
    ) > 0 &&
    Math.max(
      (compiledProject?.walls || []).length,
      (projectGeometry?.walls || []).length,
    ) > 0 &&
    isGeometryValidationPassing(projectGeometry, compiledProject);
  const facadeSchemaFinalized =
    schemaEntries.length > 0 && blockedEntries.length === 0;
  const openingRhythmFinalized =
    facadeSchemaFinalized &&
    facadeSummaries.entries.some(
      (entry) => entry.hasSchema && Number(entry.openingCount || 0) >= 0,
    ) &&
    totalOpeningCount > 0;
  const materialPaletteFinalized = materialAuthority.finalized;

  const blockingReasons = [];
  const warnings = [];

  if (!canonicalGeometryFinalized) {
    blockingReasons.push("canonical geometry is not finalized");
  }
  if (!facadeSchemaFinalized) {
    blockingReasons.push("facade schema is not finalized");
  }
  if (!materialPaletteFinalized) {
    blockingReasons.push("material palette is not finalized");
  }
  if (!openingRhythmFinalized) {
    blockingReasons.push("opening rhythm is not finalized");
  }
  if (schemaEntries.length === 1) {
    warnings.push(
      "Only one facade orientation is resolved for hero identity; additional facade coverage is recommended.",
    );
  }

  return {
    canonicalGeometryFinalized,
    facadeSchemaFinalized,
    materialPaletteFinalized,
    openingRhythmFinalized,
    heroReady:
      canonicalGeometryFinalized &&
      facadeSchemaFinalized &&
      materialPaletteFinalized &&
      openingRhythmFinalized,
    blockingReasons,
    warnings,
    windowRhythm,
    totalOpeningCount,
    resolvedFacadeGrammar,
    sources: {
      geometry:
        compiledProject?.geometryHash || compiledProject?.compiledProjectId
          ? "compiled_project"
          : projectGeometry?.project_id
            ? "project_geometry"
            : "missing",
      facadeSchema: facadeSummaries.source,
      materialPalette: materialAuthority.source,
      openingRhythm: facadeSummaries.source,
    },
    detail: {
      resolvedFacadeCount: schemaEntries.length,
      blockedFacadeCount: blockedEntries.length,
      materialSignalCount: materialAuthority.signalCount,
      totalOpeningCount,
    },
  };
}

export function buildHeroGenerationBlockMessage(authority = {}) {
  const reasons = toArray(authority?.blockingReasons)
    .filter(Boolean)
    .join(", ");

  if (!reasons) {
    return (
      "Hero generation is blocked until canonical geometry, facade schema, " +
      "material palette, and opening rhythm are finalized."
    );
  }

  return (
    "Hero generation is blocked until canonical geometry, facade schema, " +
    `material palette, and opening rhythm are finalized: ${reasons}.`
  );
}

export default {
  resolveHeroGenerationDependencies,
  buildHeroGenerationBlockMessage,
};
