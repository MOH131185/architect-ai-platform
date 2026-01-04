# Emergency Troubleshooting - Website Still Freezing

## Quick Diagnosis

If the website is still freezing after the latest deployment, here are immediate steps:

### 1. Check What's Happening

**Open Browser Console (F12) and look for:**

```javascript
// Infinite loop indicators:
- Hundreds of console.log messages appearing rapidly
- "Maximum update depth exceeded"
- "Too much recursion"
- Browser tab showing "Page Unresponsive"

// Map loading issues:
- "InvalidKeyMapError"
- "Google Maps JavaScript API error"
- "Failed to load Google Maps"
```

### 2. Identify Where It Freezes

**Which page freezes?**
- Landing page (step 0)? → Animation issue
- Location input (step 1)? → Form issue
- Intelligence Report (step 2)? → Map issue ← **MOST LIKELY**
- Portfolio upload (step 3)? → File upload issue
- Specifications (step 4)? → Form issue
- AI generation (step 5)? → API timeout issue

### 3. Immediate Workarounds

#### Option A: Disable Google Maps Temporarily

If it freezes on Intelligence Report page, the Google Maps Wrapper might be causing issues.

**Quick fix:**
1. Comment out the Wrapper in `src/ArchitectAIEnhanced.js` lines 1697 and 1748
2. This will disable maps but allow rest of app to work

#### Option B: Skip to AI Generation

If maps are freezing but you need to test AI generation:
1. Modify `currentStep` initialization to start at step 3 or 4
2. Bypass the map rendering entirely

#### Option C: Use Maintenance Mode

If everything freezes:
1. Switch back to simple `App.js` without ArchitectAIEnhanced
2. Show maintenance page instead

---

## Detailed Diagnostics

### Test 1: Is Google Maps API Loading?

Open browser console on Intelligence Report page and type:

```javascript
console.log(window.google?.maps);
```

**Expected:** Object with Map, Marker, etc.
**If undefined:** Google Maps API not loading (API key issue)
**If error:** API restrictions or quota exceeded

### Test 2: Check Environment Variables

On any page, open console and type:

```javascript
console.log({
  maps: process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.substring(0, 10),
  weather: process.env.REACT_APP_OPENWEATHER_API_KEY?.substring(0, 10),
  openai: process.env.REACT_APP_OPENAI_API_KEY?.substring(0, 10),
  replicate: process.env.REACT_APP_REPLICATE_API_KEY?.substring(0, 10)
});
```

**Expected:** All should show first 10 characters
**If undefined:** Environment variables not loading at build time

### Test 3: Check React DevTools

Install React DevTools extension and check:
- Which component is re-rendering repeatedly?
- What props/state are changing?
- Any warnings in the Profiler?

---

## Possible Root Causes

### A. Google Maps API Key Issues

**Symptoms:**
- Freezes specifically on Intelligence Report page (step 2)
- Console shows "InvalidKeyMapError" or "MissingKeyMapError"

**Causes:**
1. API key not set in environment variables
2. API key has wrong restrictions (domain not whitelisted)
3. Google Maps JavaScript API not enabled
4. API key billing not set up

**Fix:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your API key
3. Check "Application restrictions" → Add `*.archiaisolution.pro/*` and `*.vercel.app/*`
4. Check "API restrictions" → Ensure "Maps JavaScript API" is enabled
5. Save and wait 5 minutes for propagation

### B. Wrapper Component Loading Issue

**Symptoms:**
- Freezes right after Intelligence Report page renders
- Console shows errors related to @googlemaps/react-wrapper

**Causes:**
1. Wrapper trying to load Google Maps script multiple times
2. API key prop causing re-renders
3. Libraries prop configuration issue

**Fix:**
```javascript
// Option 1: Add error boundary around Wrapper
<ErrorBoundary>
  <Wrapper apiKey={...} libraries={['maps']}>
    ...
  </Wrapper>
</ErrorBoundary>

// Option 2: Conditional rendering
{process.env.REACT_APP_GOOGLE_MAPS_API_KEY ? (
  <Wrapper apiKey={...} libraries={['maps']}>
    ...
  </Wrapper>
) : (
  <div>Map unavailable</div>
)}
```

### C. MapView Component Still Has Issues

**Symptoms:**
- Freezes specifically when map container appears
- React DevTools shows MapView re-rendering infinitely

**Cause:**
Despite the fix, there might be another trigger for re-renders.

**Fix:**
Add more guards:

```javascript
const MapView = ({ center, zoom }) => {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const inititalizedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (inititalizedRef.current) return;
    if (!ref.current || !window.google) return;

    inititalizedRef.current = true;

    // ... rest of initialization
  }, []);

  // ... rest of component
};
```

### D. Environment Variables Not Loading

**Symptoms:**
- All pages work except when trying to use external APIs
- Console shows "undefined" for API keys

**Cause:**
Vercel environment variables not available at build time.

**Fix:**
1. Ensure variables are set for "Production" environment in Vercel
2. Trigger new deployment AFTER setting variables
3. Check build logs for environment variable loading

---

## Nuclear Options (If Nothing Else Works)

### Option 1: Remove Google Maps Temporarily

```javascript
// In ArchitectAIEnhanced.js, replace MapView with:
const MapView = ({ center, zoom }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white'
    }}>
      <div>
        <h3>3D Map Temporarily Disabled</h3>
        <p>{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</p>
      </div>
    </div>
  );
};
```

### Option 2: Load Google Maps Script Manually

Instead of using Wrapper, load the script directly:

```javascript
// In public/index.html, add:
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=maps"></script>

// Then remove Wrapper from ArchitectAIEnhanced.js
```

### Option 3: Rollback to Previous Working Version

```bash
git log --oneline -10  # Find last working commit
git revert HEAD~3..HEAD  # Revert last 3 commits
git push origin main
```

---

## What Information Do I Need?

To help debug further, please provide:

1. **Screenshot or description of:**
   - Which page/step freezes
   - What you clicked before freeze
   - Browser console errors (F12 → Console tab)

2. **Vercel deployment info:**
   - Is deployment status "Ready"?
   - Any errors in Vercel function logs?
   - Build log warnings/errors?

3. **Browser info:**
   - Which browser? (Chrome, Firefox, Safari, Edge)
   - Does it freeze in ALL browsers or just one?
   - Does incognito/private mode make a difference?

4. **Environment variables:**
   - Are all 4 variables set in Vercel Dashboard?
   - Are they set for "Production" environment?
   - Did you redeploy AFTER adding them?

---

## Next Steps

Based on symptoms, I can:
1. Create a version without Google Maps
2. Add more debugging console.logs
3. Simplify the MapView component further
4. Create a diagnostic page to test each feature separately
5. Rollback to a previous working state

**Tell me exactly what's happening and I'll fix it!**
