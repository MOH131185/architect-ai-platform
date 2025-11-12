/**
 * Portfolio Style Detection Service
 * Uses OpenAI to analyze uploaded portfolio images and detect architectural styles
 *
 * SECURITY: All API calls go through server proxy - no API keys in client code
 */

import secureApiClient from './secureApiClient';

const OPENAI_API_URL = process.env.NODE_ENV === 'production'
  ? '/api/openai-chat'
  : 'http://localhost:3001/api/openai-chat';

class PortfolioStyleDetectionService {
  constructor() {
    // No API key needed - handled by server
    this.isAvailable = true; // Server will handle availability
  }

  /**
   * Analyze portfolio images to detect architectural style
   * @param {Array} portfolioImages - Array of image URLs or base64 data
   * @param {Object} locationContext - Location information for context
   * @returns {Promise<Object>} Detected style and recommendations
   */
  async detectArchitecturalStyle(portfolioImages, locationContext) {
    try {
      const prompt = this.buildStyleDetectionPrompt(portfolioImages, locationContext);

      const response = await secureApiClient.openaiChat({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert architectural analyst specializing in style detection and design pattern recognition. Analyze architectural images to identify design styles, materials, and spatial characteristics.'
          },
          {
            role: 'user',
            content: prompt
          }
          ],
          max_tokens: 1500,
          temperature: 0.3
        });

      return this.parseStyleDetection(response.choices[0].message.content, locationContext);

    } catch (error) {
      console.error('Portfolio style detection error:', error);
      return this.getFallbackStyleDetection(portfolioImages, locationContext);
    }
  }

  /**
   * Build comprehensive style detection prompt
   */
  buildStyleDetectionPrompt(portfolioImages, locationContext) {
    const {
      address = 'Not specified',
      climate = 'Not specified',
      zoning = 'Not specified'
    } = locationContext;

    return `
Analyze these architectural portfolio images and provide detailed style detection:

PORTFOLIO IMAGES: ${portfolioImages.length} images provided
LOCATION CONTEXT:
- Address: ${address}
- Climate: ${climate}
- Zoning: ${zoning}

Please analyze and provide:

1. PRIMARY ARCHITECTURAL STYLE
   - Identify the dominant architectural style (Modern, Traditional, Contemporary, etc.)
   - Confidence level (High/Medium/Low)
   - Key characteristics that define this style

2. DESIGN ELEMENTS ANALYSIS
   - Materials commonly used
   - Spatial organization patterns
   - Color palettes and textures
   - Lighting approaches
   - Structural elements

3. STYLE CONSISTENCY
   - How consistent is the style across portfolio images
   - Variations or evolution in style
   - Signature design elements

4. LOCATION ADAPTATION
   - How well the detected style fits the location context
   - Climate considerations
   - Local architectural traditions alignment

5. RECOMMENDATIONS
   - Suggested style refinements for the location
   - Material adaptations for climate
   - Design modifications for zoning compliance

Format your response as structured JSON with clear sections and specific architectural insights.
    `.trim();
  }

  /**
   * Parse OpenAI response into structured style detection
   */
  parseStyleDetection(aiResponse, locationContext) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('Could not parse JSON from style detection response, using text format');
    }

    // Fallback to structured text response
    return {
      primaryStyle: this.extractSection(aiResponse, 'PRIMARY ARCHITECTURAL STYLE'),
      designElements: this.extractSection(aiResponse, 'DESIGN ELEMENTS ANALYSIS'),
      styleConsistency: this.extractSection(aiResponse, 'STYLE CONSISTENCY'),
      locationAdaptation: this.extractSection(aiResponse, 'LOCATION ADAPTATION'),
      recommendations: this.extractSection(aiResponse, 'RECOMMENDATIONS'),
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
   * Fallback style detection when API is unavailable
   */
  getFallbackStyleDetection(portfolioImages, locationContext) {
    return {
      primaryStyle: {
        style: 'Contemporary',
        confidence: 'Medium',
        characteristics: 'Clean lines, modern materials, functional design'
      },
      designElements: {
        materials: 'Glass, steel, concrete, wood',
        spatialOrganization: 'Open plan, flexible spaces',
        colorPalette: 'Neutral tones with accent colors',
        lighting: 'Natural light emphasis, LED integration',
        structuralElements: 'Steel frame, glass facades'
      },
      styleConsistency: {
        consistency: 'Moderate',
        variations: 'Some evolution toward more sustainable design',
        signatureElements: 'Large windows, clean geometry'
      },
      locationAdaptation: {
        climateFit: 'Good for temperate climates',
        localAlignment: 'Adapts well to urban contexts',
        zoningCompliance: 'Generally compliant with modern zoning'
      },
      recommendations: {
        refinements: 'Consider local materials and climate-specific adaptations',
        materialAdaptations: 'Incorporate regional materials where possible',
        designModifications: 'Ensure compliance with local building codes'
      },
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze style compatibility with location
   */
  async analyzeLocationStyleCompatibility(detectedStyle, locationContext) {
    if (!this.apiKey) {
      return this.getFallbackCompatibilityAnalysis(detectedStyle, locationContext);
    }

    try {
      const prompt = this.buildCompatibilityPrompt(detectedStyle, locationContext);
      
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
              content: 'You are an expert architectural consultant specializing in style-location compatibility analysis. Provide detailed assessments of how architectural styles work in specific locations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.4
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseCompatibilityAnalysis(data.choices[0].message.content);

    } catch (error) {
      console.error('Style compatibility analysis error:', error);
      return this.getFallbackCompatibilityAnalysis(detectedStyle, locationContext);
    }
  }

  /**
   * Build compatibility analysis prompt
   */
  buildCompatibilityPrompt(detectedStyle, locationContext) {
    return `
Analyze the compatibility between this architectural style and the location:

DETECTED STYLE: ${JSON.stringify(detectedStyle, null, 2)}

LOCATION CONTEXT: ${JSON.stringify(locationContext, null, 2)}

Provide:
1. Compatibility Score (1-10)
2. Climate Suitability
3. Cultural Context Alignment
4. Zoning Compliance
5. Material Availability
6. Construction Feasibility
7. Recommended Adaptations

Format as structured analysis with specific recommendations.
    `.trim();
  }

  /**
   * Parse compatibility analysis response
   */
  parseCompatibilityAnalysis(aiResponse) {
    return {
      compatibilityScore: this.extractSection(aiResponse, 'Compatibility Score'),
      climateSuitability: this.extractSection(aiResponse, 'Climate Suitability'),
      culturalAlignment: this.extractSection(aiResponse, 'Cultural Context'),
      zoningCompliance: this.extractSection(aiResponse, 'Zoning Compliance'),
      materialAvailability: this.extractSection(aiResponse, 'Material Availability'),
      constructionFeasibility: this.extractSection(aiResponse, 'Construction Feasibility'),
      recommendedAdaptations: this.extractSection(aiResponse, 'Recommended Adaptations'),
      rawResponse: aiResponse,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Fallback compatibility analysis
   */
  getFallbackCompatibilityAnalysis(detectedStyle, locationContext) {
    return {
      compatibilityScore: '7/10',
      climateSuitability: 'Good for most climates with minor adaptations',
      culturalAlignment: 'Generally acceptable in urban contexts',
      zoningCompliance: 'Likely compliant with modern zoning requirements',
      materialAvailability: 'Standard materials readily available',
      constructionFeasibility: 'Feasible with standard construction methods',
      recommendedAdaptations: 'Consider local climate and material availability',
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }
}

export default new PortfolioStyleDetectionService();
