# Quick Fix: Slow A1 Generation

## TL;DR

**Expected Time**: 60-75 seconds  
**Your Configuration**: ✅ Correct (verified by diagnostic)  

**If taking longer**, check these **in order**:

---

## 1. Open Browser Console (F12)

**Look for these logs**:

✅ **Good** (A1-only, ~60s):
```
🚀 Starting generation workflow
🧬 STEP 1: Generating Master DNA
⚙️ Using A1_ARCH_FINAL preset
🎨 STEP 4: Generating image
✅ Image generated (latencyMs: 52341)
✅ A1 sheet workflow complete
```

❌ **Bad** (13-view, ~3 minutes):
```
🎨 Generating view 1/13: Floor Plan Ground...
⏳ Waiting 6s before next view...
🎨 Generating view 2/13: Floor Plan First...
⏳ Waiting 6s before next view...
[continues for 13 views]
```

**If you see "view 1/13"**: You're in wrong mode! See Fix #1 below.

---

## 2. Check Network Tab

**Filter by**: "together"

**Expected**:
- 2 requests total:
  1. POST `/api/together/chat` (~10-15s) - DNA generation
  2. POST `/api/together/image` (~45-60s) - A1 sheet

**If you see > 2 requests**: Wrong workflow! See Fix #1.

**If requests are slow (> 90s each)**: API issue! See Fix #2.

---

## 3. Time Each Step

**In browser console, run this**:
```javascript
// Before clicking "Generate Design":
window.genStart = Date.now();

// After generation completes:
console.log('Total time:', (Date.now() - window.genStart) / 1000, 'seconds');
```

**Expected breakdown**:
- DNA: 10-15s
- Image: 45-60s
- Total: 60-75s

---

## Common Fixes

### Fix #1: Wrong Workflow (3+ minutes)

**Symptom**: Console shows "view 1/13", "view 2/13", etc.

**Solution**:
```javascript
// In browser console:
sessionStorage.setItem('archiAI_feature_flags', JSON.stringify({
  a1Only: true,
  geometryFirst: false
}));
location.reload();
```

Then try generation again.

### Fix #2: API Slow (90-120s)

**Symptom**: Network tab shows requests taking 80-100s each

**Solution**:
- Together.ai API may be overloaded
- Wait a few minutes and try again
- Check https://status.together.ai/
- Consider reducing steps temporarily:

```javascript
// Edit src/config/fluxPresets.js temporarily:
generate: {
  steps: 40, // Reduced from 48
  // ... rest same
}
```

### Fix #3: Rate Limited (429 errors)

**Symptom**: Console shows "HTTP 429: Too Many Requests"

**Solution**:
- Wait 60 seconds before trying again
- Don't click "Generate" multiple times
- Refresh page to reset rate limiter

### Fix #4: Server Not Running

**Symptom**: Console shows "Failed to fetch" or "Network error"

**Solution**:
```bash
# Start the server:
npm run server

# Or run both together:
npm run dev
```

### Fix #5: API Key Missing

**Symptom**: Console shows "Unauthorized" or "Invalid API key"

**Solution**:
```bash
# Check .env file has:
TOGETHER_API_KEY=tgp_v1_...

# Restart server after adding key:
# Ctrl+C in server terminal
npm run server
```

---

## Quick Performance Test

**Run this to test API connectivity**:
```bash
node test-together-api-connection.js
```

**Expected output**:
```
✅ Together.ai API connection successful
✅ Qwen reasoning: 8.2s
✅ FLUX image generation: 47.5s
```

**If this fails**: API issue, not workflow issue.

---

## Timing Benchmarks

### Normal (60-75s)
```
DNA:      12s  ✅
Validate: 0.5s ✅
Prompt:   0.5s ✅
Image:    52s  ✅
Validate: 0.5s ✅
TOTAL:    65.5s ✅
```

### Slow API (90-120s)
```
DNA:      25s  ⚠️ (API slow)
Validate: 0.5s ✅
Prompt:   0.5s ✅
Image:    85s  ⚠️ (API slow)
Validate: 0.5s ✅
TOTAL:    111.5s ⚠️
```

### Wrong Workflow (180-240s)
```
DNA:      12s   ✅
13 Views: 195s  ❌ (13 × 15s avg)
TOTAL:    207s  ❌
```

---

## What to Report

If issue persists, share:

1. **Console logs** (copy full output from "Starting generation" to "complete")
2. **Network tab** (screenshot showing request count and timing)
3. **Timing** (how long each step takes)
4. **Errors** (any red error messages)

This will help identify the exact bottleneck.

---

## Expected Behavior

**Correct A1-only workflow**:
```
Click "Generate Design"
  ↓ (0s) Starting...
  ↓ (12s) DNA generated
  ↓ (0s) Prompt built
  ↓ (52s) Image generated
  ↓ (0s) Validated
  ↓ (65s) DONE! ✅
```

**If your timing matches this, it's working correctly!**

**If it's 3+ minutes, you're in 13-view mode - use Fix #1 above.**

