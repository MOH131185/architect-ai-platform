/**
 * Shared CORS utility for Vercel serverless functions.
 *
 * Validates the request Origin against an allowlist and sets
 * appropriate CORS headers. Replaces the previous pattern of
 * hardcoding Access-Control-Allow-Origin: * in every endpoint.
 */

const ALLOWED_ORIGINS = [
  "https://www.archiaisolution.pro",
  "https://archiaisolution.pro",
  "http://localhost:3000",
  "http://localhost:3001",
];

// Match Vercel preview deployments: architect-ai-platform-*.vercel.app
const VERCEL_PREVIEW_RE =
  /^https:\/\/architect-ai-platform[a-z0-9-]*\.vercel\.app$/;

/**
 * Resolve the allowed origin for the given request.
 * Returns the matched origin string, or the production origin as default.
 */
function resolveOrigin(reqOrigin) {
  if (!reqOrigin) return ALLOWED_ORIGINS[0]; // default to production

  if (ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  if (VERCEL_PREVIEW_RE.test(reqOrigin)) return reqOrigin;

  // Check ALLOWED_ORIGINS env var for additional origins (comma-separated)
  const extra = process.env.ALLOWED_ORIGINS;
  if (extra) {
    const list = extra
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes(reqOrigin)) return reqOrigin;
  }

  return ALLOWED_ORIGINS[0]; // reject unknown origins by returning production
}

/**
 * Set CORS headers on a Node.js res object (standard Vercel serverless functions).
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {object} [opts]
 * @param {string} [opts.methods] - Allowed HTTP methods (default: "GET, POST, OPTIONS")
 */
export function setCorsHeaders(req, res, opts = {}) {
  const origin = req.headers?.origin || "";
  const methods = opts.methods || "GET, POST, OPTIONS";

  res.setHeader("Access-Control-Allow-Origin", resolveOrigin(origin));
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Vary", "Origin");
}

/**
 * Return CORS headers object for Edge runtime functions (Response API).
 *
 * @param {Request} req - Web API Request
 * @param {object} [opts]
 * @param {string} [opts.methods] - Allowed HTTP methods
 * @returns {Record<string, string>}
 */
export function getCorsHeaders(req, opts = {}) {
  const origin = req.headers?.get?.("origin") || "";
  const methods = opts.methods || "GET, OPTIONS";

  return {
    "Access-Control-Allow-Origin": resolveOrigin(origin),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    Vary: "Origin",
  };
}

/**
 * Handle an OPTIONS preflight request for Node runtime.
 * Returns true if the request was an OPTIONS preflight (caller should return early).
 */
export function handlePreflight(req, res, opts = {}) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res, opts);
    res.status(200).end();
    return true;
  }
  return false;
}
