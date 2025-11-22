# Google Maps API Configuration Guide

## Error Message
"Impossible de charger Google Maps correctement sur cette page" (Unable to load Google Maps correctly on this page)

## Causes & Solutions

### 1. Missing API Key
**Check:** Ensure `REACT_APP_GOOGLE_MAPS_API_KEY` is set in your `.env` file:
```bash
REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
```

### 2. Required APIs Not Enabled
Enable these APIs in Google Cloud Console:
- ✅ **Maps JavaScript API** (for interactive map component)
- ✅ **Static Maps API** (for site map snapshots)
- ✅ **Geocoding API** (for address conversion)
- ✅ **Places API** (optional, for place details)

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to "APIs & Services" > "Library"
4. Search for each API and click "Enable"

### 3. API Key Restrictions
Check API key restrictions in Google Cloud Console:

**Application restrictions:**
- For development: Use "HTTP referrers" and add:
  - `http://localhost:3000/*`
  - `http://localhost:3001/*`
- For production: Add your domain:
  - `https://yourdomain.com/*`
  - `https://*.yourdomain.com/*`

**API restrictions:**
- Select "Restrict key" and choose:
  - Maps JavaScript API
  - Static Maps API
  - Geocoding API

### 4. Billing Enabled
Google Maps APIs require billing to be enabled:
1. Go to "Billing" in Google Cloud Console
2. Link a billing account
3. Set up a payment method

**Note:** Google provides $200/month free credit, which covers most development/testing usage.

### 5. Domain Restrictions
If your API key is restricted to specific domains, ensure:
- Your current domain matches the restriction
- `localhost` is included for development
- No typos in domain patterns

### 6. Browser Console Errors
Check browser console (F12) for specific error messages:
- "This API key is not authorized" → Enable required APIs
- "RefererNotAllowedMapError" → Add domain to restrictions
- "ApiNotActivatedMapError" → Enable Maps JavaScript API
- "BillingNotEnabledMapError" → Enable billing

## Quick Fix Checklist

- [ ] API key exists in `.env` file as `REACT_APP_GOOGLE_MAPS_API_KEY`
- [ ] Maps JavaScript API is enabled
- [ ] Static Maps API is enabled
- [ ] Geocoding API is enabled
- [ ] API key restrictions allow your domain/localhost
- [ ] Billing is enabled on Google Cloud project
- [ ] Restart dev server after adding/changing API key (`npm run dev`)

## Testing Site Map Snapshot Feature

Once Google Maps is working, test the site map snapshot:

```bash
node scripts/test-a1-oneshot-site.js
```

This will:
1. Fetch a Google Static Maps snapshot
2. Generate A1 sheet with site map included
3. Verify site map metadata in results

## Fallback Behavior

If the Google Maps API key is missing or fails:
- ✅ Interactive map shows error message (graceful degradation)
- ✅ Site map snapshot returns `null` (no crash)
- ✅ A1 sheet generation falls back to text-to-image mode
- ✅ Workflow continues without site map

The site map feature enhances the A1 sheet but is **not required** for generation to work.

