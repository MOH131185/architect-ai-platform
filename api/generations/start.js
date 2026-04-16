/**
 * POST /api/generations/start
 *
 * Reserves a generation slot before the long-running DNA+FLUX workflow runs.
 * Returns { generationId, remaining } on success, or 429 with upgrade URL
 * when the user is over their monthly quota.
 *
 * Quota accounting is done in pairs: /start reserves, /complete finalizes
 * (increment + URLs) or cancels (delete pending row). This way a mid-run
 * failure doesn't count against the user.
 */

import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { requireClerkSession } from "../_shared/clerkAuth.js";
import {
  getOrCreateUser,
  checkGenerationLimit,
  createPendingGeneration,
} from "../../src/services/database.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const session = await requireClerkSession(req, res);
  if (!session) return;

  try {
    const user = await getOrCreateUser(session.clerkId, session.email);
    const limit = await checkGenerationLimit(user.id);

    if (!limit.allowed) {
      return res.status(429).json({
        error: {
          code: "GENERATION_LIMIT_REACHED",
          message: `You've used all ${limit.limit} generations for this month on the ${limit.plan} plan.`,
        },
        plan: limit.plan,
        limit: limit.limit,
        remaining: 0,
        upgradeUrl: "/pricing",
      });
    }

    const projectId = req.body?.projectId || null;
    const pending = await createPendingGeneration(user.id, projectId);

    // remaining reflects the slot we just reserved.
    const remaining = limit.unlimited ? null : Math.max(0, limit.remaining - 1);

    return res.status(200).json({
      generationId: pending.id,
      remaining,
      plan: limit.plan,
      limit: limit.unlimited ? null : limit.limit,
      unlimited: limit.unlimited,
    });
  } catch (err) {
    console.error("[api/generations/start] error:", err);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}
