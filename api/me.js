/**
 * GET /api/me
 *
 * Returns the current user's plan and usage. Called by the NavBar usage chip
 * and pricing page. Lazily creates the Supabase row on first request (so we
 * don't need a Clerk sign-up webhook).
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";
import { requireClerkSession } from "./_shared/clerkAuth.js";
import {
  getOrCreateUser,
  checkGenerationLimit,
} from "../src/services/database.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const session = await requireClerkSession(req, res);
  if (!session) return;

  try {
    const user = await getOrCreateUser(session.clerkId, session.email);
    const limit = await checkGenerationLimit(user.id);

    return res.status(200).json({
      clerkId: session.clerkId,
      email: user.email,
      plan: user.plan,
      limit: limit.unlimited ? null : limit.limit,
      remaining: limit.unlimited ? null : limit.remaining,
      used: limit.used,
      unlimited: limit.unlimited,
    });
  } catch (err) {
    console.error("[api/me] error:", err);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}
