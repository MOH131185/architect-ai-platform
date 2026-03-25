import fs from "fs";
import path from "path";

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
}) {
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
