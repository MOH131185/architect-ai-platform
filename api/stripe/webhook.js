/**
 * Stripe Webhook Handler
 *
 * POST /api/stripe/webhook
 *
 * Handles:
 *   checkout.session.completed → upgrade user plan
 *   customer.subscription.deleted → downgrade to free
 *
 * Requires raw body for signature verification.
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Map Stripe Price IDs to plan names and generation limits.
 */
const PRICE_TO_PLAN = {};

function buildPriceMap() {
  if (process.env.STRIPE_PRICE_STARTER) {
    PRICE_TO_PLAN[process.env.STRIPE_PRICE_STARTER] = {
      plan: "starter",
      limit: 5,
    };
  }
  if (process.env.STRIPE_PRICE_PROFESSIONAL) {
    PRICE_TO_PLAN[process.env.STRIPE_PRICE_PROFESSIONAL] = {
      plan: "professional",
      limit: 20,
    };
  }
  if (process.env.STRIPE_PRICE_ENTERPRISE) {
    PRICE_TO_PLAN[process.env.STRIPE_PRICE_ENTERPRISE] = {
      plan: "enterprise",
      limit: 999999,
    };
  }
}

/**
 * Vercel config: disable body parsing so we can verify the raw signature.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Read the raw body from the request stream.
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[Stripe Webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET",
    );
    return res.status(500).json({ error: "Webhook not configured" });
  }

  buildPriceMap();

  const rawBody = await readRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error(
      "[Stripe Webhook] Signature verification failed:",
      err.message,
    );
    return res.status(400).json({ error: "Invalid signature" });
  }

  const db = getSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        if (!userId) {
          console.warn("[Stripe Webhook] No userId in session metadata");
          break;
        }

        // Retrieve subscription to get the price ID
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const planInfo = PRICE_TO_PLAN[priceId] || {
          plan: "starter",
          limit: 5,
        };

        const { error } = await db
          .from("users")
          .update({
            plan: planInfo.plan,
            generation_limit: planInfo.limit,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("[Stripe Webhook] User update failed:", error.message);
        } else {
          console.log(
            `[Stripe Webhook] User ${userId} upgraded to ${planInfo.plan}`,
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by Stripe customer ID and downgrade
        const { error } = await db
          .from("users")
          .update({
            plan: "free",
            generation_limit: 2,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("[Stripe Webhook] Downgrade failed:", error.message);
        } else {
          console.log(
            `[Stripe Webhook] Customer ${customerId} downgraded to free`,
          );
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge it
        break;
    }
  } catch (err) {
    console.error("[Stripe Webhook] Handler error:", err.message);
    return res.status(500).json({ error: "Webhook handler failed" });
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true });
}
