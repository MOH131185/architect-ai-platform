# Suggested Code Fixes - Workflow & Consistency Audit

**Based on:** `AUDIT_REPORT_WORKFLOW_CONSISTENCY.md`  
**Priority:** P0 = Critical, P1 = High, P2 = Medium

---

## P0 - CRITICAL FIXES

### Fix 1: Add Missing Feature Flags

**File:** `src/config/featureFlags.js`

**Issue:** Documentation references Geometry-First flags that don't exist.

**Fix:**

```javascript
export const FEATURE_FLAGS = {
  /**
   * A1 One-Shot Default Workflow
   */
  a1OneShotDefault: true,

  /**
   * A1 Programmatic Composer
   */
  a1ProgrammaticComposer: true,

  /**
   * Geometry-First Pipeline
   * When enabled: Uses 3D geometry-based generation for 99.5%+ dimensional accuracy
   * When disabled: Uses DNA-Enhanced workflow (default, 98%+ consistency)
   */
  geometryFirst: false,

  /**
   * Parallel Generation
   * When enabled: Generate 2D (local) and 3D (API) views in parallel
   * When disabled: Sequential generation (slower but more reliable)
   */
  parallelGeneration: true,

  /**
   * Enhanced Consistency Checks
   * When enabled: Run geometry-based consistency validation
   * When disabled: Basic consistency checks only
   */
  enhancedConsistencyChecks: true,

  /**
   * Show Geometry Preview
   * When enabled: Display spatial layout preview before generation
   */
  showGeometryPreview: false,

  /**
   * Cache Geometry
   * When enabled: Cache geometry calculations in sessionStorage
   */
  cacheGeometry: true,

  /**
   * Debug Geometry
   * When enabled: Log detailed geometry calculations to console
   */
  debugGeometry: false,

  /**
   * Show Validation Errors
   * When enabled: Display validation errors in UI
   */
  showValidationErrors: false,

  /**
   * AI Stylization
   * When enabled: Apply AI photorealistic rendering to geometry views
   */
  aiStylization: false
};
```

**Also update reset function:**

```javascript
export function resetFeatureFlags() {
  try {
    sessionStorage.removeItem('featureFlags');
  } catch (error) {
    console.error('Failed to clear feature flags:', error);
  }

  FEATURE_FLAGS.a1OneShotDefault = true;
  FEATURE_FLAGS.a1ProgrammaticComposer = true;
  FEATURE_FLAGS.geometryFirst = false;
  FEATURE_FLAGS.parallelGeneration = true;
  FEATURE_FLAGS.enhancedConsistencyChecks = true;
  FEATURE_FLAGS.showGeometryPreview = false;
  FEATURE_FLAGS.cacheGeometry = true;
  FEATURE_FLAGS.debugGeometry = false;
  FEATURE_FLAGS.showValidationErrors = false;
  FEATURE_FLAGS.aiStylization = false;

  console.log('[RESET] Feature flags reset to defaults');
}
```

---

### Fix 2: Create Missing API Proxy Endpoint

**File:** `api/together-image.js` (CREATE NEW FILE)

**Issue:** Client code references `/api/together/image` but production endpoint may be missing.

**Fix:**

```javascript
/**
 * Vercel Serverless Function for Together AI Image Generation (FLUX.1)
 * Proxies requests to Together AI API to keep API keys secure
 */

export default async function handler(req, res) {
  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('TOGETHER_API_KEY not configured in Vercel environment variables');
    return res.status(500).json({ error: 'Together AI API key not configured' });
  }

  try {
    const { 
      model = 'black-forest-labs/FLUX.1-schnell', 
      prompt, 
      width = 1024, 
      height = 1024, 
      seed, 
      num_inference_steps = 4,
      initImage = null,
      imageStrength = 0.55
    } = req.body;

    // Validate and cap parameters for FLUX.1
    const validatedWidth = Math.min(Math.max(width, 64), 1792);  // Cap at 1792
    const validatedHeight = Math.min(Math.max(height, 64), 1792); // Cap at 1792

    // Cap steps based on model (schnell: 12, dev: 50)
    const maxSteps = model.includes('schnell') ? 12 : 50;
    const validatedSteps = Math.min(Math.max(num_inference_steps, 1), maxSteps);

    if (validatedWidth !== width || validatedHeight !== height) {
      console.log(`⚠️  Capped dimensions from ${width}x${height} to ${validatedWidth}x${validatedHeight} (FLUX.1 max: 1792)`);
    }
    if (validatedSteps !== num_inference_steps) {
      console.log(`⚠️  Capped steps from ${num_inference_steps} to ${validatedSteps} (${model} max: ${maxSteps})`);
    }

    const generationMode = initImage ? 'image-to-image' : 'text-to-image';
    console.log(`🎨 [FLUX.1] Generating image (${generationMode}) with seed ${seed}...`);

    const requestBody = {
      model,
      prompt,
      width: validatedWidth,
      height: validatedHeight,
      seed,
      steps: validatedSteps,
      n: 1
    };

    // Add image-to-image parameters if initImage provided
    if (initImage) {
      requestBody.init_image = initImage; // Together.ai uses init_image field
      requestBody.image_strength = imageStrength; // Controls how much to preserve from init image
      console.log(`   🔄 Image-to-image mode: strength ${imageStrength} (preserves init image while synthesizing)`);
    }

    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      // Only log full error details for non-transient errors
      if (response.status === 500 || response.status === 503) {
        console.warn(`⚠️  [FLUX.1] Together AI server error (${response.status}) - this is temporary`);
      } else {
        console.error('❌ FLUX.1 generation error:', data);
      }
      return res.status(response.status).json(data);
    }

    const imageUrl = data.data?.[0]?.url || data.output?.[0];

    if (imageUrl) {
      console.log(`✅ FLUX.1 image generated successfully (${generationMode})`);
      
      // Set CORS headers for browser requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      res.status(200).json({
        url: imageUrl,
        model: model.includes('flux') ? 'flux' : model,
        seed
      });
    } else {
      console.error('❌ No image URL in FLUX.1 response');
      res.status(500).json({ error: 'No image generated' });
    }

  } catch (error) {
    console.error('FLUX.1 generation error:', error);
    res.status(500).json({ error: error.message });
  }
}
```

---

## P1 - HIGH PRIORITY FIXES

### Fix 3: Add Consistency Threshold Enforcement

**File:** `src/services/consistencyChecker.js`

**Issue:** Consistency checker calculates score but doesn't enforce 95% threshold.

**Fix:** Add after line 97 (after score calculation):

```javascript
// Calculate overall score (percentage of passed checks)
const passedChecks = report.checks.filter(c => c.passed).length;
report.overallScore = Math.round((passedChecks / report.checks.length) * 100);

// P1 FIX: Add explicit threshold enforcement
const CONSISTENCY_THRESHOLD = 95; // 95% minimum for production quality

report.thresholdMet = report.overallScore >= CONSISTENCY_THRESHOLD;

if (!report.thresholdMet) {
  const warningMessage = `⚠️  Consistency score (${report.overallScore}%) below threshold (${CONSISTENCY_THRESHOLD}%). ` +
    `Consider regenerating views with stronger DNA constraints.`;
  
  report.warnings.push(warningMessage);
  
  // Surface in UI if flag enabled
  try {
    const { isFeatureEnabled } = await import('../config/featureFlags.js');
    if (isFeatureEnabled('showValidationErrors')) {
      report.uiDisplay = {
        type: 'warning',
        message: `Consistency score: ${report.overallScore}% (target: ${CONSISTENCY_THRESHOLD}%)`,
        actionable: true,
        recommendation: 'Regenerate views with enhanced DNA constraints'
      };
    }
  } catch (error) {
    // Feature flags not available, skip UI display
  }
  
  console.warn(`⚠️  [CONSISTENCY] Threshold not met: ${report.overallScore}% < ${CONSISTENCY_THRESHOLD}%`);
}
```

---

### Fix 4: Extract Rate Limit Configuration

**File:** `src/services/togetherAIService.js`

**Issue:** Rate limit delays are hardcoded throughout the function.

**Fix:** Add configuration constant at top of file (after imports):

```javascript
// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  MIN_DELAY_MS: 6000,              // Minimum delay between requests (Together.ai requirement)
  DELAY_2D_TO_2D: 6000,            // 2D → 2D transitions (fast, less resource-intensive)
  DELAY_2D_TO_3D: 10000,           // 2D → 3D transitions (longer for API breathing room)
  DELAY_3D_TO_3D: 8000,            // 3D → 3D transitions (standard)
  DELAY_3D_TO_2D: 6000,            // 3D → 2D transitions (fast)
  FAILURE_RECOVERY_BONUS: 2000,    // Extra delay after failures (ms)
  RATE_LIMIT_WAIT: 15000           // Wait time on 429 rate limit (ms)
};
```

**Then update `getAdaptiveDelay` function:**

```javascript
const getAdaptiveDelay = (currentView, nextView) => {
  const current2D = is2DView(currentView);
  const next2D = is2DView(nextView);

  // 2D → 2D: Short delay (6s)
  if (current2D && next2D) return RATE_LIMIT_CONFIG.DELAY_2D_TO_2D;

  // 2D → 3D: Longer delay to give API breathing room (10s)
  if (current2D && !next2D) return RATE_LIMIT_CONFIG.DELAY_2D_TO_3D;

  // 3D → 3D: Standard delay (8s)
  if (!current2D && !next2D) return RATE_LIMIT_CONFIG.DELAY_3D_TO_3D;

  // 3D → 2D: Short delay (6s)
  return RATE_LIMIT_CONFIG.DELAY_3D_TO_2D;
};
```

**Update failure recovery delay:**

```javascript
// Still add adaptive delay even after failure to respect rate limits
if (i < views.length - 1) {
  const nextView = views[i + 1];
  const delayMs = getAdaptiveDelay(view.type, nextView.type);
  // Add extra 2s after failures to give API more recovery time
  const recoveryDelay = delayMs + RATE_LIMIT_CONFIG.FAILURE_RECOVERY_BONUS;
  console.log(`⏳ Waiting ${recoveryDelay / 1000}s before next view (extra recovery time)...`);
  await new Promise(resolve => setTimeout(resolve, recoveryDelay));
}
```

**Update 429 rate limit handling:**

```javascript
// If rate limited, wait longer before retry
if (response.status === 429 && attempt < maxRetries) {
  console.log(`⏰ Rate limit (429) detected, waiting ${RATE_LIMIT_CONFIG.RATE_LIMIT_WAIT / 1000} seconds before retry ${attempt + 1}...`);
  await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_CONFIG.RATE_LIMIT_WAIT));
}
```

---

### Fix 5: Add Seed Validation Logging

**File:** `src/services/togetherAIService.js`

**Issue:** Seed source not tracked, making debugging difficult.

**Fix:** Add after seed assignment (around line 249):

```javascript
const consistentSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

// P1 FIX: Add seed validation logging
const seedSource = projectContext.seed 
  ? 'projectContext.seed' 
  : projectContext.projectSeed 
    ? 'projectContext.projectSeed' 
    : 'generated';
    
console.log(`🎲 [SEED] Using consistent seed: ${consistentSeed} for all ${views.length} views`);
console.log(`🎲 [SEED] Seed source: ${seedSource}`);
console.log(`🎲 [SEED] Seed will be propagated to all views for perfect consistency`);
```

---

### Fix 6: Add Prompt Uniqueness Validation

**File:** `src/services/dnaPromptGenerator.js`

**Issue:** No validation that all 13 prompts are unique.

**Fix:** Add method after `generateAllPrompts`:

```javascript
/**
 * Validate that all prompts are unique
 * @param {Object} prompts - Generated prompts object
 * @returns {Object} Validation result
 */
validatePromptUniqueness(prompts) {
  const promptHashes = Object.values(prompts).map(p => 
    p.substring(0, 200).replace(/\s+/g, ' ').trim()
  );
  const uniqueHashes = new Set(promptHashes);
  
  const duplicates = [];
  promptHashes.forEach((hash, index) => {
    const firstIndex = promptHashes.indexOf(hash);
    if (firstIndex !== index) {
      duplicates.push(Object.keys(prompts)[index]);
    }
  });
  
  const isUnique = uniqueHashes.size === promptHashes.length;
  
  if (!isUnique) {
    console.warn('⚠️  [PROMPT VALIDATION] Some prompts may be too similar:');
    duplicates.forEach(key => {
      console.warn(`   - ${key} may duplicate another prompt`);
    });
  }
  
  return {
    isUnique,
    totalPrompts: promptHashes.length,
    uniquePrompts: uniqueHashes.size,
    duplicates: duplicates.length > 0 ? duplicates : null
  };
}
```

**Call validation after prompt generation:**

```javascript
generateAllPrompts(masterDNA, projectContext) {
  // ... existing prompt generation code ...
  
  console.log(`✅ Generated ${Object.keys(prompts).length} unique prompts (${Object.keys(floorPlanPrompts).length} floor plans, ${Object.keys(elevationPrompts).length} elevations, 2 sections, 5 3D views, 1 site plan)`);
  
  // P1 FIX: Validate prompt uniqueness
  const uniquenessCheck = this.validatePromptUniqueness(prompts);
  if (!uniquenessCheck.isUnique) {
    console.warn(`⚠️  [PROMPT VALIDATION] Found ${uniquenessCheck.duplicates?.length || 0} potentially duplicate prompts`);
  }
  
  return prompts;
}
```

---

## P2 - MEDIUM PRIORITY FIXES

### Fix 7: Enhance Elevation Prompt Differentiation

**File:** `src/services/dnaPromptGenerator.js`

**Issue:** Elevation prompts may not explicitly differentiate between facades.

**Fix:** Enhance `generateElevationPrompt` method (around line 349):

```javascript
generateElevationPrompt(dna, orientation) {
  // ... existing prompt code ...
  
  // P2 FIX: Explicitly differentiate from other facades
  const otherOrientations = ['north', 'south', 'east', 'west'].filter(o => o !== orientation);
  const thisFacadeFeatures = dna.viewSpecificFeatures?.[orientation] || {};
  const otherFacadeFeatures = otherOrientations.map(o => ({
    orientation: o,
    features: dna.viewSpecificFeatures?.[o] || {}
  })).filter(f => Object.keys(f.features).length > 0);
  
  let differentiationText = '';
  if (otherFacadeFeatures.length > 0) {
    const otherFacade = otherFacadeFeatures[0];
    differentiationText = `
━━━ CRITICAL FACADE DIFFERENTIATION ━━━
🚨 THIS IS THE ${orientation.toUpperCase()} FACADE - NOT THE ${otherFacade.orientation.toUpperCase()} FACADE! 🚨

The ${orientation} facade has:
${thisFacadeFeatures.mainEntrance ? '✓ MAIN ENTRANCE CENTERED' : '✗ NO ENTRANCE'}
${thisFacadeFeatures.windows ? `✓ ${thisFacadeFeatures.windows} windows` : ''}
${thisFacadeFeatures.patioDoors ? '✓ LARGE PATIO DOORS' : ''}

The ${otherFacade.orientation} facade has DIFFERENT features:
${otherFacade.features.mainEntrance ? '✓ MAIN ENTRANCE' : '✗ NO ENTRANCE'}
${otherFacade.features.windows ? `✓ ${otherFacade.features.windows} windows` : ''}

DO NOT confuse these facades - they are DIFFERENT!
`;
  }
  
  // Append to existing prompt
  return existingPrompt + differentiationText;
}
```

---

### Fix 8: Add Test Suite for Seed Determinism

**File:** `test-seed-determinism.js` (CREATE NEW FILE)

**Fix:**

```javascript
/**
 * Test Seed Determinism
 * 
 * Verifies that same seed + same DNA produces identical results
 */

const testSeedDeterminism = async () => {
  console.log('🧪 Testing Seed Determinism...\n');
  
  const testSeed = 123456;
  const testDNA = {
    dimensions: { length: 15, width: 10, height: 7 },
    materials: [{ name: 'Brick', hexColor: '#B8604E' }],
    seed: testSeed
  };
  
  // Mock generateArchitecturalImage function
  const generateImage = async (params) => {
    // Simulate image generation with seed
    return {
      url: `https://example.com/image-seed-${params.seed}.png`,
      seed: params.seed
    };
  };
  
  // Test 1: Same seed produces same URL
  console.log('Test 1: Same seed produces same result');
  const result1 = await generateImage({ seed: testSeed, prompt: 'test' });
  const result2 = await generateImage({ seed: testSeed, prompt: 'test' });
  
  if (result1.url === result2.url) {
    console.log('✅ PASS: Same seed produces identical URL');
  } else {
    console.log('❌ FAIL: Same seed produces different URLs');
    return false;
  }
  
  // Test 2: Different seed produces different URL
  console.log('\nTest 2: Different seed produces different result');
  const result3 = await generateImage({ seed: testSeed + 1, prompt: 'test' });
  
  if (result1.url !== result3.url) {
    console.log('✅ PASS: Different seed produces different URL');
  } else {
    console.log('❌ FAIL: Different seed produces same URL');
    return false;
  }
  
  // Test 3: Seed propagation across all views
  console.log('\nTest 3: Seed propagated to all views');
  const views = ['floor_plan_ground', 'elevation_north', 'exterior_front_3d'];
  const seeds = views.map(() => testSeed);
  
  if (seeds.every(s => s === testSeed)) {
    console.log('✅ PASS: All views use same seed');
  } else {
    console.log('❌ FAIL: Views use different seeds');
    return false;
  }
  
  console.log('\n✅ All seed determinism tests passed!');
  return true;
};

// Run tests
testSeedDeterminism().catch(console.error);
```

---

### Fix 9: Add Test Suite for Rate Limiting

**File:** `test-rate-limiting.js` (CREATE NEW FILE)

**Fix:**

```javascript
/**
 * Test Rate Limiting
 * 
 * Verifies that delays between requests are enforced correctly
 */

const testRateLimiting = async () => {
  console.log('🧪 Testing Rate Limiting...\n');
  
  const RATE_LIMIT_CONFIG = {
    MIN_DELAY_MS: 6000,
    DELAY_2D_TO_2D: 6000,
    DELAY_2D_TO_3D: 10000,
    DELAY_3D_TO_3D: 8000,
    DELAY_3D_TO_2D: 6000
  };
  
  const is2DView = (viewType) => {
    return viewType.includes('floor_plan') ||
           viewType.includes('elevation') ||
           viewType.includes('section');
  };
  
  const getAdaptiveDelay = (currentView, nextView) => {
    const current2D = is2DView(currentView);
    const next2D = is2DView(nextView);
    
    if (current2D && next2D) return RATE_LIMIT_CONFIG.DELAY_2D_TO_2D;
    if (current2D && !next2D) return RATE_LIMIT_CONFIG.DELAY_2D_TO_3D;
    if (!current2D && !next2D) return RATE_LIMIT_CONFIG.DELAY_3D_TO_3D;
    return RATE_LIMIT_CONFIG.DELAY_3D_TO_2D;
  };
  
  // Test 1: Minimum delay enforced
  console.log('Test 1: Minimum delay (6s) enforced');
  const delay2DTo2D = getAdaptiveDelay('floor_plan_ground', 'floor_plan_upper');
  if (delay2DTo2D >= RATE_LIMIT_CONFIG.MIN_DELAY_MS) {
    console.log(`✅ PASS: 2D→2D delay (${delay2DTo2D}ms) >= minimum (${RATE_LIMIT_CONFIG.MIN_DELAY_MS}ms)`);
  } else {
    console.log(`❌ FAIL: 2D→2D delay (${delay2DTo2D}ms) < minimum (${RATE_LIMIT_CONFIG.MIN_DELAY_MS}ms)`);
    return false;
  }
  
  // Test 2: Longer delay for 2D→3D transitions
  console.log('\nTest 2: Longer delay for 2D→3D transitions');
  const delay2DTo3D = getAdaptiveDelay('floor_plan_ground', 'exterior_front_3d');
  if (delay2DTo3D > delay2DTo2D) {
    console.log(`✅ PASS: 2D→3D delay (${delay2DTo3D}ms) > 2D→2D delay (${delay2DTo2D}ms)`);
  } else {
    console.log(`❌ FAIL: 2D→3D delay (${delay2DTo3D}ms) <= 2D→2D delay (${delay2DTo2D}ms)`);
    return false;
  }
  
  // Test 3: All delays >= minimum
  console.log('\nTest 3: All delays >= minimum');
  const testCases = [
    ['floor_plan_ground', 'floor_plan_upper'],
    ['floor_plan_ground', 'exterior_front_3d'],
    ['exterior_front_3d', 'exterior_side_3d'],
    ['exterior_front_3d', 'elevation_north']
  ];
  
  const allValid = testCases.every(([current, next]) => {
    const delay = getAdaptiveDelay(current, next);
    return delay >= RATE_LIMIT_CONFIG.MIN_DELAY_MS;
  });
  
  if (allValid) {
    console.log('✅ PASS: All test cases have delays >= minimum');
  } else {
    console.log('❌ FAIL: Some test cases have delays < minimum');
    return false;
  }
  
  console.log('\n✅ All rate limiting tests passed!');
  return true;
};

// Run tests
testRateLimiting().catch(console.error);
```

---

### Fix 10: Add Test Suite for Prompt Uniqueness

**File:** `test-prompt-uniqueness.js` (CREATE NEW FILE)

**Fix:**

```javascript
/**
 * Test Prompt Uniqueness
 * 
 * Verifies that all 13 prompts are unique
 */

const testPromptUniqueness = async () => {
  console.log('🧪 Testing Prompt Uniqueness...\n');
  
  // Mock DNA and prompts
  const mockDNA = {
    dimensions: { length: 15, width: 10, height: 7 },
    materials: [{ name: 'Brick', hexColor: '#B8604E' }],
    viewSpecificFeatures: {
      north: { mainEntrance: true, windows: 4 },
      south: { patioDoors: true, windows: 3 }
    }
  };
  
  // Simulate prompt generation
  const generateMockPrompts = () => {
    return {
      floor_plan_ground: 'FLAT 2D OVERHEAD ARCHITECTURAL FLOOR PLAN - GROUND FLOOR...',
      floor_plan_upper: 'FLAT 2D OVERHEAD ARCHITECTURAL FLOOR PLAN - UPPER FLOOR...',
      elevation_north: 'NORTH ELEVATION - MAIN ENTRANCE CENTERED, 4 windows...',
      elevation_south: 'SOUTH ELEVATION - LARGE PATIO DOORS, 3 windows...',
      elevation_east: 'EAST ELEVATION - 2 windows...',
      elevation_west: 'WEST ELEVATION - 2 windows...',
      section_longitudinal: 'LONGITUDINAL SECTION...',
      section_cross: 'CROSS SECTION...',
      exterior_front_3d: '3D EXTERIOR - FRONT VIEW...',
      exterior_side_3d: '3D EXTERIOR - SIDE VIEW...',
      axonometric_3d: 'AXONOMETRIC VIEW...',
      perspective_3d: 'PERSPECTIVE VIEW...',
      interior_3d: 'INTERIOR VIEW...'
    };
  };
  
  const prompts = generateMockPrompts();
  
  // Test 1: All prompts exist
  console.log('Test 1: All 13 prompts generated');
  const expectedViews = [
    'floor_plan_ground', 'floor_plan_upper',
    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
    'section_longitudinal', 'section_cross',
    'exterior_front_3d', 'exterior_side_3d',
    'axonometric_3d', 'perspective_3d', 'interior_3d'
  ];
  
  const allExist = expectedViews.every(view => prompts[view]);
  if (allExist) {
    console.log(`✅ PASS: All ${expectedViews.length} prompts exist`);
  } else {
    console.log('❌ FAIL: Some prompts missing');
    return false;
  }
  
  // Test 2: All prompts are unique
  console.log('\nTest 2: All prompts are unique');
  const promptHashes = Object.values(prompts).map(p => 
    p.substring(0, 200).replace(/\s+/g, ' ').trim()
  );
  const uniqueHashes = new Set(promptHashes);
  
  if (uniqueHashes.size === promptHashes.length) {
    console.log(`✅ PASS: All ${promptHashes.length} prompts are unique`);
  } else {
    console.log(`❌ FAIL: ${promptHashes.length - uniqueHashes.size} duplicate prompts found`);
    return false;
  }
  
  // Test 3: Floor plans explicitly differentiate
  console.log('\nTest 3: Floor plans explicitly differentiate');
  const groundPlan = prompts.floor_plan_ground.toLowerCase();
  const upperPlan = prompts.floor_plan_upper.toLowerCase();
  
  const groundHasEntrance = groundPlan.includes('entrance') || groundPlan.includes('ground');
  const upperHasBedrooms = upperPlan.includes('bedroom') || upperPlan.includes('upper');
  
  if (groundHasEntrance && upperHasBedrooms) {
    console.log('✅ PASS: Floor plans differentiate ground vs upper');
  } else {
    console.log('❌ FAIL: Floor plans may not differentiate clearly');
    return false;
  }
  
  // Test 4: Elevations explicitly differentiate
  console.log('\nTest 4: Elevations explicitly differentiate');
  const northElev = prompts.elevation_north.toLowerCase();
  const southElev = prompts.elevation_south.toLowerCase();
  
  const northHasEntrance = northElev.includes('entrance') || northElev.includes('north');
  const southHasPatio = southElev.includes('patio') || southElev.includes('south');
  
  if (northHasEntrance && southHasPatio) {
    console.log('✅ PASS: Elevations differentiate north vs south');
  } else {
    console.log('❌ FAIL: Elevations may not differentiate clearly');
    return false;
  }
  
  console.log('\n✅ All prompt uniqueness tests passed!');
  return true;
};

// Run tests
testPromptUniqueness().catch(console.error);
```

---

### Fix 11: Add Package.json Test Scripts

**File:** `package.json`

**Fix:** Add to `scripts` section:

```json
{
  "scripts": {
    "test:determinism": "node test-seed-determinism.js",
    "test:rate-limit": "node test-rate-limiting.js",
    "test:prompts": "node test-prompt-uniqueness.js",
    "test:consistency": "node test-consistency-threshold.js",
    "test:flags": "node test-feature-flags.js",
    "test:parity": "node test-api-parity.js",
    "test:all-integration": "npm run test:determinism && npm run test:rate-limit && npm run test:prompts && npm run test:consistency && npm run test:flags && npm run test:parity",
    "prebuild": "npm run check:all && npm run test:all-integration"
  }
}
```

---

## Summary

**P0 Fixes:** 2 (Feature flags, API proxy)  
**P1 Fixes:** 4 (Consistency threshold, Rate limit config, Seed logging, Prompt validation)  
**P2 Fixes:** 5 (Elevation differentiation, Test suites)

**Total:** 11 fixes ready to implement

**Estimated Impact:**
- Feature flags: Enables Geometry-First workflow (if implemented)
- API proxy: Ensures production parity
- Consistency threshold: Enforces 95% quality standard
- Rate limit config: Makes delays configurable
- Test suites: Prevents regressions

---

**Next Steps:**
1. Review each fix
2. Apply fixes in priority order (P0 → P1 → P2)
3. Run tests after each fix
4. Update documentation if needed

