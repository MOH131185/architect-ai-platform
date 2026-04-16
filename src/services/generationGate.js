/**
 * Client-side wrapper for /api/generations/start and /api/generations/complete.
 *
 * Wraps the long-running DNA+FLUX workflow so that we:
 *   1. Reserve a quota slot before any paid API call (start)
 *   2. Finalize the slot after the workflow returns (complete)
 *
 * All requests attach the Clerk session token via the getToken() callback
 * passed in from the component that owns the Clerk hook (useAuth). We can't
 * import useAuth here because this module is used from inside another hook —
 * callers pass the getter explicitly.
 */

const BASE = "";

class GenerationLimitError extends Error {
  constructor(payload) {
    super(payload?.error?.message || "Generation limit reached");
    this.name = "GenerationLimitError";
    this.code = "GENERATION_LIMIT_REACHED";
    this.plan = payload?.plan || null;
    this.limit = payload?.limit ?? null;
    this.remaining = payload?.remaining ?? 0;
    this.upgradeUrl = payload?.upgradeUrl || "/pricing";
  }
}

async function postJson(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = { error: { message: `HTTP ${res.status}` } };
  }

  if (
    res.status === 429 &&
    payload?.error?.code === "GENERATION_LIMIT_REACHED"
  ) {
    throw new GenerationLimitError(payload);
  }
  if (!res.ok) {
    const err = new Error(payload?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

/**
 * Reserve a generation slot. Resolves with { generationId, remaining, ... } or
 * throws GenerationLimitError (with upgradeUrl).
 *
 * @param {() => Promise<string|null>} getToken - Clerk getToken callback
 * @param {object} [options]
 * @param {string} [options.projectId]
 */
export async function startGeneration(getToken, options = {}) {
  const token = typeof getToken === "function" ? await getToken() : null;
  if (!token) {
    throw new Error("Not signed in. Please sign in before generating.");
  }
  return await postJson(
    "/api/generations/start",
    { projectId: options.projectId || null },
    token,
  );
}

/**
 * Finalize a generation (success or failure). Should be called in a finally
 * block around the workflow. On failure, the reserved slot is released.
 *
 * @param {() => Promise<string|null>} getToken
 * @param {string} generationId
 * @param {object} result
 * @param {boolean} result.success
 * @param {string} [result.a1SheetUrl]
 * @param {string} [result.dxfUrl]
 * @param {number} [result.costUsd]
 */
export async function completeGeneration(getToken, generationId, result) {
  if (!generationId) return null;
  const token = typeof getToken === "function" ? await getToken() : null;
  if (!token) {
    console.warn(
      "[generationGate] completeGeneration called without a token — skipping",
    );
    return null;
  }
  try {
    return await postJson(
      "/api/generations/complete",
      {
        generationId,
        success: !!result?.success,
        a1SheetUrl: result?.a1SheetUrl || null,
        dxfUrl: result?.dxfUrl || null,
        costUsd: result?.costUsd ?? null,
      },
      token,
    );
  } catch (err) {
    // Don't let accounting errors mask the actual workflow result — log and swallow.
    console.error("[generationGate] complete failed:", err);
    return null;
  }
}

export { GenerationLimitError };
