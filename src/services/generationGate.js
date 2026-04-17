/**
 * Generation gate — client-side wrapper around /api/generations/start and /complete.
 *
 * Call start() before executeWorkflow. If the user has no quota it throws
 * an error with { upgradeUrl } so the UI can redirect to pricing.
 * Call complete() in the try/finally to either credit the usage or release
 * the pending slot on failure.
 *
 * Usage (from useArchitectAIWorkflow):
 *   const { generationId } = await generationGate.start(getToken);
 *   try {
 *     const result = await executeWorkflow(...);
 *     await generationGate.complete(generationId, { success: true, getToken, ...urls });
 *   } catch (err) {
 *     await generationGate.complete(generationId, { success: false, getToken });
 *     throw err;
 *   }
 */

/**
 * @typedef {() => Promise<string|null>} GetToken
 */

/**
 * Start a generation — checks quota and reserves a slot.
 * Throws { message, upgradeUrl, remaining, limit } if limit exceeded.
 *
 * @param {GetToken} getToken - Clerk's useAuth().getToken
 * @returns {Promise<{ generationId: string; remaining: number }>}
 */
export async function start(getToken) {
  const token = await getToken();
  const res = await fetch("/api/generations/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 429) {
    const err = new Error(
      data.error ||
        "Monthly generation limit reached. Please upgrade your plan.",
    );
    err.upgradeUrl = data.upgradeUrl || "/pricing";
    err.remaining = 0;
    err.limit = data.limit;
    err.isQuotaError = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(data.error || "Failed to start generation");
  }

  return {
    generationId: data.generationId,
    remaining: data.remaining,
  };
}

/**
 * Complete (or cancel) a generation.
 * On success: increments quota counter and records URLs.
 * On failure: deletes the pending slot so it doesn't count.
 *
 * @param {string} generationId
 * @param {{ success: boolean; getToken: GetToken; a1SheetUrl?: string; dxfUrl?: string; costUsd?: number }} opts
 */
export async function complete(
  generationId,
  { success, getToken, a1SheetUrl, dxfUrl, costUsd } = {},
) {
  if (!generationId) return; // no-op if we never got a generationId (unauthenticated path)

  try {
    const token = getToken ? await getToken() : null;
    await fetch("/api/generations/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        generationId,
        success,
        a1SheetUrl,
        dxfUrl,
        costUsd,
      }),
    });
  } catch {
    // Best-effort — don't let a network error surface to the user here
  }
}
