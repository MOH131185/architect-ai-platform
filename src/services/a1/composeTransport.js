/**
 * Canonical HTTP transport helpers for the A1 compose route.
 * Keeps method handling, CORS, and unexpected error mapping separate from compose logic.
 */

export function applyComposeCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function handleComposePreflight(req, res) {
  if (req.method !== "OPTIONS") {
    return false;
  }

  res.status(200).end();
  return true;
}

export function enforceComposePostMethod(req, res) {
  if (req.method === "POST") {
    return false;
  }

  res.status(405).json({
    success: false,
    error: "METHOD_NOT_ALLOWED",
    message: "Method not allowed",
  });
  return true;
}

export function applyComposeNoStoreHeaders(
  res,
  { designFingerprint, composedAt, traceId, runId } = {},
) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Design-Fingerprint", designFingerprint || "unknown");
  res.setHeader(
    "X-Composition-Timestamp",
    composedAt || new Date().toISOString(),
  );
  if (traceId) {
    res.setHeader("X-Compose-Trace-Id", traceId);
  }
  if (runId) {
    res.setHeader("X-Compose-Run-Id", runId);
  }
}

export function sendComposeUnhandledError(res, error, context = {}) {
  const { traceId, runId } = context;
  if (traceId) {
    res.setHeader("X-Compose-Trace-Id", traceId);
  }
  if (runId) {
    res.setHeader("X-Compose-Run-Id", runId);
  }
  console.error(`[A1 Compose${traceId ? `][${traceId}` : ""}] Error:`, error);
  return res.status(500).json({
    success: false,
    error: "COMPOSITION_FAILED",
    message: error.message,
    traceId: traceId || null,
    runId: runId || null,
    details:
      process.env.NODE_ENV === "development"
        ? { stack: error.stack }
        : undefined,
  });
}
