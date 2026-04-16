/**
 * Subscription plans — client-side mirror.
 *
 * Used by the pricing UI and usage chips. The price IDs here come from
 * REACT_APP_STRIPE_PRICE_* env vars so they can be passed directly to Stripe
 * Checkout from the client. The server-side source of truth lives in
 * api/_shared/plans.js — keep these in sync.
 */

export const PLAN_IDS = Object.freeze({
  FREE: "free",
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise",
});

export const PLANS = {
  [PLAN_IDS.FREE]: {
    id: PLAN_IDS.FREE,
    name: "Free",
    priceUsd: 0,
    limit: 2,
    priceId: null,
    features: [
      "2 A1 sheets per month",
      "Full DNA-enhanced pipeline",
      "Basic export (PNG)",
    ],
  },
  [PLAN_IDS.STARTER]: {
    id: PLAN_IDS.STARTER,
    name: "Starter",
    priceUsd: 29,
    limit: 5,
    priceId: process.env.REACT_APP_STRIPE_PRICE_STARTER || null,
    features: [
      "5 A1 sheets per month",
      "Full DNA-enhanced pipeline",
      "PNG + PDF export",
      "Email support",
    ],
  },
  [PLAN_IDS.PROFESSIONAL]: {
    id: PLAN_IDS.PROFESSIONAL,
    name: "Professional",
    priceUsd: 79,
    limit: 20,
    priceId: process.env.REACT_APP_STRIPE_PRICE_PROFESSIONAL || null,
    features: [
      "20 A1 sheets per month",
      "Full DNA-enhanced pipeline",
      "PNG + PDF + DXF export",
      "Priority support",
      "Geometry-first pipeline (beta)",
    ],
  },
  [PLAN_IDS.ENTERPRISE]: {
    id: PLAN_IDS.ENTERPRISE,
    name: "Enterprise",
    priceUsd: 199,
    limit: Infinity,
    priceId: process.env.REACT_APP_STRIPE_PRICE_ENTERPRISE || null,
    features: [
      "Unlimited A1 sheets",
      "Everything in Professional",
      "Custom branding",
      "Dedicated support",
    ],
  },
};

export const PLAN_ORDER = [
  PLAN_IDS.FREE,
  PLAN_IDS.STARTER,
  PLAN_IDS.PROFESSIONAL,
  PLAN_IDS.ENTERPRISE,
];

export function getPlan(planId) {
  return PLANS[planId] || PLANS[PLAN_IDS.FREE];
}

export function formatLimit(limit) {
  return Number.isFinite(limit) ? String(limit) : "Unlimited";
}
