# Critical Issues to Fix

## Issue 1: Local Materials Not Being Used (100% local setting ignored)

**Problem**: When user sets materialWeight to 0.01 (99% local), the style signature generation in `aiIntegrationService.js` lines 34-116 doesn't use the blended materials from the location analysis. Instead, it generates materials from scratch via GPT-4o.

**Root Cause**: The `generateStyleSignature()` method receives `portfolio`, `specs`, and `location` but doesn't receive the already-blended style from `enhancedAIIntegrationService.js`.

**Solution**: Pass the blended style (which already has proper material weights applied) to `generateStyleSignature()` so it uses those materials instead of generating new ones.

**Files to Modify**:
- `src/services/enhancedAIIntegrationService.js` line 195: Pass `blendedStyle` to style signature generation
- `src/services/aiIntegrationService.js` lines 34-116: Accept and use blended style materials

---

## Issue 2: Floor Plan Still Generating as 3D Instead of 2D Blueprint

**Problem**: Despite enhanced prompts, DALL·E 3 still generates floor plans with 3D axonometric perspective instead of flat 2D orthographic blueprints.

**Current Prompt** (line 153):
```
Architectural 2D floor plan drawing, pure black-and-white technical drawing, flat top-down view, strict orthographic projection, completely flat 2D view, no depth, no shadows, no 3D effects, no isometric, no perspective, pure plan view, technical linework only
```

**Solution**: Make prompt even more aggressive with explicit CAD/blueprint language:
```
FLAT 2D ARCHITECTURAL FLOOR PLAN BLUEPRINT, PURE ORTHOGRAPHIC TOP-DOWN VIEW, BLACK LINES ON WHITE BACKGROUND, CAD TECHNICAL DRAWING, ARCHITECTURAL BLUEPRINT STYLE, NO PERSPECTIVE, NO ISOMETRIC, NO 3D, NO DEPTH, NO SHADING, COMPLETELY FLAT PLAN VIEW, LIKE AUTOCAD 2D DRAWING, PURE LINEWORK ONLY
```

**Files to Modify**:
- `src/services/aiIntegrationService.js` lines 150-158: Strengthen floor plan prompt

---

## Issue 3: Perspective View Missing from UI Display

**Problem**: Perspective view is generated (console shows 11/11 success) but not displayed in the UI's 3D visualizations section.

**Current State**:
- Generation: ✅ Working (11 views including perspective)
- Backend data: ✅ perspective view in results
- UI Display: ❌ Not showing perspective view

**Solution**: Check `ArchitectAIEnhanced.js` rendering logic to ensure perspective view is extracted and displayed alongside exterior, interior, and axonometric.

**Files to Check**:
- `src/ArchitectAIEnhanced.js` lines 1092-1153: 3D view extraction and rendering logic
- Ensure perspective view is added to the 3D visualizations display

---

## Additional Notes

- All 11 images generated successfully with DALL·E 3 (100% success rate)
- PDF extraction now works (Buffer issue fixed)
- SDXL fallback removed successfully
- Consistency is PERFECT (100%) according to logs

The main issues are:
1. Style signature not using blended materials (ignoring weight settings)
2. Floor plan prompt not strong enough for pure 2D
3. Perspective view generated but not displayed
