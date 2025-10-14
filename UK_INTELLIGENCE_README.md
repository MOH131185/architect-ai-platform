# <ì<ç UK Architectural Intelligence System

## Overview

Comprehensive UK-focused architectural intelligence system that provides:
- **Regional architectural style detection** for London, Manchester, Edinburgh, Cardiff, Belfast, Birmingham
- **Sun path and wind direction analysis** using coordinates and Google Maps API
- **Climate-specific recommendations** including temperature, rainfall, and prevailing winds
- **Building regulations** by UK nation (England, Scotland, Wales, Northern Ireland)
- **Material recommendations** based on regional availability and climate
- **Portfolio analysis** with OpenAI GPT-4 Vision (PDF and multi-image support)
- **Style blending** between portfolio style and local architectural character

---

## Features

### 1. **UK Regional Architecture Database**

**File**: `src/data/ukArchitectureDatabase.js`

Comprehensive database covering:

#### Regions Included:
- **London** - Georgian, Victorian, Edwardian, Modern London
- **Manchester** - Industrial Georgian, Victorian Industrial, Modern Manchester
- **Edinburgh** - Scottish Georgian, Scottish Baronial, Victorian Tenement
- **Cardiff** - Welsh Victorian, Edwardian Civic, Modern Cardiff
- **Belfast** - Victorian Belfast, Ulster Vernacular, Modern Belfast
- **Birmingham** - Victorian Industrial, Modern Birmingham

#### Data for Each Region:
```javascript
{
  climate: {
    type: "Temperate maritime",
    avgTempSummer: 20,  // °C
    avgTempWinter: 5,    // °C
    rainfall: 600,       // mm/year
    sunHours: 1500,      // hours/year
    prevailingWind: "Southwest",
    humidity: "Moderate to High"
  },
  architecturalStyles: {
    traditional: [ /* Georgian, Victorian, Edwardian, etc. */ ],
    contemporary: [ /* Modern regional styles */ ]
  },
  commonMaterials: {
    walls: ["London stock brick", "Portland stone", ...],
    roofing: ["Slate", "Clay tiles", ...],
    windows: ["Timber sash", "uPVC", ...],
    structure: ["Load-bearing brick", "Steel frame", ...]
  },
  buildingRegulations: {
    maxHeight: "...",
    setbacks: "...",
    energyStandards: "Part L compliance",
    fireRegulations: "..."
  },
  sunPath: {
    summer: "Southeast sunrise (04:43), Southwest sunset (21:21), max altitude 62°",
    winter: "Southeast sunrise (08:06), Southwest sunset (15:53), max altitude 15°",
    optimalOrientation: "South-facing for maximum solar gain"
  },
  sustainabilityConsiderations: [
    "Air quality concerns - ventilation systems required",
    "Heat island effect - green roofs recommended",
    ...
  ]
}
```

### 2. **Enhanced UK Location Service**

**File**: `src/services/enhancedUKLocationService.js`

#### Methods:

**`analyzeUKLocation(address, coordinates)`**
Complete UK location analysis returning:
- Regional architectural styles
- Sun path data with solar recommendations
- Detailed climate data (live from OpenWeather API + database)
- Building regulations (regional + national)
- Material recommendations
- Sustainability recommendations

**Example Usage:**
```javascript
import enhancedUKLocationService from './services/enhancedUKLocationService';

const analysis = await enhancedUKLocationService.analyzeUKLocation(
  "123 King Street, Manchester, UK",
  { lat: 53.4808, lng: -2.2426 }
);

console.log(analysis);
// {
//   region: "Manchester",
//   architecturalData: { traditionalStyles, contemporaryStyles, ... },
//   sunData: { summer, winter, optimalOrientation, solarRecommendations },
//   climateData: { avgTempSummer, rainfall, windSpeed, windDirection, ... },
//   regulations: { regional, national, summary },
//   materials: { walls, roofing, windows, structure, sustainable },
//   sustainability: { passiveDesign, renewableEnergy, waterManagement, ... }
// }
```

#### Sun Path Analysis:
Automatically calculates:
- Sunrise/sunset times for summer and winter solstice
- Maximum sun altitude angles
- Optimal building orientation
- Overhang dimensions for shading
- Room-by-room orientation recommendations

#### Wind Analysis:
Provides:
- Prevailing wind direction
- Wind-driven rain protection strategies
- Entrance orientation recommendations
- Outdoor space shelter recommendations

### 3. **Enhanced Portfolio Service**

**File**: `src/services/enhancedPortfolioService.js`

Analyzes uploaded portfolios (images and PDFs) using **OpenAI GPT-4 Vision**.

#### Methods:

**`analyzePortfolio(portfolioFiles, locationContext)`**
Analyzes portfolio and returns:
```javascript
{
  primaryStyle: {
    name: "Contemporary",
    confidence: "High",
    period: "2010-2024",
    characteristics: ["Clean lines", "Large windows", ...]
  },
  materials: {
    exterior: ["Brick", "Timber cladding", ...],
    structural: ["Steel frame", "Concrete"],
    detailing: ["Metal", "Glass", ...]
  },
  designElements: {
    spatialOrganization: "Open plan with distinct zones",
    windowPatterns: "Floor-to-ceiling glazing",
    roofForm: "Flat roof with parapets",
    colorPalette: ["White", "Grey", "Natural wood"],
    proportions: "Horizontal emphasis, 1.618 golden ratio"
  },
  styleConsistency: {
    rating: "Consistent",
    evolution: "Progressive refinement toward minimalism",
    signatureElements: ["Timber screens", "Corner glazing", ...]
  },
  sustainabilityFeatures: {
    passive: ["Cross-ventilation", "Thermal mass"],
    active: ["Solar PV", "Heat pumps"],
    materials: ["FSC timber", "Recycled steel"]
  },
  locationCompatibility: {
    climateSuitability: "Good for UK climate with weatherproofing",
    culturalFit: "Contemporary approach suitable for urban areas",
    adaptationsNeeded: ["Enhanced insulation", "UK-spec glazing"]
  },
  recommendations: {
    stylisticDirection: "Continue minimalist aesthetic with local materials",
    materialPalette: ["Local brick", "Larch cladding", "Aluminium"],
    keyPrinciples: ["Contextual design", "Sustainability", "Quality"]
  }
}
```

**`blendStyleWithLocation(portfolioAnalysis, locationAnalysis, materialWeight, characteristicWeight)`**
Blends portfolio style with location context using weighted combination:

```javascript
const blended = enhancedPortfolioService.blendStyleWithLocation(
  portfolioAnalysis,
  locationAnalysis,
  0.7,  // 70% portfolio materials
  0.5   // 50% portfolio characteristics
);

// Returns:
// {
//   styleName: "Contemporary with subtle Georgian influences",
//   materials: ["Timber cladding", "Brick", "Glass", "Portland stone"],
//   characteristics: ["Clean lines", "Symmetrical facade", ...],
//   portfolioInfluence: 0.6,  // 60%
//   locationInfluence: 0.4,   // 40%
//   description: "This design blends your Contemporary design language..."
// }
```

#### Supported File Types:
- **Images**: JPG, PNG, WEBP, GIF
- **PDFs**: Planned (currently suggests uploading images directly)

#### Image Processing:
- Converts files to base64 for OpenAI Vision API
- Supports up to 10 images per analysis
- Automatic image optimization

### 4. **Building Regulations by UK Nation**

#### England - Part L (Energy Efficiency):
```javascript
{
  walls: "U-value d 0.18 W/m²K",
  roof: "U-value d 0.15 W/m²K",
  floor: "U-value d 0.18 W/m²K",
  windows: "U-value d 1.4 W/m²K",
  airTightness: "d 8 m³/(h.m²) at 50 Pa"
}
```

#### Scotland - Section 6:
**Stricter than England:**
```javascript
{
  walls: "U-value d 0.17 W/m²K",  // Stricter
  roof: "U-value d 0.13 W/m²K",   // Stricter
  floor: "U-value d 0.15 W/m²K",  // Stricter
  airTightness: "d 7 m³/(h.m²)"   // Stricter
}
```

#### Wales - Part L (Wales):
Similar to England with Welsh-specific variations

#### Northern Ireland - Part F:
Similar to England Part L with NI variations

### 5. **Sustainable Materials Database**

Pre-loaded UK sustainable materials:

```javascript
[
  {
    name: "Cross-Laminated Timber (CLT)",
    benefits: ["Carbon sequestration", "Fast construction", "Lightweight"],
    suppliers: ["Stora Enso (UK)", "Binderholz", "KLH"],
    cost: "£££",
    suitability: ["Multi-storey residential", "Schools", "Offices"]
  },
  {
    name: "Hempcrete",
    benefits: ["Carbon negative", "Breathable", "Good insulation"],
    suppliers: ["Lime Technology", "Hemp-Lime Build"],
    cost: "££",
    suitability: ["Residential", "Retrofits", "Extensions"]
  },
  // ... more materials
]
```

---

## Integration with Existing Services

### Location Intelligence Integration

Update `src/services/locationIntelligence.js` to use UK data:

```javascript
import enhancedUKLocationService from './enhancedUKLocationService';

// In analyzeLocation method:
if (address.includes('UK') || address.includes('United Kingdom') ||
    coordinates.lat > 49 && coordinates.lat < 61 && coordinates.lng > -8 && coordinates.lng < 2) {
  // Use UK-specific analysis
  const ukAnalysis = await enhancedUKLocationService.analyzeUKLocation(address, coordinates);

  return {
    ...baseLocationData,
    ukSpecific: ukAnalysis,
    architecturalStyles: ukAnalysis.architecturalData.recommendations,
    materials: ukAnalysis.materials,
    sunPath: ukAnalysis.sunData,
    regulations: ukAnalysis.regulations
  };
}
```

### Portfolio Style Detection Integration

Update `src/services/portfolioStyleDetection.js` to use enhanced service:

```javascript
import enhancedPortfolioService from './enhancedPortfolioService';

// Replace existing detectArchitecturalStyle method:
async detectArchitecturalStyle(portfolioImages, locationContext) {
  return await enhancedPortfolioService.analyzePortfolio(portfolioImages, locationContext);
}
```

### AI Integration Service Updates

Update `src/services/aiIntegrationService.js`:

```javascript
import enhancedPortfolioService from './enhancedPortfolioService';
import enhancedUKLocationService from './enhancedUKLocationService';

// In generateIntegratedDesign:
async generateIntegratedDesign(projectContext) {
  // 1. Analyze UK location
  const ukLocation = await enhancedUKLocationService.analyzeUKLocation(
    projectContext.location.address,
    projectContext.location.coordinates
  );

  // 2. Analyze portfolio
  const portfolioAnalysis = await enhancedPortfolioService.analyzePortfolio(
    projectContext.portfolioFiles,
    ukLocation
  );

  // 3. Blend styles
  const blendedStyle = enhancedPortfolioService.blendStyleWithLocation(
    portfolioAnalysis,
    ukLocation,
    projectContext.materialWeight || 0.5,
    projectContext.characteristicWeight || 0.5
  );

  // 4. Use blended style in generation
  const enhancedContext = {
    ...projectContext,
    ukLocationData: ukLocation,
    portfolioStyle: portfolioAnalysis,
    blendedStyle: blendedStyle,
    materials: blendedStyle.materials,
    sunPath: ukLocation.sunData,
    windData: ukLocation.climateData.windRecommendations,
    regulations: ukLocation.regulations
  };

  // Continue with generation...
}
```

---

## Environment Variables Required

### Required in `.env` (Development) and Vercel (Production):

```bash
# Google Maps API (for geocoding and location data)
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# OpenWeather API (for live climate data)
REACT_APP_OPENWEATHER_API_KEY=your_openweather_api_key

# OpenAI API (for portfolio analysis with GPT-4 Vision)
REACT_APP_OPENAI_API_KEY=your_openai_api_key
# In Vercel, also set:
OPENAI_API_KEY=your_openai_api_key  # Without REACT_APP_ prefix
```

---

## API Costs

### OpenAI GPT-4o with Vision:
- **Input**: ~$5.00 / 1M tokens (~$0.005 per 1K tokens)
- **Output**: ~$15.00 / 1M tokens (~$0.015 per 1K tokens)
- **Portfolio analysis** (10 images): ~$0.05-$0.10 per analysis

### OpenWeather API:
- **Free tier**: 1,000 calls/day
- **Cost per analysis**: $0.00 (within free tier)

### Google Maps API:
- **Geocoding**: $5.00 per 1,000 requests
- **Cost per analysis**: ~$0.005

**Total cost per complete analysis**: ~$0.055-$0.105

---

## Testing

### Test UK Location Analysis:

```javascript
const testLocations = [
  { address: "10 Downing Street, London, UK", lat: 51.5034, lng: -0.1276 },
  { address: "Manchester Town Hall, UK", lat: 53.4794, lng: -2.2453 },
  { address: "Edinburgh Castle, UK", lat: 55.9486, lng: -3.1999 },
  { address: "Cardiff Castle, Wales", lat: 51.4816, lng: -3.1791 },
  { address: "Belfast City Hall, UK", lat: 54.5973, lng: -5.9301 }
];

for (const location of testLocations) {
  const analysis = await enhancedUKLocationService.analyzeUKLocation(
    location.address,
    { lat: location.lat, lng: location.lng }
  );
  console.log(`${location.address}:`, analysis.region, analysis.architecturalData.traditionalStyles[0].name);
}
```

### Test Portfolio Analysis:

```javascript
// Assuming you have file inputs
const portfolioFiles = [file1, file2, file3];  // From <input type="file" multiple>
const locationContext = {
  address: "Manchester, UK",
  region: "Manchester",
  climate: { type: "Temperate maritime" }
};

const analysis = await enhancedPortfolioService.analyzePortfolio(
  portfolioFiles,
  locationContext
);

console.log('Portfolio style:', analysis.primaryStyle.name);
console.log('Materials:', analysis.materials.exterior);
console.log('Recommendations:', analysis.recommendations.stylisticDirection);
```

---

## Deployment

### 1. **Ensure Environment Variables are Set in Vercel:**
```bash
vercel env add OPENAI_API_KEY
vercel env add REACT_APP_OPENAI_API_KEY
vercel env add REACT_APP_GOOGLE_MAPS_API_KEY
vercel env add REACT_APP_OPENWEATHER_API_KEY
```

### 2. **Deploy:**
```bash
git add .
git commit -m "feat: add comprehensive UK architectural intelligence system"
git push origin main
```

### 3. **Verify API Functions:**
- Check `/api/openai-chat` returns 200 (not 404)
- Verify OpenAI API key is working
- Test portfolio upload and analysis
- Test UK location detection

---

## Troubleshooting

### OpenAI API 404 Error:
**Problem**: `/api/openai-chat 404 error`

**Solutions**:
1. Check `api/openai-chat.js` file exists
2. Verify `vercel.json` has correct rewrites
3. Ensure `OPENAI_API_KEY` is set in Vercel (without `REACT_APP_` prefix)
4. Redeploy: `vercel --prod`

### Portfolio Analysis Not Working:
**Problem**: Returns fallback data

**Solutions**:
1. Check OpenAI API key is valid
2. Verify files are being converted to base64 correctly
3. Check console for specific error messages
4. Ensure using `gpt-4o` model (supports vision)

### UK Region Not Detected:
**Problem**: Falls back to "London" for all UK addresses

**Solutions**:
1. Check address includes city name
2. Verify Google Maps API key for reverse geocoding
3. Add more cities to `ukArchitectureDatabase.js`
4. Check coordinates are within UK bounds

---

## Future Enhancements

### Planned Features:
- [ ] PDF page extraction with PDF.js
- [ ] More UK cities (Liverpool, Glasgow, Bristol, Leeds, Newcastle)
- [ ] Real-time sun path visualization with Three.js
- [ ] Wind rose diagrams
- [ ] 3D shadow studies
- [ ] Building regulation compliance checker
- [ ] Material cost database integration
- [ ] Carbon footprint calculator
- [ ] Planning permission likelihood predictor

---

## License

This UK Architectural Intelligence System is part of the ArchiAI Platform.

**Last Updated**: 2025-10-14
**Version**: 1.0.0
