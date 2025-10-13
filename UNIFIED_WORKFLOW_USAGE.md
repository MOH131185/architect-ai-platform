# Unified Workflow Usage Guide

## Overview

The **Unified Generation Workflow** ensures that 2D floor plans, elevations, and 3D visualizations all show the **SAME building** by using a single Master Design Specification as the source of truth.

## Architecture Flow

```
1. OpenAI GPT-4 → Master Design Specification (Complete design decisions)
                      ↓
2. Replicate SDXL → ALL outputs (Floor plans, Elevations, 3D views)
                      ↓
Result: Every output shows the SAME project
```

## Key Components

### 1. UnifiedPromptService (`src/services/unifiedPromptService.js`)
- Creates master specification prompt for OpenAI
- Creates unified Replicate prompts that include complete spec
- Validates master specification completeness

### 2. OpenAIService Enhancement (`src/services/openaiService.js`)
- New method: `generateMasterDesignSpecification(projectContext)`
- Returns complete specification with exact values
- Includes dimensions, materials, room programs, entrance details

### 3. AIIntegrationService New Method (`src/services/aiIntegrationService.js`)
- New method: `generateUnifiedDesign(projectContext, portfolioImages, materialWeight, characteristicWeight)`
- Orchestrates the complete unified workflow
- Returns master spec + all generated views

### 4. ReplicateService Enhancement (`src/services/replicateService.js`)
- New method: `generateWithUnifiedPrompt(unifiedPrompt, seed, negativePrompt, dimensions)`
- Accepts pre-built prompts with master specification
- Ensures consistent generation

## How to Use

### Basic Usage

```javascript
import aiIntegrationService from './services/aiIntegrationService';

const projectContext = {
  location: {
    address: 'Cairo, Egypt'
  },
  buildingProgram: 'villa',
  floorArea: 350,
  climateData: {
    type: 'hot desert',
    seasonal: { /* ... */ }
  }
};

const portfolioImages = []; // Optional
const materialWeight = 0.5;  // 0 = all local, 1 = all portfolio
const characteristicWeight = 0.5;

// Generate complete unified design
const result = await aiIntegrationService.generateUnifiedDesign(
  projectContext,
  portfolioImages,
  materialWeight,
  characteristicWeight
);

if (result.success) {
  console.log('Master Specification:', result.masterSpec);
  console.log('Floor Plans:', result.floorPlans);
  console.log('Elevations:', result.elevations);
  console.log('3D Views:', result.visualizations);
}
```

### Result Structure

```javascript
{
  success: true,
  workflow: 'unified_generation',

  // SINGLE SOURCE OF TRUTH
  masterSpec: {
    projectName: "Contemporary Villa in Cairo",
    styleName: "Contemporary Egyptian Vernacular Fusion",
    philosophy: "Design philosophy...",

    dimensions: {
      totalArea: 350,
      floors: 2,
      floorHeight: 3.2,
      length: 18.5,
      width: 12.3,
      height: 6.4
    },

    materials: {
      primary: "local limestone",
      secondary: "glass",
      accent: "cedar wood",
      roof: "flat concrete with white membrane",
      windows: "aluminum frame, bronze anodized",
      doors: "solid cedar wood"
    },

    entrance: {
      orientation: "north",
      type: "double door",
      width: 2.4,
      feature: "covered entrance with columns"
    },

    floors: [
      {
        level: 0,
        name: "Ground Floor",
        area: 175,
        rooms: [
          {
            name: "Entrance Lobby",
            area: 15,
            position: "north-center",
            purpose: "Main entrance",
            features: ["double-height ceiling", "skylight"],
            connections: ["living room", "dining area"]
          },
          // ... more rooms
        ]
      },
      // ... more floors
    ],

    features: {
      roof: "flat roof with parapet",
      windows: "large glass panels, ribbon windows on living room",
      facade: "limestone cladding with vertical accents",
      balconies: "first floor bedrooms, master bedroom ground floor",
      landscaping: "desert-adapted plants, gravel courtyard"
    },

    climate: { /* ... */ },
    structuralSystem: { /* ... */ },
    colorPalette: { /* ... */ },
    metadata: { /* ... */ }
  },

  // Context analysis
  locationAnalysis: { /* ... */ },
  portfolioStyle: { /* ... */ },
  blendedStyle: { /* ... */ },

  // Generated outputs (ALL from SAME master spec)
  floorPlans: {
    success: true,
    floorPlans: {
      ground: { success: true, images: ['url'], seed: 123456 },
      floor_1: { success: true, images: ['url'], seed: 123457 }
    },
    floorCount: 2
  },

  elevations: {
    success: true,
    elevations: {
      elevation_north: { success: true, images: ['url'], seed: 123456 },
      elevation_south: { success: true, images: ['url'], seed: 123456 },
      elevation_east: { success: true, images: ['url'], seed: 123456 },
      elevation_west: { success: true, images: ['url'], seed: 123456 }
    }
  },

  visualizations: {
    success: true,
    views: {
      exterior_front: { success: true, images: ['url'], seed: 123456 },
      exterior_side: { success: true, images: ['url'], seed: 123956 },
      interior: { success: true, images: ['url'], seed: 124456 }
    }
  },

  // Metadata
  projectSeed: 123456,
  materialWeight: 0.5,
  characteristicWeight: 0.5,
  timestamp: "2025-10-12T..."
}
```

## Key Advantages

### 1. Guaranteed Consistency
- **Problem**: Old workflow generated floor plan with one prompt, 3D view with another → DIFFERENT buildings
- **Solution**: All prompts include the SAME master specification → SAME building

### 2. OpenAI as Master Architect
- **Role**: Makes ALL design decisions (dimensions, materials, room layout, entrance)
- **Output**: Complete specification with exact values
- **Benefit**: Single source of truth for entire project

### 3. Replicate as Master Builder
- **Role**: Executes visualization based on complete specification
- **Input**: Unified prompt with master spec + view type
- **Benefit**: No design decisions, only visualization

### 4. Clear Validation
```javascript
const validation = unifiedPromptService.validateMasterSpecification(masterSpec);
if (!validation.valid) {
  console.error('Missing fields:', validation.missing);
  console.warn('Warnings:', validation.warnings);
}
```

## Unified Prompt Example

Each Replicate call receives a prompt like this:

```
MASTER DESIGN SPECIFICATION - SINGLE SOURCE OF TRUTH
Project: Contemporary Villa in Cairo
Style: Contemporary Egyptian Vernacular Fusion
Philosophy: Harmonizes modern minimalism with traditional Egyptian courtyard architecture

EXACT DIMENSIONS (MUST MATCH IN ALL VIEWS):
- Building Footprint: 18.5m × 12.3m
- Total Height: 6.4m (2 floors × 3.2m each)
- Total Floor Area: 350m²
- Floor Count: 2 floors

EXACT MATERIALS (MUST USE THESE IN ALL VIEWS):
- Primary Material: local limestone
- Secondary Material: glass
- Accent Material: cedar wood
- Roof: flat concrete with white membrane
- Windows: aluminum frame, bronze anodized

ENTRANCE SPECIFICATION:
- Location: north facade
- Type: double door
- Width: 2.4m
- Feature: covered entrance with columns

ARCHITECTURAL FEATURES:
- Roof Design: flat roof with parapet
- Window Design: large glass panels, ribbon windows on living room
- Facade Treatment: limestone cladding with vertical accents
- Balconies: first floor bedrooms, master bedroom ground floor

VIEW TYPE: 2D ARCHITECTURAL FLOOR PLAN - GROUND FLOOR

EXACT ROOM PROGRAM (MUST INCLUDE ALL ROOMS):
- Entrance Lobby: 15m² at north-center (double-height ceiling, skylight)
- Living Room: 40m² at north-west (floor-to-ceiling windows, open plan)
- Dining Area: 25m² at north-east (adjacent to kitchen)
- Kitchen: 20m² at east (island counter, pantry)
- Guest Bathroom: 5m² at center-north
- Master Bedroom: 35m² at south-west (en-suite bathroom, private terrace)
- Master Bathroom: 12m² at south-center
- Garage: 23m² at south-east (2-car capacity)

DRAWING REQUIREMENTS:
- STRICTLY 2D orthographic top-down view
- Black and white technical drawing style
- Wall thickness: 200mm
- Door openings with swing arcs
- Window openings as gaps in walls
- Room labels with areas
- Dimension lines
- North arrow pointing north
- Scale notation: 1:100

CRITICAL: This floor plan must show floor 0 of the building specified above
CRITICAL: ALL VIEWS MUST REPRESENT THE SAME BUILDING WITH IDENTICAL SPECIFICATIONS LISTED ABOVE.
```

## Migration from Old Workflow

### Old Workflow (BROKEN)
```javascript
// Old method - generates separate, unrelated outputs
const result = await aiIntegrationService.generateIntegratedDesign(
  projectContext,
  portfolioImages
);
```

### New Workflow (UNIFIED)
```javascript
// New method - generates consistent outputs
const result = await aiIntegrationService.generateUnifiedDesign(
  projectContext,
  portfolioImages,
  materialWeight,
  characteristicWeight
);
```

## Testing the Unified Workflow

### Test Case 1: Floor Count Consistency
```javascript
const result = await aiIntegrationService.generateUnifiedDesign(projectContext);

// All should match
console.log('Master spec floors:', result.masterSpec.dimensions.floors);
console.log('Floor plans count:', Object.keys(result.floorPlans.floorPlans).length);
// Check 3D views show correct number of floors by inspecting images
```

### Test Case 2: Material Consistency
```javascript
const result = await aiIntegrationService.generateUnifiedDesign(projectContext);

console.log('Master spec materials:', result.masterSpec.materials);
// All floor plans, elevations, and 3D views should use THESE materials
// Verify by checking generated images
```

### Test Case 3: Entrance Location Consistency
```javascript
const result = await aiIntegrationService.generateUnifiedDesign(projectContext);

console.log('Master spec entrance:', result.masterSpec.entrance.orientation);
// Floor plan should show entrance on this side
// Elevation on this side should show entrance door
// 3D view from this side should show entrance
```

## Troubleshooting

### Problem: Master specification validation fails
**Solution**: Check `validation.missing` array to see which required fields are missing from OpenAI response. OpenAI may need more context or better prompting.

### Problem: Floor count mismatch between views
**Solution**: This shouldn't happen with unified workflow. If it does, check that all Replicate calls are using the SAME `masterSpec` object.

### Problem: Materials don't match between 2D and 3D
**Solution**: Verify that unified prompts include the complete material specification from master spec. Check `unifiedPromptService.formatBaseSpecification()`.

### Problem: Different building dimensions in different views
**Solution**: Ensure all prompts use `masterSpec.dimensions` consistently. Check seed consistency.

## Performance Considerations

- **OpenAI call**: ~10-15 seconds for master specification
- **Each Replicate call**: ~30-60 seconds per image
- **Total time for complete design**:
  - Master spec: 10-15s
  - Floor plans (2 floors): 60-120s
  - Elevations (4 directions): 120-240s
  - 3D views (3 views): 90-180s
  - **Total**: ~5-9 minutes for complete design

## Future Enhancements

1. **Parallel generation**: Generate floor plans, elevations, and 3D views in parallel (currently sequential)
2. **Progressive delivery**: Stream results as they complete
3. **Caching**: Cache master specification for variations
4. **Refinement**: Allow iterative refinement of master spec without full regeneration

## Support

For issues or questions about the unified workflow:
1. Check logs for validation errors
2. Inspect `masterSpec` object for completeness
3. Verify prompt construction in `unifiedPromptService`
4. Review generated images for consistency

## Summary

The **Unified Generation Workflow** solves the critical problem of 2D/3D inconsistency by:
1. Using OpenAI as the **single decision maker** (Master Architect)
2. Including **complete specifications** in every Replicate prompt (Master Builder)
3. Validating specification completeness **before generation**
4. Using the **same seed** for geometric consistency

**Result**: Floor plans, elevations, and 3D views all show the **SAME building**.
