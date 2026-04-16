/**
 * Subscription plans — server-side source of truth.
 *
 * Used by Stripe webhook (map priceId → plan) and generation-limit enforcement.
 * Server uses STRIPE_PRICE_* (no REACT_APP_ prefix) so these values are not
 * bundled into the client.
 *
 * Keep the `limit` values in sync with src/config/plans.js.
 */

export const PLAN_IDS = Object.freeze({
  FREE: "free",
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise",
});

// Use a sentinel value instead of Infinity — JSON can't serialize Infinity, and
// comparisons with `generations_this_month >= limit` stay correct.
export const UNLIMITED_LIMIT = 1_000_000;

export const PLANS = {
  [PLAN_IDS.FREE]: {
    id: PLAN_IDS.FREE,
    limit: 2,
    priceIdEnv: null,
  },
  [PLAN_IDS.STARTER]: {
    id: PLAN_IDS.STARTER,
    limit: 5,
    priceIdEnv: "STRIPE_PRICE_STARTER",
  },
  [PLAN_IDS.PROFESSIONAL]: {
    id: PLAN_IDS.PROFESSIONAL,
    limit: 20,
    priceIdEnv: "STRIPE_PRICE_PROFESSIONAL",
  },
  [PLAN_IDS.ENTERPRISE]: {
    id: PLAN_IDS.ENTERPRISE,
    limit: UNLIMITED_LIMIT,
    priceIdEnv: "STRIPE_PRICE_ENTERPRISE",
  },
};

/**
 * Look up a plan by its Stripe priceId. Returns null for unknown priceIds so
 * the webhook can log and skip rather than silently downgrading a user.
 */
export function planFromPriceId(priceId) {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (!plan.priceIdEnv) continue;
    if (process.env[plan.priceIdEnv] === priceId) return plan;
  }
  return null;
}

export function getPlan(planId) {
  return PLANS[planId] || PLANS[PLAN_IDS.FREE];
}
