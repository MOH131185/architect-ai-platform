# Vercel Environment Variables Fix Guide

## Problem
Your OpenAI API key is returning 401 Unauthorized errors in production, which means the environment variable is not configured correctly in Vercel.

## Solution

### Step 1: Access Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Find your project: **architect-ai-platform** (or www.archiaisolution.pro)
3. Click on the project to open it

### Step 2: Navigate to Environment Variables
1. Click on **Settings** tab (top navigation)
2. Click on **Environment Variables** in the left sidebar

### Step 3: Check/Add OpenAI API Key

Look for `REACT_APP_OPENAI_API_KEY` in the list:

#### If it EXISTS but not working:
1. Click the **three dots (•••)** next to it
2. Click **Edit**
3. Replace the value with your working OpenAI API key from your `.env` file
   - Look in your local `.env` file for: `REACT_APP_OPENAI_API_KEY=sk-...`
   - Copy the entire key (starts with `sk-svcacct-` or `sk-proj-`)
4. Make sure it's checked for **Production**, **Preview**, and **Development**
5. Click **Save**

#### If it DOESN'T EXIST:
1. Click **Add New** button (top right)
2. Enter:
   - **Key**: `REACT_APP_OPENAI_API_KEY`
   - **Value**: Get this from your local `.env` file (starts with `sk-svcacct-` or `sk-proj-`)
3. Check all environments: ✅ Production ✅ Preview ✅ Development
4. Click **Save**

### Step 4: Verify All Required Environment Variables

Make sure you have ALL four environment variables set:

| Variable Name | Value | Environments |
|--------------|-------|--------------|
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Get from your `.env` file | All ✅ |
| `REACT_APP_OPENWEATHER_API_KEY` | Get from your `.env` file | All ✅ |
| `REACT_APP_OPENAI_API_KEY` | Get from your `.env` file (starts with `sk-`) | All ✅ |
| `REACT_APP_REPLICATE_API_KEY` | Get from your `.env` file (starts with `r8_`) | All ✅ |

**Important:** Copy the exact values from your local `.env` file - don't modify them!

### Step 5: Redeploy (REQUIRED!)

**IMPORTANT:** Environment variable changes do NOT automatically apply to existing deployments!

1. Go to **Deployments** tab
2. Find the latest deployment (top of the list)
3. Click the **three dots (•••)** → **Redeploy**
4. Confirm "Redeploy"
5. Wait 2-3 minutes for deployment to complete

### Step 6: Verify It's Working

1. Visit your site: www.archiaisolution.pro
2. Open browser Developer Tools (F12)
3. Go to **Console** tab
4. Try generating a design
5. Check for errors:
   - ❌ **Before fix**: `OpenAI API error: 401`
   - ✅ **After fix**: Should see successful API calls

## Troubleshooting

### Still Getting 401 Errors?

1. **Check API key is valid:**
   - Go to https://platform.openai.com/api-keys
   - Verify your key is active and not expired
   - Generate a new key if needed

2. **Check spelling:**
   - Variable name MUST be exactly: `REACT_APP_OPENAI_API_KEY`
   - No spaces, no typos

3. **Check environments:**
   - All three checkboxes must be checked: Production, Preview, Development

4. **Force redeploy:**
   - Delete the environment variable
   - Add it again
   - Redeploy

### Need a New OpenAI API Key?

1. Go to https://platform.openai.com/api-keys
2. Click **+ Create new secret key**
3. Name it "Vercel Production"
4. Copy the key immediately (you can't see it again!)
5. Add it to Vercel environment variables
6. Redeploy

## Summary

✅ OpenWeather API: Fixed in code (now uses free v2.5 endpoint)
⚠️ OpenAI API: Requires manual Vercel configuration update + redeploy
✅ 3D Views: Fixed in code (now generates 2 exterior + 1 interior)

After completing these steps, all API errors should be resolved! 🎉
