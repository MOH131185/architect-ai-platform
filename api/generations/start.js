/**
 * POST /api/generations/start
 *
 * Clerk-authenticated. Atomically:
 *   1. Checks the user's monthly generation limit.
 *   2. If allowed, inserts a pending generations row.
 *   3. Returns { generationId, remaining }.
 *
 * Returns 429 with { upgradeUrl, limit, remaining: 0 } when limit exceeded.
 */

import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { verifyClerkSession } from "../_shared/clerkAuth.js";
import {
  getOrCreateUser,
  checkGenerationLimit,
  insertPendingGeneration,
} from "../../src/services/database.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth
  const { userId: clerkId, error: authError } = await verifyClerkSession(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }

  try {
    // Ensure user row exists (lazy creation on first call)
    const user = await getOrCreateUser(
      clerkId,
      req.headers["x-user-email"] || "",
    );

    // Check quota
    const { allowed, remaining, limit } = await checkGenerationLimit(user.id);

    if (!allowed) {
      return res.status(429).json({
        error: "Monthly generation limit reached. Please upgrade your plan.",
        upgradeUrl: "/pricing",
        limit,
        remaining: 0,
      });
    }

    // Reserve slot
    const generationId = await insertPendingGeneration(user.id);

    return res.status(200).json({
      generationId,
      remaining: remaining === Infinity ? null : remaining - 1,
    });
  } catch (err) {
    console.error("[generations/start] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
