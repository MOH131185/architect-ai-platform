# Diagnostic Guide: Fix Inconsistent 2D/3D Results

## Problem
You're getting **unrelated 2D and 3D results** instead of coordinated views like your example image (modern white house with consistent materials/colors across all views).

## Root Cause Analysis

Your code **HAS** the DNA consistency system installed, but something is preventing it from running correctly.

## Diagnostic Steps

### Step 1: Check Console Logs During Generation

When you generate a design, open browser DevTools (F12) and look for these console messages:

**✅ DNA System is Working (GOOD):**
```
🧬 Using DNA-Enhanced FLUX workflow (95%+ consistency, 13 unique coordinated views)
🧬 STEP 1: Generating Location-Aware Master Design DNA...
✅ Master Design DNA generated successfully
🔍 STEP 2: Validating Master DNA...
📝 STEP 3: Generating 13 unique view-specific prompts...
🎨 STEP 4: Generating all 13 views with FLUX.1...
🎨 [1/13] Generating Ground Floor Plan...
✅ [1/13] Ground Floor Plan completed successfully
... (continues for all 13 views)
```

**❌ Fallback to Legacy (BAD - This is your problem):**
```
⚠️ Falling back to legacy generation method...
```

**❌ API Key Missing (BAD):**
```
❌ Together AI API key not found
❌ TOGETHER_API_KEY is not set
```

**❌ Server Not Running (BAD):**
```
Failed to fetch
ERR_CONNECTION_REFUSED
```

### Step 2: Verify Together.ai API Key

```bash
# Check if TOGETHER_API_KEY is in your .env file
cat .env | grep TOGETHER_API_KEY
```

**Expected:** `TOGETHER_API_KEY=tgp_v1_...` (should start with tgp_v1_)

**If missing:**
1. Get key from https://api.together.ai/settings/api-keys
2. Add to `.env`: `TOGETHER_API_KEY=your_key_here`
3. **Add credits** ($5-10) at https://api.together.ai/settings/billing (FLUX requires paid tier)

### Step 3: Verify Both Servers Are Running

```bash
# Terminal 1 - React frontend (port 3000)
npm start

# Terminal 2 - API proxy server (port 3001) - REQUIRED!
npm run server
```

**Check server is running:**
```bash
curl http://localhost:3001/api/health
```

If server responds, it's running correctly.

### Step 4: Run Diagnostic Test

```bash
# Test Together.ai API connectivity
node test-together-api-connection.js
```

**Expected output:**
```
✅ Together AI API connection successful
✅ FLUX.1 model available
✅ All tests passed
```

### Step 5: Test Complete Generation

1. Start both servers (see Step 3)
2. Open http://localhost:3000 in browser
3. Open DevTools Console (F12 → Console tab)
4. Fill in project details:
   - **Location:** Any address (e.g., "Paris, France")
   - **Building Program:** "2-bedroom house"
   - **Floor Area:** 150m²
   - **Floors:** 2
5. Click **"Generate AI Designs"**
6. **Wait full 3 minutes** (don't interrupt!)
7. **Watch console** for DNA workflow messages

### Step 6: Analyze Results

**✅ SUCCESS - All 13 coordinated views:**
- Console shows: "Generated: 13/13 views"
- Success Rate: 100%
- UI displays: Floor Plans (2), Technical Drawings (6), 3D Visualizations (5)
- **All views have same materials/colors/style**

**❌ FAILURE - Only 2 views:**
- Console shows: "Generated: 2/13 views"
- Rate limiting error (429)
- **Fix:** Wait 60 seconds, try again

**❌ FAILURE - Inconsistent views:**
- All 13 views generate BUT look completely different
- Console shows: "⚠️ Falling back to legacy generation method"
- **Problem:** DNA generation failed, using old method

## Common Issues & Fixes

### Issue 1: "Only 2 views generate"
**Cause:** Rate limiting
**Fix:**
- Verify `togetherAIService.js:333` shows `delayMs = 8000` (8 seconds)
- Wait 60 seconds before retrying
- If persists, increase to `delayMs = 10000` (10 seconds)

### Issue 2: "Falling back to legacy generation"
**Cause:** DNA generation error (usually OpenAI GPT-4 issue)
**Fix:**
- Check `REACT_APP_OPENAI_API_KEY` is in `.env`
- DNA generation uses OpenAI GPT-4 for reasoning
- Alternative: Modify `enhancedDNAGenerator.js` to use Together.ai Qwen instead

### Issue 3: "TOGETHER_API_KEY not found"
**Cause:** Environment variable not loaded
**Fix:**
```bash
# Stop both servers
# Edit .env file
echo "TOGETHER_API_KEY=tgp_v1_YOUR_KEY_HERE" >> .env
# Restart servers
npm run dev
```

### Issue 4: "Insufficient credits"
**Cause:** Together.ai free tier doesn't support FLUX
**Fix:** Add $5-10 credits at https://api.together.ai/settings/billing

### Issue 5: "Server connection refused"
**Cause:** API proxy server not running
**Fix:**
```bash
# Terminal 2 (separate from React)
npm run server

# Should show:
# API Proxy Server running on port 3001
```

## Expected Workflow Console Output

```javascript
// ========== STEP 1: DNA Generation ==========
🧬 STEP 1: Generating Location-Aware Master Design DNA...
📋 Building Program: 2-bedroom house
📍 Location: Paris, France
✅ Master Design DNA generated successfully
   Dimensions: 12.5m × 9.0m × 6.5m
   Materials: Red brick (#8B4513), Clay tiles (#654321)
   Rooms: 6 total (Living 5.0×4.5m, Kitchen 4.0×3.0m, ...)
   Consistency Rules: 10 rules enforced

// ========== STEP 2: Validation ==========
🔍 STEP 2: Validating Master DNA...
✅ Dimensions valid ✓
✅ Materials compatible ✓
✅ Floor count consistent ✓

// ========== STEP 3: Prompt Generation ==========
📝 STEP 3: Generating 13 unique view-specific prompts...
✅ Generated 13 unique prompts from Master DNA

// ========== STEP 4: Image Generation ==========
🎨 STEP 4: Generating all 13 views with FLUX.1...

🎨 [1/13] Generating Ground Floor Plan...
   Prompt: "Ground floor 2D overhead plan, 12.5m × 9.0m, Living 5.0×4.5m..."
✅ [1/13] Ground Floor Plan completed successfully
⏳ Waiting 8s before next view...

🎨 [2/13] Generating Upper Floor Plan...
✅ [2/13] Upper Floor Plan completed successfully
⏳ Waiting 8s before next view...

🎨 [3/13] Generating North Elevation...
   Prompt: "North facade flat 2D, MAIN ENTRANCE centered, red brick #8B4513..."
✅ [3/13] North Elevation completed successfully
⏳ Waiting 8s before next view...

... (continues for all 13 views) ...

🎨 [13/13] Generating Interior View...
✅ [13/13] Interior View completed successfully

// ========== FINAL RESULTS ==========
✅ [Together AI] DNA-enhanced architectural package complete
   Generated: 13/13 views
   Failed: 0/13 views
   Success Rate: 100%
   Consistency Score: 98%
```

## Quick Fix Checklist

- [ ] Both servers running (`npm start` + `npm run server`)
- [ ] `TOGETHER_API_KEY` in `.env` file (starts with tgp_v1_)
- [ ] Together.ai credits added ($5-10 minimum)
- [ ] `REACT_APP_OPENAI_API_KEY` in `.env` (for DNA generation)
- [ ] Wait 60 seconds between generation attempts
- [ ] Console shows "🧬 Using DNA-Enhanced FLUX workflow"
- [ ] Console shows "✅ Master Design DNA generated successfully"
- [ ] All 13 views generate (not just 2)
- [ ] Views look coordinated (same materials/colors)

## Next Steps

1. **Run Step 1-4** to diagnose which component is failing
2. **Apply the fix** for the specific issue found
3. **Test again** with Step 5-6
4. **If still failing**, share console logs in GitHub issue

## Success Criteria

You'll know it's working when:
- ✅ Console shows DNA workflow messages
- ✅ All 13 views generate in ~3 minutes
- ✅ 2D floor plans show same layout as 3D models
- ✅ All elevations have same materials/colors
- ✅ 3D views match the floor plans exactly
- ✅ Result looks like your example image (coordinated package)

---

**Pro Tip:** If DNS generation keeps failing, you can temporarily bypass DNA and use direct FLUX generation by editing `fluxAIIntegrationService.js` line 96 to NOT fall back to legacy. This will show you if the issue is with DNA generation or image generation.
