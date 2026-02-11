import { runPreCompositionGate } from "../../services/validation/FingerprintValidationGate.js";
import { FEATURE_FLAGS, resetFeatureFlags } from "../../config/featureFlags.js";

describe("FingerprintValidationGate Tier-1 deterministic panels", () => {
  const originalFlags = {
    strictFingerprintGate: FEATURE_FLAGS.strictFingerprintGate,
    threeTierPanelConsistency: FEATURE_FLAGS.threeTierPanelConsistency,
  };

  beforeEach(() => {
    resetFeatureFlags();
    FEATURE_FLAGS.strictFingerprintGate = true;
    FEATURE_FLAGS.threeTierPanelConsistency = true;
  });

  afterAll(() => {
    FEATURE_FLAGS.strictFingerprintGate = originalFlags.strictFingerprintGate;
    FEATURE_FLAGS.threeTierPanelConsistency =
      originalFlags.threeTierPanelConsistency;
  });

  test("blocks compose when deterministic floor panel misses geometryHash", async () => {
    const panels = [
      { type: "hero_3d", imageUrl: "https://example.com/hero.png" },
      {
        type: "floor_plan_ground",
        imageUrl: "https://example.com/floor.svg",
        meta: { cdsHash: "cds-1", controlSource: "canonical_pack" },
      },
    ];

    const result = await runPreCompositionGate(panels, {
      heroImageUrl: "https://example.com/hero.png",
    });

    expect(result.canCompose).toBe(false);
    expect(result.action).toBe("retry_failed");
    expect(result.failedPanels).toHaveLength(1);
    expect(result.failedPanels[0].issues.join(" ")).toContain(
      "Missing geometryHash",
    );
  });

  test("accepts deterministic panel with required semantic metadata", async () => {
    const panels = [
      { type: "hero_3d", imageUrl: "https://example.com/hero.png" },
      {
        type: "floor_plan_ground",
        imageUrl: "https://example.com/floor.svg",
        meta: {
          geometryHash: "geom-123",
          cdsHash: "cds-123",
          controlSource: "canonical_pack",
        },
      },
    ];

    const result = await runPreCompositionGate(panels, {
      heroImageUrl: "https://example.com/hero.png",
    });

    expect(result.canCompose).toBe(true);
    expect(result.action).toBe("compose");
    expect(result.failedPanels).toHaveLength(0);
  });
});
