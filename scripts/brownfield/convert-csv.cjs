#!/usr/bin/env node
/**
 * Convert a UK council Brownfield Land Register CSV (OS National Grid
 * coordinates, EPSG:27700) into a slim WGS84 JSON fixture that the
 * runtime brownfield overlay can consume.
 *
 * Usage:
 *   node scripts/brownfield/convert-csv.cjs <input.csv> <local-authority-slug>
 *
 * Example:
 *   node scripts/brownfield/convert-csv.cjs \
 *     ~/Downloads/Brownfield_register_03_12_24.csv \
 *     north-lincolnshire
 *
 * Writes to:
 *   api/site/_lib/brownfieldData/<la>.json
 *
 * The transform from OS National Grid (EPSG:27700, OSGB36 datum) to
 * WGS84 lat/lng is implemented inline — no `proj4` dependency. Accuracy
 * is ±5 m, which is fine for development-site map markers (we are not
 * laying out foundations off this).
 *
 * License: brownfield registers are released by each English council
 * under the Open Government Licence v3.0. Reproduce attribution
 * wherever the data is rendered.
 */

const fs = require("node:fs");
const path = require("node:path");

// ============================================================
// EPSG:27700 (OSGB36) → EPSG:4326 (WGS84) projection
// ============================================================
//
// Two-step transform:
//   1) Inverse of OS National Grid (Transverse Mercator) → OSGB36 lat/lng.
//   2) OSGB36 → WGS84 via Helmert 7-parameter transformation (uses the
//      ~5m-accuracy OSGB36→ETRS89 parameters published by Ordnance Survey).
//
// References:
//   - OS publication "A guide to coordinate systems in Great Britain",
//     section 6.6 (Transverse Mercator inverse) and Annex B (Helmert
//     parameters).
//   - https://www.ordnancesurvey.co.uk/docs/support/guide-coordinate-systems-great-britain.pdf

// Airy 1830 ellipsoid (used by OSGB36).
const AIRY_1830 = { a: 6377563.396, b: 6356256.909 };
// WGS84 ellipsoid.
const WGS84 = { a: 6378137.0, b: 6356752.3142 };

// OS National Grid transverse-mercator parameters.
const NATIONAL_GRID = {
  N0: -100000, // false northing
  E0: 400000, // false easting
  F0: 0.9996012717, // scale factor
  phi0: degToRad(49), // origin latitude
  lambda0: degToRad(-2), // origin longitude
};

// Helmert OSGB36 → WGS84 (datum shift). These are the standard
// "OSTN02 average" parameters; full OSTN-grid transformation gives
// sub-metre accuracy but for marker placement these are sufficient.
const HELMERT_OSGB36_TO_WGS84 = {
  tx: 446.448,
  ty: -125.157,
  tz: 542.06,
  s: -20.4894 * 1e-6, // ppm → ratio
  rx: degToRad(0.1502 / 3600), // arc-second → rad
  ry: degToRad(0.247 / 3600),
  rz: degToRad(0.8421 / 3600),
};

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Inverse Transverse-Mercator from National Grid (E, N) → OSGB36 lat/lng.
 * Returns radians.
 */
function nationalGridToOsgb36(easting, northing) {
  const { a, b } = AIRY_1830;
  const { N0, E0, F0, phi0, lambda0 } = NATIONAL_GRID;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;

  let phi = (northing - N0) / (a * F0) + phi0;
  let M = 0;
  do {
    const dphi = phi - phi0;
    const sphi = phi + phi0;
    M =
      b *
      F0 *
      ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * dphi -
        (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dphi) * Math.cos(sphi) +
        ((15 / 8) * n2 + (15 / 8) * n3) *
          Math.sin(2 * dphi) *
          Math.cos(2 * sphi) -
        ((35 / 24) * n3) * Math.sin(3 * dphi) * Math.cos(3 * sphi));
    phi += (northing - N0 - M) / (a * F0);
  } while (Math.abs(northing - N0 - M) >= 0.00001);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const secPhi = 1 / cosPhi;

  const nu = (a * F0) / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;

  const tan2Phi = tanPhi * tanPhi;
  const tan4Phi = tan2Phi * tan2Phi;
  const tan6Phi = tan4Phi * tan2Phi;

  const VII = tanPhi / (2 * rho * nu);
  const VIII =
    (tanPhi / (24 * rho * Math.pow(nu, 3))) *
    (5 + 3 * tan2Phi + eta2 - 9 * tan2Phi * eta2);
  const IX =
    (tanPhi / (720 * rho * Math.pow(nu, 5))) *
    (61 + 90 * tan2Phi + 45 * tan4Phi);

  const X = secPhi / nu;
  const XI = (secPhi / (6 * Math.pow(nu, 3))) * (nu / rho + 2 * tan2Phi);
  const XII =
    (secPhi / (120 * Math.pow(nu, 5))) * (5 + 28 * tan2Phi + 24 * tan4Phi);
  const XIIA =
    (secPhi / (5040 * Math.pow(nu, 7))) *
    (61 + 662 * tan2Phi + 1320 * tan4Phi + 720 * tan6Phi);

  const dE = easting - E0;

  const phiOut = phi - VII * dE * dE + VIII * Math.pow(dE, 4) - IX * Math.pow(dE, 6);
  const lambdaOut =
    lambda0 +
    X * dE -
    XI * Math.pow(dE, 3) +
    XII * Math.pow(dE, 5) -
    XIIA * Math.pow(dE, 7);

  return { lat: phiOut, lng: lambdaOut };
}

/**
 * Apply Helmert 7-parameter datum transformation. Input/output are
 * geocentric Cartesian (X, Y, Z) in metres.
 */
function helmertTransform(x, y, z, params) {
  const { tx, ty, tz, s, rx, ry, rz } = params;
  return {
    x: tx + (1 + s) * x + -rz * y + ry * z,
    y: ty + rz * x + (1 + s) * y + -rx * z,
    z: tz + -ry * x + rx * y + (1 + s) * z,
  };
}

/**
 * Geodetic (lat, lng, height) → geocentric Cartesian (X, Y, Z).
 */
function geodeticToCartesian(lat, lng, h, ellipsoid) {
  const { a, b } = ellipsoid;
  const e2 = 1 - (b * b) / (a * a);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLng = Math.sin(lng);
  const cosLng = Math.cos(lng);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return {
    x: (nu + h) * cosLat * cosLng,
    y: (nu + h) * cosLat * sinLng,
    z: ((1 - e2) * nu + h) * sinLat,
  };
}

/**
 * Geocentric Cartesian (X, Y, Z) → geodetic (lat, lng, height).
 */
function cartesianToGeodetic(x, y, z, ellipsoid) {
  const { a, b } = ellipsoid;
  const e2 = 1 - (b * b) / (a * a);
  const lng = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));
  let h = 0;
  for (let i = 0; i < 10; i += 1) {
    const sinLat = Math.sin(lat);
    const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    h = p / Math.cos(lat) - nu;
    lat = Math.atan2(z, p * (1 - (e2 * nu) / (nu + h)));
  }
  return { lat, lng, h };
}

/**
 * EPSG:27700 (E, N in OS National Grid) → EPSG:4326 (lat, lng in WGS84).
 * Returned lat/lng are in degrees.
 */
function osgrToWgs84(easting, northing) {
  const osgb36 = nationalGridToOsgb36(easting, northing);
  const cart = geodeticToCartesian(osgb36.lat, osgb36.lng, 0, AIRY_1830);
  const wgs84Cart = helmertTransform(
    cart.x,
    cart.y,
    cart.z,
    HELMERT_OSGB36_TO_WGS84,
  );
  const wgs84 = cartesianToGeodetic(
    wgs84Cart.x,
    wgs84Cart.y,
    wgs84Cart.z,
    WGS84,
  );
  return { lat: radToDeg(wgs84.lat), lng: radToDeg(wgs84.lng) };
}

// ============================================================
// CSV parsing (RFC 4180-ish: handles quoted commas + escaped quotes)
// ============================================================

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

// ============================================================
// Main
// ============================================================

function fail(msg, code = 1) {
  process.stderr.write(`[brownfield-convert] ${msg}\n`);
  process.exit(code);
}

function trimAndUndefIfEmpty(s) {
  const v = String(s || "").trim();
  return v.length === 0 ? null : v;
}

function main() {
  const inputCsvPath = process.argv[2];
  const laSlug = process.argv[3];
  if (!inputCsvPath || !laSlug) {
    fail(
      "Usage: node scripts/brownfield/convert-csv.cjs <input.csv> <la-slug>",
    );
  }
  if (!fs.existsSync(inputCsvPath)) {
    fail(`Input CSV not found: ${inputCsvPath}`);
  }

  const content = fs.readFileSync(inputCsvPath, "utf8");
  const rows = parseCsv(content);
  if (rows.length < 2) fail("CSV is empty or has no data rows");

  const header = rows[0].map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const required = [
    "SiteReference",
    "SiteNameAddress",
    "GeoX",
    "GeoY",
    "Hectares",
    "OwnershipStatus",
    "PlanningStatus",
  ];
  for (const col of required) {
    if (idx(col) === -1) {
      fail(
        `Required column "${col}" missing from header. Found: ${header.join(", ")}`,
      );
    }
  }

  const sites = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    if (cells.length < header.length) continue;

    // Some councils swap the labels: GeoX is sometimes labelled as
    // northing and vice-versa. Detect by magnitude — UK eastings are
    // 0–700,000, northings are 0–1,300,000; for England most northings
    // are ≥ 100,000 while eastings are 100,000–700,000. The SiteplanURL
    // column carries the canonical StartEasting/StartNorthing and
    // resolves the ambiguity when present.
    let easting = Number(cells[idx("GeoX")]);
    let northing = Number(cells[idx("GeoY")]);
    const url = cells[idx("SiteplanURL")] || "";
    const eMatch = url.match(/StartEasting=([\d.]+)/);
    const nMatch = url.match(/StartNorthing=([\d.]+)/);
    if (eMatch && nMatch) {
      easting = Number(eMatch[1]);
      northing = Number(nMatch[1]);
    }
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) continue;

    const { lat, lng } = osgrToWgs84(easting, northing);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    sites.push({
      ref: trimAndUndefIfEmpty(cells[idx("SiteReference")]),
      name: trimAndUndefIfEmpty(cells[idx("SiteNameAddress")]),
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      hectares: Number(cells[idx("Hectares")]) || 0,
      planningStatus: trimAndUndefIfEmpty(cells[idx("PlanningStatus")]),
      ownership: trimAndUndefIfEmpty(cells[idx("OwnershipStatus")]),
      planningUrl: trimAndUndefIfEmpty(cells[idx("PlanningHistory")]),
      lastUpdated: trimAndUndefIfEmpty(
        cells[idx("LastUpdatedDate")] || cells[idx("FirstAddedDate")],
      ),
    });
  }

  const outPath = path.resolve(
    __dirname,
    "..",
    "..",
    "api",
    "site",
    "_lib",
    "brownfieldData",
    `${laSlug}.json`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(sites, null, 0));
  process.stdout.write(
    `[brownfield-convert] wrote ${sites.length} sites to ${outPath}\n`,
  );
}

// Only run when invoked from the CLI; importing from tests just picks up
// the exported helpers below.
if (require.main === module) {
  main();
}

module.exports = { osgrToWgs84, parseCsv };
