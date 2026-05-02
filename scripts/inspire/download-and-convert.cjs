#!/usr/bin/env node
/**
 * Download + convert one HM Land Registry INSPIRE Index Polygons file
 * for a single Local Authority. Output is a slim WGS84 JSON array of
 * `{ inspireId, polygon: [{lat, lng}, ...] }` ready for the runtime
 * `inspirePolygonsClient.js`.
 *
 * Run-once tool. Requires GDAL (`ogr2ogr`) on PATH for the GML →
 * GeoJSON + EPSG:27700 → EPSG:4326 reprojection step.
 *
 * Usage:
 *   node scripts/inspire/download-and-convert.cjs north-lincolnshire
 *   node scripts/inspire/download-and-convert.cjs north-lincolnshire \
 *     --out api/site/_lib/inspireData/north-lincolnshire.json
 *
 * After running, commit the produced JSON. Re-run monthly to refresh.
 *
 * License note: HM Land Registry INSPIRE Index Polygons are released
 * under Open Government Licence v3.0. Wherever the polygons are
 * rendered the application MUST display:
 *   "Contains HM Land Registry data © Crown copyright and database
 *    right (Open Government Licence v3.0)"
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const https = require("node:https");

const HMLR_BASE_URL =
  "https://use-land-property-data.service.gov.uk/datasets/inspire/download";

function fail(message, exitCode = 1) {
  process.stderr.write(`[inspire-download] ${message}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { la: null, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else if (!args.la) {
      args.la = arg;
    }
  }
  if (!args.la) {
    fail(
      "Usage: node scripts/inspire/download-and-convert.cjs <local-authority-slug> [--out <path>]\n\n" +
        "Examples:\n" +
        "  north-lincolnshire\n" +
        "  city-of-london\n" +
        "  cardiff\n\n" +
        "See https://use-land-property-data.service.gov.uk/datasets/inspire " +
        "for the canonical list of available LAs.",
    );
  }
  if (!args.out) {
    args.out = path.resolve(
      __dirname,
      "..",
      "..",
      "api",
      "site",
      "_lib",
      "inspireData",
      `${args.la}.json`,
    );
  }
  return args;
}

function checkOgr2OgrAvailable() {
  const probe = spawnSync("ogr2ogr", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    fail(
      "`ogr2ogr` is not on PATH. Install GDAL:\n" +
        "  macOS:    brew install gdal\n" +
        "  Ubuntu:   sudo apt install gdal-bin\n" +
        "  Windows:  https://gdal.org/download.html (use OSGeo4W or conda)\n\n" +
        "Then re-run this script.",
    );
  }
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const request = (currentUrl) => {
      https
        .get(currentUrl, (response) => {
          // Follow up to 5 redirects (HMLR uses CDN redirects).
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            return request(response.headers.location);
          }
          if (response.statusCode !== 200) {
            return reject(
              new Error(`HTTP ${response.statusCode} for ${currentUrl}`),
            );
          }
          response.pipe(file);
          file.on("finish", () => file.close(resolve));
        })
        .on("error", reject);
    };
    request(url);
  });
}

function unzip(zipPath, destDir) {
  // Minimal unzip via the Node 18+ built-in `zlib` is not enough — we
  // use the native `unzip` command for portability of GML extraction.
  const unzip = spawnSync("unzip", ["-o", "-d", destDir, zipPath], {
    stdio: "inherit",
  });
  if (unzip.error || unzip.status !== 0) {
    fail(
      "`unzip` is not on PATH. Install with `brew install unzip` " +
        "(macOS), `apt install unzip` (Ubuntu), or use 7-Zip on Windows.",
    );
  }
}

function findGmlFile(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".gml")) {
      return path.join(dir, entry.name);
    }
    if (entry.isDirectory()) {
      const nested = findGmlFile(path.join(dir, entry.name));
      if (nested) return nested;
    }
  }
  return null;
}

function convertGmlToGeoJson(gmlPath, geoJsonPath) {
  const result = spawnSync(
    "ogr2ogr",
    [
      "-f",
      "GeoJSON",
      "-t_srs",
      "EPSG:4326",
      "-s_srs",
      "EPSG:27700",
      geoJsonPath,
      gmlPath,
    ],
    { stdio: "inherit" },
  );
  if (result.error || result.status !== 0) {
    fail(`ogr2ogr failed converting ${gmlPath} → ${geoJsonPath}`);
  }
}

function slimGeoJson(geoJsonPath) {
  const raw = fs.readFileSync(geoJsonPath, "utf8");
  const featureCollection = JSON.parse(raw);
  if (!featureCollection?.features) {
    fail(`Unexpected GeoJSON shape from ogr2ogr in ${geoJsonPath}`);
  }
  const slim = featureCollection.features
    .map((feature) => {
      const inspireId =
        feature?.properties?.INSPIREID ||
        feature?.properties?.inspireId ||
        feature?.id ||
        null;
      const ring = feature?.geometry?.coordinates?.[0] || [];
      const polygon = ring
        .map(([lng, lat]) => ({
          lat: Number(lat),
          lng: Number(lng),
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (polygon.length < 3) return null;
      return { inspireId, polygon };
    })
    .filter(Boolean);
  return slim;
}

async function main() {
  const { la, out } = parseArgs(process.argv);
  checkOgr2OgrAvailable();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `inspire-${la}-`));
  const zipPath = path.join(tmpDir, `${la}.zip`);
  const downloadUrl = `${HMLR_BASE_URL}/${la}.zip`;

  process.stdout.write(`[inspire-download] downloading ${downloadUrl}\n`);
  await download(downloadUrl, zipPath);

  process.stdout.write(`[inspire-download] unzipping into ${tmpDir}\n`);
  unzip(zipPath, tmpDir);

  const gmlPath = findGmlFile(tmpDir);
  if (!gmlPath) {
    fail(`No .gml file found inside ${zipPath}`);
  }
  process.stdout.write(`[inspire-download] found GML at ${gmlPath}\n`);

  const geoJsonPath = path.join(tmpDir, `${la}.geojson`);
  process.stdout.write(`[inspire-download] reprojecting EPSG:27700 → 4326\n`);
  convertGmlToGeoJson(gmlPath, geoJsonPath);

  process.stdout.write(`[inspire-download] slimming GeoJSON\n`);
  const slim = slimGeoJson(geoJsonPath);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(slim, null, 0));
  process.stdout.write(
    `[inspire-download] wrote ${slim.length} parcels to ${out}\n`,
  );
}

main().catch((err) => {
  fail(err?.message || String(err));
});
