# OpenArt Integration Plan - Local Implementation

## Status: Ready for Local Testing

This document outlines the OpenArt integration approach for local development and testing before deployment.

---

## ✅ Completed Tasks

### 1. OpenArt Service Created
**File:** `src/services/openartService.js`
- ✅ `generatePhotorealistic()` - Master 3D exterior with high quality
- ✅ `generateFluxKontextMax()` - 3D views with reference image (0.7 strength)
- ✅ `generateSDXLControlNetLineart()` - 2D technical drawings with ControlNet
- ✅ Routes all requests through `/api/enhanced-image/generate` endpoint

### 2. Server.js Enhanced Route Extended
**File:** `server.js` (lines 279-356)
- ✅ Added OpenArt model detection (`openart-photorealistic`, `flux-kontext-max`, `sdxl-controlnet-lineart`)
- ✅ Maps to OpenArt API endpoint: `https://api.openart.ai/v1/generate`
- ✅ Supports reference_image and reference_strength for Flux Kontext Max
- ✅ Supports controlnet_conditioning_scale for SDXL Lineart
- ✅ Graceful fallback to DALL-E 3 if OpenArt not configured
- ✅ Added server startup log for OpenArt configuration status

---

## 🎯 Next Steps (To Complete Integration)

### 3. Modify aiIntegrationService.js to Use OpenArt
**File:** `src/services/aiIntegrationService.js`

**Current Flow (DALL-E only):**
```javascript
// Line 539: Master exterior generated with DALL-E 3
images = await this.openaiImage.generateImage({...});

// Line 672: Extract visual details from master
extractedVisualDetails = await this.extractVisualDetailsFromImage(masterImageUrl, ...);

// Line 598: Subsequent 3D views use DALL-E 3
images = await this.openaiImage.generateImage({...});
```

**New Flow (OpenArt with reference):**
```javascript
// Import OpenArt service at top
import openartService from './openartService';

// Line 539: Master exterior with OpenArt Photorealistic
if (isMaster) {
  console.log(`🎨 Generating master exterior with OpenArt Photorealistic...`);
  const result = await openartService.generatePhotorealistic({
    prompt: promptKit.prompt,
    negative_prompt: promptKit.negativePrompt || '',
    width: 1536,
    height: 1152,
    seed: context.projectSeed,
    guidance_scale: 7.5,
    num_inference_steps: 50
  });
  images = [{ url: result.url, revised_prompt: result.revised_prompt }];
  masterImageUrl = result.url;
}

// Line 672: Extract visual details from master (same)
extractedVisualDetails = await this.extractVisualDetailsFromImage(masterImageUrl, ...);

// Line 598: Subsequent 3D views with Flux Kontext Max + reference
if (!isMaster && (req.viewType === 'interior' || req.viewType === 'perspective' || req.viewType === 'axonometric')) {
  console.log(`🎨 Generating ${req.viewType} with Flux Kontext Max + reference...`);
  const result = await openartService.generateFluxKontextMax({
    prompt: promptKit.prompt,
    reference_image: masterImageUrl,  // Use master as reference
    reference_strength: 0.7,
    negative_prompt: promptKit.negativePrompt || '',
    width: req.viewType === 'interior' ? 1536 : 1024,
    height: req.viewType === 'interior' ? 1024 : 768,
    seed: context.projectSeed,
    guidance_scale: 7.5,
    num_inference_steps: 30
  });
  images = [{ url: result.url, revised_prompt: result.revised_prompt }];
}
```

### 4. Route 2D Views to OpenArt SDXL Lineart
**File:** `src/services/aiIntegrationService.js` (line 566-605)

**Current:** Routes to FLUX.1-dev via enhanced endpoint

**New:** Route to OpenArt SDXL ControlNet Lineart
```javascript
// Line 570: Instead of FLUX routing
if (is2DTechnical) {
  console.log(`🎨 Routing ${req.viewType} to OpenArt SDXL ControlNet Lineart...`);
  const result = await openartService.generateSDXLControlNetLineart({
    prompt: promptKit.prompt,
    negative_prompt: promptKit.negativePrompt || '',
    width: 2048,
    height: 2048,
    seed: context.projectSeed,
    guidance_scale: 7.5,
    num_inference_steps: 40,
    controlnet_conditioning_scale: 0.8
  });
  images = [{ url: result.url, revised_prompt: result.revised_prompt }];
}
```

---

## 📐 Image Size Standards

Per requirements, standardize all image sizes:

| View Type | Width | Height | Model | Notes |
|-----------|-------|--------|-------|-------|
| **2D Technical** | 2048 | 2048 | OpenArt SDXL Lineart | Floor plans, elevations, sections |
| **Exterior (Master)** | 1536 | 1152 | OpenArt Photorealistic | Master reference image |
| **Interior** | 1536 | 1024 | Flux Kontext Max | Uses master reference |
| **Axonometric** | 1024 | 768 | Flux Kontext Max | Uses master reference |
| **Perspective** | 1024 | 768 | Flux Kontext Max | Uses master reference |

---

## 🔄 Fallback Strategy

If OpenArt fails or is not configured:
1. **Master Exterior:** Falls back to DALL-E 3 (existing flow)
2. **3D Views:** Falls back to DALL-E 3 (existing flow)
3. **2D Views:** Falls back to FLUX.1-dev (current smart routing)

Server logs will show:
```
⚠️  OpenArt not configured for openart-photorealistic, falling back to DALL-E 3
```

---

## 📋 Single-Sheet Project Board Export

### 5. Add generateProjectBoardSheet() Function
**File:** `src/ArchitectAIEnhanced.js`

**Dimensions:** A3 landscape = 4961 × 3508 px @ 300 DPI

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ ARCHITECTURAL PROJECT BOARD - [Project Name]       │
├──────────────┬──────────────┬──────────────────────┤
│              │              │                      │
│  Floor Plan  │  Elevation   │   Exterior Photo     │
│  (2048×2048) │  N (1024×1) │   (1536×1152)        │
│              │              │                      │
├──────────────┼──────────────┼──────────────────────┤
│              │              │                      │
│  Elevation   │  Section     │   Interior Photo     │
│  E (1024×1) │  (1024×1024) │   (1536×1024)        │
│              │              │                      │
├──────────────┴──────────────┴──────────────────────┤
│                                                     │
│  Project Specifications & Design Narrative         │
│  - Building DNA, materials, dimensions, etc.       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
```javascript
async function generateProjectBoardSheet(result, context) {
  const canvas = document.createElement('canvas');
  canvas.width = 4961;  // A3 width @ 300 DPI
  canvas.height = 3508; // A3 height @ 300 DPI
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title bar
  ctx.fillStyle = '#2C3E50';
  ctx.fillRect(0, 0, canvas.width, 150);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 48px Arial';
  ctx.fillText(`ARCHITECTURAL PROJECT BOARD - ${context.projectName || 'Untitled Project'}`, 50, 95);

  // Load and place images
  const images = {
    floorPlan: result.visualizations?.floorPlans?.ground?.images?.[0],
    elevationN: result.visualizations?.technicalDrawings?.elevation_north?.images?.[0],
    exterior: result.visualizations?.views?.exterior_front?.images?.[0],
    elevationE: result.visualizations?.technicalDrawings?.elevation_east?.images?.[0],
    section: result.visualizations?.technicalDrawings?.section_longitudinal?.images?.[0],
    interior: result.visualizations?.views?.interior?.images?.[0]
  };

  // Place images in grid (with proper scaling and positioning)
  // ... implementation details

  // Add specs text block at bottom
  const specs = generateSpecsText(result, context);
  ctx.fillStyle = '#2C3E50';
  ctx.font = '24px Arial';
  // ... render specs

  // Export as PNG
  return canvas.toDataURL('image/png');
}

function generateSpecsText(result, context) {
  const dna = context.buildingDNA || {};
  return `
    Building Type: ${context.buildingProgram}
    Total Area: ${context.floorArea}m²
    Dimensions: ${dna.dimensions?.length} × ${dna.dimensions?.width}
    Floors: ${dna.dimensions?.floors}
    Materials: ${dna.materials}
    Roof: ${dna.roof?.type}
    Windows: ${dna.windows?.pattern}
    Style: ${context.blendedStyle?.styleName}
  `;
}
```

### 6. Add Export Button in Step 6 UI
**File:** `src/ArchitectAIEnhanced.js` (renderStep6 function)

```javascript
<button
  onClick={async () => {
    setExportingBoard(true);
    try {
      const boardDataURL = await generateProjectBoardSheet(aiResult, projectContext);
      downloadFile(boardDataURL, `project-board-${Date.now()}.png`, 'image/png');
    } catch (error) {
      console.error('Project board export failed:', error);
      alert('Failed to export project board');
    } finally {
      setExportingBoard(false);
    }
  }}
  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
  disabled={exportingBoard}
>
  {exportingBoard ? '⏳ Generating Board...' : '📋 Export Project Board'}
</button>
```

---

## 🔑 Environment Setup

### 7. Update .env File

Add to `.env` at repository root:

```env
# OpenArt API Configuration
OPENART_API_KEY=your_openart_api_key_here

# Required - DO NOT remove these
REACT_APP_OPENAI_API_KEY=your_openai_key
OPENAI_IMAGES_API_KEY=your_openai_images_key
REACT_APP_REPLICATE_API_KEY=your_replicate_key
TOGETHER_API_KEY=your_together_key

# Local Development
REACT_APP_API_PROXY_URL=http://localhost:3001
```

### Verification

Start server and check logs:
```bash
npm run dev
```

Expected output:
```
🚀 API Proxy Server running on http://localhost:3001
✅ OpenAI Chat (Legacy): Configured
✅ OpenAI Reasoning: Configured
✅ OpenAI Images (DALL·E 3): Configured
✅ Replicate API Key: Configured
✅ Together.ai (FLUX): Configured
🎨 OpenArt (Photorealistic/Flux/SDXL): Configured  <-- This should show!
```

---

## 🧪 Local QA Checklist

Before approving for deployment:

### Console Logs
- [ ] See "🎨 Using OpenArt openart-photorealistic for: ..." for master exterior
- [ ] See "🎨 Using OpenArt flux-kontext-max for: ..." for 3D views (with reference)
- [ ] See "🎨 Using OpenArt sdxl-controlnet-lineart for: ..." for 2D technical drawings
- [ ] See "✅ Visual details extracted successfully" after master generation

### 2D Technical Drawings
- [ ] Floor plans classified as `floor_plan` (not `axonometric`)
- [ ] Elevations classified as `elevation`
- [ ] Sections classified as `section`
- [ ] All 2D views are truly flat orthographic (no 3D depth)

### 3D Consistency
- [ ] All 3D views share identical materials/colors
- [ ] Logs show "Using EXTRACTED VISUAL DETAILS" for subsequent views
- [ ] Reference image strength logged as 0.7

### Project Board Export
- [ ] "Export Project Board" button visible in Step 6
- [ ] Clicking generates single A3 sheet with all views
- [ ] Sheet includes floor plan, elevations, section, exterior, interior
- [ ] Specs block shows correct building DNA data
- [ ] Downloads as PNG file

---

## 🚀 Deployment (After Local Approval)

**DO NOT DEPLOY until user confirms local results are excellent.**

When approved:
1. Commit changes to Git
2. Push to GitHub (triggers auto-deployment to Vercel)
3. Add `OPENART_API_KEY` to Vercel environment variables
4. Verify production deployment

---

## 📝 Files Modified/Created

### Created:
- ✅ `src/services/openartService.js` (new service)
- ✅ `OPENART_INTEGRATION_PLAN.md` (this document)

### Modified:
- ✅ `server.js` (+77 lines for OpenArt support)
- 🔲 `src/services/aiIntegrationService.js` (needs OpenArt integration)
- 🔲 `src/ArchitectAIEnhanced.js` (needs project board export)
- 🔲 `.env` (needs OPENART_API_KEY)

### Notes:
- All server-side routing is complete and ready
- Client-side integration needs completion in aiIntegrationService
- Project board export UI needs implementation

---

## ⚡ Quick Command Reference

```bash
# Start local development
npm run dev

# Check server logs for OpenArt configuration
# Look for: "🎨 OpenArt (Photorealistic/Flux/SDXL): Configured"

# Test generation
# 1. Open http://localhost:3000
# 2. Go through workflow steps
# 3. Generate project
# 4. Check console logs for OpenArt model usage
```

---

**Status:** Implementation 60% complete. Server routing ready, client integration pending.
