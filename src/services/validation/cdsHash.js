/**
 * CDS Hash - Canonical Design State SHA-256 Hashing
 *
 * Produces deterministic hashes for CDS and ProgramLock objects.
 * Used to detect drift between pipeline stages and across modify iterations.
 */

/**
 * Compute SHA-256 hash of a canonical JSON string.
 * The object is serialized with sorted keys for determinism.
 *
 * @param {Object} obj - Object to hash (the `hash` key is excluded)
 * @returns {Promise<string>} hex-encoded SHA-256 digest
 */
export async function computeCDSHash(obj) {
  const canonical = canonicalStringify(obj);
  // Use SubtleCrypto when available (browser + Node 15+)
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(canonical);
    const buffer = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: deterministic DJB2-based hash (not cryptographic, but usable for drift detection)
  return deterministicFallbackHash(canonical);
}

/**
 * Synchronous hash for contexts where async is impractical.
 * Uses DJB2 variant - NOT cryptographic, but deterministic and fast.
 *
 * @param {Object} obj - Object to hash
 * @returns {string} hex-encoded hash
 */
export function computeCDSHashSync(obj) {
  const canonical = canonicalStringify(obj);
  return deterministicFallbackHash(canonical);
}

/**
 * Canonical JSON stringify with sorted keys and `hash` key excluded.
 * Produces identical output for semantically identical objects.
 *
 * @param {Object} obj
 * @returns {string}
 */
export function canonicalStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (key === "hash") return undefined; // Exclude hash field
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Sort object keys
      const sorted = {};
      Object.keys(value)
        .sort()
        .forEach((k) => {
          if (k !== "hash") sorted[k] = value[k];
        });
      return sorted;
    }
    return value;
  });
}

/**
 * DJB2-based deterministic hash fallback.
 * Returns a 16-char hex string.
 */
function deterministicFallbackHash(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return hex1 + hex2;
}

/**
 * Verify a CDS or ProgramLock hash matches its content.
 *
 * @param {Object} obj - Object with `.hash` field
 * @returns {Promise<boolean>}
 */
export async function verifyCDSHash(obj) {
  if (!obj || !obj.hash) return false;
  const expected = await computeCDSHash(obj);
  return expected === obj.hash;
}

export function verifyCDSHashSync(obj) {
  if (!obj || !obj.hash) return false;
  const expected = computeCDSHashSync(obj);
  return expected === obj.hash;
}

export default {
  computeCDSHash,
  computeCDSHashSync,
  canonicalStringify,
  verifyCDSHash,
  verifyCDSHashSync,
};
