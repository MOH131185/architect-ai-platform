# Vercel Environment Variables Configuration

## IMPORTANT: Variable Names Must Match Exactly

Based on your `.env` file, you need to add these EXACT environment variables to Vercel:

### Step-by-Step Configuration

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Click on: **architect-ai-platform**

2. **Navigate to Environment Variables**
   - Click: **Settings** tab
   - Click: **Environment Variables** (left sidebar)

3. **Add These Variables EXACTLY**

Copy and paste these variable names and values:

```
Variable Name: REACT_APP_OPENAI_API_KEY
Value: [Your OpenAI API key starting with sk-proj-]
Environments: ✅ Production ✅ Preview ✅ Development
```

```
Variable Name: REACT_APP_REPLICATE_API_KEY
Value: [Your Replicate API key starting with r8_]
Environments: ✅ Production ✅ Preview ✅ Development
```

```
Variable Name: REACT_APP_GOOGLE_MAPS_API_KEY
Value: [Your Google Maps API key]
Environments: ✅ Production ✅ Preview ✅ Development
```

```
Variable Name: REACT_APP_OPENWEATHER_API_KEY
Value: [Your OpenWeather API key]
Environments: ✅ Production ✅ Preview ✅ Development
```

## CRITICAL: Check All Three Environment Boxes

For EACH variable above:
1. Enter the exact **Variable Name** (case-sensitive!)
2. Paste your **API key value**
3. **CHECK ALL THREE BOXES**:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

## After Adding Variables

1. **Redeploy Your Application**
   - Go to **Deployments** tab
   - Find the latest deployment
   - Click the **...** menu
   - Select **Redeploy**
   - Confirm redeploy

2. **Wait for Deployment**
   - Takes about 2-3 minutes
   - Check the deployment logs for any errors

## Verify Your Configuration

After redeployment, check:

1. **Visit your site**: https://www.archiaisolution.pro
2. **Open browser console** (F12)
3. **Try generating a design**
4. **Look for these signs of success**:
   - No 401 errors in console
   - "AI design generation started" message
   - Images begin loading

## Troubleshooting

### If you still get 401 errors:

1. **Double-check variable names** - They must be EXACTLY:
   - `REACT_APP_OPENAI_API_KEY` (not `OPENAI_API_KEY`)
   - `REACT_APP_REPLICATE_API_KEY` (not `REPLICATE_API_KEY`)

2. **Verify API keys are valid**:
   - OpenAI: Should start with `sk-proj-` or `sk-`
   - Replicate: Should start with `r8_`

3. **Check Vercel Function Logs**:
   - Go to **Functions** tab in Vercel
   - Click on `openai-chat`
   - Check recent invocations for errors

### Common Issues:

- **Variable name mismatch**: Use EXACT names above
- **Forgot to check all 3 environments**: Must check Production, Preview, AND Development
- **Didn't redeploy**: Changes don't take effect until you redeploy
- **Invalid API key**: Test your keys locally first

## Local Testing

To verify your API keys work:

1. Your `.env` file should have:
```env
REACT_APP_OPENAI_API_KEY=your_key_here
REACT_APP_REPLICATE_API_KEY=your_key_here
REACT_APP_GOOGLE_MAPS_API_KEY=your_key_here
REACT_APP_OPENWEATHER_API_KEY=your_key_here
```

2. Run locally:
```bash
npm install
npm run dev
```

3. Test at http://localhost:3000

If it works locally but not on Vercel, it's definitely an environment variable configuration issue.

---

Last updated: ${new Date().toISOString()}