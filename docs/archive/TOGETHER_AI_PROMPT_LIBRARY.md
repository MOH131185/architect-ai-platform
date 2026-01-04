# Together.ai Prompt Library

**Production-ready prompts for architectural design generation with Together.ai**

This library contains copy-paste prompts for the complete geometry-first pipeline, ensuring strict JSON output, UK building code compliance, and perfect consistency across all views.

---

## 🏗️ Pipeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│  INPUTS                                                      │
│  • Address/polygon → geocode + site north                    │
│  • Program (rooms + min areas), target GIA, floors           │
│  • Portfolio images → CLIP embeddings                        │
│  • Optional site images (Street View, photos)                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  EMBEDDINGS (style + program)                                │
│  • Portfolio images → portfolio_style_vec                    │
│  • Site/context images → location_style_vec                  │
│  • Blend with weight w_portfolio (0-1) → style_vec           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  CLIMATE & CODES                                             │
│  • OpenWeather (HDD/CDD, wind)                               │
│  • UK building rules (door widths, WWR, corridor widths)     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  REASONING (Together LLM) → Project DNA                      │
│  • Produces strict JSON spec (no images)                     │
│  • Contains: dimensions, materials, rules, constraints       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYOUT SYNTHESIS (deterministic)                            │
│  • Snap to module_mm grid                                    │
│  • Heuristic/ILP for room placement                          │
│  • Adjacency graph + min areas + corridor rules              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  GEOMETRY BUILDER                                            │
│  • Extrude walls from plan polygons                          │
│  • Insert doors/windows per rules (sill/head, WWR)           │
│  • Build roof from DNA                                       │
│  • Save data/design.json                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  RENDERING (single source of truth)                          │
│  • Plans/elevations/sections → SVG/DXF (hidden-line)         │
│  • 3D views (axon, persp, interior) → PNG (unique cameras)   │
│  • Optional: Stylization with Together image model           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  SINGLE OUTPUT SHEET (A1/A3)                                 │
│  • Compose SVG/PDF with all views                            │
│  • Stamp: design_id, seed, sha256(design.json)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Together.ai API Code Templates

### Chat → JSON (Reasoning)

```javascript
import fetch from "node-fetch";
const API_KEY = process.env.TOGETHER_API_KEY;

async function togetherJSON(system, user) {
  const r = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      // Best reasoning models:
      // meta-llama/Meta-Llama-3-70B-Instruct
      // meta-llama/Llama-3.3-70B-Instruct-Turbo (faster)
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      temperature: 0.2,  // Low for deterministic output
      response_format: { type: "json_object" },  // Force JSON
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}
```

### Image Generation (Optional Stylization)

```javascript
async function togetherImage(prompt, controlImageUrl = null, seed = 14721) {
  const body = {
    model: "stabilityai/stable-diffusion-xl-base-1.0",
    prompt,
    seed,
    steps: 30,
    width: 1024,
    height: 768,
    guidance: 4.0
  };

  // Use if Together model supports control image
  if (controlImageUrl) {
    body.image = controlImageUrl;
  }

  const r = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return (await r.json()).data[0].url;
}
```

**Note**: If Together's image endpoint doesn't support ControlNet, keep stylization on Replicate (Multi-ControlNet) and use Together only for reasoning.

---

## 🎯 Prompt 1: Project DNA & Brief Synthesizer

**Purpose**: Generate complete architectural specifications as strict JSON. This is the ONLY time the LLM is involved - it produces the spec, your code builds the geometry.

**Usage**: `const dna = await togetherJSON(SYSTEM_PROMPT_1, USER_PROMPT_1);`

### SYSTEM PROMPT

```
You are an architectural design planner that outputs STRICT JSON only.
Your job: synthesize a Project DNA spec for a small residential project in the UK from site, climate, program, portfolio style, and surface polygon.

Rules:
- Snap all geometry to module_mm grid.
- Enforce UK residential heuristics:
  • Min door width ≥ 800mm
  • Corridor ≥ 900mm
  • Stairs 42° max pitch
  • Bathroom not opening directly to living
  • WWR (window-to-wall ratio) between 0.25 and 0.45
  • Head height ≥ 2.0m (2000mm)
- Recommend envelope and window sizing informed by HDD/CDD and prevailing wind.
- Style = blend of location and portfolio vectors (weights provided).
- Output JSON ONLY following the schema. No prose. No markdown code blocks.
```

### USER PROMPT (Template)

```
INPUTS:
- address: "<ADDRESS>"
- site_north_deg: <number>
- surface_poly_mm: [[x,y],...]
- climate: {
    hdd: <int>,
    cdd: <int>,
    prevailing_wind: "<N/NE/E/SE/S/SW/W/NW>"
  }
- program:
  - levels: <int>
  - rooms: [
      {
        name: "Living Room",
        min_area_m2: 20,
        floor: 0,
        adjacency: ["kitchen","dining"]
      },
      {
        name: "Kitchen",
        min_area_m2: 12,
        floor: 0,
        adjacency: ["dining","living"]
      }
      // ... more rooms
    ]
  - target_gia_m2: <number>
- style_blend:
  - portfolio_style_vec: [..float32..]
  - location_style_vec: [..float32..]
  - w_portfolio: <0..1>  // 0 = pure location style, 1 = pure portfolio style
- constraints: {
    parking: <int>,
    main_entry_dir: "<N/S/E/W>",
    setbacks_mm: {N:.., S:.., E:.., W:..}
  }

OUTPUT JSON SCHEMA (follow exactly):
{
  "design_id": "proj_<timestamp>",
  "site": {
    "lat": null,
    "lon": null,
    "north": <deg>
  },
  "dna": {
    "style": "UK_brick_georgian | modern_brick | contemporary_render | ...",
    "module_mm": 300,
    "wwr": 0.32,
    "roof": "gable_30deg | hip_25deg | flat_5deg | ...",
    "materials": ["local_brick", "stone_lintels", "slate_roof"],
    "climate": {
      "hdd": 2800,
      "cdd": 120,
      "prevailing_wind": "SW"
    }
  },
  "levels": [
    {"z": 0, "height_mm": 2700},
    {"z": 2700, "height_mm": 2600}
  ],
  "rooms_plan_targets": [
    {
      "id": "rm_living",
      "level": 0,
      "min_area_m2": 20,
      "near": ["kitchen"],
      "away_from": ["bathroom"]
    },
    {
      "id": "rm_kitchen",
      "level": 0,
      "min_area_m2": 12,
      "near": ["dining", "living"]
    }
    // ... all rooms
  ],
  "layout": {
    "grid_mm": 300,
    "entry_side": "S",
    "stairs": {
      "min_clear_width_mm": 900,
      "max_pitch_deg": 42
    },
    "corridor_min_width_mm": 900,
    "setbacks_mm": {"N": 0, "S": 0, "E": 0, "W": 0}
  },
  "openings_rules": {
    "door_width_mm": 900,
    "window_sill_mm": 900,
    "window_head_mm": 2100,
    "wwr_target": 0.32,
    "orientation_bias": {
      "S": 1.0,   // South gets most windows
      "E": 0.8,
      "W": 0.8,
      "N": 0.6    // North gets fewer windows
    }
  },
  "roof_rules": {
    "type": "gable",
    "slope_deg": 30
  },
  "cameras": {
    "axon": {
      "type": "ortho",
      "az": 45,      // azimuth degrees
      "el": 35,      // elevation degrees
      "dist": 22,    // distance
      "fov": 20
    },
    "persp": {
      "type": "persp",
      "az": 60,
      "el": 20,
      "dist": 26,
      "fov": 60
    },
    "interior_main": {
      "type": "persp",
      "target": "rm_living",
      "fov": 70
    }
  },
  "seed": 14721
}

Return ONLY valid JSON. No comments. No markdown. No explanatory text.
```

### Example Usage

```javascript
// Build user prompt from actual data
const userPrompt = `
INPUTS:
- address: "123 High Street, Oxford, UK"
- site_north_deg: 15
- surface_poly_mm: [[0,0], [12000,0], [12000,8000], [0,8000]]
- climate: {
    hdd: 2800,
    cdd: 120,
    prevailing_wind: "SW"
  }
- program:
  - levels: 2
  - rooms: [
      {name: "Living Room", min_area_m2: 22, floor: 0, adjacency: ["kitchen","dining"]},
      {name: "Kitchen", min_area_m2: 12, floor: 0, adjacency: ["dining","living"]},
      {name: "Dining", min_area_m2: 10, floor: 0, adjacency: ["kitchen","living"]},
      {name: "Master Bedroom", min_area_m2: 16, floor: 1, adjacency: ["master_bath"]},
      {name: "Bedroom 2", min_area_m2: 12, floor: 1, adjacency: []},
      {name: "Master Bath", min_area_m2: 6, floor: 1, adjacency: ["master_bedroom"]},
      {name: "Bathroom", min_area_m2: 5, floor: 1, adjacency: []}
    ]
  - target_gia_m2: 95
- style_blend:
  - portfolio_style_vec: [0.2, 0.8, 0.5, ...]
  - location_style_vec: [0.6, 0.3, 0.7, ...]
  - w_portfolio: 0.7
- constraints: {
    parking: 2,
    main_entry_dir: "S",
    setbacks_mm: {N: 1000, S: 1500, E: 1000, W: 1000}
  }

OUTPUT JSON SCHEMA (follow exactly):
${JSON_SCHEMA_FROM_ABOVE}
`;

const dna = await togetherJSON(SYSTEM_PROMPT_1, userPrompt);

// Save to file
fs.writeFileSync('data/design.json', JSON.stringify(dna, null, 2));
```

---

## 🔧 Prompt 2: Layout Synthesis Fixer (Optional)

**Purpose**: Adjust room polygons to fix overlaps and improve adjacency while respecting all rules. Use this if your deterministic layout algorithm produces issues.

**Usage**: `const fixedLayout = await togetherJSON(SYSTEM_PROMPT_2, USER_PROMPT_2);`

### SYSTEM PROMPT

```
You adjust room polygons to satisfy adjacency, area, and circulation rules.
Return STRICT JSON of updated room polygons snapped to grid.
No prose. No markdown. No explanatory text. JSON only.
```

### USER PROMPT (Template)

```
Given:
- module_mm: 300
- corridor_min_width_mm: 900
- rooms (with current polygons in mm): [
    {
      id: "rm_living",
      level: 0,
      poly: [[0,0], [6000,0], [6000,4500], [0,4500]],
      min_area_m2: 20,
      near: ["kitchen", "dining"],
      away_from: ["bathroom"]
    },
    {
      id: "rm_kitchen",
      level: 0,
      poly: [[6000,0], [9000,0], [9000,4500], [6000,4500]],
      min_area_m2: 12,
      near: ["dining", "living"],
      away_from: []
    }
    // ... all rooms with current polygons
  ]
- surface_poly_mm: [[0,0], [12000,0], [12000,8000], [0,8000]]
- entry_side: "S"
- stairs_position: {"x": 3000, "y": 4000, "width": 900, "length": 3000}

Goal:
Repair overlaps, respect adjacency preferences, maintain min areas, ensure corridor access.
Return:
{
  "rooms": [
    {
      "id": "rm_living",
      "level": 0,
      "poly": [[0,0], [6300,0], [6300,4500], [0,4500]]
    },
    {
      "id": "rm_kitchen",
      "level": 0,
      "poly": [[6300,0], [9300,0], [9300,4500], [6300,4500]]
    }
    // ... all fixed rooms
  ]
}

Snap all vertices to the 300mm grid.
Return JSON only. No explanatory text.
```

---

## 📄 Prompt 3: Single Output Sheet (SVG) Composer

**Purpose**: Generate the final A1/A3 SVG sheet that composes all technical drawings and 3D views with proper layout, title block, and metadata stamps.

**Usage**: `const svg = await togetherJSON(SYSTEM_PROMPT_3, USER_PROMPT_3);`

### SYSTEM PROMPT

```
You output a single SVG layout (units mm) that composes provided SVG/PNG assets into a professional architecture print sheet.
No external URLs - use provided hrefs as-is.
Do not invent geometry - only place existing assets.
Return SVG ONLY. No markdown. No explanatory text.
```

### USER PROMPT (Template)

```
Sheet: {
  size_mm: [841, 594],  // A1 landscape (or [594, 420] for A2, [420, 297] for A3)
  margins_mm: 15
}

Assets (file paths to embed):
- plan_ground_svg: "technical/plan_ground.svg"
- plan_upper_svg: "technical/plan_upper.svg"
- elev_north_svg: "technical/elev_north.svg"
- elev_south_svg: "technical/elev_south.svg"
- elev_east_svg: "technical/elev_east.svg"
- elev_west_svg: "technical/elev_west.svg"
- section_AA_svg: "technical/section_AA.svg"
- axon_png: "renders/axon.png"
- persp_png: "renders/persp.png"
- metrics_svg: "generated/metrics.svg"
- materials_png: "assets/material_board.png"

Metadata:
- project: "ArchiAI Residence - Oxford"
- design_id: "proj_20251028_142530"
- seed: 14721
- hash: "a3f5c8d..."  // SHA256 of design.json
- scales: { plans: "1:100", elevs: "1:100", section: "1:100" }
- north_arrow: true
- date: "2025-10-28"

Task:
1. Place title block at bottom (55mm tall) with:
   - Project name (bold, 14pt)
   - Design ID, seed, hash (monospace, 8pt)
   - Scale bars for each drawing type
   - North arrow (if north_arrow: true)
   - Date stamp

2. Layout (from top):
   - Upper section (300mm tall):
     • Two floor plans side-by-side, centered
   - Middle section (200mm tall):
     • Four elevations in a row (equal widths)
     • Section below elevations (full width or half)
   - Lower section (remaining height above title block):
     • Left: Axon thumbnail (120×120mm) + Perspective thumbnail (120×120mm)
     • Center: Materials board (100×150mm)
     • Right: Metrics table

3. Respect white margins (15mm on all sides)

4. Output ONE valid SVG with:
   - <image> tags referencing provided hrefs
   - <text> tags for all labels (font: Arial, size: 8-12pt)
   - <rect> borders around each view
   - Units in mm

Return SVG markup only. No markdown code blocks.
```

### Alternative: Simpler Prompt (If LLM struggles with layout)

```
Create an A1 SVG (841×594mm, 15mm margins) with the following layout:

TOP (300mm height):
  - plan_ground.svg (left half)
  - plan_upper.svg (right half)

MIDDLE (200mm height):
  - Row of 4 elevations (equal width)
  - section_AA.svg below (full width)

BOTTOM (remaining height):
  - axon.png + persp.png thumbnails (left)
  - materials.png (center)
  - metrics.svg (right)

TITLE BLOCK (55mm at very bottom):
  - Project: "ArchiAI Residence"
  - ID: proj_20251028_142530
  - Seed: 14721
  - Hash: a3f5c8d...
  - Date: 2025-10-28
  - North arrow
  - Scale: 1:100

Use <image href="..." x="..." y="..." width="..." height="..."/> for assets.
Return SVG only.
```

---

## 💬 Prompt 4: Style & Climate Reasoning Explainer

**Purpose**: Generate architectural reasoning and explanations for client presentations or quality assurance. This prompt extracts the "why" behind design decisions.

**Usage**: `const explanation = await togetherJSON(SYSTEM_PROMPT_4, USER_PROMPT_4);`

### SYSTEM PROMPT

```
You are an architectural analyst. Be concise and technical.
Cite numeric climate drivers (HDD/CDD, wind) and map them to envelope/WWR/material decisions.
UK residential context by default.
Return explanations as structured text or JSON.
```

### USER PROMPT (Template)

```
Given DNA and climate data:

DNA:
${JSON.stringify(design.dna, null, 2)}

Climate:
${JSON.stringify(design.climate, null, 2)}

Site:
${JSON.stringify(design.site, null, 2)}

Explain:
1. Facade language (bonding pattern, lintels, texture) and roof choice - WHY these materials?
2. WWR (window-to-wall ratio) and orientation strategy - cite HDD/CDD numbers
3. Material choices that reduce heating/cooling bills - be specific about thermal performance
4. How prevailing wind influenced building form and openings placement
5. Roof type and pitch - structural and climate rationale
6. Entry orientation - connection to site and street context

Return a 6-8 bullet summary with numeric justifications.
Format: JSON with { "reasoning": ["bullet 1", "bullet 2", ...] }
```

### Example Output

```json
{
  "reasoning": [
    "Red brick facade (220mm cavity wall) provides thermal mass suitable for HDD=2800 climate, reducing heating demand by ~18% vs lightweight construction",
    "WWR of 0.32 balances daylighting with heat loss; south facade WWR=0.40 (solar gain in winter), north WWR=0.25 (minimize heat loss)",
    "Gable roof at 30° pitch optimizes for prevailing SW wind (reduces uplift) and allows for future PV installation at optimal angle for UK latitude",
    "Slate roof tiles (70mm lap) provide 60+ year lifespan and superior wind resistance vs alternatives",
    "Main entry on south facade sheltered by 600mm overhang protects from driving rain (SW wind + typical UK 800mm annual rainfall)",
    "Stone lintels over openings reference local Oxford vernacular while providing structural support for 900mm wide windows",
    "Corridor width 900mm (vs 850mm min) allows future accessibility modifications per Part M",
    "Floor heights 2700mm ground / 2600mm upper balance volume (thermal comfort) with construction economy"
  ]
}
```

---

## 🎯 Complete Workflow Example

### Step 1: Generate Project DNA

```javascript
import { togetherJSON } from './services/togetherAIService.js';
import { SYSTEM_PROMPT_1, buildUserPrompt1 } from './prompts/dnaGenerator.js';

const inputs = {
  address: "15 Park Street, Bath, UK",
  site_north_deg: 20,
  surface_poly_mm: [[0,0], [15000,0], [15000,10000], [0,10000]],
  climate: { hdd: 2600, cdd: 140, prevailing_wind: "SW" },
  program: {
    levels: 2,
    rooms: [
      {name: "Living", min_area_m2: 25, floor: 0, adjacency: ["kitchen","dining"]},
      {name: "Kitchen", min_area_m2: 15, floor: 0, adjacency: ["dining"]},
      // ... more rooms
    ],
    target_gia_m2: 110
  },
  style_blend: {
    portfolio_style_vec: [/* CLIP embeddings */],
    location_style_vec: [/* CLIP embeddings */],
    w_portfolio: 0.6
  },
  constraints: {
    parking: 2,
    main_entry_dir: "S",
    setbacks_mm: {N: 1500, S: 2000, E: 1000, W: 1000}
  }
};

const userPrompt = buildUserPrompt1(inputs);
const dna = await togetherJSON(SYSTEM_PROMPT_1, userPrompt);

// Save DNA
fs.writeFileSync('data/design.json', JSON.stringify(dna, null, 2));
```

### Step 2: Generate Geometry (Deterministic)

```javascript
import { buildGeometry } from './geometry/geometryBuilder.js';
import { spatialLayoutAlgorithm } from './geometry/spatialLayoutAlgorithm.js';

// Read DNA
const design = JSON.parse(fs.readFileSync('data/design.json', 'utf8'));

// Generate room layout from DNA
const layout = spatialLayoutAlgorithm(design.dna.rooms_plan_targets, {
  grid_mm: design.dna.layout.grid_mm,
  surface_poly_mm: design.surface_poly_mm,
  stairs: design.dna.layout.stairs,
  corridor_min_width_mm: design.dna.layout.corridor_min_width_mm
});

// Build 3D geometry
const geometry = buildGeometry(layout, design.dna);

// Save geometry
design.geometry = geometry;
fs.writeFileSync('data/design.json', JSON.stringify(design, null, 2));
```

### Step 3: Render All Views (Single Source of Truth)

```javascript
import { renderViews } from './render/renderViews.js';

// Read design with geometry
const design = JSON.parse(fs.readFileSync('data/design.json', 'utf8'));

// Render all views from the SAME geometry
const views = await renderViews(design.geometry, design.dna.cameras, {
  outputDir: 'technical/',
  formats: ['svg', 'dxf', 'png']
});

// views.plans: [plan_ground.svg, plan_upper.svg]
// views.elevations: [elev_north.svg, elev_south.svg, elev_east.svg, elev_west.svg]
// views.sections: [section_AA.svg]
// views.renders: [axon.png, persp.png, interior.png]
```

### Step 4: Generate Output Sheet

```javascript
import { SYSTEM_PROMPT_3, buildUserPrompt3 } from './prompts/sheetComposer.js';

const sheetInputs = {
  size_mm: [841, 594],  // A1
  margins_mm: 15,
  assets: {
    plan_ground_svg: views.plans[0],
    plan_upper_svg: views.plans[1],
    elev_north_svg: views.elevations[0],
    elev_south_svg: views.elevations[1],
    elev_east_svg: views.elevations[2],
    elev_west_svg: views.elevations[3],
    section_AA_svg: views.sections[0],
    axon_png: views.renders[0],
    persp_png: views.renders[1]
  },
  metadata: {
    project: "Bath Residence",
    design_id: design.design_id,
    seed: design.seed,
    hash: crypto.createHash('sha256').update(JSON.stringify(design)).digest('hex'),
    scales: { plans: "1:100", elevs: "1:100", section: "1:100" },
    north_arrow: true,
    date: new Date().toISOString().split('T')[0]
  }
};

const userPrompt = buildUserPrompt3(sheetInputs);
const svgSheet = await togetherJSON(SYSTEM_PROMPT_3, userPrompt);

fs.writeFileSync('output/master_sheet.svg', svgSheet);
```

### Step 5: Generate Reasoning Explanation

```javascript
import { SYSTEM_PROMPT_4, buildUserPrompt4 } from './prompts/reasoningExplainer.js';

const userPrompt = buildUserPrompt4({
  dna: design.dna,
  climate: design.climate,
  site: design.site
});

const explanation = await togetherJSON(SYSTEM_PROMPT_4, userPrompt);

console.log("Design Reasoning:");
explanation.reasoning.forEach((bullet, i) => {
  console.log(`${i+1}. ${bullet}`);
});
```

---

## 🔑 Why This Works

### 1. Separation of Concerns
- **LLM Role**: Only produces specifications (JSON) - never draws geometry
- **Geometry Engine**: Deterministic - converts JSON to 3D model
- **Renderer**: Single source of truth - all views from same model

### 2. Perfect Consistency
- All views (plans, elevations, sections, 3D) come from identical geometry
- No hallucinations or mismatched details
- Traceable via design_id + seed + SHA256 hash

### 3. UK Building Code Compliance
- Hardcoded constraints in prompts (door widths, WWR, corridor dimensions)
- LLM cannot violate these rules (enforced in system prompt)
- Post-validation available via validators.ts

### 4. Climate-Responsive Design
- Numeric HDD/CDD drives envelope and WWR decisions
- Prevailing wind influences orientation and roof design
- Material choices justified by thermal performance

### 5. Client-Ready Output
- Single A1/A3 sheet with all information
- Stamped with unique identifiers for traceability
- Professional layout with title block and scale bars
- Can be directly sent to planning/construction

---

## 📝 Prompt Engineering Tips

### DO:
✅ Use "STRICT JSON only" in system prompts
✅ Specify exact schema in user prompts
✅ Include numeric constraints (HDD/CDD, dimensions)
✅ Use temperature 0.2 for deterministic output
✅ Validate JSON output before using

### DON'T:
❌ Ask LLM to "generate images" or "draw"
❌ Allow freeform text responses when you need JSON
❌ Use high temperature (>0.3) for specifications
❌ Skip validation of LLM output
❌ Let LLM make up geometry coordinates

---

## 🧪 Testing Prompts

Test each prompt independently:

```bash
# Test DNA generation
node test-together-dna-prompt.js

# Test layout fixer
node test-together-layout-prompt.js

# Test sheet composer
node test-together-sheet-prompt.js

# Test reasoning explainer
node test-together-reasoning-prompt.js
```

---

## 📚 Related Documentation

- **[TOGETHER_AI_SETUP.md](./TOGETHER_AI_SETUP.md)** - API setup and configuration
- **[GEOMETRY_FIRST_README.md](./GEOMETRY_FIRST_README.md)** - Complete pipeline documentation
- **[DNA_SYSTEM_ARCHITECTURE.md](./DNA_SYSTEM_ARCHITECTURE.md)** - Design DNA system details
- **[UK_BUILDING_CODES.md](./UK_BUILDING_CODES.md)** - Complete building regulations reference

---

**Status**: ✅ Production Ready | **Version**: 1.0 | **Last Updated**: 2025-10-28
