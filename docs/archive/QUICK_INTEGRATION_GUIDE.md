# Quick Integration Guide - 3 Lines of Code

## Option 1: Minimal Integration (Recommended)

Add these **3 lines** to `src/ArchitectAIEnhanced.js`:

### Step 1: Import at top of file (after line 1)

```javascript
import GeometryIntegrationWrapper from './components/GeometryIntegrationWrapper';
import SettingsPanel from './components/SettingsPanel';
```

### Step 2: Add settings state (after line 748)

```javascript
const [showSettings, setShowSettings] = useState(false);
```

### Step 3: Add Settings button to header (find the header section around line 2800)

```javascript
{/* Add this near the top-right of your UI */}
<button
  onClick={() => setShowSettings(true)}
  style={{
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '10px 20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    zIndex: 1000
  }}
>
  ⚙️ Settings
</button>

<SettingsPanel
  isOpen={showSettings}
  onClose={() => setShowSettings(false)}
/>
```

### Step 4: Replace results display (find where `generatedDesigns` is rendered)

**Before** (old code showing AI results):
```javascript
{generatedDesigns && (
  <div>
    {/* Your existing result display */}
  </div>
)}
```

**After** (with geometry integration):
```javascript
{generatedDesigns && (
  <GeometryIntegrationWrapper
    masterDNA={generatedDesigns.masterDNA}
    projectContext={{ climate: locationData?.climate, floorCount: projectDetails.floors }}
    locationData={locationData}
    siteMetrics={siteMetrics}
    aiGeneratedViews={
      <div>
        {/* Your existing AI result display (will be shown as comparison) */}
      </div>
    }
    onGeometryReady={(urls) => {
      console.log('Geometry views ready:', urls);
      // Optional: Store URLs in state for download/export
    }}
  />
)}
```

## That's It!

**Total changes**: 3 imports + 1 state variable + 1 button + 1 wrapper component = **Fully integrated geometry-first pipeline**

---

## Option 2: Standalone Test Page

If you want to test geometry views without touching ArchitectAIEnhanced.js:

Create `src/pages/GeometryTest.jsx`:

```javascript
import React from 'react';
import { createDesign } from '../core/designSchema';
import GeometryViewsComponent from '../components/GeometryViewsComponent';

const GeometryTestPage = () => {
  const testDesign = createDesign({
    dimensions: { length: 12, width: 8, height: 6, floorCount: 2 },
    rooms: [
      {
        id: 'living',
        name: 'Living Room',
        level: 0,
        poly: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], // mm
        area: 24
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        level: 0,
        poly: [[6000, 0], [12000, 0], [12000, 4000], [6000, 4000]],
        area: 24
      }
    ]
  });

  return (
    <div style={{ padding: '20px' }}>
      <h1>Geometry-First Test Page</h1>
      <Geometry ViewsComponent design={testDesign} />
    </div>
  );
};

export default GeometryTestPage;
```

Then add route in `src/App.js`:
```javascript
import GeometryTestPage from './pages/GeometryTest';

// In your router:
<Route path="/geometry-test" element={<GeometryTestPage />} />
```

Visit `http://localhost:3000/geometry-test` to see it working.

---

## Verification

After integration, generate a design and check console for:

```
✅ Converting DNA to geometry format...
✅ Validating design...
✅ Design ready for geometry rendering
🎨 Geometry Views Rendered:
   Axonometric URL: data:image/png;base64,iVBORw0KG...
   Perspective URL: data:image/png;base64,iVBORw0KG...
   Interior URL: data:image/png;base64,iVBORw0KG...
✅ Axonometric and Perspective URLs are DIFFERENT (bug fixed)
🧪 Running smoke test for distinct URLs...
✅ Smoke test PASSED: All URLs are distinct
✅ Smoke test PASSED: All URLs have different byte sizes
```

---

## Feature Flags

Toggle features via Settings panel or browser console:

```javascript
// Enable/disable geometry-first
localStorage.setItem('featureFlag_geometryFirst', 'true');  // or 'false'

// Enable AI stylization
localStorage.setItem('featureFlag_aiStylization', 'true');

// Refresh page to apply
location.reload();
```

---

## Troubleshooting

**Issue**: No geometry views appear
**Fix**: Check console - if "No rooms defined", DNA conversion needs rooms extracted

**Issue**: Views all look the same
**Fix**: Check camera configurations in `design.cameras` - ensure different az/el

**Issue**: Three.js errors
**Fix**: Ensure `npm install three` was run and module loads correctly

---

**Integration complete!** 🎉

Proceed to Phase 2 for spatial layout, doors/windows/roof, and exports.
