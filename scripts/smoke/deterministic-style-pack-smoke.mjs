#!/usr/bin/env node
// Deterministic Style Pack smoke against the real-portfolio fixture.
// Asserts: schema valid, all required fields populated, stable hash, fallback
// material families for image-only PDFs, geometryHash differs from the
// pinned no-pack value (5cfd1cb6242bdf27), and geometryHash is stable across
// two identical runs.

import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import {
  extractStylePack,
  computeStylePackHash,
} from "../../src/services/style/stylePackExtractor.js";
import { validateStylePack } from "../../src/schemas/stylePack.js";
import {
  applyStylePackToBrief,
} from "../../src/services/style/stylePackConstraintApplier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");

// Hash pin for THIS smoke's brief shape; the canonical unit-test brief is
// pinned separately in projectGraphVerticalSliceService.test.js (5cfd1cb6242bdf27).
const NO_PACK_PIN = "8147e50fcf3f4734";

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
}

const FIXTURE_PATH = resolve(
  ROOT,
  arg("--fixture", "outputs/style-pack-smoke/portfolioFiles.json"),
);
const OUT_DIR = resolve(ROOT, "outputs/style-pack-smoke");

const COLOURS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const assertions = [];
function assert(label, passed, detail = "") {
  assertions.push({ label, passed, detail });
  const tag = passed
    ? `${COLOURS.green}PASS${COLOURS.reset}`
    : `${COLOURS.red}FAIL${COLOURS.reset}`;
  console.log(`  [${tag}] ${label}${detail ? `  ${COLOURS.cyan}${detail}${COLOURS.reset}` : ""}`);
}

async function main() {
  console.log(`${COLOURS.bold}Style Pack deterministic smoke${COLOURS.reset}`);
  console.log(`  fixture: ${FIXTURE_PATH}`);
  const portfolioFiles = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  console.log(`  portfolioFiles: ${portfolioFiles.length}`);
  portfolioFiles.forEach((record) => {
    console.log(
      `    - ${record.name} pages=${record.pdf?.pageCount} extracted=${record.pdf?.textExtracted}`,
    );
  });

  console.log("\n[1] extractor — schema validity");
  const briefHints = {
    buildingType: "dwelling",
    target_storeys: 2,
  };
  const packA = extractStylePack({ portfolioFiles, briefHints });
  const validation = validateStylePack(packA);
  assert("pack is non-null", packA !== null);
  assert(
    "pack validates against STYLE_PACK_SCHEMA",
    validation.valid,
    validation.errors?.length ? JSON.stringify(validation.errors) : "",
  );
  assert(
    "version is 1.0.0",
    packA?.version === "1.0.0",
    `got ${packA?.version}`,
  );
  assert(
    "provenance.sourceFiles names every input",
    Array.isArray(packA?.provenance?.sourceFiles) &&
      packA.provenance.sourceFiles.length === portfolioFiles.length,
    `got ${packA?.provenance?.sourceFiles?.length}/${portfolioFiles.length}`,
  );
  assert(
    "provenance.seed is 64-char hex sha256",
    typeof packA?.provenance?.seed === "string" &&
      /^[a-f0-9]{64}$/.test(packA.provenance.seed),
  );
  assert(
    "provenance.extractedAt is the stable epoch",
    packA?.provenance?.extractedAt === "1970-01-01T00:00:00.000Z",
  );
  assert(
    "materialFamilies.primary has 1..4 tokens",
    Array.isArray(packA?.materialFamilies?.primary) &&
      packA.materialFamilies.primary.length >= 1 &&
      packA.materialFamilies.primary.length <= 4,
    `got ${JSON.stringify(packA?.materialFamilies?.primary)}`,
  );
  assert(
    "massingTendency.floorCount has min<=mode<=max",
    packA?.massingTendency?.floorCount &&
      packA.massingTendency.floorCount.min <=
        packA.massingTendency.floorCount.mode &&
      packA.massingTendency.floorCount.mode <=
        packA.massingTendency.floorCount.max,
  );
  assert(
    "facadeModule.floorHeightMm in [2400,4500]",
    Number.isInteger(packA?.facadeModule?.floorHeightMm) &&
      packA.facadeModule.floorHeightMm >= 2400 &&
      packA.facadeModule.floorHeightMm <= 4500,
  );

  console.log("\n[2] extractor — deterministic across runs");
  const packB = extractStylePack({ portfolioFiles, briefHints });
  const hashA = computeStylePackHash(packA);
  const hashB = computeStylePackHash(packB);
  assert("packA === packB by deep equal", JSON.stringify(packA) === JSON.stringify(packB));
  assert("hashA === hashB", hashA === hashB, hashA);

  console.log("\n[3] constraint applier — brief mutations from pack");
  const briefBase = {
    project_name: "Real Portfolio Smoke",
    building_type: "dwelling",
    target_storeys: 2,
    user_intent: { style_keywords: [] },
  };
  const constrained = applyStylePackToBrief({
    brief: briefBase,
    stylePack: packA,
  });
  assert(
    "constrained.style_pack_hash === computeStylePackHash(pack)",
    constrained.style_pack_hash === hashA,
  );
  assert(
    "constrained.floor_height_mm is from pack",
    constrained.floor_height_mm === packA.facadeModule.floorHeightMm,
    `got ${constrained.floor_height_mm}`,
  );
  assert(
    "constrained.facade_module_mm is from pack",
    constrained.facade_module_mm === packA.facadeModule.baySpacingMm,
    `got ${constrained.facade_module_mm}`,
  );
  assert(
    "constrained.opening_rhythm.moduleMm is from pack",
    constrained.opening_rhythm?.moduleMm === packA.openingRhythm.moduleMm,
    `got ${constrained.opening_rhythm?.moduleMm}`,
  );

  console.log("\n[4] geometryHash divergence (vertical-slice internals)");
  const sliceModule = await import(
    "../../src/services/project/projectGraphVerticalSliceService.js"
  );
  const compiler = await import("../../src/services/compiler/index.js");
  const internals = sliceModule.__projectGraphVerticalSliceInternals;

  function buildReadingRoomBrief() {
    return {
      project_name: "Style Pack Smoke",
      project_type_support: { selectedSubType: "detached-house" },
      site_input: {
        address: "12 Test Street, London, UK",
        site_input_mode: "manual",
      },
      target_floor_area_m2: 180,
      target_storeys: 2,
      manualFloors: 2,
      floorCountLocked: true,
      generation_seed: 24680,
      enforce_ndss: false,
      user_intent: { style_keywords: [] },
      sitePolygon: [
        { x: 0, y: 0 },
        { x: 25, y: 0 },
        { x: 25, y: 18 },
        { x: 0, y: 18 },
      ],
      siteMetrics: { areaM2: 450 },
      seed: 24680,
    };
  }

  function compileWithPack(stylePack) {
    const input = buildReadingRoomBrief();
    let brief = internals.normalizeBrief(input);
    brief = applyStylePackToBrief({ brief, stylePack });
    const site = internals.buildSiteContext({
      brief,
      sitePolygon: input.sitePolygon,
      siteMetrics: input.siteMetrics,
    });
    const climate = internals.buildClimatePack(brief, site);
    const localStyle = internals.buildLocalStylePack(
      brief,
      site,
      climate,
      null,
      { stylePack },
    );
    const programme = internals.buildProgramme({
      brief,
      programSpaces: [],
    });
    const projectGeometry = internals.buildProjectGeometryFromProgramme({
      brief,
      site,
      programme,
      localStyle,
      climate,
    });
    const compiled = internals.compileProject({
      projectGeometry,
      masterDNA: {
        projectName: brief.project_name,
        projectID: projectGeometry.project_id,
        styleDNA: projectGeometry.metadata.style_dna,
        rooms: programme.spaces,
      },
      locationData: {
        address: brief.site_input.address,
        coordinates: { lat: site.lat, lng: site.lon },
        climate: { type: climate.weather_source },
        localMaterials: localStyle.material_palette,
      },
    });
    return { brief, localStyle, programme, projectGeometry, compiled };
  }

  const noPack = compileWithPack(null);
  const withPack1 = compileWithPack(packA);
  const withPack2 = compileWithPack(packA);

  assert(
    `noPack geometryHash matches pinned ${NO_PACK_PIN}`,
    noPack.compiled.geometryHash === NO_PACK_PIN,
    `got ${noPack.compiled.geometryHash}`,
  );
  assert(
    "withPack geometryHash is stable across two runs (same seed + pack)",
    withPack1.compiled.geometryHash === withPack2.compiled.geometryHash,
    `${withPack1.compiled.geometryHash} === ${withPack2.compiled.geometryHash}`,
  );
  assert(
    "withPack geometryHash differs from noPack",
    withPack1.compiled.geometryHash !== noPack.compiled.geometryHash,
    `withPack=${withPack1.compiled.geometryHash} noPack=${noPack.compiled.geometryHash}`,
  );
  assert(
    "compiledProject.metadata.portfolio_style_pack_hash is set",
    withPack1.compiled.metadata?.portfolio_style_pack_hash === hashA,
  );

  const hashPayloadNoPack = compiler.buildGeometryHashPayload(noPack.compiled);
  const hashPayloadWithPack = compiler.buildGeometryHashPayload(
    withPack1.compiled,
  );
  assert(
    "buildGeometryHashPayload(noPack) has no portfolio_style_pack_hash",
    !Object.prototype.hasOwnProperty.call(
      hashPayloadNoPack,
      "portfolio_style_pack_hash",
    ),
  );
  assert(
    "buildGeometryHashPayload(withPack).portfolio_style_pack_hash === pack hash",
    hashPayloadWithPack.portfolio_style_pack_hash === hashA,
  );

  console.log("\n[5] localStyle material palette reflects pack");
  const noPackPalette = noPack.localStyle.material_palette;
  const withPackPalette = withPack1.localStyle.material_palette;
  const packFamilies = [
    ...packA.materialFamilies.primary,
    ...packA.materialFamilies.secondary,
    ...packA.materialFamilies.accents,
  ].map((entry) => String(entry).toLowerCase());
  const matched = withPackPalette.filter((material) =>
    packFamilies.some(
      (token) =>
        String(material).toLowerCase().includes(token) ||
        token.includes(String(material).toLowerCase()),
    ),
  );
  const warning =
    withPack1.localStyle.style_provenance?.style_pack_warning || null;
  assert(
    "palette intersects pack families OR palette_disjoint warning fired",
    matched.length > 0 || warning === "palette_disjoint",
    `matched=${matched.length} warning=${warning} pack.primary=${JSON.stringify(packA.materialFamilies.primary)} palette=${JSON.stringify(withPackPalette)}`,
  );
  assert(
    "withPack.portfolio_style_pack_hash is set on localStyle",
    withPack1.localStyle.portfolio_style_pack_hash === hashA,
  );

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "pack.json"),
    JSON.stringify(packA, null, 2),
    "utf8",
  );
  await writeFile(
    join(OUT_DIR, "hashes.json"),
    JSON.stringify(
      {
        stylePackHash: hashA,
        noPackGeometryHash: noPack.compiled.geometryHash,
        withPackGeometryHash: withPack1.compiled.geometryHash,
        noPackPinExpected: NO_PACK_PIN,
        noPackPaletteSample: noPackPalette.slice(0, 6),
        withPackPaletteSample: withPackPalette.slice(0, 6),
        constrainedBrief: {
          style_pack_hash: constrained.style_pack_hash,
          floor_height_mm: constrained.floor_height_mm,
          facade_module_mm: constrained.facade_module_mm,
          opening_rhythm: constrained.opening_rhythm,
          window_to_wall_ratio_target: constrained.window_to_wall_ratio_target,
          roof_pitch_dominant: constrained.roof_pitch_dominant,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nWrote pack.json + hashes.json to ${OUT_DIR}`);

  const failed = assertions.filter((a) => !a.passed);
  console.log(`\n${COLOURS.bold}Summary${COLOURS.reset}: ${assertions.length - failed.length}/${assertions.length} pass, ${failed.length} fail`);
  if (failed.length > 0) {
    console.log(`\n${COLOURS.red}FAILED${COLOURS.reset}:`);
    failed.forEach((entry) => console.log(`  - ${entry.label} ${entry.detail}`));
    process.exit(1);
  }
  console.log(`${COLOURS.green}ALL PASS${COLOURS.reset}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
