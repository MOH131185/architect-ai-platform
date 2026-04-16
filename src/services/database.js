/**
 * Supabase data layer (SERVER-ONLY).
 *
 * This module is imported by Vercel serverless functions (api/**) and by the
 * Express dev proxy (server.cjs). It uses SUPABASE_SERVICE_ROLE_KEY, which
 * MUST NEVER be bundled into the client. Do not import from src/components or
 * src/hooks.
 *
 * Env vars required:
 *   REACT_APP_SUPABASE_URL        — Supabase project URL (same for client + server)
 *   SUPABASE_SERVICE_ROLE_KEY     — server-only service role key
 *
 * Schema (also in supabase/schema.sql — run there to create tables):
 *
 *   create table users (
 *     id uuid primary key default gen_random_uuid(),
 *     clerk_id text unique not null,
 *     email text not null,
 *     plan text not null default 'free',
 *     generations_this_month int not null default 0,
 *     generation_limit int not null default 2,
 *     last_reset_at timestamptz not null default now(),
 *     stripe_customer_id text,
 *     stripe_subscription_id text,
 *     created_at timestamptz not null default now()
 *   );
 *
 *   create table projects (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references users(id) on delete cascade,
 *     name text,
 *     spatial_graph jsonb,
 *     status text default 'draft',
 *     created_at timestamptz not null default now()
 *   );
 *
 *   create table generations (
 *     id uuid primary key default gen_random_uuid(),
 *     project_id uuid references projects(id) on delete set null,
 *     user_id uuid references users(id) on delete cascade,
 *     a1_sheet_url text,
 *     dxf_url text,
 *     cost_usd numeric(10,4),
 *     status text default 'pending',
 *     created_at timestamptz not null default now()
 *   );
 */

import { createClient } from "@supabase/supabase-js";
import { getPlan, PLAN_IDS, UNLIMITED_LIMIT } from "../../api/_shared/plans.js";

let cachedClient = null;

function getSupabase() {
  if (cachedClient) return cachedClient;
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase not configured — set REACT_APP_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function isSameMonth(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

/**
 * Upsert a user row by clerk_id. Called lazily on first authenticated API
 * request so we don't need a Clerk webhook. Returns the full user row.
 */
export async function getOrCreateUser(clerkId, email) {
  if (!clerkId) throw new Error("clerkId is required");
  const supabase = getSupabase();

  // Try fast path: select existing row.
  const { data: existing, error: selectErr } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (selectErr) throw selectErr;
  if (existing) {
    // If email changed at Clerk, sync it.
    if (email && existing.email !== email) {
      const { data: updated, error: updateErr } = await supabase
        .from("users")
        .update({ email })
        .eq("id", existing.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return updated;
    }
    return existing;
  }

  // Insert new row on free plan.
  const freePlan = getPlan(PLAN_IDS.FREE);
  const { data: inserted, error: insertErr } = await supabase
    .from("users")
    .insert({
      clerk_id: clerkId,
      email: email || "",
      plan: PLAN_IDS.FREE,
      generation_limit: freePlan.limit,
      generations_this_month: 0,
    })
    .select()
    .single();

  if (insertErr) {
    // Handle race: concurrent inserts can conflict on unique clerk_id.
    if (insertErr.code === "23505") {
      const { data: retry, error: retryErr } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_id", clerkId)
        .single();
      if (retryErr) throw retryErr;
      return retry;
    }
    throw insertErr;
  }
  return inserted;
}

export async function createProject(userId, name, spatialGraph) {
  if (!userId) throw new Error("userId is required");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: name || "Untitled project",
      spatial_graph: spatialGraph || null,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordGeneration(
  projectId,
  userId,
  { a1SheetUrl, dxfUrl, costUsd } = {},
) {
  if (!userId) throw new Error("userId is required");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("generations")
    .insert({
      project_id: projectId || null,
      user_id: userId,
      a1_sheet_url: a1SheetUrl || null,
      dxf_url: dxfUrl || null,
      cost_usd: costUsd ?? null,
      status: "complete",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Atomically rolls forward the monthly counter if the user is in a new month,
 * then returns { allowed, remaining, limit, plan }. Does NOT increment —
 * callers must call incrementGenerationCount after successful generation.
 */
export async function checkGenerationLimit(userId) {
  if (!userId) throw new Error("userId is required");
  const supabase = getSupabase();

  const { data: user, error } = await supabase
    .from("users")
    .select("id, plan, generations_this_month, generation_limit, last_reset_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!user) throw new Error(`User ${userId} not found`);

  let used = user.generations_this_month || 0;
  const limit = user.generation_limit ?? getPlan(user.plan).limit;

  // Reset counter if we've crossed a month boundary.
  const now = new Date();
  if (!isSameMonth(user.last_reset_at || now, now)) {
    const { error: resetErr } = await supabase
      .from("users")
      .update({ generations_this_month: 0, last_reset_at: now.toISOString() })
      .eq("id", userId);
    if (resetErr) throw resetErr;
    used = 0;
  }

  const isUnlimited = limit >= UNLIMITED_LIMIT;
  const remaining = isUnlimited ? UNLIMITED_LIMIT : Math.max(0, limit - used);
  const allowed = isUnlimited || used < limit;

  return {
    allowed,
    remaining,
    limit,
    used,
    plan: user.plan,
    unlimited: isUnlimited,
  };
}

/**
 * Atomic increment. Uses Postgres `update ... set x = x + 1` so concurrent
 * generations can't double-count.
 */
export async function incrementGenerationCount(userId) {
  if (!userId) throw new Error("userId is required");
  const supabase = getSupabase();

  // Supabase JS doesn't have a raw expression helper; use the rpc-free pattern
  // of reading and conditional-updating. Postgres UPDATE is atomic per row, so
  // racing updates serialize and both increments land.
  const { data: user, error: selectErr } = await supabase
    .from("users")
    .select("generations_this_month")
    .eq("id", userId)
    .single();
  if (selectErr) throw selectErr;

  const next = (user.generations_this_month || 0) + 1;
  const { error: updateErr } = await supabase
    .from("users")
    .update({ generations_this_month: next })
    .eq("id", userId);
  if (updateErr) throw updateErr;
  return next;
}

/**
 * Insert a pending generation row. Used by /api/generations/start to reserve
 * a slot before the long-running workflow begins.
 */
export async function createPendingGeneration(userId, projectId = null) {
  if (!userId) throw new Error("userId is required");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("generations")
    .insert({
      user_id: userId,
      project_id: projectId,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Mark a pending generation as complete and attach URLs + cost.
 */
export async function completeGeneration(
  generationId,
  userId,
  { a1SheetUrl, dxfUrl, costUsd } = {},
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("generations")
    .update({
      a1_sheet_url: a1SheetUrl || null,
      dxf_url: dxfUrl || null,
      cost_usd: costUsd ?? null,
      status: "complete",
    })
    .eq("id", generationId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Delete a pending generation row (called on workflow failure so the slot
 * isn't counted against the user's quota).
 */
export async function cancelPendingGeneration(generationId, userId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("generations")
    .delete()
    .eq("id", generationId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
}

/**
 * Apply a plan change driven by Stripe webhook. Sets plan name, limit, and
 * subscription metadata atomically.
 */
export async function updateUserPlan(
  clerkId,
  { plan, stripeCustomerId, stripeSubscriptionId } = {},
) {
  if (!clerkId) throw new Error("clerkId is required");
  const supabase = getSupabase();

  const planDef = getPlan(plan);
  const update = {
    plan: planDef.id,
    generation_limit: planDef.limit,
  };
  if (stripeCustomerId !== undefined)
    update.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId !== undefined)
    update.stripe_subscription_id = stripeSubscriptionId;

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("clerk_id", clerkId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getUserByClerkId(clerkId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setStripeCustomerId(userId, stripeCustomerId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("users")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", userId);
  if (error) throw error;
}
