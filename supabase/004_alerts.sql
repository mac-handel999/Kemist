-- Kemist migration 004: NAFDAC public alerts (counterfeit / recall / substandard notices). Run once. Safe to re-run.
create table if not exists public.alerts (
  id            uuid primary key default gen_random_uuid(),
  alert_no      text,                                  -- e.g. 023/2026
  title         text not null,
  summary       text,
  alert_type    text not null default 'notice' check (alert_type in ('counterfeit','recall','substandard','unregistered','notice')),
  nrns          text[] not null default '{}',          -- registration numbers mentioned in the alert, as written
  nrn_keys      text[] not null default '{}',          -- the same, normalised (letters+digits only) for matching
  batch_numbers text[] not null default '{}',
  published_at  date,
  source        text not null default 'NAFDAC',
  source_url    text not null,
  fetched_at    timestamptz not null default now(),
  unique (source, source_url)
);
create index if not exists alerts_nrn_keys_idx  on public.alerts using gin (nrn_keys);
create index if not exists alerts_published_idx on public.alerts (published_at desc nulls last);
alter table public.alerts enable row level security;
