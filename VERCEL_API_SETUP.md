# 🚀 Vercel API Configuration Guide

## ⚠️ CRITICAL: Production 401 Errors Fix

Your local `.env` file has API keys, but **Vercel production environment doesn't have them configured**, causing all OpenAI API calls to fail with 401 errors.

---

## 📋 Step-by-Step Vercel Configuration

### **Step 1: Access Vercel Dashboard**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project: **architect-ai-platform**
3. Click **Settings** tab at the top
4. Click **Environment Variables** in the left sidebar

---

### **Step 2: Add Environment Variables**

Add each of these variables **THREE TIMES** (once for each environment):

#### **Variable 1: OpenAI API Key**
```
Name: REACT_APP_OPENAI_API_KEY
Value: [Get your key from your local .env file]
Environments: ✅ Production  ✅ Preview  ✅ Development
```

**To get the value:** Open your local `.env` file and copy the `REACT_APP_OPENAI_API_KEY` value

#### **Variable 2: Replicate API Key**
```
Name: REACT_APP_REPLICATE_API_KEY
Value: [Get your key from your local .env file]
Environments: ✅ Production  ✅ Preview  ✅ Development
```

**To get the value:** Open your local `.env` file and copy the `REACT_APP_REPLICATE_API_KEY` value

#### **Variable 3: Google Maps API Key**
```
Name: REACT_APP_GOOGLE_MAPS_API_KEY
Value: [Get your key from your local .env file]
Environments: ✅ Production  ✅ Preview  ✅ Development
```

**To get the value:** Open your local `.env` file and copy the `REACT_APP_GOOGLE_MAPS_API_KEY` value

#### **Variable 4: OpenWeather API Key**
```
Name: REACT_APP_OPENWEATHER_API_KEY
Value: [Get your key from your local .env file]
Environments: ✅ Production  ✅ Preview  ✅ Development
```

**To get the value:** Open your local `.env` file and copy the `REACT_APP_OPENWEATHER_API_KEY` value

---

### **Step 3: Verify Configuration**

After adding all 4 variables, you should see:

```
REACT_APP_OPENAI_API_KEY       Production, Preview, Development
REACT_APP_REPLICATE_API_KEY    Production, Preview, Development
REACT_APP_GOOGLE_MAPS_API_KEY  Production, Preview, Development
REACT_APP_OPENWEATHER_API_KEY  Production, Preview, Development
```

---

### **Step 4: Redeploy**

**Option A: Automatic Redeploy** (Recommended)
- Vercel will automatically redeploy when you add environment variables
- Wait 2-3 minutes for the deployment to complete

**Option B: Manual Redeploy**
1. Go to **Deployments** tab
2. Find the latest deployment
3. Click **...** menu → **Redeploy**
4. Check **Use existing Build Cache** if available
5. Click **Redeploy**

---

## ✅ Verification Checklist

After redeployment, verify the following:

### **1. Check Deployment Logs**
Go to the latest deployment and verify:
- ✅ Build completes without errors
- ✅ No "401 Unauthorized" errors in build logs
- ✅ No missing environment variable warnings

### **2. Test Live Site**
Visit your production URL: **https://www.archiaisolution.pro**

**Open Browser Console (F12)** and verify:
- ✅ No `401` errors for `/api/openai-chat`
- ✅ No `401` errors for `/api/replicate-predictions`
- ✅ You see: `✅ Consistency validation complete: Score XX.X%`

### **3. Test Complete Workflow**
1. Enter a location address
2. Upload portfolio images (optional)
3. Enter building specifications
4. Click "Generate AI Designs"
5. **Expected Results:**
   - OpenAI reasoning generates successfully
   - Floor plans show DISTINCT layouts for each floor
   - 3D views show the SAME building (not different projects)
   - Technical drawings are 2D orthographic (not 3D renders)
   - Structural/MEP plans are 2D top-down (not 3D building exteriors)

---

## 🐛 Troubleshooting

### **Issue: Still seeing 401 errors after adding keys**

**Cause:** Vercel cached the old deployment without environment variables

**Fix:**
1. Go to **Settings** → **Environment Variables**
2. Click **Edit** on each variable
3. Re-save without changing anything (forces Vercel to refresh)
4. Redeploy with **Clear Build Cache** option

---

### **Issue: "Missing environment variable" warnings**

**Cause:** Variables not set for all environments

**Fix:**
1. Check each variable has all 3 checkboxes: Production, Preview, Development
2. Re-add any missing environment selections

---

### **Issue: API keys work locally but not in production**

**Cause 1:** Serverless functions need plain variable names (without `REACT_APP_` prefix)

**Fix:** Your serverless functions in `/api` folder already handle this correctly - they access `process.env.REACT_APP_OPENAI_API_KEY`

**Cause 2:** API keys have restrictions (IP whitelist, domain restrictions)

**Fix:**
- OpenAI: Remove IP restrictions in OpenAI dashboard
- Replicate: Check API key permissions
- Google Maps: Add `*.vercel.app` and `archiaisolution.pro` to allowed domains

---

## 📊 Expected Console Output After Fix

Once API keys are properly configured, you should see:

```
🎨 Starting integrated AI design generation with: Object
🎲 Project seed for consistent outputs: 33661
⚖️ Material Weight: 0.01 | Characteristic Weight: 0.02
📍 Step 1: Analyzing location and architectural context...
✅ Location analysis complete
🎨 Step 2: Detecting portfolio style from 3 images...
✅ Portfolio style detected: Contemporary
🎨 Step 3: Creating blended style with separate material and characteristic weights
✅ Blended style created: Contemporary
🧠 Step 4: Generating OpenAI design reasoning...
✅ Unified design framework created from OpenAI reasoning
🏗️ Step 5: Generating multi-level floor plans...
✅ Ground floor plan generated
🏗️ Step 6: Generating all elevations and sections...
✅ All technical drawings generated
🏗️ Step 7: Generating 3D photorealistic views...
✅ Photorealistic 3D views generated
🏗️ Step 8: Generating parametric BIM model...
✅ BIM model generated
🏗️ Step 9: Generating construction documentation...
✅ Construction documentation generated
🔍 Step 10: Validating output consistency...
✅ Consistency validation complete: Score 95.0%
✅ AI design generation complete
```

**Key indicators of success:**
- No `401` errors
- All steps complete with ✅
- Consistency validation runs and shows score
- Floor plans are DISTINCT for each floor
- 3D views show SAME building

---

## 🔐 Security Notes

- ✅ `.env` file is in `.gitignore` (keys won't be committed)
- ✅ Vercel environment variables are encrypted
- ✅ API keys are only exposed to serverless functions, not frontend
- ⚠️ OpenAI key appears to be a project-scoped key (`sk-proj-...`) - ensure it has proper permissions

---

## 📞 Support

If issues persist after following this guide:

1. **Check API Key Validity:**
   - OpenAI: Test at https://platform.openai.com/api-keys
   - Replicate: Test at https://replicate.com/account/api-tokens
   - Google Maps: Test at https://console.cloud.google.com/apis/credentials

2. **Verify Vercel Deployment:**
   - Check build logs for errors
   - Verify all environment variables are present
   - Confirm serverless function cold start times (first request may be slow)

3. **Contact Support:**
   - Vercel: https://vercel.com/support
   - OpenAI: https://help.openai.com/
   - Replicate: support@replicate.com

---

**Last Updated:** 2025-10-11
**Status:** Awaiting Vercel environment variable configuration
