-- Kemist migration 006: job runs and coverage areas
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- job_runs: one row per script execution
create table if not exists public.job_runs (
  id              uuid primary key default gen_random_uuid(),
  job             text not null,
  status          text not null check (status in ('running','success','partial','failed')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  records_seen    int not null default 0,
  records_saved   int not null default 0,
  errors          int not null default 0,
  error_message   text,
  details         jsonb
);
create index if not exists job_runs_job_started_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;

-- Allow public read (for dashboard)
drop policy if exists "public read job runs" on public.job_runs;
create policy "public read job runs"
  on public.job_runs for select
  using (true);

-- Allow service role full access
drop policy if exists "service role full access job runs" on public.job_runs;
create policy "service role full access job runs"
  on public.job_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- coverage_areas: Nigerian cities/towns for map prefill queue
create table if not exists public.coverage_areas (
  key             text primary key,
  name            text not null,
  lat             double precision not null,
  lng             double precision not null,
  r               numeric not null default 0.1,
  status          text not null default 'pending' check (status in ('pending','running','done','failed')),
  last_run        timestamptz,
  places_found    int not null default 0
);
alter table public.coverage_areas enable row level security;

-- Allow public read
drop policy if exists "public read coverage areas" on public.coverage_areas;
create policy "public read coverage areas"
  on public.coverage_areas for select
  using (true);

-- Allow service role full access
drop policy if exists "service role full access coverage areas" on public.coverage_areas;
create policy "service role full access coverage areas"
  on public.coverage_areas for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');