/**
 * Model Selector Service
 * Optimal AI model selection matrix for different architectural tasks
 * Includes cost optimization, quality metrics, and performance tuning
 */

class ModelSelector {
  constructor() {
    this.modelMatrix = this.initializeModelMatrix();
    this.costMatrix = this.initializeCostMatrix();
    this.performanceMetrics = this.initializePerformanceMetrics();
    this.taskProfiles = this.initializeTaskProfiles();
  }

  /**
   * Initialize comprehensive model selection matrix
   */
  initializeModelMatrix() {
    return {
      // Design DNA Generation & Reasoning
      DNA_GENERATION: {
        primary: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.2,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
            top_p: 0.9,
            frequency_penalty: 0,
            presence_penalty: 0
          },
          strengths: [
            'Excellent at structured technical output',
            'Superior JSON generation',
            'Consistent architectural specifications',
            'Fast inference speed'
          ],
          weaknesses: ['Less creative than larger models'],
          costPerCall: 0.03,
          avgLatency: '10-15s',
          reliability: 0.98
        },
        fallback: {
          model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.3,
            max_tokens: 4000,
            response_format: { type: 'json_object' }
          },
          strengths: ['Superior reasoning', 'Complex problem solving'],
          weaknesses: ['3x more expensive', '5x slower'],
          costPerCall: 0.09,
          avgLatency: '30-45s',
          reliability: 0.95
        },
        emergency: {
          model: 'gpt-4',
          provider: 'openai',
          params: {
            temperature: 0.2,
            max_tokens: 4000
          },
          costPerCall: 0.12,
          avgLatency: '20-30s',
          reliability: 0.99
        }
      },

      // A1 Sheet Generation (Comprehensive)
      A1_SHEET_GENERATION: {
        primary: {
          model: 'black-forest-labs/FLUX.1-kontext-max',
          provider: 'together',
          params: {
            num_inference_steps: 48,
            guidance_scale: 7.8,
            width: 1280,
            height: 1792, // Portrait A1
            seed: 'consistent',
            scheduler: 'DPMSolverMultistep'
          },
          strengths: [
            'Best for complex multi-view compositions',
            'Superior context understanding',
            'Professional architectural layouts',
            'Maintains consistency across views'
          ],
          weaknesses: ['Longer generation time'],
          costPerCall: 0.025,
          avgLatency: '60s',
          reliability: 0.96
        },
        fallback: {
          model: 'black-forest-labs/FLUX.1-dev',
          provider: 'together',
          params: {
            num_inference_steps: 40,
            guidance_scale: 3.5,
            width: 1792,
            height: 1280, // Landscape alternative
            seed: 'consistent'
          },
          costPerCall: 0.02,
          avgLatency: '45s',
          reliability: 0.94
        }
      },

      // 2D Technical Drawings (Floor Plans, Elevations, Sections)
      TECHNICAL_2D: {
        primary: {
          model: 'black-forest-labs/FLUX.1-schnell',
          provider: 'together',
          params: {
            num_inference_steps: 4, // Fast generation
            guidance_scale: 7.5, // High CFG for flat 2D
            width: 1024,
            height: 1024,
            seed: 'consistent'
          },
          strengths: [
            'Fast generation (8-12s)',
            'Better at flat 2D views',
            'Cost-effective',
            'Less prone to unwanted perspective'
          ],
          weaknesses: ['Limited to 12 steps max'],
          costPerCall: 0.008,
          avgLatency: '8-12s',
          reliability: 0.97
        },
        fallback: {
          model: 'black-forest-labs/FLUX.1-dev',
          provider: 'together',
          params: {
            num_inference_steps: 20,
            guidance_scale: 5.0,
            width: 1024,
            height: 768
          },
          costPerCall: 0.015,
          avgLatency: '20s',
          reliability: 0.95
        }
      },

      // 3D Photorealistic Views
      PHOTOREALISTIC_3D: {
        primary: {
          model: 'black-forest-labs/FLUX.1-dev',
          provider: 'together',
          params: {
            num_inference_steps: 40,
            guidance_scale: 3.5,
            width: 1536,
            height: 1024,
            seed: 'consistent'
          },
          strengths: [
            'Excellent photorealistic quality',
            'Superior architectural understanding',
            'Good material rendering',
            'Consistent lighting'
          ],
          weaknesses: ['Slower than schnell'],
          costPerCall: 0.018,
          avgLatency: '25-30s',
          reliability: 0.95
        },
        quality_mode: {
          model: 'black-forest-labs/FLUX.1-dev',
          provider: 'together',
          params: {
            num_inference_steps: 50, // Maximum quality
            guidance_scale: 3.5,
            width: 2048,
            height: 1536,
            seed: 'consistent'
          },
          costPerCall: 0.025,
          avgLatency: '35-40s',
          reliability: 0.93
        }
      },

      // Material Detection from Images
      MATERIAL_DETECTION: {
        primary: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' },
            vision_mode: true // If supported
          },
          strengths: [
            'Good at structured material analysis',
            'Returns consistent JSON format',
            'Fast processing'
          ],
          weaknesses: ['Text-based analysis only'],
          costPerCall: 0.02,
          avgLatency: '8-12s',
          reliability: 0.92
        },
        vision_fallback: {
          model: 'gpt-4o',
          provider: 'openai',
          params: {
            temperature: 0.3,
            max_tokens: 2000
          },
          strengths: ['True vision capabilities', 'Better material recognition'],
          weaknesses: ['3x more expensive'],
          costPerCall: 0.06,
          avgLatency: '15-20s',
          reliability: 0.95
        }
      },

      // Modification with Consistency
      MODIFICATION_REASONING: {
        primary: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.5, // Balance consistency and creativity
            max_tokens: 3000,
            response_format: { type: 'json_object' }
          },
          costPerCall: 0.025,
          avgLatency: '10-15s',
          reliability: 0.96
        }
      },

      MODIFICATION_IMAGE: {
        primary: {
          model: 'black-forest-labs/FLUX.1-kontext-max',
          provider: 'together',
          params: {
            num_inference_steps: 48,
            guidance_scale: 7.8,
            width: 1280,
            height: 1792,
            seed: 'original_seed', // CRITICAL: Same seed
            strength: 0.7 // For img2img modifications
          },
          costPerCall: 0.025,
          avgLatency: '60s',
          reliability: 0.94
        }
      },

      // Portfolio Analysis
      PORTFOLIO_ANALYSIS: {
        primary: {
          model: 'gpt-4o',
          provider: 'openai',
          params: {
            temperature: 0.3,
            max_tokens: 2000,
            vision: true
          },
          costPerCall: 0.05,
          avgLatency: '15-20s',
          reliability: 0.95
        },
        text_only: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.3,
            max_tokens: 2000
          },
          costPerCall: 0.02,
          avgLatency: '10s',
          reliability: 0.93
        }
      },

      // Site Analysis & Climate Logic
      SITE_ANALYSIS: {
        primary: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          },
          strengths: ['Structured output', 'Fast', 'Good at technical analysis'],
          costPerCall: 0.02,
          avgLatency: '10-15s',
          reliability: 0.96
        },
        fallback: {
          model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          },
          costPerCall: 0.09,
          avgLatency: '30-40s',
          reliability: 0.95
        }
      },

      CLIMATE_LOGIC: {
        primary: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.2,
            max_tokens: 1500,
            response_format: { type: 'json_object' }
          },
          costPerCall: 0.015,
          avgLatency: '8-12s',
          reliability: 0.97
        }
      },

      // Blended Style Generation
      BLENDED_STYLE_GENERATION: {
        primary: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.4,
            max_tokens: 1500,
            response_format: { type: 'json_object' }
          },
          costPerCall: 0.015,
          avgLatency: '10-15s',
          reliability: 0.96
        }
      },

      // Architectural Reasoning (narrative)
      ARCHITECTURAL_REASONING: {
        primary: {
          model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.7,
            max_tokens: 2500,
            response_format: { type: 'json_object' }
          },
          strengths: ['Rich reasoning', 'Creative insights', 'Comprehensive analysis'],
          costPerCall: 0.08,
          avgLatency: '30-40s',
          reliability: 0.95
        },
        fallback: {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          provider: 'together',
          params: {
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
          },
          costPerCall: 0.025,
          avgLatency: '12-18s',
          reliability: 0.96
        }
      }
    };
  }

  /**
   * Initialize cost matrix for providers
   */
  initializeCostMatrix() {
    return {
      together: {
        'Qwen/Qwen2.5-72B-Instruct-Turbo': {
          input: 0.00035, // per 1K tokens
          output: 0.0014   // per 1K tokens
        },
        'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
          input: 0.0035,
          output: 0.0035
        },
        'black-forest-labs/FLUX.1-schnell': {
          perImage: 0.003,
          perStep: 0.00075 // Approximate
        },
        'black-forest-labs/FLUX.1-dev': {
          perImage: 0.01,
          perStep: 0.00025
        },
        'black-forest-labs/FLUX.1-kontext-max': {
          perImage: 0.015,
          perStep: 0.0003125
        }
      },
      openai: {
        'gpt-4': {
          input: 0.03,
          output: 0.06
        },
        'gpt-4o': {
          input: 0.005,
          output: 0.015
        }
      }
    };
  }

  /**
   * Initialize performance metrics
   */
  initializePerformanceMetrics() {
    return {
      latency: {
        schnell: { min: 6, avg: 10, max: 15 },
        dev: { min: 15, avg: 25, max: 40 },
        kontext: { min: 45, avg: 60, max: 75 },
        qwen: { min: 8, avg: 12, max: 20 },
        llama405b: { min: 25, avg: 35, max: 50 }
      },
      quality: {
        schnell: { technical2D: 85, photorealistic: 60 },
        dev: { technical2D: 75, photorealistic: 95 },
        kontext: { technical2D: 90, photorealistic: 95, composition: 98 },
        qwen: { reasoning: 92, structure: 95, creativity: 75 },
        llama405b: { reasoning: 98, structure: 93, creativity: 90 }
      },
      reliability: {
        together: 0.95, // 95% uptime
        openai: 0.99,   // 99% uptime
        rateLimitRecovery: 60 // seconds
      }
    };
  }

  /**
   * Initialize task profiles for optimal model matching
   */
  initializeTaskProfiles() {
    return {
      'quick_draft': {
        priority: 'speed',
        quality: 'acceptable',
        models: ['schnell', 'qwen'],
        maxLatency: 15,
        maxCost: 0.05
      },
      'client_presentation': {
        priority: 'quality',
        quality: 'excellent',
        models: ['kontext', 'dev'],
        maxLatency: 120,
        maxCost: 0.20
      },
      'technical_documentation': {
        priority: 'accuracy',
        quality: 'high',
        models: ['schnell', 'qwen'],
        maxLatency: 30,
        maxCost: 0.10
      },
      'design_exploration': {
        priority: 'creativity',
        quality: 'good',
        models: ['dev', 'llama405b'],
        maxLatency: 60,
        maxCost: 0.15
      },
      'modification': {
        priority: 'consistency',
        quality: 'exact_match',
        models: ['kontext'],
        requireSameSeed: true,
        maxLatency: 90,
        maxCost: 0.10
      }
    };
  }

  /**
   * Select optimal model for a given task
   */
  selectModel(taskType, context = {}) {
    const {
      priority = 'balanced',
      budget = 'medium',
      timeConstraint = 'normal',
      qualityRequirement = 'high',
      fallbackEnabled = true
    } = context;

    // Get model configuration for task
    const modelConfig = this.modelMatrix[taskType];
    if (!modelConfig) {
      console.warn(`Unknown task type: ${taskType}, using DNA_GENERATION default`);
      return this.modelMatrix.DNA_GENERATION.primary;
    }

    // Check task profile
    const profile = this.matchTaskProfile(taskType, context);

    // Select based on priorities
    let selectedModel = modelConfig.primary;

    // Budget constraints
    if (budget === 'low' && modelConfig.primary.costPerCall > 0.02) {
      if (modelConfig.fallback && modelConfig.fallback.costPerCall < modelConfig.primary.costPerCall) {
        selectedModel = modelConfig.fallback;
      }
    }

    // Time constraints
    if (timeConstraint === 'urgent') {
      const primaryLatency = this.parseLatency(modelConfig.primary.avgLatency);
      if (primaryLatency > 30 && modelConfig.fallback) {
        const fallbackLatency = this.parseLatency(modelConfig.fallback.avgLatency);
        if (fallbackLatency < primaryLatency) {
          selectedModel = modelConfig.fallback;
        }
      }
    }

    // Quality requirements
    if (qualityRequirement === 'maximum' && modelConfig.quality_mode) {
      selectedModel = modelConfig.quality_mode;
    }

    // Add dynamic parameters based on context
    selectedModel = this.addDynamicParameters(selectedModel, context);

    return {
      ...selectedModel,
      taskType,
      selectedAt: new Date().toISOString(),
      reasoning: this.explainSelection(selectedModel, taskType, context)
    };
  }

  /**
   * Get optimal parameters for a specific model and task
   */
  getOptimalParameters(model, taskType, context = {}) {
    const baseParams = this.modelMatrix[taskType]?.primary?.params || {};

    // Task-specific optimizations
    const optimizations = {
      // 2D Technical drawings need high guidance
      TECHNICAL_2D: {
        guidance_scale: context.is2D ? 7.5 : 5.0,
        negative_prompt: this.getTechnical2DNegativePrompt()
      },

      // 3D views need balanced guidance
      PHOTOREALISTIC_3D: {
        guidance_scale: 3.5,
        num_inference_steps: context.quality === 'draft' ? 20 : 40
      },

      // A1 sheets need maximum consistency
      A1_SHEET_GENERATION: {
        num_inference_steps: 48,
        guidance_scale: 7.8,
        seed: context.originalSeed || Math.floor(Math.random() * 1000000)
      },

      // DNA generation needs low temperature
      DNA_GENERATION: {
        temperature: 0.2,
        top_p: 0.9,
        response_format: { type: 'json_object' }
      }
    };

    return {
      ...baseParams,
      ...(optimizations[taskType] || {}),
      ...this.getModelSpecificOptimizations(model)
    };
  }

  /**
   * Calculate cost for a generation task
   */
  calculateCost(taskType, iterations = 1, context = {}) {
    const modelConfig = this.selectModel(taskType, context);
    const baseCost = modelConfig.costPerCall || 0;

    let totalCost = baseCost * iterations;

    // Add token costs for text models
    if (modelConfig.provider === 'together' && modelConfig.model.includes('Qwen')) {
      const avgTokens = context.estimatedTokens || 2000;
      const tokenCost = this.calculateTokenCost(modelConfig.model, avgTokens);
      totalCost += tokenCost;
    }

    // Add retry costs (assume 10% retry rate)
    const retryCost = totalCost * 0.1;

    return {
      baseCost,
      iterations,
      totalCost: totalCost + retryCost,
      currency: 'USD',
      breakdown: {
        generation: totalCost,
        retries: retryCost,
        tokens: context.estimatedTokens ? this.calculateTokenCost(modelConfig.model, context.estimatedTokens) : 0
      }
    };
  }

  /**
   * Get model recommendations for a workflow
   */
  getWorkflowRecommendations(workflowType) {
    const workflows = {
      'full_project': {
        steps: [
          { task: 'DNA_GENERATION', model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', cost: 0.03 },
          { task: 'A1_SHEET_GENERATION', model: 'FLUX.1-kontext-max', cost: 0.025 },
          { task: 'MODIFICATION_REASONING', model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', cost: 0.025 },
          { task: 'MODIFICATION_IMAGE', model: 'FLUX.1-kontext-max', cost: 0.025 }
        ],
        totalCost: 0.105,
        totalTime: '3-4 minutes',
        quality: 'Professional'
      },
      'quick_concept': {
        steps: [
          { task: 'DNA_GENERATION', model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', cost: 0.03 },
          { task: 'TECHNICAL_2D', model: 'FLUX.1-schnell', cost: 0.008, quantity: 4 },
          { task: 'PHOTOREALISTIC_3D', model: 'FLUX.1-dev', cost: 0.018, quantity: 2 }
        ],
        totalCost: 0.092,
        totalTime: '2 minutes',
        quality: 'Good'
      },
      'technical_package': {
        steps: [
          { task: 'DNA_GENERATION', model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', cost: 0.03 },
          { task: 'TECHNICAL_2D', model: 'FLUX.1-schnell', cost: 0.008, quantity: 8 }
        ],
        totalCost: 0.094,
        totalTime: '90 seconds',
        quality: 'Technical'
      }
    };

    return workflows[workflowType] || workflows['full_project'];
  }

  /**
   * Monitor and adjust model selection based on performance
   */
  async monitorPerformance(modelConfig, actualLatency, actualQuality) {
    // Track performance metrics
    const performance = {
      model: modelConfig.model,
      expectedLatency: this.parseLatency(modelConfig.avgLatency),
      actualLatency,
      latencyDelta: actualLatency - this.parseLatency(modelConfig.avgLatency),
      qualityScore: actualQuality,
      timestamp: new Date().toISOString()
    };

    // Adjust future selections if consistently slow
    if (performance.latencyDelta > 10) {
      console.warn(`Model ${modelConfig.model} running slower than expected`);
      // Could trigger fallback or parameter adjustment
    }

    return performance;
  }

  // Helper methods

  matchTaskProfile(taskType, context) {
    for (const [profileName, profile] of Object.entries(this.taskProfiles)) {
      if (context.priority === profile.priority) {
        return profile;
      }
    }
    return this.taskProfiles['client_presentation']; // Default to quality
  }

  parseLatency(latencyStr) {
    if (typeof latencyStr === 'number') return latencyStr;
    const match = latencyStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 30;
  }

  addDynamicParameters(model, context) {
    const dynamic = { ...model };

    // Add seed for consistency
    if (context.requireConsistency && context.originalSeed) {
      dynamic.params = {
        ...dynamic.params,
        seed: context.originalSeed
      };
    }

    // Adjust steps for quality/speed trade-off
    if (context.priority === 'speed' && dynamic.params.num_inference_steps) {
      dynamic.params.num_inference_steps = Math.max(4, Math.floor(dynamic.params.num_inference_steps * 0.5));
    } else if (context.priority === 'quality' && dynamic.params.num_inference_steps) {
      dynamic.params.num_inference_steps = Math.min(50, Math.floor(dynamic.params.num_inference_steps * 1.2));
    }

    return dynamic;
  }

  explainSelection(model, taskType, context) {
    const reasons = [];

    if (context.budget === 'low') {
      reasons.push(`Selected for cost efficiency ($${model.costPerCall})`);
    }
    if (context.timeConstraint === 'urgent') {
      reasons.push(`Fast generation (${model.avgLatency})`);
    }
    if (context.qualityRequirement === 'maximum') {
      reasons.push('Maximum quality settings applied');
    }

    if (model.model.includes('schnell')) {
      reasons.push('Schnell selected for fast 2D technical drawings');
    } else if (model.model.includes('kontext')) {
      reasons.push('Kontext-max selected for complex multi-view composition');
    } else if (model.model.includes('Qwen')) {
      reasons.push('Qwen selected for structured technical output');
    }

    return reasons.join('; ');
  }

  calculateTokenCost(model, tokens) {
    const costs = this.costMatrix.together[model];
    if (!costs) return 0;

    const inputTokens = tokens * 0.3; // Assume 30% input
    const outputTokens = tokens * 0.7; // Assume 70% output

    return (inputTokens / 1000 * costs.input) + (outputTokens / 1000 * costs.output);
  }

  getTechnical2DNegativePrompt() {
    return '(3D perspective:1.5), (isometric:1.5), (axonometric:1.5), shadows, depth, vanishing point, foreshortening, artistic, sketchy, rough, unfinished';
  }

  getModelSpecificOptimizations(model) {
    const optimizations = {
      'FLUX.1-schnell': {
        scheduler: 'EulerDiscreteScheduler',
        eta: 0.0
      },
      'FLUX.1-dev': {
        scheduler: 'DPMSolverMultistep',
        solver_order: 2
      },
      'FLUX.1-kontext-max': {
        scheduler: 'DPMSolverMultistep',
        solver_order: 3,
        use_karras_sigmas: true
      }
    };

    return optimizations[model] || {};
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimiting(provider) {
    return {
      together: {
        imagesPerMinute: 10,
        requestsPerMinute: 60,
        minInterval: 9000, // 9 seconds between images
        retryAfter: true,
        maxRetries: 5,
        backoffMultiplier: 1.5
      },
      openai: {
        imagesPerMinute: 50,
        requestsPerMinute: 500,
        minInterval: 1200,
        retryAfter: true,
        maxRetries: 3,
        backoffMultiplier: 2.0
      }
    };
  }

  /**
   * Validate model availability
   */
  async validateAvailability(model) {
    // Check if model is available
    const available = {
      'Qwen/Qwen2.5-72B-Instruct-Turbo': true,
      'black-forest-labs/FLUX.1-schnell': true,
      'black-forest-labs/FLUX.1-dev': true,
      'black-forest-labs/FLUX.1-kontext-max': true,
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': true,
      'gpt-4': true,
      'gpt-4o': true
    };

    return {
      available: available[model] || false,
      alternatives: this.getAlternatives(model)
    };
  }

  getAlternatives(model) {
    const alternatives = {
      'black-forest-labs/FLUX.1-kontext-max': ['black-forest-labs/FLUX.1-dev'],
      'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': ['Qwen/Qwen2.5-72B-Instruct-Turbo'],
      'gpt-4o': ['gpt-4', 'Qwen/Qwen2.5-72B-Instruct-Turbo']
    };

    return alternatives[model] || [];
  }
}

// Create singleton instance
const modelSelector = new ModelSelector();

// ES6 export
export default modelSelector;
