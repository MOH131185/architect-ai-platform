# Design DNA Architecture

**Comprehensive Guide to the Design DNA Enhancement System**

Version: 1.0.0
Last Updated: 2025-10-25

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [Usage Examples](#usage-examples)
6. [Migration Guide](#migration-guide)
7. [API Reference](#api-reference)

---

## Overview

The **Design DNA Enhancement** introduces a **canonical data contract system** that ensures consistent, predictable, and observable behavior across all AI-generated architectural design workflows.

### Key Benefits

- ✅ **Predictable Data Shapes**: Every AI response conforms to canonical types
- ✅ **Automatic Telemetry**: Cost, latency, token usage tracked for all operations
- ✅ **Type Safety**: 40+ JSDoc type definitions provide IntelliSense support
- ✅ **Runtime Validation**: Catch data inconsistencies before they cause bugs
- ✅ **Unified Configuration**: Single source of truth for environment variables
- ✅ **Network Resilience**: Automatic retries, timeouts for all API calls
- ✅ **Non-Breaking**: All enhancements are additive; existing code works unchanged

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│                  (ArchitectAIEnhanced.js)                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Workflow Orchestrator                           │
│  - State machine (idle → location → portfolio → specs → results)   │
│  - Event emitter for progress updates                              │
│  - Unified error/loading state management                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AI Integration Service                          │
│  - Orchestrates complete design workflow                           │
│  - Aggregates telemetry from all sub-steps                         │
│  - Returns canonical DesignResult                                  │
└───────────┬────────────────────┬────────────────┬────────────────────┘
            │                    │                │
            ▼                    ▼                ▼
  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
  │  OpenAI Service │  │Replicate Service│  │ Location Service │
  │                 │  │                 │  │                  │
  │  Uses:          │  │  Uses:          │  │  Returns:        │
  │  - apiClient    │  │  - apiClient    │  │  - Location      │
  │  - openaiAdapter│  │  - replAdapter  │  │    Profile       │
  └────────┬────────┘  └────────┬────────┘  └──────────────────┘
           │                    │
           ▼                    ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      Adapter Layer                           │
  │  - openaiAdapter.js: Normalizes OpenAI responses            │
  │  - replicateAdapter.js: Normalizes Replicate responses      │
  │  - Fills telemetry: { latencyMs, costUsd, tokenUsage }     │
  │  - Sets isFallback flag consistently                        │
  └────────────────────┬────────────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      API Client Layer                        │
  │  - Unified fetch wrapper with retry logic                  │
  │  - Timeout handling (default: 2 minutes)                   │
  │  - Exponential backoff (default: 2 retries)                │
  │  - Auto dev/prod routing (localhost vs Vercel serverless)  │
  └────────────────────┬────────────────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                    Configuration Layer                       │
  │  - Centralized env var management                          │
  │  - Validates required keys at startup                      │
  │  - Provides getApiKey(), getFeatureFlag()                  │
  │  - Respects dev/prod differences                           │
  └─────────────────────────────────────────────────────────────┘

                               ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   Domain Contracts (DNA)                     │
  │  - 40+ canonical type definitions                          │
  │  - LocationProfile, DesignReasoning, VisualizationResult   │
  │  - Meta (telemetry), ErrorResult (structured errors)       │
  └─────────────────────────────────────────────────────────────┘

                               ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                    Validators Layer                          │
  │  - Runtime validation of all data shapes                   │
  │  - Returns { valid, errors, warnings }                     │
  │  - Ensure guards for critical invariants                   │
  └─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Domain Contracts (`src/domain/dna.js`)

**40+ canonical type definitions** using TypeScript-style JSDoc:

```javascript
import { DNA_VERSION, createMeta, createError } from '../domain/dna.js';

// Example: LocationProfile
/**
 * @typedef {Object} LocationProfile
 * @property {string} address - Full formatted address
 * @property {Coordinates} coordinates - Geographic coordinates
 * @property {ClimateData} climate - Climate and seasonal data
 * @property {ZoningData} zoning - Zoning regulations
 * @property {Meta} meta - Telemetry and metadata
 * @property {boolean} isFallback - Whether this is fallback data
 */

// Example: DesignReasoning
/**
 * @typedef {Object} DesignReasoning
 * @property {string} designPhilosophy - Overall design philosophy
 * @property {SpatialOrganization} spatialOrganization - Spatial layout strategy
 * @property {MaterialRecommendations} materialRecommendations - Material selections
 * @property {Meta} meta - Telemetry and metadata
 * @property {boolean} isFallback - Whether this is fallback reasoning
 */
```

**Key Types:**
- `LocationProfile`: Geographic, climate, zoning data
- `DesignReasoning`: AI-generated design philosophy and recommendations
- `VisualizationResult`: Generated images with metadata
- `DesignResult`: Complete design with reasoning, visualizations, alternatives
- `Meta`: Telemetry (source, latencyMs, costUsd, tokenUsage, timestamp)
- `ErrorResult`: Structured errors (code, message, source, details)

---

### 2. Validators (`src/domain/validators.js`)

**Runtime validation** without heavy dependencies:

```javascript
import { validateDesignResult, ensure, ensureExists } from '../domain/validators.js';

// Validate data
const result = { success: true, reasoning: {...}, visualizations: {...} };
const validation = validateDesignResult(result);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}

// Ensure guards (throw on invalid)
ensureExists(apiKey, 'API key');
ensure(latencyMs > 0, 'Latency must be positive');
```

**Available Validators:**
- `validateLocationProfile(location)`
- `validateDesignReasoning(reasoning)`
- `validateVisualizationResult(visualizations)`
- `validateDesignResult(result)`
- `validateProjectContext(context)`
- `validateMeta(meta)`

---

### 3. Configuration (`src/config/appConfig.js`)

**Unified environment variable management**:

```javascript
import { getApiKey, hasApiKey, getFeatureFlag, ServiceName } from '../config/appConfig.js';

// Get API key with validation
const apiKey = getApiKey(ServiceName.OPENAI_REASONING); // Throws if missing

// Check if key is configured
if (hasApiKey(ServiceName.REPLICATE)) {
  // Use Replicate
}

// Get feature flag
const useControlNet = getFeatureFlag('USE_CONTROLNET_WORKFLOW'); // boolean
```

**Service Names:**
- `ServiceName.GOOGLE_MAPS`
- `ServiceName.OPENWEATHER`
- `ServiceName.OPENAI_REASONING`
- `ServiceName.OPENAI_IMAGES`
- `ServiceName.REPLICATE`
- `ServiceName.TOGETHER_AI`

---

### 4. API Client (`src/services/apiClient.js`)

**Unified HTTP client** with retry logic:

```javascript
import { post, get, handleResponse } from '../services/apiClient.js';

// Make POST request with automatic retry
const response = await post('openai', '/chat', {
  model: 'gpt-4',
  messages: [...]
}, {
  timeout: 120000, // 2 minutes
  retries: 2,      // 2 retry attempts
  retryDelay: 1000 // 1 second initial delay
});

// Handle response (throws on error)
const data = handleResponse(response, 'openai');
```

**Features:**
- Automatic dev/prod routing
- Exponential backoff on retries
- Timeout handling
- Structured errors

---

### 5. Adapters

#### OpenAI Adapter (`src/services/adapters/openaiAdapter.js`)

**Normalizes OpenAI responses** to canonical shapes:

```javascript
import { adaptDesignReasoning, createFallbackDesignReasoning } from '../services/adapters/openaiAdapter.js';

// Adapt raw response
const rawResponse = await post('openai', '/chat', {...});
const latencyMs = Date.now() - startTime;

const designReasoning = adaptDesignReasoning(rawResponse.data, latencyMs, {
  model: 'gpt-4',
  isFallback: false
});

// designReasoning.meta.costUsd = auto-calculated
// designReasoning.meta.tokenUsage = extracted from response
```

#### Replicate Adapter (`src/services/adapters/replicateAdapter.js`)

**Normalizes Replicate responses**:

```javascript
import { adaptGeneratedImage, adaptVisualizationResult } from '../services/adapters/replicateAdapter.js';

// Adapt single image
const image = adaptGeneratedImage(prediction, 'exterior_front', latencyMs);

// Adapt multiple views
const visualizations = adaptVisualizationResult(predictions, totalLatencyMs);
```

---

### 6. Workflow Orchestrator (`src/services/workflowOrchestrator.js`)

**State machine** for managing workflow:

```javascript
import orchestrator, { WorkflowState, WorkflowEvent, subscribeToWorkflow } from '../services/workflowOrchestrator.js';

// Subscribe to events
const unsubscribe = subscribeToWorkflow(WorkflowEvent.STATE_CHANGED, (event) => {
  console.log('State changed:', event.data);
});

// Start location analysis
await orchestrator.startLocationAnalysis(address);

// Complete with results
orchestrator.completeLocationAnalysis(locationProfile);

// Get current state
const state = orchestrator.getState(); // WorkflowState.LOCATION_COMPLETE
```

**States:**
- `IDLE` → `LOCATION_ANALYZING` → `LOCATION_COMPLETE`
- → `PORTFOLIO_ANALYZING` → `PORTFOLIO_COMPLETE`
- → `SPECS_COMPLETE` → `GENERATING` → `GENERATION_COMPLETE`
- → `ERROR`

---

## Data Flow

### Complete Design Generation Flow

```
User clicks "Generate Design"
  ↓
1. workflowOrchestrator.startGeneration(projectContext)
   - Sets state to GENERATING
   - Emits GENERATION_STARTED event
  ↓
2. aiIntegrationService.generateCompleteDesign(projectContext)
   ↓
3. Generate Reasoning (OpenAI)
   - apiClient.post('openai', '/chat', {...})
   - Latency tracked: startTime → endTime
   - openaiAdapter.adaptDesignReasoning(response, latencyMs)
   - Returns: DesignReasoning with meta { source, costUsd, tokenUsage, latencyMs }
   ↓
4. Generate Visualizations (Replicate)
   - apiClient.post('replicate', '/predictions', {...})
   - replicateAdapter.adaptVisualizationResult(predictions, totalLatencyMs)
   - Returns: VisualizationResult with meta { source, costUsd, latencyMs }
   ↓
5. Generate Alternatives (OpenAI)
   - 4 parallel calls: sustainable, cost_effective, innovative, traditional
   - Each adapted individually
   - Returns: DesignAlternatives with aggregated meta
   ↓
6. Analyze Feasibility (OpenAI)
   - openaiAdapter.adaptFeasibilityAnalysis(response, latencyMs)
   - Returns: FeasibilityAnalysis with meta
   ↓
7. Aggregate Results
   - Total cost = sum of all meta.costUsd
   - Total latency = generation end - start
   - Create aggregated meta
   ↓
8. Validate Result
   - validateDesignResult(result)
   - Log warnings if any
   ↓
9. Return DesignResult
   {
     success: true,
     reasoning: {..., meta},
     visualizations: {..., meta},
     alternatives: {..., meta},
     feasibility: {..., meta},
     meta: { // Aggregated
       source: 'ai-integration',
       latencyMs: 45000,
       costUsd: 1.23,
       timestamp: '2025-10-25T...'
     },
     workflow: 'complete',
     isFallback: false
   }
   ↓
10. orchestrator.completeGeneration(designResult)
    - Sets state to GENERATION_COMPLETE
    - Emits GENERATION_SUCCESS event
    - UI updates automatically
```

---

## Usage Examples

### Example 1: Using Adapters in Services

```javascript
// Before (inconsistent)
async generateDesignReasoning(projectContext) {
  const response = await fetch(OPENAI_API_URL, {...});
  const data = await response.json();
  return this.parseDesignReasoning(data.choices[0].message.content);
}

// After (with adapters)
import { post } from './apiClient.js';
import { adaptDesignReasoning } from './adapters/openaiAdapter.js';

async generateDesignReasoning(projectContext) {
  const startTime = Date.now();
  const response = await post('openai', '/chat', {...}, { timeout: 120000, retries: 2 });
  const latencyMs = Date.now() - startTime;

  return adaptDesignReasoning(response.data, latencyMs, {
    model: 'gpt-4',
    isFallback: false
  });
  // Returns: DesignReasoning with meta { costUsd, tokenUsage, latencyMs }
}
```

### Example 2: Subscribing to Workflow Events

```javascript
import { subscribeToWorkflow, WorkflowEvent } from '../services/workflowOrchestrator.js';

// In your React component
useEffect(() => {
  const unsubscribe = subscribeToWorkflow(WorkflowEvent.GENERATION_PROGRESS, (event) => {
    setProgress(event.data.percentage);
    setMessage(event.data.message);
  });

  return () => unsubscribe();
}, []);
```

### Example 3: Validating Data

```javascript
import { validateDesignResult, validateOrThrow } from '../domain/validators.js';

// Option 1: Soft validation (log warnings)
const validation = validateDesignResult(result);
if (!validation.valid) {
  console.warn('Validation issues:', validation.errors);
}

// Option 2: Hard validation (throw on error)
try {
  validateOrThrow(validateDesignResult, result, 'DesignResult');
} catch (error) {
  console.error('Validation failed:', error.validationErrors);
}
```

---

## Migration Guide

See `ADAPTER_INTEGRATION_GUIDE.md` for detailed migration instructions.

**Quick steps:**
1. Import adapters and config modules
2. Replace `process.env.*` with `getApiKey()`
3. Replace `fetch()` with `post()` or `get()`
4. Use adapter functions to normalize responses
5. Test that existing code still works
6. Gradually remove old code paths

---

## API Reference

### Full API documentation available in:
- `src/domain/dna.js` - Type definitions (40+ types)
- `src/domain/validators.js` - Validation functions
- `src/config/appConfig.js` - Configuration API
- `src/services/apiClient.js` - HTTP client API
- `src/services/adapters/openaiAdapter.js` - OpenAI adapter API
- `src/services/adapters/replicateAdapter.js` - Replicate adapter API
- `src/services/workflowOrchestrator.js` - Workflow API

---

**End of Design DNA Architecture Guide**
