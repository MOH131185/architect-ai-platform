/**
 * Supabase data layer — SERVER-ONLY. Never import into client-side code.
 *
 * Schema (run supabase/schema.sql to create tables):
 *
 * create table users (
 *   id uuid primary key default gen_random_uuid(),
 *   clerk_id text unique not null,
 *   email text not null,
 *   plan text not null default 'free',
 *   generations_this_month int not null default 0,
 *   generation_limit int not null default 2,
 *   last_reset_at timestamptz not null default now(),
 *   stripe_customer_id text,
 *   stripe_subscription_id text,
 *   created_at timestamptz not null default now()
 * );
 *
 * create table projects (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references users(id) on delete cascade,
 *   name text,
 *   spatial_graph jsonb,
 *   status text default 'draft',
 *   created_at timestamptz not null default now()
 * );
 *
 * create table generations (
 *   id uuid primary key default gen_random_uuid(),
 *   project_id uuid references projects(id) on delete set null,
 *   user_id uuid references users(id) on delete cascade,
 *   a1_sheet_url text,
 *   dxf_url text,
 *   cost_usd numeric(10,4),
 *   status text default 'pending',
 *   created_at timestamptz not null default now()
 * );
 */

import { createClient } from "@supabase/supabase-js";

let _client = null;

function getClient() {
  if (!_client) {
    const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase env vars missing: REACT_APP_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

/**
 * Upsert a user row keyed by Clerk ID.
 * Creates the row on first sign-in, returns existing row on subsequent calls.
 */
export async function getOrCreateUser(clerkId, email) {
  const db = getClient();
  const { data, error } = await db
    .from("users")
    .upsert({ clerk_id: clerkId, email }, { onConflict: "clerk_id" })
    .select()
    .single();
  if (error) throw new Error(`getOrCreateUser failed: ${error.message}`);
  return data;
}

/**
 * Create a project row.
 */
export async function createProject(userId, name, spatialGraph) {
  const db = getClient();
  const { data, error } = await db
    .from("projects")
    .insert({ user_id: userId, name, spatial_graph: spatialGraph })
    .select()
    .single();
  if (error) throw new Error(`createProject failed: ${error.message}`);
  return data;
}

/**
 * Record a generation attempt.
 */
export async function recordGeneration(
  projectId,
  userId,
  { a1SheetUrl, dxfUrl, costUsd } = {},
) {
  const db = getClient();
  const { data, error } = await db
    .from("generations")
    .insert({
      project_id: projectId || null,
      user_id: userId,
      a1_sheet_url: a1SheetUrl || null,
      dxf_url: dxfUrl || null,
      cost_usd: costUsd || null,
      status: "complete",
    })
    .select()
    .single();
  if (error) throw new Error(`recordGeneration failed: ${error.message}`);
  return data;
}

/**
 * Check whether a user may start a new generation.
 * Resets the monthly counter if we've crossed a calendar-month boundary.
 * Returns { allowed, remaining, limit }.
 */
export async function checkGenerationLimit(userId) {
  const db = getClient();
  const { data: user, error } = await db
    .from("users")
    .select("generations_this_month, generation_limit, last_reset_at, plan")
    .eq("id", userId)
    .single();

  if (error) throw new Error(`checkGenerationLimit failed: ${error.message}`);

  // Reset counter if we've moved into a new calendar month
  const now = new Date();
  const lastReset = new Date(user.last_reset_at);
  const crossedMonthBoundary =
    now.getFullYear() !== lastReset.getFullYear() ||
    now.getMonth() !== lastReset.getMonth();

  if (crossedMonthBoundary) {
    await db
      .from("users")
      .update({ generations_this_month: 0, last_reset_at: now.toISOString() })
      .eq("id", userId);
    return {
      allowed: true,
      remaining: user.generation_limit,
      limit: user.generation_limit,
    };
  }

  const limit = user.generation_limit;
  const used = user.generations_this_month;
  const allowed = limit === null || used < limit; // null = unlimited (enterprise)
  const remaining = limit === null ? Infinity : Math.max(0, limit - used);

  return { allowed, remaining, limit };
}

/**
 * Atomically increment the monthly generation counter.
 */
export async function incrementGenerationCount(userId) {
  const db = getClient();
  const { error } = await db.rpc("increment_generation_count", {
    user_id_param: userId,
  });

  // Fallback if the RPC doesn't exist yet — simple read-modify-write
  if (error) {
    const { data: user } = await db
      .from("users")
      .select("generations_this_month")
      .eq("id", userId)
      .single();
    await db
      .from("users")
      .update({
        generations_this_month: (user?.generations_this_month || 0) + 1,
      })
      .eq("id", userId);
  }
}

/**
 * Insert a pending generation row and return its ID.
 */
export async function insertPendingGeneration(userId) {
  const db = getClient();
  const { data, error } = await db
    .from("generations")
    .insert({ user_id: userId, status: "pending" })
    .select("id")
    .single();
  if (error)
    throw new Error(`insertPendingGeneration failed: ${error.message}`);
  return data.id;
}

/**
 * Mark a pending generation as complete (or delete it on failure).
 */
export async function finalizeGeneration(
  generationId,
  { success, a1SheetUrl, dxfUrl, costUsd } = {},
) {
  const db = getClient();
  if (!success) {
    // Don't count failed generations against quota — delete the pending row
    await db.from("generations").delete().eq("id", generationId);
    return;
  }
  const { error } = await db
    .from("generations")
    .update({
      status: "complete",
      a1_sheet_url: a1SheetUrl || null,
      dxf_url: dxfUrl || null,
      cost_usd: costUsd || null,
    })
    .eq("id", generationId);
  if (error) throw new Error(`finalizeGeneration failed: ${error.message}`);
}

/**
 * Fetch a lightweight user summary (plan, usage, limit) by Clerk ID.
 */
export async function getUserSummaryByClerkId(clerkId) {
  const db = getClient();
  const { data, error } = await db
    .from("users")
    .select("id, plan, generations_this_month, generation_limit, last_reset_at")
    .eq("clerk_id", clerkId)
    .single();
  if (error) return null;
  return data;
}

/**
 * Update Stripe fields on a user row.
 */
export async function updateUserStripe(
  clerkId,
  { plan, generationLimit, stripeCustomerId, stripeSubscriptionId } = {},
) {
  const db = getClient();
  const updates = {};
  if (plan !== undefined) updates.plan = plan;
  if (generationLimit !== undefined) updates.generation_limit = generationLimit;
  if (stripeCustomerId !== undefined)
    updates.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId !== undefined)
    updates.stripe_subscription_id = stripeSubscriptionId;

  const { error } = await db
    .from("users")
    .update(updates)
    .eq("clerk_id", clerkId);
  if (error) throw new Error(`updateUserStripe failed: ${error.message}`);
}
