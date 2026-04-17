/**
 * Plan configuration — client-safe (REACT_APP_ prefixed price IDs).
 * Mirror exists at api/_shared/plans.js for server-side use.
 */

export const PLANS = {
  free: {
    limit: 2,
    priceId: null,
    price: 0,
    label: "Free",
    description: "Get started with AI architecture",
  },
  starter: {
    limit: 5,
    priceId: process.env.REACT_APP_STRIPE_PRICE_STARTER,
    price: 29,
    label: "Starter",
    description: "For individual architects",
  },
  professional: {
    limit: 20,
    priceId: process.env.REACT_APP_STRIPE_PRICE_PROFESSIONAL,
    price: 79,
    label: "Professional",
    description: "For busy practices",
  },
  enterprise: {
    limit: Infinity,
    priceId: process.env.REACT_APP_STRIPE_PRICE_ENTERPRISE,
    price: 199,
    label: "Enterprise",
    description: "Unlimited for large teams",
  },
};

/** Return the plan object for a given plan key (defaults to 'free'). */
export function getPlan(key) {
  return PLANS[key] ?? PLANS.free;
}
