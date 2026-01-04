/**
 * Prompt Library
 * 
 * Centralized repository of all prompt templates for the architectural AI platform.
 * Each prompt is versioned and parameterized for consistency and maintainability.
 * 
 * Prompt categories:
 * - Site analysis & climate
 * - Portfolio & style
 * - DNA generation
 * - Architectural reasoning
 * - A1 sheet generation
 * - Modification & revision
 */

const PROMPT_VERSION = '1.0.0';

/**
 * Site Analysis Prompt
 * Generates structured LocationProfile insights from raw site data
 */
export function buildSiteAnalysisPrompt({ address, coordinates, climateData, zoningData, siteMetrics, region }) {
  const systemPrompt = `You are a senior urban planner and architect specializing in site analysis and regulatory compliance.

Analyze sites for:
- Zoning regulations and building envelope constraints
- Access, circulation, and street context
- Environmental factors (sun, wind, noise, views)
- Sustainability opportunities
- Risks and mitigation strategies

Always return valid JSON conforming to the LocationProfile schema.`;

  const userPrompt = `Analyze this building site:

ADDRESS: ${address || 'Not specified'}
COORDINATES: ${coordinates ? `${coordinates.lat}°N, ${coordinates.lng}°E` : 'Not specified'}
REGION: ${region || 'Unknown'}

CLIMATE SUMMARY:
${climateData ? `- Type: ${climateData.type || 'Temperate'}
- Annual temp range: ${climateData.seasonal?.winter?.avgTemp || 'N/A'}°C to ${climateData.seasonal?.summer?.avgTemp || 'N/A'}°C
- Precipitation: ${climateData.seasonal?.summer?.precipitation || 'N/A'}mm (summer), ${climateData.seasonal?.winter?.precipitation || 'N/A'}mm (winter)
- Sun path: ${climateData.sunPath?.optimalOrientation || 'South-facing optimal'}` : 'Not available'}

ZONING:
${zoningData ? `- Classification: ${zoningData.type || 'Not specified'}
- Max height: ${zoningData.maxHeight || 'Not specified'}
- Density: ${zoningData.density || 'Not specified'}
- Setbacks: ${zoningData.setbacks || 'Not specified'}` : 'Not available'}

SITE METRICS:
${siteMetrics ? `- Area: ${siteMetrics.areaM2?.toFixed(0) || 'N/A'}m²
- Orientation: ${siteMetrics.orientationDeg?.toFixed(0) || 'N/A'}° from North
- Perimeter: ${siteMetrics.perimeterM?.toFixed(0) || 'N/A'}m
- Shape: ${siteMetrics.vertices || 'N/A'} vertices` : 'Not available'}

Provide comprehensive site analysis including:
1. Recommended building orientation (considering sun path, street access, views)
2. Height and density envelope (based on zoning and context)
3. Typical local architectural styles for this area
4. Site risks and constraints (flood zones, noise, slopes, utilities)
5. Sustainability opportunities (solar potential, natural ventilation, rainwater harvesting)
6. Access and circulation strategy

Return as JSON with fields: recommendedOrientation, heightEnvelope, localStyles[], risks[], sustainabilityOpportunities[], accessStrategy, and siteRationale (narrative text).`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * Climate Logic Prompt
 * Transforms raw weather data into normalized ClimateData with design guidance
 */
export function buildClimateLogicPrompt({ rawWeatherData, location, seasonalData }) {
  const systemPrompt = `You are a climate-responsive design specialist. Transform raw weather data into structured climate analysis with specific design implications.

Return valid JSON matching ClimateData schema with additional climateDesignNotes field.`;

  const userPrompt = `Analyze climate data for architectural design:

LOCATION: ${location?.address || 'Not specified'}
RAW WEATHER DATA:
${JSON.stringify(rawWeatherData, null, 2)}

SEASONAL DATA:
${JSON.stringify(seasonalData, null, 2)}

Provide:
1. Climate classification (temperate, tropical, arid, continental, etc.)
2. Seasonal temperature and precipitation patterns
3. Solar path analysis (summer/winter sun angles, optimal orientation)
4. Design implications:
   - Passive heating/cooling strategies
   - Material recommendations for climate
   - Overhang depths and shading requirements
   - Ventilation strategy (natural vs mechanical)
   - Insulation requirements
   - Moisture management

Return as JSON with: type, seasonal{winter, spring, summer, fall}, sunPath{summer, winter, optimalOrientation}, and climateDesignNotes (detailed text).`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * Portfolio Style Extraction Prompt
 * Analyzes portfolio images to extract architectural style signature
 */
export function buildPortfolioStylePrompt({ images, textNotes }) {
  const systemPrompt = `You are an expert architectural critic and historian. Analyze architectural portfolios to identify:
- Dominant architectural styles and movements
- Material preferences and palettes
- Spatial organization patterns
- Facade composition and articulation
- Detailing and craftsmanship level
- Recurring design motifs

Return structured JSON with your analysis.`;

  const userPrompt = `Analyze this architectural portfolio:

${textNotes ? `PORTFOLIO NOTES:\n${textNotes}\n\n` : ''}NUMBER OF IMAGES: ${images?.length || 0}

Extract:
1. Primary architectural style (with confidence 0-1)
2. Material preferences (list with frequency)
3. Color palette (hex codes for dominant colors)
4. Spatial organization patterns (open plan, compartmentalized, etc.)
5. Facade articulation style (horizontal emphasis, vertical rhythm, grid, etc.)
6. Roof types observed (flat, gable, hip, shed, etc.)
7. Interior character (minimalist, warm, industrial, etc.)
8. Signature elements or recurring motifs

Return as JSON: {primaryStyle: {style, confidence}, materials[], colorPalette{primary, secondary, accent}, spatialOrganization, articulation, facadeRhythm, roofTypes[], interiorCharacter, signatureElements[]}.`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * Blended Style Generator Prompt
 * Merges location context and portfolio style into unified design direction
 */
export function buildBlendedStylePrompt({ locationProfile, portfolioStyle, blendRatio = { local: 0.3, portfolio: 0.7 } }) {
  const systemPrompt = `You are an architectural design director creating a unified style direction that harmonizes local context with client portfolio preferences.

Your blend must:
- Respect local architectural character and regulations
- Incorporate portfolio style preferences proportionally
- Adapt to climate and site constraints
- Use locally available materials where possible
- Create a coherent, buildable design language

Return structured JSON.`;

  const userPrompt = `Create a blended architectural style:

LOCATION CONTEXT:
- Address: ${locationProfile?.address || 'Not specified'}
- Climate: ${locationProfile?.climate?.type || 'Temperate'}
- Local styles: ${locationProfile?.localStyles?.join(', ') || 'Contemporary'}
- Recommended style: ${locationProfile?.recommendedStyle || 'Modern'}

PORTFOLIO STYLE:
${portfolioStyle ? `- Primary style: ${portfolioStyle.primaryStyle?.style || 'Contemporary'} (confidence: ${portfolioStyle.primaryStyle?.confidence || 'N/A'})
- Materials: ${portfolioStyle.materials?.join(', ') || 'Not specified'}
- Color palette: ${JSON.stringify(portfolioStyle.colorPalette || {})}
- Articulation: ${portfolioStyle.articulation || 'Not specified'}` : 'No portfolio provided'}

BLEND RATIO: ${Math.round(blendRatio.local * 100)}% local / ${Math.round(blendRatio.portfolio * 100)}% portfolio

Generate a unified style that:
1. Selects 3-5 primary materials (names + hex colors) that work in this climate and are locally available
2. Defines facade articulation that respects local context while incorporating portfolio character
3. Specifies roof type(s) appropriate for climate and style
4. Lists 5-7 design characteristics that define this blended approach
5. Provides a narrative description (2-3 sentences) of the design language

Return as JSON: {styleName, materials[{name, hexColor, application}], characteristics[], roofTypes[], blendRatio{local, portfolio}, description, climateAdaptations[]}.`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * DNA Generation Prompt
 * Creates Master Design DNA with exact specifications
 */
export function buildDNAGenerationPrompt(params) {
  const {
    projectBrief,
    projectType,
    area,
    locationProfile,
    blendedStyle,
    siteMetrics,
    programSpaces,
    zoningConstraints
  } = params;

  const systemPrompt = `You are an expert architect creating Master Design DNA for perfect cross-view consistency.

CRITICAL REQUIREMENTS:
- All dimensions MUST be exact numbers in meters (no ranges, no "approximately")
- All materials MUST have hex color codes
- All rooms MUST have exact dimensions and areas
- Window and door counts MUST be specified per facade
- Consistency rules MUST be explicit and measurable
- Building MUST fit within site boundaries and respect setbacks

Return valid JSON conforming to the Design DNA schema.`;

  const siteConstraintsText = siteMetrics ? `
SITE CONSTRAINTS (MANDATORY COMPLIANCE):
- Site area: ${siteMetrics.areaM2?.toFixed(0) || 'N/A'}m²
- Site orientation: ${siteMetrics.orientationDeg?.toFixed(0) || 'N/A'}° from North
- Buildable area: ${siteMetrics.areaM2 ? (siteMetrics.areaM2 * 0.7).toFixed(0) : 'N/A'}m² (after setbacks)
- Max footprint: ${siteMetrics.areaM2 ? (siteMetrics.areaM2 * 0.6).toFixed(0) : 'N/A'}m² (60% site coverage)
- Required setbacks: 3m front, 3m rear, 3m sides (minimum)` : '';

  const programScheduleText = programSpaces && programSpaces.length > 0 ? `
PROGRAM SCHEDULE (MUST BE ACCURATELY REFLECTED):
${programSpaces.map(s => `- ${s.name}: ${s.area}m² × ${s.count || 1} = ${(parseFloat(s.area) * (s.count || 1)).toFixed(0)}m²${s.level ? ` (${s.level})` : ''}`).join('\n')}
Total: ${programSpaces.reduce((sum, s) => sum + parseFloat(s.area || 0) * (s.count || 1), 0).toFixed(0)}m²` : '';

  const userPrompt = `Generate Master Design DNA for:

PROJECT BRIEF: ${projectBrief || `${projectType || 'Building'} project`}
PROJECT TYPE: ${projectType || 'Mixed-use'}
TOTAL AREA: ${area || 200}m²

LOCATION:
- Address: ${locationProfile?.address || 'Not specified'}
- Climate: ${locationProfile?.climate?.type || 'Temperate'}
- Zoning: ${locationProfile?.zoning?.type || 'Not specified'}
- Max height: ${locationProfile?.zoning?.maxHeight || 'Not specified'}
${siteConstraintsText}

STYLE DIRECTION:
- Style name: ${blendedStyle?.styleName || 'Contemporary'}
- Materials: ${blendedStyle?.materials?.join(', ') || 'Brick, glass, timber'}
- Characteristics: ${blendedStyle?.characteristics?.join(', ') || 'Modern, functional'}
${programScheduleText}

ZONING CONSTRAINTS:
${zoningConstraints ? JSON.stringify(zoningConstraints, null, 2) : 'Standard residential/commercial regulations'}

Generate ultra-detailed specifications in JSON format with:

1. DIMENSIONS: {length, width, totalHeight, floorCount, floorHeights[], wallThickness}
2. LEVELS: [{level, name, height, area, function, rooms[]}] for each floor
3. MATERIALS: {exterior{primary, color, texture}, roof{type, material, color, pitch}, windows{type, frame, color}, doors{}}
4. FLOOR PLANS: {ground{rooms[]}, upper{rooms[]}} with exact dimensions per room
5. ELEVATIONS: {north{features[]}, south{features[]}, east{features[]}, west{features[]}} with window/door counts
6. OPENINGS: Window and door specifications with sizes and positions
7. VIEW SPECIFIC FEATURES: Unique features per facade (entrance location, patio doors, etc.)
8. CONSISTENCY RULES: Explicit rules that MUST be followed in all views
9. BOUNDARY VALIDATION: Compliance with site boundaries and setbacks

Ensure building fits within site, respects zoning, and matches program requirements exactly.`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * Architectural Reasoning Prompt
 * Generates narrative design reasoning for UI display
 */
export function buildArchitecturalReasoningPrompt({ projectContext, locationProfile, blendedStyle, masterDNA }) {
  const systemPrompt = `You are an expert architect providing comprehensive design reasoning.

Explain design decisions in terms of:
- Style integration (local + portfolio)
- Climate responsiveness
- Spatial organization strategy
- Material selection rationale
- Environmental performance
- Code compliance approach
- Cost optimization
- Future adaptability

Return structured JSON matching DesignReasoning schema.`;

  const userPrompt = `Provide design reasoning for:

PROJECT: ${projectContext?.buildingProgram || 'Building'}
AREA: ${projectContext?.floorArea || projectContext?.area || 200}m²
LOCATION: ${locationProfile?.address || 'Not specified'}

DESIGN DNA SUMMARY:
- Dimensions: ${masterDNA?.dimensions?.length || 'N/A'}m × ${masterDNA?.dimensions?.width || 'N/A'}m × ${masterDNA?.dimensions?.totalHeight || 'N/A'}m
- Floors: ${masterDNA?.dimensions?.floorCount || 'N/A'}
- Materials: ${masterDNA?.materials?.exterior?.primary || 'N/A'}
- Roof: ${masterDNA?.roof?.type || 'N/A'}
- Style: ${masterDNA?.architecturalStyle || blendedStyle?.styleName || 'Contemporary'}

CONTEXT:
- Climate: ${locationProfile?.climate?.type || 'Temperate'}
- Zoning: ${locationProfile?.zoning?.type || 'Not specified'}
- Local styles: ${locationProfile?.localStyles?.join(', ') || 'Contemporary'}
- Blended style: ${blendedStyle?.styleName || 'Contemporary'}

Provide comprehensive reasoning as JSON:
{
  "designPhilosophy": "Overall design approach (2-3 sentences)",
  "styleRationale": {
    "overview": "How local and portfolio styles are integrated",
    "localStyleImpact": "Specific local influences",
    "portfolioStyleImpact": "Portfolio preferences incorporated",
    "climateIntegration": "Climate-responsive strategies"
  },
  "spatialOrganization": {
    "strategy": "Layout strategy",
    "keySpaces": ["Primary spaces and relationships"],
    "circulation": "Movement flow",
    "zoningStrategy": "Public/private/service zones"
  },
  "materialRecommendations": {
    "primary": "Main materials with climate justification",
    "secondary": "Accent materials",
    "sustainable": "Eco-friendly choices",
    "localSourcing": "Locally available materials"
  },
  "environmentalConsiderations": {
    "passiveStrategies": ["Natural ventilation, daylighting, etc."],
    "activeStrategies": ["HVAC, renewable energy, etc."],
    "climateResponse": "Seasonal adaptation",
    "orientationStrategy": "Solar optimization"
  },
  "codeCompliance": {
    "zoning": "Zoning compliance approach",
    "building": "Building code considerations",
    "accessibility": "Universal design",
    "energy": "Energy code pathway"
  },
  "costStrategies": {
    "valueEngineering": "Cost optimization",
    "phasingOpportunities": "Construction phasing",
    "lifecycle": "Lifecycle cost considerations"
  }
}`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * A1 Sheet Generation Prompt
 * Creates comprehensive prompt for single A1 sheet with all views
 */
export function buildA1SheetGenerationPrompt(params) {
  const {
    masterDNA,
    locationProfile,
    blendedStyle,
    siteMetrics,
    projectMeta = {},
    includesCostTable = false
  } = params;

  const dimensions = masterDNA?.dimensions || {};
  const materials = masterDNA?.materials || {};
  const style = masterDNA?.architecturalStyle || blendedStyle?.styleName || 'Contemporary';
  const projectType = projectMeta.projectType || masterDNA?.projectType || 'residential';

  const systemPrompt = `You are a professional architectural rendering model generating a single A1 sheet (841mm × 594mm landscape) containing ALL required architectural elements for UK RIBA standards.

MANDATORY PANELS (ALL MUST BE PRESENT):
1. Site/Location plan (1:1250) with north arrow and scale
2. Ground floor plan (1:100)
3. Upper floor plan (1:100) if multi-story
4. Four elevations: North, South, East, West (1:100)
5. Two sections: Section A-A and Section B-B (1:100)
6. 3D exterior perspective (photorealistic)
7. 3D axonometric view (technical)
8. Interior perspective (if applicable)
9. Material palette panel with swatches and hex codes
10. Environmental performance panel
11. UK RIBA title block with project metadata
${includesCostTable ? '12. Cost summary table\n' : ''}
CRITICAL: You must generate ONE COHERENT BUILDING shown consistently across ALL panels. Same dimensions, same materials, same design in every view.

TEXT LEGIBILITY REQUIREMENTS:
- ALL text must be LARGE, BOLD, and READABLE when zoomed
- Minimum text height: 3-5% of sheet height for body text
- Title text: 8-12% of sheet height
- Use BOLD SANS-SERIF fonts (Arial, Helvetica) in BLACK
- Dimension labels: BOLD with clear leader lines
- Room labels: LARGE UPPERCASE
- Never use small, thin, or fine text

You must strictly follow the supplied Design DNA specifications.`;

  const userPrompt = `Generate A1 architectural presentation sheet (LANDSCAPE 841mm × 594mm) for:

PROJECT: ${projectMeta.name || `${style} ${projectType}`}
TYPE: ${projectType}
LOCATION: ${locationProfile?.address || 'Not specified'}

DESIGN DNA (MUST FOLLOW EXACTLY):
DIMENSIONS: ${dimensions.length || 15}m × ${dimensions.width || 10}m × ${dimensions.totalHeight || 7}m
FLOORS: ${dimensions.floorCount || 2}
MATERIALS:
- Exterior: ${materials.exterior?.primary || 'Brick'} (${materials.exterior?.color || '#B8604E'})
- Roof: ${materials.roof?.type || 'Gable'} ${materials.roof?.material || 'tiles'} (${materials.roof?.color || '#8B4513'}) at ${materials.roof?.pitch || 35}°
- Windows: ${materials.windows?.type || 'Modern'} ${materials.windows?.frame || 'UPVC'} (${materials.windows?.color || '#FFFFFF'})

FLOOR PLANS:
${masterDNA?.floorPlans ? Object.entries(masterDNA.floorPlans).map(([level, data]) => 
  `${level.toUpperCase()}: ${data.rooms?.map(r => `${r.name} ${r.dimensions || r.area}`).join(', ') || 'TBD'}`
).join('\n') : 'Standard layout'}

ELEVATIONS (MUST ALL BE DIFFERENT):
${masterDNA?.elevations ? Object.entries(masterDNA.elevations).map(([dir, data]) =>
  `${dir.toUpperCase()}: ${data.features?.join(', ') || 'Standard facade'}`
).join('\n') : 'Four unique facades'}

SITE CONTEXT:
- Area: ${siteMetrics?.areaM2?.toFixed(0) || 'N/A'}m²
- Orientation: ${siteMetrics?.orientationDeg?.toFixed(0) || 0}° from North
- Climate: ${locationProfile?.climate?.type || 'Temperate'}

CONSISTENCY RULES (ENFORCE STRICTLY):
${masterDNA?.consistencyRules?.map((rule, i) => `${i + 1}. ${rule}`).join('\n') || '- All views must show the same building\n- Dimensions must match across all views\n- Materials must be consistent'}

STYLE: ${style}
BLEND: ${blendedStyle?.description || 'Contemporary design with local materials'}

Generate one unified A1 sheet with ALL panels showing the SAME BUILDING consistently. All dimensions, materials, and features must match between technical drawings and 3D renders.`;

  const negativePrompt = `(single 3D view only:3.0), (one large rendering:3.0), (no floor plans:3.0), (no elevations:3.0), (no sections:3.0), (missing drawings:3.0),
(inconsistent dimensions:3.5), (different building in each view:3.5), (mismatched elevations:3.5),
(tiny text:3.5), (illegible text:3.5), (small labels:3.0), (unreadable dimensions:3.5),
graph paper grid, placeholder boxes, ASCII boxes, wireframe only, sketch lines, template layout,
blurry, low quality, watermark, incomplete, draft quality, cartoonish, unrealistic`;

  return { systemPrompt, userPrompt, negativePrompt, version: PROMPT_VERSION };
}

/**
 * Modification/Revision Prompt
 * Updates DNA based on change request while preserving consistency
 */
export function buildModificationPrompt({ currentDNA, changeRequest, projectContext }) {
  const projectType = projectContext?.projectType || currentDNA?.projectType || 'building';
  const programSpaces = projectContext?.programSpaces || currentDNA?.programSpaces || [];

  const systemPrompt = `You are an expert architectural designer updating Design DNA based on modification requests.

CRITICAL RULES:
- Maintain consistency with existing DNA unless explicitly changed
- Preserve dimensions, materials, and style unless modification requires changes
- Ensure all modifications are architecturally feasible
- Return updated DNA in the same JSON format
- Only modify fields explicitly mentioned in the change request
- ALWAYS preserve: seed, projectID, and project type
- List all changed fields in a "changes" array for tracking

Return valid JSON.`;

  const userPrompt = `Update Design DNA based on modification request:

CURRENT DNA:
${JSON.stringify(currentDNA, null, 2)}

MODIFICATION REQUEST:
${changeRequest}

PROJECT TYPE: ${projectType} (MUST REMAIN ${projectType}, DO NOT CONVERT TO DIFFERENT TYPE)
${programSpaces.length > 0 ? `
PROGRAM SPACES (MUST BE PRESERVED):
${programSpaces.map(s => `- ${s.name}: ${s.area}m² × ${s.count || 1}`).join('\n')}` : ''}

REQUIREMENTS:
1. Apply the requested modification
2. Maintain architectural consistency
3. Preserve all unmodified fields
4. Keep seed and projectID unchanged
5. Ensure project type remains ${projectType}
6. List changed fields in "changes" array: [{field, oldValue, newValue, reason}]

Return complete updated DNA JSON with "changes" array at root level.`;

  return { systemPrompt, userPrompt, version: PROMPT_VERSION };
}

/**
 * Get prompt template by name
 */
export function getPromptTemplate(templateName, params) {
  const templates = {
    siteAnalysis: buildSiteAnalysisPrompt,
    climateLogic: buildClimateLogicPrompt,
    portfolioStyle: buildPortfolioStylePrompt,
    blendedStyle: buildBlendedStylePrompt,
    dnaGeneration: buildDNAGenerationPrompt,
    architecturalReasoning: buildArchitecturalReasoningPrompt,
    a1SheetGeneration: buildA1SheetGenerationPrompt,
    modification: buildModificationPrompt
  };

  const builder = templates[templateName];
  if (!builder) {
    throw new Error(`Unknown prompt template: ${templateName}`);
  }

  return builder(params);
}

/**
 * Get all available template names
 */
export function getAvailableTemplates() {
  return [
    'siteAnalysis',
    'climateLogic',
    'portfolioStyle',
    'blendedStyle',
    'dnaGeneration',
    'architecturalReasoning',
    'a1SheetGeneration',
    'modification'
  ];
}

/**
 * Get prompt library version
 */
export function getPromptLibraryVersion() {
  return PROMPT_VERSION;
}

export default {
  buildSiteAnalysisPrompt,
  buildClimateLogicPrompt,
  buildPortfolioStylePrompt,
  buildBlendedStylePrompt,
  buildDNAGenerationPrompt,
  buildArchitecturalReasoningPrompt,
  buildA1SheetGenerationPrompt,
  buildModificationPrompt,
  getPromptTemplate,
  getAvailableTemplates,
  getPromptLibraryVersion
};

