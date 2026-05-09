/* global globalThis */
import { computeCDSHashSync } from "../validation/cdsHash.js";

export const ARTIFACT_STORAGE_SERVICE_VERSION = "artifact-storage-service-v1";
export const ARTIFACT_STORAGE_NOT_FOUND = "ARTIFACT_STORAGE_NOT_FOUND";
export const ARTIFACT_STORAGE_DELETED = "ARTIFACT_STORAGE_DELETED";
export const ARTIFACT_STORAGE_EXPIRED = "ARTIFACT_STORAGE_EXPIRED";
export const ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED =
  "ARTIFACT_STORAGE_SIGNED_URL_UNSUPPORTED";
export const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 15 * 60;

const MEMORY_STATE_KEY = "__archiaiArtifactPackageStorage";

function getMemoryState() {
  if (!globalThis[MEMORY_STATE_KEY]) {
    globalThis[MEMORY_STATE_KEY] = {
      packages: new Map(),
    };
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

function nowDate(now) {
  if (now instanceof Date) return now;
  if (typeof now === "function") return nowDate(now());
  if (typeof now === "string" || typeof now === "number") return new Date(now);
  return new Date();
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
}) {
  const bytes = cloneBytes(zipBytes);
  const storedAt = nowDate(now).toISOString();
  return {
    packageId,
    packageHash: manifest?.packageHash || metadata?.packageHash || null,
    manifest: cloneJson(manifest),
    metadata: cloneJson(metadata || {}),
    zipBytes: bytes,
    byteLength: bytes.byteLength,
    storageKey,
    adapterName,
    storedAt,
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

  const adapterCapabilities = Object.freeze({
    adapter: adapterName,
    persistent: false,
    signedUrls: Boolean(signedUrlSecret),
    delete: true,
    list: true,
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
        storageKey: `memory://${safeId}.zip`,
        adapterName,
        now,
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
  const adapterCapabilities = Object.freeze({
    adapter: adapterName,
    persistent: true,
    signedUrls: Boolean(signedUrlSecret),
    delete: true,
    list: true,
  });

  async function pathsFor(packageId) {
    const path = await import("node:path");
    const safeId = sanitizePackageId(packageId);
    const packageDir = path.join(rootDir, "packages");
    await ensureDir(packageDir);
    return {
      safeId,
      zipPath: path.join(packageDir, `${safeId}.zip`),
      manifestPath: path.join(packageDir, `${safeId}.manifest.json`),
      metadataPath: path.join(packageDir, `${safeId}.metadata.json`),
    };
  }

  async function readRecord(packageId) {
    const fs = await import("node:fs/promises");
    const paths = await pathsFor(packageId);
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
      storageKey: paths.zipPath,
      adapterName,
      storedAt: metadata.storedAt || null,
      status: metadata.status || "stored",
      deletedAt: metadata.deletedAt || null,
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
      const paths = await pathsFor(safeId);
      const record = storageRecord({
        packageId: safeId,
        zipBytes,
        manifest,
        metadata,
        storageKey: paths.zipPath,
        adapterName,
        now,
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
      const paths = await pathsFor(packageId);
      const existing = await readRecord(packageId);
      if (!existing) {
        return { deleted: false, code: ARTIFACT_STORAGE_NOT_FOUND };
      }
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
      const packageDir = path.join(rootDir, "packages");
      if (!(await fileExists(packageDir))) return [];
      const fileNames = await fs.readdir(packageDir);
      const manifestNames = fileNames.filter((name) =>
        name.endsWith(".manifest.json"),
      );
      const records = [];
      for (const name of manifestNames) {
        const packageId = name.replace(/\.manifest\.json$/, "");
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
  };
}

export function resolveArtifactStorageAdapter(env = undefined, options = {}) {
  const effectiveEnv = env || globalThis.process?.env || {};
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
  if (rootDir) {
    return createFilesystemArtifactStorageAdapter({
      rootDir,
      signedUrlSecret,
      signedUrlBaseUrl,
      now: options.now,
    });
  }
  return createInMemoryArtifactStorageAdapter({
    signedUrlSecret,
    signedUrlBaseUrl,
    now: options.now,
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
  createInMemoryArtifactStorageAdapter,
  createFilesystemArtifactStorageAdapter,
  resolveArtifactStorageAdapter,
  getDefaultArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
  clearInMemoryArtifactStorage,
  verifySignedDownloadToken,
};
