-- Kemist migration 007: search events
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.search_events (
  id              bigserial primary key,
  day             date not null default current_date,
  kind            text not null check (kind in ('name','nrn')),
  query           text not null,
  found           boolean not null,
  created_at      timestamptz not null default now()
);
create index if not exists search_events_day_idx on public.search_events (day desc);
create index if not exists search_events_kind_query_idx on public.search_events (kind, query);
alter table public.search_events enable row level security;

-- Allow service role to insert
drop policy if exists "service role insert search events" on public.search_events;
create policy "service role insert search events"
  on public.search_events for insert
  with check (auth.role() = 'service_role');

-- Allow service role to read
drop policy if exists "service role read search events" on public.search_events;
create policy "service role read search events"
  on public.search_events for select
  using (auth.role() = 'service_role');

-- Auto-expire: keep 90 days
create or replace function public.prune_search_events() returns void language plpgsql as $$
begin
  delete from public.search_events where day < current_date - interval '90 days';
end $$;
-- Run via pg_cron or manually: select public.prune_search_events();