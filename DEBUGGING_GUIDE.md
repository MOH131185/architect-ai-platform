# Debugging Guide - AI Image Generation Not Working

## Quick Diagnosis Steps

### Step 1: Open Browser Console
1. Visit https://www.archiaisolution.pro/
2. Press `F12` to open Developer Tools
3. Click on the **Console** tab
4. Keep it open while testing

### Step 2: Test the Generation Workflow
1. Click "Start Live Demo"
2. Enter address or detect location
3. Click "Analyze Location"
4. Upload any image files (portfolio)
5. Enter project details:
   - Building Program: Medical Clinic
   - Total Area: 500
6. Click "Generate AI Designs"
7. **Watch the console** for messages

### Step 3: Look for These Console Messages

#### ✅ GOOD - What You Should See:
```
🎨 Starting AI design generation with: {...}
🎨 Using floor plan and 3D preview generation
Starting floor plan and 3D preview generation...
✅ AI design generation complete: {...}
📊 Extracted floor plan images: [array of URLs]
📊 Extracted 3D preview images: [array of URLs]
```

#### ❌ BAD - What Indicates a Problem:

**Problem 1: API Key Not Configured**
```
Replicate API key not configured
OpenAI API key not configured
```
**Solution**: Environment variables not set in Vercel (see below)

**Problem 2: API Request Failed**
```
Failed to fetch
Replicate API error: 401
OpenAI API error: 401
```
**Solution**: API keys are invalid or incorrect (check Vercel settings)

**Problem 3: CORS Error**
```
Access to fetch at 'https://api.replicate.com' blocked by CORS
```
**Solution**: API proxy not working (should not happen with serverless functions)

**Problem 4: Empty Images Array**
```
📊 Extracted floor plan images: []
📊 Extracted 3D preview images: []
```
**Solution**: API called successfully but returned fallback/placeholder data

---

## Detailed Troubleshooting

### Issue: "API Key Not Configured" in Console

**Cause**: Environment variables not set in Vercel or set incorrectly

**Fix**:
1. Go to https://vercel.com/dashboard
2. Select `architect-ai-platform` project
3. Settings → Environment Variables
4. **Verify these 5 variables exist**:
   - `REACT_APP_GOOGLE_MAPS_API_KEY`
   - `REACT_APP_OPENWEATHER_API_KEY`
   - `REACT_APP_OPENAI_API_KEY`
   - `REACT_APP_REPLICATE_API_KEY`
   - `REPLICATE_API_TOKEN`
5. **Check they are set for ALL environments**: Production, Preview, Development
6. If missing or incorrect, add/update them
7. Go to Deployments → Find latest → "..." → Redeploy
8. Wait 2-3 minutes for deployment to complete
9. Test again

### Issue: API Returns 401 Unauthorized

**Cause**: API keys are invalid, expired, or incorrectly formatted

**Fix**:
1. **Verify OpenAI API Key**:
   - Go to https://platform.openai.com/api-keys
   - Check if your key is active
   - Key should start with `sk-svcacct-` or `sk-proj-`
   - Copy the EXACT key (no extra spaces)

2. **Verify Replicate API Token**:
   - Go to https://replicate.com/account/api-tokens
   - Check if your token is active
   - Token should start with `r8_`
   - Copy the EXACT token (no extra spaces)

3. **Update in Vercel**:
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Click "..." next to the variable → Edit
   - Paste the EXACT key/token
   - Save
   - Redeploy

### Issue: Images Array is Empty []

**Cause**: API is returning fallback data instead of generating images

**Possible Reasons**:
1. **Replicate API quota exhausted**: Check https://replicate.com/account/billing
2. **OpenAI API quota exhausted**: Check https://platform.openai.com/usage
3. **API call timing out**: Replicate can take 30-60 seconds per image
4. **Model not available**: SDXL model might be temporarily unavailable

**Fix**:
1. Check your API usage/billing dashboards
2. Ensure you have available credits
3. Wait the full 60-120 seconds for generation
4. Try again - sometimes APIs have temporary issues

### Issue: Generation Takes Forever (>2 minutes)

**Normal Timing**:
- OpenAI GPT-4: 5-15 seconds
- Replicate Floor Plan: 30-60 seconds
- Replicate 3D Preview: 30-60 seconds
- **Total Expected**: 60-120 seconds

**If taking longer**:
1. Check console for "waiting for prediction" messages
2. Replicate might be busy (high demand)
3. Your prediction is queued
4. Wait up to 5 minutes (API timeout)
5. If timeout occurs, fallback data will be shown

---

## Testing API Keys Directly

### Test OpenAI API Key:
```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPENAI_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 10
  }'
```

**Expected**: JSON response with "hello" message
**If error**: Your OpenAI key is invalid

### Test Replicate API Token:
```bash
curl -s -X POST \
  -H "Authorization: Token YOUR_REPLICATE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version":"stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b","input":{"prompt":"test"}}' \
  https://api.replicate.com/v1/predictions
```

**Expected**: JSON response with prediction ID
**If error**: Your Replicate token is invalid

---

## Vercel Deployment Logs

If APIs are configured but still not working:

1. Go to Vercel Dashboard → Deployments
2. Click on the latest deployment
3. Click "View Function Logs"
4. Look for errors in:
   - `/api/openai-chat`
   - `/api/replicate-predictions`
   - `/api/replicate-status`
5. Common errors:
   - "API key not found" → Environment variables not loaded
   - "Unauthorized" → Invalid API keys
   - "Timeout" → API taking too long

---

## Still Not Working?

### Final Checklist:
- [ ] All 5 environment variables set in Vercel
- [ ] Variables set for ALL environments (Production, Preview, Development)
- [ ] Latest deployment is live (check deployment timestamp)
- [ ] API keys are valid and active
- [ ] API keys have available credits/quota
- [ ] Browser cache cleared (Ctrl+Shift+R to hard refresh)
- [ ] Console shows no errors
- [ ] Waited full 60-120 seconds for generation

### If ALL checked and still not working:

**Check the actual API response structure**:
1. Open Console
2. When generation completes, look for:
   ```
   ✅ AI design generation complete: {...}
   ```
3. Expand that object
4. Check the structure:
   - Does `floorPlan` exist?
   - Does `preview3D` exist?
   - Do they have `images` arrays?
   - Are the arrays empty or have URLs?

**Share this info**:
- Copy the full console output
- Copy the `aiResult` object structure
- This will help identify the exact issue

---

## Expected Working Output

When everything works correctly, you should see:

**Console**:
```
🎨 Starting AI design generation with: {buildingProgram: "clinic", ...}
🎨 Using floor plan and 3D preview generation
Starting floor plan and 3D preview generation...
Generating design reasoning...
Generating architectural visualizations...
✅ AI design generation complete: {success: true, floorPlan: {...}, preview3D: {...}}
📊 Extracted floor plan images: ["https://replicate.delivery/pbxt/..."]
📊 Extracted 3D preview images: ["https://replicate.delivery/pbxt/..."]
```

**On Screen**:
- "AI Generated" badge on floor plan
- "AI Generated" badge on 3D visualization
- Actual architectural images displayed (not placeholders)
- Images load and show detailed architectural drawings

---

## Quick Reference: Environment Variables

Copy these from your local `.env` file and paste into Vercel:

```
REACT_APP_GOOGLE_MAPS_API_KEY=[your_key_from_.env]
REACT_APP_OPENWEATHER_API_KEY=[your_key_from_.env]
REACT_APP_OPENAI_API_KEY=[your_key_from_.env]
REACT_APP_REPLICATE_API_KEY=[your_token_from_.env]
REPLICATE_API_TOKEN=[same_as_above]
```

**IMPORTANT**:
- Set for **ALL** environments
- No quotes around values
- No extra spaces
- Exact copy from local .env file
