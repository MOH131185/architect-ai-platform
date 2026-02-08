/**
 * Together AI Reasoning Service
 *
 * REFACTORED: Now uses ModelRouter for optimal model selection
 * Maintains backward compatibility while leveraging centralized routing
 */

import modelRouter from "./modelRouter.js";
import promptLibrary from "./promptLibrary.js";
import { safeParseJsonFromLLM } from "../utils/parseJsonFromLLM.js";
import logger from "../utils/logger.js";

// Use server proxy for ALL API calls - API key is stored server-side
const TOGETHER_API_URL =
  process.env.NODE_ENV === "production"
    ? "/api/together-chat" // Vercel serverless function
    : "http://localhost:3001/api/together/chat"; // Local proxy server

const LOCAL_PROXY_BASE =
  process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";
const OPENAI_PROXY_BASE =
  process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";

function buildChatEndpoints() {
  return Array.from(
    new Set(
      [
        TOGETHER_API_URL,
        `${LOCAL_PROXY_BASE}/api/together/chat`,
        "/api/together/chat",
        "/api/together-chat",
      ].filter(Boolean),
    ),
  );
}

function buildOpenAIChatEndpoints() {
  return Array.from(
    new Set(
      [
        `${OPENAI_PROXY_BASE}/api/openai/chat`,
        `${OPENAI_PROXY_BASE}/api/openai-chat`,
        "/api/openai/chat",
        "/api/openai-chat",
      ].filter(Boolean),
    ),
  );
}

class TogetherAIReasoningService {
  constructor() {
    // API key is handled server-side via proxy - no client-side key needed
    logger.info(
      "🧠 Together AI Reasoning Service initialized (using server proxy)",
    );
    this.chatEndpoints = buildChatEndpoints();

    // Use Qwen 2.5 72B Instruct Turbo - Excellent reasoning, widely available
    // Good balance of performance and availability across Together AI tiers
    this.defaultModel = "Qwen/Qwen2.5-72B-Instruct-Turbo";
  }

  /**
   * Generate updated DNA based on change request
   * REFACTORED: Uses ModelRouter and promptLibrary
   */
  async generateUpdatedDNA({ currentDNA, changeRequest, projectContext }) {
    try {
      logger.info("🧬 Generating updated DNA via ModelRouter...");

      // Use prompt library for modification prompt
      const modifyPrompt = promptLibrary.buildModificationPrompt({
        currentDNA,
        changeRequest,
        projectContext,
      });

      // Use ModelRouter for optimal model selection
      const result = await modelRouter.callLLM("MODIFICATION_REASONING", {
        systemPrompt: modifyPrompt.systemPrompt,
        userPrompt: modifyPrompt.userPrompt,
        schema: true,
        temperature: 0.5,
        maxTokens: 3000,
        context: {
          priority: "consistency",
          requireConsistency: true,
          originalSeed: currentDNA.seed,
        },
      });

      if (!result.success) {
        throw new Error(`DNA modification failed: ${result.error}`);
      }

      const updatedDNA = result.data;

      // Preserve critical fields
      updatedDNA.seed = updatedDNA.seed || currentDNA.seed;
      updatedDNA.projectID = updatedDNA.projectID || currentDNA.projectID;

      logger.info(
        `✅ DNA updated via ${result.metadata.model} in ${result.metadata.latencyMs}ms`,
      );

      // Log changes if present
      if (updatedDNA.changes && updatedDNA.changes.length > 0) {
        logger.info(
          `   📝 Changes: ${updatedDNA.changes.length} fields modified`,
        );
        updatedDNA.changes.forEach((change) => {
          logger.info(
            `      - ${change.field}: ${change.oldValue} → ${change.newValue}`,
          );
        });
      }

      return updatedDNA;
    } catch (error) {
      logger.error("❌ Failed to generate updated DNA:", error);
      // Return current DNA as fallback
      return currentDNA;
    }
  }

  /**
   * Generate architectural design reasoning based on project context
   * @param {Object} projectContext - Project information including location, requirements, etc.
   * @returns {Promise<Object>} Design reasoning and recommendations
   */
  async generateDesignReasoning(projectContext) {
    try {
      const prompt = this.buildDesignPrompt(projectContext);

      const response = await fetch(TOGETHER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert architectural AI assistant specializing in vernacular and contemporary architecture, with deep expertise in blending local tradition with modern design. You excel at analyzing location context, climate adaptations, and portfolio styles to create contextually appropriate designs. Provide detailed, technical architectural insights in structured JSON format.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Together AI API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseDesignReasoning(
        data.choices[0].message.content,
        projectContext,
      );
    } catch (error) {
      logger.error("Together AI API error:", error);
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
      blendedStyle,
    } = projectContext;

    // Extract seasonal climate data if available
    const seasonalClimate = climateData?.seasonal
      ? `
SEASONAL CLIMATE DATA:
- Winter: Avg ${climateData.seasonal.winter?.avgTemp || "N/A"}°C, ${climateData.seasonal.winter?.precipitation || "N/A"}mm precipitation
- Spring: Avg ${climateData.seasonal.spring?.avgTemp || "N/A"}°C, ${climateData.seasonal.spring?.precipitation || "N/A"}mm precipitation
- Summer: Avg ${climateData.seasonal.summer?.avgTemp || "N/A"}°C, ${climateData.seasonal.summer?.precipitation || "N/A"}mm precipitation
- Fall: Avg ${climateData.seasonal.fall?.avgTemp || "N/A"}°C, ${climateData.seasonal.fall?.precipitation || "N/A"}mm precipitation
- Sun Path: ${climateData.sunPath?.summer || "N/A"} (summer), ${climateData.sunPath?.winter || "N/A"} (winter)
- Optimal Orientation: ${climateData.sunPath?.optimalOrientation || "N/A"}`
      : "";

    // Extract location architectural style data
    const locationStyleInfo = locationAnalysis
      ? `
LOCATION ARCHITECTURAL CONTEXT:
- Primary Local Style: ${locationAnalysis.primary || "Contemporary"}
- Local Materials: ${locationAnalysis.materials?.slice(0, 5).join(", ") || "Not specified"}
- Local Characteristics: ${locationAnalysis.characteristics?.slice(0, 5).join(", ") || "Not specified"}
- Climate Adaptations: ${locationAnalysis.climateAdaptations?.features?.slice(0, 5).join(", ") || "Not specified"}
- Alternative Styles: ${locationAnalysis.alternatives?.slice(0, 3).join(", ") || "Not specified"}`
      : "";

    // Extract portfolio style data
    const portfolioStyleInfo = portfolioStyle
      ? `
PORTFOLIO STYLE ANALYSIS:
- Detected Style: ${portfolioStyle.primaryStyle?.style || "Not specified"}
- Confidence: ${portfolioStyle.primaryStyle?.confidence || "Not specified"}
- Key Materials: ${portfolioStyle.designElements?.materials || "Not specified"}
- Spatial Organization: ${portfolioStyle.designElements?.spatialOrganization || "Not specified"}
- Design Characteristics: ${portfolioStyle.styleConsistency?.signatureElements || "Not specified"}`
      : "";

    // Extract blended style information
    const blendedStyleInfo = blendedStyle
      ? `
BLENDED STYLE APPROACH:
- Style Name: ${blendedStyle.styleName || "Contextual Contemporary"}
- Blend Ratio: ${Math.round((blendedStyle.blendRatio?.local || 0.5) * 100)}% local / ${Math.round((blendedStyle.blendRatio?.portfolio || 0.5) * 100)}% portfolio
- Selected Materials: ${blendedStyle.materials?.slice(0, 5).join(", ") || "Not specified"}
- Design Characteristics: ${blendedStyle.characteristics?.slice(0, 5).join(", ") || "Not specified"}
- Description: ${blendedStyle.description || "Balanced fusion of local and portfolio styles"}`
      : "";

    return `
Analyze this architectural project and provide comprehensive design reasoning with specific focus on style integration and climate adaptation:

PROJECT CONTEXT:
- Location: ${location?.address || "Not specified"}
- Climate Type: ${climate?.type || climateData?.type || "Not specified"}
- Zoning: ${zoning?.type || "Not specified"}
- Building Program: ${buildingProgram || "Not specified"}
- Site Constraints: ${siteConstraints || "Not specified"}
- User Preferences: ${userPreferences || "Not specified"}
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
    "keySpaces": ["List of primary spaces and their relationships"],
    "circulation": "How movement flows through the building",
    "zoningStrategy": "Public/private/service zoning approach"
  },
  "materialRecommendations": {
    "primary": "Main structural and facade materials with climate justification",
    "secondary": "Accent and detail materials",
    "sustainable": "Eco-friendly material choices and certifications",
    "localSourcing": "Locally available materials that reduce embodied carbon"
  },
  "environmentalConsiderations": {
    "passiveStrategies": ["Natural ventilation, daylighting, thermal mass, etc."],
    "activeStrategies": ["HVAC, renewable energy, smart systems"],
    "climateResponse": "How the design responds to specific seasonal climate patterns",
    "orientationStrategy": "Building orientation for optimal solar gain/shade"
  },
  "culturalIntegration": {
    "localInfluences": "How local architectural traditions are respected",
    "contemporaryAdaptation": "Modern reinterpretation of traditional elements",
    "communityContext": "How the design fits within the neighborhood character"
  }
}

Provide detailed, technical, and specific insights. Avoid generic responses.`;
  }

  /**
   * Parse AI response into structured design reasoning
   */
  parseDesignReasoning(aiResponse, projectContext) {
    // Define fallback structure
    const fallback = {
      designPhilosophy:
        this.extractSection(aiResponse, "Philosophy") ||
        aiResponse.substring(0, 500),
      spatialOrganization:
        this.extractSection(aiResponse, "Spatial") ||
        "Functional layout optimized for program requirements",
      materialRecommendations:
        this.extractSection(aiResponse, "Material") ||
        "Context-appropriate materials",
      environmentalConsiderations:
        this.extractSection(aiResponse, "Environmental") ||
        "Climate-responsive design strategies",
      rawResponse: aiResponse,
      timestamp: new Date().toISOString(),
      model: this.defaultModel,
    };

    // Use safe JSON parser with fallback
    const parsed = safeParseJsonFromLLM(aiResponse, fallback);

    // If we got a parsed result, enhance it with metadata
    if (parsed !== fallback) {
      return {
        ...parsed,
        rawResponse: aiResponse,
        timestamp: new Date().toISOString(),
        model: this.defaultModel,
      };
    }

    // Otherwise return the fallback
    return parsed;
  }

  /**
   * Extract section from text response
   */
  extractSection(text, keyword) {
    const regex = new RegExp(`${keyword}[^\\n]*:?\\s*([^\\n]+)`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Generate design alternatives with different approaches
   */
  async generateDesignAlternatives(projectContext, approach = "sustainable") {
    const approaches = {
      sustainable:
        "Focus on environmental sustainability and energy efficiency",
      cost_effective: "Prioritize cost optimization and value engineering",
      innovative: "Embrace cutting-edge design and technology integration",
      traditional:
        "Respect local architectural traditions and cultural context",
    };

    const modifiedContext = {
      ...projectContext,
      designApproach: approaches[approach] || approaches.sustainable,
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

    try {
      const response = await fetch(TOGETHER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert architectural feasibility analyst. Provide detailed, actionable feasibility assessments.",
            },
            {
              role: "user",
              content: feasibilityPrompt,
            },
          ],
          max_tokens: 1500,
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Together AI API error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseFeasibilityAnalysis(data.choices[0].message.content);
    } catch (error) {
      logger.error("Feasibility analysis error:", error);
      return {
        feasibility: "Unknown",
        constraints: ["Analysis unavailable"],
        recommendations: ["Manual feasibility review required"],
        error: error.message,
      };
    }
  }

  /**
   * Parse feasibility analysis response
   */
  parseFeasibilityAnalysis(response) {
    return {
      feasibility: this.extractSection(response, "Feasibility") || "Medium",
      constraints:
        this.extractSection(response, "Constraints") || "Not specified",
      recommendations:
        this.extractSection(response, "Recommendations") ||
        "Manual review required",
      rawResponse: response,
      timestamp: new Date().toISOString(),
      model: this.defaultModel,
    };
  }

  /**
   * Generic chat completion method for custom prompts
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Additional options (model, temperature, etc.)
   * @returns {Promise<Object>} Together AI API response
   */
  async chatCompletion(messages, options = {}) {
    logger.info("🧠 [Together AI] Chat completion:", {
      model: options.model || this.defaultModel,
      messages: messages.length,
      temperature: options.temperature,
      response_format: options.response_format,
    });

    const model = options.model || this.defaultModel;
    const isOpenAIModel =
      typeof model === "string" &&
      (model.includes("gpt-4") ||
        model.includes("gpt-4o") ||
        model.includes("o1-") ||
        model.startsWith("gpt-"));

    const endpoints = isOpenAIModel
      ? buildOpenAIChatEndpoints()
      : this.chatEndpoints && this.chatEndpoints.length > 0
        ? this.chatEndpoints
        : buildChatEndpoints();

    let lastError = null;

    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: messages,
            max_tokens: options.max_tokens || 2000,
            temperature:
              options.temperature !== undefined ? options.temperature : 0.7,
            response_format: options.response_format, // CRITICAL: Pass through response_format
            top_p: options.top_p,
            top_k: options.top_k,
            repetition_penalty: options.repetition_penalty,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // Handle nested object errors - proxy may return {error: {message: <object>}}
          const rawMsg =
            errorData.error?.message || errorData.error || response.statusText;
          const errorMessage =
            typeof rawMsg === "string"
              ? rawMsg
              : rawMsg?.message || JSON.stringify(rawMsg);
          const fallbackable =
            response.status === 404 || response.status === 502;

          const err = new Error(
            `Together AI API error: ${response.status} - ${errorMessage}`,
          );
          err.fallback = fallbackable;

          if (fallbackable && index < endpoints.length - 1) {
            logger.warn(
              `⚠️ [Together AI] Chat endpoint ${endpoint} unavailable (${response.status}) - trying fallback`,
            );
            lastError = err;
            continue;
          }

          throw err;
        }

        const result = await response.json();
        logger.info(
          `✅ [Together AI] Chat completion successful via ${endpoint}`,
        );
        return result;
      } catch (error) {
        lastError = error;
        if (error.fallback && index < endpoints.length - 1) {
          logger.warn(
            `⚠️ [Together AI] Chat endpoint failed (${endpoint}): ${error.message}. Trying next fallback...`,
          );
          continue;
        }
        logger.error("❌ [Together AI] Chat completion error:", error);
        throw error;
      }
    }

    throw (
      lastError || new Error("Together AI API error: all chat endpoints failed")
    );
  }

  /**
   * Summarize Design Context from initial project requirements
   * Creates a canonical JSON that Llama will remember for consistency
   * @param {Object} projectRequirements - Initial project details
   * @returns {Promise<Object>} Design context JSON
   */
  async summarizeDesignContext(projectRequirements) {
    try {
      logger.info(
        "🎨 Creating Design Context with Meta Llama 3.1 405B for consistency...",
      );

      const {
        buildingProgram = "residential building",
        area = 200,
        location = {},
        blendedStyle = {},
        buildingDNA = {},
      } = projectRequirements;

      const response = await this.chatCompletion(
        [
          {
            role: "system",
            content:
              "You are an expert architectural designer creating a comprehensive design context specification. Be precise and detailed.",
          },
          {
            role: "user",
            content: `Create a detailed design context for:

Building: ${buildingProgram}
Area: ${area}m²
Location: ${location?.address || "Generic location"}
Style: ${blendedStyle?.styleName || buildingDNA?.style || "Contemporary"}
Materials: ${buildingDNA?.materials?.exterior?.primary || "Not specified"}

Provide a comprehensive JSON with:
- Precise dimensions and layout
- Exact material specifications with colors
- Window and door specifications
- Roof details
- Consistency rules for all views`,
          },
        ],
        {
          max_tokens: 2000,
          temperature: 0.5,
        },
      );

      return {
        designContext: response.choices[0].message.content,
        timestamp: new Date().toISOString(),
        model: this.defaultModel,
      };
    } catch (error) {
      logger.error("Design context generation error:", error);
      return {
        designContext: "Standard design context",
        error: error.message,
      };
    }
  }

  /**
   * Fallback reasoning when API is unavailable
   */
  getFallbackReasoning(projectContext) {
    return {
      designPhilosophy: `Contextual design approach for ${projectContext.buildingProgram || "this building"}, integrating local architectural traditions with contemporary requirements.`,
      spatialOrganization: {
        strategy: "Functional zoning with climate-responsive orientation",
        keySpaces: [
          "Main functional areas",
          "Transition spaces",
          "Service areas",
        ],
        circulation: "Efficient flow connecting all zones",
        zoningStrategy:
          "Clear separation of public, private, and service areas",
      },
      materialRecommendations: {
        primary: "Locally appropriate structural materials",
        secondary: "Climate-responsive facade elements",
        sustainable: "Regionally sourced, low-embodied carbon materials",
        localSourcing: "Materials available within 500km radius",
      },
      environmentalConsiderations: {
        passiveStrategies: [
          "Natural ventilation",
          "Daylighting",
          "Thermal mass",
        ],
        activeStrategies: [
          "Energy-efficient systems",
          "Renewable energy integration",
        ],
        climateResponse: "Design optimized for local climate patterns",
        orientationStrategy: "Solar orientation for passive heating/cooling",
      },
      isFallback: true,
      timestamp: new Date().toISOString(),
      model: "fallback",
    };
  }
}

// Create singleton instance
const togetherAIReasoningService = new TogetherAIReasoningService();

export default togetherAIReasoningService;
