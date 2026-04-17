/**
 * Shared Clerk authentication helper for Vercel serverless functions.
 * Verifies the Bearer session token in the Authorization header using @clerk/backend.
 *
 * Usage:
 *   const { userId, error } = await verifyClerkSession(req);
 *   if (error) return res.status(401).json({ error });
 */

import { createClerkClient } from "@clerk/backend";

let _clerk = null;

function getClerk() {
  if (!_clerk) {
    _clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  }
  return _clerk;
}

/**
 * Extract and verify the Clerk session token from the request.
 * Returns { userId } on success, or { error } on failure.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ userId?: string; error?: string }>}
 */
export async function verifyClerkSession(req) {
  const authHeader = req.headers?.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { error: "Missing Authorization header" };
  }

  try {
    const clerk = getClerk();
    const payload = await clerk.verifyToken(token);
    const userId = payload?.sub;
    if (!userId) {
      return { error: "Invalid session token" };
    }
    return { userId };
  } catch (err) {
    return { error: "Invalid or expired session token" };
  }
}
