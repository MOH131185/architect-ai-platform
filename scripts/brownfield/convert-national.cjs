#!/usr/bin/env node
/**
 * Convert the Digital Land national consolidated brownfield-land CSV
 * (https://files.planning.data.gov.uk/dataset/brownfield-land.csv) into
 * a slim JSON fixture covering every English Local Authority that has
 * registered brownfield sites.
 *
 * Different from `convert-csv.cjs` (which handles each council's native
 * register format) — the Digital Land feed is already in WGS84 (its
 * `point` column is `POINT(lng lat)`), so no projection step is needed.
 *
 * Usage:
 *   node scripts/brownfield/convert-national.cjs <input.csv>
 *
 * Writes to:
 *   api/site/_lib/brownfieldData/national.json
 *
 * Output schema (one entry per site):
 *   { ref, name, lat, lng, hectares, planningStatus, ownership,
 *     planningUrl, lastUpdated, organisationEntity }
 *
 * License note: brownfield registers are released by each council under
 * the Open Government Licence v3.0; the consolidated dataset published
 * by Digital Land (Department for Levelling Up, Housing & Communities)
 * carries the same licence. Reproduce attribution wherever the data is
 * rendered.
 */

const fs = require("node:fs");
const path = require("node:path");
const { parseCsv } = require("./convert-csv.cjs");

function fail(msg, code = 1) {
  process.stderr.write(`[brownfield-national] ${msg}\n`);
  process.exit(code);
}

function trimOrNull(value) {
  const v = String(value || "").trim();
  return v.length === 0 ? null : v;
}

// `POINT(lng lat)` → { lat, lng }. WKT is already WGS84 so no transform.
function parseWktPoint(wkt) {
  if (typeof wkt !== "string") return null;
  const match = wkt.match(/^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/i);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function main() {
  const inputCsvPath = process.argv[2];
  if (!inputCsvPath) {
    fail(
      "Usage: node scripts/brownfield/convert-national.cjs <input.csv>\n\n" +
        "Download from https://files.planning.data.gov.uk/dataset/brownfield-land.csv " +
        "first, then point this script at it.",
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
    "point",
    "name",
    "site-address",
    "hectares",
    "ownership-status",
    "planning-permission-status",
    "organisation-entity",
  ];
  for (const col of required) {
    if (idx(col) === -1) {
      fail(`Required column "${col}" missing from header`);
    }
  }

  const sites = [];
  let skippedNoPoint = 0;
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    if (cells.length < header.length) continue;

    const point = parseWktPoint(cells[idx("point")]);
    if (!point) {
      skippedNoPoint += 1;
      continue;
    }

    const ref = trimOrNull(cells[idx("reference")] || cells[idx("name")]);
    const address = trimOrNull(cells[idx("site-address")]);
    const hectares = Number(cells[idx("hectares")]) || 0;

    sites.push({
      ref,
      name: address || ref || "Brownfield site",
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
      hectares,
      planningStatus: trimOrNull(cells[idx("planning-permission-status")]),
      ownership: trimOrNull(cells[idx("ownership-status")]),
      planningUrl: trimOrNull(cells[idx("planning-permission-history")]),
      lastUpdated: trimOrNull(cells[idx("entry-date")]),
      organisationEntity: trimOrNull(cells[idx("organisation-entity")]),
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
    "national.json",
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(sites, null, 0));

  const distinctEntities = new Set(
    sites.map((s) => s.organisationEntity).filter(Boolean),
  );
  process.stdout.write(
    `[brownfield-national] wrote ${sites.length} sites across ` +
      `${distinctEntities.size} organisations to ${outPath}\n` +
      `[brownfield-national] skipped ${skippedNoPoint} rows with no point geometry\n`,
  );
}

if (require.main === module) {
  main();
}

module.exports = { parseWktPoint };
