export function assembleVisualPrompt({
  projectGeometry,
  styleDNA = {},
  viewType = "hero_3d",
  facadeGrammar = null,
  identitySpec = null,
} = {}) {
  const floorCount = Math.max(1, (projectGeometry.levels || []).length);
  const windowCount = (projectGeometry.windows || []).length;
  const roofline =
    facadeGrammar?.style_bridge?.roof_language ||
    styleDNA.roof_language ||
    "contextual roofline";

  return [
    `View type: ${viewType}.`,
    `Floor count: ${floorCount}.`,
    `Window count: ${windowCount}.`,
    `Roof language: ${roofline}.`,
    `Facade language: ${styleDNA.facade_language || "contextual envelope"}.`,
    `Massing language: ${styleDNA.massing_language || "balanced composition"}.`,
    identitySpec?.primaryMaterial
      ? `Primary material: ${identitySpec.primaryMaterial.name} ${identitySpec.primaryMaterial.hexColor}.`
      : null,
    identitySpec?.secondaryMaterial
      ? `Secondary material: ${identitySpec.secondaryMaterial.name} ${identitySpec.secondaryMaterial.hexColor}.`
      : null,
    identitySpec?.roofMaterial
      ? `Roof material: ${identitySpec.roofMaterial.name} ${identitySpec.roofMaterial.hexColor}.`
      : null,
    identitySpec?.windowRhythm
      ? `Window rhythm: ${identitySpec.windowRhythm}.`
      : null,
    identitySpec?.openingLanguage
      ? `Opening language: ${identitySpec.openingLanguage}.`
      : null,
    identitySpec?.entrancePosition
      ? `Entrance position: ${identitySpec.entrancePosition}.`
      : null,
    identitySpec?.roofPitchDegrees
      ? `Roof pitch: ${identitySpec.roofPitchDegrees} degrees.`
      : null,
    identitySpec?.portfolioStyleAnchor
      ? `Portfolio style anchor: ${identitySpec.portfolioStyleAnchor}.`
      : null,
    "Canonical geometry remains the control source; visuals may stylize materiality and atmosphere only.",
  ]
    .filter(Boolean)
    .join(" ");
}

export default {
  assembleVisualPrompt,
};
