import portfolioFixture from "../fixtures/stylePack/portfolio-textPDF.json" with { type: "json" };
import expectedPack from "../fixtures/stylePack/expected-pack-portfolio-textPDF.json" with { type: "json" };
import {
  computeStylePackHash,
  extractStylePack,
  stableStylePackStringify,
} from "../../services/style/stylePackExtractor.js";
import {
  STYLE_PACK_SCHEMA,
  STYLE_PACK_VERSION,
  validateStylePack,
} from "../../schemas/stylePack.js";

const EXPECTED_PACK_HASH =
  "b7c5c5651366430255098e48eff4b43ebf7092dbb84773832456b07e13477f8c";

describe("stylePackExtractor", () => {
  test("returns null when no portfolio files are present", () => {
    expect(extractStylePack({ portfolioFiles: [] })).toBeNull();
  });

  test("extracts the locked expected pack from the text-PDF fixture", () => {
    const pack = extractStylePack({
      portfolioFiles: portfolioFixture,
      briefHints: { buildingType: "community", target_storeys: 2 },
    });

    expect(pack).toEqual(expectedPack);
    expect(stableStylePackStringify(pack)).toBe(
      stableStylePackStringify(expectedPack),
    );
    expect(computeStylePackHash(pack)).toBe(EXPECTED_PACK_HASH);
  });

  test("repeated extraction is byte-identical and hash-identical", () => {
    const first = extractStylePack({
      portfolioFiles: portfolioFixture,
      briefHints: { buildingType: "community", target_storeys: 2 },
    });
    const second = extractStylePack({
      portfolioFiles: portfolioFixture,
      briefHints: { buildingType: "community", target_storeys: 2 },
    });

    expect(first).toEqual(second);
    expect(stableStylePackStringify(first)).toBe(
      stableStylePackStringify(second),
    );
    expect(computeStylePackHash(first)).toBe(computeStylePackHash(second));
  });

  test("validates against the locked schema", () => {
    expect(STYLE_PACK_SCHEMA.title).toBe("StylePack");
    expect(validateStylePack(expectedPack)).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("throws when extractor version does not match the locked schema", () => {
    expect(() =>
      extractStylePack({
        portfolioFiles: portfolioFixture,
        extractorVersion: "2.0.0",
      }),
    ).toThrow(/Style Pack validation failed/);
    expect(STYLE_PACK_VERSION).toBe("1.0.0");
  });

  test("low-evidence portfolio records still produce bounded confidence", () => {
    const pack = extractStylePack({
      portfolioFiles: [
        { name: "empty.pdf", text: "", portfolioStyleEvidence: {} },
      ],
      briefHints: { buildingType: "dwelling", target_storeys: 2 },
    });

    expect(pack.provenance.confidence).toBeGreaterThanOrEqual(0);
    expect(pack.provenance.confidence).toBeLessThanOrEqual(1);
    expect(validateStylePack(pack).valid).toBe(true);
  });
});
