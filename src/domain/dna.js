/**
 * Design DNA - Canonical Data Contracts
 *
 * This module defines the canonical type definitions (TypeScript-style JSDoc)
 * for all data structures used across the AI architectural design platform.
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module domain/dna
 */

/**
 * Schema version for Design DNA contracts
 * Increment minor version for backward-compatible changes, major for breaking changes
 */
export const DNA_VERSION = '1.0.0';

/* ============================================================================
 * TELEMETRY & METADATA
 * ========================================================================== */

/**
 * Telemetry metadata attached to all AI-generated results
 * Tracks performance, cost, and observability data
 *
 * @typedef {Object} Meta
 * @property {string} source - Service that generated the data (e.g., 'openai', 'replicate', 'together-ai')
 * @property {string} [model] - Specific model used (e.g., 'gpt-4', 'sdxl', 'flux-1-dev')
 * @property {number} latencyMs - Time taken to generate result in milliseconds
 * @property {number} [costUsd] - Estimated cost in USD (if calculable)
 * @property {TokenUsage} [tokenUsage] - Token consumption for LLM calls
 * @property {string} timestamp - ISO 8601 timestamp of generation
 * @property {string} dnaVersion - Version of Design DNA schema used
 */

/**
 * Token usage details for LLM API calls
 *
 * @typedef {Object} TokenUsage
 * @property {number} prompt - Number of tokens in the prompt
 * @property {number} completion - Number of tokens in the completion
 * @property {number} total - Total tokens used (prompt + completion)
 */

/**
 * Standardized error structure
 *
 * @typedef {Object} ErrorResult
 * @property {string} code - Machine-readable error code (e.g., 'API_KEY_MISSING', 'RATE_LIMIT_EXCEEDED')
 * @property {string} message - Human-readable error message
 * @property {string} source - Service where error originated
 * @property {boolean} isFallback - Whether fallback data was provided
 * @property {*} [details] - Additional error context (stack trace, API response, etc.)
 * @property {string} timestamp - ISO 8601 timestamp of error
 */

/* ============================================================================
 * LOCATION INTELLIGENCE
 * ========================================================================== */

/**
 * Seasonal climate data for a specific season
 *
 * @typedef {Object} SeasonalClimate
 * @property {number} avgTemp - Average temperature in Celsius
 * @property {number} minTemp - Minimum temperature in Celsius
 * @property {number} maxTemp - Maximum temperature in Celsius
 * @property {number} precipitation - Average precipitation in mm
 * @property {number} humidity - Average humidity percentage
 * @property {string} description - Textual description of seasonal conditions
 */

/**
 * Climate data including seasonal variations
 *
 * @typedef {Object} ClimateData
 * @property {string} type - Climate classification (e.g., 'temperate', 'tropical', 'arid')
 * @property {Object} seasonal - Seasonal climate breakdown
 * @property {SeasonalClimate} seasonal.winter - Winter climate data
 * @property {SeasonalClimate} seasonal.spring - Spring climate data
 * @property {SeasonalClimate} seasonal.summer - Summer climate data
 * @property {SeasonalClimate} seasonal.fall - Fall climate data
 * @property {SunPath} sunPath - Solar path and orientation data
 */

/**
 * Solar path and optimal building orientation
 *
 * @typedef {Object} SunPath
 * @property {string} summer - Summer sun path description (e.g., 'High altitude, 70° peak')
 * @property {string} winter - Winter sun path description (e.g., 'Low altitude, 30° peak')
 * @property {string} optimalOrientation - Recommended building orientation (e.g., 'South-facing')
 */

/**
 * Zoning regulations for the site
 *
 * @typedef {Object} ZoningData
 * @property {string} type - Zoning classification (e.g., 'R-1 Residential', 'C-2 Commercial')
 * @property {string} maxHeight - Maximum building height allowed (e.g., '15m', '3 stories')
 * @property {string} density - Density restrictions (e.g., 'Low density', 'FAR 2.0')
 * @property {string} setbacks - Required setbacks (e.g., 'Front: 5m, Side: 3m, Rear: 4m')
 * @property {number} [maxFAR] - Maximum Floor Area Ratio
 * @property {number} [maxLotCoverage] - Maximum lot coverage percentage
 */

/**
 * Geographic coordinates
 *
 * @typedef {Object} Coordinates
 * @property {number} lat - Latitude in decimal degrees
 * @property {number} lng - Longitude in decimal degrees
 */

/**
 * Market context and economic data
 *
 * @typedef {Object} MarketContext
 * @property {number} avgConstructionCost - Average construction cost per sqm in USD
 * @property {number} demandIndex - Market demand index (0-100)
 * @property {number} roi - Estimated return on investment percentage
 * @property {string} [marketTrend] - Current market trend description
 */

/**
 * Complete location profile with geographic, climate, zoning, and market data
 *
 * @typedef {Object} LocationProfile
 * @property {string} address - Full formatted address
 * @property {Coordinates} coordinates - Geographic coordinates
 * @property {ClimateData} climate - Climate and seasonal data
 * @property {ZoningData} zoning - Zoning regulations
 * @property {string} recommendedStyle - Primary recommended architectural style
 * @property {string[]} localStyles - Array of local/regional architectural styles
 * @property {number} sustainabilityScore - Sustainability potential score (0-100)
 * @property {MarketContext} marketContext - Economic and market data
 * @property {Meta} meta - Telemetry and metadata
 * @property {boolean} isFallback - Whether this data is fallback (not from real APIs)
 */

/* ============================================================================
 * DESIGN REASONING
 * ========================================================================== */

/**
 * Style rationale explaining design influences
 *
 * @typedef {Object} StyleRationale
 * @property {string} overview - Overall design approach summary
 * @property {string} localStyleImpact - How local architectural context influences design
 * @property {string} portfolioStyleImpact - How portfolio preferences are incorporated
 * @property {string} climateIntegration - How climate data informs design decisions
 */

/**
 * Spatial organization strategy
 *
 * @typedef {Object} SpatialOrganization
 * @property {string} strategy - Overall spatial layout strategy
 * @property {string} keySpaces - Description of primary spaces and relationships
 * @property {string} circulation - Movement patterns and flow description
 * @property {string} flexibility - Adaptability for future needs
 */

/**
 * Material recommendation with rationale
 *
 * @typedef {Object} MaterialRecommendation
 * @property {string} material - Material name (e.g., 'Cross-laminated timber')
 * @property {string} rationale - Reason for selection
 * @property {string} [source] - Material source/origin
 */

/**
 * Material recommendations structure
 *
 * @typedef {Object} MaterialRecommendations
 * @property {MaterialRecommendation[]} primary - Primary materials (3-5 items)
 * @property {string[]} secondary - Secondary/accent materials
 * @property {string} sustainable - Sustainability considerations and local sourcing
 */

/**
 * Environmental design considerations
 *
 * @typedef {Object} EnvironmentalConsiderations
 * @property {string} passiveStrategies - Passive heating, cooling, ventilation approaches
 * @property {string} activeStrategies - Active systems recommendations
 * @property {string} renewableEnergy - Solar, geothermal, or other renewable integration
 * @property {string} waterManagement - Rainwater, greywater, stormwater strategies
 */

/**
 * Technical solutions and systems
 *
 * @typedef {Object} TechnicalSolutions
 * @property {string} structural - Structural system recommendations
 * @property {string} envelope - Building envelope and insulation strategies
 * @property {string} mep - MEP systems optimized for efficiency
 * @property {string} smart - Smart building and automation opportunities
 */

/**
 * Code compliance strategy
 *
 * @typedef {Object} CodeCompliance
 * @property {string} zoning - Zoning compliance approach
 * @property {string} building - Building code considerations
 * @property {string} accessibility - Accessibility and universal design
 * @property {string} energy - Energy code compliance pathway
 */

/**
 * Cost optimization strategies
 *
 * @typedef {Object} CostStrategies
 * @property {string} valueEngineering - Cost optimization approaches
 * @property {string} phasingOpportunities - Potential construction phasing
 * @property {string} lifecycle - Lifecycle cost considerations
 * @property {string} localEconomy - Leveraging local materials and labor
 */

/**
 * Future-proofing strategies
 *
 * @typedef {Object} FutureProofing
 * @property {string} adaptability - Design flexibility for changing uses
 * @property {string} technology - Technology integration pathways
 * @property {string} climate - Climate change resilience
 * @property {string} expansion - Future expansion possibilities
 */

/**
 * Comprehensive design reasoning from AI analysis
 *
 * @typedef {Object} DesignReasoning
 * @property {StyleRationale} [styleRationale] - Style rationale (optional for backward compatibility)
 * @property {string} designPhilosophy - Overall design philosophy
 * @property {SpatialOrganization} spatialOrganization - Spatial layout strategy
 * @property {MaterialRecommendations} materialRecommendations - Material selections with rationale
 * @property {EnvironmentalConsiderations} environmentalConsiderations - Environmental design strategies
 * @property {TechnicalSolutions} technicalSolutions - Technical systems recommendations
 * @property {CodeCompliance} codeCompliance - Code compliance approach
 * @property {CostStrategies} costStrategies - Cost optimization strategies
 * @property {FutureProofing} futureProofing - Future-proofing strategies
 * @property {Meta} meta - Telemetry and metadata
 * @property {boolean} isFallback - Whether this is fallback reasoning
 */

/* ============================================================================
 * VISUALIZATIONS
 * ========================================================================== */

/**
 * Single generated image with metadata
 *
 * @typedef {Object} GeneratedImage
 * @property {string} url - Image URL (Azure blob, Replicate CDN, or data URL)
 * @property {string} viewType - View type (e.g., 'floor_plan_2d', 'exterior_front', 'elevation_north')
 * @property {number} [width] - Image width in pixels
 * @property {number} [height] - Image height in pixels
 * @property {string} [prompt] - Generation prompt used
 * @property {number} [seed] - Random seed used for generation
 * @property {string} [revisedPrompt] - Revised prompt (from DALL·E 3)
 */

/**
 * View collection (floor plans, elevations, perspectives)
 *
 * @typedef {Object} ViewCollection
 * @property {GeneratedImage} [floor_plan_ground] - Ground floor plan
 * @property {GeneratedImage} [floor_plan_upper] - Upper floor plan
 * @property {GeneratedImage} [floor_plan_roof] - Roof plan
 * @property {GeneratedImage} [elevation_north] - North elevation
 * @property {GeneratedImage} [elevation_south] - South elevation
 * @property {GeneratedImage} [elevation_east] - East elevation
 * @property {GeneratedImage} [elevation_west] - West elevation
 * @property {GeneratedImage} [section_longitudinal] - Longitudinal section
 * @property {GeneratedImage} [section_cross] - Cross section
 * @property {GeneratedImage} [exterior_front] - Exterior front view
 * @property {GeneratedImage} [exterior_side] - Exterior side view
 * @property {GeneratedImage} [axonometric] - Axonometric view
 * @property {GeneratedImage} [perspective] - Perspective view
 * @property {GeneratedImage} [interior] - Interior view
 * @property {GeneratedImage} [site_plan] - Site plan
 */

/**
 * Style variations (modern, traditional, sustainable, etc.)
 *
 * @typedef {Object} StyleVariations
 * @property {GeneratedImage} [modern] - Modern style variant
 * @property {GeneratedImage} [traditional] - Traditional style variant
 * @property {GeneratedImage} [sustainable] - Sustainable style variant
 * @property {GeneratedImage} [futuristic] - Futuristic style variant
 */

/**
 * Complete visualization package
 *
 * @typedef {Object} VisualizationResult
 * @property {ViewCollection} views - Collection of architectural views
 * @property {StyleVariations} [styleVariations] - Style variation images
 * @property {GeneratedImage} [reasoningBased] - Image generated from reasoning only
 * @property {Meta} meta - Telemetry and metadata
 * @property {boolean} isFallback - Whether these are placeholder images
 */

/* ============================================================================
 * DESIGN ALTERNATIVES
 * ========================================================================== */

/**
 * Single design alternative with reasoning and visualization
 *
 * @typedef {Object} DesignAlternative
 * @property {string} approach - Alternative approach name (e.g., 'sustainable', 'cost_effective')
 * @property {DesignReasoning} reasoning - Design reasoning for this alternative
 * @property {GeneratedImage} [visualization] - Visual representation of alternative
 * @property {Meta} meta - Telemetry and metadata
 */

/**
 * Collection of design alternatives
 *
 * @typedef {Object} DesignAlternatives
 * @property {DesignAlternative} sustainable - Sustainable design alternative
 * @property {DesignAlternative} cost_effective - Cost-effective alternative
 * @property {DesignAlternative} innovative - Innovative/futuristic alternative
 * @property {DesignAlternative} traditional - Traditional/heritage alternative
 * @property {Meta} meta - Telemetry and metadata
 */

/* ============================================================================
 * FEASIBILITY ANALYSIS
 * ========================================================================== */

/**
 * Feasibility assessment result
 *
 * @typedef {Object} FeasibilityAnalysis
 * @property {string} feasibility - Overall feasibility rating ('High', 'Medium', 'Low', 'Unknown')
 * @property {string[]} constraints - List of key constraints and challenges
 * @property {string[]} recommendations - Recommended modifications and strategies
 * @property {string} [timeline] - Estimated project timeline
 * @property {Object} [budget] - Budget implications
 * @property {number} [budget.estimatedCost] - Estimated total cost in USD
 * @property {number} [budget.variancePercent] - Expected cost variance percentage
 * @property {Meta} meta - Telemetry and metadata
 * @property {boolean} isFallback - Whether this is fallback analysis
 */

/* ============================================================================
 * COMPLETE DESIGN RESULT
 * ========================================================================== */

/**
 * Complete AI-generated design result
 * This is the top-level output from aiIntegrationService.generateCompleteDesign()
 *
 * @typedef {Object} DesignResult
 * @property {boolean} success - Whether generation succeeded
 * @property {DesignReasoning} reasoning - Design reasoning and philosophy
 * @property {VisualizationResult} visualizations - Generated images and views
 * @property {DesignAlternatives} alternatives - Alternative design approaches
 * @property {FeasibilityAnalysis} feasibility - Feasibility assessment
 * @property {Meta} meta - Aggregated telemetry (total cost, total latency)
 * @property {string} workflow - Workflow type used ('complete' or 'quick')
 * @property {boolean} isFallback - Whether any part used fallback data
 * @property {ErrorResult} [error] - Error details if success === false
 */

/* ============================================================================
 * BUILDING DNA (Physical Specifications)
 * ========================================================================== */

/**
 * Building dimensions
 *
 * @typedef {Object} BuildingDimensions
 * @property {number} length - Building length in meters
 * @property {number} width - Building width in meters
 * @property {number} height - Total building height in meters
 * @property {number} floors - Number of floors
 * @property {number} floorHeight - Typical floor-to-floor height in meters
 * @property {number} footprintArea - Building footprint area in sqm
 * @property {number} totalArea - Total floor area in sqm
 */

/**
 * Roof specifications
 *
 * @typedef {Object} RoofSpecification
 * @property {string} type - Roof type (e.g., 'gable', 'flat', 'hip', 'shed')
 * @property {string} material - Roof material (e.g., 'tiles', 'metal', 'membrane')
 * @property {string} color - Roof color (e.g., 'dark grey', 'terracotta red')
 * @property {string} [pitch] - Roof pitch description (e.g., '30 degrees', 'flat')
 */

/**
 * Window specifications
 *
 * @typedef {Object} WindowSpecification
 * @property {string} type - Window type (e.g., 'casement', 'sliding', 'awning')
 * @property {string} color - Frame color (e.g., 'white', 'black', 'wood')
 * @property {string} pattern - Window arrangement pattern (e.g., 'regular grid', 'ribbon windows')
 * @property {string} [glazing] - Glazing type (e.g., 'double-glazed', 'low-e')
 */

/**
 * Exterior material specifications
 *
 * @typedef {Object} ExteriorMaterials
 * @property {string} primary - Primary facade material (e.g., 'brick', 'concrete', 'wood')
 * @property {string} color - Material color (e.g., 'red-brown brick', 'light grey concrete')
 * @property {string} texture - Material texture (e.g., 'running bond brickwork', 'smooth finish')
 * @property {string} [finish] - Material finish (e.g., 'matte', 'polished', 'textured')
 */

/**
 * Color palette
 *
 * @typedef {Object} ColorPalette
 * @property {string} primary - Primary color (facade)
 * @property {string} secondary - Secondary color (trim, accents)
 * @property {string} roof - Roof color
 * @property {string} windows - Window frame color
 */

/**
 * Consistency notes for multi-view generation
 *
 * @typedef {Object} ConsistencyNotes
 * @property {string} criticalForAllViews - Rules that apply to all views
 * @property {string} [elevationEmphasis] - Specific rules for elevations
 * @property {string} [viewEmphasis3d] - Specific rules for 3D views
 * @property {string} [floorPlanEmphasis] - Specific rules for floor plans
 */

/**
 * Building DNA - Physical building specifications for consistent generation
 * This ensures all views (2D, 3D, elevations, sections) describe the SAME building
 *
 * @typedef {Object} BuildingDNA
 * @property {BuildingDimensions} dimensions - Building dimensions
 * @property {RoofSpecification} roof - Roof specifications
 * @property {WindowSpecification} windows - Window specifications
 * @property {Object} materials - Material specifications
 * @property {ExteriorMaterials} materials.exterior - Exterior materials
 * @property {Object} [materials.windows] - Window materials
 * @property {string} materials.windows.frame - Window frame material
 * @property {ColorPalette} colorPalette - Color palette
 * @property {ConsistencyNotes} [consistencyNotes] - Rules for multi-view consistency
 * @property {string} architecturalStyle - Architectural style (e.g., 'Contemporary', 'Victorian')
 * @property {string} buildingProgram - Building type (e.g., 'detached house', 'office')
 */

/* ============================================================================
 * PROJECT CONTEXT
 * ========================================================================== */

/**
 * Complete project context passed to AI generation services
 *
 * @typedef {Object} ProjectContext
 * @property {string} buildingProgram - Building type/program (e.g., 'residential house', 'office building')
 * @property {number} floorArea - Total floor area in sqm
 * @property {LocationProfile} location - Location profile with climate and zoning
 * @property {Object} [blendedStyle] - Blended architectural style
 * @property {string} blendedStyle.styleName - Style name
 * @property {string[]} blendedStyle.materials - Materials list
 * @property {string[]} blendedStyle.characteristics - Style characteristics
 * @property {string} blendedStyle.description - Style description
 * @property {BuildingDNA} [buildingDNA] - Building DNA for consistency
 * @property {Object} [portfolio] - Portfolio analysis results
 * @property {string} [siteConstraints] - Site constraints description
 * @property {string} [userPreferences] - User preferences and requirements
 * @property {number} [seed] - Random seed for reproducible generation
 */

/* ============================================================================
 * EXPORT UTILITIES
 * ========================================================================== */

/**
 * Helper to create a Meta object with telemetry
 *
 * @param {string} source - Service source (e.g., 'openai', 'replicate')
 * @param {number} latencyMs - Latency in milliseconds
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.model] - Model name
 * @param {number} [options.costUsd] - Cost in USD
 * @param {TokenUsage} [options.tokenUsage] - Token usage
 * @returns {Meta}
 */
export function createMeta(source, latencyMs, options = {}) {
  return {
    source,
    model: options.model,
    latencyMs,
    costUsd: options.costUsd,
    tokenUsage: options.tokenUsage,
    timestamp: new Date().toISOString(),
    dnaVersion: DNA_VERSION
  };
}

/**
 * Helper to create a standardized error result
 *
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {string} source - Error source
 * @param {boolean} isFallback - Whether fallback data was provided
 * @param {*} [details] - Additional error details
 * @returns {ErrorResult}
 */
export function createError(code, message, source, isFallback, details) {
  return {
    code,
    message,
    source,
    isFallback,
    details,
    timestamp: new Date().toISOString()
  };
}

/**
 * Type guard to check if a result has fallback data
 *
 * @param {*} result - Result object to check
 * @returns {boolean}
 */
export function isFallbackResult(result) {
  return result && typeof result === 'object' && result.isFallback === true;
}

/**
 * Type guard to check if a result is successful
 *
 * @param {*} result - Result object to check
 * @returns {boolean}
 */
export function isSuccessResult(result) {
  return result && typeof result === 'object' && result.success === true;
}

/**
 * Extract total cost from a DesignResult with multiple AI calls
 *
 * @param {DesignResult} designResult - Complete design result
 * @returns {number} Total cost in USD
 */
export function getTotalCost(designResult) {
  if (!designResult || !designResult.meta) return 0;

  let total = designResult.meta.costUsd || 0;

  // Add reasoning cost
  if (designResult.reasoning?.meta?.costUsd) {
    total += designResult.reasoning.meta.costUsd;
  }

  // Add visualization cost
  if (designResult.visualizations?.meta?.costUsd) {
    total += designResult.visualizations.meta.costUsd;
  }

  // Add alternatives cost
  if (designResult.alternatives?.meta?.costUsd) {
    total += designResult.alternatives.meta.costUsd;
  }

  // Add feasibility cost
  if (designResult.feasibility?.meta?.costUsd) {
    total += designResult.feasibility.meta.costUsd;
  }

  return total;
}

/**
 * Extract total latency from a DesignResult with multiple AI calls
 *
 * @param {DesignResult} designResult - Complete design result
 * @returns {number} Total latency in milliseconds
 */
export function getTotalLatency(designResult) {
  if (!designResult || !designResult.meta) return 0;

  let total = designResult.meta.latencyMs || 0;

  // Add individual latencies
  if (designResult.reasoning?.meta?.latencyMs) {
    total += designResult.reasoning.meta.latencyMs;
  }
  if (designResult.visualizations?.meta?.latencyMs) {
    total += designResult.visualizations.meta.latencyMs;
  }
  if (designResult.alternatives?.meta?.latencyMs) {
    total += designResult.alternatives.meta.latencyMs;
  }
  if (designResult.feasibility?.meta?.latencyMs) {
    total += designResult.feasibility.meta.latencyMs;
  }

  return total;
}
