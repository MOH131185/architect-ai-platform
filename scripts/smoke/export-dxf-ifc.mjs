#!/usr/bin/env node
// Exercise DXF + IFC export endpoints against the compiledProject from the
// server smoke run. Saves outputs alongside response-200.json.

import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { readFile, writeFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const SERVER = process.env.SMOKE_SERVER || "http://localhost:3001";
const OUT_DIR = resolve(ROOT, "outputs/style-pack-smoke/server-run");

async function main() {
  const body = JSON.parse(
    await readFile(join(OUT_DIR, "response-200.json"), "utf8"),
  );
  const compiledProject =
    body?.artifacts?.compiledProject ||
    body?.compiledProject ||
    body?.bundle?.compiledProject ||
    null;
  if (!compiledProject) {
    console.error("[export-smoke] no compiledProject on response");
    process.exit(2);
  }
  console.log(
    `[export-smoke] compiledProject.geometryHash=${compiledProject.geometryHash} levels=${compiledProject.levels?.length}`,
  );

  const projectName = "StylePackPortfolioE2E";

  console.log("\n[1] DXF export");
  const t0 = Date.now();
  const dxfResp = await fetch(`${SERVER}/api/project/export/dxf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compiledProject, projectName }),
  });
  const dxfBuf = Buffer.from(await dxfResp.arrayBuffer());
  console.log(
    `  status=${dxfResp.status} elapsedMs=${Date.now() - t0} bytes=${dxfBuf.length}`,
  );
  await writeFile(join(OUT_DIR, "export.dxf"), dxfBuf);
  // Sanity: a DXF file should start with the section marker "0\nSECTION" or similar.
  const dxfHead = dxfBuf.subarray(0, 80).toString("utf8");
  console.log(`  head: ${dxfHead.replace(/\r?\n/g, " | ").slice(0, 200)}`);
  const dxfOk =
    dxfResp.status === 200 &&
    dxfBuf.length > 200 &&
    /\bSECTION\b/.test(dxfHead);
  console.log(`  ${dxfOk ? "OK" : "FAIL"}`);

  console.log("\n[2] IFC export");
  const t1 = Date.now();
  const ifcResp = await fetch(`${SERVER}/api/project/export/ifc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compiledProject, projectName }),
  });
  const ifcText = await ifcResp.text();
  console.log(
    `  status=${ifcResp.status} elapsedMs=${Date.now() - t1} bytes=${ifcText.length}`,
  );
  await writeFile(join(OUT_DIR, "export.ifc"), ifcText, "utf8");
  const ifcHead = ifcText.slice(0, 80);
  console.log(`  head: ${ifcHead.replace(/\r?\n/g, " | ").slice(0, 200)}`);
  const ifcOk =
    ifcResp.status === 200 &&
    ifcText.length > 200 &&
    ifcText.startsWith("ISO-10303-21");
  console.log(`  ${ifcOk ? "OK" : "FAIL"}`);

  console.log("\nSummary:");
  console.log(`  DXF: ${dxfOk ? "PASS" : "FAIL"} (${dxfBuf.length} bytes)`);
  console.log(`  IFC: ${ifcOk ? "PASS" : "FAIL"} (${ifcText.length} bytes)`);
  if (!dxfOk || !ifcOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
