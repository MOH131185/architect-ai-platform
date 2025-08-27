import { enhancedLocationIntelligence } from './enhancedLocationIntelligence';

describe('enhancedLocationIntelligence', () => {
  describe('getAuthorativeZoningData', () => {
    beforeEach(() => {
      jest.spyOn(window, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          features: [{ properties: { name: 'Conservation Area' } }],
        }),
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should fetch zoning data for UK coordinates', async () => {
      const address = '10 Downing Street, London, UK';
      const coords = { lat: 51.5034, lng: -0.1278 }; // UK coordinates

      // Mock the fetch call to the proxy
      window.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([
          { label: 'Conservation Area' }
        ]),
      });

      const result = await enhancedLocationIntelligence.getAuthorativeZoningData(address, coords);

      expect(window.fetch).toHaveBeenCalledWith(
        `/api/proxy-planning?lat=${coords.lat}&lon=${coords.lng}`
      );
      expect(result.dataQuality).toBe('high');
      expect(result.zoning.type).toBe('Conservation Area');
      expect(result.citations).toContain(
        'UK Planning Data Portal. Contains public sector information licensed under OGL v3.0'
      );
    });


    it('should handle API errors gracefully', async () => {
      window.fetch.mockRejectedValue(new Error('API Error'));

      const address = '10 Downing Street, London, UK';
      const coords = { lat: 51.5034, lng: -0.1278 };

      const result = await enhancedLocationIntelligence.getAuthorativeZoningData(address, coords);

      expect(result.dataQuality).toBe('low');
      expect(result.zoning).toBeNull();
      expect(result.designGuidelines).toBeNull();
    });
  });
});
