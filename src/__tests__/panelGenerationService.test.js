const { planA1Panels, generateA1PanelsSequential } = require('../services/panelGenerationService');

describe('panelGenerationService', () => {
  test('plans default panels with deterministic seeds', () => {
    const jobs = planA1Panels({
      masterDNA: { architecturalStyle: 'Modern', dimensions: { floors: 2 } },
      buildingType: 'office',
      baseSeed: 42
    });

    const types = jobs.map((job) => job.type);
    expect(types).toContain('hero_3d');
    expect(types).toContain('interior_3d');
    expect(types).toContain('site_diagram');
    expect(types).toContain('floor_plan_ground');
    expect(types).toContain('floor_plan_first');
    expect(types).toContain('elevation_north');
    expect(types).toContain('section_AA');
    expect(new Set(jobs.map((j) => j.seed)).size).toBe(jobs.length);
  });

  test('generates panels sequentially with mocked client', async () => {
    const jobs = planA1Panels({
      masterDNA: { architecturalStyle: 'Modern' },
      buildingType: 'office',
      baseSeed: 7
    }).slice(0, 2);

    const mockClient = {
      generateImage: jest.fn((params) =>
        Promise.resolve({
          url: `http://example.com/${params.seed}.png`,
          metadata: { width: params.width, height: params.height },
          seedUsed: params.seed
        })
      )
    };

    const results = await generateA1PanelsSequential(jobs, mockClient);

    expect(mockClient.generateImage).toHaveBeenCalledTimes(jobs.length);
    expect(results.map((r) => r.type)).toEqual(jobs.map((j) => j.type));
    results.forEach((panel) => {
      expect(panel.imageUrl).toContain('.png');
      expect(panel.width).toBeGreaterThan(0);
      expect(panel.height).toBeGreaterThan(0);
      expect(panel.seed).toBeGreaterThanOrEqual(0);
    });
  });
});
