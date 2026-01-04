# Baseline Audit Report
**Design DNA Consistency Enhancement Initiative**
*Generated: 2025-10-25*

---

## Executive Summary

This audit maps the current state of environment variables, service response shapes, and workflow orchestration to establish a baseline before implementing the Design DNA Enhancement Plan. Key findings reveal **inconsistent data contracts**, **fragmented error handling**, and **mixed environment variable naming conventions** that create unpredictable behavior.

---

## 1. Environment Variables Analysis

### 1.1 Documented Variables

| Variable | Purpose | Location | Dev/Prod | Status |
|----------|---------|----------|----------|--------|
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Geocoding, reverse geocoding, 3D maps | Client-side | Both | ✅ Consistent |
| `REACT_APP_OPENWEATHER_API_KEY` | Seasonal climate data | Client-side | Both | ✅ Consistent |
| `OPENAI_REASONING_API_KEY` | GPT-4o design reasoning | Server-side | Both | ⚠️ Server-only |
| `OPENAI_IMAGES_API_KEY` | DALL·E 3 image generation | Server-side | Both | ⚠️ Server-only |
| `REACT_APP_OPENAI_API_KEY` | Legacy OpenAI key | Client-side | Both | ⚠️ Deprecated |
| `REACT_APP_REPLICATE_API_KEY` | SDXL image generation (fallback) | Client-side | Dev | ⚠️ Dev only |
| `REPLICATE_API_TOKEN` | Replicate API token | Server-side | Prod | ⚠️ Prod only |
| `TOGETHER_API_KEY` | Together AI (FLUX.1, Llama) | Server-side | Both | ✅ Consistent |
| `REACT_APP_USE_CONTROLNET_WORKFLOW` | Feature flag: ControlNet multi-view | Client-side | Both | ✅ Flag |
| `REACT_APP_USE_TOGETHER` | Feature flag: Together AI | Client-side | Both | ✅ Flag |
| `MIDJOURNEY_API_KEY` | Midjourney via Maginary.ai | Server-side | Both | ⚠️ Optional |
| `REACT_APP_API_PROXY_URL` | Production API proxy URL | Client-side | Prod | ⚠️ Optional |

### 1.2 Environment Variable Issues

#### 🔴 **Critical Issues**
1. **Naming Inconsistency**: `REACT_APP_REPLICATE_API_KEY` (dev) vs `REPLICATE_API_TOKEN` (prod)
2. **Multiple OpenAI Keys**: Three separate keys (`OPENAI_REASONING_API_KEY`, `OPENAI_IMAGES_API_KEY`, `REACT_APP_OPENAI_API_KEY`) for different purposes
3. **No Validation**: No runtime checks to ensure required keys are present before operations

#### 🟡 **Moderate Issues**
1. **Client-side Exposure**: `REACT_APP_*` keys are bundled into the client build (acceptable for Maps/Weather, risky for AI APIs)
2. **Feature Flag Coupling**: Feature flags stored as env vars instead of a dedicated config layer

### 1.3 Actual Usage in Code

**openaiService.js:6**
```javascript
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
```

**server.js:34**
```javascript
const apiKey = process.env.OPENAI_REASONING_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;
```

**api/openai-chat.js:29**
```javascript
const apiKey = process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;
```

**Observation**: Three different fallback patterns for the same logical resource (OpenAI API access).

---

## 2. Service Response Shape Inventory

### 2.1 OpenAI Service (`src/services/openaiService.js`)

#### Design Reasoning Response
```typescript
{
  styleRationale?: {
    overview: string,
    localStyleImpact: string,
    portfolioStyleImpact: string,
    climateIntegration: string
  },
  designPhilosophy: string,
  spatialOrganization: string | object,
  materialRecommendations: string | object,
  environmentalConsiderations: string | object,
  technicalSolutions: string | object,
  codeCompliance: string | object,
  costStrategies: string | object,
  futureProofing: string | object,
  rawResponse?: string,
  timestamp: string (ISO 8601),
  isFallback?: boolean
}
```

**Issues**:
- ❌ Inconsistent field types (string vs object for `spatialOrganization`, `materialRecommendations`, etc.)
- ❌ No `source` field indicating which service/model generated the response
- ❌ No telemetry (`latencyMs`, `costUsd`, `tokenUsage`)
- ❌ No version metadata (`dnaVersion`)

#### Feasibility Analysis Response
```typescript
{
  feasibility: string,
  constraints: string | string[],
  recommendations: string | string[],
  rawResponse?: string,
  timestamp: string,
  isFallback?: boolean,
  error?: string
}
```

**Issues**:
- ❌ Field types vary (string vs array)
- ❌ No consistency with design reasoning shape

---

### 2.2 Replicate Service (`src/services/replicateService.js`)

#### Image Generation Response
```typescript
{
  success: boolean,
  images: string[],
  predictionId?: string,
  parameters: object,
  timestamp: string,
  isFallback?: boolean,
  error?: string
}
```

#### Multi-Level Floor Plans Response
```typescript
{
  success: boolean,
  floorPlans: {
    ground: { images: string[], success: boolean },
    upper?: { images: string[], success: boolean },
    roof: { images: string[], success: boolean }
  },
  floorCount: number,
  projectSeed: number,
  timestamp: string,
  isFallback?: boolean,
  error?: string
}
```

**Issues**:
- ❌ No `source` field
- ❌ No telemetry (`latencyMs`, `costUsd`)
- ⚠️ Different shapes for different operations (image vs floor plans vs elevations)

---

### 2.3 AI Integration Service (`src/services/aiIntegrationService.js`)

#### Complete Design Response
```typescript
{
  success: boolean,
  reasoning: object,
  visualizations: {
    views: object,
    styleVariations: object,
    reasoningBased: object
  },
  alternatives: object,
  feasibility: object,
  timestamp: string,
  workflow?: 'complete' | 'quick',
  fallback?: object,
  error?: string
}
```

**Issues**:
- ❌ Nested `visualizations` object adds complexity
- ❌ No telemetry aggregation (total cost, total latency across all AI calls)
- ❌ No `meta` field for telemetry, source, version

---

## 3. API Routing & Proxying Architecture

### 3.1 Development Environment

**Proxy Server**: `server.js` (Express on port 3001)

| Endpoint | Proxies To | API Key |
|----------|-----------|---------|
| `/api/openai/chat` | `https://api.openai.com/v1/chat/completions` | `OPENAI_REASONING_API_KEY` or `REACT_APP_OPENAI_API_KEY` |
| `/api/openai/images` | Redirects to Together AI FLUX.1 | `TOGETHER_API_KEY` |
| `/api/replicate/predictions` | `https://api.replicate.com/v1/predictions` | `REACT_APP_REPLICATE_API_KEY` |
| `/api/replicate/predictions/:id` | `https://api.replicate.com/v1/predictions/:id` | `REACT_APP_REPLICATE_API_KEY` |
| `/api/enhanced-image/generate` | DALL·E 3 / FLUX.1 / SDXL / OpenArt | Multiple keys |
| `/api/maginary/generate` | Midjourney via Maginary.ai | `MIDJOURNEY_API_KEY` |
| `/api/together/chat` | Together AI chat completions | `TOGETHER_API_KEY` |
| `/api/together/image` | Together AI FLUX.1 | `TOGETHER_API_KEY` |

**Observations**:
- ✅ CORS headers properly configured
- ✅ Payload size limit increased to 50MB for base64 images
- ⚠️ `/api/openai/images` silently redirects to FLUX.1 (DALL·E override)
- ⚠️ Complex routing logic in `/api/enhanced-image/generate` (2D vs 3D detection, model fallbacks)

### 3.2 Production Environment (Vercel Serverless Functions)

**Functions Directory**: `/api/*`

| Function | Purpose | API Key |
|----------|---------|---------|
| `openai-chat.js` | OpenAI chat proxy | `OPENAI_API_KEY` or `REACT_APP_OPENAI_API_KEY` |
| `replicate-predictions.js` | Replicate prediction creation | `REPLICATE_API_TOKEN` or `REACT_APP_REPLICATE_API_KEY` |
| `replicate-status.js` | Replicate status check | Same as above |

**Issues**:
- ❌ Key naming differs from dev (`OPENAI_API_KEY` vs `OPENAI_REASONING_API_KEY`)
- ❌ No unified client to abstract dev/prod routing
- ❌ No retry logic or timeout handling in serverless functions

---

## 4. Service Fallback Semantics

### 4.1 OpenAI Service

**Fallback Trigger**: API key missing or API error

**Fallback Response** (`openaiService.js:243`):
```javascript
{
  designPhilosophy: "Focus on sustainable, contextually appropriate design...",
  spatialOrganization: "Optimize spatial flow and functionality...",
  materialRecommendations: "Select materials based on local availability...",
  environmentalConsiderations: "Implement passive design strategies...",
  technicalSolutions: "Address structural efficiency, MEP optimization...",
  codeCompliance: "Ensure full compliance with local building codes...",
  costStrategies: "Balance initial investment with long-term operational savings...",
  futureProofing: "Design for adaptability and technological integration...",
  isFallback: true,
  timestamp: new Date().toISOString()
}
```

**Issues**:
- ✅ Consistent `isFallback` flag
- ❌ No `source` field
- ❌ Generic text, not contextually aware of project details

### 4.2 Replicate Service

**Fallback Trigger**: API key missing or generation error

**Fallback Response** (`replicateService.js:1179`):
```javascript
{
  success: false,
  isFallback: true,
  images: ['https://placehold.co/1024x768/...?text=Placeholder'],
  message: 'Using placeholder image - API unavailable',
  timestamp: new Date().toISOString()
}
```

**Issues**:
- ✅ Consistent placeholder pattern
- ❌ Placeholder URLs instead of useful diagnostics
- ❌ No error details passed to caller

### 4.3 AI Integration Service

**Fallback Trigger**: Underlying service errors

**Fallback Response** (`aiIntegrationService.js:1251`):
```javascript
{
  reasoning: {
    designPhilosophy: 'Contextual and sustainable design approach',
    spatialOrganization: 'Functional and flexible spatial arrangement',
    ...
    isFallback: true
  },
  visualizations: {
    views: { /* placeholder images */ },
    ...
  },
  alternatives: { /* fallback alternatives */ },
  feasibility: { feasibility: 'Unknown', ... },
  source: 'fallback',
  timestamp: new Date().toISOString()
}
```

**Issues**:
- ✅ Comprehensive fallback structure
- ❌ No error propagation details
- ❌ No partial success handling (e.g., reasoning succeeded but visualizations failed)

---

## 5. Workflow Step Orchestration

### 5.1 Main Application (`src/ArchitectAIEnhanced.js`)

**Step Flow** (from CLAUDE.md):

1. **Step 0**: Landing Page
2. **Step 1**: Location Analysis
   - Uses Google Geocoding API
   - Uses OpenWeather API
   - Calls `locationIntelligence.js` for zoning analysis
3. **Step 2**: Intelligence Report
   - Displays climate data
   - Displays zoning info
   - Shows 3D map (Google Maps)
4. **Step 3**: Portfolio Upload
   - User uploads images
   - Calls `enhancedPortfolioService.js` for style detection
5. **Step 4**: Project Specifications
   - User inputs building program, area, requirements
6. **Step 5**: AI Generation & Results
   - Calls `aiIntegrationService.generateCompleteDesign()`
   - Displays visualizations, reasoning, alternatives, feasibility
   - Provides export options (DWG, RVT, IFC, PDF)

**State Management**:
```javascript
const [currentStep, setCurrentStep] = useState(0);
const [locationData, setLocationData] = useState(null);
const [portfolioData, setPortfolioData] = useState(null);
const [specifications, setSpecifications] = useState(null);
const [aiResults, setAiResults] = useState(null);
```

**Issues**:
- ❌ No centralized state machine
- ❌ No error recovery paths (if step 3 fails, can't go back to step 2)
- ❌ No loading/error/success state management across steps
- ❌ Direct API calls from UI component (tight coupling)

### 5.2 Error Handling Patterns

**openaiService.js:64**:
```javascript
try {
  const data = await response.json();
  return this.parseDesignReasoning(data.choices[0].message.content, projectContext);
} catch (error) {
  console.error('OpenAI API error:', error);
  return this.getFallbackReasoning(projectContext);
}
```

**replicateService.js:126**:
```javascript
} catch (error) {
  console.error('Replicate generation error:', error);
  console.warn('Using fallback image due to error');
  const fallback = this.getFallbackImage(generationParams);
  return {
    success: false,
    images: fallback.images || [fallback],
    error: error.message,
    isFallback: true,
    parameters: generationParams,
    timestamp: new Date().toISOString()
  };
}
```

**Observations**:
- ✅ Graceful degradation (fallback responses)
- ❌ Error details only logged to console, not surfaced to UI
- ❌ No structured error objects (`{ code, message, source, isFallback }`)
- ❌ No retry logic

---

## 6. Data Flow Tracing

### 6.1 Complete Design Generation Flow

```
User clicks "Generate Design" (Step 5)
  ↓
ArchitectAIEnhanced.js calls aiIntegrationService.generateCompleteDesign(projectContext)
  ↓
aiIntegrationService.generateDesignReasoning(projectContext)
  ↓
openaiService.generateDesignReasoning(projectContext)
  ↓
Fetch → server.js → /api/openai/chat → OpenAI API
  ↓
Returns: { designPhilosophy, spatialOrganization, ..., timestamp }
  ↓
aiIntegrationService.generateVisualizations(reasoning, projectContext)
  ↓
replicateService.generateMultipleViews(projectContext, viewTypes)
  ↓
Fetch → server.js → /api/replicate/predictions → Replicate API
  ↓
Returns: { views: { exterior, interior, site_plan }, timestamp }
  ↓
aiIntegrationService.generateDesignAlternatives(projectContext)
  ↓
openaiService.generateDesignAlternatives(projectContext, 'sustainable')
  ↓
Fetch → server.js → /api/openai/chat → OpenAI API
  ↓
Returns: { alternatives: { sustainable, cost_effective, innovative, traditional }, timestamp }
  ↓
aiIntegrationService.analyzeFeasibility(projectContext)
  ↓
openaiService.analyzeFeasibility(projectContext)
  ↓
Fetch → server.js → /api/openai/chat → OpenAI API
  ↓
Returns: { feasibility: 'Medium', constraints, recommendations, timestamp }
  ↓
Final result returned to ArchitectAIEnhanced.js:
{
  success: true,
  reasoning: {...},
  visualizations: {...},
  alternatives: {...},
  feasibility: {...},
  timestamp: '2025-10-25T...'
}
```

**Issues**:
- ❌ No telemetry aggregation (can't calculate total API cost or latency)
- ❌ No progress updates to UI during multi-step generation
- ❌ No partial result caching (if alternatives fail, entire generation fails)
- ❌ Sequential calls (reasoning → visualizations → alternatives → feasibility) instead of parallel where possible

---

## 7. File Export System

**Location**: `src/ArchitectAIEnhanced.js` (lines ~2000+)

**Functions**:
- `generateDWGContent()` - AutoCAD 2D drawings
- `generateRVTContent()` - Revit 3D BIM model data
- `generateIFCContent()` - Industry standard BIM (ISO-10303-21)
- `generatePDFContent()` - HTML-based project documentation
- `downloadFile()` - Blob creation and download trigger

**Export Data Dependency**:
```javascript
const { reasoning, visualizations, alternatives, feasibility } = aiResults;
```

**Issues**:
- ❌ No validation that `aiResults` contains required fields before export
- ❌ If `reasoning.materialRecommendations` is missing, DWG/RVT/IFC exports fail silently
- ❌ No graceful degradation (e.g., note in PDF that some sections are missing)

---

## 8. Summary of Critical Gaps

### 8.1 Missing Canonical Contracts

| Domain | Current State | Issue |
|--------|---------------|-------|
| **Location Profile** | Scattered across `locationIntelligence.js` | No typed interface, inconsistent field names |
| **Design Reasoning** | Varies by OpenAI response parsing | String vs object fields, no version metadata |
| **Visualization Results** | Nested `visualizations.views` structure | Complex nesting, no flat access pattern |
| **Design Alternatives** | Object with 4 keys (sustainable, cost_effective, etc.) | No iteration support, hardcoded keys |
| **Feasibility Analysis** | String fields with no structure | Can't programmatically parse constraints |

### 8.2 Missing Runtime Validation

- ❌ No TypeScript or JSDoc typedefs
- ❌ No runtime schema validation (Ajv, Zod, superstruct)
- ❌ No `ensure()` guards for critical invariants

### 8.3 Missing Unified Config

- ❌ No `src/config/appConfig.js` to centralize env var reading
- ❌ No validation that required keys are present at startup
- ❌ No dev/prod routing abstraction

### 8.4 Missing Telemetry & Observability

- ❌ No `meta` field in responses with `{ source, latencyMs, costUsd, tokenUsage }`
- ❌ No aggregated telemetry for multi-step workflows
- ❌ No version metadata (`dnaVersion: '1.0.0'`)

### 8.5 Missing Workflow Orchestration

- ❌ No state machine for step transitions
- ❌ No loading/error/success state management
- ❌ No progress updates during long-running AI operations

---

## 9. Recommendations for Phase 2 (Implementation)

### 9.1 High Priority (PR1: Config + DNA Contract + Validators)

1. **Create `src/domain/dna.js`**:
   - Define TypeScript-style JSDoc typedefs for `LocationProfile`, `DesignReasoning`, `VisualizationResult`, etc.
   - Add `dnaVersion: '1.0.0'`, `meta: { source, latencyMs, costUsd, tokenUsage }`
   - Document all fields with examples

2. **Create `src/domain/validators.js`**:
   - Use Ajv or superstruct for runtime validation
   - Export `validateLocationProfile()`, `validateDesignReasoning()`, etc.
   - Add `ensure()` helper for invariant assertions

3. **Create `src/config/appConfig.js`**:
   - Read and validate all env vars at startup
   - Export `getApiKey(service)`, `getFeatureFlag(name)` with clear errors
   - Respect dev/prod differences

### 9.2 Medium Priority (PR2: API Client + Service Adapters)

1. **Create `src/services/apiClient.js`**:
   - Wrap fetch with timeout, retries, and uniform error handling
   - Abstract dev (`http://localhost:3001`) vs prod (`/api/*`) routing
   - Return `{ code, message, source, isFallback }` errors

2. **Create `src/services/adapters/openaiAdapter.js`**:
   - Map raw OpenAI responses → canonical `DesignReasoning` shape
   - Fill `meta` telemetry (start/end timestamps, token usage from response)
   - Set `isFallback: false`, `source: 'openai'`

3. **Create `src/services/adapters/replicateAdapter.js`**:
   - Map raw Replicate responses → canonical `VisualizationResult` shape
   - Fill `meta` telemetry (latency, cost estimation)
   - Set `isFallback: false`, `source: 'replicate'`

### 9.3 Low Priority (PR3: Orchestrator + UI Tokens)

1. **Create `src/services/workflowOrchestrator.js`**:
   - State machine for steps: `idle → location → portfolio → specs → generating → results → error`
   - Expose `subscribe(listener)` for UI to listen to state changes
   - Emit progress events (`reasoning_complete`, `visualizations_start`, etc.)

2. **Create `src/ui/tokens.js`**:
   - Define color palette, spacing, typography tokens
   - Export `colors.primary`, `spacing.md`, `typography.heading`

3. **Extract UI components**:
   - `src/components/Loader.jsx`
   - `src/components/ErrorBanner.jsx`
   - `src/components/EmptyState.jsx`

---

## 10. Next Steps

1. ✅ **Audit Complete** - This document
2. ⏭️ **Create Canonical DNA Typedefs** - `src/domain/dna.js`
3. ⏭️ **Add Validators** - `src/domain/validators.js`
4. ⏭️ **Unified Config** - `src/config/appConfig.js`
5. ⏭️ **API Client** - `src/services/apiClient.js`
6. ⏭️ **Service Adapters** - `src/services/adapters/*.js`
7. ⏭️ **Integrate Adapters** - Minimal edits to existing services
8. ⏭️ **Workflow Orchestrator** - `src/services/workflowOrchestrator.js`
9. ⏭️ **UI Tokens & Components** - `src/ui/*`, `src/components/*`
10. ⏭️ **Quality Gates** - Lint, format, test scripts
11. ⏭️ **Documentation** - Update `MVP_README.md`, `API_SETUP.md`

---

## Appendix A: Response Shape Examples

### A.1 Current OpenAI Response (Inconsistent)
```json
{
  "designPhilosophy": "string or object",
  "spatialOrganization": "could be string or nested object",
  "materialRecommendations": "varies by response",
  "timestamp": "2025-10-25T12:34:56.789Z",
  "isFallback": false
}
```

### A.2 Proposed Canonical DesignReasoning
```json
{
  "dnaVersion": "1.0.0",
  "designPhilosophy": {
    "overview": "string",
    "approach": "string",
    "principles": ["string"]
  },
  "spatialOrganization": {
    "strategy": "string",
    "keySpaces": ["string"],
    "circulation": "string"
  },
  "materialRecommendations": {
    "primary": [{ "material": "string", "rationale": "string" }],
    "secondary": ["string"]
  },
  "meta": {
    "source": "openai",
    "model": "gpt-4",
    "latencyMs": 1234,
    "costUsd": 0.15,
    "tokenUsage": { "prompt": 500, "completion": 800 },
    "timestamp": "2025-10-25T12:34:56.789Z"
  },
  "isFallback": false
}
```

---

**End of Baseline Audit Report**
