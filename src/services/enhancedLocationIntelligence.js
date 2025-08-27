// src/services/enhancedLocationIntelligence.js

// Provides functions to fetch authoritative zoning and planning data from official sources for the UK.

export const enhancedLocationIntelligence = {
  /**
   * Get authoritative UK planning data for a given coordinate.
   * @param {string} address - Full address string (for context, not used in API call).
   * @param {{ lat: number, lng: number }} coords - Latitude and longitude.
   * @returns {Promise<{zoning: any, designGuidelines: any, dataQuality: string, citations: string[]}>}
   */
  async getAuthorativeZoningData(address, coords) {
    const { lat, lng: lon } = coords || {}; // Use lon to match the API parameter
    let zoningInfo = null;
    let designGuidelines = null;
    let citations = [];
    let dataQuality = 'unknown';

    try {
      // Use the proxy to fetch UK planning constraints
      const url = `/api/proxy-planning?lat=${lat}&lon=${lon}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`API request failed with status ${resp.status}`);
      }
      const data = await resp.json();

      // Enhanced parsing of UK planning constraints
      const zoneTypes = new Set();
      const notes = new Set();
      const characteristics = new Set();
      const materials = new Set();

      const constraintMappings = {
        'conservation area': { type: 'Conservation Area', note: 'Subject to special planning controls.', chars: ['Historic character preservation'], mats: ['Traditional materials'] },
        'listed building': { type: 'Listed Building', note: 'Alterations are heavily restricted.', chars: ['Protected heritage asset'], mats: ['Original materials must be preserved'] },
        'tree preservation order': { type: 'TPO', note: 'Contains protected trees.', chars: ['Development must accommodate trees'], mats: [] },
        'green belt': { type: 'Green Belt', note: 'Strong restrictions on new development.', chars: ['Preservation of openness'], mats: [] },
        'area of outstanding natural beauty': { type: 'AONB', note: 'Development must conserve natural beauty.', chars: ['High scenic quality'], mats: ['Natural and local materials'] },
        'national park': { type: 'National Park', note: 'Strict development policies apply.', chars: ['Conservation of wildlife and heritage'], mats: ['Locally sourced materials'] },
        'site of special scientific interest': { type: 'SSSI', note: 'Development restricted to protect biological/geological features.', chars: ['Protected wildlife habitats'], mats: [] },
        'flood zone 2': { type: 'Flood Zone 2', note: 'Medium probability of flooding.', chars: ['Flood risk assessment required'], mats: ['Water-resistant materials'] },
        'flood zone 3': { type: 'Flood Zone 3', note: 'High probability of flooding.', chars: ['Resilient construction required'], mats: ['Water-resistant materials'] },
      };

      if (data && Array.isArray(data.features)) {
        for (const feature of data.features) {
          const constraintName = (feature.properties?.name || '').toLowerCase();
          let matched = false;
          for (const [key, value] of Object.entries(constraintMappings)) {
            if (constraintName.includes(key)) {
              zoneTypes.add(value.type);
              notes.add(value.note);
              value.chars.forEach(c => characteristics.add(c));
              value.mats.forEach(m => materials.add(m));
              matched = true;
            }
          }
          if (!matched && feature.properties?.name) {
             characteristics.add(feature.properties.name); // Add unknown constraints to characteristics
          }
        }
      }

      let finalZoneType = 'Standard Regulations';
      if (zoneTypes.size > 0) {
        finalZoneType = [...zoneTypes].join(', ');
      } else if (data?.features?.length > 0) {
        finalZoneType = 'Area with Planning Constraints';
      }

      zoningInfo = {
        type: finalZoneType,
        note: [...notes].join(' ') || null,
        maxHeight: null,      // UK constraints API doesn’t supply this directly
        density: null,
        setbacks: null,
        characteristics: [...characteristics].join('. ') || null,
        materials: [...materials].join(', ') || null,
        raw: data, // Keep raw data for debugging if needed
      };
      designGuidelines = [
        'Respect local planning constraints',
        'Preserve historic character where applicable'
      ];
      dataQuality = 'high';
      citations.push('UK Planning Data Portal. Contains public sector information licensed under OGL v3.0');

    } catch (error) {
      console.error('Error fetching zoning data', error);
      dataQuality = 'low';
      zoningInfo = null;
      designGuidelines = null;
    }

    return {
      zoning: zoningInfo,
      designGuidelines,
      dataQuality,
      citations,
    };
  },
};
