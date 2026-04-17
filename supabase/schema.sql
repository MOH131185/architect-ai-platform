-- ArchiAI Platform — Supabase schema
-- Run this in the Supabase SQL editor to create the required tables.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  email text not null,
  plan text not null default 'free',
  generations_this_month int not null default 0,
  generation_limit int not null default 2,
  last_reset_at timestamptz not null default now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text,
  spatial_graph jsonb,
  status text default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  user_id uuid references users(id) on delete cascade,
  a1_sheet_url text,
  dxf_url text,
  cost_usd numeric(10,4),
  status text default 'pending',
  created_at timestamptz not null default now()
);

-- Optional: atomic increment helper used by database.js
-- If this RPC doesn't exist, database.js falls back to a read-modify-write.
create or replace function increment_generation_count(user_id_param uuid)
returns void
language sql
as $$
  update users
  set generations_this_month = generations_this_month + 1
  where id = user_id_param;
$$;
