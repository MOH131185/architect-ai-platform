# A1 Sheet Workflow Fixes

## Issues Found

### 1. Materials Array Error
**Error:** `TypeError: materials.map is not a function`
**Location:** `src/services/a1SheetPromptGenerator.js:36`

**Root Cause:**
The prompt generator expected `materials` to always be an array, but the fallback DNA structure returns materials as an object:
```javascript
{
  exterior: { primary: 'clay brick', color_hex: '#...' },
  roof: { material: 'tiles', color_hex: '#...' }
}
```

**Fix Applied:**
Added defensive handling for both array and object formats in `a1SheetPromptGenerator.js`:
- Check if materials is an array → use .map()
- Check if materials is an object → extract properties manually
- Provide fallback 'contemporary materials' if neither

### 2. Missing Floor Count
**Error:** `Invalid floor count: undefined`
**Location:** `src/services/dnaValidator.js`

**Root Cause:**
The fallback DNA structure didn't include `floors`, `floorCount`, or `floor_count` properties in dimensions.

**Fix Applied:**
Enhanced the auto-fix function in `dnaValidator.js` to:
- Check for missing floors property (all naming variants)
- Set default `floors: 2` and `floor_count: 2` when missing

## Changes Made

### File: `src/services/a1SheetPromptGenerator.js`

#### Materials Handling (lines 35-59)
```javascript
// Before:
const materialDesc = materials
  .map(m => `${m.name} ${m.hexColor} for ${m.application}`)
  .join(', ');

// After:
let materialDesc = '';
if (Array.isArray(materials)) {
  // Handle array format
  materialDesc = materials
    .map(m => `${m.name} ${m.hexColor || ''} for ${m.application}`)
    .join(', ');
} else if (typeof materials === 'object' && materials !== null) {
  // Handle object format
  const parts = [];
  if (materials.exterior?.primary) {
    parts.push(`${materials.exterior.primary} ${materials.exterior.color_hex || ''} for exterior walls`);
  }
  if (materials.roof?.material) {
    parts.push(`${materials.roof.material} ${materials.roof.color_hex || ''} for roof`);
  }
  if (materials.secondary) {
    parts.push(`${materials.secondary} for accents`);
  }
  materialDesc = parts.join(', ');
}

if (!materialDesc) {
  materialDesc = 'contemporary materials';
}
```

#### Dimensions and Rooms Handling (lines 61-94)
```javascript
// Added safe fallbacks for dimensions
const length = dimensions.length || dimensions.width || 15;
const width = dimensions.width || dimensions.depth || 12;
const height = dimensions.height || dimensions.totalHeight || 7;

// Added safe floor count extraction
const floorCount = dimensions.floorHeights?.length ||
                   dimensions.floor_count ||
                   dimensions.floors ||
                   2;

// Added safe rooms array handling
if (Array.isArray(rooms) && rooms.length > 0) {
  // Extract rooms from array
} else {
  // Use fallback room layouts
  groundFloorRooms = 'Living room, Kitchen, Entry';
  if (floorCount > 1) {
    upperFloorRooms = 'Bedrooms, Bathrooms';
  }
}
```

### File: `src/services/dnaValidator.js`

#### Floor Count Auto-Fix (lines 423-427)
```javascript
// Added missing floors fix
if (!fixed.dimensions.floors && !fixed.dimensions.floorCount && !fixed.dimensions.floor_count) {
  fixed.dimensions.floors = 2;
  fixed.dimensions.floor_count = 2; // Support alternative naming
}
```

## Testing

The fixes handle multiple DNA structure formats:

### Format 1: Array-based materials (preferred)
```javascript
{
  materials: [
    { name: 'brick', hexColor: '#B8604E', application: 'exterior walls' },
    { name: 'tiles', hexColor: '#8B4513', application: 'roof' }
  ]
}
```

### Format 2: Object-based materials (fallback)
```javascript
{
  materials: {
    exterior: { primary: 'clay brick', color_hex: '#B8604E' },
    roof: { material: 'tiles', color_hex: '#8B4513' }
  }
}
```

### Format 3: Missing materials
```javascript
{
  materials: null  // or undefined
  // Will use 'contemporary materials' as fallback
}
```

## Resolution

These fixes ensure the A1 Sheet workflow is robust against:
- ✅ Different DNA structure formats
- ✅ Missing or undefined properties
- ✅ Fallback DNA structures
- ✅ Multiple property naming conventions

The workflow should now proceed without errors even when using fallback DNA.

## Expected Behavior After Fix

1. DNA generation (may use fallback if API fails)
2. DNA validation (will auto-fix missing floors)
3. A1 prompt generation (handles any materials format)
4. Image generation (single A1 sheet via Together.AI)
5. Display in A1SheetViewer component

## Next Test

Please try generating again. You should see:
- ✅ No `materials.map is not a function` error
- ✅ No `Invalid floor count` error
- ✅ A1 sheet prompt generated successfully
- ✅ Image generation attempt (may still fail if API keys/credits issue)

If image generation still fails, check:
- Together.AI API key in `.env`
- API credits available
- Express server running on port 3001
