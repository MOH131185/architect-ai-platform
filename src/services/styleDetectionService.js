/**
 * Local Architecture Style Detection Service
 * Uses Google Street View/Satellite imagery + Deep Learning (Mask R-CNN/Faster R-CNN)
 * for building footprint detection and architectural style classification
 */

// Import architectural database for style cross-referencing
import { architecturalStyleService } from '../data/globalArchitecturalDatabase';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

class StyleDetectionService {
  constructor() {
    this.apiKey = GOOGLE_MAPS_API_KEY;
    // Deep learning model endpoint (to be configured)
    this.mlEndpoint = process.env.REACT_APP_ML_ENDPOINT || null;
  }

  /**
   * Complete local architecture style detection workflow
   * @param {Object} location - Location data with coordinates and address
   * @returns {Promise<Object>} Detected styles, building footprints, and design elements
   */
  async detectLocalArchitectureStyle(location) {
    try {
      console.log('Starting local architecture style detection...');

      // Step 2.1: Download representative imagery
      const imagery = await this.downloadRepresentativeImagery(location);

      // Step 2.2: Apply deep-learning models for style classification and footprint detection
      const mlAnalysis = await this.applyDeepLearningModels(imagery, location);

      // Step 2.3: Cross-reference with globalArchitecturalDatabase
      const styleProfile = await this.crossReferenceWithDatabase(
        mlAnalysis,
        location
      );

      return {
        success: true,
        imagery,
        mlAnalysis,
        styleProfile,
        timestamp: new Date().toISOString(),
        source: 'deep-learning-style-detection'
      };

    } catch (error) {
      console.error('Style detection error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackStyleDetection(location)
      };
    }
  }

  /**
   * Step 2.1: Download representative imagery from Google APIs
   */
  async downloadRepresentativeImagery(location) {
    try {
      const { coordinates, addressComponents } = location;
      const { lat, lng } = coordinates;

      console.log('Downloading Street View and satellite imagery...');

      // Get Street View imagery (4 directions: N, S, E, W + aerial)
      const streetViewImages = await this.getStreetViewImages(lat, lng);

      // Get satellite imagery
      const satelliteImage = await this.getSatelliteImage(lat, lng);

      // Get nearby building context (panoramic view)
      const contextImages = await this.getContextImages(lat, lng);

      return {
        streetView: streetViewImages,
        satellite: satelliteImage,
        context: contextImages,
        location: { lat, lng },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Imagery download error:', error);
      throw new Error(`Failed to download imagery: ${error.message}`);
    }
  }

  /**
   * Get Google Street View images from multiple angles
   */
  async getStreetViewImages(lat, lng) {
    const images = [];
    const headings = [0, 90, 180, 270]; // N, E, S, W
    const size = '640x640'; // High resolution
    const fov = 90; // Field of view
    const pitch = 0; // Horizontal view

    for (const heading of headings) {
      const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${this.apiKey}`;

      // Check if Street View is available at this location
      const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${this.apiKey}`;

      try {
        const metadataResponse = await fetch(metadataUrl);
        const metadata = await metadataResponse.json();

        if (metadata.status === 'OK') {
          images.push({
            url,
            heading,
            direction: this.getDirectionName(heading),
            available: true,
            panoId: metadata.pano_id,
            location: metadata.location
          });
        } else {
          images.push({
            url: null,
            heading,
            direction: this.getDirectionName(heading),
            available: false,
            note: 'Street View not available at this angle'
          });
        }
      } catch (error) {
        console.error(`Street View metadata error for heading ${heading}:`, error);
        images.push({
          url: null,
          heading,
          direction: this.getDirectionName(heading),
          available: false,
          error: error.message
        });
      }
    }

    return images;
  }

  /**
   * Get satellite imagery from Google Static Maps API
   */
  async getSatelliteImage(lat, lng) {
    const zoom = 19; // High zoom for building detail
    const size = '640x640';
    const maptype = 'satellite';

    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&maptype=${maptype}&key=${this.apiKey}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Satellite image fetch failed: ${response.status}`);
      }

      return {
        url,
        zoom,
        mapType: 'satellite',
        available: true,
        resolution: size
      };

    } catch (error) {
      console.error('Satellite image error:', error);
      return {
        url: null,
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Get context images (nearby buildings for style analysis)
   */
  async getContextImages(lat, lng) {
    // Get Street View images from nearby locations (50m radius in 4 directions)
    const radius = 0.0005; // ~50 meters in degrees
    const contextLocations = [
      { lat: lat + radius, lng, direction: 'North' },
      { lat, lng: lng + radius, direction: 'East' },
      { lat: lat - radius, lng, direction: 'South' },
      { lat, lng: lng - radius, direction: 'West' }
    ];

    const contextImages = [];

    for (const loc of contextLocations) {
      const url = `https://maps.googleapis.com/maps/api/streetview?size=640x640&location=${loc.lat},${loc.lng}&heading=0&pitch=0&fov=90&key=${this.apiKey}`;

      const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc.lat},${loc.lng}&key=${this.apiKey}`;

      try {
        const metadataResponse = await fetch(metadataUrl);
        const metadata = await metadataResponse.json();

        if (metadata.status === 'OK') {
          contextImages.push({
            url,
            direction: loc.direction,
            location: loc,
            available: true,
            panoId: metadata.pano_id
          });
        }
      } catch (error) {
        console.error(`Context image error for ${loc.direction}:`, error);
      }
    }

    return contextImages;
  }

  /**
   * Step 2.2: Apply deep-learning models (Mask R-CNN / Faster R-CNN)
   */
  async applyDeepLearningModels(imagery, location) {
    try {
      console.log('Applying deep-learning models for style classification...');

      // Check if ML endpoint is configured
      if (!this.mlEndpoint) {
        console.warn('ML endpoint not configured, using rule-based fallback');
        return this.getRuleBasedStyleAnalysis(imagery, location);
      }

      // Prepare images for ML model
      const imageUrls = this.prepareImagesForML(imagery);

      // Call ML endpoint (Mask R-CNN / Faster R-CNN service)
      const mlResponse = await fetch(this.mlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          images: imageUrls,
          tasks: ['style_classification', 'building_footprint_detection'],
          location: location.coordinates
        })
      });

      if (!mlResponse.ok) {
        throw new Error(`ML endpoint error: ${mlResponse.status}`);
      }

      const mlResults = await mlResponse.json();

      return {
        detectedStyles: mlResults.styles || [],
        buildingFootprints: mlResults.footprints || [],
        confidence: mlResults.confidence || {},
        materials: mlResults.materials || [],
        designElements: mlResults.design_elements || [],
        source: 'deep-learning-model',
        modelType: mlResults.model_type || 'Mask R-CNN',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Deep learning model error:', error);
      // Fallback to rule-based analysis
      return this.getRuleBasedStyleAnalysis(imagery, location);
    }
  }

  /**
   * Prepare images for ML model input
   */
  prepareImagesForML(imagery) {
    const imageUrls = [];

    // Add available Street View images
    if (imagery.streetView) {
      imagery.streetView.forEach(img => {
        if (img.available && img.url) {
          imageUrls.push({
            url: img.url,
            type: 'street_view',
            direction: img.direction
          });
        }
      });
    }

    // Add satellite image
    if (imagery.satellite?.available) {
      imageUrls.push({
        url: imagery.satellite.url,
        type: 'satellite',
        zoom: imagery.satellite.zoom
      });
    }

    // Add context images
    if (imagery.context) {
      imagery.context.forEach(img => {
        if (img.available && img.url) {
          imageUrls.push({
            url: img.url,
            type: 'context',
            direction: img.direction
          });
        }
      });
    }

    return imageUrls;
  }

  /**
   * Rule-based style analysis (fallback when ML endpoint unavailable)
   */
  getRuleBasedStyleAnalysis(imagery, location) {
    console.log('Using rule-based style analysis (ML endpoint unavailable)');

    // Use location data to infer likely styles
    const { addressComponents, coordinates } = location;
    const country = addressComponents?.country || 'Unknown';
    const city = addressComponents?.locality || 'Unknown';

    // Get styles from database based on location
    const locationStyles = architecturalStyleService.getStylesByLocation(
      country,
      addressComponents?.adminAreaLevel1 || '',
      city,
      addressComponents?.postalCode || ''
    );

    return {
      detectedStyles: [
        {
          style: locationStyles.styles?.contemporary?.[0] || 'Contemporary',
          confidence: 0.6,
          source: 'location-based-inference'
        },
        {
          style: locationStyles.styles?.historical?.[0] || 'Traditional',
          confidence: 0.4,
          source: 'location-based-inference'
        }
      ],
      buildingFootprints: [
        {
          area: null,
          shape: 'rectangular',
          note: 'Footprint detection requires ML model',
          confidence: null
        }
      ],
      materials: locationStyles.materials || ['Brick', 'Concrete', 'Glass'],
      designElements: locationStyles.characteristics || [],
      source: 'rule-based-fallback',
      note: 'ML endpoint not configured. Install and configure ML service for accurate detection.',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Step 2.3: Cross-reference with globalArchitecturalDatabase
   */
  async crossReferenceWithDatabase(mlAnalysis, location) {
    try {
      console.log('Cross-referencing detected styles with architectural database...');

      const { addressComponents, coordinates } = location;
      const country = addressComponents?.country || '';
      const state = addressComponents?.adminAreaLevel1 || '';
      const city = addressComponents?.locality || '';

      // Get database styles for this location
      const databaseStyles = architecturalStyleService.getStylesByLocation(
        country,
        state,
        city,
        addressComponents?.postalCode || ''
      );

      // Extract detected styles from ML analysis
      const detectedStyleNames = mlAnalysis.detectedStyles.map(s => s.style);

      // Find matches between detected and database styles
      const matchedStyles = this.findStyleMatches(
        detectedStyleNames,
        databaseStyles
      );

      // Combine materials from ML and database
      const combinedMaterials = this.combineMaterials(
        mlAnalysis.materials,
        databaseStyles.materials
      );

      // Combine design elements
      const combinedDesignElements = this.combineDesignElements(
        mlAnalysis.designElements,
        databaseStyles.characteristics
      );

      return {
        primaryLocalStyles: matchedStyles.primary,
        secondaryLocalStyles: matchedStyles.secondary,
        materials: combinedMaterials,
        designElements: combinedDesignElements,
        buildingFootprints: mlAnalysis.buildingFootprints,
        styleBlendingRecommendations: this.generateBlendingRecommendations(
          matchedStyles,
          combinedMaterials
        ),
        confidence: this.calculateOverallConfidence(mlAnalysis, matchedStyles),
        source: 'cross-referenced',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Cross-reference error:', error);
      throw new Error(`Style cross-reference failed: ${error.message}`);
    }
  }

  /**
   * Find matches between detected styles and database styles
   */
  findStyleMatches(detectedStyles, databaseStyles) {
    const matches = {
      primary: [],
      secondary: []
    };

    const allDatabaseStyles = [
      ...(databaseStyles.styles?.contemporary || []),
      ...(databaseStyles.styles?.historical || []),
      ...(databaseStyles.styles?.vernacular || [])
    ];

    detectedStyles.forEach(detectedStyle => {
      const normalized = detectedStyle.toLowerCase();

      // Look for exact or partial matches
      const exactMatch = allDatabaseStyles.find(dbStyle =>
        dbStyle.toLowerCase() === normalized
      );

      if (exactMatch) {
        matches.primary.push(exactMatch);
      } else {
        // Look for partial matches
        const partialMatch = allDatabaseStyles.find(dbStyle =>
          dbStyle.toLowerCase().includes(normalized) ||
          normalized.includes(dbStyle.toLowerCase())
        );

        if (partialMatch) {
          matches.secondary.push(partialMatch);
        }
      }
    });

    // If no matches, use top database styles
    if (matches.primary.length === 0 && matches.secondary.length === 0) {
      matches.primary = databaseStyles.styles?.contemporary?.slice(0, 2) || [];
      matches.secondary = databaseStyles.styles?.historical?.slice(0, 2) || [];
    }

    return matches;
  }

  /**
   * Combine materials from ML and database
   */
  combineMaterials(mlMaterials, dbMaterials) {
    const allMaterials = [...(mlMaterials || []), ...(dbMaterials || [])];

    // Remove duplicates (case-insensitive)
    const uniqueMaterials = [];
    const seen = new Set();

    allMaterials.forEach(material => {
      const normalized = material.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueMaterials.push(material);
      }
    });

    return uniqueMaterials.slice(0, 10); // Limit to top 10 materials
  }

  /**
   * Combine design elements from ML and database
   */
  combineDesignElements(mlElements, dbElements) {
    const allElements = [...(mlElements || []), ...(dbElements || [])];

    // Remove duplicates
    const uniqueElements = [...new Set(allElements)];

    return uniqueElements.slice(0, 15); // Limit to top 15 elements
  }

  /**
   * Generate style blending recommendations
   */
  generateBlendingRecommendations(matchedStyles, materials) {
    const recommendations = [];

    if (matchedStyles.primary.length > 0) {
      recommendations.push({
        strategy: 'Local Style Adaptation',
        primaryStyle: matchedStyles.primary[0],
        description: `Adopt ${matchedStyles.primary[0]} as primary architectural language to harmonize with local context`,
        materials: materials.slice(0, 3),
        confidence: 'High'
      });
    }

    if (matchedStyles.secondary.length > 0) {
      recommendations.push({
        strategy: 'Hybrid Approach',
        styles: [matchedStyles.primary[0], matchedStyles.secondary[0]],
        description: `Blend ${matchedStyles.primary[0]} massing with ${matchedStyles.secondary[0]} detailing for contextual innovation`,
        materials: materials.slice(0, 5),
        confidence: 'Medium'
      });
    }

    recommendations.push({
      strategy: 'Contemporary Interpretation',
      description: 'Use local materials and proportions in a contemporary design vocabulary',
      materials: materials.slice(0, 4),
      note: 'Balances innovation with contextual sensitivity',
      confidence: 'Medium-High'
    });

    return recommendations;
  }

  /**
   * Calculate overall confidence score
   */
  calculateOverallConfidence(mlAnalysis, matchedStyles) {
    let confidence = 0;
    let factors = 0;

    // ML detection confidence
    if (mlAnalysis.confidence?.overall) {
      confidence += mlAnalysis.confidence.overall;
      factors++;
    }

    // Style match confidence
    if (matchedStyles.primary.length > 0) {
      confidence += 0.8;
      factors++;
    } else if (matchedStyles.secondary.length > 0) {
      confidence += 0.5;
      factors++;
    }

    // Building footprint confidence
    if (mlAnalysis.buildingFootprints.length > 0) {
      const footprintConf = mlAnalysis.buildingFootprints[0].confidence || 0.5;
      confidence += footprintConf;
      factors++;
    }

    const avgConfidence = factors > 0 ? confidence / factors : 0.5;

    return {
      overall: (avgConfidence * 100).toFixed(0) + '%',
      styleDetection: mlAnalysis.source === 'deep-learning-model' ? 'High' : 'Medium',
      databaseMatch: matchedStyles.primary.length > 0 ? 'High' : 'Medium',
      note: mlAnalysis.source === 'rule-based-fallback' ? 'Confidence limited without ML model' : 'ML-enhanced detection'
    };
  }

  /**
   * Helper: Get direction name from heading
   */
  getDirectionName(heading) {
    if (heading >= 337.5 || heading < 22.5) return 'North';
    if (heading >= 22.5 && heading < 67.5) return 'Northeast';
    if (heading >= 67.5 && heading < 112.5) return 'East';
    if (heading >= 112.5 && heading < 157.5) return 'Southeast';
    if (heading >= 157.5 && heading < 202.5) return 'South';
    if (heading >= 202.5 && heading < 247.5) return 'Southwest';
    if (heading >= 247.5 && heading < 292.5) return 'West';
    if (heading >= 292.5 && heading < 337.5) return 'Northwest';
    return 'Unknown';
  }

  /**
   * Fallback style detection when service unavailable
   */
  getFallbackStyleDetection(location) {
    const { addressComponents } = location;

    return {
      success: false,
      styleProfile: {
        primaryLocalStyles: ['Contemporary'],
        secondaryLocalStyles: ['Traditional'],
        materials: ['Brick', 'Concrete', 'Glass'],
        designElements: ['Modern facade', 'Energy efficient'],
        styleBlendingRecommendations: [
          {
            strategy: 'Contemporary Approach',
            description: 'Modern design with local materials',
            confidence: 'Low'
          }
        ]
      },
      note: 'Style detection unavailable - using fallback',
      isFallback: true
    };
  }
}

export default new StyleDetectionService();
