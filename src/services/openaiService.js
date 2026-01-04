/**
 * OpenAI Service for Design Reasoning
 * Provides AI-powered architectural design reasoning and analysis
 *
 * SECURITY: All API calls go through server proxy - no API keys in client code
 */

import secureApiClient from './secureApiClient.js';
import runtimeEnv from '../utils/runtimeEnv.js';
import logger from '../utils/logger.js';


const OPENAI_API_URL = process.env.NODE_ENV === 'production'
  ? '/api/openai-chat'
  : 'http://localhost:3001/api/openai-chat';

class OpenAIService {
  constructor() {
    // No API key needed - handled by server
    this.isAvailable = true; // Server will handle availability
  }

  /**
   * Generate architectural design reasoning based on project context
   * @param {Object} projectContext - Project information including location, requirements, etc.
   * @returns {Promise<Object>} Design reasoning and recommendations
   */
  async generateDesignReasoning(projectContext) {
    try {
      const prompt = this.buildDesignPrompt(projectContext);

      const data = await secureApiClient.openaiChat({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert architectural AI assistant specializing in vernacular and contemporary architecture, with deep expertise in blending local tradition with modern design. You excel at analyzing location context, climate adaptations, and portfolio styles to create contextually appropriate designs. Provide detailed, technical architectural insights in structured JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      return this.parseDesignReasoning(data.choices[0].message.content, projectContext);

    } catch (error) {
      logger.error('OpenAI API error:', error);
      return this.getFallbackReasoning(projectContext);
    }
  }

  /**
   * Build comprehensive design prompt from project context
   * Enhanced with location analysis and portfolio style context
   */
  buildDesignPrompt(projectContext) {
    const {
      location,
      buildingProgram,
      siteConstraints,
      climate,
      climateData,
      zoning,
      userPreferences,
      locationAnalysis,
      portfolioStyle,
      blendedStyle
    } = projectContext;

    // Extract seasonal climate data if available
    const seasonalClimate = climateData?.seasonal ? `
SEASONAL CLIMATE DATA:
- Winter: Avg ${climateData.seasonal.winter?.avgTemp || 'N/A'}°C, ${climateData.seasonal.winter?.precipitation || 'N/A'}mm precipitation
- Spring: Avg ${climateData.seasonal.spring?.avgTemp || 'N/A'}°C, ${climateData.seasonal.spring?.precipitation || 'N/A'}mm precipitation
- Summer: Avg ${climateData.seasonal.summer?.avgTemp || 'N/A'}°C, ${climateData.seasonal.summer?.precipitation || 'N/A'}mm precipitation
- Fall: Avg ${climateData.seasonal.fall?.avgTemp || 'N/A'}°C, ${climateData.seasonal.fall?.precipitation || 'N/A'}mm precipitation
- Sun Path: ${climateData.sunPath?.summer || 'N/A'} (summer), ${climateData.sunPath?.winter || 'N/A'} (winter)
- Optimal Orientation: ${climateData.sunPath?.optimalOrientation || 'N/A'}` : '';

    // Extract location architectural style data
    const locationStyleInfo = locationAnalysis ? `
LOCATION ARCHITECTURAL CONTEXT:
- Primary Local Style: ${locationAnalysis.primary || 'Contemporary'}
- Local Materials: ${locationAnalysis.materials?.slice(0, 5).join(', ') || 'Not specified'}
- Local Characteristics: ${locationAnalysis.characteristics?.slice(0, 5).join(', ') || 'Not specified'}
- Climate Adaptations: ${locationAnalysis.climateAdaptations?.features?.slice(0, 5).join(', ') || 'Not specified'}
- Alternative Styles: ${locationAnalysis.alternatives?.slice(0, 3).join(', ') || 'Not specified'}` : '';

    // Extract portfolio style data
    const portfolioStyleInfo = portfolioStyle ? `
PORTFOLIO STYLE ANALYSIS:
- Detected Style: ${portfolioStyle.primaryStyle?.style || 'Not specified'}
- Confidence: ${portfolioStyle.primaryStyle?.confidence || 'Not specified'}
- Key Materials: ${portfolioStyle.designElements?.materials || 'Not specified'}
- Spatial Organization: ${portfolioStyle.designElements?.spatialOrganization || 'Not specified'}
- Design Characteristics: ${portfolioStyle.styleConsistency?.signatureElements || 'Not specified'}` : '';

    // Extract blended style information
    const blendedStyleInfo = blendedStyle ? `
BLENDED STYLE APPROACH:
- Style Name: ${blendedStyle.styleName || 'Contextual Contemporary'}
- Blend Ratio: ${Math.round((blendedStyle.blendRatio?.local || 0.5) * 100)}% local / ${Math.round((blendedStyle.blendRatio?.portfolio || 0.5) * 100)}% portfolio
- Selected Materials: ${blendedStyle.materials?.slice(0, 5).join(', ') || 'Not specified'}
- Design Characteristics: ${blendedStyle.characteristics?.slice(0, 5).join(', ') || 'Not specified'}
- Description: ${blendedStyle.description || 'Balanced fusion of local and portfolio styles'}` : '';

    return `
Analyze this architectural project and provide comprehensive design reasoning with specific focus on style integration and climate adaptation:

PROJECT CONTEXT:
- Location: ${location?.address || 'Not specified'}
- Climate Type: ${climate?.type || climateData?.type || 'Not specified'}
- Zoning: ${zoning?.type || 'Not specified'}
- Building Program: ${buildingProgram || 'Not specified'}
- Site Constraints: ${siteConstraints || 'Not specified'}
- User Preferences: ${userPreferences || 'Not specified'}
${seasonalClimate}
${locationStyleInfo}
${portfolioStyleInfo}
${blendedStyleInfo}

Please provide comprehensive design reasoning in the following structured JSON format:

{
  "styleRationale": {
    "overview": "Explanation of how local tradition, climate, and portfolio style influence this design",
    "localStyleImpact": "Specific ways the local architectural context shapes the design (materials, forms, cultural elements)",
    "portfolioStyleImpact": "How the portfolio style preferences are incorporated while respecting local context",
    "climateIntegration": "How seasonal climate data informs orientation, materials, and passive design strategies"
  },
  "designPhilosophy": "Overall design approach that harmonizes context, climate, and user vision",
  "spatialOrganization": {
    "strategy": "Spatial layout strategy responding to climate, site, and program",
    "keySpaces": "Primary spaces and their relationships",
    "circulation": "Movement patterns and flow",
    "flexibility": "Adaptability for future needs"
  },
  "materialRecommendations": {
    "primary": ["List of 3-5 primary materials with rationale for each"],
    "secondary": ["List of 2-3 secondary/accent materials"],
    "sustainable": "Sustainability considerations and local sourcing opportunities"
  },
  "environmentalConsiderations": {
    "passiveStrategies": "Passive heating, cooling, and ventilation approaches for this climate",
    "activeStrategies": "Active systems recommendations",
    "renewableEnergy": "Solar, geothermal, or other renewable integration opportunities",
    "waterManagement": "Rainwater harvesting, greywater, and stormwater strategies"
  },
  "technicalSolutions": {
    "structural": "Structural system recommendations",
    "envelope": "Building envelope and insulation strategies for climate",
    "mep": "MEP systems optimized for efficiency",
    "smart": "Smart building and automation opportunities"
  },
  "codeCompliance": {
    "zoning": "Zoning compliance strategy",
    "building": "Building code considerations",
    "accessibility": "Accessibility and universal design",
    "energy": "Energy code compliance pathway"
  },
  "costStrategies": {
    "valueEngineering": "Cost optimization approaches",
    "phasingOpportunities": "Potential construction phasing",
    "lifecycle": "Lifecycle cost considerations",
    "localEconomy": "Leveraging local materials and labor"
  },
  "futureProofing": {
    "adaptability": "Design flexibility for changing uses",
    "technology": "Technology integration pathways",
    "climate": "Climate change resilience",
    "expansion": "Future expansion possibilities"
  }
}

IMPORTANT: Ensure your response is valid JSON and includes all requested sections. Focus on actionable, specific recommendations that reflect the unique combination of location context, climate conditions, and design preferences.
    `.trim();
  }

  /**
   * Parse OpenAI response into structured design reasoning
   */
  parseDesignReasoning(aiResponse, projectContext) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Could not parse JSON from OpenAI response, using text format');
    }

    // Fallback to structured text response
    return {
      styleRationale: {
        overview: this.extractSection(aiResponse, 'Style Rationale') || this.extractSection(aiResponse, 'styleRationale'),
        localStyleImpact: this.extractSection(aiResponse, 'Local Style Impact') || 'Local architectural context considered',
        portfolioStyleImpact: this.extractSection(aiResponse, 'Portfolio Style Impact') || 'Portfolio preferences integrated',
        climateIntegration: this.extractSection(aiResponse, 'Climate Integration') || 'Climate-responsive design applied'
      },
      designPhilosophy: this.extractSection(aiResponse, 'Design Philosophy'),
      spatialOrganization: this.extractSection(aiResponse, 'Spatial Organization'),
      materialRecommendations: this.extractSection(aiResponse, 'Material'),
      environmentalConsiderations: this.extractSection(aiResponse, 'Environmental'),
      technicalSolutions: this.extractSection(aiResponse, 'Technical'),
      codeCompliance: this.extractSection(aiResponse, 'Code Compliance'),
      costStrategies: this.extractSection(aiResponse, 'Cost'),
      futureProofing: this.extractSection(aiResponse, 'Future'),
      rawResponse: aiResponse,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract specific sections from AI response
   */
  extractSection(text, keyword) {
    const regex = new RegExp(`${keyword}[\\s\\S]*?(?=\\n\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[0].trim() : `No ${keyword} information provided.`;
  }

  /**
   * Fallback reasoning when API is unavailable
   */
  getFallbackReasoning(projectContext) {
    return {
      designPhilosophy: "Focus on sustainable, contextually appropriate design that responds to local climate and cultural conditions.",
      spatialOrganization: "Optimize spatial flow and functionality while maintaining flexibility for future adaptations.",
      materialRecommendations: "Select materials based on local availability, durability, and environmental impact.",
      environmentalConsiderations: "Implement passive design strategies, renewable energy integration, and water conservation.",
      technicalSolutions: "Address structural efficiency, MEP optimization, and smart building technologies.",
      codeCompliance: "Ensure full compliance with local building codes and zoning requirements.",
      costStrategies: "Balance initial investment with long-term operational savings through efficient design.",
      futureProofing: "Design for adaptability and technological integration as building needs evolve.",
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate design alternatives based on different approaches
   */
  async generateDesignAlternatives(projectContext, approach = 'sustainable') {
    const approaches = {
      sustainable: 'Focus on environmental sustainability and energy efficiency',
      cost_effective: 'Prioritize cost optimization and value engineering',
      innovative: 'Embrace cutting-edge design and technology integration',
      traditional: 'Respect local architectural traditions and cultural context'
    };

    const modifiedContext = {
      ...projectContext,
      designApproach: approaches[approach] || approaches.sustainable
    };

    return await this.generateDesignReasoning(modifiedContext);
  }

  /**
   * Analyze design feasibility and constraints
   */
  async analyzeFeasibility(projectContext) {
    const feasibilityPrompt = `
Analyze the feasibility of this architectural project:

${JSON.stringify(projectContext, null, 2)}

Provide:
1. Feasibility Assessment (High/Medium/Low)
2. Key Constraints & Challenges
3. Risk Mitigation Strategies
4. Recommended Modifications
5. Timeline Considerations
6. Budget Implications

Format as structured analysis with specific recommendations.
    `;

    if (!this.apiKey) {
      return {
        feasibility: 'Medium',
        constraints: ['API unavailable for detailed analysis'],
        recommendations: ['Proceed with caution and detailed local analysis'],
        isFallback: true
      };
    }

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert architectural feasibility analyst. Provide detailed, actionable feasibility assessments.'
            },
            {
              role: 'user',
              content: feasibilityPrompt
            }
          ],
          max_tokens: 1500,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseFeasibilityAnalysis(data.choices[0].message.content);

    } catch (error) {
      logger.error('Feasibility analysis error:', error);
      return {
        feasibility: 'Unknown',
        constraints: ['Analysis unavailable'],
        recommendations: ['Manual feasibility review required'],
        error: error.message
      };
    }
  }

  parseFeasibilityAnalysis(response) {
    return {
      feasibility: this.extractSection(response, 'Feasibility') || 'Medium',
      constraints: this.extractSection(response, 'Constraints') || 'Not specified',
      recommendations: this.extractSection(response, 'Recommendations') || 'Manual review required',
      rawResponse: response,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generic chat completion method for custom prompts
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Additional options (model, temperature, etc.)
   * @returns {Promise<Object>} OpenAI API response
   */
  async chatCompletion(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model || 'gpt-4',
          messages: messages,
          max_tokens: options.max_tokens || 2000,
          temperature: options.temperature !== undefined ? options.temperature : 0.7,
          response_format: options.response_format || undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('OpenAI chat completion error:', error);
      throw error;
    }
  }
  /**
   * Summarize Design Context from initial project requirements
   * Creates a canonical JSON that GPT-4 will remember for consistency
   * @param {Object} projectRequirements - Initial project details
   * @returns {Promise<Object>} Design context JSON
   */
  async summarizeDesignContext(projectRequirements) {
    try {
      logger.info('🎨 Creating Design Context with GPT-4 for consistency...');

      const {
        buildingProgram = 'residential building',
        area = 200,
        location = {},
        blendedStyle = {},
        buildingDNA = {}
      } = projectRequirements;

      const prompt = `You are an expert architectural designer. Analyze these project requirements and create a canonical Design Context that will be used to generate consistent architectural views.

Project Requirements:
- Program: ${buildingProgram}
- Area: ${area}m²
- Location: ${location.address || 'Not specified'}
- Style: ${blendedStyle.style || 'Contemporary'}
- Materials: ${(blendedStyle.materials || []).join(', ') || 'Not specified'}
- Building DNA: ${JSON.stringify(buildingDNA, null, 2)}

Create a Design Context JSON with these exact keys:
{
  "style": "architectural style name (e.g., Contemporary, Victorian, Modern)",
  "massing": "building form description (e.g., rectangular two-story volume)",
  "facadeMaterials": "primary facade materials (e.g., red brick with glass windows)",
  "colorPalette": "color scheme (e.g., warm red brick, white window frames, dark grey roof)",
  "program": "building type",
  "floors": "number of floors",
  "dimensions": "approximate footprint dimensions (e.g., 15m x 10m)",
  "roofType": "roof type (e.g., gable, flat, hip)",
  "windowPattern": "window arrangement (e.g., symmetrical double-hung)",
  "architecturalFeatures": ["list", "of", "distinctive", "features"]
}

Be specific and descriptive. This context will be used to generate ALL architectural views consistently.`;

      const response = await this.chatCompletion([
        {
          role: 'system',
          content: 'You are an expert architectural designer. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        model: 'gpt-4',
        temperature: 0.3, // Low for consistency
        response_format: { type: 'json_object' }
      });

      const designContext = JSON.parse(response.choices[0].message.content);

      logger.info('✅ Design Context created:', designContext);

      const local = runtimeEnv.getLocal();
      if (local) {
        const sessionId = Date.now().toString();
        local.setItem('designSessionId', sessionId);
        local.setItem(`designContext_${sessionId}`, JSON.stringify(designContext));
      }

      return designContext;

    } catch (error) {
      logger.error('❌ Design Context creation failed:', error);

      // Fallback to basic context
      return {
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
      };
    }
  }

  /**
   * Convert image URL to base64 data URL via proxy
   * @param {string} imageUrl - Azure DALL·E image URL
   * @returns {Promise<string>} Base64 data URL
   */
  async imageUrlToDataURL(imageUrl) {
    try {
      // Detect dev/prod environment
      const isDev = process.env.NODE_ENV !== 'production';
      const proxyUrl = isDev
        ? `http://localhost:3001/api/proxy/image?url=${encodeURIComponent(imageUrl)}`
        : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;

      logger.info(`   Fetching via proxy: ${isDev ? 'dev' : 'prod'}`);

      // Fetch image via proxy
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Proxy fetch failed: ${response.status}`);
      }

      const blob = await response.blob();

      // Convert to data URL with aggressive downscaling to 256px and high compression
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          // Create canvas for aggressive downscaling (256px max to reduce payload)
          const canvas = document.createElement('canvas');
          const maxSize = 256; // Reduced from 512px to avoid 413 Payload Too Large
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Convert to base64 data URL with high compression (0.5 quality)
          const dataURL = canvas.toDataURL('image/jpeg', 0.5);
          logger.info(`   📦 Base64 size: ${(dataURL.length / 1024).toFixed(1)} KB`);
          resolve(dataURL);
        };

        img.onerror = () => reject(new Error('Image load failed'));
        img.src = URL.createObjectURL(blob);
      });

    } catch (error) {
      logger.error(`   ❌ Image to data URL conversion failed:`, error.message);
      throw error;
    }
  }

  /**
   * Classify view using GPT-4 Vision to verify correctness
   * @param {string} imageUrl - URL of generated image
   * @param {string} expectedView - Expected view type
   * @returns {Promise<Object>} Classification result
   */
  async classifyView(imageUrl, expectedView) {
    try {
      logger.info(`🔍 Classifying view: expected ${expectedView}`);

      // Convert Azure DALL·E URLs and Midjourney URLs to base64 data URLs to avoid timeout issues
      let finalImageUrl = imageUrl;
      if (imageUrl.includes('oaidalleapiprodscus.blob.core.windows.net') ||
          imageUrl.includes('maginary.ai') ||
          imageUrl.includes('midjourney') ||
          imageUrl.includes('cdn.discordapp.com')) { // Midjourney often uses Discord CDN
        logger.info(`   Converting image URL to base64 via proxy...`);
        try {
          finalImageUrl = await this.imageUrlToDataURL(imageUrl);
          logger.info(`   ✅ Converted to base64 data URL (${finalImageUrl.length} chars)`);
        } catch (conversionError) {
          logger.warn(`   ⚠️  Conversion failed, using original URL:`, conversionError.message);
          // Fall back to original URL if conversion fails
        }
      }

      const response = await this.chatCompletion([
        {
          role: 'system',
          content: 'You are an expert at identifying architectural drawing types. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this architectural image and determine what type of view it is.

Expected: ${expectedView}

Return JSON:
{
  "actualView": "the actual view type (floor_plan_2d, exterior_front, interior, elevation, section, axonometric, perspective)",
  "is2D": boolean (true if 2D technical drawing, false if 3D or realistic),
  "isCorrect": boolean (true if matches expected),
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`
            },
            {
              type: 'image_url',
              image_url: {
                url: finalImageUrl,
                detail: 'low' // Low detail for faster classification
              }
            }
          ]
        }
      ], {
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const classification = JSON.parse(response.choices[0].message.content);

      logger.success(` Classification: ${classification.actualView} (${classification.confidence * 100}% confident)`);

      return classification;

    } catch (error) {
      logger.error('❌ View classification failed:', error);
      return {
        actualView: 'unknown',
        is2D: false,
        isCorrect: false,
        confidence: 0,
        reason: 'Classification failed'
      };
    }
  }
}

export default new OpenAIService();
