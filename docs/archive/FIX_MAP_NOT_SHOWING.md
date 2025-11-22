# 🔧 Fix: Google Map Not Showing

## Immediate Actions

### 1. Restart Development Server (REQUIRED)

Environment variables require a fresh start:

```bash
# Stop the current server (Ctrl+C in terminal)
# Then restart:
npm start
```

**Why**: React apps need restart to load new `.env` variables.

### 2. Check Browser Console

Open DevTools (F12) and look for these messages:

**✅ Success messages you should see:**
```
Map container not ready yet
Initializing Google Maps...
Google Maps loaded successfully!
```

**❌ Error messages to watch for:**
```
RefererNotAllowedMapError → Fix API key restrictions
REQUEST_DENIED → Enable APIs in Google Cloud
Map container not found → Already fixed in code
```

### 3. Clear Browser Cache

```bash
# Chrome/Edge: Ctrl+Shift+Delete
# Firefox: Ctrl+Shift+Del
# Or try incognito/private window
```

## Files Updated

I've already fixed several issues in these files:

### ✅ `src/components/map/SiteBoundaryEditor.jsx`
- Added map container mounting state
- Added debug logging
- Improved error handling
- Added reload button on error

### ✅ `src/components/map/useGoogleMap.js`
- Added null container check
- Added console logging for debugging
- Improved initialization sequence

### 🆕 `src/components/map/MapTest.jsx`
- Simple test component to verify setup
- Useful for debugging

### 🆕 `docs/MAP_TROUBLESHOOTING.md`
- Complete troubleshooting guide
- Step-by-step debugging

## Testing Steps

### Step 1: Verify API Key Is Loading

Add this temporarily to `LocationStep.jsx` to see the API key:

```jsx
useEffect(() => {
  console.log('API Key check:', {
    exists: !!process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    preview: process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.substring(0, 10)
  });
}, []);
```

Should show: `{ exists: true, preview: 'AIzaSyA34N' }`

### Step 2: Test With MapTest Component

Create a test route:

```jsx
// src/App.js or create a test page
import MapTest from './components/map/MapTest';

// Add route or render:
<MapTest />
```

Navigate to it. If this works but SiteBoundaryEditor doesn't, issue is in the editor.

### Step 3: Check LocationData

Add logging in `LocationStep.jsx`:

```jsx
useEffect(() => {
  if (locationData) {
    console.log('LocationData:', {
      hasCoordinates: !!locationData.coordinates,
      lat: locationData.coordinates?.lat,
      lng: locationData.coordinates?.lng,
      address: locationData.address
    });
  }
}, [locationData]);
```

Should show valid lat/lng values.

## Common Issues and Fixes

### Issue 1: "Map container not mounted"

**Status**: ✅ Already fixed in updated code

**What was wrong**: React ref not ready before Google Maps initialized

**Fix applied**: Added `mapContainerMounted` state to wait for ref

### Issue 2: API Key Not Loading

**Symptoms**: Console shows "API key missing"

**Fix**:
```bash
# 1. Verify .env file exists in project root
ls .env

# 2. Check contents
cat .env | grep GOOGLE_MAPS

# 3. Restart server
npm start
```

### Issue 3: Google Maps API Errors

**Symptoms**: Console shows "RefererNotAllowedMapError"

**Fix**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Click your API key
4. Under "Application restrictions" → Select "None"
5. Under "API restrictions" → Select "Don't restrict key"
6. Save

### Issue 4: Gray Map / Tiles Not Loading

**Symptoms**: Map loads but shows gray squares

**Causes**:
- Billing not enabled
- API quota exceeded
- Wrong map type

**Fix**:
1. Check Google Cloud Console → Billing
2. Check quotas: APIs & Services → Quotas
3. Try different mapTypeId: `roadmap` instead of `hybrid`

### Issue 5: Map Briefly Appears Then Disappears

**Symptoms**: Map flashes then vanishes

**Cause**: Component re-rendering

**Fix**: Already applied - using refs and proper useEffect dependencies

## Debugging Commands

Run in browser console:

```javascript
// 1. Check if Google Maps loaded
window.google?.maps ? console.log('✅ Google Maps loaded') : console.log('❌ Not loaded');

// 2. Check API key
console.log('API Key:', process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.substring(0, 15) + '...');

// 3. Check map container
const container = document.querySelector('[ref]');
console.log('Container found:', !!container, container?.offsetHeight);

// 4. Check for errors
console.log('Errors:', window.errors);
```

## Quick Fix Checklist

- [ ] Restart development server (`npm start`)
- [ ] Clear browser cache (Ctrl+Shift+Delete)
- [ ] Check console for errors (F12)
- [ ] Verify API key is set (check .env file)
- [ ] Try MapTest component
- [ ] Check Google Cloud Console (APIs enabled, billing active)
- [ ] Try incognito/private browsing
- [ ] Check network tab for failed requests

## Expected Console Output (Success)

When working correctly, console should show:

```
LocationData: { hasCoordinates: true, lat: 37.7749, lng: -122.4194 }
Map container not ready yet
Map container not ready yet (may repeat)
Initializing Google Maps... { apiKey: "AIzaSyA34N..." }
Google Maps loaded successfully! { center: {...}, zoom: 18, mapType: "HYBRID" }
SiteBoundaryEditor Debug: {
  apiKey: "Set",
  mapContainerMounted: true,
  isLoading: false,
  isLoaded: true,
  hasMap: true,
  hasGoogle: true,
  mapError: undefined
}
```

## If Still Not Working

Try this minimal implementation to isolate the issue:

```jsx
// Create src/components/MinimalMap.jsx
import React, { useRef, useEffect } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

function MinimalMap() {
  const mapRef = useRef(null);

  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
      version: 'weekly'
    });

    loader.load().then((google) => {
      new google.maps.Map(mapRef.current, {
        center: { lat: 37.7749, lng: -122.4194 },
        zoom: 15,
        mapTypeId: google.maps.MapTypeId.ROADMAP
      });
    });
  }, []);

  return (
    <div>
      <h1>Minimal Map Test</h1>
      <div ref={mapRef} style={{ width: '100%', height: '500px', backgroundColor: '#e0e0e0' }} />
    </div>
  );
}

export default MinimalMap;
```

If this works, the issue is in SiteBoundaryEditor. If this doesn't work, issue is with Google Maps setup.

## Next Steps

1. **Restart server** - Most important!
2. **Check console** - Look for debug messages
3. **Try MapTest** - Isolate the issue
4. **Review troubleshooting doc** - `docs/MAP_TROUBLESHOOTING.md`

## Support

If you're still having issues after trying these steps, share:

1. Console output (full error messages)
2. Network tab (failed requests)
3. Browser and version
4. Whether MinimalMap or MapTest works

The debug logs I added will help identify exactly where the issue is!

---

**Status**: ✅ Code fixes applied  
**Action Required**: Restart development server  
**Time to Fix**: 2-5 minutes

