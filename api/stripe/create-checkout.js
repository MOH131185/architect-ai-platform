/**
 * Stripe Checkout Session Creator
 *
 * POST /api/stripe/create-checkout
 * Body: { priceId, userId, email, successUrl?, cancelUrl? }
 * Returns: { url } — Stripe Checkout URL to redirect the user to
 */

import Stripe from "stripe";
import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Plan price IDs — set these in your Stripe Dashboard → Products → Pricing
 * then store the price IDs in env vars.
 */
const VALID_PRICE_IDS = new Set(
  [
    process.env.STRIPE_PRICE_STARTER,
    process.env.STRIPE_PRICE_PROFESSIONAL,
    process.env.STRIPE_PRICE_ENTERPRISE,
  ].filter(Boolean),
);

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe is not configured" });
  }

  const { priceId, userId, email, successUrl, cancelUrl } = req.body || {};

  if (!priceId) {
    return res.status(400).json({ error: "priceId is required" });
  }

  if (VALID_PRICE_IDS.size > 0 && !VALID_PRICE_IDS.has(priceId)) {
    return res.status(400).json({ error: "Invalid priceId" });
  }

  try {
    const sessionParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:
        successUrl ||
        `${req.headers.origin || "https://www.archiaisolution.pro"}/?checkout=success`,
      cancel_url:
        cancelUrl ||
        `${req.headers.origin || "https://www.archiaisolution.pro"}/pricing?checkout=cancelled`,
      metadata: {
        userId: userId || "",
      },
    };

    // Pre-fill customer email if provided
    if (email) {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[Stripe] Checkout creation failed:", err.message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
