# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm install` - Install dependencies (required after cloning)
- `npm start` - Start React development server on http://localhost:3000
- `npm run server` - Start Express API proxy server on http://localhost:3001 (REQUIRED for API proxying)
- `npm run dev` - Run both React and Express servers concurrently (recommended)
- `npm run build` - Create production build in /build folder
- `npm test` - Run test suite in interactive mode
- `npm run test:coverage` - Run tests with coverage report

### Validation & Quality
- `npm run check:env` - Verify all required environment variables are present
- `npm run check:contracts` - Validate service contracts and API integrations
- `npm run check:all` - Run both environment and contract checks (runs automatically before build)
- `npm run prebuild` - Pre-build validation (automatically runs check:all)

### Testing Scripts
- `node test-a1-modify-consistency.js` - Test A1 modification workflow with consistency lock (11 tests)
- `node test-clinic-a1-generation.js` - Test clinic A1 prompt generation with all required sections
- `node test-modify-seed-consistency.js` - Test seed reuse and consistency lock in modify workflow
- `node test-storage-fix.js` - Test storage manager array handling and migration (9 tests)
- `node test-geometry-first-local.js` - Run Geometry-First verification suite (49 tests)
- `node test-together-api-connection.js` - Test Together.ai connectivity
- `node test-dna-pipeline.js` - Test DNA generation pipeline
- `node test-geometry-pipeline.js` - Test geometry pipeline

### Deployment
The repository auto-deploys to Vercel via GitHub integration. Push to main branch triggers automatic deployment to www.archiaisolution.pro.

## Architecture Mode

This platform uses an **A1-ONLY generation architecture** with AI Modify capabilities:

### A1 Sheet One-Shot Workflow (DEFAULT AND ONLY MODE)
**Status**: Production default and only mode (`a1Only: true`)
**Output**: Single UK RIBA-standard A1 comprehensive architectural sheet
**Consistency**: 98%+ across all embedded views
**Generation Time**: ~60 seconds for complete A1 sheet

**Flow**:
1. Together.ai Qwen generates Master Design DNA with exact specifications
2. DNA validator ensures realistic dimensions and consistency
3. A1 sheet prompt generator creates comprehensive UK RIBA-standard prompt
4. Together.ai FLUX.1-dev generates single A1 sheet (1792×1269px, Together API compliant)
5. Sheet includes: plans, elevations, sections, 3D views, title block, specifications
6. Design saved to history with seed and DNA for modification workflow

**AI Modify Workflow** (Maintains Consistency):
1. User requests modifications (e.g., "add missing sections")
2. System applies consistency lock using original DNA and seed
3. Delta prompt combined with locked base prompt
4. Re-generate A1 sheet with SAME seed for visual consistency
5. pHash/SSIM validation ensures unmodified elements remain identical
6. Version saved to history with consistency score

**Optional Enhancement** (`geometryFirst: true`):
- Uses spatial layout algorithm for 99.5%+ dimensional accuracy
- 3D geometry generation before rendering
- **Final output is still A1 sheet** (not 13 separate views)

**Feature Flags**:
```javascript
import { setFeatureFlag } from './src/config/featureFlags';

setFeatureFlag('a1Only', true);         // DEFAULT: Always enabled
setFeatureFlag('geometryFirst', true);  // OPTIONAL: Enhanced precision
```

## Application Architecture

This is an AI-powered architectural design platform built as a single-page React application. The system uses a **Design DNA Consistency System** to generate coordinated architectural packages with 98%+ cross-view consistency, with an optional **Geometry-First Pipeline** for 99.5%+ dimensional accuracy.

**Primary AI Stack:**
- **Together.ai FLUX.1-dev** - Primary A1 sheet generation (single comprehensive sheet)
- **Together.ai Qwen 2.5 72B** - Architectural reasoning and Design DNA generation
- **Together.ai Only** - All image generation and reasoning via Together.ai (legacy providers removed)

**Key Innovations:**
1. **A1-Only Output**: Single comprehensive UK RIBA-standard sheet (no 13-view mode)
2. **Design DNA System**: Extracts precise specs (dimensions, materials, layouts) for consistency
3. **AI Modify with Consistency Lock**: Modifies designs while preserving original elements using same seed
4. **Version History**: Tracks all modifications with consistency scores and delta prompts

### Core Application Structure

**Main Application**: `src/ArchitectAIEnhanced.js` (2000+ lines)
- Multi-step wizard interface orchestrating the complete design workflow
- Handles state management for location, portfolio, specifications, and generated A1 sheet
- Integrates all services: location intelligence, Google Maps, A1 generation pipeline
- A1-only mode (13-view workflows removed)
- Includes AI Modify panel for post-generation modifications

**Entry Point**: `src/App.js`
- Simple wrapper that renders ArchitectAIEnhanced component

### User Workflow (7 Steps)

1. **Landing Page** - Feature showcase with metrics and call-to-action
2. **Location Analysis** - Address input with automatic geolocation, site boundary auto-detection or manual drawing
3. **Intelligence Report** - Climate data, zoning analysis, architectural recommendations, 3D map view
4. **Portfolio Upload** - User uploads architectural portfolio for style blending (70% portfolio / 30% local)
5. **Project Specifications** - Building type and area (auto-populated program spaces)
6. **AI Generation** - Single A1 sheet generated with all views embedded (UK RIBA standard)
7. **Results & AI Modify** - Display A1 sheet with AI Modify panel for adding missing elements or changes

### Service Layer Architecture (40+ Services)

**Design DNA Pipeline** (`src/services/`) - Core consistency system:
- `enhancedDNAGenerator.js` - Generates master Design DNA with exact specifications
- `dnaValidator.js` - Validates DNA for realistic dimensions, materials, and consistency
- `dnaPromptGenerator.js` - Converts DNA into 13 unique, view-specific prompts
- `dnaWorkflowOrchestrator.js` - Orchestrates complete DNA generation pipeline
- `projectDNAPipeline.js` - Project-level DNA management
- `consistencyChecker.js` - Post-generation consistency validation

**Geometry-First Pipeline** (`src/geometry/`, `src/core/`) - Optional precision system:
- `spatialLayoutAlgorithm.js` - Converts DNA to precise 3D spatial layouts
- `geometryBuilder.js` - Constructs Three.js 3D geometry from layouts
- `openingsGenerator.js` - Generates windows, doors, and openings
- `validators.ts` (TypeScript) - 50+ architectural validation rules
- `designSchema.ts` - Type-safe design schema definitions
- `previewRenderer.ts` - Renders 2D views from 3D geometry

**AI Integration** (`src/services/`):
- `togetherAIService.js` - **PRIMARY** - FLUX.1-dev A1 sheet generation via `generateA1SheetImage()` + Qwen reasoning
  - ⚠️ `generateConsistentArchitecturalPackage()` is **DEPRECATED** (13-view mode) - use `generateA1SheetImage()` instead
- `togetherAIReasoningService.js` - Specialized architectural reasoning with Qwen 2.5 72B
- `fluxAIIntegrationService.js` - FLUX-specific integration logic
- `aiIntegrationService.js` - Legacy multi-provider orchestration (deprecated - not used in A1-only mode)
- `enhancedAIIntegrationService.js` - Enhanced workflow with DNA integration (deprecated - not used in A1-only mode)
- `openaiService.js` - GPT-4 fallback for reasoning (optional)
  
**Note:** Legacy image services (openaiImageService, replicateService, maginaryService, openartService) have been removed. All image generation uses Together.ai FLUX.1-dev exclusively.

**Location Intelligence** (`src/services/`):
- `locationIntelligence.js` - Zoning detection and style recommendations
- `enhancedLocationIntelligence.js` - Authoritative planning data from official APIs
- `siteAnalysisService.js` - Site boundary detection and analysis
- `buildingFootprintService.js` - Extracts building footprints from site polygons
- `locationAwareDNAModifier.js` - Adapts DNA based on climate and local regulations
- `climateResponsiveDesignService.js` - Climate-specific design adaptations

**Portfolio & Style** (`src/services/`):
- `enhancedPortfolioService.js` - Extracts design patterns from user portfolios
- `portfolioStyleDetection.js` - Detects architectural styles from images
- `designHistoryService.js` - Tracks designs with versioning using localStorage (createDesign, addVersion, getDesign, listDesigns)

**AI Modification System** (`src/services/`, `src/components/`) - A1 sheet modifications with consistency preservation:
- `aiModificationService.js` - `modifyA1Sheet()` method with consistency lock, same seed, and delta prompt integration
- `sheetConsistencyGuard.js` - pHash/SSIM validation (≥92% threshold) and retry logic with stronger lock
- `a1SheetPromptGenerator.js` - Builds A1 prompts with `withConsistencyLock()` to freeze unchanged elements during modifications
- `AIModifyPanel.jsx` (React component) - UI with quick toggles (Add Sections, Add 3D Views, Add Details), custom prompts, and version history sidebar

**Technical Generation** (`src/services/`):
- `floorPlanGenerator.js` - Generates floor plan layouts
- `floorPlanReasoningService.js` - Spatial reasoning for floor plans
- `vectorPlanGenerator.js` - Vector-based floor plan generation
- `controlNetMultiViewService.js` - Multi-ControlNet for view consistency
- `enhancedViewConfigurationService.js` - Configures view-specific generation parameters
- `facadeFeatureAnalyzer.js` - Analyzes and ensures facade consistency
- `a1SheetPromptGenerator.js` - Generates prompts for professional A1 architectural sheets
- `unifiedSheetGenerator.js` - Creates unified architectural presentation sheets
- `architecturalSheetService.js` - Manages sheet layout and composition

### Feature Flags System

**Location**: `src/config/featureFlags.js`

Feature flags control experimental and progressive features. All flags persist in `sessionStorage` for the current session.

**Key Feature Flags**:

| Flag | Default | Purpose |
|------|---------|---------|
| `geometryFirst` | `false` | Enable Geometry-First pipeline (99.5% accuracy) vs DNA-only (98%) |
| `showGeometryPreview` | `false` | Display spatial layout preview before generation |
| `cacheGeometry` | `true` | Cache geometry calculations in sessionStorage |
| `parallelGeneration` | `true` | Generate 2D (local) and 3D (API) views in parallel |
| `enhancedConsistencyChecks` | `true` | Enable geometry-based consistency validation |
| `debugGeometry` | `false` | Log detailed geometry calculations to console |
| `showValidationErrors` | `false` | Display validation errors in UI |
| `aiStylization` | `false` | Apply AI photorealistic rendering to geometry views |

**Usage**:
```javascript
import { isFeatureEnabled, setFeatureFlag, getAllFeatureFlags } from './src/config/featureFlags';

// Check if enabled
if (isFeatureEnabled('geometryFirst')) {
  // Use Geometry-First pipeline
}

// Toggle flag
setFeatureFlag('geometryFirst', true);

// Get all flags
const flags = getAllFeatureFlags();

// Development helper
logFeatureFlags(); // Logs all flags to console
```

### API Proxying Architecture

**Development Environment**:
- `server.js` - Express server proxies API calls (runs on port 3001) - **REQUIRED**
- Avoids CORS issues and keeps API keys secure
- **Primary Endpoints**:
  - `/api/together/chat` - Together.ai Qwen reasoning
  - `/api/together/image` - Together.ai FLUX image generation
- **Geometry-First Endpoints** (when enabled):
  - `/api/render` - Render 3D geometry views (local Three.js)
  - `/api/plan` - Generate Project DNA
  - `/api/sheet` - Export A1 architecture sheet (SVG/PDF)
**Legacy Endpoints** (removed):
- `/api/openai/images` - Removed (Together.ai only)
- `/api/replicate/*` - Removed (Together.ai only)
- `/api/maginary/*` - Removed (Together.ai only)
- `/api/enhanced-image/generate` - Removed (Together.ai only)

**Production Environment (Vercel)**:
- `api/together-chat.js` - Together.ai chat proxy (reasoning)
- `api/together-image.js` - Together.ai image generation proxy
- `api/render.js` - 3D geometry rendering endpoint
- `api/plan.js` - DNA generation endpoint
- `api/sheet.js` - A1 sheet export endpoint
- `api/openai-chat.js` - OpenAI fallback proxy (optional)
- Automatically deployed when pushed to GitHub

**Note:** Legacy endpoints (replicate-predictions, replicate-status, maginary, openart) have been removed.

### Environment Variables

**Required in `.env` (development) and Vercel (production)**:
- `TOGETHER_API_KEY` - **PRIMARY** - For FLUX image generation and Qwen reasoning (Build Tier 2+ required)
- `REACT_APP_GOOGLE_MAPS_API_KEY` - For geocoding, reverse geocoding, and 3D map display
- `REACT_APP_OPENWEATHER_API_KEY` - For seasonal climate data analysis
- `OPENAI_REASONING_API_KEY` - Optional fallback for GPT-4 reasoning (Together.ai is primary)

**Important Notes**:
- Together.ai requires paid tier (Build Tier 2+) for FLUX models - add $5-10 credits at https://api.together.ai/settings/billing
- Legacy providers (DALL-E, Replicate, OpenArt, Maginary) have been removed - all image generation uses Together.ai
- In Vercel dashboard, set variables for all environments (Production, Preview, Development)
- Run `npm run check:env` to verify all required keys are present

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
6. Optional: User draws custom site boundary polygon via `SitePolygonDrawer` component
7. Returns complete location profile with climate, zoning, styles, and market context

**AI Generation Flow (A1-Only Mode - DEFAULT)**:
1. User clicks "Generate AI Designs" in step 6
2. **STEP 1**: `enhancedDNAGenerator.js` generates Master Design DNA via Together.ai Qwen 2.5 72B:
   - Exact dimensions (e.g., 15.25m × 10.15m × 7.40m)
   - Materials with hex color codes (e.g., Red brick #B8604E)
   - Room-by-room specifications with dimensions
   - View-specific features (entrance location, window counts per facade)
   - Consistency rules enforced across ALL sections of the A1 sheet
3. **STEP 2**: `dnaValidator.js` validates DNA (realistic dimensions, compatible materials, floor counts)
4. **STEP 3**: `a1SheetPromptGenerator.buildA1SheetPrompt()` creates comprehensive UK RIBA-standard prompt:
   - All views specified in one prompt: plans, elevations, sections, 3D, title block
   - Portfolio style blending (70% portfolio / 30% local materials and characteristics)
   - Climate and site-specific adaptations
   - Strong negative prompts to avoid placeholder/grid aesthetics
5. **STEP 4**: `togetherAIService.generateA1SheetImage()` generates single A1 sheet with FLUX.1-dev:
   - Resolution: 1792×1269px (Together API compliant, A1 aspect ratio)
   - Contains all views embedded in professional layout
   - UK RIBA title block with ARB number, planning ref, compliance notes
6. **STEP 5**: `a1SheetValidator.js` validates sheet quality and completeness
7. **STEP 6**: Design saved to history (`designHistoryService.createDesign()`) with seed and base prompt
8. Results displayed with A1 sheet viewer and AI Modify panel

**Generation Time**: ~60 seconds for complete A1 sheet

**AI Modify Flow** (Post-Generation Modifications):
1. User enters modification request or selects quick toggles (Add Sections, Add 3D View, Add Details)
2. `aiModificationService.modifyA1Sheet()` applies consistency lock:
   - Retrieves original DNA, seed, and base prompt from history
   - `a1SheetPromptGenerator.withConsistencyLock()` freezes unchanged elements
   - Delta prompt specifies only requested changes
3. Re-generates A1 sheet using SAME seed for consistency
4. `sheetConsistencyGuard.validateConsistency()` computes pHash and SSIM scores
5. If consistency < threshold, auto-retry with stronger lock
6. Version saved to history with consistency score
7. UI updates to show modified A1 sheet

**Modification Time**: ~60 seconds per modification (with consistency validation)

### A1 Sheet Generation (ONLY Output Mode)

**Location**: `src/services/a1SheetPromptGenerator.js`, `src/services/dnaWorkflowOrchestrator.js`

The A1 sheet is the ONLY output format (13-view mode completely removed). Each sheet includes:
- **Site Context**: Inset map showing site location and boundaries
- **Floor Plans**: Ground and upper floor layouts with dimensions
- **Elevations**: All four facades (north, south, east, west)
- **Sections**: Longitudinal and transverse sections
- **3D Views**: Exterior perspective and axonometric projection
- **Style Palette**: Material swatches with hex colors
- **Climate Card**: Environmental metrics and climate data
- **Title Block**: Project metadata, design ID, seed, and SHA256 hash

**Resolution**: 1792×1269 pixels (Together API compliant, A1 aspect ratio 1.414)
**Generation Steps**: 48 steps with guidance scale 7.8 for optimal quality
**Style Blending**: Combines local architectural styles (from location intelligence) with user portfolio styles

**Triggering A1 Sheet Generation**:
The A1 workflow is **always enabled** (A1-only mode). Users simply click "Generate AI Designs" and receive a single comprehensive A1 sheet.

**A1 Sheet Prompting Strategy**:
- Strong negative prompts to avoid "grid/placeholder" artifacts
- No graph paper grids, collage layouts, or ASCII boxes
- Photorealistic rendering for 3D views
- Clean technical drawing style for plans/elevations/sections
- Explicit layout instructions for each section of the sheet

### Design DNA Consistency System

**Problem Solved**: Early versions had only 70% consistency between views (different colors, window counts, dimensions varied). DNA system achieves **98%+ consistency**.

**How It Works**:
1. **Master DNA Generation**: AI extracts EXACT specifications:
   ```javascript
   {
     dimensions: { length: 15.25, width: 10.15, height: 7.40 },
     materials: [
       { name: "Red brick", hexColor: "#B8604E", application: "exterior walls" },
       { name: "Clay tiles", hexColor: "#8B4513", application: "gable roof 35°" }
     ],
     rooms: [
       { name: "Living Room", dimensions: "5.5m × 4.0m", floor: "ground", windows: 2 }
     ],
     viewSpecificFeatures: {
       north: { mainEntrance: "centered", windows: 4 },
       south: { patioDoors: "large sliding", windows: 3 }
     }
   }
   ```

2. **Validation**: Checks dimensions are realistic, materials compatible, floor heights consistent

3. **A1 Sheet Prompt**: Single comprehensive prompt includes ALL sections:
   - Floor plans: "Ground floor 2D overhead, Living 5.5×4.0m, Kitchen 4.0×3.5m..."
   - North elevation: "North facade MAIN ENTRANCE CENTERED, 4 ground windows, red brick #B8604E..."
   - South elevation: "South facade LARGE PATIO DOORS, 3 upper windows, DIFFERENT from north..."
   - Sections: "Section A-A longitudinal, Section B-B transverse, both with dimension lines..."
   - 3D views: "Exterior perspective, axonometric, interior perspective..."
   - All embedded in single A1 sheet layout

4. **Consistency Enforcement**: Same seed, same specs, explicit cross-section rules

**Key Files**:
- `enhancedDNAGenerator.js` (850 lines) - Generates Master DNA
- `dnaValidator.js` - Validates and auto-corrects DNA
- `dnaPromptGenerator.js` - Creates 13 unique prompts from DNA
- `consistencyChecker.js` - Post-generation validation

**Metrics Achieved**:
- Material consistency: 70% → 98%
- Dimensional accuracy: 75% → 99% (DNA-Enhanced) or 99.5% (Geometry-First)
- Color matching: 60% → 99%
- Window positioning: 65% → 98%
- Overall: 70% → 98%+

### Geometry-First Pipeline (Optional)

**Status**: Optional feature (`geometryFirst: false` by default)
**When to Enable**: Projects requiring exact dimensional accuracy, custom site constraints, or faster generation

**Architecture**:
```
User Input → DNA Generation → Spatial Layout → 3D Geometry → Multiple Views
   ↓              (Qwen)         (Algorithm)     (Three.js)     (Parallel)
Site Polygon  → Exact Dims   →  Validation   →  Rendering   →  A1 Sheet
```

**Key Components**:

1. **Spatial Layout Algorithm** (`src/geometry/spatialLayoutAlgorithm.js`):
   - Converts DNA specifications to precise 3D coordinates
   - Room placement, circulation paths, structural elements
   - Respects site boundaries (if provided)
   - Output: Room polygons with exact dimensions

2. **Geometry Builder** (`src/geometry/geometryBuilder.js`):
   - Constructs Three.js 3D geometry from spatial layout
   - Walls, floors, ceilings, roofs with proper materials
   - Window and door openings with correct placement
   - Output: Three.js Scene object

3. **Openings Generator** (`src/geometry/openingsGenerator.js`):
   - Places windows, doors, skylights based on DNA
   - Ensures proper spacing and structural integrity
   - Matches DNA specifications for each facade
   - Output: Opening geometries with coordinates

4. **Validators** (`src/core/validators.ts`):
   - 50+ architectural validation rules (TypeScript)
   - Checks minimum room sizes, circulation widths, ceiling heights
   - Validates structural feasibility, opening sizes
   - Returns validation errors/warnings

5. **Preview Renderer** (`src/core/previewRenderer.ts`):
   - Renders 2D views from 3D geometry
   - Orthographic projections for plans, elevations, sections
   - SVG or raster output options
   - Output: Technical drawing images

**Benefits**:
- **99.5% dimensional accuracy** (vs 99% with DNA-only)
- **Faster generation**: ~2 minutes (vs ~3 minutes with DNA-only)
- **Parallel processing**: 2D views render locally while 3D views generate via API
- **Vector output**: Technical drawings can be exported as SVG for CAD import
- **Site-aware**: Respects custom site boundary polygons

**Trade-offs**:
- More complex codebase (geometry algorithms + validation rules)
- Requires Three.js rendering (adds ~100KB to bundle)
- Less flexibility for non-standard architectural forms
- TypeScript compilation required for validators

**Testing**:
```bash
node test-geometry-first-local.js
```
Expected output: 49/49 tests passed (100% success rate)

### Data Flow & State Management

**Location Data Structure**:
```javascript
{
  address: "Full formatted address",
  coordinates: { lat: number, lng: number },
  sitePolygon: [{ lat, lng }, ...], // Optional custom boundary
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
  masterDNA: {
    dimensions: { length, width, height, floorHeights: [] },
    materials: [{ name, hexColor, application }],
    rooms: [{ name, dimensions, floor, features }],
    viewSpecificFeatures: { north, south, east, west },
    consistencyRules: []
  },
  visualizations: {
    floorPlans: [{ type: 'ground'|'upper', url, prompt }],
    technicalDrawings: [{ type: 'elevation'|'section', orientation, url, prompt }],
    threeD: [{ type: 'exterior'|'axonometric'|'site'|'interior', url, prompt }]
  },
  // Optional: Geometry-First specific fields
  geometry: {
    spatialLayout: { rooms: [...], circulation: [...] },
    threeJsScene: Scene, // Three.js Scene object
    openings: [{ type, location, dimensions }]
  },
  // Optional: A1 sheet output
  a1Sheet: {
    url: string, // SVG or image URL
    format: 'svg' | 'pdf',
    metadata: { designId, seed, sha256Hash }
  },
  reasoning: { designPhilosophy, spatialOrganization, materialRecommendations },
  alternatives: { sustainable, cost_effective, innovative, traditional },
  feasibility: { cost, timeline, constraints, recommendations },
  consistency: { score: 0.98, validated: true, issues: [] },
  timestamp: string,
  workflow: 'dna-enhanced' | 'geometry-first' | 'a1-sheet'
}
```

### File Generation & Export System

Located in ArchitectAIEnhanced.js, functions generate downloadable files:
- `generateDWGContent()` - AutoCAD 2D drawings with project specifications
- `generateRVTContent()` - Revit 3D BIM model data
- `generateIFCContent()` - Industry standard BIM exchange format (ISO-10303-21)
- `generatePDFContent()` - Complete HTML-based project documentation
- `downloadFile()` - Utility to trigger browser download with blob creation
- `exportA1Sheet()` - Export A1 architectural sheet as SVG or PDF

### Error Handling & Fallbacks

**React Error Boundaries**: ErrorBoundary class in ArchitectAIEnhanced.js catches component errors

**API Fallbacks**:
- Together.ai failure: Returns error message (no fallback - Together.ai is primary)
- Google Maps: Fallback to default San Francisco coordinates if geocoding fails
- OpenWeather: Mock climate data if API call fails

**Service Graceful Degradation**:
- All AI services have error handling with user-friendly messages
- User experience continues even if external APIs are down
- Geometry-First pipeline falls back to DNA-Enhanced if geometry generation fails

### Testing & Debugging

**Comprehensive Test Suites**:
```bash
# Geometry-First full test suite (49 tests)
node test-geometry-first-local.js

# Individual pipeline tests
node test-together-api-connection.js  # Together.ai connectivity
node test-dna-pipeline.js             # DNA generation
node test-geometry-pipeline.js        # Geometry pipeline

# Jest unit tests
npm test                              # Interactive mode
npm run test:coverage                 # With coverage report
```

**Critical Areas to Test**:
- Geolocation permission scenarios (granted, denied, unavailable)
- API key presence and validity (check console logs)
- International address formats and coordinate systems
- 3D map rendering performance on various devices
- AI generation with different building programs and locations
- File download functionality across browsers
- Site polygon drawing and geometry generation
- A1 sheet layout and export
- Feature flag toggling and workflow switching

**Known Performance Considerations**:
- Google Maps API can cause re-render loops if dependencies not properly managed
- MapView component uses careful `useEffect` dependency arrays to prevent infinite re-renders
- **CRITICAL**: Together.ai rate limiting requires 6-second delays between image requests
  - Location: `togetherAIService.js` line 337
  - Reducing below 6s causes 429 errors and incomplete generation (only 2/13 views)
  - Complete generation takes ~3 minutes (13 views × 6s + processing)
- DNA generation via Qwen takes 10-15 seconds
- Geometry-First 3D geometry generation takes 5-10 seconds
- If generation fails, wait 60 seconds before retrying to avoid rate limit blocks

### Code Style & Patterns

**State Management**: React hooks (`useState`, `useEffect`, `useCallback`, `useRef`)
- `useRef` for references that shouldn't trigger re-renders
- Callbacks memoized with `useCallback` to prevent unnecessary child re-renders

**Component Structure**:
- Single-file component (ArchitectAIEnhanced.js) with multiple render functions
- `renderStep()` function switches on `currentStep` state variable
- Each step is a separate render function (e.g., `renderLandingPage()`)

**Styling**: Tailwind-like utility classes embedded in JSX
- Gradient backgrounds, rounded corners, shadow effects
- Responsive grid layouts with `md:` and `lg:` breakpoints
- Animation classes for fade-ins and transitions

**TypeScript Integration**:
- Core validators and schema in TypeScript (`src/core/*.ts`)
- Service layer primarily JavaScript (`.js`)
- Type safety for architectural rules and validation

### API Cost Considerations

**Per Complete Design Generation (DNA-Enhanced with Together.ai)**:
- Together.ai Qwen 2.5 72B (DNA generation): ~$0.02-$0.03
- Together.ai FLUX.1-dev (13 images): ~$0.13-$0.20 (~$0.01-$0.015 per image)
- Total per design: **~$0.15-$0.23** (64% cheaper than legacy DALL-E workflow)

**Per Complete Design Generation (Geometry-First)**:
- Together.ai Qwen 2.5 72B (DNA generation): ~$0.02-$0.03
- Together.ai FLUX.1-dev (5 photorealistic views): ~$0.05-$0.08
- Local geometry rendering (8 technical views): $0.00 (free)
- Total per design: **~$0.07-$0.11** (78% cheaper than DNA-Enhanced, 89% cheaper than legacy)

**Per A1 Sheet Generation**:
- Together.ai Qwen 2.5 72B (DNA + style blending): ~$0.03-$0.04
- Together.ai FLUX.1-dev (single high-res A1 sheet): ~$0.02-$0.03
- Total per A1 sheet: **~$0.05-$0.07** (Together-only workflow)

**Cost Optimization**:
- DNA system reduces regeneration needs (98% consistency vs 70% baseline)
- A1 sheet workflow reduces total API calls (1 sheet vs 13 views)
- Together.ai significantly cheaper than DALL-E 3 (~80% cost reduction)
- Failed generations don't count toward costs (retry logic built-in)

### Development vs Production Behavior

**Development** (`npm run dev`):
- React app on localhost:3000
- Express proxy on localhost:3001
- API calls routed through Express
- Hot reload for rapid development
- Feature flags configurable via browser console

**Production** (Vercel):
- React static site served from Vercel CDN
- API calls routed through Vercel Serverless Functions
- Environment variables configured in Vercel dashboard
- Automatic HTTPS and global edge distribution
- Feature flags persist in sessionStorage (user-specific)

### Critical Development Guidelines

**Rate Limiting (MUST READ)**:
- Together.ai FLUX requires 6-second delays between image requests (`togetherAIService.js:337`)
- **DO NOT** reduce this delay below 6000ms - will cause 429 errors and incomplete generation
- If modifying generation flow, maintain sequential processing with delays
- Test with `node test-together-api-connection.js` before making changes

**Design DNA System**:
- Master DNA must be generated FIRST before any image generation
- DNA validation is mandatory - do not skip `dnaValidator.js`
- Each view gets a unique prompt from `dnaPromptGenerator.js` - never reuse prompts
- Consistency rules in DNA are enforced across ALL views (13-view mode) or ALL sheet sections (A1 mode)

**Geometry-First Pipeline**:
- Only enable when dimensional accuracy is critical or custom site constraints exist
- Spatial layout algorithm must validate against 50+ rules before geometry generation
- Three.js geometry must be properly disposed to avoid memory leaks
- 2D view rendering is synchronous - use web workers for large projects
- Always test with `node test-geometry-first-local.js` after geometry changes

**Feature Flags**:
- Feature flags are stored in sessionStorage (not localStorage) - clear on browser close
- Always check `isFeatureEnabled()` before branching on geometry vs DNA workflow
- Document any new feature flags in `featureFlags.js` with clear descriptions
- Test both enabled and disabled states for all flags

**Service Architecture**:
- `togetherAIService.js` is PRIMARY - do not bypass it for image generation
- OpenAI services are fallback only - check Together.ai first
- All services in `src/services/` follow contract pattern - validate with `npm run check:contracts`
- Geometry services return Three.js objects - ensure proper disposal after use

**Testing Before Deployment**:
1. Run `npm run check:all` to validate environment and contracts
2. Test A1 workflow: wait ~60 seconds, verify complete A1 sheet with all sections
3. Test Geometry-First workflow: enable flag, verify 49/49 tests pass
4. Test clinic A1 generation: verify non-residential prompts include all required sections
5. Test AI Modify workflow: verify seed reuse and consistency lock work correctly
6. Verify A1 sheet includes all required sections (plans, elevations, sections, 3D views, title block)

### Important Files to Understand

**Core Application**:
- `src/ArchitectAIEnhanced.js` - Main application logic (2000+ lines)
- `src/App.js` - Entry point

**Feature Configuration**:
- `src/config/featureFlags.js` - Feature flag system (a1Only: true, geometryFirst: false)
- `src/config/appConfig.js` - Application-wide configuration

**A1-Only Generation Pipeline** (Read these for A1 workflow):
- `src/services/enhancedDNAGenerator.js` - Master DNA generation (850 lines)
- `src/services/dnaValidator.js` - DNA validation and auto-correction
- `src/services/a1SheetPromptGenerator.js` - A1 sheet prompt + withConsistencyLock()
- `src/services/dnaWorkflowOrchestrator.js` - A1 workflow orchestration (runA1SheetWorkflow)
- `src/services/a1SheetValidator.js` - Sheet quality validation

**AI Modification System** (Read these for modify workflow):
- `src/services/aiModificationService.js` - modifyA1Sheet() with consistency lock
- `src/services/sheetConsistencyGuard.js` - pHash/SSIM validation and retry logic
- `src/services/designHistoryService.js` - Design storage with versioning
- `src/components/AIModifyPanel.jsx` - UI for modification requests

**Geometry-First Pipeline** (OPTIONAL - enhances precision but outputs A1 sheet):
- `src/geometry/spatialLayoutAlgorithm.js` - DNA to 3D spatial layout conversion
- `src/geometry/geometryBuilder.js` - Three.js geometry construction
- `src/core/validators.ts` - TypeScript architectural validation rules

**Primary AI Services**:
- `src/services/togetherAIService.js` - **PRIMARY** - FLUX image generation + Qwen reasoning
- `src/services/togetherAIReasoningService.js` - Specialized Qwen integration
- `src/services/fluxAIIntegrationService.js` - FLUX workflow management

**API Infrastructure**:
- `server.js` - Development proxy server (port 3001)
- `api/together-chat.js` - Production Together.ai chat proxy
- `api/together-image.js` - Production Together.ai image proxy
- `api/render.js` - Production geometry rendering endpoint
- `api/plan.js` - Production DNA generation endpoint
- `api/sheet.js` - Production A1 sheet export endpoint

**Validation Scripts**:
- `scripts/check-env.js` - Validates environment variables
- `scripts/check-contracts.js` - Validates service contracts
- `test-together-api-connection.js` - Tests Together.ai connectivity
- `test-clinic-a1-generation.js` - Tests clinic A1 prompt generation with all required sections
- `test-modify-seed-consistency.js` - Tests seed reuse and consistency lock in modify workflow
- `test-a1-modify-consistency.js` - Test A1 modification workflow with consistency lock
- `test-geometry-first-local.js` - Comprehensive Geometry-First test suite

**Key Documentation**:
- `README.md` - Public-facing documentation with Geometry-First overview
- `DNA_SYSTEM_ARCHITECTURE.md` - Complete DNA pipeline explanation
- `CONSISTENCY_SYSTEM_COMPLETE.md` - 98% consistency achievement details
- `GEOMETRY_FIRST_README.md` - Detailed Geometry-First technical reference
- `GEOMETRY_FIRST_COMPLETE.md` - Geometry-First implementation summary
- `FIX_SUMMARY.md` - Recent critical fixes (rate limiting, etc.)
- `TOGETHER_AI_SETUP.md` - Together.ai integration guide
- `API_SETUP.md` - Complete AI integration reference

### Storage and Data Persistence

**Storage Manager Architecture:**
- `src/utils/storageManager.js` - Handles localStorage with quota management
- Arrays stored with `_data` wrapper to prevent corruption: `{ _data: [...], _timestamp: ... }`
- Objects stored with spread syntax: `{ ...obj, _timestamp: ... }`
- Automatic cleanup when quota exceeded (removes oldest 20%)

**Design History Storage:**
- Uses `storageManager` to persist designs with versioning
- Automatic migration repairs corrupted data from old format
- Storage key: `archiAI_design_history`

**Storage Utilities:**
```bash
# Inspect/repair storage manually
open CLEAR_DESIGN_HISTORY.html  # in browser

# Test storage fix
node test-storage-fix.js
```

**Known Issue - FIXED:** Arrays were being converted to objects with numeric keys when adding timestamps. This caused "design not found" errors in A1 Modify workflow. Fixed in `storageManager.js` by wrapping arrays in `{ _data }` instead of spreading. See `A1_MODIFY_STORAGE_FIX.md` for details.

### Common Issues & Troubleshooting

**Only 2 views generate (missing 11 views)**:
- **Cause**: Rate limiting - delay too short or rate limit hit
- **Fix**: Verify `togetherAIService.js:337` shows `delayMs = 6000`
- **Action**: Wait 60 seconds before retrying generation
- **Test**: Run `node test-together-api-connection.js` to verify API connectivity

**No views generate at all**:
- **Cause**: Express server not running or API key missing
- **Fix**: Start server with `npm run server` in separate terminal
- **Verify**: Check `.env` has `TOGETHER_API_KEY=tgp_v1_...`
- **Check**: Browser console should show proxy requests to `localhost:3001`

**Views are inconsistent (different colors/materials)**:
- **Cause**: Legacy workflow bypassing DNA system
- **Fix**: Check ArchitectAIEnhanced.js calls DNA workflow, not legacy
- **Verify**: Console should show "🧬 Using DNA-Enhanced FLUX workflow"
- **Check**: Master DNA should generate BEFORE any images

**Geometry-First generation fails**:
- **Cause**: Spatial layout validation errors or Three.js rendering issues
- **Fix**: Check browser console for validation errors from `validators.ts`
- **Verify**: Run `node test-geometry-first-local.js` to isolate issue
- **Fallback**: System should automatically fall back to DNA-Enhanced workflow
- **Check**: Enable `debugGeometry: true` flag to see detailed logs

**A1 sheet looks like placeholder/grid**:
- **Cause**: Prompt not strong enough to override placeholder aesthetic
- **Fix**: Verify `a1SheetPromptGenerator.js` includes strong negative prompts
- **Check**: Resolution should be 1792×1269 (Together API compliant)
- **Verify**: Style blending is enabled (portfolio + local styles combined)

**Together.ai "Insufficient credits" error**:
- **Cause**: Free tier doesn't support FLUX models
- **Fix**: Add $5-10 credits at https://api.together.ai/settings/billing
- **Note**: Legacy fallbacks (OpenAI + Replicate) have been removed - Together.ai is required

**Floor plans showing 3D perspective instead of 2D overhead**:
- **Cause**: Prompt not explicit enough about 2D requirement
- **Check**: `dnaPromptGenerator.js` floor plan prompts include "TRUE OVERHEAD ORTHOGRAPHIC"
- **Verify**: Negative prompts include "(perspective:1.5), (3D:1.5), (isometric:1.5)"
- **Geometry-First**: If enabled, floor plans should be perfect 2D (rendered from geometry)

**Elevations all look the same**:
- **Cause**: View-specific features not in DNA or prompts too generic
- **Fix**: Verify Master DNA has unique `viewSpecificFeatures` for each orientation
- **Check**: Each elevation prompt should have DIFFERENT features (entrance, patio, windows)

**Generation takes longer than 3 minutes (DNA-Enhanced)**:
- **Expected**: Normal if API responses are slow or retries needed
- **Monitor**: Check browser console for retry attempts
- **Action**: If stuck on one view >30s, API may be down - check Together.ai status

**Generation takes longer than 2 minutes (Geometry-First)**:
- **Expected**: Normal if geometry is complex or 3D API calls are slow
- **Monitor**: Check console for "Geometry generation complete" message
- **Action**: 2D views should render in <10s; if longer, check Three.js memory usage

**Site polygon drawing not working**:
- **Cause**: Google Maps API key missing or quota exceeded
- **Fix**: Verify `REACT_APP_GOOGLE_MAPS_API_KEY` is set
- **Check**: Browser console should not show Google Maps errors
- **Alternative**: Skip site drawing and use default rectangular footprint

**Feature flag changes not taking effect**:
- **Cause**: sessionStorage not cleared or page not refreshed
- **Fix**: Clear sessionStorage and refresh page: `sessionStorage.clear(); location.reload()`
- **Verify**: Check console logs show correct flag values on page load
- **Alternative**: Use `setFeatureFlag()` and immediately trigger generation

### Architecture Decision Records

**Why Two Architectures?**
- DNA-Enhanced (default): Proven 98% consistency, photorealistic quality, simpler codebase
- Geometry-First (optional): 99.5% dimensional accuracy, faster, site-aware, but more complex

**Why Geometry-First is Not Default?**
- DNA-Enhanced sufficient for most use cases (98% vs 99.5% is marginal for photorealistic renders)
- Geometry-First adds complexity (Three.js, TypeScript, 50+ validation rules)
- A1 sheet workflow (DNA-based) handles most professional output needs
- Allows experimentation without breaking production workflow

**Why A1 Sheet Workflow?**
- Single professional output vs 13 individual images (cleaner UX)
- Reduces API costs (1 high-res call vs 13 medium-res calls)
- Better for portfolio presentation and client review
- Matches real-world architectural delivery (A1 is standard sheet size)

**When to Use Each Mode**:
- **DNA-Enhanced (default)**: General architectural design, photorealistic visualization, standard projects
- **Geometry-First**: Engineering projects, dimensional verification, custom site constraints, BIM export
- **A1 Sheet**: Client presentations, portfolio work, final deliverables
