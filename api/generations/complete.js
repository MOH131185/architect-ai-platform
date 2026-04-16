/**
 * POST /api/generations/complete
 *
 * Finalizes a generation reserved by /api/generations/start. On success,
 * increments the user's monthly counter and saves URLs. On failure, deletes
 * the pending row so the slot isn't counted.
 *
 * Body: { generationId, success, a1SheetUrl?, dxfUrl?, costUsd? }
 */

import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { requireClerkSession } from "../_shared/clerkAuth.js";
import {
  getOrCreateUser,
  completeGeneration,
  cancelPendingGeneration,
  incrementGenerationCount,
  checkGenerationLimit,
} from "../../src/services/database.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const session = await requireClerkSession(req, res);
  if (!session) return;

  const body = req.body || {};
  const { generationId, success } = body;

  if (!generationId) {
    return res
      .status(400)
      .json({
        error: { code: "INVALID_INPUT", message: "generationId required" },
      });
  }

  try {
    const user = await getOrCreateUser(session.clerkId, session.email);

    if (success) {
      await completeGeneration(generationId, user.id, {
        a1SheetUrl: body.a1SheetUrl,
        dxfUrl: body.dxfUrl,
        costUsd: body.costUsd,
      });
      await incrementGenerationCount(user.id);
    } else {
      await cancelPendingGeneration(generationId, user.id);
    }

    // Return the freshly updated usage so the client can refresh its chip.
    const limit = await checkGenerationLimit(user.id);
    return res.status(200).json({
      ok: true,
      plan: limit.plan,
      limit: limit.unlimited ? null : limit.limit,
      remaining: limit.unlimited ? null : limit.remaining,
      unlimited: limit.unlimited,
    });
  } catch (err) {
    console.error("[api/generations/complete] error:", err);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}
