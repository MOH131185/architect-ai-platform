# Vercel Deployment Guide

## ✅ Ready to Deploy!

Your application is configured with Vercel serverless functions and will work automatically once deployed.

## Step 1: Configure Vercel Environment Variables

After your next push to GitHub triggers a Vercel deployment, add these environment variables in the Vercel dashboard:

1. Go to https://vercel.com/dashboard
2. Select your project: **architect-ai-platform**
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

```
REACT_APP_GOOGLE_MAPS_API_KEY=<your_google_maps_api_key>
REACT_APP_OPENWEATHER_API_KEY=<your_openweather_api_key>
REACT_APP_OPENAI_API_KEY=<your_openai_api_key>
REACT_APP_REPLICATE_API_KEY=<your_replicate_api_key>
```

**Note:** Use the same API keys from your local `.env` file. Copy them from there.

**Important:** Add each variable separately, ensuring:
- Environment: Production, Preview, and Development (select all three)
- Click "Save" after adding each variable

## Step 2: Redeploy (if needed)

After adding environment variables:
1. Go to **Deployments** tab
2. Find the latest deployment
3. Click the three dots (•••) → **Redeploy**

OR simply push a new commit to GitHub to trigger auto-deployment.

## Step 3: Test Your Deployment

Once deployed, visit: **https://www.archiaisolution.pro**

Test the AI features:
1. You should see the AIMVP interface
2. Fill in project details
3. Click "Quick Design (MVP)"
4. Wait 30-60 seconds for AI generation

## How It Works in Production

### Serverless Functions (Automatic)

Vercel automatically deploys the `/api` directory as serverless functions:

- **`/api/openai-chat.js`** → https://www.archiaisolution.pro/api/openai-chat
- **`/api/replicate-predictions.js`** → https://www.archiaisolution.pro/api/replicate-predictions
- **`/api/replicate-status.js`** → https://www.archiaisolution.pro/api/replicate-status

### Environment Detection

The application automatically uses:
- **Production**: Vercel serverless functions (`/api/*`)
- **Development**: Local proxy server (`http://localhost:3001/api/*`)

No code changes needed!

## Verifying Deployment

### Check 1: Build Logs
In Vercel dashboard, check the build logs for errors.

### Check 2: Function Logs
Go to **Deployments** → Select deployment → **Functions** tab to see serverless function logs.

### Check 3: Browser Console
Open DevTools (F12) and check:
- No CORS errors
- API calls going to `/api/openai-chat` and `/api/replicate-predictions`
- Responses coming back successfully

## Troubleshooting

### Issue: 500 Internal Server Error
**Solution**: Check that environment variables are set in Vercel dashboard.

### Issue: Functions not found (404)
**Solution**: Ensure `/api` directory is committed to Git and deployed.

### Issue: CORS errors
**Solution**: Serverless functions include CORS headers. Clear browser cache.

### Issue: OpenAI/Replicate errors
**Solution**:
- Verify API keys are correct in Vercel environment variables
- Check API usage limits in OpenAI/Replicate dashboards
- Review function logs in Vercel

## Cost Monitoring

### Vercel
- **Free tier**: 100GB bandwidth, unlimited serverless function executions
- **Pro tier** ($20/month): If you exceed free tier

### OpenAI
- Monitor usage: https://platform.openai.com/usage
- Set spending limits in OpenAI dashboard

### Replicate
- Monitor usage: https://replicate.com/account/billing
- Each image generation: ~$0.05-$0.15

## Security Best Practices

✅ **Already Implemented:**
- API keys stored in environment variables (never in code)
- CORS headers on all serverless functions
- `.env` file excluded from Git
- Serverless functions run server-side only

🔒 **Recommended Next Steps:**
- Set up rate limiting (Vercel Pro feature)
- Add authentication for production use
- Monitor API usage to prevent abuse
- Set up alerts for unusual activity

## Next Deployment

To deploy updates:
```bash
git add .
git commit -m "Your commit message"
git push origin main
```

Vercel will automatically:
1. Detect the push
2. Build your app
3. Deploy serverless functions
4. Make it live at www.archiaisolution.pro

---

**Status**: ✅ Ready for deployment
**Serverless Functions**: 3 endpoints configured
**Environment**: Production-ready
