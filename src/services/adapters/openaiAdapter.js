/**
 * OpenAI Adapter
 *
 * Normalizes raw OpenAI API responses to canonical Design DNA structures.
 * Ensures consistent data shape, telemetry tracking, and error handling.
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module services/adapters/openaiAdapter
 */

import { createMeta, DNA_VERSION } from '../../domain/dna.js';
import { validateDesignReasoning } from '../../domain/validators.js';
import { safeParseJsonFromLLM } from '../../utils/parseJsonFromLLM.js';

/**
 * Estimated cost per token for OpenAI models (as of 2025)
 * Based on OpenAI pricing: https://openai.com/pricing
 */
const TOKEN_COSTS = {
  'gpt-4': {
    prompt: 0.03 / 1000, // $0.03 per 1K tokens
    completion: 0.06 / 1000 // $0.06 per 1K tokens
  },
  'gpt-4o': {
    prompt: 0.005 / 1000, // $0.005 per 1K tokens
    completion: 0.015 / 1000 // $0.015 per 1K tokens
  },
  'gpt-4-turbo': {
    prompt: 0.01 / 1000, // $0.01 per 1K tokens
    completion: 0.03 / 1000 // $0.03 per 1K tokens
  }
};

/**
 * Calculate cost from token usage
 *
 * @param {Object} tokenUsage - Token usage from OpenAI response
 * @param {string} model - Model name (e.g., 'gpt-4', 'gpt-4o')
 * @returns {number} Estimated cost in USD
 */
function calculateCost(tokenUsage, model) {
  if (!tokenUsage || !model) return 0;

  const costs = TOKEN_COSTS[model] || TOKEN_COSTS['gpt-4']; // Default to GPT-4 pricing

  const promptCost = (tokenUsage.prompt || 0) * costs.prompt;
  const completionCost = (tokenUsage.completion || 0) * costs.completion;

  return promptCost + completionCost;
}

/**
 * Extract token usage from OpenAI response
 *
 * @param {Object} rawResponse - Raw OpenAI API response
 * @returns {import('../../domain/dna.js').TokenUsage | null}
 */
function extractTokenUsage(rawResponse) {
  if (!rawResponse || !rawResponse.usage) return null;

  return {
    prompt: rawResponse.usage.prompt_tokens || 0,
    completion: rawResponse.usage.completion_tokens || 0,
    total: rawResponse.usage.total_tokens || 0
  };
}

/**
 * Parse OpenAI message content to extract design reasoning
 * Handles both JSON and text responses
 *
 * @param {string} content - Message content from OpenAI
 * @returns {Object} Parsed design reasoning (may be partial)
 */
function parseMessageContent(content) {
  // Define fallback structure
  const fallback = {
    designPhilosophy: extractSection(content, 'Design Philosophy') || content,
    spatialOrganization: extractSection(content, 'Spatial Organization') || 'Not specified',
    materialRecommendations: extractSection(content, 'Material') || 'Not specified',
    environmentalConsiderations: extractSection(content, 'Environmental') || 'Not specified',
    technicalSolutions: extractSection(content, 'Technical') || 'Not specified',
    codeCompliance: extractSection(content, 'Code Compliance') || 'Not specified',
    costStrategies: extractSection(content, 'Cost') || 'Not specified',
    futureProofing: extractSection(content, 'Future') || 'Not specified',
    rawResponse: content
  };

  // Use safe JSON parser with fallback
  return safeParseJsonFromLLM(content, fallback);
}

/**
 * Extract specific sections from AI response text
 *
 * @param {string} text - Response text
 * @param {string} keyword - Section keyword to search for
 * @returns {string | null}
 */
function extractSection(text, keyword) {
  const regex = new RegExp(`${keyword}[\\s\\S]*?(?=\\n\\n|$)`, 'i');
  const match = text.match(regex);
  return match ? match[0].trim() : null;
}

/* ============================================================================
 * DESIGN REASONING ADAPTER
 * ========================================================================== */

/**
 * Adapt raw OpenAI chat completion response to DesignReasoning
 *
 * @param {Object} rawResponse - Raw OpenAI API response
 * @param {number} latencyMs - Request latency in milliseconds
 * @param {Object} [options] - Additional options
 * @param {string} [options.model] - Model name (default: 'gpt-4')
 * @param {boolean} [options.isFallback] - Whether this is fallback data
 * @returns {import('../../domain/dna.js').DesignReasoning}
 */
export function adaptDesignReasoning(rawResponse, latencyMs, options = {}) {
  const { model = 'gpt-4', isFallback = false } = options;

  // Extract message content
  const messageContent = rawResponse?.choices?.[0]?.message?.content || '';

  // Parse content to extract design reasoning fields
  const parsedReasoning = parseMessageContent(messageContent);

  // Extract token usage
  const tokenUsage = extractTokenUsage(rawResponse);

  // Calculate cost
  const costUsd = tokenUsage ? calculateCost(tokenUsage, model) : 0;

  // Create meta object
  const meta = createMeta('openai', latencyMs, {
    model,
    costUsd,
    tokenUsage
  });

  // Construct canonical DesignReasoning
  const designReasoning = {
    // Style rationale (optional, for backward compatibility)
    styleRationale: parsedReasoning.styleRationale || undefined,

    // Required fields
    designPhilosophy: parsedReasoning.designPhilosophy || 'Not specified',
    spatialOrganization: parsedReasoning.spatialOrganization || 'Not specified',
    materialRecommendations: parsedReasoning.materialRecommendations || 'Not specified',
    environmentalConsiderations:
      parsedReasoning.environmentalConsiderations || 'Not specified',

    // Optional fields (commonly present)
    technicalSolutions: parsedReasoning.technicalSolutions,
    codeCompliance: parsedReasoning.codeCompliance,
    costStrategies: parsedReasoning.costStrategies,
    futureProofing: parsedReasoning.futureProofing,

    // Metadata
    meta,
    isFallback
  };

  // Validate (log warnings only, don't throw)
  const validation = validateDesignReasoning(designReasoning);
  if (!validation.valid) {
    console.warn('DesignReasoning validation warnings:', validation.errors);
  }

  return designReasoning;
}

/* ============================================================================
 * FEASIBILITY ANALYSIS ADAPTER
 * ========================================================================== */

/**
 * Adapt raw OpenAI response to FeasibilityAnalysis
 *
 * @param {Object} rawResponse - Raw OpenAI API response
 * @param {number} latencyMs - Request latency in milliseconds
 * @param {Object} [options] - Additional options
 * @param {string} [options.model] - Model name (default: 'gpt-4')
 * @param {boolean} [options.isFallback] - Whether this is fallback data
 * @returns {import('../../domain/dna.js').FeasibilityAnalysis}
 */
export function adaptFeasibilityAnalysis(rawResponse, latencyMs, options = {}) {
  const { model = 'gpt-4', isFallback = false } = options;

  // Extract message content
  const messageContent = rawResponse?.choices?.[0]?.message?.content || '';

  // Parse content
  const parsedAnalysis = parseMessageContent(messageContent);

  // Extract token usage
  const tokenUsage = extractTokenUsage(rawResponse);

  // Calculate cost
  const costUsd = tokenUsage ? calculateCost(tokenUsage, model) : 0;

  // Create meta object
  const meta = createMeta('openai', latencyMs, {
    model,
    costUsd,
    tokenUsage
  });

  // Extract feasibility rating
  const feasibilityText = parsedAnalysis.feasibility || extractSection(messageContent, 'Feasibility') || 'Unknown';
  const feasibility = ['High', 'Medium', 'Low'].find(level => feasibilityText.includes(level)) || 'Unknown';

  // Extract constraints (try to parse as array, fallback to text)
  let constraints = parsedAnalysis.constraints;
  if (!Array.isArray(constraints)) {
    const constraintsSection = extractSection(messageContent, 'Constraints');
    constraints = constraintsSection
      ? constraintsSection.split('\n').filter(line => line.trim().length > 0)
      : ['Detailed analysis unavailable'];
  }

  // Extract recommendations
  let recommendations = parsedAnalysis.recommendations;
  if (!Array.isArray(recommendations)) {
    const recommendationsSection = extractSection(messageContent, 'Recommendations');
    recommendations = recommendationsSection
      ? recommendationsSection.split('\n').filter(line => line.trim().length > 0)
      : ['Manual feasibility review recommended'];
  }

  // Construct canonical FeasibilityAnalysis
  return {
    feasibility,
    constraints,
    recommendations,
    timeline: parsedAnalysis.timeline,
    budget: parsedAnalysis.budget,
    meta,
    isFallback
  };
}

/* ============================================================================
 * DESIGN CONTEXT ADAPTER
 * ========================================================================== */

/**
 * Adapt raw OpenAI response to Design Context (for consistency)
 *
 * @param {Object} rawResponse - Raw OpenAI API response
 * @param {number} latencyMs - Request latency in milliseconds
 * @param {Object} [options] - Additional options
 * @returns {Object} Design context object
 */
export function adaptDesignContext(rawResponse, latencyMs, options = {}) {
  const { model = 'gpt-4', isFallback = false } = options;

  // Extract message content
  const messageContent = rawResponse?.choices?.[0]?.message?.content || '{}';

  // Parse JSON with safe parser
  const designContext = safeParseJsonFromLLM(messageContent, {
    style: 'Contemporary',
    massing: 'simple rectangular form',
    facadeMaterials: 'brick',
    colorPalette: 'neutral tones'
  });

  // Extract token usage
  const tokenUsage = extractTokenUsage(rawResponse);

  // Calculate cost
  const costUsd = tokenUsage ? calculateCost(tokenUsage, model) : 0;

  // Add meta
  designContext.meta = createMeta('openai', latencyMs, {
    model,
    costUsd,
    tokenUsage
  });

  designContext.isFallback = isFallback;

  return designContext;
}

/* ============================================================================
 * VIEW CLASSIFICATION ADAPTER
 * ========================================================================== */

/**
 * Adapt raw OpenAI vision response to view classification
 *
 * @param {Object} rawResponse - Raw OpenAI API response
 * @param {number} latencyMs - Request latency in milliseconds
 * @param {Object} [options] - Additional options
 * @returns {Object} Classification result
 */
export function adaptViewClassification(rawResponse, latencyMs, options = {}) {
  const { model = 'gpt-4o', isFallback = false } = options;

  // Extract message content
  const messageContent = rawResponse?.choices?.[0]?.message?.content || '{}';

  // Parse JSON with safe parser
  const classification = safeParseJsonFromLLM(messageContent, {
    actualView: 'unknown',
    is2D: false,
    isCorrect: false,
    confidence: 0,
    reason: 'Classification failed'
  });

  // Extract token usage
  const tokenUsage = extractTokenUsage(rawResponse);

  // Calculate cost
  const costUsd = tokenUsage ? calculateCost(tokenUsage, model) : 0;

  // Add meta
  classification.meta = createMeta('openai', latencyMs, {
    model,
    costUsd,
    tokenUsage
  });

  classification.isFallback = isFallback;

  return classification;
}

/* ============================================================================
 * FALLBACK ADAPTERS
 * ========================================================================== */

/**
 * Create fallback DesignReasoning when API call fails
 *
 * @param {Object} [projectContext] - Project context for contextual fallback
 * @returns {import('../../domain/dna.js').DesignReasoning}
 */
export function createFallbackDesignReasoning(projectContext = {}) {
  const meta = createMeta('fallback', 0, { model: 'none', costUsd: 0 });

  return {
    designPhilosophy:
      'Focus on sustainable, contextually appropriate design that responds to local climate and cultural conditions.',
    spatialOrganization:
      'Optimize spatial flow and functionality while maintaining flexibility for future adaptations.',
    materialRecommendations:
      'Select materials based on local availability, durability, and environmental impact.',
    environmentalConsiderations:
      'Implement passive design strategies, renewable energy integration, and water conservation.',
    technicalSolutions:
      'Address structural efficiency, MEP optimization, and smart building technologies.',
    codeCompliance: 'Ensure full compliance with local building codes and zoning requirements.',
    costStrategies:
      'Balance initial investment with long-term operational savings through efficient design.',
    futureProofing:
      'Design for adaptability and technological integration as building needs evolve.',
    meta,
    isFallback: true
  };
}

/**
 * Create fallback FeasibilityAnalysis when API call fails
 *
 * @returns {import('../../domain/dna.js').FeasibilityAnalysis}
 */
export function createFallbackFeasibilityAnalysis() {
  const meta = createMeta('fallback', 0, { model: 'none', costUsd: 0 });

  return {
    feasibility: 'Unknown',
    constraints: ['Analysis unavailable - API error'],
    recommendations: ['Manual feasibility review recommended'],
    meta,
    isFallback: true
  };
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

export default {
  // Adapters
  adaptDesignReasoning,
  adaptFeasibilityAnalysis,
  adaptDesignContext,
  adaptViewClassification,

  // Fallbacks
  createFallbackDesignReasoning,
  createFallbackFeasibilityAnalysis,

  // Utilities
  calculateCost,
  extractTokenUsage
};
