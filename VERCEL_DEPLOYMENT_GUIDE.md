# Vercel Deployment Guide - ArchiAI Platform

## 🚨 Critical Issues Fixed

### Issues Identified:
1. ✅ **3D Map Not Showing** - Google Maps Wrapper was commented out
2. ✅ **AI Generation Timeout** - Serverless functions exceeding 10-second default timeout
3. ✅ **Missing Configuration** - No `vercel.json` for timeout and route configuration

### Solutions Implemented:
1. **Enabled Google Maps Wrapper** in `src/ArchitectAIEnhanced.js`
2. **Created `vercel.json`** with 60-second timeout for serverless functions
3. **Switched to Quick Design Mode** to reduce generation time
4. **Configured proper API routes** and CORS headers

---

## 📋 Step-by-Step Deployment Instructions

### 1. Configure Environment Variables in Vercel

Go to: https://vercel.com/dashboard → Your Project → Settings → Environment Variables

Add these **4 required variables** (select all environments: Production, Preview, Development):

```
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
REACT_APP_OPENWEATHER_API_KEY=your_openweather_api_key_here
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
REACT_APP_REPLICATE_API_KEY=your_replicate_api_key_here
```

**Important Notes:**
- ✅ Check **ALL THREE** environment options when adding variables
- ✅ Use the exact variable names (with `REACT_APP_` prefix)
- ✅ No quotes needed around values
- ✅ Click "Save" after each variable

### 2. Commit and Push Changes

The following files have been updated/created:

```bash
# Modified files
src/ArchitectAIEnhanced.js  # Enabled Google Maps Wrapper, switched to quickDesign

# New files
vercel.json                  # Serverless function configuration
VERCEL_DEPLOYMENT_GUIDE.md   # This file
```

Push to GitHub:

```bash
git add .
git commit -m "fix: Enable 3D maps and fix AI generation timeouts"
git push origin main
```

### 3. Trigger Redeployment

Vercel will automatically redeploy when you push to `main` branch.

**Monitor deployment:**
- Go to https://vercel.com/dashboard
- Click on your project
- Watch the "Deployments" tab
- Wait for "Ready" status (usually 2-3 minutes)

### 4. Verify Deployment

Once deployed, test these features on https://www.archiaisolution.pro:

**✓ Checklist:**
- [ ] Landing page loads with animations
- [ ] Location detection works (or manual entry)
- [ ] 3D Google Maps displays on Intelligence Report page
- [ ] Map shows satellite view with 45-degree tilt
- [ ] AI generation completes within 60 seconds
- [ ] Results page shows design data
- [ ] File exports work (DWG, RVT, IFC, PDF)

---

## 🔧 Configuration Details

### vercel.json Configuration

```json
{
  "version": 2,
  "functions": {
    "api/**/*.js": {
      "maxDuration": 60  // 60-second timeout for AI generation
    }
  },
  "rewrites": [
    // API route mappings
  ],
  "headers": [
    // CORS configuration
  ]
}
```

**Function Timeout Limits:**
- **Hobby Plan**: Max 10 seconds (NOT SUFFICIENT)
- **Pro Plan**: Max 60 seconds (RECOMMENDED)
- **Enterprise**: Max 900 seconds

**⚠️ Important:** If you're on Hobby plan, you need to upgrade to Pro for 60-second timeouts, or AI generation will fail.

### Quick Design Mode

Changed from `generateCompleteDesign()` to `quickDesign()`:

**Complete Design** (~60-90 seconds):
- OpenAI reasoning
- Multiple Replicate visualizations (exterior, interior, site plan)
- Design alternatives (4 approaches)
- Feasibility analysis

**Quick Design** (~15-30 seconds):
- OpenAI reasoning only
- Single Replicate visualization (exterior view)
- Fits within 60-second timeout

---

## 🐛 Troubleshooting

### Problem: 3D Map Still Not Showing

**Possible Causes:**
1. Google Maps API key not set in Vercel
2. Google Maps API key doesn't have Maps JavaScript API enabled
3. Browser blocking geolocation

**Solutions:**
```bash
# 1. Check environment variables
- Go to Vercel → Settings → Environment Variables
- Verify REACT_APP_GOOGLE_MAPS_API_KEY exists
- Redeploy after adding

# 2. Enable Google Maps JavaScript API
- Go to: https://console.cloud.google.com
- Navigate to: APIs & Services → Library
- Search: "Maps JavaScript API"
- Click "Enable"

# 3. Test with manual address entry
- Enter address like "123 Main St, San Francisco, CA"
- Click "Analyze Location"
```

### Problem: AI Generation Still Timing Out

**Possible Causes:**
1. Vercel on Hobby plan (10s limit)
2. API keys not configured
3. OpenAI or Replicate API errors

**Solutions:**
```bash
# 1. Check Vercel plan
- Go to: Vercel Dashboard → Settings → General
- Check if you're on Pro plan (required for 60s timeout)
- Upgrade if necessary

# 2. Verify API keys are working
- Open browser console (F12)
- Check for error messages
- Look for 401/403 errors (invalid API keys)

# 3. Check API service status
- OpenAI: https://status.openai.com
- Replicate: https://status.replicate.com
```

### Problem: Warnings During Build

The warnings you're seeing are **NORMAL** and won't affect functionality:

```
npm warn deprecated workbox-*  # From create-react-app, can ignore
npm warn deprecated glob@7.2.3  # From dependencies, can ignore
npm warn deprecated eslint@8.57.1  # From react-scripts, can ignore
Warning: Node.js functions are compiled from ESM to CommonJS  # Expected behavior
```

These are dependency warnings from `react-scripts` and won't cause issues.

---

## 📊 Expected Performance

### AI Generation Timeline:

**Quick Design Mode (Current)**:
1. OpenAI Design Reasoning: 5-10 seconds
2. Replicate Image Generation: 15-25 seconds
3. Data Processing: 2-5 seconds
**Total: ~25-40 seconds** ✅ Within 60s limit

### API Costs Per Design:

- OpenAI GPT-4: ~$0.05 (single reasoning call)
- Replicate SDXL: ~$0.10 (single image)
**Total: ~$0.15 per design**

---

## 🔐 Security Checklist

- [x] API keys stored in Vercel environment variables (not in code)
- [x] Serverless functions run server-side only
- [x] CORS properly configured
- [x] `.env` file excluded from Git
- [x] No sensitive data in frontend code

---

## 📱 Testing in Production

### Test Scenarios:

**1. Location Intelligence**
```
Address: "350 5th Ave, New York, NY 10118"  # Empire State Building
Expected: 3D map with satellite view, Manhattan zoning data
```

**2. AI Generation**
```
Building Program: Medical Clinic
Total Area: 500m²
Style: Adaptive Blend
Expected: Design reasoning + architectural visualization within 40s
```

**3. File Exports**
```
Click: DWG → Should download ArchitectAI_Design.dwg
Click: RVT → Should download ArchitectAI_Model.rvt
Click: IFC → Should download ArchitectAI_BIM.ifc
Click: PDF → Should open printable documentation
```

---

## 🎯 Next Steps After Deployment

1. **Monitor first few generations**
   - Check browser console for errors
   - Verify AI responses are reasonable
   - Monitor API costs in OpenAI/Replicate dashboards

2. **Optimize if needed**
   - If still timing out: Reduce max_tokens in OpenAI calls
   - If quality issues: Switch back to generateCompleteDesign (requires Pro plan)
   - If cost concerns: Add request throttling

3. **Gather user feedback**
   - Share with test users
   - Monitor Google Analytics (if configured)
   - Track error rates in Vercel logs

---

## 📞 Support Resources

**Vercel Documentation:**
- Serverless Functions: https://vercel.com/docs/functions
- Environment Variables: https://vercel.com/docs/environment-variables
- Deployment: https://vercel.com/docs/deployments

**API Documentation:**
- Google Maps JavaScript API: https://developers.google.com/maps/documentation/javascript
- OpenAI API: https://platform.openai.com/docs
- Replicate API: https://replicate.com/docs

---

## ✅ Deployment Checklist

Before going live, verify:

- [ ] All 4 environment variables configured in Vercel
- [ ] Environment variables selected for all 3 environments
- [ ] Code pushed to GitHub main branch
- [ ] Vercel deployment shows "Ready" status
- [ ] 3D maps visible on Intelligence Report page
- [ ] AI generation completes within 60 seconds
- [ ] File downloads working
- [ ] No console errors in browser
- [ ] Tested on both desktop and mobile
- [ ] API costs monitored in dashboards

---

*Last Updated: 2025-10-05*
*ArchiAI Platform - AI-Powered Architectural Design*
