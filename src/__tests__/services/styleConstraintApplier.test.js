import expectedPack from "../fixtures/stylePack/expected-pack-portfolio-textPDF.json" with { type: "json" };
import {
  applyStylePackToBrief,
  applyStylePackToMaterialPaletteInputs,
  applyStylePackToOptionScorerWeights,
} from "../../services/style/stylePackConstraintApplier.js";
import { computeMaterialPalette } from "../../services/style/localStylePack.js";

function materialAllowedByPack(material, pack) {
  const tokens = [
    ...pack.materialFamilies.primary,
    ...pack.materialFamilies.secondary,
    ...pack.materialFamilies.accents,
  ].map((entry) => String(entry).toLowerCase());
  const text = String(material || "").toLowerCase();
  return tokens.some((token) => text.includes(token) || token.includes(text));
}

describe("stylePackConstraintApplier", () => {
  test("applyStylePackToBrief returns an unchanged brief when pack is absent", () => {
    const brief = { project_name: "No Pack", target_storeys: 2 };
    expect(applyStylePackToBrief({ brief, stylePack: null })).toEqual(brief);
  });

  test("clamps target_storeys into the pack floor-count range", () => {
    const constrained = applyStylePackToBrief({
      brief: { project_name: "Clamp", target_storeys: 1 },
      stylePack: expectedPack,
    });
    expect(constrained.target_storeys).toBe(3);
  });

  test("honours floorCountLocked by skipping the floor-count clamp", () => {
    const constrained = applyStylePackToBrief({
      brief: {
        project_name: "Locked",
        target_storeys: 1,
        floorCountLocked: true,
      },
      stylePack: expectedPack,
    });
    expect(constrained.target_storeys).toBe(1);
  });

  test("clamps aspect ratio and fills facade/opening defaults", () => {
    const constrained = applyStylePackToBrief({
      brief: {
        project_name: "Aspect",
        target_storeys: 3,
        aspect_ratio_target: 2,
      },
      stylePack: expectedPack,
    });
    expect(constrained.aspect_ratio_target).toBeLessThanOrEqual(0.75);
    expect(constrained.facade_module_mm).toBe(2400);
    expect(constrained.floor_height_mm).toBe(3400);
    expect(constrained.opening_rhythm).toEqual(expectedPack.openingRhythm);
    expect(constrained.window_to_wall_ratio_target).toEqual(
      expectedPack.windowToWallRatio,
    );
  });

  test("material palette inputs constrain palette tokens or mark disjoint", () => {
    const inputs = {
      brief: {
        building_type: "community",
        project_name: "Palette",
        user_intent: { style_keywords: ["warm brick", "timber"] },
      },
      site: {},
      climate: { overheating: { risk_level: "low" } },
      paletteSize: 6,
    };
    const constrainedInputs = applyStylePackToMaterialPaletteInputs({
      inputs,
      stylePack: expectedPack,
    });
    const palette = computeMaterialPalette(constrainedInputs);

    if (palette.style_pack_warning) {
      expect(palette.style_pack_warning).toBe("palette_disjoint");
    } else {
      expect(
        palette.palette.every((material) =>
          materialAllowedByPack(material, expectedPack),
        ),
      ).toBe(true);
    }
  });

  test("absent pack leaves material palette inputs and output identical", () => {
    const inputs = {
      brief: {
        building_type: "dwelling",
        project_name: "No Pack Palette",
        user_intent: { style_keywords: ["brick", "slate"] },
      },
      site: {},
      climate: { overheating: { risk_level: "medium" } },
    };

    expect(
      computeMaterialPalette(
        applyStylePackToMaterialPaletteInputs({ inputs, stylePack: null }),
      ),
    ).toEqual(computeMaterialPalette(inputs));
  });

  test("reallocates option scorer weights only when a pack is present", () => {
    const weights = {
      programmeFit: 0.25,
      climateFit: 0.2,
      costFit: 0.15,
      styleAlignment: 0,
    };

    expect(
      applyStylePackToOptionScorerWeights({ weights, stylePack: null }),
    ).toBe(weights);
    expect(
      applyStylePackToOptionScorerWeights({ weights, stylePack: expectedPack }),
    ).toEqual({
      programmeFit: 0.25,
      climateFit: 0.1,
      costFit: 0.1,
      styleAlignment: 0.15,
    });
  });
});
