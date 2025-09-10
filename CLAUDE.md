# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm install` - Install dependencies (required after cloning)
- `npm start` - Start development server on http://localhost:3000
- `npm run build` - Create production build in /build folder
- `npm test` - Run test suite in interactive mode

### Deployment
The repository auto-deploys to Vercel via GitHub integration. Push to main branch triggers automatic deployment to www.archiaisolution.pro.

## Architecture Overview

### Application Structure
This is an AI-powered architectural design platform built as a single-page React application with a multi-step wizard interface. The core application is in `src/ArchitectAIEnhanced.js` which orchestrates the entire user journey from location analysis to 3D design generation.

### Key Components & Data Flow

**Location Intelligence System:**
- `src/services/locationIntelligence.js` - Primary location analysis service with intelligent zoning detection
- `src/services/enhancedLocationIntelligence.js` - Enhanced service for authoritative planning data from official APIs
- `src/data/globalArchitecturalDatabase.js` - Comprehensive architectural style database organized by continent/country/region

**Core User Flow:**
1. **Location Analysis** - Automatic geolocation detection + reverse geocoding via Google Maps API
2. **Intelligence Report** - Climate data (OpenWeather API) + zoning analysis + architectural style recommendations
3. **Portfolio Upload** - User architectural portfolio analysis for style synthesis
4. **Project Specifications** - Building program and area requirements
5. **AI Generation** - Mock architectural design generation with technical specifications
6. **Export System** - Generate downloadable CAD files (DWG, RVT, IFC) and documentation

### Location Intelligence Architecture

The location intelligence system has a sophisticated hierarchy:
- **Global Database**: `globalArchitecturalDatabase.js` contains architectural styles by region, organized as Continent → Country → Region/State → City, with specialized lookup patterns for UK postcodes, US states, and international cities
- **Climate Integration**: Seasonal weather data from OpenWeather API feeds into architectural style recommendations
- **Zoning Analysis**: Multi-tiered zoning detection using address components, with specialized handlers for UK (postcode-based), US (city/state-based), and international locations

### API Dependencies & Environment Variables

**Required Environment Variables (.env):**
- `REACT_APP_GOOGLE_MAPS_API_KEY` - For geocoding, reverse geocoding, and 3D map display
- `REACT_APP_OPENWEATHER_API_KEY` - For seasonal climate data analysis

**Key External APIs:**
- Google Maps JavaScript API - 3D mapping with hybrid satellite view
- Google Geocoding API - Address to coordinates conversion
- OpenWeather One Call API - Historical seasonal climate data
- UK Planning Data Portal (optional) - Authoritative planning constraints
- NYC Open Data (fallback example) - Zoning information

### Map System
The `MapView` component renders interactive 3D maps using Google Maps API with:
- Hybrid satellite/map view optimized for architectural site analysis
- Custom location markers with project site indicators
- 45-degree tilt for 3D building visualization
- Coordinate display and enhanced map controls

### Location Detection Logic
Automatic location detection on application start:
1. Browser geolocation API requests user coordinates
2. Reverse geocoding via Google Maps API converts coordinates to address
3. Fallback to San Francisco default if geolocation fails/denied
4. Real-time user feedback via toast notifications

### File Generation System
Mock file generation for architectural deliverables:
- DWG (AutoCAD) - 2D architectural drawings with project specifications
- RVT (Revit) - 3D BIM model data with parametric information
- IFC - Industry standard BIM exchange format
- PDF - Complete project documentation with technical specifications

### Error Handling & Fallbacks
- Comprehensive error boundaries for React component failures
- API failure fallbacks (default locations, mock climate data)
- Graceful degradation when geolocation is unavailable
- Development vs production API key handling

## Key Integration Points

**When modifying location detection:**
- Update `detectUserLocation()` function in `ArchitectAIEnhanced.js`
- Consider fallback behavior in `analyzeLocation()` method
- Test with various address formats and international locations

**When extending architectural database:**
- Add new regions/countries in `globalArchitecturalDatabase.js`
- Update `architecturalStyleService` query methods
- Ensure proper continent detection in `detectContinent()`

**When adding new APIs:**
- Add environment variables to `.env`
- Update error handling in respective service files
- Consider rate limiting and quota management
- Test API failures and implement appropriate fallbacks

## Location Data Structure

The location intelligence system expects and returns data in this structure:
```javascript
{
  address: "Full formatted address",
  coordinates: { lat: number, lng: number },
  climate: { type: string, seasonal: {...} },
  sunPath: { summer: string, winter: string, optimalOrientation: string },
  zoning: { type: string, maxHeight: string, density: string, setbacks: string },
  recommendedStyle: string,
  localStyles: array,
  marketContext: { avgConstructionCost: string, demandIndex: string, roi: string }
}
```

## Testing Considerations

- Test geolocation permission scenarios (granted, denied, unavailable)
- Verify API key fallback behavior in development vs production
- Test international address formats and coordinate systems
- Validate file generation downloads across browsers
- Test 3D map rendering performance on various devices