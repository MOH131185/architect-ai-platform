# Google Maps Troubleshooting Guide

## Issue: Map Not Showing

### Quick Checklist

1. **API Key Check**
   ```bash
   # Check if API key is set
   grep REACT_APP_GOOGLE_MAPS_API_KEY .env
   ```
   - ✅ Should show: `REACT_APP_GOOGLE_MAPS_API_KEY=AIza...`
   - ❌ If missing, add it to `.env` file

2. **Restart Development Server**
   ```bash
   # Stop server (Ctrl+C)
   # Clear cache and restart
   npm start
   ```
   - Environment variables require restart to load

3. **Check Browser Console**
   - Open DevTools (F12)
   - Look for errors in Console tab
   - Common errors and fixes below

### Common Errors and Solutions

#### Error: "Google Maps JavaScript API has been loaded directly"
**Cause**: Multiple Google Maps scripts loading  
**Fix**: Check if `@googlemaps/react-wrapper` is interfering
```bash
npm list @googlemaps/react-wrapper
npm uninstall @googlemaps/react-wrapper  # If not needed elsewhere
```

#### Error: "RefererNotAllowedMapError"
**Cause**: API key restrictions  
**Fix**: 
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to: APIs & Services → Credentials
3. Click your API key
4. Under "Application restrictions", select "None" for testing
5. Save changes

#### Error: "Map container not found"
**Cause**: React ref not initialized before map loads  
**Fix**: Already fixed in updated `SiteBoundaryEditor.jsx`

#### Error: "REQUEST_DENIED"
**Cause**: API key not valid or APIs not enabled  
**Fix**:
1. Verify API key is correct
2. Enable these APIs in Google Cloud Console:
   - Maps JavaScript API
   - Geocoding API
   - Places API (optional)

### Step-by-Step Debugging

#### Step 1: Test Basic Map Loading

Create a simple test page:

```jsx
// src/components/MapDebug.jsx
import React, { useRef, useEffect } from 'react';

function MapDebug() {
  const mapRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.onload = () => {
      new window.google.maps.Map(mapRef.current, {
        center: { lat: 37.7749, lng: -122.4194 },
        zoom: 15
      });
    };
    document.head.appendChild(script);
  }, []);

  return <div ref={mapRef} style={{ width: '100%', height: '500px' }} />;
}

export default MapDebug;
```

Add to a route and test. If this works, issue is with SiteBoundaryEditor.

#### Step 2: Use MapTest Component

```jsx
// In your App.js or a test route
import MapTest from './components/map/MapTest';

// Add route or render directly
<MapTest />
```

Check console for debug messages.

#### Step 3: Check Network Tab

1. Open DevTools → Network tab
2. Reload page
3. Look for:
   - `maps.googleapis.com/maps/api/js` - Should be 200 OK
   - Any failed requests (red)

#### Step 4: Verify LocationData Structure

Check if `locationData.coordinates` has correct format:

```javascript
console.log('Location Data:', {
  hasLocationData: !!locationData,
  coordinates: locationData?.coordinates,
  address: locationData?.address
});

// Should show:
// {
//   hasLocationData: true,
//   coordinates: { lat: 37.7749, lng: -122.4194 },
//   address: "..."
// }
```

### Browser-Specific Issues

#### Chrome
- Clear cache: DevTools → Network → "Disable cache" checkbox
- Try incognito mode
- Check for ad blockers blocking Google APIs

#### Firefox
- Enhanced Tracking Protection might block maps
- Settings → Privacy → Standard mode

#### Safari
- Disable "Prevent cross-site tracking"
- Safari → Preferences → Privacy

### Environment Variable Issues

#### Not Loading in Development

```bash
# Verify .env is in project root
ls -la | grep .env

# Check file contents
cat .env

# Restart server after changes
npm start
```

#### Not Loading in Production (Vercel)

1. Go to Vercel dashboard
2. Project → Settings → Environment Variables
3. Add: `REACT_APP_GOOGLE_MAPS_API_KEY`
4. Value: Your API key
5. Environment: All (Production, Preview, Development)
6. Save and redeploy

### CSS/Layout Issues

#### Map Container Has Zero Height

Check if container has explicit height:

```jsx
<div
  ref={mapContainerRef}
  className="w-full h-[500px]"  // ← Must have height
  style={{ minHeight: '500px' }}  // ← Fallback
/>
```

#### Map Appears But Is Gray

**Cause**: Container rendered before Google Maps loaded  
**Fix**: Use loading state

```jsx
{isLoaded && map ? (
  <div ref={mapRef} className="w-full h-[500px]" />
) : (
  <div className="w-full h-[500px] bg-gray-200 flex items-center justify-center">
    Loading map...
  </div>
)}
```

### React-Specific Issues

#### Component Re-rendering Breaks Map

**Cause**: Map instance destroyed on re-render  
**Fix**: Use `useRef` and `useEffect` correctly

```jsx
const mapRef = useRef(null);
const mapInstanceRef = useRef(null);

useEffect(() => {
  if (!mapInstanceRef.current && mapRef.current) {
    // Create map only once
    mapInstanceRef.current = new google.maps.Map(mapRef.current, {...});
  }
}, []);
```

#### Map Shows Briefly Then Disappears

**Cause**: Parent component re-rendering  
**Fix**: Memoize SiteBoundaryEditor

```jsx
import { memo } from 'react';

const SiteBoundaryEditor = memo(({ ... }) => {
  // component code
});
```

### Debug Console Commands

Open browser console and run:

```javascript
// Check if Google Maps is loaded
console.log('Google Maps:', window.google?.maps ? '✅ Loaded' : '❌ Not loaded');

// Check API key
console.log('API Key:', process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.substring(0, 10) + '...');

// Check map container
const container = document.querySelector('[ref="mapContainer"]');
console.log('Container:', container, 'Size:', container?.offsetWidth, 'x', container?.offsetHeight);

// Force reload
window.location.reload();
```

### Still Not Working?

1. **Check our debug logs**: Look for "SiteBoundaryEditor Debug:" in console
2. **Try MapTest component**: Should isolate if issue is with our code or setup
3. **Verify API billing**: Free tier has limits, check Google Cloud Console
4. **Check API quotas**: Maps JavaScript API might be over quota

### Contact Info for Support

If still having issues, check:
- Browser: Version and name
- Console errors: Full error message
- Network tab: Failed requests
- Environment: Development or production
- API key: First 10 characters (for verification)

### Quick Fixes Summary

```bash
# 1. Check API key
grep REACT_APP_GOOGLE_MAPS_API_KEY .env

# 2. Restart server
npm start

# 3. Clear browser cache
# Chrome: Ctrl+Shift+Delete

# 4. Test with MapTest component
# Add <MapTest /> to your app

# 5. Check Google Cloud Console
# - APIs enabled
# - Billing active
# - No restrictions on API key

# 6. Check console for errors
# F12 → Console tab
```

### Success Indicators

When working correctly, you should see:

1. **Console logs**:
   ```
   Map container not ready yet (initial)
   Initializing Google Maps...
   Google Maps loaded successfully!
   SiteBoundaryEditor Debug: { isLoaded: true, hasMap: true }
   ```

2. **Visual indicators**:
   - Map loads with satellite/hybrid view
   - Can zoom and pan
   - No gray tiles
   - Controls visible (zoom, fullscreen)

3. **Network tab**:
   - `maps.googleapis.com` requests succeed (200)
   - No CORS errors
   - API key in request URL

### Backup: Simple Implementation

If all else fails, use this minimal implementation:

```jsx
import React, { useEffect, useRef } from 'react';

function SimpleMap() {
  const mapRef = useRef(null);

  useEffect(() => {
    const loadMap = async () => {
      const { Loader } = await import('@googlemaps/js-api-loader');
      
      const loader = new Loader({
        apiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
        version: 'weekly'
      });

      const google = await loader.load();
      
      new google.maps.Map(mapRef.current, {
        center: { lat: 37.7749, lng: -122.4194 },
        zoom: 15,
        mapTypeId: 'hybrid'
      });
    };

    if (mapRef.current) {
      loadMap();
    }
  }, []);

  return <div ref={mapRef} style={{ width: '100%', height: '500px' }} />;
}
```

This should work if Google Maps API is properly set up.

