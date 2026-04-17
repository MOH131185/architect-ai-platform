/**
 * POST /api/stripe/create-checkout
 *
 * Clerk-authenticated. Creates a Stripe Checkout session for subscription upgrade.
 * Accepts { priceId }. Returns { url } (the Stripe hosted checkout URL).
 */

import Stripe from "stripe";
import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { verifyClerkSession } from "../_shared/clerkAuth.js";
import {
  getOrCreateUser,
  updateUserStripe,
} from "../../src/services/database.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const BASE_URL =
  process.env.REACT_APP_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId: clerkId, error: authError } = await verifyClerkSession(req);
  if (authError) return res.status(401).json({ error: authError });

  const { priceId } = req.body || {};
  if (!priceId) return res.status(400).json({ error: "priceId is required" });

  try {
    const user = await getOrCreateUser(
      clerkId,
      req.headers["x-user-email"] || "",
    );

    // Resolve or create Stripe customer
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { clerk_id: clerkId },
        email: user.email || undefined,
      });
      customerId = customer.id;
      await updateUserStripe(clerkId, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/?checkout=success`,
      cancel_url: `${BASE_URL}/pricing?checkout=cancelled`,
      client_reference_id: clerkId,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[stripe/create-checkout] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
