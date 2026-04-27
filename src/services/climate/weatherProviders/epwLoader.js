/**
 * EnergyPlus Weather (EPW) loader. Plan §6.3 / §13.4.
 *
 * EPW is the canonical CSV-style weather file format for building simulation.
 * The header carries 8 records (LOCATION, DESIGN CONDITIONS, TYPICAL/EXTREME
 * PERIODS, GROUND TEMPERATURES, HOLIDAYS/DAYLIGHT SAVINGS, COMMENTS 1, COMMENTS
 * 2, DATA PERIODS) followed by 8760 hourly data rows for a full year.
 *
 * MVP scope: parse the LOCATION header for lat/lon/elevation/timezone,
 * confirm row count, and return a deterministic data_quality envelope. Full
 * hourly column parsing (dry-bulb temp, GHI, DHI, wind, etc.) is deferred —
 * external simulation (CIBSE TM59) consumes the raw EPW as input today.
 */

const HEADER_RECORD_KEYS = Object.freeze([
  "LOCATION",
  "DESIGN CONDITIONS",
  "TYPICAL/EXTREME PERIODS",
  "GROUND TEMPERATURES",
  "HOLIDAYS/DAYLIGHT SAVINGS",
  "COMMENTS 1",
  "COMMENTS 2",
  "DATA PERIODS",
]);

const SOURCE_ID = "energyplus-epw";

function parseLocation(record = "") {
  // LOCATION,<city>,<state>,<country>,<source>,<wmo>,<lat>,<lon>,<tz>,<elev_m>
  const fields = record.split(",");
  if (fields[0]?.trim() !== "LOCATION") return null;
  const lat = Number(fields[6]);
  const lon = Number(fields[7]);
  const tz = Number(fields[8]);
  const elev = Number(fields[9]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    city: (fields[1] || "").trim(),
    region: (fields[2] || "").trim(),
    country: (fields[3] || "").trim(),
    source: (fields[4] || "").trim(),
    wmo: (fields[5] || "").trim(),
    lat,
    lon,
    timezone_hours: Number.isFinite(tz) ? tz : null,
    elevation_m: Number.isFinite(elev) ? elev : null,
  };
}

/**
 * Parse an EPW string. Returns a manifest of header records + row count.
 * Does NOT parse the 8760 hourly data rows column-by-column at this stage —
 * the manifest is enough to plumb through to dynamic-overheating tooling.
 */
export function parseEpw(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("parseEpw requires a non-empty EPW text body.");
  }
  const lines = text.split(/\r?\n/);
  if (lines.length < HEADER_RECORD_KEYS.length) {
    throw new Error(
      `EPW too short: expected at least ${HEADER_RECORD_KEYS.length} header records, got ${lines.length}.`,
    );
  }
  const headerRecords = {};
  let cursor = 0;
  for (const key of HEADER_RECORD_KEYS) {
    const line = lines[cursor];
    if (!line || !line.startsWith(key)) {
      throw new Error(
        `EPW header malformed at record "${key}" — got line "${(line || "").slice(0, 60)}".`,
      );
    }
    headerRecords[key] = line;
    cursor += 1;
  }
  const dataRows = lines
    .slice(cursor)
    .filter((line) => line && line.trim().length > 0);
  const location = parseLocation(headerRecords.LOCATION);
  return {
    schema_version: "epw-manifest-v1",
    source: SOURCE_ID,
    location,
    header_records: headerRecords,
    data_row_count: dataRows.length,
    is_full_year: dataRows.length === 8760,
    data_quality: {
      severity:
        dataRows.length === 8760
          ? "info"
          : dataRows.length >= 8000
            ? "warning"
            : "error",
      message:
        dataRows.length === 8760
          ? "EPW contains 8760 hourly rows for a full annual cycle."
          : `EPW contains ${dataRows.length} data rows; full year expected = 8760.`,
    },
  };
}

/**
 * Load an EPW from a Node Buffer or string. Returns the same shape as parseEpw.
 */
export function loadEpwBuffer(buffer) {
  if (Buffer.isBuffer && Buffer.isBuffer(buffer)) {
    return parseEpw(buffer.toString("utf8"));
  }
  return parseEpw(String(buffer || ""));
}

export default { parseEpw, loadEpwBuffer };
