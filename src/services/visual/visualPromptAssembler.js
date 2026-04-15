export function assembleVisualPrompt({
  projectGeometry,
  styleDNA = {},
  viewType = "hero_3d",
  facadeGrammar = null,
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
    "Canonical geometry remains the control source; visuals may stylize materiality and atmosphere only.",
  ].join(" ");
}

export default {
  assembleVisualPrompt,
};
