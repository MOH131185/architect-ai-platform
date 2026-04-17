/**
 * GET /api/me
 *
 * Returns { plan, remaining, limit } for the authenticated user.
 * Creates the user row on first call (lazy init).
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";
import { verifyClerkSession } from "./_shared/clerkAuth.js";
import {
  getOrCreateUser,
  checkGenerationLimit,
} from "../src/services/database.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId: clerkId, error: authError } = await verifyClerkSession(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }

  try {
    const user = await getOrCreateUser(
      clerkId,
      req.headers["x-user-email"] || "",
    );
    const { remaining, limit } = await checkGenerationLimit(user.id);

    return res.status(200).json({
      plan: user.plan,
      remaining: remaining === Infinity ? null : remaining,
      limit: limit === Infinity ? null : limit,
    });
  } catch (err) {
    console.error("[me] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
