import fs from "fs";
import path from "path";

import { buildA1HardeningStamp } from "./a1HardeningStamp.js";

function sanitizeIdentifier(value, fallback = "unknown", maxLength = 80) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  const sanitized = raw.replace(/[^a-z0-9_-]/gi, "_");
  return sanitized.slice(0, maxLength) || fallback;
}

function consoleMethodForLevel(level) {
  if (level === "warn") return "warn";
  if (level === "error") return "error";
  if (level === "debug") return "debug";
  return "log";
}

export function createComposeTrace(body = {}) {
  const timestampMs = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const designId = sanitizeIdentifier(body?.designId, "unknown");
  const requestedRunId =
    body?.runId ||
    body?.meta?.runId ||
    body?.designFingerprint ||
    body?.meta?.designFingerprint ||
    body?.designId;

  return {
    traceId: `compose_${timestampMs}_${randomSuffix}`,
    runId: sanitizeIdentifier(requestedRunId, `compose_${timestampMs}`),
    designId,
    startedAt: new Date(timestampMs).toISOString(),
  };
}

export function logComposeEvent(trace, level, message, data) {
  const method = consoleMethodForLevel(level);
  const prefix = `[A1 Compose][${trace?.traceId || "unknown"}]`;

  if (data !== undefined) {
    console[method](`${prefix} ${message}`, data);
    return;
  }

  console[method](`${prefix} ${message}`);
}

// Aggregate the most-common authorityUsed/source per panel-class so the
// manifest carries a single human-readable summary alongside the full
// per-panel detail. Used by `buildComposeArtifactManifest` below to populate
// `manifest.authority.{technicalPanelsAuthority, visualPanelsAuthority}`.
const TECHNICAL_PANEL_PREFIXES = ["floor_plan_", "elevation_", "section_"];
function isTechnicalPanelKey(panelType) {
  return (
    typeof panelType === "string" &&
    TECHNICAL_PANEL_PREFIXES.some((prefix) => panelType.startsWith(prefix))
  );
}

function modeAuthority(panelEntries, predicate) {
  const counts = new Map();
  for (const [panelType, panel] of panelEntries) {
    if (!predicate(panelType)) continue;
    const key = panel?.authorityUsed || null;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

function modeSchemaVersion(panelEntries) {
  const counts = new Map();
  for (const [, panel] of panelEntries) {
    const key = panel?.compiledProjectSchemaVersion || null;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

export function buildComposeArtifactManifest({
  trace,
  completedAt,
  durationMs,
  layoutTemplate,
  transport,
  panelCount,
  panelKeys,
  designFingerprint,
  dnaHash,
  geometryHash,
  programHash,
  pngBytes,
  pdfBytes,
  outputFile,
  pdfOutputFile,
  qaResults,
  critiqueResults,
  panelsByKey = {},
  hashValidation = null,
  finalSheetRegression = null,
  postComposeVerification = null,
  authorityReadiness = null,
  deliveryStages = null,
  exportManifest = null,
  reviewSurface = null,
  sheetSetPlan = null,
  sheetSetArtifacts = null,
  // PR-D finishing — optional inputs from the request body so the manifest
  // can summarise boundary + main-entry authority alongside the technical
  // panel authority. Either may be null/undefined for non-residential or
  // pre-PR-C requests; the authority block stays sound regardless.
  boundaryAuthority = null,
  mainEntryAuthority = null,
}) {
  const sanitizedPanelsByKey = Object.fromEntries(
    Object.entries(panelsByKey || {}).map(([panelType, panel]) => [
      panelType,
      {
        type: panel?.type || panelType,
        hasBuffer: panel?.hasBuffer || false,
        coordinates: panel?.coordinates || null,
        geometryHash: panel?.geometryHash || null,
        svgHash: panel?.svgHash || null,
        sourceType: panel?.sourceType || null,
        authorityUsed: panel?.authorityUsed || null,
        authoritySource: panel?.authoritySource || null,
        panelAuthorityReason: panel?.panelAuthorityReason || null,
        generatorUsed: panel?.generatorUsed || null,
        compiledProjectSchemaVersion:
          panel?.compiledProjectSchemaVersion || null,
        slotMetrics: panel?.slotMetrics || null,
        renderSanity: panel?.renderSanity || null,
      },
    ]),
  );

  // PR-D finishing — top-level authority summary aggregated from
  // panelsByKey + optional boundary/mainEntry context. Single read-out for
  // ops/QA: did this run come from compiled-project canonical authority?
  const panelEntries = Object.entries(panelsByKey || {});
  const technicalPanelsAuthority = modeAuthority(
    panelEntries,
    isTechnicalPanelKey,
  );
  const visualPanelsAuthority = modeAuthority(
    panelEntries,
    (panelType) => !isTechnicalPanelKey(panelType),
  );
  const compiledProjectSchemaVersion = modeSchemaVersion(panelEntries);
  const authority = {
    geometryHash: geometryHash || null,
    compiledProjectSchemaVersion,
    canonicalProjectGeometryVersion: compiledProjectSchemaVersion,
    technicalPanelsAuthority,
    visualPanelsAuthority,
    boundaryAuthority: boundaryAuthority
      ? {
          source: boundaryAuthority.boundarySource || null,
          authoritative: boundaryAuthority.boundaryAuthoritative === true,
          areaM2:
            Number(
              boundaryAuthority.areaM2 ??
                boundaryAuthority.area ??
                boundaryAuthority.surfaceAreaM2 ??
                0,
            ) || 0,
          policyVersion: boundaryAuthority.policyVersion || null,
        }
      : null,
    mainEntryAuthority: mainEntryAuthority
      ? {
          direction:
            mainEntryAuthority.direction ||
            mainEntryAuthority.orientation ||
            null,
          bearingDeg:
            Number(
              mainEntryAuthority.bearingDeg ?? mainEntryAuthority.bearing ?? 0,
            ) || 0,
          source: mainEntryAuthority.source || null,
          confidence: Number(mainEntryAuthority.confidence ?? 0) || 0,
        }
      : null,
  };

  return {
    traceId: trace?.traceId || null,
    runId: trace?.runId || null,
    designId: trace?.designId || null,
    designFingerprint: designFingerprint || null,
    startedAt: trace?.startedAt || null,
    completedAt: completedAt || new Date().toISOString(),
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    layoutTemplate: layoutTemplate || null,
    transport: transport || null,
    panelCount: panelCount || 0,
    panelKeys: panelKeys || [],
    buildStamp: buildA1HardeningStamp(),
    authority,
    hashes: {
      dnaHash: dnaHash || null,
      geometryHash: geometryHash || null,
      programHash: programHash || null,
    },
    outputs: {
      pngBytes: pngBytes || 0,
      pdfBytes: pdfBytes || 0,
      outputFile: outputFile || null,
      pdfOutputFile: pdfOutputFile || null,
    },
    panelsByKey: sanitizedPanelsByKey,
    hashValidation,
    qa: qaResults
      ? {
          allPassed: qaResults.allPassed ?? null,
          summary: qaResults.summary || null,
          failureCount: qaResults.failures?.length || 0,
          warningCount: qaResults.warnings?.length || 0,
          skipped: qaResults.skipped || false,
          error: qaResults.error || null,
        }
      : null,
    critique: critiqueResults
      ? {
          overallPass: critiqueResults.overall_pass ?? null,
          layoutIssueCount: critiqueResults.layout_issues?.length || 0,
          regeneratePanelCount: critiqueResults.regenerate_panels?.length || 0,
          skipped: critiqueResults.skipped || false,
          error: critiqueResults.error || null,
        }
      : null,
    finalSheetRegression,
    postComposeVerification,
    sheetSetPlan,
    sheetSetArtifacts,
    authorityReadiness,
    deliveryStages,
    exportManifest,
    reviewSurface,
  };
}

export function writeComposeArtifactManifest({
  manifest,
  outputFile,
  outputDir,
  pdfOutputFile,
}) {
  if (!manifest) {
    return null;
  }

  let anchorPath = outputFile || null;
  if (!anchorPath && outputDir && pdfOutputFile) {
    anchorPath = path.join(outputDir, pdfOutputFile);
  }
  if (!anchorPath) {
    return null;
  }

  try {
    const manifestPath = path.join(
      path.dirname(anchorPath),
      `${path.basename(anchorPath, path.extname(anchorPath))}.manifest.json`,
    );
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
  } catch {
    return null;
  }
}

export function buildPublicArtifactUrl(filePath, publicUrlBase) {
  if (!filePath || !publicUrlBase) {
    return null;
  }

  const base = String(publicUrlBase).replace(/\/$/, "");
  return `${base}/${path.basename(filePath)}`;
}

export default {
  createComposeTrace,
  logComposeEvent,
  buildComposeArtifactManifest,
  writeComposeArtifactManifest,
  buildPublicArtifactUrl,
};
