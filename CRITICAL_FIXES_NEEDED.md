# Critical Fixes Needed - Priority Order

## Issues Identified from Console Analysis

### FIXED ✅
1. **Dimensioning Service Crashes**
   - **Error**: `Cannot read properties of undefined (reading 'elevations')` and `(reading 'sections')`
   - **Root Cause**: Dimensioning service expected BIM model but received simple objects
   - **Fix Applied**: Disabled dimensioning annotation until service is refactored
   - **File**: `src/services/aiIntegrationService.js` line 667-670

### HIGH PRIORITY - MUST FIX 🔴

2. **3D Visualizations Not Project-Specific**
   - **Problem**: Exterior Front/Side/Interior views show generic buildings, not the actual project design
   - **Root Cause**: Prompts don't include enough project-specific details (program, area, floor count, specific room layout)
   - **Fix Needed**: Enhance prompts in `replicateService.js` `buildViewParameters()` to include:
     - Building program (e.g., "2-story residential house")
     - Total area (e.g., "150m²")
     - Key spaces from specifications
     - Floor count and layout description
   - **Files**: `src/services/replicateService.js` lines 500-650

3. **Floor Plans Not Project-Specific**
   - **Problem**: Floor plans show generic layouts, not the specified rooms/program
   - **Root Cause**: Floor plan prompts don't include room requirements from user input
   - **Fix Needed**: Include detailed room list and area breakdowns in floor plan prompts
   - **Files**: `src/services/replicateService.js` `buildFloorPlanParameters()`

4. **No Dimensions Visible on Elevations**
   - **Problem**: Technical drawings have no dimension lines/annotations
   - **Root Cause**: Dimensioning service disabled + AI not generating dimensions in images
   - **Fix Needed**:
     - Option A: Add "WITH DIMENSIONS" to elevation prompts explicitly
     - Option B: Fix dimensioning service to overlay SVG dimensions on generated images
     - Option C: Use post-processing to add dimension annotations
   - **Files**: `src/services/replicateService.js` elevation prompts

5. **Section Drawing Quality Very Low**
   - **Problem**: Section drawings are blurry/low detail
   - **Root Cause**: May be resolution issue OR prompt not detailed enough
   - **Current Settings**: 1536×1152, 50 inference steps (should be good)
   - **Fix Needed**:
     - Enhance section prompts with more technical detail keywords
     - Increase inference steps to 70-80 for sections specifically
     - Add "high detail, architectural section, professional CAD drawing" keywords
   - **Files**: `src/services/replicateService.js` section generation

### MEDIUM PRIORITY 🟡

6. **OpenAI API 401 Error**
   - **Problem**: Portfolio style detection failing with 401 Unauthorized
   - **Root Cause**: API key missing or invalid in production/proxy
   - **Fix Needed**: Verify REACT_APP_OPENAI_API_KEY is set in:
     - `.env` file for local development
     - Vercel environment variables for production
   - **Impact**: Fallback style detection works, but portfolio analysis fails
   - **Files**: `api/openai-chat.js`, `server.js`

7. **Google Maps Deprecation Warnings**
   - **Problem**: Using deprecated `google.maps.Marker` API
   - **Fix Needed**: Migrate to `google.maps.marker.AdvancedMarkerElement`
   - **Impact**: Low (just warnings, no functionality issues)
   - **Files**: `src/ArchitectAIEnhanced.js` MapView component

### LOW PRIORITY 🟢

8. **QuillBot Extension Errors**
   - **Problem**: Browser extension conflict causing console spam
   - **Fix**: N/A - user-side issue, not application problem
   - **Can Ignore**: These are from browser extensions, not our code

---

## Detailed Fix Instructions

### Fix #2: Make 3D Views Project-Specific

**Current Issue:**
```javascript
// Generic prompt
prompt: `Professional architectural visualization, ${style} building, exterior view...`
```

**Needed Fix:**
```javascript
// Project-specific prompt
const programDetail = projectContext.buildingProgram || 'building';
const areaDetail = projectContext.area ? `${projectContext.area}m² total area` : '';
const floorDetail = projectContext.floors ? `${projectContext.floors}-story` : '';
const roomsDetail = projectContext.programDetails ?
  `with ${Object.keys(projectContext.programDetails).join(', ')}` : '';

prompt: `Professional architectural visualization of ${floorDetail} ${programDetail} (${areaDetail}), ${roomsDetail}, ${style} architectural style, exterior front view, photorealistic, professional photography, high quality, detailed, contextual, site-specific design`;
```

**Files to Edit:**
- `src/services/replicateService.js` - `buildViewParameters()` function
- Lines approximately 500-650

### Fix #3: Make Floor Plans Project-Specific

**Current Issue:**
Floor plans don't reflect the actual room requirements entered by user.

**Needed Fix:**
```javascript
// Extract room program from projectDetails
const roomProgram = projectContext.programDetails || {};
const roomList = Object.entries(roomProgram)
  .map(([room, area]) => `${room} (${area}m²)`)
  .join(', ');

// Enhanced floor plan prompt
prompt: `2D architectural floor plan drawing ONLY, ${floorDetail} ${programDetail}, showing: ${roomList}, total area ${totalArea}m², with dimensions, walls, doors, windows, furniture layout, room labels with areas, scale 1:100, professional CAD-style blueprint, black and white technical drawing, orthographic top view, NO 3D, NO perspective`;
```

**Files to Edit:**
- `src/services/replicateService.js` - `buildFloorPlanParameters()` function

### Fix #4: Add Visible Dimensions to Elevations

**Quick Fix (Easiest):**
Add explicit dimension requirements to prompts:

```javascript
prompt: `2D architectural elevation drawing, ${direction} ${elevationType}, ${programDetail},
WITH COMPLETE DIMENSIONAL ANNOTATIONS showing:
- Overall building width and height in meters
- Floor-to-floor heights
- Window and door dimensions
- Foundation depth
- Roof height
All dimensions clearly labeled in meters, dimension lines with arrows,
professional architectural blueprint style, scale 1:100, black and white technical drawing`;
```

**Better Fix (More Work):**
Implement SVG overlay system in dimensioningService.js:
1. Generate clean elevation image from Replicate
2. Analyze image to detect key features (floors, openings, etc.)
3. Generate SVG overlay with dimension lines
4. Composite SVG over image

**Files to Edit:**
- Quick: `src/services/replicateService.js` - elevation prompt generation
- Better: `src/services/dimensioningService.js` - refactor to work with images

### Fix #5: Improve Section Quality

**Current Settings:**
```javascript
width: 1536,
height: 1152,
num_inference_steps: 50
```

**Enhanced Settings for Sections:**
```javascript
// Increase quality specifically for sections
width: 1536,  // Keep
height: 1152, // Keep
num_inference_steps: 75, // Increase from 50 to 75
guidance_scale: 8.5, // Increase guidance for more accurate adherence to prompt

// Enhanced prompt
prompt: `HIGHLY DETAILED 2D architectural section drawing, ${sectionType} section cut through ${programDetail},
showing: foundation (0.5m depth), floor slabs with reinforcement (#4 @ 300mm c/c),
wall construction layers (exterior cladding, insulation, interior finish),
ceiling assembly, roof structure,
ALL dimensions labeled in meters, floor-to-floor heights (${floorHeight}m),
material callouts, construction notes, structural members visible,
scale 1:50, MAXIMUM DETAIL, professional architectural section, CAD-quality blueprint,
black and white technical drawing with material hatching, orthographic view, NO 3D, NO perspective`;
```

**Files to Edit:**
- `src/services/replicateService.js` - `buildSectionParameters()` function
- Lines approximately 800-850

---

## Testing Checklist

After implementing fixes, test:

1. **3D Views Test**
   - [ ] Exterior front view shows correct building type
   - [ ] Exterior side view shows correct number of floors
   - [ ] Interior view shows specified rooms/spaces
   - [ ] Views match the project specifications

2. **Floor Plans Test**
   - [ ] Ground floor shows all required rooms
   - [ ] Room labels match user input
   - [ ] Areas are approximately correct
   - [ ] Layout is logical for building type

3. **Technical Drawings Test**
   - [ ] Elevations show dimension annotations
   - [ ] Sections are high detail and clear
   - [ ] All 4 elevations generated successfully
   - [ ] Both sections (longitudinal, cross) are detailed

4. **Overall Quality Test**
   - [ ] No console errors during generation
   - [ ] All images load successfully
   - [ ] Generation completes within reasonable time
   - [ ] Results match project specifications

---

## Priority Implementation Order

1. **First**: Fix #1 (Dimensioning crashes) - DONE ✅
2. **Second**: Fix #2 & #3 (Project-specific prompts) - CRITICAL for usability
3. **Third**: Fix #5 (Section quality) - Important for professional output
4. **Fourth**: Fix #4 (Elevation dimensions) - Enhancement
5. **Fifth**: Fix #6 (OpenAI 401) - Only if portfolio upload being used
6. **Last**: Fix #7 (Google Maps) - Low priority warning

---

## Estimated Implementation Time

- Fix #2 (3D prompts): 30 minutes
- Fix #3 (Floor plan prompts): 30 minutes
- Fix #4 (Dimensions - quick fix): 15 minutes
- Fix #5 (Section quality): 20 minutes
- Fix #6 (OpenAI API): 10 minutes (just env var check)
- Fix #7 (Google Maps): 45 minutes (API migration)

**Total**: ~2.5 hours for all high-priority fixes

---

## Files Requiring Changes

1. `src/services/replicateService.js` - Main file for prompt improvements
2. `src/services/aiIntegrationService.js` - Already fixed (dimensioning)
3. `api/openai-chat.js` - OpenAI API key handling
4. `.env` - Environment variables check
5. `src/ArchitectAIEnhanced.js` - Google Maps API update (low priority)

---

## Notes

- The most critical issue is that generated designs don't match user specifications
- This happens because prompts are too generic and don't include project details
- The fix is straightforward: enhance prompts with actual project data
- Quality issues (sections, dimensions) are secondary to correctness

---

**Generated**: 2025-10-10
**Status**: Dimensioning crashes fixed, other fixes pending implementation
