# A1 Sheet Generation - Timing Diagnostic

## Expected Timing (A1-Only Mode)

### Normal Generation Flow

```
STEP 1: Generate Master DNA
├─ Together.ai Qwen 2.5 72B reasoning
├─ Expected: 10-15 seconds
└─ Output: Master DNA with exact specifications

STEP 2: Validate DNA
├─ Local validation (no API calls)
├─ Expected: <1 second
└─ Output: Validated DNA or auto-fixed DNA

STEP 3: Build Prompt
├─ Local prompt construction
├─ Expected: <1 second
└─ Output: Strict A1 prompt with consistency locks

STEP 4: Generate Image (A1_ARCH_FINAL preset)
├─ Together.ai FLUX.1-dev (48 steps, 1792×1269)
├─ Expected: 45-60 seconds
└─ Output: Single A1 sheet image

STEP 5: Validate Result
├─ Local validation
├─ Expected: <1 second
└─ Output: Validation report

TOTAL EXPECTED: 60-75 seconds
```

### If Taking Longer Than 2 Minutes

**Possible Causes**:

1. **Wrong Workflow** (13-view mode instead of A1-only)
2. **API Latency** (Together.ai slow response)
3. **Rate Limiting** (429 errors, retries)
4. **DNA Generation Timeout** (Qwen taking too long)
5. **Network Issues** (slow connection to Together.ai)

---

## Diagnostic Steps

### 1. Check Browser Console

Open browser DevTools (F12) and look for:

**Expected Logs** (A1-only mode):
```
🧬 STEP 1: Generating Master DNA
⏱️ DNA generation took 12.5s
🔍 STEP 2: Validating DNA
✅ DNA validated
📝 STEP 3: Building prompt
⚙️ Using A1_ARCH_FINAL preset (steps: 48, cfg: 7.8)
🎨 STEP 4: Generating image with A1_ARCH_FINAL preset
⏱️ Image generation took 52.3s
✅ STEP 5: Validating result
✅ A1 sheet workflow complete (total: 67s)
```

**Warning Signs** (13-view mode):
```
🎨 Generating view 1/13: Floor Plan Ground...
⏳ Waiting 6s before next view...
🎨 Generating view 2/13: Floor Plan First...
⏳ Waiting 6s before next view...
[... continues for 13 views]
```

If you see "13 views", you're in the **wrong workflow**!

### 2. Check Which Service is Being Called

**Look for these in console**:

✅ **Correct (A1-only)**:
```
pureOrchestrator.runA1SheetWorkflow()
togetherAIClient.generateA1SheetImage()
Single image request
```

❌ **Wrong (13-view)**:
```
togetherAIService.generateConsistentArchitecturalPackage()
Multiple image requests (13 total)
6-10 second delays between each
```

### 3. Check API Proxy

**Development** (localhost:3001):
```bash
# Check if server is running
curl http://localhost:3001/api/together/image
# Should return: {"error": "Method not allowed"} or similar

# Check server logs in terminal running `npm run server`
# Should show POST requests to /api/together/image
```

**Production** (Vercel):
```
# Vercel serverless functions handle API calls
# Check Vercel logs for /api/together-image
```

### 4. Check Together.ai API Status

**Rate Limiting**:
```
If you see:
⏱️ Rate limiting: waiting 6000ms before flux-image
⏱️ Rate limiting: waiting 6000ms before flux-image
⏱️ Rate limiting: waiting 6000ms before flux-image

This means MULTIPLE requests are being made!
Should only see ONE rate limit wait for A1-only mode.
```

**429 Errors**:
```
If you see:
❌ HTTP 429: Too Many Requests
⏰ Respecting Retry-After: 15s before retry

This means you hit rate limit.
Wait 60 seconds before trying again.
```

---

## Quick Fixes

### Fix 1: Ensure A1-Only Mode

**Check**: `src/components/ArchitectAIWizardContainer.jsx`

```javascript
// Should call:
const sheetResult = await generateSheet({
  designSpec,
  siteSnapshot,
  featureFlags: {},
  seed: Date.now(),
  sheetType: 'ARCH',
  overlays: [],
});

// NOT:
const result = await togetherAIService.generateConsistentArchitecturalPackage(...);
```

### Fix 2: Check Feature Flags

**Check**: Browser console or sessionStorage

```javascript
// In browser console:
sessionStorage.getItem('archiAI_feature_flags');

// Should show:
{
  "a1Only": true,  // ← Must be true
  "geometryFirst": false
}

// If a1Only is false, set it:
sessionStorage.setItem('archiAI_feature_flags', JSON.stringify({
  a1Only: true,
  geometryFirst: false
}));
location.reload();
```

### Fix 3: Clear Rate Limiter

**If stuck in rate limit loop**:

```javascript
// In browser console:
// The rate limiter is in the client, so refreshing page resets it

// Or wait 60 seconds between generation attempts
```

### Fix 4: Check API Key

**Verify Together.ai key is set**:

```bash
# In .env file:
TOGETHER_API_KEY=tgp_v1_...

# Check it's loaded:
node -e "require('dotenv').config(); console.log(process.env.TOGETHER_API_KEY ? 'Set' : 'Missing')"
```

---

## Performance Optimization

### Current Timing Breakdown

**DNA Generation** (10-15s):
```javascript
// Together.ai Qwen 2.5 72B
// Prompt: ~2000 tokens
// Response: ~1500 tokens
// Latency: 10-15s (normal for 72B model)

// Cannot optimize much (API-bound)
// Could cache DNA for similar projects (future)
```

**Prompt Building** (<1s):
```javascript
// Local JavaScript execution
// Already optimized
// Compact structure reduces processing
```

**Image Generation** (45-60s):
```javascript
// Together.ai FLUX.1-dev
// Steps: 48
// Resolution: 1792×1269
// Latency: 45-60s (normal for FLUX)

// Optimization options:
// 1. Reduce steps to 36-40 (faster, slightly lower quality)
// 2. Use FLUX.1-schnell (faster model, lower quality)
// 3. Reduce resolution (not recommended for A1)
```

**Validation** (<1s):
```javascript
// Local validation
// Already fast
```

**TOTAL**: 60-75 seconds (optimal)

### If Taking > 2 Minutes

**Likely Issues**:

1. **Multiple Image Requests**
   - Check: Console shows multiple "Generating image" logs
   - Fix: Ensure using `generateA1SheetImage` not `generateConsistentArchitecturalPackage`

2. **Retries Due to Errors**
   - Check: Console shows "Retry 1/3", "Retry 2/3"
   - Fix: Check API key valid, Together.ai status, network connection

3. **Rate Limiting**
   - Check: Console shows "Rate limiting: waiting 6000ms" multiple times
   - Fix: Wait 60s between attempts, check not making concurrent requests

4. **Slow Network**
   - Check: Browser Network tab shows slow API responses
   - Fix: Check internet connection, try different network

5. **DNA Generation Hanging**
   - Check: Console stuck on "STEP 1: Generating Master DNA"
   - Fix: Check Qwen API endpoint, try simpler project specs

---

## Browser DevTools Inspection

### Network Tab

**What to Check**:

1. **Filter by "together"**
   - Should see 2 requests:
     - POST `/api/together/chat` (DNA generation, ~10-15s)
     - POST `/api/together/image` (A1 sheet, ~45-60s)
   - If you see MORE than 2 requests, you're in 13-view mode!

2. **Response Times**:
   - Chat: 10-20s is normal
   - Image: 45-70s is normal
   - If > 90s, API might be slow or overloaded

3. **Status Codes**:
   - 200: Success ✅
   - 429: Rate limited (wait 60s)
   - 500: Server error (check logs)
   - 502/503: API down (check Together.ai status)

### Console Tab

**Expected Flow**:
```
[INFO] Starting generation workflow 🚀
[INFO] STEP 1: Generating Master DNA 🧬
[INFO] Using A1_ARCH_FINAL preset ⚙️
[INFO] STEP 4: Generating image 🎨
[INFO] Rate limiting: waiting 0ms (first request)
[SUCCESS] Image generated (latencyMs: 52341) ✅
[SUCCESS] A1 sheet workflow complete ✅
```

**Problem Indicators**:
```
❌ Multiple "Generating view X/13" messages
❌ "Rate limiting: waiting 6000ms" repeated many times
❌ "HTTP 429" errors
❌ Stuck on "STEP 1" for > 30 seconds
❌ "Retry 1/3", "Retry 2/3" messages
```

### Application Tab

**Check sessionStorage**:
```javascript
// In console:
Object.keys(sessionStorage).filter(k => k.includes('archiAI'))

// Should show:
archiAI_feature_flags
archiAI_design_history
archiAI_baseline_artifacts

// Check feature flags:
JSON.parse(sessionStorage.getItem('archiAI_feature_flags'))
// Should have: { a1Only: true }
```

---

## Common Issues & Solutions

### Issue 1: Taking 3+ Minutes

**Symptom**: Generation takes 180+ seconds  
**Diagnosis**: 13-view mode (13 images × 6s delay + generation time)  
**Solution**:

```javascript
// Check workflow being called
// In ArchitectAIWizardContainer.jsx, ensure:
await generateSheet({...}); // ✅ Correct

// NOT:
await togetherAIService.generateConsistentArchitecturalPackage({...}); // ❌ Wrong
```

### Issue 2: Stuck on "Generating Master DNA"

**Symptom**: Stuck on STEP 1 for > 30 seconds  
**Diagnosis**: Qwen API timeout or network issue  
**Solution**:

```bash
# Test Qwen connectivity
node test-together-api-connection.js

# Check API key
echo $TOGETHER_API_KEY  # Should show tgp_v1_...

# Check server running
curl http://localhost:3001/api/together/chat
```

### Issue 3: Multiple Rate Limit Warnings

**Symptom**: Console shows "Rate limiting: waiting 6000ms" 5+ times  
**Diagnosis**: Multiple concurrent requests or 13-view mode  
**Solution**:

```javascript
// Ensure only ONE image request per generation
// Check pureOrchestrator.js calls generateA1SheetImage ONCE

// Clear rate limiter state:
// Refresh page (rate limiter resets)
```

### Issue 4: 429 Rate Limit Errors

**Symptom**: "HTTP 429: Too Many Requests"  
**Diagnosis**: Hit Together.ai rate limit  
**Solution**:

```
1. Wait 60 seconds before retrying
2. Check you're not running multiple generations concurrently
3. Verify 6-second delay between requests
4. Check Together.ai billing (free tier has limits)
```

### Issue 5: Slow Image Generation (> 90s)

**Symptom**: STEP 4 takes > 90 seconds  
**Diagnosis**: Together.ai API slow or overloaded  
**Solution**:

```
1. Check Together.ai status page
2. Try again in a few minutes
3. Consider reducing steps to 40 for testing:
   
   // In fluxPresets.js (temporary):
   generate: {
     steps: 40, // Reduced from 48
     // ... rest same
   }
```

---

## Monitoring Commands

### Real-Time Monitoring

**Terminal 1** (Server logs):
```bash
npm run server
# Watch for:
# POST /api/together/chat
# POST /api/together/image
# Response times
```

**Terminal 2** (Test generation):
```bash
# Simple test
node test-together-api-connection.js

# Full DNA test
node test-dna-pipeline.js

# A1 workflow test
node test-a1-only-generation.js
```

**Browser Console**:
```javascript
// Enable verbose logging
localStorage.setItem('archiAI_debug', 'true');
location.reload();

// Check timing
console.time('generation');
// ... trigger generation ...
console.timeEnd('generation');
```

---

## Optimization Options

### Option 1: Fast Mode (Testing)

**Reduce steps for faster iteration**:

```javascript
// In fluxPresets.js
generate: {
  steps: 36, // Reduced from 48 (25% faster)
  cfg: 7.8,  // Keep same
  // ... rest same
}

// Expected timing: 35-45 seconds (vs 45-60s)
// Quality: Slightly lower but acceptable for testing
```

### Option 2: Parallel DNA + Prompt

**Already optimized** - DNA and prompt building are sequential (DNA needed for prompt).

### Option 3: Cache DNA

**For repeated generations with same specs**:

```javascript
// Future enhancement
const dnaCache = new Map();
const cacheKey = `${category}_${subType}_${area}_${floors}`;

if (dnaCache.has(cacheKey)) {
  masterDNA = dnaCache.get(cacheKey);
  // Skip STEP 1, save 10-15 seconds
} else {
  masterDNA = await generateMasterDesignDNA(...);
  dnaCache.set(cacheKey, masterDNA);
}
```

### Option 4: Progressive Loading

**Show intermediate results**:

```javascript
// After DNA generation (15s):
// Show DNA preview to user

// After prompt building (16s):
// Show prompt preview

// During image generation (16-76s):
// Show progress bar with estimated time remaining
```

---

## Recommended Actions

### Immediate (For Your Testing)

1. **Open Browser Console** (F12)
2. **Check for these specific logs**:
   ```
   ✅ "STEP 1: Generating Master DNA"
   ✅ "STEP 4: Generating image with A1_ARCH_FINAL preset"
   ✅ "A1 sheet workflow complete"
   
   ❌ "Generating view 1/13" (WRONG - 13-view mode)
   ❌ Multiple "Rate limiting" messages (WRONG - multiple requests)
   ```

3. **Time each step**:
   ```javascript
   // In console:
   let stepTimes = {};
   
   // When you see "STEP 1":
   stepTimes.step1 = Date.now();
   
   // When you see "STEP 4":
   stepTimes.step4 = Date.now();
   console.log('DNA time:', (stepTimes.step4 - stepTimes.step1) / 1000, 's');
   
   // When you see "complete":
   stepTimes.complete = Date.now();
   console.log('Image time:', (stepTimes.complete - stepTimes.step4) / 1000, 's');
   ```

4. **Check Network Tab**:
   - Filter: "together"
   - Count requests: Should be 2 (chat + image)
   - Check timing: Chat ~10-15s, Image ~45-60s

### If Still Slow

**Collect this information**:

1. **Console logs** (copy full output)
2. **Network timing** (screenshot Network tab)
3. **Step timing** (which step is slow?)
4. **Error messages** (any 429, 500, timeout errors?)
5. **Feature flags** (sessionStorage check)

Then we can pinpoint the exact bottleneck.

---

## Expected vs Actual Timing

### Scenario 1: Normal (60-75s)

```
STEP 1: DNA        → 12s   ✅
STEP 2: Validate   → 0.5s  ✅
STEP 3: Prompt     → 0.5s  ✅
STEP 4: Image      → 52s   ✅
STEP 5: Validate   → 0.5s  ✅
TOTAL:             → 65.5s ✅
```

### Scenario 2: Slow API (90-120s)

```
STEP 1: DNA        → 25s   ⚠️ (API slow)
STEP 2: Validate   → 0.5s  ✅
STEP 3: Prompt     → 0.5s  ✅
STEP 4: Image      → 85s   ⚠️ (API slow)
STEP 5: Validate   → 0.5s  ✅
TOTAL:             → 111.5s ⚠️
```

**Action**: Wait for API to recover, or try again later

### Scenario 3: Wrong Workflow (180-240s)

```
STEP 1: DNA        → 12s    ✅
13-View Generation → 195s   ❌ (13 × 15s avg)
TOTAL:             → 207s   ❌
```

**Action**: Fix workflow to use A1-only mode

### Scenario 4: Rate Limited (120-180s)

```
STEP 1: DNA        → 12s    ✅
Rate limit hit     → 60s    ❌ (forced wait)
STEP 4: Image      → 52s    ✅
TOTAL:             → 124s   ❌
```

**Action**: Wait 60s between generation attempts

---

## Debug Mode

### Enable Verbose Logging

**Add to browser console**:
```javascript
// Enable debug mode
localStorage.setItem('archiAI_debug', 'true');
localStorage.setItem('archiAI_log_level', 'debug');
location.reload();

// Now all logger.debug() calls will show
// You'll see detailed timing for each operation
```

### Check Workflow Path

**Add temporary logging**:
```javascript
// In ArchitectAIWizardContainer.jsx, handleGenerate():
console.log('🔍 DEBUG: About to call generateSheet');
console.log('🔍 DEBUG: designSpec:', designSpec);
console.log('🔍 DEBUG: siteSnapshot:', siteSnapshot);

const sheetResult = await generateSheet({...});

console.log('🔍 DEBUG: sheetResult:', sheetResult);
console.log('🔍 DEBUG: Generation took:', Date.now() - startTime, 'ms');
```

---

## Comparison: A1-Only vs 13-View

### A1-Only Mode (Current, Correct)

```
API Calls: 2 (DNA + single A1 image)
Images Generated: 1
Delays: 1 × 6s = 6s
Generation Time: ~60s
Total Time: ~65s ✅
```

### 13-View Mode (Legacy, Wrong)

```
API Calls: 14 (DNA + 13 individual images)
Images Generated: 13
Delays: 13 × 6s = 78s
Generation Time: 13 × 15s = 195s
Total Time: ~285s ❌
```

**If you're seeing 3+ minute generation times, you're in 13-view mode!**

---

## Solution Summary

### Most Likely Issue

**You're hitting the old 13-view workflow instead of A1-only**

**How to Verify**:
1. Open browser console (F12)
2. Trigger generation
3. Look for "view 1/13" messages
4. If you see them, you're in wrong mode

**How to Fix**:
1. Ensure `useArchitectAIWorkflow` hook is being used
2. Verify `generateSheet()` calls `runA1SheetWorkflow()`
3. Check no legacy code calling `togetherAIService.generateConsistentArchitecturalPackage()`
4. Refresh page to clear any cached workflows

### Quick Test

**Run this in browser console while on the app**:
```javascript
// Check which workflow is registered
console.log('Workflow hook:', typeof useArchitectAIWorkflow);

// Check feature flags
console.log('Feature flags:', sessionStorage.getItem('archiAI_feature_flags'));

// Should show: {"a1Only":true}
```

---

## Contact Points for Support

If issue persists after checking above:

1. **Share console logs** (full output from generation start to end)
2. **Share network timing** (Network tab screenshot)
3. **Share feature flags** (sessionStorage dump)
4. **Share which step is slow** (DNA? Image? Both?)

This will help pinpoint the exact bottleneck.

---

## Expected Behavior (Correct)

```
User clicks "Generate Design"
  ↓ (0s)
"Starting generation workflow 🚀"
  ↓ (0s)
"STEP 1: Generating Master DNA 🧬"
  ↓ (10-15s) ← Qwen reasoning
"DNA generation complete"
  ↓ (0s)
"STEP 3: Building prompt 📝"
  ↓ (0s)
"STEP 4: Generating image with A1_ARCH_FINAL preset 🎨"
  ↓ (45-60s) ← FLUX generation
"Image generated ✅"
  ↓ (0s)
"A1 sheet workflow complete ✅"
  ↓
Total: 60-75 seconds
```

**If your timing matches this, everything is working correctly!**

**If it's taking 3+ minutes, follow the diagnostic steps above.**

