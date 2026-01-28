/**
 * Adaptive Style Transfer Service
 *
 * Blends portfolio styles with local architectural context to create
 * a unified style profile for design generation.
 */

/**
 * Calculate dynamic weights based on portfolio, location, and creativity settings
 * @param {Object} params - Weight calculation parameters
 * @returns {Object} Calculated weights for style blending
 */
export function calculateDynamicWeights(params = {}) {
  const {
    portfolioItems = [],
    isHistoricArea = false,
    creativityLevel = "normal",
  } = params;

  // Base weights: 60% portfolio, 30% local, 10% variation
  let portfolioWeight = 0.6;
  let localWeight = 0.3;
  let variationWeight = 0.1;

  // Adjust for historic areas - give more weight to local context
  if (isHistoricArea) {
    portfolioWeight = 0.4;
    localWeight = 0.5;
    variationWeight = 0.1;
  }

  // Adjust for creativity level
  if (creativityLevel === "high") {
    variationWeight = 0.2;
    portfolioWeight -= 0.1;
  } else if (creativityLevel === "low") {
    variationWeight = 0.05;
    portfolioWeight += 0.05;
  }

  // Reduce portfolio weight if no portfolio items
  if (!portfolioItems || portfolioItems.length === 0) {
    localWeight += portfolioWeight * 0.5;
    variationWeight += portfolioWeight * 0.5;
    portfolioWeight = 0;
  }

  return {
    portfolio: portfolioWeight,
    local: localWeight,
    variation: variationWeight,
    weights: [portfolioWeight, localWeight, variationWeight],
  };
}

/**
 * Transfer and blend styles from portfolio and location data
 * @param {Object} options - Style transfer options
 * @returns {Object} Style profile for design generation
 */
export async function transferStyle(options = {}) {
  const {
    portfolioItems = [],
    locationData = {},
    climateData = {},
    customWeights = {},
    seed = Date.now(),
  } = options;

  // Extract local style recommendations
  const localStyles = locationData?.localStyles || [];
  const recommendedStyle = locationData?.recommendedStyle || "contemporary";
  const zoning = locationData?.zoning || {};

  // Determine dominant style from portfolio or location
  let dominantStyle = recommendedStyle;

  // Build style tokens from available data
  const styleTokens = [];

  // Add local style influences
  if (localStyles.length > 0) {
    styleTokens.push(...localStyles.slice(0, 3));
  }

  // Add climate-responsive elements
  if (climateData?.type) {
    if (climateData.type === "oceanic" || climateData.type === "temperate") {
      styleTokens.push(
        "weather-resistant materials",
        "pitched roof for rain drainage",
      );
    } else if (climateData.type === "continental") {
      styleTokens.push("well-insulated", "thermal mass");
    } else if (climateData.type === "mediterranean") {
      styleTokens.push("terracotta accents", "shaded outdoor spaces");
    }
  }

  // Add zoning-influenced style elements
  if (zoning?.type === "residential") {
    styleTokens.push("residential scale", "neighborhood appropriate");
  } else if (zoning?.type === "commercial") {
    styleTokens.push("professional facade", "clear entrance visibility");
  }

  // Default style tokens if none generated
  if (styleTokens.length === 0) {
    styleTokens.push(
      "contemporary",
      "modern",
      "clean lines",
      "balanced proportions",
    );
  }

  // Build style injection string
  const styleInjection = `${dominantStyle} architectural style with ${styleTokens.slice(0, 4).join(", ")}`;

  // Determine preferred materials based on style and location
  const preferredMaterials = determinePreferredMaterials(
    dominantStyle,
    locationData,
  );

  return {
    dominantStyle,
    styleTokens: styleTokens.join(", "),
    styleInjection,
    preferredMaterials,
    weights: customWeights,
    seed,
  };
}

/**
 * Determine preferred materials based on style and location
 */
function determinePreferredMaterials(style, locationData = {}) {
  const climate = locationData?.climate?.type || "temperate";

  const materialsByStyle = {
    contemporary: ["glass", "steel", "concrete", "timber cladding"],
    modern: [
      "white render",
      "large glazing",
      "steel frame",
      "flat roof membrane",
    ],
    traditional: ["brick", "stone", "timber", "clay tiles"],
    industrial: [
      "exposed steel",
      "concrete",
      "corrugated metal",
      "large windows",
    ],
    minimalist: ["white plaster", "glass", "natural wood", "hidden details"],
    vernacular: [
      "local stone",
      "regional brick",
      "traditional roof tiles",
      "timber frames",
    ],
  };

  const defaultMaterials = ["brick", "render", "glass", "timber"];

  return materialsByStyle[style?.toLowerCase()] || defaultMaterials;
}

/**
 * Apply style profile to a prompt
 * @param {string} prompt - Base prompt
 * @param {Object} style - Style profile to apply
 * @returns {string} Enhanced prompt with style
 */
export function applyStyleToPrompt(prompt, style = {}) {
  if (!prompt) return prompt;

  const { styleInjection = "", dominantStyle = "" } = style;

  if (styleInjection) {
    return `${prompt}, ${styleInjection}`;
  } else if (dominantStyle) {
    return `${prompt}, ${dominantStyle} style`;
  }

  return prompt;
}

export default {
  calculateDynamicWeights,
  transferStyle,
  applyStyleToPrompt,
};
