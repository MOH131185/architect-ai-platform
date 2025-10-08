# API Documentation - ArchitectAI Platform

Complete API reference for services, endpoints, and data structures.

## Table of Contents

1. [Service APIs](#service-apis)
2. [HTTP Endpoints](#http-endpoints)
3. [Data Structures](#data-structures)
4. [Error Handling](#error-handling)
5. [Usage Examples](#usage-examples)

---

## Service APIs

### buildingProgramCalculator

Calculates comprehensive building programs including space allocation, massing, and per-level distribution.

#### `calculateBuildingProgram(buildingType, grossArea, context)`

**Parameters:**
- `buildingType` (string): Type of building - `'residential'`, `'medical_clinic'`, or `'office'`
- `grossArea` (number): Total gross floor area in square meters
- `context` (object, optional): Site context including zoning and climate data

**Returns:**
```javascript
{
  buildingType: string,
  totalGrossArea: number,
  spaces: [
    {
      function: string,
      area: number,
      quantity: number,
      totalArea: number
    }
  ],
  perLevelAllocation: [
    {
      level: string,              // e.g., "Ground Floor", "First Floor"
      surfaceArea: number,
      dwellingType: string,       // "detached", "semi-detached", "terraced"
      functions: string[],        // List of spaces on this level
      spacePlanning: object       // Detailed space allocation
    }
  ],
  massing: {
    stories: {
      min: number,
      max: number,
      recommended: number
    },
    footprint: number,            // Square meters
    height: number,               // Meters
    volume: number,               // Cubic meters
    dwellingType: string          // Only for residential
  },
  accessibility: {
    compliant: boolean,
    standard: string,             // "UK Part M"
    category: string,             // "M4(1)", "M4(2)", or "M4(3)"
    features: string[]            // List of accessibility features
  }
}
```

**Example:**
```javascript
const program = buildingProgramCalculator.calculateBuildingProgram(
  'residential',
  250,
  {
    zoning: { density: 'medium' },
    climate: { type: 'temperate' }
  }
);
```

---

### solarOrientationAnalyzer

Analyzes solar orientation and provides facade-specific recommendations.

#### `analyzeSolarOrientation(location)`

**Parameters:**
- `location` (object): Location data with coordinates and climate
  ```javascript
  {
    coordinates: { lat: number, lng: number },
    climate: { type: string }  // optional
  }
  ```

**Returns:**
```javascript
{
  hemisphere: string,           // "northern", "southern", or "equatorial"
  optimalOrientation: string,   // "North", "South", "East", or "West"
  sunPath: {
    summer: string,             // Description of summer sun path
    winter: string,             // Description of winter sun path
    equinox: string,            // Description of equinox sun path
    azimuthRange: string        // Sun's horizontal movement range
  },
  daylightHours: {
    summer: number,             // Hours of daylight in summer
    winter: number,             // Hours of daylight in winter
    equinox: number             // Hours of daylight at equinox
  },
  recommendations: {
    north: string,              // Recommendations for north facade
    south: string,              // Recommendations for south facade
    east: string,               // Recommendations for east facade
    west: string                // Recommendations for west facade
  },
  windowRecommendations: {
    optimal: string,            // Window sizing for optimal facade
    minimal: string,            // Window sizing for minimal solar gain
    glazingType: string,        // Recommended glazing specification
    shadingDevices: string[]    // Recommended shading strategies
  }
}
```

**Example:**
```javascript
const orientation = solarOrientationAnalyzer.analyzeSolarOrientation({
  coordinates: { lat: 51.5074, lng: -0.1278 },  // London
  climate: { type: 'temperate' }
});
```

---

### styleBlendingEngine

Analyzes portfolio styles and blends with local architectural context.

#### `analyzePortfolioStyle(files)`

**Parameters:**
- `files` (array): Array of image file objects
  ```javascript
  [
    { name: string, type: string }
  ]
  ```

**Returns:**
```javascript
{
  dominantStyle: string,          // Primary architectural style
  confidence: number,             // 0.0 to 1.0
  characteristics: string[],      // Style characteristics
  styleBreakdown: {
    [style: string]: number       // Percentage of each style (totals 100)
  },
  colorPalette: string[],         // Dominant colors
  materialPreferences: string[],  // Preferred materials
  confidenceBreakdown: {
    [style: string]: number       // Confidence per style
  },
  isFallback: boolean            // True if using default/fallback data
}
```

#### `detectLocalStyles(locationData)`

**Parameters:**
- `locationData` (object): Location information
  ```javascript
  {
    address: string,
    coordinates: { lat: number, lng: number }
  }
  ```

**Returns:**
```javascript
[
  {
    style: string,                // Local architectural style
    prevalence: string,           // "high", "medium", or "low"
    characteristics: string[]     // Style characteristics
  }
]
```

#### `blendStyles(portfolioStyle, localStyles, context)`

**Parameters:**
- `portfolioStyle` (object): Result from `analyzePortfolioStyle()`
- `localStyles` (array): Result from `detectLocalStyles()`
- `context` (object): Site context including zoning

**Returns:**
```javascript
{
  blendedStyle: string,           // Name of blended style
  primaryInfluence: string,       // "portfolio" or "local"
  secondaryInfluence: string,     // "portfolio" or "local"
  blendRatio: {
    portfolio: number,            // 0.0 to 1.0
    local: number                 // 0.0 to 1.0 (totals 1.0)
  },
  designPrinciples: string[],     // Guiding design principles
  recommendedMaterials: string[], // Blended material recommendations
  rationale: string               // Explanation of blending approach
}
```

**Example:**
```javascript
const portfolioStyle = await styleBlendingEngine.analyzePortfolioStyle(files);
const localStyles = styleBlendingEngine.detectLocalStyles(location);
const blend = styleBlendingEngine.blendStyles(portfolioStyle, localStyles, context);
```

---

### interactiveRefinementService

Processes natural-language design modifications with selective regeneration.

#### `processModification(prompt, currentDesign, projectContext)`

**Parameters:**
- `prompt` (string): Natural language modification request
- `currentDesign` (object): Current design state
- `projectContext` (object): Project context with building program and site analysis

**Returns:**
```javascript
{
  success: boolean,
  modification: {
    type: string,                 // "spatial", "aesthetic", "structural", "mep", "material", "program"
    scope: string[],              // Affected output types
    changes: {
      description: string,
      affectedSpaces: string[],
      affectedLevels: string[],
      parameters: object          // Type-specific parameters
    }
  },
  updatedContext: object,         // Modified project context
  regeneratedOutputs: {
    reasoning: object,            // New design reasoning (if applicable)
    floorPlans: object,           // Regenerated floor plans (if applicable)
    sections: object,             // Regenerated sections (if applicable)
    elevations: object,           // Regenerated elevations (if applicable)
    exteriorViews: object,        // Regenerated exterior views (if applicable)
    interiorViews: object,        // Regenerated interior views (if applicable)
    structural: object,           // Regenerated structural diagrams (if applicable)
    mep: object                   // Regenerated MEP diagrams (if applicable)
  },
  affectedOutputs: string[]       // List of regenerated output types
}
```

#### `validateModification(prompt, currentDesign)`

**Parameters:**
- `prompt` (string): Modification request to validate
- `currentDesign` (object): Current design state

**Returns:**
```javascript
{
  valid: boolean,
  warning: string,                // Warning message if invalid
  severity: string                // "none", "low", "medium", or "high"
}
```

#### `generateRefinementSuggestions(currentDesign)`

**Parameters:**
- `currentDesign` (object): Current design state

**Returns:**
```javascript
[
  {
    suggestion: string,           // Suggested modification
    category: string,             // "spatial", "aesthetic", "structural", etc.
    impact: string,               // Which outputs would be affected
    benefit: string               // Expected benefit
  }
]
```

**Example:**
```javascript
// Process a modification
const result = await interactiveRefinementService.processModification(
  'Add a skylight to the living room',
  currentDesign,
  projectContext
);

// Validate before applying
const validation = interactiveRefinementService.validateModification(
  'Remove the center column',
  currentDesign
);

// Get suggestions
const suggestions = await interactiveRefinementService.generateRefinementSuggestions(
  currentDesign
);
```

---

### aiIntegrationService

Orchestrates the complete AI workflow combining OpenAI reasoning and Replicate visualization.

#### `generateCompleteDesign(enhancedContext)`

**Parameters:**
- `enhancedContext` (object): Complete project context
  ```javascript
  {
    buildingProgram: object,      // From buildingProgramCalculator
    portfolioAnalysis: object,    // From styleBlendingEngine
    siteAnalysis: object,         // Location and climate data
    solarOrientation: object      // From solarOrientationAnalyzer
  }
  ```

**Returns:**
```javascript
{
  success: boolean,
  reasoning: {
    designPhilosophy: string,
    spatialOrganization: string,
    materialRecommendations: string,
    environmentalConsiderations: string,
    structuralApproach: string
  },
  outputs: {
    floorPlans: {
      success: boolean,
      totalLevels: number,
      floorPlans: {
        [level: string]: {
          success: boolean,
          image: string,          // Image URL
          surfaceArea: number,
          functions: string[],
          spacePlanning: object
        }
      }
    },
    views: {
      success: boolean,
      exteriorCount: number,
      interiorCount: number,
      views: {
        exterior_north: { success: boolean, image: string, direction: string },
        exterior_south: { success: boolean, image: string, direction: string },
        exterior_east: { success: boolean, image: string, direction: string },
        exterior_west: { success: boolean, image: string, direction: string },
        interior_[space]: { success: boolean, image: string, spaceName: string }
      }
    },
    technicalDrawings: {
      success: boolean,
      sectionCount: number,
      elevationCount: number,
      drawings: {
        section: { success: boolean, image: string },
        elevation_north: { success: boolean, image: string, direction: string },
        elevation_south: { success: boolean, image: string, direction: string },
        elevation_east: { success: boolean, image: string, direction: string },
        elevation_west: { success: boolean, image: string, direction: string }
      }
    },
    engineeringDiagrams: {
      success: boolean,
      diagrams: {
        structural: {
          success: boolean,
          image: string,
          summary: {
            structuralSystem: string,
            loadings: object,
            design: object,
            compliance: object
          }
        },
        mep: {
          success: boolean,
          image: string,
          summary: {
            mechanical: object,
            electrical: object,
            energyCompliance: object
          }
        }
      }
    },
    summary: {
      perLevelFloorPlans: number,
      exteriorViews: number,
      interiorViews: number,
      sections: number,
      elevations: number,
      engineeringDiagrams: number,
      totalOutputs: number
    }
  },
  alternatives: {
    sustainable: object,
    cost_effective: object,
    innovative: object,
    traditional: object
  },
  feasibility: {
    cost: object,
    timeline: object,
    constraints: string[],
    recommendations: string[]
  },
  timestamp: string,
  workflow: string                // "complete" or "quick"
}
```

#### `refineDesign(modificationPrompt, currentDesign, projectContext)`

**Parameters:**
- `modificationPrompt` (string): Natural language modification
- `currentDesign` (object): Current design result
- `projectContext` (object): Project context

**Returns:**
```javascript
{
  success: boolean,
  modification: object,           // Parsed modification details
  updatedDesign: object,          // Complete design with merged changes
  regeneratedOutputs: object,     // Only regenerated components
  affectedOutputs: string[]       // List of affected output types
}
```

**Example:**
```javascript
// Generate initial design
const design = await aiIntegrationService.generateCompleteDesign(enhancedContext);

// Refine the design
const refinedDesign = await aiIntegrationService.refineDesign(
  'Increase window sizes by 30%',
  design,
  enhancedContext
);
```

---

## HTTP Endpoints

### Development (localhost:3001)

#### POST `/api/openai/chat`

Proxy for OpenAI Chat Completions API.

**Request Body:**
```javascript
{
  model: string,                  // e.g., "gpt-4"
  messages: [
    { role: string, content: string }
  ],
  temperature: number,
  max_tokens: number
}
```

**Response:**
```javascript
{
  choices: [
    {
      message: {
        role: string,
        content: string
      }
    }
  ]
}
```

#### POST `/api/replicate/predictions`

Create a Replicate prediction for image generation.

**Request Body:**
```javascript
{
  version: string,                // Model version ID
  input: {
    prompt: string,
    width: number,
    height: number,
    num_outputs: number,
    guidance_scale: number,
    num_inference_steps: number
  }
}
```

**Response:**
```javascript
{
  id: string,                     // Prediction ID
  status: string,                 // "starting", "processing", "succeeded", "failed"
  urls: {
    get: string,                  // Status check URL
    cancel: string                // Cancellation URL
  }
}
```

#### GET `/api/replicate/predictions/:id`

Check status of a Replicate prediction.

**Response:**
```javascript
{
  id: string,
  status: string,
  output: string[] | null,        // Array of image URLs when succeeded
  error: string | null
}
```

### Production (Vercel Serverless Functions)

Same endpoints available at:
- `/api/openai-chat`
- `/api/replicate-predictions`
- `/api/replicate-status/:id`

---

## Data Structures

### EnhancedContext

Complete project context passed to AI generation.

```javascript
{
  buildingProgram: {
    buildingType: string,
    totalGrossArea: number,
    spaces: array,
    perLevelAllocation: array,
    massing: object,
    accessibility: object
  },
  portfolioAnalysis: {
    dominantStyle: string,
    confidence: number,
    characteristics: array,
    materialPreferences: array,
    blendedStyle: object
  },
  siteAnalysis: {
    address: string,
    coordinates: { lat: number, lng: number },
    climate: {
      type: string,
      seasonal: object
    },
    zoning: {
      type: string,
      maxHeight: string,
      density: string,
      setbacks: string
    },
    recommendedStyle: string,
    localStyles: array
  },
  solarOrientation: {
    hemisphere: string,
    optimalOrientation: string,
    sunPath: object,
    recommendations: object,
    windowRecommendations: object
  },
  userPreferences: {
    styleChoice: string,          // "blend" or "signature"
    area: number,
    program: string
  }
}
```

### DesignReasoning

AI-generated design rationale.

```javascript
{
  designPhilosophy: string,       // Overall design approach
  spatialOrganization: string,    // Layout and circulation strategy
  materialRecommendations: string, // Material selection reasoning
  environmentalConsiderations: string, // Climate and sustainability
  structuralApproach: string,     // Structural system reasoning
  mepStrategy: string,            // MEP systems approach
  accessibilityFeatures: string,  // Universal design considerations
  contextualIntegration: string   // Local context response
}
```

### Modification

Parsed design modification request.

```javascript
{
  success: boolean,
  type: string,                   // "spatial", "aesthetic", "structural", "mep", "material", "program"
  scope: string[],                // ["floor_plans", "elevations", etc.]
  changes: {
    description: string,
    affectedSpaces: string[],
    affectedLevels: string[],
    parameters: {
      // Type-specific parameters
      areaChange: number,         // For spatial modifications
      percentageChange: number,   // For proportional changes
      newFeature: string,         // For additions
      newMaterial: string,        // For aesthetic modifications
      hvacSystem: string,         // For MEP modifications
      addColumn: boolean,         // For structural modifications
      location: string            // For spatial positioning
    }
  }
}
```

---

## Error Handling

All services implement consistent error handling:

### Service Errors

```javascript
{
  success: false,
  error: string,                  // Error message
  code: string,                   // Error code
  details: object,                // Additional error details
  isFallback: boolean            // True if fallback data provided
}
```

### Common Error Codes

- `INVALID_PARAMETERS` - Missing or invalid input parameters
- `API_ERROR` - External API failure (OpenAI, Replicate)
- `VALIDATION_ERROR` - Input validation failure
- `GENERATION_FAILED` - AI generation unsuccessful
- `CONTEXT_MISSING` - Required context data missing
- `MODIFICATION_INVALID` - Modification fails validation

### Error Handling Example

```javascript
try {
  const design = await aiIntegrationService.generateCompleteDesign(context);

  if (!design.success) {
    console.error('Design generation failed:', design.error);
    // Use fallback or retry logic
  }
} catch (error) {
  console.error('Unexpected error:', error);
  // Handle catastrophic failures
}
```

---

## Usage Examples

### Complete Design Workflow

```javascript
// 1. Calculate building program
const buildingProgram = buildingProgramCalculator.calculateBuildingProgram(
  'residential',
  250,
  { zoning: { density: 'medium' }, climate: { type: 'temperate' } }
);

// 2. Analyze solar orientation
const solarOrientation = solarOrientationAnalyzer.analyzeSolarOrientation({
  coordinates: { lat: 51.5074, lng: -0.1278 },
  climate: { type: 'temperate' }
});

// 3. Analyze portfolio and blend styles
const portfolioStyle = await styleBlendingEngine.analyzePortfolioStyle(files);
const localStyles = styleBlendingEngine.detectLocalStyles(locationData);
const blendedStyle = styleBlendingEngine.blendStyles(
  portfolioStyle,
  localStyles,
  { zoning: locationData.zoning }
);

// 4. Create enhanced context
const enhancedContext = {
  buildingProgram,
  portfolioAnalysis: { ...portfolioStyle, blendedStyle },
  siteAnalysis: locationData,
  solarOrientation,
  userPreferences: { styleChoice: 'blend', area: 250, program: 'residential' }
};

// 5. Generate complete design
const design = await aiIntegrationService.generateCompleteDesign(enhancedContext);

// 6. Refine design based on user feedback
const refinedDesign = await aiIntegrationService.refineDesign(
  'Add a skylight to the living room',
  design,
  enhancedContext
);
```

### Batch Refinement

```javascript
const modifications = [
  'Increase window sizes by 20%',
  'Add a balcony to the bedroom',
  'Change exterior material to brick'
];

const finalDesign = await aiIntegrationService.batchRefineDesign(
  modifications,
  initialDesign,
  enhancedContext
);
```

### Validation Before Modification

```javascript
const modifications = [
  'Add a skylight',
  'Remove the center column',
  'Add three more floors'
];

for (const mod of modifications) {
  const validation = interactiveRefinementService.validateModification(
    mod,
    currentDesign
  );

  if (!validation.valid) {
    console.warn(`Invalid modification: ${mod}`);
    console.warn(`Warning: ${validation.warning}`);
    console.warn(`Severity: ${validation.severity}`);
  } else {
    await aiIntegrationService.refineDesign(mod, currentDesign, context);
  }
}
```

---

## Version Information

- API Version: 1.0
- Last Updated: 2025-10-06
- Compatible with: ArchitectAI Platform v0.1.0

For questions or issues, please refer to the main documentation or create an issue in the GitHub repository.
