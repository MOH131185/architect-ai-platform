# CLAUDE.md - Trimmed

This file provides guidance to Claude Code when working with this repository.

## Development Commands

### Core Development

- `npm start` - React dev server (localhost:3000)
- `npm run server` - Express proxy (localhost:3001) **REQUIRED for API proxying**
- `npm run dev` - Both concurrently (recommended)
- `npm run build` - Production build
- `npm test` - Test suite

### Validation & Deployment

- `npm run check:env` - Verify environment variables
- `npm run check:contracts` - Validate service contracts
- `npm run check:all` - Run both checks (auto before build)
- Auto-deploys to Vercel on push to main

## Architecture Overview

**A1-ONLY architecture** with AI Modify capabilities. Single comprehensive UK RIBA-standard A1 sheet output (1792×1269px).

**Key Stack:**

- Together.ai FLUX.1-dev for A1 sheet generation
- Together.ai Qwen 2.5 72B for architectural reasoning
- Together.ai exclusively (legacy providers removed)

**Consistency**: 98%+ with DNA-Enhanced, 99.5%+ with optional Geometry-First pipeline

### A1 Sheet Workflow (Default)

**Flow:**

1. Two-Pass DNA Generation (Qwen) → structured JSON with site, program, style, geometry
2. DNA validation → realistic dimensions & consistency
3. A1 Sheet Prompt Generation → single comprehensive RIBA-standard prompt
4. FLUX.1-dev generates A1 sheet (includes plans, elevations, sections, 3D views, title block)
5. Design saved with seed and DNA for AI Modify workflow

**AI Modify Workflow:**

1. User requests modifications (UI quick toggles or custom prompts)
2. System applies consistency lock using original DNA + same seed
3. Re-generate A1 with delta prompt
4. pHash/SSIM validation ensures unchanged elements remain identical
5. Version saved with consistency score

**Generation Time**: ~60 seconds A1 sheet, ~60 seconds per modification

### Application Structure

**Entry**: `src/App.js` → `src/components/ArchitectAIWizardContainer.jsx`

7-step wizard:

1. Landing Page
2. Location Analysis (address + site boundary)
3. Intelligence Report (climate, zoning, recommendations, 3D map)
4. Portfolio Upload (70% portfolio / 30% local styles)
5. Project Specifications (building type, area, program spaces)
6. AI Generation (single A1 sheet)
7. Results & AI Modify (A1 viewer + modification panel)

### Core Services

**Design DNA Pipeline** (`src/services/`):

- `enhancedDNAGenerator.js` - Two-pass DNA with Pass A (author) + Pass B (reviewer)
- `dnaValidator.js` - Validates dimensions, materials, consistency
- `a1SheetPromptGenerator.js` - Creates comprehensive RIBA-standard prompt
- `dnaWorkflowOrchestrator.js` - Orchestrates complete pipeline
- `consistencyChecker.js` - Post-generation validation

**AI Integration** (`src/services/`):

- `togetherAIService.js` - **PRIMARY** FLUX.1-dev + Qwen reasoning
- `togetherAIReasoningService.js` - Specialized Qwen integration
- `multiModelImageService.js` - FLUX image generation wrapper

**AI Modification** (`src/services/`):

- `aiModificationService.js` - `modifyA1Sheet()` with consistency lock
- `sheetConsistencyGuard.js` - pHash/SSIM validation
- `AIModifyPanel.jsx` - React UI component

**Location Intelligence** (`src/services/`):

- `locationIntelligence.js` - Zoning detection & style recommendations
- `siteAnalysisService.js` - Site boundary detection
- `climateResponsiveDesignService.js` - Climate-specific design
- `enhancedPortfolioService.js` - Portfolio style extraction

**Geometry-First Pipeline** (optional, `src/geometry/`, `src/core/`):

- `spatialLayoutAlgorithm.js` - DNA to precise 3D layouts
- `geometryBuilder.js` - Three.js geometry construction
- `validators.ts` - 50+ architectural validation rules
- Note: Experimental (not default), tests may fail

### API Architecture

**Development** (`server.cjs` - Express proxy on port 3001):

- `/api/together/chat` - Qwen reasoning
- `/api/together/image` - FLUX image generation

**Production** (Vercel):

- `api/together-chat.js` - Qwen proxy
- `api/together-image.js` - FLUX proxy
- `api/render.js` - Geometry rendering (optional)
- `api/plan.js` - DNA generation (optional)
- `api/sheet.js` - A1 sheet export (optional)

### Environment Variables

**Required**:

- `TOGETHER_API_KEY` - **PRIMARY** (Build Tier 2+ required, add $5-10 credits)
- `REACT_APP_GOOGLE_MAPS_API_KEY` - Geocoding & 3D map display
- `REACT_APP_OPENWEATHER_API_KEY` - Climate data

**Optional**:

- `OPENAI_REASONING_API_KEY` - GPT-4 fallback (Together.ai is primary)

Run `npm run check:env` to verify.

### Feature Flags

Location: `src/config/featureFlags.js` (persist in sessionStorage)

Key flags:
| Flag | Default | Purpose |
|------|---------|---------|
| `geometryVolumeFirst` | `false` | Enable Geometry-First (99.5% vs 98% accuracy) |
| `showGeometryPreview` | `false` | Display spatial layout preview |
| `cacheGeometry` | `true` | Cache geometry calculations |
| `enhancedConsistencyChecks` | `true` | Geometry-based validation |

Usage:

```javascript
import { isFeatureEnabled, setFeatureFlag } from "./src/config/featureFlags";
if (isFeatureEnabled("geometryVolumeFirst")) {
  /* ... */
}
setFeatureFlag("geometryVolumeFirst", true);
```

## Design DNA System

**Problem**: Early versions had 70% consistency (different colors, windows, dimensions). DNA system solves this.

**Two-Pass DNA Generation**:

**Pass A (Author)** - Qwen2.5-72B generates structured JSON:

```
{
  site: { polygon, area, orientation, climate, wind },
  program: { floors, rooms with exact areas/orientations },
  style: { architecture type, materials, window patterns },
  geometry_rules: { grid, roof type, structural specs }
}
```

Temperature: 0.3 (consistency)

**Pass B (Reviewer)** - Validates, repairs, ensures completeness
Temperature: 0.1 (deterministic)

**NO Fallback**: Errors surfaced to user for retry (ensures complete DNA)

**How Consistency Works**:

1. DNA extracts EXACT specifications (dimensions, materials, room layouts, window patterns)
2. A1 prompt embeds full DNA JSON for consistency
3. Seed derivation: `panelSeed[i] = hash(DNA) + i*137`
4. Same seed + same specs = consistent rendering
5. pHash/SSIM validation post-generation

**Metrics**: 70% → 98%+ consistency (material, color, dimensions, windows, overall)

## Geometry-First Pipeline (Optional)

⚠️ **EXPERIMENTAL**: Partially implemented. Use DNA-Enhanced (default) for production.

When enabled, adds Pass C (3D Volume Specification):

- Qwen generates massing strategy, roof type, facade organization
- Used for img2img conditioning with Together.ai
- Local 2D views render from Three.js geometry (no API cost)
- **Benefits**: 99.5% accuracy, ~2 min generation, parallel processing, SVG output
- **Trade-offs**: Complex codebase, requires Three.js, less flexible for non-standard forms

Test: `node test-geometry-first-local.js` (49 tests)

## Key Integration Points

**Location Intelligence Flow**:

1. Browser geolocation or address input
2. Google Geocoding → coordinates
3. OpenWeather → 4-season climate data
4. `locationIntelligence.js` → zoning & style recommendations
5. `globalArchitecturalDatabase.js` → local styles
6. Optional: User draws site boundary via `SitePolygonDrawer`
7. Returns: complete location profile (climate, zoning, styles, market)

**AI Generation Flow**:

1. Two-Pass DNA Generation (Qwen)
2. DNA Validation → realistic dimensions
3. Seed derivation from DNA hash
4. Panel generation (13-14 sequential: 3D, site, plans, elevations, sections)
5. Each prompt embeds DNA JSON + view-specific features
6. FLUX.1-dev (3D panels) + FLUX.1-schnell (2D technical panels)
7. Server-side A1 composition at `/api/a1/compose`
8. Design saved to IndexedDB with seed map & DNA

**Generation Time**: ~5-6 minutes complete A1 (with optional geometry volume)

## Common Issues & Fixes

**Only 2 views generate**:

- Cause: Rate limiting (6-second delays required)
- Fix: Check `togetherAIService.js:337` has `delayMs = 6000`
- Action: Wait 60 seconds before retry
- Test: `node test-together-api-connection.js`

**No views generate**:

- Cause: Express server not running or API key missing
- Fix: `npm run server` in separate terminal
- Verify: `.env` has `TOGETHER_API_KEY=tgp_v1_...`
- Check: Browser console shows proxy requests to `localhost:3001`

**Views inconsistent (different colors/materials)**:

- Cause: Legacy workflow bypassing DNA system
- Fix: Verify `useArchitectAIWorkflow.js` routes through `dnaWorkflowOrchestrator`
- Check: Master DNA generates BEFORE images

**Geometry-First fails**:

- Cause: Spatial validation or Three.js errors
- Fix: Check console for validation errors
- Test: `node test-geometry-first-local.js`
- Fallback: System auto-reverts to DNA-Enhanced
- Debug: Enable `debugGeometry: true` flag

**A1 sheet looks like placeholder/grid**:

- Cause: Weak prompt overridden by placeholder aesthetic
- Fix: Verify `a1SheetPromptGenerator.js` has strong negative prompts
- Check: Resolution 1792×1269, guidance scale 7.8
- Verify: Style blending enabled

**"Insufficient credits" (Together.ai)**:

- Cause: Free tier doesn't support FLUX
- Fix: Add $5-10 credits at https://api.together.ai/settings/billing
- Note: Together.ai is primary (legacy fallbacks removed)

**Floor plans show 3D perspective**:

- Cause: Prompt not explicit about 2D overhead
- Check: `dnaPromptGenerator.js` includes "TRUE OVERHEAD ORTHOGRAPHIC"
- Verify: Negative prompts avoid "(perspective:1.5), (3D:1.5), (isometric:1.5)"

**Elevations all look the same**:

- Cause: View-specific features missing from DNA
- Fix: Verify Master DNA has unique `viewSpecificFeatures` per orientation
- Check: Each elevation prompt has DIFFERENT features

**Generation stuck > 3 min (DNA-Enhanced)**:

- Monitor: Check console for retry attempts
- Action: If stuck > 30s on one view, API may be down
- Check: Together.ai status page

**Site polygon drawing not working**:

- Cause: Google Maps API key missing or quota exceeded
- Fix: Verify `REACT_APP_GOOGLE_MAPS_API_KEY` set
- Check: Browser console for Google Maps errors

## Testing

```bash
node test-a1-modify-consistency.js         # A1 modify workflow (11 tests)
node test-clinic-a1-generation.js          # Clinic A1 generation
node test-together-api-connection.js       # Together.ai connectivity
node test-geometry-first-local.js          # Geometry-First suite (49 tests)
npm test                                    # Jest unit tests (interactive)
npm run test:coverage                       # With coverage report
```

## Data Persistence

**Storage Manager** (`src/utils/storageManager.js`):

- Handles localStorage with quota management
- Arrays wrapped as `{ _data: [...], _timestamp: ... }`
- Objects stored with spread: `{ ...obj, _timestamp: ... }`
- Auto-cleanup removes oldest 20% when quota exceeded

**Design History**:

- Key: `archiAI_design_history`
- Includes compressed DNA, seed maps, panel metadata
- Automatic migration repairs corrupted data

**Known Issue - FIXED**: Arrays converted to objects with numeric keys. Fixed by wrapping arrays in `{ _data }` instead of spreading. See `A1_MODIFY_STORAGE_FIX.md`.

## Architecture Decisions

**Why Two Architectures?**

- DNA-Enhanced (default): 98% consistency, photorealistic, simple
- Geometry-First (optional): 99.5% accuracy, faster, site-aware, complex

**Why A1 Sheet Workflow?**

- Single professional output vs 13 individual images
- Reduced API costs (1 call vs 13)
- Better for portfolio presentation & client review
- Matches real-world architectural delivery (A1 standard)

**When to Use Each**:

- **DNA-Enhanced**: General design, photorealistic, standard projects (default)
- **Geometry-First**: Engineering, dimensional verification, custom constraints
- **A1 Sheet**: Client presentations, portfolio, final deliverables

## Critical Development Notes

**Rate Limiting - CRITICAL**:

- Together.ai FLUX requires 6-second delays between requests
- Location: `togetherAIService.js:337` (`delayMs = 6000`)
- Reducing below 6s causes 429 errors (only 2/13 views generate)
- Complete generation: ~3 minutes (13 views × 6s + processing)

**Performance Considerations**:

- Google Maps can cause re-render loops (careful dependency arrays)
- DNA generation via Qwen: 10-15 seconds
- Geometry-First 3D: 5-10 seconds
- Failed generations: Wait 60s before retry to avoid rate limit blocks

**API Costs** (Together.ai only):

- DNA-Enhanced: ~$0.15-$0.23 per design (64% cheaper than legacy)
- Geometry-First: ~$0.07-$0.11 per design (89% cheaper than legacy)
- A1 Sheet: ~$0.05-$0.07 (1 DNA + 1 high-res sheet)

**State Management**: React hooks (useState, useEffect, useCallback, useRef)

- Memoize callbacks to prevent unnecessary re-renders
- Use useRef for state that shouldn't trigger renders

**Error Handling**: ErrorBoundary wraps wizard container

- Together.ai failure: Error message (no fallback, primary provider)
- Google Maps: Fallback to San Francisco if geocoding fails
- OpenWeather: Mock data if API fails
- Geometry-First: Falls back to DNA-Enhanced if geometry fails

## Key Files to Know

**Core Workflow**:

- `src/App.js` → `src/components/ArchitectAIWizardContainer.jsx`
- `src/hooks/useArchitectAIWorkflow.js` - Main orchestration
- `src/services/dnaWorkflowOrchestrator.js` - Pipeline coordination

**A1 Generation**:

- `src/services/enhancedDNAGenerator.js` - Two-pass DNA (850 lines)
- `src/services/dnaValidator.js` - DNA validation
- `src/services/a1SheetPromptGenerator.js` - RIBA prompts
- `src/services/togetherAIService.js` - FLUX + Qwen (primary)

**A1 Modify**:

- `src/services/aiModificationService.js` - `modifyA1Sheet()` with lock
- `src/services/sheetConsistencyGuard.js` - pHash/SSIM validation
- `src/services/designHistoryService.js` - Versioning
- `src/components/AIModifyPanel.jsx` - UI component

**Geometry-First** (optional):

- `src/geometry/spatialLayoutAlgorithm.js` - DNA → 3D layouts
- `src/geometry/geometryBuilder.js` - Three.js construction
- `src/core/validators.ts` - 50+ validation rules
- `src/core/designSchema.ts` - Type-safe schema

**API Infrastructure**:

- `server.cjs` - Dev proxy (port 3001) **REQUIRED**
- `api/together-chat.js` - Prod Qwen proxy
- `api/together-image.js` - Prod FLUX proxy
- `scripts/check-env.js` - Env validation
- `scripts/check-contracts.js` - Contract validation
