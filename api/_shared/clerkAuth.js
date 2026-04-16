/**
 * Shared Clerk authentication helper for Vercel serverless functions and
 * the Express dev proxy.
 *
 * Verifies the `Authorization: Bearer <sessionToken>` header using
 * @clerk/backend and returns a stable { clerkId, email } identity. Throws on
 * any failure so callers can respond with 401 uniformly.
 *
 * Env vars required:
 *   CLERK_SECRET_KEY — server-only Clerk secret (sk_test_... / sk_live_...)
 *
 * Usage:
 *   import { verifyClerkSession } from './_shared/clerkAuth.js';
 *   const user = await verifyClerkSession(req); // throws 401 on failure
 */

import { createClerkClient } from "@clerk/backend";

let cachedClient = null;

function getClerkClient() {
  if (cachedClient) return cachedClient;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw Object.assign(new Error("CLERK_SECRET_KEY not configured"), {
      statusCode: 500,
    });
  }
  cachedClient = createClerkClient({ secretKey });
  return cachedClient;
}

function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Verify the Clerk session token on the request. Returns
 * { clerkId, email, sessionId } on success. Throws an Error with
 * `.statusCode = 401` on any failure.
 */
export async function verifyClerkSession(req) {
  const token = extractBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("Missing Authorization bearer token"), {
      statusCode: 401,
    });
  }

  const client = getClerkClient();

  let payload;
  try {
    // verifyToken validates signature, expiry, issuer, and audience.
    payload = await client.verifyToken(token);
  } catch (err) {
    throw Object.assign(new Error(`Invalid session token: ${err.message}`), {
      statusCode: 401,
    });
  }

  const clerkId = payload?.sub;
  if (!clerkId) {
    throw Object.assign(new Error("Token missing subject"), {
      statusCode: 401,
    });
  }

  // Clerk tokens don't always include email — fetch the user record if needed.
  let email = payload?.email || null;
  if (!email) {
    try {
      const user = await client.users.getUser(clerkId);
      email =
        user?.primaryEmailAddress?.emailAddress ||
        user?.emailAddresses?.[0]?.emailAddress ||
        null;
    } catch (err) {
      // Non-fatal: we still have clerkId. Some callers (e.g. /start) only need
      // the id. getOrCreateUser will fail later if email is required.
      console.warn("[clerkAuth] getUser failed:", err.message);
    }
  }

  return {
    clerkId,
    email,
    sessionId: payload?.sid || null,
  };
}

/**
 * Wrapper that writes a 401 response and returns null if auth fails, or
 * returns the user identity on success. Convenience for handlers that want
 * early-return semantics.
 */
export async function requireClerkSession(req, res) {
  try {
    return await verifyClerkSession(req);
  } catch (err) {
    const statusCode = err.statusCode || 401;
    res.status(statusCode).json({
      error: {
        code: statusCode === 401 ? "UNAUTHENTICATED" : "AUTH_ERROR",
        message: err.message,
      },
    });
    return null;
  }
}
