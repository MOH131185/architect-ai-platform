/* global globalThis */
import { computeCDSHashSync } from "../validation/cdsHash.js";

export const ARTIFACT_STORAGE_SERVICE_VERSION = "artifact-storage-service-v1";
export const ARTIFACT_STORAGE_NOT_FOUND = "ARTIFACT_STORAGE_NOT_FOUND";
export const ARTIFACT_STORAGE_DELETED = "ARTIFACT_STORAGE_DELETED";
export const ARTIFACT_STORAGE_EXPIRED = "ARTIFACT_STORAGE_EXPIRED";
export const ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED =
  "ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED";
export const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 15 * 60;
export const DEFAULT_S3_REGION = "us-east-1";
export const ARTIFACT_STORAGE_KEY_PREFIX = "artifact-packages";

// Phase 1 export-fix — blob-artifact additions. The slice handler stores the
// master A1 SVG via `putBlobArtifact({packageId, kind: BLOB_KIND_A1_SHEET_SVG,
// bytes})` so the export route can recover it across cold-starts / instances,
// not just from the same Vercel function's `/tmp`. Each adapter implements the
// pair below; the value space is intentionally narrow (small ProjectGraph
// artifacts), not a general blob store.
export const BLOB_KIND_A1_SHEET_SVG = "a1-sheet-svg";
const BLOB_KIND_SAFE = /^[a-z0-9-]+$/;
const BLOB_EXT_FROM_KIND = {
  [BLOB_KIND_A1_SHEET_SVG]: "svg",
};
const BLOB_CONTENT_TYPE_FROM_KIND = {
  [BLOB_KIND_A1_SHEET_SVG]: "image/svg+xml; charset=utf-8",
};

function sanitizeBlobKind(kind) {
  const safe = String(kind || "").trim();
  if (!BLOB_KIND_SAFE.test(safe)) {
    throw new Error(
      `Invalid blob kind "${kind}". Use a known slug (e.g. ${BLOB_KIND_A1_SHEET_SVG}).`,
    );
  }
  return safe;
}

function blobKey({ packageId, kind }) {
  const safeId = sanitizePackageId(packageId);
  const safeKind = sanitizeBlobKind(kind);
  return `${safeId}:${safeKind}`;
}

function blobStorageKey({ packageId, kind }) {
  const safeId = sanitizePackageId(packageId);
  const safeKind = sanitizeBlobKind(kind);
  const ext = BLOB_EXT_FROM_KIND[safeKind] || "bin";
  return `${ARTIFACT_STORAGE_KEY_PREFIX}/_blobs/${safeId}/${safeKind}.${ext}`;
}

const MEMORY_STATE_KEY = "__archiaiArtifactPackageStorage";

function getMemoryState() {
  if (!globalThis[MEMORY_STATE_KEY]) {
    globalThis[MEMORY_STATE_KEY] = {
      packages: new Map(),
      blobs: new Map(),
    };
  } else if (!globalThis[MEMORY_STATE_KEY].blobs) {
    globalThis[MEMORY_STATE_KEY].blobs = new Map();
  }
  return globalThis[MEMORY_STATE_KEY];
}

function normalizeBytes(value) {
  if (value == null) return new Uint8Array();
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "object" && Array.isArray(value.data)) {
    return new Uint8Array(value.data);
  }
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) return new Uint8Array(BufferCtor.from(String(value)));
  return new TextEncoder().encode(String(value));
}

function cloneBytes(value) {
  return new Uint8Array(normalizeBytes(value));
}

function bytesToBuffer(bytes) {
  const normalized = normalizeBytes(bytes);
  const BufferCtor = globalThis.Buffer;
  return BufferCtor?.from ? BufferCtor.from(normalized) : normalized;
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function sanitizePackageId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeStorageSegment(value, fallback = "unknown") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

export function buildArtifactStorageKey({ manifest = {}, packageId } = {}) {
  const resolvedPackageId = sanitizeStorageSegment(
    packageId || manifest.packageId,
    "package",
  );
  const projectId = sanitizeStorageSegment(manifest.projectId, "project");
  const packageHash = sanitizeStorageSegment(manifest.packageHash, "hash");
  return `${ARTIFACT_STORAGE_KEY_PREFIX}/${projectId}/${resolvedPackageId}/${packageHash}.zip`;
}

function sidecarKeys(storageKey) {
  return {
    manifestKey: `${storageKey}.manifest.json`,
    metadataKey: `${storageKey}.metadata.json`,
    indexKey: `${ARTIFACT_STORAGE_KEY_PREFIX}/_index/${sanitizeStorageSegment(
      storageKey.split("/").slice(-2, -1)[0],
      "package",
    )}.json`,
  };
}

function nowDate(now) {
  if (now instanceof Date) return now;
  if (typeof now === "function") return nowDate(now());
  if (typeof now === "string" || typeof now === "number") return new Date(now);
  return new Date();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanFromEnv(value) {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export function resolveRetentionDays(
  env = globalThis.process?.env || {},
  options = {},
) {
  const configured =
    options.retentionDays ??
    env.ARTIFACT_RETENTION_DAYS ??
    env.ARTIFACT_PACKAGE_RETENTION_DAYS ??
    null;
  const days = numberOrNull(configured);
  return days != null && days > 0 ? days : null;
}

export function computeRetentionExpiresAt({ createdAt, retentionDays } = {}) {
  const days = numberOrNull(retentionDays);
  if (days == null || days <= 0) return null;
  const start = nowDate(createdAt);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildObjectMetadata({
  manifest = {},
  metadata = {},
  now,
  retentionDays,
}) {
  const createdAt = metadata.createdAt || nowDate(now).toISOString();
  const expiresAt =
    metadata.expiresAt ||
    computeRetentionExpiresAt({ createdAt, retentionDays }) ||
    null;
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const sourceGaps = Array.isArray(manifest.sourceGaps)
    ? manifest.sourceGaps
    : [];
  return {
    packageId: manifest.packageId || metadata.packageId || null,
    packageHash: manifest.packageHash || metadata.packageHash || null,
    projectId: manifest.projectId || metadata.projectId || null,
    projectGraphId: manifest.projectGraphId || metadata.projectGraphId || null,
    userId: metadata.userId || null,
    geometryHash: manifest.geometryHash || null,
    visualManifestHash: manifest.visualManifestHash || null,
    styleBlendManifestHash: manifest.styleBlendManifestHash || null,
    jurisdictionId: manifest.jurisdictionId || null,
    createdAt,
    expiresAt,
    retentionDays: retentionDays || null,
    qaStatus: manifest.qaSummary?.status || null,
    artifactCount: artifacts.length,
    sourceGapCount: sourceGaps.length,
    projectName: metadata.projectName || null,
  };
}

function publicBaseUrl(value) {
  return String(value || "/api/project/export/artifact-package").replace(
    /\/+$/,
    "",
  );
}

function signedUrlPath({ packageId, baseUrl, expiresAtMs, signature }) {
  const encodedId = encodeURIComponent(packageId);
  const sep = publicBaseUrl(baseUrl).includes("?") ? "&" : "?";
  return `${publicBaseUrl(baseUrl)}/${encodedId}/download${sep}expires=${expiresAtMs}&signature=${encodeURIComponent(signature)}`;
}

async function signPayload(payload, secret) {
  if (!secret) return null;
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", String(secret))
    .update(String(payload))
    .digest("hex");
}

function timingSafeEqualString(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function storageRecord({
  packageId,
  zipBytes,
  manifest,
  metadata,
  storageKey,
  adapterName,
  now,
  retentionDays = null,
}) {
  const bytes = cloneBytes(zipBytes);
  const storedAt = nowDate(now).toISOString();
  const objectMetadata = buildObjectMetadata({
    manifest,
    metadata,
    now: storedAt,
    retentionDays,
  });
  return {
    packageId,
    packageHash: manifest?.packageHash || metadata?.packageHash || null,
    manifest: cloneJson(manifest),
    metadata: cloneJson({ ...(metadata || {}), ...objectMetadata }),
    zipBytes: bytes,
    byteLength: bytes.byteLength,
    storageKey,
    adapterName,
    storedAt,
    expiresAt: objectMetadata.expiresAt,
    retentionDays: objectMetadata.retentionDays,
    status: "stored",
  };
}

function deletedRecord(packageId, existing = {}, now) {
  return {
    ...existing,
    packageId,
    zipBytes: null,
    byteLength: existing.byteLength || 0,
    status: "deleted",
    deletedAt: nowDate(now).toISOString(),
  };
}

function visibleStorageRecord(record) {
  if (!record) return null;
  if (record.status === "deleted") {
    return {
      ...record,
      zipBytes: null,
    };
  }
  return {
    ...record,
    manifest: cloneJson(record.manifest),
    metadata: cloneJson(record.metadata || {}),
    zipBytes: cloneBytes(record.zipBytes),
  };
}

export function createInMemoryArtifactStorageAdapter(options = {}) {
  const state = options.state || getMemoryState();
  const signedUrlSecret = options.signedUrlSecret || null;
  const signedUrlBaseUrl =
    options.signedUrlBaseUrl || "/api/project/export/artifact-package";
  const adapterName = options.adapterName || "memory";
  const now = options.now;
  const retentionDays = resolveRetentionDays(options.env, options);

  const adapterCapabilities = Object.freeze({
    adapter: adapterName,
    persistent: false,
    signedUrls: Boolean(signedUrlSecret),
    delete: true,
    list: true,
    retention: true,
  });

  return {
    adapterCapabilities,

    async putArtifactPackage({ packageId, zipBytes, manifest, metadata = {} }) {
      const safeId = sanitizePackageId(packageId || manifest?.packageId);
      if (!safeId) {
        throw new Error("packageId is required to store artifact package");
      }
      const record = storageRecord({
        packageId: safeId,
        zipBytes,
        manifest,
        metadata,
        storageKey: buildArtifactStorageKey({ manifest, packageId: safeId }),
        adapterName,
        now,
        retentionDays,
      });
      state.packages.set(safeId, record);
      return visibleStorageRecord(record);
    },

    async getArtifactPackage({ packageId }) {
      const safeId = sanitizePackageId(packageId);
      const record = state.packages.get(safeId);
      if (!record) {
        return { found: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      if (record.status === "deleted") {
        return {
          found: false,
          code: ARTIFACT_STORAGE_DELETED,
          record: visibleStorageRecord(record),
        };
      }
      return { found: true, record: visibleStorageRecord(record) };
    },

    async createSignedDownloadUrl({
      packageId,
      expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
    }) {
      if (!signedUrlSecret) {
        return {
          supported: false,
          capability: "signedUrls=false",
          code: ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED,
        };
      }
      const safeId = sanitizePackageId(packageId);
      const expiresAtMs =
        nowDate(now).getTime() + Number(expiresInSeconds || 0) * 1000;
      const payload = `${safeId}:${expiresAtMs}`;
      const signature = await signPayload(payload, signedUrlSecret);
      const url = signedUrlPath({
        packageId: safeId,
        baseUrl: signedUrlBaseUrl,
        expiresAtMs,
        signature,
      });
      return {
        supported: true,
        signedUrl: url,
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresInSeconds: Number(expiresInSeconds || 0),
      };
    },

    async deleteArtifactPackage({ packageId }) {
      const safeId = sanitizePackageId(packageId);
      const existing = state.packages.get(safeId);
      if (!existing)
        return { deleted: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      const deleted = deletedRecord(safeId, existing, now);
      state.packages.set(safeId, deleted);
      return { deleted: true, record: visibleStorageRecord(deleted) };
    },

    async listArtifactPackages({ projectId, userId } = {}) {
      const records = [...state.packages.values()]
        .filter((record) => record.status !== "deleted")
        .filter((record) =>
          projectId ? record.manifest?.projectId === projectId : true,
        )
        .filter((record) =>
          userId ? record.metadata?.userId === userId : true,
        )
        .sort((a, b) =>
          [b.storedAt || "", b.packageId || ""]
            .join(":")
            .localeCompare([a.storedAt || "", a.packageId || ""].join(":")),
        )
        .map(visibleStorageRecord);
      return records;
    },

    // Phase 1 export-fix: blob-artifact pair (in-memory). Keyed by
    // `<packageId>:<kind>` so each adapter instance stores at most one blob
    // per (package, kind). The slice handler writes a1-sheet-svg here; the
    // /api/a1/export route reads it back when the client sends an artifactRef.
    async putBlobArtifact({ packageId, kind, bytes, contentType = null }) {
      const safeId = sanitizePackageId(packageId);
      if (!safeId) throw new Error("packageId required for blob artifact");
      const safeKind = sanitizeBlobKind(kind);
      const cloned = cloneBytes(bytes);
      state.blobs.set(blobKey({ packageId: safeId, kind: safeKind }), {
        packageId: safeId,
        kind: safeKind,
        contentType:
          contentType ||
          BLOB_CONTENT_TYPE_FROM_KIND[safeKind] ||
          "application/octet-stream",
        bytes: cloned,
        byteLength: cloned.byteLength,
        storedAt: nowDate(now).toISOString(),
        storageKey: blobStorageKey({ packageId: safeId, kind: safeKind }),
        adapterName,
      });
      return {
        stored: true,
        packageId: safeId,
        kind: safeKind,
        byteLength: cloned.byteLength,
        adapter: adapterName,
      };
    },

    async getBlobArtifact({ packageId, kind }) {
      const safeId = sanitizePackageId(packageId);
      const safeKind = sanitizeBlobKind(kind);
      const entry = state.blobs.get(
        blobKey({ packageId: safeId, kind: safeKind }),
      );
      if (!entry) {
        return { found: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      return {
        found: true,
        packageId: safeId,
        kind: safeKind,
        contentType: entry.contentType,
        bytes: cloneBytes(entry.bytes),
        byteLength: entry.byteLength,
        storedAt: entry.storedAt,
        adapter: adapterName,
      };
    },
  };
}

export function clearInMemoryArtifactStorage() {
  getMemoryState().packages.clear();
}

async function ensureDir(pathValue) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(pathValue, { recursive: true });
}

async function fileExists(pathValue) {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(pathValue);
    return true;
  } catch (_error) {
    return false;
  }
}

export function createFilesystemArtifactStorageAdapter(options = {}) {
  const rootDir = options.rootDir;
  if (!rootDir) {
    throw new Error("rootDir is required for filesystem artifact storage");
  }
  const signedUrlSecret = options.signedUrlSecret || null;
  const signedUrlBaseUrl =
    options.signedUrlBaseUrl || "/api/project/export/artifact-package";
  const adapterName = "filesystem";
  const now = options.now;
  const retentionDays = resolveRetentionDays(options.env, options);
  const adapterCapabilities = Object.freeze({
    adapter: adapterName,
    persistent: true,
    signedUrls: Boolean(signedUrlSecret),
    delete: true,
    list: true,
    retention: true,
  });

  async function pathsFor(packageId, manifest = null) {
    const path = await import("node:path");
    const safeId = sanitizePackageId(packageId);
    const storageKey = manifest
      ? buildArtifactStorageKey({ manifest, packageId: safeId })
      : `${ARTIFACT_STORAGE_KEY_PREFIX}/_legacy/${safeId}.zip`;
    const packageDir = path.join(rootDir, path.dirname(storageKey));
    await ensureDir(packageDir);
    const { indexKey } = sidecarKeys(storageKey);
    const indexPath = path.join(rootDir, indexKey);
    await ensureDir(path.dirname(indexPath));
    return {
      safeId,
      storageKey,
      zipPath: path.join(rootDir, storageKey),
      manifestPath: path.join(rootDir, `${storageKey}.manifest.json`),
      metadataPath: path.join(rootDir, `${storageKey}.metadata.json`),
      indexPath,
    };
  }

  async function readRecord(packageId) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const safeId = sanitizePackageId(packageId);
    const indexPath = path.join(
      rootDir,
      `${ARTIFACT_STORAGE_KEY_PREFIX}/_index/${safeId}.json`,
    );
    if (!(await fileExists(indexPath))) {
      return null;
    }
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    const paths = {
      safeId,
      storageKey: index.storageKey,
      zipPath: path.join(rootDir, index.storageKey),
      manifestPath: path.join(rootDir, `${index.storageKey}.manifest.json`),
      metadataPath: path.join(rootDir, `${index.storageKey}.metadata.json`),
      indexPath,
    };
    if (!(await fileExists(paths.manifestPath))) {
      return null;
    }
    const [manifestText, metadataText] = await Promise.all([
      fs.readFile(paths.manifestPath, "utf8"),
      fileExists(paths.metadataPath).then((exists) =>
        exists ? fs.readFile(paths.metadataPath, "utf8") : "{}",
      ),
    ]);
    const metadata = JSON.parse(metadataText || "{}");
    const deleted = metadata.status === "deleted";
    const zipBytes = deleted
      ? null
      : new Uint8Array(await fs.readFile(paths.zipPath));
    return {
      packageId: paths.safeId,
      packageHash: JSON.parse(manifestText).packageHash,
      manifest: JSON.parse(manifestText),
      metadata,
      zipBytes,
      byteLength: zipBytes?.byteLength || metadata.byteLength || 0,
      storageKey: paths.storageKey,
      adapterName,
      storedAt: metadata.storedAt || null,
      status: metadata.status || "stored",
      deletedAt: metadata.deletedAt || null,
      expiresAt: metadata.expiresAt || null,
      retentionDays: metadata.retentionDays || null,
    };
  }

  return {
    adapterCapabilities,

    async putArtifactPackage({ packageId, zipBytes, manifest, metadata = {} }) {
      const fs = await import("node:fs/promises");
      const safeId = sanitizePackageId(packageId || manifest?.packageId);
      if (!safeId) {
        throw new Error("packageId is required to store artifact package");
      }
      const paths = await pathsFor(safeId, manifest);
      const record = storageRecord({
        packageId: safeId,
        zipBytes,
        manifest,
        metadata,
        storageKey: paths.storageKey,
        adapterName,
        now,
        retentionDays,
      });
      await Promise.all([
        fs.writeFile(paths.zipPath, bytesToBuffer(record.zipBytes)),
        fs.writeFile(
          paths.manifestPath,
          `${JSON.stringify(record.manifest, null, 2)}\n`,
        ),
        fs.writeFile(
          paths.metadataPath,
          `${JSON.stringify(
            {
              ...record.metadata,
              storedAt: record.storedAt,
              byteLength: record.byteLength,
              status: record.status,
              storageKey: record.storageKey,
            },
            null,
            2,
          )}\n`,
        ),
        fs.writeFile(
          paths.indexPath,
          `${JSON.stringify(
            {
              packageId: safeId,
              storageKey: record.storageKey,
              projectId: record.manifest?.projectId || null,
              packageHash: record.packageHash,
              status: record.status,
            },
            null,
            2,
          )}\n`,
        ),
      ]);
      return visibleStorageRecord(record);
    },

    async getArtifactPackage({ packageId }) {
      const record = await readRecord(packageId);
      if (!record) return { found: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      if (record.status === "deleted") {
        return {
          found: false,
          code: ARTIFACT_STORAGE_DELETED,
          record: visibleStorageRecord(record),
        };
      }
      return { found: true, record: visibleStorageRecord(record) };
    },

    async createSignedDownloadUrl({
      packageId,
      expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
    }) {
      if (!signedUrlSecret) {
        return {
          supported: false,
          capability: "signedUrls=false",
          code: ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED,
        };
      }
      const safeId = sanitizePackageId(packageId);
      const expiresAtMs =
        nowDate(now).getTime() + Number(expiresInSeconds || 0) * 1000;
      const payload = `${safeId}:${expiresAtMs}`;
      const signature = await signPayload(payload, signedUrlSecret);
      return {
        supported: true,
        signedUrl: signedUrlPath({
          packageId: safeId,
          baseUrl: signedUrlBaseUrl,
          expiresAtMs,
          signature,
        }),
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresInSeconds: Number(expiresInSeconds || 0),
      };
    },

    async deleteArtifactPackage({ packageId }) {
      const fs = await import("node:fs/promises");
      const existing = await readRecord(packageId);
      if (!existing) {
        return { deleted: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      const paths = await pathsFor(packageId, existing.manifest);
      const deleted = deletedRecord(paths.safeId, existing, now);
      await fs.writeFile(
        paths.metadataPath,
        `${JSON.stringify(
          {
            ...(existing.metadata || {}),
            status: "deleted",
            deletedAt: deleted.deletedAt,
            storedAt: existing.storedAt,
            byteLength: existing.byteLength,
            storageKey: existing.storageKey,
          },
          null,
          2,
        )}\n`,
      );
      await fs.writeFile(
        paths.indexPath,
        `${JSON.stringify(
          {
            packageId: paths.safeId,
            storageKey: existing.storageKey,
            projectId: existing.manifest?.projectId || null,
            packageHash: existing.packageHash,
            status: "deleted",
          },
          null,
          2,
        )}\n`,
      );
      return { deleted: true, record: visibleStorageRecord(deleted) };
    },

    async listArtifactPackages({ projectId, userId } = {}) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const indexDir = path.join(
        rootDir,
        ARTIFACT_STORAGE_KEY_PREFIX,
        "_index",
      );
      if (!(await fileExists(indexDir))) return [];
      const indexNames = (await fs.readdir(indexDir)).filter((name) =>
        name.endsWith(".json"),
      );
      const records = [];
      for (const name of indexNames) {
        const packageId = name.replace(/\.json$/, "");
        const record = await readRecord(packageId);
        if (!record || record.status === "deleted") continue;
        if (projectId && record.manifest?.projectId !== projectId) continue;
        if (userId && record.metadata?.userId !== userId) continue;
        records.push(visibleStorageRecord(record));
      }
      return records.sort((a, b) =>
        [b.storedAt || "", b.packageId || ""]
          .join(":")
          .localeCompare([a.storedAt || "", a.packageId || ""].join(":")),
      );
    },

    // Phase 1 export-fix: blob-artifact pair (filesystem). Writes/reads
    // <rootDir>/<ARTIFACT_STORAGE_KEY_PREFIX>/_blobs/<safeId>/<kind>.<ext>
    // so blobs survive process restarts (the dev case) and Vercel /tmp
    // instance lifetimes (the same-instance Vercel case). On AWS Lambda
    // /tmp is per-instance but durable for the instance lifetime, so this
    // is still strictly better than the legacy compose-output-only path.
    async putBlobArtifact({ packageId, kind, bytes, contentType = null }) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const safeId = sanitizePackageId(packageId);
      if (!safeId) throw new Error("packageId required for blob artifact");
      const safeKind = sanitizeBlobKind(kind);
      const storageKey = blobStorageKey({ packageId: safeId, kind: safeKind });
      const filePath = path.join(rootDir, storageKey);
      await ensureDir(path.dirname(filePath));
      const buffer = bytesToBuffer(bytes);
      await fs.writeFile(filePath, buffer);
      return {
        stored: true,
        packageId: safeId,
        kind: safeKind,
        byteLength: buffer.length,
        adapter: adapterName,
        storageKey,
        contentType:
          contentType ||
          BLOB_CONTENT_TYPE_FROM_KIND[safeKind] ||
          "application/octet-stream",
      };
    },

    async getBlobArtifact({ packageId, kind }) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const safeId = sanitizePackageId(packageId);
      const safeKind = sanitizeBlobKind(kind);
      const storageKey = blobStorageKey({ packageId: safeId, kind: safeKind });
      const filePath = path.join(rootDir, storageKey);
      if (!(await fileExists(filePath))) {
        return { found: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      const buffer = await fs.readFile(filePath);
      return {
        found: true,
        packageId: safeId,
        kind: safeKind,
        contentType:
          BLOB_CONTENT_TYPE_FROM_KIND[safeKind] || "application/octet-stream",
        bytes: new Uint8Array(buffer),
        byteLength: buffer.length,
        adapter: adapterName,
        storageKey,
      };
    },
  };
}

function s3EncodePath(key) {
  return String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function s3EndpointUrl({ endpoint, region, bucket, key, forcePathStyle }) {
  const base = endpoint
    ? String(endpoint).replace(/\/+$/, "")
    : `https://s3.${region || DEFAULT_S3_REGION}.amazonaws.com`;
  if (forcePathStyle) {
    return `${base}/${encodeURIComponent(bucket)}/${s3EncodePath(key)}`;
  }
  const url = new URL(base);
  url.hostname = `${bucket}.${url.hostname}`;
  url.pathname = `/${s3EncodePath(key)}`;
  return url.toString();
}

async function sha256Hex(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

async function hmac(key, value, encoding = undefined) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(value).digest(encoding);
}

function amzDate(now) {
  return nowDate(now)
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(amzDateValue) {
  return String(amzDateValue).slice(0, 8);
}

function canonicalQuery(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

function canonicalHeaders(headers = {}) {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim()])
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonical: `${entries.map(([key, value]) => `${key}:${value}\n`).join("")}`,
    signedHeaders: entries.map(([key]) => key).join(";"),
  };
}

async function s3SigningKey({ secretAccessKey, date, region }) {
  const kDate = await hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

async function signS3Request({
  method,
  url,
  headers = {},
  query = {},
  bodyBytes = new Uint8Array(),
  accessKeyId,
  secretAccessKey,
  sessionToken,
  region,
  now,
  presign = false,
  expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
}) {
  const requestUrl = new URL(url);
  const requestDate = amzDate(now);
  const date = dateStamp(requestDate);
  const credentialScope = `${date}/${region}/s3/aws4_request`;
  const host = requestUrl.host;
  const payloadHash = presign
    ? "UNSIGNED-PAYLOAD"
    : await sha256Hex(bytesToBuffer(bodyBytes));
  const signedHeadersSource = {
    host,
    ...(presign ? {} : { "x-amz-content-sha256": payloadHash }),
    ...(presign ? {} : { "x-amz-date": requestDate }),
    ...(sessionToken && !presign
      ? { "x-amz-security-token": sessionToken }
      : {}),
    ...headers,
  };
  const { canonical, signedHeaders } = canonicalHeaders(signedHeadersSource);
  const queryParams = {
    ...query,
    ...(presign
      ? {
          "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
          "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
          "X-Amz-Date": requestDate,
          "X-Amz-Expires": Number(expiresInSeconds || 0),
          "X-Amz-SignedHeaders": signedHeaders,
          ...(sessionToken ? { "X-Amz-Security-Token": sessionToken } : {}),
        }
      : {}),
  };
  const canonicalRequest = [
    method,
    requestUrl.pathname,
    canonicalQuery(queryParams),
    canonical,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    requestDate,
    credentialScope,
    await sha256Hex(bytesToBuffer(canonicalRequest)),
  ].join("\n");
  const signingKey = await s3SigningKey({
    secretAccessKey,
    date,
    region,
  });
  const signature = await hmac(signingKey, stringToSign, "hex");

  if (presign) {
    requestUrl.search = canonicalQuery({
      ...queryParams,
      "X-Amz-Signature": signature,
    });
    return {
      url: requestUrl.toString(),
      expiresAt: new Date(
        nowDate(now).getTime() + Number(expiresInSeconds || 0) * 1000,
      ).toISOString(),
    };
  }

  return {
    headers: {
      ...signedHeadersSource,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function s3MetadataHeaders(metadata = {}) {
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    const headerKey = `x-amz-meta-${String(key)
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "")}`;
    out[headerKey] = String(value);
  }
  return out;
}

export function createS3ArtifactStorageAdapter(options = {}) {
  const bucket = options.bucket;
  const region = options.region || DEFAULT_S3_REGION;
  const endpoint = options.endpoint || null;
  const publicObjectBaseUrl = options.publicBaseUrl || null;
  const accessKeyId = options.accessKeyId;
  const secretAccessKey = options.secretAccessKey;
  const sessionToken = options.sessionToken || null;
  const forcePathStyle =
    options.forcePathStyle === true ||
    options.forcePathStyle === "true" ||
    Boolean(endpoint);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now;
  const retentionDays = resolveRetentionDays(options.env, options);
  const configured = Boolean(bucket && accessKeyId && secretAccessKey);

  if (!configured) {
    throw new Error(
      "S3 artifact storage requires ARTIFACT_STORAGE_BUCKET, ARTIFACT_STORAGE_ACCESS_KEY_ID, and ARTIFACT_STORAGE_SECRET_ACCESS_KEY",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("S3 artifact storage requires a fetch implementation");
  }

  const adapterCapabilities = Object.freeze({
    adapter: "s3",
    persistent: true,
    signedUrls: true,
    delete: true,
    list: true,
    retention: true,
  });

  function urlFor(key) {
    return s3EndpointUrl({
      endpoint,
      region,
      bucket,
      key,
      forcePathStyle,
    });
  }

  function publicUrlFor(key) {
    if (!publicObjectBaseUrl) return urlFor(key);
    return `${String(publicObjectBaseUrl).replace(/\/+$/, "")}/${s3EncodePath(
      key,
    )}`;
  }

  async function requestObject({
    method,
    key,
    body,
    contentType = "application/octet-stream",
    metadata = {},
  }) {
    const bodyBytes = body ? normalizeBytes(body) : new Uint8Array();
    const headers = {
      ...(method === "PUT" ? { "content-type": contentType } : {}),
      ...(method === "PUT" ? s3MetadataHeaders(metadata) : {}),
    };
    const signed = await signS3Request({
      method,
      url: urlFor(key),
      headers,
      bodyBytes,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      region,
      now,
    });
    return fetchImpl(urlFor(key), {
      method,
      headers: signed.headers,
      ...(method === "PUT" ? { body: bytesToBuffer(bodyBytes) } : {}),
    });
  }

  async function putJson(key, payload) {
    return requestObject({
      method: "PUT",
      key,
      body: `${JSON.stringify(payload, null, 2)}\n`,
      contentType: "application/json",
    });
  }

  async function getJson(key) {
    const response = await requestObject({ method: "GET", key });
    if (!response.ok) return null;
    return response.json();
  }

  async function getBytes(key) {
    const response = await requestObject({ method: "GET", key });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }

  async function readRecord(packageId) {
    const safeId = sanitizePackageId(packageId);
    const index = await getJson(
      `${ARTIFACT_STORAGE_KEY_PREFIX}/_index/${safeId}.json`,
    );
    if (!index?.storageKey) return null;
    const [manifest, metadata, zipBytes] = await Promise.all([
      getJson(`${index.storageKey}.manifest.json`),
      getJson(`${index.storageKey}.metadata.json`),
      index.status === "deleted" ? null : getBytes(index.storageKey),
    ]);
    if (!manifest || !metadata) return null;
    return {
      packageId: safeId,
      packageHash: manifest.packageHash,
      manifest,
      metadata,
      zipBytes,
      byteLength: zipBytes?.byteLength || metadata.byteLength || 0,
      storageKey: index.storageKey,
      adapterName: "s3",
      storedAt: metadata.storedAt || metadata.createdAt || null,
      status: metadata.status || index.status || "stored",
      deletedAt: metadata.deletedAt || null,
      expiresAt: metadata.expiresAt || null,
      retentionDays: metadata.retentionDays || null,
    };
  }

  return {
    adapterCapabilities,

    async putArtifactPackage({ packageId, zipBytes, manifest, metadata = {} }) {
      const safeId = sanitizePackageId(packageId || manifest?.packageId);
      const storageKey = buildArtifactStorageKey({
        manifest,
        packageId: safeId,
      });
      const record = storageRecord({
        packageId: safeId,
        zipBytes,
        manifest,
        metadata,
        storageKey,
        adapterName: "s3",
        now,
        retentionDays,
      });
      const { indexKey, manifestKey, metadataKey } = sidecarKeys(storageKey);
      const objectMetadata = {
        ...record.metadata,
        byteLength: record.byteLength,
        status: record.status,
        storageKey,
      };
      await Promise.all([
        requestObject({
          method: "PUT",
          key: storageKey,
          body: record.zipBytes,
          contentType: "application/zip",
          metadata: objectMetadata,
        }),
        putJson(manifestKey, record.manifest),
        putJson(metadataKey, objectMetadata),
        putJson(indexKey, {
          packageId: safeId,
          storageKey,
          projectId: record.manifest?.projectId || null,
          packageHash: record.packageHash,
          status: record.status,
        }),
      ]);
      return visibleStorageRecord(record);
    },

    async getArtifactPackage({ packageId }) {
      const record = await readRecord(packageId);
      if (!record) return { found: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      if (record.status === "deleted") {
        return {
          found: false,
          code: ARTIFACT_STORAGE_DELETED,
          record: visibleStorageRecord(record),
        };
      }
      return { found: true, record: visibleStorageRecord(record) };
    },

    async createSignedDownloadUrl({
      packageId,
      expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
    }) {
      const safeId = sanitizePackageId(packageId);
      const index = await getJson(
        `${ARTIFACT_STORAGE_KEY_PREFIX}/_index/${safeId}.json`,
      );
      if (!index?.storageKey || index.status === "deleted") {
        return { supported: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      const signed = await signS3Request({
        method: "GET",
        url: publicUrlFor(index.storageKey),
        accessKeyId,
        secretAccessKey,
        sessionToken,
        region,
        now,
        presign: true,
        expiresInSeconds,
      });
      return {
        supported: true,
        signedUrl: signed.url,
        expiresAt: signed.expiresAt,
        expiresInSeconds: Number(expiresInSeconds || 0),
      };
    },

    async deleteArtifactPackage({ packageId }) {
      const record = await readRecord(packageId);
      if (!record) {
        return { deleted: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      const deleted = deletedRecord(packageId, record, now);
      const { indexKey, metadataKey } = sidecarKeys(record.storageKey);
      await Promise.all([
        requestObject({ method: "DELETE", key: record.storageKey }),
        putJson(metadataKey, {
          ...(record.metadata || {}),
          status: "deleted",
          deletedAt: deleted.deletedAt,
          storageKey: record.storageKey,
          byteLength: record.byteLength,
        }),
        putJson(indexKey, {
          packageId: record.packageId,
          storageKey: record.storageKey,
          projectId: record.manifest?.projectId || null,
          packageHash: record.packageHash,
          status: "deleted",
        }),
      ]);
      return { deleted: true, record: visibleStorageRecord(deleted) };
    },

    async listArtifactPackages({ projectId, userId } = {}) {
      // Listing is primarily served from package history. S3-compatible object
      // stores differ in list semantics, so this adapter exposes object access
      // by packageId and keeps broad listing provider-neutral for future jobs.
      const _unused = { projectId, userId };
      return [];
    },

    // Phase 1 export-fix: blob-artifact pair (S3-compatible). Stores the
    // master A1 SVG (and any future small per-package artifact) as an object
    // under <ARTIFACT_STORAGE_KEY_PREFIX>/_blobs/<safeId>/<kind>.<ext>.
    // The export route reads it back via getBlobArtifact when the client
    // sends an artifactRef. Object lifecycle / retention is handled by the
    // bucket policy (same as the zips).
    async putBlobArtifact({ packageId, kind, bytes, contentType = null }) {
      const safeId = sanitizePackageId(packageId);
      if (!safeId) throw new Error("packageId required for blob artifact");
      const safeKind = sanitizeBlobKind(kind);
      const storageKey = blobStorageKey({ packageId: safeId, kind: safeKind });
      const resolvedContentType =
        contentType ||
        BLOB_CONTENT_TYPE_FROM_KIND[safeKind] ||
        "application/octet-stream";
      const bodyBytes = normalizeBytes(bytes);
      const response = await requestObject({
        method: "PUT",
        key: storageKey,
        body: bodyBytes,
        contentType: resolvedContentType,
        metadata: { packageId: safeId, kind: safeKind },
      });
      if (!response.ok) {
        throw new Error(
          `S3 putBlobArtifact failed: ${response.status} ${response.statusText || ""}`.trim(),
        );
      }
      return {
        stored: true,
        packageId: safeId,
        kind: safeKind,
        byteLength: bodyBytes.byteLength,
        adapter: "s3",
        storageKey,
        contentType: resolvedContentType,
      };
    },

    async getBlobArtifact({ packageId, kind }) {
      const safeId = sanitizePackageId(packageId);
      const safeKind = sanitizeBlobKind(kind);
      const storageKey = blobStorageKey({ packageId: safeId, kind: safeKind });
      const response = await requestObject({ method: "GET", key: storageKey });
      if (!response.ok) {
        return { found: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        found: true,
        packageId: safeId,
        kind: safeKind,
        contentType:
          response.headers?.get?.("content-type") ||
          BLOB_CONTENT_TYPE_FROM_KIND[safeKind] ||
          "application/octet-stream",
        bytes,
        byteLength: bytes.byteLength,
        adapter: "s3",
        storageKey,
      };
    },
  };
}

export function resolveArtifactStorageAdapter(env = undefined, options = {}) {
  const effectiveEnv = env || globalThis.process?.env || {};
  const provider = String(
    options.provider || effectiveEnv.ARTIFACT_STORAGE_PROVIDER || "",
  )
    .trim()
    .toLowerCase();
  const rootDir =
    options.rootDir ||
    effectiveEnv.ARTIFACT_PACKAGE_STORAGE_DIR ||
    effectiveEnv.ARTIFACT_STORAGE_DIR ||
    null;
  const signedUrlSecret =
    options.signedUrlSecret ||
    effectiveEnv.ARTIFACT_PACKAGE_SIGNING_SECRET ||
    effectiveEnv.ARTIFACT_SIGNING_SECRET ||
    null;
  const signedUrlBaseUrl =
    options.signedUrlBaseUrl ||
    effectiveEnv.ARTIFACT_PACKAGE_SIGNED_URL_BASE ||
    "/api/project/export/artifact-package";

  if (provider === "s3") {
    return createS3ArtifactStorageAdapter({
      bucket: options.bucket || effectiveEnv.ARTIFACT_STORAGE_BUCKET,
      region:
        options.region ||
        effectiveEnv.ARTIFACT_STORAGE_REGION ||
        DEFAULT_S3_REGION,
      endpoint: options.endpoint || effectiveEnv.ARTIFACT_STORAGE_ENDPOINT,
      publicBaseUrl:
        options.publicBaseUrl || effectiveEnv.ARTIFACT_STORAGE_PUBLIC_BASE_URL,
      accessKeyId:
        options.accessKeyId || effectiveEnv.ARTIFACT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey:
        options.secretAccessKey ||
        effectiveEnv.ARTIFACT_STORAGE_SECRET_ACCESS_KEY,
      sessionToken:
        options.sessionToken || effectiveEnv.ARTIFACT_STORAGE_SESSION_TOKEN,
      forcePathStyle:
        options.forcePathStyle ??
        booleanFromEnv(effectiveEnv.ARTIFACT_STORAGE_FORCE_PATH_STYLE),
      fetchImpl: options.fetchImpl,
      now: options.now,
      retentionDays: options.retentionDays,
      env: effectiveEnv,
    });
  }

  if (provider === "filesystem" || (!provider && rootDir)) {
    return createFilesystemArtifactStorageAdapter({
      rootDir,
      signedUrlSecret,
      signedUrlBaseUrl,
      now: options.now,
      retentionDays: options.retentionDays,
      env: effectiveEnv,
    });
  }

  return createInMemoryArtifactStorageAdapter({
    signedUrlSecret,
    signedUrlBaseUrl,
    now: options.now,
    retentionDays: options.retentionDays,
    env: effectiveEnv,
  });
}

export function getDefaultArtifactStorageAdapter() {
  if (!globalThis.__archiaiDefaultArtifactStorageAdapter) {
    globalThis.__archiaiDefaultArtifactStorageAdapter =
      resolveArtifactStorageAdapter();
  }
  return globalThis.__archiaiDefaultArtifactStorageAdapter;
}

export function setDefaultArtifactStorageAdapter(adapter) {
  globalThis.__archiaiDefaultArtifactStorageAdapter = adapter;
}

export async function verifySignedDownloadToken({
  packageId,
  expires,
  signature,
  secret,
  now,
}) {
  if (!secret) return { valid: false, reason: "signedUrls=false" };
  const expiresAtMs = Number(expires);
  if (!Number.isFinite(expiresAtMs)) {
    return { valid: false, reason: "invalid_expires" };
  }
  if (expiresAtMs < nowDate(now).getTime()) {
    return { valid: false, reason: ARTIFACT_STORAGE_EXPIRED };
  }
  const safeId = sanitizePackageId(packageId);
  const expected = await signPayload(`${safeId}:${expiresAtMs}`, secret);
  if (!timingSafeEqualString(expected, signature)) {
    return { valid: false, reason: "invalid_signature" };
  }
  return {
    valid: true,
    expiresAt: new Date(expiresAtMs).toISOString(),
    tokenHash: computeCDSHashSync({ packageId: safeId, expires: expiresAtMs }),
  };
}

export default {
  ARTIFACT_STORAGE_SERVICE_VERSION,
  ARTIFACT_STORAGE_NOT_FOUND,
  ARTIFACT_STORAGE_DELETED,
  ARTIFACT_STORAGE_EXPIRED,
  ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  DEFAULT_S3_REGION,
  ARTIFACT_STORAGE_KEY_PREFIX,
  BLOB_KIND_A1_SHEET_SVG,
  buildArtifactStorageKey,
  computeRetentionExpiresAt,
  resolveRetentionDays,
  createInMemoryArtifactStorageAdapter,
  createFilesystemArtifactStorageAdapter,
  createS3ArtifactStorageAdapter,
  resolveArtifactStorageAdapter,
  getDefaultArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
  clearInMemoryArtifactStorage,
  verifySignedDownloadToken,
};
