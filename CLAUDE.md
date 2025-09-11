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

## Current Application State

**IMPORTANT**: The main application (`src/ArchitectAIEnhanced.js`) has been temporarily replaced with a maintenance page (`src/App.js`) due to persistent freezing issues. The original application code is preserved in `src/ArchitectAIEnhanced.js.backup`.

### Current Structure (Maintenance Mode)
- `src/App.js` - Static maintenance page showing platform features
- `src/ArchitectAIEnhanced.js.backup` - Original full application (81KB, complex React component)
- The current App.js displays a maintenance message with feature overview cards

### Original Architecture (when restored from backup)
This was an AI-powered architectural design platform built as a single-page React application with a multi-step wizard interface. The core application was in `src/ArchitectAIEnhanced.js` which orchestrated the entire user journey from location analysis to 3D design generation.

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

## Restoring Full Application

To restore the full application from maintenance mode:

1. **Backup current simple App.js**: `mv src/App.js src/App.maintenance.js`
2. **Restore main application**: `mv src/ArchitectAIEnhanced.js.backup src/ArchitectAIEnhanced.js`
3. **Update App.js to import ArchitectAIEnhanced**: Uncomment import and component usage in `src/App.js`
4. **Test thoroughly**: The original app had React hooks warnings and infinite re-render issues that caused freezing

## Key Integration Points

**When restoring/modifying location detection:**
- Update `detectUserLocation()` function in `ArchitectAIEnhanced.js`
- Consider fallback behavior in `analyzeLocation()` method
- Test with various address formats and international locations
- **CRITICAL**: Address infinite re-render loops that caused the original freeze

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
- **CRITICAL**: Monitor for infinite re-render loops in location detection and map components
- Test React hooks dependencies to prevent warnings and performance issues

## Known Issues & Recent Fixes

### Recent Problem Resolution
- **Main Issue**: Original `ArchitectAIEnhanced.js` component was causing persistent website freezing
- **Root Cause**: Infinite re-render loops in MapView and location detection components
- **Current Solution**: Temporarily replaced with static maintenance page
- **Original Code**: Preserved in `src/ArchitectAIEnhanced.js.backup` (81KB file with complete functionality)

### Git History Context
Recent commits show progression of issues:
- `d0a2b0e`: Main app replaced with maintenance page to resolve freezing
- `a0407c7`: Function declaration order issue preventing initialization  
- `f26a39f`: Infinite re-render loops in MapView and location detection
- `0262bb1`: Infinite re-render loop causing website freeze
- `afea1c4`: React hooks warnings resolution

### File Structure Changes
- `ArchitectAIEnhanced.js` was deleted from active codebase
- `ArchitectAIEnhanced.js.backup` contains the original 2000+ line React component
- Current `App.js` is a simple maintenance page (59 lines)