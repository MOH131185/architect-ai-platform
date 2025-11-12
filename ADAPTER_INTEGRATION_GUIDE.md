# Adapter Integration Guide

**Non-Breaking Migration Path for Design DNA Adapters**

This guide shows how to integrate the new adapters into existing services without breaking current functionality.

---

## Integration Strategy

### Phase 1: Parallel Operation (Safe)
- New adapters run alongside existing code
- Existing code continues to work unchanged
- Results are compared for validation
- No user-facing changes

### Phase 2: Gradual Replacement (Controlled)
- Replace one function at a time
- Keep fallback to old code path if adapter fails
- Monitor for issues
- Roll back if needed

### Phase 3: Full Migration (Final)
- Remove old code paths
- All services use adapters exclusively
- Consistent data shapes guaranteed

---

## Example 1: OpenAI Service Integration

### Before (Current Code)
```javascript
// src/services/openaiService.js (line 26-66)
async generateDesignReasoning(projectContext) {
  if (!this.apiKey) {
    return this.getFallbackReasoning(projectContext);
  }

  try {
    const prompt = this.buildDesignPrompt(projectContext);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: '...' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseDesignReasoning(data.choices[0].message.content, projectContext);

  } catch (error) {
    console.error('OpenAI API error:', error);
    return this.getFallbackReasoning(projectContext);
  }
}
```

### After (With Adapter - Non-Breaking)
```javascript
// src/services/openaiService.js
import { post } from './apiClient.js';
import { adaptDesignReasoning, createFallbackDesignReasoning } from './adapters/openaiAdapter.js';
import { getApiKey, ServiceName } from '../config/appConfig.js';

async generateDesignReasoning(projectContext) {
  // Use new config module for API key
  const apiKey = getApiKey(ServiceName.OPENAI_REASONING, { required: false });

  if (!apiKey) {
    return createFallbackDesignReasoning(projectContext);
  }

  try {
    const prompt = this.buildDesignPrompt(projectContext);
    const startTime = Date.now();

    // Use unified API client instead of raw fetch
    const response = await post('openai', '/chat', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert architectural AI assistant...'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    }, {
      timeout: 120000, // 2 minutes
      retries: 2
    });

    const latencyMs = Date.now() - startTime;

    // Use adapter to normalize response
    return adaptDesignReasoning(response.data, latencyMs, {
      model: 'gpt-4',
      isFallback: false
    });

  } catch (error) {
    console.error('OpenAI API error:', error);
    return createFallbackDesignReasoning(projectContext);
  }
}
```

### Key Changes
1. **Import new modules**: `apiClient`, `openaiAdapter`, `appConfig`
2. **Use `getApiKey()`**: Centralized config instead of `process.env`
3. **Use `post()`**: Unified client with retry logic instead of raw `fetch`
4. **Use `adaptDesignReasoning()`**: Normalize response to canonical shape
5. **Use `createFallbackDesignReasoning()`**: Consistent fallback structure

### Result
- ✅ Response now has `meta` field with telemetry
- ✅ Automatic retry on network errors
- ✅ Consistent error handling
- ✅ Token usage and cost tracking
- ✅ Backward compatible (existing callers work unchanged)

---

## Example 2: Replicate Service Integration

### Before (Current Code)
```javascript
// src/services/replicateService.js (line 101-139)
async generateArchitecturalImage(generationParams) {
  if (!this.apiKey) {
    console.warn('No Replicate API key, using fallback image');
    const fallback = this.getFallbackImage(generationParams);
    return {
      success: false,
      images: fallback.images || [fallback],
      isFallback: true,
      parameters: generationParams,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const prediction = await this.createPrediction(generationParams);
    const result = await this.waitForCompletion(prediction.id);

    return {
      success: true,
      images: result.output,
      predictionId: prediction.id,
      parameters: generationParams,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Replicate generation error:', error);
    console.warn('Using fallback image due to error');
    const fallback = this.getFallbackImage(generationParams);
    return {
      success: false,
      images: fallback.images || [fallback],
      error: error.message,
      isFallback: true,
      parameters: generationParams,
      timestamp: new Date().toISOString()
    };
  }
}
```

### After (With Adapter - Non-Breaking)
```javascript
// src/services/replicateService.js
import { post, get } from './apiClient.js';
import { adaptGeneratedImage, createFallbackGeneratedImage } from './adapters/replicateAdapter.js';
import { getApiKey, ServiceName } from '../config/appConfig.js';

async generateArchitecturalImage(generationParams) {
  const apiKey = getApiKey(ServiceName.REPLICATE, { required: false });

  if (!apiKey) {
    console.warn('No Replicate API key, using fallback image');
    return {
      success: false,
      images: [createFallbackGeneratedImage(generationParams.viewType)],
      isFallback: true,
      parameters: generationParams,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const startTime = Date.now();

    // Create prediction using unified client
    const createResponse = await post('replicate', '/predictions', {
      version: "stability-ai/sdxl:...",
      input: {
        prompt: generationParams.prompt || this.buildDefaultPrompt(generationParams),
        negative_prompt: generationParams.negativePrompt || "blurry, low quality...",
        width: generationParams.width || 1024,
        height: generationParams.height || 1024,
        num_inference_steps: generationParams.steps || 50,
        guidance_scale: generationParams.guidanceScale || 7.5,
        seed: generationParams.seed || Math.floor(Math.random() * 1000000)
      }
    });

    // Wait for completion
    const result = await this.waitForCompletion(createResponse.data.id);
    const latencyMs = Date.now() - startTime;

    // Use adapter to normalize response
    const generatedImage = adaptGeneratedImage(
      result,
      generationParams.viewType || 'exterior',
      latencyMs,
      { isFallback: false }
    );

    return {
      success: true,
      images: [generatedImage.url],
      predictionId: result.id,
      parameters: generationParams,
      timestamp: new Date().toISOString(),
      meta: {
        latencyMs,
        costUsd: generatedImage.meta?.costUsd || 0
      }
    };

  } catch (error) {
    console.error('Replicate generation error:', error);
    console.warn('Using fallback image due to error');

    return {
      success: false,
      images: [createFallbackGeneratedImage(generationParams.viewType)],
      error: error.message,
      isFallback: true,
      parameters: generationParams,
      timestamp: new Date().toISOString()
    };
  }
}
```

### Key Changes
1. **Use `post()` and `get()`**: Unified client with retry logic
2. **Use `adaptGeneratedImage()`**: Normalize prediction to `GeneratedImage`
3. **Use `createFallbackGeneratedImage()`**: Consistent placeholder
4. **Add telemetry**: `meta` field with cost and latency

---

## Example 3: AI Integration Service

### Current Structure
```javascript
// src/services/aiIntegrationService.js
async generateCompleteDesign(projectContext) {
  try {
    console.log('Starting complete AI design workflow...');

    // Step 1: Generate design reasoning
    const reasoning = await this.generateDesignReasoning(projectContext);

    // Step 2: Generate visualizations
    const visualizations = await this.generateVisualizations(reasoning, projectContext);

    // Step 3: Generate alternatives
    const alternatives = await this.generateDesignAlternatives(projectContext);

    // Step 4: Analyze feasibility
    const feasibility = await this.analyzeFeasibility(projectContext);

    return {
      success: true,
      reasoning,
      visualizations,
      alternatives,
      feasibility,
      timestamp: new Date().toISOString(),
      workflow: 'complete'
    };
  } catch (error) {
    console.error('Complete design generation error:', error);
    return {
      success: false,
      error: error.message,
      fallback: this.getFallbackDesign(projectContext)
    };
  }
}
```

### Enhanced Version (With Telemetry Aggregation)
```javascript
// src/services/aiIntegrationService.js
import { createMeta } from '../domain/dna.js';
import { validateDesignResult } from '../domain/validators.js';

async generateCompleteDesign(projectContext) {
  const workflowStart = Date.now();
  let totalCost = 0;

  try {
    console.log('Starting complete AI design workflow...');

    // Step 1: Generate design reasoning
    const reasoningStart = Date.now();
    const reasoning = await this.generateDesignReasoning(projectContext);
    console.log(`✅ Reasoning complete (${Date.now() - reasoningStart}ms)`);

    // Aggregate cost from meta
    if (reasoning.meta?.costUsd) totalCost += reasoning.meta.costUsd;

    // Step 2: Generate visualizations
    const vizStart = Date.now();
    const visualizations = await this.generateVisualizations(reasoning, projectContext);
    console.log(`✅ Visualizations complete (${Date.now() - vizStart}ms)`);

    if (visualizations.meta?.costUsd) totalCost += visualizations.meta.costUsd;

    // Step 3: Generate alternatives
    const altStart = Date.now();
    const alternatives = await this.generateDesignAlternatives(projectContext);
    console.log(`✅ Alternatives complete (${Date.now() - altStart}ms)`);

    if (alternatives.meta?.costUsd) totalCost += alternatives.meta.costUsd;

    // Step 4: Analyze feasibility
    const feasStart = Date.now();
    const feasibility = await this.analyzeFeasibility(projectContext);
    console.log(`✅ Feasibility complete (${Date.now() - feasStart}ms)`);

    if (feasibility.meta?.costUsd) totalCost += feasibility.meta.costUsd;

    const totalLatency = Date.now() - workflowStart;

    // Create aggregated meta
    const meta = createMeta('ai-integration', totalLatency, {
      model: 'complete-workflow',
      costUsd: totalCost
    });

    // Construct result
    const result = {
      success: true,
      reasoning,
      visualizations,
      alternatives,
      feasibility,
      meta,
      workflow: 'complete',
      isFallback: reasoning.isFallback || visualizations.isFallback
    };

    // Validate result (log warnings only)
    const validation = validateDesignResult(result);
    if (!validation.valid) {
      console.warn('DesignResult validation warnings:', validation.errors);
    }

    console.log(`🎉 Complete design generated in ${totalLatency}ms (cost: $${totalCost.toFixed(3)})`);

    return result;

  } catch (error) {
    console.error('Complete design generation error:', error);

    const totalLatency = Date.now() - workflowStart;
    const meta = createMeta('ai-integration', totalLatency, {
      model: 'complete-workflow',
      costUsd: totalCost
    });

    return {
      success: false,
      error: error.message,
      meta,
      fallback: this.getFallbackDesign(projectContext),
      isFallback: true
    };
  }
}
```

### Key Enhancements
1. **Telemetry tracking**: Track latency and cost for each step
2. **Aggregated meta**: Total cost and latency in result
3. **Progress logging**: Clear console output for each step
4. **Validation**: Runtime validation with warnings
5. **Cost transparency**: User sees total cost of generation

---

## Migration Checklist

### For Each Service Function:

- [ ] Import adapter modules (`openaiAdapter.js`, `replicateAdapter.js`)
- [ ] Import config module (`appConfig.js`)
- [ ] Import API client (`apiClient.js`)
- [ ] Replace `process.env.*` with `getApiKey(ServiceName.*)`
- [ ] Replace `fetch()` with `post()` or `get()`
- [ ] Add `const startTime = Date.now()` before API call
- [ ] Calculate `latencyMs = Date.now() - startTime`
- [ ] Use adapter function to normalize response
- [ ] Use fallback creator instead of inline fallback objects
- [ ] Add validation (optional, use `validateSafe()`)
- [ ] Test that existing callers still work
- [ ] Update JSDoc comments to reference canonical types

### Testing Strategy:

1. **Unit test adapters**: Test with mock API responses
2. **Integration test**: Call actual APIs, verify shapes
3. **Regression test**: Ensure existing UI code works
4. **Cost test**: Verify cost calculations are accurate
5. **Fallback test**: Verify fallbacks work when APIs fail

---

## Rollback Plan

If issues arise after integration:

1. **Keep old code commented**: Don't delete old implementation immediately
2. **Feature flag**: Add `USE_ADAPTERS` flag to toggle new/old code
3. **Monitoring**: Watch for validation errors in console
4. **Quick rollback**: Uncomment old code, comment new code

Example:
```javascript
const USE_ADAPTERS = process.env.REACT_APP_USE_ADAPTERS === 'true';

async generateDesignReasoning(projectContext) {
  if (USE_ADAPTERS) {
    // New adapter-based code
    return this.generateDesignReasoningWithAdapter(projectContext);
  } else {
    // Old code (fallback)
    return this.generateDesignReasoningLegacy(projectContext);
  }
}
```

---

## Next Steps

1. ✅ Read this guide
2. ⏭️ Integrate adapters into `openaiService.js` (1-2 functions at a time)
3. ⏭️ Integrate adapters into `replicateService.js`
4. ⏭️ Update `aiIntegrationService.js` for telemetry aggregation
5. ⏭️ Test thoroughly
6. ⏭️ Monitor for issues
7. ⏭️ Remove old code after 1-2 weeks of stable operation

---

**End of Integration Guide**
