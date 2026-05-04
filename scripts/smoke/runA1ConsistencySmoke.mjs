#!/usr/bin/env node
/**
 * A1 Consistency Smoke Test
 *
 * Fast, deterministic, no-network smoke that exercises the contracts wired
 * across PR-A → PR-D of the 14-phase A1 hardening:
 *
 *   - PR-A: enhancedTechnicalDrawingAdapter stamps authority/geometry
 *           metadata; compose authority gate validators accept stamped
 *           panels and reject bare ones; diffusion fallback is blocked
 *           in default final-A1 mode.
 *   - PR-B: roof pitch angle annotation appears on elevations + sections
 *           with a consistent value for the same canonical geometry.
 *   - PR-C: boundary area normalizer (areaM2 / area / surfaceAreaM2) and
 *           main entry direction service expose stable contracts.
 *   - PR-D: feature flag aliases stay in sync; ALLOW_DEMO_TECHNICAL_FALLBACK
 *           is the only escape hatch for diffusion.
 *
 * Runs in <5 seconds and requires no API keys. Suitable for CI gating.
 *
 * Usage:
 *   npm run smoke:a1-consistency
 *   node scripts/smoke/runA1ConsistencySmoke.mjs
 *
 * Exit code 0 when every assertion passes; non-zero with the failing
 * assertion message printed to stderr otherwise.
 */

import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Windows ESM loader rejects raw absolute paths (interprets the drive letter
// as a URL scheme). Wrap every dynamic import target with pathToFileURL so
// the smoke runs cross-platform.
function fileUrl(relative) {
  return pathToFileURL(path.join(PROJECT_ROOT, relative)).href;
}

const results = [];
let failed = false;

function pass(message) {
  results.push({ status: "PASS", message });
  // eslint-disable-next-line no-console
  console.log(`  PASS: ${message}`);
}

function fail(message, detail = null) {
  failed = true;
  results.push({ status: "FAIL", message, detail });
  // eslint-disable-next-line no-console
  console.error(`  FAIL: ${message}${detail ? `\n        ${detail}` : ""}`);
}

function assert(cond, message, detail = null) {
  if (cond) {
    pass(message);
  } else {
    fail(message, detail);
  }
}

async function loadCanonicalSchemaVersion() {
  const schemaModule = await import(
    fileUrl("src/services/cad/projectGeometrySchema.js")
  );
  return schemaModule.CANONICAL_PROJECT_GEOMETRY_VERSION;
}

function makeProjectGraphMasterDNA(schemaVersion, slopeDeg = 8) {
  // Canonical ProjectGraph geometry — the renderers read pitch from
  // roof_primitives[].slope_deg here, not from styleDNA.
  const footprint = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ];
  return {
    projectGeometry: {
      schema_version: schemaVersion,
      project_id: "smoke-fixture",
      site: {
        boundary_polygon: footprint,
        buildable_polygon: footprint,
      },
      levels: [
        {
          id: "level-ground",
          name: "Ground Floor",
          level_number: 0,
          elevation_m: 0,
          height_m: 3.2,
          footprint_id: "footprint-ground",
        },
      ],
      footprints: [
        {
          id: "footprint-ground",
          level_id: "level-ground",
          polygon: footprint,
          bbox: {
            min_x: 0,
            min_y: 0,
            max_x: 10,
            max_y: 5,
            width: 10,
            height: 5,
          },
        },
      ],
      rooms: [
        {
          id: "room-living",
          level_id: "level-ground",
          name: "Living Room",
          type: "living",
          x: 0,
          y: 0,
          width: 10,
          height: 5,
          polygon: footprint,
          actual_area: 50,
        },
      ],
      walls: [
        {
          id: "wall-south",
          level_id: "level-ground",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          thickness_m: 0.3,
          exterior: true,
          side: "south",
        },
        {
          id: "wall-north",
          level_id: "level-ground",
          start: { x: 0, y: 5 },
          end: { x: 10, y: 5 },
          thickness_m: 0.3,
          exterior: true,
          side: "north",
        },
        {
          id: "wall-west",
          level_id: "level-ground",
          start: { x: 0, y: 0 },
          end: { x: 0, y: 5 },
          thickness_m: 0.3,
          exterior: true,
          side: "west",
        },
        {
          id: "wall-east",
          level_id: "level-ground",
          start: { x: 10, y: 0 },
          end: { x: 10, y: 5 },
          thickness_m: 0.3,
          exterior: true,
          side: "east",
        },
      ],
      doors: [],
      windows: [],
      stairs: [],
      slabs: [],
      roof_primitives: [
        {
          id: "roof-plane",
          primitive_family: "roof_plane",
          type: "low_pitch_roof",
          support_mode: "explicit_generated",
          polygon: footprint,
          eave_depth_m: 0.35,
          slope_deg: slopeDeg,
        },
        {
          id: "roof-ridge",
          primitive_family: "ridge",
          type: "ridge",
          start: { x: 0, y: 2.5 },
          end: { x: 10, y: 2.5 },
        },
      ],
      foundations: [],
      base_conditions: [],
      roof: { type: "low_pitch", polygon: footprint },
      // Mimic the metadata that CanonicalGeometryPackService stamps on a real
      // compiled-project pack so resolveGeometryAuthority returns canonical
      // authority. compiledProjectSchemaVersion must start with
      // "compiled-project" per hasCompiledProjectAuthority.
      metadata: {
        units: "meters",
        deterministic: true,
        source: "compiled_project",
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion: "compiled-project-v1",
        style_dna: { roof_language: "civic low pitch" },
      },
    },
    dimensions: { width: 10, length: 5, floors: 1, floorHeights: [3.2] },
    styleDNA: { roof_language: "civic low pitch" },
  };
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("[A1 consistency smoke] Starting…\n");

  // -------------------------------------------------------------------------
  // 1. Adapter stamps canonical authority on the canonical-geometry path.
  // -------------------------------------------------------------------------
  const adapter = await import(
    fileUrl("src/services/design/enhancedTechnicalDrawingAdapter.js"),
  );
  const composeRuntime = await import(
    fileUrl("src/services/a1/composeRuntime.js"),
  );

  const schemaVersion = await loadCanonicalSchemaVersion();
  const dna = makeProjectGraphMasterDNA(schemaVersion, 8);
  const plan = adapter.generateEnhancedFloorPlanSVG(dna, 0, {});
  const elev = adapter.generateEnhancedElevationSVG(dna, "south", {});
  const sect = adapter.generateEnhancedSectionSVG(dna, "longitudinal", {});

  assert(plan && plan.dataUrl, "Adapter produces a floor plan with dataUrl");
  assert(elev && elev.dataUrl, "Adapter produces an elevation with dataUrl");
  assert(sect && sect.dataUrl, "Adapter produces a section with dataUrl");

  for (const [name, panel] of [
    ["floor plan", plan],
    ["elevation", elev],
    ["section", sect],
  ]) {
    assert(
      panel?.authorityUsed === "compiled_project_canonical_pack",
      `${name} authorityUsed === compiled_project_canonical_pack`,
      `got ${panel?.authorityUsed}`,
    );
    assert(
      panel?.authoritySource === "compiled_project",
      `${name} authoritySource === compiled_project`,
    );
    assert(
      typeof panel?.geometryHash === "string" && panel.geometryHash.length > 0,
      `${name} carries a non-empty geometryHash`,
    );
    assert(
      typeof panel?.svgHash === "string" && panel.svgHash.length > 0,
      `${name} carries a non-empty svgHash`,
    );
  }

  // -------------------------------------------------------------------------
  // 2. All technical panels from the same geometry share one geometryHash.
  // -------------------------------------------------------------------------
  assert(
    plan.geometryHash === elev.geometryHash &&
      elev.geometryHash === sect.geometryHash,
    "All technical panels share the same geometryHash",
    `plan=${plan.geometryHash} elev=${elev.geometryHash} sect=${sect.geometryHash}`,
  );

  // -------------------------------------------------------------------------
  // 3. Compose gate validators pass for stamped panels.
  // -------------------------------------------------------------------------
  const stampedPanels = [
    { type: "floor_plan_ground", ...plan },
    { type: "elevation_south", ...elev },
    { type: "section_AA", ...sect },
  ];
  assert(
    composeRuntime.findTechnicalPanelsMissingGeometryHash(stampedPanels)
      .length === 0,
    "Gate: findTechnicalPanelsMissingGeometryHash returns []",
  );
  assert(
    composeRuntime.findTechnicalPanelsMissingAuthorityMetadata(stampedPanels)
      .length === 0,
    "Gate: findTechnicalPanelsMissingAuthorityMetadata returns []",
  );
  assert(
    composeRuntime.findPanelsWithDisallowedTechnicalAuthority(stampedPanels)
      .length === 0,
    "Gate: findPanelsWithDisallowedTechnicalAuthority returns []",
  );

  // -------------------------------------------------------------------------
  // 4. Mismatched geometryHash is detected as multi-hash.
  // -------------------------------------------------------------------------
  const mismatched = [
    { type: "floor_plan_ground", ...plan },
    {
      type: "elevation_south",
      ...elev,
      geometryHash: "DIFFERENT_HASH_12345",
      meta: { ...(elev.metadata || {}), geometryHash: "DIFFERENT_HASH_12345" },
    },
  ];
  assert(
    composeRuntime.collectTechnicalPanelGeometryHashes(mismatched).length === 2,
    "Gate: mismatched panels surface as 2 distinct technical hashes",
  );

  // -------------------------------------------------------------------------
  // 5. Diffusion fallback blocked by default; explicit env unblocks it.
  // -------------------------------------------------------------------------
  delete process.env.ALLOW_DEMO_TECHNICAL_FALLBACK;
  delete process.env.PIPELINE_MODE;
  delete process.env.REACT_APP_USE_TOGETHER;
  const tpg = await import(
    fileUrl("src/services/technical/TechnicalPanelGenerator.js"),
  );
  assert(
    tpg.isDiffusionFallbackAllowed() === false,
    "Diffusion fallback blocked in default final-A1 mode",
  );
  process.env.ALLOW_DEMO_TECHNICAL_FALLBACK = "1";
  assert(
    tpg.isDiffusionFallbackAllowed() === true,
    "ALLOW_DEMO_TECHNICAL_FALLBACK=1 unblocks the diffusion fallback",
  );
  delete process.env.ALLOW_DEMO_TECHNICAL_FALLBACK;

  // -------------------------------------------------------------------------
  // 6. Roof pitch annotation present on elevation + section, same value.
  // -------------------------------------------------------------------------
  const PITCH_RE = /data-roof-pitch-deg="([\d.]+)"/;
  const elevPitch = String(elev.svg || "").match(PITCH_RE);
  const sectPitch = String(sect.svg || "").match(PITCH_RE);
  assert(elevPitch && elevPitch[1], "Elevation SVG carries roof pitch label");
  assert(sectPitch && sectPitch[1], "Section SVG carries roof pitch label");
  if (elevPitch && sectPitch) {
    assert(
      elevPitch[1] === sectPitch[1],
      "Elevation and section show the same pitch for the same geometry",
      `elev=${elevPitch[1]} sect=${sectPitch[1]}`,
    );
  }

  // -------------------------------------------------------------------------
  // 7. Boundary area normalizer collapses area / areaM2 / surfaceAreaM2.
  // -------------------------------------------------------------------------
  const boundaryFields = await import(
    fileUrl("src/utils/boundaryFields.js"),
  );
  const normalised = boundaryFields.normalizeAreaM2({ area: 425 });
  assert(
    normalised.areaM2 === 425 &&
      normalised.area === 425 &&
      normalised.surfaceAreaM2 === 425,
    "normalizeAreaM2 collapses area → areaM2 → surfaceAreaM2",
  );

  // -------------------------------------------------------------------------
  // 8. Main entry direction service exposes a stable contract.
  // -------------------------------------------------------------------------
  const med = await import(
    fileUrl("src/services/site/mainEntryDirectionService.js"),
  );
  const sitePolygon = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.0001 },
    { lat: 0.0001, lng: 0.0001 },
    { lat: 0.0001, lng: 0 },
  ];
  const manualResult = med.resolveMainEntryDirection({
    sitePolygon,
    manualDirection: "south",
  });
  assert(
    manualResult.source === "manual" &&
      manualResult.direction === "south" &&
      manualResult.confidence === 1,
    "Main entry: manual direction wins with confidence 1",
  );
  const inferredResult = med.resolveMainEntryDirection({ sitePolygon });
  assert(
    inferredResult.source === "inferred",
    "Main entry: inferred path returns source='inferred'",
  );
  const fallbackResult = med.resolveMainEntryDirection({});
  assert(
    fallbackResult.source === "fallback",
    "Main entry: missing polygon → source='fallback'",
  );

  // -------------------------------------------------------------------------
  // 9. Manifest carries the A1 hardening buildStamp + authority block.
  // -------------------------------------------------------------------------
  const composeTrace = await import(fileUrl("src/services/a1/composeTrace.js"));
  const hardeningStamp = await import(
    fileUrl("src/services/a1/a1HardeningStamp.js")
  );
  const manifest = composeTrace.buildComposeArtifactManifest({
    panelsByKey: {
      floor_plan_ground: { type: "floor_plan_ground", ...plan },
      elevation_south: { type: "elevation_south", ...elev },
      section_AA: { type: "section_AA", ...sect },
    },
    geometryHash: plan.geometryHash,
    dnaHash: "smoke-dna",
    programHash: "smoke-program",
    boundaryAuthority: {
      boundarySource: "compiled_project",
      boundaryAuthoritative: true,
      areaM2: 425,
      policyVersion: "site-boundary-policy-v3",
    },
    mainEntryAuthority: med
      .resolveMainEntryDirection({ sitePolygon, manualDirection: "south" }),
  });
  assert(
    manifest.buildStamp?.version === hardeningStamp.A1_HARDENING_VERSION,
    `Manifest carries A1 hardening buildStamp ${hardeningStamp.A1_HARDENING_VERSION}`,
  );
  assert(
    manifest.buildStamp?.prs?.length === 4,
    "Manifest buildStamp lists all 4 PRs (PR-A through PR-D)",
  );
  assert(
    manifest.authority?.technicalPanelsAuthority ===
      "compiled_project_canonical_pack",
    "Manifest authority.technicalPanelsAuthority === compiled_project_canonical_pack",
  );
  assert(
    manifest.authority?.geometryHash === plan.geometryHash,
    "Manifest authority.geometryHash matches the canonical geometry hash",
  );
  assert(
    manifest.authority?.boundaryAuthority?.authoritative === true &&
      manifest.authority?.boundaryAuthority?.areaM2 === 425,
    "Manifest authority.boundaryAuthority summarises the boundary input",
  );
  assert(
    manifest.authority?.mainEntryAuthority?.direction === "south" &&
      manifest.authority?.mainEntryAuthority?.source === "manual",
    "Manifest authority.mainEntryAuthority summarises the manual override",
  );

  // -------------------------------------------------------------------------
  // 10. Feature flag aliases stay in sync.
  // -------------------------------------------------------------------------
  const flagsModule = await import(fileUrl("src/config/featureFlags.js"));
  const FF = flagsModule.FEATURE_FLAGS;
  assert(
    FF.geometryAuthorityMandatory === FF.strictGeometryMaskGate,
    "Alias: geometryAuthorityMandatory === strictGeometryMaskGate",
  );
  assert(
    FF.requireCanonicalPack === FF.strictCompiledProjectExports,
    "Alias: requireCanonicalPack === strictCompiledProjectExports",
  );
  assert(
    typeof FF.strictFingerprintGate === "boolean",
    "strictFingerprintGate is a boolean (separate flag, NOT aliased)",
  );
  assert(
    typeof FF.vectorPanelGeneration === "boolean",
    "vectorPanelGeneration is a boolean (separate flag, NOT aliased)",
  );
  assert(
    FF.threeTierPanelConsistency === true,
    "threeTierPanelConsistency defaults to true",
  );
  assert(
    FF.ALLOW_DEMO_TECHNICAL_FALLBACK === false,
    "ALLOW_DEMO_TECHNICAL_FALLBACK defaults to false",
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  // eslint-disable-next-line no-console
  console.log(
    `\n[A1 consistency smoke] ${passCount} passed, ${failCount} failed (${results.length} total)`,
  );

  if (failed) {
    // eslint-disable-next-line no-console
    console.error("[A1 consistency smoke] FAILED");
    process.exit(1);
  } else {
    // eslint-disable-next-line no-console
    console.log("[A1 consistency smoke] PASSED");
    process.exit(0);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[A1 consistency smoke] crashed:", err);
  process.exit(2);
});
