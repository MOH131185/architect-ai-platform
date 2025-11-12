/**
 * Site Analysis Service
 *
 * Analyzes actual site context from Google Maps to inform building design:
 * - Plot shape and dimensions (from actual property boundaries)
 * - Surface area calculation from polygon geometry
 * - Road orientation and curvature
 * - Address limitations (corner lot, narrow lot, etc.)
 * - Site constraints and opportunities
 * - Optimal building placement
 *
 * Enhanced with:
 * - Google Places API for parcel geometry
 * - OpenStreetMap/Overpass API for property boundaries
 * - Polygon area computation
 */

import axios from 'axios';
import { simplifyPolygon, detectBuildingType } from '../utils/polygonSimplifier';
import { detectPropertyBoundary, analyzeShapeType } from './propertyBoundaryService';

class SiteAnalysisService {
  constructor() {
    this.googleMapsApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    this.cachePrefix = 'siteAnalysis_';
    this.cacheTTL = 60 * 60 * 1000; // 1 hour in milliseconds
    console.log('🗺️  Site Analysis Service initialized with polygon detection and caching');
  }

  /**
   * Get cached site analysis if available and fresh
   */
  getCachedAnalysis(cacheKey) {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      if (age < this.cacheTTL) {
        console.log(`   ✓ Using cached site analysis (age: ${Math.round(age / 1000)}s)`);
        return data;
      } else {
        console.log(`   × Cache expired (age: ${Math.round(age / 1000)}s), fetching fresh data`);
        sessionStorage.removeItem(cacheKey);
        return null;
      }
    } catch (error) {
      console.warn('Cache read error:', error);
      return null;
    }
  }

  /**
   * Save site analysis to cache
   */
  saveToCache(cacheKey, data) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now()
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      console.log('   ✓ Site analysis cached successfully');
    } catch (error) {
      console.warn('Cache write error:', error);
      // Continue without caching
    }
  }

  /**
   * Analyze site context from address and coordinates
   * Returns comprehensive site analysis to inform building design
   * ENHANCED: Now includes actual property boundary polygon detection and caching
   */
  async analyzeSiteContext(address, coordinates) {
    console.log('🔍 Analyzing site context for:', address);

    // Generate cache key from address and coordinates
    const cacheKey = `${this.cachePrefix}${address}_${coordinates.lat}_${coordinates.lng}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // Check cache first
    const cachedResult = this.getCachedAnalysis(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Get detailed geocoding data
      const geocodeData = await this.getDetailedGeocoding(address);

      // NEW: Get actual property boundary polygon with address precision
      const propertyBoundary = await this.getPropertyBoundary(
        coordinates,
        geocodeData?.placeId,
        geocodeData
      );

      // Analyze street view and orientation
      const streetContext = await this.analyzeStreetContext(coordinates);

      // Determine plot characteristics (enhanced with actual boundary data)
      const plotAnalysis = this.analyzePlotCharacteristics(geocodeData, streetContext, propertyBoundary);

      // Generate site-specific design constraints
      const designConstraints = this.generateDesignConstraints(plotAnalysis, geocodeData);

      // Determine optimal building orientation
      const optimalOrientation = this.calculateOptimalOrientation(plotAnalysis, streetContext);

      const result = {
        success: true,
        siteAnalysis: {
          address: address,
          coordinates: coordinates,

          // NEW: Actual site boundary data with enhanced shape detection
          siteBoundary: propertyBoundary?.polygon || null,
          surfaceArea: propertyBoundary?.area || plotAnalysis.dimensions.width * plotAnalysis.dimensions.depth,
          surfaceAreaUnit: propertyBoundary?.unit || 'm²',
          boundarySource: propertyBoundary?.source || 'estimated',
          boundaryShapeType: propertyBoundary?.shapeType || plotAnalysis.plotShape,
          boundaryConfidence: propertyBoundary?.confidence || 0.40,

          plotType: plotAnalysis.plotType,
          plotShape: propertyBoundary?.shapeType || plotAnalysis.plotShape, // Use detected shape
          plotDimensions: plotAnalysis.dimensions,
          streetOrientation: streetContext.orientation,
          roadType: streetContext.roadType,
          roadCurvature: streetContext.curvature,
          isCornerLot: plotAnalysis.isCornerLot,
          constraints: designConstraints,
          optimalBuildingOrientation: optimalOrientation,
          frontSetback: designConstraints.frontSetback,
          sideSetbacks: designConstraints.sideSetbacks,
          buildableArea: plotAnalysis.buildableArea,
          recommendations: this.generateSiteRecommendations(plotAnalysis, streetContext),

          // 🆕 plotGeometry - formatted for locationAwareDNAModifier compatibility
          plotGeometry: {
            shape: propertyBoundary?.shapeType || plotAnalysis.plotShape,
            dimensions: {
              width: plotAnalysis.dimensions.width,
              length: plotAnalysis.dimensions.depth, // depth is same as length
              area: propertyBoundary?.area || (plotAnalysis.dimensions.width * plotAnalysis.dimensions.depth)
            },
            slope: 0, // TODO: Add slope detection from elevation API
            orientation: optimalOrientation,
            shapeType: propertyBoundary?.shapeType,
            confidence: propertyBoundary?.confidence
          },

          // 🆕 PlanJSON-compatible site geometry
          siteGeometry: this.convertToSiteGeometry(
            propertyBoundary?.polygon || null,
            plotAnalysis,
            streetContext,
            propertyBoundary?.area,
            propertyBoundary?.shapeType
          )
        }
      };

      // Save to cache before returning
      this.saveToCache(cacheKey, result);

      return result;
    } catch (error) {
      console.error('❌ Site analysis failed:', error);
      return {
        success: false,
        siteAnalysis: this.getFallbackSiteAnalysis(address, coordinates),
        error: error.message
      };
    }
  }

  /**
   * Get detailed geocoding information
   */
  async getDetailedGeocoding(address) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.googleMapsApiKey}`;

    try {
      const response = await axios.get(url);

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];

        return {
          formattedAddress: result.formatted_address,
          addressComponents: result.address_components,
          geometry: result.geometry,
          placeId: result.place_id,
          types: result.types
        };
      }

      throw new Error('Geocoding failed');
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Get property boundary polygon from multiple sources
   * Priority: 1) Enhanced Multi-Source Detection, 2) OpenStreetMap, 3) Google Places, 4) Estimated
   * ENHANCED: Uses new propertyBoundaryService with intelligent shape detection
   */
  async getPropertyBoundary(coordinates, placeId, addressDetails) {
    console.log('🔍 Fetching property boundary polygon with enhanced detection...');

    // Build full address string for better detection
    const fullAddress = addressDetails?.formattedAddress || '';

    try {
      // PRIORITY 1: Use enhanced property boundary service (multi-source with intelligent fallbacks)
      console.log('🔍 PRIORITY 1: Enhanced multi-source boundary detection...');
      const enhancedBoundary = await detectPropertyBoundary(coordinates, fullAddress);

      if (enhancedBoundary && enhancedBoundary.polygon && enhancedBoundary.polygon.length >= 3) {
        console.log('✅ Property boundary detected via enhanced service');
        console.log(`   📐 Shape: ${enhancedBoundary.shapeType}`);
        console.log(`   📐 Area: ${enhancedBoundary.area}m²`);
        console.log(`   📊 Source: ${enhancedBoundary.source}`);
        console.log(`   🎯 Confidence: ${(enhancedBoundary.confidence * 100).toFixed(0)}%`);

        return {
          polygon: enhancedBoundary.polygon,
          area: enhancedBoundary.area,
          unit: 'm²',
          source: enhancedBoundary.source,
          shapeType: enhancedBoundary.shapeType,
          confidence: enhancedBoundary.confidence,
          metadata: enhancedBoundary.metadata || {}
        };
      }

      // PRIORITY 2: Fallback to legacy OpenStreetMap detection
      console.log('🔍 PRIORITY 2: Fallback to legacy OpenStreetMap detection...');
      const hasStreetNumber = addressDetails?.addressComponents?.some(
        component => component.types.includes('street_number')
      );
      const houseNumber = addressDetails?.addressComponents?.find(
        component => component.types.includes('street_number')
      )?.long_name;

      const enhancedAddressDetails = {
        ...addressDetails,
        hasStreetNumber,
        houseNumber
      };

      const osmBoundary = await this.getOSMPropertyBoundary(coordinates, enhancedAddressDetails);
      if (osmBoundary && osmBoundary.polygon) {
        console.log('✅ Property boundary from legacy OpenStreetMap');
        console.log(`   📐 Area: ${osmBoundary.area}m²`);

        // Enhance with shape analysis
        const shapeType = analyzeShapeType(osmBoundary.polygon);

        return {
          ...osmBoundary,
          shapeType,
          confidence: 0.90
        };
      }

      // PRIORITY 3: Fallback to Google Geocoding/Places
      console.log('🔍 PRIORITY 3: Trying Google Geocoding/Places...');
      const placesBoundary = await this.getPlaceGeometry(coordinates, placeId);
      if (placesBoundary && placesBoundary.polygon) {
        console.log('✅ Property boundary from Google Places');
        console.log(`   📐 Area: ${placesBoundary.area}m²`);

        // Enhance with shape analysis
        const shapeType = analyzeShapeType(placesBoundary.polygon);

        return {
          ...placesBoundary,
          shapeType,
          confidence: 0.60
        };
      }

      console.log('⚠️  No property boundary found from any source - using intelligent estimation');
      return null;
    } catch (error) {
      console.error('Property boundary detection error:', error);
      return null;
    }
  }

  /**
   * Get property boundary from OpenStreetMap/Overpass API
   * Most accurate for actual property parcels
   * ENHANCED: Multi-strategy approach for exact building shape detection
   * ENHANCED: Retry logic with exponential backoff for timeout errors
   */
  async getOSMPropertyBoundary(coordinates, addressDetails, retryCount = 0) {
    const { lat, lng } = coordinates;
    const maxRetries = 2;
    const baseTimeout = 30000; // 30 seconds base timeout

    console.log(`🎯 Searching for exact building geometry${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ''}`);
    console.log(`   Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    console.log(`   Address precision: ${addressDetails?.hasStreetNumber ? 'PRECISE (has house number)' : 'GENERAL (no house number)'}`);

    // STRATEGY 1: Point-in-polygon query (most accurate - finds building containing the exact point)
    // STRATEGY 2: Nearby search with tight radius (fallback if point not inside any building)

    // Try point-in-polygon first (buildings containing this exact coordinate)
    const pointQuery = `
      [out:json][timeout:25];
      (
        way(around:0,${lat},${lng})["building"];
        relation(around:0,${lat},${lng})["building"];
      );
      out tags geom;
    `;

    // Fallback: nearby search with increasing radius
    const searchRadius = addressDetails?.hasStreetNumber ? 3 : 10;
    const nearbyQuery = `
      [out:json][timeout:25];
      (
        way(around:${searchRadius},${lat},${lng})["building"];
        relation(around:${searchRadius},${lat},${lng})["building"];
      );
      out tags geom;
    `;

    try {
      // Increase timeout with each retry attempt
      const timeoutMs = baseTimeout + (retryCount * 10000);

      // TRY STRATEGY 1: Point-in-polygon (exact location)
      console.log(`   🎯 Strategy 1: Searching for building at EXACT coordinates...`);
      let response = await axios.get('https://overpass-api.de/api/interpreter', {
        params: { data: pointQuery },
        timeout: timeoutMs
      });

      // If no results from point query, try nearby search
      if (!response.data || !response.data.elements || response.data.elements.length === 0) {
        console.log(`   📍 Strategy 2: No building at exact point, searching within ${searchRadius}m radius...`);
        response = await axios.get('https://overpass-api.de/api/interpreter', {
          params: { data: nearbyQuery },
          timeout: timeoutMs
        });
      }

      if (response.data && response.data.elements && response.data.elements.length > 0) {
        console.log(`   Found ${response.data.elements.length} potential properties`);

        // Filter to only actual buildings (exclude large landuse polygons)
        const buildings = response.data.elements.filter(element => {
          const tags = element.tags || {};

          // Must have 'building' tag
          if (!tags.building) return false;

          // Exclude very large buildings (likely apartments/commercial)
          const polygon = this.extractOSMPolygon(element);
          if (polygon && polygon.length >= 3) {
            const area = this.computePolygonArea(polygon);

            // For precise addresses, only accept residential-sized buildings (< 300m²)
            if (addressDetails?.hasStreetNumber && area > 300) {
              console.log(`   ⏭️ Skipping large building (${area.toFixed(0)}m²) - likely not a single house`);
              return false;
            }

            // Exclude huge landuse polygons (> 1000m²)
            if (area > 1000) {
              console.log(`   ⏭️ Skipping very large polygon (${area.toFixed(0)}m²)`);
              return false;
            }
          }

          return true;
        });

        console.log(`   Filtered to ${buildings.length} actual buildings`);

        if (buildings.length === 0) {
          console.log('   ⚠️ No suitable residential buildings found after filtering');
          return null;
        }

        // PRIORITY 1: Try to find building with exact house number match
        let exactMatchElement = null;
        const targetHouseNumber = addressDetails?.houseNumber;

        if (targetHouseNumber) {
          console.log(`   🔍 Looking for building with house number: ${targetHouseNumber}`);

          for (const element of buildings) {
            const osmHouseNumber = element.tags?.['addr:housenumber'];
            if (osmHouseNumber && osmHouseNumber === targetHouseNumber) {
              console.log(`   🎯 EXACT MATCH FOUND! Building ${element.id} has addr:housenumber = ${osmHouseNumber}`);
              exactMatchElement = element;
              break;
            }
          }
        }

        // PRIORITY 2: If no exact match, find the closest building
        let closestElement = exactMatchElement;
        let minDistance = Infinity;

        if (!exactMatchElement) {
          console.log('   📏 No exact house number match, selecting by distance...');

          for (const element of buildings) {
            // Get element's center point
            const elementCenter = this.getElementCenter(element);
            if (!elementCenter) continue;

            // Calculate distance from target coordinates
            const distance = this.calculateDistance(lat, lng, elementCenter.lat, elementCenter.lon);

            const osmHouseNumber = element.tags?.['addr:housenumber'];
            console.log(`   📍 Building ${element.id}: ${distance.toFixed(1)}m away, type: ${element.tags?.building}${osmHouseNumber ? `, house#: ${osmHouseNumber}` : ''}`);

            if (distance < minDistance) {
              minDistance = distance;
              closestElement = element;
            }
          }

          console.log(`   ✅ Selected closest building at ${minDistance.toFixed(1)}m distance`);
        } else {
          // Calculate distance for the exact match
          const elementCenter = this.getElementCenter(exactMatchElement);
          if (elementCenter) {
            minDistance = this.calculateDistance(lat, lng, elementCenter.lat, elementCenter.lon);
            console.log(`   ✅ Using exact house number match at ${minDistance.toFixed(1)}m distance`);
          }
        }

        if (closestElement) {
          // Extract polygon coordinates
          const polygon = this.extractOSMPolygon(closestElement);

          if (polygon && polygon.length >= 3) {
            // Compute area
            const area = this.computePolygonArea(polygon);

            const osmHouseNumber = closestElement.tags?.['addr:housenumber'];
            const isExactMatch = exactMatchElement !== null;

            console.log(`   ✅ Property boundary: ${polygon.length} vertices, ${area.toFixed(0)}m²`);
            console.log(`   📊 Building type: ${closestElement.tags?.building}`);
            console.log(`   🆔 OSM ID: ${closestElement.id}`);
            console.log(`   🏠 House number: ${osmHouseNumber || 'N/A'}`);
            console.log(`   ${isExactMatch ? '🎯 Selection method: EXACT HOUSE NUMBER MATCH' : '📏 Selection method: DISTANCE-BASED (closest building)'}`);

            return {
              polygon: polygon,
              area: area,
              unit: 'm²',
              source: 'OpenStreetMap',
              metadata: {
                osmId: closestElement.id,
                type: closestElement.tags?.building || 'unknown',
                distance: minDistance,
                buildingType: closestElement.tags?.building,
                houseNumber: osmHouseNumber,
                isExactMatch: isExactMatch,
                targetHouseNumber: targetHouseNumber
              }
            };
          }
        }
      }

      console.log('   ⚠️ No suitable property boundary found');
      return null;
    } catch (error) {
      // Handle timeout errors with retry logic
      const isTimeout = error.code === 'ECONNABORTED' ||
                        error.code === 'ERR_BAD_RESPONSE' ||
                        error.response?.status === 504 ||
                        error.response?.status === 503;

      if (isTimeout && retryCount < maxRetries) {
        const delayMs = 1000 * Math.pow(2, retryCount); // Exponential backoff: 1s, 2s
        console.log(`⚠️ OSM API timeout - retrying in ${delayMs}ms...`);
        console.log(`   Error: ${error.message}`);

        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.getOSMPropertyBoundary(coordinates, addressDetails, retryCount + 1);
      }

      // Log detailed error information
      console.error('OSM boundary fetch error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        retryCount: retryCount
      });

      if (isTimeout) {
        console.log('⚠️ OSM API still timing out after retries - falling back to Google Places');
      }

      return null;
    }
  }

  /**
   * Extract polygon coordinates from OSM element
   * ENHANCED: Supports complex building shapes (L-shaped, U-shaped, etc.)
   */
  extractOSMPolygon(element) {
    const coords = [];

    if (element.type === 'way' && element.geometry) {
      // Way element has geometry array - simple polygon
      for (const node of element.geometry) {
        coords.push({ lat: node.lat, lng: node.lon });
      }

      // Ensure polygon is closed
      if (coords.length > 0) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first.lat !== last.lat || first.lng !== last.lng) {
          coords.push({ lat: first.lat, lng: first.lng });
        }
      }
    } else if (element.type === 'relation' && element.members) {
      // Relation element - can be complex multipolygon (L-shaped, U-shaped, etc.)
      // Extract outer way (main building outline)
      for (const member of element.members) {
        if (member.role === 'outer' && member.geometry) {
          for (const node of member.geometry) {
            coords.push({ lat: node.lat, lng: node.lon });
          }
          break; // Use first outer member only
        }
      }

      // Fallback: if no 'outer' role, use any member with geometry
      if (coords.length === 0) {
        for (const member of element.members) {
          if (member.geometry) {
            for (const node of member.geometry) {
              coords.push({ lat: node.lat, lng: node.lon });
            }
            break;
          }
        }
      }
    }

    console.log(`   📐 Extracted polygon with ${coords.length} vertices`);

    // Simplify polygon if it has too many vertices (OSM can be overly detailed)
    if (coords.length > 10) {
      const simplified = simplifyPolygon(coords, 0.5); // 0.5m tolerance

      // Detect building type
      const buildingType = detectBuildingType(simplified);
      console.log(`   🏠 Building type: ${buildingType.type} (confidence: ${buildingType.confidence})`);

      return simplified;
    }

    return coords;
  }

  /**
   * Get center point of an OSM element
   */
  getElementCenter(element) {
    if (!element.geometry || element.geometry.length === 0) {
      return null;
    }

    // Calculate centroid of the polygon
    const lats = element.geometry.map(node => node.lat);
    const lons = element.geometry.map(node => node.lon);

    return {
      lat: lats.reduce((sum, lat) => sum + lat, 0) / lats.length,
      lon: lons.reduce((sum, lon) => sum + lon, 0) / lons.length
    };
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Get place geometry from Google Geocoding/Places API
   * ENHANCED: Uses location_type precision and creates realistic building footprints
   * instead of large viewport rectangles
   */
  async getPlaceGeometry(coordinates, placeId) {
    const { lat, lng } = coordinates;

    try {
      // STEP 1: Try Geocoding API for precise location_type information
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${this.googleMapsApiKey}`;
      let geocodeData = null;
      let locationType = null;

      try {
        const geocodeResponse = await axios.get(geocodeUrl);
        if (geocodeResponse.data.status === 'OK' && geocodeResponse.data.results.length > 0) {
          geocodeData = geocodeResponse.data.results[0];
          locationType = geocodeData.geometry?.location_type;
          console.log(`   📍 Geocoding precision: ${locationType}`);
        }
      } catch (error) {
        console.warn('   ⚠️ Geocoding API failed:', error.message);
      }

      // STEP 2: Determine building footprint based on location precision
      let polygon = null;
      let area = 0;
      let estimatedFootprint = null;

      // ROOFTOP = most precise (exact building)
      // RANGE_INTERPOLATED = very good (street address)
      // GEOMETRIC_CENTER = moderate (property center)
      // APPROXIMATE = poor (area/neighborhood)

      if (locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED') {
        // High precision - create realistic building footprint estimate
        console.log('   🏠 High precision address - creating building footprint estimate');

        // Estimate typical building dimensions based on address type
        const buildingWidth = 12;  // meters (typical building width)
        const buildingDepth = 15;  // meters (typical building depth)

        // Create rectangular footprint centered on coordinates
        polygon = this.createBuildingFootprint(lat, lng, buildingWidth, buildingDepth);
        area = this.computePolygonArea(polygon);
        estimatedFootprint = true;

        console.log(`   📐 Created ${buildingWidth}m × ${buildingDepth}m building footprint: ${area}m²`);

      } else {
        // Lower precision - try to get bounds from Places API
        let viewport = null;

        if (placeId) {
          const detailsUrl = `http://localhost:3001/api/google/places/details?place_id=${placeId}&fields=geometry`;
          const detailsResponse = await axios.get(detailsUrl);

          if (detailsResponse.data.status === 'OK') {
            viewport = detailsResponse.data.result.geometry?.viewport;
          }
        }

        // Fallback: Use Nearby Search
        if (!viewport) {
          const searchUrl = `http://localhost:3001/api/google/places/nearby?location=${lat},${lng}&radius=10`;
          const searchResponse = await axios.get(searchUrl);

          if (searchResponse.data.status === 'OK' && searchResponse.data.results.length > 0) {
            viewport = searchResponse.data.results[0].geometry?.viewport;
          }
        }

        if (viewport) {
          // Convert viewport to polygon
          polygon = this.viewportToPolygon(viewport);
          area = this.computePolygonArea(polygon);

          // VALIDATION: If area is too large for a single building, shrink it
          const MAX_REASONABLE_AREA = 500; // m² - max reasonable for single residential building

          if (area > MAX_REASONABLE_AREA) {
            console.log(`   ⚠️ Viewport too large (${area}m²) - creating estimated footprint instead`);

            // Replace with reasonable building footprint
            const buildingWidth = 12;
            const buildingDepth = 15;
            polygon = this.createBuildingFootprint(lat, lng, buildingWidth, buildingDepth);
            area = this.computePolygonArea(polygon);
            estimatedFootprint = true;

            console.log(`   📐 Replaced with ${buildingWidth}m × ${buildingDepth}m footprint: ${area}m²`);
          }
        }
      }

      if (polygon) {
        return {
          polygon: polygon,
          area: area,
          unit: 'm²',
          source: estimatedFootprint ? 'Google Geocoding (estimated footprint)' : 'Google Places',
          metadata: {
            placeId: placeId,
            type: estimatedFootprint ? 'estimated_building_footprint' : 'viewport_bounds',
            locationType: locationType,
            precision: locationType === 'ROOFTOP' ? 'high' : locationType === 'RANGE_INTERPOLATED' ? 'medium' : 'low'
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Google Places geometry error:', error);
      return null;
    }
  }

  /**
   * Create a rectangular building footprint polygon centered on coordinates
   * Returns polygon with proper lat/lng coordinates
   */
  createBuildingFootprint(centerLat, centerLng, widthMeters, depthMeters) {
    const R = 6371000; // Earth radius in meters

    // Calculate offset in degrees for width and depth
    const latOffset = (depthMeters / 2) / R * (180 / Math.PI);
    const lngOffset = (widthMeters / 2) / R * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);

    // Create rectangle centered on the point
    return [
      { lat: centerLat - latOffset, lng: centerLng - lngOffset }, // SW corner
      { lat: centerLat - latOffset, lng: centerLng + lngOffset }, // SE corner
      { lat: centerLat + latOffset, lng: centerLng + lngOffset }, // NE corner
      { lat: centerLat + latOffset, lng: centerLng - lngOffset }, // NW corner
      { lat: centerLat - latOffset, lng: centerLng - lngOffset }  // Close polygon
    ];
  }

  /**
   * Convert Google Maps viewport bounds to polygon coordinates
   */
  viewportToPolygon(viewport) {
    const { northeast, southwest } = viewport;

    return [
      { lat: southwest.lat, lng: southwest.lng }, // SW corner
      { lat: southwest.lat, lng: northeast.lng }, // SE corner
      { lat: northeast.lat, lng: northeast.lng }, // NE corner
      { lat: northeast.lat, lng: southwest.lng }, // NW corner
      { lat: southwest.lat, lng: southwest.lng }  // Close polygon
    ];
  }

  /**
   * Compute polygon area from coordinates using Shoelace formula
   * Returns area in square meters
   */
  computePolygonArea(polygon) {
    if (!polygon || polygon.length < 3) {
      return 0;
    }

    // Convert lat/lng to approximate meters using Haversine-based projection
    // For small areas, we can use a local tangent plane approximation
    const earthRadius = 6371000; // meters

    // Calculate centroid for reference point
    const centerLat = polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length;

    // Convert to Cartesian coordinates (meters from centroid)
    const cartesian = polygon.map(p => ({
      x: (p.lng - polygon[0].lng) * Math.PI / 180 * earthRadius * Math.cos(centerLat * Math.PI / 180),
      y: (p.lat - polygon[0].lat) * Math.PI / 180 * earthRadius
    }));

    // Shoelace formula for polygon area
    let area = 0;
    for (let i = 0; i < cartesian.length - 1; i++) {
      area += cartesian[i].x * cartesian[i + 1].y;
      area -= cartesian[i + 1].x * cartesian[i].y;
    }
    area = Math.abs(area) / 2;

    return Math.round(area); // Return area in m²
  }

  /**
   * Analyze street context using nearby roads API (via server proxy)
   */
  async analyzeStreetContext(coordinates) {
    const { lat, lng } = coordinates;

    try {
      // Use Google Places API to find nearby roads (via proxy)
      const url = `http://localhost:3001/api/google/places/nearby?location=${lat},${lng}&radius=50&type=route`;

      const response = await axios.get(url);

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const nearbyRoads = response.data.results;

        // Analyze primary road
        const primaryRoad = nearbyRoads[0];

        return {
          primaryRoad: primaryRoad.name,
          roadType: this.classifyRoadType(primaryRoad),
          orientation: this.estimateRoadOrientation(coordinates),
          curvature: 'straight', // Simplified - could be enhanced with directions API
          adjacentRoads: nearbyRoads.length - 1
        };
      }

      return this.getFallbackStreetContext();
    } catch (error) {
      console.error('Street context error:', error);
      return this.getFallbackStreetContext();
    }
  }

  /**
   * Classify road type from place data
   */
  classifyRoadType(roadData) {
    const name = roadData.name?.toLowerCase() || '';

    if (name.includes('highway') || name.includes('freeway')) {
      return 'highway';
    } else if (name.includes('avenue') || name.includes('boulevard')) {
      return 'major_street';
    } else if (name.includes('lane') || name.includes('court') || name.includes('close')) {
      return 'residential_lane';
    } else if (name.includes('street') || name.includes('road')) {
      return 'local_street';
    }

    return 'local_street';
  }

  /**
   * Estimate road orientation from coordinates
   * Returns primary cardinal direction
   */
  estimateRoadOrientation(coordinates) {
    // In a full implementation, would use Google Directions API
    // For now, return based on coordinate alignment
    return 'north_south'; // or 'east_west'
  }

  /**
   * Analyze plot characteristics from geocoding data
   * ENHANCED: Now uses actual property boundary polygon if available
   */
  analyzePlotCharacteristics(geocodeData, streetContext, propertyBoundary) {
    if (!geocodeData) {
      return this.getFallbackPlotAnalysis();
    }

    const addressComponents = geocodeData.addressComponents;

    // Determine if corner lot (has street number + intersection nearby)
    const isCornerLot = this.detectCornerLot(addressComponents, streetContext);

    // Estimate plot type from address components
    const plotType = this.estimatePlotType(addressComponents);

    let plotShape, dimensions, buildableArea;

    // NEW: Use actual polygon data if available
    if (propertyBoundary && propertyBoundary.polygon) {
      plotShape = this.detectPolygonShape(propertyBoundary.polygon);
      dimensions = this.calculatePolygonDimensions(propertyBoundary.polygon);
      buildableArea = this.calculateBuildableArea(dimensions, plotType);

      console.log(`📐 Using actual plot dimensions: ${dimensions.width}m × ${dimensions.depth}m (${propertyBoundary.area}m²)`);
    } else {
      // Fallback: Estimate plot shape
      plotShape = isCornerLot ? 'L-shaped' : 'rectangular';

      // Fallback: Estimate dimensions
      dimensions = this.estimatePlotDimensions(plotType, isCornerLot);

      // Calculate buildable area (accounting for setbacks)
      buildableArea = this.calculateBuildableArea(dimensions, plotType);

      console.log('⚠️  Using estimated plot dimensions');
    }

    return {
      plotType,
      plotShape,
      dimensions,
      isCornerLot,
      buildableArea,
      frontage: dimensions.width,
      depth: dimensions.depth
    };
  }

  /**
   * Detect polygon shape from coordinates
   * ENHANCED: Uses analyzeShapeType from propertyBoundaryService for better detection
   */
  detectPolygonShape(polygon) {
    if (!polygon || polygon.length === 0) {
      return 'rectangular';
    }

    // Use enhanced shape analysis
    const shapeType = analyzeShapeType(polygon);

    // Map to legacy shape names if needed
    const shapeMap = {
      'triangle': 'triangular',
      'rectangle': 'rectangular',
      'irregular quadrilateral': 'irregular',
      'pentagon': 'L-shaped',
      'hexagon': 'irregular',
      'polygon': 'irregular',
      'complex polygon': 'irregular'
    };

    return shapeMap[shapeType] || shapeType;
  }

  /**
   * Calculate polygon dimensions (bounding box)
   */
  calculatePolygonDimensions(polygon) {
    // Find min/max coordinates
    const lats = polygon.map(p => p.lat);
    const lngs = polygon.map(p => p.lng);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Convert to approximate meters
    const earthRadius = 6371000;
    const centerLat = (minLat + maxLat) / 2;

    const width = (maxLng - minLng) * Math.PI / 180 * earthRadius * Math.cos(centerLat * Math.PI / 180);
    const depth = (maxLat - minLat) * Math.PI / 180 * earthRadius;

    return {
      width: Math.round(width),
      depth: Math.round(depth)
    };
  }

  /**
   * Detect if plot is a corner lot
   */
  detectCornerLot(addressComponents, streetContext) {
    // Corner lots typically have multiple adjacent roads
    return streetContext.adjacentRoads >= 2;
  }

  /**
   * Estimate plot type from address
   */
  estimatePlotType(addressComponents) {
    // Look for neighborhood type indicators
    const route = addressComponents.find(c => c.types.includes('route'))?.long_name || '';
    const locality = addressComponents.find(c => c.types.includes('locality'))?.long_name || '';

    if (route.toLowerCase().includes('lane') || route.toLowerCase().includes('court')) {
      return 'suburban_residential';
    } else if (locality.includes('CBD') || locality.includes('City')) {
      return 'urban_residential';
    }

    return 'suburban_residential';
  }

  /**
   * Estimate plot dimensions based on type
   */
  estimatePlotDimensions(plotType, isCornerLot) {
    // Typical Australian residential lot dimensions
    const typicalDimensions = {
      suburban_residential: {
        width: isCornerLot ? 18 : 15, // meters
        depth: isCornerLot ? 18 : 30  // meters
      },
      urban_residential: {
        width: isCornerLot ? 12 : 10,
        depth: isCornerLot ? 15 : 20
      },
      rural_residential: {
        width: isCornerLot ? 25 : 20,
        depth: isCornerLot ? 30 : 40
      }
    };

    return typicalDimensions[plotType] || typicalDimensions.suburban_residential;
  }

  /**
   * Calculate buildable area accounting for setbacks
   */
  calculateBuildableArea(dimensions, plotType) {
    // Typical Australian setback requirements
    const setbacks = {
      suburban_residential: { front: 6, side: 1.5, rear: 3 },
      urban_residential: { front: 4, side: 1, rear: 2 },
      rural_residential: { front: 10, side: 3, rear: 5 }
    };

    const plotSetbacks = setbacks[plotType] || setbacks.suburban_residential;

    const buildableWidth = dimensions.width - (2 * plotSetbacks.side);
    const buildableDepth = dimensions.depth - (plotSetbacks.front + plotSetbacks.rear);

    return {
      width: Math.max(buildableWidth, 8), // Minimum 8m buildable width
      depth: Math.max(buildableDepth, 10), // Minimum 10m buildable depth
      area: buildableWidth * buildableDepth
    };
  }

  /**
   * Generate design constraints based on site analysis
   */
  generateDesignConstraints(plotAnalysis, geocodeData) {
    const constraints = {
      frontSetback: this.calculateSetback(plotAnalysis.plotType, 'front'),
      sideSetbacks: this.calculateSetback(plotAnalysis.plotType, 'side'),
      rearSetback: this.calculateSetback(plotAnalysis.plotType, 'rear'),
      maxBuildingHeight: this.calculateMaxHeight(plotAnalysis.plotType),
      maxSiteCoverage: this.calculateMaxSiteCoverage(plotAnalysis.plotType),
      plotRatio: this.calculateFloorAreaRatio(plotAnalysis.plotType)
    };

    // Add corner lot specific constraints
    if (plotAnalysis.isCornerLot) {
      constraints.cornerSetback = 3; // meters
      constraints.primaryFrontage = 'longest_street';
      constraints.dualAccess = true;
    }

    return constraints;
  }

  /**
   * Calculate setback requirements
   */
  calculateSetback(plotType, side) {
    const setbacks = {
      suburban_residential: { front: 6, side: 1.5, rear: 3 },
      urban_residential: { front: 4, side: 1, rear: 2 },
      rural_residential: { front: 10, side: 3, rear: 5 }
    };

    return setbacks[plotType]?.[side] || setbacks.suburban_residential[side];
  }

  /**
   * Calculate maximum building height
   */
  calculateMaxHeight(plotType) {
    const maxHeights = {
      suburban_residential: 9,  // meters (typically 2 stories)
      urban_residential: 12,    // meters (up to 3 stories)
      rural_residential: 9      // meters
    };

    return maxHeights[plotType] || 9;
  }

  /**
   * Calculate maximum site coverage
   */
  calculateMaxSiteCoverage(plotType) {
    const coverage = {
      suburban_residential: 0.5,  // 50%
      urban_residential: 0.6,     // 60%
      rural_residential: 0.3      // 30%
    };

    return coverage[plotType] || 0.5;
  }

  /**
   * Calculate floor area ratio
   */
  calculateFloorAreaRatio(plotType) {
    const far = {
      suburban_residential: 0.6,
      urban_residential: 1.0,
      rural_residential: 0.4
    };

    return far[plotType] || 0.6;
  }

  /**
   * Calculate optimal building orientation
   */
  calculateOptimalOrientation(plotAnalysis, streetContext) {
    // For corner lots, primary frontage should face longer street
    if (plotAnalysis.isCornerLot) {
      return {
        primaryFrontage: 'north', // Would be determined from actual road data
        secondaryFrontage: 'east',
        mainEntrance: 'corner_chamfer',
        reasoning: 'Corner lot - dual frontage with chamfered corner entrance'
      };
    }

    // For standard lots, orient to street
    return {
      primaryFrontage: 'north',
      mainEntrance: 'front_center',
      reasoning: 'Standard lot - central entrance on primary street frontage'
    };
  }

  /**
   * Generate site-specific recommendations
   */
  generateSiteRecommendations(plotAnalysis, streetContext) {
    const recommendations = [];

    if (plotAnalysis.isCornerLot) {
      recommendations.push('Consider chamfered corner entrance for dual street address');
      recommendations.push('Maximize street frontage with articulated facades on both streets');
      recommendations.push('Provide landscape buffer on both street frontages');
    }

    if (plotAnalysis.plotShape === 'narrow') {
      recommendations.push('Use elongated floor plan to maximize use of narrow lot');
      recommendations.push('Consider side access for vehicle parking');
      recommendations.push('Maximize natural light with skylights or high windows');
    }

    if (streetContext.roadType === 'major_street') {
      recommendations.push('Provide acoustic buffer from busy street (setback or landscaping)');
      recommendations.push('Orient living spaces away from street noise');
      recommendations.push('Consider privacy screening on street-facing facades');
    }

    return recommendations;
  }

  /**
   * Fallback site analysis when API calls fail
   */
  getFallbackSiteAnalysis(address, coordinates) {
    return {
      address: address,
      coordinates: coordinates,
      plotType: 'suburban_residential',
      plotShape: 'rectangular',
      plotDimensions: { width: 15, depth: 30 },
      streetOrientation: 'north_south',
      roadType: 'local_street',
      roadCurvature: 'straight',
      isCornerLot: false,
      constraints: {
        frontSetback: 6,
        sideSetbacks: 1.5,
        rearSetback: 3,
        maxBuildingHeight: 9,
        maxSiteCoverage: 0.5,
        plotRatio: 0.6
      },
      optimalBuildingOrientation: {
        primaryFrontage: 'north',
        mainEntrance: 'front_center',
        reasoning: 'Standard suburban lot'
      },
      buildableArea: { width: 12, depth: 21, area: 252 },
      recommendations: ['Standard rectangular lot - central entrance recommended'],
      // 🆕 plotGeometry - formatted for locationAwareDNAModifier compatibility
      plotGeometry: {
        shape: 'rectangular',
        dimensions: {
          width: 15,
          length: 30,
          area: 450
        },
        slope: 0,
        orientation: {
          primaryFrontage: 'north',
          mainEntrance: 'front_center',
          reasoning: 'Standard suburban lot'
        }
      },
      // 🆕 PlanJSON-compatible site geometry (fallback)
      siteGeometry: {
        polygon: [[0, 0], [15, 0], [15, 30], [0, 30], [0, 0]],
        width_m: 15,
        depth_m: 30,
        area_m2: 450,
        north_deg: 0, // assume north is up
        street_side: 'south',
        setbacks: {
          front_m: 6,
          rear_m: 3,
          side_m: 1.5
        }
      },
      isFallback: true
    };
  }

  getFallbackStreetContext() {
    return {
      primaryRoad: 'Local Street',
      roadType: 'local_street',
      orientation: 'north_south',
      curvature: 'straight',
      adjacentRoads: 1
    };
  }

  getFallbackPlotAnalysis() {
    return {
      plotType: 'suburban_residential',
      plotShape: 'rectangular',
      dimensions: { width: 15, depth: 30 },
      isCornerLot: false,
      buildableArea: { width: 12, depth: 21, area: 252 },
      frontage: 15,
      depth: 30
    };
  }

  /**
   * 🆕 Convert site analysis to PlanJSON-compatible SiteGeometry
   * Computes north_deg from street orientation or polygon
   * ENHANCED: Now includes detected shape type
   */
  convertToSiteGeometry(polygon, plotAnalysis, streetContext, computedArea, shapeType) {
    // Use actual polygon or generate rectangular boundary
    let sitePolygon = polygon;
    if (!sitePolygon) {
      // Generate rectangular boundary from dimensions
      const w = plotAnalysis.dimensions.width;
      const d = plotAnalysis.dimensions.depth;
      sitePolygon = [
        [0, 0],
        [w, 0],
        [w, d],
        [0, d],
        [0, 0] // close polygon
      ];
    }

    // Compute north_deg from street orientation
    let north_deg = 0;
    if (streetContext?.orientation) {
      const orientationMap = {
        'north_south': 0,
        'east_west': 90,
        'northeast_southwest': 45,
        'northwest_southeast': 315
      };
      north_deg = orientationMap[streetContext.orientation] || 0;
    } else if (polygon) {
      // Fallback: compute from longest edge of polygon
      north_deg = this.computeNorthFromPolygon(polygon);
    }

    // Determine street side (front is typically south in northern hemisphere)
    let street_side = 'south';
    if (north_deg >= 0 && north_deg < 45) street_side = 'south';
    else if (north_deg >= 45 && north_deg < 135) street_side = 'west';
    else if (north_deg >= 135 && north_deg < 225) street_side = 'north';
    else if (north_deg >= 225 && north_deg < 315) street_side = 'east';
    else street_side = 'south';

    return {
      polygon: sitePolygon,
      width_m: plotAnalysis.dimensions.width,
      depth_m: plotAnalysis.dimensions.depth,
      area_m2: computedArea || (plotAnalysis.dimensions.width * plotAnalysis.dimensions.depth),
      north_deg: north_deg,
      street_side: street_side,
      shape_type: shapeType || this.detectPolygonShape(polygon),
      setbacks: {
        front_m: 6,
        rear_m: 3,
        side_m: 1.5
      }
    };
  }

  /**
   * Compute north direction from polygon orientation
   * Uses longest edge as presumed street frontage
   */
  computeNorthFromPolygon(polygon) {
    if (!polygon || polygon.length < 2) return 0;

    let maxLength = 0;
    let longestEdgeAngle = 0;

    for (let i = 0; i < polygon.length - 1; i++) {
      const dx = polygon[i + 1][0] - polygon[i][0];
      const dy = polygon[i + 1][1] - polygon[i][1];
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length > maxLength) {
        maxLength = length;
        // Calculate angle in degrees (0 = north, 90 = east)
        longestEdgeAngle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      }
    }

    return longestEdgeAngle;
  }
}

// Export singleton
export default new SiteAnalysisService();
