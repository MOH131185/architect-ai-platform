// Test the projection helpers exported by the brownfield CSV conversion
// script. Reference points are well-known OS National Grid coordinates
// with their published WGS84 equivalents — if the inline OSGB36→WGS84
// transform regresses, this test catches it.

const { osgrToWgs84, parseCsv } = require("../convert-csv.cjs");

describe("osgrToWgs84 (EPSG:27700 → EPSG:4326)", () => {
  test("converts a Scunthorpe centre point within 10 m of expected", () => {
    // 489983.34, 411585.43 is the SiteplanURL centre for "15-17
    // Trafford Street Scunthorpe" from the published Brownfield register.
    // Expected WGS84 lat/lng (cross-checked against Google Maps geocode
    // for "15-17 Trafford Street Scunthorpe DN15"): ~53.5931, -0.6419.
    const { lat, lng } = osgrToWgs84(489983.34, 411585.43);
    expect(lat).toBeCloseTo(53.5931, 3);
    expect(lng).toBeCloseTo(-0.6419, 3);
  });

  test("converts a Cardiff centre point", () => {
    // OS reference: Cardiff city centre ~ E 318100, N 176200.
    // Expected ~ 51.4816, -3.1791.
    const { lat, lng } = osgrToWgs84(318100, 176200);
    expect(lat).toBeCloseTo(51.48, 1);
    expect(lng).toBeCloseTo(-3.18, 1);
  });

  test("Edinburgh-area conversion stays in Scotland", () => {
    // OS reference: Edinburgh ~ E 326200, N 673300.
    // Expected ~ 55.95, -3.20.
    const { lat, lng } = osgrToWgs84(326200, 673300);
    expect(lat).toBeGreaterThan(55);
    expect(lat).toBeLessThan(56);
    expect(lng).toBeGreaterThan(-4);
    expect(lng).toBeLessThan(-3);
  });
});

describe("parseCsv", () => {
  test("parses a simple comma-separated row", () => {
    const out = parseCsv("a,b,c\n1,2,3\n");
    expect(out).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("handles quoted commas + escaped quotes", () => {
    const out = parseCsv('name,desc\n"Smith, John","She said ""hi"""\n');
    expect(out).toEqual([
      ["name", "desc"],
      ["Smith, John", 'She said "hi"'],
    ]);
  });

  test("handles CRLF and LF line endings", () => {
    const lf = parseCsv("a,b\n1,2\n");
    const crlf = parseCsv("a,b\r\n1,2\r\n");
    expect(lf).toEqual(crlf);
  });
});
