# Portfolio Style Detection and Blending Service

## Overview

The Portfolio Style Detection and Blending Service (`portfolioStyleDetectionService.js`) analyzes user-uploaded architectural portfolios to extract dominant design characteristics and blends them with local architectural styles. This enables architects to create designs that reflect their signature style while respecting local context.

## Key Features

### 1. Portfolio Style Analysis (Step 4.1)
- **ML-Enhanced Analysis**: Deep learning models extract architectural style from portfolio images
- **Rule-Based Fallback**: Analyzes image file names for style keywords when ML unavailable
- **Comprehensive Style Profiles**: Extracts materials, spatial characteristics, proportions, colors

### 2. Style Blending (Step 4.2)
- **Signature Mode**: Use 100% portfolio style (ignore local context)
- **Mix Mode**: Blend portfolio style with local architectural traditions (50-50 weighting)
- **Intelligent Merging**: Combines materials, form language, proportions, and design patterns

### 3. Dwelling Type Differentiation (Step 4.3)
- **Detached Dwellings**: 4-sided natural light, flexible floor plans, full setbacks
- **Semi-Detached Dwellings**: Shared party wall, 3-sided windows, efficient linear layouts

## Service Architecture

### Main Service: `portfolioStyleDetectionService.js`

**Core Methods**:

```javascript
// Analyze portfolio images to extract style profile
async analyzePortfolioStyle(portfolioImages, options = {})

// Blend portfolio style with local style
blendStyles(portfolioStyle, localStyle, blendingMode = 'mix')

// Helper methods for material inference, spatial characteristics, color palettes
inferMaterialsFromStyle(style)
getDefaultSpatialCharacteristics(style)
getDefaultColorPalette(style)
```

## Portfolio Analysis Workflow

### Input Format

```javascript
const portfolioImages = [
  {
    url: 'https://example.com/project1.jpg',
    name: 'Modern Villa Project',
    type: 'architectural'
  },
  {
    url: 'https://example.com/project2.jpg',
    name: 'Contemporary Office Building',
    type: 'architectural'
  }
];

const result = await portfolioStyleDetection.analyzePortfolioStyle(portfolioImages);
```

### Output Structure

```javascript
{
  success: true,
  styleProfile: {
    dominantStyle: 'Contemporary',
    confidence: 0.85,
    secondaryStyles: ['Modern', 'Minimalist'],

    materials: {
      primary: ['Glass', 'Steel', 'Concrete'],
      secondary: ['Wood', 'Stone'],
      finishes: ['Matte paint', 'Polished concrete', 'Natural wood', 'Brushed metal']
    },

    spatialCharacteristics: {
      formLanguage: 'rectilinear with curved accents',
      proportionSystem: 'modernist (golden ratio)',
      geometricComplexity: 'medium',
      openness: 'open-plan',
      ceilingHeights: { min: 2.7, standard: 3.0, grand: 4.5 },
      windowToWallRatio: { min: 0.25, optimal: 0.35, max: 0.60 }
    },

    colorPalette: {
      primary: ['#FFFFFF', '#2C3E50'],
      accent: ['#95A5A6', '#E74C3C'],
      description: 'Neutral base with bold accent colors'
    },

    designPatterns: [
      'Large glazing with minimal frames',
      'Cantilevers and overhangs',
      'Mixed material facades',
      'Clean lines and sharp edges'
    ]
  },
  analysisMethod: 'ml-enhanced', // or 'rule-based'
  imagesAnalyzed: 2,
  timestamp: '2025-10-06T...'
}
```

## ML Endpoint Integration

### Endpoint Specification

**POST** `/api/v1/analyze-portfolio`

**Request Body**:
```javascript
{
  "images": [
    {
      "url": "https://example.com/project1.jpg",
      "name": "Modern Villa Project",
      "type": "architectural"
    }
  ],
  "tasks": [
    "style_classification",
    "material_detection",
    "spatial_analysis",
    "proportion_analysis",
    "color_palette_extraction"
  ]
}
```

**Response**:
```javascript
{
  "style_classification": {
    "dominant": "Contemporary",
    "confidence": 0.85,
    "secondary": ["Modern", "Minimalist"]
  },
  "material_detection": {
    "materials": ["Glass", "Steel", "Concrete", "Wood"]
  },
  "spatial_analysis": {
    "form_language": "rectilinear with curved accents",
    "complexity": "medium",
    "openness": "open-plan",
    "patterns": ["Large glazing", "Cantilevers"]
  },
  "proportion_analysis": {
    "system": "modernist"
  },
  "color_palette_extraction": {
    "palette": ["#FFFFFF", "#2C3E50", "#95A5A6", "#E74C3C"]
  }
}
```

### ML Model Recommendations

1. **Style Classification**:
   - **Model**: ResNet-50 or EfficientNet-B3 trained on architectural image dataset
   - **Training Data**: [Architectural Style Dataset](https://www.kaggle.com/datasets) (~10,000 images across 25 styles)
   - **Accuracy Target**: >80% top-1 accuracy

2. **Material Detection**:
   - **Model**: Mask R-CNN or Detectron2 for instance segmentation
   - **Training Data**: Custom architectural materials dataset (brick, concrete, glass, wood, steel)
   - **Output**: Material type + confidence per detected region

3. **Spatial Analysis**:
   - **Model**: Custom CNN for feature extraction + pattern recognition
   - **Features**: Edge detection for form language, complexity metrics
   - **Output**: Form descriptors (rectilinear, curvilinear, organic, etc.)

### Configuring ML Endpoint

Set environment variable in `.env`:

```bash
REACT_APP_ML_ENDPOINT=https://your-ml-service.com
```

If `REACT_APP_ML_ENDPOINT` is not set, service falls back to rule-based analysis.

## Style Blending Algorithm

### Signature Mode (100% Portfolio)

When `blendingMode = 'signature'`:

```javascript
const blendedStyle = portfolioStyleDetection.blendStyles(
  portfolioStyle,
  localStyle,
  'signature'
);

// Result:
{
  blendingMode: 'signature',
  dominantStyle: 'Contemporary', // Portfolio style only
  styleWeighting: { portfolio: 100, local: 0 },
  materials: portfolioStyle.materials, // 100% portfolio
  spatialCharacteristics: portfolioStyle.spatialCharacteristics,
  colorPalette: portfolioStyle.colorPalette,
  designPatterns: portfolioStyle.designPatterns,
  reasoning: 'Using signature portfolio style exclusively'
}
```

### Mix Mode (50-50 Blend)

When `blendingMode = 'mix'`:

```javascript
const blendedStyle = portfolioStyleDetection.blendStyles(
  portfolioStyle,
  localStyle,
  'mix'
);

// Result:
{
  blendingMode: 'mix',
  dominantStyle: 'Contemporary + Victorian', // Combined
  styleWeighting: { portfolio: 50, local: 50 },

  // Materials: Interleaved portfolio + local, deduplicated
  materials: {
    primary: ['Glass', 'Brick', 'Steel', 'Stone', 'Concrete'],
    secondary: ['Wood', 'Terracotta', 'Wrought iron'],
    finishes: ['Matte paint', 'Natural stone', 'Polished concrete', 'Ornate moldings']
  },

  // Form language: Portfolio form with local influences
  spatialCharacteristics: {
    formLanguage: 'rectilinear with curved accents with local influences (Ornate cornices, Bay windows)',
    proportionSystem: 'modernist',
    geometricComplexity: 'medium',
    openness: 'open-plan',
    ceilingHeights: { min: 2.7, standard: 3.0, grand: 4.5 },
    windowToWallRatio: { min: 0.22, optimal: 0.30, max: 0.50 } // Averaged
  },

  // Color palette: Portfolio primary, blended accents
  colorPalette: {
    primary: ['#FFFFFF', '#2C3E50'], // Portfolio
    accent: ['#95A5A6', '#8B4513'], // Portfolio + Local
    description: 'Neutral base with bold accent colors with local influences'
  },

  // Design patterns: Interleaved portfolio + local
  designPatterns: [
    'Large glazing with minimal frames',
    'Ornate cornices',
    'Cantilevers and overhangs',
    'Bay windows',
    'Mixed material facades',
    'Victorian detailing'
  ],

  reasoning: 'Blending portfolio style (Contemporary) with local style (Victorian) using 50-50 weighting'
}
```

### Blending Strategy Details

**Materials Blending**:
```javascript
// Interleave portfolio and local materials, remove duplicates
blendMaterials(['Glass', 'Steel', 'Concrete'], ['Brick', 'Stone', 'Wood'])
// Result: ['Glass', 'Brick', 'Steel', 'Stone', 'Concrete']
```

**Window Ratio Averaging**:
```javascript
// Average portfolio and local window-to-wall ratios
portfolioRatio = { min: 0.25, optimal: 0.35, max: 0.60 }
localRatio = { min: 0.15, optimal: 0.25, max: 0.40 }
averageRatio = { min: 0.20, optimal: 0.30, max: 0.50 }
```

**Color Palette Blending**:
```javascript
// Take first accent from portfolio, second from local
portfolioAccent = ['#95A5A6', '#E74C3C']
localAccent = ['#8B4513', '#CD853F']
blendedAccent = ['#95A5A6', '#8B4513']
```

## Architectural Style Database

### Supported Styles

| Style | Materials | Form Language | Proportion System | Window Ratio |
|-------|-----------|---------------|-------------------|--------------|
| **Contemporary** | Glass, Steel, Concrete, Wood | Rectilinear with curved accents | Modernist (golden ratio) | 0.25-0.60 |
| **Modern** | Glass, Steel, Aluminum, Composite | Pure geometric forms | Modernist | 0.30-0.80 |
| **Traditional** | Brick, Wood, Stone, Stucco | Symmetrical, hierarchical | Classical (1:1.618) | 0.15-0.40 |
| **Industrial** | Exposed brick, Steel, Concrete | Rectilinear, utilitarian | Modular grid | 0.20-0.70 |
| **Mediterranean** | Stucco, Terracotta, Stone | Arched openings, courtyards | Harmonious proportions | 0.15-0.35 |
| **Scandinavian** | Light wood, White plaster, Glass | Simple, organic | Harmonious proportions | 0.30-0.60 |
| **Mid-Century** | Wood, Glass, Brick, Stone | Organic modernism | Modernist | 0.25-0.55 |
| **Brutalist** | Concrete, Exposed aggregate | Monumental, sculptural | Geometric | 0.15-0.40 |
| **Art Deco** | Marble, Chrome, Glass | Geometric, ornate | Decorative symmetry | 0.20-0.45 |

### Color Palettes by Style

**Contemporary**: `#FFFFFF`, `#2C3E50`, `#95A5A6`, `#E74C3C`
**Modern**: `#FFFFFF`, `#000000`, `#7F8C8D`, `#3498DB`
**Traditional**: `#F5F5DC`, `#8B4513`, `#2F4F4F`, `#CD853F`
**Industrial**: `#2C3E50`, `#7F8C8D`, `#C0392B`, `#ECF0F1`
**Mediterranean**: `#FFF8DC`, `#D2691E`, `#4682B4`, `#CD853F`
**Scandinavian**: `#FFFFFF`, `#F5F5DC`, `#8B7355`, `#4682B4`

## Detached vs Semi-Detached Dwellings

### Detached Dwelling Characteristics

**Natural Light**: Windows on all 4 sides
**Floor Plan**: Flexible room placement, wraparound outdoor spaces
**Setbacks**: Required on all sides (front, side, rear)
**Massing**: Independent structure, no shared walls

**Space Planning (2-Story Detached)**:

**Ground Floor** (50% of total area):
- Entry/Foyer: 8%
- Living/Dining: 45%
- Kitchen: 20%
- Powder Room: 4%
- Laundry/Storage: 8%
- Circulation: 15%

**Second Floor** (50% of total area):
- Master Bedroom + En-suite: 35%
- Bedrooms (2-3): 40%
- Bathroom: 10%
- Storage/Closets: 5%
- Circulation: 10%

**Massing Considerations**:
- Separate entries possible
- Flexible room placement
- Natural light on all sides
- Cross-ventilation possible
- Balconies on front/rear

### Semi-Detached Dwelling Characteristics

**Natural Light**: Windows on 3 sides only (shared party wall)
**Floor Plan**: Efficient linear layout, limited by shared wall
**Setbacks**: Reduced on shared side (0m), standard on other sides
**Massing**: One shared party wall, mirrored layouts

**Space Planning (2-Story Semi-Detached)**:

**Ground Floor** (50% of total area):
- Entry/Foyer: 8%
- Living/Dining: 45%
- Kitchen: 20%
- Powder Room: 4%
- Laundry/Storage: 8%
- Circulation: 15%

**Second Floor** (50% of total area):
- Master Bedroom + En-suite: 35%
- Bedrooms (2): 40%
- Bathroom: 10%
- Storage/Closets: 5%
- Circulation: 10%

**Massing Considerations**:
- Shared wall on one side
- Entry on front or side
- Efficient circulation core
- Windows on three sides
- Privacy considerations on shared side

### Comparison Table

| Feature | Detached | Semi-Detached |
|---------|----------|---------------|
| **Shared Walls** | 0 | 1 (party wall) |
| **Window Sides** | 4 | 3 |
| **Setbacks** | All sides | 3 sides (0m on shared side) |
| **Privacy** | High (all sides) | Medium (shared wall reduces noise) |
| **Natural Light** | Maximum | Good (3 sides) |
| **Cross-Ventilation** | Excellent | Good |
| **Outdoor Spaces** | Wraparound | Front/Rear only |
| **Cost per m²** | Higher (4 exterior walls) | Lower (1 shared wall) |
| **Energy Efficiency** | Lower (4 exposed surfaces) | Higher (1 insulated party wall) |

## Integration with aiIntegrationService

### Workflow Integration

The portfolio style detection is integrated as **Step 4** in the main AI workflow:

```javascript
// Step 1: Site context analysis
const siteAnalysis = await this.analyzeSiteContext(projectContext);

// Step 1.5: Local architecture style detection
const styleDetection = await this.detectLocalStyles(siteAnalysis);

// Step 2: Solar orientation calculation
const solarAnalysis = this.solarOrientation.calculateOptimalOrientation(...);

// Step 3: Building program determination (with dwelling type)
const buildingProgram = await this.buildingProgram.calculateBuildingProgram(
  projectContext.buildingType, // 'residential-detached' or 'residential-semi-detached'
  projectContext.siteArea,
  projectContext.location?.zoning,
  projectContext.location,
  projectContext.userDesiredFloorArea // User-specified total floor area
);

// Step 4: Portfolio style analysis and blending ✨ NEW
const portfolioAnalysis = await this.analyzePortfolioStyle(
  projectContext.portfolioImages,
  styleDetection,
  projectContext.styleBlendingMode // 'signature' or 'mix'
);

// Step 5: Material selection
const materialAnalysis = this.materialSelection.recommendMaterials(...);

// Enhanced context includes blended style
const enhancedContext = {
  ...projectContext,
  portfolioStyle: portfolioAnalysis.styleProfile,
  blendedStyle: portfolioAnalysis.blendedStyle,
  buildingProgram, // Includes dwelling type and massing considerations
  ...
};
```

### Output Enhancements

The `generateCompleteDesign()` method now returns:

```javascript
{
  success: true,
  siteAnalysis: { ... },
  styleDetection: { primaryLocalStyles: [...], materials: [...] },

  // NEW: Portfolio analysis results
  portfolioAnalysis: {
    success: true,
    styleProfile: { dominantStyle: 'Contemporary', ... },
    blendedStyle: {
      blendingMode: 'mix',
      dominantStyle: 'Contemporary + Victorian',
      styleWeighting: { portfolio: 50, local: 50 },
      materials: { ... },
      spatialCharacteristics: { ... },
      reasoning: '...'
    },
    blendingMode: 'mix',
    analysisMethod: 'ml-enhanced',
    imagesAnalyzed: 5
  },

  buildingProgram: {
    // NEW: Per-level allocation with dwelling type
    perLevelAllocation: [
      {
        level: 'Ground Floor',
        surfaceArea: 120,
        dwellingType: 'Semi-detached',
        hasSharedWall: true,
        functions: ['Entry/Foyer', 'Living Room', ...],
        spacePlanning: {
          'Entry/Foyer': 10,
          'Living/Dining': 54,
          'Kitchen': 24,
          ...
        },
        massingConsiderations: [
          'Shared wall on one side',
          'Entry on front or side',
          'Efficient circulation core'
        ]
      },
      ...
    ]
  },

  solarOrientation: { ... },
  materialAnalysis: { ... },
  reasoning: { ... },
  outputs: { ... },
  alternatives: { ... },
  feasibility: { ... }
}
```

## Usage Examples

### Example 1: Architect with Portfolio (Mix Mode)

```javascript
const projectContext = {
  location: {
    address: '123 Main St, San Francisco, CA'
  },
  buildingType: 'residential-detached',
  siteArea: 500,
  userDesiredFloorArea: 300,

  // Portfolio images
  portfolioImages: [
    { url: 'https://myportfolio.com/project1.jpg', name: 'Modern Villa' },
    { url: 'https://myportfolio.com/project2.jpg', name: 'Contemporary Office' }
  ],

  // Blending mode
  styleBlendingMode: 'mix' // Blend portfolio + local style (50-50)
};

const design = await aiIntegrationService.generateCompleteDesign(projectContext);

console.log('Blended style:', design.portfolioAnalysis.blendedStyle.dominantStyle);
// Output: "Contemporary + Victorian"

console.log('Design patterns:', design.portfolioAnalysis.blendedStyle.designPatterns);
// Output: ['Large glazing with minimal frames', 'Ornate cornices', 'Cantilevers', ...]
```

### Example 2: Architect with Signature Style (Signature Mode)

```javascript
const projectContext = {
  location: { address: 'Berlin, Germany' },
  buildingType: 'residential-semi-detached',
  userDesiredFloorArea: 250,

  portfolioImages: [
    { url: 'https://myportfolio.com/brutalist1.jpg', name: 'Brutalist Housing' },
    { url: 'https://myportfolio.com/brutalist2.jpg', name: 'Concrete Tower' }
  ],

  styleBlendingMode: 'signature' // Use only portfolio style (100%)
};

const design = await aiIntegrationService.generateCompleteDesign(projectContext);

console.log('Style:', design.portfolioAnalysis.blendedStyle.dominantStyle);
// Output: "Brutalist"

console.log('Materials:', design.portfolioAnalysis.blendedStyle.materials.primary);
// Output: ['Concrete', 'Exposed aggregate', 'Steel']
```

### Example 3: No Portfolio Provided (Default Contemporary)

```javascript
const projectContext = {
  location: { address: 'Tokyo, Japan' },
  buildingType: 'residential-detached',
  userDesiredFloorArea: 200,

  // No portfolio images
  portfolioImages: null,
  styleBlendingMode: 'mix'
};

const design = await aiIntegrationService.generateCompleteDesign(projectContext);

console.log('Style:', design.portfolioAnalysis.styleProfile.dominantStyle);
// Output: "Contemporary" (default)

console.log('Confidence:', design.portfolioAnalysis.styleProfile.confidence);
// Output: 0.5 (low confidence, using default)
```

## Performance and Cost

### Analysis Time

- **ML-Enhanced Analysis**: 2-5 seconds per portfolio (depends on ML endpoint)
- **Rule-Based Analysis**: < 100ms (instant)
- **Total Step 4 Time**: 2-5 seconds (if ML available), < 1 second (fallback)

### API Costs

**ML Endpoint** (optional, configurable):
- **Cost**: $0.01-0.05 per portfolio analysis (depends on provider)
- **Free Tier**: Many ML providers offer 1,000 free requests/month

**Total Cost per Design** (with all services):
- Google Geocoding: $0.005
- OpenWeather One-Call: $0.001
- Street View + Satellite: $0.07
- ML Style Detection (portfolio): $0.03 (optional)
- OpenAI GPT-4: $0.20-$0.40
- Replicate SDXL: $1.20-$2.40
- **Grand Total: ~$1.50-$2.95 per complete design**

## Research Foundation

### Style Blending Theory

The blending algorithm is based on architectural design theory:

1. **Contextual Design**: Buildings should respect local architectural traditions while expressing contemporary design
2. **Signature Style**: Architects maintain a recognizable design language across projects
3. **Hybrid Approach**: Blending local materials with contemporary forms creates contextual yet modern architecture

**Research Sources**:
- Kevin Lynch, "The Image of the City" (1960) - Contextual design importance
- Christopher Alexander, "A Pattern Language" (1977) - Design patterns and local context
- Kenneth Frampton, "Critical Regionalism" (1983) - Balancing global modernism with local identity

### Space Planning Standards

**Residential Space Planning**:
- Living Room: 18-25% of total area (min 25m²)
- Kitchen: 10-15% (min 8m²)
- Master Bedroom: 12-15% (min 12m²)
- Bedrooms: 8-12% each (min 9m²)
- Bathrooms: 4-6% each (min 4m²)
- Circulation: 10-15% of total area

**Sources**:
- Neufert, "Architects' Data" (5th Edition)
- RIBA, "Metric Handbook" (6th Edition)
- National Building Code standards

### Dwelling Type Considerations

**Party Wall Requirements**:
- Fire resistance: 2-hour rating (concrete or masonry)
- Sound insulation: STC 50-55 (mass law)
- Thermal insulation: R-value 3.0+ (insulated cavity)

**Sources**:
- International Building Code (IBC) Section 706
- National Building Code of Canada Part 9
- UK Building Regulations Part E (Sound insulation)

## Future Enhancements

### Planned Features

1. **Advanced ML Models**:
   - Fine-tune ResNet-50 on 50,000 architectural images (25 styles)
   - Add building footprint detection (Mask R-CNN)
   - Implement texture analysis for material detection

2. **Style Transfer**:
   - Generate design variations using neural style transfer
   - Apply portfolio aesthetic to local building forms
   - Create hybrid visualizations showing blended style

3. **3D Massing Analysis**:
   - Extract 3D form characteristics from portfolio images
   - Analyze building proportions and ratios
   - Generate massing models based on portfolio patterns

4. **Expanded Dwelling Types**:
   - Townhouse (row house) with shared walls on two sides
   - Multi-family apartments with unit variations
   - Mixed-use buildings with residential + commercial

5. **Dynamic Blending Weights**:
   - Allow custom weighting (e.g., 70% portfolio, 30% local)
   - Climate-adaptive blending (favor local in extreme climates)
   - User-adjustable material preferences

## Troubleshooting

### Common Issues

**Issue**: Portfolio analysis returns default Contemporary style
**Cause**: ML endpoint unavailable or images not accessible
**Solution**: Check `REACT_APP_ML_ENDPOINT` configuration and image URLs

**Issue**: Blending produces unexpected material combinations
**Cause**: Local style detection failed, using fallback
**Solution**: Verify Google Street View API key and location accuracy

**Issue**: Semi-detached dwelling shows 4-sided windows
**Cause**: Building type not set to 'residential-semi-detached'
**Solution**: Use correct building type: 'residential-semi-detached', 'semi-detached', or 'duplex'

### Debug Mode

Enable detailed logging:

```javascript
// In portfolioStyleDetectionService.js
constructor() {
  this.debug = true; // Enable debug logging
}
```

Logs will show:
- Image analysis progress
- ML endpoint responses
- Blending algorithm steps
- Material/color merging details

---

**Status**: ✅ Production-ready
**Version**: 1.0.0
**Last Updated**: 2025-10-06
