/**
 * DNA Prompt Context
 *
 * Builds prompts for different panel types based on Design DNA.
 */

/**
 * Build prompt for 3D perspective panels
 * @param {Object} dna - Design DNA
 * @param {Object} options - Build options
 * @returns {string} Prompt string
 */
export function build3DPanelPrompt(dna, options = {}) {
  const style = dna?.style?.architecturalStyle || "contemporary";
  const materials = dna?.materials?.primary || "brick and glass";

  return `Professional architectural 3D rendering of a ${style} building, ${materials} facade, photorealistic quality, golden hour lighting, high detail`;
}

/**
 * Build prompt for floor plan panels
 * @param {Object} dna - Design DNA
 * @param {string} level - Floor level (ground, first, second, etc.)
 * @param {Object} options - Build options
 * @returns {string} Prompt string
 */
export function buildPlanPrompt(dna, level = "ground", options = {}) {
  const area = dna?.program?.totalArea || 200;
  const rooms = dna?.program?.rooms?.length || 6;

  return `Architectural floor plan, ${level} floor, ${area}sqm, ${rooms} rooms, professional drawing, white background, labeled rooms, dimension lines`;
}

/**
 * Build prompt for elevation panels
 * @param {Object} dna - Design DNA
 * @param {string} direction - Compass direction (N, S, E, W)
 * @param {Object} options - Build options
 * @returns {string} Prompt string
 */
export function buildElevationPrompt(dna, direction = "N", options = {}) {
  const style = dna?.style?.architecturalStyle || "contemporary";
  const materials = dna?.materials?.primary || "brick";
  const stories = dna?.geometry?.stories || 2;

  return `Architectural elevation drawing, ${direction} facade, ${style} ${stories}-story building, ${materials}, technical drawing, dimension lines, white background`;
}

/**
 * Build prompt for section panels
 * @param {Object} dna - Design DNA
 * @param {string} sectionId - Section identifier (AA, BB, etc.)
 * @param {Object} options - Build options
 * @returns {string} Prompt string
 */
export function buildSectionPrompt(dna, sectionId = "AA", options = {}) {
  const stories = dna?.geometry?.stories || 2;
  const floorHeight = dna?.geometry?.floorHeight || 3.0;

  return `Architectural section drawing, Section ${sectionId}, ${stories} floors, ${floorHeight}m floor-to-floor height, technical drawing, dimension lines, material hatching`;
}

/**
 * Build negative prompt for generation
 * @param {string} panelType - Type of panel
 * @returns {string} Negative prompt string
 */
export function buildNegativePrompt(panelType = "default") {
  const baseNegatives =
    "blurry, low quality, distorted, watermark, text overlay, cartoon, anime";

  if (
    panelType.includes("plan") ||
    panelType.includes("elevation") ||
    panelType.includes("section")
  ) {
    return `${baseNegatives}, perspective view, 3D rendering, photographic`;
  }

  return `${baseNegatives}, sketch, wireframe, diagram`;
}

export default {
  build3DPanelPrompt,
  buildPlanPrompt,
  buildElevationPrompt,
  buildSectionPrompt,
  buildNegativePrompt,
};
