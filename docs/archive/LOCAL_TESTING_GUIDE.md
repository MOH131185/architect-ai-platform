# Local Testing Guide - Together AI Migration

## Prerequisites

Before testing, you need a Together AI API key:
1. Go to https://api.together.xyz/
2. Sign up or log in
3. Navigate to API Keys section
4. Click "Create API Key"
5. Copy the key (starts with something like `tgp_...`)

---

## Step 1: Configure Environment Variables

### Option A: Create .env file (if it doesn't exist)

```bash
# Copy the example file
cp .env.example .env
```

### Option B: Edit existing .env file

Open `.env` in your text editor and add/update:

```bash
# ============================================================
# REQUIRED FOR TESTING
# ============================================================

# Together AI API Key (MOST IMPORTANT)
TOGETHER_API_KEY=your_actual_together_api_key_here

# Google Maps API (for location - keep your existing key)
REACT_APP_GOOGLE_MAPS_API_KEY=your_existing_google_key

# OpenWeather API (for climate - keep your existing key)
REACT_APP_OPENWEATHER_API_KEY=your_existing_openweather_key

# ============================================================
# OPTIONAL (Legacy - can be removed or kept)
# ============================================================

OPENAI_REASONING_API_KEY=your_openai_key_if_you_have_it
OPENAI_IMAGES_API_KEY=your_openai_key_if_you_have_it
REACT_APP_OPENAI_API_KEY=your_openai_key_if_you_have_it
REACT_APP_REPLICATE_API_KEY=your_replicate_key_if_you_have_it
```

**Save the file!**

---

## Step 2: Start Development Servers

### Start both React and Express servers:

```bash
npm run dev
```

This command starts:
- **React app** on http://localhost:3000 (frontend)
- **Express proxy** on http://localhost:3001 (API proxy for Together AI)

You should see:
```
🚀 API Proxy Server running on http://localhost:3001
🧠 Meta Llama 3.1 70B (Reasoning): Configured ✅
🎨 FLUX.1 (Image Generation): Configured ✅

🎯 Architecture Engine: FLUX.1 + Llama 70B via Together AI
```

**Important**: Make sure BOTH servers are running!

---

## Step 3: Open Browser and DevTools

1. **Open browser**: http://localhost:3000

2. **Open Developer Console**:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+I`
   - Mac: `Cmd+Option+I`
   - Or right-click → Inspect → Console tab

3. **Keep the console visible** throughout testing to see logs

---

## Step 4: Test Complete Workflow

### Test 1: Location Analysis (Should use Google Maps - NOT Together AI)

1. Click "Detect My Location" or enter an address
2. Wait for location intelligence to load

**✅ Expected console output**:
```
📍 Fetching location intelligence...
✅ Location analysis complete
```

**❌ Should NOT see**:
- Any "Together AI" messages during location lookup
- This step should be FAST (1-2 seconds)

---

### Test 2: Portfolio Upload (Optional)

1. Upload 1-3 architectural images (JPG/PNG)
2. Wait for processing

**Console output**: Basic file processing, no AI calls yet

---

### Test 3: Project Specifications

1. Enter building details:
   - **Building Type**: e.g., "Single Family House"
   - **Floor Area**: e.g., "200" m²
   - **Floors**: e.g., "2"
   - **Bedrooms**: e.g., "3"

2. Click **"Generate AI Designs"**

---

### Test 4: AI Generation (KEY TEST - Together AI)

This is where Together AI should kick in!

**✅ Expected console output** (in order):

```
🧠 [Together AI] Using Qwen 2.5 72B Instruct for architectural reasoning...
  or
🧠 [Together AI] Chat completion: meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo

✅ [Together AI] Architectural reasoning generated

🎨 [FLUX.1] Generating floor_plan_ground with seed XXXXX (40 steps for quality)
🎨 [FLUX.1-dev] Generating floor_plan_ground...

✅ [FLUX.1] Image generated successfully

🎨 [FLUX.1] Generating elevation_north with seed XXXXX...
✅ [FLUX.1] Image generated successfully

🎨 [FLUX.1] Generating exterior_front_3d with seed XXXXX...
✅ [FLUX.1] Image generated successfully

... (continues for all views)
```

**Timing expectations**:
- Reasoning: 3-8 seconds
- Each image: 2-5 seconds
- Total: 30-60 seconds for complete design

---

## Step 5: Verification Checklist

Check these in the browser console:

### ✅ Success Indicators

- [ ] See "Together AI" messages (NOT "OpenAI")
- [ ] See "FLUX.1" or "FLUX.1-dev" for images
- [ ] See "Qwen 2.5 72B" or "Llama 3.1 405B" for reasoning
- [ ] Reasoning completes in 3-8 seconds
- [ ] Images generate in 2-5 seconds each
- [ ] No error messages
- [ ] Design results display on screen
- [ ] Images load and display correctly

### ❌ Problem Indicators

- [ ] See "OpenAI" or "DALL-E" messages
- [ ] See "API key not configured" errors
- [ ] Reasoning takes >15 seconds
- [ ] Images fail to generate
- [ ] Red error messages in console

---

## Step 6: Inspect Generated Design

### Check the Results Display

1. **Design Reasoning Section**:
   - Should show architectural philosophy
   - Material recommendations
   - Spatial organization
   - Environmental considerations

2. **Visualizations Section**:
   - Should show 6-13 images:
     - Floor plans (2D, black & white line drawings)
     - Elevations (flat facade views)
     - Sections (cut-through views)
     - 3D renderings (exterior, interior, axonometric)
   - All images should load successfully
   - Images should be consistent in style

3. **Technical Specs**:
   - BIM data
   - Dimensions
   - Materials list

---

## Troubleshooting

### Issue: "Together AI API key not configured"

**Solution**:
```bash
# 1. Check .env file exists
ls -la .env

# 2. Check it contains TOGETHER_API_KEY
cat .env | grep TOGETHER_API_KEY

# 3. Restart servers (kill and restart)
# Press Ctrl+C to stop servers
npm run dev
```

### Issue: "Port 3001 already in use"

**Solution**:
```bash
# Kill process on port 3001 (Windows)
netstat -ano | findstr :3001
taskkill /PID <PID_NUMBER> /F

# Then restart
npm run dev
```

### Issue: Still seeing "OpenAI" in console logs

**Possible causes**:
1. Browser cache - Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Old server still running - Kill and restart
3. .env not loaded - Check TOGETHER_API_KEY is set

**Solution**:
```bash
# 1. Kill all node processes
taskkill /IM node.exe /F

# 2. Clear browser cache
# In browser: Ctrl+Shift+Delete → Clear cache

# 3. Restart servers
npm run dev

# 4. Hard refresh browser
Ctrl+Shift+R
```

### Issue: Images not generating / "No image generated" error

**Check Together AI API status**:
1. Go to https://api.together.xyz/usage
2. Check your API credits/quota
3. Verify API key is active

**Check server logs**:
Look in the terminal for detailed error messages from Together AI API

### Issue: Slow performance (>30 seconds for reasoning)

**Solution - Use faster model**:

Edit `src/services/togetherAIReasoningService.js` line 31:
```javascript
// Change from 405B to 70B for speed
this.defaultModel = 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
```

Restart servers.

### Issue: JSON parsing errors in console

This is normal occasionally - the service has fallback text parsing.

If it happens frequently, check Together AI model status.

---

## Expected Console Output Example

Here's what a successful test looks like:

```
[React] Starting development server...
[Server] 🚀 API Proxy Server running on http://localhost:3001
[Server] 🧠 Meta Llama 3.1 70B (Reasoning): Configured ✅
[Server] 🎨 FLUX.1 (Image Generation): Configured ✅

// User enters location
📍 Fetching location intelligence...
✅ Location analysis complete

// User clicks Generate AI Designs
🎨 Creating Design Context with Meta Llama 3.1 405B for consistency...
🧠 [Together AI] Chat completion: meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo
✅ [Together AI] Chat completion successful

🧠 [Together AI] Using Qwen 2.5 72B Instruct for architectural reasoning...
✅ [Together AI] Architectural reasoning generated

🎨 [FLUX.1-dev] Generating floor_plan_ground with seed 847362...
🖼️  Proxying image: https://together-api-url...
✅ [FLUX.1] Image generated successfully

🎨 [FLUX.1-dev] Generating elevation_north with seed 847362...
✅ [FLUX.1] Image generated successfully

... (continues for all views) ...

✅ Design generation complete!
Total time: 45 seconds
```

---

## Performance Benchmarks (Local Testing)

| Operation | Expected Time | Status |
|-----------|---------------|--------|
| Location lookup | 1-2 seconds | ✅ Fast |
| Design reasoning | 3-8 seconds | ✅ Fast |
| Single image | 2-5 seconds | ✅ Fast |
| Complete design (7 images) | 30-60 seconds | ✅ Acceptable |

If your times are significantly longer, check:
- Internet connection speed
- Together AI API status
- Try using 70B model instead of 405B

---

## After Successful Local Testing

Once you've verified everything works locally:

1. **✅ Together AI is being used** (not OpenAI)
2. **✅ Images generate successfully**
3. **✅ Performance is acceptable**
4. **✅ No errors in console**

You're ready to deploy to production!

See: `TOGETHER_AI_MIGRATION_COMPLETE.md` for deployment instructions.

---

## Quick Test Script

Run this quick test to verify API connectivity:

```bash
# Test Together AI connection
curl -X POST http://localhost:3001/api/together/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 50
  }'
```

**Expected response**:
```json
{
  "choices": [
    {
      "message": {
        "content": "Hello! ..."
      }
    }
  ]
}
```

---

## Need Help?

**Common issues**:
1. API key not set → Check .env file
2. Servers not running → Run `npm run dev`
3. Port conflict → Kill process on port 3001/3000
4. Cache issues → Hard refresh browser (Ctrl+Shift+R)
5. Still seeing OpenAI → Check imports in service files

**Still stuck?** Check:
- Terminal output for error messages
- Browser console for detailed errors
- Together AI dashboard for API status
- `server.js` logs for API request/response details

---

## Summary

**To test locally**:
```bash
# 1. Set up environment
cp .env.example .env
# Edit .env and add TOGETHER_API_KEY

# 2. Start servers
npm run dev

# 3. Open browser
# Visit http://localhost:3000
# Open DevTools Console (F12)

# 4. Generate a design
# Watch console for "Together AI" and "FLUX.1" messages

# 5. Verify success
# Check the verification checklist above
```

Good luck with testing! 🚀
