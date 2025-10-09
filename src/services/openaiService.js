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
              content: 'You are an expert architectural AI assistant specializing in vernacular and contemporary architecture, with deep expertise in blending local tradition with modern design. You excel at analyzing location context, climate adaptations, and portfolio styles to create contextually appropriate designs. Provide detailed, technical architectural insights in structured JSON format.'
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
      console.warn('Could not parse JSON from OpenAI response, using text format');
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

  /**
   * Generate structural engineering notes and calculation justifications
   * NEW: Provides regulatory compliance, load calculations, and material specifications per floor
   * @param {Object} projectContext - Project context with location and building data
   * @param {Number} floorIndex - Floor level (0 = foundation, 1 = first floor, etc.)
   * @returns {Promise<Object>} Structural notes with codes, calculations, and specifications
   */
  async generateStructuralNotes(projectContext, floorIndex = 0) {
    const floorName = floorIndex === 0 ? 'foundation' : `floor ${floorIndex}`;
    const location = projectContext.location?.address || projectContext.location || 'Not specified';
    const climateData = projectContext.climateData || projectContext.climate || {};
    const buildingProgram = projectContext.buildingProgram || 'building';
    const floorArea = projectContext.floorArea || 200;
    const floorCount = projectContext.floorCount || Math.ceil(floorArea / 150);

    const structuralPrompt = `
Generate comprehensive structural engineering notes and calculation justifications for ${floorName} of a ${buildingProgram} project.

PROJECT DETAILS:
- Location: ${location}
- Climate: ${climateData.type || 'temperate'}
- Building Program: ${buildingProgram}
- Floor Area: ${floorArea}m²
- Total Floors: ${floorCount}
- Current Level: ${floorName}

Provide detailed structural engineering documentation including:

1. APPLICABLE BUILDING CODES & STANDARDS:
   - Local building codes for ${location}
   - International codes (IBC, Eurocode, etc.)
   - Seismic design category and requirements
   - Wind load requirements
   - Snow load requirements (if applicable)

2. LOAD CALCULATIONS:
   - Dead loads: Structural self-weight, finishes, MEP
   - Live loads: Occupancy loads for ${buildingProgram}
   - Environmental loads: Wind, seismic, snow
   - Load combinations per code
   - Safety factors applied

3. STRUCTURAL SYSTEM DESIGN:
   - Foundation type and bearing capacity requirements
   - ${floorIndex === 0 ? 'Foundation design: footings, piles, or mat foundation' : 'Floor slab design: thickness and reinforcement'}
   - Column sizing and spacing
   - Beam spans and dimensions
   - Lateral force resisting system

4. MATERIAL SPECIFICATIONS:
   - Concrete grade (e.g., C30/37, fc' = 30 MPa)
   - Steel reinforcement grade (e.g., fy = 420 MPa)
   - Structural steel grade (if applicable)
   - Masonry specifications

5. DESIGN CALCULATIONS SUMMARY:
   - Flexural design: beam/slab capacity
   - Shear design: verification
   - Deflection limits: L/360 serviceability
   - Crack control: maximum crack width
   - Punching shear at columns

6. CONSTRUCTION NOTES:
   - Reinforcement detailing requirements
   - Concrete cover for durability
   - Construction joints locations
   - Quality control requirements
   - Inspection hold points

Format as bullet points for easy reference by engineers and contractors.`;

    if (!this.apiKey) {
      return this.getFallbackStructuralNotes(projectContext, floorIndex);
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
              content: 'You are an expert structural engineer with expertise in international building codes, structural calculations, and construction documentation. Provide technically accurate, code-compliant structural design notes.'
            },
            {
              role: 'user',
              content: structuralPrompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        floorIndex,
        floorName,
        notes: data.choices[0].message.content,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Structural notes generation error:', error);
      return this.getFallbackStructuralNotes(projectContext, floorIndex);
    }
  }

  /**
   * Generate MEP engineering notes and system specifications
   * NEW: Provides MEP system design criteria, equipment specs, and regulatory requirements per floor
   * @param {Object} projectContext - Project context with location and building data
   * @param {Number} floorIndex - Floor level
   * @param {String} system - MEP system: 'hvac', 'electrical', 'plumbing', or 'combined'
   * @returns {Promise<Object>} MEP notes with codes, calculations, and specifications
   */
  async generateMEPNotes(projectContext, floorIndex = 0, system = 'combined') {
    const floorName = floorIndex === 0 ? 'ground floor' : `floor ${floorIndex + 1}`;
    const location = projectContext.location?.address || projectContext.location || 'Not specified';
    const climateData = projectContext.climateData || projectContext.climate || {};
    const buildingProgram = projectContext.buildingProgram || 'building';
    const floorArea = projectContext.floorArea || 200;

    const systemFocus = {
      hvac: 'HVAC (Heating, Ventilation, Air Conditioning)',
      electrical: 'Electrical Systems',
      plumbing: 'Plumbing and Fire Protection',
      combined: 'All MEP Systems (Mechanical, Electrical, Plumbing)'
    };

    const mepPrompt = `
Generate comprehensive ${systemFocus[system]} engineering notes and specifications for ${floorName} of a ${buildingProgram} project.

PROJECT DETAILS:
- Location: ${location}
- Climate: ${climateData.type || 'temperate'} (${climateData.seasonal?.summer?.avgTemp || 'N/A'}°C summer, ${climateData.seasonal?.winter?.avgTemp || 'N/A'}°C winter)
- Building Program: ${buildingProgram}
- Floor Area: ${floorArea}m²
- Current Level: ${floorName}

Provide detailed MEP engineering documentation for ${systemFocus[system]} including:

${system === 'hvac' || system === 'combined' ? `
1. HVAC SYSTEM DESIGN:
   - Heating/cooling load calculations (BTU/hr or kW)
   - Ventilation requirements (CFM/m³/hr per occupant)
   - Equipment selection: chillers, boilers, AHUs
   - Ductwork sizing and layout
   - Zone control strategy
   - Energy efficiency measures (SEER, EER ratings)
   - Applicable codes: ASHRAE 90.1, IMC, local codes
` : ''}

${system === 'electrical' || system === 'combined' ? `
2. ELECTRICAL SYSTEM DESIGN:
   - Total electrical load calculation (kW, VA)
   - Lighting design: lux levels for ${buildingProgram}
   - Power distribution: panel schedules
   - Circuit sizing and breaker ratings
   - Emergency power requirements
   - Life safety systems: fire alarm, emergency lighting
   - Energy code compliance
   - Applicable codes: NEC, IEC, local codes
` : ''}

${system === 'plumbing' || system === 'combined' ? `
3. PLUMBING SYSTEM DESIGN:
   - Water supply demand (GPM/l/min)
   - Drainage fixture units and pipe sizing
   - Hot water system sizing
   - Fire protection: sprinkler coverage (if required)
   - Water conservation: low-flow fixtures
   - Backflow prevention requirements
   - Applicable codes: IPC, UPC, NFPA 13, local codes
` : ''}

4. EQUIPMENT SCHEDULES:
   - Major equipment specifications
   - Manufacturer requirements
   - Capacity and model numbers
   - Installation requirements
   - Maintenance access needs

5. ENERGY EFFICIENCY & SUSTAINABILITY:
   - Energy recovery opportunities
   - Renewable energy integration points
   - Water conservation measures
   - LEED/green building considerations

6. COORDINATION NOTES:
   - Structural coordination: beam/slab penetrations
   - Ceiling height requirements
   - Equipment room sizing
   - Installation sequencing

Format as bullet points with specific values, equipment specs, and code references.`;

    if (!this.apiKey) {
      return this.getFallbackMEPNotes(projectContext, floorIndex, system);
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
              content: 'You are an expert MEP (Mechanical, Electrical, Plumbing) engineer with expertise in building systems design, energy codes, and sustainable engineering. Provide technically accurate, code-compliant MEP design notes with specific calculations and equipment specifications.'
            },
            {
              role: 'user',
              content: mepPrompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        floorIndex,
        floorName,
        system,
        notes: data.choices[0].message.content,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('MEP notes generation error:', error);
      return this.getFallbackMEPNotes(projectContext, floorIndex, system);
    }
  }

  /**
   * Fallback structural notes when API is unavailable
   */
  getFallbackStructuralNotes(projectContext, floorIndex) {
    const floorName = floorIndex === 0 ? 'foundation' : `floor ${floorIndex}`;
    return {
      success: false,
      isFallback: true,
      floorIndex,
      floorName,
      notes: `
STRUCTURAL ENGINEERING NOTES - ${floorName.toUpperCase()}

1. APPLICABLE CODES: IBC 2021, ACI 318, ASCE 7, local building codes
2. LOAD CALCULATIONS: Dead load 6 kPa, Live load 4 kPa (residential), Wind speed 45 m/s
3. STRUCTURAL SYSTEM: Reinforced concrete frame, ${floorIndex === 0 ? 'spread footings on competent soil' : 'flat slab with drop panels'}
4. MATERIALS: Concrete C30/37 (fc' = 30 MPa), Steel reinforcement Grade 60 (fy = 420 MPa)
5. DESIGN: Flexural capacity verified, Shear capacity adequate, Deflection < L/360
6. CONSTRUCTION: 40mm concrete cover, construction joints every 15m, quality control per code

Note: Detailed structural calculations and engineer's stamp required for construction.
      `.trim(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Fallback MEP notes when API is unavailable
   */
  getFallbackMEPNotes(projectContext, floorIndex, system) {
    const floorName = floorIndex === 0 ? 'ground floor' : `floor ${floorIndex + 1}`;
    return {
      success: false,
      isFallback: true,
      floorIndex,
      floorName,
      system,
      notes: `
MEP ENGINEERING NOTES - ${floorName.toUpperCase()} - ${system.toUpperCase()}

1. HVAC: Cooling load 100 W/m², heating load 80 W/m², ventilation 10 CFM/person, ASHRAE 90.1 compliance
2. ELECTRICAL: Total load 20 VA/m², lighting 10 W/m², emergency lighting per NEC, fire alarm per NFPA 72
3. PLUMBING: Water supply 2.5 GPM/fixture, drainage per fixture units, sprinkler coverage NFPA 13 (if required)
4. EQUIPMENT: AHU 5000 CFM, distribution panels 400A, water heater 80 gal, manufacturer specs TBD
5. ENERGY: Energy recovery ventilation, LED lighting, low-flow fixtures, LEED Silver target
6. COORDINATION: 600mm ceiling plenum, mechanical room 3% of floor area, structural penetrations coordinated

Note: Detailed MEP calculations and engineer's stamp required for construction.
      `.trim(),
      timestamp: new Date().toISOString()
    };
  }
}

const openaiService = new OpenAIService();
export default openaiService;
