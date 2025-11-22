# 🔍 Troubleshooting: Missing 3D & Technical Drawings

## Issue Report
**Symptom:** Only floor plans generate, 3D visualizations and technical drawings are missing

---

## 🔎 Diagnostic Steps

### Step 1: Check Browser Console

Open browser console (F12) and look for these messages:

```javascript
// SUCCESS indicators:
✅ [1/13] Ground Floor Plan completed successfully
✅ [2/13] Upper Floor Plan completed successfully
✅ [3/13] North Elevation completed successfully  // Should see this!
✅ [4/13] South Elevation completed successfully  // Should see this!
...

// FAILURE indicators:
❌ [3/13] Failed to generate North Elevation: [error message]
⚠️  WARNING: 11 views failed to generate
```

### Step 2: Check Terminal 2 (Server Logs)

The `npm run server` terminal should show:

```javascript
// SUCCESS:
🎨 [FLUX.1] Generating image with seed 123456...
✅ FLUX.1 image generated successfully

// FAILURE:
❌ FLUX.1 generation error: Rate limit exceeded
❌ Together API key not configured
```

### Step 3: Verify Together AI API Key

```bash
# Check .env file has:
TOGETHER_API_KEY=tgp_v1_...

# Test it works:
curl -X POST https://api.together.xyz/v1/models \
  -H "Authorization: Bearer YOUR_KEY_HERE"
```

---

## 🐛 Common Causes & Fixes

### Cause 1: Rate Limiting (Most Likely)

**Symptoms:**
- First 2 views generate (floor plans)
- Views 3-13 fail
- Error: "Rate limit exceeded" or HTTP 429

**Solution:**
```javascript
// Already implemented in togetherAIService.js
// But if still happening, increase delay:

// Line 330 in togetherAIService.js
const delayMs = 6000; // Change from 4000 to 6000 (6 seconds)
```

**Alternative:** Wait 60 seconds between generation attempts

---

### Cause 2: API Key Missing/Invalid

**Symptoms:**
- All views fail after floor plans
- Error: "API key not configured" or "Unauthorized"

**Check:**
```bash
# Terminal 2 should be running:
npm run server

# Check it started successfully:
# Should see: "Server listening on port 3001"

# Test health endpoint:
curl http://localhost:3001/api/health

# Should return:
# {"status":"ok","together":true}
```

**Fix:**
1. Add to `.env`:
   ```
   TOGETHER_API_KEY=tgp_v1_YOUR_KEY_HERE
   ```
2. Restart server: `npm run server`

---

### Cause 3: Server Not Running

**Symptoms:**
- Connection refused errors
- Fetch failed

**Fix:**
```bash
# MUST have 2 terminals running:

# Terminal 1:
npm start

# Terminal 2 (CRITICAL!):
npm run server  # Often forgotten!
```

---

### Cause 4: Generation Timeout

**Symptoms:**
- First few views work
- Later views timeout
- Error: "Network timeout"

**Fix:**
```javascript
// Increase timeout in togetherAIService.js line 165

const response = await fetch(`${API_BASE_URL}/api/together/image`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({...}),
  signal: AbortSignal.timeout(120000) // 2 minutes
});
```

---

### Cause 5: Prompt Too Long

**Symptoms:**
- Floor plans generate (short prompts)
- Technical drawings fail (longer prompts)
- Error: "Prompt exceeds maximum length"

**Check Console:**
```javascript
DNA-driven prompt length: 2453 chars  // Should see this

// If >3000 chars, prompts may be rejected
```

**Fix:**
```javascript
// In dnaPromptGenerator.js
// Shorten prompts by removing verbose sections
```

---

### Cause 6: Views Not Mapped to UI

**Symptoms:**
- Console shows "13/13 views generated"
- But UI only shows floor plans

**Check:**
```javascript
// In browser console, look for:
📦 floorPlans: {floorPlans: {ground: {...}, upper: {...}}}
📦 technicalDrawings: {technicalDrawings: {elevation_north: {...}}}
📦 visualizations: {views: {exterior_front: {...}}}

// If technicalDrawings or visualizations are empty objects {},
// the mapping failed
```

**Fix:**
Check `fluxAIIntegrationService.js` line 76-90 for correct mapping

---

## 🔧 Quick Diagnostic Test

Run this in browser console AFTER generation completes:

```javascript
// Check what was actually generated:
console.log('Floor Plans:', window.aiResult?.floorPlans);
console.log('Technical Drawings:', window.aiResult?.technicalDrawings);
console.log('Visualizations:', window.aiResult?.visualizations);

// Should show objects with images arrays
// If empty, generation failed
```

---

## ✅ Verification Checklist

Before reporting issue, verify:

- [ ] Server running in Terminal 2 (`npm run server`)
- [ ] Together AI API key in `.env`
- [ ] Browser console shows generation progress
- [ ] No "Rate limit" errors in console
- [ ] No "API key" errors in Terminal 2
- [ ] Waited at least 2 minutes for full generation
- [ ] Not generating immediately after previous attempt (60s cooldown)

---

## 📊 Expected Generation Timeline

```
Total time: ~90-120 seconds for all 13 views

[0s]   🧬 Generating Master DNA... (5-10s)
[10s]  🎨 [1/13] Ground Floor Plan... (3-5s)
[18s]  ⏳ Waiting 4s...
[22s]  🎨 [2/13] Upper Floor Plan... (3-5s)
[30s]  ⏳ Waiting 4s...
[34s]  🎨 [3/13] North Elevation... (3-5s)  ← Should reach here!
[42s]  ⏳ Waiting 4s...
[46s]  🎨 [4/13] South Elevation... (3-5s)  ← And here!
...
[110s] 🎨 [13/13] Interior View... (3-5s)
[115s] ✅ Complete!
```

**If generation stops at [30s], views 3-13 failed!**

---

## 🚨 Emergency Fix

If nothing else works, try this:

### 1. Clear Everything
```bash
# Stop both servers (Ctrl+C)
# Clear browser cache
# Delete node_modules and reinstall

npm run clean  # If available
rm -rf node_modules
npm install
```

### 2. Restart Fresh
```bash
# Terminal 1
npm start

# Terminal 2
npm run server

# Wait for both to fully start
# Then try ONE generation
# Wait full 2 minutes
```

### 3. Test Minimal Case
```
Location: London, UK
Building: 1-bedroom apartment
Area: 50m²

# Smaller building = simpler prompts = more likely to work
```

---

## 📞 Reporting Issues

If still failing, provide:

1. **Browser console output** (full log from start to end)
2. **Terminal 2 output** (server logs)
3. **Generation settings** (location, building type, area)
4. **Which views succeeded** (just floor plans? or some others?)
5. **Which views failed** (elevations? 3D? sections?)
6. **Error messages** (exact text)

---

## 🎯 Most Likely Solutions

**90% of cases:** One of these 3 fixes will work:

1. **Wait 60 seconds** between generation attempts (rate limit cooldown)
2. **Increase delay** to 6 seconds in `togetherAIService.js` line 330
3. **Restart server** with correct API key in `.env`

Try these first before deeper troubleshooting!