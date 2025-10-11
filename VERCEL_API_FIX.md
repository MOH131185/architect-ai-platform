# 🔧 Vercel API Configuration Fix Guide

## ⚠️ Current Issue
Your deployment is experiencing **401 Unauthorized** errors when calling the OpenAI API. This means the API keys are not properly configured in Vercel.

## 🎯 Quick Fix Steps

### Step 1: Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Click on your project: **architect-ai-platform**

### Step 2: Navigate to Settings
1. Click the **Settings** tab at the top
2. In the left sidebar, click **Environment Variables**

### Step 3: Add ALL Required API Keys

You need to add these 4 environment variables:

```bash
REACT_APP_GOOGLE_MAPS_API_KEY = your_google_maps_key_here
REACT_APP_OPENWEATHER_API_KEY = your_openweather_key_here
REACT_APP_OPENAI_API_KEY = your_openai_key_here
REACT_APP_REPLICATE_API_KEY = your_replicate_key_here
```

### Step 4: CRITICAL - Select All Environments
For EACH variable above:
1. Enter the **Key** (e.g., `REACT_APP_OPENAI_API_KEY`)
2. Enter the **Value** (your actual API key)
3. **IMPORTANT**: Check ALL three boxes:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
4. Click **Save**

### Step 5: Redeploy to Apply Changes
After adding all variables:
1. Go to the **Deployments** tab
2. Find your latest deployment
3. Click the three dots menu (...)
4. Select **Redeploy**
5. Click **Redeploy** in the confirmation dialog

## 🔑 Where to Get API Keys

### OpenAI API Key (REQUIRED for AI generation)
1. Visit: https://platform.openai.com/api-keys
2. Click **+ Create new secret key**
3. Name it: "ArchitectAI"
4. Copy the key (you won't see it again!)
5. **Important**: Ensure you have credits in your account

### Replicate API Key (REQUIRED for image generation)
1. Visit: https://replicate.com/account/api-tokens
2. Click **Create token**
3. Name it: "ArchitectAI"
4. Copy the token

### Google Maps API Key
1. Visit: https://console.cloud.google.com/apis/credentials
2. Create a new project or select existing
3. Click **+ CREATE CREDENTIALS** → **API Key**
4. Enable these APIs:
   - Maps JavaScript API
   - Geocoding API
   - Places API
5. Add website restriction: `https://www.archiaisolution.pro/*`

### OpenWeather API Key
1. Visit: https://openweathermap.org/api
2. Sign up for free account
3. Go to **API keys** tab
4. Copy your default key or create new one

## 🧪 Testing Your Fix

After redeployment (takes ~2 minutes):

1. Visit your site: https://www.archiaisolution.pro
2. Enter a location (or use auto-detect)
3. Upload portfolio images (or skip)
4. Enter project specifications
5. Click **Generate AI Designs**
6. Check browser console (F12) for any errors

### Expected Result
- No more 401 errors
- AI generation starts successfully
- Images begin appearing after 30-60 seconds

### If Still Getting Errors
Open browser console (F12) and check for:
- **401 errors** → API key not set correctly
- **403 errors** → API key invalid or no credits
- **Network errors** → Check API service status

## 📊 API Usage & Costs

### OpenAI (GPT-4)
- Cost: ~$0.10-0.20 per design
- Check usage: https://platform.openai.com/usage
- Add credits: https://platform.openai.com/account/billing

### Replicate (SDXL)
- Cost: ~$0.15-0.45 per design
- Check usage: https://replicate.com/account/billing
- Add credits: https://replicate.com/pricing

## 🔒 Security Notes

1. **Never commit API keys to GitHub**
   - They should only be in Vercel Environment Variables
   - The `.env` file is gitignored for local development

2. **API Key Rotation**
   - Rotate keys every 90 days
   - Delete unused keys immediately

3. **Domain Restrictions**
   - Google Maps: Restrict to your domain
   - Consider implementing rate limiting

## ✅ Verification Checklist

After configuration:
- [ ] All 4 API keys added to Vercel
- [ ] All keys have all 3 environments checked
- [ ] Site redeployed after adding keys
- [ ] No 401 errors in browser console
- [ ] AI generation works successfully
- [ ] Images generate properly

## 🚨 Common Issues

### Issue: Still getting 401 after adding keys
**Solution**: Make sure you clicked "Redeploy" after adding variables

### Issue: 403 Forbidden from OpenAI
**Solution**: Add billing/credits to your OpenAI account

### Issue: Images not generating
**Solution**: Check Replicate API key and account credits

### Issue: Location features not working
**Solution**: Check Google Maps and OpenWeather keys

## 📞 Need More Help?

1. Check Vercel deployment logs:
   - Deployments tab → Click on deployment → View Function Logs

2. Test API keys locally:
   - Create `.env` file in project root
   - Add same variables (without quotes)
   - Run `npm run dev` to test locally

3. API Documentation:
   - OpenAI: https://platform.openai.com/docs
   - Replicate: https://replicate.com/docs
   - Google Maps: https://developers.google.com/maps
   - OpenWeather: https://openweathermap.org/api

---

**Last Updated**: ${new Date().toISOString()}
**Platform Version**: 2.0.1 (with ProjectDNA fixes)