import {
  resolveUKVernacular,
  listVernacularPackIds,
  getVernacularPack,
  __testing__,
} from "../../../services/style/ukVernacularPacks.js";

describe("resolveUKVernacular — postcode resolution", () => {
  test("W2 5SH → london-stucco-terrace", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    expect(pack.packId).toBe("london-stucco-terrace");
    expect(pack.resolution_source).toBe("postcode");
  });

  test("SW1A 1AA → london-stucco-terrace (falls back from SW1A to SW1)", () => {
    const pack = resolveUKVernacular({ postcode: "SW1A 1AA" });
    expect(pack.packId).toBe("london-stucco-terrace");
  });

  test("E8 1AB → london-victorian-terrace", () => {
    const pack = resolveUKVernacular({ postcode: "E8 1AB" });
    expect(pack.packId).toBe("london-victorian-terrace");
  });

  test("M14 5SH → manchester-back-to-back", () => {
    const pack = resolveUKVernacular({ postcode: "M14 5SH" });
    expect(pack.packId).toBe("manchester-back-to-back");
  });

  test("EH8 9YL → edinburgh-tenement", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    expect(pack.packId).toBe("edinburgh-tenement");
  });

  test("GL56 0XB → cotswolds-cottage", () => {
    const pack = resolveUKVernacular({ postcode: "GL56 0XB" });
    expect(pack.packId).toBe("cotswolds-cottage");
  });

  test("OX18 — cotswolds prefix", () => {
    const pack = resolveUKVernacular({ postcode: "OX18 4XJ" });
    expect(pack.packId).toBe("cotswolds-cottage");
  });

  test("unknown UK postcode → uk-generic", () => {
    const pack = resolveUKVernacular({ postcode: "BT1 1AA" });
    expect(pack.packId).toBe("uk-generic");
    expect(pack.resolution_source).toBe("default");
  });
});

describe("resolveUKVernacular — lat/lng fallback", () => {
  test("Notting Hill coordinates with no postcode → london-stucco-terrace", () => {
    // ~51.5156°N, -0.1911°W (42 Westbourne Grove area)
    const pack = resolveUKVernacular({ lat: 51.5156, lng: -0.1911 });
    expect(pack.packId).toBe("london-stucco-terrace");
    expect(pack.resolution_source).toBe("bbox");
  });

  test("outer Greater London coords → london-victorian-terrace", () => {
    const pack = resolveUKVernacular({ lat: 51.55, lng: -0.05 });
    expect(pack.packId).toBe("london-victorian-terrace");
  });

  test("Manchester city centre coords → manchester-back-to-back", () => {
    const pack = resolveUKVernacular({ lat: 53.475, lng: -2.235 });
    expect(pack.packId).toBe("manchester-back-to-back");
  });

  test("Edinburgh New Town coords → edinburgh-tenement", () => {
    const pack = resolveUKVernacular({ lat: 55.953, lng: -3.198 });
    expect(pack.packId).toBe("edinburgh-tenement");
  });

  test("non-UK coords (Paris) → uk-generic via no-bbox-match", () => {
    const pack = resolveUKVernacular({ lat: 48.8566, lng: 2.3522 });
    expect(pack.packId).toBe("uk-generic");
  });
});

describe("resolveUKVernacular — postcode beats bbox", () => {
  test("W2 postcode wins even if lat/lng would resolve elsewhere", () => {
    // Manchester coords + a London postcode → postcode wins
    const pack = resolveUKVernacular({
      postcode: "W2 5SH",
      lat: 53.475,
      lng: -2.235,
    });
    expect(pack.packId).toBe("london-stucco-terrace");
    expect(pack.resolution_source).toBe("postcode");
  });
});

describe("resolveUKVernacular — country hint fallback", () => {
  test("regionName 'United Kingdom' with no postcode/coords → uk-generic", () => {
    const pack = resolveUKVernacular({ regionName: "United Kingdom" });
    expect(pack.packId).toBe("uk-generic");
    expect(pack.resolution_source).toBe("country_hint");
  });

  test("empty input → uk-generic default", () => {
    const pack = resolveUKVernacular({});
    expect(pack.packId).toBe("uk-generic");
    expect(pack.resolution_source).toBe("default");
  });
});

describe("resolveUKVernacular — pack shape", () => {
  test("every pack carries the canonical key set", () => {
    const requiredKeys = [
      "packId",
      "label",
      "region",
      "materials",
      "facade_language",
      "roof_language",
      "window_language",
      "fenestration_rhythm",
      "modernity_default",
      "parapet_default",
      "semi_basement_default",
      "descriptive_narrative",
      "historical_period",
      "conservation_typical",
      "references",
    ];
    for (const id of listVernacularPackIds()) {
      const pack = getVernacularPack(id);
      expect(pack).toBeTruthy();
      for (const key of requiredKeys) {
        expect(pack).toHaveProperty(key);
      }
      expect(Array.isArray(pack.materials)).toBe(true);
      expect(pack.materials.length).toBeGreaterThan(0);
    }
  });

  test("descriptive_narrative is non-empty for every regional pack (paper §4.3 historical context)", () => {
    for (const id of listVernacularPackIds()) {
      if (id === "uk-generic") continue;
      const pack = getVernacularPack(id);
      expect(typeof pack.descriptive_narrative).toBe("string");
      expect(pack.descriptive_narrative.length).toBeGreaterThan(50);
    }
  });
});

describe("postcodeAreaPrefix — internals", () => {
  test('"W2 5SH" → "W2"', () => {
    expect(__testing__.postcodeAreaPrefix("W2 5SH")).toBe("W2");
  });

  test('"SW1A 1AA" → "SW1A"', () => {
    expect(__testing__.postcodeAreaPrefix("SW1A 1AA")).toBe("SW1A");
  });

  test('lowercase " w2 5sh " → "W2"', () => {
    expect(__testing__.postcodeAreaPrefix(" w2 5sh ")).toBe("W2");
  });
});
