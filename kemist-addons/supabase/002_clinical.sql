-- Kemist migration 002: clinical label information (US labels from openFDA/DailyMed).
-- Run once in the Supabase SQL Editor. Safe to re-run.
create table if not exists public.clinical_info (
  id                uuid primary key default gen_random_uuid(),
  ingredient_key    text not null,                 -- canonical single-ingredient key, e.g. 'paracetamol'
  ingredient_label  text,
  source            text not null,                 -- 'openFDA'
  source_record_id  text not null,                 -- the label's set id
  jurisdiction      text not null default 'United States',
  title             text,
  indications       text,
  contraindications text,
  warnings          text,
  adverse_reactions text,
  interactions      text,
  label_version     text,
  effective_date    date,
  source_url        text,
  review_status     text not null default 'unreviewed',
  fetched_at        timestamptz not null default now(),
  unique (source, source_record_id)
);
create index if not exists clinical_info_ingredient_idx on public.clinical_info (ingredient_key);
alter table public.clinical_info enable row level security;
