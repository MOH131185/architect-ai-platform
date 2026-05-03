/* global globalThis */
/**
 * Shared helpers for the Met Office → Open-Meteo → OpenWeather provider chain.
 * Server-only guard, fetch resolution, per-provider timeout wrapper, climate
 * zone inference, and degrees-to-cardinal conversion.
 */

export const DEFAULT_PROVIDER_TIMEOUT_MS = 8000;

export function isRealBrowserRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  if (typeof process === "undefined") return true;
  if (!process.versions || !process.versions.node) return true;
  return false;
}

export function getInjectedFetch(injected) {
  if (injected === null) return null;
  if (typeof injected === "function") return injected;
  if (typeof globalThis.fetch === "function")
    return globalThis.fetch.bind(globalThis);
  return null;
}

export function settleWithin(promise, timeoutMs, fallback) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ...fallback, __timedOut: true, __timeoutMs: timeoutMs });
    }, timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ...fallback, __error: err?.message || String(err) });
      });
  });
}

export function degreesToCardinal(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const norm = ((Number(deg) % 360) + 360) % 360;
  return dirs[Math.round(norm / 45) % 8];
}

export function inferClimateZone(tempC) {
  if (!Number.isFinite(tempC)) return "Temperate";
  if (tempC > 35) return "Arid";
  if (tempC > 25) return "Tropical";
  if (tempC < -5) return "Polar";
  if (tempC < 5) return "Cold";
  return "Temperate";
}

export function emptyEnvelope({ source, licenseNote, reason }) {
  return {
    data: null,
    source,
    license_note: licenseNote,
    confidence: 0,
    fetched_at: null,
    error: reason,
  };
}

export function successEnvelope({ source, licenseNote, confidence = 0.95 }) {
  return {
    data: true,
    source,
    license_note: licenseNote,
    confidence,
    fetched_at: new Date(0).toISOString(),
    error: null,
  };
}

export function errorEnvelope({ source, licenseNote, reason }) {
  return {
    data: null,
    source,
    license_note: licenseNote,
    confidence: 0,
    fetched_at: null,
    error: typeof reason === "string" ? reason : reason?.message || "unknown",
  };
}

/**
 * Wraps a single provider's network call with browser-guard, key check,
 * timeout, and uniform return shape: {data, provider, authority, envelope}.
 *
 * The `runFetch` callback receives a resolved fetch impl + key and is expected
 * to perform the network call and return either a successEnvelope-shaped data
 * payload or null (in which case errorEnvelope is synthesised from `error`).
 */
export async function runProviderCall({
  providerName,
  authority,
  source,
  licenseNote,
  fetchImpl,
  apiKey,
  apiKeyRequired = true,
  noKeyReason,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  runFetch,
}) {
  if (isRealBrowserRuntime()) {
    return {
      data: null,
      provider: providerName,
      authority,
      envelope: emptyEnvelope({
        source,
        licenseNote,
        reason: "browser-runtime-refused",
      }),
    };
  }
  const f = getInjectedFetch(fetchImpl);
  if (!f) {
    return {
      data: null,
      provider: providerName,
      authority,
      envelope: emptyEnvelope({
        source,
        licenseNote,
        reason: "no-fetch-available",
      }),
    };
  }
  if (apiKeyRequired && !apiKey) {
    return {
      data: null,
      provider: providerName,
      authority,
      envelope: emptyEnvelope({
        source,
        licenseNote,
        reason: noKeyReason || "no-api-key",
      }),
    };
  }
  const fetchPromise = (async () => {
    try {
      return await runFetch({ fetchImpl: f, apiKey });
    } catch (err) {
      return {
        data: null,
        provider: providerName,
        authority,
        envelope: errorEnvelope({ source, licenseNote, reason: err }),
      };
    }
  })();
  const timeoutFallback = {
    data: null,
    provider: providerName,
    authority,
    envelope: errorEnvelope({
      source,
      licenseNote,
      reason: `timeout-${timeoutMs}ms`,
    }),
  };
  return settleWithin(fetchPromise, timeoutMs, timeoutFallback);
}
