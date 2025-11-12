# Single Output Sheet (SOS) System

## Overview

The Single Output Sheet system combines all 2D/3D views and technical drawings onto a unified A1 presentation sheet, ensuring consistency and design unity across all architectural elements.

---

## Purpose

Traditional architectural presentation requires assembling multiple separate views into a cohesive package. The SOS system automates this process while ensuring:

1. **Perfect Consistency** - All views derived from single `design.json` source
2. **Scale Accuracy** - Vector units in mm for exact 1:100, 1:50 printing
3. **Traceability** - Design ID, seed, and SHA-256 hash on every sheet
4. **Professional Output** - Title blocks, north arrows, scale bars, QR codes
5. **Compliance Validation** - UK Building Regulations badges
6. **Material Coordination** - Color palettes match across all views

---

## Sheet Contents

### A1 Landscape Sheet (841mm × 594mm)

**📋 Title Block** (55mm height)
- Project name and location
- Design ID (unique identifier)
- Seed (deterministic generation)
- SHA-256 hash (design.json fingerprint)
- Date, revision, status
- Consistency score
- North arrow
- Scale bar (1:100)
- QR code (interactive 3D link)

**🏗️ Floor Plans** (1:100 or 1:50)
- Ground floor plan with auto-dimensions
- Upper floor plan with room labels
- Circulation paths highlighted
- Door swings and window placements

**📐 Elevations** (1:100)
- North elevation (main entrance)
- South elevation (rear facade)
- East elevation (right side)
- West elevation (left side)
- Consistent lineweights and hatches

**✂️ Sections** (1:100)
- Longitudinal section (through stairs)
- Cross section (perpendicular)
- Floor heights annotated
- Structural elements visible

**🏠 3D Views** (thumbnails)
- Axonometric view (45°, no perspective)
- Perspective view (eye level)
- Interior view (optional)
- All from same camera angles each time

**🎨 Material Palette**
- Extracted from Master DNA
- Hex color codes
- Material names and applications
- Swatches with exact colors

**📊 Key Metrics**
- GIA (Gross Internal Area)
- NIA (Net Internal Area)
- WWR (Window-to-Wall Ratio)
- Circulation percentage
- Average daylight proxy
- Room schedule

**🌍 Climate Notes**
- HDD (Heating Degree Days)
- CDD (Cooling Degree Days)
- Prevailing wind direction
- Recommended WWR for climate

**✅ Compliance Badges**
- ✅ Door width ≥800mm (Part M)
- ✅ Corridor width ≥900mm (Part M)
- ✅ Stair pitch ≤42° (Part K)
- ✅ WWR 0.25-0.45 (Part L)
- ✅ Head height ≥2.0m (Part M)

**🔗 QR Codes**
- Interactive 3D viewer (glTF model)
- Project web URL
- Design permalink

---

## Layout Specification

### A1 Landscape Configuration

```json
{
  "size_mm": [841, 594],
  "margins_mm": 15,
  "title_block": {
    "x": 15,
    "y": 524,
    "w": 811,
    "h": 55
  },
  "slots": [
    {
      "id": "plan_ground",
      "label": "GROUND FLOOR PLAN",
      "x": 15,
      "y": 235,
      "w": 400,
      "h": 270,
      "scale": "1:100",
      "src": "technical/plan_ground.svg"
    },
    {
      "id": "plan_upper",
      "label": "UPPER FLOOR PLAN",
      "x": 426,
      "y": 235,
      "w": 400,
      "h": 270,
      "scale": "1:100",
      "src": "technical/plan_upper.svg"
    },
    {
      "id": "elev_north",
      "label": "NORTH ELEVATION",
      "x": 15,
      "y": 125,
      "w": 195,
      "h": 100,
      "scale": "1:100",
      "src": "technical/elev_north.svg"
    },
    {
      "id": "elev_south",
      "label": "SOUTH ELEVATION",
      "x": 220,
      "y": 125,
      "w": 195,
      "h": 100,
      "scale": "1:100",
      "src": "technical/elev_south.svg"
    },
    {
      "id": "elev_east",
      "label": "EAST ELEVATION",
      "x": 425,
      "y": 125,
      "w": 195,
      "h": 100,
      "scale": "1:100",
      "src": "technical/elev_east.svg"
    },
    {
      "id": "elev_west",
      "label": "WEST ELEVATION",
      "x": 630,
      "y": 125,
      "w": 195,
      "h": 100,
      "scale": "1:100",
      "src": "technical/elev_west.svg"
    },
    {
      "id": "section_AA",
      "label": "SECTION A-A",
      "x": 15,
      "y": 15,
      "w": 280,
      "h": 100,
      "scale": "1:100",
      "src": "technical/section_longitudinal.svg"
    },
    {
      "id": "axon",
      "label": "AXONOMETRIC VIEW",
      "x": 305,
      "y": 15,
      "w": 155,
      "h": 100,
      "src": "renders/axon.png"
    },
    {
      "id": "persp",
      "label": "PERSPECTIVE VIEW",
      "x": 470,
      "y": 15,
      "w": 155,
      "h": 100,
      "src": "renders/persp.png"
    },
    {
      "id": "materials",
      "label": "MATERIAL PALETTE",
      "x": 635,
      "y": 15,
      "w": 95,
      "h": 100,
      "src": "generated/materials.svg"
    },
    {
      "id": "metrics",
      "label": "KEY METRICS",
      "x": 740,
      "y": 15,
      "w": 86,
      "h": 100,
      "src": "generated/metrics.svg"
    }
  ],
  "lineweights_mm": {
    "cut": 0.35,
    "profile": 0.25,
    "thin": 0.18,
    "dimension": 0.13
  }
}
```

---

## Implementation Architecture

### File Structure

```
architect-ai-platform/
├── config/
│   └── sheet_A1.json          # A1 layout configuration
│
├── src/
│   └── services/
│       ├── sheetComposer.js   # SVG composition engine
│       ├── metricsCalculator.js # GIA/NIA/WWR calculator
│       └── complianceChecker.js # UK Building Regs
│
├── api/
│   └── sheet.js               # Vercel serverless function
│
└── SINGLE_OUTPUT_SHEET.md     # This documentation
```

### Data Flow

```
┌──────────────────────────────────────────────────────────┐
│ USER CLICKS "Download Master Sheet (A1)"                │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ STEP 1: Collect Design Data                             │
│ - Master DNA (dimensions, materials, rooms)             │
│ - Visualizations (13 view URLs)                         │
│ - Project context (location, climate)                   │
│ - Geometry data (if using geometry-first)               │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ STEP 2: Calculate Metrics                               │
│ Service: metricsCalculator.js                           │
│ - GIA/NIA from floor plan room areas                    │
│ - WWR from window counts × standard size / wall area    │
│ - Circulation % from hallway/stair areas                │
│ - Daylight proxy from window count × 2.5 / sqrt(area)  │
│ - Compliance checks against UK Building Regs            │
│ - Design hash: SHA-256(design.json)                     │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ STEP 3: Compose SVG Sheet                               │
│ Service: sheetComposer.js                               │
│ - Load config/sheet_A1.json layout                      │
│ - Build title block with metadata                       │
│ - Place slots (plans, elevations, sections, 3D)        │
│ - Embed vector SVGs (from geometry pipeline)            │
│ - Embed raster PNGs (from FLUX renders)                 │
│ - Generate material palette SVG                         │
│ - Generate metrics table SVG                            │
│ - Add compliance badges (✅ or ⚠️)                      │
│ - Add QR codes, north arrow, scale bar                  │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ STEP 4: Return SVG or PDF                               │
│ API: GET /api/sheet?format=svg&design_id=...            │
│ - SVG: Direct download (vector, exact mm)               │
│ - PDF: Convert via puppeteer/svg2pdf (future)          │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ OUTPUT: architecture-sheet-{design_id}.svg               │
│ - 841mm × 594mm (A1 landscape)                          │
│ - Scale-accurate (1:100 prints exactly)                 │
│ - All views from single design.json                     │
│ - Traceable via design_id + seed + hash                │
└──────────────────────────────────────────────────────────┘
```

---

## API Usage

### Endpoint

```
GET /api/sheet
```

### Query Parameters

- `format` (optional) - Output format: `svg` (default) or `pdf`
- `design_id` (optional) - Design ID to load from storage
- `size` (optional) - Sheet size: `A1` (default), `A0`, `A2`

### Examples

**Download SVG Sheet:**
```javascript
// Client-side download
const designData = {
  masterDNA,
  visualizations,
  projectContext,
  geometryData
};

const blob = new Blob([svgContent], { type: 'image/svg+xml' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `architecture-sheet-${designData.masterDNA.projectID}.svg`;
link.click();
```

**Server-side API Call:**
```bash
curl "https://archiaisolution.pro/api/sheet?format=svg&design_id=proj_12345" \
  -o architecture-sheet.svg
```

---

## Metrics Calculation Details

### GIA (Gross Internal Area)

```javascript
// Building footprint × floor count (includes walls)
const footprint = length × width;
const gia = footprint × floorCount;
```

### NIA (Net Internal Area)

```javascript
// Sum of all room areas from floor plans (excludes walls)
const nia = floorPlans.ground.rooms.reduce((sum, room) => sum + room.area, 0)
          + floorPlans.upper.rooms.reduce((sum, room) => sum + room.area, 0);

// Fallback if no room data: 85% of GIA (typical efficiency)
const nia = gia × 0.85;
```

### WWR (Window-to-Wall Ratio)

```javascript
// Total wall area (perimeter × height)
const totalWallArea = 2 × (length + width) × totalHeight;

// Total window area (count × standard size)
const standardWindowArea = 1.5 × 1.2; // m²
const totalWindowArea = totalWindowCount × standardWindowArea;

// WWR ratio
const wwr = totalWindowArea / totalWallArea;

// By facade
const wwrNorth = northWindowArea / northWallArea;
// ... repeat for S, E, W
```

### Circulation Percentage

```javascript
// Identify circulation rooms
const circulationRooms = rooms.filter(r =>
  r.name.includes('hallway') ||
  r.name.includes('corridor') ||
  r.name.includes('landing') ||
  r.name.includes('stairs')
);

const circulationArea = circulationRooms.reduce((sum, r) => sum + r.area, 0);
const circulationPercent = (circulationArea / totalFloorArea) × 100;

// Typical range: 10-20%
```

### Daylight Factor Proxy

```javascript
// Simplified DF estimation (not true raytracing)
// Real DF requires 3D geometry and sky models

rooms.forEach(room => {
  // Estimate: (window_count × 2.5) / sqrt(room_area)
  const dfProxy = (room.windowCount × 2.5) / Math.sqrt(room.area);

  // UK Building Regs: DF ≥ 2% for habitable rooms
  room.adequate = dfProxy >= 0.02;
});

const averageDF = rooms.reduce((sum, r) => sum + r.dfProxy, 0) / rooms.length;
```

---

## UK Building Regulations Compliance

### Checked Regulations

**Part M: Access to and use of buildings**
- ✅ Door width ≥800mm
- ✅ Corridor width ≥900mm
- ✅ Head height ≥2.0m

**Part K: Protection from falling, collision and impact**
- ✅ Stair pitch ≤42°
- ✅ Handrail heights 900-1000mm
- ✅ Step rise/going ratios

**Part L: Conservation of fuel and power**
- ✅ WWR 0.25-0.45 (optimal for UK climate)
- ✅ U-values for walls, roof, glazing
- ✅ Air tightness standards

**Part F: Ventilation**
- ✅ Adequate openable window area
- ✅ Background ventilation
- ✅ Extract ventilation for wet rooms

### Badge Display

```svg
<g id="compliance-badges">
  <!-- Green badge if passing -->
  <rect fill="#E8F5E9" stroke="#4CAF50"/>
  <text>✓ Door Width ≥800mm</text>

  <!-- Orange badge if warning -->
  <rect fill="#FFF3E0" stroke="#FF9800"/>
  <text>⚠ Corridor ≥900mm</text>
</g>
```

---

## Scale Accuracy

### Ensuring 1:100 Prints Correctly

**Vector Units in mm:**
```svg
<svg width="841mm" height="594mm" viewBox="0 0 841 594">
  <!-- All coordinates in mm -->
  <rect x="15mm" y="15mm" width="400mm" height="270mm"/>
</svg>
```

**Scale Calculation:**
```javascript
// At 1:100 scale:
// 1mm on paper = 100mm in reality = 0.1m

// 12m building → 120mm on paper at 1:100
const buildingWidth = 12; // meters
const scaleRatio = 100;
const paperWidth = (buildingWidth * 1000) / scaleRatio; // 120mm
```

**Verification:**
```bash
# Print A1 SVG at 100% scale
# Measure with ruler: 12m building should be 120mm
```

---

## Traceability System

### Design Fingerprint

```javascript
// Calculate SHA-256 hash of design.json
const designHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(design))
  .digest('hex')
  .substring(0, 16); // First 16 chars

// Print on title block
// Design ID:  proj_20251028_143025
// Seed:       847261
// Hash:       a3f5c891b2e4d7f6
```

### Version Comparison

```bash
# Compare two versions of same design
diff <(cat design_v1.json | jq -S) \
     <(cat design_v2.json | jq -S)

# Check if sheet matches design.json
cat architecture-sheet.svg | grep "sha256"
# SHA256: a3f5c891b2e4d7f6

echo -n "$(cat design.json)" | sha256sum
# a3f5c891b2e4d7f6...  ✅ Match!
```

---

## Usage Examples

### In React Component

```javascript
// ArchitectAIEnhanced.js

const handleDownloadMasterSheet = async () => {
  console.log('📐 Generating Master Sheet...');

  try {
    // Prepare design data
    const designData = {
      masterDNA: designResult.designDNA,
      visualizations: designResult.visualizations,
      projectContext: {
        buildingProgram,
        location: locationData,
        portfolioAnalysis
      },
      geometryData: geometryResult
    };

    // Import and use sheet composer
    const sheetComposer = await import('./services/sheetComposer');
    const svgContent = sheetComposer.composeSheet(designData);

    // Download SVG
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `architecture-sheet-${designData.masterDNA.projectID}.svg`;
    link.click();
    URL.revokeObjectURL(url);

    console.log('✅ Master Sheet downloaded');

  } catch (error) {
    console.error('❌ Sheet generation failed:', error);
  }
};
```

### API Endpoint

```javascript
// api/sheet.js

export default async function handler(req, res) {
  const { format = 'svg', design_id } = req.query;

  // Load design from storage (or use request body)
  const design = await loadDesign(design_id);

  // Generate sheet
  const svgContent = composeSheet(design);

  if (format === 'svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="sheet-${design_id}.svg"`);
    return res.status(200).send(svgContent);
  }

  // PDF conversion (future)
  if (format === 'pdf') {
    const pdfBuffer = await convertSVGtoPDF(svgContent);
    res.setHeader('Content-Type', 'application/pdf');
    return res.status(200).send(pdfBuffer);
  }
}
```

---

## Future Enhancements

### Phase 2 Features

1. **PDF Export**
   - Server-side conversion with Puppeteer
   - Or svg2pdf.js for client-side conversion
   - Vector PDF maintains scale accuracy

2. **Multi-Sheet Sets**
   - A1 Master Sheet (overview)
   - A3 Detail Sheets (room-by-room)
   - A4 Specification Sheets (materials, finishes)

3. **Interactive QR Codes**
   - Link to 3D glTF viewer
   - Embedded project metadata
   - AR view via phone camera

4. **Custom Layouts**
   - User-configurable slot positions
   - Different page sizes (A0, A2, A3)
   - Portrait vs landscape orientation

5. **Real Vector Embedding**
   - Embed actual SVG geometry from pipeline
   - Not just placeholder boxes
   - True vector plans/elevations

6. **Auto-Dimensioning**
   - Dimension lines on plans
   - Room areas labeled
   - Wall thicknesses annotated

---

## Benefits of SOS System

### ✅ Consistency
- All views derived from single `design.json`
- No manual assembly errors
- Material colors match perfectly

### ✅ Traceability
- Design ID + Seed + Hash = unique fingerprint
- Can recreate exact design from metadata
- Version control via hash comparison

### ✅ Scale Accuracy
- Vector units in mm
- 1:100 prints exactly 10× smaller
- No raster scaling artifacts

### ✅ Professional Output
- Title blocks with project info
- North arrows and scale bars
- Compliance badges
- Material palettes

### ✅ Automation
- One-click download
- No manual composition
- Consistent layout every time

---

## Testing Checklist

- [ ] Sheet generates without errors
- [ ] All 13 views appear in correct slots
- [ ] Title block shows correct metadata
- [ ] Design hash matches design.json
- [ ] Material palette shows correct colors
- [ ] Metrics are calculated correctly
- [ ] Compliance badges show correct status
- [ ] Scale bar is accurate (measure with ruler)
- [ ] Download works (SVG file downloads)
- [ ] Sheet prints at A1 size correctly
- [ ] 1:100 scale measures correctly on paper
- [ ] QR code links to correct URL

---

## Troubleshooting

### Sheet generation fails
- Check all required data is present (masterDNA, visualizations)
- Verify config/sheet_A1.json exists
- Check browser console for errors

### Scale is incorrect when printed
- Ensure printer is set to "Actual Size" not "Fit to Page"
- Verify SVG units are in mm
- Check viewBox matches size_mm

### Views are missing/blank
- Check visualization URLs are valid
- Verify slot src paths match actual files
- Ensure images are accessible

### Metrics are wrong
- Verify room areas in floor plans
- Check window counts in elevations
- Ensure dimensions are in correct units (meters)

---

**Status:** ✅ Core Implementation Complete
**Next Step:** UI Integration + Testing
**Target:** Production-ready A1 sheet generation

---

*Last Updated: October 28, 2025*
*Version: 1.0.0*
