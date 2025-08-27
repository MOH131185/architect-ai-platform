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
      // Fetch UK planning constraints near the coordinate
      const url = `https://planning.data.gov.uk/api/v1/constraints?lat=${lat}&lon=${lng}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`API request failed with status ${resp.status}`);
      }
      const json = await resp.json();
      zoningInfo = json;
      designGuidelines = json;
      dataQuality = 'high';
      citations.push(
        'UK Planning Data Portal. Contains public sector information licensed under OGL v3.0'
      );
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
