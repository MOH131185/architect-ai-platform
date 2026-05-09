/* global globalThis */
import {
  canonicalStringify,
  computeCDSHashSync,
} from "../validation/cdsHash.js";

export const ARTIFACT_HISTORY_SERVICE_VERSION = "artifact-history-service-v1";
export const ARTIFACT_HISTORY_SCHEMA_VERSION =
  "artifact-package-history-record-v1";
export const ARTIFACT_HISTORY_NOT_FOUND = "ARTIFACT_HISTORY_NOT_FOUND";

const HISTORY_STATE_KEY = "__archiaiArtifactPackageHistory";

function getHistoryState() {
  if (!globalThis[HISTORY_STATE_KEY]) {
    globalThis[HISTORY_STATE_KEY] = {
      records: new Map(),
    };
  }
  return globalThis[HISTORY_STATE_KEY];
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === "function") return nowIso(now());
  if (typeof now === "string" || typeof now === "number") {
    return new Date(now).toISOString();
  }
  return new Date().toISOString();
}

function asCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function safeRecord(record = {}) {
  const clone = cloneJson(record);
  delete clone?.zipBytes;
  delete clone?.rawBytes;
  delete clone?.secret;
  delete clone?.env;
  return clone;
}

export function createArtifactHistoryRecord({
  packageResult,
  storageRecord,
  userId = null,
  signedUrlInfo = null,
  downloadRoute = null,
  status = "stored",
  now = undefined,
} = {}) {
  const manifest = packageResult?.manifest || storageRecord?.manifest || {};
  const sourceGaps = Array.isArray(manifest.sourceGaps)
    ? manifest.sourceGaps
    : [];
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const manifestHash = computeCDSHashSync({
    manifest: canonicalStringify(manifest),
  });
  const createdAt = nowIso(now);
  const retentionExpiresAt =
    storageRecord?.expiresAt || storageRecord?.metadata?.expiresAt || null;
  const signedUrlExpiresAt = signedUrlInfo?.supported
    ? signedUrlInfo.expiresAt
    : null;

  return safeRecord({
    schemaVersion: ARTIFACT_HISTORY_SCHEMA_VERSION,
    packageId:
      packageResult?.packageId ||
      storageRecord?.packageId ||
      manifest.packageId,
    packageHash:
      packageResult?.packageHash ||
      storageRecord?.packageHash ||
      manifest.packageHash,
    projectId: manifest.projectId || null,
    projectGraphId: manifest.projectGraphId || null,
    userId: userId || null,
    createdAt,
    manifestHash,
    geometryHash: manifest.geometryHash || null,
    visualManifestHash: manifest.visualManifestHash || null,
    styleBlendManifestHash: manifest.styleBlendManifestHash || null,
    jurisdictionId: manifest.jurisdictionId || null,
    countryCode: manifest.countryCode || null,
    artifactCount: artifacts.length,
    sourceGapCount: sourceGaps.length,
    byteLength: asCount(
      storageRecord?.byteLength || packageResult?.zipBytes?.byteLength,
    ),
    storageKey: storageRecord?.storageKey || null,
    downloadUrl: signedUrlInfo?.supported
      ? signedUrlInfo.signedUrl
      : downloadRoute,
    signedUrl: signedUrlInfo?.supported ? signedUrlInfo.signedUrl : null,
    signedUrlAvailable: signedUrlInfo?.supported === true,
    expiresAt: retentionExpiresAt,
    signedUrlExpiresAt,
    retentionDays:
      storageRecord?.retentionDays ||
      storageRecord?.metadata?.retentionDays ||
      null,
    status,
    packageHistoryStatus: status,
    qaStatus: manifest.qaSummary?.status || null,
    flags: cloneJson(manifest.flags || {}),
    producerVersions: cloneJson(manifest.producerVersions || {}),
  });
}

export function recordArtifactPackageHistory(
  record,
  state = getHistoryState(),
) {
  const clean = safeRecord(record);
  if (!clean.packageId) {
    throw new Error("packageId is required for artifact package history");
  }
  state.records.set(clean.packageId, clean);
  return cloneJson(clean);
}

export function getArtifactPackageHistoryRecord(
  { packageId },
  state = getHistoryState(),
) {
  const record = state.records.get(packageId);
  if (!record) return { found: false, code: ARTIFACT_HISTORY_NOT_FOUND };
  return { found: true, record: cloneJson(record) };
}

export function listArtifactPackageHistory(
  { projectId = null, userId = null, includeDeleted = false } = {},
  state = getHistoryState(),
) {
  return [...state.records.values()]
    .filter((record) => (includeDeleted ? true : record.status !== "deleted"))
    .filter((record) => (projectId ? record.projectId === projectId : true))
    .filter((record) => (userId ? record.userId === userId : true))
    .sort((a, b) =>
      [b.createdAt || "", b.packageId || ""]
        .join(":")
        .localeCompare([a.createdAt || "", a.packageId || ""].join(":")),
    )
    .map((record) => cloneJson(record));
}

export function markArtifactPackageDeleted(
  { packageId, now = undefined },
  state = getHistoryState(),
) {
  const existing = state.records.get(packageId);
  if (!existing) return { updated: false, code: ARTIFACT_HISTORY_NOT_FOUND };
  const updated = {
    ...existing,
    status: "deleted",
    packageHistoryStatus: "deleted",
    deletedAt: nowIso(now),
  };
  state.records.set(packageId, updated);
  return { updated: true, record: cloneJson(updated) };
}

export function markArtifactPackageExpired(
  { packageId, now = undefined },
  state = getHistoryState(),
) {
  const existing = state.records.get(packageId);
  if (!existing) return { updated: false, code: ARTIFACT_HISTORY_NOT_FOUND };
  const updated = {
    ...existing,
    status: "expired",
    packageHistoryStatus: "expired",
    expiredAt: nowIso(now),
  };
  state.records.set(packageId, updated);
  return { updated: true, record: cloneJson(updated) };
}

export function listExpiredArtifactPackageHistory(
  { now = undefined } = {},
  state = getHistoryState(),
) {
  const currentTime = new Date(nowIso(now)).getTime();
  return [...state.records.values()]
    .filter((record) => record.status === "stored")
    .filter((record) => record.expiresAt)
    .filter((record) => new Date(record.expiresAt).getTime() <= currentTime)
    .sort((a, b) =>
      [a.expiresAt || "", a.packageId || ""]
        .join(":")
        .localeCompare([b.expiresAt || "", b.packageId || ""].join(":")),
    )
    .map((record) => cloneJson(record));
}

export async function deleteExpiredArtifactPackage(
  { packageId, storageAdapter, now = undefined },
  state = getHistoryState(),
) {
  const existing = state.records.get(packageId);
  if (!existing) return { deleted: false, code: ARTIFACT_HISTORY_NOT_FOUND };
  const currentTime = new Date(nowIso(now)).getTime();
  const expiresAtTime = existing.expiresAt
    ? new Date(existing.expiresAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (expiresAtTime > currentTime) {
    return { deleted: false, code: "ARTIFACT_HISTORY_NOT_EXPIRED" };
  }
  if (storageAdapter?.deleteArtifactPackage) {
    await storageAdapter.deleteArtifactPackage({ packageId });
  }
  const expired = markArtifactPackageExpired({ packageId, now }, state);
  const deleted = markArtifactPackageDeleted({ packageId, now }, state);
  return {
    deleted: deleted.updated,
    record: cloneJson({
      ...(expired.record || existing),
      ...(deleted.record || {}),
      expiredAt: expired.record?.expiredAt || nowIso(now),
    }),
  };
}

export function markArtifactPackageFailed(
  { packageId, reason, now = undefined },
  state = getHistoryState(),
) {
  const existing = state.records.get(packageId) || { packageId };
  const updated = {
    ...existing,
    status: "failed",
    packageHistoryStatus: "failed",
    failedAt: nowIso(now),
    failureReason: reason || "Artifact package storage failed",
  };
  state.records.set(packageId, updated);
  return { updated: true, record: cloneJson(updated) };
}

export function clearArtifactPackageHistory(state = getHistoryState()) {
  state.records.clear();
}

export default {
  ARTIFACT_HISTORY_SERVICE_VERSION,
  ARTIFACT_HISTORY_SCHEMA_VERSION,
  ARTIFACT_HISTORY_NOT_FOUND,
  createArtifactHistoryRecord,
  recordArtifactPackageHistory,
  getArtifactPackageHistoryRecord,
  listArtifactPackageHistory,
  markArtifactPackageDeleted,
  markArtifactPackageExpired,
  listExpiredArtifactPackageHistory,
  deleteExpiredArtifactPackage,
  markArtifactPackageFailed,
  clearArtifactPackageHistory,
};
