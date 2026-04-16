-- ArchiAI — auth & billing schema
-- Run in the Supabase SQL editor (or `supabase db execute`) to create the
-- three tables used by src/services/database.js.

create extension if not exists "pgcrypto";

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

create index if not exists users_clerk_id_idx on users (clerk_id);
create index if not exists users_stripe_customer_idx on users (stripe_customer_id);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text,
  spatial_graph jsonb,
  status text default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on projects (user_id);

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

create index if not exists generations_user_id_idx on generations (user_id);
create index if not exists generations_status_idx on generations (status);

-- Row-level security: service role key bypasses RLS, so the server can read
-- and write freely. If you later expose Supabase directly to the client with
-- anon keys, add RLS policies here (e.g. `using (clerk_id = auth.jwt()->>'sub')`).
-- For now we rely on server-only access.
alter table users enable row level security;
alter table projects enable row level security;
alter table generations enable row level security;
