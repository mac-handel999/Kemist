-- Kemist migration 005: health news headlines (discovery via Google News). Run once. Safe to re-run.
create table if not exists public.news_articles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  snippet      text,
  url          text not null unique,
  publisher    text,
  published_at timestamptz,
  category     text not null default 'nigeria' check (category in ('nigeria','pharmacy','safety','outbreak','world')),
  country      text,
  query_id     text,
  content_hash text not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists news_published_idx on public.news_articles (published_at desc nulls last);
create index if not exists news_category_idx  on public.news_articles (category);
create index if not exists news_hash_idx      on public.news_articles (content_hash);
alter table public.news_articles enable row level security;
