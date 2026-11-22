-- Kemist migration 007: News articles and sources for health intelligence.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- News sources: organizations and publishers we monitor
create table if not exists public.news_sources (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  website_url         text not null,
  source_type         text not null check (source_type in ('government', 'regulatory', 'news_publisher', 'international_org', 'health_org')),
  country             text not null default 'NG',
  language            text not null default 'en',
  is_active           boolean not null default true,
  last_checked_at     timestamptz,
  last_success_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists news_sources_active_idx on public.news_sources (is_active);
create index if not exists news_sources_country_idx on public.news_sources (country);

-- News articles: collected health and pharmacy news
create table if not exists public.news_articles (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  snippet             text,                      -- short excerpt for display
  article_url         text unique,
  image_url           text,
  publisher_name      text,
  publisher_domain    text,
  published_at        timestamptz not null,
  fetched_at          timestamptz not null default now(),
  category            text not null check (category in ('pharmacy', 'regulatory', 'health', 'research', 'outbreaks', 'global', 'other')),
  country             text not null default 'NG',
  language            text not null default 'en',
  source_type         text not null check (source_type in ('government', 'regulatory', 'news_publisher', 'international_org', 'health_org', 'serpapi')),
  source_id           uuid references public.news_sources(id),
  is_featured         boolean not null default false,
  content_hash        text not null,             -- for deduplication
  raw_payload         jsonb,                     -- original API response
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists news_articles_published_idx on public.news_articles (published_at desc);
create index if not exists news_articles_category_idx on public.news_articles (category);
create index if not exists news_articles_country_idx on public.news_articles (country);
create index if not exists news_articles_source_type_idx on public.news_articles (source_type);
create index if not exists news_articles_featured_idx on public.news_articles (is_featured) where is_featured = true;
create index if not exists news_articles_hash_idx on public.news_articles (content_hash);
create index if not exists news_articles_search_idx on public.news_articles using gin (to_tsvector('english', title || ' ' || coalesce(snippet, '') || ' ' || coalesce(description, '')));

alter table public.news_articles enable row level security;
alter table public.news_sources enable row level security;

-- News sync logs: track synchronization runs
create table if not exists public.news_sync_logs (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,             -- 'serpapi', 'rss', 'manual'
  query               text,                      -- search query used
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  articles_found      int not null default 0,
  articles_inserted   int not null default 0,
  articles_updated    int not null default 0,
  errors              text[],
  created_at          timestamptz not null default now()
);

create index if not exists news_sync_logs_provider_idx on public.news_sync_logs (provider);
create index if not exists news_sync_logs_started_idx on public.news_sync_logs (started_at desc);

-- Function to search news articles
create or replace function public.search_news_articles(
  q text default '',
  p_category text default null,
  p_country text default null,
  p_source_type text default null,
  p_featured boolean default null,
  lim int default 20,
  off_set int default 0
)
returns setof public.news_articles
language sql stable
set search_path = public
as $$
  select a.*
  from public.news_articles a
  where (p_category is null or a.category = p_category)
    and (p_country is null or a.country = p_country)
    and (p_source_type is null or a.source_type = p_source_type)
    and (p_featured is null or a.is_featured = p_featured)
    and (q = '' or 
      a.title ilike '%' || q || '%' or
      a.snippet ilike '%' || q || '%' or
      a.description ilike '%' || q || '%' or
      a.publisher_name ilike '%' || q || '%'
    )
  order by
    case when a.is_featured then 0 else 1 end,
    a.published_at desc
  limit least(lim, 100) offset greatest(off_set, 0);
$$;

-- Function to get news sources
create or replace function public.get_news_sources(
  p_active boolean default true,
  p_country text default null
)
returns setof public.news_sources
language sql stable
set search_path = public
as $$
  select s.*
  from public.news_sources s
  where (not p_active or s.is_active = p_active)
    and (p_country is null or s.country = p_country)
  order by s.name;
$$;

-- RLS policies for public read access
create policy "Public can read news articles" on public.news_articles
  for select using (true);

create policy "Public can read news sources" on public.news_sources
  for select using (true);

create policy "Public can read sync logs" on public.news_sync_logs
  for select using (true);

-- Admin policies (require service role)
create policy "Service role full access to news articles" on public.news_articles
  for all using (auth.role() = 'service_role');

create policy "Service role full access to news sources" on public.news_sources
  for all using (auth.role() = 'service_role');

create policy "Service role full access to sync logs" on public.news_sync_logs
  for all using (auth.role() = 'service_role');

-- Seed default news sources
insert into public.news_sources (name, website_url, source_type, country, language) values
  ('NAFDAC', 'https://www.nafdac.gov.ng', 'regulatory', 'NG', 'en'),
  ('Federal Ministry of Health and Social Welfare', 'https://www.health.gov.ng', 'government', 'NG', 'en'),
  ('Pharmacists Council of Nigeria', 'https://www.pcn.gov.ng', 'regulatory', 'NG', 'en'),
  ('Nigeria Centre for Disease Control (NCDC)', 'https://www.ncdc.gov.ng', 'health_org', 'NG', 'en'),
  ('National Institute for Pharmaceutical Research and Development (NIPRD)', 'https://www.niprd.gov.ng', 'health_org', 'NG', 'en'),
  ('World Health Organization (WHO)', 'https://www.who.int', 'international_org', 'global', 'en'),
  ('US Food and Drug Administration (FDA)', 'https://www.fda.gov', 'regulatory', 'US', 'en'),
  ('European Medicines Agency (EMA)', 'https://www.ema.europa.eu', 'regulatory', 'EU', 'en'),
  ('The Guardian Nigeria', 'https://guardian.ng', 'news_publisher', 'NG', 'en'),
  ('Punch Newspapers', 'https://punchng.com', 'news_publisher', 'NG', 'en'),
  ('Vanguard News', 'https://www.vanguardngr.com', 'news_publisher', 'NG', 'en'),
  ('Premium Times', 'https://www.premiumtimesng.com', 'news_publisher', 'NG', 'en'),
  ('Daily Trust', 'https://dailytrust.com', 'news_publisher', 'NG', 'en'),
  ('ThisDay Live', 'https://www.thisdaylive.com', 'news_publisher', 'NG', 'en'),
  ('BBC News Africa', 'https://www.bbc.com/news/world/africa', 'news_publisher', 'global', 'en'),
  ('Reuters Health', 'https://www.reuters.com/business/healthcare-pharmaceuticals/', 'news_publisher', 'global', 'en')
on conflict do nothing;