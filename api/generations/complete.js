/**
 * POST /api/generations/complete
 *
 * Clerk-authenticated. Accepts { generationId, success, a1SheetUrl?, dxfUrl?, costUsd? }.
 *
 * On success: increments the user's monthly counter and records URLs on the row.
 * On failure: deletes the pending row so it doesn't count against quota.
 */

import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { verifyClerkSession } from "../_shared/clerkAuth.js";
import {
  getOrCreateUser,
  finalizeGeneration,
  incrementGenerationCount,
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

  const { generationId, success, a1SheetUrl, dxfUrl, costUsd } = req.body || {};

  if (!generationId) {
    return res.status(400).json({ error: "generationId is required" });
  }

  try {
    const user = await getOrCreateUser(clerkId, "");

    await finalizeGeneration(generationId, {
      success: !!success,
      a1SheetUrl,
      dxfUrl,
      costUsd,
    });

    if (success) {
      await incrementGenerationCount(user.id);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[generations/complete] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
