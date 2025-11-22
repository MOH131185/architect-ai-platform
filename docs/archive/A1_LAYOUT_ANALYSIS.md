# A1 Sheet Layout Analysis: Current vs Target

## Target Layout (From Uploaded Example)

### Grid Structure (6 rows × 3-4 columns)

**ROW 1** (Top - Context & Hero):
- **Col 1 (Left)**: Site context map with legend, compass, scale bar
- **Col 2-3 (Center-Right)**: Large hero 3D exterior perspective view
- **Col 4 (Far Right)**: Architectural style info, materials palette

**ROW 2** (Plans):
- **Col 1**: Ground floor plan (ELIER label) with dimensions, furniture, hatching
- **Col 2**: First floor plan (ETAGY 4 FLOOR label) with dimensions
- **Col 3**: Courtyard/core axonometric or interior 3D view

**ROW 3** (Elevations - Part 1):
- **Col 1**: SEXTESD elevation (one facade)
- **Col 2**: REDTH elevation (opposite facade)
- **Col 3**: Project data / building info panel

**ROW 4** (Elevations - Part 2):
- **Col 1**: EAST elevation
- **Col 2**: VOST (WEST) elevation
- **Col 3**: Environmental performance panel

**ROW 5** (Sections):
- **Col 1-2**: SECTOR JAA (Section A-A) longitudinal section
- **Col 3**: Additional section or detail

**ROW 6** (Bottom - Data & Legend):
- **Col 1**: ENVIRONMENTA table (metrics: Elle, Date ho com, Revie, Earpooeer, etc.)
- **Col 2**: Additional data or notes
- **Col 3**: Material swatches (RDIES) with color chips, title block

### Key Observations

1. **More panels than current**: Example has ~15-18 distinct panels vs current 15
2. **Different grid**: 6 rows vs current 5 rows
3. **Larger hero view**: Takes 2-3 columns vs current 1 column
4. **Two floor plans side-by-side**: Ground + First in same row
5. **Four elevations**: All four facades shown (N, S, E, W or equivalents)
6. **Environmental table**: Dedicated panel with structured data (metrics, values, units)
7. **Material swatches**: Visual color chips with labels (not just text list)
8. **Real text annotations**: Dimension strings, room labels, level markers visible
9. **Consistent line weights**: Technical drawing style throughout

---

## Current Layout (From strictA1PromptGenerator.js)

### Grid Structure (5 rows × 3 columns)

**ROW 1**:
- Col 1: SITE PLAN BLANK (placeholder for HTML overlay)
- Col 2: 3D HERO VIEW (exterior perspective)
- Col 3: MATERIAL PANEL (text list)

**ROW 2**:
- Col 1: GROUND FLOOR plan
- Col 2: FIRST FLOOR plan
- Col 3: AXONOMETRIC view

**ROW 3**:
- Col 1: NORTH ELEVATION
- Col 2: SOUTH ELEVATION
- Col 3: PROJECT DATA panel

**ROW 4**:
- Col 1: EAST ELEVATION
- Col 2: WEST ELEVATION
- Col 3: ENVIRONMENTAL panel

**ROW 5**:
- Col 1: SECTION A-A
- Col 2: SECTION B-B
- Col 3: TITLE BLOCK

### Issues Identified

1. **Site plan blank**: Should be actual site context map with buildings/streets
2. **Hero view too small**: Only 1 column vs 2-3 in example
3. **Missing interior 3D**: Example has interior perspective, current doesn't specify
4. **Material panel text-only**: Should be visual swatches with color chips
5. **Environmental panel vague**: No structured table format specified
6. **Title block separate**: Should be integrated with materials/legend at bottom
7. **No dimension annotations**: Plans/elevations lack explicit dimension string requirements
8. **No room labels**: Floor plans don't emphasize room names/labels
9. **Generic panel descriptions**: Not specific enough about content (e.g., "PROJECT DATA" vs specific metrics)

---

## Target Panel Specifications (Aligned with Example)

### Panel Map (15-18 panels)

| Panel ID | Type | Location | Content | Priority |
|----------|------|----------|---------|----------|
| P01 | Site Context | R1C1 | Site map, buildings, streets, boundary, scale, north arrow | HIGH |
| P02 | 3D Exterior Hero | R1C2-C3 | Large photorealistic exterior perspective, main facade visible | CRITICAL |
| P03 | Style/Materials Info | R1C4 | Architectural style description, material palette text | MEDIUM |
| P04 | Ground Floor Plan | R2C1 | Orthographic, colored hatching, room labels, dimensions, furniture | CRITICAL |
| P05 | First Floor Plan | R2C2 | Orthographic, colored hatching, room labels, dimensions | CRITICAL |
| P06 | 3D Interior/Axo | R2C3 | Interior perspective OR axonometric, showing spatial quality | HIGH |
| P07 | Elevation 1 (N/S) | R3C1 | Flat orthographic, materials, dimensions, window counts | CRITICAL |
| P08 | Elevation 2 (S/N) | R3C2 | Flat orthographic, materials, dimensions, window counts | CRITICAL |
| P09 | Project Data | R3C3 | GIFA, site area, footprint, height, floors, program type | HIGH |
| P10 | Elevation 3 (E) | R4C1 | Flat orthographic, materials, dimensions | CRITICAL |
| P11 | Elevation 4 (W) | R4C2 | Flat orthographic, materials, dimensions | CRITICAL |
| P12 | Environmental Panel | R4C3 | Structured table: U-values, EPC, ventilation, sun orientation | HIGH |
| P13 | Section A-A | R5C1-C2 | Longitudinal section, structural layers, dimensions | HIGH |
| P14 | Section B-B | R5C3 | Transverse section, structural layers, dimensions | MEDIUM |
| P15 | Environmental Table | R6C1 | Metrics table (Elle, Date, Revie, etc.) with values and units | HIGH |
| P16 | Material Swatches | R6C2-C3 | Visual color chips (rectangles) with material names, title block | HIGH |

### Content Requirements Per Panel Type

#### Floor Plans (P04, P05)
- **Layout**: TRUE 2D orthographic (NO perspective, NO 3D)
- **Hatching**: Colored material fills (walls, floors, fixtures)
- **Labels**: Room names in each space (e.g., "LIVING", "KITCHEN", "BEDROOM 1")
- **Dimensions**: Dimension strings on all major walls (e.g., "15.25m", "10.15m")
- **Furniture**: Scale-appropriate furniture outlines
- **Annotations**: Grid lines (A-D, 1-4), north arrow, stair direction (UP/DOWN), door swings
- **Scale**: "Scale 1:100" label

#### Elevations (P07, P08, P10, P11)
- **Layout**: Flat orthographic projection (NO perspective, NO depth)
- **Rendering**: Rendered with correct materials, shadows, and textures
- **Dimensions**: Height markers (0.00, +FFL, +ridge), opening widths
- **Annotations**: Level markers, window/door labels, material callouts
- **Scale**: "Scale 1:100" label
- **Facade label**: Clear label (e.g., "NORTH ELEVATION", "SEXTESD")

#### Sections (P13, P14)
- **Layout**: TRUE orthographic cut through building
- **Content**: Structural layers visible (wall buildup, roof buildup, slab buildup)
- **Dimensions**: Floor-to-floor heights, total height, foundation depth
- **Annotations**: Level markers, cut line indicators, material layers labeled
- **Scale**: "Scale 1:100" label

#### 3D Views (P02, P06)
- **P02 (Hero Exterior)**: Photorealistic, eye-level perspective, main facade + side visible, correct materials/windows
- **P06 (Interior/Axo)**: Interior perspective showing spatial quality OR axonometric showing roof/massing

#### Data Panels (P09, P12, P15)
- **P09 (Project Data)**: Bullet list or table with GIFA, site area, footprint, height, floors, program
- **P12 (Environmental)**: Structured data: U-values (wall, roof, glazing), EPC target, ventilation type, sun orientation
- **P15 (Environmental Table)**: Table format with columns (Metric | Value | Unit), rows for key metrics

#### Material Swatches (P16)
- **Format**: Visual rectangular color chips (NOT just text)
- **Content**: Primary material (brick/cladding), secondary material, roof material, window frames
- **Labels**: Material name + hex color below each chip
- **Title Block**: Integrated with swatches - project title, address, client, company name, logo, date, scale, drawing number

---

## Prompt Structure Changes Required

### 1. Update Grid Definition

**Current** (5 rows × 3 cols = 15 panels):
```
ROW 1: [SITE BLANK] [3D HERO] [MATERIAL TEXT]
ROW 2: [GROUND] [FIRST] [AXONOMETRIC]
ROW 3: [N ELEV] [S ELEV] [PROJECT DATA]
ROW 4: [E ELEV] [W ELEV] [ENVIRONMENTAL]
ROW 5: [SECTION A] [SECTION B] [TITLE BLOCK]
```

**Target** (6 rows, variable cols = 16-18 panels):
```
ROW 1: [SITE MAP] [3D HERO EXTERIOR (LARGE, 2 cols)] [STYLE/MATERIALS INFO]
ROW 2: [GROUND PLAN] [FIRST PLAN] [3D INTERIOR/AXO]
ROW 3: [ELEVATION N] [ELEVATION S] [PROJECT DATA TABLE]
ROW 4: [ELEVATION E] [ELEVATION W] [ENVIRONMENTAL PANEL]
ROW 5: [SECTION A-A (LARGE, 2 cols)] [SECTION B-B]
ROW 6: [ENVIRONMENTAL TABLE] [MATERIAL SWATCHES + TITLE BLOCK (2 cols)]
```

### 2. Enhance Panel Content Specifications

**Current**: Generic descriptions (e.g., "GROUND FLOOR PLAN (Scale 1:100)")

**Target**: Detailed, explicit requirements:
```
GROUND FLOOR PLAN (Scale 1:100):
• TRUE 2D orthographic (NO perspective, NO 3D, NO isometric)
• Colored hatching: walls (gray), floors (beige), fixtures (blue)
• Room labels: "LIVING 5.5m × 4.0m", "KITCHEN 4.0m × 3.5m", "BEDROOM 1 3.5m × 3.0m"
• Dimension strings: all external walls, key internal walls
• Furniture: sofa in living, table in kitchen, bed in bedrooms
• Grid lines: A-D horizontal, 1-4 vertical
• North arrow: top-right corner
• Stair: UP arrow, 13 risers
• Door swings: 90° arcs
• Window symbols: double lines
• Scale bar: 0-1-2-3-4-5m
```

### 3. Add Panel Completeness Checklist

At end of prompt, add verification section:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PANEL COMPLETENESS CHECKLIST (VERIFY BEFORE FINALIZING)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before finalizing the A1 sheet, verify ALL panels are present and correct:

PLANS:
☐ Ground floor plan with room labels and dimensions
☐ First floor plan with room labels and dimensions

ELEVATIONS:
☐ North elevation with correct window count and materials
☐ South elevation with correct window count and materials
☐ East elevation with correct window count and materials
☐ West elevation with correct window count and materials

SECTIONS:
☐ Section A-A (longitudinal) with floor heights
☐ Section B-B (transverse) with structural layers

3D VIEWS:
☐ Exterior hero perspective (large, photorealistic)
☐ Interior perspective OR axonometric

DATA PANELS:
☐ Site context map with scale and north arrow
☐ Project data table (GIFA, area, height, floors)
☐ Environmental panel (U-values, EPC, ventilation)
☐ Environmental metrics table (structured data)
☐ Material swatches (visual color chips)
☐ Title block with project info and logo

If ANY panel is missing, incomplete, or replaced by duplicate content, REGENERATE.
```

### 4. Strengthen Negative Prompts

**Add to negative prompts**:
```
(missing panels:5.0), (incomplete grid:5.0), (duplicate hero in plan cells:5.0),
(blank panels:5.0), (placeholder boxes:5.0), (text-only materials:4.5),
(no room labels:4.0), (no dimensions:4.0), (no environmental table:4.0),
(gibberish text:4.5), (lorem ipsum:4.5), (random characters:4.5)
```

---

## DNA Enrichment Requirements

### Current DNA Fields (Sufficient)
- `dimensions`: length, width, height, floors ✅
- `materials`: array with name, hexColor, application ✅
- `rooms`: array with name, dimensions, floor ✅
- `windows`: counts per facade, type, size ✅
- `roof`: type, pitch, material, color ✅
- `doors`: location, position, width, color ✅

### Additional DNA Fields Needed

#### For Room Labels in Plans
```javascript
dna.rooms = [
  {
    name: "Living Room",
    dimensions: "5.5m × 4.0m",
    area: 22.0,
    floor: "ground",
    position: "front-left", // NEW: helps with placement
    furniture: ["sofa", "coffee table", "TV unit"], // NEW: for furniture symbols
    windows: 2, // NEW: per-room window count
    doors: 1 // NEW: per-room door count
  },
  // ... more rooms
]
```

#### For Environmental Panel
```javascript
dna.environmental = {
  uValues: {
    wall: 0.18, // W/m²K
    roof: 0.13,
    glazing: 1.4,
    floor: 0.15
  },
  epcRating: "B",
  epcScore: 85, // 81-91 range
  ventilation: "Natural cross-ventilation",
  sunOrientation: 180, // degrees
  airTightness: 5.0, // m³/h/m² at 50Pa
  renewableEnergy: "Solar PV 4kWp" // optional
}
```

#### For Material Swatches
```javascript
dna.materials = [
  {
    name: "Red brick",
    hexColor: "#B8604E",
    application: "exterior walls",
    texture: "stretcher bond", // NEW: for rendering
    finish: "matte" // NEW: for rendering
  },
  // ... more materials
]
```

#### For Elevation Annotations
```javascript
dna.elevations = {
  north: {
    windowCount: 4,
    doorCount: 1,
    doorPosition: "centered",
    features: ["main entrance", "canopy"],
    materials: ["Red brick #B8604E", "Aluminum frames #333333"]
  },
  south: {
    windowCount: 3,
    doorCount: 0,
    features: ["patio doors", "balcony"],
    materials: ["Red brick #B8604E"]
  },
  // ... east, west
}
```

---

## Implementation Priority

### Phase 1: Critical Layout Changes (This PR)
1. ✅ Update grid from 5 rows to 6 rows
2. ✅ Make hero view span 2 columns
3. ✅ Add interior 3D view panel
4. ✅ Convert material panel to visual swatches
5. ✅ Add structured environmental table
6. ✅ Integrate title block with materials/legend

### Phase 2: Content Enrichment (This PR)
1. ✅ Add room labels to floor plan prompts
2. ✅ Add dimension string requirements
3. ✅ Add environmental metrics to DNA and prompts
4. ✅ Add material swatch specifications
5. ✅ Add panel completeness checklist

### Phase 3: Validation & Error Handling (Next PR)
1. ⏳ Create `a1SheetValidator.js` with panel detection
2. ⏳ Add post-generation completeness check
3. ⏳ Warn user if panels missing
4. ⏳ Fix modify workflow errors

### Phase 4: UI/Branding (Future PR)
1. ⏳ Redesign landing page
2. ⏳ Create logo and brand system
3. ⏳ Refine navigation and responsiveness

---

## Success Criteria

### Generated A1 Sheet Should Have:
- ✅ 6 rows of panels (not 5)
- ✅ Large hero exterior view (2 columns)
- ✅ Interior 3D view OR axonometric
- ✅ Room labels in floor plans (e.g., "LIVING", "KITCHEN")
- ✅ Dimension strings on plans and elevations
- ✅ Visual material swatches (color chips, not text)
- ✅ Structured environmental table (metrics | values | units)
- ✅ Title block integrated with materials/legend
- ✅ All 4 elevations present and distinct
- ✅ Sections with structural layers and dimensions
- ✅ No missing panels, no duplicate content, no blank cells
- ✅ Consistent architectural style throughout

### Modify Workflow Should:
- ✅ Successfully add missing panels without errors
- ✅ Preserve existing panels when adding new ones
- ✅ Use low img2img strength (0.10-0.14) for safety
- ✅ Show clear error messages if baseline not found
- ✅ Store and retrieve all DNA fields correctly

