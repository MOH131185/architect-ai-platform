import { buildControlReferences } from "./controlReferenceBuilder.js";
import { assembleVisualPrompt } from "./visualPromptAssembler.js";
import { createStableHash } from "../cad/projectGeometrySchema.js";

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
  });

  const visualPackage = {
    schema_version: "geometry-locked-visual-package-v1",
    package_id: createStableHash(
      JSON.stringify({
        project: projectGeometry.project_id,
        viewType,
        geometry: controlReferences.geometrySignature,
        style: styleDNA,
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
