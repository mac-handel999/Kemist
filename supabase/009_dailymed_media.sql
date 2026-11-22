-- Kemist migration 009: DailyMed label media cache
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.dailymed_media (
  id              bigserial primary key,
  setid           text not null,                 -- DailyMed SPL SETID
  spl_version     text,
  image_name      text,
  mime_type       text,
  image_url       text not null,
  source_url      text,
  fetched_at      timestamptz not null default now(),
  unique (setid, image_name)
);
create index if not exists dailymed_media_setid_idx on public.dailymed_media (setid);
alter table public.dailymed_media enable row level security;

-- Allow public read
drop policy if exists "public read dailymed media" on public.dailymed_media;
create policy "public read dailymed media"
  on public.dailymed_media for select
  using (true);

-- Allow service role full access
drop policy if exists "service role full access dailymed media" on public.dailymed_media;
create policy "service role full access dailymed media"
  on public.dailymed_media for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');