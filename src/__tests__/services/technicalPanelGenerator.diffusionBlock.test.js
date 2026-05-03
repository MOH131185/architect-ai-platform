import {
  TechnicalPanelGenerator,
  isDiffusionFallbackAllowed,
  DiffusionFallbackBlockedError,
} from "../../services/technical/TechnicalPanelGenerator.js";

describe("TechnicalPanelGenerator diffusion fallback gate", () => {
  const originalEnv = { ...process.env };

  function clearGateEnv() {
    delete process.env.ALLOW_DEMO_TECHNICAL_FALLBACK;
    delete process.env.PIPELINE_MODE;
    delete process.env.REACT_APP_USE_TOGETHER;
  }

  beforeEach(() => {
    clearGateEnv();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  describe("isDiffusionFallbackAllowed", () => {
    test("returns false in default final A1 mode (no env overrides)", () => {
      expect(isDiffusionFallbackAllowed()).toBe(false);
    });

    test("returns true with ALLOW_DEMO_TECHNICAL_FALLBACK=1", () => {
      process.env.ALLOW_DEMO_TECHNICAL_FALLBACK = "1";
      expect(isDiffusionFallbackAllowed()).toBe(true);
    });

    test("returns true with ALLOW_DEMO_TECHNICAL_FALLBACK=true", () => {
      process.env.ALLOW_DEMO_TECHNICAL_FALLBACK = "true";
      expect(isDiffusionFallbackAllowed()).toBe(true);
    });

    test("does not treat PIPELINE_MODE=multi_panel as a diffusion escape hatch", () => {
      process.env.PIPELINE_MODE = "multi_panel";
      expect(isDiffusionFallbackAllowed()).toBe(false);
    });

    test("does not treat REACT_APP_USE_TOGETHER=true as a diffusion escape hatch", () => {
      process.env.REACT_APP_USE_TOGETHER = "true";
      expect(isDiffusionFallbackAllowed()).toBe(false);
    });

    test("ignores empty string env", () => {
      process.env.ALLOW_DEMO_TECHNICAL_FALLBACK = "";
      process.env.PIPELINE_MODE = "";
      expect(isDiffusionFallbackAllowed()).toBe(false);
    });
  });

  describe("generate() throws when vector unavailable in final mode", () => {
    test("masterDNA without geometry → DiffusionFallbackBlockedError", async () => {
      // No geometry, no rooms — canGenerateVector returns false, so
      // the generator would normally fall back to diffusion.
      const masterDNA = { dimensions: { width: 10, length: 8 } };
      const generator = new TechnicalPanelGenerator();

      await expect(
        generator.generate("floor_plan_ground", masterDNA, {}, {}),
      ).rejects.toThrow(DiffusionFallbackBlockedError);

      await expect(
        generator.generate("floor_plan_ground", masterDNA, {}, {}),
      ).rejects.toThrow(/DIFFUSION_FALLBACK_DISABLED_IN_FINAL_A1/);
    });

    test("DiffusionFallbackBlockedError carries panelType and reason", async () => {
      const generator = new TechnicalPanelGenerator();
      try {
        await generator.generate("elevation_north", {}, {}, {});
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(DiffusionFallbackBlockedError);
        expect(err.code).toBe("DIFFUSION_FALLBACK_DISABLED_IN_FINAL_A1");
        expect(err.panelType).toBe("elevation_north");
        expect(err.reason).toBe("vector_generation_unavailable");
      }
    });
  });

  describe("generate() respects the explicit demo fallback flag", () => {
    test("ALLOW_DEMO_TECHNICAL_FALLBACK=1 → diffusion result returned", async () => {
      process.env.ALLOW_DEMO_TECHNICAL_FALLBACK = "1";

      const generator = new TechnicalPanelGenerator();
      const result = await generator.generate(
        "floor_plan_ground",
        { dimensions: { width: 10, length: 8 } },
        { id: "fp-test" },
        {},
      );

      expect(result).toBeDefined();
      expect(result.type).toBe("floor_plan_ground");
      expect(result.generationMethod).toBe("diffusion_strict_ortho");
    });

    test("production REACT_APP_USE_TOGETHER=true still blocks diffusion fallback", async () => {
      process.env.NODE_ENV = "production";
      process.env.REACT_APP_USE_TOGETHER = "true";

      const generator = new TechnicalPanelGenerator();

      expect(isDiffusionFallbackAllowed()).toBe(false);
      await expect(
        generator.generate("section_AA", {}, { id: "fp-test" }, {}),
      ).rejects.toThrow(DiffusionFallbackBlockedError);
    });
  });
});
