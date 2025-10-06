# Enhanced AI Architectural Design Workflow

## Overview

This document describes the enhanced AI-powered architectural design workflow that integrates site analysis, passive solar design, building program calculations, material selection, and comprehensive 2D/3D visualization generation.

## Workflow Architecture

The enhanced workflow follows a **9-step comprehensive design process**:

```
1. Site Context Gathering & Analysis
2. Solar Orientation & Sun Path Calculation
3. Building Program & Massing Determination
4. Material Selection with Thermal Mass Analysis
5. Enhanced Project Context Assembly
6. AI Design Reasoning Generation (OpenAI GPT-4)
7. Comprehensive Architectural Outputs (2D + 3D via Replicate SDXL)
8. Design Alternatives Generation
9. Feasibility Analysis & Recommendations
```

## New Services Added

### 1. Solar Orientation Service (`solarOrientationService.js`)

**Purpose**: Calculate optimal building orientation based on sun path analysis and climate data.

**Key Functions**:
- `calculateOptimalOrientation(lat, lng, climate, entranceDirection)`
  - Determines hemisphere (northern/southern)
  - Calculates sun path angles (summer/winter solstice, equinox)
  - Recommends primary facade orientation (±30° tolerance from true south/north)
  - Adjusts for user-specified entrance direction
  - Considers prevailing winds

- `calculateOverhangs(latitude, climate)`
  - Calculates optimal overhang projection ratio (P/H)
  - Provides recommendations for seasonal shading
  - Ensures summer sun blocking while allowing winter solar gain

- `determineGlazingStrategy(hemisphere, climate)`
  - Recommends glazing ratios by facade orientation
  - Specifies U-values and SHGC (Solar Heat Gain Coefficient)
  - Provides climate-specific glazing specifications

- `estimateEnergySavings(optimalOrientation, climate)`
  - Projects heating reduction (15-30% in cold climates)
  - Projects cooling reduction (10-30% in hot climates)
  - Estimates annual energy savings (12-28%)

**Climate-Specific Recommendations**:
- **Northern Hemisphere**: South-facing primary facade (azimuth 180°, ±30° tolerance)
- **Southern Hemisphere**: North-facing primary facade (azimuth 0°, ±30° tolerance)
- **Hot Climates**: Emphasis on shading, cool roofs, minimal glazing on secondary facades
- **Cold Climates**: High south-facing glazing for solar gain, superinsulation, thermal mass inside envelope

---

### 2. Building Program Service (`buildingProgramService.js`)

**Purpose**: Calculate building program, massing, and spatial organization based on site area, building type, and zoning constraints.

**Key Functions**:
- `calculateBuildingProgram(buildingType, siteArea, zoning, location)`
  - Parses building type (residential-detached, semi-detached, commercial, mixed-use, etc.)
  - Calculates buildable area considering setbacks
  - Determines optimal number of stories within zoning constraints
  - Generates detailed room program with areas and counts

- `parseBuildingType(buildingType)`
  - Extracts primary type (residential, commercial, mixed-use, industrial, institutional)
  - Identifies subtype (detached, semi-detached, townhouse, multi-family, office, retail)

- `calculateFloorAreas(buildableArea, stories, primaryType)`
  - Calculates ground floor area, typical floor area, total gross/net area
  - Applies circulation factors (15% residential, 20% commercial, 18% mixed-use)
  - Provides net-to-gross efficiency rating

**Room Program Generation**:
- **Residential (Detached/Semi-detached)**:
  - Living, dining, kitchen, bedrooms, bathrooms based on total area
  - Rule of thumb: ~40m² per bedroom; 2-5 bedrooms typical

- **Commercial (Office)**:
  - Open office, private offices, meeting rooms, reception, break rooms
  - Rule of thumb: 10m² per workstation

- **Mixed-Use**:
  - Ground floor retail (70% sales floor, 20% storage, 10% BOH)
  - Upper floors residential units (~70m² per unit)

**Structural Considerations**:
- ≤2 stories: Timber frame or light steel (residential), steel/concrete (commercial)
- 3-5 stories: Reinforced concrete or steel frame, 6-9m column spacing
- 5+ stories: Concrete core with perimeter columns, 8-12m spacing, deep foundations

**Parking Requirements**:
- Residential: 2 spaces per detached/semi-detached; 1.25 per multi-family unit
- Commercial Office: 1 space per 3-4 employees
- Retail: 1 space per 30m² sales floor
- Urban locations: 25% reduction for transit access

---

### 3. Material Selection Service (`materialSelectionService.js`)

**Purpose**: Recommend building materials based on climate analysis, thermal performance, and sustainability.

**Key Functions**:
- `recommendMaterials(climate, location, buildingType, solarOrientation)`
  - Categorizes climate (hot-humid, hot-arid, cold, temperate)
  - Selects primary materials (structural, envelope, interior)
  - Analyzes thermal mass requirements
  - Recommends insulation strategy
  - Selects roofing and glazing specifications

**Climate-Based Material Selection**:

| Climate | Thermal Mass | Primary Materials | Insulation | Reasoning |
|---------|--------------|-------------------|------------|-----------|
| **Hot-Humid** | Low-Medium | Lightweight concrete, insulated block | R-2.5 to R-4.0 (walls) | Minimize heat storage; prioritize ventilation |
| **Hot-Arid** | High | Thick concrete, rammed earth (300-450mm) | R-2.5 to R-4.0 (walls) | Exploit diurnal temperature swings (20-30°C daily) |
| **Cold** | Medium-High (inside insulation) | Timber frame, CLT, concrete (inside envelope) | R-5.0 to R-7.0 (walls), R-10+ (roof) | Store passive solar heat; minimize heat loss |
| **Temperate** | Medium | Brick, concrete, timber frame | R-3.0 to R-4.5 (walls) | Balance heating/cooling seasons |

**Thermal Mass Analysis**:
- Calculates optimal materials with density, specific heat, thermal lag
- **High Thermal Mass** (hot-arid): Concrete (2400 kg/m³), brick (1800 kg/m³), rammed earth (2000 kg/m³)
  - 8-12 hour thermal lag; reduces indoor swings by 5-10°C; 30-50% cooling savings
- **Medium Thermal Mass** (temperate): Brick, concrete floors, timber
  - 5-8 hour thermal lag; reduces swings by 3-6°C; 12-22% energy savings
- **Low Thermal Mass** (hot-humid): Lightweight concrete, insulated block
  - 4-6 hour lag; reduces swings by 2-4°C; 10-20% cooling savings

**Insulation Strategy**:
- **Cold climates**: R-30 to R-40 walls, R-60 to R-70 roof, ≤0.6 ACH50 airtightness
- **Hot climates**: R-15 to R-25 walls, R-30 to R-40 roof, reflective barriers, cool roofs
- **Temperate**: R-18 to R-27 walls, R-38 to R-49 roof, moderate airtightness

**Glazing Specifications**:
- **Cold**: Triple glazing, U ≤0.8 W/m²K, SHGC 0.50-0.60 (south), low-E coating
- **Hot**: Double glazing with spectrally selective coating, U ≤1.2 W/m²K, SHGC 0.25-0.35
- **Temperate**: Double glazing, U ≤1.4 W/m²K, SHGC 0.40-0.50

**Sustainable Alternatives**:
- Cross-Laminated Timber (CLT): Carbon sequestration, renewable, up to 18 stories
- Hempcrete: Carbon-negative, excellent insulation, breathable
- Recycled steel: 90%+ recycled content, high strength
- Rammed earth: Locally sourced, low embodied energy, high thermal mass

**Cost Analysis**:
- **Cold climates**: +15-25% initial cost, 7-12 year payback through heating savings
- **Hot climates**: +10-15% initial cost, 5-10 year payback through cooling savings
- **Temperate**: +10-20% initial cost, 8-15 year payback

---

### 4. Enhanced Replicate SDXL Prompts (`replicateService.js`)

**New Generation Methods**:

1. **`generateFloorPlan(projectContext)`**
   - Enhanced prompt: "Professional architectural floor plan, technical drawing style, 2D top-down plan view, detailed room layout with labeled spaces, dimension lines, door swings, window openings, wall thickness, furniture layout, professional architectural drafting, clean black and white line drawing, precise measurements, architectural blueprint style, **high resolution**, detailed annotations"
   - Resolution: 1024×1024
   - Steps: 50, Guidance Scale: 7.5
   - Integrates room program from `buildingProgramService`

2. **`generateSection(projectContext)`**
   - Prompt: "Professional architectural section view, showing floor levels, roof structure, foundation, ceiling heights, vertical circulation, structural elements, technical drawing style, 2D cross-section, dimension lines, material annotations, professional architectural drafting, clean black and white line drawing, precise measurements, architectural blueprint style, **high resolution**, detailed construction details"
   - Resolution: 1024×768
   - Shows structural system from `buildingProgramService`

3. **`generateElevations(projectContext)`**
   - Generates **four elevations** (north, south, east, west)
   - Prompt: "Professional architectural [direction] elevation view, [X] stories, [materials] facade, technical drawing style, 2D front view, dimension lines, window and door openings, material annotations, height measurements, professional architectural drafting, clean black and white line drawing, precise measurements, architectural blueprint style, **high resolution**, detailed facade composition"
   - Resolution: 1024×768 per elevation

4. **`generate3DExteriorViews(projectContext, ['front', 'rear', 'aerial', 'street'])`**
   - Generates **four 3D exterior views**
   - Prompt: "Professional 3D architectural exterior visualization, [angle description], photorealistic rendering, professional architectural photography, high quality, detailed, natural daylight lighting, professional rendering, **high resolution ≥1024×1024 pixels**, medium to high detail, dramatic composition"
   - Resolution: 1024×1024
   - Steps: 60, Guidance Scale: 8.5

5. **`generate3DInteriorViews(projectContext, ['lobby', 'main-space'])`**
   - Generates **two 3D interior views**
   - Prompt: "Professional 3D architectural interior visualization, [space description], photorealistic rendering, professional architectural photography, high quality, detailed, natural and artificial lighting, professional rendering, **high resolution ≥1024×1024 pixels**, medium to high detail, atmospheric composition, visible materials and textures"
   - Resolution: 1024×1024
   - Steps: 60, Guidance Scale: 8.5

**Total Outputs Per Complete Design**:
- 1× 2D Floor Plan (1024×1024)
- 1× 2D Section (1024×768)
- 4× 2D Elevations (1024×768 each)
- 4× 3D Exterior Views (1024×1024 each)
- 2× 3D Interior Views (1024×1024 each)
- **Total: 12 high-resolution images**

---

## Enhanced Workflow Integration

### Updated `aiIntegrationService.generateCompleteDesign()`

**Input**: `projectContext` object containing:
```javascript
{
  location: {
    address: "Full address string",
    coordinates: { lat: number, lng: number },
    climate: { type: string, seasonal: { ... } },
    zoning: { type: string, maxHeight: string, density: string, setbacks: string }
  },
  buildingType: "residential-detached | residential-semi-detached | commercial-office | mixed-use | ...",
  buildingProgram: "Alternative name for buildingType",
  siteArea: 1000, // square meters
  entranceDirection: "north | south | east | west | northeast | ..." // optional
}
```

**Output**: Enhanced design object with:
```javascript
{
  success: true,
  siteAnalysis: { ... },
  solarOrientation: {
    hemisphere: "northern | southern",
    sunPath: { summer: {...}, winter: {...}, equinox: {...} },
    optimalOrientation: { primaryOrientation: {...}, secondaryOrientation: {...} },
    overhangRecommendations: { projectionRatio: number, recommendedProjection: {...} },
    glazingStrategy: { primaryFacade: {...}, secondaryFacade: {...}, eastWest: {...} },
    energySavingsEstimate: { heatingReduction: "15-25%", coolingReduction: "10-20%", annualSavings: "12-22%" },
    recommendations: [...]
  },
  buildingProgram: {
    buildingType: { primary: string, subType: string, description: string },
    siteAnalysis: { totalSiteArea: {...}, buildableArea: {...} },
    massing: {
      stories: { recommended: number, maximum: number, reasoning: string },
      floorAreas: { groundFloorArea, typicalFloorArea, totalGrossArea, totalNetArea, circulationPercentage },
      footprint: { squareMeters, squareFeet },
      height: { meters, feet },
      coverageRatio: number
    },
    roomProgram: {
      type: string,
      subType: string,
      spaces: [{ name: string, area: number, count: number }, ...],
      bedrooms?: number,
      bathrooms?: number,
      units?: number
    },
    structuralConsiderations: {
      primarySystem: string,
      columnSpacing: string,
      slabType: string,
      foundationType: string,
      estimatedColumnSize: string,
      estimatedSlabThickness: string
    },
    parkingRequirements: { requiredSpaces: number, reasoning: string, type: string },
    efficiency: { netToGrossRatio: number, rating: string },
    recommendations: [...]
  },
  materialAnalysis: {
    climateCategory: { primary: string, characteristics: [...], challenges: [...] },
    primaryMaterials: {
      structural: { primary: string, secondary: string, reasoning: string },
      envelope: { walls: string, finish: string, thermalMass: string, reasoning: string },
      interior: { floors: string, walls: string, ceilings: string }
    },
    thermalMassAnalysis: {
      requirement: "Low | Medium | High",
      optimalMaterials: [{ material: string, density: string, specificHeat: string, thermalMass: string }, ...],
      placement: string,
      thickness: string,
      thermalProperties: { thermalLag: string, temperatureModeration: string, ... },
      performanceBenefit: string
    },
    insulationStrategy: { walls: {...}, roof: {...}, floor: {...}, thermalBridging: string, airtightness: string },
    roofingRecommendations: { primary: {...}, alternatives: [...], features: [...] },
    glazingSpecifications: { type: string, uValue: string, shgc: string, vlt: string, coating: string, frame: string, recommendations: [...] },
    sustainableAlternatives: { structural: [...], envelope: [...], finishes: [...], localMaterials: {...} },
    costAnalysis: { initialCost: string, lifecycleCost: string, paybackPeriod: string, recommendations: [...] }
  },
  reasoning: {
    designPhilosophy: string,
    spatialOrganization: string,
    materialRecommendations: string,
    environmentalConsiderations: string,
    technicalSolutions: string,
    codeCompliance: string,
    costStrategies: string,
    futureProofing: string,
    siteIntegration: string,  // NEW
    passiveSolarDesign: string,  // NEW
    materialStrategy: string,  // NEW
    spatialProgram: string,  // NEW
    source: "enhanced-openai",
    timestamp: string
  },
  outputs: {
    floorPlans: { success: boolean, floorPlan: { images: [...] }, type: "2d_floor_plan" },
    sections: { success: boolean, section: { images: [...] }, type: "2d_section" },
    elevations: { success: boolean, elevations: { north: {...}, south: {...}, east: {...}, west: {...} }, type: "2d_elevations" },
    exteriorViews: { success: boolean, exteriorViews: { front: {...}, rear: {...}, aerial: {...}, street: {...} }, type: "3d_exterior_views" },
    interiorViews: { success: boolean, interiorViews: { lobby: {...}, 'main-space': {...} }, type: "3d_interior_views" },
    summary: { floorPlans: "Generated | Fallback", sections: "Generated | Fallback", ... }
  },
  alternatives: { sustainable: {...}, cost_effective: {...}, innovative: {...}, traditional: {...} },
  feasibility: { feasibility: string, constraints: [...], recommendations: [...] },
  elapsedTime: "120.5s",
  timestamp: "2025-10-06T...",
  workflow: "enhanced-complete"
}
```

---

## Design Narratives Generated

The enhanced workflow automatically generates four design narratives that integrate all analysis:

### 1. Site Integration Narrative
```
"The design responds to the [climate type] climate and [zoning type] zoning context. Site analysis reveals [contextual opportunities] that inform the architectural approach. The building integrates with local architectural character while introducing contemporary sustainable design principles."
```

### 2. Passive Solar Design Narrative
```
"Building oriented with primary facade facing [South/North] for optimal passive solar performance. This orientation, combined with calculated roof overhangs and strategic glazing placement, is projected to achieve [12-28%] annual energy savings. [Reasoning: maximizes winter solar gain while allowing for summer shading through overhangs]"
```

### 3. Material Strategy Narrative
```
"Material strategy employs [high/medium/low] thermal mass construction: [performance benefit, e.g., exploits diurnal temperature variation]. Primary structural system uses [concrete/timber/steel] with [high-performance envelope description]."
```

### 4. Spatial Program Narrative
```
"[2-5]-story configuration provides [area]m² total gross area with [80-90]% net-to-gross efficiency. [Reasoning for story count]. Spatial organization balances functional requirements with circulation efficiency and code compliance."
```

---

## Estimated Workflow Performance

**Time Estimates** (with Replicate SDXL):
- Site analysis: ~1s
- Solar orientation calculation: ~0.5s
- Building program calculation: ~1s
- Material selection: ~1s
- OpenAI design reasoning: ~10-15s
- **2D Floor Plan**: ~30-40s
- **2D Section**: ~30-40s
- **4× 2D Elevations**: ~120-160s (30-40s each, sequential)
- **4× 3D Exterior Views**: ~120-160s (30-40s each, sequential)
- **2× 3D Interior Views**: ~60-80s (30-40s each, sequential)
- Design alternatives (4 approaches): ~120-160s
- Feasibility analysis: ~5-10s

**Total Estimated Time**: **8-12 minutes** for complete enhanced workflow with all 12 high-resolution images

**Cost Estimates** (per complete design):
- OpenAI GPT-4: ~$0.20-$0.40 (reasoning + alternatives + feasibility)
- Replicate SDXL: ~$1.20-$2.40 (12 images @ 30-60s each, ~$0.10-$0.20 per image)
- **Total**: **~$1.40-$2.80 per complete design**

---

## API Cost Optimization Strategies

1. **Progressive Generation**: Generate floor plan + section + 1 elevation + 1 exterior + 1 interior first (~$0.50), then offer user option to generate remaining views
2. **Cached Analysis**: Cache solar orientation, building program, and material analysis for similar projects in same location
3. **Batch Mode**: Queue multiple similar projects and run them sequentially to avoid rate limiting
4. **Fallback Images**: Gracefully degrade to placeholder images if API quota exceeded

---

## Future Enhancements (Placeholder Hooks)

### 1. Deep-Learning Style Detection (Step 1)
**Location**: `aiIntegrationService.analyzeSiteContext()`
```javascript
// Future: Integrate Street View imagery analysis and satellite image processing
// - Fetch Street View images using Google Maps API
// - Apply Faster R-CNN / Mask R-CNN to classify predominant local architectural style
// - Extract building footprint shapes and areas from satellite imagery
// - Return: { localStyle: string, buildingFootprints: [...], materialPalette: [...] }
```

### 2. Interactive Refinement Loop (Step 10)
**New Method**: `aiIntegrationService.refineDesignFromPrompt(previousDesign, userModificationPrompt)`
```javascript
// User submits modification prompt: "Make the building taller" or "Use more glass"
// Send modification prompt + previous design context to OpenAI
// Update design narrative and regenerate affected images using SDXL inpainting/outpainting
// Return updated design with change log
```

### 3. Structural and MEP Summary Generation
**New Method**: `aiIntegrationService.generateTechnicalSummaries(enhancedContext)`
```javascript
// Generate detailed structural calculations:
// - Column sizing based on load calculations
// - Slab thickness for given span
// - Foundation type and sizing
// - Lateral system design (shear walls, moment frames)
//
// Generate MEP summaries:
// - HVAC sizing based on building area and climate
// - Electrical load calculations
// - Plumbing riser diagrams
// - Renewable energy potential (solar PV sizing)
//
// Cite relevant building codes (IBC, ASHRAE, local codes)
```

---

## Usage Example

```javascript
import aiIntegrationService from './services/aiIntegrationService';

const projectContext = {
  location: {
    address: "123 Main St, San Francisco, CA, USA",
    coordinates: { lat: 37.7749, lng: -122.4194 },
    climate: {
      type: "Temperate oceanic",
      seasonal: { winter: { avgTemp: 12 }, summer: { avgTemp: 18 } }
    },
    zoning: {
      type: "Mixed Residential/Commercial",
      maxHeight: "40 feet",
      density: "Medium",
      setbacks: "Front: 10ft, Sides: 5ft, Rear: 10ft"
    }
  },
  buildingType: "residential-detached",
  siteArea: 500, // square meters
  entranceDirection: "south"
};

const result = await aiIntegrationService.generateCompleteDesign(projectContext);

console.log('Solar Orientation:', result.solarOrientation.optimalOrientation);
console.log('Building Program:', result.buildingProgram.roomProgram);
console.log('Material Analysis:', result.materialAnalysis.primaryMaterials);
console.log('Design Reasoning:', result.reasoning.designPhilosophy);
console.log('Generated Outputs:', result.outputs.summary);
console.log('Elapsed Time:', result.elapsedTime);
```

---

## Testing Recommendations

1. **Unit Tests**: Test each service independently
   - `solarOrientationService`: Test with various latitudes (-90° to +90°), climates
   - `buildingProgramService`: Test with various building types, site areas, zoning constraints
   - `materialSelectionService`: Test with hot-humid, hot-arid, cold, temperate climates

2. **Integration Tests**: Test complete workflow end-to-end
   - Verify all 12 images generated successfully
   - Verify design narratives contain expected keywords
   - Verify elapsed time within expected range (8-12 minutes)

3. **Performance Tests**: Monitor API costs and execution time
   - Track Replicate API usage and costs
   - Track OpenAI token usage and costs
   - Implement rate limiting and queue management

4. **User Acceptance Tests**: Validate design quality
   - Review generated floor plans for spatial coherence
   - Review elevations for architectural consistency
   - Review 3D views for photorealistic quality
   - Validate material recommendations against climate science

---

## Conclusion

The enhanced workflow provides a **comprehensive, scientifically-grounded architectural design process** that:
- ✅ Integrates passive solar design principles
- ✅ Calculates building program and massing based on site constraints
- ✅ Recommends materials with thermal performance analysis
- ✅ Generates high-resolution 2D technical drawings (floor plans, sections, elevations)
- ✅ Generates photorealistic 3D visualizations (exterior and interior views)
- ✅ Provides detailed design narratives citing solar orientation, material strategy, and spatial efficiency
- ✅ Estimates energy savings (12-28% annually)
- ✅ Estimates lifecycle costs and payback periods

All components are modular, testable, and ready for production deployment.
