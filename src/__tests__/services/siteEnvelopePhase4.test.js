import {
  deriveBuildableEnvelope,
  validateFootprintAgainstEnvelope,
} from "../../services/site/buildableEnvelopeService.js";

describe("buildableEnvelopeService Phase 4", () => {
  test("derives a constrained buildable envelope for irregular sites", () => {
    const envelope = deriveBuildableEnvelope({
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 6 },
        { x: 12, y: 6 },
        { x: 12, y: 14 },
        { x: 0, y: 14 },
      ],
      setbacks: { front: 2, right: 1.5, rear: 2, left: 1 },
      north_orientation_deg: 15,
    });

    expect(envelope.buildable_polygon.length).toBeGreaterThanOrEqual(4);
    expect(envelope.constraints.buildable_area_ratio).toBeLessThan(1);
    expect(envelope.constraints.irregularity_score).toBeGreaterThan(0);
    expect(envelope.constraints.constrained_site).toBe(true);

    const inside = validateFootprintAgainstEnvelope(
      envelope.buildable_polygon,
      envelope,
    );
    const outside = validateFootprintAgainstEnvelope(
      [
        { x: -1, y: -1 },
        { x: 19, y: -1 },
        { x: 19, y: 15 },
        { x: -1, y: 15 },
      ],
      envelope,
    );

    expect(inside.valid).toBe(true);
    expect(outside.valid).toBe(false);
  });
});
