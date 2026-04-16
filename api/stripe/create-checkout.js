/**
 * POST /api/stripe/create-checkout
 *
 * Creates a Stripe Checkout Session for a subscription. Returns { url } for
 * the client to redirect to.
 *
 * Body: { priceId }
 */

import Stripe from "stripe";
import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { requireClerkSession } from "../_shared/clerkAuth.js";
import {
  getOrCreateUser,
  setStripeCustomerId,
} from "../../src/services/database.js";

let cachedStripe = null;
function getStripe() {
  if (cachedStripe) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  cachedStripe = new Stripe(key, { apiVersion: "2024-06-20" });
  return cachedStripe;
}

function resolveBaseUrl(req) {
  const fromEnv = process.env.REACT_APP_BASE_URL || process.env.BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin = req.headers?.origin;
  if (origin) return origin.replace(/\/$/, "");
  const host = req.headers?.host;
  if (host) {
    const proto = req.headers?.["x-forwarded-proto"] || "https";
    return `${proto}://${host}`;
  }
  return "https://www.archiaisolution.pro";
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const session = await requireClerkSession(req, res);
  if (!session) return;

  const { priceId } = req.body || {};
  if (!priceId) {
    return res
      .status(400)
      .json({ error: { code: "INVALID_INPUT", message: "priceId required" } });
  }

  try {
    const user = await getOrCreateUser(session.clerkId, session.email);
    const stripe = getStripe();

    // Resolve or create a Stripe customer tied to this Clerk user.
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { clerk_id: user.clerk_id, user_id: user.id },
      });
      customerId = customer.id;
      await setStripeCustomerId(user.id, customerId);
    }

    const baseUrl = resolveBaseUrl(req);
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.clerk_id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[api/stripe/create-checkout] error:", err);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}
