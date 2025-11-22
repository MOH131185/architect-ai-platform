# Google Maps Error Fix Guide

## Error Messages
- **"Impossible de charger Google Maps correctement"** - Cannot load Google Maps correctly
- **"La carte est initialisée sans ID de carte valide"** - Map initialized without valid Map ID

## Quick Solution Steps

### 1. Check API Key in `.env` file

Make sure you have a valid Google Maps API key in your `.env` file:

```env
REACT_APP_GOOGLE_MAPS_API_KEY=AIza...your_actual_key_here
```

**Common mistakes:**
- ❌ Missing the key entirely
- ❌ Using quotes around the key
- ❌ Typo in the variable name
- ❌ Not restarting server after adding key

### 2. Enable Required APIs in Google Cloud Console

Go to [Google Cloud Console](https://console.cloud.google.com/) and enable these APIs:

1. **Maps JavaScript API** ✅ (Required)
2. **Geocoding API** ✅ (Required)
3. **Places API** ✅ (Required)
4. **Maps Static API** ✅ (For snapshots)

### 3. Fix API Key Restrictions

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your API key
3. Under **Application restrictions**, choose one:
   - **None** (easiest for development)
   - **HTTP referrers** and add:
     ```
     http://localhost:3000/*
     http://localhost:3001/*
     http://localhost/*
     ```

### 4. Ensure Billing is Active

Google Maps requires billing (but includes $200 free credit/month):
- Go to [Billing](https://console.cloud.google.com/billing)
- Link a billing account to your project
- You won't be charged unless you exceed $200/month

### 5. Test Your API Key

Test the key directly by visiting this URL (replace YOUR_KEY):
```
https://maps.googleapis.com/maps/api/geocode/json?address=Paris&key=YOUR_KEY
```

You should see JSON data, not an error.

### 6. Restart Development Server

After fixing `.env`:
```bash
# Stop server (Ctrl+C)
# Restart
npm run dev
```

## Optional: Add Map ID (removes warning)

1. Go to [Map Management](https://console.cloud.google.com/google/maps-apis/studio/maps)
2. Create a new Map ID
3. Add to `.env`:
```env
REACT_APP_GOOGLE_MAPS_MAP_ID=your_map_id_here
```

## Diagnostic Commands

Run in browser console (F12) to check:

```javascript
// Check if API key exists
console.log('API Key exists:', !!process.env.REACT_APP_GOOGLE_MAPS_API_KEY);

// Check key format (should start with AIza)
console.log('Key starts with:', process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.substring(0, 4));
```

## If Maps Still Don't Load

The app can still function without Google Maps:
- ✅ You can enter addresses manually
- ✅ You can draw boundaries manually
- ✅ Site analysis will still work
- ❌ 3D map view won't be available
- ❌ Auto site capture won't work

## Common Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| InvalidKeyMapError | Invalid API key | Check key in .env |
| RefererNotAllowedMapError | URL not allowed | Fix API restrictions |
| OverQuotaMapError | Billing/quota issue | Check billing account |
| ApiNotActivatedMapError | API not enabled | Enable in Cloud Console |

## Note about QuillBot Error

The `updateCopyPasteInfo()` error is from the QuillBot browser extension and is unrelated to Google Maps. You can safely ignore it or disable the QuillBot extension.