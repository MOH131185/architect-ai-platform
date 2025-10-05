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
