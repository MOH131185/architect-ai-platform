import { buildControlReferences } from "./controlReferenceBuilder.js";
import { assembleVisualPrompt } from "./visualPromptAssembler.js";
import { createStableHash } from "../cad/projectGeometrySchema.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildHeroIdentitySpec,
  buildFingerprintFromDNA,
} from "../design/designFingerprintService.js";
import { buildMaterialSpecSheet } from "../design/canonicalMaterialPalette.js";

export function validateVisualPackageConsistency(pkg = {}) {
  const warnings = [];
  const errors = [];

  if (!pkg.geometrySignature) {
    errors.push("visual package is missing geometrySignature.");
  }
  if (!pkg.controlReferences?.references?.length) {
    errors.push("visual package is missing control references.");
  }
  if (!pkg.prompt) {
    errors.push("visual package is missing a prompt.");
  }
  if (!pkg.projectSummary?.floor_count) {
    warnings.push("visual package does not include a floor count summary.");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export async function buildVisualGenerationPackage(
  projectGeometry = {},
  styleDNA = {},
  viewType = "hero_3d",
  options = {},
) {
  const identitySpec = buildHeroIdentitySpec(styleDNA, {
    projectGeometry,
    facadeGrammar:
      options.facadeGrammar || projectGeometry.metadata?.facade_grammar || null,
    portfolioStyle: options.portfolioStyle || null,
  });
  const fingerprint = buildFingerprintFromDNA(styleDNA, {
    projectGeometry,
    facadeGrammar:
      options.facadeGrammar || projectGeometry.metadata?.facade_grammar || null,
    portfolioStyle: options.portfolioStyle || null,
  });
  const materialSpecSheet = buildMaterialSpecSheet({
    dna: styleDNA,
    projectGeometry,
    facadeGrammar:
      options.facadeGrammar || projectGeometry.metadata?.facade_grammar || null,
  });
  const controlReferences = buildControlReferences(
    projectGeometry,
    styleDNA,
    viewType,
    options,
  );
  const prompt = assembleVisualPrompt({
    projectGeometry,
    styleDNA,
    viewType,
    facadeGrammar:
      options.facadeGrammar || projectGeometry.metadata?.facade_grammar || null,
    identitySpec,
  });

  const visualPackage = {
    schema_version: "geometry-locked-visual-package-v2",
    package_id: createStableHash(
      JSON.stringify({
        project: projectGeometry.project_id,
        viewType,
        geometry: controlReferences.geometrySignature,
        style: styleDNA,
        identity: identitySpec,
      }),
    ),
    project_id: projectGeometry.project_id,
    viewType,
    prompt,
    providerHints: {
      provider: "agnostic",
      note: "Attach Together/FLUX or other providers later using the same control references.",
    },
    projectSummary: {
      floor_count: Math.max(1, (projectGeometry.levels || []).length),
      roofline:
        styleDNA.roof_language || projectGeometry.roof?.type || "unknown",
      opening_count:
        (projectGeometry.windows || []).length +
        (projectGeometry.doors || []).length,
    },
    identitySpec,
    designFingerprint: fingerprint,
    materialSpecSheet,
    generationDependencies: {
      canonicalGeometryReady: Boolean(projectGeometry?.project_id),
      facadeGrammarReady: Boolean(
        options.facadeGrammar || projectGeometry.metadata?.facade_grammar,
      ),
      materialPaletteReady: Boolean(identitySpec?.primaryMaterial),
      heroGeneratedAfterCanonicalInputs: true,
      enforcedByPhase8Flag: isFeatureEnabled("useHeroGeneratedLast"),
      pipelineOrder: [
        "canonical_geometry",
        "facade_grammar",
        "material_palette",
        "hero_visual",
      ],
    },
    geometrySignature: controlReferences.geometrySignature,
    controlReferences,
    honestyNotes: [
      "Visual packages are geometry-locked but do not claim pixel-perfect geometric fidelity.",
      "Canonical geometry remains the source of truth for plans, sections, elevations, and validation.",
    ],
  };

  return {
    ...visualPackage,
    validation: validateVisualPackageConsistency(visualPackage),
  };
}

export default {
  buildVisualGenerationPackage,
  validateVisualPackageConsistency,
};
