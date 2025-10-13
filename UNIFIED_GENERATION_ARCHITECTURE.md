# Unified Generation Architecture

## Problem Statement

**Current Issue**: Floor plans and 3D visualizations are generated separately with different Replicate prompts, resulting in unrelated outputs that don't represent the same project.

**Root Cause**:
- OpenAI generates reasoning (style, materials)
- Replicate is called MULTIPLE times with DIFFERENT prompts
- Each call is independent → no guarantee of consistency

## Solution: Master Architect + Master Builder Pattern

### Phase 1: OpenAI as "Master Architect" (Decision Maker)

**Purpose**: OpenAI GPT-4 is the ONLY decision maker for the project design.

**Inputs**:
- Location data (climate, zoning, local styles)
- Portfolio images (user's style preferences)
- Building program (house, office, etc.)
- Floor area (200m², 500m², etc.)

**Outputs** (Complete Master Design Specification):
```javascript
{
  // 1. PROJECT IDENTITY
  projectName: "Contemporary Villa in Cairo",
  styleName: "Contemporary Egyptian Vernacular Fusion",

  // 2. DIMENSIONAL SPECIFICATION
  dimensions: {
    totalArea: 350,
    floors: 2,
    floorHeight: 3.2,
    length: 18.5,
    width: 12.3,
    height: 6.4
  },

  // 3. MATERIAL SPECIFICATION (Exact materials for ALL views)
  materials: {
    primary: "local limestone",
    secondary: "glass",
    accent: "wood",
    roof: "flat concrete with membrane",
    windows: "aluminum frame",
    doors: "solid wood"
  },

  // 4. ENTRANCE SPECIFICATION
  entrance: {
    orientation: "north",
    width: 2.4,
    type: "double door",
    feature: "covered entrance with columns"
  },

  // 5. FLOOR-BY-FLOOR PROGRAM (Exact rooms for floor plan generation)
  floors: [
    {
      level: 0,
      name: "Ground Floor",
      area: 175,
      rooms: [
        { name: "Entrance Lobby", area: 15, position: "north-center" },
        { name: "Living Room", area: 40, position: "north-west", features: ["large windows", "open to dining"] },
        { name: "Dining Area", area: 25, position: "north-east", features: ["adjacent to kitchen"] },
        { name: "Kitchen", area: 20, position: "east", features: ["island counter", "pantry"] },
        { name: "Guest Bathroom", area: 5, position: "center" },
        { name: "Master Bedroom", area: 35, position: "south-west", features: ["en-suite bathroom", "balcony"] },
        { name: "Master Bathroom", area: 12, position: "south-west" },
        { name: "Garage", area: 23, position: "south-east", features: ["2-car capacity"] }
      ]
    },
    {
      level: 1,
      name: "First Floor",
      area: 175,
      rooms: [
        { name: "Bedroom 2", area: 25, position: "north-west", features: ["built-in wardrobes", "balcony"] },
        { name: "Bedroom 3", area: 25, position: "north-east", features: ["built-in wardrobes"] },
        { name: "Shared Bathroom", area: 10, position: "north-center", features: ["dual sinks", "bathtub"] },
        { name: "Family Room", area: 30, position: "center", features: ["TV area", "bookshelves"] },
        { name: "Home Office", area: 20, position: "south-east", features: ["desk built-in", "storage"] },
        { name: "Laundry", area: 8, position: "south-center" },
        { name: "Roof Terrace", area: 57, position: "south-west", features: ["outdoor seating", "planters"] }
      ]
    }
  ],

  // 6. ARCHITECTURAL FEATURES (For 3D view generation)
  features: {
    roof: "flat roof with parapet",
    windows: "large glass panels, ribbon windows on living room",
    facade: "limestone cladding with vertical accents",
    balconies: "first floor bedrooms, master bedroom ground floor",
    landscaping: "desert-adapted plants, gravel courtyard"
  },

  // 7. DESIGN PHILOSOPHY (Context for all generation)
  philosophy: "Contemporary interpretation of Egyptian vernacular architecture, using local limestone with modern glass openings, optimized for desert climate with shading devices and thermal mass",

  // 8. CLIMATE ADAPTATIONS
  climate: {
    orientation: "north-facing entrance for cooler air",
    shading: "deep overhangs on south facade",
    cooling: "passive cooling through cross-ventilation",
    insulation: "high thermal mass limestone walls"
  }
}
```

### Phase 2: Replicate as "Master Builder" (Unified Execution)

**Purpose**: Generate ALL outputs (2D, elevations, 3D) from ONE unified prompt that includes the complete Master Design Specification.

**Critical Change**: Instead of multiple separate Replicate calls, we create ONE comprehensive prompt that includes:

1. **Complete project description** from OpenAI
2. **Exact dimensional specifications**
3. **Exact material list**
4. **Floor-by-floor room program**
5. **View type instruction** (floor plan / elevation / 3D view)

#### Single Unified Prompt Template

```javascript
function createUnifiedReplicatePrompt(masterSpec, viewType) {
  // BASE SPECIFICATION (Same for ALL views)
  const baseSpec = `
    PROJECT: ${masterSpec.projectName}
    STYLE: ${masterSpec.styleName}
    PHILOSOPHY: ${masterSpec.philosophy}

    EXACT DIMENSIONS:
    - Building: ${masterSpec.dimensions.length}m × ${masterSpec.dimensions.width}m × ${masterSpec.dimensions.height}m
    - Floors: ${masterSpec.dimensions.floors} (each ${masterSpec.dimensions.floorHeight}m high)
    - Total Area: ${masterSpec.dimensions.totalArea}m²

    EXACT MATERIALS (MUST USE THESE):
    - Primary: ${masterSpec.materials.primary}
    - Secondary: ${masterSpec.materials.secondary}
    - Accent: ${masterSpec.materials.accent}
    - Roof: ${masterSpec.materials.roof}
    - Windows: ${masterSpec.materials.windows}

    ENTRANCE: ${masterSpec.entrance.type} on ${masterSpec.entrance.orientation} facade, ${masterSpec.entrance.width}m wide

    ARCHITECTURAL FEATURES:
    - Roof: ${masterSpec.features.roof}
    - Windows: ${masterSpec.features.windows}
    - Facade: ${masterSpec.features.facade}
    - Balconies: ${masterSpec.features.balconies}
  `;

  // VIEW-SPECIFIC ADDITIONS
  let viewSpec = '';

  if (viewType === 'floor_plan') {
    const floor = masterSpec.floors[0]; // Ground floor
    const roomList = floor.rooms.map(r =>
      `${r.name} (${r.area}m², ${r.position})`
    ).join(', ');

    viewSpec = `
      VIEW TYPE: 2D ARCHITECTURAL FLOOR PLAN - GROUND FLOOR

      EXACT ROOM PROGRAM (MUST INCLUDE ALL):
      ${roomList}

      DRAWING REQUIREMENTS:
      - Orthographic top-down view
      - Black and white technical drawing
      - Wall thickness 200mm
      - Door openings with swing arcs
      - Window openings as parallel lines
      - Room labels with areas
      - Dimension lines
      - North arrow pointing ${masterSpec.entrance.orientation}
      - Scale 1:100

      CRITICAL: This floor plan must show the EXACT building described above with ALL rooms listed.
    `;
  }

  else if (viewType === 'elevation') {
    viewSpec = `
      VIEW TYPE: 2D ARCHITECTURAL ELEVATION - ${masterSpec.entrance.orientation.toUpperCase()} FACADE (ENTRANCE SIDE)

      ELEVATION REQUIREMENTS:
      - Orthographic front view
      - ${masterSpec.dimensions.floors} floors visible (${masterSpec.dimensions.floors} × ${masterSpec.dimensions.floorHeight}m = ${masterSpec.dimensions.height}m total height)
      - ${masterSpec.entrance.type} clearly visible on ground floor center
      - ${masterSpec.materials.primary} facade treatment
      - ${masterSpec.features.windows}
      - ${masterSpec.features.roof} profile at top
      - Ground line at ±0.00m
      - Dimension annotations
      - Black and white technical drawing
      - Scale 1:100

      CRITICAL: This elevation must show the EXACT building described above with ${masterSpec.dimensions.floors} floors and ${masterSpec.materials.primary} facade.
    `;
  }

  else if (viewType === '3d_exterior') {
    viewSpec = `
      VIEW TYPE: 3D PHOTOREALISTIC EXTERIOR VIEW - ${masterSpec.entrance.orientation.toUpperCase()} FACADE (ENTRANCE SIDE)

      3D RENDERING REQUIREMENTS:
      - Photorealistic architectural visualization
      - Camera view from street level, ${masterSpec.entrance.orientation} side
      - ${masterSpec.dimensions.floors}-story building clearly visible
      - ${masterSpec.materials.primary} facade with ${masterSpec.materials.secondary} accents
      - ${masterSpec.entrance.type} prominently visible in center of facade
      - ${masterSpec.features.windows}
      - ${masterSpec.features.roof}
      - ${masterSpec.features.balconies}
      - Daylight, clear blue sky
      - ${masterSpec.features.landscaping}
      - Professional architectural photography style
      - High quality, detailed

      CRITICAL: This 3D view must show the EXACT SAME building as the floor plan and elevation, with ${masterSpec.dimensions.floors} floors, ${masterSpec.materials.primary} facade, and ${masterSpec.entrance.type}.
    `;
  }

  // UNIFIED PROMPT
  return `${baseSpec}\n\n${viewSpec}\n\nALL VIEWS MUST REPRESENT THE SAME BUILDING WITH IDENTICAL SPECIFICATIONS.`;
}
```

## Implementation Plan

### Step 1: Enhance OpenAI Service (openaiService.js)

**New Method**: `generateMasterDesignSpecification(projectContext)`

This replaces the current `generateDesignReasoning()` with a MORE DETAILED specification that includes:
- Exact dimensions calculated from area
- Complete floor-by-floor room program with positions
- Specific material selections (not just "local materials")
- Entrance orientation and design
- Architectural feature descriptions for 3D generation

### Step 2: Create Unified Prompt Builder (New Service)

**New File**: `src/services/unifiedPromptService.js`

```javascript
class UnifiedPromptService {
  /**
   * Create master specification prompt for OpenAI
   * Returns complete project spec in one go
   */
  createMasterSpecificationPrompt(projectContext);

  /**
   * Create unified Replicate prompt for specific view
   * Includes master spec + view-specific requirements
   */
  createUnifiedReplicatePrompt(masterSpec, viewType);

  /**
   * Validate master specification completeness
   * Ensures all required fields are present
   */
  validateMasterSpecification(masterSpec);
}
```

### Step 3: Refactor AI Integration Service (aiIntegrationService.js)

**New Workflow**:

```javascript
async generateUnifiedDesign(projectContext, portfolioImages) {
  // STEP 1: OpenAI generates COMPLETE master specification
  const masterSpec = await openai.generateMasterDesignSpecification({
    ...projectContext,
    locationAnalysis: /* ... */,
    portfolioStyle: /* ... */,
    blendedStyle: /* ... */
  });

  // STEP 2: Validate specification
  if (!unifiedPromptService.validateMasterSpecification(masterSpec)) {
    throw new Error('Master specification incomplete');
  }

  // STEP 3: Generate ALL views using SAME master spec
  const unifiedSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);

  // Generate floor plans (one for each floor)
  const floorPlans = await Promise.all(
    masterSpec.floors.map(async (floor, index) => {
      const prompt = unifiedPromptService.createUnifiedReplicatePrompt(
        masterSpec,
        'floor_plan',
        { floorIndex: index }
      );

      return replicate.generateWithUnifiedPrompt(prompt, unifiedSeed);
    })
  );

  // Generate elevations (4 directions)
  const elevations = await Promise.all(
    ['north', 'south', 'east', 'west'].map(async (direction) => {
      const prompt = unifiedPromptService.createUnifiedReplicatePrompt(
        masterSpec,
        'elevation',
        { direction }
      );

      return replicate.generateWithUnifiedPrompt(prompt, unifiedSeed);
    })
  );

  // Generate 3D views (exterior + interior)
  const views3D = await Promise.all(
    ['exterior_front', 'exterior_side', 'interior'].map(async (viewType) => {
      const prompt = unifiedPromptService.createUnifiedReplicatePrompt(
        masterSpec,
        '3d_view',
        { viewType }
      );

      return replicate.generateWithUnifiedPrompt(prompt, unifiedSeed);
    })
  );

  return {
    masterSpec,
    floorPlans,
    elevations,
    views3D,
    unifiedSeed
  };
}
```

### Step 4: Simplify Replicate Service (replicateService.js)

**New Method** (replaces many existing methods):

```javascript
async generateWithUnifiedPrompt(unifiedPrompt, seed) {
  // Single generation method that accepts complete prompt
  // No need for complex parameter building - prompt has everything

  return this.generateArchitecturalImage({
    prompt: unifiedPrompt,
    seed: seed,
    width: 1536,  // High quality
    height: 1536,
    steps: 50,
    guidanceScale: 8.0
  });
}
```

## Key Benefits

### 1. **Guaranteed Consistency**
- ALL outputs generated from ONE master specification
- Floor count, materials, dimensions IDENTICAL across all views
- Same building, just different views

### 2. **OpenAI as Single Source of Truth**
- All design decisions made ONCE by OpenAI
- Replicate is execution only, no design decisions
- Clear separation of concerns

### 3. **Simplified Architecture**
- No more complex context passing
- No more "reasoning-enhanced context"
- No more seed synchronization issues
- Single prompt = single source of truth

### 4. **Better Quality**
- More detailed specifications → better outputs
- Exact room programs → accurate floor plans
- Material specifications → consistent 3D views

### 5. **Easier Debugging**
- One master spec to inspect
- One prompt template to verify
- Clear failure points

## Migration Path

1. **Phase 1**: Create new services (unifiedPromptService)
2. **Phase 2**: Add new OpenAI method (generateMasterDesignSpecification)
3. **Phase 3**: Create new workflow (generateUnifiedDesign) alongside existing
4. **Phase 4**: Test unified workflow thoroughly
5. **Phase 5**: Switch frontend to use unified workflow
6. **Phase 6**: Deprecate old workflow methods

## Example Master Spec Output

```json
{
  "projectName": "Contemporary Villa in Cairo, Egypt",
  "styleName": "Contemporary Egyptian Vernacular Fusion (60% local / 40% portfolio)",
  "philosophy": "This design harmonizes contemporary minimalism from the portfolio with traditional Egyptian courtyard architecture, using local limestone and modern glass to create a climate-responsive villa that respects Cairo's architectural heritage while embracing modern living.",

  "dimensions": {
    "totalArea": 350,
    "floors": 2,
    "floorHeight": 3.2,
    "length": 18.5,
    "width": 12.3,
    "height": 6.4,
    "calculated": "Based on 350m² total, aspect ratio 1.5:1"
  },

  "materials": {
    "primary": "local limestone",
    "secondary": "low-E glass",
    "accent": "cedar wood",
    "roof": "flat concrete with white membrane",
    "windows": "aluminum frame, bronze anodized",
    "doors": "solid cedar wood",
    "rationale": "Limestone provides thermal mass for desert climate, glass maximizes natural light, cedar adds warmth"
  },

  "entrance": {
    "orientation": "north",
    "type": "double door",
    "width": 2.4,
    "feature": "covered entrance with traditional Islamic columns",
    "rationale": "North orientation minimizes direct sun, covered entrance provides thermal buffer"
  },

  "floors": [
    {
      "level": 0,
      "name": "Ground Floor",
      "area": 175,
      "primaryFunction": "Public living spaces and master suite",
      "rooms": [
        {
          "name": "Entrance Lobby",
          "area": 15,
          "position": "north-center",
          "purpose": "Main entrance with double-height ceiling",
          "features": ["skylight", "marble flooring", "connects to courtyard"],
          "connections": ["living room", "dining area", "courtyard"]
        },
        {
          "name": "Living Room",
          "area": 40,
          "position": "north-west",
          "purpose": "Main family gathering space",
          "features": ["double-height ceiling", "floor-to-ceiling windows facing garden", "open plan to dining"],
          "connections": ["entrance lobby", "dining area", "west garden"]
        },
        {
          "name": "Dining Area",
          "area": 25,
          "position": "north-east",
          "purpose": "Family dining adjacent to kitchen",
          "features": ["direct access to kitchen", "garden views through east windows", "pendant lighting"],
          "connections": ["living room", "kitchen", "entrance lobby"]
        },
        {
          "name": "Kitchen",
          "area": 20,
          "position": "east",
          "purpose": "Modern kitchen with island",
          "features": ["island with breakfast bar", "walk-in pantry", "service entrance"],
          "connections": ["dining area", "pantry", "service entrance"]
        },
        {
          "name": "Guest Bathroom",
          "area": 5,
          "position": "center-north",
          "purpose": "Powder room for guests",
          "features": ["compact design", "stone vanity"],
          "connections": ["entrance lobby"]
        },
        {
          "name": "Master Bedroom",
          "area": 35,
          "position": "south-west",
          "purpose": "Primary bedroom suite with private terrace",
          "features": ["king bed", "walk-in closet", "private terrace with garden access", "south-facing windows with shading"],
          "connections": ["master bathroom", "private terrace", "south garden"]
        },
        {
          "name": "Master Bathroom",
          "area": 12,
          "position": "south-center",
          "purpose": "En-suite master bathroom",
          "features": ["double vanity", "freestanding tub", "walk-in shower", "skylight"],
          "connections": ["master bedroom", "walk-in closet"]
        },
        {
          "name": "Garage",
          "area": 23,
          "position": "south-east",
          "purpose": "Covered parking for 2 cars",
          "features": ["direct access to house", "storage cabinets", "service sink"],
          "connections": ["kitchen", "exterior driveway"]
        }
      ],
      "circulation": ["central staircase with skylight", "connects all spaces"],
      "uniqueCharacteristics": ["Ground-level access", "Main entrance on north", "Public and private zones separated", "Master suite on ground floor for aging-in-place"]
    },
    {
      "level": 1,
      "name": "First Floor",
      "area": 175,
      "primaryFunction": "Private bedrooms and family spaces",
      "rooms": [
        {
          "name": "Bedroom 2",
          "area": 25,
          "position": "north-west",
          "purpose": "Secondary bedroom with balcony",
          "features": ["built-in wardrobes", "private balcony with north views", "desk area"],
          "connections": ["shared bathroom", "north balcony"]
        },
        {
          "name": "Bedroom 3",
          "area": 25,
          "position": "north-east",
          "purpose": "Secondary bedroom",
          "features": ["built-in wardrobes", "large windows facing east"],
          "connections": ["shared bathroom"]
        },
        {
          "name": "Shared Bathroom",
          "area": 10,
          "position": "north-center",
          "purpose": "Jack-and-Jill bathroom for bedrooms 2-3",
          "features": ["dual access doors", "dual sinks", "bathtub", "separate shower"],
          "connections": ["bedroom 2", "bedroom 3"]
        },
        {
          "name": "Family Room",
          "area": 30,
          "position": "center",
          "purpose": "Private family lounge overlooking living room",
          "features": ["overlooks double-height living room below", "built-in bookshelves", "TV wall", "informal seating"],
          "connections": ["central hallway", "visual connection to living room below"]
        },
        {
          "name": "Home Office",
          "area": 20,
          "position": "south-east",
          "purpose": "Private study with quiet workspace",
          "features": ["built-in desk and shelving", "south-facing windows with shading", "soundproofing"],
          "connections": ["central hallway"]
        },
        {
          "name": "Laundry",
          "area": 8,
          "position": "south-center",
          "purpose": "Upper floor laundry facility",
          "features": ["washer/dryer", "folding counter", "linen storage"],
          "connections": ["central hallway"]
        },
        {
          "name": "Roof Terrace",
          "area": 57,
          "position": "south-west",
          "purpose": "Outdoor living space with city views",
          "features": ["pergola for shade", "planters with drought-resistant plants", "outdoor seating", "panoramic views"],
          "connections": ["family room", "outdoor stairs to garden"]
        }
      ],
      "circulation": ["central staircase landing", "hallway connecting all rooms"],
      "uniqueCharacteristics": ["No ground entrance", "Private family zone", "Roof terrace for outdoor living", "Visual connection to living room below through void"]
    }
  ],

  "features": {
    "roof": "flat roof with white membrane, solar panel ready, parapet walls",
    "windows": "large glass panels on north, smaller punched windows on south with deep reveals for shading, ribbon windows in living room",
    "facade": "primary: local limestone cladding with traditional vertical grooving pattern, secondary: smooth plaster, accent: cedar wood screens on south for solar shading",
    "balconies": "first floor bedroom 2 (north balcony), ground floor master bedroom (private south terrace)",
    "landscaping": "native Egyptian desert plants, gravel courtyard, date palms, water feature",
    "sustainability": ["passive cooling through thermal mass", "cross-ventilation", "solar shading on south", "rainwater harvesting", "solar panels on roof"]
  },

  "climate": {
    "type": "hot desert (Cairo)",
    "orientation": "north-facing entrance for cooler air intake",
    "shading": "deep overhangs on south facade, cedar screens, minimal west glazing",
    "cooling": "passive cooling through limestone thermal mass, cross-ventilation via north-south openings, night flush cooling",
    "insulation": "limestone walls provide thermal mass (200mm), insulated roof assembly (R-30)",
    "daylighting": "maximize north light, control south sun, skylights in circulation"
  },

  "structuralSystem": {
    "type": "reinforced concrete frame",
    "foundation": "spread footings on competent soil",
    "columns": "400mm × 400mm RC columns on 6m grid",
    "floors": "200mm RC flat slab",
    "roof": "200mm RC slab with waterproofing"
  },

  "colorPalette": {
    "exterior": {
      "primary": "warm beige limestone",
      "accent": "natural cedar wood",
      "trim": "bronze aluminum"
    },
    "interior": {
      "walls": "warm white plaster",
      "floors": "light travertine",
      "accents": "cedar wood, brass fixtures"
    }
  },

  "metadata": {
    "generatedBy": "OpenAI GPT-4",
    "timestamp": "2025-10-12T...",
    "projectSeed": 123456,
    "locationContext": "Cairo, Egypt - hot desert climate",
    "styleBlend": "60% local Egyptian / 40% contemporary portfolio",
    "totalGenerationTime": "15 seconds"
  }
}
```

This master specification becomes the SINGLE source of truth for ALL subsequent Replicate generations.
