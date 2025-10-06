# Enhanced Location and Climate Analysis Service

## Overview

The Enhanced Location Service (`enhancedLocationService.js`) implements comprehensive location and climate analysis using Google Maps Geocoding API and OpenWeather One-Call API. This service provides the foundation for passive solar design, climate-responsive architecture, and energy-efficient building orientation.

## Key Features

### 1. Google Maps Geocoding Integration
- **Forward Geocoding**: Convert address string → coordinates + structured address components
- **Reverse Geocoding**: Convert coordinates → formatted address + address components
- **Structured Address Parsing**: Extract street, city, state, country, postal code, etc.

### 2. OpenWeather One-Call API Integration
- **Current Weather**: Real-time temperature, humidity, pressure, wind speed
- **Seasonal Climate Data**: Average temperatures, precipitation, humidity for all four seasons
- **Köppen Climate Classification**: Automatic climate type classification based on temperature and precipitation thresholds

### 3. Sun Path Calculation
- **Sunrise/Sunset Times**: Calculated for summer solstice (June 21) and winter solstice (December 21)
- **Daylight Hours**: Hours of daylight for each solstice
- **Solar Noon Altitude**: Sun angle at solar noon (maximum altitude)
- **Hemisphere Detection**: Automatic northern/southern hemisphere determination

### 4. Optimal Solar Orientation
- **Research-Backed Recommendations**: Orient building's long axis east-west with primary facade facing south (northern hemisphere) or north (southern hemisphere)
- **Tolerance Range**: ±30° from optimal orientation
- **Energy Savings Estimates**: 10-40% reduction in heating/cooling energy
- **Climate-Specific Adaptations**: Customized recommendations based on climate classification

## API Architecture

### Main Method: `analyzeLocation(addressOrCoords)`

**Input Options**:
1. **Full Address String**: `"123 Main St, San Francisco, CA, USA"`
2. **Coordinates**: `"37.7749,-122.4194"`

**Output Structure**:
```javascript
{
  success: true,
  location: {
    formattedAddress: "123 Main St, San Francisco, CA 94102, USA",
    coordinates: { lat: 37.7749, lng: -122.4194 },
    addressComponents: {
      streetNumber: "123",
      route: "Main St",
      locality: "San Francisco",
      adminAreaLevel1: "California",
      country: "United States",
      countryCode: "US",
      postalCode: "94102"
    },
    placeTypes: ["street_address"],
    placeId: "ChIJ..."
  },
  climate: {
    current: {
      temperature: 18.5,
      feelsLike: 17.2,
      humidity: 65,
      pressure: 1013,
      windSpeed: 3.5,
      weather: "clear sky"
    },
    seasonal: {
      winter: { avgTemp: "12.0", avgPrecip: "80", avgHumidity: 70 },
      spring: { avgTemp: "15.0", avgPrecip: "60", avgHumidity: 65 },
      summer: { avgTemp: "18.0", avgPrecip: "10", avgHumidity: 60 },
      fall: { avgTemp: "16.0", avgPrecip: "40", avgHumidity: 65 }
    },
    classification: {
      type: "Temperate",
      subtype: "Mediterranean",
      description: "Temperate - Mediterranean",
      koppen: "Csa",
      averageTemperature: "15.3",
      temperatureRange: { min: "12.0", max: "18.0", variation: "6.0" },
      hemisphere: "Northern"
    }
  },
  solar: {
    hemisphere: "northern",
    sunPath: {
      summer: {
        sunrise: "05:47",
        sunset: "20:31",
        daylightHours: "14.7",
        solarNoonAltitude: "75.7"
      },
      winter: {
        sunrise: "07:25",
        sunset: "16:55",
        daylightHours: "9.5",
        solarNoonAltitude: "28.7"
      }
    },
    optimalOrientation: {
      primaryDirection: "South",
      primaryAzimuth: 180,
      toleranceRange: "150-210°",
      recommendation: "Orient building's long axis east-west with primary facade facing South (within 150-210°)",
      reasoning: "Research shows this orientation can reduce heating/cooling energy by 10-40% through optimal passive solar gain",
      sources: [
        "NACHI: Passive Solar Home Design (nachi.org)",
        "DOE: Thermal Mass and R-Value (energy.gov)"
      ]
    },
    energySavings: {
      heatingReduction: "10-25%",
      coolingReduction: "10-25%",
      totalEnergyReduction: "10-30%",
      mechanism: "Optimal orientation + high thermal-mass materials (concrete, brick, stone) regulate interior temperatures"
    },
    climateAdaptations: {
      orientation: "Primary facade facing South for optimal passive solar performance",
      thermalMass: "Medium thermal mass (brick, concrete) to moderate temperature swings",
      shading: "Seasonal shading with deciduous trees and adjustable overhangs",
      ventilation: "Operable windows for natural ventilation in shoulder seasons",
      insulation: "Balanced insulation: R-18 to R-27 walls",
      materials: ["Brick", "Concrete", "Timber", "Double-glazed windows"]
    }
  },
  recommendations: {
    summary: "Temperate - Mediterranean climate at 37.7749°, -122.4194°",
    keyInsights: [
      "Climate: Temperate - Mediterranean",
      "Optimal orientation: South-facing primary facade",
      "Energy savings potential: 10-30%",
      "Thermal mass strategy: Medium thermal mass (brick, concrete) to moderate temperature swings"
    ],
    designStrategies: [
      "Orient building's long axis east-west with primary facade facing South (within 150-210°)",
      "Seasonal shading with deciduous trees and adjustable overhangs",
      "Operable windows for natural ventilation in shoulder seasons",
      "Balanced insulation: R-18 to R-27 walls"
    ],
    recommendedMaterials: ["Brick", "Concrete", "Timber", "Double-glazed windows"]
  }
}
```

## Köppen Climate Classification

The service uses simplified Köppen climate classification based on temperature and precipitation thresholds:

| Köppen Code | Climate Type | Description | Criteria |
|-------------|--------------|-------------|----------|
| **A (Tropical)** |
| Af | Tropical rainforest | All months > 18°C, high rainfall | All months > 18°C, avg > 25°C |
| Aw | Tropical savanna | Wet/dry seasons | All months > 18°C, avg 18-25°C |
| **B (Arid)** |
| BWh | Hot desert | Very low rainfall, hot | Avg precip < 30mm, avg temp > 25°C |
| BWk | Cold desert | Very low rainfall, cool | Avg precip < 30mm, avg temp < 25°C |
| BSh | Hot semi-arid | Low rainfall, hot | Avg precip 30-60mm, avg temp > 20°C |
| BSk | Cold semi-arid | Low rainfall, cool | Avg precip 30-60mm, avg temp < 20°C |
| **C (Temperate)** |
| Cfa | Humid subtropical | Hot summers, no dry season | Min temp -3 to 18°C, precip > 50mm |
| Cfb | Oceanic | Mild summers, no dry season | Min temp -3 to 18°C, precip > 80mm |
| Csa | Mediterranean | Hot dry summers | Min temp -3 to 18°C, precip < 50mm |
| **D (Continental)** |
| Dfa | Hot summer continental | Hot summers, cold winters | Min temp < -3°C, max temp > 22°C |
| Dfb | Warm summer continental | Mild summers, cold winters | Min temp < -3°C, max temp 10-22°C |
| **E (Polar)** |
| ET | Tundra | All months < 10°C, some > 0°C | Max temp 0-10°C |
| EF | Ice cap | All months < 0°C | Max temp < 0°C |

## Sun Path Calculation Methodology

### Solar Declination
```
δ = 23.45° × sin((360/365) × (dayOfYear - 81))
```
Where:
- δ = solar declination angle
- dayOfYear: 172 for summer solstice (June 21), 355 for winter solstice (Dec 21)

### Hour Angle at Sunrise/Sunset
```
cos(H) = -tan(φ) × tan(δ)
H = acos(-tan(φ) × tan(δ))
```
Where:
- H = hour angle
- φ = latitude (in radians)
- δ = solar declination (in radians)

### Sunrise/Sunset Times
```
Sunrise = 12:00 - (H / 15)
Sunset = 12:00 + (H / 15)
Daylight Hours = 2H / 15
```

### Solar Noon Altitude
```
Solar Altitude = 90° - |latitude - declination|
```

## Climate-Specific Adaptations

### Cold/Continental Climates (Köppen D, E)
**Thermal Mass**: High (inside insulation envelope)
- Materials: Concrete, brick, stone
- Placement: Interior floors and walls receiving direct sun
- Thickness: 100-150mm floors, 100mm+ walls
- Benefit: Stores passive solar heat from south-facing windows, releases overnight

**Shading**: Minimal
- Maximize south-facing glazing for winter solar gain
- No overhangs on south facade (or minimal, retractable)

**Ventilation**: Airtight with heat recovery
- Target: ≤0.6 ACH50 (Passive House standard)
- Mechanical ventilation with heat recovery ventilator (HRV)

**Insulation**: Superinsulation
- Walls: R-30+ (R-5.0 to R-7.0 metric)
- Roof: R-60+ (R-10.0+ metric)
- Floor: R-20+ (R-3.0+ metric)

**Materials**: Concrete, brick, triple-glazed windows

**Energy Savings**: 15-35% total reduction (20-40% heating, 5-15% cooling)

---

### Hot-Arid Climates (Köppen BWh, BWk, BSh)
**Thermal Mass**: Very High
- Materials: Rammed earth, thick concrete (300-450mm), adobe
- Placement: Throughout building
- Benefit: Exploits large diurnal temperature swings (20-30°C daily variation). Absorbs daytime heat, releases to cool night sky.

**Shading**: Extensive
- Deep roof overhangs, brise-soleil, external screens
- Light-colored surfaces (high solar reflectance)
- Vegetation for shading

**Ventilation**: Natural cross-ventilation
- Operable windows aligned with prevailing breezes
- Night ventilation to purge stored heat

**Insulation**: Moderate
- Walls: R-15 to R-25
- Roof: R-30 to R-40 with reflective barriers

**Materials**: Rammed earth, thick concrete, adobe, reflective roofing

**Energy Savings**: 10-25% total reduction (5-10% heating, 15-30% cooling)

---

### Hot-Humid/Tropical Climates (Köppen Af, Aw)
**Thermal Mass**: Low to Medium
- Materials: Lightweight concrete, insulated concrete block
- Placement: Primarily in floors; limit mass in walls
- Benefit: Moderate heat storage without retaining excessive heat

**Shading**: Extensive
- Wide overhangs, vegetation, external shading devices
- Light-colored finishes

**Ventilation**: Cross-ventilation prioritized
- Large operable openings
- Elevated floors for airflow
- High ceilings for heat stratification

**Insulation**: Moderate with reflective barriers
- Walls: R-15 to R-25
- Roof: R-30 to R-40

**Materials**: Lightweight concrete, insulated block, tile, reflective roofing

**Energy Savings**: 10-25% total reduction (5-10% heating, 15-30% cooling)

---

### Temperate Climates (Köppen C)
**Thermal Mass**: Medium
- Materials: Brick, concrete
- Placement: Floors and selected walls
- Thickness: 150-200mm
- Benefit: Moderates day-night temperature swings (10-15°C daily variation)

**Shading**: Seasonal
- Deciduous trees (shade in summer, allow sun in winter)
- Adjustable overhangs or louvers

**Ventilation**: Operable windows
- Natural ventilation in spring/fall shoulder seasons
- Mechanical ventilation in extreme summer/winter

**Insulation**: Balanced
- Walls: R-18 to R-27
- Roof: R-38 to R-49

**Materials**: Brick, concrete, timber, double-glazed windows

**Energy Savings**: 10-30% total reduction (10-25% heating, 10-25% cooling)

---

## Integration with aiIntegrationService

The enhanced location service is automatically integrated into the main AI workflow:

```javascript
// Step 1: Site context analysis now uses enhanced location service
const siteAnalysis = await this.analyzeSiteContext(projectContext);

// Returns:
{
  location: "Formatted address",
  coordinates: { lat, lng },
  addressComponents: { ... },
  climate: {
    type: "Temperate - Mediterranean",
    current: { ... },
    seasonal: { ... },
    classification: { ... }
  },
  solar: {
    hemisphere: "northern",
    sunPath: { summer: {...}, winter: {...} },
    optimalOrientation: { ... },
    energySavings: { ... },
    climateAdaptations: { ... }
  },
  recommendations: { ... }
}
```

This data flows into:
- **Step 2**: Solar orientation service (already has data from enhanced location service)
- **Step 3**: Building program service (uses climate classification)
- **Step 4**: Material selection service (uses climate classification and adaptations)
- **Step 6**: Design reasoning (integrates all analysis)

## API Usage and Cost

### Google Maps Geocoding API
- **Free tier**: $200/month credit (~28,000 requests)
- **Cost**: $0.005 per request (forward or reverse geocoding)
- **Quota**: 2,500 free requests/day

### OpenWeather One-Call API 3.0
- **Free tier**: 1,000 calls/day
- **Cost**: Free for < 1,000 calls/day; $0.0012 per call above
- **Fallback**: If 3.0 unavailable, falls back to 2.5 Current Weather API (free, 60 calls/min)

### Total Cost per Complete Design
With enhanced location service:
- Google Geocoding: $0.005
- OpenWeather One-Call: $0.001 (if over free tier)
- Solar calculations: $0 (computed locally)
- **Total location analysis: ~$0.006 per design**

Combined with AI generation:
- Location analysis: $0.006
- OpenAI GPT-4: $0.20-$0.40
- Replicate SDXL: $1.20-$2.40
- **Grand total: ~$1.40-$2.80 per complete design**

## Error Handling and Fallbacks

### Geocoding Failures
- Returns fallback with default coordinates (0, 0)
- Logs error but doesn't crash workflow
- User sees "Geocoding unavailable" note

### OpenWeather API Failures
- First tries One-Call API 3.0
- Falls back to Current Weather API 2.5
- If both fail, uses approximated seasonal data
- Always returns valid climate classification

### No Location Data
- If no address or coordinates provided, uses default temperate climate
- Solar orientation defaults to south-facing (northern hemisphere assumption)
- Workflow continues with reasonable defaults

## Example Usage

### Basic Usage
```javascript
import enhancedLocationService from './services/enhancedLocationService';

// Using full address
const result = await enhancedLocationService.analyzeLocation(
  "1600 Amphitheatre Parkway, Mountain View, CA"
);

// Using coordinates
const result2 = await enhancedLocationService.analyzeLocation("37.4220,-122.0841");

console.log('Climate:', result.climate.classification.description);
console.log('Optimal orientation:', result.solar.optimalOrientation.primaryDirection);
console.log('Energy savings:', result.solar.energySavings.totalEnergyReduction);
```

### Integration in Complete Workflow
```javascript
import aiIntegrationService from './services/aiIntegrationService';

const projectContext = {
  location: {
    address: "1600 Amphitheatre Parkway, Mountain View, CA"
  },
  buildingType: "commercial-office",
  siteArea: 2000
};

const completeDesign = await aiIntegrationService.generateCompleteDesign(projectContext);

console.log('Site analysis:', completeDesign.siteAnalysis.climate.classification);
console.log('Solar orientation:', completeDesign.solarOrientation.optimalOrientation);
console.log('Design reasoning:', completeDesign.reasoning.passiveSolarDesign);
```

## Research References

1. **NACHI - Passive Solar Home Design**
   - Source: nachi.org
   - Key Finding: Proper orientation can reduce heating/cooling energy by 10-40%
   - Recommendation: South-facing windows in northern hemisphere (±30° tolerance)

2. **U.S. Department of Energy - Thermal Mass and R-Value**
   - Source: energy.gov
   - Key Finding: High thermal-mass materials (concrete, brick, stone) regulate interior temperatures
   - Benefit: Absorb daytime heat, release overnight; reduce temperature swings by 5-10°C

3. **Köppen Climate Classification**
   - Standard: International climate classification system
   - Thresholds: Based on temperature and precipitation patterns
   - Used: By architects, engineers, and climatologists worldwide

## Future Enhancements

### Planned Features
1. **Historical Climate Data**: Use OpenWeather's historical API for more accurate seasonal averages
2. **Deep Learning Style Detection**: Analyze Street View imagery to detect predominant local architectural styles
3. **Satellite Imagery Analysis**: Extract building footprints and site constraints from satellite images
4. **Zoning Data Integration**: Automatic zoning lookup from municipal APIs
5. **Microclimate Analysis**: Account for urban heat islands, local topography, and vegetation

### Integration Hooks
All future enhancements can be added to `analyzeSiteContext()` method without breaking existing API.

---

**Status**: ✅ Production-ready
**Version**: 1.0.0
**Last Updated**: 2025-10-06
