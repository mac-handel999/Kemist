-- Kemist migration 004: API credentials management with failover support.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- API credentials pool for external providers (Apify, SerpApi, openFDA, Geoapify, etc.)
create table if not exists public.api_credentials (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,                 -- 'apify', 'serpapi', 'openfda', 'geoapify'
  label           text not null,                 -- human-readable label, e.g. 'Primary', 'Backup 1'
  encrypted_key   text not null,                 -- encrypted API key/token
  is_active       boolean not null default true, -- whether this credential is available for use
  usage_count     bigint not null default 0,     -- total successful calls made with this key
  last_used_at    timestamptz,                   -- timestamp of last successful use
  last_error      text,                          -- most recent error message
  error_count     int not null default 0,        -- consecutive error count
  cooldown_until  timestamptz,                   -- when this key can be retried after rate limit
  monthly_limit   int,                           -- optional monthly call limit (null = unlimited)
  monthly_used    int not null default 0,        -- calls used in current month
  month_start     date,                          -- first day of current monthly period
  metadata        jsonb not null default '{}'::jsonb, -- provider-specific config
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, label)
);

create index if not exists api_credentials_provider_active_idx on public.api_credentials (provider, is_active);
alter table public.api_credentials enable row level security;

-- API call log for debugging and quota tracking
create table if not exists public.api_call_log (
  id               uuid primary key default gen_random_uuid(),
  credential_id    uuid references public.api_credentials(id) on delete set null,
  provider         text not null,
  endpoint         text,                        -- e.g. 'actor-runs', 'search', 'labels'
  status_code      int,
  success          boolean not null,
  error_message    text,
  latency_ms       int,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists api_call_log_credential_created_idx on public.api_call_log (credential_id, created_at desc);
create index if not exists api_call_log_provider_created_idx on public.api_call_log (provider, created_at desc);
alter table public.api_call_log enable row level security;

-- Function to get the next available credential for a provider
create or replace function public.get_next_credential(p_provider text)
returns setof public.api_credentials
language sql stable
set search_path = public
as $$
  select c.*
  from public.api_credentials c
  where c.provider = p_provider
    and c.is_active = true
    and (c.cooldown_until is null or c.cooldown_until <= now())
    and (c.monthly_limit is null or c.monthly_used < c.monthly_limit or date_trunc('month', now()) > c.month_start)
  order by c.error_count asc, c.last_used_at asc nulls first, c.usage_count asc
  limit 1;
$$;

-- Function to record API call result
create or replace function public.record_api_call(
  p_credential_id uuid,
  p_provider text,
  p_endpoint text,
  p_status_code int,
  p_success boolean,
  p_error_message text default null,
  p_latency_ms int default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = public
as $$
  insert into public.api_call_log (
    credential_id, provider, endpoint, status_code, success,
    error_message, latency_ms, request_metadata
  ) values (
    p_credential_id, p_provider, p_endpoint, p_status_code, p_success,
    p_error_message, p_latency_ms, p_request_metadata
  );

  update public.api_credentials
  set
    usage_count = usage_count + (case when p_success then 1 else 0 end),
    last_used_at = case when p_success then now() else last_used_at end,
    last_error = case when p_success then null else p_error_message end,
    error_count = case when p_success then 0 else error_count + 1 end,
    monthly_used = case
      when p_success and date_trunc('month', now()) = month_start then monthly_used + 1
      when p_success then 1
      else monthly_used
    end,
    month_start = case
      when p_success and date_trunc('month', now()) > month_start then date_trunc('month', now())::date
      else month_start
    end,
    cooldown_until = case
      when not p_success and (p_status_code = 429 or p_error_message ilike '%rate limit%' or p_error_message ilike '%quota%' or p_error_message ilike '%limit exceeded%')
      then now() + interval '1 hour'
      else cooldown_until
    end,
    updated_at = now()
  where id = p_credential_id;
$$;

-- Function to reset monthly usage (can be called by cron or manually)
create or replace function public.reset_monthly_usage()
returns int
language sql
set search_path = public
as $$
  update public.api_credentials
  set monthly_used = 0,
      month_start = date_trunc('month', now())::date,
      updated_at = now()
  where monthly_limit is not null
    and date_trunc('month', now()) > month_start
  returning 1;
$$;