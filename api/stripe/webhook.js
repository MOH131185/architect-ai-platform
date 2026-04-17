/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler. Raw body is required for signature verification.
 * Vercel: set `export const config = { api: { bodyParser: false } }`.
 *
 * Handles:
 *   checkout.session.completed  → set plan + limit + subscription ID
 *   customer.subscription.updated → update plan/limit if price changed
 *   customer.subscription.deleted → reset to free plan
 */

import Stripe from "stripe";
import { setCorsHeaders } from "../_shared/cors.js";
import { getPlanByPriceId } from "../_shared/plans.js";
import { updateUserStripe } from "../../src/services/database.js";

// Required for Stripe signature verification — disable Next.js/Vercel body parsing
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/** Read the raw request body as a Buffer. */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error(
      "[stripe/webhook] Signature verification failed:",
      err.message,
    );
    return res
      .status(400)
      .json({ error: `Webhook signature invalid: ${err.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const clerkId = session.client_reference_id;
        if (!clerkId) break;

        // Retrieve subscription to get price ID
        let plan = "starter";
        let limit = 5;
        let subscriptionId = session.subscription;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items?.data?.[0]?.price?.id;
          if (priceId) {
            const resolved = getPlanByPriceId(priceId);
            plan = resolved.plan;
            limit = resolved.limit === Infinity ? null : resolved.limit;
          }
        }

        await updateUserStripe(clerkId, {
          plan,
          generationLimit: limit ?? 999999,
          stripeSubscriptionId: subscriptionId || undefined,
        });
        console.log(
          `[webhook] checkout.session.completed: clerkId=${clerkId} plan=${plan}`,
        );
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const priceId = sub.items?.data?.[0]?.price?.id;
        if (!priceId) break;

        const { plan, limit } = getPlanByPriceId(priceId);

        // Look up clerkId via customer metadata
        const customer = await stripe.customers.retrieve(sub.customer);
        const clerkId = customer?.metadata?.clerk_id;
        if (!clerkId) break;

        await updateUserStripe(clerkId, {
          plan,
          generationLimit: limit === Infinity ? 999999 : limit,
          stripeSubscriptionId: sub.id,
        });
        console.log(
          `[webhook] subscription.updated: clerkId=${clerkId} plan=${plan}`,
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const clerkId = customer?.metadata?.clerk_id;
        if (!clerkId) break;

        await updateUserStripe(clerkId, {
          plan: "free",
          generationLimit: 2,
          stripeSubscriptionId: null,
        });
        console.log(
          `[webhook] subscription.deleted: clerkId=${clerkId} → free`,
        );
        break;
      }

      default:
        // Unhandled event types — acknowledge and ignore
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] Handler error:", err.message);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
