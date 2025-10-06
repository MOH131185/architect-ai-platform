/**
 * OpenAI Service for Design Reasoning
 * Provides AI-powered architectural design reasoning and analysis
 */

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

// Use Vercel serverless function in production, local proxy in development
const OPENAI_API_URL = process.env.NODE_ENV === 'production'
  ? '/api/openai-chat'  // Vercel serverless function
  : 'http://localhost:3001/api/openai/chat';  // Local proxy server

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
   * Step 5.1-5.2: Build comprehensive design prompt with all context from Steps 1-4
   */
  buildDesignPrompt(projectContext) {
    const {
      siteAnalysis,
      solarOrientation,
      buildingProgram,
      portfolioStyle,
      blendedStyle,
      materialAnalysis,
      userPreferences,
      budget,
      sustainabilityGoals
    } = projectContext;

    // Extract climate data
    const climate = siteAnalysis?.climate?.classification || siteAnalysis?.climate || {};
    const location = siteAnalysis?.location || projectContext.location?.address || 'Not specified';
    const coordinates = siteAnalysis?.coordinates || projectContext.location?.coordinates || {};

    // Extract solar orientation data
    const optimalOrientation = solarOrientation?.optimalOrientation?.primaryOrientation?.direction ||
                               siteAnalysis?.solar?.optimalOrientation?.primaryDirection || 'South';
    const energySavings = solarOrientation?.energySavings ||
                         siteAnalysis?.solar?.energySavings || {};

    // Extract building program data
    const programType = buildingProgram?.buildingType || projectContext.buildingType || 'Not specified';
    const totalArea = buildingProgram?.massing?.floorAreas?.totalGrossArea ||
                     projectContext.userDesiredFloorArea || 'Not specified';
    const stories = buildingProgram?.massing?.stories?.recommended || 'Not specified';
    const perLevelAllocation = buildingProgram?.perLevelAllocation || [];

    // Extract style data
    const styleMode = blendedStyle?.blendingMode || 'mix';
    const dominantStyle = blendedStyle?.dominantStyle || portfolioStyle?.dominantStyle || 'Contemporary';

    // Extract material data
    const thermalMass = materialAnalysis?.thermalMassAnalysis?.requirement || 'Medium';
    const primaryMaterials = materialAnalysis?.primaryMaterials || [];

    // Zoning data
    const zoning = siteAnalysis?.zoning || projectContext.location?.zoning || {};

    return `
You are an expert architectural AI assistant. Analyze this comprehensive architectural project and generate a detailed design reasoning document.

═══════════════════════════════════════════════════════════════
PROJECT CONTEXT (Steps 1-4 Analysis)
═══════════════════════════════════════════════════════════════

📍 LOCATION & CLIMATE (Step 1):
- Address: ${location}
- Coordinates: ${coordinates.lat || 'N/A'}°, ${coordinates.lng || 'N/A'}°
- Climate Type: ${climate.description || climate.type || 'Not specified'}
- Köppen Classification: ${climate.koppen || 'Not specified'}
- Average Temperature: ${climate.averageTemperature || 'N/A'}°C
- Temperature Range: ${climate.temperatureRange?.min || 'N/A'}°C to ${climate.temperatureRange?.max || 'N/A'}°C
- Hemisphere: ${climate.hemisphere || 'Northern'}

☀️ PASSIVE SOLAR DESIGN (Step 2):
- Optimal Orientation: ${optimalOrientation}-facing primary facade
- Solar Strategy: Emphasize passive solar gain through optimal orientation (±30° tolerance)
- Energy Savings Potential: ${energySavings.heatingReduction || '10-25%'} heating, ${energySavings.coolingReduction || '10-25%'} cooling
- Sun Path: ${siteAnalysis?.solar?.sunPath?.summer?.daylightHours || '14'} hours daylight (summer), ${siteAnalysis?.solar?.sunPath?.winter?.daylightHours || '9'} hours (winter)
- Research: Proper orientation can reduce heating/cooling energy by 10-40% (NACHI, nachi.org)
- Thermal Mass: High thermal-mass materials (concrete, brick, stone) regulate interior temperatures (DOE, energy.gov)

🏗️ BUILDING PROGRAM (Step 3):
- Building Type: ${programType}
- Total Gross Floor Area: ${totalArea} m²
- Number of Stories: ${stories}
- Site Area: ${buildingProgram?.siteAnalysis?.siteArea || 'Not specified'} m²
- Buildable Area: ${buildingProgram?.siteAnalysis?.buildableArea || 'Not specified'} m²

Per-Level Function Allocation:
${perLevelAllocation.map((level, idx) => `
  ${level.level}:
  - Surface Area: ${level.surfaceArea} m²
  ${level.dwellingType ? `- Dwelling Type: ${level.dwellingType}` : ''}
  ${level.hasSharedWall !== undefined ? `- Shared Wall: ${level.hasSharedWall ? 'Yes (party wall on one side)' : 'No'}` : ''}
  - Functions: ${level.functions?.join(', ') || 'Not specified'}
  ${level.spacePlanning ? `- Space Planning: ${Object.entries(level.spacePlanning).map(([k, v]) => `${k}: ${v}m²`).join(', ')}` : ''}
  ${level.massingConsiderations ? `- Massing Considerations: ${level.massingConsiderations.join('; ')}` : ''}
`).join('\n')}

🎨 STYLE & MATERIALS (Step 4):
- Style Blending Mode: ${styleMode} (${styleMode === 'signature' ? '100% portfolio style' : '50% portfolio + 50% local style'})
- Dominant Style: ${dominantStyle}
- Primary Materials: ${primaryMaterials.join(', ') || 'Not specified'}
- Thermal Mass Requirement: ${thermalMass} (climate-optimized)
- Material Strategy: ${materialAnalysis?.thermalMassAnalysis?.strategy || 'Balanced thermal mass with climate-responsive materials'}

🏛️ ZONING & COMPLIANCE:
- Zoning Type: ${zoning.type || 'Not specified'}
- Height Limit: ${zoning.maxHeight || 'Not specified'}
- Setbacks: ${zoning.setbacks || 'Front: 5m, Side: 3m, Rear: 5m (default)'}
- FAR (Floor Area Ratio): ${zoning.far || 'Not specified'}

💰 USER REQUIREMENTS:
- Budget: ${budget || 'Not specified'}
- Sustainability Goals: ${sustainabilityGoals || 'Energy-efficient design with passive solar strategies'}
- User Preferences: ${userPreferences || 'Not specified'}

═══════════════════════════════════════════════════════════════
REQUIRED OUTPUT (Step 5.2)
═══════════════════════════════════════════════════════════════

Generate a comprehensive design reasoning document addressing:

1️⃣ DESIGN PHILOSOPHY (aligned with local climate and cultural context):
   - Respond to ${climate.description || climate.type} climate with passive solar orientation
   - Incorporate ${optimalOrientation}-facing primary facade for optimal solar gain
   - Utilize ${thermalMass.toLowerCase()} thermal-mass materials (${primaryMaterials.slice(0, 3).join(', ')})
   - Balance portfolio style (${dominantStyle}) with local context
   - Address energy savings potential (${energySavings.totalEnergyReduction || '10-30%'} total reduction)

2️⃣ SPATIAL ORGANIZATION STRATEGY (per level):
   - Organize ${stories}-story building with ${totalArea}m² total area
   - Detail spatial layout for each level based on program allocation above
   - Optimize natural light and cross-ventilation
   - Address circulation efficiency and adjacencies
   ${perLevelAllocation[0]?.hasSharedWall ? '- Account for shared party wall constraints (windows on 3 sides only)' : ''}

3️⃣ MATERIAL & CONSTRUCTION RECOMMENDATIONS:
   - Specify materials for ${thermalMass.toLowerCase()} thermal mass requirement
   - Recommend construction techniques (e.g., ${primaryMaterials.includes('Concrete') ? 'concrete for thermal mass' : primaryMaterials.includes('Brick') ? 'brick for thermal mass' : 'appropriate thermal mass materials'})
   - Address climate-specific material performance
   - Recommend insulation values: ${materialAnalysis?.insulationStrategy?.walls || 'R-18 to R-27'} walls, ${materialAnalysis?.insulationStrategy?.roof || 'R-38 to R-49'} roof

4️⃣ ENVIRONMENTAL & SUSTAINABILITY STRATEGIES:
   - Passive solar design: ${optimalOrientation}-facing facade within ±30° tolerance
   - Thermal mass strategy: ${materialAnalysis?.thermalMassAnalysis?.recommendation || 'Medium thermal mass to moderate temperature swings'}
   - Natural ventilation and daylighting strategies
   - Energy-efficient systems (HVAC, lighting, water)
   - Sustainability certifications potential (LEED, BREEAM, Passive House)

5️⃣ STRUCTURAL & MEP CONSIDERATIONS:
   - Structural system: ${buildingProgram?.structuralConsiderations?.primarySystem || 'Reinforced concrete or steel frame'}
   - Foundation type: ${buildingProgram?.structuralConsiderations?.foundationType || 'Concrete slab or strip footings'}
   - MEP routing and vertical circulation (elevators, stairs, shafts)
   - HVAC system recommendations for ${climate.description || climate.type} climate
   - Plumbing and electrical infrastructure

6️⃣ CODE COMPLIANCE & ZONING OPTIMIZATION:
   - Compliance with ${zoning.maxHeight || 'height'} limit and ${zoning.setbacks || 'setback'} requirements
   - Fire safety and egress (${stories}-story building)
   - Accessibility (ADA/universal design)
   - Energy code compliance
   - Optimize FAR: ${zoning.far || 'maximize allowable floor area'}

7️⃣ COST & SCHEDULE ASSUMPTIONS:
   - Estimated construction cost: $${budget ? budget : '[calculate based on area and materials]'}
   - Cost per m²: $[estimate based on ${programType} and ${dominantStyle} style]
   - Construction timeline: [estimate based on ${stories} stories and ${totalArea}m²]
   - Phasing strategy (if applicable)
   - Value engineering opportunities

8️⃣ DESIGN ALTERNATIVES & FUTURE-PROOFING:
   - Alternative design approaches (sustainable, cost-effective, innovative)
   - Adaptability and flexibility for future uses
   - Climate resilience (extreme weather, temperature rise)
   - Technology integration (smart home, renewable energy)

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (Step 5.3)
═══════════════════════════════════════════════════════════════

IMPORTANT: Return your response as valid JSON with this exact structure:

{
  "designPhilosophy": "Detailed philosophy statement (200-300 words)...",
  "spatialOrganization": {
    "groundFloor": "Spatial layout strategy for ground floor...",
    "upperFloors": "Spatial layout strategy for upper floors...",
    "verticalCirculation": "Stair and elevator placement strategy...",
    "naturalLight": "Daylighting and window placement strategy..."
  },
  "materialRecommendations": {
    "structuralMaterials": ["Material 1", "Material 2"],
    "thermalMassMaterials": ["Concrete", "Brick"],
    "envelopeMaterials": ["Glass", "Insulated panels"],
    "finishMaterials": ["Material 1", "Material 2"],
    "constructionTechniques": ["Technique 1", "Technique 2"]
  },
  "environmentalStrategies": {
    "passiveSolar": "Strategy using ${optimalOrientation}-facing orientation...",
    "thermalMass": "Strategy using ${thermalMass.toLowerCase()} thermal mass...",
    "naturalVentilation": "Cross-ventilation strategy...",
    "daylighting": "Natural light strategy...",
    "energySystems": "HVAC, lighting, renewable energy..."
  },
  "structuralNotes": "Structural system, foundation, lateral loads, spans...",
  "mepNotes": "HVAC, plumbing, electrical, vertical routing...",
  "codeCompliance": "Zoning, fire safety, accessibility, energy code...",
  "costAssumptions": {
    "totalEstimate": "$[amount]",
    "costPerSqm": "$[amount]",
    "timeline": "[months] months",
    "phasing": "Construction phasing strategy..."
  },
  "futureProofing": "Adaptability, climate resilience, technology integration..."
}

Generate the JSON response now:
    `.trim();
  }

  /**
   * Step 5.3: Parse OpenAI response into structured JSON design reasoning
   */
  parseDesignReasoning(aiResponse, projectContext) {
    try {
      // Try to extract JSON from the response (may be wrapped in markdown code blocks)
      let jsonText = aiResponse;

      // Remove markdown code blocks if present
      const codeBlockMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      } else {
        // Try to find JSON object directly
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
      }

      const parsed = JSON.parse(jsonText);

      // Validate and structure the response
      return {
        designPhilosophy: parsed.designPhilosophy || 'Design philosophy not provided.',

        spatialOrganization: {
          groundFloor: parsed.spatialOrganization?.groundFloor || 'Ground floor strategy not provided.',
          upperFloors: parsed.spatialOrganization?.upperFloors || 'Upper floor strategy not provided.',
          verticalCirculation: parsed.spatialOrganization?.verticalCirculation || 'Circulation strategy not provided.',
          naturalLight: parsed.spatialOrganization?.naturalLight || 'Daylighting strategy not provided.'
        },

        materialRecommendations: {
          structuralMaterials: parsed.materialRecommendations?.structuralMaterials || [],
          thermalMassMaterials: parsed.materialRecommendations?.thermalMassMaterials || ['Concrete', 'Brick'],
          envelopeMaterials: parsed.materialRecommendations?.envelopeMaterials || [],
          finishMaterials: parsed.materialRecommendations?.finishMaterials || [],
          constructionTechniques: parsed.materialRecommendations?.constructionTechniques || []
        },

        environmentalStrategies: {
          passiveSolar: parsed.environmentalStrategies?.passiveSolar || 'Passive solar strategy not provided.',
          thermalMass: parsed.environmentalStrategies?.thermalMass || 'Thermal mass strategy not provided.',
          naturalVentilation: parsed.environmentalStrategies?.naturalVentilation || 'Ventilation strategy not provided.',
          daylighting: parsed.environmentalStrategies?.daylighting || 'Daylighting strategy not provided.',
          energySystems: parsed.environmentalStrategies?.energySystems || 'Energy systems not specified.'
        },

        structuralNotes: parsed.structuralNotes || 'Structural considerations not provided.',
        mepNotes: parsed.mepNotes || 'MEP considerations not provided.',
        codeCompliance: parsed.codeCompliance || 'Code compliance notes not provided.',

        costAssumptions: {
          totalEstimate: parsed.costAssumptions?.totalEstimate || 'Not estimated',
          costPerSqm: parsed.costAssumptions?.costPerSqm || 'Not estimated',
          timeline: parsed.costAssumptions?.timeline || 'Not estimated',
          phasing: parsed.costAssumptions?.phasing || 'Phasing strategy not provided.'
        },

        futureProofing: parsed.futureProofing || 'Future-proofing considerations not provided.',

        // Metadata
        timestamp: new Date().toISOString(),
        source: 'openai-gpt4',
        parseMethod: 'json'
      };

    } catch (error) {
      console.warn('Could not parse JSON from OpenAI response, using text extraction:', error.message);

      // Fallback to text extraction
      return {
        designPhilosophy: this.extractSection(aiResponse, 'DESIGN PHILOSOPHY') ||
                          this.extractSection(aiResponse, 'Design Philosophy') ||
                          'Design philosophy extraction failed.',

        spatialOrganization: {
          groundFloor: this.extractSection(aiResponse, 'ground floor') || 'Not provided.',
          upperFloors: this.extractSection(aiResponse, 'upper floor') || 'Not provided.',
          verticalCirculation: this.extractSection(aiResponse, 'circulation') || 'Not provided.',
          naturalLight: this.extractSection(aiResponse, 'natural light') || 'Not provided.'
        },

        materialRecommendations: {
          structuralMaterials: this.extractListItems(aiResponse, 'structural material'),
          thermalMassMaterials: this.extractListItems(aiResponse, 'thermal mass'),
          envelopeMaterials: this.extractListItems(aiResponse, 'envelope'),
          finishMaterials: this.extractListItems(aiResponse, 'finish'),
          constructionTechniques: this.extractListItems(aiResponse, 'construction technique')
        },

        environmentalStrategies: {
          passiveSolar: this.extractSection(aiResponse, 'passive solar') || 'Not provided.',
          thermalMass: this.extractSection(aiResponse, 'thermal mass') || 'Not provided.',
          naturalVentilation: this.extractSection(aiResponse, 'ventilation') || 'Not provided.',
          daylighting: this.extractSection(aiResponse, 'daylighting') || 'Not provided.',
          energySystems: this.extractSection(aiResponse, 'energy system') || 'Not provided.'
        },

        structuralNotes: this.extractSection(aiResponse, 'STRUCTURAL') || 'Not provided.',
        mepNotes: this.extractSection(aiResponse, 'MEP') || 'Not provided.',
        codeCompliance: this.extractSection(aiResponse, 'CODE COMPLIANCE') ||
                        this.extractSection(aiResponse, 'code compliance') || 'Not provided.',

        costAssumptions: {
          totalEstimate: this.extractCost(aiResponse, 'total') || 'Not estimated',
          costPerSqm: this.extractCost(aiResponse, 'per') || 'Not estimated',
          timeline: this.extractTimeline(aiResponse) || 'Not estimated',
          phasing: this.extractSection(aiResponse, 'phasing') || 'Not provided.'
        },

        futureProofing: this.extractSection(aiResponse, 'FUTURE') ||
                        this.extractSection(aiResponse, 'future-proof') || 'Not provided.',

        // Metadata
        rawResponse: aiResponse,
        timestamp: new Date().toISOString(),
        source: 'openai-gpt4',
        parseMethod: 'text-extraction'
      };
    }
  }

  /**
   * Extract specific sections from AI response
   */
  extractSection(text, keyword) {
    const regex = new RegExp(`${keyword}[\\s\\S]*?(?=\\n\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[0].trim() : null;
  }

  /**
   * Extract list items from text (e.g., materials, techniques)
   */
  extractListItems(text, keyword) {
    const section = this.extractSection(text, keyword);
    if (!section) return [];

    // Extract bullet points or comma-separated items
    const bulletMatches = section.match(/[-•]\s*([^\n]+)/g);
    if (bulletMatches) {
      return bulletMatches.map(item => item.replace(/^[-•]\s*/, '').trim());
    }

    // Try comma-separated
    const commaMatch = section.match(/:\s*([^.]+)/);
    if (commaMatch) {
      return commaMatch[1].split(',').map(item => item.trim()).filter(item => item.length > 0);
    }

    return [];
  }

  /**
   * Extract cost estimate from text
   */
  extractCost(text, keyword) {
    const regex = new RegExp(`${keyword}[^$]*\\$([\\d,]+)`, 'i');
    const match = text.match(regex);
    return match ? `$${match[1]}` : null;
  }

  /**
   * Extract timeline from text
   */
  extractTimeline(text) {
    const regex = /(\d+)\s*(?:months?|weeks?|years?)/i;
    const match = text.match(regex);
    return match ? match[0] : null;
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
