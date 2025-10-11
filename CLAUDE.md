# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm install` - Install dependencies (required after cloning)
- `npm start` - Start React development server on http://localhost:3000
- `npm run server` - Start Express API proxy server on http://localhost:3001
- `npm run dev` - Run both React and Express servers concurrently
- `npm run build` - Create production build in /build folder
- `npm test` - Run test suite in interactive mode

### Deployment
The repository auto-deploys to Vercel via GitHub integration. Push to main branch triggers automatic deployment to www.archiaisolution.pro.

## Application Architecture

This is an AI-powered architectural design platform built as a single-page React application. The system combines location intelligence, AI reasoning (OpenAI GPT-4), and AI image generation (Replicate SDXL) to produce complete architectural designs with technical documentation.

### Core Application Structure

**Main Application**: `src/ArchitectAIEnhanced.js` (2000+ lines)
- Multi-step wizard interface orchestrating the complete design workflow
- Handles state management for location, portfolio, specifications, and generated designs
- Integrates all services: location intelligence, Google Maps, OpenAI, and Replicate

**Entry Point**: `src/App.js`
- Simple wrapper that renders ArchitectAIEnhanced component

### User Workflow (6 Steps)

1. **Landing Page** - Feature showcase with metrics and call-to-action
2. **Location Analysis** - Address input with automatic geolocation detection
3. **Intelligence Report** - Climate data, zoning analysis, architectural recommendations, and 3D map view
4. **Portfolio Upload** - User uploads architectural portfolio for style learning
5. **Project Specifications** - Building program and area requirements
6. **AI Generation & Results** - Complete design with floor plans, 3D visualizations, technical specs, and export options

### Service Layer Architecture

**Location Intelligence** (`src/services/`):
- `locationIntelligence.js` - Primary service with intelligent zoning detection and architectural style recommendations
- `enhancedLocationIntelligence.js` - Enhanced service for authoritative planning data from official APIs
- `globalArchitecturalDatabase.js` - Comprehensive style database organized by Continent → Country → Region → City

**AI Integration** (`src/services/`):
- `aiIntegrationService.js` - Orchestrates complete AI workflow combining OpenAI reasoning and Replicate visualization
- `openaiService.js` - GPT-4 integration for design reasoning, philosophy, spatial analysis, and feasibility
- `replicateService.js` - SDXL integration for photorealistic architectural image generation

### API Proxying Architecture

**Development Environment**:
- `server.js` - Express server proxies API calls to OpenAI and Replicate (runs on port 3001)
- Avoids CORS issues and keeps API keys secure
- Endpoints: `/api/openai/chat`, `/api/replicate/predictions`, `/api/replicate/predictions/:id`

**Production Environment (Vercel)**:
- `api/openai-chat.js` - Serverless function for OpenAI API proxy
- `api/replicate-predictions.js` - Serverless function for Replicate prediction creation
- `api/replicate-status.js` - Serverless function for Replicate prediction status checking
- Automatically deployed when pushed to GitHub

### Environment Variables

**Required in `.env` (development) and Vercel (production)**:
- `REACT_APP_GOOGLE_MAPS_API_KEY` - For geocoding, reverse geocoding, and 3D map display
- `REACT_APP_OPENWEATHER_API_KEY` - For seasonal climate data analysis
- `REACT_APP_OPENAI_API_KEY` - For GPT-4 design reasoning and analysis
- `REACT_APP_REPLICATE_API_KEY` - For SDXL architectural image generation

**Important**: In Vercel dashboard, set variables for all environments (Production, Preview, Development)

### Key Integration Points

**Google Maps Integration**:
- `MapView` component in ArchitectAIEnhanced.js renders interactive 3D maps
- Hybrid satellite/map view with 45-degree tilt for architectural context
- Custom markers and coordinate display
- Wrapped with `@googlemaps/react-wrapper` (currently commented out in production due to API key issues)

**Location Intelligence Flow**:
1. Browser geolocation API or manual address input
2. Google Geocoding API converts address to coordinates
3. OpenWeather API fetches seasonal climate data (4 seasons)
4. `locationIntelligence.js` analyzes zoning based on address components
5. Architectural style recommendations from `globalArchitecturalDatabase.js`
6. Returns complete location profile with climate, zoning, styles, and market context

**AI Generation Flow**:
1. User clicks "Generate AI Designs" in step 4
2. `aiIntegrationService.generateCompleteDesign()` orchestrates:
   - OpenAI: Generate design reasoning (philosophy, spatial organization, materials, environmental considerations)
   - Replicate: Generate multiple architectural visualizations (exterior, interior, site plan)
   - OpenAI: Generate design alternatives (sustainable, cost-effective, innovative, traditional)
   - OpenAI: Analyze feasibility (cost, timeline, constraints)
3. Results displayed with images, reasoning, technical specs, and export options

### Data Flow & State Management

**Location Data Structure**:
```javascript
{
  address: "Full formatted address",
  coordinates: { lat: number, lng: number },
  climate: { type: string, seasonal: { winter, spring, summer, fall } },
  sunPath: { summer: string, winter: string, optimalOrientation: string },
  zoning: { type: string, maxHeight: string, density: string, setbacks: string },
  recommendedStyle: string,
  localStyles: array,
  sustainabilityScore: number,
  marketContext: { avgConstructionCost, demandIndex, roi }
}
```

**AI Generation Result Structure**:
```javascript
{
  reasoning: { designPhilosophy, spatialOrganization, materialRecommendations, ... },
  visualizations: { views, styleVariations, reasoningBased },
  alternatives: { sustainable, cost_effective, innovative, traditional },
  feasibility: { cost, timeline, constraints, recommendations },
  timestamp: string,
  workflow: 'complete' | 'quick'
}
```

### File Generation & Export System

Located in ArchitectAIEnhanced.js, functions generate downloadable files:
- `generateDWGContent()` - AutoCAD 2D drawings with project specifications
- `generateRVTContent()` - Revit 3D BIM model data
- `generateIFCContent()` - Industry standard BIM exchange format (ISO-10303-21)
- `generatePDFContent()` - Complete HTML-based project documentation
- `downloadFile()` - Utility to trigger browser download with blob creation

### Error Handling & Fallbacks

**React Error Boundaries**: ErrorBoundary class in ArchitectAIEnhanced.js catches component errors

**API Fallbacks**:
- OpenAI failure: Returns mock reasoning with design philosophy and recommendations
- Replicate failure: Returns placeholder images (via placeholder.com URLs)
- Google Maps: Fallback to default San Francisco coordinates if geocoding fails
- OpenWeather: Mock climate data if API call fails

**Service Graceful Degradation**:
- All AI services have `getFallback*()` methods returning reasonable defaults
- `isFallback: true` flag indicates when fallback data is used
- User experience continues even if external APIs are down

### Testing & Debugging

**Critical Areas to Test**:
- Geolocation permission scenarios (granted, denied, unavailable)
- API key presence and validity (check console logs)
- International address formats and coordinate systems
- 3D map rendering performance on various devices
- AI generation with different building programs and locations
- File download functionality across browsers

**Known Performance Considerations**:
- Google Maps API can cause re-render loops if dependencies not properly managed
- MapView component uses careful `useEffect` dependency arrays to prevent infinite re-renders
- AI generation typically takes 30-60 seconds (OpenAI: 5-10s, Replicate: 20-50s)
- Multiple Replicate requests run sequentially to avoid rate limiting

### Code Style & Patterns

**State Management**: React hooks (`useState`, `useEffect`, `useCallback`, `useRef`)
- Location to references that shouldn't trigger re-renders
- Callbacks memoized with `useCallback` to prevent unnecessary child re-renders

**Component Structure**:
- Single-file component (ArchitectAIEnhanced.js) with multiple render functions
- `renderStep()` function switches on `currentStep` state variable
- Each step is a separate render function (e.g., `renderLandingPage()`)

**Styling**: Tailwind-like utility classes embedded in JSX
- Gradient backgrounds, rounded corners, shadow effects
- Responsive grid layouts with `md:` and `lg:` breakpoints
- Animation classes for fade-ins and transitions

### API Cost Considerations

**Per Complete Design Generation**:
- OpenAI GPT-4: ~$0.10-$0.20 (reasoning + alternatives + feasibility)
- Replicate SDXL: ~$0.15-$0.45 (3-5 images @ 30-60s each)
- Total: ~$0.50-$1.00 per design

**Optimization Strategies**:
- `quickDesign()` method generates single view for faster/cheaper MVP testing
- Fallback data prevents wasted API calls when errors occur
- Sequential Replicate calls avoid concurrent rate limit issues

### Development vs Production Behavior

**Development** (`npm run dev`):
- React app on localhost:3000
- Express proxy on localhost:3001
- API calls routed through Express
- Hot reload for rapid development

**Production** (Vercel):
- React static site served from Vercel CDN
- API calls routed through Vercel Serverless Functions
- Environment variables configured in Vercel dashboard
- Automatic HTTPS and global edge distribution

### Common Development Tasks

**Adding a New AI Service**:
1. Create service file in `src/services/`
2. Import in `aiIntegrationService.js`
3. Add method to orchestration workflow
4. Update fallback handlers

**Extending Location Intelligence**:
1. Add regional data to `globalArchitecturalDatabase.js`
2. Update detection logic in `locationIntelligence.js`
3. Test with addresses in new regions

**Adding New Export Formats**:
1. Create `generate[FORMAT]Content()` function in ArchitectAIEnhanced.js
2. Add export button in step 5 render function
3. Call `downloadFile()` with appropriate MIME type

### Design Consistency & Unified Context System

**CRITICAL REQUIREMENT**: All AI-generated outputs (2D floor plans, elevations, sections, 3D views, MEP plans, structural plans) MUST maintain visual and conceptual consistency as if they're views of the SAME building designed by the SAME architect.

#### Master Design Specification ("Design DNA")

Located in `aiIntegrationService.js:325-413`, the `createMasterDesignSpecification()` function creates a unified architectural framework that governs ALL subsequent generation:

**Specification Components**:
```javascript
{
  dimensions: { length, width, height, floors, floorHeight },
  entrance: { facade, position, width },
  materials: { primary, secondary, accent },
  roof: { type, material },
  windows: { pattern, frameColor },
  structure: { system, gridSpacing },
  colors: { facade, roof, trim }
}
```

**Consistency Enforcement Flow**:

1. **Context Building** (`aiIntegrationService.js:1025-1092`):
   - Location analysis → Portfolio style detection → Blended style creation
   - OpenAI generates reasoning FIRST (before any images)
   - Master Design Spec created from reasoning + blended style
   - `createReasoningEnhancedContext()` embeds reasoning into ALL image generation calls

2. **Unified Seed Management** (`aiIntegrationService.js:942-945`, `1077-1079`):
   - Single `projectSeed` generated once in frontend, passed to ALL Replicate calls
   - Ensures geometric consistency across 2D plans, elevations, and 3D views
   - Seed must propagate through: floor plans → elevations → sections → 3D views → MEP → structural

3. **Floor Count Synchronization** (`aiIntegrationService.js:418-430`):
   - `calculateFloorCount()` determines floors based on area and building type
   - MUST be consistent across: floor plans, elevations, sections, 3D views, BIM model
   - Validation: All outputs must show SAME number of floors

4. **Material Continuity** (`aiIntegrationService.js:449-470`, `586-587`):
   - Blended style materials take PRIORITY over reasoning-extracted materials
   - Materials embedded in `reasoningEnhancedContext.materials`
   - Same materials appear in: exterior views, floor plans (via textures), elevations, sections

5. **Style Consistency** (`aiIntegrationService.js:1479-1494`):
   - `createBlendedStylePrompt()` creates unified style description
   - Blended style applied to ALL generation calls via `reasoningEnhancedContext`
   - Style name, characteristics, and climate adaptations preserved across outputs

6. **Prompt Injection Strategy** (`aiIntegrationService.js:688-712`):
   - `createUnifiedArchitecturalPrompt()` creates base prompt injected into ALL Replicate calls
   - Prompt includes: philosophy, materials, spatial organization, environmental features
   - "CONSISTENCY:" directive ensures all views show SAME building

#### Validation Requirements

**When modifying AI generation code, ALWAYS verify**:

1. **Shared Context Propagation**:
   - Does `reasoningEnhancedContext` flow to ALL image generation functions?
   - Are Master Design Spec parameters accessible in prompts?
   - Is `projectSeed` passed to every Replicate call?

2. **Floor Count Accuracy**:
   - Do floor plans show correct number of levels?
   - Do elevations show correct building height (floors × floorHeight)?
   - Do 3D views match floor count from plans?
   - Does BIM model use same floor count?

3. **Material Synchronization**:
   - Are materials from `blendedStyle.materials` used consistently?
   - Do exterior 3D views use same materials as elevations?
   - Do interior views reference same material palette?

4. **Geometric Coherence**:
   - Do building dimensions match across 2D and 3D outputs?
   - Does entrance facade match between plans and 3D views?
   - Do window patterns align between elevations and 3D renders?

5. **Style Fidelity**:
   - Does architectural style remain consistent across all views?
   - Are roof types consistent between plans, elevations, and 3D views?
   - Do structural grids align across floor plans and structural drawings?

#### Common Consistency Pitfalls

**AVOID**:
- ❌ Generating images without `reasoningEnhancedContext`
- ❌ Using different seeds for different view types
- ❌ Overriding blended materials with reasoning materials
- ❌ Allowing floor count mismatches between 2D and 3D
- ❌ Generating 3D views before OpenAI reasoning completes
- ❌ Skipping Master Design Spec creation in quick workflows

**ENSURE**:
- ✅ OpenAI reasoning generated FIRST, before any images
- ✅ Master Design Spec created from reasoning + blended style
- ✅ Same `projectSeed` used for ALL outputs
- ✅ `reasoningEnhancedContext` passed to ALL Replicate calls
- ✅ Floor count validated across all output types
- ✅ Materials from `blendedStyle` prioritized over reasoning extraction

#### Debugging Consistency Issues

**Floor Count Mismatch**:
- Check `calculateFloorCount()` logic in `aiIntegrationService.js:418-430`
- Verify `floorCount` propagates to `masterDesignSpec.dimensions.floors`
- Validate Replicate prompts include correct floor count

**Material Inconsistency**:
- Inspect `blendedStyle.materials` in `enhancedContext`
- Verify `createReasoningEnhancedContext()` uses blended materials (line 587)
- Check Replicate prompts for material references

**Seed Not Propagating**:
- Trace `projectSeed` from frontend through all service calls
- Verify `enhancedContext.seed` set in `generateIntegratedDesign()` (line 1078)
- Check Replicate service receives and uses seed parameter

**Style Drift**:
- Validate `blendedStyle.styleName` matches across all outputs
- Check `unifiedArchitecturalPrompt` injection in all Replicate calls
- Verify portfolio style blending weights (material vs characteristic)

### AI Orchestration Workflow for Complete Architectural Deliverables

**PURPOSE**: This section governs how Claude Code (or any AI assistant) should orchestrate the complete architectural design generation workflow, ensuring all deliverables are coordinated, consistent, and production-ready.

#### Phase 1: Site & Context Analysis

**Inputs Required**:
- Project address or coordinates
- Building program (residential, commercial, mixed-use, etc.)
- Total floor area (m² or ft²)
- Optional: Portfolio images for style learning

**Orchestration Steps**:

1. **Location Intelligence** (`locationIntelligence.js`):
   - Geocode address to coordinates (Google Geocoding API)
   - Fetch seasonal climate data (OpenWeather API)
   - Analyze zoning regulations based on address components
   - Recommend local architectural styles from `globalArchitecturalDatabase.js`
   - Calculate sustainability score and market context

2. **Portfolio Style Detection** (if portfolio provided):
   - Analyze uploaded images using `portfolioStyleDetection.js`
   - Extract primary style, materials, design elements, key features
   - Assess compatibility with location context
   - Generate style recommendations

3. **Blended Style Creation** (`aiIntegrationService.js:1479-1494`):
   - Merge local context (from location intelligence) with portfolio style
   - Apply material weight (0-1): local materials ← → portfolio materials
   - Apply characteristic weight (0-1): local features ← → portfolio features
   - Generate unified style description for ALL subsequent generation

**Validation Checkpoints**:
- ✅ Location data includes climate, zoning, recommended styles
- ✅ Portfolio analysis (if applicable) extracted valid style information
- ✅ Blended style includes materials array (min 3), characteristics array (min 3)
- ✅ Blended style description is comprehensive and actionable

#### Phase 2: Floor Count Reasoning & Master Specification

**CRITICAL**: Floor count must be determined ONCE and used consistently across ALL outputs.

**Floor Count Calculation** (`aiIntegrationService.js:418-430`):

```javascript
calculateFloorCount(projectContext) {
  const area = projectContext.floorArea || projectContext.area || 200;
  const buildingType = projectContext.buildingProgram || 'house';

  // Building type rules
  if (buildingType.includes('cottage') || buildingType.includes('bungalow')) return 1;

  // Area-based calculation
  if (area < 150) return 1;
  if (area < 300) return 2;
  if (area < 500) return 3;
  return Math.min(Math.ceil(area / 200), 5); // Max 5 floors
}
```

**Master Design Specification Creation** (`aiIntegrationService.js:325-413`):

1. **Generate OpenAI Reasoning FIRST**:
   - Call `openaiService.generateDesignReasoning(enhancedContext)`
   - Extract design philosophy, spatial organization, materials, environmental considerations
   - This reasoning becomes the "brain" guiding ALL image generation

2. **Create Master Design Spec**:
   - Calculate dimensions: length, width, height based on floor area and floor count
   - Determine entrance facade (from reasoning or default to north)
   - Extract materials from blended style (PRIORITY) or reasoning (fallback)
   - Define roof type (flat/gable/hip) from reasoning and building program
   - Set window pattern (ribbon/punched) from architectural style
   - Determine structural system based on floor count
   - Define color scheme from materials

3. **Create Reasoning-Enhanced Context**:
   - Embed OpenAI reasoning into project context
   - Add Master Design Spec parameters
   - Create unified architectural prompt for injection into ALL Replicate calls
   - Set `isReasoningEnhanced: true` flag

**Validation Checkpoints**:
- ✅ Floor count calculated and stored in `masterDesignSpec.dimensions.floors`
- ✅ OpenAI reasoning generated before any image generation starts
- ✅ Master Design Spec created with all 7 components (dimensions, entrance, materials, roof, windows, structure, colors)
- ✅ `reasoningEnhancedContext` created with unified architectural prompt
- ✅ Project seed generated and stored for ALL Replicate calls

#### Phase 3: Coordinated Deliverable Generation

**Generation Order** (MUST follow this sequence):

1. **Multi-Level Floor Plans** (`replicateService.generateMultiLevelFloorPlans`):
   - Generate plans for ALL floors (based on calculated floor count)
   - Use reasoning-enhanced context + project seed
   - Capture ground floor plan image URL for potential ControlNet use
   - Output: `{ floorPlans: { ground, floor1, floor2, ... }, floorCount }`

2. **Technical Drawings** (`replicateService.generateElevationsAndSections`):
   - Generate 4 elevations (North, South, East, West)
   - Generate 2 sections (Longitudinal, Transverse)
   - Use reasoning-enhanced context + same project seed
   - **NO ControlNet** - elevations must be independent 2D orthographic projections
   - Output: `{ elevations: { north, south, east, west }, sections: { longitudinal, transverse } }`

3. **3D Photorealistic Views** (`replicateService.generateMultipleViews`):
   - Generate exterior_front, exterior_side, interior, axonometric, perspective
   - Use reasoning-enhanced context + same project seed
   - **NO ControlNet** - 3D views need photorealistic freedom, not 2D floor plan constraints
   - Output: `{ exterior_front, exterior_side, interior, axonometric, perspective }`

4. **BIM Model & Axonometric** (`bimService.generateParametricModel`):
   - Extract floor plan geometry from AI-generated plans
   - Generate parametric BIM model using reasoning-enhanced context
   - Derive geometrically accurate axonometric view from BIM
   - Fallback to Replicate if BIM generation fails
   - Output: `{ bimModel, axonometric, axonometricSource: 'bim' | 'replicate_fallback' }`

5. **Construction Documentation** (OPTIONAL - `aiIntegrationService.generateConstructionDocumentation`):
   - Detail drawings at specified scale (default 1:20)
   - Structural plans (foundation + all floors)
   - MEP plans (HVAC, electrical, plumbing, combined)
   - Structural engineering notes (OpenAI)
   - MEP engineering notes (OpenAI)
   - Output: `{ detailDrawings, structuralPlans, mepPlans, structuralNotes, mepNotes }`

**Validation Checkpoints After Each Generation**:
- ✅ All outputs use same `projectSeed`
- ✅ All outputs use `reasoningEnhancedContext`
- ✅ Floor count matches across: floor plans, elevations, 3D views, BIM
- ✅ Materials consistent across all visual outputs
- ✅ Architectural style recognizable across all views
- ✅ Success flags checked (fallback to placeholders if API fails)

#### Phase 4: Quality Assurance & Consistency Validation

**Cross-Output Validation**:

1. **Floor Count Consistency**:
   ```javascript
   const floorCounts = {
     floorPlans: results.floorPlans?.floorCount,
     masterSpec: enhancedContext.masterDesignSpec?.dimensions?.floors,
     bim: results.bimModel?.floors
   };
   // All values should match
   ```

2. **Material Consistency**:
   ```javascript
   const materials = {
     blended: enhancedContext.blendedStyle?.materials,
     reasoning: enhancedContext.reasoningParams?.materials,
     masterSpec: enhancedContext.masterDesignSpec?.materials
   };
   // Blended materials should take priority
   ```

3. **Seed Propagation**:
   ```javascript
   const seeds = {
     project: enhancedContext.projectSeed,
     floorPlans: floorPlansGenerationSeed,
     elevations: elevationsGenerationSeed,
     views3D: views3DGenerationSeed
   };
   // All should match projectSeed
   ```

4. **Visual Coherence Check**:
   - Do exterior 3D views show same facade as elevations?
   - Do floor plans show same number of levels as 3D views?
   - Do materials in 3D renders match materials in technical drawings?
   - Does roof type match between plans, elevations, and 3D views?

**Automated Validation Function** (to be implemented):
```javascript
function validateConsistency(results, enhancedContext) {
  const issues = [];

  // Check floor count
  if (results.floorPlans?.floorCount !== enhancedContext.masterDesignSpec?.dimensions?.floors) {
    issues.push('Floor count mismatch between plans and master spec');
  }

  // Check seed propagation
  if (!allSeedsMatch(results, enhancedContext.projectSeed)) {
    issues.push('Seed not propagated to all generation calls');
  }

  // Check materials
  if (!materialsConsistent(results, enhancedContext.blendedStyle?.materials)) {
    issues.push('Material inconsistency detected across outputs');
  }

  return { valid: issues.length === 0, issues };
}
```

#### Phase 5: Result Packaging & Delivery

**Output Structure**:

```javascript
{
  success: true,

  // Phase 1: Context
  locationAnalysis: { primary, materials, climateAdaptations, ... },
  portfolioStyle: { primaryStyle, materials, designElements, ... },
  blendedStyle: { styleName, materials, characteristics, blendRatio, description },

  // Phase 2: Reasoning & Spec
  reasoning: { designPhilosophy, spatialOrganization, materialRecommendations, ... },
  masterDesignSpec: { dimensions, entrance, materials, roof, windows, structure, colors },

  // Phase 3: Deliverables
  floorPlans: { floorPlans: { ground, floor1, ... }, floorCount, success },
  technicalDrawings: { elevations: { n, s, e, w }, sections: { long, trans }, success },
  visualizations: { views: { exterior_front, exterior_side, interior, axon, persp }, axonometricSource },
  bimModel: { model, metadata, success },
  constructionDocumentation: { detailDrawings, structuralPlans, mepPlans, notes, success },

  // Phase 4: Validation
  consistencyValidation: { valid: true, issues: [] },

  // Metadata
  projectSeed: 123456,
  materialWeight: 0.5,
  characteristicWeight: 0.5,
  timestamp: '2025-10-11T...',
  workflow: 'integrated_design_generation'
}
```

**User-Facing Deliverables**:

1. **Design Documentation PDF**:
   - Executive summary with location analysis
   - Design philosophy and reasoning
   - All floor plans (labeled by level)
   - All elevations and sections (labeled by orientation)
   - 3D photorealistic views
   - Material specifications
   - Technical notes (structural + MEP)

2. **CAD Files**:
   - DWG (AutoCAD 2D drawings)
   - DXF (universal 2D exchange format)
   - Generated via `generateDWGContent()` in ArchitectAIEnhanced.js

3. **BIM Files**:
   - RVT (Revit parametric model)
   - IFC (ISO-10303-21 standard)
   - Generated via `generateRVTContent()` and `generateIFCContent()`

4. **Image Exports**:
   - High-resolution PNGs of all views
   - Organized in folders: FloorPlans/, Elevations/, Sections/, 3DViews/

**Final Validation Checklist**:
- ✅ All deliverables generated successfully (or fallbacks provided)
- ✅ Consistency validation passed
- ✅ Floor count accurate across all outputs
- ✅ Materials synchronized across visual outputs
- ✅ Architectural style recognizable and consistent
- ✅ Project seed recorded for reproducibility
- ✅ User-facing files ready for download
- ✅ Metadata complete and accurate

#### Error Handling & Graceful Degradation

**If OpenAI Fails**:
- Use fallback reasoning with generic design philosophy
- Master Design Spec still created using location analysis
- Flag outputs with `isFallback: true`
- Continue with image generation using fallback context

**If Replicate Fails** (specific generation):
- Return placeholder image URLs (via placehold.co)
- Mark specific output as `success: false, isFallback: true`
- Continue with remaining generations
- User sees partial deliverables with fallback placeholders

**If BIM Generation Fails**:
- Fall back to Replicate for axonometric generation
- Use floor plan ControlNet for geometric consistency
- Mark axonometric source as 'replicate_fallback'
- Warn user that axonometric may not be geometrically perfect

**If Construction Documentation Fails**:
- Mark as optional deliverable
- Provide base design without construction details
- User can still download floor plans, elevations, 3D views
- Log error for debugging but don't block main workflow

**Critical Failures** (abort workflow):
- No location data available
- No floor area provided
- OpenAI AND Replicate both unavailable
- Network connectivity issues

### Important Files to Understand

**Core Application**:
- `src/ArchitectAIEnhanced.js` - Main application logic
- `src/services/aiIntegrationService.js` - AI workflow orchestration

**Data & Intelligence**:
- `src/data/globalArchitecturalDatabase.js` - Architectural style database
- `src/services/locationIntelligence.js` - Location analysis logic

**API Infrastructure**:
- `server.js` - Development proxy server
- `api/` - Production serverless functions

**Documentation**:
- `API_SETUP.md` - Complete AI integration guide
- `DEPLOYMENT_STATUS.md` - Current deployment state and checklist
- `VERCEL_DEPLOYMENT.md` - Production deployment instructions
- `MVP_README.md` - Quick start guide
