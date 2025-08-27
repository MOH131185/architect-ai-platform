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
    const { lat, lng } = coords || {};
    let zoningInfo = null;
    let designGuidelines = null;
    let citations = [];
    let dataQuality = 'unknown';

    try {
      // Use the proxy to fetch UK planning constraints
      const url = `/api/proxy-planning?lat=${lat}&lon=${lng}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`API request failed with status ${resp.status}`);
      }
      const data = await resp.json();

      // Simplify constraints into the fields your UI expects
      let zoneType = 'Unknown';
      let note = '';
      let characteristics = [];
      let materials = [];

      if (Array.isArray(data)) {
        for (const item of data) {
          const label = (item.label || item.name || '').toLowerCase();
          if (label.includes('conservation')) {
            zoneType = 'Conservation Area';
            note = 'Within a designated conservation area';
            characteristics.push('Historic character');
          } else if (label.includes('listed')) {
            zoneType = 'Listed Building';
            note = 'Property is a listed building';
            characteristics.push('Protected heritage building');
            materials.push('Traditional stone/brick');
          } else if (label.includes('tree preservation') || label.includes('tpo')) {
            characteristics.push('Tree preservation order');
          }
        }
      }

      zoningInfo = {
        type: zoneType,
        note: note || null,
        maxHeight: null,      // UK constraints API doesn’t supply this directly
        density: null,
        setbacks: null,
        characteristics: characteristics.length ? characteristics.join(', ') : null,
        materials: materials.length ? materials.join(', ') : null,
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
