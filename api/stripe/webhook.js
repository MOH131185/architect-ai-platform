/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook receiver. Verifies the signature against the raw request body
 * and applies plan changes to the user record.
 *
 * Events handled:
 *   checkout.session.completed        → set plan from subscription priceId
 *   customer.subscription.updated     → sync plan if priceId changed
 *   customer.subscription.deleted     → downgrade to free
 *
 * Vercel: bodyParser is disabled so we can read the raw bytes. In dev, the
 * Express proxy mounts this with express.raw({ type: 'application/json' }).
 */

import Stripe from "stripe";
import { planFromPriceId, PLAN_IDS } from "../_shared/plans.js";
import { updateUserPlan } from "../../src/services/database.js";

// Vercel: disable automatic JSON parsing so we can verify the raw signature.
export const config = {
  api: {
    bodyParser: false,
  },
};

let cachedStripe = null;
function getStripe() {
  if (cachedStripe) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  cachedStripe = new Stripe(key, { apiVersion: "2024-06-20" });
  return cachedStripe;
}

/**
 * Read the request body as a raw Buffer. Works for both Vercel (where
 * bodyParser is disabled) and the Express dev proxy (where we mount this with
 * express.raw and req.body is already a Buffer).
 */
async function readRawBody(req) {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");

  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  const clerkId = session.client_reference_id;
  if (!clerkId) {
    console.warn(
      "[stripe webhook] checkout.session.completed missing client_reference_id",
    );
    return;
  }

  // Fetch the subscription to discover the priceId → plan mapping.
  const subscriptionId = session.subscription;
  if (!subscriptionId) {
    console.warn(
      "[stripe webhook] checkout.session.completed missing subscription",
    );
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = planFromPriceId(priceId);
  if (!plan) {
    console.warn(
      `[stripe webhook] Unknown priceId ${priceId} — leaving user plan unchanged`,
    );
    return;
  }

  await updateUserPlan(clerkId, {
    plan: plan.id,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
  });
  console.log(
    `[stripe webhook] Upgraded clerkId=${clerkId} to plan=${plan.id}`,
  );
}

async function handleSubscriptionUpdated(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  const clerkId = customer?.metadata?.clerk_id;
  if (!clerkId) {
    console.warn(
      "[stripe webhook] subscription.updated customer missing clerk_id metadata",
    );
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = planFromPriceId(priceId);

  if (!plan) {
    console.warn(
      `[stripe webhook] subscription.updated with unknown priceId ${priceId}`,
    );
    return;
  }

  // If the subscription is cancelled/unpaid, downgrade. Active/trialing gets
  // the plan from the priceId.
  const activeStatuses = new Set(["active", "trialing", "past_due"]);
  const nextPlan = activeStatuses.has(subscription.status)
    ? plan.id
    : PLAN_IDS.FREE;

  await updateUserPlan(clerkId, {
    plan: nextPlan,
    stripeSubscriptionId: subscription.id,
  });
  console.log(
    `[stripe webhook] subscription.updated clerkId=${clerkId} status=${subscription.status} plan=${nextPlan}`,
  );
}

async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  const clerkId = customer?.metadata?.clerk_id;
  if (!clerkId) return;

  await updateUserPlan(clerkId, {
    plan: PLAN_IDS.FREE,
    stripeSubscriptionId: null,
  });
  console.log(
    `[stripe webhook] subscription.deleted clerkId=${clerkId} → free`,
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error("[stripe webhook] Failed to read raw body:", err);
    return res.status(400).json({ error: "Could not read request body" });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error(
      "[stripe webhook] Signature verification failed:",
      err.message,
    );
    return res
      .status(400)
      .json({ error: `Webhook signature error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      default:
        // Log-only for events we don't act on, so the Stripe dashboard shows 200.
        console.log(`[stripe webhook] ignoring event type: ${event.type}`);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[stripe webhook] Handler for ${event.type} failed:`, err);
    // Return 500 so Stripe retries (idempotent handlers handle duplicate delivery).
    return res.status(500).json({ error: err.message });
  }
}
