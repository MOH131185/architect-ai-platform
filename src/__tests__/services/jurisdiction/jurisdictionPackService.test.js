import {
  GENERIC_JURISDICTION_WARNING,
  loadJurisdictionPack,
  resolveJurisdictionPack,
  validateJurisdictionPack,
} from "../../../services/jurisdiction/jurisdictionPackService.js";

describe("jurisdictionPackService", () => {
  test("loads UK, France, and Algeria packs with required contract fields", () => {
    ["uk", "france", "algeria"].forEach((jurisdictionId) => {
      const pack = loadJurisdictionPack(jurisdictionId);
      const validation = validateJurisdictionPack(pack);

      expect(validation.valid).toBe(true);
      expect(pack.version).toEqual(expect.any(String));
      expect(pack.countryCode).toEqual(expect.any(String));
      expect(pack.titleBlockLabels).toEqual(expect.any(Object));
      expect(pack.defaultCadLayers.length).toBeGreaterThan(0);
      expect(pack.disclaimers.preliminaryAdvisory).toMatch(
        /verify with local authority and licensed professionals/i,
      );
    });
  });

  test("missing pack fails clearly unless generic fallback is explicit", () => {
    expect(() => loadJurisdictionPack("mars")).toThrow(
      /JURISDICTION_PACK_NOT_FOUND/,
    );

    const generic = loadJurisdictionPack("mars", {
      allowGenericFallback: true,
    });

    expect(generic.jurisdictionId).toBe("generic");
  });

  test("resolver selects UK, France, Algeria, explicit override, and generic warning", () => {
    expect(
      resolveJurisdictionPack({
        address: "12 High Street, Scunthorpe, DN15 6XX, United Kingdom",
      }).pack.jurisdictionId,
    ).toBe("uk");
    expect(
      resolveJurisdictionPack({
        address: "Rue de Rivoli, 75001 Paris, France",
      }).pack.jurisdictionId,
    ).toBe("france");
    expect(
      resolveJurisdictionPack({
        address: "Hydra, Algiers, Algeria",
      }).pack.jurisdictionId,
    ).toBe("algeria");
    expect(
      resolveJurisdictionPack({
        address: "Paris, France",
        brief: { jurisdiction: "uk" },
      }).pack.jurisdictionId,
    ).toBe("uk");

    const unknown = resolveJurisdictionPack({
      address: "Unknown site",
    });
    expect(unknown.pack.jurisdictionId).toBe("generic");
    expect(unknown.sourceGaps[0].code).toBe(GENERIC_JURISDICTION_WARNING);
  });

  test("packs do not claim legal compliance or construction approval", () => {
    ["uk", "france", "algeria", "generic"].forEach((jurisdictionId) => {
      const pack = loadJurisdictionPack(jurisdictionId, {
        allowGenericFallback: true,
      });
      const text = JSON.stringify(pack);

      expect(text).not.toMatch(/code compliant/i);
      expect(text).not.toMatch(/approved for construction/i);
      expect(text).toMatch(/Preliminary advisory checklist/i);
    });
  });
});
