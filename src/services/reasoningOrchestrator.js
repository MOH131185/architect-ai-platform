/**
 * Reasoning Orchestrator
 * 
 * REFACTORED: Now uses ModelRouter for unified reasoning with env-driven model selection
 * Automatically selects optimal model: GPT-5 > Claude 4.5 > Llama 405B > Qwen 72B
 */

import modelRouter from './modelRouter.js';
import promptLibrary from './promptLibrary.js';

/**
 * Generate design reasoning using ModelRouter
 * @param {Object} projectContext - Project information including location, requirements, etc.
 * @returns {Promise<Object>} Design reasoning and recommendations
 */
export async function generateDesignReasoning(projectContext) {
  console.log('🧠 [Reasoning Orchestrator] Generating design reasoning via ModelRouter...');
  
  try {
    // Extract key context
    const locationProfile = projectContext.location || projectContext.locationData;
    const blendedStyle = projectContext.blendedStyle;
    const masterDNA = projectContext.buildingDNA || projectContext.masterDNA;

    // Build reasoning prompt using prompt library
    const reasoningPrompt = promptLibrary.buildArchitecturalReasoningPrompt({
      projectContext,
      locationProfile,
      blendedStyle,
      masterDNA
    });

    // Use ModelRouter for optimal model selection
    const result = await modelRouter.callLLM('ARCHITECTURAL_REASONING', {
      systemPrompt: reasoningPrompt.systemPrompt,
      userPrompt: reasoningPrompt.userPrompt,
      schema: true,
      temperature: 0.7,
      maxTokens: 2000,
      context: { priority: 'quality', budget: 'medium' }
    });

    if (!result.success) {
      throw new Error(`Reasoning generation failed: ${result.error}`);
    }

    console.log(`   ✅ Reasoning generated via ${result.metadata.model} in ${result.metadata.latencyMs}ms`);

    return {
      ...result.data,
      source: result.metadata.provider,
      model: result.metadata.model,
      metadata: result.metadata
    };

  } catch (error) {
    console.error('   ❌ Reasoning generation failed:', error.message);
    
    // Return fallback reasoning
    return {
      designPhilosophy: 'Contemporary design responding to site and climate',
      spatialOrganization: { strategy: 'Functional layout optimized for program' },
      materialRecommendations: { primary: 'Context-appropriate materials' },
      environmentalConsiderations: { passiveStrategies: ['Natural ventilation', 'Daylighting'] },
      isFallback: true,
      error: error.message
    };
  }
}

/**
 * Summarize design context using ModelRouter
 * @param {Object} projectRequirements - Initial project details
 * @returns {Promise<Object>} Design context JSON
 */
export async function summarizeDesignContext(projectRequirements) {
  console.log('🎨 [Reasoning Orchestrator] Summarizing design context via ModelRouter...');
  
  try {
    // Build simplified context prompt
    const systemPrompt = 'You are an expert architect summarizing design context. Return structured JSON with style, massing, materials, and key features.';
    
    const userPrompt = `Summarize design context for:
Building: ${projectRequirements.buildingProgram || 'building'}
Area: ${projectRequirements.floorArea || projectRequirements.area || 200}m²
Style: ${projectRequirements.blendedStyle?.styleName || 'Contemporary'}
Materials: ${projectRequirements.blendedStyle?.materials?.join(', ') || 'Not specified'}
Location: ${projectRequirements.location?.address || 'Not specified'}

Return JSON: {style, massing, facadeMaterials, colorPalette, program, floors, dimensions, roofType, windowPattern, architecturalFeatures[]}.`;

    const result = await modelRouter.callLLM('ARCHITECTURAL_REASONING', {
      systemPrompt,
      userPrompt,
      schema: true,
      temperature: 0.5,
      maxTokens: 1000,
      context: { priority: 'speed', budget: 'low' }
    });

    if (result.success) {
      console.log(`   ✅ Context summarized via ${result.metadata.model}`);
      return {
        designContext: result.data,
        source: result.metadata.provider,
        model: result.metadata.model
      };
    }

    throw new Error(result.error || 'Context summarization failed');

  } catch (error) {
    console.error('   ❌ Context summarization failed:', error.message);
    
    // Return basic fallback
    return {
      designContext: {
        style: projectRequirements.blendedStyle?.style || 'Contemporary',
        massing: 'simple rectangular form',
        facadeMaterials: (projectRequirements.blendedStyle?.materials || ['brick']).join(' and '),
        colorPalette: 'neutral tones',
        program: projectRequirements.buildingProgram || 'building',
        floors: projectRequirements.buildingDNA?.dimensions?.floors || '2',
        dimensions: '10m x 8m',
        roofType: projectRequirements.buildingDNA?.roof?.type || 'gable',
        windowPattern: 'regular grid',
        architecturalFeatures: []
      },
      source: 'fallback',
      error: error.message
    };
  }
}

export default {
  generateDesignReasoning,
  summarizeDesignContext
};

