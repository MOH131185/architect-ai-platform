/**
 * Plan configuration — server-side (no REACT_APP_ prefix).
 * Used by Stripe webhook to map priceId → plan key + generation limit.
 * Client mirror: src/config/plans.js
 */

export const PLANS = {
  free: { limit: 2, priceId: null, price: 0 },
  starter: {
    limit: 5,
    priceId: process.env.STRIPE_PRICE_STARTER,
    price: 29,
  },
  professional: {
    limit: 20,
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL,
    price: 79,
  },
  enterprise: {
    limit: Infinity,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE,
    price: 199,
  },
};

/**
 * Look up the plan key + limit for a Stripe price ID.
 * Returns { plan: 'free', limit: 2 } if not found.
 */
export function getPlanByPriceId(priceId) {
  for (const [key, config] of Object.entries(PLANS)) {
    if (config.priceId && config.priceId === priceId) {
      return { plan: key, limit: config.limit };
    }
  }
  return { plan: "free", limit: 2 };
}
