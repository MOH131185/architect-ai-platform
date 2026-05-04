import logger from "../utils/logger.js";
import { computeCDSHashSync } from "./validation/cdsHash.js";

export const DESIGN_HISTORY_ARTIFACT_URL_PREFIX = "archiai-artifact://";

const DB_NAME = "archiAI_design_history_artifacts";
const STORE_NAME = "artifacts";

function nowIso() {
  return new Date().toISOString();
}

function sanitizeIdPart(value = "") {
  return String(value || "artifact")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function mimeFromDataUrl(dataUrl = "") {
  const match = String(dataUrl).match(/^data:([^;,]+)[;,]/i);
  return match ? match[1] : "application/octet-stream";
}

function extensionForMime(mimeType = "") {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function decodeBase64ToUint8Array(base64 = "") {
  const clean = String(base64 || "").replace(/\s/g, "");
  if (typeof atob === "function") {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return new Uint8Array(Buffer.from(clean, "base64"));
  }

  throw new Error("Base64 decoder unavailable");
}

function dataUrlToBlob(dataUrl = "") {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Invalid data URL: missing payload separator");
  }

  const meta = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const mimeType = (meta.split(";")[0] || "application/octet-stream").trim();

  if (/;base64\b/i.test(meta)) {
    return new Blob([decodeBase64ToUint8Array(payload)], { type: mimeType });
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType });
}

export function isDesignHistoryArtifactUrl(value) {
  return (
    typeof value === "string" &&
    value.startsWith(DESIGN_HISTORY_ARTIFACT_URL_PREFIX)
  );
}

export function isStorableDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

export function artifactIdFromUrl(value = "") {
  if (!isDesignHistoryArtifactUrl(value)) {
    return String(value || "");
  }
  return decodeURIComponent(
    value.slice(DESIGN_HISTORY_ARTIFACT_URL_PREFIX.length),
  );
}

export function artifactUrlForId(artifactId) {
  return `${DESIGN_HISTORY_ARTIFACT_URL_PREFIX}${encodeURIComponent(
    artifactId,
  )}`;
}

class DesignHistoryArtifactStore {
  constructor() {
    this.memoryStore = new Map();
    this.dbPromise = null;
    this.backend = "indexedDB";
  }

  async ensureDb() {
    if (typeof indexedDB === "undefined") {
      this.backend = "memory";
      return null;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => {
        logger.warn(
          "Design history artifact IndexedDB unavailable; using memory store",
          {
            error: request.error?.message || String(request.error || ""),
          },
        );
        this.backend = "memory";
        resolve(null);
      };

      request.onsuccess = () => {
        this.backend = "indexedDB";
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this.dbPromise;
  }

  async putRecord(record) {
    const db = await this.ensureDb();
    if (!db) {
      this.memoryStore.set(record.artifactId, record);
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record, record.artifactId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getRecord(artifactUrlOrId) {
    const artifactId = artifactIdFromUrl(artifactUrlOrId);
    if (!artifactId) {
      return null;
    }

    const db = await this.ensureDb();
    if (!db) {
      return this.memoryStore.get(artifactId) || null;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(artifactId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecord(artifactUrlOrId) {
    const artifactId = artifactIdFromUrl(artifactUrlOrId);
    if (!artifactId) return false;

    const db = await this.ensureDb();
    if (!db) {
      return this.memoryStore.delete(artifactId);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(artifactId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async saveArtifact({
    designId,
    artifactType = "artifact",
    payload,
    payloadKind = "data_url",
    mimeType = null,
    metadata = {},
  } = {}) {
    if (typeof payload !== "string" || payload.length === 0) {
      return null;
    }

    const resolvedMime =
      mimeType ||
      (payloadKind === "data_url"
        ? mimeFromDataUrl(payload)
        : "application/octet-stream");
    const contentHash = computeCDSHashSync({
      artifactType,
      mimeType: resolvedMime,
      payload,
    });
    const artifactId = sanitizeIdPart(
      `${artifactType}-${designId || "design"}-${contentHash}`,
    );
    const artifactUrl = artifactUrlForId(artifactId);
    const byteLength =
      typeof Blob !== "undefined"
        ? new Blob([payload]).size
        : String(payload).length;
    const record = {
      schema_version: "design-history-artifact-v1",
      artifactId,
      artifactUrl,
      designId: designId || null,
      artifactType,
      payloadKind,
      payload,
      mimeType: resolvedMime,
      extension: extensionForMime(resolvedMime),
      byteLength,
      contentHash,
      metadata: metadata || {},
      createdAt: nowIso(),
    };

    await this.putRecord(record);

    return {
      artifactId,
      artifactUrl,
      artifactType,
      mimeType: resolvedMime,
      extension: record.extension,
      byteLength,
      contentHash,
      storage: this.backend,
      metadata: record.metadata,
    };
  }

  async loadArtifactBlob(artifactUrlOrId) {
    const record = await this.getRecord(artifactUrlOrId);
    if (!record) {
      return null;
    }

    if (record.payloadKind === "data_url") {
      return dataUrlToBlob(record.payload);
    }

    return new Blob([record.payload || ""], {
      type: record.mimeType || "application/octet-stream",
    });
  }

  async resolveArtifactUrlToObjectUrl(artifactUrl) {
    if (!isDesignHistoryArtifactUrl(artifactUrl)) {
      return artifactUrl || null;
    }

    const blob = await this.loadArtifactBlob(artifactUrl);
    if (!blob || typeof URL === "undefined" || !URL.createObjectURL) {
      return null;
    }

    return URL.createObjectURL(blob);
  }

  async deleteArtifactsForDesign(designId) {
    if (!designId) return false;

    const db = await this.ensureDb();
    if (!db) {
      for (const [artifactId, record] of this.memoryStore.entries()) {
        if (record?.designId === designId) {
          this.memoryStore.delete(artifactId);
        }
      }
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(true);
          return;
        }
        if (cursor.value?.designId === designId) {
          cursor.delete();
        }
        cursor.continue();
      };
    });
  }

  async clearAllArtifacts() {
    this.memoryStore.clear();
    const db = await this.ensureDb();
    if (!db) return true;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}

const designHistoryArtifactStore = new DesignHistoryArtifactStore();

export async function resolveDesignHistoryArtifactUrlToObjectUrl(artifactUrl) {
  return designHistoryArtifactStore.resolveArtifactUrlToObjectUrl(artifactUrl);
}

export default designHistoryArtifactStore;
