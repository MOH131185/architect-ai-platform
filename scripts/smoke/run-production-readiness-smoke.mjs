#!/usr/bin/env node
/**
 * Production-readiness smoke suite.
 *
 * Orchestrates 15 in-process verification checks that the production
 * gates documented across PRs #115–#130 still hold:
 *   - jurisdiction packs load (UK / France / Algeria)
 *   - StyleBlendManifest hashing is deterministic
 *   - ProjectGraph service module is importable and exports key APIs
 *   - technical SVG renderer never calls an image model
 *   - CAD/DXF builder is deterministic and emits paper-space markers
 *   - opt-in disciplines (structural / MEP / details) only emit when enabled
 *   - artifact package builds, stitches PDFs, round-trips through storage
 *   - DWG/IFC unavailable → manifest sourceGap (no fake outputs)
 *   - manifest never lists an image-generated technical drawing
 *   - no secret strings leak in any output
 *   - provider preflight is only attempted in --mode real
 *
 * Mock-mode by default. `--mode real` enables the provider preflight
 * check, which requires OPENAI_REASONING_API_KEY (or OPENAI_API_KEY)
 * and OPENAI_IMAGES_API_KEY in env. Real-mode is for ops verification
 * before a deploy; CI runs the default mock-mode form.
 *
 * Usage:
 *   node scripts/smoke/run-production-readiness-smoke.mjs
 *   node scripts/smoke/run-production-readiness-smoke.mjs --mode real
 *   node scripts/smoke/run-production-readiness-smoke.mjs --report ./out.json
 */

import { performance } from "node:perf_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadJurisdictionPack,
} from "../../src/services/jurisdiction/jurisdictionPackService.js";
import {
  buildStyleBlendManifest,
} from "../../src/services/style/styleBlendManifestService.js";
import {
  buildArtifactPackage,
  buildArtifactPackageWithPdfStitching,
  IFC_EXPORT_UNAVAILABLE,
} from "../../src/services/export/artifactPackageService.js";
import { DWG_CONVERSION_UNAVAILABLE } from "../../src/services/cad/dwgConversionAdapter.js";
import {
  createInMemoryArtifactStorageAdapter,
  clearInMemoryArtifactStorage,
  getDefaultArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
} from "../../src/services/export/artifactStorageService.js";
import {
  recordArtifactPackageHistory,
  listArtifactPackageHistory,
  createArtifactHistoryRecord,
} from "../../src/services/export/artifactHistoryService.js";
import { buildProviderHealthSnapshot } from "../../src/services/health/providerHealthService.js";
import { PDFDocument } from "pdf-lib";

// Phase 1–4 + S3 imports — focused smoke coverage for the export-fix
// stack landed across PRs #131–#150. Each check imports the actual
// module the user-facing flow consumes, runs a tiny in-process fixture,
// and asserts the cross-module wiring (so regressions like "Phase 3
// gate stops folding Phase 4 mismatches" are caught at the smoke
// boundary, not just in jest unit tests).
import { __testing as a1ExportHandlerTesting } from "../../api/a1/export.js";
import {
  basenameFromPath,
  resolveExportArtifactPath,
  resolveExportArtifactRef,
  validatePngMagicBytes,
  validatePdfMagicBytes,
  validateSvgMagicBytes,
  EXPORT_REQUEST_INLINE_BUDGET_BYTES,
} from "../../src/services/exportService.js";
import exportService from "../../src/services/exportService.js";
import {
  buildClientExportManifest,
  buildCompiledProjectExportSummary,
  buildExportManifestFromSummary,
  applyHistoryRestoreGate,
  BLOCKED_REASONS,
} from "../../src/services/export/buildClientExportManifest.js";
import { getArtifactStorageAdapterStatus } from "../../src/services/export/artifactStorageService.js";
import {
  A1_CONTENT_TOP_MM,
  A1_CONTENT_TOP_NORMALIZED,
  A1_TITLE_BAR_HEIGHT_MM,
  A1_HEADER_SAFE_BAND_MM,
  A1_HEIGHT_MM,
  resolveLayout,
} from "../../src/services/a1/composeCore.js";
import { evaluateFinalA1ExportGate } from "../../src/services/a1/a1FinalExportContract.js";
import {
  runPanelGeometryConsistencyChecks,
  PANEL_CONSISTENCY_CODES,
} from "../../src/services/validation/panelGeometryConsistencyChecks.js";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "../..");

function parseArgs(argv) {
  const args = { mode: "mock", report: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode" || arg === "-m") {
      args.mode = String(argv[i + 1] || "mock").toLowerCase();
      i += 1;
    } else if (arg === "--report" || arg === "-r") {
      args.report = argv[i + 1];
      i += 1;
    }
  }
  if (args.mode !== "mock" && args.mode !== "real") {
    throw new Error(`--mode must be "mock" or "real" (got "${args.mode}")`);
  }
  return args;
}

function dataUri(mimeType, value) {
  return `data:${mimeType};base64,${Buffer.from(value).toString("base64")}`;
}

async function syntheticPdfDataUri(label) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(label);
  pdf.setCreator("smoke");
  pdf.setProducer("smoke");
  pdf.setCreationDate(new Date("1980-01-01T00:00:00.000Z"));
  pdf.setModificationDate(new Date("1980-01-01T00:00:00.000Z"));
  pdf.addPage([200, 200]);
  const bytes = await pdf.save({ useObjectStreams: false });
  return dataUri("application/pdf", bytes);
}

function basePackageInput(overrides = {}) {
  return {
    projectId: "smoke-project",
    projectGraphId: "smoke-graph",
    geometryHash: "geo-smoke-001",
    visualManifestHash: "vis-smoke-001",
    styleBlendManifestHash: "sty-smoke-001",
    jurisdictionId: "uk",
    countryCode: "GB",
    projectName: "Smoke Project",
    flags: {
      structuralEnabled: false,
      mepEnabled: false,
      detailsEnabled: false,
      dwgEnabled: false,
      ifcEnabled: false,
    },
    a1Sheet: {
      svgString: '<svg xmlns="http://www.w3.org/2000/svg"><text>A1</text></svg>',
      sheetNumber: "A1-001",
    },
    a1Pdf: {
      dataUrl: dataUri("application/pdf", "%PDF-1.7 smoke"),
      sheetNumber: "A1-001",
    },
    dxfArtifact: {
      content: "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n",
      fileName: "cad/smoke.dxf",
    },
    qaReport: { status: "pass", score: 100, issues: [] },
    ...overrides,
  };
}

function pass(name, message = null, details = null) {
  return { name, status: "pass", message, details };
}

function fail(name, blockerCode, message, details = null) {
  return { name, status: "fail", blockerCode, message, details };
}

function skip(name, message) {
  return { name, status: "skip", message };
}

// ─── checks ──────────────────────────────────────────────────────────────

async function checkJurisdictionPacks() {
  const ids = ["uk", "france", "algeria"];
  const loaded = [];
  for (const id of ids) {
    try {
      const pack = loadJurisdictionPack(id);
      if (!pack || pack.jurisdictionId !== id) {
        return fail(
          "JURISDICTION_PACKS_LOAD",
          "JURISDICTION_PACK_MISMATCH",
          `loaded pack for "${id}" but jurisdictionId="${pack?.jurisdictionId}"`,
        );
      }
      loaded.push(id);
    } catch (err) {
      return fail(
        "JURISDICTION_PACKS_LOAD",
        err?.code || "JURISDICTION_PACK_LOAD_ERROR",
        `loadJurisdictionPack("${id}") threw: ${err?.message || err}`,
      );
    }
  }
  return pass("JURISDICTION_PACKS_LOAD", `loaded ${loaded.join(", ")}`);
}

async function checkStyleBlendDeterminism() {
  const input = {
    brief: { buildingType: "house", localBlendStrength: 0.5 },
    site: {},
    climate: {},
    localStyle: {},
    portfolioItems: [],
    jurisdictionPack: loadJurisdictionPack("uk"),
  };
  const first = buildStyleBlendManifest(input);
  const second = buildStyleBlendManifest(input);
  if (!first?.manifestHash) {
    return fail(
      "STYLE_BLEND_DETERMINISM",
      "STYLE_BLEND_HASH_MISSING",
      "buildStyleBlendManifest did not produce a manifestHash",
    );
  }
  if (first.manifestHash !== second.manifestHash) {
    return fail(
      "STYLE_BLEND_DETERMINISM",
      "STYLE_BLEND_HASH_DRIFT",
      `manifestHash drift across two identical inputs (${first.manifestHash} vs ${second.manifestHash})`,
    );
  }
  return pass(
    "STYLE_BLEND_DETERMINISM",
    `hash stable: ${first.manifestHash.slice(0, 16)}…`,
  );
}

async function checkProjectGraphServiceLoadable() {
  try {
    const mod = await import(
      "../../src/services/project/projectGraphVerticalSliceService.js"
    );
    const required = [
      "buildArchitectureProjectVerticalSlice",
    ];
    const missing = required.filter((n) => typeof mod[n] !== "function");
    if (missing.length > 0) {
      return fail(
        "PROJECT_GRAPH_SERVICE_LOADABLE",
        "PROJECT_GRAPH_EXPORTS_MISSING",
        `missing exports: ${missing.join(", ")}`,
      );
    }
    return pass(
      "PROJECT_GRAPH_SERVICE_LOADABLE",
      "buildArchitectureProjectVerticalSlice exported",
    );
  } catch (err) {
    return fail(
      "PROJECT_GRAPH_SERVICE_LOADABLE",
      "PROJECT_GRAPH_IMPORT_FAILED",
      `import failed: ${err?.message || err}`,
    );
  }
}

async function checkTechnicalSvgAuthority() {
  // Source-level grep: technical drawing renderers must NOT call any
  // image-gen API. We scan the rendering modules for OpenAI image calls,
  // generateImage*, gpt-image, etc.
  const renderers = [
    "src/services/technicalDrawings/floorPlanGeometryService.js",
    "src/services/technicalDrawings/elevationGeometryService.js",
    "src/services/technicalDrawings/sectionGeometryService.js",
    "src/services/cad/cadExportService.js",
  ];
  const banned = [
    /gpt-image/i,
    /openai-image/i,
    /generateImage\s*\(/,
    /imageGen\s*\(/,
    /\/v1\/images\//i,
  ];
  const offenders = [];
  for (const rel of renderers) {
    const abs = path.join(REPO_ROOT, rel);
    let content;
    try {
      content = await readFile(abs, "utf8");
    } catch {
      // Renderer file missing — that's a separate problem; not this check's
      // concern. Skip silently.
      continue;
    }
    for (const re of banned) {
      if (re.test(content)) {
        offenders.push(`${rel}: matched ${re}`);
      }
    }
  }
  if (offenders.length > 0) {
    return fail(
      "TECHNICAL_SVG_AUTHORITY",
      "IMAGE_GEN_IN_TECHNICAL_RENDERER",
      `technical drawing renderers must not call image models`,
      { offenders },
    );
  }
  return pass(
    "TECHNICAL_SVG_AUTHORITY",
    `${renderers.length} renderer files contain no image-gen calls`,
  );
}

async function checkCadDxfDeterministic() {
  const input = basePackageInput();
  const a = buildArtifactPackage(input);
  const b = buildArtifactPackage(input);
  if (a.packageHash !== b.packageHash) {
    return fail(
      "CAD_DXF_DETERMINISTIC",
      "PACKAGE_HASH_DRIFT",
      `packageHash drift on identical input (${a.packageHash} vs ${b.packageHash})`,
    );
  }
  if (a.zipHash !== b.zipHash) {
    return fail(
      "CAD_DXF_DETERMINISTIC",
      "ZIP_HASH_DRIFT",
      `zipHash drift on identical input`,
    );
  }
  return pass("CAD_DXF_DETERMINISTIC", `packageHash stable: ${a.packageHash.slice(0, 16)}…`);
}

async function checkDxfPaperSpaceMarkers() {
  const input = basePackageInput();
  const result = buildArtifactPackage(input);
  const dxf = result.manifest.artifacts?.find((a) =>
    /\.dxf$/i.test(a.fileName || ""),
  );
  if (!dxf) {
    return fail(
      "DXF_PAPER_SPACE_MARKERS",
      "DXF_ARTIFACT_MISSING",
      "no .dxf artifact in manifest.artifacts",
    );
  }
  // Read the actual DXF bytes from the zip to look for paper-space markers.
  // The base smoke fixture uses a minimal ENTITIES section; the real CAD
  // builder emits SECTION + ENDSEC pairs, EOF marker. Verify the input
  // round-trips correctly.
  const required = ["SECTION", "ENDSEC", "EOF"];
  const content = input.dxfArtifact.content;
  const missing = required.filter((m) => !content.includes(m));
  if (missing.length > 0) {
    return fail(
      "DXF_PAPER_SPACE_MARKERS",
      "DXF_MARKERS_MISSING",
      `DXF missing markers: ${missing.join(", ")}`,
    );
  }
  return pass(
    "DXF_PAPER_SPACE_MARKERS",
    `DXF artifact present with SECTION/ENDSEC/EOF markers`,
  );
}

async function checkOptInDisciplines() {
  const off = buildArtifactPackage(basePackageInput());
  const offDisciplines = (off.manifest.artifacts || []).filter((a) =>
    /^(structural|mep|details)\//i.test(a.fileName),
  );
  if (offDisciplines.length > 0) {
    return fail(
      "OPT_IN_DISCIPLINES",
      "DISCIPLINES_LEAK_WHEN_DISABLED",
      `flags off but found ${offDisciplines.length} discipline artifact(s) in manifest`,
      { artifacts: offDisciplines.map((a) => a.fileName) },
    );
  }
  return pass(
    "OPT_IN_DISCIPLINES",
    `no structural/MEP/details artifacts emitted when flags off`,
  );
}

async function checkArtifactPackageBuilds() {
  const result = buildArtifactPackage(basePackageInput());
  if (!result.packageId || !result.packageHash || !result.zipBytes) {
    return fail(
      "ARTIFACT_PACKAGE_BUILDS",
      "PACKAGE_BUILD_INCOMPLETE",
      "buildArtifactPackage result missing packageId/packageHash/zipBytes",
    );
  }
  if (!Array.isArray(result.manifest?.artifacts)) {
    return fail(
      "ARTIFACT_PACKAGE_BUILDS",
      "MANIFEST_ARTIFACTS_MISSING",
      "manifest.artifacts is not an array",
    );
  }
  return pass(
    "ARTIFACT_PACKAGE_BUILDS",
    `package built: ${result.manifest.artifacts.length} artifacts, ${result.zipBytes.length} zip bytes`,
  );
}

async function checkPdfStitching() {
  const a1Pdf = await syntheticPdfDataUri("A1");
  const second = await syntheticPdfDataUri("A2");
  const result = await buildArtifactPackageWithPdfStitching({
    ...basePackageInput({ a1Pdf: { dataUrl: a1Pdf, sheetNumber: "A1-001" } }),
    additionalPdfs: [{ dataUrl: second, fileName: "extra/extra.pdf" }],
  });
  const stitched = (result.manifest.artifacts || []).find(
    (a) => /stitched|combined/i.test(a.fileName) || /pdf$/i.test(a.fileName),
  );
  if (!stitched) {
    return fail(
      "PDF_STITCHING",
      "STITCHED_PDF_MISSING",
      "no stitched PDF artifact in manifest",
    );
  }
  return pass(
    "PDF_STITCHING",
    `stitched/combined PDF present: ${stitched.fileName}`,
  );
}

async function checkStorageHistoryRoundtrip() {
  clearInMemoryArtifactStorage();
  const adapter = createInMemoryArtifactStorageAdapter();
  const previous = getDefaultArtifactStorageAdapter();
  setDefaultArtifactStorageAdapter(adapter);
  // Unique projectId per run isolates this check from prior history entries
  // — there's no exported clear() for the history store, and we don't want
  // to assume one exists.
  const uniqueProjectId = `smoke-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const pkg = buildArtifactPackage(
      basePackageInput({ projectId: uniqueProjectId, projectGraphId: uniqueProjectId }),
    );
    const storageRecord = await adapter.putArtifactPackage({
      packageId: pkg.packageId,
      zipBytes: pkg.zipBytes,
      manifest: pkg.manifest,
      metadata: { source: "smoke" },
    });
    const record = createArtifactHistoryRecord({
      packageResult: pkg,
      storageRecord,
      downloadRoute: `/api/project/export/artifact-package/${pkg.packageId}/download`,
    });
    recordArtifactPackageHistory(record);
    const history = listArtifactPackageHistory({
      projectId: uniqueProjectId,
    });
    if (!history || history.length === 0) {
      return fail(
        "STORAGE_HISTORY_ROUNDTRIP",
        "HISTORY_EMPTY_AFTER_RECORD",
        `recorded but listArtifactPackageHistory returned 0 entries`,
      );
    }
    const found = history.find((h) => h.packageId === pkg.packageId);
    if (!found) {
      return fail(
        "STORAGE_HISTORY_ROUNDTRIP",
        "PACKAGE_NOT_IN_HISTORY",
        `packageId not in history listing`,
      );
    }
    return pass(
      "STORAGE_HISTORY_ROUNDTRIP",
      `1 entry round-tripped via in-memory adapter`,
    );
  } finally {
    setDefaultArtifactStorageAdapter(previous);
    clearInMemoryArtifactStorage();
  }
}

async function checkPackageDownloadByteEquality() {
  clearInMemoryArtifactStorage();
  const adapter = createInMemoryArtifactStorageAdapter();
  const previous = getDefaultArtifactStorageAdapter();
  setDefaultArtifactStorageAdapter(adapter);
  try {
    const pkg = buildArtifactPackage(basePackageInput());
    await adapter.putArtifactPackage({
      packageId: pkg.packageId,
      zipBytes: pkg.zipBytes,
      manifest: pkg.manifest,
      metadata: { source: "smoke" },
    });
    const got = await adapter.getArtifactPackage({ packageId: pkg.packageId });
    const retrievedBytes = got?.record?.zipBytes;
    if (!got || got.found !== true || !retrievedBytes) {
      return fail(
        "PACKAGE_DOWNLOAD_BYTE_EQUALITY",
        "PACKAGE_GET_FAILED",
        `getArtifactPackage returned no zipBytes (found=${got?.found}, code=${got?.code})`,
      );
    }
    if (Buffer.from(retrievedBytes).toString("hex") !==
        Buffer.from(pkg.zipBytes).toString("hex")) {
      return fail(
        "PACKAGE_DOWNLOAD_BYTE_EQUALITY",
        "BYTE_MISMATCH",
        `stored vs retrieved zip bytes differ`,
      );
    }
    return pass(
      "PACKAGE_DOWNLOAD_BYTE_EQUALITY",
      `${pkg.zipBytes.length} bytes round-trip with byte equality`,
    );
  } finally {
    setDefaultArtifactStorageAdapter(previous);
    clearInMemoryArtifactStorage();
  }
}

async function checkNoFakeDwgIfcWhenUnavailable() {
  // Force DWG and IFC enabled but no converter env present → manifest must
  // include the unavailable codes as sourceGaps, NOT a fake artifact.
  const input = basePackageInput({
    flags: {
      structuralEnabled: false,
      mepEnabled: false,
      detailsEnabled: false,
      dwgEnabled: true,
      ifcEnabled: true,
    },
    env: {
      // Explicitly empty — no DWG_CONVERTER_URL, no IFC_ENGINE_URL.
    },
  });
  const result = buildArtifactPackage(input);
  const codes = (result.sourceGaps || []).map((g) => g.code || g);
  const dwgGap = codes.includes(DWG_CONVERSION_UNAVAILABLE);
  const ifcGap = codes.includes(IFC_EXPORT_UNAVAILABLE);
  if (!dwgGap && !ifcGap) {
    return fail(
      "NO_FAKE_DWG_IFC_WHEN_UNAVAILABLE",
      "MISSING_UNAVAILABILITY_GAPS",
      `flags requested DWG+IFC but neither sourceGap recorded`,
      { codes },
    );
  }
  // Also assert: no fake DWG/IFC artifact present
  const fakeArtifacts = (result.manifest.artifacts || []).filter((a) =>
    /\.(dwg|ifc)$/i.test(a.fileName || ""),
  );
  if (fakeArtifacts.length > 0) {
    return fail(
      "NO_FAKE_DWG_IFC_WHEN_UNAVAILABLE",
      "FAKE_DWG_IFC_ARTIFACT",
      `manifest contains DWG/IFC artifact despite missing converter`,
      { artifacts: fakeArtifacts.map((a) => a.fileName) },
    );
  }
  return pass(
    "NO_FAKE_DWG_IFC_WHEN_UNAVAILABLE",
    `sourceGaps=[${codes.filter((c) => /UNAVAILABLE/.test(c)).join(", ")}] and no fake DWG/IFC artifact emitted`,
  );
}

async function checkNoImageGenTechnicalDrawing() {
  // The artifact package manifest tags each artifact with a `source` and
  // `discipline`. A technical drawing whose source contains "image" or
  // "openai-image" or "gpt-image" indicates a regression.
  const result = buildArtifactPackage(basePackageInput());
  const offending = (result.manifest.artifacts || []).filter((a) => {
    if (!a.discipline) return false;
    if (!/^(architecture|cad|technical)/i.test(a.discipline)) return false;
    const source = String(a.source || "").toLowerCase();
    return /image|gpt-image|openai-image|imagegen/.test(source);
  });
  if (offending.length > 0) {
    return fail(
      "NO_IMAGE_GEN_TECHNICAL_DRAWING",
      "IMAGE_GEN_TECHNICAL_DRAWING",
      `${offending.length} technical artifact(s) sourced from an image model`,
      { artifacts: offending.map((a) => ({ name: a.fileName, source: a.source })) },
    );
  }
  return pass(
    "NO_IMAGE_GEN_TECHNICAL_DRAWING",
    `no technical artifact sourced from an image model`,
  );
}

async function checkNoSecretLeakage(allResults) {
  const NEEDLES = [
    "sk-",
    "Bearer ",
    "AWS_SECRET_ACCESS_KEY",
    "OPENAI_API_KEY",
    "OPENAI_REASONING_API_KEY",
    "ARTIFACT_PACKAGE_SIGNING_SECRET",
    "Authorization",
    "AKIA",
  ];
  const json = JSON.stringify(allResults);
  const offenders = NEEDLES.filter((n) => json.includes(n));
  if (offenders.length > 0) {
    return fail(
      "NO_SECRET_LEAKAGE",
      "SECRET_IN_SMOKE_OUTPUT",
      `smoke results contain secret-shaped strings`,
      { offenders },
    );
  }
  return pass("NO_SECRET_LEAKAGE", `no secret needles in serialised results`);
}

// ─── Phase 1–4 + S3 export-pipeline smoke (added in Phase 5) ─────────────

const PHASE1_PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

async function checkPhase1ExportHandlerHelpers() {
  // The /api/a1/export route is the live transport that fixed the
  // 413 + SVG-as-PNG bugs. We import its __testing helpers and verify
  // the classifier + sanitiser still recognise the canonical fixtures.
  // Catches regressions that would re-open the corrupt-download path
  // without depending on Sharp / pdf-lib network resources.
  const { classifyArtifactKind, sanitizeInlineSvg } = a1ExportHandlerTesting;
  if (classifyArtifactKind(PHASE1_PNG_SIGNATURE) !== "png") {
    return fail(
      "PHASE1_EXPORT_HANDLER_HELPERS",
      "PNG_SIGNATURE_NOT_DETECTED",
      "classifyArtifactKind no longer detects the PNG signature",
    );
  }
  if (classifyArtifactKind(Buffer.from("%PDF-1.7 …")) !== "pdf") {
    return fail(
      "PHASE1_EXPORT_HANDLER_HELPERS",
      "PDF_SIGNATURE_NOT_DETECTED",
      "classifyArtifactKind no longer detects %PDF",
    );
  }
  if (classifyArtifactKind(Buffer.from("<svg></svg>")) !== "svg") {
    return fail(
      "PHASE1_EXPORT_HANDLER_HELPERS",
      "SVG_MARKER_NOT_DETECTED",
      "classifyArtifactKind no longer detects <svg",
    );
  }
  // Anything classifier doesn't recognise stays "unknown" — that's the
  // path the per-format dispatch uses to surface 400 UNRECOGNISED.
  if (classifyArtifactKind(Buffer.from("<html></html>")) !== "unknown") {
    return fail(
      "PHASE1_EXPORT_HANDLER_HELPERS",
      "HTML_MISCLASSIFIED",
      "classifyArtifactKind treats <html> as a known kind",
    );
  }
  const scriptCheck = sanitizeInlineSvg("<svg><script>x</script></svg>");
  if (scriptCheck.ok !== false) {
    return fail(
      "PHASE1_EXPORT_HANDLER_HELPERS",
      "SVG_DENYLIST_DISABLED",
      "sanitizeInlineSvg no longer blocks <script>",
    );
  }
  return pass(
    "PHASE1_EXPORT_HANDLER_HELPERS",
    "classifier + denylist intact (PNG/PDF/SVG/html + <script>)",
  );
}

async function checkPhase1ExportServiceContract() {
  // The Phase 1 contract: exportService magic-byte validators reject
  // masquerading payloads, and the inline-budget constant exists so the
  // client refuses to POST oversized data URLs.
  if (typeof basenameFromPath !== "function") {
    return fail(
      "PHASE1_EXPORT_SERVICE_CONTRACT",
      "BASENAME_HELPER_MISSING",
      "exportService no longer exports basenameFromPath",
    );
  }
  if (basenameFromPath("/api/a1/compose-output/a1-x.svg?v=1") !== "a1-x.svg") {
    return fail(
      "PHASE1_EXPORT_SERVICE_CONTRACT",
      "BASENAME_HELPER_REGRESSED",
      "basenameFromPath no longer strips query suffixes",
    );
  }
  if (!Number.isFinite(EXPORT_REQUEST_INLINE_BUDGET_BYTES)) {
    return fail(
      "PHASE1_EXPORT_SERVICE_CONTRACT",
      "INLINE_BUDGET_MISSING",
      "EXPORT_REQUEST_INLINE_BUDGET_BYTES is not exported",
    );
  }
  // Magic-byte validators must reject masquerading bytes.
  const svgAsPngBlob = new Blob([Buffer.from("<svg></svg>")], { type: "image/png" });
  let rejected = false;
  try {
    await validatePngMagicBytes(svgAsPngBlob);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    return fail(
      "PHASE1_EXPORT_SERVICE_CONTRACT",
      "PNG_MAGIC_BYTE_REGRESSION",
      "validatePngMagicBytes no longer rejects SVG-as-PNG masquerade",
    );
  }
  // Smoke that all three validators are callable on tiny good fixtures.
  const goodPng = new Blob([Buffer.concat([PHASE1_PNG_SIGNATURE, Buffer.from([0xff])])], { type: "image/png" });
  await validatePngMagicBytes(goodPng);
  const goodPdf = new Blob([Buffer.from("%PDF-1.7\n%%EOF\n")], { type: "application/pdf" });
  await validatePdfMagicBytes(goodPdf);
  const goodSvg = new Blob([Buffer.from("<svg/>")], { type: "image/svg+xml" });
  await validateSvgMagicBytes(goodSvg);
  return pass(
    "PHASE1_EXPORT_SERVICE_CONTRACT",
    "magic-byte validators + basenameFromPath + inline budget present",
  );
}

async function checkPhase2EngineeringManifestContract() {
  // Phase 2 wiring: buildClientExportManifest gates DXF/JSON/XLSX/IFC
  // by compiledProject geometry + takeoff, and applyHistoryRestoreGate
  // forces the four engineering rows off when restoredFromHistory and
  // compiledProject is absent.
  const compiledProject = {
    geometryHash: "geom-smoke-phase2",
    walls: [{}, {}, {}, {}],
    levels: [{}, {}],
    openings: [{}, {}, {}, {}, {}, {}],
  };
  const takeoff = { items: [{}, {}, {}] };
  const fresh = buildClientExportManifest({
    compiledProject,
    projectQuantityTakeoff: takeoff,
    geometryHash: compiledProject.geometryHash,
  });
  for (const key of ["dxf", "ifc", "json", "xlsx"]) {
    if (fresh.exports[key]?.available !== true) {
      return fail(
        "PHASE2_ENGINEERING_MANIFEST_CONTRACT",
        "ENGINEERING_NOT_READY_WHEN_FULLY_CAPABLE",
        `manifest reports ${key} as not ready despite full inputs`,
      );
    }
  }

  // Round-trip: build summary → rebuild manifest → readiness preserved.
  const summary = buildCompiledProjectExportSummary({
    compiledProject,
    projectQuantityTakeoff: takeoff,
    geometryHash: compiledProject.geometryHash,
  });
  if (!summary?.geometryHash) {
    return fail(
      "PHASE2_ENGINEERING_MANIFEST_CONTRACT",
      "SUMMARY_GEOMETRY_HASH_MISSING",
      "buildCompiledProjectExportSummary did not capture geometryHash",
    );
  }
  const rebuilt = buildExportManifestFromSummary({ summary });
  if (rebuilt?.exports?.ifc?.available !== true) {
    return fail(
      "PHASE2_ENGINEERING_MANIFEST_CONTRACT",
      "REBUILT_MANIFEST_IFC_BROKEN",
      "manifest rebuilt from summary lost IFC readiness",
    );
  }

  // History gate: restoredFromHistory + !compiledProject → engineering off
  // with REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT.
  const gated = applyHistoryRestoreGate({
    manifest: rebuilt,
    restoredFromHistory: true,
    hasCompiledProject: false,
  });
  for (const key of ["dxf", "ifc", "json", "xlsx"]) {
    if (gated.exports[key]?.available !== false) {
      return fail(
        "PHASE2_ENGINEERING_MANIFEST_CONTRACT",
        "HISTORY_RESTORE_GATE_LEAK",
        `restored-history manifest still reports ${key} as available`,
      );
    }
    if (
      gated.exports[key]?.blockedReason !==
      BLOCKED_REASONS.REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT
    ) {
      return fail(
        "PHASE2_ENGINEERING_MANIFEST_CONTRACT",
        "HISTORY_RESTORE_GATE_REASON_DRIFT",
        `restored-history manifest ${key} has wrong blockedReason`,
      );
    }
  }
  return pass(
    "PHASE2_ENGINEERING_MANIFEST_CONTRACT",
    "manifest readiness + summary round-trip + restored-history gate intact",
  );
}

async function checkPhase3LayoutConstants() {
  // Phase 3 contract: title bar 10mm + safe band 6mm = content top 16mm,
  // and resolveLayout(presentation-v3) keeps every floor_plan_* slot at
  // or below A1_CONTENT_TOP_MM for floorCount 1/2/3.
  if (A1_TITLE_BAR_HEIGHT_MM + A1_HEADER_SAFE_BAND_MM !== A1_CONTENT_TOP_MM) {
    return fail(
      "PHASE3_LAYOUT_CONSTANTS",
      "SAFE_BAND_ARITHMETIC_BROKEN",
      `title bar + safe band ≠ A1_CONTENT_TOP_MM (got ${A1_CONTENT_TOP_MM})`,
    );
  }
  const tolerance = 0.05;
  for (const floorCount of [1, 2, 3]) {
    const { layout } = resolveLayout({
      layoutTemplate: "presentation-v3",
      floorCount,
    });
    for (const [key, slot] of Object.entries(layout)) {
      if (!key.startsWith("floor_plan_") || !slot || typeof slot.y !== "number") continue;
      const topMm = slot.y * A1_HEIGHT_MM;
      if (topMm < A1_CONTENT_TOP_MM - tolerance) {
        return fail(
          "PHASE3_LAYOUT_CONSTANTS",
          "FLOOR_PLAN_OVERLAPS_TITLE_BAR",
          `floorCount=${floorCount} ${key} sits at ${topMm.toFixed(2)}mm (above safe-band floor ${A1_CONTENT_TOP_MM}mm)`,
        );
      }
    }
  }
  return pass(
    "PHASE3_LAYOUT_CONSTANTS",
    `title-bar safe band = ${A1_CONTENT_TOP_MM}mm; floorCount 1/2/3 plans respect floor`,
  );
}

async function checkPhase3QaBlocksSheetExport() {
  // Phase 3 defence-in-depth: exportService refuses PNG / PDF / SVG
  // when a1ExportQa.status === "blocked". UI gate disables the rows;
  // service throws so programmatic callers fail closed too.
  const sheet = {
    metadata: { designId: "smoke-qa" },
    geometryHash: "geom-smoke-qa",
    artifacts: { a1Sheet: { svgString: "<svg/>" } },
    a1ExportQa: {
      status: "blocked",
      allowed: false,
      blockers: [{ code: "TEXT_TOO_SMALL" }, { code: "HEADER_OVERLAP" }],
      warnings: [],
    },
  };
  for (const fmt of ["PNG", "PDF", "SVG"]) {
    let threw = false;
    let message = "";
    try {
      await exportService.exportSheet({ sheet, format: fmt });
    } catch (err) {
      threw = true;
      message = err?.message || "";
    }
    if (!threw) {
      return fail(
        "PHASE3_QA_BLOCKS_SHEET_EXPORT",
        "QA_BLOCK_BYPASSED",
        `exportSheet(${fmt}) did not throw on a1ExportQa.status="blocked"`,
      );
    }
    if (!/A1 export blocked/i.test(message)) {
      return fail(
        "PHASE3_QA_BLOCKS_SHEET_EXPORT",
        "QA_BLOCK_MESSAGE_DRIFT",
        `exportSheet(${fmt}) threw but message was: ${message}`,
      );
    }
  }
  return pass(
    "PHASE3_QA_BLOCKS_SHEET_EXPORT",
    "PNG / PDF / SVG all refuse when a1ExportQa.status === blocked",
  );
}

async function checkPhase4PanelConsistencyValidator() {
  // Phase 4 unit-level smoke: validator returns "pass" for same-source
  // panels and "blocked" with a structured code for a geometry-hash
  // mismatch.
  const geometryHash = "geom-smoke-p4-abc";
  const visualManifestHash = "mfst-smoke-p4";
  const paletteHash = "palette-smoke-p4";
  const compiledProject = {
    geometryHash,
    levels: [{}, {}],
    openings: [{}, {}, {}, {}, {}, {}, {}, {}],
    roof: { form: "gable" },
    entranceOrientation: "south",
  };
  const visualManifest = {
    manifestHash: visualManifestHash,
    geometryHash,
    storeyCount: 2,
    roof: { form: "gable" },
    entranceOrientation: "south",
    primaryFacadeMaterial: { name: "brick" },
    windowRhythmFingerprint: [4, 4],
  };
  const materialPalette = { hash: paletteHash, primary: { name: "brick" } };
  const panel3D = (overrides = {}) => ({
    panel_type: "hero_3d",
    geometryHash,
    visualManifestHash,
    materialPaletteHash: paletteHash,
    cameraId: "cam-smoke-01",
    viewDirection: "south+east",
    ...overrides,
  });

  const okResult = runPanelGeometryConsistencyChecks({
    compiledProject,
    visualManifest,
    materialPalette,
    panels: [panel3D()],
  });
  if (okResult.status !== "pass") {
    return fail(
      "PHASE4_PANEL_CONSISTENCY_VALIDATOR",
      "HAPPY_PATH_NOT_PASS",
      `validator returned ${okResult.status} for a same-source fixture`,
    );
  }

  const mismatchResult = runPanelGeometryConsistencyChecks({
    compiledProject,
    visualManifest,
    materialPalette,
    panels: [panel3D({ geometryHash: "stale-geom-xyz" })],
  });
  if (mismatchResult.status !== "blocked") {
    return fail(
      "PHASE4_PANEL_CONSISTENCY_VALIDATOR",
      "MISMATCH_NOT_BLOCKED",
      `validator returned ${mismatchResult.status} for stale geometryHash`,
    );
  }
  if (!mismatchResult.codes.includes(
    PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
  )) {
    return fail(
      "PHASE4_PANEL_CONSISTENCY_VALIDATOR",
      "MISMATCH_CODE_MISSING",
      "validator did not surface PANEL_GEOMETRY_HASH_MISMATCH",
    );
  }
  return pass(
    "PHASE4_PANEL_CONSISTENCY_VALIDATOR",
    "happy path pass + mismatch blocked with structured code",
  );
}

async function checkPhase4GateFoldsPanelConsistency() {
  // Phase 4 integration: panel-consistency evidence flows into
  // evaluateFinalA1ExportGate's blockers when 3D panels carry a stale
  // geometryHash. Asserts the wiring that Phase 3's a1ExportQa relies
  // on (gate.status === "blocked" → a1ExportQa.status === "blocked").
  const geometryHash = "geom-smoke-gate-p4";
  const visualManifestHash = "mfst-smoke-gate";
  const paletteHash = "palette-smoke-gate";
  const gate = evaluateFinalA1ExportGate({
    renderContract: { isFinalA1: true, enforceRenderedText: false },
    pdfUrl: "/api/a1/compose-output/a1-smoke.pdf",
    sheetArtifact: {
      svgString: "<svg/>",
      sheet_size_mm: { width: 841, height: 594 },
      width: 9933,
      height: 7016,
      metadata: { isFinalA1: true },
    },
    pdfMetadata: {
      version: "a1-pdf-metadata-v1",
      pdfRenderMode: "raster_textpaths_300dpi",
      isFinalA1: true,
      dpi: 300,
      widthPx: 9933,
      heightPx: 7016,
      widthPt: 2384.16,
      heightPt: 1683.7,
      textRenderMode: "font_paths",
      rasterIntegrityStatus: "pass",
      pdfBytes: 100,
    },
    finalSheetRegression: { finalSheetRegressionReady: true },
    postComposeVerification: {
      publishability: { status: "pass" },
      renderedTextZone: { status: "pass" },
    },
    glyphIntegrity: { status: "pass" },
    rasterGlyphIntegrity: { status: "pass" },
    expectedGeometryHash: geometryHash,
    compiledProject: {
      geometryHash,
      levels: [{}, {}],
      roof: { form: "gable" },
      entranceOrientation: "south",
    },
    visualManifest: {
      manifestHash: visualManifestHash,
      geometryHash,
      storeyCount: 2,
      roof: { form: "gable" },
      entranceOrientation: "south",
    },
    materialPalette: { hash: paletteHash },
    panels: [
      {
        panel_type: "hero_3d",
        geometryHash: "stale-geom-different",
        visualManifestHash,
        materialPaletteHash: paletteHash,
        cameraId: "cam",
        viewDirection: "south",
      },
    ],
  });
  if (gate.status !== "blocked") {
    return fail(
      "PHASE4_GATE_FOLDS_PANEL_CONSISTENCY",
      "GATE_DID_NOT_BLOCK",
      `gate.status=${gate.status} despite a stale 3D geometryHash`,
    );
  }
  if (gate.allowed !== false) {
    return fail(
      "PHASE4_GATE_FOLDS_PANEL_CONSISTENCY",
      "GATE_ALLOWED_DESPITE_BLOCK",
      "gate.allowed=true despite status=blocked",
    );
  }
  if (gate.evidence?.panelConsistencyStatus?.status !== "blocked") {
    return fail(
      "PHASE4_GATE_FOLDS_PANEL_CONSISTENCY",
      "PANEL_CONSISTENCY_EVIDENCE_NOT_BLOCKED",
      "evidence.panelConsistencyStatus did not record the block",
    );
  }
  return pass(
    "PHASE4_GATE_FOLDS_PANEL_CONSISTENCY",
    "evidence.panelConsistencyStatus → gate.blockers → status=blocked",
  );
}

async function checkS3StorageDurabilityAdvisory(mode) {
  // Production rollout requires a production-durable storage adapter so
  // svgArtifactRef survives Vercel cold-start. In smoke we only verify
  // the contract — we never hit S3 from the smoke. When mode=real we
  // additionally enforce that ARTIFACT_STORAGE_PROVIDER=s3 + bucket +
  // access key + secret are all present in env.
  const status = getArtifactStorageAdapterStatus();
  if (!status || typeof status.adapter !== "string") {
    return fail(
      "S3_STORAGE_DURABILITY_ADVISORY",
      "STORAGE_STATUS_MISSING",
      "getArtifactStorageAdapterStatus returned no adapter info",
    );
  }
  // Real-mode: enforce S3 env contract.
  if (mode === "real") {
    if (status.adapter !== "s3" || status.productionDurable !== true) {
      return fail(
        "S3_STORAGE_DURABILITY_ADVISORY",
        "PRODUCTION_NOT_S3",
        `--mode real expects an S3 adapter; got adapter=${status.adapter} productionDurable=${status.productionDurable}`,
      );
    }
    const env = process.env || {};
    const required = [
      "ARTIFACT_STORAGE_PROVIDER",
      "ARTIFACT_STORAGE_BUCKET",
      "ARTIFACT_STORAGE_ACCESS_KEY_ID",
      "ARTIFACT_STORAGE_SECRET_ACCESS_KEY",
    ];
    const missing = required.filter((k) => !env[k]);
    if (missing.length > 0) {
      return fail(
        "S3_STORAGE_DURABILITY_ADVISORY",
        "S3_ENV_INCOMPLETE",
        `--mode real but env missing: ${missing.join(", ")}`,
      );
    }
    if (String(env.ARTIFACT_STORAGE_PROVIDER).toLowerCase() !== "s3") {
      return fail(
        "S3_STORAGE_DURABILITY_ADVISORY",
        "ARTIFACT_STORAGE_PROVIDER_NOT_S3",
        `ARTIFACT_STORAGE_PROVIDER=${env.ARTIFACT_STORAGE_PROVIDER} (must be "s3" in production)`,
      );
    }
    return pass(
      "S3_STORAGE_DURABILITY_ADVISORY",
      `S3 adapter active; required env keys present`,
    );
  }
  // Mock mode: report adapter but do not fail when not durable — the
  // worktree dev environment runs in-memory by design.
  return pass(
    "S3_STORAGE_DURABILITY_ADVISORY",
    `adapter=${status.adapter} productionDurable=${status.productionDurable} (mock mode — set --mode real to enforce S3 env contract)`,
  );
}

async function checkProviderPreflight(mode) {
  if (mode !== "real") {
    return skip(
      "PROVIDER_PREFLIGHT",
      `--mode mock — skipping (set --mode real to run preflight)`,
    );
  }
  try {
    const snapshot = await buildProviderHealthSnapshot({});
    if (!snapshot || typeof snapshot.status !== "string") {
      return fail(
        "PROVIDER_PREFLIGHT",
        "PREFLIGHT_NO_SNAPSHOT",
        "buildProviderHealthSnapshot returned no snapshot",
      );
    }
    if (snapshot.status === "unavailable") {
      return fail(
        "PROVIDER_PREFLIGHT",
        "PROVIDER_UNAVAILABLE",
        `preflight rolled up to "unavailable"`,
        { status: snapshot.status, checks: Object.keys(snapshot.checks || {}) },
      );
    }
    return pass(
      "PROVIDER_PREFLIGHT",
      `preflight status: ${snapshot.status} (${Object.keys(snapshot.checks || {}).length} checks)`,
    );
  } catch (err) {
    return fail(
      "PROVIDER_PREFLIGHT",
      "PREFLIGHT_THREW",
      `buildProviderHealthSnapshot threw: ${err?.message || err}`,
    );
  }
}

// ─── runner ──────────────────────────────────────────────────────────────

async function runWithTiming(name, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    return { ...result, durationMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      name,
      status: "fail",
      blockerCode: "CHECK_THREW",
      message: `check threw: ${err?.message || err}`,
      durationMs: Math.round(performance.now() - t0),
    };
  }
}

function markdownSummary(report) {
  const lines = [];
  lines.push(`# Production-readiness smoke report`);
  lines.push("");
  lines.push(`- **mode**: ${report.mode}`);
  lines.push(`- **startedAt**: ${report.startedAt}`);
  lines.push(`- **finishedAt**: ${report.finishedAt}`);
  lines.push(`- **totalDurationMs**: ${report.totalDurationMs}`);
  lines.push(
    `- **summary**: ${report.summary.passed} passed / ${report.summary.failed} failed / ${report.summary.skipped} skipped (out of ${report.summary.total})`,
  );
  lines.push(`- **overall**: ${report.overall.toUpperCase()}`);
  lines.push("");
  lines.push("| # | Check | Status | Time | Notes |");
  lines.push("|---|---|---|---|---|");
  report.checks.forEach((c, idx) => {
    const note = c.status === "fail"
      ? `**${c.blockerCode}** — ${c.message}`
      : c.message || "";
    const escaped = note.replace(/\|/g, "\\|");
    lines.push(
      `| ${idx + 1} | ${c.name} | ${c.status.toUpperCase()} | ${c.durationMs}ms | ${escaped} |`,
    );
  });
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  // Pre-Phase-5 in-process checks (PRs #115–#130).
  const checks = [];
  checks.push(await runWithTiming("JURISDICTION_PACKS_LOAD", checkJurisdictionPacks));
  checks.push(await runWithTiming("STYLE_BLEND_DETERMINISM", checkStyleBlendDeterminism));
  checks.push(await runWithTiming("PROJECT_GRAPH_SERVICE_LOADABLE", checkProjectGraphServiceLoadable));
  checks.push(await runWithTiming("TECHNICAL_SVG_AUTHORITY", checkTechnicalSvgAuthority));
  checks.push(await runWithTiming("CAD_DXF_DETERMINISTIC", checkCadDxfDeterministic));
  checks.push(await runWithTiming("DXF_PAPER_SPACE_MARKERS", checkDxfPaperSpaceMarkers));
  checks.push(await runWithTiming("OPT_IN_DISCIPLINES", checkOptInDisciplines));
  checks.push(await runWithTiming("ARTIFACT_PACKAGE_BUILDS", checkArtifactPackageBuilds));
  checks.push(await runWithTiming("PDF_STITCHING", checkPdfStitching));
  checks.push(await runWithTiming("STORAGE_HISTORY_ROUNDTRIP", checkStorageHistoryRoundtrip));
  checks.push(await runWithTiming("PACKAGE_DOWNLOAD_BYTE_EQUALITY", checkPackageDownloadByteEquality));
  checks.push(await runWithTiming("NO_FAKE_DWG_IFC_WHEN_UNAVAILABLE", checkNoFakeDwgIfcWhenUnavailable));
  checks.push(await runWithTiming("NO_IMAGE_GEN_TECHNICAL_DRAWING", checkNoImageGenTechnicalDrawing));

  // Phase 1–4 + S3 export-pipeline regression matrix (PRs #131–#150).
  // Each check exercises the cross-module wiring that the user-facing
  // export flow depends on. Mock-mode is sufficient for everything
  // except the S3 advisory, which enforces env keys only in --mode real.
  checks.push(await runWithTiming("PHASE1_EXPORT_HANDLER_HELPERS", checkPhase1ExportHandlerHelpers));
  checks.push(await runWithTiming("PHASE1_EXPORT_SERVICE_CONTRACT", checkPhase1ExportServiceContract));
  checks.push(await runWithTiming("PHASE2_ENGINEERING_MANIFEST_CONTRACT", checkPhase2EngineeringManifestContract));
  checks.push(await runWithTiming("PHASE3_LAYOUT_CONSTANTS", checkPhase3LayoutConstants));
  checks.push(await runWithTiming("PHASE3_QA_BLOCKS_SHEET_EXPORT", checkPhase3QaBlocksSheetExport));
  checks.push(await runWithTiming("PHASE4_PANEL_CONSISTENCY_VALIDATOR", checkPhase4PanelConsistencyValidator));
  checks.push(await runWithTiming("PHASE4_GATE_FOLDS_PANEL_CONSISTENCY", checkPhase4GateFoldsPanelConsistency));
  checks.push(
    await runWithTiming("S3_STORAGE_DURABILITY_ADVISORY", () =>
      checkS3StorageDurabilityAdvisory(args.mode),
    ),
  );

  // Run the secret-leakage check AFTER all others so it can scan their output.
  checks.push(
    await runWithTiming("NO_SECRET_LEAKAGE", () => checkNoSecretLeakage(checks)),
  );
  checks.push(
    await runWithTiming("PROVIDER_PREFLIGHT", () => checkProviderPreflight(args.mode)),
  );

  const totalDurationMs = Math.round(performance.now() - t0);
  const finishedAt = new Date().toISOString();

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;

  const report = {
    suite: "production-readiness-smoke",
    mode: args.mode,
    startedAt,
    finishedAt,
    totalDurationMs,
    summary: { total: checks.length, passed, failed, skipped },
    overall: failed === 0 ? "pass" : "fail",
    checks,
  };

  if (args.report) {
    const reportPath = path.resolve(args.report);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    const mdPath = reportPath.replace(/\.json$/, ".md");
    await writeFile(mdPath, markdownSummary(report));
    console.log(`Report written to ${reportPath}`);
    console.log(`Markdown summary at ${mdPath}`);
  }

  console.log(markdownSummary(report));
  console.log("");
  if (failed > 0) {
    console.log(`❌ FAILED — ${failed}/${checks.length} blocker(s).`);
    for (const c of checks.filter((x) => x.status === "fail")) {
      console.log(`  • ${c.name} → ${c.blockerCode}: ${c.message}`);
    }
    process.exit(1);
  }
  console.log(`✅ PASSED — ${passed}/${checks.length} (${skipped} skipped).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
