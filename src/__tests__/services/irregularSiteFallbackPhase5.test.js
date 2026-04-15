import { deriveBuildableEnvelope } from "../../services/site/buildableEnvelopeService.js";
import { resolveIrregularSiteFallback } from "../../services/site/siteFallbackStrategies.js";

describe("irregular site fallback Phase 5", () => {
  test("emits deterministic warnings for awkward sites", () => {
    const site = {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 4.5, y: 0 },
        { x: 4.5, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 28 },
        { x: 0, y: 28 },
      ],
      setbacks: {
        front: 1,
        rear: 1,
        left: 0.8,
        right: 0.8,
      },
    };
    const envelope = deriveBuildableEnvelope(site);
    const fallback = resolveIrregularSiteFallback(site, envelope);

    expect(fallback.siteScore.siteClass).toMatch(/narrow|asymmetric|awkward/);
    expect(fallback.searchStrategies.length).toBeGreaterThan(0);
    expect(fallback.warnings.length).toBeGreaterThan(0);
  });
});
