/* global globalThis */
/**
 * Provider interface and shared helpers for UK context data sources. Plan §14.
 *
 * Every provider must:
 *   - Accept an injected fetch impl (default to globalThis.fetch when present)
 *     so tests can stub responses without network.
 *   - Return a uniform { data, source, confidence, error } envelope.
 *   - Degrade gracefully when offline / network errors / non-200 responses
 *     so the slice never crashes mid-pipeline.
 */

export const PROVIDER_ENVELOPE_KEYS = Object.freeze([
  "data",
  "source",
  "license_note",
  "confidence",
  "fetched_at",
  "error",
]);

export function emptyEnvelope({
  source,
  license_note = "",
  reason = "no-data",
} = {}) {
  return {
    data: null,
    source,
    license_note,
    confidence: 0,
    fetched_at: null,
    error: reason,
  };
}

export function successEnvelope({
  data,
  source,
  license_note = "",
  confidence = 1,
}) {
  return {
    data,
    source,
    license_note,
    confidence,
    fetched_at: new Date(0).toISOString(), // deterministic stamp; replace with Date.now() at call time if needed
    error: null,
  };
}

export function errorEnvelope({ source, license_note = "", error }) {
  return {
    data: null,
    source,
    license_note,
    confidence: 0,
    fetched_at: null,
    error: typeof error === "string" ? error : error?.message || "unknown",
  };
}

export function getInjectedFetch(injected) {
  // Explicit null is honoured as "offline" so tests can pin behaviour without
  // worrying about jsdom or jest.setup.js polyfills.
  if (injected === null) return null;
  if (typeof injected === "function") return injected;
  if (typeof globalThis.fetch === "function")
    return globalThis.fetch.bind(globalThis);
  return null;
}

export function roundCoord(value, dp = 4) {
  const factor = 10 ** dp;
  return Math.round(Number(value) * factor) / factor;
}

export function cacheKey(prefix, lat, lon) {
  return `${prefix}:${roundCoord(lat)}:${roundCoord(lon)}`;
}

export default {
  emptyEnvelope,
  successEnvelope,
  errorEnvelope,
  getInjectedFetch,
  roundCoord,
  cacheKey,
};
