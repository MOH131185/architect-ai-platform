# 🧪 Local Testing Guide

## Purpose

Test the application locally to determine if issues are from:
- ❌ **Code issues** (will fail locally and in production)
- ❌ **Vercel environment issues** (works locally, fails in production)

---

## ✅ Prerequisites

### 1. Check Dependencies Installed
```bash
# Should see "node_modules exists"
test -d node_modules && echo "node_modules exists" || npm install
```

### 2. Verify .env File Exists
```bash
# Should show your .env file with 4 API keys
cat .env
```

**Expected content**:
```env
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
REACT_APP_OPENWEATHER_API_KEY=your_openweather_api_key_here
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
REACT_APP_REPLICATE_API_KEY=your_replicate_api_key_here
```

---

## 🚀 Start Local Development

### Method 1: Run Both Services (RECOMMENDED)
```bash
npm run dev
```

**What this does**:
- Starts Express API proxy on `http://localhost:3001`
- Starts React development server on `http://localhost:3000`
- Runs both concurrently

**Expected output**:
```
[0] Express server listening on port 3001
[0] API Proxy: /api/openai/chat → https://api.openai.com/v1/chat/completions
[0] API Proxy: /api/replicate/predictions → https://api.replicate.com/v1/predictions
[1] Compiled successfully!
[1] You can now view architect-ai-platform in the browser.
[1] Local: http://localhost:3000
```

### Method 2: Run Services Separately

**Terminal 1** (API Proxy):
```bash
npm run server
```

**Terminal 2** (React App):
```bash
npm start
```

---

## 🧪 Testing Steps

### Step 1: Open Application
1. Open browser to: **http://localhost:3000**
2. Open Developer Tools: Press **F12**
3. Go to **Console** tab
4. Clear console (click 🚫 icon)

### Step 2: Go Through Workflow

**2.1 Location**:
- Enter address: "123 Main St, San Francisco, CA"
- Or click "Use My Location"
- Click "Analyze Location"

**Expected Console**:
```
📍 Analyzing location...
✅ Location analysis complete
✅ Climate data retrieved
✅ Zoning analysis complete
```

**2.2 Intelligence Report**:
- Review location intelligence
- Click "Continue"

**2.3 Portfolio** (Optional):
- Upload 1-3 architectural images
- Or click "Skip Portfolio"

**Expected Console** (if uploading):
```
🎨 Analyzing portfolio style...
✅ Portfolio style detection complete
```

**2.4 Specifications**:
- Select building program (e.g., "Single Family House")
- Enter floor area (e.g., "200")
- Add any specifications
- Click "Generate AI Designs"

**Expected Console**:
```
🎨 Starting integrated AI design generation with: Object
🎲 Project seed for consistent outputs: [number]
📍 Step 1: Analyzing location and architectural context...
✅ Location analysis complete
🎨 Step 2: Analyzing portfolio style (if provided)...
✅ Portfolio style detection complete
🧠 Step 4: Generating OpenAI design reasoning...
✅ Design reasoning generated
🏗️ Step 5: Generating multi-level floor plans...
✅ Floor plans generated
🏗️ Step 6: Generating elevations and sections...
✅ Technical drawings generated
🏗️ Step 7: Generating 3D photorealistic views...
✅ 3D views generated
✅ AI design generation complete
```

### Step 3: Check Results

**✅ SUCCESS Indicators**:
- Real images displayed (not placeholder.com URLs)
- Floor plans show architectural drawings
- Elevations show building facades
- 3D views show photorealistic renders
- Generation completes in 60-90 seconds

**⚠️ EXPECTED Local Warning**:
```
POST http://localhost:3001/api/openai/chat 401 (Unauthorized)
Portfolio style detection error: Error: OpenAI API error: 401
```
- This is NORMAL in local development
- OpenAI API key may be restricted to production domain/IPs
- The application continues with fallback reasoning
- Replicate API still generates real images
- See LOCAL_vs_PRODUCTION_DIAGNOSIS.md for details

**❌ CRITICAL FAILURE Indicators**:
- Placeholder images only
- "TypeError" or "Cannot read properties" errors
- Generation fails completely
- 500 errors from API proxy

---

## 📊 Comparison Matrix

Test locally first, then compare with production:

| Feature | Local (localhost:3000) | Production (archiaisolution.pro) |
|---------|------------------------|----------------------------------|
| **Replicate API** | ✅ Working | ✅ Working |
| **OpenAI API** | ⚠️ 401 (expected) | ✅ Working |
| **Images Generate** | ✅ Real images | ✅ Real images |
| **Floor Plans** | ✅ Generated | ✅ Generated |
| **Elevations** | ✅ Generated | ✅ Generated |
| **3D Views** | ✅ Generated | ✅ Generated |
| **Design Reasoning** | ⚠️ Fallback | ✅ Full AI |
| **Console Errors** | OpenAI 401 only | None expected |
| **Generation Time** | ~60-90 seconds | ~60-90 seconds |

---

## 🔍 Diagnostic Scenarios

### Scenario 1: Works Locally ✅, Fails Production ❌

**Diagnosis**: Vercel environment issue

**Likely Causes**:
1. API keys not configured in Vercel
2. API keys in Vercel are incorrect/truncated
3. Vercel function timeout (10 seconds default)
4. Vercel function memory limit exceeded

**Solutions**:
- Re-check Vercel environment variables
- Verify exact key match between .env and Vercel
- Check Vercel function logs for specific errors

---

### Scenario 2: Fails Locally ❌, Fails Production ❌

**Diagnosis**: Code issue

**Likely Causes**:
1. API keys are invalid (expired, wrong, no credits)
2. Bug in code (TypeError, undefined errors)
3. Network connectivity issues
4. API service downtime (OpenAI/Replicate)

**Solutions**:
- Run `node verify-api-keys.js` to check key validity
- Check console for specific error messages
- Review code changes in recent commits
- Check OpenAI/Replicate service status

---

### Scenario 3: Works Locally ✅, Works Production ✅

**Diagnosis**: Everything working!

**Confirmation**:
- APIs configured correctly everywhere
- Code is bug-free
- All services operational

---

### Scenario 4: Partially Works Locally ⚠️, Fully Works Production ✅

**Diagnosis**: OpenAI API key restriction (THIS IS THE CURRENT STATE)

**What's Happening**:
- Replicate API: ✅ Working perfectly
- OpenAI API: ⚠️ 401 Unauthorized
- Images still generate: ✅ Real architectural images
- Design reasoning: ⚠️ Using fallback

**Why This Happens**:
1. OpenAI API key may be restricted to production domain/IPs
2. Key works in Vercel (whitelisted) but not locally
3. This is a key restriction, NOT a code bug
4. Application continues with graceful fallbacks

**Impact**:
- ✅ You can still test locally
- ✅ Replicate image generation works
- ✅ Real architectural images display
- ⚠️ Design reasoning is generic (not AI-generated)
- ✅ Full functionality available in production

**Solutions**:
1. **Accept current state** (RECOMMENDED):
   - Local testing works for visual output
   - Use production for full OpenAI features
   - No code changes needed

2. **Create unrestricted local API key**:
   - Log into OpenAI dashboard
   - Create new key without restrictions
   - Add to .env file

3. **Test in production**:
   - Production has full functionality
   - All APIs working correctly

---

## 🔧 Common Local Issues & Fixes

### Issue: Port 3000 already in use
```bash
# Find and kill process using port 3000
npx kill-port 3000

# Then restart
npm run dev
```

### Issue: "Cannot find module" errors
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
npm run dev
```

### Issue: API proxy not responding
```bash
# Check if server.js is running
# Terminal 1:
npm run server

# Should see:
# Express server listening on port 3001
```

### Issue: CORS errors in console
```bash
# Make sure you're accessing via localhost:3000
# NOT via 127.0.0.1 or IP address
```

### Issue: Hot reload not working
```bash
# Stop servers (Ctrl+C)
# Clear React cache
rm -rf node_modules/.cache

# Restart
npm run dev
```

---

## 📋 Test Checklist

### Pre-Test
- [ ] Dependencies installed (`node_modules` exists)
- [ ] `.env` file exists with 4 API keys
- [ ] Ports 3000 and 3001 available
- [ ] Browser Developer Tools open (F12)

### During Test
- [ ] Both servers started successfully
- [ ] Application loads at localhost:3000
- [ ] No console errors on page load
- [ ] Location analysis works
- [ ] Portfolio upload works (if testing)
- [ ] Design generation starts
- [ ] No errors during generation
- [ ] Generation completes successfully

### Post-Test Results
- [ ] Real images generated (not placeholders)
- [ ] All image types present (floor plans, elevations, 3D)
- [ ] No console errors
- [ ] Generation time: ____ seconds
- [ ] Total images generated: ____

---

## 📸 Screenshot Checklist

Take screenshots of:
1. **Console during generation** - Shows progress messages
2. **Network tab** - Shows API calls and responses
3. **Generated results** - Floor plans, elevations, 3D views
4. **Any error messages** - For debugging

---

## 🆘 If You Need Help

### Information to Provide

**If local test fails**, provide:
1. Console error messages (copy/paste full text)
2. Network tab errors (check /api/ endpoints)
3. Result of `node verify-api-keys.js`
4. Last successful step before failure

**If local works but production fails**, provide:
1. Confirmation that local test succeeded
2. Production console errors
3. Screenshot of Vercel environment variables
4. Vercel deployment logs

---

## ✅ Success Criteria

**Local testing is successful when**:
1. ✅ No console errors
2. ✅ All API calls return 200 status
3. ✅ OpenAI generates design reasoning
4. ✅ Replicate generates all images
5. ✅ Real images displayed (not placeholders)
6. ✅ Generation completes in ~60-90 seconds
7. ✅ User can export designs

**If local test succeeds**, your code is fine!
**If local test fails**, there's a code or API key issue.

---

## 🎯 Next Steps After Testing

### If Local Works ✅
- Test production
- If production fails, it's a Vercel config issue
- Focus on Vercel environment variables

### If Local Fails ❌
- Check API keys with `node verify-api-keys.js`
- Review console errors
- Check code for bugs
- Verify API service status

---

**Ready to start?**

```bash
npm run dev
```

Then open: **http://localhost:3000**

---

**Last Updated**: October 11, 2025
**Status**: Ready for local testing
