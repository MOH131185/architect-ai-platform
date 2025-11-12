/**
 * Reasoning Orchestrator
 * 
 * Provides unified reasoning API with OpenAI → Together.ai fallback
 * - Primary: OpenAI GPT-4o (if REACT_APP_OPENAI_API_KEY available)
 * - Fallback: Together.ai Qwen 2.5 72B (if OpenAI fails or unavailable)
 */

import openaiService from './openaiService';
import togetherAIReasoningService from './togetherAIReasoningService';

/**
 * Generate design reasoning with OpenAI → Together.ai fallback
 * @param {Object} projectContext - Project information including location, requirements, etc.
 * @returns {Promise<Object>} Design reasoning and recommendations
 */
export async function generateDesignReasoning(projectContext) {
  console.log('🧠 [Reasoning Orchestrator] Generating design reasoning...');
  
  // Try OpenAI first (server will handle API key availability)
  try {
    console.log('   → Attempting OpenAI GPT-4o...');
    const result = await openaiService.generateDesignReasoning(projectContext);

    // Check if result is valid (not fallback)
    if (result && !result.isFallback) {
      console.log('   ✅ OpenAI reasoning generated successfully');
      return {
        ...result,
        source: 'openai',
        model: 'gpt-4o'
      };
    } else {
      console.log('   ⚠️  OpenAI returned fallback, trying Together.ai...');
    }
  } catch (error) {
    console.warn('   ⚠️  OpenAI failed:', error.message);
    console.log('   → Falling back to Together.ai...');
  }

  // Fallback to Together.ai
  try {
    console.log('   → Using Together.ai Qwen 2.5 72B...');
    const result = await togetherAIReasoningService.generateDesignReasoning(projectContext);
    console.log('   ✅ Together.ai reasoning generated successfully');
    return {
      ...result,
      source: 'together-ai',
      model: 'Qwen/Qwen2.5-72B-Instruct-Turbo'
    };
  } catch (error) {
    console.error('   ❌ Together.ai also failed:', error.message);
    throw new Error(`Both reasoning services failed: ${error.message}`);
  }
}

/**
 * Summarize design context with OpenAI → Together.ai fallback
 * @param {Object} projectRequirements - Initial project details
 * @returns {Promise<Object>} Design context JSON
 */
export async function summarizeDesignContext(projectRequirements) {
  console.log('🎨 [Reasoning Orchestrator] Summarizing design context...');
  
  // Try OpenAI first (server will handle API key availability)
  try {
    console.log('   → Attempting OpenAI GPT-4o...');
    const result = await openaiService.summarizeDesignContext(projectRequirements);

    if (result && result.style) {
        console.log('   ✅ OpenAI context generated successfully');
        return {
          ...result,
          source: 'openai',
          model: 'gpt-4o'
        };
      } else {
        console.log('   ⚠️  OpenAI returned invalid result, trying Together.ai...');
      }
  } catch (error) {
    console.warn('   ⚠️  OpenAI failed:', error.message);
    console.log('   → Falling back to Together.ai...');
  }

  // Fallback to Together.ai
  try {
    console.log('   → Using Together.ai Qwen 2.5 72B...');
    const result = await togetherAIReasoningService.summarizeDesignContext(projectRequirements);
    console.log('   ✅ Together.ai context generated successfully');
    return {
      ...result,
      source: 'together-ai',
      model: 'Qwen/Qwen2.5-72B-Instruct-Turbo'
    };
  } catch (error) {
    console.error('   ❌ Together.ai also failed:', error.message);
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

