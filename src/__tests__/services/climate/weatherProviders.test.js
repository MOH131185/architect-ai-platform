import {
  parseEpw,
  loadEpwBuffer,
} from "../../../services/climate/weatherProviders/epwLoader.js";
import {
  UKCP18_DATASET,
  ukcp18ReferenceFor,
} from "../../../services/climate/weatherProviders/ukcp18Reference.js";

function fakeEpwHeader({ rowCount = 8760, lat = 51.5, lon = -0.1 } = {}) {
  const header = [
    `LOCATION,London,,GBR,IWEC,037790,${lat},${lon},0.0,5.0`,
    "DESIGN CONDITIONS,0",
    "TYPICAL/EXTREME PERIODS,0",
    "GROUND TEMPERATURES,0",
    "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
    "COMMENTS 1,Synthetic test fixture",
    "COMMENTS 2,Generated for unit test",
    "DATA PERIODS,1,1,Data,Sunday,1/1,12/31",
  ].join("\n");
  const data = new Array(rowCount).fill("1,1,1,0,0,test").join("\n");
  return rowCount > 0 ? `${header}\n${data}` : header;
}

describe("epwLoader", () => {
  test("rejects empty input", () => {
    expect(() => parseEpw("")).toThrow(/non-empty/);
  });

  test("rejects malformed header", () => {
    expect(() => parseEpw("HEADERWRONG\n".repeat(10))).toThrow(
      /header malformed/,
    );
  });

  test("parses location header for lat/lon/elevation/timezone", () => {
    const text = fakeEpwHeader({ rowCount: 0, lat: 51.5074, lon: -0.1278 });
    const out = parseEpw(text);
    expect(out.location.lat).toBeCloseTo(51.5074);
    expect(out.location.lon).toBeCloseTo(-0.1278);
    expect(out.location.country).toBe("GBR");
    expect(out.location.elevation_m).toBe(5);
    expect(out.location.timezone_hours).toBe(0);
  });

  test("classifies a full-year EPW as info-severity", () => {
    const text = fakeEpwHeader({ rowCount: 8760 });
    const out = parseEpw(text);
    expect(out.is_full_year).toBe(true);
    expect(out.data_row_count).toBe(8760);
    expect(out.data_quality.severity).toBe("info");
  });

  test("classifies a near-complete EPW (8000 rows) as warning", () => {
    const text = fakeEpwHeader({ rowCount: 8000 });
    const out = parseEpw(text);
    expect(out.is_full_year).toBe(false);
    expect(out.data_quality.severity).toBe("warning");
  });

  test("classifies a tiny EPW (10 rows) as error", () => {
    const text = fakeEpwHeader({ rowCount: 10 });
    const out = parseEpw(text);
    expect(out.data_quality.severity).toBe("error");
  });

  test("loadEpwBuffer accepts string input", () => {
    const text = fakeEpwHeader({ rowCount: 100 });
    const out = loadEpwBuffer(text);
    expect(out.data_row_count).toBe(100);
  });
});

describe("ukcp18Reference", () => {
  test("UKCP18_DATASET cites Met Office", () => {
    expect(UKCP18_DATASET.title).toMatch(/Met Office UKCP18/i);
    expect(UKCP18_DATASET.source_url).toMatch(/metoffice\.gov\.uk/);
    expect(UKCP18_DATASET.scenarios).toEqual(
      expect.arrayContaining(["RCP4.5", "RCP8.5"]),
    );
  });

  test("ukcp18ReferenceFor records site coords without live fetch", () => {
    const ref = ukcp18ReferenceFor({ lat: 51.5, lon: -0.1 });
    expect(ref.site_query.lat).toBe(51.5);
    expect(ref.site_query.query_resolved).toBe(false);
    expect(ref.data_quality.message).toMatch(/external downscaling/i);
  });

  test("missing coords still attaches dataset metadata", () => {
    const ref = ukcp18ReferenceFor({});
    expect(ref.site_query).toBeNull();
    expect(ref.dataset).toBe(UKCP18_DATASET);
  });
});
