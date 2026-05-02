/**
 * Phase 5C — Overpass client (server-side only).
 *
 * Thin wrapper around the public Overpass instance. Server-only: this
 * module is imported by `api/site/boundary.js` and runs in Vercel
 * Functions, where there is no CORS to worry about. The browser must
 * NOT import this directly — it talks to `/api/site/boundary` instead.
 *
 * Behaviour:
 *   - 8 s timeout per request (well below Vercel's default 300 s)
 *   - 1 retry on 5xx with 500 ms backoff
 *   - 429 returns immediately (no retry); upstream caller should fall
 *     through to the existing estimated-boundary path
 *   - parses JSON, returns `data.elements` or empty array
 *   - throws on network error, timeout, malformed JSON, or persistent
 *     5xx — caller wraps in try/catch and falls through to fallback
 *
 * The `fetchImpl` parameter exists so tests can inject a mocked fetch.
 */

const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT =
  "architect-ai-platform/site-boundary-proxy (https://archiaisolution.pro)";

export class OverpassRateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "OverpassRateLimitError";
    this.rateLimited = true;
  }
}

export class OverpassTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "OverpassTimeoutError";
    this.timedOut = true;
  }
}

/**
 * Build the Overpass query for a building near `(lat, lng)` within
 * `radiusM` metres. Mirrors the existing in-tree query in
 * `propertyBoundaryService.detectFromOSMBuilding` so behaviour parity
 * is preserved when the proxy lights up.
 */
export function buildBuildingQuery({ lat, lng, radiusM = 30 }) {
  return `[out:json][timeout:25];
(
  way["building"](around:${radiusM},${lat},${lng});
);
out geom;
`;
}

/**
 * Build the Overpass query for landuse / parcel polygons near
 * `(lat, lng)`. Mirrors `detectFromOSMParcel`.
 */
export function buildParcelQuery({ lat, lng, radiusM = 50 }) {
  return `[out:json][timeout:25];
(
  way["landuse"](around:${radiusM},${lat},${lng});
  way["boundary"="administrative"](around:${radiusM},${lat},${lng});
);
out geom;
`;
}

async function postOverpass({ url, query, timeoutMs, fetchImpl, signal }) {
  const controller = new AbortController();
  const aborted = signal
    ? () => controller.abort(signal.reason || "caller_signal")
    : null;
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason || "caller_signal");
    else signal.addEventListener("abort", aborted);
  }
  const timer = setTimeout(() => {
    controller.abort("overpass_timeout");
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      body: query,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
    if (signal && aborted) signal.removeEventListener("abort", aborted);
  }
}

/**
 * Run an Overpass query with timeout + 1 retry on 5xx.
 *
 * @param {object} params
 * @param {string} params.query     - Overpass QL text
 * @param {string} [params.url]     - override Overpass endpoint (tests)
 * @param {number} [params.timeoutMs]
 * @param {function} [params.fetchImpl] - injected fetch (tests)
 * @param {AbortSignal} [params.signal] - upstream cancellation
 * @returns {Promise<{ elements: Array }>}
 */
export async function runOverpassQuery({
  query,
  url = process.env.OVERPASS_URL || DEFAULT_OVERPASS_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl,
  signal = undefined,
} = {}) {
  const resolvedFetch =
    fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (typeof resolvedFetch !== "function") {
    throw new Error("runOverpassQuery: fetch is not available in this runtime");
  }
  const attempt = async (isRetry) => {
    let response;
    try {
      response = await postOverpass({
        url,
        query,
        timeoutMs,
        fetchImpl: resolvedFetch,
        signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new OverpassTimeoutError(
          `Overpass request timed out after ${timeoutMs}ms`,
        );
      }
      throw err;
    }
    if (response.status === 429) {
      throw new OverpassRateLimitError(
        "Overpass rate limit (429); falling through to estimated boundary",
      );
    }
    if (!response.ok) {
      const text = await safeText(response);
      const err = new Error(
        `Overpass ${response.status} ${response.statusText || ""}: ${text.slice(0, 200)}`,
      );
      err.status = response.status;
      err.retryable = response.status >= 500 && !isRetry;
      throw err;
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error(`Overpass returned malformed JSON: ${err?.message}`);
    }
    if (!data || !Array.isArray(data.elements)) {
      return { elements: [] };
    }
    return { elements: data.elements };
  };

  try {
    return await attempt(false);
  } catch (err) {
    if (err?.retryable) {
      await new Promise((r) => setTimeout(r, 500));
      return await attempt(true);
    }
    throw err;
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Convenience wrapper: run building + parcel queries in parallel.
 * Either query failing independently does NOT throw — the caller can
 * still attempt to use whichever set of elements came back. Only when
 * both fail does the wrapper rethrow.
 */
export async function fetchBuildingAndParcel({
  lat,
  lng,
  buildingRadiusM = 30,
  parcelRadiusM = 50,
  url,
  timeoutMs,
  fetchImpl,
  signal,
}) {
  const buildingPromise = runOverpassQuery({
    query: buildBuildingQuery({ lat, lng, radiusM: buildingRadiusM }),
    url,
    timeoutMs,
    fetchImpl,
    signal,
  }).catch((err) => ({ error: err }));
  const parcelPromise = runOverpassQuery({
    query: buildParcelQuery({ lat, lng, radiusM: parcelRadiusM }),
    url,
    timeoutMs,
    fetchImpl,
    signal,
  }).catch((err) => ({ error: err }));

  const [buildingResult, parcelResult] = await Promise.all([
    buildingPromise,
    parcelPromise,
  ]);

  const buildingElements = buildingResult?.elements || [];
  const parcelElements = parcelResult?.elements || [];
  const buildingError = buildingResult?.error || null;
  const parcelError = parcelResult?.error || null;

  // If both errored out, rethrow the building error (the more important
  // of the two for our use case). Caller catches and falls through.
  if (buildingError && parcelError) {
    if (buildingError.rateLimited || parcelError.rateLimited) {
      throw new OverpassRateLimitError(
        "Both Overpass building and parcel queries were rate-limited",
      );
    }
    throw buildingError;
  }

  return {
    buildingElements,
    parcelElements,
    buildingError,
    parcelError,
  };
}
