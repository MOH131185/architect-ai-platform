/**
 * buildAuthorityJsonPayload
 *
 * Server-side helper that assembles the Authority JSON export — a structured
 * audit/review bundle of the compiled project. The payload is intentionally
 * sanitised:
 *   • secrets, tokens, API keys are stripped at any depth
 *   • binary buffers / typed arrays / data: URLs are replaced with markers
 *   • oversized string fields (>50 KB) are truncated to a marker
 *
 * Shape consumers depend on:
 *   schema_version, geometryHash, visualManifestHash, styleBlendManifestHash,
 *   jurisdiction.{id, countryCode, region}, compiledProjectSummary,
 *   compiledProject (sanitised), projectQuantityTakeoff, exportManifest,
 *   technicalAuthority, sourceGaps, qaSummary, disclaimers.
 */

export const AUTHORITY_JSON_SCHEMA_VERSION = "compiled-export-authority-v1";

const SECRET_KEY_RE =
  /(?:^|[_-])(secret|api[_-]?key|apikey|token|password|passwd|credential|bearer|access[_-]?key|private[_-]?key|signature)(?:[_-]|$)/i;

const RAW_PAYLOAD_PREFIXES = [
  "data:image/",
  "data:application/",
  "data:audio/",
  "data:video/",
];

const RAW_STRING_THRESHOLD = 50_000;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !isBinary(value)
  );
}

function isBinary(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array)
    return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer)
    return true;
  if (
    typeof Buffer !== "undefined" &&
    Buffer.isBuffer &&
    Buffer.isBuffer(value)
  )
    return true;
  return false;
}

function sanitizeKey(key) {
  return typeof key === "string" && SECRET_KEY_RE.test(key);
}

function sanitizeString(value) {
  if (typeof value !== "string") return value;
  for (const prefix of RAW_PAYLOAD_PREFIXES) {
    if (value.startsWith(prefix)) return "[binary omitted]";
  }
  if (value.length > RAW_STRING_THRESHOLD) {
    return `[truncated: ${value.length} chars]`;
  }
  return value;
}

export function sanitizeValue(value, depth = 0) {
  if (depth > 200) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (isBinary(value)) return "[binary omitted]";
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (sanitizeKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeValue(child, depth + 1);
    }
    return out;
  }
  return null;
}

export function sanitizeCompiledProject(compiledProject) {
  if (!compiledProject) return null;
  return sanitizeValue(compiledProject);
}

export function summarizeCompiledProject(compiledProject = {}) {
  const arr = (value) => (Array.isArray(value) ? value : []);
  const rooms = arr(compiledProject.rooms);
  const slabs = arr(compiledProject.slabs);
  const levels = arr(compiledProject.levels);
  const walls = arr(compiledProject.walls);
  const openings = arr(compiledProject.openings);
  const stairs = arr(compiledProject.stairs);

  const sumArea = (items, ...keys) =>
    items.reduce((total, item) => {
      for (const key of keys) {
        const candidate = Number(item?.[key]);
        if (Number.isFinite(candidate) && candidate > 0)
          return total + candidate;
      }
      return total;
    }, 0);

  const totalGiaM2 = sumArea(rooms, "actual_area_m2", "target_area_m2");
  const slabAreaM2 = sumArea(slabs, "area_m2");
  const footprintArea =
    Number(compiledProject.footprint?.area_m2) ||
    Number(compiledProject.site?.area_m2) ||
    0;

  return {
    levels: levels.length,
    walls: walls.length,
    openings: openings.length,
    rooms: rooms.length,
    slabs: slabs.length,
    stairs: stairs.length,
    footprintAreaM2: Number.isFinite(footprintArea) ? footprintArea : null,
    totalGiaM2: Number.isFinite(totalGiaM2) ? totalGiaM2 : null,
    slabAreaM2: Number.isFinite(slabAreaM2) ? slabAreaM2 : null,
  };
}

export function extractTechnicalAuthority(sheetArtifactManifest) {
  if (!sheetArtifactManifest || typeof sheetArtifactManifest !== "object") {
    return null;
  }
  const keep = [
    "structuralAuthority",
    "mepAuthority",
    "detailAuthority",
    "vernacularPack",
    "styleProvenance",
    "qaGates",
  ];
  const out = {};
  let found = false;
  for (const key of keep) {
    if (sheetArtifactManifest[key] !== undefined) {
      out[key] = sanitizeValue(sheetArtifactManifest[key]);
      found = true;
    }
  }
  return found ? out : null;
}

export function sanitizeQaSummary(qa) {
  if (!qa || typeof qa !== "object") return null;
  const out = {};
  if (qa.status) out.status = qa.status;
  if (typeof qa.score === "number") out.score = qa.score;
  if (Array.isArray(qa.blockers)) out.blockers = sanitizeValue(qa.blockers);
  if (Array.isArray(qa.warnings)) out.warnings = sanitizeValue(qa.warnings);
  if (Array.isArray(qa.issues)) {
    out.issues = sanitizeValue(
      qa.issues.map((issue) => ({
        code: issue?.code || null,
        severity: issue?.severity || null,
        message: issue?.message || null,
      })),
    );
  }
  if (qa.gates) out.gates = sanitizeValue(qa.gates);
  return out;
}

export function buildAuthorityJsonPayload({
  compiledProject,
  projectQuantityTakeoff = null,
  sheetArtifactManifest = null,
  designMetadata = null,
  qaSummary = null,
  projectName = "ArchiAI Project",
  pipelineVersion = "project-graph-vertical-slice-v1",
  exportedAt = null,
} = {}) {
  if (!compiledProject?.geometryHash) {
    throw new Error("compiledProject with geometryHash is required");
  }

  const jurisdictionPack = designMetadata?.jurisdictionPack || null;
  const jurisdictionResolution =
    designMetadata?.jurisdictionPackResolution || null;

  return {
    schema_version: AUTHORITY_JSON_SCHEMA_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    projectName,
    projectId:
      compiledProject.id ||
      compiledProject.projectId ||
      designMetadata?.projectId ||
      null,
    projectGraphId:
      designMetadata?.projectGraphId || compiledProject.projectGraphId || null,
    pipelineVersion,
    geometryHash: compiledProject.geometryHash,
    visualManifestHash: designMetadata?.visualManifestHash || null,
    styleBlendManifestHash: designMetadata?.styleBlendManifestHash || null,
    jurisdiction: {
      id: jurisdictionPack?.id || jurisdictionPack?.jurisdictionId || null,
      countryCode:
        jurisdictionPack?.countryCode ||
        designMetadata?.countryCode ||
        compiledProject.countryCode ||
        null,
      region: jurisdictionPack?.region || designMetadata?.region || null,
    },
    compiledProjectSummary: summarizeCompiledProject(compiledProject),
    compiledProject: sanitizeCompiledProject(compiledProject),
    projectQuantityTakeoff: projectQuantityTakeoff
      ? sanitizeValue(projectQuantityTakeoff)
      : null,
    exportManifest:
      sheetArtifactManifest?.exportManifest ||
      designMetadata?.exportManifest ||
      null,
    technicalAuthority: extractTechnicalAuthority(sheetArtifactManifest),
    sourceGaps: Array.isArray(jurisdictionResolution?.sourceGaps)
      ? sanitizeValue(jurisdictionResolution.sourceGaps)
      : [],
    qaSummary: sanitizeQaSummary(qaSummary),
    disclaimers: {
      status: "preliminary",
      reviewRequired: true,
      structuralMepDetails: "preliminary; engineer review required",
      costEstimate: "preliminary, assumption-based; not a contractor quotation",
    },
  };
}

export default buildAuthorityJsonPayload;
