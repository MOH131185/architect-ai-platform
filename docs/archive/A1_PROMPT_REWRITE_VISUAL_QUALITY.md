# A1 Prompt Rewrite - Visual Quality Fix

**Issue**: A1 sheets generating wireframes instead of photorealistic renders
**Fix**: Rewrote prompt to use visual descriptions instead of technical instructions

## Problem
FLUX was generating grid lines and wireframes because prompt said HOW to draw rather than WHAT to show.

## Solution
Complete prompt rewrite in a1SheetPromptGenerator.js:
- Lead with: PROFESSIONAL ARCHITECTURAL PRESENTATION BOARD
- Emphasize: PHOTOREALISTIC RENDERS and COLORED PLANS
- Describe: What the board LOOKS LIKE (not how to create it)
- Negative: wireframe, grid lines only, placeholder boxes

## Expected Results
- Photorealistic 3D building renders with lighting/shadows
- Colored floor plans with wall fills and furniture
- Elevations with visible material textures/colors
- Interior renders with natural light
- Professional magazine-quality layout

## Test
npm run dev, generate A1 sheet, verify visual quality matches Image #2 (professional presentation) not Image #1 (wireframes).
