import { extractPostcodeArea, isEnglandOrWales } from "../postcodeRegion.js";

describe("extractPostcodeArea", () => {
  test("returns 2-letter area for typical postcodes", () => {
    expect(extractPostcodeArea("DN15 8BQ")).toBe("DN");
    expect(extractPostcodeArea("EH8 9YL")).toBe("EH");
    expect(extractPostcodeArea("BT1 1AA")).toBe("BT");
    expect(extractPostcodeArea("SA1 1AA")).toBe("SA");
  });

  test("returns 1-letter area for single-letter outward codes", () => {
    expect(extractPostcodeArea("G4 0AA")).toBe("G");
    expect(extractPostcodeArea("M1 1AE")).toBe("M");
    expect(extractPostcodeArea("E1 7AA")).toBe("E");
  });

  test("handles lowercase + extra spaces", () => {
    expect(extractPostcodeArea("dn15  8bq")).toBe("DN");
    expect(extractPostcodeArea("  G4 0AA  ")).toBe("G");
  });

  test("returns null for non-UK strings and malformed input", () => {
    expect(extractPostcodeArea("75001 Paris")).toBeNull();
    expect(extractPostcodeArea("10001")).toBeNull();
    expect(extractPostcodeArea("")).toBeNull();
    expect(extractPostcodeArea(null)).toBeNull();
    expect(extractPostcodeArea(undefined)).toBeNull();
  });
});

describe("isEnglandOrWales", () => {
  test("DN15 (North Lincolnshire) → true", () => {
    expect(isEnglandOrWales({ postcode: "DN15 8BQ" })).toBe(true);
  });

  test("BT1 (Belfast, Northern Ireland) → false", () => {
    expect(isEnglandOrWales({ postcode: "BT1 1AA" })).toBe(false);
  });

  test("EH8 (Edinburgh, Scotland) → false", () => {
    expect(isEnglandOrWales({ postcode: "EH8 9YL" })).toBe(false);
  });

  test("SA1 (Swansea, Wales) → true", () => {
    expect(isEnglandOrWales({ postcode: "SA1 1AA" })).toBe(true);
  });

  test("G4 (Glasgow, Scotland — 1-letter area) → false", () => {
    expect(isEnglandOrWales({ postcode: "G4 0AA" })).toBe(false);
  });

  test("missing postcode + London lat/lng → true via bbox", () => {
    expect(isEnglandOrWales({ lat: 51.5074, lng: -0.1278 })).toBe(true);
  });

  test("missing postcode + Paris lat/lng → false (outside bbox)", () => {
    expect(isEnglandOrWales({ lat: 48.8566, lng: 2.3522 })).toBe(false);
  });

  test("missing postcode + Dublin lat/lng → false (outside bbox)", () => {
    expect(isEnglandOrWales({ lat: 53.3498, lng: -6.2603 })).toBe(false);
  });

  test("malformed postcode falls back to bbox", () => {
    // Garbage postcode + valid English lat/lng → true via bbox
    expect(
      isEnglandOrWales({ postcode: "not-a-postcode", lat: 53.62, lng: -0.65 }),
    ).toBe(true);
  });

  test("returns false when inputs are missing entirely", () => {
    expect(isEnglandOrWales()).toBe(false);
    expect(isEnglandOrWales({})).toBe(false);
    expect(isEnglandOrWales({ postcode: null, lat: null, lng: null })).toBe(
      false,
    );
  });

  test("Edinburgh postcode wins even when lat/lng is in the England bbox", () => {
    // Berwick-upon-Tweed is technically in England but the bbox extends to
    // it. A user with an Edinburgh postcode whose Google geocoder returned
    // a slightly-south point should still NOT trigger INSPIRE.
    expect(
      isEnglandOrWales({ postcode: "EH8 9YL", lat: 55.0, lng: -2.0 }),
    ).toBe(false);
  });
});
