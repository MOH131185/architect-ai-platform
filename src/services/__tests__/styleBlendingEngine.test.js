/**
 * Unit Tests for styleBlendingEngine Service
 *
 * Tests architectural style blending including:
 * - Portfolio analysis and style extraction
 * - Local style detection
 * - Adaptive blending algorithm
 * - Style confidence scoring
 * - Fallback mechanisms
 */

import styleBlendingEngine from '../styleBlendingEngine';

describe('styleBlendingEngine', () => {
  describe('analyzePortfolioStyle', () => {
    const mockPortfolioFiles = [
      { name: 'modern-house.jpg', type: 'image/jpeg' },
      { name: 'contemporary-office.jpg', type: 'image/jpeg' },
      { name: 'minimalist-clinic.jpg', type: 'image/jpeg' }
    ];

    test('should analyze portfolio and extract dominant style', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(mockPortfolioFiles);

      expect(result).toHaveProperty('dominantStyle');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('characteristics');
      expect(result).toHaveProperty('styleBreakdown');

      expect(typeof result.dominantStyle).toBe('string');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('should identify modern/contemporary style', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(mockPortfolioFiles);

      expect(['modern', 'contemporary', 'minimalist']).toContain(
        result.dominantStyle.toLowerCase()
      );
    });

    test('should provide style characteristics', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(mockPortfolioFiles);

      expect(result.characteristics).toBeInstanceOf(Array);
      expect(result.characteristics.length).toBeGreaterThan(0);
      expect(result.characteristics).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/clean|geometric|minimal|linear/i)
        ])
      );
    });

    test('should calculate style breakdown percentages', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(mockPortfolioFiles);

      expect(result.styleBreakdown).toBeDefined();
      expect(typeof result.styleBreakdown).toBe('object');

      // Percentages should sum to approximately 100
      const total = Object.values(result.styleBreakdown).reduce((sum, val) => sum + val, 0);
      expect(total).toBeCloseTo(100, 0);
    });

    test('should handle empty portfolio gracefully', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle([]);

      expect(result).toHaveProperty('dominantStyle');
      expect(result.dominantStyle).toBe('Contemporary');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.isFallback).toBe(true);
    });

    test('should handle single image portfolio', async () => {
      const singleFile = [{ name: 'single-design.jpg', type: 'image/jpeg' }];
      const result = await styleBlendingEngine.analyzePortfolioStyle(singleFile);

      expect(result).toHaveProperty('dominantStyle');
      expect(result.confidence).toBeLessThan(1);
    });

    test('should extract color palette', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(mockPortfolioFiles);

      expect(result).toHaveProperty('colorPalette');
      expect(result.colorPalette).toBeInstanceOf(Array);
      expect(result.colorPalette.length).toBeGreaterThan(0);
    });

    test('should identify material preferences', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(mockPortfolioFiles);

      expect(result).toHaveProperty('materialPreferences');
      expect(result.materialPreferences).toBeInstanceOf(Array);
      expect(result.materialPreferences).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/glass|steel|concrete|wood|brick/i)
        ])
      );
    });
  });

  describe('blendStyles', () => {
    const mockPortfolioStyle = {
      dominantStyle: 'Modern',
      confidence: 0.85,
      characteristics: ['clean lines', 'geometric forms', 'minimal ornamentation'],
      materialPreferences: ['glass', 'steel', 'concrete']
    };

    const mockLocalStyles = [
      { style: 'Victorian', prevalence: 'high', characteristics: ['ornate', 'pitched roofs'] },
      { style: 'Georgian', prevalence: 'medium', characteristics: ['symmetrical', 'brick'] }
    ];

    test('should blend portfolio and local styles', () => {
      const result = styleBlendingEngine.blendStyles(
        mockPortfolioStyle,
        mockLocalStyles,
        { zoning: { type: 'residential' } }
      );

      expect(result).toHaveProperty('blendedStyle');
      expect(result).toHaveProperty('primaryInfluence');
      expect(result).toHaveProperty('secondaryInfluence');
      expect(result).toHaveProperty('blendRatio');
      expect(result).toHaveProperty('designPrinciples');
    });

    test('should prioritize portfolio style with high confidence', () => {
      const highConfidencePortfolio = { ...mockPortfolioStyle, confidence: 0.9 };
      const result = styleBlendingEngine.blendStyles(
        highConfidencePortfolio,
        mockLocalStyles,
        {}
      );

      expect(result.primaryInfluence).toBe('portfolio');
      expect(result.blendRatio.portfolio).toBeGreaterThan(result.blendRatio.local);
    });

    test('should prioritize local style with low portfolio confidence', () => {
      const lowConfidencePortfolio = { ...mockPortfolioStyle, confidence: 0.3 };
      const result = styleBlendingEngine.blendStyles(
        lowConfidencePortfolio,
        mockLocalStyles,
        {}
      );

      expect(result.primaryInfluence).toBe('local');
      expect(result.blendRatio.local).toBeGreaterThanOrEqual(result.blendRatio.portfolio);
    });

    test('should provide design principles for blended style', () => {
      const result = styleBlendingEngine.blendStyles(
        mockPortfolioStyle,
        mockLocalStyles,
        {}
      );

      expect(result.designPrinciples).toBeInstanceOf(Array);
      expect(result.designPrinciples.length).toBeGreaterThan(0);
      expect(result.designPrinciples).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/.+/)
        ])
      );
    });

    test('should blend material recommendations', () => {
      const result = styleBlendingEngine.blendStyles(
        mockPortfolioStyle,
        mockLocalStyles,
        {}
      );

      expect(result).toHaveProperty('recommendedMaterials');
      expect(result.recommendedMaterials).toBeInstanceOf(Array);
      expect(result.recommendedMaterials.length).toBeGreaterThan(0);
    });

    test('should consider zoning constraints in blending', () => {
      const conservationContext = {
        zoning: { type: 'conservation_area', restrictions: 'strict heritage controls' }
      };

      const result = styleBlendingEngine.blendStyles(
        mockPortfolioStyle,
        mockLocalStyles,
        conservationContext
      );

      // Should lean more towards local style in conservation areas
      expect(result.blendRatio.local).toBeGreaterThan(0.3);
    });

    test('should handle missing local styles gracefully', () => {
      const result = styleBlendingEngine.blendStyles(
        mockPortfolioStyle,
        [],
        {}
      );

      expect(result).toBeDefined();
      expect(result.primaryInfluence).toBe('portfolio');
      expect(result.blendRatio.portfolio).toBeGreaterThan(0.8);
    });

    test('should create balanced blend with medium confidence', () => {
      const mediumConfidencePortfolio = { ...mockPortfolioStyle, confidence: 0.6 };
      const result = styleBlendingEngine.blendStyles(
        mediumConfidencePortfolio,
        mockLocalStyles,
        {}
      );

      expect(result.blendRatio.portfolio).toBeGreaterThan(0.4);
      expect(result.blendRatio.portfolio).toBeLessThan(0.8);
      expect(result.blendRatio.local).toBeGreaterThan(0.2);
    });
  });

  describe('detectLocalStyles', () => {
    test('should detect styles from location data', () => {
      const locationData = {
        address: '123 Victorian Street, London, UK',
        coordinates: { lat: 51.5074, lng: -0.1278 }
      };

      const result = styleBlendingEngine.detectLocalStyles(locationData);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('style');
      expect(result[0]).toHaveProperty('prevalence');
      expect(result[0]).toHaveProperty('characteristics');
    });

    test('should detect UK regional styles correctly', () => {
      const ukLocation = {
        address: 'Bath, UK',
        coordinates: { lat: 51.3758, lng: -2.3599 }
      };

      const result = styleBlendingEngine.detectLocalStyles(ukLocation);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            style: expect.stringMatching(/Georgian|Bath Stone|Regency/i)
          })
        ])
      );
    });

    test('should detect US regional styles correctly', () => {
      const usLocation = {
        address: 'San Francisco, CA, USA',
        coordinates: { lat: 37.7749, lng: -122.4194 }
      };

      const result = styleBlendingEngine.detectLocalStyles(usLocation);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            style: expect.stringMatching(/Victorian|Bay Area|Craftsman/i)
          })
        ])
      );
    });

    test('should detect European styles correctly', () => {
      const europeLocation = {
        address: 'Paris, France',
        coordinates: { lat: 48.8566, lng: 2.3522 }
      };

      const result = styleBlendingEngine.detectLocalStyles(europeLocation);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            style: expect.stringMatching(/Haussmann|Parisian|French/i)
          })
        ])
      );
    });

    test('should detect Asian styles correctly', () => {
      const asiaLocation = {
        address: 'Tokyo, Japan',
        coordinates: { lat: 35.6762, lng: 139.6503 }
      };

      const result = styleBlendingEngine.detectLocalStyles(asiaLocation);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            style: expect.stringMatching(/Japanese|Contemporary|Modern/i)
          })
        ])
      );
    });

    test('should handle unknown locations with default styles', () => {
      const unknownLocation = {
        address: 'Unknown Location',
        coordinates: { lat: 0, lng: 0 }
      };

      const result = styleBlendingEngine.detectLocalStyles(unknownLocation);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('style', 'Contemporary');
    });

    test('should rank styles by prevalence', () => {
      const location = {
        address: 'London, UK',
        coordinates: { lat: 51.5074, lng: -0.1278 }
      };

      const result = styleBlendingEngine.detectLocalStyles(location);

      // Should have prevalence rankings
      expect(result[0]).toHaveProperty('prevalence');
      expect(['high', 'medium', 'low']).toContain(result[0].prevalence);
    });
  });

  describe('style confidence scoring', () => {
    test('should score confidence based on portfolio consistency', async () => {
      const consistentPortfolio = [
        { name: 'modern1.jpg', type: 'image/jpeg' },
        { name: 'modern2.jpg', type: 'image/jpeg' },
        { name: 'modern3.jpg', type: 'image/jpeg' }
      ];

      const result = await styleBlendingEngine.analyzePortfolioStyle(consistentPortfolio);

      expect(result.confidence).toBeGreaterThan(0.6);
    });

    test('should lower confidence for mixed styles', async () => {
      const mixedPortfolio = [
        { name: 'modern.jpg', type: 'image/jpeg' },
        { name: 'victorian.jpg', type: 'image/jpeg' },
        { name: 'brutalist.jpg', type: 'image/jpeg' }
      ];

      const result = await styleBlendingEngine.analyzePortfolioStyle(mixedPortfolio);

      expect(result.confidence).toBeLessThan(0.8);
    });

    test('should provide confidence breakdown by style', async () => {
      const portfolio = [
        { name: 'design1.jpg', type: 'image/jpeg' },
        { name: 'design2.jpg', type: 'image/jpeg' }
      ];

      const result = await styleBlendingEngine.analyzePortfolioStyle(portfolio);

      expect(result).toHaveProperty('confidenceBreakdown');
      expect(typeof result.confidenceBreakdown).toBe('object');
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle null portfolio files', async () => {
      const result = await styleBlendingEngine.analyzePortfolioStyle(null);

      expect(result).toBeDefined();
      expect(result.isFallback).toBe(true);
    });

    test('should handle undefined location data', () => {
      const result = styleBlendingEngine.detectLocalStyles(undefined);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle invalid image files', async () => {
      const invalidFiles = [
        { name: 'not-an-image.txt', type: 'text/plain' }
      ];

      const result = await styleBlendingEngine.analyzePortfolioStyle(invalidFiles);

      expect(result).toBeDefined();
      expect(result.isFallback).toBe(true);
    });

    test('should handle missing coordinates', () => {
      const location = {
        address: 'Test Address'
      };

      const result = styleBlendingEngine.detectLocalStyles(location);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle extremely large portfolios', async () => {
      const largePortfolio = Array(100).fill({ name: 'design.jpg', type: 'image/jpeg' });

      const result = await styleBlendingEngine.analyzePortfolioStyle(largePortfolio);

      expect(result).toBeDefined();
      expect(result.dominantStyle).toBeDefined();
    });
  });

  describe('style recommendation quality', () => {
    test('should provide actionable design principles', () => {
      const mockPortfolio = {
        dominantStyle: 'Minimalist',
        confidence: 0.8,
        characteristics: ['simple', 'functional']
      };

      const mockLocal = [
        { style: 'Traditional', prevalence: 'high' }
      ];

      const result = styleBlendingEngine.blendStyles(mockPortfolio, mockLocal, {});

      expect(result.designPrinciples).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/\w{10,}/) // Principles should be descriptive
        ])
      );
    });

    test('should recommend contextually appropriate materials', () => {
      const mockPortfolio = {
        dominantStyle: 'Industrial',
        confidence: 0.75,
        materialPreferences: ['steel', 'exposed brick', 'concrete']
      };

      const mockLocal = [
        { style: 'Victorian', characteristics: ['brick', 'ornate details'] }
      ];

      const result = styleBlendingEngine.blendStyles(mockPortfolio, mockLocal, {});

      expect(result.recommendedMaterials).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/brick|steel|concrete/i)
        ])
      );
    });

    test('should provide blend rationale', () => {
      const mockPortfolio = {
        dominantStyle: 'Contemporary',
        confidence: 0.7
      };

      const mockLocal = [
        { style: 'Colonial', prevalence: 'high' }
      ];

      const result = styleBlendingEngine.blendStyles(mockPortfolio, mockLocal, {});

      expect(result).toHaveProperty('rationale');
      expect(typeof result.rationale).toBe('string');
      expect(result.rationale.length).toBeGreaterThan(20);
    });
  });
});
