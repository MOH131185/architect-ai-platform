/**
 * Supabase Database Service
 *
 * Handles user management, project storage, and generation tracking.
 * All queries go through the Supabase client using the service role key
 * (server-side) or the anon key (client-side reads).
 *
 * ===== REQUIRED SUPABASE TABLES (run in Supabase SQL Editor) =====
 *
 * CREATE TABLE users (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   clerk_id TEXT UNIQUE NOT NULL,
 *   email TEXT,
 *   plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
 *   stripe_customer_id TEXT,
 *   stripe_subscription_id TEXT,
 *   generations_this_month INT DEFAULT 0,
 *   generation_limit INT DEFAULT 2,
 *   billing_cycle_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE TABLE projects (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *   name TEXT NOT NULL,
 *   spatial_graph JSONB,
 *   status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'complete', 'failed')),
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE TABLE generations (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
 *   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *   a1_sheet_url TEXT,
 *   dxf_url TEXT,
 *   cost_usd NUMERIC(8,4) DEFAULT 0,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- Auto-reset monthly generation count
 * CREATE OR REPLACE FUNCTION reset_monthly_generations()
 * RETURNS TRIGGER AS $$
 * BEGIN
 *   IF NEW.billing_cycle_start <> OLD.billing_cycle_start THEN
 *     NEW.generations_this_month := 0;
 *   END IF;
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql;
 *
 * CREATE TRIGGER trg_reset_monthly
 *   BEFORE UPDATE ON users
 *   FOR EACH ROW EXECUTE FUNCTION reset_monthly_generations();
 *
 * -- Row Level Security
 * ALTER TABLE users ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
 *
 * =================================================================
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase = null;

function getClient() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        "Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY",
      );
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

/**
 * Plan → generation limit mapping
 */
export const PLAN_LIMITS = {
  free: 2,
  starter: 5,
  professional: 20,
  enterprise: Infinity,
};

/**
 * Upsert user row keyed by Clerk ID.
 * Called on every sign-in to keep email in sync.
 */
export async function getOrCreateUser(clerkId, email) {
  const db = getClient();

  const { data, error } = await db
    .from("users")
    .upsert(
      { clerk_id: clerkId, email, updated_at: new Date().toISOString() },
      { onConflict: "clerk_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`getOrCreateUser failed: ${error.message}`);

  // Auto-reset if billing cycle rolled over
  const cycleStart = new Date(data.billing_cycle_start);
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  if (cycleStart < monthStart) {
    const { data: updated, error: resetErr } = await db
      .from("users")
      .update({
        generations_this_month: 0,
        billing_cycle_start: monthStart.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (resetErr) throw new Error(`Monthly reset failed: ${resetErr.message}`);
    return updated;
  }

  return data;
}

/**
 * Save a project with its spatial graph.
 */
export async function createProject(userId, name, spatialGraph) {
  const db = getClient();

  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: userId,
      name,
      spatial_graph: spatialGraph || null,
    })
    .select()
    .single();

  if (error) throw new Error(`createProject failed: ${error.message}`);
  return data;
}

/**
 * Record a completed generation for billing/analytics.
 */
export async function recordGeneration(
  projectId,
  userId,
  urls,
  costUsd = 0.15,
) {
  const db = getClient();

  const { data, error } = await db
    .from("generations")
    .insert({
      project_id: projectId,
      user_id: userId,
      a1_sheet_url: urls?.a1SheetUrl || null,
      dxf_url: urls?.dxfUrl || null,
      cost_usd: costUsd,
    })
    .select()
    .single();

  if (error) throw new Error(`recordGeneration failed: ${error.message}`);
  return data;
}

/**
 * Check whether a user can generate (hasn't hit their monthly limit).
 */
export async function checkGenerationLimit(userId) {
  const db = getClient();

  const { data, error } = await db
    .from("users")
    .select("generations_this_month, generation_limit, plan")
    .eq("id", userId)
    .single();

  if (error) throw new Error(`checkGenerationLimit failed: ${error.message}`);

  const limit = data.plan === "enterprise" ? Infinity : data.generation_limit;
  const remaining = Math.max(0, limit - data.generations_this_month);

  return {
    allowed: remaining > 0,
    remaining,
    limit,
    used: data.generations_this_month,
    plan: data.plan,
  };
}

/**
 * Increment the user's monthly generation count by 1.
 */
export async function incrementGenerationCount(userId) {
  const db = getClient();

  const { error } = await db.rpc("increment_generation_count", {
    user_id_param: userId,
  });

  // Fallback: if RPC doesn't exist, do a manual increment
  if (error) {
    const { data: user } = await db
      .from("users")
      .select("generations_this_month")
      .eq("id", userId)
      .single();

    if (user) {
      await db
        .from("users")
        .update({
          generations_this_month: (user.generations_this_month || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }
  }
}

/**
 * Get a user by Clerk ID (for client-side lookups).
 */
export async function getUserByClerkId(clerkId) {
  const db = getClient();

  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .single();

  if (error) return null;
  return data;
}

export default {
  getOrCreateUser,
  createProject,
  recordGeneration,
  checkGenerationLimit,
  incrementGenerationCount,
  getUserByClerkId,
  PLAN_LIMITS,
};
