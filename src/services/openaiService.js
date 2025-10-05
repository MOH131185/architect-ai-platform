/**
 * OpenAI Service for Design Reasoning
 * Provides AI-powered architectural design reasoning and analysis
 */

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
const OPENAI_API_URL = process.env.REACT_APP_API_PROXY_URL
  ? `${process.env.REACT_APP_API_PROXY_URL}/api/openai/chat`
  : 'http://localhost:3001/api/openai/chat';  // Use local proxy by default

class OpenAIService {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
    if (!this.apiKey) {
      console.warn('OpenAI API key not found. Design reasoning will use fallback responses.');
    }
  }

  /**
   * Generate architectural design reasoning based on project context
   * @param {Object} projectContext - Project information including location, requirements, etc.
   * @returns {Promise<Object>} Design reasoning and recommendations
   */
  async generateDesignReasoning(projectContext) {
    if (!this.apiKey) {
      return this.getFallbackReasoning(projectContext);
    }

    try {
      const prompt = this.buildDesignPrompt(projectContext);
      
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
              content: 'You are an expert architectural AI assistant specializing in design reasoning, spatial analysis, and building optimization. Provide detailed, technical architectural insights.'
            },
            {
              role: 'user',
              content: prompt
            }
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

  /**
   * Build comprehensive design prompt from project context
   */
  buildDesignPrompt(projectContext) {
    const {
      location,
      buildingProgram,
      siteConstraints,
      climate,
      zoning,
      userPreferences
    } = projectContext;

    return `
Analyze this architectural project and provide comprehensive design reasoning:

PROJECT CONTEXT:
- Location: ${location?.address || 'Not specified'}
- Climate: ${climate?.type || 'Not specified'}
- Zoning: ${zoning?.type || 'Not specified'}
- Building Program: ${buildingProgram || 'Not specified'}
- Site Constraints: ${siteConstraints || 'Not specified'}
- User Preferences: ${userPreferences || 'Not specified'}

Please provide:
1. Design Philosophy & Approach
2. Spatial Organization Strategy
3. Material & Construction Recommendations
4. Environmental & Sustainability Considerations
5. Technical Challenges & Solutions
6. Code Compliance & Zoning Optimization
7. Cost-Effective Design Strategies
8. Future-Proofing Recommendations

Format your response as structured JSON with clear sections and actionable insights.
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
      console.warn('Could not parse JSON from OpenAI response, using text format');
    }

    // Fallback to structured text response
    return {
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
      console.error('Feasibility analysis error:', error);
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
}

export default new OpenAIService();
