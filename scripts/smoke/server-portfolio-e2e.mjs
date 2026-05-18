#!/usr/bin/env node
// Full-server E2E: POST to /api/project/generate-vertical-slice with a real
// portfolio attached, capture the result (or failure mode), and check the
// Style Pack flows into the slice output.

import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const SERVER = process.env.SMOKE_SERVER || "http://localhost:3001";
const OUT_DIR = resolve(ROOT, "outputs/style-pack-smoke/server-run");

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[server-smoke] target ${SERVER}`);

  const health = await fetch(`${SERVER}/api/health`).then((r) => r.json());
  await writeFile(
    join(OUT_DIR, `health.json`),
    JSON.stringify(health, null, 2),
    "utf8",
  );
  console.log(
    `[server-smoke] health: openaiReasoning=${health?.openaiReasoning} openaiImages=${health?.openaiImages}`,
  );

  const portfolioFiles = JSON.parse(
    await readFile(
      resolve(ROOT, "outputs/style-pack-smoke/portfolioFiles.json"),
      "utf8",
    ),
  );

  const briefPayload = {
    projectId: `style-pack-smoke-${nowStamp()}`,
    seed: 24680,
    generation_seed: 24680,
    project_name: "Style Pack Real Portfolio E2E",
    building_type: "dwelling",
    project_type_support: {
      selectedSubType: "detached-house",
    },
    site_input: {
      address: "Burn Road, Immingham DN40, UK",
      site_input_mode: "address",
    },
    target_floor_area_m2: 180,
    target_storeys: 2,
    manualFloors: 2,
    floorCountLocked: true,
    user_intent: { style_keywords: [] },
    enforce_ndss: false,
    sitePolygon: [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 25, y: 18 },
      { x: 0, y: 18 },
    ],
    siteMetrics: { areaM2: 450 },
    portfolioFiles,
  };

  await writeFile(
    join(OUT_DIR, "request.json"),
    JSON.stringify(briefPayload, null, 2),
    "utf8",
  );

  console.log(`[server-smoke] POST /api/project/generate-vertical-slice (portfolioFiles=${portfolioFiles.length})`);
  const t0 = Date.now();
  let response;
  try {
    response = await fetch(`${SERVER}/api/project/generate-vertical-slice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(briefPayload),
    });
  } catch (err) {
    console.error(`[server-smoke] network error: ${err?.message || err}`);
    await writeFile(
      join(OUT_DIR, "error.txt"),
      `network error: ${err?.message || err}`,
      "utf8",
    );
    process.exit(2);
  }
  const elapsedMs = Date.now() - t0;
  const status = response.status;
  let body;
  const text = await response.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  await writeFile(
    join(OUT_DIR, `response-${status}.json`),
    JSON.stringify(body, null, 2),
    "utf8",
  );
  console.log(`[server-smoke] status=${status} elapsedMs=${elapsedMs}`);

  if (status !== 200) {
    console.error(
      `[server-smoke] non-200 — body snippet: ${(text || "").slice(0, 600)}`,
    );
    process.exit(1);
  }

  console.log(
    `[server-smoke] success — stylePackHash=${body?.stylePackHash || body?.style_pack?.provenance?.seed || "absent"} geometryHash=${body?.geometryHash || body?.metadata?.geometryHash}`,
  );

  const summary = {
    elapsedMs,
    status,
    geometryHash: body?.geometryHash || body?.metadata?.geometryHash || null,
    stylePackHash:
      body?.stylePackHash || body?.metadata?.portfolio_style_pack_hash || null,
    stylePackPresent: Boolean(body?.style_pack || body?.stylePack),
    stylePackVersion: body?.style_pack?.version || body?.stylePack?.version,
    stylePackMaterialFamilies:
      body?.style_pack?.materialFamilies ||
      body?.stylePack?.materialFamilies ||
      null,
    artifactSurfaceKeys: Object.keys(body?.artifacts || {}),
    panelKeys: Object.keys(body?.panelMap || body?.artifacts?.panelMap || {}),
  };
  await writeFile(
    join(OUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
