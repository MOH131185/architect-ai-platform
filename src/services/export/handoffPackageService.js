/**
 * Phase 6 — One-click Handoff Package (Track 6).
 *
 * Composes the full architect/engineer handoff bundle on top of
 * `buildArtifactPackageWithPdfStitching` (Phase 1–5 path). Phase 6 adds:
 *
 *   - model.glb              — deterministic GLB from compiledProject
 *   - cad/<slug>.dwg         — DWG when ODA File Converter configured
 *   - cad/DWG_UNAVAILABLE.txt — fallback text when DWG conversion is off
 *   - schedules/quantity_takeoff.csv
 *   - project_graph.json
 *   - README.md
 *   - handoff.json           — schema-versioned manifest carrying
 *                              geometryHash, qa.status, disclaimers,
 *                              file list with sha256 + size; cross-
 *                              verifiable against IFC IfcProject.Description
 *                              (Phase 2 wiring), GLB extras (Phase 5 wiring),
 *                              DXF A-METADATA layer (Phase 2 wiring), cost
 *                              workbook Summary sheet (Phase 3 wiring).
 *
 * AUTHORITY MODEL — ProjectGraph compiled geometry remains the only
 * geometry authority. handoff.json's `geometryHash` is the cross-check
 * surface; every artifact that can carry the hash inside its own file
 * carries it. Mismatch → e2e test fails → package is not shipped.
 *
 * Tests:
 *   - src/__tests__/services/export/handoffPackageService.test.js (unit)
 *   - src/__tests__/integration/handoff-package.e2e.test.js (end-to-end:
 *     compileProject -> buildHandoffArtifactPackage -> ZIP -> geometryHash
 *     parity across handoff.json, GLB extras, IFC body, DXF A-METADATA,
 *     cost workbook).
 */

import {
  buildArtifactPackageWithPdfStitching,
  hashBytes,
  sha256HexBytes,
  ARTIFACT_PACKAGE_SCHEMA_VERSION,
} from "./artifactPackageService.js";
import { buildCompiledProjectGlb } from "../3d/compiledProjectGlbWriter.js";
import {
  convertDxfToDwg,
  resolveDwgConversionCapabilities,
  DwgConversionUnavailableError,
  DwgConversionRuntimeError,
  DWG_CONVERTER_DOCS_URL,
} from "../cad/dwgConversionAdapter.js";

export const HANDOFF_MANIFEST_SCHEMA_VERSION = "handoff-manifest-v1";
export const HANDOFF_PACKAGE_SERVICE_VERSION = "handoff-package-service-v1";

const STRUCTURAL_REVIEW_DISCLAIMER =
  "Structural intent is preliminary. Final design and load paths must be reviewed and signed off by a licensed structural engineer.";
const MEP_REVIEW_DISCLAIMER =
  "MEP layouts are preliminary. Final design must be reviewed and signed off by licensed mechanical, electrical and plumbing engineers.";
const COST_RATE_CARD_FALLBACK_DISCLAIMER =
  "Cost workbook uses a proxy rate card for the resolved building type. Adjust rates to your local market before issuing.";
const COST_MISSING_RATES_DISCLAIMER =
  "Cost workbook contains takeoff items without rates in the active rate card. A reviewer must price these manually before issuing.";

function safeName(value, fallback = "project") {
  return (
    String(value || fallback)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80) || fallback
  );
}

function jsonStringifyStable(value) {
  return JSON.stringify(value, null, 2);
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildQuantityTakeoffCsv(takeoff) {
  const items = Array.isArray(takeoff?.items) ? takeoff.items : [];
  const header = [
    "category",
    "item",
    "unit",
    "quantity",
    "description",
    "notes",
  ];
  const rows = [header.join(",")];
  for (const item of items) {
    rows.push(
      [
        item.category || "",
        item.item || item.description || "",
        item.unit || "",
        item.quantity ?? "",
        item.description || "",
        item.notes || "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

function deriveDisclaimers({
  flags = {},
  costSummary = null,
  dwgAvailable = false,
}) {
  const disclaimers = [];
  if (flags?.structuralEnabled) {
    disclaimers.push({
      code: "STRUCTURAL_REVIEW_REQUIRED",
      message: STRUCTURAL_REVIEW_DISCLAIMER,
    });
  }
  if (flags?.mepEnabled) {
    disclaimers.push({
      code: "MEP_REVIEW_REQUIRED",
      message: MEP_REVIEW_DISCLAIMER,
    });
  }
  if (costSummary?.rateCardFallbackWarning) {
    disclaimers.push({
      code: "COST_RATE_CARD_FALLBACK",
      message: COST_RATE_CARD_FALLBACK_DISCLAIMER,
      details: costSummary.rateCardFallbackWarning,
    });
  }
  if (costSummary?.missingRatesWarning) {
    disclaimers.push({
      code: "COST_MISSING_RATES",
      message: COST_MISSING_RATES_DISCLAIMER,
      details: costSummary.missingRatesWarning,
    });
  }
  if (!dwgAvailable) {
    disclaimers.push({
      code: "DWG_UNAVAILABLE",
      message:
        "DWG output was not produced. Install the ODA File Converter on the server (see DWG_UNAVAILABLE.txt or docsUrl below).",
      docsUrl: DWG_CONVERTER_DOCS_URL,
    });
  }
  return disclaimers;
}

function deriveQaStatus({ qaReport, a1ExportQa }) {
  // The QA contract supports four states across two surfaces:
  //  - qaReport.status:        "pass" | "warn" | "fail"
  //  - a1ExportQa.status:      "pass" | "warning" | "degraded" | "blocked"
  //  - a1ExportQa.allowed:     false ⇒ the sheet was hard-blocked
  // The handoff.json `qa.status` is a single string the downstream
  // consumer can read at a glance.
  if (a1ExportQa?.allowed === false || a1ExportQa?.status === "blocked") {
    return "blocked";
  }
  if (
    a1ExportQa?.status === "degraded" ||
    a1ExportQa?.degradedExport === true
  ) {
    return "degraded";
  }
  if (a1ExportQa?.status === "warning" || qaReport?.status === "warn") {
    return "warning";
  }
  if (qaReport?.status === "fail") return "blocked";
  return "pass";
}

function buildReadmeMarkdown({
  projectName,
  geometryHash,
  pipelineVersion,
  packageHash,
  generatedAt,
  files = [],
  disclaimers = [],
  qa = {},
  dwgAvailable = false,
}) {
  const fileList = files
    .map(
      (file) =>
        `- \`${file.path}\` — ${file.size} bytes, sha256 \`${file.sha256?.slice(0, 16) || "n/a"}\``,
    )
    .join("\n");
  const disclaimerList = disclaimers.length
    ? disclaimers.map((d) => `- **${d.code}** — ${d.message}`).join("\n")
    : "_None._";
  return `# ${projectName} — Architect / Engineer Handoff Package

Generated by **${HANDOFF_PACKAGE_SERVICE_VERSION}** on ${generatedAt}.

## Authority

- **geometryHash:** \`${geometryHash || "missing"}\`
- **pipelineVersion:** \`${pipelineVersion || "unknown"}\`
- **packageHash:** \`${packageHash || "unknown"}\`

The same \`geometryHash\` is embedded in:
- this README
- \`handoff.json\` (the manifest you can parse programmatically)
- \`model.ifc\` (\`IfcProject.Description\`)
- \`model.glb\` (glTF \`extras.geometryHash\`)
- \`drawings.dxf\` (\`A-METADATA\` layer text entity)
- \`schedules/cost_estimate.xlsx\` (Summary sheet)

Run the integration test \`src/__tests__/integration/handoff-package.e2e.test.js\`
to verify all five surfaces match.

## QA Status

- **Status:** \`${qa.status || "unknown"}\`
- **Blockers:** ${qa.blockerCount ?? 0}
- **Warnings:** ${qa.warningCount ?? 0}
${
  qa.status === "blocked"
    ? "\n> ⚠ The sheet was hard-blocked. Use the artifacts below only after fixing the underlying authority/geometry failure.\n"
    : qa.status === "degraded"
      ? '\n> ⚠ The A1 sheet was emitted in degraded mode (readability/graphic warnings). The PDF carries a "PRELIMINARY — QA WARNINGS" stamp.\n'
      : ""
}

## Files

${fileList || "_No artifacts captured._"}

## Disclaimers

${disclaimerList}

## DWG

${
  dwgAvailable
    ? "DWG conversion ran. See `cad/*.dwg` for the AutoCAD-native output."
    : `DWG conversion was not configured on this server. The package contains \`cad/DWG_UNAVAILABLE.txt\` explaining why. Install [ODA File Converter](${DWG_CONVERTER_DOCS_URL}) on the server and set \`DWG_CONVERSION_ENABLED=true\` + \`DWG_CONVERSION_PROVIDER=oda\` + \`ODA_FILE_CONVERTER_PATH=<path>\` to enable it on a future run. DXF (\`cad/*.dxf\`) is the deterministic CAD authority and is always present.`
}

## Regenerate

This package was produced by the deterministic ProjectGraph pipeline.
To regenerate from the same brief:

1. Re-run \`/api/project/generate-vertical-slice\` with the same input payload.
2. The vertical slice will recompile the project; the resulting
   \`geometryHash\` must match \`${geometryHash || "<missing>"}\`.
3. If the hash differs, the brief, materials, or pipeline version has
   changed — diff against \`project_graph.json\` to find what moved.
`;
}

function fileEntryFor(artifact) {
  return {
    path: artifact.fileName,
    // Phase 6 — Codex audit blocker #1. Real SHA-256 from the artifact
    // package service, not the legacy FNV fingerprint. The artifact-
    // package service computes both during materialisation and exposes
    // them as artifact.sha256 + artifact.hash respectively; we ship the
    // sha256 here because that's what external verifiers can recompute
    // from the ZIP entry bytes with `openssl dgst -sha256` / Node
    // `crypto.createHash('sha256')` / Python `hashlib.sha256` / any
    // standard SHA-256 implementation.
    sha256: artifact.sha256 || null,
    size: artifact.byteLength,
    type: artifact.type,
    role: artifact.role,
    discipline: artifact.discipline,
  };
}

// Phase 6 — Codex audit blocker #1+#2 response.
//
// handoff.json indexes the FINAL ZIP including manifest.json. handoff.json
// itself and README.md are excluded from `files` because they're generated
// FROM handoff.json's own content (including their sha256s in handoff.json
// is circular). Those self-referential files are explicitly listed in
// `selfReferentialFiles` so consumers don't think they're missing.
//
// packageHash carries the deterministic artifact-set fingerprint reported
// by buildArtifactPackage (which excludes handoff.json + README from the
// hash inputs via `extraZipEntries`). That same hash is what the
// orchestrator returns as `packageHash`, so handoff.json's claim and the
// returned value are byte-identical.
function buildHandoffJsonBody({
  projectName,
  geometryHash,
  pipelineVersion,
  generatedAt,
  packageHash,
  qa,
  disclaimers,
  artifacts = [],
  manifestFileEntry = null,
  selfReferentialFiles = ["handoff.json", "README.md"],
}) {
  const fileEntries = artifacts.map(fileEntryFor);
  if (manifestFileEntry) {
    fileEntries.push(manifestFileEntry);
  }
  return {
    schema: HANDOFF_MANIFEST_SCHEMA_VERSION,
    serviceVersion: HANDOFF_PACKAGE_SERVICE_VERSION,
    projectName,
    geometryHash: geometryHash || null,
    pipelineVersion: pipelineVersion || null,
    packageHash: packageHash || null,
    generatedAt,
    qa,
    disclaimers,
    files: fileEntries.sort((a, b) => a.path.localeCompare(b.path)),
    selfReferentialFiles: [...selfReferentialFiles].sort(),
    selfReferentialNote:
      "handoff.json and README.md are generated FROM this manifest. Their sha256/size are not included in `files` because doing so would be circular. They are listed in `selfReferentialFiles` so the index of the ZIP remains complete.",
  };
}

async function buildDwgArtifactOrFallback({ dxf, projectSlug, env }) {
  // If the caller did not produce a DXF (e.g. compiledProject path failed
  // before exportCompiledProjectToDXF), we cannot attempt DWG conversion.
  if (!dxf || typeof dxf !== "string") {
    return {
      dwg: null,
      dwgUnavailable: {
        code: "DWG_INPUT_MISSING",
        message: "No DXF input was available for DWG conversion.",
      },
    };
  }
  const capabilities = resolveDwgConversionCapabilities(env);
  if (!capabilities.available) {
    return {
      dwg: null,
      dwgUnavailable: {
        code: capabilities.code || "DWG_CONVERSION_UNAVAILABLE",
        message: capabilities.reason,
        docsUrl: capabilities.docsUrl,
        provider: capabilities.provider,
      },
    };
  }
  try {
    const result = await convertDxfToDwg({
      dxf,
      outputName: `${projectSlug}.dwg`,
      env,
    });
    return {
      dwg: result.dwg,
      adapterVersion: result.adapterVersion,
    };
  } catch (err) {
    return {
      dwg: null,
      dwgUnavailable: {
        code:
          err instanceof DwgConversionUnavailableError
            ? err.code || "DWG_CONVERSION_UNAVAILABLE"
            : err instanceof DwgConversionRuntimeError
              ? err.code
              : "DWG_CONVERSION_FAILED",
        message: err?.message || "DWG conversion failed.",
        docsUrl: DWG_CONVERTER_DOCS_URL,
        details: err?.details || null,
      },
    };
  }
}

function buildDwgUnavailableText({
  projectName,
  dwgUnavailable,
  geometryHash,
}) {
  return `DWG export was not produced for project "${projectName}".

geometryHash: ${geometryHash || "unknown"}

Reason
------
code:    ${dwgUnavailable?.code || "DWG_CONVERSION_UNAVAILABLE"}
message: ${dwgUnavailable?.message || "Unknown."}
${dwgUnavailable?.provider ? `provider: ${dwgUnavailable.provider}\n` : ""}
What to do
----------
- DXF is the deterministic CAD authority for this package. Every CAD-aware
  tool (AutoCAD, Revit, ArchiCAD, BricsCAD, FreeCAD, LibreCAD) can open it.
- To get a native DWG on a future export, install the ODA File Converter
  on the server (free, https://www.opendesign.com/guestfiles/oda_file_converter)
  and set these environment variables before regenerating:

    DWG_CONVERSION_ENABLED=true
    DWG_CONVERSION_PROVIDER=oda
    ODA_FILE_CONVERTER_PATH=<path to ODAFileConverter binary>

Docs: ${dwgUnavailable?.docsUrl || DWG_CONVERTER_DOCS_URL}
`;
}

/**
 * Build the Phase 6 handoff package.
 *
 * @param {object} input
 * @param {object} input.compiledProject               - Source geometry.
 * @param {string} [input.projectName]
 * @param {string} [input.pipelineVersion]
 * @param {object} [input.projectQuantityTakeoff]
 * @param {object} [input.costSummary]
 * @param {object} [input.qaReport]
 * @param {object} [input.a1ExportQa]
 * @param {object} [input.a1Sheet]
 * @param {object} [input.a1Pdf]
 * @param {object} [input.a1Png]
 * @param {Array}  [input.technicalDrawings]
 * @param {string|Uint8Array} [input.dxf]              - DXF text/bytes (used for DWG conversion).
 * @param {string|Uint8Array} [input.ifc]              - IFC text/bytes.
 * @param {Uint8Array} [input.schedulesWorkbook]       - Cost workbook bytes (xlsx).
 * @param {object} [input.projectGraph]                - Full project graph JSON object.
 * @param {object} [input.flags]                       - Discipline flags (structural/mep/details).
 * @param {object} [input.env]                         - Env override for the DWG adapter.
 */
export async function buildHandoffArtifactPackage(input = {}) {
  const projectName = input.projectName || "ArchiAI Project";
  const projectSlug = safeName(projectName);
  const compiledProject = input.compiledProject || null;
  const geometryHash =
    input.geometryHash ||
    compiledProject?.geometryHash ||
    compiledProject?.metadata?.geometryHash ||
    null;
  const pipelineVersion =
    input.pipelineVersion || "project-graph-vertical-slice-v1";
  const generatedAt = new Date(0).toISOString().replace(/\.\d{3}/, ".000");
  // Deterministic timestamp: real wall-clock time leaks into the ZIP and
  // would defeat the "byte-identical for identical inputs" property the
  // handoff promises. Callers in production can override input.generatedAt
  // if they want a real timestamp; default is the deterministic anchor.
  const effectiveGeneratedAt = input.generatedAt || generatedAt;

  // Phase 5 — build GLB from compiledProject. Failure here is non-fatal:
  // the package can still ship without GLB (the file will be omitted and
  // surfaced in handoff.json's qa.warnings).
  let glbBytes = null;
  let glbWarning = null;
  let glbResult = null;
  if (compiledProject) {
    try {
      glbResult = buildCompiledProjectGlb({
        ...compiledProject,
        metadata: {
          ...(compiledProject.metadata || {}),
          projectName,
        },
      });
      glbBytes = glbResult.glb;
    } catch (err) {
      glbWarning = {
        code: "GLB_BUILD_FAILED",
        message: err?.message || "GLB writer failed",
      };
    }
  } else {
    glbWarning = {
      code: "GLB_INPUT_MISSING",
      message: "No compiledProject was provided; GLB cannot be built.",
    };
  }

  // Phase 5 — DWG conversion or DWG_UNAVAILABLE.txt fallback.
  const dwgOutcome = await buildDwgArtifactOrFallback({
    dxf: typeof input.dxf === "string" ? input.dxf : null,
    projectSlug,
    env: input.env,
  });
  const dwgAvailable = Boolean(dwgOutcome.dwg);

  const flags = {
    structuralEnabled: Boolean(input.flags?.structuralEnabled),
    mepEnabled: Boolean(input.flags?.mepEnabled),
    detailsEnabled: Boolean(input.flags?.detailsEnabled),
  };
  const disclaimers = deriveDisclaimers({
    flags,
    costSummary: input.costSummary || null,
    dwgAvailable,
  });

  const qa = {
    status: deriveQaStatus({
      qaReport: input.qaReport || null,
      a1ExportQa: input.a1ExportQa || null,
    }),
    blockerCount: Array.isArray(input.a1ExportQa?.blockers)
      ? input.a1ExportQa.blockers.length
      : 0,
    warningCount: Array.isArray(input.a1ExportQa?.warnings)
      ? input.a1ExportQa.warnings.length
      : 0,
    degradedExport: Boolean(input.a1ExportQa?.degradedExport),
  };

  // Compose all the Phase 6 extras that aren't already in the existing
  // collectKnownArtifactCandidates() slots (the artifact-package service
  // already handles DXF, IFC, A1 sheet artifacts, structural/MEP, cost
  // workbook).
  const phase6Artifacts = [];

  if (glbBytes) {
    phase6Artifacts.push({
      type: "glb_model",
      fileName: `bim/${projectSlug}.glb`,
      mimeType: "model/gltf-binary",
      role: "3d_model",
      discipline: "bim",
      source: "compiledProjectGlbWriter (Phase 5)",
      content: glbBytes,
      geometryHash,
    });
  }

  if (dwgOutcome.dwg) {
    phase6Artifacts.push({
      type: "dwg",
      fileName: `cad/${projectSlug}.dwg`,
      mimeType: "application/x-dwg",
      role: "cad_native",
      discipline: "cad",
      source: "ODA File Converter via dwgConversionAdapter",
      content: dwgOutcome.dwg,
      geometryHash,
    });
  } else {
    phase6Artifacts.push({
      type: "dwg_unavailable",
      fileName: `cad/DWG_UNAVAILABLE.txt`,
      mimeType: "text/plain",
      role: "cad_native_fallback",
      discipline: "cad",
      source: "Phase 6 handoff package — DWG fallback",
      content: buildDwgUnavailableText({
        projectName,
        dwgUnavailable: dwgOutcome.dwgUnavailable,
        geometryHash,
      }),
    });
  }

  if (input.projectQuantityTakeoff) {
    phase6Artifacts.push({
      type: "quantity_takeoff_csv",
      fileName: `schedules/quantity_takeoff.csv`,
      mimeType: "text/csv",
      role: "schedule",
      discipline: "architecture",
      source: "Phase 6 handoff package — projectQuantityTakeoff",
      content: buildQuantityTakeoffCsv(input.projectQuantityTakeoff),
    });
  }

  if (input.projectGraph) {
    phase6Artifacts.push({
      type: "project_graph_json",
      fileName: `project_graph.json`,
      mimeType: "application/json",
      role: "authority_bundle",
      discipline: "architecture",
      source: "Phase 6 handoff package — projectGraph",
      content: `${jsonStringifyStable(input.projectGraph)}\n`,
    });
  }

  // Phase 6 — Codex audit blocker #1+#2 response.
  //
  // P1 = first pass with all Phase 6 artifacts + caller's existing
  // artifacts. The artifact-package service materialises everything,
  // computes manifest.artifacts (with each artifact's sha256), and emits
  // packageHash over THAT list. P1 does NOT yet contain handoff.json or
  // README.md.
  const phase6ArtifactsBase = {
    ...(input.artifacts || {}),
    dxf: input.dxf
      ? typeof input.dxf === "string"
        ? { content: input.dxf, type: "dxf" }
        : input.dxf
      : input.artifacts?.dxf || null,
    ifc: input.ifc
      ? typeof input.ifc === "string"
        ? { content: input.ifc, type: "ifc" }
        : input.ifc
      : input.artifacts?.ifc || null,
    schedulesWorkbook:
      input.schedulesWorkbook || input.artifacts?.schedulesWorkbook || null,
  };
  const existingArtifactsBase = [
    ...(input.existingArtifacts || []),
    ...phase6Artifacts,
  ];
  const p1 = await buildArtifactPackageWithPdfStitching({
    ...input,
    projectName,
    existingArtifacts: existingArtifactsBase,
    artifacts: phase6ArtifactsBase,
  });

  // Compose handoff.json against P1's manifest. packageHash here is
  // exactly what we'll return at the orchestrator surface (P2 has the
  // same artifact list, so its packageHash is identical to P1's).
  // Codex Phase 6 blocker #1 — use the real SHA-256 of the manifest
  // bytes, not the legacy FNV fingerprint. p1.manifestSha256 is byte-
  // identical to crypto.createHash("sha256").update(manifestBytes)
  // computed by external tooling.
  const manifestFileEntry = {
    path: "manifest.json",
    sha256: p1.manifestSha256 || null,
    size: Buffer.byteLength(
      `${JSON.stringify(p1.manifest, null, 2)}\n`,
      "utf8",
    ),
    type: "manifest",
    role: "package_manifest",
    discipline: "qa",
  };
  const handoffBody = buildHandoffJsonBody({
    projectName,
    geometryHash,
    pipelineVersion,
    generatedAt: effectiveGeneratedAt,
    packageHash: p1.packageHash,
    qa,
    disclaimers,
    artifacts: p1.manifest.artifacts || [],
    manifestFileEntry,
  });
  if (glbWarning) {
    handoffBody.qa = {
      ...handoffBody.qa,
      warnings: [...(handoffBody.qa?.warnings || []), glbWarning],
    };
  }
  const handoffJsonText = `${jsonStringifyStable(handoffBody)}\n`;

  const readme = buildReadmeMarkdown({
    projectName,
    geometryHash,
    pipelineVersion,
    packageHash: p1.packageHash,
    generatedAt: effectiveGeneratedAt,
    files: handoffBody.files,
    disclaimers,
    qa,
    dwgAvailable,
  });

  // P2 = same artifact inputs as P1 (so manifest.artifacts and
  // packageHash do NOT change) + handoff.json + README.md as
  // `extraZipEntries`. extraZipEntries are written into the ZIP but
  // explicitly NOT recorded in manifest.artifacts and NOT inputs to
  // packageHash, so P2.packageHash === P1.packageHash by construction.
  const finalPackage = await buildArtifactPackageWithPdfStitching({
    ...input,
    projectName,
    existingArtifacts: existingArtifactsBase,
    artifacts: phase6ArtifactsBase,
    extraZipEntries: [
      { fileName: "handoff.json", content: handoffJsonText },
      { fileName: "README.md", content: readme },
    ],
  });

  return {
    ...finalPackage,
    handoffJson: handoffBody,
    handoffJsonText,
    readme,
    glb: glbBytes
      ? { byteLength: glbBytes.length, sha256: sha256HexBytes(glbBytes) }
      : null,
    glbAdapterVersion: glbResult?.adapterVersion || null,
    dwgAvailable,
    dwgUnavailable: dwgOutcome.dwgUnavailable || null,
    dwgAdapterVersion: dwgOutcome.adapterVersion || null,
    disclaimers,
    qa,
    serviceVersion: HANDOFF_PACKAGE_SERVICE_VERSION,
    artifactPackageSchemaVersion: ARTIFACT_PACKAGE_SCHEMA_VERSION,
  };
}

export const __internal = {
  buildQuantityTakeoffCsv,
  deriveDisclaimers,
  deriveQaStatus,
  buildHandoffJsonBody,
  buildReadmeMarkdown,
  buildDwgUnavailableText,
  buildDwgArtifactOrFallback,
};

export default {
  HANDOFF_MANIFEST_SCHEMA_VERSION,
  HANDOFF_PACKAGE_SERVICE_VERSION,
  buildHandoffArtifactPackage,
};
